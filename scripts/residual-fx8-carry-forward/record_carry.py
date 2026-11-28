"""residual-fx8-carry-forward: nightly forward shadow of the FX8 residual book WITH the carry guard.

Prereg: forge/RESIDUAL_FX8_CARRY_FORWARD_PREREG.md. The frozen book is residual-fx8-forward
(scripts/residual-fx8-forward/record.py); this shadow reuses that file's model unchanged (signals, weights, costs,
financing, hash chain, summary) and changes ONE thing, the entry rule: a currency's fade is not opened when its
direction pays carry, i.e. direction x (3-month rate - the 8-currency average) < 0 (the "+C carry guard" layer of
residual-fx8-paper-layers, scripts/residual-fx8-paper-layers/layers.py allow_fn "C").

Rates: OECD 3-month interbank (FRED IR3TIB01{US,EZ,GB,AU,NZ,JP,CA,CH}M156N), monthly; month M is used only from day 1
of month M+2, carried forward. Fetched from FRED at each run; if FRED fails, the committed copies in
analysis/output/cot-crowding-programme/ are used and the run is flagged rates_stale.

  python scripts/residual-fx8-carry-forward/record_carry.py --check   # reproduction gate only (no OANDA)
  python scripts/residual-fx8-carry-forward/record_carry.py           # append new days, write summary.json

Financing: read-only from the main record's financing_log.csv (the main recorder logs the rates each night; the shadow
never logs its own, so both records use the same rates). Run it AFTER record.py on the same night.
Files (analysis/output/residual-fx8-carry-forward/, gitignored; on Railway kept in KV between runs):
  record.csv, discrepancies.log, summary.json
"""
import io
import json
import os
import sys
import urllib.request

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "residual-fx8-forward"))
import record as R  # noqa: E402

OUT = os.path.join(ROOT, "analysis", "output", "residual-fx8-carry-forward")
MAIN_FINLOG = R.FINLOG                                  # read-only
RATE_IDS = {"USD": "US", "EUR": "EZ", "GBP": "GB", "AUD": "AU", "NZD": "NZ", "JPY": "JP", "CAD": "CA", "CHF": "CH"}
COMMITTED = os.path.join(ROOT, "analysis", "output", "cot-crowding-programme")
FIRST_SIGNAL = pd.Timestamp("2026-11-30")              # first signal close after the prereg commit (frozen)
BACKTEST = {"IS_net_sharpe": 0.492, "OOS_net_sharpe": 0.435,
            "source": "residual-fx8-paper-layers '+C carry guard' (net of spread, no financing), 2016-06 -> 2026-08"}
_CD = None   # carry gap per signal row, set before R.build runs


# ------------------------------------------------------------------ rates
def _rate_series(text):
    d = pd.read_csv(io.StringIO(text))
    d.columns = ["date", "v"]
    s = pd.Series(pd.to_numeric(d.v, errors="coerce").values, index=pd.to_datetime(d.date)).dropna()
    s.index = s.index + pd.DateOffset(months=2)          # month M usable from day 1 of M+2
    return s


def load_rates(live=True):
    """Returns ({ccy: series}, stale_flag). live=False reads only the committed files (the reproduction check)."""
    out, stale = {}, False
    for c, k in RATE_IDS.items():
        sid = f"IR3TIB01{k}M156N"
        text = None
        if live:
            try:
                req = urllib.request.Request(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}",
                                             headers={"User-Agent": "macrofx-research"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    text = r.read().decode()
            except Exception:
                stale = True
        if text is None:
            text = open(os.path.join(COMMITTED, f"macro_{sid}.csv")).read()
        out[c] = _rate_series(text)
    return out, stale


def carry_gap(index, rates):
    rt = pd.DataFrame({c: rates[c].reindex(index, method="ffill").values for c in R.FX8}, index=index)
    return rt.sub(rt.mean(axis=1), axis=0).values


# ------------------------------------------------------------------ the one change: carry-gated entries
def trade_mask_carry(D, start):
    """episodes_C (entry |z| >= 1.5, exit at the first close where z changes sign, no stop), except that an entry
    whose direction pays carry (d * cd < 0) is not opened that day. Same episode format as stops.episodes_C."""
    n, m = D.shape
    mask = np.zeros_like(D, dtype=bool)
    eps = []
    for i in range(m):
        cur = None
        for t in range(start, n):
            z = D[t, i]
            if not np.isfinite(z):
                continue
            if cur is not None and np.sign(z) != np.sign(cur["z0"]):
                eps.append({"i": i, "t0": cur["t0"] - start, "d": cur["d"], "z0": cur["z0"], "days": t - cur["t0"], "reason": "back home"})
                cur = None
            if cur is None and abs(z) >= R.ENTRY:
                d = int(-np.sign(z))
                cd = _CD[t, i] if _CD is not None else np.nan
                if not (np.isfinite(cd) and d * cd < 0):
                    cur = {"t0": t, "d": d, "z0": float(z)}
            if cur is not None:
                mask[t, i] = True
        if cur is not None:
            eps.append({"i": i, "t0": cur["t0"] - start, "d": cur["d"], "z0": cur["z0"], "days": n - cur["t0"], "reason": "end of data"})
    return mask, eps


def check():
    """The carry-guard book on the backtest panel must reproduce residual-fx8-paper-layers (0.492 / 0.435)."""
    global _CD
    r = R.T.universe("fx8")
    x = R.E.basket(r)
    D, Ev, SD, VKs, _ = R.signals(x)
    first = R.E.WINDOW - 1
    rates, _ = load_rates(live=False)
    _CD = carry_gap(x.index, rates)
    D2 = D.copy()
    D2[-1] = np.nan          # layers.py scores signal rows up to n-2 (the last row has no next-day return)
    mask, _ = trade_mask_carry(D2, first)
    W = R.weights(D, SD, VKs, mask)
    bk = R.book(r, W, first)
    bk["net"] = bk.gross - bk.cost
    h = len(bk) // 2
    got = {"IS": R.E.perf(bk.net.iloc[:h])["sharpe"], "OOS": R.E.perf(bk.net.iloc[h:])["sharpe"]}
    ok = got == {"IS": BACKTEST["IS_net_sharpe"], "OOS": BACKTEST["OOS_net_sharpe"]}
    print(json.dumps({"reproduced_sharpe": got, "expected": [BACKTEST["IS_net_sharpe"], BACKTEST["OOS_net_sharpe"]], "ok": ok}))
    return ok


def main():
    global _CD
    os.makedirs(OUT, exist_ok=True)
    if not check():
        print("REPRODUCTION FAILED: nothing recorded")
        sys.exit(3)
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        return
    key, acct, host = R._env()
    if not key:
        print("no OANDA_KEY")
        sys.exit(2)
    # point the main recorder's file paths and frozen dates at the shadow's own files (this process only)
    R.RECORD = os.path.join(OUT, "record.csv")
    R.DISC = os.path.join(OUT, "discrepancies.log")
    R.SUMMARY = os.path.join(OUT, "summary.json")
    R.FIRST_SIGNAL = FIRST_SIGNAL
    R.BACKTEST = dict(R.BACKTEST, IS_net_sharpe=BACKTEST["IS_net_sharpe"], OOS_net_sharpe=BACKTEST["OOS_net_sharpe"],
                      shadow_of="residual-fx8-forward", rule="carry guard: skip a fade that pays the 3m-rate gap")
    R.trade_mask = trade_mask_carry
    px = R.fetch_prices(key, host)
    idx = R.returns_from_prices(px).index
    rates, stale = load_rates(live=True)
    _CD = carry_gap(idx, rates)
    rows, latest, trades = R.build(px, R.financing_rates())     # financing: the main record's log (read-only)
    n = R.append(rows) if len(rows) else 0
    s = R.summarise(latest, trades, os.path.exists(MAIN_FINLOG))
    s["prereg"] = "forge/RESIDUAL_FX8_CARRY_FORWARD_PREREG.md"
    s["rates_stale"] = stale
    s["carry_gap_latest"] = {c: round(float(_CD[-1, j]), 3) for j, c in enumerate(R.FX8)}
    json.dump(s, open(R.SUMMARY, "w"), indent=1, default=str)
    print(f"carry shadow: last close {px.index.max().date()}: appended {n} day(s), record {s['days']} day(s); rates_stale={stale}")


if __name__ == "__main__":
    main()
