import subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path('.').resolve(); OUT = ROOT/'scratchpad'/'chart_shots'
srv = subprocess.Popen([sys.executable, 'scratchpad/chart_stub.py', '8766'])
for _ in range(60):
    try: urllib.request.urlopen('http://127.0.0.1:8766/api/cog-chart/meta', timeout=2); break
    except Exception: time.sleep(0.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 480, 'height': 1400})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://127.0.0.1:8766/cog-chart.html', wait_until='networkidle'); pg.wait_for_selector('#chart canvas'); pg.wait_for_timeout(1500)
        pg.screenshot(path=str(OUT/'inv_0_default.png'))
        for k in ('invert','asRate','inBps','carry'):
            pg.click(f'.card [data-k={k}]'); pg.wait_for_timeout(700)
            pg.screenshot(path=str(OUT/f'inv_{k}_off.png'))
            pg.click(f'.card [data-k={k}]'); pg.wait_for_timeout(500)
        print('errors', errs)
finally:
    srv.terminate()
