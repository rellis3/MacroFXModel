"""STIR wide scan (forge/STIR_WIDE_SCAN_PROTOCOL.md): every rate series x feature x target x horizon x time of day,
searched on Apr-Jul, confirmed on Aug-Oct, compared with the same scan on day-shifted (scrambled) rates.

    python scripts/rates_residual/stir_wide_scan.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

M = Path("analysis/output/rates_residual/m15")
STIR = Path("analysis/output/stir")
OUT = Path("analysis/output/stir_wide_scan")
OUT.mkdir(parents=True, exist_ok=True)
SPLIT = pd.Timestamp("2026-08-01")
N_SCRAMBLE, SEED = 30, 20261008
rng = np.random.default_rng(SEED)
LAGS, HORIZONS = (1, 2, 4, 8, 16), (1, 2, 4, 8, 16)
CONTRACTS = {"SR3U6": "CME_SR3U6", "SR3Z6": "CME_SR3Z6", "SR3H7": "CME_SR3H7", "SR3M7": "CME_SR3M7",
             "IZ6": "ICEEU_IZ6", "ER3U6": "ICEEU_ER3U6"}
TARGETS = sorted(p.stem for p in M.glob("*.parquet"))

# ── one 15-min UTC grid ──────────────────────────────────────────────────────────────────────────────────────────
fut = {}
for k, f in CONTRACTS.items():
    d = pd.read_csv(STIR / f"{f}.csv")
    fut[k] = pd.Series(d.close.to_numpy(float), index=pd.to_datetime(d.time).dt.tz_localize(None))
start = max(s.index[0] for s in fut.values())
tg = {t: pd.read_parquet(M / f"{t}.parquet")["close"] for t in TARGETS}
grid = pd.date_range(start.ceil("15min"), min(s.index[-1] for s in tg.values()), freq="15min")
grid = grid[grid.dayofweek < 5]
L = pd.DataFrame({k: s.reindex(grid).ffill(limit=4) for k, s in fut.items()})      # a few stale bars = no trade = no change
L["D_U6"], L["D_Z6"], L["D_H7"] = L.IZ6 - L.SR3U6, L.IZ6 - L.SR3Z6, L.IZ6 - L.SR3H7
L["D_ESTR_U6"] = L.ER3U6 - L.SR3U6
L["SLOPE_H7Z6"], L["SLOPE_M7Z6"] = L.SR3H7 - L.SR3Z6, L.SR3M7 - L.SR3Z6
RATES = list(L.columns)
P = pd.DataFrame({t: tg[t].reindex(grid) for t in TARGETS})
lp = np.log(P)
n = len(grid)
day = grid.normalize()
days, dinv = np.unique(day, return_inverse=True)
disc_days = days < SPLIT
lon = grid.tz_localize("UTC").tz_convert("Europe/London")
hm = lon.hour * 60 + lon.minute
COND = {"all": np.ones(n, bool), "asia": hm < 420, "london_am": (hm >= 420) & (hm < 750),
        "us_data_open": (hm >= 750) & (hm < 960), "us_pm": (hm >= 960) & (hm < 1260)}

# forward target returns (target over the next h bars), only where every bar in between exists
FWD = {}
for h in HORIZONS:
    f = lp.shift(-h) - lp
    FWD[h] = f.where(f.notna())


def features(Lv: pd.DataFrame):
    """driver-only features: {name: array n}"""
    out = {}
    dL = Lv.diff()
    sd = dL.rolling(1600, min_periods=400).std().shift(1)          # ~20 trading days of 15-min bars, strictly before
    for r in RATES:
        for l in LAGS:
            out[f"{r}|mom{l}"] = ((Lv[r] - Lv[r].shift(l)) / (sd[r] * np.sqrt(l))).to_numpy()
        m4 = (Lv[r] - Lv[r].shift(4)) / (sd[r] * 2)
        prev = m4.shift(4)
        out[f"{r}|turn"] = np.where((np.sign(m4) != np.sign(prev)) & (prev.abs() >= 1) & (m4.abs() >= 0.5), np.sign(m4), 0.0)
        out[f"{r}|turn"][~np.isfinite(m4.to_numpy() + prev.to_numpy())] = np.nan
        z1 = (dL[r] / sd[r]).to_numpy()
        out[f"{r}|shock"] = np.where(np.abs(z1) >= 2, np.sign(z1), 0.0)
        out[f"{r}|shock"][~np.isfinite(z1)] = np.nan
    return out


def gap_features(Lv: pd.DataFrame):
    """target-specific residual gap: {(rate, target, K): array}. Univariate beta over the previous 20 days."""
    out = {}
    dR = Lv.diff()
    dT = lp.diff()
    for r in RATES:
        x = dR[r]
        for t in TARGETS:
            y = dT[t]
            ok = x.notna() & y.notna()
            xy = (x * y).where(ok).groupby(dinv).sum(); xx = (x * x).where(ok).groupby(dinv).sum()
            cxy, cxx = xy.rolling(20).sum().shift(1), xx.rolling(20).sum().shift(1)
            beta = (cxy / cxx).reindex(range(len(days))).to_numpy()[dinv]
            ysd = y.rolling(1600, min_periods=400).std().shift(1)
            for K in (4, 16):
                I = (x * beta).rolling(K).sum()
                O = y.rolling(K).sum()
                out[(r, t, K)] = ((I - O) / (ysd * np.sqrt(K))).to_numpy()
    return out


def zcols(A, mask_rows):
    """standardise columns on discovery rows; NaN -> 0 after."""
    mu = np.nanmean(A[mask_rows], axis=0); sd = np.nanstd(A[mask_rows], axis=0)
    sd[sd == 0] = np.nan
    Z = (A - mu) / sd
    return np.nan_to_num(Z)


disc_rows = disc_days[dinv]
Yraw = np.column_stack([FWD[h][t].to_numpy() for t in TARGETS for h in HORIZONS])
YKEYS = [(t, h) for t in TARGETS for h in HORIZONS]
Y = zcols(Yraw, disc_rows)
Yok = np.isfinite(Yraw)


def day_t(prod, rowmask):
    """day-clustered t of mean(prod) using per-day sums: discovery and holdout separately. prod: n x m."""
    S = np.zeros((len(days), prod.shape[1]))
    np.add.at(S, dinv[rowmask], prod[rowmask])
    res = {}
    for name, dm in (("disc", disc_days), ("hold", ~disc_days)):
        s = S[dm]
        s = s[:-1] if name == "disc" else s                          # last discovery day's forwards reach into holdout
        res[name] = s.mean(0) / (s.std(0, ddof=1) + 1e-12) * np.sqrt(len(s))
    return res


def scan(Lv):
    """returns (keys, t_disc, t_hold) over every test."""
    F = features(Lv)
    fkeys = list(F)
    X = zcols(np.column_stack([F[k] for k in fkeys]), disc_rows)
    Xok = np.column_stack([np.isfinite(F[k]) for k in fkeys])
    keys, td, th = [], [], []
    for cname, cm in COND.items():
        # every feature x every (target, horizon): per-day sums of x*y via a loop over days
        S = np.zeros((len(days), X.shape[1], Y.shape[1]), dtype=np.float32)
        for di in range(len(days)):
            rows = (dinv == di) & cm
            if not rows.any():
                continue
            S[di] = X[rows].T @ Y[rows]
        for name, dm in (("disc", disc_days), ("hold", ~disc_days)):
            s = S[dm][:-1] if name == "disc" else S[dm]
            t = s.mean(0) / (s.std(0, ddof=1) + 1e-12) * np.sqrt(len(s))
            (td if name == "disc" else th).append(t.reshape(-1))
        keys += [(fk, t_, h, cname) for fk in fkeys for (t_, h) in YKEYS]
    G = gap_features(Lv)
    for (r, t_, K), g in G.items():
        gz = zcols(g[:, None], disc_rows)[:, 0]
        cols = [YKEYS.index((t_, h)) for h in HORIZONS]
        for cname, cm in COND.items():
            prod = (gz[:, None] * Y[:, cols]) * cm[:, None]
            r_ = day_t(prod, np.ones(n, bool))
            td.append(r_["disc"]); th.append(r_["hold"])
            keys += [(f"{r}|gap{K}", t_, h, cname) for h in HORIZONS]
    return keys, np.concatenate(td), np.concatenate(th)


print(f"grid {n:,} bars, {len(days)} days ({disc_days.sum()} discovery / {(~disc_days).sum()} holdout), "
      f"{len(RATES)} rate series, {len(TARGETS)} targets", flush=True)
keys, TD, TH = scan(L)
ok = np.isfinite(TD) & np.isfinite(TH)
print(f"real scan: {len(keys):,} tests", flush=True)

scr_max, scr_rho = [], []
nd_ = len(days)
for k in range(N_SCRAMBLE):
    sh = int(rng.integers(5, nd_ - 5))
    Ls = L.copy()
    Ls[:] = np.roll(L.to_numpy(), sh * int(round(n / nd_)), axis=0)       # whole-day shift, wrapping
    _, td, thh = scan(Ls)
    o = np.isfinite(td) & np.isfinite(thh)
    scr_max.append(float(np.nanmax(np.abs(td))))
    scr_rho.append(float(np.corrcoef(td[o], thh[o])[0, 1]))
    print(f"scramble {k + 1}/{N_SCRAMBLE}: max|t| {scr_max[-1]:.2f}, disc~hold rho {scr_rho[-1]:+.4f}", flush=True)
scr_max, scr_rho = np.array(scr_max), np.array(scr_rho)

thr = float(np.percentile(scr_max, 95))
rho = float(np.corrcoef(TD[ok], TH[ok])[0, 1])
df = pd.DataFrame(keys, columns=["feature", "target", "h", "when"]).assign(t_disc=TD, t_hold=TH)
df = df[ok].copy()
df["abs_disc"] = df.t_disc.abs()
df["same_sign"] = np.sign(df.t_disc) == np.sign(df.t_hold)
top = df.sort_values("abs_disc", ascending=False).head(30)
findings = df[(df.abs_disc > thr) & df.same_sign & (df.t_hold.abs() >= 2)]
df.sort_values("abs_disc", ascending=False).head(2000).to_csv(OUT / "top2000.csv", index=False, float_format="%.3f")

# where the broad effect lives: disc~hold agreement by rate series, target, horizon, time of day
by = {}
df["rate"] = df.feature.str.split("|").str[0]
df["ftype"] = df.feature.str.split("|").str[1]
for col in ("rate", "ftype", "target", "h", "when"):
    by[col] = {str(k): round(float(np.corrcoef(g.t_disc, g.t_hold)[0, 1]), 4) for k, g in df.groupby(col) if len(g) > 50}

res = {"tests": int(len(df)), "scramble_runs": N_SCRAMBLE, "familywise_threshold_t": round(thr, 3),
       "best_real_disc_t": round(float(df.abs_disc.max()), 3), "scramble_max_t": np.round(scr_max, 3).tolist(),
       "n_beyond_threshold": int((df.abs_disc > thr).sum()), "findings": findings.to_dict("records"),
       "broad": {"disc_hold_rho": round(rho, 4), "scramble_rho_p95": round(float(np.percentile(scr_rho, 95)), 4),
                 "scramble_rho_median": round(float(np.median(scr_rho)), 4),
                 "real_beats_pct": round(float((rho > scr_rho).mean() * 100), 1)},
       "top30_sign_agree": int(top.same_sign.sum()), "top30_hold_t_ge2": int((top.same_sign & (top.t_hold.abs() >= 2)).sum()),
       "broad_by": by}
(OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))

md = ["# STIR wide scan — results", "", "Protocol: `forge/STIR_WIDE_SCAN_PROTOCOL.md`. Discovery 2026-04 → 07, holdout 08 → 10-07; "
      f"{res['tests']:,} tests; {N_SCRAMBLE} scrambled-rates scans.", "",
      "## The broad view (do rates lead price in many ways at once?)", "",
      f"- Agreement between discovery t and holdout t across all tests: **ρ {rho:+.4f}**; scrambled rates: median "
      f"{res['broad']['scramble_rho_median']:+.4f}, 95th {res['broad']['scramble_rho_p95']:+.4f}; real beats "
      f"{res['broad']['real_beats_pct']}%",
      "- ρ by slice (where the agreement lives): " + "; ".join(f"**{k}** " + ", ".join(f"{a} {b:+.3f}" for a, b in v.items()) for k, v in by.items()),
      "", "## Single findings", "",
      f"- Best |t| a scrambled scan reaches (95th pct of {N_SCRAMBLE} runs): **{thr:.2f}**. Real best discovery |t|: "
      f"{res['best_real_disc_t']:.2f}; tests beyond the threshold: {res['n_beyond_threshold']}",
      f"- Of those, confirmed in the holdout (same sign, |t| ≥ 2): **{len(findings)}**",
      f"- Top 30 discovery results: {res['top30_sign_agree']}/30 same sign in the holdout (chance ≈ 15), "
      f"{res['top30_hold_t_ge2']} with holdout |t| ≥ 2", "",
      "| feature | target | h (bars) | when | t discovery | t holdout |", "|---|---|---|---|---|---|"]
for _, r in top.iterrows():
    md.append(f"| {r.feature} | {r.target} | {r.h} | {r.when} | {r.t_disc:+.2f} | {r.t_hold:+.2f} |")
(OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
