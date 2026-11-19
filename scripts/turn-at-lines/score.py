"""turn-at-lines (forge/TURN_AT_LINES_PREREG.md): do session highs/lows land AT ladder lines more than at offset
copies of the same lines?

    python scripts/turn-at-lines/score.py     -> analysis/output/turn-at-lines/{results.json, report.txt, turns.parquet}
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
import ladder as L  # noqa: E402
import touches as TT  # noqa: E402
from forge.data_screens import input_hashes  # noqa: E402

OUT = ROOT / "analysis/output/turn-at-lines"
SEED, B, BLOCK = 20261119, 2000, 63
SYMS = ("NQ", "GOLD", "EURUSD")
KS = (0.03, 0.05, 0.10)
OFFS = (0.15, -0.15, 0.30, -0.30)
FAMS = ("EXT", "CLOSE", "PROJ", "ALL")
LOG: list[str] = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


def lines_for(row, arm, o, rl_h, rh_l):
    """Up lines (for the high) and down lines (for the low) per family, in price."""
    g = lambda q, t: float(row[f"{arm}_{q}_{t}"]) / 100
    up = {"EXT": [o * (1 + g("oh", t)) for t in (50, 75, 90)],
          "CLOSE": [o * (1 + g("oc", t)) for t in (50, 75)],
          "PROJ": [rl_h * (1 + g("hl", t)) for t in (50, 75)]}
    dn = {"EXT": [o * (1 - g("ol", t)) for t in (50, 75, 90)],
          "CLOSE": [o * (1 - g("oc", t)) for t in (50, 75)],
          "PROJ": [rh_l * (1 - g("hl", t)) for t in (50, 75)]}
    for d in (up, dn):
        d["ALL"] = d["EXT"] + d["CLOSE"] + d["PROJ"]
    return up, dn


def build(sym, track, arms):
    T = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_{track}.parquet")
    m = L.load_m1(sym, track, "unadj")
    S = TT.session_frames(m, T["date"])
    rows = []
    for _, row in T.iterrows():
        g = S.get(row["date"])
        if g is None or len(g) < 600:
            continue
        o = float(g["open"].iloc[0]); hi, lo = g["high"].to_numpy(), g["low"].to_numpy()
        iH, iL = int(np.argmax(hi)), int(np.argmin(lo))
        H, Lw = float(hi[iH]), float(lo[iL])
        rl_h = float(min(o, lo[:iH].min())) if iH > 0 else o          # running low before the high
        rh_l = float(max(o, hi[:iL].max())) if iL > 0 else o          # running high before the low
        lt = g.index.tz_convert("Europe/London")
        for arm in arms:
            sp = float(row[arm]) / 100 * o
            up, dn = lines_for(row, arm, o, rl_h, rh_l)
            for side, turn, fam_lines, i_t in (("H", H, up, iH), ("L", Lw, dn, iL)):
                rec = {"sym": sym, "track": track, "arm": "chosen" if arm != "A0" else "A0", "date": row["date"],
                       "year": int(row["year"]), "side": side, "early": bool(lt[i_t].hour * 60 + lt[i_t].minute < 15)}
                for fam in FAMS:
                    ln = np.array(fam_lines[fam])
                    dist0 = np.abs(turn - ln).min() / sp
                    rec[f"{fam}_d"] = float(dist0)
                    for k in KS:
                        rec[f"{fam}_hit_{k}"] = float(dist0 <= k)
                        rec[f"{fam}_plc_{k}"] = float(np.mean([np.abs(turn - (ln + d * sp)).min() / sp <= k for d in OFFS]))
                # chance: a random point in the session range, nearest line (ALL), in sigma units
                pts = np.linspace(Lw, H, 201)
                rec["ALL_chance_med"] = float(np.median(np.abs(pts[:, None] - np.array(fam_lines["ALL"])[None, :]).min(1)) / sp)
                rows.append(rec)
    return pd.DataFrame(rows)


def blocks_idx(n, rng):
    nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B, nb))
    return (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B, -1)[:, :n]


def excess_ci(D, fam, k, rng):
    """Pooled excess (pp) and its 90% CI, sessions block-resampled within each instrument."""
    parts = []
    for sym, g in D.groupby("sym"):
        s = g.groupby("date")[[f"{fam}_hit_{k}", f"{fam}_plc_{k}"]].sum()
        n = g.groupby("date").size()
        parts.append((s[f"{fam}_hit_{k}"].to_numpy() - s[f"{fam}_plc_{k}"].to_numpy(), n.to_numpy()))
    num = sum(p[0].sum() for p in parts); den = sum(p[1].sum() for p in parts)
    pt = num / den * 100
    draws = np.zeros(B)
    nums = np.zeros(B); dens = np.zeros(B)
    for x, n in parts:
        BI = blocks_idx(len(x), rng)
        nums += x[BI].sum(1); dens += n[BI].sum(1)
    draws = nums / dens * 100
    return float(pt), [float(np.quantile(draws, .05)), float(np.quantile(draws, .95))], float(np.mean(draws <= 0))


def bh(pvals, q=0.10):
    p = np.array(pvals); o = np.argsort(p); m = len(p)
    thr = q * (np.arange(1, m + 1)) / m
    ok = p[o] <= thr
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(m, bool); res[o[:k]] = True
    return res


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    allD = []
    for sym in SYMS:
        for track in ("C", "F"):
            arm = TT.line_arm(sym, track)
            D = build(sym, track, [arm, "A0"] if track == "C" else [arm])
            say(f"{sym} {track}: chosen arm {arm}; {D['date'].nunique()} sessions, {len(D)} turn rows")
            allD.append(D)
    D = pd.concat(allD, ignore_index=True)
    D.to_parquet(OUT / "turns.parquet")
    C = D[D["track"] == "C"]
    res = {"seed": SEED, "B": B, "block": BLOCK, "tests": {}, "reported": {}}
    tests, pv = [], []
    say("\n== PRIMARY (CFD, pooled NQ+GOLD+EURUSD, k = 0.05): hit at line vs mean of 4 offset copies")
    for arm in ("chosen", "A0"):
        for fam in FAMS:
            X = C[C["arm"] == arm]
            pt, ci, p = excess_ci(X, fam, 0.05, rng)
            halves = {}
            for h, (a, b) in {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}.items():
                Xh = X[(X["year"] >= a) & (X["year"] <= b)]
                e, c = excess_ci(Xh, fam, 0.05, rng)[:2]
                halves[h] = {"excess": e, "ci90": c}
            hit, plc = X[f"{fam}_hit_0.05"].mean() * 100, X[f"{fam}_plc_0.05"].mean() * 100
            tests.append((arm, fam, pt, ci, halves, hit, plc)); pv.append(p)
    rej = bh(pv)
    for (arm, fam, pt, ci, halves, hit, plc), r, p in zip(tests, rej, pv):
        ok = r and ci[0] > 0 and all(v["ci90"][0] > 0 for v in halves.values())
        verdict = "VALIDATED" if ok else ("NULL" if ci[1] < 1.0 else "UNDERPOWERED")
        res["tests"][f"{arm}/{fam}"] = {"hit": hit, "placebo": plc, "excess": pt, "ci90": ci, "p_one_sided": p,
                                        "bh_pass": bool(r), "halves": halves, "verdict": verdict}
        say(f"  {arm:6} {fam:5} hit {hit:5.1f}% vs offsets {plc:5.1f}%  excess {pt:+5.2f}pp [{ci[0]:+.2f},{ci[1]:+.2f}]  "
            f"halves " + " ".join(f"[{v['ci90'][0]:+.2f},{v['ci90'][1]:+.2f}]" for v in halves.values()) +
            f"  BH {'pass' if r else 'no'}  -> {verdict}")
    say("\n== Reported (no rule)")
    for sym in SYMS:
        X = C[(C["arm"] == "chosen") & (C["sym"] == sym)]
        say(f"  {sym:6} chosen, k=0.05: " + "  ".join(
            f"{fam} {X[f'{fam}_hit_0.05'].mean() * 100:.1f}/{X[f'{fam}_plc_0.05'].mean() * 100:.1f}" for fam in FAMS))
    for k in (0.03, 0.10):
        X = C[C["arm"] == "chosen"]
        say(f"  k={k}: " + "  ".join(f"{fam} {excess_ci(X, fam, k, rng)[0]:+.2f}pp" for fam in FAMS))
    X = C[(C["arm"] == "chosen") & ~C["early"]]
    say("  turns after 00:15 only: " + "  ".join(f"{fam} {excess_ci(X, fam, 0.05, rng)[0]:+.2f}pp" for fam in FAMS))
    F = D[D["track"] == "F"]
    say("  futures (chosen lines): " + "  ".join(f"{fam} {excess_ci(F, fam, 0.05, rng)[0]:+.2f}pp" for fam in FAMS))
    X = C[C["arm"] == "chosen"]
    r = X["ALL_d"] / X["ALL_chance_med"]
    say(f"  nearest line (ALL) / chance median, all turns: median {r.median():.2f}; share of turns at <= 1/3 of chance "
        f"{(r <= 1 / 3).mean() * 100:.1f}% (screenshot days: her lines were at ~0.1-0.4 of chance on 6 of 8)")
    res["reported"]["nearest_over_chance_median"] = float(r.median())
    res["reported"]["share_le_third_of_chance"] = float((r <= 1 / 3).mean())
    res["input_sha256"] = input_hashes([f"analysis/output/ladder-v2-{s.lower()}/test_{t}.parquet" for s in SYMS for t in "CF"])
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
