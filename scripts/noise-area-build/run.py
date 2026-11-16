"""Run noise-area-build: scan, walk-forward, scored cells B1/B2, described tables, page JSON.

    NAM_DATA=<main checkout> python scripts/noise-area-build/run.py
"""
import json
import time

import numpy as np
import pandas as pd

import scan as S

S.PDIST = S.paper_dist()
PAPER_IDX = int(np.ravel_multi_index(S.PAPER, S.SHAPE))
rng = np.random.default_rng(S.SEED)
S.OUT.mkdir(parents=True, exist_ok=True)


def r2(x, k=2):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def ci(a):
    return [r2(np.percentile(a, 2.5)), r2(np.percentile(a, 97.5))]


summary = {"seed": S.SEED, "prereg": "forge/NOISE_AREA_BUILD_PREREG.md", "grid": dict(
    vm=S.VM, lb=S.LB, ck=S.CK, exit=S.EXITS, filter=S.FILTERS, sizing=S.SIZING), "nspec": S.NSPEC,
    "costs": S.COST, "instruments": {}}
wf_streams, p_b1, p_b2 = {}, {}, {}
t0 = time.time()

for sym in S.INSTR:
    Z, NET, UNITS, UD, ctx = S.scan(sym)
    days = Z["days"].astype("datetime64[D]")
    D = len(days)
    pw = days <= S.PAPER_END
    ho = days >= S.HOLD_START
    yrs = days.astype("datetime64[Y]").astype(int) + 1970
    wk = S.week_ids(Z["days"])
    nyears_pw = pw.sum() / 252

    # ---------------- described: the design map over the paper window
    Spw = S.sharpe_all(NET, pw)
    Sho = S.sharpe_all(NET, ho)
    Sall = S.sharpe_all(NET, np.ones(D, bool))
    best = int(np.argmax(Spw))
    chosen_pw, pl_pw = S.choose(Spw)
    Xpw = NET[:, pw].astype(np.float64)
    sr_d = Xpw.mean(1) / Xpw.std(1, ddof=1)
    xb = Xpw[best]
    sk = float(pd.Series(xb).skew())
    ku = float(pd.Series(xb).kurt()) + 3
    dsr_p, sr0 = S.deflated_sharpe(sr_d[best], sr_d[np.isfinite(sr_d)], pw.sum(), sk, ku)
    marg = {}
    A = Spw.reshape(S.SHAPE)
    for ax, (name, vals) in enumerate([("vm", S.VM), ("lb", S.LB), ("ck", S.CK), ("exit", S.EXITS),
                                       ("filter", S.FILTERS), ("sizing", S.SIZING)]):
        marg[name] = {str(v): r2(np.median(np.take(A, i, axis=ax))) for i, v in enumerate(vals)}
        marg[name + "_best"] = {str(v): r2(np.max(np.take(A, i, axis=ax))) for i, v in enumerate(vals)}

    # ---------------- walk-forward
    first = int(yrs.min()) + 3
    wf = np.zeros(D)
    wf_spec = np.full(D, -1)
    choices = []
    for Y in range(first, int(yrs.max()) + 1):
        hist = yrs < Y
        if hist.sum() < 600:
            continue
        Sh = S.sharpe_all(NET, hist)
        c, pl = S.choose(Sh)
        m = yrs == Y
        wf[m] = NET[c, m]
        wf_spec[m] = c
        choices.append(dict(year=Y, spec=S.spec_dict(c), name=S.spec_name(c), plateau=r2(pl[c]),
                             insample=r2(Sh[c]), oos=r2(S.shp(NET[c, m])), paper_oos=r2(S.shp(NET[PAPER_IDX, m])),
                             days=int(m.sum())))
    oos = wf_spec >= 0
    fx = NET[PAPER_IDX].astype(np.float64)
    w, f = wf[oos], fx[oos]
    wko = wk[oos]
    nh = oos.sum() // 2
    sh_wf, sh_fx = S.shp(w), S.shp(f)
    bt = S.boot(np.vstack([w, f]), wko, rng, lambda mu, sd: np.column_stack([mu / sd * np.sqrt(252), mu]))
    # columns: [sharpe_wf, sharpe_fx, mean_wf, mean_fx]  (fn returns stacked (B, 2k))
    b_sh_wf, b_sh_fx, b_mu_wf = bt[:, 0], bt[:, 1], bt[:, 2]
    diff = b_sh_wf - b_sh_fx
    p_b1[sym] = (np.sum(diff <= 0) + 1) / (S.B + 1)
    p_b2[sym] = (np.sum(b_mu_wf <= 0) + 1) / (S.B + 1)
    halves_diff = [S.shp(w[:nh]) - S.shp(f[:nh]), S.shp(w[nh:]) - S.shp(f[nh:])]
    halves_wf = [S.shp(w[:nh]), S.shp(w[nh:])]
    wf_streams[sym] = pd.Series(np.where(oos, wf, np.nan), index=pd.to_datetime(days))

    # ---------------- page data: monthly returns of every design, per-design stats
    mon = days.astype("datetime64[M]")
    um, first_i = np.unique(mon, return_index=True)  # days are sorted
    M = np.expm1(np.add.reduceat(np.log1p(NET.astype(np.float64)), first_i, axis=1))
    eqv = np.cumprod(1 + NET.astype(np.float64), axis=1)
    mdd = (eqv / np.maximum.accumulate(eqv, axis=1) - 1).min(1)
    cg = eqv[:, -1] ** (252 / D) - 1
    Xa = NET.astype(np.float64)
    traded = UD > 0
    ntr = traded.sum(1)
    rt = UD.sum(1) / 2.0
    hit = np.where(ntr > 0, ((Xa > 0) & traded).sum(1) / np.maximum(ntr, 1), np.nan)
    vol = Xa.std(1, ddof=1) * np.sqrt(252)
    mu_a = Xa.mean(1)
    skew = ((Xa - mu_a[:, None]) ** 3).mean(1) / np.maximum(Xa.std(1), 1e-12) ** 3
    extra = dict(vol=np.round(vol * 100, 1).tolist(), hit=np.round(np.nan_to_num(hit) * 100, 1).tolist(),
                 exposure=np.round(ntr / D * 100, 1).tolist(), trades=np.round(rt).astype(int).tolist(),
                 avg_trade_bp=np.round(np.where(rt > 0, Xa.sum(1) / np.maximum(rt, 1) * 1e4, 0), 2).tolist(),
                 skew=np.round(skew, 2).tolist(), worst=np.round(Xa.min(1) * 100, 2).tolist(),
                 best=np.round(Xa.max(1) * 100, 2).tolist())
    # walk-forward daily record + trade list (standard backtest output)
    _, bhr = S.E.daily_sigma(Z["close"], Z["last"], Z["prev"])
    bhr = np.nan_to_num(bhr)
    oi = np.nonzero(oos)[0]
    wtr = []
    for ch in choices:
        rows = np.nonzero(yrs == ch["year"])[0]
        ci_ = int(np.ravel_multi_index(tuple([S.VM.index(ch["spec"]["vm"]), S.LB.index(ch["spec"]["lb"]),
                                              S.CK.index(ch["spec"]["ck"]), S.EXITS.index(ch["spec"]["exit"]),
                                              S.FILTERS.index(ch["spec"]["filter"]), S.SIZING.index(ch["spec"]["sizing"])]), S.SHAPE))
        wtr += S.spec_trades(Z, ctx, ci_, rows, S.COST[sym])
    tday = np.zeros(D, int)
    tsum = np.zeros(D)
    for t in wtr:
        tday[t[0]] += 1
        tsum[t[0]] += t[6]
    chk = np.max(np.abs(tsum[oos] - wf[oos] * 1e4))
    print(f"{sym}: {len(wtr)} WF trades; trade list vs daily P&L max gap {chk:.3f} bp", flush=True)
    assert chk < 0.5, "trade list does not add up to the daily P&L"
    hm = lambda b: f"{(9 * 60 + 30 + b + 1) // 60:02d}:{(9 * 60 + 30 + b + 1) % 60:02d}"
    wfd = dict(sym=sym, dates=[str(days[k]) for k in oi], r=np.round(wf[oi], 6).tolist(),
               rp=np.round(fx[oi], 6).tolist(), rb=np.round(bhr[oi], 6).tolist(), ntr=tday[oi].tolist(),
               year_spec={str(c["year"]): c["name"] for c in choices},
               trades=[[str(days[t[0]]), hm(t[1]), hm(t[2]), t[3], t[4], t[5], t[6]] for t in wtr],
               trade_cols=["date", "entry (NY)", "exit (NY)", "side", "lev", "gross bp 1x", "net bp on equity"])
    (S.OUT / f"wf_{sym}.json").write_text(json.dumps(wfd, separators=(",", ":")))
    page = dict(sym=sym, months=[str(m) for m in um], monthly_bp=np.round(M * 1e4).astype(int).tolist(), **extra,
                sharpe_pw=np.round(Spw, 2).tolist(), sharpe_ho=np.round(Sho, 2).tolist(),
                sharpe_all=np.round(Sall, 2).tolist(), cagr=np.round(cg * 100, 1).tolist(),
                mdd=np.round(mdd * 100, 1).tolist(), trades_day=np.round(UNITS / 2, 2).tolist(),
                plateau_pw=np.round(np.nan_to_num(pl_pw), 2).tolist())
    (S.OUT / f"build_{sym}.json").write_text(json.dumps(page, separators=(",", ":")))

    dstr = [str(d) for d in days[oos]]
    summary["instruments"][sym] = dict(
        days=int(D), start=str(days[0]), end=str(days[-1]), paper_window_years=r2(nyears_pw, 1),
        map=dict(best=S.spec_dict(best), best_name=S.spec_name(best), best_sharpe_pw=r2(Spw[best]),
                 best_sharpe_ho=r2(Sho[best]), deflated_p=r2(dsr_p, 3), sr0_expected_max_null=r2(sr0),
                 plateau=S.spec_dict(chosen_pw), plateau_name=S.spec_name(chosen_pw),
                 plateau_sharpe_pw=r2(Spw[chosen_pw]), plateau_score=r2(pl_pw[chosen_pw]),
                 plateau_sharpe_ho=r2(Sho[chosen_pw]), paper_sharpe_pw=r2(Spw[PAPER_IDX]),
                 paper_sharpe_ho=r2(Sho[PAPER_IDX]), share_positive_pw=r2(np.mean(Spw > 0), 3),
                 pct_rank_paper=r2(np.mean(Spw < Spw[PAPER_IDX]), 3), marginals=marg),
        wf=dict(start=dstr[0], end=dstr[-1], days=int(oos.sum()), choices=choices,
                sharpe=r2(sh_wf), sharpe_ci=ci(b_sh_wf), mean_bp=r2(w.mean() * 1e4), mean_bp_ci=ci(b_mu_wf * 1e4),
                halves=[r2(x) for x in halves_wf], cagr=r2(S.cagr(w, len(w)) * 100, 1),
                mdd=r2(S.max_dd(w) * 100, 1), paper_sharpe=r2(sh_fx), paper_cagr=r2(S.cagr(f, len(f)) * 100, 1),
                paper_mdd=r2(S.max_dd(f) * 100, 1), diff=r2(sh_wf - sh_fx), diff_ci=ci(diff),
                diff_halves=[r2(x) for x in halves_diff], corr=r2(np.corrcoef(w, f)[0, 1]),
                p_b1=r2(p_b1[sym], 4), p_b2=r2(p_b2[sym], 4),
                eq_dates=dstr[::5] + [dstr[-1]],
                eq_wf=np.round(np.cumprod(1 + w), 4)[::5].tolist() + [r2(np.prod(1 + w), 4)],
                eq_paper=np.round(np.cumprod(1 + f), 4)[::5].tolist() + [r2(np.prod(1 + f), 4)]))
    print(f"{sym}: WF {sh_wf:.2f} vs paper {sh_fx:.2f}  diff {sh_wf - sh_fx:+.2f} {ci(diff)}  "
          f"map best {Spw[best]:.2f} ({S.spec_name(best)}) DSR p {dsr_p:.3f}  plateau {S.spec_name(chosen_pw)} "
          f"pw {Spw[chosen_pw]:.2f} ho {Sho[chosen_pw]:.2f}", flush=True)

# ---------------- verdicts
syms = list(S.INSTR)
bh1 = dict(zip(syms, S.bh([p_b1[s] for s in syms])))
bh2 = dict(zip(syms, S.bh([p_b2[s] for s in syms])))
for s in syms:
    W = summary["instruments"][s]["wf"]
    if bh1[s] and W["diff_ci"][0] > 0 and min(W["diff_halves"]) > 0:
        v1 = "VALIDATED"
    elif W["diff_ci"][1] < 0.30:
        v1 = "NULL"
    else:
        v1 = "UNDERPOWERED"
    if bh2[s] and W["mean_bp_ci"][0] > 0 and min(W["halves"]) > 0:
        v2 = "VALIDATED"
    elif W["sharpe_ci"][1] < 0.50:
        v2 = "NULL"
    else:
        v2 = "UNDERPOWERED"
    W["B1"], W["B2"], W["bh1"], W["bh2"] = v1, v2, bool(bh1[s]), bool(bh2[s])
    print(s, "B1", v1, "B2", v2)

# ---------------- described: equal-risk book of the walk-forward streams (10% vol each, trailing 60-day scale)
dfw = pd.DataFrame(wf_streams).sort_index()
dfw = dfw[dfw.index >= "2019-01-01"]
scaled = {}
for s in dfw:
    x = dfw[s]
    vol = (x.rolling(60, min_periods=40).std().shift(1) * np.sqrt(252)).replace(0.0, np.nan)
    scaled[s] = (x * (0.10 / vol)).fillna(0.0)
bk = pd.DataFrame(scaled).mean(axis=1)
bk = bk[bk.index >= bk.index[60]]
bb = S.boot(bk.to_numpy()[None, :], S.week_ids(bk.index.to_numpy().astype("datetime64[D]")), rng,
            lambda mu, sd: mu / sd * np.sqrt(252))
summary["book"] = dict(start=str(bk.index[0].date()), end=str(bk.index[-1].date()), sharpe=r2(S.shp(bk)),
                       sharpe_ci=ci(bb[:, 0]), halves=[r2(S.shp(bk[: len(bk) // 2])), r2(S.shp(bk[len(bk) // 2:]))],
                       corr=dfw.corr().round(2).to_dict())
summary["runtime_s"] = int(time.time() - t0)
(S.OUT / "results.json").write_text(json.dumps(summary, indent=1))
print("book", summary["book"]["sharpe"], summary["book"]["sharpe_ci"], "done", summary["runtime_s"], "s")
