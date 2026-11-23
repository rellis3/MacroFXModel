"""futures-qlike-trades A-C (forge/FUTURES_QLIKE_TRADES_PREREG.md): on the QLIKE per-line futures lines,
A fade p75/p90 toward the session VWAP, B follow the p90 break, C the owner's 14-day VWAP sigma-band confluence.

    python scripts/futures-qlike-trades/score.py  -> analysis/output/futures-qlike-trades/{results_abc.json, report_abc.txt, trades_abc.parquet}
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
_sp = importlib.util.spec_from_file_location("F", ROOT / "scripts/futures-oc-tp-fade/score.py")
F = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(F)
S, L, TO = F.S, F.L, F.TO

SEED = 20261123
OUT = ROOT / "analysis/output/futures-qlike-trades"
HALVES = F.HALVES
LOG: list[str] = []
F.LOG = LOG


def say(s=""):
    F.say(s)


def frames_with_volume(sym, dates):
    m = L.load_m1(sym, "F", "unadj")
    raw = pd.read_parquet(L.m1_paths(sym, "F", "unadj"), columns=["timestamp", "volume"])
    raw.index = pd.to_datetime(raw.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    m["volume"] = raw["volume"][~raw.index.duplicated()].reindex(m.index).fillna(0).astype(float)
    return TO.session_frames(m, dates)


def vwap_arrays(g):
    hi, lo, cl, v = (g[c].to_numpy() for c in ("high", "low", "close", "volume"))
    tp = (hi + lo + cl) / 3
    cpv, cv = np.cumsum(tp * v), np.cumsum(v)
    run = np.where(cv > 0, cpv / np.maximum(cv, 1e-12), cl)          # VWAP including bar t
    before = np.r_[np.nan, run[:-1]]                                  # VWAP of bars before t
    return run, before


def sigma_v(frames):
    """Per session: mean of the prior 14 sessions' RMS of (close - running VWAP) / running VWAP."""
    rms = {}
    for d, g in sorted(frames.items()):
        if len(g) < 600:
            continue
        run, _ = vwap_arrays(g)
        rms[d] = float(np.sqrt(np.mean(((g["close"].to_numpy() - run) / run) ** 2)))
    s = pd.Series(rms).sort_index()
    return s.rolling(14, min_periods=14).mean().shift(1)


def follow(g, up, p90lv, stop, tick, comm, tp=None, shift=0.0):
    hi, lo, cl, op = g["high"].to_numpy(), g["low"].to_numpy(), g["close"].to_numpy(), g["open"].to_numpy()
    trig = p90lv + tick if up else p90lv - tick
    f = np.flatnonzero(hi >= trig) if up else np.flatnonzero(lo <= trig)
    if not len(f):
        return None
    k = int(f[0])
    e_g = trig                                         # gross: filled at the trigger
    e_n = trig + tick if up else trig - tick           # net: 1 tick slippage on the stop-entry
    sgn = 1.0 if up else -1.0                          # planted: shift away from the open
    h, l, c, o_ = hi[k + 1:] + sgn * shift, lo[k + 1:] + sgn * shift, cl[k + 1:] + sgn * shift, op[k + 1:] + sgn * shift
    R = abs(e_g - stop)
    how, ex = "time", (cl[k] if not len(c) else c[-1])
    for j in range(len(h)):
        if (l[j] <= stop) if up else (h[j] >= stop):
            how, ex = "sl", (min(stop, o_[j]) if up else max(stop, o_[j])); break
        if tp is not None and ((h[j] >= tp) if up else (l[j] <= tp)):
            how, ex = "tp", (max(tp, o_[j]) if up else min(tp, o_[j])); break
    gross = ((ex - e_g) if up else (e_g - ex)) / R
    slip_x = tick if how in ("sl", "time") else 0.0
    net = (((ex - e_n) if up else (e_n - ex)) - slip_x - comm) / R
    return {"bar": k, "how": how, "gross": gross, "net": net, "s": R, "d": np.nan if tp is None else abs(tp - e_g)}


def run(TC, part, cell="p75", shift_sig=0.0, tp_variant=False):
    rows = []
    for sym, c in TC.items():
        T, sel = c["T"], c["sel"]
        for i in np.flatnonzero(c["keep"]):
            r = T.iloc[i]
            g = c["frames"].get(r["date"])
            if g is None or len(g) < 600:
                continue
            o = float(g["open"].iloc[0])
            mins = np.asarray(g.index.tz_convert("Europe/London").hour * 60 + g.index.tz_convert("Europe/London").minute)
            _, vb = vwap_arrays(g)
            sv = c["sv"].get(r["date"], np.nan)
            for up, q in ((True, "oh"), (False, "ol")):
                arm = sel["QL"][q][i]
                if arm is None:
                    continue
                sig = float(T[arm].iloc[i])
                p75, p90 = float(T[f"{arm}_{q}_75"].iloc[i]), float(T[f"{arm}_{q}_90"].iloc[i])
                side = 1 if up else -1
                lv = lambda p: o * (1 + side * p / 100)
                tick, comm = F.costs(sym, lv(p90))
                base = {"sym": sym, "date": r["date"], "year": int(r["year"]), "side": q}
                if part == "B":
                    tp = lv(p90 + (p90 - p75)) if tp_variant else None
                    res = follow(g, up, lv(p90), lv(p75), tick, comm, tp=tp, shift=shift_sig * sig / 100 * o)
                    if res is None:
                        continue
                    res.update(base, skip=False, bucket=int(np.searchsorted([420, 720, 960], mins[res["bar"]], side="right")))
                    rows.append(res)
                    continue
                pe, ps = (p75, p90 + 0.05 * sig) if cell == "p75" else (p90, p90 + (p90 - p75))
                Lv, stop = lv(pe), lv(ps)
                hit = np.flatnonzero(g["high"].to_numpy() >= Lv) if up else np.flatnonzero(g["low"].to_numpy() <= Lv)
                if not len(hit) or hit[0] == 0:
                    continue
                vw = float(vb[hit[0]])
                if not ((vw < Lv) if up else (vw > Lv)):
                    rows.append({**base, "skip": True})
                    continue
                tick, comm = F.costs(sym, Lv)
                res = F.simulate(g, up, Lv, stop, vw, tick, comm, shift=shift_sig * sig / 100 * o)
                if res is None:
                    continue
                z = ((Lv - vw) if up else (vw - Lv)) / (sv * vw) if np.isfinite(sv) and sv > 0 else np.nan
                res.update(base, skip=False, z=z, bucket=int(np.searchsorted([420, 720, 960], mins[res["bar"]], side="right")),
                           min=int(mins[res["bar"]]), sigp=sig / 100 * o)
                rows.append(res)
    return pd.DataFrame(rows)


def tbench(D, nsim=300, seed=SEED):
    """A1: per trade, P(TP first | a barrier is hit) for a driftless walk over the time left to 22:00 London, minute
    variance = sigma^2 x the year's vol-clock share (exhaustion-v2-<sym>/clock_F.parquet)."""
    rng = np.random.default_rng(seed)
    clocks = {s: pd.read_parquet(ROOT / f"analysis/output/exhaustion-v2-{s.lower()}/clock_F.parquet") for s in D["sym"].unique()}
    out = np.full(len(D), np.nan)
    for j, r in enumerate(D.itertuples()):
        if r.skip or not np.isfinite(getattr(r, "min", np.nan)):
            continue
        ck = clocks[r.sym]
        col = r.year if r.year in ck.columns else ck.columns[-1]
        share = ck[col].to_numpy()
        m = np.arange(int(r.min) + 1, 1320)
        if not len(m):
            continue
        sd = r.sigp * np.sqrt(share[m // 5] / 5)
        X = np.cumsum(rng.standard_normal((nsim, len(m))) * sd, axis=1)       # adverse direction positive
        hs_any, ht_any = (X >= r.s).any(1), (X <= -r.d).any(1)
        hs = np.where(hs_any, np.argmax(X >= r.s, axis=1), 10**9)
        ht = np.where(ht_any, np.argmax(X <= -r.d, axis=1), 10**9)
        hit = hs_any | ht_any
        out[j] = float((ht[hit] < hs[hit]).mean()) if hit.any() else np.nan
    return out


def boot_diff(D, TC, mask, rng):
    """Mean net of D[mask] minus mean net of D[~mask], session blocks within instrument, same draws."""
    D = D[~D["skip"]].assign(m=mask[~D["skip"]].to_numpy() if hasattr(mask, "to_numpy") else mask)
    a_s = a_n = b_s = b_n = 0.0
    da_s, da_n, db_s, db_n = (np.zeros(F.B) for _ in range(4))
    for sym, c in TC.items():
        dates = c["T"]["date"][c["keep"]].to_numpy()
        X = D[D["sym"] == sym]
        for flag, acc in ((True, "a"), (False, "b")):
            x = X[X["m"] == flag].groupby("date")["net"].agg(["sum", "count"]).reindex(dates, fill_value=0)
            s, n = x["sum"].to_numpy(), x["count"].to_numpy()
            bi = S.blocks(len(s), np.random.default_rng(hash((sym, SEED)) % 2**32))   # same blocks for both groups
            if acc == "a":
                a_s += s.sum(); a_n += n.sum(); da_s += s[bi].sum(1); da_n += n[bi].sum(1)
            else:
                b_s += s.sum(); b_n += n.sum(); db_s += s[bi].sum(1); db_n += n[bi].sum(1)
    d = da_s / np.maximum(da_n, 1) - db_s / np.maximum(db_n, 1)
    return float(a_s / max(a_n, 1) - b_s / max(b_n, 1)), [float(np.quantile(d, .05)), float(np.quantile(d, .95))]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    TC = {}
    for sym in F.SYMS:
        c = S.prep(sym)
        c["keep"] = c["keep"] & (c["T"]["date"] <= pd.Timestamp("2026-08-21")).to_numpy()
        c["frames"] = frames_with_volume(sym, c["T"]["date"])
        c["sv"] = sigma_v(c["frames"])
        TC[sym] = c
        say(f"{sym}: {int(c['keep'].sum())} sessions; sigma_v median {np.nanmedian(c['sv'])*100:.3f}% of VWAP")
    res = {"seed": SEED}

    say("\n== controls ==")
    A75 = run(TC, "A", "p75")
    A75["pb"] = tbench(A75)
    bt = A75[~A75["skip"] & A75["how"].isin(["tp", "sl"])]
    mech = float((bt["how"] == "tp").mean() * 100 - bt["pb"].mean() * 100)
    pA = F.boot(run(TC, "A", "p75", shift_sig=0.25), TC, "net", rng)
    say(f"  A/C mechanics (A1 time-aware benchmark) {mech:+.2f}pp (|x| <= 3); planted A {pA[0]:+.3f}R [{pA[1][0]:+.3f}, {pA[1][1]:+.3f}]")
    okA, okB = abs(mech) <= 3 and pA[1][0] > 0, False          # B was scored in the first run (results_abc.json)
    res["pc"] = {"mech_pp_timeaware": mech, "planted_A": pA, "A_ok": bool(okA)}

    out = []
    if okA:
        res["A_p75"] = F.summarise("A: fade p75 -> session VWAP (primary)", A75, TC, rng)
        # A1: the rule's TP-vs-benchmark part uses the time-aware benchmark
        bar = A75["how"].isin(["tp", "sl"]).to_numpy()
        Ab = A75.assign(net=np.where(A75["how"] == "tp", 1.0, 0.0) - A75["pb"].to_numpy())
        Ab.loc[~bar & ~Ab["skip"], "skip"] = True
        tb = F.boot(Ab, TC, "net", rng)
        r = res["A_p75"]
        vA = ("VALIDATED" if r["net"][1][0] > 0 and all(h[0] > 0 for h in r["halves"].values()) and tb[1][0] > 0
              else ("NULL" if r["net"][1][1] < 0.05 else "UNDERPOWERED"))
        r.update(tp_vs_timebench=tb, timebench_rate=float(bt["pb"].mean() * 100), verdict=vA, grade=F.grade(vA, r["net"][0], r["net"][1]))
        say(f"  A1 time-aware: TP first {r['tp_rate_barrier']:.1f}% vs {r['timebench_rate']:.1f}%: diff {tb[0]*100:+.1f}pp "
            f"[{tb[1][0]*100:+.1f}, {tb[1][1]*100:+.1f}] -> A verdict {vA} (weight: {r['grade']})")
        A90 = run(TC, "A", "p90")
        res["A_p90"] = F.summarise("A: fade p90 -> session VWAP", A90, TC, rng)
        out += [A75.assign(part="A75"), A90.assign(part="A90")]
        # C: confluence with the owner's VWAP sigma bands
        Dk = A75[~A75["skip"]].copy()
        conf = Dk["z"] >= 2
        say("\n== C: owner's 14-day VWAP sigma-band confluence (A p75 trades, z = line vs VWAP in sigma_v) ==")
        Cc = A75.copy(); Cc.loc[~Cc["skip"], "skip"] = ~conf.to_numpy()
        cnet = F.boot(Cc, TC, "net", rng)
        ch = {h: F.boot(Cc, TC, "net", rng, yr) for h, yr in HALVES.items()}
        diff = boot_diff(A75, TC, (A75["z"] >= 2).fillna(False), rng)
        bands = pd.cut(Dk["z"], [-np.inf, 1, 1.5, 2, 2.5, 3, np.inf])
        tab = Dk.groupby(bands, observed=False)["net"].agg(["count", "mean"])
        say(f"  confluence trades {int(conf.sum())} of {len(Dk)}; net {cnet[0]:+.3f}R [{cnet[1][0]:+.3f}, {cnet[1][1]:+.3f}]; halves "
            + ", ".join(f"{h} {x[0]:+.3f}" for h, x in ch.items()) + f"; confluence - other {diff[0]:+.3f}R [{diff[1][0]:+.3f}, {diff[1][1]:+.3f}]")
        say("  by z band: " + "; ".join(f"{k} n{int(r['count'])} {r['mean']:+.3f}R" for k, r in tab.iterrows()))
        vC = ("VALIDATED" if cnet[1][0] > 0 and all(x[0] > 0 for x in ch.values()) and diff[1][0] > 0
              else ("NULL" if cnet[1][1] < 0.05 else "UNDERPOWERED"))
        say(f"  -> {vC} (weight: {F.grade(vC, cnet[0], cnet[1])})")
        res["C"] = {"n": int(conf.sum()), "net": cnet, "halves": ch, "diff": diff, "verdict": vC,
                    "grade": F.grade(vC, cnet[0], cnet[1]), "bands": {str(k): [int(r["count"]), float(r["mean"])] for k, r in tab.iterrows()}}
    if okB:
        B0 = run(TC, "B")
        r = F.summarise("B: follow the p90 break, stop p75, exit 22:00 (primary)", B0, TC, rng)
        # B's rule has no driftless-benchmark part (no target): verdict on net R and halves only
        vB = ("VALIDATED" if r["net"][1][0] > 0 and all(h[0] > 0 for h in r["halves"].values())
              else ("NULL" if r["net"][1][1] < 0.05 else "UNDERPOWERED"))
        r["verdict"], r["grade"] = vB, F.grade(vB, r["net"][0], r["net"][1])
        say(f"  B verdict on its own rule (no benchmark part): {vB} (weight: {r['grade']})")
        res["B"] = r
        B1 = run(TC, "B", tp_variant=True)
        res["B_tp"] = F.boot(B1, TC, "net", rng)
        say(f"  variant TP at p90 + (p90 - p75): net {res['B_tp'][0]:+.3f}R {res['B_tp'][1]}")
        out += [B0.assign(part="B"), B1.assign(part="B_tp")]
    if out:
        pd.concat(out).to_parquet(OUT / "trades_ac.parquet")
    (OUT / "report_ac.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    json.dump(res, open(OUT / "results_ac.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
