"""oi-level-map step 3: EXPLORATORY level study on the archived nightly OI captures (~45 sessions, Jul 31 -> Oct 16 2026).
Not pre-registered. Every table is descriptive; the page that shows it says so. Seed 20261028. Output: analysis/output/oi-level-map/results.json (+ replay_<sym>.json).

Unit of analysis: one (session, instrument) with a fresh capture. A "level" is a price the indicator drew that morning (or a per-DTE-bucket wall built the same way).
Event = first touch of the level after the capture, from the side price was on at the capture. Outcome = race at 0.25 sigma: BOUNCE (price goes 0.25 sigma back the way it
came, a fade wins) or BREAK (0.25 sigma through, a follow wins), first hit wins; both in one bar = ambiguous, unresolved = neither by 22:00 London (both counted, never dropped silently).
Control = placebo levels at +-0.25 and +-0.5 sigma of every real level (dropped within 0.1 sigma of any real level), scored by the same code on the same day. sigma = the options' own
one-day move (ATM IV / sqrt(252) x spot), known at the capture.  Clusters for every interval = the session date (instruments on one date share the dollar)."""
import json, os, math
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'oi-level-map')
SEED = 20261028
rng = np.random.default_rng(SEED)
CLASS = {'EUR/USD': 'FX', 'GBP/USD': 'FX', 'USD/JPY': 'FX', 'AUD/USD': 'FX', 'USD/CAD': 'FX', 'USD/CHF': 'FX', 'XAU/USD': 'GOLD',
         'NAS100_USD': 'IDX', 'SPX500_USD': 'IDX', 'US30_USD': 'IDX', 'US2000_USD': 'IDX'}
CACHE = {'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY', 'AUD/USD': 'AUD_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF', 'XAU/USD': 'XAU_USD',
         'NAS100_USD': 'NAS100_USD', 'SPX500_USD': 'SPX500_USD', 'US30_USD': 'US30_USD', 'US2000_USD': 'US2000_USD'}
SHORT = {'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF', 'XAU/USD': 'GOLD',
         'NAS100_USD': 'NQ', 'SPX500_USD': 'SPX', 'US30_USD': 'DOW', 'US2000_USD': 'RUT'}
TYPES = ['call_wall', 'put_wall', 'gamma_peak', 'zero_gamma', 'gex_flip', 'max_pain', 'vanna_flip', 'charm_flip', 'oi_volume', 'short_gamma_node', 'long_gamma_node', 'exp_hi', 'exp_lo']
RACE = 0.25          # sigma
HORIZ = [15, 60, 240]
LAST_FULL_DAY = '2026-10-16'

recs = json.load(open(os.path.join(OUT, 'levels.json')))
px = {}
for s, k in CACHE.items():
    df = pd.read_parquet(os.path.join(OUT, '_cache', f'm1_{k}.parquet'))
    px[s] = df

def london_to_utc(date, hh, mm=0):
    return pd.Timestamp(f'{date} {hh:02d}:{mm:02d}', tz='Europe/London').tz_convert('UTC').tz_localize(None)

# ── freshness ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def prev_trading_day(d):
    t = pd.Timestamp(d) - pd.Timedelta(days=1)
    while t.weekday() >= 5: t -= pd.Timedelta(days=1)
    return t.strftime('%Y-%m-%d')
sel, dropped = [], {'weekend': 0, 'stale_asof': 0, 'identical_book': 0, 'no_prices': 0, 'after_cutoff': 0, 'no_sigma': 0}
for r in recs:
    d = r['date']
    if pd.Timestamp(d).weekday() >= 5: dropped['weekend'] += 1; continue
    if d > LAST_FULL_DAY: dropped['after_cutoff'] += 1; continue
    if not (r.get('dayMove') and r['dayMove'] > 0): dropped['no_sigma'] += 1; continue
    if r['asOf']:
        if r['asOf'] != prev_trading_day(d): dropped['stale_asof'] += 1; continue
        r['fresh'] = 'asof-verified'
    else:
        if r['sameAsPrev']: dropped['identical_book'] += 1; continue
        r['fresh'] = 'no-asof (book changed)'
    sel.append(r)
print('sessions x instruments kept', len(sel), 'dropped', dropped)
dates = sorted({r['date'] for r in sel})
mid_date = dates[len(dates) // 2]

# ── price window per record ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def window(r):
    df = px[r['sym']]
    t0 = pd.Timestamp(r['captureUtc'].replace('Z', '')) + pd.Timedelta(minutes=1)
    t1 = london_to_utc(r['date'], 22, 0)
    w = df.loc[t0:t1]
    return w
for r in sel:
    w = window(r)
    r['_w'] = None if len(w) < 300 else w
    if r['_w'] is None: dropped['no_prices'] += 1
sel = [r for r in sel if r['_w'] is not None]
print('with prices', len(sel))

# ── event machinery ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def hour_block(ts):
    lt = ts.tz_localize('UTC').tz_convert('Europe/London')
    h = lt.hour + lt.minute / 60
    return 'A 06-09' if h < 9 else 'B 09-12' if h < 12 else 'C 12-16:30' if h < 16.5 else 'D 16:30-22'

def run_event(p, r, tol=0.03):
    """first touch of price p after the capture; race + excursions. returns None if never touched / starting on it."""
    w = r['_w']; sg = r['dayMove']
    o0 = w['open'].iloc[0]
    if abs(o0 - p) < 0.05 * sg: return None
    side = 1 if o0 > p else -1               # +1: arrived from above (the level is support-like)
    hi = w['high'].values; lo = w['low'].values; cl = w['close'].values
    hit = np.nonzero((lo <= p + tol * sg) & (hi >= p - tol * sg))[0]
    if len(hit) == 0: return {'touched': False}
    i = int(hit[0])
    # from the bar AFTER the touch: bounce = away from the level the way price came; break = through it
    hh, ll = hi[i + 1:], lo[i + 1:]
    if len(hh) == 0: return {'touched': True, 'race': 0, 'i': i, 'side': side}
    up_t, dn_t = p + RACE * sg, p - RACE * sg
    if side > 0: b_hit, k_hit = hh >= up_t, ll <= dn_t
    else:        b_hit, k_hit = ll <= dn_t, hh >= up_t
    bi = np.argmax(b_hit) if b_hit.any() else 10**9
    ki = np.argmax(k_hit) if k_hit.any() else 10**9
    race = 0 if (bi == 10**9 and ki == 10**9) else (2 if bi == ki else (1 if bi < ki else -1))
    # excursions from the LEVEL in sigma: away (bounce direction) and through (break direction), at horizons
    out = {'touched': True, 'race': race, 'i': i, 'side': side, 'tmin': i, 'hb': hour_block(w.index[i])}
    for h in HORIZ + [10**6]:
        seg_h, seg_l = hh[:h], ll[:h]
        if len(seg_h) == 0: ex_b = ex_k = 0.0
        elif side > 0: ex_b, ex_k = (seg_h.max() - p) / sg, (p - seg_l.min()) / sg
        else:          ex_b, ex_k = (p - seg_l.min()) / sg, (seg_h.max() - p) / sg
        out[f'b{h}'] = max(ex_b, 0.0); out[f'k{h}'] = max(ex_k, 0.0)
    # magnet: did the session end closer to the level than it started?
    out['magnet'] = (abs(o0 - p) - abs(cl[-1] - p)) / sg
    return out

def placebos(r, real_prices):
    sg = r['dayMove']; ps = []
    for p in real_prices:
        for m in (-0.5, -0.25, 0.25, 0.5):
            q = p + m * sg
            if all(abs(q - x) > 0.1 * sg for x in real_prices) and abs(q - r['spot']) <= 3 * sg: ps.append(q)
    return sorted(set(round(q, 8) for q in ps))

# per-record context used for splits
def ctx(r):
    return {'date': r['date'], 'sym': r['sym'], 'cls': CLASS[r['sym']], 'regime': r['regime'], 'book': r['book']['id'], 'half': 'H1' if r['date'] < mid_date else 'H2',
            'hfsign': ('damp' if (r['hf'] and r['hf']['slope'] is not None and r['hf']['slope'] < 0) else 'reinf' if r['hf'] else None)}

# ── build wall objects per bucket (same rule as the indicator: top-2 distinct per side by gamma; strength = v / side max) ────────────
def bucket_walls(r):
    sg = r['dayMove']; spot = r['spot']; out = []
    ids = list(r['buckets'].keys())
    for bid, b in r['buckets'].items():
        K = np.array(b['strikes']); C = np.array(b['call']); P = np.array(b['put'])
        if len(K) < 5: continue
        cmax, pmax = max(C.max(), 1e-12), max(P.max(), 1e-12)
        def pick(arr, above, mx, side):
            idx = [i for i in np.argsort(-arr) if (K[i] > spot if above else K[i] < spot) and arr[i] > 0]
            chosen = []
            for i in idx:
                if all(abs(K[i] - K[j]) > 0.12 * sg for j in chosen): chosen.append(i)
                if len(chosen) == 2: break
            for rank, i in enumerate(chosen):
                nb = [arr[j] for j in (i - 2, i - 1, i + 1, i + 2) if 0 <= j < len(K)]
                contrast = float(arr[i] / (np.median(nb) + 1e-12)) if nb else None
                out.append({'bucket': bid, 'side': side, 'price': float(K[i]), 'strength': float(arr[i] / mx), 'rank': rank + 1, 'contrast': contrast})
        pick(C, True, cmax, 'call'); pick(P, False, pmax, 'put')
    # stacked: a wall in a higher bucket within 0.1 sigma of a wall in a lower one (same side); far-only: bucket 8+ with no <=7 wall within 0.25 sigma
    for w in out:
        near = [v for v in out if v is not w and v['side'] == w['side'] and v['bucket'] in ('d0_1', 'd2_7') and abs(v['price'] - w['price']) <= 0.25 * sg]
        w['stacked'] = bool(near) and w['bucket'] not in ('d0_1', 'd2_7')
        w['faronly'] = (not near) and w['bucket'] not in ('d0_1', 'd2_7')
    return out

# ── collect every event ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
rows = []     # indicator levels, real + placebo
wrows = []    # per-bucket walls, real + placebo
for r in sel:
    c = ctx(r); sg = r['dayMove']
    real = [(l['type'], l['price'], l) for l in r['levels']]
    allp = [p for _, p, _ in real]
    for t, p, l in real:
        e = run_event(p, r)
        if e is None: continue
        e.update(c); e.update({'kind': 'real', 'type': t, 'strength': l['strength'], 'rank': l['rank'], 'chgPct': l['chgPct'], 'dist': abs(p - r['_w']['open'].iloc[0]) / sg})
        rows.append(e)
    for q in placebos(r, allp):
        e = run_event(q, r)
        if e is None: continue
        e.update(c); e.update({'kind': 'placebo', 'type': 'placebo', 'dist': abs(q - r['_w']['open'].iloc[0]) / sg}); rows.append(e)
    bw = bucket_walls(r)
    ballp = [w['price'] for w in bw]
    for w in bw:
        e = run_event(w['price'], r)
        if e is None: continue
        e.update(c); e.update({'kind': 'real', 'bucket': w['bucket'], 'wside': w['side'], 'strength': w['strength'], 'contrast': w['contrast'], 'stacked': w['stacked'], 'faronly': w['faronly'], 'rank': w['rank']})
        wrows.append(e)
    for q in placebos(r, ballp):
        e = run_event(q, r)
        if e is None: continue
        e.update(c); e.update({'kind': 'placebo'}); wrows.append(e)
ev = pd.DataFrame(rows); wv = pd.DataFrame(wrows)
print('indicator-level events', len(ev), 'bucket-wall events', len(wv))

# ── statistics helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def race_stats(d):
    t = d[d['touched'] == True]
    n = len(t); b = int((t['race'] == 1).sum()); k = int((t['race'] == -1).sum()); amb = int((t['race'] == 2).sum()); un = int((t['race'] == 0).sum())
    return {'touched': n, 'bounce': b, 'brk': k, 'amb': amb, 'unres': un, 'rate': (b / (b + k)) if (b + k) else None}

def boot_diff(real, plc, B=2000):
    """bounce-rate difference real - placebo with a cluster (session date) bootstrap."""
    ds = sorted(set(real['date']) | set(plc['date']))
    if len(ds) < 8: return None
    def cnt(d):
        t = d[d['touched'] == True]
        g = t.groupby('date')['race'].agg(b=lambda x: (x == 1).sum(), k=lambda x: (x == -1).sum())
        return g.reindex(ds, fill_value=0)[['b', 'k']].values
    R, P = cnt(real), cnt(plc)
    def rate(M, idx):
        s = M[idx].sum(axis=0); return s[0] / (s[0] + s[1]) if (s[0] + s[1]) > 0 else np.nan
    base = rate(R, np.arange(len(ds))) - rate(P, np.arange(len(ds)))
    bs = []
    for _ in range(B):
        idx = rng.integers(0, len(ds), len(ds)); v = rate(R, idx) - rate(P, idx)
        if not np.isnan(v): bs.append(v)
    if len(bs) < B * 0.8 or np.isnan(base): return None
    return {'diff': float(base), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}

def cell(real, plc):
    """one reaction cell: real vs placebo."""
    a, b = race_stats(real), race_stats(plc)
    out = {'real': a, 'plc': b}
    tr = real[real['touched'] == True]; tp = plc[plc['touched'] == True]
    for h in HORIZ:
        out[f'mfe{h}'] = [float(tr[f'b{h}'].mean()) if len(tr) else None, float(tp[f'b{h}'].mean()) if len(tp) else None]
        out[f'mae{h}'] = [float(tr[f'k{h}'].mean()) if len(tr) else None, float(tp[f'k{h}'].mean()) if len(tp) else None]
    out['magnet'] = [float(tr['magnet'].mean()) if len(tr) else None, float(tp['magnet'].mean()) if len(tp) else None]
    if a['bounce'] + a['brk'] >= 12 and b['bounce'] + b['brk'] >= 12: out['diff'] = boot_diff(real, plc)
    for hh in ('H1', 'H2'):
        ra, rb = race_stats(real[real['half'] == hh]), race_stats(plc[plc['half'] == hh])
        out[hh] = None if ra['rate'] is None or rb['rate'] is None else ra['rate'] - rb['rate']
    return out

def touch_rate(df_all_levels_n, touched_n): return touched_n / df_all_levels_n if df_all_levels_n else None

res = {'meta': {}, 'sections': {}}
groups = {'ALL': lambda d: d, 'FX': lambda d: d[d['cls'] == 'FX'], 'GOLD': lambda d: d[d['cls'] == 'GOLD'], 'IDX': lambda d: d[d['cls'] == 'IDX']}
for s in CACHE: groups[SHORT[s]] = (lambda sym: (lambda d: d[d['sym'] == sym]))(s)
plc_all = ev[ev['kind'] == 'placebo']

# T1/T2 by level type x group
T = {}
for t in TYPES:
    real_t = ev[(ev['kind'] == 'real') & (ev['type'] == t)]
    T[t] = {}
    for g, f in groups.items():
        rr, pp = f(real_t), f(plc_all)
        if len(rr) < 6: continue
        T[t][g] = cell(rr, pp)
        T[t][g]['n_levels'] = int(len(rr)); T[t][g]['touch_share'] = float((rr['touched'] == True).mean())
        T[t][g]['plc_touch_share'] = float((pp['touched'] == True).mean()) if len(pp) else None
res['sections']['byType'] = T
res['sections']['placeboAll'] = {g: race_stats(f(plc_all)) for g, f in groups.items()}

# Walls (indicator) combined, split by regime / strength / chg / hour / hf sign / book DTE bucket
walls = ev[(ev['kind'] == 'real') & (ev['type'].isin(['call_wall', 'put_wall']))]
def splitcell(df, col, labels=None):
    out = {}
    for v in sorted(df[col].dropna().unique()) if labels is None else labels:
        sub = df[df[col] == v]
        if (sub['touched'] == True).sum() >= 6: out[str(v)] = cell(sub, plc_all if col not in ('regime', 'hfsign', 'book') else plc_all[plc_all[col] == v])
    return out
W = {}
W['regime'] = splitcell(walls, 'regime')
W['hfsign'] = splitcell(walls, 'hfsign')
W['bookBucket'] = splitcell(walls, 'book')
W['hourBlock'] = splitcell(walls[walls['touched'] == True], 'hb')
walls = walls.copy(); walls['sbin'] = pd.cut(walls['strength'], [0, 0.4, 0.7, 1.01], labels=['weak <0.4', 'mid 0.4-0.7', 'strong >=0.7'])
W['strength'] = {}
for v in ['weak <0.4', 'mid 0.4-0.7', 'strong >=0.7']:
    sub = walls[walls['sbin'] == v]
    if (sub['touched'] == True).sum() >= 6: W['strength'][v] = cell(sub, plc_all)
walls['chgbin'] = pd.cut(walls['chgPct'], [-1000, -3, 3, 1000], labels=['unwinding (OI -3% or more)', 'flat', 'building (OI +3% or more)'])
W['oiChange'] = {}
for v in ['unwinding (OI -3% or more)', 'flat', 'building (OI +3% or more)']:
    sub = walls[walls['chgbin'] == v]
    if (sub['touched'] == True).sum() >= 6: W['oiChange'][v] = cell(sub, plc_all)
# regime x strength: the textbook conditions together
W['regime_x_strong'] = {}
for rg in ('PIN', 'BREAKOUT'):
    sub = walls[(walls['regime'] == rg) & (walls['sbin'] == 'strong >=0.7')]
    if (sub['touched'] == True).sum() >= 6: W['regime_x_strong'][rg] = cell(sub, plc_all[plc_all['regime'] == rg])
res['sections']['walls'] = W

# Per-DTE-bucket walls (own bucket), real vs placebo placed around those same walls
BW = {}
bplc = wv[wv['kind'] == 'placebo']; breal = wv[wv['kind'] == 'real'].copy()
for b in ['d0_1', 'd2_7', 'd8_45', 'd46p']:
    sub = breal[breal['bucket'] == b]; BW[b] = {'all': cell(sub, bplc) if (sub['touched'] == True).sum() >= 6 else {'real': race_stats(sub)}}
    for rg in ('PIN', 'BREAKOUT'):
        s2 = sub[sub['regime'] == rg]
        if (s2['touched'] == True).sum() >= 6: BW[b][rg] = cell(s2, bplc[bplc['regime'] == rg])
    for flag in ('stacked', 'faronly'):
        s2 = sub[sub[flag] == True]
        if (s2['touched'] == True).sum() >= 6: BW[b][flag] = cell(s2, bplc)
    st = sub[(sub['strength'] >= 0.7)]
    if (st['touched'] == True).sum() >= 6: BW[b]['strong'] = cell(st, bplc)
    cn = sub[(sub['contrast'] >= 3)]
    if (cn['touched'] == True).sum() >= 6: BW[b]['contrast3x'] = cell(cn, bplc)
res['sections']['bucketWalls'] = BW
res['sections']['bucketWallCounts'] = {b: int((breal['bucket'] == b).sum()) for b in ['d0_1', 'd2_7', 'd8_45', 'd46p']}

# ── offset sweep: where does price actually react relative to the drawn wall? (shift the wall, re-run the race) ────────────────────
SH = [-0.30, -0.20, -0.10, -0.05, 0.0, 0.05, 0.10, 0.20, 0.30]
sweep = {}
for tname, tset in [('walls', ('call_wall', 'put_wall')), ('flips', ('gex_flip', 'zero_gamma')), ('max_pain', ('max_pain',)), ('gamma_peak', ('gamma_peak',)), ('volume', ('oi_volume',))]:
    sweep[tname] = {}
    for g in ('FX', 'GOLD', 'IDX', 'ALL'):
        pts = []
        for s in SH:
            b = k = 0
            for r in sel:
                if g != 'ALL' and CLASS[r['sym']] != g: continue
                for l in r['levels']:
                    if l['type'] not in tset: continue
                    o0 = r['_w']['open'].iloc[0]; side = 1 if o0 > l['price'] else -1
                    p = l['price'] - side * s * r['dayMove']       # + = shifted toward price's arrival side? (shift outward = further through)
                    e = run_event(p, r)
                    if e and e.get('touched') and e['race'] in (1, -1):
                        if e['race'] == 1: b += 1
                        else: k += 1
            pts.append({'shift': s, 'bounce': b, 'brk': k, 'rate': (b / (b + k)) if (b + k) else None})
        sweep[tname][g] = pts
res['sections']['offsetSweep'] = {'note': 'shift<0 puts the test line that many sigma on the near (arrival) side of the drawn level, so price meets it sooner; shift>0 puts it past the drawn level, so price must travel further', 'data': sweep}

# ── day-level: pin / breakout, expected move, IV ruler ─────────────────────────────────────────────────────────────────────────────
days = []
for r in sel:
    w = r['_w']; sg = r['dayMove']; o0 = w['open'].iloc[0]; c1 = w['close'].iloc[-1]; hi = w['high'].max(); lo = w['low'].min()
    walls_ = [(l['type'], l['price']) for l in r['levels'] if l['type'] in ('call_wall', 'put_wall', 'gamma_peak', 'max_pain')]
    dist_close = min([abs(c1 - p) for _, p in walls_] or [np.nan]) / sg
    dist_close_start = min([abs(o0 - p) for _, p in walls_] or [np.nan]) / sg
    mp = r['maxPain']; em = r['em']
    ex_lo = min([l['price'] for l in r['levels'] if l['type'] == 'exp_lo'] or [np.nan]); ex_hi = max([l['price'] for l in r['levels'] if l['type'] == 'exp_hi'] or [np.nan])
    days.append({'date': r['date'], 'sym': r['sym'], 'cls': CLASS[r['sym']], 'regime': r['regime'], 'book': r['book']['id'], 'dte0': r['dte'], 'netGex': r['netGex'],
                 'hf': ('damp' if (r['hf'] and r['hf']['slope'] is not None and r['hf']['slope'] < 0) else 'reinf' if r['hf'] else None), 'iv': r['ivAtm'], 'rr': (r['rr'] or {}).get('rr'),
                 'hl': (hi - lo) / sg, 'oc': abs(c1 - o0) / sg, 'signed_oc': (c1 - o0) / sg, 'inside_em': bool(not np.isnan(ex_lo) and not np.isnan(ex_hi) and hi <= ex_hi and lo >= ex_lo),
                 'dclose_walls': dist_close, 'dstart_walls': dist_close_start,
                 'dclose_mp': (abs(c1 - mp) / sg if mp else np.nan), 'dstart_mp': (abs(o0 - mp) / sg if mp else np.nan),
                 'mp_dte': min([x['dte'] for x in r['perExpiry']] or [np.nan]), 'ivslope': (r['ivTerm'][-1]['iv'] - r['ivTerm'][0]['iv']) if len(r['ivTerm']) >= 2 else None,
                 'pcr': r['pcRatio']})
dd = pd.DataFrame(days)
def agg(d, col):
    x = d[col].dropna()
    if len(x) < 6: return None
    bs = [x.sample(len(x), replace=True, random_state=int(rng.integers(0, 1 << 30))).median() for _ in range(400)]
    return {'n': int(len(x)), 'median': float(x.median()), 'mean': float(x.mean()), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}
D = {}
D['range_by_regime'] = {g: {rg: agg(f(dd[dd['regime'] == rg]), 'hl') for rg in ('PIN', 'BREAKOUT')} for g, f in groups.items() if g in ('ALL', 'FX', 'GOLD', 'IDX')}
D['range_by_hf'] = {g: {k: agg(f(dd[dd['hf'] == k]), 'hl') for k in ('damp', 'reinf')} for g, f in groups.items() if g in ('ALL', 'FX', 'GOLD', 'IDX')}
D['range_vs_iv_sigma'] = {SHORT[s]: agg(dd[dd['sym'] == s], 'hl') for s in CACHE}
D['inside_em'] = {SHORT[s]: (float(dd[dd['sym'] == s]['inside_em'].mean()), int((dd['sym'] == s).sum())) for s in CACHE}
D['inside_em_all'] = (float(dd['inside_em'].mean()), int(len(dd)))
dd['pin_pull'] = dd['dstart_walls'] - dd['dclose_walls']
D['close_to_walls_by_regime'] = {g: {rg: agg(f(dd[dd['regime'] == rg]), 'pin_pull') for rg in ('PIN', 'BREAKOUT')} for g, f in groups.items() if g in ('ALL', 'FX', 'GOLD', 'IDX')}
dd['mp_pull'] = dd['dstart_mp'] - dd['dclose_mp']
D['max_pain_pull_by_dte'] = {}
for lab, lo_, hi_ in (('0-2 DTE', 0, 2), ('3-7 DTE', 3, 7), ('8+ DTE', 8, 999)):
    D['max_pain_pull_by_dte'][lab] = agg(dd[(dd['mp_dte'] >= lo_) & (dd['mp_dte'] <= hi_)], 'mp_pull')
dd['ivbin'] = dd.groupby('sym')['iv'].transform(lambda x: pd.qcut(x, 3, labels=['low IV', 'mid IV', 'high IV'], duplicates='drop') if x.nunique() >= 3 else 'mid IV')
D['range_by_ivbin'] = {b: agg(dd[dd['ivbin'] == b], 'hl') for b in ['low IV', 'mid IV', 'high IV']}
D['rr_vs_direction'] = {'n': int(dd['rr'].notna().sum())}
x = dd.dropna(subset=['rr']); D['rr_vs_direction']['corr'] = float(np.corrcoef(x['rr'], x['signed_oc'])[0, 1]) if len(x) > 8 else None
D['gex_sign_vs_range'] = {g: {'neg': agg(f(dd[dd['netGex'] < 0]), 'hl'), 'pos': agg(f(dd[dd['netGex'] >= 0]), 'hl')} for g, f in groups.items() if g in ('ALL', 'FX', 'GOLD', 'IDX')}
D['ivslope_vs_hl'] = {'corr': (float(np.corrcoef(dd.dropna(subset=['ivslope'])['ivslope'], dd.dropna(subset=['ivslope'])['hl'])[0, 1]) if dd['ivslope'].notna().sum() > 8 else None)}
res['sections']['days'] = D

# ── meta ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
res['meta'] = {'seed': SEED, 'dates': [dates[0], dates[-1]], 'nDates': len(dates), 'records': len(sel), 'dropped': dropped, 'midDate': mid_date,
               'sigma': 'ATM IV / sqrt(252) x spot (the options own one-day move, known at the capture)', 'window': 'capture time (about 06:30 London) to 22:00 London',
               'race': RACE, 'placebo': 'real level +-0.25 and +-0.5 sigma, dropped within 0.1 sigma of any real level',
               'events': {'indicator': int(len(ev)), 'bucketWalls': int(len(wv))},
               'lockbox': 'sessions after 2026-08-21 are included: the lockbox protocol bars scoring forecast layers 3/5/6 only, so these sessions are now SEEN for OI-level questions',
               'perInst': {SHORT[s]: int(sum(1 for r in sel if r['sym'] == s)) for s in CACHE}}
json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), default=lambda o: None if (isinstance(o, float) and math.isnan(o)) else (o.item() if hasattr(o, 'item') else str(o)))
ev.to_pickle(os.path.join(OUT, '_cache', 'ev.pkl')); wv.to_pickle(os.path.join(OUT, '_cache', 'wv.pkl')); dd.to_pickle(os.path.join(OUT, '_cache', 'dd.pkl'))
print('written results.json')

# ── per-instrument session replays for the page: 5-minute path + every level with what happened to it ───────────────────────────────────
REPLAY = {}
for r in sel:
    w = r['_w']; sg = r['dayMove']
    b5 = w.resample('5min').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
    t0 = int(b5.index[0].tz_localize('UTC').timestamp())
    lv = []
    for l in r['levels']:
        e = run_event(l['price'], r)
        ev_ = None
        if e is not None:
            ev_ = {'touched': bool(e['touched'])}
            if e['touched']:
                ev_.update({'min': int(e['i']), 'race': int(e['race']), 'hb': e.get('hb'), 'b60': round(e['b60'], 3) if 'b60' in e else None, 'k60': round(e['k60'], 3) if 'k60' in e else None})
        lv.append({'type': l['type'], 'price': l['price'], 'strength': l['strength'], 'rank': l['rank'], 'chgPct': l['chgPct'], 'ev': ev_})
    REPLAY.setdefault(SHORT[r['sym']], []).append({
        'date': r['date'], 't0': t0, 'spot': r['spot'], 'sigma': sg, 'regime': r['regime'], 'book': r['book']['id'], 'iv': r['ivAtm'], 'ivSource': r.get('ivSource'),
        'hf': ('damp' if (r['hf'] and r['hf']['slope'] is not None and r['hf']['slope'] < 0) else 'reinf' if r['hf'] else None),
        'hl': round(float((w['high'].max() - w['low'].min()) / sg), 3), 'fresh': r['fresh'], 'dte': r['dte'],
        'o': [round(float(x), 6) for x in b5['open']], 'h': [round(float(x), 6) for x in b5['high']], 'l': [round(float(x), 6) for x in b5['low']], 'c': [round(float(x), 6) for x in b5['close']],
        'levels': lv})
for k, v in REPLAY.items():
    json.dump(v, open(os.path.join(OUT, f'replay_{k}.json'), 'w'))
print('replays written', {k: len(v) for k, v in REPLAY.items()})
