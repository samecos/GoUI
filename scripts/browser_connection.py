"""Check same-origin WebSocket access against a running real server."""
import argparse
from playwright.sync_api import sync_playwright, expect


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="+", help="Frontend URLs to verify")
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        try:
            for url in args.urls:
                # Separate browser sessions avoid modifying an existing user's game.
                context = browser.new_context()
                context.add_init_script("""{
                  const NativeSocket = window.WebSocket;
                  window.__engineSockets = [];
                  window.WebSocket = class extends NativeSocket {
                    constructor(...args) {
                      super(...args);
                      if (new URL(this.url).pathname === '/ws') {
                        window.__engineSockets.push(this);
                      }
                    }
                  };
                }""")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(url)
                page.wait_for_load_state("networkidle")
                expect(page.locator("#connection-status")).to_have_text("服务已连接", timeout=15000)
                assert page.evaluate("""() => {
                  const socket = window.__engineSockets[0];
                  return socket && new URL(socket.url).host === location.host;
                }"""), "Expected a same-origin engine WebSocket"
                expect(page.locator("#move-count")).to_have_text("0")
                page.locator('[data-index="60"]').click()
                expect(page.locator("#move-count")).to_have_text("1")
                page.evaluate("window.__engineSockets.at(-1).close()")
                page.wait_for_function("window.__engineSockets.length >= 2 && window.__engineSockets.at(-1).readyState === 1")
                expect(page.locator("#connection-status")).to_have_text("服务已连接", timeout=15000)
                expect(page.locator("#move-count")).to_have_text("1")
                page.locator("#undo").click()
                expect(page.locator("#move-count")).to_have_text("0")
                assert not errors, errors
                print(f"PASS {url}: same-origin connection, play, reconnect, undo")
                context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
