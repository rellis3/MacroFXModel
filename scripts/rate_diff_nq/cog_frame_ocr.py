"""OCR the axis labels of every video frame that shows C.OG's blue line. Output: per-frame list of (text, x, y) in full-res px -> analysis/output/cog_video_0918/frames_ocr.json"""
import glob, json, os, re, numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
ocr = RapidOCR(); U = r"C:\Users\relli\.claude\uploads\f1985080-6197-4bdb-8146-f45cee32477d"; out = {}
for f in sorted(glob.glob(os.path.join(U, '*-image.jpg'))):
    im = Image.open(f).convert('RGB'); a = np.asarray(im).astype(int); H, W, _ = a.shape
    if W < 1500: continue                                                      # phone screenshots of Discord etc.
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; m = (b > 170) & (r < 130) & (g < 170) & (b - r > 80); m[:int(.12*H)] = False; m[int(.86*H):] = False; m[:, :int(.14*W)] = False; m[:, int(.88*W):] = False
    n = int(m.sum())
    if n < 1500: continue                                                      # no blue line (price-chart frames)
    res, _ = ocr(f); items = []
    for box, text, conf in (res or []):
        xs = [p[0] for p in box]; ys = [p[1] for p in box]; items.append(dict(text=text, x=float(np.mean(xs)), y=float(np.mean(ys)), conf=float(conf)))
    out[os.path.basename(f)] = dict(size=[W, H], blue_px=n, items=items)
    ax_t = sorted([i for i in items if i['y'] > .88*H and i['y'] < .96*H and re.fullmatch(r"\d{1,2}(:\d\d)?", i['text'].replace(' ', ''))], key=lambda i: i['x'])
    vals = sorted([i for i in items if i['x'] > .88*W and re.fullmatch(r"\d\.\d", i['text'])], key=lambda i: i['y'])
    cross = [i['text'] for i in items if 'Sep' in i['text']]
    print(f"{os.path.basename(f)[:8]} blue {n:6d} | time ticks: {[(i['text'], round(i['x'])) for i in ax_t][:14]} | value ticks: {[(i['text'], round(i['y'])) for i in vals][:6]} | crosshair: {cross}")
json.dump(out, open('analysis/output/cog_video_0918/frames_ocr.json', 'w'))
