"""UI regression using a controlled JSON protocol fixture, not an NN evaluator."""
import copy
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


class EngineFixture:
    def __init__(self):
        self.routes = []
        self.requests = []
        self.variations = 0
        self.pending_genmove = None
        self.state = {"type": "snapshot", "sessionId": "browser-regression", "generation": 1, "version": 1,
                      "boardSize": 19, "board": [0] * 361, "moves": [], "position": 0, "toPlay": 1,
                      "captures": {"black": 0, "white": 0}, "settings": {"komi": 7.5, "rules": "chinese"},
                      "analysis": {"status": "idle", "root": None, "candidates": [], "visits": 0, "nodesPerSecond": 0}, "workers": []}

    def attach(self, route):
        self.routes.append(route)
        route.on_message(lambda message: self.receive(route, json.loads(message)))

    def respond(self, route, request, data=None, error=None):
        result = {"type": "response", "id": request["id"], "ok": error is None}
        result["error" if error else "data"] = error or copy.deepcopy(data if data is not None else self.state)
        route.send(json.dumps(result))

    def rebuild(self):
        board = [0] * 361
        for move in self.state["moves"][:self.state["position"]]:
            if move["index"] is not None:
                if board[move["index"]]:
                    raise ValueError("该位置已有棋子")
                board[move["index"]] = move["color"]
        self.state["board"] = board
        self.state["toPlay"] = self.state["position"] % 2 + 1
        self.state["generation"] += 1
        self.state["version"] += 1
        self.state["analysis"] = {"status": "idle", "root": None, "candidates": [], "visits": 0, "nodesPerSecond": 0}

    def evaluate(self):
        color = self.state["toPlay"]
        self.state["analysis"] = {"status": "analyzing", "root": {"winRateBlack": .63, "scoreLeadBlack": 2.3},
            "candidates": [{"index": 180, "color": color, "winRateBlack": .63, "scoreLeadBlack": 2.3, "visits": 42, "prior": .2, "pv": []}],
            "visits": 42, "nodesPerSecond": 123}

    def receive(self, route, request):
        self.requests.append(request)
        kind = request["type"]
        previous = copy.deepcopy(self.state)
        try:
            if kind in ("open", "snapshot"):
                self.respond(route, request)
                return
            if kind == "play":
                self.state["moves"] = self.state["moves"][:self.state["position"]] + [{"color": request["color"], "index": request["index"]}]
                self.state["position"] += 1
                self.rebuild()
            elif kind == "undo":
                self.state["position"] = max(0, self.state["position"] - 1)
                self.state["moves"] = self.state["moves"][:self.state["position"]]
                self.rebuild()
            elif kind == "seek":
                self.state["position"] = request["position"]
                self.rebuild()
            elif kind == "new_game":
                self.state["moves"] = []
                self.state["position"] = 0
                self.state["settings"]["komi"] = request.get("komi", 7.5)
                self.rebuild()
            elif kind == "set_position":
                self.state["moves"] = request["moves"]
                self.state["position"] = len(request["moves"])
                self.state["settings"]["komi"] = request["komi"]
                self.rebuild()
            elif kind == "analyze":
                self.state["generation"] += 1
                self.state["version"] += 1
                if request["enabled"]:
                    self.evaluate()
                else:
                    self.state["analysis"]["status"] = "idle"
            elif kind == "variation":
                self.variations += 1
                self.respond(route, request, {"available": True, "generation": self.state["generation"], "version": self.state["version"],
                    "moves": [{"color": self.state["toPlay"], "index": request["index"]}, {"color": 3-self.state["toPlay"], "index": None}]})
                return
            elif kind == "genmove":
                self.pending_genmove = request
                return
            elif kind == "cancel":
                if self.pending_genmove and self.pending_genmove["id"] == request["requestId"]:
                    self.respond(route, self.pending_genmove, error={"code": "CANCELLED", "message": "cancelled"})
                    self.pending_genmove = None
                self.respond(route, request, {"cancelled": True})
                return
            self.respond(route, request)
        except ValueError as error:
            self.state = previous
            self.respond(route, request, error={"code": "ILLEGAL_MOVE", "message": str(error)})


def run():
    outputs = Path(__file__).resolve().parents[1] / "test-results"
    outputs.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1080})
        engine = EngineFixture()
        context.route_web_socket("**/ws", engine.attach)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5173")
        page.wait_for_load_state("networkidle")
        expect(page.locator("#connection-status")).to_have_text("服务已连接")
        expect(page.locator("#move-count")).to_have_text("0")
        expect(page.locator("#win-rate")).to_have_text("—")
        expect(page.locator(".candidate-row")).to_have_count(0)

        page.locator('[data-index="60"]').click()
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator('[data-index="60"]').click()
        expect(page.locator("#toast")).to_have_text("该位置已有棋子")
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator("#pass").click()
        expect(page.locator("#move-count")).to_have_text("2")
        page.locator("#undo").click()
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator('[data-step="first"]').click()
        expect(page.locator("#move-count")).to_have_text("0")
        expect(page.locator("#total-count")).to_have_text("/ 1")
        page.locator('[data-step="last"]').click()
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator("#analysis-toggle").click()
        expect(page.locator("#win-rate")).to_have_text("63.0%")
        expect(page.locator("#engine-visits")).to_have_text("42")
        engine.state["analysis"]["candidates"][0]["winRateBlack"] = None
        engine.state["analysis"]["candidates"][0]["scoreLeadBlack"] = None
        engine.state["version"] += 1
        engine.routes[-1].send(json.dumps(engine.state))
        expect(page.locator("#candidate-markers text").nth(1)).to_have_text("—")
        engine.evaluate()
        engine.state["version"] += 1
        engine.routes[-1].send(json.dumps(engine.state))
        page.locator(".candidate-row").hover()
        for _ in range(8):
            engine.state["version"] += 1
            engine.routes[-1].send(json.dumps(engine.state))
            page.wait_for_timeout(70)
        assert engine.variations == 1, engine.variations
        expect(page.locator("#variation-status")).to_contain_text("停一手")
        assert page.locator("#variation-overlay circle").count() == 2
        page.locator("h1").hover()
        expect(page.locator("#variation-overlay circle")).to_have_count(0)

        # Percentage controls both surfaces and handles live changes beyond the old top three.
        suggestions = [{"index": index, "color": 2, "winRateBlack": .6,
                        "scoreLeadBlack": 1.5, "visits": 100-index}
                       for index in range(100) if index != 60]
        suggestions.append({**suggestions[0], "index": 100})
        def publish_candidates(items):
            engine.state["analysis"]["candidates"] = copy.deepcopy(items)
            engine.state["version"] += 1
            engine.routes[-1].send(json.dumps(engine.state))

        slider = page.get_by_role("slider", name="候选点显示比例")
        publish_candidates(suggestions)
        expect(page.locator(".candidate-row")).to_have_count(10)
        for percentage, count in [("0", 3), ("15", 15), ("100", 30)]:
            slider.fill(percentage)
            expect(page.locator("#candidate-percent-value")).to_have_text(percentage + "%")
            expect(page.locator(".candidate-row")).to_have_count(count)
            expect(page.locator("#candidate-markers circle")).to_have_count(count)
        expect(page.locator(".candidate-row .rank").last).to_have_text("AD")
        page.locator(".candidate-row").last.hover()
        expect(page.locator("#variation-status")).to_contain_text("停一手")
        changed = copy.deepcopy(suggestions)
        changed[29]["index"] = 150
        publish_candidates(changed)
        expect(page.locator(".candidate-row").last).to_have_attribute("data-candidate", "150")
        expect(page.locator("#variation-overlay circle")).to_have_count(0)
        page.locator("h1").hover()
        publish_candidates(suggestions[:5])
        expect(page.locator(".candidate-row")).to_have_count(5)
        publish_candidates(suggestions[:2])
        expect(page.locator(".candidate-row")).to_have_count(2)
        publish_candidates([])
        expect(page.locator(".candidate-row")).to_have_count(0)
        publish_candidates(suggestions)
        slider.fill("25")
        page.locator("#candidates").uncheck()
        expect(page.locator("#candidate-markers circle")).to_have_count(0)
        expect(page.locator(".candidate-row")).to_have_count(25)
        page.locator("#candidates").check()
        page.set_viewport_size({"width": 390, "height": 844})
        expect(slider).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(outputs / "browser-candidate-slider-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 1080})
        page.screenshot(path=str(outputs / "browser-candidate-slider.png"), full_page=True)
        engine.evaluate()
        engine.state["version"] += 1
        engine.routes[-1].send(json.dumps(engine.state))

        stale = copy.deepcopy(engine.state)
        stale.update({"generation": 1, "version": 999, "board": [0]*361, "position": 0})
        engine.routes[-1].send(json.dumps(stale))
        page.wait_for_timeout(50)
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator("#genmove").click()
        expect(page.locator("#genmove")).to_have_text("取消 AI 落子")
        page.locator("#genmove").click()
        expect(page.locator("#genmove")).to_have_text("AI 落子")
        expect(page.locator("#move-count")).to_have_text("1")
        assert any(request["type"] == "cancel" for request in engine.requests)

        page.locator("#new").click()
        expect(page.locator('select[name="rules"] option')).to_have_count(1)
        page.locator('input[name="black"]').fill("回归黑方")
        page.locator('input[name="komi"]').fill("6.5")
        page.get_by_role("button", name="开始新棋局").click()
        expect(page.locator("#move-count")).to_have_text("0")
        expect(page.locator("#black-player")).to_have_text("回归黑方")
        page.locator("#file").set_input_files({"name": "valid.sgf", "mimeType": "application/x-go-sgf", "buffer": b"(;SZ[19]RU[Chinese]KM[5.5]PB[Imported];B[dd];W[])"})
        expect(page.locator("#move-count")).to_have_text("2")
        expect(page.locator("#black-player")).to_have_text("Imported")
        page.locator("#file").set_input_files({"name": "invalid.sgf", "mimeType": "application/x-go-sgf", "buffer": b"(;SZ[19];B[dd];W[dd])"})
        expect(page.locator("#toast")).to_have_text("该位置已有棋子")
        expect(page.locator("#move-count")).to_have_text("2")
        page.evaluate("scrollTo(0,0)")
        page.screenshot(path=str(outputs / "browser-connected.png"), full_page=True)

        engine.routes[-1].close(code=1012, reason="reconnect regression")
        expect(page.locator("#connection-status")).to_contain_text("断线")
        expect(page.locator("#move-count")).to_have_text("2")
        expect(page.locator("#pass")).to_be_disabled()
        expect(page.locator("#connection-status")).to_have_text("服务已连接", timeout=6000)
        assert len(engine.routes) == 2
        assert [request for request in engine.requests if request["type"] == "open"][-1]["sessionId"] == "browser-regression"
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.locator("#move-count")).to_have_text("2")
        expect(page.locator("#black-player")).to_have_text("Imported")
        page.set_viewport_size({"width": 390, "height": 844})
        expect(slider).to_have_value("25")
        page.screenshot(path=str(outputs / "browser-mobile.png"), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"
        assert not errors, errors
        browser.close()
        print("Browser fixture regression passed: authoritative moves, real-value rendering, hover during snapshots, cancel, SGF, reconnect, refresh, mobile.")


if __name__ == "__main__":
    run()
