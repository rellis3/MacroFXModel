#!/usr/bin/env python3
"""paper_track.py — forward paper-tracking log for the FROZEN shape-matching
signal (window=64, k=20, sl=20p, tp_r=1.5 -- the setting pattern_scan_sweep.py
validated across 26/26 pairs, the same one backtest_export.py freezes).

This is the ONE thing missing from every result in AnalogML/README.md: a
genuinely blind forward read. Every backtest so far (sweep, ablation,
portfolio sim, the backtest card) scored the signal on data that was ALSO
used, in aggregate, to pick window=64/k=20 -- a real calendar split, not a
blind holdout. paper_track.py is the mechanism to get an actual blind
number: log what the FROZEN signal calls on each new bar as it arrives,
resolve it against bars that arrive AFTER the call was logged, never
touch the frozen parameters based on what comes in.

**Data-access blocker (read before running this expecting live results):**
This sandbox's outbound network is proxied and OANDA is explicitly denied
(confirmed: `curl` to api-fxpractice.oanda.com gets a 403 policy denial from
the proxy, matching CLAUDE.md's "OANDA is reachable in Railway, not in the
sandbox"). So without `--refresh-data`, `load_bars()` here reads the SAME
static local M1 parquet snapshot (through 2026-05-21) as every other
AnalogML script -- no live feed. `--as-of YYYY-MM-DD` exists so the
mechanism can be exercised and verified honestly without pretending to have
live data: it truncates the loaded bars as if that date were "today," so a
scan at an early cutoff followed by a later one proves the resolve step uses
genuinely-later bars, not a forward result on its own.

`--refresh-data` (real forward use, run where OANDA IS reachable -- Railway,
per CLAUDE.md) calls `refresh_m1.py` first to top up each pair's local
parquet with new OANDA bars before scanning, then persists the growing trade
log to Cloudflare R2 (same bucket/credentials as the M1 data, `R2_ACCESS_KEY`
/`R2_SECRET_KEY` env vars) instead of local disk -- Railway's local
filesystem is wiped on redeploy (the same trap `CLAUDE.md` documents for KV
configs), so a log that only lived on local disk wouldn't survive one. Falls
back to local disk when R2 credentials aren't set (this sandbox, or local
dev), so nothing here silently loses data either way.

Mechanics per pair, per run:
  - resolve_open_trades(): every 'open' logged trade is re-raced
    (pylego.barrier_race.race_trades, the SAME walker as everywhere else)
    against whatever bars are now visible; marked tp/sl once a barrier is
    actually touched, or 'timeout' ONLY once genuinely enough bars exist
    past entry+max_bars_ahead (never a false timeout just because the data
    slice ran out) -- otherwise stays 'open'.
  - scan_pair(): checks only the LATEST available bar (one signal per pair
    per run, matching a "check once when new data lands" cadence -- if runs
    happen less often than min_gap_bars (~2.7 days at window=64 on H1), a
    signal in between could be missed; a real deployment should run at
    least that often, not a limitation worth backfill-engineering here).

Log: AnalogML/data/paper_trades.json, append-only, never rewritten except to
flip status open -> tp/sl/timeout.

Usage:
  python AnalogML/paper_track.py                 # real use (once wired to live data)
  python AnalogML/paper_track.py --as-of 2026-03-01   # mechanism test, step 1
  python AnalogML/paper_track.py                        # mechanism test, step 2 (resolves + scans again)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.analog_signal import neighbor_consensus  # noqa: E402
from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.shape_match import rolling_shapes  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]

FROZEN = dict(window=64, k=20, sl_pips=20.0, tp_r=1.5, max_bars_ahead=200,
             min_bars_ahead=10, min_candidates=2000)

LOG_PATH = Path(__file__).resolve().parent / "data" / "paper_trades.json"

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com")
R2_BUCKET = os.environ.get("R2_BUCKET", "r2-storage")
R2_LOG_KEY = "analogml/paper_trades.json"


def _r2_client():
    """None if R2 credentials aren't configured (local dev / this sandbox) --
    callers fall back to local disk in that case. Only R2_ACCESS_KEY/
    R2_SECRET_KEY are secrets; endpoint/bucket are non-sensitive config, same
    convention as portfolio_backtest.py / r2_download.py."""
    access_key = os.environ.get("R2_ACCESS_KEY")
    secret_key = os.environ.get("R2_SECRET_KEY")
    if not access_key or not secret_key:
        return None
    import boto3
    return boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id=access_key,
                        aws_secret_access_key=secret_key, region_name="auto")


def load_log() -> dict:
    """R2 first (survives a Railway redeploy), local disk as fallback/dev
    path. R2 read failures (key doesn't exist yet, network hiccup) fall
    through to local disk rather than crashing -- a fresh account starts
    with an empty log either way."""
    s3 = _r2_client()
    if s3 is not None:
        try:
            obj = s3.get_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY)
            return json.loads(obj["Body"].read())
        except Exception:
            pass
    if LOG_PATH.exists():
        return json.loads(LOG_PATH.read_text())
    return {"trades": []}


def save_log(log: dict) -> None:
    """Writes to R2 when configured (the durable path); ALSO always writes
    the local copy so a run without R2 configured (this sandbox, local dev,
    --as-of testing) still persists between invocations."""
    body = json.dumps(log, indent=2, default=str)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(body)
    s3 = _r2_client()
    if s3 is not None:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=R2_LOG_KEY, Body=body.encode("utf-8"),
                          ContentType="application/json")
        except Exception as e:
            print(f"[warn] R2 write failed ({e}) -- local copy at {LOG_PATH} is current, "
                  f"R2 copy may be stale until the next successful run")


def scan_pair(pair: str, bars: pd.DataFrame, log: dict, params: dict) -> dict | None:
    """Look for ONE new eligible entry for `pair`, at the LATEST bar
    currently visible in `bars`, independent (>= window bars) from any
    already-logged entry. Returns a new 'open' trade dict, or None."""
    closes = bars["close"].to_numpy()
    n = len(bars)
    end_idx, shapes = rolling_shapes(closes, params["window"])
    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}

    existing = [t for t in log["trades"] if t["pair"] == pair]
    last_entry_idx = max((t["entry_idx"] for t in existing), default=-1)

    min_first = params["window"] - 1 + params["min_candidates"]
    earliest_ok = max(min_first, last_entry_idx + params["window"])
    q = n - 2  # entry happens at q+1's OPEN, so q+1 must exist -- the latest bar (n-1) is the entry
    if q < earliest_ok:
        return None  # not enough new/independent bars since the last logged entry

    pos = end_idx_set_pos.get(q)
    if pos is None:
        return None

    pip = pip_size(pair)
    sl_price = params["sl_pips"] * pip
    cost_price = default_spread(pair)

    consensus = neighbor_consensus(
        bars, end_idx, shapes, shapes[pos], query_end=q,
        k=params["k"], min_gap_bars=params["window"],
        sl_price=sl_price, tp_r=params["tp_r"], cost_price=cost_price,
        max_bars_ahead=params["max_bars_ahead"], min_bars_ahead=params["min_bars_ahead"],
    )
    if consensus.direction == 0:
        return None

    entry_idx = q + 1
    entry_price = float(bars["open"].to_numpy()[entry_idx])
    direction = consensus.direction
    tp_price = entry_price + direction * sl_price * params["tp_r"]
    sl_level = entry_price - direction * sl_price
    return {
        "pair": pair, "entry_idx": int(entry_idx),
        "entry_date": bars.index[entry_idx].isoformat(),
        "direction": "BUY" if direction == 1 else "SELL",
        "entry_price": entry_price, "sl_price": sl_level, "tp_price": tp_price,
        "sl_dist": sl_price, "tp_r": params["tp_r"], "status": "open",
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }


SHAPE_STATE_PATH = Path(__file__).resolve().parent / "data" / "shape_state.json"
R2_SHAPE_STATE_KEY = "analogml/shape_state.json"


def compute_shape_state(pair: str, bars: pd.DataFrame, params: dict) -> dict | None:
    """The live diagnostic snapshot for `pair` -- what pair cards on
    today.html/indexv2.html show: the CURRENT window's normalized shape (for
    a sparkline) plus its neighbour-consensus stats, computed the same way
    as scan_pair()'s directional call but WITHOUT the min_gap_bars-since-
    last-logged-trade gate -- this always reflects "right now", the same
    way a price chart does, whether or not it happens to also be a fresh
    independent trade signal this run."""
    n = len(bars)
    if n < params["window"] + params["min_candidates"]:
        return None
    closes = bars["close"].to_numpy()
    end_idx, shapes = rolling_shapes(closes, params["window"])
    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}

    q = n - 2  # same "leave room for an entry bar" convention as scan_pair
    pos = end_idx_set_pos.get(q)
    if pos is None:
        return None

    pip = pip_size(pair)
    sl_price = params["sl_pips"] * pip
    cost_price = default_spread(pair)

    consensus = neighbor_consensus(
        bars, end_idx, shapes, shapes[pos], query_end=q,
        k=params["k"], min_gap_bars=params["window"],
        sl_price=sl_price, tp_r=params["tp_r"], cost_price=cost_price,
        max_bars_ahead=params["max_bars_ahead"], min_bars_ahead=params["min_bars_ahead"],
    )
    lean = "LONG" if consensus.direction == 1 else ("SHORT" if consensus.direction == -1 else "FLAT")

    return {
        "pair": pair,
        "as_of": bars.index[q].isoformat(),
        "shape": [round(float(v), 4) for v in shapes[pos]],
        "n_neighbours": consensus.n_neighbours,
        "avg_long_r": consensus.avg_long_r,
        "avg_short_r": consensus.avg_short_r,
        "margin": consensus.margin,
        "lean": lean,
        "window": params["window"], "k": params["k"],
    }


def save_shape_state(states: list[dict]) -> None:
    """Same local-disk + R2 persistence pattern as save_log() -- one R2
    client helper, two keys."""
    body = json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "pairs": states},
                      default=str)
    SHAPE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SHAPE_STATE_PATH.write_text(body)
    s3 = _r2_client()
    if s3 is not None:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=R2_SHAPE_STATE_KEY, Body=body.encode("utf-8"),
                          ContentType="application/json")
        except Exception as e:
            print(f"[warn] R2 shape-state write failed ({e}) -- local copy at "
                  f"{SHAPE_STATE_PATH} is current")


def resolve_open_trades(pair: str, bars: pd.DataFrame, log: dict, params: dict) -> int:
    """Re-race every 'open' logged trade for `pair` against whatever bars
    are now visible. Marks tp/sl the moment a barrier is genuinely touched;
    marks timeout ONLY once real bars exist past entry+max_bars_ahead
    (never a false timeout just because the current data slice ran out --
    that would silently misreport a still-pending trade as closed)."""
    n = len(bars)
    pip = pip_size(pair)
    sl_price = params["sl_pips"] * pip
    cost_price = default_spread(pair)
    resolved = 0
    for t in log["trades"]:
        if t["pair"] != pair or t["status"] != "open":
            continue
        if t["entry_idx"] >= n:
            continue  # this data slice doesn't even reach the entry bar yet
        direction = 1 if t["direction"] == "BUY" else -1
        entry = Entry(idx=t["entry_idx"], direction=direction, entry_price=t["entry_price"])
        result = race_trades(bars, [entry], sl=sl_price, tp_r=t["tp_r"],
                             max_bars_ahead=params["max_bars_ahead"], cost_price=cost_price,
                             min_bars_ahead=0)
        if not result:
            continue
        r = result[0]
        genuinely_timed_out = (n - 1) >= t["entry_idx"] + params["max_bars_ahead"]
        if r["outcome"] in ("tp", "sl") or genuinely_timed_out:
            t["status"] = r["outcome"]
            t["exit_date"] = bars.index[r["exit_idx"]].isoformat()
            t["exit_price"] = r["exit_price"]
            t["r"] = r["r"]
            t["resolved_at"] = datetime.now(timezone.utc).isoformat()
            resolved += 1
    return resolved


def run(args: argparse.Namespace) -> None:
    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS

    if args.refresh_data:
        if args.as_of:
            raise SystemExit("--refresh-data and --as-of are mutually exclusive "
                             "(--as-of is a historical replay test; --refresh-data pulls live prices)")
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from refresh_m1 import refresh_pair  # noqa: E402  -- reuse, don't re-implement OANDA fetch
        print("[refresh_m1] topping up local M1 parquet from OANDA before scanning...")
        for pair in pairs:
            try:
                n = refresh_pair(pair)
                if n:
                    print(f"  {pair:<8} +{n} bars")
            except Exception as e:
                print(f"  {pair:<8} refresh failed ({e}) -- scanning against whatever data "
                      f"is already local for this pair")

    log = load_log()
    new_signals, resolved_total = 0, 0
    shape_states: list[dict] = []

    for pair in pairs:
        bars = load_bars(pair, args.timeframe)
        if args.as_of:
            cutoff = pd.Timestamp(args.as_of, tz=bars.index.tz)
            bars = bars[bars.index <= cutoff]
        if len(bars) < FROZEN["window"] + FROZEN["min_candidates"]:
            continue

        resolved_total += resolve_open_trades(pair, bars, log, FROZEN)
        new = scan_pair(pair, bars, log, FROZEN)
        if new:
            log["trades"].append(new)
            new_signals += 1
            print(f"  [new] {pair:<8} {new['direction']} @ {new['entry_price']:.5f}  "
                  f"sl={new['sl_price']:.5f} tp={new['tp_price']:.5f}  {new['entry_date']}")

        state = compute_shape_state(pair, bars, FROZEN)
        if state:
            shape_states.append(state)

    save_log(log)
    save_shape_state(shape_states)
    open_n = sum(1 for t in log["trades"] if t["status"] == "open")
    closed = [t for t in log["trades"] if t["status"] != "open"]
    wins = sum(1 for t in closed if t.get("r", 0) > 0)
    total_r = sum(t.get("r", 0) for t in closed)
    print(f"\n[paper_track] as_of={args.as_of or 'latest available (static local snapshot)'}  "
          f"new_signals={new_signals}  resolved_this_run={resolved_total}  "
          f"currently_open={open_n}  closed={len(closed)} (wins={wins}, total_R={total_r:.2f})  "
          f"total_logged={len(log['trades'])}")
    if not args.as_of:
        print("[note] no --as-of given: this ran against the static local snapshot, NOT live data. "
              "See this file's module docstring for the data-access blocker and how to wire in a "
              "real feed.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is all 26")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--as-of", default=None,
                   help="ISO date -- truncate data as if this were 'now'. TESTING/REPLAY ONLY; "
                        "omit for real forward use once a live data source is wired in.")
    p.add_argument("--refresh-data", action="store_true",
                   help="pull fresh OANDA bars (refresh_m1.py) before scanning -- needs OANDA_KEY "
                        "and a network path to OANDA (Railway, not this sandbox). The trade log "
                        "uses R2 automatically whenever R2_ACCESS_KEY/R2_SECRET_KEY are set, "
                        "independent of this flag.")
    args = p.parse_args()
    run(args)


if __name__ == "__main__":
    main()
