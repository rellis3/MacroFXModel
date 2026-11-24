"""ladder-close-split (forge/LADDER_CLOSE_SPLIT_PREREG.md): Close+ and Close- as separate lines, each with its own
walk-forward QLIKE model pick and its own multipliers, vs the current symmetric OC line.
    python scripts/ladder-close-split/score.py -> analysis/output/ladder-close-split/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-wide-race"))
import race as R  # noqa: E402

QP, SEED = R.QP, 20261124
L = sys.modules["ladder"]
OUT = ROOT / "analysis/output/ladder-close-split"
OUT.mkdir(parents=True, exist_ok=True)
TAUS = (50, 75, 90)
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True)
    LOG.append(str(s))


def signed_oc(sym):
    m = L.load_m1(sym, "F", "unadj")
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    o, c, n = g["open"].first(), g["close"].last(), g.size()
    s = ((c - o) / o * 100)[(n >= 600) & (n.index <= L.LOCK)]
    return s


def side_levels(T, sig, x, side_mask, yrs):
    """Walk-forward empirical quantiles of x/sigma on the side's sessions in years < Y."""
    out = {t: np.full(len(T), np.nan) for t in TAUS}
    r = x / sig
    for Y in range(2019, 2027):
        tr = side_mask & (yrs >= 2016) & (yrs < Y) & np.isfinite(r)
        te = yrs == Y
        if tr.sum() < 100 or not te.any():
            continue
        for t in TAUS:
            out[t][te] = np.quantile(r[tr], t / 100) * sig[te]
    return out


def main():
    rng = np.random.default_rng(SEED)
    E, hits, picks_rep, mults, ql_rep = {}, {}, {}, {}, {}
    for sym in QP.SYMS:
        T, old = QP.lines(sym)
        T = T.reset_index(drop=True)
        so = signed_oc(sym).reindex(pd.to_datetime(T["date"])).to_numpy(float)
        ref = T["oc"].to_numpy(float)
        m = np.isfinite(so) & np.isfinite(ref)
        c1 = float(np.mean(np.abs(np.abs(so[m]) - ref[m]) < 1e-6) * 100)
        up, dn, flat = so > 0, so < 0, so == 0
        c2 = int(up.sum() + dn.sum() + flat.sum()) == int(np.isfinite(so).sum())
        say(f"{sym}: control 1 |signed OC| == build oc on {c1:.2f}%  control 2 {'ok' if c2 else 'FAIL'}  "
            f"up {up.sum()} down {dn.sum()} flat {flat.sum()}")
        if c1 < 99 or not c2:
            raise SystemExit("control failed")
        _, ok = QP.qlike_rows(T, old)
        yrs = T["year"].to_numpy()
        new, _, _ = R.build_arms(sym, T)
        sig = {a: QP.sig(T, a, "oc").astype(float) for a in old}
        sig.update({a: v for (a, q), v in new.items() if q == "hl" and not a.startswith("W_dir")})
        T["cup"] = np.where(up, so, np.nan)
        T["cdn"] = np.where(dn, -so, np.nan)
        # CURRENT: symmetric OC line (walk-forward QLIKE pick on |OC| from the old field) and its ladder levels
        okc = ok & (T["oc"].to_numpy() > 0)
        Qoc = {(a, "oc"): R.qlike(T, R.h_series(T, sig[a], "oc", okc), "oc", okc) for a in old}
        sel_cur, pk_cur = R.picks(T, Qoc, old, okc, "oc")
        cur = {t: QP.take(T, sel_cur, f"_oc_{t}") for t in TAUS}
        E[sym], hits[sym], picks_rep[sym], mults[sym], ql_rep[sym] = {}, {}, {"current": pk_cur}, {}, {}
        for side, mask in (("cup", up & ok), ("cdn", dn & ok)):
            x = T[side].to_numpy(float)
            Q = {(a, side): R.qlike(T, R.h_series(T, s, side, mask), side, mask) for a, s in sig.items()}
            for field, pool in (("SPLIT", list(sig)), ("SPLIT_OLD", old)):
                sel, pk = R.picks(T, Q, pool, mask, side)
                picks_rep[sym][f"{field}_{side}"] = pk
                sg = np.full(len(T), np.nan)
                for a in set(v for v in sel if v is not None):
                    w = sel == a
                    sg[w] = sig[a][w]
                lv = {t: np.full(len(T), np.nan) for t in TAUS}
                for a in set(v for v in sel if v is not None):     # multipliers from the picked arm's own history
                    lva = side_levels(T, sig[a], x, mask, yrs)
                    w = sel == a
                    for t in TAUS:
                        lv[t][w] = lva[t][w]
                E[sym].setdefault(field, {})[side] = lv
                ql_rep[sym][f"{field}_{side}"] = float(np.nanmean(R.pv(Q, sel, side, len(T))[(yrs >= 2020) & mask]))
            E[sym].setdefault("CURRENT", {})[side] = cur
            E[sym].setdefault("_x", {})[side] = x
            E[sym].setdefault("_mask", {})[side] = mask & (yrs >= 2020)
            # multiplier asymmetry: p50 multiplier of the SPLIT pick in 2026 (level / sigma)
        E[sym]["_yrs"] = yrs
        for field in ("SPLIT", "SPLIT_OLD", "CURRENT"):
            hits[sym][field] = {}
            for side in ("cup", "cdn"):
                mk = E[sym]["_mask"][side]
                x = E[sym]["_x"][side]
                lvl = E[sym][field][side]
                mk2 = mk & np.isfinite(lvl[50])
                hits[sym][field][side] = {t: float(np.mean(x[mk2] > lvl[t][mk2]) * 100) for t in TAUS}
                hits[sym][field][side]["mean_p50"] = float(np.mean(lvl[50][mk2]))
                hits[sym][field][side]["mean_actual"] = float(np.mean(x[mk2]))

    def errs(sym, field):
        e = E[sym]
        yrs, x_up, x_dn = e["_yrs"], e["_x"]["cup"], e["_x"]["cdn"]
        mu, md = e["_mask"]["cup"], e["_mask"]["cdn"]
        good = (mu | md)
        for f in ("SPLIT", "SPLIT_OLD", "CURRENT"):
            good &= np.where(mu, np.isfinite(e[f]["cup"][50]), np.isfinite(e[f]["cdn"][50]))
        err = np.where(mu, np.abs(e[field]["cup"][50] - x_up), np.abs(e[field]["cdn"][50] - x_dn))
        return yrs[good], err[good], good

    res = {}
    for field in ("SPLIT", "SPLIT_OLD"):
        def pairs(side=None):
            out = {}
            for s in QP.SYMS:
                y, a, g = errs(s, field)
                _, b, _ = errs(s, "CURRENT")
                if side:
                    k = E[s]["_mask"][side][g]
                    y, a, b = y[k], a[k], b[k]
                out[s] = (y, a, b)
            return out
        r = {"all": QP.rel_delta(pairs(), rng)}
        for h, yr in QP.HALVES.items():
            r[h] = QP.rel_delta(pairs(), rng, yr)
        r["cup"], r["cdn"] = QP.rel_delta(pairs("cup"), rng), QP.rel_delta(pairs("cdn"), rng)
        p = pairs()
        r["syms"] = {s: QP.rel_delta({s: p[s]}, rng) for s in QP.SYMS}
        res[field] = r
    v = res["SPLIT"]
    verdict = ("VALIDATED" if v["all"][1][1] < 0 and all(v[h][1][1] < 0 for h in QP.HALVES)
               else "NULL" if v["all"][1][0] > -0.5 else "UNDERPOWERED")
    for field, r in res.items():
        say(f"\n== {field} vs CURRENT symmetric OC: total abs error of p50 vs actual close (negative = split nearer)")
        for k in ("all", *QP.HALVES, "cup", "cdn"):
            say(f"  {k:8s} {r[k][0]:+.2f}% [{r[k][1][0]:+.2f}, {r[k][1][1]:+.2f}]")
        say("  " + "  ".join(f"{s} {pt:+.1f}% [{ci[0]:+.1f},{ci[1]:+.1f}]" for s, (pt, ci) in r["syms"].items()))
    say(f"\nVERDICT: {verdict}")
    say("\n== Hit rates on each side's own days (beyond p50 / p75 / p90; targets 50/25/10), mean p50 line vs mean actual")
    for s in QP.SYMS:
        for side in ("cup", "cdn"):
            say(f"  {s:7s} {'Close+' if side == 'cup' else 'Close-'}: " + "  |  ".join(
                f"{f} {h[side][50]:.0f}/{h[side][75]:.0f}/{h[side][90]:.0f} p50 {h[side]['mean_p50']:.3f} vs {h[side]['mean_actual']:.3f}"
                for f, h in hits[s].items()))
    say("\n== QLIKE per side (2020-2026.08, own c)")
    for s, d in ql_rep.items():
        say(f"  {s:7s} " + "  ".join(f"{k} {v:.4f}" for k, v in d.items()))
    say("\n== Picks by year")
    for s, d in picks_rep.items():
        for k, pk in d.items():
            say(f"  {s:7s} {k:14s} " + " ".join(f"{Y}:{a}" for Y, a in sorted(pk.items())))
    (OUT / "results.json").write_text(json.dumps(dict(seed=SEED, verdict=verdict, deltas=res, hits=hits,
                                                      qlike=ql_rep, picks=picks_rep), indent=1, default=str))
    (OUT / "report.txt").write_text("\n".join(LOG), encoding="utf-8")


if __name__ == "__main__":
    main()
