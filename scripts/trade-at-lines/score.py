"""trade-at-lines (forge/TRADE_AT_LINES_PREREG.md): fade / follow rules at the v2 lines, filled on OANDA bid/ask M1.

    python scripts/trade-at-lines/score.py     -> analysis/output/trade-at-lines/{results.json, report.txt, trades.parquet}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
sys.path.insert(0, str(ROOT / "scripts/exhaustion-v2"))
import touches as TT  # noqa: E402
import export_exhaustion as XE  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

OUT = ROOT / "analysis/output/trade-at-lines"
SEED, B, BLOCK = 20261119, 2000, 63
SYMS = {"NQ": "nq", "GOLD": "gold", "EURUSD": "eurusd"}
RULES = ("FADE-L", "FADE-Z", "FOLLOW")
RUNGS = (50, 75, 90)
POS = (0.0, 0.15, -0.15, 0.30, -0.30)
TICK = 1e-5
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(s)


def sessions(key):
    d = pd.read_parquet(ROOT / f"data/m1_bidask/{key}_m1.parquet")
    d.index = pd.to_datetime(d.pop("time")).dt.tz_localize("UTC")
    d = d[~d.index.duplicated()].sort_index()
    lt = d.index.tz_convert("Europe/London")
    d = d[(lt.hour < 22) & (lt.dayofweek < 5)]
    dd = d.index.tz_convert("Europe/London").tz_localize(None).normalize()
    return {k: g for k, g in d.groupby(dd)}


def first(mask, start=0):
    idx = np.flatnonzero(mask[start:])
    return int(idx[0]) + start if len(idx) else None


def sim(rule, up, L, sO, z50, z75, nxt, A, mid=False):
    """One trade. up = the line is above the open (OH). Returns (netR, touch_index) or None if not triggered."""
    mh, ml = A["high"], A["low"]
    bh, bl, bc, bo = (A["high"], A["low"], A["close"], A["open"]) if mid else (A["bid_h"], A["bid_l"], A["bid_c"], A["bid_o"])
    ah, al, ac, ao = (A["high"], A["low"], A["close"], A["open"]) if mid else (A["ask_h"], A["ask_l"], A["ask_c"], A["ask_o"])
    t0 = first(mh >= L) if up else first(ml <= L)
    if t0 is None:
        return None
    out = 1.0 if up else -1.0                                       # direction "past the line", away from the open
    if rule == "FOLLOW":
        short = not up                                              # follow = trade in the direction of the break
        k = t0
        entry = bc[k] if short else ac[k]
        stop = entry + out * -0.25 * sO
        target = L + out * nxt
    else:
        short = up                                                  # fade = trade back toward the open
        lim = L if rule == "FADE-L" else L + out * z50 * sO
        if short:
            k = first(bh >= lim * (1 + TICK), t0)
        else:
            k = first(al <= lim * (1 - TICK), t0)
        if k is None:
            return None
        entry = lim
        stop = L + out * ((z75 + 0.05) if rule == "FADE-L" else (z75 + 0.10)) * sO
        target = L - out * z75 * sO if rule == "FADE-L" else L
    R = abs(entry - stop)
    if R <= 0:
        return None
    j0 = k + 1
    n = len(mh)
    if j0 >= n:
        ex = (ac[-1] if short else bc[-1])
    else:
        if short:                                                   # buy back at the ask
            js, jt = first(ah >= stop, j0), first(al <= target, j0)
            if js is not None and (jt is None or js <= jt):
                ex = max(stop, ao[js])
            elif jt is not None:
                ex = min(target, ao[jt]) if ao[jt] < target else target
            else:
                ex = ac[-1]
        else:                                                       # sell out at the bid
            js, jt = first(bl <= stop, j0), first(bh >= target, j0)
            if js is not None and (jt is None or js <= jt):
                ex = min(stop, bo[js])
            elif jt is not None:
                ex = max(target, bo[jt]) if bo[jt] > target else target
            else:
                ex = bc[-1]
    pnl = (entry - ex) if short else (ex - entry)
    return pnl / R, t0


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    odds, zs = XE.odds_tables(), XE.zone_sigma()
    rows = []
    for sym, key in SYMS.items():
        arm = TT.line_arm(sym, "C")
        T = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_C.parquet")
        S = sessions(key)
        z50, z75 = zs[sym]
        n_s = 0
        for _, row in T.iterrows():
            g = S.get(row["date"])
            if g is None or len(g) < 600:
                continue
            n_s += 1
            A = {c: g[c].to_numpy(float) for c in ("open", "high", "low", "close", "bid_o", "bid_h", "bid_l", "bid_c",
                                                     "ask_o", "ask_h", "ask_l", "ask_c")}
            o = A["open"][0]
            sO = float(row[arm]) / 100 * o
            lt = g.index.tz_convert("Europe/London")
            mins = np.asarray(lt.hour * 60 + lt.minute)
            for up, q in ((True, "oh"), (False, "ol")):
                for t in RUNGS:
                    pct = float(row[f"{arm}_{q}_{t}"]) / 100
                    nxt = (float(row[f"{arm}_{q}_{ {50: 75, 75: 90}[t]}"]) / 100 - pct) * o if t < 90 else 0.25 * sO
                    for pos in POS:
                        L = o * (1 + pct) + pos * sO if up else o * (1 - pct) - pos * sO
                        for rule in RULES:
                            r = sim(rule, up, L, sO, z50, z75, nxt, A)
                            if r is None:
                                continue
                            g_ = sim(rule, up, L, sO, z50, z75, nxt, A, mid=True)
                            b = int(np.searchsorted([420, 720, 960], mins[r[1]], side="right"))
                            rows.append({"sym": sym, "date": row["date"], "year": int(row["year"]), "rule": rule, "rung": t,
                                         "side": "OH" if up else "OL", "pos": pos, "bucket": b, "odds": odds[(sym, t, b)],
                                         "netR": r[0], "grossR": g_[0] if g_ else np.nan})
        say(f"{sym}: arm {arm}; {n_s} sessions with bid/ask")
    X = pd.DataFrame(rows)
    X.to_parquet(OUT / "trades.parquet")
    X["odds_ok"] = np.where(X["rule"] == "FOLLOW", X["odds"] >= 55, X["odds"] <= 35)
    res = {"seed": SEED, "B": B, "cells": {}}
    say("\n== cells (pooled NQ+GOLD+EURUSD; net R on bid/ask; placebo = same rule at the line moved +/-0.15, 0.30 sigma)")
    tests, pv = [], []
    for rule in RULES:
        for t in RUNGS:
            for var in ("ALL", "ODDS"):
                Z = X[(X["rule"] == rule) & (X["rung"] == t)]
                if var == "ODDS":
                    Z = Z[Z["odds_ok"]]
                real, plc = Z[Z["pos"] == 0], Z[Z["pos"] != 0]
                st = boot(real, plc, rng)
                halves = {h: boot(real[(real["year"] >= a) & (real["year"] <= b_)], plc[(plc["year"] >= a) & (plc["year"] <= b_)], rng)
                          for h, (a, b_) in {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}.items()}
                tests.append((rule, t, var, st, halves, len(real), real["grossR"].mean(), (real["netR"] > 0).mean() * 100))
                pv.append(st["p"])
    p = np.array(pv); o_ = np.argsort(p); m = len(p)
    okb = p[o_] <= 0.10 * np.arange(1, m + 1) / m
    kmax = np.max(np.where(okb)[0]) + 1 if okb.any() else 0
    rej = np.zeros(m, bool); rej[o_[:kmax]] = True
    all_net = {(r_, t_): st_["mean"] for (r_, t_, v_, st_, *_x) in tests if v_ == "ALL"}
    for (rule, t, var, st, halves, n, gross, win), r in zip(tests, rej):
        ok = (r and st["ci"][0] > 0 and all(h["ci"][0] > 0 for h in halves.values()) and st["dci"][0] > 0)
        if ok and var == "ODDS" and all_net[(rule, t)] <= 0:
            verdict = "CONTEXT (in-sample filter only)"
        else:
            verdict = "VALIDATED" if ok else ("NULL" if st["ci"][1] < 0.05 else "UNDERPOWERED")
        res["cells"][f"{rule}/p{t}/{var}"] = {"n": n, "net_mean": st["mean"], "net_ci90": st["ci"], "gross_mean": gross,
                                               "win_rate": win, "minus_placebo": st["d"], "minus_placebo_ci90": st["dci"],
                                               "halves": {h: {"mean": v["mean"], "ci90": v["ci"]} for h, v in halves.items()},
                                               "bh_pass": bool(r), "verdict": verdict}
        say(f"  {rule:7} p{t} {var:4} n={n:5}  net {st['mean']:+.3f}R [{st['ci'][0]:+.3f},{st['ci'][1]:+.3f}]  gross {gross:+.3f}R  "
            f"win {win:4.1f}%  vs placebo {st['d']:+.3f}R [{st['dci'][0]:+.3f},{st['dci'][1]:+.3f}]  -> {verdict}")
    say("\n== per instrument (ALL variant, net R)")
    for sym in SYMS:
        Z = X[(X["sym"] == sym) & (X["pos"] == 0)]
        say(f"  {sym:6} " + "  ".join(f"{r_} " + "/".join(f"{Z[(Z['rule'] == r_) & (Z['rung'] == t_)]['netR'].mean():+.2f}" for t_ in RUNGS) for r_ in RULES))
    res["input_sha256"] = input_hashes([f"analysis/output/ladder-v2-{s.lower()}/test_C.parquet" for s in SYMS] +
                                       [f"data/m1_bidask/{k}_m1.parquet" for k in SYMS.values()])
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


def blocks_idx(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def boot(real, plc, rng):
    """Mean net R (real), real minus placebo, with session-block CIs within instrument."""
    acc = np.zeros((B, 4)); tot = np.zeros(4)
    for sym in SYMS:
        r, p = real[real["sym"] == sym], plc[plc["sym"] == sym]
        dates = sorted(set(r["date"]) | set(p["date"]))
        if not dates:
            continue
        ix = {d: i for i, d in enumerate(dates)}
        arr = np.zeros((len(dates), 4))
        for k, (h, c) in enumerate(((r, "s"), (r, "n"), (p, "s"), (p, "n"))):
            s = h.groupby("date")["netR"].sum() if c == "s" else h.groupby("date").size()
            arr[[ix[d] for d in s.index], k] = s.to_numpy()
        tot += arr.sum(0)
        BI = blocks_idx(len(arr), rng)
        acc += arr[BI].sum(1)
    mean = tot[0] / max(tot[1], 1); pm = tot[2] / max(tot[3], 1)
    m_b = acc[:, 0] / np.maximum(acc[:, 1], 1); p_b = acc[:, 2] / np.maximum(acc[:, 3], 1)
    return {"mean": float(mean), "ci": [float(np.quantile(m_b, .05)), float(np.quantile(m_b, .95))],
            "d": float(mean - pm), "dci": [float(np.quantile(m_b - p_b, .05)), float(np.quantile(m_b - p_b, .95))],
            "p": float(np.mean(m_b <= 0))}


if __name__ == "__main__":
    main()
