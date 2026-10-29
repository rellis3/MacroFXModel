"""oi-level-map step 6 (EXPLORATORY, same sample): how IV and the smile relate to the day's size and direction, and to where the walls sit and how they behave.
Reuses analyze.py selection (fresh captures, M1 windows). Smile features come from the capture's own risk-reversal block (put IV, call IV at the wing strikes) and ATM IV,
expressed in ATM-vol units so every market is comparable; day-over-day changes use the previous fresh capture of the same market. Seed 20261028.
Output: results3.json."""
import json, os, math, warnings
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'analyze.py'), encoding='utf-8').read()
exec(src.split('# ── collect every event')[0])
OUTD = OUT
sm = {(r['date'], r['sym']): r for r in json.load(open(os.path.join(OUT, 'smile.json')))}
ev = pd.read_pickle(os.path.join(OUT, '_cache', 'ev.pkl'))

rows = []
for r in sel:
    w = r['_w']; sg = r['dayMove']; o0 = float(w['open'].iloc[0]); hi = float(w['high'].max()); lo = float(w['low'].min()); c1 = float(w['close'].iloc[-1])
    s = sm.get((r['date'], r['sym'])); rr = (s or {}).get('rr') or {}
    atm = r['ivAtm']
    row = {'date': r['date'], 'sym': r['sym'], 'cls': CLASS[r['sym']], 'iv': atm, 'down': (o0 - lo) / sg, 'up': (hi - o0) / sg, 'hl': (hi - lo) / sg, 'oc': (c1 - o0) / sg, 'regime': r['regime'],
           'putIV': rr.get('putIV'), 'callIV': rr.get('callIV')}
    if rr.get('putIV') and rr.get('callIV') and atm:
        row['skew'] = (rr['putIV'] - rr['callIV']) / atm          # put wing minus call wing, in ATM-vol units (+ = downside bid)
        row['wing'] = ((rr['putIV'] + rr['callIV']) / 2 - atm) / atm   # how far both wings sit above ATM (curvature), in ATM-vol units
    cw = [l['price'] for l in r['levels'] if l['type'] == 'call_wall' and l['rank'] == 1]; pw = [l['price'] for l in r['levels'] if l['type'] == 'put_wall' and l['rank'] == 1]
    row['cw'] = cw[0] if cw else None; row['pw'] = pw[0] if pw else None; row['spot'] = r['spot']
    zg = r['zeroGamma'] or r['flip']; row['zg'] = zg
    rows.append(row)
D = pd.DataFrame(rows).sort_values(['sym', 'date']).reset_index(drop=True)
# day-over-day changes against the previous fresh capture of the same market (at most 5 calendar days back)
for col in ('iv', 'skew', 'wing'): D['d_' + col] = np.nan
for col in ('cw', 'pw', 'zg'): D['sh_' + col] = np.nan
prev = {}
for i, x in D.iterrows():
    p = prev.get(x['sym'])
    if p is not None and (pd.Timestamp(x['date']) - pd.Timestamp(p['date'])).days <= 5:
        for col in ('iv', 'skew', 'wing'):
            if pd.notna(x[col]) and pd.notna(p[col]): D.at[i, 'd_' + col] = x[col] - p[col]
        for col in ('cw', 'pw', 'zg'):
            if pd.notna(x[col]) and pd.notna(p[col]): D.at[i, 'sh_' + col] = (x[col] - p[col]) / x['spot'] / (sel_sig := 1.0)
    prev[x['sym']] = x
# wall/flip shifts in day-sigma units
sig = {(r['date'], r['sym']): r['dayMove'] for r in sel}
for col in ('cw', 'pw', 'zg'):
    D['sh_' + col] = [v * x['spot'] / sig[(x['date'], x['sym'])] if pd.notna(v) else np.nan for v, (_, x) in zip(D['sh_' + col], D.iterrows())]

# within-market ranks (so every market counts alike), then pooled Spearman with a date-cluster bootstrap
def wrank(col): return D.groupby('sym')[col].rank(pct=True)
def spear(xcol, ycol, B=1500):
    d = D.dropna(subset=[xcol, ycol]).copy()
    if len(d) < 30: return None
    d['rx'] = d.groupby('sym')[xcol].rank(pct=True); d['ry'] = d.groupby('sym')[ycol].rank(pct=True)
    base = float(np.corrcoef(d['rx'], d['ry'])[0, 1]); ds = sorted(d['date'].unique()); g = {k: v for k, v in d.groupby('date')}
    bs = []
    for _ in range(B):
        pick = rng.integers(0, len(ds), len(ds)); s_ = pd.concat([g[ds[i]] for i in pick])
        if s_['rx'].std() > 0 and s_['ry'].std() > 0: bs.append(float(np.corrcoef(s_['rx'], s_['ry'])[0, 1]))
    return {'n': int(len(d)), 'rho': base, 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}
def tercile(col, outcome_cols):
    d = D.dropna(subset=[col]).copy(); d['t'] = d.groupby('sym')[col].transform(lambda x: pd.qcut(x, 3, labels=['low', 'mid', 'high'], duplicates='drop') if x.nunique() >= 3 else 'mid')
    out = {}
    for t in ['low', 'mid', 'high']:
        s = d[d['t'] == t]; out[t] = {'n': int(len(s))}
        for o in outcome_cols: out[t][o] = float(s[o].median()) if len(s) else None
        out[t]['share_hl_gt_1_6'] = float((s['hl'] > 1.6).mean()) if len(s) else None
        out[t]['share_down_gt_1'] = float((s['down'] > 1.0).mean()) if len(s) else None
        out[t]['share_up_gt_1'] = float((s['up'] > 1.0).mean()) if len(s) else None
    return out

R3 = {'meta': {'seed': SEED, 'n': int(len(D)), 'smileN': int(D['skew'].notna().sum()), 'dates': [dates[0], dates[-1]]}, 'sections': {}}
S = {}
# A) IV level: does it set the size of the day?
loglog = {}
for s_, g in D.groupby('sym'):
    g = g.dropna(subset=['iv'])
    if len(g) > 10:
        x = np.log(g['iv']); y = np.log(g['hl'] * g['iv']); loglog[SHORT[s_]] = {'n': int(len(g)), 'corr': float(np.corrcoef(x, y)[0, 1]), 'slope': float(np.polyfit(x, y, 1)[0])}
S['ivLevel_loglog'] = loglog
S['ivLevel_slope_mean'] = float(np.mean([v['slope'] for v in loglog.values()]))
S['ivLevel_terciles'] = tercile('iv', ['hl', 'down', 'up', 'oc'])
S['iv_vs_hl'] = spear('iv', 'hl'); S['dIv_vs_hl'] = spear('d_iv', 'hl'); S['dIv_vs_oc'] = spear('d_iv', 'oc')
# B) smile shape vs the day
S['skew_vs_down'] = spear('skew', 'down'); S['skew_vs_up'] = spear('skew', 'up'); S['skew_vs_hl'] = spear('skew', 'hl'); S['skew_vs_oc'] = spear('skew', 'oc')
S['wing_vs_hl'] = spear('wing', 'hl'); S['wing_vs_down'] = spear('wing', 'down'); S['wing_vs_up'] = spear('wing', 'up')
S['dSkew_vs_oc'] = spear('d_skew', 'oc'); S['dWing_vs_hl'] = spear('d_wing', 'hl'); S['dSkew_vs_down'] = spear('d_skew', 'down')
S['skew_terciles'] = tercile('skew', ['hl', 'down', 'up', 'oc']); S['wing_terciles'] = tercile('wing', ['hl', 'down', 'up', 'oc'])
# C) smile change vs where the walls sit
S['dSkew_vs_putWallShift'] = spear('d_skew', 'sh_pw'); S['dSkew_vs_callWallShift'] = spear('d_skew', 'sh_cw'); S['dWing_vs_putWallShift'] = spear('d_wing', 'sh_pw'); S['dWing_vs_callWallShift'] = spear('d_wing', 'sh_cw')
S['dIv_vs_putWallShift'] = spear('d_iv', 'sh_pw'); S['dIv_vs_callWallShift'] = spear('d_iv', 'sh_cw'); S['dIv_vs_zeroGammaShift'] = spear('d_iv', 'sh_zg'); S['dSkew_vs_zeroGammaShift'] = spear('d_skew', 'sh_zg')
D['wall_span'] = (D['cw'] - D['pw']) / [sig[(x['date'], x['sym'])] for _, x in D.iterrows()]
S['iv_vs_wallSpan'] = spear('iv', 'wall_span')
# D) do the walls behave differently when the put wing is rich or IV is rich?
real = ev[(ev['kind'] == 'real') & (ev['type'].isin(['call_wall', 'put_wall']))].copy(); pl = ev[ev['kind'] == 'placebo'].copy()
key = D.set_index(['date', 'sym'])
for df in (real, pl):
    df['skew'] = [key['skew'].get((d, s_)) if (d, s_) in key.index else np.nan for d, s_ in zip(df['date'], df['sym'])]
    df['iv'] = [key['iv'].get((d, s_)) if (d, s_) in key.index else np.nan for d, s_ in zip(df['date'], df['sym'])]
    for col in ('skew', 'iv'): df['t_' + col] = df.groupby('sym')[col].transform(lambda x: pd.qcut(x, 3, labels=['low', 'mid', 'high'], duplicates='drop') if x.dropna().nunique() >= 3 else np.nan)
def wallrate(col):
    out = {}
    for t in ['low', 'mid', 'high']:
        for typ in ('put_wall', 'call_wall'):
            a = real[(real['type'] == typ) & (real['t_' + col] == t) & (real['touched'] == True) & real['race'].isin([1, -1])]
            b = pl[(pl['t_' + col] == t) & (pl['touched'] == True) & pl['race'].isin([1, -1])]
            out[f'{typ} · {t}'] = {'n': int(len(a)), 'bounce': float((a['race'] == 1).mean()) if len(a) else None, 'plc_n': int(len(b)), 'plc': float((b['race'] == 1).mean()) if len(b) else None}
    return out
S['wallBounce_by_skew'] = wallrate('skew'); S['wallBounce_by_iv'] = wallrate('iv')
R3['sections'] = S
json.dump(R3, open(os.path.join(OUT, 'results3.json'), 'w'), default=lambda o: None if (isinstance(o, float) and math.isnan(o)) else (o.item() if hasattr(o, 'item') else str(o)))
print('written results3.json', len(D), 'smile rows', int(D['skew'].notna().sum()))

# E) the wall shifts above include the price move itself (IV tends to rise as price falls). Remove it: shift of the wall minus shift of spot, in day-sigma
D['spot_sh'] = np.nan
prev = {}
for i, x in D.iterrows():
    p = prev.get(x['sym'])
    if p is not None and (pd.Timestamp(x['date']) - pd.Timestamp(p['date'])).days <= 5: D.at[i, 'spot_sh'] = (x['spot'] - p['spot']) / sig[(x['date'], x['sym'])]
    prev[x['sym']] = x
for col in ('pw', 'cw'): D['rs_' + col] = D['sh_' + col] - D['spot_sh']
S2 = {'dIv_vs_spotMove': spear('d_iv', 'spot_sh'), 'dIv_vs_putWallShift_exSpot': spear('d_iv', 'rs_pw'), 'dIv_vs_callWallShift_exSpot': spear('d_iv', 'rs_cw'),
      'dSkew_vs_callWallShift_exSpot': spear('d_skew', 'rs_cw'), 'dSkew_vs_putWallShift_exSpot': spear('d_skew', 'rs_pw')}
R3['sections'].update(S2)
json.dump(R3, open(os.path.join(OUT, 'results3.json'), 'w'), default=lambda o: None if (isinstance(o, float) and math.isnan(o)) else (o.item() if hasattr(o, 'item') else str(o)))
for k, v in S2.items(): print(k, v and (round(v['rho'], 2), round(v['lo'], 2), round(v['hi'], 2), v['n']))
