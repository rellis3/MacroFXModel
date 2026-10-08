"""LIVE-RANGE-SHADOW part 2 (forge/LIVE_RANGE_SHADOW_PREREG.md): line state on the rich-IV break.

    PYTHONIOENCODING=utf-8 python -m forge.run_live_range_shadow_p2
"""
from __future__ import annotations

import bisect
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

sys.path.insert(0, "scripts/forecast_history")
from forecast_record import boot_weights  # noqa: E402

from forge.bars import load_m1
from forge.live_range_conf import load_sessions_v
from forge.live_range_replay import H, m1_key, m1_root, offsets_from_frame_fit, replay
from forge.run_live_range_history_build import cls_of

RB = Path("../MacroFXModel-rangebook/analysis/output/rangebook")
O = Path("analysis/output/live_range_shadow"); O.mkdir(parents=True, exist_ok=True)
CV = {"audusd": "AUDUSD", "eurusd": "EURUSD", "gbpusd": "GBPUSD", "usdcad": "USDCAD", "usdchf": "USDCHF", "usdjpy": "USDJPY", "gold": "XAUUSD"}
NAME = {"audusd": "AUDUSD", "eurusd": "EURUSD", "gbpusd": "GBPUSD", "usdcad": "USDCAD", "usdchf": "USDCHF", "usdjpy": "USDJPY", "gold": "GOLD"}
CELLS = [("0.1", "r5"), ("0.1", "r10"), ("0.2", "r5"), ("0.2", "r10")]
LOG, RES = [], {}


def say(s=""):
    print(s, flush=True); LOG.append(s)


# ---------------- rich-day flag exactly as break_ivrv_test.py
def rv20(dates, px):
    lr = np.diff(np.log(np.asarray(px, float))); out = {}
    for i in range(21, len(dates)):
        v = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if v > 0:
            out[dates[i]] = v
    return out


def before(sd, m, date):
    i = bisect.bisect_left(sd, date) - 1
    return m.get(sd[i]) if i >= 0 else None


cvd = json.load(open("js/data/cmeCvolEod.json"))["series"]
cvol = {}
for p, k in CV.items():
    rows = cvd[k]; d = [r["date"] for r in rows]; rv = rv20(d, [r["underlying"] or np.nan for r in rows])
    m = {d[i]: rows[i]["cvol"] / rv[d[i]] for i in range(len(d)) if d[i] in rv}; cvol[p] = (sorted(m), m)

trades = []
for p in CV:
    for t in json.load(open(RB / f"{p}_asym.json"))["rows"]:
        if t["type"] != "BREAK":
            continue
        R = [t["s" + s][tg]["R"] for s, tg in CELLS if t.get("s" + s) and t["s" + s].get(tg)]
        if len(R) != 4:
            continue
        trades.append(dict(inst=p, date=t["date"], line=t["line"], k=t["k"], mn=t["min"], dir=t["dir"], entry=t["entry"], R=R,
                           risk1=t["s0.1"]["risk"], risk2=t["s0.2"]["risk"], cost1=t["s0.1"]["costR"], cost2=t["s0.2"]["costR"],
                           cv=before(*cvol[p], t["date"])))
D = pd.DataFrame(trades)
D[["c1", "c2", "c3", "c4"]] = pd.DataFrame(D.R.tolist(), index=D.index); D["Rm"] = D[["c1", "c2", "c3", "c4"]].mean(axis=1)
e_cv = np.nanpercentile(D.loc[D.date < "2023-01-01", "cv"].dropna(), [100 / 3, 200 / 3])
D["rich"] = D.cv >= e_cv[1]
all_rich = D[D.rich]
say("# LIVE-RANGE-SHADOW — Part 2: line state on the rich-IV break\n\nPre-registration: `forge/LIVE_RANGE_SHADOW_PREREG.md`. Primary = the existing rich-IV break trades "
    f"(7 CVOL instruments, rich = CVOL÷RV20 top third, edge {e_cv[1]:.3f} from 2016-22). All years 2016-26: {len(all_rich):,} rich trades, mean net R {all_rich.Rm.mean():+.3f} "
    f"(published +0.118R).\n")

# ---------------- line state from the moving-line replay (walk-forward grids)
F = pd.read_parquet("analysis/output/live_range_wf/frame.parquet"); F["cls"] = F.inst.map(cls_of)
fits = {c: {} for c in ("fx_gold", "indices")}
for q in pd.date_range("2018-04-01", "2026-07-01", freq="QS"):
    fits["fx_gold"][q.toordinal()] = offsets_from_frame_fit(F[F.cls == "fx_gold"], q.toordinal())
qs = np.array(sorted(fits["fx_gold"]))
feat = []
M1 = {}
for p in CV:
    nm = NAME[p]
    S = load_sessions_v(nm)
    csv = pd.read_csv(H / f"{nm}.csv", usecols=["date", "open", "pit_sig_daily", "pit_sig_used"]).set_index("date")
    m1 = load_m1(m1_key(nm), m1_root(m1_key(nm))).tz_convert("Europe/London"); M1[p] = m1
    sub = all_rich[(all_rich.inst == p) & (all_rich.date >= "2018-04-01")]
    for i, t in sub.iterrows():
        if t.date not in S or t.date not in csv.index:
            continue
        hrs, o, h_, l_, c_, v_ = S[t.date]
        unit = csv.loc[t.date, "pit_sig_daily"] / 100 * o[0]
        unit_book = csv.loc[t.date, "pit_sig_used"] / 100 * o[0]
        ts = pd.Timestamp(t.date + " 00:00", tz="Europe/London") + pd.Timedelta(minutes=int(t.mn))
        dayb = m1.loc[t.date + " 00:00": t.date + " 23:59"]
        j = dayb.index.searchsorted(ts)
        if j >= len(dayb):
            continue
        e = float(dayb.open.iloc[j])
        do = pd.Timestamp(t.date).toordinal()
        P = fits["fx_gold"][qs[np.searchsorted(qs, do, side="right") - 1]]
        HT, _ = replay(hrs, o, h_, l_, c_, unit, *P, 1.0)
        hh = int(t.mn // 60)
        row = HT[hh - 1] if 1 <= hh <= 21 else None
        if row is None or not row[1] == 1:
            continue
        runH = o[0] + row[7] * unit; runL = o[0] + row[8] * unit
        up = [runH + row[9 + q] * unit for q in range(3)]; dn = [runL - row[12 + q] * unit for q in range(3)]
        lines = up if t.dir > 0 else dn
        room = [(L - e) / unit if t.dir > 0 else (e - L) / unit for L in lines]
        feat.append(dict(idx=i, entry_px=e, unit_book=unit_book, ebar=int(j), hour=hh, used=row[3], speed=row[4], room50=room[0], room75=room[1], room90=room[2],
                         dist_ext=((runH - e) if t.dir > 0 else (e - runL)) / unit, unit=unit, up75=up[1], dn75=dn[1], up90=up[2], dn90=dn[2], up50=up[0], dn50=dn[0]))
Fm = pd.DataFrame(feat).set_index("idx")
T = all_rich.join(Fm, how="inner")
T["line_rung"] = T.line.str.extract(r"p(\d+)").astype(float)
T["year"] = T.date.str[:4].astype(int)
say(f"Rich trades from 2018-04 with a moving-line state at the signal hour (signal after 01:00 London): **{len(T):,}** of {int(((all_rich.date >= '2018-04-01')).sum()):,}; "
    f"mean net R {T.Rm.mean():+.3f}.\n")
dts = np.sort(T.date.unique()); Dn = len(dts); W = boot_weights(Dn); T["di"] = np.searchsorted(dts, T.date.to_numpy())
half = dts[Dn // 2]; T["half"] = (T.date >= half).astype(int)


def ci_mean(mask, col="Rm", df=None):
    df = T if df is None else df
    v = df[col].to_numpy()[mask]; d = df.di.to_numpy()[mask]
    num = np.bincount(d, weights=v, minlength=Dn); den = np.bincount(d, minlength=Dn).astype(float)
    with np.errstate(all="ignore"):
        r = (W @ num) / (W @ den)
    return num.sum() / den.sum(), np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


def diff_ci(m1, m0, col="Rm"):
    v = T[col].to_numpy(); d = T.di.to_numpy()
    n1, d1 = np.bincount(d[m1], weights=v[m1], minlength=Dn), np.bincount(d[m1], minlength=Dn).astype(float)
    n0, d0 = np.bincount(d[m0], weights=v[m0], minlength=Dn), np.bincount(d[m0], minlength=Dn).astype(float)
    with np.errstate(all="ignore"):
        r = (W @ n1) / (W @ d1) - (W @ n0) / (W @ d0)
    return n1.sum() / d1.sum() - n0.sum() / d0.sum(), np.nanpercentile(r, 2.5), np.nanpercentile(r, 97.5)


# ---------------- P2a one pre-specified filter: room to the moving p75
lo_e, hi_e = np.quantile(T.loc[T.half == 0, "room75"], [1 / 3, 2 / 3])
top = (T.room75 >= hi_e).to_numpy(); bot = (T.room75 <= lo_e).to_numpy(); mid = ~top & ~bot
say("## P2a — room to the moving p75 line at entry (σ), terciles from the first half of dates\n")
say(f"Edges: {lo_e:.2f}σ / {hi_e:.2f}σ.\n")
say("| group | trades | mean net R [95%] | first half | second half |"); say("|---|---|---|---|---|")
for nm, m in (("most room (top third)", top), ("middle", mid), ("least room (bottom third)", bot), ("all rich trades", np.ones(len(T), bool))):
    p, lo, hi = ci_mean(m)
    h0 = T.Rm[m & (T.half == 0).to_numpy()].mean(); h1 = T.Rm[m & (T.half == 1).to_numpy()].mean()
    say(f"| {nm} | {int(m.sum()):,} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] | {h0:+.3f} | {h1:+.3f} |")
dp, dlo, dhi = diff_ci(top, bot)
hd = [T.Rm[top & (T.half == k).to_numpy()].mean() - T.Rm[bot & (T.half == k).to_numpy()].mean() for k in (0, 1)]
okA = bool(dlo > 0 and hd[0] > 0 and hd[1] > 0)
say(f"\nMost room minus least room: **{dp:+.3f}R** [{dlo:+.3f}, {dhi:+.3f}], halves {hd[0]:+.3f} / {hd[1]:+.3f} → **{'IMPROVES' if okA else 'no improvement'}** the primary.\n")
RES["p2a"] = dict(diff=float(dp), lo=float(dlo), hi=float(dhi), halves=[float(x) for x in hd], improves=okA)
say("Other single cuts (descriptive; each is one more look): hour of day and range used.\n")
say("| cut | group | trades | mean net R [95%] |"); say("|---|---|---|---|")
for nm, col, edges in (("hour", "hour", [5, 8]), ("range used", "used", list(np.quantile(T.used, [1 / 3, 2 / 3])))):
    b = np.digitize(T[col], edges)
    for k in range(3):
        m = (b == k)
        if m.sum() >= 100:
            p, lo, hi = ci_mean(m)
            say(f"| {nm} | {['low','mid','high'][k]} (edges {', '.join(f'{x:.1f}' for x in edges)}) | {int(m.sum()):,} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] |")

# ---------------- P2b meta-label: yearly refit from 2020 on prior rich trades
FEATS = ["hour", "used", "speed", "room50", "room75", "room90", "dist_ext", "line_rung", "dir", "cv"]
take = np.full(len(T), np.nan); pred = np.full(len(T), np.nan)
for y in range(2020, 2027):
    tr = T[T.year < y]; te = T.year == y
    if len(tr) < 300 or te.sum() == 0:
        continue
    m = HistGradientBoostingRegressor(max_iter=60, max_depth=3, learning_rate=0.05, min_samples_leaf=40, random_state=0).fit(tr[FEATS].to_numpy(), tr.Rm.to_numpy())
    pred[te.to_numpy()] = m.predict(T.loc[te, FEATS].to_numpy())
ok = np.isfinite(pred); S2 = T[ok]
tk = (pred[ok] > 0)
say("\n## P2b — meta-label: gradient-boosted regression of net R on the line state, refit each year on prior rich trades, trading from 2020\n")
say(f"Scored trades 2020+: {len(S2):,}; model says take {tk.mean():.0%}.\n")
say("| set | trades | mean net R [95%] |"); say("|---|---|---|")
Tk = T.copy(); Tk["tk"] = False; Tk.loc[T.index[ok], "tk"] = tk
sc = np.zeros(len(T), bool); sc[ok] = True
for nm, m in (("all scored", sc), ("taken", sc & Tk.tk.to_numpy()), ("skipped", sc & ~Tk.tk.to_numpy())):
    p, lo, hi = ci_mean(m)
    say(f"| {nm} | {int(m.sum()):,} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] |")
dp2, dlo2, dhi2 = diff_ci(sc & Tk.tk.to_numpy(), sc)
hd2 = [T.Rm[sc & Tk.tk.to_numpy() & (T.half == k).to_numpy()].mean() - T.Rm[sc & (T.half == k).to_numpy()].mean() for k in (0, 1)]
okB = bool(dlo2 > 0 and tk.mean() >= 0.4 and all(x > 0 for x in hd2))
say(f"\nTaken minus all: **{dp2:+.3f}R** [{dlo2:+.3f}, {dhi2:+.3f}], halves {hd2[0]:+.3f} / {hd2[1]:+.3f}, keeps {tk.mean():.0%} → **{'IMPROVES' if okB else 'no improvement'}**.\n")
RES["p2b"] = dict(diff=float(dp2), lo=float(dlo2), hi=float(dhi2), keep=float(tk.mean()), improves=okB)

# ---------------- P2c exits at the moving lines, simulated on M1
say("## P2c — exit at the moving p75 / p90 line instead of 5R / 10R (same entries and stops, M1 simulation)\n")


def sim(t, target_px, risk_sig, cost_R):
    m1 = M1[t.inst]
    day = m1.loc[t.date + " 00:00": t.date + " 23:59"].iloc[int(t.ebar):]                # the book's day end = last bar of the London calendar day
    if len(day) == 0:
        return np.nan, "none"
    e = t.entry_px; rpx = risk_sig * t.unit_book; stop = e - t.dir * rpx
    hi = day.high.to_numpy(); lo = day.low.to_numpy()
    if t.dir > 0:
        hs = np.flatnonzero(lo <= stop); ht = np.flatnonzero(hi >= target_px) if target_px is not None else np.array([], int)
    else:
        hs = np.flatnonzero(hi >= stop); ht = np.flatnonzero(lo <= target_px) if target_px is not None else np.array([], int)
    fs = hs[0] if len(hs) else 10 ** 9; ft = ht[0] if len(ht) else 10 ** 9
    if fs == 10 ** 9 and ft == 10 ** 9:
        px = day.close.iloc[-1]; return (t.dir * (px - e) / rpx) - cost_R, "close"
    if fs <= ft:
        return -1.0 - cost_R, "stop"
    return (t.dir * (target_px - e) / rpx) - cost_R, "target"


# validation: reproduce the stored 5R / 10R outcomes on a sample
chk = []
for _, t in T.sample(min(300, len(T)), random_state=0).iterrows():
    for sg, rk, ck, cell5, cell10 in (("0.1", t.risk1, t.cost1, t.c1, t.c2), ("0.2", t.risk2, t.cost2, t.c3, t.c4)):
        for mult, stored in ((5, cell5), (10, cell10)):
            tp = t.entry_px + t.dir * mult * rk * t.unit_book
            r, _ = sim(t, tp, rk, ck)
            chk.append(abs(r - stored) < 0.05)
say(f"Simulation check: reproduces the stored 5R / 10R net R (±0.05) on {np.mean(chk):.1%} of {len(chk)} cells.\n")
VALID = np.mean(chk) >= 0.90
rows = []
for _, t in (T.iterrows() if VALID else []):
    out = {"idx": t.name}
    for sg, rk, ck in (("0.1", t.risk1, t.cost1), ("0.2", t.risk2, t.cost2)):
        for nm, px in (("p75", t.up75 if t.dir > 0 else t.dn75), ("p90", t.up90 if t.dir > 0 else t.dn90)):
            ok_ = (px > t.entry_px) if t.dir > 0 else (px < t.entry_px)
            r, _ = sim(t, px if ok_ else None, rk, ck)
            out[f"{nm}_{sg}"] = r
    rows.append(out)
if not VALID:
    say("Simulation not validated (< 90% reproduction): P2c NOT run.")
    RES["p2c"] = None; RES["p2c_check"] = float(np.mean(chk)); (O / "results_p2.json").write_text(json.dumps(RES, indent=1, default=str)); (O / "RESULTS_p2.md").write_text(chr(10).join(LOG), encoding="utf-8"); print("wrote"); sys.exit(0)
X = pd.DataFrame(rows).set_index("idx")
T = T.join(X)
say("| exit | mean net R [95%] | vs 5R/10R cells mean (same trades) |"); say("|---|---|---|")
base = T.Rm.mean()
exits = {}
for nm in ("p75", "p90"):
    col = T[[f"{nm}_0.1", f"{nm}_0.2"]].mean(axis=1)
    T[f"E_{nm}"] = col
    p, lo, hi = ci_mean(np.ones(len(T), bool), col=f"E_{nm}")
    d, dl, dh = diff_ci(np.ones(len(T), bool), np.zeros(len(T), bool), col=f"E_{nm}") if False else (None, None, None)
    # difference of means vs the stored cells, date-block
    T["_d"] = T[f"E_{nm}"] - T.Rm
    dd, dlo_, dhi_ = ci_mean(np.ones(len(T), bool), col="_d")
    exits[nm] = dict(mean=float(p), lo=float(lo), hi=float(hi), vs=float(dd), vlo=float(dlo_), vhi=float(dhi_))
    say(f"| target at moving {nm} | {p:+.3f} [{lo:+.3f}, {hi:+.3f}] | {dd:+.3f} [{dlo_:+.3f}, {dhi_:+.3f}] (stored cells {base:+.3f}) |")
okC = any(v["vlo"] > 0 for v in exits.values())
say(f"\nExit at the moving line beats the stored 5R / 10R: **{'YES' if okC else 'no'}**.\n")
RES["p2c"] = exits
RES["p2c_check"] = float(np.mean(chk))
RES["baseline_2018"] = float(T.Rm.mean()); RES["n"] = len(T)
(O / "results_p2.json").write_text(json.dumps(RES, indent=1, default=str))
(O / "RESULTS_p2.md").write_text("\n".join(LOG), encoding="utf-8")
print("wrote")
