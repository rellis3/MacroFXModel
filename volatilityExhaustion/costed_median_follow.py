"""
costed_median_follow.py — the properly-costed follow-vs-fade test at the MEDIAN line,
on the LIVE dynamic (trailing) line geometry, IS/OOS, real fills + costs.

Turns the Phase-6 lead ("at the median, price continues") into a costed trade or kills
it. Faithfully replicates forecastCore.js `simulateEntry` dynamic-HL path (the vetted
live primitive) — NOT a fresh re-derivation — for band=hl50 (median):
  FOLLOW: stop-entry through the median proj line (trailing the opposite running
          extreme), target the 75th proj line frozen at fill, stop = entry ∓ slMult·median.
  FADE:   limit at the median proj line, target the OC-median close level, stop beyond.
One trade/day (first fill, both sides considered). Costs: round-trip spread + breakout
slippage. Marked to session close if neither barrier hits.

Benchmark: a driftless walk has ZERO expectancy on any barrier bet (the 77% follow
win-rate is just the closer barrier). So the honest bar is net expectancy > 0 after cost,
IS AND OOS. We ship the FOLLOW-vs-FADE A/B so it's not a lone equity curve.

Bug-audit discipline (per CLAUDE.md): σ is causal (yz[i-1]); the trailing anchor LAGS
one bar (running extreme of bars strictly < k — using bar k's own extreme to place the
level bar k is filled against is the documented self-fulfilling lookahead); fill bar
TP not resolvable for a limit entry (causality); NaN/short-day guards. `placebo` mode
shuffles intraday returns within the day (destroys serial correlation, keeps the fat-
tailed marginal) — if the follow edge survives the shuffle it's the distribution shape,
if it dies it's genuine serial CONTINUATION (momentum). That separates "fat tail" from
"real continuation", the Phase-6 caveat #1.
"""
import os, sys, datetime
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'portfolioBacktest', 'cache')
INSTR = {'EURUSD': 'eurusd_m1.parquet', 'GBPUSD': 'gbpusd_m1.parquet', 'AUDUSD': 'audusd_m1.parquet',
         'NZDUSD': 'nzdusd_m1.parquet', 'USDCAD': 'usdcad_m1.parquet', 'USDCHF': 'usdchf_m1.parquet'}
FX = list(INSTR)

# fx band constants (BM/HN × fx corrections, from js/volBacktestEngine.js) — σ-frac multipliers
C_MED = 1.572 * 0.820      # 1.28904  median H-L
C_75  = 2.049 * 0.817      # 1.674    75th   H-L
OC_MED = 0.6745 * 1.038    # 0.70014  OC-median close level (fade target)
SLMULT = 1.5
COST_PCT = 0.012           # round-trip spread, % of price (forecastCore default fx)
SLIP_PCT = 0.006           # breakout-entry slippage, % of price
MIN_BARS = 60


def _dstr(di): return (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(di))).isoformat()


def _resolve(order, hi, lo, cl, O, slD):
    """Port of forecastCore resolveDynOrder. order fields: isBuy, typ('stop'|'limit'),
    slSign, lvl(k), tp(fill)|None. tp None → no target: SL only, else mark to close
    (the "let it run" exit). Returns (pnl_pct_gross, fillIdx) or None (no fill)."""
    isBuy, typ, slSign, lvlf, tpf = order['isBuy'], order['typ'], order['slSign'], order['lvl'], order['tp']
    n = hi.size
    filled = False; entry = sl = tp = 0.0; fidx = -1; has_tp = tpf is not None
    for k in range(n):
        if not filled:
            L = lvlf(k)
            if isBuy:
                hit = hi[k] >= L if typ == 'stop' else lo[k] <= L
            else:
                hit = lo[k] <= L if typ == 'stop' else hi[k] >= L
            if not hit:
                continue
            filled = True; entry = L; fidx = k; sl = entry + slSign * slD
            tp = tpf(k) if has_tp else 0.0; is_fill_bar = True
        else:
            is_fill_bar = False
        tp_knowable = has_tp and ((not is_fill_bar) or typ == 'stop')  # limit TP not resolvable on fill bar
        if isBuy:
            if lo[k] <= sl: return (-((entry - sl) / O * 100), fidx)
            if tp_knowable and hi[k] >= tp: return (((tp - entry) / O * 100), fidx)
        else:
            if hi[k] >= sl: return (-((sl - entry) / O * 100), fidx)
            if tp_knowable and lo[k] <= tp: return (((entry - tp) / O * 100), fidx)
    if not filled:
        return None
    eod = cl[-1]
    pnl = (eod - entry) / O * 100 if isBuy else (entry - eod) / O * 100
    return (pnl, fidx)


def _day_trade(hi, lo, cl, O, s, action, slMult=SLMULT, tp_mode='band'):
    """One day's dynamic-HL trade (band=hl50). action 'follow'|'fade'.
    tp_mode: 'band'=TP at 75th (follow) / OC-med (fade); 'close'=no TP, SL only + mark
    to session close (the 'let winners run' exit). Returns (pnl_net_pct, risk_pct) or None."""
    n = hi.size
    hl, hlOut = C_MED * s, C_75 * s
    slD = O * hl * slMult
    slip = O * SLIP_PCT / 100
    # lagged running extremes (strictly before k), seeded at open — no lookahead
    runHi = np.empty(n); runLo = np.empty(n)
    rh = rl = O
    for k in range(n):
        runHi[k] = rh; runLo[k] = rl
        if hi[k] > rh: rh = hi[k]
        if lo[k] < rl: rl = lo[k]
    if action == 'follow':
        tp_up = None if tp_mode == 'close' else (lambda f: runLo[f]*(1+hlOut))
        tp_dn = None if tp_mode == 'close' else (lambda f: runHi[f]*(1-hlOut))
        orders = [
            dict(isBuy=True,  typ='stop', slSign=-1, lvl=lambda k: runLo[k]*(1+hl)+slip, tp=tp_up),
            dict(isBuy=False, typ='stop', slSign=+1, lvl=lambda k: runHi[k]*(1-hl)-slip, tp=tp_dn),
        ]
    else:  # fade → OC-median close target (static off open); OC_MED is a σ-multiplier → ×s
        ocm = OC_MED * s
        tp_up = None if tp_mode == 'close' else (lambda f: O*(1+ocm))
        tp_dn = None if tp_mode == 'close' else (lambda f: O*(1-ocm))
        orders = [
            dict(isBuy=False, typ='limit', slSign=+1, lvl=lambda k: runLo[k]*(1+hl), tp=tp_up),
            dict(isBuy=True,  typ='limit', slSign=-1, lvl=lambda k: runHi[k]*(1-hl), tp=tp_dn),
        ]
    best = None
    for o in orders:
        r = _resolve(o, hi, lo, cl, O, slD)
        if r is None:
            continue
        pnl, fidx = r
        if best is None or fidx < best[1]:
            best = (pnl, fidx)
    if best is None:
        return None
    pnl_net = best[0] - COST_PCT
    risk = hl * slMult * 100            # initial risk % of price (= |entry−SL|/O·100)
    return (pnl_net, risk)


def _shuffle_day(hi, lo, cl, O, rng):
    """Placebo: rebuild the intraday path from SHUFFLED 1-bar close returns (keeps the
    marginal/fat-tail, destroys serial correlation). High/low reconstructed around the
    shuffled close path using each bar's original (high-close, close-low) wick offsets,
    also shuffled with the bar. Returns (hi,lo,cl) arrays anchored at O."""
    n = cl.size
    r = np.empty(n); r[0] = np.log(cl[0] / O) if cl[0] > 0 and O > 0 else 0
    r[1:] = np.log(np.maximum(cl[1:], 1e-12) / np.maximum(cl[:-1], 1e-12))
    up_w = np.maximum(hi - cl, 0); dn_w = np.maximum(cl - lo, 0)
    idx = rng.permutation(n)
    r2, up2, dn2 = r[idx], up_w[idx], dn_w[idx]
    c2 = O * np.exp(np.cumsum(r2))
    return c2 + up2, c2 - dn2, c2


def run_pair(pair, action, slMult=SLMULT, tp_mode='band', placebo=False, seed=1):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size
    split = nd // 2
    rng = np.random.default_rng(seed)
    trades = []  # (pnl_net, risk, seg)
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = m1['open'][a]
        if not (O > 0):
            continue
        hi = m1['high'][a:b].copy(); lo = m1['low'][a:b].copy(); cl = m1['close'][a:b].copy()
        if placebo:
            hi, lo, cl = _shuffle_day(hi, lo, cl, O, rng)
        r = _day_trade(hi, lo, cl, O, s, action, slMult=slMult, tp_mode=tp_mode)
        if r is None:
            continue
        trades.append((r[0], r[1], 0 if i < split else 1))
    return np.array(trades) if trades else np.empty((0, 3)), _dstr(daily['day_idx'][split])


def _stats(t):
    if t.shape[0] == 0:
        return None
    pnl = t[:, 0]; risk = t[:, 1]
    R = pnl / risk
    mean, sd = pnl.mean(), pnl.std(ddof=1) if pnl.size > 1 else 0
    sharpe = (mean / sd * np.sqrt(252)) if sd > 0 else 0   # rough: ~≤1 trade/day
    return dict(n=int(pnl.size), win=float((pnl > 0).mean()), mean_pct=float(mean),
                expR=float(R.mean()), sharpe=float(sharpe), tot_pct=float(pnl.sum()))


def _fmt(st):
    return (f"n={st['n']:4d}  win={st['win']*100:4.1f}%  mean={st['mean_pct']:+.4f}%  "
            f"expR={st['expR']:+.3f}  Sharpe≈{st['sharpe']:+.2f}") if st else "  (no trades)"


# pre-registered configs: (label, action, slMult, tp_mode). The follow set tests the
# exit design, not just one crippled target — 'band' caps winners (bad), 'close' lets
# them run to session close (the "let winners run" principle) with wide/tight stops.
CONFIGS = [
    ('follow·75th·slOpen', 'follow', 1.0, 'band'),   # the Phase-6 race, costed (TP 75th, SL≈open)
    ('follow·75th·sl1.5',  'follow', 1.5, 'band'),   # wider stop
    ('follow·run·sl1.0',   'follow', 1.0, 'close'),  # let it run to close, moderate stop
    ('follow·run·sl0.5',   'follow', 0.5, 'close'),  # let it run, tight stop (cut losers fast)
    ('fade·ocmed·sl1.5',   'fade',   1.5, 'band'),   # the textbook incumbent
]


def main():
    pairs = sys.argv[1:] or FX
    placebo = 'placebo' in pairs
    pairs = [p for p in pairs if p != 'placebo'] or FX
    tag = ' [PLACEBO: shuffled intraday returns]' if placebo else ''
    print(f"\n{'='*94}\nCOSTED median-line FOLLOW vs FADE (dynamic lines, cost {COST_PCT}%+slip {SLIP_PCT}%, IS/OOS){tag}\n"
          f"median={C_MED:.3f}σ 75th={C_75:.3f}σ fade-target OC-med={OC_MED:.3f}σ\n"
          f"NULL: driftless walk → 0 net expectancy. Bar = net>0 IS AND OOS on pooled FX.\n{'='*94}")
    agg = {c[0]: {0: [], 1: []} for c in CONFIGS}
    for pair in pairs:
        print(f"\n=== {pair} ===")
        for label, action, slM, tpm in CONFIGS:
            t, _ = run_pair(pair, action, slMult=slM, tp_mode=tpm, placebo=placebo)
            row = []
            for seg, lab in [(0, 'IS'), (1, 'OOS')]:
                sub = t[t[:, 2] == seg]
                agg[label][seg].append(sub)
                row.append(f"{lab} {_fmt(_stats(sub))}")
            print(f"  {label:18}  {row[0]}   |   {row[1]}")
    print(f"\n{'='*94}\nPOOLED FX{tag}   (the honest read)\n{'='*94}")
    for label, *_ in CONFIGS:
        for seg, lab in [(0, 'IS'), (1, 'OOS')]:
            allt = np.vstack(agg[label][seg]) if agg[label][seg] else np.empty((0, 3))
            print(f"  {label:18} {lab:3}: {_fmt(_stats(allt))}")


if __name__ == '__main__':
    main()
