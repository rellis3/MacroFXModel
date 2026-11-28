"""gold-line-system-jordan A1 (forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md): entry-rule switches, descriptive.

sim2 = gold-line-system-base `sim` (tmode / target / stop / manage unchanged) with two switches:
  ign        same-candle retouch: a line counts as poked only if the poking bar closes beyond it (else ignored, not spent)
  chase_same chase only to the same line's further tier (PDF); other lines poking while an order is armed are spent

    python scripts/gold-line-system-jordan/entry_rules.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

ROOT = Path(__file__).resolve().parents[2]


def _imp(name, rel):
    sp = importlib.util.spec_from_file_location(name, ROOT / rel)
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


J = _imp("lsj2", "scripts/gold-line-system-jordan/run.py")
S = J.S
LEVELS, SHORT_V, IS_END, SEED, NPERM = S.LEVELS, S.SHORT_V, S.IS_END, S.SEED, S.NPERM
FAMID = np.array([["oh", "ol", "cup", "cdn", "hlH", "hlL"].index(l[:-2]) for l in LEVELS], np.int64)
manage, tgt_at = S.manage, S.tgt_at
TGT, STP, BEX, TIME = S.TGT, S.STP, S.BEX, S.TIME
VARIANTS = {  # key: (ign, chase_same, label)
    "fill_any": (False, False, "Same-candle retouch fills · chase any line (the tested system)"),
    "ignore_any": (True, False, "Same-candle retouch ignored · chase any line"),
    "fill_same": (False, True, "Same-candle retouch fills · chase same line only (PDF)"),
    "ignore_same": (True, True, "Same-candle retouch ignored · chase same line only (PDF)"),
}
OUT = ROOT / "analysis/output/gold-line-system-jordan"


@njit(cache=False)
def _poked(ss, Hj, Lj, Cj, lv, a, ign):
    if ss:
        p = Hj >= lv + a
        if p and ign and Cj <= lv: p = False
    else:
        p = Lj <= lv - a
        if p and ign and Cj >= lv: p = False
    return p


@njit(cache=False)
def sim2(O, H, Lo, C, VB, sv, P, short, S_, sg, o, tmode, be, slip_in, slip_out, comm, out, cnt, fam, ign, chase_same,
         zmin=-1e9, q=-1.0, u=np.zeros(1)):
    """zmin: VWAP stretch filter (gold-line-vwap-stretch-filter): skip a fill whose (fill - VWAP)/sigma_v in the fade's
    direction is < zmin (order cancelled, line spent). q >= 0: random-skip placebo instead (skip if u[j] < q)."""
    n = O.shape[0]
    nl = P.shape[0]
    spent = np.zeros(nl, np.bool_)
    for k in range(nl):
        if not np.isfinite(S_[k]): spent[k] = True
    armed = np.array([-1, -1]); armbar = np.array([-1, -1]); alv = np.zeros(2); atp = np.zeros(2)
    inpos = False; sh = False; pk = 0; entry = 0.0; SP = 0.0; TP = 0.0; sd = 0.0; fbar = 0; moved = False; ab = 0; nog = 0
    nt = 0
    for j in range(n):
        if inpos:
            ex, oc = manage(O, H, Lo, C, j, n, sh, SP, TP, fbar, moved)
            if oc >= 0:
                g = (entry - ex) if sh else (ex - entry)
                cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
                out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
                out[nt, 10] = TP; out[nt, 11] = nog
                nt += 1; inpos = False
            elif be and not moved and j > fbar:
                if (sh and Lo[j] <= entry - sd) or ((not sh) and H[j] >= entry + sd):
                    SP = entry; moved = True
            continue
        fk = -1; fe = 0.0; ftp = 0.0; fab = 0
        for side in range(2):
            ss = side == 0
            best = -1; bp = 0.0
            for k in range(nl):
                if spent[k] or short[k] != ss: continue
                lv = P[k, j]
                if _poked(ss, H[j], Lo[j], C[j], lv, 0.10 * S_[k], ign):
                    if best < 0 or (ss and lv > bp) or ((not ss) and lv < bp):
                        best = k; bp = lv
            if best >= 0:
                # PDF chase: the most extreme newly poked line of the armed line's own family, beyond the armed price
                bs = -1; bsp = 0.0
                if chase_same and armed[side] >= 0:
                    for k in range(nl):
                        if spent[k] or short[k] != ss or fam[k] != fam[armed[side]]: continue
                        lv = P[k, j]
                        if ((ss and lv > alv[side]) or ((not ss) and lv < alv[side])) and \
                                _poked(ss, H[j], Lo[j], C[j], lv, 0.10 * S_[k], ign):
                            if bs < 0 or (ss and lv > bsp) or ((not ss) and lv < bsp):
                                bs = k; bsp = lv
                for k in range(nl):
                    if spent[k] or short[k] != ss: continue
                    if _poked(ss, H[j], Lo[j], C[j], P[k, j], 0.10 * S_[k], ign):
                        spent[k] = True
                take = armed[side] < 0
                if not take:
                    if chase_same:
                        if bs >= 0:
                            best = bs; bp = bsp; take = True
                    elif (ss and bp > alv[side]) or ((not ss) and bp < alv[side]):
                        take = True
                if take:
                    if armed[side] >= 0: cnt[1] += 1
                    armed[side] = best; armbar[side] = j; alv[side] = bp
                    atp[side] = tgt_at(P, short, best, j, bp, sg, o)
                    cnt[0] += 1
            if armed[side] < 0: continue
            k = armed[side]; lv = alv[side]; s_ = S_[k]; same = armbar[side] == j
            if ss:
                hit_c = H[j] >= lv + 1.2 * s_; hit_f = (C[j] <= lv) if same else (Lo[j] <= lv)
            else:
                hit_c = Lo[j] <= lv - 1.2 * s_; hit_f = (C[j] >= lv) if same else (H[j] >= lv)
            if hit_c and not hit_f:
                armed[side] = -1; cnt[2] += 1
                continue
            if not hit_f: continue
            e = lv
            if not same:
                if ss and O[j] < lv: e = O[j]
                if (not ss) and O[j] > lv: e = O[j]
            if q >= 0.0:
                skip = u[j] < q
            else:
                zz = ((e - VB[j]) if ss else (VB[j] - e)) / sv
                skip = (zz < zmin) if np.isfinite(zz) else (zmin > -1e8)
            if skip:
                spent[k] = True; armed[side] = -1; cnt[4] += 1
                continue
            fk = k; fe = e; ftp = atp[side]; fab = armbar[side]
            break
        if fk < 0: continue
        cnt[3] += 1
        spent[fk] = True
        armed[0] = -1; armed[1] = -1
        inpos = True; sh = short[fk]; pk = fk; entry = fe; sd = S_[fk]; fbar = j; moved = False; ab = fab
        SP = entry + sd if sh else entry - sd
        sgn = 1.0 if sh else -1.0
        if tmode == 0: tp = VB[j] + sgn * sv
        elif tmode == 1: tp = VB[j] + sgn * 0.5 * sv
        elif tmode == 2: tp = VB[j]
        else: tp = ftp
        nog = 0
        if sh:
            if not (np.isfinite(tp) and tp < entry): tp = -1e18; nog = 1
        else:
            if not (np.isfinite(tp) and tp > entry): tp = 1e18; nog = 1
        TP = tp
        ex, oc = manage(O, H, Lo, C, j, n, sh, SP, TP, fbar, moved)
        if oc >= 0:
            g = (entry - ex) if sh else (ex - entry)
            cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
            out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
            out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
            out[nt, 10] = TP; out[nt, 11] = nog
            nt += 1; inpos = False
    return nt


def run_var(sess, stops, costs, floor, ign, chase_same, mask=None, zmin=-1e9, q=-1.0, rng=None):
    mask = J.MASK8 if mask is None else mask
    si_, so, cm = costs
    out = np.zeros((64, 12)); cnt = np.zeros(5, np.int64); rows = []
    for (si, d, O, H, Lo, C, VB, sv, P, sg, o, p90) in sess:
        st = np.where(mask, S.stop_vec("S2", si, sg, p90, stops, None, floor), np.nan)
        u = rng.random(len(O)) if rng is not None else np.zeros(1)
        nt = sim2(O, H, Lo, C, VB, sv, P, SHORT_V, st, sg, o, 1, 0, si_, so, cm, out, cnt, FAMID, ign, chase_same, zmin, q, u)
        for r in out[:nt]:
            rows.append((d, si) + tuple(r))
    X = pd.DataFrame(rows, columns=["date", "si", "k", "entry", "exit", "S", "oc", "R", "gR", "armbar", "fillbar",
                                    "exitbar", "tp", "notgt"])
    return X[X["date"] >= S.START].reset_index(drop=True), dict(zip(["armed", "chased", "cancelled", "filled", "skipped"], cnt.tolist()))


def setup():
    W, DV, Dold, tick = J.load()
    nsess = len(W); costs = (0.10, 0.10, 0.12); floor = 5 * tick
    stops = S.R.rolling_stops(S.R.touches(Dold, W), nsess, "usd", wins=["3m"])
    return W, DV, Dold, tick, nsess, costs, floor, stops, S.prep(DV, W)


def main():
    W, DV, Dold, tick, nsess, costs, floor, stops, sess = setup()
    rng = np.random.default_rng(SEED)
    res = {}
    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)
    for key, (ign, cs, lab) in VARIANTS.items():
        X, cnt = run_var(sess, stops, costs, floor, ign, cs)
        a = S.summarise(X, rng, key)
        o = X[X["date"].dt.year > IS_END]
        a.update(OOS_tot_wo_top1=J.top_cut(o.R.to_numpy(), 0.01), OOS_tot_wo_top5=J.top_cut(o.R.to_numpy(), 0.05),
                 label=lab, ign=ign, chase_same=cs, p_one_sided=S.pval(X, SEED + 2), **{f"n_{k}": v for k, v in cnt.items()})
        res[key] = a
    assert abs(res["fill_any"]["OOS_R"] - 0.30186) < 2e-4 and res["fill_any"]["OOS_n"] == 749, "fill_any must reproduce the primary"
    prng = np.random.default_rng(SEED + 1)
    yrs = W["date"].dt.year.to_numpy(); pl = {k: [] for k in VARIANTS}
    for p in range(NPERM):
        perm = np.arange(nsess)
        for y in np.unique(yrs):
            m = yrs == y; perm[m] = prng.permutation(perm[m])
        spp = S.R.rolling_stops(S.R.touches(Dold, W, perm), nsess, "usd", wins=["3m"])
        sp_ = S.prep(DV, W, perm)
        for key, (ign, cs, _) in VARIANTS.items():
            Xp, _ = run_var(sp_, spp, costs, floor, ign, cs)
            pl[key].append(float(Xp.R[Xp["date"].dt.year > IS_END].mean()))
        if p % 20 == 19: print(f"  placebo {p + 1}/{NPERM}", flush=True)
    for key, a in res.items():
        a.update(pl1_mean=float(np.mean(pl[key])), pl1_p95=float(np.percentile(pl[key], 95)),
                 pl1_rank=float((np.array(pl[key]) < a["OOS_R"]).mean()))
        say(f"{key:12s} IS {a['IS_R']:+.3f} (n {a['IS_n']}) | OOS {a['OOS_R']:+.3f} [{a['OOS_lo']:+.3f},{a['OOS_hi']:+.3f}] n {a['OOS_n']} "
            f"total {a['OOS_totR']:+.1f}R w/o top1% {a['OOS_tot_wo_top1']:+.1f}R gross {a['OOS_gross']:+.3f} PF {a['OOS_pf']:.2f} "
            f"| fake {a['pl1_mean']:+.3f} p95 {a['pl1_p95']:+.3f} rank {100 * a['pl1_rank']:.0f}% | p {a['p_one_sided']:.3f} "
            f"| armed {a['n_armed']} chased {a['n_chased']} cancelled {a['n_cancelled']} filled {a['n_filled']}")
    json.dump({"seed": SEED, "variants": res, "placebo_means": pl}, open(OUT / "entry_rules.json", "w"), indent=1, default=float)
    (OUT / "entry_rules_report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
