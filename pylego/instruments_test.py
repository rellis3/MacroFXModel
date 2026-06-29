"""Offline tests for the instruments brick (no network).

Run directly:   python pylego/instruments_test.py
Or via pytest:  pytest pylego/instruments_test.py

Includes a GOLDEN test: the shared brick must reproduce each bot's old inline
`_PIP_SIZES` literal exactly, so adopting it is provably behavior-preserving.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego import instruments as I  # noqa: E402


# ── Golden snapshots: the inline _PIP_SIZES each bot had BEFORE adopting the
#    shared brick. Keyed by display form, exactly as the bots key them. ────────
GOLDEN_PIP_SIZES = {
    # bot/main.py (the first adopter — slice 1)
    "bot/main.py": {
        "EUR/USD": 0.0001, "GBP/USD": 0.0001, "USD/JPY": 0.01,
        "AUD/USD": 0.0001, "XAU/USD": 1.0, "EUR/GBP": 0.0001,
        "USD/CAD": 0.0001, "USD/CHF": 0.0001, "GBP/JPY": 0.01,
        "NAS100_USD": 1.0, "SPX500_USD": 1.0, "DE30_USD": 1.0,
        "UK100_GBP": 1.0, "US30_USD": 1.0, "US2000_USD": 1.0,
    },
    # bot/regime_bot.py + RegimeV2 (superset; documents the next adopters)
    "bot/regime_bot.py": {
        "EUR/USD": 0.0001, "GBP/USD": 0.0001, "USD/JPY": 0.01,
        "AUD/USD": 0.0001, "NZD/USD": 0.0001, "USD/CAD": 0.0001,
        "USD/CHF": 0.0001, "GBP/JPY": 0.01, "EUR/GBP": 0.0001,
        "EUR/JPY": 0.01, "EUR/CHF": 0.0001, "GBP/CHF": 0.0001,
        "AUD/JPY": 0.01, "CAD/JPY": 0.01,
        "XAU/USD": 1.0, "NAS100_USD": 1.0,
        "SPX500_USD": 1.0, "DE30_USD": 1.0, "UK100_GBP": 1.0,
        "US30_USD": 1.0, "US2000_USD": 1.0,
    },
}


def test_golden_pip_sizes():
    for bot, table in GOLDEN_PIP_SIZES.items():
        for sym, expected in table.items():
            got = I.pip_size(sym)
            assert got == expected, f"{bot}: pip_size({sym!r})={got}, expected {expected}"


def test_alias_resolution():
    # Every alias form of EUR/USD resolves to the same canonical key.
    for alias in ("EUR/USD", "EUR_USD", "EURUSD", "eurusd", "EURUSD=X"):
        assert I.resolve_key(alias) == "eurusd", alias
    assert I.resolve_key("XAUUSD") == "gold"
    assert I.resolve_key("USTECH100M") == "nq"   # MT5 broker symbol resolves


def test_jpy_vs_fx_pip():
    assert I.pip_size("USD/JPY") == 0.01
    assert I.pip_size("EUR/USD") == 0.0001
    assert I.pip_size("XAU/USD") == 1.0


def test_record_shape():
    rec = I.instrument("eurusd")
    assert rec["key"] == "eurusd"
    for field in ("display", "oanda", "yahoo", "mt5", "assetClass", "pip", "digits"):
        assert field in rec, field
    assert I.asset_class("USD/JPY") == "fx"
    assert I.asset_class("XAU/USD") == "commodity"


def test_unknown_fails_loud():
    # Mirrors the JS registry: unknown symbol raises, never silently defaults.
    assert I.resolve_key("ZZZ/ZZZ") is None
    try:
        I.pip_size("ZZZ/ZZZ")
    except KeyError:
        pass
    else:
        raise AssertionError("pip_size on unknown symbol should raise")


def test_pip_sizes_for_helper():
    got = I.pip_sizes_for(["EUR/USD", "USD/JPY", "XAU/USD"])
    assert got == {"EUR/USD": 0.0001, "USD/JPY": 0.01, "XAU/USD": 1.0}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
