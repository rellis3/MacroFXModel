"""
cog_levels — reproduces the COG-export price levels (pine/cog_volatility_v3_sessions.pine
"Proj H/L" + "Close Med/75p" lines) from raw M1, so we can walk history and ask what
actually happens when price touches them.

Source of truth for the constants/σ choice (verified bit-exact against a live NQ
export in this session: 21.88% annual vol -> 2.15/2.66% HL, 1.02/1.71% OC):
  * Band constants  -> js/cogReverseEngineer.js COG_CONST (uniform, no per-asset
                        correction): BM_P50=1.56, BM_P75=1.93, HN_P50=0.74, HN_P75=1.24
  * NQ sigma         -> js/ccHvSigma.js: 30-day trailing close-to-close HV on
                        London-anchored daily closes (COG's own method for indices).
                        Reproduced here by volatilityExhaustion.vol_exhaustion_lib.hv_sigma.
  * FX sigma         -> platform Yang-Zhang(30), same as the rest of the forecaster
                        (COG export only swaps in CC-HV for NQ; fx/gold keep YZ).
Level(%) = C * sigma_daily_fraction, sigma already causal (computed from data
strictly before the level's day, matching the 22:00 UTC nightly forecast refresh).

Two families of level, per the pine script:
  * Proj H/L (med, 75p): DYNAMIC — anchored to the day's running low/high so far,
    recomputed every bar as new extremes print. pH = running_low*(1+C*sigma);
    pL = running_high*(1-C*sigma).
  * Close Med/75p: FIXED for the day — anchored to the day's open. Also included:
    Open itself, as a 9th, commonly-traded pivot level.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'volatilityExhaustion'))
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma, hv_sigma  # noqa: E402

COG_CONST = dict(hl50=1.56, hl75=1.93, oc50=0.74, oc75=1.24)
NQ_CCHV_WINDOW = 30
YZ_WINDOW = 30


def daily_sigma_fraction(daily, asset_class):
    """Causal daily sigma fraction (not annualized) for day i, using only data < i.
    asset_class: 'index' -> COG's CC-HV(30); anything else (fx/commodity) -> YZ(30)."""
    if asset_class == 'index':
        return hv_sigma(daily, window=NQ_CCHV_WINDOW)
    return causal_sigma(daily, window=YZ_WINDOW)


def pct_from_sigma(sigma):
    """Same COG_CONST x sigma multiplication build_level_frame does per-day,
    exposed standalone so a live caller (one sigma value, not a whole series --
    e.g. levelEngine/live_watch.py) gets identical %'s without re-deriving the
    formula."""
    return {k: sigma * c for k, c in COG_CONST.items()}


def build_level_frame(path, asset_class='fx'):
    """Load M1, build London daily bars + causal sigma, return everything a touch
    scan needs: per-day open + the 4 COG %'s, and per-minute bar arrays with a
    day_idx to slice by day. Shape matches level_frame.day_levels (calc-agnostic)."""
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    sigma = daily_sigma_fraction(daily, asset_class)   # sigma[i] used for day i (NaN until warmed up)
    pct = pct_from_sigma(sigma)                        # fraction, e.g. 0.0215 for 2.15%
    return dict(m1=m1, daily=daily, sigma=sigma, pct=pct)
