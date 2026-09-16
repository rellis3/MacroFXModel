#!/usr/bin/env python3
"""motif_confluence_study.py — does any Level-Atlas-style CONFLUENCE separate
winning motif alerts from losing ones, and does stacking several help?

The Level Atlas vote book scores a touch across 31 context dimensions (session,
volatility regime, how price arrived, WaveTrend state, HTF trend, and so on)
and trades the majority lean. That book is built from ITS OWN touches against
ITS OWN ladder rungs, so it cannot be pointed at a motif alert directly: the
cells are keyed by (side, rung) and a motif has no rung. What IS transferable
is the METHOD — compute the same kind of context at each entry, bucket it, and
ask whether any bucket separates outcomes.

This script does exactly that for the 30k motif alert trades, and it is built
to FAIL HONESTLY. With ~20 dimensions x several buckets each, something will
look good on any one sample by chance, so nothing is reported as a finding
unless it survives a real out-of-sample check:

  1. A bucket is CHOSEN on in-sample evidence alone: it must clear `--min-n`
     IS trades and beat the IS baseline by `--min-edge`. Out-of-sample plays
     no part in choosing it.
  2. `confirms_oos` then reports, separately, whether it also beat the OOS
     baseline. That is the verification, never a filter — an earlier draft
     required it for selection and then graded the stack on OOS, which is
     circular: OOS had already picked the buckets being scored, inflating the
     dose-response for free. Every bucket is reported with its numbers either
     way rather than being quietly dropped.
  3. The confluence stack counts, per trade, how many IS-chosen buckets it sits
     in, and grades that count on OOS — a genuine out-of-sample read. If
     confluence is real, OOS PF rises with the count. If it does not, the study
     says so.

Nothing here changes the trading system. It measures whether a filter WOULD
have helped; deciding to apply one is a separate call with its own costs
(every filter throws trades away, and the drawdown that matters is the one you
actually sit through).

Dimensions are computed from the same H1 bars the backtest races, strictly at
or before the CONFIRM bar -- entry is the next bar's open, so a feature read on
the confirm bar is knowable. HTF features go through
`pylego.indicators.vumanchu.align_htf_causal`, which step-holds a slow series
onto the fast grid by CLOSE time; forward-filling by start time would leak up
to a full HTF bar of future into every row and make any MTF result look
spectacular for purely mechanical reasons.

Deliberately NOT computed, because the inputs do not exist here: `ivRegime`,
`vrp`, `ivSkewDir` (CME implied vol), `prevCloseLoc` (forecast bands),
`confluence` / `ordinal` / `prevOutcome*` / `otherSideTouchedBefore` (all keyed
to Level Atlas's own touch identity). Claiming those without their data would
be inventing dimensions, not porting them.

Usage:
  python AnalogML/motif_confluence_study.py --all-pairs
  python AnalogML/motif_confluence_study.py --pairs gbpusd,gbpcad --min-n 100
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from motif_alert_backtest import ALL_PAIRS, FROZEN, _motif_key  # noqa: E402
from pattern_scan import load_m1_and_bars  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from motif_features import APPROACH_BARS, bucket_trade, compute_features  # noqa: E402
from pylego.barrier_race import Entry, race_trades_on_finer_path  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.json_safe import json_safe  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402
from pylego.trade_stats import summarize_r  # noqa: E402

IS_OOS_CUTOFF = "2023-01-01"
DATA_DIR = Path(__file__).resolve().parent / "data"


def build_pair_rows(pair: str, args: argparse.Namespace) -> list[dict]:
    """One row per raced motif alert: its R, plus every confluence bucket."""
    # M1 resolution, matching motif_alert_backtest -- the two feed the same
    # page, so a bucket's PF here has to mean what a trade's R means there.
    m1, bars = load_m1_and_bars(pair, args.timeframe)
    n = len(bars)
    atr_arr = compute_atr(bars, period=args.atr_period)
    motifs = detect_touch_motifs(
        bars, atr_arr, pivot_n=args.pivot_n, tol_atr_mult=args.tol_atr_mult,
        min_retrace_atr_mult=args.min_retrace_atr_mult,
        min_bars_between_touches=args.min_bars_between_touches,
        breakout_max_bars=args.breakout_max_bars)
    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    confirmed = [m for m in motifs if m.confirm_idx is not None and m.confirm_idx + 1 < n]
    raced = race_trades_on_finer_path(
        bars, m1, [Entry(idx=m.confirm_idx + 1, direction=m.direction) for m in confirmed],
        sl=sl_price, tp_r=args.tp_r, max_bars_ahead=args.max_bars_ahead,
        cost_price=default_spread(pair), min_bars_ahead=args.min_bars_ahead)
    by_entry = {t["idx"]: t for t in raced}
    f = compute_features(pair, bars, args)
    cutoff = pd.Timestamp(IS_OOS_CUTOFF, tz=bars.index.tz)

    rows = []
    for m in confirmed:
        t = by_entry.get(m.confirm_idx + 1)
        if t is None:
            continue
        entry_date = bars.index[m.confirm_idx + 1]
        buckets = bucket_trade(f, m.confirm_idx, m.direction, float(m.level), pip)
        # Motif-native dimensions -- free, and the ones most likely to matter.
        buckets["n_touches"] = f"{m.n_touches}_touch"
        buckets["side"] = "top" if m.is_top else "bottom"
        buckets["played_out"] = "textbook" if m.played_out else "failure"
        rows.append({
            "pair": pair, "motif_key": _motif_key(pair, m),
            "entry_date": entry_date.isoformat(),
            "r": round(t["r"], 4),
            "split": "OOS" if entry_date >= cutoff else "IS",
            "buckets": buckets,
        })
    return rows


def _max_dd_r(rows: list[dict]) -> float | None:
    """Peak-to-trough drawdown, in R, of the additive equity path — trades in
    ENTRY order, each contributing its own R. Additive (never reinvested) to
    match the basis motif-alert-backtest.html leads with, so a drawdown quoted
    here and one quoted there mean the same thing. Returns a negative number."""
    if not rows:
        return None
    cum = peak = 0.0
    worst = 0.0
    for r in sorted(rows, key=lambda x: x["entry_date"]):
        cum += r["r"]
        peak = max(peak, cum)
        worst = min(worst, cum - peak)
    return round(worst, 2)


def grade(rows: list[dict], key=lambda r: r["r"]) -> dict:
    s = summarize_r([key(r) for r in rows])
    return {"n": s["n"], "pf": s["profit_factor"], "avg_r": s["avg_r"],
            "win_rate": s["win_rate"], "total_r": round(s["total_r"], 2),
            "max_dd_r": _max_dd_r(rows)}


def single_exclusions(rows: list[dict], base_oos: dict, min_n: int = 500) -> list[dict]:
    """For every bucket big enough to matter: what happens to OOS profit and
    OOS drawdown if you simply never take those trades? Reported for all of
    them, ranked by drawdown improvement, so a bucket that cuts drawdown at an
    unacceptable cost in total R is visible rather than only the flattering
    ones."""
    oos = [r for r in rows if r["split"] == "OOS"]
    base_r, base_dd = base_oos["total_r"], base_oos["max_dd_r"]
    seen, out = set(), []
    for r in rows:
        for dim, bucket in r["buckets"].items():
            seen.add((dim, bucket))
    for dim, bucket in sorted(seen):
        kept = [x for x in oos if x["buckets"].get(dim) != bucket]
        dropped = len(oos) - len(kept)
        if dropped < min_n or not kept:
            continue
        g = grade(kept)
        out.append({
            "dim": dim, "bucket": bucket, "dropped": dropped,
            "kept_pct": round(len(kept) / len(oos), 4),
            "oos": g,
            "total_r_delta": round(g["total_r"] - base_r, 1),
            "max_dd_delta": round((g["max_dd_r"] or 0) - (base_dd or 0), 1),
        })
    # Best drawdown improvement first (max_dd is negative, so larger = shallower).
    out.sort(key=lambda x: -x["max_dd_delta"])
    return out


def study(rows: list[dict], args: argparse.Namespace) -> dict:
    """Grade every dimension x bucket on IS, verify on OOS, then score the
    stack of IS-chosen winners against OOS."""
    is_rows = [r for r in rows if r["split"] == "IS"]
    oos_rows = [r for r in rows if r["split"] == "OOS"]
    base_is, base_oos = grade(is_rows), grade(oos_rows)

    by_dim: dict = defaultdict(lambda: defaultdict(lambda: {"IS": [], "OOS": []}))
    for r in rows:
        for dim, bucket in r["buckets"].items():
            by_dim[dim][bucket][r["split"]].append(r)

    dims_out, holding = [], []
    for dim in sorted(by_dim):
        buckets = []
        for bucket in sorted(by_dim[dim]):
            g = by_dim[dim][bucket]
            gi, go = grade(g["IS"]), grade(g["OOS"])
            enough_is = gi["n"] >= args.min_n
            enough = enough_is and go["n"] >= args.min_n
            pf_is = gi["pf"] if gi["pf"] is not None and np.isfinite(gi["pf"]) else np.nan
            pf_oos = go["pf"] if go["pf"] is not None and np.isfinite(go["pf"]) else np.nan
            beats_is = np.isfinite(pf_is) and pf_is >= base_is["pf"] + args.min_edge
            beats_oos = np.isfinite(pf_oos) and pf_oos >= base_oos["pf"] + args.min_edge
            # SELECTION IS IN-SAMPLE ONLY. An earlier draft required the bucket
            # to beat OOS as well and then graded the confluence stack on OOS --
            # circular, because OOS had already been used to pick the very
            # buckets being scored, which inflates the stack's apparent
            # dose-response for free. `chosen` therefore looks at IS alone;
            # `confirms_oos` is reported beside it as the verification, never
            # as a filter.
            chosen = bool(enough_is and beats_is)
            rec = {"bucket": bucket, "is": gi, "oos": go,
                   "beats_is": bool(beats_is), "confirms_oos": bool(beats_oos),
                   "enough_is_n": bool(enough_is), "enough_oos_n": bool(enough),
                   "chosen_on_is": chosen,
                   "holds": bool(chosen and beats_oos)}
            buckets.append(rec)
            if chosen:
                holding.append((dim, bucket))
        dims_out.append({"dim": dim, "buckets": buckets})

    # ── the stack: how many IS-CHOSEN buckets does each trade sit in? ────
    # The count uses buckets picked on in-sample evidence alone, so grading it
    # on OOS below is a genuine out-of-sample read rather than a restatement of
    # the selection.
    hold_set = set(holding)
    for r in rows:
        r["_conf"] = sum(1 for dim, b in r["buckets"].items() if (dim, b) in hold_set)
    max_conf = max((r["_conf"] for r in rows), default=0)
    stack = []
    for k in range(0, max_conf + 1):
        at_least = [r for r in rows if r["_conf"] >= k]
        stack.append({
            "min_confluences": k,
            "all": grade(at_least),
            "is": grade([r for r in at_least if r["split"] == "IS"]),
            "oos": grade([r for r in at_least if r["split"] == "OOS"]),
            "kept_pct": round(len(at_least) / len(rows), 4) if rows else None,
        })
    return {
        "baseline": {"is": base_is, "oos": base_oos, "all": grade(rows)},
        "dimensions": dims_out,
        "holding_buckets": [{"dim": d, "bucket": b} for d, b in holding],
        "stack": stack,
        # Single-dimension EXCLUSIONS, graded with drawdown. The stack answers
        # "does piling confluences up help"; this answers the blunter and often
        # more useful question -- is there one bucket whose removal alone cuts
        # the drawdown without costing the profit? Graded on OOS, and the
        # bucket list comes from the dimension table above, so nothing extra is
        # fitted here.
        "single_exclusions": single_exclusions(rows, base_oos),
        # Per-trade meta, keyed by the same motif_key the trade export carries,
        # so a viewer can apply any of these filters itself instead of
        # re-deriving features it does not have. Compact on purpose -- one
        # short array per trade, not an object:
        #   [confluence_count, touches, swing_regime]  where swing_regime is
        #   0 range / 1 with-trend / 2 against-trend.
        # A key absent from this map was not part of the study run.
        "trade_meta": {r["motif_key"]: [
            r["_conf"],
            2 if r["buckets"]["n_touches"] == "2_touch" else 3,
            {"range": 0, "with": 1, "against": 2}.get(r["buckets"].get("swing_regime"), 0),
        ] for r in rows},
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None)
    p.add_argument("--all-pairs", action="store_true")
    p.add_argument("--timeframe", default="1h")
    for k, v in FROZEN.items():
        p.add_argument(f"--{k.replace('_', '-')}", type=type(v), default=v)
    p.add_argument("--htf-ema", type=int, default=50)
    p.add_argument("--vol-lookback", type=int, default=500)
    p.add_argument("--min-n", type=int, default=200,
                   help="minimum trades in EACH of IS and OOS before a bucket can hold")
    p.add_argument("--min-edge", type=float, default=0.05,
                   help="PF a bucket must add over its own half's baseline, in BOTH halves")
    p.add_argument("--is-oos-cutoff", default=IS_OOS_CUTOFF)
    p.add_argument("--out", default=str(DATA_DIR / "motif_confluence_study.json"))
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS
    rows: list[dict] = []
    for pair in pairs:
        pr = build_pair_rows(pair, args)
        rows.extend(pr)
        print(f"  {pair:<8} {len(pr):>5} trades")

    res = study(rows, args)
    b = res["baseline"]
    print(f"\n[baseline] all n={b['all']['n']} PF={b['all']['pf']:.3f} | "
          f"IS PF={b['is']['pf']:.3f} | OOS PF={b['oos']['pf']:.3f}")
    print(f"[holds]    {len(res['holding_buckets'])} bucket(s) beat baseline by "
          f">={args.min_edge} in BOTH halves at n>={args.min_n}")
    for hb in res["holding_buckets"]:
        d = next(x for x in res["dimensions"] if x["dim"] == hb["dim"])
        rec = next(x for x in d["buckets"] if x["bucket"] == hb["bucket"])
        print(f"           {hb['dim']}={hb['bucket']:<18} "
              f"IS PF={rec['is']['pf']:.3f} (n={rec['is']['n']})  "
              f"OOS PF={rec['oos']['pf']:.3f} (n={rec['oos']['n']})")
    print("\n[stack] OOS PF by how many holding buckets a trade sits in:")
    for s in res["stack"]:
        o = s["oos"]
        if o["n"]:
            print(f"   >={s['min_confluences']:<2} kept {s['kept_pct']:>6.1%}  "
                  f"OOS n={o['n']:<6} PF={o['pf']:.3f}  avgR={o['avg_r']:+.4f}  "
                  f"totalR={o['total_r']:>8.1f}  maxDD={o['max_dd_r']:>7.1f}R")

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "params": {"pairs": pairs, "min_n": args.min_n, "min_edge": args.min_edge,
                   "is_oos_cutoff": args.is_oos_cutoff, "approach_bars": APPROACH_BARS,
                   "sl_pips": args.sl_pips, "tp_r": args.tp_r},
        "caveat": (
            "Confluence SCREEN over the motif alert trades, in the spirit of the Level Atlas vote "
            "book but NOT its book: those cells are keyed to that ladder's own (side, rung) and "
            "cannot be pointed at a motif. Dimensions are recomputed here from the same H1 bars, "
            "strictly at or before the confirm bar, with HTF features step-held causally by close "
            "time (align_htf_causal) -- forward-filling by start time would leak a whole HTF bar of "
            "future into every row. Buckets are CHOSEN on in-sample only and must clear their own "
            "half's baseline by --min-edge in BOTH halves at --min-n to be marked as holding; "
            "everything that fails is still reported with its numbers rather than dropped. The "
            "stack row grades IS-chosen buckets against OOS, which is the only honest read of "
            "whether stacking confluences helps. ivRegime/vrp/ivSkewDir/prevCloseLoc/confluence/"
            "ordinal/prevOutcome* are NOT computed -- their inputs do not exist here, and inventing "
            "them would not be porting them. This measures whether a filter WOULD have helped; it "
            "changes nothing about the system."
        ),
        **res,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as fh:
        json.dump(json_safe(out), fh)
    print("\n[single exclusions] OOS effect of never taking one bucket "
          f"(baseline totalR={b['oos']['total_r']:.1f}, maxDD={b['oos']['max_dd_r']:.1f}R):")
    for x in res["single_exclusions"][:8]:
        print(f"   drop {x['dim']}={x['bucket']:<14} keeps {x['kept_pct']:>5.1%}  "
              f"PF={x['oos']['pf']:.3f}  totalR={x['oos']['total_r']:>7.1f} "
              f"({x['total_r_delta']:+.1f})  maxDD={x['oos']['max_dd_r']:>6.1f}R "
              f"({x['max_dd_delta']:+.1f})")
    print(f"\n[export] {len(rows)} trades, {len(res['dimensions'])} dimensions -> {out_path}")


if __name__ == "__main__":
    main()
