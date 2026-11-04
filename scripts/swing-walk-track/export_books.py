#!/usr/bin/env python3
"""swing-walk-track, step 1: the Databento books per expiry per night, with the parity forward, as JSON for the walk
replay (forge/SWING_WALK_TRACK_PREREG.md §3).

Re-uses the expiry-tracker conventions so the two studies read the same books:
  - 40_expiry_track_history.load_raw + build (contract key, OI forward-filled up to 5 trade dates, inverted strikes);
  - 41_expiry_pull_score.load_forwards (F per (date, expiry) from put-call parity, OANDA convention) and load_prices
    (17:00 New York closes, 60-close sigma, 20-close trailing return).
For the inverted pairs the call and put columns are swapped after the strike inversion, so a column means the same in
spot terms as the live expiryView withLadder rows (a CME USD/JPY call is a spot put).

No outcome is computed here. Read-only on its inputs; writes analysis/output/swing-walk-track/_books/<KEY>.json.

  python scripts/swing-walk-track/export_books.py --oi "OI Data" --prices analysis/output/swing-leg-baserates/daily_m15
"""
import argparse
import importlib.util
import json
import math
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OIB = os.path.join(ROOT, "oi_research_book", "scripts")
sys.path.insert(0, OIB)


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(OIB, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


track40 = _load("track40", "40_expiry_track_history.py")
s41 = _load("s41", "41_expiry_pull_score.py")
from pair_config import cfg  # noqa: E402

OUT = os.path.join(ROOT, "analysis", "output", "swing-walk-track", "_books")


def sig(x, n=8):
    return float(f"{x:.{n}g}")


def export(pair, key, oi_dir, prices_dir):
    inverted = bool(cfg(pair)["inverted"])
    path = os.path.join(oi_dir, f"{pair}.csv")
    track = track40.build(track40.load_raw(path, inverted))
    fwd = s41.load_forwards(path, inverted)
    prices = s41.load_prices(prices_dir, key)
    books, missing_f = {}, 0
    for (e, d), g in track.groupby(["expiry", "date"], sort=True):
        f = fwd.get((d, e))
        if f is None or not math.isfinite(f) or f <= 0:
            missing_f += 1
            continue
        k, c, p = g["strike"].to_numpy(float), g["call_oi"].to_numpy(float), g["put_oi"].to_numpy(float)
        if inverted:
            c, p = p, c
        rows = sorted([[sig(k[i]), int(round(c[i])), int(round(p[i]))] for i in range(len(k)) if c[i] + p[i] > 0])
        books.setdefault(e.strftime("%Y-%m-%d"), []).append([d.strftime("%Y-%m-%d"), sig(f), rows])
    px = [[r.date.strftime("%Y-%m-%d"), float(r.close),
           None if not math.isfinite(r.sigma) else sig(r.sigma), None if not math.isfinite(r.ret20) else sig(r.ret20)]
          for r in prices.itertuples(index=False)]
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{key}.json"), "w", encoding="utf-8") as fh:
        json.dump({"pair": pair, "key": key, "inverted": inverted, "prices": px, "books": books,
                   "counts": {"expiries": len(books), "nights": sum(len(v) for v in books.values()), "missingForward": missing_f}}, fh)
    print(pair, key, "inverted" if inverted else "", "expiries", len(books), "book-nights", sum(len(v) for v in books.values()), "no forward", missing_f, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oi", required=True)
    ap.add_argument("--prices", required=True)
    ap.add_argument("--pairs", nargs="*", default=list(s41.INSTRUMENTS))
    a = ap.parse_args()
    for pair in a.pairs:
        export(pair, s41.INSTRUMENTS[pair], a.oi, a.prices)


if __name__ == "__main__":
    main()
