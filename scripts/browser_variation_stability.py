"""Candidate updates must not blank previews or restart pending hover requests."""
import copy
import json
from playwright.sync_api import sync_playwright, expect
from browser_smoke import EngineFixture


class DelayedVariationFixture(EngineFixture):
    def receive(self, route, request):
        if request['type'] == 'variation':
            self.requests.append(request)
            self.variations += 1
            self.pending = (route, request)
            return
        super().receive(route, request)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    try:
        for selector in ['[data-index="180"]', '[data-candidate="180"]']:
            context = browser.new_context(viewport={'width': 1440, 'height': 1080})
            engine = DelayedVariationFixture()
            engine.evaluate()
            base = copy.deepcopy(engine.state['analysis']['candidates'][0])
            context.route_web_socket('**/ws', engine.attach)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:5173')
            page.wait_for_load_state('networkidle')
            page.locator(selector).hover()
            expect(page.locator('#variation-status')).to_have_text('正在读取已有变化…')

            def publish(tick):
                # The board point can move in rank or disappear from suggestions.
                # The row case keeps its own point but changes surrounding rows.
                items = [{**base, 'index': 181 + tick % 3}, base]
                if selector.startswith('[data-candidate'):
                    items.reverse()
                if tick % 2:
                    items.append({**base, 'index': 190})
                engine.state['analysis']['candidates'] = items
                engine.state['version'] += 1
                engine.routes[-1].send(json.dumps(engine.state))
                page.wait_for_timeout(80)

            for tick in range(6):
                publish(tick)
            assert engine.variations == 1, 'Snapshots restarted the pending request'
            assert not any(r['type'] == 'cancel' for r in engine.requests)
            route, request = engine.pending
            engine.respond(route, request, {'available': True, 'generation': 1, 'version': 1,
                'moves': [{'index': 180, 'color': 1}, {'index': 179, 'color': 2}]})
            expect(page.locator('#variation-overlay circle')).to_have_count(2)
            page.evaluate("""() => {
              window.savedOverlay = document.querySelector('#variation-overlay');
              window.savedStone = savedOverlay.firstChild;
              window.previewMutations = 0;
              window.previewObserver = new MutationObserver(records => {
                window.previewMutations += records.length;
              });
              previewObserver.observe(savedOverlay, {childList: true, subtree: true});
            }""")
            for tick in range(8):
                publish(tick)
                assert page.evaluate("""() => savedOverlay === document.querySelector('#variation-overlay')
                    && savedStone === savedOverlay.firstChild && savedOverlay.childNodes.length > 0
                    && document.querySelector('#position-stones').getAttribute('visibility') === 'hidden'""")
            assert page.evaluate('previewMutations') == 0
            # Remain motionless: refresh starts automatically, keeping old stones.
            page.wait_for_timeout(1100)
            assert engine.variations == 2
            assert page.evaluate('savedStone === savedOverlay.firstChild')
            assert '正在读取' not in page.locator('#variation-status').inner_text()
            page.wait_for_timeout(1100)
            assert engine.variations == 2, 'Refreshes must not overlap slow responses'
            route, request = engine.pending
            unchanged = {'available': True, 'generation': 1, 'version': 2,
                'moves': [{'index': 180, 'color': 1}, {'index': 179, 'color': 2}]}
            engine.respond(route, request, unchanged)
            page.wait_for_timeout(100)
            assert page.evaluate('previewMutations') == 0, 'Identical PV must not rebuild stones'
            page.wait_for_timeout(1100)
            assert engine.variations == 3
            route, request = engine.pending
            engine.respond(route, request, {**unchanged,
                'moves': unchanged['moves'] + [{'index': 178, 'color': 1}]})
            expect(page.locator('#variation-overlay circle')).to_have_count(3)
            page.locator('h1').hover()
            expect(page.locator('#variation-overlay')).to_be_empty()
            stopped = engine.variations
            page.wait_for_timeout(1100)
            assert engine.variations == stopped, 'Leaving must stop polling'
            # A real root change must discard the preview and any pending request.
            page.locator('[data-index="180"]').hover()
            expect(page.locator('#variation-status')).to_have_text('正在读取已有变化…')
            page.mouse.down()
            expect(page.locator('#move-count')).to_have_text('1')
            page.mouse.up()
            expect(page.locator('#variation-overlay')).to_be_empty()
            assert not errors, errors
            print(f'PASS {selector}: stationary refresh, stable preview, identical PV untouched, serial requests, leave/play clears')
            context.close()
    finally:
        browser.close()
