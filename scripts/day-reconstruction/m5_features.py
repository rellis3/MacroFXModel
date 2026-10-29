"""Day reconstruction, milestone 5, stage 1: approach-path measures and frozen tercile boundaries. NO OUTCOMES.

Reads only what is known at or before each first touch: the touch's bar index, the level family/rung/side, the day's
open, rungs and sigma scale, and the minute path BEFORE the touch bar. No column describing what happens after the
touch is loaded or written. Prereg: forge/DAY_RECON_APPROACH_PATH_PREREG.md.

Path measures (definitions fixed in the prereg):
  R_prev  previous reference: p50 -> the session open; p75 -> the same family's p50; p90 -> the same family's p75.
          Static families: open x (1 +- pct x factor / 100). Projected: the running opposite extreme through bar j-1
          x (1 +- hl_pct x factor / 100), priced bar by bar (build_archive.mjs rule).
  k_last  the last bar j in [0, k-1] where price was at or behind R_prev(j): up touch L[j] <= R_prev(j), down H[j] >= R_prev(j).
          For p50 (R_prev = the open) bar 0 always qualifies: it opens at the open.
  P1      approach time, minutes = (t[k] - t[k_last]) / 60.
  P2      approach pullback, sigma = the largest move against the touch direction on the leg, bars k_last+1 .. k-1, with
          the extreme always printed on an EARLIER bar than the pullback low/high (no within-bar ordering assumed):
          up: max_j (max H[k_last+1 .. j-1] - L[j]); down mirrored; 0 if the leg has fewer than 2 bars; / scale.

    python scripts/day-reconstruction/m5_features.py
Env M5_DATA = checkout holding the gitignored inputs (archive/*_path.parquet, m3/*_phantom_touches*.jsonl).
"""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("M5_DATA", ROOT))
ARC_GIT = ROOT / "analysis/output/day-reconstruction/archive"            # days / touches parquet (in git)
ARC_DATA = DATA / "analysis/output/day-reconstruction/archive"           # path parquet (gitignored)
M3_DATA = DATA / "analysis/output/day-reconstruction/m3"                 # phantom touches (gitignored)
OUT = ROOT / "analysis/output/day-reconstruction/m5"
OUT.mkdir(parents=True, exist_ok=True)

NAMES = ["GOLD", "NQ", "EURUSD"]
FAMS = {"OH": ("Fixed OH/OL", 1), "OL": ("Fixed OH/OL", -1), "ProjH": ("Projected H/L", 1), "ProjL": ("Projected H/L", -1)}
PCT = {"OH": "oh_{}_pct", "OL": "ol_{}_pct", "ProjH": "hl_{}", "ProjL": "hl_{}"}
PREV = {"p75": "p50", "p90": "p75"}
NEXT = {"p50": "p75", "p75": "p90"}
FACTORS = (1.0, 0.70, 0.85, 1.15, 1.30)
KEEP = ["instrument", "date", "era", "tag_status", "factor", "level", "family", "rung", "side", "k", "t",
        "hl_before_pct", "same_bar_levels", "ambiguous_order"]          # pre-touch / at-touch fields only


def load_touches(name):
    real = pd.read_parquet(ARC_GIT / f"{name}_touches.parquet")
    real["factor"] = 1.0
    real = real[KEEP + ["float32_tie"]]
    ph = []
    for fn in (f"{name}_phantom_touches.jsonl", f"{name}_phantom_touches_f0.7,1.3.jsonl"):
        rows = []
        with open(M3_DATA / fn, encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                if r["family"] in FAMS:
                    rows.append({c: r.get(c) for c in KEEP})
        ph.append(pd.DataFrame(rows))
    ph = pd.concat(ph, ignore_index=True)
    ph["float32_tie"] = False
    t = pd.concat([real[real.family.isin(FAMS)], ph], ignore_index=True)
    t["date"] = t.date.astype(str)
    return t


def features(t, days, path):
    d = days.set_index("date")
    pbd = {dt: (g.t.to_numpy(np.int64), g.high.to_numpy(), g.low.to_numpy()) for dt, g in path.groupby("date")}
    p1 = np.full(len(t), np.nan)
    p2 = np.full(len(t), np.nan)
    for i, r in enumerate(t.itertuples(index=False)):
        k = int(r.k)
        if k < 1:
            continue
        T, H, L = pbd[r.date]
        day = d.loc[r.date]
        op, sc, f = day.open, day.scale, r.factor
        s = FAMS[r.family][1]
        if r.rung == "p50":
            ref = np.full(k, op)
        else:
            pct = day[PCT[r.family].format(PREV[r.rung])] * f / 100
            if r.family in ("OH", "OL"):
                ref = np.full(k, op * (1 + s * pct))
            elif s > 0:
                lo_prev = np.minimum.accumulate(np.concatenate([[op], np.minimum(L[:k - 1], op)]))
                ref = lo_prev * (1 + pct)
            else:
                hi_prev = np.maximum.accumulate(np.concatenate([[op], np.maximum(H[:k - 1], op)]))
                ref = hi_prev * (1 - pct)
        behind = (L[:k] <= ref) if s > 0 else (H[:k] >= ref)
        if r.rung == "p50":
            behind[0] = True          # bar 0 opens AT the open by definition (the archive open is float32-rounded)
        idx = np.flatnonzero(behind)
        if not len(idx):
            continue
        kl = int(idx[-1])
        p1[i] = (T[k] - T[kl]) / 60.0
        a = kl + 1
        if k - a >= 2:
            if s > 0:
                m = np.maximum.accumulate(H[a:k])
                dd = m[:-1] - L[a + 1:k]
            else:
                m = np.minimum.accumulate(L[a:k])
                dd = H[a + 1:k] - m[:-1]
            p2[i] = max(0.0, float(dd.max())) / sc
        else:
            p2[i] = 0.0
    return p1, p2


def strata(t, days):
    d = days.set_index("date")
    hrs = (t.t - t.date.map(d.t_open)) / 3600
    t["hour_bucket"] = pd.cut(hrs, [-0.01, 7, 12, 17, 22.1], labels=["00-07", "07-12", "12-17", "17-22"]).astype(str)
    # range used before the touch in the REAL day's HL p50, for real and phantom alike (same control on both sides)
    cons = t.hl_before_pct / t.date.map(d.hl_p50)
    t["consumed_bucket"] = pd.cut(cons, [-0.01, 0.5, 1.0, 99], labels=["<0.5", "0.5-1.0", ">=1.0"]).astype(str)
    t["group"] = t.family.map(lambda x: FAMS[x][0])
    return t


def exclusions(t):
    nxt = np.array([f"{fa}_{NEXT[ru]}" if ru in NEXT else "" for fa, ru in zip(t.family, t.rung)])
    same_next = np.array([bool(n) and n in str(sb).split(";") for n, sb in zip(nxt, t.same_bar_levels)])
    reason = np.select(
        [t.k < 1, t.float32_tie.astype(bool), t.ambiguous_order.astype(bool), same_next, t.p1.isna()],
        ["first_minute", "float32_tie", "ambiguous_order", "next_rung_same_minute", "no_reference_bar"], "")
    t["excluded"] = reason
    return t


def terciles(t):
    """Boundaries per instrument x group x rung x hour bucket x factor, from the OOS era (features only)."""
    b = {}
    oos = t[(t.era == "oos_pit") & (t.excluded == "")]
    for key, g in oos.groupby(["instrument", "group", "rung", "hour_bucket", "factor"]):
        b["|".join(map(str, key))] = {m: [float(g[m].quantile(1 / 3)), float(g[m].quantile(2 / 3))] for m in ("p1", "p2")} | {"n": int(len(g))}
    return b


def assign(t, b):
    for m in ("p1", "p2"):
        out = []
        for r in zip(t.instrument, t.group, t.rung, t.hour_bucket, t.factor, t[m], t.excluded):
            if r[6]:
                out.append(""); continue
            key = "|".join(map(str, r[:5]))
            if key not in b:
                out.append(""); continue
            lo, hi = b[key][m]
            out.append("bottom" if r[5] <= lo else ("top" if r[5] > hi else "middle"))
        t[f"{m}_tercile"] = out
    return t


FACT4 = (0.70, 0.85, 1.15, 1.30)
W_B2 = np.linalg.pinv(np.array([[1, f - 1, (f - 1) ** 2] for f in FACT4]))[0]


def power(t):
    """Approximate minimum detectable top-minus-bottom effect from COUNTS only: rung x hour cells (the regression's
    fixed effects), p = 0.5 worst case, no clustering. Delta treats real and placebo as independent, so it is an upper
    bound -- the same-day pairing makes the real interval narrower."""
    res = {}
    oos = t[(t.era == "oos_pit") & (t.excluded == "")]
    for (inst, grp), g in oos.groupby(["instrument", "group"]):
        for m in ("p1", "p2"):
            c = {f: g[g.factor == f].groupby(["rung", "hour_bucket", f"{m}_tercile"]).size().unstack(fill_value=0)
                    .reindex(columns=["bottom", "middle", "top"], fill_value=0) for f in FACTORS}
            idx = c[1.0].index
            w = (c[1.0].top + c[1.0].bottom).astype(float)

            def var(cc):
                cc = cc.reindex(idx).fillna(0)
                return float((w ** 2 * (0.25 / cc.top.clip(lower=1) + 0.25 / cc.bottom.clip(lower=1))).sum() / w.sum() ** 2)
            v1 = var(c[1.0])
            vd = v1 + sum(wb ** 2 * var(c[f]) for wb, f in zip(W_B2, FACT4))
            res[f"{inst}|{grp}|{m}"] = {"touches": int((g.factor == 1.0).sum()),
                                       "mde_real_pp": round(280 * np.sqrt(v1), 1), "mde_delta_pp_upper": round(280 * np.sqrt(vd), 1)}
    return res


if __name__ == "__main__":
    allt, meta = [], {}
    for name in NAMES:
        days = pd.read_parquet(ARC_GIT / f"{name}_days.parquet")
        days["date"] = days.date.astype(str)
        path = pd.read_parquet(ARC_DATA / f"{name}_path.parquet", columns=["date", "i", "t", "high", "low"])
        path["date"] = path.date.astype(str)
        t = load_touches(name)
        t["p1"], t["p2"] = features(t, days, path)
        t = exclusions(strata(t, days))
        allt.append(t)
        print(name, len(t), flush=True)
    t = pd.concat(allt, ignore_index=True)
    b = terciles(t)
    t = assign(t, b)
    excl = t[t.factor == 1.0].groupby(["instrument", "era", "group", "excluded"]).size()
    meta = {"exclusions_real": {"|".join(k): int(v) for k, v in excl.items()},
            "p1_p2_spearman_real_oos": {f"{i}|{g}": round(float(x.p1.corr(x.p2, method="spearman")), 3)
                                        for (i, g), x in t[(t.factor == 1.0) & (t.era == "oos_pit") & (t.excluded == "")].groupby(["instrument", "group"])},
            "power": power(t), "W_B2": [round(float(w), 6) for w in W_B2]}
    (OUT / "tercile_boundaries.json").write_text(json.dumps(b, indent=1))
    (OUT / "stage1_meta.json").write_text(json.dumps(meta, indent=1))
    cols = ["instrument", "date", "era", "tag_status", "factor", "level", "family", "group", "rung", "side", "k",
            "hour_bucket", "consumed_bucket", "p1", "p2", "p1_tercile", "p2_tercile", "excluded"]
    t[cols].to_parquet(OUT / "features.parquet", index=False)
    print(json.dumps(meta["power"], indent=1))
