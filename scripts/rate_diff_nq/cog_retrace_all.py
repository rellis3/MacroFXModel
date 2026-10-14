"""Re-trace C.OG's blue line from EVERY video frame that shows it, each with its OWN axis calibration read by OCR from the chart's tick labels
(time: day labels + hh:mm ticks; value: right-axis 8.x labels, else regressed to the consensus of calibrated frames). Chart clock = UTC+1 (BST).
Session clock excludes the daily break (21:00-22:00 UTC) and the weekend. Output: consensus 15-min line + per-bar spread between frames (noise floor).
Run: python scripts/rate_diff_nq/cog_retrace_all.py  (needs analysis/output/cog_video_0918/frames_ocr.json from cog_frame_ocr.py)"""
import json, os, re
import numpy as np, pandas as pd
from PIL import Image
OUT = 'analysis/output/cog_video_0918/'; U = r"C:\Users\relli\.claude\uploads\f1985080-6197-4bdb-8146-f45cee32477d"
FR = json.load(open(OUT + 'frames_ocr.json'))
# session clock (minutes the chart actually has bars) 14-24 Sep 2026, UTC
MIN = pd.date_range('2026-09-14', '2026-09-24', freq='1min', tz='UTC', inclusive='left')
dow, hr = MIN.dayofweek, MIN.hour
closed = (hr == 21) | ((dow == 4) & (hr >= 21)) | (dow == 5) | ((dow == 6) & (hr < 22))
SESS = np.cumsum(~np.asarray(closed))                       # open minutes elapsed at each minute
def to_sess(t_utc): return SESS[MIN.get_indexer([t_utc], method='nearest')[0]] / 60.0
def from_sess(h):
    i = np.searchsorted(SESS, h * 60.0); return MIN[min(max(i, 0), len(MIN) - 1)]
UKH = pd.Timedelta(hours=1)
def parse_ticks(items, W, H):
    tok = sorted([i for i in items if .875 * H < i['y'] < .97 * H], key=lambda i: i['x']); anchors = []; D = None; prev = None
    for t in tok:
        s = t['text'].replace(' ', '').replace('O', '0')
        if re.fullmatch(r"(17|18|19|20|21|22|23)", s):
            D = int(s); prev = None
            if D == 20: anchors.append((t['x'], pd.Timestamp('2026-09-20 22:00', tz='UTC'))); D = 21              # first bar after the weekend: Sun 23:00 UK
            else: anchors.append((t['x'], pd.Timestamp(f'2026-09-{D:02d} 00:00', tz='UTC') - UKH))
            continue
        m = re.fullmatch(r"(\d{1,2}):?(\d\d)?", s)
        if not m or D is None: continue
        h = int(m.group(1)); mi = int(m.group(2) or 0)
        if mi not in (0, 30) or h > 23: continue
        cur = h * 60 + mi
        if prev is not None and cur <= prev: D += 1
        prev = cur; anchors.append((t['x'], pd.Timestamp(f'2026-09-{D:02d} {h:02d}:{mi:02d}', tz='UTC') - UKH))
    return anchors
def robust_line(x, y, tol):
    x, y = np.asarray(x, float), np.asarray(y, float); keep = np.ones(len(x), bool)
    for _ in range(4):
        if keep.sum() < 3: break
        b, a = np.polyfit(x[keep], y[keep], 1); keep = np.abs(y - (a + b * x)) < tol
    return (a, b, keep) if keep.sum() >= 3 else (None, None, keep)
frames = {}
for name, d in FR.items():
    W, H = d['size']; anc = parse_ticks(d['items'], W, H)
    if len(anc) < 4: print(name[:8], 'too few time ticks', len(anc)); continue
    a, b, keep = robust_line([x for x, _ in anc], [to_sess(t) for _, t in anc], 0.5)
    if a is None: print(name[:8], 'time calibration failed'); continue
    res = np.array([to_sess(t) for _, t in anc])[keep] - (a + b * np.array([x for x, _ in anc])[keep])
    vals = [(i['y'], float(i['text'])) for i in d['items'] if i['x'] > .88 * W and re.fullmatch(r"\d\.\d", i['text'])]
    vc = robust_line([y for y, _ in vals], [v for _, v in vals], 0.02) if len(vals) >= 3 else (None, None, None)
    frames[name] = dict(W=W, H=H, tcal=(a, b), n_anchor=int(keep.sum()), rms_h=float(np.sqrt((res ** 2).mean())), vcal=vc[:2] if vc[0] is not None else None)
    print(f"{name[:8]} time: {keep.sum()}/{len(anc)} anchors, {1/b:.1f} px/h, residual rms {np.sqrt((res**2).mean())*60:.0f} min | value ticks {len(vals)} -> {'calibrated' if vc[0] is not None else 'needs consensus'}")
def trace(name):
    f = frames[name]; a = np.asarray(Image.open(os.path.join(U, name)).convert('RGB')).astype(int); H, W = f['H'], f['W']; r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (b > 170) & (r < 130) & (g < 170) & (b - r > 80); m[:int(.12 * H)] = False; m[int(.86 * H):] = False; m[:, :int(.14 * W)] = False; m[:, int(.88 * W):] = False
    cols = np.where(m.any(0))[0]; y = np.array([np.median(np.where(m[:, x])[0]) for x in cols])
    t = [from_sess(f['tcal'][0] + f['tcal'][1] * x) for x in cols]; return pd.Series(y, index=pd.DatetimeIndex(t)).sort_index()
raw = {n: trace(n).resample('15min', label='right', closed='right').mean().dropna() for n in frames}
# value calibration: frames with value ticks first; others regressed to the consensus of those
cal = {n: (frames[n]['vcal'][0] + frames[n]['vcal'][1] * raw[n]) for n in frames if frames[n]['vcal']}
def consensus(d): return pd.concat(list(d.values()), axis=1).median(axis=1)
C0 = consensus(cal) if cal else None
print(f"\nframes with value calibration: {list(n[:8] for n in cal)}")
for n in frames:
    if n in cal or C0 is None: continue
    j = pd.concat([raw[n].rename('y'), C0.rename('c')], axis=1).dropna()
    if len(j) < 20: print(n[:8], 'no overlap with consensus; dropped'); continue
    b, a = np.polyfit(j.y, j.c, 1); cal[n] = a + b * raw[n]; print(f"{n[:8]} value axis regressed on {len(j)} overlapping bars (rmse {np.sqrt(((a+b*j.y-j.c)**2).mean()):.3f})")
D = pd.concat(cal, axis=1); C = D.median(axis=1); S = D.std(axis=1); N = D.count(axis=1)
multi = N >= 2; print(f"\nconsensus: {len(C)} bars {C.index[0]} -> {C.index[-1]}; bars seen in >=2 frames: {int(multi.sum())}; between-frame sd median {S[multi].median():.3f} units, 95th pct {S[multi].quantile(.95):.3f}")
pair = []
names = list(cal)
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        k = pd.concat([cal[names[i]], cal[names[j]]], axis=1).dropna()
        if len(k) > 25:
            dd = k.diff().dropna(); pair.append((len(k), k.iloc[:, 0].corr(k.iloc[:, 1]), np.corrcoef(dd.iloc[:, 0], dd.iloc[:, 1])[0, 1]))
if pair: print('frame-pair agreement over overlaps: level corr median %.3f, 15-min change corr median %.2f (n pairs %d)  <- the noise floor for bar-by-bar matching' % (np.median([p[1] for p in pair]), np.median([p[2] for p in pair]), len(pair)))
C.to_frame('value').to_csv(OUT + 'cog_line_consensus_15m.csv'); S.to_frame('sd').assign(n=N).to_csv(OUT + 'cog_line_consensus_sd.csv')
