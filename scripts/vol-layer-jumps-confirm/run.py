"""vol-layer-jumps-confirm: after a burst, is a sigma stop hit more often (T1), and filled further past it (T2),
than the vol clock says, by more than after a near-burst bar?  Prereg: forge/VOL_LAYER_JUMPS_CONFIRM_PREREG.md.

Usage (in order; each step refuses to run if the one before it did not pass):
    python -X utf8 scripts/vol-layer-jumps-confirm/run.py control     # vol-clock profile (discovery M1) + positive controls
    python -X utf8 scripts/vol-layer-jumps-confirm/run.py discovery   # step 0: reproduce the prereg's discovery look (< 2023)
    python -X utf8 scripts/vol-layer-jumps-confirm/run.py confirm     # score 2023-01-01 -> 2026-08-20 once

Data are read from DATA_ROOT (the main checkout); outputs are written next to this repo under
analysis/output/vol-layer-jumps-confirm/. Only the setup columns of jump-after/events.parquet are read.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.stats import norm, genpareto

DATA_ROOT = os.environ.get("DATA_ROOT", "c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "analysis", "output", "vol-layer-jumps-confirm")
EV = f"{DATA_ROOT}/analysis/output/jump-after/events.parquet"
HIST = f"{DATA_ROOT}/analysis/output/forecast_history"
BA = f"{DATA_ROOT}/data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
INDICES = {"DE30", "DOW", "NQ", "SPX500", "UK100", "US2000"}

SEED = 20261116
B, BLOCK = 2000, 20
DRAWS = 200
DISC0, DISC_END = "2016-10-24", "2023-01-01"     # discovery: sessions < 2023-01-01
CONF0, CONF1 = "2023-01-01", "2026-08-20"        # score window; lockbox from 2026-08-21 untouched
D_LIST = [0.25, 0.5, 1.0]
HZ_LIST = [15, 30, 60, 120]
BASE_D, BASE_HZ = 0.5, 60
BAR = {"T1": 0.05, "T2": 0.05}
EXPECT = {"conf_flags": 3431, "conf_ctrls": 30642, "disc_flags": 4954}
NSLOT = 264                                       # 00:00-22:00 London in 5-minute slots
NS_MIN = 60_000_000_000
Z_MDE = norm.ppf(1 - 0.025 / 2) + norm.ppf(0.8)   # mdeFromCI: 80% power, two-sided, alpha 0.05/2 (Holm first step)


def r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))


# ------------------------------------------------------------------ data
def load_events():
    E = pd.read_parquet(EV, columns=["inst", "date", "slot", "kind", "ver", "size", "hour", "sched"])   # setup columns only
    E = E[(E.ver == "x") & (E.date >= DISC0) & (E.date <= CONF1)].reset_index(drop=True)
    fl = E.kind == "flag"
    E["cojump"] = np.nan
    E.loc[fl, "cojump"] = E[fl].groupby(["date", "slot"]).inst.transform("size")
    return E


def load_sig(inst):
    s = pd.read_csv(f"{HIST}/{inst}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    return s[~s.index.duplicated()]


def load_m1(inst, t0, t1):
    """M1 bid/ask with bar-start times as int64 ns UTC, London dates in [t0, t1)."""
    df = pd.read_parquet(f"{BA}/{BA_KEY.get(inst, inst.lower())}_m1.parquet",
                         columns=["time", "bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"])
    t = pd.to_datetime(df["time"]).dt.as_unit("ns")                  # datetime64[us] -> ns before int64 arithmetic
    t = t.dt.tz_localize("UTC") if t.dt.tz is None else t.dt.tz_convert("UTC")
    lo = pd.Timestamp(t0, tz="Europe/London").tz_convert("UTC")
    hi = pd.Timestamp(t1, tz="Europe/London").tz_convert("UTC")
    keep = ((t >= lo) & (t < hi)).to_numpy()
    df, t = df[keep], t[keep]
    ns = t.dt.as_unit("ns").astype("int64").to_numpy()
    o = np.argsort(ns, kind="stable")
    arr = {c: df[c].to_numpy(float)[o] for c in ["bid_o", "bid_l", "bid_c", "ask_o", "ask_h", "ask_c"]}
    arr["ns"] = ns[o]
    return arr


def london_ns(dates, minutes):
    d0 = pd.to_datetime(pd.Series(dates)).dt.tz_localize("Europe/London")
    return (d0 + pd.to_timedelta(np.asarray(minutes), unit="m")).dt.tz_convert("UTC").dt.as_unit("ns").astype("int64").to_numpy()


# ------------------------------------------------------------------ vol clock
def vol_profile(inst):
    """Mean squared 5-minute mid log return per London slot, discovery sessions only, normalised over 00:00-22:00."""
    m = load_m1(inst, DISC0, DISC_END)
    loc = pd.DatetimeIndex(pd.to_datetime(m["ns"], utc=True)).tz_convert("Europe/London").tz_localize(None).as_unit("ns").asi8
    day = loc // (86_400 * 10**9)                       # London calendar day number (epoch days)
    minute = (loc - day * 86_400 * 10**9) // NS_MIN
    mid_c = 0.5 * (m["bid_c"] + m["ask_c"])
    mid_o = 0.5 * (m["bid_o"] + m["ask_o"])
    df = pd.DataFrame({"date": day, "slot": minute // 5, "wd": (day + 3) % 7, "c": mid_c, "o": mid_o})   # epoch day 0 = Thursday
    df = df[(df.slot < NSLOT) & (df.wd < 5)]
    last = df.groupby(["date", "slot"]).c.last().unstack()
    first_open = df.groupby("date").o.first()
    last = last.reindex(columns=range(NSLOT))
    L = np.log(last.to_numpy())
    prev = np.concatenate([np.log(first_open.reindex(last.index).to_numpy())[:, None], L[:, :-1]], axis=1)
    # carry the last seen close forward so a missing slot's move lands in the next slot that has a bar
    prev_ff = pd.DataFrame(prev).ffill(axis=1).to_numpy()
    ret = L - prev_ff
    prof = np.nanmean(ret ** 2, axis=0)
    prof = np.where(np.isfinite(prof), prof, 0.0)
    return prof / prof.sum(), int(len(last))


def v_after(prof, s_from, n_slots):
    """Share of session variance in slots s_from .. s_from+n_slots-1, cut at 22:00."""
    c = np.concatenate([[0.0], np.cumsum(prof)])
    a = np.clip(s_from, 0, NSLOT)
    b = np.clip(s_from + n_slots, 0, NSLOT)
    return c[b] - c[a]


# ------------------------------------------------------------------ scoring core (real and simulated paths alike)
def stop_outcome(m, j, a, b, u, d):
    """Long at ask close of bar j, short at bid close; stops d*u away; window bars a..b-1.
    Returns (hitL_index or -1, overL, hitS_index or -1, overS) with overshoot in sigma."""
    sl = m["ask_c"][j] - d * u
    ss = m["bid_c"][j] + d * u
    out = []
    hl = np.flatnonzero(m["bid_l"][a:b] <= sl)
    if hl.size:
        i = a + hl[0]
        fill = min(sl, m["bid_o"][i])
        out += [hl[0], (sl - fill) / u]
    else:
        out += [-1, np.nan]
    hs = np.flatnonzero(m["ask_h"][a:b] >= ss)
    if hs.size:
        i = a + hs[0]
        fill = max(ss, m["ask_o"][i])
        out += [hs[0], (fill - ss) / u]
    else:
        out += [-1, np.nan]
    return out


def score_inst(m, ev, sig, prof):
    """All outcomes for one instrument's events. ev needs date, slot (and the passthrough columns)."""
    ns = m["ns"]
    t_end = london_ns(ev.date.to_numpy(), ev.slot.to_numpy() * 5 + 5)
    t_22 = london_ns(ev.date.to_numpy(), np.full(len(ev), 22 * 60))
    rows, drop = [], {"no_sigma": 0, "no_entry_bar": 0, "no_path": 0}
    for k in range(len(ev)):
        e = ev.iloc[k]
        sg = sig.get(e.date, np.nan) if hasattr(sig, "get") else sig[k]
        if not np.isfinite(sg) or sg <= 0:
            drop["no_sigma"] += 1
            continue
        te, t22 = t_end[k], t_22[k]
        j = np.searchsorted(ns, te) - 1
        if j < 0 or ns[j] < te - 5 * NS_MIN:
            drop["no_entry_bar"] += 1
            continue
        a = j + 1
        bmax = np.searchsorted(ns, min(te + max(HZ_LIST) * NS_MIN, t22))
        if bmax <= a:
            drop["no_path"] += 1
            continue
        mid = 0.5 * (m["bid_c"][j] + m["ask_c"][j])
        u = sg * mid
        rec = {"k": k, "sig": sg}
        bh = {H: np.searchsorted(ns, min(te + H * NS_MIN, t22)) - a for H in HZ_LIST}   # bars inside each horizon
        for H in HZ_LIST:
            rec[f"cut{H}"] = float(te + H * NS_MIN > t22)
            rec[f"V{H}"] = v_after(prof, int(e.slot) + 1, H // 5)
        for d in D_LIST:
            hL, oL, hS, oS = stop_outcome(m, j, a, bmax, u, d)
            for H in HZ_LIST:
                rec[f"t{d}_{H}L"] = float(0 <= hL < bh[H])
                rec[f"t{d}_{H}S"] = float(0 <= hS < bh[H])
            # overshoot for the 60-minute hits (fill at the first hit; same whichever horizon contains it)
            rec[f"o{d}L"] = oL if 0 <= hL < bh[60] else np.nan
            rec[f"o{d}S"] = oS if 0 <= hS < bh[60] else np.nan
            for H in HZ_LIST:
                if H != 60:
                    rec[f"o{d}_{H}L"] = oL if 0 <= hL < bh[H] else np.nan
                    rec[f"o{d}_{H}S"] = oS if 0 <= hS < bh[H] else np.nan
        # +1 lag: entry at the close of slot s+1, 60 minutes, same stop rule
        te2 = te + 5 * NS_MIN
        j2 = np.searchsorted(ns, te2) - 1
        rec["lag_ok"] = 0.0
        if j2 >= 0 and ns[j2] >= te2 - 5 * NS_MIN and ns[j2] >= te:
            a2 = j2 + 1
            b2 = np.searchsorted(ns, min(te2 + 60 * NS_MIN, t22))
            if b2 > a2:
                u2 = sg * 0.5 * (m["bid_c"][j2] + m["ask_c"][j2])
                rec["lag_ok"] = 1.0
                rec["Vlag"] = v_after(prof, int(e.slot) + 2, 12)
                for d in D_LIST:
                    hL, oL, hS, oS = stop_outcome(m, j2, a2, b2, u2, d)
                    rec[f"lt{d}L"], rec[f"lt{d}S"] = float(hL >= 0), float(hS >= 0)
                    rec[f"lo{d}L"], rec[f"lo{d}S"] = (oL if hL >= 0 else np.nan), (oS if hS >= 0 else np.nan)
        rows.append(rec)
    R = pd.DataFrame(rows)
    if len(R):
        R = pd.concat([ev.iloc[R.k.to_numpy()].reset_index(drop=True), R.drop(columns="k")], axis=1)
    return R, drop


def score_window(E, t0, t1, profiles, tag):
    parts, drops = [], {}
    for inst, g in E.groupby("inst"):
        t = time.time()
        m = load_m1(inst, t0, t1)
        R, dr = score_inst(m, g.reset_index(drop=True), load_sig(inst), profiles[inst])
        parts.append(R)
        drops[inst] = dr
        print(f"[{tag}] {inst} events {len(g)} scored {len(R)} drops {dr} {time.time() - t:.0f}s", flush=True)
        del m
    return pd.concat(parts, ignore_index=True), drops


# ------------------------------------------------------------------ statistics
def boot_weights(n, rng):
    """Stationary bootstrap (mean block 20): per replicate, how many times each date is drawn (B x n)."""
    W = np.zeros((B, n))
    p = 1.0 / BLOCK
    for b in range(B):
        idx = np.empty(n, dtype=int)
        i = rng.integers(n)
        jumps = rng.random(n) < p
        starts = rng.integers(n, size=n)
        for t in range(n):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n
        W[b] = np.bincount(idx, minlength=n)
    return W


class Stat:
    """Burst-minus-control differences with controls post-stratified on instrument x hour to the burst mix."""

    def __init__(self, dates, rng):
        self.dates = np.array(sorted(set(dates)))
        self.di = pd.Series(np.arange(len(self.dates)), index=self.dates)
        self.W = boot_weights(len(self.dates), rng)

    @staticmethod
    def ps_weights(key_f, key_c):
        nf = pd.Series(key_f).value_counts()
        nc = pd.Series(key_c).value_counts()
        return (nf / nc).reindex(key_c).fillna(0.0).to_numpy()

    def delta_arrays(self, di_f, yf, di_c, yc, wc, boot=True):
        n = len(self.dates)
        fn = np.bincount(di_f, yf, n); fd = np.bincount(di_f, None, n).astype(float)
        cn = np.bincount(di_c, yc * wc, n); cd = np.bincount(di_c, wc, n)
        mf, mc = fn.sum() / fd.sum(), cn.sum() / cd.sum()
        est = mf - mc
        if not boot:
            return est, mf, mc, None
        with np.errstate(invalid="ignore", divide="ignore"):
            reps = (self.W @ fn) / (self.W @ fd) - (self.W @ cn) / (self.W @ cd)
        return est, mf, mc, reps

    def delta(self, F, yf, C, yc, key="inst_hour"):
        kf, kc = F[key].to_numpy(), C[key].to_numpy()
        wc = self.ps_weights(kf, kc)
        est, mf, mc, reps = self.delta_arrays(self.di[F.date].to_numpy(), np.asarray(yf, float),
                                              self.di[C.date].to_numpy(), np.asarray(yc, float), wc)
        lo, hi = np.nanpercentile(reps, [2.5, 97.5])
        se = (hi - lo) / (2 * 1.959964)
        p = float(2 * (1 - norm.cdf(abs(est) / se))) if se > 0 else 1.0     # pFromCI
        return {"est": r(est, 5), "lo": r(lo, 5), "hi": r(hi, 5), "se": r(se, 5), "p": r(p, 6), "mde": r(Z_MDE * se, 5),
                "burst": r(mf, 5), "control_ps": r(mc, 5), "n_burst": int(len(F)), "n_control": int(len(C)),
                "n_burst_no_control_stratum": int((~pd.Series(kf).isin(set(kc))).sum())}


def touch_cols(X, d, H=60, lag=False):
    if lag:
        y = 0.5 * (X[f"lt{d}L"] + X[f"lt{d}S"])
        pred = 2 * norm.cdf(-d / np.sqrt(X["Vlag"].clip(lower=1e-12)))
    else:
        y = 0.5 * (X[f"t{d}_{H}L"] + X[f"t{d}_{H}S"])
        pred = 2 * norm.cdf(-d / np.sqrt(X[f"V{H}"].clip(lower=1e-12)))
    return np.asarray(y, float), np.asarray(pred, float)


def hits(X, d, H=60, lag=False):
    keep = ["date", "slot", "inst", "hour", "inst_hour", "uid", "cojump", "cls", "year"]
    keep = [c for c in keep if c in X.columns]
    if lag:
        cL, cS = f"lo{d}L", f"lo{d}S"
    elif H == 60:
        cL, cS = f"o{d}L", f"o{d}S"
    else:
        cL, cS = f"o{d}_{H}L", f"o{d}_{H}S"
    a = pd.concat([X[keep].assign(o=X[cL].to_numpy(), side="L"), X[keep].assign(o=X[cS].to_numpy(), side="S")], ignore_index=True)
    a = a[a.o.notna()].reset_index(drop=True)
    a["R"] = a.o / d
    return a


def prep(R):
    R = R.copy()
    R["inst_hour"] = R.inst + "_" + R.hour.astype(str)
    R["year"] = R.date.str[:4]
    R["cls"] = np.where(R.inst.isin(INDICES), "index", np.where(R.inst == "GOLD", "gold", "fx"))
    fl = R.kind == "flag"
    R["uid"] = ""
    R.loc[fl, "uid"] = "m_" + R.loc[fl, "date"] + "_" + R.loc[fl, "slot"].astype(str)
    R.loc[~fl, "uid"] = "c_" + R.loc[~fl].index.astype(str)
    return R


def t1(S, F, C, d=BASE_D, H=BASE_HZ, lag=False, raw=False):
    yf, pf = touch_cols(F, d, H, lag)
    yc, pc = touch_cols(C, d, H, lag)
    if raw:
        return S.delta(F, yf, C, yc)
    res = S.delta(F, yf - pf, C, yc - pc)
    res["burst_raw_touch"], res["control_raw_touch"] = r(np.nanmean(yf), 5), r(np.nanmean(yc), 5)
    res["burst_excess_over_rw"], res["control_excess_over_rw_unweighted"] = r(np.nanmean(yf - pf), 5), r(np.nanmean(yc - pc), 5)
    res["burst_pred_rw"], res["control_pred_rw"] = r(np.nanmean(pf), 5), r(np.nanmean(pc), 5)
    return res


def t2(S, F, C, d=BASE_D, H=BASE_HZ, lag=False):
    hf, hc = hits(F, d, H, lag), hits(C, d, H, lag)
    res = S.delta(hf, hf.R, hc, hc.R)
    res["hits_burst"], res["hits_control"] = int(len(hf)), int(len(hc))
    res["gapped_burst"], res["gapped_control"] = int((hf.o > 0).sum()), int((hc.o > 0).sum())
    res["p99_sigma_burst"], res["p99_sigma_control"] = r(hf.o.quantile(0.99), 5) if len(hf) else None, r(hc.o.quantile(0.99), 5) if len(hc) else None
    return res


def shuffle_null(S, R, cell, rng, d=BASE_D):
    """Per-moment label shuffle: a burst moment's rows move together; labels are reassigned within London hour
    (a cojump moment spans several instruments, so hour is the stratum it can keep; inst x hour weights are
    recomputed inside every draw). 200 draws."""
    if cell == "T1":
        y, p = touch_cols(R, d)
        X = R.assign(val=y - p)
    else:
        X = hits(R.assign(kind_flag=(R.kind == "flag")), d)
        X["val"] = X.R
    units = R.drop_duplicates("uid")[["uid", "hour", "kind"]].reset_index(drop=True)
    u_idx = pd.Series(np.arange(len(units)), index=units.uid)
    row_unit = u_idx[X.uid].to_numpy()
    is_flag_unit = (units.kind == "flag").to_numpy()
    by_hour = [np.flatnonzero(units.hour.to_numpy() == h) for h in sorted(units.hour.unique())]
    strat = pd.factorize(X.inst_hour)[0]
    nstr = strat.max() + 1
    di = S.di[X.date].to_numpy()
    val = X.val.to_numpy(float)
    ests, excl = [], 0
    for _ in range(DRAWS):
        lab = np.zeros(len(units), bool)
        for ix in by_hour:
            nf = is_flag_unit[ix].sum()
            lab[rng.choice(ix, nf, replace=False)] = True
        fl = lab[row_unit]
        nf = np.bincount(strat[fl], minlength=nstr).astype(float)
        nc = np.bincount(strat[~fl], minlength=nstr).astype(float)
        with np.errstate(divide="ignore", invalid="ignore"):
            wst = np.where(nc > 0, nf / nc, 0.0)
        est, _, _, reps = S.delta_arrays(di[fl], val[fl], di[~fl], val[~fl], wst[strat[~fl]])
        lo, hi = np.nanpercentile(reps, [2.5, 97.5])
        ests.append(est)
        excl += int(lo > 0 or hi < 0)
    ests = np.array(ests)
    return ests, excl / DRAWS


def gpd(o):
    o = np.asarray(o, float)
    out = {"n_gap": int(len(o))}
    if len(o):
        out.update({"p50": r(np.median(o), 5), "p90": r(np.quantile(o, 0.9), 5), "p99": r(np.quantile(o, 0.99), 5)})
    if len(o) < 80:
        out["xi"] = None
        return out
    u = float(np.quantile(o, 1 - max(0.10, min(0.5, 40 / len(o)))))
    ex = o[o > u] - u
    xi, _, sc = genpareto.fit(ex, floc=0)
    out.update({"u": r(u, 5), "xi": r(xi, 3), "scale": r(sc, 5), "n_exceed": int(len(ex))})
    return out


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    o = np.argsort(ps)
    passed = np.zeros(m, bool)
    k = 0
    for i, idx in enumerate(o):
        if ps[idx] <= q * (i + 1) / m:
            k = i + 1
    passed[o[:k]] = True
    return passed


# ------------------------------------------------------------------ step: positive controls
def simulate(ev, sig, prof, rng, var_mult=None, gap=None, sub=30):
    """Brownian mid paths on the real event grid: 5-minute slot variance = sigma^2 * profile, M1 bars built from
    `sub` steps per minute, zero spread. Returns M1 arrays + per-event entry/end info consumed by score_inst."""
    n = len(ev)
    T = 135   # minutes simulated after the entry bar (covers lag + 120)
    slots = ev.slot.to_numpy()
    mins_after = np.arange(T)
    slot_of_min = slots[:, None] + 1 + mins_after[None, :] // 5
    var_min = np.where(slot_of_min < NSLOT, prof[np.clip(slot_of_min, 0, NSLOT - 1)], 0.0) / 5.0 * (sig[:, None] ** 2)
    if var_mult is not None:
        var_min[:, :60] *= var_mult[:, None]
    sd_sub = np.sqrt(var_min / sub)
    steps = rng.standard_normal((n, T, sub)) * sd_sub[:, :, None]
    cum = np.cumsum(steps.reshape(n, T * sub), axis=1).reshape(n, T, sub)
    start = np.concatenate([np.zeros((n, 1)), cum[:, :-1, -1]], axis=1)       # each bar opens at the previous close
    lo = np.minimum(start, cum.min(axis=2)); hi = np.maximum(start, cum.max(axis=2)); cl = cum[:, :, -1]
    planted = np.zeros(n)
    if gap is not None:
        # plant a gap at the long stop's first crossing minute: the bar opens X below the stop (X ~ Exp(mean)), prob g
        g, mean_x, d, mask = gap
        stop = -d * sig                                   # long stop, price units relative to entry mid 1 (spread 0)
        for i in np.flatnonzero(mask):
            k = np.flatnonzero(lo[i, :60] <= stop[i])
            if k.size and rng.random() < g:
                k = k[0]
                x = rng.exponential(mean_x) * sig[i]
                shift = (stop[i] - x) - start[i, k]
                start[i, k:] += shift; lo[i, k:] += shift; hi[i, k:] += shift; cl[i, k:] += shift
                planted[i] = x / sig[i]
    return start, lo, hi, cl, planted


def sim_score(ev, _unused, prof_by_inst, rng, var_mult=None, gap=None):
    """Build one synthetic M1 tape per event (entry bar + 135 minutes) and run the real scoring core on it."""
    outs = []
    plant = []
    for inst, g in ev.groupby("inst"):
        g = g.reset_index(drop=True)
        sg = g.sig.to_numpy()
        vm = None if var_mult is None else g.var_mult.to_numpy()
        gp = None if gap is None else (gap[0], gap[1], gap[2], g.kind.eq("flag").to_numpy())
        st, lo, hi, cl, planted = simulate(g, sg, prof_by_inst[inst], rng, vm, gp)
        n, T = st.shape
        t_end = london_ns(g.date.to_numpy(), g.slot.to_numpy() * 5 + 5)
        rows = []
        for k in range(n):
            ns = t_end[k] + np.arange(-1, T) * NS_MIN        # entry bar starts 1 minute before slot end
            mid = 1.0 + np.concatenate([[0.0], cl[k]])           # arithmetic price, entry mid 1, zero spread
            op = 1.0 + np.concatenate([[0.0], st[k]])
            m = {"ns": ns, "bid_c": mid, "ask_c": mid, "bid_o": op, "ask_o": op,
                 "bid_l": 1.0 + np.concatenate([[0.0], lo[k]]), "ask_h": 1.0 + np.concatenate([[0.0], hi[k]])}
            Rk, _ = score_inst(m, g.iloc[[k]].reset_index(drop=True), np.array([sg[k]]), prof_by_inst[inst])
            rows.append(Rk)
        outs.append(pd.concat(rows, ignore_index=True))
        plant.append(pd.DataFrame({"date": g.date, "slot": g.slot, "inst": inst, "planted": planted}))
    return pd.concat(outs, ignore_index=True), pd.concat(plant, ignore_index=True)


def run_control():
    rng = np.random.default_rng(SEED)
    E = load_events()
    insts = sorted(E.inst.unique())
    prof, nsess = {}, {}
    os.makedirs(f"{OUT}/control/profile_cache", exist_ok=True)
    for inst in insts:
        fp = f"{OUT}/control/profile_cache/{inst}.json"
        if os.path.exists(fp):
            jj = json.load(open(fp)); p, n = np.array(jj["p"]), jj["n"]
        else:
            p, n = vol_profile(inst)
            dump(fp, {"p": list(map(float, p)), "n": n})
        prof[inst], nsess[inst] = p, n
        print(f"profile {inst} sessions {n}", flush=True)
    os.makedirs(f"{OUT}/control", exist_ok=True)
    pd.DataFrame(prof).to_csv(f"{OUT}/control/vol_profile.csv", index_label="slot")
    # simulation grid: discovery events (setup only), a fixed sample for speed
    D = E[E.date < DISC_END].copy()
    D["sig"] = [load_sig_cache(i).get(d, np.nan) for i, d in zip(D.inst, D.date)]
    D = D[np.isfinite(D.sig)]
    Df, Dc = D[D.kind == "flag"], D[D.kind == "control"]
    grid = pd.concat([Df, Dc.sample(n=min(len(Dc), 15000), random_state=SEED)], ignore_index=True)
    grid = grid.sort_values(["inst", "date", "slot"]).reset_index(drop=True)
    res = {"vol_profile_sessions": nsess, "grid": {"bursts": int((grid.kind == "flag").sum()), "controls": int((grid.kind == "control").sum())}}

    def stats(Rs):
        Rs = prep(Rs)
        S = Stat(Rs.date, np.random.default_rng(SEED))
        F, C = Rs[Rs.kind == "flag"], Rs[Rs.kind == "control"]
        return S, F, C

    # 1. known zero
    R0, _ = sim_score(grid, None, prof, rng)
    S, F, C = stats(R0)
    z = t1(S, F, C)
    z_n = {str(d): t1(S, F, C, d=d) for d in D_LIST}
    ok_zero = all(abs(v["burst_excess_over_rw"]) <= 0.01 and abs(v["control_excess_over_rw_unweighted"]) <= 0.01 and abs(v["est"]) <= 0.01 for v in z_n.values())
    res["known_zero"] = {"T1": z_n, "pass": bool(ok_zero), "rule": "excess within +-1pp of 0 in both groups and delta within +-1pp, each d"}
    # 2. known effect: bursts' variance x1.5 for 60 minutes
    grid2 = grid.assign(var_mult=np.where(grid.kind == "flag", 1.5, 1.0))
    R1, _ = sim_score(grid2, None, prof, rng, var_mult=grid2.var_mult.to_numpy())
    S, F, C = stats(R1)
    eff = t1(S, F, C)
    pred = float(np.mean(2 * norm.cdf(-BASE_D / np.sqrt(1.5 * F.V60)) - 2 * norm.cdf(-BASE_D / np.sqrt(F.V60))))
    ok_eff = eff["est"] >= 0.5 * pred
    res["known_effect"] = {"T1": eff, "predicted_delta": r(pred, 5), "recovered_share": r(eff["est"] / pred, 3), "pass": bool(ok_eff), "rule": ">= half the closed-form delta"}
    # 3. overshoot: plant gaps on bursts' long-stop hits, prob 0.3, Exp(mean 0.05 sigma)
    R2, plant = sim_score(grid, None, prof, rng, gap=(0.3, 0.05, BASE_D))
    S, F, C = stats(R2)
    ov = t2(S, F, C)
    hf = hits(F, BASE_D)
    Pm = plant.set_index(["inst", "date", "slot"]).planted
    # truth: mean planted extra loss (R) per burst hit, weighting as the cell does (no control gaps)
    pl = F.set_index(["inst", "date", "slot"]).index.map(Pm.to_dict()).to_numpy(float)
    planted_R_sum = np.nansum(np.where(F[f"t{BASE_D}_60L"].to_numpy() > 0, pl, 0.0)) / BASE_D
    truth = planted_R_sum / max(len(hf), 1)
    ok_ov = (ov["lo"] <= truth <= ov["hi"])
    res["overshoot_plant"] = {"T2": ov, "planted_mean_R_per_burst_hit": r(truth, 5), "pass": bool(ok_ov), "rule": "planted mean within T2 interval"}
    # 4. GPD recovery on simulated Pareto exceedances, xi = 0.3
    x = genpareto.rvs(0.3, scale=0.05, size=4000, random_state=SEED)
    gf = gpd(x)
    ok_gpd = gf["xi"] is not None and abs(gf["xi"] - 0.3) <= 0.15
    res["gpd_recovery"] = {"fit": gf, "true_xi": 0.3, "pass": bool(ok_gpd)}
    res["pass"] = bool(ok_zero and ok_eff and ok_ov and ok_gpd)
    res["ranAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    dump(f"{OUT}/control/controls.json", res)
    print(json.dumps({k: (v.get("pass") if isinstance(v, dict) else v) for k, v in res.items()}, indent=1))


_SIG = {}


def load_sig_cache(inst):
    if inst not in _SIG:
        _SIG[inst] = load_sig(inst)
    return _SIG[inst]


def load_profiles():
    P = pd.read_csv(f"{OUT}/control/vol_profile.csv", index_col="slot")
    return {c: P[c].to_numpy(float) for c in P.columns}


# ------------------------------------------------------------------ step 0: discovery reproduction
def run_discovery():
    c = json.load(open(f"{OUT}/control/controls.json"))
    if not c["pass"]:
        sys.exit("positive controls did not pass; nothing is scored")
    E = load_events()
    D = E[E.date < DISC_END].reset_index(drop=True)
    nfl = int((D.kind == "flag").sum())
    assert nfl == EXPECT["disc_flags"], f"discovery bursts {nfl} != {EXPECT['disc_flags']}"
    R, drops = score_window(D, DISC0, DISC_END, load_profiles(), "disc")
    os.makedirs(f"{OUT}/discovery", exist_ok=True)
    R.to_parquet(f"{OUT}/discovery/events_scored.parquet", index=False)
    R = prep(R)
    S = Stat(R.date, np.random.default_rng(SEED))
    F, C = R[R.kind == "flag"], R[R.kind == "control"]
    PREREG = {0.25: (0.567, 0.309, 0.258, 0.007), 0.5: (0.269, 0.080, 0.189, 0.0014), 1.0: (0.068, 0.011, 0.057, 0.0006)}
    out = {"n_burst": int(len(F)), "n_control": int(len(C)), "drops": drops, "cells": {}}
    ok = len(F) == 4951 and abs(len(C) - 45407) <= 5
    for d in D_LIST:
        raw = t1(S, F, C, d=d, raw=True)
        exc = t1(S, F, C, d=d)
        ov = t2(S, F, C, d=d)
        pf, pc, pdlt, pov = PREREG[d]
        match = abs(raw["burst"] - pf) <= 0.003 and abs(raw["control_ps"] - pc) <= 0.003 and abs(raw["est"] - pdlt) <= 0.003 and abs(ov["est"] - pov) <= 0.002
        ok = ok and match
        out["cells"][str(d)] = {"touch_raw": raw, "touch_excess": exc, "overshoot_R": ov, "prereg": {"burst": pf, "control": pc, "delta": pdlt, "over_delta_R": pov}, "match": bool(match)}
    out["rule"] = "counts 4,951 bursts / 45,407 controls (+-5); raw touch rates and delta within 0.3pp; overshoot delta within 0.002R, each d"
    out["pass"] = bool(ok)
    out["ranAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    dump(f"{OUT}/discovery/discovery.json", out)
    if not ok:
        with open(f"{OUT}/STEP0_FAILED.md", "w", encoding="utf-8") as f:
            f.write("# vol-layer-jumps-confirm: step 0 failed\n\nThe discovery reproduction did not match the prereg. Nothing from 2023 on was read.\n\n```json\n"
                    + json.dumps(out, indent=1, default=str) + "\n```\n")
    print(json.dumps({k: v for k, v in out.items() if k != "drops"}, indent=1, default=str))


# ------------------------------------------------------------------ confirm (scored once)
def run_confirm():
    if not json.load(open(f"{OUT}/control/controls.json"))["pass"] or not json.load(open(f"{OUT}/discovery/discovery.json"))["pass"]:
        sys.exit("controls or step 0 did not pass; the confirm window is not read")
    if os.path.exists(f"{OUT}/confirm/confirm.json"):
        sys.exit("confirm already scored once; refusing to rescore")
    E = load_events()
    Cw = E[(E.date >= CONF0) & (E.date <= CONF1)].reset_index(drop=True)
    nf, nc = int((Cw.kind == "flag").sum()), int((Cw.kind == "control").sum())
    assert nf == EXPECT["conf_flags"] and nc == EXPECT["conf_ctrls"], f"score window counts {nf}/{nc}"
    R, drops = score_window(Cw, CONF0, "2026-08-21", load_profiles(), "conf")
    os.makedirs(f"{OUT}/confirm", exist_ok=True)
    R.to_parquet(f"{OUT}/confirm/events_scored.parquet", index=False)
    n_drop = len(Cw) - len(R)
    assert n_drop <= 0.01 * len(Cw), f"dropped {n_drop} of {len(Cw)} > 1%"
    assert R.date.max() <= CONF1
    R = prep(R)
    S = Stat(R.date, np.random.default_rng(SEED))
    F, C = R[R.kind == "flag"], R[R.kind == "control"]
    out = {"n_burst": int(len(F)), "n_control": int(len(C)), "dropped": int(n_drop), "drops": drops,
           "moments": int(F.uid.nunique()), "sessions": int(len(S.dates))}
    cells = {}
    for name, fn in (("T1", t1), ("T2", t2)):
        base = fn(S, F, C)
        nb = {str(d): fn(S, F, C, d=d) for d in D_LIST if d != BASE_D}
        lag = fn(S, F[F.lag_ok > 0], C[C.lag_ok > 0], lag=True)
        years = {}
        for y in ["2023", "2024", "2025", "2026"]:
            years[y] = fn(S, F[F.year == y], C[C.year == y])
        cells[name] = {"base": base, "neighbours": nb, "lag": lag, "years": years}
    # shuffle null (200 per-moment draws)
    rng = np.random.default_rng(SEED)
    for name in ("T1", "T2"):
        ests, excl = shuffle_null(S, R, name, rng)
        lo, hi = np.percentile(ests, [2.5, 97.5])
        cells[name]["shuffle"] = {"lo": r(lo, 5), "hi": r(hi, 5), "mean": r(ests.mean(), 5), "draws": DRAWS,
                                  "real_percentile": r(100 * (ests < cells[name]["base"]["est"]).mean(), 1),
                                  "share_draws_ci_excludes_0": r(excl, 3), "includes_0": bool(lo <= 0 <= hi)}
    # Holm over the two scored cells
    ps = [cells["T1"]["base"]["p"], cells["T2"]["base"]["p"]]
    order = np.argsort(ps); adj = np.empty(2); run = 0.0
    for k, i in enumerate(order):
        run = max(run, (2 - k) * ps[i]); adj[i] = min(1.0, run)
    PRE_MDE = {"T1": 0.032, "T2": 0.0048}
    for i, name in enumerate(("T1", "T2")):
        c = cells[name]; b = c["base"]; bar = BAR[name]
        g = {"holm_p": r(adj[i], 6)}
        g["p_ok"] = adj[i] < 0.05
        g["size_ok"] = b["est"] >= bar
        g["shuffle_ok"] = b["est"] > c["shuffle"]["hi"]
        g["plateau_ok"] = all(np.sign(v["est"]) == np.sign(b["est"]) and (v["lo"] > 0 or v["hi"] < 0) for v in c["neighbours"].values())
        g["lag_ok"] = np.sign(c["lag"]["est"]) == np.sign(b["est"]) and abs(c["lag"]["est"]) >= 0.5 * abs(b["est"])
        g["years_ok"] = sum(np.sign(v["est"]) == np.sign(b["est"]) for v in c["years"].values() if v["est"] is not None) >= 3
        powered = PRE_MDE[name] <= bar
        if all(g[k] for k in ["p_ok", "size_ok", "shuffle_ok", "plateau_ok", "lag_ok", "years_ok"]):
            v = "VALIDATED"
        elif g["p_ok"] and b["est"] < 0:
            v = "CONTEXT"            # significant in the opposite direction
        elif g["p_ok"] and g["size_ok"]:
            v = "CONTEXT"            # passes p and size, fails plateau / lag / years / shuffle
        elif powered and b["hi"] < bar:
            v = "NULL"
        elif b["lo"] <= 0 <= b["hi"] and b["lo"] <= bar <= b["hi"]:
            v = "UNDERPOWERED"
        else:
            v = "CONTEXT"            # significant but below the bar with the bar not ruled out
        g["powered_prereg_mde"] = PRE_MDE[name]
        c["gate"] = {k: (bool(x) if isinstance(x, (bool, np.bool_)) else x) for k, x in g.items()}
        c["verdict"] = v
    # descriptive
    desc = {}
    desc["horizons"] = {str(H): {"T1": t1(S, F, C, H=H), "T2": t2(S, F, C, H=H)} for H in HZ_LIST}
    desc["cut_short_share_60"] = r(R.cut60.mean(), 4)
    desc["cut_short_share"] = {str(H): r(R[f"cut{H}"].mean(), 4) for H in HZ_LIST}
    sl = {}
    for lab, mask in [("common", F.cojump >= 3), ("own", F.cojump < 3), ("fx", F.cls == "fx"), ("index", F.cls == "index"), ("gold", F.cls == "gold")]:
        Fs = F[mask]
        Cs = C[C.inst_hour.isin(set(Fs.inst_hour))]
        sl[lab] = {"T1": t1(S, Fs, Cs), "T2": t2(S, Fs, Cs)}
    keys = [(k, c) for k in sl for c in ("T1", "T2")]
    ps = [sl[k][c]["p"] if sl[k][c]["p"] is not None else 1.0 for k, c in keys]
    passed = bh(ps)
    for (k, c), pz in zip(keys, passed):
        sl[k][c]["bh_q10"] = bool(pz)
    desc["slices"] = sl
    desc["slices_chance_baseline"] = f"{len(keys)} slice tests at q=0.10; about {0.10 * len(keys):.1f} false discovery expected if none were real"
    gaps = {}
    for d in D_LIST:
        hf = hits(F, d)
        g0 = hf.o[hf.o > 0].to_numpy()
        gaps[str(d)] = gpd(g0)
    desc["gpd_burst_gapped_hits"] = gaps
    desc["gpd_note"] = "fit only where >= 80 gapped burst hits; discovery random-entry tail: weekday xi 0.34, p99 0.69 sigma"
    out["cells"] = cells
    out["descriptive"] = desc
    out["ranAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    dump(f"{OUT}/confirm/confirm.json", out)
    print(json.dumps({n: {"verdict": cells[n]["verdict"], "base": cells[n]["base"], "gate": cells[n]["gate"], "shuffle": cells[n]["shuffle"]} for n in cells}, indent=1, default=str))


if __name__ == "__main__":
    {"control": run_control, "discovery": run_discovery, "confirm": run_confirm}[sys.argv[1]]()
