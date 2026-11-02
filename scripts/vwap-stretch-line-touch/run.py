"""vwap-stretch-line-touch (forge/VWAP_STRETCH_LINE_TOUCH_PREREG.md): fade the first touch of a v3 SI p75/p90 line on NQ
when price is >= 1.5 session-VWAP SDs stretched; 60-minute exit (primary), 21:55 (secondary).

    python <path>/scripts/vwap-stretch-line-touch/run.py --count    # event counts only (no outcome)
    python <path>/scripts/vwap-stretch-line-touch/run.py            # score once
Run from the repo root (data is local). Discovery lines are cached in the output folder.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("C", Path(__file__).parent.parent / "v3-p50-follow-pre2020" / "common.py")
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

OUT = Path("analysis/output/vwap-stretch-line-touch")
Z, MINBARS, HOLD = 1.5, 30, 60
# Amendment A1 (PRE-RESULTS): z >= 1.5 holds at 95-98% of touches, so stretched = top tercile of signed z at the touch and
# unstretched = bottom tercile, thresholds from the discovery touches (no outcomes), applied unchanged to the replication.
TH = {"75": (2.74, 2.23), "90": (2.36, 1.93)}
WIN = {"discovery": ("2020-08-24", "2026-08-20"), "replication": ("2016-09-12", "2020-08-14")}


def prep(P):
    """Per session: VWAP and band SD after each bar (volume-weighted typical price), exit-60 index per bar."""
    for p in P:
        tp = (p["hi"] + p["lo"] + p["c"]) / 3
        v = np.where(p["v"] > 0, p["v"], 1.0)
        cv, cpv, cpv2 = np.cumsum(v), np.cumsum(v * tp), np.cumsum(v * tp * tp)
        vw = cpv / cv
        sd = np.sqrt(np.maximum(cpv2 / cv - vw ** 2, 0))
        p["vw"], p["sd"] = vw, sd
        m = p["mins"]
        e = np.searchsorted(m, m + HOLD) - 1                      # last bar starting before entry + 60 min
        p["e60"] = np.minimum(np.maximum(e, np.arange(len(m))), p["ex"])


def events(P, du, dd):
    """Fade P&L (60-min and 21:55), z at touch, side. du/dd (n, K)."""
    k, side, fill, _ = C.first_touch(P, du, dd)
    n, K = du.shape
    z = np.full((n, K), np.nan)
    f60 = np.full((n, K), np.nan)
    fcl = np.full((n, K), np.nan)
    for i, p in enumerate(P):
        ki = k[i]
        ok = (side[i] != 0) & (ki >= MINBARS)
        if not ok.any():
            continue
        kk = ki[ok]
        line_px = p["o"] * (1 + fill[i][ok] / 100)
        zz = (line_px - p["vw"][kk - 1]) / np.where(p["sd"][kk - 1] > 0, p["sd"][kk - 1], np.nan)
        z[i, ok] = zz
        x60 = p["cl"][p["e60"][kk]]
        s = side[i][ok]
        f60[i, ok] = s * (fill[i][ok] - x60)                  # fade: short upper (s=+1), long lower (s=-1)
        fcl[i, ok] = s * (fill[i][ok] - p["x"])
    return dict(z=z, zs=z * side, side=side, f60=f60 - C.COST, fcl=fcl - C.COST, valid=~np.isnan(z))


def window(name, lines, h, rng, count_only):
    a, b = WIN[name]
    w = lines.merge(h[["date", "atr20"]], on="date")
    w = w[(w.date >= a) & (w.date <= b) & w.atr20.notna()]
    S = C.sessions(w.date)
    w = w[w.date.isin(S)].reset_index(drop=True)
    P = [S[d] for d in w.date]
    prep(P)
    idx = C.blocks(len(w), rng)
    atr = w.atr20.to_numpy()
    out = {"sessions": len(w), "window": [w.date.iat[0], w.date.iat[-1]]}
    for r in ("75", "90"):
        du, dd = w[f"SI_oh_p{r}"].to_numpy(), w[f"SI_ol_p{r}"].to_numpy()
        hi_t, lo_t = TH[r]
        E = events(P, du[:, None], dd[:, None])
        val = E["valid"][:, 0]
        zs = E["zs"][:, 0]
        st, un = val & (zs >= hi_t), val & (zs <= lo_t)
        cnt = {"touches_scored": int(val.sum()), "stretched": int(st.sum()), "unstretched": int(un.sum()), "literal_z15": int((val & (zs >= Z)).sum()),
               "stretched_up": int((st & (E["side"][:, 0] == 1)).sum())}
        if count_only:
            out[f"p{r}"] = cnt
            continue
        f60, fcl = E["f60"][:, 0], E["fcl"][:, 0]
        sf, uf = np.where(st, f60, np.nan), np.where(un, f60, np.nan)
        ku, kd = float(np.median(du / atr)), float(np.median(dd / atr))
        EA = events(P, (ku * atr)[:, None], (kd * atr)[:, None])
        af = np.where(EA["valid"][:, 0] & (EA["zs"][:, 0] >= hi_t), EA["f60"][:, 0], np.nan)
        DU, DD = C.shuffle_quarter(du, w.date, 1000, rng, partner=dd)
        EP = events(P, DU, DD)
        pm = np.array([np.nanmean(np.where(EP["valid"][:, j] & (EP["zs"][:, j] >= hi_t), EP["f60"][:, j], np.nan)) for j in range(DU.shape[1])])
        real = float(np.nanmean(sf))
        out[f"p{r}"] = cnt | {
            "stretched_fade_60": C.per_trade(sf, idx), "unstretched_fade_60": C.per_trade(uf, idx),
            "stretched_minus_unstretched_60": C.diff_trade(sf, uf, idx),
            "atr_lines_stretched_fade_60": C.per_trade(af, idx), "real_minus_atr_60": C.diff_trade(sf, af, idx),
            "placebo_60": {"mean": float(np.nanmean(pm)), "p95": float(np.nanpercentile(pm, 95)), "pctile": float((pm < real).mean())},
            "stretched_fade_2155": C.per_trade(np.where(st, fcl, np.nan), idx),
            "unstretched_fade_2155": C.per_trade(np.where(un, fcl, np.nan), idx),
            "literal_z15_fade_60": C.per_trade(np.where(val & (zs >= Z), f60, np.nan), idx),
            "stretched_fade_60_2xcost": float(real - C.COST),
            "follow_mirror_60": float(-real - 2 * C.COST),
                        "stretched_up_fade_60": C.per_trade(np.where(st & (E["side"][:, 0] == 1), f60, np.nan), idx),
            "stretched_down_fade_60": C.per_trade(np.where(st & (E["side"][:, 0] == -1), f60, np.nan), idx),
            "median_z_stretched": float(np.median(zs[st])) if st.any() else None,
        }
    return out


def holm(ps):
    o = np.argsort(ps)
    adj, run = np.empty(len(ps)), 0.0
    for i, k in enumerate(o):
        run = max(run, (len(ps) - i) * ps[k])
        adj[k] = min(run, 1.0)
    return adj


def main():
    count_only = "--count" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(C.SEED)
    h = C.history()
    disc = C.discovery_lines(OUT / "discovery_lines_nq.parquet")
    back, _ = C.backcast_lines()
    R = {"seed": C.SEED, "z": Z, "hold_min": HOLD, "cost": C.COST,
         "discovery": window("discovery", disc, h, rng, count_only), "replication": window("replication", back, h, rng, count_only)}
    if count_only:
        (OUT / "counts.json").write_text(json.dumps(R, indent=1))
        print(json.dumps(R, indent=1))
        return
    D, Rp = R["discovery"], R["replication"]
    ps = [D[f"p{r}"]["stretched_fade_60"]["p"] for r in ("75", "90")]
    adj = holm(np.array(ps))
    verdicts = {}
    for i, r in enumerate(("75", "90")):
        d, rp = D[f"p{r}"], Rp[f"p{r}"]
        sf = d["stretched_fade_60"]
        g1 = sf["mean"] > 0 and adj[i] < 0.05
        g2 = d["stretched_minus_unstretched_60"]["lo"] > 0
        g3 = d["placebo_60"]["pctile"] >= 0.95
        g4 = np.sign(rp["stretched_fade_60"]["mean"]) == np.sign(sf["mean"]) and rp["stretched_fade_60"]["lo"] > -0.02
        su = d["stretched_minus_unstretched_60"]
        if g1 and g2 and g3 and g4:
            v = "VALIDATED"
        elif d["stretched"] < 100:
            v = "UNDERPOWERED"
        elif sf["hi"] < 0.02 or (su["mean"] <= 0 and su["hi"] < 0.03):
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        verdicts[f"p{r}"] = {"G1": bool(g1), "G1_p_holm": float(adj[i]), "G2": bool(g2), "G3": bool(g3), "G4": bool(g4), "verdict": v}
    R["gate"] = verdicts
    (OUT / "results.json").write_text(json.dumps(R, indent=1))
    print(json.dumps(R, indent=1))


if __name__ == "__main__":
    main()
