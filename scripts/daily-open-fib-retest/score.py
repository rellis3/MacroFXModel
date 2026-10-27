"""
daily-open-fib-retest: scorer. Prereg: forge/DAILY_OPEN_FIB_RETEST_PREREG.md

    python3 scripts/daily-open-fib-retest/score.py                 # gold, real M1 (mid)
    python3 scripts/daily-open-fib-retest/score.py --pairs gold,nq,eurusd
    python3 scripts/daily-open-fib-retest/score.py --synthetic rw   # random-walk check
    python3 scripts/daily-open-fib-retest/score.py --synthetic plant

Real data: VolRangeForecaster/data/m1/<pair>_m1.parquet (OANDA mid), sessions from
DailyOpenResearch.data.Days with the broker anchor (first bar 18:00 New York).
Sessions are cut at anchor date 2026-08-20 (the session that ends on 2026-08-21,
the last pre-lockbox day). Writes analysis/output/daily-open-fib-retest/.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

from engine import (SWEEP_LEVELS, TARGET_LEVELS, components, find_fill,  # noqa: E402
                    rw_null_reach, rw_null_sweep, trade)

SEED = 20261027
END_KEY = 20260820
OUT = os.path.join(ROOT, "analysis", "output", "daily-open-fib-retest")
BLOCK = 20
ENTRY_CUT = 360      # minutes after the first bar (23:00 UK -> 05:00 UK)
EXIT_MIN = 540       # 23:00 UK -> 08:00 UK, the London open
PASS_BAR = 0.10      # net R per trade worth having (prereg §5)
SHIFTS = list(range(30, 841, 30))   # 28 shifted-anchor placebos, minutes after the open

# round-trip cost in price units (the DailyOpenResearch assumption; mid data, no bid/ask)
COST = {"gold": 0.30, "nq": 1.50, "eurusd": 0.00015}

PRIMARY = dict(anchor="high", min_imp=0.10, target="zero", be=True)
VARIANTS = [dict(anchor=a, min_imp=m, target=t, be=b)
            for a in ("high", "do") for m in (0.10, 0.20)
            for t in ("zero", 3, 2) for b in (True, False)]


def vkey(v):
    return f"{v['anchor']}|imp{v['min_imp']}|tp{v['target']}|be{int(v['be'])}"


# ---------------------------------------------------------------- data

class SynthDays:
    """Random-walk sessions with the same interface the scorer uses."""

    def __init__(self, kind: str, n_days=2700, bars=1380, seed=SEED):
        rng = np.random.default_rng(seed)
        self.sessions = []
        price = 2000.0
        sd = 0.25          # per-minute sd in price units -> ADR ~ 20
        for d in range(n_days):
            r = rng.normal(0, sd, bars)
            c = price + np.cumsum(r)
            o = np.concatenate([[price], c[:-1]])
            wig = np.abs(rng.normal(0, sd * 0.6, (2, bars)))
            h = np.maximum(o, c) + wig[0]
            l = np.minimum(o, c) - wig[1]
            self.sessions.append([o, h, l, c])
            price = c[-1]
        if kind == "plant":
            self._plant()
        # ADR as the median daily range of the previous 20 sessions
        dr = np.array([s[1].max() - s[2].min() for s in self.sessions])
        self.adr = pd.Series(dr).shift(1).rolling(20, min_periods=10).median().to_numpy()
        self.keys = np.array([int((pd.Timestamp("2016-01-04") + pd.Timedelta(days=i)).strftime("%Y%m%d"))
                              for i in range(n_days)])

    def _plant(self):
        """Positive control: after the primary rule fills, push price toward the 0
        by 0.25 x leg over the next 60 bars (a real edge the scorer must find)."""
        for s in self.sessions:
            o, h, l, c = s
            mins = np.arange(len(o))
            dr_adr = 20.0
            f = find_fill(o, h, l, mins, dr_adr, "high", 0.10, ENTRY_CUT)
            if f is None:
                continue
            j = f["j"]
            leg = abs(f["A"] - f["L0"])
            k = np.arange(len(o)) - j
            drift = np.clip(k, 0, 60) / 60.0 * 0.25 * leg * (1 if f["side"] > 0 else -1)
            drift[: j + 1] = 0
            for arr in s:
                arr += drift

    def iter(self):
        for i, (o, h, l, c) in enumerate(self.sessions):
            if not np.isfinite(self.adr[i]):
                continue
            yield self.keys[i], o, h, l, c, np.arange(len(o)), self.adr[i], "normal"


class RealDays:
    def __init__(self, pair: str, m1_dir: str):
        from DailyOpenResearch.data import Days, vol_regime
        path = os.path.join(m1_dir, f"{pair}_m1.parquet")
        df = pd.read_parquet(path)
        if "time" in df.columns:
            df = df.set_index("time")
        df.index = pd.DatetimeIndex(df.index)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        df = df[["open", "high", "low", "close", "volume"]].astype("float64")
        df = df[~df.index.duplicated(keep="first")].sort_index()
        ok = ((df.high >= df.low) & (df.high >= df.open) & (df.high >= df.close)
              & (df.low <= df.open) & (df.low <= df.close))
        self.days = Days(df[ok], "broker")
        self.vol_regime = vol_regime

    def iter(self):
        d = self.days
        for i in range(d.n):
            if not d.valid(i) or d.is_weekend_day(i) or d.keys[i] > END_KEY:
                continue
            o, h, l, c, v, mins = d.arrays(i)
            yield d.keys[i], o, h, l, c, mins, d.adr20[i], self.vol_regime(d, i)


# ---------------------------------------------------------------- stats

def block_boot_mean(vals: np.ndarray, groups: np.ndarray, B: int, rng) -> tuple[float, float]:
    """Date-clustered block bootstrap of a per-trade mean. `groups` is the session
    ordinal of each trade; blocks are BLOCK consecutive sessions."""
    if len(vals) < 2:
        return float("nan"), float("nan")
    blk = groups // BLOCK
    ub = np.unique(blk)
    idx_by = {b: np.flatnonzero(blk == b) for b in ub}
    means = np.empty(B)
    for b in range(B):
        pick = rng.choice(ub, size=len(ub), replace=True)
        ii = np.concatenate([idx_by[p] for p in pick])
        means[b] = vals[ii].mean()
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def summarise(R: np.ndarray, groups: np.ndarray, B: int, rng) -> dict:
    if len(R) == 0:
        return dict(n=0)
    lo, hi = block_boot_mean(R, groups, B, rng)
    return dict(n=int(len(R)), mean=float(R.mean()), sd=float(R.std(ddof=1)) if len(R) > 1 else float("nan"),
                lo=lo, hi=hi, win=float((R > 0).mean()))


def p_from_ci(est: float, lo: float, hi: float) -> float:
    """Two-sided p from a 95% interval by the normal approximation (js/preregStats.js pFromCI)."""
    from scipy.stats import norm
    se = (hi - lo) / 3.92
    if not np.isfinite(se) or se <= 0:
        return float("nan")
    return float(2 * norm.sf(abs(est) / se))


def bh(pvals, q: float) -> list[bool]:
    """Benjamini-Hochberg: which hypotheses are kept at FDR q (NaN p never kept)."""
    p = np.array([x if np.isfinite(x) else 1.0 for x in pvals])
    m = len(p)
    if m == 0:
        return []
    order = np.argsort(p)
    ok = p[order] <= q * (np.arange(1, m + 1) / m)
    kmax = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    keep = np.zeros(m, bool)
    keep[order[:kmax]] = True
    return keep.tolist()


# ---------------------------------------------------------------- run

def shifted(o, h, l, c, mins, s):
    k = int(np.searchsorted(mins, s))
    if len(mins) - k < EXIT_MIN // 2:
        return None
    m = mins[k:] - mins[k]
    return o[k:], h[k:], l[k:], c[k:], m


def run_pair(name: str, source, cost: float, B: int) -> dict:
    rng = np.random.default_rng(SEED)
    rows = []           # one per session: real-anchor fills
    shift_R = {s: [] for s in SHIFTS}
    shift_comp = {s: [] for s in SHIFTS}
    n_sessions = 0
    for g, (key, o, h, l, c, mins, adr, regime) in enumerate(source.iter()):
        n_sessions += 1
        row = dict(g=g, key=int(key), year=int(str(key)[:4]), regime=regime, adr=float(adr))
        fills = {}
        for v in VARIANTS:
            fk = (v["anchor"], v["min_imp"])
            if fk not in fills:
                fills[fk] = find_fill(o, h, l, mins, adr, v["anchor"], v["min_imp"], ENTRY_CUT)
            f = fills[fk]
            if f is None:
                continue
            t = trade(o, h, l, mins, f, 0.2, v["target"], v["be"], EXIT_MIN)
            row[vkey(v)] = t["R"]
            row[vkey(v) + "|net"] = t["R"] - cost / t["risk_px"]
            if v == PRIMARY:
                row.update(side=f["side"], imp=f["imp"], fill_min=int(mins[f["j"]]),
                           ext_min=int(mins[f["t_ext"]]), how=t["how"], risk_px=t["risk_px"],
                           risk_adr=t["risk_px"] / adr, cost_R=cost / t["risk_px"])
                row.update({f"c_{k}": val for k, val in components(o, h, l, mins, f, EXIT_MIN).items()})
        # did the primary setup ever arm? (impulse >= 0.10 ADR before the cutoff)
        cut = mins <= ENTRY_CUT
        row["max_imp_adr"] = float((h[cut].max() - l[cut].min()) / adr) if cut.any() else float("nan")
        rows.append(row)
        for s in SHIFTS:
            sh = shifted(o, h, l, c, mins, s)
            if sh is None:
                continue
            so, shh, sl, sc, sm = sh
            f = find_fill(so, shh, sl, sm, adr, "high", 0.10, ENTRY_CUT)
            if f is None:
                continue
            t = trade(so, shh, sl, sm, f, 0.2, "zero", True, EXIT_MIN)
            shift_R[s].append(t["R"])
            shift_comp[s].append(components(so, shh, sl, sm, f, EXIT_MIN))
    df = pd.DataFrame(rows)
    res = dict(pair=name, sessions=n_sessions, seed=SEED, block=BLOCK, B=B, cost_rt=cost,
               entry_cut=ENTRY_CUT, exit_min=EXIT_MIN)
    half = df.g.median()
    # variants
    vres = {}
    for v in VARIANTS:
        k = vkey(v)
        if k not in df:
            continue
        sub = df[df[k].notna()]
        d = dict(gross=summarise(sub[k].to_numpy(), sub.g.to_numpy(), B, rng),
                 net=summarise(sub[k + "|net"].to_numpy(), sub.g.to_numpy(), B, rng))
        for hn, hs in (("h1", sub[sub.g <= half]), ("h2", sub[sub.g > half])):
            d[f"net_{hn}"] = float(hs[k + "|net"].mean()) if len(hs) else float("nan")
            d[f"gross_{hn}"] = float(hs[k].mean()) if len(hs) else float("nan")
        vres[k] = d
    res["variants"] = vres
    pk = vkey(PRIMARY)
    prim = df[df[pk].notna()].copy()
    # placebo distribution
    sh_means = {s: float(np.mean(v)) for s, v in shift_R.items() if len(v) >= 30}
    real_gross = vres[pk]["gross"]["mean"] if pk in vres else float("nan")
    beats = sum(real_gross > m for m in sh_means.values())
    res["placebo"] = dict(shift_means=sh_means, real_gross=real_gross, beats=beats, of=len(sh_means),
                          shift_n={s: len(v) for s, v in shift_R.items()})
    # gate (prereg §4)
    pn = vres.get(pk, {}).get("net", {})
    g1 = bool(pn.get("lo", np.nan) > 0)
    g2 = bool(vres.get(pk, {}).get("net_h1", -1) > 0 and vres.get(pk, {}).get("net_h2", -1) > 0)
    g3 = bool(len(sh_means) > 0 and beats == len(sh_means))
    sd = pn.get("sd", np.nan)
    n = pn.get("n", 0)
    mde = 2.80 * sd / np.sqrt(n) if n else float("nan")
    res["gate"] = dict(ci_clear=g1, both_halves=g2, beats_all_shifts=g3, mde_R=float(mde), pass_bar=PASS_BAR,
                       powered=bool(mde <= PASS_BAR))
    if g1 and g2 and g3:
        verdict = "VALIDATED"
    elif not res["gate"]["powered"]:
        verdict = "UNDERPOWERED"
    else:
        verdict = "NULL"
    res["verdict_primary"] = verdict
    # ------------------------------------------------ components (descriptive)
    comp = {}
    comp["C1_impulse"] = dict(
        sessions=int(len(df)),
        armed_share=float(df.max_imp_adr.ge(0.10).mean()),
        filled_share=float(len(prim) / len(df)) if len(df) else float("nan"),
        imp_adr_q=[float(x) for x in np.nanpercentile(prim.imp, [10, 25, 50, 75, 90])] if len(prim) else [],
        risk_adr_q=[float(x) for x in np.nanpercentile(prim.risk_adr, [10, 25, 50, 75, 90])] if len(prim) else [],
        cost_R_q=[float(x) for x in np.nanpercentile(prim.cost_R, [10, 25, 50, 75, 90])] if len(prim) else [],
        ext_min_q=[float(x) for x in np.nanpercentile(prim.ext_min, [25, 50, 75])] if len(prim) else [],
        fill_min_q=[float(x) for x in np.nanpercentile(prim.fill_min, [25, 50, 75])] if len(prim) else [],
        side_sell_share=float((prim.side < 0).mean()) if len(prim) else float("nan"),
    )
    shift_fill = {s: len(v) / max(1, len(df)) for s, v in shift_R.items()}
    comp["C2_return_to_anchor"] = dict(real=comp["C1_impulse"]["filled_share"],
                                       shifts_mean=float(np.mean(list(shift_fill.values()))),
                                       shifts_min=float(min(shift_fill.values())),
                                       shifts_max=float(max(shift_fill.values())))

    def prop_cells(prefix, levels, nullfn):
        out = {}
        for x in levels:
            col = f"c_{prefix}_{x}"
            if col not in prim:
                continue
            vals = prim[col].astype(float).to_numpy()
            lo, hi = block_boot_mean(vals, prim.g.to_numpy(), B, rng)
            sh = [np.mean([c[f"{prefix}_{x}"] for c in shift_comp[s]]) for s in SHIFTS if len(shift_comp[s]) >= 30]
            h1 = prim[prim.g <= half][col].astype(float).mean()
            h2 = prim[prim.g > half][col].astype(float).mean()
            out[str(x)] = dict(obs=float(vals.mean()), lo=lo, hi=hi, rw_null=float(nullfn(x)),
                               shift_mean=float(np.mean(sh)) if sh else float("nan"),
                               shift_p05=float(np.percentile(sh, 5)) if sh else float("nan"),
                               shift_p95=float(np.percentile(sh, 95)) if sh else float("nan"),
                               h1=float(h1), h2=float(h2))
        return out

    comp["C3_sweep_beyond_1"] = prop_cells("sweep", SWEEP_LEVELS, rw_null_sweep)
    comp["C4_depth_before_1.2"] = prop_cells("reach", TARGET_LEVELS, rw_null_reach)
    # reusable-candidate rule (prereg §8): outside the RW value's CI AND the shift 5-95% band,
    # same side in both halves, and BH q 0.10 across all C3/C4 cells
    cells = [(fam, lv, d) for fam in ("C3_sweep_beyond_1", "C4_depth_before_1.2") for lv, d in comp[fam].items()]
    pv = [p_from_ci(d["obs"] - d["rw_null"], d["lo"] - d["rw_null"], d["hi"] - d["rw_null"]) for _, _, d in cells]
    keep = bh(pv, 0.10)
    for (fam, lv, d), p, k in zip(cells, pv, keep):
        side = np.sign(d["obs"] - d["rw_null"])
        out_rw = d["lo"] > d["rw_null"] or d["hi"] < d["rw_null"]
        out_sh = d["obs"] > d["shift_p95"] or d["obs"] < d["shift_p05"]
        halves = np.sign(d["h1"] - d["rw_null"]) == side and np.sign(d["h2"] - d["rw_null"]) == side
        d.update(p=p, bh_keep=bool(k), reusable_candidate=bool(out_rw and out_sh and halves and k))
    # variant disaggregation: BH q 0.10 on net mean vs 0 (descriptive)
    vk = list(vres)
    vp = [p_from_ci(vres[k]["net"]["mean"], vres[k]["net"]["lo"], vres[k]["net"]["hi"]) for k in vk]
    for k, p, kp in zip(vk, vp, bh(vp, 0.10)):
        vres[k]["net"].update(p=p, bh_keep=bool(kp))
    be_out = prim[prim.how == "be"]
    comp["C5_break_even"] = dict(
        be_exits=int(len(be_out)),
        later_hit_0_before_1_2=float(be_out["c_reach_0.0"].astype(float).mean()) if len(be_out) else float("nan"),
        primary_no_be=vres.get(vkey({**PRIMARY, "be": False}), {}).get("net", {}),
    )
    comp["exits"] = prim.how.value_counts().to_dict() if len(prim) else {}
    sl = {}
    for col, bins in (("year", None), ("regime", None)):
        sl[col] = {str(k): dict(n=int(len(x)), net=float(x[pk + "|net"].mean()), gross=float(x[pk].mean()))
                   for k, x in prim.groupby(col)}
    prim["imp_b"] = pd.cut(prim.imp, [0, 0.15, 0.25, 0.4, 10], labels=["0.10-0.15", "0.15-0.25", "0.25-0.40", ">0.40"])
    sl["impulse_adr"] = {str(k): dict(n=int(len(x)), net=float(x[pk + "|net"].mean()) if len(x) else None,
                                      gross=float(x[pk].mean()) if len(x) else None)
                         for k, x in prim.groupby("imp_b", observed=False)}
    comp["C6_slices"] = sl
    res["components"] = comp
    return res, df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", default="gold")
    ap.add_argument("--m1-dir", default=os.path.join(ROOT, "VolRangeForecaster", "data", "m1"))
    ap.add_argument("--synthetic", choices=["rw", "plant"])
    ap.add_argument("--B", type=int, default=2000)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    allres = {}
    if a.synthetic:
        src = SynthDays(a.synthetic)
        res, df = run_pair(f"synthetic-{a.synthetic}", src, 0.0, a.B)
        allres[res["pair"]] = res
        tag = f"synthetic_{a.synthetic}"
    else:
        for p in a.pairs.split(","):
            res, df = run_pair(p, RealDays(p, a.m1_dir), COST[p], a.B)
            allres[p] = res
            df.to_csv(os.path.join(a.out, f"trades_{p}.csv"), index=False)
        tag = "results"
    with open(os.path.join(a.out, f"{tag}.json"), "w") as fh:
        json.dump(allres, fh, indent=1, default=float)
    for p, r in allres.items():
        pk = vkey(PRIMARY)
        v = r["variants"].get(pk, {})
        print(f"\n== {p}: {r['sessions']} sessions, verdict {r['verdict_primary']}")
        print(" primary gross", v.get("gross"), "\n primary net  ", v.get("net"))
        print(" halves net", v.get("net_h1"), v.get("net_h2"), "| placebo beats", r["placebo"]["beats"], "of", r["placebo"]["of"])
        print(" gate", r["gate"])
        for k, d in r["variants"].items():
            print(f"  {k:28s} n={d['gross'].get('n')} gross={d['gross'].get('mean', float('nan')):+.3f} "
                  f"net={d['net'].get('mean', float('nan')):+.3f} [{d['net'].get('lo', float('nan')):+.3f},{d['net'].get('hi', float('nan')):+.3f}]")
        print(" C3", {k: (round(x['obs'], 3), round(x['rw_null'], 3), round(x['shift_mean'], 3)) for k, x in r["components"]["C3_sweep_beyond_1"].items()})
        print(" C4", {k: (round(x['obs'], 3), round(x['rw_null'], 3), round(x['shift_mean'], 3)) for k, x in r["components"]["C4_depth_before_1.2"].items()})
        print(" C1", r["components"]["C1_impulse"])
        print(" C2", r["components"]["C2_return_to_anchor"])


if __name__ == "__main__":
    main()
