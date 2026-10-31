"""vmc-nq-cipher validation, run ONCE on 2023-01-01 -> 2026-08-20 for the survivors frozen in survivors.json.

  VALIDATION GATE   Holm alpha 0.05, one-sided in the discovery direction, across the frozen survivors
  INTERACTION GATE  for F7/F8/F9 survivors: Delta(combination) - Delta(best single component state) must have a 95%
                    interval beyond 0 in the combination's direction (single components spread / wt1 / MF / price-VWAP
                    sign, sampled every 12 bars like F7; same date-block bootstrap draws). A demote-only descriptive
                    comparison against the plain WT cross (F1a, same timeframe) is reported beside it.
  SEQUENCING GATE   validation half: real MF-first share above the shuffle 97.5th percentile on >= 3 of 1/5/15/60m

    python -I scripts/vmc-nq-cipher/validate.py SYNTH_RUNS_DIR
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats as sps

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import events as ev_mod  # noqa: E402
import score  # noqa: E402
import vmcds  # noqa: E402

OUT = score.OUT


def holm(p, alpha=0.05):
    p = np.asarray(p, float)
    o = np.argsort(p)
    m = len(p)
    ok = np.zeros(m, bool)
    for r, i in enumerate(o):
        if p[i] <= alpha / (m - r):
            ok[i] = True
        else:
            break
    return ok


def outcome_vec(name, s, o, m, i):
    if name == "R12":
        return s * o.R12.to_numpy()[i] - s * m.R12.to_numpy()
    if name == "race":
        r = o.race.to_numpy()[i]
        return np.where(s > 0, r, 1 - r) - np.where(s > 0, m.race.to_numpy(), 1 - m.race.to_numpy())
    return o.V12.to_numpy()[i] - m.V12.to_numpy()


def boot_draws(boot, dates, x):
    ok = np.isfinite(x)
    b = np.array([boot.blk[d] for d in dates[ok]])
    s = np.bincount(b, weights=x[ok], minlength=boot.nb)
    n = np.bincount(b, minlength=boot.nb).astype(float)
    return s.sum() / n.sum(), (boot.W @ s) / np.maximum(boot.W @ n, 1)


def main(synth_dir):
    frozen = json.loads((OUT / "survivors.json").read_text())["frozen"]
    rows = []
    cache = {}
    for sv in frozen:
        tf = int(sv["tf"]) if sv["tf"] != "D" else "D"
        if tf not in cache:
            ev, f, o, key, period = score.prepare(tf, vmcds.load, ev_mod)
            mask = (period == "val").to_numpy() & (key >= 0)
            mu = score.baseline_means(key, o, mask)
            td = f.trade_date.astype(str).to_numpy()
            boot = score.Boot(td[(period == "val").to_numpy()], 2000, score.SEED)
            cache[tf] = (ev, f, o, key, period, mu, td, boot)
        ev, f, o, key, period, mu, td, boot = cache[tf]
        val = (period == "val").to_numpy()

        def cell(i, s):
            k = key[i]
            ok = k >= 0
            i, s = i[ok], s[ok]
            return i, s, mu.reindex(key[i])

        g = ev[(ev.family == sv["family"]) & val[ev.i.to_numpy()]]
        i, s, m = cell(g.i.to_numpy(), g.s.to_numpy().astype(float))
        x = outcome_vec(sv["outcome"], s, o, m, i)
        st = boot.stat(td[i], x)
        sign = np.sign(sv["est"])
        r = {"outcome": sv["outcome"], "tf": sv["tf"], "family": sv["family"], "disc_est": sv["est"], "disc_t": sv["t"],
             "val_n": st["n"], "val_est": st["est"], "val_lo": st["lo"], "val_hi": st["hi"], "val_t": st["t"],
             "p_one_sided": float(sps.norm.sf(st["t"] * sign)), "mde_val": 2.8 * st["se"],
             "same_sign": bool(np.sign(st["est"]) == sign)}
        # interaction gate for combination families
        if sv["family"][:2] in ("F7", "F8", "F9"):
            est_c, bs_c = boot_draws(boot, td[i], x)
            n = len(f)
            samp = np.arange(0, n, ev_mod.GAP)
            samp = samp[val[samp]]
            comps = {"spread": f.wt_spread.to_numpy(float), "wt1": f.wt1.to_numpy(float), "mf": f.mf.to_numpy(float),
                     "vwapd": f.vwap_dist.to_numpy(float)}
            singles = {}
            for nm, arr in comps.items():
                ss = np.sign(np.nan_to_num(arr[samp]))
                j, s2, m2 = cell(samp[ss != 0], ss[ss != 0].astype(float))
                singles[nm] = boot_draws(boot, td[j], outcome_vec(sv["outcome"], s2, o, m2, j))
            best = max(singles, key=lambda q: sign * singles[q][0])
            diff = bs_c - singles[best][1]
            lo, hi = np.percentile(diff, [2.5, 97.5])
            r.update({"best_single": best, "best_single_est": float(singles[best][0]),
                      "comb_minus_best": float(est_c - singles[best][0]), "cmb_lo": float(lo), "cmb_hi": float(hi),
                      "interaction_pass": bool((lo > 0) if sign > 0 else (hi < 0))})
            # demote-only descriptive: versus the plain WT cross on the same timeframe and period
            g1 = ev[(ev.family == "F1a") & val[ev.i.to_numpy()]]
            j1, s1, m1 = cell(g1.i.to_numpy(), g1.s.to_numpy().astype(float))
            e1, b1 = boot_draws(boot, td[j1], outcome_vec(sv["outcome"], s1, o, m1, j1))
            lo1, hi1 = np.percentile(bs_c - b1, [2.5, 97.5])
            r.update({"F1a_est": float(e1), "comb_minus_F1a": float(est_c - e1), "vsF1a_lo": float(lo1), "vsF1a_hi": float(hi1)})
        rows.append(r)
    d = pd.DataFrame(rows)
    d["holm_pass"] = holm(d.p_one_sided.to_numpy())
    d["validated"] = d.holm_pass & d.same_sign
    d["verdict"] = np.where(d.validated, "VALIDATED",
                            np.where(d.mde_val > d.disc_est.abs(), "UNDERPOWERED", "NULL"))
    d.to_csv(OUT / "validation_cells.csv", index=False)
    # sequencing, validation half
    import os
    os.environ["VMC_DATA"] = str(vmcds.DATA)
    seq_r = {}
    for tf in (1, 5, 15, 60):
        f = vmcds.load(tf, columns=["trade_date", "cross_dir", "mf"])
        td = pd.to_datetime(f.trade_date)
        per = pd.Series(np.where(td <= vmcds.DISCOVERY_END, "disc", "val"))
        seq_r[str(tf)] = score.seq_share(f.reset_index(drop=True), per, "val")
    seq_s = [json.loads(p.read_text()) for p in sorted(Path(synth_dir).glob("seq_synth*_val.json"))]
    seq = {}
    for tf, v in seq_r.items():
        sv_ = [s[tf] for s in seq_s if s.get(tf) is not None]
        seq[tf] = {"real": v, "synth_mean": float(np.mean(sv_)), "synth_975": float(np.percentile(sv_, 97.5)),
                   "synth_max": float(np.max(sv_)), "above": bool(v > np.percentile(sv_, 97.5))}
    seq["gate_validation"] = sum(1 for v in seq.values() if isinstance(v, dict) and v["above"]) >= 3
    (OUT / "sequencing_validation.json").write_text(json.dumps(seq, indent=1))
    pd.set_option("display.width", 250)
    print(d.drop(columns=[c for c in d.columns if c.endswith("_lo") or c.endswith("_hi")], errors="ignore").round(4).to_string())
    print(d[[c for c in d.columns if c in ("family", "tf", "outcome", "cmb_lo", "cmb_hi", "vsF1a_lo", "vsF1a_hi", "val_lo", "val_hi")]].round(4).to_string())
    print(json.dumps(seq))


if __name__ == "__main__":
    main(sys.argv[1])
