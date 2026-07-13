"""Range-Line Bot decision engine — pure, broker-agnostic, offline-testable.

Composes the golden-tested strategy bricks (build_ladder / ladder_side /
neighbours / trade_spec / chandelier_stop) into the §13/§15 live behaviour:

  * build the Asia (London-window) + Monday fib ladders from session bars — the
    IDENTICAL ladder the offline policy learned on (same labels → same cell keys),
  * on each tick, the first touch of a ladder level → look up the frozen fade/
    follow/skip policy → an order spec,
  * HELD POSITION: at most ONE position per (source, side) per session — the
    earliest non-skip touch wins, re-entry suppressed (matches the honest
    held-position model; the chandelier trail is managed by the bot loop).

No MT5, no network. The loop (range_line_bot.py) feeds prices/bars and routes
specs to a Broker, and trails the exit via ``strategy.chandelier_stop``.
"""
from datetime import datetime, timezone, timedelta

from pylego.strategy.rangeline import (
    build_ladder, ladder_side, neighbours, trade_spec, cell_key, body_range,
    confluence_bucket, confluence_rank, oi_distinct_sources, oi_bias,
)

# Resample minutes per source (matches the backtest: Asia=5m bodies, Monday=15m).
SRC_MINUTES = {"A": 5, "M": 15}


def session_anchor_epoch(now_epoch, boundary_hour):
    """Most-recent ``boundary_hour:00`` UTC as an epoch — the range-window open.

    FIXED UTC (not DST-aware London) so the live window matches the FROZEN window
    the policy was learned on (the plan ships ``boundaryHour``). At the autumn
    clock change, re-freeze with ``boundaryHour=0`` and the bot follows (no drift).
    """
    now = datetime.fromtimestamp(now_epoch, tz=timezone.utc)
    anchor = now.replace(hour=int(boundary_hour) % 24, minute=0, second=0, microsecond=0)
    if anchor > now:
        anchor -= timedelta(days=1)
    return int(anchor.timestamp())


class RangeSession:
    """Per-instrument range/ladder state + one-shot, held-position bookkeeping."""

    def __init__(self, instrument, ladder_fibs, *, chand_frac=0.5):
        self.instrument = instrument
        self.ladder_fibs = list(ladder_fibs)
        self.chand_frac = chand_frac
        self.ladders = {}          # src_tag -> {low, high, levels:[{label,side,level,inner,outer,rung}]}
        self.acted = set()         # (label, side) decided once this session
        self.entered = set()       # (src_tag, side) with a position taken (held-position suppression)
        self.conf_levels = []      # today's structural-confluence level prices [{price,source}]
        self.conf_tol_frac = 0.1   # "on the line" tolerance as a fraction of the ladder range
        self.session_open = None   # trading-session open (set by the loop from the Asia
                                   # window's first bar) — the entry-slip audit's %
                                   # denominator, matching the book's per-touch t.open
        self.oi_levels = []        # today's OI level prices [{price,source=type}] (walls/max_pain/gamma/hvl)
        self.oi_tol = 0.0          # OI proximity tolerance in PRICE units (tol_pips × pip)
        self.oi_regime = None      # 'PIN' (long gamma / fade) | 'BREAKOUT' (short gamma / follow) | None
        self.oi_break = 0.0        # break distance beyond a wall = squeeze (hold-vs-break), price units

    # ── confluence entry-gate inputs (optional; set from the shipped artifact) ──
    def set_confluence(self, levels, tol_frac=0.1):
        """Attach today's confluence level prices (from range_line_confluence) +
        the tolerance fraction. The gate is only ENFORCED when decide() is called
        with confluence_min > 0, so this is a no-op for a bot that hasn't opted in."""
        self.conf_levels = levels or []
        self.conf_tol_frac = tol_frac if tol_frac and tol_frac > 0 else 0.1

    # ── OI entry inputs (optional; from range_line_oi_live) ────────────────────
    def set_oi(self, levels, tol_pips=10, pip=0, regime=None, break_pips=20):
        """Attach today's OI level prices (call/put walls, max pain, gamma flip,
        HVL — source = the OI type) + a PIP-based proximity tolerance (matching the
        OI forward test, not the range-fraction one), the day's gamma `regime`
        ('PIN' = long gamma / mean-revert, 'BREAKOUT' = short gamma / trend), and the
        `break_pips` distance beyond a wall that counts as a decisive break (hold-vs-
        break). No-op unless decide() is called with an OI flag enabled (all opt-in)."""
        self.oi_levels = levels or []
        self.oi_tol = (tol_pips or 0) * (pip or 0)
        self.oi_regime = regime if regime in ("PIN", "BREAKOUT") else None
        self.oi_break = (break_pips or 0) * (pip or 0)

    # ── ladder construction (call once the range is known) ────────────────────
    def set_range(self, src_tag, bars):
        """Build the ``src_tag`` ladder from its session bars (Asia window / Monday
        session). Returns True if a ladder was built."""
        br = body_range(bars, SRC_MINUTES.get(src_tag, 5))
        if not br:
            return False
        raw = build_ladder(br["low"], br["range"], src_tag, self.ladder_fibs)
        prices = [r["level"] for r in raw]
        levels = []
        for r in raw:
            side = ladder_side(r["level"], br["low"], br["high"])
            inner, outer = neighbours(r["level"], side, prices)
            if inner is None:
                continue           # extreme level, no barrier → not tradeable
            levels.append({"label": r["label"], "side": side, "level": r["level"],
                           "inner": inner, "outer": outer, "rung": abs(outer - r["level"])})
        self.ladders[src_tag] = {"low": br["low"], "high": br["high"], "levels": levels}
        return True

    def has_range(self, src_tag):
        return src_tag in self.ladders

    # ── decision (call each tick with the current price + frozen policy) ───────
    def decide(self, px, policy, *, dry_run=False, confluence_min=0,
               oi_confluence=False, oi_override=False, oi_gamma_regime=False, oi_hold_break=False):
        """Ladder levels newly touched this tick that map to a tradeable cell and
        whose (source, side) slot is still open. Marks them acted/entered so a
        level fires once and only ONE position opens per (source, side).

        ``dry_run=True`` marks touched levels acted but returns nothing — used after
        catch-up to prime levels price already crossed (never retro-enter).
        ``confluence_min`` (0=off) gates entries by structural-confluence strength:
        a level whose distinct-source count ranks below the threshold (1=confluent,
        2=strong) is skipped — the OOS-validated "trade only stronger levels" filter.
        Returns specs: ``{instrument, src, label, side, decision, side_order, entry,
        protect_stop, rung, dir_up}``. The caller MUST call ``mark_entered(src, side)``
        after a SUCCESSFUL fill — the slot is not burned here, so a broker-rejected
        order (e.g. market closed) doesn't kill the day's trade on that side.
        """
        out = []
        produced = set()                                 # one spec per (src, side) THIS tick
        for src_tag, lad in self.ladders.items():
            for lv in lad["levels"]:
                key = (lv["label"], lv["side"])
                if key in self.acted:
                    continue
                touched = (px >= lv["level"]) if lv["side"] == "up" else (px <= lv["level"])
                if not touched:
                    continue
                self.acted.add(key)                      # one decision per level per session
                if dry_run:
                    continue
                slot = (src_tag, lv["side"])
                if slot in self.entered or slot in produced:
                    continue                             # held position already taken/producing for this (src, side)
                decision = (policy.get(cell_key(lv["label"], lv["side"])) or {}).get("decision")
                if decision not in ("fade", "follow"):
                    continue                             # skip / unseen → no trade
                # Confluence gate (opt-in): only trade levels backed by >= confluence_min
                # DISTINCT sources. tol scales with THIS ladder's range so "on the line"
                # matches the backtest's per-range tolerance exactly. When oi_confluence
                # is on, OI types (walls/max-pain/…) count as extra distinct sources
                # (their own pip-based tol) — so an OI-backed level ranks stronger.
                if confluence_min > 0:
                    tol = self.conf_tol_frac * (lad["high"] - lad["low"])
                    srcs = {c.get("source") or c.get("kind") for c in self.conf_levels
                            if abs(c["price"] - lv["level"]) <= tol}
                    if oi_confluence:
                        srcs |= oi_distinct_sources(lv["level"], self.oi_levels, self.oi_tol)
                    srcs.discard(None)
                    rank = 2 if len(srcs) >= 2 else (1 if len(srcs) == 1 else 0)
                    if rank < confluence_min:
                        continue                         # too weak a level → skip
                # OI gamma REGIME selector (opt-in, Lesson 5): the day's dealer-gamma
                # sign sets the fade/follow style — PIN (long gamma → dampening) favours
                # FADE; BREAKOUT (short gamma → amplifying) favours FOLLOW. Overrides the
                # learned style; a nearby wall (below) can still refine the exact side.
                if oi_gamma_regime and self.oi_regime:
                    decision = "fade" if self.oi_regime == "PIN" else "follow"
                # OI direction override (opt-in): at an OI-backed level, flip the
                # traded side to the OI read (call wall → sell, put wall → buy, max-
                # pain gravity). With oi_hold_break, a wall price has BROKEN through
                # follows the squeeze instead of fading it (Lesson 5). Never resurrects
                # a skip — only redirects a level we'd already trade.
                if oi_override:
                    od = oi_bias(lv["level"], self.oi_levels, self.oi_tol,
                                 px=(px if oi_hold_break else None),
                                 break_dist=(self.oi_break if oi_hold_break else 0))
                    if od:
                        decision = "follow" if (od == "buy") == (lv["side"] == "up") else "fade"
                spec = trade_spec(lv["level"], lv["side"], decision, lv["inner"], lv["outer"])
                if not spec:
                    continue
                produced.add(slot)                       # don't also produce a second same-side spec this tick
                out.append({
                    "instrument": self.instrument, "src": src_tag, "label": lv["label"],
                    "side": lv["side"], "decision": decision,
                    "side_order": spec["side"], "entry": spec["entry"],
                    "protect_stop": spec["protect_stop"], "rung": spec["rung"],
                    "dir_up": spec["side"] == "buy",
                })
        return out

    def mark_entered(self, src_tag, side):
        """Record that a position was successfully opened for this (source, side) —
        suppresses further entries on that slot for the session (held-position)."""
        self.entered.add((src_tag, side))
