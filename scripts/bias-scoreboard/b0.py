"""bias-scoreboard B0: the frozen same-day base rates (forge/BIAS_SCOREBOARD_PREREG.md §3.3).

p0[inst][target] = share of London weekdays 2016-01-04 -> 2026-08-21 on which mid(end) > mid(07:00 London), with
  d21 end = 21:00 London on D, n07 = 07:00 on the next London weekday, d5 = 07:00 on the 5th London weekday on.
Mid at T = close of the last M1 bar starting in [T - 5 min, T) (the live rule, js/directionLedger.js midAt).
Lockbox: M1 is cut at 2026-08-22 00:00 UTC and a row counts only if its END time is on or before 2026-08-21 London,
so no post-lockbox minute is read. Writes js/biasScoreboardBaselines.json (version b0-sameday-20260821).

    python scripts/bias-scoreboard/b0.py            # needs the research M1 cache (FX + gold) and portfolioBacktest/cache (indices)

If any file is missing the script stops and writes nothing: the registered fallback (version b0-coin, p0 = 0.5) stays.
Seed 20261114 (not used: no resampling here).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge.bars import load_m1  # noqa: E402

START, END = "2016-01-04", "2026-08-21"
TARGETS = ("d21", "n07", "d5")
FX_ROOT, INDEX_ROOT = ROOT / "VolRangeForecaster/data/m1", ROOT / "portfolioBacktest/cache"
# ledger instrument -> (cache root, file key)
SOURCES = {
    "nq": (INDEX_ROOT, "nq"), "es": (INDEX_ROOT, "spx500"), "us30": (INDEX_ROOT, "us30"), "gold": (FX_ROOT, "xauusd"),
    "eurusd": (FX_ROOT, "eurusd"), "gbpusd": (FX_ROOT, "gbpusd"), "usdjpy": (FX_ROOT, "usdjpy"), "audusd": (FX_ROOT, "audusd"),
    "nzdusd": (FX_ROOT, "nzdusd"), "usdcad": (FX_ROOT, "usdcad"), "usdchf": (FX_ROOT, "usdchf"), "gbpjpy": (FX_ROOT, "gbpjpy"),
    "eurjpy": (FX_ROOT, "eurjpy"),
}
OUT = ROOT / "js/biasScoreboardBaselines.json"


def london(date, hh):
    return pd.Timestamp(f"{date} {hh:02d}:00", tz="Europe/London").tz_convert("UTC")


def mid_at(close: pd.Series, t):
    w = close[(close.index >= t - pd.Timedelta(minutes=5)) & (close.index < t)]
    return float(w.iloc[-1]) if len(w) else np.nan


def main():
    if (FX_ROOT / "gold_m1.parquet").exists():   # the gold file is cached as gold or xauusd (data-rules instruments.md)
        SOURCES["gold"] = (FX_ROOT, "gold")
    missing = [f"{r}/{k}_m1.parquet" for r, k in SOURCES.values() if not (r / f"{k}_m1.parquet").exists()]
    if missing:
        sys.exit(f"b0.py: M1 not available ({len(missing)} files missing, e.g. {missing[0]}); nothing written, b0-coin stays")
    days = [d.strftime("%Y-%m-%d") for d in pd.bdate_range(START, END)]
    nxt = {d: days[i + 1:i + 6] for i, d in enumerate(days)}
    out = {}
    for inst, (root, key) in SOURCES.items():
        m1 = load_m1(key, root)
        close = m1["close"][m1.index < pd.Timestamp("2026-08-22", tz="UTC")]
        ys = {t: [] for t in TARGETS}
        for d in days:
            a = mid_at(close, london(d, 7))
            if not np.isfinite(a):
                continue
            ends = {"d21": london(d, 21)}
            if len(nxt[d]) >= 1:
                ends["n07"] = london(nxt[d][0], 7)
            if len(nxt[d]) >= 5:
                ends["d5"] = london(nxt[d][4], 7)
            for t, te in ends.items():
                e = mid_at(close, te)
                if np.isfinite(e):
                    ys[t].append(1 if e > a else 0)
        out[inst] = {t: {"p0": round(float(np.mean(v)), 6), "n": len(v)} for t, v in ys.items() if v}
        print(inst, {t: out[inst][t] for t in out[inst]})
    OUT.write_text(json.dumps({"version": "b0-sameday-20260821", "prereg": "forge/BIAS_SCOREBOARD_PREREG.md",
                               "window": [START, END], "rule": "share of mid(end) > mid(07:00 London), London weekdays",
                               "instruments": out}, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
