"""gold-line-continuation-explore (EXPLORATORY, not pre-registered; plans/RESEARCH_REGISTER.md).

A. VWAP stretch vs the fade: the system's own trades (line-system-backtest/GOLD/<variant>/trades.json), bucketed by how
   far the entry was from VWAP in sigma_v at the fill. No rule change.
B. Continuation signals at Jordan's 8 lines: every first poke (0.10 x the line's rolling-MAE stop beyond the line) of
   each line in a session. From a decision point, a symmetric race: +1 stop further through the line (continuation)
   vs -1 stop back (both in one bar = loss for continuation; 22:00 = marked to the close). Features known at the
   decision point; the same on shuffled lines (20 same-year permutations of the widths).

    python scripts/gold-line-continuation-explore/run.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/gold-line-continuation-explore"
_sp = importlib.util.spec_from_file_location("ler", ROOT / "scripts/gold-line-system-jordan/entry_rules.py")
ER = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(ER)
S, J = ER.S, ER.J
LEVELS, SHORT_V, IS_END, SEED = S.LEVELS, S.SHORT_V, S.IS_END, S.SEED
COST = 0.10 + 0.10 + 0.12                                   # $ per round trip on a stop / time exit (GC)
lines = []


def say(s=""):
    print(s, flush=True); lines.append(s)


def tab(df, by, val="R", extra=None):
    g = df.groupby(by, observed=True)
    t = pd.DataFrame({"n": g[val].size(), "mean": g[val].mean().round(3), "sum": g[val].sum().round(1)})
    if extra:
        for k, f in extra.items(): t[k] = g.apply(f).round(1)
    return t


# ---------------- A: VWAP stretch on the system's trades ----------------
def part_a():
    say("A. VWAP STRETCH AT THE FILL vs THE FADE (system trades; z = entry distance from VWAP in sigma_v, + = stretched in the fade's favour)")
    bins = [-99, 0.5, 1, 1.5, 2, 2.5, 99]
    labs = ["<0.5 (no target)", "0.5-1", "1-1.5", "1.5-2", "2-2.5", ">2.5"]
    out = {}
    for v in ("fill_any", "ignore_any"):
        T = pd.read_json(ROOT / f"analysis/output/line-system-backtest/GOLD/{v}/trades.json")
        sgn = np.where(T.side == "short", 1, -1)
        T["z"] = sgn * (T.entry - T.vwap) / T.sv
        T["zb"] = pd.cut(T.z, bins, labels=labs)
        T["tgt"] = (T.oc == "target").astype(float) * 100
        T["same"] = T.arm_m == T.fill_m
        for sp in ("IS", "OOS"):
            x = T[T.split == sp]
            t = tab(x, "zb", extra={"target%": lambda g: 100 * (g.oc == "target").mean(),
                                    "stop%": lambda g: 100 * (g.oc == "stop").mean(),
                                    "gross": lambda g: g.gR.mean() * 1,
                                    "same-min%": lambda g: 100 * g.same.mean()})
            say(f"\n  {v} {sp}:\n" + t.to_string())
            out[f"{v}_{sp}"] = t.reset_index().astype({"zb": str}).to_dict("records")
    return out


# ---------------- B: continuation at the pokes ----------------
def race(H, L, C, d, p, s, up, n):
    """+1 stop through (continuation) vs -1 stop back, from price p after bar d. Returns gross R for continuation."""
    a, b = (p + s, p - s) if up else (p - s, p + s)
    for j in range(d + 1, n):
        hit_c = H[j] >= a if up else L[j] <= a
        hit_b = L[j] <= b if up else H[j] >= b
        if hit_b: return -1.0                     # pessimistic: back first if both
        if hit_c: return 1.0
    return float(np.clip(((C[n - 1] - p) if up else (p - C[n - 1])) / s, -1, 1))


def events(sess, stops, floor, hl50, tag):
    """hl50[si] = the HL P50 width (%) used for session si's lines (shuffled with them for fake lines)."""
    rows = []
    for (si, d, O, H, Lo, C, VB, sv, P, sg, o, p90) in sess:
        st = np.where(J.MASK8, S.stop_vec("S2", si, sg, p90, stops, None, floor), np.nan)
        n = len(O)
        rh = np.maximum.accumulate(H); rl = np.minimum.accumulate(Lo)
        for k in np.flatnonzero(np.isfinite(st)):
            s = st[k]; up = bool(SHORT_V[k])              # upper line: continuation = up through it
            lv = P[k]
            hit = np.flatnonzero(H >= lv + 0.10 * s) if up else np.flatnonzero(Lo <= lv - 0.10 * s)
            if not len(hit) or hit[0] < 15 or hit[0] >= n - 2: continue
            j0 = int(hit[0]); L0 = lv[j0]; dr = 1 if up else -1
            beyond = (C[j0] > L0) if up else (C[j0] < L0)
            used = (rh[j0] - rl[j0]) / (o * hl50[si] / 100)
            z = dr * (C[j0] - VB[j0]) / sv if np.isfinite(VB[j0]) else np.nan
            speed = dr * (C[j0] - C[j0 - 15]) / s
            r0 = race(H, Lo, C, j0, C[j0], s, up, n)
            # acceptance: closed beyond, and no retouch of the line for the next 5 bars -> decide at bar j0+5
            acc5 = np.nan
            if beyond and j0 + 6 < n:
                seg_back = (Lo[j0 + 1:j0 + 6] <= L0).any() if up else (H[j0 + 1:j0 + 6] >= L0).any()
                acc5 = 0.0 if seg_back else 1.0
            r5 = race(H, Lo, C, j0 + 5, C[j0 + 5], s, up, n) if acc5 == 1.0 else np.nan
            rows.append(dict(tag=tag, date=d, yr=d.year, level=LEVELS[k], side="upper" if up else "lower", s=s,
                             hr=int(j0 // 60), beyond=bool(beyond), used=used, z=z, speed=speed, R0=r0,
                             acc5=acc5, R5=r5, cost=COST / s))
    return pd.DataFrame(rows)


def part_b():
    W, DV, Dold, tick, nsess, costs, floor, stops, sess = ER.setup()
    E = events(sess, stops, floor, W["hl50"].to_numpy(), "real")
    prng = np.random.default_rng(SEED + 11); yrs = W["date"].dt.year.to_numpy(); F = []
    for p in range(20):
        perm = np.arange(nsess)
        for y in np.unique(yrs):
            m = yrs == y; perm[m] = prng.permutation(perm[m])
        spp = S.R.rolling_stops(S.R.touches(Dold, W, perm), nsess, "usd", wins=["3m"])
        F.append(events(S.prep(DV, W, perm), spp, floor, W["hl50"].to_numpy()[perm], "fake"))
    F = pd.concat(F)
    say("\n\nB. CONTINUATION AT JORDAN'S 8 LINES (first poke per line per session). R = gross R of a 1-stop continuation trade "
        "(+1 through / -1 back, pessimistic), so mean R = 2 x win% - 1. Fake = 20 shuffles of the widths.")
    out = {}
    for lab, D in (("real", E), ("fake", F)):
        D = D.copy()
        D["split"] = np.where(D.yr <= IS_END, "IS", "OOS")
        D["usedb"] = pd.cut(D.used, [0, 0.5, 0.75, 1.0, 9], labels=["<50%", "50-75%", "75-100%", ">100%"])
        D["zb"] = pd.cut(D.z, [-99, 0.5, 1, 1.5, 2, 2.5, 99], labels=["<0.5", "0.5-1", "1-1.5", "1.5-2", "2-2.5", ">2.5"])
        D["spb"] = pd.cut(D.speed, [-99, 0, 1, 2, 99], labels=["toward VWAP / flat", "0-1 stop", "1-2 stops", ">2 stops"])
        D["hb"] = pd.cut(D.hr, [-1, 6, 11, 15, 22], labels=["00-07", "07-12", "12-16", "16-22"])
        for sp in ("IS", "OOS"):
            x = D[D.split == sp]
            say(f"\n  [{lab} {sp}] all pokes: n {len(x)}, continuation mean R {x.R0.mean():+.3f}, net of costs {(x.R0 - x.cost).mean():+.3f}")
            for col, name in (("beyond", "poke candle closed beyond the line"), ("usedb", "day range used / forecast HL P50"),
                              ("zb", "VWAP stretch (sigma_v) at the poke"), ("spb", "approach speed (last 15 min, in stops)"),
                              ("hb", "time of the poke (London)"), ("side", "side")):
                t = tab(x, col, "R0"); say(f"    by {name}:\n" + "\n".join("      " + l for l in t.to_string().splitlines()))
                out[f"{lab}_{sp}_{col}"] = t.reset_index().astype({col: str}).to_dict("records")
            a = x[x.acc5 == 1.0]
            say(f"    ACCEPTED 5 min (closed beyond, no retouch for 5 bars; decide at +5): n {len(a)} of {x.beyond.sum()} closed-beyond, "
                f"mean R {a.R5.mean():+.3f}, net {(a.R5 - a.cost).mean():+.3f}; retouched within 5 bars: {int((x.acc5 == 0).sum())}")
            out[f"{lab}_{sp}_acc5"] = dict(n=int(len(a)), meanR=float(a.R5.mean()), net=float((a.R5 - a.cost).mean()))
    E.to_parquet(OUT / "events_real.parquet"); F.to_parquet(OUT / "events_fake.parquet")
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    res = {"label": "exploratory, not pre-registered", "seed": SEED, "A": part_a(), "B": part_b()}
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=str)
    (OUT / "report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
