"""LIVE-RANGE-HISTORY analysis (forge/LIVE_RANGE_HISTORY_PREREG.md). Reads the build output, scores the TEST 40% only.

    python -m forge.run_live_range_history
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402  (date-block bootstrap, same helper as the lessons session)

from forge.run_live_range_history_build import cls_of, meta  # noqa: E402

O = Path("analysis/output/live_range_history")
HG = lambda h: np.where(h <= 7, 0, np.where(h <= 14, 1, 2))
HGN = ["01-07", "08-14", "15-21"]
RN = ["p50", "p75", "p90"]
MIN_N = 300
RES = {}                                   # everything that goes to results.json
LOG = []                                   # lines for RESULTS.md


def say(s=""):
    print(s, flush=True); LOG.append(s)


# ---------------------------------------------------------------- data
names = json.loads((O / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
splits = json.loads((O / "splits.json").read_text())
CLS = np.array([cls_of(n) for n in names])
M = pd.concat([meta(n).assign(inst=i) for i, n in enumerate(names)], ignore_index=True)
M["date"] = pd.to_datetime(M.date).map(pd.Timestamp.toordinal).astype(np.int32)
M["inst"] = M.inst.astype(np.int16)
M["regime"] = np.select([M.regime_ratio < 0.85, M.regime_ratio > 1.15], [0, 2], 1)
M.loc[M.regime_ratio.isna(), "regime"] = -1
M = M.set_index(["inst", "date"])


def prep(df):
    df = df.copy()
    df["cls"] = CLS[df.inst.to_numpy()]
    spl = np.where(df.cls == "fx_gold", splits["split_fx_gold"], splits["split_indices"])
    df = df[df.date >= spl].copy()                                  # TEST 40% only
    j = M.reindex(pd.MultiIndex.from_arrays([df.inst, df.date]))
    df["bns"] = j.jump_bns.to_numpy(); df["regime"] = j.regime.to_numpy()
    df["hg"] = HG(df.h.to_numpy())
    return df


HR = prep(pd.read_parquet(O / "hours.parquet"))
HS = prep(pd.read_parquet(O / "hours_ship.parquet"))
ER = prep(pd.read_parquet(O / "ev_real.parquet"))
EC_ = prep(pd.read_parquet(O / "ev_ctrl.parquet"))
ES = prep(pd.read_parquet(O / "ev_ship.parquet"))
udates = np.sort(HR.date.unique()); D = len(udates)
HALF = udates[D // 2]
W = boot_weights(D)
di = lambda df: np.searchsorted(udates, df.date.to_numpy())
say(f"# LIVE-RANGE-HISTORY — results\n\nPre-registration: `forge/LIVE_RANGE_HISTORY_PREREG.md`. Test = last 40% of dates per class "
    f"(fx_gold from {pd.Timestamp.fromordinal(int(splits['split_fx_gold'])).date()}, indices from "
    f"{pd.Timestamp.fromordinal(int(splits['split_indices'])).date()}); {D} test dates, "
    f"{HR.groupby(['inst','date']).ngroups} instrument-sessions, {len(ER):,} real line touches, {len(EC_):,} placebo touches.\n")


# ---------------------------------------------------------------- bootstrap helpers
def dsum(df, mask, vals):
    return np.bincount(di(df)[mask], weights=np.asarray(vals, float)[mask], minlength=D)


def ratio_ci(num, den):
    """date-block bootstrap of sum(num)/sum(den); returns point, lo, hi."""
    p = num.sum() / den.sum() if den.sum() > 0 else np.nan
    bn, bd = W @ num, W @ den
    with np.errstate(all="ignore"):
        r = bn / bd
    return p, np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


def diff_ci(n1, d1, n0, d0):
    p = (n1.sum() / d1.sum() if d1.sum() else np.nan) - (n0.sum() / d0.sum() if d0.sum() else np.nan)
    with np.errstate(all="ignore"):
        r = (W @ n1) / (W @ d1) - (W @ n0) / (W @ d0)
    return p, np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


def share(df, mask, y):
    return dsum(df, mask, y), dsum(df, mask, np.ones(len(df)))


# ================================================================ Q2 touches and jump-through
def line_table(H_, E_):
    """One row per drawn line (off > 0) with its touch event (if any) in its own hour."""
    rows = []
    for side, tag in ((1, "U"), (-1, "D")):
        for r in range(3):
            off = H_[f"off{tag}{r}"].to_numpy()
            ok = off > 1e-9
            t = H_.loc[ok, ["inst", "date", "h", "cls", "bns", "regime", "hg", "jbefore", "jlast", "cell"]].copy()
            t["side"] = side; t["rung"] = r; t["off"] = off[ok]
            t["reach"] = H_.loc[ok, f"r{tag}{r}"].to_numpy()
            rows.append(t)
    L = pd.concat(rows, ignore_index=True)
    k = lambda d: (d.inst.astype(np.int64) * 10**8 + d.date.astype(np.int64)) * 1000 + d.h.astype(np.int64) * 10 + (d.side.astype(np.int64) > 0) * 5 + d.rung.astype(np.int64)
    L["key"] = k(L)
    E = E_.copy(); E["key"] = k(E)
    L = L.merge(E[["key", "over", "j1", "a", "b", "pre", "code", "inhour", "rtjump", "tmin"]], on="key", how="left")
    L["touched"] = L.over.notna()
    return L


LR = line_table(HR, ER)
nl_phantom = int(sum(((HR[f"off{t}{r}"] <= 1e-9)).sum() for t in "UD" for r in range(3)))
say(f"## Q1 replay\n\nShipped-JS fidelity: 15 recent sessions × 3 instruments, 1,890 lines, max difference 0.0σ "
    f"(`forge/live_range_fidelity.mjs`). Phantom lines (sit on the running extreme, offset 0, excluded): "
    f"{nl_phantom:,} of {nl_phantom + len(LR):,} drawn lines in the test period.\n")
RES["phantom_lines"] = nl_phantom; RES["real_lines"] = len(LR)

say("## Q2 touches and jump-through (test period)\n")
say("Touch rate = lines touched in their own hour ÷ lines drawn. J1 = touch bar also reaches the next line out. "
    "J2 = touch bar's overshoot ≥ 0.25σ (0.10σ / 0.50σ in brackets). Overshoot quantiles in σ.\n")
q2 = []
say("| class | rung | hours | lines | touch rate | J1 | J2 .25σ (.10/.50) | overshoot p50 / p90 |")
say("|---|---|---|---|---|---|---|---|")
for cls in ("fx_gold", "indices"):
    for r in range(3):
        for g in range(3):
            m = (LR.cls == cls) & (LR.rung == r) & (LR.hg == g)
            t = m & LR.touched
            if m.sum() < 200 or t.sum() < 30:
                continue
            ov = LR.loc[t, "over"]
            row = dict(cls=cls, rung=RN[r], hours=HGN[g], lines=int(m.sum()), touch_rate=float(t.sum() / m.sum()),
                       J1=float(LR.loc[t, "j1"].mean()), J2_25=float((ov >= .25).mean()), J2_10=float((ov >= .10).mean()),
                       J2_50=float((ov >= .50).mean()), over_p50=float(ov.median()), over_p90=float(ov.quantile(.9)))
            q2.append(row)
            say(f"| {cls} | {RN[r]} | {HGN[g]} | {row['lines']:,} | {row['touch_rate']:.1%} | {row['J1']:.1%} | "
                f"{row['J2_25']:.1%} ({row['J2_10']:.0%}/{row['J2_50']:.0%}) | {row['over_p50']:.2f} / {row['over_p90']:.2f} |")
RES["q2_table"] = q2

say("\nJump splits of the jump-through rate (J2 ≥ 0.25σ, touches only). Difference = jump − no-jump, date-block 95% interval. "
    "**elevated** = interval wholly above 0 and ≥ 2pp.\n")
say("| class | rung | split | jump n | no-jump n | J2 jump | J2 no-jump | diff [95%] | verdict |")
say("|---|---|---|---|---|---|---|---|---|")
q2s = []
for split_name, col in (("BNS jump day (end-of-day, descriptive)", "bns"), ("a jump already happened today (real time)", "rtjump")):
    for cls in ("fx_gold", "indices"):
        for r in range(3):
            t = (LR.cls == cls) & (LR.rung == r) & LR.touched
            j1 = t & (LR[col] == 1); j0 = t & (LR[col] == 0)
            if j1.sum() < 50 or j0.sum() < 50:
                continue
            y = (LR.over >= .25).astype(float)
            n1, d1 = share(LR, j1.to_numpy(), y); n0, d0 = share(LR, j0.to_numpy(), y)
            p, lo, hi = diff_ci(n1, d1, n0, d0)
            v = "elevated" if lo > 0 and p >= .02 else ("lower" if hi < 0 and p <= -.02 else "inside noise")
            q2s.append(dict(split=col, cls=cls, rung=RN[r], n_jump=int(j1.sum()), n_nojump=int(j0.sum()),
                            j2_jump=float(n1.sum() / d1.sum()), j2_nojump=float(n0.sum() / d0.sum()), diff=float(p), lo=float(lo), hi=float(hi), verdict=v))
            say(f"| {cls} | {RN[r]} | {col} | {int(j1.sum()):,} | {int(j0.sum()):,} | {n1.sum()/d1.sum():.1%} | {n0.sum()/d0.sum():.1%} | "
                f"{p*100:+.1f}pp [{lo*100:+.1f}, {hi*100:+.1f}] | {v} |")
RES["q2_jump_splits"] = q2s

say("\nJ1 (runs straight through to the next line in the touch bar), same splits, p75 touches:\n")
say("| class | split | J1 jump | J1 no-jump | diff [95%] |"); say("|---|---|---|---|---|")
for col in ("bns", "rtjump"):
    for cls in ("fx_gold", "indices"):
        t = (LR.cls == cls) & (LR.rung == 1) & LR.touched
        j1 = t & (LR[col] == 1); j0 = t & (LR[col] == 0)
        n1, d1 = share(LR, j1.to_numpy(), LR.j1.fillna(0)); n0, d0 = share(LR, j0.to_numpy(), LR.j1.fillna(0))
        p, lo, hi = diff_ci(n1, d1, n0, d0)
        say(f"| {cls} | {col} | {n1.sum()/d1.sum():.1%} | {n0.sum()/d0.sum():.1%} | {p*100:+.1f}pp [{lo*100:+.1f}, {hi*100:+.1f}] |")

say("\nBy hour (p75 lines, fx_gold): touch rate and J2 ≥ 0.25σ\n")
say("| hour | lines | touch rate | J2 |"); say("|---|---|---|---|")
for h in range(1, 22):
    m = (LR.cls == "fx_gold") & (LR.rung == 1) & (LR.h == h)
    t = m & LR.touched
    if m.sum() > 100:
        say(f"| {h:02d}:00 | {int(m.sum()):,} | {t.sum()/m.sum():.1%} | {(LR.loc[t,'over']>=.25).mean():.1%} |")


# ================================================================ Q3 after-touch race
def race_frame(E_, hour_limited=False):
    E = E_.copy()
    E["code_u"] = E.code.where(E.pre == 0)
    if hour_limited:
        E.loc[E.inhour == 0, "code_u"] = 0                            # not resolved inside the touch hour
    E = E[E.code_u.isin([1, 2])].copy()
    E["y"] = (E.code_u == 1).astype(float)
    E["prw"] = E.b / (E.a + E.b)
    E["half"] = (E.date >= HALF).astype(int)
    E["rung"] = E.rung.astype(int)
    return E


def attach_shift(E):
    """shift bucket for the line's own side, from hours rows (re-estimate of the p75 offset vs previous hour)."""
    return E


# shift table (Q5) built from hours: delta offset of each rung vs previous hour, per side
def shifts(H_):
    H_ = H_.sort_values(["inst", "date", "h"]).reset_index(drop=True)
    prev = H_.groupby(["inst", "date"])
    out = {}
    for tag in "UD":
        for r in range(3):
            c = f"off{tag}{r}"
            out[f"d{tag}{r}"] = H_[c] - prev[c].shift(1)
    S = pd.concat([H_[["inst", "date", "h", "cls", "hg", "jlast", "jbefore", "bns", "regime", "cell"]], pd.DataFrame(out)], axis=1)
    for tag in "UD":
        S[f"line{tag}"] = np.nan
    return H_, S


def cell_table(RE, CE, label, group_cols, hour_limited=False):
    """real − placebo out-share by cell. group_cols: list of columns defining a cell (both frames carry them)."""
    out = []
    for key, g in RE.groupby(group_cols):
        key = key if isinstance(key, tuple) else (key,)
        n_real = len(g)
        if n_real < MIN_N:
            continue
        mr = np.ones(len(RE), bool); mc = np.ones(len(CE), bool)
        for c, v in zip(group_cols, key):
            mr &= (RE[c] == v).to_numpy(); mc &= (CE[c] == v).to_numpy()
        if mc.sum() < MIN_N:
            continue
        n1, d1 = share(RE, mr, RE.y); n0, d0 = share(CE, mc, CE.y)
        p, lo, hi = diff_ci(n1, d1, n0, d0)
        half = []
        for hh in (0, 1):
            a = mr & (RE.half == hh).to_numpy(); b = mc & (CE.half == hh).to_numpy()
            ya = RE.y.to_numpy()[a].mean() if a.sum() else np.nan
            yb = CE.y.to_numpy()[b].mean() if b.sum() else np.nan
            half.append(ya - yb)
        rw = float(RE.prw.to_numpy()[mr].mean())
        dyn = bool(lo > 0 or hi < 0) and abs(p) >= .02 and np.sign(half[0]) == np.sign(half[1]) == np.sign(p)
        out.append(dict(label=label, cell=dict(zip(group_cols, [int(k) if isinstance(k, (np.integer, float)) else k for k in key])),
                        n_real=int(mr.sum()), n_ctrl=int(mc.sum()), real=float(n1.sum() / d1.sum()), ctrl=float(n0.sum() / d0.sum()),
                        rw=rw, ab=float((RE.a + RE.b).to_numpy()[mr].mean()), diff=float(p), lo=float(lo), hi=float(hi), half1=float(half[0]), half2=float(half[1]), dynamic=dyn))
    return out


def run_q3(hour_limited, title, ctrl=None, brief=False):
    RE = race_frame(ER, hour_limited); CE = race_frame(EC_ if ctrl is None else ctrl, hour_limited)
    # shift bucket attach (real-time known at the draw): p75 re-estimate of the same side vs previous hour
    HRs, S = shifts(HR)
    thr = {c: float(S.loc[(S.cls == c)].eval("dU1.abs()").dropna().quantile(.9)) for c in ("fx_gold", "indices")}
    def bucket(df):
        d = np.where(df.side > 0, df.k_dU1, df.k_dD1)
        t = df.cls.map(thr).to_numpy()
        return np.where(np.isnan(d), -1, np.where(d >= t, 2, np.where(d <= -t, 0, 1)))
    SS = S[["inst", "date", "h", "dU1", "dD1"]].rename(columns={"dU1": "k_dU1", "dD1": "k_dD1"})
    for df in (RE, CE):
        pass
    RE = RE.merge(SS, on=["inst", "date", "h"], how="left"); CE = CE.merge(SS, on=["inst", "date", "h"], how="left")
    RE["shift"] = bucket(RE); CE["shift"] = bucket(CE)
    RE["cellu"] = RE.cell.astype(int); CE["cellu"] = CE.cell.astype(int)
    RE["rtj"] = RE.rtjump.astype(int); CE["rtj"] = CE.rtjump.astype(int)
    RE["reg"] = RE.regime.astype(int); CE["reg"] = CE.regime.astype(int)
    RE["sd"] = RE.side.astype(int); CE["sd"] = CE.side.astype(int)
    tabs = []
    base = ["cls", "rung", "hg"]
    tabs += cell_table(RE, CE, "base rung×class×hours", base)
    tabs += cell_table(RE, CE, "base × side", base + ["sd"])
    for var, nm in (("cellu", "cell used×pace"), ("reg", "regime"), ("rtj", "jump already today"), ("shift", "big line shift (0 narrowed, 1 small, 2 widened)")):
        tabs += cell_table(RE, CE, f"{nm}", ["cls", "rung", var])
        tabs += cell_table(RE, CE, f"{nm} × hours", ["cls", "rung", "hg", var])
    dyn = [t for t in tabs if t["dynamic"]]
    say(f"\n### {title}\n")
    pooled = []
    say("| class | rung | n real | real out-share | placebo | random walk | diff [95%] |"); say("|---|---|---|---|---|---|---|")
    for cls in ("fx_gold", "indices"):
        for r in range(3):
            mr = ((RE.cls == cls) & (RE.rung == r)).to_numpy(); mc = ((CE.cls == cls) & (CE.rung == r)).to_numpy()
            n1, d1 = share(RE, mr, RE.y); n0, d0 = share(CE, mc, CE.y)
            p, lo, hi = diff_ci(n1, d1, n0, d0)
            pooled.append(dict(cls=cls, rung=RN[r], n=int(mr.sum()), real=float(n1.sum() / d1.sum()), ctrl=float(n0.sum() / d0.sum()),
                               rw=float(RE.prw.to_numpy()[mr].mean()), diff=float(p), lo=float(lo), hi=float(hi)))
            say(f"| {cls} | {RN[r]} | {int(mr.sum()):,} | {n1.sum()/d1.sum():.1%} | {n0.sum()/d0.sum():.1%} | {RE.prw.to_numpy()[mr].mean():.1%} | {p*100:+.2f}pp [{lo*100:+.2f}, {hi*100:+.2f}] |")
    rate = len(dyn) / max(len(tabs), 1)
    say(f"\nCells examined: **{len(tabs)}**; dynamics (CI excludes 0, |diff| ≥ 2pp, same sign in both halves, n ≥ {MIN_N}): **{len(dyn)}** ({rate:.1%}; chance rate at 95% ≈ 5%).")
    verdict = "PATH-NEUTRAL" if rate < .05 else "DYNAMICS FOUND"
    say(f"Verdict: **{verdict}**.")
    if dyn and not brief:
        say("\n| split | cell | n real | real | placebo | diff [95%] | half 1 / half 2 |"); say("|---|---|---|---|---|---|---|")
        for t in sorted(dyn, key=lambda t: -abs(t["diff"])):
            say(f"| {t['label']} | {t['cell']} | {t['n_real']:,} | {t['real']:.1%} | {t['ctrl']:.1%} | {t['diff']*100:+.1f}pp [{t['lo']*100:+.1f}, {t['hi']*100:+.1f}] | {t['half1']*100:+.1f} / {t['half2']*100:+.1f} |")
    if brief:
        return dict(pooled=pooled, cells=len(tabs), dynamics=len(dyn), rate=rate, verdict=verdict, dyn=dyn, all=tabs), RE
    # largest cells regardless
    top = sorted(tabs, key=lambda t: -abs(t["diff"] / max((t["hi"] - t["lo"]) / 3.92, 1e-9)))[:5]
    say("\nLargest 5 cells by z (shown, whether or not they pass):\n")
    say("| split | cell | n | diff [95%] |"); say("|---|---|---|---|")
    for t in top:
        say(f"| {t['label']} | {t['cell']} | {t['n_real']:,} | {t['diff']*100:+.1f}pp [{t['lo']*100:+.1f}, {t['hi']*100:+.1f}] |")
    return dict(pooled=pooled, cells=len(tabs), dynamics=len(dyn), rate=rate, verdict=verdict, dyn=dyn, all=tabs), RE


say("\n## Q3 what happens after a touch\n")
say("Race from the touch bar's close: next line out vs back level (resolved races only; pre-resolved and both-in-one-bar excluded). "
    "Baseline = placebo ladders (control lines at 0.7–0.9× / 1.1–1.3× the distances, same code, same sessions).")
npre = int((ER.pre > 0).sum()); nboth = int((ER.code == 3).sum()); nnone = int(((ER.code == 0) & (ER.pre == 0)).sum())
say(f"\nOf {len(ER):,} real touches: {npre:,} ({npre/len(ER):.1%}) closed the touch bar already past the next line or back level; "
    f"{nboth:,} both-in-one-bar; {nnone:,} unresolved by 22:00.")
R1, RE1 = run_q3(False, "Variant 1 — race to 22:00 on fixed levels (primary)")
R2, _ = run_q3(True, "Variant 2 — race limited to the touch hour")
EC2 = prep(pd.read_parquet(O / "ev_ctrl2.parquet"))
R5, _ = run_q3(False, "Variant 5a — closer placebo (±3–10% distance change), race to 22:00", ctrl=EC2, brief=True)
R6, _ = run_q3(True, "Variant 5b — closer placebo, race limited to the touch hour", ctrl=EC2, brief=True)
RES["q3_v5a"] = {k: v for k, v in R5.items() if k != "all"}; RES["q3_v5b"] = {k: v for k, v in R6.items() if k != "all"}
RES["q3_v1"] = {k: v for k, v in R1.items() if k != "all"}; RES["q3_v2"] = {k: v for k, v in R2.items() if k != "all"}
RES["q3_v1"]["all_cells"] = R1["all"]

# ================================================================ Q4 reach odds on jump days
def reach_rows(H_):
    rows = []
    for tag, side in (("U", 1), ("D", -1)):
        t = H_[["inst", "date", "h", "cls", "hg", "bns", "jbefore", "jlast", "regime"]].copy()
        t["r0"] = H_[f"r{tag}0"].to_numpy(); t["r1"] = H_[f"r{tag}1"].to_numpy(); t["r2"] = H_[f"r{tag}2"].to_numpy()
        t["side"] = side
        rows.append(t)
    return pd.concat(rows, ignore_index=True)


RR = reach_rows(HR); RS = reach_rows(HS)
IMPL = {"p50→p75": (0, 1, .50), "p75→p90": (1, 2, .40)}


def reach_block(RR_, title, splitcol, labels):
    say(f"\n{title}\n")
    say("| class | split | p75 exceed (25%) | p90 exceed (10%) | p50→p75 (50%) | p75→p90 (40%) | n touched p75 |"); say("|---|---|---|---|---|---|---|")
    out = []
    for cls in ("fx_gold", "indices"):
        for val, lab in labels:
            m = (RR_.cls == cls) & (RR_[splitcol] == val)
            row = dict(cls=cls, split=lab)
            cells = []
            for nm, col in (("p75", "r1"), ("p90", "r2")):
                mm = (m & (RR_[col] >= 0)).to_numpy(); n, d = share(RR_, mm, (RR_[col] == 1).astype(float)); p, lo, hi = ratio_ci(n, d)
                row[f"{nm}_exceed"] = float(p); cells.append(f"{p:.1%} [{lo:.1%}, {hi:.1%}]")
            for nm, (a, b, impl) in IMPL.items():
                mm = (m & (RR_[f"r{a}"] == 1) & (RR_[f"r{b}"] >= 0)).to_numpy(); n, d = share(RR_, mm, (RR_[f"r{b}"] == 1).astype(float)); p, lo, hi = ratio_ci(n, d)
                row[nm] = float(p); row[nm + "_n"] = int(mm.sum()); row[nm + "_lo"] = float(lo); row[nm + "_hi"] = float(hi)
                cells.append(f"{p:.1%} [{lo:.1%}, {hi:.1%}]" + ("" if mm.sum() >= 200 else " (n<200)"))
            say(f"| {cls} | {lab} | " + " | ".join(cells) + f" | {row['p75→p90_n']:,} |")
            out.append(row)
    return out


say("\n## Q4 reach odds on jump days (test period)\n\nThe reach table is **calibrated** on a split if the realised share is within ±5pp of implied (LINE_TOUCH_REACH's rule, n ≥ 200).")
RES["q4_bns"] = reach_block(RR, "By BNS jump day (end-of-day flag — descriptive)", "bns", [(0, "no jump day"), (1, "jump day")])
RES["q4_rt"] = reach_block(RR, "By a jump already today at the redraw (real time)", "jbefore", [(0, "none yet"), (1, "jump so far")])
RES["q4_last"] = reach_block(RR, "By a jump in the last hour before the redraw", "jlast", [(0, "no"), (1, "yes")])

# jump-state adjustment: train share by (class, jbefore) for p75→p90, scored on test by log-loss
say("\n### Would a jump-state adjustment fix the p75→p90 odds?\n")
HRfull = pd.read_parquet(O / "hours.parquet"); HRfull["cls"] = CLS[HRfull.inst.to_numpy()]
spl = np.where(HRfull.cls == "fx_gold", splits["split_fx_gold"], splits["split_indices"])
HTr = HRfull[HRfull.date < spl].assign(hg=0, bns=0, regime=0)
adj = {}
RTr = reach_rows(HTr)
for cls in ("fx_gold", "indices"):
    for jb in (0, 1):
        m = (RTr.cls == cls) & (RTr.jbefore == jb) & (RTr.r1 == 1) & (RTr.r2 >= 0)
        adj[(cls, jb)] = float((RTr.loc[m, "r2"] == 1).mean())
say("Train-period realised p75→p90 share (in-sample context): " + ", ".join(f"{c}/jump={j}: {v:.1%}" for (c, j), v in adj.items()))
m = (RR.r1 == 1) & (RR.r2 >= 0)
sub = RR[m].copy(); y = (sub.r2 == 1).to_numpy(float)
p0 = np.full(len(sub), .40); p1 = np.array([adj[(c, int(j))] for c, j in zip(sub.cls, sub.jbefore)])
ll = lambda p: -(y * np.log(p) + (1 - y) * np.log(1 - p))
dl = ll(p1) - ll(p0)
num = np.bincount(di(sub), weights=dl, minlength=D); den = np.bincount(di(sub), minlength=D).astype(float)
pt, lo, hi = ratio_ci(num, den)
say(f"Log-loss change per row on test, state-conditional vs flat 40%: {pt:+.5f} [{lo:+.5f}, {hi:+.5f}] (negative = better).")
RES["q4_adjust"] = dict(train_shares={f"{c}|{j}": v for (c, j), v in adj.items()}, dlogloss=float(pt), lo=float(lo), hi=float(hi))

# variant 6: adjustment keyed on a jump in the LAST HOUR
adj6 = {}
for cls in ("fx_gold", "indices"):
    for jb in (0, 1):
        m = (RTr.cls == cls) & (RTr.jlast == jb) & (RTr.r1 == 1) & (RTr.r2 >= 0)
        adj6[(cls, jb)] = float((RTr.loc[m, "r2"] == 1).mean())
p6 = np.array([adj6[(c, int(j))] for c, j in zip(sub.cls, sub.jlast)])
dl6 = ll(p6) - ll(p0)
n6 = np.bincount(di(sub), weights=dl6, minlength=D)
pt6, lo6, hi6 = ratio_ci(n6, den)
say("\nVariant 6 - keyed on a jump in the last hour: train p75->p90 share " + ", ".join(f"{c}/jump={j}: {v:.1%}" for (c, j), v in adj6.items()))
say(f"Log-loss change per row on test: {pt6:+.5f} [{lo6:+.5f}, {hi6:+.5f}] (negative = better).")
RES["q4_adjust6"] = dict(train_shares={f"{c}|{j}": v for (c, j), v in adj6.items()}, dlogloss=float(pt6), lo=float(lo6), hi=float(hi6))

# ================================================================ Q5 line shifts
say("\n## Q5 how the lines move at each redraw (test period)\n")
HRs, S = shifts(HR)
say("Re-estimate shift = change in a line's offset from the running extreme vs the previous hour (σ). Medians of |shift|, by hour group and class; "
    "then after a big move in the last hour (a 5-minute return ≥ 0.5σ).\n")
say("| class | hours | rung | median abs shift | p90 abs shift | after a last-hour jump: median | p90 |"); say("|---|---|---|---|---|---|---|")
q5 = []
for cls in ("fx_gold", "indices"):
    for g in range(3):
        for r in range(3):
            v = pd.concat([S.loc[(S.cls == cls) & (S.hg == g), f"dU{r}"], S.loc[(S.cls == cls) & (S.hg == g), f"dD{r}"]]).abs()
            vj = pd.concat([S.loc[(S.cls == cls) & (S.hg == g) & (S.jlast == 1), f"dU{r}"], S.loc[(S.cls == cls) & (S.hg == g) & (S.jlast == 1), f"dD{r}"]]).abs()
            v = v.dropna(); vj = vj.dropna()
            q5.append(dict(cls=cls, hours=HGN[g], rung=RN[r], med=float(v.median()), p90=float(v.quantile(.9)), jump_med=float(vj.median()) if len(vj) else None, jump_n=len(vj)))
            say(f"| {cls} | {HGN[g]} | {RN[r]} | {v.median():.3f} | {v.quantile(.9):.3f} | {vj.median() if len(vj) else float('nan'):.3f} | {vj.quantile(.9) if len(vj) else float('nan'):.3f} |")
RES["q5_shift"] = q5
# does a big shift predict anything? reach by bucket
thr = {c: float(S.loc[S.cls == c, "dU1"].abs().dropna().quantile(.9)) for c in ("fx_gold", "indices")}
say("\nBig p75 shift = top decile of |shift| in the class. Does it predict reach? (shares over rows where the line was drawn)\n")
say("| class | bucket | rows | p75 exceed (25%) | p75→p90 (40%) |"); say("|---|---|---|---|---|")
S2 = S.merge(HR[["inst", "date", "h", "rU1", "rU2", "rD1", "rD2"]], on=["inst", "date", "h"])
q5b = []
for cls in ("fx_gold", "indices"):
    t = thr[cls]
    for bname, f in (("widened (top-decile push-out)", lambda d: d >= t), ("narrowed (top-decile pull-in)", lambda d: d <= -t), ("small", lambda d: d.abs() < t)):
        n_ex = d_ex = n_t = d_t = 0; num_ex = np.zeros(D); den_ex = np.zeros(D); num_t = np.zeros(D); den_t = np.zeros(D)
        for tag in "UD":
            sub = S2[(S2.cls == cls)]
            bm = f(sub[f"d{tag}1"]).to_numpy() & sub[f"d{tag}1"].notna().to_numpy()
            r1 = sub[f"r{tag}1"].to_numpy(); r2 = sub[f"r{tag}2"].to_numpy(); d_ = di(sub)
            mm = bm & (r1 >= 0); num_ex += np.bincount(d_[mm], weights=(r1[mm] == 1), minlength=D); den_ex += np.bincount(d_[mm], minlength=D)
            mm = bm & (r1 == 1) & (r2 >= 0); num_t += np.bincount(d_[mm], weights=(r2[mm] == 1), minlength=D); den_t += np.bincount(d_[mm], minlength=D)
        p, lo, hi = ratio_ci(num_ex, den_ex); p2, lo2, hi2 = ratio_ci(num_t, den_t)
        q5b.append(dict(cls=cls, bucket=bname, rows=int(den_ex.sum()), exceed=float(p), lo=float(lo), hi=float(hi), reach=float(p2), lo2=float(lo2), hi2=float(hi2), n2=int(den_t.sum())))
        say(f"| {cls} | {bname} | {int(den_ex.sum()):,} | {p:.1%} [{lo:.1%}, {hi:.1%}] | {p2:.1%} [{lo2:.1%}, {hi2:.1%}] (n {int(den_t.sum()):,}) |")
RES["q5_predict"] = q5b

# ================================================================ Q6 costs
say("\n## Q6 costs\n")
from pylego.costs import default_spread  # noqa: E402
cost_rows = []
for i, n in enumerate(names):
    c = pd.read_csv(f"analysis/output/forecast_history/{n}.csv", usecols=["date", "open", "pit_sig_daily", "oos"])
    c = c[c.oos == 1]
    unit = float((c.open * c.pit_sig_daily / 100).median())
    cost_rows.append(dict(inst=n, cls=cls_of(n), spread_over_sigma=default_spread(n if n != "SPX500" else "SPX500") / unit))
CR = pd.DataFrame(cost_rows)
say("Default spread ÷ 1σ-daily by class (the execution-feasibility proxy; > 0.15 = dead):\n")
say("| class | median | max | instruments > 0.15 |"); say("|---|---|---|---|")
for cls, g in CR.groupby("cls"):
    say(f"| {cls} | {g.spread_over_sigma.median():.3f} | {g.spread_over_sigma.max():.3f} | {(g.spread_over_sigma > .15).sum()} of {len(g)} |")
RES["costs"] = CR.to_dict("records")
if R1["dynamics"] == 0:
    say("\nNo after-touch dynamic passed, so no trade is scored: there is no gross edge to net costs from. "
        "(Any edge would also have to beat the spread above on every trade.)")
else:
    say("\nDynamic cells (variant 1), traded in the direction of the diff (continue if +, fade if -): gross edge sigma per touch = |diff| x the cell mean (a + b), net of the median spread. "
        "These cells were picked on the same test data from 255 examined, so they are selection-biased upward.\n")
    for t in sorted(R1["dyn"], key=lambda t: -abs(t["diff"])):
        cn = CR.spread_over_sigma.median()
        say(f"- {t['label']} {t['cell']}: {t['diff']*100:+.1f}pp x {t['ab']:.2f}sigma = {abs(t['diff'])*t['ab']:.3f} gross; spread {cn:.3f} -> net {abs(t['diff'])*t['ab'] - cn:+.3f} per touch (n {t['n_real']:,})")

# ================================================================ Variant 4 shipped (all-data) params
say("\n## Variant 4 — shipped (all-data, D1-σ-basis) params vs refit, same test period\n")
say("| class | params | p75 exceed (25%) | p90 exceed (10%) | p75→p90 (40%) | p50→p75 (50%) |"); say("|---|---|---|---|---|---|")
v4 = []
for cls in ("fx_gold", "indices"):
    for nm, R_ in (("refit on first 60%", RR), ("shipped", RS)):
        m = R_.cls == cls
        row = dict(cls=cls, params=nm)
        for k, (col, cond) in {"p75": ("r1", None), "p90": ("r2", None)}.items():
            mm = (m & (R_[col] >= 0)).to_numpy(); n, d = share(R_, mm, (R_[col] == 1).astype(float)); row[k] = float(n.sum() / d.sum())
        for k, (a, b) in {"p75→p90": (1, 2), "p50→p75": (0, 1)}.items():
            mm = (m & (R_[f"r{a}"] == 1) & (R_[f"r{b}"] >= 0)).to_numpy(); n, d = share(R_, mm, (R_[f"r{b}"] == 1).astype(float)); row[k] = float(n.sum() / d.sum())
        v4.append(row)
        say(f"| {cls} | {nm} | {row['p75']:.1%} | {row['p90']:.1%} | {row['p75→p90']:.1%} | {row['p50→p75']:.1%} |")
RES["variant4"] = v4

(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote results")
