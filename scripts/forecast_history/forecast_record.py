"""STEP 1 — the forecast's own record as a sampling distribution (forge/FORECAST_RECORD_PREREG.md).

Reads the Step 0 table; scores exceedance and pinball for the point-in-time (`pit`) and live-settings (`live`)
forecasts against a 250-session climatology, with a stationary block bootstrap over dates.

    python scripts/forecast_history/forecast_record.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

H = Path("analysis/output/forecast_history")
OUT = Path("analysis/output/forecast_record")
Q = {"oh": "r_oh", "ol": "r_ol", "hl": "r_hl", "oc": "r_oc"}
R = {"p50": 0.50, "p75": 0.75, "p90": 0.90}
TARGET = {"p50": 0.50, "p75": 0.25, "p90": 0.10}
CELLS = [(q, r) for q in Q for r in R]
MAJORS = {"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"}
INDICES = {"NQ", "SPX500", "DOW", "US2000", "DE30", "UK100"}
B, BLOCK, SEED = 2000, 20, 20261006


def klass(s):
    return "gold" if s == "GOLD" else "indices" if s in INDICES else "fx_majors" if s in MAJORS else "fx_crosses"


def complete(d: pd.DataFrame) -> pd.Series:
    """A session is complete when its last bar is at or after 20:00 London (FORECAST_RECORD_PREREG Amendment 2).
    DE30/UK100 close at 21:00, and US indices/gold close at 21:00 in the weeks US and UK clocks differ: those
    are full sessions. Only early-close holidays and data gaps fall below 20:00."""
    return d.last_min >= 20 * 60


def pinball(y, f, tau):
    d = y - f
    return np.maximum(tau * d, (tau - 1) * d)


def load() -> pd.DataFrame:
    parts = []
    for f in sorted(H.glob("*.csv")):
        d = pd.read_csv(f).sort_values("date").reset_index(drop=True)
        s = d["pit_sig_used"]
        d["regime_ratio"] = s / s.shift(1).rolling(250, min_periods=120).median()
        clim = {f"clim_{q}_{r}": d[col].shift(1).rolling(250, min_periods=120).quantile(tau)   # previous 250 only
                for q, col in Q.items() for r, tau in R.items()}
        parts.append(pd.concat([d, pd.DataFrame(clim)], axis=1))
    X = pd.concat(parts, ignore_index=True)
    X = X[(X.oos == 1) & complete(X)].copy()
    X["klass"] = X.inst.map(klass)
    X["year"] = "fold " + X.fold.astype(str)
    X["regime"] = np.select([X.regime_ratio < 0.85, X.regime_ratio > 1.15], ["quiet", "busy"], "normal")
    X.loc[X.regime_ratio.isna(), "regime"] = "n/a"
    return X.reset_index(drop=True)


def boot_weights(n_dates: int) -> np.ndarray:
    """Stationary bootstrap: per replicate, how many times each date is drawn (B x n_dates)."""
    rng = np.random.default_rng(SEED)
    W = np.zeros((B, n_dates))
    p = 1.0 / BLOCK
    for b in range(B):
        idx = np.empty(n_dates, dtype=int)
        i = rng.integers(n_dates)
        jumps = rng.random(n_dates) < p
        starts = rng.integers(n_dates, size=n_dates)
        for t in range(n_dates):
            if t and jumps[t]:
                i = starts[t]
            idx[t] = i
            i = (i + 1) % n_dates
        W[b] = np.bincount(idx, minlength=n_dates)
    return W


def main():
    X = load()
    dates = np.sort(X.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[X.date].to_numpy()
    nd = len(dates)
    sig = X.pit_sig_used.to_numpy()

    # per-row metric columns; every statistic is a ratio of date sums (num / den)
    cols, names = {}, []
    clim_ok = np.ones(len(X), bool)
    for q, r in CELLS:
        clim_ok &= X[f"clim_{q}_{r}"].notna().to_numpy()
    for q, r in CELLS:
        y, tau = X[Q[q]].to_numpy(), R[r]
        cols[f"ex_pit|{q}_{r}"] = (y > X[f"pit_{q}_{r}"].to_numpy()).astype(float)
        cols[f"ex_live|{q}_{r}"] = (y > X[f"live_{q}_{r}"].to_numpy()).astype(float)
        for arm in ("pit", "live", "clim"):
            v = pinball(y, X[f"{arm}_{q}_{r}"].to_numpy(), tau) / sig
            cols[f"pb_{arm}|{q}_{r}"] = np.where(clim_ok, v, 0.0)
    M = pd.DataFrame(cols)
    one = np.ones(len(X))

    groups = {"pooled": np.full(len(X), "all")}
    for g in ("year", "klass", "regime", "event", "inst"):
        groups[g] = X[g].astype(str).to_numpy()

    W = boot_weights(nd)
    res = {}

    def stat(num, den, mask):
        sn = np.bincount(di[mask], weights=num[mask], minlength=nd)
        sd = np.bincount(di[mask], weights=den[mask], minlength=nd)
        point = sn.sum() / sd.sum()
        reps = (W @ sn) / np.maximum(W @ sd, 1e-12)
        lo, hi = np.percentile(reps, [2.5, 97.5])
        return point, lo, hi, reps

    for gname, gv in groups.items():
        for level in sorted(set(gv)):
            m = gv == level
            n = int(m.sum())
            if n < 200:
                continue
            row = {"n": n, "dates": int(len(set(di[m])))}
            for q, r in CELLS:
                for arm in ("pit", "live"):
                    p, lo, hi, _ = stat(M[f"ex_{arm}|{q}_{r}"].to_numpy(), one, m)
                    row[f"ex_{arm}|{q}_{r}"] = [round(p, 4), round(lo, 4), round(hi, 4)]
            mc = m & clim_ok
            if gname != "inst" and mc.sum() >= 200:
                pit = sum(M[f"pb_pit|{c[0]}_{c[1]}"].to_numpy() for c in CELLS)
                live = sum(M[f"pb_live|{c[0]}_{c[1]}"].to_numpy() for c in CELLS)
                clim = sum(M[f"pb_clim|{c[0]}_{c[1]}"].to_numpy() for c in CELLS)
                _, _, _, rp = stat(pit, one, mc)
                _, _, _, rc = stat(clim, one, mc)
                _, _, _, rl = stat(live, one, mc)
                sk = 1 - rp / rc
                pt = 1 - pit[mc].sum() / clim[mc].sum()
                row["skill_vs_clim"] = [round(pt, 4), *[round(x, 4) for x in np.percentile(sk, [2.5, 97.5])]]
                fl = (rl - rp) / rp                              # live relative to pit: < 0 = in-sample looks better
                ptf = live[mc].sum() / pit[mc].sum() - 1
                row["live_vs_pit_pinball"] = [round(ptf, 4), *[round(x, 4) for x in np.percentile(fl, [2.5, 97.5])]]
            res.setdefault(gname, {})[level] = row

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1))

    def flag(c, r):
        p, lo, hi = c
        t = TARGET[r]
        if hi - lo > 0.10:
            return "?"
        if lo > t + 0.02 or hi < t - 0.02:
            return "✗"
        return ""

    def table(gname, title):
        lines = [f"### {title}", "", "| | n | " + " | ".join(f"{q.upper()} {r}" for q, r in CELLS) + " | flagged |",
                 "|---|---|" + "---|" * (len(CELLS) + 1)]
        for level, row in res[gname].items():
            cells, nflag = [], 0
            for q, r in CELLS:
                c = row[f"ex_pit|{q}_{r}"]
                f = flag(c, r)
                nflag += f == "✗"
                cells.append(f"{c[0] * 100:.1f}{f}")
            lines.append(f"| {level} | {row['n']} | " + " | ".join(cells) + f" | {nflag} |")
        return lines + [""]

    P = res["pooled"]["all"]
    md = ["# STEP 1 — the forecast's own record (results)", "",
          "Pre-registration: `forge/FORECAST_RECORD_PREREG.md`. Point-in-time (`pit`) forecasts on out-of-sample sessions "
          f"only: **{P['n']:,} instrument-sessions, {P['dates']:,} dates**. 95% intervals: stationary block bootstrap over "
          "dates (block 20, 2,000 reps). Exceedance targets 50 / 25 / 10%. ✗ = whole interval outside target ± 2 pp; "
          "? = interval wider than ± 5 pp.", "",
          "## Pooled", "", "| rung | pit exceed [95%] | live exceed | flag |", "|---|---|---|---|"]
    for q, r in CELLS:
        c, l = P[f"ex_pit|{q}_{r}"], P[f"ex_live|{q}_{r}"]
        md.append(f"| {q.upper()} {r} (target {TARGET[r] * 100:.0f}%) | {c[0] * 100:.1f} [{c[1] * 100:.1f}, {c[2] * 100:.1f}] | "
                  f"{l[0] * 100:.1f} | {flag(c, r)} |")
    s, f = P["skill_vs_clim"], P["live_vs_pit_pinball"]
    md += ["", f"**Skill over climatology** (pinball, all 12 rungs): **{s[0] * 100:.1f}%** [{s[1] * 100:.1f}, {s[2] * 100:.1f}].",
           f"**Live settings vs point-in-time** (pinball, relative): {f[0] * 100:+.1f}% [{f[1] * 100:+.1f}, {f[2] * 100:+.1f}] "
           "(negative = today's settings look better on history than the forecast that was actually available).", ""]
    md += ["## Skill over climatology by group", "", "| group | level | n | skill [95%] | live vs pit |", "|---|---|---|---|---|"]
    for g in ("year", "klass", "regime", "event"):
        for level, row in res[g].items():
            if "skill_vs_clim" not in row:
                continue
            s, f = row["skill_vs_clim"], row["live_vs_pit_pinball"]
            md.append(f"| {g} | {level} | {row['n']} | {s[0] * 100:.1f} [{s[1] * 100:.1f}, {s[2] * 100:.1f}] | "
                      f"{f[0] * 100:+.1f} [{f[1] * 100:+.1f}, {f[2] * 100:+.1f}] |")
    md += ["", "## Exceedance by group (pit, %)", ""]
    for g, t in (("year", "By fold year"), ("klass", "By instrument class"), ("regime", "By regime (σ ÷ trailing median)"),
                 ("event", "By event tag"), ("inst", "By instrument")):
        md += table(g, t)
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:40]))


if __name__ == "__main__":
    main()
