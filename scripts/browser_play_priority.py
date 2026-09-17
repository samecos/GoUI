"""Mouse presses must send play while a variation response is still pending."""
from playwright.sync_api import sync_playwright, expect
from browser_smoke import EngineFixture


class SlowVariationFixture(EngineFixture):
    def receive(self, route, request):
        if request['type'] == 'variation':
            self.requests.append(request)
            self.pending_variation = (route, request)
            return  # Deliberately never respond until after the move.
        super().receive(route, request)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    try:
        for selector in ['[data-index="180"]', '[data-candidate="180"]']:
            for pending in [False, True]:
                context = browser.new_context(viewport={'width': 1440, 'height': 1080})
                engine = SlowVariationFixture()
                engine.evaluate()
                context.route_web_socket('**/ws', engine.attach)
                page = context.new_page()
                page.goto('http://127.0.0.1:5173')
                page.wait_for_load_state('networkidle')
                expect(page.locator('#connection-status')).to_have_text('服务已连接')
                target = page.locator(selector)
                target.hover()
                if pending:
                    expect(page.locator('#variation-status')).to_have_text('正在读取已有变化…')
                    assert any(r['type'] == 'variation' for r in engine.requests)
                else:
                    assert not any(r['type'] == 'variation' for r in engine.requests)
                # Right button cannot place a stone.
                page.mouse.down(button='right')
                page.mouse.up(button='right')
                assert not any(r['type'] == 'play' for r in engine.requests)
                page.mouse.down()
                # This assertion happens BEFORE mouseup and before the PV reply.
                expect(page.locator('#move-count')).to_have_text('1')
                plays = [r for r in engine.requests if r['type'] == 'play']
                assert len(plays) == 1 and plays[0]['index'] == 180
                page.mouse.up()
                if pending:
                    route, request = engine.pending_variation
                    assert any(r['type'] == 'cancel' and r['requestId'] == request['id'] for r in engine.requests)
                    engine.respond(route, request, {'available': True, 'generation': 1, 'version': 1,
                        'moves': [{'index': 180, 'color': 1}]})
                page.wait_for_timeout(350)
                assert len([r for r in engine.requests if r['type'] == 'play']) == 1
                assert len([r for r in engine.requests if r['type'] == 'variation']) == int(pending)
                expect(page.locator('#variation-overlay')).to_be_empty()
                # Keyboard activation remains available and sends only one move.
                page.locator('[data-index="181"]').focus()
                page.keyboard.press('Enter')
                expect(page.locator('#move-count')).to_have_text('2')
                print(f'PASS {selector}, pending={pending}: immediate play, no duplicate, keyboard works')
                context.close()
    finally:
        browser.close()
