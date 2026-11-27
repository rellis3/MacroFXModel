"""ema-regime-line-filter (forge/EMA_REGIME_LINE_FILTER_PREREG.md).

    python -X utf8 scripts/ema-regime-line-filter/run.py [--repo <checkout with data/>]
    -> analysis/output/ema-regime-line-filter/{results.json, run.log, trades_ema.parquet}

Re-runs the trade-at-lines simulation at pos 0 to record each entry minute (parity against the banked trades.parquet),
attaches the 15m / 5m 9-20-50 EMA stack and the 15m EMA20 stretch from bars closed before the entry minute, then scores
the five registered filter cells.
"""
from __future__ import annotations

import argparse
import inspect
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve()
ap = argparse.ArgumentParser()
ap.add_argument('--repo', default=str(HERE.parents[2]))
ap.add_argument('--out', default=str(HERE.parents[2] / 'analysis/output/ema-regime-line-filter'))
A_ = ap.parse_args()
REPO, OUT = Path(A_.repo), Path(A_.out)
for p in (REPO, REPO / 'scripts/ladder-v2', REPO / 'scripts/exhaustion-v2', REPO / 'scripts/trade-at-lines'):
    sys.path.insert(0, str(p))
import score as TAL  # noqa: E402  (trade-at-lines)

SEED, B, BLOCK, NPLC = 20261127, 2000, 21, 500
START, END = pd.Timestamp('2018-01-01'), pd.Timestamp('2026-08-20')
LOG: list[str] = []


def say(s=''):
    print(s, flush=True)
    LOG.append(s)


# the banked sim, returning the entry bar index as well (source-patched so the fill logic is the banked code)
_src = inspect.getsource(TAL.sim).replace('return pnl / R, t0', 'return pnl / R, t0, k')
assert 'return pnl / R, t0, k' in _src
exec(_src, TAL.__dict__)


def resim():
    odds, zs = TAL.XE.odds_tables(), TAL.XE.zone_sigma()
    rows = []
    for sym, key in TAL.SYMS.items():
        arm = TAL.TT.line_arm(sym, 'C')
        T = pd.read_parquet(REPO / f'analysis/output/ladder-v2-{sym.lower()}/test_C.parquet')
        S = sessions(key)
        z50, z75 = zs[sym]
        for _, row in T.iterrows():
            g = S.get(row['date'])
            if g is None or len(g) < 600:
                continue
            A = {c: g[c].to_numpy(float) for c in ('open', 'high', 'low', 'close', 'bid_o', 'bid_h', 'bid_l', 'bid_c',
                                                     'ask_o', 'ask_h', 'ask_l', 'ask_c')}
            o = A['open'][0]
            sO = float(row[arm]) / 100 * o
            for up, q in ((True, 'oh'), (False, 'ol')):
                for t in TAL.RUNGS:
                    pct = float(row[f'{arm}_{q}_{t}']) / 100
                    nxt = (float(row[f'{arm}_{q}_{ {50: 75, 75: 90}[t]}']) / 100 - pct) * o if t < 90 else 0.25 * sO
                    L = o * (1 + pct) if up else o * (1 - pct)
                    for rule in TAL.RULES:
                        r = TAL.sim(rule, up, L, sO, z50, z75, nxt, A)
                        if r is None:
                            continue
                        rows.append({'sym': sym, 'date': row['date'], 'rule': rule, 'rung': t, 'side': 'OH' if up else 'OL',
                                     'netR_re': r[0], 'entry': g.index[r[2]]})
        say(f'{sym}: re-simulated')
    return pd.DataFrame(rows)


def sessions(key):
    d = pd.read_parquet(REPO / f'data/m1_bidask/{key}_m1.parquet')
    d.index = pd.to_datetime(d.pop('time')).dt.tz_localize('UTC')
    d = d[~d.index.duplicated()].sort_index()
    lt = d.index.tz_convert('Europe/London')
    d = d[(lt.hour < 22) & (lt.dayofweek < 5)]
    dd = d.index.tz_convert('Europe/London').tz_localize(None).normalize()
    return {k: g for k, g in d.groupby(dd)}


def ema(x, n):
    return pd.Series(x).ewm(alpha=2 / (n + 1), adjust=False).mean().to_numpy()


def tf_features(key, rule_):
    d = pd.read_parquet(REPO / f'data/m1_bidask/{key}_m1.parquet', columns=['time', 'open', 'high', 'low', 'close'])
    d.index = pd.to_datetime(d.pop('time')).dt.tz_localize('UTC')
    d = d[~d.index.duplicated()].sort_index()
    b = d.resample(rule_, label='left', closed='left').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
    c = b['close'].to_numpy()
    e9, e20, e50 = ema(c, 9), ema(c, 20), ema(c, 50)
    pc = np.r_[np.nan, c[:-1]]
    tr = np.nanmax(np.c_[b['high'] - b['low'], np.abs(b['high'] - pc), np.abs(b['low'] - pc)], axis=1)
    atr = pd.Series(tr).ewm(alpha=1 / 14, adjust=False).mean().to_numpy()
    stack = np.where((e9 > e20) & (e20 > e50), 1, np.where((e9 < e20) & (e20 < e50), -1, 0))
    f = pd.DataFrame({'end': b.index + pd.Timedelta(rule_), 'stack': stack, 'stretch': (c - e20) / atr}).iloc[200:]
    return f.reset_index(drop=True)


def ns(x):
    return pd.Series(x).dt.tz_convert('UTC').dt.tz_localize(None).astype('datetime64[ns]').astype('int64').to_numpy()


def attach(t):
    out = []
    for sym, key in TAL.SYMS.items():
        x = t[t['sym'] == sym].copy()
        for tf in ('15min', '5min'):
            f = tf_features(key, tf)
            fe, xe = ns(f['end']), ns(x['entry'])
            i = np.searchsorted(fe, xe, side='right') - 1
            ok = i >= 0
            tag = tf.replace('min', 'm')
            x[f'stack{tag}'] = np.where(ok, f['stack'].to_numpy()[np.maximum(i, 0)], 0)
            x[f'stretch{tag}'] = np.where(ok, f['stretch'].to_numpy()[np.maximum(i, 0)], np.nan)
            age = (xe - fe[np.maximum(i, 0)]) / 6e10
            x[f'age{tag}'] = age
        out.append(x)
    return pd.concat(out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    bank = pd.read_parquet(REPO / 'analysis/output/trade-at-lines/trades.parquet')
    bank = bank[bank['pos'] == 0.0]
    re = resim()
    m = bank.merge(re, on=['sym', 'date', 'rule', 'rung', 'side'], how='outer', indicator=True)
    bad = (m['_merge'] != 'both').sum()
    diff = np.nanmax(np.abs(m['netR'] - m['netR_re']))
    say(f'parity: {len(bank):,} banked pos-0 trades, {len(re):,} re-simulated, unmatched {bad}, max |netR diff| {diff:.2e}')
    if bad or not diff < 1e-9:
        raise SystemExit('PARITY FAILED: stop (prereg)')
    t = m[m['_merge'] == 'both'].drop(columns=['_merge', 'netR_re'])
    t['date'] = pd.to_datetime(t['date'])
    t = t[(t['date'] >= START) & (t['date'] <= END)].copy()
    t['dirn'] = np.where(((t['rule'] == 'FOLLOW') & (t['side'] == 'OH')) | (t['rule'].str.startswith('FADE') & (t['side'] == 'OL')), 1, -1)
    t = attach(t)
    say(f'features: max bar age at entry 15m {t["age15m"].max():.0f} min (median {t["age15m"].median():.0f}), '
        f'5m {t["age5m"].max():.0f} (median {t["age5m"].median():.0f}); min age 15m {t["age15m"].min():.0f}, 5m {t["age5m"].min():.0f}')
    t['with'] = (t['stack15m'] == t['dirn']) & (t['stack5m'] == t['dirn'])
    t['against'] = (t['stack15m'] == -t['dirn']) & (t['stack5m'] == -t['dirn'])
    t['run_stretch'] = -t['dirn'] * t['stretch15m']
    fades = t['rule'].str.startswith('FADE')
    t['stretch_terc'] = np.nan
    for sym in TAL.SYMS:
        mk = fades & (t['sym'] == sym)
        q = t.loc[mk, 'run_stretch'].quantile([1 / 3, 2 / 3]).to_numpy()
        t.loc[mk, 'stretch_terc'] = np.digitize(t.loc[mk, 'run_stretch'], q) + 1
    t.to_parquet(OUT / 'trades_ema.parquet')

    bd = pd.bdate_range(START, END)
    pos = pd.Series(np.arange(len(bd)), index=bd)
    t['blk'] = (pos.reindex(t['date']).to_numpy() // BLOCK).astype(int)
    nb = int(len(bd) // BLOCK + 1)
    W = np.stack([np.bincount(rng.integers(0, nb, nb), minlength=nb) for _ in range(B)]).astype(float)

    def boot(df):
        S = np.bincount(df['blk'], weights=df['netR'], minlength=nb)
        N = np.bincount(df['blk'], minlength=nb).astype(float)
        with np.errstate(invalid='ignore', divide='ignore'):
            return (W @ S) / (W @ N)

    def p_two(b, est):
        return float(min(1.0, 2 * min(np.mean(b <= 0), np.mean(b >= 0)))) if est is not None else 1.0

    cells = [('E1', 'FADE-L', 'with'), ('E2', 'FADE-Z', 'with'), ('E3', 'FOLLOW', 'with'),
             ('E4', 'FADE-L', 'stretched'), ('E5', 'FADE-Z', 'stretched')]
    res = {'seed': SEED, 'B': B, 'block': BLOCK, 'n_trades': int(len(t)), 'cells': {}, 'descriptive': {}}
    say(f'\n{len(t):,} trades 2018 -> 2026-08-20 (pos 0). Filter share: stacked-with {t["with"].mean():.1%}, stacked-against {t["against"].mean():.1%}')
    say('\n== registered cells (net R per trade; 95% CIs, 21-session blocks)')
    ps, rows = [], []
    for cid, rule, kind in cells:
        a = t[t['rule'] == rule]
        keep = a['with'] if kind == 'with' else a['stretch_terc'] == 3
        k = a[keep]
        bk, ba = boot(k), boot(a)
        ek, ea = k['netR'].mean(), a['netR'].mean()
        med = k['date'].median()
        # random filters, same keep count per market
        plc = []
        prng = np.random.default_rng(SEED + int(cid[1]))
        by = {s: (g['netR'].to_numpy(), int(keep[g.index].sum())) for s, g in a.groupby('sym')}
        tot_all = ea
        for _ in range(NPLC):
            s_, n_ = 0.0, 0
            for s, (x, nk) in by.items():
                idx = prng.choice(len(x), nk, replace=False)
                s_ += x[idx].sum(); n_ += nk
            plc.append(s_ / n_ - tot_all)
        plc = np.array(plc)
        r = {'cell': cid, 'rule': rule, 'filter': kind, 'n_all': len(a), 'n_kept': len(k), 'keep_share': len(k) / len(a),
             'all': float(ea), 'kept': float(ek), 'kept_lo': float(np.nanpercentile(bk, 2.5)), 'kept_hi': float(np.nanpercentile(bk, 97.5)),
             'kept_minus_all': float(ek - ea), 'd_lo': float(np.nanpercentile(bk - ba, 2.5)), 'd_hi': float(np.nanpercentile(bk - ba, 97.5)),
             'h1': float(k[k['date'] <= med]['netR'].mean()), 'h2': float(k[k['date'] > med]['netR'].mean()),
             'placebo_pct': float((plc < ek - ea).mean() * 100),
             'by_sym': {s: float(g['netR'].mean()) for s, g in k.groupby('sym')}}
        r['p'] = max(p_two(bk, ek), p_two(bk - ba, ek - ea))
        ps.append(r['p']); rows.append(r)
    o = np.argsort(ps); m_ = len(ps); adj = np.empty(m_); run = 0
    for rnk, i in enumerate(o):
        run = max(run, min(1, (m_ - rnk) * ps[i])); adj[i] = run
    for r, a_ in zip(rows, adj):
        r['holm'] = float(a_)
        ok = (r['kept'] > 0 and r['kept_lo'] > 0 and r['h1'] > 0 and r['h2'] > 0 and r['kept_minus_all'] >= 0.05 and r['d_lo'] > 0
              and r['placebo_pct'] > 97.5 and a_ < 0.05)
        r['verdict'] = 'VALIDATED' if ok else ('NULL' if r['kept_hi'] < 0.05 else 'UNDERPOWERED')
        res['cells'][r['cell']] = r
        say(f"  {r['cell']} {r['rule']:6} {r['filter']:9} all {r['all']:+.3f} (n {r['n_all']:,})  KEPT {r['kept']:+.3f} "
            f"[{r['kept_lo']:+.3f},{r['kept_hi']:+.3f}] n {r['n_kept']:,} ({r['keep_share']:.0%})  kept-all {r['kept_minus_all']:+.3f} "
            f"[{r['d_lo']:+.3f},{r['d_hi']:+.3f}]  rand pct {r['placebo_pct']:.0f}  halves {r['h1']:+.3f}/{r['h2']:+.3f}  holm {a_:.3f} -> {r['verdict']}")
        say('       by market: ' + ', '.join(f'{k_} {v:+.3f}' for k_, v in r['by_sym'].items()))

    say('\n== descriptive (not judged)')
    d = {}
    for rule in ('FADE-L', 'FADE-Z', 'FOLLOW'):
        a = t[t['rule'] == rule]
        row = {'all': a['netR'].mean(), 'with': a[a['with']]['netR'].mean(), 'against': a[a['against']]['netR'].mean(),
               'mixed': a[~a['with'] & ~a['against']]['netR'].mean(),
               'with15only': a[a['stack15m'] == a['dirn']]['netR'].mean(), 'against15only': a[a['stack15m'] == -a['dirn']]['netR'].mean(),
               'n_with': int(a['with'].sum()), 'n_against': int(a['against'].sum())}
        if rule != 'FOLLOW':
            row['stretch_terciles'] = {int(k_): float(g['netR'].mean()) for k_, g in a.groupby('stretch_terc')}
        else:
            q = a['run_stretch'].quantile([1 / 3, 2 / 3]).to_numpy()
            row['stretch_terciles'] = {int(k_): float(g['netR'].mean()) for k_, g in a.groupby(np.digitize(a['run_stretch'], q) + 1)}
        row['with_by_sym'] = {s: float(g['netR'].mean()) for s, g in a[a['with']].groupby('sym')}
        row['against_by_sym'] = {s: float(g['netR'].mean()) for s, g in a[a['against']].groupby('sym')}
        d[rule] = row
        say(f"  {rule:6} all {row['all']:+.3f} | stacked with {row['with']:+.3f} (n {row['n_with']:,}) against {row['against']:+.3f} "
            f"(n {row['n_against']:,}) mixed {row['mixed']:+.3f} | 15m only with {row['with15only']:+.3f} against {row['against15only']:+.3f} "
            f"| run-stretch terciles " + '/'.join(f'{v:+.3f}' for v in row['stretch_terciles'].values()))
        say(f"         with by market {', '.join(f'{k_} {v:+.3f}' for k_, v in row['with_by_sym'].items())}; "
            f"against by market {', '.join(f'{k_} {v:+.3f}' for k_, v in row['against_by_sym'].items())}")
    res['descriptive'] = d
    (OUT / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    (OUT / 'run.log').write_text('\n'.join(LOG) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
