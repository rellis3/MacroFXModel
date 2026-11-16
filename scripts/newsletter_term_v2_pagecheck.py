"""Page-fill check for the terminal newsletter PDF (owner round 2, 2026-11-16): renders each page of the printed PDF and reports how much of it is empty
and whether any page edge is white (a white band means the dark background did not reach the paper edge).
  python scripts/newsletter_term_v2_pagecheck.py <issue.pdf> [--light]
Exit code 1 when a page other than the last is more than the allowed share empty, or a page edge is not the page background. Needs PyMuPDF (pip install pymupdf)."""
import sys, warnings
warnings.filterwarnings('ignore')
import pymupdf

def main():
    path = sys.argv[1]; light = '--light' in sys.argv
    MAXE = float(next((a.split('=')[1] for a in sys.argv if a.startswith('--max-empty=')), '0.25'))
    d = pymupdf.open(path); n = len(d); bad = 0
    bg = (244, 245, 251) if light else (7, 10, 23)
    print(f'{path}: {n} pages')
    for i in range(n):
        pix = d[i].get_pixmap(dpi=40); w, h, s = pix.width, pix.height, pix.samples; ch = pix.n
        px = lambda x, y: tuple(s[(y * w + x) * ch:(y * w + x) * ch + 3])
        def close(c, ref, tol=26): return all(abs(a - b) <= tol for a, b in zip(c, ref))
        # background reference = the colour at the page corner; the edges must match it, white means a band
        ref = px(2, 2); edge_bad = [name for name, (x, y) in {'left': (1, h // 2), 'right': (w - 2, h // 2), 'top': (w // 2, 1), 'bottom': (w // 2, h - 2)}.items() if not close(px(x, y), ref, 40)]
        last = 0
        for y in range(h - 1, -1, -1):
            row = [px(x, y) for x in range(8, w - 8, 3)]
            if any(not close(c, ref, 18) for c in row): last = y; break
        empty = 1 - (last + 1) / h
        flag = ''
        if i < n - 1 and empty > MAXE and i > 0: flag = '  <- more than the allowed share empty'; bad += 1
        if edge_bad: flag += f'  <- edge not background: {edge_bad}'; bad += 1
        print(f'page {i + 1:2d}: {empty * 100:4.0f}% empty{flag}')
    print('RESULT', 'FAIL' if bad else 'OK'); return 1 if bad else 0

sys.exit(main())
