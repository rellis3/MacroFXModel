"""forecast — the actual prediction model: given what's happened so far
TODAY (which sessions have closed, their range/direction, where price sits
in today's range-so-far, plus yesterday's range/direction), predict the rest
of the day.

One Ridge (regression: remaining range) and one Logistic (classification:
does the day close above or below the checkpoint price) model per checkpoint
(`post_asia`, `post_london`, `post_overlap`), each walk-forward validated by
CALENDAR YEAR with an expanding training window — train on every year before
Y, test on year Y, never the reverse. A HistGradientBoosting pair is fit
alongside as a "does nonlinearity actually help" check.

Every model is scored against two baselines that a model has to beat to be
worth anything:

  climatology   train-set unconditional mean/majority-class — a model that
                doesn't even look at today's features
  persistence   the naive one-variable version of the same idea (linear fit
                of remaining range on range-so-far; sign of the day's move
                so far, for direction) — a model has to beat the OBVIOUS
                idea, not just beat guessing

...and against a **null**: the identical model architecture, refit on the
SAME training features but with the training TARGET circularly shifted
(breaking the true pairing, preserving its own autocorrelation — see
`stats_util`), then evaluated on the real, unshifted test target. If a model
trained on scrambled outcomes scores comparably to the real one, the real
model's apparent skill is not to be trusted — this is the single most
important number in this module's output, not a footnote.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as sstats
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, log_loss, r2_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from SessionResearch.dayflow import CHECKPOINTS
from SessionResearch.stats_util import binom_p

CP_SEEN = {name: seen for name, seen, _ in CHECKPOINTS}
MIN_TRAIN_YEARS = 3
BASE_FEATURES = ["range_so_far_atr", "net_so_far_atr", "pos_in_range_so_far",
                 "prev_day_range_atr", "prev_day_dir", "dow"]


def _feature_cols(checkpoint: str) -> list[str]:
    cols = list(BASE_FEATURES)
    for s in CP_SEEN[checkpoint]:
        cols += [f"{s}_range_atr", f"{s}_dir"]
    return cols


def _reg_pipeline() -> Pipeline:
    return Pipeline([("impute", SimpleImputer(strategy="median")),
                     ("scale", StandardScaler()), ("model", Ridge(alpha=1.0))])


def _clf_pipeline() -> Pipeline:
    return Pipeline([("impute", SimpleImputer(strategy="median")),
                     ("scale", StandardScaler()), ("model", LogisticRegression(max_iter=1000))])


def _test_years(sub: pd.DataFrame, min_train_years: int = MIN_TRAIN_YEARS) -> list[int]:
    years = sorted(sub["year"].unique())
    return [y for y in years if y >= years[0] + min_train_years]


def walk_forward_range(cp: pd.DataFrame, checkpoint: str, n_null: int = 20,
                       seed: int = 3) -> dict:
    cols = _feature_cols(checkpoint)
    sub = cp[cp["checkpoint"] == checkpoint].dropna(subset=["remaining_range_atr"] + cols).copy()
    sub["year"] = pd.DatetimeIndex(sub["day"]).year
    rng = np.random.default_rng(seed)

    rows, null_maes, gbm_rows, last_coefs = [], [], [], None
    for y in _test_years(sub):
        train, test = sub[sub["year"] < y], sub[sub["year"] == y]
        if len(train) < 100 or len(test) < 10:
            continue
        Xtr, ytr = train[cols].to_numpy(float), train["remaining_range_atr"].to_numpy(float)
        Xte, yte = test[cols].to_numpy(float), test["remaining_range_atr"].to_numpy(float)

        pipe = _reg_pipeline().fit(Xtr, ytr)
        pred = pipe.predict(Xte)
        last_coefs = dict(zip(cols, pipe.named_steps["model"].coef_.round(4)))

        b1 = np.full(len(yte), ytr.mean())
        b2 = (LinearRegression().fit(train[["range_so_far_atr"]].to_numpy(float), ytr)
              .predict(test[["range_so_far_atr"]].to_numpy(float)))
        gbm_pred = HistGradientBoostingRegressor(max_depth=3, random_state=0).fit(Xtr, ytr).predict(Xte)

        for i in range(len(yte)):
            rows.append(dict(year=y, actual=yte[i], pred_model=pred[i], pred_b1=b1[i],
                             pred_b2=b2[i], pred_gbm=gbm_pred[i]))

        for _ in range(n_null):
            shift = rng.integers(5, max(6, len(ytr) - 5))
            null_pred = _reg_pipeline().fit(Xtr, np.roll(ytr, shift)).predict(Xte)
            null_maes.append(float(np.mean(np.abs(yte - null_pred))))

    if not rows:
        return {}
    df = pd.DataFrame(rows)
    mae = lambda col: float(np.mean(np.abs(df["actual"] - df[col])))
    _, p_b1 = sstats.wilcoxon(np.abs(df["actual"] - df["pred_model"]), np.abs(df["actual"] - df["pred_b1"]))
    _, p_b2 = sstats.wilcoxon(np.abs(df["actual"] - df["pred_model"]), np.abs(df["actual"] - df["pred_b2"]))
    null_maes = np.array(null_maes)
    return dict(
        checkpoint=checkpoint, target="remaining_range_atr", n=len(df),
        n_years=df["year"].nunique(), mae_model=mae("pred_model"), mae_climatology=mae("pred_b1"),
        mae_persistence=mae("pred_b2"), mae_gbm=mae("pred_gbm"),
        r2_model=float(r2_score(df["actual"], df["pred_model"])),
        p_vs_climatology=float(p_b1), p_vs_persistence=float(p_b2),
        null_mae_mean=float(null_maes.mean()) if len(null_maes) else float("nan"),
        p_vs_null=float((null_maes <= mae("pred_model")).mean()) if len(null_maes) else float("nan"),
        coefs=last_coefs,
    )


def walk_forward_direction(cp: pd.DataFrame, checkpoint: str, n_null: int = 20,
                           seed: int = 4) -> dict:
    cols = _feature_cols(checkpoint)
    sub = cp[cp["checkpoint"] == checkpoint].dropna(subset=["remaining_net_atr"] + cols).copy()
    sub = sub[sub["remaining_net_atr"] != 0]
    sub["year"] = pd.DatetimeIndex(sub["day"]).year
    sub["y_up"] = (sub["remaining_net_atr"] > 0).astype(int)
    rng = np.random.default_rng(seed)

    rows, null_accs, last_coefs = [], [], None
    for y in _test_years(sub):
        train, test = sub[sub["year"] < y], sub[sub["year"] == y]
        if len(train) < 100 or len(test) < 10 or train["y_up"].nunique() < 2:
            continue
        Xtr, ytr = train[cols].to_numpy(float), train["y_up"].to_numpy(int)
        Xte, yte = test[cols].to_numpy(float), test["y_up"].to_numpy(int)

        pipe = _clf_pipeline().fit(Xtr, ytr)
        proba = pipe.predict_proba(Xte)[:, 1]
        pred = (proba >= 0.5).astype(int)
        last_coefs = dict(zip(cols, pipe.named_steps["model"].coef_[0].round(4)))

        b1_pred = np.full(len(yte), int(ytr.mean() >= 0.5))
        b2_pred = (test["net_so_far_atr"].to_numpy() > 0).astype(int)  # today's momentum continues
        gbm_pred = HistGradientBoostingClassifier(max_depth=3, random_state=0).fit(Xtr, ytr).predict(Xte)

        for i in range(len(yte)):
            rows.append(dict(year=y, actual=yte[i], proba=proba[i], pred_model=pred[i],
                             pred_b1=b1_pred[i], pred_b2=b2_pred[i], pred_gbm=gbm_pred[i]))

        for _ in range(n_null):
            shift = rng.integers(5, max(6, len(ytr) - 5))
            null_pipe = _clf_pipeline().fit(Xtr, np.roll(ytr, shift))
            null_accs.append(float(accuracy_score(yte, null_pipe.predict(Xte))))

    if not rows:
        return {}
    df = pd.DataFrame(rows)
    acc = lambda col: float(accuracy_score(df["actual"], df[col]))
    # McNemar-style paired test on the discordant pairs only.
    disc_b1 = (df["pred_model"] == df["actual"]) != (df["pred_b1"] == df["actual"])
    k_b1 = int(((df["pred_model"] == df["actual"]) & disc_b1).sum())
    p_b1 = binom_p(k_b1, int(disc_b1.sum())) if disc_b1.sum() else float("nan")
    disc_b2 = (df["pred_model"] == df["actual"]) != (df["pred_b2"] == df["actual"])
    k_b2 = int(((df["pred_model"] == df["actual"]) & disc_b2).sum())
    p_b2 = binom_p(k_b2, int(disc_b2.sum())) if disc_b2.sum() else float("nan")
    null_accs = np.array(null_accs)
    try:
        auc = float(roc_auc_score(df["actual"], df["proba"]))
    except ValueError:
        auc = float("nan")
    return dict(
        checkpoint=checkpoint, target="direction", n=len(df), n_years=df["year"].nunique(),
        acc_model=acc("pred_model"), acc_climatology=acc("pred_b1"), acc_persistence=acc("pred_b2"),
        acc_gbm=acc("pred_gbm"), auc_model=auc,
        p_vs_climatology=p_b1, p_vs_persistence=p_b2,
        null_acc_mean=float(null_accs.mean()) if len(null_accs) else float("nan"),
        p_vs_null=float((null_accs >= acc("pred_model")).mean()) if len(null_accs) else float("nan"),
        coefs=last_coefs,
    )


def run_forecast_study(cp: pd.DataFrame, n_null: int = 20, seed: int = 3) -> pd.DataFrame:
    results = []
    for name, _, _ in CHECKPOINTS:
        r = walk_forward_range(cp, name, n_null=n_null, seed=seed)
        if r:
            results.append(r)
        d = walk_forward_direction(cp, name, n_null=n_null, seed=seed + 1)
        if d:
            results.append(d)
    return pd.DataFrame(results)
