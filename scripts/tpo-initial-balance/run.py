"""tpo-initial-balance runner. Prereg: forge/TPO_INITIAL_BALANCE_PREREG.md.

  python scripts/tpo-initial-balance/run.py count --data <dir with {SYM}_1m_unadj.parquet>   # n and MDEs, no event outcomes
  python scripts/tpo-initial-balance/run.py score --data <dir> [--tick <NQ_09-26_tick.csv>]  # everything; writes results.json

Outputs: analysis/output/tpo-initial-balance/ (events_<SYM>.parquet gitignored-size, results.json, count.json).
"""
import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, str(Path(__file__).parent))
import tpo_ib as T  # noqa: E402
import events  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "analysis/output/tpo-initial-balance"
Z = lambda a: norm.ppf(1 - a / 2) + norm.ppf(0.8)


def load(data, sym):
    return T.load_sessions(Path(data) / f"{sym}_1m_unadj.parquet", sym)


# ── count pass ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def count(a):
    out = {}
    for sym in ("NQ", "ES"):
        s = load(a.data, sym)
        df = events.build(s, outcomes=False)
        r = dict(sessions=len(df), dropped_short=s.dropped, filled_minutes=s.filled, counts=df.kind.value_counts().to_dict())
        for kind, lab in (("acc", "follow"), ("poke", "fade")):
            sub = df[df.kind == kind]
            ypl = np.concatenate([np.array(x) for x in sub.y_pl_each])
            sd_y = float(np.std(ypl))
            sd_d = sd_y * math.sqrt(4 / 3)
            nx = int(sub.x_flow.notna().sum())
            rpl = [np.array(x) for x in sub.get("R_pl_each", pd.Series(dtype=object)).dropna()]
            rpl = np.concatenate(rpl) if rpl else np.array([])
            sd_r = float(np.std(rpl)) if len(rpl) else float("nan")
            n_tr = int(sub.get("R_pl_each", pd.Series(dtype=object)).notna().sum())
            r[lab] = dict(n=len(sub), sd_y_placebo=round(sd_y, 3), mde_d=round(Z(0.05 / 8) * sd_d * math.sqrt(1 / len(sub)), 3),
                          n_flow=nx, mde_slope=round(Z(0.05 / 8) * sd_d / math.sqrt(max(nx, 1)), 3),
                          n_trades=n_tr, sd_R_placebo=round(sd_r, 3),
                          mde_dR=round(Z(0.05 / 8) * sd_r * math.sqrt(4 / 3) / math.sqrt(max(n_tr, 1)), 3))
        out[sym] = r
        print(sym, json.dumps(r), flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "count.json").write_text(json.dumps(out, indent=1))


# ── score ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def arr(df, n, col, mask):
    x = np.full(n, np.nan)
    sub = df[mask & df[col].notna()]
    x[sub.i.to_numpy() - df.i.min()] = sub[col].to_numpy(float)
    return x


def mean_cell(rng, x, days, B=2000):
    est = np.nanmean(x)
    bs = T.boot(rng, len(x), lambda idx: np.nanmean(x[idx]), B=B)
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    isx = np.nanmean(x[days <= T.IS_END]); oos = np.nanmean(x[days > T.IS_END])
    return dict(n=int(np.isfinite(x).sum()), est=float(est), lo=float(lo), hi=float(hi), p=T.p_from_ci(est, lo, hi), IS=float(isx), OOS=float(oos))


def slope_cell(rng, x, y, days, B=2000):
    xs = (x - np.nanmean(x)) / np.nanstd(x)
    est = T.ols_slope(xs, y)
    bs = T.boot(rng, len(x), lambda idx: T.ols_slope(xs[idx], y[idx]), B=B)
    lo, hi = np.nanpercentile(bs, [2.5, 97.5])
    m = days <= T.IS_END
    return dict(n=int((np.isfinite(xs) & np.isfinite(y)).sum()), est=float(est), lo=float(lo), hi=float(hi), p=T.p_from_ci(est, lo, hi),
                IS=float(T.ols_slope(xs[m], y[m])), OOS=float(T.ols_slope(xs[~m], y[~m])))


def corr_cell(rng, x, y, B=1000):
    ok = np.isfinite(x) & np.isfinite(y)
    est = float(np.corrcoef(x[ok], y[ok])[0, 1])
    return dict(n=int(ok.sum()), est=est)


def score(a):
    res = dict(seed=T.SEED, window=[T.START, T.END], is_end=T.IS_END, instruments={}, primary=[], secondary=[], descriptive={})
    ev_all = {}
    for sym in ("NQ", "ES", "YM", "RTY"):
        p = Path(a.data) / f"{sym}_1m_unadj.parquet"
        if not p.exists():
            continue
        s = load(a.data, sym)
        df = events.build(s, outcomes=True)
        df["sym"] = sym
        ev_all[sym] = (s, df)
        df.drop(columns=[c for c in ("y_pl_each", "R_pl_each") if c in df], errors="ignore").to_parquet(OUT / f"events_{sym}.parquet")
        res["instruments"][sym] = dict(sessions=len(df), dropped_short=s.dropped, filled_minutes=s.filled, counts=df.kind.value_counts().to_dict())
        print(sym, res["instruments"][sym], flush=True)

    rng = np.random.default_rng(T.SEED)
    # primary family (8): Q1, Q2 means of d; Q3 dR, NQ and ES
    for sym in ("NQ", "ES"):
        s, df = ev_all[sym]
        n = len(df); days = df.day.to_numpy()
        for kind, q, lab in (("acc", "Q1", "follow"), ("poke", "Q2", "fade")):
            c = mean_cell(rng, arr(df, n, "d", df.kind == kind), days)
            res["primary"].append(dict(cell=f"{q} {sym} {lab}", q=q, sym=sym, kind=kind, stat="d", bar=0.15, **c))
        for kind, lab in (("acc", "follow"), ("poke", "fade")):
            c = mean_cell(rng, arr(df, n, "dR", df.kind == kind), days)
            net = mean_cell(rng, arr(df, n, "R", df.kind == kind), days)
            gross = mean_cell(rng, arr(df, n, "gR", df.kind == kind), days)
            res["primary"].append(dict(cell=f"Q3 {sym} {lab}", q="Q3", sym=sym, kind=kind, stat="dR", bar=0.05, net=net, gross=gross, **c))
    hp = T.holm([c["p"] for c in res["primary"]])
    for c, h in zip(res["primary"], hp):
        c["holm"] = float(h)
        if c["q"] in ("Q1", "Q2"):
            c["pass"] = bool(h < 0.05 and c["est"] >= c["bar"] and c["IS"] > 0 and c["OOS"] > 0)
            c["statistical"] = bool(c["lo"] > 0 and c["IS"] > 0 and c["OOS"] > 0)
        else:
            c["pass"] = bool(h < 0.05 and c["est"] >= 0.05 and c["net"]["est"] >= 0.05 and c["IS"] > 0 and c["OOS"] > 0)
            c["statistical"] = bool(c["lo"] > 0)

    # secondary family (8): flow and candle slopes (A1)
    for sym in ("NQ", "ES"):
        s, df = ev_all[sym]
        n = len(df); days = df.day.to_numpy()
        for kind, lab in (("acc", "follow"), ("poke", "fade")):
            y = arr(df, n, "d", df.kind == kind)
            for xcol, q in (("x_flow", "Q4"), ("x_candle", "Q5")):
                c = slope_cell(rng, arr(df, n, xcol, df.kind == kind), y, days)
                res["secondary"].append(dict(cell=f"{q} {sym} {lab}", q=q, sym=sym, kind=kind, x=xcol, bar=0.15, **c))
    hs = T.holm([c["p"] for c in res["secondary"]])
    for c, h in zip(res["secondary"], hs):
        c["holm"] = float(h)
        c["pass"] = bool(h < 0.05 and c["est"] >= c["bar"] and c["IS"] > 0 and c["OOS"] > 0)
        c["statistical"] = bool(c["lo"] > 0 and c["IS"] > 0 and c["OOS"] > 0)

    res["descriptive"] = descriptive(ev_all, rng, a)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    print("written", OUT / "results.json")


def descriptive(ev_all, rng, a):
    D = {}
    # replication on YM, RTY
    for sym in ("YM", "RTY"):
        if sym in ev_all:
            s, df = ev_all[sym]; n = len(df); days = df.day.to_numpy()
            D[f"replication_{sym}"] = {lab: mean_cell(rng, arr(df, n, "d", df.kind == kind), days, B=1000)
                                       for kind, lab in (("acc", "follow"), ("poke", "fade"))}
    comps = []
    for sym in ("NQ", "ES"):
        s, df = ev_all[sym]; n = len(df); days = df.day.to_numpy()
        delta = T.bvc_delta(s)
        idx = df.i.to_numpy()
        # components (owner's rule 2026-10-27): gross R vs placebo, reach vs placebo, d by volume tercile
        for kind, lab in (("acc", "follow"), ("poke", "fade")):
            m = df.kind == kind
            g = arr(df, n, "gR", m) - arr(df, n, "gR_pl", m)
            comps.append(dict(sym=sym, kind=lab, comp="gross R minus placebo", **mean_cell(rng, g, days, B=1000)))
            rc = arr(df, n, "reach", m) - arr(df, n, "reach_pl", m)
            comps.append(dict(sym=sym, kind=lab, comp="reach minus placebo", **mean_cell(rng, rc, days, B=1000),
                              share=float(np.nanmean(arr(df, n, "reach", m))), share_pl=float(np.nanmean(arr(df, n, "reach_pl", m)))))
            sub = df[m & df.vol_ratio.notna()]
            if len(sub) > 30:
                q = pd.qcut(sub.vol_ratio, 3, labels=["low", "mid", "high"])
                D.setdefault("d_by_volume_tercile", {})[f"{sym} {lab}"] = {k: dict(n=int((q == k).sum()), d=float(sub.d[q == k].mean())) for k in ("low", "mid", "high")}
        # day types, TPO vs volume profile, CVD agreement
        rows = []
        for i in idx:
            pr = T.profiles(s, i, T.TICK[sym])
            ibh, ibl = s.H[i, :60].max(), s.L[i, :60].min(); w = ibh - ibl
            cvd = float(np.nansum(delta[i]))
            up, dn = s.H[i].max() > ibh, s.L[i].min() < ibl
            tp, vp = pr["tpo"], pr["vol"]
            inter = max(0.0, min(tp[2], vp[2]) - max(tp[1], vp[1])); union = max(tp[2], vp[2]) - min(tp[1], vp[1])
            rows.append(dict(i=i, day=s.days[i], type=T.day_type(s, i), w=w, cvd=cvd, up=up, dn=dn,
                             poc_gap=abs(tp[0] - vp[0]) / w if w > 0 else np.nan, va_overlap=inter / union if union > 0 else np.nan,
                             close_vs_tpo_poc=abs(s.C[i, -1] - tp[0]) / w if w > 0 else np.nan))
        P = pd.DataFrame(rows)
        P.to_parquet(OUT / f"profiles_{sym}.parquet")
        one = P[P.up ^ P.dn]
        agree = ((one.cvd > 0) == one.up).astype(float).to_numpy()
        bs = [np.mean(agree[T.block_indices(rng, len(agree))]) for _ in range(1000)]
        D[f"D3_cvd_agrees_with_extension_{sym}"] = dict(n=len(agree), share=float(agree.mean()), lo=float(np.percentile(bs, 2.5)), hi=float(np.percentile(bs, 97.5)))
        D[f"D2_profiles_{sym}"] = dict(poc_gap_median_ibw=float(P.poc_gap.median()), poc_gap_mean_ibw=float(P.poc_gap.mean()),
                                        va_overlap_mean=float(P.va_overlap.mean()), same_poc_share=float((P.poc_gap == 0).mean()))
        D[f"D4_day_types_{sym}"] = {t: dict(n=int(len(g)), share=float(len(g) / len(P)), cvd_up_share=float((g.cvd > 0).mean()),
                                            close_vs_tpo_poc_ibw=float(g.close_vs_tpo_poc.median()))
                                    for t, g in P.groupby("type")}
        # D1: per period C..M, range extension vs flow ratio
        ext, flo = [], []
        for i in idx:
            ibh, ibl = s.H[i, :60].max(), s.L[i, :60].min(); w = ibh - ibl
            if w <= 0:
                continue
            for p in range(2, 13):
                a0, b0 = p * T.PER, p * T.PER + T.PER
                ph, pl = s.H[i, :a0].max(), s.L[i, :a0].min()
                e_ = (max(0.0, s.H[i, a0:b0].max() - ph) - max(0.0, pl - s.L[i, a0:b0].min())) / w
                ext.append(e_); flo.append(T.flow_ratio(delta, s.V, i, a0, b0))
        ext, flo = np.array(ext), np.array(flo)
        nz = ext != 0
        D[f"D1_extension_vs_flow_{sym}"] = dict(all_periods=corr_cell(rng, ext, flo), extending_periods_only=corr_cell(rng, ext[nz], flo[nz]),
                                                 sign_agree_when_extending=float(np.mean(np.sign(ext[nz]) == np.sign(flo[nz]))))
        # D5: candle close location -> next period direction
        nxt_up, hi_c, lo_c = [], [], []
        for i in idx:
            for p in range(0, 12):
                o, h, l, c = T.period_ohlc(s, i, p)
                cn = s.C[i, (p + 2) * T.PER - 1]
                v = T.clv(o, h, l, c, 1)
                nxt_up.append(cn > c); hi_c.append(v >= 0.8); lo_c.append(v <= 0.2)
        nxt_up, hi_c, lo_c = map(np.array, (nxt_up, hi_c, lo_c))
        D[f"D5_candle_close_next_period_{sym}"] = dict(base_up=float(nxt_up.mean()), after_strong_close_up=float(nxt_up[hi_c].mean()), n_strong=int(hi_c.sum()),
                                                        after_weak_close_down=float((~nxt_up[lo_c]).mean()), n_weak=int(lo_c.sum()), base_down=float((~nxt_up).mean()))
    ps = [c["p"] for c in comps]
    for c, q in zip(comps, T.bh(ps)):
        c["bh_q"] = float(q)
        c["candidate"] = bool(q < 0.10 and c["IS"] > 0 and c["OOS"] > 0)
    D["components"] = comps
    if a.tick:
        D["tick_arm_NQ"] = tick_arm(ev_all["NQ"], a)
    return D


def tick_arm(sd, a):
    """Real order flow (tick rule) on NQ sessions where NQ 09-26 was the front contract, before the lockbox. Descriptive."""
    s, df = sd
    cont = pd.read_parquet(Path(a.data) / "NQ_1m_unadj.parquet", columns=["timestamp", "contract"])
    t = (cont.timestamp - pd.Timedelta(minutes=1)).dt.tz_convert("America/New_York")
    front = set(t[cont.contract == "NQ_09-26"].dt.strftime("%Y-%m-%d"))
    k = pd.read_csv(a.tick)
    k["ts"] = pd.to_datetime(k.timestamp, utc=True).dt.tz_convert("America/New_York")
    k["day"] = k.ts.dt.strftime("%Y-%m-%d"); k["m"] = k.ts.dt.hour * 60 + k.ts.dt.minute - 570
    k = k[(k.m >= 0) & (k.m < T.N_MIN) & k.day.isin(front) & (k.day <= T.END)]
    pr = k.price.to_numpy()
    sgn = np.sign(np.diff(pr, prepend=pr[0]))
    sgn = pd.Series(sgn).replace(0, np.nan).ffill().fillna(0).to_numpy()
    k["sd"] = sgn * k.volume
    per = k.assign(p=k.m // T.PER).groupby(["day", "p"]).agg(sd=("sd", "sum"), v=("volume", "sum"))
    per["ratio"] = per.sd / per.v
    delta = T.bvc_delta(s)
    dayidx = {d: i for i, d in enumerate(s.days)}
    prox, tick = [], []
    for (day, p), r in per.iterrows():
        i = dayidx.get(day)
        if i is None or p < 0 or p > 12:
            continue
        prox.append(T.flow_ratio(delta, s.V, i, p * T.PER, p * T.PER + T.PER)); tick.append(r.ratio)
    prox, tick = np.array(prox), np.array(tick)
    ok = np.isfinite(prox) & np.isfinite(tick)
    out = dict(sessions=int(per.index.get_level_values(0).nunique()), periods=int(ok.sum()),
               proxy_vs_tick_corr=float(np.corrcoef(prox[ok], tick[ok])[0, 1]) if ok.sum() > 10 else None)
    # Q4 re-run with tick-rule flow (raw ratio over the event window, signed as in A1)
    rows = []
    for _, r in df[df.kind.isin(["acc", "poke"]) & df.day.isin(per.index.get_level_values(0))].iterrows():
        ps = [r.p - 1, r.p] if r.kind == "acc" else [r.p]
        sel = per.loc[[(r.day, q) for q in ps if (r.day, q) in per.index]]
        if sel.empty or sel.v.sum() == 0:
            continue
        rows.append(dict(kind=r.kind, d=r.d, x=sel.sd.sum() / sel.v.sum() * r.dir))
    E = pd.DataFrame(rows)
    for kind, lab in (("acc", "follow"), ("poke", "fade")):
        sub = E[E.kind == kind] if len(E) else E
        if len(sub) >= 10:
            xs = (sub.x - sub.x.mean()) / sub.x.std()
            out[f"Q4_tick_{lab}"] = dict(n=len(sub), slope=float(T.ols_slope(xs.to_numpy(), sub.d.to_numpy())))
        else:
            out[f"Q4_tick_{lab}"] = dict(n=len(sub))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["count", "score"])
    ap.add_argument("--data", required=True)
    ap.add_argument("--tick")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    (count if a.mode == "count" else score)(a)


if __name__ == "__main__":
    main()
