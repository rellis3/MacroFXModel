"""LIVE-RANGE-BOOK (forge/LIVE_RANGE_BOOK_PREREG.md): Fade/Continue Book on the hourly-moving lines + trend-day state.

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_book
Reads analysis/output/live_range_history/{hours,ev_real}.parquet (train + test), writes analysis/output/live_range_book/.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.run_live_range_history_build import cls_of, meta  # noqa: E402

I = Path("analysis/output/live_range_history")
O = Path("analysis/output/live_range_book"); O.mkdir(parents=True, exist_ok=True)
MIN_N = 300
RN = ["p50", "p75", "p90"]
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


names = json.loads((I / "names.json").read_text()); names = [names[str(i)] for i in range(len(names))]
splits = json.loads((I / "splits.json").read_text())
CLS = np.array([cls_of(n) for n in names])
M = pd.concat([meta(n).assign(inst=i) for i, n in enumerate(names)], ignore_index=True)
M["date"] = pd.to_datetime(M.date).map(pd.Timestamp.toordinal).astype(np.int32)
M["regime"] = np.select([M.regime_ratio < 0.85, M.regime_ratio > 1.15], [0, 2], 1)
M.loc[M.regime_ratio.isna(), "regime"] = -1
M = M.set_index(["inst", "date"])

# per-instrument spread / 1 sigma-daily (execution proxy, as in the history study)
from pylego.costs import default_spread  # noqa: E402
SP = np.zeros(len(names))
for i, n in enumerate(names):
    c = pd.read_csv(f"analysis/output/forecast_history/{n}.csv", usecols=["open", "pit_sig_daily", "oos"])
    c = c[c.oos == 1]
    SP[i] = default_spread(n) / float((c.open * c.pit_sig_daily / 100).median())


def prep(df):
    df = df.copy()
    df["cls"] = CLS[df.inst.to_numpy()]
    spl = np.where(df.cls == "fx_gold", splits["split_fx_gold"], splits["split_indices"])
    df["test"] = (df.date >= spl).astype(int)
    j = M.reindex(pd.MultiIndex.from_arrays([df.inst, df.date]))
    df["regime"] = j.regime.to_numpy()
    df["sp"] = SP[df.inst.to_numpy()]
    return df


HR = prep(pd.read_parquet(I / "hours.parquet"))
ER = prep(pd.read_parquet(I / "ev_real.parquet"))
tdates = np.sort(HR.loc[HR.test == 1, "date"].unique()); D = len(tdates)
HALF = tdates[D // 2]
W = boot_weights(D)
tidx = lambda d: np.searchsorted(tdates, d)

say("# LIVE-RANGE-BOOK — results\n\nPre-registration: `forge/LIVE_RANGE_BOOK_PREREG.md`. Train = first 60% of dates (selection), "
    f"test = last 40% ({D} dates).\n")


def boot_mean(vals, dates, mask):
    """mean of vals over mask with date-block 95% interval (test dates only)."""
    v = np.asarray(vals, float)[mask]; d = tidx(np.asarray(dates)[mask])
    num = np.bincount(d, weights=v, minlength=D); den = np.bincount(d, minlength=D).astype(float)
    p = num.sum() / den.sum()
    with np.errstate(all="ignore"):
        r = (W @ num) / (W @ den)
    return p, np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


# ================================================================ Part A
E = ER[(ER.pre == 0) & ER.code.isin([1, 2])].copy()
E["y"] = (E.code == 1).astype(float)
nraw = len(ER)
say(f"Part A universe: {len(E):,} resolved first-touches of {nraw:,} ({len(ER)-len(E):,} dropped: pre-resolved, both-in-bar or unresolved).\n")
E["sd"] = E.side.astype(int); E["rung"] = E.rung.astype(int)
E["hg"] = np.where(E.h <= 7, 0, np.where(E.h <= 14, 1, 2))
tm = E.tmin / 60.0
E["ses"] = np.select([tm < 7, tm < 12, tm < 16], [0, 1, 2], 3)
E["cellu"] = E.cell.astype(int)
E["rtj"] = E.rtjump.astype(int); E["reg"] = E.regime.astype(int)
# touch number: 1 + distinct earlier hours with a same-side event that session
hh = E[["inst", "date", "sd", "h"]].drop_duplicates().sort_values(["inst", "date", "sd", "h"])
hh["rank"] = hh.groupby(["inst", "date", "sd"]).cumcount() + 1
E = E.merge(hh, on=["inst", "date", "sd", "h"], how="left")
E["tn"] = np.minimum(E["rank"], 3)
# a/b geometry tercile per rung from TRAIN
ab = (E.a / E.b)
E["abt"] = 0
for r in range(3):
    q = np.quantile(ab[(E.rung == r) & (E.test == 0)], [1 / 3, 2 / 3])
    E.loc[E.rung == r, "abt"] = np.digitize(ab[E.rung == r], q)
# line-shift bucket at the redraw (p75 re-estimate of the same side vs previous hour; top-decile of |shift| on train)
Hs = HR.sort_values(["inst", "date", "h"]).reset_index(drop=True)
g = Hs.groupby(["inst", "date"])
Hs["dU1"] = Hs.offU1 - g.offU1.shift(1); Hs["dD1"] = Hs.offD1 - g.offD1.shift(1)
thr = {c: float(Hs.loc[(Hs.cls == c) & (Hs.test == 0), "dU1"].abs().dropna().quantile(.9)) for c in ("fx_gold", "indices")}
E = E.merge(Hs[["inst", "date", "h", "dU1", "dD1"]], on=["inst", "date", "h"], how="left")
d_ = np.where(E.sd > 0, E.dU1, E.dD1); t_ = E.cls.map(thr).to_numpy()
E["shift"] = np.where(np.isnan(d_), -1, np.where(d_ >= t_, 2, np.where(d_ <= -t_, 0, 1)))
E["half"] = (E.date >= HALF).astype(int)
# R per trade (sigma pnl / risk), net of spread
cost = E.sp
E["R_cont"] = np.where(E.y == 1, E.a, -E.b) / E.b - cost / E.b
E["R_fade"] = np.where(E.y == 0, E.b, -E.a) / E.a - cost / E.a

cols = {"hg": "session 3-way", "ses": "session 4-way (Asia/London/overlap/NY)", "tn": "touch number today", "cellu": "used×pace cell",
        "abt": "a÷b geometry tercile", "reg": "regime", "rtj": "jump earlier today", "shift": "big line shift", "sd": "side"}


def cells(E):
    out = []
    for c, nm in cols.items():
        for hg_ in (None, "hg"):
            if hg_ and c in ("hg", "ses"):
                continue
            keys = ["cls", "rung", c] + ([hg_] if hg_ else [])
            for k, grp in E.groupby(keys):
                out.append((nm + (" × hours" if hg_ else ""), keys, k))
    base = ["cls", "rung"]
    for k, grp in E.groupby(base):
        out.append(("rung × class (pooled)", base, k))
    return out


rows = []
Etr = E[E.test == 0]; Ete = E[E.test == 1]
for nm, keys, k in cells(E):
    k = k if isinstance(k, tuple) else (k,)
    mtr = np.ones(len(Etr), bool); mte = np.ones(len(Ete), bool)
    for c, v in zip(keys, k):
        mtr &= (Etr[c] == v).to_numpy(); mte &= (Ete[c] == v).to_numpy()
    if mtr.sum() < MIN_N or mte.sum() < 100:
        continue
    for strat, col in (("continue", "R_cont"), ("fade", "R_fade")):
        mu_tr = Etr[col].to_numpy()[mtr].mean()
        row = dict(split=nm, cell=dict(zip(keys, [int(x) if not isinstance(x, str) else x for x in k])), strat=strat,
                   n_train=int(mtr.sum()), n_test=int(mte.sum()), train=float(mu_tr), selected=bool(mu_tr > 0))
        p, lo, hi = boot_mean(Ete[col], Ete.date, mte)
        h1 = Ete[col].to_numpy()[mte & (Ete.half == 0).to_numpy()]; h2 = Ete[col].to_numpy()[mte & (Ete.half == 1).to_numpy()]
        row.update(test=float(p), lo=float(lo), hi=float(hi), half1=float(h1.mean()) if len(h1) else np.nan, half2=float(h2.mean()) if len(h2) else np.nan)
        row["pass"] = bool(row["selected"] and lo > 0 and row["half1"] > 0 and row["half2"] > 0)
        rows.append(row)
A = pd.DataFrame(rows)
sel = A[A.selected]
say("## Part A — Book trade on moving lines (R per trade, net of spread)\n")
say("Pooled by class × rung, test period (continue = target next line out / stop back; fade = target back / stop out):\n")
say("| class | rung | n test | continue R [95%] | fade R [95%] | mean spread (σ) |"); say("|---|---|---|---|---|---|")
pooled = []
for cls in ("fx_gold", "indices"):
    for r in range(3):
        m = ((Ete.cls == cls) & (Ete.rung == r)).to_numpy()
        pc = boot_mean(Ete.R_cont, Ete.date, m); pf = boot_mean(Ete.R_fade, Ete.date, m)
        pooled.append(dict(cls=cls, rung=RN[r], n=int(m.sum()), cont=pc, fade=pf))
        say(f"| {cls} | {RN[r]} | {int(m.sum()):,} | {pc[0]:+.3f} [{pc[1]:+.3f}, {pc[2]:+.3f}] | {pf[0]:+.3f} [{pf[1]:+.3f}, {pf[2]:+.3f}] | {Ete.sp.to_numpy()[m].mean():.3f} |")
RES["A_pooled"] = pooled
npass = int(A["pass"].sum()); nsel = int(len(sel))
say(f"\nCells × strategies examined: **{len(A)}**; selected on train (net R > 0, n ≥ {MIN_N}): **{nsel}**; passing on test "
    f"(CI wholly > 0 and both halves > 0): **{npass}** ({npass / max(nsel, 1):.1%} of selected; chance rate ≈ 5%).")
verdictA = "TRADEABLE" if npass >= 1 and npass / max(nsel, 1) > .05 else "NO BETTER THAN THE STATIC-LINE BOOK"
say(f"Verdict A: **{verdictA}**.\n")
say("Share of selected cells whose TEST net R is also > 0 (selection holds out of sample): "
    f"{(sel.test > 0).mean():.1%}; mean test R of selected cells {sel.test.mean():+.3f} (train {sel.train.mean():+.3f}).\n")
if npass:
    say("| split | cell | strat | n test | train R | test R [95%] | halves |"); say("|---|---|---|---|---|---|---|")
    for _, r in A[A["pass"]].sort_values("test", ascending=False).iterrows():
        say(f"| {r.split} | {r.cell} | {r.strat} | {r.n_test:,} | {r.train:+.3f} | {r.test:+.3f} [{r.lo:+.3f}, {r.hi:+.3f}] | {r.half1:+.3f} / {r.half2:+.3f} |")
say("\nBest 8 selected cells by train R (what a train-time pick would have chosen) and how they did on test:\n")
say("| split | cell | strat | n test | train R | test R [95%] |"); say("|---|---|---|---|---|---|")
for _, r in sel.sort_values("train", ascending=False).head(8).iterrows():
    say(f"| {r.split} | {r.cell} | {r.strat} | {r.n_test:,} | {r.train:+.3f} | {r.test:+.3f} [{r.lo:+.3f}, {r.hi:+.3f}] |")
RES["A"] = dict(examined=len(A), selected=nsel, passed=npass, verdict=verdictA, cells=A.to_dict("records"))

# ================================================================ Part B
say("\n## Part B — trend-day state from the line path\n")
e0 = ER[(ER.rung == 0)][["inst", "date", "h", "side"]].drop_duplicates()
tU = e0[e0.side > 0][["inst", "date", "h"]].assign(tU=1); tD = e0[e0.side < 0][["inst", "date", "h"]].assign(tD=1)
Bf = HR[["inst", "date", "h"]].merge(tU, on=["inst", "date", "h"], how="left").merge(tD, on=["inst", "date", "h"], how="left").fillna(0)
Bf = Bf.sort_values(["inst", "date", "h"]).reset_index(drop=True)
gF = Bf.groupby(["inst", "date"])
Bf["cumD_prev"] = gF.tD.cumsum() - Bf.tD; Bf["cumU_prev"] = gF.tU.cumsum() - Bf.tU
for k in (2, 3):
    ok_u = np.ones(len(Bf), bool); ok_d = np.ones(len(Bf), bool)
    for l in range(1, k + 1):
        ok_u &= gF.tU.shift(l).fillna(0).to_numpy() == 1; ok_d &= gF.tD.shift(l).fillna(0).to_numpy() == 1
    Bf[f"up{k}"] = ok_u & (Bf.cumD_prev == 0); Bf[f"dn{k}"] = ok_d & (Bf.cumU_prev == 0)
Bq = HR[["inst", "date", "h", "cls", "test", "cH", "cF", "sp"]].merge(Bf[["inst", "date", "h", "up2", "dn2", "up3", "dn3"]], on=["inst", "date", "h"])
Bq["fwd"] = Bq.cF - Bq.cH
Bq = Bq[(Bq.h >= 8) & (Bq.h <= 18)].copy(); Bq["hg"] = np.where(Bq.h <= 12, 0, 1)
Bq["mu"] = Bq.groupby(["cls", "test", "h"]).fwd.transform("mean")
HGN2 = ["08-12", "13-18"]
rowsB = []
say("Signed forward outcome (final 22:00 close − close at checkpoint, in σ, in the state's direction) minus the same-hour all-days drift; "
    "spread = round-trip cost in σ. Test unless stated.\n")
say("| variant | class | hours | state rows | dates | train excess | test excess [95%] | spread | verdict |"); say("|---|---|---|---|---|---|---|---|---|")
for vname, k in (("B1 (2 h)", 2), ("B2 (3 h)", 3)):
    for cls in ("fx_gold", "indices"):
        for hg_ in (0, 1):
            ex = {}
            for te in (0, 1):
                parts = []
                for dirn, col in ((1, f"up{k}"), (-1, f"dn{k}")):
                    m = (Bq.cls == cls) & (Bq.hg == hg_) & (Bq.test == te) & Bq[col]
                    parts.append(pd.DataFrame({"x": dirn * (Bq.fwd[m] - Bq.mu[m]), "date": Bq.date[m], "sp": Bq.sp[m]}))
                ex[te] = pd.concat(parts)
            n = len(ex[1])
            if n < 100 or len(ex[0]) < 100:
                continue
            p, lo, hi = boot_mean(ex[1].x, ex[1].date, np.ones(n, bool))
            tr = ex[0].x.mean(); sp = ex[1].sp.mean()
            cont = lo > sp and tr > sp
            fade = hi < -sp and tr < -sp
            v = "CONTINUE edge" if cont else "FADE edge" if fade else "inside noise / below cost"
            rowsB.append(dict(variant=vname, cls=cls, hours=HGN2[hg_], n=n, dates=int(ex[1].date.nunique()), train=float(tr), test=float(p), lo=float(lo), hi=float(hi), sp=float(sp), verdict=v))
            say(f"| {vname} | {cls} | {HGN2[hg_]} | {n:,} | {ex[1].date.nunique():,} | {tr:+.3f} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] | {sp:.3f} | {v} |")
RES["B"] = rowsB
nb = sum(r["verdict"] != "inside noise / below cost" for r in rowsB)
say(f"\nTrend-state cells examined: {len(rowsB)}; with an edge net of spread: **{nb}**.")

(O / "results.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
