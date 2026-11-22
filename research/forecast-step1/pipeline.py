"""Step 1: find the best forecast of the session high, low and range (HL, OH, OL).

Built from scratch on raw 1-minute data only (owner, 2026-11-22: no earlier repo analysis is used).

Definitions (owner decisions 2026-11-22)
- Session: London calendar date, 00:00 -> 22:00 Europe/London, weekdays only.
- Data: futures primary (CME via NT8, 1-minute), CFD alongside (OANDA 1-minute).
- Levels, in % of the session open: HL = (H - L) / O, OH = (H - O) / O, OL = (O - L) / O.
- Percentiles: p50, p75, p90.

Method
- Every model gives a volatility number sigma_t for session t using sessions < t only.
- Each level at each percentile is k(level, tau) * sigma_t. k is the tau-quantile of level / sigma over all earlier
  sessions, refitted at the start of every calendar year (walk-forward). Benchmarks forecast the quantile directly.
- Model parameters (GARCH, HAR) are also refitted each January 1 on all earlier sessions.
- Scores: pinball loss at each tau (decides), QLIKE on the p50 line (Jordan's suggestion), hit rates vs 50/25/10%
  overall and by vol regime, Mincer-Zarnowitz R^2.
- Approach A: one model for all levels (best mean pinball ratio over HL+OH+OL). Approach B: best model per level.
  Chosen on the discovery years, then judged on the validation years, which the choice never saw.

Usage
    python research/forecast-step1/pipeline.py run --sym NQ --track F      # one instrument / data source
    python research/forecast-step1/pipeline.py run --all                    # NQ, GOLD, EURUSD x futures, CFD
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "output"

LEVELS = ("hl", "oh", "ol")
TAUS = (0.50, 0.75, 0.90)
DISCOVERY = (2018, 2022)          # model choice is made on these years
VALIDATION = (2023, 2026)         # ...and judged on these
LAST_DATE = pd.Timestamp("2026-08-21")   # sessions after this are the untouched holdout
MIN_TRAIN = 250                   # sessions needed before a multiplier / model fit is trusted
MIN_BARS = 600                    # of the 1,320 minutes in a full 00:00-22:00 session
SEED = 20261122
BOOT_B = 2000
BOOT_BLOCK = 63

# Instruments: futures root (NT8 continuous file) and CFD file. Paths are relative to the repo root.
INSTR = {
    "NQ": dict(f="NQ", c=["portfolioBacktest/cache/nq_m1.parquet"]),
    "GOLD": dict(f="GC", c=["portfolioBacktest/cache/gold_m1.parquet", "VolRangeForecaster/data/m1/xau_usd_m1.parquet"]),
    "EURUSD": dict(f="6E", c=["portfolioBacktest/cache/eurusd_m1.parquet", "VolRangeForecaster/data/m1/eur_usd_m1.parquet"]),
}


# ---------------------------------------------------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------------------------------------------------
def m1_path(sym: str, track: str) -> Path:
    if track == "F":
        return ROOT / f"analysis/output/nt8/continuous/{INSTR[sym]['f']}_1m_ratio.parquet"
    for p in INSTR[sym]["c"]:
        if (ROOT / p).exists():
            return ROOT / p
    return ROOT / INSTR[sym]["c"][0]


def load_m1(sym: str, track: str) -> pd.DataFrame:
    """1-minute OHLC indexed by bar START time (UTC).

    Futures: NT8 continuous, ratio-adjusted (so returns across a roll are real), end-stamped -> moved back one minute.
    The roll happens at 22:01 UTC, outside the 00:00-22:00 London window, so in-session percentages are unaffected.
    CFD: OANDA research schema, naive-UTC 'time' column (start-stamped), or a UTC index.
    """
    p = m1_path(sym, track)
    if not p.exists():
        raise FileNotFoundError(f"{sym} {track}: {p.relative_to(ROOT)} not found")
    d = pd.read_parquet(p)
    if track == "F":
        d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    elif "time" in d.columns:
        t = pd.to_datetime(d.pop("time"))
        d.index = pd.DatetimeIndex(t.dt.tz_localize("UTC") if t.dt.tz is None else t.dt.tz_convert("UTC"))
    else:
        d.index = pd.to_datetime(d.index, utc=True)
    d = d[~d.index.duplicated()].sort_index()
    return d[["open", "high", "low", "close"]].astype(float)


def sessions(m1: pd.DataFrame) -> pd.DataFrame:
    """One row per London session (00:00-22:00 London, weekdays): o h l c, bar count, 5-minute realised variance."""
    lt = m1.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    x = m1[keep].copy()
    lt = lt[keep]
    x["date"] = lt.tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(),
                      "c": g["close"].last(), "n": g["close"].size()})
    # 5-minute realised variance inside the session (log returns of 5-minute closes)
    x["b5"] = lt.tz_localize(None).floor("5min")
    c5 = x.groupby(["date", "b5"])["close"].last()
    r5 = np.log(c5).groupby(level=0).diff().dropna()
    s["rv5"] = (r5 ** 2).groupby(level=0).sum()
    s = s[(s["n"] >= MIN_BARS) & (s.index <= LAST_DATE)]
    s["hl"] = (s["h"] - s["l"]) / s["o"]
    s["oh"] = (s["h"] - s["o"]) / s["o"]
    s["ol"] = (s["o"] - s["l"]) / s["o"]
    return s


# ---------------------------------------------------------------------------------------------------------------------
# Models: each returns sigma_t (any positive scale) for session t, using sessions < t only
# ---------------------------------------------------------------------------------------------------------------------
def _daily_vars(s: pd.DataFrame) -> pd.DataFrame:
    o, h, l, c = (np.log(s[k]) for k in "ohlc")
    cp = c.shift(1)
    hl, co = h - l, c - o
    return pd.DataFrame({
        "cc": (c - cp) ** 2,                                            # close to close (includes the overnight gap)
        "pk": hl ** 2 / (4 * math.log(2)),                              # Parkinson
        "gk": 0.5 * hl ** 2 - (2 * math.log(2) - 1) * co ** 2,          # Garman-Klass
        "rs": (h - c) * (h - o) + (l - c) * (l - o),                    # Rogers-Satchell
        "ov": o - cp,                                                   # overnight log return (for Yang-Zhang)
        "oc": co,                                                       # open-close log return
        "rv5": s["rv5"],
        "ret": c - cp,
    }, index=s.index)


def _roll_sigma(v: pd.Series, n: int) -> pd.Series:
    return np.sqrt(v.rolling(n, min_periods=n).mean().clip(lower=0)).shift(1)


def _yang_zhang(dv: pd.DataFrame, n: int) -> pd.Series:
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    vo = dv["ov"].rolling(n, min_periods=n).var()
    vc = dv["oc"].rolling(n, min_periods=n).var()
    vrs = dv["rs"].rolling(n, min_periods=n).mean()
    return np.sqrt((vo + k * vc + (1 - k) * vrs).clip(lower=0)).shift(1)


def _ewma(v: pd.Series, lam: float) -> pd.Series:
    out = v.ewm(alpha=1 - lam, adjust=False, min_periods=20).mean()
    return np.sqrt(out).shift(1)


def _years(idx: pd.DatetimeIndex):
    return sorted(set(idx.year))


def _garch_filter(r: np.ndarray, w: float, a: float, b: float) -> np.ndarray:
    """Conditional variance h_t for t = 0..n (h_n is the forecast for the session after the last return)."""
    h = np.empty(len(r) + 1)
    h[0] = w / max(1e-6, 1 - a - b)               # unconditional variance: no data used
    for t in range(len(r)):
        rt = r[t] if np.isfinite(r[t]) else 0.0
        h[t + 1] = w + a * rt * rt + b * h[t]
    return h


def _garch_fit(r: np.ndarray, student: bool):
    r = r[np.isfinite(r)]
    var = r.var()

    def nll(p):
        w, a, b = math.exp(p[0]), 1 / (1 + math.exp(-p[1])), 1 / (1 + math.exp(-p[2]))
        if a + b >= 0.999:
            return 1e10
        h = _garch_filter(r, w, a, b)[:-1]
        if student:
            nu = 2.05 + math.exp(p[3])
            z2 = r * r / h
            ll = (gammaln((nu + 1) / 2) - gammaln(nu / 2) - 0.5 * np.log((nu - 2) * math.pi * h)
                  - (nu + 1) / 2 * np.log1p(z2 / (nu - 2)))
            return -ll.sum()
        return 0.5 * np.sum(np.log(h) + r * r / h)

    p0 = [math.log(var * 0.05), -2.5, 2.0] + ([math.log(6.0)] if student else [])
    res = minimize(nll, p0, method="Nelder-Mead", options=dict(maxiter=4000, xatol=1e-6, fatol=1e-6))
    p = res.x
    return math.exp(p[0]), 1 / (1 + math.exp(-p[1])), 1 / (1 + math.exp(-p[2]))


def _garch(dv: pd.DataFrame, student: bool) -> pd.Series:
    """GARCH(1,1) on session close-to-close log returns; parameters refitted each January 1 on earlier sessions."""
    r = dv["ret"].to_numpy()
    idx = dv.index
    sig = pd.Series(np.nan, index=idx)
    for y in _years(idx):
        train = idx.year < y
        if train.sum() < MIN_TRAIN:
            continue
        w, a, b = _garch_fit(r[train], student)
        upto = idx.year <= y
        h = _garch_filter(r[upto], w, a, b)          # h[t] uses returns < t only
        sig[upto & (idx.year == y)] = np.sqrt(h[:-1][idx[upto].year == y])
    return sig


def _har(v: pd.Series) -> pd.Series:
    """HAR on log variance (daily, weekly 5, monthly 22 means), OLS refitted each January 1 on earlier sessions."""
    lv = np.log(v.clip(lower=1e-12))
    X = pd.DataFrame({"d": lv, "w": np.log(v.rolling(5).mean().clip(lower=1e-12)),
                      "m": np.log(v.rolling(22).mean().clip(lower=1e-12))})
    Xf = X.shift(1)                                   # predictors for session t use sessions < t
    sig = pd.Series(np.nan, index=v.index)
    for y in _years(v.index):
        tr = (v.index.year < y) & Xf.notna().all(axis=1) & lv.notna()
        if tr.sum() < MIN_TRAIN:
            continue
        A = np.column_stack([np.ones(tr.sum()), Xf[tr].to_numpy()])
        beta, *_ = np.linalg.lstsq(A, lv[tr].to_numpy(), rcond=None)
        te = (v.index.year == y) & Xf.notna().all(axis=1)
        pred = np.column_stack([np.ones(te.sum()), Xf[te].to_numpy()]) @ beta
        sig[te] = np.sqrt(np.exp(pred))
    return sig


def build_models(s: pd.DataFrame) -> dict[str, pd.Series]:
    dv = _daily_vars(s)
    m: dict[str, pd.Series] = {}
    for n in (10, 20, 60):
        m[f"cc_{n}"] = _roll_sigma(dv["cc"], n)
        m[f"parkinson_{n}"] = _roll_sigma(dv["pk"], n)
        m[f"garman_klass_{n}"] = _roll_sigma(dv["gk"], n)
        m[f"rogers_satchell_{n}"] = _roll_sigma(dv["rs"], n)
        m[f"yang_zhang_{n}"] = _yang_zhang(dv, n)
    for n in (5, 20):
        m[f"rv5_{n}"] = _roll_sigma(dv["rv5"], n)
    m["ewma_cc_94"] = _ewma(dv["cc"], 0.94)
    m["ewma_cc_97"] = _ewma(dv["cc"], 0.97)
    m["ewma_pk_94"] = _ewma(dv["pk"], 0.94)
    m["garch"] = _garch(dv, student=False)
    m["garch_t"] = _garch(dv, student=True)
    m["har_rv5"] = _har(dv["rv5"])
    m["har_parkinson"] = _har(dv["pk"])
    return m


# ---------------------------------------------------------------------------------------------------------------------
# Level forecasts
# ---------------------------------------------------------------------------------------------------------------------
def sigma_forecasts(s: pd.DataFrame, sig: pd.Series) -> dict[tuple[str, float], pd.Series]:
    """q(level, tau)_t = k * sigma_t, where k = tau-quantile of level/sigma over sessions before Jan 1 of t's year."""
    out = {}
    ok = sig.notna() & (sig > 0)
    for lev in LEVELS:
        ratio = (s[lev] / sig)[ok]
        for tau in TAUS:
            q = pd.Series(np.nan, index=s.index)
            for y in _years(s.index):
                tr = ratio[ratio.index.year < y]
                if len(tr) < MIN_TRAIN:
                    continue
                k = float(np.quantile(tr, tau))
                te = ok & (s.index.year == y)
                q[te] = k * sig[te]
            out[(lev, tau)] = q
    return out


def benchmark_forecasts(s: pd.DataFrame, n: int) -> dict[tuple[str, float], pd.Series]:
    """No model: the tau-quantile of the level over the previous n sessions."""
    return {(lev, tau): s[lev].rolling(n, min_periods=n).quantile(tau).shift(1) for lev in LEVELS for tau in TAUS}


def all_forecasts(s: pd.DataFrame) -> dict[str, dict]:
    F = {name: sigma_forecasts(s, sig) for name, sig in build_models(s).items()}
    F["bench_quantile_20"] = benchmark_forecasts(s, 20)
    F["bench_quantile_60"] = benchmark_forecasts(s, 60)
    return F


# ---------------------------------------------------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------------------------------------------------
def pinball(y: np.ndarray, q: np.ndarray, tau: float) -> np.ndarray:
    u = y - q
    return np.maximum(tau * u, (tau - 1) * u)


def qlike(y: np.ndarray, f: np.ndarray) -> np.ndarray:
    """QLIKE on squared size: x/f - ln(x/f) - 1 with x = level^2, f = p50^2. Sessions with level 0 are dropped."""
    x, ff = y ** 2, f ** 2
    ok = x > 0
    r = np.full_like(x, np.nan)
    r[ok] = x[ok] / ff[ok] - np.log(x[ok] / ff[ok]) - 1
    return r


def regime(s: pd.DataFrame) -> pd.Series:
    """Point-in-time vol regime: tercile of the trailing 60-session median HL against its own trailing 500 sessions."""
    med = s["hl"].rolling(60, min_periods=60).median().shift(1)
    pct = med.rolling(500, min_periods=250).apply(lambda w: (w[:-1] < w[-1]).mean(), raw=True)
    return pd.cut(pct, [-0.01, 1 / 3, 2 / 3, 1.01], labels=["quiet", "normal", "busy"])


def common_days(s: pd.DataFrame, F: dict) -> pd.DatetimeIndex:
    ok = pd.Series(True, index=s.index)
    for fc in F.values():
        for q in fc.values():
            ok &= q.notna()
    return s.index[ok]


def score_block(s: pd.DataFrame, fc: dict, days: pd.DatetimeIndex, reg: pd.Series) -> dict:
    res = {}
    for lev in LEVELS:
        y = s.loc[days, lev].to_numpy()
        d = {"n": int(len(days))}
        pb = []
        for tau in TAUS:
            q = fc[(lev, tau)].loc[days].to_numpy()
            p = pinball(y, q, tau).mean()
            pb.append(p)
            d[f"pinball_p{int(tau*100)}"] = float(p)
            d[f"hit_p{int(tau*100)}"] = float((y > q).mean())
        d["pinball"] = float(np.mean(pb))
        q50 = fc[(lev, 0.5)].loc[days].to_numpy()
        ql = qlike(y, q50)
        d["qlike"] = float(np.nanmean(ql))
        d["qlike_dropped_zero"] = int(np.isnan(ql).sum())
        d["mz_r2"] = float(np.corrcoef(y, q50)[0, 1] ** 2) if np.std(q50) > 0 else float("nan")
        miss, by = [], {}
        for rg in ("quiet", "normal", "busy"):
            sel = (reg.loc[days] == rg).to_numpy()
            if sel.sum() < 30:
                continue
            row = {}
            for tau in (0.75, 0.90):
                hit = float((y[sel] > fc[(lev, tau)].loc[days].to_numpy()[sel]).mean())
                row[f"p{int(tau*100)}"] = hit
                miss.append(abs(hit - (1 - tau)))
            row["n"] = int(sel.sum())
            by[rg] = row
        d["regime_hits"] = by
        d["regime_miss_pp"] = float(100 * np.mean(miss)) if miss else float("nan")
        res[lev] = d
    return res


def _loss_matrix(s, fc, days, lev):
    y = s.loc[days, lev].to_numpy()
    return np.mean([pinball(y, fc[(lev, t)].loc[days].to_numpy(), t) for t in TAUS], axis=0)


def block_boot_ci(diff: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    n = len(diff)
    nb = math.ceil(n / BOOT_BLOCK)
    means = np.empty(BOOT_B)
    for b in range(BOOT_B):
        starts = rng.integers(0, max(1, n - BOOT_BLOCK + 1), nb)
        idx = np.concatenate([np.arange(st, min(st + BOOT_BLOCK, n)) for st in starts])[:n]
        means[b] = diff[idx].mean()
    return float(np.quantile(means, 0.05)), float(np.quantile(means, 0.95))


@dataclass
class Result:
    sym: str
    track: str
    payload: dict


def run(sym: str, track: str, s: pd.DataFrame | None = None, F: dict | None = None) -> Result:
    if s is None:
        s = sessions(load_m1(sym, track))
    if F is None:
        F = all_forecasts(s)
    reg = regime(s)
    days = common_days(s, F)
    disc = days[(days.year >= DISCOVERY[0]) & (days.year <= DISCOVERY[1])]
    val = days[(days.year >= VALIDATION[0]) & (days.year <= VALIDATION[1])]
    if len(disc) < 250 or len(val) < 250:
        raise RuntimeError(f"{sym} {track}: too few scored sessions (discovery {len(disc)}, validation {len(val)})")

    board = {name: {"discovery": score_block(s, fc, disc, reg), "validation": score_block(s, fc, val, reg)}
             for name, fc in F.items()}
    bench = "bench_quantile_60"

    def rel(name, part, lev):
        return board[name][part][lev]["pinball"] / board[bench][part][lev]["pinball"]

    # Approach A: one model, best mean pinball ratio (vs benchmark) over the three levels, on discovery.
    a_score = {n: float(np.mean([rel(n, "discovery", lev) for lev in LEVELS])) for n in F}
    pick_a = min(a_score, key=a_score.get)
    # Approach B: best model per level, on discovery.
    pick_b = {lev: min(F, key=lambda n: board[n]["discovery"][lev]["pinball"]) for lev in LEVELS}

    # Judge on validation: B vs A, relative change in the summed (benchmark-scaled) pinball, block bootstrap CI.
    rng = np.random.default_rng(SEED)
    la = sum(_loss_matrix(s, F[pick_a], val, lev) / board[bench]["validation"][lev]["pinball"] for lev in LEVELS)
    lb = sum(_loss_matrix(s, F[pick_b[lev]], val, lev) / board[bench]["validation"][lev]["pinball"] for lev in LEVELS)
    diff = (lb - la) / la.mean()
    lo, hi = block_boot_ci(diff, rng)
    # Winner vs benchmark on validation, per level
    vs_bench = {}
    for lev in LEVELS:
        lw = _loss_matrix(s, F[pick_b[lev]], val, lev)
        l0 = _loss_matrix(s, F[bench], val, lev)
        d = (lw - l0) / l0.mean()
        vs_bench[lev] = {"model": pick_b[lev], "rel_change": float(d.mean()), "ci90": block_boot_ci(d, rng)}

    payload = {
        "sym": sym, "track": track, "seed": SEED,
        "sessions": {"all": int(len(s)), "scored_discovery": int(len(disc)), "scored_validation": int(len(val)),
                     "first": str(s.index[0].date()), "last": str(s.index[-1].date())},
        "approach_A": {"model": pick_a, "discovery_mean_ratio": a_score[pick_a]},
        "approach_B": pick_b,
        "B_minus_A_validation": {"rel_change": float(diff.mean()), "ci90": [lo, hi],
                                 "reading": ("B better" if hi < 0 else "A better" if lo > 0 else "no clear difference")},
        "winner_vs_benchmark_validation": vs_bench,
        "scoreboard": board,
    }
    return Result(sym, track, payload)


# ---------------------------------------------------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------------------------------------------------
def to_markdown(r: Result) -> str:
    p = r.payload
    L = [f"## {r.sym} · {'futures' if r.track == 'F' else 'CFD'}", "",
         f"Sessions {p['sessions']['first']} → {p['sessions']['last']}; scored: discovery {p['sessions']['scored_discovery']}, "
         f"validation {p['sessions']['scored_validation']}.", "",
         f"- **Approach A (one model for all levels):** `{p['approach_A']['model']}`",
         f"- **Approach B (best per level):** HL `{p['approach_B']['hl']}`, OH `{p['approach_B']['oh']}`, OL `{p['approach_B']['ol']}`",
         f"- **B vs A on validation:** {100*p['B_minus_A_validation']['rel_change']:+.2f}% "
         f"[{100*p['B_minus_A_validation']['ci90'][0]:+.2f}, {100*p['B_minus_A_validation']['ci90'][1]:+.2f}] → "
         f"{p['B_minus_A_validation']['reading']}", ""]
    for lev in LEVELS:
        L += [f"### {lev.upper()} — validation scores (lower pinball / QLIKE is better; hits target 50 / 25 / 10%)", "",
              "| Model | Pinball | QLIKE | MZ R² | Hit p50 | Hit p75 | Hit p90 | Regime miss (pp) |",
              "|---|---|---|---|---|---|---|---|"]
        rows = sorted(p["scoreboard"].items(), key=lambda kv: kv[1]["validation"][lev]["pinball"])
        for name, b in rows:
            v = b["validation"][lev]
            mark = " ★" if name == p["approach_B"][lev] else ""
            L.append(f"| `{name}`{mark} | {v['pinball']:.5f} | {v['qlike']:.4f} | {v['mz_r2']:.3f} | "
                     f"{100*v['hit_p50']:.1f}% | {100*v['hit_p75']:.1f}% | {100*v['hit_p90']:.1f}% | {v['regime_miss_pp']:.2f} |")
        L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run"])
    ap.add_argument("--sym", choices=list(INSTR))
    ap.add_argument("--track", choices=["F", "C"])
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    jobs = [(s, t) for s in INSTR for t in ("F", "C")] if a.all else [(a.sym, a.track)]
    OUT.mkdir(parents=True, exist_ok=True)
    md = ["# Step 1 — HL / OH / OL forecast race", ""]
    for sym, track in jobs:
        try:
            r = run(sym, track)
        except FileNotFoundError as e:
            print(f"SKIP {e}")
            md.append(f"## {sym} · {track}\n\nNot run: {e}\n")
            continue
        (OUT / f"{sym}_{track}.json").write_text(json.dumps(r.payload, indent=1, default=float))
        md.append(to_markdown(r))
        print(f"{sym} {track}: A={r.payload['approach_A']['model']} B={r.payload['approach_B']} "
              f"B-A={100*r.payload['B_minus_A_validation']['rel_change']:+.2f}%")
    (OUT / "RESULTS.md").write_text("\n".join(md))


if __name__ == "__main__":
    main()
