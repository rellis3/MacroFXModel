"""iep_build — Stage 0 event table for forge/INTRADAY_EXTREME_PATHS_PREREG.md.

    python -m forge.iep_build            # all 34 instruments
    python -m forge.iep_build EURUSD GOLD

Read-only on the research M1 cache (VolRangeForecaster/data/m1, London dates <= 2026-08-20). Never reads
data/m1_forward/ (the forward block stays unseen). Conventions copied from scripts/pathmap/remaining_travel_build.mjs
(layer 5) so the two can be parity-checked: London-calendar-day sessions, weekdays with >= 600 bars, open = first bar's
open, sigma = last HAR-800 row dated strictly before the session (annualised %), sd = sig/sqrt(252)/100, unit = sd*open,
decision price P0 = close of the last bar whose London minute < h*60, sigRel = sig / median(previous 250 rows, >= 120).

Pass 1 (discovery sessions only, date < 2022-01-01): per-instrument intraday variance profile sum(r^2/sd^2) by London
minute, and the median of session H-L / unit (the discovery HL p50 width; the shipped HAR-800 widths are fitted on all
dates, so they are NOT used). Pass 2: one row per (instrument, session, checkpoint h = 2..21) with the causal state and,
for H in {1, 2, 4} with h + H <= 22 and barrier k in {0.5, 1.0}, the first-hit race on M1 in "up/down" terms
(orientation is applied later, in analysis): res = +1 up first, -1 down first, 0 neither, 2 same bar (AMB), -9 no bars.
The barrier distance is k * sd * sqrt(v(h, H)) * open, v = the CLASS discovery profile's share of the 24 h variance in
[h, h+H). Outputs go to data/iep/ (gitignored); summaries to analysis/output/intraday_extreme_paths/.
"""
from __future__ import annotations

import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
M1 = REPO / "VolRangeForecaster" / "data" / "m1"
SIG = REPO / "analysis" / "output" / "ladder_candidates" / "d1"
OUT = REPO / "data" / "iep"
SUM = REPO / "analysis" / "output" / "intraday_extreme_paths"
LAST_DATE = "2026-08-20"
DISC_END = "2022-01-01"
CHECK = list(range(2, 22))
HORIZONS = (1, 2, 4)
KS = (0.5, 1.0)

FX = ["audcad", "audchf", "audjpy", "audnzd", "audusd", "cadchf", "cadjpy", "chfjpy", "euraud", "eurcad", "eurchf", "eurgbp",
      "eurjpy", "eurnzd", "eurusd", "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "nzdcad", "nzdjpy", "nzdusd",
      "usdcad", "usdchf", "usdjpy"]
JOBS = {k.upper(): k for k in FX} | {"GOLD": "gold", "NQ": "nq", "SPX500": "spx500", "US30": "us30", "US2000": "us2000",
                                     "DE30": "de30", "UK100": "uk100"}
MAJORS = {"EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"}
INDICES = {"NQ", "SPX500", "US30", "US2000", "DE30", "UK100"}


def cls_of(sym):
    return "index" if sym in INDICES else "gold" if sym == "GOLD" else "major" if sym in MAJORS else "cross"


def sessions(sym):
    """Yield (date, minute[], o, h, l, c) per usable London session, plus the HAR sigma state."""
    df = pd.read_parquet(M1 / f"{JOBS[sym]}_m1.parquet")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    loc = df.index.tz_convert("Europe/London").tz_localize(None).values
    day = loc.astype("datetime64[D]")  # London calendar date (strftime on 4M stamps takes ~100 s)
    minute = ((loc - day) // np.timedelta64(1, "m")).astype(np.int64)
    keep = day <= np.datetime64(LAST_DATE)
    df, day, minute = df[keep], day[keep], minute[keep]
    har = pd.read_csv(SIG / f"{sym}_har800.csv")
    har = har[har.sig > 0].reset_index(drop=True)
    hd, hs = har.date.to_numpy(), har.sig.to_numpy()
    o, h, l, c = (df[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    bounds = np.flatnonzero(np.r_[True, day[1:] != day[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        d = str(day[a])
        if pd.Timestamp(d).weekday() >= 5 or b - a < 600:
            continue
        j = np.searchsorted(hd, d)  # rows strictly before d
        if j == 0:
            continue
        sig = hs[j - 1]
        prior = hs[max(0, j - 251):j - 1]
        rel = sig / np.sort(prior)[len(prior) >> 1] if len(prior) >= 120 else np.nan
        yield d, minute[a:b], o[a:b], h[a:b], l[a:b], c[a:b], sig, rel


def pass1(sym):
    prof, n, hl = np.zeros(1440), np.zeros(1440), []
    for d, m, o, h, l, c, sig, rel in sessions(sym):
        if d >= DISC_END:
            break
        sd = sig / np.sqrt(252) / 100
        r = np.log(c / np.r_[o[0], c[:-1]])
        np.add.at(prof, m, r * r / (sd * sd))
        np.add.at(n, m, 1)
        hl.append((h.max() - l.min()) / (sd * o[0]))
    return sym, prof, n, float(np.median(hl))


def build(args):
    sym, share, hl50 = args
    rows, prev = [], None
    for d, m, o, h, l, c, sig, rel in sessions(sym):
        sd = sig / np.sqrt(252) / 100
        O = o[0]
        unit = sd * O
        r = np.log(c / np.r_[O, c[:-1]])
        crv = np.cumsum(r * r) / (sd * sd)
        runhi, runlo = np.maximum.accumulate(h), np.minimum.accumulate(l)
        idx = np.arange(len(h))
        hi_set = np.maximum.accumulate(np.where(h >= runhi, idx, -1))  # last bar that set (or tied) the running high
        lo_set = np.maximum.accumulate(np.where(l <= runlo, idx, -1))
        for hh in CHECK:
            dec = np.searchsorted(m, hh * 60) - 1
            if dec < 0:
                continue
            P0 = c[dec]
            k1 = np.searchsorted(m, (hh - 1) * 60) - 1
            k4 = np.searchsorted(m, (hh - 4) * 60) - 1 if hh >= 5 else -1
            row = {"inst": sym, "date": d, "h": hh, "sig": sig, "sigRel": rel, "stale": hh * 60 - 1 - m[dec],
                   "D": (P0 - O) / unit, "used": (runhi[dec] - runlo[dec]) / unit, "used50": (runhi[dec] - runlo[dec]) / unit / hl50,
                   "rv": crv[dec],
                   "hi_pb": (runhi[dec] - P0) / unit, "lo_pb": (P0 - runlo[dec]) / unit,
                   "hi_age": hh * 60 - 1 - m[hi_set[dec]], "lo_age": hh * 60 - 1 - m[lo_set[dec]],
                   "hi_D": (runhi[dec] - O) / unit, "lo_D": (runlo[dec] - O) / unit,
                   "m1": (P0 - c[k1]) / unit if k1 >= 0 else np.nan, "m4": (P0 - c[k4]) / unit if k4 >= 0 else np.nan,
                   "pdh": (prev[0] - P0) / unit if prev else np.nan, "pdl": (P0 - prev[1]) / unit if prev else np.nan}
            s = dec + 1
            for H in HORIZONS:
                if hh + H > 22:
                    continue
                e = np.searchsorted(m, (hh + H) * 60)
                u = sd * np.sqrt(share[(hh, H)]) * O
                row[f"nb{H}"] = e - s
                if e <= s:
                    for k in KS:
                        row[f"res{H}_{k}"] = -9
                    continue
                wh, wl = h[s:e], l[s:e]
                row[f"end{H}"] = (c[e - 1] - P0) / u
                row[f"mfu{H}"] = (wh.max() - P0) / u
                row[f"mfd{H}"] = (P0 - wl.min()) / u
                row[f"xhi{H}"] = (wh.max() - runhi[dec]) / u
                row[f"xlo{H}"] = (runlo[dec] - wl.min()) / u
                row[f"nxt{H}"] = (c[s] - P0) / u  # next-bar return: the registered leak canary
                for k in KS:
                    up = np.flatnonzero(wh >= P0 + k * u)
                    dn = np.flatnonzero(wl <= P0 - k * u)
                    iu = up[0] if len(up) else 10**9
                    idn = dn[0] if len(dn) else 10**9
                    row[f"res{H}_{k}"] = 0 if iu == idn == 10**9 else 2 if iu == idn else 1 if iu < idn else -1
                    row[f"t{H}_{k}"] = min(iu, idn) if min(iu, idn) < 10**9 else -1
            rows.append(row)
        prev = (h.max(), l.min())
    df = pd.DataFrame(rows)
    for col in df.columns:
        if col.startswith("res") or col.startswith("t"):
            df[col] = df[col].fillna(-9).astype("int16") if col.startswith("res") else df[col]
    df.to_parquet(OUT / f"{sym}.parquet")
    return sym, len(df)


def main(syms):
    OUT.mkdir(parents=True, exist_ok=True)
    SUM.mkdir(parents=True, exist_ok=True)
    with Pool(8) as pool:
        p1 = pool.map(pass1, list(JOBS))  # profiles always from ALL instruments (class pooling)
    by_cls, hl50 = {}, {}
    for sym, prof, n, hl in p1:
        hl50[sym] = hl
        P, N = by_cls.setdefault(cls_of(sym), [np.zeros(1440), np.zeros(1440)])
        P += prof
        N += n
    shares = {}
    for cl, (P, N) in by_cls.items():
        mean = np.divide(P, N, out=np.zeros(1440), where=N > 0)
        tot = mean.sum()
        shares[cl] = {(hh, H): float(mean[hh * 60:(hh + H) * 60].sum() / tot) for hh in range(1, 23) for H in HORIZONS}
    (SUM / "discovery_profile.json").write_text(json.dumps(
        {"hl50_discovery": hl50, "share": {cl: {f"{a}|{b}": v for (a, b), v in s.items()} for cl, s in shares.items()}}, indent=1))
    with Pool(8) as pool:
        for sym, n in pool.imap_unordered(build, [(s, shares[cls_of(s)], hl50[s]) for s in syms]):
            print(f"{sym}: {n} rows", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or list(JOBS))
