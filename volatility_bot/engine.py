"""Volatility Bot decision engine — pure, broker-agnostic, offline-testable.

Turns the frozen plan + a pair's live session state + the latest price into trade
specs by composing the golden-tested strategy bricks (approach_velocity,
line_levels, neighbours, trade_spec). No MT5, no network. The loop
(volatility_bot.py) feeds it prices/closes and routes specs to a Broker.
"""
from collections import deque

from pylego.strategy.volatility import (
    approach_velocity, line_levels, trade_spec, cell_key, LINE_NAMES, VEL_WIN,
)

SIDES = ("up", "dn")


class SessionTracker:
    """Per-pair intraday state for ONE session:
      * ``open``                — the session open anchor (OC lines hang off it),
      * ``run_low`` / ``run_high`` — running extremes (drive the dynamic HL lines),
      * ``closes``              — a minutely close buffer (drives approach velocity),
      * ``acted``               — line ids already decided this session (one shot),
      * ``audit``               — WHY each acted line was traded/skipped (dashboard).
    """

    def __init__(self, open_px, vel_win=VEL_WIN):
        self.open = float(open_px)
        self.run_low = float(open_px)
        self.run_high = float(open_px)
        self.closes = deque(maxlen=vel_win + 1)
        self.closes.append(float(open_px))
        self.acted = set()
        # line_id → {status, bucket, decision?, reason?, expectancy?, n?, revRate?}
        # so the config card can explain each decision instead of a bare "acted".
        self.audit = {}

    def on_price(self, px):
        px = float(px)
        if px < self.run_low:
            self.run_low = px
        if px > self.run_high:
            self.run_high = px

    def on_minute(self, close_px):
        self.closes.append(float(close_px))

    def catch_up(self, bars):
        """Replay the session's OHLC bars (open → now) to reconstruct the running
        extremes (drive the dynamic HL lines) and the velocity buffer — so on
        startup or a new-session reset the bot is in-sync with the live session
        WITHOUT any seeding. bars: iterable of {open, high, low, close}.

        The session OPEN stays the PLAN's open — do NOT re-anchor it from the
        broker's first bar. The plan open is now the authoritative London-midnight
        (or market-open) anchor from OANDA, the SAME basis the book learned on
        (#638/#640). Re-anchoring on MT5's first bar reintroduced the drift this
        bot exists to avoid: MT5 server-time/feed differences pulled the open back
        to ~22:00-UTC (gold showed 3997.53 vs the plan's correct 4013.3). One
        source of truth = the plan. We only rebuild extremes + velocity here."""
        bars = list(bars or [])
        self.run_low = self.run_high = self.open        # extremes seed from the plan open
        self.closes.clear()
        self.closes.append(self.open)
        for b in bars:
            hi, lo, cl = b.get("high"), b.get("low"), b.get("close")
            if hi is not None:
                self.on_price(hi)
            if lo is not None:
                self.on_price(lo)
            if cl is not None:
                self.on_minute(cl)
        return self


def decide(plan_pair, policy, tracker, px, *, sigma=None, dry_run=False, blackout=None,
           min_expectancy=None):
    """Lines newly touched this tick that map to a tradeable (fade/follow) cell.

    Returns a list of specs: ``{side, entry, tp, sl, line, name, ln_side,
    decision, bucket, velocity}``. A line is decided ONCE per session (touched or
    not), so a level can't re-fire while price sits beyond it.

    ``dry_run=True`` marks touched lines as acted but places NO trades — used right
    after ``catch_up`` to "prime" lines price already crossed earlier in the
    session, so the bot only trades GENUINELY NEW crossings (never retro-enters).

    ``blackout`` (falsy | reason string): a scheduled-event blackout for this
    pair. A touch during a blackout is DEFERRED, not consumed — the line stays
    armed (not ``acted``) so if price is still beyond it after the window it
    re-triggers on the first clear tick; the entry/TP/SL still come from the
    line levels, so the modeled trade shape is preserved. Deferring beats
    burning: burning silently deletes the line for the whole session over a
    45-minute window. Priming (dry_run) ignores blackout by design.

    ``min_expectancy`` (None | float): the STRICT-GATE filter for the ride A/B
    variant. When set, a fade/follow cell whose learned after-cost expectancy is
    below the gate is skipped (audited ``below_ride_gate``). This reproduces
    ``buildPolicy(marginPct=gate)`` at runtime off the SAME plan — the exit study's
    gate sweep showed only the top cells (gate≈0.05) survive 2× cost. None = the
    book variant (trade every fade/follow cell the plan already kept).
    """
    frac = {"hl50": plan_pair["hl50"], "hl75": plan_pair["hl75"],
            "ocMed": plan_pair["ocMed"], "oc75": plan_pair["oc75"]}
    sig = sigma if sigma is not None else plan_pair.get("sigma")
    levels = line_levels(tracker.open, tracker.run_low, tracker.run_high, frac)
    closes = list(tracker.closes)
    val, bucket = approach_velocity(closes, len(closes) - 1, tracker.open, sig)
    out = []
    if bucket is None:
        return out                         # not enough minutely closes yet
    for name in LINE_NAMES:
        for side in SIDES:
            line_id = f"{name}_{side}"
            if line_id in tracker.acted:
                continue
            lvl = levels[line_id]
            touched = (px >= lvl) if side == "up" else (px <= lvl)
            if not touched:
                continue
            if blackout and not dry_run:
                # Event window: defer — audit it, do NOT burn the line's one shot.
                tracker.audit[line_id] = {"status": "deferred", "reason": f"event_blackout: {blackout}",
                                          "bucket": bucket}
                continue
            tracker.acted.add(line_id)     # one decision per line per session
            cell = policy.get(cell_key(name, side, bucket))
            if dry_run:
                # Line was already crossed before the bot started watching — primed,
                # never a live decision. Recorded so the card can say so.
                tracker.audit[line_id] = {"status": "primed", "bucket": bucket}
                continue
            # Common cell stats for the audit (present whether we trade or skip).
            info = {"bucket": bucket,
                    "expectancy": (cell or {}).get("expectancy"),
                    "n": (cell or {}).get("n"),
                    "revRate": (cell or {}).get("revRate")}
            decision = (cell or {}).get("decision")
            if decision in ("fade", "follow"):
                # Strict-gate (ride A/B): drop cells below the expectancy gate — the
                # thin marginal fades that only the full 0.01 book trades.
                if min_expectancy is not None and (info["expectancy"] is None
                                                   or info["expectancy"] < min_expectancy):
                    tracker.audit[line_id] = {**info, "status": "skip", "reason": "below_ride_gate"}
                    continue
                spec = trade_spec(name, side, levels, decision, tracker.open, frac)
                if spec:
                    # Line attribution for the audit/log — makes an entry explainable:
                    # OC lines are STATIC off the session open; HL (Proj-H/L) lines are
                    # DYNAMIC off the running extreme, so their level (and the entry) is
                    # BELOW the static bands early in a move and rises through the day.
                    # This is why a fill can look "off" vs the chart's final line — it's
                    # the dynamic line at the moment of touch, off `anchor`.
                    is_hl = name in ("HL50", "HL75")
                    anchor = (tracker.run_low if side == "up" else tracker.run_high) if is_hl else tracker.open
                    attrib = {"level": round(lvl, 6),
                              "kind": "HL(dynamic)" if is_hl else "OC(static)",
                              "anchor": round(anchor, 6)}
                    tracker.audit[line_id] = {**info, **attrib, "status": "traded", "decision": decision}
                    out.append({**spec, "line": line_id, "name": name, "ln_side": side,
                                "decision": decision, "bucket": bucket, "velocity": val, **attrib})
                    continue
                # policy said trade but the neighbour lines left no valid TP/SL.
                tracker.audit[line_id] = {**info, "status": "skip", "reason": "degenerate"}
                continue
            # skip cell (edge below cost / too few samples) or a line×bucket never
            # seen in-sample → the honest book has no tradeable edge here.
            tracker.audit[line_id] = {**info, "status": "skip",
                                      "reason": (cell or {}).get("reason") or "unseen"}
    return out


def ride_trail_stop(is_long, entry, sl0, extreme, cur_sl, trail_frac=0.5):
    """Chandelier trail for the RIDE exit (the range-line bot's winning stop).

    The ride has NO take-profit; the trailing stop is the only profit exit. It
    trails the favourable extreme by ``trail_frac·R`` (R = |entry − sl0|, the
    entry→disaster-stop distance — same basis the exit study priced), RATCHET-ONLY:
    it never loosens. Mirrors ``simulateExitVariants``'s 'ride' rule and
    ``rangeline.chandelier_stop``.

    is_long  — True for a BUY (favourable extreme = session high), else SELL.
    sl0      — the initial disaster stop (the outer band line).
    extreme  — the best favourable price reached since entry (peak/trough).
    cur_sl   — the stop currently on the broker (so we only move it inward).
    Returns the new stop; caller modifies the order only if it changed.
    """
    R = abs(entry - sl0)
    cand = (extreme - trail_frac * R) if is_long else (extreme + trail_frac * R)
    return max(cur_sl, cand) if is_long else min(cur_sl, cand)


# The forecast anchors the trading day at MIDNIGHT EUROPE/LONDON — i.e. 00:00
# London wall-clock, which is 23:00 UTC during BST (summer) and 00:00 UTC during
# GMT (winter). The bot fetches the session's bars from this anchor to rebuild the
# running extremes; the session OPEN itself comes from the PLAN (the authoritative
# London-midnight anchor from OANDA), NOT the broker's first bar.
#
# DST is computed without a tz database (Windows venvs often lack `tzdata`): UK
# clocks go forward at 01:00 UTC on the last Sunday of March and back at 01:00 UTC
# on the last Sunday of October.
def _last_sunday_utc(year, month):
    from datetime import datetime, timezone, timedelta
    d = datetime(year, month, 31, tzinfo=timezone.utc)        # March & October both have 31 days
    return d - timedelta(days=(d.weekday() + 1) % 7)          # Mon=0..Sun=6 → step back to Sunday


def _london_offset_hours(dt_utc):
    """UK clock offset from UTC at this instant: +1 during BST, 0 during GMT."""
    from datetime import timedelta
    bst_start = _last_sunday_utc(dt_utc.year, 3).replace(hour=1)    # 01:00 UTC, last Sun March
    bst_end   = _last_sunday_utc(dt_utc.year, 10).replace(hour=1)   # 01:00 UTC, last Sun October
    return 1 if bst_start <= dt_utc < bst_end else 0


def session_open_epoch(now_epoch):
    """Most-recent midnight Europe/London as a UTC epoch (the session-open anchor)."""
    from datetime import datetime, timezone, timedelta
    now_utc = datetime.fromtimestamp(now_epoch, tz=timezone.utc)
    off = _london_offset_hours(now_utc)
    london_midnight = (now_utc + timedelta(hours=off)).replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert that London wall-clock midnight back to a UTC instant, using the
    # offset that applies AT the midnight instant (handles the DST-change night).
    off_mid = _london_offset_hours(london_midnight - timedelta(hours=off))
    return int((london_midnight - timedelta(hours=off_mid)).timestamp())
