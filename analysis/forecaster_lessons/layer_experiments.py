#!/usr/bin/env python3
"""
Layer experiments on the Level-Atlas vote book (vp2.json), Lesson 03's architecture:
keep the forecasting layer fixed, and test the DECISION layers one at a time,
walk-forward, with rules fixed before the test period is seen.

  E1  Meta-labelling (López de Prado): a secondary model, trained only on trades
      RESOLVED before the test window opens, predicts each trade's R from features
      known at entry. Policies: skip predicted R<=0; size ∝ clipped prediction.
  E2  Sizing by vote margin, learnt walk-forward (mean R per margin bucket, shrunk).
  E3  Risk layer: drawdown throttle (current, path-based) vs volatility targeting
      (EWMA forecast of book vol, Lesson 3 / Kelly μ/σ²) vs both — compared at
      EQUAL realised volatility so the comparison is Sharpe/DD, not leverage.
  E4  Instrument pruning, walk-forward (drop pairs whose trailing t-stat < 0) —
      the honest version of in-sample pair selection.

All results are on trade-level net R (the per-pair flat cost is already in pnlPct),
aggregated to daily book returns at 0.5% risk per trade.

Usage: python3 analysis/forecaster_lessons/layer_experiments.py [vp2.json] [--json out]
"""
import json, math, sys
from collections import defaultdict
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'vp2.json'
OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
ANN = 252
RISK = 0.5                                                     # % equity per 1R

d = json.load(open(SRC))
T = sorted(d['trades'], key=lambda t: t['time'])
dates = [e['date'] for e in d['equityCurve']]
didx = {x: i for i, x in enumerate(dates)}
ND = len(dates)
INST = sorted({t['instrument'] for t in T})
med_stop = {i: np.median([t['stopPips'] for t in T if t['instrument'] == i]) for i in INST}


def daily(trades, w=None):
    out = np.zeros(ND)
    for k, t in enumerate(trades):
        out[didx[t['date']]] += t['rMultiple'] * RISK / 100 * (1.0 if w is None else w[k])
    return out


def metrics(r, label=''):
    r = np.asarray(r)
    s = r.std(ddof=1)
    c = np.cumsum(r); dd = (c - np.maximum.accumulate(np.concatenate([[0], c]))[1:]).min()
    sh = r.mean() / s * math.sqrt(ANN) if s > 0 else 0
    return dict(label=label, sharpe=round(sh, 3), ann_ret=round(r.mean() * ANN * 100, 1),
                ann_vol=round(s * math.sqrt(ANN) * 100, 1), maxdd=round(dd * 100, 1),
                calmar=round(r.mean() * ANN / -dd, 2) if dd < 0 else None,
                log_growth=round(float(np.log1p(r).sum()), 3))


def at_vol(r, target=0.10):
    s = np.std(r, ddof=1) * math.sqrt(ANN)
    return np.asarray(r) * (target / s)


# ── features known at entry ────────────────────────────────────────────────
def build_features(trades):
    hist = defaultdict(list)          # instrument -> list of (resolveTime, R)
    allhist = []
    X = []
    for t in trades:
        h = [R for (rt, R) in hist[t['instrument']] if rt < t['time']][-60:]
        a = [R for (rt, R) in allhist[-400:] if rt < t['time']][-200:]
        hour = (t['time'] % 86400) // 3600
        dow = ((t['time'] // 86400) + 4) % 7
        X.append([
            INST.index(t['instrument']),
            1 if t['decision'] == 'follow' else 0,
            1 if t['rung'] == 'p75' else 0,
            {'Asia': 0, 'London': 1, 'NY': 2}[t['session']],
            1 if t['side'] == 'up' else 0,
            t['margin'],
            t['targetPips'] / t['stopPips'] if t['stopPips'] else 1,
            t['stopPips'] / med_stop[t['instrument']],                # vol state of the pair
            hour, dow,
            np.mean(h) if len(h) >= 10 else 0.0,                      # pair's recent edge
            np.mean(a) if len(a) >= 50 else 0.0,                      # book's recent edge
        ])
        hist[t['instrument']].append((t['resolveTime'], t['rMultiple']))
        allhist.append((t['resolveTime'], t['rMultiple']))
    return np.array(X, dtype=float)


X = build_features(T)
y = np.array([t['rMultiple'] for t in T])
time = np.array([t['time'] for t in T]); rtime = np.array([t['resolveTime'] for t in T])
qtr = np.array([f"{t['date'][:4]}Q{(int(t['date'][5:7]) - 1) // 3 + 1}" for t in T])
QS = sorted(set(qtr))
TEST_QS = QS[4:]                                               # first ~year is training only
test_mask = np.isin(qtr, TEST_QS)

# ── E1 meta-labelling ──────────────────────────────────────────────────────
pred = np.full(len(T), np.nan)
for q in TEST_QS:
    m_test = qtr == q
    t0 = time[m_test].min()
    m_train = rtime < t0                                       # only RESOLVED before window opens
    mdl = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_leaf_nodes=15,
                                        min_samples_leaf=200, l2_regularization=1.0,
                                        categorical_features=[0, 3], random_state=0)
    mdl.fit(X[m_train], y[m_train])
    pred[m_test] = mdl.predict(X[m_test])

base_tr = [t for t, m in zip(T, test_mask) if m]
p_test = pred[test_mask]; y_test = y[test_mask]
ic = float(np.corrcoef(p_test, y_test)[0, 1])
# rank IC + decile table
order = np.argsort(p_test); dec = np.array_split(order, 10)
dec_rows = [dict(decile=i + 1, n=len(ix), pred=float(p_test[ix].mean()), realised=float(y_test[ix].mean())) for i, ix in enumerate(dec)]
keep = p_test > 0
w_size = np.clip(p_test / max(np.median(p_test[p_test > 0]), 1e-6), 0, 2.0)
r_base = daily(base_tr)
r_skip = daily(base_tr, keep.astype(float))
r_size = daily(base_tr, w_size)
E1 = dict(test_quarters=[TEST_QS[0], TEST_QS[-1]], n_test=int(test_mask.sum()), IC=ic,
          kept_share=float(keep.mean()), meanR_kept=float(y_test[keep].mean()), meanR_dropped=float(y_test[~keep].mean()),
          deciles=dec_rows,
          raw=[metrics(r_base, 'base'), metrics(r_skip, 'meta skip pred<=0'), metrics(r_size, 'meta size∝pred')],
          at10vol=[metrics(at_vol(r_base), 'base@10%'), metrics(at_vol(r_skip), 'skip@10%'), metrics(at_vol(r_size), 'size@10%')])

# ── E2 margin sizing, walk-forward ─────────────────────────────────────────
w_m = np.ones(len(T))
for q in TEST_QS:
    m_test = qtr == q; t0 = time[m_test].min(); m_train = rtime < t0
    gm = y[m_train].mean()
    for mg in range(3, 13):
        mm = m_train & (np.minimum(X[:, 5], 8) == min(mg, 8))
        n = mm.sum()
        mu = (y[mm].sum() + 200 * gm) / (n + 200) if n else gm          # shrink to global mean
        w_m[m_test & (X[:, 5] == mg)] = max(mu, 0) / gm if gm > 0 else 1
w_m_test = w_m[test_mask] / w_m[test_mask].mean()
r_marg = daily(base_tr, w_m_test)
E2 = dict(raw=metrics(r_marg, 'margin-sized'), at10vol=metrics(at_vol(r_marg), 'margin-sized@10%'))

# ── E3 risk layer on the FULL history (no fitting beyond fixed constants) ──
r_all = daily(T)                                               # unthrottled book


def dd_throttle(r, tiers=((-4, .65), (-6, .40), (-8, .25)), restore=-2):
    """Graded drawdown throttle, as in vp2.json (fixed, path-based)."""
    out = np.zeros_like(r); eq = 0.0; peak = 0.0; mult = 1.0
    for i, x in enumerate(r):
        out[i] = x * mult                                      # today's size was set yesterday
        eq += out[i]; peak = max(peak, eq); ddp = (eq - peak) * 100
        if ddp > restore:
            mult = 1.0                                         # recovered: full size
        else:
            for trig, mm in tiers:                             # deepest tier reached, sticky
                if ddp <= trig: mult = min(mult, mm)
    return out


def vol_target(r, lam=0.94, warm=20, cap=2.0):
    """Scale tomorrow by sigma_bar / sigma_forecast (EWMA of the book's own returns, causal)."""
    out = np.zeros_like(r); v = np.var(r[:warm]) if warm else r[0] ** 2
    long_var = np.var(r[:warm])
    for i, x in enumerate(r):
        s_f = math.sqrt(v); s_bar = math.sqrt(long_var)
        out[i] = x * min(cap, s_bar / s_f) if (i >= warm and s_f > 0) else x
        v = lam * v + (1 - lam) * x * x
        long_var = long_var + (x * x - long_var) / (i + 1 + warm)   # expanding mean of r², causal
    return out


r_thr = dd_throttle(r_all)
r_vt = vol_target(r_all)
r_both = dd_throttle(vol_target(r_all))
E3 = dict(raw=[metrics(r_all, 'no overlay'), metrics(r_thr, 'DD throttle (current)'),
               metrics(r_vt, 'vol target EWMA .94'), metrics(r_both, 'vol target + DD throttle')],
          at10vol=[metrics(at_vol(x), l) for x, l in [(r_all, 'no overlay'), (r_thr, 'DD throttle'),
                                                     (r_vt, 'vol target'), (r_both, 'both')]],
          book_vol_acf_abs1=float(np.corrcoef(np.abs(r_all[:-1]), np.abs(r_all[1:]))[0, 1]),
          book_ret_acf1=float(np.corrcoef(r_all[:-1], r_all[1:])[0, 1]))

# ── E4 instrument pruning walk-forward ─────────────────────────────────────
w_p = np.ones(len(T))
for q in TEST_QS:
    m_test = qtr == q; t0 = time[m_test].min(); m_train = rtime < t0
    for k, inst in enumerate(INST):
        mm = m_train & (X[:, 0] == k)
        v = y[mm][-500:]
        tstat = v.mean() / (v.std(ddof=1) / math.sqrt(len(v))) if len(v) > 50 else 1
        if tstat < 0: w_p[m_test & (X[:, 0] == k)] = 0
r_prune = daily(base_tr, w_p[test_mask])
E4 = dict(raw=metrics(r_prune, 'walk-forward prune t<0'), dropped_share=float(1 - w_p[test_mask].mean()),
          at10vol=metrics(at_vol(r_prune), 'prune@10%'))

R = dict(E1_meta_label=E1, E2_margin=E2, E3_risk_layer=E3, E4_prune=E4)


def show(rows):
    for m in rows if isinstance(rows, list) else [rows]:
        print(f"  {m['label']:28s} Sharpe {m['sharpe']:5.2f}  ret {m['ann_ret']:6.1f}%  vol {m['ann_vol']:5.1f}%  maxDD {m['maxdd']:6.1f}%  calmar {m['calmar']}")


print(f"E1 meta-labelling  test {E1['test_quarters']}  n={E1['n_test']}  IC={ic:.3f}  kept {E1['kept_share']:.0%}  "
      f"meanR kept {E1['meanR_kept']:+.3f} vs dropped {E1['meanR_dropped']:+.3f}")
for r_ in dec_rows: print(f"   decile {r_['decile']:2d}  pred {r_['pred']:+.3f}  realised {r_['realised']:+.3f}")
show(E1['raw']); print(' at 10% vol:'); show(E1['at10vol'])
print("E2 margin sizing (walk-forward)"); show(E2['raw']); show(E2['at10vol'])
print(f"E3 risk layer (full history)  |r| acf1 {E3['book_vol_acf_abs1']:.3f}  r acf1 {E3['book_ret_acf1']:.3f}")
show(E3['raw']); print(' at 10% vol:'); show(E3['at10vol'])
print(f"E4 prune (walk-forward) dropped {E4['dropped_share']:.0%}"); show(E4['raw']); show(E4['at10vol'])
if OUT: json.dump(R, open(OUT, 'w'), indent=1, default=float); print('wrote', OUT)

# ── E5 slippage stress: does the meta filter matter MORE once live fills are worse? ──
# Extra round-trip slippage s (pips) costs s/stopPips R per trade (risk is set on the stop).
stop_test = np.array([t['stopPips'] for t in base_tr])
E5 = []
for s in (0.0, 0.5, 1.0, 1.5, 2.0):
    pen = s / np.maximum(stop_test, 1e-9)
    adj = [dict(t, rMultiple=t['rMultiple'] - p) for t, p in zip(base_tr, pen)]
    rb, rk = daily(adj), daily(adj, keep.astype(float))
    E5.append(dict(slip_pips=s, base=metrics(rb, f'base +{s}p'), meta_skip=metrics(rk, f'meta skip +{s}p'),
                   base_meanR=float(np.mean([a['rMultiple'] for a in adj])),
                   kept_meanR=float(np.mean([a['rMultiple'] for a, k in zip(adj, keep) if k]))))
print("E5 slippage stress (test period)")
for e in E5:
    print(f"  +{e['slip_pips']:.1f} pip  base Sharpe {e['base']['sharpe']:5.2f} meanR {e['base_meanR']:+.3f} | "
          f"meta-skip Sharpe {e['meta_skip']['sharpe']:5.2f} meanR {e['kept_meanR']:+.3f}")

# ── E6 path robustness of the DD throttle (Lesson 1 §04 / 15) ──────────────
rng = np.random.default_rng(7)
def sboot(x, mean_block=10):
    n = len(x); idx = np.empty(n, dtype=int); i = rng.integers(n)
    for t_ in range(n):
        if t_ and rng.random() < 1 / mean_block: i = rng.integers(n)
        idx[t_] = i; i = (i + 1) % n
    return x[idx]
rows = []
for _ in range(1000):
    p = sboot(r_all)
    a, b = metrics(at_vol(p)), metrics(at_vol(dd_throttle(p)))
    rows.append((a['sharpe'], b['sharpe'], a['maxdd'], b['maxdd']))
rows = np.array(rows)
E6 = dict(paths=1000, throttle_better_dd_share=float((rows[:, 3] > rows[:, 2]).mean()),
          median_dd_no=float(np.median(rows[:, 2])), median_dd_thr=float(np.median(rows[:, 3])),
          p05_dd_no=float(np.percentile(rows[:, 2], 5)), p05_dd_thr=float(np.percentile(rows[:, 3], 5)),
          median_sharpe_cost=float(np.median(rows[:, 0] - rows[:, 1])),
          sharpe_cost_share_positive=float((rows[:, 0] > rows[:, 1]).mean()))
print("E6 throttle on 1000 bootstrap paths (equal 10% vol):", {k: round(v, 3) for k, v in E6.items()})
R['E5_slippage'] = E5; R['E6_throttle_bootstrap'] = E6
if OUT: json.dump(R, open(OUT, 'w'), indent=1, default=float)
