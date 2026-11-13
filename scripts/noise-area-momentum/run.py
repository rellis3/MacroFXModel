"""noise-area-momentum: run every variant, the permutation null, the verdicts and the page data.

Prereg: forge/NOISE_AREA_MOMENTUM_PREREG.md (A1). Seed 20261113. Lockbox end 2026-08-21.
Usage: python -I scripts/noise-area-momentum/run.py [--draws 200] [--quick]
Outputs: analysis/output/noise-area-momentum/{results.json, site.json, trades_<INST>.json, days_<INST>.json}
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E  # noqa: E402

B = 2000
VARIANTS = {
    "V1": dict(label="Opposite-band stop, 1x", sized=False, lookback=14, vm=1.0, paper="Table 1: Sharpe 0.61"),
    "V2": dict(label="Current band + VWAP stop, 1x", sized=False, lookback=14, vm=1.0, paper="Table 2: Sharpe 1.24"),
    "V3": dict(label="Band + VWAP, vol-targeted (headline)", sized=True, lookback=14, vm=1.0,
               paper="Table 3: Sharpe 1.33, 19.6%/yr"),
    "V4": dict(label="VWAP-only stop, vol-targeted", sized=True, lookback=14, vm=1.0, paper="FAQ Q22: Sharpe 1.17"),
    "V5": dict(label="Current band only (no VWAP), 1x", sized=False, lookback=14, vm=1.0, paper="not in paper"),
    "V6": dict(label="V3 with 90-day lookback", sized=True, lookback=90, vm=1.0, paper="FAQ Q6: Sharpe 1.50"),
    "V7": dict(label="V3 with band x1.5", sized=True, lookback=14, vm=1.5, paper="§4.4: Sharpe ~1.55"),
}
# Paper FAQ Q24 monthly table (SPY, V3), % per month, 2016-01 .. 2025-08 (mechanics check)
PAPER = {
    2016: [-1.0, -1.9, 1.3, -1.4, 0.4, -7.3, -3.1, -5.2, 8.4, -5.0, 1.4, 0.7],
    2017: [-3.3, 0.9, 1.7, -3.3, -2.4, 0.4, -1.8, 3.6, -1.1, 2.9, -2.2, -2.3],
    2018: [3.5, 8.9, 7.2, 3.5, -4.7, 2.0, 6.2, -1.7, -3.5, 13.4, 3.0, 12.5],
    2019: [0.9, -0.7, 2.9, 0.9, -5.1, -0.5, 1.4, 6.8, -1.4, 2.6, -1.7, 1.0],
    2020: [5.3, 1.9, -0.5, -1.8, -0.2, 8.0, 0.1, -1.8, 14.3, 2.8, -1.1, -1.9],
    2021: [7.8, 3.1, 0.7, 6.1, 2.6, -1.0, 2.8, 1.7, 2.8, 3.3, -3.2, 4.1],
    2022: [-5.5, 2.8, 0.2, 9.0, 2.1, 0.5, 0.2, 6.3, -1.0, 5.8, 1.6, 0.7],
    2023: [2.9, -1.3, 7.8, 1.8, 2.9, 4.1, 2.2, 6.0, 2.9, -1.1, 0.5, 3.8],
    2024: [8.8, -1.5, -0.4, 5.8, -4.3, 1.6, 8.2, -2.8, 4.1, 6.7, -2.6, 5.7],
    2025: [-1.2, 7.6, -0.2, 4.3, -2.1, -2.0, -2.0, -2.9],
}
PAPER_EXAMPLES = ["2022-01-20", "2022-01-31", "2022-04-29"]


# ----------------------------------------------------------------------------------------------- stats
def sharpe(r):
    r = r[np.isfinite(r)]
    s = r.std(ddof=1)
    return float(r.mean() / s * np.sqrt(252)) if s > 0 else 0.0


def week_ids(days):
    iso = pd.to_datetime(days, unit="D").isocalendar()
    return (iso.year.astype(int) * 100 + iso.week.astype(int)).to_numpy()


def boot(r, wk, rng, stat):
    u, inv = np.unique(wk, return_inverse=True)
    groups = [np.nonzero(inv == i)[0] for i in range(len(u))]
    vals = np.empty(B)
    for b in range(B):
        pick = rng.integers(0, len(groups), len(groups))
        idx = np.concatenate([groups[i] for i in pick])
        vals[b] = stat(r[idx])
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def summary(r, days, bh=None, units=None, glong=None, gshort=None, traded=None):
    r = np.asarray(r, float)
    eq = np.cumprod(1 + r)
    yrs = len(r) / 252
    dd = eq / np.maximum.accumulate(eq) - 1
    out = dict(total=float(eq[-1] - 1), cagr=float(eq[-1] ** (1 / yrs) - 1), vol=float(r.std(ddof=1) * np.sqrt(252)),
               sharpe=sharpe(r), mdd=float(-dd.min()), worst=float(r.min()), best=float(r.max()),
               skew=float(pd.Series(r).skew()), hit_all=float((r > 0).mean()), days=int(len(r)),
               mean_bp=float(r.mean() * 1e4))
    if traded is not None and traded.any():
        out["hit_traded"] = float((r[traded] > 0).mean())
        out["traded_share"] = float(traded.mean())
    if units is not None:
        out["trades"] = int(round(units.sum() / 2))
        out["trades_per_day"] = float(units.sum() / 2 / len(r))
    if bh is not None:
        ok = np.isfinite(bh)
        X = np.vstack([np.ones(ok.sum()), bh[ok]]).T
        coef = np.linalg.lstsq(X, r[ok], rcond=None)[0]
        out["alpha"] = float(coef[0] * 252)
        out["beta"] = float(coef[1])
        out["corr_bh"] = float(np.corrcoef(r[ok], bh[ok])[0, 1])
    if glong is not None:
        out["long_bp"] = float(glong.mean() * 1e4)
        out["short_bp"] = float(gshort.mean() * 1e4)
    return out


def monthly(r, days):
    s = pd.Series(r, index=pd.to_datetime(days, unit="D"))
    m = (1 + s).groupby([s.index.year, s.index.month]).prod() - 1
    out = {}
    for (y, mo), v in m.items():
        out.setdefault(int(y), {})[int(mo)] = round(float(v) * 100, 2)
    return out


# ----------------------------------------------------------------------------------------------- per-instrument run
def sim_all(Z, cost, feats):
    res = {}
    for v, spec in VARIANTS.items():
        F = feats[(spec["lookback"], spec["vm"])]
        res[v] = E.run_variant(Z, F, v, cost, spec["sized"])
    return res


def decomposition(Z, R2):
    """First V2 entry of each day: (a) next-30-min sign-adjusted gross return, (b) hold to the close (no stop)."""
    P, C, O, last = R2["P"], Z["close"], Z["open"], Z["last"]
    D = len(O)
    a = np.full(D, np.nan)
    b = np.full(D, np.nan)
    nz = P != 0
    has = nz.any(1)
    k0 = np.argmax(nz, axis=1)
    for d in np.nonzero(has)[0]:
        c = E.CHECKS[k0[d]]
        side = P[d, k0[d]]
        e30 = min(c + 30, last[d])
        a[d] = side * (C[d, e30] - C[d, c]) / O[d]
        b[d] = side * (C[d, last[d]] - C[d, c]) / O[d]
    return a, b


def start_index(F):
    ok = np.isfinite(F["sdaily"]) & np.isfinite(F["ub"][:, E.CHECKS[0]])
    return int(np.argmax(ok))


def run_instrument(sym, draws, rng_null):
    t0 = time.time()
    Z = E.build_days(sym)
    cost = E.COST_RT_PTS[sym]
    feats = {(lb, vm): E.features(Z, lb, vm) for lb, vm in {(s["lookback"], s["vm"]) for s in VARIANTS.values()}}
    F = feats[(14, 1.0)]
    i0 = start_index(F)
    days = Z["days"][i0:]
    res = sim_all(Z, cost, feats)
    bh = F["bh"][i0:]
    out = dict(sym=sym, start=str(pd.to_datetime(days[0], unit="D").date()),
               end=str(pd.to_datetime(days[-1], unit="D").date()), n_days=int(len(days)),
               cfd_days=int((Z["src"][i0:] == 1).sum()), variants={}, monthly={}, equity={}, half={})
    half = np.arange(len(days)) < len(days) // 2
    wk = week_ids(days)
    brng = np.random.default_rng(E.SEED)
    for v, R in res.items():
        net = R["net"][i0:]
        lev = R["lev"][i0:]
        st = summary(net, days, bh, R["units"][i0:], R["glong"][i0:], R["gshort"][i0:],
                     traded=R["units"][i0:] > 0)
        st["gross_sharpe"] = sharpe(R["gross"][i0:])
        st["gross_mean_bp"] = float(R["gross"][i0:].mean() * 1e4)
        st["cost_bp_day"] = float(R["cost"][i0:].mean() * 1e4)
        st["avg_lev"] = float(np.nanmean(lev)) if VARIANTS[v]["sized"] else 1.0
        st["sharpe_h1"], st["sharpe_h2"] = sharpe(net[half]), sharpe(net[~half])
        st["fut_only_sharpe"] = sharpe(net[Z["src"][i0:] == 0])
        if v in ("V1", "V2", "V3"):
            st["sharpe_ci"] = boot(net, wk, brng, sharpe)
            st["mean_ci_bp"] = [x * 1e4 for x in boot(net, wk, brng, np.mean)]
        out["variants"][v] = st
        out["monthly"][v] = monthly(net, days)
        out["equity"][v] = np.round(np.cumprod(1 + net), 5).tolist()
    out["bh"] = summary(np.nan_to_num(bh), days)
    out["monthly"]["BH"] = monthly(np.nan_to_num(bh), days)
    out["equity"]["BH"] = np.round(np.cumprod(1 + np.nan_to_num(bh)), 5).tolist()
    out["dates"] = [str(x) for x in pd.to_datetime(days, unit="D").strftime("%Y-%m-%d")]
    # daily inputs so the page can recompute everything at any cost assumption:
    # net = gross - lev * units * (cost_rt_pts / 2) / uopen   (lev = 1 for unsized variants)
    out["daily"] = dict(uopen=np.round(Z["uopen"][i0:], 2).tolist(), src=Z["src"][i0:].astype(int).tolist(),
                        lev=np.round(np.nan_to_num(res["V3"]["lev"][i0:]), 4).tolist(),
                        bh=np.round(np.nan_to_num(bh), 7).tolist(),
                        gross={v: np.round(res[v]["gross"][i0:], 7).tolist() for v in res},
                        units={v: res[v]["units"][i0:].astype(int).tolist() for v in res})
    chk = res["V3"]["gross"][i0:] - np.nan_to_num(res["V3"]["lev"][i0:]) * res["V3"]["units"][i0:] * (cost / 2) / Z["uopen"][i0:]
    assert np.allclose(chk, res["V3"]["net"][i0:], atol=1e-9), "page cost formula != engine"
    # by year (V2, V3)
    yr = pd.to_datetime(days, unit="D").year
    out["by_year"] = {v: {int(y): dict(ret=float(np.prod(1 + res[v]["net"][i0:][yr == y]) - 1),
                                       sharpe=sharpe(res[v]["net"][i0:][yr == y]))
                          for y in np.unique(yr)} for v in ("V1", "V2", "V3")}
    # time-of-day P&L (V2, 1x gross per check slot, bp/day)
    P = res["V2"]["P"][i0:]
    C, O, last = Z["close"][i0:], Z["open"][i0:], Z["last"][i0:]
    ends = np.concatenate([E.CHECKS[1:], [E.NBAR - 1]])
    rows = np.arange(len(O))
    tod = []
    for k, c in enumerate(E.CHECKS):
        e = np.minimum(ends[k], last)
        g = np.where(c < e, P[:, k] * (C[rows, e] - C[:, c]) / O, 0.0)
        tod.append(dict(slot=k, mean_bp=float(g.mean() * 1e4), in_pos=float((P[:, k] != 0).mean())))
    out["time_of_day"] = tod
    # vol-regime split (sigma_daily terciles, known before the day)
    sd = F["sdaily"][i0:]
    q = np.nanpercentile(sd, [33.3, 66.7])
    reg = np.digitize(sd, q)
    out["vol_regime"] = {v: [dict(tercile=int(t), sharpe=sharpe(res[v]["net"][i0:][reg == t]),
                                  mean_bp=float(res[v]["net"][i0:][reg == t].mean() * 1e4)) for t in range(3)]
                         for v in ("V2", "V3")}
    # decomposition (real)
    a, b = decomposition(Z, res["V2"])
    a, b = a[i0:], b[i0:]
    stopval = res["V2"]["gross"][i0:] - np.nan_to_num(b)
    dec = dict(entry30_bp=float(np.nanmean(a) * 1e4), hold_bp=float(np.nanmean(b) * 1e4),
               stop_bp=float(np.nanmean(stopval[np.isfinite(b)]) * 1e4),
               entry30_h=[float(np.nanmean(a[half]) * 1e4), float(np.nanmean(a[~half]) * 1e4)],
               hold_h=[float(np.nanmean(b[half]) * 1e4), float(np.nanmean(b[~half]) * 1e4)],
               stop_h=[float(np.nanmean(stopval[half & np.isfinite(b)]) * 1e4),
                       float(np.nanmean(stopval[~half & np.isfinite(b)]) * 1e4)])
    out["decomposition"] = dec
    # trades (V2 timing; V3 size via lev) -- check they add up to the day's 1x gross
    tr = E.trades(res["V2"]["P"], Z, 1.0, cost)
    tr = [t for t in tr if t[0] >= i0]
    tsum = np.zeros(len(Z["open"]))
    for t in tr:
        tsum[t[0]] += t[4] / 1e4
    assert np.allclose(tsum[i0:], res["V2"]["gross"][i0:], atol=5e-6), "trade list != daily gross"
    lev3 = np.nan_to_num(res["V3"]["lev"])
    trades_out = dict(cols=["day", "entry_slot", "exit_slot", "side", "gross_bp_1x", "net_bp_1x", "lev_v3"],
                      rows=[[int(t[0] - i0), t[1], t[2], t[3], t[4], t[5], round(float(lev3[t[0]]), 3)] for t in tr])
    # permutation null
    null = dict(V2=[], V3=[], V1=[], diff21=[], entry30=[], hold=[], stop=[], V3_daily=[])
    for k in range(draws):
        rng = np.random.default_rng(E.SEED + 1000 * E.INSTRUMENTS.index(sym) + k)
        Zp = E.permute(Z, rng)
        Fp = E.features(Zp)
        r1 = E.run_variant(Zp, Fp, "V1", cost, False)
        r2 = E.run_variant(Zp, Fp, "V2", cost, False)
        r3 = E.run_variant(Zp, Fp, "V3", cost, True)
        null["V1"].append(sharpe(r1["net"][i0:]))
        null["V2"].append(sharpe(r2["net"][i0:]))
        null["V3"].append(sharpe(r3["net"][i0:]))
        null["diff21"].append(float((r2["net"][i0:] - r1["net"][i0:]).mean() * 1e4))
        pa, pb = decomposition(Zp, r2)
        pa, pb = pa[i0:], pb[i0:]
        null["entry30"].append(float(np.nanmean(pa) * 1e4))
        null["hold"].append(float(np.nanmean(pb) * 1e4))
        null["stop"].append(float(np.nanmean((r2["gross"][i0:] - np.nan_to_num(pb))[np.isfinite(pb)]) * 1e4))
        null["V3_daily"].append(np.round(r3["net"][i0:], 7))
    v3d = np.array(null.pop("V3_daily")) if draws else np.zeros((0, len(days)))
    out["null"] = {k: v for k, v in null.items()}
    out["null_pct"] = {}
    if draws:
        for v in ("V1", "V2", "V3"):
            out["null_pct"][v] = float((np.array(null[v]) < out["variants"][v]["sharpe"]).mean() * 100)
        for kk, real in (("entry30", dec["entry30_bp"]), ("hold", dec["hold_bp"]), ("stop", dec["stop_bp"])):
            out["null_pct"][kk] = float((np.array(null[kk]) < real).mean() * 100)
    # sample days for the day viewer
    sample = sample_days(Z, F, res, i0, days)
    print(f"{sym}: {len(days)} days, {draws} draws, {time.time() - t0:.0f}s", flush=True)
    return out, trades_out, sample, v3d, res, i0


def sample_days(Z, F, res, i0, days):
    dates = pd.to_datetime(Z["days"], unit="D").strftime("%Y-%m-%d")
    net3 = res["V3"]["net"]
    idx = set()
    for d in PAPER_EXAMPLES:
        w = np.nonzero(dates == d)[0]
        idx |= set(w.tolist())
    order = np.argsort(net3[i0:]) + i0
    idx |= set(order[:15].tolist()) | set(order[-15:].tolist())
    idx |= set(range(len(dates) - 25, len(dates)))
    rng = np.random.default_rng(E.SEED)
    idx |= set(rng.choice(np.arange(i0, len(dates)), 15, replace=False).tolist())
    out = []
    for d in sorted(idx):
        if d < i0:
            continue
        k = Z["uopen"][d] / Z["open"][d]  # show unadjusted price level
        lst = int(Z["last"][d]) + 1
        rr = lambda a: [None if not np.isfinite(x) else round(float(x * k), 2) for x in a[:lst]]
        out.append(dict(date=dates[d], src=int(Z["src"][d]), open=round(float(Z["open"][d] * k), 2),
                        prev=None if not np.isfinite(Z["prev"][d]) else round(float(Z["prev"][d] * k), 2),
                        close=rr(Z["close"][d]), ub=rr(F["ub"][d]), lb=rr(F["lb"][d]), vwap=rr(F["vwap"][d]),
                        pos=res["V2"]["P"][d].astype(int).tolist(),
                        pos1=res["V1"]["P"][d].astype(int).tolist(),
                        lev=round(float(np.nan_to_num(res["V3"]["lev"][d])), 3),
                        v2_bp=round(float(res["V2"]["net"][d] * 1e4), 2), v3_bp=round(float(net3[d] * 1e4), 2),
                        v1_bp=round(float(res["V1"]["net"][d] * 1e4), 2)))
    return out


# ----------------------------------------------------------------------------------------------- verdicts
def verdicts(inst, book):
    v = {}
    # P1
    cells = {}
    for s in ("ES", "NQ"):
        st = inst[s]["variants"]["V2"]
        cells[s] = dict(sharpe=st["sharpe"], ci=st["sharpe_ci"], mean_ci_bp=st["mean_ci_bp"],
                        null_pct=inst[s]["null_pct"].get("V2"), h1=st["sharpe_h1"], h2=st["sharpe_h2"],
                        passes=bool(inst[s]["null_pct"].get("V2", 0) > 97.5 and st["mean_ci_bp"][0] > 0
                                    and st["sharpe_h1"] > 0 and st["sharpe_h2"] > 0),
                        null_cell=bool(st["sharpe_ci"][1] < 0.62))
    p1 = "VALIDATED" if all(c["passes"] for c in cells.values()) else (
        "NULL" if all(c["null_cell"] for c in cells.values()) else "UNDERPOWERED")
    v["P1"] = dict(verdict=p1, cells=cells, bar="beat 97.5th pct of permutation null, mean CI > 0, both halves > 0; "
                                                "NULL if Sharpe CI upper < 0.62 on both")
    # P2
    b = book
    p2 = "VALIDATED" if (b["null_pct"] > 97.5 and b["sharpe_ci"][0] > 0 and b["h1"] > 0 and b["h2"] > 0) else (
        "NULL" if b["sharpe_ci"][1] < 0.66 else "UNDERPOWERED")
    v["P2"] = dict(verdict=p2, sharpe=b["sharpe"], ci=b["sharpe_ci"], null_pct=b["null_pct"], h1=b["h1"], h2=b["h2"])
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=200)
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    draws = {"ES": a.draws, "NQ": a.draws, "YM": a.draws // 2, "RTY": a.draws // 2}
    if a.quick:
        draws = {k: 3 for k in draws}
    inst, v3null, resall = {}, {}, {}
    for s in E.INSTRUMENTS:
        out, trades_out, sample, v3d, res, i0 = run_instrument(s, draws[s], None)
        inst[s] = out
        v3null[s] = (v3d, out["dates"])
        resall[s] = (res, i0)
        (E.OUT / f"trades_{s}.json").write_text(json.dumps(trades_out, separators=(",", ":")))
        (E.OUT / f"days_{s}.json").write_text(json.dumps(sample, separators=(",", ":")))
    # P2 book: equal-weight mean of available V3 daily net returns
    allday = sorted(set().union(*[set(inst[s]["dates"]) for s in E.INSTRUMENTS]))
    M = np.full((len(allday), 4), np.nan)
    pos = {d: i for i, d in enumerate(allday)}
    for j, s in enumerate(E.INSTRUMENTS):
        eq = np.array(inst[s]["equity"]["V3"])
        r = np.concatenate([[eq[0] - 1], eq[1:] / eq[:-1] - 1])
        M[[pos[d] for d in inst[s]["dates"]], j] = r
    br = np.nanmean(M, axis=1)
    bdays = pd.to_datetime(allday).values.astype("datetime64[D]").astype("int64")
    wk = week_ids(bdays)
    brng = np.random.default_rng(E.SEED + 7)
    bstat = summary(br, bdays)
    half = np.arange(len(br)) < len(br) // 2
    nd = min(len(v3null[s][0]) for s in E.INSTRUMENTS)
    bnull = []
    for k in range(nd):
        Mk = np.full_like(M, np.nan)
        for j, s in enumerate(E.INSTRUMENTS):
            Mk[[pos[d] for d in v3null[s][1]], j] = v3null[s][0][k]
        bnull.append(sharpe(np.nanmean(Mk, axis=1)))
    book = dict(sharpe=bstat["sharpe"], sharpe_ci=boot(br, wk, brng, sharpe), h1=sharpe(br[half]), h2=sharpe(br[~half]),
                null_pct=float((np.array(bnull) < bstat["sharpe"]).mean() * 100) if bnull else None, null=bnull,
                stats=bstat, equity=np.round(np.cumprod(1 + br), 5).tolist(), dates=allday, monthly=monthly(br, bdays))
    # P3: V2 - V1, ES and NQ pooled per day
    d21 = []
    for s in ("ES", "NQ"):
        res, i0 = resall[s]
        d21.append(pd.Series(res["V2"]["net"][i0:] - res["V1"]["net"][i0:], index=inst[s]["dates"]))
    dd = pd.concat(d21, axis=1).mean(axis=1)
    ddays = pd.to_datetime(dd.index).values.astype("datetime64[D]").astype("int64")
    dv = dd.to_numpy()
    ci = [x * 1e4 for x in boot(dv, week_ids(ddays), np.random.default_rng(E.SEED + 9), np.mean)]
    h = np.arange(len(dv)) < len(dv) // 2
    p3 = dict(mean_bp=float(dv.mean() * 1e4), ci_bp=ci, h1_bp=float(dv[h].mean() * 1e4), h2_bp=float(dv[~h].mean() * 1e4),
              bar_bp=0.35)
    p3["verdict"] = "VALIDATED" if (ci[0] > 0 and p3["h1_bp"] > 0 and p3["h2_bp"] > 0) else (
        "NULL" if ci[1] < 0.35 else "UNDERPOWERED")
    V = verdicts(inst, book)
    V["P3"] = p3
    # mechanics check: ES V3 monthly vs the paper's SPY table
    ours, paper, labels = [], [], []
    for y, row in PAPER.items():
        for mi, pv in enumerate(row):
            o = inst["ES"]["monthly"]["V3"].get(y, {}).get(mi + 1)
            if o is not None:
                ours.append(o)
                paper.append(pv)
                labels.append(f"{y}-{mi + 1:02d}")
    mech = dict(months=labels, ours=ours, paper=paper, corr=float(np.corrcoef(ours, paper)[0, 1]),
                corr_to_2024_04=float(np.corrcoef(ours[:100], paper[:100])[0, 1]),
                yearly={y: dict(ours=float(np.prod(1 + np.array([inst["ES"]["monthly"]["V3"].get(y, {}).get(m + 1, 0)
                                                                  for m in range(len(r))]) / 100) - 1),
                                paper=float(np.prod(1 + np.array(r) / 100) - 1)) for y, r in PAPER.items()})
    results = dict(study="noise-area-momentum", seed=E.SEED, lockbox_end=str(E.LOCKBOX_END.date()),
                   prereg="forge/NOISE_AREA_MOMENTUM_PREREG.md", draws=draws, verdicts=V, mechanics=mech,
                   control=json.loads((E.OUT / "control.json").read_text()),
                   instruments={s: {k: inst[s][k] for k in ("start", "end", "n_days", "cfd_days", "variants", "bh",
                                                            "null_pct", "decomposition", "by_year", "vol_regime",
                                                            "time_of_day")} for s in E.INSTRUMENTS},
                   book={k: book[k] for k in ("sharpe", "sharpe_ci", "h1", "h2", "null_pct", "stats")})
    (E.OUT / "results.json").write_text(json.dumps(results, indent=1, default=float))
    site = dict(meta=dict(generated=pd.Timestamp.now().strftime("%Y-%m-%d"), variants=VARIANTS, costs=E.COST_RT_PTS,
                          checks=["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00",
                                  "14:30", "15:00", "15:30", "16:00"]),
                verdicts=V, mechanics=mech, control=results["control"],
                instruments={s: {k: inst[s][k] for k in inst[s] if k not in ("equity", "monthly")} for s in E.INSTRUMENTS},
                book={k: book[k] for k in ("sharpe", "sharpe_ci", "h1", "h2", "null_pct", "stats", "equity", "dates",
                                           "monthly", "null")})
    (E.OUT / "site.json").write_text(json.dumps(site, separators=(",", ":"), default=float))
    print(json.dumps(dict(verdicts=V, mech_corr=mech["corr"]), indent=1, default=float))


if __name__ == "__main__":
    main()
