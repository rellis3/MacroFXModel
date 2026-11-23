"""futures-oc-tp-fade (forge/FUTURES_OC_TP_FADE_PREREG.md, A1): fade OH/OL p75 / p90 on the QLIKE per-line futures
ladder, take profit at the best OC p50 (OC model chosen on QLIKE walk-forward). NQ / GC / 6E / 6J, 2020 -> 2026-08-21.

    python scripts/futures-oc-tp-fade/score.py  -> analysis/output/futures-oc-tp-fade/{results.json, report.txt, trades.parquet}
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/exhaustion-v2"))
import ladder as L  # noqa: E402
import touches as TO  # noqa: E402

_sp = importlib.util.spec_from_file_location("S", ROOT / "scripts/ladder-qlike-per-line/score.py")
S = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(S)

SEED, B, BLOCK = 20261122, 2000, 63
OUT = ROOT / "analysis/output/futures-oc-tp-fade"
SYMS = ("NQ", "GOLD", "EURUSD", "USDJPY")
SPEC = {"NQ": (0.25, 20), "GOLD": (0.10, 100), "EURUSD": (0.00005, 125_000), "USDJPY": (0.0000005, 12_500_000)}
COMM = 5.0
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def soc_pick(T, arms):
    """Per test year: the arm with the lowest OC QLIKE over 2019..Y-1 (walk-forward scale as the per-line study)."""
    old = S.LINES
    S.LINES = ("oc",)
    Q, ok = S.qlike_rows(T, arms)
    S.LINES = old
    yrs = T["year"].to_numpy()
    sel = np.full(len(T), None)
    picks = {}
    for Y in S.TEST:
        tr, te = (yrs >= 2019) & (yrs < Y) & ok, yrs == Y
        if te.any() and tr.any():
            a = min(arms, key=lambda x: float(np.nanmean(Q[(x, "oc")][tr])))
            sel[te] = a; picks[Y] = a
    return sel, picks


def costs(sym, price):
    """(tick, commission) in the series' price units at this price (6J: series is USD/JPY, contract is JPY/USD)."""
    tick_raw, mult = SPEC[sym]
    raw = 1 / price if L.SYMS[sym]["invert"] else price
    rel_tick, rel_comm = tick_raw / raw, COMM / (mult * raw)
    return rel_tick * price, rel_comm * price


def simulate(g, up, Lv, stop, tp, tick, comm, shift=0.0):
    """One fade. g: session M1 (open/high/low/close). Returns dict or None (no touch / no fill)."""
    hi, lo, cl, op = g["high"].to_numpy(), g["low"].to_numpy(), g["close"].to_numpy(), g["open"].to_numpy()
    hit = np.flatnonzero(hi >= Lv) if up else np.flatnonzero(lo <= Lv)
    if not len(hit):
        return None
    t0 = int(hit[0])
    f = np.flatnonzero((hi[t0:] >= Lv + tick) if up else (lo[t0:] <= Lv - tick))
    if not len(f):
        return None
    k = t0 + int(f[0])
    sgn = -1.0 if up else 1.0                       # shift toward the open: down after an up-fade
    h, l, c, o_ = hi[k + 1:] + sgn * shift, lo[k + 1:] + sgn * shift, cl[k + 1:] + sgn * shift, op[k + 1:] + sgn * shift
    R = abs(Lv - stop)
    how, ex = "time", (cl[k] if not len(c) else c[-1])
    for j in range(len(h)):
        s_hit = h[j] >= stop if up else l[j] <= stop
        t_hit = l[j] <= tp if up else h[j] >= tp
        if s_hit:
            how, ex = "sl", (max(stop, o_[j]) if up else min(stop, o_[j])); break
        if t_hit:
            how, ex = "tp", (min(tp, o_[j]) if up else max(tp, o_[j])); break
    gross = ((Lv - ex) if up else (ex - Lv)) / R
    slip = tick if how in ("sl", "time") else 0.0
    net = gross - (slip + comm) / R
    return {"bar": k, "how": how, "gross": gross, "net": net, "s": R, "d": abs(Lv - tp)}


def run(TC, cell, shift_sig=0.0, placebo=None):
    rows = []
    for sym, c in TC.items():
        T, sel, soc = c["T"], c["sel"], c["soc"]
        for i in np.flatnonzero(c["keep"]):
            r = T.iloc[i]
            g = c["frames"].get(r["date"])
            if g is None or len(g) < 600:
                continue
            o = float(g["open"].iloc[0])
            lt = g.index.tz_convert("Europe/London")
            mins = np.asarray(lt.hour * 60 + lt.minute)
            for up, q in ((True, "oh"), (False, "ol")):
                arm = sel["QL"][q][i]; oca = soc[i]
                if arm is None or oca is None:
                    continue
                sig = float(T[arm].iloc[i])
                p75, p90 = float(T[f"{arm}_{q}_75"].iloc[i]), float(T[f"{arm}_{q}_90"].iloc[i])
                oc50 = float(T[f"{oca}_oc_50"].iloc[i])
                if cell == "p75":
                    pe, ps = p75, p90 + 0.05 * sig
                else:
                    pe, ps = p90, p90 + (p90 - p75)
                side = 1 if up else -1
                Lv, stop, tp = o * (1 + side * pe / 100), o * (1 + side * ps / 100), o * (1 + side * oc50 / 100)
                if not (min(o, Lv) < tp < max(o, Lv)):
                    rows.append({"sym": sym, "date": r["date"], "year": int(r["year"]), "side": q, "skip": True})
                    continue
                if placebo is not None:
                    tp = Lv - side * placebo * abs(Lv - tp)
                tick, comm = costs(sym, Lv)
                res = simulate(g, up, Lv, stop, tp, tick, comm, shift=shift_sig * sig / 100 * o)
                if res is None:
                    continue
                res.update(sym=sym, date=r["date"], year=int(r["year"]), side=q, skip=False, arm=arm, oc_arm=oca,
                           bucket=int(np.searchsorted([420, 720, 960], mins[res["bar"]], side="right")))
                rows.append(res)
    return pd.DataFrame(rows)


def boot(D, TC, col, rng, years=None, barrier=False, bench=False):
    """Pooled mean of col over trades; 63-session blocks within each instrument (all its scored sessions)."""
    D = D[~D["skip"]]
    if years:
        D = D[(D["year"] >= years[0]) & (D["year"] <= years[1])]
    if barrier:
        D = D[D["how"].isin(["tp", "sl"])]
    v = ((D["how"] == "tp").astype(float) - D["s"] / (D["s"] + D["d"])) if bench else D[col]
    D = D.assign(v=v.to_numpy())
    tot_s, tot_n, draws_s, draws_n = 0.0, 0, np.zeros(B), np.zeros(B)
    for sym, c in TC.items():
        dates = c["T"]["date"][c["keep"]].to_numpy()
        if years:
            yy = c["T"]["year"][c["keep"]].to_numpy(); dates = dates[(yy >= years[0]) & (yy <= years[1])]
        x = D[D["sym"] == sym].groupby("date")["v"].agg(["sum", "count"]).reindex(dates, fill_value=0)
        s, n = x["sum"].to_numpy(), x["count"].to_numpy()
        tot_s += s.sum(); tot_n += n.sum()
        bi = S.blocks(len(s), rng)
        draws_s += s[bi].sum(1); draws_n += n[bi].sum(1)
    m = draws_s / np.maximum(draws_n, 1)
    return float(tot_s / max(tot_n, 1)), [float(np.quantile(m, .05)), float(np.quantile(m, .95))], int(tot_n)


def grade(v, pt, ci):
    if v == "VALIDATED":
        return "Strong"
    if ci[0] > 0:
        return "Leaning"
    if pt > 0:
        return "Faint"
    if ci[1] < 0.05:
        return "Against"
    return "Untested-properly"


def summarise(name, D, TC, rng):
    Dt = D[~D["skip"]]
    net = boot(D, TC, "net", rng)
    halves = {h: boot(D, TC, "net", rng, yr) for h, yr in HALVES.items()}
    gross = boot(D, TC, "gross", rng)
    bench = boot(D, TC, None, rng, barrier=True, bench=True)
    bt = Dt[Dt["how"].isin(["tp", "sl"])]
    tp_rate, bm = float((bt["how"] == "tp").mean() * 100), float((bt["s"] / (bt["s"] + bt["d"])).mean() * 100)
    val = net[1][0] > 0 and all(h[0] > 0 for h in halves.values()) and bench[1][0] > 0
    v = "VALIDATED" if val else ("NULL" if net[1][1] < 0.05 else "UNDERPOWERED")
    res = {"trades": int(len(Dt)), "skipped": int(D["skip"].sum()), "net": net, "halves": halves, "gross": gross,
           "tp_vs_bench": bench, "tp_rate_barrier": tp_rate, "bench_rate": bm,
           "exits": {k: float(v_) for k, v_ in (Dt["how"].value_counts(normalize=True) * 100).items()},
           "verdict": v, "grade": grade(v, net[0], net[1])}
    res["per_inst"] = {s: {"n": int(len(g)), "net": float(g["net"].mean()), "gross": float(g["gross"].mean()),
                           "tp%": float((g["how"] == "tp").mean() * 100)} for s, g in Dt.groupby("sym")}
    res["per_side"] = {s: {"n": int(len(g)), "net": float(g["net"].mean())} for s, g in Dt.groupby("side")}
    res["per_bucket"] = {["00-07", "07-12", "12-16", "16-22"][int(b)]: {"n": int(len(g)), "net": float(g["net"].mean()),
                                                                   "gross": float(g["gross"].mean())} for b, g in Dt.groupby("bucket")}
    say(f"\n== {name} ==")
    say(f"  trades {res['trades']} (skipped {res['skipped']}); exits " + ", ".join(f"{k} {v_:.1f}%" for k, v_ in res["exits"].items()))
    say(f"  net {net[0]:+.3f}R [{net[1][0]:+.3f}, {net[1][1]:+.3f}]; halves " + ", ".join(f"{h} {x[0]:+.3f}R" for h, x in halves.items())
        + f"; gross {gross[0]:+.3f}R [{gross[1][0]:+.3f}, {gross[1][1]:+.3f}]")
    say(f"  TP first (barrier trades) {tp_rate:.1f}% vs driftless {bm:.1f}%: diff {bench[0]*100:+.1f}pp [{bench[1][0]*100:+.1f}, {bench[1][1]*100:+.1f}]")
    say("  per instrument: " + "; ".join(f"{s} n{x['n']} net {x['net']:+.3f} gross {x['gross']:+.3f} TP {x['tp%']:.0f}%" for s, x in res["per_inst"].items()))
    say("  per side: " + "; ".join(f"{s} n{x['n']} net {x['net']:+.3f}" for s, x in res["per_side"].items()))
    say("  per London bucket: " + "; ".join(f"{b} n{x['n']} net {x['net']:+.3f} gross {x['gross']:+.3f}" for b, x in res["per_bucket"].items()))
    say(f"  -> {v} (weight: {res['grade']})")
    return res


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    TC = {}
    for sym in SYMS:
        c = S.prep(sym)
        c["soc"], c["soc_picks"] = soc_pick(c["T"], c["arms"])
        c["keep"] = c["keep"] & (c["T"]["date"] <= pd.Timestamp("2026-08-21")).to_numpy()
        m = L.load_m1(sym, "F", "unadj")
        c["frames"] = TO.session_frames(m, c["T"]["date"][c["keep"]])
        TC[sym] = c
        say(f"{sym}: {int(c['keep'].sum())} sessions; OC picks {c['soc_picks']}; QL picks 2026 "
            f"{ {q: c['picks'][2026]['QL_' + q] for q in ('oh', 'ol')} }")
    res = {"seed": SEED, "B": B, "block": BLOCK, "soc_picks": {s: c["soc_picks"] for s, c in TC.items()}}

    say("\n== positive controls ==")
    D75 = run(TC, "p75")
    pl = {f: run(TC, "p75", placebo=f) for f in (0.7, 1.3)}
    allb = pd.concat([D75] + list(pl.values()))
    allb = allb[~allb["skip"] & allb["how"].isin(["tp", "sl"])]
    mech = float((allb["how"] == "tp").mean() * 100 - (allb["s"] / (allb["s"] + allb["d"])).mean() * 100)
    say(f"  mechanics: TP-first minus driftless benchmark over real + placebo barrier trades {mech:+.2f}pp (|x| <= 3 to pass)")
    Dp = run(TC, "p75", shift_sig=0.25)
    pn = boot(Dp, TC, "net", rng)
    say(f"  planted 0.25 sigma toward the open: net {pn[0]:+.3f}R [{pn[1][0]:+.3f}, {pn[1][1]:+.3f}] (CI lower > 0 to pass)")
    pc_ok = abs(mech) <= 3 and pn[1][0] > 0
    res["pc"] = {"mechanics_pp": mech, "planted": pn, "pass": bool(pc_ok)}
    if not pc_ok:
        say("POSITIVE CONTROL FAILED, nothing scored")
    else:
        res["p75"] = summarise("p75 fade -> OC p50 TP (primary)", D75, TC, rng)
        for f, Dpl in pl.items():
            d = (D75[~D75["skip"]].set_index(["sym", "date", "side"])["net"]
                 - Dpl[~Dpl["skip"]].set_index(["sym", "date", "side"])["net"]).dropna()
            res["p75"][f"real_minus_placebo_{f}"] = float(d.mean())
            say(f"  real TP minus placebo TP at {f}x distance: {d.mean():+.3f}R per trade (n {len(d)})")
        D90 = run(TC, "p90")
        res["p90"] = summarise("p90 fade -> OC p50 TP", D90, TC, rng)
        pd.concat([D75.assign(cell="p75"), D90.assign(cell="p90")]).to_parquet(OUT / "trades.parquet")
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
