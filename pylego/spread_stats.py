"""spread_stats — time-decayed rolling average of a per-pair spread reading.

Built 2026-09-18 because `pylego.motif_policy.RETAIL_SPREAD_PIPS` is a set of
per-pair ESTIMATES (that module's own docstring says so explicitly), and a
live account's real spread varies with the session and with volatility --
tight in London/NY overlap, wide in a thin Asia session or around news. A
single hardcoded number can't represent that, so a pair sitting just above
the modelled cutoff might really be tradeable on THIS account, and a pair
just under it might not be.

Pure math, no I/O -- callers own persistence (motif_bot.py samples real MT5
ticks and pushes the result to KV; motif_track.py reads it back to override
the static table when there's enough data to trust it). A plain cumulative
mean would let however long the bot happens to have been running dominate
the answer; decaying by WALL-CLOCK time instead of sample count means the
average always reflects roughly the last `halflife_hours` of trading, so
calm and busy sessions show up in close to their natural proportion no
matter how often or unevenly the caller actually polls.
"""
from __future__ import annotations

DEFAULT_HALFLIFE_HOURS = 168.0   # 7 days -- long enough to span every session
                                  # and both a quiet and a busy week, short
                                  # enough to track a real change in a
                                  # broker's typical spread within a month.

# A pair's live average isn't trusted over the static RETAIL_SPREAD_PIPS
# estimate until it has this many real ticks behind it -- protects against a
# freshly-restarted bot's first few (possibly unrepresentative) samples
# immediately overriding a modelled number that reflects far more history.
MIN_LIVE_SAMPLES = 200


def ewma_update(prev_avg: float | None, prev_n: int, prev_t: float | None,
                sample: float, now: float,
                halflife_hours: float = DEFAULT_HALFLIFE_HOURS) -> tuple[float, int, float]:
    """One time-decayed EWMA step. `prev_t`/`now` are epoch seconds; a first
    sample (`prev_avg`/`prev_t` None) seeds the average directly. Returns
    `(new_avg, new_n, new_t)`.

    At `dt_hours == halflife_hours` the new sample and the old average are
    weighted exactly 50/50 -- the defining property of a half-life -- and
    that weighting scales smoothly for any other elapsed gap, so it behaves
    sensibly whether the caller polls every minute or only once a day."""
    if prev_avg is None or prev_t is None:
        return float(sample), 1, float(now)
    dt_hours = max(0.0, (now - prev_t) / 3600.0)
    halflife_hours = max(1e-6, halflife_hours)
    alpha = 1.0 - 0.5 ** (dt_hours / halflife_hours)
    new_avg = prev_avg + alpha * (sample - prev_avg)
    return float(new_avg), prev_n + 1, float(now)


def update_pair_stats(stats: dict, pair: str, sample_pips: float, now: float,
                      halflife_hours: float = DEFAULT_HALFLIFE_HOURS) -> None:
    """Mutate `stats` (shape `{pair: {"avg_pips", "n", "updated_at"}}`) in
    place with one new spread-in-pips reading for `pair`."""
    cur = stats.get(pair) or {}
    avg, n, t = ewma_update(cur.get("avg_pips"), int(cur.get("n") or 0), cur.get("updated_at"),
                            sample_pips, now, halflife_hours)
    stats[pair] = {"avg_pips": round(avg, 3), "n": n, "updated_at": t}


def live_spread_pips(stats: dict, pair: str, min_samples: int = MIN_LIVE_SAMPLES) -> float | None:
    """The live-measured average for `pair`, or None when there isn't enough
    data yet to trust it over the static RETAIL_SPREAD_PIPS estimate --
    callers should fall back to that table on a None here."""
    row = stats.get(pair)
    if not row or int(row.get("n") or 0) < min_samples:
        return None
    return row.get("avg_pips")
