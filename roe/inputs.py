"""Input adapter layer: turns the configured sources (local files + GET /api/state) into one dict of Series, every loader
called with the explicit `to`. A source that cannot be loaded does NOT stop the scan: the error is recorded and the
series is simply absent (freshness MISSING)."""
from __future__ import annotations

import json
from pathlib import Path

from . import loaders as L
from .series import Series, overlay
from .util import sha256_bytes

DEFAULT_SOURCES = Path(__file__).with_name("sources.default.json")

CBOE_NAMES = ["VIX", "VIX9D", "VIX3M", "VVIX", "VXN", "RVX", "OVX", "GVZ", "VXEEM", "VXTLT", "VXFXI", "VXEWZ", "SKEW"]


def load_sources(path=None, root=None) -> dict:
    src = json.loads(Path(path or DEFAULT_SOURCES).read_text(encoding="utf-8"))
    src["_root"] = str(Path(root) if root else Path(__file__).resolve().parent.parent)
    return src


def _p(src, rel):
    p = Path(rel)
    return p if p.is_absolute() else Path(src["_root"]) / p


def _apply_meta(s: Series, cfg: dict) -> Series:
    m = cfg.get("seriesMeta", {}).get(s.id)
    if m and "changeKind" in m:
        s.change_kind = m["changeKind"]
    return s


class InputSet:
    def __init__(self):
        self.series: dict = {}
        self.blobs: list = []         # {name, source, sha256, bytes, first, last, rows}
        self.errors: dict = {}        # source name -> message
        self.calendar: list = []
        self.calendar_loaded = False
        self.points: dict = {}
        self.server_ref: dict = {}
        self.state_meta: dict = {}


def _blob_file(inputs: InputSet, name: str, path: Path, series_list=None):
    try:
        b = path.read_bytes()
    except OSError:
        return
    rec = {"name": name, "source": str(path), "sha256": sha256_bytes(b), "bytes": len(b)}
    inputs.blobs.append(rec)


def build_inputs(sources: dict, to: str, cfg: dict, *, state_raw: bytes | None = None, hit_rates_raw: bytes | None = None,
                 desk_pack_raw: bytes | None = None, data_health_raw: bytes | None = None, session_date: str | None = None,
                 calendar_ahead_days: int = 7) -> InputSet:
    inp = InputSet()
    # ---- server documents (raw bytes hashed first: the hash is the input identity)
    bundle = None
    if state_raw is not None:
        inp.blobs.append({"name": "api_state", "source": "GET /api/state", "sha256": sha256_bytes(state_raw), "bytes": len(state_raw)})
        try:
            bundle = L.load_state(L.read_json_bytes(state_raw), to)
            inp.points.update(bundle.points)
            inp.server_ref.update(bundle.server_ref)
            inp.state_meta = {"generatedAt": bundle.generated_at, "asOf": bundle.as_of, "errors": bundle.errors, "dropped": bundle.dropped_points}
        except Exception as e:  # noqa: BLE001
            inp.errors["api_state"] = f"{type(e).__name__}: {e}"
    hit = {}
    if hit_rates_raw is not None:
        inp.blobs.append({"name": "api_hit_rates", "source": "GET /api/vol-forecast/hit-rates", "sha256": sha256_bytes(hit_rates_raw), "bytes": len(hit_rates_raw)})
        try:
            hit = L.load_hit_rates(L.read_json_bytes(hit_rates_raw), to)
        except Exception as e:  # noqa: BLE001
            inp.errors["api_hit_rates"] = f"{type(e).__name__}: {e}"
    if desk_pack_raw is not None:
        inp.blobs.append({"name": "api_desk_pack", "source": "GET /api/desk-pack", "sha256": sha256_bytes(desk_pack_raw), "bytes": len(desk_pack_raw)})
        try:
            q = L.load_desk_quality(L.read_json_bytes(desk_pack_raw), to)
            if q:
                inp.points["desk_quality"] = q
        except Exception as e:  # noqa: BLE001
            inp.errors["api_desk_pack"] = f"{type(e).__name__}: {e}"
    if data_health_raw is not None:
        inp.blobs.append({"name": "api_data_health", "source": "GET /api/data-health", "sha256": sha256_bytes(data_health_raw), "bytes": len(data_health_raw)})
        try:
            h = L.load_data_health(L.read_json_bytes(data_health_raw), to, session_date=session_date or to)
            if h:
                inp.points["data_health"] = h
        except Exception as e:  # noqa: BLE001
            inp.errors["api_data_health"] = f"{type(e).__name__}: {e}"
    st = bundle.series if bundle else {}

    # ---- Cboe csv + state overlay
    cboe_dir = sources.get("cboeDir")
    for name in CBOE_NAMES:
        base = None
        if cboe_dir:
            path = _p(sources, cboe_dir) / f"{name}.csv"
            try:
                base = L.load_cboe_csv(path, name, to)
                _blob_file(inp, f"cboe:{name}", path)
            except L.LoaderError as e:
                inp.errors[f"cboe:{name}"] = str(e)
        s = overlay(base, st.get(name), name, cadence="daily", kind="market", source="+".join(filter(None, [base.source if base else "", st[name].source if name in st else ""])))
        if s:
            inp.series[name] = _apply_meta(s, cfg)
    for name in ("MOVE", "CREDIT_RATIO", "IG_RATIO"):
        if name in st:
            inp.series[name] = _apply_meta(st[name], cfg)
    # VIX_TERM = VIX/VIX3M: csv ratio overlaid by the state's own ratio after the csv ends
    base = None
    if "VIX" in inp.series and "VIX3M" in inp.series:
        v, v3 = inp.series["VIX"], inp.series["VIX3M"]
        m3 = dict(zip(v3.dates, v3.values))
        rows = [(d, a / m3[d]) for d, a in zip(v.dates, v.values) if d in m3 and m3[d]]
        base = Series("VIX_TERM", [d for d, _ in rows], [x for _, x in rows], source="derived:VIX/VIX3M csv")
    s = overlay(base, st.get("VIX_TERM"), "VIX_TERM", cadence="daily", kind="market", source="csv ratio + state.VIX_TERM")
    if s:
        inp.series["VIX_TERM"] = _apply_meta(s, cfg)

    # ---- FRED csv + state
    fred_dir = sources.get("fredDir")
    fred = {}
    for name in ("DGS2", "DGS10", "T10Y2Y", "T10Y3M"):
        if fred_dir:
            path = _p(sources, fred_dir) / f"{name}.csv"
            try:
                fred[name] = L.load_fred_csv(path, name, to)
                _blob_file(inp, f"fred:{name}", path)
            except L.LoaderError as e:
                inp.errors[f"fred:{name}"] = str(e)
    for name in ("DGS2", "DGS10"):
        s = overlay(fred.get(name), st.get(name), name, cadence="daily", kind="macro", source=f"fred_csv+state.{name}")
        if s:
            inp.series[name] = s
    spr = None
    if "DGS2" in st and "DGS10" in st:
        m2 = dict(zip(st["DGS2"].dates, st["DGS2"].values))
        rows = [(d, v - m2[d]) for d, v in zip(st["DGS10"].dates, st["DGS10"].values) if d in m2]
        spr = Series("T10Y2Y", [d for d, _ in rows], [x for _, x in rows], source="state: us10y-us2y")
    s = overlay(fred.get("T10Y2Y"), spr, "T10Y2Y", cadence="daily", kind="macro", source="fred_csv T10Y2Y + state spread")
    if s:
        inp.series["T10Y2Y"] = s
    if "T10Y3M" in fred:
        inp.series["T10Y3M"] = fred["T10Y3M"]

    # ---- prices (NY-close D1 parquet + state sparks)
    for name, rel in (sources.get("priceParquets") or {}).items():
        base = None
        path = _p(sources, rel)
        try:
            base = L.load_parquet_close(path, name, to)
            _blob_file(inp, f"price:{name}", path)
        except L.LoaderError as e:
            inp.errors[f"price:{name}"] = str(e)
        s = overlay(base, st.get(name), name, cadence="daily", kind="market", source="+".join(filter(None, [base.source if base else "", st[name].source if name in st else ""])))
        if s:
            inp.series[name] = _apply_meta(s, cfg)

    # ---- COT
    if sources.get("cotCsv"):
        path = _p(sources, sources["cotCsv"])
        try:
            inp.series.update(L.load_cot_weekly_csv(path, to))
            _blob_file(inp, "cot_weekly_csv", path)
        except L.LoaderError as e:
            inp.errors["cot_weekly_csv"] = str(e)

    # ---- realised range vs shipped line: optional laptop export first, the live hit-rates document overlays it
    rng = {}
    if sources.get("rangeCsv"):
        path = _p(sources, sources["rangeCsv"])
        try:
            rng = L.load_range_csv(path, to)
            _blob_file(inp, "range_csv", path)
        except L.LoaderError as e:
            inp.errors["range_csv"] = str(e)
    for sid in sorted(set(rng) | set(hit)):
        s = overlay(rng.get(sid), hit.get(sid), sid, cadence="daily", kind="session", source="range_csv+hit-rates")
        if s:
            inp.series[sid] = s

    # ---- calendar (schedule only)
    if sources.get("calendarCsvs"):
        try:
            paths = [_p(sources, x) for x in sources["calendarCsvs"]]
            inp.calendar = L.load_calendar_csv(paths, to, ahead_days=calendar_ahead_days)
            inp.calendar_loaded = True
            for p in paths:
                _blob_file(inp, f"calendar:{p.name}", p)
        except L.LoaderError as e:
            inp.errors["calendar"] = str(e)
    return inp
