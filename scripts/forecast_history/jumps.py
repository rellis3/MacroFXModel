"""STEP 2 — jumps (forge/JUMPS_PREREG.md). Reads the Step 0 table + calendar_events.csv.

    python scripts/forecast_history/jumps.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from forecast_record import B, H, boot_weights, complete, klass, pinball  # noqa: E402  (same bootstrap as Step 1)

OUT = Path("analysis/output/jumps")
KS = (4, 5, 6)
K0 = 5
D_STOP = (0.25, 0.5, 1.0)
TAGS = ("FOMC", "NFP", "CPI", "high", "none", "holiday")
EVENT_DAYS = {"FOMC", "NFP", "CPI", "high"}
N5 = 264


def currencies(insts):
    js = ("import('./js/volForecast.js').then(m=>console.log(JSON.stringify(Object.fromEntries("
          + json.dumps(list(insts)) + ".map(n=>[n,m.instrumentCurrencies(n==='DOW'?'US30':n)])))))")
    return json.loads(subprocess.check_output(["node", "-e", js], text=True).strip().splitlines()[-1])


def releases() -> pd.DataFrame:
    c = pd.read_csv("calendar_events.csv", encoding="latin-1", low_memory=False)
    c = c[c.impact == "Major"].copy()
    t = pd.to_datetime(c.datetime_raw, errors="coerce").dt.tz_localize("UTC").dt.tz_convert("Europe/London")
    c = c[t.notna()]
    t = t[t.notna()]
    c["date"] = t.dt.strftime("%Y-%m-%d").values
    c["minute"] = (t.dt.hour * 60 + t.dt.minute).values
    return c[["date", "minute", "ccy"]].drop_duplicates()


def load() -> pd.DataFrame:
    X = pd.concat([pd.read_csv(f) for f in sorted(H.glob("*.csv"))], ignore_index=True)
    X = X[complete(X)].copy()
    X["klass"] = X.inst.map(klass)
    sig5 = np.sqrt(X.bv5 / 1e4 / N5)                     # typical 5-min log move
    big = (X.max_r5.abs() / 100)                          # largest 5-min move (fraction)
    for k in KS:
        X[f"jump{k}"] = (big > k * sig5).astype(float)
    X["size"] = X.max_r5.abs() / X.pit_sig_used         # daily-σ units
    X["z"] = X.r_ocs / X.pit_sig_used
    X["monday"] = pd.to_datetime(X.date).dt.dayofweek == 0
    return X.reset_index(drop=True)


def main():
    X = load()
    ccy = currencies(sorted(X.inst.unique()))
    rel = releases()
    cal_end = rel.date.max()
    by_day = rel.groupby("date")
    sched = np.full(len(X), np.nan)
    for i, (d, inst, m) in enumerate(zip(X.date, X.inst, X.min_max_r5)):
        if d > cal_end:
            continue
        start = m - 5                                     # the jump bar spans [m-5, m)
        if d not in by_day.groups:
            sched[i] = 0.0
            continue
        g = by_day.get_group(d)
        g = g[g.ccy.isin(ccy[inst])]
        sched[i] = float(((start >= g.minute - 5) & (start <= g.minute + 15)).any())
    X["sched"] = sched
    # Coverage: the calendar holds USD/EUR/GBP only; an instrument is fully covered when all its currencies are.
    covered = {i for i, c in ccy.items() if set(c) <= {"USD", "EUR", "GBP"}}
    X["cal_covered"] = X.inst.isin(covered)

    O = X[X.oos == 1].reset_index(drop=True)
    dates = np.sort(O.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[O.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    one = np.ones(len(O))

    def ci(num, den, mask, fn=None):
        sn = np.bincount(di[mask], weights=num[mask], minlength=nd)
        sd = np.bincount(di[mask], weights=den[mask], minlength=nd)
        pt = sn.sum() / sd.sum()
        reps = (W @ sn) / np.maximum(W @ sd, 1e-12)
        return [round(float(pt), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]]

    def kurt(mask):
        z = O.z.to_numpy()
        s2 = np.bincount(di[mask], weights=(z ** 2)[mask], minlength=nd)
        s4 = np.bincount(di[mask], weights=(z ** 4)[mask], minlength=nd)
        n = np.bincount(di[mask], minlength=nd).astype(float)
        f = lambda a, b, c: (b / c) / (a / c) ** 2 - 3
        reps = f(W @ s2, W @ s4, W @ n)
        return [round(float(f(s2.sum(), s4.sum(), n.sum())), 3), *[round(float(x), 3) for x in np.percentile(reps, [2.5, 97.5])]]

    res = {"n_oos": len(O), "dates": nd, "calendar_end": cal_end}
    groups = [("all", np.ones(len(O), bool))] + [(k, (O.klass == k).to_numpy()) for k in sorted(O.klass.unique())]

    # Q1 how much is jump
    q1 = {}
    for g, m in groups:
        row = {"n": int(m.sum()), "jump_share": ci(O.jump_share.fillna(0).to_numpy(), one, m), "excess_kurtosis": kurt(m)}
        for k in KS:
            fr = ci(O[f"jump{k}"].to_numpy(), one, m)
            row[f"lambda_per_year_k{k}"] = [round(x * 252, 1) for x in fr]
        jm = m & (O[f"jump{K0}"] == 1).to_numpy()
        row["size_sigma_median"] = round(float(O.size[jm].median()), 3)
        row["size_sigma_p90"] = round(float(O.size[jm].quantile(0.9)), 3)
        q1[g] = row
    q1_inst = {i: {"jump_share": round(float(g.jump_share.mean()), 4), f"lambda_k{K0}": round(float(g[f"jump{K0}"].mean() * 252), 1),
                   "excess_kurtosis": round(float((g.z ** 4).mean() / (g.z ** 2).mean() ** 2 - 3), 2)}
               for i, g in O.groupby("inst")}
    res["Q1"] = {"by_class": q1, "by_instrument": q1_inst}

    # Q2 scheduled or not (instruments whose currencies the calendar fully covers, dates it covers)
    q2 = {}
    for g, m in groups:
        for k in KS:
            mm = m & (O[f"jump{k}"] == 1).to_numpy() & O.sched.notna().to_numpy() & O.cal_covered.to_numpy()
            if mm.sum() >= 50:
                q2.setdefault(g, {})[f"k{k}"] = {"n_jump_days": int(mm.sum()), "share_scheduled": ci(O.sched.fillna(0).to_numpy(), one, mm)}
    res["Q2"] = q2

    # Q3 tail on jump days vs other days
    q3 = {}
    for g, m in groups:
        for fam in ("hl", "oh", "ol"):
            ex = (O[f"r_{fam}"] > O[f"pit_{fam}_p90"]).astype(float).to_numpy()
            for k in KS:
                j = (O[f"jump{k}"] == 1).to_numpy()
                q3.setdefault(g, {}).setdefault(fam, {})[f"k{k}"] = {
                    "jump_days": ci(ex, one, m & j), "other_days": ci(ex, one, m & ~j), "n_jump": int((m & j).sum())}
    res["Q3"] = q3

    # Q4 rung-specific p90 multiplier per event tag, fitted per instrument inside each fold's training window
    specs = json.loads(Path("forge/out_vol_lon/vol_report.json").read_text())
    key = {"DOW": "us30"}
    X["p90_mult"] = 1.0
    for inst, g in X.groupby("inst"):
        sp = sorted(specs[key.get(inst, inst.lower())]["specs"], key=lambda s: s["trained_through"])
        for s in sp:
            tt = pd.Timestamp(s["trained_through"]).strftime("%Y-%m-%d")
            train = g[g.date <= tt]
            test = g[(g.oos == 1) & (g.fold == s["fold"])]
            for tag in TAGS:
                tr = train[train.event == tag]
                if len(tr) < 20 or not len(test):
                    continue
                ratio = (tr.r_hl / tr.pit_hl_p90).to_numpy()
                mult = float(np.quantile(ratio, 0.90))
                X.loc[test.index[test.event == tag], "p90_mult"] = mult
    O2 = X[X.oos == 1].reset_index(drop=True)
    assert (O2.date.to_numpy() == O.date.to_numpy()).all()
    q4 = {}
    for fam in ("hl", "oh", "ol"):
        y = O2[f"r_{fam}"].to_numpy()
        a = pinball(y, O2[f"pit_{fam}_p90"].to_numpy(), 0.9) / O2.pit_sig_used.to_numpy()
        b = pinball(y, (O2[f"pit_{fam}_p90"] * O2.p90_mult).to_numpy(), 0.9) / O2.pit_sig_used.to_numpy()
        ev = O2.event.isin(EVENT_DAYS).to_numpy()
        out = {}
        for name, m in (("event_days", ev), ("all_days", np.ones(len(O2), bool)), ("other_days", ~ev)):
            sa = np.bincount(di[m], weights=a[m], minlength=nd)
            sb = np.bincount(di[m], weights=b[m], minlength=nd)
            reps = (W @ sb) / (W @ sa) - 1
            exa = ci((y > O2[f"pit_{fam}_p90"].to_numpy()).astype(float), one, m)
            exb = ci((y > (O2[f"pit_{fam}_p90"] * O2.p90_mult).to_numpy()).astype(float), one, m)
            out[name] = {"n": int(m.sum()), "pinball_change": [round(float(sb.sum() / sa.sum() - 1), 4),
                         *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]],
                         "p90_exceed_before": exa, "p90_exceed_after": exb}
        q4[fam] = out
    h = q4["hl"]
    res["Q4"] = {"by_family": q4, "mult_summary": O2.groupby("event").p90_mult.describe()[["count", "mean", "min", "max"]].round(3).to_dict("index"),
                 "verdict_hl": "PASS" if (h["event_days"]["pinball_change"][2] < 0 and h["all_days"]["pinball_change"][2] < 0.005) else "FAIL"}

    # Q5 single-step loss
    q5 = {}
    big = (O.max_r5.abs() / O.pit_sig_used).to_numpy()
    gap = (O.gap.abs() / O.pit_sig_used).to_numpy()
    gok = O.gap.notna().to_numpy()
    mon = O.monday.to_numpy()
    for g, m in groups:
        for dd in D_STOP:
            q5.setdefault(g, {})[str(dd)] = {
                "one_5min_bar_beyond": ci((big > dd).astype(float), one, m),
                "gap_beyond_weekday": ci((gap > dd).astype(float), one, m & gok & ~mon),
                "gap_beyond_monday": ci((gap > dd).astype(float), one, m & gok & mon)}
    res["Q5"] = q5

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    write_md(res)


def pct(c, scale=100, nd=1):
    return f"{c[0] * scale:.{nd}f} [{c[1] * scale:.{nd}f}, {c[2] * scale:.{nd}f}]"


def write_md(res):
    md = ["# STEP 2 — jumps (results)", "", "Pre-registration: `forge/JUMPS_PREREG.md`. Out-of-sample sessions "
          f"(point-in-time forecast): {res['n_oos']:,} instrument-sessions, {res['dates']:,} dates. 95% intervals: date-block "
          f"bootstrap (as Step 1). Jump day: largest 5-min move > {K0}× the day's typical 5-min move (k = 4, 6 alongside).", "",
          "## Q1 How much is jump", "", "| class | n | jump share of variance % | jump days / yr (k4 · k5 · k6) | size median / p90 (σ) | excess kurtosis |",
          "|---|---|---|---|---|---|"]
    for g, r in res["Q1"]["by_class"].items():
        md.append(f"| {g} | {r['n']} | {pct(r['jump_share'])} | {r['lambda_per_year_k4'][0]} · **{r['lambda_per_year_k5'][0]}** "
                  f"[{r['lambda_per_year_k5'][1]}, {r['lambda_per_year_k5'][2]}] · {r['lambda_per_year_k6'][0]} | "
                  f"{r['size_sigma_median']} / {r['size_sigma_p90']} | {r['excess_kurtosis'][0]} [{r['excess_kurtosis'][1]}, {r['excess_kurtosis'][2]}] |")
    md += ["", "## Q2 Scheduled or not", "", "Instruments whose currencies the calendar fully covers (USD/EUR/GBP), to "
           f"{res['calendar_end']}. Scheduled = jump bar within −5/+15 min of a Major release for the instrument's currencies.", "",
           "| class | k | jump days | share scheduled % |", "|---|---|---|---|"]
    for g, r in res["Q2"].items():
        for k, v in r.items():
            md.append(f"| {g} | {k} | {v['n_jump_days']} | {pct(v['share_scheduled'])} |")
    md += ["", "## Q3 p90 exceedance on jump days vs other days (%, target 10)", "", "| class | line | jump days (k5) | other days | n jump |",
           "|---|---|---|---|---|"]
    for g, r in res["Q3"].items():
        for fam, v in r.items():
            x = v[f"k{K0}"]
            md.append(f"| {g} | {fam.upper()} | {pct(x['jump_days'])} | {pct(x['other_days'])} | {x['n_jump']} |")
    q4 = res["Q4"]
    md += ["", f"## Q4 Rung-specific p90 event multiplier (walk-forward) — **{q4['verdict_hl']}** (HL, the registered rule)", "",
           "| line | days | n | p90 pinball change [95%] | p90 exceed before | after |", "|---|---|---|---|---|---|"]
    for fam, v in q4["by_family"].items():
        for name, x in v.items():
            md.append(f"| {fam.upper()} | {name} | {x['n']} | {pct(x['pinball_change'])} | {pct(x['p90_exceed_before'])} | {pct(x['p90_exceed_after'])} |")
    md += ["", "Fitted multipliers by tag (test rows): " + "; ".join(f"{k} mean {v['mean']} ({v['min']}–{v['max']})" for k, v in q4["mult_summary"].items()), "",
           "## Q5 Single-step loss: share of sessions (%)", "", "| class | stop d (σ) | one 5-min bar moves > d | open gaps > d (Tue–Fri) | Monday gap > d |",
           "|---|---|---|---|---|"]
    for g, r in res["Q5"].items():
        for dd, v in r.items():
            md.append(f"| {g} | {dd} | {pct(v['one_5min_bar_beyond'])} | {pct(v['gap_beyond_weekday'])} | {pct(v['gap_beyond_monday'])} |")
    md += ["", "## By instrument (Q1)", "", "| inst | jump share % | jump days / yr (k5) | excess kurtosis |", "|---|---|---|---|"]
    for i, v in res["Q1"]["by_instrument"].items():
        md.append(f"| {i} | {v['jump_share'] * 100:.1f} | {v[f'lambda_k{K0}']} | {v['excess_kurtosis']} |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:60]))


if __name__ == "__main__":
    main()
