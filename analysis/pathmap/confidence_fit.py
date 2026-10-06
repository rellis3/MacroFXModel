"""Layer 6 — CONFIDENCE (forge/CONFIDENCE_PREREG.md): meta-label layer 5's reach calls.

Label: from a checkpoint, does price travel at least the R3 p50 / p75 remaining-travel distance on a side before the
session ends? Base rate (M0) 0.50 / 0.25. Models M1 (logistic) and M2 (calibrated gradient boosting) on conditions
known at the checkpoint. Train < 2024-09-05, validation to 2025-09-04, test from 2025-09-05 (scored once).
    python analysis/pathmap/confidence_fit.py
"""
import ast
import glob
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from forge.export_iv_adjusted_params import realised
from forge.run_combined_range import asof_before, cboe

VAL, TEST = "2024-09-05", "2025-09-05"
BASE = {"p50": 0.50, "p75": 0.25}
RNG = np.random.default_rng(20261006)
IVFILE = {"EURUSD": "eur_usd", "GBPUSD": "gbp_usd", "AUDUSD": "aud_usd", "USDJPY": "usd_jpy", "USDCAD": "usd_cad", "USDCHF": "usd_chf"}
CBOE = {"GOLD": "GVZ", "NQ": "VXN", "SPX500": "VIX", "US30": "VIX", "US2000": "VIX"}
CCY_EXTRA = {"DE30": ["EUR", "USD"], "UK100": ["GBP", "USD"]}

# ── rows and labels ───────────────────────────────────────────────────────────
rows = pd.concat([pd.read_csv(f) for f in glob.glob("analysis/output/remaining_travel/*.csv") if not f.endswith("_profile.csv")], ignore_index=True)
rows = rows[rows["h"] != 21].reset_index(drop=True)             # 21:00 flagged unreliable in layer 5
mult = {ast.literal_eval(k): v for k, v in json.load(open("analysis/output/remaining_travel_summary.json"))["models"]["R3"]["multipliers"].items()}

# ── session-level features ────────────────────────────────────────────────────
rows["dt"] = pd.to_datetime(rows["date"])
rows["ivr"] = np.nan
cb = {s: cboe(s) for s in set(CBOE.values())}
prior_rng = []
for inst, g in rows.groupby("inst"):
    if inst in IVFILE:
        t = pd.read_parquet(f"oi_research_book/data/iv_daily_{IVFILE[inst]}.parquet")
        s = pd.Series(t["iv30"].astype(float).to_numpy() * 100, index=pd.to_datetime(t["date"])).sort_index()
    elif inst in CBOE:
        s = cb[CBOE[inst]]
    else:
        s = None
    if s is not None:
        rows.loc[g.index, "ivr"] = asof_before(pd.DatetimeIndex(g["dt"]), s.dropna()) / np.sqrt(252) / g["sig"].to_numpy()
    # yesterday's H-L ÷ yesterday's σ (both known before today's open)
    day = g.drop_duplicates("date")[["date", "sig"]].sort_values("date")
    r = realised(inst)[["date", "hl"]].assign(date=lambda x: x["date"].dt.strftime("%Y-%m-%d"))
    day = day.merge(r, on="date", how="left")
    day["prior_rng"] = (day["hl"] / day["sig"]).shift(1)
    prior_rng.append(day[["date"]].assign(inst=inst, prior_rng=day["prior_rng"].to_numpy()))
rows = rows.merge(pd.concat(prior_rng), on=["inst", "date"], how="left")

cal = pd.read_csv("calendar_events.csv", encoding="latin1", usecols=["date", "ccy", "impact", "event"])
cal = cal[cal["impact"] == "Major"]
tier1 = cal["event"].str.match(r"(?i)^(fed interest rate decision|fomc economic projections|fed press conference|payroll jobs growth|(core )?inflation rate (month-over-month|year-over-year))$") & (cal["ccy"] == "USD")
cal["tag"] = np.where(tier1, 2, 1)
cal_end = cal["date"].max()
tag_by = cal.groupby(["date", "ccy"])["tag"].max()


def ccys(inst):
    if inst in CCY_EXTRA:
        return CCY_EXTRA[inst]
    return [inst[:3], inst[3:], "USD"] if len(inst) == 6 else ["USD"]


ev = {}
for inst, d in rows[["inst", "date"]].drop_duplicates().itertuples(index=False):
    if d > cal_end:
        ev[(inst, d)] = "unknown"; continue
    t = max((tag_by.get((d, c), 0) for c in ccys(inst)), default=0)
    ev[(inst, d)] = {2: "tier1", 1: "high", 0: "none"}[t]
rows["event"] = [ev[k] for k in zip(rows["inst"], rows["date"])]
rows["dow"] = rows["dt"].dt.dayofweek
rows["elapsed_rv"] = rows["rv"]                                     # σ² units so far

# ── long format: side × rung ──────────────────────────────────────────────────
parts = []
for side in ("up", "down"):
    sg = 1 if side == "up" else -1
    for rung in ("p50", "p75"):
        x = rows.copy()
        x["side"], x["rung"] = side, rung
        x["thr"] = [mult[(c, h)][side][rung] for c, h in zip(x["cls"], x["h"])]
        x["y"] = (x[side] >= x["thr"]).astype(int)
        x["pos_side"] = sg * x["pos"]
        x["dist_ext"] = np.where(side == "up", x["hiPos"] - x["pos"], x["pos"] - x["loPos"])
        parts.append(x)
X = pd.concat(parts, ignore_index=True)
X["split"] = np.where(X["date"] < VAL, "train", np.where(X["date"] < TEST, "val", "test"))
X["iv_missing"] = X["ivr"].isna().astype(int)
NUM = ["h", "sigRel", "ivr", "used", "rv", "pos_side", "dist_ext", "prior_rng", "dow", "iv_missing"]
CAT = ["cls", "side", "rung", "event"]
design = pd.get_dummies(X[CAT].astype(str), dtype=float)
F = pd.concat([X[NUM].astype(float), design], axis=1)
F_lr = F.copy()
for c in NUM:
    m, s = F_lr.loc[X["split"] == "train", c].mean(), F_lr.loc[X["split"] == "train", c].std()
    F_lr[c] = ((F_lr[c] - m) / (s if s > 0 else 1)).fillna(0.0)
F_lr = pd.concat([F_lr, pd.get_dummies(X["h"].astype(str), prefix="hr", dtype=float)], axis=1)
y = X["y"].to_numpy()
tr, va, te = (X["split"] == k for k in ("train", "val", "test"))
print(f"rows: train {tr.sum()}  val {va.sum()}  test {te.sum()}  (test sessions {X.loc[te, 'date'].nunique()})")

# ── models ────────────────────────────────────────────────────────────────────
p = {"M0": X["rung"].map(BASE).to_numpy()}
lr = LogisticRegression(C=1.0, max_iter=2000).fit(F_lr[tr], y[tr])
p["M1"] = lr.predict_proba(F_lr)[:, 1]
# early stopping on the validation year: fit on train, pick iterations by val loss
best = None
for it in (100, 200, 300):
    m = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=it, random_state=0).fit(F[tr], y[tr])
    pv = m.predict_proba(F[va])[:, 1]
    loss = np.mean((pv - y[va]) ** 2)
    if best is None or loss < best[0]:
        best = (loss, it, m)
gb = best[2]
raw = gb.predict_proba(F)[:, 1]
iso = IsotonicRegression(out_of_bounds="clip").fit(raw[va], y[va])
p["M2"] = iso.predict(raw)
print(f"M2 iterations chosen on validation: {best[1]}")


def bss_boot(mask, model):
    d = X.loc[mask, "date"].to_numpy()
    e_m = (p[model][mask] - y[mask]) ** 2
    e_0 = (p["M0"][mask] - y[mask]) ** 2
    df = pd.DataFrame({"d": d, "m": e_m, "z": e_0}).groupby("d").sum()
    point = 1 - df["m"].sum() / df["z"].sum()
    idx = RNG.integers(0, len(df), (2000, len(df)))
    mm, zz = df["m"].to_numpy()[idx].sum(1), df["z"].to_numpy()[idx].sum(1)
    b = 1 - mm / zz
    return float(point), float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))


def reliability(mask, model):
    q = pd.qcut(p[model][mask], 10, duplicates="drop")
    g = pd.DataFrame({"p": p[model][mask], "y": y[mask], "q": q}).groupby("q", observed=True).agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    g = g[g["n"] >= 500]
    return float((g["p"] - g["y"]).abs().max()), g


res = {"generated": str(date.today()), "spec": "forge/CONFIDENCE_PREREG.md", "models": {}}
val_choice = {}
for model in ("M1", "M2"):
    out = {}
    for rung in ("p50", "p75"):
        for split, mask0 in (("val", va), ("test", te)):
            mask = mask0 & (X["rung"] == rung).to_numpy()
            b = bss_boot(mask, model)
            rel, _ = reliability(mask, model)
            auc = roc_auc_score(y[mask], p[model][mask])
            out[f"{split}_{rung}"] = {"bss": round(b[0], 4), "ci": [round(b[1], 4), round(b[2], 4)], "max_decile_miss": round(rel * 100, 2), "auc": round(auc, 4)}
    passed = all(out[f"test_{r}"]["ci"][0] > 0 and out[f"test_{r}"]["max_decile_miss"] <= 3.0 for r in ("p50", "p75"))
    out["pass"] = bool(passed)
    res["models"][model] = out
    val_choice[model] = np.mean([out[f"val_{r}"]["bss"] for r in ("p50", "p75")])
    print(f"\n{model} {'logistic' if model == 'M1' else 'calibrated boosting'}:")
    for k, v in out.items():
        if k != "pass":
            print(f"   {k:9} BSS {v['bss']:+.4f} [{v['ci'][0]:+.4f}, {v['ci'][1]:+.4f}]  max decile miss {v['max_decile_miss']:.1f}pp  AUC {v['auc']:.3f}")
    print(f"   PASS (test, both rungs): {passed}")
chosen = max(val_choice, key=val_choice.get)
res["chosen_on_validation"] = chosen
print(f"\nChosen on validation: {chosen}  -> pre-registered verdict: {'PASS' if res['models'][chosen]['pass'] else 'FAIL'}")

# ── what carries it (test, chosen model) and where ────────────────────────────
groups = {"time of day": ["h"], "regime": ["sigRel"], "implied vol ÷ σ": ["ivr", "iv_missing"], "range used so far": ["used"],
          "realised vol so far": ["rv"], "price vs open": ["pos_side"], "distance from running extreme": ["dist_ext"],
          "yesterday's range": ["prior_rng"], "day of week": ["dow"]}
sub = np.where(te)[0]
sub = RNG.choice(sub, size=min(300000, len(sub)), replace=False)
Fm = F_lr if chosen == "M1" else F
predict = (lambda A: lr.predict_proba(A)[:, 1]) if chosen == "M1" else (lambda A: iso.predict(gb.predict_proba(A)[:, 1]))
base_brier = np.mean((predict(Fm.iloc[sub]) - y[sub]) ** 2)
imp = {}
for name, cols in groups.items():
    A = Fm.iloc[sub].copy()
    perm = RNG.permutation(len(A))
    for c in cols:
        A[c] = A[c].to_numpy()[perm]
    imp[name] = float(np.mean((predict(A) - y[sub]) ** 2) - base_brier)
z0 = np.mean((p["M0"][sub] - y[sub]) ** 2)
print("\nPermutation importance on test (Brier increase as % of the base-rate Brier):")
for k, v in sorted(imp.items(), key=lambda kv: -kv[1]):
    print(f"   {k:32} {100 * v / z0:+.2f}%")
res["importance_pct_of_base_brier"] = {k: round(100 * v / z0, 3) for k, v in imp.items()}

print("\nTest BSS by class and by hour band (chosen model):")
for col in ("cls", "h"):
    for k, g in X[te].groupby(col):
        m = te & (X[col] == k).to_numpy()
        b = 1 - np.mean((p[chosen][m] - y[m]) ** 2) / np.mean((p["M0"][m] - y[m]) ** 2)
        print(f"   {col}={k}: BSS {b:+.4f}")
Path("analysis/output/confidence_summary.json").write_text(json.dumps(res, indent=1, default=float))
