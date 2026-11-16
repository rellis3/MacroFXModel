#!/usr/bin/env python3
"""bias-engine-backtest scorer -- forge/BIAS_ENGINE_BACKTEST_PREREG.md (seed 20261116).

    python -X utf8 -I scripts/bias-engine-backtest/run.py --selftest   # synthetic known-answer controls only
    python -X utf8 -I scripts/bias-engine-backtest/run.py --power      # control-sample MDE table (block-permuted signal)
    python -X utf8 -I scripts/bias-engine-backtest/run.py              # selftest, then the registered run

Inputs: analysis/output/bias-engine-backtest/engine_daily.csv (run_engine.mjs) and outcomes.parquet (outcomes.py).
Writes RESULTS.md, results.json, cells.csv, evidence/<horizon>/... into analysis/output/bias-engine-backtest/.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from statistics import NormalDist

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa
sys.path.insert(0, str(ROOT / 'scripts' / 'evidence_pack'))
from pack import build_pack  # noqa: E402

ND = NormalDist()
B_BOOT = 2000
N_PERM = 500
BLOCK = 21
HORIZONS = [0, 5, 20]
HNAME = {0: 'sameday', 5: '5d', 20: '20d'}
GROUPS = ['fx', 'gold', 'idx']
HIT_BAR = {0: 0.02, 5: 0.03, 20: 0.05}          # hit-rate excess over B0, the useful size
R_BAR = {0: 0.04, 5: 0.17, 20: 0.56}            # the same bar in sigma units per trade (normal approx, see prereg 3)
K_PRIMARY = 9
Z_MDE = ND.inv_cdf(1 - 0.05 / (2 * K_PRIMARY)) + ND.inv_cdf(0.80)
FX_DRIVERS = ['policy', 'rates', 'realYield', 'risk', 'commodity', 'positioning', 'trend']
ASSET_DRIVERS = {'path': 'd_policy', 'usReal': 'd_rates', 'usdOrCcy': 'd_realYield', 'risk': 'd_risk', 'positioning': 'd_positioning', 'trend': 'd_trend'}


# ───────────────────────────── data ─────────────────────────────

def load(variant='adj'):
    e = pd.read_csv(OUT / 'engine_daily.csv', low_memory=False)
    e['date'] = pd.to_datetime(e['date'])
    ccy = e[e['kind'] == 'ccy'].set_index(['date', 'market'])
    mk = e[e['kind'].isin(['pair', 'asset'])].copy()
    dcol = 'dir_adj' if variant == 'adj' else 'dir'
    mk['side'] = mk[dcol].map({'BULLISH': 1, 'BEARISH': -1}).fillna(0).astype(int)
    mk['score'] = mk['score'].astype(float)
    mk['strength'] = mk['strength'].astype(float)
    o = pd.read_parquet(OUT / 'outcomes.parquet')
    o['date'] = pd.to_datetime(o['date'])
    # NZDCHF has no bid/ask file: its 5/20-day spread is charged at NZDCAD's measured median (0.031% round trip)
    nz = o['market'] == 'NZDCHF'
    for h in (5, 20):
        o.loc[nz, f'c{h}'] = 0.00031 / o.loc[nz, 'sigma']
    d = mk.merge(o, on=['date', 'market'], how='inner')
    d['group'] = d['market'].map(GROUP)
    d = d[d['group'].notna()].copy()
    bd = pd.bdate_range(START, LOCKBOX)
    bpos = pd.Series(np.arange(len(bd)), index=bd)
    d['block'] = (bpos.reindex(d['date']).to_numpy() // BLOCK).astype(int)
    d['period'] = np.where(d['date'] >= HOLDOUT_START, 'holdout', 'discovery')
    # driver sides
    for k in FX_DRIVERS:
        cc = ccy[f'd_{k}'].apply(pd.to_numeric, errors='coerce')
        b = cc.reindex(pd.MultiIndex.from_arrays([d['date'], d['market'].str[:3]])).to_numpy()
        q = cc.reindex(pd.MultiIndex.from_arrays([d['date'], d['market'].str[3:6]])).to_numpy()
        d[f'drv_{k}'] = np.where(d['group'] == 'fx', np.sign(b - q), np.nan)
    for k, col in ASSET_DRIVERS.items():
        d[f'drv_{k}'] = np.where(d['group'] != 'fx', np.sign(pd.to_numeric(d[col], errors='coerce')), np.nan)
    return d


def rows_h(d, h):
    x = d[np.isfinite(d[f'o{h}']) & np.isfinite(d['sigma']) & (d['sigma'] > 0)].copy()
    x['o'] = x[f'o{h}']
    x['c'] = x[f'c{h}']
    x['pup'] = x[f'pup{h}']
    x['mu'] = x[f'mu{h}']
    return x


# ───────────────────────────── statistics ─────────────────────────────

def cell_parts(x, side):
    """Per-row pieces for side != 0 and o != 0."""
    m = (side != 0) & (x['o'].to_numpy() != 0)
    s = side[m]
    o = x['o'].to_numpy()[m]
    hit = (np.sign(o) == s).astype(float)
    pu = x['pup'].to_numpy()[m]
    exp = np.where(s > 0, pu, 1 - pu)
    r = s * o
    rn = r - x['c'].to_numpy()[m]
    rs = s * (o - x['mu'].to_numpy()[m])
    return m, dict(hit=hit, hx=hit - exp, r=r, rn=rn, rs=rs, block=x['block'].to_numpy()[m])


def cluster_sums(parts):
    blk = parts['block']
    u, inv = np.unique(blk, return_inverse=True)
    S = {k: np.bincount(inv, weights=parts[k], minlength=len(u)) for k in ('hit', 'hx', 'r', 'rn', 'rs')}
    S['n'] = np.bincount(inv, minlength=len(u)).astype(float)
    return S


def boot(S, rng, B=B_BOOT):
    K = len(S['n'])
    if K < 5:
        return None
    W = rng.multinomial(K, np.full(K, 1.0 / K), size=B).astype(float)
    n = W @ S['n']
    out = {k: (W @ S[k]) / np.maximum(n, 1) for k in ('hit', 'hx', 'r', 'rn', 'rs')}
    return out


def summarise(parts, rng, h):
    n = len(parts['hit'])
    if n < 30:
        return {'n': int(n)}
    S = cluster_sums(parts)
    bt = boot(S, rng)
    res = {'n': int(n), 'clusters': int(len(S['n']))}
    for k in ('hit', 'hx', 'r', 'rn', 'rs'):
        est = float(parts[k].mean())
        lo, hi = (np.percentile(bt[k], [2.5, 97.5]) if bt is not None else (np.nan, np.nan))
        se = float(bt[k].std(ddof=1)) if bt is not None else np.nan
        res[k] = {'est': est, 'lo': float(lo), 'hi': float(hi), 'se': se}
    res['rn_per_day'] = res['rn']['est'] / max(h, 1)
    res['p_hx'] = float(2 * (1 - ND.cdf(abs(res['hx']['est'] / res['hx']['se'])))) if res['hx']['se'] > 0 else 1.0
    return res


def block_perm_sides(x, rng):
    """Permute whole 21-session blocks of dates (one permutation for every market, keeping the cross-section), so the
    engine's persistence survives and only its link to the outcomes is broken."""
    dates = np.sort(x['date'].unique())
    bd = pd.Series(np.arange(len(dates)) // BLOCK, index=dates)
    blocks = bd.unique()
    perm = rng.permutation(blocks)
    # map each date to a date in the permuted block at the same offset (wrap if the target block is shorter)
    by_block = {b: dates[bd.to_numpy() == b] for b in blocks}
    mp = {}
    for b, pb in zip(blocks, perm):
        src, tgt = by_block[b], by_block[pb]
        for i, dt in enumerate(src):
            mp[dt] = tgt[i % len(tgt)]
    key = pd.MultiIndex.from_arrays([x['date'], x['market']])
    side_s = pd.Series(x['side'].to_numpy(), index=key)
    side_s = side_s[~side_s.index.duplicated()]
    new_key = pd.MultiIndex.from_arrays([x['date'].map(mp), x['market']])
    return side_s.reindex(new_key).fillna(0).to_numpy().astype(int)


def placebo(x, rng, n=N_PERM):
    vals = []
    for _ in range(n):
        s = block_perm_sides(x, rng)
        _, p = cell_parts(x, s)
        if len(p['hx']) > 30:
            vals.append(float(p['hx'].mean()))
    return np.asarray(vals)


def holm(ps, alpha=0.05):
    order = np.argsort(ps)
    m = len(ps)
    adj = np.empty(m)
    run = 0.0
    for i, j in enumerate(order):
        run = max(run, min(1.0, (m - i) * ps[j]))
        adj[j] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    order = np.argsort(ps)
    ranked = ps[order] * m / (np.arange(m) + 1)
    adj = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(m)
    out[order] = np.minimum(adj, 1)
    return out


# ───────────────────────────── selftest ─────────────────────────────

def selftest():
    """Known answers from outside the pipeline: a synthetic panel with persistent sides; outcomes = noise (zero world)
    or noise + k*side (planted). Under the plant with N(0,1) noise the hit rate is Phi(k) exactly, base rate 0.5."""
    rng = np.random.default_rng(SEED)
    dates = pd.bdate_range('2012-01-02', periods=2400)
    mk = [f'M{i}' for i in range(10)]
    rows = []
    for m in mk:
        flips = rng.random(len(dates)) < 0.05                                       # persistent but stationary side
        s = np.where(np.cumsum(flips) % 2 == 0, 1, -1) * (1 if rng.random() < 0.5 else -1)
        rows.append(pd.DataFrame({'date': dates, 'market': m, 'side': s}))
    x = pd.concat(rows, ignore_index=True)
    x['block'] = (pd.Series(np.arange(len(dates)), index=dates).reindex(x['date']).to_numpy() // BLOCK)
    x['pup'], x['mu'], x['c'] = 0.5, 0.0, 0.0
    common = rng.normal(size=len(dates))
    noise = 0.6 * np.tile(common, len(mk)) + 0.8 * rng.normal(size=len(x))      # unit variance, cross-correlated
    ok = True
    for k, label in ((0.0, 'zero world'), (0.10, 'planted k=0.10')):
        x['o'] = noise + k * x['side']
        _, p = cell_parts(x, x['side'].to_numpy())
        r = summarise(p, rng, 1)
        truth = ND.cdf(k) - 0.5
        inside = r['hx']['lo'] <= truth <= r['hx']['hi']
        print(f'  selftest {label}: hit excess {r["hx"]["est"]:+.4f} [{r["hx"]["lo"]:+.4f}, {r["hx"]["hi"]:+.4f}] truth {truth:+.4f} -> {"ok" if inside else "MISS"}')
        ok &= inside
        if k > 0:
            ok &= r['hx']['lo'] > 0
    # the block placebo must centre on zero in the zero world, and the planted estimate must sit above its 97.5th pct
    x['o'] = noise
    pl0 = placebo(x, rng, 60)
    x['o'] = noise + 0.10 * x['side']
    pl1 = placebo(x, rng, 60)
    _, p1 = cell_parts(x, x['side'].to_numpy())
    print(f'  selftest block placebo: zero world mean {pl0.mean():+.4f} sd {pl0.std():.4f}; planted world mean {pl1.mean():+.4f}, planted estimate {p1["hx"].mean():+.4f} vs p97.5 {np.percentile(pl1, 97.5):+.4f}')
    ok &= abs(pl0.mean()) < 0.01 and p1['hx'].mean() > np.percentile(pl1, 97.5)
    # lookahead canary: sides that know the outcome sign must show a huge hit excess
    _, p = cell_parts(x, np.sign(x['o'].to_numpy()).astype(int))
    ok &= p['hx'].mean() > 0.4
    if not ok:
        print('SELFTEST FAILED')
        sys.exit(3)
    print('run.py SELFTEST PASSED')


# ───────────────────────────── power (control sample) ─────────────────────────────

def power_table(d, rng):
    tab = {}
    for h in HORIZONS:
        X = rows_h(d, h)
        X = X[X['period'] == 'discovery']
        for g in GROUPS:
            x = X[X['group'] == g]
            pl = placebo(x, rng, 200)
            called = int(((x['side'] != 0) & (x['o'] != 0)).sum())
            se = float(pl.std(ddof=1)) if len(pl) > 2 else float('nan')
            tab[f'{HNAME[h]}|{g}'] = {'n_called': called, 'clusters': int(x['block'].nunique()), 'se_placebo': se,
                                      'mde_hit_excess': Z_MDE * se, 'bar': HIT_BAR[h], 'powered': bool(Z_MDE * se <= HIT_BAR[h])}
            log(HNAME[h], g, tab[f'{HNAME[h]}|{g}'])
    (OUT / 'power_table.json').write_text(json.dumps(tab, indent=1))
    return tab


# ───────────────────────────── the registered run ─────────────────────────────

def verdict_cell(c, mde, bar):
    hx = c['hx']
    gate = (c['holm_p'] < 0.05 and hx['est'] > 0 and c['rn']['lo'] > 0 and c['placebo_pct'] >= 97.5
            and c['halves_pos'] and c.get('holdout_hx', -1) > 0)
    if gate:
        return 'validated'
    stat_only = c['holm_p'] < 0.05 and hx['est'] > 0 and c['placebo_pct'] >= 97.5
    if stat_only:
        return 'context'
    if mde <= bar and hx['hi'] < bar:
        return 'null'
    return 'underpowered'


def main_run():
    rng = np.random.default_rng(SEED)
    d = load('adj')
    ptab = json.loads((OUT / 'power_table.json').read_text())
    cells, results = [], {'primary': {}, 'pooled': {}, 'strength': {}, 'neutral': {}, 'drivers': {}, 'asbuilt': {}, 'holdout': {}}
    # ── primary: group x horizon, discovery
    for h in HORIZONS:
        X = rows_h(d, h)
        for g in GROUPS:
            key = f'{HNAME[h]}|{g}'
            x = X[(X['group'] == g) & (X['period'] == 'discovery')]
            _, p = cell_parts(x, x['side'].to_numpy())
            c = summarise(p, rng, h)
            if c['n'] < 30:
                results['primary'][key] = c
                continue
            pl = placebo(x, rng)
            c['placebo'] = {'mean': float(pl.mean()), 'sd': float(pl.std(ddof=1)), 'p97_5': float(np.percentile(pl, 97.5))}
            c['placebo_pct'] = float((pl < c['hx']['est']).mean() * 100)
            mid = x['date'].sort_values().iloc[len(x) // 2]
            hv = []
            for half in (x[x['date'] <= mid], x[x['date'] > mid]):
                _, ph = cell_parts(half, half['side'].to_numpy())
                hv.append(float(ph['hx'].mean()) if len(ph['hx']) else float('nan'))
            c['halves'] = hv
            c['halves_pos'] = bool(all(v > 0 for v in hv))
            xh = X[(X['group'] == g) & (X['period'] == 'holdout')]
            _, ph = cell_parts(xh, xh['side'].to_numpy())
            ch = summarise(ph, rng, h)
            results['holdout'][key] = ch
            c['holdout_hx'] = ch['hx']['est'] if 'hx' in ch else float('nan')
            c['call_share'] = float((x['side'] != 0).mean())
            results['primary'][key] = c
            log('primary', key, f"n {c['n']} hit {c['hit']['est']:.4f} hx {c['hx']['est']:+.4f} [{c['hx']['lo']:+.4f},{c['hx']['hi']:+.4f}] Rnet {c['rn']['est']:+.4f} placebo pct {c['placebo_pct']:.1f}")
    keys = [k for k in results['primary'] if 'hx' in results['primary'][k]]
    adj = holm(np.array([results['primary'][k]['p_hx'] for k in keys]))
    for k, a in zip(keys, adj):
        c = results['primary'][k]
        c['holm_p'] = float(a)
        mde = ptab[k]['mde_hit_excess']
        h = {'sameday': 0, '5d': 5, '20d': 20}[k.split('|')[0]]
        c['mde'] = mde
        c['verdict'] = verdict_cell(c, mde, HIT_BAR[h])
        cells.append({'name': k, 'n': c['n'], 'hit': c['hit']['est'], 'est': c['hx']['est'], 'lo': c['hx']['lo'], 'hi': c['hx']['hi'],
                      'mde': mde, 'bar': HIT_BAR[h], 'p': c['p_hx'], 'holm_p': float(a), 'rnet': c['rn']['est'], 'rnet_lo': c['rn']['lo'],
                      'rnet_hi': c['rn']['hi'], 'rnet_per_day': c['rn_per_day'], 'placebo_pct': c['placebo_pct'], 'halves': c['halves'],
                      'holdout_hx': c['holdout_hx'], 'verdict': c['verdict']})
    # ── pooled all markets per horizon (descriptive headline), discovery and holdout
    for h in HORIZONS:
        X = rows_h(d, h)
        for per in ('discovery', 'holdout', 'all'):
            x = X if per == 'all' else X[X['period'] == per]
            _, p = cell_parts(x, x['side'].to_numpy())
            results['pooled'][f'{HNAME[h]}|{per}'] = summarise(p, rng, h)
    # ── S1 strength ladder (all groups pooled and per group), discovery + holdout together, BH
    sp = []
    for h in HORIZONS:
        X = rows_h(d, h)
        for g in ['all'] + GROUPS:
            x = X if g == 'all' else X[X['group'] == g]
            lad = {}
            for name, lo_, hi_ in (('3-4', 3, 4), ('5-6', 5, 6), ('7-10', 7, 10)):
                xx = x[(x['strength'] >= lo_) & (x['strength'] <= hi_)]
                _, p = cell_parts(xx, xx['side'].to_numpy())
                lad[name] = summarise(p, rng, h)
            m, p = cell_parts(x, x['side'].to_numpy())
            st = x['strength'].to_numpy()[m]
            # slope of hit excess on strength, cluster bootstrap
            if len(st) > 50:
                S_blk = p['block']
                u, inv = np.unique(S_blk, return_inverse=True)
                sx = np.bincount(inv, st, len(u)); sy = np.bincount(inv, p['hx'], len(u))
                sxx = np.bincount(inv, st * st, len(u)); sxy = np.bincount(inv, st * p['hx'], len(u)); n_ = np.bincount(inv, minlength=len(u)).astype(float)
                def slope(w):
                    N, X1, Y1, XX, XY = w @ n_, w @ sx, w @ sy, w @ sxx, w @ sxy
                    return (XY - X1 * Y1 / N) / (XX - X1 * X1 / N)
                est = float(slope(np.ones(len(u))))
                W = rng.multinomial(len(u), np.full(len(u), 1 / len(u)), size=B_BOOT).astype(float)
                bs = np.array([slope(w) for w in W])
                se = bs.std(ddof=1)
                ps = float(2 * (1 - ND.cdf(abs(est / se)))) if se > 0 else 1.0
                lad['slope_per_strength_point'] = {'est': est, 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)), 'p': ps}
                sp.append((f'{HNAME[h]}|{g}', ps))
            results['strength'][f'{HNAME[h]}|{g}'] = lad
    if sp:
        q = bh([p for _, p in sp])
        for (k, _), qq in zip(sp, q):
            results['strength'][k]['slope_per_strength_point']['bh_q'] = float(qq)
    # ── S2 neutral abstention: what the Neutral days would have scored on sign(score), vs the called days
    for h in HORIZONS:
        X = rows_h(d, h)
        xn = X[(X['side'] == 0) & (X['score'] != 0)]
        _, pn = cell_parts(xn, np.sign(xn['score'].to_numpy()).astype(int))
        _, pc = cell_parts(X, X['side'].to_numpy())
        rn_, rc_ = summarise(pn, rng, h), summarise(pc, rng, h)
        # paired difference by cluster bootstrap
        Sc, Sn = cluster_sums(pc), cluster_sums(pn)
        uc, un = np.unique(pc['block']), np.unique(pn['block'])
        allb = np.union1d(uc, un)
        def expand(S, u):
            out = {k: np.zeros(len(allb)) for k in S}
            ix = np.searchsorted(allb, u)
            for k in S:
                out[k][ix] = S[k]
            return out
        Ec, En = expand(Sc, uc), expand(Sn, un)
        W = rng.multinomial(len(allb), np.full(len(allb), 1 / len(allb)), size=B_BOOT).astype(float)
        diff = (W @ Ec['hx']) / np.maximum(W @ Ec['n'], 1) - (W @ En['hx']) / np.maximum(W @ En['n'], 1)
        est = rc_['hx']['est'] - rn_['hx']['est'] if 'hx' in rn_ else float('nan')
        results['neutral'][HNAME[h]] = {'neutral_share': float((X['side'] == 0).mean()), 'neutral_signed': rn_, 'called': rc_,
                                        'abstention_value_hx': {'est': est, 'lo': float(np.percentile(diff, 2.5)), 'hi': float(np.percentile(diff, 97.5)),
                                                                'p': float(2 * (1 - ND.cdf(abs(est / diff.std(ddof=1)))))}}
    q = bh([results['neutral'][HNAME[h]]['abstention_value_hx']['p'] for h in HORIZONS])
    for h, qq in zip(HORIZONS, q):
        results['neutral'][HNAME[h]]['abstention_value_hx']['bh_q'] = float(qq)
    # ── S3 driver decomposition (each driver alone, as the engine signs it), BH across all cells
    dp = []
    for h in HORIZONS:
        X = rows_h(d, h)
        for g in GROUPS:
            x = X[X['group'] == g]
            names = FX_DRIVERS if g == 'fx' else list(ASSET_DRIVERS)
            for k in names:
                s = x[f'drv_{k}'].fillna(0).to_numpy().astype(int)
                if (s != 0).sum() < 100:
                    continue
                _, p = cell_parts(x, s)
                r = summarise(p, rng, h)
                r['active_share'] = float((s != 0).mean())
                results['drivers'][f'{HNAME[h]}|{g}|{k}'] = r
                dp.append((f'{HNAME[h]}|{g}|{k}', r['p_hx']))
    q = bh([p for _, p in dp])
    for (k, _), qq in zip(dp, q):
        results['drivers'][k]['bh_q'] = float(qq)
    # ── S4 sensitivity: the engine's labels exactly as built (data momentum counted as missing)
    da = load('asbuilt')
    for h in HORIZONS:
        X = rows_h(da, h)
        for g in GROUPS:
            x = X[(X['group'] == g) & (X['period'] == 'discovery')]
            _, p = cell_parts(x, x['side'].to_numpy())
            r = summarise(p, rng, h)
            r['call_share'] = float((x['side'] != 0).mean())
            results['asbuilt'][f'{HNAME[h]}|{g}'] = r
    # ── evidence packs (one per horizon, all markets, every pre-lockbox row the engine called)
    packs = {}
    for h in HORIZONS:
        X = rows_h(d, h)
        X = X[(X['side'] != 0) & (X['o'] != 0)]
        rows = pd.DataFrame({'date': X['date'], 'inst': X['market'], 'signal': X['score'], 'side': X['side'],
                             'outcome': X['o'] - X['mu'], 'cost': X['c'], 'cluster': X['block']})
        est_fn = lambda r: float((r['side'] * r['outcome']).mean())
        real = est_fn(rows)
        def plant(r, eff, g, real=real):
            r = r.copy()
            r['outcome'] = r['outcome'] - real * r['side'] + eff * r['side']   # the real effect removed first, then the plant
            return r
        def leak(r, g):
            return r.assign(side=np.sign(r['outcome']).astype(int))
        pk = build_pack(rows, slug=f'bias-engine-backtest-{HNAME[h]}', out=str(OUT / 'evidence' / HNAME[h]), estimate_fn=est_fn,
                        bar=R_BAR[h], unit='sigma (drift-adjusted, per call)', plant_fn=plant, leak_fn=leak, seed=SEED, B=1000,
                        n_placebo=300, n_plants=30,
                        notes='Outcome = signed move in trailing-60-day daily sigma minus the point-in-time B0 drift; cost = real spread in sigma. '
                              'Row-level shuffled placebo here; the registered gate uses the 21-session block permutation in RESULTS.md.')
        packs[HNAME[h]] = {'diagnosis': pk['diagnosis']['label'], 'estimate': pk['estimate'], 'ci': pk['ci'], 'net_of_cost': pk.get('net_of_cost'),
                           'placebo': pk['placebo'], 'without_top1pct': pk.get('without_top1pct'), 'positive_control': pk['positive_control'],
                           'lookahead_canary': pk.get('lookahead_canary'), 'by_half': pk['by_half']}
        log('pack', HNAME[h], pk['diagnosis']['label'])
    results['packs'] = packs
    results['cells'] = cells
    pd.DataFrame(cells).to_csv(OUT / 'cells.csv', index=False)
    (OUT / 'results_full.json').write_text(json.dumps(results, indent=1, default=float))
    log('done; cells:')
    for c in cells:
        print(f"  {c['name']:12s} n {c['n']:6d} hit {c['hit']:.3f} hx {c['est']:+.4f} [{c['lo']:+.4f},{c['hi']:+.4f}] MDE {c['mde']:.4f} Rnet {c['rnet']:+.4f} [{c['rnet_lo']:+.4f},{c['rnet_hi']:+.4f}] holm {c['holm_p']:.3f} pl {c['placebo_pct']:.0f} -> {c['verdict']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--power', action='store_true')
    a = ap.parse_args()
    selftest()
    if a.selftest:
        return
    if a.power:
        d = load('adj')
        power_table(d, np.random.default_rng(SEED))
        return
    main_run()


if __name__ == '__main__':
    main()
