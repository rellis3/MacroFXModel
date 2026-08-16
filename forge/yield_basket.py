"""yield_basket — a cross-sectional basket built on YieldSpreadBot's engine,
not a replacement for it.

WHERE THIS COMES FROM
──────────────────────
YieldSpreadBot (`YieldSpreadBot/yield_spread_bot.py`, live) trades 6 pairs
INDEPENDENTLY: each pair enters on its OWN US-vs-foreign 2Y rate-differential
z-score crossing ±2.0, exits on reversion or a time stop. That per-pair math
(`js/yieldSpreadEngine.js` / `js/zscoreSpreadEngine.js`) is validated with a
real IS/OOS split and a robustness sweep — it is not the thing in question
here, and this module does not touch or re-implement the live bot.

What IS worth testing: the same rate-differential idea, restructured as a
cross-sectional BASKET instead of 6 independent single-pair bets. This
directly answers the open question from the residual thread — is YieldSpread
exposed to the same single-instrument drift risk that sank the very first
residual idea (price minus its own moving average), because each of its 6
pairs trades in isolation rather than netting against the others?

Unlike the currency-network residual (`forge/residual.py`), this driver is a
REAL, slow-moving economic quantity — a rate differential, not fitted
triangulation slack — so there is a genuine reason to expect it might carry
multi-day persistence where the network residual didn't.

DESIGN
──────
For every pair computable from a currency with a CONFIRMED short-rate FRED
series (see CURRENCY_RATE_SERIES below — NZD has no confirmed series in this
repo, so NZD-involving pairs are excluded, not guessed), compute the exact
same rolling z-score YieldSpreadBot uses (`js/zscoreSpreadEngine.js:
buildRollingZSeries`, replicated in `pair_rate_diff_z` below — same pub-lag
shift, same rolling window, same warmup), then rank pairs by |z| each day
cross-sectionally: long the K most negative (rate differential unusually
low vs its own history — bet on FX reversion up), short the K most
positive, non-overlapping rebalance, cost-net, walk-forward against a
shuffled-score null. This reuses `forge.residual`'s basket/walk-forward/null
machinery directly (it is generic over any z-scored panel) rather than
duplicating it a third time — this module IS the "build on the engine, grow
into something else" ask, not a parallel implementation.

DATA BLOCKER (read before running)
────────────────────────────────────
This module needs FRED short-rate series, fetched live (`fetch_fred_series`)
with a `FRED_API_KEY`. As of writing, this repo has no committed local cache
of yield data anywhere, and the sandbox this was authored in had
`api.stlouisfed.org` blocked at the network-policy level regardless of key —
so this module is WRITTEN but UNRUN. Run it somewhere with FRED access (the
production server already has `FRED_KEY` for the live bot) or vendor a small
local CSV/parquet cache of the ~7 series below (2Y-ish daily/monthly history
is tiny — a few hundred KB) and point `fetch_fred_series` at it instead.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from forge.bars import load_m1, frame
from forge.residual import (
    add_forward_returns, basket_returns, design, apply_spec, fold_bounds,
    walk_forward, shuffle_scores, DEFAULT_K_GRID, DEFAULT_SIGN_GRID,
)
from pylego.costs import default_spread

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Currency -> FRED short-rate series id, lifted directly from
# `js/zscoreSpreadEngine.js: ZSCORE_PAIRS` (the live engine's own choices —
# not re-derived here) plus USD's own 2Y (`GS2`, the "base" leg every pair in
# that file already uses). EUR uses the German short-rate proxy, matching the
# live engine's convention. NZD: no confirmed series in this repo — left out
# rather than guessed; NZD-involving pairs are simply absent from the
# universe this produces until one is verified.
CURRENCY_RATE_SERIES = {
    "USD": "GS2",
    "JPY": "IRSTCI01JPM156N",
    "EUR": "IRSTCI01DEM156N",
    "GBP": "IR3TIB01GBM156N",
    "AUD": "IR3TIB01AUM156N",
    "CAD": "IRSTCI01CAM156N",
    "CHF": "IR3TIB01CHM156N",
}

DEFAULT_PUB_LAG_US_DAYS = 2
DEFAULT_PUB_LAG_FOREIGN_DAYS = 45
DEFAULT_Z_WINDOW = 90          # YieldSpreadBot's live plan default (YIELD_SPREAD_BOT_DEFAULTS)
DEFAULT_H_GRID = (1, 5, 10, 20)


def fetch_fred_series(series_id: str, api_key: str, start: str = "2010-01-01") -> pd.Series:
    """Live FRED fetch — same endpoint/shape as `js/zscoreSpreadEngine.js:
    fetchFredObservations`. Requires network access to `api.stlouisfed.org`;
    see the module docstring's DATA BLOCKER note if this raises/hangs."""
    import requests
    url = (f"{FRED_BASE}?series_id={series_id}&api_key={api_key}"
          f"&file_type=json&observation_start={start}&sort_order=asc")
    r = requests.get(url, timeout=25)
    r.raise_for_status()
    obs = r.json().get("observations", [])
    dates, vals = [], []
    for o in obs:
        if o["value"] in (".", None):
            continue
        dates.append(o["date"]); vals.append(float(o["value"]))
    return pd.Series(vals, index=pd.to_datetime(dates)).sort_index()


def build_currency_rates(api_key: str, start: str = "2010-01-01",
                         series_map: dict[str, str] = None) -> pd.DataFrame:
    """Date x currency frame of short rates, forward-filled across calendar
    days (monthly OECD series carry forward between releases, exactly like
    `buildRollingZSeries`'s spread construction)."""
    series_map = series_map or CURRENCY_RATE_SERIES
    cols = {c: fetch_fred_series(sid, api_key, start) for c, sid in series_map.items()}
    idx = pd.date_range(min(s.index.min() for s in cols.values()), pd.Timestamp.today(), freq="D")
    return pd.DataFrame({c: s.reindex(idx).ffill() for c, s in cols.items()}, index=idx)


def universe_from_currencies(currencies: list[str], available_pairs: list[str]) -> list[str]:
    """Every pair in `available_pairs` (the real, on-disk universe — e.g.
    `forge.residual.fx_universe()`) whose base AND quote currency both have a
    confirmed rate series. Deliberately does NOT try to construct pair names
    from currency codes: FX quoting convention isn't alphabetical (it's
    `euraud`, never `audeur`; `usdchf`, never `chfusd`), and guessing that
    ordering silently drops real pairs — this filters the actual universe
    instead of guessing at it, so it can't get the convention wrong."""
    from forge.residual import split_pair
    ccy = set(currencies)
    return [p for p in available_pairs if set(split_pair(p)) <= ccy]


def pair_rate_diff_z(rates: pd.DataFrame, base: str, quote: str, z_window: int = DEFAULT_Z_WINDOW,
                     pub_lag_us_days: int = DEFAULT_PUB_LAG_US_DAYS,
                     pub_lag_foreign_days: int = DEFAULT_PUB_LAG_FOREIGN_DAYS) -> pd.Series:
    """Causal rolling z-score of (base_rate - quote_rate) — the exact
    construction `js/zscoreSpreadEngine.js: buildRollingZSeries` uses, ported
    to pandas. Publication-lag shift: a rate nominally dated D is not KNOWN
    until D+lag, so each leg is shifted forward before differencing — USD
    gets the short (Treasury, 2-day) lag, everyone else gets the OECD/BIS
    monthly-release lag (45 days is the live engine's own default). The
    window is a plain trailing rolling window (`.shift(1)`-free here because
    the rate series is already lagged to be causal at the point of shift —
    matching the live engine's own causality contract, not adding a second
    one on top)."""
    us_lag = pub_lag_us_days if base == "USD" else pub_lag_foreign_days
    quote_lag = pub_lag_us_days if quote == "USD" else pub_lag_foreign_days
    base_s = rates[base].shift(us_lag)
    quote_s = rates[quote].shift(quote_lag)
    spread = base_s - quote_s
    mean = spread.rolling(z_window, min_periods=min(z_window, 30)).mean()
    std = spread.rolling(z_window, min_periods=min(z_window, 30)).std()
    return (spread - mean) / std.replace(0, np.nan)


def build_yield_score_panel(rates: pd.DataFrame, pairs: list[str], data_root: str = "VolRangeForecaster/data/m1",
                            z_window: int = DEFAULT_Z_WINDOW,
                            pub_lag_us_days: int = DEFAULT_PUB_LAG_US_DAYS,
                            pub_lag_foreign_days: int = DEFAULT_PUB_LAG_FOREIGN_DAYS) -> pd.DataFrame:
    """Long-format (date, pair, z, close, cost_pct) panel — the rate-driven
    analogue of `forge.residual.build_score_panel`, but the z here comes
    directly from `pair_rate_diff_z` (a real rate differential) rather than
    from standardizing a price-based residual level."""
    rows = []
    for p in pairs:
        base, quote = p[:3].upper(), p[3:].upper()
        if base not in rates.columns or quote not in rates.columns:
            continue
        z = pair_rate_diff_z(rates, base, quote, z_window, pub_lag_us_days, pub_lag_foreign_days)
        m1 = load_m1(p, data_root)
        daily = frame(m1, "d1")["close"]
        # UTC tz-aware (forge.bars' convention) -> naive calendar date, same fix
        # `forge.bars.day_key` applies and for the same reason: FRED dates carry
        # no timezone, so reindexing a naive series against a tz-aware index
        # silently matches nothing rather than raising -- this bit in testing.
        daily.index = daily.index.normalize().tz_localize(None)
        z = z.reindex(daily.index).dropna()
        c = daily.reindex(z.index)
        rows.append(pd.DataFrame({
            "date": z.index, "pair": p, "z": z.to_numpy(),
            "close": c.to_numpy(), "cost_pct": (default_spread(p) / c).to_numpy(),
        }))
    if not rows:
        return pd.DataFrame(columns=["date", "pair", "z", "close", "cost_pct"])
    panel = pd.concat(rows, ignore_index=True)
    panel = panel.dropna(subset=["z", "close"])
    return panel.sort_values(["date", "pair"]).reset_index(drop=True)


def closes_wide(pairs: list[str], data_root: str = "VolRangeForecaster/data/m1") -> pd.DataFrame:
    """Wide date x pair close frame, for `forge.residual.add_forward_returns`
    (which expects this shape, same as the currency-network study)."""
    cols = {}
    for p in pairs:
        m1 = load_m1(p, data_root)
        daily = frame(m1, "d1")["close"]
        # UTC tz-aware (forge.bars' convention) -> naive calendar date, same fix
        # `forge.bars.day_key` applies and for the same reason: FRED dates carry
        # no timezone, so reindexing a naive series against a tz-aware index
        # silently matches nothing rather than raising -- this bit in testing.
        daily.index = daily.index.normalize().tz_localize(None)
        cols[p] = daily
    return pd.DataFrame(cols)
