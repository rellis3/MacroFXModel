"""STIR residual R1-R3 (forge/STIR_RESIDUAL_PREREG.md): do short-rate futures lead price?

    python scripts/rates_residual/stir_study.py

R1 reuses the S1 construction of scripts/rates_residual/study.py (same functions, copied: that script runs on import).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
STIR = Path("analysis/output/stir")
OUT = Path("analysis/output/stir_residual")
OUT.mkdir(parents=True, exist_ok=True)
WIN, B, N_PL, SEED = 20, 2000, 200, 20261008
rng = np.random.default_rng(SEED)
DRIVERS = {"NAS100_USD": ["SR3Z6", "SR3H7"], "SPX500_USD": ["SR3Z6", "SR3H7"], "USD_JPY": ["SR3Z6", "SR3H7"],
           "XAU_USD": ["SR3Z6", "SR3H7"], "EUR_USD": ["SR3Z6", "IZ6"]}
COST = {"EUR_USD": 0.008, "USD_JPY": 0.01, "XAU_USD": 0.02, "NAS100_USD": 0.01, "SPX500_USD": 0.01}  # % round trip (S1)
FUT = {"SR3Z6": "CME_SR3Z6", "SR3H7": "CME_SR3H7", "IZ6": "ICEEU_IZ6", "SR3U6": "CME_SR3U6"}


def load_fut(name):
    d = pd.read_csv(STIR / f"{FUT[name]}.csv")
    return pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None), name=name)


S = {n: load_fut(n) for n in FUT}
FSTART = max(s.index[0] for s in S.values())
for t in DRIVERS:
    S[t] = pd.read_parquet(M / f"{t}.parquet")["close"].rename(t)
    S[t] = S[t][S[t].index >= FSTART - pd.Timedelta(days=1)]


def frame(cols):
    df = pd.concat([S[c].rename(c) for c in cols], axis=1, join="inner").sort_index()
    ok = (df.index.to_series().diff() == pd.Timedelta(minutes=15)).to_numpy()
    R = np.log(df).diff().to_numpy()
    R[~ok] = np.nan
    return df.index, R


def day_ids(idx):
    u, inv = np.unique(idx.normalize(), return_inverse=True)
    return u, inv


def rolling_beta(y, X, inv, nd):
    """beta for each day from OLS (no intercept) on the previous WIN days strictly before it (as study.py)."""
    p = X.shape[1]
    ok = np.isfinite(y) & np.isfinite(X).all(1)
    XtX = np.zeros((nd, p, p)); Xty = np.zeros((nd, p)); yy = np.zeros(nd); yn = np.zeros(nd)
    Xo, yo, io = X[ok], y[ok], inv[ok]
    np.add.at(XtX, io, Xo[:, :, None] * Xo[:, None, :]); np.add.at(Xty, io, Xo * yo[:, None])
    np.add.at(yy, io, yo ** 2); np.add.at(yn, io, 1)
    cXtX, cXty, cyy, cyn = (np.cumsum(a, 0) for a in (XtX, Xty, yy, yn))
    beta = np.full((nd, p), np.nan); sig = np.full(nd, np.nan)
    for k in range(WIN, nd):
        lo = k - 1 - WIN
        A = cXtX[k - 1] - (cXtX[lo] if lo >= 0 else 0)
        b = cXty[k - 1] - (cXty[lo] if lo >= 0 else 0)
        n = cyn[k - 1] - (cyn[lo] if lo >= 0 else 0)
        s2 = cyy[k - 1] - (cyy[lo] if lo >= 0 else 0)
        if n < 500:
            continue
        try:
            beta[k] = np.linalg.solve(A + 1e-12 * np.eye(p), b)
        except np.linalg.LinAlgError:
            continue
        sig[k] = np.sqrt(s2 / n)
    return beta, sig


def rsum(a, k):
    c = np.concatenate([[0.0], np.cumsum(np.nan_to_num(a))]); m = np.concatenate([[0], np.cumsum(~np.isfinite(a))])
    out = np.full(a.shape, np.nan)
    out[k - 1:] = c[k:] - c[:-k]
    bad = np.zeros(a.shape, bool); bad[k - 1:] = (m[k:] - m[:-k]) > 0; bad[:k - 1] = True
    out[bad] = np.nan
    return out


def gap_series(idx, y, Xd, K, H):
    u, inv = day_ids(idx)
    beta, sig = rolling_beta(y, Xd, inv, len(u))
    imp = np.einsum("ij,ij->i", np.nan_to_num(Xd), beta[inv])
    imp[~np.isfinite(Xd).all(1)] = np.nan
    s = sig[inv]
    I = rsum(imp, K) / (s * np.sqrt(K)); O = rsum(y, K) / (s * np.sqrt(K))
    fwd = np.full(y.shape, np.nan); fs = rsum(y, H); fwd[:-H] = fs[H:]
    return I, O, fwd / (s * np.sqrt(H)), fwd


def ols_b(df):
    X = np.column_stack([np.ones(len(df)), df.I, df.O])
    return np.linalg.lstsq(X, df.F.to_numpy(), rcond=None)[0]


def boot_b(df):
    X = np.column_stack([np.ones(len(df)), df.I, df.O]); y = df.F.to_numpy()
    u, inv = np.unique(df.day.to_numpy(), return_inverse=True)
    XtX = np.zeros((len(u), 3, 3)); Xty = np.zeros((len(u), 3))
    np.add.at(XtX, inv, X[:, :, None] * X[:, None, :]); np.add.at(Xty, inv, X * y[:, None])
    reps = []
    for _ in range(B):
        w = np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u)).astype(float)
        reps.append(np.linalg.solve(np.tensordot(w, XtX, 1), np.tensordot(w, Xty, 1))[1:])
    reps = np.array(reps); pt = ols_b(df)[1:]
    return {"b": [round(float(pt[0]), 4), *np.round(np.percentile(reps[:, 0], [2.5, 97.5]), 4).tolist()],
            "c": [round(float(pt[1]), 4), *np.round(np.percentile(reps[:, 1], [2.5, 97.5]), 4).tolist()]}


FR = {t: frame([t] + DRIVERS[t]) for t in DRIVERS}


def family(K, H, shift=None):
    rows = []
    for t in DRIVERS:
        idx, R = FR[t]
        Xd = R[:, 1:]
        if shift is not None:
            Xd = np.roll(Xd, shift[t], axis=0)
        I, O, F, Fraw = gap_series(idx, R[:, 0], Xd, K, H)
        pos = np.arange(len(idx))
        m = (pos % H == 0) & np.isfinite(I) & np.isfinite(O) & np.isfinite(F)
        rows.append(pd.DataFrame(dict(t=idx[m], day=idx[m].normalize(), I=I[m], O=O[m], F=F[m], Fraw=Fraw[m], tgt=t)))
    return pd.concat(rows, ignore_index=True)


def r1(K, H):
    df = family(K, H)
    days = np.sort(df.day.unique()); half = days[len(days) // 2]
    r = {"K": K, "H": H, "n": int(len(df)), "days": int(len(days)), "pooled": boot_b(df),
         "halves_b": [round(float(ols_b(df[df.day < half])[1]), 4), round(float(ols_b(df[df.day >= half])[1]), 4)],
         "half_split": str(pd.Timestamp(half).date()),
         "by_target_b": {t: round(float(ols_b(g)[1]), 4) for t, g in df.groupby("tgt")}}
    g = df[(df.I - df.O).abs() > 1.5]
    net = np.sign(g.I - g.O) * g.Fraw - g.tgt.map(COST) / 100
    r["gap_trade"] = {"n": int(len(g)), "mean_net_bp": round(float(net.mean() * 1e4), 2), "hit": round(float((net > 0).mean()), 4)}
    pl = []
    for k in range(N_PL):
        sh = {}
        for t in DRIVERS:
            n = len(FR[t][0]); nd = len(np.unique(FR[t][0].normalize())); bpd = n / nd
            sh[t] = int(rng.integers(int(5 * bpd), int((nd - 5) * bpd)))
        pl.append(float(ols_b(family(K, H, sh))[1]))
    pl = np.array(pl)
    r["placebo"] = {"median": round(float(np.median(pl)), 4), "p95": round(float(np.percentile(pl, 95)), 4),
                    "real_beats_pct": round(float((r["pooled"]["b"][0] > pl).mean() * 100), 1)}
    r["checks"] = {"b_ci_above_0": bool(r["pooled"]["b"][1] > 0), "both_halves": bool(min(r["halves_b"]) > 0),
                   "targets_3_of_5": bool(sum(v > 0 for v in r["by_target_b"].values()) >= 3),
                   "beats_placebo_95": bool(r["placebo"]["real_beats_pct"] >= 95)}
    r["pass"] = all(r["checks"].values())
    # same-bar link (the join has to show it)
    r["same_bar_corr"] = {}
    for t in DRIVERS:
        idx, R = FR[t]
        for j, dname in enumerate(DRIVERS[t]):
            ok = np.isfinite(R[:, 0]) & np.isfinite(R[:, j + 1])
            r["same_bar_corr"][f"{t}~{dname}"] = round(float(np.corrcoef(R[ok, 0], R[ok, j + 1])[0, 1]), 4)
    print(f"R1 K={K}: b {r['pooled']['b']} pass {r['pass']}", flush=True)
    return r


def boot_corr(x, y, day):
    ok = np.isfinite(x) & np.isfinite(y)
    x, y, day = x[ok], y[ok], day[ok]
    u, inv = np.unique(day, return_inverse=True)
    st = np.zeros((len(u), 6))
    for j, v in enumerate((np.ones_like(x), x, y, x * x, y * y, x * y)):
        np.add.at(st[:, j], inv, v)

    def corr(s):
        n, sx, sy, sxx, syy, sxy = s
        return (sxy / n - sx * sy / n / n) / np.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2))
    pt = corr(st.sum(0))
    reps = [corr(np.bincount(rng.integers(0, len(u), len(u)), minlength=len(u)) @ st) for _ in range(B)]
    return [round(float(pt), 4), *np.round(np.percentile(reps, [2.5, 97.5]), 4).tolist()]


def r2():
    out = {}
    for t, dname in (("NAS100_USD", "SR3H7"), ("EUR_USD", "DIFF")):
        cols = [t, "SR3H7"] if dname == "SR3H7" else [t, "IZ6", "SR3Z6"]
        idx, R = frame(cols)
        x = R[:, 1] if dname == "SR3H7" else R[:, 1] - R[:, 2]
        y = R[:, 0]
        day = idx.normalize().to_numpy()
        res = {"same_bar": boot_corr(x, y, day)}
        for h in (1, 2, 4):
            yf = np.full(y.shape, np.nan); s = rsum(y, h); yf[:-h] = s[h:]          # target over the next h bars
            xf = np.full(x.shape, np.nan); s2 = rsum(x, h); xf[:-h] = s2[h:]        # driver over the next h bars
            res[f"rates_leads_{h}"] = boot_corr(x, yf, day)
            res[f"price_leads_{h}"] = boot_corr(y, xf, day)
        out[f"{t}~{dname}"] = res
    print("R2 done", flush=True)
    return out


def lon_paths(series, start="12:30", end="17:45"):
    """per London date: cumulative change from the first bar of the window, z-scored within the day."""
    s = series.copy()
    s.index = s.index.tz_localize("UTC").tz_convert("Europe/London")
    s = s.between_time(start, end)
    out = {}
    for d, g in s.groupby(s.index.date):
        if len(g) < 18:
            continue
        p = g - g.iloc[0]
        if p.std() == 0:
            continue
        p.index = p.index.strftime("%H:%M")
        out[d] = (p - p.mean()) / p.std()
    return out


def r3():
    diff = pd.concat([S["IZ6"], S["SR3Z6"]], axis=1, join="inner")
    rate = lon_paths(diff.iloc[:, 0] - diff.iloc[:, 1])
    nas = lon_paths(S["NAS100_USD"])
    days = sorted(set(rate) & set(nas))
    nas_days = sorted(nas)

    def c(a, b):
        j = a.index.intersection(b.index)
        return float(np.corrcoef(a[j], b[j])[0, 1]) if len(j) >= 18 else np.nan

    pairs = []
    for d in days:
        nxt = [x for x in nas_days if x > d]
        if nxt and (nxt[0] - d).days <= 4:
            pairs.append((d, nxt[0]))
    real = np.array([c(rate[d], nas[e]) for d, e in pairs])
    same = np.array([c(rate[d], nas[d]) for d in days])
    fri = np.array([c(rate[d], nas[e]) for d, e in pairs if d.weekday() == 4])
    pl = []
    for _ in range(1000):
        v = []
        for d, e in pairs:
            alt = nas_days[rng.integers(len(nas_days))]
            while alt == e:
                alt = nas_days[rng.integers(len(nas_days))]
            v.append(c(rate[d], nas[alt]))
        pl.append(np.nanmean(v))
    pl = np.array(pl)
    r = {"pairs": int(np.isfinite(real).sum()), "mean_corr_next_day": round(float(np.nanmean(real)), 4),
         "placebo_median": round(float(np.median(pl)), 4), "placebo_p95": round(float(np.percentile(pl, 95)), 4),
         "real_beats_pct": round(float((np.nanmean(real) > pl).mean() * 100), 1),
         "mean_corr_same_day": round(float(np.nanmean(same)), 4), "same_day_n": int(np.isfinite(same).sum()),
         "friday_to_monday": {"n": int(np.isfinite(fri).sum()), "mean_corr": round(float(np.nanmean(fri)), 4) if len(fri) else None},
         "share_positive_next_day": round(float((real[np.isfinite(real)] > 0).mean()), 4)}
    r["pass"] = bool(r["mean_corr_next_day"] > 0 and r["real_beats_pct"] >= 95)
    oct2 = [c(rate[d], nas[e]) for d, e in pairs if str(d) == "2026-10-02"]
    r["fri_2026_10_02_to_mon_10_05"] = round(oct2[0], 4) if oct2 and np.isfinite(oct2[0]) else None
    print("R3 done", r["mean_corr_next_day"], r["pass"], flush=True)
    return r


res = {"R1_primary_K4": r1(4, 4), "R1_secondary_K16": r1(16, 16), "R2": r2(), "R3": r3()}
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

f = lambda c: f"{c[0]:+.4f} [{c[1]:+.4f}, {c[2]:+.4f}]"
md = ["# STIR residual — do short-rate futures lead price? (results)", "",
      "Pre-registration: `forge/STIR_RESIDUAL_PREREG.md`. IBKR 15-min SOFR (SR3Z6, SR3H7) and Euribor (IZ6) futures, "
      "OANDA M15 targets, 2026-04 → 2026-10. Day-block bootstrap intervals.", ""]
for key, title in (("R1_primary_K4", "R1 — residual catch-up, 1 h (primary)"), ("R1_secondary_K16", "R1 — residual catch-up, 4 h (secondary)")):
    r = res[key]
    md += [f"## {title}: **{'PASS' if r['pass'] else 'FAIL'}**", "",
           f"- b (price catches up with the rates-implied move): **{f(r['pooled']['b'])}**; c (own move) {f(r['pooled']['c'])}; "
           f"n {r['n']:,} over {r['days']} days",
           f"- halves (split {r['half_split']}): {r['halves_b'][0]:+.4f} / {r['halves_b'][1]:+.4f}; by target: "
           + ", ".join(f"{t} {v:+.4f}" for t, v in r["by_target_b"].items()),
           f"- placebo (drivers shifted ≥ 5 days): median {r['placebo']['median']:+.4f}, 95th {r['placebo']['p95']:+.4f}, real beats {r['placebo']['real_beats_pct']}%",
           f"- checks: {r['checks']}",
           f"- gap trade (|I−O| > 1.5, after costs): {r['gap_trade']['mean_net_bp']:+.2f} bp/trade, hit {r['gap_trade']['hit'] * 100:.1f}%, n {r['gap_trade']['n']}",
           "- same-bar correlation (sanity): " + ", ".join(f"{k} {v:+.3f}" for k, v in r["same_bar_corr"].items()), ""]
md += ["## R2 — lead-lag (descriptive)", "", "| pair | same bar | rates → price, next 1 / 2 / 4 bars | price → rates, next 1 / 2 / 4 bars |", "|---|---|---|---|"]
for k, v in res["R2"].items():
    md.append(f"| {k} | {f(v['same_bar'])} | " + " ; ".join(f(v[f'rates_leads_{h}']) for h in (1, 2, 4)) + " | "
              + " ; ".join(f(v[f'price_leads_{h}']) for h in (1, 2, 4)) + " |")
r = res["R3"]
md += ["", f"## R3 — previous day's rate-differential path vs NAS100's path (12:30–18:00 London): **{'PASS' if r['pass'] else 'FAIL'}**", "",
       f"- mean correlation, day d rates vs day d+1 NAS100: **{r['mean_corr_next_day']:+.4f}** over {r['pairs']} pairs "
       f"({r['share_positive_next_day'] * 100:.0f}% positive)",
       f"- placebo (random NAS100 day): median {r['placebo_median']:+.4f}, 95th {r['placebo_p95']:+.4f}; real beats {r['real_beats_pct']}%",
       f"- same day (rates d vs NAS100 d): {r['mean_corr_same_day']:+.4f} over {r['same_day_n']} days",
       f"- Friday → Monday only: {r['friday_to_monday']['mean_corr']} (n {r['friday_to_monday']['n']}); "
       f"his example, Fri 2 Oct → Mon 5 Oct: {r['fri_2026_10_02_to_mon_10_05']}"]
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
