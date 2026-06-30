"""Range-Line Bot strategy bricks — the ONLY Category-A logic the live bot runs.

Everything else (the fade/follow policy, the universe, the ladder fib grid) is
consumed from the frozen ``range_line_bot_plan`` — never recomputed here. This
module mirrors ``js/rangeLineAnalyser.js`` (``buildRangeLadder`` /
``analyseRangeWindow``) + ``barUtils.bodyRange`` so the live cells match the
backtested cells by construction (RANGE_EXTENSION_GUIDE §13/§15):

  * ``resample_to`` / ``body_range`` — the session-range from M1 bars (open/close
    extremes, wicks ignored — matches ``barUtils.bodyRange``),
  * ``build_ladder``  — the half-integer fib ladder off a range (== buildRangeLadder),
  * ``ladder_side``   — a level's side ('up' above the range mid, 'dn' below),
  * ``neighbours``    — inner (toward mid) / outer (away) ladder level for a touch,
  * ``trade_spec``    — fade/follow → {side, entry, protect_stop, rung} (the
    chandelier trail replaces the fixed TP; the engine trails it),
  * ``chandelier_stop`` — peak ∓ chand_frac·rung, clamped to the protect stop
    (== the ``c``-path of ``_trailExits``),
  * ``cell_key``      — the policy key ``"{label}_{side}|"`` (condition 'none').

Pure, offline, no MT5/network.
"""


def _fmt_fib(level):
    """Format a fib level exactly as JS ``Number→String`` does, so the Python
    label matches the frozen cell key: ``1→"1"``, ``1.5→"1.5"``, ``-0.5→"-0.5"``."""
    f = float(level)
    return str(int(f)) if f.is_integer() else repr(f)


def resample_to(bars, minutes):
    """Group M1-ish bars into ``minutes``-buckets (== ``barUtils.resampleTo``):
    each bucket = {open: first, high: max, low: min, close: last}. ``bars`` are
    {time(epoch sec), open, high, low, close}, oldest-first."""
    if not bars:
        return []
    step = minutes * 60
    out, cur, bucket = [], None, None
    for b in bars:
        t = int(b["time"])
        k = t - (t % step)
        if bucket is None or k != cur:
            if bucket is not None:
                out.append(bucket)
            cur, bucket = k, {"open": b["open"], "high": b["high"], "low": b["low"], "close": b["close"]}
        else:
            bucket["high"] = max(bucket["high"], b["high"])
            bucket["low"] = min(bucket["low"], b["low"])
            bucket["close"] = b["close"]
    if bucket is not None:
        out.append(bucket)
    return out


def body_range(bars, minutes):
    """Open/close body extremes over ``minutes``-resampled bars (wicks ignored) —
    matches ``barUtils.bodyRange``. Returns {low, high, range} or None."""
    rs = resample_to(bars, minutes)
    if not rs:
        return None
    hi = max(max(b["open"], b["close"]) for b in rs)
    lo = min(min(b["open"], b["close"]) for b in rs)
    if not (lo < hi):
        return None
    return {"low": lo, "high": hi, "range": hi - lo}


def build_ladder(low, rng, src_tag, ladder_fibs):
    """The day's fib ladder off a range — ``[{label, fibL, level}]`` sorted by
    price. Identical to ``rangeLineAnalyser.buildRangeLadder``: level = low+range·L,
    label = ``"{src}_{L}"`` (e.g. ``A_-0.5``, ``M_1``)."""
    lad = [{"label": f"{src_tag}_{_fmt_fib(L)}", "fibL": L, "level": low + rng * L}
           for L in ladder_fibs]
    lad.sort(key=lambda x: x["level"])
    return lad


def ladder_side(level, low, high):
    """A level's side: 'up' above the range mid, 'dn' below (== analyseRangeWindow:
    ``L > mid ? 'up' : 'dn'``, mid = (low+high)/2)."""
    return "up" if level > (low + high) / 2.0 else "dn"


def neighbours(level, side, ladder_prices):
    """Inner (toward mid) / outer (away) neighbour among the sorted ladder prices —
    matches analyseRangeWindow. up: inner=below, outer=above; dn: inner=above,
    outer=below. Returns ``(None, None)`` for an extreme level with no barrier."""
    below = max((p for p in ladder_prices if p < level - 1e-12), default=None)
    above = min((p for p in ladder_prices if p > level + 1e-12), default=None)
    inner, outer = (below, above) if side == "up" else (above, below)
    if inner is None or outer is None:
        return None, None
    return inner, outer


def cell_key(label, side):
    """Policy cell key (condition 'none' → empty bucket): ``"{label}_{side}|"`` —
    matches ``perLineStrategy.extractTouches`` cell = ``{name}_{side}|{condKey}``."""
    return f"{label}_{side}|"


def trade_spec(level, side, decision, inner, outer):
    """A touched ladder level + policy decision → an order spec for the chandelier-
    trailed held position. There is NO fixed TP — the engine trails the exit.

      follow → protect stop = inner (toward mid);  ride away.
      fade   → protect stop = outer (away);        ride toward mid.
    Direction (== perLineStrategy.pnlFor): BUY when fading a dn-level or following
    an up-level, else SELL. Returns None for a skip/degenerate cell.
    """
    if decision not in ("fade", "follow"):
        return None
    if inner is None or outer is None or inner == outer:
        return None
    protect_stop = inner if decision == "follow" else outer
    is_buy = (decision == "fade" and side == "dn") or (decision == "follow" and side == "up")
    return {
        "side": "buy" if is_buy else "sell",
        "entry": level,
        "protect_stop": protect_stop,
        "rung": abs(outer - level),
    }


def chandelier_stop(dir_up, entry, peak, rung, protect_stop, chand_frac=0.5):
    """The chandelier trailing stop — ``peak ∓ chand_frac·rung``, floored at the
    protect stop, and held AT the protect stop until price makes a new extreme
    beyond entry. Mirrors the ``c``-path of ``rangeLineAnalyser._trailExits``,
    where ``cStop`` starts at ``protectStop`` and only ratchets once a bar prints a
    new high/low past the entry. ``peak`` = best favourable price so far (highest
    high for a long, lowest low for a short; initialised to ``entry``)."""
    trail_w = rung * chand_frac
    if dir_up:
        if peak <= entry:
            return protect_stop                  # no favourable move yet → disaster stop only
        return max(protect_stop, peak - trail_w)
    if peak >= entry:
        return protect_stop
    return min(protect_stop, peak + trail_w)
