"""tpo-initial-balance: the study's machinery. Prereg: forge/TPO_INITIAL_BALANCE_PREREG.md (+ A1, A2).

Sessions are the US cash session, 09:30-15:59 New York, as 390 one-minute bars (index m = 0 .. 389). NT8 bars are end-stamped, so every
stamp is moved back one minute before the session is cut (faults log 2026-11-07). TPO periods are 30 minutes from 09:30: A = 0, B = 1, ...
Everything that feeds a decision at minute t uses bars <= t of this session and earlier sessions only.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.stats import norm

SEED = 20261118
N_MIN = 390
PER = 30
SCAN = range(2, 11)          # period closes C .. K (10:59 .. 14:59) may complete an event
TICK = {"NQ": 0.25, "ES": 0.25, "YM": 1.0, "RTY": 0.1}
COST = {"NQ": 0.70, "ES": 0.58, "YM": 4.0 / 5 + 2 * 1.0, "RTY": 4.0 / 50 + 2 * 0.1}   # points per round trip: 2 ticks + $4
IS_END = "2020-12-31"
START, END = "2016-01-04", "2026-08-21"


# ── data ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
@dataclass
class Sessions:
    sym: str
    days: list
    O: np.ndarray
    H: np.ndarray
    L: np.ndarray
    C: np.ndarray
    V: np.ndarray
    filled: int = 0
    dropped: int = 0
    sigma1: np.ndarray = field(default=None)   # mean RMS 1-minute close change over the previous 20 sessions (NaN in warm-up)


def load_sessions(path, sym, start="2015-11-01", end=END):
    d = pd.read_parquet(path, columns=["timestamp", "open", "high", "low", "close", "volume"])
    t = (d.timestamp - pd.Timedelta(minutes=1)).dt.tz_convert("America/New_York")
    d = d.assign(day=t.dt.strftime("%Y-%m-%d").to_numpy(), m=(t.dt.hour * 60 + t.dt.minute).to_numpy() - 570)
    d = d[(d.m >= 0) & (d.m < N_MIN) & (d.day >= start) & (d.day <= end)]
    return sessions_from_frame(d, sym)


def sessions_from_frame(d, sym):
    days, arrs, filled, dropped = [], [], 0, 0
    for day, g in d.groupby("day", sort=True):
        if len(g) < 385:
            dropped += 1
            continue
        g = g.drop_duplicates("m").set_index("m").reindex(range(N_MIN))
        miss = g.close.isna()
        filled += int(miss.sum())
        c = g.close.ffill().bfill()
        o = g.open.where(~miss, c); h = g.high.where(~miss, c); lo = g.low.where(~miss, c)
        v = g.volume.fillna(0)
        days.append(day); arrs.append(np.stack([o, h, lo, c, v]).astype(float))
    a = np.stack(arrs)
    s = Sessions(sym, days, a[:, 0], a[:, 1], a[:, 2], a[:, 3], a[:, 4], filled, dropped)
    rms = np.sqrt(np.mean(np.diff(s.C, axis=1) ** 2, axis=1))
    s.sigma1 = pd.Series(rms).rolling(20).mean().shift(1).to_numpy()
    return s


# ── events ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def period_ohlc(s, i, p):
    a, b = p * PER, p * PER + PER
    return s.O[i, a], s.H[i, a:b].max(), s.L[i, a:b].min(), s.C[i, b - 1]


def find_event(s, i):
    """First event of the session (prereg §3.4). Returns dict or None.
    kind 'acc' (accepted break, dir = break side) or 'poke' (failed poke, dir = poke side). pc = the deciding period's last minute."""
    ibh, ibl = s.H[i, :60].max(), s.L[i, :60].min()
    prev_up = prev_dn = False
    for p in SCAN:
        _, ph, pl, pcl = period_ohlc(s, i, p)
        up, dn = pcl > ibh, pcl < ibl
        if (prev_up and up) or (prev_dn and dn):
            return dict(kind="acc", dir=1 if up else -1, p=p, pc=p * PER + PER - 1, ibh=ibh, ibl=ibl)
        poke_up = ph > ibh and not up and not prev_up
        poke_dn = pl < ibl and not dn and not prev_dn
        if poke_up or poke_dn:
            if poke_up and poke_dn:   # both sides in one period: the side exceeded by more (A2 implementation note)
                d = 1 if (ph - ibh) >= (ibl - pl) else -1
            else:
                d = 1 if poke_up else -1
            return dict(kind="poke", dir=d, p=p, pc=p * PER + PER - 1, ibh=ibh, ibl=ibl, ext=ph if d > 0 else pl)
        prev_up, prev_dn = up, dn
    return None


def outcome_y(s, i, e, sign):
    h = N_MIN - e
    return sign * (s.C[i, N_MIN - 1] - s.O[i, e]) / (s.sigma1[i] * math.sqrt(h))


def placebo_sessions(rng, i, k=3, pool=250):
    lo = max(20, i - pool)
    if i - lo < k:
        return None
    return rng.choice(np.arange(lo, i), size=k, replace=False)


# ── strategies ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def simulate(s, i, e, side, stop, target, cost):
    """Long/short from O[e]; stop first, then target, else the 15:59 close. Returns (net points, gross points, exit kind)."""
    entry = s.O[i, e]
    H, L = s.H[i, e:], s.L[i, e:]
    if side > 0:
        hit_s = np.flatnonzero(L <= stop)
        hit_t = np.flatnonzero(H >= target) if target is not None else np.array([], int)
    else:
        hit_s = np.flatnonzero(H >= stop)
        hit_t = np.flatnonzero(L <= target) if target is not None else np.array([], int)
    ks = hit_s[0] if len(hit_s) else 10 ** 9
    kt = hit_t[0] if len(hit_t) else 10 ** 9
    if ks <= kt and ks < 10 ** 9:
        px, kind = stop, "stop"
    elif kt < 10 ** 9:
        px, kind = target, "target"
    else:
        px, kind = s.C[i, N_MIN - 1], "close"
    gross = side * (px - entry)
    return gross - cost, gross, kind


def trade_for_event(s, i, ev, tick, cost):
    """The registered trade (prereg §3.7) on the event session. None if skipped (stop under 4 ticks or entry already past)."""
    e = ev["pc"] + 1
    entry = s.O[i, e]
    if ev["kind"] == "acc":
        side = ev["dir"]
        stop = ev["ibh"] - tick if side > 0 else ev["ibl"] + tick
        target = None
    else:
        side = -ev["dir"]
        stop = ev["ext"] + tick if ev["dir"] > 0 else ev["ext"] - tick
        target = ev["ibl"] if side < 0 else ev["ibh"]
        if side * (target - entry) <= 0:
            return None
    dist = side * (entry - stop)
    if dist < 4 * tick:
        return None
    net, gross, kind = simulate(s, i, e, side, stop, target, cost)
    return dict(side=side, dist=dist, tdist=None if target is None else side * (target - entry), R=net / dist, gR=gross / dist, exit=kind)


def placebo_trade(s, j, e, side, dist, tdist, cost):
    entry = s.O[j, e]
    stop = entry - side * dist
    target = None if tdist is None else entry + side * tdist
    net, gross, kind = simulate(s, j, e, side, stop, target, cost)
    return net / dist, gross / dist


# ── flow and candles ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def bvc_delta(s):
    """Per-minute delta proxy (tier P): V * (2*Phi(dp / sigma1) - 1); dp = close - previous close, close - open at 09:30."""
    dp = np.diff(s.C, axis=1, prepend=np.nan)
    dp[:, 0] = s.C[:, 0] - s.O[:, 0]
    sig = np.where(np.isfinite(s.sigma1) & (s.sigma1 > 0), s.sigma1, np.nan)[:, None]
    return s.V * (2 * norm.cdf(dp / sig) - 1)


def flow_ratio(delta, V, i, a, b):
    v = V[i, a:b].sum()
    return delta[i, a:b].sum() / v if v > 0 else np.nan


def flow_z(delta, V, i, a, b, back=20):
    x = flow_ratio(delta, V, i, a, b)
    prev = [flow_ratio(delta, V, j, a, b) for j in range(max(0, i - back), i)]
    prev = np.array([p for p in prev if np.isfinite(p)])
    if len(prev) < 10 or prev.std() == 0:
        return np.nan
    return (x - prev.mean()) / prev.std()


def clv(o, h, l, c, toward):
    if h == l:
        return 0.5
    up = (c - l) / (h - l)
    return up if toward > 0 else 1 - up


# ── profiles (TPO and volume) ─────────────────────────────────────────────────────────────────────────────────────────────────
def _va(counts, share=0.7):
    n = len(counts)
    total = counts.sum()
    mid = (n - 1) / 2
    best = counts.max()
    cand = np.flatnonzero(counts == best)
    pi = int(cand[np.argmin(np.abs(cand - mid))])
    lo = hi = pi
    acc = counts[pi]
    while acc < share * total and (lo > 0 or hi < n - 1):
        up = counts[hi + 1] if hi < n - 1 else -1
        dn = counts[lo - 1] if lo > 0 else -1
        if up >= dn:
            hi += 1; acc += counts[hi]
        else:
            lo -= 1; acc += counts[lo]
    return pi, lo, hi


def profiles(s, i, tick):
    """TPO (30-minute letters) and volume (each minute's volume spread evenly over its ticks) profiles at 1-tick rows.
    Returns dict with base price and (poc, val, vah) for each, prices in points."""
    lo_all, hi_all = s.L[i].min(), s.H[i].max()
    base = math.floor(round(lo_all / tick, 6))
    n = math.floor(round(hi_all / tick, 6)) - base + 1
    tpo = np.zeros(n)
    vol = np.zeros(n + 1)
    for p in range(N_MIN // PER):
        a, b = p * PER, p * PER + PER
        l0 = math.floor(round(s.L[i, a:b].min() / tick, 6)) - base
        h0 = math.floor(round(s.H[i, a:b].max() / tick, 6)) - base
        tpo[l0:h0 + 1] += 1
    lk = np.floor(np.round(s.L[i] / tick, 6)).astype(int) - base
    hk = np.floor(np.round(s.H[i] / tick, 6)).astype(int) - base
    per = s.V[i] / (hk - lk + 1)
    np.add.at(vol, lk, per)
    np.add.at(vol, hk + 1, -per)
    vol = np.cumsum(vol)[:n]
    t, v = _va(tpo), _va(vol)
    px = lambda k: (base + k) * tick
    return dict(tpo=tuple(px(k) for k in t), vol=tuple(px(k) for k in v), tick=tick)


def day_type(s, i):
    """Dalton's taxonomy, mechanical (prereg §3.10, rules fixed in A2): normal / normal variation / trend / one-sided other /
    neutral extreme / neutral centre."""
    ibh, ibl = s.H[i, :60].max(), s.L[i, :60].min()
    w = ibh - ibl
    hi, lo, c = s.H[i].max(), s.L[i].min(), s.C[i, -1]
    R = hi - lo
    if w <= 0 or R <= 0:
        return "flat"
    up, dn = hi > ibh, lo < ibl
    pos = (c - lo) / R
    if R < 1.15 * w:
        return "normal"
    if up and dn:
        return "neutral extreme" if pos >= 0.8 or pos <= 0.2 else "neutral centre"
    outer = pos >= 0.8 if up else pos <= 0.2
    if R >= 2 * w:
        return "trend" if outer else "one-sided other"
    return "normal variation"


# ── statistics ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def block_indices(rng, n, block=20):
    """Circular moving-block resample of session indices 0..n-1."""
    starts = rng.integers(0, n, size=math.ceil(n / block))
    idx = (starts[:, None] + np.arange(block)[None, :]).ravel() % n
    return idx[:n]


def boot(rng, n_sessions, fn, B=2000, block=20):
    out = np.empty(B)
    for b in range(B):
        out[b] = fn(block_indices(rng, n_sessions, block))
    return out


def ols_slope(x, y):
    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if len(x) < 10 or x.std() == 0:
        return np.nan
    return np.cov(x, y, bias=True)[0, 1] / x.var()


def p_from_ci(est, lo, hi):
    se = (hi - lo) / (2 * 1.959964)
    if not np.isfinite(se) or se <= 0:
        return np.nan
    return float(2 * (1 - norm.cdf(abs(est) / se)))


def holm(ps, alpha=0.05):
    ps = np.asarray(ps, float)
    order = np.argsort(ps)
    adj = np.empty_like(ps)
    run = 0.0
    m = len(ps)
    for k, j in enumerate(order):
        run = max(run, min(1.0, (m - k) * ps[j]))
        adj[j] = run
    return adj


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    order = np.argsort(ps)
    adj = np.empty_like(ps)
    run = 1.0
    for k in range(m - 1, -1, -1):
        j = order[k]
        run = min(run, ps[j] * m / (k + 1))
        adj[j] = run
    return adj
