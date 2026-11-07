#!/usr/bin/env python3
"""swing-walk-heading: during the days before an expiry, does price head toward the walk's dots?
(forge/SWING_WALK_HEADING_PREREG.md)

  python scripts/swing-walk-heading/score.py build --steps <steps.csv> --m1 data/m1_bidask --closes analysis/output/swing-leg-baserates/daily_m15
      one row per scored step: reached dot / reached mirror, next-day lean, closest approach. Prints only the close check.
  python scripts/swing-walk-heading/score.py count     power from whole-expiry flips (no real dot side used)
  python scripts/swing-walk-heading/score.py run       -> analysis/output/swing-walk-heading/{RESULTS.md, results.json, checks.json}

Steps come from scripts/swing-walk-track/replay.mjs. Read-only on inputs. Seed 20261107.
"""
import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "forge"))
from verdict_gate import decide  # noqa: E402

OUT = os.path.join(ROOT, "analysis", "output", "swing-walk-heading")
ROWS = os.path.join(OUT, "_rows.parquet")
SEED = 20261107
B = 2000
SCORE_FROM, LOCKBOX, HALF = "2020-10-01", "2026-08-21", "2023-09-01"
ANCHORS = ["gammaCentre", "gamma", "strike", "maxPain", "centre"]
NAMES = {"gammaCentre": "gamma centre", "gamma": "gamma best strike", "strike": "strongest strike", "maxPain": "max pain", "centre": "OI centre"}
M1KEY = {"EURUSD": "eurusd", "GBPUSD": "gbpusd", "AUDUSD": "audusd", "USDCAD": "usdcad", "USDCHF": "usdchf", "USDJPY": "usdjpy", "NAS100": "nq", "SPX500": "spx"}
INDICES = {"NAS100", "SPX500"}
MIN = {"touch": 0.05, "next": 0.05}          # 5 percentage points; 0.05 sigma a day
Z95, Z_HOLM1, Z80 = 1.959964, 2.807034, 0.841621


def norm_sf(x):
    return 0.5 * math.erfc(x / math.sqrt(2))


def sessions(m1_dir, key):
    d = pd.read_parquet(os.path.join(m1_dir, f"{M1KEY[key]}_m1.parquet"), columns=["time", "high", "low", "close"])
    t = pd.to_datetime(d["time"]).dt.tz_localize("UTC").dt.tz_convert("America/New_York").dt.tz_localize(None) + pd.Timedelta(hours=7)
    d["date"] = t.dt.normalize()
    d = d.sort_values("time")
    g = d.groupby("date").agg(high=("high", "max"), low=("low", "min"), close=("close", "last"), n=("close", "size"))
    return g[(g["n"] >= 60) & (g.index.dayofweek < 5)]


def stage_build(a):
    st = pd.read_csv(a.steps, dtype={"night": str, "origin": str, "expiry": str})
    st = st[(st["thin_walk"] == 0) & (st["expiry"] >= SCORE_FROM) & (st["expiry"] <= LOCKBOX) & (st["h"] >= 1) & (st["h"] <= 40) & (st["sigma"] > 0)].copy()
    st["g"] = np.log(st["target"] / st["s0"]) / (st["sigma"] * np.sqrt(st["h"]))
    excluded = {x: int((st[st["anchor"] == x]["g"].abs() < 0.1).sum()) for x in ANCHORS}
    total = {x: int((st["anchor"] == x).sum()) for x in ANCHORS}
    st = st[st["g"].abs() >= 0.1]
    parts, checks, missing = [], {}, {}
    for inst, x in st.groupby("inst"):
        s = sessions(a.m1, inst)
        ref = pd.read_csv(os.path.join(a.closes, f"{inst}.csv"), parse_dates=["date"]).set_index("date")["close"]
        j = pd.concat([s["close"], ref], axis=1, keys=["m1", "ref"], join="inner").dropna()
        sig = np.log(ref).diff().rolling(60, min_periods=40).std().reindex(j.index)
        checks[inst] = {"sessions": int(len(j)), "median_abs_close_diff_sigma": float((np.abs(np.log(j["m1"] / j["ref"])) / sig).median())}
        dates = s.index.to_numpy()
        hi, lo, cl = s["high"].to_numpy(float), s["low"].to_numpy(float), s["close"].to_numpy(float)
        rows, miss = [], 0
        for r in x.itertuples(index=False):
            i0 = np.searchsorted(dates, np.datetime64(r.origin), side="right")           # first session after the origin
            i1 = np.searchsorted(dates, np.datetime64(r.expiry), side="right")           # through the expiry
            if i1 <= i0 or dates[i1 - 1] != np.datetime64(r.expiry):
                miss += 1
                continue
            up = r.target > r.s0
            mirror = r.s0 * r.s0 / r.target
            pmax, pmin = hi[i0:i1].max(), lo[i0:i1].min()
            td = pmax >= r.target if up else pmin <= r.target
            tm = pmin <= mirror if up else pmax >= mirror
            gap = abs(math.log(r.target / r.s0))
            toward = math.log(pmax / r.s0) if up else -math.log(pmin / r.s0)
            away = -math.log(pmin / r.s0) if up else math.log(pmax / r.s0)
            y = (1 if up else -1) * math.log(cl[i0] / r.s0) / r.sigma
            rows.append((r.inst, r.origin, r.anchor, r.expiry, r.h, r.g, r.ret20 if r.ret20 == r.ret20 else np.nan, r.sigma, up, td, tm, y,
                         min(1.0, max(0.0, toward / gap)), min(1.0, max(0.0, away / gap))))
        missing[inst] = miss
        parts.append(pd.DataFrame(rows, columns=["inst", "origin", "anchor", "expiry", "h", "g", "ret20", "sigma", "up", "td", "tm", "y", "close_dot", "close_mirror"]))
    d = pd.concat(parts, ignore_index=True)
    os.makedirs(OUT, exist_ok=True)
    d.to_parquet(ROWS)
    bad = {k: v for k, v in checks.items() if not v["median_abs_close_diff_sigma"] < 0.1}
    json.dump({"close_check": checks, "close_check_ok": not bad, "gap_under_0.1": excluded, "steps_before_filter": total, "no_session_on_expiry": missing, "rows": int(len(d))},
              open(os.path.join(OUT, "build.json"), "w"), indent=1)
    print(json.dumps({"close_check": checks, "ok": not bad, "excluded": excluded, "total": total, "missing": missing, "rows": len(d)}, indent=1))
    if bad:
        sys.exit(f"session closes do not match daily_m15: {bad}")


def load():
    d = pd.read_parquet(ROWS)
    d["month_e"] = d["expiry"].str[:7]
    d["month_o"] = d["origin"].str[:7]
    d["d"] = d["td"].astype(float) - d["tm"].astype(float)
    return d


def balanced_boot(df, col, month, rng, b=B):
    """Effect = (mean on dots above + mean on dots below) / 2, percentile CI resampling months."""
    months, inv = np.unique(df[month].to_numpy(), return_inverse=True)
    up = df["up"].to_numpy()
    v = df[col].to_numpy(float)
    M = np.zeros((len(months), 4))
    np.add.at(M[:, 0], inv[up], v[up]); np.add.at(M[:, 1], inv[up], 1)
    np.add.at(M[:, 2], inv[~up], v[~up]); np.add.at(M[:, 3], inv[~up], 1)
    def eff(S):
        return 0.5 * (S[..., 0] / S[..., 1] + S[..., 2] / S[..., 3])
    est = float(eff(M.sum(0)))
    idx = rng.integers(0, len(months), size=(b, len(months)))
    with np.errstate(divide="ignore", invalid="ignore"):
        bb = eff(M[idx].sum(1))
    bb = bb[np.isfinite(bb)]
    lo, hi = np.percentile(bb, [2.5, 97.5])
    se = (hi - lo) / (2 * Z95)
    p = 2 * norm_sf(abs(est) / se) if se > 0 else float("nan")
    return est, float(lo), float(hi), float(se), float(p), len(months)


def flip(df, col, rng):
    """Whole (instrument, expiry) flips: dot and mirror swap, so any real side information goes."""
    keys = df["inst"] + "|" + df["expiry"]
    u, inv = np.unique(keys.to_numpy(), return_inverse=True)
    s = rng.choice([-1.0, 1.0], size=len(u))[inv]
    out = df.assign(**{col: df[col].to_numpy(float) * s})
    return out.assign(up=np.where(s > 0, df["up"].to_numpy(), ~df["up"].to_numpy()))


CELLS = [("touch", "d", "month_e"), ("next", "y", "month_o")]


def stage_count():
    d = load()
    rng = np.random.default_rng(SEED)
    rows = {}
    for a in ANCHORS:
        x = d[d["anchor"] == a]
        for q, col, mon in CELLS:
            _, _, _, se, _, nm = balanced_boot(flip(x, col, rng), col, mon, rng)
            mde = (Z_HOLM1 + Z80) * se
            rows[f"{a}/{q}"] = {"rows": int(len(x)), "months": nm, "control_se": se, "mde": float(mde), "min_effect": MIN[q], "power": "POWERED" if mde <= MIN[q] else "UNDERPOWERED"}
    json.dump({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed": SEED, "power": rows}, open(os.path.join(OUT, "power.json"), "w"), indent=1)
    print(json.dumps(rows, indent=1))


def holm(p):
    p = np.asarray(p, float)
    order = np.argsort(p)
    adj = np.empty(len(p))
    run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (len(p) - r) * p[i]))
        adj[i] = run
    return adj


def bh(p, q=0.10):
    p = np.asarray(p, float)
    order = np.argsort(p)
    k = 0
    for r, i in enumerate(order, 1):
        if p[i] <= q * r / len(p):
            k = r
    out = np.zeros(len(p), bool)
    out[order[:k]] = True
    return out


def plant(x, q, col, size, rng):
    """Add a known effect. touch: turn missed dots into reached ones, on enough rows that the balanced effect rises by `size`."""
    if q == "next":
        return x.assign(**{col: x[col] + size})
    td = x["td"].to_numpy(float).copy()
    up = x["up"].to_numpy()
    for side in (up, ~up):
        idx = np.where(side & (td == 0))[0]
        want = min(len(idx), int(round(size * side.sum())))
        td[rng.choice(idx, size=want, replace=False)] = 1.0
    return x.assign(d=td - x["tm"].astype(float))


def stage_run():
    if not os.path.exists(os.path.join(OUT, "power.json")):
        sys.exit("run `count` first (prereg §5)")
    power = json.load(open(os.path.join(OUT, "power.json")))["power"]
    build = json.load(open(os.path.join(OUT, "build.json")))
    d = load()
    rng = np.random.default_rng(SEED + 1)
    cells, checks = [], {}
    for a in ANCHORS:
        x = d[d["anchor"] == a]
        for q, col, mon in CELLS:
            est, lo, hi, se, p, nm = balanced_boot(x, col, mon, rng)
            h1 = balanced_boot(x[x["expiry"] < HALF], col, mon, rng, 200)[0]
            h2 = balanced_boot(x[x["expiry"] >= HALF], col, mon, rng, 200)[0]
            above = float(x[x["up"]][col].mean()); below = float(x[~x["up"]][col].mean())
            same = (x["ret20"] > 0) == x["up"]
            s1 = balanced_boot(x[same & x["ret20"].notna()], col, mon, rng, 200)[0]
            s2 = balanced_boot(x[~same & x["ret20"].notna()], col, mon, rng, 200)[0]
            # A2: 200 whole-expiry flips; the proof is that 0 sits inside their spread (one draw fails 5% of the time by chance)
            fls = np.array([balanced_boot(flip(x, col, rng), col, mon, rng, 1)[0] for _ in range(200)])
            fl = (float(fls.mean()), float(fls.mean() - Z95 * fls.std()), float(fls.mean() + Z95 * fls.std()))
            pl_big = balanced_boot(plant(x, q, col, 3 * MIN[q], rng), col, mon, rng, 1)[0] - est
            pl_min = balanced_boot(plant(x, q, col, MIN[q], rng), col, mon, rng, 1)[0] - est
            c = {"effect": est, "lo": lo, "hi": hi, "min_effect": MIN[q], "rows": int(len(x)),
                 "diagnostics": {"ok": bool(build["close_check_ok"]) and nm >= 60, "why": "session closes or month count"},
                 "planted_large": {"injected": 3 * MIN[q], "shift": pl_big}, "planted_min": {"injected": MIN[q], "shift": pl_min},
                 "shuffle": {"lo": fl[1], "hi": fl[2]}}
            g = decide(c)
            cells.append({"anchor": a, "name": NAMES[a], "q": q, "n": int(len(x)), "months": nm, "effect": est, "lo": lo, "hi": hi, "p": p, "half1": h1, "half2": h2,
                          "above": above, "below": below, "with_trail": s1, "against_trail": s2, "gate": g["verdict"], "gate_why": g["reasons"], "power": g["power"],
                          "mde": power[f"{a}/{q}"]["mde"], "flip_pct": float((fls < est).mean() * 100), "touch_dot": float(x["td"].mean()), "touch_mirror": float(x["tm"].mean()),
                          "close_dot": float(x["close_dot"].mean()), "close_mirror": float(x["close_mirror"].mean()), "median_gap": float(x["g"].abs().median())})
            checks[f"{a}/{q}"] = {**c, **g}
    padj = holm([c["p"] for c in cells])
    for c, pa in zip(cells, padj):
        c["p_holm"] = float(pa)
        v = c["gate"]
        if v == "VALIDATED" and not (pa < 0.05 and min(c["half1"], c["half2"], c["above"], c["below"], c["with_trail"], c["against_trail"]) > 0):
            v = "CONTEXT"
        if v == "NULL" and c["mde"] > MIN[c["q"]]:
            v = "UNDERPOWERED"                        # prereg §5 / A1: an underpowered-by-design cell never banks as NULL
        c["verdict"] = v
        c["mirror_finding"] = bool(c["hi"] < 0 and c["lo"] < -MIN[c["q"]])

    sl = []
    gapb = [(0.1, 0.5, "0.1-0.5"), (0.5, 1, "0.5-1"), (1, 2, "1-2"), (2, 1e9, ">2")]
    hb = [(1, 2, "1-2"), (3, 5, "3-5"), (6, 10, "6-10"), (11, 20, "11-20"), (21, 40, "21-40")]
    for a in ANCHORS:
        xa = d[d["anchor"] == a]
        cuts = [("sessions left", lab, xa[(xa["h"] >= l) & (xa["h"] <= u)]) for l, u, lab in hb]
        cuts += [("gap (expected moves)", lab, xa[(xa["g"].abs() >= l) & (xa["g"].abs() < u)]) for l, u, lab in gapb]
        cuts += [("instrument", i, xa[xa["inst"] == i]) for i in sorted(xa["inst"].unique())]
        cuts += [("group", "FX", xa[~xa["inst"].isin(INDICES)]), ("group", "indices", xa[xa["inst"].isin(INDICES)])]
        for kind, lab, x in cuts:
            if len(x) < 100 or x["up"].sum() < 20 or (~x["up"]).sum() < 20:
                continue
            for q, col, mon in CELLS:
                est, lo, hi, se, p, nm = balanced_boot(x, col, mon, rng, 500)
                sl.append({"anchor": a, "q": q, "kind": kind, "slice": lab, "n": int(len(x)), "effect": est, "lo": lo, "hi": hi, "p": p,
                           "touch_dot": float(x["td"].mean()), "touch_mirror": float(x["tm"].mean())})
    for c, ok in zip(sl, bh([c["p"] for c in sl])):
        c["bh"] = bool(ok)

    res = {"id": "swing-walk-heading", "prereg": "forge/SWING_WALK_HEADING_PREREG.md", "seed": SEED, "B": B, "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "expiries": [SCORE_FROM, LOCKBOX], "build": build, "cells": cells, "slices": sl, "slices_bh_pass": int(sum(c["bh"] for c in sl))}
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    json.dump(checks, open(os.path.join(OUT, "checks.json"), "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))

    f = lambda v, n=3: f"{v:+.{n}f}"
    pp = lambda v: f"{v * 100:+.1f}pp"
    L = ["# swing-walk-heading: results", "", f"Prereg `forge/SWING_WALK_HEADING_PREREG.md`. Run {res['ranAt'][:10]}. Seed {SEED}, B = {B}. Expiries {SCORE_FROM} to {LOCKBOX}, 1-40 sessions, page-default walk, dots at least 0.1 expected moves from price.", "",
         "## H1: does price reach the dot more often than a level the same distance the other way?", "",
         "| Anchor | Steps | Median gap (exp. moves) | Reached: dot / mirror | Effect, balanced [95% CI] | Holm p | Halves | Above / below | With / against trailing move | Closest approach: dot / mirror | MDE | Verdict |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for c in [x for x in cells if x["q"] == "touch"]:
        L.append(f"| {c['name']} | {c['n']:,} | {c['median_gap']:.2f} | {c['touch_dot'] * 100:.1f}% / {c['touch_mirror'] * 100:.1f}% | {pp(c['effect'])} [{pp(c['lo'])}, {pp(c['hi'])}] | {c['p_holm']:.3f} | {pp(c['half1'])} / {pp(c['half2'])} | {pp(c['above'])} / {pp(c['below'])} | {pp(c['with_trail'])} / {pp(c['against_trail'])} | {c['close_dot'] * 100:.0f}% / {c['close_mirror'] * 100:.0f}% | {c['mde'] * 100:.1f}pp | **{c['verdict']}** |")
    L += ["", "## H2: does the next day lean toward the dot? (σ of a day)", "",
          "| Anchor | Steps | Effect, balanced [95% CI] | Holm p | Halves | Above / below | With / against trailing move | MDE | Verdict |", "|---|---|---|---|---|---|---|---|---|"]
    for c in [x for x in cells if x["q"] == "next"]:
        L.append(f"| {c['name']} | {c['n']:,} | {f(c['effect'])} [{f(c['lo'])}, {f(c['hi'])}] | {c['p_holm']:.3f} | {f(c['half1'])} / {f(c['half2'])} | {f(c['above'])} / {f(c['below'])} | {f(c['with_trail'])} / {f(c['against_trail'])} | {c['mde']:.3f} | **{c['verdict']}** |")
    L += ["", f"## Slices (descriptive, BH q = 0.10): {res['slices_bh_pass']} of {len(sl)} pass; {0.05 * len(sl):.1f} expected by chance at 5%", "",
          "| Anchor | Question | Cut | Slice | Steps | Effect [CI] | Reached dot / mirror | BH |", "|---|---|---|---|---|---|---|---|"]
    for c in sl:
        eff = f"{pp(c['effect'])} [{pp(c['lo'])}, {pp(c['hi'])}]" if c["q"] == "touch" else f"{f(c['effect'])} [{f(c['lo'])}, {f(c['hi'])}]"
        L.append(f"| {NAMES[c['anchor']]} | {c['q']} | {c['kind']} | {c['slice']} | {c['n']:,} | {eff} | {c['touch_dot'] * 100:.0f}% / {c['touch_mirror'] * 100:.0f}% | {'yes' if c['bh'] else ''} |")
    open(os.path.join(OUT, "RESULTS.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:22]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["build", "count", "run"])
    ap.add_argument("--steps")
    ap.add_argument("--m1", default="data/m1_bidask")
    ap.add_argument("--closes", default="analysis/output/swing-leg-baserates/daily_m15")
    a = ap.parse_args()
    {"build": lambda: stage_build(a), "count": stage_count, "run": stage_run}[a.stage]()
