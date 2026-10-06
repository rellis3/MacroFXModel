"""LIVE-RANGE-WALKFORWARD analysis (forge/LIVE_RANGE_WALKFORWARD_PREREG.md).

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_wf
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of  # noqa: E402

O = Path("analysis/output/live_range_wf")
RN = ["p50", "p75", "p90"]
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((O / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
from pylego.costs import default_spread  # noqa: E402
SP = np.zeros(len(names))
for i, n in enumerate(names):
    c = pd.read_csv(f"analysis/output/forecast_history/{n}.csv", usecols=["open", "pit_sig_daily", "oos"])
    c = c[c.oos == 1]
    SP[i] = default_spread(n) / float((c.open * c.pit_sig_daily / 100).median())

E = pd.read_parquet(O / "events.parquet")
E = E[(E.pre == 0) & E.code.isin([1, 2])].copy()
E["inst"] = E.inst.astype(int); E["date"] = E.date.astype(int)
E["cls"] = np.array([cls_of(n) for n in names])[E.inst.to_numpy()]
E["sp"] = SP[E.inst.to_numpy()]
E["rung"] = E.rung.astype(int); E["h"] = E.h.astype(int)
E["y"] = (E.code == 1).astype(float)
E["wd"] = (E.date + 6) % 7
tm = E.tmin // 60
E["ses"] = np.select([tm < 7, tm < 12, tm < 16], [0, 1, 2], 3)
E["hi"] = (E.regime_ratio > 1).astype(int)
E["Rc"] = np.where(E.y == 1, E.a, -E.b) / E.b - E.sp / E.b
E["Rf"] = np.where(E.y == 0, E.b, -E.a) / E.a - E.sp / E.a
E["Rc2"] = E.Rc ** 2; E["Rf2"] = E.Rf ** 2
E["yr"] = pd.to_datetime(E.date.map(pd.Timestamp.fromordinal)).dt.year
E = E.sort_values("date").reset_index(drop=True)
udates = np.sort(E.date.unique()); D = len(udates)
W = boot_weights(D)
di = np.searchsorted(udates, E.date.to_numpy())
say(f"# LIVE-RANGE-WALKFORWARD — results\n\nPre-registration: `forge/LIVE_RANGE_WALKFORWARD_PREREG.md`. {len(E):,} resolved first-touches, "
    f"{D:,} trading dates, 2018-04 → 2026-08, grids refit each quarter on prior dates only, decisions from prior dates only.\n")


def ci(num, den):
    p = num.sum() / den.sum()
    with np.errstate(all="ignore"):
        r = (W @ num) / (W @ den)
    return p, np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


FAM = {"A (hour)": ["cls", "rung", "h"], "B (weekday × hour)": ["cls", "rung", "wd", "h"], "C (weekday × session)": ["cls", "rung", "wd", "ses"]}
COLS = ["n", "sc", "sf", "sc2", "sf2"]


def walk(keys, mean_thr, t_thr, n_min, window=None):
    """per-event decision: +1 continue, -1 fade, 0 none, from dates strictly before the event's date."""
    E["n"] = 1.0
    d = E.groupby(keys + ["date"], sort=True).agg(n=("n", "sum"), sc=("Rc", "sum"), sf=("Rf", "sum"), sc2=("Rc2", "sum"), sf2=("Rf2", "sum")).reset_index()
    g = d.groupby(keys, sort=False)
    if window:
        cum = np.zeros((len(d), 5))
        arr = d[COLS].to_numpy(); dd_all = d.date.to_numpy()
        for _, idx in g.indices.items():
            dd = dd_all[idx]
            cs0 = np.vstack([np.zeros(5), np.cumsum(arr[idx], axis=0)])
            lo = np.searchsorted(dd, dd - window, side="left")
            cum[idx] = cs0[np.arange(len(idx))] - cs0[lo]
        cum = pd.DataFrame(cum, columns=COLS, index=d.index)
    else:
        cum = g[COLS].cumsum() - d[COLS]
    n = cum.n.to_numpy(); n_ = np.maximum(n, 1)
    stats = {}
    for nm, s, s2 in (("c", "sc", "sc2"), ("f", "sf", "sf2")):
        m = cum[s].to_numpy() / n_
        var = np.maximum(cum[s2].to_numpy() / n_ - m ** 2, 1e-12)
        stats[nm] = (m, m / np.sqrt(var / n_))
    mc, tc = stats["c"]; mf, tf = stats["f"]
    ok_c = (mc >= mean_thr) & (tc >= t_thr) & (n >= n_min)
    ok_f = (mf >= mean_thr) & (tf >= t_thr) & (n >= n_min)
    d["choice"] = np.where(ok_c & (~ok_f | (mc >= mf)), 1, np.where(ok_f, -1, 0))
    return E[keys + ["date"]].merge(d[keys + ["date", "choice"]], on=keys + ["date"], how="left").choice.to_numpy()


def score(choice, label):
    tr = choice != 0
    r_sel = np.where(choice == 1, E.Rc, np.where(choice == -1, E.Rf, 0.0))
    plc = 0.5 * (E.Rc + E.Rf).to_numpy()                                   # expectation of a random 50/50 pick
    den = np.bincount(di, weights=tr.astype(float), minlength=D)
    p, lo, hi = ci(np.bincount(di, weights=np.where(tr, r_sel, 0), minlength=D), den)
    px, lox, hix = ci(np.bincount(di, weights=np.where(tr, r_sel - plc, 0), minlength=D), den)
    yrs = {}
    for y, g in E.assign(tr=tr, r=r_sel).groupby("yr"):
        t = g[g.tr]
        yrs[int(y)] = (float(t.r.mean()) if len(t) else None, int(len(t)))
    full = [v[0] for y, v in yrs.items() if 2018 <= y <= 2025 and v[0] is not None]
    pos = sum(v > 0 for v in full)
    cont = float((choice == 1).sum() / max(tr.sum(), 1))
    ac = float(E.Rc[tr].mean()) if tr.any() else float("nan"); af = float(E.Rf[tr].mean()) if tr.any() else float("nan")
    passed = bool(tr.any() and lo > 0 and pos >= 6 and lox > 0)
    row = dict(label=label, trades=int(tr.sum()), share_traded=float(tr.mean()), cont_share=cont, mean=float(p), lo=float(lo), hi=float(hi),
               vs_placebo=float(px), vs_lo=float(lox), vs_hi=float(hix), years_pos=f"{pos}/{len(full)}", always_cont=ac, always_fade=af, passed=passed, by_year=yrs)
    say(f"| {label} | {tr.sum():,} ({tr.mean():.1%}) | {cont:.0%} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] | {px:+.3f} [{lox:+.3f}, {hix:+.3f}] | {pos}/{len(full)} | {ac:+.3f} / {af:+.3f} | {'PASS' if passed else 'fail'} |")
    return row


HDR = ("| variant | trades (share of events) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2018-25) | "
       "same trades: always continue / always fade | verdict |\n|---|---|---|---|---|---|---|---|")
out_rows, keep = [], {}
say("## Variant 1 — primary (expanding window, mean ≥ +0.03R, t ≥ 3, n ≥ 200)\n"); say(HDR)
for fn, keys in FAM.items():
    ch = walk(keys, 0.03, 3.0, 200); out_rows.append(score(ch, f"V1 {fn}")); keep[fn] = ch
say("\n## Variant 2 — loose (mean > 0, t ≥ 1.5, n ≥ 100)\n"); say(HDR)
for fn, keys in FAM.items():
    out_rows.append(score(walk(keys, 0.0, 1.5, 100), f"V2 {fn}"))
say("\n## Variant 3 — rolling 3-year window (primary thresholds)\n"); say(HDR)
for fn, keys in FAM.items():
    out_rows.append(score(walk(keys, 0.03, 3.0, 200, window=1095), f"V3 {fn}"))
say("\n## Variant 4 — also split by trailing σ regime (top / bottom half)\n"); say(HDR)
for fn, keys in FAM.items():
    out_rows.append(score(walk(keys + ["hi"], 0.03, 3.0, 200), f"V4 {fn}"))
RES["variants"] = out_rows

say("\n## What the walk-forward chose (V1 family B): share of line touches by decision\n")
T = E.assign(ch=keep["B (weekday × hour)"], hg=np.where(E.h <= 7, "01-07", np.where(E.h <= 14, "08-14", "15-21")))
say("| class | rung | hours | touches | continue | fade | no trade |"); say("|---|---|---|---|---|---|---|")
for (c, r, hg), g in T.groupby(["cls", "rung", "hg"]):
    say(f"| {c} | {RN[r]} | {hg} | {len(g):,} | {(g.ch == 1).mean():.1%} | {(g.ch == -1).mean():.1%} | {(g.ch == 0).mean():.1%} |")
say("\nBy calendar year (V1 family B): trades and net R per trade\n")
say("| year | trades | net R per trade |"); say("|---|---|---|")
for y, (m, n) in sorted(out_rows[1]["by_year"].items()):
    say(f"| {y} | {n:,} | {'' if m is None else format(m, '+.3f')} |")
TA = E.assign(ch=keep["A (hour)"])
y0 = TA.groupby(["cls", "rung", "h", "yr"]).ch.agg(lambda s: s.mode().iloc[0]).unstack("yr")
same = []
for a, b in zip(y0.columns[:-1], y0.columns[1:]):
    m = y0[a].notna() & y0[b].notna() & ((y0[a] != 0) | (y0[b] != 0))
    if m.sum():
        same.append(float((y0.loc[m, a] == y0.loc[m, b]).mean()))
stab = float(np.mean(same)) if same else float("nan")
say(f"\nDecision stability (family A, class × rung × hour): agreement with the previous year's decision where either year traded: {stab:.1%}.")
RES["decision_stability"] = stab
(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
