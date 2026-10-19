"""OPEX CYCLE — US index range vs position in the monthly options-expiry cycle (forge/OPEX_CYCLE_RANGE_PREREG.md).

y = log(realised HL / live ladder p50) per London session. Phase dummies (PRE = 4 sessions before the third Friday,
OPEX, POST = 5 after) with instrument x weekday and instrument x year fixed effects, partialled out once
(Frisch-Waugh), then a cluster bootstrap over expiry cycles on the small phase regression.

    PYTHONPATH=. python scripts/forecast_history/opex_cycle.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forecast_record import complete  # noqa: E402

H = Path("analysis/output/forecast_history")
OUT = Path("analysis/output/opex_cycle")
US4 = ["NQ", "SPX500", "DOW", "US2000"]
FX6 = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF"]
LOCKBOX = "2026-08-21"
PHASES = ["PRE", "OPEX", "POST"]
REPS = 2000
rng = np.random.default_rng(20261019)


def load(insts):
    parts = []
    for i in insts:
        d = pd.read_csv(H / f"{i}.csv")
        d = d[complete(d) & (d.date <= LOCKBOX) & (d.r_hl > 0) & (d.live_hl_p50 > 0)].copy()
        d["y"] = np.log(d.r_hl / d.live_hl_p50)
        parts.append(d[["inst", "date", "event", "y"]])
    X = pd.concat(parts, ignore_index=True)
    X["date"] = pd.to_datetime(X.date)
    return X


def opex_dates(sessions: pd.DatetimeIndex, shift_days=0):
    """Third Friday of every month (+ shift), moved back to the last session on or before it."""
    out = []
    for m in pd.period_range(sessions.min(), sessions.max(), freq="M"):
        first = pd.Timestamp(m.start_time)
        fri = first + pd.Timedelta(days=(4 - first.weekday()) % 7) + pd.Timedelta(days=14 + shift_days)
        k = sessions.searchsorted(fri, side="right") - 1
        if k >= 0 and (fri - sessions[k]).days <= 4:
            out.append((k, m.month in (3, 6, 9, 12)))
    return out


def phase_map(sessions: pd.DatetimeIndex, shift_days=0):
    ph = pd.Series("OTHER", index=sessions)
    cyc = pd.Series(-1, index=sessions)
    quarterly = pd.Series(False, index=sessions)
    ops = opex_dates(sessions, shift_days)
    bounds = [k + 5 for k, _ in ops]                                    # a cycle ends with its POST block
    cyc[:] = np.searchsorted(bounds, np.arange(len(sessions)), side="left")
    for k, q in ops:
        for j in range(max(0, k - 4), k):
            ph.iloc[j] = "PRE"
        ph.iloc[k] = "OPEX"
        for j in range(k + 1, min(len(sessions), k + 6)):
            ph.iloc[j] = "POST"
        for j in range(max(0, k - 4), min(len(sessions), k + 6)):
            quarterly.iloc[j] = q
    return ph, cyc, quarterly


def residualise(X, cols):
    """Partial instrument x weekday and instrument x year fixed effects out of the given columns (least squares)."""
    wd = X.inst + "_wd" + X.date.dt.dayofweek.astype(str)
    yr = X.inst + "_yr" + X.date.dt.year.astype(str)
    D = pd.get_dummies(pd.concat([wd, yr], axis=1), drop_first=False).to_numpy(float)
    M = X[cols].to_numpy(float)
    B, *_ = np.linalg.lstsq(D, M, rcond=None)
    return M - D @ B


def fit(X, sessions, shift_days=0, quarterly_only=False, boot=True):
    ph, cyc, qtr = phase_map(sessions, shift_days)
    X = X.copy()
    X["phase"] = ph.reindex(X.date).to_numpy()
    X["cycle"] = cyc.reindex(X.date).to_numpy()
    X["qtr"] = qtr.reindex(X.date).to_numpy()
    X = X[X.phase.notna()]
    if quarterly_only:
        X = X[(X.phase == "OTHER") | X.qtr.astype(bool)]
    for p in PHASES:
        X[p] = (X.phase == p).astype(float)
    R = residualise(X, ["y"] + PHASES)
    y, Z = R[:, 0], R[:, 1:]
    b, *_ = np.linalg.lstsq(Z, y, rcond=None)
    res = {"n": int(len(X)), "n_by_phase": X.phase.value_counts().to_dict(),
           "beta": {p: round(float(v), 4) for p, v in zip(PHASES, b)}, "delta": round(float(b[2] - b[0]), 4)}
    if boot:
        cyc_ids = X.cycle.to_numpy()
        uniq = np.unique(cyc_ids)
        idx_by = {c: np.where(cyc_ids == c)[0] for c in uniq}
        ds = []
        for _ in range(REPS):
            pick = rng.choice(uniq, size=len(uniq), replace=True)
            ii = np.concatenate([idx_by[c] for c in pick])
            bb, *_ = np.linalg.lstsq(Z[ii], y[ii], rcond=None)
            ds.append(bb[2] - bb[0])
        res["delta_ci"] = [round(float(v), 4) for v in np.percentile(ds, [2.5, 97.5])]
        res["cycles"] = int(len(uniq))
    return res


def main():
    US = load(US4)
    FX = load(FX6)
    sessions = pd.DatetimeIndex(np.sort(US.date.unique()))
    base = US[US.event == "none"]
    out = {"prereg": "forge/OPEX_CYCLE_RANGE_PREREG.md", "window": [str(US.date.min().date()), str(US.date.max().date())]}
    out["primary"] = fit(base, sessions)
    out["per_instrument"] = {i: fit(base[base.inst == i], sessions, boot=False) for i in US4}
    out["halves"] = {"<=2020": fit(base[base.date <= "2020-12-31"], sessions),
                     ">=2021": fit(base[base.date >= "2021-01-01"], sessions)}
    out["placebo_fx"] = fit(FX[FX.event == "none"], sessions)
    out["placebo_shift14"] = fit(base, sessions, shift_days=14)
    out["all_sessions"] = fit(US, sessions)
    out["quarterly_only"] = fit(base, sessions, quarterly_only=True)

    P = out["primary"]
    d, ci = P["delta"], P["delta_ci"]
    pos = sum(v["delta"] > 0 for v in out["per_instrument"].values())
    halves_pos = all(h["delta"] > 0 for h in out["halves"].values())
    if (d >= 0.05 and ci[0] > 0 and pos >= 3 and halves_pos
            and abs(out["placebo_fx"]["delta"]) < d / 2 and abs(out["placebo_shift14"]["delta"]) < 0.03):
        verdict = "SUPPORTED"
    elif abs(d) < 0.025 or pos == 2:
        verdict = "NULL"
    elif d <= -0.05 and ci[1] < 0:
        verdict = "WRONG WAY"
    else:
        verdict = "INCONCLUSIVE"
    out["verdict"] = verdict
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")

    def row(name, r):
        b = r["beta"]
        ci_ = f"[{r['delta_ci'][0]:+.3f}, {r['delta_ci'][1]:+.3f}]" if "delta_ci" in r else ""
        return f"| {name} | {r['n']:,} | {b['PRE']:+.3f} | {b['OPEX']:+.3f} | {b['POST']:+.3f} | **{r['delta']:+.3f}** {ci_} |"
    md = ["# OPEX CYCLE (results)", "", f"Pre-registration: `forge/OPEX_CYCLE_RANGE_PREREG.md`. Window {out['window'][0]} → {out['window'][1]}; "
          f"y = log(realised HL ÷ live p50), instrument × weekday and × year effects removed; 95% cluster bootstrap over {P['cycles']} expiry cycles.",
          "", f"**Verdict: {verdict}.**", "",
          "| sample | rows | PRE | OPEX | POST | Δ = POST − PRE [95%] |", "|---|---|---|---|---|---|",
          row("**primary: US4, non-event sessions**", P)]
    md += [row(f"{i}", r) for i, r in out["per_instrument"].items()]
    md += [row(f"US4 {k}", r) for k, r in out["halves"].items()]
    md += [row("placebo A: FX majors, same calendar", out["placebo_fx"]), row("placebo B: US4, calendar +14 days", out["placebo_shift14"]),
           row("US4, all sessions (events kept)", out["all_sessions"]), row("US4, quarterly cycles only", out["quarterly_only"]), "",
           "Coefficients are log points relative to OTHER sessions (0.05 ≈ 5% more range than the forecast)."]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
