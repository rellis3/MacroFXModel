"""Flag-never-alter data screens for M1 price data, CFD (C) and futures (F) tracks.

    python forge/data_screens.py NQ          -> analysis/output/data_screens/NQ/{flags.csv, SUMMARY.md, manifest.json}

Runbook 0.8 (plans/VOL_EXHAUSTION_RUNBOOK.md), Lesson 5 standards. Nothing is edited or dropped here: every screen
writes (London session date, track, screen, detail) rows. Studies decide what to do with flags and must report results
with and without flagged sessions. Version v1 thresholds below were fixed 2026-11-18 before the first run
(forge/LADDER_V2_NQ_PREREG.md amendment A2). Changing a threshold = a new VERSION.

Screens:
  ts_dup / ts_order / ts_weekend   duplicate stamps, out-of-order stamps, bars on Sat or Sun before 21:00 UTC
  jump_1m     |1-min log return| > 10 x trailing 1440-bar SD (returns across gaps > 15 min skipped; F uses ratio series)
  jump_day    |NY-close daily log return| > 5 x trailing 60-bar SD
  gap         no bar for > 30 min between 08:00 and 21:00 London on a weekday
  frozen      >= 30 consecutive bars with the same close and high == low, 08:00-21:00 London
  partial     weekday session with 1-599 bars (00:00-22:00 London)
  missing     weekday session absent on this track but present on the other track
  roll_gap    (F) |log roll ratio| > 1.5 x trailing 60-bar daily SD at the switch
  round_trip  (F) ratio/unadjusted close not constant within a contract, or segment ratios disagree with *_rolls.csv
  cvf_range   |log(HL_F / HL_C)| beyond 3 SD of its trailing 250-session history
  cvf_open    log(open_F / open_C) minus its trailing 20-session median beyond 3 trailing-250 SDs
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
VERSION = "v1"
T = dict(jump_1m_sd=10.0, jump_1m_window=1440, jump_1m_maxgap_min=15, jump_day_sd=5.0, jump_day_window=60,
         gap_min=30, frozen_min=30, liquid_hours=(8, 21), min_bars=600, roll_gap_sd=1.5, cvf_sd=3.0,
         cvf_window=250, cvf_open_median=20)

# CFD M1 path and NT8 futures root per symbol. Extend as instruments are onboarded.
SOURCES = {
    "NQ": {"C": "portfolioBacktest/cache/nq_m1.parquet", "F": "NQ"},
    "GOLD": {"C": "portfolioBacktest/cache/gold_m1.parquet", "F": "GC"},
    "SPX500": {"C": "portfolioBacktest/cache/spx500_m1.parquet", "F": "ES"},
    "US30": {"C": "portfolioBacktest/cache/us30_m1.parquet", "F": "YM"},
    "US2000": {"C": "portfolioBacktest/cache/us2000_m1.parquet", "F": "RTY"},
    "EURUSD": {"C": "portfolioBacktest/cache/eurusd_m1.parquet", "F": "6E"},
}


# ---------------------------------------------------------------- hashing
def sha256(path: str | Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(ROOT / path if not Path(path).is_absolute() else path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def input_hashes(paths) -> dict:
    """{repo-relative path: sha256} for a study's results.json."""
    return {str(p): sha256(p) for p in paths}


# ---------------------------------------------------------------- loading (raw, nothing dropped)
def load_raw(sym: str, track: str, kind: str = "unadj") -> tuple[pd.DataFrame, Path]:
    if track == "C":
        p = ROOT / SOURCES[sym]["C"]
        d = pd.read_parquet(p)
        d.index = pd.to_datetime(d.index, utc=True)
    else:
        p = ROOT / f"analysis/output/nt8/continuous/{SOURCES[sym]['F']}_1m_{kind}.parquet"
        d = pd.read_parquet(p)
        d.index = pd.to_datetime(d.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)   # NT8 end-stamped
    return d, p


def london_date(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    return idx.tz_convert("Europe/London").tz_localize(None).normalize()


def _rows(dates, track, screen, details):
    return pd.DataFrame({"date": pd.DatetimeIndex(dates), "track": track, "screen": screen, "detail": list(details)})


# ---------------------------------------------------------------- screens
def screen_timestamps(raw: pd.DataFrame, track: str) -> list[pd.DataFrame]:
    idx = raw.index
    out = []
    dup = idx.duplicated(keep=False)
    if dup.any():
        c = pd.Series(1, index=london_date(idx[dup])).groupby(level=0).sum()
        out.append(_rows(c.index, track, "ts_dup", [f"{v} duplicate stamps" for v in c]))
    back = np.r_[False, np.diff(idx.asi8) < 0]
    if back.any():
        c = pd.Series(1, index=london_date(idx[back])).groupby(level=0).sum()
        out.append(_rows(c.index, track, "ts_order", [f"{v} out-of-order stamps" for v in c]))
    wk = (idx.dayofweek == 5) | ((idx.dayofweek == 6) & (idx.hour < 21))
    if wk.any():
        c = pd.Series(1, index=london_date(idx[wk])).groupby(level=0).sum()
        out.append(_rows(c.index, track, "ts_weekend", [f"{v} weekend bars" for v in c]))
    return out


def clean(raw: pd.DataFrame) -> pd.DataFrame:
    """Sorted, de-duplicated view used by the value screens (the raw file is never changed)."""
    return raw[~raw.index.duplicated()].sort_index()[["open", "high", "low", "close"]].astype(float)


def screen_jump_1m(m: pd.DataFrame, track: str) -> list[pd.DataFrame]:
    lc = np.log(m["close"])
    dt = m.index.to_series().diff().dt.total_seconds().div(60)
    r = lc.diff().where(dt <= T["jump_1m_maxgap_min"])
    sd = r.rolling(T["jump_1m_window"], min_periods=T["jump_1m_window"] // 3).std().shift(1)
    z = (r.abs() / sd)
    hit = z > T["jump_1m_sd"]
    if not hit.any():
        return []
    h = pd.DataFrame({"d": london_date(m.index[hit.to_numpy()]), "z": z[hit].to_numpy(), "r": r[hit].to_numpy()})
    g = h.groupby("d").agg(n=("z", "size"), zmax=("z", "max"), rmax=("r", lambda x: x.abs().max()))
    return [_rows(g.index, track, "jump_1m",
                  [f"{int(n)} bars; max {zm:.1f} SD ({rm * 100:.2f}%)" for n, zm, rm in g.itertuples(index=False)])]


def ny_close_bars(m: pd.DataFrame) -> pd.DataFrame:
    key = (m.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    g = m.groupby(key)
    b = pd.DataFrame({"close": g["close"].last(), "n": g.size()})
    return b[(b["n"] >= 60) & (b.index.dayofweek < 5)]


def screen_jump_day(m: pd.DataFrame, track: str) -> tuple[list[pd.DataFrame], pd.Series]:
    b = ny_close_bars(m)
    r = np.log(b["close"]).diff()
    sd = r.rolling(T["jump_day_window"], min_periods=20).std().shift(1)
    z = r.abs() / sd
    hit = z > T["jump_day_sd"]
    out = [_rows(b.index[hit], track, "jump_day",
                 [f"{rv * 100:+.2f}% = {zv:.1f} SD" for rv, zv in zip(r[hit], z[hit])])] if hit.any() else []
    return out, sd


def _liquid(m: pd.DataFrame) -> np.ndarray:
    lt = m.index.tz_convert("Europe/London")
    h0, h1 = T["liquid_hours"]
    return np.asarray((lt.hour >= h0) & (lt.hour < h1) & (lt.dayofweek < 5))


def screen_gap_frozen(m: pd.DataFrame, track: str) -> list[pd.DataFrame]:
    out = []
    lt = m.index.tz_convert("Europe/London")
    liq = _liquid(m)
    # gaps: bar i is in the liquid window and the previous bar was > gap_min earlier on the same London date
    ld = np.asarray(london_date(m.index))
    hr = np.asarray(lt.hour)
    dt = np.r_[np.inf, np.diff(m.index.asi8) / 6e10]                   # minutes since the previous bar
    same = np.r_[False, ld[1:] == ld[:-1]]
    prev_liq = np.r_[False, (hr[:-1] >= T["liquid_hours"][0]) & (hr[:-1] < T["liquid_hours"][1])]
    g = liq & same & prev_liq & (dt > T["gap_min"])
    if g.any():
        h = pd.DataFrame({"d": london_date(m.index[g]), "dt": dt[g], "t": lt[g].strftime("%H:%M")})
        a = h.groupby("d").agg(n=("dt", "size"), mx=("dt", "max"), t=("t", "first"))
        out.append(_rows(a.index, track, "gap", [f"{int(n)} gaps; longest {mx:.0f} min (first ends {t})"
                                                  for n, mx, t in a.itertuples(index=False)]))
    # frozen: run of identical close with high == low
    flat = (m["high"] == m["low"]).to_numpy()
    same_c = np.r_[False, np.diff(m["close"].to_numpy()) == 0]
    run_id = np.cumsum(~(flat & same_c))
    s = pd.Series(1, index=run_id)[flat & liq]
    lens = s.groupby(level=0).sum()
    long_runs = lens[lens >= T["frozen_min"]]
    if len(long_runs):
        first_pos = pd.Series(np.arange(len(m)), index=run_id).groupby(level=0).first()
        pos = first_pos.loc[long_runs.index].to_numpy()
        d = london_date(m.index[pos])
        a = pd.DataFrame({"d": d, "n": long_runs.to_numpy()}).groupby("d")["n"].max()
        out.append(_rows(a.index, track, "frozen", [f"{int(v)} identical flat bars" for v in a]))
    return out


def sessions(m: pd.DataFrame) -> pd.DataFrame:
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)]
    g = x.groupby(london_date(x.index))
    return pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "n": g.size()})


def screen_sessions(S: pd.DataFrame, track: str, other: pd.DataFrame | None) -> list[pd.DataFrame]:
    out = []
    p = S[S["n"] < T["min_bars"]]
    if len(p):
        out.append(_rows(p.index, track, "partial", [f"{int(n)} bars" for n in p["n"]]))
    if other is not None:
        lo, hi = max(S.index.min(), other.index.min()), min(S.index.max(), other.index.max())
        o = other[(other.index >= lo) & (other.index <= hi) & (other["n"] >= T["min_bars"])]
        miss = o.index.difference(S.index)
        if len(miss):
            out.append(_rows(miss, track, "missing", ["absent here, full session on the other track"] * len(miss)))
    return out


def screen_rolls(sym: str, unadj: pd.DataFrame, ratio: pd.DataFrame, day_sd: pd.Series) -> list[pd.DataFrame]:
    out = []
    rl = pd.read_csv(ROOT / f"analysis/output/nt8/continuous/{SOURCES[sym]['F']}_rolls.csv", parse_dates=["switch_utc"])
    # roll gap vs daily vol at the switch (as of before it)
    sw = pd.DatetimeIndex(rl["switch_utc"])
    sd_at = day_sd.reindex(day_sd.index.union(sw.tz_localize(None).normalize())).ffill()
    lg = np.log(rl["ratio"].to_numpy())
    sdv = sd_at.reindex(sw.tz_localize(None).normalize()).to_numpy()
    z = np.abs(lg) / sdv
    hit = z > T["roll_gap_sd"]
    if hit.any():
        out.append(_rows(london_date(sw[hit] + pd.Timedelta(minutes=1)), "F", "roll_gap",
                         [f"{f}->{t} gap {g:+.2f} pts = {zz:.1f} daily SD" for f, t, g, zz in
                          zip(rl["from"][hit], rl["to"][hit], rl["gap_points"][hit], z[hit])]))
    # round trip: ratio_close / unadj_close constant within each contract; consecutive constants match the csv ratio
    u = unadj[~unadj.index.duplicated()].sort_index()
    r = ratio[~ratio.index.duplicated()].sort_index()
    j = u[["close", "contract"]].join(r[["close"]], rsuffix="_r", how="inner")
    j["k"] = j["close_r"] / j["close"]
    by = j.groupby("contract", sort=False)["k"]
    spread = (by.max() / by.min() - 1).abs()
    bad = spread[spread > 1e-9]
    for c in bad.index:
        jj = j[j["contract"] == c]
        dev = (jj["k"] / jj["k"].median() - 1).abs() > 1e-9
        ds = london_date(jj.index[dev.to_numpy()]).unique()
        out.append(_rows(ds, "F", "round_trip", [f"{c}: adjustment factor not constant (max dev {spread[c]:.2e})"] * len(ds)))
    kmed = by.median()
    for _, row in rl.iterrows():
        if row["from"] in kmed and row["to"] in kmed:
            implied = kmed[row["from"]] / kmed[row["to"]]          # back-adjust factor across this roll
            if abs(implied / row["ratio"] - 1) > 1e-6:
                out.append(_rows([london_date(pd.DatetimeIndex([row["switch_utc"]]))[0]], "F", "round_trip",
                                 [f"{row['from']}->{row['to']}: implied ratio {implied:.6f} vs csv {row['ratio']:.6f}"]))
    return out


def screen_cvf(SC: pd.DataFrame, SF: pd.DataFrame) -> list[pd.DataFrame]:
    out = []
    j = SC.join(SF, lsuffix="_c", rsuffix="_f", how="inner")
    j = j[(j["n_c"] >= T["min_bars"]) & (j["n_f"] >= T["min_bars"])]
    w = T["cvf_window"]
    x = np.log((j["h_f"] - j["l_f"]) / j["o_f"]) - np.log((j["h_c"] - j["l_c"]) / j["o_c"])
    z = (x - x.rolling(w, min_periods=60).mean().shift(1)) / x.rolling(w, min_periods=60).std().shift(1)
    hit = z.abs() > T["cvf_sd"]
    if hit.any():
        out.append(_rows(j.index[hit], "CF", "cvf_range",
                         [f"HL F/C {np.exp(v):.3f} = {zz:+.1f} SD" for v, zz in zip(x[hit], z[hit])]))
    b = np.log(j["o_f"] / j["o_c"])
    e = b - b.rolling(T["cvf_open_median"], min_periods=5).median().shift(1)
    z2 = e / e.rolling(w, min_periods=60).std().shift(1)
    hit = z2.abs() > T["cvf_sd"]
    if hit.any():
        out.append(_rows(j.index[hit], "CF", "cvf_open",
                         [f"open basis off its 20-day median by {v * 1e4:+.1f} bp = {zz:+.1f} SD" for v, zz in zip(e[hit], z2[hit])]))
    return out


# ---------------------------------------------------------------- runner
def run(sym: str) -> pd.DataFrame:
    out_dir = ROOT / "analysis/output/data_screens" / sym
    out_dir.mkdir(parents=True, exist_ok=True)
    parts, files, sess = [], [], {}
    for track in ("C", "F"):
        if track not in SOURCES[sym]:
            continue
        raw, p = load_raw(sym, track, "unadj")
        files.append(p)
        parts += screen_timestamps(raw, track)
        m = clean(raw)
        sess[track] = sessions(m)
        if track == "F":
            rraw, rp = load_raw(sym, "F", "ratio")
            files += [rp, ROOT / f"analysis/output/nt8/continuous/{SOURCES[sym]['F']}_rolls.csv"]
            mr = clean(rraw)
            parts += screen_jump_1m(mr, track)
            jd, sd = screen_jump_day(mr, track)
            parts += jd
            parts += screen_rolls(sym, raw, rraw, sd)
        else:
            parts += screen_jump_1m(m, track)
            jd, _ = screen_jump_day(m, track)
            parts += jd
        parts += screen_gap_frozen(m, track)
        print(f"  {sym} {track}: {len(raw):,} raw bars, {len(sess[track])} sessions", flush=True)
    for track in sess:
        other = sess.get("F" if track == "C" else "C")
        parts += screen_sessions(sess[track], track, other)
    if "C" in sess and "F" in sess:
        parts += screen_cvf(sess["C"], sess["F"])
    F = (pd.concat(parts, ignore_index=True) if parts else
         pd.DataFrame(columns=["date", "track", "screen", "detail"])).sort_values(["date", "track", "screen"])
    F.to_csv(out_dir / "flags.csv", index=False)
    man = {"symbol": sym, "version": VERSION, "thresholds": T,
           "inputs": {str(Path(f).relative_to(ROOT)).replace("\\", "/"): sha256(f) for f in files},
           "sessions": {t: [str(s.index.min().date()), str(s.index.max().date()), int(len(s))] for t, s in sess.items()},
           "flag_counts": F.groupby(["track", "screen"]).size().rename("n").reset_index().to_dict("records")}
    (out_dir / "manifest.json").write_text(json.dumps(man, indent=1, default=str))
    lines = [f"# Data screens — {sym} ({VERSION})", "",
             "Flags only; nothing was edited or dropped. Generated by `forge/data_screens.py`; thresholds and input",
             "hashes in `manifest.json`, every flag in `flags.csv`.", "",
             "| Track | Sessions | First | Last |", "|---|---|---|---|"]
    lines += [f"| {t} | {v[2]:,} | {v[0]} | {v[1]} |" for t, v in man["sessions"].items()]
    lines += ["", "| Track | Screen | Sessions flagged |", "|---|---|---|"]
    for (t, s), g in F.groupby(["track", "screen"]):
        lines.append(f"| {t} | {s} | {g['date'].nunique()} |")
    for t in sorted(F["track"].unique()):
        n_t = F.loc[F["track"].isin([t, "CF"]), "date"].nunique()
        base = len(sess.get(t, [])) or 1
        lines.append(f"\nAny flag on track {t} (incl. C-vs-F): {n_t} sessions ({n_t / base:.1%})." if t in sess else "")
    (out_dir / "SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines), flush=True)
    return F


if __name__ == "__main__":
    for s in sys.argv[1:] or ["NQ"]:
        run(s)
