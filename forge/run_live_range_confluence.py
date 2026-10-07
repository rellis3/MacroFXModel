"""LIVE-RANGE-CONFLUENCE-BOOK analysis (forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md).

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_confluence
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of  # noqa: E402

O = Path("analysis/output/live_range_confluence")
RN = ["p50", "p75", "p90"]; SESN = ["Asia <07", "London 07-12", "overlap 12-16", "NY/late 16+"]
LOG, RES = [], {}
MIN_N = 300


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((O / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
from pylego.costs import default_spread  # noqa: E402
SP = np.zeros(len(names))
for i, n in enumerate(names):
    c = pd.read_csv(f"analysis/output/forecast_history/{n}.csv", usecols=["open", "pit_sig_daily", "oos"]); c = c[c.oos == 1]
    SP[i] = default_spread(n) / float((c.open * c.pit_sig_daily / 100).median())
CLSA = np.array([cls_of(n) for n in names])


def prep(path):
    E = pd.read_parquet(path)
    E["inst"] = E.inst.astype(int); E["date"] = E.date.astype(int)
    E["cls"] = CLSA[E.inst.to_numpy()]; E["sp"] = SP[E.inst.to_numpy()]
    E["rung"] = E.rung.astype(int); E["side"] = E.side.astype(int); E["seq"] = E.seq.astype(int)
    E["wd"] = (E.date + 6) % 7
    tm = E.tmin / 60.0
    E["ses"] = np.select([tm < 7, tm < 12, tm < 16], [0, 1, 2], 3)
    E["tmh"] = tm.astype(int)
    E["res"] = (E.pre == 0) & E.code.isin([1, 2])
    E["y"] = (E.code == 1).astype(float)
    E["prw"] = E.b / (E.a + E.b)
    E["exc"] = E.y - E.prw
    E["Rc"] = np.where(E.y == 1, E.a, -E.b) / E.b - E.sp / E.b
    E["Rf"] = np.where(E.y == 0, E.b, -E.a) / E.a - E.sp / E.a
    E["yr"] = pd.to_datetime(E.date.map(pd.Timestamp.fromordinal)).dt.year
    E = E.sort_values(["inst", "tmh", "date", "ti"]).reset_index(drop=True)
    # causal relative approach volume: volume of the last 12 bars vs the median of the previous 200 events at this instrument and hour
    g = E.groupby(["inst", "tmh"]).volapp
    E["relvol"] = E.volapp / g.transform(lambda s: s.shift(1).rolling(200, min_periods=50).median())
    E["wtob"] = (E.wt1 > 53).astype(float)
    return E.sort_values("date").reset_index(drop=True)


EM = prep(O / "ev_moving.parquet"); ESt = prep(O / "ev_static.parquet")
udates = np.sort(np.union1d(EM.date.unique(), ESt.date.unique())); D = len(udates)
HALF = udates[D // 2]
for E in (EM, ESt):
    E["half"] = (E.date >= HALF).astype(int); E["di"] = np.searchsorted(udates, E.date.to_numpy())
W = boot_weights(D)
say(f"# LIVE-RANGE-CONFLUENCE-BOOK — results\n\nPre-registration: `forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md` (+ Amendments 0, 1). 34 instruments, 2018-04 → 2026-08, "
    f"{D:,} dates. **Moving** hourly lines: {len(EM):,} passes ({int(EM.res.sum()):,} resolved races). **Static** morning lines: {len(ESt):,} passes ({int(ESt.res.sum()):,} resolved). "
    "Passes re-arm after a close ≥ 0.15σ back inside the line.\n")

# ================================================================ Part 0 — the move map (descriptive)
say("## Part 0 — where and when the day moves after a pass (every pass, not just the first touch)\n")
say("'continue' = reached the next line out before 22:00 (including a touch bar that already closed past it); 'fall back' = reached the level behind "
    "first; 'stall' = neither by 22:00. 'held' = the day's extreme on that side finished within 0.25σ beyond the line. MFE / MAE = best / worst excursion "
    "after the touch-bar close, σ. Minutes are from the touch.\n")
mp = []
for lab, E in (("moving", EM), ("static", ESt)):
    for (cls, r, s), g in E.groupby(["cls", "rung", "ses"]):
        if len(g) < 200:
            continue
        cont = ((g.pre == 1) | (g.code == 1) & (g.pre == 0)).mean(); back = ((g.pre == 2) | (g.code == 2) & (g.pre == 0)).mean()
        mp.append(dict(lines=lab, cls=cls, rung=RN[r], session=SESN[s], n=len(g), cont=float(cont), back=float(back), stall=float(1 - cont - back),
                       held=float(g.held.mean()), mfe=float(g.mfe.median()), mae=float(g.mae.median()), t_mfe=float(g.t_mfe.median()), t_ext=float(g.t_ext.median()),
                       r60=float(g.r60.mean()), rclose=float(g.rclose.mean())))
M0 = pd.DataFrame(mp)
say("| lines | class | rung | session | passes | continue | fall back | stall | held as day extreme | median MFE / MAE (σ) | median min to MFE | mean return +1h / to close (σ) |")
say("|---|---|---|---|---|---|---|---|---|---|---|---|")
for _, x in M0.sort_values(["cls", "rung", "session", "lines"]).iterrows():
    say(f"| {x.lines} | {x.cls} | {x.rung} | {x.session} | {x.n:,} | {x.cont:.0%} | {x.back:.0%} | {x.stall:.0%} | {x.held:.0%} | {x.mfe:.2f} / {x.mae:.2f} | {x.t_mfe:.0f} | {x.r60:+.3f} / {x.rclose:+.3f} |")
RES["map"] = M0.to_dict("records")
say("\nBy touch number (all passes, moving lines): does a later pass behave differently?\n")
say("| class | rung | pass # | passes | continue | fall back | held | mean return to close (σ) |"); say("|---|---|---|---|---|---|---|---|")
for (cls, r, sq), g in EM.assign(sq=np.minimum(EM.seq, 3)).groupby(["cls", "rung", "sq"]):
    cont = ((g.pre == 1) | (g.code == 1) & (g.pre == 0)).mean(); back = ((g.pre == 2) | (g.code == 2) & (g.pre == 0)).mean()
    say(f"| {cls} | {RN[r]} | {'3+' if sq == 3 else sq} | {len(g):,} | {cont:.0%} | {back:.0%} | {g.held.mean():.0%} | {g.rclose.mean():+.3f} |")
say("\nWhen the day's extreme forms after a pass (moving lines, FX/gold): median minutes from touch to the extreme beyond the line, and its extent\n")
say("| rung | session | passes | median minutes to the day's extreme | median extension beyond the line (σ) | 90th percentile extension |"); say("|---|---|---|---|---|---|")
for (r, s), g in EM[EM.cls == "fx_gold"].groupby(["rung", "ses"]):
    say(f"| {RN[r]} | {SESN[s]} | {len(g):,} | {g.t_ext.median():.0f} | {g.ext.median():.2f} | {g.ext.quantile(.9):.2f} |")

# ================================================================ T1 / T2 — confluence lifts, moving vs static
CONT = ["roc15", "roc60", "roc180", "accel", "wt1", "wtd", "vwapd", "rv", "used", "speed", "relvol", "regime_ratio"]
BIN = ["L_pdH", "L_pdL", "L_pdC", "L_pwH", "L_pwL", "L_wo", "L_poc", "L_vah", "L_val", "wtob", "wtcross", "wtdiv", "rtjump"]


def conf_masks(E, edges, cls, r):
    """name -> (present mask, absent mask) on E's rows for one class and rung."""
    base = ((E.cls == cls) & (E.rung == r) & E.res).to_numpy()
    out = {}
    for c in BIN:
        v = E[c].fillna(0).to_numpy()
        out[c] = (base & (v == 1), base & (v == 0))
    out["any naked POC"] = (base & (E.npoc.to_numpy() > 0), base & (E.npoc.to_numpy() == 0))
    out["1+ level stacked"] = (base & (E.nstack.to_numpy() >= 1), base & (E.nstack.to_numpy() == 0))
    out["2+ levels stacked"] = (base & (E.nstack.to_numpy() >= 2), base & (E.nstack.to_numpy() <= 1))
    out["pass #2+"] = (base & (E.seq.to_numpy() >= 2), base & (E.seq.to_numpy() == 1))
    for c in CONT:
        lo, hi = edges[(cls, r, c)]
        v = E[c].to_numpy()
        ok = np.isfinite(v)
        out[c + " top third"] = (base & ok & (v >= hi), base & ok & (v <= lo))
    for s_ in range(4):
        out[f"session {SESN[s_]}"] = (base & (E.ses.to_numpy() == s_), base & (E.ses.to_numpy() != s_))
    for w_ in range(5):
        out[f"weekday {['Mon','Tue','Wed','Thu','Fri'][w_]}"] = (base & (E.wd.to_numpy() == w_), base & (E.wd.to_numpy() != w_))
    return out


def edges_for(E_list):
    ed = {}
    for cls in ("fx_gold", "indices"):
        for r in range(3):
            for c in CONT:
                v = pd.concat([E[(E.cls == cls) & (E.rung == r) & E.res & (E.half == 0)][c] for E in E_list]).dropna()
                ed[(cls, r, c)] = (float(v.quantile(1 / 3)), float(v.quantile(2 / 3))) if len(v) > 100 else (np.nan, np.nan)
    return ed


EDG = edges_for([EM, ESt])


def arrs(E, mask, col):
    v = E[col].to_numpy()[mask]
    return (np.bincount(E.di.to_numpy()[mask], weights=v, minlength=D), np.bincount(E.di.to_numpy()[mask], minlength=D).astype(float))


def lift_boot(E, pres, absn):
    n1, d1 = arrs(E, pres, "exc"); n0, d0 = arrs(E, absn, "exc")
    with np.errstate(all="ignore"):
        rep = (W @ n1) / (W @ d1) - (W @ n0) / (W @ d0)
    pt = n1.sum() / d1.sum() - n0.sum() / d0.sum()
    h = []
    for hh in (0, 1):
        a = pres & (E.half == hh).to_numpy(); b = absn & (E.half == hh).to_numpy()
        h.append(E.exc.to_numpy()[a].mean() - E.exc.to_numpy()[b].mean() if a.sum() and b.sum() else np.nan)
    return pt, rep, h


rows = []
for cls in ("fx_gold", "indices"):
    for r in range(3):
        mm = conf_masks(EM, EDG, cls, r); ms = conf_masks(ESt, EDG, cls, r)
        for nm in mm:
            pm, am = mm[nm]; ps, as_ = ms[nm]
            if min(pm.sum(), am.sum(), ps.sum(), as_.sum()) < MIN_N:
                continue
            lm, rm, hm = lift_boot(EM, pm, am); ls, rs, hs = lift_boot(ESt, ps, as_)
            lo_m, hi_m = np.nanpercentile(rm, [2.5, 97.5]); lo_s, hi_s = np.nanpercentile(rs, [2.5, 97.5])
            real_m = bool((lo_m > 0 or hi_m < 0) and abs(lm) >= .02 and np.sign(hm[0]) == np.sign(hm[1]) == np.sign(lm))
            real_s = bool((lo_s > 0 or hi_s < 0) and abs(ls) >= .02 and np.sign(hs[0]) == np.sign(hs[1]) == np.sign(ls))
            sg = np.sign(lm) if lm != 0 else 1.0
            dd = sg * (rm - rs); dpt = sg * (lm - ls)
            dlo, dhi = np.nanpercentile(dd, [2.5, 97.5])
            dh = [sg * (hm[i] - hs[i]) for i in (0, 1)]
            unlock = bool(real_m and dlo > 0 and dh[0] > 0 and dh[1] > 0)
            rows.append(dict(cls=cls, rung=RN[r], conf=nm, n_mov=int(pm.sum()), n_sta=int(ps.sum()), lift_mov=float(lm), lo_m=float(lo_m), hi_m=float(hi_m),
                             lift_sta=float(ls), lo_s=float(lo_s), hi_s=float(hi_s), real_mov=real_m, real_sta=real_s, diff=float(dpt), dlo=float(dlo), dhi=float(dhi), unlock=unlock))
T = pd.DataFrame(rows)
say("\n## T1 / T2 — which confluences move continue-vs-fade, and does the moving line unlock more?\n")
say("Lift = excess continuation (race result minus the random-walk b÷(a+b) from the touch-bar close) with the confluence present minus absent "
    "(top vs bottom third for continuous ones). A *real* lift: date-block 95% interval excludes 0, same sign in both halves, ≥ 2pp, n ≥ 300 per side. "
    "*Unlocked*: the moving-line lift exceeds the static-line lift, interval above 0, in both halves.\n")
nt = len(T)
say(f"Confluence × class × rung tests with enough passes: **{nt}**. Real lift at MOVING lines: **{int(T.real_mov.sum())}** ({T.real_mov.mean():.1%}; chance ≈ 5%). "
    f"Real at STATIC lines: **{int(T.real_sta.sum())}** ({T.real_sta.mean():.1%}). Unlocked by the moving line: **{int(T.unlock.sum())}**.\n")
say("Real lifts at the moving lines (largest first):\n")
say("| class | rung | confluence | passes (present) | lift moving [95%] | lift static [95%] | moving − static [95%] | unlocked |"); say("|---|---|---|---|---|---|---|---|")
for _, x in T[T.real_mov].sort_values("lift_mov", key=lambda s: -s.abs()).head(40).iterrows():
    say(f"| {x.cls} | {x.rung} | {x.conf} | {x.n_mov:,} | {x.lift_mov*100:+.1f}pp [{x.lo_m*100:+.1f}, {x.hi_m*100:+.1f}] | {x.lift_sta*100:+.1f}pp [{x.lo_s*100:+.1f}, {x.hi_s*100:+.1f}] | {x['diff']*100:+.1f}pp [{x.dlo*100:+.1f}, {x.dhi*100:+.1f}] | {'YES' if x.unlock else 'no'} |")
say("\nReal lifts at STATIC lines that are not real at the moving lines (so the moving line removes them):\n")
for _, x in T[T.real_sta & ~T.real_mov].sort_values("lift_sta", key=lambda s: -s.abs()).head(12).iterrows():
    say(f"- {x.cls} {x.rung} {x.conf}: static {x.lift_sta*100:+.1f}pp, moving {x.lift_mov*100:+.1f}pp")
RES["T"] = T.to_dict("records")

# first-touch-only check
FT = []
for lab, E in (("moving", EM), ("static", ESt)):
    sub = E[E.seq == 1]
    FT.append(f"{lab}: {len(sub):,} first passes of {len(E):,}; continuation excess vs random walk {sub[sub.res].exc.mean()*100:+.2f}pp (all passes {E[E.res].exc.mean()*100:+.2f}pp)")
say("\nFirst-touch-only check: " + "; ".join(FT) + ".\n")

# ================================================================ T3 — walk-forward meta-label
FEAT = ["cls_i", "rung", "side", "tmh", "ses", "wd", "seq", "a", "b", "prw", "used", "speed", "rv", "roc15", "roc60", "roc180", "accel", "wt1", "wtd", "wtcross", "wtdiv",
        "vwapd", "relvol", "regime_ratio", "nstack", "npoc"] + BIN[:9]


def walk_forward(E, label):
    R = E[E.res].copy().reset_index(drop=True)
    R["cls_i"] = (R.cls == "indices").astype(int)
    R["q"] = (pd.to_datetime(R.date.map(pd.Timestamp.fromordinal)).dt.year * 4 + (pd.to_datetime(R.date.map(pd.Timestamp.fromordinal)).dt.month - 1) // 3)
    p = np.full(len(R), np.nan)
    rng = np.random.default_rng(0)
    for q in sorted(R.q.unique()):
        if q < 2020 * 4 + 1:                                                   # burn-in: trade from 2020-04
            continue
        tr = R.q < q
        idx = np.flatnonzero(tr.to_numpy())
        if len(idx) > 200_000:
            idx = rng.choice(idx, 200_000, replace=False)
        te = np.flatnonzero((R.q == q).to_numpy())
        if len(te) == 0:
            continue
        m = HistGradientBoostingClassifier(max_iter=80, learning_rate=0.1, max_leaf_nodes=31, min_samples_leaf=200, random_state=0)
        m.fit(R.loc[idx, FEAT].to_numpy(), R.y.to_numpy()[idx])
        p[te] = m.predict_proba(R.loc[te, FEAT].to_numpy())[:, 1]
    R["p"] = p
    return R[np.isfinite(R.p)].reset_index(drop=True)


def score_wf(R, label, margin=0.05, decile=False):
    if decile:
        d = R.p - R.prw
        lo_t, hi_t = d.quantile(.1), d.quantile(.9)
        choice = np.where(d >= hi_t, 1, np.where(d <= lo_t, -1, 0))
    else:
        choice = np.where(R.p > R.prw + margin, 1, np.where(R.p < R.prw - margin, -1, 0))
    tr = choice != 0
    r_sel = np.where(choice == 1, R.Rc, np.where(choice == -1, R.Rf, 0.0))
    plc = 0.5 * (R.Rc + R.Rf).to_numpy()
    di = R.di.to_numpy()
    den = np.bincount(di, weights=tr.astype(float), minlength=D)
    def ci(x):
        num = np.bincount(di, weights=np.where(tr, x, 0), minlength=D)
        with np.errstate(all="ignore"):
            r = (W @ num) / (W @ den)
        return num.sum() / den.sum(), np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)
    p_, lo, hi = ci(r_sel); px, lox, hix = ci(r_sel - plc)
    yrs = R.assign(tr=tr, r=r_sel).groupby("yr").apply(lambda g: g.r[g.tr].mean() if g.tr.any() else np.nan)
    pos = int((yrs.loc[2020:2025] > 0).sum())
    passed = bool(tr.any() and lo > 0 and pos >= 5 and lox > 0)
    cont = float((choice == 1).sum() / max(tr.sum(), 1))
    auc = roc_auc_score(R.y, R.p); aucb = roc_auc_score(R.y, R.prw)
    say(f"| {label} | {tr.sum():,} ({tr.mean():.1%}) | {cont:.0%} | {p_:+.3f} [{lo:+.3f}, {hi:+.3f}] | {px:+.3f} [{lox:+.3f}, {hix:+.3f}] | {pos}/6 | {auc:.3f} vs {aucb:.3f} | {'PASS' if passed else 'fail'} |")
    return dict(label=label, trades=int(tr.sum()), mean=float(p_), lo=float(lo), hi=float(hi), vs_rand=float(px), vs_lo=float(lox), years_pos=pos, auc=float(auc), auc_geom=float(aucb), passed=passed,
                by_year={int(k): (None if np.isnan(v) else float(v)) for k, v in yrs.items()})


say("## T3 — walk-forward meta-label (refit every quarter on prior passes only; trading from 2020-04)\n")
say("Trade CONTINUE if the model's P(continue) > the random-walk share + 0.05, FADE if < − 0.05, else no trade. Net R after spread. 'vs random pick' = same trades, side chosen 50/50. "
    "AUC: model vs the geometry-only random-walk share b÷(a+b).\n")
say("| lines | trades (share of passes) | continue share | net R per trade [95%] | vs random pick [95%] | years > 0 (2020-25) | AUC model vs geometry | verdict |"); say("|---|---|---|---|---|---|---|---|")
t3 = []
WF = {}
for lab, E in (("moving", EM), ("static", ESt)):
    WF[lab] = walk_forward(E, lab)
    t3.append(score_wf(WF[lab], f"{lab} (margin 0.05)"))
    t3.append(score_wf(WF[lab], f"{lab} (top/bottom decile of P − RW)", decile=True))
RES["T3"] = t3
say("\nWhere the meta-label model is most confident, by class and rung (moving lines): decision shares\n")
say("| class | rung | passes | continue | fade | no trade |"); say("|---|---|---|---|---|---|")
R = WF["moving"]; ch = np.where(R.p > R.prw + .05, 1, np.where(R.p < R.prw - .05, -1, 0))
for (c, r), g in R.assign(ch=ch).groupby(["cls", "rung"]):
    say(f"| {c} | {RN[r]} | {len(g):,} | {(g.ch == 1).mean():.1%} | {(g.ch == -1).mean():.1%} | {(g.ch == 0).mean():.1%} |")

# ================================================================ T3b single-confluence rules (train first 60% / test last 40% per class)
say("\n## T3b — single confluence rules chosen on the first 60% of dates, confirmed on the last 40%\n")
sel_rows = []
for lab, E in (("moving", EM), ("static", ESt)):
    for cls in ("fx_gold", "indices"):
        cut = float(E[E.cls == cls].date.quantile(.6))
        for r in range(3):
            ms = conf_masks(E, EDG, cls, r)
            for nm, (pres, _) in ms.items():
                trm = pres & (E.date.to_numpy() < cut); tem = pres & (E.date.to_numpy() >= cut)
                if trm.sum() < MIN_N or tem.sum() < 200:
                    continue
                for strat, col in (("continue", "Rc"), ("fade", "Rf")):
                    mu = E[col].to_numpy()[trm].mean()
                    if mu <= 0:
                        continue
                    n1, d1 = arrs(E, tem, col)
                    with np.errstate(all="ignore"):
                        rep = (W @ n1) / (W @ d1)
                    lo, hi = np.nanpercentile(rep, [2.5, 97.5])
                    sel_rows.append(dict(lines=lab, cls=cls, rung=RN[r], conf=nm, strat=strat, train=float(mu), test=float(n1.sum() / d1.sum()), lo=float(lo), n=int(tem.sum()), passed=bool(lo > 0)))
S = pd.DataFrame(sel_rows)
for lab in ("moving", "static"):
    s_ = S[S.lines == lab]
    say(f"- {lab}: {len(s_)} rules positive on train; positive on test {int((s_.test > 0).sum())}; interval wholly > 0 on test: **{int(s_.passed.sum())}**; "
        f"mean test net R of the selected rules {s_.test.mean():+.3f} (train {s_.train.mean():+.3f}).")
RES["T3b"] = S.to_dict("records")
(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
