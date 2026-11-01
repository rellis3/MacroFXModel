"""Score forge/ORDERFLOW_LEAD_PREREG.md. Seed 20261101. Reads the per-day RTH tick parquet files from pull_ticks.py.

    ORDERFLOW_TICKS=<dir> python scripts/orderflow-lead/score.py

Signal D(t) = (buy - sell)/(buy + sell) per 5-minute bar, tick rule. Outcome R(t,h) = log return from the bar close to h minutes
later over trailing 60-bar sigma x sqrt(h/5). Model: standardised OLS of R on [D(t), r(t), r(t-1)], scored quantity = slope on D(t).
Scored cells h = 5 and 15; h = 30, raw-delta and 30-minute-running variants and the hour-of-day slices are descriptive.
Session-block bootstrap (5-session blocks, B = 2000); placebo = D from the session k = 1..20 days later at the same bar.
"""
import json, os, sys
from pathlib import Path
import numpy as np, pandas as pd
from zoneinfo import ZoneInfo

SEED = 20261101
ROOT = Path(__file__).resolve().parents[2]
TICKS = Path(os.environ.get("ORDERFLOW_TICKS") or ROOT / "analysis/output/orderflow-lead/ticks")
OUT = ROOT / "analysis/output/orderflow-lead"
NY = ZoneInfo("America/New_York")
NB = 78            # 5-minute bars in 09:30-16:00
SIGW = 60          # trailing bars for sigma
LOCK = "2026-08-21"


def load_days():
    days = []
    for f in sorted(TICKS.glob("NQ_*.parquet")):
        d = f.stem[3:]
        if d > LOCK: continue
        t = pd.read_parquet(f)
        loc = pd.to_datetime(t.ts_ms, unit="ms", utc=True).dt.tz_convert(NY)
        mins = (loc.dt.hour * 60 + loc.dt.minute - 570).values
        price = t.price.values.astype("float64"); vol = t.vol.values.astype("float64")
        s = np.sign(np.diff(price, prepend=price[0])); s[s == 0] = np.nan
        s = pd.Series(s).ffill().fillna(0).values
        b = np.clip(mins // 5, 0, NB - 1)
        buy = np.bincount(b, weights=np.where(s > 0, vol, 0), minlength=NB); sell = np.bincount(b, weights=np.where(s < 0, vol, 0), minlength=NB)
        close = np.full(NB, np.nan); first = np.full(NB, np.nan)
        for i in range(NB):
            m = b == i
            if m.any(): close[i] = price[m][-1]; first[i] = price[m][0]
        if np.isnan(close).sum() > 3: continue                      # a thin or broken session
        close = pd.Series(close).ffill().values; first[0] = first[0] if not np.isnan(first[0]) else close[0]
        days.append(dict(day=d, buy=buy, sell=sell, close=close, open0=first[0]))
    return days


def build(days):
    """One row per bar with everything known at its close, per prereg section 3."""
    rows = []
    allr = []
    for k, dd in enumerate(days):
        c = dd["close"]; prev = np.r_[dd["open0"], c[:-1]]
        r = np.log(c / prev); dd["r"] = r; allr.append(r)
    cat = np.concatenate(allr)
    for k, dd in enumerate(days):
        base = k * NB
        for i in range(1, NB - 1):                    # bar 0 has no previous-bar return; last bar has no outcome
            j = base + i
            if j < SIGW: continue
            sig = cat[j - SIGW + 1: j + 1].std()
            if not sig > 0: continue
            tot = dd["buy"][i] + dd["sell"][i]
            if tot <= 0: continue
            rec = dict(k=k, i=i, D=(dd["buy"][i] - dd["sell"][i]) / tot, raw=dd["buy"][i] - dd["sell"][i], r0=dd["r"][i] / sig, r1=dd["r"][i - 1] / sig,
                       Dm1=(dd["buy"][i - 1] - dd["sell"][i - 1]) / max(1.0, dd["buy"][i - 1] + dd["sell"][i - 1]), sig=sig)
            lo = max(0, i - 5); bb = dd["buy"][lo:i + 1].sum(); ss = dd["sell"][lo:i + 1].sum(); rec["D30"] = (bb - ss) / max(1.0, bb + ss)
            for h in (5, 15, 30):
                n = h // 5
                rec[f"R{h}"] = np.log(dd["close"][i + n] / dd["close"][i]) / (sig * np.sqrt(n)) if i + n <= NB - 1 else np.nan
            rows.append(rec)
    return pd.DataFrame(rows)


def z(x): return (x - np.nanmean(x)) / np.nanstd(x)


def slope(df, sig, h, col="D"):
    d = df.dropna(subset=[f"R{h}", col])
    if len(d) < 200: return np.nan, len(d)
    X = np.column_stack([np.ones(len(d)), z(d[col].values), z(d.r0.values), z(d.r1.values)]); y = z(d[f"R{h}"].values)
    return np.linalg.lstsq(X, y, rcond=None)[0][1], len(d)


def block_boot(df, h, col, B, rng, blk=5):
    ks = np.array(sorted(df.k.unique())); starts = ks[: max(1, len(ks) - blk + 1)]
    by = {k: g for k, g in df.groupby("k")}
    out = np.empty(B)
    for b in range(B):
        pick = rng.choice(starts, size=int(np.ceil(len(ks) / blk)))
        ids = np.concatenate([ks[(ks >= s) & (ks < s + blk)] for s in pick])
        out[b] = slope(pd.concat([by[k] for k in ids]), None, h, col)[0]
    return out


def p_from_ci(est, lo, hi):
    from math import erf, sqrt
    se = (hi - lo) / 3.92; zz = abs(est) / se if se > 0 else 0
    return 1 - erf(zz / sqrt(2))


def placebo(df, h, kmax=20):
    """D from the session k days later at the same bar, against this session's outcome and controls."""
    res = []
    d0 = df.set_index(["k", "i"])
    for k in range(1, kmax + 1):
        sh = df.copy(); key = list(zip(sh.k + k, sh.i))
        m = d0["D"].reindex(pd.MultiIndex.from_tuples(key, names=["k", "i"])).values
        sh["D"] = m; sh = sh.dropna(subset=["D"])
        res.append(slope(sh, None, h)[0])
    return np.array(res)


def main():
    rng = np.random.default_rng(SEED)
    days = load_days(); df = build(days)
    nd = len(days); print("sessions", nd, "bars", len(df), flush=True)
    half = nd // 2; first = df[df.k < half]; second = df[df.k >= half]
    out = dict(seed=SEED, sessions=nd, first_day=days[0]["day"], last_day=days[-1]["day"], bars=int(len(df)), cells={}, descriptive={})
    pvals = {}
    for h in (5, 15):
        est, n = slope(df, None, h); bt = block_boot(df, h, "D", 2000, rng); lo, hi = np.percentile(bt, [2.5, 97.5])
        pl = placebo(df, h); plo, phi = np.percentile(pl, [2.5, 97.5])
        s1 = slope(first, None, h)[0]; s2 = slope(second, None, h)[0]
        se = float(bt.std()); mde = 3.08 * se
        p = p_from_ci(est, lo, hi); pvals[h] = p
        out["cells"][f"h{h}"] = dict(slope=float(est), n=n, ci=[float(lo), float(hi)], se=se, mde=float(mde), p=float(p), first_half=float(s1), second_half=float(s2),
                                      placebo_mean=float(pl.mean()), placebo_range=[float(plo), float(phi)], slope_prev_bar_flow=float(slope(df, None, h, "Dm1")[0]))
        print(h, out["cells"][f"h{h}"], flush=True)
    # Holm over the 2 scored cells
    order = sorted(pvals, key=pvals.get); holm_ok = {}
    for rank, h in enumerate(order):
        holm_ok[h] = pvals[h] <= 0.05 / (2 - rank)
        if not holm_ok[h]:
            for hh in order[rank:]: holm_ok[hh] = False
            break
    gate = {}
    for h in (5, 15):
        c = out["cells"][f"h{h}"]
        gate[h] = dict(size=abs(c["slope"]) >= 0.05, holm=bool(holm_ok.get(h, False)), halves=bool(np.sign(c["first_half"]) == np.sign(c["second_half"]) == np.sign(c["slope"])),
                       placebo=bool(c["slope"] < c["placebo_range"][0] or c["slope"] > c["placebo_range"][1]), powered=bool(c["mde"] <= 0.05))
        gate[h]["pass"] = all(gate[h][k] for k in ("size", "holm", "halves", "placebo"))
    out["gate"] = {f"h{h}": gate[h] for h in gate}
    allpass = all(gate[h]["pass"] for h in gate); allpowered = all(gate[h]["powered"] for h in gate)
    out["verdict"] = "VALIDATED" if allpass else ("NULL" if allpowered else "UNDERPOWERED")
    # descriptive
    out["descriptive"]["h30_slope"] = float(slope(df, None, 30)[0])
    out["descriptive"]["raw_delta_slope"] = {f"h{h}": float(slope(df, None, h, "raw")[0]) for h in (5, 15)}
    out["descriptive"]["running30_slope"] = {f"h{h}": float(slope(df, None, h, "D30")[0]) for h in (5, 15)}
    hours = {}
    for hr in range(9, 16):
        sub = df[(df.i * 5 + 570) // 60 == hr]
        hours[str(hr)] = {f"h{h}": float(slope(sub, None, h)[0]) for h in (5, 15)}
    out["descriptive"]["slope_by_hour_ny"] = hours
    OUT.mkdir(parents=True, exist_ok=True); (OUT / "results.json").write_text(json.dumps(out, indent=1, default=float))
    lines = [f"# orderflow-lead results", "", f"Sessions {nd} ({out['first_day']} to {out['last_day']}), bars {len(df)}, seed {SEED}.", "",
             "| cell | slope | 95% CI | MDE | halves | placebo range | size | Holm | halves ok | placebo ok |", "|---|---|---|---|---|---|---|---|---|---|"]
    for h in (5, 15):
        c = out["cells"][f"h{h}"]; g = gate[h]
        lines.append(f"| h={h} | {c['slope']:+.4f} | [{c['ci'][0]:+.4f}, {c['ci'][1]:+.4f}] | {c['mde']:.3f} | {c['first_half']:+.3f} / {c['second_half']:+.3f} | [{c['placebo_range'][0]:+.3f}, {c['placebo_range'][1]:+.3f}] (mean {c['placebo_mean']:+.4f}) | {g['size']} | {g['holm']} | {g['halves']} | {g['placebo']} |")
    lines += ["", f"**Verdict by the registered rule: {out['verdict']}**", "", "Descriptive (no pass weight): " + json.dumps(out["descriptive"], default=float)]
    (OUT / "RESULTS.md").write_text("\n".join(lines))
    print("verdict", out["verdict"])


if __name__ == "__main__":
    main()
