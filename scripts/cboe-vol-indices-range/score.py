"""cboe-vol-indices-range: runs forge/CBOE_VOL_INDICES_RANGE_PREREG.md as registered.

Benchmark B = ladder-v2 chosen sigma (rebuilt per walk-forward year exactly as scripts/ladder-v2/ladder.py
walk_forward does, and checked against the stored test frame) x the production own-IV layer where one exists.
Layer L = B x exp(ridge(Z)), Z from the Cboe index (Lin: level vs B, 1d and 5d log change; Ext: decile flags).
Score: sum over tau 50/75/90 of H-L pinball, ratio L/B, 63-session moving-block bootstrap.

    python scripts/cboe-vol-indices-range/score.py control      # positive / known-zero controls only
    python scripts/cboe-vol-indices-range/score.py run          # every cell (after the controls pass)

Reads data READ-ONLY from the main checkout (DATA_ROOT); writes only to this worktree's analysis/output.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve()
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))
from forge import vol as V  # noqa: E402

DATA = Path(os.environ.get("DATA_ROOT", r"C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel"))
OUT = REPO / "analysis/output/cboe-vol-indices-range"
CBOE = REPO / "analysis/surfaces/cboe"
SEED, B_BOOT, BLOCK, NPLAC = 20261128, 2000, 63, 20
LOCK = pd.Timestamp("2026-08-21")
YEARS = range(2018, 2027)
TAUS = (0.50, 0.75, 0.90)
LAM, BAR, MIN_TRAIN = 1.0, 0.985, 500
HALVES = {"2018-22": (2018, 2022), "2023-26": (2023, 2026)}

# instrument -> (ladder-v2 folder, CFD M1 path, NT8 root, live estimator name used by ladder.py for har_col)
INST = {
    "WTI": ("wti", "analysis/output/ladder-v2-data/m1_commod/wti_m1.parquet", "CL", "yz_10"),
    "BRENT": ("brent", "analysis/output/ladder-v2-data/m1_commod/oil_m1.parquet", "BZ", "yz_10"),
    "SILVER": ("silver", "analysis/output/ladder-v2-data/m1_commod/silver_m1.parquet", "SI", "yz_10"),
    "ZB": ("zb", None, "ZB", "yz_10"),
    "ZN": ("zn", None, "ZN", "yz_10"),
    "US2000": ("us2000", "portfolioBacktest/cache/us2000_m1.parquet", "RTY", "yz_10"),
    "US30": ("us30", "portfolioBacktest/cache/us30_m1.parquet", "YM", "yz_10"),
    "SPX500": ("spx500", "portfolioBacktest/cache/spx500_m1.parquet", "ES", "yz_10"),
    "NQ": ("nq", "portfolioBacktest/cache/nq_m1.parquet", "NQ", "yz_10"),
    "GOLD": ("gold", "portfolioBacktest/cache/gold_m1.parquet", "GC", "yz_10"),
    "AUDUSD": ("audusd", "portfolioBacktest/cache/audusd_m1.parquet", "6A", "yz_10"),
    "USDCAD": ("usdcad", "portfolioBacktest/cache/usdcad_m1.parquet", "6C", "yz_10"),
}
# (family, index, instrument, primary track, replication track or None, benchmark own-IV or None)
MAPS = [
    ("A", "OVX", "WTI", "C", "F", None),
    ("A", "VXSLV", "SILVER", "C", "F", None),
    ("A", "VXTLT", "ZB", "F", None, None),
    ("A", "VXTLT", "ZN", "F", None, None),
    ("A", "RVX", "US2000", "C", "F", "VIX"),
    ("A", "VXD", "US30", "C", "F", "VIX"),
    ("A", "SKEW", "SPX500", "C", "F", "VIX"),
    ("A", "SKEW", "NQ", "C", "F", "VXN"),
    ("B", "VXEEM", "AUDUSD", "C", None, "SETTLE:aud_usd"),
    ("B", "VXFXI", "AUDUSD", "C", None, "SETTLE:aud_usd"),
    ("B", "VXGDX", "GOLD", "C", None, "GVZ"),
    ("B", "VXAPL", "NQ", "C", None, "VXN"),
    ("B", "VXAZN", "NQ", "C", None, "VXN"),
    ("B", "OVX", "USDCAD", "C", None, "SETTLE:usd_cad"),
    ("B", "OVX", "BRENT", "C", None, None),
]
REG = ("R5", "R15", "SHAR", "HARCJ")


def say(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- inputs
def cboe(sym: str) -> pd.Series:
    t = pd.read_csv(CBOE / f"{sym}.csv")
    t.columns = [c.strip().upper() for c in t.columns]
    col = "CLOSE" if "CLOSE" in t.columns else t.columns[-1]
    s = pd.Series(t[col].astype(float).to_numpy(), index=pd.to_datetime(t["DATE"], format="%m/%d/%Y"))
    s = s[~s.index.duplicated()].sort_index()
    return s[s > 0]


def iv_series(code: str) -> pd.Series:
    if code.startswith("SETTLE:"):
        d = pd.read_parquet(DATA / f"oi_research_book/data/iv_daily_{code.split(':')[1]}.parquet")
        s = pd.Series(d["iv30"].to_numpy(float) * 100, index=pd.to_datetime(d["date"])).sort_index()
        return s[np.isfinite(s) & (s > 0)]
    return cboe(code)


def asof_before(dates, s: pd.Series) -> np.ndarray:
    left = pd.DataFrame({"d": pd.DatetimeIndex(dates).astype("datetime64[ns]")})
    left["i"] = np.arange(len(left))
    left = left.sort_values("d")
    right = pd.DataFrame({"d": pd.DatetimeIndex(s.index).astype("datetime64[ns]"), "v": s.to_numpy(float)}).sort_values("d")
    m = pd.merge_asof(left, right, on="d", allow_exact_matches=False, direction="backward")
    out = np.full(len(left), np.nan)
    out[m["i"].to_numpy()] = m["v"].to_numpy()
    return out


def index_feats(dates, s: pd.Series) -> dict:
    """Level and 1d/5d log change of the index, each as of the latest close strictly before the session."""
    ls = np.log(s)
    return {"lev": asof_before(dates, s), "d1": asof_before(dates, ls.diff(1).dropna()),
            "d5": asof_before(dates, ls.diff(5).dropna())}


def chosen_arm(inst, track):
    folder = INST[inst][0]
    r = json.loads((DATA / f"analysis/output/ladder-v2-{folder}/results.json").read_text())
    if "detail" in r:
        r = r["detail"]
    return r[track]["chosen"]


def load_m1(inst, track, kind):
    folder, cpath, froot, _ = INST[inst]
    if track == "C":
        d = pd.read_parquet(DATA / cpath)
        if "time" in d.columns:
            t = pd.to_datetime(d.pop("time"))
            d.index = pd.DatetimeIndex(t.dt.tz_localize("UTC") if t.dt.tz is None else t.dt.tz_convert("UTC"))
        else:
            d.index = pd.to_datetime(d.index, utc=True)
    else:
        d = pd.read_parquet(DATA / f"analysis/output/nt8/continuous/{froot}_1m_{kind}.parquet")
        d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
    d = d[~d.index.duplicated()].sort_index()
    d = d[d.index < pd.Timestamp("2026-08-23", tz="UTC")][["open", "high", "low", "close"]].astype(float)
    if track == "F" and inst == "USDCAD":
        d = pd.DataFrame({"open": 1 / d["open"], "high": 1 / d["low"], "low": 1 / d["high"], "close": 1 / d["close"]})
    return d


def london_sessions(m):
    """ladder.py london_sessions, keeping o/h/l (same 00-22 London window, >= 600 bars, <= lockbox)."""
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "n": g.size()})
    return s[(s["n"] >= 600) & (s.index <= LOCK)]


def five_day(inst, track, dates):
    """R_5 per session date: (max high - min low) over sessions t..t+4 / open of t, %. Futures use the
    ratio-adjusted continuous series so a roll inside the window is not a range. NaN when t+4 is > 9 days away."""
    s = london_sessions(load_m1(inst, track, "ratio"))
    o, h, l = (s[c].to_numpy(float) for c in ("o", "h", "l"))
    idx = s.index
    n = len(s)
    r5 = np.full(n, np.nan)
    end = np.full(n, np.datetime64("NaT"), dtype="datetime64[ns]")
    for i in range(n - 4):
        if (idx[i + 4] - idx[i]).days > 9:
            continue
        r5[i] = (h[i:i + 5].max() - l[i:i + 5].min()) / o[i] * 100
        end[i] = idx[i + 4].to_datetime64()
    ser = pd.DataFrame({"r5": r5, "end5": end}, index=idx)
    j = ser.reindex(pd.DatetimeIndex(dates))
    return j["r5"].to_numpy(), pd.DatetimeIndex(j["end5"])


# ---------------------------------------------------------------- benchmark sigma (ladder.py walk_forward)
def sigma_b_year(S, inst, track, arm, Y):
    start = pd.Timestamp(f"{Y}-01-01")
    folder = INST[inst][0]
    if arm in REG:
        f = pd.read_parquet(DATA / f"analysis/output/ladder-v2-{folder}/rvfeat_{track}_{arm}.parquet")
        cols = list(f.columns[:-2])
        f = f[np.isfinite(f[cols + ["y_next"]]).all(axis=1) & (f["next_date"] < start)]
        X = np.column_stack([np.ones(len(f))] + [f[c] for c in cols])
        coef, *_ = np.linalg.lstsq(X, f["y_next"].to_numpy(), rcond=None)
        s2 = float(np.var(f["y_next"].to_numpy() - X @ coef))
        Xw = np.column_stack([np.ones(len(S))] + [S[f"{arm}_{c}"] for c in cols])
        return np.sqrt(np.exp(Xw @ coef + s2 / 2)) * 100
    if arm.startswith("G_"):
        return S[f"{arm}@{Y}"].to_numpy(float)
    if arm == "B_har_garcht":
        har = "A0" if INST[inst][3] == "har_rv_log" else "E_har_rv_log"
        return 0.5 * (S[har].to_numpy(float) + S[f"G_garch_t@{Y}"].to_numpy(float))
    return S[arm].to_numpy(float)


def fit_k(x, y):
    """ladder.py fit_k: ridge (lambda 1) slope of demeaned y on standardised x."""
    mu = x.mean(); z = x - mu; sd = float(z.std()); yc = y - y.mean()
    return float(((z / sd) @ yc) / ((z / sd) @ (z / sd) + 1.0)) / sd, mu


# ---------------------------------------------------------------- one cell
def pinball_rows(R, sig, tr, te):
    """Per-test-row loss summed over the three taus; widths fit on train rows; also p75 exceedance."""
    loss = np.zeros(te.sum()); ex75 = None
    for t in TAUS:
        w = V.fit_width_multiplier(sig[tr], R[tr], t)
        pred = w * sig[te]
        loss += V.pinball_loss(R[te], pred, t)
        if t == 0.75:
            ex75 = R[te] > pred
    return loss, ex75


def design(F, variant, trm, B, is_skew):
    lvl = np.log(F["lev"]) if is_skew else np.log(F["lev"] / V.SQRT252 / B)
    if variant == "Lin":
        Z = np.column_stack([lvl, F["d1"], F["d5"]])
        return Z, lvl, None
    e = {k: np.nanquantile(v[trm], [0.10, 0.90]) for k, v in (("lvl", lvl), ("d5", F["d5"]))}
    Z = np.column_stack([(lvl >= e["lvl"][1]), (lvl <= e["lvl"][0]), (F["d5"] >= e["d5"][1]), (F["d5"] <= e["d5"][0])]).astype(float)
    Z[~np.isfinite(lvl) | ~np.isfinite(F["d5"])] = np.nan
    return Z, lvl, e


def run_cell(frame, h, variant, is_skew, feats, rng_shift=None):
    """frame: per-year dict lists built by build_frame. feats: dict lev/d1/d5 arrays aligned to frame rows
    (possibly shifted for the placebo). Returns per-test-row arrays."""
    rows = []
    for Y, P in frame["years"].items():
        R = P["R1"] if h == 1 else P["R5"]
        Bs = P["B"] * np.sqrt(h)
        trm = P["tr1"] if h == 1 else P["tr5"]
        te = P["te"]
        F = {k: v for k, v in feats.items()}
        Z, lvl, edges = design(F, variant, trm, P["B"], is_skew)
        ok = np.isfinite(R) & np.isfinite(Bs) & (Bs > 0) & np.isfinite(Z).all(axis=1) & (R > 0)
        tr, tt = trm & ok, te & ok
        if tr.sum() < MIN_TRAIN or tt.sum() < 20:
            continue
        y = np.log(R / Bs)
        mu, sd = Z[tr].mean(0), Z[tr].std(0); sd[sd == 0] = 1.0
        Zs = (Z - mu) / sd
        A_ = Zs[tr]; b_ = y[tr] - y[tr].mean()
        beta = np.linalg.solve(A_.T @ A_ + LAM * np.eye(Z.shape[1]), A_.T @ b_)
        adj = Zs @ beta; adj = adj - adj[tr].mean()
        SL = Bs * np.exp(adj)
        lB, eB = pinball_rows(R, Bs, tr, tt)
        lL, eL = pinball_rows(R, SL, tr, tt)
        lt = np.nanquantile(lvl[tr], [0.10, 0.90]); dt = np.nanquantile(F["d5"][tr], [0.10, 0.90])
        rows.append(pd.DataFrame({"date": frame["dates"][tt], "year": Y, "lB": lB, "lL": lL, "eB": eB, "eL": eL,
                                  "lvl_hi": lvl[tt] >= lt[1], "lvl_lo": lvl[tt] <= lt[0],
                                  "d5_hi": F["d5"][tt] >= dt[1], "d5_lo": F["d5"][tt] <= dt[0],
                                  **({"beta_" + str(i): beta[i] for i in range(len(beta))})}))
    if not rows:
        return None
    return pd.concat(rows, ignore_index=True).sort_values("date").reset_index(drop=True)


def boot(T, rng):
    n = len(T); nb = int(np.ceil(n / BLOCK))
    st = rng.integers(0, max(n - BLOCK, 1), size=(B_BOOT, nb))
    idx = (st[:, :, None] + np.arange(BLOCK)[None, None, :]).reshape(B_BOOT, -1)[:, :n]
    lL, lB = T["lL"].to_numpy(), T["lB"].to_numpy()
    r = lL[idx].sum(1) / lB[idx].sum(1)
    return r


def summarise(T, rng):
    ratio = float(T["lL"].sum() / T["lB"].sum())
    r = boot(T, rng)
    se = float(np.std(np.log(r)))
    halves = {k: (float(g["lL"].sum() / g["lB"].sum()) if len(g := T[(T["year"] >= a) & (T["year"] <= b)]) else None)
              for k, (a, b) in HALVES.items()}
    return {"n": int(len(T)), "ratio": round(ratio, 5), "lo": round(float(np.quantile(r, 0.025)), 5),
            "hi": round(float(np.quantile(r, 0.975)), 5), "p": float((np.sum(r >= 1) + 1) / (B_BOOT + 1)),
            "se_log": round(se, 5), "mde": round(2.8 * se, 5), "halves": halves,
            "B_p75_exc": round(float(T["eB"].mean()), 4), "L_p75_exc": round(float(T["eL"].mean()), 4),
            "dates": [str(T["date"].min().date()), str(T["date"].max().date())],
            "by_year": {int(y): round(float(g["lL"].sum() / g["lB"].sum()), 4) for y, g in T.groupby("year")}}


def buckets(T, rng):
    out = {}
    for b in ("lvl_hi", "lvl_lo", "d5_hi", "d5_lo"):
        g = T[T[b]].reset_index(drop=True)
        if len(g) < 30:
            out[b] = {"n": int(len(g))}; continue
        r = boot(g, rng) if len(g) > BLOCK else None
        out[b] = {"n": int(len(g)), "ratio": round(float(g["lL"].sum() / g["lB"].sum()), 4),
                  "p": (float((np.sum(r >= 1) + 1) / (B_BOOT + 1)) if r is not None else None),
                  "B_p75_exc": round(float(g["eB"].mean()), 3), "L_p75_exc": round(float(g["eL"].mean()), 3)}
    return out


# ---------------------------------------------------------------- frames
def build_frame(inst, track, own_iv):
    folder = INST[inst][0]
    S = pd.read_parquet(DATA / f"analysis/output/ladder-v2-{folder}/rows_{track}.parquet")
    S = S[S["date"] <= LOCK].reset_index(drop=True)
    T = pd.read_parquet(DATA / f"analysis/output/ladder-v2-{folder}/test_{track}.parquet")
    arm = chosen_arm(inst, track)
    dates = pd.DatetimeIndex(S["date"])
    R5, end5 = five_day(inst, track, dates)
    ivo = asof_before(dates, iv_series(own_iv)) if own_iv else None
    years, check = {}, []
    for Y in YEARS:
        start = pd.Timestamp(f"{Y}-01-01"); stop = pd.Timestamp(f"{Y + 1}-01-01")
        sb = sigma_b_year(S, inst, track, arm, Y)
        te = np.asarray((dates >= start) & (dates < stop))
        if te.sum() == 0:
            continue
        # reproduction check against the stored ladder-v2 test frame
        tY = T[T["year"] == Y].set_index("date")[arm]
        mine = pd.Series(sb[te], index=dates[te])
        j = pd.concat([mine, tY], axis=1, join="inner").dropna()
        if len(j):
            check.append(float(np.max(np.abs(j.iloc[:, 0] - j.iloc[:, 1]) / j.iloc[:, 1])))
        tr1 = np.asarray(dates < start)
        tr5 = tr1 & np.asarray(end5 < start)
        Bv = sb.copy()
        if own_iv:
            x = np.log(ivo / V.SQRT252 / sb)
            ok = tr1 & np.isfinite(x) & np.isfinite(sb) & (sb > 0)
            if ok.sum() < MIN_TRAIN:
                Bv = np.full_like(sb, np.nan)
            else:
                k1, mu1 = fit_k(x[ok], np.log(S["hl"].to_numpy(float)[ok] / sb[ok]))
                Bv = sb * np.exp(k1 * (x - mu1))
        years[Y] = {"B": Bv, "R1": S["hl"].to_numpy(float), "R5": R5, "tr1": tr1, "tr5": tr5, "te": te}
    return {"dates": dates, "years": years, "arm": arm, "repro_max_rel_err": max(check) if check else None,
            "n_sessions": len(S)}


def feats_for(frame, index):
    return index_feats(frame["dates"], cboe(index))


def shifted(feats, off):
    return {k: np.roll(v, off) for k, v in feats.items()}


# ---------------------------------------------------------------- modes
def controls():
    rng = np.random.default_rng(SEED)
    fr = build_frame("WTI", "C", None)
    say(f"WTI C chosen {fr['arm']}; sigma reproduction max rel err {fr['repro_max_rel_err']:.2e}")
    out = {}
    R1 = fr["years"][2018]["R1"]
    # planted: an 'index' that knows today's range relative to the benchmark (lookahead by construction)
    PLANT_SD = 0.25          # amendment A1 (pre-results): the registered sd 1.0 plant is a ~0.2-correlation signal
    planted_lev = np.full(len(R1), np.nan)
    for Y, P in fr["years"].items():
        te = P["te"]
        planted_lev[te] = np.exp(0.5 * np.log(R1[te] / P["B"][te]) + rng.normal(0, PLANT_SD, te.sum())) * V.SQRT252 * P["B"][te]
    # train rows before 2018 use the 2018 benchmark
    pre = ~np.isfinite(planted_lev)
    B18 = fr["years"][2018]["B"]
    planted_lev[pre] = np.exp(0.5 * np.log(R1[pre] / B18[pre]) + rng.normal(0, PLANT_SD, pre.sum())) * V.SQRT252 * B18[pre]
    for name, lev in (("planted", planted_lev), ("noise", np.exp(rng.normal(3.5, 0.3, len(R1))))):
        ls = pd.Series(np.log(lev))
        f = {"lev": lev, "d1": ls.diff(1).to_numpy(), "d5": ls.diff(5).to_numpy()}
        T = run_cell(fr, 1, "Lin", False, f)
        s = summarise(T, rng)
        out[name] = s
        say(f"control {name}: ratio {s['ratio']} [{s['lo']}, {s['hi']}] n={s['n']}")
    passed = (out["planted"]["ratio"] < 0.90 and out["planted"]["hi"] < 1
              and out["noise"]["lo"] <= 1 <= out["noise"]["hi"] and out["noise"]["ratio"] >= 0.995)
    out["pass"] = bool(passed)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "controls.json").write_text(json.dumps(out, indent=1))
    say("CONTROLS", "PASS" if passed else "FAIL")
    return passed


def holm(ps, alpha=0.05):
    order = np.argsort(ps); m = len(ps); keep = np.zeros(m, bool)
    for r, i in enumerate(order):
        if ps[i] <= alpha / (m - r):
            keep[i] = True
        else:
            break
    return keep


def bh(ps, q=0.10):
    ps = np.asarray(ps); m = len(ps); order = np.argsort(ps)
    thr = q * (np.arange(1, m + 1) / m)
    passed = ps[order] <= thr
    k = np.max(np.where(passed)[0]) + 1 if passed.any() else 0
    keep = np.zeros(m, bool); keep[order[:k]] = True
    return keep


def run():
    rng = np.random.default_rng(SEED)
    frames, cells = {}, []
    for fam, index, inst, trk, rep, own in MAPS:
        for track in [trk] + ([rep] if rep else []):
            key = (inst, track, own)
            if key not in frames:
                frames[key] = build_frame(inst, track, own)
                fr = frames[key]
                say(f"{inst} {track}: chosen {fr['arm']}, {fr['n_sessions']} sessions, "
                    f"sigma reproduction max rel err {fr['repro_max_rel_err']}")
            fr = frames[key]
            feats = feats_for(fr, index)
            nrow = len(fr["dates"])
            offs = rng.integers(252, nrow - 252, size=NPLAC)
            for h in (1, 5):
                for variant in ("Lin", "Ext"):
                    T = run_cell(fr, h, variant, index == "SKEW", feats)
                    if T is None:
                        say(f"  {index}->{inst} {track} {h}d {variant}: no scorable rows"); continue
                    s = summarise(T, rng)
                    c = {"family": fam, "index": index, "inst": inst, "track": track,
                         "role": "primary" if track == trk else "replication", "h": h, "variant": variant,
                         "own_iv": own, "bench_arm": fr["arm"], **s}
                    if track == trk:
                        c["buckets"] = buckets(T, rng)
                        pl = []
                        for off in offs:
                            Tp = run_cell(fr, h, variant, index == "SKEW", shifted(feats, int(off)))
                            pl.append(float(Tp["lL"].sum() / Tp["lB"].sum()) if Tp is not None else np.nan)
                        pl = np.array(pl)
                        c["placebo"] = {"median": round(float(np.nanmedian(pl)), 5), "min": round(float(np.nanmin(pl)), 5),
                                        "max": round(float(np.nanmax(pl)), 5),
                                        "n_below_real": int(np.sum(pl < s["ratio"])), "n": int(np.isfinite(pl).sum())}
                        c["beta"] = [round(float(T[b].mean()), 4) for b in T.columns if b.startswith("beta_")]
                    cells.append(c)
                    say(f"  {index}->{inst} {track} {h}d {variant}: ratio {s['ratio']} [{s['lo']},{s['hi']}] "
                        f"p={s['p']:.4f} mde={s['mde']} halves={s['halves']}"
                        + (f" placebo med {c['placebo']['median']} below-real {c['placebo']['n_below_real']}/{c['placebo']['n']}" if 'placebo' in c else ""))
    # ---------------- verdicts
    prim = [c for c in cells if c["role"] == "primary"]
    for fam in ("A", "B"):
        fc = [c for c in prim if c["family"] == fam]
        keep = holm(np.array([c["p"] for c in fc]))
        for c, k in zip(fc, keep):
            c["holm"] = bool(k)
    repl = {(c["index"], c["inst"], c["h"], c["variant"]): c for c in cells if c["role"] == "replication"}
    for c in prim:
        r = repl.get((c["index"], c["inst"], c["h"], c["variant"]))
        c["repl_ratio"] = r["ratio"] if r else None
        halves_ok = all(v is not None and v < 1 for v in c["halves"].values())
        plac_ok = c["placebo"]["n"] >= 19 and (c["placebo"]["n"] - c["placebo"]["n_below_real"]) >= c["placebo"]["n"] - 1
        rep_ok = r is None or r["ratio"] < 1
        core = c["ratio"] <= BAR and c["hi"] < 1 and c["holm"]
        c["gates"] = {"ratio<=0.985": c["ratio"] <= BAR, "ci_hi<1": c["hi"] < 1, "holm": c["holm"], "halves": halves_ok,
                      "placebo_19of20": plac_ok, "replication": rep_ok, "mde<=bar": c["mde"] <= 1 - BAR}
        if core and halves_ok and plac_ok and rep_ok:
            v = "VALIDATED"
        elif c["lo"] > BAR and c["mde"] <= 1 - BAR:
            v = "NULL"
        elif (c["hi"] < 1 and c["holm"] and c["ratio"] > BAR) or (core and halves_ok and plac_ok and not rep_ok):
            v = "CONTEXT"
        else:
            v = "UNDERPOWERED"
        c["verdict"] = v
    # bucket BH (descriptive)
    bk = [(c, b) for c in prim for b, v in c["buckets"].items() if v.get("p") is not None]
    keepb = bh([c["buckets"][b]["p"] for c, b in bk]) if bk else []
    for (c, b), k in zip(bk, keepb):
        c["buckets"][b]["bh"] = bool(k)
    # map x horizon
    maps = {}
    for c in prim:
        maps.setdefault((c["family"], c["index"], c["inst"], c["h"]), []).append(c)
    mv = []
    for (fam, index, inst, h), cs in maps.items():
        vs = [c["verdict"] for c in cs]
        v = ("VALIDATED" if "VALIDATED" in vs else "CONTEXT" if "CONTEXT" in vs
             else "NULL" if all(x == "NULL" for x in vs) else "UNDERPOWERED")
        mv.append({"id": f"cboe-vol-range-{index.lower()}-{inst.lower()}-{h}d", "family": fam, "index": index,
                   "inst": inst, "h": h, "verdict": v, "cells": {c["variant"]: c["verdict"] for c in cs}})
    OUT.mkdir(parents=True, exist_ok=True)
    res = {"id": "cboe-vol-indices-range", "ranAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "seed": SEED, "B": B_BOOT, "block": BLOCK, "prereg": "forge/CBOE_VOL_INDICES_RANGE_PREREG.md",
           "branch": "wf2/vol-indices-range", "maps": mv, "cells": cells,
           "controls": json.loads((OUT / "controls.json").read_text()) if (OUT / "controls.json").exists() else None}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str))
    for m in mv:
        say(m)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "control"
    if mode == "control":
        controls()
    elif mode == "run":
        if not json.loads((OUT / "controls.json").read_text()).get("pass"):
            raise SystemExit("controls did not pass; not scoring")
        run()
