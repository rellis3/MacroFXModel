"""nq-forecast-target-ev: long NQ at the London open with a forecast-derived limit target (forge/NQ_FORECAST_TARGET_EV_PREREG.md).

    python scripts/nq-forecast-target-ev/run.py            # run from the repo root (data is gitignored, local)
    python scripts/nq-forecast-target-ev/run.py --check    # mechanics check only (no strategy outcome)

Forecast rows: analysis/output/forecast_history/NQ.csv (PROD pit_* columns, oos == 1). Prices: OANDA NAS100 M1.
Writes analysis/output/nq-forecast-target-ev/{results.json, RESULTS.md, trades.csv, equity.csv}.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SEED, B, BLOCK, NPERM = 20261102, 2000, 21, 1000
COST = 0.0068                      # % round trip, analysis/output/cost-verification/cost_table.json (OANDA NAS100 model)
WIN = ("2020-08-24", "2026-08-21")
SPLIT = "2023-08-21"               # validation starts (fold 3)
USD_PT = 20.0                      # $ per index point, 1 NQ contract
OUT = Path("analysis/output/nq-forecast-target-ev")
rng = np.random.default_rng(SEED)


# ---------- data ----------
def load():
    d = pd.read_csv("analysis/output/forecast_history/NQ.csv")
    d = d.sort_values("date").reset_index(drop=True)
    # point-in-time controls from realised history strictly before each session (all rows; realised values only)
    d["b2_q75"] = d.r_oc.shift(1).rolling(250, min_periods=250).quantile(0.75)
    d["b2_hl_q75"] = d.r_hl.shift(1).rolling(250, min_periods=250).quantile(0.75)
    d["atr20"] = d.r_hl.shift(1).rolling(20, min_periods=20).mean()
    w = d[(d.oos == 1) & (d.date >= WIN[0]) & (d.date < WIN[1])].reset_index(drop=True)
    assert w.b2_q75.notna().all() and w.atr20.notna().all()
    m = pd.read_parquet("portfolioBacktest/cache/nas100_usd_m1.parquet")
    lon = m.index.tz_convert("Europe/London")
    m = m.assign(date=lon.strftime("%Y-%m-%d"), mins=lon.hour * 60 + lon.minute)
    m = m[(m.mins < 22 * 60) & m.date.isin(set(w.date))]
    S = {k: g for k, g in m.groupby("date")}
    return w, S


def mechanics(w, S):
    rows = []
    for r in w.itertuples():
        g = S[r.date]
        o = g.open.iat[0]
        rows.append((r.date, o / r.open - 1, (g.close.iat[-1] / o - 1) * 100 - r.r_ocs, (g.high.max() / o - 1) * 100 - r.r_oh,
                     (1 - g.low.min() / o) * 100 - r.r_ol, len(g)))
    x = pd.DataFrame(rows, columns=["date", "open_err", "ocs_err", "oh_err", "ol_err", "nbars"])
    return {k: float(x[k].abs().max()) for k in ["open_err", "ocs_err", "oh_err", "ol_err"]} | {
        "min_bars": int(x.nbars.min()), "sessions": len(x)}


# ---------- path simulation ----------
def sim(g, tgt_pct, stop_pct=None, side=1):
    """One long (side 1) or short (side -1) trade from the session open. Returns gross % P&L, exit minute, MFE%, MAE%, how."""
    o = g.open.iat[0]
    hi, lo, cl, mins = g.high.to_numpy(), g.low.to_numpy(), g.close.to_numpy(), g.mins.to_numpy()
    fav = (hi / o - 1) * 100 if side > 0 else (1 - lo / o) * 100
    adv = (1 - lo / o) * 100 if side > 0 else (hi / o - 1) * 100
    kt = np.flatnonzero(fav >= tgt_pct)[0] if tgt_pct is not None and (fav >= tgt_pct).any() else None
    ks = np.flatnonzero(adv >= stop_pct)[0] if stop_pct is not None and (adv >= stop_pct).any() else None
    same = False
    if ks is not None and (kt is None or ks <= kt):
        same = kt is not None and ks == kt
        k, pnl, how = ks, -stop_pct, "stop"
    elif kt is not None:
        k, pnl, how = kt, tgt_pct, "target"
    else:
        k, pnl, how = len(cl) - 1, side * (cl[-1] / o - 1) * 100, "close"
    mfe = min(fav[: k + 1].max(), tgt_pct) if tgt_pct is not None else fav[: k + 1].max()
    mae = min(adv[: k + 1].max(), stop_pct) if stop_pct is not None else adv[: k + 1].max()
    return pnl, int(mins[k] - mins[0]), float(max(mfe, 0)), float(max(mae, 0)), how, same


# ---------- statistics ----------
def blocks(n):
    nb = int(np.ceil(n / BLOCK))
    starts = rng.integers(0, n - BLOCK + 1, size=(B, nb))
    idx = (starts[:, :, None] + np.arange(BLOCK)).reshape(B, -1)[:, :n]
    return idx


def boot(x, idx):
    bm = x[idx].mean(axis=1)
    lo, hi = np.percentile(bm, [2.5, 97.5])
    p = 2 * min((bm <= 0).mean(), (bm >= 0).mean())
    return {"mean": float(x.mean()), "lo": float(lo), "hi": float(hi), "p": float(max(p, 1 / B)), "se": float(bm.std(ddof=1)),
            "t": float(x.mean() / bm.std(ddof=1)) if bm.std() > 0 else None}


def holm(ps):
    order = np.argsort(ps)
    adj, run = np.empty(len(ps)), 0.0
    for i, k in enumerate(order):
        run = max(run, (len(ps) - i) * ps[k])
        adj[k] = min(run, 1.0)
    return adj.tolist()


def metrics(pnl_pct, w, extra):
    o, sig = w.open.to_numpy(), w.pit_sig_used.to_numpy()
    pts = pnl_pct / 100 * o
    usd = pts * USD_PT
    eq = np.cumsum(usd)
    dd = float((np.maximum.accumulate(eq) - eq).max())
    wins, losses = pnl_pct[pnl_pct > 0], pnl_pct[pnl_pct <= 0]
    gw, gl = usd[pnl_pct > 0].sum(), -usd[pnl_pct <= 0].sum()
    srt = np.sort(pnl_pct)[::-1]
    top = max(1, int(round(0.05 * len(srt))))
    down = np.sqrt(np.mean(np.minimum(pnl_pct, 0) ** 2))
    return {
        "n": int(len(pnl_pct)), "pct_sessions": 100.0, "win_rate": float((pnl_pct > 0).mean()),
        "avg_win_pct": float(wins.mean()) if len(wins) else None, "avg_loss_pct": float(losses.mean()) if len(losses) else None,
        "exp_pct": float(pnl_pct.mean()), "exp_pts": float(pts.mean()), "exp_usd_nq": float(usd.mean()),
        "exp_sigma": float((pnl_pct / sig).mean()), "profit_factor": float(gw / gl) if gl > 0 else None,
        "max_dd_usd_nq": dd, "max_dd_pct_avg_notional": float(dd / (np.mean(o) * USD_PT) * 100),
        "total_usd_nq": float(usd.sum()),
        "sharpe": float(pnl_pct.mean() / pnl_pct.std(ddof=1) * np.sqrt(252)),
        "sortino": float(pnl_pct.mean() / down * np.sqrt(252)) if down > 0 else None,
        "mean_ex_best10_pct": float(srt[10:].mean()), "top5pct_share_of_total": float(srt[:top].sum() / pnl_pct.sum()) if pnl_pct.sum() != 0 else None,
        **extra,
    }


# ---------- main ----------
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    w, S = load()
    chk = mechanics(w, S)
    print("mechanics", chk)
    if "--check" in sys.argv:
        return
    assert chk["open_err"] < 1e-6 and chk["ocs_err"] < 1e-3, "session rebuild does not match NQ.csv"
    n = len(w)
    k_oc = float(np.median(w.pit_oc_p75 / w.atr20))
    k_hl = float(np.median(w.pit_hl_p75 / w.atr20))
    D = {
        "P1": (w.pit_oc_p75, None), "S1": (w.pit_oc_p50, None), "S2": (w.pit_oh_p75, None),
        "S3": (w.pit_oc_p75, w.pit_ol_p75), "B1": (None, None), "B1_stop": (None, w.pit_ol_p75),
        "B2": (w.b2_q75, None), "B3": (k_oc * w.atr20, None),
    }
    sims, trades = {}, []
    for name, (tg, st) in D.items():
        out = [sim(S[r.date], None if tg is None else float(tg.iat[i]), None if st is None else float(st.iat[i]))
               for i, r in enumerate(w.itertuples())]
        sims[name] = out
        for i, (p, hm, mfe, mae, how, same) in enumerate(out):
            trades.append((name, w.date.iat[i], round(p - COST, 5), hm, round(mfe, 4), round(mae, 4), how))
    # mirror (short) with its controls
    for name, tg in {"M_P1": w.pit_oc_p75, "M_B1": None, "M_B2": w.b2_q75, "M_B3": k_oc * w.atr20}.items():
        sims[name] = [sim(S[r.date], None if tg is None else float(tg.iat[i]), None, side=-1) for i, r in enumerate(w.itertuples())]

    idx = blocks(n)
    dev = (w.date < SPLIT).to_numpy()
    gross = {k: np.array([x[0] for x in v]) for k, v in sims.items()}
    net = {k: v - COST for k, v in gross.items()}
    res = {"seed": SEED, "B": B, "block": BLOCK, "cost_pct": COST, "window": [w.date.iat[0], w.date.iat[-1]], "n": n,
           "split": SPLIT, "mechanics": chk, "k_oc": k_oc, "k_hl": k_hl, "strategies": {}, "profit": {}, "gate": {}, "mirror": {}}
    for k in ["P1", "S1", "S2", "S3", "B1", "B1_stop", "B2", "B3"]:
        v = sims[k]
        extra = {"hit_rate": float(np.mean([x[4] == "target" for x in v])), "stop_rate": float(np.mean([x[4] == "stop" for x in v])),
                 "same_minute_ambiguous": int(sum(x[5] for x in v)),
                 "avg_mfe_pct": float(np.mean([x[2] for x in v])), "avg_mae_pct": float(np.mean([x[3] for x in v])),
                 "avg_mfe_sigma": float(np.mean([x[2] for x in v] / w.pit_sig_used)), "avg_mae_sigma": float(np.mean([x[3] for x in v] / w.pit_sig_used)),
                 "avg_hold_min": float(np.mean([x[1] for x in v])), "median_hold_min": float(np.median([x[1] for x in v])),
                 "avg_target_pct": float(np.mean(D[k][0])) if D[k][0] is not None else None,
                 "cost_sens": {f"{m}x": float((gross[k] - m * COST).mean()) for m in (0, 1, 2, 3)},
                 "halves": {"dev": float(net[k][dev].mean()), "val": float(net[k][~dev].mean())},
                 "boot": boot(net[k], idx)}
        res["strategies"][k] = metrics(net[k], w, extra)
    fam = ["P1", "S1", "S2", "S3"]
    adj = holm([res["strategies"][k]["boot"]["p"] for k in fam])
    res["profit"] = {k: {"mean": res["strategies"][k]["boot"]["mean"], "ci": [res["strategies"][k]["boot"]["lo"], res["strategies"][k]["boot"]["hi"]],
                         "p": res["strategies"][k]["boot"]["p"], "p_holm": a, "pass": bool(a < 0.05 and res["strategies"][k]["boot"]["mean"] > 0)}
                     for k, a in zip(fam, adj)}

    # placebo B4: same-quarter permutation of the P1 target distance (vectorised; no-stop target outcome needs only r_oh)
    q = pd.PeriodIndex(w.date, freq="Q").astype(str).to_numpy()
    groups = [np.flatnonzero(q == g) for g in np.unique(q)]
    roh, rol, rocs = w.r_oh.to_numpy(), w.r_ol.to_numpy(), w.r_ocs.to_numpy()
    tg = w.pit_oc_p75.to_numpy()
    # cross-check the vectorised rule against the path simulation for P1 (first bar high counts in both)
    vec = np.where(roh >= tg, tg, rocs)
    res["vector_vs_path_max_abs"] = float(np.abs(vec - gross["P1"]).max())
    plc, plc_s, plc_dev = [], [], []
    for _ in range(NPERM):
        t = tg.copy()
        for gidx in groups:
            t[gidx] = tg[rng.permutation(gidx)]
        pn = np.where(roh >= t, t, rocs) - COST
        ps = np.where(rol >= t, t, -rocs) - COST
        plc.append(pn.mean()); plc_s.append(ps.mean()); plc_dev.append(pn[dev].mean())
    plc, plc_s = np.array(plc), np.array(plc_s)

    def paired(a, b, sub=None):
        x = net[a] - net[b]
        return boot(x, idx) | {"dev": float(x[dev].mean()), "val": float(x[~dev].mean()), "mde": float(2.8 * boot(x, idx)["se"])}

    for b in ["B1", "B2", "B3"]:
        res["gate"][f"P1-{b}"] = paired("P1", b)
    res["gate"]["S3-B1_stop"] = paired("S3", "B1_stop")
    for s in ["S1", "S2"]:
        for b in ["B2", "B3"]:
            res["gate"][f"{s}-{b}"] = paired(s, b)
    p1 = net["P1"].mean()
    res["gate"]["placebo"] = {"p1": float(p1), "placebo_mean": float(plc.mean()), "placebo_p95": float(np.percentile(plc, 95)),
                              "pctile": float((plc < p1).mean()), "placebo_sd": float(plc.std(ddof=1))}
    g = res["gate"]
    cond = {
        "1_p1_profit_holm": res["profit"]["P1"]["pass"],
        "2_beats_B2_and_B3": g["P1-B2"]["lo"] > 0 and g["P1-B3"]["lo"] > 0,
        "3_above_placebo_p95": p1 > g["placebo"]["placebo_p95"],
        "4_same_sign_halves_vs_B2": np.sign(g["P1-B2"]["dev"]) == np.sign(g["P1-B2"]["val"]) and g["P1-B2"]["mean"] > 0,
    }
    res["gate"]["conditions"] = {k: bool(v) for k, v in cond.items()}
    res["gate"]["pass"] = bool(all(cond.values()))
    mde = max(g["P1-B2"]["mde"], g["P1-B3"]["mde"])
    res["gate"]["paired_mde"] = mde
    if res["gate"]["pass"]:
        verdict = "VALIDATED"
    elif mde > 0.02:
        verdict = "UNDERPOWERED"
    else:
        verdict = "NULL"
    res["verdict"] = verdict
    # mirror (short side)
    for k in ["M_P1", "M_B1", "M_B2", "M_B3"]:
        res["mirror"][k] = boot(net[k], idx)
    res["mirror"]["M_P1-M_B2"] = boot(net["M_P1"] - net["M_B2"], idx)
    res["mirror"]["M_P1-M_B3"] = boot(net["M_P1"] - net["M_B3"], idx)
    p1s = net["M_P1"].mean()
    res["mirror"]["placebo"] = {"m_p1": float(p1s), "placebo_mean": float(plc_s.mean()), "placebo_p95": float(np.percentile(plc_s, 95)),
                                "pctile": float((plc_s < p1s).mean())}

    # by year / month
    yr = w.date.str[:4].to_numpy()
    res["by_year"] = {k: {y: {"n": int((yr == y).sum()), "mean_pct": float(net[k][yr == y].mean()),
                              "usd_nq": float((net[k][yr == y] / 100 * w.open.to_numpy()[yr == y] * USD_PT).sum())}
                          for y in sorted(set(yr))} for k in ["P1", "S1", "S2", "S3", "B1", "B2", "B3"]}
    mo = w.date.str[:7].to_numpy()
    mon = pd.DataFrame({k: pd.Series(net[k] / 100 * w.open.to_numpy() * USD_PT).groupby(mo).sum() for k in ["P1", "B1", "B2", "B3"]})
    res["months"] = {"n": int(len(mon)), "P1_positive_share": float((mon.P1 > 0).mean()), "B1_positive_share": float((mon.B1 > 0).mean()),
                     "P1_minus_B1_positive_share": float(((mon.P1 - mon.B1) > 0).mean()),
                     "P1_minus_B2_positive_share": float(((mon.P1 - mon.B2) > 0).mean())}
    mon.round(1).to_csv(OUT / "monthly_usd_nq.csv")

    # ----- Part A: O->C calibration -----
    A = {}
    for r in ["p50", "p75", "p90"]:
        f = w[f"pit_oc_{r}"]
        A[r] = {"exceed": float((w.r_oc > f).mean()), "up_beyond": float((w.r_ocs > f).mean()), "down_beyond": float((w.r_ocs < -f).mean())}
    terc = pd.qcut(w.pit_sig_used, 3, labels=["low", "mid", "high"])
    A["signed_oc_by_sigma_tercile"] = {str(t): {"mean_pct": float(w.r_ocs[terc == t].mean()), "mean_sigma": float((w.r_ocs / w.pit_sig_used)[terc == t].mean()),
                                                "abs_oc_over_p75": float((w.r_oc / w.pit_oc_p75)[terc == t].mean())} for t in ["low", "mid", "high"]}
    hl_res = {}
    for r in ["p50", "p75", "p90"]:
        hl_res[r] = {"exceed": float((w.r_hl > w[f"pit_hl_{r}"]).mean())}

    def pinball(y, qhat, tau=0.75):
        u = y - qhat
        return np.maximum(tau * u, (tau - 1) * u)

    def skill(y, f, base):
        lf, lb = pinball(y, f), pinball(y, base)
        bs = [1 - lf[i].mean() / lb[i].mean() for i in idx[:1000]]
        return {"skill": float(1 - lf.mean() / lb.mean()), "lo": float(np.percentile(bs, 2.5)), "hi": float(np.percentile(bs, 97.5))}

    A["pinball_p75_vs_trailing"] = skill(w.r_oc.to_numpy(), w.pit_oc_p75.to_numpy(), w.b2_q75.to_numpy())
    A["pinball_p75_vs_atr"] = skill(w.r_oc.to_numpy(), w.pit_oc_p75.to_numpy(), (k_oc * w.atr20).to_numpy())
    Bp = {"coverage": hl_res,
          "pinball_p75_vs_trailing": skill(w.r_hl.to_numpy(), w.pit_hl_p75.to_numpy(), w.b2_hl_q75.to_numpy()),
          "pinball_p75_vs_atr": skill(w.r_hl.to_numpy(), w.pit_hl_p75.to_numpy(), (k_hl * w.atr20).to_numpy())}
    # timing: first London hour the running range reaches hl_p50 / hl_p75
    rng_h = np.stack([w[f"oh_h{h}"].fillna(0).to_numpy() + w[f"ol_h{h}"].fillna(0).to_numpy() for h in range(1, 23)], axis=1)
    for r in ["p50", "p75"]:
        f = w[f"pit_hl_{r}"].to_numpy()[:, None]
        reach = rng_h >= f
        first = np.where(reach.any(axis=1), reach.argmax(axis=1) + 1, np.nan)
        Bp[f"reach_hour_{r}"] = {"share_reached": float(np.isfinite(first).mean()), "median_hour_end": float(np.nanmedian(first)),
                                 "by_hour_cum": [float((first <= h).mean()) for h in range(1, 23)]}
    # after reaching hl_p50: further extension and |close - price at reach| (sigma), vs non-reach days at the median reach minute
    ext_r, mv_r, reach_min = [], [], []
    for i, r in enumerate(w.itertuples()):
        g = S[r.date]
        o = g.open.iat[0]
        rh = np.maximum.accumulate(g.high.to_numpy()); rl = np.minimum.accumulate(g.low.to_numpy())
        rr = (rh - rl) / o * 100
        kk = np.flatnonzero(rr >= r.pit_hl_p50)
        if len(kk):
            k = kk[0]; reach_min.append(int(g.mins.iat[k]))
            ext_r.append((rr[-1] - rr[k]) / r.pit_sig_used); mv_r.append(abs(g.close.iat[-1] - g.close.iat[k]) / o * 100 / r.pit_sig_used)
    med_min = int(np.median(reach_min))
    ext_n, mv_n = [], []
    for i, r in enumerate(w.itertuples()):
        g = S[r.date]
        o = g.open.iat[0]
        rr = (np.maximum.accumulate(g.high.to_numpy()) - np.minimum.accumulate(g.low.to_numpy())) / o * 100
        if rr[-1] >= r.pit_hl_p50:
            continue
        k = int(np.searchsorted(g.mins.to_numpy(), med_min))
        k = min(k, len(rr) - 1)
        ext_n.append((rr[-1] - rr[k]) / r.pit_sig_used); mv_n.append(abs(g.close.iat[-1] - g.close.iat[k]) / o * 100 / r.pit_sig_used)
    Bp["after_reach_p50"] = {"n_reach": len(ext_r), "median_reach_min": med_min,
                             "reach_days": {"further_ext_sigma": float(np.mean(ext_r)), "abs_move_to_close_sigma": float(np.mean(mv_r))},
                             "nonreach_days_at_median_min": {"n": len(ext_n), "further_ext_sigma": float(np.mean(ext_n)), "abs_move_to_close_sigma": float(np.mean(mv_n))}}
    res["partA_oc"] = A
    res["partB_hl"] = Bp

    OUT.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(trades, columns=["strategy", "date", "net_pct", "hold_min", "mfe_pct", "mae_pct", "exit"]).to_csv(OUT / "trades.csv", index=False)
    eq = pd.DataFrame({"date": w.date, **{k: np.cumsum(net[k] / 100 * w.open.to_numpy() * USD_PT).round(1) for k in ["P1", "S1", "S2", "S3", "B1", "B2", "B3"]}})
    eq.to_csv(OUT / "equity_usd_nq.csv", index=False)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    print(json.dumps({"verdict": verdict, "profit": res["profit"], "gate": {k: v for k, v in res["gate"].items() if k in ("conditions", "placebo", "paired_mde", "P1-B1", "P1-B2", "P1-B3")}}, indent=1, default=float))


if __name__ == "__main__":
    main()
