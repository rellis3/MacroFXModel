"""gamma-regime-trades-fx — the daily hedge plan (fade on long-gamma days, follow on short-gamma days) on EUR/USD,
GBP/USD, AUD/USD. Pre-registration: forge/GAMMA_REGIME_TRADES_FX_PREREG.md (committed before this ran).

The trade engine, costs and regime freshness rule are imported unchanged from
scripts/forecast_history/gamma_regime_trades.py (Test A, variant 1).

    PYTHONPATH=. python scripts/gamma-regime-trades-fx/run.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, "scripts/forecast_history")
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import gamma_regime_trades as GR  # noqa: E402
from forecast_record import complete  # noqa: E402
from forge.bars import load_m1  # noqa: E402

SEED = 20261020
GR.rng = np.random.default_rng(SEED)
OUT = Path("analysis/output/gamma-regime-trades-fx")
PAIRS = {"EURUSD": ("eurusd", "daily_master_near"), "GBPUSD": ("gbpusd", "daily_master_near_gbp_usd"),
         "AUDUSD": ("audusd", "daily_master_near_aud_usd")}


def sessions(pair, m1name):
    fh = pd.read_csv(f"analysis/output/forecast_history/{pair}.csv")
    fh = fh[complete(fh) & (fh.date >= GR.START) & (fh.date <= GR.LOCKBOX)].copy()
    fh["d"] = pd.to_datetime(fh.date)
    m1 = load_m1(m1name)
    m1 = m1[(m1.index >= "2020-08-25") & (m1.index <= "2026-08-23")]
    lon = m1.index.tz_convert("Europe/London")
    m1 = m1.assign(ldate=lon.tz_localize(None).normalize(), lmin=lon.hour * 60 + lon.minute)
    m1 = m1[m1.lmin < 22 * 60]
    keep = set(fh.d)
    return fh.set_index("d"), {d: g for d, g in m1.groupby("ldate") if d in keep}


def main():
    frames = {}
    for pair, (m1name, dmf) in PAIRS.items():
        fh, G = sessions(pair, m1name)
        dm = pd.read_parquet(f"oi_research_book/data/{dmf}.parquet")
        gex = pd.Series(dm.net_gex_sum.to_numpy(), index=pd.to_datetime(dm.date)).dropna()
        gex = gex[~gex.index.duplicated()].sort_index()
        A = GR.test_a(fh, G)
        sgn = GR.asof_bday2(A.index, gex)
        A["regime"] = np.where(np.isnan(sgn), np.nan, (sgn >= 0).astype(float))
        A["pair"] = pair
        dropped = int(A.regime.isna().sum())
        A = A[A.regime.notna()]
        A["regime_placebo"] = np.roll(A.regime.to_numpy(), 125)
        frames[pair] = (A, dropped, float(np.max(np.abs(A.open_diff))))
        print(f"{pair}: {len(A)} sessions with a fresh regime ({dropped} dropped), "
              f"{int(A.fade.notna().sum())} trades; open alignment max |Δ| {frames[pair][2]:.2e}", flush=True)

    P = pd.concat([f[0] for f in frames.values()]).sort_index()
    rnd = lambda d: {k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in d.items()}
    stat = lambda X, col="regime": rnd(GR.a_stats(X, X[col].to_numpy()))

    # pooled bootstrap: resample DATES (stationary blocks) and keep every pair's row on a drawn date
    dates = np.sort(P.index.unique())
    by_date = {d: np.where(P.index == d)[0] for d in dates}
    idx = GR.boot_idx(len(dates))
    fl, fo, rg = P.fade.to_numpy(), P.follow.to_numpy(), P.regime.to_numpy()
    reps = {"SW": [], "SW-FADE": [], "SW-FOLLOW": [], "I": []}
    for ii in idx:
        rows = np.concatenate([by_date[dates[k]] for k in ii])
        s = GR.a_stats(pd.DataFrame({"fade": fl[rows], "follow": fo[rows]}), rg[rows])
        reps["SW"].append(s["SW"]); reps["SW-FADE"].append(s["SW"] - s["FADE"]); reps["SW-FOLLOW"].append(s["SW"] - s["FOLLOW"]); reps["I"].append(s["I"])
    ci = {k: [round(float(x), 4) for x in np.nanpercentile(v, [2.5, 97.5])] for k, v in reps.items()}

    res = {"prereg": "forge/GAMMA_REGIME_TRADES_FX_PREREG.md", "seed": SEED,
           "pairs": {p: {"sessions": int(len(f[0])), "dropped_no_fresh_regime": f[1], "open_alignment_max_abs": f[2], **stat(f[0])} for p, f in frames.items()},
           "pooled": stat(P), "pooled_ci": ci,
           "halves": {"<=2022": stat(P[P.index <= "2022-12-31"]), ">=2023": stat(P[P.index >= "2023-01-01"])},
           "placebo_shift125": stat(P, "regime_placebo")}
    po = res["pooled"]
    pairs_pos = sum(v["SW"] > 0 for v in res["pairs"].values())
    gate = (ci["SW"][0] > 0 and ci["SW-FADE"][0] > 0 and ci["SW-FOLLOW"][0] > 0 and pairs_pos >= 2
            and all(h["SW"] > 0 for h in res["halves"].values()))
    mirror_ok = res["placebo_shift125"]["SW"] < po["SW"] / 2
    half_width = (ci["SW"][1] - ci["SW"][0]) / 2
    if gate and mirror_ok:
        verdict = "VALIDATED"
    elif ci["SW"][1] < 0.07 or (ci["SW"][0] <= 0 <= ci["SW"][1] and half_width <= 0.06):
        verdict = "NULL"
    else:
        verdict = "UNDERPOWERED"
    res["verdict"] = verdict
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    P.to_csv(OUT / "trades.csv")

    f = lambda v: "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:+.3f}"
    md = ["# gamma-regime-trades-fx (results)", "",
          f"Pre-registration: `forge/GAMMA_REGIME_TRADES_FX_PREREG.md`. Seed {SEED}. EUR/USD, GBP/USD, AUD/USD, 2020-09 → 2026-08; "
          "rules exactly as the OI page's daily hedge plan; costs 0.01% round trip; R = net ÷ stop distance.", "",
          f"**Verdict: {verdict}.**", "",
          "| | sessions | trades | fade, long gamma | fade, short gamma | follow, long gamma | follow, short gamma | **plan (switch)** | always fade | always follow |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for p, v in list(res["pairs"].items()) + [("**pooled**", {**po, "sessions": sum(r["sessions"] for r in res["pairs"].values())})]:
        md.append(f"| {p} | {v['sessions']:,} | {v['n_trades']:,} | {f(v['fade_long'])} | {f(v['fade_short'])} | {f(v['follow_long'])} | {f(v['follow_short'])} | **{f(v['SW'])}** | {f(v['FADE'])} | {f(v['FOLLOW'])} |")
    md += ["", f"- Plan, pooled: **{f(po['SW'])} R per trade** [{f(ci['SW'][0])}, {f(ci['SW'][1])}]; vs always-fade [{f(ci['SW-FADE'][0])}, {f(ci['SW-FADE'][1])}]; "
           f"vs always-follow [{f(ci['SW-FOLLOW'][0])}, {f(ci['SW-FOLLOW'][1])}]; regime interaction {f(po['I'])} [{f(ci['I'][0])}, {f(ci['I'][1])}]",
           f"- Halves: plan {f(res['halves']['<=2022']['SW'])} (≤2022) / {f(res['halves']['>=2023']['SW'])} (≥2023)",
           f"- Mirror (regime shifted 125 sessions): plan {f(res['placebo_shift125']['SW'])} R",
           f"- Pairs with the plan > 0: {pairs_pos} of 3"]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
