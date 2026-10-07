"""STEP D.1 — parameter stability of the chosen forecast's persistence form (forge/STABILITY_AND_HOLDOUT_PREREG.md).

Base = forecast_fix variant 1 (live inputs). One-at-a-time perturbations: regime window 125/500, misses window 3/10,
ridge lambda 0.1/10. Each: walk-forward folds 0-5, widths refit, pinball / refit control A1 (all 34 instruments).

    PYTHONPATH=. python scripts/forecast_history/stability.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.argv.append("--live")
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_fix as F  # noqa: E402
from forecast_record import pinball  # noqa: E402

OUT = Path("analysis/output/holdout")
RUNS = [("base", 250, 5, 1.0), ("regime window 125", 125, 5, 1.0), ("regime window 500", 500, 5, 1.0),
        ("misses window 3", 250, 3, 1.0), ("misses window 10", 250, 10, 1.0), ("ridge λ 0.1", 250, 5, 0.1), ("ridge λ 10", 250, 5, 10.0)]


def with_windows(X0: pd.DataFrame, reg_w: int, res_w: int) -> pd.DataFrame:
    parts = []
    for inst, d in X0.groupby("inst"):
        d = d.sort_values("date").copy()
        sd = d.live_sig_daily
        d["regime"] = np.log(sd / sd.shift(1).rolling(reg_w, min_periods=min(120, reg_w // 2)).median())
        r_ny = np.log(d.hl_ny.clip(lower=1e-6) / sd)
        d["res1"] = r_ny.shift(1)
        d["res5"] = r_ny.shift(1).rolling(res_w, min_periods=min(3, res_w)).mean()
        parts.append(d)
    return pd.concat(parts).sort_values(["date", "inst"]).reset_index(drop=True)


def ratio(X: pd.DataFrame, lam: float) -> float:
    F.LAMBDA = lam
    X = X[X.regime.notna() & X.res5.notna() & X.res1.notna()]
    num = den = 0.0
    for f in sorted(X[X.oos == 1].fold.unique()):
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        for cls in sorted(X.klass.unique()):
            trc, mk = tr[tr.klass == cls], te.klass == cls
            b, mu = F.fit_beta(trc, F.FB)
            te.loc[mk, "sigB"] = F.apply_beta(te[mk], F.FB, b, mu)
            tr.loc[trc.index, "sigB"] = F.apply_beta(trc, F.FB, b, mu)
        for arm, col in (("A1", F.BASE), ("B", "sigB")):
            w = F.widths(tr[col].to_numpy(), tr)
            tot = np.zeros(len(te))
            for q, r in F.CELLS:
                fc = te[col].to_numpy() * w[(q, r)].reindex(te.inst).to_numpy()
                tot += pinball(te[F.Q[q]].to_numpy(), fc, F.R[r]) / te[F.BASE].to_numpy()
            if arm == "A1":
                den += tot.sum()
            else:
                num += tot.sum()
    return num / den


def main():
    X0 = F.load()
    rows = []
    for name, rw, sw, lam in RUNS:
        r = ratio(with_windows(X0, rw, sw), lam)
        rows.append((name, rw, sw, lam, r))
        print(f"{name:20s} ratio {r:.4f}", flush=True)
    base = rows[0][4]
    ok = all(r < 1 and abs(r - base) <= 0.005 for *_, r in rows[1:])
    md = ["# STEP D.1 — parameter stability of the chosen forecast (results)", "",
          "Pre-registration: `forge/STABILITY_AND_HOLDOUT_PREREG.md`. Persistence form, all 34 instruments, walk-forward folds 0–5, "
          "pinball ÷ the refit control (lower = better). Note: rows with too little history for the longest window are dropped in "
          "every run's own sample, so the base here can differ slightly from 0.980.", "",
          f"## Verdict: **{'PLATEAU — stable' if ok else 'FRAGILE'}**", "",
          "| setting | regime window | misses window | ridge λ | pinball ÷ control | vs base |", "|---|---|---|---|---|---|"]
    md += [f"| {n} | {rw} | {sw} | {lam} | {r:.4f} | {(r - base) * 100:+.2f} pp |" for n, rw, sw, lam, r in rows]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "STABILITY.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
