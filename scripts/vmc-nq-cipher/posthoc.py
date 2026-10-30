"""vmc-nq-cipher POST-HOC checks on the validated volatility cells (F1c, V12). Demote or describe only; nothing here can
promote a cell (prereg Amendments, A1).

  a) news: drop events within 60 min before / 120 min after a US Major-impact release (calendar_events.csv, UTC)
  b) recent range: add the prior 12-bar range (high-low, sigma-sqrt12 units) quintile to the baseline strata
  c) is it the cross? mid-range bars (|wt1| < 20) WITHOUT a cross, sampled every 12 bars, scored the same way
  d) concentration: by year, and without the top 1% of event outcomes
Both periods are reported (discovery and validation).

    python -I scripts/vmc-nq-cipher/posthoc.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import events as ev_mod  # noqa: E402
import score  # noqa: E402
import vmcds  # noqa: E402

CAL = Path(sys.argv[1]) if len(sys.argv) > 1 else score.ROOT / "calendar_events.csv"


def news_times():
    c = pd.read_csv(CAL, encoding="latin-1", usecols=["datetime_raw", "country", "impact"])
    c = c[(c.country == "United States") & (c.impact.astype(str).str.lower() == "major")]
    t = pd.to_datetime(c.datetime_raw, errors="coerce", utc=True).dropna()
    return np.sort(((t - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()).astype("int64").unique())


def near_news(tc, nt, before=3600, after=7200):
    j = np.searchsorted(nt, tc)
    nxt = np.where(j < len(nt), nt[np.minimum(j, len(nt) - 1)], 10**12)
    prv = np.where(j > 0, nt[np.maximum(j - 1, 0)], -10**12)
    return ((nxt - tc) <= before) | ((tc - prv) <= after)


def main():
    nt = news_times()
    res = {"news_events_us_major": int(len(nt))}
    for tf in (1, 3, 5, 30):
        ev, f, o, key, period = score.prepare(tf, vmcds.load, ev_mod)
        c, hi, lo, sg = (f[k].to_numpy(float) for k in ("close", "high", "low", "sigma"))
        rng = (pd.Series(hi).rolling(12).max() - pd.Series(lo).rolling(12).min()).to_numpy() / (sg * c * np.sqrt(12))
        td = f.trade_date.astype(str).to_numpy()
        tc = f.t_close.to_numpy()
        out = {}
        for which in ("disc", "val"):
            per = (period == which).to_numpy()
            boot = score.Boot(td[per], 2000, score.SEED)
            mask = per & (key >= 0)
            mu = score.baseline_means(key, o, mask)
            disc_mask = (period == "disc").to_numpy()
            qr = np.nanquantile(rng[disc_mask], [0.2, 0.4, 0.6, 0.8])
            key2 = np.where(np.isfinite(rng), key * 10 + np.searchsorted(qr, rng), -1)
            key2 = np.where(key >= 0, key2, -1)
            mu2 = score.baseline_means(key2, o, per & (key2 >= 0))
            g = ev[(ev.family == "F1c") & per[ev.i.to_numpy()]]
            i = g.i.to_numpy()
            i = i[key2[i] >= 0]
            v = o.V12.to_numpy()

            def st(idx, m, k):
                return boot.stat(td[idx], v[idx] - m.reindex(k[idx]).V12.to_numpy())
            r = {"as_registered": st(i, mu, key)}
            nn = ~near_news(tc[i], nt)
            r["news_excluded"] = st(i[nn], mu, key)
            r["news_share"] = float(1 - nn.mean())
            r["plus_recent_range_strata"] = st(i, mu2, key2)
            # mid-range without a cross, sampled every 12 bars
            samp = np.arange(0, len(f), 12)
            cross = f.cross_dir.to_numpy() if "cross_dir" in f else None
            midnc = samp[per[samp] & (np.abs(f.wt1.to_numpy(float)[samp]) < 20) & (cross[samp] == 0) & (key2[samp] >= 0)]
            r["midrange_no_cross"] = st(midnc, mu, key)
            r["midrange_no_cross_plus_range"] = st(midnc, mu2, key2)
            x = v[i] - mu.reindex(key[i]).V12.to_numpy()
            yr = pd.to_datetime(td[i]).year
            r["by_year"] = {int(y): float(np.nanmean(x[yr == y])) for y in np.unique(yr)}
            cut = np.nanpercentile(x, 99)
            r["without_top1pct"] = float(np.nanmean(x[x < cut]))
            out[which] = r
        res[str(tf)] = out
        print(tf, json.dumps({w: {k: (v_["est"] if isinstance(v_, dict) and "est" in v_ else v_) for k, v_ in out[w].items() if k != "by_year"} for w in out}, default=float))
    (score.OUT / "posthoc_F1c.json").write_text(json.dumps(res, indent=1, default=float))


if __name__ == "__main__":
    main()
