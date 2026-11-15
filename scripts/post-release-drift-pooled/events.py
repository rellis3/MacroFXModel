"""post-release-drift-pooled step 01: the event table (SIGNAL side only) + DATA_AUDIT.md.

Prereg §3.1-§3.2, §3.7. Reads calendar values and the US 2y CFD move inside [t, t+15]; never a price after entry.
"""
from __future__ import annotations

import importlib.util
import math

import numpy as np
import pandas as pd

from common import (LONDON, NEWYORK, NS_MIN, OUT, ROOT, DataMissing, Params, load_close_m15, need, rng_for)

LEGACY_EVENTS = ROOT / "analysis/output/rate-surprise-events/events.parquet"
Y2_M15 = ROOT / "analysis/output/rate-surprise-events/m15/USB02Y_USD.parquet"
CAL_OLD = ROOT / "calendar_events.csv"
CAL_NEW = ROOT / "calendar_events_nasdaq.csv"
SEAM = "2026-07-02"

# (family, field) -> event name per source. Never match a literal name across the 2026-07-02 seam (data-rules).
NAMES = {
    ("CPI", "core"): {"legacy": "Core Inflation Rate Month-over-Month", "nasdaq": "Core CPI"},
    ("CPI", "headline"): {"legacy": "Inflation Rate Month-over-Month", "nasdaq": "CPI"},
    ("NFP", "headline"): {"legacy": "Payroll Jobs Growth", "nasdaq": "Nonfarm Payrolls"},
    ("PPI", "headline"): {"legacy": "Producer Price Index Month-over-Month", "nasdaq": "PPI"},
    ("PPI", "core"): {"legacy": "Core Producer Price Index Month-over-Month", "nasdaq": "Core PPI"},
    ("FOMC", "rate"): {"legacy": "Fed Interest Rate Decision", "nasdaq": "Fed Interest Rate Decision"},
}
PRIMARY = {"CPI": ("core", "headline"), "PPI": ("headline", "core"), "NFP": ("headline", None), "FOMC": ("rate", None)}
START = {"CPI": "2018-01-01", "NFP": "2018-01-01", "FOMC": "2018-01-01", "PPI": "2014-01-01"}   # calendar part
MIRROR = {"MIRROR_UK": ("United Kingdom", "Inflation Rate Year-over-Year", "gbpusd"),
          "MIRROR_EA": ("Euro Area", "Inflation Rate Year-over-Year Flash Estimate", "eurusd")}


def num(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return math.nan
    s = str(x).strip().replace("%", "").replace(",", "")
    mult = 1.0
    if s.endswith("K"):
        s, mult = s[:-1], 1e3
    elif s.endswith("M"):
        s, mult = s[:-1], 1e6
    try:
        return float(s) * mult
    except ValueError:
        return math.nan


def load_calendar_both(countries) -> pd.DataFrame:
    """`load_calendar()` from scripts/calendar/fetch_nasdaq_calendar.py (drops the ~46k duplicate rows, fault #11).
    If that module cannot import (it needs `requests`), the same six lines are applied here."""
    need(CAL_OLD, "economic calendar 2014 -> 2026-07-02")
    need(CAL_NEW, "Nasdaq calendar continuation 2026-07-03 ->")
    spec = importlib.util.spec_from_file_location("fnc", ROOT / "scripts/calendar/fetch_nasdaq_calendar.py")
    try:
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.load_calendar(countries=countries, released_only=True)
    except ImportError:
        old = pd.read_csv(CAL_OLD, encoding="latin-1", low_memory=False).drop_duplicates()
        old["source"], old["impact_src"], old["status"] = "legacy", "legacy", "released"
        new = pd.read_csv(CAL_NEW, dtype=str).replace({"Euro Zone": "Euro Area"})
        new = new[new["status"] == "released"]
        df = pd.concat([old, new[new["date"] > SEAM]], ignore_index=True)
        df = df[df["country"].isin(countries)]
        return df.sort_values("datetime_raw").reset_index(drop=True)


def _calendar_field(cal: pd.DataFrame, fam: str, field: str) -> pd.DataFrame:
    nm = NAMES[(fam, field)]
    src = np.where(cal["source"].astype(str) == "legacy", "legacy", "nasdaq")
    sel = cal[((src == "legacy") & (cal["event"] == nm["legacy"])) | ((src == "nasdaq") & (cal["event"] == nm["nasdaq"]))].copy()
    sel["t"] = pd.to_datetime(sel["datetime_raw"], utc=True, errors="coerce")
    sel = sel[sel["t"].notna()]
    sel["a"], sel["c"] = sel["actual"].map(num), sel["consensus"].map(num)
    # Nasdaq gives MoM and YoY under one name at the same minute: keep the m/m row (smaller |consensus|, else |actual|)
    sel["mag"] = np.where(sel["c"].notna(), sel["c"].abs(), sel["a"].abs())
    sel["d"] = sel["t"].dt.tz_convert(NEWYORK).dt.date
    sel = sel.sort_values(["d", "mag"]).drop_duplicates("d", keep="first")
    return sel[["d", "t", "a", "c"]].rename(columns={"a": f"a_{field}", "c": f"c_{field}"})


def build_us_events(params: Params, audit: list) -> pd.DataFrame:
    need(LEGACY_EVENTS, "rate-surprise-events event table (carries the 2010-17 ForexFactory values)")
    leg = pd.read_parquet(LEGACY_EVENTS)
    leg = leg[leg["source"] == "ff_calendar"].copy()
    assert (leg["t"].dt.year <= 2017).all(), "legacy ff rows expected to end in 2017"
    rows = []
    for _, r in leg.iterrows():
        fam = r["family"]
        field = {"CPI": "core", "NFP": "headline", "FOMC": "rate"}[fam]
        rows.append({"family": fam, "t": r["t"], "src": "ff_calendar", f"a_{field}": r["actual"], f"c_{field}": r["consensus"]})
    E = [pd.DataFrame(rows)]
    cal = load_calendar_both(("United States",))
    for fam, (pf, tf) in PRIMARY.items():
        d = _calendar_field(cal, fam, pf)
        if tf:
            d = d.merge(_calendar_field(cal, fam, tf).drop(columns="t"), on="d", how="left")
        d = d[d["t"] >= pd.Timestamp(START[fam], tz="UTC")]
        d["family"], d["src"] = fam, np.where(d["t"] < pd.Timestamp(SEAM, tz="UTC") + pd.Timedelta(days=1), "calendar_events", "calendar_nasdaq")
        E.append(d.drop(columns="d"))
    ev = pd.concat(E, ignore_index=True)
    ev["t"] = pd.to_datetime(ev["t"], utc=True)
    # lockbox: release London date <= lockbox date
    ldate = ev["t"].dt.tz_convert(LONDON).dt.date.astype(str)
    n_lb = int((ldate > params.lockbox_last_date).sum())
    ev = ev[ldate <= params.lockbox_last_date]
    # Data releases are published at 08:30 ET. Some calendar rows (PPI 2014-15) carry a stamp one hour off (a DST
    # slip in the vendor file): re-clock a data-family row to 08:30 ET on its New York date when its stamp is within
    # +-1h of 08:30, as rate-surprise-events did for the ff rows. The 2y release-bar audit below checks the result.
    ny = ev["t"].dt.tz_convert(NEWYORK)
    mins = ny.dt.hour * 60 + ny.dt.minute
    fix = (ev["family"] != "FOMC") & (ev["src"] != "ff_calendar") & (mins != 510) & ((mins - 510).abs() <= 60)
    if fix.any():
        ev.loc[fix, "t"] = [pd.Timestamp(f"{d.date()} 08:30").tz_localize(NEWYORK).tz_convert("UTC") for d in ny[fix]]
    audit.append(f"- Re-clocked to 08:30 ET (stamp off by <= 1h): {int(fix.sum())} "
                 + (", ".join(f"{f} {d:%Y-%m-%d}" for f, d in zip(ev.loc[fix, 'family'], ny[fix])) or ""))
    # scheduled clock check (2018+ calendar rows; ff rows carry the published schedule already)
    ny = ev["t"].dt.tz_convert(NEWYORK)
    hhmm = ny.dt.strftime("%H:%M")
    sched = np.where(ev["family"] == "FOMC", hhmm == "14:00", hhmm == "08:30") | (ev["src"] == "ff_calendar")
    dropped = ev[~sched]
    audit.append(f"- Dropped as off-schedule (unscheduled FOMC actions, odd stamps): {len(dropped)} "
                 + (", ".join(f"{f} {t:%Y-%m-%d %H:%M}Z" for f, t in zip(dropped['family'], dropped['t'])) or "none"))
    audit.append(f"- Dropped after the lockbox date: {n_lb}")
    ev = ev[sched].sort_values("t").drop_duplicates(["family", "t"]).reset_index(drop=True)
    nfp = ev.loc[ev["family"] == "NFP", "a_headline"].abs().median()
    if not (nfp > 1000):
        raise ValueError(f"NFP actuals look like thousands, not persons (median |actual| {nfp}); unit map needed")
    return ev


def surprises(ev: pd.DataFrame) -> pd.DataFrame:
    """x = actual - consensus; z = x / sd(prior x of the same family and field), >= 12 prior (point-in-time)."""
    ev = ev.copy()
    for field in ("core", "headline"):
        ev[f"x_{field}"] = ev.get(f"a_{field}", np.nan) - ev.get(f"c_{field}", np.nan)
        ev[f"z_{field}"] = np.nan
        for fam in ("CPI", "NFP", "PPI"):
            m = (ev["family"] == fam).to_numpy()
            x = ev.loc[m, f"x_{field}"].to_numpy(float)
            z = np.full(len(x), np.nan)
            hist = []
            for k, v in enumerate(x):
                if len(hist) >= 12 and np.isfinite(v):
                    sd = np.std(hist, ddof=1)
                    z[k] = v / sd if sd > 0 else np.nan
                if np.isfinite(v):
                    hist.append(v)
            ev.loc[m, f"z_{field}"] = z
    s = np.zeros(len(ev))
    z = np.full(len(ev), np.nan)
    xsel = np.full(len(ev), np.nan)
    fsel = np.array([""] * len(ev), dtype=object)
    why = np.array([""] * len(ev), dtype=object)
    for i, r in enumerate(ev.itertuples(index=False)):
        if r.family == "FOMC":
            continue
        pf, tf = PRIMARY[r.family]
        xp = getattr(r, f"x_{pf}")
        if np.isfinite(xp) and xp != 0:
            s[i], z[i], xsel[i], fsel[i] = np.sign(xp), getattr(r, f"z_{pf}"), xp, pf
        elif tf and np.isfinite(xp) and xp == 0 and np.isfinite(getattr(r, f"x_{tf}", np.nan)) and getattr(r, f"x_{tf}") != 0:
            xt = getattr(r, f"x_{tf}")
            s[i], z[i], xsel[i], fsel[i] = np.sign(xt), getattr(r, f"z_{tf}"), xt, tf
        else:
            why[i] = "in_line" if np.isfinite(xp) else "no_consensus"
    ev["s_data"], ev["z_data"], ev["x"], ev["field"], ev["no_signal_reason"] = s, z, xsel, fsel, why
    return ev


def two_year(ev: pd.DataFrame, params: Params, audit: list) -> pd.DataFrame:
    """r2 = -ln(P2y(t+15)/P2y(t)) from the start-stamped M15 CFD; z2 = r2 / sd(15-min changes over the 28 days
    before t). Unchanged or missing = no market signal. Also the release-bar timestamp audit."""
    need(Y2_M15, "OANDA M15 US 2y CFD")
    y2 = load_close_m15(Y2_M15, params, "USB02Y_USD")
    t = y2.index.as_unit("ns").asi8
    c = y2.to_numpy(float)
    lr = np.r_[np.nan, np.diff(np.log(c))]
    lr[np.r_[True, np.diff(t) != 15 * NS_MIN]] = np.nan
    pos = {v: i for i, v in enumerate(t)}
    r2, z2, prof = [], [], []
    for T in ev["t"]:
        T0 = T.as_unit("ns").value
        i0, i1 = pos.get(T0 - 15 * NS_MIN), pos.get(T0)
        if i0 is None or i1 is None or c[i0] == c[i1]:
            r2.append(np.nan)
            z2.append(np.nan)
        else:
            r = -math.log(c[i1] / c[i0])
            lo = np.searchsorted(t, T0 - 28 * 86400 * 10**9)
            hi = np.searchsorted(t, T0 - 15 * NS_MIN)
            sd = np.nanstd(lr[lo:hi], ddof=1) if hi - lo > 50 else np.nan
            r2.append(r)
            z2.append(r / sd if sd and sd > 0 else np.nan)
        row = []
        for k in range(-4, 6):
            i = pos.get(T0 + k * 15 * NS_MIN)
            row.append(abs(lr[i]) if i is not None and np.isfinite(lr[i]) else np.nan)
        prof.append(row)
    ev = ev.copy()
    ev["r2"], ev["z2"] = r2, z2
    P = pd.DataFrame(prof, columns=[f"o{k}" for k in range(-4, 6)])
    P["family"] = ev["family"].to_numpy()
    P["era"] = np.where(ev["t"].dt.year <= 2017, "2010-17", "2018-26")
    tab = P.groupby(["family", "era"]).mean(numeric_only=True) * 1e4
    audit.append("\n## Timestamp check: mean |US 2y CFD 15-min log change| (bp) by bar offset from the release bar\n")
    audit.append("| family / era | " + " | ".join(str(k) for k in range(-4, 6)) + " | peak |")
    audit.append("|---|" + "---|" * 11)
    bad = []
    for (fam, era), r in tab.iterrows():
        vals = r.to_numpy()
        peak = int(np.nanargmax(vals)) - 4 if np.isfinite(vals).any() else None
        audit.append(f"| {fam} {era} | " + " | ".join(f"{v:.2f}" for v in vals) + f" | {peak} |")
        if peak != 0:
            bad.append((fam, era))
    ev["ts_ok"] = [(f, "2010-17" if y <= 2017 else "2018-26") not in bad for f, y in zip(ev["family"], ev["t"].dt.year)]
    audit.append(f"\nFamily x era dropped by the timestamp check: {bad or 'none'}")
    return ev


def finish(ev: pd.DataFrame) -> pd.DataFrame:
    ev = ev.copy()
    fomc = ev["family"] == "FOMC"
    ev["s"] = np.where(fomc, np.sign(ev["r2"].fillna(0)), ev["s_data"]).astype(int)
    ev["z"] = np.where(fomc, ev["z2"], ev["z_data"])
    ev.loc[fomc & ev["r2"].isna(), "no_signal_reason"] = "no_2y_move"
    ev.loc[~ev["ts_ok"], "s"] = 0
    ev.loc[~ev["ts_ok"], "no_signal_reason"] = "timestamp_check"
    # agreement of data and market surprise (data families only)
    agree = np.where(ev["r2"].notna() & (ev["r2"] != 0) & (ev["s_data"] != 0),
                     (np.sign(ev["r2"]) == ev["s_data"]).astype(float), np.nan)
    ev["agree"] = np.where(fomc, np.nan, agree)
    # point-in-time size tercile: cut points from the family's prior |z| (>= 24)
    terc = np.full(len(ev), np.nan)
    for fam in ev["family"].unique():
        idx = np.where((ev["family"] == fam).to_numpy())[0]
        hist = []
        for i in idx:
            a = abs(ev["z"].iat[i]) if np.isfinite(ev["z"].iat[i]) else np.nan
            if ev["s"].iat[i] != 0 and np.isfinite(a):
                if len(hist) >= 24:
                    q1, q2 = np.quantile(hist, [1 / 3, 2 / 3])
                    terc[i] = 1 if a <= q1 else (2 if a <= q2 else 3)
                hist.append(a)
    ev["tercile"] = terc
    ev["eid"] = np.arange(len(ev))
    ev["ny_clock"] = ev["t"].dt.tz_convert(NEWYORK).dt.strftime("%H:%M")
    ev["ny_date"] = ev["t"].dt.tz_convert(NEWYORK).dt.date
    return ev


def build_mirror(params: Params) -> pd.DataFrame:
    """Non-US mirror (descriptive): UK CPI y/y -> GBPUSD, euro-area flash HICP y/y -> EURUSD; legacy file only."""
    cal = load_calendar_both(("United Kingdom", "Euro Area"))
    out = []
    for fam, (country, name, inst) in MIRROR.items():
        d = cal[(cal["country"] == country) & (cal["event"] == name) & (cal["source"].astype(str) == "legacy")].copy()
        d["t"] = pd.to_datetime(d["datetime_raw"], utc=True, errors="coerce")
        d["x"] = d["actual"].map(num) - d["consensus"].map(num)
        d = d[d["t"].notna() & d["x"].notna()].drop_duplicates("t")
        d = d[d["t"].dt.tz_convert(LONDON).dt.date.astype(str) <= params.lockbox_last_date]
        d["family"], d["inst"], d["s"] = fam, inst, np.sign(d["x"]).astype(int)
        out.append(d[["family", "t", "x", "s", "inst"]])
    m = pd.concat(out, ignore_index=True).sort_values("t").reset_index(drop=True)
    m["ny_clock"] = m["t"].dt.tz_convert(NEWYORK).dt.strftime("%H:%M")
    m["ny_date"] = m["t"].dt.tz_convert(NEWYORK).dt.date
    return m


def coverage_text(ev: pd.DataFrame, mirror: pd.DataFrame | None) -> list[str]:
    L = ["\n## Coverage (exact)\n", "| family | years | events | signal != 0 | in line | no consensus / no 2y move | timestamp-dropped |",
         "|---|---|---|---|---|---|---|"]
    for fam in ("CPI", "NFP", "PPI", "FOMC"):
        e = ev[ev["family"] == fam]
        if not len(e):
            L.append(f"| {fam} | - | 0 | 0 | 0 | 0 | 0 |")
            continue
        L.append(f"| {fam} | {e['t'].dt.year.min()}-{e['t'].dt.year.max()} | {len(e)} | {int((e['s'] != 0).sum())} | "
                 f"{int((e['no_signal_reason'] == 'in_line').sum())} | "
                 f"{int(e['no_signal_reason'].isin(['no_consensus', 'no_2y_move']).sum())} | {int((e['no_signal_reason'] == 'timestamp_check').sum())} |")
    L.append(f"| **total** | | {len(ev)} | {int((ev['s'] != 0).sum())} | | | |")
    L.append("\nSignal events by year: " + ", ".join(f"{y}: {n}" for y, n in ev[ev['s'] != 0].groupby(ev['t'].dt.year).size().items()))
    L.append(f"\nAgreement defined (data families): {int(ev['agree'].notna().sum())} "
             f"(CPI {int(ev.loc[ev.family == 'CPI', 'agree'].notna().sum())}, NFP {int(ev.loc[ev.family == 'NFP', 'agree'].notna().sum())}, "
             f"PPI {int(ev.loc[ev.family == 'PPI', 'agree'].notna().sum())}); tercile assigned: {int(ev['tercile'].notna().sum())}")
    if mirror is not None:
        L.append("Mirror events (signal != 0): " + ", ".join(f"{f} {int((g['s'] != 0).sum())} ({g['t'].dt.year.min()}-{g['t'].dt.year.max()})"
                                                       for f, g in mirror.groupby("family")))
    return L


def spot_check(ev: pd.DataFrame, params: Params) -> list[str]:
    rng = rng_for(params, "spotcheck")
    L = ["\n## Spot-check against first prints (prereg §3.1): fill the last column from the BLS / Fed archive\n",
         "| family | release (UTC) | field | actual | consensus | first print (BLS/Fed) |", "|---|---|---|---|---|---|"]
    for fam in ("CPI", "NFP", "PPI", "FOMC"):
        e = ev[ev["family"] == fam]
        for i in sorted(rng.choice(len(e), size=min(5, len(e)), replace=False)) if len(e) else []:
            r = e.iloc[i]
            f = PRIMARY[fam][0]
            L.append(f"| {fam} | {r['t']:%Y-%m-%d %H:%M} | {f} | {r.get(f'a_{f}')} | {r.get(f'c_{f}')} | |")
    L.append("\nRule: more than 2 of 20 mismatches flags the family; the flag is reported next to its slice.")
    return L


def build(params: Params, write: bool = True):
    audit = ["# post-release-drift-pooled: event table and data audit", "",
             "Signal side only (calendar values, the 2y CFD move inside [t, t+15]); no price after entry is read here."]
    ev = build_us_events(params, audit)
    ev = surprises(ev)
    ev = two_year(ev, params, audit)
    ev = finish(ev)
    try:
        mirror = build_mirror(params)
    except DataMissing:
        raise
    audit += coverage_text(ev, mirror)
    audit += spot_check(ev, params)
    if write:
        OUT.mkdir(parents=True, exist_ok=True)
        ev.drop(columns=["ny_date"]).to_parquet(OUT / "events.parquet")
        mirror.drop(columns=["ny_date"]).to_parquet(OUT / "mirror_events.parquet")
        text = "\n".join(audit) + "\n"
        dest = OUT / "DATA_AUDIT.md"
        # never overwrite a hand-filled audit (the 20-event first-print spot-check): if the file exists and differs
        # from what would be generated, keep it and write the fresh table beside it
        if dest.exists() and dest.read_text() != text:
            dest = OUT / "DATA_AUDIT.generated.md"
            print(f"[events] kept the existing DATA_AUDIT.md (hand-filled); fresh table in {dest.name}")
        dest.write_text(text)
    return ev, mirror, audit
