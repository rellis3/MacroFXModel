"""noise-area-momentum: day matrices + the paper's strategy, vectorised over days.

Rules frozen in forge/NOISE_AREA_MOMENTUM_PREREG.md section 3 (Zarattini, Aziz & Barbon 2024, "Beat the Market").
Seed 20261113. Lockbox: no day after 2026-08-21 is ever built.
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("NAM_DATA", ROOT))
OUT = ROOT / "analysis/output/noise-area-momentum"
CACHE = OUT / "_cache"
SEED = 20261113
LOCKBOX_END = pd.Timestamp("2026-08-21")
NY = "America/New_York"
NBAR = 390
CHECKS = np.arange(29, 360, 30)  # 0-based bar index of the bars ENDING 10:00, 10:30 ... 15:30
# futures cost: 1 tick each side + $4.50 round trip (repo cost-verification rule), in index points per round trip
COST_RT_PTS = {"ES": 0.59, "NQ": 0.725, "YM": 2.9, "RTY": 0.29}
INSTRUMENTS = ["ES", "NQ", "YM", "RTY"]


# ----------------------------------------------------------------------------------------------- day matrices
def _load(sym, kind):
    d = pd.read_parquet(DATA / f"analysis/output/nt8/continuous/{sym}_1m_{kind}.parquet",
                        columns=["timestamp", "open", "high", "low", "close", "volume"])
    start = (d["timestamp"] - pd.Timedelta(minutes=1)).dt.tz_convert(NY)  # end-stamped -> bar start
    mins = start.dt.hour * 60 + start.dt.minute - (9 * 60 + 30)
    keep = (mins >= 0) & (mins < NBAR) & (start.dt.dayofweek < 5)
    d = d[keep].copy()
    d["m"] = mins[keep].to_numpy()
    d["day"] = start[keep].dt.tz_localize(None).dt.normalize().to_numpy()
    d = d[d["day"] <= LOCKBOX_END]
    return d.drop_duplicates(["day", "m"], keep="last")


CFD_FILE = {"ES": "spx", "NQ": "nq", "YM": "dow", "RTY": "us2000"}


def _load_cfd(sym):
    d = pd.read_parquet(DATA / f"data/m1_bidask/{CFD_FILE[sym]}_m1.parquet",
                        columns=["time", "open", "high", "low", "close", "volume"])
    start = d["time"].dt.tz_localize("UTC").dt.tz_convert(NY)  # OANDA open-stamped, naive UTC
    mins = start.dt.hour * 60 + start.dt.minute - (9 * 60 + 30)
    keep = (mins >= 0) & (mins < NBAR) & (start.dt.dayofweek < 5)
    d = d[keep].copy()
    d["m"] = mins[keep].to_numpy()
    d["day"] = start[keep].dt.tz_localize(None).dt.normalize().to_numpy()
    d = d[d["day"] <= LOCKBOX_END]
    return d.drop_duplicates(["day", "m"], keep="last")


def _matrix(d, days):
    di = pd.Index(days)
    out = {}
    pos = di.get_indexer(d["day"])
    ok = pos >= 0
    for col in ("open", "high", "low", "close", "volume"):
        a = np.full((len(days), NBAR), np.nan)
        a[pos[ok], d["m"].to_numpy()[ok]] = d[col].to_numpy(float)[ok]
        out[col] = a
    return out


def build_days(sym):
    """Return dict of arrays (D, 390) and per-day vectors. Cached as npz (gitignored).

    Amendment A1: NT8 holes (~6-week runs inside contracts, 2018/2024-26) are filled with the OANDA CFD's cash-session
    minutes, scaled to the futures level; exchange-holiday Globex sessions (last bar 13:00, cash market shut) dropped.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{sym}_days_v2.npz"
    if f.exists():
        z = np.load(f, allow_pickle=False)
        return {k: z[k] for k in z.files}
    d = _load(sym, "ratio")
    u = _load(sym, "unadj")
    c = _load_cfd(sym)
    days = np.array(sorted(set(d["day"].unique()) | set(c["day"].unique())))
    A = _matrix(d, days)
    B = _matrix(c, days)
    U = _matrix(u, days)
    fut_ok = ~np.isnan(A["open"][:, 0]) & ((~np.isnan(A["close"])).sum(1) >= 200)
    cfd_ok = ~np.isnan(B["open"][:, 0]) & ((~np.isnan(B["close"])).sum(1) >= 200)

    def lastbar(M):
        nn = ~np.isnan(M)
        return np.where(nn.any(1), NBAR - 1 - np.argmax(nn[:, ::-1], axis=1), -1)

    # scale factors from the most recent day where both exist (close of the common last bar)
    la, lb = lastbar(A["close"]), lastbar(B["close"])
    both = fut_ok & cfd_ok
    rows = np.arange(len(days))
    ka = np.where(both, A["close"][rows, np.minimum(la, lb).clip(0)] / B["close"][rows, np.minimum(la, lb).clip(0)],
                  np.nan)
    ku = np.where(both, U["close"][rows, np.minimum(la, lb).clip(0)] / B["close"][rows, np.minimum(la, lb).clip(0)],
                  np.nan)
    ka = pd.Series(ka).ffill().to_numpy()
    ku = pd.Series(ku).ffill().to_numpy()
    use_cfd = ~fut_ok & cfd_ok & ~np.isnan(ka)
    src = np.where(fut_ok, 0, np.where(use_cfd, 1, -1))
    arr = {}
    for col in ("open", "high", "low", "close", "volume"):
        x = A[col].copy()
        if col == "volume":
            x[use_cfd] = B[col][use_cfd]
        else:
            x[use_cfd] = B[col][use_cfd] * ka[use_cfd, None]
        arr[col] = x
    uo = np.where(src == 0, U["open"][:, 0], B["open"][:, 0] * ku)
    cfd_open = B["open"][:, 0]
    cfd_close = B["close"][rows, lb.clip(0)]
    has_open = ~np.isnan(arr["open"][:, 0])
    nbars = (~np.isnan(arr["close"])).sum(1)
    last0 = lastbar(arr["close"])
    valid = (src >= 0) & has_open & (nbars >= 200) & (last0 >= 220) & ~np.isnan(uo)  # >=220: holiday Globex days out
    days, uo, src, cfd_open, cfd_close = days[valid], uo[valid], src[valid], cfd_open[valid], cfd_close[valid]
    for k in arr:
        arr[k] = arr[k][valid]
    C, O, H, L, V = arr["close"], arr["open"], arr["high"], arr["low"], arr["volume"]
    last = np.array([np.max(np.nonzero(~np.isnan(r))[0]) for r in C])
    # forward-fill missing bars inside the session (close carried, H=L=C, volume 0); NaN after the last bar
    Cf = pd.DataFrame(C).ffill(axis=1).to_numpy()
    after = np.arange(NBAR)[None, :] > last[:, None]
    miss = np.isnan(C) & ~after
    H = np.where(miss, Cf, H)
    L = np.where(miss, Cf, L)
    V = np.where(miss, 0.0, V)
    C = np.where(after, np.nan, Cf)
    H[after] = L[after] = V[after] = np.nan
    O0 = O[:, 0].copy()
    dc = C[np.arange(len(last)), last]
    # previous close from the same source: at a CFD -> futures switch, carry the CFD close across with today's
    # futures/CFD open ratio so no artificial basis gap appears
    prev = np.full(len(O0), np.nan)
    prev[1:] = dc[:-1]
    sw = np.nonzero((src[1:] != src[:-1]))[0] + 1
    for i in sw:
        if src[i] == 0 and not np.isnan(cfd_open[i]) and not np.isnan(cfd_close[i - 1]):
            prev[i] = cfd_close[i - 1] * O0[i] / cfd_open[i]
    gapday = np.zeros(len(O0), bool)
    dd = days.astype("datetime64[D]").astype("int64")
    gapday[1:] = np.diff(dd) > 5  # previous used day more than 5 calendar days back: no prev close
    prev[gapday] = np.nan
    out = dict(days=dd, open=O0, close=C, high=H, low=L, vol=V, last=last, uopen=uo, src=src, prev=prev)
    np.savez_compressed(f, **out)
    return out


# ----------------------------------------------------------------------------------------------- features
def sigma_open(C, O, last, lookback=14):
    """sigma[d, m] = mean of |C/O - 1| at minute m over the previous `lookback` days that have minute m."""
    move = np.abs(C / O[:, None] - 1.0)
    D = len(O)
    sig = np.full((D, NBAR), np.nan)
    for m in range(NBAR):
        col = move[:, m]
        ok = np.nonzero(~np.isnan(col))[0]
        if len(ok) <= lookback:
            continue
        v = col[ok]
        cs = np.concatenate([[0.0], np.cumsum(v)])
        roll = (cs[lookback:] - cs[:-lookback]) / lookback  # roll[j] = mean of v[j : j+lookback]
        # value usable on the NEXT valid-or-not day after ok[j+lookback-1]
        endpos = ok[lookback - 1:]
        s = np.full(D, np.nan)
        s[endpos] = roll
        s = pd.Series(s).ffill().shift(1).to_numpy()
        sig[:, m] = s
    return sig


def vwap(C, H, L, V):
    tp = (H + L + C) / 3.0
    pv = np.nancumsum(np.nan_to_num(tp * V), axis=1)
    cv = np.nancumsum(np.nan_to_num(V), axis=1)
    vw = np.where(cv > 0, pv / np.where(cv > 0, cv, 1), C)
    return np.where(np.isnan(C), np.nan, vw)


def day_close(C, last):
    return C[np.arange(len(last)), last]


def daily_sigma(C, last, prev, n=14):
    """sample stdev of the last n close-to-close returns (prev = same-source previous close), known before the day."""
    dc = day_close(C, last)
    r = dc / prev - 1
    s = pd.Series(r).rolling(n, min_periods=n - 1).std(ddof=1).shift(1).to_numpy()
    return s, r


def features(Z, lookback=14, vm=1.0):
    C, O, last = Z["close"], Z["open"], Z["last"]
    sig = sigma_open(C, O, last, lookback)
    prev = Z["prev"]
    hi_ref = np.fmax(O, prev)
    lo_ref = np.fmin(O, prev)
    ub = hi_ref[:, None] * (1 + vm * sig)
    lb = lo_ref[:, None] * (1 - vm * sig)
    vw = vwap(C, Z["high"], Z["low"], Z["vol"])
    sd, bh = daily_sigma(C, last, prev)
    return dict(ub=ub, lb=lb, vwap=vw, sdaily=sd, bh=bh, prev=prev)


# ----------------------------------------------------------------------------------------------- strategy
def positions(C, F, last, variant):
    """Position decided at each check (12 per day). Returns P (D, 12) in {-1, 0, 1} (0 also where no decision)."""
    D = C.shape[0]
    P = np.zeros((D, len(CHECKS)))
    s = np.zeros(D)
    for k, c in enumerate(CHECKS):
        live = c < last  # a decision at the exit bar (half-days) is not taken
        cc, ub, lb, vw = C[:, c], F["ub"][:, c], F["lb"][:, c], F["vwap"][:, c]
        band = ~np.isnan(ub) & ~np.isnan(lb)
        up, dn = band & (cc > ub), band & (cc < lb)
        if variant == "V1":
            new = np.where(up, 1.0, np.where(dn, -1.0, s))
        elif variant == "V2":
            new = np.where(up & (cc > vw), 1.0, np.where(dn & (cc < vw), -1.0, 0.0))
        elif variant == "V5":
            new = np.where(up, 1.0, np.where(dn, -1.0, 0.0))
        elif variant == "V4":
            ent_l, ent_s = up & (cc > vw), dn & (cc < vw)
            hold_l = (s > 0) & (cc > vw)
            hold_s = (s < 0) & (cc < vw)
            new = np.where(hold_l | ent_l, 1.0, np.where(hold_s | ent_s, -1.0, 0.0))
        else:
            raise ValueError(variant)
        # at or after the day's last bar no decision is taken: the position carries to the exit
        P[:, k] = np.where(live, new, s)
        s = P[:, k]
    return P


def day_returns(Z, P, lev, cost_pts):
    """Gross and net daily return, plus long/short gross split and |dpos| units. Position from check k held until
    the next check (or the last bar)."""
    C, O, last, uo = Z["close"], Z["open"], Z["last"], Z["uopen"]
    D = len(O)
    rows = np.arange(D)
    ends = np.concatenate([CHECKS[1:], [NBAR - 1]])
    gross = np.zeros(D)
    glong = np.zeros(D)
    for k, c in enumerate(CHECKS):
        e = np.minimum(ends[k], last)
        valid = c < e
        p0 = C[:, c]
        p1 = C[rows, e]
        g = np.where(valid, P[:, k] * (p1 - p0) / O, 0.0)
        gross += g
        glong += np.where(P[:, k] > 0, g, 0.0)
    prevP = np.concatenate([np.zeros((D, 1)), P], axis=1)
    closing = np.abs(P[:, -1])
    units = np.abs(np.diff(prevP, axis=1)).sum(1) + closing
    cost = units * (cost_pts / 2.0) / uo
    gross *= lev
    glong *= lev
    net = gross - lev * cost
    return dict(gross=gross, net=net, glong=glong, gshort=gross - glong, units=units, cost=lev * cost)


def trades(P, Z, lev, cost_pts):
    """One row per trade: day idx, entry check k, exit check k (12 = close), side, gross bp (1x), net bp (1x)."""
    C, O, last, uo = Z["close"], Z["open"], Z["last"], Z["uopen"]
    out = []
    D, K = P.shape
    half = cost_pts / 2.0
    for d in range(D):
        row = P[d]
        if not row.any():
            continue
        k = 0
        while k < K:
            if row[k] == 0:
                k += 1
                continue
            side = row[k]
            j = k + 1
            while j < K and row[j] == side and CHECKS[j] < last[d]:
                j += 1
            ex_bar = CHECKS[j] if j < K and CHECKS[j] < last[d] else last[d]
            ex_k = j if j < K and CHECKS[j] < last[d] else 12
            g = side * (C[d, ex_bar] - C[d, CHECKS[k]]) / O[d] * 1e4
            n = g - 2 * half / uo[d] * 1e4
            out.append((d, k, ex_k, int(side), round(g, 2), round(n, 2)))
            k = j if ex_k != 12 else K
    return out


def run_variant(Z, F, variant, cost_pts, sized):
    v = "V2" if variant in ("V3", "V6", "V7") else variant
    P = positions(Z["close"], F, Z["last"], v)
    if sized:
        lev = np.minimum(4.0, 0.02 / F["sdaily"])
        lev = np.where(np.isfinite(lev), lev, np.nan)
    else:
        lev = np.ones(len(Z["open"]))
    R = day_returns(Z, P, np.nan_to_num(lev), cost_pts)
    R["P"], R["lev"] = P, lev
    return R


# ----------------------------------------------------------------------------------------------- permutation null
def permute(Z, rng):
    """Shuffle each day's minute log returns (with their volume and high/low offsets) within the day."""
    C, O, H, L, V, last = Z["close"], Z["open"], Z["high"], Z["low"], Z["vol"], Z["last"]
    D = len(O)
    prevC = np.concatenate([O[:, None], C[:, :-1]], axis=1)
    r = np.log(C / prevC)
    ho = np.log(H / C)
    lo = np.log(L / C)
    idx = np.arange(NBAR)[None, :]
    key = rng.random((D, NBAR))
    key[idx > last[:, None]] = np.inf
    order = np.argsort(key, axis=1)
    take = lambda a: np.take_along_axis(a, order, axis=1)
    r2, ho2, lo2, v2 = take(r), take(ho), take(lo), take(V)
    after = idx > last[:, None]
    r2 = np.where(after, 0.0, r2)
    C2 = O[:, None] * np.exp(np.cumsum(r2, axis=1))
    C2[after] = np.nan
    H2 = C2 * np.exp(ho2)
    L2 = C2 * np.exp(lo2)
    v2 = np.where(after, np.nan, v2)
    out = dict(Z)
    out.update(close=C2, high=H2, low=L2, vol=v2)
    return out
