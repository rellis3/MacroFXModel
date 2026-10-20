import subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT = Path('scratchpad/chart_shots')
srv = subprocess.Popen([sys.executable, 'scratchpad/chart_stub.py', '8767'])
for _ in range(60):
    try: urllib.request.urlopen('http://127.0.0.1:8767/api/cog-chart/meta', timeout=2); break
    except Exception: time.sleep(0.5)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_page(viewport={'width': 480, 'height': 1400})
        pg.goto('http://127.0.0.1:8767/cog-chart.html', wait_until='networkidle'); pg.wait_for_selector('#chart canvas'); pg.wait_for_timeout(1500)
        box = pg.locator('#chart').bounding_box()
        x, y = box['x'] + 25, box['y'] + 300     # on the left axis
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y + 150, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT/'inv2_dragged.png'))
        pg.click('.card [data-k=invert]'); pg.wait_for_timeout(800)
        pg.screenshot(path=str(OUT/'inv2_after_invert_off.png'))
finally:
    srv.terminate()
