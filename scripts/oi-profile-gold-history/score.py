#!/usr/bin/env python3
"""oi-profile-gold-history: score G1-G4, the controls and the reported (ungated) cells (forge/OI_PROFILE_GOLD_HISTORY_PREREG.md §6-7).
    python scripts/oi-profile-gold-history/score.py <touches_outcomes_T2.parquet> <out.json> [--sens <touches_outcomes_T1.parquet>]
E = hold rate (back / (back + through)) at real sites minus at their shifted placebo copies, in the cell. Date-clustered bootstrap, B = 2000, seed 20261126.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
SENS = Path(sys.argv[sys.argv.index("--sens") + 1]) if "--sens" in sys.argv else None
SEED, B = 20261126, 2000
TYPES = ["call_wall", "put_wall", "gamma_peak", "max_pain"]


def load(p):
    d = pd.read_parquet(p).sort_values(["date", "fk", "kind", "parent", "shift", "price", "t"]).reset_index(drop=True)
    d["r"] = d.res.map({"back": "H", "through": "B", "both": "?", "unresolved": "."})
    key = ["date", "fk", "kind", "shift", "price"]
    d["path"] = d.groupby(key).r.transform(lambda x: x.cumsum().shift(1).fillna(""))
    d["prev_side"] = d.groupby(key).side.shift(1)
    d["y"] = (d.res == "back").astype(float)
    d["resolved"] = d.res.isin(["back", "through"])
    d["year"] = d.date.str[:4]
    return d


class Scorer:
    def __init__(self, d):
        self.d = d
        self.dates = np.array(sorted(d.date.unique()))
        self.di = d.date.map({x: i for i, x in enumerate(self.dates)}).values
        rng = np.random.default_rng(SEED)
        nd = len(self.dates)
        self.W = np.stack([np.bincount(rng.integers(0, nd, nd), minlength=nd) for _ in range(B)]).astype(float)
        self.h1 = np.arange(nd) < nd // 2   # halves split by date at the median session

    def per_date(self, m):
        m = m & self.d.resolved.values
        nd = len(self.dates)
        return np.bincount(self.di[m], weights=self.d.y.values[m], minlength=nd), np.bincount(self.di[m], minlength=nd).astype(float)

    def cell(self, m, real=None, plc=None):
        d = self.d
        real = (d.kind == "real").values if real is None else real
        plc = (d.kind == "placebo").values if plc is None else plc
        m = np.asarray(m)
        br, nr = self.per_date(m & real)
        bp, npl = self.per_date(m & plc)
        with np.errstate(invalid="ignore", divide="ignore"):
            E = br.sum() / nr.sum() - bp.sum() / npl.sum()
            boot = (self.W @ br) / (self.W @ nr) - (self.W @ bp) / (self.W @ npl)
            hv = [br[h].sum() / nr[h].sum() - bp[h].sum() / npl[h].sum() for h in (self.h1, ~self.h1)]
        bt = boot[np.isfinite(boot)]
        lo, hi = (np.percentile(bt, [2.5, 97.5]) if len(bt) > 100 else (np.nan, np.nan))
        p = float(min(1.0, 2 * min((bt <= 0).mean(), (bt >= 0).mean()))) if len(bt) > 100 else np.nan
        return {"E_pp": r2(100 * E), "ci_pp": [r2(100 * lo), r2(100 * hi)], "p": r2(p, 4), "halves_pp": [r2(100 * x) for x in hv],
                "held_real": r2(100 * br.sum() / max(nr.sum(), 1), 1), "held_plc": r2(100 * bp.sum() / max(npl.sum(), 1), 1),
                "n_real": int(nr.sum()), "n_plc": int(npl.sum()), "dates_real": int((nr > 0).sum())}


def r2(x, k=2):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def same_sign(c):
    h = c["halves_pp"]
    return h[0] is not None and h[1] is not None and np.sign(h[0]) == np.sign(h[1]) == np.sign(c["E_pp"])


def verdict_two_sided(c, bar):
    lo, hi = c["ci_pp"]
    if lo is None:
        return "UNDERPOWERED"
    if abs(c["E_pp"]) >= bar and (lo > 0 or hi < 0) and same_sign(c):
        return "VALIDATED"
    if lo > -bar and hi < bar:
        return "NULL"
    return "UNDERPOWERED"


def verdict_positive(c, bar, extra_ok=True):
    lo, hi = c["ci_pp"]
    if lo is None:
        return "UNDERPOWERED"
    if c["E_pp"] >= bar and lo > 0 and same_sign(c) and extra_ok:
        return "VALIDATED"
    if hi < bar:
        return "NULL"
    return "UNDERPOWERED"


def bh(ps, q=0.10):
    ps = np.array([np.nan if p is None else p for p in ps], float)
    n = np.isfinite(ps).sum()
    o = np.argsort(np.where(np.isfinite(ps), ps, 9))
    k = 0
    for r, i in enumerate(o, 1):
        if np.isfinite(ps[i]) and ps[i] <= q * r / n:
            k = r
    out = np.zeros(len(ps), bool)
    out[o[:k]] = True
    return out


def score(d, full=True):
    S = Scorer(d)
    has = {t: d.types.str.split("|").map(lambda s, t=t: t in s).values for t in TYPES}
    n1 = (d.n == 1).values
    pin = (d.regime == "PIN").values
    res = {"dates": len(S.dates), "sessions": int(d.groupby(["date", "fk"]).ngroups),
           "counts": {f"{k[0]}:{k[1]}": int(v) for k, v in d.groupby(["kind", "res"]).size().items()}}
    g1 = S.cell(n1)
    g1["verdict"] = verdict_two_sided(g1, 5)
    res["G1"] = g1
    g2 = {t: S.cell(n1 & has[t]) for t in TYPES}
    passes = bh([g2[t]["p"] for t in TYPES])
    for t, ok in zip(TYPES, passes):
        g2[t]["bh_q10"] = bool(ok)
        g2[t]["verdict"] = verdict_positive(g2[t], 8, extra_ok=bool(ok))
    res["G2"] = g2
    g3 = S.cell(n1 & has["gamma_peak"] & pin)
    g3["verdict"] = verdict_positive(g3, 10)
    res["G3"] = g3
    hb3 = (d.n == 3).values & (d.path == "HB").values
    g4 = S.cell(hb3)
    lo, hi = g4["ci_pp"]
    g4["verdict"] = "UNDERPOWERED" if lo is None else ("VALIDATED" if hi < 0 else ("NULL" if lo > -5 else "UNDERPOWERED"))
    res["G4"] = g4
    if not full:
        return res
    P = (d.kind == "placebo").values
    sh = d["shift"].values
    # mirror: the +0.25 U copies as "real" against the other copies
    mir = S.cell(n1, real=P & (sh == 0.25), plc=P & (sh != 0.25))
    mir["clears_G1_bar_same_sign"] = bool(verdict_two_sided(mir, 5) == "VALIDATED" and np.sign(mir["E_pp"]) == np.sign(g1["E_pp"]))
    res["mirror"] = mir
    P05 = P & (np.abs(sh) == 0.5)
    res["pm05_only"] = {"G1": S.cell(n1, plc=P05), "G3": S.cell(n1 & has["gamma_peak"] & pin, plc=P05), "G4": S.cell(hb3, plc=P05),
                        **{f"G2 {t}": S.cell(n1 & has[t], plc=P05) for t in TYPES}}
    same = (d.prev_side == d.side).values
    res["reported"] = {
        "touch 2 after held": S.cell((d.n == 2).values & (d.path == "H").values),
        "touch 2 after broke, same side": S.cell((d.n == 2).values & (d.path == "B").values & same),
        "retest after broke (other side)": S.cell((d.n == 2).values & (d.path == "B").values & ~same),
        **{f"touch 3 {p}": S.cell((d.n == 3).values & (d.path == p).values) for p in ("HH", "BH", "BB")},
        "G3 on BREAKOUT days": S.cell(n1 & has["gamma_peak"] & ~pin),
        "all lines PIN, touch 1": S.cell(n1 & pin), "all lines BREAKOUT, touch 1": S.cell(n1 & ~pin),
        "gamma peak 2nd+ touches, PIN": S.cell((d.n >= 2).values & has["gamma_peak"] & pin),
    }
    res["per_year_G1"] = {y: S.cell(n1 & (d.year == y).values) for y in sorted(d.year.unique())}
    # concentration: no year > 40% of G1's real touches or of its excess
    yr = d[n1 & (d.kind == "real").values & d.resolved.values].year.value_counts(normalize=True)
    excess = {y: c["E_pp"] * c["n_real"] for y, c in res["per_year_G1"].items() if c["E_pp"] is not None}
    tot = sum(excess.values())
    res["concentration"] = {"touch_share": {k: round(float(v), 3) for k, v in yr.items()},
                            "excess_share": {k: (round(v / tot, 3) if tot else None) for k, v in excess.items()},
                            "max_touch_share": round(float(yr.max()), 3)}
    # unresolved / both reported per kind
    res["regime_mix"] = {k: int(v) for k, v in d[n1 & (d.kind == "real").values].drop_duplicates(["date"]).regime.value_counts().items()}
    return res


d = load(SRC)
res = {"source": SRC.name, "seed": SEED, "B": B, **score(d)}
if SENS is not None and SENS.exists():
    res["sensitivity_T1"] = score(load(SENS), full=False)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(res, indent=1, default=str))
brief = {k: {kk: res[k][kk] for kk in ("E_pp", "ci_pp", "halves_pp", "held_real", "held_plc", "n_real", "verdict")} for k in ("G1", "G3", "G4")}
brief["G2"] = {t: {kk: res["G2"][t][kk] for kk in ("E_pp", "ci_pp", "n_real", "bh_q10", "verdict")} for t in TYPES}
brief["mirror"] = {kk: res["mirror"][kk] for kk in ("E_pp", "ci_pp", "clears_G1_bar_same_sign")}
print(json.dumps(brief, indent=1))
