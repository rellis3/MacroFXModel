"""GAMMA REGIME TRADES — fade/follow at the p75 lines by NQ dealer-gamma regime (A) and the zero-gamma break (B).
Pre-registration: forge/GAMMA_REGIME_TRADES_PREREG.md (committed before this ran).

    PYTHONPATH=. python scripts/forecast_history/gamma_regime_trades.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forecast_record import complete  # noqa: E402
from forge.bars import load_m1  # noqa: E402

OUT = Path("analysis/output/gamma_regime_trades")
START, LOCKBOX, SPLIT = "2020-09-01", "2026-08-21", "2022-12-31"
COST = 0.0001                       # round trip, fraction of price
WIN = (8 * 60, 20 * 60)             # entry window, London minutes
REPS, BLOCK = 5000, 10
rng = np.random.default_rng(20261019)

spec = importlib.util.spec_from_file_location("zg", "oi_research_book/scripts/26_zero_gamma_distance.py")
ZG = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ZG)


def sessions():
    fh = pd.read_csv("analysis/output/forecast_history/NQ.csv")
    fh = fh[complete(fh) & (fh.date >= START) & (fh.date <= LOCKBOX)].copy()
    fh["d"] = pd.to_datetime(fh.date)
    m1 = load_m1("nas100_usd")
    lon = m1.index.tz_convert("Europe/London")
    m1 = m1.assign(ldate=lon.tz_localize(None).normalize(), lmin=lon.hour * 60 + lon.minute)
    m1 = m1[m1.lmin < 22 * 60]
    groups = {d: g for d, g in m1.groupby("ldate") if d in set(fh.d)}
    return fh.set_index("d"), groups


MAX_AGE_DAYS = 4                    # variant 1 (audit fix): the value must be dated within 4 days of the cutoff


def asof_bday2(dates, s):
    """Value of series s dated <= two business days before each date, and no older than MAX_AGE_DAYS before that
    cutoff. The <=45-DTE surface exists only ~132 days a year (around quarterly expiries); without the age cap the
    first run carried a regime forward up to 53 days (found after the first run, logged as variant 1)."""
    cut = pd.DatetimeIndex(dates) - pd.offsets.BDay(2)
    left = pd.DataFrame({"k": cut.astype("datetime64[ns]")}).reset_index()
    right = pd.DataFrame({"k": pd.DatetimeIndex(s.index).astype("datetime64[ns]"), "v": s.to_numpy(),
                          "src": pd.DatetimeIndex(s.index).astype("datetime64[ns]")}).sort_values("k")
    m = pd.merge_asof(left.sort_values("k"), right, on="k", direction="backward").sort_values("index")
    stale = (m["k"] - m["src"]).dt.days > MAX_AGE_DAYS
    return np.where(stale.to_numpy(), np.nan, m["v"].to_numpy())


def run_trade(hi, lo, cl, mins, i0, entry, stop, target, long):
    """Walk from the entry minute i0 (stop checked on it, target from the next minute). Returns net R."""
    risk = abs(entry - stop)
    if risk <= 0:
        return np.nan
    exit_px = cl[-1]
    for i in range(i0, len(cl)):
        s_hit = lo[i] <= stop if long else hi[i] >= stop
        t_hit = (hi[i] >= target if long else lo[i] <= target) and i > i0
        if s_hit:
            exit_px = stop
            break
        if t_hit:
            exit_px = target
            break
    pnl = (exit_px - entry) if long else (entry - exit_px)
    return (pnl - COST * entry) / risk


def test_a(fh, G):
    rows = []
    for d, g in G.items():
        r = fh.loc[d]
        o = g.open.iloc[0]
        L = {k: o * (1 + r[f"live_oh_{k}"] / 100) for k in ("p50", "p75", "p90")}
        S = {k: o * (1 - r[f"live_ol_{k}"] / 100) for k in ("p50", "p75", "p90")}
        hi, lo, cl, mins = g.high.to_numpy(), g.low.to_numpy(), g.close.to_numpy(), g.lmin.to_numpy()
        up = np.argmax(hi >= L["p75"]) if (hi >= L["p75"]).any() else None
        dn = np.argmax(lo <= S["p75"]) if (lo <= S["p75"]).any() else None
        cands = [(i, side) for i, side in ((up, "up"), (dn, "dn")) if i is not None]
        rec = {"d": d, "open_diff": float(o / r.open - 1), "fade": np.nan, "follow": np.nan, "side": None}
        if cands:
            i, side = min(cands)
            if WIN[0] <= mins[i] < WIN[1]:
                if side == "up":
                    rec["fade"] = run_trade(hi, lo, cl, mins, i, L["p75"], L["p90"], L["p50"], long=False)
                    rec["follow"] = run_trade(hi, lo, cl, mins, i, L["p75"], L["p50"], L["p90"], long=True)
                else:
                    rec["fade"] = run_trade(hi, lo, cl, mins, i, S["p75"], S["p90"], S["p50"], long=True)
                    rec["follow"] = run_trade(hi, lo, cl, mins, i, S["p75"], S["p50"], S["p90"], long=False)
                rec["side"] = side
        rows.append(rec)
    return pd.DataFrame(rows).set_index("d").sort_index()


def test_b(fh, G, zdf, shift_sigma=0.0):
    out = []
    for d, g in G.items():
        z = zdf.loc[d] if d in zdf.index else None
        if z is None or not np.isfinite(z.Zc) or not np.isfinite(z.short_below):
            continue
        r = fh.loc[d]
        o = g.open.iloc[0]
        sig = o * r.live_sig_used / 100
        Z = z.Zc + shift_sigma * sig
        up90, dn90 = o * (1 + r.live_oh_p90 / 100), o * (1 - r.live_ol_p90 / 100)
        if not (dn90 <= Z <= up90):
            continue
        short_below = bool(z.short_below)
        hi, lo, cl, mins = g.high.to_numpy(), g.low.to_numpy(), g.close.to_numpy(), g.lmin.to_numpy()
        on_short = (cl < Z) if short_below else (cl > Z)
        R = np.nan
        for i in range(1, len(cl)):
            if not (WIN[0] <= mins[i] < WIN[1]):
                continue
            if on_short[i] and not on_short[i - 1]:
                e = cl[i]
                if short_below:
                    R = run_trade(hi, lo, cl, mins, i + 1, e, Z + 0.25 * sig, e - sig, long=False) if i + 1 < len(cl) else np.nan
                else:
                    R = run_trade(hi, lo, cl, mins, i + 1, e, Z - 0.25 * sig, e + sig, long=True) if i + 1 < len(cl) else np.nan
                break
        out.append({"d": d, "R": R})
    return pd.DataFrame(out).set_index("d")["R"] if out else pd.Series(dtype=float)


def boot_idx(n):
    p = 1.0 / BLOCK
    restarts = rng.random((REPS, n)) < p
    restarts[:, 0] = True
    anchors = rng.integers(0, n, (REPS, n))
    k = np.arange(n)
    last = np.maximum.accumulate(np.where(restarts, k, 0), axis=1)
    return (np.take_along_axis(anchors, last, axis=1) + (k - last)) % n


def a_stats(A, reg):
    fl, fo, lg = A.fade.to_numpy(), A.follow.to_numpy(), reg
    m = lambda x, msk: np.nanmean(np.where(msk, x, np.nan)) if np.any(msk & ~np.isnan(x)) else np.nan
    fade_l, fade_s, fol_l, fol_s = m(fl, lg == 1), m(fl, lg == 0), m(fo, lg == 1), m(fo, lg == 0)
    sw = np.where(lg == 1, fl, np.where(lg == 0, fo, np.nan))
    return {"I": (fade_l - fade_s) + (fol_s - fol_l), "SW": np.nanmean(sw), "FADE": np.nanmean(fl), "FOLLOW": np.nanmean(fo),
            "fade_long": fade_l, "fade_short": fade_s, "follow_long": fol_l, "follow_short": fol_s,
            "n_trades": int(np.sum(~np.isnan(sw))), "n_long": int(np.sum((lg == 1) & ~np.isnan(fl))), "n_short": int(np.sum((lg == 0) & ~np.isnan(fl)))}


def a_boot(A, reg):
    idx = boot_idx(len(A))
    fl, fo = A.fade.to_numpy(), A.follow.to_numpy()
    Is, SWs, dF, dO = [], [], [], []
    for ii in idx:
        s = a_stats(pd.DataFrame({"fade": fl[ii], "follow": fo[ii]}), reg[ii])
        Is.append(s["I"]); SWs.append(s["SW"]); dF.append(s["SW"] - s["FADE"]); dO.append(s["SW"] - s["FOLLOW"])
    q = lambda x: [round(float(v), 4) for v in np.nanpercentile(x, [2.5, 97.5])]
    return {"I_ci": q(Is), "SW_ci": q(SWs), "SW_minus_FADE_ci": q(dF), "SW_minus_FOLLOW_ci": q(dO)}


def main():
    fh, G = sessions()
    dm = pd.read_parquet("oi_research_book/data/daily_master_near_nas100_usd.parquet")
    gex = pd.Series(dm.net_gex_sum.to_numpy(), index=pd.to_datetime(dm.date)).dropna()
    gex = gex[~gex.index.duplicated()].sort_index()
    A = test_a(fh, G)
    sgn = asof_bday2(A.index, gex)
    reg = np.where(np.isnan(sgn), np.nan, (sgn >= 0).astype(float))
    keep = ~np.isnan(reg)
    A, reg = A[keep], reg[keep]
    align = float(np.nanmax(np.abs(A.open_diff)))

    res = {"prereg": "forge/GAMMA_REGIME_TRADES_PREREG.md", "sessions": int(len(A)),
           "open_alignment_max_abs_diff": round(align, 6), "share_long_gamma": round(float(reg.mean()), 3)}
    S = {k: (round(float(v), 4) if isinstance(v, float) else v) for k, v in a_stats(A, reg).items()}
    res["A"] = S | a_boot(A, reg)
    h1 = A.index <= SPLIT
    res["A_halves"] = {"<=2022": {k: round(float(v), 4) if isinstance(v, float) else v for k, v in a_stats(A[h1], reg[h1]).items()},
                       ">=2023": {k: round(float(v), 4) if isinstance(v, float) else v for k, v in a_stats(A[~h1], reg[~h1]).items()}}
    pl = a_stats(A, np.roll(reg, 125))
    res["A_placebo_shift125_I"] = round(float(pl["I"]), 4)
    a = res["A"]
    ok = (a["I_ci"][0] > 0 and a["SW_ci"][0] > 0 and a["SW_minus_FADE_ci"][0] > 0 and a["SW_minus_FOLLOW_ci"][0] > 0
          and all(h["I"] > 0 for h in res["A_halves"].values()) and abs(res["A_placebo_shift125_I"]) < a["I"] / 2)
    res["A_verdict"] = "PASS" if ok else ("NULL" if a["I_ci"][0] <= 0 <= a["I_ci"][1] and abs(a["I"]) < 0.10 else "MIXED")

    # ---- B: zero-gamma break
    z = ZG.build_z("near")
    z["date"] = pd.to_datetime(z.date)
    z = z.set_index("date").sort_index()
    nqd = pd.DataFrame(json.loads(Path("analysis/output/ladder_candidates/d1/NQ.json").read_text()))
    cfd = pd.Series(nqd.c.to_numpy(), index=pd.to_datetime(nqd.d))
    cfd = cfd[~cfd.index.duplicated()]
    z["basis"] = z.F - cfd.reindex(z.index)
    z["Zc"] = z.Z - z.basis
    z["short_below"] = np.where(z.Z.isna(), np.nan, (((z.sgn_F > 0) & (z.F > z.Z)) | ((z.sgn_F < 0) & (z.F < z.Z))).astype(float))
    days = pd.DatetimeIndex(sorted(G))
    zl = pd.DataFrame({c: asof_bday2(days, z[c]) for c in ("Zc", "short_below")}, index=days)
    res["B_basis_median"] = round(float(z.basis.median()), 2)
    Rb = test_b(fh, G, zl).dropna()
    Rp = pd.concat([test_b(fh, G, zl, +1.0), test_b(fh, G, zl, -1.0)]).dropna()

    def bmean(x):
        x = np.asarray(x)
        if len(x) < 5:
            return [None, None]
        ii = rng.integers(0, len(x), (REPS, len(x)))
        return [round(float(v), 4) for v in np.percentile(x[ii].mean(1), [2.5, 97.5])]
    diff = []
    xr, xp = Rb.to_numpy(), Rp.to_numpy()
    if len(xr) >= 5 and len(xp) >= 5:
        for _ in range(REPS):
            diff.append(xr[rng.integers(0, len(xr), len(xr))].mean() - xp[rng.integers(0, len(xp), len(xp))].mean())
    res["B"] = {"n": int(len(Rb)), "mean_R": round(float(Rb.mean()), 4) if len(Rb) else None, "ci": bmean(xr),
                "win_rate": round(float((Rb > 0).mean()), 3) if len(Rb) else None,
                "placebo_n": int(len(Rp)), "placebo_mean_R": round(float(Rp.mean()), 4) if len(Rp) else None,
                "real_minus_placebo_ci": [round(float(v), 4) for v in np.percentile(diff, [2.5, 97.5])] if diff else None}
    b = res["B"]
    res["B_verdict"] = ("PASS" if b["n"] >= 60 and b["ci"][0] is not None and b["ci"][0] > 0 and b["real_minus_placebo_ci"] and b["real_minus_placebo_ci"][0] > 0
                        else "NULL")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    A.assign(regime=reg).to_csv(OUT / "trades_A.csv")
    Rb.to_csv(OUT / "trades_B.csv")
    a = res["A"]
    f = lambda v: "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:+.3f}"
    md = ["# GAMMA REGIME TRADES (results)", "", f"Pre-registration: `forge/GAMMA_REGIME_TRADES_PREREG.md`. NQ CFD, {res['sessions']} sessions with a "
          f"regime (2020-09 → 2026-08), {res['share_long_gamma']:.0%} long gamma; costs 0.01% round trip; R = net ÷ stop distance.", "",
          f"## Test A — fade/follow at p75 by regime: **{res['A_verdict']}**", "",
          "| | long gamma | short gamma | all |", "|---|---|---|---|",
          f"| FADE mean R | {f(a['fade_long'])} | {f(a['fade_short'])} | {f(a['FADE'])} |",
          f"| FOLLOW mean R | {f(a['follow_long'])} | {f(a['follow_short'])} | {f(a['FOLLOW'])} |",
          f"| trades | {a['n_long']} | {a['n_short']} | {a['n_trades']} |", "",
          f"- Regime interaction I = **{f(a['I'])}** R [{f(a['I_ci'][0])}, {f(a['I_ci'][1])}] (positive = the regime says which to do)",
          f"- Switch strategy (fade long / follow short) = **{f(a['SW'])}** R per trade [{f(a['SW_ci'][0])}, {f(a['SW_ci'][1])}]; "
          f"vs always-fade [{f(a['SW_minus_FADE_ci'][0])}, {f(a['SW_minus_FADE_ci'][1])}], vs always-follow [{f(a['SW_minus_FOLLOW_ci'][0])}, {f(a['SW_minus_FOLLOW_ci'][1])}]",
          f"- Halves: I {f(res['A_halves']['<=2022']['I'])} (≤2022) / {f(res['A_halves']['>=2023']['I'])} (≥2023); placebo regime (shifted 125 sessions) I {f(res['A_placebo_shift125_I'])}", "",
          f"## Test B — follow a break through zero gamma into short gamma: **{res['B_verdict']}**", "",
          f"- n {b['n']}, mean **{f(b['mean_R'])}** R [{f(b['ci'][0])}, {f(b['ci'][1])}], win rate {b['win_rate']}",
          f"- placebo levels (Z ± 1σ): n {b['placebo_n']}, mean {f(b['placebo_mean_R'])} R; real − placebo {b['real_minus_placebo_ci']}",
          f"- futures − CFD basis median {res['B_basis_median']} pts; open alignment check max |Δ| {res['open_alignment_max_abs_diff']}"]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
