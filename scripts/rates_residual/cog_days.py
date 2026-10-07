"""Descriptive: the S1 rates gap (I - O, sigma units; + = rates imply UP vs where price is) through C.OG's trade days
and the two NQ days he showed on stream (2 Oct, 5 Oct 2026). Not a test (n = 8 days).

    python scripts/rates_residual/cog_days.py
"""
from pathlib import Path
import pandas as pd

G = pd.read_parquet("analysis/output/rates_residual/gaps_S1.parquet")
DAYS = [("NAS100_USD", "2026-08-31", "BUY (his trade)"), ("NAS100_USD", "2026-09-09", "BUY (his trade)"),
        ("EUR_USD", "2026-09-11", "BUY (his trade)"), ("EUR_USD", "2026-09-24", "BUY (his trade)"),
        ("XAU_USD", "2026-09-03", "BUY (his trade, London-open retest)"), ("XAU_USD", "2026-09-28", "SELL (his trade, London-open retest)"),
        ("NAS100_USD", "2026-10-02", "stream: rates turned 13:41/15:07, NQ up after 16:03"),
        ("NAS100_USD", "2026-10-05", "stream: rates up 13:41-15:07, NQ jump 14:15")]
out = ["# The rates gap on C.OG's days (descriptive, n = 8)", "",
       "Gap = rates-implied 4h move minus price's own 4h move (σ units), from the S1 natural-driver fit (US 2y + 10y CFDs; "
       "+ Bund for EURUSD). Positive = rates say price should be HIGHER than it is. Times UK.", ""]
for tgt, day, note in DAYS:
    g = G.loc[tgt]
    t0 = pd.Timestamp(day) + pd.Timedelta(hours=10)          # 11:00 UK (BST = UTC+1)
    w = g[(g.index >= t0) & (g.index < t0 + pd.Timedelta(hours=7))]
    gap = (w.I - w.O).dropna()
    if gap.empty:
        out.append(f"- **{tgt} {day}** {note}: no gap data"); continue
    row = " ".join(f"{(t + pd.Timedelta(hours=1)).strftime('%H:%M')} {v:+.1f}" for t, v in gap.iloc[::2].items())
    sess = gap[(gap.index >= t0 + pd.Timedelta(hours=2)) & (gap.index < t0 + pd.Timedelta(hours=5))]
    out.append(f"- **{tgt} {day}** — {note}. Mean gap 13:00–16:00 UK: **{sess.mean():+.2f}**. Path (every 30 min): {row}")
Path("analysis/output/rates_residual/COG_DAYS.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("\n".join(out).encode("ascii", "replace").decode())
