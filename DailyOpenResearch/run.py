"""
Daily-Open research suite - runner.

    python3 -m DailyOpenResearch.run --pairs gold,nq,eurusd [--anchor broker]

Writes DailyOpenResearch/out/<pair>/results.json and REPORT.md.
"""
from __future__ import annotations
import argparse, json, os, time
import numpy as np
from .data import load_m1, Days, INSTRUMENTS, HERE, ANCHORS
from .news import flag_days
from .studies_profile import hourly_profile, minutes_since_open_profile, anchor_comparison
from .studies_orb import orb_study
from .studies_open import open_level_study
from .studies_fib import fib_study
from .studies_vwap import vwap_study
from .studies_session import asia_range_study, prior_levels_study
from .studies_mtf import mtf_first_candle_study
from .report import write_report


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def run_pair(pair: str, anchor: str = "broker", anchors_to_compare=("broker", "london23", "utc22", "london00", "tokyo", "london08")):
    t0 = time.time()
    print(f"== {pair} ==")
    df = load_m1(pair)
    days = Days(df, anchor)
    ccys = ("USD", "EUR") if pair == "eurusd" else ("USD",)
    days.news = flag_days(days, ccys)
    n_news = sum(1 for f in days.news if f)
    meta = {"pair": pair, "label": INSTRUMENTS[pair]["label"], "anchor": anchor, "anchor_def": ANCHORS[anchor],
            "bars": int(len(df)), "from": str(df.index[0]), "to": str(df.index[-1]), "days": int(days.n),
            "adr20_median": float(np.nanmedian(days.adr20)), "cost_assumed": INSTRUMENTS[pair]["cost"],
            "major_news_days": n_news, "news_ccys": list(ccys)}
    res = {"meta": meta}
    steps = [
        ("anchor_comparison", lambda: anchor_comparison(df, list(anchors_to_compare))),
        ("hourly_profile_uk", lambda: hourly_profile(df, "Europe/London")),
        ("minutes_since_open", lambda: minutes_since_open_profile(days)),
        ("orb", lambda: orb_study(days, pair)),
        ("open_level", lambda: open_level_study(days)),
        ("fib", lambda: fib_study(days, pair)),
        ("vwap", lambda: vwap_study(days, pair)),
        ("asia_range", lambda: asia_range_study(days, pair)),
        ("prior_levels", lambda: prior_levels_study(days)),
        ("mtf_first_candle", lambda: mtf_first_candle_study(days)),
    ]
    for name, fn in steps:
        t = time.time()
        res[name] = fn()
        print(f"  {name:<20} {time.time() - t:6.1f}s")
    out_dir = os.path.join(HERE, "out", pair)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=_json_default)
    write_report(res, os.path.join(out_dir, "REPORT.md"))
    print(f"  done in {time.time() - t0:.0f}s -> {out_dir}")
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", default="gold,nq,eurusd")
    ap.add_argument("--anchor", default="broker")
    a = ap.parse_args()
    for p in a.pairs.split(","):
        run_pair(p.strip(), a.anchor)


if __name__ == "__main__":
    main()
