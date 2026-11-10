"""Vol-Layer deep dive, layer 3 (features): splitting correlation from variance. Stage 2: build and look, nothing scored.

C.OG: "An example of a layer is an engineering feature such as splitting correlation from variance."

What it builds, in CURRENCY LEGS (the 7 USD majors), never in the 34 crosses (crosses are near-exact combinations of
the majors, so a 34-instrument covariance is near-singular and a cross's "common move" rebuilds the cross itself):

  * a 1-minute grid of log mid prices (bid/ask close mid) for each London session 00:00-22:00, 2016-10-24 .. 2022-12-30;
  * each major as a USD-signed return u_i (+ = dollar stronger);
  * a LEAVE-OWN-OUT dollar factor D_-i = mean of the other six u_j, so the pair is never inside its own factor;
  * a point-in-time beta (prior 20 sessions only) and the split u_i = beta*D_-i (common) + e_i (own);
  * looks: common share by pair/year/sampling interval, correlation vs the vol level with Forbes-Rigobon benchmarks,
    the day's move split, persistence, own-move autocorrelation at 5/15/60 min with bounce/skip/shuffle checks,
    gold and indices vs the dollar, example days, and what the split means for stop width.

Benchmarks: a wrong-day (shuffled) factor, same-day in-sample R2, Forbes-Rigobon "only the factor variance rose" and
"everything scaled together", raw pair autocorrelation, a shuffled-outcome null, plain sigma, the spread.

DISCOVERY WINDOW ONLY. Seed 20261111.
    python -X utf8 scripts/vol-layer-deep/features.py           (grids cached in analysis/output/vol-layer-deep/features/)
    -> backtest-data/vol-layer/features-look.json
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

import line_reaction as LR  # noqa: E402

START, END = "2016-10-24", "2022-12-30"
SEED = 20261111
NM = 22 * 60                      # minutes 00:00-22:00 London
FFILL = 30                        # a missing M1 bar = no new quote; carry the last quote forward at most 30 minutes
BA = ROOT / "data/m1_bidask"
HIST = ROOT / "analysis/output/forecast_history"
OUT = ROOT / "analysis/output/vol-layer-deep/features"
WEB = ROOT / "backtest-data/vol-layer"
MAJ = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]
SIGN = {"EURUSD": -1, "GBPUSD": -1, "AUDUSD": -1, "NZDUSD": -1, "USDCAD": 1, "USDCHF": 1, "USDJPY": 1}   # -> + = USD up
OTHER = ["EURGBP", "EURJPY", "GOLD", "NQ", "SPX500"]
FILE = {"GOLD": "gold", "NQ": "nq", "SPX500": "spx"}
ALL = MAJ + OTHER
BETA_WIN = 20                     # sessions in the point-in-time beta


# ----------------------------------------------------------------------------------------------------------- grids
def load(sym, days):
    df = pd.read_parquet(BA / f"{FILE.get(sym, sym.lower())}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    date = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    m = (idx.hour * 60 + idx.minute).to_numpy()
    keep = (date >= START) & (date <= END) & (m < NM)
    date, m = date[keep], m[keep]
    bid, ask = df.bid_c.to_numpy()[keep], df.ask_c.to_numpy()[keep]
    assert len(date) == 0 or date.max() <= END
    di = pd.Index(days).get_indexer(date)
    ok = (di >= 0) & (bid > 0) & (ask >= bid)
    mid = np.full((len(days), NM), np.nan)
    hs = np.full((len(days), NM), np.nan, dtype=np.float32)
    mid[di[ok], m[ok]] = np.log((bid[ok] + ask[ok]) / 2)
    hs[di[ok], m[ok]] = (np.log(ask[ok]) - np.log(bid[ok])) / 2
    raw = np.isfinite(mid).sum(1)
    mid = pd.DataFrame(mid).ffill(axis=1, limit=FFILL).to_numpy()
    hs = pd.DataFrame(hs).ffill(axis=1, limit=FFILL).to_numpy(dtype=np.float32)
    first = np.array([r[np.isfinite(r)][0] if np.isfinite(r).any() else np.nan for r in mid])
    return (mid - first[:, None]).astype(np.float32), hs, first, raw


def grids():
    f = OUT / "grids.npz"
    if f.exists():
        z = np.load(f, allow_pickle=False)
        return z["days"].tolist(), z["L"], z["HS"], z["P0"], z["RAW"]
    OUT.mkdir(parents=True, exist_ok=True)
    days = pd.bdate_range(START, END).strftime("%Y-%m-%d").tolist()
    L = np.full((len(ALL), len(days), NM), np.nan, dtype=np.float32)
    HS = np.full((len(MAJ), len(days), NM), np.nan, dtype=np.float32)
    P0 = np.full((len(ALL), len(days)), np.nan)
    RAW = np.zeros((len(ALL), len(days)), dtype=np.int32)
    for k, s in enumerate(ALL):
        t = time.time()
        L[k], hs, P0[k], RAW[k] = load(s, days)
        if k < len(MAJ):
            HS[k] = hs
        print(f"grid {s} {time.time() - t:.0f}s", flush=True)
    np.savez(f, days=np.array(days), L=L, HS=HS, P0=P0, RAW=RAW)
    return days, L, HS, P0, RAW


def sigma(sym, days):
    s = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "live_sig_used"]).set_index("date").live_sig_used / 100
    return s.reindex(days).to_numpy(float)                     # daily sigma in log units, known at the open


# ----------------------------------------------------------------------------------------------------------- helpers
def blocks(X, h, off=0):
    """Return over [t-h, t] for t = h+off, 2h+off, ... from a [.., day, minute] level grid."""
    t = np.arange(h + off, NM, h)
    return X[..., t] - X[..., t - h], t


def pit_beta(sxy, sxx, win=BETA_WIN):
    """beta for day d from days d-win .. d-1 only."""
    a = pd.DataFrame(sxy).T.rolling(win, min_periods=win // 2).sum().shift(1).T.to_numpy()
    b = pd.DataFrame(sxx).T.rolling(win, min_periods=win // 2).sum().shift(1).T.to_numpy()
    return a / b


def r4(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def boot_ratio(dates, num, den):
    m = np.isfinite(num) & np.isfinite(den)
    bs = LR.Boot(dates[m])
    return bs.ratio(dates[m], num[m], dates[m], den[m])[0]


def boot_mean(dates, x):
    m = np.isfinite(x)
    return LR.Boot(dates[m]).mean(dates[m], x[m])[0]


# ----------------------------------------------------------------------------------------------------------- main build
def main():
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    days, L, HS, P0, RAW = grids()
    days = np.array(days)
    assert max(days.tolist()) <= END
    nD = len(days)
    iM = {s: k for k, s in enumerate(ALL)}
    # sessions where all 7 majors are present for most of the day
    good = (RAW[: len(MAJ)] >= 900).all(0)
    print("sessions", nD, "complete for all 7 majors", int(good.sum()))
    U = np.stack([SIGN[s] * L[iM[s]] for s in MAJ]).astype(np.float64)        # [7, day, min] USD-signed levels
    U[:, ~good, :] = np.nan
    UB = np.stack([SIGN[s] * (L[iM[s]] - HS[k]) for k, s in enumerate(MAJ)]).astype(np.float64)   # bid-only levels
    UB[:, ~good, :] = np.nan
    SIG = np.stack([sigma(s, days) for s in MAJ])                                 # [7, day]
    perm = rng.permutation(nD)                                                    # wrong-day factor benchmark
    years = np.array([d[:4] for d in days])
    res = {"window": [START, END], "seed": SEED, "sessions": int(good.sum())}

    def legs(Ulev):
        tot = np.nansum(Ulev, 0)
        cnt = np.isfinite(Ulev).sum(0)
        return np.stack([(tot - np.nan_to_num(Ulev[i])) / (cnt - np.isfinite(Ulev[i])) for i in range(len(MAJ))])

    D = legs(U)                                   # leave-own-out dollar level per pair [7, day, min]
    D[:, ~good] = np.nan
    DOL = np.nanmean(U, 0)                        # all-7 dollar level (for gold/indices and the trap)

    # ---- 1. common share by pair, sampling interval, year (point-in-time beta, wrong-day and same-day benchmarks)
    share = {}
    daily = {}
    for h in (1, 5, 15, 60):
        x, _ = blocks(U, h)
        d, _ = blocks(D, h)
        m = np.isfinite(x) & np.isfinite(d)
        x0, d0 = np.where(m, x, 0), np.where(m, d, 0)
        sxy, sxx, syy = (x0 * d0).sum(2), (d0 * d0).sum(2), (x0 * x0).sum(2)
        b = np.stack([pit_beta(sxy[i:i + 1], sxx[i:i + 1])[0] for i in range(len(MAJ))])
        sse = syy - 2 * b * sxy + b * b * sxx
        dsh = d[:, perm]                                                           # factor from another session
        msh = np.isfinite(x) & np.isfinite(dsh)
        xs, ds = np.where(msh, x, 0), np.where(msh, dsh, 0)
        sxy_s, sxx_s, syy_s = (xs * ds).sum(2), (ds * ds).sum(2), (xs * xs).sum(2)
        sse_s = syy_s - 2 * b * sxy_s + b * b * sxx_s
        same = sxy ** 2 / (sxx * syy)
        for i, s in enumerate(MAJ):
            ok = good & np.isfinite(b[i]) & (syy[i] > 0)
            dt = days[ok]
            share[(s, h)] = {
                "pit": boot_ratio(dt, syy[i][ok] - sse[i][ok], syy[i][ok]),
                "shuffled_oos": boot_ratio(days[ok & (syy_s[i] > 0)], (syy_s[i] - sse_s[i])[ok & (syy_s[i] > 0)], syy_s[i][ok & (syy_s[i] > 0)]),
                "shuffled": r4(float(np.nanmean((sxy_s[i] ** 2 / (sxx_s[i] * syy_s[i]))[ok & (syy_s[i] > 0) & (sxx_s[i] > 0)]))),
                "same_day": r4(float(np.nanmean(same[i][ok]))),
                "beta": r4(float(np.nanmedian(b[i][ok]))),
                "years": {y: r4(1 - sse[i][ok & (years == y)].sum() / syy[i][ok & (years == y)].sum()) for y in sorted(set(years))},
            }
            if h == 5:
                daily[s] = {"ok": ok, "b": b[i], "sse": sse[i], "syy": syy[i], "sxy": sxy[i], "sxx": sxx[i]}
        print("share h", h, {s: share[(s, h)]["pit"][0] for s in MAJ}, f"{time.time() - t0:.0f}s", flush=True)
    res["share"] = {f"{s}|{h}": v for (s, h), v in share.items()}

    # ---- 2. triangular trap: crosses vs a "common move" built from their own legs, vs the dollar factor
    trap = {}
    for cr, (a, bq) in {"EURGBP": ("EURUSD", "GBPUSD"), "EURJPY": ("EURUSD", "USDJPY")}.items():
        lc = L[iM[cr]].astype(np.float64)
        # cross = a-leg minus b-leg in log price: EURGBP = EURUSD - GBPUSD ; EURJPY = EURUSD + USDJPY
        legs_lvl = L[iM[a]].astype(np.float64) + (-1 if cr == "EURGBP" else 1) * L[iM[bq]].astype(np.float64)
        x, _ = blocks(lc, 5)
        y, _ = blocks(legs_lvl, 5)
        dol, _ = blocks(DOL, 5)
        out = {}
        for nm, f in (("legs", y), ("dollar", dol)):
            m = np.isfinite(x) & np.isfinite(f) & good[:, None]
            xx, ff = x[m], f[m]
            out[nm] = r4(np.corrcoef(xx, ff)[0, 1] ** 2)
        trap[cr] = out
    # leave-own-out vs including-own dollar factor for the majors (own-pair-in-own-factor trap)
    x, _ = blocks(U, 5)
    dol, _ = blocks(DOL, 5)
    dl, _ = blocks(D, 5)
    for i, s in enumerate(MAJ):
        m = np.isfinite(x[i]) & np.isfinite(dol) & np.isfinite(dl[i])
        trap[s] = {"incl_own": r4(np.corrcoef(x[i][m], dol[m])[0, 1] ** 2), "leave_out": r4(np.corrcoef(x[i][m], dl[i][m])[0, 1] ** 2)}
    res["trap"] = trap
    print("trap", trap, flush=True)

    # ---- 3. correlation vs the vol level (7 majors, 5-min), Forbes-Rigobon benchmarks
    x, _ = blocks(U, 5)                                     # [7, day, bars]
    allok = np.isfinite(x).all(0)                            # bars where all 7 exist
    x0 = np.where(allok[None], x, 0)
    nb = allok.sum(1)
    C = np.einsum("idk,jdk->dij", x0, x0)                    # [day, 7, 7] raw second moments (5-min means ~ 0)
    act = np.array([np.trace(C[d]) / 7 / max(nb[d], 1) for d in range(nD)])
    act[~good | (nb < 200)] = np.nan
    dcorr = np.full(nD, np.nan)
    iu = np.triu_indices(7, 1)
    for d in np.flatnonzero(np.isfinite(act)):
        v = np.sqrt(np.diag(C[d]))
        dcorr[d] = (C[d] / np.outer(v, v))[iu].mean()
    w = np.ones(7) / 7

    def onefactor(Cs, n):
        S = Cs / n
        vF = w @ S @ w
        beta = S @ w / vF
        idio = np.diag(S) - beta ** 2 * vF
        return S, vF, beta, idio

    def corr_of(beta, vF, idio):
        S = np.outer(beta, beta) * vF + np.diag(idio)
        v = np.sqrt(np.diag(S))
        R = S / np.outer(v, v)
        return R[iu].mean(), np.linalg.eigvalsh(R)[-1] / 7

    def deciles(key):
        dec = np.full(nD, -1)
        for y in sorted(set(years)):
            m = (years == y) & np.isfinite(key)
            if m.sum() > 20:
                dec[m] = pd.qcut(key[m], 10, labels=False, duplicates="drop")
        return dec

    prev_act = pd.Series(act).shift(1).to_numpy().copy()
    prev_act[np.r_[True, ~good[:-1]]] = np.nan
    vol_rows = {}
    for nm, key in (("same_day", act), ("prev_day", prev_act)):
        dec = deciles(key)
        rows = []
        calm = None
        for q in range(10):
            m = (dec == q) & np.isfinite(act)
            Cs, n = C[m].sum(0), nb[m].sum()
            S, vF, beta, idio = onefactor(Cs, n)
            v = np.sqrt(np.diag(S))
            R = S / np.outer(v, v)
            pooled = R[iu].mean()
            eig = np.linalg.eigvalsh(R)[-1] / 7
            if calm is None:
                calm = (vF, beta, idio)
            fr_only, _ = corr_of(calm[1], vF, calm[2])                # only the factor variance moved
            rows.append({"decile": q + 1, "pooled_corr": r4(pooled), "pc1_share": r4(eig), "mean_daily_corr": r4(float(np.nanmean(dcorr[m]))),
                         "fr_only_factor": r4(fr_only), "flat_structure": r4(corr_of(calm[1], calm[0], calm[2])[0]),
                         "vF_ratio": r4(vF / calm[0]), "idio_ratio": r4(float(np.mean(idio / calm[2]))), "beta_mean": r4(float(beta.mean())),
                         "beta_range": r4(float(np.max(np.abs(beta - calm[1])))), "days": int(m.sum()),
                         "act_bp": r4(float(np.sqrt(np.nanmean(act[m])) * 1e4), 3)})
        vol_rows[nm] = rows
    res["corr_vs_vol"] = vol_rows
    # year by year mean daily correlation and pooled
    def pooled_corr(m):
        S = C[m].sum(0) / nb[m].sum()
        v = np.sqrt(np.diag(S))
        return (S / np.outer(v, v))[iu].mean()
    res["corr_years"] = {y: {"pooled": r4(pooled_corr((years == y) & np.isfinite(act))), "daily": r4(float(np.nanmean(dcorr[(years == y)])))} for y in sorted(set(years))}
    print("corr vs vol", [(r["decile"], r["pooled_corr"], r["fr_only_factor"]) for r in vol_rows["same_day"]], flush=True)

    # ---- 4. the day's move: dollar part vs own part (point-in-time beta), wrong-day benchmark; persistence
    day_rows = []
    for i, s in enumerate(MAJ):
        u_day = U[i][:, NM - 1] - U[i][:, 0]
        d_day = D[i][:, NM - 1] - D[i][:, 0]
        b = daily[s]["b"]
        c = b * d_day
        e = u_day - c
        c_sh = b * d_day[perm]
        e_sh = u_day - c_sh
        ok = daily[s]["ok"] & np.isfinite(u_day) & np.isfinite(d_day) & np.isfinite(SIG[i]) & np.isfinite(d_day[perm])
        for k in np.flatnonzero(ok):
            day_rows.append((s, days[k], u_day[k] / SIG[i, k], c[k] / SIG[i, k], e[k] / SIG[i, k], c_sh[k] / SIG[i, k], e_sh[k] / SIG[i, k],
                             1 - daily[s]["sse"][k] / daily[s]["syy"][k], np.sqrt(daily[s]["syy"][k]) / SIG[i, k], b[k]))
    DR = pd.DataFrame(day_rows, columns=["inst", "date", "move", "common", "own", "common_sh", "own_sh", "share5", "rv5", "beta"])
    DR["dshare"] = DR.common ** 2 / (DR.common ** 2 + DR.own ** 2)
    DR["dshare_sh"] = DR.common_sh ** 2 / (DR.common_sh ** 2 + DR.own_sh ** 2)
    DR.to_parquet(OUT / "days.parquet", index=False)
    # persistence of the daily intraday common share
    pers = {}
    for s, g in DR.groupby("inst"):
        g = g.sort_values("date")
        sh = g.share5.clip(-1, 1).to_numpy()
        lag1 = np.corrcoef(sh[1:], sh[:-1])[0, 1]
        trail = pd.Series(sh).rolling(20).mean().shift(1).to_numpy()
        m = np.isfinite(trail)
        tr = np.corrcoef(sh[m], trail[m])[0, 1]
        shuf = np.corrcoef(sh[1:], rng.permutation(sh)[:-1])[0, 1]
        pers[s] = {"lag1": r4(lag1), "trail20": r4(tr), "shuffled": r4(shuf)}
    res["persistence"] = pers
    # does a high common share (known at the open from the last 20 sessions) go with a bigger or smaller day? (look only)
    print("persistence", pers, flush=True)

    # ---- 5. own-move autocorrelation at 5/15/60 min: adjacent, skip one minute, bid-only, wrong-day, shuffled
    auto = {}
    econ = {}
    for h in (5, 15, 60):
        xf, t = blocks(U, h)                        # formation [t-h, t]
        xa, _ = blocks(U, h, off=h)                 # next block [t, t+h]  (aligned by index j -> j+1)
        dfm, _ = blocks(D, h)
        xb, _ = blocks(UB, h)
        # beta at this horizon, point in time
        m = np.isfinite(xf) & np.isfinite(dfm)
        a0, d0 = np.where(m, xf, 0), np.where(m, dfm, 0)
        bh = np.stack([pit_beta((a0[i] * d0[i]).sum(1)[None], (d0[i] ** 2).sum(1)[None])[0] for i in range(len(MAJ))])
        e = xf - bh[..., None] * dfm                                     # own move per block
        eb = xb - bh[..., None] * blocks(legs(UB), h)[0]                  # own move from bid-only quotes
        dsh = dfm[:, perm]
        ew = xf - bh[..., None] * dsh                                    # residual against a wrong-day factor
        # skip-one-minute outcome: [t+1, t+1+h]
        tt = np.arange(h, NM - h - 1, h)
        e_skip_out = (U[..., tt + 1 + h] - U[..., tt + 1]) - bh[..., None] * (D[..., tt + 1 + h] - D[..., tt + 1])
        e_skip_form = (U[..., tt] - U[..., tt - h]) - bh[..., None] * (D[..., tt] - D[..., tt - h])
        nb_ = e.shape[2]
        S = SIG[..., None]
        z = lambda a: a / S                                               # noqa: E731  in daily sigma
        F, O = z(e[..., :-1]), z(e[..., 1:])
        cells = {
            "own_adjacent": (F, O),
            "own_skip1": (z(e_skip_form), z(e_skip_out)),
            "own_bid_only": (z(eb[..., :-1]), z(eb[..., 1:])),
            "raw_pair": (z(xf[..., :-1]), z(xf[..., 1:])),
            "dollar_factor": (z(dfm[..., :-1]), z(dfm[..., 1:])),
            "wrong_day_resid": (z(ew[..., :-1]), z(ew[..., 1:])),
            "catch_up": (z(dfm[..., :-1]), O),                            # dollar move now -> own move next (stale pair)
            "shuffled_null": (F, O[:, rng.permutation(nD)]),
        }
        dd = np.broadcast_to(days[None, :, None], F.shape)
        out = {}
        for nm, (f, o) in cells.items():
            dd_ = np.broadcast_to(days[None, :, None], f.shape)
            mm = np.isfinite(f) & np.isfinite(o) & good[None, :, None]
            out[nm] = boot_ratio(dd_[mm], (f * o)[mm], (f * f)[mm])
            if nm in ("own_adjacent", "catch_up"):
                out[nm + "_by_pair"] = {s: r4(float(((f[i] * o[i])[mm[i]]).sum() / ((f[i] ** 2)[mm[i]]).sum())) for i, s in enumerate(MAJ)}
        auto[h] = out
        # economic size: after the biggest own moves (top decile of |own|, in sigma) what does the PAIR do next, signed
        # against the own move (fade), vs the spread; and after the biggest dollar moves, the pair signed with the dollar
        pair_next = xa if xa.shape[2] == nb_ else xa[..., :nb_]
        P = z(pair_next[..., : nb_ - 1])
        Fa = F
        mm = np.isfinite(Fa) & np.isfinite(P) & good[None, :, None]
        thr = np.nanpercentile(np.abs(Fa[mm]), 90)
        big = mm & (np.abs(Fa) >= thr)
        fade = -np.sign(Fa) * P
        Fd = z(dfm[..., :-1]) * bh[..., None]
        thr_d = np.nanpercentile(np.abs(Fd[mm & np.isfinite(Fd)]), 90)
        bigd = mm & np.isfinite(Fd) & (np.abs(Fd) >= thr_d) & (np.abs(Fa) < np.abs(Fd))
        foll = np.sign(Fd) * P
        sp = z(np.stack([np.nanmedian(2 * HS[i], 1) for i in range(len(MAJ))])[..., None] * np.ones_like(F))
        dd_ = np.broadcast_to(days[None, :, None], F.shape)
        econ[h] = {"fade_after_own": boot_mean(dd_[big], fade[big]), "own_threshold_sigma": r4(thr),
                   "follow_after_dollar": boot_mean(dd_[bigd], foll[bigd]), "dollar_threshold_sigma": r4(thr_d),
                   "spread_sigma": r4(float(np.nanmedian(sp[big]))), "n_own": int(big.sum()), "n_dollar": int(bigd.sum())}
        print("auto h", h, {k: v for k, v in out.items() if not k.endswith("by_pair")}, econ[h], f"{time.time() - t0:.0f}s", flush=True)
    res["auto"] = {str(k): v for k, v in auto.items()}
    res["econ"] = {str(k): v for k, v in econ.items()}

    # ---- 6. gold and indices vs the dollar (all-7 factor; theirs is never inside it)
    gi = {}
    for s in ("GOLD", "NQ", "SPX500"):
        lv = L[iM[s]].astype(np.float64)
        sg = sigma(s, days)
        for h in (5, 60):
            x, _ = blocks(lv, h)
            f, _ = blocks(DOL, h)
            m = np.isfinite(x) & np.isfinite(f) & good[:, None]
            x0, f0 = np.where(m, x, 0), np.where(m, f, 0)
            sxy, sxx, syy = (x0 * f0).sum(1), (f0 ** 2).sum(1), (x0 ** 2).sum(1)
            b = pit_beta(sxy[None], sxx[None])[0]
            sse = syy - 2 * b * sxy + b * b * sxx
            ok = np.isfinite(b) & (syy > 0)
            gi[f"{s}|{h}"] = {"pit": boot_ratio(days[ok], (syy - sse)[ok], syy[ok]), "beta": r4(float(np.nanmedian(b[ok]))),
                              "years": {y: r4(1 - sse[ok & (years == y)].sum() / syy[ok & (years == y)].sum()) for y in sorted(set(years))},
                              "corr": r4(float(np.corrcoef(x[m], f[m])[0, 1]))}
    res["gold_idx"] = gi
    print("gold/idx", {k: (v["pit"][0], v["corr"]) for k, v in gi.items()}, flush=True)

    # ---- 7. own sigma as a share of total sigma by vol tercile (stop-width look)
    stopw = {}
    for s, g in DR.groupby("inst"):
        g = g.copy()
        g["ter"] = pd.qcut(g.rv5, 3, labels=["quiet", "normal", "loud"])
        stopw[s] = {str(k): r4(float(np.sqrt((gg.rv5 ** 2 * (1 - gg.share5)).sum() / (gg.rv5 ** 2).sum())), 3)
                    for k, gg in g.groupby("ter", observed=True)}
        stopw[s]["all"] = r4(float(np.sqrt(max(0.0, 1 - share[(s, 5)]["pit"][0]))), 3)
        stopw[s]["all_60"] = r4(float(np.sqrt(max(0.0, 1 - share[(s, 60)]["pit"][0]))), 3)
    res["stop_width"] = stopw
    (OUT / "results.json").write_text(json.dumps(res, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("built", f"{time.time() - t0:.0f}s")
    return res


# ----------------------------------------------------------------------------------------------------------- look
# Written after reading results.json (2026-11-10); numbers quoted from it.
INTRO = [
 "1,584 London sessions (2016-10-24 to 2022-12-30) on a 1-minute bid/ask mid grid of the 7 USD majors, split into a leave-own-out dollar (the other six) and each pair's own move, β from the prior 20 sessions only. 2023 onwards is not looked at.",
 "The dollar explains 56-58% of EURUSD, AUDUSD and NZDUSD 5-minute variance, 37-43% of GBPUSD, USDCAD and USDCHF, and 22% of USDJPY. A dollar path from a random other session explains about 0.5%: the split is real, not chance.",
 "It is not fixed: GBPUSD went from about 20% dollar (2016-2019, Brexit) to 56% (2022); USDJPY from 31-34% (2016-17) to 7-11% (2018-20). But day to day it is persistent (0.51-0.76 correlation with yesterday's share), so the open knows roughly which kind of day to expect.",
 "Correlation rises with vol, but only a little: 0.40 on the calmest tenth of days to 0.50-0.54 on the loudest, while 'only the dollar got louder' would give 0.87. On loud days the dollar's variance grows 8x and each pair's own variance 6x. Sorted by yesterday's vol the rise is smaller (0.44 to about 0.48-0.52).",
 "Own moves reverse slightly at 5 minutes (slope -0.023), but skipping one minute halves it (-0.013): about half is quote timing. Dollar moves do not continue (slope -0.001 to +0.006). After the biggest own moves the pair gives back 0.002σ; the round-trip spread is 0.036σ, 17 times more.",
 "Traps measured: a cross rebuilt from its own legs has R² 0.99 (the cross itself), against 0.01-0.05 for the dollar; putting the pair inside its own dollar basket adds 11-17 points of fake common share.",
 "Gold is 22% dollar (β about -1); NQ and SPX 12% overall, near 0 in 2016-2019 and about 24-27% in 2022.",
 "What it means: the split is a strong, stable description of RISK (book stops, which currency is moving) and gives no intraday fade or follow signal by itself.",
]


def example_day(DR, days, L, inst, date, title, note):
    iM = {s: k for k, s in enumerate(ALL)}
    k = list(days).index(date)
    i = MAJ.index(inst)
    U = np.stack([SIGN[s] * L[iM[s], k].astype(np.float64) for s in MAJ])
    D = (np.nansum(U, 0) - U[i]) / (len(MAJ) - 1)
    row = DR[(DR.inst == inst) & (DR.date == date)].iloc[0]
    sg = sigma(inst, [date])[0]
    b = row.beta
    t = np.arange(0, NM, 15)
    sgn = SIGN[inst]                                        # back to the pair's own sign for display
    pair = sgn * (U[i, t] - U[i, 0]) / sg
    com = sgn * b * (D[t] - D[0]) / sg
    pts = lambda y: [[round(tt / 60, 2), round(float(v), 3)] for tt, v in zip(t, y) if np.isfinite(v)]  # noqa: E731
    return {"type": "lines", "title": title, "unit": "daily σ from the 00:00 London open", "xlabel": "London hour",
            "note": note + f" Point-in-time beta {b:.2f} (prior 20 sessions). Dollar share of the day's move {row.dshare:.0%}.",
            "series": [{"name": inst, "points": pts(pair)}, {"name": "dollar part (β × dollar ex-" + inst[:3 if sgn < 0 else 6][-3:] + ")", "points": pts(com)},
                       {"name": "own part", "points": pts(pair - com)}]}


def look():
    R = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    DR = pd.read_parquet(OUT / "days.parquet")
    z = np.load(OUT / "grids.npz", allow_pickle=False)
    days, L = z["days"].tolist(), z["L"]
    assert max(DR.date) <= END and max(days) <= END
    sh = R["share"]
    charts = []
    # 1. common share per pair with benchmarks
    charts.append({"type": "groups", "title": "How much of each major's 5-minute variance is the dollar", "names": ["Dollar share, point-in-time β", "Same-day fit (in-sample)", "Wrong-day dollar (benchmark)"],
                   "unit": "share of variance",
                   "note": "Dollar = average of the OTHER six majors (leave-own-out), USD-signed; β from the prior 20 sessions only. Same-day fit = the best possible β for that session (in-sample). Benchmark: the same-day fit against a dollar path from a random OTHER session, what 'no link' looks like (about 0.005 from chance alone).",
                   "rows": [{"label": s, "values": [sh[f"{s}|5"]["pit"][0], sh[f"{s}|5"]["same_day"], sh[f"{s}|5"]["shuffled"]]} for s in MAJ]})
    charts.append({"type": "bars", "title": "Dollar share at 5 minutes, with 95% date-block intervals", "unit": "share of variance", "ref": 0,
                   "note": "Stationary date-block bootstrap (block 20 sessions, 2,000 draws). Benchmark: 0 for no common move.",
                   "rows": [{"label": s, "value": sh[f"{s}|5"]["pit"][0], "lo": sh[f"{s}|5"]["pit"][1], "hi": sh[f"{s}|5"]["pit"][2]} for s in MAJ]})
    # 2. year by year
    yrs = sorted(sh["EURUSD|5"]["years"])
    charts.append({"type": "lines", "title": "Year by year: dollar share of 5-minute variance", "unit": "share of variance", "xlabel": "year",
                   "note": "Stability look. 2016 is late October to December only. A flat line means the split is a stable property of the pair.",
                   "series": [{"name": s, "points": [[int(y), sh[f"{s}|5"]["years"][y]] for y in yrs]} for s in ("EURUSD", "GBPUSD", "USDCAD", "USDJPY")]})
    # 3. sampling interval (Epps)
    charts.append({"type": "lines", "title": "Dollar share by sampling interval (the Epps effect)", "unit": "share of variance", "xlabel": "minutes per return",
                   "note": "Correlation measured on very short returns is biased low because quotes update at different moments. Benchmark: a flat line (no Epps). The rise from 1 to 60 minutes is the size of the bias.",
                   "series": [{"name": s, "points": [[h, sh[f"{s}|{h}"]["pit"][0]] for h in (1, 5, 15, 60)]} for s in ("EURUSD", "GBPUSD", "USDCAD", "USDJPY")]})
    # 4. the traps
    tr = R["trap"]
    rows = [{"label": "EURGBP vs its own legs (EURUSD−GBPUSD)", "value": tr["EURGBP"]["legs"]}, {"label": "EURGBP vs the dollar", "value": tr["EURGBP"]["dollar"]},
            {"label": "EURJPY vs its own legs (EURUSD+USDJPY)", "value": tr["EURJPY"]["legs"]}, {"label": "EURJPY vs the dollar", "value": tr["EURJPY"]["dollar"]}]
    rows += [{"label": f"{s}: dollar incl. itself / leave-own-out", "value": tr[s]["incl_own"], "lo": tr[s]["leave_out"], "hi": tr[s]["incl_own"]} for s in ("EURUSD", "USDJPY")]
    charts.append({"type": "bars", "title": "Two traps: a cross rebuilt from its own legs, and a pair inside its own factor", "unit": "R² at 5 minutes", "ref": 0,
                   "note": "A cross's 'common move' built from its legs is the cross itself (R² ≈ 0.99): triangular arbitrage, not information. The dollar cancels out of a cross (R² ≈ 0.02-0.03). Including the pair in its own dollar basket adds 10-14 points of fake common share (bar = incl. itself; the whisker's low end = leave-own-out).",
                   "rows": rows})
    # 5. correlation vs vol, Forbes-Rigobon
    cv = R["corr_vs_vol"]["same_day"]
    charts.append({"type": "lines", "title": "Does correlation rise when vol rises? Sorted by the day's own vol", "unit": "mean pairwise correlation (7 majors, 5-min)", "xlabel": "within-year vol decile",
                   "note": "Pooled = one correlation from all 5-min bars in the decile (deciles within each year). Benchmarks: 'only the dollar's variance rose' (Forbes-Rigobon: one-factor model with calm-decile loadings and own variances and this decile's dollar variance, shifted to start at the observed calm value) and 'structure unchanged' (flat at the calm value). From calm to loudest decile the dollar's variance grows 8.1x and the pairs' own variance 5.7x, so correlation rises only a little. Sorting on the same day's vol is itself a conditioning bias; the yesterday-sorted line is the one known at the open.",
                   "series": [{"name": "Pooled, observed", "points": [[r["decile"], r["pooled_corr"]] for r in cv]},
                              {"name": "Pooled, sorted by YESTERDAY's vol", "points": [[r["decile"], r["pooled_corr"]] for r in R["corr_vs_vol"]["prev_day"]]},
                              {"name": "Only dollar variance rose (FR)", "points": [[r["decile"], r4(cv[0]["pooled_corr"] + r["fr_only_factor"] - r["flat_structure"])] for r in cv]},
                              {"name": "Structure unchanged (calm)", "points": [[r["decile"], cv[0]["pooled_corr"]] for r in cv]}]})
    # 6. year by year correlation
    cy = R["corr_years"]
    charts.append({"type": "lines", "title": "Year by year: average correlation of the 7 majors", "unit": "mean pairwise correlation (5-min, USD-signed)", "xlabel": "year",
                   "note": "Pooled over the year vs the mean of daily values. A gap between them means correlation moves inside the year.",
                   "series": [{"name": "Pooled", "points": [[int(y), v["pooled"]] for y, v in cy.items()]}, {"name": "Mean of daily", "points": [[int(y), v["daily"]] for y, v in cy.items()]}]})
    # 7. the day's move: dollar part vs own part
    bins = np.linspace(0, 1, 11)
    hr = np.histogram(DR.dshare.dropna(), bins)[0] / DR.dshare.notna().sum()
    hs_ = np.histogram(DR.dshare_sh.dropna(), bins)[0] / DR.dshare_sh.notna().sum()
    charts.append({"type": "groups", "title": "Is a day's move mostly the dollar or mostly the pair? (open to 22:00, all 7 majors)", "names": ["Real dollar", "Wrong-day dollar (benchmark)"], "unit": "share of pair-days",
                   "note": "Dollar share of the day's move = c²/(c²+e²), c = β × the dollar's day move, e = the rest. Real days pile up at both ends; the benchmark shows what 'no link' looks like.",
                   "rows": [{"label": f"{bins[j]:.1f}-{bins[j + 1]:.1f}", "values": [round(float(hr[j]), 4), round(float(hs_[j]), 4)]} for j in range(10)]})
    # 8. persistence
    pe = R["persistence"]
    charts.append({"type": "groups", "title": "Is today's dollar share known at the open?", "names": ["vs yesterday's", "vs last 20 sessions' mean", "Shuffled days (benchmark)"], "unit": "correlation of daily 5-min dollar share",
                   "note": "If the split is persistent, the morning knows which kind of day it is likely to be.",
                   "rows": [{"label": s, "values": [pe[s]["lag1"], pe[s]["trail20"], pe[s]["shuffled"]]} for s in MAJ]})
    # 9. own-move autocorrelation
    au = R["auto"]
    order = [("own_adjacent", "Own, next block"), ("own_skip1", "Own, skip 1 min"), ("own_bid_only", "Own, bid quotes only"), ("raw_pair", "Raw pair (no split)"),
             ("dollar_factor", "Dollar factor"), ("wrong_day_resid", "Own vs wrong-day dollar"), ("catch_up", "Dollar now → own next"), ("shuffled_null", "Shuffled (null)")]
    for h in ("5",):
        charts.append({"type": "bars", "title": f"What follows a move, {h}-minute blocks: slope of next block on this block", "unit": "slope (≈ autocorrelation)", "ref": 0,
                       "note": "Negative = reverses, positive = continues. 'Skip 1 min' and 'bid only' are the quote-bounce checks; 'shuffled' pairs a block with a block from another session (the null). 'Dollar now → own next' > 0 means the pair lags the dollar (stale quotes).",
                       "rows": [{"label": lab, "value": au[h][k][0], "lo": au[h][k][1], "hi": au[h][k][2]} for k, lab in order]})
    charts.append({"type": "groups", "title": "Own-move reversal by pair (adjacent blocks)", "names": ["5 min", "15 min", "60 min"], "unit": "slope of next own move on this own move",
                   "note": "Benchmark: a block paired with the same clock time on a random other session. That null is about 0 at 5 and 15 minutes (interval ±0.003) but +0.007 [+0.002, +0.013] at 60 minutes, a time-of-day pattern; read 60-minute values against it, not against 0.",
                   "rows": [{"label": s, "values": [au[h]["own_adjacent_by_pair"][s] for h in ("5", "15", "60")]} for s in MAJ]})
    ec = R["econ"]
    charts.append({"type": "bars", "title": "In money: the pair's next block after a big own move (fade) or a big dollar move (follow), vs the spread", "unit": "daily σ", "ref": 0,
                   "note": "Big = top 10% of moves. Fade = the pair's next-block return signed against the own move; follow = signed with the dollar. Unhedged, gross. Compare with the median round-trip spread, the bar any idea must clear.",
                   "rows": sum([[{"label": f"{h} min: fade after own", "value": ec[h]["fade_after_own"][0], "lo": ec[h]["fade_after_own"][1], "hi": ec[h]["fade_after_own"][2]},
                                 {"label": f"{h} min: follow after dollar", "value": ec[h]["follow_after_dollar"][0], "lo": ec[h]["follow_after_dollar"][1], "hi": ec[h]["follow_after_dollar"][2]},
                                 {"label": f"{h} min: spread", "value": ec[h]["spread_sigma"]}] for h in ("5", "15", "60")], [])})
    # 10. gold and indices
    gi = R["gold_idx"]
    charts.append({"type": "groups", "title": "Gold and indices vs the dollar factor", "names": ["5-min share", "60-min share"], "unit": "share of variance (point-in-time β)",
                   "note": "Dollar = all 7 majors. Benchmark: 0. The sign of the median β is in the label (gold falls when the dollar rises → negative β).",
                   "rows": [{"label": f"{s} (β {gi[f'{s}|5']['beta']:+.2f})", "values": [gi[f"{s}|5"]["pit"][0], gi[f"{s}|60"]["pit"][0]]} for s in ("GOLD", "NQ", "SPX500")]})
    # 11. examples
    big = DR[DR.move.abs() >= 1.0]
    rng = np.random.default_rng(SEED)
    dl = big[(big.dshare >= 0.9) & (big.inst == "EURUSD")]
    ol = big[(big.dshare <= 0.05) & (big.inst == "GBPUSD")]
    jl = big[(big.dshare <= 0.05) & (big.inst == "USDJPY")]
    for sub, title, note in ((dl, "Example: a dollar day in EURUSD", "Picked by seed among EURUSD days that moved ≥1σ with ≥90% dollar share."),
                             (ol, "Example: a sterling day in GBPUSD", "Picked by seed among GBPUSD days that moved ≥1σ with ≤5% dollar share."),
                             (jl, "Example: a yen day in USDJPY", "Picked by seed among USDJPY days that moved ≥1σ with ≤5% dollar share.")):
        if len(sub):
            r = sub.iloc[int(rng.integers(len(sub)))]
            charts.append(example_day(DR, days, L, r.inst, r.date, f"{title}: {r.date}", note))
    top_o = big[big.dshare <= 0.2].assign(a=lambda d: d.move.abs()).nlargest(6, "a")
    top_d = big[big.dshare >= 0.8].assign(a=lambda d: d.move.abs()).nlargest(6, "a")
    charts.append({"type": "bars", "title": "The biggest own-led and dollar-led days, 2016-2022", "unit": "dollar share of the day's move", "ref": 0.5,
                   "note": "Largest moves (in daily σ, open to 22:00 London) with dollar share ≤ 20% (top six) or ≥ 80% (bottom six). Read the dates against the news: own-led days are usually that currency's own event.",
                   "rows": [{"label": f"{r.inst} {r.date} ({r.move:+.1f}σ)", "value": round(float(r.dshare), 3)} for r in pd.concat([top_o, top_d]).itertuples()]})
    # 12. stop width
    sw = R["stop_width"]
    charts.append({"type": "groups", "title": "Own σ as a fraction of total σ, by how loud the day was", "names": ["Quiet third", "Normal third", "Loud third"], "unit": "own σ ÷ total σ (1 = plain σ)",
                   "note": "√(1 − dollar share), 5-minute bars, terciles of the day's realised vol. Benchmark 1.0 = the plain σ a stop uses today. Below 1: part of the risk is the dollar's, which a dollar-hedged position would not carry.",
                   "rows": [{"label": s, "values": [sw[s].get("quiet"), sw[s].get("normal"), sw[s].get("loud")]} for s in MAJ]})
    out = {"id": "features-look", "window": [START, END], "sessions": R["sessions"], "intro": INTRO, "charts": charts}
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "features-look.json").write_text(json.dumps(out, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    print("charts", len(charts))


if __name__ == "__main__":
    if "--look-only" not in sys.argv:
        main()
    look()
