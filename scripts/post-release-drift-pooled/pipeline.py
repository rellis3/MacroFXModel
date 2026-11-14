"""post-release-drift-pooled: measurement (events + placebo), the power run, and scoring.

Prereg: forge/POST_RELEASE_DRIFT_POOLED_PREREG.md. Order is enforced by run.py:
  events -> sigma -> placebo measurement -> POWER (writes power.json; reads no event outcome) -> SCORE.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from common import (BARS, FAMILIES, HORIZONS, IDS, INSTRUMENTS, LONDON, NEWYORK, NS_MIN, OUT, ROOT, Params, Px,
                    beta_boot, bh_reject, chance_baseline, cluster_boot, flip_matrix, flip_p, holm_adjust,
                    horizon_ends, jdump, load_close_m15, load_ohlc, load_spread, mde_from_se, measure, need,
                    ny_close_daily, ny_key, px_from_m1, rng_for, sigma_for, sigma_table, union_find_clusters)

DIRS = {k: d for k, d in INSTRUMENTS}
FX_ROOT = ROOT / "VolRangeForecaster/data/m1"
NQ_M1 = [ROOT / "portfolioBacktest/cache/nq_m1.parquet", ROOT / "data/m1_bidask/nq_m1.parquet"]
NQ_M15 = ROOT / "analysis/output/rate-surprise-events/m15/NAS100_USD.parquet"
Y2_M15 = ROOT / "analysis/output/rate-surprise-events/m15/USB02Y_USD.parquet"
BIDASK = ROOT / "data/m1_bidask"


@dataclass
class World:
    params: Params
    px: dict
    sig: dict
    events: pd.DataFrame
    mirror: pd.DataFrame
    y2_daily: pd.Series                                         # NY-close key -> 2y CFD close
    notes: list = field(default_factory=list)


# ── loading the real world (laptop) ─────────────────────────────────────────────────────────────────────────────

def load_real_world(params: Params, events: pd.DataFrame, mirror: pd.DataFrame) -> World:
    px, notes = {}, []
    for key, _ in INSTRUMENTS:
        spread = load_spread(need(BIDASK / f"{key}_m1.parquet", f"{key} bid/ask M1 (costs)"), params, key + " bidask")
        if key == "nq":
            src = next((p for p in NQ_M1 if p.exists()), None)
            if src is None:
                need(NQ_M1[0], "NQ M1 (NAS100 CFD); or data/m1_bidask/nq_m1.parquet")
            m1 = load_ohlc(src, params, "nq")
            m15 = load_close_m15(need(NQ_M15, "NAS100 M15 for the pre-M1 era"), params, "NAS100 M15")
            px[key] = px_from_m1(key, m1, spread, m15_before=m15)
            notes.append(f"NQ: M1 from `{src.relative_to(ROOT)}` starting {m1.index[0]:%Y-%m-%d}; OANDA M15 closes before that.")
        else:
            m1 = load_ohlc(need(FX_ROOT / f"{key}_m1.parquet", f"{key} research M1"), params, key)
            px[key] = px_from_m1(key, m1, spread)
            notes.append(f"{key}: M1 {m1.index[0]:%Y-%m-%d} -> {m1.index[-1]:%Y-%m-%d %H:%M}Z, {len(m1):,} bars.")
    y2 = load_close_m15(need(Y2_M15, "US 2y CFD M15"), params, "USB02Y_USD")
    return finish_world(params, px, events, mirror, y2, notes)


def finish_world(params, px, events, mirror, y2_m15: pd.Series, notes, workdir=None) -> World:
    sig = {k: sigma_table(p, params, (workdir or OUT) / "_tmp") for k, p in px.items()}
    key = (y2_m15.index.tz_convert(NEWYORK) + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    y2d = y2_m15.groupby(key).last()
    for k, s in sig.items():
        notes.append(f"{k}: sigma available from {s.loc[s['sig_har_next'].notna(), 'key'].min():%Y-%m-%d} "
                     f"({int(s['sig_har_next'].notna().sum())} daily bars with HAR sigma)")
    return World(params, px, sig, events, mirror, y2d, notes)


# ── measurement ─────────────────────────────────────────────────────────────────────────────────────────────────

def _release_ns(world: World) -> np.ndarray:
    return np.sort(world.events["t"].dt.as_unit("ns").astype("int64").to_numpy())


def _contaminated(rel: np.ndarray, Tent: int, Tend: int, self_t: int | None = None) -> bool:
    i = np.searchsorted(rel, Tent, "right")
    j = np.searchsorted(rel, Tend, "right")
    hits = rel[i:j]
    if self_t is not None:
        hits = hits[hits != self_t]
    return len(hits) > 0


def _flatten(base: dict, res: dict, prefix: str, with_path: bool):
    base[f"{prefix}m15"] = res["m15"]
    base[f"{prefix}m"] = math.log(res["pent"] / res["p0"]) if np.isfinite(res["pent"]) and np.isfinite(res["p0"]) else math.nan
    for h in HORIZONS:
        r = res[h]
        base[f"{prefix}lr_{h}"] = r["lr"]
        if with_path:
            for d, tag in ((1, "p"), (-1, "n")):
                q = r.get(d)
                for f in ("R", "mae", "mfe", "costR"):
                    base[f"{prefix}{f}{tag}_{h}"] = q[f] if q else math.nan
                base[f"{prefix}stop{tag}_{h}"] = q["stopped"] if q else np.nan


def measure_events(world: World, ev: pd.DataFrame, insts, mirror: bool = False) -> pd.DataFrame:
    """One row per event x instrument. Primary entry t+15 with the stop path; y-only entries t+16, t+30, FOMC t+60."""
    rel = _release_ns(world)
    last_end = world.params.last_horizon_end_utc.value
    rows = []
    for r in ev.itertuples(index=False):
        t = r.t
        T0 = t.value
        kk = ny_key(t)
        for inst in ([r.inst] if mirror else insts):
            px = world.px[inst]
            sh, s60 = sigma_for(world.sig[inst], kk)
            base = {"eid": r.eid, "inst": inst, "sig": sh, "sig60": s60}
            variants = [("", 15, True), ("e16_", 16, False), ("e30_", 30, False)]
            if (not mirror) and r.family == "FOMC":
                variants.append(("e60_", 60, False))
            for prefix, off, wp in variants:
                Tent = t + pd.Timedelta(minutes=off)
                ends = horizon_ends(t, Tent)
                res = measure(px, sh, T0, Tent.value, {h: v.value for h, v in ends.items()}, wp, last_end)
                _flatten(base, res, prefix, wp)
                if prefix == "":
                    for h in HORIZONS:
                        c = _contaminated(rel, Tent.value, ends[h].value, T0)
                        base[f"cont_{h}"] = c
                        base[f"lockbox_{h}"] = bool(res[h].get("lockbox", False))
            rows.append(base)
    return pd.DataFrame(rows)


def placebo_keys(world: World, ev: pd.DataFrame):
    """Candidate placebo days per event (prereg §3.8): weekdays within +-window trading days of the release's NY
    date, not a tier-1 release date, not within the event's own +-excl trading days. Same New York clock."""
    p = world.params
    tier1 = set(np.datetime64(d) for d in world.events["ny_date"])
    keys, cand = {}, {}
    for r in ev.itertuples(index=False):
        d = np.datetime64(r.ny_date)
        lst = []
        for k in range(-p.placebo_window, p.placebo_window + 1):
            if abs(k) <= p.placebo_excl:
                continue
            dd = np.busday_offset(d, k, roll="forward")
            if dd in tier1:
                continue
            if str(pd.Timestamp(dd).date()) > p.lockbox_last_date:
                continue
            key = (str(pd.Timestamp(dd).date()), r.ny_clock)
            if key not in keys:
                keys[key] = len(keys)
            lst.append(keys[key])
        cand[r.eid] = np.array(sorted(set(lst)), dtype=np.int64)
    return keys, cand


def measure_placebo(world: World, keys: dict) -> pd.DataFrame:
    rel = _release_ns(world)
    last_end = world.params.last_horizon_end_utc.value
    rows = []
    for (date, clock), kid in keys.items():
        t = pd.Timestamp(f"{date} {clock}").tz_localize(NEWYORK).tz_convert("UTC")
        Tent = t + pd.Timedelta(minutes=15)
        ends = horizon_ends(t, Tent)
        kk = ny_key(t)
        for inst, _ in INSTRUMENTS:
            sh, s60 = sigma_for(world.sig[inst], kk)
            res = measure(world.px[inst], sh, t.value, Tent.value, {h: v.value for h, v in ends.items()}, True, last_end)
            base = {"kid": kid, "date": date, "clock": clock, "inst": inst, "sig": sh, "sig60": s60}
            _flatten(base, res, "", True)
            for h in HORIZONS:
                base[f"cont_{h}"] = _contaminated(rel, Tent.value, ends[h].value)
            rows.append(base)
    return pd.DataFrame(rows)


# ── row -> outcome arithmetic ───────────────────────────────────────────────────────────────────────────────────

def y_cols(rows: pd.DataFrame, events: pd.DataFrame, regime_L: pd.Series | None = None) -> pd.DataFrame:
    """Signed sigma outcomes for both ids. y = direction * ln(P_end/P_entry) / sigma (prereg §3.6)."""
    R = rows.merge(events[["eid", "s", "family", "t"]], on="eid", how="left")
    R["d"] = R["inst"].map(DIRS).fillna(1).astype(int)
    R["dir_sig"] = R["s"] * R["d"]
    R["dir_mom"] = np.sign(R["m"]).fillna(0)
    for h in HORIZONS:
        cens = R[f"cont_{h}"].fillna(False).astype(bool) if h != "h4" else pd.Series(False, index=R.index)
        raw = R[f"lr_{h}"] / R["sig"]
        raw = raw.where(~cens)
        R[f"raw_{h}"] = raw
        R[f"y_sig_{h}"] = R["dir_sig"] * raw
        R[f"y_mom_{h}"] = (R["dir_mom"] * raw).where(R["dir_mom"] != 0)
        R[f"y_sig60_{h}"] = R["dir_sig"] * (R[f"lr_{h}"] / R["sig60"]).where(~cens)
        R[f"y_mom60_{h}"] = (R["dir_mom"] * (R[f"lr_{h}"] / R["sig60"])).where(~cens & (R["dir_mom"] != 0))
        for pre in ("e16_", "e30_", "e60_"):
            if f"{pre}lr_{h}" in R:
                rr = (R[f"{pre}lr_{h}"] / R["sig"]).where(~cens)
                R[f"y_sig_{pre}{h}"] = R["dir_sig"] * rr
                mdir = np.sign(R[f"{pre}m"]).fillna(0)
                R[f"y_mom_{pre}{h}"] = (mdir * rr).where(mdir != 0)
        R[f"y_sig_c4_{h}"] = R[f"y_sig_{h}"].where(~R[f"cont_{h}"].fillna(False).astype(bool)) if h == "h4" else R[f"y_sig_{h}"]
        R[f"y_mom_c4_{h}"] = R[f"y_mom_{h}"].where(~R[f"cont_{h}"].fillna(False).astype(bool)) if h == "h4" else R[f"y_mom_{h}"]
        for idn, dcol in (("sig", "dir_sig"), ("mom", "dir_mom")):
            pos = R[dcol] > 0
            for f in ("R", "mae", "mfe", "costR"):
                if f"{f}p_{h}" in R:
                    R[f"{f}_{idn}_{h}"] = np.where(pos, R[f"{f}p_{h}"], R[f"{f}n_{h}"])
                    R.loc[(R[dcol] == 0) | R[f"y_{idn}_{h}"].isna(), f"{f}_{idn}_{h}"] = np.nan
    if regime_L is not None:
        R["L"] = R["eid"].map(regime_L)
        for h in HORIZONS:
            R[f"y_reg_{h}"] = np.where(R["inst"] == "nq", R["s"] * R["L"] * R[f"raw_{h}"], np.nan)
    return R


def event_mean(R: pd.DataFrame, col: str, min_inst: int = 3) -> pd.Series:
    g = R.groupby("eid")[col]
    m, n = g.mean(), g.count()
    return m[n >= min_inst]


def regime_sign(world: World, events: pd.DataFrame) -> pd.Series:
    """L = sign of the corr of NQ daily returns with 2y yield changes over the 60 NY-close sessions before the event
    (descriptive regime-signed NQ cell, as in rate-surprise-events)."""
    s = world.sig["nq"].set_index("key")["close"]
    nq = np.log(s).diff()
    y = -np.log(world.y2_daily).diff()
    j = pd.concat([nq.rename("nq"), y.rename("y2")], axis=1).dropna()
    corr = j["nq"].rolling(60, min_periods=60).corr(j["y2"])
    keys = corr.index.to_numpy()
    out = {}
    for r in events.itertuples(index=False):
        i = int(np.searchsorted(keys, np.datetime64(ny_key(r.t)), "left")) - 1
        out[r.eid] = float(np.sign(corr.iat[i])) if i >= 0 and np.isfinite(corr.iat[i]) else np.nan
    return pd.Series(out)


# ── placebo arrays ──────────────────────────────────────────────────────────────────────────────────────────────

def placebo_arrays(P: pd.DataFrame, nkeys: int) -> dict:
    """Per placebo key and horizon: U_sig = mean_i d_i*raw (>= 3 instruments), U_mom = mean_i sign(m_i)*raw,
    RP_pos / RP_neg = mean_i R in direction +d_i / -d_i, RP_mom = mean_i R in direction sign(m_i)."""
    P = P.copy()
    P["d"] = P["inst"].map(DIRS)
    P["md"] = np.sign(P["m"]).fillna(0)
    A = {}
    for h in HORIZONS:
        raw = (P[f"lr_{h}"] / P["sig"]).where(~P[f"cont_{h}"].astype(bool) | (h == "h4"))
        raw60 = (P[f"lr_{h}"] / P["sig60"]).where(~P[f"cont_{h}"].astype(bool) | (h == "h4"))
        Rd = np.where(P["d"] > 0, P[f"Rp_{h}"], P[f"Rn_{h}"])
        Rnd = np.where(P["d"] > 0, P[f"Rn_{h}"], P[f"Rp_{h}"])
        Rm = np.where(P["md"] > 0, P[f"Rp_{h}"], np.where(P["md"] < 0, P[f"Rn_{h}"], np.nan))
        cols = {"U_sig": P["d"] * raw, "U_mom": (P["md"] * raw).where(P["md"] != 0), "U_sig60": P["d"] * raw60,
                "RP_pos": pd.Series(Rd, index=P.index).where(raw.notna()),
                "RP_neg": pd.Series(Rnd, index=P.index).where(raw.notna()),
                "RP_mom": pd.Series(Rm, index=P.index).where(raw.notna()), "B0": raw * P["d"]}
        for name, v in cols.items():
            g = pd.DataFrame({"kid": P["kid"], "v": v}).groupby("kid")["v"]
            m, n = g.mean(), g.count()
            arr = np.full(nkeys, np.nan)
            ok = n >= 3
            arr[m.index[ok].to_numpy()] = m[ok].to_numpy()
            A[(name, h)] = arr
    # per-instrument unsigned (d-direction) placebo drift, for B0
    A["B0_inst"] = {h: (P.assign(v=P["d"] * P[f"lr_{h}"] / P["sig"]).groupby("inst")["v"].mean()).to_dict() for h in HORIZONS}
    # within-event correlation of the signed legs on placebo days (h2)
    wide = P.assign(v=P["d"] * P["lr_h2"] / P["sig"]).pivot_table(index="kid", columns="inst", values="v")
    C = wide.corr().to_numpy()
    A["rho_bar_h2"] = float(np.nanmean(C[np.triu_indices_from(C, 1)])) if C.size > 1 else math.nan
    return A


def draw_placebo(cand: dict, eids: np.ndarray, arr: np.ndarray, D: int, rng) -> np.ndarray:
    """E x D matrix of placebo values. In each draw every event gets one of its candidate days with a finite value,
    and no placebo day is given to two events of the same draw when it can be avoided (up to 20 re-draws): events
    sharing a placebo day would be duplicated rows, which makes the sign-flip test anti-conservative (found by the
    selftest's null positive control on the momentum id, 2026-11-14)."""
    lists = []
    for e in eids:
        c = cand.get(e, np.array([], dtype=np.int64))
        lists.append(c[np.isfinite(arr[c])] if len(c) else c)
    out = np.full((len(eids), D), np.nan)
    order_all = rng.permuted(np.tile(np.arange(len(eids)), (D, 1)), axis=1)
    picks = [rng.integers(0, max(len(c), 1), size=(D, 21)) for c in lists]
    for d in range(D):
        used = set()
        for k in order_all[d]:
            c = lists[k]
            if not len(c):
                continue
            pk = picks[k][d]
            choice = c[pk[0]]
            for a in range(1, 21):
                if choice not in used:
                    break
                choice = c[pk[a]]
            used.add(int(choice))
            out[k, d] = arr[choice]
    return out


def clusters_for(events: pd.DataFrame) -> pd.Series:
    st = events["t"].dt.as_unit("ns").astype("int64").to_numpy()
    en = np.array([horizon_ends(t, t + pd.Timedelta(minutes=15))["h4"].value for t in events["t"]])
    return pd.Series(union_find_clusters(st, en), index=events["eid"].to_numpy())


# ── power (no event outcome) ────────────────────────────────────────────────────────────────────────────────────

def power_run(world: World, scored: pd.DataFrame, cand: dict, A: dict) -> dict:
    p = world.params
    clus = clusters_for(scored)
    sgn = scored.set_index("eid")["s"]
    eids = scored["eid"].to_numpy()
    out = {"ranAt": pd.Timestamp.now("UTC").isoformat(), "seed": p.seed, "events_sha": events_sha(world.events),
           "n_scored_events": int(len(eids)), "rho_bar_placebo_h2": A["rho_bar_h2"], "cells": {}}
    F = flip_matrix(p.n_flip_posctrl, len(eids), rng_for(p, "posctrl-flips"))
    for idn, U in ((IDS[0], "U_sig"), (IDS[1], "U_mom")):
        for h in HORIZONS:
            bar = BARS[h]
            rng = rng_for(p, "power", idn, h)
            Y = draw_placebo(cand, eids, A[(U, h)], max(p.n_placebo, p.n_posctrl * 4, p.n_power_reps), rng)
            if U == "U_sig":
                Y = Y * sgn.loc[eids].to_numpy()[:, None]
            ok = np.isfinite(Y).all(1)                  # events with a placebo value at this horizon
            Y, e_ok = Y[ok], eids[ok]
            cl = clus.loc[e_ok].to_numpy()
            Mp = Y[:, :p.n_placebo].mean(0)
            ses = [cluster_boot(Y[:, r], cl, p.B, rng_for(p, "power-boot", idn, h, r))[2] for r in range(p.n_power_reps)]
            se = float(np.median(ses))
            mde = mde_from_se(se, 0.05 / 4)
            pc = {}
            for k, mult in enumerate((0.0, 0.5, 1.0, 1.5)):
                delta = mult * bar
                Yd = Y[:, k * p.n_posctrl:(k + 1) * p.n_posctrl] + delta
                M = Yd.mean(0)
                Ms = np.abs(F[:, :len(e_ok)] @ Yd.astype(np.float32)) / len(e_ok)
                pv = (1 + (Ms >= np.abs(M)[None, :] - 1e-12).sum(0)) / (1 + F.shape[0])
                pc[f"{mult:g}xbar"] = {"delta": delta, "mean_M": float(M.mean()), "bias": float(M.mean() - delta),
                                       "reject_0.05": float((pv < 0.05).mean()), "detect_holm1_0.0125": float((pv < 0.0125).mean())}
            base0 = pc["0xbar"]["mean_M"]          # the placebo pool's own mean in this sample (sampling noise, not bias)
            for v in pc.values():
                v["increment_bias"] = float(v["mean_M"] - base0 - v["delta"])
            checks = {"recovery_within_0.25bar": all(abs(v["increment_bias"]) <= 0.25 * bar for v in pc.values()),
                      "null_rejection_le_8pct": pc["0xbar"]["reject_0.05"] <= 0.08,
                      "placebo_mean_within_0.5bar": abs(float(Mp.mean())) <= 0.5 * bar}
            out["cells"][f"{idn}|{h}"] = {
                "n_events": int(len(e_ok)), "bar": bar, "placebo_mean": float(Mp.mean()), "placebo_sd": float(Mp.std(ddof=1)),
                "placebo_q025": float(np.percentile(Mp, 2.5)), "placebo_q975": float(np.percentile(Mp, 97.5)),
                "boot_se_median": se, "mde": mde, "power_verdict": "POWERED" if mde <= bar else "UNDERPOWERED",
                "power_at_bar": pc["1xbar"]["detect_holm1_0.0125"], "positive_control": pc, "checks": checks}
    return out


def events_sha(ev: pd.DataFrame) -> str:
    cols = ["eid", "family", "t", "s"]
    return hashlib.sha256(ev[cols].astype(str).to_csv(index=False).encode()).hexdigest()[:16]


# ── scoring ─────────────────────────────────────────────────────────────────────────────────────────────────────

def _cell_stats(yb: pd.Series, clus: pd.Series, month: pd.Series, F, p: Params, tag) -> dict:
    y = yb.to_numpy(float)
    e = yb.index.to_numpy()
    lo, hi, se = cluster_boot(y, clus.loc[e].to_numpy(), p.B, rng_for(p, "boot", *tag))
    mlo, mhi, _ = cluster_boot(y, month.loc[e].to_numpy(), p.B, rng_for(p, "mboot", *tag))
    return {"n": int(len(y)), "est": float(y.mean()) if len(y) else math.nan, "lo": lo, "hi": hi, "se": se,
            "p": flip_p(y, F), "month_lo": mlo, "month_hi": mhi}


def score(world: World, rows: pd.DataFrame, P: pd.DataFrame, cand: dict, power: dict, mirror_rows: pd.DataFrame) -> dict:
    p = world.params
    ev = world.events
    scored = ev[ev["s"] != 0]
    L = regime_sign(world, scored)
    R = y_cols(rows, ev, L)
    A = placebo_arrays(P, int(P["kid"].max()) + 1 if len(P) else 0)
    clus = clusters_for(scored)
    month = scored.set_index("eid")["t"].dt.year * 12 + scored.set_index("eid")["t"].dt.month
    sgn = scored.set_index("eid")["s"]
    t_by = ev.set_index("eid")["t"]
    fam_by = ev.set_index("eid")["family"]
    F = flip_matrix(p.n_flip, len(scored) + 10, rng_for(p, "flips"))
    Rs = R[R["s"] != 0]
    res = {"ids": {}, "slices": {}, "descriptive": {}}
    for idn, tag, U in ((IDS[0], "sig", "U_sig"), (IDS[1], "mom", "U_mom")):
        cells = {}
        for h in HORIZONS:
            bar = BARS[h]
            yb = event_mean(Rs, f"y_{tag}_{h}")
            st = _cell_stats(yb, clus, month, F, p, (idn, h))
            # placebo distribution on the same events
            eids = yb.index.to_numpy()
            Y = draw_placebo(cand, eids, A[(U, h)], p.n_placebo, rng_for(p, "placebo", idn, h))
            if U == "U_sig":
                Y = Y * sgn.loc[eids].to_numpy()[:, None]
            Mp = np.nanmean(Y, 0)
            st["placebo_mean"], st["placebo_q025"], st["placebo_q975"] = float(Mp.mean()), *map(float, np.percentile(Mp, [2.5, 97.5]))
            st["placebo_pct"] = float((Mp < st["est"]).mean() * 100)
            # halves
            first = t_by.loc[eids] < pd.Timestamp(p.half_split, tz="UTC")
            st["half1"], st["half2"] = float(yb[first.to_numpy()].mean()), float(yb[~first.to_numpy()].mean())
            # top 1% of clusters by |ybar| removed
            cl = clus.loc[eids]
            score_c = yb.abs().groupby(cl.to_numpy()).max().sort_values(ascending=False)
            drop = set(score_c.index[:max(1, math.ceil(0.01 * len(score_c)))])
            keep = ~cl.isin(drop).to_numpy()
            st["trim_est"], st["trim_p"] = float(yb[keep].mean()), flip_p(yb[keep].to_numpy(), F)
            # drift-adjusted beta: raw ~ alpha(inst x family) + beta * direction
            rr = Rs[Rs[f"y_{tag}_{h}"].notna() & Rs["eid"].isin(eids)]
            dcol = "dir_sig" if tag == "sig" else "dir_mom"
            g = pd.factorize(rr["inst"] + "|" + rr["family"])[0]
            st["beta"], st["beta_lo"], st["beta_hi"] = beta_boot(rr[f"raw_{h}"].to_numpy(float), rr[dcol].to_numpy(float), g,
                                                                 clus.loc[rr["eid"]].to_numpy(), p.B, rng_for(p, "beta", idn, h))
            inst_means = rr.groupby("inst")[f"y_{tag}_{h}"].mean()
            st["inst_means"] = inst_means.to_dict()
            # sensitivities (no p-values)
            sens = {}
            for nm, col in (("entry_+1min", f"y_{tag}_e16_{h}"), ("entry_+30min", f"y_{tag}_e30_{h}"),
                            ("sigma60", f"y_{tag}60_{h}"), ("h4_contaminated_censored", f"y_{tag}_c4_{h}")):
                if col in R and (nm != "h4_contaminated_censored" or h == "h4"):
                    v = event_mean(Rs, col)
                    lo_, hi_, _ = cluster_boot(v.to_numpy(), clus.loc[v.index].to_numpy(), p.B, rng_for(p, "sens", idn, h, nm))
                    sens[nm] = {"n": int(len(v)), "est": float(v.mean()), "lo": lo_, "hi": hi_}
            nm15 = Rs[~((Rs["inst"] == "nq") & Rs["m15"].astype(bool))]
            v = event_mean(nm15, f"y_{tag}_{h}")
            lo_, hi_, _ = cluster_boot(v.to_numpy(), clus.loc[v.index].to_numpy(), p.B, rng_for(p, "sens", idn, h, "nqm15"))
            sens["nq_m15_rows_dropped"] = {"n": int(len(v)), "est": float(v.mean()), "lo": lo_, "hi": hi_}
            sens["month_block_ci"] = {"lo": st["month_lo"], "hi": st["month_hi"]}
            st["sensitivities"] = sens
            # trading view (R) against placebo-entry R with the same stop
            Rg = rr[f"R_{tag}_{h}"]
            Rn = Rg - rr[f"costR_{tag}_{h}"]
            if tag == "sig":
                pos = draw_placebo(cand, eids, A[("RP_pos", h)], 200, rng_for(p, "rplc", idn, h))
                neg = draw_placebo(cand, eids, A[("RP_neg", h)], 200, rng_for(p, "rplc2", idn, h))
                rp = np.where(sgn.loc[eids].to_numpy()[:, None] > 0, pos, neg)
            else:
                rp = draw_placebo(cand, eids, A[("RP_mom", h)], 200, rng_for(p, "rplc", idn, h))
            rpl = float(np.nanmean(rp))
            wins = Rg[Rg > 0]
            st["R"] = {"rows": int(Rg.notna().sum()), "unresolved_rows": int(rr[f"y_{tag}_{h}"].notna().sum() - Rg.notna().sum()),
                       "mean_R_gross": float(Rg.mean()), "mean_R_net": float(Rn.mean()), "placebo_entry_R": rpl,
                       "gross_minus_placebo": float(Rg.mean() - rpl), "p_win": float((Rg > 0).mean()),
                       "E_win": float(wins.mean()) if len(wins) else math.nan,
                       "E_loss": float(Rg[Rg <= 0].mean()) if (Rg <= 0).any() else math.nan,
                       "stop_rate": float((rr[f"R_{tag}_{h}"] == -1).mean()),
                       "MAE_median": float(rr[f"mae_{tag}_{h}"].median()), "MFE_median": float(rr[f"mfe_{tag}_{h}"].median())}
            ev_rn = (rr.assign(v=Rn).groupby("eid")["v"].mean())
            lo_, hi_, _ = cluster_boot(ev_rn.dropna().to_numpy(), clus.loc[ev_rn.dropna().index].to_numpy(), p.B, rng_for(p, "rnet", idn, h))
            st["R"]["net_R_event_ci"] = [lo_, hi_]
            # concentration
            yrs = t_by.loc[eids].dt.year.to_numpy()
            st["by_year"] = {int(y): float(yb[yrs == y].mean()) for y in np.unique(yrs)}
            st["last3_est"] = float(yb[(t_by.loc[eids] >= pd.Timestamp(p.last3_from, tz="UTC")).to_numpy()].mean())
            st["power"] = power["cells"][f"{idn}|{h}"]
            st["bar"] = bar
            st["t_stat"] = st["est"] / st["se"] if st["se"] and st["se"] > 0 else math.nan
            cells[h] = st
        adj = holm_adjust([cells[h]["p"] for h in HORIZONS])
        for h, a in zip(HORIZONS, adj):
            cells[h]["p_holm"] = float(a)
            cells[h]["gate"] = gate(cells[h], BARS[h])
        res["ids"][idn] = {"cells": cells}
        res["ids"][idn]["verdict"], res["ids"][idn]["cell_verdicts"] = verdict(cells)
        res["slices"][idn] = slices(world, Rs, mirror_rows, tag, clus, F, p)
    res["descriptive"] = descriptive(R, A, ev)
    res["placebo_rho_bar_h2"] = A["rho_bar_h2"]
    return res


def gate(st: dict, bar: float) -> dict:
    """Prereg §4 gate, conditions 1-7, continuation and the mirror (reversal)."""
    out = {}
    for side, sg in (("continuation", 1), ("reversal", -1)):
        e = sg * st["est"]
        im = [sg * v for v in st["inst_means"].values() if np.isfinite(v)]
        c = {"c1_holm": st["p_holm"] < 0.05,
             "c2_bar": e >= bar,
             "c3_placebo": (st["est"] > st["placebo_q975"]) if sg > 0 else (st["est"] < st["placebo_q025"]),
             "c4_halves": sg * st["half1"] >= 0.5 * bar and sg * st["half2"] >= 0.5 * bar,
             "c5_trim": sg * st["trim_est"] > 0 and st["trim_p"] < 0.05,
             "c6_beta": sg * st["beta"] >= 0.5 * bar,
             "c7_instruments": sum(v > 0 for v in im) >= 3}
        sens_flip = any(np.isfinite(v.get("est", np.nan)) and np.sign(v["est"]) != np.sign(st["est"])
                        for k, v in st["sensitivities"].items() if "est" in v)
        c["all"] = all(c.values())
        c["sensitivity_sign_flip"] = sens_flip
        out[side] = c
    return out


def verdict(cells: dict):
    """Prereg §8 mapping. Per-cell labels too."""
    lab = {}
    for h, st in cells.items():
        g = st["gate"]
        passed = [s for s in ("continuation", "reversal") if g[s]["all"]]
        if passed and not any(g[s]["sensitivity_sign_flip"] for s in passed):
            lab[h] = "validated (" + passed[0] + ")"
        elif passed or any(g[s]["c1_holm"] and g[s]["c3_placebo"] for s in g):
            lab[h] = "context"
        elif st["power"]["power_verdict"] == "POWERED" and -st["bar"] < st["lo"] and st["hi"] < st["bar"]:
            lab[h] = "null"
        else:
            lab[h] = "underpowered"
    if any(v.startswith("validated") for v in lab.values()):
        v = "VALIDATED"
    elif any(v == "context" for v in lab.values()):
        v = "CONTEXT"
    elif cells["h2"]["power"]["power_verdict"] == "POWERED" and -0.10 < cells["h2"]["lo"] and cells["h2"]["hi"] < 0.10:
        v = "NULL"
    else:
        v = "UNDERPOWERED"
    return v, lab


def _slice_cell(yb: pd.Series, clus, F, p, tag):
    y = yb.dropna()
    if len(y) < 5:
        return {"n": int(len(y)), "est": float(y.mean()) if len(y) else math.nan, "p": math.nan, "lo": math.nan, "hi": math.nan}
    cl = clus.reindex(y.index).fillna(-1).to_numpy()
    lo, hi, _ = cluster_boot(y.to_numpy(), cl if (cl >= 0).all() else np.arange(len(y)), p.B, rng_for(p, "slice", *tag))
    return {"n": int(len(y)), "est": float(y.mean()), "p": flip_p(y.to_numpy(), F), "lo": lo, "hi": hi}


def slices(world, Rs, mirror_rows, tag, clus, F, p) -> dict:
    out = {}
    ev = world.events.set_index("eid")
    for h in HORIZONS:
        col = f"y_{tag}_{h}"
        yb = event_mean(Rs, col)
        for fam in FAMILIES:
            out[f"family={fam}|{h}"] = _slice_cell(yb[ev.loc[yb.index, "family"].to_numpy() == fam], clus, F, p, (tag, "fam", fam, h))
        for inst, _ in INSTRUMENTS:
            out[f"inst={inst}|{h}"] = _slice_cell(Rs[Rs["inst"] == inst].set_index("eid")[col], clus, F, p, (tag, "inst", inst, h))
        for t in (1, 2, 3):
            out[f"tercile={t}|{h}"] = _slice_cell(yb[ev.loc[yb.index, "tercile"].to_numpy() == t], clus, F, p, (tag, "terc", t, h))
        for a in (1.0, 0.0):
            out[f"agree={int(a)}|{h}"] = _slice_cell(yb[ev.loc[yb.index, "agree"].to_numpy() == a], clus, F, p, (tag, "agree", a, h))
        col60 = f"y_{tag}_e60_{h}"
        if col60 in Rs:
            out[f"fomc_entry+60|{h}"] = _slice_cell(event_mean(Rs[Rs["family"] == "FOMC"], col60), clus, F, p, (tag, "fomc60", h))
        if tag == "sig" and f"y_reg_{h}" in Rs:
            out[f"nq_regime_signed|{h}"] = _slice_cell(Rs[Rs["inst"] == "nq"].set_index("eid")[f"y_reg_{h}"], clus, F, p, (tag, "reg", h))
        if mirror_rows is not None and len(mirror_rows):
            for fam, g in mirror_rows.groupby("family"):
                out[f"mirror={fam}|{h}"] = _slice_cell(g.set_index("eid")[f"y_{tag}_{h}"], pd.Series(dtype=float), F, p, (tag, "mir", fam, h))
    pv = np.array([v["p"] for v in out.values()])
    rej = bh_reject(pv, 0.10)
    for (k, v), r in zip(out.items(), rej):
        v["bh_q10"] = bool(r)
    n_tests = int(np.isfinite(pv).sum())
    return {"cells": out, "chance": chance_baseline(n_tests, int(np.nansum(pv < 0.05))), "bh_survivors": int(rej.sum())}


def descriptive(R, A, ev) -> dict:
    inl = R[R["s"] == 0]
    d = {"in_line_unsigned_sigma": {}, "B0_placebo_inst": A["B0_inst"], "B0_event_unsigned": {}}
    for h in HORIZONS:
        v = (inl["d"] * inl[f"raw_{h}"]).groupby(inl["eid"]).mean()
        d["in_line_unsigned_sigma"][h] = {"n": int(v.notna().sum()), "mean": float(v.mean())}
        d["B0_event_unsigned"][h] = (R.assign(v=R["d"] * R[f"raw_{h}"]).groupby("inst")["v"].mean()).to_dict()
    return d
