#!/usr/bin/env python3
"""Queued next step #2: a break-vs-reject classifier on the wall-touch
events, using ONLY the features Part 14's feature-discovery pass actually
validated -- pre-touch (causal) volatility, the OI-change p75-p90 tier, and
wall side. Session and volume/OI quadrant were tested and dropped on
evidence; DTE is blocked pending R2 access. See RESEARCH_BOOK.md Part 14.

Deliberately a SMALL model (3 terms), not a black-box classifier: the real
independent sample size here is ~27-43 wall-episodes per side (Part 9b's
own clustering correction), not the ~800 raw touches. A model with more
parameters than that supports is overfitting by construction, whatever its
touch-level accuracy claims. Every OOS number below is reported both at
touch level AND re-checked with an episode-level cluster bootstrap -- the
same discipline `06_intraday_cluster_significance.py` already applied to
the underlying wall-rejection finding, applied here to the classifier that
sits on top of it.

Split is chronological (60/20/20 by touch_ts), never random -- a random
split would leak touches from the same wall-episode across train/test.
The comparison that matters throughout: does conditioning on these features
beat the simplest possible baseline (just the side's own historical reject
rate), out of sample, in a way that survives clustering? If not, say so.
"""
import sys
import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.metrics import roc_auc_score, brier_score_loss

DATA = "oi_research_book/data"
RES = f"{DATA}/results"
N_BOOT = 5000
RNG = np.random.default_rng(20260910)

sys.path.insert(0, "oi_research_book/scripts")
import importlib.util
spec = importlib.util.spec_from_file_location("cs", "oi_research_book/scripts/06_intraday_cluster_significance.py")
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)


def load_data():
    te = pd.read_csv(f"{RES}/feature_discovery_enriched_touches.csv", parse_dates=["date", "touch_ts"])
    te["date"] = pd.to_datetime(te["date"]).dt.tz_localize(None)
    if te["touch_ts"].dt.tz is not None:
        te["touch_ts"] = te["touch_ts"].dt.tz_localize(None)

    levels = cs.load_lagged_levels()
    ep_call = cs.assign_episodes(levels, "call_wall_a")
    ep_put = cs.assign_episodes(levels, "put_wall_a")
    call_ev = te[te.side == "call"].merge(ep_call, on="date", how="left")
    put_ev = te[te.side == "put"].merge(ep_put, on="date", how="left")
    te = pd.concat([call_ev, put_ev], ignore_index=True).sort_values("touch_ts").reset_index(drop=True)
    return te


def build_features(te):
    te["is_call"] = (te["side"] == "call").astype(int)
    te["is_p75_90"] = (te["oi_chg_extreme"] == "p75_p90").astype(int)
    return te


def chronological_split(te):
    n = len(te)
    i1, i2 = int(n * 0.6), int(n * 0.8)
    return te.iloc[:i1].copy(), te.iloc[i1:i2].copy(), te.iloc[i2:].copy()


def fit_and_eval(horizon, train, val, test):
    oc = f"outcome_{horizon}m"
    cols = ["is_call", "pre_vol_60m", "is_p75_90"]
    tr = train.dropna(subset=cols + [oc]).copy()
    va = val.dropna(subset=cols + [oc]).copy()
    te_ = test.dropna(subset=cols + [oc]).copy()
    if len(tr) < 50 or len(te_) < 20:
        return None

    # standardize pre_vol using TRAIN stats only -- no lookahead into val/test
    mu, sd = tr["pre_vol_60m"].mean(), tr["pre_vol_60m"].std()
    for d in (tr, va, te_):
        d["pre_vol_z"] = (d["pre_vol_60m"] - mu) / sd

    y_tr = (tr[oc] == "reject").astype(int)
    X_tr = sm.add_constant(tr[["is_call", "pre_vol_z", "is_p75_90"]])
    model = sm.Logit(y_tr, X_tr).fit(disp=0)

    # baseline: side-only historical reject rate (TRAIN), no conditioning at all
    base_rate = tr.groupby("is_call")[oc].apply(lambda s: (s == "reject").mean())

    results = {}
    for label, d in [("train", tr), ("val", va), ("test", te_)]:
        y = (d[oc] == "reject").astype(int)
        X = sm.add_constant(d[["is_call", "pre_vol_z", "is_p75_90"]], has_constant="add")
        p_model = model.predict(X)
        p_base = d["is_call"].map(base_rate)
        auc_model = roc_auc_score(y, p_model) if y.nunique() > 1 else np.nan
        auc_base = roc_auc_score(y, p_base) if y.nunique() > 1 else np.nan
        results[label] = {
            "n": len(d), "n_episodes": d["episode_id"].nunique(),
            "brier_model": brier_score_loss(y, p_model), "brier_base": brier_score_loss(y, p_base),
            "auc_model": auc_model, "auc_base": auc_base,
            "acc_model": ((p_model > 0.5).astype(int) == y).mean(),
            "acc_base": ((p_base > 0.5).astype(int) == y).mean(),
        }
    return model, results, te_, base_rate, mu, sd


def cluster_bootstrap_brier_gap(test_df, model, base_rate, mu, sd, oc):
    """Does the model's Brier-score improvement over the side-only baseline
    survive resampling by EPISODE (not touch) on the test/OOS period?"""
    d = test_df.dropna(subset=["pre_vol_60m", "is_p75_90", "episode_id", oc]).copy()
    d["pre_vol_z"] = (d["pre_vol_60m"] - mu) / sd
    y = (d[oc] == "reject").astype(int).values
    X = sm.add_constant(d[["is_call", "pre_vol_z", "is_p75_90"]], has_constant="add")
    d["p_model"] = model.predict(X)
    d["p_base"] = d["is_call"].map(base_rate)
    d["y"] = y

    episodes = d["episode_id"].unique()
    if len(episodes) < 5:
        return None, len(episodes)
    ep_groups = {ep: g for ep, g in d.groupby("episode_id")}
    gaps = np.empty(N_BOOT)
    for b in range(N_BOOT):
        sampled = RNG.choice(episodes, size=len(episodes), replace=True)
        pooled = pd.concat([ep_groups[e] for e in sampled], ignore_index=True)
        brier_model = brier_score_loss(pooled["y"], pooled["p_model"])
        brier_base = brier_score_loss(pooled["y"], pooled["p_base"])
        gaps[b] = brier_base - brier_model  # positive = model beats baseline (lower Brier is better)
    return gaps, len(episodes)


def simplicity_check(train, test, horizon):
    """Does dropping down to the SINGLE strongest-looking feature (is_p75_90,
    the only one with a real in-sample p-value in the 3-term model) do any
    better OOS? If even the simplest possible model fails to generalize,
    the problem isn't parameter count -- the feature itself doesn't survive
    chronological OOS, whatever its in-sample p-value says."""
    oc = f"outcome_{horizon}m"
    tr = train.dropna(subset=["is_p75_90", oc])
    te_ = test.dropna(subset=["is_p75_90", oc])
    if len(tr) < 30 or len(te_) < 10:
        return None
    y_tr = (tr[oc] == "reject").astype(int)
    X_tr = sm.add_constant(tr[["is_p75_90"]])
    m = sm.Logit(y_tr, X_tr).fit(disp=0)
    base_rate = y_tr.mean()
    y_te = (te_[oc] == "reject").astype(int)
    X_te = sm.add_constant(te_[["is_p75_90"]], has_constant="add")
    p_model = m.predict(X_te)
    p_base = pd.Series(base_rate, index=te_.index)
    return {
        "horizon_min": horizon, "in_sample_coef": m.params["is_p75_90"], "in_sample_p": m.pvalues["is_p75_90"],
        "oos_brier_model": brier_score_loss(y_te, p_model), "oos_brier_base": brier_score_loss(y_te, p_base),
        "oos_auc_model": roc_auc_score(y_te, p_model) if y_te.nunique() > 1 else np.nan,
    }


def main():
    te = load_data()
    te = build_features(te)
    train, val, test = chronological_split(te)
    print(f"Split: train n={len(train)}, val n={len(val)}, test n={len(test)}")
    print(f"Independent episodes -- train={train['episode_id'].nunique()}, "
          f"val={val['episode_id'].nunique()}, test={test['episode_id'].nunique()}")

    simple_rows = []
    for h in [15, 60]:
        r = simplicity_check(train, test, h)
        if r: simple_rows.append(r)
    simple_df = pd.DataFrame(simple_rows)
    simple_df.to_csv(f"{RES}/classifier_simplicity_check.csv", index=False)
    print("\n=== Simplicity check: single-feature (is_p75_90 only) model, in-sample vs OOS ===")
    print(simple_df.to_string(index=False))

    summary_rows = []
    for h in [15, 60]:
        out = fit_and_eval(h, train, val, test)
        if out is None:
            print(f"\n{h}min: insufficient data, skipped")
            continue
        model, results, test_df, base_rate, mu, sd = out
        print(f"\n=== {h}min horizon: logistic regression coefficients ===")
        print(model.summary2().tables[1].to_string())

        for split, r in results.items():
            summary_rows.append({"horizon_min": h, "split": split, **r})

        gaps, n_ep = cluster_bootstrap_brier_gap(test_df, model, base_rate, mu, sd, f"outcome_{h}m")
        if gaps is not None:
            p_no_improvement = (gaps <= 0).mean()
            print(f"\nEpisode-cluster bootstrap on TEST ({n_ep} independent episodes, {N_BOOT} resamples):")
            print(f"  mean Brier improvement (base - model): {gaps.mean():.5f}")
            print(f"  95% CI: [{np.percentile(gaps,2.5):.5f}, {np.percentile(gaps,97.5):.5f}]")
            print(f"  P(no improvement or model is worse) = {p_no_improvement:.3f}")
        else:
            print(f"\nToo few independent test episodes ({n_ep}) for a cluster bootstrap -- not evaluated.")

    summary = pd.DataFrame(summary_rows)
    summary.to_csv(f"{RES}/classifier_eval_summary.csv", index=False)
    print("\n=== Full eval summary (touch-level; the episode bootstrap above is the real OOS bar) ===")
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
