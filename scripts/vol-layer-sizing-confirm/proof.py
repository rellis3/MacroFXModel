"""Proof pack for vol-layer-sizing-confirm: reproduction, planted effects, shuffles and power for the four scored cells (a, b, c, e).

    python -X utf8 scripts/vol-layer-sizing-confirm/proof.py

What it does:
  1. Re-runs run.py's own load / scale / month_table / cells on the confirm window (2023-01-01 .. 2026-08-20, pit sigma) and checks
     that every scored estimate and CI end matches analysis/output/vol-layer-sizing-confirm/results.json to 4 dp. If not, every
     question's diagnostics fail (the gate then says INVALID).
  2. Builds forge/verdict_gate.py's inputs per cell, oriented so better is positive:
       a  effect = dev_U - dev_F                  min_effect = 0.05 (prereg pass bar)
       e  effect = dev_MM - dev_F                 min_effect = 0.05 (prereg pass bar)
       c  effect = tail%_F - tail%_FA (quiet)     min_effect = 0.25pp (prereg pass bar)
       b  effect = 0.02 - |dev_T20 - dev_F|       min_effect = 0 : interval above 0 = the whole CI inside +/-0.02 (equivalence),
          interval below 0 = the whole CI outside it (the prereg's NULL). Interval = bootstrap percentiles of 0.02 - |d|.
  3. Planted effects go through the same pipeline (scale -> month table -> bootstrap):
       a, e  the comparison arm's (U / MM) realised SD in every instrument-month is pushed AWAY from 1 by delta (z multiplied by
             (SD + delta*sign(SD-1)) / SD in that month), so its deviation grows by delta. Large 0.10, minimum 0.05.
       c     on a random delta% of quiet-day sessions where |z_F| <= 3 and |z_FA| <= 3, z_F is set to 3.5 (FA left alone), so F's
             quiet-day tail rate rises by delta pp. Large 0.50pp, minimum 0.25pp.
       b     T20's monthly SD is pushed away from 1 by delta (equivalence-BREAKING). Shift = how far the equivalence effect FELL.
             Large 0.04 (twice the margin), minimum 0.02 (the margin).
  4. Shuffles (true effect zero):
       a     run.py's whole-month sigma shuffle (200): the real F - U must beat every shuffle (placebo form).
       b, e  paired swap of the two arms' monthly SDs per instrument-month with probability 1/2, 20 times; the raw difference's
             mean interval must include 0 (for b the shuffle is on the raw difference d, not on 0.02 - |d|).
       c     paired swap of z_F / z_FA per session with probability 1/2, 20 times; the interval must include 0.
  5. verdict_gate.decide picks each word. checks.json is written only if all four equal the banked VALIDATED; otherwise
     checks_MISMATCH_do_not_commit.json is written and the script exits 2. The proof never rewrites a verdict.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forge import verdict_gate as G  # noqa: E402

_spec = importlib.util.spec_from_file_location("vsc_run", ROOT / "scripts/vol-layer-sizing-confirm/run.py")
R = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(R)  # run.py is import-safe (main is guarded)

SLUG = "vol-layer-sizing-confirm"
OUT = ROOT / "analysis/output" / SLUG
EXPECTED = {"a": "VALIDATED", "b": "VALIDATED", "c": "CONTEXT", "e": "VALIDATED"}
N_SHUF = 20
MARGIN = R.MARGIN_B


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def push(M, v, delta):
    """Copy of the month table with arm v's SD pushed away from 1 by delta in every instrument-month (deviation + delta)."""
    M2 = M.copy()
    sd = M2[v]
    M2[v] = sd + delta * np.sign(sd - 1).replace(0, 1)
    M2["dev_" + v] = (M2[v] - 1).abs()
    return M2


def push_z(D, Z, M, v, delta):
    """The same push applied to the z series itself, then the month table rebuilt (goes through month_table)."""
    key = D.inst + "|" + D.month
    mk = M.inst + "|" + M.month
    sd = pd.Series(M[v].to_numpy(), index=mk.to_numpy())
    f = ((sd + delta * np.sign(sd - 1).replace(0, 1)) / sd).reindex(key.to_numpy()).fillna(1.0).to_numpy()
    Z2 = Z.copy()
    Z2[v] = Z[v].to_numpy() * f
    return Z2, R.month_table(D, Z2)


def dev_effect(M, a, b):
    """Oriented effect dev_a - dev_b (a = the worse arm), with its bootstrap interval."""
    est, lo, hi, reps = R.dev_diff(M, a, b)
    return est, lo, hi, reps


def equiv(M):
    est, lo, hi, reps = R.dev_diff(M, "T20", "F")
    e = MARGIN - abs(est)
    er = MARGIN - np.abs(reps)
    elo, ehi = np.nanpercentile(er, [2.5, 97.5])
    return e, float(elo), float(ehi), (est, lo, hi, reps)


def tail_effect(D, Z, mask):
    est, lo, hi, reps = R.tail_diff(D, Z, "F", "FA", mask)
    return est, lo, hi, reps


def main():
    log = print
    res = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    banked = {c["name"][-1]: c for c in res["cells"]}
    D = R.load("pit_sig_used", *R.CONF)
    assert D.date.max() <= R.CONF[1] < R.LOCKBOX
    raw_rows = sum(int(((pd.read_csv(f, usecols=["date"]).date >= R.CONF[0]) & (pd.read_csv(f, usecols=["date"]).date <= R.CONF[1])).sum())
                   for f in sorted(R.HIST.glob("*.csv")))
    Z = R.scale(D)
    M = R.month_table(D, Z)
    C = R.cells(D, Z, M)
    # 1. reproduction
    rep_notes = []
    for c in "abce":
        for k in ("est", "lo", "hi"):
            if r4(C[c][k]) != banked[c][k]:
                rep_notes.append(f"{c}.{k}: {r4(C[c][k])} vs banked {banked[c][k]}")
    reproduced = not rep_notes
    disc = json.loads((OUT / "discovery/discovery.json").read_text(encoding="utf-8"))
    conf = json.loads((OUT / "confirm/confirm.json").read_text(encoding="utf-8"))
    step0 = bool(disc["step0_pass"] and conf["controls"]["positive_pass"] and conf["controls"]["null_pass"])
    log("reproduction:", "OK" if reproduced else "FAILED " + "; ".join(rep_notes), "| step 0 + confirm controls:", step0)
    ok = reproduced and step0
    diag = {"ok": ok, "why": None if ok else "; ".join(x for x in ["re-run did not reproduce results.json: " + "; ".join(rep_notes) if rep_notes else None,
                                                                   None if step0 else "step 0 or the confirm controls failed"] if x),
            "note": (f"run.py re-run reproduces all 12 scored numbers in results.json; step 0 passed (exact stage 3 reproduction, "
                     f"positive control {disc['controls']['positive_F_minus_U'][0]}, null control {disc['controls']['null_F_minus_U'][0]}, "
                     f"discovery mirror pass); confirm-path controls {conf['controls']['positive_F_minus_U'][0]} / {conf['controls']['null_F_minus_U'][0]}")}
    rows = {"used": int(len(D)), "dropped": int(raw_rows - len(D)), "months": int(M.month.nunique()),
            "note": "dropped = confirm-window rows removed by sigma>0 / missing r_ocs / trailing-input filters"}
    rng = np.random.default_rng(R.SEED + 7)
    q = {}

    # ---- a and e: monthly deviation
    for c, (worse, better, label) in {"a": ("U", "F", "unscaled"), "e": ("MM", "F", "1/sigma^2")}.items():
        est, lo, hi, _ = dev_effect(M, worse, better)
        pl = {}
        for tag, d in (("large", 0.10), ("min", 0.05)):
            Z2, M2 = push_z(D, Z, M, worse, d)
            e2, l2, h2, _ = dev_effect(M2, worse, better)
            pl[tag] = {"injected": d, "shift": e2 - est, "lo_after": l2,
                       "how": f"pushed the {label} arm's realised SD in every instrument-month {d} further from 1 (z rescaled in that month), rebuilt the month table and re-bootstrapped"}
        if c == "a":
            mir = R.mirror(D, -est)          # run.py convention: F - U is negative
            shuf = {"real_beats_all": bool(mir["share_below_real"] == 0.0), "real": mir["real"], "shuffle_min": mir["shuffle_min"],
                    "shuffle_p2.5": mir["shuffle_p2.5"], "n": mir["n"],
                    "how": "each instrument's sigma path shuffled in whole calendar months (200); real F - U must be below every shuffle"}
        else:
            se_, sl, sh = [], [], []
            for _ in range(N_SHUF):
                sw = rng.random(len(M)) < 0.5
                Ms = M.copy()
                Ms["dev_" + worse] = np.where(sw, M["dev_" + better], M["dev_" + worse])
                Ms["dev_" + better] = np.where(sw, M["dev_" + worse], M["dev_" + better])
                e_, l_, h_, _ = dev_effect(Ms, worse, better)
                se_.append(e_); sl.append(l_); sh.append(h_)
            shuf = {"effect": float(np.mean(se_)), "lo": float(np.mean(sl)), "hi": float(np.mean(sh)), "each": [r4(v) for v in se_],
                    "how": f"swapped the {label} and sigma monthly deviations per instrument-month with probability 1/2, {N_SHUF} times"}
        q[c] = dict(effect=est, lo=lo, hi=hi, min_effect=R.BARS[c],
                    diagnostics={**diag, "mde_80pct_alpha0.0125": banked[c]["mde"]},
                    planted_large=pl["large"], planted_min=pl["min"], shuffle=shuf, rows=rows)
        log(f"{c}: {est:+.4f} [{lo:+.4f}, {hi:+.4f}] planted large {pl['large']['shift']:+.4f} min {pl['min']['shift']:+.4f}")

    # ---- c: quiet-day tail days
    low = D.low.to_numpy()
    est, lo, hi, _ = tail_effect(D, Z, low)
    pl = {}
    zf, zfa = Z.F.to_numpy(), Z.FA.to_numpy()
    cand = np.flatnonzero(low & (np.abs(zf) <= 3) & (np.abs(zfa) <= 3))
    for tag, d in (("large", 0.50), ("min", 0.25)):
        k = int(round(d / 100 * low.sum()))
        pick = rng.choice(cand, k, replace=False)
        Z2 = Z.copy()
        z2 = zf.copy()
        z2[pick] = 3.5
        Z2["F"] = z2
        e2, l2, h2, _ = tail_effect(D, Z2, low)
        pl[tag] = {"injected": d, "shift": e2 - est, "lo_after": l2, "sessions_set": k,
                   "how": f"set z_F to 3.5 on {k} random quiet-day sessions inside +/-3 under both sizings (FA untouched): +{d}pp on F's quiet-day tail rate"}
    se_, sl, sh = [], [], []
    for _ in range(N_SHUF):
        sw = rng.random(len(D)) < 0.5
        Zs = Z.copy()
        Zs["F"] = np.where(sw, zfa, zf)
        Zs["FA"] = np.where(sw, zf, zfa)
        e_, l_, h_, _ = tail_effect(D, Zs, low)
        se_.append(e_); sl.append(l_); sh.append(h_)
    shuf = {"effect": float(np.mean(se_)), "lo": float(np.mean(sl)), "hi": float(np.mean(sh)), "each": [r4(v) for v in se_],
            "how": f"swapped z_F / z_FA per session with probability 1/2, {N_SHUF} times"}
    q["c"] = dict(effect=est, lo=lo, hi=hi, min_effect=R.BARS["c"], diagnostics={**diag, "mde_80pct_alpha0.0125": banked["c"]["mde"]},
                  planted_large=pl["large"], planted_min=pl["min"], shuffle=shuf,
                  rows={**rows, "quiet_day_dates": int(D.date[low].nunique()), "quiet_sessions": int(low.sum())})
    log(f"c: {est:+.4f} [{lo:+.4f}, {hi:+.4f}] planted large {pl['large']['shift']:+.4f} min {pl['min']['shift']:+.4f}")

    # ---- b: equivalence
    e, elo, ehi, raw = equiv(M)
    pl = {}
    for tag, d in (("large", 0.04), ("min", 0.02)):
        Z2, M2 = push_z(D, Z, M, "T20", d)
        e2, l2, h2, raw2 = equiv(M2)
        pl[tag] = {"injected": d, "shift": e - e2, "raw_diff_after": [r4(raw2[0]), r4(raw2[1]), r4(raw2[2])], "equiv_lo_after": l2,
                   "equiv_hi_after": h2,
                   "how": f"pushed T20's monthly SD {d} further from 1 (equivalence-breaking); shift = how far 0.02 - |d| FELL"}
    se_, sl, sh = [], [], []
    for _ in range(N_SHUF):
        sw = rng.random(len(M)) < 0.5
        Ms = M.copy()
        Ms["dev_T20"] = np.where(sw, M.dev_F, M.dev_T20)
        Ms["dev_F"] = np.where(sw, M.dev_T20, M.dev_F)
        e_, l_, h_, _ = R.dev_diff(Ms, "T20", "F")
        se_.append(e_); sl.append(l_); sh.append(h_)
    shuf = {"effect": float(np.mean(se_)), "lo": float(np.mean(sl)), "hi": float(np.mean(sh)), "each": [r4(v) for v in se_],
            "how": f"swapped T20 / sigma monthly deviations per instrument-month with probability 1/2, {N_SHUF} times; on the raw difference d"}
    q["b"] = dict(effect=e, lo=elo, hi=ehi, min_effect=0.0,
                  diagnostics={**diag, "raw_diff": [r4(raw[0]), r4(raw[1]), r4(raw[2])], "tost_holm_p": banked["b"]["holmP"],
                               "tost_mde": banked["b"]["mde"],
                               "orientation": "effect = 0.02 - |dev_T20 - dev_F|; min_effect 0, so VALIDATED = whole interval inside the margin, "
                                              "NULL = whole interval outside it; the gate's power figure is not meaningful at min_effect 0 (see tost_mde)"},
                  planted_large=pl["large"], planted_min=pl["min"], shuffle=shuf, rows=rows)
    log(f"b: equiv effect {e:+.4f} [{elo:+.4f}, {ehi:+.4f}] planted large {pl['large']['shift']:+.4f} min {pl['min']['shift']:+.4f}")

    q = {f"{SLUG}-{c}": q[c] for c in "abce"}
    out = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, r in out.items():
        exp = EXPECTED[k[-1]]
        flag = "" if r["verdict"] == exp else f"   <-- banked {exp}"
        log(f"  {k}: {r['verdict']:13s} power {None if r['power'] is None else round(r['power'], 3)}  {r['reasons'][0]}{flag}")
        if r["verdict"] in ("INVALID", "INCOMPLETE") or r["verdict"] != exp:
            bad.append(k)
    dump = lambda o: json.dumps(o, indent=1, default=lambda x: x.item() if hasattr(x, "item") else str(x))  # noqa: E731
    if bad:
        p = OUT / "checks_MISMATCH_do_not_commit.json"
        p.write_text(dump(out), encoding="utf-8")
        log("MISMATCH:", bad, "->", p)
        sys.exit(2)
    p = OUT / "checks.json"
    p.write_text(dump(out), encoding="utf-8")
    log("wrote", p)


if __name__ == "__main__":
    main()
