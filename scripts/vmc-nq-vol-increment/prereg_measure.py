"""vmc-nq-vol-increment PRE-REGISTRATION measurements, FIT PERIOD ONLY (trade dates <= 2022-12-31; no test-period row
is read past the loader's period filter).

  (a) prereg 5: the 95% half-width of MSE skill at 30m, pair C -> C+P (no VuManChu), fit 2016-2019, scored 2020-2022.
  (b) prereg 3.12: exploratory near-zero thresholds (|wt1| < 10 / 20 / 30): the Stage 2 contrasts on 2020-2022
      residuals of a C+P+K model fitted on 2016-2019, every timeframe. Described only.

    python -I scripts/vmc-nq-vol-increment/prereg_measure.py
"""
import json

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as cm  # noqa: E402


def split(t):
    td = pd.to_datetime(t.trade_date)
    fit = t.period.eq("fit").to_numpy() & t.elig12.to_numpy()
    n = len(t)
    td_end = td.shift(-12).to_numpy()
    a = fit & (td <= "2019-12-31").to_numpy() & (pd.to_datetime(td_end) <= "2019-12-31")
    b = fit & (td >= "2020-01-01").to_numpy()
    assert not (t.period.to_numpy()[b] == "test").any()
    return a, b, n


def main():
    res = {}
    for tf in (30, 5, 3, 1):
        t = cm.load(tf)
        t = t[t.period == "fit"].reset_index(drop=True)          # the test period is never loaded past here
        S = cm.sets(t)
        a, b, _ = split(t)
        tr = cm.train_rows(t, a, tf)
        sc = np.where(b)[0]
        y = t.y12.to_numpy(float)
        boot = cm.Boot(pd.to_datetime(t.trade_date).to_numpy()[sc])
        blk = boot.blocks(pd.to_datetime(t.trade_date).to_numpy()[sc])
        r = {"fit_rows": int(len(tr)), "score_rows": int(len(sc))}
        if tf == 30:
            pc = {}
            for name, cols in (("C", S["C"]), ("CP", S["C"] + S["P"])):
                pc[name] = cm.predict(cm.fit(t, tr, cols, y[tr]), t, sc, cols)
            sk = boot.ratio_skill(blk, (y[sc] - pc["CP"]) ** 2, (y[sc] - pc["C"]) ** 2)
            sk["half_width"] = (sk["hi"] - sk["lo"]) / 2
            r["skill_C_to_CP"] = sk
        cols = S["C"] + S["P"] + S["K"]
        res_ = y[sc] - cm.predict(cm.fit(t, tr, cols, y[tr]), t, sc, cols)
        x = t.v_wtc_cross.to_numpy()[sc] > 0
        aw = np.abs(t.v_wtl_wt1.to_numpy(float)[sc])
        thr = {}
        for z_cut in (10, 20, 30):
            z = aw < z_cut
            g = boot.means(blk, res_, {"A": z & x, "B": z & ~x, "C": ~z & x, "D": ~z & ~x})
            con = {"level_B_D": ("B", "D"), "cross_C_D": ("C", "D"), "cross_given_level_A_B": ("A", "B")}
            out = {k: {"n": g[k][2]} for k in "ABCD"}
            for nm, (p, q) in con.items():
                out[nm] = cm.summarise(g[p][0] - g[q][0], g[p][1] - g[q][1])
            out["interaction"] = cm.summarise((g["A"][0] - g["B"][0]) - (g["C"][0] - g["D"][0]),
                                              (g["A"][1] - g["B"][1]) - (g["C"][1] - g["D"][1]))
            thr[f"lt{z_cut}"] = out
        r["thresholds_fit_period"] = thr
        res[str(tf)] = r
        print(tf, json.dumps({k: v for k, v in r.items() if k != "thresholds_fit_period"}), flush=True)
        print("   ", {k: {c: round(v[c]["est"], 4) for c in ("level_B_D", "cross_C_D", "cross_given_level_A_B")} for k, v in thr.items()}, flush=True)
    (cm.F.OUT / "prereg_measure.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
