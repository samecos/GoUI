"""Exercise the real Rust WebSocket service through the browser UI."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:5173")
    parser.add_argument("--expect-worker", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "test-results"
    output.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1080})
        context.add_init_script("""{
          const NativeSocket = window.WebSocket;
          window.__testSockets = [];
          window.WebSocket = class extends NativeSocket {
            constructor(...args) { super(...args); window.__testSockets.push(this); }
          };
        }""")
        page = context.new_page()
        errors = []
        messages = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("websocket", lambda socket: socket.on("framereceived", lambda message: messages.append(json.loads(message))))
        page.goto(args.url)
        page.wait_for_load_state("networkidle")
        expect(page.locator("#connection-status")).to_have_text("服务已连接", timeout=15000)
        expect(page.locator("#move-count")).to_have_text("0")
        expect(page.locator("#win-rate")).to_have_text("—")

        page.locator('[data-index="60"]').click()
        expect(page.locator("#move-count")).to_have_text("1")
        page.locator('[data-index="60"]').click()
        page.wait_for_timeout(150)
        expect(page.locator("#move-count")).to_have_text("1")
        assert any(message.get("error", {}).get("code") == "ILLEGAL_MOVE" for message in messages)
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
        if args.expect_worker:
            page.wait_for_function("document.querySelector('.candidate-row') || document.querySelector('#analysis-status').textContent === '分析失败'", timeout=30000)
            if page.locator(".candidate-row").count() == 0:
                diagnostic = {"status": page.locator("#analysis-status").inner_text(), "reason": page.locator("#engine-description").get_attribute("title"),
                              "messages": messages[-5:], "pageErrors": errors}
                (output / "live-worker-failure.json").write_text(json.dumps(diagnostic, indent=2), encoding="utf-8")
                raise AssertionError("Service analysis failed: " + str(diagnostic["reason"]))
            expect(page.locator(".candidate-row").first).to_be_visible(timeout=30000)
            assert page.locator("#win-rate").inner_text() != "—"
            page.locator(".candidate-row").first.hover()
            try:
                expect(page.locator("#variation-status")).to_contain_text("1.", timeout=10000)
            except AssertionError:
                diagnostic = {"status": page.locator("#variation-status").inner_text(), "responses": [message for message in messages if message.get("type") == "response"][-15:], "pageErrors": errors}
                (output / "live-variation-failure.json").write_text(json.dumps(diagnostic, indent=2), encoding="utf-8")
                raise AssertionError("Variation display failed; see test-results/live-variation-failure.json")
            page.locator("h1").hover()
        else:
            expect(page.locator("#analysis-status")).to_have_text("等待算力")
            expect(page.locator("#win-rate")).to_have_text("—")
        page.locator("#analysis-toggle").click()
        expect(page.locator("#analysis-status")).to_have_text("已暂停")
        before = int(page.locator("#move-count").inner_text())
        if args.expect_worker:
            page.locator("#genmove").evaluate("button=>{button.click();button.click();}")
            expect(page.locator("#genmove")).to_have_text("AI 落子")
            expect(page.locator("#move-count")).to_have_text(str(before))
        page.locator("#genmove").click()
        expect(page.locator("#genmove")).to_have_text("AI 落子", timeout=15000)
        if args.expect_worker:
            expect(page.locator("#move-count")).to_have_text(str(before+1))
        else:
            expect(page.locator("#move-count")).to_have_text(str(before))
            assert any(message.get("error", {}).get("code") == "NO_WORKERS" for message in messages)

        page.locator("#file").set_input_files({"name": "live.sgf", "mimeType": "application/x-go-sgf", "buffer": b"(;SZ[19]RU[Chinese]KM[6.5]PB[Live Black]PW[Live White];B[dd];W[pp];B[])"})
        expect(page.locator("#toast")).to_contain_text("已回到开局")
        expect(page.locator("#move-count")).to_have_text("0")
        expect(page.locator("#position-stones .board-stone")).to_have_count(0)
        expect(page.locator("#next-move")).to_have_text("棋谱下一手：黑 D16")
        page.locator('[data-step="last"]').click()
        expect(page.locator("#move-count")).to_have_text("3")
        expect(page.locator(".game-meta")).to_contain_text("6.5")
        page.locator("#file").set_input_files({"name": "illegal.sgf", "mimeType": "application/x-go-sgf", "buffer": b"(;SZ[19]KM[7.5];B[dd];W[dd])"})
        page.wait_for_timeout(150)
        expect(page.locator("#move-count")).to_have_text("3")
        expect(page.locator(".game-meta")).to_contain_text("6.5")
        session_key = page.evaluate("Object.keys(sessionStorage).find(key=>key.startsWith('yijian-session:'))")
        session_id = page.evaluate("key=>JSON.parse(sessionStorage.getItem(key)).sessionId", session_key)
        page.evaluate("window.__testSockets.at(-1).close(1000, 'browser reconnect regression')")
        expect(page.locator("#connection-status")).to_contain_text("断线")
        expect(page.locator("#pass")).to_be_disabled()
        expect(page.locator("#move-count")).to_have_text("3")
        expect(page.locator("#connection-status")).to_have_text("服务已连接", timeout=10000)
        assert page.evaluate("key=>JSON.parse(sessionStorage.getItem(key)).sessionId", session_key) == session_id
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.locator("#connection-status")).to_have_text("服务已连接")
        expect(page.locator("#move-count")).to_have_text("3")
        expect(page.locator("#black-player")).to_have_text("Live Black")
        if args.expect_worker:
            page.locator("#analysis-toggle").click()
            expect(page.locator(".candidate-row").first).to_be_visible(timeout=30000)
        page.evaluate("scrollTo(0,0)")
        page.screenshot(path=str(output / ("browser-live-worker.png" if args.expect_worker else "browser-live-no-worker.png")), full_page=True)
        if args.expect_worker:
            page.locator("#analysis-toggle").click()
        assert not errors, errors
        report = {"mode": "worker" if args.expect_worker else "no-worker", "sessionId": session_id, "messages": len(messages), "pageErrors": errors,
                  "checks": ["authoritative play", "illegal move", "pass", "undo", "seek", "analysis", "genmove", "atomic SGF", "reconnect", "refresh"]}
        (output / ("live-worker-report.json" if args.expect_worker else "live-no-worker-report.json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
        browser.close()
        print(json.dumps(report))


if __name__ == "__main__":
    run()
