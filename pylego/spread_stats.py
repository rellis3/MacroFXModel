"""spread_stats — a per-pair spread AVERAGE a gate can actually trust.

Built 2026-09-18 because `pylego.motif_policy.RETAIL_SPREAD_PIPS` is a set of
per-pair ESTIMATES, and a live account's real spread varies by session and
by broker. Rewritten 2026-09-19: the first version was a time-decayed EWMA
with a 7-day half-life fed 3-second ticks, so each tick weighed
1 - 0.5**(3s/168h) ~= 0.0000034 -- the "average" was the FIRST tick ever
sampled, forever, and it was trusted as soon as 200 ticks had been counted.
EURUSD reported 0.1 pips on 870 samples while both the demo terminal and
OANDA showed 0.7-0.8; GBPCAD (table 2.9p) walked into the plan on it.

Now: plain sums. Each sample lands in a (UTC day, UTC hour) bucket as
(sum, n, max); the average a caller gets is the mean over the strategy's
ENTRY HOURS (07-16 UTC, where AnalogML/motif_alert_backtest.py's entries
cluster) across a rolling window of the last WINDOW_DAYS days. Trusted only
when there are >= MIN_LIVE_SAMPLES samples spread over >= MIN_LIVE_HOURS
distinct entry hours -- a single busy hour cannot speak for the day. Samples
outside FX market hours (Fri 21:00 -> Sun 21:00 UTC) and zero spreads are
dropped: weekend quotes are not a cost anyone pays.

Pure math, no I/O -- callers own persistence (motif_bot.py samples real MT5
ticks and pushes the dict to KV as `motif_bot_spread_stats`; motif_track.py
reads it back to override the static table). Same public API as before:
`update_pair_stats(stats, pair, sample_pips, now)` and
`live_spread_pips(stats, pair)`; the stored shape changed (old rows with
"avg_pips" are ignored, not mis-read).
"""
from __future__ import annotations

from datetime import datetime, timezone

WINDOW_DAYS = 14
ENTRY_HOURS = tuple(range(7, 17))   # 07..16 UTC inclusive
MIN_LIVE_SAMPLES = 200
MIN_LIVE_HOURS = 3


def _utc(now: float) -> datetime:
    return datetime.fromtimestamp(float(now), tz=timezone.utc)


def is_market_open(now: float) -> bool:
    """FX cash market: closed from Friday 21:00 UTC to Sunday 21:00 UTC."""
    d = _utc(now)
    wd, h = d.weekday(), d.hour   # Mon=0 .. Sun=6
    if wd == 5:
        return False
    if wd == 4 and h >= 21:
        return False
    if wd == 6 and h < 21:
        return False
    return True


def update_pair_stats(stats: dict, pair: str, sample_pips: float, now: float) -> None:
    """Mutate `stats` in place with one spread reading (pips) for `pair`.
    Shape: `{pair: {"days": {"YYYY-MM-DD": {"HH": {"sum", "n", "max"}}},
    "n": total_samples_in_window, "updated_at": epoch}}`. Days older than
    WINDOW_DAYS are dropped on every update so the dict never grows."""
    if sample_pips is None or sample_pips <= 0 or not is_market_open(now):
        return
    d = _utc(now)
    day, hour = d.strftime("%Y-%m-%d"), d.strftime("%H")
    row = stats.get(pair)
    if not row or "days" not in row:          # fresh, or the pre-2026-09-19 EWMA shape
        row = {"days": {}, "n": 0, "updated_at": float(now)}
        stats[pair] = row
    cell = row["days"].setdefault(day, {}).setdefault(hour, {"sum": 0.0, "n": 0, "max": 0.0})
    cell["sum"] = round(cell["sum"] + float(sample_pips), 4)
    cell["n"] += 1
    cell["max"] = max(cell["max"], float(sample_pips))
    # roll the window
    cutoff = (d.timestamp() - WINDOW_DAYS * 86400)
    for old in [k for k in row["days"] if datetime.fromisoformat(k).replace(tzinfo=timezone.utc).timestamp() < cutoff]:
        del row["days"][old]
    row["n"] = sum(c["n"] for h in row["days"].values() for c in h.values())
    row["updated_at"] = float(now)


def entry_hours_mean(stats: dict, pair: str) -> tuple[float | None, int, int]:
    """(mean_pips, n_samples, n_distinct_hours) over ENTRY_HOURS in the
    window; mean is None with no data."""
    row = stats.get(pair)
    if not row or "days" not in row:
        return None, 0, 0
    total = 0.0; n = 0; hours = set()
    for day in row["days"].values():
        for hh, c in day.items():
            if int(hh) in ENTRY_HOURS and c.get("n"):
                total += c["sum"]; n += c["n"]; hours.add(hh)
    return (total / n if n else None), n, len(hours)


def live_spread_pips(stats: dict, pair: str, min_samples: int = MIN_LIVE_SAMPLES,
                     min_hours: int = MIN_LIVE_HOURS) -> float | None:
    """The live-measured entry-hours average for `pair`, or None when there
    isn't enough data yet to trust it over the static RETAIL_SPREAD_PIPS
    estimate -- callers fall back to that table on a None."""
    mean, n, hours = entry_hours_mean(stats, pair)
    if mean is None or n < min_samples or hours < min_hours:
        return None
    return round(mean, 2)
