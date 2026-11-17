"""Run noise-area-fx-book: 16 FX/gold cells (F), the 21-stream book (P) and the described tables. Seed 20261117.

    NAM_DATA=<main checkout> python scripts/noise-area-fx-book/run.py
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

import fx as F

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "noise-area-build"))
import scan as S  # noqa: E402  (also imports the parent engine as S.E)

SEED = 20261117
B = 2000
NPERM = 100
rng = np.random.default_rng(SEED)
F.OUT.mkdir(parents=True, exist_ok=True)
WIN0, WIN1 = pd.Timestamp("2016-11-21"), pd.Timestamp("2026-08-21")
USD_SIGN = {"eurusd": -1, "gbpusd": -1, "audusd": -1, "nzdusd": -1, "usdjpy": 1, "usdcad": 1, "usdchf": 1}
NAME = {"eurusd": "EURUSD", "gbpusd": "GBPUSD", "usdjpy": "USDJPY", "audusd": "AUDUSD", "usdcad": "USDCAD",
        "usdchf": "USDCHF", "nzdusd": "NZDUSD", "gold": "Gold"}


def r2(x, k=2):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def ci(a):
    return [r2(np.percentile(a, 2.5)), r2(np.percentile(a, 97.5))]


def shp(x):
    x = np.asarray(x, float)
    s = x.std(ddof=1)
    return float(x.mean() / s * np.sqrt(252)) if s > 0 else 0.0


def mdd(x):
    e = np.cumprod(1 + np.asarray(x, float))
    return float((e / np.maximum.accumulate(e) - 1).min())


def boot1(x, dates):
    """week-cluster bootstrap of (sharpe, mean) for one stream."""
    out = S.boot(np.asarray(x, float)[None, :], S.week_ids(np.asarray(dates).astype("datetime64[D]")), rng,
                 lambda mu, sd: np.column_stack([mu / sd * np.sqrt(252), mu]))
    return out[:, 0], out[:, 1]


t0 = time.time()
summary = {"seed": SEED, "prereg": "forge/NOISE_AREA_FX_BOOK_PREREG.md", "cells": {}, "equity": {}}
streams, gross_streams, lev_streams, bh_streams, units_streams, dirs = {}, {}, {}, {}, {}, {}
trades_out = {}
pvals = {}

# ------------------------------------------------------------------ F: 16 FX / gold cells
for sym in F.FX:
    for sess in F.SESSIONS:
        key = f"{NAME[sym]} {sess}"
        Z = F.build(sym, sess)
        R = F.run(Z)
        dates = pd.to_datetime(Z["days"].astype("datetime64[D]"))
        m = (dates >= WIN0) & (dates <= WIN1)
        net, gross = R["net"][m], R["gross"][m]
        dts = dates[m]
        b_sh, b_mu = boot1(net, dts.to_numpy())
        nh = len(net) // 2
        perm = []
        for _ in range(NPERM):
            Rp = F.run(F.permute(Z, rng))
            perm.append(shp(Rp["net"][m]))
        perm = np.array(perm)
        rng_sess = (np.nanmax(Z["high"], 1) - np.nanmin(Z["low"], 1)) / Z["open"]
        spr_bp = np.nanmedian(Z["spr"][:, R["ck"]] / Z["open"][:, None]) * 1e4
        gate = float(np.nanmedian(Z["spr"][:, R["ck"]] / Z["open"][:, None]) / np.nanmean(rng_sess))
        sh = shp(net)
        pvals[key] = (np.sum(b_mu <= 0) + 1) / (B + 1)
        cell = dict(sym=NAME[sym], session=sess, days=int(m.sum()), start=str(dts[0].date()), end=str(dts[-1].date()),
                    net_sharpe=r2(sh), net_ci=ci(b_sh), mean_bp=r2(net.mean() * 1e4), mean_bp_ci=ci(b_mu * 1e4),
                    halves=[r2(shp(net[:nh])), r2(shp(net[nh:]))], gross_sharpe=r2(shp(gross)),
                    gross_bp=r2(gross.mean() * 1e4), cost_bp=r2(R["cost"][m].mean() * 1e4),
                    trades_day=r2(R["units"][m].mean() / 2), spread_bp=r2(spr_bp), gate=r2(gate, 3),
                    null_pct=r2(np.mean(perm < sh) * 100, 1), null_p975=r2(np.percentile(perm, 97.5)),
                    v3_sharpe=r2(shp((R["net"] * R["lev"])[m])), mdd=r2(mdd(net) * 100, 1),
                    p=r2(pvals[key], 4))
        summary["cells"][key] = cell
        streams[key] = pd.Series(R["net"], index=dates)
        gross_streams[key] = pd.Series(R["gross"], index=dates)
        lev_streams[key] = pd.Series(R["lev"], index=dates)
        bh_streams[key] = pd.Series(R["bh"], index=dates)
        units_streams[key] = pd.Series(R["units"], index=dates)
        if sym in USD_SIGN:
            dirs[key] = pd.Series(np.sign(R["P"].sum(1)) * USD_SIGN[sym], index=dates)
        tz, m0, N = F.SESSIONS[sess]
        hm = lambda b: f"{(m0 + b + 1) // 60:02d}:{(m0 + b + 1) % 60:02d}"
        trades_out[key] = [[str(dates[t[0]].date()), hm(t[1]), hm(t[2]), t[3], t[4], t[5], t[6]]
                           for t in F.trades(Z, R) if WIN0 <= dates[t[0]] <= WIN1]
        print(f"{key:12s} net {sh:+.2f} {cell['net_ci']} gross {cell['gross_sharpe']:+.2f} ({cell['gross_bp']:+.2f} bp "
              f"vs cost {cell['cost_bp']:.2f}) halves {cell['halves']} null {cell['null_pct']}% gate {gate:.3f} "
              f"{time.time() - t0:.0f}s", flush=True)

keys = list(summary["cells"])
bhp = dict(zip(keys, S.bh([pvals[k] for k in keys])))
for k in keys:
    c = summary["cells"][k]
    if bhp[k] and c["mean_bp_ci"][0] > 0 and min(c["halves"]) > 0 and c["null_pct"] >= 97.5:
        v = "VALIDATED"
    elif c["net_ci"][1] < 0.50:
        v = "NULL"
    else:
        v = "UNDERPOWERED"
    c["verdict"], c["bh"] = v, bool(bhp[k])
vs = [summary["cells"][k]["verdict"] for k in keys]
summary["F_headline"] = "VALIDATED" if "VALIDATED" in vs else "NULL" if all(v == "NULL" for v in vs) else "UNDERPOWERED"
print("F headline", summary["F_headline"], {v: vs.count(v) for v in set(vs)})

# ------------------------------------------------------------------ equity streams (paper rule V2, realistic costs)
for sym in S.INSTR:
    Z = S.E.build_days(sym)
    C, O, last = Z["close"], Z["open"], Z["last"]
    sig = S.E.sigma_open(C, O, last, 14)
    hi, lo = np.fmax(O, Z["prev"]), np.fmin(O, Z["prev"])
    ck = S.checks_for(30)
    P = S.positions(C, hi[:, None] * (1 + sig), lo[:, None] * (1 - sig), S.E.vwap(C, Z["high"], Z["low"], Z["vol"]),
                    last, ck, "vwap")
    g, c, u = S.day_pnl(Z, P, ck, S.COST[sym])
    sd, bh = S.E.daily_sigma(C, last, Z["prev"])
    dates = pd.to_datetime(Z["days"].astype("datetime64[D]"))
    streams[sym] = pd.Series(g - c, index=dates)
    gross_streams[sym] = pd.Series(g, index=dates)
    lev_streams[sym] = pd.Series(np.nan_to_num(np.minimum(4.0, 0.02 / sd)), index=dates)
    bh_streams[sym] = pd.Series(np.nan_to_num(bh), index=dates)
    units_streams[sym] = pd.Series(u, index=dates)
    mm = (dates >= WIN0) & (dates <= WIN1)
    summary["equity"][sym] = dict(net_sharpe=r2(shp((g - c)[mm])), gross_sharpe=r2(shp(g[mm])), days=int(mm.sum()))

# ------------------------------------------------------------------ P: the book
idx = pd.DatetimeIndex(sorted(set().union(*[s.index for s in streams.values()])))
idx = idx[(idx >= WIN0) & (idx <= WIN1)]
RAW = pd.DataFrame({k: s.reindex(idx).fillna(0.0) for k, s in streams.items()})


def scale(x, target=0.10):
    vol = (x.rolling(60, min_periods=40).std().shift(1) * np.sqrt(252)).replace(0.0, np.nan)
    return (x * (target / vol)).fillna(0.0)


SC = RAW.apply(scale)


def book(cols):
    b = SC[cols].mean(axis=1)
    return scale(b)


fx_cols = keys
eq_cols = list(S.INSTR)
books = {"All 21 systems": book(fx_cols + eq_cols), "FX + gold (16)": book(fx_cols), "US equity (5)": book(eq_cols)}
start = idx[80]
spy = bh_streams["SPY"].reindex(idx).fillna(0.0)
core = spy + books["All 21 systems"]
summary_book = {}
for name, x in list(books.items()) + [("SPY + book overlay", core), ("SPY buy & hold", spy)]:
    x = x[x.index >= start]
    bs, bm = boot1(x.to_numpy(), x.index.to_numpy())
    nh = len(x) // 2
    yr = (1 + x).groupby(x.index.year).prod() - 1
    summary_book[name] = dict(sharpe=r2(shp(x)), sharpe_ci=ci(bs), mean_bp=r2(x.mean() * 1e4), mean_bp_ci=ci(bm * 1e4),
                              halves=[r2(shp(x[:nh])), r2(shp(x[nh:]))], cagr=r2(((1 + x).prod() ** (252 / len(x)) - 1) * 100, 1),
                              vol=r2(x.std() * np.sqrt(252) * 100, 1), mdd=r2(mdd(x) * 100, 1),
                              worst_year=r2(yr.min() * 100, 1), years={str(k): r2(v * 100, 1) for k, v in yr.items()})
P = summary_book["All 21 systems"]
P["verdict"] = ("VALIDATED" if P["mean_bp_ci"][0] > 0 and min(P["halves"]) > 0
                else "NULL" if P["sharpe_ci"][1] < 0.50 else "UNDERPOWERED")
summary["book"] = summary_book
summary["P_verdict"] = P["verdict"]
summary["book_window"] = [str(start.date()), str(idx[-1].date())]

# leave one stream out
loo = {}
allc = fx_cols + eq_cols
for k in allc:
    x = book([c for c in allc if c != k])
    loo[k] = r2(shp(x[x.index >= start]))
summary["leave_one_out"] = loo

# correlations, positions per day, USD netting
w = RAW[RAW.index >= start]
cm = w.corr()
summary["corr"] = {"names": allc, "m": [[r2(cm.loc[a, b]) for b in allc] for a in allc]}
off = cm.where(~np.eye(len(allc), dtype=bool)).stack()
summary["avg_pair_corr"] = r2(off.mean(), 3)
U = pd.DataFrame({k: s.reindex(idx).fillna(0) for k, s in units_streams.items()})
U = U[U.index >= start]
active = (U > 0).sum(axis=1)
summary["positions_per_day"] = dict(mean=r2(active.mean()), median=int(active.median()), max=int(active.max()),
                                    dist={str(i): int((active == i).sum()) for i in range(int(active.max()) + 1)})
Dd = pd.DataFrame({k: s.reindex(idx).fillna(0) for k, s in dirs.items()})
Dd = Dd[Dd.index >= start]
pair = Dd.T.groupby(lambda c: c.split()[0]).sum().T.clip(-1, 1)  # LDN + NY of the same pair, capped at 1 unit
gross_usd = pair.abs().sum(axis=1)
net_usd = pair.sum(axis=1).abs()
two = gross_usd >= 2
summary["usd_netting"] = dict(days_with_2plus_fx_legs=int(two.sum()), offset_share=r2(1 - net_usd[two].sum() / gross_usd[two].sum(), 3),
                              all_same_direction_share=r2(float((net_usd[two] == gross_usd[two]).mean()), 3))
summary["runtime_s"] = int(time.time() - t0)
(F.OUT / "results.json").write_text(json.dumps(summary, indent=1))

# ------------------------------------------------------------------ page data
out_idx = idx[idx >= start - pd.Timedelta(days=0)]
pg = dict(dates=[str(d.date()) for d in idx], start=str(start.date()),
          streams={k: np.round(RAW[k].to_numpy(), 6).tolist() for k in allc},
          gross={k: np.round(gross_streams[k].reindex(idx).fillna(0).to_numpy(), 6).tolist() for k in allc},
          lev={k: np.round(lev_streams[k].reindex(idx).fillna(0).to_numpy(), 3).tolist() for k in allc},
          bh={k: np.round(bh_streams[k].reindex(idx).fillna(0).to_numpy(), 6).tolist() for k in allc},
          units={k: U.reindex(idx).fillna(0)[k].astype(int).tolist() if k in U else [] for k in allc},
          books={k: np.round(v.to_numpy(), 6).tolist() for k, v in list(books.items()) + [("SPY + book overlay", core), ("SPY buy & hold", spy)]},
          active=active.reindex(idx).fillna(0).astype(int).tolist())
(F.OUT / "streams.json").write_text(json.dumps(pg, separators=(",", ":")))
(F.OUT / "trades_fx.json").write_text(json.dumps(dict(cols=["date", "entry", "exit", "side", "gross_bp", "net_bp", "lev_v3"],
                                                      trades=trades_out), separators=(",", ":")))
for n, b in summary_book.items():
    print(f"{n:22s} Sharpe {b['sharpe']} {b['sharpe_ci']} CAGR {b['cagr']}% vol {b['vol']}% MDD {b['mdd']}% halves {b['halves']}")
print("P", summary["P_verdict"], "avg pair corr", summary["avg_pair_corr"], "positions/day", summary["positions_per_day"]["mean"],
      "usd offset", summary["usd_netting"], "done", summary["runtime_s"], "s")
