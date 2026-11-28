"""Export the gold line system on Jordan's 8 lines (S2 | VWAP + 0.5 sigma_v | BE off, forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md) as a
full trade list + per-trade candles for the standard backtest page (line-system-backtest.html).

No new test: the same engine and arm as run.py's primary. Every trade 2021-01-01 -> 2026-08-21 (lockbox untouched).

    python scripts/gold-line-system-base/export_backtest.py [SYM]      (default GOLD)

Outputs analysis/output/line-system-backtest/<SYM>/: trades.json (one row per trade), candles_<year>.json (M1 bars
around each trade, keyed by trade id; prices as whole ticks from the session open), meta.json.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def _imp(name, rel):
    sp = importlib.util.spec_from_file_location(name, ROOT / rel)
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


S = _imp("lsb", "scripts/gold-line-system-base/run.py")
J = _imp("lsj", "scripts/gold-line-system-jordan/run.py")
LEVELS, SHORT_V, IS_END = S.LEVELS, S.SHORT_V, S.IS_END
OCN = ["target", "stop", "break-even", "time"]
FAM = {"oh": "OH", "ol": "OL", "cup": "Close+", "cdn": "Close-", "hlH": "HL up", "hlL": "HL down"}
SPEC = {"GOLD": dict(name="Gold (GC futures)", point_value=100.0, dp=2),
        "NQ": dict(name="Nasdaq (NQ futures)", point_value=20.0, dp=2),
        "EURUSD": dict(name="EURUSD (6E futures)", point_value=125000.0, dp=5)}


def minute_index(sym):
    """date -> minute-of-day (London) of every bar, aligned exactly with LT.sessions(sym) arrays."""
    L = S.LT.L
    m = L.load_m1(sym, "F", "unadj")
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    lt = lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    return {di[s]: mins[s:e] for s, e in zip(starts, ends) if e - s >= 600}


def main(sym="GOLD"):
    spec = SPEC[sym]; dp = spec["dp"]
    out = ROOT / "analysis/output/line-system-backtest" / sym
    out.mkdir(parents=True, exist_ok=True)
    W = pd.read_parquet(ROOT / f"analysis/output/gold-rolling-mae-window/widths/F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"]); W = W.sort_values("date").reset_index(drop=True)
    DV, tick_raw = S.LT.sessions(sym)
    W = W[W["date"].isin(DV.keys())].reset_index(drop=True)
    nsess = len(W)
    Dold = {d: (x[1], x[2], x[3], float(x[0][0])) for d, x in DV.items()}
    tick = float(tick_raw)
    costs = (0.10, 0.10, 0.12) if sym == "GOLD" else (tick, tick, tick)
    floor = 5 * tick
    T = S.R.touches(Dold, W)
    stops = S.R.rolling_stops(T, nsess, "usd", wins=["3m"])
    sess = S.prep(DV, W)
    X, cnt = J.run_mask(sess, "S2", 1, 0, stops, costs, floor, J.MASK8)   # Jordan's 8 lines (gold-line-system-jordan)
    MI = minute_index(sym)
    smap = {s[1]: s for s in sess}
    rnd = lambda v: None if v is None or not np.isfinite(v) else round(float(v), dp)
    hm = lambda m: f"{int(m) // 60:02d}:{int(m) % 60:02d}"

    X = X.sort_values(["date", "fillbar"]).reset_index(drop=True)
    trades, candles = [], {}
    for i, t in X.iterrows():
        d = t["date"]
        _, _, O, H, Lo, C, VB, sv, P, sg, o, _ = smap[d]
        mi = MI[d]
        assert len(mi) == len(O), (d, len(mi), len(O))
        k = int(t.k); sh = bool(SHORT_V[k]); fb, eb, ab = int(t.fillbar), int(t.exitbar), int(t.armbar)
        e, sd = float(t.entry), float(t.S)
        sp = e + sd if sh else e - sd
        hi, lo = float(H[fb:eb + 1].max()), float(Lo[fb:eb + 1].min())
        mae = (hi - e) if sh else (e - lo)
        mfe = (e - lo) if sh else (hi - e)
        oc = int(t.oc)
        if oc == S.STP: mae = min(mae, sd)                     # the stop caps the adverse path
        if oc == S.TGT: mfe = min(mfe, abs(e - float(t.tp)))   # the target caps the favourable path
        mae, mfe = max(mae, 0.0), max(mfe, 0.0)
        g = (e - float(t.exit)) if sh else (float(t.exit) - e)
        cost = (float(t.gR) - float(t.R)) * sd
        lev = LEVELS[k]
        tid = f"{d.date()}-{i}"
        trades.append(dict(
            id=tid, date=str(d.date()), yr=int(d.year), split="IS" if d.year <= IS_END else "OOS",
            arm=hm(mi[ab]), fill=hm(mi[fb]), exit_t=hm(mi[eb]), dur=int(mi[eb] - mi[fb]),
            level=lev, fam=FAM[lev[:-2]], tier="P" + lev[-2:], side="short" if sh else "long",
            line=rnd(P[k, ab]), entry=rnd(e), stop=rnd(sp), tp=None if t.notgt else rnd(t.tp), exit=rnd(t.exit),
            oc=OCN[oc], vwap=rnd(VB[fb]), sv=rnd(sv), risk=rnd(sd),
            R=round(float(t.R), 4), gR=round(float(t.gR), 4), costR=round(cost / sd, 4),
            pts=rnd(g - cost), gpts=rnd(g), maeR=round(mae / sd, 4), mfeR=round(mfe / sd, 4),
            mae=rnd(mae), mfe=rnd(mfe), pct=round(100 * (g - cost) / e, 5), maePct=round(100 * mae / e, 5),
            riskPct=round(100 * sd / e, 5)))
        a, b = max(ab - 30, 0), min(eb + 20, len(O) - 1)
        step = max(1, int(np.ceil((b - a + 1) / 360)))
        q = lambda v: int(round((float(v) - o) / tick))        # whole ticks from the session open (compact)
        bars = []
        for j in range(a, b + 1, step):
            j2 = min(j + step - 1, b)
            bars.append([int(mi[j]), q(O[j]), q(H[j:j2 + 1].max()), q(Lo[j:j2 + 1].min()), q(C[j2]),
                         q(VB[j]) if np.isfinite(VB[j]) else None])
        lines = {LEVELS[q]: rnd(P[q, ab]) for q in range(len(LEVELS)) if np.isfinite(P[q, ab])}
        candles.setdefault(d.year, {})[tid] = dict(step=step, tick=round(tick, 8), bars=bars, lines=lines, open=rnd(o),
                                                   fill_m=int(mi[fb]), exit_m=int(mi[eb]), arm_m=int(mi[ab]))
    json.dump(trades, open(out / "trades.json", "w"), separators=(",", ":"))
    for y, c in candles.items():
        json.dump(c, open(out / f"candles_{y}.json", "w"), separators=(",", ":"))
    meta = dict(sym=sym, name=spec["name"], point_value=spec["point_value"], tick=round(tick, 8), dp=dp,
                costs=dict(slip_in=costs[0], slip_out=costs[1], commission=costs[2]),
                system="Jordan's 8 shadow lines (HL projection up/down, Close+, Close-, at P75/P90; N7_ALL walk-forward widths) + Jordan's gold entry (arm 0.10 x stop through, "
                       "fill on the retest, cancel 1.2 x stop, chase outward) + target VWAP +/- 0.5 sigma_v fixed at the "
                       "fill + rolling-MAE stop (3-month median line-to-line MAE per line, 5-tick floor), BE off, "
                       "one trade at a time, flat 22:00 London",
                prereg="forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md", results="analysis/output/gold-line-system-jordan/RESULTS.md",
                is_end=IS_END, start=str(X["date"].min().date()), end=str(X["date"].max().date()),
                n=len(trades), counts=cnt, years=sorted(int(y) for y in candles))
    json.dump(meta, open(out / "meta.json", "w"), indent=1)
    oos = X[X["date"].dt.year > IS_END]
    print(f"{sym}: {len(trades)} trades, OOS {len(oos)} mean {oos.R.mean():+.4f} total {oos.R.sum():+.1f}R; "
          f"files -> {out}")


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["GOLD"]))
