"""residual-fx8-forward: the nightly paper record of the frozen FX8 residual threshold book.

Prereg: forge/RESIDUAL_FX8_FORWARD_PREREG.md (registered 2026-11-12 in 4a2bf1c7, before any forward outcome existed).

The model is NOT re-implemented in spirit: the per-day maths below mirrors scripts/residual-pca-family/engine.py walk()
line for line, the trade rule IS scripts/residual-pca-stops/stops.py episodes_C (no stop), and `--check` asserts that
this file reproduces the residual-pca-stops threshold book (net Sharpe IS 0.432 / OOS 0.378) on panel_daily.csv
before anything is recorded.

  python scripts/residual-fx8-forward/record.py --check     # reproduction assert only (no OANDA, no forward data)
  python scripts/residual-fx8-forward/record.py             # log financing, rebuild, append new days, write summary
  python scripts/residual-fx8-forward/record.py --push      # ... and POST the summary to KV residual_fx8_forward_v1

Files (analysis/output/residual-fx8-forward/, gitignored: a live record rewritten by a laptop task):
  record.csv         one append-only row per forward day; each row carries sha256(previous row's hash + this row)
  financing_log.csv  OANDA long/short financing rate per pair, logged at each run (cannot be fetched later)
  discrepancies.log  a recorded row that the rebuild no longer reproduces (e.g. a revised candle); never auto-edited
  summary.json       what the page shows (also pushed to KV)
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "residual-pca-family"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "residual-pca-stops"))
import engine as E  # noqa: E402
import tags as T  # noqa: E402
import stops as S  # noqa: E402

OUT = os.path.join(ROOT, "analysis", "output", "residual-fx8-forward")
RECORD = os.path.join(OUT, "record.csv")
FINLOG = os.path.join(OUT, "financing_log.csv")
DISC = os.path.join(OUT, "discrepancies.log")
SUMMARY = os.path.join(OUT, "summary.json")
BASE = "https://macrofxmodel-production.up.railway.app"
KV_KEY = "residual_fx8_forward_v1"

# ---- frozen by the prereg (section 3) ----
K = 2
ENTRY = S.ENTRY                                   # 1.5
FX8 = T.FX8                                       # USD EUR GBP AUD NZD JPY CAD CHF
PAIRS = {c: T.CCY_PAIR[c] for c in FX8 if c != "USD"}   # currency -> (pair, sign)
COST = T.COST
HISTORY_FROM = "2025-06-01"                       # price inputs only (window + trade state)
STATE_FROM = pd.Timestamp("2026-01-02")           # trade state built from z only from here
FIRST_SIGNAL = pd.Timestamp("2026-11-12")         # first signal close of the forward record
BACKTEST = {"IS_net_sharpe": 0.432, "OOS_net_sharpe": 0.378, "OOS_net_sharpe_2x": 0.271,
            "worst_half_max_dd_pct": -3.53, "ann_vol_pct": 2.23, "turnover": 0.1995,
            "c_trade_median_res_sd": 1.66, "c_trade_median_hold_days": 28}
KILL = {"R1_max_dd_pct": -7.0, "R2_date": "2027-11-12", "R2_sharpe_floor": -1.27, "judge_date": "2028-11-13",
        "F2_backtest_sharpe": 0.38}


# ------------------------------------------------------------------ the model (mirrors engine.walk)
def signals(x):
    """Pass 1, every t with a full window: displacement, next-day residual (if t+1 exists), sd, loadings, K count."""
    X = x.values
    n, m = X.shape
    band = E.noise_band(E.WINDOW, m)
    D = np.full((n, m), np.nan)
    Ev = np.full((n, m), np.nan)
    SD = np.full((n, m), np.nan)
    VKs = [None] * n
    kcount = np.full(n, np.nan)
    for t in range(E.WINDOW - 1, n):
        win = X[t - E.WINDOW + 1: t + 1]
        Z, mu, sd = E.std_window(win)
        w_eig, V = E.eig_desc(Z)
        VK = V[:, :K]
        P = VK @ VK.T
        res = Z - Z @ P
        c = np.cumsum(res, axis=0)
        D[t] = (c[-1] - c.mean(axis=0)) / c.std(axis=0, ddof=1)
        if t + 1 < n:
            z1 = (X[t + 1] - mu) / sd
            Ev[t] = (z1 - P @ z1) / res.std(axis=0, ddof=1)
        SD[t] = sd
        VKs[t] = VK
        kcount[t] = E.k_beating_noise(w_eig / w_eig.sum(), band)
    return D, Ev, SD, VKs, kcount


def trade_mask(D, start):
    """episodes_C (no stop) on z only, from row `start`; mask[t, i] = in a trade at close t."""
    sub = pd.DataFrame(D[start:])
    eps = S.episodes_C(sub, pd.DataFrame(np.zeros_like(sub.values)))
    mask = np.zeros_like(D, dtype=bool)
    for ep in eps:
        mask[start + ep["t0"]: start + ep["t0"] + ep["days"], ep["i"]] = True
    return mask, eps


def weights(D, SD, VKs, mask, sign=-1.0):
    """Pass 2: engine.walk's target -> inverse vol -> projection (K loadings + ones) -> gross 1. sign=+1 is the MIRROR."""
    n, m = D.shape
    ones = np.ones(m)
    W = np.full((n, m), np.nan)
    for t in range(n):
        if VKs[t] is None:
            continue
        disp = D[t]
        target = sign * disp
        target[np.abs(disp) < E.DEAD_BAND] = 0.0
        target = np.clip(target, -E.CAP, E.CAP)
        target = np.where(mask[t], target, 0.0)
        w = target / SD[t]
        B = np.column_stack([SD[t][:, None] * VKs[t], ones])
        w = w - B @ np.linalg.lstsq(B, w, rcond=None)[0]
        g = np.abs(w).sum()
        W[t] = w / g if g > 0 else w
    return W


def returns_from_prices(px):
    """tags.universe('fx8') from a price frame with the 7 USD pair columns."""
    q = px[[v[0] for v in PAIRS.values()]].dropna()
    lr = np.log(q).diff().dropna()
    r = pd.DataFrame(0.0, index=lr.index, columns=FX8)
    for c, (pair, s) in PAIRS.items():
        r[c] = s * lr[pair]
    return r


def book(r, W, first, cost_mult=1.0):
    """Daily gross / cost / turnover for P&L dates first+1 .. (as walk: weights at t earn r[t+1], cost on w_t - w_{t-1})."""
    cvec = np.array([COST[c] / 100.0 / 2.0 for c in r.columns]) * cost_mult
    R = r.values
    rows = []
    w_prev = np.nan_to_num(W[first - 1]) if first > 0 else np.zeros(W.shape[1])
    for t in range(first, len(r) - 1):
        w = W[t]
        to = np.abs(w - w_prev)
        rows.append({"signal_date": r.index[t], "date": r.index[t + 1], "gross": float(w @ R[t + 1]),
                     "cost": float(to @ cvec), "turnover": float(to.sum())})
        w_prev = w
    return pd.DataFrame(rows)


# ------------------------------------------------------------------ reproduction check
def check():
    r = T.universe("fx8")
    x = E.basket(r)
    D, Ev, SD, VKs, _ = signals(x)
    first = E.WINDOW - 1
    disp = pd.DataFrame(D[first:-1], index=x.index[first:-1], columns=x.columns)
    e = pd.DataFrame(Ev[first:-1], index=x.index[first:-1], columns=x.columns)
    mask = np.zeros_like(D, dtype=bool)
    for ep in S.episodes_C(disp, e):
        mask[first + ep["t0"]: first + ep["t0"] + ep["days"], ep["i"]] = True
    W = weights(D, SD, VKs, mask)
    bk = book(r, W, first)
    bk["net"] = bk.gross - bk.cost
    h = len(bk) // 2
    got = {"IS": E.perf(bk.net.iloc[:h])["sharpe"], "OOS": E.perf(bk.net.iloc[h:])["sharpe"]}
    # and against engine.walk itself (the code the backtest ran)
    M = pd.DataFrame(mask[first:-1], index=disp.index, columns=disp.columns)
    _, _, rec = E.walk(x, r, K, COST, mask=M)
    diff = float(np.abs(rec.net.values - bk.net.values).max())
    ok = got == {"IS": BACKTEST["IS_net_sharpe"], "OOS": BACKTEST["OOS_net_sharpe"]} and diff < 1e-12
    print(json.dumps({"reproduced_sharpe": got, "expected": [BACKTEST["IS_net_sharpe"], BACKTEST["OOS_net_sharpe"]],
                      "max_abs_diff_vs_engine_walk": diff, "ok": ok}))
    return ok


# ------------------------------------------------------------------ OANDA
def _env():
    k, acct = os.environ.get("OANDA_KEY"), os.environ.get("OANDA_ACCOUNT_ID")
    f = os.path.join(ROOT, "RegimeV2", ".env")
    if (not k or not acct) and os.path.exists(f):
        for line in open(f, encoding="utf-8").read().splitlines():
            if "=" in line and not line.startswith("#"):
                a, b = line.split("=", 1)
                b = b.strip().strip("\"'")
                if a.strip() == "OANDA_KEY" and not k:
                    k = b
                if a.strip() == "OANDA_ACCOUNT_ID" and not acct:
                    acct = b
    return k, acct, "https://api-fxpractice.oanda.com"


def _get(url, key):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if i == 3:
                raise
            time.sleep(2 * (i + 1))


def fetch_prices(key, host):
    out = {}
    for c, (pair, _) in PAIRS.items():
        ins = pair[:3] + "_" + pair[3:]
        url = (f"{host}/v3/instruments/{ins}/candles?price=M&granularity=D&from={HISTORY_FROM}T00:00:00Z"
               f"&alignmentTimezone=America/New_York&dailyAlignment=17")
        cs = []
        while True:
            j = _get(url, key)["candles"]
            cs += [x for x in j if x["complete"]]
            if len(j) < 500:
                break
            nxt = pd.Timestamp(j[-1]["time"]) + pd.Timedelta(hours=1)
            url = url.split("&from=")[0] + f"&from={nxt.strftime('%Y-%m-%dT%H:%M:%SZ')}" + \
                "&alignmentTimezone=America/New_York&dailyAlignment=17"
        # label = the NY date the candle CLOSES on (start 17:00 NY day d-1 -> close 17:00 NY day d)
        s = {(pd.Timestamp(x["time"]).tz_convert("America/New_York") + pd.Timedelta(hours=7)).normalize()
             .tz_localize(None): float(x["mid"]["c"]) for x in cs}
        out[pair] = pd.Series(s)
    px = pd.DataFrame(out).sort_index()
    px = px[~px.index.duplicated()]
    return px[px.index.dayofweek < 5]


def log_financing(key, acct, host):
    ins = ",".join(p[:3] + "_" + p[3:] for p, _ in PAIRS.values())
    j = _get(f"{host}/v3/accounts/{acct}/instruments?instruments={ins}", key)["instruments"]
    now = pd.Timestamp.now(tz="America/New_York")
    ny_day = (now - pd.Timedelta(hours=17)).normalize().tz_localize(None)  # the last 17:00 NY close at or before now
    rows = [{"logged_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "ny_day": ny_day.date().isoformat(),
             "pair": i["name"].replace("_", ""), "long_rate": float(i["financing"]["longRate"]),
             "short_rate": float(i["financing"]["shortRate"])} for i in j]
    new = not os.path.exists(FINLOG)
    pd.DataFrame(rows).to_csv(FINLOG, mode="a", header=new, index=False)
    return len(rows)


def financing_rates():
    if not os.path.exists(FINLOG):
        return None
    f = pd.read_csv(FINLOG)
    f["ny_day"] = pd.to_datetime(f["ny_day"])
    return f.sort_values("logged_utc")


def rates_at(fin, day):
    """last logged rates on or before NY day `day`; stale=True if none was logged that day."""
    if fin is None or fin.empty:
        return None, True
    sub = fin[fin.ny_day <= day]
    if sub.empty:
        sub = fin[fin.ny_day == fin.ny_day.min()]
    last_day = sub.ny_day.max()
    g = sub[sub.ny_day == last_day].groupby("pair").last()
    return g, bool(last_day != day)


# ------------------------------------------------------------------ the forward record
COLS_W = [f"w_{c}" for c in FX8]
COLS_Z = [f"z_{c}" for c in FX8]


def build(px, fin):
    r = returns_from_prices(px)
    x = E.basket(r)
    D, Ev, SD, VKs, kcount = signals(x)
    start = int(np.searchsorted(x.index.values, np.datetime64(STATE_FROM)))
    start = max(start, E.WINDOW - 1)
    mask, eps = trade_mask(D, start)
    W = weights(D, SD, VKs, mask)
    Wm = weights(D, SD, VKs, mask, sign=+1.0)
    first = int(np.searchsorted(x.index.values, np.datetime64(FIRST_SIGNAL)))
    rows = []
    R = r.values
    cvec = np.array([COST[c] / 100.0 / 2.0 for c in FX8])
    for t in range(first, len(r) - 1):
        w, wp = W[t], W[t - 1]
        to = np.abs(w - wp)
        wm, wmp = Wm[t], Wm[t - 1]
        g = float(w @ R[t + 1])
        cost = float(to @ cvec)
        rates, stale = rates_at(fin, x.index[t])
        days = int((x.index[t + 1] - x.index[t]).days)
        finc = 0.0
        if rates is not None:
            for c, (pair, s) in PAIRS.items():
                pos = s * w[FX8.index(c)]           # EURUSD = +w_EUR, USDJPY = -w_JPY
                if pos != 0 and pair in rates.index:
                    rate = rates.loc[pair, "long_rate"] if pos > 0 else rates.loc[pair, "short_rate"]
                    finc += abs(pos) * float(rate) * days / 365.0
        a, b = -D[t], Ev[t]
        a, b = a - a.mean(), b - b.mean()
        ic = float((a @ b) / np.sqrt((a @ a) * (b @ b)))
        row = {"date": x.index[t + 1].date().isoformat(), "signal_date": x.index[t].date().isoformat(),
               "k_above_noise": int(kcount[t]), "gross": g, "cost": cost, "financing": finc,
               "net": g - cost + finc, "net_2x": g - 2 * cost + finc, "turnover": float(to.sum()),
               "mirror_net": float(wm @ R[t + 1]) - float(np.abs(wm - wmp) @ cvec), "ic": ic,
               "fin_stale": bool(stale or rates is None), "fin_days": days,
               "open_trades": " ".join(f"{'L' if -np.sign(D[t, i]) > 0 else 'S'}{FX8[i]}"
                                       for i in range(len(FX8)) if mask[t, i])}
        row.update({f"z_{c}": float(D[t, i]) for i, c in enumerate(FX8)})
        row.update({f"w_{c}": float(w[i]) for i, c in enumerate(FX8)})
        rows.append(row)
    # tonight's position (signal at the last close, P&L not yet known)
    t = len(r) - 1
    latest = {"signal_date": x.index[t].date().isoformat(), "k_above_noise": int(kcount[t]),
              "z": {c: round(float(D[t, i]), 3) for i, c in enumerate(FX8)},
              "w": {c: round(float(W[t, i]), 4) for i, c in enumerate(FX8)},
              "pairs": {pair: round(float(s * W[t, FX8.index(c)]), 4) for c, (pair, s) in PAIRS.items()},
              "open": [{"ccy": FX8[i], "side": "long" if -np.sign(D[t, i]) > 0 else "short", "z": round(float(D[t, i]), 3)}
                       for i in range(len(FX8)) if mask[t, i]]}
    # trades opened since the record started (entry signal >= FIRST_SIGNAL), from the same episodes
    trades = []
    for ep in eps:
        t0 = start + ep["t0"]
        if x.index[t0] < FIRST_SIGNAL:
            continue
        t1 = t0 + ep["days"]
        trades.append({"ccy": FX8[ep["i"]], "side": "long" if ep["d"] > 0 else "short",
                       "entry_signal": x.index[t0].date().isoformat(), "z0": round(ep["z0"], 3),
                       "exit_signal": x.index[t1].date().isoformat() if ep["reason"] != "end of data" else None,
                       "days": ep["days"],
                       "res_sd": round(float(np.nansum(ep["d"] * Ev[t0:t1, ep["i"]])), 3) if ep["reason"] != "end of data" else None})
    return pd.DataFrame(rows), latest, trades


def _hash(prev, row):
    s = prev + "|" + "|".join(f"{k}={row[k]}" for k in sorted(row) if k != "hash")
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def append(rows):
    have = pd.read_csv(RECORD, dtype=str) if os.path.exists(RECORD) else pd.DataFrame()
    done = set(have["date"]) if len(have) else set()
    prev = have["hash"].iloc[-1] if len(have) else "genesis"
    # anything already recorded that the rebuild no longer reproduces is logged, never edited
    if len(have):
        rb = rows.set_index("date")
        for _, h in have.iterrows():
            if h["date"] in rb.index:
                d = abs(float(h["net"]) - float(rb.loc[h["date"], "net"]))
                if d > 1e-9:
                    with open(DISC, "a", encoding="utf-8") as f:
                        f.write(f"{datetime.now(timezone.utc).isoformat()} {h['date']} recorded net {h['net']} "
                                f"rebuild {rb.loc[h['date'], 'net']} diff {d:.3g}\n")
    new = rows[~rows["date"].isin(done)].copy()
    out = []
    for _, row in new.iterrows():
        d = {k: (f"{v:.10g}" if isinstance(v, float) else str(v)) for k, v in row.items()}
        d["hash"] = _hash(prev, d)
        prev = d["hash"]
        out.append(d)
    if out:
        pd.DataFrame(out).to_csv(RECORD, mode="a", header=not len(have), index=False)
    return len(out)


def summarise(latest, trades, fin_ok):
    rec = pd.read_csv(RECORD) if os.path.exists(RECORD) else pd.DataFrame()
    s = {"asOf": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "prereg": "forge/RESIDUAL_FX8_FORWARD_PREREG.md",
         "first_signal": FIRST_SIGNAL.date().isoformat(), "backtest": BACKTEST, "kill": KILL, "latest": latest,
         "trades": trades, "financing_logged_tonight": fin_ok, "days": int(len(rec))}
    if len(rec):
        eq = (1 + rec.net).cumprod()
        dd = float((eq / eq.cummax() - 1).min() * 100)
        sd = rec.net.std()
        s["stats"] = {"net_cum_pct": round(float((eq.iloc[-1] - 1) * 100), 4),
                      "gross_cum_pct": round(float(((1 + rec.gross).cumprod().iloc[-1] - 1) * 100), 4),
                      "cost_sum_pct": round(float(rec.cost.sum() * 100), 4),
                      "financing_sum_pct": round(float(rec.financing.sum() * 100), 4),
                      "mirror_cum_pct": round(float(((1 + rec.mirror_net).cumprod().iloc[-1] - 1) * 100), 4),
                      "net_sharpe": round(float(rec.net.mean() / sd * np.sqrt(252)), 3) if len(rec) > 20 and sd > 0 else None,
                      "max_dd_pct": round(dd, 3), "mean_ic": round(float(rec.ic.mean()), 4),
                      "k_not_2_share": round(float((rec.k_above_noise != 2).mean()), 3),
                      "fin_stale_days": int(rec.fin_stale.astype(str).str.lower().eq("true").sum())}
        k63 = (rec.k_above_noise != 2).rolling(63).mean()
        s["flags"] = {"R1_hit": dd < KILL["R1_max_dd_pct"],
                      "factor_rotation": bool(len(rec) >= 63 and k63.max() > 0.6),
                      "financing_exceeds_gross": bool(len(rec) >= 252 and rec.financing.tail(252).sum() < -rec.gross.tail(252).sum())}
        s["series"] = [{"d": d, "net": round(n, 7), "gross": round(g, 7), "fin": round(f, 7), "mirror": round(m, 7), "k": int(k)}
                       for d, n, g, f, m, k in zip(rec.date, rec.net, rec.gross, rec.financing, rec.mirror_net, rec.k_above_noise)]
    json.dump(s, open(SUMMARY, "w"), indent=1, default=str)
    return s


def push(s):
    body = json.dumps({"key": KV_KEY, "data": s, "timestamp": int(time.time() * 1000)}).encode()
    req = urllib.request.Request(f"{BASE}/api/kv/set", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"POST /api/kv/set {KV_KEY} -> HTTP {r.status}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--push", action="store_true")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if not check():
        print("REPRODUCTION FAILED: nothing recorded (prereg section 3)")
        sys.exit(3)
    if a.check:
        return
    key, acct, host = _env()
    if not key or not acct:
        print("no OANDA_KEY / OANDA_ACCOUNT_ID")
        sys.exit(2)
    fin_ok = True
    try:
        log_financing(key, acct, host)
    except Exception as e:  # the record still runs; the day is flagged fin_stale
        fin_ok = False
        print(f"financing log failed: {type(e).__name__} {e}")
    px = fetch_prices(key, host)
    rows, latest, trades = build(px, financing_rates())
    n = append(rows) if len(rows) else 0
    s = summarise(latest, trades, fin_ok)
    print(f"last close {px.index.max().date()}: appended {n} day(s), record {s['days']} day(s); "
          f"open {[o['side'][0].upper() + o['ccy'] for o in latest['open']]}")
    if a.push:
        push(s)


if __name__ == "__main__":
    main()
