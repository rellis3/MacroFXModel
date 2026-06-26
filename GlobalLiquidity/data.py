"""
GlobalLiquidity — data layer.

Two sources, one interface:

  * FRED (live)   — used when FRED_API_KEY is set. Fetches each series,
                    forward-fills to a common weekly index.
  * Synthetic     — a seeded generator that produces multi-year weekly series
                    with realistic structure (trending balance sheets, a
                    liquidity cycle, correlated FX returns, stress episodes).
                    Lets the whole pipeline run + backtest offline so the
                    architecture is verifiable without keys.

Everything downstream consumes the same `Dataset` object, so swapping live for
synthetic changes nothing in gli.py / regime.py / ranker.py.
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field

import numpy as np

from . import config

log = logging.getLogger(__name__)

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
WEEKS_PER_YEAR = 52


@dataclass
class Dataset:
    """A weekly-indexed bundle of every series the system needs.

    `series` maps a FRED id (or synthetic name) to a float array aligned to
    `dates`. `fx_returns` is a {pair: weekly_log_return_array} map for the FX
    universe. `synthetic` flags provenance so reports can label it.
    """
    dates: list[str]
    series: dict[str, np.ndarray]
    fx_returns: dict[str, np.ndarray]
    synthetic: bool = False

    @property
    def n(self) -> int:
        return len(self.dates)

    def get(self, series_id: str) -> np.ndarray | None:
        return self.series.get(series_id)


# ── Live FRED ─────────────────────────────────────────────────────────────────

def _fetch_fred(series_id: str, api_key: str, start: str = "2010-01-01") -> dict[str, float]:
    import requests
    url = (f"{FRED_BASE}?series_id={series_id}&api_key={api_key}"
           f"&file_type=json&observation_start={start}&sort_order=asc")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    out: dict[str, float] = {}
    for obs in r.json().get("observations", []):
        try:
            out[obs["date"]] = float(obs["value"])
        except (ValueError, KeyError):
            pass
    return out


def _weekly_index(start: str, n_weeks: int) -> list[str]:
    """Generate n_weeks Friday-stamped ISO dates from start (numpy datetime)."""
    d0 = np.datetime64(start)
    return [str(d0 + np.timedelta64(7 * i, "D")) for i in range(n_weeks)]


def _forward_fill_to_weekly(sparse: dict[str, float], weekly_dates: list[str]) -> np.ndarray:
    """Align an arbitrary-frequency {date: value} map to the weekly grid by
    carrying the last known value forward (causal)."""
    if not sparse:
        return np.full(len(weekly_dates), np.nan)
    items = sorted(sparse.items())
    keys = np.array([np.datetime64(k) for k, _ in items])
    vals = np.array([v for _, v in items], dtype=float)
    out = np.full(len(weekly_dates), np.nan)
    last = np.nan
    j = 0
    for i, wd in enumerate(weekly_dates):
        t = np.datetime64(wd)
        while j < len(keys) and keys[j] <= t:
            last = vals[j]
            j += 1
        out[i] = last
    return out


def _collect_fred_ids() -> set[str]:
    ids: set[str] = set()
    for block in config.CB_BLOCKS.values():
        ids.update(block["components"].values())
        if block.get("fx"):
            ids.add(block["fx"])
    ids.update(config.SHADOW_PROXIES.values())
    ids.update(config.REGIME_INPUTS.values())
    ids.update([config.RISK_GATE["credit"], config.RISK_GATE["vol"]])
    return ids


def load_live(start: str = "2010-01-01") -> Dataset:
    """Load every required FRED series. FX pair returns are NOT available from
    FRED — the caller supplies them via `attach_fx_returns` (e.g. from the
    project's TwelveData/parquet cache). Without them the ranker/backtest are
    skipped but the GLI + regime still compute."""
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        raise RuntimeError("FRED_API_KEY not set; use load_synthetic() instead.")
    n_weeks = int((np.datetime64("today") - np.datetime64(start)) / np.timedelta64(7, "D"))
    weekly = _weekly_index(start, n_weeks)
    series: dict[str, np.ndarray] = {}
    for sid in sorted(_collect_fred_ids()):
        try:
            raw = _fetch_fred(sid, api_key, start)
            series[sid] = _forward_fill_to_weekly(raw, weekly)
            log.info("FRED %s: %d obs", sid, len(raw))
        except Exception as e:  # noqa: BLE001
            log.warning("FRED %s failed: %s", sid, e)
            series[sid] = np.full(len(weekly), np.nan)
    return Dataset(dates=weekly, series=series, fx_returns={}, synthetic=False)


# ── Synthetic generator (offline, seeded, realistic-ish) ──────────────────────

def load_synthetic(n_weeks: int = 600, seed: int = 7) -> Dataset:
    """Generate a coherent weekly world: a shared liquidity cycle drives central
    bank balance sheets, FX, credit, and vol, with a couple of stress episodes.
    Deterministic given seed. Used for offline verification and CI."""
    rng = np.random.default_rng(seed)
    weekly = _weekly_index("2014-01-03", n_weeks)
    t = np.arange(n_weeks)

    # Master liquidity cycle (Howell/Pal ~65mo) plus a secular uptrend.
    cycle = np.sin(2 * np.pi * t / config.CYCLE_LENGTH_WEEKS)
    cycle2 = 0.4 * np.sin(2 * np.pi * t / (config.CYCLE_LENGTH_WEEKS / 2) + 1.0)
    master = cycle + cycle2
    secular = 0.0025 * t  # balance sheets grow over time

    # Two stress episodes: gate should trip here.
    stress = np.zeros(n_weeks)
    for center, width, mag in [(int(0.32 * n_weeks), 8, 1.0), (int(0.74 * n_weeks), 6, 1.3)]:
        stress += mag * np.exp(-0.5 * ((t - center) / width) ** 2)

    def noisy(scale=1.0):
        return rng.normal(0, scale, n_weeks)

    series: dict[str, np.ndarray] = {}
    L = config.CYCLE_LENGTH_WEEKS

    def smooth(x, w=4):
        return np.convolve(x, np.ones(w) / w, mode="same")

    # Each major central bank gets its OWN cycle (distinct phase + speed). This
    # is what creates cross-currency dispersion for the ranker to exploit — in
    # the real world the Fed, ECB, BoJ, BoE and PBoC are NOT in phase.
    phases = {"USD": 0.0, "EUR": 1.3, "JPY": 2.6, "GBP": 3.9, "CNY": 5.2}
    speeds = {"USD": 1.0, "EUR": 0.9, "JPY": 1.15, "GBP": 1.05, "CNY": 0.8}
    cyc = {ccy: (np.sin(2 * np.pi * t * speeds[ccy] / L + phases[ccy])
                 + 0.3 * np.sin(2 * np.pi * t * speeds[ccy] / (L / 2) + phases[ccy]))
           for ccy in phases}

    # Central-bank balance sheets driven by each currency's own cycle.
    cb_sid = {"USD": "WALCL", "EUR": "ECBASSETSW", "JPY": "JPNASSETS",
              "GBP": "UKASSETS", "CNY": "TRESEGCNM052N"}
    base_levels = {"WALCL": 4000, "ECBASSETSW": 4500, "JPNASSETS": 5500,
                   "UKASSETS": 800, "TRESEGCNM052N": 3100}
    for ccy, sid in cb_sid.items():
        lvl = base_levels[sid]
        drift = lvl * (1 + secular + 0.25 * cyc[ccy] + 0.03 * np.cumsum(noisy(0.02)))
        drift -= lvl * 0.20 * stress           # QT / drains during stress
        series[sid] = drift
    # Fed drains: small noise so net USD liquidity tracks WALCL's own cycle.
    series["WTREGEN"] = 500 + 80 * np.abs(np.sin(t / 9)) + 30 * np.abs(noisy())
    series["RRPONTSYD"] = np.clip(800 - 600 * cyc["USD"] + 80 * noisy(), 0, None)

    # FX translation series (mild; balance-sheet level is the main signal).
    series["DEXUSEU"] = 1.10 * (1 + 0.04 * cyc["EUR"] + 0.02 * np.cumsum(noisy(0.01)))
    series["DEXJPUS"] = 110 * (1 - 0.04 * cyc["JPY"] + 0.02 * np.cumsum(noisy(0.01)))   # JPY per USD
    series["DEXUSUK"] = 1.30 * (1 + 0.04 * cyc["GBP"] + 0.02 * np.cumsum(noisy(0.01)))
    series["DEXCHUS"] = 6.8 * (1 - 0.02 * cyc["CNY"] + 0.01 * np.cumsum(noisy(0.01)))   # CNY per USD

    # Global aggregate cycle (for minor-currency beta proxies + macro inputs).
    gl_cycle = sum(config.GLI_WEIGHTS[c] * cyc[c] for c in cyc) / sum(config.GLI_WEIGHTS.values())
    gl_impulse = np.gradient(smooth(gl_cycle))

    # Shadow / private liquidity proxies.
    series["IORB"] = np.clip(2.0 + 1.5 * np.sin(t / 40), 0.1, None)
    series["SOFR"] = series["IORB"] + 0.02 + 0.30 * stress + 0.02 * np.abs(noisy())
    series["BAMLH0A0HYM2"] = np.clip(3.5 - 1.2 * gl_cycle + 4.0 * stress + 0.2 * noisy(), 1.5, None)
    series["DTWEXBGS"] = 100 * (1 - 0.05 * gl_cycle + 0.04 * stress + 0.01 * np.cumsum(noisy(0.01)))

    # Regime inputs (driven by global cycle + stress).
    series["INDPRO"] = 100 * (1 + 0.04 * gl_cycle - 0.06 * stress + 0.005 * np.cumsum(noisy(0.01)))
    series["NAPM"] = np.clip(52 + 6 * gl_cycle - 8 * stress + 0.8 * noisy(), 35, 65)
    series["T10YIE"] = np.clip(2.2 + 0.4 * gl_cycle - 0.5 * stress + 0.05 * noisy(), 0.5, None)
    series["DFII10"] = 0.5 - 0.8 * gl_cycle + 0.6 * stress + 0.08 * noisy()

    # Risk gate.
    series["VIXCLS"] = np.clip(15 - 4 * gl_cycle + 35 * stress + 1.5 * np.abs(noisy()), 9, None)

    # Per-currency "true" liquidity impulse, as the economy (not the model) knows
    # it. Majors: own-cycle impulse. Minors (no CB block): beta to the global
    # impulse — which is exactly the proxy the ranker falls back to, keeping the
    # generator and estimator consistent.
    true_impulse = {c: np.gradient(smooth(cyc[c])) for c in cyc}
    for c, beta in config.CCY_BETA_TO_GLI.items():
        if c not in true_impulse:
            true_impulse[c] = beta * gl_impulse

    # FX returns. Core hypothesis the whole system rests on: liquidity LEADS FX.
    # Return at week t is driven by the relative liquidity impulse `lead` weeks
    # earlier, plus a contemporaneous risk-off shock and idiosyncratic noise.
    # This plants real, causally-tradable lead-lag structure — it is the thesis,
    # not a fit to the estimator.
    lead = config.IMPULSE_LOOKBACK_WEEKS // 2          # liquidity leads FX ~6-7w
    risk_off = -stress / (np.abs(stress).max() + 1e-9)  # risk currencies sell off
    common = rng.normal(0, 0.012, n_weeks)              # undiversifiable market shock
    fx_returns: dict[str, np.ndarray] = {}
    for pair in config.FX_PAIRS:
        base, quote = _split_pair(pair)
        ti = true_impulse.get(base, np.zeros(n_weeks)) - true_impulse.get(quote, np.zeros(n_weeks))
        led = np.concatenate([np.zeros(lead), ti[:-lead]])
        bb = config.CCY_BETA_TO_GLI.get(base, 0.0) - config.CCY_BETA_TO_GLI.get(quote, 0.0)
        ret = (0.045 * led                     # liquidity-divergence drift (modest edge)
               + 0.010 * bb * risk_off          # risk-off hits pro-cyclical crosses
               + 0.5 * bb * common              # shared market factor (undiversifiable)
               + rng.normal(0, 0.013, n_weeks))
        fx_returns[pair] = ret

    return Dataset(dates=weekly, series=series, fx_returns=fx_returns, synthetic=True)


def _split_pair(pair: str) -> tuple[str, str]:
    if pair == "XAUUSD":
        return "XAU", "USD"
    return pair[:3], pair[3:]


def attach_fx_returns(ds: Dataset, fx_returns: dict[str, np.ndarray]) -> Dataset:
    """Attach externally-loaded FX weekly returns (e.g. from the project's
    parquet cache) to a live FRED dataset."""
    ds.fx_returns = fx_returns
    return ds


def load(prefer_live: bool = True) -> Dataset:
    """Convenience: live FRED if a key is present, else synthetic."""
    if prefer_live and os.environ.get("FRED_API_KEY"):
        try:
            return load_live()
        except Exception as e:  # noqa: BLE001
            log.warning("live load failed (%s); falling back to synthetic", e)
    return load_synthetic()
