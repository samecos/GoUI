"""SGF starts at the empty board and shows the recorded next move throughout review."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_smoke import EngineFixture


class ReviewFixture(EngineFixture):
    hold_seek = False
    reject_seek = False
    pending_seek = None

    def receive(self, route, request):
        if request["type"] == "seek" and (self.hold_seek or self.reject_seek):
            self.requests.append(request)
            if self.reject_seek:
                self.respond(route, request, error={"code": "SEEK_FAILED", "message": "定位失败"})
            else:
                self.pending_seek = (route, request)
            return
        super().receive(route, request)

    def finish_seek(self):
        route, request = self.pending_seek
        self.hold_seek = False
        self.pending_seek = None
        self.state["position"] = request["position"]
        self.rebuild()
        self.respond(route, request)


def import_sgf(page, source=b"(;SZ[19]PB[Review Black];B[dd];W[pp];B[];W[dp];B[aa])"):
    page.locator("#file").set_input_files({"name": "review.sgf", "mimeType": "application/x-go-sgf", "buffer": source})


def expect_next(page, position, label, index=None):
    expect(page.locator("#move-count")).to_have_text(str(position))
    if label:
        expect(page.locator("#next-move")).to_have_text("棋谱下一手：" + label)
        expect(page.locator("#next-move")).to_be_visible()
    else:
        expect(page.locator("#next-move")).to_be_hidden()
    if index is None:
        expect(page.locator("#next-move-marker")).to_be_empty()
    else:
        marker = page.locator("#next-move-marker [data-next-index]")
        expect(marker).to_have_attribute("data-next-index", str(index))
        expect(marker).to_be_visible()
        expect(marker.locator(".next-move-ring")).to_have_attribute("cx", str(42 + index % 19 * 32))
        expect(marker.locator(".next-move-ring")).to_have_attribute("cy", str(42 + index // 19 * 32))


def run():
    output = Path(__file__).resolve().parents[1] / "test-results"
    output.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        try:
            context = browser.new_context(viewport={"width": 1440, "height": 1080})
            engine = ReviewFixture()
            context.route_web_socket("**/ws", engine.attach)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("http://127.0.0.1:5173")
            page.wait_for_load_state("networkidle")
            expect(page.locator("#connection-status")).to_have_text("服务已连接")
            expect_next(page, 0, None)
            page.locator('[data-index="180"]').click()
            expect(page.locator("#move-count")).to_have_text("1")

            # Import and seek form one busy operation; the server keeps the full record.
            engine.hold_seek = True
            import_sgf(page)
            expect(page.locator("#move-count")).to_have_text("5")
            expect(page.locator("#black-player")).to_have_text("Review Black")
            expect(page.locator("#pass")).to_be_disabled()
            expect(page.locator('[data-step="forward"]')).to_be_disabled()
            assert [r["type"] for r in engine.requests][-2:] == ["set_position", "seek"]
            assert engine.pending_seek[1]["position"] == 0
            engine.finish_seek()
            expect_next(page, 0, "黑 D16", 60)
            expect(page.locator("#position-stones .board-stone")).to_have_count(0)
            expect(page.locator("#total-count")).to_have_text("/ 5")
            expect(page.locator("#move-slider")).to_have_value("0")
            expect(page.locator("#pass")).to_be_enabled()
            assert len(engine.state["moves"]) == 5

            # Clicking the recorded point advances without truncating the server line.
            before = len(engine.requests)
            page.locator('[data-index="60"]').click()
            expect_next(page, 1, "白 Q4", 300)
            assert [r["type"] for r in engine.requests[before:] if r["type"] != "variation"] == ["seek"]
            assert len(engine.state["moves"]) == 5
            expect(page.locator("#position-stones .board-stone")).to_have_count(1)
            page.locator('[data-step="back"]').click()
            expect_next(page, 0, "黑 D16", 60)
            page.locator("#move-slider").fill("2")
            expect_next(page, 2, "黑 停一手")
            page.locator("#pass").click()
            expect_next(page, 3, "白 D4", 288)
            assert len(engine.state["moves"]) == 5
            page.locator('[data-step="last"]').click()
            expect_next(page, 5, None)
            page.locator('[data-step="first"]').click()
            expect_next(page, 0, "黑 D16", 60)
            page.locator("#autoplay").click()
            expect_next(page, 5, None)
            page.locator('[data-step="first"]').click()
            expect_next(page, 0, "黑 D16", 60)

            # The recorded hint is independent of analysis preferences and mode.
            page.locator("#candidates").uncheck()
            page.locator("#numbers").check()
            page.locator('[data-nav="play"]').click()
            expect_next(page, 0, "黑 D16", 60)
            page.locator('[data-nav="analysis"]').click()
            page.locator("#candidates").check()
            engine.evaluate()
            engine.state["analysis"]["candidates"][0]["index"] = 60
            engine.state["version"] += 1
            engine.routes[-1].send(json.dumps(engine.state))
            expect(page.locator('[data-marker-index="60"]')).to_be_visible()
            expect_next(page, 0, "黑 D16", 60)
            page.screenshot(path=str(output / "sgf-next-desktop.png"), full_page=True)
            page.locator('[data-index="60"]').hover()
            expect(page.locator("#variation-overlay .board-stone")).to_have_count(1)
            expect(page.locator("#next-move-marker")).to_have_attribute("visibility", "hidden")
            page.locator("h1").hover()
            expect_next(page, 0, "黑 D16", 60)

            # Focus and narrow layouts keep the coordinate visible beside playback.
            page.locator("#expand").click()
            expect_next(page, 0, "黑 D16", 60)
            page.screenshot(path=str(output / "sgf-next-focus.png"), full_page=True)
            page.locator("#expand").click()
            page.set_viewport_size({"width": 390, "height": 844})
            expect_next(page, 0, "黑 D16", 60)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.screenshot(path=str(output / "sgf-next-mobile.png"), full_page=True)
            page.set_viewport_size({"width": 1440, "height": 1080})
            page.locator('[data-step="forward"]').click()
            expect_next(page, 1, "白 Q4", 300)
            page.reload()
            page.wait_for_load_state("networkidle")
            expect_next(page, 1, "白 Q4", 300)

            # A trial survives refresh without replacing the original record or its export.
            page.locator('[data-index="180"]').click()
            expect(page.locator("#move-count")).to_have_text("2")
            expect(page.locator("#next-move")).to_contain_text("试下中")
            expect(page.locator("#next-move-marker")).to_be_empty()
            expect(page.locator("#total-count")).to_have_text("/ 5")
            with page.expect_download() as download:
                page.locator("#export").click()
            exported = Path(download.value.path()).read_text(encoding="utf-8")
            assert ";W[pp];B[];W[dp];B[aa]" in exported
            page.reload()
            page.wait_for_load_state("networkidle")
            expect(page.locator("#next-move")).to_contain_text("试下中")
            page.locator('[data-step="back"]').click()
            expect_next(page, 1, "白 Q4", 300)
            assert len(engine.state["moves"]) == 5
            assert engine.state["board"][180] == 0
            page.locator("#autoplay").click()
            expect_next(page, 5, None)
            assert engine.state["board"][300] == 2
            assert engine.state["board"][180] == 0
            assert engine.state["board"][288] == 2

            # Undo and slider navigation also return to the original SGF after a trial.
            page.locator('[data-step="first"]').click()
            page.locator('[data-index="180"]').click()
            expect(page.locator("#next-move")).to_contain_text("试下中")
            page.locator("#undo").click()
            expect_next(page, 0, "黑 D16", 60)
            page.locator('[data-index="180"]').click()
            expect(page.locator("#next-move")).to_contain_text("试下中")
            page.locator("#move-slider").fill("3")
            expect_next(page, 3, "白 D4", 288)
            assert engine.state["board"][180] == 0

            # Clearing and empty import remove the old record's hints.
            page.locator("#clear-board").click()
            expect_next(page, 0, None)
            import_sgf(page, b"(;SZ[19])")
            expect(page.locator("#toast")).to_have_text("已导入 0 手棋谱，已回到开局")
            expect_next(page, 0, None)

            # Failed imports never seek; failed seek reports partial success honestly.
            seek_count = sum(r["type"] == "seek" for r in engine.requests)
            import_sgf(page, b"(;SZ[19];B[dd];W[dd])")
            expect(page.locator("#toast")).to_have_text("该位置已有棋子")
            expect_next(page, 0, None)
            assert sum(r["type"] == "seek" for r in engine.requests) == seek_count
            engine.reject_seek = True
            import_sgf(page)
            expect(page.locator("#toast")).to_contain_text("棋谱已导入，但回到开局失败")
            expect_next(page, 5, None)
            expect(page.locator("#pass")).to_be_enabled()
            engine.reject_seek = False
            page.locator('[data-step="first"]').click()
            expect_next(page, 0, "黑 D16", 60)
            assert not errors, errors
            print("SGF review passed: empty start, click-to-advance, retained record after trials, playback, hints, PV, layouts, refresh, export, and failures.")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
