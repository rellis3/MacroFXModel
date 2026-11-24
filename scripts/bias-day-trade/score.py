"""bias-day-trade scorer (forge/BIAS_DAY_TRADE_PREREG.md, seed 20261124).

Signal: analysis/output/bias-engine-backtest/engine_daily.csv rebuilt with BEB_ISSUE_HHMM=0000 (the V1 replay issued at
00:00 London; see scripts/bias-day-trade/README.md). Fills: OANDA bid/ask M1 from the main checkout (BEB_DATA_ROOT).
    python -X utf8 -I scripts/bias-day-trade/score.py
Writes analysis/output/bias-day-trade/{results.json, rows.parquet} and prints the report.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
MAIN = Path(os.environ.get('BEB_DATA_ROOT', ROOT))
OUT = ROOT / 'analysis' / 'output' / 'bias-day-trade'
ENGINE = ROOT / 'analysis' / 'output' / 'bias-engine-backtest' / 'engine_daily.csv'
SEED, B, BLOCK, NPLAC, NPLANT = 20261124, 2000, 21, 500, 200
START, END = pd.Timestamp('2016-10-24'), pd.Timestamp('2026-08-20')
CUT_UTC = pd.Timestamp('2026-08-21 00:00')
ND = NormalDist()
DAYNS, MINNS = 86_400 * 10**9, 60 * 10**9
CCYP = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY']
FX = [CCYP[i] + CCYP[j] for i in range(8) for j in range(i + 1, 8) if CCYP[i] + CCYP[j] != 'NZDCHF']
IDX = {'NQ': 'nq', 'SPX500': 'spx', 'US30': 'dow', 'US2000': 'us2000', 'DE30': 'dax', 'UK100': 'uk100'}
KEY = {**{p: p.lower() for p in FX}, 'GOLD': 'gold', **IDX}
GROUP = {**{p: 'fx' for p in FX}, 'GOLD': 'gold', **{k: 'idx' for k in IDX}}
BAR = {'E21': 0.04, 'E24': 0.05}
LOG: list[str] = []


def say(s=''):
    print(s, flush=True)
    LOG.append(str(s))


# ───────────────────────────── outcomes per market ─────────────────────────────

def london_ns(t_ns):
    """UTC ns -> London wall-clock ns (vectorised via pandas, one call per file)."""
    t = pd.DatetimeIndex(t_ns).tz_localize('UTC').tz_convert('Europe/London').tz_localize(None)
    return t.asi8


def ny_key(t_ns):
    t = pd.DatetimeIndex(t_ns).tz_localize('UTC').tz_convert('America/New_York').tz_localize(None)
    return (t.asi8 + 7 * 3600 * 10**9) // DAYNS        # NY trading day labelled by its 17:00 close date


def market_table(market):
    p = MAIN / 'data' / 'm1_bidask' / f'{KEY[market]}_m1.parquet'
    tb = pq.read_table(p, columns=['time', 'bid_o', 'ask_o', 'bid_c', 'ask_c'])
    t = pd.DatetimeIndex(tb.column('time').to_numpy()).as_unit('ns')     # files are timestamp[us]: day math below is ns
    keep = t < CUT_UTC
    t = t[keep]
    a = {c: tb.column(c).to_numpy()[keep].astype(float) for c in ['bid_o', 'ask_o', 'bid_c', 'ask_c']}
    assert t.max() < CUT_UTC, 'LOCKBOX BREACH'
    ord_ = np.argsort(t.asi8, kind='stable')
    tn = t.asi8[ord_]
    a = {k: v[ord_] for k, v in a.items()}
    ln = london_ns(tn)
    ld, mod = ln // DAYNS, (ln % DAYNS) // MINNS                    # London day number, minute of day
    # σ: NY-close daily log returns of the mid close
    nk = ny_key(tn)
    mid_c = (a['bid_c'] + a['ask_c']) / 2
    last = np.r_[nk[1:] != nk[:-1], True]
    nyc = pd.Series(mid_c[last], index=nk[last])
    nyc = nyc[pd.to_datetime(nyc.index * DAYNS).dayofweek < 5]
    r = np.log(nyc).diff().dropna()
    sd = r.rolling(60, min_periods=40).std()                        # sd at key k uses returns up to and including k
    df = pd.DataFrame({'ld': ld, 'mod': mod, **a})
    g = df.groupby('ld')
    ent = df[(df['mod'] < 15)].groupby('ld').first()
    x21 = df[(df['mod'] >= 20 * 60 + 30) & (df['mod'] < 21 * 60)].groupby('ld').last()
    lastbar = g.last()
    out = pd.DataFrame(index=ent.index)
    out['eb'], out['ea'] = ent['bid_o'], ent['ask_o']
    out = out.join(x21[['bid_c', 'ask_c']].rename(columns={'bid_c': 'b21', 'ask_c': 'a21'}), how='left')
    out = out.join(lastbar[['bid_c', 'ask_c', 'mod']].rename(columns={'bid_c': 'b24', 'ask_c': 'a24', 'mod': 'm24'}), how='left')
    dates = pd.to_datetime(out.index * DAYNS)
    fri = dates.dayofweek == 4
    ok24 = (out['m24'] >= 23 * 60 + 30) | (fri & (out['m24'] >= 21 * 60))
    out.loc[~ok24, ['b24', 'a24']] = np.nan
    # σ for London day D: NY days whose key < D (the NY close of D-1 is 22:00 London on D-1)
    sk = sd.index.to_numpy()
    pos = np.searchsorted(sk, out.index.to_numpy(), side='left') - 1   # last key strictly < D
    out['sigma'] = np.where(pos >= 0, sd.to_numpy()[np.clip(pos, 0, None)], np.nan)
    out['date'] = dates
    out = out[(out['date'] >= START) & (out['date'] <= END) & (out['date'].dt.dayofweek < 5)]
    mid_e = (out['eb'] + out['ea']) / 2
    # h4-trend side at 00:00 London (prereg A1): H1 mid closes, bar open t (s), closed when t + 3600 <= T
    hk = tn // (3600 * 10**9)
    hlast = np.r_[hk[1:] != hk[:-1], True]
    h1t, h1c = hk[hlast] * 3600, mid_c[hlast]
    T = (pd.DatetimeIndex(out['date']).tz_localize('Europe/London').tz_convert('UTC').asi8 // 10**9)
    res_h4 = np.array([h4_slope(h1t, h1c, int(x)) for x in T], float)
    res = {'date': out['date'].to_numpy(), 'sigma': out['sigma'].to_numpy(), 'h4': res_h4}
    for e in ('21', '24'):
        bx, ax = out[f'b{e}'], out[f'a{e}']
        res[f'g{e}'] = (np.log(((bx + ax) / 2) / mid_e) / out['sigma']).to_numpy()            # long gross R
        res[f'nl{e}'] = (np.log(bx / out['ea']) / out['sigma']).to_numpy()                    # long net R
        res[f'ns{e}'] = (np.log(out['eb'] / ax) / out['sigma']).to_numpy()                    # short net R
    return pd.DataFrame(res).assign(market=market)


def _ema(xs, n=20):
    k, e = 2 / (n + 1), None
    for x in xs:
        e = x if e is None else e + k * (x - e)
    return e


def h4_slope(h1t, h1c, T):
    """Port of js/biasForecasters.js h4Slope: +1 / -1 / 0, NaN with < 24 4h closes."""
    j = np.searchsorted(h1t + 3600, T, side='right')
    t, c = h1t[max(0, j - 320):j], h1c[max(0, j - 320):j]
    if len(t) == 0:
        return np.nan
    k = t // 14400
    last = np.r_[k[1:] != k[:-1], True]
    out = c[last].tolist()
    if len(out) < 24:
        return np.nan
    d = _ema(out) - _ema(out[:-3])
    return 1.0 if d > 0 else -1.0 if d < 0 else 0.0


# ───────────────────────────── stats helpers ─────────────────────────────

def block_ids(dates):
    bd = pd.bdate_range(START, END)
    pos = pd.Series(np.arange(len(bd)), index=bd)
    return (pos.reindex(pd.DatetimeIndex(dates)).to_numpy() // BLOCK).astype(int), int(len(bd) // BLOCK + 1)


def boot_W(nb, rng):
    return rng.multinomial(nb, np.full(nb, 1 / nb), size=B).astype(float)      # i.i.d. block resampling, B x nb


def sums(df, col, nb):
    """per market: (S, N) vectors over blocks for the column (NaN rows skipped)."""
    out = {}
    for m, g in df.groupby('market'):
        v = g[col].to_numpy(float)
        k = np.isfinite(v)
        S = np.bincount(g['blk'].to_numpy()[k], weights=v[k], minlength=nb)
        N = np.bincount(g['blk'].to_numpy()[k], minlength=nb).astype(float)
        out[m] = (S, N)
    return out


def group_val(sn):
    vals = [S.sum() / N.sum() for S, N in sn.values() if N.sum() > 0]
    return float(np.mean(vals)) if vals else float('nan')


def group_boot(sn, W):
    with np.errstate(invalid='ignore', divide='ignore'):
        per = np.stack([(W @ S) / (W @ N) for S, N in sn.values() if N.sum() > 0])
    return np.nanmean(per, axis=0)


def p_two(bt, est):
    se = np.nanstd(bt)
    return float(2 * (1 - ND.cdf(abs(est) / se))) if se > 0 else 1.0


def holm(ps):
    ps = np.asarray(ps, float)
    o = np.argsort(ps)
    adj = np.empty_like(ps)
    run = 0.0
    for r, i in enumerate(o):
        run = max(run, min(1.0, (len(ps) - r) * ps[i]))
        adj[i] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    n = len(ps)
    o = np.argsort(ps)
    thr = q * np.arange(1, n + 1) / n
    ok = ps[o] <= thr
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    passed = np.zeros(n, bool)
    passed[o[:k]] = True
    return passed


# ───────────────────────────── main ─────────────────────────────

def prep(d, sidecol):
    c = d[d[sidecol] != 0].copy()
    c['side'] = c[sidecol].astype(int)
    for x in ('21', '24'):
        c[f'gr{x}'] = c['side'] * c[f'g{x}']
        c[f'with{x}'] = np.where(c['side'] == 1, c[f'nl{x}'], c[f'ns{x}'])
        c[f'agst{x}'] = np.where(c['side'] == 1, c[f'ns{x}'], c[f'nl{x}'])
    return c


def placebo(sub, x, rng):
    idx = {m: g.index.to_numpy() for m, g in sub.groupby('market')}
    vals = np.empty(NPLAC)
    sides = {m: sub.loc[ii, 'side'].to_numpy() for m, ii in idx.items()}
    gs = {m: sub.loc[ii, f'g{x}'].to_numpy() for m, ii in idx.items()}
    for k in range(NPLAC):
        per = []
        for m in idx:
            v = rng.permutation(sides[m]) * gs[m]
            v = v[np.isfinite(v)]
            if len(v):
                per.append(v.mean())
        vals[k] = np.mean(per)
    return vals


def arm(c, name, nb, W, rng):
    say(f'\n================ ARM {name}: called market-days {len(c):,}; by group ' +
        ', '.join(f'{g} {n:,}' for g, n in c.groupby('group').size().items()))
    med = c['date'].median()
    cells, ptests = [], []
    for ex in ('21', '24'):
        for grp in ('fx', 'gold', 'idx'):
            sub = c[c['group'] == grp]
            gv = group_val(sums(sub, f'gr{ex}', nb))
            plc = placebo(sub, ex, rng)
            pct = float((plc < gv).mean() * 100)
            mde = 2.8 * float(np.std(plc))
            row = {'arm': name, 'cell': f'{grp}-E{ex}', 'group': grp, 'exit': f'E{ex}', 'n': int(np.isfinite(sub[f'with{ex}']).sum()),
                   'markets': int(sub['market'].nunique()), 'long_share': float((sub['side'] > 0).mean()), 'gross': gv,
                   'placebo_mean': float(plc.mean()), 'placebo_pct': pct, 'mde': mde, 'bar': BAR[f'E{ex}']}
            for sd_ in ('with', 'agst'):
                col = f'{sd_}{ex}'
                sn = sums(sub, col, nb)
                est = group_val(sn)
                bt = group_boot(sn, W)
                row[sd_] = {'est': est, 'lo': float(np.nanpercentile(bt, 2.5)), 'hi': float(np.nanpercentile(bt, 97.5)),
                            'h1': group_val(sums(sub[sub['date'] <= med], col, nb)),
                            'h2': group_val(sums(sub[sub['date'] > med], col, nb)), 'p': p_two(bt, est)}
                ptests.append((len(cells), sd_, row[sd_]['p']))
            cells.append(row)
    adj = holm([p for _, _, p in ptests])
    for (i, sd_, _), a in zip(ptests, adj):
        cells[i][sd_]['holm'] = float(a)
    for r in cells:
        v = {}
        for sd_ in ('with', 'agst'):
            s = r[sd_]
            plac_ok = r['placebo_pct'] > 97.5 if sd_ == 'with' else r['placebo_pct'] < 2.5
            s['pass'] = bool(s['est'] >= r['bar'] and s['lo'] > 0 and s['h1'] > 0 and s['h2'] > 0 and plac_ok and s['holm'] < 0.05)
            v[sd_] = s['pass']
        r['verdict'] = 'VALIDATED' if any(v.values()) else ('UNDERPOWERED' if r['mde'] > r['bar'] else 'NULL')
        r['validated_side'] = [k for k, ok in v.items() if ok]
    say('CELLS (net R per call; WITH = trade the side, AGAINST = fade it)')
    for r in cells:
        w, a = r['with'], r['agst']
        say(f"  {r['cell']:9s} n {r['n']:6d} long {r['long_share']:.0%}  gross {r['gross']:+.4f} (placebo {r['placebo_mean']:+.4f}, pct {r['placebo_pct']:5.1f})  "
            f"WITH {w['est']:+.4f} [{w['lo']:+.4f},{w['hi']:+.4f}] h {w['h1']:+.3f}/{w['h2']:+.3f} holm {w['holm']:.2f}  "
            f"AGAINST {a['est']:+.4f} [{a['lo']:+.4f},{a['hi']:+.4f}] h {a['h1']:+.3f}/{a['h2']:+.3f}  "
            f"MDE {r['mde']:.3f} bar {r['bar']}  -> {r['verdict']}")
    permk = []
    for ex in ('21', '24'):
        for m, g in c.groupby('market'):
            for sd_ in ('with', 'agst'):
                col = f'{sd_}{ex}'
                sn = sums(g, col, nb)
                bt = group_boot(sn, W[:500])
                permk.append({'arm': name, 'market': m, 'group': GROUP[m], 'exit': f'E{ex}', 'side': sd_, 'n': int(np.isfinite(g[col]).sum()),
                              'est': group_val(sn), 'lo': float(np.nanpercentile(bt, 2.5)), 'hi': float(np.nanpercentile(bt, 97.5)),
                              'gross': float(np.nanmean(g[f'gr{ex}'])), 'long_share': float((g['side'] > 0).mean()),
                              'p_pos': float(np.nanmean(bt <= 0))})
    pm = pd.DataFrame(permk)
    pm['bh'] = False
    for ex in ('E21', 'E24'):
        k = pm['exit'] == ex
        pm.loc[k, 'bh'] = bh(pm.loc[k, 'p_pos'].to_numpy())
    for ex in ('E21', 'E24'):
        e = pm[pm['exit'] == ex]
        say(f'PER MARKET, {ex} (net R per call; one-sided BH q 0.10 over {len(e)} market x side tests, chance ~{0.05 * len(e):.1f})')
        t = e.pivot(index='market', columns='side', values='est').join(e[e['side'] == 'with'].set_index('market')[['n', 'gross', 'long_share']])
        for m, r in t.sort_values('with', ascending=False).iterrows():
            flag = ' '.join(f'BH-{s}' for s in ('with', 'agst') if e[(e.market == m) & (e.side == s)]['bh'].any())
            say(f"  {m:7s} {GROUP[m]:4s} n {int(r['n']):5d} long {r['long_share']:.0%}  gross {r['gross']:+.3f}  with {r['with']:+.3f}  against {r['agst']:+.3f}  {flag}")
        say(f"  BH passes {ex}: {int(e['bh'].sum())}")
    c = c.assign(year=c['date'].dt.year)
    yr = c.groupby(['group', 'year'])[['gr21', 'with21', 'agst21']].mean().round(3)
    say('BY YEAR (E21, pooled rows: gross / with / against)')
    for (g, y), r in yr.iterrows():
        say(f'  {g:4s} {y}  {r.gr21:+.3f} {r.with21:+.3f} {r.agst21:+.3f}')
    if name == 'V1':
        c = c.assign(sband=pd.cut(c['strength'], [0, 4, 6, 99], labels=['3-4', '5-6', '7+']))
        st = c.groupby(['group', 'sband'], observed=True).agg(n=('with21', 'size'), gross=('gr21', 'mean'), w=('with21', 'mean')).round(3)
        say('BY STRENGTH (E21)')
        for (g, s), r in st.iterrows():
            say(f'  {g:4s} {s:4s} n {int(r.n):6d} gross {r.gross:+.3f} with {r.w:+.3f}')
    cost = (c['gr21'] - c['with21']).groupby(c['group']).median()
    say('median round-trip cost in R (E21): ' + ', '.join(f'{g} {v:.3f}' for g, v in cost.items()))
    return {'cells': cells, 'per_market': pm.to_dict('records'), 'median_cost_R': cost.to_dict(),
            'by_year': {f'{g}-{y}': r.to_dict() for (g, y), r in yr.iterrows()}}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    e = pd.read_csv(ENGINE, low_memory=False)
    e['date'] = pd.to_datetime(e['date'])
    e = e[e['kind'].isin(['pair', 'asset']) & e['market'].isin(list(KEY))]
    e['v1'] = e['dir_adj'].map({'BULLISH': 1, 'BEARISH': -1}).fillna(0).astype(int)
    e = e[['date', 'market', 'v1', 'strength']]
    say(f'engine rows {len(e):,}  markets {e.market.nunique()}  dates {e.date.min().date()} .. {e.date.max().date()}')
    frames, cover = [], {}
    for m in KEY:
        t = market_table(m)
        cover[m] = {'sessions': int(len(t)), 'e21': int(np.isfinite(t['nl21']).sum()), 'e24': int(np.isfinite(t['nl24']).sum()),
                    'h4_speaks': int(np.isin(t['h4'], [1, -1]).sum())}
        frames.append(t)
        say(f'  {m:7s} sessions {len(t):5d}  e21 {cover[m]["e21"]:5d}  e24 {cover[m]["e24"]:5d}  h4 {cover[m]["h4_speaks"]:5d}')
    o = pd.concat(frames, ignore_index=True)
    d = o.merge(e, on=['date', 'market'], how='left')
    d['v1'] = d['v1'].fillna(0).astype(int)
    d['h4'] = d['h4'].fillna(0).astype(int)
    d['group'] = d['market'].map(GROUP)
    d['blk'], nb = block_ids(d['date'])
    d = d[np.isfinite(d['sigma'])].reset_index(drop=True)
    d.to_parquet(OUT / 'rows.parquet')
    W = boot_W(nb, rng)

    c1 = prep(d, 'v1')
    fx = c1[c1['group'] == 'fx']
    real = group_boot(sums(fx, 'gr21', nb), W[:NPLANT])
    pl = fx.assign(p=fx['gr21'] + 0.06)
    plant = group_boot(sums(pl, 'p', nb), W[:NPLANT])
    rec = float(np.mean((plant - real) >= 0.8 * 0.06))
    plc_p = placebo(fx.assign(g21=fx['g21'] + 0.06 * fx['side']), '21', rng)
    pct_p = float((plc_p < group_val(sums(pl, 'p', nb))).mean() * 100)
    say(f'PLANT c 0.06 (V1 fx E21): lift {np.nanmean(plant - real):+.4f}, recovered >= 80% in {rec:.1%} of {NPLANT} draws; '
        f'planted value above the random-side placebo at pct {pct_p:.1f}')

    res = {'seed': SEED, 'B': B, 'block': BLOCK, 'placebo_shuffles': NPLAC, 'window': [str(START.date()), str(END.date())],
           'plant': {'c': 0.06, 'recovered_share': rec, 'planted_placebo_pct': pct_p}, 'coverage': cover}
    res['V1'] = arm(c1, 'V1', nb, W, rng)
    res['H4'] = arm(prep(d, 'h4'), 'H4', nb, W, rng)

    both = d[(d['v1'] != 0) & (d['h4'] != 0)]
    say(f'\nHEAD-TO-HEAD (descriptive): market-days where both speak {len(both):,}; agree {float((both.v1 == both.h4).mean()):.1%}')
    h2h = {}
    for grp in ('fx', 'gold', 'idx', 'all'):
        s = both if grp == 'all' else both[both['group'] == grp]
        for ex in ('21', '24'):
            v1w = np.where(s['v1'] == 1, s[f'nl{ex}'], s[f'ns{ex}'])
            h4w = np.where(s['h4'] == 1, s[f'nl{ex}'], s[f'ns{ex}'])
            dd = pd.DataFrame({'market': s['market'].to_numpy(), 'blk': s['blk'].to_numpy(), 'x': v1w - h4w})
            sn = sums(dd, 'x', nb)
            bt = group_boot(sn, W)
            ag = (s['v1'] == s['h4']).to_numpy()
            r = {'n': int(len(s)), 'v1': float(np.nanmean(v1w)), 'h4': float(np.nanmean(h4w)), 'v1_minus_h4': group_val(sn),
                 'lo': float(np.nanpercentile(bt, 2.5)), 'hi': float(np.nanpercentile(bt, 97.5)),
                 'v1_when_agree': float(np.nanmean(v1w[ag])), 'v1_when_disagree': float(np.nanmean(v1w[~ag])), 'agree_share': float(ag.mean())}
            h2h[f'{grp}-E{ex}'] = r
            say(f"  {grp:4s} E{ex}  n {r['n']:6d}  V1 {r['v1']:+.3f}  H4 {r['h4']:+.3f}  V1-H4 {r['v1_minus_h4']:+.3f} [{r['lo']:+.3f},{r['hi']:+.3f}]  "
                f"V1 when agree {r['v1_when_agree']:+.3f} / disagree {r['v1_when_disagree']:+.3f}  (agree {r['agree_share']:.0%})")
    res['head_to_head'] = h2h

    res['lines'] = {'V1': line_part(d, 'v1', rng), 'H4': line_part(d, 'h4', rng)}
    (OUT / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    (OUT / 'run.log').write_text('\n'.join(LOG), encoding='utf-8')


def line_part(d, sidecol, rng):
    t = pd.read_parquet(MAIN / 'analysis' / 'output' / 'trade-at-lines' / 'trades.parquet')
    t = t[(t['pos'] == 0.0)].copy()
    t['date'] = pd.to_datetime(t['date'])
    t = t[(t['date'] >= START) & (t['date'] <= END)]
    long_ = ((t['rule'] == 'FOLLOW') & (t['side'] == 'OH')) | (t['rule'].str.startswith('FADE') & (t['side'] == 'OL'))
    t['dirn'] = np.where(long_, 1, -1)
    sides = d[['date', 'market', sidecol]].rename(columns={'market': 'sym', sidecol: 'bias'})
    t = t.merge(sides, on=['date', 'sym'], how='left')
    t['bias'] = t['bias'].fillna(0).astype(int)
    t['rel'] = np.where(t['bias'] == 0, 'neutral', np.where(t['bias'] == t['dirn'], 'with', 'against'))
    bd = pd.bdate_range(START, END)
    pos = pd.Series(np.arange(len(bd)), index=bd)
    t['blk'] = (pos.reindex(t['date']).to_numpy() // BLOCK).astype(int)
    nb = int(len(bd) // BLOCK + 1)
    W = boot_W(nb, rng)
    med = t['date'].median()
    say(f'\nLINES [{sidecol}]: {len(t):,} trade-at-lines trades (pos 0, 2018 -> 2026-08-20); with {int((t.rel == "with").sum()):,}, '
        f'against {int((t.rel == "against").sum()):,}, neutral bias {int((t.rel == "neutral").sum()):,}')

    def mb(df):
        S = np.bincount(df['blk'], weights=df['netR'], minlength=nb)
        N = np.bincount(df['blk'], minlength=nb).astype(float)
        return S, N

    out, ps = [], []
    for i, rule in enumerate(['FADE-L', 'FADE-Z', 'FOLLOW']):
        a = t[t['rule'] == rule]
        w, ag = a[a['rel'] == 'with'], a[a['rel'] == 'against']
        Sw, Nw = mb(w)
        Sa, Na = mb(a)
        Sg, Ng = mb(ag)
        with np.errstate(invalid='ignore', divide='ignore'):
            bw = (W @ Sw) / (W @ Nw)
            ba = (W @ Sa) / (W @ Na)
            bg = (W @ Sg) / (W @ Ng)
        ew, ea, eg = w['netR'].mean(), a['netR'].mean(), ag['netR'].mean()
        diff = bw - ba
        r = {'cell': f'L{i + 1} {rule}', 'n_all': len(a), 'n_with': len(w), 'n_against': len(ag), 'all': float(ea),
             'with': float(ew), 'with_lo': float(np.nanpercentile(bw, 2.5)), 'with_hi': float(np.nanpercentile(bw, 97.5)),
             'against': float(eg), 'with_minus_all': float(ew - ea), 'diff_lo': float(np.nanpercentile(diff, 2.5)),
             'diff_hi': float(np.nanpercentile(diff, 97.5)), 'with_minus_against': float(ew - eg),
             'wma_lo': float(np.nanpercentile(bw - bg, 2.5)), 'wma_hi': float(np.nanpercentile(bw - bg, 97.5)),
             'h1': float(w[w['date'] <= med]['netR'].mean()), 'h2': float(w[w['date'] > med]['netR'].mean()),
             'by_sym': {s: float(g['netR'].mean()) for s, g in w.groupby('sym')}}
        r['p'] = max(p_two(bw, ew), p_two(diff, ew - ea))
        ps.append(r['p'])
        out.append(r)
    adj = holm(ps)
    for r, a in zip(out, adj):
        r['holm'] = float(a)
        r['pass'] = bool(r['with'] > 0 and r['with_lo'] > 0 and r['h1'] > 0 and r['h2'] > 0 and r['with_minus_all'] >= 0.05
                         and r['diff_lo'] > 0 and a < 0.05)
        r['verdict'] = 'VALIDATED' if r['pass'] else ('NULL' if r['diff_hi'] < 0.05 or r['with_hi'] < 0 else 'UNDERPOWERED')
        say(f"  {r['cell']:10s} all {r['all']:+.3f} (n {r['n_all']})  WITH {r['with']:+.3f} [{r['with_lo']:+.3f},{r['with_hi']:+.3f}] "
            f"n {r['n_with']}  AGAINST {r['against']:+.3f}  with-all {r['with_minus_all']:+.3f} [{r['diff_lo']:+.3f},{r['diff_hi']:+.3f}]  "
            f"with-against {r['with_minus_against']:+.3f} [{r['wma_lo']:+.3f},{r['wma_hi']:+.3f}]  halves {r['h1']:+.3f}/{r['h2']:+.3f}  -> {r['verdict']}")
        say(f"             with by market: " + ', '.join(f'{k} {v:+.3f}' for k, v in r['by_sym'].items()))
    return out


if __name__ == '__main__':
    main()
