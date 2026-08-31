"""MT5 magic-number registry — the ONE table of who owns which magic.

Every live/paper MT5 bot filters its positions, duplicate guards, EOD closes,
orphan adoption and dashboard serializers by its magic number. Two bots sharing
a magic on the same terminal cross-contaminate ALL of those paths (found live
2026-07: DynAnchorBot == MacroEquityBot == RegimeV4 on 20260006, and
bot/hedge_bot == RegimeV7 on 20260007 — e.g. RegimeV7's orphan adoption could
act on hedge-bot legs).

Rules:
  * Every bot's in-file MAGIC constant must match this table —
    `pylego/magics_test.py` parses the sources and fails on any mismatch or
    duplicate. Add the row here FIRST, then the bot.
  * Magics are never reused, even after a bot is retired.
  * MT5 cannot retag an open position's magic: when a bot's magic changes, its
    pre-change positions keep the old value until closed. Bots that changed
    magic carry a LEGACY read-set for exactly that transition (see the
    2026-07 notes below) — remove it once the pre-change book has turned over.

This module is import-free of MetaTrader5 on purpose — it is data + the test.
"""

# bot source file (repo-relative) -> magic
MAGICS = {
    "bot/position_manager.py":                20260001,  # level bot — bot/main.py imports MAGIC from here (modules/portfolio_beta re-declares the same value)
    "bot/regime_bot.py":                      20260002,  # regime V1
    "Gold/main.py":                           20260004,  # gold bot
    "RegimeV2/regime_bot_v2.py":              20260005,
    "RegimeV4/regime_bot_v4.py":              20260006,  # kept 20260006 (live regime bot with adoption logic)
    "RegimeV7/regime_bot_v7.py":              20260007,  # kept 20260007 (live; moving it would orphan its book)
    "bot/position_hedge_bot.py":              20260008,
    "DynAnchorBot/dyn_anchor_mt5_bot.py":     20260009,  # was 20260006 — collided with RegimeV4/MacroEquity. EOD-flat: deploy after an EOD close.
    "MacroEquityBot/macro_equity_bot.py":     20260010,  # was 20260006 — long-lived book, carries legacy read-set until turned over
    "bot/hedge_bot.py":                       20260011,  # was 20260007 (== RegimeV7!) — carries legacy read-set; close pre-change legs ASAP
    "volatility_bot/volatility_bot.py":       20260099,
    "range_line_bot/range_line_bot.py":       20260131,
    "YieldSpreadBot/yield_spread_bot.py":           20260012,  # yield-spread z mean-reversion (validated macro sleeve)
    "oi_bot/oi_bot.py":                       20260714,  # OI gamma zones (forward-testing/paper); was unregistered — value kept, positions already carry it
    "fib_atlas_bot/fib_atlas_bot.py":         20260831,  # Asia+Monday range-extension vote bot
}

# Magics that were re-assigned in the 2026-07 de-collision. Positions opened
# under these BEFORE the change still carry the old value; the new owner reads
# them via its LEGACY set. Never assign these to a NEW bot.
RETIRED = {20260003}  # skipped historically; kept reserved


def all_magics():
    return sorted(MAGICS.values())
