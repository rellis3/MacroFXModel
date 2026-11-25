"""close-reversal-confirm (forge/CLOSE_REVERSAL_CONFIRM_PREREG.md).

    python scripts/close-reversal-confirm/run.py [SYM:TRACK ...]   -> analysis/output/close-reversal-confirm/
    python scripts/close-reversal-confirm/run.py summarise

Every touch of Jordan's Close+ / Close- lines (and, secondary, the HL moving projections), median / 75th / 90th, each
line on its own walk-forward QLIKE calc; placebo at 0.75-0.90 / 1.10-1.25 x distance. Fade entries:
  C0 at the touch, stop 0.20 sigma beyond the line (the touch bar counts toward the stop, A1);
  C1 first 5-minute bar (London buckets) ending at/after the touch, within 60 min, closing back inside -> its close;
  C2 first bar after the touch, within 60 min, trading 0.05 sigma back inside -> that price.
  C1/C2 stop = furthest price beyond the line from the touch through the entry bar + 0.05 sigma.
Targets 1R (primary) and 2R; tie = stop; unresolved closed at 22:00 London. Futures net of 2.5 ticks; CFDs gross.
Sessions 2020 -> 2026-08-21. Seed 20261125.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


JLM = _load("jlm", "scripts/jordan-lines-mae/run.py")
LTE, RC, RF, tick_of = JLM.LTE, JLM.RC, JLM.RF, JLM.tick_of

SEED = 20261125
OUT = ROOT / "analysis/output/close-reversal-confirm"
TAUS = (0.50, 0.75, 0.90)
REARM, C0_STOP, BACK, BUF, WAIT = 0.10, 0.20, 0.05, 0.05, 60
COST_TICKS = 2.5
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
NOHIT = 10**9


def ft(mask):
    if not len(mask):
        return NOHIT
    i = int(np.argmax(mask))
    return i if mask[i] else NOHIT


def race(h, l, op, c, k0, entry, stop, R, short, touch_bar_stop=False):
    """Returns ((gross 1R, how), (gross 2R, how)). Stop/target checked from bar k0; if touch_bar_stop, bar k0 counts
    for the stop only (target from k0 + 1)."""
    out = []
    hh, ll, oo = h[k0:], l[k0:], op[k0:]
    js = ft(hh >= stop) if short else ft(ll <= stop)
    for rr in (1, 2):
        tg = entry - rr * R if short else entry + rr * R
        tm = (ll <= tg) if short else (hh >= tg)
        if touch_bar_stop and len(tm):
            tm = tm.copy(); tm[0] = False
        jt = ft(tm)
        if js <= jt and js < NOHIT:
            ex = stop if (touch_bar_stop and js == 0) else (max(stop, oo[js]) if short else min(stop, oo[js]))
            how = "sl"
        elif jt < NOHIT:
            ex = min(tg, oo[jt]) if short else max(tg, oo[jt]); how = "tp"
        else:
            ex = c[-1]; how = "time"
        out.append((((entry - ex) if short else (ex - entry)) / R, how))
    return out


def run(job):
    sym, track = job
    dates, lv, sg, _ = JLM.levels(sym, track)
    m = L.load_m1(sym, track, "unadj") if track == "F" else L.load_m1(sym, track)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O, C = (m[c].to_numpy() for c in ("high", "low", "open", "close"))
    tick = tick_of(C[-200000:]) if track == "F" else np.nan
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(starts, ends)}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:{track}".encode())])
    rows = []
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600 or not all(np.isfinite(lv[q][i, 0]) for q in ("hl", "cup", "cdn")):
            continue
        h, l, c, op, o, n = H[s:e], Lo[s:e], C[s:e], O[s:e], O[s], e - s
        mm_ = mins[s:e]
        b5 = (mm_ % 5) == 4
        ds = dt.strftime("%Y-%m-%d")
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
        hlpx = lv["hl"][i] * o / 100
        for tl, (ab, sq, _) in JLM.TL.items():
            sig = sg[sq][i] * o / 100
            short = ab                                   # a line above the open is faded short
            for j, tau in enumerate(TAUS):
                mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
                for kind in ("line", "placebo"):
                    mk = 1.0 if kind == "line" else mult
                    if tl == "cup":
                        P = np.full(n, o * (1 + lv["cup"][i, j] * mk / 100))
                    elif tl == "cdn":
                        P = np.full(n, o * (1 - lv["cdn"][i, j] * mk / 100))
                    elif tl == "hlH":
                        P = rl + hlpx[j] * mk
                    else:
                        P = rh - hlpx[j] * mk
                    for tn, t in enumerate(LTE.touches(h, l, P, REARM * sig, ab), 1):
                        Pt = float(P[t])
                        base = (ds, tl, int(tau * 100), kind, tn, int(mm_[t]), sig)
                        # C0: at the touch
                        stop = Pt + C0_STOP * sig if short else Pt - C0_STOP * sig
                        (g1, h1), (g2, _) = race(h, l, op, c, t, Pt, stop, C0_STOP * sig, short, touch_bar_stop=True)
                        ex = (h[t:t + WAIT + 1].max() - Pt) if short else (Pt - l[t:t + WAIT + 1].min())
                        rows.append(base + ("C0", True, C0_STOP, g1, g2, h1, max(ex, 0) / sig, C0_STOP * sig))
                        # C1: 5-minute close back inside
                        w = slice(t, min(n, t + WAIT + 1))
                        ok = b5[w] & ((c[w] < Pt) if short else (c[w] > Pt))
                        k = ft(ok)
                        rows.append(_confirm(base, "C1", k, t, h, l, op, c, Pt, sig, short, entry_px=None))
                        # C2: 0.05 sigma back inside
                        w2 = slice(t + 1, min(n, t + WAIT + 1))
                        thr = Pt - BACK * sig if short else Pt + BACK * sig
                        k2 = ft((l[w2] <= thr) if short else (h[w2] >= thr))
                        rows.append(_confirm(base, "C2", k2, t + 1, h, l, op, c, Pt, sig, short, entry_px=thr))
    cols = ["date", "line", "tau", "kind", "touch_n", "minute", "sig_px", "rule", "traded", "stop_sig",
            "g1", "g2", "how1", "adv60", "R_px"]
    df = pd.DataFrame(rows, columns=cols)
    cost = COST_TICKS * tick / df["R_px"] if track == "F" else 0.0
    df["n1"], df["n2"] = df["g1"] - cost, df["g2"] - cost
    for c_ in ("sig_px", "stop_sig", "g1", "g2", "adv60", "R_px", "n1", "n2"):
        df[c_] = df[c_].astype("float32")
    df.insert(0, "track", track)
    df.insert(0, "sym", sym)
    df["tick"] = tick
    df.to_parquet(OUT / "trades" / f"{track}_{sym}.parquet")
    d = df[(df.kind == "line") & df.line.isin(["cup", "cdn"])]
    return (f"{track} {sym}: Close± line touches {int((d.rule == 'C0').sum())}; traded C1 "
            f"{d[d.rule == 'C1'].traded.mean():.0%} C2 {d[d.rule == 'C2'].traded.mean():.0%}")


def _confirm(base, rule, k, off, h, l, op, c, Pt, sig, short, entry_px):
    nan = (np.nan, np.nan, "", np.nan, np.nan)
    if k >= NOHIT:
        return base + (rule, False, np.nan) + nan[:3] + nan[3:]
    kb = off + k
    if entry_px is None:
        entry = float(c[kb])
    else:
        entry = min(entry_px, op[kb]) if short else max(entry_px, op[kb])
    t = int(off if rule == "C1" else off - 1)
    ext = h[t:kb + 1].max() if short else l[t:kb + 1].min()
    stop = ext + BUF * sig if short else ext - BUF * sig
    R = (stop - entry) if short else (entry - stop)
    if not R > 0 or kb + 1 >= len(h):
        return base + (rule, False, np.nan) + nan[:3] + nan[3:]
    (g1, h1), (g2, _) = race(h, l, op, c, kb + 1, entry, stop, R, short)
    seg = slice(kb + 1, min(len(h), kb + 1 + WAIT))
    adv = (h[seg].max() - entry) if short else (entry - l[seg].min())
    return base + (rule, True, R / sig, g1, g2, h1, max(adv, 0) / sig, R)


# ------------------------------------------------------------------------------------------------------------ summary
def dboot(df, col, B=1000, seed=SEED, against=None):
    """Mean of col (kind=line) minus mean (kind=placebo) if against == 'placebo', else mean of col; date clusters."""
    if against == "placebo":
        g = df.groupby(["date", "kind"])[col].agg(["sum", "count"]).unstack("kind").fillna(0)
        if ("sum", "placebo") not in g or ("sum", "line") not in g:
            return np.nan, [np.nan, np.nan], np.nan
        a, na_ = g[("sum", "line")].to_numpy(), g[("count", "line")].to_numpy()
        b, nb = g[("sum", "placebo")].to_numpy(), g[("count", "placebo")].to_numpy()
    else:
        g = df.groupby("date")[col].agg(["sum", "count"])
        a, na_ = g["sum"].to_numpy(), g["count"].to_numpy()
        b, nb = np.zeros_like(a), np.zeros_like(na_)
    est = a.sum() / max(na_.sum(), 1) - (b.sum() / max(nb.sum(), 1) if nb.sum() else 0)
    idx = np.random.default_rng(seed).integers(0, len(a), (B, len(a)))
    bs = a[idx].sum(1) / np.maximum(na_[idx].sum(1), 1) - (b[idx].sum(1) / np.maximum(nb[idx].sum(1), 1) if nb.sum() else 0)
    p = float(min(1.0, 2 * min((bs <= 0).mean(), (bs >= 0).mean())))
    return float(est), [float(np.quantile(bs, .05)), float(np.quantile(bs, .95))], p


def summarise():
    lines = []
    say = lambda s="": (lines.append(s), print(s))
    res = {"seed": SEED, "tests": {}}
    tests = []
    desc = []
    for track, fam, col1, col2 in (("F", "futures (net)", "n1", "n2"), ("C", "CFDs (gross)", "g1", "g2")):
        files = sorted((OUT / "trades").glob(f"{track}_*.parquet"))
        if not files:
            continue
        A = pd.concat([pd.read_parquet(p, columns=["sym", "date", "line", "tau", "kind", "touch_n", "minute", "rule",
                                                   "traded", "stop_sig", col1, col2, "how1", "adv60"]) for p in files],
                      ignore_index=True)
        A["date"] = pd.to_datetime(A["date"])
        A["grp"] = np.where(A["line"].isin(["cup", "cdn"]), "Close±", "HL proj")
        A["yr"] = A["date"].dt.year
        A["hours"] = A["minute"].map(LTE.hb)
        say(f"\n== {fam} ==")
        for grp in ("Close±", "HL proj"):
            G = A[A.grp == grp]
            for rule in ("C0", "C1", "C2"):
                R_ = G[G.rule == rule]
                Tr = R_[R_.traded]
                ln = Tr[Tr.kind == "line"]
                vs = dboot(Tr, col1, against="placebo")
                own = dboot(ln, col1)
                hv = {h: (dboot(Tr[(Tr.yr >= a) & (Tr.yr <= b)], col1, against="placebo")[0],
                          dboot(Tr[(Tr.yr >= a) & (Tr.yr <= b)][lambda d: d.kind == "line"], col1)[0])
                      for h, (a, b) in HALVES.items()}
                r2 = dboot(Tr, col2, against="placebo")
                row = {"family": fam, "lines": grp, "rule": rule,
                       "touches": int((R_.kind == "line").sum()), "traded_share": float(R_[R_.kind == "line"].traded.mean()),
                       "trades": len(ln), "stop_sig_p50": float(ln["stop_sig"].median()),
                       "adv60_p50": float(ln["adv60"].median()), "adv60_p75": float(ln["adv60"].quantile(.75)),
                       "win1": float((ln["how1"] == "tp").mean()), "R1_line": own[0], "R1_line_ci": own[1],
                       "R1_line_minus_placebo": vs[0], "ci": vs[1], "p": vs[2],
                       "halves_vs_placebo": {h: v[0] for h, v in hv.items()}, "halves_line": {h: v[1] for h, v in hv.items()},
                       "R2_line_minus_placebo": [r2[0], r2[1]], "R2_line": float(ln[col2].mean())}
                desc.append(row)
                say(f"{grp} {rule}: trades {len(ln)} ({row['traded_share']:.0%} of touches); stop p50 {row['stop_sig_p50']:.3f}σ; "
                    f"adverse after entry 60m p50 {row['adv60_p50']:.3f}σ p75 {row['adv60_p75']:.3f}σ; win1 {row['win1']:.1%}")
                say(f"     1R line {own[0]:+.4f} [{own[1][0]:+.4f},{own[1][1]:+.4f}]; line - placebo {vs[0]:+.4f} "
                    f"[{vs[1][0]:+.4f},{vs[1][1]:+.4f}]; halves (vs placebo / line) "
                    + ", ".join(f"{h} {v[0]:+.4f}/{v[1]:+.4f}" for h, v in hv.items())
                    + f"; 2R line {row['R2_line']:+.4f}, vs placebo {r2[0]:+.4f}")
                if grp == "Close±" and rule in ("C1", "C2"):
                    key = f"{track}_{rule}"
                    res["tests"][key] = row
                    tests.append(key)
        # descriptive cuts: Close±, by tau / hour / touch number, per rule
        C_ = A[(A.grp == "Close±") & A.traded]
        cuts = []
        for by in ("tau", "hours", "touch_n"):
            X = C_.copy()
            if by == "touch_n":
                X["touch_n"] = np.where(X["touch_n"] >= 4, 4, X["touch_n"])
            for (rule, b), g in X.groupby(["rule", by]):
                e, ci, _ = dboot(g, col1, B=300, against="placebo")
                cuts.append({"family": fam, "by": by, "bucket": b, "rule": rule, "n_line": int((g.kind == "line").sum()),
                             "R1_line": float(g[g.kind == "line"][col1].mean()), "line_minus_placebo": e,
                             "lo": ci[0], "hi": ci[1], "adv60_p50": float(g[g.kind == "line"]["adv60"].median())})
        pd.DataFrame(cuts).to_csv(OUT / f"cuts_{track}.csv", index=False)
    pd.DataFrame(desc).to_csv(OUT / "summary.csv", index=False)
    ps = [res["tests"][k]["p"] for k in tests]
    from importlib import import_module  # noqa: F401
    o = np.argsort(ps); n = len(ps)
    passed = np.zeros(n, bool)
    if n:
        ok = np.asarray(ps)[o] <= 0.10 * np.arange(1, n + 1) / n
        kk = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
        passed[o[:kk]] = True
    for k, b in zip(tests, passed):
        r = res["tests"][k]
        v = ("VALIDATED" if (r["ci"][0] > 0 and r["R1_line_ci"][0] > 0 and b
                             and all(x > 0 for x in r["halves_vs_placebo"].values())
                             and all(x > 0 for x in r["halves_line"].values()))
             else ("NULL" if r["ci"][1] < 0.02 else "UNDERPOWERED"))
        r["bh_pass"], r["verdict"] = bool(b), v
        say(f"{k}: BH {'pass' if b else 'fail'} -> {v}")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)
    (OUT / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    (OUT / "trades").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise(); return
    J = [tuple(a.split(":")) for a in args] or ([(s, "F") for s in RF.syms()] + [(s, "C") for s in RC.syms()])
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=3) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
