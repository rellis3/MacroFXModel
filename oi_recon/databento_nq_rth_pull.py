#!/usr/bin/env python3
"""
NQ front-month trades from Databento (GLBX.MDP3, NQ.v.0), US cash hours only (09:30-16:00 New York), one file per session.
Written 2026-11-07 at the owner's request for "a few months of NQ". Cash hours only because a session then costs less and that is the session
the footprint work reads. Newest session first, working back from --end (default 2026-08-21, the last session before the lockbox).

    python oi_recon/databento_nq_rth_pull.py --quote --sessions 60        # FREE: what the window would cost
    python oi_recon/databento_nq_rth_pull.py --cap 17                     # buys sessions until the next one would pass the cap, then stops

SPEND RULES (owner rule 2026-10-20): every session gets a FREE quote first, and a quote that would pass --cap stops the run before buying.
A failure on a paid download stops the run at once and nothing is retried; a re-run resumes, because sessions on disk are skipped.
The $ in the manifest is the quote. A failed download may also have been billed.

Files: %LOCALAPPDATA%/MacroFXModel/orderflow/raw/GLBX/trades_rth/NQ/<date>.dbn.zst, manifest nq_rth_manifest.json beside the store's own.
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DATASET = "GLBX.MDP3"
SYMBOL = "NQ.v.0"
NY = ZoneInfo("America/New_York")
BASE = Path(os.environ.get("ORDERFLOW_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "orderflow"))
RAW = BASE / "raw" / "GLBX" / "trades_rth" / "NQ"
MANIFEST = BASE / "nq_rth_manifest.json"


def client():
    import databento as db
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    if not os.environ.get("DATABENTO_API_KEY"):
        sys.exit("DATABENTO_API_KEY not set")
    return db.Historical(os.environ["DATABENTO_API_KEY"])


def window(d):
    a = datetime(d.year, d.month, d.day, 9, 30, tzinfo=NY).astimezone(timezone.utc)
    z = datetime(d.year, d.month, d.day, 16, 0, tzinfo=NY).astimezone(timezone.utc)
    return dict(dataset=DATASET, symbols=[SYMBOL], stype_in="continuous", schema="trades", start=a.isoformat(), end=z.isoformat())


def sessions(end, n):
    d, out = end, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out


def load_manifest():
    try:
        return json.loads(MANIFEST.read_text())
    except (OSError, ValueError):
        return dict(symbol=SYMBOL, schema="trades", hours="09:30-16:00 New York", note="$ is the quoted price of each session", days={})


def save_manifest(m):
    m["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    m["spent"] = round(sum(x["usd"] for x in m["days"].values()), 4)
    m["first"], m["last"] = min(m["days"]), max(m["days"])
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(m, indent=1, sort_keys=True))
    tmp.replace(MANIFEST)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", default="2026-08-21")
    ap.add_argument("--sessions", type=int, default=130)
    ap.add_argument("--cap", type=float, help="dollars this script may spend in total, including earlier runs")
    ap.add_argument("--quote", action="store_true")
    a = ap.parse_args()
    if not a.quote and a.cap is None:
        sys.exit("--cap is required to buy")
    if date.fromisoformat(a.end) > date(2026, 8, 21):
        print("NOTE: sessions after 2026-08-21 are the lockbox holdout and may not be scored.")
    c = client()
    days = sessions(date.fromisoformat(a.end), a.sessions)
    if a.quote:
        tot = 0.0
        for i, d in enumerate(days):
            q = float(c.metadata.get_cost(**window(d)))
            tot += q
            if (i + 1) % 10 == 0 or i + 1 == len(days):
                print(f"{i + 1} sessions back to {d}: ${tot:.2f}", flush=True)
        return
    import databento as db
    RAW.mkdir(parents=True, exist_ok=True)
    m = load_manifest()
    spent = sum(x["usd"] for x in m["days"].values())
    bought = 0
    for d in days:
        p = RAW / f"{d}.dbn.zst"
        if p.exists():
            continue
        kw = window(d)
        q = float(c.metadata.get_cost(**kw))
        if spent + q > a.cap:
            print(f"STOP at cap: {d} quotes ${q:.3f}, spent ${spent:.2f} of ${a.cap:.2f}", flush=True)
            break
        expected = c.metadata.get_record_count(**kw)
        part = p.with_suffix(".zst.part")
        part.unlink(missing_ok=True)
        try:
            c.timeseries.get_range(path=str(part), **kw)
            rows = sum(len(x) for x in db.DBNStore.from_file(str(part)).to_ndarray(count=2_000_000))
            if rows != expected:
                raise RuntimeError(f"short file: {rows:,} rows, Databento counts {expected:,}")
            part.replace(p)
        except Exception as e:  # noqa: BLE001 - paid call: stop at once, never retry
            sys.exit(f"STOPPED on {d}: {type(e).__name__}: {e}. Spent about ${spent:.2f}, and this session (${q:.3f}) may also have been billed. Ask the owner before re-running.")
        spent += q
        bought += 1
        m["days"][str(d)] = dict(usd=q, rows=int(rows), bytes=p.stat().st_size)
        save_manifest(m)
        print(f"{d}: {rows:,} trades ${q:.3f} (spent ${spent:.2f} of ${a.cap:.2f})", flush=True)
    print(f"done: {bought} sessions bought this run, {len(m['days'])} on disk, ${spent:.2f} spent", flush=True)


if __name__ == "__main__":
    main()
