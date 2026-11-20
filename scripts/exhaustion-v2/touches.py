"""exhaustion-v2 touch extraction (forge/EXHAUSTION_V2_NQ_PREREG.md).

    python scripts/exhaustion-v2/touches.py NQ     -> analysis/output/exhaustion-v2-nq/{touches_C,touches_F}.parquet,
                                                     clock_{C,F}.parquet (per-year vol clock), check.txt

One row per (session, line) first touch with: family, rung, side, level, touch time, time left, further travel, both
targets' distances, and the conditioners (realised variance so far, range so far, USD Major release still to come,
VWAP distance and touch-bar volume on F). Lines come from the walk-forward ladder (ladder-v2-<sym> test rows, arm E6).
Nothing here looks at any candidate's forecast.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

LINE_ARM = "E6"          # set per (symbol, track) by line_arm(); NQ's banked winner was arm E6 (har_rv_log)


def line_arm(sym, track):
    """The ladder arm whose lines are traded: the banked sigma-race winner for that instrument and track."""
    if sym == "NQ":
        return "E6"
    import json
    r = json.loads((ROOT / f"analysis/output/ladder-v2-{sym.lower()}/results.json").read_text())
    if track == "F" and r.get("c_vs_f", {}).get("same"):
        return r["C"]["chosen"]          # H3 'same': the futures reuse the CFD spec (EURUSD); 'different' keeps its own (gold)
    return r[track]["chosen"]
FAMS = ("OH", "OL", "OCu", "OCd", "PH", "PL")
RUNGS = (50, 75, 90)
NEXT = {50: 75, 75: 90}


EVENT_COUNTRIES = {"EURUSD": ("United States", "Euro Area")}   # default: United States only
# rollout (forge/LADDER_V2_ROLLOUT_PREREG.md §3): the release-to-come countries follow the instrument's currencies.
# The calendar grades major/high only for these three; other currencies (JPY, AUD, CAD, CHF, NZD) add none.
_CCY_COUNTRY = {"USD": "United States", "EUR": "Euro Area", "GBP": "United Kingdom"}
for _s in L.SYMS:
    if _s in EVENT_COUNTRIES or _s in ("NQ", "GOLD", "SPX500", "US30", "US2000"):
        continue
    if len(_s) == 6 and _s.isalpha() and _s[:3] in ("EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"):
        EVENT_COUNTRIES[_s] = tuple(_CCY_COUNTRY[c] for c in (_s[:3], _s[3:]) if c in _CCY_COUNTRY)
    elif _s == "DE30":
        EVENT_COUNTRIES[_s] = ("Euro Area",)
    elif _s == "UK100":
        EVENT_COUNTRIES[_s] = ("United Kingdom",)


def usd_major_times(sym: str = "NQ") -> pd.DatetimeIndex:
    """Major-impact release times (UTC) for the countries that move this instrument."""
    sys.path.insert(0, str(ROOT / "scripts/calendar"))
    from fetch_nasdaq_calendar import load_calendar
    cs = EVENT_COUNTRIES.get(sym, ("United States",))
    if not cs:
        return pd.DatetimeIndex([], tz="UTC")
    c = load_calendar(countries=cs)
    c = c[c["impact"].astype(str).str.lower().isin(["major", "high"])]
    t = pd.to_datetime(c["datetime_raw"], errors="coerce").dropna()
    t = t[(t.dt.hour != 0) | (t.dt.minute != 0)]              # all-day rows have no time
    return pd.DatetimeIndex(t.dt.tz_localize("UTC").unique()).sort_values()


def session_frames(m: pd.DataFrame, dates) -> dict:
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)]
    d = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    keep = set(pd.DatetimeIndex(dates))
    out = {}
    for k, g in x.groupby(d):
        if k in keep:
            out[k] = g
    return out


def vol_clock(m: pd.DataFrame, years) -> pd.DataFrame:
    """Per test year Y: mean squared 1-min log return by London 5-min bucket of the day (288 buckets) over weekday
    bars before 1 Jan Y; returned as each bucket's share of the whole-day total."""
    r = np.log(m["close"]).diff()
    dt = m.index.to_series().diff().dt.total_seconds().div(60).to_numpy()
    r = r.where(dt <= 5)
    lt = m.index.tz_convert("Europe/London")
    b = (lt.hour * 60 + lt.minute) // 5
    df = pd.DataFrame({"r2": (r ** 2).to_numpy(), "b": np.asarray(b), "t": m.index, "wd": np.asarray(lt.dayofweek < 5)})
    df = df[df["wd"] & np.isfinite(df["r2"])]
    out = {}
    for Y in years:
        tr = df[df["t"] < pd.Timestamp(f"{Y}-01-01", tz="UTC")]
        v = tr.groupby("b")["r2"].mean().reindex(range(288), fill_value=0.0)
        out[Y] = v / v.sum()
    return pd.DataFrame(out)


def touches_for_session(g: pd.DataFrame, row, track, events, vol_med=None):
    o = float(g["open"].iloc[0])
    hi, lo, cl = g["high"].to_numpy(), g["low"].to_numpy(), g["close"].to_numpy()
    n = len(g)
    lt = g.index.tz_convert("Europe/London")
    mins = np.asarray(lt.hour * 60 + lt.minute)
    run_lo = np.minimum.accumulate(np.r_[o, lo[:-1]])          # before bar t (bar 0 sees the open)
    run_hi = np.maximum.accumulate(np.r_[o, hi[:-1]])
    suf_hi = np.maximum.accumulate(hi[::-1])[::-1]
    suf_lo = np.minimum.accumulate(lo[::-1])[::-1]
    lr = np.r_[0.0, np.diff(np.log(cl))]
    rv_before = np.r_[0.0, np.cumsum(lr ** 2)[:-1]]            # realised variance of bars before t
    sig = float(row[LINE_ARM]); sp = sig / 100 * o             # daily sigma in price
    ev = events[(events > g.index[0]) & (events <= g.index[-1] + pd.Timedelta(minutes=1))]
    if track == "F":
        v = g["volume"].to_numpy().astype(float)
        tp = (hi + lo + cl) / 3
        cum_pv, cum_v = np.r_[0, np.cumsum(tp * v)[:-1]], np.r_[0, np.cumsum(v)[:-1]]
    rows = []
    for fam in FAMS:
        up = fam in ("OH", "OCu", "PH")
        for p in RUNGS:
            q = {"OH": "oh", "OL": "ol", "OCu": "oc", "OCd": "oc", "PH": "hl", "PL": "hl"}[fam]
            pct = float(row[f"{LINE_ARM}_{q}_{p}"]) / 100
            pnx = float(row[f"{LINE_ARM}_{q}_{NEXT[p]}"]) / 100 if p in NEXT else np.nan
            if fam in ("OH", "OCu"):
                lvl = np.full(n, o * (1 + pct)); nxt = o * (pnx - pct)
            elif fam in ("OL", "OCd"):
                lvl = np.full(n, o * (1 - pct)); nxt = o * (pnx - pct)
            elif fam == "PH":
                lvl = run_lo * (1 + pct); nxt = None
            else:
                lvl = run_hi * (1 - pct); nxt = None
            hit = np.flatnonzero(hi >= lvl) if up else np.flatnonzero(lo <= lvl)
            if not len(hit):
                continue
            t = int(hit[0]); L0 = float(lvl[t])
            if nxt is None:
                nxt = (run_lo[t] if fam == "PH" else run_hi[t]) * (pnx - pct)
            further = float(suf_hi[t] - L0) if up else float(L0 - suf_lo[t])
            t_utc = g.index[t]
            rec = {"date": row["date"], "year": int(row["year"]), "fam": fam, "rung": p, "up": up, "level": L0,
                   "open": o, "sig": sig, "sp": sp, "bar": t, "min": int(mins[t]), "tau": 1320 - int(mins[t]),
                   "further": further, "d_next": float(nxt) if np.isfinite(nxt) else np.nan, "d_sig": 0.25 * sp,
                   "rv_before": float(rv_before[t]), "range_before": float(run_hi[t] - run_lo[t]),
                   "event_to_come": bool(((ev > t_utc)).any()), "wrong_side": bool((L0 < o) if up else (L0 > o)),
                   "rel": float(row["rel"])}
            if track == "F":
                rec["vwap_dist"] = float((L0 - cum_pv[t] / cum_v[t]) / sp) if cum_v[t] > 0 else np.nan
                rec["vol_ratio"] = float(v[t] / vol_med[mins[t]]) if vol_med is not None and vol_med[mins[t]] > 0 else np.nan
            rows.append(rec)
    return rows


def slow_check(g, row, rows):
    """Independent loop for the extraction check (prereg §6)."""
    o = float(g["open"].iloc[0]); bad = 0
    for r in rows:
        q = {"OH": "oh", "OL": "ol", "OCu": "oc", "OCd": "oc", "PH": "hl", "PL": "hl"}[r["fam"]]
        pct = float(row[f"{LINE_ARM}_{q}_{r['rung']}"]) / 100
        lo_run, hi_run, found = o, o, None
        for i, (h, l) in enumerate(zip(g["high"], g["low"])):
            lvl = {"OH": o * (1 + pct), "OCu": o * (1 + pct), "OL": o * (1 - pct), "OCd": o * (1 - pct),
                   "PH": lo_run * (1 + pct), "PL": hi_run * (1 - pct)}[r["fam"]]
            if (r["up"] and h >= lvl) or ((not r["up"]) and l <= lvl):
                found = (i, lvl); break
            lo_run, hi_run = min(lo_run, l), max(hi_run, h)
        i, lvl = found
        fur = (g["high"].iloc[i:].max() - lvl) if r["up"] else (lvl - g["low"].iloc[i:].min())
        bad += int(i != r["bar"] or not np.isclose(fur, r["further"]) or not np.isclose(lvl, r["level"]))
    return bad


def main(sym):
    out = ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}"
    out.mkdir(parents=True, exist_ok=True)
    events = usd_major_times(sym)
    log = [f"Major release times ({', '.join(EVENT_COUNTRIES.get(sym, ('United States',))) or 'none graded'}): {len(events)} "
           f"({events.min() if len(events) else '-'} -> {events.max() if len(events) else '-'})"]
    rng = np.random.default_rng(20261119)
    global LINE_ARM
    for track in L.tracks_for(sym):
        LINE_ARM = line_arm(sym, track)
        log.append(f"{sym} {track}: lines from ladder arm {LINE_ARM}")
        T = pd.read_parquet(ROOT / f"analysis/output/ladder-v2-{sym.lower()}/test_{track}.parquet")
        m = L.load_m1(sym, track, "unadj")
        if track == "F":
            raw = pd.read_parquet(L.m1_paths(sym, "F", "unadj"))
            raw.index = pd.to_datetime(raw.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
            m["volume"] = raw["volume"][~raw.index.duplicated()].reindex(m.index).astype(float)
        years = sorted(set(T["year"]))
        vol_clock(m, years).to_parquet(out / f"clock_{track}.parquet")
        S = session_frames(m, T["date"])
        vol_med = None
        if track == "F":
            tr = m[m.index < pd.Timestamp("2018-01-01", tz="UTC")]
            lt = tr.index.tz_convert("Europe/London")
            vol_med = tr["volume"].groupby(np.asarray(lt.hour * 60 + lt.minute)).median().reindex(range(1440)).to_numpy()
        allrows, n_chk, bad = [], 0, 0
        chk = set(rng.choice(len(T), 20, replace=False))
        for i, (_, row) in enumerate(T.iterrows()):
            g = S.get(row["date"])
            if g is None:
                continue
            rows = touches_for_session(g, row, track, events, vol_med)
            if i in chk:
                bad += slow_check(g, row, rows); n_chk += len(rows)
            allrows += rows
        X = pd.DataFrame(allrows)
        X.to_parquet(out / f"touches_{track}.parquet")
        # placebo (prereg section 6): each session's lines borrowed from a random other session of the same year,
        # so distances follow the real line distribution but carry no information about that day
        lcols = [c for c in T.columns if c.startswith(f"{LINE_ARM}_")] + [LINE_ARM]
        P = T.copy()
        for y, idx in T.groupby("year").groups.items():
            idx = np.asarray(list(idx)); P.loc[idx, lcols] = T.loc[rng.permutation(idx), lcols].to_numpy()
        prow = []
        for _, row in P.iterrows():
            g = S.get(row["date"])
            if g is not None:
                prow += touches_for_session(g, row, track, events, vol_med)
        pd.DataFrame(prow).to_parquet(out / f"touches_{track}_placebo.parquet")
        log.append(f"  placebo (lines from a random same-year session): {len(prow)} first touches")
        log.append(f"{sym} {track}: {X['date'].nunique()} sessions, {len(X)} first touches; extraction check "
                   f"{n_chk - bad}/{n_chk} match on 20 sessions")
        log.append("  touches per family x rung: " + ", ".join(f"{k[0]}{k[1]} {v}" for k, v in X.groupby(["fam", "rung"]).size().items()))
        log.append(f"  wrong-side dynamic touches: {int(X['wrong_side'].sum())}; release still to come: {int(X['event_to_come'].sum())}")
        if bad:
            raise SystemExit("\n".join(log) + "\nEXTRACTION CHECK FAILED")
    (out / "check.txt").write_text("\n".join(log) + "\n")
    print("\n".join(log))


if __name__ == "__main__":
    main(sys.argv[1].upper() if len(sys.argv) > 1 else "NQ")
