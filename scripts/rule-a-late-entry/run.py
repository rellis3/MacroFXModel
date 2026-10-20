"""rule-a-late-entry (forge/RULE_A_LATE_ENTRY_PREREG.md): rule A breaks first occurring 10:00-13:00 London.

    PYTHONPATH=. python scripts/rule-a-late-entry/run.py

Reuses scripts/backtest/build_line_backtest.py (lines, rich flag, simulate, spreads) so only the entry window differs.
Seed 20261020. Outputs analysis/output/rule-a-late-entry/{results.json, RESULTS.md}.
"""
from __future__ import annotations

import importlib.util
import json
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from forge.iep_build import sessions

spec = importlib.util.spec_from_file_location("blb", "scripts/backtest/build_line_backtest.py")
blb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(blb)

OUT = Path("analysis/output/rule-a-late-entry")
SEED = 20261020
INSTR = ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "USDJPY", "GOLD", "NQ", "SPX500", "US30", "US2000"]
CELLS = [(0.2, 5), (0.1, 5), (0.1, 10), (0.2, 10)]          # primary first, then rule A's other registered cells
W0, W1 = 600, 780


def one(sym):
    name = {"US30": "DOW"}.get(sym, sym)
    P = pd.read_parquet(blb.P1)
    P = P[(P.inst == name) & (P.oos == 1)]
    rows = {r.date: r for r in P.itertuples()}
    closes, out = [], []
    for d, m, o, h, l, c, *_ in sessions(sym):
        e = np.searchsorted(m, blb.END)
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
        if not (sig > 0) or abs(O / r.open - 1) > 0.002 or len(prev) < 21:
            continue
        unit = O * sig / 100
        rv = float(np.std(np.diff(np.log(prev)), ddof=1) * np.sqrt(252) * 100)
        iv = getattr(r, "iv_ann")
        if not (pd.notna(iv) and rv > 0):
            continue
        rich = (iv / rv) >= blb.RICH[sym]
        sp, _ = blb.spread_for(sym, O)
        for k in ("oh_p50", "oh_p75", "ol_p50", "ol_p75"):
            side = 1 if k.startswith("oh") else -1
            pct = getattr(r, f"{arm}_{k}")
            L = O * (1 + side * pct / 100)
            thr = L + side * 0.05 * unit
            brk = (c >= thr) if side > 0 else (c <= thr)
            if (brk & (m < W0)).any():
                continue                                    # broken in rule A's own window: not a late break
            late = np.flatnonzero(brk & (m >= W0) & (m < W1))
            if not len(late):
                continue
            i = int(late[0])
            if i + 1 >= len(c):
                continue
            ep = float(o[i + 1])
            rec = {"inst": sym, "d": d, "rich": bool(rich), "hour": int(m[i] // 60), "line": k, "side": side}
            for s, t in CELLS:
                stop = L - side * s * unit
                if side * (ep - stop) <= 0:
                    rec[f"{s}|{t}"] = None
                    continue
                risk = abs(ep - stop)
                res = blb.simulate(side, i + 1, ep, stop, ep + side * t * risk, h, l, c)
                rec[f"{s}|{t}"] = None if not res else res[0] - 2 * sp / risk
            out.append(rec)
    return out


def block_ci(df, col, B=2000, block_weeks=4):
    rng = np.random.default_rng(SEED)
    w = pd.to_datetime(df.d).dt.to_period("W").astype(str)
    g = df.assign(w=w).groupby("w")[col].agg(["sum", "count"]).sort_index()
    S, N = g["sum"].to_numpy(), g["count"].to_numpy()
    k = len(S)
    nb = int(np.ceil(k / block_weeks))
    st = rng.integers(0, max(1, k - block_weeks + 1), (B, nb))
    idx = (st[:, :, None] + np.arange(block_weeks)).reshape(B, -1)[:, :k]
    m = S[idx].sum(1) / np.maximum(N[idx].sum(1), 1)
    return [float(x) for x in np.quantile(m, [0.025, 0.975])]


def summary(df, col):
    x = df[df[col].notna()]
    if not len(x):
        return {"n": 0}
    lo, hi = block_ci(x, col)
    per = x.groupby("inst")[col].mean()
    h1, h2 = x[x.d < "2024-01-01"][col].mean(), x[x.d >= "2024-01-01"][col].mean()
    return {"n": int(len(x)), "net_R": round(float(x[col].mean()), 4), "ci95": [round(lo, 4), round(hi, 4)],
            "half_2020_23": round(float(h1), 4), "half_2024_26": round(float(h2), 4),
            "instruments_positive": f"{int((per > 0).sum())}/{len(per)}", "by_instrument": per.round(3).to_dict(),
            "by_hour": x.groupby("hour")[col].agg(["count", "mean"]).round(3).to_dict(orient="index")}


def main():
    with Pool(5) as p:
        rows = [r for part in p.imap_unordered(one, INSTR) for r in part]
    D = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    res = {"seed": SEED, "prereg": "forge/RULE_A_LATE_ENTRY_PREREG.md", "window": "10:00-13:00 London, line unbroken before 10:00",
           "primary": summary(D[D.rich], "0.2|5"), "mirror_non_rich": summary(D[~D.rich], "0.2|5"),
           "other_registered_cells_rich": {c: summary(D[D.rich], c) for c in ("0.1|5", "0.1|10", "0.2|10")}}
    p_ = res["primary"]
    gate = {"mean_and_lower_bound_gt_0": p_.get("n", 0) > 0 and p_["ci95"][0] > 0,
            "both_halves_gt_0": p_.get("n", 0) > 0 and p_["half_2020_23"] > 0 and p_["half_2024_26"] > 0,
            "six_of_eleven_instruments": p_.get("n", 0) > 0 and int(p_["instruments_positive"].split("/")[0]) >= 6}
    if all(gate.values()):
        verdict = "VALIDATED"
    elif p_.get("n", 0) and p_["net_R"] > 0:
        verdict = "UNDERPOWERED" if p_["ci95"][0] <= 0 < p_["ci95"][1] else "NULL"
    else:
        verdict = "NULL"
    res["gate"], res["verdict"] = gate, verdict
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    print(json.dumps({k: v for k, v in res.items() if k != "other_registered_cells_rich"}, indent=1, default=float)[:3000])
    print({c: (v.get("n"), v.get("net_R")) for c, v in res["other_registered_cells_rich"].items()})


if __name__ == "__main__":
    main()
