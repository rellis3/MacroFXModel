"""Score forge/COG_SPREAD_DIRECTION_PREREG.md: walk-forward pick of a rate-spread direction at C.OG's lines + shifted placebo.

    python scripts/cog_yield_dir/score.py
"""
import json, datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/cog_yield_dir")
B, SEED, N_PLACEBO, MIN_N, MIN_SHIFT = 2000, 20261007, 500, 150, 250
YEARS = list(range(2019, 2027))
READS = ("chg1", "chg5", "chg20", "lvl")


def fred(i):
    s = pd.read_csv(D / "fred" / f"{i}.csv")
    s.columns = ["date", "v"]
    s["v"] = pd.to_numeric(s.v, errors="coerce")
    return s.dropna().set_index("date").v


def book_stance(label):
    """Net USD stance of the yield-spread book's open trades on the OTHER pairs, per business day."""
    T = json.load(open("analysis/output/meta_label_ys/ys_run.json"))["combined"]["trades"]
    days = pd.bdate_range("2015-06-01", "2026-09-30").strftime("%Y-%m-%d")
    v = np.zeros(len(days))
    for t in T:
        if t["pair"] == label: continue
        usd = (1 if t["pair"].startswith("USD") else -1) * (1 if t["dir"] == "LONG" else -1)
        v[(days > t["date"]) & (days <= t["exitDate"])] += usd
    return pd.Series(v, index=days)


def series_for(ins):
    f = {k: fred(k) for k in ("DGS2", "DGS10", "DFII10", "T10YIE", "T10Y2Y", "T10Y3M", "DFF", "DTB3", "BAA10Y", "AAA10Y")}
    out = {"DGS2": f["DGS2"], "DGS10": f["DGS10"], "DFII10": f["DFII10"], "T10YIE": f["T10YIE"], "T10Y2Y": f["T10Y2Y"],
           "T10Y3M": f["T10Y3M"], "2Y-FF": (f["DGS2"] - f["DFF"]).dropna(), "3M-FF": (f["DTB3"] - f["DFF"]).dropna(),
           "DFF": f["DFF"], "BAA10Y": f["BAA10Y"], "BAA-AAA": (f["BAA10Y"] - f["AAA10Y"]).dropna(),
           "BOOK-USD": book_stance(ins)}
    return {k: v[v.index >= "2010-01-01"].sort_index() for k, v in out.items()}


def features(s):
    return {"chg1": s.diff(1).to_numpy(), "chg5": s.diff(5).to_numpy(), "chg20": s.diff(20).to_numpy(),
            "lvl": (s - s.rolling(252).median()).to_numpy()}


def prev_bd(d):
    x = dt.date.fromisoformat(d) - dt.timedelta(days=1)
    while x.weekday() >= 5: x -= dt.timedelta(days=1)
    return x.isoformat()


def build_index(ser, dates):
    """For each trade date: position of the last observation strictly before the previous business day (-1 if none)."""
    cut = np.array([prev_bd(d) for d in dates])
    return {k: np.searchsorted(s.index.to_numpy(), cut, side="left") - 1 for k, s in ser.items()}


def signal_matrix(feat, pos, offsets):
    cols, names = [], []
    for k in feat:
        n = len(feat[k]["chg1"])
        p = pos[k]
        q = np.where(p >= 0, (p + offsets.get(k, 0)) % n, -1)
        for r in READS:
            v = np.where(q >= 0, feat[k][r][np.maximum(q, 0)], np.nan)
            cols.append(np.sign(np.nan_to_num(v, nan=0.0))); names.append(f"{k}:{r}")
    return np.stack(cols, 1), names


def walk_forward(T, S_by_ins, names):
    """Returns OOS kept trades (ins,date,R), the no-filter baseline, and the picks."""
    keep_rows, base_rows, picks = [], [], []
    for ins, g in T.groupby("ins"):
        S = S_by_ins[ins]; idx = g.index.to_numpy()
        side, R, setup, year = g.side.to_numpy(), g.R.to_numpy(), g.setup.to_numpy(), g.year.to_numpy()
        Sg = S[idx]
        for Y in YEARS:
            tr, te = year < Y, year == Y
            if not te.any(): continue
            best = None
            for st in ("A", "C"):
                m = tr & (setup == st)
                for s in (1, -1):
                    K = (side[m, None] == s * Sg[m]) & (Sg[m] != 0)
                    n = K.sum(0)
                    mu = np.where(n >= MIN_N, (K * R[m, None]).sum(0) / np.maximum(n, 1), -np.inf)
                    j = int(np.argmax(mu))
                    if best is None or mu[j] > best[0]: best = (mu[j], st, s, j)
            _, st, s, j = best
            m = te & (setup == st)
            k = m & (side == s * Sg[:, j]) & (Sg[:, j] != 0)
            keep_rows.append(g[k][["ins", "date", "R"]]); base_rows.append(g[m][["ins", "date", "R"]])
            picks.append(dict(ins=ins, year=Y, setup=st, signal=names[j], sign=s, train_meanR=round(float(best[0]), 4),
                              test_n=int(k.sum()), test_meanR=round(float(g.R.to_numpy()[k].mean()), 4) if k.any() else None))
    return pd.concat(keep_rows), pd.concat(base_rows), picks


def boot(a, b=None, rng=None):
    months = sorted(set(a.date.str[:7]) | (set(b.date.str[:7]) if b is not None else set()))
    ga = {m: x.R.to_numpy() for m, x in a.groupby(a.date.str[:7])}
    gb = {m: x.R.to_numpy() for m, x in b.groupby(b.date.str[:7])} if b is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(months, len(months))
        x = np.concatenate([ga.get(m, np.empty(0)) for m in pick]); v = x.mean() if len(x) else np.nan
        if gb is not None:
            y = np.concatenate([gb.get(m, np.empty(0)) for m in pick]); v -= y.mean() if len(y) else np.nan
        reps.append(v)
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    return dict(est=round(float(a.R.mean() - (b.R.mean() if b is not None else 0)), 4), lo=round(float(lo), 4), hi=round(float(hi), 4))


def main():
    T = pd.read_csv(D / "trades.csv")
    T["year"] = T.date.str[:4].astype(int)
    rng = np.random.default_rng(SEED)
    feat, pos, S_real, names = {}, {}, {}, None
    for ins in ("EURUSD", "GOLD", "NQ"):
        ser = series_for(ins)
        feat[ins] = {k: features(s) for k, s in ser.items()}
        g = T[T.ins == ins]
        pos[ins] = (g.index.to_numpy(), build_index(ser, g.date.to_numpy()))
    def S_all(offsets_by_ins):
        out = {}
        for ins in feat:
            idx, p = pos[ins]
            S, nm = signal_matrix(feat[ins], p, offsets_by_ins.get(ins, {}))
            full = np.zeros((len(T), S.shape[1])); full[idx] = S
            out[ins] = full
        return out, nm
    S_real, names = S_all({})
    kept, base, picks = walk_forward(T, S_real, names)
    res = {"oos": boot(kept, rng=rng) | {"n": int(len(kept))}, "oos_minus_nofilter": boot(kept, base, rng=rng),
           "oos_by_ins": {i: dict(n=int(len(x)), meanR=round(float(x.R.mean()), 4)) for i, x in kept.groupby("ins")},
           "nofilter_oos": round(float(base.R.mean()), 4), "picks": picks}
    # placebo: every series circularly shifted by an independent offset >= MIN_SHIFT observations (same offsets across
    # instruments for the shared FRED series; the book stance shifts per instrument)
    pl = []
    for r in range(N_PLACEBO):
        offs = {k: int(rng.integers(MIN_SHIFT, len(feat["EURUSD"][k]["chg1"]) - MIN_SHIFT)) for k in feat["EURUSD"] if k != "BOOK-USD"}
        by = {ins: offs | {"BOOK-USD": int(rng.integers(MIN_SHIFT, len(feat[ins]["BOOK-USD"]["chg1"]) - MIN_SHIFT))} for ins in feat}
        Sp, _ = S_all(by)
        kp, _, _ = walk_forward(T, Sp, names)
        pl.append(float(kp.R.mean()))
        if (r + 1) % 50 == 0: print("placebo", r + 1, flush=True)
    pl = np.array(pl)
    res["placebo"] = dict(runs=N_PLACEBO, median=round(float(np.median(pl)), 4), p95=round(float(np.percentile(pl, 95)), 4),
                          real_beats_pct=round(float((res["oos"]["est"] > pl).mean() * 100), 1))
    # in-sample best of 192 per instrument (what cherry-picking would have claimed) + top 8 full-sample choices
    res["in_sample_top"] = {}
    for ins, g in T.groupby("ins"):
        S = S_real[ins][g.index.to_numpy()]; side, R, setup = g.side.to_numpy(), g.R.to_numpy(), g.setup.to_numpy()
        rows = []
        for st in ("A", "C"):
            m = setup == st
            for s in (1, -1):
                K = (side[m, None] == s * S[m]) & (S[m] != 0); n = K.sum(0)
                mu = (K * R[m, None]).sum(0) / np.maximum(n, 1)
                rows += [dict(setup=st, signal=names[j], sign=s, n=int(n[j]), meanR=round(float(mu[j]), 4)) for j in range(len(names)) if n[j] >= MIN_N]
        res["in_sample_top"][ins] = sorted(rows, key=lambda x: -x["meanR"])[:8]
    o, mn, P = res["oos"], res["oos_minus_nofilter"], res["placebo"]
    res["verdict"] = "PASS" if (o["lo"] > 0 and mn["lo"] > 0 and P["real_beats_pct"] >= 95) else "FAIL"
    (D / "results.json").write_text(json.dumps(res, indent=1))

    f = lambda c: f"{c['est']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}]"
    md = ["# Rate-spread direction at C.OG's lines (results)", "",
          "Pre-registration: `forge/COG_SPREAD_DIRECTION_PREREG.md`. EURUSD/GOLD/NQ, 2016-10 → 2026-08. 12 spreads (fed funds, curve, "
          "real yields, breakevens, credit, the yield book's USD stance on other pairs) × 4 reads × sign × fade (A) / continue (C) = 192 "
          "choices per instrument, picked on past years only, scored on the next year (2019–2026). R after costs.", "",
          f"## Verdict: **{res['verdict']}**", "",
          f"- Out-of-sample mean R: **{f(o)}** (n {o['n']})",
          f"- Minus the same setups with no filter: {f(mn)} (no-filter OOS {res['nofilter_oos']:+.3f})",
          f"- Placebo (spreads shifted in time, {P['runs']} runs): median {P['median']:+.3f}, 95th pct {P['p95']:+.3f}; real beats {P['real_beats_pct']}%",
          "- By instrument OOS: " + ", ".join(f"{i} {v['meanR']:+.3f} (n {v['n']})" for i, v in res["oos_by_ins"].items()), "",
          "## What each instrument picked each year (stability)", "", "| ins | year | setup | spread:read | sign | train R | test n | test R |", "|---|---|---|---|---|---|---|---|"]
    for p in picks:
        md.append(f"| {p['ins']} | {p['year']} | {p['setup']} | {p['signal']} | {p['sign']:+d} | {p['train_meanR']:+.3f} | {p['test_n']} | "
                  f"{(p['test_meanR'] if p['test_meanR'] is not None else float('nan')):+.3f} |")
    md += ["", "## In-sample best of 192 on the full period (what cherry-picking would claim; NOT evidence)", ""]
    for ins, rows in res["in_sample_top"].items():
        md.append(f"- **{ins}**: " + "; ".join(f"{r['setup']} {r['signal']} {r['sign']:+d} {r['meanR']:+.3f} (n {r['n']})" for r in rows))
    (D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md).encode("ascii", "replace").decode())


if __name__ == "__main__":
    main()
