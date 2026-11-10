"""Vol-Layer deep dive, layer 1 (state): build C.OG's five vol-state fields and look at them. Nothing is scored as a trade.

C.OG (Market Movers, 2026-09-28): make volatility a shared state variable with five fields:
  F1 current conditional vol      log(sigma), sigma = live_sig_used (the live export sigma, % daily, known at the open)
  F2 expected change in vol       log-HAR on 5-min RV, iterated 5 sessions ahead: 0.5*log(mean RV-hat next 5 / mean RV last 5)
  F3 vol vs its long-run level    log(sigma / median sigma over the previous 252 sessions)
  F4 P(high-vol regime)           2-state Gaussian HMM on log RV5, PREDICTED probability for session t from RV up to t-1
  F5 forecast error               EWMA (half-life 10 sessions) of log(sqrt(RV5)/sigma), minus its own expanding mean

Every field for session t uses data from sessions < t only. Model parameters (HAR, HMM, GARCH) are refitted at each
calendar quarter start on an expanding window of earlier sessions (>= 250), so a parameter never sees its own quarter.
M1 starts 2016-10-21, so model-based fields start 2018-01; F1/F3/F5 start earlier.

Benchmarks fitted alongside: GARCH(1,1) by Gaussian MLE on NY-close daily returns (the bar shape the live sigma uses),
log-HAR 1-step, yesterday's RV (random walk). All variance forecasts are put on the RV5 scale with a past-only
expanding mean of RV5/forecast, so QLIKE compares shape, not level.

DISCOVERY WINDOW ONLY: sessions 2016-10-24 .. 2022-12-30. M1 is cut at the end of 2022-12-30 London before anything
is computed; 2023 .. 2026-08-20 is the unseen confirm window.

    python -X utf8 scripts/vol-layer-deep/state.py build   -> analysis/output/vol-layer-deep/state/sessions.parquet
    python -X utf8 scripts/vol-layer-deep/state.py look    -> backtest-data/vol-layer/state-look.json
    python -X utf8 scripts/vol-layer-deep/state.py check   -> compares the fast session/NY builders with forge/rv.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.optimize import minimize  # noqa: E402
from scipy.signal import lfilter  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-deep/state"
WEB = ROOT / "backtest-data/vol-layer"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
START, END = "2016-10-24", "2022-12-30"
SEED = 20261111
LON, NYK = "Europe/London", "America/New_York"
STEP, MIN_RET = 5, 132
MIN_FIT = 250
HL_ERR = 10                     # half-life (sessions) of the forecast-error EWMA


# ---------------------------------------------------------------- data
def instruments():
    return [f.stem for f in sorted(HIST.glob("*.csv")) if (BA / f"{BA_KEY.get(f.stem, f.stem.lower())}_m1.parquet").exists()]


def load_m1(sym):
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "open", "high", "low", "close"])
    t = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True))
    stop = (pd.Timestamp(END) + pd.Timedelta(days=1)).tz_localize(LON).tz_convert("UTC")
    keep = np.asarray(t < stop)
    df, t = df[keep].reset_index(drop=True), t[keep]
    df.index = t
    df = df.sort_index()
    assert df.index.max() < stop
    return df


def fast_sessions(m1):
    """Same grid rules as forge.rv.session_rv (London 00:00-22:00, weekdays, 5-min last close, returns only between
    adjacent non-empty slots, >= 132 returns), vectorised; plus RV per London hour."""
    loc = m1.index.tz_convert(LON).tz_localize(None)
    minute = (loc.hour * 60 + loc.minute).to_numpy()
    keep = (minute < 22 * 60) & (loc.dayofweek < 5) & np.isfinite(m1["close"].to_numpy()) & (m1["close"].to_numpy() > 0)
    loc, minute = loc[keep], minute[keep]
    o, h, l, c = (m1[k].to_numpy()[keep] for k in ("open", "high", "low", "close"))
    codes, uniq = pd.factorize(loc.normalize())
    dates = np.asarray(uniq.strftime("%Y-%m-%d"))
    nd = len(dates)
    slot = minute // STEP
    key = codes.astype(np.int64) * 1000 + slot
    last = np.flatnonzero(np.r_[key[1:] != key[:-1], True])
    sd, ss, sc = codes[last], slot[last], c[last]
    ok = (sd[1:] == sd[:-1]) & (np.diff(ss) == 1)
    r = np.diff(np.log(sc))[ok]
    rd, rh = sd[1:][ok], (ss[1:][ok] * STEP) // 60
    n = np.bincount(rd, minlength=nd)
    rv = np.bincount(rd, r ** 2, minlength=nd)
    rq = n / 3.0 * np.bincount(rd, r ** 4, minlength=nd)
    hr = np.zeros((nd, 22))
    np.add.at(hr, (rd, rh), r ** 2)
    starts = np.flatnonzero(np.r_[True, codes[1:] != codes[:-1]])
    S = pd.DataFrame({"open": o[starts], "high": np.maximum.reduceat(h, starts), "low": np.minimum.reduceat(l, starts),
                      "close": c[np.r_[starts[1:] - 1, len(c) - 1]], "n": n, "rv": rv, "rq": rq}, index=dates)
    for k in range(22):
        S[f"h{k}"] = hr[:, k]
    return S[S.n >= MIN_RET]


def fast_ny(m1, min_bars=60):
    """Same as forge.rv.ny_close_daily (bars ending 17:00 New York), vectorised dates."""
    ny = m1.index.tz_convert(NYK).tz_localize(None)
    codes, uniq = pd.factorize((ny + pd.Timedelta(hours=7)).normalize())
    g = pd.DataFrame({"c": codes, "open": m1["open"].to_numpy(), "high": m1["high"].to_numpy(), "low": m1["low"].to_numpy(),
                      "close": m1["close"].to_numpy()}).groupby("c", sort=True)
    out = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(), "close": g["close"].last(),
                        "n": g["close"].size()})
    out.index = np.asarray(uniq.strftime("%Y-%m-%d"))[out.index.to_numpy()]
    idx = pd.DatetimeIndex(out.index)
    out = out[(out.n >= min_bars) & (idx.dayofweek < 5)].copy()
    out["end_utc"] = pd.DatetimeIndex(out.index).tz_localize(None) + pd.Timedelta(hours=17)
    out["end_utc"] = out["end_utc"].dt.tz_localize(NYK).dt.tz_convert("UTC")
    out = out[out.end_utc <= m1.index[-1] + pd.Timedelta(minutes=1)]
    return out.sort_index()


def check():
    from forge import rv as RV
    m1 = load_m1("EURUSD")
    m1 = m1[(m1.index >= "2018-01-01") & (m1.index < "2018-04-01")]
    a, b = fast_sessions(m1), RV.session_rv(m1, last_date=None)
    j = a.index.intersection(b.index)
    print("sessions fast/forge", len(a), len(b), "max rel diff rv", float((a.loc[j, "rv"] / b.loc[j, "rv"] - 1).abs().max()),
          "rq", float((a.loc[j, "rq"] / b.loc[j, "rq"] - 1).abs().max()), "high", float((a.loc[j, "high"] - b.loc[j, "high"]).abs().max()))
    x, y = fast_ny(m1), RV.ny_close_daily(m1, last_date=None)
    j = x.index.intersection(y.index)
    print("ny fast/forge", len(x), len(y), "max close diff", float((x.loc[j, "close"] - y.loc[j, "close"]).abs().max()),
          "end_utc equal", bool((x.loc[j, "end_utc"] == y.loc[j, "end_utc"]).all()))


# ---------------------------------------------------------------- models
def quarter_starts(dates):
    q = pd.PeriodIndex(pd.DatetimeIndex(dates), freq="Q").start_time.strftime("%Y-%m-%d")
    return np.asarray(q)


def har_design(lrv):
    """log-HAR regressors at t from RV of t-1, t-5..t-1, t-22..t-1 (RV in levels averaged, then logged)."""
    rv = np.exp(lrv)
    s = pd.Series(rv)
    d = np.log(s.shift(1))
    w = np.log(s.shift(1).rolling(5).mean())
    m = np.log(s.shift(1).rolling(22).mean())
    return np.column_stack([np.ones(len(s)), d, w, m])


def har_fit(X, y):
    ok = np.isfinite(X).all(1) & np.isfinite(y)
    b, *_ = np.linalg.lstsq(X[ok], y[ok], rcond=None)
    res = y[ok] - X[ok] @ b
    return b, float(res.var())


def har_iterate(b, s2, hist_rv, k=5):
    """Iterate the log-HAR k steps from a history of RV levels (most recent last); returns RV-hat for t..t+k-1."""
    h = list(hist_rv[-22:])
    out = []
    for _ in range(k):
        x = np.array([1.0, np.log(h[-1]), np.log(np.mean(h[-5:])), np.log(np.mean(h[-22:]))])
        v = float(np.exp(x @ b + 0.5 * s2))
        out.append(v)
        h.append(v)
    return out


def garch_filter(r, w, a, bta, h0):
    x = w + a * r[:-1] ** 2
    hr = lfilter([1.0], [1.0, -bta], x, zi=[bta * h0])[0]
    return np.r_[h0, hr]


def garch_fit(r, init=None):
    v = float(np.var(r))

    def nll(p):
        w, a, bta = p
        if w <= 0 or a < 0 or bta < 0 or a + bta >= 0.9995:
            return 1e12
        h = garch_filter(r, w, a, bta, v)
        return 0.5 * float(np.sum(np.log(h) + r ** 2 / h))

    best = None
    for p0 in ([v * 0.05, 0.05, 0.90], [v * 0.02, 0.03, 0.95], *([list(init)] if init is not None else [])):
        res = minimize(nll, np.array(p0, float), method="Nelder-Mead", options={"xatol": 1e-8, "fatol": 1e-6, "maxiter": 3000})
        if best is None or res.fun < best.fun:
            best = res
    return best.x


def garch_fit_vt(r, init=None):
    """GARCH(1,1) with variance targeting: omega = var(r)(1-a-b), (a, b) by Gaussian MLE, a+b <= 0.995. The free-omega
    MLE on 2017-2019 FX drives omega to ~0 and a+b to ~0.999 (vol fell steadily), which stops it mean-reverting."""
    v = float(np.var(r))

    def nll(p):
        a, bta = p
        if a < 0 or bta < 0 or a + bta > 0.995:
            return 1e12
        h = garch_filter(r, v * (1 - a - bta), a, bta, v)
        return 0.5 * float(np.sum(np.log(h) + r ** 2 / h))

    best = None
    for p0 in ([0.05, 0.90], [0.03, 0.95], *([list(init[1:])] if init is not None else [])):
        res = minimize(nll, np.array(p0, float), method="Nelder-Mead", options={"xatol": 1e-7, "fatol": 1e-6, "maxiter": 2000})
        if best is None or res.fun < best.fun:
            best = res
    a, bta = best.x
    return np.array([v * (1 - a - bta), a, bta])


def hmm_fit(y, init=None, iters=60):
    """2-state Gaussian HMM by EM on y (log RV). Returns (pi, A, mu, sd) with state 1 = the high-mean state."""
    y = y[np.isfinite(y)]
    if init is None:
        mu = np.quantile(y, [0.3, 0.8]); sd = np.array([y.std(), y.std()]) * 0.7
        A = np.array([[0.97, 0.03], [0.06, 0.94]]); pi = np.array([0.7, 0.3])
    else:
        pi, A, mu, sd = (np.array(z, float).copy() for z in init)
    T = len(y)
    for _ in range(iters):
        B = np.exp(-0.5 * ((y[:, None] - mu) / sd) ** 2) / sd
        al = np.zeros((T, 2)); c = np.zeros(T)
        al[0] = pi * B[0]; c[0] = al[0].sum(); al[0] /= c[0]
        for t in range(1, T):
            al[t] = (al[t - 1] @ A) * B[t]; c[t] = al[t].sum(); al[t] /= c[t]
        be = np.ones((T, 2))
        for t in range(T - 2, -1, -1):
            be[t] = (A @ (B[t + 1] * be[t + 1])) / c[t + 1]
        g = al * be; g /= g.sum(1, keepdims=True)
        xi = (al[:-1, :, None] * A[None] * (B[1:] * be[1:])[:, None, :]) / c[1:, None, None]
        A = xi.sum(0) / g[:-1].sum(0)[:, None]
        A /= A.sum(1, keepdims=True)
        pi = g[0]
        mu = (g * y[:, None]).sum(0) / g.sum(0)
        sd = np.sqrt((g * (y[:, None] - mu) ** 2).sum(0) / g.sum(0)).clip(0.05)
    if mu[0] > mu[1]:
        o = [1, 0]; pi, A, mu, sd = pi[o], A[np.ix_(o, o)], mu[o], sd[o]
    return pi, A, mu, sd


def hmm_predict(y, par):
    """P(state_t = high | y_1..y_{t-1}) for every t (predicted, filtered: no future data)."""
    pi, A, mu, sd = par
    T = len(y)
    out = np.full(T, np.nan)
    p = pi.copy()
    for t in range(T):
        out[t] = p[1]
        if np.isfinite(y[t]):
            b = np.exp(-0.5 * ((y[t] - mu) / sd) ** 2) / sd
            f = p * b
            f = f / f.sum() if f.sum() > 0 else p
        else:
            f = p
        p = f @ A
    return out


# ---------------------------------------------------------------- build
def build_one(sym):
    m1 = load_m1(sym)
    S = fast_sessions(m1)
    S = S[(S.index >= START) & (S.index <= END)].copy()
    ny = fast_ny(m1)
    sig = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used", "r_hl", "event"]).set_index("date")
    sig = sig[sig.index <= END]
    S = S.join(sig, how="inner")
    S = S[np.isfinite(S.live_sig_used) & (S.live_sig_used > 0)]
    S["sig"] = S.live_sig_used                                     # % daily
    S["rv5"] = S.rv * 1e4                                          # %^2
    S["hl"] = (S.high - S.low) / S.open * 100
    S["hl_s"] = S.hl / S.sig
    S["lrv"] = np.log(S.rv5)
    dates = S.index.to_numpy()
    T = len(S)
    # F1, F3: from the sigma history (the CSV holds sigma back to 2016-03, before the window, which is allowed)
    sg = sig.live_sig_used
    med252 = sg.shift(1).rolling(252, min_periods=120).median()
    S["F1"] = np.log(S.sig)
    S["F3"] = np.log(S.sig / med252.reindex(S.index))
    # F5: EWMA of log(sqrt(RV)/sigma) through t-1, minus the expanding mean through t-1
    e = 0.5 * S.lrv - np.log(S.sig)
    lam = 0.5 ** (1 / HL_ERR)
    ew = e.ewm(alpha=1 - lam, adjust=True).mean().shift(1)
    S["e_raw"] = e
    S["F5"] = ew - e.expanding(20).mean().shift(1)
    S["F5_ew"] = ew
    # quarterly refits: HAR, HMM, GARCH
    q = quarter_starts(S.index)
    X = har_design(S.lrv.to_numpy())
    y = S.lrv.to_numpy()
    rv = S.rv5.to_numpy()
    har1 = np.full(T, np.nan); har5 = np.full(T, np.nan); phi = np.full(T, np.nan); gar = np.full(T, np.nan); gvt = np.full(T, np.nan)
    ny_r = 100 * np.log(ny.close).diff().to_numpy()
    ny_dates = ny.index.to_numpy()
    lon_open = pd.DatetimeIndex(pd.to_datetime(S.index)).tz_localize(LON).tz_convert("UTC").as_unit("ns").asi8
    ends = pd.DatetimeIndex(ny.end_utc).as_unit("ns").asi8
    jlast = np.searchsorted(ends, lon_open, side="right") - 1        # last NY bar closed before the London open
    hpar, gpar, vpar, fits = None, None, None, []
    for qs in np.unique(q):
        tr = np.flatnonzero(S.index.to_numpy() < qs)
        te = np.flatnonzero(q == qs)
        if len(tr) < MIN_FIT:
            continue
        b, s2 = har_fit(X[tr], y[tr])
        har1[te] = np.exp(X[te] @ b + 0.5 * s2)
        for i in te:
            if i >= 22:
                path = har_iterate(b, s2, rv[:i])
                har5[i] = np.mean(path)
        hpar = hmm_fit(y[tr], init=hpar, iters=60 if hpar is None else 25)
        p_all = hmm_predict(y[: te[-1] + 1], hpar)
        phi[te] = p_all[te]
        # GARCH on NY-close returns that closed before the quarter's first London open
        cut = np.searchsorted(ends, lon_open[te[0]], side="right")
        rr = ny_r[1:cut]
        rr = rr[np.isfinite(rr)]
        if len(rr) >= MIN_FIT:
            gpar = garch_fit(rr, init=gpar)
            vpar = garch_fit_vt(rr, init=vpar)
            r_all = np.nan_to_num(ny_r[1:], nan=0.0)
            for par, dst in ((gpar, gar), (vpar, gvt)):
                w, a, bt = par
                h = garch_filter(r_all, w, a, bt, float(np.var(rr)))  # h[k] = variance of r_all[k] given r_all[<k]
                hn = w + a * r_all ** 2 + bt * h                       # variance of the NEXT bar after each bar
                for i in te:
                    j = jlast[i]                                       # last NY bar closed before the London open
                    if j >= 1:
                        dst[i] = hn[j - 1]
        fits.append({"q": qs, "har": [round(float(z), 4) for z in b], "hmm_mu": [round(float(z), 3) for z in hpar[2]],
                     "hmm_stay": [round(float(hpar[1][0, 0]), 4), round(float(hpar[1][1, 1]), 4)],
                     "garch": None if gpar is None else [float(z) for z in gpar],
                     "garch_vt": None if vpar is None else [float(z) for z in vpar]})
    S["har1"] = har1
    S["F4"] = phi
    S["garch"] = gar
    S["garch_vt"] = gvt
    # F2: expected next-5 mean RV vs the last-5 mean RV, in log-vol units
    last5 = S.rv5.shift(1).rolling(5).mean()
    S["F2"] = 0.5 * np.log(har5 / last5)
    nxt5 = S.rv5[::-1].rolling(5).mean()[::-1]                   # mean RV over t..t+4 (outcome, inside the window)
    S["dlv_real"] = 0.5 * np.log(nxt5 / last5)
    S["rw"] = S.rv5.shift(1)
    S["oh_s"] = (S.high - S.open) / S.open * 100 / S.sig
    S["ol_s"] = (S.open - S.low) / S.open * 100 / S.sig
    S["inst"] = sym
    S.index.name = "date"
    return S.reset_index(), fits


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    parts, allfits = [], {}
    for sym in instruments():
        t0 = time.time()
        S, fits = build_one(sym)
        parts.append(S)
        allfits[sym] = fits
        print(sym, len(S), f"{time.time() - t0:.1f}s", flush=True)
    D = pd.concat(parts, ignore_index=True)
    assert D.date.max() <= END and D.date.min() >= START
    D.to_parquet(OUT / "sessions.parquet", index=False)
    (OUT / "fits.json").write_text(json.dumps(allfits), encoding="utf-8")
    print("rows", len(D))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "check":
        check()
    elif cmd == "build":
        build()
    elif cmd == "look":
        import state_look
        state_look.main()
