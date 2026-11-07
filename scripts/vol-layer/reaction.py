"""vol-layer-reaction (forge/VOL_LAYER_REACTION_PREREG.md): does the shared vol state say when price reacts at the lines?

Stages:
  features  build the new point-in-time features per encounter from the Step 0 table and M1. Writes features.parquet.
  analyse   the scored ablations, trades net of spread, neighbours, shuffles and quintile tables. Writes results.

    python scripts/vol-layer/reaction.py --stage features
    python scripts/vol-layer/reaction.py --stage analyse
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import line_reaction as LR  # noqa: E402
from forge import vol_state_hist as S  # noqa: E402

OUT = ROOT / "analysis/output/vol-layer-reaction"
EV = ROOT / "analysis/output/line_reaction/events_chosen"
HIST = ROOT / "analysis/output/forecast_history"
M1 = ROOT / "VolRangeForecaster/data/m1"
SEED = 20261107
N_SLOT = 264
FAM = {
    "A_state": ["dsig", "sig_rel_har", "p_hi", "p_res", "err_ewm", "err_abs"],
    "B_jumps": ["js20", "lam_un", "lam_sch"],
    "C_feedback": ["rv_so_far", "jump_today", "err_today"],
    "D_corr": ["common60", "resid60", "cvar60"],
}
NEW = [f for v in FAM.values() for f in v]
EV_COLS = ["inst", "date", "fold", "klass", "side", "rung", "offset", "minute", "outcome", "x_h", "back60", "beyond60"] + LR.FEATS
CCY = ("USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF")


def is_fx(sym):
    return len(sym) == 6 and sym[:3] in CCY and sym[3:] in CCY


def session_state(sym):
    """Pre-open fields per session, oldest first, indexed by date."""
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "pit_hl_p50", "r_hl", "rv5", "bv5", "jump_share", "max_r5", "event", "live_sig_used"])
    d = d.sort_values("date").reset_index(drop=True)
    lrv = np.log(d.rv5.where(d.rv5 > 0)).to_numpy()
    har = S.har_state(lrv)
    out = pd.DataFrame({"date": d.date, "dsig": har["dsig"], "sig_rel_har": har["sig_rel"]})
    out["p_hi"] = S.hmm_filtered(lrv, by="mean")
    out["p_res"] = S.hmm_filtered(har["res"], by="var")
    err = np.log((d.r_hl / d.pit_hl_p50).where(lambda s: s > 0)).to_numpy()
    out["err_ewm"] = S.ewma_before(err, 10)
    out["err_abs"] = S.ewma_before(np.abs(err), 10)
    out["js20"] = d.jump_share.rolling(20, min_periods=10).mean().shift(1).to_numpy()
    jump = (d.max_r5.abs() > 5 * np.sqrt(d.bv5 / N_SLOT)).astype(float).to_numpy()
    un = np.where(d.event == "none", jump, 0.0)
    sch = np.where(d.event.isin(["FOMC", "NFP", "CPI", "high"]), jump, 0.0)
    un[d.event.isin(["unknown"]).to_numpy()] = np.nan
    sch[d.event.isin(["unknown"]).to_numpy()] = np.nan
    out["lam_un"] = S.ewma_before(un, 20)
    out["lam_sch"] = S.ewma_before(sch, 20)
    return out, d


def slot_panel(sym, dates):
    """(C close, H, L) matrices sessions x 264 from M1, in the table's session order. NaN = empty slot."""
    key = LR.M1_KEY.get(sym, sym.lower())
    df = pd.read_parquet(M1 / f"{key}_m1.parquet", columns=None)
    ts = "datetime" if "datetime" in df.columns else ("time" if "time" in df.columns else None)
    idx = pd.to_datetime(df[ts], utc=True) if ts else pd.to_datetime(df.index, utc=True)
    loc = pd.DatetimeIndex(idx).tz_convert("Europe/London")
    mins = (loc.hour * 60 + loc.minute).to_numpy()
    pos = pd.Series(np.arange(len(dates)), index=dates)
    di = pos.reindex(loc.strftime("%Y-%m-%d")).to_numpy()
    keep = (mins < 22 * 60) & np.isfinite(di)
    di = di[keep].astype(int)
    sl = mins[keep] // 5
    c, h, l = df["close"].to_numpy(float)[keep], df["high"].to_numpy(float)[keep], df["low"].to_numpy(float)[keep]
    order = np.argsort(idx.to_numpy()[keep], kind="stable")
    C = np.full((len(dates), N_SLOT), np.nan)
    C[di[order], sl[order]] = c[order]
    H = np.full_like(C, -np.inf)
    L = np.full_like(C, np.inf)
    np.maximum.at(H, (di, sl), h)
    np.minimum.at(L, (di, sl), l)
    H[~np.isfinite(H)] = np.nan
    L[~np.isfinite(L)] = np.nan
    return C, H, L


def feedback_grids(C, H, L, d):
    """Sessions x slots grids. Index [i, s] = value using slots <= s of session i, plus earlier sessions' medians."""
    r = np.full_like(C, np.nan)
    r[:, 1:] = np.log(C[:, 1:] / C[:, :-1])                  # NaN across a hole: dropped, never zero-filled
    cum = np.nancumsum(r ** 2, axis=1)
    tot = cum[:, -1]
    with np.errstate(divide="ignore", invalid="ignore"):
        frac = cum / np.where(tot > 0, tot, np.nan)[:, None]
    share = pd.DataFrame(frac).rolling(250, min_periods=120).median().shift(1).to_numpy()
    sig2 = (d.live_sig_used.to_numpy() / 100) ** 2
    with np.errstate(divide="ignore", invalid="ignore"):
        lvl = np.log(np.where(tot > 0, tot, np.nan) / sig2)
        base = pd.Series(lvl).rolling(250, min_periods=120).median().shift(1).to_numpy()
        rv_so_far = np.log(np.where(cum > 0, cum, np.nan) / sig2[:, None] / share) - base[:, None]
    a = np.abs(r)
    prod = a[:, 1:] * a[:, :-1]
    bvc = np.zeros_like(C)
    cnt = np.zeros_like(C)
    bvc[:, 1:] = np.nancumsum(prod, axis=1)
    cnt[:, 1:] = np.cumsum(np.isfinite(prod), axis=1)
    mx = np.fmax.accumulate(a, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        jt = mx / np.sqrt((np.pi / 2) * bvc / np.where(cnt > 0, cnt, np.nan))
    hi = np.fmax.accumulate(H, axis=1)
    lo = np.fmin.accumulate(L, axis=1)
    return {"rv_so_far": rv_so_far, "jump_today": jt, "hi": hi, "lo": lo}


USD_PAIRS = ("EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF")


def usd_leg(sym, table):
    """The dollar's move against currencies OTHER than this pair's, signed as this pair's return. Those pairs don't hold
    this pair's other leg, so there is no triangular identity: EURUSD's common part comes from USD vs JPY, GBP, AUD, NZD,
    CAD and CHF, and what is left is the euro's own story."""
    me = 1.0 if sym[:3] == "USD" else -1.0                   # + = pair rises when USD rises
    parts_ = []
    for o, T in table.items():
        if o != sym and o in USD_PAIRS:
            parts_.append(T if o[:3] == "USD" else -T)
    return me * np.nanmean(np.stack(parts_), axis=0)


def usd_leg_features(sym, E, s, sg, gpos, ret60, dret):
    n = len(E)
    if sym not in USD_PAIRS:
        return {c: np.full(n, np.nan) for c in FAM["D_corr"]}
    sign = np.where(E.side == "up", 1.0, -1.0)
    gi = gpos[E.date].to_numpy()
    common = sign * usd_leg(sym, ret60)[gi, s] / sg
    own, c = dret[sym], usd_leg(sym, dret)
    v_own = pd.Series(own).rolling(60, min_periods=40).var().shift(1).to_numpy()
    v_err = pd.Series(own - c).rolling(60, min_periods=40).var().shift(1).to_numpy()
    return {"common60": common, "resid60": E.spd60.to_numpy() - common, "cvar60": (1 - v_err / v_own)[gi]}


def stage_d_only():
    """Rebuild family D in features.parquet (amendment A2) without redoing the HMM fits."""
    X = pd.read_parquet(OUT / "features.parquet")
    lines = pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["inst", "date", "open", "sig"])
    syms = sorted(p.stem for p in EV.glob("*.parquet"))
    all_dates = sorted({x for s in syms for x in pd.read_csv(HIST / f"{s}.csv", usecols=["date"]).date})
    gpos = pd.Series(np.arange(len(all_dates)), index=all_dates)
    ret60, dret = {}, {}
    for sym in USD_PAIRS:
        d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date"]).sort_values("date")
        C, _, _ = slot_panel(sym, d.date.tolist())
        G = np.full((len(all_dates), N_SLOT), np.nan)
        G[gpos[d.date].to_numpy()] = C
        ret60[sym], dret[sym] = _returns(G)
    for c in FAM["D_corr"]:
        X[c] = np.nan
    for sym in USD_PAIRS:
        E = pd.read_parquet(EV / f"{sym}.parquet", columns=["inst", "date", "side", "rung", "offset", "minute", "spd60"])
        E = E[(E.offset == 0) | (E.offset.abs() >= 0.2 - 1e-9)].copy()
        s = np.clip((E.minute.to_numpy() // 5) - 1, 0, N_SLOT - 1)
        L0 = lines[lines.inst == sym].set_index("date")
        sg = L0.sig.reindex(E.date).to_numpy() / 100
        D = usd_leg_features(sym, E, s, sg, gpos, ret60, dret)
        F = pd.DataFrame({"inst": E.inst.to_numpy(), "date": E.date.to_numpy(), "side": E.side.to_numpy(), "rung": E.rung.to_numpy(), "offset": E.offset.to_numpy(), **D})
        K_ = ["inst", "date", "side", "rung", "offset"]
        idx = X.reset_index().merge(F[K_], on=K_, validate="one_to_one")["index"].to_numpy()
        F2 = X.loc[idx, K_].merge(F, on=K_, validate="one_to_one")
        for c in FAM["D_corr"]:
            X.loc[idx, c] = F2[c].to_numpy()
    X.to_parquet(OUT / "features.parquet", index=False)
    print(X[FAM["D_corr"]].describe().T[["count", "mean", "std", "min", "max"]].round(3).to_string())
    print(X.groupby("inst")["cvar60"].mean().dropna().round(3).to_string())


def _returns(G):
    F = pd.DataFrame(G).ffill(axis=1).to_numpy()             # within the session, for the common-move read only
    R = np.full_like(F, np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        R[:, 12:] = np.log(F[:, 12:] / F[:, :-12])
        R[:, :12] = np.log(F[:, :12] / F[:, [0]])
        last = F[:, -1]
        return R, np.log(last / pd.Series(last).shift(1).to_numpy())


def stage_features():
    OUT.mkdir(parents=True, exist_ok=True)
    syms = sorted(p.stem for p in EV.glob("*.parquet"))
    lines = pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["inst", "date", "open", "sig"])
    fx = [s for s in syms if is_fx(s)]
    all_dates = sorted({x for s in syms for x in pd.read_csv(HIST / f"{s}.csv", usecols=["date"]).date})
    gpos = pd.Series(np.arange(len(all_dates)), index=all_dates)
    closes, parts, pre = {}, [], {}
    for sym in syms:
        st, d = session_state(sym)
        C, H, L = slot_panel(sym, d.date.tolist())
        g = feedback_grids(C, H, L, d)
        if sym in fx:
            G = np.full((len(all_dates), N_SLOT), np.nan)
            G[gpos[d.date].to_numpy()] = C
            closes[sym] = G
        pre[sym] = (st, d, g)
        print(f"{sym}: state and grids done", flush=True)
    ret60, dret = {}, {}
    for s, G in closes.items():
        ret60[s], dret[s] = _returns(G)

    for sym in syms:
        st, d, g = pre[sym]
        E = pd.read_parquet(EV / f"{sym}.parquet", columns=["inst", "date", "side", "rung", "offset", "minute", "spd60"])
        E = E[(E.offset == 0) | (E.offset.abs() >= 0.2 - 1e-9)].copy()
        pos = pd.Series(np.arange(len(d)), index=d.date)
        i = pos.reindex(E.date).to_numpy().astype(int)
        s = (E.minute.to_numpy() // 5) - 1                    # last slot complete before the touch minute
        s = np.clip(s, 0, N_SLOT - 1)
        out = pd.DataFrame({"inst": E.inst.to_numpy(), "date": E.date.to_numpy(), "side": E.side.to_numpy(), "rung": E.rung.to_numpy(), "offset": E.offset.to_numpy()})
        for c in FAM["A_state"] + FAM["B_jumps"]:
            out[c] = st[c].to_numpy()[i]
        out["rv_so_far"] = g["rv_so_far"][i, s]
        out["jump_today"] = g["jump_today"][i, s]
        L0 = lines[lines.inst == sym].set_index("date")
        op = L0.open.reindex(E.date).to_numpy()
        sg = L0.sig.reindex(E.date).to_numpy() / 100
        rng_pct = (g["hi"][i, s] - g["lo"][i, s]) / op * 100
        out["err_today"] = rng_pct / d.pit_hl_p50.to_numpy()[i]
        D = usd_leg_features(sym, E, s, sg, gpos, ret60, dret)
        for c in FAM["D_corr"]:
            out[c] = D[c]
        parts.append(out)
        print(f"{sym}: {len(out):,} encounters", flush=True)
    X = pd.concat(parts, ignore_index=True)
    X.to_parquet(OUT / "features.parquet", index=False)
    print(X[NEW].describe().T[["count", "mean", "std", "min", "max"]].round(3).to_string())


# ── analyse ──────────────────────────────────────────────────────────────────────

def cost_sigma():
    """Round-trip spread as a fraction of price per instrument, per the prereg."""
    from pylego.costs import default_spread
    sp = pd.read_parquet(ROOT / "features/spread_profile.parquet")
    sp = sp[sp.hour.astype(int).between(10, 19)].groupby("pair")["mean"].median()
    out = {}
    for sym in sorted(p.stem for p in EV.glob("*.parquet")):
        key = LR.M1_KEY.get(sym, sym.lower())
        pip = 0.01 if sym.endswith("JPY") else (1.0 if not is_fx(sym) else 1e-4)
        try:
            pips = float(sp.loc[key]) if key in sp.index else float(default_spread(key))
        except Exception:                                     # noqa: BLE001 unknown to the registry
            pips = 2.0
        out[sym] = pips * pip
    return out


def load():
    E = pd.concat([pd.read_parquet(p, columns=EV_COLS) for p in sorted(EV.glob("*.parquet"))], ignore_index=True)
    E = E[(E.offset == 0) | (E.offset.abs() >= 0.2 - 1e-9)]
    X = pd.read_parquet(OUT / "features.parquet")
    X[NEW] = X[NEW].replace([np.inf, -np.inf], np.nan)         # a zero clock share or zero bipower early in the day (A2)
    E = E.merge(X, on=["inst", "date", "side", "rung", "offset"], how="left", validate="one_to_one")
    L = pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["inst", "date", "open", "sig"])
    E = E.merge(L, on=["inst", "date"], how="left")
    c = cost_sigma()
    E["cost_K"] = E.inst.map(c).to_numpy() / (E.open.to_numpy() * E.sig.to_numpy() / 100 * LR.K)
    E["y"] = (E.outcome == "reject").astype(int)
    E["resolved"] = E.outcome.isin(["reject", "break"])
    E["pnl"] = LR._pnl(E)
    return E


def gbm():
    from sklearn.ensemble import HistGradientBoostingClassifier
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=200, random_state=0)


def fit_arms(R, all_dates, arms, label, logit=()):
    """Walk-forward. arms = {name: feature list}. Returns the test frame with p_<name>, thr_hi_<name>, thr_lo_<name>."""
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    out = []
    for f in sorted(R.fold.unique())[1:]:
        te = R[R.fold == f].copy()
        prior = all_dates[all_dates < te.date.min()]
        if len(prior) <= LR.EMBARGO:
            continue
        tr = R[(R.date < prior[-LR.EMBARGO]) & R.resolved]
        if len(tr) < 1000:
            continue
        for name, cols in arms.items():
            Xtr, Xte = LR._xy(tr, te, cols)
            if name == "M0":
                m = LogisticRegression(C=1.0, max_iter=2000).fit(Xtr, tr.y)
            else:
                m = gbm().fit(Xtr, tr.y)
            te[f"p_{name}"] = m.predict_proba(Xte)[:, 1]
            ptr = m.predict_proba(Xtr)[:, 1]
            te[f"hi_{name}"], te[f"lo_{name}"] = np.percentile(ptr, 80), np.percentile(ptr, 20)
        for name in logit:
            Xtr, Xte = LR._xy(tr, te, arms[name])
            lg = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(C=1.0, max_iter=3000)).fit(Xtr, tr.y)
            te[f"pl_{name}"] = lg.predict_proba(Xte)[:, 1]
        print(f"[{label}] fold {f}: train {len(tr):,}, test {len(te):,}", flush=True)
        out.append(te)
    return pd.concat(out, ignore_index=True)


def ll(T, name):
    Rv = T[T.resolved]
    return Rv, LR._logloss(Rv.y.to_numpy(), Rv[name].to_numpy())


def trades(T, sel, sign, bs, net=True):
    d = T[sel]
    if not len(d):
        return {"n": 0}
    x = sign * d.pnl.to_numpy() - (d.cost_K.to_numpy() if net else 0)
    ci = bs.mean(d.date, x)[0]
    by = {int(f): LR._r(float((sign * g.pnl.to_numpy() - (g.cost_K.to_numpy() if net else 0)).mean())) for f, g in d.groupby("fold")}
    daily = pd.Series(x).groupby(d.date.to_numpy()).sum()
    drop = daily.abs().nlargest(max(1, len(daily) // 100)).index
    keep = ~d.date.isin(drop).to_numpy()
    yr = {y: LR._r(float(x[d.date.str[:4].to_numpy() == y].mean())) for y in sorted(d.date.str[:4].unique())}
    return {"n": int(len(d)), "mean_K": ci, "by_fold": by, "positive_folds": int(sum(v > 0 for v in by.values())),
            "ex_top1pct_days": LR._r(float(x[keep].mean())), "by_year": yr, "mean_cost_K": LR._r(float(d.cost_K.mean()))}


def stage_analyse(shuffles=20):
    E = load()
    rng = np.random.default_rng(SEED)
    all_dates = np.sort(pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["date"]).date.unique())
    bs = LR.Boot(E.date)
    line = E[E.offset == 0].copy()
    nb = E[E.offset != 0].copy()
    print(f"line {len(line):,}, neighbours {len(nb):,}; missing new features share:\n{line[NEW].isna().mean().round(3).to_string()}", flush=True)
    M1 = list(LR.FEATS)
    arms = {"M0": [], "M1": M1, "ALL": M1 + NEW, "ALONE": NEW}
    arms.update({k: M1 + v for k, v in FAM.items()})
    T = fit_arms(line, all_dates, arms, "line", logit=("ALL",))
    res = {"encounters_line": int(len(line)), "encounters_neighbours": int(len(nb)), "seed": SEED, "missing": line[NEW].isna().mean().round(4).to_dict()}

    fxmask = T.inst.isin(USD_PAIRS).to_numpy()
    cells = {}
    for fam in FAM:
        sub = T[fxmask] if fam == "D_corr" else T
        Rv, a = ll(sub, f"p_{fam}")
        _, b = ll(sub, "p_M1")
        ci, reps = bs.ratio(Rv.date, a, Rv.date, b)
        cells[fam] = {"ratio_vs_M1": ci, "p": float((reps >= 1).mean())}
    order = sorted(cells, key=lambda k: cells[k]["p"])
    prev = 0.0
    for r_, k in enumerate(order):
        adj = min(1.0, cells[k]["p"] * (len(order) - r_))
        prev = max(prev, adj)
        cells[k]["p_holm"] = prev
    res["families"] = cells
    Rv, a = ll(T, "p_ALL")
    _, b0 = ll(T, "p_M0")
    _, b1 = ll(T, "p_M1")
    _, al = ll(T, "p_ALONE")
    _, lg = ll(T, "pl_ALL")
    res["all_vs_M0"] = bs.ratio(Rv.date, a, Rv.date, b0)[0]
    ci_m1, _ = bs.ratio(Rv.date, a, Rv.date, b1)
    res["all_vs_M1"] = ci_m1
    res["m1_vs_M0"] = bs.ratio(Rv.date, b1, Rv.date, b0)[0]
    res["alone_vs_M0"] = bs.ratio(Rv.date, al, Rv.date, b0)[0]
    res["logit_all_vs_M0"] = bs.ratio(Rv.date, lg, Rv.date, b0)[0]
    res["base_reject_rate"] = LR._r(float(Rv.y.mean()))
    hi, lo = (T.p_ALL >= T.hi_ALL).to_numpy(), (T.p_ALL <= T.lo_ALL).to_numpy()
    res["trades"] = {"fade_all_net": trades(T, np.ones(len(T), bool), 1, bs), "fade_top_gross": trades(T, hi, 1, bs, net=False), "fade_top_net": trades(T, hi, 1, bs),
                     "follow_bottom_gross": trades(T, lo, -1, bs, net=False), "follow_bottom_net": trades(T, lo, -1, bs)}
    res["trades_M1_only"] = {"fade_top_net": trades(T, (T.p_M1 >= T.hi_M1).to_numpy(), 1, bs), "follow_bottom_net": trades(T, (T.p_M1 <= T.lo_M1).to_numpy(), -1, bs)}
    # by class, net, selected trades
    res["by_class"] = {c: {"fade_top_net": trades(T[(T.klass == c).to_numpy()], hi[(T.klass == c).to_numpy()], 1, bs),
                           "follow_bottom_net": trades(T[(T.klass == c).to_numpy()], lo[(T.klass == c).to_numpy()], -1, bs)} for c in sorted(T.klass.unique())}

    # quintile tables: top minus bottom of each new feature (cut points from training folds would add nothing here: descriptive)
    rows = []
    for pop, D in (("line", line[line.fold > 0]), ("neighbours", nb[nb.fold > 0])):
        for rung in LR.RUNGS:
            G = D[(D.rung == rung) & D.resolved]
            for f in NEW:
                g = G[G[f].notna()]
                if len(g) < 1000:
                    continue
                q = g[f].rank(pct=True).to_numpy()
                top, bot = g[q >= 0.8], g[q <= 0.2]
                a_, ra = bs.rate(top, "y")
                b_, rb = bs.rate(bot, "y")
                reps = ra - rb
                pt = float(top.y.mean() - bot.y.mean())
                m = g.back60.to_numpy() - g.beyond60.to_numpy()
                rows.append({"pop": pop, "rung": rung, "feature": f, "top": LR._r(float(top.y.mean())), "bottom": LR._r(float(bot.y.mean())), "diff": LR._r(pt),
                             "lo": LR._r(float(np.nanpercentile(reps, 2.5))), "hi": LR._r(float(np.nanpercentile(reps, 97.5))),
                             "p": float(2 * min((reps <= 0).mean(), (reps >= 0).mean())),
                             "react60_top_minus_bottom": LR._r(float(np.nanmean(m[q >= 0.8]) - np.nanmean(m[q <= 0.2])))})
    Q = pd.DataFrame(rows)
    for pop in ("line", "neighbours"):
        k = Q["pop"] == pop
        pv = Q.loc[k, "p"].to_numpy()
        o = np.argsort(pv)
        adj = np.minimum.accumulate((pv[o] * len(pv) / (np.arange(len(pv)) + 1))[::-1])[::-1]
        out = np.empty(len(pv))
        out[o] = adj
        Q.loc[k, "q_bh"] = out
    Q.to_csv(OUT / "quintiles.csv", index=False)
    res["quintile_survivors_line"] = Q[(Q["pop"] == "line") & (Q.q_bh <= 0.10)].round(4).to_dict("records")

    print("neighbours", flush=True)
    Tn = fit_arms(nb, all_dates, {"M0": [], "M1": M1, "ALL": M1 + NEW}, "neighbours")
    Rn, an = ll(Tn, "p_ALL")
    _, n0 = ll(Tn, "p_M0")
    _, n1 = ll(Tn, "p_M1")
    res["neighbours"] = {"all_vs_M0": bs.ratio(Rn.date, an, Rn.date, n0)[0], "all_vs_M1": bs.ratio(Rn.date, an, Rn.date, n1)[0],
                         "fade_top_net": trades(Tn, (Tn.p_ALL >= Tn.hi_ALL).to_numpy(), 1, bs),
                         "follow_bottom_net": trades(Tn, (Tn.p_ALL <= Tn.lo_ALL).to_numpy(), -1, bs)}

    print("shuffles", flush=True)
    real = float(a.sum() / b1.sum())
    sh = []
    for b_ in range(shuffles):
        S_ = line.sort_values(["inst", "rung", "side", "date"]).copy()
        for _, idx in S_.groupby(["inst", "rung", "side"], sort=False).indices.items():
            k = int(rng.integers(60, 501))
            S_.iloc[idx, S_.columns.get_indexer(NEW)] = np.roll(S_.iloc[idx][NEW].to_numpy(), k, axis=0)
        Ts = fit_arms(S_, all_dates, {"M1": M1, "ALL": M1 + NEW}, f"shuffle {b_}")
        R_, aa = ll(Ts, "p_ALL")
        _, bb = ll(Ts, "p_M1")
        sh.append(float(aa.sum() / bb.sum()))
    res["shuffle"] = {"real_all_vs_M1": real, "shuffles": [round(x, 5) for x in sh], "min": min(sh), "below_all": bool(real < min(sh))}

    best = max(("fade_top_net", "follow_bottom_net"), key=lambda k: res["trades"][k]["mean_K"][0])
    t = res["trades"][best]
    gate = {"all_vs_M0_ci_below_0.99": res["all_vs_M0"][2] < 0.99, "net_ci_above_0": t["mean_K"][1] > 0, "positive_4_of_5": t["positive_folds"] >= 4, "below_all_shuffles": res["shuffle"]["below_all"]}
    res["gate"], res["gate_trade"] = gate, best
    fam_pass = [k for k, v in cells.items() if v["p_holm"] < 0.05]
    res["families_passing_holm"] = fam_pass
    res["verdict"] = "VALIDATED" if all(gate.values()) else ("CONTEXT" if fam_pass and res["shuffle"]["below_all"] else "NULL")
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    write_md(res, Q)


def _c(c):
    return "—" if not c or c[0] is None else f"{c[0]:.4f} [{c[1]:.4f}, {c[2]:.4f}]"


def _t(d):
    return "—" if not d.get("n") else f"{d['n']:,} | {d['mean_K'][0]:+.3f} [{d['mean_K'][1]:+.3f}, {d['mean_K'][2]:+.3f}] | {d['positive_folds']}/5"


def write_md(r, Q):
    md = ["# vol-layer-reaction: results", "", "Prereg: `forge/VOL_LAYER_REACTION_PREREG.md`. Chosen lines, 34 instruments, 2020-08 → 2026-08, walk-forward folds 1-5, K = 0.25σ, 120 minutes, date-block 95%.", "",
          f"**Verdict: {r['verdict']}**  Gate ({r['gate_trade']}): " + ", ".join(f"{k} {'yes' if v else 'NO'}" for k, v in r["gate"].items()), "",
          f"Base P(reject | resolved) at the line: {r['base_reject_rate']}", "",
          "## Does the vol state add? (log-loss ratio, below 1 = better)", "", "| comparison | ratio [95%] | Holm p |", "|---|---|---|",
          f"| 31 old features vs rung/side/class | {_c(r['m1_vs_M0'])} | |", f"| new features alone vs rung/side/class | {_c(r['alone_vs_M0'])} | |",
          f"| old + all new vs rung/side/class (GBM) | {_c(r['all_vs_M0'])} | gate < 0.99 |", f"| same, logit | {_c(r['logit_all_vs_M0'])} | |", f"| old + all new vs old | {_c(r['all_vs_M1'])} | |"]
    for k, v in r["families"].items():
        md.append(f"| {k} vs old | {_c(v['ratio_vs_M1'])} | {v['p_holm']:.3f} |")
    s = r["shuffle"]
    md += ["", f"Shuffle placebo: real {s['real_all_vs_M1']:.5f}, shuffles min {s['min']:.5f}, below all {s['below_all']}. ", "",
           "## Trades (units of K = 0.25σ; net = one measured round-trip spread)", "", "| trade | n | mean [95%] | folds + |", "|---|---|---|---|"]
    for k, v in r["trades"].items():
        md.append(f"| {k} | {_t(v)} |")
    for k, v in r["trades_M1_only"].items():
        md.append(f"| old features only: {k} | {_t(v)} |")
    n = r["neighbours"]
    md += [f"| neighbours: fade_top_net | {_t(n['fade_top_net'])} |", f"| neighbours: follow_bottom_net | {_t(n['follow_bottom_net'])} |", "",
           f"Neighbours model: all vs M0 {_c(n['all_vs_M0'])}, all vs M1 {_c(n['all_vs_M1'])}.", "", "## Net by class", "", "| class | trade | n | mean [95%] | folds + |", "|---|---|---|---|---|"]
    for c, v in r["by_class"].items():
        for k, d in v.items():
            md.append(f"| {c} | {k} | {_t(d)} |")
    md += ["", "## Selected trades by year and concentration", ""]
    for k in ("fade_top_net", "follow_bottom_net"):
        d = r["trades"][k]
        md.append(f"- {k}: mean cost {d['mean_cost_K']} K; without the top 1% of days {d['ex_top1pct_days']}; by year {d['by_year']}")
    md += ["", "## Feature quintiles at the line (descriptive; BH q ≤ 0.10 are candidates only)", "", "| rung | feature | P(reject) top / bottom | diff [95%] | q | same diff at neighbours | reaction60 top − bottom (σ) |", "|---|---|---|---|---|---|---|"]
    L = Q[Q["pop"] == "line"].sort_values("q_bh")
    N = Q[Q["pop"] == "neighbours"].set_index(["rung", "feature"])
    for _, x in L.head(25).iterrows():
        nd = N["diff"].get((x.rung, x.feature), np.nan)
        md.append(f"| {x.rung} | {x.feature} | {x.top} / {x.bottom} | {x['diff']:+.3f} [{x.lo:+.3f}, {x.hi:+.3f}] | {x.q_bh:.3f} | {nd:+.3f} | {x.react60_top_minus_bottom:+.3f} |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["features", "d_only", "analyse"], required=True)
    ap.add_argument("--shuffles", type=int, default=20)
    a = ap.parse_args()
    {"features": stage_features, "d_only": stage_d_only}[a.stage]() if a.stage != "analyse" else stage_analyse(a.shuffles)
