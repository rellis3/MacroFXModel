#!/usr/bin/env python3
"""motif_rule_sweep.py — one-factor-at-a-time review of the touch-motif ENTRY
RULES on the causal (fixed) detector, 2026-09-28.

Why this exists: once the detector lookahead was fixed (pylego/motif_touch.py
`_touch_runs`), the live best-config book went from PF 1.25 to 0.95 OOS, and
the 2-touch signal averages ~0R per trade BEFORE costs. The obvious next
question -- "is there a different timeframe / horizon / stop / entry that
works?" -- is also the fastest route to a curve-fit, so this script fixes the
protocol before looking:

  * SELECTION on in-sample only: 2016-01-01 .. 2022-12-31.
  * A variant is a CANDIDATE only if, in-sample and net of retail spread,
    PF >= 1.10 on >= 1000 trades AND PF > 1.0 in at least 5 of the 7
    in-sample calendar years.
  * Out-of-sample (2023-01-01 ..) is printed for every variant for
    completeness, but only a CANDIDATE's OOS figure counts as evidence, and
    the number of variants tried is printed beside it (multiple testing:
    with ~40 variants, one IS PF >= 1.10 is roughly what chance delivers).

Every variant changes ONE thing from the baseline (the live rule set, with
the 20-pip stop expressed as 1.27 x ATR14 so it transfers across timeframes
and instruments -- the FX book's own median ratio). Trades are resolved on
the M1 path with a compact first-touch walker (same semantics as
pylego.barrier_race.race_trades_on_finer_path: ties to the target, timeout
marked to the last close). Costs: RETAIL_SPREAD_PIPS / INDEX_RETAIL_SPREAD_PTS
/ modelled gold spread, charged once per trade in R of that trade's stop.

Entry modes:
  close   -- the live rule: signal on a bar CLOSE through a line, market
             entry at the first M1 open after that bar (+ `delay_min`).
  stop    -- a resting stop order at each line from the moment the 2nd touch
             is knowable: filled at the line (or the M1 open if it gapped
             through) the first minute price TRADES through it -- "why wait
             for the hour?" as a rule.

  python AnalogML/motif_rule_sweep.py                    # FX + gold, all variants
  python AnalogML/motif_rule_sweep.py --indices          # index CFDs instead
  python AnalogML/motif_rule_sweep.py --variants base,tf15,tf30
"""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pattern_scan import M1_DIR  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.motif_policy import INDEX_RETAIL_SPREAD_PTS, RETAIL_SPREAD_PIPS  # noqa: E402
from pylego.motif_touch import detect_touch_motifs  # noqa: E402
from pylego.swing_structure import atr as compute_atr  # noqa: E402

FX_GOLD = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]
INDICES = ["nq", "spx500", "de30", "us30", "uk100", "us2000"]
IS_START, OOS_START = "2016-01-01", "2023-01-01"

BASE = dict(tf="1h", pivot_n=5, tol=1.2, retrace=2.5, min_between=10, horizon=40,
            k_sl=1.27, tp_r=1.5, max_bars=200, mode="close", delay_min=0)

# ONE change each. Names are what the report prints.
VARIANTS = {
    "base": {},
    "tf15": {"tf": "15min"}, "tf30": {"tf": "30min"}, "tf4h": {"tf": "4h"},
    "horizon10": {"horizon": 10}, "horizon20": {"horizon": 20}, "horizon80": {"horizon": 80},
    "retrace1.5": {"retrace": 1.5}, "retrace3.5": {"retrace": 3.5},
    "tol0.6": {"tol": 0.6}, "tol2.0": {"tol": 2.0},
    "pivot3": {"pivot_n": 3}, "pivot8": {"pivot_n": 8},
    "sl0.75atr": {"k_sl": 0.75}, "sl2atr": {"k_sl": 2.0}, "sl3atr": {"k_sl": 3.0},
    "tp1.0": {"tp_r": 1.0}, "tp2.0": {"tp_r": 2.0}, "tp3.0": {"tp_r": 3.0},
    "delay5": {"delay_min": 5}, "delay15": {"delay_min": 15}, "delay60": {"delay_min": 60},
    "stop_entry": {"mode": "stop"},
}


def _retail_spread_price(pair: str) -> float:
    pip = pip_size(pair)
    if pair in INDEX_RETAIL_SPREAD_PTS:
        return INDEX_RETAIL_SPREAD_PTS[pair] * pip
    if pair in RETAIL_SPREAD_PIPS:
        return RETAIL_SPREAD_PIPS[pair] * pip
    return default_spread(pair)


def _first_touch(hi, lo, cl, s, e, d, entry, sl, tp_dist):
    """(r_gross, exit_minute) walking M1 minutes [s, e). Ties -> target,
    matching race_trades_on_finer_path's pessimistic_ties=False."""
    if e <= s:
        return None
    h, l = hi[s:e], lo[s:e]
    if d > 0:
        tp_hit, sl_hit = h >= entry + tp_dist, l <= entry - sl
    else:
        tp_hit, sl_hit = l <= entry - tp_dist, h >= entry + sl
    it = int(np.argmax(tp_hit)) if tp_hit.any() else None
    isl = int(np.argmax(sl_hit)) if sl_hit.any() else None
    if it is not None and (isl is None or it <= isl):
        return tp_dist / sl, s + it
    if isl is not None:
        return -1.0, s + isl
    return d * (cl[e - 1] - entry) / sl, e - 1


def _pair_worker(job):
    pair, variant_names, cfgs = job
    m1 = pd.read_parquet(M1_DIR / f"{pair}_m1.parquet", columns=["open", "high", "low", "close"])
    m1 = m1[m1.index >= pd.Timestamp(IS_START, tz=m1.index.tz)]
    f_idx = m1.index
    op, hi, lo, cl = (m1[c].to_numpy() for c in ("open", "high", "low", "close"))
    spread = _retail_spread_price(pair)
    oos_ts = pd.Timestamp(OOS_START, tz=f_idx.tz)
    bars_cache: dict = {}
    det_cache: dict = {}
    out = {}
    for name in variant_names:
        c = cfgs[name]
        if c["tf"] not in bars_cache:
            b = m1.resample(c["tf"]).agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
            bars_cache[c["tf"]] = (b, compute_atr(b, 14))
        bars, atr_arr = bars_cache[c["tf"]]
        dkey = (c["tf"], c["pivot_n"], c["tol"], c["retrace"], c["min_between"], c["horizon"])
        if dkey not in det_cache:
            det_cache[dkey] = detect_touch_motifs(
                bars, atr_arr, pivot_n=c["pivot_n"], tol_atr_mult=c["tol"],
                min_retrace_atr_mult=c["retrace"], min_bars_between_touches=c["min_between"],
                breakout_max_bars=c["horizon"])
        motifs = det_cache[dkey]
        h_idx = bars.index
        period = pd.Timedelta(c["tf"])
        n = len(bars)
        rows = []
        for m in motifs:
            if c["mode"] == "close":
                if m.confirm_idx is None or m.confirm_idx + 1 >= n:
                    continue
                d = m.direction
                sl = c["k_sl"] * atr_arr[m.confirm_idx]
                t_sig = h_idx[m.confirm_idx] + period + pd.Timedelta(minutes=c["delay_min"])
                s = int(f_idx.searchsorted(t_sig, side="left"))
                if s >= len(op):
                    continue
                entry = op[s]
                end_bar = m.confirm_idx + 1 + c["max_bars"]
            else:
                # Resting stops at both lines once the 2nd touch is knowable
                # (its bar + pivot_n closes), live until the horizon ends.
                last = m.touch_idxs[-1]
                start_bar = last + c["pivot_n"]
                stop_bar = min(last + c["horizon"], n - 1)
                if start_bar >= n or stop_bar < start_bar:
                    continue
                s0 = int(f_idx.searchsorted(h_idx[start_bar], side="left"))
                s1 = int(f_idx.searchsorted(h_idx[stop_bar] + period, side="left"))
                if s1 <= s0:
                    continue
                up = max(m.level, m.touch_level)      # the line above
                dn = min(m.level, m.touch_level)      # the line below
                hu = hi[s0:s1] >= up
                ld = lo[s0:s1] <= dn
                iu = int(np.argmax(hu)) if hu.any() else None
                idn = int(np.argmax(ld)) if ld.any() else None
                if iu is None and idn is None:
                    continue
                if idn is None or (iu is not None and iu < idn):
                    d, s = 1, s0 + iu
                    entry = max(up, op[s])            # gapped through -> the open
                else:
                    d, s = -1, s0 + idn
                    entry = min(dn, op[s])
                sig_bar = int(h_idx.searchsorted(f_idx[s], side="right")) - 1
                sl = c["k_sl"] * atr_arr[max(sig_bar - 1, 0)]  # ATR known before the trigger bar
                end_bar = sig_bar + c["max_bars"]
            if not np.isfinite(sl) or sl <= 0:
                continue
            e = (int(f_idx.searchsorted(h_idx[end_bar], side="left")) if end_bar < n else len(op))
            if end_bar >= n:
                continue   # not enough forward runway -- same as min_bars_ahead dropping it
            res = _first_touch(hi, lo, cl, s, e, d, entry, sl, sl * c["tp_r"])
            if res is None:
                continue
            r_gross, _ = res
            ts = f_idx[s]
            rows.append((ts.value // 10**9, 1 if ts >= oos_ts else 0, float(r_gross),
                         float(spread / sl), int(d), int(m.n_touches), int(m.is_top),
                         int(bool(m.played_out)) if m.played_out is not None else -1,
                         ts.hour, ts.dayofweek))
        out[name] = rows
    return pair, out


def _pf(r):
    r = np.asarray(r)
    loss = -r[r < 0].sum()
    return float(r[r > 0].sum() / loss) if loss > 0 else float("nan")


def summarize(rows):
    a = np.asarray(rows, dtype=float) if rows else np.zeros((0, 10))
    net = a[:, 2] - a[:, 3] if len(a) else np.zeros(0)
    gross = a[:, 2] if len(a) else np.zeros(0)
    is_ = a[:, 1] == 0 if len(a) else np.zeros(0, bool)
    years = pd.to_datetime(a[:, 0], unit="s").year if len(a) else np.zeros(0)
    yr_pf = {int(y): _pf(net[(years == y)]) for y in sorted(set(years))}
    is_years = [y for y in yr_pf if y < int(OOS_START[:4])]
    return {
        "is": {"n": int(is_.sum()), "pf": _pf(net[is_]), "avg": float(net[is_].mean()) if is_.any() else None,
               "gross_avg": float(gross[is_].mean()) if is_.any() else None},
        "oos": {"n": int((~is_).sum()), "pf": _pf(net[~is_]), "avg": float(net[~is_].mean()) if (~is_).any() else None,
                "gross_avg": float(gross[~is_].mean()) if (~is_).any() else None},
        "is_years_pf_gt1": sum(1 for y in is_years if yr_pf[y] > 1.0),
        "is_years": len(is_years),
        "year_pf": yr_pf,
    }


def is_candidate(s):
    return (s["is"]["n"] >= 1000 and s["is"]["pf"] >= 1.10
            and s["is_years_pf_gt1"] >= 5)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--indices", action="store_true")
    ap.add_argument("--variants", default=",".join(VARIANTS))
    ap.add_argument("--pairs", default=None, help="comma-separated override of the pair list")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", default=str(REPO_ROOT / "AnalogML" / "data" / "motif_rule_sweep.json"))
    a = ap.parse_args()
    names = a.variants.split(",")
    cfgs = {n: {**BASE, **VARIANTS[n]} for n in names}
    pairs = a.pairs.split(",") if a.pairs else (INDICES if a.indices else FX_GOLD)
    by_var = {n: [] for n in names}
    with ProcessPoolExecutor(a.workers) as ex:
        for pair, out in ex.map(_pair_worker, [(p, names, cfgs) for p in pairs]):
            for n, rows in out.items():
                by_var[n].extend(rows)
            print(f"  {pair} done", flush=True)
    report = {"protocol": {"is": [IS_START, OOS_START], "candidate": "IS net PF>=1.10, n>=1000, PF>1 in >=5/7 IS years",
                           "variants_tried": len(names), "pairs": pairs, "base": BASE},
              "variants": {}}
    print(f"\n{'variant':<12}{'IS n':>7}{'IS PF':>7}{'IS avgR':>9}{'IS gross':>9}{'yrs>1':>6}"
          f"{'OOS n':>7}{'OOS PF':>7}{'OOS avgR':>9}  cand")
    for n in names:
        s = summarize(by_var[n])
        s["candidate"] = is_candidate(s)
        s["cfg"] = cfgs[n]
        report["variants"][n] = s
        print(f"{n:<12}{s['is']['n']:>7}{s['is']['pf']:>7.3f}{s['is']['avg']:>+9.4f}{s['is']['gross_avg']:>+9.4f}"
              f"{s['is_years_pf_gt1']:>4}/{s['is_years']}{s['oos']['n']:>7}{s['oos']['pf']:>7.3f}{s['oos']['avg']:>+9.4f}"
              f"  {'YES' if s['candidate'] else ''}")
    # Slices of the BASE population (no new race): the obvious post-hoc
    # "only take X" questions, reported on the same IS/OOS footing.
    if "base" in by_var:
        rows = np.asarray(by_var["base"], dtype=float)
        slices = {
            "textbook (played_out)": rows[:, 7] == 1, "failure breakout": rows[:, 7] == 0,
            "tops": rows[:, 6] == 1, "bottoms": rows[:, 6] == 0,
            "2-touch": rows[:, 5] == 2, "3-touch": rows[:, 5] == 3,
            "Asia 22-06 UTC": (rows[:, 8] >= 22) | (rows[:, 8] < 6),
            "London 06-12": (rows[:, 8] >= 6) & (rows[:, 8] < 12),
            "NY 12-17": (rows[:, 8] >= 12) & (rows[:, 8] < 17),
            "late 17-22": (rows[:, 8] >= 17) & (rows[:, 8] < 22),
        }
        report["base_slices"] = {}
        print(f"\nBASE slices (post-hoc -- same caution applies)")
        for lab, mask in slices.items():
            s = summarize(rows[mask].tolist())
            s["candidate"] = is_candidate(s)
            report["base_slices"][lab] = s
            print(f"{lab:<24}{s['is']['n']:>7}{s['is']['pf']:>7.3f}{s['is']['avg']:>+9.4f}"
                  f"{s['is_years_pf_gt1']:>4}/{s['is_years']}{s['oos']['n']:>7}{s['oos']['pf']:>7.3f}{s['oos']['avg']:>+9.4f}"
                  f"  {'YES' if s['candidate'] else ''}")
    n_cand = sum(1 for v in report["variants"].values() if v["candidate"])
    print(f"\n{n_cand} candidate(s) of {len(names)} variants (+ {len(report.get('base_slices', {}))} slices)")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(report, default=float), encoding="utf-8")


if __name__ == "__main__":
    main()
