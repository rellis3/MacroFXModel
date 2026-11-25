"""jordan-vwap-band-tp (forge/JORDAN_VWAP_BAND_TP_PREREG.md).

    python scripts/jordan-vwap-band-tp/run.py [SYM ...]   -> analysis/output/jordan-vwap-band-tp/
    python scripts/jordan-vwap-band-tp/run.py summarise

Exact copy of the owner's "VWAP Fixed Sigma + MFE MAE" (hlc3 x volume VWAP reset per session; sigma_v = median of the
previous 20 sessions' RMS(hlc3 - VWAP); bands = VWAP(through the previous bar) +- k sigma_v) on the 25 NT8 futures.
  A  the indicator's own MFE/MAE at fresh +-2 / 2.5 / 3 sigma touches (15/30/60 min, EOD), ticks and sigma_v
  B  staged MAE/MFE at Jordan's lines (Close+-, HL projections; 15/30/60 min, EOD)
  C  fade a line touch at/beyond +-2 sigma_v: stop 0.30 line-sigma, TP +-1 sigma_v band (C1) or VWAP (C2); placebo
  D  the +-2 sigma re-entry signal: stop +-3 sigma, TP +-1 sigma; placebo bands
Sessions 2020 -> 2026-08-21, futures net of 2.5 ticks. Seed 20261125.
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
CRC = _load("crc", "scripts/close-reversal-confirm/run.py")
LTE, RF, tick_of, ft, NOHIT = JLM.LTE, JLM.RF, JLM.tick_of, CRC.ft, CRC.NOHIT

SEED = 20261125
OUT = ROOT / "analysis/output/jordan-vwap-band-tp"
TAUS = (0.50, 0.75, 0.90)
REARM, STOP_SIG, COST_TICKS, NHIST = 0.10, 0.30, 2.5, 20
WINS = (15, 30, 60)
KS = (2.0, 2.5, 3.0)
HALVES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}


def load_m1v(sym):
    m = L.load_m1(sym, "F", "unadj")
    raw = pd.read_parquet(L.m1_paths(sym, "F", "unadj"), columns=["timestamp", "volume"])
    raw.index = pd.to_datetime(raw.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    m["volume"] = raw["volume"][~raw.index.duplicated()].reindex(m.index).fillna(0).astype(float)
    return m


def excursions(h, l, k0, entry, short, wins):
    """MAE / MFE (price, >= 0) from bar k0 over each window (bars) and to the end."""
    out = []
    n = len(h)
    for w in tuple(wins) + (None,):
        e = n if w is None else min(n, k0 + w)
        if k0 >= e:
            out += [np.nan, np.nan]; continue
        hh, ll = h[k0:e].max(), l[k0:e].min()
        mae = (hh - entry) if short else (entry - ll)
        mfe = (entry - ll) if short else (hh - entry)
        out += [max(mae, 0.0), max(mfe, 0.0)]
    return out


def race_tp(h, l, op, c, k0, entry, stop, tp, short, touch_bar_stop=False):
    hh, ll, oo = h[k0:], l[k0:], op[k0:]
    js = ft(hh >= stop) if short else ft(ll <= stop)
    tm = (ll <= tp) if short else (hh >= tp)
    if touch_bar_stop and len(tm):
        tm = tm.copy(); tm[0] = False
    jt = ft(tm)
    if js <= jt and js < NOHIT:
        ex = stop if (touch_bar_stop and js == 0) else (max(stop, oo[js]) if short else min(stop, oo[js])); how = "sl"
    elif jt < NOHIT:
        ex = min(tp, oo[jt]) if short else max(tp, oo[jt]); how = "tp"
    else:
        ex = c[-1]; how = "time"
    R = abs(stop - entry)
    return (((entry - ex) if short else (ex - entry)) / R, how)


def run(sym):
    dates, lv, sg, _ = JLM.levels(sym, "F")
    lvi = {d: i for i, d in enumerate(dates)}
    m = load_m1v(sym)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    H, Lo, O, C, V = (m[c].to_numpy() for c in ("high", "low", "open", "close", "volume"))
    tick = tick_of(C[-200000:])
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:F:vwap".encode())])
    hist = []
    A, B, D = [], [], []
    for s, e in zip(starts, ends):
        dt = di[s]
        h, l, c, op, v = H[s:e], Lo[s:e], C[s:e], O[s:e], V[s:e]
        n = e - s
        hl3 = (h + l + c) / 3
        cv = np.cumsum(v)
        run_ = np.where(cv > 0, np.cumsum(hl3 * v) / np.maximum(cv, 1e-12), np.nan)
        sv = float(np.median(hist[-NHIST:])) if len(hist) >= NHIST else np.nan
        ok_rms = np.isfinite(run_)
        if ok_rms.sum() > 1:
            hist.append(float(np.sqrt(np.mean((hl3[ok_rms] - run_[ok_rms]) ** 2))))
        if dt.year < 2020 or dt > pd.Timestamp("2026-08-21") or n < 600 or not np.isfinite(sv) or sv <= 0:
            continue
        vb = np.r_[np.nan, run_[:-1]]                       # VWAP fixed at the previous bar's close
        mm_ = (lt[s:e].hour * 60 + lt[s:e].minute).to_numpy()
        ds = dt.strftime("%Y-%m-%d")
        # ---------------- A: the indicator's fresh band touches
        for k in KS:
            for short in (True, False):
                lvl = vb + (k * sv if short else -k * sv)
                prev_in = np.r_[False, (c[:-1] < lvl[:-1]) if short else (c[:-1] > lvl[:-1])]
                hit = (h >= lvl) if short else (l <= lvl)
                ev = np.flatnonzero(prev_in & hit & np.isfinite(lvl))
                for t in ev:
                    x = excursions(h, l, t + 1, float(lvl[t]), short, WINS)
                    A.append((ds, k, short, int(mm_[t]), sv, *x))
        # ---------------- B / C: Jordan's lines
        i = lvi.get(dt)
        if i is not None and all(np.isfinite(lv[q][i, 0]) for q in ("hl", "cup", "cdn")):
            o = op[0]
            rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l)[:-1]])
            rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h)[:-1]])
            hlpx = lv["hl"][i] * o / 100
            for tl, (ab, sq, grp) in JLM.TL.items():
                sig = sg[sq][i] * o / 100
                short = ab
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
                            x = excursions(h, l, t, Pt, short, WINS)          # MAE incl. the touch bar
                            mfe = excursions(h, l, t + 1, Pt, short, WINS)    # MFE from the next bar
                            x = [x[q] if q % 2 == 0 else mfe[q] for q in range(len(x))]
                            z = ((Pt - vb[t]) if short else (vb[t] - Pt)) / sv if np.isfinite(vb[t]) else np.nan
                            stop = Pt + STOP_SIG * sig if short else Pt - STOP_SIG * sig
                            res = []
                            for tp in ((vb[t] + sv) if short else (vb[t] - sv), vb[t]):
                                if np.isfinite(tp) and ((tp < Pt) if short else (tp > Pt)):
                                    g, how = race_tp(h, l, op, c, t, Pt, stop, float(tp), short, touch_bar_stop=True)
                                    res += [g, how, abs(Pt - tp) / (STOP_SIG * sig)]
                                else:
                                    res += [np.nan, "", np.nan]
                            B.append((ds, tl, grp, int(tau * 100), kind, tn, int(mm_[t]), sig, sv, z, *x, *res))
        # ---------------- D: +-2 sigma re-entry signal
        mult = rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25)
        for kind in ("line", "placebo"):
            mk = 1.0 if kind == "line" else mult
            for short in (True, False):
                sgn = 1.0 if short else -1.0
                b2 = vb + sgn * 2 * mk * sv
                out_prev = np.r_[False, (c[:-1] > b2[:-1]) if short else (c[:-1] < b2[:-1])]
                back = (c < b2) if short else (c > b2)
                for t in np.flatnonzero(out_prev & back & np.isfinite(b2)):
                    if t + 1 >= n:
                        continue
                    entry = float(c[t])
                    stop, tp = vb[t] + sgn * 3 * mk * sv, vb[t] + sgn * 1 * mk * sv
                    if not (((stop > entry) and (tp < entry)) if short else ((stop < entry) and (tp > entry))):
                        continue
                    g, how = race_tp(h, l, op, c, t + 1, entry, float(stop), float(tp), short)
                    D.append((ds, kind, short, int(mm_[t]), sv, abs(stop - entry), g, how,
                              *excursions(h, l, t + 1, entry, short, WINS)))
    wc = [f"{a}{w}" for w in list(WINS) + ["eod"] for a in ("mae", "mfe")]
    Adf = pd.DataFrame(A, columns=["date", "k", "short", "minute", "sv"] + wc)
    Bdf = pd.DataFrame(B, columns=["date", "line", "grp", "tau", "kind", "touch_n", "minute", "sig_px", "sv", "z"] + wc
                       + ["g_c1", "how_c1", "rr_c1", "g_c2", "how_c2", "rr_c2"])
    Bdf["n_c1"] = Bdf["g_c1"] - COST_TICKS * tick / (STOP_SIG * Bdf["sig_px"])
    Bdf["n_c2"] = Bdf["g_c2"] - COST_TICKS * tick / (STOP_SIG * Bdf["sig_px"])
    Ddf = pd.DataFrame(D, columns=["date", "kind", "short", "minute", "sv", "R_px", "g", "how"] + wc)
    Ddf["net"] = Ddf["g"] - COST_TICKS * tick / Ddf["R_px"]
    for name, df in (("A", Adf), ("B", Bdf), ("D", Ddf)):
        df.insert(0, "sym", sym)
        df["tick"] = tick
        df.to_parquet(OUT / "touches" / f"{name}_{sym}.parquet")
    return (f"{sym}: tick {tick:g}, sigma_v med {np.median(hist[-250:]):.5g}; A {len(Adf)}, B line "
            f"{int((Bdf.kind == 'line').sum())} (z>=2 {np.mean(Bdf.loc[Bdf.kind == 'line', 'z'] >= 2):.0%}), D {len(Ddf)}")


# ------------------------------------------------------------------------------------------------------------ summary
def qstats(v):
    v = pd.Series(v).dropna()
    return {"n": int(len(v)), "mean": float(v.mean()), "median": float(v.median()),
            "p75": float(v.quantile(.75)), "p90": float(v.quantile(.9))}


def summarise():
    lines = []
    say = lambda s="": (lines.append(s), print(s))
    load = lambda p: pd.concat([pd.read_parquet(f) for f in sorted((OUT / "touches").glob(f"{p}_*.parquet"))],
                               ignore_index=True)
    A, Bt, D = load("A"), load("B"), load("D")
    for df in (A, Bt, D):
        df["date"] = pd.to_datetime(df["date"]); df["yr"] = df["date"].dt.year
    res = {"seed": SEED, "tests": {}}
    wins = [f"{w}" for w in WINS] + ["eod"]

    # ---- A: the indicator's own MFE/MAE, per instrument (ticks) and pooled (sigma_v)
    rows = []
    for (sym, k), g in A.groupby(["sym", "k"]):
        tk = g["tick"].iloc[0]
        for w in wins:
            for a in ("mae", "mfe"):
                rows.append({"sym": sym, "k": k, "window": w, "stat": a, "unit": "ticks", **qstats(g[f"{a}{w}"] / tk)})
    for k, g in A.groupby("k"):
        for w in wins:
            for a in ("mae", "mfe"):
                rows.append({"sym": "ALL", "k": k, "window": w, "stat": a, "unit": "sigma_v", **qstats(g[f"{a}{w}"] / g["sv"])})
    pd.DataFrame(rows).to_csv(OUT / "A_indicator_mfe_mae.csv", index=False)

    # ---- B: staged MAE/MFE at Jordan's lines (line touches)
    Ln = Bt[Bt.kind == "line"]
    rows = []
    for (sym, grp, tau), g in Ln.groupby(["sym", "grp", "tau"]):
        tk = g["tick"].iloc[0]
        for w in wins:
            for a in ("mae", "mfe"):
                rows.append({"sym": sym, "lines": grp, "tau": tau, "window": w, "stat": a, "unit": "ticks",
                             **qstats(g[f"{a}{w}"] / tk)})
    for (grp, tau), g in Ln.groupby(["grp", "tau"]):
        for w in wins:
            for a in ("mae", "mfe"):
                rows.append({"sym": "ALL", "lines": grp, "tau": tau, "window": w, "stat": a, "unit": "line_sigma",
                             **qstats(g[f"{a}{w}"] / g["sig_px"])})
    pd.DataFrame(rows).to_csv(OUT / "B_staged_mae.csv", index=False)
    say(f"B z>=2 share of line touches: {np.mean(Ln['z'] >= 2):.1%}; z median {Ln['z'].median():.2f}")

    # ---- C: fade at the line, TP at a band
    tests = []
    for tag, gcol, ncol, how in (("C1", "g_c1", "n_c1", "how_c1"), ("C2", "g_c2", "n_c2", "how_c2")):
        T = Bt[(Bt["z"] >= 2) & Bt[gcol].notna()]
        ln = T[T.kind == "line"]
        vs = CRC.dboot(T, ncol, against="placebo")
        own = CRC.dboot(ln, ncol)
        hv = {h: (CRC.dboot(T[(T.yr >= a) & (T.yr <= b)], ncol, against="placebo")[0],
                  CRC.dboot(ln[(ln.yr >= a) & (ln.yr <= b)], ncol)[0]) for h, (a, b) in HALVES.items()}
        mir = {grp: CRC.dboot(T[T.grp == grp], ncol, against="placebo")[0] for grp in ("Close±", "HL proj")}
        lo_z = Bt[(Bt["z"] < 2) & Bt[gcol].notna()]
        r = {"trades": len(ln), "net_line": own[0], "net_line_ci": own[1], "gross_line": float(ln[gcol].mean()),
             "line_minus_placebo": vs[0], "ci": vs[1], "p": vs[2], "halves": hv, "mirror": mir,
             "tp_rate": float((ln[how] == "tp").mean()), "tp_dist_R_median": float(ln[f"rr_{tag.lower()}"].median()),
             "z_lt2_net_line": float(lo_z[lo_z.kind == "line"][ncol].mean()), "z_lt2_trades": int((lo_z.kind == "line").sum())}
        bands = pd.cut(T["z"], [2, 2.5, 3, 4, np.inf], right=False)
        r["by_z"] = {str(b): [int((g.kind == "line").sum()), float(g[g.kind == "line"][ncol].mean()),
                              float(g[g.kind == "placebo"][ncol].mean())] for b, g in T.groupby(bands, observed=False)}
        r["by_sym"] = {s: [int(len(g)), float(g[ncol].mean()), float(g[gcol].mean())] for s, g in ln.groupby("sym")}
        res["tests"][tag] = r
        tests.append(tag)
        say(f"{tag}: trades {len(ln)}; TP hit {r['tp_rate']:.1%}; TP distance median {r['tp_dist_R_median']:.2f}R; "
            f"net {own[0]:+.4f} [{own[1][0]:+.4f},{own[1][1]:+.4f}] gross {r['gross_line']:+.4f}; line - placebo "
            f"{vs[0]:+.4f} [{vs[1][0]:+.4f},{vs[1][1]:+.4f}]; halves " + ", ".join(f"{h} {v[0]:+.4f}/{v[1]:+.4f}" for h, v in hv.items())
            + f"; mirror Close± {mir['Close±']:+.4f} HL {mir['HL proj']:+.4f}; z<2 net {r['z_lt2_net_line']:+.4f} (n {r['z_lt2_trades']})")
        say("   by z: " + "; ".join(f"{k} n{v[0]} line {v[1]:+.3f} plc {v[2]:+.3f}" for k, v in r["by_z"].items()))
    # ---- D: re-entry signal
    vs = CRC.dboot(D, "net", against="placebo")
    ln = D[D.kind == "line"]
    own = CRC.dboot(ln, "net")
    hv = {h: (CRC.dboot(D[(D.yr >= a) & (D.yr <= b)], "net", against="placebo")[0],
              CRC.dboot(ln[(ln.yr >= a) & (ln.yr <= b)], "net")[0]) for h, (a, b) in HALVES.items()}
    res["tests"]["D"] = {"trades": len(ln), "net_line": own[0], "net_line_ci": own[1], "gross_line": float(ln["g"].mean()),
                         "line_minus_placebo": vs[0], "ci": vs[1], "p": vs[2], "halves": hv,
                         "tp_rate": float((ln["how"] == "tp").mean()),
                         "by_sym": {s: [int(len(g)), float(g["net"].mean()), float(g["g"].mean())] for s, g in ln.groupby("sym")}}
    tests.append("D")
    say(f"D: trades {len(ln)}; TP hit {res['tests']['D']['tp_rate']:.1%}; net {own[0]:+.4f} [{own[1][0]:+.4f},{own[1][1]:+.4f}] "
        f"gross {ln['g'].mean():+.4f}; real - placebo bands {vs[0]:+.4f} [{vs[1][0]:+.4f},{vs[1][1]:+.4f}]; halves "
        + ", ".join(f"{h} {v[0]:+.4f}/{v[1]:+.4f}" for h, v in hv.items()))
    ps = [res["tests"][k]["p"] for k in tests]
    o = np.argsort(ps); nn = len(ps)
    ok = np.asarray(ps)[o] <= 0.10 * np.arange(1, nn + 1) / nn
    kk = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    passed = np.zeros(nn, bool); passed[o[:kk]] = True
    for k, b in zip(tests, passed):
        r = res["tests"][k]
        good = (r["ci"][0] > 0 and r["net_line_ci"][0] > 0 and b and all(v[0] > 0 and v[1] > 0 for v in r["halves"].values())
                and (k == "D" or all(x > 0 for x in r["mirror"].values())))
        r["bh_pass"], r["verdict"] = bool(b), ("VALIDATED" if good else ("NULL" if r["ci"][1] < 0.02 else "UNDERPOWERED"))
        say(f"{k}: BH {'pass' if b else 'fail'} -> {r['verdict']}")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)
    (OUT / "report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    (OUT / "touches").mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args == ["summarise"]:
        summarise(); return
    J = args or RF.syms()
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=4) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)
    if not args:
        summarise()


if __name__ == "__main__":
    main()
