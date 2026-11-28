"""surprise-size-pooled step 1: the release table (NO price data is read here).

Source: the ForexFactory archive data/calendar/ff_calendar_2007_2025.csv (gitignored, main
checkout), the same rows backfill/surprise_backfill.json was built from (8 currencies,
High/Medium impact, actual AND forecast present). The committed backfill JSON keeps the raw
UTC stamp, which is wrong for two classes of row, so we rebuild from the CSV:

1. Placeholder rows (no clock time; the scrape wrote Tehran midnight, UTC 19:30/20:30/23:30):
   the event date is the DATE PART OF THE RAW STRING (the ForexFactory calendar day).
   forge/ff_calendar.apply_rule converts the UTC stamp to Asia/Tehran instead, which is right
   up to 2022 but a day EARLY for summer 2023-25: the file still stamps +04:30 (Iran DST) after
   Iran abolished DST in 2022, so 00:00+04:30 is 23:00 the previous day in today's tzdata.
   (NFP lands on a Friday 50% of the time in 2023-24 under apply_rule, 100% under the raw date.)
2. Real-clock rows stamped +04:30 from 2023 on: the clock was Tehran +03:30, the file says
   +04:30, so the UTC instant is one hour EARLY (US CPI at 07:30 New York). Add 60 minutes.

Placeholder rows have no time at all, so each gets its series' schedule: the modal LOCAL
(issuer-timezone) clock time of the same series' real-clock rows within +/-365 days (>= 3
such rows and the mode >= 60% of them). The schedule is public in advance, so this is not
lookahead. Rows that cannot be timed this way are dropped and counted.

Surprise: s = actual - forecast (suffixes K/M/B/T and % stripped, K/M/B/T scaled).
Size z = |s| / RMS(s over the series' previous <= 60 releases), needing >= 12 previous
releases (point in time: only earlier releases). Series where >= 50% of the previous
surprises are exactly zero are 'discrete' (rate decisions and the like): z is not defined;
they carry an any-surprise flag instead and form their own descriptive cell.

Output: analysis/output/surprise-size-pooled/releases.parquet (one row per series release)
        analysis/output/surprise-size-pooled/prep_log.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

MAIN = Path(r"C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel")
HERE = Path(__file__).resolve().parents[2]
OUT = HERE / "analysis" / "output" / "surprise-size-pooled"
OUT.mkdir(parents=True, exist_ok=True)

SRC = MAIN / "data" / "calendar" / "ff_calendar_2007_2025.csv"
CCY_TO_ECON = {"USD": "US", "EUR": "EU", "GBP": "GB", "JPY": "JP", "AUD": "AU",
               "NZD": "NZ", "CAD": "CA", "CHF": "CH"}
ISSUER_TZ = {"US": "America/New_York", "EU": "Europe/Berlin", "GB": "Europe/London",
             "JP": "Asia/Tokyo", "AU": "Australia/Sydney", "NZ": "Pacific/Auckland",
             "CA": "America/Toronto", "CH": "Europe/Zurich"}
IMPACT = {"High Impact Expected": "high", "Medium Impact Expected": "medium"}
PLACEHOLDER_HHMM = {"19:30", "20:30", "23:30", "23:59"}
MIN_PRIOR = 12
MAX_PRIOR = 60

# Event family, by regex on the ForexFactory title (first match wins). Fixed in the prereg.
FAMILIES = [
    ("rate_decision", r"rate statement|cash rate|bank rate|funds rate|refinancing rate|policy rate|overnight rate|call rate|libor rate|deposit rate|interest rate|monetary policy"),
    ("employment", r"employment|payroll|unemployment|claimant|jobless|non-farm|nfp|average (hourly )?earnings|wage"),
    ("inflation", r"\bcpi\b|\bppi\b|inflation|price index|pce"),
    ("gdp", r"\bgdp\b"),
    ("survey", r"pmi|ism|sentiment|confidence|ifo|zew|tankan|business|climate|outlook|survey|empire|philly|kof"),
    ("activity", r"retail|sales|production|orders|trade balance|current account|housing|building|starts|permits|spending|income|manufacturing"),
]


def family(ev: str) -> str:
    low = ev.lower()
    for name, rx in FAMILIES:
        if re.search(rx, low):
            return name
    return "other"


_NUM = re.compile(r"^\s*([<>]?)\s*(-?\d+(?:\.\d+)?)\s*([KMBT%]?)\s*$", re.I)
_SCALE = {"": 1.0, "%": 1.0, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}


def parse(v) -> float:
    if not isinstance(v, str):
        return np.nan
    m = _NUM.match(v.replace(",", ""))
    if not m:
        return np.nan
    return float(m.group(2)) * _SCALE[m.group(3).upper()]


def load_calendar_events(log: dict) -> pd.DataFrame:
    ce = pd.read_csv(MAIN / "calendar_events.csv", encoding="latin-1", dtype=str)
    n = len(ce)
    ce = ce.drop_duplicates()
    log["calendar_events_rows"] = n
    log["calendar_events_exact_dups_dropped"] = int(n - len(ce))
    ce = ce[ce["ccy"].isin(CCY_TO_ECON)].copy()
    ce["t"] = pd.to_datetime(ce["datetime_raw"], errors="coerce").dt.tz_localize("UTC")
    ce = ce[ce["t"].notna()]
    # DATA_SPEC #26: summer 2014-15 ECB/BoE stamps 1 h late
    summer = ce["t"].dt.tz_convert("Europe/London").map(lambda x: bool(x.dst()))
    cb = ce["event"].str.contains("ECB|BoE|Bank of England|Interest Rate Decision", case=False, na=False) & ce["ccy"].isin(["EUR", "GBP"])
    fix = summer & cb & ce["t"].dt.year.isin([2014, 2015])
    ce.loc[fix, "t"] = ce.loc[fix, "t"] - pd.Timedelta(hours=1)
    log["calendar_events_dst_fixed_rows"] = int(fix.sum())
    ce["date"] = pd.to_datetime(ce["date"])
    ce["a"] = pd.to_numeric(ce["actual"], errors="coerce")
    ce["c"] = pd.to_numeric(ce["consensus"].str.strip(), errors="coerce")
    return ce[ce["a"].notna()][["ccy", "date", "t", "a", "c", "event"]]


def main() -> None:
    log: dict = {}
    raw = pd.read_csv(SRC, usecols=["DateTime", "Currency", "Impact", "Event", "Actual", "Forecast"],
                      low_memory=False)
    log["raw_rows"] = int(len(raw))
    raw = raw[raw["Currency"].isin(CCY_TO_ECON) & raw["Impact"].isin(IMPACT)].copy()
    raw = raw[raw["Actual"].notna() & raw["Forecast"].notna()
              & raw["Actual"].astype(str).str.strip().ne("") & raw["Forecast"].astype(str).str.strip().ne("")]
    log["rows_8ccy_high_med_with_consensus"] = int(len(raw))   # should be 26,403 (the backfill)
    n0 = len(raw)
    raw = raw.drop_duplicates(["DateTime", "Currency", "Event"])
    log["dedup_dropped"] = int(n0 - len(raw))

    raw["econ"] = raw["Currency"].map(CCY_TO_ECON)
    raw["impact"] = raw["Impact"].map(IMPACT)
    raw["Event"] = raw["Event"].astype(str).str.strip()
    t = pd.to_datetime(raw["DateTime"], utc=True)
    raw["hhmm_utc"] = t.dt.strftime("%H:%M")
    raw["placeholder"] = raw["hhmm_utc"].isin(PLACEHOLDER_HHMM)
    off = raw["DateTime"].str[-6:]
    yr = t.dt.year
    fix = (~raw["placeholder"]) & (off == "+04:30") & (yr >= 2023)
    log["realclock_rows_shifted_plus60_2023on"] = int(fix.sum())
    t = t + pd.to_timedelta(np.where(fix, 60, 0), unit="m")
    raw["t_real"] = t.where(~raw["placeholder"])
    raw["ff_date"] = pd.to_datetime(raw["DateTime"].str[:10])          # FF calendar day
    raw["date_for_sched"] = np.where(raw["placeholder"], raw["ff_date"],
                                     raw["t_real"].dt.tz_convert(None).dt.normalize())
    raw["date_for_sched"] = pd.to_datetime(raw["date_for_sched"])

    # local issuer clock of real-clock rows
    raw["local_hhmm"] = None
    for e, tz in ISSUER_TZ.items():
        m = (raw["econ"] == e) & raw["t_real"].notna()
        loc = raw.loc[m, "t_real"].dt.tz_convert(tz)
        teh = raw.loc[m, "t_real"].dt.tz_convert("Asia/Tehran")
        dd = (loc.dt.tz_localize(None).dt.normalize() - teh.dt.tz_localize(None).dt.normalize()).dt.days
        # key = local clock + day offset of the local date vs the FF (Tehran) day
        raw.loc[m, "local_hhmm"] = loc.dt.strftime("%H:%M") + "|" + dd.astype(str)
    # placeholder: impute from same-series real-clock rows within +/-365 days
    raw = raw.sort_values("date_for_sched").reset_index(drop=True)
    t0 = pd.Series(pd.NaT, index=raw.index, dtype="datetime64[ns, UTC]")
    t0[raw["t_real"].notna()] = raw.loc[raw["t_real"].notna(), "t_real"]
    imputed = np.zeros(len(raw), bool)
    for (e, ev), g in raw.groupby(["econ", "Event"], sort=False):
        real = g[g["t_real"].notna()]
        ph = g[g["placeholder"]]
        if not len(ph):
            continue
        rd = real["date_for_sched"].values.astype("datetime64[D]").astype(np.int64)
        rl = real["local_hhmm"].values
        tz = ISSUER_TZ[e]
        for idx, row in ph.iterrows():
            d = np.datetime64(row["ff_date"], "D").astype(np.int64)
            # nearest schedule first (+/-365 d), then the whole series' schedule (stable clocks,
            # e.g. NFP 08:30 New York, whose real-clock rows are all pre-2013)
            vc = None
            for span, share in ((365, 0.6), (10 ** 6, 0.6)):
                sel = np.abs(rd - d) <= span
                if sel.sum() < 3:
                    continue
                c = pd.Series(rl[sel]).value_counts()
                if c.iloc[0] / sel.sum() >= share:
                    vc = c
                    break
            if vc is None:
                continue
            clock, dd = vc.index[0].split("|")
            hh, mm = map(int, clock.split(":"))
            # FF day is the Tehran calendar day; the local issuer date is that day plus the
            # modal day offset seen on the series' real-clock rows (e.g. +1 for a 07:45
            # Auckland release, which falls on the previous Tehran day).
            day = pd.Timestamp(row["ff_date"].date()) + pd.Timedelta(days=int(dd))
            local = day.replace(hour=hh, minute=mm).tz_localize(tz, nonexistent="shift_forward", ambiguous=True)
            t0[idx] = local.tz_convert("UTC")
            imputed[idx] = True
    # second time source: calendar_events.csv (other vendor, 2014-01 -> 2026-07, real UTC
    # stamps). Known faults handled: 46k exact-duplicate rows (dropped), summer 2014-15
    # ECB/BoE stamps 1 h late (shifted -1 h). Matched to an FF row on currency + date
    # (FF day, +/-1) + identical parsed ACTUAL (and consensus when both carry one); used only
    # when every matching csv row carries the same minute.
    ce = load_calendar_events(log)
    a_ff = raw["Actual"].map(parse)
    f_ff = raw["Forecast"].map(parse)
    csv_t = pd.Series(pd.NaT, index=raw.index, dtype="datetime64[ns, UTC]")
    by_key = {k: g for k, g in ce.groupby(["ccy", "date"])}
    for i in raw.index:
        av = a_ff[i]
        if not np.isfinite(av):
            continue
        cands = []
        for dd in (0, -1, 1):
            g = by_key.get((raw.at[i, "Currency"], raw.at[i, "ff_date"] + pd.Timedelta(days=dd)))
            if g is None:
                continue
            m = np.isclose(g["a"].to_numpy(), av, rtol=1e-6, atol=1e-9)
            if np.isfinite(f_ff[i]):
                fc = g["c"].to_numpy()
                m &= ~np.isfinite(fc) | np.isclose(fc, f_ff[i], rtol=1e-6, atol=1e-9)
            if m.any():
                cands.append(g.loc[m, "t"])
            if cands:
                break
        if cands:
            ts = pd.concat(cands).unique()
            if len(ts) == 1:
                csv_t[i] = ts[0]
    real = raw["t_real"].notna() & csv_t.notna()
    log["csv_match_realclock_rows"] = int(real.sum())
    log["csv_vs_ff_realclock_agree_share"] = round(float((csv_t[real] == raw.loc[real, "t_real"]).mean()), 3) if real.any() else None
    r16 = real & (raw["t_real"].dt.year >= 2016)
    log["csv_vs_ff_realclock_agree_share_2016on"] = round(float((csv_t[r16] == raw.loc[r16, "t_real"]).mean()), 3) if r16.any() else None
    log["csv_vs_ff_realclock_within2min_share_2016on"] = round(float(((csv_t[r16] - raw.loc[r16, "t_real"]).abs() <= pd.Timedelta(minutes=2)).mean()), 3) if r16.any() else None
    both = imputed & csv_t.notna().to_numpy()
    b16 = both & (t0.dt.year >= 2016).to_numpy()
    log["csv_vs_schedule_agree_share_2016on"] = round(float((csv_t[b16] == t0[b16]).mean()), 3) if b16.any() else None
    log["csv_vs_schedule_imputed_rows"] = int(both.sum())
    log["csv_vs_schedule_agree_share"] = round(float((csv_t[both] == t0[both]).mean()), 3) if both.any() else None
    use_csv = raw["placeholder"].to_numpy() & csv_t.notna().to_numpy()
    t0[use_csv] = csv_t[use_csv]
    src = np.where(raw["t_real"].notna(), "ff_clock", np.where(use_csv, "calendar_events", np.where(imputed, "schedule", "none")))
    raw["t0"] = t0
    raw["time_src"] = src
    raw["time_imputed"] = src == "schedule"
    log["placeholder_rows"] = int(raw["placeholder"].sum())
    log["placeholder_timed_from_calendar_events"] = int(use_csv.sum())
    log["placeholder_timed_from_schedule"] = int((src == "schedule").sum())
    log["untimed_dropped"] = int(raw["t0"].isna().sum())
    raw = raw[raw["t0"].notna()].copy()

    # surprises, point in time per series
    raw["a"] = raw["Actual"].map(parse)
    raw["f"] = raw["Forecast"].map(parse)
    bad = raw["a"].isna() | raw["f"].isna()
    log["unparseable_dropped"] = int(bad.sum())
    raw = raw[~bad].copy()
    raw["s"] = raw["a"] - raw["f"]
    raw = raw.sort_values("t0").reset_index(drop=True)
    z = np.full(len(raw), np.nan)
    disc = np.zeros(len(raw), bool)
    nprior = np.zeros(len(raw), int)
    for (e, ev), g in raw.groupby(["econ", "Event"], sort=False):
        s = g["s"].to_numpy()
        for k, i in enumerate(g.index):
            prev = s[max(0, k - MAX_PRIOR):k]
            nprior[i] = len(prev)
            if len(prev) < MIN_PRIOR:
                continue
            if np.mean(prev == 0) >= 0.5:
                disc[i] = True
                continue
            rms = float(np.sqrt(np.mean(prev ** 2)))
            if rms > 0:
                z[i] = abs(s[k]) / rms
    raw["z"] = z
    raw["discrete"] = disc
    raw["any_surprise"] = raw["s"] != 0
    raw["n_prior"] = nprior
    raw["family"] = raw["Event"].map(family)
    keep = ["econ", "Currency", "Event", "impact", "family", "t0", "time_src", "time_imputed", "placeholder",
            "ff_date", "a", "f", "s", "z", "discrete", "any_surprise", "n_prior"]
    out = raw[keep].copy()
    out["t0"] = out["t0"].dt.tz_convert("UTC")
    out.to_parquet(OUT / "releases.parquet", index=False)

    win = out[(out["t0"] >= pd.Timestamp("2016-01-05", tz="UTC"))]
    log["rows_timed_total"] = int(len(out))
    log["rows_2016on"] = int(len(win))
    log["rows_2016on_scored_z"] = int(win["z"].notna().sum())
    log["rows_2016on_discrete"] = int(win["discrete"].sum())
    log["by_econ_2016on"] = {e: {"rows": int((win.econ == e).sum()),
                                 "z": int(((win.econ == e) & win.z.notna()).sum()),
                                 "high_z": int(((win.econ == e) & win.z.notna() & (win.impact == "high")).sum()),
                                 "discrete": int(((win.econ == e) & win.discrete).sum()),
                                 "imputed_share": round(float(win.loc[win.econ == e, "time_imputed"].mean()), 3)}
                             for e in ISSUER_TZ}
    log["family_2016on_z"] = win[win.z.notna()]["family"].value_counts().to_dict()
    log["z_quantiles_2016on"] = {str(q): round(float(win["z"].quantile(q)), 3) for q in (0.1, 0.25, 0.5, 0.75, 0.9, 0.99)}
    (OUT / "prep_log.json").write_text(json.dumps(log, indent=2, default=str))
    print(json.dumps(log, indent=2, default=str))


if __name__ == "__main__":
    main()
