#!/usr/bin/env python3
"""
Lesson 01 cards 06/10 + §02/§04 and Lesson 03 §02-§03 on the Level-Atlas vote book (vp2.json).

  1  How long must the LIVE record run? Minimum track record length (Bailey & López de
     Prado) to confirm Sharpe > 0 and > 1 at 95%, for the backtest, shrunk and
     slippage-stressed edges.
  2  Power to detect decay (Lesson 16 preview): trades/days needed to detect a 50% fall
     in mean R at 5% size / 80% power, and an SPRT kill rule on per-trade R with its
     expected run length under "edge intact" and "edge gone".
  3  Tails: normal vs Cornish-Fisher (modified) vs empirical VaR/CVaR; a GPD fit to
     daily losses beyond the 95th percentile (Lesson 01 §04, EVT) for 1-in-250 /
     1-in-1000-day losses; excess kurtosis by horizon vs the i.i.d. 1/h law (L03 §03).
  4  Volatility clustering of the BOOK: GARCH(1,1) by maximum likelihood, persistence
     α+β and half-life ln½/ln(α+β) (L03 §02) — why vol-targeting did nothing (E3).

Usage: python3 analysis/forecaster_lessons/monitoring_and_tails.py [vp2.json] [--json out]
"""
import json, math, sys
from collections import defaultdict
import numpy as np
from scipy import stats, optimize

SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'vp2.json'
OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
ANN = 252
d = json.load(open(SRC))
dates = [e['date'] for e in d['equityCurve']]; DI = {x: i for i, x in enumerate(dates)}
R_tr = np.array([t['rMultiple'] for t in d['trades']])
r = np.zeros(len(dates))                                         # unthrottled daily book, 0.5%/R
for t in d['trades']: r[DI[t['date']]] += t['rMultiple'] * 0.005
T = len(r); tr_per_day = len(R_tr) / T
out = {}

# ── 1 MinTRL ──────────────────────────────────────────────────────────────
g3, g4 = stats.skew(r), stats.kurtosis(r)
def min_trl_days(S_ann, S_star_ann, alpha=0.05):
    s, s0 = S_ann / math.sqrt(ANN), S_star_ann / math.sqrt(ANN)
    if s <= s0: return float('inf')
    z = stats.norm.ppf(1 - alpha)
    return 1 + (1 - g3 * s + (g4 + 2) / 4 * s ** 2) * (z / (s - s0)) ** 2   # (γ4-1)/4 with raw γ4 = (excess+2)/4
rows = []
for label, S in (('backtest', 4.17), ('shrunk (prior 1, τ .5)', 2.73), ('+0.5 pip slippage', 2.81), ('+1 pip slippage', 1.65)):
    rows.append(dict(edge=label, sharpe=S, days_vs0=min_trl_days(S, 0), days_vs1=min_trl_days(S, 1)))
out['min_trl'] = rows

# ── 2 power + SPRT on per-trade R ─────────────────────────────────────────
mu0, sd = R_tr.mean(), R_tr.std(ddof=1)
za, zb = stats.norm.ppf(0.95), stats.norm.ppf(0.80)
n_half = ((za + zb) * sd / (mu0 / 2)) ** 2                       # one-sided, trades, independent
# trades are correlated within a day: inflate by the design effect from daily aggregation
daily_R = defaultdict(list)
for t in d['trades']: daily_R[t['date']].append(t['rMultiple'])
dsum = np.array([sum(v) for v in daily_R.values()]); dn = np.array([len(v) for v in daily_R.values()])
deff = dsum.var(ddof=1) / (dn.mean() * sd ** 2)                  # variance of a day vs n independent trades
mu1 = 0.0
A, B = math.log(0.80 / 0.05), math.log(0.20 / 0.95)              # Wald bounds: α=5% false kill, β=20% miss
llr_step = lambda x: ((mu1 - mu0) * x - (mu1 ** 2 - mu0 ** 2) / 2) / (sd ** 2 * deff)
e_step_H0 = llr_step(mu0); e_step_H1 = llr_step(mu1)              # expected LLR per trade under each
out['monitoring'] = dict(mean_R=mu0, sd_R=sd, trades_per_day=tr_per_day, design_effect=deff,
                         trades_to_detect_half_decay=n_half * deff, days_to_detect_half_decay=n_half * deff / tr_per_day,
                         sprt=dict(H0_mean=mu0, H1_mean=mu1, alpha=0.05, beta=0.20, upper_kill=A, lower_accept=B,
                                   exp_trades_if_gone=A / e_step_H1, exp_trades_if_intact=B / e_step_H0,
                                   rule="cumsum over trades of ((mu1-mu0)*R - (mu1^2-mu0^2)/2)/(sd^2*deff); "
                                        "kill when >= upper_kill, reset to 0 when <= lower_accept"))

# ── 3 tails ──────────────────────────────────────────────────────────────
mu, s = r.mean(), r.std(ddof=1)
def cf_q(p):
    z = stats.norm.ppf(p)
    return z + (z ** 2 - 1) * g3 / 6 + (z ** 3 - 3 * z) * g4 / 24 - (2 * z ** 3 - 5 * z) * g3 ** 2 / 36
var = {}
for p in (0.05, 0.01):
    var[f"{int((1 - p) * 100)}"] = dict(normal=(mu + stats.norm.ppf(p) * s) * 100, cornish_fisher=(mu + cf_q(p) * s) * 100,
                                         empirical=float(np.percentile(r, p * 100) * 100),
                                         cvar_empirical=float(r[r <= np.percentile(r, p * 100)].mean() * 100))
loss = -r; u = np.percentile(loss, 95); exc = loss[loss > u] - u
xi, loc, beta = stats.genpareto.fit(exc, floc=0)
pu = (loss > u).mean()
def gpd_q(p): return u + beta / xi * (((1 - p) / pu) ** (-xi) - 1) if abs(xi) > 1e-6 else u - beta * math.log((1 - p) / pu)
kurt_h = {}
for h in (1, 5, 21):
    agg = np.array([r[i:i + h].sum() for i in range(0, T - h + 1, h)])
    kurt_h[h] = dict(observed=float(stats.kurtosis(agg)), iid_prediction=float(g4 / h), n=len(agg))
out['tails'] = dict(skew=g3, exkurt=g4, var_pct=var,
                    gpd=dict(threshold_loss_pct=u * 100, xi=xi, beta_pct=beta * 100,
                             loss_1in250_pct=gpd_q(1 - 1 / 250) * 100, loss_1in1000_pct=gpd_q(1 - 1 / 1000) * 100,
                             worst_observed_pct=float(loss.max() * 100)),
                    kurtosis_by_horizon=kurt_h)

# ── 4 GARCH(1,1) on the book ─────────────────────────────────────────────
x = r - r.mean()
def nll(p):
    w, a, b = p
    if w <= 0 or a < 0 or b < 0 or a + b >= 0.9999: return 1e10
    v = np.empty(T); v[0] = x.var()
    for i in range(1, T): v[i] = w + a * x[i - 1] ** 2 + b * v[i - 1]
    return 0.5 * np.sum(np.log(v) + x ** 2 / v)
res = optimize.minimize(nll, [x.var() * 0.05, 0.05, 0.90], method='Nelder-Mead', options=dict(maxiter=4000, xatol=1e-10, fatol=1e-8))
w, a, b = res.x
out['garch'] = dict(omega=w, alpha=a, beta=b, persistence=a + b,
                    half_life_days=math.log(0.5) / math.log(a + b) if 0 < a + b < 1 else None,
                    abs_ret_acf={k: float(np.corrcoef(np.abs(r[:-k]), np.abs(r[k:]))[0, 1]) for k in (1, 5, 20)})

# ── print ────────────────────────────────────────────────────────────────
print("1  Minimum track record (days) to confirm at 95%:")
for x_ in rows: print(f"   {x_['edge']:24s} S={x_['sharpe']:.2f}  Sharpe>0: {x_['days_vs0']:6.0f} d   Sharpe>1: {x_['days_vs1']:6.0f} d")
m = out['monitoring']
print(f"2  mean R {mu0:.3f}, sd {sd:.3f}, {tr_per_day:.1f} trades/day, design effect {deff:.2f}")
print(f"   detect a 50% decay (5%/80%): {m['trades_to_detect_half_decay']:.0f} trades ≈ {m['days_to_detect_half_decay']:.0f} trading days")
sp = m['sprt']; print(f"   SPRT kill (edge→0): upper {sp['upper_kill']:.2f}; expected trades to kill if gone {sp['exp_trades_if_gone']:.0f}, "
                      f"to clear if intact {sp['exp_trades_if_intact']:.0f}")
print(f"3  tails: skew {g3:.2f}, exkurt {g4:.2f}")
for k, v in var.items(): print(f"   VaR{k}: normal {v['normal']:.2f}%  CF {v['cornish_fisher']:.2f}%  empirical {v['empirical']:.2f}%  CVaR {v['cvar_empirical']:.2f}%")
gp = out['tails']['gpd']; print(f"   GPD ξ={gp['xi']:.3f}: 1-in-250-day loss {gp['loss_1in250_pct']:.2f}%, 1-in-1000 {gp['loss_1in1000_pct']:.2f}%, worst seen {gp['worst_observed_pct']:.2f}%")
print("   excess kurtosis by horizon (observed vs iid g4/h):", {h: (round(v['observed'], 2), round(v['iid_prediction'], 2)) for h, v in kurt_h.items()})
g = out['garch']; print(f"4  GARCH(1,1): α {a:.3f} β {b:.3f} persistence {a + b:.3f} half-life {g['half_life_days']:.1f} d; |r| acf {g['abs_ret_acf']}")
if OUT: json.dump(out, open(OUT, 'w'), indent=1, default=float); print('wrote', OUT)
