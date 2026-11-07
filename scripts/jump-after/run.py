"""jump-after (forge/JUMP_AFTER_PREREG.md): after-jump path, stop-through and intensity.

    python scripts/jump-after/run.py --stage build     # detector on all instruments; audit counts only, no outcomes
    python scripts/jump-after/run.py --stage analyse   # scored cells, RESULTS.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history"), str(ROOT / "scripts/vol-layer")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import jumps as JP  # noqa: E402
import line_reaction as LR  # noqa: E402
from forecast_record import klass  # noqa: E402
from forge import jump_lm as J  # noqa: E402
from forge import vol_state_hist as S  # noqa: E402
from reaction import slot_panel  # noqa: E402

OUT = ROOT / "analysis/output/jump-after"
HIST = ROOT / "analysis/output/forecast_history"
BA = ROOT / "data/m1_bidask"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
HORIZONS = {"m5": 1, "m15": 3, "m30": 6, "m60": 12, "m240": 48}
HALF = "2021-08-20"
ALLOWED = {"USD", "EUR", "GBP"}


def spread_panel(sym, dates):
    """Sessions x slots: last ask_c minus bid_c in each slot. NaN before bid/ask history starts."""
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time", "bid_c", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"], utc=True)).tz_convert("Europe/London")
    mins = (idx.hour * 60 + idx.minute).to_numpy()
    pos = pd.Series(np.arange(len(dates)), index=dates)
    di = pos.reindex(idx.strftime("%Y-%m-%d")).to_numpy()
    keep = (mins < 22 * 60) & np.isfinite(di)
    d, s = di[keep].astype(int), mins[keep] // 5
    sp = (df["ask_c"] - df["bid_c"]).to_numpy(float)[keep]
    o = np.argsort(idx.asi8[keep], kind="stable")
    P = np.full((len(dates), J.N_SLOT), np.nan)
    P[d[o], s[o]] = sp[o]
    return P


def build_one(sym, ccy, rel_by_day, cal_end):
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "live_sig_used", "live_sig_daily", "event", "rv5", "bv5", "max_r5", "gap", "jump_share"]).sort_values("date").reset_index(drop=True)
    C, _, _ = slot_panel(sym, d.date.tolist())
    Sp = spread_panel(sym, d.date.tolist())
    D = J.detect(C)
    F = pd.DataFrame(C).ffill(axis=1).to_numpy()              # exits only: the last known close at the horizon
    sig = d.live_sig_used.to_numpy() / 100
    crit = D["crit"]
    first = J.first_flags(D["flag"])
    rows = []

    def rec(i, s, kind):
        sign = np.sign(D["r"][i, s])
        out = {"inst": sym, "date": d.date[i], "slot": int(s), "kind": kind, "sign": int(sign), "L": float(D["L"][i, s]), "size": float(abs(D["r"][i, s]) / sig[i]),
               "hour": int(s * 5 // 60), "spread0": float(Sp[i, s] / F[i, s]) if np.isfinite(Sp[i, s]) else np.nan}
        for name, h in HORIZONS.items():
            e = s + h
            if e < J.N_SLOT and np.isfinite(F[i, e]):
                out[name] = float(sign * np.log(F[i, e] / F[i, s]) / sig[i])
                out[f"sp_{name}"] = float(Sp[i, e] / F[i, e]) if np.isfinite(Sp[i, e]) else np.nan
            else:
                out[name], out[f"sp_{name}"] = np.nan, np.nan
        return out

    fl_sched = np.full(len(d), np.nan)
    for i in range(len(d)):
        s = first[i]
        if s >= 0:
            rows.append(rec(i, s, "flag"))
            if d.date[i] <= cal_end:
                st = s * 5
                fl_sched[i] = 0.0
                if d.date[i] in rel_by_day.groups:
                    g = rel_by_day.get_group(d.date[i])
                    g = g[g.ccy.isin(ccy)]
                    fl_sched[i] = float(((st >= g.minute - 5) & (st <= g.minute + 15)).any())
            rows[-1]["sched"] = fl_sched[i]
        L = np.abs(D["L"][i])
        lim = s if s >= 0 else J.N_SLOT
        cand = np.flatnonzero((L[:lim] >= 3) & (L[:lim] < crit))
        if cand.size:
            rows.append(rec(i, int(cand[0]), "control"))
            rows[-1]["sched"] = np.nan
    ev = pd.DataFrame(rows)
    # session frame: outcomes for Q2/Q3 and pre-open features
    flag_today = (first >= 0).astype(float)
    flag_today[~np.isfinite(D["L"]).any(axis=1)] = np.nan
    un = np.where(fl_sched == 0, 1.0, 0.0)
    sc = np.where(fl_sched == 1, 1.0, 0.0)
    un[np.isnan(flag_today)] = np.nan
    sc[np.isnan(flag_today)] = np.nan
    sd = d.live_sig_daily
    big = np.maximum(d.max_r5.abs().to_numpy(), d.gap.abs().fillna(0).to_numpy()) / d.live_sig_used.to_numpy()
    sess = pd.DataFrame({"inst": sym, "date": d.date, "event": d.event, "flag": flag_today, "big": big,
                         "lam_un": S.ewma_before(un, 20), "lam_sch": S.ewma_before(sc, 20),
                         "flag_last": pd.Series(flag_today).shift(1).to_numpy(),
                         "js20": d.jump_share.rolling(20, min_periods=10).mean().shift(1).to_numpy(),
                         "regime": np.log(sd / sd.shift(1).rolling(250, min_periods=120).median()).to_numpy()})
    return ev, sess


def stage_build():
    OUT.mkdir(parents=True, exist_ok=True)
    syms = sorted(p.stem for p in HIST.glob("*.csv"))
    syms = [s for s in syms if (BA / f"{BA_KEY.get(s, s.lower())}_m1.parquet").exists()]
    ccy = JP.currencies(syms)
    rel = JP.releases()
    by = rel.groupby("date")
    cal_end = rel.date.max()
    evs, ss = [], []
    for s in syms:
        e, x = build_one(s, ccy[s], by, cal_end)
        evs.append(e)
        ss.append(x)
        fl = e[e.kind == "flag"]
        print(f"{s}: {len(fl)} flags, {x.flag.mean() * 252:.1f}/yr, scheduled {fl.sched.mean():.2f}", flush=True)
    E, X = pd.concat(evs, ignore_index=True), pd.concat(ss, ignore_index=True)
    E.to_parquet(OUT / "events.parquet", index=False)
    X.to_parquet(OUT / "sessions.parquet", index=False)
    cov = sorted(i for i, c in ccy.items() if set(c) <= ALLOWED)
    fl = E[E.kind == "flag"].assign(klass=lambda d: d.inst.map(klass))
    audit = {"flags": int(len(fl)), "instruments": len(syms), "covered": cov, "flags_covered": int(fl.inst.isin(cov).sum()),
             "sched_share_covered": float(fl[fl.inst.isin(cov)].sched.mean()), "by_class": fl.groupby("klass").size().to_dict(),
             "by_hour": fl.groupby("hour").size().to_dict(), "flags_per_instrument_year": float(X.groupby("inst").flag.mean().mean() * 252), "crit": J.threshold()}
    (OUT / "audit.json").write_text(json.dumps(audit, indent=1, default=str))
    print(json.dumps(audit, indent=1, default=str))


def weights(a, r):
    ka = (a.inst + a.hour.astype(str)).to_numpy()
    kr = (r.inst + r.hour.astype(str)).to_numpy()
    return (pd.Series(kr).value_counts() / pd.Series(ka).value_counts()).reindex(ka).fillna(0.0).to_numpy()


def path_cell(bs, F, C, h):
    f, c = F[F[h].notna()], C[C[h].notna()]
    w = weights(c, f)
    k = w > 0
    c, w = c[k], w[k]
    fy = f[h].to_numpy()
    est, reps = bs.mean(f.date, fy)
    c_n, c_d = bs.sums(c.date, c[h].to_numpy() * w), bs.sums(c.date, w)
    f_n, f_d = bs.sums(f.date, fy), bs.sums(f.date, np.ones(len(f)))
    drep = (bs.W @ f_n) / (bs.W @ f_d) - (bs.W @ c_n) / (bs.W @ c_d)
    res = {"n": int(len(f)), "mean": est[0], "lo": est[1], "hi": est[2], "p_two": float(2 * min((reps <= 0).mean(), (reps >= 0).mean())),
           "control": round(float(c_n.sum() / c_d.sum()), 4), "vs_control": round(float(f_n.sum() / f_d.sum() - c_n.sum() / c_d.sum()), 4),
           "vs_lo": round(float(np.percentile(drep, 2.5)), 4), "vs_hi": round(float(np.percentile(drep, 97.5)), 4)}
    for nm, part in (("A", f[f.date <= HALF]), ("B", f[f.date > HALF])):
        res[f"half_{nm}"] = round(float(part[h].mean()), 4) if len(part) else None
    cost = f["cost_" + h].to_numpy()
    k2 = np.isfinite(cost)
    for nm, sign in (("follow", 1.0), ("fade", -1.0)):
        ci = bs.mean(f.date[k2], sign * fy[k2] - cost[k2])[0]
        res[f"{nm}_net"] = ci
    res["mean_cost"] = round(float(np.nanmean(cost)), 4)
    res["n_net"] = int(k2.sum())
    return res


def logit_cell(X, target_col, feats, bench, start_year=2019):
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    out = []
    years = sorted(int(y) for y in X.date.str[:4].unique() if int(y) >= start_year)
    for y in years:
        tr, te = X[X.date < f"{y}-01-01"], X[X.date.str[:4] == str(y)]
        tr, te = tr.dropna(subset=bench + feats + [target_col]), te.dropna(subset=bench + feats + [target_col])
        if len(tr) < 2000 or not len(te):
            continue
        m0 = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(tr[bench], tr[target_col])
        m1 = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(tr[bench + feats], tr[target_col])
        o = te[["date", target_col]].copy()
        o["p0"], o["p1"] = m0.predict_proba(te[bench])[:, 1], m1.predict_proba(te[bench + feats])[:, 1]
        out.append(o)
    return pd.concat(out, ignore_index=True)


def skill(bs, T, y):
    a, b = (T.p1 - T[y]) ** 2, (T.p0 - T[y]) ** 2
    ci, reps = bs.ratio(T.date, a.to_numpy(), T.date, b.to_numpy())
    gain = 1 - np.asarray(reps)
    return {"n": int(len(T)), "base": round(float(T[y].mean()), 4), "gain": round(1 - float(a.sum() / b.sum()), 5), "lo": round(float(np.percentile(gain, 2.5)), 5),
            "hi": round(float(np.percentile(gain, 97.5)), 5), "p": float((gain <= 0).mean())}


def holm(cells, key="p"):
    order = sorted(cells, key=lambda k: cells[k][key])
    prev = 0.0
    for i, k in enumerate(order):
        prev = max(prev, min(1.0, cells[k][key] * (len(order) - i)))
        cells[k]["p_holm"] = round(prev, 4)


def stage_analyse():
    E = pd.read_parquet(OUT / "events.parquet")
    X = pd.read_parquet(OUT / "sessions.parquet")
    audit = json.loads((OUT / "audit.json").read_text())
    cov = audit["covered"]
    bs = LR.Boot(X.date)
    E["klass"] = E.inst.map(klass)
    # cost: half the spread at each end, as a price fraction, then in daily σ units
    sig = {}
    for s in E.inst.unique():
        d = pd.read_csv(HIST / f"{s}.csv", usecols=["date", "live_sig_used"])
        sig[s] = d.set_index("date").live_sig_used / 100
    E["sg"] = [sig[i].get(d, np.nan) for i, d in zip(E.inst, E.date)]
    for h in HORIZONS:
        E[f"cost_{h}"] = 0.5 * (E[f"sp_{h}"] + E.spread0) / E.sg
    F, C = E[E.kind == "flag"], E[E.kind == "control"]
    res = {"id": "jump-after", "seed": 20261107, "B": 2000, "ranAt": pd.Timestamp.now("UTC").isoformat(), "prereg": "forge/JUMP_AFTER_PREREG.md", "audit": audit, "path": {}, "stop_through": {}, "intensity": {}, "descriptive": {}}
    Fc = F[F.inst.isin(cov)]
    cells = {"unscheduled": Fc[Fc.sched == 0], "scheduled": Fc[Fc.sched == 1], "all_34": F}
    Cc = C[C.inst.isin(cov)]
    for k, d in cells.items():
        res["path"][k] = path_cell(bs, d, C if k == "all_34" else Cc, "m60")
    holm(res["path"], "p_two")
    # descriptive: horizons, sign and class
    for k, d in cells.items():
        res["descriptive"][k] = {h: path_cell(bs, d, C if k == "all_34" else Cc, h) for h in HORIZONS if h != "m60"}
    res["descriptive"]["by_sign_m60"] = {("up" if s > 0 else "down"): {k: path_cell(bs, d[d.sign == s], C if k == "all_34" else Cc, "m60") for k, d in cells.items()} for s in (1, -1)}
    res["descriptive"]["by_class_m60"] = {c: path_cell(bs, g, C[C.klass == c], "m60") for c, g in F.groupby("klass")}

    X = X[X.event.ne("unknown")].copy()
    X["klass"] = X.inst.map(klass)
    for c in sorted(X.klass.unique()):
        X[f"c_{c}"] = (X.klass == c).astype(float)
    for t in ("FOMC", "NFP", "CPI", "high"):
        X[f"e_{t}"] = (X.event == t).astype(float)
    X["monday"] = (pd.to_datetime(X.date).dt.dayofweek == 0).astype(float)
    bench = [c for c in X.columns if c.startswith(("c_", "e_"))] + ["monday", "regime"]
    feats = ["lam_un", "lam_sch", "flag_last", "js20"]
    for d in (0.25, 0.5, 1.0):
        X["y"] = (X.big >= d).astype(float)
        res["stop_through"][f"d{d}"] = skill(bs, logit_cell(X, "y", feats, bench), "y")
    holm(res["stop_through"])
    res["intensity"]["flag_today"] = skill(bs, logit_cell(X, "flag", feats, bench), "flag")
    holm(res["intensity"])

    v = {}
    pc = res["path"]
    ok = []
    ctx = []
    for k, c in pc.items():
        same = c["half_A"] is not None and c["half_B"] is not None and np.sign(c["half_A"]) == np.sign(c["half_B"]) == np.sign(c["mean"])
        if c["p_holm"] < 0.05 and same:
            ctx.append(k)
            d = "follow_net" if c["mean"] > 0 else "fade_net"
            if (c["vs_lo"] > 0 or c["vs_hi"] < 0) and c[d][1] > 0:
                ok.append(k)
    v["jump-after-path"] = "VALIDATED" if ok else ("CONTEXT" if ctx else "NULL")
    for name, fam in (("jump-after-stop-through", res["stop_through"]), ("jump-after-intensity", res["intensity"])):
        val = [k for k, c in fam.items() if c["lo"] > 0 and c["gain"] >= 0.005 and c["p_holm"] < 0.05]
        sig_ = [k for k, c in fam.items() if c["p_holm"] < 0.05]
        v[name] = "VALIDATED" if val else ("CONTEXT" if sig_ else "NULL")
    res["verdicts"] = v
    res["path_scheduled_half_width"] = round((pc["scheduled"]["hi"] - pc["scheduled"]["lo"]) / 2, 4)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    write_md(res)


def _ci(x):
    return f"{x[0]:+.3f} [{x[1]:+.3f}, {x[2]:+.3f}]"


def write_md(r):
    a = r["audit"]
    md = ["# jump-after: results", "", f"Prereg: `forge/JUMP_AFTER_PREREG.md`. Run 2026-11-07, seed {r['seed']}, B = {r['B']}.", "",
          "## Verdicts", ""] + [f"- `{k}`: **{v}**" for k, v in r["verdicts"].items()] + ["",
          f"Detector: {a['flags']:,} first flags on {a['instruments']} instruments, {a['flags_per_instrument_year']:.1f} per instrument-year; {a['flags_covered']:,} on covered instruments, {a['sched_share_covered']:.0%} scheduled. Critical value {a['crit']:.3f}.", "",
          "## After-jump path, signed 60-minute return, daily σ", "", "| cell | n | mean [95%] | control | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |", "|---|---|---|---|---|---|---|---|---|---|"]
    for k, c in r["path"].items():
        md.append(f"| {k} | {c['n']:,} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['control']:+.4f} | {c['vs_control']:+.4f} [{c['vs_lo']:+.4f}, {c['vs_hi']:+.4f}] | {c['half_A']:+.4f} / {c['half_B']:+.4f} | {c['p_holm']:.3f} | {_ci(c['follow_net'])} | {_ci(c['fade_net'])} | {c['mean_cost']:.3f} |")
    md += ["", "## Other horizons (descriptive)", "", "| cell | horizon | mean [95%] | vs control |", "|---|---|---|---|"]
    for k in ("unscheduled", "scheduled", "all_34"):
        for h, c in r["descriptive"][k].items():
            md.append(f"| {k} | {h} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['vs_control']:+.4f} |")
    md += ["", "## By sign and class, 60 minutes (descriptive)", "", "| group | n | mean [95%] | vs control |", "|---|---|---|---|"]
    for s, g in r["descriptive"]["by_sign_m60"].items():
        for k, c in g.items():
            md.append(f"| {s} {k} | {c['n']:,} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['vs_control']:+.4f} |")
    for k, c in r["descriptive"]["by_class_m60"].items():
        md.append(f"| {k} | {c['n']:,} | {c['mean']:+.4f} [{c['lo']:+.4f}, {c['hi']:+.4f}] | {c['vs_control']:+.4f} |")
    md += ["", "## Stop-through: Brier gain over σ, calendar, Monday and class", "", "| cell | n | base rate | gain [95%] | Holm p |", "|---|---|---|---|---|"]
    for k, c in {**r["stop_through"], **r["intensity"]}.items():
        md.append(f"| {k} | {c['n']:,} | {c['base']:.3f} | {c['gain']:+.5f} [{c['lo']:+.5f}, {c['hi']:+.5f}] | {c['p_holm']:.3f} |")
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["build", "analyse"], required=True)
    a = ap.parse_args()
    {"build": stage_build, "analyse": stage_analyse}[a.stage]()
