"""oi-level-map step 4 (EXPLORATORY, same sample as analyze.py): DTE carved vs squashed, per-strike Greeks beyond the flips, piled-up lines, and the day book
with a regime stack (dealer-gamma sign, daily HMM variance state, travel direction). Reuses analyze.py's selection, event race and placebo code unchanged.
Seed 20261028. Output: results2.json + replay_<market>.json (replaces the step-3 replays: adds the new lines and the day features)."""
import json, os, math, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'analyze.py'), encoding='utf-8').read()
exec(src.split('# ── collect every event')[0])                                         # recs, sel, run_event, placebos, ctx, bucket_walls ...
exec('#' + src.split('# ── statistics helpers')[1].split("res = {'meta'")[0])               # race_stats, boot_diff, cell
from hmmlearn.hmm import GaussianHMM

# ── faster event runner (same semantics as run_event, arrays cached per record) ───────────────────────────────────────────────────────
for r in sel:
    w = r['_w']; r['_o0'] = float(w['open'].iloc[0]); r['_hi'] = w['high'].values; r['_lo'] = w['low'].values; r['_cl'] = w['close'].values; r['_ix'] = w.index
def run_event(p, r, tol=0.03):
    sg = r['dayMove']; o0 = r['_o0']
    if abs(o0 - p) < 0.05 * sg: return None
    side = 1 if o0 > p else -1
    hi, lo, cl = r['_hi'], r['_lo'], r['_cl']
    hit = np.nonzero((lo <= p + tol * sg) & (hi >= p - tol * sg))[0]
    if len(hit) == 0: return {'touched': False}
    i = int(hit[0]); hh, ll = hi[i + 1:], lo[i + 1:]
    if len(hh) == 0: return {'touched': True, 'race': 0, 'i': i, 'side': side, 'hb': hour_block(r['_ix'][i])}
    up_t, dn_t = p + RACE * sg, p - RACE * sg
    b_hit, k_hit = ((hh >= up_t), (ll <= dn_t)) if side > 0 else ((ll <= dn_t), (hh >= up_t))
    bi = np.argmax(b_hit) if b_hit.any() else 10**9; ki = np.argmax(k_hit) if k_hit.any() else 10**9
    race = 0 if (bi == 10**9 and ki == 10**9) else (2 if bi == ki else (1 if bi < ki else -1))
    out = {'touched': True, 'race': race, 'i': i, 'side': side, 'hb': hour_block(r['_ix'][i])}
    for h in HORIZ + [10**6]:
        sh, sl = hh[:h], ll[:h]
        if len(sh) == 0: eb = ek = 0.0
        elif side > 0: eb, ek = (sh.max() - p) / sg, (p - sl.min()) / sg
        else: eb, ek = (p - sl.min()) / sg, (sh.max() - p) / sg
        out[f'b{h}'] = max(eb, 0.0); out[f'k{h}'] = max(ek, 0.0)
    out['magnet'] = (abs(o0 - p) - abs(cl[-1] - p)) / sg
    return out

# afternoon drift toward a price: |p@13:00 London - L| - |p@20:00 London - L|, in sigma (charm / time-of-day pull)
def drift_pm(p, r):
    ix = r['_ix']; d = r['date']
    t13 = london_to_utc(d, 13); t20 = london_to_utc(d, 20)
    i13 = ix.searchsorted(t13) ; i20 = ix.searchsorted(t20)
    if i13 >= len(ix) or i20 >= len(ix) or i13 < 5: return None
    c13, c20 = r['_cl'][i13], r['_cl'][min(i20, len(ix) - 1)]
    return (abs(c13 - p) - abs(c20 - p)) / r['dayMove']

# ── regime stack inputs: daily closes (NY 17:00), 2-state Gaussian HMM on log returns (variance states, as hmm.js), travel direction (as travelRead.js) ─
KEY = {'EUR/USD': 'eurusd', 'GBP/USD': 'gbpusd', 'USD/JPY': 'usdjpy', 'AUD/USD': 'audusd', 'USD/CAD': 'usdcad', 'USD/CHF': 'usdchf', 'XAU/USD': 'gold',
       'NAS100_USD': 'nq', 'SPX500_USD': 'spx', 'US30_USD': 'dow', 'US2000_USD': 'us2000'}
DAILY = {}
for s, k in KEY.items():
    df = pd.read_parquet(os.path.join(ROOT, 'data', 'm1_bidask', f'{k}_m1.parquet'), columns=['close', 'time'])
    df['time'] = pd.to_datetime(df['time']); df = df[df['time'] >= '2024-06-01']
    ny = df['time'].dt.tz_localize('UTC').dt.tz_convert('America/New_York') + pd.Timedelta(hours=7)
    g = df.groupby(ny.dt.date.values)['close'].agg(['last', 'count'])
    g = g[(g['count'] >= 200)]; g.index = pd.to_datetime(g.index)
    g = g[g.index.weekday < 5]
    DAILY[s] = g['last']
def regime_stack(sym, date):
    c = DAILY[sym]; c = c[c.index < pd.Timestamp(date)]
    if len(c) < 120: return None
    ret = np.diff(np.log(c.values))[-250:]
    m = GaussianHMM(n_components=2, covariance_type='diag', n_iter=60, random_state=SEED).fit(ret.reshape(-1, 1))
    hi_state = int(np.argmax(m.covars_.reshape(2))); p = m.predict_proba(ret.reshape(-1, 1))[-1]
    pHigh = float(p[hi_state]); vol_ratio = float(np.sqrt(m.covars_.reshape(2)[hi_state] / m.covars_.reshape(2)[1 - hi_state]))
    px_ = c.values; rw = px_[-63:]; lo_, hi_ = rw.min(), rw.max(); pos = (px_[-1] - lo_) / (hi_ - lo_) if hi_ > lo_ else 0.5
    ew = px_[-43:]; path = np.abs(np.diff(ew)).sum(); eff = abs(ew[-1] - ew[0]) / path if path > 0 else 0; mult = eff / (1 / math.sqrt(len(ew) - 1))
    tdir = 'flat' if mult < 1.15 else ('up' if pos >= 0.8 else 'down' if pos <= 0.2 else 'flat')
    return {'pHigh': pHigh, 'hmm': 'TREND(high-vol)' if pHigh >= 0.5 else 'RANGE(low-vol)', 'volRatio': vol_ratio, 'pos': float(pos), 'eff': float(mult), 'travel': tdir,
            'ret5': float(np.log(px_[-1] / px_[-6])), 'ret63': float(np.log(px_[-1] / px_[-64])), 'rvRatio': float(np.std(ret[-10:]) / np.std(ret))}
for r in sel: r['stack'] = regime_stack(r['sym'], r['date'])
print('regime stacks', sum(1 for r in sel if r['stack']), 'of', len(sel))

# ── line definitions ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def top2(price_val, above, spot, sg):
    items = sorted([(k, v) for k, v in price_val.items() if v > 0 and (k > spot if above else k < spot)], key=lambda x: -x[1])
    out = []
    for k, v in items:
        if all(abs(k - o[0]) > 0.12 * sg for o in out): out.append((k, v))
        if len(out) == 2: break
    return out
def lines_for(r):
    sg, spot = r['dayMove'], r['spot']; B = r['buckets']; L = []
    def agg(field, ids):
        d = {}
        for bid in ids:
            b = B.get(bid)
            if not b: continue
            for i, k in enumerate(b['strikes']): d[round(k, 8)] = d.get(round(k, 8), 0.0) + b[field][i]
        return d
    allb = list(B.keys()); near = [b for b in allb if b in ('d0_1', 'd2_7')]; far = [b for b in allb if b in ('d8_45', 'd46p')]
    for name, field_c, field_p, ids in [('sq_gamma', 'call', 'put', allb), ('sq_oi', 'oiC', 'oiP', allb), ('near_oi', 'oiC', 'oiP', near), ('far_oi', 'oiC', 'oiP', far)]:
        C, P = agg(field_c, ids), agg(field_p, ids)
        mc, mp = max(C.values() or [1e-12]), max(P.values() or [1e-12])
        for k, v in top2(C, True, spot, sg): L.append({'def': name, 'type': name + '_call', 'price': k, 'strength': v / mc})
        for k, v in top2(P, False, spot, sg): L.append({'def': name, 'type': name + '_put', 'price': k, 'strength': v / mp})
    # total-OI peak (calls + puts, every expiry): one line, direction-free
    C, P = agg('oiC', allb), agg('oiP', allb); T = {k: C.get(k, 0) + P.get(k, 0) for k in set(C) | set(P)}
    inwin = {k: v for k, v in T.items() if abs(k - spot) <= 2 * sg}
    if inwin and max(inwin.values()) > 0:
        k = max(inwin, key=inwin.get); L.append({'def': 'sq_oi', 'type': 'oi_peak', 'price': k, 'strength': inwin[k] / max(inwin.values())})
    # per-strike vanna extremes (all expiries squashed)
    V = agg('van', allb); vin = {k: v for k, v in V.items() if abs(k - spot) <= 2 * sg}
    if vin and max(abs(x) for x in vin.values()) > 0:
        kp = max(vin, key=vin.get); kn = min(vin, key=vin.get)
        if vin[kp] > 0: L.append({'def': 'vanna', 'type': 'vanna_pos', 'price': kp, 'strength': vin[kp] / max(abs(vin[kp]), abs(vin[kn]))})
        if vin[kn] < 0: L.append({'def': 'vanna', 'type': 'vanna_neg', 'price': kn, 'strength': abs(vin[kn]) / max(abs(vin[kp]), abs(vin[kn]))})
    # far-expiry share of the open interest at each squashed OI wall
    for l in L:
        if l['def'] == 'sq_oi':
            Cn, Pn = agg('oiC', near), agg('oiP', near); Cf, Pf = agg('oiC', far), agg('oiP', far)
            nn = Cn.get(l['price'], 0) + Pn.get(l['price'], 0); ff = Cf.get(l['price'], 0) + Pf.get(l['price'], 0)
            l['farShare'] = ff / (nn + ff) if (nn + ff) > 0 else None
    return L

rows = []
for r in sel:
    c = ctx(r); sg = r['dayMove']; LL = lines_for(r)
    byd = {}
    for l in LL: byd.setdefault(l['def'], []).append(l)
    for dname, ls in byd.items():
        ps = [l['price'] for l in ls]
        for l in ls:
            e = run_event(l['price'], r)
            if e is None: continue
            e.update(c); e.update({'kind': 'real', 'def': dname, 'type': l['type'], 'strength': l['strength'], 'farShare': l.get('farShare')})
            if e['touched']: e['drift_pm'] = drift_pm(l['price'], r)
            rows.append(e)
        for q in placebos(r, ps):
            e = run_event(q, r)
            if e is None: continue
            e.update(c); e.update({'kind': 'placebo', 'def': dname, 'type': 'placebo'})
            if e['touched']: e['drift_pm'] = drift_pm(q, r)
            rows.append(e)
    # indicator lines: placebo-matched drift for the time-of-day pull and the cluster analysis
    real = [(l['type'], l['price']) for l in r['levels']]
    for t, p in real:
        if t in ('charm_flip', 'vanna_flip', 'zero_gamma', 'max_pain', 'gamma_peak', 'call_wall', 'put_wall', 'oi_volume'):
            e = run_event(p, r)
            d_ = drift_pm(p, r)
            rows.append({**c, 'kind': 'real', 'def': 'drift', 'type': t, 'touched': bool(e and e.get('touched')), 'race': (e or {}).get('race', 0), 'drift_pm': d_})
    for q in placebos(r, [p for _, p in real]):
        rows.append({**c, 'kind': 'placebo', 'def': 'drift', 'type': 'placebo', 'touched': False, 'race': 0, 'drift_pm': drift_pm(q, r)})
ev2 = pd.DataFrame(rows)
print('events', len(ev2))

groups = {'ALL': lambda d: d, 'FX': lambda d: d[d['cls'] == 'FX'], 'GOLD': lambda d: d[d['cls'] == 'GOLD'], 'IDX': lambda d: d[d['cls'] == 'IDX']}
RES = {'meta': {'seed': SEED}, 'sections': {}}

# S1: squash vs carve ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
S1 = {}
for dname in ['sq_gamma', 'sq_oi', 'near_oi', 'far_oi']:
    d = ev2[ev2['def'] == dname]; pl = d[d['kind'] == 'placebo']; S1[dname] = {}
    for tp in [dname + '_call', dname + '_put', 'ALLWALLS']:
        sub = d[(d['kind'] == 'real') & ((d['type'] == tp) if tp != 'ALLWALLS' else d['type'].isin([dname + '_call', dname + '_put']))]
        S1[dname][tp] = {g: cell(f(sub), f(pl)) for g, f in groups.items() if (f(sub)['touched'] == True).sum() >= 6}
d = ev2[ev2['def'] == 'sq_oi']; pl = d[d['kind'] == 'placebo']
sub = d[(d['kind'] == 'real') & (d['type'].isin(['sq_oi_call', 'sq_oi_put']))].copy()
sub['fbin'] = pd.cut(sub['farShare'], [-0.01, 0.2, 0.6, 1.01], labels=['mostly near-expiry OI (<20% far)', 'mixed', 'mostly far-expiry OI (>60% 8+ days)'])
S1['farShare'] = {str(v): cell(sub[sub['fbin'] == v], pl) for v in sub['fbin'].cat.categories if (sub[sub['fbin'] == v]['touched'] == True).sum() >= 6}
S1['farShare_PIN'] = {}
for rg in ('PIN', 'BREAKOUT'):
    for v in sub['fbin'].cat.categories:
        s2 = sub[(sub['fbin'] == v) & (sub['regime'] == rg)]
        if (s2['touched'] == True).sum() >= 6: S1['farShare_PIN'][f'{rg} · {v}'] = cell(s2, pl[pl['regime'] == rg])
pk = d[(d['kind'] == 'real') & (d['type'] == 'oi_peak')]; S1['oi_peak'] = {g: cell(f(pk), f(pl)) for g, f in groups.items() if (f(pk)['touched'] == True).sum() >= 6}
RES['sections']['squash'] = S1

# overlap: how often do two line definitions sit on the same price? (within 0.1 sigma)
ov = {}
defs_pairs = [('ind_walls', 'sq_gamma_walls'), ('ind_walls', 'sq_oi_walls'), ('sq_gamma_walls', 'sq_oi_walls'), ('near_oi_walls', 'far_oi_walls'), ('ind_walls', 'near_oi_walls')]
def wall_prices(r, name):
    if name == 'ind_walls': return [l['price'] for l in r['levels'] if l['type'] in ('call_wall', 'put_wall')]
    return [l['price'] for l in lines_for(r) if l['type'] in (name.replace('_walls', '_call'), name.replace('_walls', '_put'))]
for a, b in defs_pairs:
    hit = tot = 0
    for r in sel:
        A, Bp = wall_prices(r, a), wall_prices(r, b)
        for p in A:
            tot += 1; hit += int(any(abs(p - q) <= 0.1 * r['dayMove'] for q in Bp))
    ov[f'{a} vs {b}'] = {'n': tot, 'share': hit / tot if tot else None}
RES['sections']['overlap'] = ov

# S2: vanna extremes + time-of-day pull ───────────────────────────────────────────────────────────────────────────────────────────────
S2 = {}
d = ev2[ev2['def'] == 'vanna']; pl = d[d['kind'] == 'placebo']
for tp in ['vanna_pos', 'vanna_neg']:
    sub = d[(d['kind'] == 'real') & (d['type'] == tp)]; S2[tp] = {g: cell(f(sub), f(pl)) for g, f in groups.items() if (f(sub)['touched'] == True).sum() >= 6}
dr = ev2[ev2['def'] == 'drift']; pl = dr[dr['kind'] == 'placebo']['drift_pm'].dropna()
def drift_stat(vals_real, vals_pl, dates_real, dates_pl):
    out = {'n': int(len(vals_real)), 'mean': float(np.mean(vals_real)), 'plc': float(np.mean(vals_pl))}
    ds = sorted(set(dates_real) | set(dates_pl)); R_ = pd.Series(vals_real.values, index=dates_real.values); P_ = pd.Series(vals_pl.values, index=dates_pl.values)
    rg = R_.groupby(level=0).agg(['sum', 'count']).reindex(ds, fill_value=0).values; pg = P_.groupby(level=0).agg(['sum', 'count']).reindex(ds, fill_value=0).values
    def m(M, ix): s = M[ix].sum(axis=0); return s[0] / s[1] if s[1] else np.nan
    base = m(rg, np.arange(len(ds))) - m(pg, np.arange(len(ds))); bs = []
    for _ in range(1500):
        ix = rng.integers(0, len(ds), len(ds)); v = m(rg, ix) - m(pg, ix)
        if not np.isnan(v): bs.append(v)
    out.update({'diff': float(base), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}); return out
S2['pm_pull'] = {}
for tp in ['charm_flip', 'vanna_flip', 'zero_gamma', 'max_pain', 'gamma_peak', 'call_wall', 'put_wall', 'oi_volume']:
    rr = dr[(dr['kind'] == 'real') & (dr['type'] == tp)].dropna(subset=['drift_pm'])
    if len(rr) >= 15: S2['pm_pull'][tp] = drift_stat(rr['drift_pm'], dr[dr['kind'] == 'placebo'].dropna(subset=['drift_pm'])['drift_pm'], rr['date'], dr[dr['kind'] == 'placebo'].dropna(subset=['drift_pm'])['date'])
RES['sections']['greeks'] = S2

# S3: piled-up lines ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
crow = []
for r in sel:
    sg = r['dayMove']; c = ctx(r); lv = sorted([(l['price'], l['type']) for l in r['levels'] if l['type'] not in ('exp_hi', 'exp_lo')])
    cl = []
    for p, t in lv:
        if cl and p - cl[-1][-1][0] <= 0.1 * sg: cl[-1].append((p, t))
        else: cl.append([(p, t)])
    centres = []
    for g in cl:
        types = sorted({t for _, t in g}); cp = float(np.mean([p for p, _ in g]))
        e = run_event(cp, r)
        if e is None: continue
        e.update(c); e.update({'kind': 'real', 'size': min(len(types), 3), 'types': types,
                               'has_wall': any(t in ('call_wall', 'put_wall') for t in types), 'has_peak': 'gamma_peak' in types, 'has_mp': 'max_pain' in types,
                               'has_vol': 'oi_volume' in types, 'has_flip': any(t in ('zero_gamma', 'gex_flip') for t in types), 'has_vc': any(t in ('vanna_flip', 'charm_flip') for t in types)})
        crow.append(e)
    for q in placebos(r, [float(np.mean([p for p, _ in g])) for g in cl]):
        e = run_event(q, r)
        if e is None: continue
        e.update(c); e.update({'kind': 'placebo'}); crow.append(e)
cv = pd.DataFrame(crow); cp_ = cv[cv['kind'] == 'placebo']; cr = cv[cv['kind'] == 'real']
S3 = {'bySize': {}, 'combos': {}, 'bySize_regime': {}}
for sz in (1, 2, 3):
    sub = cr[cr['size'] == sz]
    if (sub['touched'] == True).sum() >= 6: S3['bySize'][str(sz) + ('+' if sz == 3 else '')] = cell(sub, cp_)
    for rg in ('PIN', 'BREAKOUT'):
        s2 = sub[sub['regime'] == rg]
        if (s2['touched'] == True).sum() >= 6: S3['bySize_regime'][f'{sz}{"+" if sz == 3 else ""} · {rg}'] = cell(s2, cp_[cp_['regime'] == rg])
for lab, col in [('wall + gamma peak', lambda x: x['has_wall'] & x['has_peak']), ('wall + max pain', lambda x: x['has_wall'] & x['has_mp']), ('wall + volume level', lambda x: x['has_wall'] & x['has_vol']),
                 ('wall + a flip', lambda x: x['has_wall'] & x['has_flip']), ('wall + vanna/charm flip', lambda x: x['has_wall'] & x['has_vc']), ('gamma peak + max pain', lambda x: x['has_peak'] & x['has_mp']),
                 ('three or more types incl. a wall', lambda x: x['has_wall'] & (x['size'] >= 3))]:
    sub = cr[col(cr)]
    if (sub['touched'] == True).sum() >= 6:
        S3['combos'][lab] = cell(sub, cp_)
        for rg in ('PIN', 'BREAKOUT'):
            s2 = sub[sub['regime'] == rg]
            if (s2['touched'] == True).sum() >= 6: S3['combos'][f'{lab} · {rg}'] = cell(s2, cp_[cp_['regime'] == rg])
S3['clusterCounts'] = {str(k): int(v) for k, v in cr['size'].value_counts().items()}
RES['sections']['piled'] = S3

# S4: the day book and regime stack ──────────────────────────────────────────────────────────────────────────────────────────────────
DB = []
for r in sel:
    st = r['stack']; w = r['_w']; sg = r['dayMove']; o0, c1 = r['_o0'], float(r['_cl'][-1]); hl = float((r['_hi'].max() - r['_lo'].min()) / sg); oc = (c1 - o0) / sg
    lv = []
    touched = bounced = broke = 0
    for l in r['levels']:
        if l['type'] in ('exp_hi', 'exp_lo'): continue
        e = run_event(l['price'], r)
        if e and e.get('touched'):
            touched += 1; bounced += int(e['race'] == 1); broke += int(e['race'] == -1)
    zg = r['zeroGamma'] or r['flip']
    cwv = [l['price'] for l in r['levels'] if l['type'] == 'call_wall']; pwv = [l['price'] for l in r['levels'] if l['type'] == 'put_wall']
    up_d = (min(cwv) - r['spot']) if cwv else None; dn_d = (r['spot'] - max(pwv)) if pwv else None
    DB.append({'date': r['date'], 'sym': r['sym'], 'short': SHORT[r['sym']], 'cls': CLASS[r['sym']], 'gamma': r['regime'], 'hf': ('damp' if (r['hf'] and r['hf']['slope'] is not None and r['hf']['slope'] < 0) else 'reinf' if r['hf'] else None),
               'hmm': st['hmm'] if st else None, 'rvRatio': (round(st['rvRatio'], 3) if st else None), 'ret63': (round(st['ret63'], 4) if st else None), 'pHigh': st['pHigh'] if st else None, 'travel': st['travel'] if st else None, 'pos': st['pos'] if st else None, 'ret5': st['ret5'] if st else None, 'ret63': st['ret63'] if st else None, 'rvRatio': st['rvRatio'] if st else None,
               'iv': r['ivAtm'], 'hl': hl, 'oc': oc, 'aoc': abs(oc), 'eff': (abs(oc) / hl if hl > 0 else None), 'touched': touched, 'bounced': bounced, 'broke': broke,
               'aboveZG': (r['spot'] > zg) if zg else None, 'aboveMP': (r['spot'] > r['maxPain']) if r['maxPain'] else None, 'nearerCall': (up_d < dn_d) if (up_d is not None and dn_d is not None) else None,
               'netGex': r['netGex']})
dbd = pd.DataFrame(DB)
dbd['ivz'] = dbd.groupby('sym')['iv'].transform(lambda x: (x - x.mean()) / (x.std() + 1e-9))
dbd['rvbin'] = pd.cut(dbd['rvRatio'], [0, 0.8, 1.25, 99], labels=['calm (10d vol < 0.8x its year)', 'normal', 'hot (10d vol > 1.25x its year)'])
dbd['hlbin'] = pd.cut(dbd['hl'], [0, 0.8, 1.4, 99], labels=['quiet (<0.8σ)', 'normal', 'wide (>1.4σ)'])
dbd['daytype'] = np.where(dbd['eff'] >= 0.6, 'trend (close near an extreme)', 'rotation (price went round)')
def agg_(x):
    x = x.dropna()
    if len(x) < 6: return None
    bs = [x.sample(len(x), replace=True, random_state=int(rng.integers(0, 1 << 30))).median() for _ in range(400)]
    return {'n': int(len(x)), 'median': float(x.median()), 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5))}
S4 = {'n': int(len(dbd))}
S4['hl_by_gamma_x_hmm'] = {f'{g} · {h}': agg_(dbd[(dbd['gamma'] == g) & (dbd['hmm'] == h)]['hl']) for g in ('PIN', 'BREAKOUT') for h in ('RANGE(low-vol)', 'TREND(high-vol)')}
S4['hl_by_rv'] = {str(t): agg_(dbd[dbd['rvbin'] == t]['hl']) for t in dbd['rvbin'].cat.categories}
S4['hl_by_gamma_x_rv'] = {f'{g} · {t}': agg_(dbd[(dbd['gamma'] == g) & (dbd['rvbin'] == t)]['hl']) for g in ('PIN', 'BREAKOUT') for t in dbd['rvbin'].cat.categories}
S4['pHigh_range'] = [float(dbd['pHigh'].min()), float(dbd['pHigh'].max())]
S4['hl_by_hmm'] = {h: agg_(dbd[dbd['hmm'] == h]['hl']) for h in ('RANGE(low-vol)', 'TREND(high-vol)')}
S4['hmm_counts'] = {k: int(v) for k, v in dbd['hmm'].value_counts().items()}
# OLS with a date-cluster bootstrap: what explains how wide the day was?
X = dbd.dropna(subset=['pHigh', 'ivz', 'hl', 'netGex', 'rvRatio']).copy(); X['lrv'] = np.log(X['rvRatio'].clip(lower=0.2)); X['gneg'] = (X['gamma'] == 'BREAKOUT').astype(float); X['reinf'] = (X['hf'] == 'reinf').astype(float); X['y'] = np.log(X['hl'].clip(lower=0.05))
cols = ['lrv', 'gneg', 'reinf', 'ivz']
def ols(D): A = np.column_stack([np.ones(len(D))] + [D[c].values for c in cols]); return np.linalg.lstsq(A, D['y'].values, rcond=None)[0]
beta = ols(X); ds = sorted(X['date'].unique()); bs = []
gb = {d_: X[X['date'] == d_] for d_ in ds}
for _ in range(1000):
    pick = rng.integers(0, len(ds), len(ds)); D = pd.concat([gb[ds[i]] for i in pick])
    try: bs.append(ols(D))
    except Exception: pass
bs = np.array(bs)
S4['range_model'] = {'n': int(len(X)), 'target': 'log(session range / implied move)', 'terms': {n: {'coef': float(beta[i]), 'lo': float(np.percentile(bs[:, i], 2.5)), 'hi': float(np.percentile(bs[:, i], 97.5))} for i, n in enumerate(['const'] + cols)},
                     'note': 'lrv = log of (last 10 days realised vol / last 250 days) = how hot the market has been running; gneg = 1 on a BREAKOUT (short-gamma) day; reinf = 1 if the hedge-flow slope is reinforcing; ivz = how rich the options are for that market (z-score)'}
# does anything say which way the day went? (direction-adjacent: expected null)
def hit(mask, cond_up):
    d_ = dbd[mask]; d_ = d_[d_['oc'].abs() > 0.05]; n = len(d_)
    if n < 15: return None
    k = int(((d_['oc'] > 0) == cond_up[d_.index]).sum()) if hasattr(cond_up, 'index') else None
    return {'n': n, 'agree': k / n, 'k': k}
def agree(df, pred_up):
    d_ = df[df['oc'].abs() > 0.05]; p_ = pred_up[d_.index]; n = len(d_)
    if n < 15: return None
    k = int(((d_['oc'] > 0) == p_).sum()); lo_, hi_ = (lambda z=1.96: ((k / n + z * z / (2 * n) - z * math.sqrt(k / n * (1 - k / n) / n + z * z / (4 * n * n))) / (1 + z * z / n), (k / n + z * z / (2 * n) + z * math.sqrt(k / n * (1 - k / n) / n + z * z / (4 * n * n))) / (1 + z * z / n)))()
    return {'n': n, 'rate': k / n, 'lo': lo_, 'hi': hi_}
D1 = {}
tr = dbd[dbd['travel'].isin(['up', 'down'])]; D1['travel read (up/down) vs the day'] = agree(tr, (tr['travel'] == 'up'))
D1['price above zero gamma / GEX flip -> up'] = agree(dbd[dbd['aboveZG'].notna()], dbd['aboveZG'].fillna(False).astype(bool))
D1['price above max pain -> down (pull back)'] = agree(dbd[dbd['aboveMP'].notna()], (~dbd['aboveMP'].fillna(True).astype(bool)))
D1['nearer to the call wall than the put wall -> down'] = agree(dbd[dbd['nearerCall'].notna()], (~dbd['nearerCall'].fillna(True).astype(bool)))
D1['63-day trend up/down -> same direction today'] = agree(dbd[dbd['ret63'].notna()], (dbd['ret63'].fillna(0) > 0))
D1['last 5 days rose -> up (momentum)'] = agree(dbd[dbd['ret5'].notna()], (dbd['ret5'].fillna(0) > 0))
S4['direction'] = D1
S4['hl_by_hlbin_regime'] = {}
S4['daytype_by_gamma'] = {g: {t: int(((dbd['gamma'] == g) & (dbd['daytype'] == t)).sum()) for t in dbd['daytype'].unique()} for g in ('PIN', 'BREAKOUT')}
S4['hlbin_by_gamma'] = {g: {str(t): int(((dbd['gamma'] == g) & (dbd['hlbin'] == t)).sum()) for t in dbd['hlbin'].cat.categories} for g in ('PIN', 'BREAKOUT')}
S4['hlbin_by_hmm'] = {h: {str(t): int(((dbd['hmm'] == h) & (dbd['hlbin'] == t)).sum()) for t in dbd['hlbin'].cat.categories} for h in ('RANGE(low-vol)', 'TREND(high-vol)')}
S4['bounce_rate_by_day'] = {}
RES['sections']['dayBook'] = S4
RES['meta'].update({'records': len(sel), 'dates': [dates[0], dates[-1]], 'nDates': len(dates), 'hmm': '2-state Gaussian HMM (hmmlearn), last 250 NY-close daily log returns before the session, high-variance-state probability at the last close; label RANGE/TREND = variance, as hmm.js. Travel = position in 63-bar range + efficiency vs random walk, as travelRead.js'})
json.dump(RES, open(os.path.join(OUT, 'results2.json'), 'w'), default=lambda o: None if (isinstance(o, float) and math.isnan(o)) else (o.item() if hasattr(o, 'item') else str(o)))

# ── replays: indicator lines + the new squash/vanna lines + the day's regime stack ───────────────────────────────────────────────────
REPLAY = {}
dbi = {(x['date'], x['sym']): x for x in DB}
for r in sel:
    w = r['_w']; sg = r['dayMove']
    b5 = w.resample('5min').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
    t0 = int(b5.index[0].tz_localize('UTC').timestamp()); lv = []
    allL = [{'type': l['type'], 'price': l['price'], 'strength': l['strength'], 'rank': l['rank'], 'chgPct': l['chgPct']} for l in r['levels']] + \
           [{'type': l['type'], 'price': l['price'], 'strength': l['strength'], 'rank': None, 'chgPct': None, 'farShare': l.get('farShare')} for l in lines_for(r)]
    for l in allL:
        e = run_event(l['price'], r); ev_ = None
        if e is not None:
            ev_ = {'touched': bool(e['touched'])}
            if e['touched']: ev_.update({'min': int(e['i']), 'race': int(e['race']), 'hb': e.get('hb'), 'b60': round(e['b60'], 3) if 'b60' in e else None, 'k60': round(e['k60'], 3) if 'k60' in e else None})
        l['ev'] = ev_; l['price'] = round(l['price'], 8); lv.append(l)
    d_ = dbi[(r['date'], r['sym'])]
    REPLAY.setdefault(SHORT[r['sym']], []).append({
        'date': r['date'], 't0': t0, 'spot': r['spot'], 'sigma': sg, 'regime': r['regime'], 'book': r['book']['id'], 'iv': r['ivAtm'], 'ivSource': r.get('ivSource'), 'hf': d_['hf'],
        'hmm': d_['hmm'], 'rvRatio': (round(d_['rvRatio'], 3) if d_['rvRatio'] is not None else None), 'ret63': (round(d_['ret63'], 4) if d_['ret63'] is not None else None), 'pHigh': round(d_['pHigh'], 3) if d_['pHigh'] is not None else None, 'travel': d_['travel'], 'pos': round(d_['pos'], 3) if d_['pos'] is not None else None,
        'hl': round(d_['hl'], 3), 'oc': round(d_['oc'], 3), 'eff': round(d_['eff'], 3) if d_['eff'] is not None else None, 'dte': r['dte'], 'fresh': r['fresh'],
        'o': [round(float(x), 6) for x in b5['open']], 'h': [round(float(x), 6) for x in b5['high']], 'l': [round(float(x), 6) for x in b5['low']], 'c': [round(float(x), 6) for x in b5['close']], 'levels': lv})
for k, v in REPLAY.items(): json.dump(v, open(os.path.join(OUT, f'replay_{k}.json'), 'w'))
print('written results2.json + replays', {k: len(v) for k, v in REPLAY.items()})
