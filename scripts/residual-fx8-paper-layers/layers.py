"""residual-fx8-paper-layers (EXPLORATORY, not pre-registered).

Owner 2026-11-23: build the basic FX8 residual book, then layer each research paper's idea on top
and see whether it gets better or worse.

Every rule below was fixed in this header before any variant result was computed. The base was
itself chosen on this same 2016-26 history (residual-pca-stops), so nothing here is out of sample:
every number is exploratory. The frozen forward record (residual-fx8-forward) is never touched.

DATA  analysis/output/residual-pca-family/panel_daily.csv: 17:00 NY daily closes, 7 USD pairs,
      2016-01 -> 2026-08-20 (lockbox untouched). FX8 = USD EUR GBP AUD NZD JPY CAD CHF. NOK and SEK
      are not in the panel, so this is FX8, not the full G10.
      Rates: FRED OECD 3-month interbank, monthly (analysis/output/cot-crowding-programme/
      macro_IR3TIB01*). Point-in-time: month M's value is used only from the first day of M+2.
      EZ for EUR, US for USD.

BASE  The residual-pca-stops threshold book, unchanged: engine.walk (window 120, K = 2 by the
      noise-band rule on the IS half, inverse-vol weights, project out the K loadings and the ones
      vector, gross 1, house spread costs). Trade per currency: enter when |z| >= 1.5 (direction
      -sign z), exit at the first close where z has changed sign, one trade at a time.
      Asserted: reproduces net Sharpe IS 0.432 / OOS 0.378.

LAYERS (entry gates: a blocked day opens no new trade; open trades run to their normal exit)
  V    Global FX volatility (Menkhoff, Sarno, Schmeling & Schrimpf 2012, "Carry trades and global
       FX volatility"). gv[t] = mean over the 7 pairs of the 20-day std of daily log returns.
       Block new entries when gv[t] is at or above the 80th percentile of the prior 252 days.
  M    Momentum guard (Menkhoff et al. 2012 "Currency momentum strategies"; Asness, Moskowitz &
       Pedersen 2013). mom[t,i] = sum of the basket return x over t-62..t. Block an entry that
       fades a currency ranked top 2 or bottom 2 of the 8 by mom when the trade is against its
       momentum sign.
  VAL  Value guard (Rogoff 1996 PPP; AMP 2013 value). val[t,i] = -(sum of x over t-755..t)
       (cheap = fell over ~3 years; nominal proxy, no CPI). Block an entry whose direction
       disagrees with sign(val - cross-sectional median). Before 756 days of history: no block.
  C    Carry guard (Lustig, Roussanov & Verdelhan 2011). cd[t,i] = rate_i - cross-sectional mean
       rate (pp, point-in-time). Block an entry where direction * cd < 0 (the trade pays carry).
  AL   Avellaneda & Lee 2010 entry/exit: enter |z| >= 1.25, exit when z changes sign or
       |z| <= 0.5. (Their s-score is an OU fit; ours is the cumulative-path z, an approximation.)
  NN   Factor-neutral OFF (ablation for Lustig et al. 2011 / Verdelhan 2018): weights are only
       made basket-neutral (ones vector), the K loadings are not projected out.

STACK base -> +V -> +V+M -> +V+M+VAL -> +V+M+VAL+C (the order ranked in chat before running).

P&L   daily net = gross - spread cost (as base). Also reported: net + carry, where
      carry[t] = sum_i w_i * rate_i / 100 / 252 over the 8 currencies including USD (sum w = 0,
      so this is the rate differential the book earns or pays; ignores broker financing markup).
      Halves: split at the middle P&L day, as residual-pca-stops.

STATS Sharpe (annualised, 252), ann. return, max DD, trades, share of days with a position.
      Difference vs base: moving-block bootstrap on days, block 21, B 2000, seed 20261123,
      90% interval for the Sharpe difference. "Better" needs the difference > 0 in BOTH halves
      AND the full-sample 90% interval above 0. Six single layers are tried, so expect about one
      to look good by chance.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "residual-pca-family"))
import engine as E  # noqa: E402
import tags as T  # noqa: E402

OUT = os.path.join(T.ROOT, "analysis/output/residual-fx8-paper-layers")
SEED, B, BLOCK = 20261123, 2000, 21
RATE_IDS = {"USD": "US", "EUR": "EZ", "GBP": "GB", "AUD": "AU", "NZD": "NZ", "JPY": "JP", "CAD": "CA", "CHF": "CH"}


# ---------------------------------------------------------------- inputs
def rates(index):
    out = pd.DataFrame(index=index, columns=T.FX8, dtype=float)
    for c, k in RATE_IDS.items():
        d = pd.read_csv(os.path.join(T.ROOT, f"analysis/output/cot-crowding-programme/macro_IR3TIB01{k}M156N.csv"))
        d.columns = ["date", "v"]
        s = pd.Series(pd.to_numeric(d.v, errors="coerce").values, index=pd.to_datetime(d.date)).dropna()
        s.index = s.index + pd.DateOffset(months=2)          # month M usable from day 1 of M+2
        out[c] = s.reindex(index, method="ffill").values
    return out


def gates(x, r, disp_index):
    idx = disp_index
    pairs = T.load_panel()[[v[0] for v in T.CCY_PAIR.values()]].dropna()
    lr = np.log(pairs).diff().dropna()
    gv = lr.rolling(20).std().mean(axis=1)
    pct = gv.rolling(253).apply(lambda a: (a[:-1] < a[-1]).mean() if np.isfinite(a).all() else np.nan, raw=True)
    V = (pct.reindex(idx) < 0.80).fillna(True)                 # True = entries allowed

    mom = x.rolling(63).sum().reindex(idx)
    rk = mom.rank(axis=1)
    extreme = (rk <= 2) | (rk >= 7)
    msign = np.sign(mom)

    val = -x.rolling(756).sum().reindex(idx)
    vsign = np.sign(val.sub(val.median(axis=1), axis=0))

    rt = rates(idx)
    cd = rt.sub(rt.mean(axis=1), axis=0)
    return {"V": V, "msign": msign, "extreme": extreme, "vsign": vsign, "cd": cd, "rates": rt, "gv_pct": pct}


def allow_fn(G, layers):
    """Returns allow(t, i, d) for the entry gate."""
    V = G["V"].values
    ex, ms, vs, cd = G["extreme"].values, G["msign"].values, G["vsign"].values, G["cd"].values

    def allow(t, i, d):
        if "V" in layers and not V[t]:
            return False
        if "M" in layers and ex[t, i] and np.isfinite(ms[t, i]) and d != ms[t, i]:
            return False
        if "VAL" in layers and np.isfinite(vs[t, i]) and vs[t, i] != 0 and d != vs[t, i]:
            return False
        if "C" in layers and np.isfinite(cd[t, i]) and d * cd[t, i] < 0:
            return False
        return True
    return allow


# ---------------------------------------------------------------- trades and book
def trade_mask(disp, allow, entry=1.5, exit_abs=None, episodes=None):
    D = disp.values
    n, m = D.shape
    mask = np.zeros((n, m), dtype=bool)
    trades = 0
    for i in range(m):
        z0 = None
        t0 = None
        for t in range(n):
            z = D[t, i]
            if z0 is not None:
                if np.sign(z) != np.sign(z0) or (exit_abs is not None and abs(z) <= exit_abs):
                    if episodes is not None:
                        episodes.append({"i": i, "t0": t0, "t1": t, "z0": float(z0), "z1": float(z), "open": False})
                    z0 = None
            if z0 is None and abs(z) >= entry and allow(t, i, int(-np.sign(z))):
                z0 = z
                t0 = t
                trades += 1
            if z0 is not None:
                mask[t, i] = True
        if z0 is not None and episodes is not None:
            episodes.append({"i": i, "t0": t0, "t1": n - 1, "z0": float(z0), "z1": float(D[n - 1, i]), "open": True})
    return pd.DataFrame(mask, index=disp.index, columns=disp.columns), trades


def walk_w(x, r, K, mask, neutral=True):
    """engine.walk with the mask, also returning the weights (for carry) and allowing NN."""
    X, R = x.values, r.values
    n, m = X.shape
    ones = np.ones(m)
    cvec = np.array([T.COST[c] / 100.0 / 2.0 for c in x.columns])
    M = mask.reindex(index=x.index, columns=x.columns).fillna(False).values
    w_prev = np.zeros(m)
    recs, W, sig = [], [], []
    for t in range(E.WINDOW - 1, n - 1):
        win = X[t - E.WINDOW + 1: t + 1]
        Z, mu, sd = E.std_window(win)
        _, V = E.eig_desc(Z)
        VK = V[:, :K]
        res = Z - Z @ (VK @ VK.T)
        c = np.cumsum(res, axis=0)
        disp = (c[-1] - c.mean(axis=0)) / c.std(axis=0, ddof=1)
        target = -disp
        target[np.abs(disp) < E.DEAD_BAND] = 0.0
        target = np.clip(target, -E.CAP, E.CAP)
        target = np.where(M[t], target, 0.0)
        w = target / sd
        Bm = np.column_stack([sd[:, None] * VK, ones]) if neutral else ones[:, None]
        w = w - Bm @ np.linalg.lstsq(Bm, w, rcond=None)[0]
        g = np.abs(w).sum()
        w = w / g if g > 0 else w
        to = np.abs(w - w_prev)
        cost = float(to @ cvec)
        gross = float(w @ R[t + 1])
        recs.append({"date": x.index[t + 1], "gross": gross, "cost": cost, "net": gross - cost})
        W.append(w)
        sig.append(x.index[t])
        w_prev = w
    rec = pd.DataFrame(recs).set_index("date")
    Wd = pd.DataFrame(W, index=sig, columns=x.columns)
    return rec, Wd


def add_carry(rec, Wd, rt):
    rr = rt.reindex(Wd.index).ffill()[Wd.columns].values / 100.0 / 252.0
    carry = np.nansum(Wd.values * rr, axis=1)
    rec = rec.copy()
    rec["carry"] = carry
    rec["net_carry"] = rec.net + rec.carry
    return rec


# ---------------------------------------------------------------- stats
def sh(a):
    a = np.asarray(a)
    return float(a.mean() / a.std() * np.sqrt(252)) if a.std() > 0 else np.nan


def summary(rec, trades, mask, col):
    h = len(rec) // 2
    out = {"trades": trades, "share_days_in_position": round(float(mask.any(axis=1).mean()), 3)}
    for lab, s in [("IS", rec[col].iloc[:h]), ("OOS", rec[col].iloc[h:]), ("full", rec[col])]:
        out[lab] = E.perf(s)
    return out


def diff_boot(a, b, rng):
    """Sharpe(a) - Sharpe(b) on the same days: point, halves, block-bootstrap 90% interval."""
    a, b = np.asarray(a), np.asarray(b)
    n = len(a)
    h = n // 2
    vals = np.empty(B)
    for k in range(B):
        ix = E.block_starts(n, BLOCK, rng)
        vals[k] = sh(a[ix]) - sh(b[ix])
    lo, hi = np.nanpercentile(vals, [5, 95])
    d_is, d_oos = sh(a[:h]) - sh(b[:h]), sh(a[h:]) - sh(b[h:])
    better = bool(d_is > 0 and d_oos > 0 and lo > 0)
    worse = bool(d_is < 0 and d_oos < 0 and hi < 0)
    return {"d_full": round(sh(a) - sh(b), 3), "d_IS": round(d_is, 3), "d_OOS": round(d_oos, 3),
            "ci90": [round(float(lo), 3), round(float(hi), 3)],
            "call": "better" if better else "worse" if worse else "no clear change"}


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(SEED)
    r = T.universe("fx8")
    x = E.basket(r)
    n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
    K, _, _ = E.choose_k(x, n_is)
    disp, _, _ = E.walk(x, r, K, T.COST)
    G = gates(x, r, disp.index)

    variants = {
        "base": ([], 1.5, None, True),
        "+V global FX vol": (["V"], 1.5, None, True),
        "+M momentum guard": (["M"], 1.5, None, True),
        "+VAL value guard": (["VAL"], 1.5, None, True),
        "+C carry guard": (["C"], 1.5, None, True),
        "+AL Avellaneda-Lee entry/exit": ([], 1.25, 0.5, True),
        "NN factor-neutral off": ([], 1.5, None, False),
        "stack V+M": (["V", "M"], 1.5, None, True),
        "stack V+M+VAL": (["V", "M", "VAL"], 1.5, None, True),
        "stack V+M+VAL+C": (["V", "M", "VAL", "C"], 1.5, None, True),
    }
    recs, res, site_trades = {}, {}, {}
    xnext = x.shift(-1)   # leg P&L vs the basket: sum w*x = sum w*r because sum w = 0, and USD gets its share
    for name, (lay, ent, ex, neu) in variants.items():
        eps = []
        mask, ntr = trade_mask(disp, allow_fn(G, lay), entry=ent, exit_abs=ex, episodes=eps)
        rec, Wd = walk_w(x, r, K, mask, neutral=neu)
        rec = add_carry(rec, Wd, G["rates"])
        recs[name] = rec
        site_trades[name] = trade_records(eps, disp, Wd, xnext, G)
        res[name] = {"net": summary(rec, ntr, mask, "net"), "net_carry": summary(rec, ntr, mask, "net_carry"),
                     "carry_ann_pct": round(float(rec.carry.mean() * 252 * 100), 3)}
        if name == "base":
            # reproduction check against residual-pca-stops threshold book
            n_ = res[name]["net"]
            assert abs(n_["IS"]["sharpe"] - 0.432) < 0.002 and abs(n_["OOS"]["sharpe"] - 0.378) < 0.002, n_
        print(f"{name:32s} net IS {res[name]['net']['IS']['sharpe']:+.3f} OOS {res[name]['net']['OOS']['sharpe']:+.3f}"
              f" | +carry IS {res[name]['net_carry']['IS']['sharpe']:+.3f} OOS {res[name]['net_carry']['OOS']['sharpe']:+.3f}"
              f" | trades {ntr}")
    base = recs["base"]
    for name in variants:
        if name == "base":
            continue
        for col in ("net", "net_carry"):
            res[name][f"vs_base_{col}"] = diff_boot(recs[name][col].values, base[col].values, rng)
    stack_prev = {"stack V+M": "+V global FX vol", "stack V+M+VAL": "stack V+M", "stack V+M+VAL+C": "stack V+M+VAL"}
    for name, prev in stack_prev.items():
        res[name]["vs_previous_step_net"] = diff_boot(recs[name].net.values, recs[prev].net.values, rng)

    meta = {"label": "EXPLORATORY, not pre-registered", "seed": SEED, "B": B, "block": BLOCK, "K": K,
            "first_pnl_day": str(base.index[0].date()), "oos_start": str(base.index[len(base) // 2].date()),
            "last_pnl_day": str(base.index[-1].date()), "universe": "FX8 (NOK, SEK not in panel)"}
    json.dump({"meta": meta, "variants": res}, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    pd.DataFrame({k: v.net_carry for k, v in recs.items()}).to_csv(os.path.join(OUT, "daily_net_carry.csv"),
                                                                   float_format="%.7f")
    pd.DataFrame({k: v.net for k, v in recs.items()}).to_csv(os.path.join(OUT, "daily_net.csv"), float_format="%.7f")
    write_site(meta, res, recs, site_trades, disp, x, G, variants)
    print(json.dumps(meta))


# ---------------------------------------------------------------- site export (residual-fx8-paper-layers.html)
def trade_records(eps, disp, Wd, xnext, G):
    """One row per trade. Leg P&L = sum over the trade's days of w[t, ccy] * x[t+1, ccy] (x = return
    vs the 8-currency basket; sum_i w_i x_i = sum_i w_i r_i since sum w = 0): the contribution of
    that currency's leg to the gross-1 book, in bp (spread cost and carry are
    booked at book level, not per leg). MAE / MFE = worst / best running leg P&L in the trade."""
    W = Wd.reindex(disp.index).values
    RN = xnext.reindex(disp.index).values
    idx = disp.index
    cd = G["cd"].values
    out = []
    for e in eps:
        i, t0, t1 = e["i"], e["t0"], e["t1"]
        days = t1 - t0
        if days <= 0:
            continue
        legs = W[t0:t1, i] * RN[t0:t1, i] * 1e4
        legs = np.nan_to_num(legs)
        cum = np.cumsum(legs)
        out.append({"ccy": disp.columns[i], "dir": int(-np.sign(e["z0"])),
                    "entry": str(idx[t0].date()), "exit": str(idx[t1].date()), "days": int(days),
                    "z0": round(e["z0"], 2), "z1": round(e["z1"], 2),
                    "pnl_bp": round(float(cum[-1]), 2), "mae_bp": round(float(min(0.0, cum.min())), 2),
                    "mfe_bp": round(float(max(0.0, cum.max())), 2),
                    "carry_pp": None if not np.isfinite(cd[t0, i]) else round(float(-np.sign(e["z0"]) * cd[t0, i]), 2),
                    "open": e["open"]})
    out.sort(key=lambda d: d["entry"])
    return out


def write_site(meta, res, recs, site_trades, disp, x, G, variants):
    dates = [str(d.date()) for d in recs["base"].index]
    series = {k: {"net": [round(v * 1e4, 3) for v in rec.net.values],
                  "net_carry": [round(v * 1e4, 3) for v in rec.net_carry.values],
                  "gross": [round(v * 1e4, 3) for v in rec.gross.values],
                  "cost": [round(v * 1e4, 3) for v in rec.cost.values],
                  "carry": [round(v * 1e4, 3) for v in rec.carry.values]} for k, rec in recs.items()}
    idx = disp.index
    level = (np.exp(x.cumsum()) * 100).reindex(idx)
    ccy = {c: {"level": [round(float(v), 3) for v in level[c].values],
               "z": [round(float(v), 3) for v in disp[c].values]} for c in disp.columns}
    gv = G["gv_pct"].reindex(idx)
    defs = {k: {"layers": v[0], "entry": v[1], "exit_abs": v[2], "neutral": v[3]} for k, v in variants.items()}
    site = {"meta": meta, "variants": res, "defs": defs, "dates": dates, "series_bp": series,
            "trades": site_trades, "sig_dates": [str(d.date()) for d in idx], "ccy": ccy,
            "gv_pct": [None if not np.isfinite(v) else round(float(v), 3) for v in gv.values]}
    with open(os.path.join(OUT, "site.json"), "w") as f:
        json.dump(site, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
