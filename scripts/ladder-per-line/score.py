"""ladder-per-line (forge/LADDER_PER_LINE_PREREG.md, A1): per-line sigma models vs one model; OC model; OC take-profit.

    python scripts/ladder-per-line/score.py   -> analysis/output/ladder-per-line/{results.json, report.txt, trades.parquet}

Rows: analysis/output/ladder-per-line/build/<sym>/ (scripts/ladder-v2/ladder.py build with LADDER_OUT). Lines: the
harness's walk_forward at tau 10/25/50/75/90. Seed 20261120.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402
from forge import vol as V  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

_spec = importlib.util.spec_from_file_location("tal", ROOT / "scripts/trade-at-lines/score.py")
TAL = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(TAL)

SEED, B, BLOCK = 20261120, 2000, 63
TAUS5 = (10, 25, 50, 75, 90)
LINES = ("hl", "oh", "ol")
QS = ("hl", "oh", "ol", "oc")
TEST = range(2019, 2027)
HALVES = {"2019-22": (2019, 2022), "2023-26": (2023, 2026)}
SYMS = ("NQ", "GOLD", "EURUSD")
BIDASK = {"NQ": "nq", "GOLD": "gold", "EURUSD": "eurusd"}
OUT = ROOT / "analysis/output/ladder-per-line"
TICK = 1e-5
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(s)


# ---------------------------------------------------------------- lines and scores
def lines(sym, track, oracle=False):
    os.environ["LADDER_OUT"] = f"analysis/output/ladder-per-line/build/{sym.lower()}"
    L.TAUS = TAUS5
    S = pd.read_parquet(OUT / f"build/{sym.lower()}/rows_{track}.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    if oracle:
        m = float(np.nanmedian(S["oh"] / S["A0"]))
        S["ORACLE"] = np.sqrt(S["A0"] * S["oh"] / m)
        arms.append("ORACLE")
    T = L.walk_forward(S, sym, track, arms, quiet=True).sort_values("date").reset_index(drop=True)
    if oracle:
        for q in ("hl", "ol", "oc"):
            for t in TAUS5:
                T[f"ORACLE_{q}_{t}"] = T[f"A0_{q}_{t}"] * 1.3
    return T, arms


def pinball(T, a, q):
    return np.mean([V.pinball_loss(T[q].to_numpy(), T[f"{a}_{q}_{t}"].to_numpy(), t / 100) for t in TAUS5], axis=0)


def select(T, arms):
    """Per test year: S1 (one arm, lowest hl+oh+ol), SL (per line), SOC (oc). Chosen on years 2018..Y-1 only."""
    P = {(a, q): pinball(T, a, q) for a in arms for q in QS}
    yrs = T["year"].to_numpy()
    sel = {"S1": {q: np.full(len(T), None) for q in QS}, "SL": {q: np.full(len(T), None) for q in LINES},
           "SOC": {"oc": np.full(len(T), None)}}
    picks = {}
    for Y in TEST:
        tr, te = (yrs >= 2018) & (yrs < Y), yrs == Y
        if not te.any() or not tr.any():
            continue
        m = {k: float(v[tr].mean()) for k, v in P.items()}
        s1 = min(arms, key=lambda a: sum(m[(a, q)] for q in LINES))
        sl = {q: min(arms, key=lambda a: m[(a, q)]) for q in LINES}
        soc = min(arms, key=lambda a: m[(a, "oc")])
        for q in QS:
            sel["S1"][q][te] = s1
        for q in LINES:
            sel["SL"][q][te] = sl[q]
        sel["SOC"]["oc"][te] = soc
        picks[Y] = {"S1": s1, **{f"SL_{q}": sl[q] for q in LINES}, "SOC": soc}
    keep = yrs >= TEST[0]
    return P, sel, picks, keep


def take(T, sel_q, col):
    """Per row, the chosen arm's column (col = '' for sigma, or '_q_t')."""
    out = np.full(len(T), np.nan)
    for a in set(x for x in sel_q if x is not None):
        m = sel_q == a
        out[m] = T[f"{a}{col}"].to_numpy()[m]
    return out


def loss_vec(P, sel_q, q, n):
    out = np.full(n, np.nan)
    for a in set(x for x in sel_q if x is not None):
        m = sel_q == a
        out[m] = P[(a, q)][m]
    return out


def regime_miss(T, sel, strat, qs):
    edges = np.quantile(T["rel"], [.2, .4, .6, .8]); f = np.searchsorted(edges, T["rel"].to_numpy())
    gaps = []
    for q in qs:
        for t, tg in ((75, .25), (90, .10)):
            hit = (T[q].to_numpy() > take(T, sel[strat][q], f"_{q}_{t}")).astype(float)
            gaps += [abs(hit[f == k].mean() - tg) for k in range(5)]
    return float(np.mean(gaps) * 100)


def qlike(T, sel_q, q):
    x, f = T[q].to_numpy(), take(T, sel_q, f"_{q}_50")
    ok = (x > 0) & (f > 0)
    r = x[ok] / f[ok]
    return float(np.mean(r - np.log(r) - 1))


# ---------------------------------------------------------------- bootstrap
def blocks(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def rel_delta(pairs, rng, years=None):
    """pairs: {sym: (years, new_loss, base_loss)} -> pooled relative delta (equal-weight mean over instruments), 90% CI."""
    pts, draws = [], []
    for sym, (yrs, new, base) in pairs.items():
        m = np.ones(len(yrs), bool) if years is None else (yrs >= years[0]) & (yrs <= years[1])
        nw, bs = new[m], base[m]
        pts.append(nw.sum() / bs.sum() - 1)
        bi = blocks(len(nw), rng)
        draws.append(nw[bi].sum(1) / bs[bi].sum(1) - 1)
    d = np.mean(draws, 0)
    return float(np.mean(pts) * 100), [float(np.quantile(d, .05) * 100), float(np.quantile(d, .95) * 100)]


def verdict(track_res, guard_ok):
    """track_res: {track: {'all': (pt, ci), halves...}} for Part A / B1 rules (percent units)."""
    val = all(r["all"][1][1] < 0 and all(r[h][1][1] < 0 for h in HALVES) for r in track_res.values()) and guard_ok
    null = all(r["all"][0] >= 0 and r["all"][1][0] > -0.5 for r in track_res.values())
    return "VALIDATED" if val else ("NULL" if null else "UNDERPOWERED")


# ---------------------------------------------------------------- part B2 trades
def fade(up, Lv, stop, target, A, mid=False):
    """trade-at-lines FADE-L mechanics with an explicit stop and target. Returns (R, how) or None if not filled."""
    mh, ml = A["high"], A["low"]
    if mid:
        bh, bl, bc, bo = A["high"], A["low"], A["close"], A["open"]; ah, al, ac, ao = bh, bl, bc, bo
    else:
        bh, bl, bc, bo = A["bid_h"], A["bid_l"], A["bid_c"], A["bid_o"]; ah, al, ac, ao = A["ask_h"], A["ask_l"], A["ask_c"], A["ask_o"]
    t0 = TAL.first(mh >= Lv) if up else TAL.first(ml <= Lv)
    if t0 is None:
        return None
    short = up
    k = TAL.first(bh >= Lv * (1 + TICK), t0) if short else TAL.first(al <= Lv * (1 - TICK), t0)
    if k is None:
        return None
    entry, R = Lv, abs(Lv - stop)
    j0 = k + 1
    how = "time"
    if j0 >= len(mh):
        ex = ac[-1] if short else bc[-1]
    elif short:
        js, jt = TAL.first(ah >= stop, j0), TAL.first(al <= target, j0)
        if js is not None and (jt is None or js <= jt):
            ex, how = max(stop, ao[js]), "sl"
        elif jt is not None:
            ex, how = (min(target, ao[jt]) if ao[jt] < target else target), "tp"
        else:
            ex = ac[-1]
    else:
        js, jt = TAL.first(bl <= stop, j0), TAL.first(bh >= target, j0)
        if js is not None and (jt is None or js <= jt):
            ex, how = min(stop, bo[js]), "sl"
        elif jt is not None:
            ex, how = (max(target, bo[jt]) if bo[jt] > target else target), "tp"
        else:
            ex = bc[-1]
    return ((entry - ex) if short else (ex - entry)) / R, how


def part_b2(TC):
    rows, skips = [], 0
    for sym in SYMS:
        T, sel = TC[sym]["T"], TC[sym]["sel"]
        S = TAL.sessions(BIDASK[sym])
        keep = TC[sym]["keep"]
        lv = {(q, t): take(T, sel["SL"][q], f"_{q}_{t}") for q in ("oh", "ol") for t in (75, 90)}
        sg = {q: take(T, sel["SL"][q], "") for q in ("oh", "ol")}
        oc50 = take(T, sel["SOC"]["oc"], "_oc_50")
        n_s = 0
        for i in np.flatnonzero(keep):
            g = S.get(T["date"].iloc[i])
            if g is None or len(g) < 600:
                continue
            n_s += 1
            A = {c: g[c].to_numpy(float) for c in ("open", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c",
                                                     "ask_o", "ask_h", "ask_l", "ask_c")}
            o = A["open"][0]
            for up, q in ((True, "oh"), (False, "ol")):
                sgn = 1.0 if up else -1.0
                Lv = o * (1 + sgn * lv[(q, 75)][i] / 100)
                stop = o * (1 + sgn * lv[(q, 90)][i] / 100) + sgn * 0.05 * sg[q][i] / 100 * o
                tp = o * (1 + sgn * oc50[i] / 100)
                if not ((o < tp < Lv) if up else (Lv < tp < o)):
                    skips += 1
                    continue
                d = abs(Lv - tp)
                for kind, k in (("real", 1.0), ("p07", 0.7), ("p13", 1.3)):
                    tgt = Lv - sgn * k * d
                    r = fade(up, Lv, stop, tgt, A)
                    if r is None:
                        continue
                    g_ = fade(up, Lv, stop, tgt, A, mid=True)
                    rows.append({"sym": sym, "date": T["date"].iloc[i], "year": int(T["year"].iloc[i]), "side": q.upper(),
                                 "kind": kind, "netR": r[0], "grossR": g_[0] if g_ else np.nan,
                                 "how_mid": g_[1] if g_ else None, "s": abs(Lv - stop), "d": k * d})
        say(f"  B2 {sym}: {n_s} sessions with bid/ask")
    return pd.DataFrame(rows), skips


def boot_trades(X, rng, years=None):
    """Pooled mean net R (real) and real minus placebo, session blocks within instrument."""
    if years is not None:
        X = X[(X["year"] >= years[0]) & (X["year"] <= years[1])]
    acc = np.zeros((B, 4)); tot = np.zeros(4)
    for sym in SYMS:
        Z = X[X["sym"] == sym]
        if Z.empty:
            continue
        ds = np.array(sorted(Z["date"].unique()))
        idx = {d: i for i, d in enumerate(ds)}
        v = np.zeros((len(ds), 4))
        for kind, col in (("real", 0), ("plc", 2)):
            W = Z[Z["kind"] == "real"] if kind == "real" else Z[Z["kind"] != "real"]
            for d, r in zip(W["date"], W["netR"]):
                v[idx[d], col] += r; v[idx[d], col + 1] += 1
        tot += v.sum(0)
        bi = blocks(len(ds), rng)
        acc += v[bi].sum(1)
    real, plc = tot[0] / tot[1], tot[2] / tot[3]
    br, bp = acc[:, 0] / acc[:, 1], acc[:, 2] / acc[:, 3]
    q = lambda a: [float(np.quantile(a, .05)), float(np.quantile(a, .95))]  # noqa: E731
    return {"mean": float(real), "ci": q(br), "d": float(real - plc), "dci": q(br - bp), "n": int(tot[1])}


# ---------------------------------------------------------------- main
def run_track(track, oracle=False):
    TC = {}
    for sym in SYMS:
        T, arms = lines(sym, track, oracle)
        P, sel, picks, keep = select(T, arms)
        TC[sym] = {"T": T, "arms": arms, "P": P, "sel": sel, "picks": picks, "keep": keep}
    return TC


def part_a_pairs(TC, which):
    out = {}
    for sym, c in TC.items():
        T, P, sel, k = c["T"], c["P"], c["sel"], c["keep"]
        n = len(T)
        if which == "A":
            new = sum(loss_vec(P, sel["SL"][q], q, n) for q in LINES)
            base = sum(loss_vec(P, sel["S1"][q], q, n) for q in LINES)
        elif which == "OC":
            new, base = loss_vec(P, sel["SOC"]["oc"], "oc", n), loss_vec(P, sel["S1"]["oc"], "oc", n)
        else:
            new, base = loss_vec(P, sel["SL"][which], which, n), loss_vec(P, sel["S1"][which], which, n)
        out[sym] = (T["year"].to_numpy()[k], new[k], base[k])
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    res = {"seed": SEED, "B": B, "block": BLOCK, "test_years": [TEST[0], TEST[-1]]}

    say("== PC-A: planted ORACLE arm (informed OH lines; other lines A0 x1.3), CFD")
    TO = run_track("C", oracle=True)
    n_or = {s: sum(p["SL_oh"] == "ORACLE" for p in c["picks"].values()) for s, c in TO.items()}
    s1_or = {s: sum(p["S1"] == "ORACLE" for p in c["picks"].values()) for s, c in TO.items()}
    pt, ci = rel_delta(part_a_pairs(TO, "A"), rng)
    pc_ok = all(v >= 7 for v in n_or.values()) and ci[1] < 0
    say(f"  SL picks ORACLE for oh: {n_or} of 8 years; S1 picks ORACLE: {s1_or}; delta {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}] -> {'ok' if pc_ok else 'FAIL'}")
    res["pc_a"] = {"sl_oh_oracle_years": n_or, "s1_oracle_years": s1_or, "delta": pt, "ci90": ci, "pass": pc_ok}
    if not pc_ok:
        (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
        raise SystemExit("PC-A FAILED: nothing scored")

    res["A"], res["B1"], res["picks"] = {}, {}, {}
    TCs = {}
    for track in ("C", "F"):
        TC = run_track(track)
        TCs[track] = TC
        say(f"\n== track {track}")
        res["picks"][track] = {s: c["picks"] for s, c in TC.items()}
        for s, c in TC.items():
            pk = c["picks"]
            say(f"  {s} picks: " + "; ".join(f"{k} " + ",".join(str(pk[y][k]) for y in sorted(pk)) for k in ("S1", "SL_hl", "SL_oh", "SL_ol", "SOC")))
        a = {"all": rel_delta(part_a_pairs(TC, "A"), rng)}
        for h, yy in HALVES.items():
            a[h] = rel_delta(part_a_pairs(TC, "A"), rng, yy)
        per_q = {q: rel_delta(part_a_pairs(TC, q), rng) for q in LINES}
        per_i = {s: rel_delta({s: part_a_pairs(TC, "A")[s]}, rng) for s in SYMS}
        rm = {s: {"S1": regime_miss(c["T"][c["keep"]].reset_index(drop=True), {k: {q: v[c["keep"]] for q, v in d.items()} for k, d in c["sel"].items()}, "S1", LINES),
                  "SL": regime_miss(c["T"][c["keep"]].reset_index(drop=True), {k: {q: v[c["keep"]] for q, v in d.items()} for k, d in c["sel"].items()}, "SL", LINES)}
              for s, c in TC.items()}
        rm_mean = {k: float(np.mean([rm[s][k] for s in SYMS])) for k in ("S1", "SL")}
        ql = {s: {q: {"S1": qlike(c["T"][c["keep"]], c["sel"]["S1"][q][c["keep"]], q),
                      "SL": qlike(c["T"][c["keep"]], c["sel"]["SL"][q][c["keep"]], q)} for q in LINES} for s, c in TC.items()}
        res["A"][track] = {**a, "per_quantity": per_q, "per_instrument": per_i, "regime_miss": rm, "regime_miss_mean": rm_mean, "qlike": ql}
        say(f"  A  per-line vs one model: {a['all'][0]:+.2f}% [{a['all'][1][0]:+.2f}, {a['all'][1][1]:+.2f}]  "
            + "  ".join(f"{h} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for h, v in a.items() if h != "all"))
        say("     per line: " + "  ".join(f"{q} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for q, v in per_q.items()))
        say("     per instrument: " + "  ".join(f"{s} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for s, v in per_i.items()))
        say(f"     regime miss (30 cells) S1 {rm_mean['S1']:.2f}pp vs SL {rm_mean['SL']:.2f}pp")
        b = {"all": rel_delta(part_a_pairs(TC, "OC"), rng)}
        for h, yy in HALVES.items():
            b[h] = rel_delta(part_a_pairs(TC, "OC"), rng, yy)
        ocrm = {s: {k: regime_miss(c["T"][c["keep"]].reset_index(drop=True),
                                   {kk: {q: v[c["keep"]] for q, v in dd.items()} for kk, dd in {"S1": {"oc": c["sel"]["S1"]["oc"]}, "SOC": c["sel"]["SOC"]}.items()}, k, ("oc",))
                    for k in ("S1", "SOC")} for s, c in TC.items()}
        ocrm_mean = {k: float(np.mean([ocrm[s][k] for s in SYMS])) for k in ("S1", "SOC")}
        ctx = {}
        for s, c in TC.items():
            T, k = c["T"], c["keep"]
            sig = T["A0"].to_numpy()[k]
            oc50 = take(T, c["sel"]["SOC"]["oc"], "_oc_50")[k]
            ctx[s] = {f"|OC50-{q.upper()}50|/sigma": float(np.median(np.abs(oc50 - take(T, c["sel"]["SL"][q], f"_{q}_50")[k]) / sig)) for q in ("oh", "ol")}
        res["B1"][track] = {**b, "oc_regime_miss": ocrm, "oc_regime_miss_mean": ocrm_mean, "oc_vs_ohol_context": ctx}
        say(f"  B1 OC model vs one model's OC: {b['all'][0]:+.2f}% [{b['all'][1][0]:+.2f}, {b['all'][1][1]:+.2f}]  "
            + "  ".join(f"{h} {v[0]:+.2f}% [{v[1][0]:+.2f}, {v[1][1]:+.2f}]" for h, v in b.items() if h != "all")
            + f"; OC regime miss S1 {ocrm_mean['S1']:.2f} vs SOC {ocrm_mean['SOC']:.2f}pp")
        say("     context, median |OC p50 - OH/OL p50| in sigma: " + "  ".join(f"{s} " + "/".join(f"{v:.3f}" for v in d.values()) for s, d in ctx.items()))

    gA = all(res["A"][t]["regime_miss_mean"]["SL"] <= res["A"][t]["regime_miss_mean"]["S1"] + 0.5 for t in ("C", "F"))
    gB = all(res["B1"][t]["oc_regime_miss_mean"]["SOC"] <= res["B1"][t]["oc_regime_miss_mean"]["S1"] + 0.5 for t in ("C", "F"))
    res["A"]["verdict"] = verdict({t: res["A"][t] for t in ("C", "F")}, gA)
    res["B1"]["verdict"] = verdict({t: res["B1"][t] for t in ("C", "F")}, gB)
    say(f"\nVERDICT A (per-line models): {res['A']['verdict']} (regime guard {'ok' if gA else 'FAILS'})")
    say(f"VERDICT B1 (OC model): {res['B1']['verdict']} (OC regime guard {'ok' if gB else 'FAILS'})")

    say("\n== B2: fade first touch of OH/OL p75 (per-line lines), stop p90 + 0.05 sigma, TP = OC p50 (OC model), CFD bid/ask")
    X, skips = part_b2(TCs["C"])
    X.to_parquet(OUT / "trades.parquet")
    br = X[X["how_mid"].isin(["tp", "sl"])]
    hit, bench = float((br["how_mid"] == "tp").mean() * 100), float((br["s"] / (br["s"] + br["d"])).mean() * 100)
    pcb = abs(hit - bench) <= 3
    say(f"  PC-B2: mid TP-first share {hit:.1f}% vs driftless benchmark {bench:.1f}% over {len(br)} barrier exits -> {'ok' if pcb else 'FAIL'}")
    st = boot_trades(X, rng)
    hv = {h: boot_trades(X, rng, yy) for h, yy in HALVES.items()}
    real = X[X["kind"] == "real"]
    rb = real[real["how_mid"].isin(["tp", "sl"])]
    say(f"  real trades {st['n']} (skipped {skips} side-sessions: OC p50 not between open and entry); net {st['mean']:+.3f}R "
        f"[{st['ci'][0]:+.3f}, {st['ci'][1]:+.3f}]; gross {real['grossR'].mean():+.3f}R; vs placebo TPs {st['d']:+.3f}R "
        f"[{st['dci'][0]:+.3f}, {st['dci'][1]:+.3f}]; TP-first {((rb['how_mid'] == 'tp').mean() * 100):.1f}% vs benchmark "
        f"{(rb['s'] / (rb['s'] + rb['d'])).mean() * 100:.1f}%")
    say("  halves: " + "  ".join(f"{h} {v['mean']:+.3f}R [{v['ci'][0]:+.3f}, {v['ci'][1]:+.3f}]" for h, v in hv.items()))
    say("  per instrument net R: " + "  ".join(f"{s} {real[real['sym'] == s]['netR'].mean():+.3f} (n {int((real['sym'] == s).sum())})" for s in SYMS))
    if not pcb:
        v2 = "UNDERPOWERED"
        say("  PC-B2 failed: B2 not judged (UNDERPOWERED by rule)")
    else:
        val = st["ci"][0] > 0 and all(v["ci"][0] > 0 for v in hv.values()) and st["dci"][0] > 0
        v2 = "VALIDATED" if val else ("NULL" if st["ci"][1] < 0.05 else "UNDERPOWERED")
    res["B2"] = {"pc": {"tp_first_mid": hit, "benchmark": bench, "pass": pcb}, **st, "halves": hv, "skipped": skips,
                 "gross_mean": float(real["grossR"].mean()), "verdict": v2}
    say(f"VERDICT B2 (OC take-profit): {v2}")
    res["input_sha256"] = input_hashes([f"analysis/output/ladder-per-line/build/{s.lower()}/rows_{t}.parquet" for s in SYMS for t in "CF"]
                                       + [f"data/m1_bidask/{k}_m1.parquet" for k in BIDASK.values()])
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
