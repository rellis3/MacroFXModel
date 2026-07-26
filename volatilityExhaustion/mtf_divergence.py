"""
mtf_divergence.py — does a VuManChu WaveTrend regular divergence that AGREES across a
lower AND higher timeframe beat the single-timeframe divergence? (the owner's MTF idea)

Faithful to the operator's TradingView VuManChu: WaveTrend wt2 at 9/12/3, OB/OS 45/−65,
5-bar fractal (reach 2), regular divergences only (reversal/fade). The WaveTrend port is
cross-checked bit-for-bit against js/vumanchuCore.computeWaveTrend (run `... crosscheck`
+ node wt_crosscheck.mjs) — generate-don't-port + validate, per PYTHON_LEGO.md.

Trade (standalone divergence fade, NOT a level touch):
  • scan the LTF for regular divergences (bear → sell, bull → buy).
  • a divergence's recent pivot r is confirmable only at r+reach → ENTER at the close of
    bar r+reach (no lookahead). risk = |entry − swing pivot|; TP = k·risk; SL = swing.
  • MTF gate: require an ACTIVE regular divergence of the SAME bias on the HTF whose recent
    pivot is confirmed by entry time and within `htfWindow` HTF bars back.
  • one position at a time; forward first-touch on LTF bars (SL-first), costed, mark to
    close at maxHold. R-multiples, IS/OOS. A/B: LTF-only vs LTF+HTF.

Pre-registered: MTF only "works" if per-trade EXPECTANCY (R) > 0 after cost AND beats
LTF-only, OOS, on a non-trivial trade count, cross-pair. Prior is honestly low (the
single-TF VuManChu gate was null; money-flow — a VuManChu leg — is unreliable on FX).
"""
import os, sys, json, math
import numpy as np
from vol_exhaustion_lib import load_m1

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'portfolioBacktest', 'cache')
INSTR = {'EURUSD': 'eurusd_m1.parquet', 'GBPUSD': 'gbpusd_m1.parquet', 'AUDUSD': 'audusd_m1.parquet',
         'NZDUSD': 'nzdusd_m1.parquet', 'USDCAD': 'usdcad_m1.parquet', 'USDCHF': 'usdchf_m1.parquet'}
FX = list(INSTR)
WT_EPS = 1e-10
WT = dict(n1=9, n2=12, sp=3)      # operator's TradingView params
OB, OS = 45, -65
REACH = 2
COST_PCT = 0.012                  # round-trip, % of price
TF_MIN = {'M5': 5, 'M15': 15, 'H1': 60}

# ── WaveTrend port (bit-for-bit with js/vumanchuCore) ────────────────────────
def ema(v, period):
    if len(v) == 0 or period <= 0:
        return np.array([])
    k = 2.0 / (period + 1)
    out = np.empty(len(v)); out[0] = v[0]
    for i in range(1, len(v)):
        out[i] = v[i] * k + out[i - 1] * (1 - k)
    return out

def sma(v, period):
    out = np.full(len(v), np.nan)
    c = np.cumsum(np.insert(v, 0, 0.0))
    for i in range(period - 1, len(v)):
        out[i] = (c[i + 1] - c[i + 1 - period]) / period
    return out

def wavetrend(h, l, c, n1, n2, sp):
    hlc3 = (h + l + c) / 3.0
    esa = ema(hlc3, n1)
    d = ema(np.abs(hlc3 - esa), n1)
    ci = np.where(d > WT_EPS, (hlc3 - esa) / (0.015 * np.where(d > WT_EPS, d, 1.0)), 0.0)
    wt1 = ema(ci, n2)
    wt2 = sma(wt1, sp)
    return wt2

# ── pivots + divergences (port of js/divergenceCore) ─────────────────────────
def pivot_highs(a, reach=REACH):
    out = []
    for i in range(reach, len(a) - reach):
        if all(a[i] > a[i - j] and a[i] > a[i + j] for j in range(1, reach + 1)):
            out.append(i)
    return out

def pivot_lows(a, reach=REACH):
    out = []
    for i in range(reach, len(a) - reach):
        if all(a[i] < a[i - j] and a[i] < a[i + j] for j in range(1, reach + 1)):
            out.append(i)
    return out

def regular_divergences(price_hi, price_lo, osc, reach=REACH, ob=OB, os_=OS):
    """Returns list of (bias, iPrev, iRec) for REGULAR divergences (OB/OS-gated)."""
    tops = [i for i in pivot_highs(osc, reach) if osc[i] >= ob]
    bots = [i for i in pivot_lows(osc, reach) if osc[i] <= os_]
    out = []
    for k in range(1, len(tops)):
        p, r = tops[k - 1], tops[k]
        if price_hi[r] > price_hi[p] and osc[r] < osc[p]:
            out.append(('bear', p, r))
    for k in range(1, len(bots)):
        p, r = bots[k - 1], bots[k]
        if price_lo[r] < price_lo[p] and osc[r] > osc[p]:
            out.append(('bull', p, r))
    return out

# ── resample M1 → TF (grouped by floor(minute/tf)) ───────────────────────────
def resample(m1, tf_min):
    um = m1['utc_min']
    bucket = um // tf_min
    change = np.empty(bucket.shape, dtype=bool); change[0] = True; change[1:] = bucket[1:] != bucket[:-1]
    starts = np.flatnonzero(change); ends = np.append(starts[1:], bucket.size)
    o = m1['open'][starts]
    c = m1['close'][ends - 1]
    h = np.array([m1['high'][s:e].max() for s, e in zip(starts, ends)])
    lo = np.array([m1['low'][s:e].min() for s, e in zip(starts, ends)])
    t = bucket[starts] * tf_min           # bucket start minute (epoch minutes)
    return dict(open=o, high=h, low=lo, close=c, tmin=t)

# ── the backtest ─────────────────────────────────────────────────────────────
def run(pair, ltf, htf, rr=2.0, htf_window=5, max_hold=200, split_frac=0.5, min_risk_pct=0.05):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    L = resample(m1, TF_MIN[ltf]); H = resample(m1, TF_MIN[htf])
    lw = wavetrend(L['high'], L['low'], L['close'], **WT)
    hw = wavetrend(H['high'], H['low'], H['close'], **WT)
    # HTF regular divergences → (bias, confirm_tmin, pivot_tmin)
    htf_divs = []
    for bias, p, r in regular_divergences(H['high'], H['low'], hw):
        if r + REACH < len(H['tmin']):
            htf_divs.append((bias, H['tmin'][r + REACH], H['tmin'][r]))
    htf_window_min = htf_window * TF_MIN[htf]

    def htf_active(bias, t_entry):
        for b, ct, pt in htf_divs:
            if b == bias and ct <= t_entry and (t_entry - pt) <= htf_window_min:
                return True
        return False

    # LTF signals (entry at r+REACH), sequential (one position at a time)
    sigs = sorted(regular_divergences(L['high'], L['low'], lw), key=lambda x: x[2])
    n = len(L['close']); tsplit = L['tmin'][int(n * split_frac)]
    trades_only, trades_mtf = [], []
    open_until = -1
    for bias, p, r in sigs:
        e = r + REACH
        if e >= n - 1 or e <= open_until:
            continue
        entry = L['close'][e]; t_entry = L['tmin'][e]
        if bias == 'bear':
            stop = L['high'][r]; risk = stop - entry
            if risk <= 0 or risk / entry * 100 < min_risk_pct: continue   # skip degenerate tiny-stop setups
            tp = entry - rr * risk; is_buy = False
        else:
            stop = L['low'][r]; risk = entry - stop
            if risk <= 0 or risk / entry * 100 < min_risk_pct: continue
            tp = entry + rr * risk; is_buy = True
        # forward first-touch on LTF
        res = None; exit_i = min(n - 1, e + max_hold)
        for k in range(e + 1, exit_i + 1):
            if is_buy:
                if L['low'][k] <= stop: res = -1.0; break
                if L['high'][k] >= tp: res = rr; break
            else:
                if L['high'][k] >= stop: res = -1.0; break
                if L['low'][k] <= tp: res = rr; break
        if res is None:
            exitpx = L['close'][exit_i]
            res = ((entry - exitpx) if not is_buy else (exitpx - entry)) / risk
        cost_R = (COST_PCT / 100 * entry) / risk
        net = res - cost_R
        seg = 0 if t_entry < tsplit else 1
        open_until = exit_i
        trades_only.append((net, seg))
        if htf_active(bias, t_entry):
            trades_mtf.append((net, seg))
    return trades_only, trades_mtf

def _stats(rows):
    if not rows:
        return None
    a = np.array([r[0] for r in rows]); seg = np.array([r[1] for r in rows])
    def s(m):
        x = a[m]
        return None if x.size == 0 else dict(n=int(x.size), exp=float(x.mean()), win=float((x > 0).mean()))
    return dict(all=s(np.ones_like(seg, bool)), IS=s(seg == 0), OOS=s(seg == 1))

def _fmt(st):
    if not st: return "  —"
    def c(d): return f"n={d['n']:4d} exp={d['exp']:+.3f}R win={d['win']*100:4.1f}%" if d else "—"
    return f"IS[{c(st['IS'])}]  OOS[{c(st['OOS'])}]"

def crosscheck():
    """Write synthetic bars for the JS WaveTrend cross-check, compare if JS output exists."""
    rng = np.random.default_rng(7)
    n = 400
    c = 100 * np.exp(np.cumsum(rng.normal(0, 0.001, n)))
    o = np.empty(n); o[0] = 100; o[1:] = c[:-1]
    span = np.abs(rng.normal(0, 0.0008, n)) * c
    h = np.maximum(o, c) + span; l = np.minimum(o, c) - span
    bars = [dict(open=float(o[i]), high=float(h[i]), low=float(l[i]), close=float(c[i])) for i in range(n)]
    with open(os.path.join(HERE, '_wt_bars.json'), 'w') as f:
        json.dump({'bars': bars, 'wt': WT}, f)
    py = wavetrend(h, l, c, **WT)
    jsf = os.path.join(HERE, '_wt_js.json')
    if os.path.exists(jsf):
        js = np.array([np.nan if x is None else x for x in json.load(open(jsf))], dtype=float)
        m = ~np.isnan(py) & ~np.isnan(js)
        diff = np.max(np.abs(py[m] - js[m]))
        print(f"WaveTrend Py-vs-JS max|Δ| = {diff:.2e}  → {'MATCH' if diff < 1e-9 else 'DRIFT!'}")
    else:
        print("wrote _wt_bars.json — now run: node wt_crosscheck.mjs, then re-run crosscheck")

def main():
    args = sys.argv[1:]
    if args and args[0] == 'crosscheck':
        crosscheck(); return
    pairs = args or FX
    for ltf, htf in [('M5', 'M15'), ('M15', 'H1')]:
        print(f"\n{'='*92}\nMTF regular-divergence fade  {ltf}+{htf}  (WT 9/12/3, OB/OS 45/-65, RR 2, cost {COST_PCT}%)\n"
              f"Bar: MTF per-trade expectancy(R) > 0 OOS AND beats LTF-only.\n{'='*92}")
        agg_only, agg_mtf = [], []
        for pair in pairs:
            to, tm = run(pair, ltf, htf)
            agg_only += to; agg_mtf += tm
            print(f"  {pair}: LTF-only {_fmt(_stats(to))}")
            print(f"  {pair}: LTF+HTF  {_fmt(_stats(tm))}")
        print(f"  {'-'*88}")
        print(f"  POOLED LTF-only {_fmt(_stats(agg_only))}")
        print(f"  POOLED LTF+HTF  {_fmt(_stats(agg_mtf))}")

if __name__ == '__main__':
    main()
