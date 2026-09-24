"""
TEST A -- is the GEX range finding just event days?
TEST B -- does G3's wall edge predict next-day direction? (lesson slide 28)

Pre-registration: oi_research_book/G3_AND_EVENTDAY_PREREG.md (commit 0afafbb,
written and committed BEFORE this ran). Verdict rules are fixed there and applied
mechanically at the bottom of each section.

Usage: .venv/Scripts/python.exe oi_research_book/scripts/20_eventday_and_g3.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from pathlib import Path
from scipy import stats as sps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "results"
OUT.mkdir(parents=True, exist_ok=True)
CAL = ROOT.parent / "data" / "calendar" / "ff_calendar_2007_2025.csv"

_s = importlib.util.spec_from_file_location(
    "s18", Path(__file__).with_name("18_gex_range_brownian.py"))
s18 = importlib.util.module_from_spec(_s)
_s.loader.exec_module(s18)

RNG = np.random.default_rng(20260924)

# G3 constants -- taken from cog-replication/engine/cogShadow.js::computeG3, unchanged
DOMINANCE_RATIO = 1.2
MIN_EDGE_PCT = 0.15


# ============================================================ shared
def vol_matched_delta(df, n_strata=5):
    """Weighted mean of the within-trailing-vol-stratum short-minus-long DR gap.
    Same estimator as script 19, so Test A's number is comparable to the headline."""
    df = df.copy()
    if df["rv20_ann"].nunique() < n_strata:
        return None
    df["st"] = pd.qcut(df["rv20_ann"], n_strata, labels=False, duplicates="drop")
    num = den = 0.0
    for _, g in df.groupby("st"):
        s = g["is_short"].to_numpy()
        if s.sum() < 10 or (~s).sum() < 10:
            continue
        d = g["dr"].to_numpy()
        num += (d[s].mean() - d[~s].mean()) * len(g)
        den += len(g)
    return float(num / den) if den else None


# ============================================================ TEST A
def opex_dates(start, end):
    """Third Friday of each month -- computed, not scraped."""
    out = []
    for ts in pd.date_range(start, end, freq="MS"):
        fridays = pd.date_range(ts, ts + pd.offsets.MonthEnd(0), freq="W-FRI")
        if len(fridays) >= 3:
            out.append(fridays[2].normalize())
    return set(out)


def load_event_days():
    cal = pd.read_csv(CAL)
    cal["dt"] = pd.to_datetime(cal["DateTime"], utc=True, format="mixed")
    usd = cal[cal["Currency"] == "USD"]
    wanted = ["Federal Funds Rate", "CPI m/m", "Core CPI m/m",
              "Non-Farm Employment Change"]
    ev = usd[usd["Event"].isin(wanted)]
    days = set(ev["dt"].dt.tz_convert("UTC").dt.normalize().dt.tz_localize(None))
    cal_end = cal["dt"].max().tz_convert("UTC").tz_localize(None).normalize()
    return days, cal_end, ev["Event"].value_counts().to_dict()


def test_a():
    df, counts = s18.build("near", "rv20_ann", "net_gex_sum")
    df["date"] = pd.to_datetime(df["date"])
    ev_days, cal_end, ev_counts = load_event_days()
    ev_days |= opex_dates(df["date"].min(), min(df["date"].max(), cal_end))

    # PRE-REGISTERED: drop the uncovered tail rather than assume it event-free
    covered = df[df["date"] <= cal_end].copy()
    dropped_tail = len(df) - len(covered)

    # The RANGE happens at t+1 -> exclude when the NEXT day is an event day
    nxt = covered["date"].shift(-1)
    covered["next_is_event"] = nxt.isin(ev_days)
    covered = covered[nxt.notna()]

    clean = covered[~covered["next_is_event"]]
    dirty = covered[covered["next_is_event"]]

    d_all = vol_matched_delta(covered)
    d_clean = vol_matched_delta(clean)
    d_dirty = vol_matched_delta(dirty)

    if d_clean is None:
        verdict = "INCONCLUSIVE"
    elif d_clean >= 0.10:
        verdict = "SURVIVES"
    elif d_clean < 0.05:
        verdict = "CONFOUNDED"
    else:
        verdict = "PARTIAL"

    print("=" * 72)
    print("TEST A -- event-day confound")
    print("=" * 72)
    print(f"  calendar ends {cal_end.date()}; dropped uncovered tail: {dropped_tail} rows")
    print(f"  event days matched: {ev_counts}")
    print(f"  covered rows {len(covered)}  ->  clean {len(clean)}, event {len(dirty)}")
    print(f"  vol-matched dDR, covered subset (all)   = {d_all:+.4f}"
          if d_all else "  n/a")
    print(f"  vol-matched dDR, NON-EVENT days only    = {d_clean:+.4f}"
          if d_clean is not None else "  n/a")
    print(f"  vol-matched dDR, EVENT days only        = "
          f"{d_dirty:+.4f}" if d_dirty is not None else "  event-only: too few")
    print(f"  (headline on the full 793-day frame was +0.3154)")
    print(f"\n  >>> TEST A VERDICT: {verdict}")
    return {"verdict": verdict, "cal_end": str(cal_end.date()),
            "dropped_tail_rows": int(dropped_tail),
            "n_covered": int(len(covered)), "n_clean": int(len(clean)),
            "n_event": int(len(dirty)),
            "dDR_covered_all": d_all, "dDR_non_event": d_clean,
            "dDR_event_only": d_dirty, "event_counts": ev_counts}


# ============================================================ TEST B
def build_g3(surface="near"):
    """Reconstruct G3's displacement exactly as cogShadow.js computes it."""
    df = pd.read_parquet(DATA / f"daily_master_{surface}_nas100_usd.parquet").copy()
    df["date"] = pd.to_datetime(df["date"])

    cw, pw = df["call_wall_a"], df["put_wall_a"]
    coi, poi = df["call_wall_a_oi"].fillna(0), df["put_wall_a_oi"].fillna(0)

    call_dom = coi >= poi * DOMINANCE_RATIO
    put_dom = poi >= coi * DOMINANCE_RATIO
    dom = np.where(call_dom, cw, np.where(put_dom, pw, np.nan))
    df["dom_side"] = np.where(call_dom, "CALL", np.where(put_dom, "PUT", None))
    df["dominant"] = dom
    df["edge_pct"] = (df["dominant"] - df["spot"]) / df["spot"] * 100.0

    # G3 state, same branches as the engine
    df["g3_state"] = "VALID"
    df.loc[df["dominant"].isna(), "g3_state"] = "NEUTRAL_balanced"
    df.loc[df["edge_pct"].abs() < MIN_EDGE_PCT, "g3_state"] = "NEUTRAL_pinned"
    df.loc[df["spot"].isna() | (df["spot"] <= 0), "g3_state"] = "INVALID"
    return df


def hit_rate_ci(hits, n):
    if n == 0:
        return None, None
    p = hits / n
    se = np.sqrt(p * (1 - p) / n)
    return p, (p - 1.96 * se, p + 1.96 * se)


def test_b():
    df = build_g3()
    total = len(df)
    valid = df[(df["g3_state"] == "VALID") & df["fwd_ret_1d"].notna()].copy()
    valid = valid.sort_values("date").reset_index(drop=True)

    # population accounting -- what fraction was silently excluded, and where
    pop = df["g3_state"].value_counts().to_dict()

    split = int(len(valid) * 0.60)
    parts = {"IS": valid.iloc[:split], "OOS": valid.iloc[split:]}

    print("\n" + "=" * 72)
    print("TEST B -- G3 wall-magnet direction")
    print("=" * 72)
    print(f"  population: {total} days -> {pop}")
    print(f"  tradable (VALID): {len(valid)} ({len(valid)/total*100:.1f}% of days)")
    print(f"  chronological 60/40 split at {valid.iloc[split]['date'].date()}")

    res = {}
    for name, part in parts.items():
        e, r = part["edge_pct"].to_numpy(), part["fwd_ret_1d"].to_numpy()
        hits = int((np.sign(e) == np.sign(r)).sum())
        hr, ci = hit_rate_ci(hits, len(e))
        ic, icp = sps.spearmanr(e, r)
        res[name] = {"n": len(e), "hit_rate": round(hr, 4),
                     "ci95": [round(c, 4) for c in ci],
                     "spearman_ic": round(float(ic), 4), "ic_p": round(float(icp), 4)}
        print(f"\n  {name}: n={len(e)}  hit={hr*100:.1f}% "
              f"(95% CI {ci[0]*100:.1f}-{ci[1]*100:.1f})  "
              f"IC={ic:+.4f} (p={icp:.3f})")

    # bucket test -- lesson slide 28
    print("\n  bucket test (mean next-day return %, by edge_pct):")
    edges = [-np.inf, -1.5, -0.5, 0.5, 1.5, np.inf]
    labels = ["< -1.5", "-1.5..-0.5", "-0.5..0.5", "0.5..1.5", "> 1.5"]
    buckets = {}
    for name, part in parts.items():
        part = part.copy()
        part["b"] = pd.cut(part["edge_pct"], edges, labels=labels)
        g = part.groupby("b", observed=False)["fwd_ret_1d"].agg(["count", "mean"])
        buckets[name] = {str(k): {"n": int(v["count"]),
                                  "mean_ret_pct": round(float(v["mean"]) * 100, 4)
                                  if pd.notna(v["mean"]) else None}
                         for k, v in g.iterrows()}
        row = "  ".join(f"{lab}:{(g.loc[lab,'mean']*100):+.3f}%(n{int(g.loc[lab,'count'])})"
                        for lab in labels if g.loc[lab, "count"] > 0)
        print(f"    {name}: {row}")

    # placebo -- block-shuffle edge_pct against dates
    e = valid["edge_pct"].to_numpy()
    r = valid["fwd_ret_1d"].to_numpy()
    ix = s18.stationary_bootstrap_idx(len(e), 1, 10, RNG)[0]
    pl_hits = int((np.sign(e[ix]) == np.sign(r)).sum())
    pl_hr, _ = hit_rate_ci(pl_hits, len(e))
    print(f"\n  placebo (block-shuffled edge): hit={pl_hr*100:.1f}%  "
          f"pass={0.48 <= pl_hr <= 0.52}")

    # costs / feasibility -- NQ spread vs the daily move being traded
    atr = valid["atr14"].median()
    spot = valid["spot"].median()
    spread_pts = 2.0          # NQ CFD typical, stated as an assumption not a measurement
    feas = spread_pts / atr
    print(f"  feasibility: spread {spread_pts}pts / ATR14 {atr:.1f} = {feas:.4f} "
          f"({'PASS' if feas <= 0.15 else 'DEAD'} vs the 0.15 gate)")

    oos = res["OOS"]
    staircase_ok = None
    b = buckets["OOS"]
    lo = b.get("< -1.5", {}).get("mean_ret_pct")
    hi = b.get("> 1.5", {}).get("mean_ret_pct")
    if lo is not None and hi is not None:
        staircase_ok = hi > lo          # predicted: wall above spot -> higher return

    if oos["hit_rate"] >= 0.55 and oos["n"] >= 100 and oos["spearman_ic"] > 0 and staircase_ok:
        verdict = "SUPPORTED"
    elif (0.48 <= oos["hit_rate"] <= 0.52) or oos["spearman_ic"] <= 0 or staircase_ok is False:
        verdict = "NULL"
    else:
        verdict = "INCONCLUSIVE"
    print(f"\n  >>> TEST B VERDICT: {verdict}")

    return {"verdict": verdict, "population": {k: int(v) for k, v in pop.items()},
            "n_valid": int(len(valid)), "splits": res, "buckets": buckets,
            "placebo_hit_rate": round(pl_hr, 4),
            "feasibility": {"spread_pts_assumed": spread_pts,
                            "atr14_median": round(float(atr), 2),
                            "spread_over_atr": round(float(feas), 4)},
            "staircase_predicted_direction": staircase_ok}


def main():
    a = test_a()
    b = test_b()
    payload = {"generated": pd.Timestamp.now("UTC").isoformat(),
               "prereg": "G3_AND_EVENTDAY_PREREG.md",
               "test_a_eventday": a, "test_b_g3": b}
    (OUT / "eventday_and_g3.json").write_text(json.dumps(payload, indent=2, default=str))
    print(f"\nwrote {OUT / 'eventday_and_g3.json'}")


if __name__ == "__main__":
    main()
