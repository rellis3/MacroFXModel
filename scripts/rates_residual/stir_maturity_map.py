"""STIR maturity map: the contract map (stir_contract_map.py) re-cut by TIME TO EXPIRY instead of contract name, so the
expired contracts (2025 - early 2026) and the live ones (Apr-Oct 2026) can be compared like for like.

For every 15-min bar, the SOFR (and Euribor) contract with 0-3 / 3-6 / 6-9 / 9-12 months left supplies that bucket's
rate change (always within one contract: no roll jumps). Older period = 2025-01 -> 2026-03 (never used by any search);
recent = 2026-04 -> 2026-10 (the period the contract map and wide scan used). Descriptive.

    python scripts/rates_residual/stir_maturity_map.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
STIR = Path("analysis/output/stir")
OUT = Path("analysis/output/stir_maturity_map")
OUT.mkdir(parents=True, exist_ok=True)
TARGETS = ["NAS100_USD", "SPX500_USD", "DE30_EUR", "EUR_USD", "GBP_USD", "USD_JPY", "XAU_USD", "USB02Y_USD"]
HZ = {"15m": 1, "1h": 4, "4h": 16}
BUCKETS = [(0, 3), (3, 6), (6, 9), (9, 12)]
PERIODS = {"older 2025-01..2026-03": ("2025-01-01", "2026-04-01"), "recent 2026-04..2026-10": ("2026-04-01", "2026-10-09")}
# last trading day: expired contracts from their last bar; live ones from IBKR contract details (pull logs 2026-10-08)
LIVE_LAST = {"CME_SR3U6": "2026-12-15", "CME_SR3Z6": "2027-03-16", "CME_SR3H7": "2027-06-15", "CME_SR3M7": "2027-09-14",
             "ICEEU_IZ6": "2026-12-14"}


def load(prefix):
    out = {}
    for p in sorted(STIR.glob(f"{prefix}*.csv")):
        d = pd.read_csv(p)
        s = pd.Series(100 - d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None))   # rate %
        last = pd.Timestamp(LIVE_LAST.get(p.stem, str(s.index[-1].date())))
        out[p.stem] = (s, last)
    return out


SOFR = load("CME_SR3")
EUR = {k: v for k, v in load("ICEEU_I").items() if not k.startswith("ICEEU_ER3")}
tg = {t: pd.read_parquet(M / f"{t}.parquet")["close"] for t in TARGETS}
first = min(s.index[0] for s, _ in SOFR.values())
grid = pd.date_range(max(first, pd.Timestamp("2025-01-01")).ceil("15min"), min(s.index[-1] for s in tg.values()), freq="15min")
grid = grid[grid.dayofweek < 5]


def bucket_series(contracts):
    """{bucket: bp change per bar}, each bar taken from the contract whose months-to-expiry is in the bucket."""
    out = {}
    for lo, hi in BUCKETS:
        best = pd.Series(np.nan, index=grid); best_m = pd.Series(np.inf, index=grid)
        for name, (s, last) in contracts.items():
            dr = s.reindex(grid).ffill(limit=4).diff() * 100
            mte = (last - grid).days / 30.44
            ok = (mte >= lo) & (mte < hi) & dr.notna().to_numpy()
            take = ok & (mte < best_m.to_numpy())             # two contracts in a bucket: the nearer one
            best[take] = dr[take]; best_m[take] = mte[take]
        out[f"{lo}-{hi}m"] = best
    return out


SB = bucket_series(SOFR)
EB = bucket_series(EUR)
P = pd.DataFrame({t: tg[t].reindex(grid) for t in TARGETS})
ret = np.log(P).diff() * 100
fwd = {h: (np.log(P).shift(-k) - np.log(P)) * 100 for h, k in HZ.items()}

rows = []
for curve, BK in (("SOFR", SB), ("Euribor", EB)):
    for bname, x in BK.items():
        older = (grid >= PERIODS["older 2025-01..2026-03"][0]) & (grid < PERIODS["older 2025-01..2026-03"][1])
        nz = x.notna().to_numpy() & (x != 0).to_numpy()
        cut = float(np.nanpercentile(np.abs(x[older & nz]), 95)) if (older & nz).sum() > 100 else np.nan
        for pname, (a, b) in PERIODS.items():
            pm = (grid >= a) & (grid < b)
            for t in TARGETS:
                y = ret[t]
                m = pm & nz & y.notna().to_numpy()
                if m.sum() < 200:
                    continue
                xs, ys = x[m].to_numpy(), y[m].to_numpy()
                beta = float(xs @ ys / (xs @ xs)); corr = float(np.corrcoef(xs, ys)[0, 1])
                r = dict(curve=curve, bucket=bname, period=pname, target=t, bars=int(m.sum()), pct_per_bp=beta, r2=corr ** 2, cut_bp=cut)
                ev = m & (np.abs(x) >= cut).to_numpy()
                sgn = np.sign(beta) * np.sign(x[ev].to_numpy())
                r["sharp"] = int(ev.sum())
                for h in HZ:
                    v = sgn * fwd[h][t][ev].to_numpy(); v = v[np.isfinite(v)]
                    r[f"p_follow_{h}"] = float(np.mean(v > 0)) if len(v) else np.nan
                    r[f"mean_follow_{h}"] = float(np.mean(v)) if len(v) else np.nan
                rows.append(r)

D = pd.DataFrame(rows)
D.to_csv(OUT / "maturity_map.csv", index=False, float_format="%.5f")
md = ["# STIR maturity map — older contracts (2025 → Mar 2026) vs the live ones (Apr → Oct 2026)", "",
      "Same measures as `analysis/output/stir_contract_map/`, re-cut by months to expiry so expired and live contracts line "
      "up. Rates in rate terms: +1 bp = higher rates priced. The older period was never used by any search.", "",
      "## 1. Share of each market's 15-min moves explained by that part of the curve (mean R² over 8 markets)", "",
      "| curve | months to expiry | older | recent |", "|---|---|---|---|"]
imp = D.pivot_table(index=["curve", "bucket"], columns="period", values="r2", aggfunc="mean")
for (c, b), r in imp.iterrows():
    md.append(f"| {c} | {b} | {r.get('older 2025-01..2026-03', np.nan) * 100:.1f}% | {r.get('recent 2026-04..2026-10', np.nan) * 100:.1f}% |")
md += ["", "## 2. % move per +1 bp, same 15 min (SOFR), older / recent", "",
       "| months to expiry | " + " | ".join(TARGETS) + " |", "|---|" + "---|" * len(TARGETS)]
for b in [f"{lo}-{hi}m" for lo, hi in BUCKETS]:
    cells = []
    for t in TARGETS:
        s = D[(D.curve == "SOFR") & (D.bucket == b) & (D.target == t)].set_index("period").pct_per_bp
        cells.append(f"{s.get('older 2025-01..2026-03', np.nan):+.3f} / {s.get('recent 2026-04..2026-10', np.nan):+.3f}")
    md.append(f"| {b} | " + " | ".join(cells) + " |")
md += ["", "## 3. After a sharp 15-min rate move (top 5%): P(market keeps going the expected way), mean over 8 markets", "",
       "| curve | months | period | sharp bars (per market) | 15m | 1h | 4h |", "|---|---|---|---|---|---|---|"]
ft = D.groupby(["curve", "bucket", "period"])[["sharp", "p_follow_15m", "p_follow_1h", "p_follow_4h"]].mean()
for (c, b, p), r in ft.iterrows():
    md.append(f"| {c} | {b} | {p} | {r.sharp:.0f} | {r.p_follow_15m * 100:.0f}% | {r.p_follow_1h * 100:.0f}% | {r.p_follow_4h * 100:.0f}% |")
cuts = D.groupby(["curve", "bucket"]).cut_bp.first()
md += ["", "Sharp-move cut-offs (bp in 15 min, from the older period): " + ", ".join(f"{c} {b} {v:.2f}" for (c, b), v in cuts.items())]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
