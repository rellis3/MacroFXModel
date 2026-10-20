import subprocess, sys, time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
import urllib.request
PORT = '8771'
srv = subprocess.Popen([sys.executable, str(ROOT / 'scratchpad' / 'chart_stub.py'), PORT])
for _ in range(60):
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/cog-chart/meta', timeout=2); break
    except Exception:
        time.sleep(0.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True); pg = b.new_page(viewport={'width': 1500, 'height': 900})
        pg.on('response', lambda r: print('HTTP', r.status, r.url) if r.status >= 400 else None)
        pg.on('pageerror', lambda e: print('pageerror', e))
        pg.goto('http://127.0.0.1:8771/cog-chart.html', wait_until='networkidle'); pg.wait_for_selector('#chart canvas'); pg.wait_for_timeout(800)
        pg.click('#presets .btn[data-p="Both legs, own axes"]'); pg.wait_for_timeout(1200); print('after preset cards', pg.locator('.card').count())
        pg.click('#btnReset'); pg.wait_for_timeout(2500); print('after reset cards', pg.locator('.card').count(), 'scale', pg.input_value('.card [data-k=scale]') if pg.locator('.card').count() else None)
        b.close()
finally:
    srv.terminate()
