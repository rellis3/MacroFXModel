"""Read-only MT5 symbol/point-value scanner — run this on the trading
machine (needs the real MetaTrader5 terminal + package) to check what a
broker actually calls a given pair BEFORE guessing a broker_symbols/
point_values override, instead of finding out from a live order failure
or a startup log line.

Never places an order, never writes any config. Just connects, pulls the
account's full symbol list via MT5's own symbols_get(), and reuses
Mt5Broker.verify_symbols()/verify_point_values() -- the SAME checks that
already run at every bot's own startup -- so this can never disagree with
what the bot itself would find, and lets you check ahead of a restart.

Usage (run on the trading PC, in this repo's own venv):
    python -m pylego.broker.scan_symbols --bot fib_atlas_bot
    python -m pylego.broker.scan_symbols --bot fib_atlas_bot --pairs nq,spx,de30,uk100,us2000,dow
    python -m pylego.broker.scan_symbols --bot volatility_bot_v2 --url http://localhost:3000

`--bot` picks which {bot}_credentials KV key to connect with (bots on the
same MT5 account, like fib_atlas_bot and fib_atlas_bot_v2, will always
agree -- only need to run it once per distinct account, not once per bot).
Default `--pairs` is the 6 indices + gold, since those are the ones this
repo has already found broker-specific naming/point-value surprises for
-- pass your own list to check anything else.
"""
from __future__ import annotations

import argparse
import os
import sys

from pylego import instruments as I
from pylego import point_values as PV
from pylego.kv import KvClient

DEFAULT_PAIRS = ["gold", "nq", "spx", "de30", "uk100", "us2000", "dow"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Read-only MT5 symbol/point-value scan — no orders, no config writes")
    ap.add_argument("--bot", required=True,
                     choices=["fib_atlas_bot", "fib_atlas_bot_v2", "volatility_bot_v2", "volatility_bot_v3"],
                     help="which bot's own {bot}_credentials to connect with")
    ap.add_argument("--url", default=os.environ.get("DASHBOARD_URL", "http://localhost:3000"), help="dashboard base URL")
    ap.add_argument("--pairs", default=",".join(DEFAULT_PAIRS), help="comma-separated pairs to check (default: indices + gold)")
    args = ap.parse_args()
    pairs = [p.strip().lower() for p in args.pairs.split(",") if p.strip()]

    kv = KvClient(args.url)
    creds = kv.get_json(f"{args.bot}_credentials") or {}
    if not creds.get("mt5_account"):
        print(f"no mt5_account in {args.bot}_credentials — nothing to connect to", file=sys.stderr)
        sys.exit(1)

    from pylego.broker.mt5 import Mt5Broker
    broker = Mt5Broker(magic=0, symbol_resolver=I.mt5_symbol, pip_resolver=I.pip_size)
    if not broker.available:
        print("MetaTrader5 package not available on this machine — run this ON the trading PC, in this repo's own venv", file=sys.stderr)
        sys.exit(1)
    if not broker.connect(creds["mt5_account"], creds.get("mt5_password"), creds.get("mt5_server"), creds.get("mt5_path") or None):
        print("broker connect failed", file=sys.stderr)
        sys.exit(1)

    try:
        print(f"Connected: account={creds['mt5_account']} server={creds.get('mt5_server')}\n")
        print(f"Checking {len(pairs)} pair(s): {', '.join(pairs)}\n")

        sym_problems = broker.verify_symbols(pairs)
        print("── Symbol names ─────────────────────────────────────────")
        if not sym_problems:
            print(f"  OK — all {len(pairs)} resolve to a real symbol on this account (registry default, no override needed)")
        for p in sym_problems:
            sugg = ", ".join(p["suggestions"]) if p["suggestions"] else "no close match found"
            print(f"  {p['pair']}: registry default {p['configured']!r} NOT found — closest matches: {sugg}")

        print("\n── Point values ($/pip/lot) ─────────────────────────────")
        pv_problems = broker.verify_point_values(pairs)
        if not pv_problems:
            print(f"  OK — all checkable pair(s) match pylego/point_values.json's assumption")
        for p in pv_problems:
            print(f"  {p['pair']} ({p['symbol']}): assumed ${p['assumed']}/pip/lot, real ${p['real']}/pip/lot ({p['ratio']}x off)")

        if sym_problems or pv_problems:
            print(f"\nNothing written automatically. To fix a symbol name, add it to {args.bot}'s own\n"
                  "'Broker Symbols' card in bot-config.html. Point values have no UI field yet (2026-09-28)\n"
                  "-- the config field (`point_values`) and the code that reads it both already exist,\n"
                  "same pattern as broker_symbols, just ask Claude to set the value directly via KV\n"
                  "(same as it did for gold on this account) or add the UI card.")
    finally:
        broker.shutdown()


if __name__ == "__main__":
    main()
