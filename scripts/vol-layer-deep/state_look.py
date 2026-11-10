"""Stage 2 look for layer 1 (vol state): charts for vol-layer-system.html. Nothing is scored as a trade.

    python -X utf8 scripts/vol-layer-deep/state.py look   (or run this file)  ->  backtest-data/vol-layer/state-look.json
Reads analysis/output/vol-layer-deep/state/sessions.parquet written by state.py build. Discovery window only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer-deep")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
import state as ST  # noqa: E402
from forecast_record import klass  # noqa: E402

F = ["F1", "F2", "F3", "F4", "F5"]
NAME = {"F1": "σ now", "F2": "Δσ expected", "F3": "σ vs long-run", "F4": "P(high regime)", "F5": "forecast error"}
INTRO = []          # filled from intro.json after the numbers are read (see main)


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def within_rank(D, col, q=10):
    return D.groupby("inst")[col].transform(lambda s: pd.qcut(s.rank(method="first"), q, labels=False))


def acf(x, lags):
    x = x - np.nanmean(x)
    v = np.nanmean(x * x)
    return [np.nanmean(x[k:] * x[:-k]) / v for k in lags]


def qlike(rv, h):
    z = rv / h
    return z - np.log(z) - 1


def past_scale(D, col, tgt="rv5"):
    """Per instrument, expanding mean of target/forecast over earlier sessions only (>= 60), used to put each forecast
    on the target's scale without looking ahead."""
    z = D[tgt] / D[col]
    return z.groupby(D.inst).transform(lambda s: s.expanding(60).mean().shift(1))


def main():
    D = pd.read_parquet(ST.OUT / "sessions.parquet")
    assert D.date.max() <= ST.END
    D["klass"] = D.inst.map(klass)
    D["year"] = D.date.str[:4]
    D["lhl"] = np.log(D.hl_s)
    D["sig2"] = D.sig ** 2
    D["hl2"] = D.hl ** 2                 # squared session range: a second, independent variance proxy (Patton 2011)
    D["fb"] = D.sig2 * np.exp(2 * D.F5_ew)
    for c in ["sig2", "har1", "garch", "garch_vt", "rw", "fb"]:
        D[f"{c}_h"] = D[c] * past_scale(D, c)
        D[f"{c}_g"] = D[c] * past_scale(D, c, "hl2")
    C = D.dropna(subset=F + ["sig2_h", "har1_h", "garch_h", "garch_vt_h", "rw_h", "fb_h", "hl_s"]).copy()
    C = C[C.date >= "2018-01-01"].copy()
    print("common sample", len(C), C.date.min(), C.date.max(), C.inst.nunique())
    bs = LR.Boot(C.date)
    charts, num = [], {}

    # ---- 1 persistence
    lags = [1, 2, 3, 5, 10, 20, 40, 60]
    ac = {}
    for f in F + ["lrv", "lhl"]:
        vals = np.array([acf(g[f].to_numpy(float), lags) for _, g in C.groupby("inst")])
        ac[f] = vals.mean(0)
    num["acf"] = {k: [round(float(v), 3) for v in a] for k, a in ac.items()}
    charts.append({"type": "lines", "title": "How long each field persists: autocorrelation by lag", "unit": "autocorrelation", "xlabel": "lag (sessions)",
                   "note": f"Average over 34 instruments, 2018-2022. Benchmark: a shuffled field is 0 at every lag. Realised log RV5 (the raw thing) is the reference for 'how sticky is vol itself'. Not drawn: Δσ expected ({ac['F2'][0]:.2f} at lag 1, {ac['F2'][5]:.2f} at 20) and σ vs long-run ({ac['F3'][0]:.2f}, {ac['F3'][5]:.2f}), which tracks σ now.",
                   "series": [{"name": NAME[f], "points": [[l, round(float(v), 3)] for l, v in zip(lags, ac[f])]} for f in ["F1", "F4", "F5"]]
                   + [{"name": "realised log RV5", "points": [[l, round(float(v), 3)] for l, v in zip(lags, ac["lrv"])]}]})

    # ---- 2 correlation and dimension
    Z = C[F].groupby(C.inst).transform(lambda s: (s - s.mean()) / s.std())
    R = Z.corr().to_numpy()
    pairs = [(i, j) for i in range(5) for j in range(i + 1, 5)]
    rng = np.random.default_rng(ST.SEED)
    sh = Z.copy()
    for f in F:
        sh[f] = sh[f].to_numpy()[rng.permutation(len(sh))]
    Rs = sh.corr().to_numpy()
    num["corr"] = {f"{F[i]}-{F[j]}": round(float(R[i, j]), 3) for i, j in pairs}
    charts.append({"type": "bars", "title": "How much the five fields overlap: correlation of each pair", "unit": "correlation", "ref": 0,
                   "note": f"Within-instrument z-scores, 2018-2022, 34 instruments pooled. Benchmark: shuffling rows gives |r| ≤ {np.abs(Rs[np.triu_indices(5, 1)]).max():.3f}. Above ~0.7 the two fields carry the same information.",
                   "rows": [{"label": f"{NAME[F[i]]} vs {NAME[F[j]]}", "value": round(float(R[i, j]), 3)} for i, j in pairs]})
    ev = np.sort(np.linalg.eigvalsh(R))[::-1]
    num["eig_share"] = [round(float(v / ev.sum() * 100), 1) for v in ev]
    charts.append({"type": "bars", "title": "Degrees of freedom: share of the five fields' variance on each principal component", "unit": "% of variance", "ref": 20,
                   "note": "If the five fields were independent each component would hold 20% (the reference line). Components holding well under 20% add little new information.",
                   "rows": [{"label": f"component {k + 1}", "value": round(float(v / ev.sum() * 100), 1)} for k, v in enumerate(ev)]})

    # ---- 3 calibration of the session range by decile of each field (benchmark: sigma alone = flat line)
    base = float(C.hl_s.mean())
    cal = {}
    for f in F:
        C[f + "_d"] = within_rank(C, f)
        cal[f] = C.groupby(f + "_d").hl_s.mean()
    C["shuf_d"] = C.groupby("inst").F5_d.transform(lambda s: s.sample(frac=1, random_state=ST.SEED).to_numpy())
    cal["shuf"] = C.groupby("shuf_d").hl_s.mean()
    num["cal_base"] = round(base, 3)
    num["cal"] = {k: [round(float(v), 3) for v in s] for k, s in cal.items()}
    charts.append({"type": "lines", "title": "Session range ÷ σ by decile of each field", "unit": "high-low ÷ σ", "xlabel": "decile of the field (1 = lowest, within instrument)",
                   "note": f"If σ alone were enough, every line would sit flat at the all-session mean {base:.2f}. A slope means the field knows something σ does not. Deciles over the whole window (descriptive, not a rule). Δσ expected is in the next chart.",
                   "series": [{"name": NAME[f], "points": [[k + 1, round(float(v), 3)] for k, v in cal[f].items()]} for f in ["F1", "F3", "F4", "F5"]]})
    rows = []
    for f in F + ["shuf"]:
        col = f + "_d" if f != "shuf" else "shuf_d"
        top, bot = C[C[col] == 9], C[C[col] == 0]
        a, ra = bs.mean(top.date, top.hl_s.to_numpy(float))
        b, rb = bs.mean(bot.date, bot.hl_s.to_numpy(float))
        d = ra - rb
        rows.append({"label": NAME.get(f, "shuffled field (benchmark)"), "value": r4(a[0] - b[0]), "lo": r4(np.nanpercentile(d, 2.5)), "hi": r4(np.nanpercentile(d, 97.5))})
    num["topbot"] = rows
    charts.append({"type": "bars", "title": "Top decile minus bottom decile of each field: session range ÷ σ", "unit": "Δ (high-low ÷ σ)", "ref": 0,
                   "note": "95% date-block bootstrap. Benchmark: a shuffled field (last row) and 0. A positive bar: when the field is high, σ under-states the day's range.",
                   "rows": rows})

    # ---- 4 forecast skill: QLIKE ratio to sigma (lower = better)
    for c in ["sig2", "har1", "garch", "garch_vt", "rw", "fb"]:
        C["Q_" + c] = qlike(C.rv5, C[c + "_h"])
    lab = {"har1": "log-HAR on RV5", "garch": "GARCH(1,1), free MLE", "garch_vt": "GARCH(1,1), variance-targeted", "rw": "yesterday's RV (random walk)", "fb": "σ × error feedback (F5)"}
    rows = []
    for c in ["har1", "garch_vt", "garch", "fb", "rw"]:
        v, _ = bs.ratio(C.date, C["Q_" + c].to_numpy(float), C.date, C.Q_sig2.to_numpy(float))
        rows.append({"label": lab[c], "value": v[0], "lo": v[1], "hi": v[2]})
    num["qlike_all"] = rows
    num["qlike_sig_mean"] = r4(C.Q_sig2.mean())
    charts.append({"type": "bars", "title": "Forecast loss against the live σ: QLIKE ratio, all 34 instruments, 2018-2022", "unit": "QLIKE ÷ live σ", "ref": 1,
                   "note": "Below 1 = a better forecast of the session's 5-min realised variance than the live σ. Every forecast is put on the RV5 scale with a past-only expanding mean, so this is shape, not level. 95% date-block bootstrap. Yesterday's RV is the naive benchmark.",
                   "rows": rows})
    grp = []
    for c in ["har1", "garch_vt", "garch", "fb", "rw"]:
        qa = C["Q_" + c].sum() / C.Q_sig2.sum()
        qb = qlike(C.hl2, C[c + "_g"]).sum() / qlike(C.hl2, C.sig2_g).sum()
        grp.append({"label": lab[c], "values": [round(float(qa), 4), round(float(qb), 4)]})
    num["qlike_two_targets"] = grp
    charts.append({"type": "groups", "title": "Same race, two yardsticks: 5-min realised variance vs squared session range", "names": ["target RV5", "target range²"], "unit": "QLIKE ÷ live σ",
                   "note": "HAR is fitted on RV5, so it has home advantage on the RV5 yardstick. The squared high-low of the session is a separate proxy (both are valid for QLIKE up to scale). If a model wins on both, it is not just matching its own measure. Benchmark: 1 = live σ.",
                   "rows": grp})
    yrs = sorted(C.year.unique())
    grp = []
    for y in yrs:
        g = C[C.year == y]
        grp.append({"label": y, "values": [round(float(g["Q_" + c].sum() / g.Q_sig2.sum()), 4) for c in ["har1", "garch_vt", "fb"]]})
    num["qlike_year"] = grp
    charts.append({"type": "groups", "title": "QLIKE ÷ live σ, year by year", "names": [lab["har1"], lab["garch_vt"], lab["fb"]], "unit": "QLIKE ÷ live σ",
                   "note": "Stability check. 1.00 = same loss as the live σ; below 1 = better. GARCH is fitted on NY-close daily returns; its 2018 fits use about 300 bars.", "rows": grp})
    pr = []
    for s, g in C.groupby("inst"):
        pr.append({"label": s, "value": round(float(g.Q_har1.sum() / g.Q_sig2.sum()), 4), "k": klass(s)})
    pr.sort(key=lambda r: r["value"])
    num["qlike_inst"] = {r["label"]: r["value"] for r in pr}
    charts.append({"type": "bars", "title": "Per instrument: log-HAR loss ÷ live σ loss", "unit": "QLIKE ÷ live σ", "ref": 1,
                   "note": "Below 1: a model on M1 realised variance forecasts that instrument's session variance better than the live daily-bar σ. Benchmark: 1.",
                   "rows": [{"label": r["label"], "value": r["value"]} for r in pr]})

    # ---- 5 expected change: does F2 predict next week's vol change? (benchmark: no change = 0, and mean reversion from F3)
    E = C.dropna(subset=["dlv_real"]).copy()
    E["F2_d"] = within_rank(E, "F2")
    g = E.groupby("F2_d").agg(x=("F2", "mean"), y=("dlv_real", "mean"))
    c2 = float(np.corrcoef(E.F2, E.dlv_real)[0, 1]); c3 = float(np.corrcoef(-E.F3, E.dlv_real)[0, 1])
    b2 = float(np.polyfit(E.F2, E.dlv_real, 1)[0])
    num["dsig"] = {"corr_F2": round(c2, 3), "corr_minusF3": round(c3, 3), "slope_F2": round(b2, 3)}
    charts.append({"type": "lines", "title": "Expected change in vol vs what happened next week", "unit": "realised change, log vol", "xlabel": "predicted change (Δσ expected, decile means)",
                   "note": f"Realised = half log of mean RV5 over the next 5 sessions ÷ the last 5. Perfect forecast lies on the diagonal; 'no change' is the flat 0 line. Correlation {c2:.2f} for Δσ expected vs {c3:.2f} for plain mean reversion (−σ vs long-run). Slope {b2:.2f}.",
                   "series": [{"name": "Δσ expected", "points": [[round(float(a), 3), round(float(b), 3)] for a, b in zip(g.x, g.y)]},
                              {"name": "perfect", "points": [[round(float(g.x.min()), 3), round(float(g.x.min()), 3)], [round(float(g.x.max()), 3), round(float(g.x.max()), 3)]]},
                              {"name": "no change", "points": [[round(float(g.x.min()), 3), 0], [round(float(g.x.max()), 3), 0]]}]})

    # ---- 6 regimes: does each field rank the next 'loud' session? AUC, label = RV5 above the trailing-year 80th pct (past only)
    thr = D.groupby("inst").rv5.transform(lambda s: s.shift(1).rolling(252, min_periods=120).quantile(0.8))
    C["loud"] = (C.rv5 > thr.loc[C.index]).astype(float)
    C.loc[~np.isfinite(thr.loc[C.index]), "loud"] = np.nan
    A = C.dropna(subset=["loud"])
    from scipy.stats import rankdata

    def auc(x, y):
        out = []
        for _, g in A.groupby("inst"):
            r = rankdata(g[x]); p = g[y].to_numpy() == 1; n1, n0 = p.sum(), (~p).sum()
            if n1 and n0:
                out.append((r[p].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
        return float(np.mean(out))
    A = A.assign(lrw=np.log(A.rw), lhar=np.log(A.har1))
    au = {f: auc(f, "loud") for f in F + ["lrw", "lhar"]}
    num["auc"] = {k: round(v, 3) for k, v in au.items()}
    num["loud_rate"] = round(float(A.loud.mean()), 3)
    charts.append({"type": "bars", "title": "Which field best ranks the next loud session?", "unit": "AUC (0.5 = coin flip)", "ref": 0.5,
                   "note": f"Loud = the session's RV5 above its own trailing-year 80th percentile (threshold past-only; {A.loud.mean() * 100:.0f}% of sessions). AUC per instrument, averaged. Benchmarks: 0.5 and σ now (the live σ).",
                   "rows": [{"label": NAME.get(k, {"lrw": "yesterday's RV", "lhar": "log-HAR forecast"}.get(k)), "value": round(v, 3)} for k, v in au.items()]})

    # ---- 7 real days: regime transitions (EURUSD early 2020) and the five fields (GBPUSD autumn 2022)
    def window(sym, a, b):
        return C[(C.inst == sym) & (C.date >= a) & (C.date <= b)].reset_index(drop=True)
    w = window("EURUSD", "2020-01-02", "2020-06-30")
    num["ex_eur"] = {"n": len(w), "first_hi": w.date[w.F4 > 0.5].min() if (w.F4 > 0.5).any() else None}
    marks = {d: i for i, d in enumerate(w.date)}
    charts.append({"type": "lines", "title": "Real days: EURUSD, Jan-Jun 2020, the regime probability vs σ and realised vol", "unit": "see note", "xlabel": f"session number from {w.date.iloc[0]}",
                   "note": f"P(high regime) is the predicted probability for each session from data up to the day before. σ ÷ 1-year median and realised √RV5 ÷ σ show why it moves. Session {marks.get('2020-03-09', '?')} = 9 Mar 2020, {marks.get('2020-03-19', '?')} = 19 Mar. Benchmark: σ alone (the σ ÷ median line).",
                   "series": [{"name": "P(high regime)", "points": [[i, r4(v)] for i, v in enumerate(w.F4)]},
                              {"name": "σ ÷ 1-year median", "points": [[i, r4(np.exp(v))] for i, v in enumerate(w.F3)]},
                              {"name": "realised √RV5 ÷ σ", "points": [[i, r4(np.sqrt(a) / b)] for i, (a, b) in enumerate(zip(w.rv5, w.sig))]}]})
    w = window("GBPUSD", "2022-08-01", "2022-11-30")
    zc = {f: (C.loc[C.inst == "GBPUSD", f].mean(), C.loc[C.inst == "GBPUSD", f].std()) for f in F}
    marks = {d: i for i, d in enumerate(w.date)}
    charts.append({"type": "lines", "title": "Real days: GBPUSD, Aug-Nov 2022 (mini-budget), four of the five fields", "unit": "z-score within GBPUSD", "xlabel": f"session number from {w.date.iloc[0]}",
                   "note": f"Each field as a z-score over GBPUSD 2018-2022. Session {marks.get('2022-09-23', '?')} = Fri 23 Sep (mini-budget), {marks.get('2022-09-26', '?')} = Mon 26 Sep (record low). σ vs long-run is left out: it moves with σ now. Benchmark: 0 = an ordinary GBPUSD day.",
                   "series": [{"name": NAME[f], "points": [[i, r4((v - zc[f][0]) / zc[f][1])] for i, v in enumerate(w[f])]} for f in ["F1", "F2", "F4", "F5"]]})

    # ---- 8 stability: top-quintile minus bottom-quintile range ÷ σ, per year
    for f in ["F2", "F4", "F5"]:
        C[f + "_q"] = within_rank(C, f, 5)
    grp = []
    for y in yrs:
        g = C[C.year == y]
        grp.append({"label": y, "values": [round(float(g[g[f + "_q"] == 4].hl_s.mean() - g[g[f + "_q"] == 0].hl_s.mean()), 3) for f in ["F2", "F4", "F5"]]})
    num["stab_year"] = grp
    charts.append({"type": "groups", "title": "Year by year: top fifth minus bottom fifth of each field, session range ÷ σ", "names": [NAME["F2"], NAME["F4"], NAME["F5"]], "unit": "Δ (high-low ÷ σ)",
                   "note": "Same sign every year = a stable effect. Benchmark 0 (σ alone). Quintiles within instrument over the whole window.", "rows": grp})
    grp = []
    for k, g in C.groupby("klass"):
        grp.append({"label": k, "values": [round(float(g[g[f + "_q"] == 4].hl_s.mean() - g[g[f + "_q"] == 0].hl_s.mean()), 3) for f in ["F2", "F4", "F5"]]})
    num["stab_class"] = grp
    charts.append({"type": "groups", "title": "By class: top fifth minus bottom fifth, session range ÷ σ", "names": [NAME["F2"], NAME["F4"], NAME["F5"]], "unit": "Δ (high-low ÷ σ)",
                   "note": "Same look per instrument class. Benchmark 0.", "rows": grp})

    # ---- 9 entry and stop: adverse excursion from the open, by state
    C["adv1"] = 0.5 * ((C.oh_s >= 1.0).astype(float) + (C.ol_s >= 1.0).astype(float))
    C["s4"] = pd.cut(C.F4, [-0.01, 0.2, 0.8, 1.01], labels=["low", "mid", "high"])
    C["s5"] = np.where(C.F5_q >= 3, "under-forecast", np.where(C.F5_q <= 1, "over-forecast", "fair"))
    rows = []
    allv, _ = bs.mean(C.date, C.adv1.to_numpy(float))
    rows.append({"label": "all sessions (σ alone)", "value": allv[0], "lo": allv[1], "hi": allv[2]})
    for a in ["low", "high"]:
        for b in ["over-forecast", "under-forecast"]:
            g = C[(C.s4 == a) & (C.s5 == b)]
            v, _ = bs.mean(g.date, g.adv1.to_numpy(float))
            rows.append({"label": f"P(high) {a}, recent error {b} ({len(g):,})", "value": v[0], "lo": v[1], "hi": v[2]})
    num["adv1"] = rows
    charts.append({"type": "bars", "title": "Chance a 1σ stop from the open is reached, by vol state", "unit": "share of sessions", "ref": allv[0],
                   "note": "A position opened at 00:00 London either way, stop 1σ (live σ) away, held to 22:00. Reference line = all sessions, which is what σ alone implies. P(high) low < 0.2, high > 0.8; recent error = F5 bottom or top two fifths. 95% date-block bootstrap.",
                   "rows": rows})
    wid = {}
    for f in ["F1", "F4", "F5"]:
        adv = pd.concat([C[["date", f + "_d", "oh_s"]].rename(columns={"oh_s": "a"}), C[["date", f + "_d", "ol_s"]].rename(columns={"ol_s": "a"})])
        wid[f] = adv.groupby(f + "_d").a.quantile(0.8)
    p80 = float(np.quantile(np.r_[C.oh_s, C.ol_s], 0.8))
    num["p80"] = {k: [round(float(v), 3) for v in s] for k, s in wid.items()}
    num["p80_all"] = round(p80, 3)
    charts.append({"type": "lines", "title": "Stop width that is hit on only 20% of sessions, by decile of the state", "unit": "σ from the open", "xlabel": "decile of the field (within instrument)",
                   "note": f"80th percentile of the adverse move from the open, either side, in live σ. Benchmark: one width for all days, {p80:.2f}σ (flat line).",
                   "series": [{"name": NAME[f], "points": [[k + 1, round(float(v), 3)] for k, v in wid[f].items()]} for f in ["F1", "F4", "F5"]]
                   + [{"name": "σ alone (one width)", "points": [[1, round(p80, 3)], [10, round(p80, 3)]]}]})
    # time of day: share of the session's RV by London hour
    H = [f"h{k}" for k in range(22)]
    tod = {}
    for nm, g in [("P(high) > 0.8", C[C.F4 > 0.8]), ("P(high) < 0.2", C[C.F4 < 0.2]), ("all sessions", C)]:
        sh_ = g[H].div(g[H].sum(1), axis=0).mean()
        tod[nm] = [round(float(v) * 100, 2) for v in sh_]
    num["tod"] = tod
    charts.append({"type": "lines", "title": "When the vol arrives: share of the session's realised variance by London hour", "unit": "% of session RV", "xlabel": "London hour",
                   "note": "Average share per hour of 5-min realised variance, 00:00-22:00 London. Benchmark: all sessions. If the high state only scales the day up, the lines coincide.",
                   "series": [{"name": k, "points": [[h, v] for h, v in enumerate(vals)]} for k, vals in tod.items()]})

    # ---- 10 concrete sessions: EURUSD paths from the open in sigma, high vs low state
    rng = np.random.default_rng(ST.SEED)
    eu = C[C.inst == "EURUSD"]
    pick = [("high", eu[eu.F4 > 0.9]), ("low", eu[eu.F4 < 0.1])]
    m1 = ST.load_m1("EURUSD")
    loc = m1.index.tz_convert(ST.LON).tz_localize(None)
    codes, uniq = pd.factorize(loc.normalize())
    dstr = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    mins = (loc.hour * 60 + loc.minute).to_numpy()
    w80 = {s: float(np.quantile(np.r_[C[C.s4 == s].oh_s, C[C.s4 == s].ol_s], 0.8)) for s in ["low", "high"]}
    num["w80_state"] = {k: round(v, 3) for k, v in w80.items()}
    trades = []
    for st_, g in pick:
        for i in rng.choice(len(g), size=4, replace=False):
            r = g.iloc[i]
            m = (dstr == r.date) & (mins < 22 * 60)
            c, t = m1.close.to_numpy()[m], mins[m]
            path = [[int(tt), round(float(np.log(x / c[0]) * 100 / r.sig), 3)] for tt, x in zip(t[::10], c[::10])]
            trades.append({"inst": "EURUSD", "date": r.date, "side": f"P(high) {r.F4:.2f}, error {r.F5:+.2f}, σ {r.sig:.2f}%",
                           "r": round(float(np.log(c[-1] / c[0]) * 100 / r.sig), 2), "unit": "σ at 22:00", "stop": round(-w80[st_], 2), "target": round(w80[st_], 2), "path": path})
    trades.sort(key=lambda z: z["date"])
    charts.append({"type": "trades", "title": "Real EURUSD sessions: the path from the open in σ, four high-state and four low-state days", "unit": "σ from the open",
                   "note": f"Lines at ± the 20%-hit width of each state (high {w80['high']:.2f}σ, low {w80['low']:.2f}σ; one width for all days would be {p80:.2f}σ). x = London minute. Seeded pick.",
                   "trades": trades})

    intro_p = ST.OUT / "intro.json"
    intro = json.loads(intro_p.read_text(encoding="utf-8")) if intro_p.exists() else ["(intro not written yet)"]
    res = {"id": "state-look", "window": [ST.START, ST.END], "intro": intro, "charts": charts}
    s = json.dumps(res, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    ST.WEB.mkdir(parents=True, exist_ok=True)
    (ST.WEB / "state-look.json").write_text(s, encoding="utf-8")
    (ST.OUT / "numbers.json").write_text(json.dumps(num, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("charts", len(charts), "bytes", len(s))


if __name__ == "__main__":
    main()
