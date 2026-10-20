import subprocess, sys, time, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]; PORT = '8772'
srv = subprocess.Popen([sys.executable, str(ROOT / 'scratchpad' / 'chart_stub.py'), PORT])
for _ in range(60):
    try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/cog-chart/meta', timeout=2); break
    except Exception: time.sleep(0.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True); pg = b.new_page(viewport={'width': 1500, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/cog-chart.html', wait_until='networkidle'); pg.wait_for_selector('#chart canvas'); pg.wait_for_timeout(800)
        labels = pg.eval_on_selector_all('.card:first-of-type [data-k=eur] optgroup', 'els => els.map(e => e.label)')
        opts = pg.eval_on_selector_all('.card:first-of-type [data-k=eur] option', 'els => els.length')
        print('contract picker groups:', labels); print('contracts in the picker:', opts)
        pg.click('#addLeg'); pg.wait_for_timeout(900)
        pg.select_option('.card:nth-of-type(2) [data-k=leg]', 'FGBS2612'); pg.wait_for_timeout(1200)
        print('bond future leg: rate conversion is', 'ON' if pg.is_checked('.card:nth-of-type(2) [data-k=asRate]') else 'OFF', '| hint shown:', 'PRICE' in pg.inner_text('.card:nth-of-type(2)'))
        pg.select_option('.card:nth-of-type(2) [data-k=leg]', 'ZQZ6'); pg.wait_for_timeout(1200)
        pg.screenshot(path=str(ROOT / 'scratchpad' / 'chart_shots' / '5_fedfunds_leg.png'))
        print('JS errors:', errs or 'none'); b.close()
finally:
    srv.terminate()
