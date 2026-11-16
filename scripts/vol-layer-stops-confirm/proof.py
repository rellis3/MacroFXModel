"""Proof pack for vol-layer-stops-confirm: planted effects, shuffles, power and reproduction, one question per scored cell.

    python -X utf8 scripts/vol-layer-stops-confirm/proof.py     (DATA_ROOT -> the checkout with analysis/output/vol-layer-deep/...)

Needs the confirm build (analysis/output/vol-layer-stops-confirm/confirm/*.parquet, from `score.py build`) and the scored
results.json. It re-runs score.py's own statistics, checks they reproduce results.json, then hands forge/verdict_gate.py one
question per cell. It writes checks.json only if every gate word equals the study's word; otherwise
checks_MISMATCH_do_not_commit.json and exit 2. It never edits a verdict.

How each cell is put in the gate's form ("better is positive"):
  * -skill: effect = Brier skill of M_full vs M_sigma (%), min effect = the registered bar +2.0%.
      planted = pull M_full toward the outcome by lambda (P' = P + lambda (y - P)), lambda sized so the noise-free skill rises by the
      stated amount (large +5%, minimum +2%); shift = measured skill change. shuffle = swap M_full and M_sigma on each date with p = 1/2.
  * -steady: effect = SD over months (fixed) - SD (plain), pp, min effect = +2.0pp.
      planted = stretch the fixed stop's monthly deviations so its SD rises by the stated amount (large 5pp, minimum 2pp).
      shuffle = swap the plain and fixed monthly values with p = 1/2 per month.
  * -cal and -noise are equivalence cells (TOST). The gate's effect is the headroom inside the registered margin:
      -cal:   effect = min(1.0 - |CITL|, 10 x (0.10 - |slope - 1|)) in pp-equivalents; min effect = 0 (any headroom),
      -noise: effect = 0.016 - max(|excess(0.25)|, |excess(0.5)|) in sigma; min effect = 0.
      Interval = the same bootstrap replicates (95%). planted = a miscalibration / threshold of known size pushed in the direction of
      the observed lean (cal: P - delta; noise: final + delta x sign); recovery = the headroom falls by at least half of delta
      (sizes: cal 2pp and the registered MDE 0.67pp; noise 0.03 and the registered MDE 0.008 sigma). The gate wants the shift to be
      positive, so shift = headroom(real) - headroom(planted).
      shuffle = flip the sign of each date's residual sum (CITL) / each date's excess sum (noise) with p = 1/2; the raw statistic's
      interval must include 0.
  The gate's words differ from the prereg's in one way: the prereg's CONTEXT means "passes pooled but fails a plateau/class/year/lag
  check"; the gate's CONTEXT means "interval clear of 0 but below the minimum". A cell banked CONTEXT for a failed check will therefore
  show as a mismatch here. That is reported, not papered over.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/vol-layer-stops-confirm")]
from forge import verdict_gate as G  # noqa: E402
import score as S  # noqa: E402

FD = S.FD
SLUG = "vol-layer-stops-confirm"
OUT = S.OUT
TOL = 2e-3


def bisect(f, target, lo=0.0, hi=1.0, it=60):
    for _ in range(it):
        mid = (lo + hi) / 2
        if f(mid) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def main():
    res = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
    ctrl = json.loads((S.CTRL / "control.json").read_text(encoding="utf-8"))
    frozen = json.loads(S.FROZEN.read_text(encoding="utf-8"))
    profs = json.loads((S.DEXE / "profiles.json").read_text(encoding="utf-8"))
    gf, gs = np.array(frozen["model_full"]["coef"]), np.array(frozen["model_sigma"]["coef"])
    word = {c["name"].rsplit("-", 1)[1]: c["verdict"].upper() for c in res["cells"]}
    cell = {c["name"].rsplit("-", 1)[1]: c for c in res["cells"]}
    rng = np.random.default_rng(S.SEED + 77)
    diag_ok = bool(ctrl["pass"])

    E0 = pd.read_parquet(S.CONF / "entries.parquet")
    E, dates, insts = S.frame_from_entries(E0, profs)
    nd = len(dates)
    F = FD.long_frame(E, profs)
    y = F["y"].astype(np.float64)
    pf, ps, _ = FD.predict(F, gf, gs)
    di = F["di"]
    W = S.boot_weights(nd)
    st = S.cal_stats(di, nd, y, pf, ps, W)
    repro = {"citl": [st["citl_pp"]["est"], cell["cal"]["est"]], "slope": [st["mz_slope"]["est"], cell["cal"]["slope"]["est"]],
             "skill": [st["bss_pct"]["est"], cell["skill"]["est"]]}
    q = {}

    # ---------------- -cal
    def cal_reps(p):
        Sd = FD.date_sums(di, nd, y, p, ps)
        pt = FD.stats_from({k: v.sum() for k, v in Sd.items()})
        rp = FD.stats_from({k: W @ v for k, v in Sd.items()})
        head = lambda c, s: np.minimum(1.0 - np.abs(100 * c), 10 * (0.10 - np.abs(s - 1)))  # noqa: E731
        return float(head(pt[0], pt[1])), head(rp[0], rp[1]), 100 * pt[0]
    h_real, h_reps, citl = cal_reps(pf)
    sgn = 1.0 if citl >= 0 else -1.0

    def plant_cal(delta):
        h2, _, _ = cal_reps(np.clip(pf - sgn * delta / 100, 1e-7, 1 - 1e-7))
        return {"injected": delta, "shift": h_real - h2, "how": f"predictions moved by {delta}pp in the direction of the observed CITL"}
    resid = np.bincount(di, weights=y - pf, minlength=nd)
    cnt = np.bincount(di, minlength=nd).astype(float)
    sh = []
    for _ in range(20):
        flip = np.where(rng.random(nd) < 0.5, -1.0, 1.0)
        sh.append(100 * (W @ (resid * flip)) / (W @ cnt))
    sh = np.concatenate(sh)
    q["cal"] = dict(effect=h_real, lo=float(np.percentile(h_reps, 2.5)), hi=float(np.percentile(h_reps, 97.5)), min_effect=0.0,
                    diagnostics={"ok": diag_ok, "control": ctrl["checks"]["positive_control"]["gates"],
                                 "why": "positive control or step 0 failed" if not diag_ok else ""},
                    planted_large=plant_cal(2.0), planted_min=plant_cal(0.67),
                    shuffle={"lo": float(np.percentile(sh, 2.5)), "hi": float(np.percentile(sh, 97.5)), "what": "CITL with date residual signs flipped"},
                    rows={"used": int(len(y)), "dates": nd, "dropped": res.get("drops")}, units="pp headroom inside ±1pp CITL / ±0.10 slope")
    print("cal", round(h_real, 4), q["cal"]["lo"], q["cal"]["hi"], q["cal"]["planted_large"]["shift"], q["cal"]["planted_min"]["shift"], flush=True)

    # ---------------- -skill
    def skill_of(p_full, p_sig, reps=False):
        bf = np.bincount(di, weights=(y - p_full) ** 2, minlength=nd)
        bs = np.bincount(di, weights=(y - p_sig) ** 2, minlength=nd)
        pt = 100 * (1 - bf.sum() / bs.sum())
        return (pt, 100 * (1 - (W @ bf) / (W @ bs))) if reps else pt
    sk, sk_reps = skill_of(pf, ps, True)

    def plant_skill(target):
        lam = bisect(lambda l_: skill_of(pf + l_ * (y - pf), ps) - sk, target)
        s2 = skill_of(pf + lam * (y - pf), ps)
        return {"injected": target, "shift": float(s2 - sk), "lambda": lam, "how": "M_full pulled toward the outcome by lambda"}
    swap = rng.random(nd) < 0.5
    sw = swap[di]
    s_sh, s_sh_reps = skill_of(np.where(sw, ps, pf), np.where(sw, pf, ps), True)
    q["skill"] = dict(effect=sk, lo=float(np.percentile(sk_reps, 2.5)), hi=float(np.percentile(sk_reps, 97.5)), min_effect=S.SKILL_BAR,
                      diagnostics={"ok": diag_ok}, planted_large=plant_skill(5.0), planted_min=plant_skill(2.0),
                      shuffle={"est": float(s_sh), "lo": float(np.percentile(s_sh_reps, 2.5)), "hi": float(np.percentile(s_sh_reps, 97.5)),
                               "what": "M_full and M_sigma swapped on a random half of dates"},
                      rows={"used": int(len(y)), "dates": nd}, units="% Brier skill")
    print("skill", sk, q["skill"]["planted_large"]["shift"], q["skill"]["planted_min"]["shift"], q["skill"]["shuffle"], flush=True)
    del F, y, pf, ps

    # ---------------- -steady (1 sigma, month clusters)
    Vx = FD.vol_clock(E, profs)["eod"]
    ok = np.isfinite(Vx) & E.L_eod.notna().to_numpy()
    rw = 2 * S.norm.cdf(-1.0 / np.sqrt(np.clip(Vx[ok], 1e-9, None)))
    df = pd.DataFrame({"m": E.date.str[:7].to_numpy()[ok]})
    for nm, mult in (("plain", np.ones(len(E))), ("fixed", (E.s_fix / E.s).to_numpy())):
        df[nm] = sum(((E[f"{s_}_eod"].to_numpy()[ok] >= mult[ok]).astype(float) - rw) for s_ in "LS") / 2
    M = df.groupby("m").mean()
    k = len(M)
    idx = np.random.default_rng(S.SEED + 5).integers(k, size=(S.B, k))

    def delta(pl, fx, reps=False):
        pt = 100 * (np.std(fx, ddof=1) - np.std(pl, ddof=1))
        if not reps:
            return pt
        return pt, 100 * (fx[idx].std(axis=1, ddof=1) - pl[idx].std(axis=1, ddof=1))
    pl, fx = M.plain.to_numpy(), M.fixed.to_numpy()
    dl, dl_reps = delta(pl, fx, True)
    repro["steady"] = [dl, cell["steady"]["est"]]

    def plant_steady(target):
        mu = fx.mean()
        kk = bisect(lambda a: delta(pl, mu + (fx - mu) * (1 + a)) - dl, target, 0, 20)
        return {"injected": target, "shift": float(delta(pl, mu + (fx - mu) * (1 + kk)) - dl), "stretch": kk}
    sm = rng.random(k) < 0.5
    sh_pl, sh_fx = np.where(sm, fx, pl), np.where(sm, pl, fx)
    _, shr = delta(sh_pl, sh_fx, True)
    q["steady"] = dict(effect=dl, lo=float(np.percentile(dl_reps, 2.5)), hi=float(np.percentile(dl_reps, 97.5)), min_effect=S.STEADY_BAR,
                       diagnostics={"ok": diag_ok}, planted_large=plant_steady(5.0), planted_min=plant_steady(2.0),
                       shuffle={"lo": float(np.percentile(shr, 2.5)), "hi": float(np.percentile(shr, 97.5)), "what": "plain/fixed swapped per month"},
                       rows={"used": int(ok.sum()), "months": k}, units="pp")
    print("steady", dl, q["steady"]["planted_large"]["shift"], q["steady"]["shuffle"], flush=True)

    # ---------------- -noise
    N0 = pd.read_parquet(S.CONF / "noise_entries.parquet")
    N = N0[N0.hz == "eod"].reset_index(drop=True)
    ndates = np.sort(N.date.unique())
    ndi = pd.Series(np.arange(len(ndates)), index=ndates)[N.date].to_numpy()
    Wn = S.boot_weights(len(ndates))
    mae, fin = N.mae.to_numpy(), N.final.to_numpy()

    def sums(add=0.0):
        o = {}
        for d in (0.25, 0.5):
            m = mae >= d
            o[d] = (np.bincount(ndi, weights=(fin + d + add) * m, minlength=len(ndates)),
                    np.bincount(ndi, weights=m.astype(float), minlength=len(ndates)))
        return o

    def head(o, reps=False):
        pts = [abs(a.sum() / b.sum()) for a, b in o.values()]
        h = S.NOISE_MARGIN - max(pts)
        if not reps:
            return h
        rr = np.max([np.abs((Wn @ a) / (Wn @ b)) for a, b in o.values()], axis=0)
        return h, S.NOISE_MARGIN - rr
    base = sums()
    hn, hn_reps = head(base, True)
    ex = {d: a.sum() / b.sum() for d, (a, b) in base.items()}
    repro["noise_0.25"] = [ex[0.25], cell["noise"]["est"]]
    repro["noise_0.5"] = [ex[0.5], cell["noise"]["est_0.5"]]
    sgn_n = 1.0 if ex[max(ex, key=lambda d: abs(ex[d]))] >= 0 else -1.0

    def plant_noise(dlt):
        return {"injected": dlt, "shift": float(hn - head(sums(sgn_n * dlt))), "how": "final + delta on hit rows, in the direction of the lean"}
    shn = []
    for _ in range(20):
        flip = np.where(rng.random(len(ndates)) < 0.5, -1.0, 1.0)
        a, b = base[0.25]
        shn.append((Wn @ (a * flip)) / (Wn @ b))
    shn = np.concatenate(shn)
    q["noise"] = dict(effect=hn, lo=float(np.percentile(hn_reps, 2.5)), hi=float(np.percentile(hn_reps, 97.5)), min_effect=0.0,
                      diagnostics={"ok": diag_ok}, planted_large=plant_noise(0.03), planted_min=plant_noise(0.008),
                      shuffle={"lo": float(np.percentile(shn, 2.5)), "hi": float(np.percentile(shn, 97.5)), "what": "excess(0.25) with date signs flipped"},
                      rows={"used": int(len(N)), "dates": len(ndates)}, units="σ headroom inside ±0.016σ")
    print("noise", hn, q["noise"]["planted_large"], q["noise"]["planted_min"], flush=True)

    # ---------------- reproduction, then the gate
    bad = {k_: v for k_, v in repro.items() if v[1] is None or abs(v[0] - v[1]) > TOL * max(1.0, abs(v[1]))}
    print("reproduction", "OK" if not bad else f"FAILED {bad}", flush=True)
    for c in q.values():
        c["diagnostics"]["reproduction"] = {k_: [round(float(a), 6), b] for k_, (a, b) in repro.items()}
        if bad:
            c["diagnostics"]["ok"] = False
            c["diagnostics"]["why"] = f"does not reproduce results.json: {sorted(bad)}"
    for k_, c in q.items():                                   # the study's registered gate parts (years, lag, plateau) go to the gate
        c["gate_parts"] = dict(cell[k_].get("gates") or {})
    decided = {f"{SLUG}-{k_}": {**c, **G.decide(c), "study_word": word[k_]} for k_, c in q.items()}
    mism = [k_ for k_, c in decided.items() if c["verdict"] != c["study_word"]]
    for k_, c in decided.items():
        print(f"{k_}: gate {c['verdict']} vs study {c['study_word']}  power {c['power']}  {c['reasons']}")
    dump = json.dumps(decided, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    if mism or any(c["verdict"] in ("INVALID", "INCOMPLETE") for c in decided.values()):
        (OUT / "checks_MISMATCH_do_not_commit.json").write_text(dump, encoding="utf-8")
        print("STOP:", mism, "disagree with the study's words; wrote checks_MISMATCH_do_not_commit.json")
        sys.exit(2)
    (OUT / "checks.json").write_text(dump, encoding="utf-8")
    print("PASS: wrote", OUT / "checks.json")


if __name__ == "__main__":
    main()
