"""Loaders / adapters. EVERY loader takes an explicit `to` (ISO date, required, no default) and never returns anything
that was not public on or before it (data-rules: no lookahead, point-in-time; ROE section 8: explicit `to` and a
truncation test). A loader that cannot find its file raises LoaderError; the scan turns that into a MISSING flag.

Local file formats (what the owner points the adapters at on the laptop) are documented in roe/README.md.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import re
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from .series import Series
from .util import add_sessions  # noqa: F401  (re-export convenience)


class LoaderError(Exception):
    pass


def _need_to(to):
    if not isinstance(to, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", to):
        raise LoaderError(f"`to` must be an explicit ISO date string (YYYY-MM-DD), got {to!r}")
    try:
        dt.date.fromisoformat(to)
    except ValueError as e:
        raise LoaderError(f"`to` is not a real date: {to!r}") from e


def _f(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v else None


def _finish(sid, rows, to, **kw) -> Series:
    """rows: [(date, value)] unsorted. Sort, dedupe by date (last wins), cut at `to`, count the future-dated ones."""
    rows = sorted(((d, v) for d, v in rows if v is not None), key=lambda r: r[0])
    dd = {}
    for d, v in rows:
        dd[d] = v
    dates = sorted(dd)
    kept = [d for d in dates if d <= to]
    s = Series(sid, kept, [dd[d] for d in kept], **kw)
    s.meta["droppedAfterTo"] = len(dates) - len(kept)
    return s


def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    """GET only. The scanner sends nothing to any server."""
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "roe-scanner/1.0 (read-only)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - owner-supplied URL, GET only
        return r.read()


# ---------------------------------------------------------------------------------------------------------------- csv
def load_cboe_csv(path, series_id: str, to: str, *, kind="market") -> Series:
    """Cboe history csv: `DATE` (MM/DD/YYYY) then OPEN,HIGH,LOW,CLOSE, or a 2-column DATE,<name>. Uses the close."""
    _need_to(to)
    p = Path(path)
    if not p.exists():
        raise LoaderError(f"missing file {p}")
    rows = []
    with open(p, newline="", encoding="utf-8-sig") as f:
        rd = csv.reader(f)
        head = next(rd, None)
        if not head:
            raise LoaderError(f"empty file {p}")
        ci = head.index("CLOSE") if "CLOSE" in head else len(head) - 1
        for r in rd:
            if len(r) <= ci or not r[0]:
                continue
            try:
                m, d, y = r[0].split("/")
                date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
            except ValueError:
                continue
            rows.append((date, _f(r[ci])))
    return _finish(series_id, rows, to, cadence="daily", kind=kind, source=f"cboe_csv:{p.name}")


def load_fred_csv(path, series_id: str, to: str) -> Series:
    """FRED fredgraph-style csv: observation_date,<ID>; '.' or blank = missing. Observation date, not publication date."""
    _need_to(to)
    p = Path(path)
    if not p.exists():
        raise LoaderError(f"missing file {p}")
    rows = []
    with open(p, newline="", encoding="utf-8-sig") as f:
        rd = csv.reader(f)
        next(rd, None)
        for r in rd:
            if len(r) >= 2 and r[0]:
                rows.append((r[0][:10], _f(r[1])))
    return _finish(series_id, rows, to, cadence="daily", kind="macro", source=f"fred_csv:{p.name}")


COT_FLIP_TO_CURRENCY_TERMS = ("JPY", "CAD", "CHF")   # cot_weekly.csv stores these in USD/xxx pair terms


def load_cot_weekly_csv(path, to: str, *, known_lag_days: int = 3, symbols=None, currency_terms: bool = True) -> dict:
    """analysis/output/cot-crowding-programme/cot_weekly.csv -> {'COT:<sym>': Series} of the spec net share of open
    interest in % (100*(spec_long-spec_short)/oi). `known` = report date + 3 days (the Friday release), so a report is
    never used before it was public. JPY/CAD/CHF are stored in pair terms and are sign-flipped to currency terms here
    (COT_WEEKLY_README.md); pass currency_terms=False to keep pair terms."""
    _need_to(to)
    p = Path(path)
    if not p.exists():
        raise LoaderError(f"missing file {p}")
    per: dict = {}
    with open(p, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            sym = r["sym"]
            if symbols and sym not in symbols:
                continue
            sl, ss, oi = _f(r["spec_long"]), _f(r["spec_short"]), _f(r["oi"])
            if sl is None or ss is None or not oi:
                continue
            share = 100.0 * (sl - ss) / oi
            if currency_terms and sym in COT_FLIP_TO_CURRENCY_TERMS:
                share = -share
            per.setdefault(sym, []).append((r["report_date"][:10], share))
    out = {}
    for sym, rows in per.items():
        rows = sorted(rows)
        known = [str(dt.date.fromisoformat(d) + dt.timedelta(days=known_lag_days)) for d, _ in rows]
        keep = [i for i, k in enumerate(known) if k <= to]
        s = Series(f"COT:{sym}", [rows[i][0] for i in keep], [rows[i][1] for i in keep], cadence="weekly",
                   kind="positioning", source=f"cot_weekly_csv:{p.name}", known=[known[i] for i in keep])
        s.meta["droppedAfterTo"] = len(rows) - len(keep)
        out[s.id] = s
    return out


def load_parquet_close(path, series_id: str, to: str) -> Series:
    """NY-close daily parquet (index = date, column `close`), e.g. oi_research_book/data/gex_range_es/*_nyclose_d1.parquet."""
    _need_to(to)
    p = Path(path)
    if not p.exists():
        raise LoaderError(f"missing file {p}")
    try:
        import pandas as pd
        df = pd.read_parquet(p)
    except Exception as e:  # noqa: BLE001
        raise LoaderError(f"cannot read parquet {p}: {e}") from e
    rows = [(str(i)[:10], _f(c)) for i, c in zip(df.index, df["close"])]
    return _finish(series_id, rows, to, cadence="daily", kind="market", source=f"parquet:{p.name}")


def load_range_csv(path, to: str) -> dict:
    """Laptop/R2-archive export of the daily run's realised range and the shipped line, one row per date x instrument:
    `date,instrument,hl_pct,hl_median_pct,hl_75_pct` (all % of the session open). Returns HL75:<I> and HL50:<I> series
    (realised HL divided by the line; above 1 = the line was exceeded)."""
    _need_to(to)
    p = Path(path)
    if not p.exists():
        raise LoaderError(f"missing file {p}")
    per: dict = {}
    with open(p, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            hl, p50, p75 = _f(r.get("hl_pct")), _f(r.get("hl_median_pct")), _f(r.get("hl_75_pct"))
            if hl is None or not p50 or not p75:
                continue
            per.setdefault(r["instrument"], []).append((r["date"][:10], hl / p75, hl / p50))
    out = {}
    for inst, rows in per.items():
        out[f"HL75:{inst}"] = _finish(f"HL75:{inst}", [(d, a) for d, a, _ in rows], to, kind="session", source=f"range_csv:{p.name}")
        out[f"HL50:{inst}"] = _finish(f"HL50:{inst}", [(d, b) for d, _, b in rows], to, kind="session", source=f"range_csv:{p.name}")
    return out


def load_calendar_csv(paths, to: str, *, ahead_days: int = 7) -> list:
    """Economic calendar rows as SCHEDULE ONLY: date, ccy, impact, event. actual/previous/consensus are dropped (they are
    not point-in-time). Events up to `to + ahead_days` are kept because a scheduled release date is public in advance;
    nothing after that is returned."""
    _need_to(to)
    limit = str(dt.date.fromisoformat(to) + dt.timedelta(days=ahead_days))
    seen, out = set(), []
    for path in paths if isinstance(paths, (list, tuple)) else [paths]:
        p = Path(path)
        if not p.exists():
            raise LoaderError(f"missing file {p}")
        with open(p, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                d = (r.get("date") or "")[:10]
                if not d or d > limit:
                    continue
                key = (d, r.get("ccy"), r.get("event"))
                if key in seen:
                    continue
                seen.add(key)
                out.append({"date": d, "ccy": r.get("ccy"), "impact": r.get("impact"), "event": r.get("event")})
    out.sort(key=lambda e: (e["date"], e["ccy"] or "", e["event"] or ""))
    return out


# ---------------------------------------------------------------------------------------------------- server documents
@dataclass
class StateBundle:
    series: dict = field(default_factory=dict)       # state sparks as Series (source 'state')
    points: dict = field(default_factory=dict)       # point-only readings stamped with the state's session date
    server_ref: dict = field(default_factory=dict)   # the server's own percentiles, labelled non-causal
    generated_at: str | None = None
    as_of: str | None = None
    errors: list = field(default_factory=list)
    dropped_points: list = field(default_factory=list)


TIER_ALIAS = {"us2y": "DGS2", "us10y": "DGS10", "spx": "SPX", "nq": "NQ"}
DRIVER_ALIAS = {"gold": "GOLD"}
SERVER_LABEL = "server, non-causal"


def _spark(sid, spark, to, source, **kw) -> Series:
    return _finish(sid, [(str(d)[:10], _f(v)) for d, v in spark or []], to, source=source, **kw)


def load_state(doc: dict, to: str) -> StateBundle:
    """GET /api/state (js/stateEngine.js) -> sparks as series (about 90-260 points each, NOT full history) plus point-only
    readings. The server's percentiles (`pctile`, `ctx.pctAll/pct5y`, cot `pct3y/pctAll`) include today and use the full
    sample; they are kept only as `server_ref`, labelled 'server, non-causal', never used by a trigger.
    Point-only readings (gamma, health) describe the state's session date `asOf`; they are returned only if that date is
    <= `to`."""
    _need_to(to)
    b = StateBundle(generated_at=doc.get("generatedAt"), as_of=doc.get("asOf"), errors=list(doc.get("errors") or []))
    for tier in doc.get("tiers") or []:
        for r in tier.get("readings") or []:
            sid = TIER_ALIAS.get(r.get("key"))
            if sid:
                kw = {"change_kind": "diff"}
                s = _spark(sid, r.get("spark"), to, f"state:tiers.{r['key']}", kind="market", **kw)
                if s.dates:
                    b.series[sid] = s
            p = r.get("pctile")
            if p:
                b.server_ref[f"tier:{r.get('key')}"] = {"pct": p.get("pct"), "n": p.get("n"), "spanDays": p.get("spanDays"), "label": SERVER_LABEL}
    for r in (doc.get("drivers") or {}).get("readings") or []:
        sid = DRIVER_ALIAS.get(r.get("key"))
        if sid:
            s = _spark(sid, r.get("spark"), to, f"state:drivers.{r['key']}", kind="market")
            if s.dates:
                b.series[sid] = s
    for r in (doc.get("history") or {}).get("long") or []:
        ctx = r.get("ctx") or {}
        s = _spark(r["id"], ctx.get("spark"), to, f"state:history.long.{r['id']}", kind="market")
        if s.dates:
            b.series[r["id"]] = s
        b.server_ref[r["id"]] = {"pctAll": ctx.get("pctAll"), "pct5y": ctx.get("pct5y"), "n": ctx.get("n"), "since": ctx.get("since"), "label": SERVER_LABEL}
    for r in (doc.get("history") or {}).get("cot") or []:
        b.server_ref[f"COT:{r.get('sym')}"] = {"pct3y": r.get("pct3y"), "pctAll": r.get("pctAll"), "share": r.get("share"),
                                               "weeks": r.get("weeks"), "asOf": r.get("asOf"), "label": SERVER_LABEL}
    stamp = doc.get("asOf")
    if stamp and stamp <= to:
        gam = ((doc.get("assets") or {}).get("gamma") or {}).get("rows")
        if gam:
            b.points["gamma"] = {"stamp": stamp, "rows": gam}
        if doc.get("health") is not None:
            b.points["health"] = {"stamp": stamp, "rows": doc.get("health")}
    else:
        b.dropped_points.append(f"state.asOf {stamp!r} is after to={to}: point-only readings (gamma, health) dropped")
    return b


def load_hit_rates(doc: dict, to: str) -> dict:
    """GET /api/vol-forecast/hit-rates -> HL75:<I> / HL50:<I> series from `instruments[I].daily[]`: realised
    HL% = (day_high - day_low)/open*100 divided by the shipped production line fc.hl_75 / fc.hl_median (the live forecast
    that the daily run published that morning; ~65-90 sessions). Rows after `to` are dropped."""
    _need_to(to)
    out = {}
    for inst, rec in (doc.get("instruments") or {}).items():
        r75, r50 = [], []
        for d in rec.get("daily") or []:
            o, h, l, fc = _f(d.get("open")), _f(d.get("day_high")), _f(d.get("day_low")), d.get("fc") or {}
            p75, p50 = _f(fc.get("hl_75")), _f(fc.get("hl_median"))
            if not o or h is None or l is None or not p75 or not p50:
                continue
            hl = (h - l) / o * 100.0
            r75.append((str(d["date"])[:10], hl / p75))
            r50.append((str(d["date"])[:10], hl / p50))
        if r75:
            out[f"HL75:{inst}"] = _finish(f"HL75:{inst}", r75, to, kind="session", source="state:hit-rates")
            out[f"HL50:{inst}"] = _finish(f"HL50:{inst}", r50, to, kind="session", source="state:hit-rates")
    return out


def load_desk_quality(doc: dict, to: str) -> dict | None:
    """GET /api/desk-pack -> only the data-quality block (the 2.7 MB body is hashed by the caller, not kept)."""
    _need_to(to)
    d = str(doc.get("date") or "")[:10]
    if not d or d > to:
        return None
    dq = doc.get("dataQuality") or {}
    return {"stamp": d, "usableShare": dq.get("usableShare"), "decision": dq.get("decision"), "reasons": dq.get("reasons") or [],
            "builtAt": doc.get("builtAt"), "feedHealth": doc.get("health")}


def load_data_health(doc: dict, to: str, *, session_date: str) -> dict | None:
    """GET /api/data-health -> rows that are dead or stale. The route has no data date of its own, so the caller states
    the session date it describes; it is returned only if that is <= `to`."""
    _need_to(to)
    if session_date > to:
        return None
    rows = [r for r in doc.get("rows") or [] if r.get("state") in ("dead", "stale")]
    return {"stamp": session_date, "counts": doc.get("counts"), "bad": [{"id": r.get("id"), "state": r.get("state"), "ageDays": r.get("ageDays")} for r in rows]}


def read_json_bytes(raw: bytes):
    return json.loads(raw.decode("utf-8"))
