"""ladder-wide-race (forge/LADDER_WIDE_RACE_PREREG.md): a much wider sigma race on QLIKE for HL / OH / OL.

    python scripts/ladder-wide-race/race.py   -> analysis/output/ladder-wide-race/{results.json, report.txt, leaderboard.csv}

Seed 20261123. Old field = ladder-qlike-per-line arms (its own machinery); new arms W_* built here from the same
build's daily bars and 5-min RV features. Every sigma for session D uses data before D; models refitted per year.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/ladder-qlike-per-line"))
import score as QP  # noqa: E402  (ladder-qlike-per-line scorer)
from forge import vol as V  # noqa: E402

SEED = 20261123
LINES = QP.LINES
SYMS = QP.SYMS
FIT_YEARS = range(2018, 2027)
OUT = ROOT / "analysis/output/ladder-wide-race"
OUT.mkdir(parents=True, exist_ok=True)
LOG: list[str] = []
IV_SYMS = {"NQ", "GOLD"}


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


# ------------------------------------------------------------------ day-level data
def day_table(sym):
    """One row per NY-close trading day d: OHLC, log 5-min RV, downside semivariance, jump, return. Features for
    day d use days < d only (shift 1). Session D <-> day D (rows_F convention, checked by control 1)."""
    d = Path(ROOT / QP.rows_dir(sym))
    bars = pd.DataFrame(json.loads((d / "d1" / f"{sym}_F.json").read_text()))
    bars["d"] = pd.to_datetime(bars["d"])
    bars = bars.set_index("d").rename(columns={"o": "open", "h": "high", "l": "low", "c": "close"}).sort_index()
    r5 = pd.read_parquet(d / "rvfeat_F_R5.parquet")[["d1"]].rename(columns={"d1": "lrv"})
    sh = pd.read_parquet(d / "rvfeat_F_SHAR.parquet")[["neg"]].rename(columns={"neg": "lneg"})
    cj = pd.read_parquet(d / "rvfeat_F_HARCJ.parquet")[["j1"]]
    for x in (r5, sh, cj):
        x.index = pd.to_datetime(x.index)
    D = bars.join(r5, how="left").join(sh, how="left").join(cj, how="left")
    o, h, l, c = (D[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    hl, co = np.log(h / l), np.log(c / o)
    u, dn = np.log(h / o), np.log(l / o)
    D["park"] = hl ** 2 / (4 * np.log(2))
    D["gk"] = 0.5 * hl ** 2 - (2 * np.log(2) - 1) * co ** 2
    D["rs"] = u * (u - co) + dn * (dn - co)
    D["ret"] = np.log(D["close"]).diff()
    D["rv"] = np.exp(D["lrv"])
    return D


def build_arms(sym, T):
    """Return dict (arm, line) -> sigma array aligned to T rows (daily %)."""
    D = day_table(sym)
    P = pd.DataFrame(index=D.index)
    sh = lambda s: s.shift(1)  # noqa: E731
    sq = lambda v: np.sqrt(np.maximum(v, 0)) * 100  # noqa: E731
    # 1. range estimators
    for w in (1, 5, 10, 22, 66):
        P[f"W_park_{w}"] = sq(sh(D["park"].rolling(w, min_periods=w).mean()))
    for w in (1, 5, 22):
        P[f"W_gk_{w}"] = sq(sh(D["gk"].rolling(w, min_periods=w).mean()))
    for w in (5, 22):
        P[f"W_rs_{w}"] = sq(sh(D["rs"].rolling(w, min_periods=w).mean()))
    bb = D[["open", "high", "low", "close"]].reset_index(drop=True)
    for w in (5, 66):
        P[f"W_yz_{w}"] = sh(pd.Series(V.yang_zhang_sigma(bb, w) / V.SQRT252, index=D.index))
    P["_yz20"] = sh(pd.Series(V.yang_zhang_sigma(bb, 20) / V.SQRT252, index=D.index))   # control 1
    for lam in (0.80, 0.90, 0.97):
        P[f"W_gkewma_{int(lam * 100)}"] = sq(sh(D["gk"].ewm(alpha=1 - lam, min_periods=20).mean()))
    # 2. realised vol
    rv = D["rv"]
    P["W_rv_1"] = sq(sh(rv))
    P["W_rv_5"] = sq(sh(rv.rolling(5, min_periods=5).mean()))
    P["W_rv_22"] = sq(sh(rv.rolling(22, min_periods=22).mean()))
    for lam in (0.50, 0.70, 0.85, 0.94):
        P[f"W_rvewma_{int(lam * 100)}"] = sq(sh(rv.ewm(alpha=1 - lam, min_periods=10).mean()))

    # ---- features (all known before day t)
    F = pd.DataFrame(index=D.index)
    y = D["lrv"]
    F["lrv1"] = sh(y)
    F["lrv5"] = sh(np.log(rv.rolling(5, min_periods=5).mean()))
    F["lrv22"] = sh(np.log(rv.rolling(22, min_periods=22).mean()))
    gk = D["gk"].clip(lower=1e-12)
    F["lgk1"] = sh(np.log(gk))
    F["lgk5"] = sh(np.log(gk.rolling(5, min_periods=5).mean()))
    F["lgk22"] = sh(np.log(gk.rolling(22, min_periods=22).mean()))
    F["lneg"] = sh(D["lneg"])
    F["j1"] = sh(D["j1"])
    F["r1neg"] = sh(D["ret"].clip(upper=0))
    F["r5neg"] = sh(D["ret"].rolling(5, min_periods=5).sum().clip(upper=0))
    for k, nm in enumerate(("mon", "tue", "wed", "thu")):
        F[nm] = (D.index.dayofweek == k).astype(float)
    ivs = T.set_index("date")["iv"] if "iv" in T else pd.Series(dtype=float)
    F["liv"] = np.log((ivs.reindex(D.index) / V.SQRT252 / 100) ** 2) if sym in IV_SYMS else np.nan

    yrs = D.index.year
    HARB = ["lrv1", "lrv5", "lrv22"]
    SPECS = {
        "W_har_iv": HARB + ["liv"],
        "W_har_lev": HARB + ["r1neg", "r5neg"],
        "W_har_dow": HARB + ["mon", "tue", "wed", "thu"],
        "W_har_range": ["lgk1", "lgk5", "lgk22"],
        "W_har_mix": HARB + ["lgk1", "lneg"],
        "W_har_all": HARB + ["lgk1", "lgk5", "lneg", "j1", "r1neg", "r5neg", "mon", "tue", "wed", "thu"]
                     + (["liv"] if sym in IV_SYMS else []),
    }
    if sym not in IV_SYMS:
        SPECS.pop("W_har_iv")
    for name in SPECS:
        P[name] = np.nan
    for name in ("W_ar1", "W_ar22", "W_arma11", "W_arfima", "W_rgarch"):
        P[name] = np.nan
    lags = pd.concat({k: y.shift(k) for k in range(1, 23)}, axis=1)
    yv = y.to_numpy()

    def ols(X, t, Xp):
        ok = np.isfinite(X).all(1) & np.isfinite(t)
        A = np.column_stack([np.ones(ok.sum()), X[ok]])
        b, *_ = np.linalg.lstsq(A, t[ok], rcond=None)
        s2 = float(np.var(t[ok] - A @ b))
        return np.column_stack([np.ones(len(Xp)), Xp]) @ b, s2

    from statsmodels.tsa.arima.model import ARIMA
    for Y in FIT_YEARS:
        tr, te = yrs < Y, yrs == Y
        if not te.any():
            continue
        for name, cols in SPECS.items():
            p, s2 = ols(F.loc[tr, cols].to_numpy(), yv[tr], F.loc[te, cols].to_numpy())
            P.loc[te, name] = np.sqrt(np.exp(p + s2 / 2)) * 100
        for name, L_ in (("W_ar1", [1]), ("W_ar22", list(range(1, 23)))):
            p, s2 = ols(lags.loc[tr, L_].to_numpy(), yv[tr], lags.loc[te, L_].to_numpy())
            P.loc[te, name] = np.sqrt(np.exp(p + s2 / 2)) * 100
        # ARMA(1,1): fit on prior years, one-step predictions through year Y with fixed params
        s = y[(yrs <= Y)].dropna()
        str_ = s[s.index.year < Y]
        try:
            res = ARIMA(str_.to_numpy(), order=(1, 0, 1)).fit()
            full = res.apply(s.to_numpy(), refit=False)
            pred = pd.Series(full.fittedvalues, index=s.index)
            s2 = float(res.mse)
            idx = s.index[s.index.year == Y]
            P.loc[idx, "W_arma11"] = np.sqrt(np.exp(pred[idx] + s2 / 2)) * 100
        except Exception as e:  # noqa: BLE001
            say(f"  {sym} ARMA {Y} failed: {e}")
        # ARFIMA(0,d,0): truncated AR(inf) weights, d by in-sample MSE on prior years
        mu = float(str_.mean())
        best = None
        for dd in np.arange(0.05, 0.50, 0.02):
            pi = np.ones(251)
            for k in range(1, 251):
                pi[k] = pi[k - 1] * (k - 1 - dd) / k
            phi = -pi[1:]
            z = s.to_numpy() - mu
            pr = np.full(len(z), np.nan)
            win = np.lib.stride_tricks.sliding_window_view(z[:-1], 250)    # win[i] = z[i..i+249], predicts z[i+250]
            pr[250:] = win @ phi[::-1]
            m = (s.index.year < Y) & np.isfinite(pr)
            mse = float(np.mean((z[m] - pr[m]) ** 2))
            if best is None or mse < best[0]:
                best = (mse, dd, pr)
        mse, dd, pr = best
        sel = np.asarray(s.index.year == Y)
        P.loc[s.index[sel], "W_arfima"] = np.sqrt(np.exp(mu + pr[sel] + mse / 2)) * 100
        # Realized GARCH (log-linear)
        P.loc[D.index[te], "W_rgarch"] = rgarch_year(D, Y)

    # ---- map day level -> sessions
    Ta = P.reindex(pd.to_datetime(T["date"]))
    arms = {}
    for col in [c for c in P.columns if c.startswith("W_")]:
        for q in LINES:
            arms[(col, q)] = Ta[col].to_numpy(float)
    ctrl = Ta["_yz20"].to_numpy(float)

    # 5. direct per-line (session level): log(line^2) on HAR-all features
    Fs = F.reindex(pd.to_datetime(T["date"]))
    cols = SPECS["W_har_all"]
    Xs = Fs[cols].to_numpy(float)
    syr = T["year"].to_numpy()
    from sklearn.ensemble import HistGradientBoostingRegressor
    for q in LINES:
        x = T[q].to_numpy(float)
        tgt = np.where(x > 0, np.log(np.where(x > 0, x, 1) ** 2), np.nan)
        dols, dhgb = np.full(len(T), np.nan), np.full(len(T), np.nan)
        for Y in FIT_YEARS:
            tr, te = (syr < Y) & np.isfinite(tgt), syr == Y
            if not te.any() or tr.sum() < 300:
                continue
            p, s2 = ols(Xs[tr], tgt[tr], Xs[te])
            dols[te] = np.sqrt(np.exp(p + s2 / 2))
            g = HistGradientBoostingRegressor(max_iter=200, max_depth=3, learning_rate=0.05, min_samples_leaf=40,
                                              random_state=SEED).fit(Xs[tr], tgt[tr])
            dhgb[te] = np.sqrt(np.exp(g.predict(Xs[te])))
        arms[("W_dir_ols", q)] = dols
        arms[("W_dir_hgb", q)] = dhgb
    return arms, ctrl, Fs


def rgarch_year(D, Y):
    """Log-linear Realized GARCH(1,1) (Hansen, Huang & Shek 2012) fitted on days before Y; h_t for days in Y
    (h_t depends on t-1 only). Returns daily sigma % for the days of year Y."""
    from scipy.optimize import minimize
    S = D[["ret", "rv"]].dropna()
    S = S[S.index.year <= Y]
    r = (S["ret"].to_numpy() * 100)
    lx = np.log(S["rv"].to_numpy() * 1e4)
    trm = S.index.year < Y
    rt, lxt = r[trm], lx[trm]
    mu0 = float(rt.mean())

    def filt(th, r_, lx_):
        from scipy.signal import lfilter
        w, b, g = th[0], th[1], th[2]
        lh0 = np.log(np.var(r_[:250]) if len(r_) > 250 else np.var(r_))
        u = np.concatenate([[0.0], w + g * lx_[:-1]])          # lh[t] = b*lh[t-1] + u[t], t >= 1
        lh, _ = lfilter([1.0], [1.0, -b], u[1:], zi=[b * lh0])
        return np.concatenate([[lh0], lh])

    def nll(th):
        w, b, g, xi, ph, t1, t2, lsu = th
        if not (0 <= b < 1 and 0 <= g < 1 and b + g * ph < 0.9999):
            return 1e10
        lh = filt(th, rt, lxt)
        z = (rt - mu0) / np.exp(lh / 2)
        u = lxt - xi - ph * lh - t1 * z - t2 * (z ** 2 - 1)
        su2 = np.exp(2 * lsu)
        ll = -0.5 * (lh + z ** 2) - 0.5 * (np.log(su2) + u ** 2 / su2)
        return -float(np.sum(ll[1:]))

    th0 = np.array([0.05, 0.55, 0.40, -0.2, 1.0, -0.05, 0.05, np.log(0.4)])
    res = minimize(nll, th0, method="Nelder-Mead", options={"maxiter": 6000, "xatol": 1e-6, "fatol": 1e-6})
    lh = filt(res.x, r, lx)
    out = pd.Series(np.exp(lh / 2), index=S.index)
    return out.reindex(D.index[D.index.year == Y]).to_numpy()


# ------------------------------------------------------------------ scoring
def h_series(T, sig, q, ok, rank=False):
    """Walk-forward h = c * sigma^2 (c from 2018..Y-1). rank=True also fills 2018 with in-sample c (used only to
    rank arms for the 2019 combo; nothing in a test year is touched)."""
    yrs = T["year"].to_numpy()
    x2, s2 = T[q].to_numpy() ** 2, sig ** 2
    h = np.full(len(T), np.nan)
    for Y in range(2018 if rank else 2019, 2027):
        tr = (yrs >= 2018) & ((yrs < Y) if Y > 2018 else (yrs == 2018)) & ok & np.isfinite(s2) & (s2 > 0)
        te = yrs == Y
        if te.any() and tr.sum() > 50:
            h[te] = np.mean(x2[tr] / s2[tr]) * s2[te]
    return h


def qlike(T, h, q, ok):
    r = T[q].to_numpy() ** 2 / h
    return np.where(ok & np.isfinite(r) & (r > 0), r - np.log(np.where(r > 0, r, np.nan)) - 1, np.nan)


def picks(T, Q, pool, ok, q):
    """Walk-forward per-line pick: arm with lowest mean QLIKE on 2019..Y-1 (arms must have every prior row)."""
    yrs = T["year"].to_numpy()
    sel = np.full(len(T), None, dtype=object)
    chosen = {}
    for Y in QP.TEST:
        tr, te = (yrs >= 2019) & (yrs < Y) & ok, yrs == Y
        best, bv = None, np.inf
        for a in pool:
            v = Q[(a, q)][tr]
            if np.isnan(v).mean() > 0.02:
                continue
            m = float(np.nanmean(v))
            if m < bv:
                best, bv = a, m
        sel[te] = best
        chosen[Y] = best
    return sel, chosen


def pv(Q, sel, q, n):
    out = np.full(n, np.nan)
    for a in set(x for x in sel if x is not None):
        m = sel == a
        out[m] = Q[(a, q)][m]
    return out


def main():
    rng = np.random.default_rng(SEED)
    TC, board, allpicks, ctrl_rep = {}, [], {}, {}
    for sym in SYMS:
        T, old = QP.lines(sym)
        T = T.reset_index(drop=True)
        new, ctrl, _ = build_arms(sym, T)
        _, ok = QP.qlike_rows(T, old)
        # control 1: E_yz_20 alignment
        ref = T["E_yz_20"].to_numpy(float)
        m = np.isfinite(ref) & np.isfinite(ctrl)
        c1 = float(np.mean(np.abs(ctrl[m] / ref[m] - 1) < 0.01) * 100)
        say(f"{sym}: control 1 yz_20 match {c1:.1f}% of {m.sum()} sessions")
        if c1 < 95:
            raise SystemExit("control 1 failed: bar alignment")
        sig = {(a, q): QP.sig(T, a, q).astype(float) for a in old for q in LINES}
        sig.update(new)
        # oracle (control 3), kept out of the real pools
        zr = np.random.default_rng(SEED).standard_normal(len(T))
        for q in LINES:
            sig[("ORACLE", q)] = T[q].to_numpy(float) * np.exp(0.3 * zr)
        allarms = sorted(set(a for a, _ in sig))
        H = {k: h_series(T, s, k[1], ok, rank=True) for k, s in sig.items()}
        Q = {k: qlike(T, h, k[1], ok) for k, h in H.items()}
        # combos: geometric mean of h over top-k arms on QLIKE of 2018..Y-1 (2018 in-sample c, ranking only)
        yrs = T["year"].to_numpy()
        base_pool = [a for a in allarms if a != "ORACLE"]
        for k in (3, 5):
            for q in LINES:
                hc = np.full(len(T), np.nan)
                for Y in range(2019, 2027):
                    tr, te = (yrs >= 2018) & (yrs < Y) & ok, yrs == Y
                    sc = {a: float(np.nanmean(Q[(a, q)][tr])) for a in base_pool
                          if np.isnan(Q[(a, q)][tr]).mean() < 0.02}
                    top = sorted(sc, key=sc.get)[:k]
                    hc[te] = np.exp(np.mean([np.log(H[(a, q)][te]) for a in top], axis=0))
                H[(f"W_combo{k}", q)] = hc
                Q[(f"W_combo{k}", q)] = qlike(T, hc, q, ok)
        for k_ in list(Q):  # drop the 2018 ranking-only values from every arm's scored QLIKE
            Q[k_] = np.where(yrs >= 2019, Q[k_], np.nan)
        allarms = sorted(set(a for a, _ in Q))
        new_pool = [a for a in allarms if a != "ORACLE"]
        sel_old, sel_wide, sel_orc = {}, {}, {}
        for q in LINES:
            sel_old[q], pk_o = picks(T, Q, old, ok, q)
            sel_wide[q], pk_w = picks(T, Q, new_pool, ok, q)
            sel_orc[q], pk_x = picks(T, Q, new_pool + ["ORACLE"], ok, q)
            allpicks.setdefault(sym, {})[q] = {"old": pk_o, "wide": pk_w}
            ctrl_rep.setdefault(sym, {})[q] = all(v == "ORACLE" for v in pk_x.values())
        # control 2: reproduce QP's QL pick
        Qo, _ = QP.qlike_rows(T, old)
        selqp, _ = QP.select(T, old, Qo, ok)
        test = (yrs >= 2020) & ok
        mine = sum(pv(Q, sel_old[q], q, len(T)) for q in LINES)[test].sum()
        theirs = sum(QP.pick_vec(Qo, selqp["QL"][q], q, len(T)) for q in LINES)[test].sum()
        say(f"{sym}: control 2 OLD vs ladder-qlike-per-line QL {mine / theirs * 100 - 100:+.3f}%   "
            f"control 3 oracle picked {sum(ctrl_rep[sym].values())}/3 lines every year")
        TC[sym] = dict(T=T, Q=Q, ok=ok, sel_old=sel_old, sel_wide=sel_wide, keep=test)
        for a in allarms:
            for q in LINES:
                v = Q[(a, q)][test]
                if np.isnan(v).mean() < 0.02:
                    board.append(dict(sym=sym, line=q, arm=a, qlike=float(np.nanmean(v)), new=a.startswith("W_")))
    if not all(all(v.values()) for v in ctrl_rep.values()):
        say("CONTROL 3 FAILED (oracle not always picked)")
    B = pd.DataFrame(board)
    B = B[B.arm != "ORACLE"].copy()
    B["rank"] = B.groupby(["sym", "line"])["qlike"].rank(method="min").astype(int)
    B["n"] = B.groupby(["sym", "line"])["qlike"].transform("size")
    B[B.arm != "ORACLE"].sort_values(["sym", "line", "qlike"]).to_csv(OUT / "leaderboard.csv", index=False)

    def pairs(by_q=None):
        out = {}
        for s, c in TC.items():
            qs = (by_q,) if by_q else LINES
            nw = sum(pv(c["Q"], c["sel_wide"][q], q, len(c["T"])) for q in qs)[c["keep"]]
            bs = sum(pv(c["Q"], c["sel_old"][q], q, len(c["T"])) for q in qs)[c["keep"]]
            out[s] = (c["T"]["year"].to_numpy()[c["keep"]], nw, bs)
        return out
    res = {"all": QP.rel_delta(pairs(), rng)}
    for h, yr in QP.HALVES.items():
        res[h] = QP.rel_delta(pairs(), rng, yr)
    per_line = {q: QP.rel_delta(pairs(q), rng) for q in LINES}
    per_sym = {}
    for s in SYMS:
        p = pairs()
        per_sym[s] = QP.rel_delta({s: p[s]}, rng)
    v = ("VALIDATED" if res["all"][1][1] < 0 and all(res[h][1][1] < 0 for h in QP.HALVES)
         else "NULL" if res["all"][0] >= 0 and res["all"][1][0] > -0.5 else "UNDERPOWERED")
    say("\n== H1: WIDE pick vs OLD pick (summed QLIKE, % change, negative = WIDE better)")
    for k, (pt, ci) in res.items():
        say(f"  {k:8s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
    for q, (pt, ci) in per_line.items():
        say(f"  line {q:3s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
    for s, (pt, ci) in per_sym.items():
        say(f"  {s:7s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
    say(f"  VERDICT: {v}")
    say("\n== Picks by year (old -> wide)")
    for s in SYMS:
        for q in LINES:
            o, w = allpicks[s][q]["old"], allpicks[s][q]["wide"]
            say(f"  {s:7s} {q}: " + "  ".join(f"{Y}:{o[Y]}->{w[Y]}" for Y in sorted(o)))
    say("\n== Top 8 per cell (out of sample 2020-2026.08; hindsight, descriptive)")
    for (s, q), g in B[B.arm != "ORACLE"].groupby(["sym", "line"], sort=False):
        g = g.sort_values("qlike")
        top = "  ".join(f"{r.arm} {r.qlike:.4f}" for r in g.head(8).itertuples())
        jl = {a: int(g[g.arm == a]["rank"].iloc[0]) for a in ("W_rv_1", "W_park_1") if (g.arm == a).any()}
        say(f"  {s:7s} {q}: {top}\n      Jordan-like ranks: {jl} of {len(g)}")
    out = dict(seed=SEED, verdict=v, h1=res, per_line=per_line, per_sym=per_sym, picks=allpicks,
               controls={"oracle_always_picked": ctrl_rep})
    (OUT / "results.json").write_text(json.dumps(out, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG), encoding="utf-8")


if __name__ == "__main__":
    main()
