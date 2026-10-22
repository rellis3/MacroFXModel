"""cot-extreme-duration: does positioning that stays stretched for a long time relate to price,
and with what lag? Follow-up to cot-extreme-aftermath, asked generally rather than per bucket.

EXPLORATORY, NOT PRE-REGISTERED. Design fixed in this header before any outcome was computed.

Data
  COT: analysis/output/cot-extreme-duration/cot_weekly.csv (CFTC, 2006 ->, same spec definition
  and percentile as /api/cot-extremes: share of OI ranked against the prior up-to-155 weeks, needs 52).
  Price: Yahoo daily closes (prices_daily.csv): CME futures for FX (the COT contracts themselves;
  JPY/CAD/CHF inverted into pair terms), ICE DXY, GC, SI, NQ, ES, ZN. Weekly sampling only.
  P_k = first daily close on/after the release Friday (report Tuesday + 3 days); futures settle
  after the 15:30 ET release, so no lookahead. Nothing after 2026-08-21 (lockbox) is used.
  Signals from reports inside the 2018-19 and 2025 shutdowns (released weeks late) are excluded;
  their prices are still used as path points.

Notation
  s = "stretch": pct if pct >= 50 else 100 - pct; crowd = +1 if pct >= 50 else -1.
  Weekly return w_k = log(P_{k+1} / P_k); everything is crowd-signed (+ = price going the
  crowd's way) and in sigma units (sigma = std of the prior 52 weekly returns) unless stated.

Analyses
  A. Lag profile: for every extreme week t (pct >= 90 or <= 10), the mean crowd-signed weekly
     return in week t+L, L = -26 .. +52, and its cumulative sum (event-time path). Split by how
     long positioning had already been stretched: share of the prior 26 weeks at s >= 80 on the
     same side, < 1/3 ("recently arrived") vs >= 2/3 ("stretched for a long time").
     Comparison curve: PRICE extremes (trailing 26-week return at the 90th/10th percentile of its
     own prior 155 weeks), so COT can be compared with "price itself is overbought".
  B. Episodes: runs of extreme weeks, gaps of up to 2 non-extreme weeks merged. Grouped brief
     (1-3 weeks), medium (4-11), long (12+). Average crowd-signed cumulative price path around
     onset (-26 .. +52) and around the end (-26 .. +52). Per episode: week of the price peak in the
     crowd's direction (window onset-13 .. end+26), week of peak positioning (onset .. end); lags
     between them.
  C. Weakening: stretch level (50-70 / 70-90 / 90+) x 4-week change in s (building >= +10,
     steady, paring <= -10); forward 4 / 13 / 26 weeks. Plus "rolling over": s was >= 90 within
     the last 8 weeks and is now >= 20 points below that high.
  D. Dose: currently s >= 80, binned by the share of the prior 52 weeks spent at s >= 80 on the
     same side (< 25%, 25-50%, 50-75%, >= 75%); forward 4 / 13 / 26 / 52 weeks.
  E. Lead-lag: per market, corr(pct_t - 50, 4-week return over weeks t+L .. t+L+4), L = -52 ..
     +52; averaged across markets.

Stats: moving-block bootstrap over report dates (all markets on a date together), block = 26
weeks, 1000 reps; episodes resampled by onset quarter. Seed 20261022.
"""
import json, os

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT, "analysis/output/cot-extreme-duration")
SEED = 20261022
LOCKBOX = pd.Timestamp("2026-08-21")
SHUTDOWNS = [("2018-12-18", "2019-02-26"), ("2025-09-30", "2025-12-23")]
INVERT = {"JPY", "CAD", "CHF"}          # futures quote USD per unit -> pair terms
MARKETS = ["EUR", "GBP", "AUD", "JPY", "CAD", "CHF", "USD", "GOLD", "SILVER", "NQ", "ES", "TY"]
LAGS = np.arange(-26, 53)
XC_LAGS = np.arange(-52, 53)
BLOCK, REPS = 26, 1000


def pct_rank(x, i, lo=52, win=155):
    prior = x[max(0, i - win):i]
    prior = prior[np.isfinite(prior)]
    return round(100 * (prior < x[i]).sum() / len(prior)) if len(prior) >= lo and np.isfinite(x[i]) else np.nan


def build_panel():
    cot = pd.read_csv(os.path.join(OUT, "cot_weekly.csv"), parse_dates=["report_date"])
    cot = cot[cot.oi > 0]
    px = pd.read_csv(os.path.join(OUT, "prices_daily.csv"), parse_dates=["date"])
    px = px[px.date <= LOCKBOX]
    rows = []
    for sym in MARKETS:
        c = cot[cot.sym == sym].sort_values("report_date").reset_index(drop=True)
        p = px[px.sym == sym].set_index("date").close.sort_index()
        if sym in INVERT:
            p = 1 / p
        share = (c.spec_net / c.oi).values
        pct = np.array([pct_rank(share, i) for i in range(len(c))])
        rel = c.report_date + pd.Timedelta(days=3)
        j = p.index.searchsorted(rel.values, side="left")
        ok = j < len(p)
        P = np.where(ok, p.values[np.minimum(j, len(p) - 1)], np.nan)
        # a price more than 4 days after the release Friday is a data gap, not the entry
        gap_days = (p.index.values[np.minimum(j, len(p) - 1)] - rel.values).astype("timedelta64[D]").astype(int)
        late = ~ok | (gap_days > 4)
        P[late] = np.nan
        d = pd.DataFrame({"sym": sym, "report_date": c.report_date, "share": share, "pct": pct, "P": P})
        d["w"] = np.log(d.P.shift(-1) / d.P)                       # week k's return, known at k+1
        d["sigma"] = d.w.shift(1).rolling(52, min_periods=40).std()  # prior weeks only
        d["trail26"] = np.log(d.P / d.P.shift(26))
        d["trend_pct"] = [pct_rank(d.trail26.values, i, lo=104) for i in range(len(d))]
        bad = np.zeros(len(d), bool)
        for a, b in SHUTDOWNS:
            bad |= (d.report_date >= a) & (d.report_date <= b)
        d["sig_ok"] = ~bad & d.pct.notna() & d.sigma.notna() & d.P.notna()
        rows.append(d)
    panel = pd.concat(rows, ignore_index=True)
    panel["s"] = np.where(panel.pct >= 50, panel.pct, 100 - panel.pct)
    panel["crowd"] = np.where(panel.pct >= 50, 1, -1)
    panel["ext"] = (panel.pct >= 90) | (panel.pct <= 10)
    return panel


def per_market_arrays(panel):
    """Per market: arrays indexed by week for fast lag lookups."""
    out = {}
    for sym, d in panel.groupby("sym"):
        d = d.sort_values("report_date").reset_index(drop=True)
        same80 = lambda k: ((d.s >= 80) & (d.crowd == k)).astype(float)
        d["prior26_long"] = same80(1).shift(1).rolling(26, min_periods=26).mean()
        d["prior26_short"] = same80(-1).shift(1).rolling(26, min_periods=26).mean()
        d["prior52_long"] = same80(1).rolling(52, min_periods=52).mean()
        d["prior52_short"] = same80(-1).rolling(52, min_periods=52).mean()
        d["prior26"] = np.where(d.crowd > 0, d.prior26_long, d.prior26_short)
        d["prior52"] = np.where(d.crowd > 0, d.prior52_long, d.prior52_short)
        d["ds4"] = d.s - np.where(d.crowd > 0, d.pct.shift(4), 100 - d.pct.shift(4))
        # rolling over: was at an extreme within the last 8 weeks, now 20+ points back from it
        hi8, lo8 = d.pct.rolling(8, min_periods=1).max(), d.pct.rolling(8, min_periods=1).min()
        d["ro_dir"] = np.where((hi8 >= 90) & (d.pct <= hi8 - 20), 1, np.where((lo8 <= 10) & (d.pct >= lo8 + 20), -1, 0))
        out[sym] = d
    return out


def fwd(d, i, h):
    """Crowd-unsigned log return over weeks i .. i+h (NaN past the data)."""
    if i + h >= len(d) or not np.isfinite(d.P.iat[i]) or not np.isfinite(d.P.iat[i + h]):
        return np.nan
    return np.log(d.P.iat[i + h] / d.P.iat[i])


# ── bootstrap helpers ────────────────────────────────────────────────────────
def date_index(panel):
    dates = np.array(sorted(panel.report_date.unique()))
    return dates, {t: k for k, t in enumerate(dates)}


def boot_mean_by_date(vals, date_ids, n_dates, rng, reps=REPS, block=BLOCK):
    """vals: (n_obs, m) array (NaN allowed). Mean over obs; CI by moving blocks of dates."""
    vals = np.atleast_2d(vals.T).T if vals.ndim == 1 else vals
    m = vals.shape[1]
    S = np.zeros((n_dates, m)); N = np.zeros((n_dates, m))
    fin = np.isfinite(vals)
    np.add.at(S, date_ids, np.where(fin, vals, 0)); np.add.at(N, date_ids, fin)
    est = S.sum(0) / np.maximum(N.sum(0), 1)
    nb = int(np.ceil(n_dates / block))
    bs = np.empty((reps, m))
    for r in range(reps):
        st = rng.integers(0, n_dates - block + 1, nb)
        idx = (st[:, None] + np.arange(block)).ravel()
        bs[r] = S[idx].sum(0) / np.maximum(N[idx].sum(0), 1)
    return est, np.percentile(bs, 2.5, 0), np.percentile(bs, 97.5, 0), N.sum(0)


def summarise(est, lo, hi, n):
    return [{"est": round(float(a), 4), "lo": round(float(b), 4), "hi": round(float(c), 4), "n": int(k)}
            for a, b, c, k in zip(est, lo, hi, n)]


# ── A. lag profile ───────────────────────────────────────────────────────────
def lag_profile(arr, select, sign_col, rng, n_dates, pos):
    vals, dids = [], []
    for sym, d in arr.items():
        w = d.w.values; sig = d.sigma.values; sg = d[sign_col].values
        for i in np.where(select(d))[0]:
            row = np.full(len(LAGS), np.nan)
            for k, L in enumerate(LAGS):
                j = i + L
                if 0 <= j < len(d) and np.isfinite(w[j]):
                    row[k] = w[j] * sg[i] / sig[i]
            vals.append(row); dids.append(pos[d.report_date.iat[i]])
    vals = np.array(vals)
    est, lo, hi, n = boot_mean_by_date(vals, np.array(dids), n_dates, rng)
    # cumulative event-time path, anchored at 0 at the signal week (sum of weeks 0..L for L>=0,
    # minus sum of weeks L..-1 for L<0); CI for cumulative from the same bootstrap would need the
    # full matrix, so the path is reported as a point estimate and the weekly CIs carry the inference.
    cum = np.zeros(len(LAGS)); z = int(np.where(LAGS == 0)[0][0])
    cum[z:] = np.cumsum(est[z:])
    cum[:z] = -np.cumsum(est[:z][::-1])[::-1]
    # a cumulative CI over windows that matter: weeks 0..12, 0..25, 0..51
    win = {}
    for a, b in [(0, 4), (0, 13), (0, 26), (0, 52), (-26, 0)]:
        cols = (LAGS >= a) & (LAGS < b)
        sums = np.nansum(vals[:, cols], 1)
        okrow = np.isfinite(vals[:, cols]).all(1)
        e, l, h, nn = boot_mean_by_date(sums[okrow], np.array(dids)[okrow], n_dates, rng)
        win[f"{a}..{b}"] = {"est": round(float(e[0]), 3), "lo": round(float(l[0]), 3), "hi": round(float(h[0]), 3), "n": int(nn[0])}
    return {"n_signals": int(len(vals)), "weekly": summarise(est, lo, hi, n), "cum": [round(float(x), 3) for x in cum], "windows": win}


# ── B. episodes ──────────────────────────────────────────────────────────────
def find_episodes(arr, gap=2):
    eps = []
    for sym, d in arr.items():
        for side in (1, -1):
            hit = ((d.pct >= 90) if side > 0 else (d.pct <= 10)).values & d.sig_ok.values
            idx = np.where(hit)[0]
            if not len(idx):
                continue
            start = prev = idx[0]
            for k in list(idx[1:]) + [None]:
                if k is not None and k - prev <= gap + 1:
                    prev = k; continue
                eps.append({"sym": sym, "side": side, "on": int(start), "end": int(prev), "weeks": int(prev - start + 1)})
                if k is not None:
                    start = prev = k
    return eps


def episode_paths(arr, eps, rng):
    def path(d, i0, side, sig):
        out = np.full(len(LAGS), np.nan)
        if not np.isfinite(d.P.iat[i0]):
            return out
        for k, L in enumerate(LAGS):
            j = i0 + L
            if 0 <= j < len(d) and np.isfinite(d.P.iat[j]):
                out[k] = side * np.log(d.P.iat[j] / d.P.iat[i0]) / sig
        return out

    recs = []
    for e in eps:
        d = arr[e["sym"]]
        sig = d.sigma.iat[e["on"]]
        if not np.isfinite(sig):
            continue
        # end is "open" if the run touches the last scored week: its end isn't known yet
        is_open = e["end"] >= np.where(d.sig_ok)[0].max() - 2
        on_path = path(d, e["on"], e["side"], sig)
        end_path = path(d, e["end"], e["side"], sig)
        # per-episode lags (in weeks, relative to onset)
        lo_w, hi_w = max(0, e["on"] - 13), min(len(d) - 1, e["end"] + 26)
        cp = e["side"] * np.log(d.P.values[lo_w:hi_w + 1] / d.P.iat[e["on"]])
        price_peak = (lo_w + int(np.nanargmax(cp)) - e["on"]) if np.isfinite(cp).any() and hi_w - e["end"] >= 26 else None
        sh = e["side"] * d.share.values[e["on"]:e["end"] + 1]
        pos_peak = int(np.nanargmax(sh))
        recs.append({**e, "open": bool(is_open), "onset": str(d.report_date.iat[e["on"]].date()),
                     "q": str(d.report_date.iat[e["on"]].to_period("Q")), "on_path": on_path, "end_path": end_path,
                     "price_peak": price_peak, "pos_peak": pos_peak,
                     "into26": float(on_path[LAGS == -26][0] * -1) if np.isfinite(on_path[LAGS == -26][0]) else None})
    df = pd.DataFrame(recs)

    def avg(sel, col):
        sub = df[sel]
        M = np.vstack(sub[col].values)
        est = np.nanmean(M, 0)
        qs = sub.q.values; uq = np.unique(qs)
        bs = []
        for _ in range(REPS):
            pick = rng.choice(uq, len(uq))
            rows = np.concatenate([np.where(qs == q)[0] for q in pick])
            bs.append(np.nanmean(M[rows], 0))
        bs = np.array(bs)
        return {"n": int(len(sub)), "est": [round(float(x), 3) for x in est],
                "lo": [round(float(x), 3) for x in np.nanpercentile(bs, 2.5, 0)],
                "hi": [round(float(x), 3) for x in np.nanpercentile(bs, 97.5, 0)]}

    groups = {"brief (1-3 wks)": df.weeks <= 3, "medium (4-11 wks)": (df.weeks >= 4) & (df.weeks <= 11), "long (12+ wks)": df.weeks >= 12}
    res = {"n": int(len(df)), "onset": {}, "end": {}, "lags": {}, "peak_after_onset_curve": {}}
    for g, sel in groups.items():
        res["onset"][g] = avg(sel, "on_path")
        res["end"][g] = avg(sel & ~df.open, "end_path")
        sub = df[sel & df.price_peak.notna()]
        pp = sub.price_peak.astype(float)
        res["lags"][g] = {
            "n": int(len(sub)),
            "price_peak_after_onset_median": float(pp.median()), "iqr": [float(pp.quantile(.25)), float(pp.quantile(.75))],
            "price_peak_before_onset_share": float((pp < 0).mean()),
            "price_peak_vs_positioning_peak_median": float((pp - sub.pos_peak).median()),
            "price_peaked_first_share": float((pp < sub.pos_peak).mean()),
            "price_peak_vs_end_median": float((pp - sub.weeks + 1).median()),
            "price_peak_after_end_share": float((pp > sub.weeks - 1).mean()),
            "weeks_median": float(sub.weeks.median()),
        }
    df.drop(columns=["on_path", "end_path"]).to_csv(os.path.join(OUT, "episodes.csv"), index=False)
    return res


# ── C / D: conditional forward returns ───────────────────────────────────────
def cond_fwd(arr, select, horizons, rng, n_dates, pos, sign="crowd"):
    vals, dids = [], []
    for sym, d in arr.items():
        m = select(d)
        sel = np.where(np.asarray(m.fillna(False) if hasattr(m, "fillna") else m, bool))[0]
        for i in sel:
            sg = d[sign].iat[i]; sig = d.sigma.iat[i]
            vals.append([sg * fwd(d, i, h) / (sig * np.sqrt(h)) for h in horizons])
            dids.append(pos[d.report_date.iat[i]])
    if not vals:
        return None
    est, lo, hi, n = boot_mean_by_date(np.array(vals), np.array(dids), n_dates, rng)
    hit = np.nanmean(np.array(vals) > 0, 0)
    return {f"{h}w": {"est": round(float(e), 3), "lo": round(float(l), 3), "hi": round(float(u), 3), "n": int(k), "hit": round(float(t), 3)}
            for h, e, l, u, k, t in zip(horizons, est, lo, hi, n, hit)}


# ── E: lead-lag correlation ──────────────────────────────────────────────────
def lead_lag(arr, rng, n_dates, pos):
    per = {}
    allv = {L: [] for L in XC_LAGS}
    for sym, d in arr.items():
        x = (d.pct - 50).where(d.sig_ok).values
        logp = np.log(d.P.values)
        r4 = np.r_[logp[4:] - logp[:-4], [np.nan] * 4]   # return over weeks k .. k+4
        cs = []
        for L in XC_LAGS:
            y = np.roll(r4, -L).astype(float)
            if L > 0: y[-L:] = np.nan
            if L < 0: y[:-L] = np.nan
            m = np.isfinite(x) & np.isfinite(y)
            cs.append(float(np.corrcoef(x[m], y[m])[0, 1]) if m.sum() > 100 else np.nan)
        per[sym] = [round(c, 3) for c in cs]
    M = np.array(list(per.values()))
    avg = np.nanmean(M, 0)
    # bootstrap: resample date blocks, recompute per-market correlations on the resampled rows
    D = {sym: d for sym, d in arr.items()}
    ids = {sym: np.array([pos[t] for t in d.report_date]) for sym, d in D.items()}
    bs = []
    nb = int(np.ceil(n_dates / BLOCK))
    pre = {}
    for sym, d in D.items():
        x = (d.pct - 50).where(d.sig_ok).values
        logp = np.log(d.P.values)
        r4 = np.r_[logp[4:] - logp[:-4], [np.nan] * 4]
        Y = np.full((len(d), len(XC_LAGS)), np.nan)
        for k, L in enumerate(XC_LAGS):
            j = np.arange(len(d)) + L
            okj = (j >= 0) & (j < len(d))
            Y[okj, k] = r4[j[okj]]
        pre[sym] = (x, Y, ids[sym])
    for r in range(200):
        st = rng.integers(0, n_dates - BLOCK + 1, nb)
        pick = (st[:, None] + np.arange(BLOCK)).ravel()
        cnt = np.bincount(pick, minlength=n_dates)
        rows = []
        for sym, (x, Y, di) in pre.items():
            wgt = cnt[di].astype(float)
            m = np.isfinite(x)[:, None] & np.isfinite(Y) & (wgt[:, None] > 0)
            W = wgt[:, None] * m
            xs = np.where(m, x[:, None], 0); ys = np.where(m, Y, 0)
            sw = W.sum(0)
            mx = (W * xs).sum(0) / sw; my = (W * ys).sum(0) / sw
            cov = (W * (xs - mx) * (ys - my)).sum(0) / sw
            vx = (W * (xs - mx) ** 2).sum(0) / sw; vy = (W * (ys - my) ** 2).sum(0) / sw
            rows.append(cov / np.sqrt(vx * vy))
        bs.append(np.nanmean(np.array(rows), 0))
    bs = np.array(bs)
    return {"lags": XC_LAGS.tolist(), "avg": [round(float(a), 3) for a in avg],
            "lo": [round(float(a), 3) for a in np.percentile(bs, 2.5, 0)],
            "hi": [round(float(a), 3) for a in np.percentile(bs, 97.5, 0)], "per_market": per}


def main():
    rng = np.random.default_rng(SEED)
    panel = build_panel()
    arr = per_market_arrays(panel)
    dates, pos = date_index(panel)
    nd = len(dates)
    scored = panel[panel.sig_ok]
    res = {"id": "cot-extreme-duration", "seed": SEED, "label": "exploratory, not pre-registered",
           "window": [str(scored.report_date.min().date()), str(scored.report_date.max().date())],
           "markets": MARKETS, "n_weeks": int(len(scored)), "n_extreme_weeks": int(scored.ext.sum())}

    ext = lambda d: d.sig_ok & d.ext
    res["A"] = {
        "all COT extremes": lag_profile(arr, ext, "crowd", rng, nd, pos),
        "COT extreme, recently arrived": lag_profile(arr, lambda d: ext(d) & (d.prior26 < 1 / 3), "crowd", rng, nd, pos),
        "COT extreme, stretched for a long time": lag_profile(arr, lambda d: ext(d) & (d.prior26 >= 2 / 3), "crowd", rng, nd, pos),
    }
    for sym, d in arr.items():
        d["trend_dir"] = np.where(d.trend_pct >= 50, 1, -1)
    res["A"]["PRICE extremes (26-wk move at 90th/10th pct)"] = lag_profile(
        arr, lambda d: d.sig_ok & ((d.trend_pct >= 90) | (d.trend_pct <= 10)), "trend_dir", rng, nd, pos)

    eps = find_episodes(arr)
    res["B"] = episode_paths(arr, eps, rng)

    H = [4, 13, 26]
    lvl = {"50-70": (50, 70), "70-90": (70, 90), "90+": (90, 101)}
    chg = {"building": lambda d: d.ds4 >= 10, "steady": lambda d: d.ds4.abs() < 10, "paring": lambda d: d.ds4 <= -10}
    res["C"] = {}
    for ln, (a, b) in lvl.items():
        for cn, cf in chg.items():
            res["C"][f"{ln} / {cn}"] = cond_fwd(arr, lambda d, a=a, b=b, cf=cf: d.sig_ok & (d.s >= a) & (d.s < b) & cf(d), H, rng, nd, pos)
    res["C"]["rolling over (was 90+ within 8 wks, now 20+ pts lower)"] = cond_fwd(
        arr, lambda d: d.sig_ok & (d.ro_dir != 0), H, rng, nd, pos, sign="ro_dir")
    res["C"]["all weeks (crowd = side of 50)"] = cond_fwd(arr, lambda d: d.sig_ok, H, rng, nd, pos)

    H2 = [4, 13, 26, 52]
    res["D"] = {}
    for lab, a, b in [("<25%", 0, .25), ("25-50%", .25, .5), ("50-75%", .5, .75), (">=75%", .75, 1.01)]:
        res["D"][lab] = cond_fwd(arr, lambda d, a=a, b=b: d.sig_ok & (d.s >= 80) & (d.prior52 >= a) & (d.prior52 < b), H2, rng, nd, pos)

    res["E"] = lead_lag(arr, rng, nd, pos)

    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=lambda x: None if isinstance(x, float) and np.isnan(x) else str(x))
    print("weeks", res["n_weeks"], "extreme", res["n_extreme_weeks"], "episodes", res["B"]["n"], res["window"])


if __name__ == "__main__":
    main()
