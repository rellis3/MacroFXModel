"""raw-line-touch-clock — see forge/RAW_LINE_TOUCH_CLOCK_PREREG.md (pre-registered 2026-11-16).

  python -I scripts/raw-line-touch-clock/run.py --stage power   # non-touch bars only -> power.json (amendment A1)
  python -I scripts/raw-line-touch-clock/run.py --stage score   # scores both periods once -> touches.parquet, results

H1  line effect = log(remaining range + 0.01) - mean of the same at all bars in the (clock hour x range-used decile)
    cell, per instrument and period.            Units: U (trailing-250 median session HL, % of open).
H2  1:1 bracket, 0.20 U stop and target from the touch close, fade and follow, kind/harsh stop fills, vs a placebo at
    the same bar index in 10 random sessions within +/-60; by 2-hour London block x line group.
"""
import argparse, importlib.util, json, os, sys
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_spec = importlib.util.spec_from_file_location("rlrc", os.path.join(ROOT, "scripts/raw-level-revert-continue/run.py"))
parent = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(parent)

OUT = os.path.join(ROOT, "analysis/output/raw-line-touch-clock")
SEED = 20261116
BR = 0.20          # bracket, U
N_PLACEBO, WIN = 10, 60
LOOKBACK, MIN_HIST = 250, 120
QS = [50, 75, 90]
PERIODS = {
    "discovery": dict(dir="analysis/output/rates_residual/m15", files=list(parent.INSTR),
                      start="2019-01-01", end="2026-08-21"),
    "confirm": dict(dir="analysis/output/rate-surprise-events/m15", files=["NAS100_USD", "EUR_USD"],
                    start="2010-07-01", end="2018-12-31"),
}


def load_sessions(path):
    s = pd.read_parquet(path)["close"].dropna()
    idx = s.index
    idx = (idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")).tz_convert("Europe/London")
    df = pd.DataFrame({"c": s.values, "t": idx})
    df["d"] = df["t"].dt.tz_localize(None).dt.normalize()
    df["hr"] = df["t"].dt.hour + df["t"].dt.minute / 60
    df = df[(df["hr"] < 22) & (df["d"].dt.weekday < 5) & (df["d"] <= pd.Timestamp("2026-08-21"))]
    return [(d, g["c"].to_numpy(float), g["hr"].to_numpy(float)) for d, g in df.groupby("d", sort=True) if len(g) >= 40]


def cost(key, year, price):
    if isinstance(key, float):
        return key
    prof = parent.SPREADS[key]; yrs = sorted(prof["by_year"], key=int)
    y = str(min(max(year, int(yrs[0])), int(yrs[-1])))  # before the spread archive: earliest year (noted in prereg A1)
    return prof["by_year"][y]["med_pips"] * prof["pip"] / price


def bracket(path, j, sg, U):
    """Fade-direction outcome of a 1:1 BR bracket from close j, kind & harsh stop fills; follow = mirror. U units."""
    e = path[j]; fav = -sg * (path[j + 1:] / e - 1) / U
    up = np.nonzero(fav >= BR)[0]; dn = np.nonzero(fav <= -BR)[0]
    iu = up[0] if len(up) else 10**9; idn = dn[0] if len(dn) else 10**9
    if iu == idn == 10**9:
        last = fav[-1]
        return (last, last), (-last, -last)
    if iu < idn:  # fade target first = follow stop first
        return (BR, BR), (-BR, -fav[iu])
    return (-BR, fav[idn]), (BR, BR)  # fade stopped (kind -BR, harsh at the close), follow target


def instrument(period, file, rng, stage):
    P = PERIODS[period]
    lab, klass, ckey = parent.INSTR[file]
    S = load_sessions(os.path.join(ROOT, P["dir"], file + ".parquet"))
    dates = [x[0] for x in S]
    o = np.array([x[1][0] for x in S]); hi = np.array([x[1].max() for x in S]); lo = np.array([x[1].min() for x in S])
    cl = np.array([x[1][-1] for x in S])
    OH, OL, HL, OC = hi / o - 1, 1 - lo / o, (hi - lo) / o, np.abs(cl / o - 1)
    scored = [i for i in range(len(S)) if i >= MIN_HIST and pd.Timestamp(P["start"]) <= dates[i] <= pd.Timestamp(P["end"])]
    U = {i: np.median(HL[max(0, i - LOOKBACK):i]) for i in range(MIN_HIST, len(S))}
    # every bar: clock hour, range used, remaining range (U units)
    bars = []
    for i in scored:
        _, p, h = S[i]; u = U[i] * p[0]
        ru = (np.maximum.accumulate(p) - np.minimum.accumulate(p)) / u
        rr = (np.maximum.accumulate(p[::-1])[::-1] - np.minimum.accumulate(p[::-1])[::-1]) / u
        bars.append((i, np.floor(h).astype(int), ru, np.log(rr + 0.01)))
    allru = np.concatenate([b[2] for b in bars])
    edges = np.quantile(allru, np.linspace(0, 1, 11)[1:-1])
    s_sum = np.zeros((22, 10)); s_n = np.zeros((22, 10))
    for _, hr, ru, lrr in bars:
        dec = np.searchsorted(edges, ru, "right")
        np.add.at(s_sum, (hr, dec), lrr); np.add.at(s_n, (hr, dec), 1)
    base = s_sum / np.maximum(s_n, 1)
    if stage == "power":  # one random non-first bar per session: residual sd of the H1 outcome at ordinary moments
        res = []
        for i, hr, ru, lrr in bars:
            j = int(rng.integers(1, len(lrr) - 1)); d = np.searchsorted(edges, ru[j], "right")
            res.append((dates[i].strftime("%Y-%m-%d"), lrr[j] - base[hr[j], d]))
        return lab, res
    bar_of = {b[0]: b for b in bars}
    recs = []
    for i in scored:
        d, path, hrs = S[i]; op = path[0]; a = max(0, i - LOOKBACK); _, hr, ru, lrr = bar_of[i]
        lines = []
        fams = {"EXT": ([np.percentile(OH[a:i], q) for q in QS], [np.percentile(OL[a:i], q) for q in QS]),
                "HL": ([np.percentile(HL[a:i], q) / 2 for q in QS],) * 2,
                "OC": ([np.percentile(OC[a:i], q) for q in QS],) * 2}
        for fam, (ups, dns) in fams.items():
            for k, q in enumerate(QS):
                lines += [(fam, f"p{q}", 1, op * (1 + ups[k])), (fam, f"p{q}", -1, op * (1 - dns[k]))]
        if lo[i - 1] < op < hi[i - 1]:
            lines += [("PRIOR", "PDH", 1, hi[i - 1]), ("PRIOR", "PDL", -1, lo[i - 1])]
        for fam, rung, sg, L in lines:
            hit = np.nonzero(path[1:] >= L)[0] if sg > 0 else np.nonzero(path[1:] <= L)[0]
            if not len(hit):
                continue
            j = hit[0] + 1
            if j >= len(path) - 1:
                continue
            dec = np.searchsorted(edges, ru[j], "right")
            fade, follow = bracket(path, j, sg, U[i])
            seg = -sg * (path[j + 1:] / path[j] - 1) / U[i]
            pf, pw, pmfe, pmae = [], [], [], []
            lo_i, hi_i = max(MIN_HIST, i - WIN), min(len(S) - 1, i + WIN)
            tries = 0
            while len(pf) < N_PLACEBO and tries < N_PLACEBO * 5:
                tries += 1
                m = int(rng.integers(lo_i, hi_i + 1)); pp = S[m][1]
                if m == i or j >= len(pp) - 1 or m not in U:
                    continue
                f2, w2 = bracket(pp, j, sg, U[m]); pf.append(f2); pw.append(w2)
                s2 = -sg * (pp[j + 1:] / pp[j] - 1) / U[m]
                pmfe.append(max(s2.max(), 0)); pmae.append(max(-s2.min(), 0))
            if not pf:
                continue
            pf = np.array(pf); pw = np.array(pw)
            recs.append(dict(
                period=period, inst=lab, klass=klass, date=d.strftime("%Y-%m-%d"), year=d.year,
                line=f"{fam} {rung}", side="up" if sg > 0 else "dn", hour=int(hr[j]), block=int(hr[j]) // 2 * 2,
                U=U[i], ru=float(ru[j]), ru_dec=int(dec), lrr=float(lrr[j]), h1_effect=float(lrr[j] - base[hr[j], dec]),
                cost_U=cost(ckey, d.year, path[j]) / U[i],
                fade_kind=fade[0], fade_harsh=fade[1], follow_kind=follow[0], follow_harsh=follow[1],
                pl_fade_kind=pf[:, 0].mean(), pl_fade_harsh=pf[:, 1].mean(),
                pl_follow_kind=pw[:, 0].mean(), pl_follow_harsh=pw[:, 1].mean(),
                mfe=float(max(seg.max(), 0)), mae=float(max(-seg.min(), 0)),
                pl_mfe=float(np.mean(pmfe)), pl_mae=float(np.mean(pmae)),
            ))
    return lab, recs


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--stage", choices=["power", "score"], required=True)
    st = ap.parse_args().stage
    rng = np.random.default_rng(SEED)
    os.makedirs(OUT, exist_ok=True)
    if st == "power":
        out = {}
        for period, P in PERIODS.items():
            rows = []
            for f in P["files"]:
                _, r = instrument(period, f, rng, "power"); rows += r
            df = pd.DataFrame(rows, columns=["date", "res"])
            # clustered SE for a touch sample of the size expected, by date
            g = df.groupby("date")["res"].mean()
            out[period] = dict(n_bars=len(df), n_dates=int(g.size), sd_bar=float(df.res.std()),
                               sd_date_mean=float(g.std()))
        json.dump(out, open(os.path.join(OUT, "power.json"), "w"), indent=1)
        print(json.dumps(out, indent=1)); return
    allrecs = []
    for period, P in PERIODS.items():
        for f in P["files"]:
            lab, r = instrument(period, f, rng, "score"); allrecs += r
            print(period, lab, len(r), "touches", file=sys.stderr)
    pd.DataFrame(allrecs).to_parquet(os.path.join(OUT, "touches.parquet"))


if __name__ == "__main__":
    main()
