#!/usr/bin/env python3
"""
Forecaster-Portfolio lessons applied to our own book (Level-Atlas vote portfolio v2).

Reads the saved API response vp2.json (equity curve + 23.6k trades) and runs the
validation stack from education/forecaster-portfolio-case-study, Lessons 01-03:

  L1 §02  loss frequency by horizon vs the normal model  Pr(R_h<0) = Φ(-S√h)
  L1 §03  Sharpe SE (normal + Mertens/Opdyke non-normal), Lo η(q), effective n,
          Bayesian shrinkage, PSR
  L2 §05  Deflated Sharpe for the size of the search (trial count + expected max)
  L1 §04  stationary block bootstrap (Politis-Romano): final return + max-DD distribution
  L2 §06  edge decay: Sharpe by half-year, slope test on the rolling edge
  L3 §01  fundamental law IR ≈ TC·IC·√BR: effective breadth from pair correlations
  L1 §06  Kelly fraction from the shrunk edge; λ−λ²/2 growth at the current sizing
  Costs   break-even round-trip cost per trade, in pips and in R

Usage:  python3 analysis/forecaster_lessons/validate_book.py [vp2.json] [--json out.json]
"""
import json, math, sys
from collections import defaultdict
import numpy as np
from scipy import stats

SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'vp2.json'
OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
RNG = np.random.default_rng(20261004)
ANN = 252

d = json.load(open(SRC))
eq = d['equityCurve']
dates = np.array([e['date'] for e in eq])
r = np.array([e['dailyReturn'] for e in eq]) / 100.0          # daily return, fraction
T = len(r)
trades = d['trades']
R = {}


def sharpe(x):
    s = x.std(ddof=1)
    return x.mean() / s * math.sqrt(ANN) if s > 0 else float('nan')


def maxdd_simple(x):
    """Max drawdown of the NON-compounded (summed) curve, in fraction of capital."""
    c = np.cumsum(x)
    return float((c - np.maximum.accumulate(np.concatenate([[0], c]))[1:]).min())


# ── L1 §03 · estimation ──────────────────────────────────────────────────────
S = sharpe(r)
Sd = S / math.sqrt(ANN)                                       # per-day Sharpe
g3 = stats.skew(r); g4 = stats.kurtosis(r)                    # excess kurtosis
se_norm_d = math.sqrt((1 + 0.5 * Sd ** 2) / T)
se_nn_d = math.sqrt((1 - g3 * Sd + (g4) / 4 * Sd ** 2) / T)   # Mertens / Opdyke
se_norm, se_nn = se_norm_d * math.sqrt(ANN), se_nn_d * math.sqrt(ANN)
rho = [float(np.corrcoef(r[:-k], r[k:])[0, 1]) for k in range(1, 21)]


def lo_eta(q, rho):
    return q / math.sqrt(q + 2 * sum((q - k) * rho[k - 1] for k in range(1, q)))


lo = {L: Sd * lo_eta(ANN, (rho[:L] + [0.0] * ANN)[:ANN]) for L in (1, 5, 10, 20)}
n_eff = T * (1 - rho[0]) / (1 + rho[0])
psr0 = float(stats.norm.cdf(Sd / se_nn_d))                    # PSR vs 0
shrink = {}
for tau in (1.0, 0.5):
    B = se_nn ** 2 / (se_nn ** 2 + tau ** 2)
    shrink[f'prior1_tau{tau}'] = 1.0 + (1 - B) * (S - 1.0)
R['estimation'] = dict(days=T, sharpe=S, skew=g3, exkurt=g4, acf1=rho[0],
                      se_normal=se_norm, se_nonnormal=se_nn,
                      ci95=[S - 1.96 * se_nn, S + 1.96 * se_nn],
                      lo_adjusted={f'lags{k}': v for k, v in lo.items()},
                      n_effective=n_eff, psr_vs0=psr0, shrunk=shrink)

# ── L1 §02 · loss frequency by horizon ──────────────────────────────────────
months = np.array([x[:7] for x in dates]); years = np.array([x[:4] for x in dates])
quarters = np.array([f"{x[:4]}Q{(int(x[5:7]) - 1) // 3 + 1}" for x in dates])


def by_label(lab):
    out = defaultdict(float)
    for l, x in zip(lab, r): out[l] += x
    keys = sorted(out)
    return np.array([out[k] for k in keys[1:-1]])             # drop partial first/last


weeks = np.array([r[i:i + 5].sum() for i in range(0, T - 4, 5)])
horizon = []
for name, h, arr in [('day', 1 / ANN, r), ('week', 5 / ANN, weeks), ('month', 21 / ANN, by_label(months)),
                     ('quarter', 63 / ANN, by_label(quarters)), ('year', 1.0, by_label(years))]:
    horizon.append(dict(horizon=name, normal=float(stats.norm.cdf(-S * math.sqrt(h))),
                        record=float((arr < 0).mean()) if len(arr) else None, n=int(len(arr))))
R['loss_by_horizon'] = horizon

# ── L2 §05 · deflated Sharpe for the size of the search ─────────────────────
# Trial count: every overlay/knob that was switched on after being compared on this
# same history (see vp2.json: throttle, early-exit threshold, ccy gate, minMargin,
# maxConcurrent, rung set, p90, fade-stop, slFraction, sizing) plus the pair-selection
# and the upstream atlas/vote grid. We report DSR for a range of effective N.
var_trials_ann = 1.0 ** 2                                     # cross-trial Sharpe dispersion (ann.) — conservative


def exp_max_z(N):
    if N <= 1: return 0.0
    e = 0.5772156649
    return (1 - e) * stats.norm.ppf(1 - 1 / N) + e * stats.norm.ppf(1 - 1 / (N * math.e))


dsr = []
for N in (1, 13, 50, 300, 1000):
    S0 = math.sqrt(var_trials_ann) * exp_max_z(N) / math.sqrt(ANN)   # per-day benchmark
    dsr.append(dict(N=N, benchmark_ann=S0 * math.sqrt(ANN),
                    dsr=float(stats.norm.cdf((Sd - S0) / se_nn_d))))
R['deflated_sharpe'] = dict(assumed_trial_sharpe_sd=math.sqrt(var_trials_ann), rows=dsr,
                            naive_avg_pair_sharpe=d.get('naiveAvgSharpe'))

# ── L1 §04 · stationary block bootstrap ─────────────────────────────────────
def stationary_bootstrap(x, n_paths=2000, mean_block=10):
    n = len(x); p = 1 / mean_block
    out = np.empty((n_paths, n))
    for k in range(n_paths):
        idx = np.empty(n, dtype=int); i = RNG.integers(n)
        for t in range(n):
            if t and RNG.random() < p: i = RNG.integers(n)
            idx[t] = i; i = (i + 1) % n
        out[k] = x[idx]
    return out


paths = stationary_bootstrap(r, 2000, 10)
final = paths.sum(1)
dds = np.array([maxdd_simple(p) for p in paths])
real_dd = maxdd_simple(r)
R['bootstrap'] = dict(paths=2000, mean_block=10, realised_final_simple=float(r.sum()),
                      final_p05=float(np.percentile(final, 5)), final_p50=float(np.median(final)),
                      final_p95=float(np.percentile(final, 95)),
                      realised_maxdd=real_dd, maxdd_p50=float(np.median(dds)),
                      maxdd_p05=float(np.percentile(dds, 5)), maxdd_p01=float(np.percentile(dds, 1)),
                      realised_dd_percentile=float((dds <= real_dd).mean()),
                      prob_dd_worse_than_20pct=float((dds < -0.20).mean()))

# ── L2 §06 · decay ──────────────────────────────────────────────────────────
halves = defaultdict(list)
for dt, x in zip(dates, r): halves[f"{dt[:4]}H{1 if int(dt[5:7]) <= 6 else 2}"].append(x)
by_half = [dict(period=k, days=len(v), sharpe=sharpe(np.array(v)), mean_bp=float(np.mean(v) * 1e4))
           for k, v in sorted(halves.items())]
roll = np.array([sharpe(r[i - 126:i]) for i in range(126, T + 1)])
tt = np.arange(T)
slope, icpt, rv, pv, se = stats.linregress(tt, r)
# Power: how many days to detect a 50% decay of the mean at 2σ?
R['decay'] = dict(by_half_year=by_half,
                  daily_mean_trend_bp_per_year=float(slope * ANN * 1e4), trend_p=float(pv),
                  first_half_sharpe=sharpe(r[:T // 2]), second_half_sharpe=sharpe(r[T // 2:]),
                  rolling126_min=float(roll.min()), rolling126_last=float(roll[-1]))

# ── trades: breadth, IC, costs, slicing ─────────────────────────────────────
for t in trades:
    t['R'] = t['rMultiple']
pairs = sorted({t['instrument'] for t in trades})
date_idx = {dt: i for i, dt in enumerate(dates)}
P = np.zeros((T, len(pairs)))
for t in trades:
    i = date_idx.get(t['date'])
    if i is not None: P[i, pairs.index(t['instrument'])] += t['pnlPct'] / 100
C = np.corrcoef(P.T)
eig = np.linalg.eigvalsh(C)
eff_assets = float(eig.sum() ** 2 / (eig ** 2).sum())        # participation ratio
avg_corr = float((C.sum() - len(pairs)) / (len(pairs) * (len(pairs) - 1)))
Rm = np.array([t['R'] for t in trades])
wins = np.array([t['win'] for t in trades])
per_trade_ir = Rm.mean() / Rm.std(ddof=1)
br_raw = len(trades) / (T / ANN)
# Lesson 3: IR ≈ IC·√BR.  Implied IC from per-trade IR; implied breadth from the realised daily IR.
implied_br = (S / per_trade_ir) ** 2
R['fundamental_law'] = dict(trades_per_year=br_raw, per_trade_IR=float(per_trade_ir),
                            IR_if_independent=float(per_trade_ir * math.sqrt(br_raw)),
                            realised_IR=S, implied_independent_bets_per_year=float(implied_br),
                            transfer_ratio=float(S / (per_trade_ir * math.sqrt(br_raw))),
                            pair_avg_corr=avg_corr, effective_assets=eff_assets, n_assets=len(pairs))


def slice_stats(key):
    g = defaultdict(list)
    for t in trades: g[key(t)].append(t['R'])
    rows = []
    for k, v in sorted(g.items(), key=lambda kv: str(kv[0])):
        v = np.array(v)
        rows.append(dict(key=str(k), n=len(v), meanR=float(v.mean()),
                         t=float(v.mean() / (v.std(ddof=1) / math.sqrt(len(v)))) if len(v) > 2 else None))
    return rows


R['slices'] = {
    'decision': slice_stats(lambda t: t['decision']),
    'rung': slice_stats(lambda t: t['rung']),
    'session': slice_stats(lambda t: t['session']),
    'decision_x_rung': slice_stats(lambda t: f"{t['decision']}/{t['rung']}"),
    'decision_x_session': slice_stats(lambda t: f"{t['decision']}/{t['session']}"),
    'margin': slice_stats(lambda t: min(t['margin'], 8)),
    'instrument': slice_stats(lambda t: t['instrument']),
    'timed_out': slice_stats(lambda t: bool(t.get('timedOut'))),
    'year': slice_stats(lambda t: t['date'][:4]),
}

# Costs: R per pip = 1 / stopPips (risk is defined on the stop). Break-even pips of
# round-trip cost = mean R / mean(1/stopPips).
inv_stop = np.array([1 / t['stopPips'] if t['stopPips'] > 0 else 0 for t in trades])
be_pips_global = float(Rm.mean() / inv_stop.mean())
cost_rows = []
for inst in pairs:
    m = np.array([t['instrument'] == inst for t in trades])
    cost_rows.append(dict(instrument=inst, n=int(m.sum()), meanR=float(Rm[m].mean()),
                          median_stop_pips=float(np.median([t['stopPips'] for t, k in zip(trades, m) if k])),
                          breakeven_cost_pips=float(Rm[m].mean() / inv_stop[m].mean())))
R['costs'] = dict(mean_R=float(Rm.mean()), breakeven_cost_pips_pooled=be_pips_global,
                  per_instrument=cost_rows,
                  note='Break-even = the round-trip cost (pips) that takes mean R to zero, given R = pips/stopPips.')

# ── L1 §06 · Kelly ──────────────────────────────────────────────────────────
mu, var = r.mean() * ANN, r.var(ddof=1) * ANN
S_shr = shrink['prior1_tau0.5']
mu_shr = S_shr * math.sqrt(var)
kelly = mu / var; kelly_shr = mu_shr / var
R['kelly'] = dict(ann_mean=mu, ann_vol=math.sqrt(var), kelly_leverage_vs_current=kelly,
                  kelly_leverage_shrunk=kelly_shr,
                  growth_fraction_at_current=float((1 / kelly_shr) - 0.5 * (1 / kelly_shr) ** 2) if kelly_shr else None,
                  note='Leverage multiples of the CURRENT 0.5%-risk sizing; 1.0 = today.')

# ── print ───────────────────────────────────────────────────────────────────
def pct(x): return f"{x * 100:+.1f}%"


e = R['estimation']
print(f"\n=== Atlas vote book · {dates[0]} → {dates[-1]} · {T} days · {len(trades)} trades ===")
print(f"Sharpe {S:.2f}  skew {g3:.2f}  exkurt {g4:.2f}  acf1 {rho[0]:+.3f}")
print(f"SE normal {se_norm:.3f} | non-normal {se_nn:.3f} | 95% CI {e['ci95'][0]:.2f}–{e['ci95'][1]:.2f} | n_eff {n_eff:.0f}")
print("Lo-adjusted:", {k: round(v, 2) for k, v in e['lo_adjusted'].items()}, "| shrunk:", {k: round(v, 2) for k, v in shrink.items()})
print("\nLoss frequency  horizon  normal  record  n")
for h in horizon: print(f"  {h['horizon']:8s} {h['normal'] * 100:6.1f}% {(h['record'] or 0) * 100:6.1f}% {h['n']:5d}")
print("\nDeflated Sharpe (trial Sharpe SD 1.0 ann.):")
for x in dsr: print(f"  N={x['N']:5d} benchmark {x['benchmark_ann']:.2f}  DSR {x['dsr']:.4f}")
b = R['bootstrap']
print(f"\nBootstrap 2000 paths: final(simple) {pct(b['final_p05'])} / {pct(b['final_p50'])} / {pct(b['final_p95'])}  realised {pct(b['realised_final_simple'])}")
print(f"  max DD realised {pct(real_dd)}  median {pct(b['maxdd_p50'])}  5th {pct(b['maxdd_p05'])}  1st {pct(b['maxdd_p01'])}  P(DD<-20%) {b['prob_dd_worse_than_20pct']:.1%}")
print("\nDecay by half-year:")
for x in by_half: print(f"  {x['period']}  {x['days']:4d}d  Sharpe {x['sharpe']:5.2f}  mean {x['mean_bp']:6.1f}bp")
dc = R['decay']; print(f"  trend {dc['daily_mean_trend_bp_per_year']:+.1f} bp/day per year (p={dc['trend_p']:.3f}); 1st half {dc['first_half_sharpe']:.2f} vs 2nd {dc['second_half_sharpe']:.2f}")
fl = R['fundamental_law']
print(f"\nFundamental law: {fl['trades_per_year']:.0f} trades/yr, per-trade IR {fl['per_trade_IR']:.3f} → IR if independent {fl['IR_if_independent']:.1f}; realised {S:.2f}")
print(f"  implied independent bets/yr {fl['implied_independent_bets_per_year']:.0f}; avg pair corr {avg_corr:.3f}; effective assets {eff_assets:.1f}/{len(pairs)}")
print(f"\nCosts: mean R {Rm.mean():.3f}; pooled break-even round-trip {be_pips_global:.1f} pips")
for c in sorted(cost_rows, key=lambda c: c['breakeven_cost_pips']):
    print(f"  {c['instrument']:7s} n={c['n']:5d} meanR {c['meanR']:+.3f}  stop~{c['median_stop_pips']:7.1f}  BE {c['breakeven_cost_pips']:6.1f} pips")
for k, rows in R['slices'].items():
    print(f"\nSlice by {k}:")
    for x in rows: print(f"  {x['key']:16s} n={x['n']:5d} meanR {x['meanR']:+.3f}  t={x['t'] if x['t'] is None else round(x['t'], 1)}")
kk = R['kelly']; print(f"\nKelly: full-Kelly = {kk['kelly_leverage_vs_current']:.1f}× current sizing (shrunk {kk['kelly_leverage_shrunk']:.1f}×)")

if OUT:
    json.dump(R, open(OUT, 'w'), indent=1, default=float)
    print(f"\nwrote {OUT}")
