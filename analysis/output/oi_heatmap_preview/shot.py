from playwright.sync_api import sync_playwright
import pathlib
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1500,'height':900})
    pg.goto(pathlib.Path('heatmap_preview.html').resolve().as_uri()); pg.wait_for_timeout(500)
    pg.screenshot(path='heatmap_preview.png',full_page=True); b.close()
