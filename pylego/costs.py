"""costs — the paper execution-cost model + entry-slip audit (Category-B brick).

ONE table of default per-asset-class spreads for paper fills, shared by the
PaperBroker and both bot loops — never re-inline a spread table in a bot (the
same rule as pip sizes: two copies WILL drift). The classes and magnitudes are
consistent with the per-class spread CAPS in ``max_spread`` below: FX majors
~0.8 pips, JPY crosses ~1.0 pip, gold ~$0.30, indices ~2 points.

Spreads are declared in the instrument's OWN pip/point units and converted to
PRICE units via the canonical pip table (pylego.instruments), so a "pip" here
can never silently mean the wrong decimal.

Also owns the per-asset-class entry spread CAPS (``max_spread`` — formerly
volatility_bot's private ``_max_spread``; now shared with range_line_bot) and
the spread-adjusted expected fill used for sizing (``expected_fill``).

Also owns the entry-slip audit math (``entry_slip_pct`` + ``realized_fill``):
the realized fill − modeled line level, as a signed % of the session open —
the falsifier for the per-line books' flat modeled costs (0.012% round-trip
+ 0.006% follow/stop slip, js/perLineStrategy.js). Both bots log it per fill.
"""
from __future__ import annotations

from pylego.instruments import asset_class, pip_size, resolve_key

# Default paper spread per asset class, in the instrument's OWN pip/point units
# (fx: pips; commodity(gold): $/oz points; index: index points). Kept in line
# with volatility_bot's per-class spread caps — a default must never exceed the
# cap that would block the same trade live.
DEFAULT_SPREAD_PIPS = {
    "fx":     0.8,   # majors ~0.8 pips
    "fx_jpy": 1.0,   # JPY crosses quote a touch wider
    "commodity": 0.3,  # gold ~$0.30 (pip = $1)
    "index":  2.0,   # index CFDs ~2 points (pip = 1 point)
}


def spread_class(pair: str) -> str:
    """The DEFAULT_SPREAD_PIPS class for a pair: the registry asset class, with
    FX split into majors vs JPY crosses (canonical keys end in 'jpy'). Raises on
    an unknown symbol (fail loud, like the registry accessors)."""
    ac = asset_class(pair)
    if ac == "fx" and (resolve_key(pair) or "").endswith("jpy"):
        return "fx_jpy"
    return ac


def default_spread(pair: str) -> float:
    """Default paper spread in PRICE units (pips × pip size). Unknown symbols
    get 0.0 — the measurement degrades to a free fill rather than crashing the
    paper loop over an unregistered instrument."""
    try:
        return DEFAULT_SPREAD_PIPS.get(spread_class(pair), DEFAULT_SPREAD_PIPS["fx"]) * pip_size(pair)
    except Exception:
        return 0.0


# ── Per-class spread CAPS (the entry guard, not the paper fill) ───────────────
# Lifted from volatility_bot._max_spread so BOTH bots (vol + range-line) import
# ONE copy. A single scalar cap is meaningless across instruments — 1 "pip" is
# fine for EUR/USD but an index or gold quotes a 1-point ($1) spread that
# naturally exceeds it, so a flat 1.0 cap blocks every index/commodity trade
# (the live "SPREAD BLOCK uk100: 1.1p > max 1p"). Caps are per ASSET CLASS;
# config `max_spread_pips` may be a dict (per-class override) or a scalar
# (treated as the FX cap, scaled up for wider-spread classes).
MAX_SPREAD_MULT = {"fx": 1.0, "index": 6.0, "commodity": 6.0}
DEFAULT_FX_SPREAD_CAP = 2.0


def max_spread(pair: str, cfg: dict) -> float:
    """Entry spread cap for `pair` in its OWN pip/point units, honouring the
    bot config's `max_spread_pips` (dict per-class override, or scalar FX cap
    scaled per class; absent → DEFAULT_FX_SPREAD_CAP scaled per class)."""
    try:
        ac = asset_class(pair)
    except Exception:
        ac = "fx"
    mx = (cfg or {}).get("max_spread_pips")
    if isinstance(mx, dict):                                  # explicit per-class override
        return float(mx.get(ac, mx.get("fx", DEFAULT_FX_SPREAD_CAP) * MAX_SPREAD_MULT.get(ac, 3.0)))
    fx_cap = float(mx) if isinstance(mx, (int, float)) else DEFAULT_FX_SPREAD_CAP
    return fx_cap * MAX_SPREAD_MULT.get(ac, 3.0)              # scale the FX cap for index/commodity


def spread_for(pair: str, broker=None) -> float:
    """Current spread in PRICE units: the broker's live/paper per-pair spread
    when it exposes one (PaperBroker.spread), else the class default."""
    if broker is not None and hasattr(broker, "spread"):
        try:
            s = broker.spread(pair)
            if s is not None and s > 0:
                return float(s)
        except Exception:
            pass
    return default_spread(pair)


def expected_fill(entry: float, is_buy: bool, pair: str, broker=None) -> float:
    """Spread-adjusted EXPECTED fill for a market order at modeled level
    `entry`: mid ± half the pair's current spread (BUY above, SELL below).

    Sizing rationale: a market order cannot be sized AFTER it fills, so lots
    are computed from this expected fill instead of the raw level — the stop
    distance then includes the half-spread the fill will really pay, and risk
    is right on average (the realized fill is still audited separately via
    realized_fill/entry_slip_pct)."""
    half = spread_for(pair, broker) / 2.0
    return float(entry) + half if is_buy else float(entry) - half


def realized_fill(broker, ticket):
    """The actual fill price of a just-opened ticket, read back from the broker's
    own open-positions serializer (both PaperBroker and Mt5Broker emit
    ``open_price`` — PYTHON_LEGO.md §7), so the slip audit measures what was
    REALLY paid, spread/slippage included. None if the ticket isn't visible yet
    (e.g. MT5 positions_get lag) — callers skip the audit field, never fake it."""
    try:
        for p in broker.serialize_open_positions():
            if p.get("ticket") == ticket:
                return p.get("open_price")
    except Exception:
        pass
    return None


def entry_slip_pct(is_buy: bool, fill, modeled_level, session_open):
    """Realized entry slip vs the modeled line level, as a signed % of the
    session open (the same denominator as the books' per-touch PnL).

    SIGN CONVENTION: favourable is NEGATIVE. For a BUY, filling ABOVE the
    modeled level costs money → positive; for a SELL, filling BELOW the modeled
    level costs money → positive. This is the falsifier for the books' flat
    0.012% round-trip + 0.006% follow-slip cost assumption (perLineStrategy).

    Returns None when any input is missing/degenerate — absent beats fabricated.
    """
    if fill is None or modeled_level is None or not session_open:
        return None
    raw = (float(fill) - float(modeled_level)) / float(session_open) * 100.0
    return round(raw if is_buy else -raw, 6)
