"""
Study 9 - MERGING SIGNALS FOR CONFIDENCE (confluence / vote).

Every study so far scores ONE mechanism at a time, and every one comes in
close to a coin flip. The real question a discretionary trader is actually
asking when they say "three things lined up so I took the trade" is
different: does AGREEMENT across independently-derived signals raise the
hit rate, the way averaging independent noisy estimators should - or are
these signals all just reading the same underlying "trend day," so voting
adds the appearance of confidence without adding real information?

Six signals, each cast at a fixed checkpoint T = 13:00 UK (the London/NY
handoff already used elsewhere in this suite), each strictly causal (uses
only bars before T), each worth exactly one vote in {-1, 0, +1}:

  mom    sign(price at T - open)                          - raw momentum
  vwap   sign(price at T - session VWAP at T)              - mean-anchor
  asia   direction of the first Asia-range break before T  - session structure
  pdlvl  net reaction (break=away, reject=toward) at the first
         PDH/PDL touch before T                            - prior-day level
  swing  reaction (break/reject) of the LAST confirmed intraday
         swing retest resolved before T                    - studies_retest.py's pattern
  fib    outcome (continuation/failure) of the LAST impulse-leg
         fib pullback resolved before T                    - studies_fib.py's pattern

Target: sign(close - price at T) - the REST of the day, overlap-free with
every signal (all of which see only bars before T).

Reported: accuracy of the majority vote vs. each signal alone, split by
|net vote| (how many agree) and by breadth (how many signals fired at
all that day) - plus the pairwise agreement matrix between signals, which
is the check for whether they are actually independent or just five
readings of the same thermometer.
"""
from __future__ import annotations
import numpy as np
from .data import Days, INSTRUMENTS, vol_regime
from .stats import prop_ci, summarize, trade_stats, binom_p, is_oos
from .studies_vwap import session_vwap
from .studies_retest import _confirmed_pivots, REACT_ADR
from .studies_fib import fib_events

SIGNAL_NAMES = ["mom", "vwap", "asia", "pdlvl", "swing", "fib"]


def _sign(x):
    return 0 if x == 0 else (1 if x > 0 else -1)


def _day_signals(days: Days, i: int, theta_adr: float = 0.15):
    o, h, l, c, v, ms = days.arrays(i)
    lh = days.london_hours(i)
    adr = days.adr20[i]
    tj = np.flatnonzero((lh >= 13.0) & (lh < 20.0))
    if not tj.size or tj[0] < 60 or tj[0] > len(c) - 30:
        return None
    T = int(tj[0])
    oT, hT, lT, cT = o[:T], h[:T], l[:T], c[:T]
    sig = {}

    # 1. momentum
    sig["mom"] = _sign(c[T] - o[0])

    # 2. VWAP side
    vwap, sigma = session_vwap(hT, lT, cT, v[:T])
    sig["vwap"] = _sign(c[T] - vwap[-1])

    # 3. Asia range first break (Asia = open .. lh>=7.0)
    a_end = np.flatnonzero((lh >= 7.0) & (lh < 20.0))
    sig["asia"] = 0
    if a_end.size and a_end[0] < T and a_end[0] >= 60:
        ae = int(a_end[0])
        ah, al = h[:ae].max(), l[:ae].min()
        rest_c = c[ae:T]
        iu = np.flatnonzero(rest_c > ah); idn = np.flatnonzero(rest_c < al)
        if iu.size or idn.size:
            first_up = iu.size and (not idn.size or iu[0] < idn[0])
            sig["asia"] = 1 if first_up else -1

    # 4. PDH/PDL touch + reaction before T
    net = 0
    if i > 0:
        pdh, pdl = days.d_high[i - 1], days.d_low[i - 1]
        if hT.max() >= pdh:
            net += 1 if c[T] > pdh else -1     # broke on = bullish, rejected back = bearish
        if lT.min() <= pdl:
            net += -1 if c[T] < pdl else 1     # broke through = bearish, rejected back = bullish
    sig["pdlvl"] = _sign(net)

    # 5. last confirmed swing retest resolved before T
    theta = theta_adr * adr
    react = REACT_ADR * adr
    sig["swing"] = 0
    for pi, pp, kind, ci in reversed(_confirmed_pivots(hT, lT, theta)):
        start = ci + 1
        if start >= T:
            continue
        touch = np.flatnonzero((lT[start:] <= pp) & (hT[start:] >= pp))
        if not touch.size:
            continue
        j = start + int(touch[0])
        if j + 1 >= T:
            continue
        is_high = kind == "H"
        hh, ll = h[j + 1:T], l[j + 1:T]
        if is_high:
            ti = np.flatnonzero(hh >= pp + react); bi = np.flatnonzero(ll <= pp - react)
        else:
            ti = np.flatnonzero(ll <= pp - react); bi = np.flatnonzero(hh >= pp + react)
        if not ti.size and not bi.size:
            continue
        broke = (ti.size and (not bi.size or ti[0] < bi[0]))
        sig["swing"] = (1 if broke else -1) * (1 if is_high else -1)
        break

    # 6. last impulse-leg fib pullback resolved before T
    sig["fib"] = 0
    max_open = int(ms[T - 1]) if T > 0 else 0
    events = fib_events(hT, lT, theta, ms[:T], max_open)
    for i0, p0, i1, p1, up, k_open in reversed(events):
        leg = abs(p1 - p0)
        if leg <= 0 or k_open + 1 >= T:
            continue
        depth_series = ((p1 - l[k_open:T]) if up else (h[k_open:T] - p1)) / leg
        beyond = ((h[k_open:T] > p1) if up else (l[k_open:T] < p1))
        ci_ = np.flatnonzero(beyond); fi_ = np.flatnonzero(depth_series >= 1.0)
        if not ci_.size and not fi_.size:
            continue
        cont = ci_.size and (not fi_.size or ci_[0] < fi_[0])
        sig["fib"] = (1 if cont else -1) * (1 if up else -1)
        break

    y = _sign(c[-1] - c[T])
    return sig, y, T


def confluence_study(days: Days, pair: str) -> dict:
    cost = INSTRUMENTS[pair]["cost"]
    rows = []
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        r = _day_signals(days, i)
        if r is None:
            continue
        sig, y, T = r
        if y == 0:
            continue
        vals = np.array([sig[k] for k in SIGNAL_NAMES])
        rows.append({"day": i, "sig": sig, "vals": vals, "y": y, "T": T,
                     "net": int(vals.sum()), "active": int((vals != 0).sum()),
                     "regime": vol_regime(days, i)})

    out = {"n_days": len(rows), "cutoff": "13:00 UK"}

    # marginal accuracy of each signal alone
    out["marginal"] = {}
    for k in SIGNAL_NAMES:
        xs = [r for r in rows if r["sig"][k] != 0]
        agree = sum(1 for r in xs if r["sig"][k] == r["y"])
        ci = prop_ci(agree, len(xs)); ci["p_vs_50"] = binom_p(agree, len(xs))
        out["marginal"][k] = ci

    # pairwise agreement matrix (P(same sign | both active))
    out["pairwise_agreement_pct"] = {}
    for a in range(len(SIGNAL_NAMES)):
        for b in range(a + 1, len(SIGNAL_NAMES)):
            ka, kb = SIGNAL_NAMES[a], SIGNAL_NAMES[b]
            xs = [r for r in rows if r["sig"][ka] != 0 and r["sig"][kb] != 0]
            if len(xs) < 30:
                continue
            same = sum(1 for r in xs if r["sig"][ka] == r["sig"][kb])
            out["pairwise_agreement_pct"][f"{ka}-{kb}"] = {"n": len(xs), "p": round(100 * same / len(xs), 1)}

    voted = [r for r in rows if r["net"] != 0]

    def vote_block(xs):
        n = len(xs)
        acc = sum(1 for r in xs if _sign(r["net"]) == r["y"])
        ci = prop_ci(acc, n); ci["p_vs_50"] = binom_p(acc, n)
        adr_at = lambda r: days.adr20[r["day"]]
        sims = []
        for r in xs:
            i = r["day"]; o, h, l, c, v, ms = days.arrays(i)
            T = r["T"]; adr = days.adr20[i]
            entry = c[T]; direction = _sign(r["net"])
            stop = entry - direction * 0.5 * adr
            target = entry + direction * 1.0 * adr
            hh, ll, cc = h[T + 1:], l[T + 1:], c[T + 1:]
            if direction > 0:
                ti = np.flatnonzero(hh >= target); si = np.flatnonzero(ll <= stop)
            else:
                ti = np.flatnonzero(ll <= target); si = np.flatnonzero(hh >= stop)
            ti = ti[0] if ti.size else np.inf; si = si[0] if si.size else np.inf
            risk = 0.5 * adr
            if ti == np.inf and si == np.inf:
                pnl = (cc[-1] - entry) * direction if cc.size else 0.0
            elif ti <= si:
                pnl = 1.0 * adr
            else:
                pnl = -risk
            sims.append((pnl - cost) / risk)
        return {"n": n, "accuracy": ci, "sim_0.5ADRstop_1ADRtarget": trade_stats(sims, [cost / (0.5 * adr_at(r)) for r in xs])}

    out["accuracy_by_|net_vote|"] = {}
    out["accuracy_by_|net_vote|_is_oos"] = {}
    for k in range(1, 7):
        xs = [r for r in voted if abs(r["net"]) == k]
        if len(xs) >= 30:
            out["accuracy_by_|net_vote|"][k] = vote_block(xs)
            is_k, oos_k = is_oos(xs, "day", days.n)
            if len(is_k) >= 20 and len(oos_k) >= 20:
                out["accuracy_by_|net_vote|_is_oos"][k] = {"IS": vote_block(is_k)["accuracy"], "OOS": vote_block(oos_k)["accuracy"]}
    out["accuracy_by_breadth_active_signals"] = {}
    for k in range(1, 7):
        xs = [r for r in voted if r["active"] == k]
        if len(xs) >= 30:
            out["accuracy_by_breadth_active_signals"][k] = vote_block(xs)
    out["all_voted_days"] = vote_block(voted)
    out["single_best_signal_alone"] = out["marginal"][max(out["marginal"], key=lambda k: out["marginal"][k]["p"] or 0)]

    is_, oos = is_oos(voted, "day", days.n)
    out["is_oos"] = {"IS": vote_block(is_), "OOS": vote_block(oos)}
    out["is_oos_by_strong_vote(|net|>=3)"] = {"IS": vote_block([r for r in is_ if abs(r["net"]) >= 3]),
                                              "OOS": vote_block([r for r in oos if abs(r["net"]) >= 3])}

    # does the day's *volatility regime* explain agreement better than genuine independent confirmation?
    out["by_vol_regime_strong_vote"] = {}
    for g in ("quiet", "normal", "heavy"):
        xs = [r for r in voted if r["regime"] == g and abs(r["net"]) >= 3]
        if len(xs) >= 30:
            out["by_vol_regime_strong_vote"][g] = vote_block(xs)

    out["vote_distribution"] = {str(k): sum(1 for r in rows if r["net"] == k) for k in range(-6, 7)}
    out["breadth_distribution"] = {str(k): sum(1 for r in rows if r["active"] == k) for k in range(0, 7)}
    return out
