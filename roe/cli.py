"""Command line: python -m roe  (see roe/README.md). Reads are GET only. The ONLY write to the server is the explicit --push (one POST of the finished run);
nothing is written outside --out otherwise."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from . import loaders as L
from .config import load_config
from .inputs import load_sources
from .scan import run_scan
from .snapshot import SnapshotConflict

DEFAULT_BASE = "https://macrofxmodel-production.up.railway.app"


def _doc(args, name, url_attr, file_attr, path, errors, base, optional=False):
    f, u = getattr(args, file_attr), getattr(args, url_attr)
    if f:
        try:
            return Path(f).read_bytes()
        except OSError as e:
            errors[f"fetch:{name}"] = str(e)
            return None
    if args.offline:
        return None
    try:
        return L.fetch_bytes(u or (base + path))
    except Exception as e:  # noqa: BLE001
        if not optional:
            errors[f"fetch:{name}"] = f"{type(e).__name__}: {e}"
        else:
            errors[f"fetch:{name}"] = f"{type(e).__name__}: {e} (optional)"
        return None


def _push(run_dir, base_url) -> int:
    from .push import PushError, push_run
    try:
        r = push_run(run_dir, base_url=base_url)
    except PushError as e:
        print(f"PUSH FAILED: {e}", file=sys.stderr)
        return 4
    print(f"push: {r.get('status')} (run {r.get('runId')})")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m roe", description="ROE P1 opportunity scanner (observation only).")
    ap.add_argument("--asof", help="as-of date YYYY-MM-DD (default: today, UTC). Every loader is truncated to it.")
    ap.add_argument("--out", default="roe_out", help="output root (default roe_out/, gitignored)")
    ap.add_argument("--sources", help="sources json (default roe/sources.default.json); copy and edit for the laptop")
    ap.add_argument("--root", help="repo root the relative source paths resolve against (default: this checkout)")
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--state-url"); ap.add_argument("--state-file")
    ap.add_argument("--hit-rates-url"); ap.add_argument("--hit-rates-file")
    ap.add_argument("--desk-pack-url"); ap.add_argument("--desk-pack-file")
    ap.add_argument("--data-health-url"); ap.add_argument("--data-health-file")
    ap.add_argument("--offline", action="store_true", help="no GETs: local files and --*-file documents only (state is then missing: status failed)")
    ap.add_argument("--fixtures", action="store_true", help="run on the built-in synthetic fixtures (no files, no network)")
    ap.add_argument("--lookback", type=int, help="sessions to back-evaluate for episodes (default from config)")
    ap.add_argument("--run-id", help="force a run id (an existing id with different inputs is an error)")
    ap.add_argument("--push", action="store_true", help="after the scan, POST the run to the server (needs env ROE_PUSH_TOKEN; a repeat of the same run changes nothing)")
    ap.add_argument("--push-only", metavar="RUN_DIR", help="do not scan: push this existing roe_out/<runId>/ folder (use after a failed push)")
    ap.add_argument("--now", help="ISO UTC time to use as 'now' (tests / replays)")
    ap.add_argument("--no-desk-pack", action="store_true", help="skip the 2.7 MB /api/desk-pack GET")
    args = ap.parse_args(argv)
    if args.push_only:
        return _push(args.push_only, args.base_url)

    now = dt.datetime.fromisoformat(args.now.replace("Z", "")) if args.now else dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    asof = args.asof or str(now.date())
    cfg = load_config()
    errors: dict = {}
    try:
        if args.fixtures:
            from .fixtures import make_fixture_inputs
            inputs = make_fixture_inputs(asof, cfg)
            res = run_scan(asof=asof, out_dir=args.out, cfg=cfg, inputs=inputs, now_utc=now, run_id=args.run_id, lookback=args.lookback, commit="auto")
        else:
            base = args.base_url.rstrip("/")
            state = _doc(args, "api_state", "state_url", "state_file", "/api/state", errors, base)
            hit = _doc(args, "api_hit_rates", "hit_rates_url", "hit_rates_file", "/api/vol-forecast/hit-rates", errors, base, optional=True)
            dh = _doc(args, "api_data_health", "data_health_url", "data_health_file", "/api/data-health", errors, base, optional=True)
            dp = None if args.no_desk_pack else _doc(args, "api_desk_pack", "desk_pack_url", "desk_pack_file", "/api/desk-pack", errors, base, optional=True)
            sources = load_sources(args.sources, args.root)
            res = run_scan(asof=asof, out_dir=args.out, cfg=cfg, sources=sources, state_raw=state, hit_rates_raw=hit, desk_pack_raw=dp,
                           data_health_raw=dh, now_utc=now, run_id=args.run_id, lookback=args.lookback, fetch_errors=errors,
                           required_docs=() if args.offline else ("api_state",))
    except SnapshotConflict as e:
        print(f"CONFLICT: {e}", file=sys.stderr)
        return 3
    print(json.dumps({k: v for k, v in res.items() if k not in ("top10",)}, indent=2))
    pushed = _push(res["dir"], args.base_url) if args.push and res.get("dir") else 0
    if res.get("noop"):
        print("already recorded: same run id and same inputs, nothing written")
    return 2 if res["status"] == "failed" else pushed


if __name__ == "__main__":
    sys.exit(main())
