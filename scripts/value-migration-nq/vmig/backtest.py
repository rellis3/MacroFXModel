"""Event-driven backtest on RTH minutes (prereg section 3.6).

Timing: a decision uses only minutes that have closed. A signal formed on the close of minute j enters at the
OPEN of minute j+1. Box states are known after the box's last minute closes.

Entries (one position per strategy at a time; re-entry allowed after an exit; no new entry after 15:30):
  cont  continuation: at the first minute after box k closes, with state(k) = +1, box k closed above its own POC
        and POC(k) > POC(k-1) (value still migrating up, price accepted above value). Stop ref = min(L(k), VAL(k)).
  pull  pullback/reload: with state = +1 from the last completed box k (the "zone box"), a minute after box k that
        trades down to POC(k) arms the setup; it disarms if a minute closes below VAL(k). An armed setup triggers on a
        minute that closes above its open, with positive delta, back above POC(k). Stop ref = min(lowest low since
        arming, VAL(k)).
  Shorts mirror both. Stop = stop ref -/+ 2 ticks. Risk floor 0.25 sigma_b (stop widened), cap 1.5 sigma_b (skip).
Exits:
  r1 / r2  fixed target at 1R / 2R (limit; fills only if price trades 1 tick through it), initial stop.
  trail    initial stop; boxes that close entirely after entry and are directional (POC above the previous box's
           POC and close above open, for a long) are counted. After 2 such boxes the stop moves to entry; after
           each further one it trails to that box's low - 2 ticks. Stops only ratchet.
  All: flat at the 15:55 open. Stop and target in the same minute -> stop (conservative; counted).
Costs (net): market fills (entry, stop, time exit) pay `slip_ticks` per side; commission+fees `comm_rt` USD per
round turn. Gross: no slippage, no commission, targets fill on touch.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np

from .data import TICK, POINT_VALUE

LAST_ENTRY_M = 360   # 15:30
FLAT_M = 385         # 15:55
STOP_BUFFER_TICKS = 2
RISK_FLOOR = 0.25
RISK_CAP = 1.5


@dataclass(frozen=True)
class Costs:
    comm_rt: float = 4.50       # USD per round turn: broker commission + CME exchange + NFA/clearing fees
    slip_ticks: float = 1.0     # per market fill: half the 1-tick spread plus slippage
    through_ticks: float = 1.0  # a limit target needs a print this many ticks beyond it
    gross: bool = False

    def dict(self):
        return asdict(self)


GROSS = Costs(comm_rt=0.0, slip_ticks=0.0, through_ticks=0.0, gross=True)
NET = Costs()
STRESS = Costs(comm_rt=4.50, slip_ticks=2.0, through_ticks=1.0)


class Market:
    """Arrays for one sample: minutes (n_days x 390) and boxes (n_days x nb), rows aligned to `days`."""

    def __init__(self, mins, boxes, B, sigma_b_by_day):
        self.days = np.sort(mins["day"].unique())
        piv = lambda c: mins.pivot(index="day", columns="m", values=c).reindex(self.days).values
        self.O, self.H, self.L, self.C, self.D = (piv(c) for c in ("open", "high", "low", "close", "delta"))
        bp = lambda c: boxes.pivot(index="day", columns="k", values=c).reindex(self.days).values
        self.bO, self.bH, self.bL, self.bC = (bp(c) for c in ("O", "H", "L", "C"))
        self.bPOC, self.bVAH, self.bVAL = (bp(c) for c in ("POC", "VAH", "VAL"))
        self.B = B
        self.nb = self.bPOC.shape[1]
        self.sig = np.array([sigma_b_by_day.get(d, np.nan) for d in self.days])
        self.dates = mins.groupby("day")["date"].first().reindex(self.days).values

    def state_matrix(self, f, model):
        st = np.zeros((len(self.days), self.nb), dtype=np.int8)
        pos = np.searchsorted(self.days, f["day"].values)
        st[pos, f["k"].values] = np.sign(f[model].values).astype(np.int8)
        return st


def _manage(mk: Market, r, m0, d, entry, stop, risk, exit_type, costs: Costs):
    O, H, L, C = mk.O[r], mk.H[r], mk.L[r], mk.C[r]
    B = mk.B
    slip = costs.slip_ticks * TICK
    thru = costs.through_ticks * TICK
    mult = {"r1": 1.0, "r2": 2.0}.get(exit_type)
    target = entry + d * mult * risk if mult else None
    buf = STOP_BUFFER_TICKS * TICK
    qual = 0
    best = worst = entry
    amb = False
    for j in range(m0, FLAT_M):
        if exit_type == "trail" and j > m0 and j % B == 0:
            kb = j // B - 1
            if kb >= 1 and kb * B >= m0:
                if d > 0:
                    ok = mk.bPOC[r, kb] > mk.bPOC[r, kb - 1] and mk.bC[r, kb] > mk.bO[r, kb]
                else:
                    ok = mk.bPOC[r, kb] < mk.bPOC[r, kb - 1] and mk.bC[r, kb] < mk.bO[r, kb]
                if ok:
                    qual += 1
                    if qual == 2:
                        stop = max(stop, entry) if d > 0 else min(stop, entry)
                    elif qual > 2:
                        stop = max(stop, mk.bL[r, kb] - buf) if d > 0 else min(stop, mk.bH[r, kb] + buf)
        o, h, l = O[j], H[j], L[j]
        if d > 0:
            if j > m0 and o <= stop:
                return j, o - slip, "stop_gap", best, min(worst, l), amb
            hs = l <= stop
            ht = target is not None and h >= target + thru
            best, worst = max(best, h), min(worst, l)
            if hs:
                amb = amb or ht
                return j, stop - slip, "stop", best, worst, amb
            if ht:
                return j, target, "target", best, worst, amb
        else:
            if j > m0 and o >= stop:
                return j, o + slip, "stop_gap", best, max(worst, h), amb
            hs = h >= stop
            ht = target is not None and l <= target - thru
            best, worst = min(best, l), max(worst, h)
            if hs:
                amb = amb or ht
                return j, stop + slip, "stop", best, worst, amb
            if ht:
                return j, target, "target", best, worst, amb
    return FLAT_M, O[FLAT_M] - d * slip, "time", best, worst, amb


def _record(mk, r, m0, d, entry, stop0, risk, res, costs, extra=None):
    j, px, reason, best, worst, amb = res
    pts = d * (px - entry)
    usd = pts * POINT_VALUE - costs.comm_rt
    t = {"day": int(mk.days[r]), "date": mk.dates[r], "entry_m": int(m0), "exit_m": int(j), "dir": int(d),
         "entry": float(entry), "stop0": float(stop0), "risk": float(risk), "exit": float(px), "reason": reason,
         "pts": float(pts), "usd": float(usd), "R": float(usd / (risk * POINT_VALUE)),
         "mfe_R": float(d * (best - entry) / risk), "mae_R": float(d * (worst - entry) / risk),
         "ambiguous": bool(amb), "risk_sig": float(risk / mk.sig[r])}
    if extra:
        t.update(extra)
    return t


def run(mk: Market, st: np.ndarray, K: int, entry_type: str, exit_type: str, costs: Costs = NET):
    trades, skipped = [], 0
    B = mk.B
    slip = costs.slip_ticks * TICK
    buf = STOP_BUFFER_TICKS * TICK
    for r in range(len(mk.days)):
        sig = mk.sig[r]
        if not np.isfinite(sig) or not st[r].any():
            continue
        O, H, L, C, D = mk.O[r], mk.H[r], mk.L[r], mk.C[r], mk.D[r]
        armed, low_since, arm_dir = False, None, 0
        m = B * (K + 1)
        while m <= LAST_ENTRY_M:
            kc = m // B - 1
            s = int(st[r, kc]) if kc >= K else 0
            if s == 0:
                armed = False
                m += 1
                continue
            stop_ref = None
            if entry_type == "cont":
                if m % B == 0:
                    if s > 0 and mk.bC[r, kc] > mk.bPOC[r, kc] and mk.bPOC[r, kc] > mk.bPOC[r, kc - 1]:
                        stop_ref = min(mk.bL[r, kc], mk.bVAL[r, kc])
                    elif s < 0 and mk.bC[r, kc] < mk.bPOC[r, kc] and mk.bPOC[r, kc] < mk.bPOC[r, kc - 1]:
                        stop_ref = max(mk.bH[r, kc], mk.bVAH[r, kc])
            else:
                j = m - 1
                if armed and arm_dir != s:
                    armed = False
                if j >= (kc + 1) * B:
                    zp, zl, zh = mk.bPOC[r, kc], mk.bVAL[r, kc], mk.bVAH[r, kc]
                    if s > 0:
                        if L[j] <= zp:
                            if not armed:
                                armed, low_since, arm_dir = True, L[j], s
                            low_since = min(low_since, L[j])
                        if armed and C[j] < zl:
                            armed = False
                        elif armed and C[j] > O[j] and D[j] > 0 and C[j] > zp:
                            stop_ref = min(low_since, zl)
                    else:
                        if H[j] >= zp:
                            if not armed:
                                armed, low_since, arm_dir = True, H[j], s
                            low_since = max(low_since, H[j])
                        if armed and C[j] > zh:
                            armed = False
                        elif armed and C[j] < O[j] and D[j] < 0 and C[j] < zp:
                            stop_ref = max(low_since, zh)
            if stop_ref is None:
                m += 1
                continue
            d = s
            entry = O[m] + d * slip
            stop = stop_ref - d * buf
            risk = d * (entry - stop)
            if risk < RISK_FLOOR * sig:
                risk = RISK_FLOOR * sig
                stop = entry - d * risk
            if risk > RISK_CAP * sig:
                skipped += 1
                armed = False
                m += 1
                continue
            res = _manage(mk, r, m, d, entry, stop, risk, exit_type, costs)
            trades.append(_record(mk, r, m, d, entry, stop, risk, res, costs))
            armed = False
            m = res[0] + 1
    return trades, skipped


def run_forced(mk: Market, entries, exit_type: str, costs: Costs = NET):
    """Placebo/random control: entries = iterable of (row, m, dir, risk_sig). Same exits and costs."""
    out = []
    slip = costs.slip_ticks * TICK
    for r, m, d, rs in entries:
        sig = mk.sig[r]
        if not np.isfinite(sig):
            continue
        entry = mk.O[r, m] + d * slip
        risk = rs * sig
        stop = entry - d * risk
        res = _manage(mk, r, m, d, entry, stop, risk, exit_type, costs)
        out.append(_record(mk, r, m, d, entry, stop, risk, res, costs))
    return out
