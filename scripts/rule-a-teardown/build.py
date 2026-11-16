"""rule-a-teardown, step 1 (EXPLORATORY, not pre-registered): every line break on every day, rich or not.

    PYTHONPATH=. python scripts/rule-a-teardown/build.py

Rule A = scripts/backtest/build_line_backtest.py rule A (first 1-minute close >= 0.05 sigma through an O->H / O->L
p50 / p75 chosen v3 line, 00:00-10:00 London, enter next bar's open, stop 0.2 sigma behind the line, 5R, out by 22:00)
but WITHOUT the rich-day filter, so rich and non-rich breaks can be compared. Same lines (vf3_stage_b part1, oos rows
2020-08-24 -> 2026-08-20; lockbox untouched), same simulate(), same spread table. Costs: 2x spread, as rule-a-pre2020.
Per break it also scores the MIRROR (same entry minute and risk, opposite direction, 5R) and a few stop/target cells.
Also writes a day table (O/H/L/C, efficiency |C-O|/(H-L)) for 2016-2026 for the regime look.
Outputs (gitignored parquet): analysis/output/rule-a-teardown/{breaks_2020.parquet, days.parquet}.
"""
from __future__ import annotations

import importlib.util
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, ".")
from forge.iep_build import sessions  # noqa: E402

spec = importlib.util.spec_from_file_location("blb", "scripts/backtest/build_line_backtest.py")
blb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(blb)

OUT = Path("analysis/output/rule-a-teardown")
INSTR = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
LINES = ("oh_p50", "oh_p75", "ol_p50", "ol_p75")
CELLS = [(0.2, 5), (0.2, 2), (0.4, 5), (0.6, 5), (0.2, 10)]
LAST = "2026-08-20"


def one(sym):
    name = {"US30": "DOW"}.get(sym, sym)
    P = pd.read_parquet(blb.P1)
    P = P[(P.inst == name) & (P.oos == 1)]
    rows = {r.date: r for r in P.itertuples()}
    closes, out, days = [], [], []
    for d, m, o, h, l, c, *_ in sessions(sym):
        if d > LAST:
            break
        e = np.searchsorted(m, blb.END)
        if e < 60:
            continue
        m, o, h, l, c = m[:e], o[:e], h[:e], l[:e], c[:e]
        prev = list(closes[-21:])
        closes.append(c[-1])
        H, Lo = float(h.max()), float(l.min())
        days.append({"inst": sym, "d": d, "o": float(o[0]), "h": H, "l": Lo, "c": float(c[-1]),
                     "eff": abs(float(c[-1]) - float(o[0])) / (H - Lo) if H > Lo else np.nan})
        r = rows.get(d)
        if r is None or len(prev) < 21:
            continue
        arm = "SI" if pd.notna(getattr(r, "SI_oh_p50")) else "S"
        sig = getattr(r, f"sig_{arm}")
        O = o[0]
        if not (sig > 0) or abs(O / r.open - 1) > 0.002:
            continue
        unit = O * sig / 100
        rv = float(np.std(np.diff(np.log(prev)), ddof=1) * np.sqrt(252) * 100)
        iv = r.iv_ann
        ratio = float(iv / rv) if (pd.notna(iv) and rv > 0) else np.nan
        rich = bool(ratio >= blb.RICH[sym]) if ratio == ratio else None
        days[-1].update({"sig": float(sig), "unit": unit, "ratio": ratio, "rich": rich})
        sp, _ = blb.spread_for(sym, O)
        for k in LINES:
            side = 1 if k.startswith("oh") else -1
            Lp = O * (1 + getattr(r, f"{arm}_{k}") / 100) if side > 0 else O * (1 - getattr(r, f"{arm}_{k}") / 100)
            thr = Lp + side * 0.05 * unit
            brk = np.flatnonzero(((c >= thr) if side > 0 else (c <= thr)) & (m < 600))
            if not len(brk) or brk[0] + 1 >= len(c):
                continue
            i = int(brk[0])
            ep = float(o[i + 1])
            rec = {"inst": sym, "d": d, "ratio": ratio, "rich": rich, "arm": arm, "line": k, "side": side,
                   "em": int(m[i + 1]), "hour": int(m[i + 1] // 60), "ep": ep, "unit": unit,
                   "gap_sig": (ep - Lp) * side / unit, "sp_R": None}
            for s, t in CELLS:
                stop = Lp - side * s * unit
                key = f"{s}|{t}"
                if side * (ep - stop) <= 0:
                    rec[key] = rec[key + "_g"] = None
                    continue
                risk = abs(ep - stop)
                res = blb.simulate(side, i + 1, ep, stop, ep + side * t * risk, h, l, c)
                rec[key + "_g"] = None if not res else res[0]
                rec[key] = None if not res else res[0] - 2 * sp / risk
                if (s, t) == (0.2, 5):
                    rec["sp_R"] = 2 * sp / risk
                    rec["reason"] = res[2] if res else None
                    rec["exit_m"] = int(m[res[1]]) if res else None
                    # mirror: same entry minute, same risk, opposite direction
                    mr = blb.simulate(-side, i + 1, ep, ep + side * risk, ep - side * t * risk, h, l, c)
                    rec["mirror"] = None if not mr else mr[0] - 2 * sp / risk
                    rec["mirror_g"] = None if not mr else mr[0]
                    rec["c_R"] = side * (float(c[-1]) - ep) / risk
            out.append(rec)
    return out, days


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    B, D = [], []
    with Pool(5) as p:
        for b, dd in p.imap_unordered(one, INSTR):
            B += b
            D += dd
            print(len(b), len(dd), flush=True)
    pd.DataFrame(B).to_parquet(OUT / "breaks_2020.parquet")
    pd.DataFrame(D).to_parquet(OUT / "days.parquet")
