"""v3-p50-follow-pre2020 (forge/V3_P50_FOLLOW_PRE2020_PREREG.md): follow the first touch of the v3 SI p50 line, NQ, 2016-20.

    python scripts/v3-p50-follow-pre2020/run.py      # from the repo root
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("C", Path(__file__).parent / "common.py")
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

OUT = Path("analysis/output/v3-p50-follow-pre2020")
T0, T1 = "2016-09-12", "2020-08-14"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(C.SEED)
    lines, last = C.backcast_lines()
    h = C.history()
    w = lines.merge(h[["date", "open", "r_ocs", "atr20", "tq_oh50", "tq_ol50"]], on="date")
    w = w[(w.date >= T0) & (w.date <= T1) & w.SI_oh_p50.notna() & w.SI_ol_p50.notna() & w.atr20.notna() & w.tq_oh50.notna()]
    S = C.sessions(w.date)
    w = w[w.date.isin(S)].reset_index(drop=True)
    P = [S[d] for d in w.date]
    n = len(w)
    idx = C.blocks(n, rng)

    def follow(du, dd):
        k, side, fill, amb = C.first_touch(P, du, dd)
        x = np.array([p["x"] for p in P])[:, None]
        pnl = np.where(side == 1, x - fill, np.where(side == -1, fill - x, np.nan)) - C.COST
        return pnl, side, amb

    du, dd = w.SI_oh_p50.to_numpy(), w.SI_ol_p50.to_numpy()
    real, side, amb = follow(du[:, None], dd[:, None])
    real, side = real[:, 0], side[:, 0]
    atr = w.atr20.to_numpy()
    ku, kd = float(np.median(du / atr)), float(np.median(dd / atr))
    pa, _, _ = follow((ku * atr)[:, None], (kd * atr)[:, None])
    pt, _, _ = follow(w.tq_oh50.to_numpy()[:, None], w.tq_ol50.to_numpy()[:, None])
    pa, pt = pa[:, 0], pt[:, 0]
    DU, DD = C.shuffle_quarter(du, w.date, 1000, rng, partner=dd)
    pl, _, _ = follow(DU, DD)
    plm = np.nanmean(pl, axis=0)

    R = {"seed": C.SEED, "window": [w.date.iat[0], w.date.iat[-1]], "sessions": n, "backcast_last_test": last,
         "same_bar_both_skipped": amb, "touch_share": float((side != 0).mean()), "k_atr": [ku, kd],
         "follow": C.per_trade(real, idx), "follow_2x_cost_mean": float(np.nanmean(real) - C.COST),
         "up_breaks": C.per_trade(np.where(side == 1, real, np.nan), idx),
         "down_breaks": C.per_trade(np.where(side == -1, real, np.nan), idx),
         "atr_lines": C.per_trade(pa, idx), "tq_lines": C.per_trade(pt, idx),
         "real_minus_atr": C.diff_trade(real, pa, idx), "real_minus_tq": C.diff_trade(real, pt, idx),
         "placebo": {"mean": float(plm.mean()), "p95": float(np.percentile(plm, 95)), "pctile": float((plm < np.nanmean(real)).mean())},
         "fade_mirror_mean": float(-np.nanmean(real) - 2 * C.COST),
         "by_year": {y: float(np.nanmean(real[w.date.str[:4].to_numpy() == y])) for y in sorted(set(w.date.str[:4]))}}
    R["atr_lines_up"] = C.per_trade(np.where(_side_of(P, ku * atr, kd * atr) == 1, pa, np.nan), idx)
    R["atr_lines_down"] = C.per_trade(np.where(_side_of(P, ku * atr, kd * atr) == -1, pa, np.nan), idx)
    g1 = R["placebo"]["pctile"] >= 0.95
    ra, rt = R["real_minus_atr"], R["real_minus_tq"]
    g2 = ra["mean"] > 0 and rt["mean"] > 0 and (ra["lo"] > 0 or rt["lo"] > 0)
    if g1 and g2:
        verdict = "VALIDATED"
    elif R["placebo"]["pctile"] < 0.80 or ra["hi"] < 0.03:
        verdict = "NULL"
    else:
        verdict = "UNDERPOWERED"
    R["gate"] = {"G1_placebo_ge_95": bool(g1), "G2_beats_atr_and_tq": bool(g2), "verdict": verdict}
    (OUT / "results.json").write_text(json.dumps(R, indent=1))
    print(json.dumps(R, indent=1))


def _side_of(P, du, dd):
    _, side, _, _ = C.first_touch(P, du[:, None], dd[:, None])
    return side[:, 0]


if __name__ == "__main__":
    main()
