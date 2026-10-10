"""forge/STIR_COMPOSITE_NQ_PREREG.md -- one run, nothing tuned after the first number.

  python scripts/rate_diff_nq/composite_tests.py            # power check, explore, confirm, RESULTS.md + heatmaps
  python scripts/rate_diff_nq/composite_tests.py --check    # only load the data and print coverage per construction

Inputs: analysis/output/stir_1m/*.parquet (IBKR 1-min MIDPOINT). Output: analysis/output/rate_diff_nq/composite/.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.stats import norm

D = Path("analysis/output/stir_1m"); OUT = Path("analysis/output/rate_diff_nq/composite"); OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261010)
LO, HI = "2026-04-13", "2026-10-10"
EXPLORE, CONFIRM, VIDEO = ("2026-04-13", "2026-07-18"), ("2026-07-20", "2026-10-10"), ("2026-09-16", "2026-09-23")
BPH = 4                                                        # bars per hour
GRID = pd.date_range(LO, HI, freq="15min", tz="UTC", inclusive="right")
DAY = pd.Series(GRID.date, index=GRID)
Q = ["Z6", "H7", "M7", "U7"]
LS, HS = [4, 8, 12], [1, 2, 4]                                 # H-A lookbacks / horizons (hours)
KS, HB = [16, 32], [1, 2]                                      # H-B extreme lookback (bars) / horizons (hours)
COST = 1.5                                                     # NQ points, round trip, for H-B


def m1(name):
    f = next(iter(D.glob(name + ".parquet")), None)
    if f is None:
        return None
    d = pd.read_parquet(f); d["time"] = pd.to_datetime(d["time"], utc=True)
    return d.set_index("time")["close"].sort_index()


def bars(s):
    """15-min last midpoint, label right; NaN when the bar has < 10 minutes."""
    if s is None:
        return pd.Series(np.nan, index=GRID)
    g = s.resample("15min", label="right", closed="right"); last, cnt = g.last(), g.count()
    last[cnt < 10] = np.nan
    return last.reindex(GRID)


def rate(name):
    return 100 - bars(m1(name))


def stitched_logret(parts):
    """parts: [(file, until_date)], returns within one contract; the front switches at until_date."""
    out = pd.Series(np.nan, index=GRID); lo = None
    for f, until in parts:
        p = bars(m1(f)); r = np.log(p).diff()
        sel = (GRID <= pd.Timestamp(until, tz="UTC")) & ((GRID > pd.Timestamp(lo, tz="UTC")) if lo else True)
        out[sel] = r[sel]; lo = until
    return out


def level_from(r):
    """cumulative level from per-bar changes; NaN kept where the bar itself was missing."""
    return r.fillna(0).cumsum().where(r.notna())


def load_all():
    nq_r = stitched_logret([("CME_NQM6", "2026-06-12"), ("CME_NQU6", "2026-09-11"), ("CME_NQZ6", HI)])
    nq = level_from(nq_r)                                       # log level, used for every window return
    sofr = {q: rate("CME_SR3" + q) for q in Q}; estr = {q: rate("ICEEU_ER3" + q) for q in Q}; eur = {q: rate("ICEEU_I" + q) for q in Q}
    diff = {q: sofr[q] - estr[q] for q in Q}; diff_e = {q: sofr[q] - eur[q] for q in Q}
    c1 = rate("CME_SR3U6") - rate("ICEEU_ER3U6")
    c1e = rate("CME_SR3U6") - rate("ICEEU_IZ6")
    us2 = -stitched_logret([("CBOT_ZTU6", "2026-09-23"), ("CBOT_ZTZ6", HI)]) / 1.9 * 100
    de2 = -stitched_logret([("EUREX_FGBS_20260908_M", "2026-09-01"), ("EUREX_FGBS_20261208_M", HI)]) / 1.9 * 100
    c5 = level_from(us2 - de2)
    return nq, diff, diff_e, c1, c1e, c5


def pca_weights(diff):
    """PCA on the four standardised difference levels, EXPLORE rows only; returns (w1, w2, mu, sd)."""
    M = pd.DataFrame(diff)[Q]; ex = M.loc[EXPLORE[0]:EXPLORE[1]].dropna()
    mu, sd = ex.mean(), ex.std()
    if len(ex) < 100:                                           # strip not pulled yet: C3/C4 stay NaN
        return np.full(4, np.nan), np.full(4, np.nan), mu, sd
    Z = ((ex - mu) / sd).to_numpy()
    _, _, vt = np.linalg.svd(Z - Z.mean(0), full_matrices=False)
    w1, w2 = vt[0], vt[1]
    if w1.sum() < 0: w1 = -w1                                   # level: up = US-EU gap wider
    if w2[-1] < w2[0]: w2 = -w2                                 # slope: far minus near
    return w1, w2, mu, sd


def constructions(diff, c1, c5, tag=""):
    w1, w2, mu, sd = pca_weights(diff)
    M = pd.DataFrame(diff)[Q]; Z = (M - mu) / sd
    return {"C1 front pair" + tag: c1, "C2 strip mean" + tag: M.mean(axis=1, skipna=False),
            "C3 PCA level" + tag: Z @ w1, "C4 PCA slope" + tag: Z @ w2, "C5 US-DE 2y" + tag: c5}, (w1, w2)


def zprior(x):
    """x / rolling 20-day RMS of x, the RMS computed from the days BEFORE each bar's day."""
    daily = x.pow(2).groupby(DAY.values).mean()
    sd = np.sqrt(daily.rolling(20, min_periods=10).mean()).shift(1)
    return x / DAY.map(sd).to_numpy()


def clustered(x, y):
    """corr of standardised x, y via the mean of their product; day-clustered t; n bars, n days."""
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 200:
        return np.nan, np.nan, int(ok.sum()), 0
    xs, ys = (x[ok] - x[ok].mean()) / x[ok].std(), (y[ok] - y[ok].mean()) / y[ok].std()
    p = pd.Series(xs * ys, index=DAY.values[ok]).groupby(level=0).sum()
    return float(np.mean(xs * ys)), float(p.sum() / np.sqrt((p ** 2).sum())), int(ok.sum()), len(p)


def mask(lo, hi, ex_video=False):
    m = (GRID > pd.Timestamp(lo, tz="UTC")) & (GRID <= pd.Timestamp(hi, tz="UTC"))
    if ex_video:
        m &= ~((GRID > pd.Timestamp(VIDEO[0], tz="UTC")) & (GRID <= pd.Timestamp(VIDEO[1], tz="UTC")))
    return m


# ---------------- H-A: divergence catch-up ----------------
def ha_cells(C, nq, win, plant=None):
    rows = []
    for name, S in C.items():
        for L in LS:
            Lb = L * BPH
            Dv = (zprior(S - S.shift(Lb)) - zprior(nq - nq.shift(Lb))).to_numpy()
            for H in HS:
                fwd = (nq.shift(-H * BPH) - nq).to_numpy().copy()
                if plant and plant[:3] == (name, L, H):
                    ok = np.isfinite(Dv) & np.isfinite(fwd)
                    fwd[ok] += plant[3] * np.nanstd(fwd[ok]) * (Dv[ok] - Dv[ok].mean()) / Dv[ok].std()
                r, t, n, nd = clustered(np.where(win, Dv, np.nan), fwd)
                rows.append(dict(construction=name, L=L, H=H, rho=r, t=t, p=2 * norm.sf(abs(t)) if np.isfinite(t) else np.nan, bars=n, days=nd))
    return pd.DataFrame(rows)


# ---------------- H-B: confirmed turning point ----------------
def hb_events(S, K):
    lo = (S == S.rolling(K).min()) & (S.shift(-1) > S) & (S.shift(-2) > S) & (S.shift(-3) > S)
    hi = (S == S.rolling(K).max()) & (S.shift(-1) < S) & (S.shift(-2) < S) & (S.shift(-3) < S)
    sign = pd.Series(0.0, index=GRID); sign[lo] = 1; sign[hi] = -1
    return sign.shift(3).fillna(0)                              # the signal fires 3 bars (45 min) after the extreme


def hb_cells(C, nq, win, plant=0.0, draws=1000):
    rows = []
    for name, S in C.items():
        for K in KS:
            sig = hb_events(S, K).to_numpy()
            for H in HB:
                fwd = (nq.shift(-H * BPH) - nq).to_numpy()
                valid = win & np.isfinite(fwd)
                ev = valid & (sig != 0)
                if ev.sum() < 20:
                    rows.append(dict(construction=name, K=K, H=H, events=int(ev.sum()))); continue
                y = sig[ev] * fwd[ev] + plant
                obs = float(y.mean()); hours = GRID.hour.to_numpy()
                pools = {h: fwd[valid & (hours == h)] for h in np.unique(hours[ev])}
                sim = np.zeros((ev.sum(), draws))
                for i, (h, s) in enumerate(zip(hours[ev], sig[ev])):
                    sim[i] = s * rng.choice(pools[h], draws)
                m = sim.mean(0); p = float((m >= obs).mean())
                # raw lead count: NQ's own K-bar extreme (same side) lands within 15-120 min after the signal
                lead = 0
                nqv = nq.to_numpy(); idx = np.where(ev)[0]
                for i, s in zip(idx, sig[ev]):
                    w = nqv[i + 1:i + 9]
                    if len(w) == 8 and np.isfinite(w).all():
                        ext = (w.min() if s > 0 else w.max())
                        past = nqv[max(0, i - K):i + 1]
                        lead += int(ext <= np.nanmin(past) if s > 0 else ext >= np.nanmax(past))
                rows.append(dict(construction=name, K=K, H=H, events=int(ev.sum()), mean_pct=obs * 100, net_pct=(obs - COST / 30000) * 100,
                                 p_scramble=p, p95_pct=float(np.percentile(m, 95)) * 100, lead_frac=lead / ev.sum()))
    return pd.DataFrame(rows)


def bh(p, q=0.10):
    p = np.asarray(p, float); ok = np.isfinite(p); out = np.zeros(len(p), bool)
    if ok.sum() == 0:
        return out
    ps = p[ok]; o = np.argsort(ps); m = len(ps); thr = q * (np.arange(1, m + 1) / m)
    k = np.where(ps[o] <= thr)[0]
    if len(k):
        out[np.where(ok)[0][o[:k.max() + 1]]] = True
    return out


def heat(df, val, idx, cols, title, path, fmt="{:.3f}"):
    pv = df.pivot_table(index="construction", columns=[idx, cols], values=val)
    fig, ax = plt.subplots(figsize=(1.1 * pv.shape[1] + 3, 0.6 * pv.shape[0] + 1.5))
    v = np.nanmax(np.abs(pv.to_numpy())) if np.isfinite(pv.to_numpy()).any() else 1
    im = ax.imshow(pv.to_numpy(), cmap="RdBu_r", vmin=-v, vmax=v, aspect="auto")
    ax.set_xticks(range(pv.shape[1])); ax.set_xticklabels([f"{idx}{a} {cols}{b}" for a, b in pv.columns], rotation=60, fontsize=7)
    ax.set_yticks(range(pv.shape[0])); ax.set_yticklabels(pv.index, fontsize=8)
    for i in range(pv.shape[0]):
        for j in range(pv.shape[1]):
            x = pv.to_numpy()[i, j]
            if np.isfinite(x): ax.text(j, i, fmt.format(x), ha="center", va="center", fontsize=6)
    ax.set_title(title, fontsize=9); plt.colorbar(im, ax=ax); plt.tight_layout(); plt.savefig(path, dpi=100); plt.close()


def main():
    nq, diff, diff_e, c1, c1e, c5 = load_all()
    C, (w1, w2) = constructions(diff, c1, c5)
    CE, _ = constructions(diff_e, c1e, c5, tag=" [Euribor]")
    cov = {k: f"{v.loc[EXPLORE[0]:EXPLORE[1]].notna().mean():.0%} explore / {v.loc[CONFIRM[0]:CONFIRM[1]].notna().mean():.0%} confirm" for k, v in {**C, **CE, "NQ": nq}.items()}
    print("coverage (share of 15-min bars present):"); [print(f"  {k:24s} {v}") for k, v in cov.items()]
    print(f"PCA weights (explore): level {np.round(w1, 3)}  slope {np.round(w2, 3)}")
    if "--check" in sys.argv:
        return
    wE, wC, wCx = mask(*EXPLORE), mask(*CONFIRM), mask(*CONFIRM, ex_video=True)
    L = ["# STIR-COMPOSITE-NQ results\n", "Run once per forge/STIR_COMPOSITE_NQ_PREREG.md.\n", "## Coverage\n"] + [f"- {k}: {v}" for k, v in cov.items()] + \
        [f"\nPCA weights fitted on explore (Z6 H7 M7 U7): level {np.round(w1, 3)}, slope {np.round(w2, 3)}\n"]

    # ---- power (planted signals), before any real result is read ----
    L.append("## Power (planted signals, explore half, detection = the planted cell survives BH-FDR 10%)\n")
    L.append("| test | planted size | detected | of |\n|---|---|---|---|")
    base = ha_cells(C, nq, wE)
    for rho in (0.03, 0.05, 0.08):
        hits = 0; reps = 10
        for _ in range(reps):
            df = ha_cells(C, nq, wE, plant=("C2 strip mean", 8, 2, rho))
            df.loc[df.index != df.index[(df.construction == "C2 strip mean") & (df.L == 8) & (df.H == 2)][0], ["p"]] = base.p.values[df.index != df.index[(df.construction == "C2 strip mean") & (df.L == 8) & (df.H == 2)][0]]
            hits += int(bh(df.p)[(df.construction == "C2 strip mean") & (df.L == 8) & (df.H == 2)][0])
        L.append(f"| H-A | corr +{rho:.2f} | {hits} | {reps} |")
    for m in (0.0005, 0.0010):
        hits = 0; reps = 10
        for _ in range(reps):
            df = hb_cells(C, nq, wE, plant=m, draws=400)
            hits += int(bh(df.p_scramble)[(df.construction == "C2 strip mean") & (df.K == 16) & (df.H == 2)][0]) if "p_scramble" in df else 0
        L.append(f"| H-B | +{m * 100:.2f}% per event | {hits} | {reps} |")
    L.append("\nPower under 50% at the middle size (H-A 0.05, H-B +0.05%) means a null below is 'insufficient data'.\n")

    # ---- H-A ----
    ea = ha_cells(C, nq, wE); ea["fdr"] = bh(ea.p)
    ca = ha_cells(C, nq, wCx); cf = ha_cells(C, nq, wC)
    ea.to_csv(OUT / "ha_explore.csv", index=False); ca.to_csv(OUT / "ha_confirm_exvideo.csv", index=False); cf.to_csv(OUT / "ha_confirm_full.csv", index=False)
    heat(ea, "rho", "L", "H", "H-A explore: corr(divergence, forward NQ return)", OUT / "ha_explore.png")
    heat(ca, "rho", "L", "H", "H-A confirm (video week removed)", OUT / "ha_confirm.png")
    L.append("## H-A divergence catch-up (45 cells)\n")
    L.append(f"Explore: {int(ea.fdr.sum())} of 45 pass BH-FDR 10%. Largest |corr| {ea.rho.abs().max():.3f}. Days {ea.days.max()}.\n")
    L.append("| construction | L h | H h | explore corr | t | confirm-ex-video corr | t | one-sided p (sign fixed) | confirm full corr |\n|---|---|---|---|---|---|---|---|---|")
    surv = ea[ea.fdr]
    for _, r in surv.iterrows():
        c = ca[(ca.construction == r.construction) & (ca.L == r.L) & (ca.H == r.H)].iloc[0]; f = cf[(cf.construction == r.construction) & (cf.L == r.L) & (cf.H == r.H)].iloc[0]
        p1 = norm.sf(np.sign(r.rho) * c.t) if np.isfinite(c.t) else np.nan
        L.append(f"| {r.construction} | {r.L} | {r.H} | {r.rho:+.3f} | {r.t:+.2f} | {c.rho:+.3f} | {c.t:+.2f} | {p1:.3f} | {f.rho:+.3f} |")
    ha_pass = any(norm.sf(np.sign(r.rho) * ca[(ca.construction == r.construction) & (ca.L == r.L) & (ca.H == r.H)].iloc[0].t) < 0.05 for _, r in surv.iterrows())
    L.append(f"\n**H-A: {'PASS' if ha_pass else 'FAIL'}** (survivors in explore: {len(surv)}).\n")
    L.append("All explore cells (corr / t):\n\n" + ea.pivot_table(index="construction", columns=["L", "H"], values="rho").round(3).to_markdown() + "\n")
    L.append("All confirm-ex-video cells (corr):\n\n" + ca.pivot_table(index="construction", columns=["L", "H"], values="rho").round(3).to_markdown() + "\n")

    # ---- H-B ----
    eb = hb_cells(C, nq, wE); eb["fdr"] = bh(eb.p_scramble) if "p_scramble" in eb else False
    cb = hb_cells(C, nq, wCx); fb = hb_cells(C, nq, wC)
    eb.to_csv(OUT / "hb_explore.csv", index=False); cb.to_csv(OUT / "hb_confirm_exvideo.csv", index=False); fb.to_csv(OUT / "hb_confirm_full.csv", index=False)
    if "mean_pct" in eb: heat(eb, "mean_pct", "K", "H", "H-B explore: mean signed NQ return after a confirmed spread turn (%)", OUT / "hb_explore.png")
    if "mean_pct" in cb: heat(cb, "mean_pct", "K", "H", "H-B confirm (video week removed)", OUT / "hb_confirm.png")
    L.append("## H-B confirmed turning point (20 cells)\n")
    L.append(f"Explore: {int(eb.fdr.sum())} of 20 pass (scramble p, BH-FDR 10%).\n")
    L.append("| construction | K bars | H h | events | explore mean % | p | confirm-ex-video events | mean % | net % | p | lead frac |\n|---|---|---|---|---|---|---|---|---|---|---|")
    hb_pass = False
    for _, r in eb[eb.fdr].iterrows():
        c = cb[(cb.construction == r.construction) & (cb.K == r.K) & (cb.H == r.H)].iloc[0]
        ok = ("p_scramble" in c) and np.isfinite(c.get("p_scramble", np.nan)) and c.p_scramble < 0.05 and c.net_pct > 0
        hb_pass |= bool(ok)
        L.append(f"| {r.construction} | {r.K} | {r.H} | {r.events} | {r.mean_pct:+.3f} | {r.p_scramble:.3f} | {c.events} | {c.get('mean_pct', np.nan):+.3f} | {c.get('net_pct', np.nan):+.3f} | {c.get('p_scramble', np.nan):.3f} | {c.get('lead_frac', np.nan):.2f} |")
    L.append(f"\n**H-B: {'PASS' if hb_pass else 'FAIL'}**.\n")
    if "mean_pct" in eb:
        L.append("All explore cells (mean signed % / scramble p / raw lead fraction):\n\n" + eb[["construction", "K", "H", "events", "mean_pct", "p_scramble", "lead_frac"]].round(3).to_markdown(index=False) + "\n")
        L.append("All confirm-ex-video cells:\n\n" + cb[["construction", "K", "H", "events", "mean_pct", "net_pct", "p_scramble", "lead_frac"]].round(3).to_markdown(index=False) + "\n")
    # Euribor robustness (not scored)
    ee = ha_cells(CE, nq, wE); L.append("## Robustness: Euribor legs, explore H-A corr (not scored)\n\n" + ee.pivot_table(index="construction", columns=["L", "H"], values="rho").round(3).to_markdown() + "\n")
    (OUT / "RESULTS.md").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    main()
