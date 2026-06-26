"""
GlobalLiquidity — configuration.

Central definitions for the liquidity-driven macro FX system:
  - which central-bank balance-sheet series build Global Liquidity
  - how each currency block maps to a tradable currency
  - the macro inputs for the regime classifier and risk gate
  - default weights / thresholds (all overridable)

Nothing here fetches data. Series IDs live here so there is one place to
audit what the model actually reads.
"""

from __future__ import annotations

# ── Causality / lag handling ──────────────────────────────────────────────────
# Publication lags in *calendar weeks*. Applied so the nowcast at week T only
# ever uses data that was actually published by week T (no lookahead).
PUB_LAG_WEEKS = {
    "central_bank": 2,   # CB balance sheets print with ~1-2wk lag
    "growth": 3,         # PMIs / activity surprise
    "inflation": 2,      # breakevens are daily, but treat conservatively
    "credit": 1,         # HY OAS, daily but lag 1wk for safety
    "vol": 1,            # VIX/MOVE daily
}

# Rolling window (weeks) for causal z-scores. ~3y of weekly data.
Z_WINDOW_WEEKS = 156
MIN_Z_WEEKS = 26

# Liquidity *impulse* = N-week rate-of-change of the smoothed level.
IMPULSE_LOOKBACK_WEEKS = 13
IMPULSE_SMOOTH_WEEKS = 4

# Approximate liquidity cycle length (Howell/Pal ~65 months ≈ 282 weeks).
CYCLE_LENGTH_WEEKS = 282


# ── Currency blocks → central-bank liquidity ──────────────────────────────────
# Each block: the balance-sheet series (FRED id, in *local* currency, billions),
# and the FX series used to translate it into USD. FX is "USD per 1 local unit"
# so liquidity_usd = balance_sheet_local * fx_to_usd.
#
# Where FRED lacks clean coverage (PBoC especially), a proxy series and a
# `proxy=True` flag flag it as lower-confidence.
CB_BLOCKS = {
    "USD": {
        # Fed net liquidity = WALCL - TGA - RRP (already in USD).
        "components": {
            "walcl": "WALCL",         # Fed total assets
            "tga": "WTREGEN",         # Treasury General Account (drains)
            "rrp": "RRPONTSYD",       # Reverse repo (drains)
        },
        "formula": "walcl - tga - rrp",
        "fx": None,                   # already USD
        "proxy": False,
    },
    "EUR": {
        "components": {"assets": "ECBASSETSW"},   # ECB total assets (EUR mn)
        "formula": "assets",
        "fx": "DEXUSEU",                          # USD per EUR
        "proxy": False,
    },
    "JPY": {
        "components": {"assets": "JPNASSETS"},     # BoJ total assets (JPY 100mn)
        "formula": "assets",
        "fx": "DEXJPUS",                           # JPY per USD -> inverted in code
        "fx_inverted": True,
        "proxy": False,
    },
    "GBP": {
        "components": {"assets": "UKASSETS"},       # proxy; BoE coverage is patchy
        "formula": "assets",
        "fx": "DEXUSUK",                            # USD per GBP
        "proxy": True,
    },
    "CNY": {
        # PBoC: no clean weekly FRED series. Proxy with FX reserves + USDCNY.
        "components": {"reserves": "TRESEGCNM052N"},
        "formula": "reserves",
        "fx": "DEXCHUS",                            # CNY per USD -> inverted
        "fx_inverted": True,
        "proxy": True,
    },
}

# Weights for the *aggregate* Global Liquidity Index (sum need not be 1; the
# code normalises). USD and CNY dominate the global impulse historically.
GLI_WEIGHTS = {
    "USD": 0.35,
    "CNY": 0.25,
    "EUR": 0.20,
    "JPY": 0.15,
    "GBP": 0.05,
}

# Shadow / private liquidity proxies. These capture refinancing capacity that
# base money misses (Howell/CrossBorder's actual edge). Each is z-scored and
# blended into the GLI as a tilt.
SHADOW_PROXIES = {
    "repo_spread": "SOFR",        # vs IORB in code; stress widens it
    "iorb": "IORB",
    "credit_easy": "BAMLH0A0HYM2",  # HY OAS (inverted: tight = ample liquidity)
    "dollar": "DTWEXBGS",           # broad USD (inverted: strong $ drains global liq)
}
SHADOW_TILT_WEIGHT = 0.25   # how much shadow proxies move the headline GLI


# ── Regime classifier inputs ──────────────────────────────────────────────────
REGIME_INPUTS = {
    "growth": "INDPRO",            # activity proxy (z of YoY)
    "growth_alt": "NAPM",          # ISM PMI when available
    "inflation": "T10YIE",         # 10y breakeven inflation
    "real_yield": "DFII10",        # 10y TIPS real yield
}

# Risk gate (Macro Alf): when stress trips, cut gross regardless of liquidity.
RISK_GATE = {
    "credit": "BAMLH0A0HYM2",      # HY OAS
    "vol": "VIXCLS",               # VIX
    # gate trips when credit z > credit_z OR vol z > vol_z
    "credit_z": 1.0,
    "vol_z": 1.25,
    "gross_cut": 0.40,             # multiply gross by this when tripped
}


# ── FX universe & currency exposure map ───────────────────────────────────────
# The 26-pair universe. Each pair decomposes into (base, quote). The
# cross-sectional ranker scores a pair by base-ccy liquidity impulse minus
# quote-ccy liquidity impulse (relative money conditions).
FX_PAIRS = [
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF",
    "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
    "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
    "AUDJPY", "AUDNZD", "AUDCAD", "AUDCHF",
    "NZDJPY", "CADJPY", "CHFJPY",
    "XAUUSD",
]

# Per-currency liquidity proxy. Risk currencies (AUD/NZD/CAD) lean pro-cyclical:
# they benefit when *global* liquidity impulse is positive even if their own
# CB is small. Funders (JPY/CHF) are inverse. This maps each currency to how it
# responds to the global impulse, used when a dedicated CB block is absent.
CCY_BETA_TO_GLI = {
    "USD": -0.6,   # USD weakens when global liquidity expands (denominator)
    "EUR": 0.2,
    "GBP": 0.2,
    "JPY": -0.8,   # classic funder: strengthens on risk-off / liq drain
    "CHF": -0.8,   # funder / safe haven
    "AUD": 0.9,    # pro-cyclical
    "NZD": 0.9,
    "CAD": 0.6,
    "XAU": 0.7,    # gold benefits from liquidity + falling real yields
}

# Cross-sectional book construction.
RANKER = {
    "long_n": 3,         # go long top-N pairs by liquidity-impulse spread
    "short_n": 3,        # short bottom-N
    "entry_buffer": 0.25,  # hysteresis: must clear rank threshold by this z to swap
}


# ── Sizing ────────────────────────────────────────────────────────────────────
SIZER = {
    "target_vol_annual": 0.10,   # 10% annualised portfolio vol target
    "vol_lookback_weeks": 52,
    "max_gross": 3.0,            # cap leverage
    "conviction_floor": 0.30,    # never fully flat unless risk gate says so
}
