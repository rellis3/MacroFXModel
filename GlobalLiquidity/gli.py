"""
GlobalLiquidity — the Global Liquidity Index (GLI) nowcaster.

This is the keystone. It turns raw central-bank, FX, repo, credit and dollar
series into:

  * gli_level      — aggregate global liquidity, FX-translated to USD, z-scored
  * gli_impulse    — the 13-week rate-of-change (what markets actually trade)
  * cycle_position — where we are in the ~65-month liquidity cycle (0..1 phase)
  * per_ccy_impulse — each currency block's own liquidity impulse (feeds the
                      cross-sectional FX ranker)

Design choices that make it a *nowcast* rather than a lagging report:
  * publication lags are applied per source (no lookahead), AND
  * the level is built from the freshest available components, so the impulse
    turns before the official aggregate prints.

Howell's point — base money is only ~15% of global liquidity — is honoured by
blending a shadow/private-liquidity tilt (repo stress, credit, broad dollar)
into the headline index.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import config, mathx


@dataclass
class GLIResult:
    dates: list[str]
    gli_level: np.ndarray       # z-scored aggregate
    gli_impulse: np.ndarray     # z-scored 13w RoC
    cycle_position: np.ndarray  # 0..1 phase within the liquidity cycle
    per_ccy_level: dict[str, np.ndarray]
    per_ccy_impulse: dict[str, np.ndarray]
    raw_usd_liquidity: np.ndarray  # aggregate in USD (pre-z), for inspection

    def latest(self) -> dict:
        i = len(self.dates) - 1
        return {
            "date": self.dates[i],
            "gli_level_z": _f(self.gli_level[i]),
            "gli_impulse_z": _f(self.gli_impulse[i]),
            "cycle_position": _f(self.cycle_position[i]),
            "per_ccy_impulse": {k: _f(v[i]) for k, v in self.per_ccy_impulse.items()},
        }


def _f(x) -> float | None:
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 3)


def _block_usd_liquidity(ds, block_key: str) -> np.ndarray:
    """Compute one currency block's liquidity translated to USD (pre-z)."""
    block = config.CB_BLOCKS[block_key]
    comps = {name: mathx.ffill(ds.get(sid)) for name, sid in block["components"].items()}
    # Evaluate the formula in a tiny safe namespace.
    local = eval(block["formula"], {"__builtins__": {}}, comps)  # noqa: S307 - controlled input
    local = np.asarray(local, dtype=float)

    fx_sid = block.get("fx")
    if fx_sid is None:
        usd = local
    else:
        fx = mathx.ffill(ds.get(fx_sid))
        if block.get("fx_inverted"):
            # series is local-per-USD; invert to USD-per-local.
            with np.errstate(divide="ignore", invalid="ignore"):
                fx = np.where(fx > 0, 1.0 / fx, np.nan)
        usd = local * fx

    # Apply central-bank publication lag.
    return mathx.lag(usd, config.PUB_LAG_WEEKS["central_bank"])


def _shadow_tilt(ds) -> np.ndarray:
    """Blend repo stress, credit, and broad dollar into a liquidity tilt z.
    Positive = ample private liquidity. Causal z-scores throughout."""
    z = config.Z_WINDOW_WEEKS
    mp = config.MIN_Z_WEEKS

    sofr = mathx.ffill(ds.get(config.SHADOW_PROXIES["repo_spread"]))
    iorb = mathx.ffill(ds.get(config.SHADOW_PROXIES["iorb"]))
    repo_spread = mathx.lag(sofr - iorb, config.PUB_LAG_WEEKS["credit"])
    repo_z = -mathx.rolling_z(repo_spread, z, mp)   # wide spread = tight liquidity

    credit = mathx.lag(mathx.ffill(ds.get(config.SHADOW_PROXIES["credit_easy"])),
                       config.PUB_LAG_WEEKS["credit"])
    credit_z = -mathx.rolling_z(credit, z, mp)      # tight OAS = ample liquidity

    dollar = mathx.lag(mathx.ffill(ds.get(config.SHADOW_PROXIES["dollar"])),
                       config.PUB_LAG_WEEKS["credit"])
    dollar_z = -mathx.rolling_z(dollar, z, mp)      # strong $ drains global liq

    stack = np.vstack([mathx.nan_to_zero(repo_z),
                       mathx.nan_to_zero(credit_z),
                       mathx.nan_to_zero(dollar_z)])
    return stack.mean(axis=0)


def _cycle_position(level_z: np.ndarray) -> np.ndarray:
    """Estimate phase within the liquidity cycle from the smoothed level and its
    slope. Maps (level, slope) -> phase in [0,1):
        0.00  trough,  0.25 rising,  0.50 peak,  0.75 falling.
    Uses a normalised arctan2 of (slope, level) — a cheap, causal Hilbert-style
    phase that needs no future data."""
    sm = mathx.sma(level_z, 8)
    slope = mathx.roc(sm, 8)
    # Normalise each to comparable scale.
    lvl = np.clip(sm, -3, 3) / 3.0
    slp = np.clip(slope * 5, -3, 3) / 3.0
    phase = np.arctan2(-slp, lvl)          # peak(+lvl,0)->0 ; trough->pi
    pos = (phase / (2 * np.pi)) % 1.0
    return pos


def compute_gli(ds) -> GLIResult:
    z = config.Z_WINDOW_WEEKS
    mp = config.MIN_Z_WEEKS

    per_ccy_level_usd: dict[str, np.ndarray] = {}
    per_ccy_impulse: dict[str, np.ndarray] = {}
    per_ccy_level_z: dict[str, np.ndarray] = {}

    for ck in config.CB_BLOCKS:
        usd = _block_usd_liquidity(ds, ck)
        per_ccy_level_usd[ck] = usd
        # Per-currency impulse: z of the 13w RoC of the smoothed USD level.
        sm = mathx.sma(usd, config.IMPULSE_SMOOTH_WEEKS)
        imp = mathx.roc(sm, config.IMPULSE_LOOKBACK_WEEKS)
        per_ccy_impulse[ck] = mathx.rolling_z(imp, z, mp)
        per_ccy_level_z[ck] = mathx.rolling_z(usd, z, mp)

    # Aggregate USD liquidity = weighted sum of blocks (normalise each block to
    # its own z first so disparate units combine sanely).
    wsum = 0.0
    agg_z = np.zeros(ds.n)
    for ck, w in config.GLI_WEIGHTS.items():
        if ck in per_ccy_level_z:
            agg_z += w * mathx.nan_to_zero(per_ccy_level_z[ck])
            wsum += w
    if wsum > 0:
        agg_z /= wsum

    # Blend the shadow/private liquidity tilt (Howell's >85%).
    shadow = _shadow_tilt(ds)
    blended = (1 - config.SHADOW_TILT_WEIGHT) * agg_z + config.SHADOW_TILT_WEIGHT * shadow

    # Re-z the blended level so the headline is a clean standardised series.
    gli_level = mathx.rolling_z(blended, z, mp)

    # Headline impulse.
    sm = mathx.sma(gli_level, config.IMPULSE_SMOOTH_WEEKS)
    impulse_raw = mathx.roc(sm, config.IMPULSE_LOOKBACK_WEEKS)
    gli_impulse = mathx.rolling_z(impulse_raw, z, mp)

    cycle_pos = _cycle_position(gli_level)

    # raw_usd: sum of blocks in USD (pre-z) for inspection.
    raw_usd = np.zeros(ds.n)
    for ck, w in config.GLI_WEIGHTS.items():
        if ck in per_ccy_level_usd:
            raw_usd += w * mathx.nan_to_zero(per_ccy_level_usd[ck])

    return GLIResult(
        dates=ds.dates,
        gli_level=gli_level,
        gli_impulse=gli_impulse,
        cycle_position=cycle_pos,
        per_ccy_level=per_ccy_level_z,
        per_ccy_impulse=per_ccy_impulse,
        raw_usd_liquidity=raw_usd,
    )
