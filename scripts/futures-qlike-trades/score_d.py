"""futures-qlike-trades D (forge/FUTURES_QLIKE_TRADES_PREREG.md): the QLIKE forecast lines as take-profits for the
NQ noise-area-momentum V2 entries (Jordan: "for bias-based trades use forecasting as targets, not entries").

    python scripts/futures-qlike-trades/score_d.py -> analysis/output/futures-qlike-trades/{results_d.json, report_d.txt, trades_d.parquet}
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/noise-area-momentum"))
import engine as E  # noqa: E402
_sp = importlib.util.spec_from_file_location("F", ROOT / "scripts/futures-oc-tp-fade/score.py")
F = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(F)
S, L, TO = F.S, F.L, F.TO

SEED, B, BLOCK = 20261123, 2000, 63
OUT = ROOT / "analysis/output/futures-qlike-trades"
LOG: list[str] = []


def say(s=""):
    sys.stdout.reconfigure(encoding="utf-8")
    print(s, flush=True); LOG.append(str(s))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    Z = E.build_days("NQ")
    feats = E.features(Z, 14, 1.0)
    P = E.positions(Z["close"], feats, Z["last"], "V2")
    cost = E.COST_RT_PTS["NQ"]
    tr = E.trades(P, Z, 1.0, cost)
    days = pd.to_datetime(Z["days"].astype("datetime64[D]"))
    say(f"NAM NQ V2: {len(tr)} trades on {len(days)} days")

    c = S.prep("NQ")
    T, sel = c["T"], c["sel"]
    T = T.assign(i=np.arange(len(T))).set_index("date")
    frames = TO.session_frames(L.load_m1("NQ", "F", "unadj"), T.index)
    C, H, Lo, O, uo, last = Z["close"], Z["high"], Z["low"], Z["open"], Z["uopen"], Z["last"]
    rows = []
    for d, k, ex_k, side, g_bp, n_bp in tr:
        day = days[d]
        if day < pd.Timestamp("2020-01-01") or day > pd.Timestamp("2026-08-21") or day not in T.index:
            continue
        i = int(T.loc[day, "i"]); g = frames.get(day)
        arm = sel["QL"]["oh" if side > 0 else "ol"][i]
        if g is None or arm is None:
            continue
        lo_open = float(g["open"].iloc[0]) * (O[d] / uo[d])      # London-midnight open on the engine's price scale
        q = "oh" if side > 0 else "ol"
        pcts = [float(c["T"][f"{arm}_{q}_{t}"].iloc[i]) for t in (50, 75, 90)]
        e0 = E.CHECKS[k]; e1 = E.CHECKS[ex_k] if ex_k < 12 else last[d]
        entry = C[d, e0]
        path_h, path_l = H[d, e0 + 1:e1 + 1], Lo[d, e0 + 1:e1 + 1]
        base = {"day": day, "year": day.year, "side": int(side), "net0": n_bp, "gross0": g_bp}

        def with_tp(scale=1.0, oracle=False):
            if oracle:
                tp = np.nanmax(path_h) if side > 0 else np.nanmin(path_l)
                if not np.isfinite(tp) or (side > 0 and tp <= entry) or (side < 0 and tp >= entry):
                    return n_bp
            else:
                lv = [lo_open * (1 + side * p * scale / 100) for p in pcts]
                beyond = [x for x in lv if (x > entry if side > 0 else x < entry)]
                if not beyond:
                    return n_bp
                tp = min(beyond) if side > 0 else max(beyond)
            hit = np.flatnonzero(path_h >= tp) if side > 0 else np.flatnonzero(path_l <= tp)
            if not len(hit):
                return n_bp
            g = side * (tp - entry) / O[d] * 1e4
            return g - cost / uo[d] * 1e4

        rows.append({**base, "net_tp": with_tp(), "net_085": with_tp(0.85), "net_115": with_tp(1.15),
                     "net_oracle": with_tp(oracle=True)})
    D = pd.DataFrame(rows)
    rng = np.random.default_rng(SEED)

    def boot(col, years=None):
        X = D if years is None else D[(D["year"] >= years[0]) & (D["year"] <= years[1])]
        x = (X[col] - X["net0"]).groupby(X["day"]).agg(["sum", "count"])
        s, n = x["sum"].to_numpy(), x["count"].to_numpy()
        bi = S.blocks(len(s), rng)
        m = s[bi].sum(1) / n[bi].sum(1)
        return float(s.sum() / n.sum()), [float(np.quantile(m, .05)), float(np.quantile(m, .95))]

    pc = boot("net_oracle")
    say(f"control (TP at each trade's own best price): {pc[0]:+.2f} bp [{pc[1][0]:+.2f}, {pc[1][1]:+.2f}] (CI lower > 0 to pass)")
    res = {"seed": SEED, "trades": len(D), "pc": pc}
    if pc[1][0] > 0:
        allr = boot("net_tp")
        halves = {h: boot("net_tp", yr) for h, yr in F.HALVES.items()}
        p085, p115 = boot("net_085"), boot("net_115")
        hit = float((D["net_tp"] != D["net0"]).mean() * 100)
        say(f"trades {len(D)} (2020-2026.08); base net {D['net0'].mean():+.2f} bp/trade; with line TP {D['net_tp'].mean():+.2f} bp")
        say(f"  TP exits {hit:.1f}% of trades; diff {allr[0]:+.2f} bp [{allr[1][0]:+.2f}, {allr[1][1]:+.2f}]; halves "
            + ", ".join(f"{h} {x[0]:+.2f}" for h, x in halves.items()))
        say(f"  placebo lines x0.85 diff {p085[0]:+.2f} bp, x1.15 diff {p115[0]:+.2f} bp")
        v = ("VALIDATED" if allr[1][0] > 0 and all(x[0] > 0 for x in halves.values()) and allr[0] > max(p085[0], p115[0])
             else ("NULL" if allr[1][1] < 1.0 else "UNDERPOWERED"))
        gr = "Strong" if v == "VALIDATED" else ("Leaning" if allr[1][0] > 0 else ("Faint" if allr[0] > 0 else ("Against" if allr[1][1] < 1 else "Untested-properly")))
        say(f"  -> {v} (weight: {gr})")
        res.update(diff=allr, halves=halves, placebo_085=p085, placebo_115=p115, tp_exit_pct=hit,
                   base_net=float(D["net0"].mean()), tp_net=float(D["net_tp"].mean()), verdict=v, grade=gr)
    D.to_parquet(OUT / "trades_d.parquet")
    (OUT / "report_d.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    json.dump(res, open(OUT / "results_d.json", "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
