"""Shared per-pair config for multi-pair pooling (roadmap item 3), used by
every script that needs to know a pair's contract multiplier, whether CME
quotes its strikes inverted, its pip size, or its D1/M1 price filenames.

Every value here is taken from the REAL production registries, not guessed:
  - contract_mult: js/oi.js's oiContractSize() -- treats every FX pair as
    125,000 (only indices/gold differ; NAS100_USD -> 20 via isNQ()).
  - inverted: js/oi.js's futuresIsInverted() -- CME quotes USD/JPY, USD/CAD,
    USD/CHF options in foreign-per-USD terms, the reciprocal of the OANDA
    convention every D1/M1 file and this book's pip-distance logic assumes.
  - pip_size: oi-dashboard.html's own pip() function -- JPY pairs 0.01,
    XAU 0.1, underscore-named symbols (indices) 1, else 0.0001.
Matching these exactly, not inventing textbook-correct-but-production-
inconsistent values, keeps this book testing the same assumptions the live
system runs on -- the point of Part 0.
"""

PAIR_CONFIG = {
    "EUR_USD":    {"label": "EUR/USD",    "contract_mult": 125_000, "inverted": False, "pip_size": 0.0001, "price_file": "eurusd"},
    "GBP_USD":    {"label": "GBP/USD",    "contract_mult": 125_000, "inverted": False, "pip_size": 0.0001, "price_file": "gbpusd"},
    "AUD_USD":    {"label": "AUD/USD",    "contract_mult": 125_000, "inverted": False, "pip_size": 0.0001, "price_file": "audusd"},
    "USD_CAD":    {"label": "USD/CAD",    "contract_mult": 125_000, "inverted": True,  "pip_size": 0.0001, "price_file": "usdcad"},
    "USD_CHF":    {"label": "USD/CHF",    "contract_mult": 125_000, "inverted": True,  "pip_size": 0.0001, "price_file": "usdchf"},
    "USD_JPY":    {"label": "USD/JPY",    "contract_mult": 125_000, "inverted": True,  "pip_size": 0.01,   "price_file": "usdjpy"},
    "NAS100_USD": {"label": "NAS100_USD", "contract_mult": 20,      "inverted": False, "pip_size": 1.0,    "price_file": "nas100"},
}


def suffix(pair):
    """EUR_USD keeps the original, already-committed filenames (no suffix);
    every other pair gets its own suffix so nothing clobbers EUR_USD's
    output or another pair's."""
    return "" if pair == "EUR_USD" else f"_{pair.lower()}"


def cfg(pair):
    if pair not in PAIR_CONFIG:
        raise SystemExit(f"Unknown pair '{pair}' -- add it to PAIR_CONFIG in pair_config.py first "
                          f"(contract_mult, inverted, pip_size, price_file).")
    return PAIR_CONFIG[pair]
