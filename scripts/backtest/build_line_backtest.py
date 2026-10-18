"""Forecast Line Backtest: data build (page: forecast-line-backtest.html).

    PYTHONPATH=. python scripts/backtest/build_line_backtest.py [SYM ...]

Lines: the CHOSEN daily forecast of the Vol Forecast v3 page ("Forecast · chosen ★": persistence + implied vol where IV
exists, persistence elsewhere), rebuilt point-in-time in VF3 Stage B (analysis/output/vf3_stage_b/part1_lines.parquet,
out-of-sample rows 2020-08 -> 2026-08-20; widths fitted only on earlier data). Sessions after 2026-08-20 are the sealed
holdout and are not built.

Prices: research M1 cache (OANDA mid), London session 00:00-22:00 (forge.iep_build.sessions). Everything is checked
against 1-minute bars; when a stop and a target fall inside the same minute the stop is taken (conservative).

Rules (each a reference, not a recommendation; every result is gross of costs in the file, costs applied on the page):
  A  Rich-day break (adapted from the one rule that passed, forge/BREAK_IVRV_PREREG.md, paper-record.html): on a day
     when implied vol / 20-day realised vol >= the rule's threshold (FX/gold 1.182, US indices 1.53), the first 1-minute
     close >= 0.05 sigma through an O->H or O->L p50 / p75 chosen line between 00:00 and 10:00 London; enter at the next
     bar's open in the break direction; stop s sigma behind the line. Adapted: the original used the v4 line set.
  B  Fade the first p75 touch: market entry at the close of the minute that first touches the O->H / O->L p75 line,
     against the move; stop s sigma beyond the line.
  C  Continue the first p50 touch: market entry at the close of the minute that first touches the O->H / O->L p50
     line, with the move; stop s sigma behind the line.
  (Entering at the line price itself would assume a fill inside the touch minute whose price order is unknown; that
  flatters continuation, the bias the path-map work found. Rule A already enters on the next bar's open.)
Grid per signal: stop s in {0.1, 0.2, 0.4, 0.6} sigma (0.55-0.60 = the Daily Plan minimum stop) x target in
{1R, 2R, 5R, 10R, next line}; exit at the last bar before 22:00 if neither is hit (marked to that close).
Output: backtest-data/line-backtest/<SYM>.json.gz (served statically; the page gunzips it) + index.json.
"""
from __future__ import annotations

import gzip
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from forge.iep_build import JOBS, cls_of, sessions

OUT = Path("backtest-data/line-backtest")
P1 = Path("analysis/output/vf3_stage_b/part1_lines.parquet")
FH = Path("analysis/output/forecast_history")
TO_JOBS = {"DOW": "US30"}
END = 22 * 60
STOPS = (0.1, 0.2, 0.4, 0.6)
TARGETS = ("1", "2", "5", "10", "L")
RICH = {"EURUSD": 1.182, "GBPUSD": 1.182, "AUDUSD": 1.182, "USDCAD": 1.182, "USDCHF": 1.182, "USDJPY": 1.182,
        "GOLD": 1.182, "NQ": 1.53, "SPX500": 1.53, "US30": 1.53, "US2000": 1.53}
SPREAD = {"EURUSD": 0.00006, "GBPUSD": 0.00009, "USDJPY": 0.007, "AUDUSD": 0.00007, "USDCAD": 0.00008, "USDCHF": 0.00008,
          "EURJPY": 0.010, "GBPJPY": 0.014, "AUDJPY": 0.010, "EURGBP": 0.00008, "GOLD": 0.25, "NQ": 1.0, "SPX500": 0.5,
          "US30": 2.0, "DE30": 1.0, "UK100": 1.0, "CADJPY": 0.012, "CHFJPY": 0.014, "EURAUD": 0.00014, "EURCHF": 0.00010,
          "US2000": 0.4}
LINES = ("oh_p50", "oh_p75", "oh_p90", "ol_p50", "ol_p75", "ol_p90")
NEXT = {"oh_p50": "oh_p75", "oh_p75": "oh_p90", "oh_p90": None, "ol_p50": "ol_p75", "ol_p75": "ol_p90", "ol_p90": None}
BACK = {"oh_p75": "oh_p50", "oh_p90": "oh_p75", "ol_p75": "ol_p50", "ol_p90": "ol_p75"}


def spread_for(sym, price):
    if sym in SPREAD:
        return SPREAD[sym], False
    return (0.02 if "JPY" in sym else 0.0002 * price / max(price, 1e-9) * (1 if price < 50 else price)), True


def simulate(side, entry_i, entry_px, stop_px, tgt_px, h, l, c):
    """Walk 1-minute bars from entry_i. side +1 long / -1 short. Returns (R, exit_index, reason). Stop wins ties."""
    risk = abs(entry_px - stop_px)
    if not (risk > 0):
        return None
    hs, ls = h[entry_i:], l[entry_i:]
    if side > 0:
        hit_s, hit_t = ls <= stop_px, (hs >= tgt_px) if tgt_px is not None else np.zeros(len(hs), bool)
    else:
        hit_s, hit_t = hs >= stop_px, (ls <= tgt_px) if tgt_px is not None else np.zeros(len(hs), bool)
    i_s = np.argmax(hit_s) if hit_s.any() else 10**9
    i_t = np.argmax(hit_t) if hit_t.any() else 10**9
    if i_s == i_t == 10**9:
        return side * (c[-1] - entry_px) / risk, len(c) - 1, "time"
    if i_s <= i_t:
        return -1.0, entry_i + i_s, "stop"
    return side * (tgt_px - entry_px) / risk, entry_i + i_t, "target"


def grid(side, line_px, entry_i, entry_px, unit, next_px, h, l, c, m_of):
    out = {}
    for s in STOPS:
        stop = line_px - side * s * unit
        if side * (entry_px - stop) <= 0:            # entry already beyond the stop
            continue
        risk = abs(entry_px - stop)
        for t in TARGETS:
            tgt = (entry_px + side * float(t) * risk) if t != "L" else next_px
            if tgt is None or side * (tgt - entry_px) <= 0:
                continue
            r = simulate(side, entry_i, entry_px, stop, tgt, h, l, c)
            if r:
                out[f"{s}|{t}"] = [int(round(r[0] * 1000)), int(m_of[r[1]])]
    return [out.get(f"{s}|{t}") for s in STOPS for t in TARGETS] if out else None


def build(sym):
    name = {"US30": "DOW"}.get(sym, sym)
    P = pd.read_parquet(P1, columns=None)
    P = P[(P.inst == name) & (P.oos == 1)].copy()
    if P.empty:
        return sym, 0
    fh = pd.read_csv(FH / f"{name}.csv", usecols=["date", "jump_share", "gap", "event"]).set_index("date")
    rows = {r.date: r for r in P.itertuples()}
    cls = cls_of(sym)
    days, tr = [], {"A": [], "B": [], "C": []}
    closes = []                                      # London closes (for 20-day realised vol, strictly before the day)
    for d, m, o, h, l, c, *_ in sessions(sym):
        e = np.searchsorted(m, END)
        if e < 60:
            continue
        m, o, h, l, c = m[:e], o[:e], h[:e], l[:e], c[:e]
        prev = list(closes[-21:])
        closes.append(c[-1])
        r = rows.get(d)
        if r is None:
            continue
        arm = "SI" if pd.notna(getattr(r, "SI_oh_p50")) else "S"
        sig = getattr(r, f"sig_{arm}")
        O = o[0]
        if not (sig > 0) or abs(O / r.open - 1) > 0.002:
            continue
        unit = O * sig / 100
        L = {k: O * (1 + getattr(r, f"{arm}_{k}") / 100) if k.startswith("oh") else O * (1 - getattr(r, f"{arm}_{k}") / 100) for k in LINES}
        hlw = {k: O * getattr(r, f"{arm}_hl_{k}") / 100 for k in ("p50", "p75", "p90")}
        run_h, run_l = np.maximum.accumulate(h), np.minimum.accumulate(l)
        ft = {}
        for k, px in L.items():
            hit = (run_h >= px) if k.startswith("oh") else (run_l <= px)
            ft[k] = int(m[np.argmax(hit)]) if hit.any() else None
        rv = None
        if len(prev) >= 21:
            lr = np.diff(np.log(prev))
            rv = float(np.std(lr, ddof=1) * np.sqrt(252) * 100)
        iv = getattr(r, "iv_ann")
        ratio = float(iv / rv) if (pd.notna(iv) and rv) else None
        rich = (ratio >= RICH[sym]) if (ratio is not None and sym in RICH) else None
        f = fh.loc[d] if d in fh.index else None
        days.append({"d": d, "o": round(O, 6), "h": round(float(h.max()), 6), "l": round(float(l.min()), 6), "c": round(float(c[-1]), 6),
                     "th": int(m[np.argmax(h)]), "tl": int(m[np.argmin(l)]), "sig": round(float(sig), 4), "arm": arm,
                     "L": {k: round(v, 6) for k, v in L.items()}, "hl": {k: round(v, 6) for k, v in hlw.items()}, "ft": ft,
                     "ev": str(r.event), "reg": round(float(r.regime), 3) if pd.notna(r.regime) else None, "wd": str(r.wd),
                     "iv": round(float(iv), 3) if pd.notna(iv) else None, "rv20": round(rv, 3) if rv else None,
                     "ratio": round(ratio, 3) if ratio else None, "rich": rich,
                     "jump": round(float(f.jump_share), 3) if f is not None and pd.notna(f.jump_share) else None,
                     "gap": round(float(f.gap), 4) if f is not None and pd.notna(f.gap) else None})
        # Rule A: rich-day break, 00:00-10:00, first close >= 0.05 sigma through an O->H/O->L p50/p75 line
        if rich:
            for k in ("oh_p50", "oh_p75", "ol_p50", "ol_p75"):
                side = 1 if k.startswith("oh") else -1
                thr = L[k] + side * 0.05 * unit
                brk = (c >= thr) if side > 0 else (c <= thr)
                brk &= m < 600
                if not brk.any():
                    continue
                i = int(np.argmax(brk))
                if i + 1 >= len(c):
                    continue
                g = grid(side, L[k], i + 1, o[i + 1], unit, L[NEXT[k]] if NEXT[k] else None, h, l, c, m)
                if g:
                    tr["A"].append({"d": d, "line": k, "side": side, "em": int(m[i + 1]), "ep": round(float(o[i + 1]), 6), "g": g})
        # Rules B and C: first touch of p75 (fade) / p50 (continue)
        for rule, lines, fade in (("B", ("oh_p75", "ol_p75"), True), ("C", ("oh_p50", "ol_p50"), False)):
            for k in lines:
                if ft[k] is None:
                    continue
                up = k.startswith("oh")
                hit = (h >= L[k]) if up else (l <= L[k])
                i = int(np.argmax(hit))
                if i == 0 and (o[0] >= L[k] if up else o[0] <= L[k]):
                    continue                          # opened beyond the line: no touch to trade
                side = (-1 if up else 1) if fade else (1 if up else -1)
                nxt = (L[BACK[k]] if fade else (L[NEXT[k]] if NEXT[k] else None))
                # market entry at the touch bar's close (the order of prices inside that minute is unknown, so no fill at
                # the line is assumed); the trade is checked from the next bar; skipped if the close is already past the stop
                if i + 1 >= len(c):
                    continue
                g = grid(side, L[k], i + 1, float(c[i]), unit, nxt, h, l, c, m)
                if g:
                    tr[rule].append({"d": d, "line": k, "side": side, "em": int(m[i]), "ep": round(float(c[i]), 6), "g": g})
    if not days:
        return sym, 0
    sp, assumed = spread_for(sym, days[-1]["o"])
    rec = {"inst": sym, "cls": cls, "source": "VF3 Stage B point-in-time chosen forecast + research M1",
           "from": days[0]["d"], "to": days[-1]["d"], "spread": sp, "spread_assumed": assumed,
           "rich_threshold": RICH.get(sym), "stops": STOPS, "targets": TARGETS,
           "grid_note": "g = one [R x 1000, exit London minute] per stop x target (stops outer), null where not valid; gross of costs", "days": days, "trades": tr}
    OUT.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT / f"{sym}.json.gz", "wt", encoding="utf-8", compresslevel=9) as fh_:
        fh_.write(json.dumps(rec, separators=(",", ":")))
    return sym, len(days), {k: len(v) for k, v in tr.items()}


if __name__ == "__main__":
    syms = sys.argv[1:] or [s for s in JOBS]
    res = []
    with Pool(min(5, len(syms))) as p:
        for r in p.imap_unordered(build, syms):
            print(r, flush=True)
            res.append(r)
    idx = sorted([{"inst": r[0], "days": r[1], "trades": r[2] if len(r) > 2 else {}} for r in res if r[1]], key=lambda x: x["inst"])
    (OUT / "index.json").write_text(json.dumps({"built": "2026-10-18", "instruments": idx}, indent=1))
