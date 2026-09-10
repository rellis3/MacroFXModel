#!/usr/bin/env python3
"""
Backfill Oanda's ORDER BOOK and POSITION BOOK history to parquet.

    python3 scripts/fetch_oanda_books.py --dry-run          # project cost, fetch nothing
    python3 scripts/fetch_oanda_books.py --years 1          # last year, all instruments
    python3 scripts/fetch_oanda_books.py EUR_USD XAU_USD    # specific instruments
    python3 scripts/fetch_oanda_books.py --books position   # position book only
    python3 scripts/fetch_oanda_books.py --from 2024-01 --to 2024-06

## What this is

Two endpoints nothing in this repo has ever stored:

  * orderBook    — resting orders (stops and limits) by price bucket
  * positionBook — open positions by price bucket

Each is a snapshot of `{price, longCountPercent, shortCountPercent}` across the
whole price range, taken every 20 minutes. Structurally this is the same shape as
the CME open-interest work — price buckets carrying concentration — except it is
retail-side, 20-minute rather than daily, and it is OANDA's own book rather than
the exchange's.

`_worker.js` already fetches the position book live for a long/short sentiment
badge, and throws it away. Nothing has ever kept the history.

## It is backfillable, which changes how to treat it

Verified reachable back to at least 2018-01-10 — eight years. That is the opposite
of the CME OI capture, where a missed night is gone forever and the whole nightly
apparatus exists to avoid losing one. Here there is no urgency and no unrecoverable
day: pull a narrow slice, find out whether it predicts anything, and only then
decide whether it deserves a scheduled job. Prefer `--years 1` on one instrument
over the full 946,000-request backfill until something in it earns the disk.

## Weekends are skipped, and that is lossless

The book freezes when the market shuts. Verified on EUR_USD: every 20-minute
snapshot from Fri 21:00Z through Sun 21:00Z returns a byte-identical bucket list,
changing again only once Monday trading is underway. Fetching them would spend 27%
of the run to store the Friday close 144 times over. `--keep-weekends` if you want
them anyway.

## Cost, measured (not estimated)

All figures below are MEASURED on real written months, not estimated. Wall-clock is
the binding constraint; disk is cheap, because the bucket price ladder repeats
identically in every snapshot and compresses to ~2 bytes/row:

    3 years  ~946,000 requests   ~2.0B rows   ~4 GB     ~6.5 hours
    1 year   ~315,000 requests   ~0.7B rows   ~1.4 GB   ~2.2 hours
    1 month, EUR_USD order book (the largest): 1,557 req, 10.4M rows, 21 MB, 1 min

Peak memory is ~470 MB regardless of run length — the month is streamed to disk in
~2M-row groups rather than accumulated (see MonthWriter).

Throughput is ~43 req/s at 8 workers over a pooled connection, and does not improve
with more workers.

`--dry-run` prints the real figure for whatever you actually asked for.

The full ladder is kept because the book really is WIDE, measured on a written month
(EUR_USD order, 2025-12): +/-0.5% of spot holds 11% of all interest, +/-2% holds 29%,
+/-10% still only 48%. Trimming to "near spot" would throw away most of the positions
retail is actually carrying — which is the interesting part, since those are the
underwater holds and the far stops. The ladder's first and last buckets are catch-alls
(price 0.00000 and 1e10) and hold ~5% between them; they are stored as-is rather than
dropped, so a consumer can see them and decide.

## Instruments

FX and metals only. NAS100_USD, SPX500_USD and US30_USD return no book at all
(verified) — CFD indices are not on Oanda's book feed. Unknown instruments are
probed once and skipped with a message rather than failing the run.

Env:
    OANDA_KEY   Oanda v20 API key (required)
    OANDA_ENV   'practice' (default) or 'live'
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import requests

OANDA_ENV = os.environ.get("OANDA_ENV", "practice")
OANDA_BASE = ("https://api-fxpractice.oanda.com" if OANDA_ENV == "practice"
              else "https://api-fxtrade.oanda.com")
OANDA_KEY = os.environ.get("OANDA_KEY")

OUTDIR = Path(__file__).parent.parent / "data" / "books"

# Verified to carry both books. Indices deliberately absent — they return nothing.
DEFAULT_INSTRUMENTS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD",
                       "USD_CAD", "USD_CHF", "NZD_USD", "XAU_USD"]

BOOKS = {"order": "orderBook", "position": "positionBook"}

# Oanda snapshots on a strict 20-minute grid. Any other minute is rejected outright
# ("Specified time ... is misaligned"), so the grid is generated rather than derived
# from a step, and a misalignment is a bug here rather than something to retry.
SNAPSHOT_MINUTES = (0, 20, 40)

_print_lock = threading.Lock()

# Snapshots dropped for having no reference price (see fetch_snapshot). Counted so a
# systematic outage shows up as a number instead of hiding inside 'miss'.
_REJECTED = 0

# ONE POOLED SESSION FOR THE WHOLE RUN. This is not a micro-optimisation: measured
# against the live API, a fresh connection per request runs at 0.29 req/s because
# every call pays a full TLS handshake (~3.4s), while the same requests over a reused
# session run at 1.36 req/s sequentially and 8.9 req/s across 8 workers — a 30x swing
# that is the difference between a 30-hour backfill and a 40-day one.
#
# Concurrency past ~8 makes it WORSE, not better (24 workers measured 4.9 req/s), so
# --workers is capped rather than trusted: Oanda throttles the book endpoints and
# piling on connections just adds contention.
_SESSION = requests.Session()


def init_session(workers: int) -> None:
    """Size the connection pool to the worker count, or urllib3 silently discards
    connections past the default pool of 10 and every discarded one costs another
    handshake — reintroducing exactly the cost the session exists to avoid."""
    ad = requests.adapters.HTTPAdapter(pool_connections=workers, pool_maxsize=workers)
    _SESSION.mount("https://", ad)
    _SESSION.headers.update({"Authorization": f"Bearer {OANDA_KEY}"})


def headers() -> dict:
    if not OANDA_KEY:
        raise RuntimeError("OANDA_KEY env var not set")
    return {"Authorization": f"Bearer {OANDA_KEY}"}


def is_market_shut(t: datetime) -> bool:
    """Sat 00:00Z through Sun 20:40Z — the window where the book is provably frozen.

    Deliberately conservative at both ends: Friday's post-21:00Z snapshots are kept
    (the book is still settling as liquidity drains) and Sunday's 21:00Z reopen is
    kept. Only the stretch that returned an identical hash on every probe is cut.
    """
    if t.weekday() == 5:                       # Saturday, all of it
        return True
    if t.weekday() == 6 and t.hour < 21:       # Sunday until the reopen
        return True
    return False


def snapshot_times(start: datetime, end: datetime, keep_weekends: bool):
    t = start.replace(minute=0, second=0, microsecond=0)
    while t < end:
        for m in SNAPSHOT_MINUTES:
            s = t.replace(minute=m)
            if s < start or s >= end:
                continue
            if keep_weekends or not is_market_shut(s):
                yield s
        t += timedelta(hours=1)


def fetch_snapshot(instrument: str, book: str, t: datetime, tries: int = 4):
    """One snapshot -> (ref_price, [(price, long, short)]) or None.

    None means "nothing to store for this timestamp", which is a normal outcome
    (before the instrument's history begins, or a gap in Oanda's own record) and
    must not abort the month — a single missing snapshot in a 2-billion-row backfill
    is noise, whereas a run that dies on one is a 13-hour job lost.
    """
    url = f"{OANDA_BASE}/v3/instruments/{instrument}/{BOOKS[book]}"
    params = {"time": t.strftime("%Y-%m-%dT%H:%M:%SZ")}
    for attempt in range(tries):
        try:
            r = _SESSION.get(url, params=params, timeout=40)
            if r.status_code == 429:                       # rate limited — back off hard
                time.sleep(2 ** attempt)
                continue
            if r.status_code in (400, 404):
                return None                                # no snapshot at this time
            r.raise_for_status()
            b = r.json().get(BOOKS[book])
            if not b or not b.get("buckets"):
                return None
            # A SNAPSHOT WITH NO REFERENCE PRICE IS DROPPED, NOT PATCHED.
            # Oanda returns price:"" on roughly 1.4% of snapshots (23 of 1,620 in
            # EUR_USD 2026-01) with the bucket ladder otherwise intact. Every bucket
            # price is only meaningful relative to where spot was, so a snapshot
            # without it cannot be placed on the price axis — defaulting `ref` to 0
            # or NaN would put 6,500 buckets of real positioning at a fictional
            # distance from spot and nothing downstream would notice. Counted and
            # reported per month rather than silently skipped. Recoverable later from
            # the M1 candles if 1.4% ever turns out to matter.
            try:
                ref = float(b.get("price") or "")
            except (TypeError, ValueError):
                with _print_lock:
                    global _REJECTED
                    _REJECTED += 1
                return None
            return (ref,
                    [(float(x["price"]), float(x["longCountPercent"]),
                      float(x["shortCountPercent"])) for x in b["buckets"]])
        except requests.RequestException:
            if attempt == tries - 1:
                return None
            time.sleep(2 ** attempt)
        except (ValueError, KeyError, TypeError) as e:
            # A malformed payload must never kill the run. This one did: an empty
            # price string raised ValueError out of a worker thread, through
            # ex.map, and took down a multi-hour backfill four months in, with the
            # completed months saved only because they are written per month.
            with _print_lock:
                print(f"    ! {instrument} {book} {params['time']}: unparseable "
                      f"payload ({type(e).__name__}: {e}) — snapshot dropped")
            return None
    return None


SCHEMA = pa.schema(
    [pa.field("time", pa.timestamp("s")), pa.field("ref", pa.float32()),
     pa.field("price", pa.float32()), pa.field("long", pa.float32()),
     pa.field("short", pa.float32())])

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


class MonthWriter:
    """Streams one month to parquet, a row group per snapshot.

    The obvious version — accumulate the month in a list and build one table at the
    end — costs about 2 GB of RAM for a single EUR_USD order-book month: 1,557
    snapshots x 6,713 buckets is 10.4 million rows, and as Python tuples that is far
    more memory than the 4 MB of parquet it compresses to. Measured live at 851 MB
    and climbing before this was rewritten.

    Writing incrementally keeps the peak at one snapshot (a few thousand rows) no
    matter how long the run is, which is what makes an unattended multi-hour backfill
    safe to leave alongside whatever else is on the machine.

    Still atomic: written to `.parquet.tmp` and renamed only on close(), so an
    interrupted run leaves no half-month for the resume logic to mistake for a
    finished one.
    """

    ROWS_PER_GROUP = 2_000_000

    def __init__(self, path: Path, instrument: str, book: str):
        self.path = path
        self.tmp = path.with_suffix(".parquet.tmp")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.schema = SCHEMA.with_metadata(
            {b"instrument": instrument.encode(), b"book": book.encode(),
             b"source": b"oanda-v20", b"env": OANDA_ENV.encode()})
        self.writer = None
        self.rows = 0
        self._t, self._ref, self._px, self._l, self._s = [], [], [], [], []

    def add(self, t: datetime, ref: float, buckets: list) -> None:
        if not buckets:
            return
        secs = int((t - _EPOCH).total_seconds())
        n = len(buckets)
        self._t.extend([secs] * n)
        self._ref.extend([ref] * n)
        self._px.extend(b[0] for b in buckets)
        self._l.extend(b[1] for b in buckets)
        self._s.extend(b[2] for b in buckets)
        self.rows += n
        if len(self._t) >= self.ROWS_PER_GROUP:
            self._flush()

    def _flush(self) -> None:
        """One row group per ~2M rows, NOT one per snapshot.

        Row-group size is the whole size/memory trade-off here. A group per snapshot
        keeps memory at a few MB but costs 6.2 bytes/row, because parquet's dictionary
        and RLE encodings reset at every group and the bucket price ladder — identical
        in every snapshot, and the one thing that compresses spectacularly — never gets
        to repeat within a group. Batching to ~2M rows lets the ladder repeat hundreds
        of times per group and brings it back near the 0.45 bytes/row a single-group
        file achieves, while holding peak memory to a few hundred MB.
        """
        if not self._t:
            return
        if self.writer is None:
            self.writer = pq.ParquetWriter(str(self.tmp), self.schema, compression="zstd")
        self.writer.write_batch(pa.record_batch(
            [pa.array(self._t, pa.timestamp("s")), pa.array(self._ref, pa.float32()),
             pa.array(self._px, pa.float32()), pa.array(self._l, pa.float32()),
             pa.array(self._s, pa.float32())], schema=self.schema))
        self._t, self._ref, self._px, self._l, self._s = [], [], [], [], []

    def close(self) -> int:
        """-> bytes written (0 if the month produced nothing, and no file is left)."""
        self._flush()
        if self.writer is None:
            return 0
        self.writer.close()
        self.tmp.replace(self.path)
        return self.path.stat().st_size


def months_between(start: datetime, end: datetime):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def month_bounds(y: int, m: int, start: datetime, end: datetime):
    lo = max(datetime(y, m, 1, tzinfo=timezone.utc), start)
    hi = min(datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12
             else datetime(y, m + 1, 1, tzinfo=timezone.utc), end)
    return lo, hi


def do_month(instrument: str, book: str, y: int, m: int, lo: datetime, hi: datetime,
             workers: int, keep_weekends: bool) -> tuple:
    times = list(snapshot_times(lo, hi, keep_weekends))
    if not times:
        return 0, 0, 0, 0
    global _REJECTED
    misses, rej0 = 0, _REJECTED
    path = OUTDIR / book / instrument / f"{y:04d}-{m:02d}.parquet"
    w = MonthWriter(path, instrument, book)
    # ex.map preserves input order and yields lazily, so snapshots are written in
    # chronological order and only a few are ever in flight — the whole point of
    # streaming here (see MonthWriter). Do NOT collect these into a list first.
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for t, res in zip(times, ex.map(lambda t: fetch_snapshot(instrument, book, t), times)):
            if res is None:
                misses += 1
                continue
            ref, buckets = res
            w.add(t, ref, buckets)
    return w.close(), w.rows, misses, _REJECTED - rej0


def probe(instrument: str, book: str) -> bool:
    """Does this instrument carry this book at all? One call, at the live snapshot."""
    url = f"{OANDA_BASE}/v3/instruments/{instrument}/{BOOKS[book]}"
    try:
        r = _SESSION.get(url, timeout=40)
        return r.status_code == 200 and BOOKS[book] in r.json()
    except requests.RequestException:
        return False


def main() -> None:
    global OUTDIR                      # reassigned from --out below; must precede any use
    ap = argparse.ArgumentParser(description="Backfill Oanda order/position book history.")
    ap.add_argument("instruments", nargs="*", help=f"default: {' '.join(DEFAULT_INSTRUMENTS)}")
    ap.add_argument("--books", default="order,position", help="order,position")
    ap.add_argument("--years", type=float, default=1.0, help="history to fetch (default 1)")
    ap.add_argument("--from", dest="frm", help="YYYY-MM (overrides --years)")
    ap.add_argument("--to", dest="to", help="YYYY-MM (default: now)")
    ap.add_argument("--out", default=str(OUTDIR))
    ap.add_argument("--workers", type=int, default=8,
                    help="concurrent requests (default 8 — measured optimum; more is slower)")
    ap.add_argument("--keep-weekends", action="store_true",
                    help="store the frozen Sat/Sun snapshots too (see module docstring)")
    ap.add_argument("--dry-run", action="store_true", help="project cost, fetch nothing")
    ap.add_argument("--force", action="store_true", help="refetch months already on disk")
    a = ap.parse_args()

    OUTDIR = Path(a.out)
    books = [b.strip() for b in a.books.split(",") if b.strip() in BOOKS]
    instruments = a.instruments or DEFAULT_INSTRUMENTS
    if not books:
        sys.exit(f"--books must name one of: {', '.join(BOOKS)}")
    if not OANDA_KEY:
        sys.exit("OANDA_KEY env var not set")
    if a.workers > 12:
        print(f"  note: --workers {a.workers} measured SLOWER than 8 (Oanda throttles "
              f"these endpoints); 8 is the tested optimum")
    init_session(a.workers)

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    if a.frm:
        y, m = (int(x) for x in a.frm.split("-"))
        start = datetime(y, m, 1, tzinfo=timezone.utc)
    else:
        start = now - timedelta(days=int(365 * a.years))
    if a.to:
        y, m = (int(x) for x in a.to.split("-"))
        end = (datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12
               else datetime(y, m + 1, 1, tzinfo=timezone.utc))
    else:
        end = now
    end = min(end, now)

    print(f"\n  {OANDA_BASE}   {start:%Y-%m-%d} -> {end:%Y-%m-%d}")
    print(f"  books: {', '.join(books)}   instruments: {len(instruments)}")
    print(f"  weekends: {'kept' if a.keep_weekends else 'skipped (book is frozen)'}\n")

    n_snap = sum(1 for _ in snapshot_times(start, end, a.keep_weekends))
    print(f"  {n_snap:,} snapshots per instrument-book  x  "
          f"{len(instruments) * len(books)} = {n_snap * len(instruments) * len(books):,} requests")

    if a.dry_run:
        # Price the run off ONE real snapshot per pairing rather than a rule of thumb:
        # bucket counts differ by an order of magnitude across instruments (EUR_USD's
        # order book is 6,713 buckets, its position book 596), so a generic estimate
        # would be wrong by several GB either way.
        print("\n  probing one live snapshot per instrument-book to size the run...\n")
        tot_rows = tot_bytes = 0
        for inst in instruments:
            for bk in books:
                r = _SESSION.get(f"{OANDA_BASE}/v3/instruments/{inst}/{BOOKS[bk]}", timeout=40)
                if r.status_code != 200 or BOOKS[bk] not in r.json():
                    print(f"    {inst:9} {bk:9}  NO BOOK — will be skipped")
                    continue
                nb = len(r.json()[BOOKS[bk]]["buckets"])
                rows = nb * n_snap
                # 1.99 bytes/row, MEASURED on a real written month (EUR_USD order,
                # 10,387,037 rows -> 20,666,080 bytes, 11 row groups). Far below the
                # naive 5-float estimate because the bucket price ladder is identical
                # in every snapshot and RLE/dictionary encode the repeat almost for
                # free. It is sensitive to MonthWriter.ROWS_PER_GROUP — a row group
                # per snapshot measured 6.2 — so re-measure if that changes rather
                # than reasoning about it. Do not "correct" it upward from first
                # principles; it is a file size.
                by = rows * 1.99
                tot_rows += rows
                tot_bytes += by
                print(f"    {inst:9} {bk:9}  {nb:6,} buckets  ->  {rows:14,} rows  {by/1e9:6.2f} GB")
        # MEASURED end-to-end on a real month: 1,557 requests in ~36s = ~43 req/s at
        # 8 workers over the pooled session. Held at 40 to stay slightly pessimistic.
        # Not derived from --workers: concurrency past ~8 measured SLOWER (24 workers
        # managed 4.9 req/s), so scaling this by worker count would promise a speed
        # the endpoint does not give.
        rate = 40.0
        secs = n_snap * len(instruments) * len(books) / max(rate, 1)
        print(f"\n  TOTAL  {tot_rows:,} rows   {tot_bytes/1e9:.1f} GB   "
              f"~{secs/3600:.1f}h at {rate:.0f} req/s (measured, 8 workers)")
        print("\n  Nothing was fetched. Drop --dry-run to run it.")
        return

    # Probe once so an instrument with no book costs one request, not a whole month.
    pairings = []
    for inst in instruments:
        for bk in books:
            if probe(inst, bk):
                pairings.append((inst, bk))
            else:
                print(f"  {inst} has no {bk} book — skipping")
    if not pairings:
        sys.exit("  nothing to fetch")

    t0 = time.time()
    tot_bytes = tot_rows = tot_miss = done = skipped = 0
    for inst, bk in pairings:
        for y, m in months_between(start, end):
            lo, hi = month_bounds(y, m, start, end)
            if lo >= hi:
                continue
            path = OUTDIR / bk / inst / f"{y:04d}-{m:02d}.parquet"
            # RESUME. A month on disk is a month finished, because write_month renames
            # into place atomically — there is no such thing as a partial month file.
            if path.exists() and not a.force:
                skipped += 1
                continue
            by, nrows, miss, rej = do_month(inst, bk, y, m, lo, hi, a.workers, a.keep_weekends)
            tot_bytes += by
            tot_rows += nrows
            tot_miss += miss
            done += 1
            el = time.time() - t0
            print(f"  {inst:9} {bk:9} {y:04d}-{m:02d}  {nrows:10,} rows  "
                  f"{by/1e6:7.1f} MB  {miss:4} miss  {rej:4} no-ref  "
                  f"[{done} done, {el/60:.1f} min]")

    print(f"\n  {done} month(s) written, {skipped} already on disk"
          f"{' (--force to refetch)' if skipped else ''}")
    print(f"  {tot_rows:,} rows   {tot_bytes/1e9:.2f} GB   {tot_miss:,} snapshot(s) unavailable   "
          f"{_REJECTED:,} dropped for no reference price")
    print(f"  {(time.time()-t0)/60:.1f} min   ->  {OUTDIR}")


if __name__ == "__main__":
    main()
