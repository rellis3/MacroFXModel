"""Day reconstruction, milestone 3: what happens after each existing forecast level is first reached? (descriptive)

Uses only the milestone-2 archive (days, touches, minute path) plus the phantom-ladder touches built by
phantom_touches.mjs with the same buildDay rules. No forecast is recomputed, no width refitted, no indicator added.

Outcomes per first touch (definitions fixed before looking at results):
  next      p50 -> the same family's p75 is traded through later in the session; p75 -> p90 (archive next_*_min);
            p90 -> "expansion": price travels one more rung step (p90 - p75) beyond the p90 level (cont_max)
  prev      price trades back through the previous level: p50 -> the open, p75 -> p50, p90 -> p75 (archive next_*_min)
  open_revisit price trades back through the session open (archive next_Open_min)
  closeback the session closes back on the open side of the level (close_vs_level_sig < 0)
  race_d    from the level price: does price reach level + d (continuation, bar k onward) before level - d
            (reversal, bar k+1 onward), d = 0.25 and 0.5 of the day's sigma scale (open x sigma_used)?
            Same-minute ties are counted separately and treated as stop-first in the trade proxies.
Baselines: the same outcome at phantom ladders (every rung scaled, same days, same path, same rules).
  B1 (pre-specified): mean of the x0.85 and x1.15 ladders.
  B2 (added after the first read, see REPORT.md): the probability of reaching a distance is curved in the distance,
     so the B1 average sits above the no-information value at x1.0. B2 fits a quadratic in the factor through the
     x0.70, x0.85, x1.15, x1.30 ladders and reads it at x1.0 (a fixed linear combination of the four rates).
Uncertainty: Poisson day-cluster bootstrap (all touches of a day move together), B = 2000, seed 20261029.
Trade proxy (NOT a strategy): 1:1 at distance d from the level, entry at the level price, exit at +-d or the session
close; gross R; cost = the real bid/ask spread at the touch minute / (d x scale), one spread per round trip.

    python scripts/day-reconstruction/m3_analysis.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
ARC = ROOT / "analysis/output/day-reconstruction/archive"
OUT = ROOT / "analysis/output/day-reconstruction/m3"
BA = ROOT / "data/m1_bidask_bin"
NAMES = {"GOLD": "gold", "NQ": "nq", "EURUSD": "eurusd"}
FAMS = ["OH", "OL", "CloseUp", "CloseDn", "ProjH", "ProjL"]
GROUP = {"OH": "Fixed OH/OL", "OL": "Fixed OH/OL", "CloseUp": "Fixed Close", "CloseDn": "Fixed Close",
         "ProjH": "Projected H/L", "ProjL": "Projected H/L"}
PCT = {"OH": "oh_{}_pct", "OL": "ol_{}_pct", "CloseUp": "oc_{}", "CloseDn": "oc_{}", "ProjH": "hl_{}", "ProjL": "hl_{}"}
NEXT, PREV = {"p50": "p75", "p75": "p90"}, {"p75": "p50", "p90": "p75"}
DS = (0.25, 0.5)
B = 2000
rng = np.random.default_rng(20261029)
OUTCOMES = ["next", "prev", "open_revisit", "closeback", "race25_cont", "race25_rev", "race50_cont", "race50_rev"]


def read_touches(p, phantom):
    if phantom:
        t = pd.read_json(p, lines=True, convert_dates=False, precise_float=True, dtype={"date": str})
        nx = pd.json_normalize(t.pop("next_min")).add_prefix("next_").add_suffix("_min")
        return pd.concat([t, nx], axis=1)
    t = pd.read_parquet(p)
    t["factor"] = 1.0
    return t


def outcomes(t, days, path_by_date, spread_at):
    d = days.set_index("date")
    side = np.where(t.side == "up", 1, -1)
    f = t.factor.to_numpy()
    nxt = np.full(len(t), np.nan)
    prv = np.full(len(t), np.nan)
    # next / prev from the archive's own next_*_min columns
    for rung in ("p50", "p75", "p90"):
        m = (t.rung == rung).to_numpy()
        for fam in FAMS:
            mm = m & (t.family == fam).to_numpy()
            if not mm.any():
                continue
            if rung in NEXT:
                nxt[mm] = t.loc[mm, f"next_{fam}_{NEXT[rung]}_min"].notna().astype(float)
            pcol = "next_Open_min" if rung == "p50" else f"next_{fam}_{PREV[rung]}_min"
            prv[mm] = t.loc[mm, pcol].notna().astype(float)
    # p90 expansion: one more rung step beyond p90 (cont_max, in price), step from the day's own rungs x factor
    m90 = (t.rung == "p90").to_numpy()
    for fam in FAMS:
        mm = m90 & (t.family == fam).to_numpy()
        if not mm.any():
            continue
        dd = d.loc[t.loc[mm, "date"]]
        step_pct = (dd[PCT[fam].format("p90")].to_numpy() - dd[PCT[fam].format("p75")].to_numpy()) * f[mm]
        step = step_pct / 100 * t.loc[mm, "level_price"].to_numpy()
        nxt[mm] = (t.loc[mm, "cont_max"].to_numpy() >= step).astype(float)
    out = pd.DataFrame({"next": nxt, "prev": prv, "open_revisit": t.next_Open_min.notna().astype(float).to_numpy(),
                        "closeback": (t.close_vs_level_sig < 0).astype(float).to_numpy()}, index=t.index)
    # races and trade proxies from the minute path
    for dsig in DS:
        tag = f"race{int(dsig * 100)}"
        res = np.zeros(len(t), dtype=np.int8)          # 1 cont, -1 rev, 2 tie, 0 neither
        mae = np.full(len(t), np.nan)
        rc = np.full(len(t), np.nan)
        for i, (date, k, P, s, sc) in enumerate(zip(t.date, t.k, t.level_price, side, t.scale)):
            H, L, C = path_by_date[date]
            dist = dsig * sc
            tgt, stp = P + s * dist, P - s * dist
            hc = np.flatnonzero((H[k:] >= tgt) if s > 0 else (L[k:] <= tgt))
            hr = np.flatnonzero((L[k + 1:] <= stp) if s > 0 else (H[k + 1:] >= stp)) + 1
            jc = k + hc[0] if len(hc) else None
            jr = k + hr[0] if len(hr) else None
            if jc is not None and (jr is None or jc < jr):
                res[i] = 1
                # adverse excursion before the target: lows below the level for an up touch, highs above it for a down touch
                if jc > k + 1:
                    adv = (P - L[k + 1:jc].min()) if s > 0 else (H[k + 1:jc].max() - P)
                    mae[i] = max(0.0, adv / sc)
                else:
                    mae[i] = 0.0
            elif jr is not None and (jc is None or jr < jc):
                res[i] = -1
            elif jc is not None and jc == jr:
                res[i] = 2
            else:
                res[i] = 0
                rc[i] = np.clip((C[-1] - P) * s / dist, -1, 1)
        out[f"{tag}_cont"] = (res == 1).astype(float)
        out[f"{tag}_rev"] = (res == -1).astype(float)
        out[f"{tag}_tie"] = (res == 2).astype(float)
        out[f"{tag}_mae_before_target_sig"] = mae
        # trade proxies in R at 1:1, ties stop-first for both trades, unresolved closed at the session close
        out[f"{tag}_R_cont"] = np.select([res == 1, res == -1, res == 2], [1.0, -1.0, -1.0], rc)
        out[f"{tag}_R_rev"] = np.select([res == 1, res == -1, res == 2], [-1.0, 1.0, -1.0], -rc)
        out[f"{tag}_cost_R"] = spread_at(t.t.to_numpy()) / (dsig * t.scale.to_numpy())
    return out


def load_spread(key):
    raw = open(BA / f"{key}.bin", "rb").read()
    n = int(np.frombuffer(raw, np.int32, 1)[0])
    tt = np.frombuffer(raw, np.int32, n, 4).astype(np.int64)
    cols = np.frombuffer(raw, np.float64, 12 * n, 4 + 4 * n).reshape(12, n)
    sp = cols[11] - cols[7]                                   # ask_c - bid_c

    def at(ts):
        i = np.clip(np.searchsorted(tt, ts), 0, n - 1)
        v = sp[i].copy()
        v[tt[i] != ts] = np.nan                               # no bid/ask bar at that minute (e.g. before 2016-10)
        return v
    return at


def boot_rates(frame, cols, w_days, day_index):
    """Day-cluster Poisson bootstrap of the mean of each column. Returns (point, draws[B, ncols])."""
    pos = frame.date.map(day_index).to_numpy()
    nd = len(day_index)
    cnt = np.bincount(pos, minlength=nd).astype(float)
    pt, draws = [], []
    for c in cols:
        v = frame[c].to_numpy(float)
        ok = np.isfinite(v)
        s = np.bincount(pos[ok], weights=v[ok], minlength=nd)
        n = np.bincount(pos[ok], minlength=nd).astype(float)
        pt.append(s.sum() / max(n.sum(), 1))
        draws.append((w_days @ s) / np.maximum(w_days @ n, 1e-9))
    return np.array(pt), np.array(draws).T, cnt


FACT = (0.70, 0.85, 1.15, 1.30)
_X = np.array([[1, f - 1, (f - 1) ** 2] for f in FACT])
W_B2 = np.linalg.pinv(_X)[0]                                     # quadratic fit through the four factors, read at x1.0
W_B1 = np.array([0.0, 0.5, 0.5, 0.0])


def cell(real, ph, cols, day_index, w_days):
    """real vs phantom baselines B1 and B2 for one cell: rates, difference, 95% CI, two-sided p, n touches and days."""
    pr, dr, _ = boot_rates(real, cols, w_days, day_index)
    pf, df_ = [], []
    for f in FACT:
        a, b, _ = boot_rates(ph[np.isclose(ph.factor, f)], cols, w_days, day_index)
        pf.append(a); df_.append(b)
    pf, df_ = np.array(pf), np.array(df_)                        # [4, ncols], [4, B, ncols]
    res = {}
    for j, c in enumerate(cols):
        rlo, rhi = np.nanpercentile(dr[:, j], [2.5, 97.5])
        res[c] = {"real": pr[j], "real_ci": [rlo, rhi], "phantom_by_factor": dict(zip(map(str, FACT), pf[:, j]))}
        for nm, wv in (("B1", W_B1), ("B2", W_B2)):
            base, bd = wv @ pf[:, j], np.tensordot(wv, df_[:, :, j], axes=1)
            diff = dr[:, j] - bd
            lo, hi = np.nanpercentile(diff, [2.5, 97.5])
            p = 2 * min(np.mean(diff <= 0), np.mean(diff >= 0))
            res[c][nm] = {"base": base, "diff_pp": 100 * (pr[j] - base), "diff_ci_pp": [100 * lo, 100 * hi], "p": min(1.0, p)}
    res["_n"] = int(len(real)), int(real.date.nunique()), int(len(ph))
    return res


def by_year(real, ph, col):
    yr = lambda f: pd.to_datetime(f.date).dt.year
    a = real.groupby(yr(real))[col].mean()
    n = real.groupby(yr(real))[col].size()
    pf = [ph[np.isclose(ph.factor, f)].groupby(yr(ph[np.isclose(ph.factor, f)]))[col].mean() for f in FACT]
    out = {}
    for y in a.index:
        base = sum(w * p.get(y, np.nan) for w, p in zip(W_B2, pf))
        out[int(y)] = {"n": int(n[y]), "diff_pp_B2": round(100 * (a[y] - base), 2)}
    return out


RESULTS = {}
for NAME, key in NAMES.items():
    days = pd.read_parquet(ARC / f"{NAME}_days.parquet")
    real = read_touches(ARC / f"{NAME}_touches.parquet", False)
    ph = pd.concat([read_touches(OUT / f"{NAME}_phantom_touches.jsonl", True),
                    read_touches(OUT / f"{NAME}_phantom_touches_f0.7,1.3.jsonl", True)], ignore_index=True)
    path = pd.read_parquet(ARC / f"{NAME}_path.parquet", columns=["date", "i", "high", "low", "close"])
    pbd = {dd: (g.high.to_numpy(), g.low.to_numpy(), g.close.to_numpy()) for dd, g in path.groupby("date")}
    sp_at = load_spread(key)
    real = pd.concat([real, outcomes(real, days, pbd, sp_at)], axis=1)
    ph = pd.concat([ph, outcomes(ph, days, pbd, sp_at)], axis=1)
    # path context already in the archive / derivable from the archived path (no new data)
    dd = days.set_index("date")
    for fr in (real, ph):
        t_open = fr.date.map(dd.t_open)
        fr["hour_bucket"] = pd.cut((fr.t - t_open) / 3600, [-0.01, 7, 12, 17, 22.1], labels=["00-07", "07-12", "12-17", "17-22"]).astype(str)
        fr["consumed_bucket"] = pd.cut(fr.consumed_hl_p50, [-0.01, 0.5, 1.0, 99], labels=["<0.5", "0.5-1.0", ">=1.0"]).astype(str)
        opp = np.where(fr.side == "up", "OL_p50", "OH_p50")
        fr["opposite_p50_before"] = [o in str(lb).split(";") for o, lb in zip(opp, fr.levels_before)]
        fr["sigma_regime"] = pd.cut(fr.date.map(dd.sigma_rank_250), [-0.01, 1 / 3, 2 / 3, 1.01], labels=["low", "mid", "high"]).astype(str)
        fr["prev_day"] = pd.cut(fr.date.map(dd.prev_consumed_hl_p50), [-0.01, 0.8, 1.2, 99], labels=["quiet", "normal", "wide"]).astype(str)
        tag = fr.date.map(dd.event_tag)
        fr["event"] = np.where(fr.date.map(dd.tag_status) == "unknown", "unknown",
                               np.where(tag.isin(["FOMC", "NFP", "CPI", "high"]), "event", "no_event"))
        fr["group"] = fr.family.map(GROUP)
    real.to_parquet(OUT / f"{NAME}_real_outcomes.parquet", index=False)
    ph.to_parquet(OUT / f"{NAME}_phantom_outcomes.parquet", index=False)
    R = {}
    for era in ("oos_pit", "insample_prod_params"):
        for tagset in ("all", "tagged_only"):
            re_ = real[real.era == era]
            pe_ = ph[ph.era == era]
            if tagset == "tagged_only":
                re_, pe_ = re_[re_.tag_status == "ff"], pe_[pe_.tag_status == "ff"]
            day_index = {x: i for i, x in enumerate(sorted(set(re_.date) | set(pe_.date)))}
            w = rng.poisson(1.0, (B, len(day_index))).astype(float)
            cells = {}
            for fam in FAMS:
                for rung in ("p50", "p75", "p90"):
                    a = re_[(re_.family == fam) & (re_.rung == rung)]
                    b = pe_[(pe_.family == fam) & (pe_.rung == rung)]
                    if len(a) < 30:
                        continue
                    c = cell(a, b, OUTCOMES, day_index, w)
                    c["excursion"] = {
                        "cont_max_sig_median": float(a.cont_max_sig.median()), "rev_max_sig_median": float(a.rev_max_sig.median()),
                        "ph_cont_max_sig_median_f085_115": float(b[b.factor.isin([0.85, 1.15])].cont_max_sig.median()),
                        "ph_rev_max_sig_median_f085_115": float(b[b.factor.isin([0.85, 1.15])].rev_max_sig.median()),
                        "min_to_next_median": float(a[f"next_{fam}_{NEXT[rung]}_min"].median()) if rung in NEXT else None,
                        "min_to_open_median": float(a.next_Open_min.median()), "cont_max_min_median": float(a.cont_max_min.median()),
                        "min_to_end_median": float(a.min_to_end.median()),
                        "race50_mae_before_target_median": float(a.race50_mae_before_target_sig.median()),
                        "race25_tie_share": float(a.race25_tie.mean()), "race50_tie_share": float(a.race50_tie.mean())}
                    tr = {}
                    for dsig in DS:
                        tg = f"race{int(dsig * 100)}"
                        for side_ in ("cont", "rev"):
                            g_real = a[f"{tg}_R_{side_}"].mean()
                            g_ph = float(sum(w * b[np.isclose(b.factor, f)][f"{tg}_R_{side_}"].mean() for w, f in zip(W_B2, FACT)))
                            cost = float(np.nanmedian(a[f"{tg}_cost_R"]))
                            tr[f"{tg}_{side_}"] = {"gross_R": float(g_real), "phantom_gross_R": float(g_ph),
                                                  "median_cost_R": cost, "net_R": float(g_real - np.nanmean(a[f"{tg}_cost_R"]))}
                    c["trade_proxy"] = tr
                    if era == "oos_pit" and tagset == "all":
                        c["by_year_race50_cont"] = by_year(a, b, "race50_cont")
                        c["by_year_next"] = by_year(a, b, "next")
                        c["by_year_open"] = by_year(a, b, "open_revisit")
                    cells[f"{fam}_{rung}"] = c
            # conditional (question D): family groups pooled over rungs, primary outcomes
            cond = {}
            if tagset == "all":
                for grp in ("Fixed OH/OL", "Fixed Close", "Projected H/L"):
                    a0, b0 = re_[re_.group == grp], pe_[pe_.group == grp]
                    for var in ("hour_bucket", "consumed_bucket", "opposite_p50_before", "sigma_regime", "prev_day", "event", "rung"):
                        for val in sorted(set(a0[var].map(lambda x: "na" if pd.isna(x) else str(x)))):
                            a = a0[a0[var].map(lambda x: "na" if pd.isna(x) else str(x)) == val]
                            b = b0[b0[var].map(lambda x: "na" if pd.isna(x) else str(x)) == val]
                            if len(a) < 40 or len(b) < 40:
                                continue
                            c = cell(a, b, ["race50_cont", "next", "open_revisit", "closeback"], day_index, w)
                            cond[f"{grp}|{var}|{val}"] = c
            R[f"{era}|{tagset}"] = {"cells": cells, "conditional": cond, "days": len(day_index)}
    RESULTS[NAME] = R
    print(NAME, "done", flush=True)


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else round(float(o), 5)
    if isinstance(o, (np.integer,)):
        return int(o)
    return o


(OUT / "results.json").write_text(json.dumps(clean(RESULTS), indent=1))
