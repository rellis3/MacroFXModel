"""DOES THE DEALER HEDGE-FLOW SCHEDULE SAY HOW BIG THE RANGE IS, OR WHICH SIDE IT EXTENDS TO?
Pre-registration: oi_research_book/HEDGE_FLOW_PREREG.md (frozen 2026-10-26, amendments dated inside it). Read it first.

flow(P) = -(D(P) - D(F)) * F, D = dealer option delta (long calls, short puts), re-priced at P with time and vol held.
u = flow(F*(1+sd)), d = flow(F*(1-sd)), sd = trailing 20d daily sigma. Up side is REINFORCING when u > 0 (dealers buy as
price rises), down side when d < 0. G0 = +1 when u > d (net reinforcing = the gamma-sign control).

T1 size beyond sign  : DR ~ G0 + Fz + Fz*G0, statistic = coefficient on Fz*G0 (expected > 0).
T2 where it goes     : days with exactly one reinforcing side; excursion(reinforcing side) - excursion(damping side), in sigma.
T3 lopsidedness      : mean(sign(log|u|/|d|) * sign(up excursion - down excursion)), expected null.
Placebos (same code): (a) strikes shifted +-2/+-4 listed increments, (b) a neighbour day's book (+-5 sessions) re-centred,
(c) calls/puts swapped (mechanical: must flip T1/T2).

    python oi_research_book/scripts/29_hedge_flow.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "results"
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20261026
RNG = np.random.default_rng(SEED)
LOCKBOX = pd.Timestamp("2026-08-21")
BM = np.sqrt(8.0 / np.pi)
N_BOOT = 2000
N_NEIGH = 200
SHIFTS = (-4, -2, 2, 4)
OFFS = (-5, -4, -3, -2, -1, 1, 2, 3, 4, 5)
MIN_DAYS = 400

# instrument -> (suffix, sample, swap calls/puts for the CME-inverted convention)
INSTR = {
    "EUR_USD": ("", "FX"), "GBP_USD": ("_gbp_usd", "FX"), "AUD_USD": ("_aud_usd", "FX"),
    "USD_JPY": ("_usd_jpy", "FXINV"), "USD_CAD": ("_usd_cad", "FXINV"), "USD_CHF": ("_usd_chf", "FXINV"),
    "NAS100_USD": ("_nas100_usd", "IDX"),
}


# ---------------------------------------------------------------- features
def dealer_delta(P, k, c, p, s):
    d1 = (np.log(P / k) + 0.5 * s * s) / s
    nd = norm.cdf(d1)
    return float((c * nd + p * (1.0 - nd)).sum())


def feats(k, c, p, F, T, sig, sd):
    s = sig * np.sqrt(T)
    ok = (k > F * 0.7) & (k < F * 1.3) & ((c + p) > 0)
    if ok.sum() < 3 or not (s > 0) or not (sd > 0):
        return None
    k, c, p = k[ok], c[ok], p[ok]
    d0 = dealer_delta(F, k, c, p, s)
    u = -(dealer_delta(F * (1 + sd), k, c, p, s) - d0) * F
    d = -(dealer_delta(F * (1 - sd), k, c, p, s) - d0) * F
    oi = float((c + p).sum()) * F
    return {"u": u, "d": d, "Fm": 0.5 * (abs(u) + abs(d)) / oi, "G0": 1.0 if u > d else -1.0,
            "au": u > 0, "ad": d < 0, "lop": np.log(abs(u) / abs(d)) if u and d else np.nan}


def load(name):
    sfx, grp = INSTR[name]
    dm = pd.read_parquet(DATA / f"daily_master_near{sfx}.parquet").sort_values("date").reset_index(drop=True)
    iv = pd.read_parquet(DATA / f"iv_daily{'_' + name.lower() if name != 'EUR_USD' else '_eur_usd'}.parquet").set_index("date")
    surf = {kind: pd.read_parquet(DATA / f"surface_{kind}{sfx}.parquet") for kind in ("near", "all")}
    return dm, iv, surf, grp


def book_days(surf):
    out = {}
    for date, g in surf.groupby("date"):
        out[date] = (g["strike"].to_numpy(float), g["call_oi"].to_numpy(float), g["put_oi"].to_numpy(float))
    return out


def inc_of(k, F):
    kk = np.sort(np.unique(k[(k > F * 0.9) & (k < F * 1.1)]))
    d = np.diff(kk)
    d = d[d > 1e-12]
    return float(np.median(d)) if len(d) else np.nan


def build_versions(name, kind):
    """For every day: real features plus the placebo versions."""
    dm, iv, surf, grp = load(name)
    books = book_days(surf[kind])
    dates = sorted(books)
    pos = {d: i for i, d in enumerate(dates)}
    rows = {}
    for date in dates:
        if date not in iv.index or date > LOCKBOX:
            continue
        r = iv.loc[date]
        F = r["F_front"]
        if kind == "near":
            T, sig = max(r["dte_front"], 0.5) / 365, r["iv_front"]
        else:
            T, sig = 30 / 365, r["iv30"]
        m = dm.loc[dm["date"] == date]
        if not len(m) or not (F > 0 and sig > 0):
            continue
        sd = float(m["rv20_ann"].iloc[0]) / np.sqrt(252)
        k, c, p = books[date]
        v = {"real": feats(k, c, p, F, T, sig, sd), "flip": feats(k, p, c, F, T, sig, sd)}
        inc = inc_of(k, F)
        for sh in SHIFTS:
            v[f"shift{sh}"] = feats(k + sh * inc, c, p, F, T, sig, sd) if np.isfinite(inc) else None
        i = pos[date]
        for o in OFFS:
            j = i + o
            if 0 <= j < len(dates) and dates[j] in iv.index:
                k2, c2, p2 = books[dates[j]]
                F2 = iv.loc[dates[j], "F_front"]
                v[f"nb{o}"] = feats(k2 * (F / F2), c2, p2, F, T, sig, sd)
            else:
                v[f"nb{o}"] = None
        rows[date] = v
    return dm, rows, grp


def frame(name, kind, lag):
    dm, rows, grp = build_versions(name, kind)
    d = dm.set_index("date")
    base = pd.DataFrame(index=sorted(rows))
    sd = d["rv20_ann"] / np.sqrt(252)
    hi, lo, op = d["fwd_hi_1d"].shift(-(lag - 1)), d["fwd_lo_1d"].shift(-(lag - 1)), d["open"].shift(-lag)
    base["sd"] = sd
    base["dr"] = np.log(hi / lo) / (sd * BM)
    base["xu"] = np.log(hi / op) / sd
    base["xd"] = np.log(op / lo) / sd
    base["week"] = [f"{name}-{x.isocalendar().year}-{x.isocalendar().week}" for x in base.index]
    base["inst"] = name
    return base.dropna(subset=["dr", "xu", "xd"]), rows, grp


def version_cols(base, rows, key):
    cols = {k: [] for k in ("Fm", "G0", "au", "ad", "lop")}
    for date in base.index:
        f = rows[date].get(key)
        for k in cols:
            cols[k].append(f[k] if f else np.nan)
    return {k: np.asarray(v, float) for k, v in cols.items()}


def expz(x, minp=60):
    out = np.full(len(x), np.nan)
    s = s2 = 0.0
    n = 0
    for i, v in enumerate(x):
        if n >= minp:
            m = s / n
            sdv = np.sqrt(max(s2 / n - m * m, 1e-18))
            out[i] = (v - m) / sdv if np.isfinite(v) else np.nan
        if np.isfinite(v):
            s += v
            s2 += v * v
            n += 1
    return out


# ---------------------------------------------------------------- statistics
def t1(dr, g0, fz):
    ok = np.isfinite(dr) & np.isfinite(g0) & np.isfinite(fz)
    if ok.sum() < 50:
        return np.nan
    X = np.column_stack([np.ones(ok.sum()), g0[ok], fz[ok], fz[ok] * g0[ok]])
    return float(np.linalg.lstsq(X, dr[ok], rcond=None)[0][3])


def t2(xu, xd, au, ad):
    one = np.isfinite(au) & np.isfinite(ad) & (au.astype(bool) ^ ad.astype(bool))
    if one.sum() < 30:
        return np.nan
    up_reinf = au[one].astype(bool)
    diff = np.where(up_reinf, xu[one] - xd[one], xd[one] - xu[one])
    return float(diff.mean())


def t3(xu, xd, lop):
    ok = np.isfinite(lop) & np.isfinite(xu) & np.isfinite(xd) & (xu != xd)
    if ok.sum() < 30:
        return np.nan
    return float((np.sign(lop[ok]) * np.sign((xu - xd)[ok])).mean())


def pooled_stats(frames, key, min_n=60):
    """Compute (T1, T2, T3) over the pooled frames for one book version key."""
    parts = []
    for base, rows, _ in frames:
        c = version_cols(base, rows, key)
        parts.append(pd.DataFrame({"inst": base["inst"].to_numpy(), "week": base["week"].to_numpy(), "date": base.index,
                                   "dr": base["dr"].to_numpy(), "xu": base["xu"].to_numpy(), "xd": base["xd"].to_numpy(),
                                   "Fz": expz(c["Fm"]), "G0": c["G0"], "au": c["au"], "ad": c["ad"], "lop": c["lop"]}))
    return pd.concat(parts, ignore_index=True)


def stat_triplet(d):
    return {"T1": t1(d["dr"].to_numpy(), d["G0"].to_numpy(), d["Fz"].to_numpy()),
            "T2": t2(d["xu"].to_numpy(), d["xd"].to_numpy(), d["au"].to_numpy(), d["ad"].to_numpy()),
            "T3": t3(d["xu"].to_numpy(), d["xd"].to_numpy(), d["lop"].to_numpy())}


def cluster_boot(d, n_boot=N_BOOT):
    wk = d["week"].to_numpy()
    uniq, inv = np.unique(wk, return_inverse=True)
    groups = [np.where(inv == g)[0] for g in range(len(uniq))]
    est = {"T1": [], "T2": [], "T3": []}
    for _ in range(n_boot):
        pick = RNG.integers(0, len(groups), len(groups))
        idx = np.concatenate([groups[g] for g in pick])
        s = stat_triplet(d.iloc[idx])
        for k in est:
            est[k].append(s[k])
    out = {}
    for k, v in est.items():
        v = np.asarray(v, float)
        v = v[np.isfinite(v)]
        out[k] = {"lo": float(np.percentile(v, 2.5)), "hi": float(np.percentile(v, 97.5)),
                  "p": float(min(1.0, 2 * min((v <= 0).mean(), (v >= 0).mean())))}
    return out


def neighbour_placebo(frames):
    """N_NEIGH draws; each day takes the features of a random neighbour-day book."""
    res = {"T1": [], "T2": [], "T3": []}
    cache = []
    for base, rows, _ in frames:
        cache.append((base, {o: version_cols(base, rows, f"nb{o}") for o in OFFS}, version_cols(base, rows, "real")))
    for _ in range(N_NEIGH):
        parts = []
        for base, cv, real in cache:
            pick = RNG.choice(OFFS, len(base))
            cols = {k: np.array([cv[o][k][i] for i, o in enumerate(pick)]) for k in real}
            # a missing neighbour (edge of sample) falls back to a missing value, never to the real book
            parts.append(pd.DataFrame({"inst": base["inst"].to_numpy(), "week": base["week"].to_numpy(), "dr": base["dr"].to_numpy(),
                                       "xu": base["xu"].to_numpy(), "xd": base["xd"].to_numpy(), "Fz": expz(cols["Fm"]),
                                       "G0": cols["G0"], "au": cols["au"], "ad": cols["ad"], "lop": cols["lop"]}))
        s = stat_triplet(pd.concat(parts, ignore_index=True))
        for k in res:
            res[k].append(s[k])
    return {k: np.asarray(v, float) for k, v in res.items()}


def bh(pvals, q=0.10):
    items = sorted(pvals.items(), key=lambda kv: kv[1])
    m = len(items)
    keep, thr = set(), -1
    for r, (k, p) in enumerate(items, 1):
        if p <= q * r / m:
            thr = r
    for r, (k, p) in enumerate(items, 1):
        if r <= thr:
            keep.add(k)
    return keep


def run_group(label, names, kind, lag):
    frames = []
    for n in names:
        base, rows, grp = frame(n, kind, lag)
        frames.append((base, rows, grp))
    n_days = sum(len(b) for b, _, _ in frames)
    real_d = pooled_stats(frames, "real")
    real = stat_triplet(real_d)
    ci = cluster_boot(real_d)
    half = real_d["date"].median()
    halves = [stat_triplet(real_d[real_d["date"] <= half]), stat_triplet(real_d[real_d["date"] > half])]
    shifts = {f"shift{sh}": stat_triplet(pooled_stats(frames, f"shift{sh}")) for sh in SHIFTS}
    flip = stat_triplet(pooled_stats(frames, "flip"))
    neigh = neighbour_placebo(frames)
    per_inst = {}
    for b, rows, _ in frames:
        d1 = pooled_stats([(b, rows, None)], "real")
        per_inst[b["inst"].iloc[0]] = {**{k: (None if not np.isfinite(v) else round(v, 4)) for k, v in stat_triplet(d1).items()}, "days": int(len(b))}
    out = {"label": label, "kind": kind, "lag": lag, "days": n_days, "independent_days_ok": bool(n_days >= MIN_DAYS), "real": real, "ci": ci,
           "halves": halves, "shifts": shifts, "flip": flip, "per_instrument": per_inst}
    for k in ("T1", "T2", "T3"):
        pl = neigh[k][np.isfinite(neigh[k])]
        out[f"neighbour_{k}"] = {"p95": float(np.percentile(pl, 95)), "mean": float(pl.mean()), "n": int(len(pl))}
    return out


def verdict_cell(r, test):
    v = r["real"][test]
    if not np.isfinite(v) or not r["independent_days_ok"]:
        return "UNDERPOWERED"
    shift_max = max(s[test] for s in r["shifts"].values() if np.isfinite(s[test]))
    beats = v > shift_max and v > r[f"neighbour_{test}"]["p95"]
    halves_ok = all(np.isfinite(h[test]) and h[test] > 0 for h in r["halves"])
    ci_ok = r["ci"][test]["lo"] > 0
    size_ok = test != "T2" or v >= 0.05
    inst_ok = r["label"] != "FX" or sum(1 for i in r["per_instrument"].values() if i[test] is not None and i[test] > 0) >= 2
    return "PASS" if (v > 0 and beats and halves_ok and ci_ok and size_ok and inst_ok) else "FAIL"


def main():
    groups = {"FX": ["EUR_USD", "GBP_USD", "AUD_USD"], "FXINV": ["USD_JPY", "USD_CAD", "USD_CHF"], "NQ": ["NAS100_USD"]}
    results = []
    for kind in ("near", "all"):
        for label, names in groups.items():
            for lag in (1, 2):
                r = run_group(label, names, kind, lag)
                results.append(r)
                print(label, kind, "lag", lag, "days", r["days"], {t: round(r["real"][t], 4) if np.isfinite(r["real"][t]) else None for t in ("T1", "T2", "T3")},
                      "flip", {t: round(r["flip"][t], 4) if np.isfinite(r["flip"][t]) else None for t in ("T1", "T2")}, flush=True)
    primary = [r for r in results if r["lag"] == 1 and r["label"] in ("FX", "NQ")]
    pv = {f"{r['label']}-{r['kind']}-{t}": r["ci"][t]["p"] for r in primary for t in ("T1", "T2", "T3")}
    keep = bh(pv, 0.10)
    for r in results:
        for t in ("T1", "T2", "T3"):
            r.setdefault("cells", {})[t] = verdict_cell(r, t)
            r.setdefault("bh_survives", {})[t] = (f"{r['label']}-{r['kind']}-{t}" in keep) if r["lag"] == 1 and r["label"] in ("FX", "NQ") else None
    (OUT / "hedge_flow.json").write_text(json.dumps({"seed": SEED, "results": results, "bh_family": pv, "bh_kept": sorted(keep)}, indent=1, default=float))
    print("BH family", len(pv), "kept", sorted(keep))
    for r in results:
        print(r["label"], r["kind"], "lag", r["lag"], r["cells"], r["bh_survives"])


if __name__ == "__main__":
    main()
