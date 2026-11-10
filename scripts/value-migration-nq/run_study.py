#!/usr/bin/env python3
"""value-migration-nq study runner.

    python scripts/value-migration-nq/run_study.py --mode power   # control (session-shifted states) only: counts, SEs, MDEs
    python scripts/value-migration-nq/run_study.py --mode score   # the registered run (once, after the prereg is pushed)

Outputs to analysis/output/value-migration-nq/. Seed 20261110 everywhere (vmig.stats.SEED).
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from vmig.features import Params, MODELS  # noqa: E402
from vmig.stats import (HORIZONS, SEED, block_indices, signed_cell, diff_cell, summarize, ols_boot,  # noqa: E402
                        session_shift_placebo, holm, holm_adjusted, bh, mde)
from vmig.backtest import run, run_forced, NET, GROSS, STRESS  # noqa: E402
from vmig.metrics import summary, boot_expectancy, boot_sharpe  # noqa: E402
from vmig.study import Sample, shift_states, regimes, IS_END, OOS_START, STRAT_MODELS, ENTRIES, EXITS  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "analysis" / "output" / "value-migration-nq"
P = Params()
STATE_COLS = list(MODELS)
STATS_CELLS = ([("Q1", "A_POC", None, h) for h in HORIZONS] +
               [("Q1-beyond-price", "A_POC", "TW_POC", 15), ("Q2", "A", "A_POC", 15), ("Q3", "B", "A", 15),
                ("Q4", "C_", "A", 15), ("Q5", "D_", "A", 15)])
STATS_BAR = {"Q1": 0.05}            # raw signed outcome, sigma_h units
INCR_BAR = 0.03                     # every difference cell
STRAT_BAR = 0.05                    # net R per trade


def jdump(obj, path):
    def conv(o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, (np.bool_,)):
            return bool(o)
        raise TypeError(type(o))
    path.write_text(json.dumps(obj, indent=1, default=conv))


def halves(days, date_of):
    d = np.asarray(days)
    dates = date_of.reindex(d).values
    return d[dates <= IS_END], d[dates >= OOS_START]


def stats_cells(f, days, idx):
    res = []
    for name, m1, m2, h in STATS_CELLS:
        if m2 is None:
            e, b, n = signed_cell(f, m1, h, days, idx)
            r = summarize(e, b)
            r["n"] = n
        else:
            r = diff_cell(f, m1, m2, h, days, idx)
        r.update(cell=name if m2 is not None else f"Q1-h{h}", m1=m1, m2=m2, h=h)
        res.append(r)
    return res


def strategies(S, f, costs, days):
    mk = S.market(P.B)
    out = {}
    for model in STRAT_MODELS:
        st = mk.state_matrix(f, model)
        for e in ENTRIES:
            for x in EXITS:
                tr, sk = run(mk, st, P.K, e, x, costs)
                t = pd.DataFrame(tr)
                if len(t):
                    t = t[t.day.isin(days)]
                out[(model, e, x)] = (t, sk)
    return out


def mode_power():
    t0 = time.time()
    S = Sample()
    f = S.features(P)
    days = S.scored_days(f)
    idx = block_indices(len(days))
    ctrl = shift_states(f, STATE_COLS, 1)
    counts = {m: {"windows": int((f[m] != 0).sum()), "long": int((f[m] > 0).sum()), "short": int((f[m] < 0).sum())}
              for m in STATE_COLS}
    m_stats = len(STATS_CELLS)
    pw = []
    for r in stats_cells(ctrl, days, idx):
        bar = STATS_BAR.get(r["cell"].split("-h")[0], INCR_BAR) if r["m2"] is None else INCR_BAR
        if r["m2"] is None:
            bar = STATS_BAR["Q1"]
        r["mde"] = mde(r["se"], m_stats)
        r["bar"] = bar
        r["powered"] = r["mde"] <= bar
        pw.append(r)
    strat = []
    res = strategies(S, ctrl, NET, days)
    for (model, e, x), (t, sk) in res.items():
        b = boot_expectancy(t, days, idx) if len(t) else {"se": np.nan, "est": np.nan}
        dsd = float(t["R"].std()) if len(t) else np.nan
        strat.append({"model": model, "entry": e, "exit": x, "trades": int(len(t)), "skipped": sk,
                      "ctrl_exp_R": b["est"], "se": b["se"], "sd_R": dsd,
                      "mde": mde(b["se"], 24), "mde_vs_random": mde(b["se"] * np.sqrt(1 + 1 / 20), 24),
                      "bar": STRAT_BAR, "lift_needed": STRAT_BAR - b["est"],
                      "powered": mde(b["se"] * np.sqrt(1 + 1 / 20), 24) <= STRAT_BAR - b["est"]})
    out = {"mode": "power (control: states of session d+1 on the outcomes of session d)", "seed": SEED,
           "params": P.dict(), "sessions": int(len(days)), "data_report": S.report, "state_counts": counts,
           "stats_cells": pw, "strategies": strat, "seconds": round(time.time() - t0, 1)}
    OUT.mkdir(parents=True, exist_ok=True)
    jdump(out, OUT / "power.json")
    print(json.dumps({"sessions": len(days), "counts": counts}, indent=0))
    for r in pw:
        print(f"{r['cell']:18s} n={r.get('n', r.get('n1'))} ctrl_est={r['est']:+.4f} se={r['se']:.4f} mde={r['mde']:.4f} bar={r['bar']} {'POWERED' if r['powered'] else 'UNDERPOWERED'}")
    for r in strat:
        print(f"{r['model']:3s} {r['entry']:4s} {r['exit']:5s} n={r['trades']:5d} ctrl={r['ctrl_exp_R']:+.3f} sd={r['sd_R']:.2f} se={r['se']:.4f} mde_vs_rand={r['mde_vs_random']:.3f} lift={r['lift_needed']:.3f} {'POWERED' if r['powered'] else 'UNDERPOWERED'}")


# ----------------------------------------------------------------------------------------------- score

def random_control(S, trades, days_pool, exit_type, costs, reps=20, seed=SEED):
    """Matched random-entry control: each real trade is replayed on a random other session of the same half at the
    same minute, side and risk (sigma_b units), with the same exit rule and costs."""
    mk = S.market(P.B)
    rng = np.random.default_rng(seed)
    pos = {d: i for i, d in enumerate(mk.days)}
    means = []
    for _ in range(reps):
        ent = []
        for d, m, s, rs in zip(trades["day"], trades["entry_m"], trades["dir"], trades["risk_sig"]):
            pool = days_pool[0] if S.date_of[d] <= IS_END else days_pool[1]
            dd = pool[rng.integers(len(pool))]
            if dd == d:
                dd = pool[(np.searchsorted(pool, d) + 1) % len(pool)]
            ent.append((pos[dd], int(m), int(s), float(rs)))
        tr = pd.DataFrame(run_forced(mk, ent, exit_type, costs))
        means.append(tr["R"].mean() if len(tr) else np.nan)
    return np.array(means)


def mode_score():
    t0 = time.time()
    S = Sample()
    f = S.features(P)
    days = S.scored_days(f)
    d_is, d_oos = halves(days, S.date_of)
    idx = block_indices(len(days))
    idx_is = block_indices(len(d_is), seed=SEED + 1)
    idx_oos = block_indices(len(d_oos), seed=SEED + 2)
    out = {"mode": "score", "seed": SEED, "params": P.dict(), "data_report": S.report,
           "sample": {"sessions": int(len(days)), "first": S.date_of[days[0]], "last": S.date_of[days[-1]],
                      "is_sessions": int(len(d_is)), "oos_sessions": int(len(d_oos))}}

    # 1. signed outcomes, every model x horizon, full / IS / OOS
    tab = []
    for m in STATE_COLS:
        for h in HORIZONS:
            row = {"model": m, "h": h}
            for lab, dd, ii in (("full", days, idx), ("is", d_is, idx_is), ("oos", d_oos, idx_oos)):
                e, b, n = signed_cell(f[f.day.isin(dd)], m, h, dd, ii)
                r = summarize(e, b)
                row[lab] = dict(r, n=n)
            for side, sgn in (("long", 1), ("short", -1)):
                e, b, n = signed_cell(f, m, h, days, idx, sub=lambda d, sgn=sgn: np.sign(d[m]) == sgn)
                row[side] = dict(summarize(e, b), n=n)
            tab.append(row)
    out["signed_outcomes"] = tab

    # 2. scored statistics cells (Holm over 10) with the halves gate
    cells = stats_cells(f, days, idx)
    for r in cells:
        r["bar"] = STATS_BAR["Q1"] if r["m2"] is None else INCR_BAR
        for lab, dd, ii in (("is", d_is, idx_is), ("oos", d_oos, idx_oos)):
            ff = f[f.day.isin(dd)]
            if r["m2"] is None:
                e, b, n = signed_cell(ff, r["m1"], r["h"], dd, ii)
                r[lab] = e
            else:
                r[lab] = diff_cell(ff, r["m1"], r["m2"], r["h"], dd, ii)["est"]
    adj = holm_adjusted([r["p"] for r in cells])
    for r, a in zip(cells, adj):
        r["p_holm"] = a
        same = np.sign(r["is"]) == np.sign(r["est"]) == np.sign(r["oos"])
        r["pass"] = bool(a <= 0.05 and r["est"] >= r["bar"] and r["lo"] > 0 and same)
        r["mirror"] = bool(a <= 0.05 and r["est"] <= -r["bar"] and r["hi"] < 0 and same)
    out["stats_cells"] = cells

    # 3. regressions (descriptive): does migration add to the price move already made?
    f["abs_net"] = f["ab_bull"] - f["ab_bear"]
    regs = {}
    for h in (5, 15, 60):
        regs[f"h{h}"] = {
            "poc_only": ols_boot(f, f"y{h}", ["mig_poc"], days, idx[:500]),
            "price_only": ols_boot(f, f"y{h}", ["R_K"], days, idx[:500]),
            "poc_plus_price": ols_boot(f, f"y{h}", ["mig_poc", "R_K"], days, idx[:500]),
            "full": ols_boot(f, f"y{h}", ["R_K", "mig_poc", "mig_vah", "mig_val", "cd_z", "accel_z", "abs_net"], days, idx[:500]),
        }
    out["regressions"] = regs

    # 4. placebo: session shifts
    out["placebo"] = {}
    for m in ("A_POC", "A", "B", "C_", "D_"):
        for h in (15, 60):
            pl = session_shift_placebo(f, m, h)
            real = next(x for x in tab if x["model"] == m and x["h"] == h)["full"]["est"]
            out["placebo"][f"{m}_h{h}"] = {"real": real, "shifts": pl.tolist(), "mean": float(pl.mean()),
                                           "sd": float(pl.std()), "pctile": float((pl < real).mean() * 100)}

    # 5. regimes (Q6) for signed outcomes of A and A_POC
    rg = regimes(S)
    f = f.join(rg[["vol_exante", "daytype_expost", "vol_expost"]], on="day")
    slices, pvals = [], []
    for m in ("A_POC", "A", "B", "D_"):
        for h in (15, 60):
            for col in ("vol_exante", "daytype_expost", "vol_expost"):
                for lab in sorted(f[col].dropna().unique()):
                    if lab == "na":
                        continue
                    dd = np.sort(f.loc[f[col] == lab, "day"].unique())
                    ii = block_indices(len(dd), nboot=1000, seed=SEED + 3)
                    e, b, n = signed_cell(f[f[col] == lab], m, h, dd, ii)
                    r = summarize(e, b)
                    slices.append(dict(r, model=m, h=h, regime=col, label=lab, n=n))
                    pvals.append(r["p"])
    for r, ok in zip(slices, bh(pvals, 0.10)):
        r["bh_pass"] = bool(ok)
    out["regime_slices"] = slices

    # 6. strategies: 4 models x 2 entries x 3 exits, gross / net / stress
    strat = {"net": strategies(S, f, NET, days), "gross": strategies(S, f, GROSS, days), "stress": strategies(S, f, STRESS, days)}
    rows, pv = [], []
    all_trades = []
    for key, (t, sk) in strat["net"].items():
        model, e, x = key
        row = {"model": model, "entry": e, "exit": x, "skipped": sk}
        for lab, dd, ii in (("full", days, idx), ("is", d_is, idx_is), ("oos", d_oos, idx_oos)):
            tt = t[t.day.isin(dd)] if len(t) else t
            s = summary(tt, dd)
            if len(tt):
                s["boot_R"] = boot_expectancy(tt, dd, ii)
                s["boot_sharpe"] = boot_sharpe(tt, dd, ii[:500])
            row[lab] = s
        for cl in ("gross", "stress"):
            tg = strat[cl][key][0]
            row[cl] = summary(tg, days)
            if len(tg):
                row[cl]["boot_R"] = boot_expectancy(tg, days, idx)
        if len(t):
            rc = random_control(S, t, (d_is, d_oos), x, NET)
            rcg = random_control(S, strat["gross"][key][0], (d_is, d_oos), x, GROSS, reps=10)
            row["random_net"] = {"mean": float(np.nanmean(rc)), "sd": float(np.nanstd(rc)), "reps": rc.tolist()}
            row["random_gross"] = {"mean": float(np.nanmean(rcg)), "sd": float(np.nanstd(rcg))}
            row["vs_random"] = float(row["full"]["exp_R"] - np.nanmean(rc))
            se = row["full"]["boot_R"]["se"]
            row["vs_random_z"] = float(row["vs_random"] / np.sqrt(se ** 2 + np.nanvar(rc)))
            # regime breakdown of net trades
            tr = t.join(rg[["vol_exante", "daytype_expost", "vol_expost"]], on="day")
            row["by_regime"] = {c: tr.groupby(c)["R"].agg(["mean", "count"]).round(4).reset_index().to_dict("records")
                                for c in ("vol_exante", "daytype_expost", "vol_expost")}
            row["by_year"] = t.assign(y=t.date.str[:4]).groupby("y")["R"].agg(["mean", "count", "sum"]).round(4).reset_index().to_dict("records")
            all_trades.append(t.assign(model=model, entry_type=e, exit_type=x))
        pv.append(row["full"].get("boot_R", {}).get("p", 1.0))
        rows.append(row)
    adj = holm_adjusted(pv)
    for row, a in zip(rows, adj):
        f_ = row["full"]
        row["p_holm"] = a
        ok = f_.get("trades", 0) > 0
        row["pass"] = bool(ok and a <= 0.05 and f_["exp_R"] >= STRAT_BAR and f_["boot_R"]["lo"] > 0
                           and row["is"].get("exp_R", -1) > 0 and row["oos"].get("exp_R", -1) > 0
                           and row.get("vs_random_z", 0) >= 1.96)
    out["strategies"] = rows
    out["seconds"] = round(time.time() - t0, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    jdump(out, OUT / "results.json")
    if all_trades:
        pd.concat(all_trades).to_csv(OUT / "trades_net.csv.gz", index=False, compression="gzip")
    f[["day", "date", "k", "A_POC", "A", "B", "C_", "D_", "TW_POC", "TW_A", "mig_poc", "R_K", "cd_z", "y15", "y60"]].to_csv(
        OUT / "states.csv.gz", index=False, compression="gzip")
    print("done", out["seconds"], "s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["power", "score"], required=True)
    a = ap.parse_args()
    mode_power() if a.mode == "power" else mode_score()
