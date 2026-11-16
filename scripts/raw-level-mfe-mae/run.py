"""raw-level-mfe-mae — exploratory, not pre-registered (owner 2026-11-15).

For every first touch of every raw line, measure from the touch to the session close (22:00 London):
  MFE  furthest price went in the trade's favour       MAE  furthest it went against
for a FADE (short an upper line, long a lower one); a FOLLOW is the mirror (its MFE = the fade's MAE).
Then price every stop x target pair on the real path: first of target / stop on 15-minute closes, else
mark to market at the close (kept, never dropped). Targets fill at the target (limit). Stops are priced
two ways, because 15-minute closes can't settle it: model 0 'kind' fills a stop at the stop (ignores how far the
close went through it); model 1 'harsh' fills it at the 15-minute close that breached it. Truth lies between;
read only what holds under both, and read it against the placebo, which is priced the same way. Same for a placebo: the same trade at the same bar
index in a random other session of the same instrument within +/-60 sessions (10 draws).

Lines: EXT/HL/OC p50/p75/p90 exactly as scripts/raw-level-revert-continue/run.py (trailing 250 sessions,
min 120, sessions < i only), plus PRIOR: previous session's high (upper) and low (lower), used only when
today's open is inside yesterday's range.
Unit U = trailing-250 median session HL (% of open) for that instrument: "one typical day's range".
Costs: one median OANDA spread per round trip by instrument and year (same table as the parent study).
Data: 15-minute closes 2018 -> 2026-08-21 (lockbox respected), scored from 2019-01.

Run: python -I scripts/raw-level-mfe-mae/run.py   (about a minute)
Out: analysis/output/raw-level-mfe-mae/{touches.parquet, grid_real.npy, grid_placebo.npy, meta.json}
"""
import json, os, sys
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location(
    "rlrc_run", os.path.join(ROOT, "scripts", "raw-level-revert-continue", "run.py"))
parent = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(parent)  # sessions(), cost_frac(), INSTR

OUT = os.path.join(ROOT, "analysis/output/raw-level-mfe-mae")
SEED = 20261115
N_PLACEBO = 10
STOPS = np.array([0.05, 0.10, 0.15, 0.20, 0.30, 0.40])
TARGETS = np.array([0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.60])
QS = parent.QS


def excursions(path, j, sg):
    """Fade-direction favourable / adverse running maxima after bar j (fractions of entry)."""
    e = path[j]
    fav = -sg * (path[j + 1:] / e - 1)
    return np.maximum.accumulate(np.maximum(fav, 0)), np.maximum.accumulate(np.maximum(-fav, 0)), fav


def grid(cf, ca, last, U):
    """Outcome (in U) of every stop x target pair for fade (index 0) and follow (index 1)."""
    out = np.empty((2, 2, len(STOPS), len(TARGETS)), np.float32)  # model x dir x stop x target
    n = len(cf)
    tgt_f = np.searchsorted(cf, TARGETS * U, "left")  # first bar the fade target is reached
    stp_f = np.searchsorted(ca, STOPS * U, "left")    # first bar the fade stop is reached
    tgt_w = np.searchsorted(ca, TARGETS * U, "left")  # follow: the fade's adverse side is its favour
    stp_w = np.searchsorted(cf, STOPS * U, "left")
    for a, (tg, st, mtm, adv) in enumerate(((tgt_f, stp_f, last, ca), (tgt_w, stp_w, -last, cf))):
        T = tg[None, :]; S = st[:, None]
        # target = resting limit, fills at the target; stop = market, fills at the 15-minute close that
        # breached it (the running max of the adverse side at that bar = that bar's adverse move)
        harsh = -adv[np.minimum(st, n - 1)][:, None] / U
        for mdl, stop_fill in enumerate((-np.asarray(STOPS)[:, None], harsh)):
            out[mdl, a] = np.where((T < S) & (T < n), TARGETS[None, :],
                                   np.where((S <= T) & (S < n), stop_fill, mtm / U))
    return out


def main():
    rng = np.random.default_rng(SEED)
    recs, G, P = [], [], []
    for file, (lab, klass, ckey) in parent.INSTR.items():
        S = parent.sessions(file)
        dates = [x[0] for x in S]
        o = np.array([x[1][0] for x in S])
        hi = np.array([x[1].max() for x in S]); lo = np.array([x[1].min() for x in S])
        cl = np.array([x[1][-1] for x in S])
        OH, OL, HL, OC = hi / o - 1, 1 - lo / o, (hi - lo) / o, np.abs(cl / o - 1)
        U_all = np.full(len(S), np.nan)
        for i in range(parent.MIN_HIST, len(S)):
            U_all[i] = np.median(HL[max(0, i - parent.LOOKBACK):i])
        scored = [i for i in range(len(S)) if dates[i] >= parent.SCORE_FROM and i >= parent.MIN_HIST]
        n0 = len(recs)
        for i in scored:
            a = max(0, i - parent.LOOKBACK)
            d, path, hrs = S[i]
            op, U = path[0], U_all[i]
            lines = []
            fams = {
                "EXT": ([np.percentile(OH[a:i], q) for q in QS], [np.percentile(OL[a:i], q) for q in QS]),
                "HL": ([np.percentile(HL[a:i], q) / 2 for q in QS],) * 2,
                "OC": ([np.percentile(OC[a:i], q) for q in QS],) * 2,
            }
            for fam, (ups, dns) in fams.items():
                for k, q in enumerate(QS):
                    lines.append((fam, f"p{q}", 1, op * (1 + ups[k])))
                    lines.append((fam, f"p{q}", -1, op * (1 - dns[k])))
            if lo[i - 1] < op < hi[i - 1]:
                lines.append(("PRIOR", "PDH", 1, hi[i - 1]))
                lines.append(("PRIOR", "PDL", -1, lo[i - 1]))
            for fam, rung, sg, L in lines:
                hit = np.nonzero(path[1:] >= L)[0] if sg > 0 else np.nonzero(path[1:] <= L)[0]
                if not len(hit):
                    continue
                j = hit[0] + 1
                if j >= len(path) - 1:
                    continue  # touched on the last bar: no path left to measure
                cf, ca, fav = excursions(path, j, sg)
                g = grid(cf, ca, fav[-1], U)
                # placebo
                pg, pmfe, pmae = [], [], []
                lo_i, hi_i = max(parent.MIN_HIST, i - parent.PLACEBO_WIN), min(len(S) - 1, i + parent.PLACEBO_WIN)
                tries = 0
                while len(pg) < N_PLACEBO and tries < N_PLACEBO * 5:
                    tries += 1
                    m = int(rng.integers(lo_i, hi_i + 1))
                    pp = S[m][1]
                    if m == i or j >= len(pp) - 1:
                        continue
                    pcf, pca, pfav = excursions(pp, j, sg)
                    Um = U_all[m]
                    pg.append(grid(pcf, pca, pfav[-1], Um))
                    pmfe.append(pcf[-1] / Um); pmae.append(pca[-1] / Um)
                if not pg:
                    continue
                k_mfe = int(np.argmax(cf >= cf[-1]))  # first bar the final MFE was reached
                recs.append(dict(
                    inst=lab, klass=klass, date=d.strftime("%Y-%m-%d"), year=d.year, fam=fam, rung=rung,
                    side="up" if sg > 0 else "dn", touch_hr=float(hrs[j]), U=float(U), entry=float(path[j]),
                    cost_U=float(parent.cost_frac(ckey, d.year, path[j]) / U),
                    mfe=float(cf[-1] / U), mae=float(ca[-1] / U), close=float(fav[-1] / U),
                    mae_before_mfe=float(ca[k_mfe] / U), bars_to_mfe=k_mfe + 1, bars_left=len(cf),
                    pl_mfe=float(np.mean(pmfe)), pl_mae=float(np.mean(pmae)),
                ))
                G.append(g); P.append(np.mean(pg, axis=0))
        print(lab, len(recs) - n0, "touches", file=sys.stderr)
    os.makedirs(OUT, exist_ok=True)
    pd.DataFrame(recs).to_parquet(os.path.join(OUT, "touches.parquet"))
    np.save(os.path.join(OUT, "grid_real.npy"), np.array(G, np.float32))
    np.save(os.path.join(OUT, "grid_placebo.npy"), np.array(P, np.float32))
    json.dump({"seed": SEED, "stops_U": STOPS.tolist(), "targets_U": TARGETS.tolist(), "n_placebo": N_PLACEBO,
               "n": len(recs)}, open(os.path.join(OUT, "meta.json"), "w"))


if __name__ == "__main__":
    main()
