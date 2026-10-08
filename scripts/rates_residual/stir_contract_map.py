"""STIR contract map: for each short-rate future (and the US-euro differential and the Fed-path slope), how much does each
market move WITH it (same 15 min), and what follows a sharp move in it (next 15 min / 1 h / 4 h)?

Descriptive, not a pass/fail test: the table a trader reads ("SR3H7 rate down 1 bp -> NAS100 +x% in the same bar; after
a sharp move, NAS100 continues the expected way y% of the time over the next hour"). Every number is shown separately for
Apr-Jul and Aug-Oct, so what is stable and what is noise can be told apart. Leads found here get confirmed on older
contracts (scratchpad/ibkr_stir_pull.py --expired) before anything is built on them.

    python scripts/rates_residual/stir_contract_map.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
STIR = Path("analysis/output/stir")
OUT = Path("analysis/output/stir_contract_map")
OUT.mkdir(parents=True, exist_ok=True)
SPLIT = pd.Timestamp("2026-08-01")
B, SEED = 1000, 20261008
rng = np.random.default_rng(SEED)
CONTRACTS = {"SR3U6": "CME_SR3U6", "SR3Z6": "CME_SR3Z6", "SR3H7": "CME_SR3H7", "SR3M7": "CME_SR3M7",
             "IZ6": "ICEEU_IZ6", "ER3U6": "ICEEU_ER3U6"}
TARGETS = ["NAS100_USD", "SPX500_USD", "DE30_EUR", "EUR_USD", "GBP_USD", "USD_JPY", "XAU_USD", "USB02Y_USD"]
HZ = {"15m": 1, "1h": 4, "4h": 16}

fut = {}
for k, f in CONTRACTS.items():
    d = pd.read_csv(STIR / f"{f}.csv")
    fut[k] = pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None))
tg = {t: pd.read_parquet(M / f"{t}.parquet")["close"] for t in TARGETS}
start = max(s.index[0] for s in fut.values())
grid = pd.date_range(start.ceil("15min"), min(s.index[-1] for s in tg.values()), freq="15min")
grid = grid[grid.dayofweek < 5]
# rate level in % (100 - price); differential and slope in rate terms
R = pd.DataFrame({k: 100 - s.reindex(grid).ffill(limit=4) for k, s in fut.items()})
R["US-EU (Z6)"] = R.SR3Z6 - R.IZ6          # US 3m rate minus euro 3m rate, Dec'26
R["Fed path (M7-Z6)"] = R.SR3M7 - R.SR3Z6  # more cuts priced for 2027 -> falls
dR = R.diff() * 100                        # bp per 15-min bar
P = pd.DataFrame({t: tg[t].reindex(grid) for t in TARGETS})
ret = np.log(P).diff() * 100               # % per bar
fwd = {h: (np.log(P).shift(-k) - np.log(P)) * 100 for h, k in HZ.items()}
day = grid.normalize()
period = np.where(grid < SPLIT, "Apr-Jul", "Aug-Oct")


def boot(x, g):
    """mean of x with a day-block 95% interval."""
    df = pd.DataFrame({"x": x, "g": g}).dropna()
    if len(df) < 10:
        return [float("nan")] * 3
    s = df.groupby("g").x.agg(["sum", "count"])
    reps = []
    for _ in range(B):
        i = rng.integers(0, len(s), len(s))
        reps.append(s["sum"].to_numpy()[i].sum() / s["count"].to_numpy()[i].sum())
    return [float(df.x.mean()), *np.percentile(reps, [2.5, 97.5]).tolist()]


rows, ev_rows = [], []
for c in R.columns:
    x = dR[c]
    for t in TARGETS:
        y = ret[t]
        for per in ("Apr-Jul", "Aug-Oct"):
            m = (period == per) & x.notna().to_numpy() & y.notna().to_numpy() & (x != 0).to_numpy()
            xs, ys = x[m].to_numpy(), y[m].to_numpy()
            if len(xs) < 50:
                continue
            beta = float(np.dot(xs, ys) / np.dot(xs, xs))          # % per 1 bp, through the origin
            corr = float(np.corrcoef(xs, ys)[0, 1])
            rows.append(dict(contract=c, target=t, period=per, bars=len(xs), pct_per_bp=beta, corr=corr, r2=corr ** 2))
        # sharp moves: |change| in the top 5% of that series' non-zero 15-min changes (cut-off from Apr-Jul)
        disc = (period == "Apr-Jul") & (x != 0).to_numpy() & x.notna().to_numpy()
        cut = float(np.nanpercentile(np.abs(x[disc]), 95))
        bdisc = (period == "Apr-Jul") & x.notna().to_numpy() & y.notna().to_numpy() & (x != 0).to_numpy()
        beta_d = float(np.dot(x[bdisc], y[bdisc]) / np.dot(x[bdisc], x[bdisc]))   # expected sign from Apr-Jul only
        ev = (np.abs(x) >= cut).to_numpy() & x.notna().to_numpy()
        for per in ("Apr-Jul", "Aug-Oct"):
            e = ev & (period == per)
            exp_sign = np.sign(beta_d) * np.sign(x[e].to_numpy())             # the way the target "should" go
            r = {"contract": c, "target": t, "period": per, "events": int(e.sum()), "cut_bp": cut,
                 "same_bar_pct": float(np.nanmean(exp_sign * ret[t][e].to_numpy()))}
            for h in HZ:
                v = exp_sign * fwd[h][t][e].to_numpy()                          # follow-through AFTER the event bar
                ok = np.isfinite(v)
                r[f"{h}_mean_pct"] = float(np.mean(v[ok])) if ok.any() else np.nan
                r[f"{h}_p_follow"] = float(np.mean(v[ok] > 0)) if ok.any() else np.nan
                r[f"{h}_n"] = int(ok.sum())
            ev_rows.append(r)

S = pd.DataFrame(rows)
E = pd.DataFrame(ev_rows)
S.to_csv(OUT / "same_bar.csv", index=False, float_format="%.5f")
E.to_csv(OUT / "after_sharp_moves.csv", index=False, float_format="%.5f")

# which part of the curve moves markets most: mean same-bar R^2 over targets, per period
impact = S.pivot_table(index="contract", columns="period", values="r2", aggfunc="mean").sort_values("Apr-Jul", ascending=False)
# follow-through: pooled over targets, per contract and horizon, with stability across periods
ft = E.groupby(["contract", "period"])[[f"{h}_p_follow" for h in HZ] + [f"{h}_mean_pct" for h in HZ] + ["events"]].mean()

md = ["# STIR contract map — what each part of the rate curve does to markets", "",
      "IBKR 15-min short-rate futures vs OANDA 15-min markets, 2026-04 → 2026-10. Rates in rate terms (100 − price): "
      "**+1 bp = the market prices HIGHER rates**. Descriptive: every number is shown for Apr–Jul and Aug–Oct separately; "
      "trust what holds in both. Confirmation on older contracts comes next.", "",
      "## 1. Which part of the curve moves markets most (same 15 min)", "",
      "Average R² across the 8 markets (share of a market's 15-min moves that the contract's move explains):", "",
      "| contract | Apr–Jul | Aug–Oct |", "|---|---|---|"]
for c, r in impact.iterrows():
    md.append(f"| {c} | {r.get('Apr-Jul', np.nan) * 100:.1f}% | {r.get('Aug-Oct', np.nan) * 100:.1f}% |")
md += ["", "## 2. Expected move per 1 bp (same 15 min)", "",
       "% move in the market for a +1 bp rise in the contract's rate, Apr–Jul / Aug–Oct:", "",
       "| contract | " + " | ".join(TARGETS) + " |", "|---|" + "---|" * len(TARGETS)]
for c in R.columns:
    cells = []
    for t in TARGETS:
        a = S[(S.contract == c) & (S.target == t)].set_index("period").pct_per_bp
        cells.append(f"{a.get('Apr-Jul', np.nan):+.3f} / {a.get('Aug-Oct', np.nan):+.3f}")
    md.append(f"| {c} | " + " | ".join(cells) + " |")
md += ["", "## 3. After a sharp move (top 5% of 15-min rate moves): does the market keep going the expected way?", "",
       "Expected way = the direction the same-bar relationship (Apr–Jul) says. Follow-through measured from the END of "
       "the sharp bar. 50% = no information. Averaged over the 8 markets.", "",
       "| contract | period | sharp bars | P(follow) 15m | 1h | 4h | mean follow % 15m | 1h | 4h |", "|---|---|---|---|---|---|---|---|---|"]
for (c, per), r in ft.iterrows():
    md.append(f"| {c} | {per} | {r.events:.0f} | {r['15m_p_follow'] * 100:.0f}% | {r['1h_p_follow'] * 100:.0f}% | "
              f"{r['4h_p_follow'] * 100:.0f}% | {r['15m_mean_pct']:+.3f} | {r['1h_mean_pct']:+.3f} | {r['4h_mean_pct']:+.3f} |")
# the stable single cells: same-direction follow-through > 55% in BOTH periods at 1h
st = E.pivot_table(index=["contract", "target"], columns="period", values=["1h_p_follow", "1h_mean_pct", "1h_n"])
both = st[(st[("1h_p_follow", "Apr-Jul")] > 0.55) & (st[("1h_p_follow", "Aug-Oct")] > 0.55)]
md += ["", "## 4. Single contract → market pairs that followed through at 1 h in BOTH periods (> 55%)", "",
       "| contract | market | Apr–Jul P / mean % / n | Aug–Oct P / mean % / n |", "|---|---|---|---|"]
for (c, t), r in both.iterrows():
    md.append(f"| {c} | {t} | {r[('1h_p_follow', 'Apr-Jul')] * 100:.0f}% / {r[('1h_mean_pct', 'Apr-Jul')]:+.3f} / {r[('1h_n', 'Apr-Jul')]:.0f} | "
              f"{r[('1h_p_follow', 'Aug-Oct')] * 100:.0f}% / {r[('1h_mean_pct', 'Aug-Oct')]:+.3f} / {r[('1h_n', 'Aug-Oct')]:.0f} |")
if both.empty:
    md.append("| none | | | |")
md.append(f"\n({len(st)} contract-market pairs checked; with ~10–40 sharp bars per cell, a pair clears 55% in both periods by luck "
          "fairly often, so treat these as candidates for the older-contract check, not results.)")
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
