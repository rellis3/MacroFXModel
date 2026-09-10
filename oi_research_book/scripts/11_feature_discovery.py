#!/usr/bin/env python3
"""Feature-discovery pass for the break-vs-reject classifier (queued next
step #2), scoped down from a much larger question list to the handful of
checks that are (a) not already answered by this book and (b) actually
feasible from committed/local data without R2 access:

  1. Volume/OI quadrant at the touched strike -- `volume` was flagged in the
     2026-09-10 audit as loaded but used in ZERO calculations anywhere in
     this book. Before it goes into a classifier, it gets one honest look.
  2. ΔOI percentile at the touched strike -- was this wall built by a big
     recent OI-change day, or has it just been sitting there? Different
     question from Part 9's continuous z-score (already null).
  3. Session split (Asia/London/NY) of the touch outcome.
  4. Prior-momentum control -- does the outcome differ from a plain "was
     price already trending into the touch" baseline, so a classifier can't
     just be rediscovering momentum with extra steps.

NOT done here (explicitly blocked, not skipped silently): DTE-conditional
touch behaviour needs the per-expiry DTE of the specific touched wall, which
isn't in any committed/local file -- only the near-dated AGGREGATE surface
(which can mix 2 expiries) is available without re-running 01 against the
raw R2 CSV. Queued as a follow-up once back on a machine with R2 access.

Deliberately NOT run: a calendar/day-of-week/week-of-month/month sweep
(Q78-101 of the originating question list) -- flagged as a real multiple-
testing trap with low prior, and not needed to build the classifier.

Output: oi_research_book/data/results/feature_discovery_*.csv
"""
import numpy as np
import pandas as pd
from scipy import stats

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
M1_PATH = "VolRangeForecaster/data/m1/eurusd_m1.parquet"
HORIZONS = [15, 60]  # the two horizons where Part 9b/12's clustering-corrected effect actually lives


def load_touches():
    te = pd.read_csv(f"{RES}/intraday_touch_events.csv", parse_dates=["date", "touch_ts"])
    te["date"] = pd.to_datetime(te["date"]).dt.tz_localize(None)
    if te["touch_ts"].dt.tz is not None:
        te["touch_ts"] = te["touch_ts"].dt.tz_localize(None)
    return te


def add_volume_oi_context(te):
    surf = pd.read_parquet(f"{DATA}/surface_near.parquet")
    surf["date"] = pd.to_datetime(surf["date"]).dt.tz_localize(None)
    call_cols = surf[["date", "strike", "call_vol", "call_oi", "call_oi_chg"]].rename(
        columns={"strike": "level", "call_vol": "vol", "call_oi": "oi", "call_oi_chg": "oi_chg"})
    put_cols = surf[["date", "strike", "put_vol", "put_oi", "put_oi_chg"]].rename(
        columns={"strike": "level", "put_vol": "vol", "put_oi": "oi", "put_oi_chg": "oi_chg"})
    call_cols["side"] = "call"
    put_cols["side"] = "put"
    ctx = pd.concat([call_cols, put_cols], ignore_index=True)
    out = te.merge(ctx, on=["date", "level", "side"], how="left")
    out["vol_oi_ratio"] = out["vol"] / out["oi"].replace(0, np.nan)
    return out


def add_session(te):
    h = te["touch_ts"].dt.hour
    # simple, non-overlapping UTC buckets -- not claiming to match any single
    # desk's exact session convention, just a reasonable 3-way split.
    te["session"] = np.select(
        [h < 7, (h >= 7) & (h < 13), h >= 13],
        ["asia", "london", "ny"], default="asia")
    return te


def add_momentum_and_vol(te):
    m1 = pd.read_parquet(M1_PATH).reset_index().rename(columns={"datetime": "ts"})
    m1["ts"] = pd.to_datetime(m1["ts"]).dt.tz_localize(None)
    m1 = m1.sort_values("ts").set_index("ts")
    closes = m1["close"]
    rets = np.log(closes / closes.shift(1))

    def prior_ret(ts, minutes):
        idx = closes.index.searchsorted(ts)
        if idx <= minutes or idx >= len(closes):
            return np.nan
        return closes.iloc[idx] / closes.iloc[idx - minutes] - 1

    def pre_touch_vol(ts, minutes=60):
        idx = closes.index.searchsorted(ts)
        if idx <= minutes or idx >= len(closes):
            return np.nan
        return rets.iloc[idx - minutes:idx].std()

    te["prior_ret_60m"] = te["touch_ts"].apply(lambda t: prior_ret(t, 60))
    te["prior_ret_240m"] = te["touch_ts"].apply(lambda t: prior_ret(t, 240))
    # CAUSAL: realized vol from the 60 minutes strictly BEFORE the touch, never
    # the touch's own forward window -- this is what turned out to explain the
    # apparent session effect below.
    te["pre_vol_60m"] = te["touch_ts"].apply(pre_touch_vol)
    return te


def chi2_reject_rate(df, group_col, outcome_col):
    sub = df.dropna(subset=[group_col, outcome_col])
    if sub[group_col].nunique() < 2 or len(sub) < 20:
        return None
    tab = pd.crosstab(sub[group_col], sub[outcome_col])
    if tab.shape[0] < 2 or tab.shape[1] < 2:
        return None
    chi2, p, _, _ = stats.chi2_contingency(tab)
    rates = sub.groupby(group_col)[outcome_col].apply(lambda s: (s == "reject").mean() * 100)
    counts = sub.groupby(group_col).size()
    return {"p_chi2": p, "n_total": len(sub), **{f"reject_pct[{k}]": v for k, v in rates.items()},
            **{f"n[{k}]": v for k, v in counts.items()}}


def main():
    te = load_touches()
    te = add_volume_oi_context(te)
    te = add_session(te)
    te = add_momentum_and_vol(te)
    te["oi_chg_abs_pct"] = te["oi_chg"].abs().rank(pct=True)
    te["oi_chg_extreme"] = pd.cut(te["oi_chg_abs_pct"], [0, 0.75, 0.90, 1.0],
                                   labels=["below_p75", "p75_p90", "above_p90"])
    te["pre_vol_tercile"] = pd.qcut(te["pre_vol_60m"], 3, labels=["low_vol", "mid_vol", "high_vol"])
    te.to_csv(f"{RES}/feature_discovery_enriched_touches.csv", index=False)
    print(f"n touches: {len(te)}  (call={sum(te.side=='call')}, put={sum(te.side=='put')})")
    print(f"vol_oi_ratio available for {te['vol_oi_ratio'].notna().sum()} touches "
          f"({te['vol_oi_ratio'].notna().mean()*100:.0f}%)")

    rows = []

    # 1. Volume/OI quadrant -----------------------------------------------
    med_vol = te["vol"].median()
    te["vol_tier"] = np.where(te["vol"] >= med_vol, "high_vol", "low_vol")
    te["oi_chg_dir"] = np.where(te["oi_chg"] >= 0, "rising_oi", "falling_oi")
    te["vol_oi_quadrant"] = te["vol_tier"] + "_" + te["oi_chg_dir"]
    for h in HORIZONS:
        oc = f"outcome_{h}m"
        r = chi2_reject_rate(te, "vol_oi_quadrant", oc)
        if r: rows.append({"check": "volume_oi_quadrant", "horizon_min": h, **r})

    # 2. ΔOI percentile at the touched strike -------------------------------
    for h in HORIZONS:
        oc = f"outcome_{h}m"
        r = chi2_reject_rate(te, "oi_chg_extreme", oc)
        if r: rows.append({"check": "oi_chg_percentile", "horizon_min": h, **r})

    # 3. Session -------------------------------------------------------------
    for h in HORIZONS:
        oc = f"outcome_{h}m"
        r = chi2_reject_rate(te, "session", oc)
        if r: rows.append({"check": "session", "horizon_min": h, **r})

    quad_df = pd.DataFrame(rows)
    quad_df.to_csv(f"{RES}/feature_discovery_categorical.csv", index=False)
    print("\n=== Categorical feature checks (chi-square on reject vs break) ===")
    print(quad_df.to_string(index=False))

    # 4. Momentum control: does prior trend alone predict outcome? ----------
    mom_rows = []
    for h in HORIZONS:
        oc = f"outcome_{h}m"
        sub = te.dropna(subset=["prior_ret_60m", oc])
        sub_is_reject = (sub[oc] == "reject").astype(int)
        for mcol in ["prior_ret_60m", "prior_ret_240m"]:
            s2 = te.dropna(subset=[mcol, oc])
            r, p = stats.pointbiserialr((s2[oc] == "reject").astype(int), s2[mcol])
            mom_rows.append({"horizon_min": h, "momentum_feature": mcol, "n": len(s2),
                              "point_biserial_r": r, "p": p})
    mom_df = pd.DataFrame(mom_rows)
    mom_df.to_csv(f"{RES}/feature_discovery_momentum_control.csv", index=False)
    print("\n=== Does prior momentum alone predict reject-vs-break? (control) ===")
    print(mom_df.to_string(index=False))

    # 5. Pre-touch (CAUSAL) volatility as a standalone predictor -------------
    # The confound check that actually mattered: session and oi_chg_extreme
    # both looked real above, then both needed re-testing against this.
    vol_rows = []
    for h in HORIZONS:
        oc = f"outcome_{h}m"
        sub = te.dropna(subset=["pre_vol_60m", oc])
        r, p = stats.pointbiserialr((sub[oc] == "reject").astype(int), sub["pre_vol_60m"])
        rates = te.dropna(subset=["pre_vol_tercile", oc]).groupby("pre_vol_tercile", observed=True)[oc]\
            .apply(lambda s: (s == "reject").mean() * 100)
        vol_rows.append({"horizon_min": h, "n": len(sub), "point_biserial_r": r, "p": p, **rates.to_dict()})
    vol_df = pd.DataFrame(vol_rows)
    vol_df.to_csv(f"{RES}/feature_discovery_pretouch_volatility.csv", index=False)
    print("\n=== Pre-touch (causal, strictly before the touch) volatility as a standalone predictor ===")
    print(vol_df.to_string(index=False))

    # 6/7. Re-test session and oi_chg_extreme STRATIFIED by pre-touch vol
    # tercile -- this is the actual confound check, not just a caveat.
    for label, col in [("session", "session"), ("oi_chg_extreme", "oi_chg_extreme")]:
        sub = te.dropna(subset=[col, "pre_vol_tercile", "outcome_15m"])
        piv = sub.groupby(["pre_vol_tercile", col], observed=True)["outcome_15m"]\
            .apply(lambda s: (s == "reject").mean() * 100).unstack()
        n = sub.groupby(["pre_vol_tercile", col], observed=True).size().unstack()
        piv.to_csv(f"{RES}/feature_discovery_{label}_controlled_for_vol.csv")
        print(f"\n=== {label} reject rate (15min), STRATIFIED by pre-touch vol tercile ===")
        print(piv.to_string())
        print(f"cell counts:\n{n.to_string()}")


if __name__ == "__main__":
    main()
