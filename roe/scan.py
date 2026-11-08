"""The scan: build the input snapshot, evaluate every watch item causally, write roe_out/<runId>/.

OBSERVATION ONLY. The scanner may look at data up to today (ROE 8.3, 8.6) but computes no forward outcome and no
performance statistic, and no watch item reads the frozen layers 3/5/6 or the shadow screens (8.4).
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import numpy as np

from . import SCANNER_VERSION
from .config import config_hash, config_record, load_config, pinned_hash_ok, trigger_version
from .episodes import build_episodes, load_prior_observations, obs_id
from .inputs import InputSet, build_inputs, load_sources
from .lockbox import enforce as enforce_lockbox
from .snapshot import SnapshotConflict, check_existing, find_prior_run, identity, make_run_id, manifest_hash, write_run
from .summary import render_summary, top10_table
from .util import git_commit, sha256_obj
from .watch import Ctx, evaluate

TOP10_NAMES = {1: "VIX term structure (VIX9D/VIX, VIX/VIX3M)", 2: "VVIX/VXN ratio and rate of change",
               3: "Implied minus realised vol (VIX/VXN/GVZ)", 4: "Realised range vs the shipped p75 line (daily run)",
               5: "COT spec-share extremes (FX, indices, metals/energy)", 6: "COT crowd into a high-impact release",
               7: "Gamma-flip distance and PIN/BREAKOUT breadth (sign only)", 8: "2s10s / 3m10y flips and steepener/flattener class",
               9: "Cross-asset vol breadth (10 vol indices) and VIX state", 10: "Daily-run and feed health"}


def _weekdays_before(asof: str, n: int) -> list:
    out, d = [], asof
    while len(out) < n:
        d = str(np.datetime64(d) - np.timedelta64(1, "D"))
        if np.datetime64(d).astype(dt.date).weekday() < 5:
            out.append(d)
    return sorted(out)


def _series_record(s, flags, cfg, include_tail):
    rec = {"id": s.id, "source": s.source, "cadence": s.cadence, "kind": s.kind, "nObs": len(s.dates),
           "first": s.dates[0] if s.dates else None, "last": s.dates[-1] if s.dates else None,
           "lastPublic": (s.known[-1] if s.known else (s.dates[-1] if s.dates else None)),
           "sha256": sha256_obj([s.dates, s.values]), "flags": flags,
           "composite": s.meta.get("composite"), "seamAfter": s.meta.get("seamAfter"), "droppedAfterTo": s.meta.get("droppedAfterTo", 0)}
    if include_tail and s.dates:
        rec["tail"] = {d: v for d, v in zip(s.dates[-30:], s.values[-30:])}
    return rec


def top10_coverage(results_asof: list, inputs: InputSet, cfg: dict) -> list:
    rows = []
    for n in range(1, 11):
        items = [r for r in results_asof if r["group"] == n]
        ins = sorted({i for r in items for i in r["inputs"]})
        ran = [r for r in items if r["status"] in ("ok", "building", "partial")]
        flags = sorted({f for r in items for f in r["flags"]})
        stale = [f for f in flags if f.startswith(("STALE", "MISSING", "PARTIAL", "REVISED"))]
        if not items or not ran:
            status = "needs_laptop_data_or_missing"
        elif any(f.startswith(("STALE", "MISSING")) for f in flags):
            status = "ran_with_stale_or_missing_inputs"
        else:
            status = "ran_fresh"
        sources = sorted({s for i in ins for s in ([inputs.series[i].source] if i in inputs.series else [])})
        rows.append({"n": n, "name": TOP10_NAMES[n], "status": status, "itemsEvaluated": len(items), "itemsRan": len(ran),
                     "flags": flags, "sources": sources, "fired": sum(len(r["fired"]) for r in items)})
    return rows


def run_scan(*, asof: str, out_dir, cfg: dict | None = None, sources: dict | None = None, inputs: InputSet | None = None,
             state_raw: bytes | None = None, hit_rates_raw: bytes | None = None, desk_pack_raw: bytes | None = None,
             data_health_raw: bytes | None = None, now_utc: dt.datetime | None = None, commit: str | None = "auto",
             run_id: str | None = None, lookback: int | None = None, fetch_errors: dict | None = None,
             repo_root=None, required_docs=()) -> dict:
    cfg = cfg or load_config()
    now_utc = now_utc or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    out_dir = Path(out_dir)
    root = Path(repo_root) if repo_root else Path(__file__).resolve().parent.parent
    dirty = None
    if commit == "auto":
        commit, dirty = git_commit(root)
    reasons, errors = [], dict(fetch_errors or {})
    if inputs is None:
        sources = sources or load_sources(root=root)
        inputs = build_inputs(sources, asof, cfg, state_raw=state_raw, hit_rates_raw=hit_rates_raw, desk_pack_raw=desk_pack_raw,
                              data_health_raw=data_health_raw, session_date=asof)
    errors.update(inputs.errors)
    enforce_lockbox(cfg, inputs)          # raises LockboxViolation: frozen-layer / shadow-screen outputs are never inputs
    crec = config_record(cfg)
    mh = manifest_hash(inputs.blobs)
    ident = identity(asof, crec["sha256"], mh, commit)
    rid = run_id or make_run_id(asof, crec["sha256"], mh, commit)
    existing = check_existing(out_dir, rid, ident)
    if existing == "noop":
        return {"runId": rid, "dir": str(out_dir / rid), "noop": True, "status": json.loads((out_dir / rid / "status.json").read_text(encoding="utf-8"))["state"]}

    # ------------------------------------------------------------------ prior run (revision check, prior point values)
    prior_snap, prior_state = find_prior_run(out_dir, asof, exclude=rid)
    prior_tails = {s["id"]: s.get("tail") for s in (prior_snap or {}).get("series", []) if s.get("tail")}
    prior_points = {}
    for k, it in ((prior_state or {}).get("items") or {}).items():
        m = it.get("measures") or {}
        if m.get("sign") is not None:
            prior_points[k] = {"sign": m["sign"]}
    ctx = Ctx(cfg, inputs, now_utc, prior_tails, prior_points)

    # ------------------------------------------------------------------ evaluate: asof first (its flags win), then lookback
    nlook = cfg["episode"]["lookbackSessions"] if lookback is None else lookback
    dates = [asof] + sorted(_weekdays_before(asof, nlook), reverse=True)
    observations, seen, breadth = [], set(), {}
    results_asof = []
    for d in dates:
        res = evaluate(ctx, d, include_points=(d == asof))
        if d == asof:
            results_asof = res
        breadth[d] = {"items": sum(1 for r in res if r["status"] != "missing"), "itemsListed": len(res),
                      "triggerEvaluations": sum(r["triggersEvaluated"] for r in res)}
        for r in res:
            for f in r["fired"]:
                od = r["obsDate"] or d
                tv = trigger_version(cfg, f["trigger"])
                oid = obs_id(r["id"], f["trigger"], tv, f["side"], od)
                if oid in seen:
                    continue
                seen.add(oid)
                m = r["measures"] or {}
                observations.append({
                    "obsId": oid, "date": od, "runId": rid, "item": r["id"], "group": r["group"], "trigger": f["trigger"],
                    "triggerVersion": tv, "variant": f.get("variant"), "side": f["side"], "value": m.get("value", m.get("count", m.get("usableShare"))),
                    "percentiles": ({"values": m.get("pct"), "label": "roe, causal"} if m.get("pct") else None),
                    "serverPercentile": r["serverReference"], "strength": f.get("strength"),
                    "inputFlags": sorted(set(r["flags"])), "episodeId": None, "familyId": None,
                    "scanBreadth": breadth[d], "watchVersion": cfg["watchVersion"], "cadence": m.get("cadence", "daily"),
                    "evaluatedAt": d, "backfilled": d != asof})
    observations.sort(key=lambda o: (o["date"], o["item"], o["trigger"], o["side"]))

    # ------------------------------------------------------------------ freshness at asof, status
    series_recs, flag_counts = [], {}
    for sid in sorted(inputs.series):
        s = ctx.series(sid, asof)
        fl = ctx.flags(sid, asof)
        for f in fl:
            flag_counts[f["code"]] = flag_counts.get(f["code"], 0) + 1
        series_recs.append(_series_record(s, fl, cfg, s.kind in cfg["freshness"]["macroKinds"]))
    measured = sum(1 for r in results_asof if r["status"] in ("ok", "building", "partial"))
    req = cfg["required"]
    missing_req = [s for s in req["series"] if s not in inputs.series or not ctx.series(s, asof).dates]
    state, why = "ok", []
    if missing_req:
        state = "failed"
        why.append(f"required input series missing: {', '.join(missing_req)}")
    for doc in required_docs:
        if not any(b["name"] == doc for b in inputs.blobs):
            state = "failed"
            why.append(f"required input document not available: {doc}")
    if measured < req["minItemsMeasured"]:
        state = "failed"
        why.append(f"only {measured} watch items could be measured (need {req['minItemsMeasured']})")
    if state != "failed":
        for k, v in sorted(errors.items()):
            why.append(f"input not loaded: {k}: {v}")
        top_flags = sorted({f for r in results_asof if r["group"] for f in r["flags"] if f.split(":")[0] in ("STALE", "MISSING", "PARTIAL_COMPONENTS", "REVISED", "INCOMPLETE_SESSION", "STALE_RUN", "FUTURE_TS", "WEEKEND_STUB")})
        if top_flags:
            why.append(f"{len(top_flags)} freshness flag(s) on watch items: " + ", ".join(top_flags[:12]) + (" ..." if len(top_flags) > 12 else ""))
        ok_pin, pin = pinned_hash_ok(cfg)
        if not ok_pin:
            why.append(f"config hash does not match its pin for {pin['version']} (frozen config was edited without a version bump)")
        if why:
            state = "degraded"
    if state == "failed":
        for k, v in sorted(errors.items()):
            why.append(f"input not loaded: {k}: {v}")

    # ------------------------------------------------------------------ episodes (from earlier runs + this one)
    if state == "failed":
        episodes, mapping = [], {}
    else:
        prior = load_prior_observations(out_dir, asof, exclude_run=rid)
        episodes, mapping = build_episodes(prior + observations, asof, cfg)
        for o in observations:
            o["episodeId"] = mapping.get(o["obsId"])
    # ------------------------------------------------------------------ outputs
    top10 = top10_coverage(results_asof, inputs, cfg)
    status = {"schema": "roe.status.v1", "runId": rid, "asof": asof, "state": state, "reasons": why,
              "discoveryCompleted": state != "failed",
              "message": ("discovery not completed for " + asof + ": " + "; ".join(why)) if state == "failed" else
                         ("completed with flags" if state == "degraded" else "completed"),
              "itemsMeasured": measured, "itemsListed": len(results_asof), "observations": len(observations),
              "freshnessFlagCounts": flag_counts, "inputErrors": errors}
    items_state = {r["id"]: {"group": r["group"], "kind": r["kind"], "status": r["status"], "obsDate": r["obsDate"],
                             "measures": r["measures"], "serverReference": r["serverReference"], "flags": sorted(set(r["flags"])),
                             "inputs": r["inputs"], "fired": [{"trigger": f["trigger"], "side": f["side"], "variant": f.get("variant")} for f in r["fired"]],
                             "notes": r["notes"]} for r in results_asof}
    state_doc = {"schema": "roe.state.v1", "runId": rid, "asof": asof, "watchVersion": cfg["watchVersion"],
                 "percentileLabel": "roe, causal; server percentiles are under serverReference, labelled 'server, non-causal'",
                 "scanBreadth": breadth[asof], "top10": top10, "items": items_state}
    snap = {"schema": "roe.snapshot.v1", "runId": rid, "asof": asof, "createdAt": now_utc.isoformat(timespec="seconds") + "Z",
            "identity": ident, "scannerVersion": SCANNER_VERSION, "codeCommit": commit, "codeDirty": dirty,
            "config": crec, "inputs": inputs.blobs, "manifestSha256": mh, "series": series_recs,
            "stateDocument": inputs.state_meta, "pointInputs": sorted(inputs.points), "inputErrors": errors,
            "freshness": {"counts": flag_counts, "maxAgeDays": cfg["freshness"]["maxAgeDays"]},
            "lockbox": {"scannerMayObserveUpTo": asof, "forwardOutcomesComputed": False, "frozenLayerInputsUsed": False,
                        "note": cfg["lockbox"]["note"]},
            "evaluationDates": dates}
    episodes_doc = {"schema": "roe.episodes.v1", "runId": rid, "asof": asof, "gapSessions": cfg["episode"]["gapSessions"],
                    "familyAssignment": "none in P1 (familyId is null)", "episodes": episodes}
    obs_lines = "\n".join(json.dumps(_clean_obs(o), sort_keys=True) for o in observations) + ("\n" if observations else "")
    summary = render_summary(status, top10, observations, episodes, results_asof, series_recs, cfg, asof)
    raw = {}
    for name, b in (("api_state.json", state_raw), ("api_hit_rates.json", hit_rates_raw), ("api_data_health.json", data_health_raw)):
        if b is not None:
            raw[name] = b
    d = write_run(out_dir, rid, {"snapshot.json": snap, "status.json": status, "state.json": state_doc, "episodes.json": episodes_doc,
                                 "observations.jsonl": obs_lines, "summary.md": summary}, raw)
    return {"runId": rid, "dir": str(d), "noop": False, "status": state, "reasons": why, "observations": len(observations),
            "episodes": len(episodes), "top10": top10, "asof": asof}


def _clean_obs(o):
    from .util import clean
    return clean(o)
