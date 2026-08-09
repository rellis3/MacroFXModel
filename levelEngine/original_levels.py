"""
original_levels — reproduces the platform's own "Original" export levels (the
📐 Chart: Original overlay in vol-forecast-v2.html, and the plain "⬇ Export" text
block), as a second calc input alongside cog_levels. Distinct from COG in BOTH
pieces:
  * sigma source   -> per-asset-class: fx/gold -> Yang-Zhang(30) (same as COG's fx
                       leg); index -> GARCH(1,1), NOT COG's close-to-close HV.
  * band constants -> Feller/half-normal constants x a PER-ASSET-CLASS correction
                       factor (COG uses one uniform constant set, no correction).

Source of truth, js/volBacktestEngine.js:
  BM_P50=1.572, BM_P75=2.049, HN_P50=0.6745, HN_P75=1.1503                  (:22-25)
  ASSET_PARAMS: fx {hl_50=0.820, hl_75=0.817, oc=1.038, oc_75=1.015}        (:44-46)
                index {hl_50=1.010, hl_75=0.967, oc=1.092, oc_75=1.115, garch_omega=4.76e-6}
                commodity {hl_50=0.898, hl_75=0.914, oc=1.144, oc_75=1.092}
  GARCH(1,1): G_ALPHA=0.06, G_BETA=0.91                                     (:27-28)
              v0 = omega/(1-a-b); out[0]=out[1]=sqrt(v0);
              for i>=2: v = omega + a*r[i-1..i-2]^2 + b*v; out[i]=sqrt(v)    (garchSigmas, :246-258)
  Level(%) = BM/HN_const * corr * sigma_daily_fraction, same shape as cog_levels.
"""
import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'volatilityExhaustion'))
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma, hv_sigma  # noqa: E402

BM_P50, BM_P75 = 1.572, 2.049
HN_P50, HN_P75 = 0.6745, 1.1503

ASSET_PARAMS = {
    'fx':        dict(hl50=0.820, hl75=0.817, oc50=1.038, oc75=1.015),
    'index':     dict(hl50=1.010, hl75=0.967, oc50=1.092, oc75=1.115, garch_omega=4.76e-6),
    'commodity': dict(hl50=0.898, hl75=0.914, oc50=1.144, oc75=1.092),
}
G_ALPHA, G_BETA = 0.06, 0.91
HV_WINDOW = 20   # commodity leg, matches the platform's HV20 (distinct from COG's NQ CC-HV30)
YZ_WINDOW = 30


def garch_sigma(daily, omega):
    """Causal GARCH(1,1) daily sigma fraction. out[i] is the forecast used for day i,
    built from returns strictly before day i -> identical recursion to garchSigmas()
    in js/volBacktestEngine.js, including its unconditional-variance seed."""
    close = daily['close']
    n = close.size
    out = np.empty(n)
    v = omega / (1 - G_ALPHA - G_BETA)
    out[0] = np.sqrt(v)
    if n > 1:
        out[1] = np.sqrt(v)
    for i in range(2, n):
        r = np.log(close[i - 1] / close[i - 2])
        v = omega + G_ALPHA * r * r + G_BETA * v
        out[i] = np.sqrt(v)
    return out


def daily_sigma_fraction(daily, asset_class):
    """Causal daily sigma fraction for day i. index -> GARCH(1,1); commodity -> HV20;
    fx -> Yang-Zhang(30) -- mirrors volSigmaSeries() in js/forecastCore.js."""
    if asset_class == 'index':
        return garch_sigma(daily, ASSET_PARAMS['index']['garch_omega'])
    if asset_class == 'commodity':
        return hv_sigma(daily, window=HV_WINDOW)
    return causal_sigma(daily, window=YZ_WINDOW)


def pct_from_sigma(sigma, asset_class):
    """Same BM/HN x ASSET_PARAMS x sigma multiplication build_level_frame does
    per-day, exposed standalone so a live caller (one sigma value, not a whole
    series -- e.g. levelEngine/live_watch.py) gets identical %'s without
    re-deriving the formula."""
    p = ASSET_PARAMS.get(asset_class, ASSET_PARAMS['fx'])
    return dict(
        hl50=BM_P50 * p['hl50'] * sigma, hl75=BM_P75 * p['hl75'] * sigma,
        oc50=HN_P50 * p['oc50'] * sigma, oc75=HN_P75 * p['oc75'] * sigma,
    )


def build_level_frame(path, asset_class='fx'):
    """Same output shape as cog_levels.build_level_frame (level_frame.day_levels
    consumes both identically) — only the sigma source and constants differ."""
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    sigma = daily_sigma_fraction(daily, asset_class)
    pct = pct_from_sigma(sigma, asset_class)
    return dict(m1=m1, daily=daily, sigma=sigma, pct=pct)
