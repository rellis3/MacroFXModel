"""Drive cog-chart.html in headless Chrome against the local stub: load, switch timeframe, add a spread and a leg, step the shift, change options; fail on any JS error; save screenshots."""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'scratchpad' / 'chart_shots'
OUT.mkdir(exist_ok=True)
import urllib.request
srv = subprocess.Popen([sys.executable, str(ROOT / 'scratchpad' / 'chart_stub.py'), '8765'])
for _ in range(60):
    try:
        urllib.request.urlopen('http://127.0.0.1:8765/api/cog-chart/meta', timeout=2)
        break
    except Exception:
        time.sleep(0.5)
errors, ok = [], []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 1500, 'height': 900})
        pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if (m.type == 'error' and '404' not in m.text) else None)
        pg.on('response', lambda r: errors.append(f'HTTP {r.status}: {r.url}') if (r.status >= 400 and 'favicon' not in r.url) else None)
        pg.on('requestfailed', lambda r: errors.append(f'request failed: {r.url}') if 'unpkg' not in r.url else None)
        pg.goto('http://127.0.0.1:8765/cog-chart.html', wait_until='networkidle', timeout=60000)
        pg.wait_for_selector('#chart canvas', timeout=30000)
        pg.wait_for_timeout(1500)
        chips = pg.inner_text('.hdr')
        ok.append(('header chips', 'candles:' in chips and 'legs:' in chips, chips.replace('\n', ' ')[:120]))
        ok.append(('default card is C.OG spread, raw', pg.input_value('.card [data-k=scale]') == '0.1' and pg.input_value('.card [data-k=offset]') == '1.445' and pg.input_value('.card [data-k=smooth]') == '1' and pg.input_value('.card [data-k=shift]') == '0', ''))
        pg.screenshot(path=str(OUT / '1_default.png'))
        # readout on hover
        box = pg.locator('#chart').bounding_box()
        pg.mouse.move(box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.5)
        pg.wait_for_timeout(500)
        ro = pg.inner_text('#readout')
        ok.append(('crosshair readout shows raw bp and the two legs', 'raw' in ro and 'SR3U6' in ro and 'IH7' in ro and 'bp' in ro, ro.replace('\n', ' | ')[:200]))
        # step the shift
        for _ in range(3):
            pg.click('.card .btn[data-by="1"]')
        ok.append(('shift +3 via the step button', pg.input_value('.card [data-k=shift]') == '3', ''))
        pg.keyboard.press(']')
        ok.append(('keyboard ] steps the active line', pg.input_value('.card [data-k=shift]') == '4', ''))
        pg.keyboard.press('[')
        pg.screenshot(path=str(OUT / '2_shift3.png'))
        # timeframe switches
        for tf in ('5m', '1h', '4h', '15m'):
            pg.click(f'#tfs .btn[data-tf="{tf}"]')
            pg.wait_for_timeout(900)
            ok.append((f'timeframe {tf} redraws', pg.inner_text('#chipCandles').startswith('candles'), ''))
        # options: change mapping, invert, smoothing
        pg.select_option('.card [data-k=mapMode]', 'manual')
        pg.wait_for_timeout(300)
        pg.fill('.card [data-k=smooth]', '5')
        pg.dispatch_event('.card [data-k=smooth]', 'change')
        pg.uncheck('.card [data-k=invert]')
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / '3_options.png'))
        # add a single leg and a spread
        pg.click('#addLeg')
        pg.wait_for_timeout(900)
        pg.click('#addSpread')
        pg.wait_for_timeout(900)
        ok.append(('three cards after adding a leg and a spread', pg.locator('.card').count() == 3, ''))
        pg.select_option('.card:nth-of-type(3) [data-k=usd]', 'SR3Z6')
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / '4_three_lines.png'))
        # presets and reset
        pg.click('#presets .btn[data-p="Both legs, own axes"]')
        pg.wait_for_timeout(900)
        ok.append(('preset gives two leg cards', pg.locator('.card').count() == 2, ''))
        pg.click('#btnReset')
        pg.wait_for_function("document.querySelectorAll('.card').length === 1", timeout=10000)
        pg.wait_for_timeout(500)
        ok.append(('reset returns to one default card', pg.locator('.card').count() == 1 and pg.input_value('.card [data-k=scale]') == '0.1', ''))
        # persistence: reload keeps state
        pg.click('.card .btn[data-by="1"]')
        pg.reload(wait_until='networkidle')
        pg.wait_for_selector('#chart canvas')
        pg.wait_for_timeout(1000)
        ok.append(('state survives a reload (localStorage)', pg.input_value('.card [data-k=shift]') == '1', ''))
        b.close()
finally:
    srv.terminate()
for n, c, e in ok:
    print(('ok   ' if c else 'FAIL ') + n + (('  ' + e) if e else ''))
print('JS errors:', errors if errors else 'none')
sys.exit(0 if all(c for _, c, _ in ok) and not errors else 1)
