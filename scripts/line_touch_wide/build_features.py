"""Feature + target table for the line-touch wide scan (forge/LINE_TOUCH_WIDE_SCAN_PREREG.md).

One row per touch in analysis/output/line-touch-response. Every feature uses M1 bars up to and including the touch bar.
Targets are signed in the continuation direction and divided by the day's expected range (dayScale).

    python scripts/line_touch_wide/build_features.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

ROOT = Path(__file__).resolve().parents[2]
RESP = ROOT / "analysis/output/line-touch-response"
M1 = ROOT / "VolRangeForecaster/data/m1"
OUT = ROOT / "analysis/output/line_touch_wide_scan"
OUT.mkdir(parents=True, exist_ok=True)

FEATS = ["mv5", "mv15", "mv30", "mv60", "eff15", "eff60", "near60",
         "body1", "wf1", "wb1", "rng1", "body3", "wf3", "wb3", "rng3", "body5", "wf5", "wb5", "rng5",
         "since_counter", "vwap_dist", "vwap_slope", "rsi14", "vol15", "used", "pos", "since_ext"]
NF = len(FEATS)
R_FRAC, TP_R = 0.10, 3.0


@njit(cache=True)
def window(o, h, l, c, k, w):
    """5*w minute window ending at k: open, high, low, close."""
    a = k - 5 * w + 1
    hi, lo = h[a], l[a]
    for j in range(a, k + 1):
        if h[j] > hi:
            hi = h[j]
        if l[j] < lo:
            lo = l[j]
    return o[a], hi, lo, c[k]


@njit(cache=True)
def sim(h, l, c, k, e, dirn, R):
    """Structure: stop 1R, after +1R lock +0.5R then trail 1R behind the extreme, exit 3R or end bar. Returns R."""
    entry = c[k]
    stop = entry - dirn * R
    ext = entry
    trailing = False
    for j in range(k + 1, e + 1):
        adv = l[j] if dirn > 0 else h[j]          # adverse extreme of this bar
        fav = h[j] if dirn > 0 else l[j]
        if (adv - stop) * dirn <= 0:               # stop hit first (conservative within a bar)
            return (stop - entry) * dirn / R
        if (fav - ext) * dirn > 0:
            ext = fav
        if (ext - entry) * dirn >= TP_R * R:
            return TP_R
        if (ext - entry) * dirn >= R:
            trailing = True
        if trailing:
            ns = ext - dirn * R
            lock = entry + dirn * 0.5 * R
            if (ns - lock) * dirn < 0:
                ns = lock
            if (ns - stop) * dirn > 0:
                stop = ns
    return (c[e] - entry) * dirn / R


@njit(cache=True)
def build(o, h, l, c, v, cpv, cv, ks, ss, es, dirs, levels, scales):
    n = len(ks)
    X = np.full((n, NF), np.nan)
    TC = np.full(n, np.nan)
    TF = np.full(n, np.nan)
    for i in range(n):
        k, s, e, d, lev, sc = ks[i], ss[i], es[i], dirs[i], levels[i], scales[i]
        if k < 80 or sc <= 0 or e <= k:
            continue
        for q, wlen in enumerate((5, 15, 30, 60)):
            X[i, q] = (c[k] - c[k - wlen]) * d / sc
        for q, wlen in ((4, 15), (5, 60)):
            path = 0.0
            for j in range(k - wlen + 1, k + 1):
                path += abs(c[j] - c[j - 1])
            X[i, q] = abs(c[k] - c[k - wlen]) / path if path > 0 else np.nan
        cnt = 0
        for j in range(k - 59, k + 1):
            if abs(c[j] - lev) < 0.1 * sc:
                cnt += 1
        X[i, 6] = cnt / 60.0
        for q, w in enumerate((1, 3, 5)):
            wo, wh, wl, wc = window(o, h, l, c, k, w)
            rg = wh - wl
            base = 7 + 4 * q
            if rg > 0:
                X[i, base] = (wc - wo) * d / rg
                top, bot = max(wo, wc), min(wo, wc)
                if d > 0:
                    X[i, base + 1], X[i, base + 2] = (wh - top) / rg, (bot - wl) / rg
                else:
                    X[i, base + 1], X[i, base + 2] = (bot - wl) / rg, (wh - top) / rg
            X[i, base + 3] = rg / sc
        sc_n = 6
        for m in range(1, 7):                      # M5 bars back from the touch, colour vs direction
            wo, wh, wl, wc = window(o, h, l, c, k - 5 * (m - 1), 1)
            if (wc - wo) * d < 0:
                sc_n = m - 1
                break
        X[i, 19] = sc_n
        den = cv[k] - cv[s - 1] if s > 0 else cv[k]
        num = cpv[k] - cpv[s - 1] if s > 0 else cpv[k]
        if den > 0:
            vw = num / den
            X[i, 20] = (c[k] - vw) * d / sc
            k30 = k - 30
            if k30 > s:
                den2 = cv[k30] - cv[s - 1]
                if den2 > 0:
                    X[i, 21] = (vw - (cpv[k30] - cpv[s - 1]) / den2) * d / sc
        gain, loss = 0.0, 0.0
        for m in range(14):                        # RSI(14) on M5 closes sampled back from the touch
            dlt = c[k - 5 * m] - c[k - 5 * (m + 1)]
            if dlt > 0:
                gain += dlt
            else:
                loss -= dlt
        X[i, 22] = 100.0 * gain / (gain + loss) if gain + loss > 0 else 50.0
        if d < 0:
            X[i, 22] = 100.0 - X[i, 22]
        v15 = 0.0
        for j in range(k - 14, k + 1):
            v15 += v[j]
        vb = 0.0
        for j in range(k - 74, k - 14):
            vb += v[j]
        if vb > 0:
            X[i, 23] = v15 / (vb / 4.0)
        rhi, rlo, ihi, ilo = h[s], l[s], s, s
        for j in range(s, k + 1):
            if h[j] > rhi:
                rhi, ihi = h[j], j
            if l[j] < rlo:
                rlo, ilo = l[j], j
        X[i, 24] = (rhi - rlo) / sc
        if rhi > rlo:
            p = (c[k] - rlo) / (rhi - rlo)
            X[i, 25] = p if d > 0 else 1.0 - p
        X[i, 26] = (k - (ihi if d > 0 else ilo))
        TC[i] = sim(h, l, c, k, e, d, R_FRAC * sc)
        TF[i] = sim(h, l, c, k, e, -d, R_FRAC * sc)
    return X, TC, TF


def one(pair):
    j = json.load(open(RESP / f"{pair}-response.json"))
    m = pd.read_parquet(M1 / f"{pair}_m1.parquet")
    if "time" in m.columns:                       # dow / spx store the timestamp as a column
        m = m.set_index(pd.DatetimeIndex(pd.to_datetime(m["time"], utc=True)))
    if m.index.tz is None:
        m.index = m.index.tz_localize("UTC")
    m = m[~m.index.duplicated()].sort_index()
    tt = np.asarray(m.index.tz_convert("UTC").tz_localize(None), dtype="datetime64[s]").astype("int64")
    o, h, l, c = (m[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    v = m["volume"].fillna(0).to_numpy(float)
    tp = (h + l + c) / 3.0
    cpv, cv = np.cumsum(tp * v), np.cumsum(v)
    rows, prev = [], None
    rr = []                                         # (realised/dayScale) history for the 20d regime ratio
    for dd in j["days"]:
        scale = dd["dayScale"]
        ratio = float(np.mean(rr[-20:])) if len(rr) >= 5 else np.nan
        prev_ret = (dd["open"] - prev["open"]) / prev["dayScale"] if prev else np.nan
        prev_rng = prev["realizedRange"] / prev["dayScale"] if prev else np.nan
        ts = sorted(dd["touches"], key=lambda x: x["t"])
        for q, x in enumerate(ts):
            last15 = np.nan
            for y in reversed(ts[:q]):
                if y["t"] + 900 <= x["t"]:
                    last15 = y["ret"][1] / scale
                    break
            rows.append(dict(pair=pair, date=dd["date"], t=x["t"], family=x["family"], rung=(int(x["rung"]) if str(x["rung"]).isdigit() else 0),
                             side=1 if x["side"] == "up" else -1, hour=x["hourUtc"], minsIn=x["minsIn"],
                             minsLeft=x["minsLeft"], level=x["level"], open=dd["open"], scale=scale,
                             lvl_dist=(x["level"] - dd["open"]) / scale, day_ratio20=ratio,
                             prev_ret=prev_ret, prev_rng=prev_rng, n_prior=q, last_prior15=last15,
                             ret60=x["ret"][3] / scale, ret120=x["ret"][4] / scale,
                             mfe60=x["mfe"][3] / scale, mae60=x["mae"][3] / scale))
        rr.append(dd["realizedRange"] / scale)
        prev = dd
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    ks = np.searchsorted(tt, df.t.to_numpy(), side="left")
    ss = np.searchsorted(tt, (df.t - df.minsIn * 60).to_numpy(), side="left")
    es = np.minimum(np.searchsorted(tt, (df.t + df.minsLeft * 60).to_numpy(), side="right") - 1, len(tt) - 1)
    ok = (ks < len(tt)) & (tt[np.minimum(ks, len(tt) - 1)] == df.t.to_numpy())
    X, TC, TF = build(o, h, l, c, v, cpv, cv, ks.astype(np.int64), ss.astype(np.int64), es.astype(np.int64),
                      df.side.to_numpy(float), df.level.to_numpy(float), df.scale.to_numpy(float))
    for q, nm in enumerate(FEATS):
        df[nm] = X[:, q]
    df["R_cont"], df["R_fade"] = TC, TF
    df["matched"] = ok
    return df


if __name__ == "__main__":
    pairs = sorted(p.stem.replace("-response", "") for p in RESP.glob("*-response.json"))
    parts = []
    for p in pairs:
        d = one(p)
        print(p, len(d), "matched %.3f" % d.matched.mean(), "nan-feat %.3f" % d[FEATS].isna().any(axis=1).mean(),
              "R_cont mean %.3f" % d.R_cont.mean(), flush=True)
        parts.append(d)
    out = pd.concat(parts, ignore_index=True)
    out.to_parquet(OUT / "features.parquet")
    print("rows", len(out), "->", OUT / "features.parquet")
