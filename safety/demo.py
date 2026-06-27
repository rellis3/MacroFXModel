"""
demo / CLI — see the kill switch and risk gate work, with zero risk.

This talks to NOTHING real: no MT5, no dashboard, no live account. It uses a
fake account so you can watch the gate allow and deny orders, and flip the
global kill switch by hand.

    python -m safety.demo status              # show current kill state + a risk summary
    python -m safety.demo on  [--flatten]     # engage the kill switch
    python -m safety.demo off                 # release the kill switch
    python -m safety.demo simulate            # run a few orders through the gate

State is written under safety/state/ (gitignored). Engaging the switch here only
affects this demo until a bot is wired to read the same KillSwitch — see README.
"""

from __future__ import annotations

import argparse

from .kill_switch import KillSwitch
from .risk_gate import RiskGate, RiskLimits, OrderIntent, Position, AccountSnapshot


def _fake_account(equity=10_000.0) -> AccountSnapshot:
    return AccountSnapshot(
        equity=equity,
        balance=equity,
        positions=[
            Position(magic=20260001, symbol="EURUSD", side="BUY",
                     volume=0.5, notional=55_000, risk_bucket="risk_on"),
        ],
    )


def cmd_status(_args) -> int:
    ks = KillSwitch()
    st = ks.state()
    print("Kill switch:")
    if st is None:
        print("  state UNREADABLE -> treated as ACTIVE (fail-closed)")
    else:
        print(f"  active={st.active}  mode={st.mode}  by={st.updated_by!r}  "
              f"reason={st.reason!r}")
    gate = RiskGate(RiskLimits(), ks)
    print("\nRisk summary (fake account @ $10,000):")
    for k, v in gate.status(_fake_account()).items():
        print(f"  {k:22} {v}")
    return 0


def cmd_on(args) -> int:
    mode = "flatten" if args.flatten else "halt"
    st = KillSwitch().activate(reason=args.reason, mode=mode, by="demo-cli")
    print(f"KILL SWITCH ENGAGED  mode={st.mode}  reason={st.reason!r}")
    if mode == "flatten":
        print("  (mode=flatten signals bots to CLOSE open positions, not just halt)")
    return 0


def cmd_off(_args) -> int:
    KillSwitch().deactivate(by="demo-cli")
    print("kill switch released — trading would resume")
    return 0


def cmd_simulate(_args) -> int:
    gate = RiskGate(RiskLimits(daily_loss_pct=4.0, max_total_notional=100_000),
                    KillSwitch())
    print("Running sample orders through the gate (fake account):\n")

    cases = [
        ("normal buy",                OrderIntent(20260001, "GBPUSD", "BUY", 0.1,
                                                  notional=12_000, bar_time="b1")),
        ("same order again (dupe)",   OrderIntent(20260001, "GBPUSD", "BUY", 0.1,
                                                  notional=12_000, bar_time="b1")),
        ("would breach exposure cap", OrderIntent(20260004, "XAUUSD", "BUY", 1.0,
                                                  notional=60_000, bar_time="b2")),
    ]
    for label, intent in cases:
        d = gate.check(intent, _fake_account())
        verdict = "ALLOW" if d.allowed else f"DENY [{d.code}]"
        print(f"  {label:28} -> {verdict}  {d.reason}")
    print("\n(Engage the kill switch with `python -m safety.demo on` then re-run "
          "to see everything denied.)")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="safety.demo", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(func=cmd_status)
    on = sub.add_parser("on")
    on.add_argument("--flatten", action="store_true",
                    help="signal bots to close positions, not just halt entries")
    on.add_argument("--reason", default="manual")
    on.set_defaults(func=cmd_on)
    sub.add_parser("off").set_defaults(func=cmd_off)
    sub.add_parser("simulate").set_defaults(func=cmd_simulate)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
