#!/usr/bin/env python3
"""MD files/COT_POSITIONING_FACTOR_TEST.md — the registered confirmatory cell.

Design FROZEN in that doc before any COT history was fetched. This script only
implements it; it introduces no choices of its own.

  signal  : OI-normalised spec net, rolling-156w z          (from the backfill)
  target  : forward 4-week log return, open-to-open
  join    : signal's `tradableFrom` (report Tue -> following Mon open)
  cell    : pooled Spearman rank-IC, OOS only, two-sided
  signif  : block bootstrap (meanBlock=4) — overlapping weekly windows make a
            plain t-test invalid
  PASS    : 95% CI excludes zero AND same sign in both OOS halves AND >=6 of 8
            instruments qualify

Usage:
    python3 analysis/cot_factor/factor_test.py <cot_factor_history_v1.json>
    python3 analysis/cot_factor/factor_test.py --selftest     # synthetic join proof
"""
import json
import math
import os
import random
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
M1_DIR = os.path.join(HERE, "..", "..", "VolRangeForecaster", "data", "m1")

# Frozen in the pre-registration.
FWD_WEEKS = 4
OOS_START = "2018-01-01"
OOS_MID = "2022-01-01"
MIN_QUALIFYING = 6
BOOT_BLOCK = 4
BOOT_N = 10_000
SEED = 20260822  # date-derived, not tuned


# ── weekly price series: Monday opens ────────────────────────────────────────
def weekly_monday_opens(pair):
    """First traded price of each ISO week, indexed by that week's Monday.

    Reads the M1 parquet and takes the FIRST bar of each ISO week — if a Monday
    is a holiday the week's first available bar is used, which is what a trader
    holding "from Monday's open" would actually get.
    """
    df = pd.read_parquet(os.path.join(M1_DIR, f"{pair}_m1.parquet"), columns=["open"])
    iso = df.index.isocalendar()
    key = iso.year.astype(str) + "-W" + iso.week.astype(str).str.zfill(2)
    first = df.groupby(key.values)["open"].first()
    # label each ISO week by its Monday date
    monday = {}
    for k, ts in df.groupby(key.values).apply(lambda g: g.index[0]).items():
        monday[k] = (ts - pd.Timedelta(days=int(ts.dayofweek))).normalize()
    out = pd.DataFrame({"open": first})
    out["monday"] = [monday[k] for k in out.index]
    return out.set_index("monday")["open"].sort_index()


def fwd_returns(px, weeks=FWD_WEEKS):
    """Forward `weeks`-week log return, open-to-open, on the weekly series."""
    return (px.shift(-weeks) / px).apply(lambda v: math.log(v) if v and v > 0 else float("nan"))


# ── statistics (mirrors js/statsCore.js) ─────────────────────────────────────
def spearman(x, y):
    return pd.Series(x).rank().corr(pd.Series(y).rank())


def block_bootstrap_ci(x, y, block=BOOT_BLOCK, n=BOOT_N, seed=SEED, lo=2.5, hi=97.5):
    """Percentile CI for the rank-IC, resampling contiguous blocks to preserve
    the autocorrelation the overlapping forward windows induce."""
    rng = random.Random(seed)
    m = len(x)
    if m < block * 3:
        return (float("nan"), float("nan"))
    nblocks = max(1, m // block)
    stats = []
    for _ in range(n):
        xi, yi = [], []
        for _ in range(nblocks):
            s = rng.randrange(0, m - block + 1)
            xi.extend(x[s:s + block])
            yi.extend(y[s:s + block])
        ic = spearman(xi, yi)
        if ic == ic:
            stats.append(ic)
    stats.sort()
    if not stats:
        return (float("nan"), float("nan"))
    return (stats[int(lo / 100 * len(stats))], stats[min(len(stats) - 1, int(hi / 100 * len(stats)))])


# ── the join ─────────────────────────────────────────────────────────────────
def build_panel(hist, price_loader=weekly_monday_opens):
    """One row per (instrument, tradable week): z + forward return."""
    rows, report = [], []
    for sym, rec in hist["instruments"].items():
        if rec.get("error"):
            report.append((sym, 0, False, "fetch error"))
            continue
        px = price_loader(rec["pair"])
        fwd = fwd_returns(px)
        ser = pd.DataFrame(rec["series"])
        ser = ser[ser["z"].notna()]
        ser["t"] = pd.to_datetime(ser["t"]).dt.tz_localize(px.index.tz)
        # join the signal to the week it FIRST becomes tradable
        joined = ser.set_index("t").join(fwd.rename("fwd"), how="inner")
        joined = joined[joined["fwd"].notna()]
        n = len(joined)
        report.append((sym, n, bool(rec.get("qualifies")), rec.get("contractName", "")))
        for t, r in joined.iterrows():
            rows.append({"sym": sym, "date": t, "z": r["z"], "fwd": r["fwd"]})
    return pd.DataFrame(rows), report


def run(hist, price_loader=weekly_monday_opens, verbose=True):
    panel, report = build_panel(hist, price_loader)
    if verbose:
        print("instrument coverage (joined weeks with a forward return):")
        for sym, n, q, name in report:
            print(f"  {sym:5s} n={n:5d}  qualifies={q}  {name}")
    n_qual = sum(1 for _, _, q, _ in report if q)

    oos = panel[panel.date >= OOS_START].sort_values("date")
    if verbose:
        print(f"\npanel: {len(panel)} rows total, OOS {len(oos)} rows "
              f"({panel.date.min().date() if len(panel) else '-'} → "
              f"{panel.date.max().date() if len(panel) else '-'})")
    if len(oos) < 50:
        print("insufficient OOS rows — cannot evaluate")
        return None

    ic = spearman(oos.z.tolist(), oos.fwd.tolist())
    lo, hi = block_bootstrap_ci(oos.z.tolist(), oos.fwd.tolist())
    h1 = oos[oos.date < OOS_MID]
    h2 = oos[oos.date >= OOS_MID]
    ic1 = spearman(h1.z.tolist(), h1.fwd.tolist())
    ic2 = spearman(h2.z.tolist(), h2.fwd.tolist())
    stable = bool((ic1 > 0) == (ic2 > 0))
    excl0 = bool((lo > 0 and hi > 0) or (lo < 0 and hi < 0))
    verdict = bool(excl0 and stable and n_qual >= MIN_QUALIFYING)

    print(f"\nCONFIRMATORY CELL (pooled OOS rank-IC, two-sided)")
    print(f"  rank-IC = {ic:+.4f}   95% block-bootstrap CI [{lo:+.4f}, {hi:+.4f}]")
    print(f"  halves: 2018-2021 {ic1:+.4f} | 2022-2026 {ic2:+.4f}  same-sign={stable}")
    print(f"  qualifying instruments: {n_qual}/8 (bar: >={MIN_QUALIFYING})")
    print(f"  PASS BAR: CI excludes 0 [{excl0}] AND halves agree [{stable}] AND "
          f"qualify>={MIN_QUALIFYING} [{n_qual >= MIN_QUALIFYING}] -> "
          f"{'PASS' if verdict else 'FAIL'}")
    if verdict:
        theory = "hedging-pressure premium (FOLLOW specs)" if ic > 0 else "crowding (FADE extremes)"
        print(f"  sign maps to: {theory}")
    print("\nper-instrument OOS rank-IC (descriptive, no pass/fail weight):")
    for sym, g in oos.groupby("sym"):
        print(f"  {sym:5s} n={len(g):5d}  IC={spearman(g.z.tolist(), g.fwd.tolist()):+.4f}")
    return verdict


# ── self-test: prove the join and the statistics on synthetic data ───────────
def selftest():
    """No CFTC data needed. Builds a synthetic COT history with a KNOWN
    embedded relationship and checks the pipeline recovers it — and that a
    zero-signal control comes back null. Proves the join before any real run."""
    import numpy as np
    rng = np.random.default_rng(7)
    weeks = pd.date_range("2010-01-04", "2026-05-01", freq="W-MON", tz="UTC")

    def synth(effect):
        insts, prices = {}, {}
        for sym in ["EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "GOLD"]:
            z = rng.normal(size=len(weeks))
            # forward 4w return = effect*z + noise  (effect<0 == fade/crowding)
            fwd = effect * z + rng.normal(scale=0.02, size=len(weeks))
            # integrate fwd into a price path the loader can read back
            lvl = np.exp(np.cumsum(np.concatenate([[0], fwd[:-1]]) / FWD_WEEKS))
            prices[sym] = pd.Series(lvl, index=weeks)
            insts[sym] = {
                "sym": sym, "pair": sym.lower(), "qualifies": True,
                "contractName": "SYNTH", "scoredWeeks": len(weeks),
                "series": [{"d": str(d.date()), "t": str(d.date()), "sh": 0.1,
                            "z": float(zz), "p": 50.0} for d, zz in zip(weeks, z)],
            }
        return {"instruments": insts}, prices

    for label, effect, expect in [("negative (fade)", -0.05, True),
                                  ("zero (control)", 0.0, False)]:
        hist, prices = synth(effect)
        loader = lambda pair, _p=prices: _p[pair.upper()]
        print(f"\n{'=' * 60}\nSELF-TEST — embedded effect: {label}\n{'=' * 60}")
        got = run(hist, price_loader=loader, verbose=False)
        ok = (got is True) if expect else (got is False)
        # (run() now returns a plain bool, so identity is safe)
        print(f"  self-test expectation: {'detect' if expect else 'null'} -> "
              f"{'OK' if ok else 'MISMATCH'}")
        if not ok:
            raise SystemExit("SELF-TEST FAILED — fix the harness before trusting a real run")
    print("\nself-test passed: the harness detects a real effect and reports null on noise.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
    elif len(sys.argv) > 1:
        run(json.load(open(sys.argv[1])))
    else:
        print(__doc__)
