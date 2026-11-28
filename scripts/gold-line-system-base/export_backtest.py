"""Export the gold line system on Jordan's 8 lines (S2 | VWAP + 0.5 sigma_v | BE off, forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md)
for the standard backtest page (line-system-backtest.html): one full trade list per entry-rule variant (A1 switches)
and shared per-day M1 candles.

No new test: the engines of scripts/gold-line-system-jordan/entry_rules.py. Every trade 2021-01-01 -> 2026-08-21
(lockbox untouched).

    python scripts/gold-line-system-base/export_backtest.py

Outputs analysis/output/line-system-backtest/GOLD/:
  <variant>[__vwap2]/trades.json   one row per trade (__vwap2 = with the VWAP stretch filter layer) (lv = the 18 line prices at the arming bar, LEVELS order)
  days_<year>.json        per trade day: M1 bars covering every variant's trades (prices = whole ticks from the open)
  meta.json
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


ER = _imp("ler", "scripts/gold-line-system-jordan/entry_rules.py")
S = ER.S
LEVELS, SHORT_V, IS_END = S.LEVELS, S.SHORT_V, S.IS_END
OCN = ["target", "stop", "break-even", "time"]
FAM = {"oh": "OH", "ol": "OL", "cup": "Close+", "cdn": "Close-", "hlH": "HL up", "hlL": "HL down"}


def minute_index(sym):
    """date -> minute-of-day (London) of every bar, aligned exactly with LT.sessions(sym) arrays."""
    m = S.LT.L.load_m1(sym, "F", "unadj")
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    lt = lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    return {di[s]: mins[s:e] for s, e in zip(starts, ends) if e - s >= 600}


def main(sym="GOLD"):
    dp = 2
    out = ROOT / "analysis/output/line-system-backtest" / sym
    out.mkdir(parents=True, exist_ok=True)
    for f in list(out.glob("candles_*.json")) + [out / "trades.json"]:
        f.unlink(missing_ok=True)
    W, DV, Dold, tick, nsess, costs, floor, stops, sess = ER.setup()
    MI = minute_index(sym)
    smap = {s[1]: s for s in sess}
    rnd = lambda v: None if v is None or not np.isfinite(v) else round(float(v), dp)
    hm = lambda m: f"{int(m) // 60:02d}:{int(m) % 60:02d}"
    span = {}                                                    # date -> [first bar, last bar] across variants
    counts = {}
    runs = [(k + suf, ign, cs, z) for k, (ign, cs, _) in ER.VARIANTS.items() for suf, z in (("", -1e9), ("__vwap2", 2.0))]
    for key, ign, cs, z in runs:
        X, cnt = ER.run_var(sess, stops, costs, floor, ign, cs, zmin=z)
        X = X.sort_values(["date", "fillbar"]).reset_index(drop=True)
        counts[key] = cnt
        trades = []
        for i, t in X.iterrows():
            d = t["date"]
            _, _, O, H, Lo, C, VB, sv, P, sg, o, _ = smap[d]
            mi = MI[d]
            assert len(mi) == len(O), (d, len(mi), len(O))
            k = int(t.k); sh = bool(SHORT_V[k]); fb, eb, ab = int(t.fillbar), int(t.exitbar), int(t.armbar)
            e, sd = float(t.entry), float(t.S)
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
            a0, b0 = max(ab - 30, 0), min(eb + 20, len(O) - 1)
            sp_ = span.setdefault(d, [a0, b0]); sp_[0] = min(sp_[0], a0); sp_[1] = max(sp_[1], b0)
            trades.append(dict(
                id=f"{d.date()}-{i}", date=str(d.date()), yr=int(d.year), split="IS" if d.year <= IS_END else "OOS",
                arm=hm(mi[ab]), fill=hm(mi[fb]), exit_t=hm(mi[eb]), dur=int(mi[eb] - mi[fb]),
                arm_m=int(mi[ab]), fill_m=int(mi[fb]), exit_m=int(mi[eb]),
                level=lev, fam=FAM[lev[:-2]], tier="P" + lev[-2:], side="short" if sh else "long",
                line=rnd(P[k, ab]), entry=rnd(e), stop=rnd(e + sd if sh else e - sd), tp=None if t.notgt else rnd(t.tp),
                exit=rnd(t.exit), oc=OCN[oc], vwap=rnd(VB[fb]), sv=rnd(sv), risk=rnd(sd),
                R=round(float(t.R), 4), gR=round(float(t.gR), 4), costR=round(cost / sd, 4),
                pts=rnd(g - cost), gpts=rnd(g), maeR=round(mae / sd, 4), mfeR=round(mfe / sd, 4),
                mae=rnd(mae), mfe=rnd(mfe), pct=round(100 * (g - cost) / e, 5), maePct=round(100 * mae / e, 5),
                riskPct=round(100 * sd / e, 5), lv=[rnd(P[q, ab]) for q in range(len(LEVELS))]))
        (out / key).mkdir(exist_ok=True)
        json.dump(trades, open(out / key / "trades.json", "w"), separators=(",", ":"))
        o_ = X[X["date"].dt.year > IS_END]
        print(f"{key}: {len(trades)} trades, OOS {len(o_)} mean {o_.R.mean():+.4f} total {o_.R.sum():+.1f}R", flush=True)
    days = {}
    for d, (a, b) in sorted(span.items()):
        _, _, O, H, Lo, C, VB, sv, P, sg, o, _ = smap[d]
        mi = MI[d]
        q = lambda v: int(round((float(v) - o) / tick))
        days.setdefault(d.year, {})[str(d.date())] = dict(
            open=rnd(o), tick=round(tick, 8),
            bars=[[int(mi[j]), q(O[j]), q(H[j]), q(Lo[j]), q(C[j]), q(VB[j]) if np.isfinite(VB[j]) else None] for j in range(a, b + 1)])
    for y, c in days.items():
        json.dump(c, open(out / f"days_{y}.json", "w"), separators=(",", ":"))
    meta = dict(sym=sym, name="Gold (GC futures)", point_value=100.0, tick=round(tick, 8), dp=dp, levels=LEVELS,
                costs=dict(slip_in=costs[0], slip_out=costs[1], commission=costs[2]),
                variants={k: v[2] for k, v in ER.VARIANTS.items()}, primary="fill_any",
                layers={"vwap2": "Only fade when the fill is 2σ+ from VWAP (gold-line-vwap-stretch-filter, under test)"}, counts=counts,
                system="Jordan's 8 shadow lines (HL projection up/down, Close+, Close-, at P75/P90; N7_ALL walk-forward "
                       "widths) + Jordan's gold entry (arm 0.10 x stop through, fill on the retest, cancel 1.2 x stop, "
                       "chase outward) + target VWAP +/- 0.5 sigma_v fixed at the fill + rolling-MAE stop (3-month median "
                       "line-to-line MAE per line, 5-tick floor), BE off, one trade at a time, flat 22:00 London",
                prereg="forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md", results="analysis/output/gold-line-system-jordan/RESULTS.md",
                is_end=IS_END, years=sorted(int(y) for y in days))
    json.dump(meta, open(out / "meta.json", "w"), indent=1)
    print("files ->", out)


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["GOLD"]))
