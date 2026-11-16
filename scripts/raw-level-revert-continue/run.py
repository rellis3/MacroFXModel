"""raw-level-revert-continue — exploratory, not pre-registered (owner 2026-11-15).

Question: strip out the vol forecast / Vol Atlas. Build each day's lines only from the instrument's own
trailing raw session excursions, then ask, at every first touch of a line:
  REVERT  fade it, target the line one rung back toward the open, stop at the line one rung further out
  CONTINUE follow it, the mirror trade (target one rung out, stop one rung back)
and HOLD   fade / follow from the touch to the session close with no stop or target.

Lines (session i, from sessions < i only, trailing 250 sessions, min 120):
  EXT  open + q(OH),   open - q(OL)         q in {p50, p75, p90}
  HL   open +/- q(HL)/2                      (range centred on the open)
  OC   open +/- q(|OC|)
Ladder per side: open(0) < p50 < p75 < p90 < p90x, where p90x = p90 + (p90 - p75) gives the p90 trade an
outside rung. Session = London date, 00:00-22:00 London, weekdays. Data: 15-minute CLOSE-only bars (the
research M1 cache is not in the cloud session); all touches, targets and stops are judged on 15-minute
closes, entry is the close of the bar that first closes beyond the line (both rules enter at the same price,
so REVERT and CONTINUE are exact mirrors gross of costs). Trades that reach neither rung by 22:00 London are
closed at the last close and KEPT (the friend's test dropped them; that is a selection bias).

Placebo: for every real touch, 20 draws of the same trade (same % distance to target and stop, same bar
index in the session) placed in a random other session of the same instrument within +/-60 sessions.
Edge = real - placebo. Date-clustered bootstrap (sessions resampled), seed 20261115.

Costs: one median spread per round trip, by instrument and year, from analysis/output/costs/
spread_profile_hist.json (OANDA history). XAG and BCO have no profile: flat 0.08% and 0.04% (assumed).

Run: python -I scripts/raw-level-revert-continue/run.py
Out: analysis/output/raw-level-revert-continue/{results.json, trades.csv.gz, RESULTS_TABLES.md}
"""
import json, gzip, os, sys
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
M15 = os.path.join(ROOT, "analysis/output/rates_residual/m15")
OUT = os.path.join(ROOT, "analysis/output/raw-level-revert-continue")
SEED = 20261115
LOCKBOX_LAST = pd.Timestamp("2026-08-21")
SCORE_FROM = pd.Timestamp("2019-01-01")
LOOKBACK, MIN_HIST = 250, 120
N_PLACEBO, PLACEBO_WIN = 20, 60
N_BOOT = 1000
QS = [50, 75, 90]
RUNGS = ["open", "p50", "p75", "p90", "p90x"]

INSTR = {  # file -> (label, class, spread-profile key or flat % cost)
    "EUR_USD": ("EURUSD", "FX", "eurusd"), "GBP_USD": ("GBPUSD", "FX", "gbpusd"),
    "AUD_USD": ("AUDUSD", "FX", "audusd"), "USD_JPY": ("USDJPY", "FX", "usdjpy"),
    "USD_CAD": ("USDCAD", "FX", "usdcad"), "USD_CHF": ("USDCHF", "FX", "usdchf"),
    "XAU_USD": ("GOLD", "Metal", "gold"), "XAG_USD": ("SILVER", "Metal", 0.0008),
    "NAS100_USD": ("NQ", "Index", "nq"), "SPX500_USD": ("SPX", "Index", "spx"),
    "DE30_EUR": ("DAX", "Index", "dax"), "BCO_USD": ("BRENT", "Energy", 0.0004),
}

SPREADS = json.load(open(os.path.join(ROOT, "analysis/output/costs/spread_profile_hist.json")))


def cost_frac(key, year, price):
    if isinstance(key, float):
        return key
    prof = SPREADS[key]
    by = prof["by_year"].get(str(year)) or prof["by_year"][max(prof["by_year"])]
    return by["med_pips"] * prof["pip"] / price


def sessions(file):
    s = pd.read_parquet(os.path.join(M15, file + ".parquet"))["close"].dropna()
    idx = s.index.tz_localize("UTC").tz_convert("Europe/London")
    df = pd.DataFrame({"c": s.values, "t": idx})
    df["d"] = df["t"].dt.tz_localize(None).dt.normalize()
    df["hr"] = df["t"].dt.hour + df["t"].dt.minute / 60
    df = df[(df["hr"] < 22) & (df["d"].dt.weekday < 5) & (df["d"] <= LOCKBOX_LAST)]
    out = []
    for d, g in df.groupby("d", sort=True):
        if len(g) < 40:
            continue
        out.append((d, g["c"].to_numpy(float), g["hr"].to_numpy(float)))
    return out


def walk(path, j, entry, up_lvl, dn_lvl):
    """From bar j+1 on, first close >= up_lvl -> +1, <= dn_lvl -> -1, else 0. Returns (sign, exit_px, k)."""
    seg = path[j + 1:]
    hu = np.nonzero(seg >= up_lvl)[0]
    hd = np.nonzero(seg <= dn_lvl)[0]
    iu = hu[0] if len(hu) else 10**9
    idn = hd[0] if len(hd) else 10**9
    if iu == idn == 10**9:
        return 0, path[-1], len(path) - 1
    if iu < idn:
        return 1, seg[iu], j + 1 + iu
    return -1, seg[idn], j + 1 + idn


def main():
    rng = np.random.default_rng(SEED)
    rows = []
    gapped = {}
    for file, (lab, klass, ckey) in INSTR.items():
        S = sessions(file)
        dates = [x[0] for x in S]
        o = np.array([x[1][0] for x in S])
        hi = np.array([x[1].max() for x in S]); lo = np.array([x[1].min() for x in S])
        cl = np.array([x[1][-1] for x in S])
        OH, OL, HL, OC = hi / o - 1, 1 - lo / o, (hi - lo) / o, np.abs(cl / o - 1)
        ret = cl / o - 1
        scored = [i for i in range(len(S)) if dates[i] >= SCORE_FROM and i >= MIN_HIST]
        gapped[lab] = 0
        for i in scored:
            a = max(0, i - LOOKBACK)
            d, path, hrs = S[i]
            op = path[0]
            fams = {
                "EXT": ([np.percentile(OH[a:i], q) for q in QS], [np.percentile(OL[a:i], q) for q in QS]),
                "HL": ([np.percentile(HL[a:i], q) / 2 for q in QS],) * 2,
                "OC": ([np.percentile(OC[a:i], q) for q in QS],) * 2,
            }
            # context, all from sessions < i
            prev_rank = (HL[a:i] < HL[i - 1]).mean()
            trend5 = np.sign(np.prod(1 + ret[i - 5:i]) - 1)
            yr = d.year
            for fam, (ups, dns) in fams.items():
                for side, qv in (("up", ups), ("dn", dns)):
                    ext = [0.0] + list(qv) + [qv[2] + (qv[2] - qv[1])]
                    sg = 1 if side == "up" else -1
                    lv = [op * (1 + sg * e) for e in ext]
                    for k in (1, 2, 3):
                        L = lv[k]
                        hit = np.nonzero(path[1:] >= L)[0] if sg > 0 else np.nonzero(path[1:] <= L)[0]
                        if not len(hit):
                            continue
                        j = hit[0] + 1
                        entry = path[j]
                        inner, outer = lv[k - 1], lv[k + 1]
                        beyond = (entry >= outer) if sg > 0 else (entry <= outer)
                        if beyond:
                            gapped[lab] += 1
                            continue
                        up_l, dn_l = (outer, inner) if sg > 0 else (inner, outer)
                        s_, px, kx = walk(path, j, entry, up_l, dn_l)
                        # fade P&L (fraction of entry): short at upper, long at lower
                        fade = -sg * (px / entry - 1)
                        fade_hold = -sg * (path[-1] / entry - 1)
                        res = "neither" if s_ == 0 else ("revert" if s_ * sg < 0 else "continue")
                        dist_in = abs(entry - inner) / entry
                        dist_out = abs(outer - entry) / entry
                        # placebo: same geometry, same bar index, random nearby session
                        pl_fade, pl_hold, pl_rev, pl_cont = [], [], [], []
                        lo_i, hi_i = max(MIN_HIST, i - PLACEBO_WIN), min(len(S) - 1, i + PLACEBO_WIN)
                        tries = 0
                        while len(pl_fade) < N_PLACEBO and tries < N_PLACEBO * 5:
                            tries += 1
                            m = int(rng.integers(lo_i, hi_i + 1))
                            if m == i:
                                continue
                            pp = S[m][1]
                            if j >= len(pp) - 1:
                                continue
                            e2 = pp[j]
                            in2 = e2 * (1 - sg * dist_in); out2 = e2 * (1 + sg * dist_out)
                            u2, d2 = (out2, in2) if sg > 0 else (in2, out2)
                            s2, px2, _ = walk(pp, j, e2, u2, d2)
                            pl_fade.append(-sg * (px2 / e2 - 1))
                            pl_hold.append(-sg * (pp[-1] / e2 - 1))
                            pl_rev.append(s2 != 0 and s2 * sg < 0)
                            pl_cont.append(s2 != 0 and s2 * sg > 0)
                        rows.append(dict(
                            inst=lab, klass=klass, date=d.strftime("%Y-%m-%d"), year=yr, fam=fam, side=side,
                            rung=RUNGS[k], touch_hr=float(hrs[j]), entry=entry, res=res,
                            fade=fade, fade_hold=fade_hold, cost=cost_frac(ckey, yr, entry),
                            risk=dist_out, reward=dist_in, bars_to_exit=kx - j,
                            pl_fade=float(np.mean(pl_fade)) if pl_fade else np.nan,
                            pl_hold=float(np.mean(pl_hold)) if pl_hold else np.nan,
                            pl_rev=float(np.mean(pl_rev)) if pl_rev else np.nan,
                            pl_cont=float(np.mean(pl_cont)) if pl_cont else np.nan,
                            prev_hl_rank=float(prev_rank), trend5=float(trend5),
                            with_trend=bool(trend5 == sg),
                        ))
        print(lab, len(S), "sessions,", sum(r["inst"] == lab for r in rows), "touches,", gapped[lab], "gapped", file=sys.stderr)
    T = pd.DataFrame(rows)
    os.makedirs(OUT, exist_ok=True)
    T.to_csv(os.path.join(OUT, "trades.csv.gz"), index=False, compression="gzip")
    json.dump({"gapped": gapped, "seed": SEED}, open(os.path.join(OUT, "_build_meta.json"), "w"))
    print("rows", len(T), file=sys.stderr)


if __name__ == "__main__":
    main()
