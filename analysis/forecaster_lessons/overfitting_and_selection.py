#!/usr/bin/env python3
"""
Lesson 01 cards 04/05/07 and Lesson 02 §05 on the Level-Atlas vote universe:
how much of the book's headline is the SEARCH rather than the edge?

Input: analysis/output/level-atlas-vote-trades/<pair>-votetrades.json (32 instruments,
per-trade net pnl% at the pair's flat cost; the same files the vote-portfolio route
combines). No M1 needed.

  A  Trial family. Every configuration a researcher could plausibly have compared on
     this history: universe × minMargin × rung set × decision set. Each trial is a
     daily, equal-risk book (sum of R × 0.5% per day; no concurrency cap, so the
     overlay layers are held out — this isolates the SIGNAL layer, Lesson 03).
  B  Deflated Sharpe with the family's OWN cross-trial Sharpe variance and an
     effective trial count from the eigenvalues of the trial-return correlation
     matrix (Lesson 02 §05: correlated configurations count as fewer trials).
  C  CSCV probability of backtest overfitting (Bailey, Borwein, López de Prado & Zhu
     2017): split the days into S blocks, every C(S, S/2) in/out split, pick the
     in-sample best trial, record its out-of-sample rank. PBO = P(rank below median).
     Also the OOS-vs-IS Sharpe slope (performance degradation).
  D  Pair selection, walk-forward. Re-run the "curated subset" choice the way it could
     have been made at the time: at each year-end keep pairs whose trailing t>0, trade
     them next year. Compare with (i) all 32, (ii) the 17 chosen with hindsight.
  E  Parameter plateau (Lesson 01 card 07): Sharpe across neighbouring minMargin.

Usage: python3 analysis/forecaster_lessons/overfitting_and_selection.py [--json out]
"""
import glob, json, math, os, sys, itertools
from collections import defaultdict
import numpy as np
from scipy import stats

OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
ANN = 252
BOOK17 = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'EURAUD', 'EURCHF', 'AUDJPY', 'CADJPY',
          'CHFJPY', 'GOLD', 'NQ', 'SPX', 'DOW', 'US2000', 'DE30', 'UK100']

trades = []
for f in sorted(glob.glob('analysis/output/level-atlas-vote-trades/*-votetrades.json')):
    b = os.path.basename(f).replace('-votetrades.json', '')
    if '-' in b: continue                                  # skip earlyexit / p90 variants
    d = json.load(open(f))
    for t in d['trades']:
        risk = t['stopPips'] * t['pip'] / t['entry'] * 100   # % move to the stop
        if risk <= 0: continue
        trades.append(dict(inst=d['instrument'].upper(), date=t['date'], R=t['pnlPct'] / risk,
                           margin=t['margin'], rung=t['rung'], decision=t['decision']))
INST = sorted({t['inst'] for t in trades})
# Common window: every instrument live (indices SPX/DOW start 2024-07 → excluded from the window start rule)
start = max(min(t['date'] for t in trades if t['inst'] == i) for i in INST if i not in ('SPX', 'DOW'))
end = min(max(t['date'] for t in trades if t['inst'] == i) for i in INST)
trades = [t for t in trades if start <= t['date'] <= end]
DATES = sorted({t['date'] for t in trades}); DI = {d: i for i, d in enumerate(DATES)}; ND = len(DATES)
print(f"{len(INST)} instruments, {len(trades)} trades, common window {start} → {end} ({ND} days)")


def book(filt):
    r = np.zeros(ND)
    for t in trades:
        if filt(t): r[DI[t['date']]] += t['R'] * 0.005
    return r


def sharpe(r):
    s = r.std(ddof=1)
    return r.mean() / s * math.sqrt(ANN) if s > 0 else 0.0


# ── A trial family ─────────────────────────────────────────────────────────
majors = {'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD'}
universes = {'all': set(INST), 'book17': set(BOOK17), 'majors': majors,
             'fx_only': {i for i in INST if i not in ('GOLD', 'NQ', 'SPX', 'DOW', 'US2000', 'DE30', 'UK100')}}
family = {}
for (un, us), mm, rung, dec in itertools.product(universes.items(), (1, 2, 3, 4, 5),
                                                ('p50', 'p75', 'both'), ('follow', 'fade', 'both')):
    key = f"{un}|m{mm}|{rung}|{dec}"
    family[key] = book(lambda t, us=us, mm=mm, rung=rung, dec=dec:
                       t['inst'] in us and t['margin'] >= mm and (rung == 'both' or t['rung'] == rung)
                       and (dec == 'both' or t['decision'] == dec))
keys = list(family); M = np.array([family[k] for k in keys])        # trials × days
SR = np.array([sharpe(x) for x in M])
best = int(SR.argmax())
print(f"A  trial family: {len(keys)} configs; Sharpe median {np.median(SR):.2f}, sd {SR.std():.2f}, best {SR[best]:.2f} ({keys[best]})")

# ── B deflated Sharpe with the family's own variance + effective N ─────────
C = np.corrcoef(M); C = np.nan_to_num(C)
eig = np.clip(np.linalg.eigvalsh(C), 0, None)
n_eff = float(eig.sum() ** 2 / (eig ** 2).sum())
emc = 0.5772156649
def exp_max(N): return (1 - emc) * stats.norm.ppf(1 - 1 / N) + emc * stats.norm.ppf(1 - 1 / (N * math.e))
r_best = M[best]; Sd = r_best.mean() / r_best.std(ddof=1)
g3, g4 = stats.skew(r_best), stats.kurtosis(r_best)
sd_trials_d = SR.std() / math.sqrt(ANN)
dsr_rows = []
for label, N in (('all configs', len(keys)), ('effective (eigen)', max(n_eff, 1.0001))):
    S0 = sd_trials_d * exp_max(N)
    z = (Sd - S0) * math.sqrt(ND - 1) / math.sqrt(1 - g3 * Sd + (g4 + 2) / 4 * Sd ** 2)   # (γ4-1)/4, raw γ4 = excess+3
    dsr_rows.append(dict(N=label, n=float(N), benchmark_ann=S0 * math.sqrt(ANN), dsr=float(stats.norm.cdf(z))))
    print(f"B  DSR of best, N={label} ({N:.1f}): benchmark {S0 * math.sqrt(ANN):.2f} → DSR {stats.norm.cdf(z):.4f}")

# ── C CSCV / PBO ───────────────────────────────────────────────────────────
S = 16
blocks = np.array_split(np.arange(ND), S)
logits, deg = [], []
for combo in itertools.combinations(range(S), S // 2):
    ins = np.concatenate([blocks[i] for i in combo]); oos = np.concatenate([blocks[i] for i in range(S) if i not in combo])
    sr_is = np.array([sharpe(x[ins]) for x in M]); sr_oos = np.array([sharpe(x[oos]) for x in M])
    b = sr_is.argmax()
    rank = stats.rankdata(sr_oos)[b] / (len(keys) + 1)
    logits.append(math.log(rank / (1 - rank)))
    deg.append((sr_is[b], sr_oos[b]))
logits = np.array(logits); deg = np.array(deg)
pbo = float((logits <= 0).mean())
slope = float(np.polyfit(deg[:, 0], deg[:, 1], 1)[0])
print(f"C  CSCV S={S}: {len(logits)} splits, PBO {pbo:.3f}; IS-best Sharpe {deg[:, 0].mean():.2f} → OOS {deg[:, 1].mean():.2f}; "
      f"P(OOS<0) {(deg[:, 1] < 0).mean():.3f}; degradation slope {slope:.2f}")

# ── D pair selection walk-forward ─────────────────────────────────────────
years = sorted({d[:4] for d in DATES})
per_inst_R = defaultdict(list)
wf = np.zeros(ND); kept_log = {}
for y in years[1:]:
    hist = [t for t in trades if t['date'][:4] < y and t['margin'] >= 3]
    keep = set()
    for i in INST:
        v = np.array([t['R'] for t in hist if t['inst'] == i])
        if len(v) > 100 and v.mean() / (v.std(ddof=1) / math.sqrt(len(v))) > 0: keep.add(i)
    kept_log[y] = sorted(keep)
    for t in trades:
        if t['date'][:4] == y and t['inst'] in keep and t['margin'] >= 3: wf[DI[t['date']]] += t['R'] * 0.005
mask = np.array([d[:4] >= years[1] for d in DATES])
allb = book(lambda t: t['margin'] >= 3)[mask]; b17 = book(lambda t: t['margin'] >= 3 and t['inst'] in BOOK17)[mask]
excl = book(lambda t: t['margin'] >= 3 and t['inst'] not in BOOK17)[mask]
D = dict(period=f"{years[1]}→{end}", all32=sharpe(allb), book17_hindsight=sharpe(b17), excluded15=sharpe(excl),
         walkforward_tpos=sharpe(wf[mask]), kept_by_year={y: len(v) for y, v in kept_log.items()})
print(f"D  pair selection ({D['period']}, margin≥3): all-32 {D['all32']:.2f} | book-17 (hindsight) {D['book17_hindsight']:.2f} | "
      f"the 15 excluded {D['excluded15']:.2f} | walk-forward t>0 {D['walkforward_tpos']:.2f}  kept/yr {D['kept_by_year']}")

# ── E plateau over minMargin ──────────────────────────────────────────────
E = {f"m{mm}": sharpe(book(lambda t, mm=mm: t['inst'] in BOOK17 and t['margin'] >= mm)) for mm in range(1, 8)}
print("E  plateau, book-17 Sharpe by minMargin:", {k: round(v, 2) for k, v in E.items()})

R = dict(window=[start, end], n_days=ND, n_instruments=len(INST), A=dict(n_trials=len(keys), sharpe_median=float(np.median(SR)),
         sharpe_sd=float(SR.std()), best=keys[best], best_sharpe=float(SR[best]),
         top10=[(keys[i], float(SR[i])) for i in np.argsort(-SR)[:10]]),
         B=dict(effective_trials=n_eff, rows=dsr_rows), C=dict(S=S, splits=len(logits), pbo=pbo,
         is_best_mean=float(deg[:, 0].mean()), oos_of_is_best_mean=float(deg[:, 1].mean()), degradation_slope=slope),
         D=D, E=E)
if OUT: json.dump(R, open(OUT, 'w'), indent=1, default=float); print('wrote', OUT)
