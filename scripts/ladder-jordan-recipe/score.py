"""ladder-jordan-recipe (forge/LADDER_JORDAN_RECIPE_PREREG.md): fast True-Range sigma x textbook constants vs our
QLIKE per-line pick.   python scripts/ladder-jordan-recipe/score.py -> analysis/output/ladder-jordan-recipe/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-wide-race"))
import race as R  # noqa: E402  (ladder-wide-race helpers; imports ladder-qlike-per-line as R.QP)

QP, LINES, SEED = R.QP, R.LINES, 20261123
OUT = ROOT / "analysis/output/ladder-jordan-recipe"
OUT.mkdir(parents=True, exist_ok=True)
C0 = {"hl": 4 * np.log(2), "oh": 1.0, "ol": 1.0}
MULT = {"hl": {50: 1.572, 75: 2.049, 90: 2.50}, "oh": {50: 0.6745, 75: 1.1503, 90: 1.645},
        "ol": {50: 0.6745, 75: 1.1503, 90: 1.645}}
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def j_arms(sym, T):
    D = R.day_table(sym)
    h, l, c = D["high"], D["low"], D["close"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1) / c.shift()
    P = pd.DataFrame(index=D.index)
    for n in (2, 3, 10):
        P[f"J_atr{n}"] = tr.rolling(n, min_periods=n).mean().shift(1)
    for a in (0.15, 0.30, 0.40, 0.50, 0.60):
        P[f"J_ema{int(a * 100)}"] = tr.ewm(alpha=a, adjust=False, min_periods=10).mean().shift(1)
    P = P / 1.596 * 100                                   # daily sigma %
    bb = D[["open", "high", "low", "close"]].reset_index(drop=True)
    yz = pd.Series(R.V.yang_zhang_sigma(bb, 20) / R.V.SQRT252, index=D.index).shift(1)
    Ta = P.reindex(pd.to_datetime(T["date"]))
    return {a: Ta[a].to_numpy(float) for a in P.columns}, yz.reindex(pd.to_datetime(T["date"])).to_numpy(float)


def main():
    rng = np.random.default_rng(SEED)
    LB = pd.read_csv(ROOT / "analysis/output/ladder-wide-race/leaderboard.csv")
    TC, board, hits, picksJ = {}, [], {}, {}
    for sym in QP.SYMS:
        T, old = QP.lines(sym)
        T = T.reset_index(drop=True)
        J, yz = j_arms(sym, T)
        ref = T["E_yz_20"].to_numpy(float)
        m = np.isfinite(ref) & np.isfinite(yz)
        c1 = float(np.mean(np.abs(yz[m] / ref[m] - 1) < 0.01) * 100)
        _, ok = QP.qlike_rows(T, old)
        yrs = T["year"].to_numpy()
        sig = {(a, q): QP.sig(T, a, q).astype(float) for a in old for q in LINES}
        sig.update({(a, q): v for a, v in J.items() for q in LINES})
        Q = {k: R.qlike(T, R.h_series(T, s, k[1], ok), k[1], ok) for k, s in sig.items()}
        for q in LINES:                                   # Part B: as published, textbook constants
            Q[("J_atr3_textbook", q)] = R.qlike(T, C0[q] * J["J_atr3"] ** 2, q, ok)
            Q[("J_atr3_textbook", q)] = np.where(yrs >= 2019, Q[("J_atr3_textbook", q)], np.nan)
        sel_old, sel_j, sel_b = {}, {}, {}
        for q in LINES:
            sel_old[q], _ = R.picks(T, Q, old, ok, q)
            sel_j[q], pj = R.picks(T, Q, list(J), ok, q)
            sel_b[q] = np.where(yrs >= 2020, "J_atr3_textbook", None).astype(object)
            picksJ.setdefault(sym, {})[q] = pj
        test = (yrs >= 2020) & ok
        Qo, _ = QP.qlike_rows(T, old)
        selqp, _ = QP.select(T, old, Qo, ok)
        mine = sum(R.pv(Q, sel_old[q], q, len(T)) for q in LINES)[test].sum()
        theirs = sum(QP.pick_vec(Qo, selqp["QL"][q], q, len(T)) for q in LINES)[test].sum()
        say(f"{sym}: control 1 yz_20 {c1:.1f}%   control 2 OLD vs QL {mine / theirs * 100 - 100:+.3f}%")
        if c1 < 95:
            raise SystemExit("control 1 failed")
        TC[sym] = dict(T=T, Q=Q, keep=test, sel={"OLD": sel_old, "JORDAN": sel_j, "TEXTBOOK": sel_b})
        for a in list(J) + ["J_atr3_textbook"]:
            for q in LINES:
                v = float(np.nanmean(Q[(a, q)][test]))
                g = LB[(LB.sym == sym) & (LB.line == q)]
                board.append(dict(sym=sym, line=q, arm=a, qlike=v, rank_in_wide=int((g.qlike < v).sum() + 1),
                                  of=len(g) + 1, best_wide=g.qlike.min(),
                                  old_pick=float(np.nanmean(R.pv(Q, sel_old[q], q, len(T))[test]))))
        # hit rates: published-style lines vs our QLIKE ladder (x > level), test rows
        hits[sym] = {}
        for q in LINES:
            x = T[q].to_numpy()[test]
            js = {t: float(np.mean(x > MULT[q][t] * J["J_atr3"][test]) * 100) for t in (50, 75, 90)}
            ours = {t: float(np.mean(x > QP.take(T, sel_old[q], f"_{q}_{t}")[test]) * 100) for t in (50, 75, 90)}
            hits[sym][q] = {"jordan_style": js, "ours": ours}

    def pairs(new, by_q=None):
        out = {}
        for s, c in TC.items():
            qs = (by_q,) if by_q else LINES
            nw = sum(R.pv(c["Q"], c["sel"][new][q], q, len(c["T"])) for q in qs)[c["keep"]]
            bs = sum(R.pv(c["Q"], c["sel"]["OLD"][q], q, len(c["T"])) for q in qs)[c["keep"]]
            out[s] = (c["T"]["year"].to_numpy()[c["keep"]], nw, bs)
        return out

    res = {}
    for part, new in (("A", "JORDAN"), ("B", "TEXTBOOK")):
        r = {"all": QP.rel_delta(pairs(new), rng)}
        for hname, yr in QP.HALVES.items():
            r[hname] = QP.rel_delta(pairs(new), rng, yr)
        r["lines"] = {q: QP.rel_delta(pairs(new, q), rng) for q in LINES}
        p = pairs(new)
        r["syms"] = {s: QP.rel_delta({s: p[s]}, rng) for s in QP.SYMS}
        r["verdict"] = ("VALIDATED" if r["all"][1][1] < 0 and all(r[h][1][1] < 0 for h in QP.HALVES)
                        else "NULL" if r["all"][0] >= 0 and r["all"][1][0] > -0.5 else "UNDERPOWERED")
        res[part] = r
        say(f"\n== Part {part}: {new} vs OLD (our QLIKE pick); summed QLIKE % change, negative = Jordan-style better")
        for k in ("all", *QP.HALVES):
            say(f"  {k:8s} {r[k][0]:+.2f}% [{r[k][1][0]:+.2f}, {r[k][1][1]:+.2f}]")
        for k, (pt, ci) in r["lines"].items():
            say(f"  line {k:3s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
        for k, (pt, ci) in r["syms"].items():
            say(f"  {k:7s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]")
        say(f"  VERDICT {part}: {r['verdict']}")
    B = pd.DataFrame(board)
    B.to_csv(OUT / "board.csv", index=False)
    say("\n== Jordan-style arms: out-of-sample QLIKE, rank inside the ladder-wide-race field")
    for (s, q), g in B.groupby(["sym", "line"], sort=False):
        g = g.sort_values("qlike")
        say(f"  {s:7s} {q}: our pick {g.old_pick.iloc[0]:.4f}, best of wide {g.best_wide.iloc[0]:.4f} | "
            + "  ".join(f"{r.arm.replace('J_', '')} {r.qlike:.4f} (#{r.rank_in_wide}/{r.of})" for r in g.itertuples()))
    say("\n== Hit rates, % of sessions beyond the line (targets p50 50, p75 25, p90 10)")
    for s, d in hits.items():
        for q, v in d.items():
            js, ou = v["jordan_style"], v["ours"]
            say(f"  {s:7s} {q}: Jordan-style {js[50]:.0f}/{js[75]:.0f}/{js[90]:.0f}   ours {ou[50]:.0f}/{ou[75]:.0f}/{ou[90]:.0f}")
    say("\n== Jordan-style walk-forward picks")
    for s, d in picksJ.items():
        say(f"  {s}: " + "  ".join(f"{q} " + ",".join(sorted(set(v.values()))) for q, v in d.items()))
    (OUT / "results.json").write_text(json.dumps(dict(seed=SEED, parts=res, hits=hits, picks=picksJ), indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG), encoding="utf-8")


if __name__ == "__main__":
    main()
