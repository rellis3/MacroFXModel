"""Proof pack for vol-layer-features-confirm: reproduction, planted effects, shuffles and power for the four scored cells.

    python -X utf8 scripts/vol-layer-features-confirm/proof.py

Needs the 1-minute grid cache (analysis/output/vol-layer-features-confirm/grid/grid.npz, built by run.py from data/m1_bidask)
and the confirm run's results.json. Uses run.py's own Win pipeline on the same confirm window, warm-up, seed and bootstrap weights.

For each cell:
  1. Re-computes the estimate and 95% interval from per-session sums and checks it matches results.json (diagnostics).
     If any cell does not reproduce, the diagnostics fail and the gate says INVALID.
  2. Plants an effect of known size at the per-session-sum stage, so the planted size is exact, and checks that the
     estimate moves by it. This shows the pooling and the date-block bootstrap see an effect of that size. It does not
     re-test the grid build; step 0 did that against discovery (5 of 5 values to 3 dp) and on a simulated one-factor model.
       TOD  add s_i * d * den to each pair's overlap numerator (overlap share + d, so TOD + d). Large 0.20, min 0.10 (bar).
       SIG  add d * den to the high-third numerator. Large 0.20, min 0.10 (bar).
       FR   shrink the off-diagonal second moments on loud (top-pool) sessions until -F rises by exactly d.
            Large 0.10, min 0.05 (bar).
       EQ   equivalence-breaking: add k * margin to the dollar-led follow at both horizons; shift = how far the
            equivalence effect FELL. Large k = 2, min k = 1 (one full margin).
  3. Shuffle (20 times, the truth is then zero):
       TOD  swap each session's overlap and Asia sums with probability 1/2.
       SIG  permute sigma across the scored complete sessions.
       FR   shuffle the top / bottom labels within each year.
       EQ   swap each big move's dollar-led / own-led label with probability 1/2 (on the raw difference).
  4. verdict_gate.decide picks the word. checks.json is written only if every word equals the banked word
     (RESULTS.md / results.json). Otherwise checks_MISMATCH_do_not_commit.json is written and the script exits 2.

Orientation (better = positive): TOD +T, min 0.10. SIG +S, min 0.10. FR -F, min 0.05.
EQ effect = min over 1h / rest of (1 - |delta_h| / margin_h), min 0, so VALIDATED = the whole interval inside both margins.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge import verdict_gate as G  # noqa: E402

_spec = importlib.util.spec_from_file_location("vlfc_run", Path(__file__).with_name("run.py"))
R = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(R)

SLUG = "vol-layer-features-confirm"
OUT = R.OUT
N_SHUF = 20
TOL = 1e-4
BANKED = {"tod": "VALIDATED", "sig": "NULL", "fr": "VALIDATED", "eq": "VALIDATED"}     # RESULTS.md


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 5)


def ci(reps):
    v = np.asarray(reps, float)
    v = v[np.isfinite(v)]
    lo, hi = np.percentile(v, [2.5, 97.5])
    return float(lo), float(hi)


def ratio(w, num, den, mask, W):
    return w.ratio(num, den, mask, W)


# ------------------------------------------------------------------------------------------------ TOD / SIG sums
def tod_sums(w, be):
    """Per pair: (num, den, ok) for the overlap and Asia buckets, exactly as Win.bucket_share builds them."""
    Pxd, Pdd, Pxx, st = w.prods(5)
    out = []
    for i in range(7):
        row = {}
        for nm, (a, b) in (("ov", R.TOD_BASE[0]), ("as", R.TOD_BASE[1])):
            sel = (st >= a) & (st < b)
            A, Bb, C = Pxd[i][:, sel].sum(1), Pdd[i][:, sel].sum(1), Pxx[i][:, sel].sum(1)
            ok = w.good & np.isfinite(be[i]) & (Pxx[i].sum(1) > 0) & (C > 0)
            row[nm] = [np.nan_to_num(2 * be[i] * A - be[i] ** 2 * Bb), C, ok]
        out.append(row)
    return out


def tod_stat(w, S, W, plant=0.0, swap=None):
    pts, reps = [], []
    for i in range(7):
        no, do, oo = S[i]["ov"]
        na, da, oa = S[i]["as"]
        no = no + R.TSIGN[i] * plant * do
        if swap is not None:
            no, na = np.where(swap, na, no), np.where(swap, no, na)
            do, da = np.where(swap, da, do), np.where(swap, do, da)
            oo, oa = np.where(swap, oa, oo), np.where(swap, oo, oa)
        po, ro = ratio(w, no, do, oo, W)
        pa, ra = ratio(w, na, da, oa, W)
        pts.append(R.TSIGN[i] * (po - pa))
        reps.append(R.TSIGN[i] * (ro - ra))
    return float(np.mean(pts)), np.mean(np.stack(reps), 0)


def sig_stat(w, be, Sg, W, plant=0.0):
    Pxd, Pdd, Pxx, _ = w.prods(5)
    pts, reps = [], []
    for i in range(7):
        sxy, sxx, syy = Pxd[i].sum(1), Pdd[i].sum(1), Pxx[i].sum(1)
        ok = w.good & np.isfinite(be[i]) & (syy > 0) & np.isfinite(Sg[i])
        cuts = np.nanpercentile(Sg[i][ok & w.scored], [100 / 3, 200 / 3])
        g = np.digitize(Sg[i], cuts)
        num = np.nan_to_num(2 * be[i] * sxy - be[i] ** 2 * sxx)
        num_hi = num + plant * syy
        ph, rh = ratio(w, num_hi, syy, ok & (g == 2), W)
        pl, rl = ratio(w, num, syy, ok & (g == 0), W)
        pts.append(ph - pl)
        reps.append(rh - rl)
    return float(np.mean(pts)), np.mean(np.stack(reps), 0)


# ------------------------------------------------------------------------------------------------ FR
def fr_stat(w, top, bot, W, shrink=0.0):
    sc = w.scored
    Cf = w.Cf.copy()
    if shrink:
        off = ~np.eye(7, dtype=bool).ravel()
        Cf[np.ix_(top, off)] *= (1 - shrink)
    pt = R.Win.corr_stats(Cf[top].sum(0), np.array(w.nbf[top].sum()), Cf[bot].sum(0), np.array(w.nbf[bot].sum()))
    At, Ab = np.where(top[:, None], Cf, 0)[sc], np.where(bot[:, None], Cf, 0)[sc]
    rp = R.Win.corr_stats(W @ At, W @ np.where(top, w.nbf, 0)[sc], W @ Ab, W @ np.where(bot, w.nbf, 0)[sc])
    return float(pt["F"]), rp["F"]


def bisect(f, target, lo=0.0, hi=0.95, it=60):
    if f(hi) < target:
        return None
    for _ in range(it):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if f(mid) >= target else (mid, hi)
    return hi


# ------------------------------------------------------------------------------------------------ EQ
def eq_raw(w, E, dol, own, W, add=0.0):
    out = {}
    for hn in R.HZ:
        x = E[f"f_{hn}"].to_numpy(float) + np.where(dol, add * R.MARGIN[hn], 0.0)
        E2 = pd.DataFrame({"d": E.d.to_numpy(), "x": x})
        pd_, rd, nd = w.emean(E2, dol, "x", W)
        po, ro, no = w.emean(E2, own, "x", W)
        out[hn] = (pd_ - po, rd - ro, nd, no)
    return out


def eq_effect(q):
    e = min(1 - abs(q[hn][0]) / R.MARGIN[hn] for hn in R.HZ)
    er = np.minimum.reduce([1 - np.abs(q[hn][1]) / R.MARGIN[hn] for hn in R.HZ])
    lo, hi = ci(er)
    return e, lo, hi


def main():
    log = print
    res = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    full = json.loads((OUT / "confirm" / "full.json").read_text(encoding="utf-8"))
    banked = {c["name"].rsplit("-", 1)[-1]: c for c in res["cells"]}
    days_all, L, HS, RAW = R.grid()
    w = R.make_window(days_all, L, HS, RAW, R.CONF[0], R.CONF[1], warm=R.WARM)
    assert max(w.days.tolist()) <= R.HARD_END
    W = R.boot_W(w.nU)
    be = w.beta()
    rng = np.random.default_rng(R.SEED)
    n_sess = int((w.good & w.scored).sum())
    rows_s = {"used": n_sess, "dropped": int(w.scored.sum() - n_sess), "note": "complete sessions (all 7 majors >= 900 M1 bars); dropped = incomplete scored weekdays"}
    q = {}

    def same(a, b):
        return a is not None and b is not None and abs(float(a) - float(b)) <= TOL

    def planted_share(stat, est, d, tag):
        e2, r2 = stat(d)
        lo2, hi2 = ci(r2)
        return {"injected": d, "shift": e2 - est, "lo_after": lo2, "hi_after": hi2, "how": tag}

    # ---- TOD
    S = tod_sums(w, be)
    est, reps = tod_stat(w, S, W)
    lo, hi = ci(reps)
    b = banked["tod"]
    rep_ok = same(est, b["est"]) and same(lo, b["lo"]) and same(hi, b["hi"])
    pl = planted_share(lambda d: tod_stat(w, S, W, plant=d), est, 0.20, "added s_i*0.20*den to each pair's overlap numerator per session")
    pm = planted_share(lambda d: tod_stat(w, S, W, plant=d), est, 0.10, "added s_i*0.10*den to each pair's overlap numerator per session")
    sh = []
    for _ in range(N_SHUF):
        sw = rng.random(w.nD) < 0.5
        e_, r_ = tod_stat(w, S, W, swap=sw)
        sh.append((e_, *ci(r_)))
    sh = np.array(sh)
    shuf = {"effect": float(sh[:, 0].mean()), "lo": float(sh[:, 1].mean()), "hi": float(sh[:, 2].mean()), "each": [r4(v) for v in sh[:, 0]],
            "how": f"swapped each session's overlap and Asia sums with probability 1/2, {N_SHUF} times (truth zero)"}
    ok = bool(rep_ok and pl["lo_after"] > 0)
    q[f"{SLUG}-tod"] = dict(effect=est, lo=lo, hi=hi, min_effect=R.BAR["tod"],
                            diagnostics={"ok": ok, "why": None if ok else "re-run did not reproduce results.json or the large plant was missed",
                                         "reproduced": rep_ok, "banked": [b["est"], b["lo"], b["hi"]], "mde_80pct_alpha0.0125": b["mde"]},
                            planted_large=pl, planted_min=pm, shuffle=shuf, rows=rows_s)
    log(f"tod {est:+.4f} [{lo:+.4f}, {hi:+.4f}] repro {rep_ok}  planted {pl['shift']:+.4f}/{pm['shift']:+.4f}  shuffle [{shuf['lo']:+.4f}, {shuf['hi']:+.4f}]")

    # ---- SIG
    est, reps = sig_stat(w, be, w.SIG, W)
    lo, hi = ci(reps)
    b = banked["sig"]
    rep_ok = same(est, b["est"]) and same(lo, b["lo"]) and same(hi, b["hi"])
    pl = planted_share(lambda d: sig_stat(w, be, w.SIG, W, plant=d), est, 0.20, "added 0.20*den to the high-third numerator per session")
    pm = planted_share(lambda d: sig_stat(w, be, w.SIG, W, plant=d), est, 0.10, "added 0.10*den to the high-third numerator per session")
    sh = []
    gsc = np.flatnonzero(w.good & w.scored)
    for _ in range(N_SHUF):
        Sg = w.SIG.copy()
        for i in range(7):
            Sg[i, gsc] = w.SIG[i, gsc][rng.permutation(len(gsc))]
        e_, r_ = sig_stat(w, be, Sg, W)
        sh.append((e_, *ci(r_)))
    sh = np.array(sh)
    shuf = {"effect": float(sh[:, 0].mean()), "lo": float(sh[:, 1].mean()), "hi": float(sh[:, 2].mean()), "each": [r4(v) for v in sh[:, 0]],
            "how": f"permuted sigma across the scored complete sessions per pair, {N_SHUF} times (truth zero)"}
    ok = bool(rep_ok and pl["lo_after"] > 0)
    q[f"{SLUG}-sig"] = dict(effect=est, lo=lo, hi=hi, min_effect=R.BAR["sig"],
                            diagnostics={"ok": ok, "why": None if ok else "re-run did not reproduce results.json or the large plant was missed",
                                         "reproduced": rep_ok, "banked": [b["est"], b["lo"], b["hi"]], "mde_80pct_alpha0.0125": b["mde"]},
                            planted_large=pl, planted_min=pm, shuffle=shuf, rows=rows_s)
    log(f"sig {est:+.4f} [{lo:+.4f}, {hi:+.4f}] repro {rep_ok}  planted {pl['shift']:+.4f}/{pm['shift']:+.4f}  shuffle [{shuf['lo']:+.4f}, {shuf['hi']:+.4f}]")

    # ---- FR (oriented: effect = -F)
    w.fr_setup()
    dec = w.deciles(w.act)
    top, bot = (dec >= 7) & w.scored, (dec >= 0) & (dec < 3) & w.scored
    F, rF = fr_stat(w, top, bot, W)
    est = -F
    lo, hi = ci(-rF)
    b = banked["fr"]
    rep_ok = same(F, b["est"]) and same(-hi, b["lo"]) and same(-lo, b["hi"])
    plf = {}
    for tag, d in (("large", 0.10), ("min", 0.05)):
        g = bisect(lambda s: -fr_stat(w, top, bot, W[:1], shrink=s)[0] - est, d)
        if g is None:
            plf[tag] = {"injected": d, "shift": 0.0, "how": "could not shrink loud-day co-movement enough"}
            continue
        F2, r2 = fr_stat(w, top, bot, W, shrink=g)
        lo2, hi2 = ci(-r2)
        plf[tag] = {"injected": d, "shift": -F2 - est, "lo_after": lo2, "hi_after": hi2, "shrink": g,
                    "how": f"multiplied the off-diagonal 5-min second moments of top-pool sessions by {1 - g:.3f} so -F rises by exactly {d}"}
    sh = []
    yrs = w.years
    for _ in range(N_SHUF):
        t2, b2 = top.copy(), bot.copy()
        for y in R.YEARS:
            idx = np.flatnonzero((top | bot) & (yrs == y))
            lab = top[idx][rng.permutation(len(idx))]
            t2[idx], b2[idx] = lab, ~lab
        e_, r_ = fr_stat(w, t2, b2, W)
        sh.append((-e_, *ci(-r_)))
    sh = np.array(sh)
    shuf = {"effect": float(sh[:, 0].mean()), "lo": float(sh[:, 1].mean()), "hi": float(sh[:, 2].mean()), "each": [r4(v) for v in sh[:, 0]],
            "how": f"shuffled the loud (deciles 8-10) / quiet (1-3) labels within each year, {N_SHUF} times (truth zero)"}
    ok = bool(rep_ok and plf["large"].get("lo_after", -1) > 0)
    q[f"{SLUG}-fr"] = dict(effect=est, lo=lo, hi=hi, min_effect=-R.BAR["fr"],
                           diagnostics={"ok": ok, "why": None if ok else "re-run did not reproduce results.json or the large plant was missed",
                                        "reproduced": rep_ok, "banked_F": [b["est"], b["lo"], b["hi"]], "mde_80pct_alpha0.0125": b["mde"],
                                        "orientation": "effect = -F (F = corrected rho loud minus raw rho quiet); A1: F = 0 is not the dollar-only benchmark (that is about +0.18), so the bar is conservative"},
                           planted_large=plf["large"], planted_min=plf["min"], shuffle=shuf,
                           rows={"used": int((top | bot).sum()), "dropped": int(n_sess - (top | bot).sum()), "note": "sessions in deciles 8-10 and 1-3; dropped = deciles 4-7 (not in the statistic) and sessions with < 200 all-7 bars"})
    log(f"fr  {est:+.4f} [{lo:+.4f}, {hi:+.4f}] repro {rep_ok}  planted {plf['large']['shift']:+.4f}/{plf['min']['shift']:+.4f}  shuffle [{shuf['lo']:+.4f}, {shuf['hi']:+.4f}]")

    # ---- EQ
    E = w.events(15, be, w.SIG)
    big, dol, own = R.Win.groups(E, 90, 0.7)
    qq = eq_raw(w, E, dol, own, W)
    est, lo, hi = eq_effect(qq)
    bh = full["scored"][3]["horizons"]
    rep_ok = all(same(qq[hn][0], bh[hn]["est"]) and same(ci(qq[hn][1])[0], bh[hn]["lo"]) and same(ci(qq[hn][1])[1], bh[hn]["hi"]) for hn in R.HZ)
    ple = {}
    for tag, k in (("large", 2.0), ("min", 1.0)):
        q2 = eq_raw(w, E, dol, own, W, add=k)
        e2, l2, h2 = eq_effect(q2)
        ple[tag] = {"injected": k, "shift": est - e2, "equiv_lo_after": l2, "equiv_hi_after": h2,
                    "raw_after": {hn: r4(q2[hn][0]) for hn in R.HZ},
                    "how": f"added {k} x margin to every dollar-led follow at both horizons (equivalence-breaking); shift = how far min(1 - |delta|/margin) FELL"}
    sh = []
    cand = np.flatnonzero(dol | own)
    for _ in range(N_SHUF):
        sw = rng.random(len(cand)) < 0.5
        d2, o2 = dol.copy(), own.copy()
        d2[cand[sw]], o2[cand[sw]] = own[cand[sw]], dol[cand[sw]]
        qs = eq_raw(w, E, d2, o2, W)
        sh.append((qs["1h"][0], *ci(qs["1h"][1])))
    sh = np.array(sh)
    shuf = {"effect": float(sh[:, 0].mean()), "lo": float(sh[:, 1].mean()), "hi": float(sh[:, 2].mean()), "each": [r4(v) for v in sh[:, 0]],
            "how": f"swapped each big move's dollar-led / own-led label with probability 1/2, {N_SHUF} times; on the raw 1h difference (truth zero)"}
    ok = bool(rep_ok and ple["large"]["equiv_hi_after"] < 0)
    q[f"{SLUG}-eq"] = dict(effect=est, lo=lo, hi=hi, min_effect=0.0,
                           diagnostics={"ok": ok, "why": None if ok else "re-run did not reproduce results.json or the large break was not detected",
                                        "reproduced": rep_ok, "raw": {hn: [r4(qq[hn][0]), *[r4(v) for v in ci(qq[hn][1])]] for hn in R.HZ},
                                        "tost_p": full["scored"][3]["p"], "tost_min_margin": {hn: bh[hn]["min_margin_tost"] for hn in R.HZ},
                                        "orientation": "effect = min over 1h / rest of 1 - |delta|/margin; min_effect 0, so VALIDATED = whole interval inside both margins; the gate's power figure is not meaningful at min_effect 0 (see tost_min_margin)"},
                           planted_large=ple["large"], planted_min=ple["min"], shuffle=shuf,
                           rows={"used": int(qq["1h"][2] + qq["1h"][3]), "dropped": int(big.sum() - qq["1h"][2] - qq["1h"][3]),
                                 "note": f"1h events with a finite outcome: {qq['1h'][2]} dollar-led, {qq['1h'][3]} own-led; dropped = big moves in neither group or no 1h outcome"})
    log(f"eq  {est:+.4f} [{lo:+.4f}, {hi:+.4f}] repro {rep_ok}  planted {ple['large']['shift']:+.4f}/{ple['min']['shift']:+.4f}  shuffle [{shuf['lo']:+.5f}, {shuf['hi']:+.5f}]")

    out = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, r in out.items():
        exp = BANKED[k.rsplit("-", 1)[-1]]
        flag = "" if r["verdict"] == exp else f"   <-- banked {exp}"
        log(f"  {k}: {r['verdict']:13s} power {None if r['power'] is None else round(r['power'], 3)}  {r['reasons'][0]}{flag}")
        if r["verdict"] in ("INVALID", "INCOMPLETE") or r["verdict"] != exp:
            bad.append(k)
    dump = json.dumps(out, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    if bad:
        (OUT / "checks_MISMATCH_do_not_commit.json").write_text(dump, encoding="utf-8")
        log("MISMATCH: " + ", ".join(bad) + " -> checks_MISMATCH_do_not_commit.json")
        sys.exit(2)
    (OUT / "checks.json").write_text(dump, encoding="utf-8")
    log("checks.json written: every gate word equals the banked word")


if __name__ == "__main__":
    main()
