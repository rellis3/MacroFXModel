"""Orchestrates one full refresh: fetch OANDA + FRED, run both variants
("fast" market-proxy features and "fred" yield features) through the
walk-forward engine, and write one JSON file the dashboard reads.

    python -m NasdaqMacroLead.dashboard_export

Requires OANDA_KEY and FRED_KEY in the environment (set on Railway; NOT
available in a local dev sandbox without them, and the fetch will raise
SystemExit cleanly if missing rather than hang).
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from . import data, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("nasdaq_macro_lead.export")

OUT_DIR = Path(__file__).resolve().parent / "out"
OUT_PATH = OUT_DIR / "dashboard_summary.json"

WF_PARAMS = dict(train_bars=500, test_bars=100, step_bars=100, z_window=250)

FAST_FEATURE_COLS = ["bond10_ret", "bond2_ret", "usd_basket_ret", "gold_ret"]
FRED_FEATURE_COLS = ["y2_chg", "y10_chg", "slope_chg", "real10_chg", "be10_chg"]


def _series_records(s: pd.Series) -> list[dict]:
    s = s.dropna()
    return [{"t": ts.isoformat(), "v": round(float(v), 4)} for ts, v in s.items()]


def _candle_records(close_df: pd.DataFrame) -> list[dict]:
    return [
        {"t": ts.isoformat(), "o": round(float(r.open), 2), "h": round(float(r.high), 2),
         "l": round(float(r.low), 2), "c": round(float(r.close), 2)}
        for ts, r in close_df.iterrows()
    ]


def run_variant(label: str, features: pd.DataFrame, feature_cols: list[str],
                target_ret: pd.Series) -> dict:
    available = [c for c in feature_cols if c in features.columns]
    missing = [c for c in feature_cols if c not in features.columns]
    if missing:
        log.warning("%s: missing features (upstream fetch failed) %s", label, missing)
    if not available:
        return {"label": label, "ok": False, "error": "no features available"}

    oos = engine.walk_forward(features, available, target_ret, **WF_PARAMS)
    if oos.empty:
        return {"label": label, "ok": False, "error": "walk-forward produced no OOS bars"}

    stats = engine.oos_stats(oos)
    window_path = engine.anchored_window_path(oos)
    next_bar = engine.next_bar_pred_price(oos)

    return {
        "label": label,
        "ok": True,
        "features_used": available,
        "features_missing": missing,
        "stats": stats,
        "oos_bars": int(len(oos)),
        "window_path": _series_records(window_path),
        "next_bar_pred": _series_records(next_bar),
    }


def main() -> int:
    oanda_key = data.oanda_key()
    fred_key = data.fred_key()

    log.info("fetching OANDA H4 bars (target + fast proxies)…")
    bars = data.fetch_fast_bars(oanda_key)
    if "target" not in bars:
        log.error("NAS100_USD fetch failed — nothing to compute, aborting")
        return 1

    fast_features = engine.build_fast_features(bars)

    log.info("fetching FRED yields…")
    fred_raw = data.fetch_fred(fred_key)
    fred_features = engine.build_fred_features(fast_features.index, fred_raw)
    combined = fast_features.join(fred_features, how="left")

    target_ret = combined["target_ret"]

    log.info("running walk-forward: fast proxies…")
    fast_result = run_variant("Fast market proxies (bond CFDs + USD basket + gold)",
                              combined, FAST_FEATURE_COLS, target_ret)

    log.info("running walk-forward: FRED yields…")
    fred_result = run_variant("FRED yields (2Y/10Y/slope/real yield/breakeven), fwd-filled to H4",
                              combined, FRED_FEATURE_COLS, target_ret)

    out = {
        "ok": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": data.TARGET_INSTRUMENT,
        "granularity": "H4",
        "walk_forward_params": WF_PARAMS,
        "candles": _candle_records(bars["target"]),
        "variants": {"fast": fast_result, "fred": fred_result},
        "notes": (
            "Research tool, not a trading signal (see README.md). Every point on "
            "window_path/next_bar_pred was produced by a model that never saw the "
            "bar it's predicting — coefficients are fit on a prior rolling window "
            "and frozen before being applied to the window plotted. There is no "
            "in-sample region shown on this chart by construction."
        ),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out))
    log.info("wrote %s (%d candles, fast ok=%s, fred ok=%s)", OUT_PATH,
             len(out["candles"]), fast_result.get("ok"), fred_result.get("ok"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
