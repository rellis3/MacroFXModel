"""ladder-v2 SHADOW export: today's reach ladder from each instrument's banked sigma winner, in the export text format
`pine/cog_volatility_v3_sessions.pine` parses (same rows as js/ladderExport.js).

    railway run python scripts/ladder-v2/fetch_recent.py GOLD EURUSD NQ      # refresh OANDA bars (read-only)
    python scripts/ladder-v2/export_shadow.py                                # -> analysis/output/ladder-v2-shadow/

Writes two pastes per session: `<date>_cfd.txt` (OANDA CFD charts) and `<date>_fut.txt` (futures charts: NQ1!, GC1!,
6E1!). A futures chart reads the first block whose header matches its symbol, so CFD and futures ladders live in
separate pastes; paste the one that matches the chart.

Per instrument (runbook 1.7; ledger ladder-v2-nq / -gold / -eurusd):
  NQ      har_rv_log on NY-close daily bars (OANDA), both tracks (NQ futures = CFD distribution)
  GOLD    CFD: HAR-CJ on 5-min OANDA RV.  FUT: HAR-RV 5-min on CME GC (NT8), with GC's own widths (GC ranges 2-6% wider)
  EURUSD  HAR-CJ on 5-min OANDA RV, both tracks (6E = CFD distribution)
Widths = forge.vol.fit_width_multiplier on every session through 2026-08-21 (the research window). HAR regression
coefficients are fitted on the same history. No event multiplier and no drift row (the shadow calc doesn't use them).
SHADOW ONLY: nothing live reads this.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
from forge import vol as V  # noqa: E402
import ladder as L  # noqa: E402

DATA = ROOT / "analysis/output/ladder-v2-data"
OUT = ROOT / "analysis/output/ladder-v2-shadow"
QS, TAUS = ("hl", "oc", "oh", "ol"), (50, 75, 90)
LABEL = {"hl": ("High to Low range", "75th Percentile"), "oc": ("Open to Close move", "75th Percentile"),
         "oh": ("Open High (upside)", "75th"), "ol": ("Open Low  (downside)", "75th")}
LOG: list[str] = []


def say(s):
    print(s, flush=True)
    LOG.append(s)


# ---------------------------------------------------------------- features
def rv_features(closes: pd.Series, weekdays_only=True) -> pd.DataFrame:
    """Per NY-close day (key = NY time + 7h, normalised; as ladder.ny_bars) from 5-minute closes: RV, semivariances,
    bipower variation, and the HAR-CJ / HAR-RV regressors."""
    dk = (closes.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    r = np.log(closes).groupby(dk).diff()
    g = pd.DataFrame({"r": r.to_numpy(), "dk": dk}).dropna()
    rv = (g["r"] ** 2).groupby(g["dk"]).sum()
    ar = g["r"].abs()
    prev = ar.groupby(g["dk"]).shift(1)
    bv = (np.pi / 2 * ar * prev).groupby(g["dk"]).sum()
    f = pd.DataFrame({"rv": rv, "bv": bv})
    if weekdays_only:
        f = f[f.index.dayofweek < 5]
    f = f[f["rv"] > 0]
    C = np.minimum(f["rv"], f["bv"]).where(f["bv"] > 0, f["rv"])
    J = (f["rv"] - C).clip(lower=0)
    return pd.DataFrame({
        "R5_d1": np.log(f["rv"]), "R5_d5": np.log(f["rv"].rolling(5, min_periods=5).mean()),
        "R5_d22": np.log(f["rv"].rolling(22, min_periods=22).mean()),
        "HARCJ_c1": np.log(C), "HARCJ_c5": np.log(C.rolling(5, min_periods=5).mean()),
        "HARCJ_c22": np.log(C.rolling(22, min_periods=22).mean()), "HARCJ_j1": np.log1p(J / C)})


REGCOLS = {"R5": ["d1", "d5", "d22"], "HARCJ": ["c1", "c5", "c22", "j1"]}


def fit_coef(sym, track, arm):
    f = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rvfeat_{track}_{arm}.parquet")
    cols = REGCOLS[arm]
    f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1)]
    X = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
    coef, *_ = np.linalg.lstsq(X, f["y_next"].to_numpy(), rcond=None)
    return coef, float(np.var(f["y_next"].to_numpy() - X @ coef))


def reg_sigma(F: pd.DataFrame, arm, coef, s2):
    X = np.column_stack([np.ones(len(F))] + [F[f"{arm}_{c}"] for c in REGCOLS[arm]])
    return pd.Series(np.sqrt(np.exp(X @ coef + s2 / 2)) * 100, index=F.index)      # daily %


def widths(rows: pd.DataFrame, sig_hist: pd.Series) -> dict:
    out = {}
    s = sig_hist.to_numpy()
    for q in QS:
        for t in TAUS:
            ok = np.isfinite(s) & (s > 0) & np.isfinite(rows[q].to_numpy())
            out[(q, t)] = V.fit_width_multiplier(s[ok], rows[q].to_numpy()[ok], t / 100)
    return out


# ---------------------------------------------------------------- per instrument
def nq_block(asof):
    """har_rv_log on OANDA NY-close bars; checked against the banked research sigma (E6) before use."""
    d = pd.read_parquet(DATA / "NQ_d1_recent.parquet")
    d = d[(d.index >= "2016-01-04") & (d.index.dayofweek < 5)]
    # The estimator stores the forecast for bar i+1 at slot i, so the newest bar has no slot until the next bar exists.
    # Append a placeholder bar for the session being forecast: forecasts read only data before their own day, so its
    # values never enter (checked by placeholder_check below).
    def har(df):
        ph = df.iloc[[-1]].copy(); ph.index = [df.index[-1] + pd.Timedelta(days=1)]
        for c in ("open", "high", "low"):
            ph[c] = ph["close"]
        x = pd.concat([df, ph])
        return pd.Series(V.ESTIMATORS["har_rv_log"](x.reset_index(drop=True)).astype(float), index=x.index)[:-1] / V.SQRT252
    est = har(d)
    a, b = har(d.iloc[:-1]).iloc[-1], est.iloc[-2]
    say(f"  NQ placeholder check: forecast for the last bar with a placeholder {a:.6f} vs with the real bar {b:.6f}")
    rows = pd.read_parquet(ROOT / "analysis/output/ladder-v2-nq/rows_C.parquet").set_index("date")
    chk = L.asof_before(pd.DatetimeIndex(rows.index), est.dropna())
    rel = np.nanmedian(np.abs(chk / rows["E6"].to_numpy() - 1))
    say(f"  NQ check: OANDA-bar har_rv_log vs banked research sigma, median |diff| {rel:.2%} on {len(rows)} sessions")
    m = widths(rows, rows["E6"])
    sig = float(est[est.index < asof].dropna().iloc[-1]); bar = est[est.index < asof].dropna().index[-1]
    return sig, m, bar, "har_rv_log (daily ranges)"


def oanda_regression_block(sym, arm, asof):
    """HAR-CJ / HAR-RV on 5-min OANDA RV: history features from the research rvfeat file, recent from M5 candles."""
    coef, s2 = fit_coef(sym, "C", arm)
    m5 = pd.read_parquet(DATA / f"{sym}_m5_recent.parquet")["close"]
    F = rv_features(m5)
    hist = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rvfeat_C_{arm}.parquet")
    hist = hist.rename(columns={c: f"{arm}_{c}" for c in REGCOLS[arm]})
    j = F.join(hist[[f"{arm}_{c}" for c in REGCOLS[arm]]], rsuffix="_m1", how="inner").dropna()
    if len(j):
        dev = max(float(np.median(np.abs(j[f"{arm}_{c}"] - j[f"{arm}_{c}_m1"]))) for c in REGCOLS[arm])
        say(f"  {sym} check: 5-min features from OANDA M5 vs research M1, {len(j)} overlapping days, worst median |diff| {dev:.4f} (log units)")
    rows = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/rows_C.parquet").set_index("date")
    m = widths(rows, reg_sigma(rows, arm, coef, s2))
    sig_all = reg_sigma(F.dropna(), arm, coef, s2)
    sig_all = sig_all[sig_all.index < asof]
    return float(sig_all.iloc[-1]), m, sig_all.index[-1], {"HARCJ": "HAR-CJ (5-min RV, jumps split)", "R5": "HAR-RV 5-min"}[arm]


def gc_block(asof):
    """HAR-RV 5-min on CME GC (NT8 ratio-adjusted M1), GC's own widths."""
    coef, s2 = fit_coef("GOLD", "F", "R5")
    raw = pd.read_parquet(ROOT / "analysis/output/nt8/continuous/GC_1m_ratio.parquet")
    raw.index = pd.to_datetime(raw.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    raw = raw[~raw.index.duplicated()].sort_index()
    c5 = raw["close"].resample("5min", label="left", closed="left").last().dropna()
    F = rv_features(c5)
    rows = pd.read_parquet(ROOT / "analysis/output/ladder-v2-gold/rows_F.parquet").set_index("date")
    m = widths(rows, reg_sigma(rows, "R5", coef, s2))
    sig_all = reg_sigma(F.dropna(), "R5", coef, s2)
    sig_all = sig_all[sig_all.index < asof]
    return float(sig_all.iloc[-1]), m, sig_all.index[-1], "HAR-RV 5-min (CME GC)"


# ---------------------------------------------------------------- text
def block(name, sig, m):
    pre = f"──── {name} "
    lines = [pre + "─" * max(0, 30 - len(pre)), f"Volatility (annualized) : {sig * V.SQRT252:.2f}%"]
    for q in QS:
        lab, w75 = LABEL[q]
        p50, p75, p90 = (m[(q, t)] * sig for t in TAUS)
        lines.append(f"{lab.ljust(24)}: {p50:.2f}% median · {p75:.2f}% {w75} · {p90:.2f}% 90th")
    return lines


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    now = pd.Timestamp.now(tz="Europe/London")
    sess = now.normalize().tz_localize(None)
    if now.hour >= 22:
        sess += pd.Timedelta(days=1)
    while sess.dayofweek >= 5:
        sess += pd.Timedelta(days=1)
    asof = sess                      # bars keyed before the session date = closed by 22:00 London the day before
    res = {}
    res["NQ"] = nq_block(asof)
    res["GOLD"] = oanda_regression_block("GOLD", "HARCJ", asof)
    res["EURUSD"] = oanda_regression_block("EURUSD", "HARCJ", asof)
    res["GOLD FUT"] = gc_block(asof)
    for k, (sig, m, bar, how) in res.items():
        say(f"  {k:9} sigma {sig:.3f}%/day ({sig * V.SQRT252:.2f}% ann) from {how}, as of the NY close keyed {bar.date()}")
        stale = (sess - bar).days > 4
        if stale:
            say(f"  WARNING {k}: last bar {bar.date()} is more than 4 days before the session {sess.date()}")
    head = [f"**VOL & RANGE FORECAST — SHADOW ladder-v2 (not live)**",
            f"**For session: {sess:%a %d %b %Y} (London 00:00–22:00)**",
            "Event bucket: not applied (shadow σ, no event multiplier)", ""]
    cfd = head + sum((block(n, res[n][0], res[n][1]) + [""] for n in ("GOLD", "EURUSD", "NQ")), [])
    fut = (head[:1] + [head[1].replace("**For", "**Futures charts · For")] + head[2:] +
           block("GOLD", res["GOLD FUT"][0], res["GOLD FUT"][1]) + [""] +
           block("EURUSD", res["EURUSD"][0], res["EURUSD"][1]) + [""] + block("NQ", res["NQ"][0], res["NQ"][1]) + [""])
    tag = f"{sess:%Y-%m-%d}"
    (OUT / f"{tag}_cfd.txt").write_text("\n".join(cfd), encoding="utf-8")
    (OUT / f"{tag}_fut.txt").write_text("\n".join(fut), encoding="utf-8")
    (OUT / f"{tag}_log.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n=== CFD paste ===\n" + "\n".join(cfd) + "\n=== FUTURES paste ===\n" + "\n".join(fut))


if __name__ == "__main__":
    main()
