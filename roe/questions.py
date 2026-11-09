"""ROE P3 question writer. A RULES step: no model call, no earlier results, nothing suppressed or labelled.
episodes + observations (this run) -> questions. One question per discovery episode. The spec (what would be tested) carries no date, so the same
question arising again later has the same specHash and the server counts it instead of duplicating it. Stale-input notices are not research questions
(they are data-health notices) and are listed in `notQuestions`."""
from __future__ import annotations

import json
from pathlib import Path

from .util import sha256_obj

TEMPLATES_PATH = Path(__file__).with_name("question_templates.json")


def load_templates() -> dict:
    return json.loads(TEMPLATES_PATH.read_text(encoding="utf-8"))


def _item_parts(item: str):
    base, _, sym = item.partition(":")
    return base, sym


def _fmt(x, n=3):
    try:
        return f"{float(x):.{n}g}"
    except (TypeError, ValueError):
        return str(x)


def _observation_text(o: dict, label: str, unit: str) -> str:
    s = o.get("strength") or {}
    side = o.get("side")
    if "pct" in s:
        parts = " and ".join(f"percentile {_fmt(v, 3)} of its last {w} {unit}" for w, v in s["pct"].items())
        return f"{label} is at {parts} (value {_fmt(o.get('value'))})."
    if "robustZ" in s:
        return f"{label} moved {_fmt(s.get('change'))} over {s.get('horizon')} {unit}, a robust z of {_fmt(s['robustZ'], 2)} against its own recent moves (value {_fmt(o.get('value'))})."
    if "from" in s and "to" in s:
        return f"{label} moved from {s['from']} to {s['to']} and held for {s.get('hold')} sessions (value {_fmt(o.get('value'))})."
    if "hot" in s:
        return f"{s.get('count')} of {s.get('nFresh')} vol indices are above their own 90th percentile: {', '.join(s['hot'])}."
    if "residualZ" in s:
        return f"{label} has a gap of {_fmt(s['residualZ'], 2)} standard deviations from its usual relationship (beta {_fmt(s.get('beta'))}, correlation {_fmt(s.get('corr'))}, n {s.get('n')})."
    if "breakout" in s:
        return f"{s['breakout']} of {s['of']} underlyings are in short-gamma BREAKOUT."
    if "flipDistPct" in s:
        return f"spot is {_fmt(s['flipDistPct'])}% from the dealer-gamma flip (near-flip limit {s.get('limit')}%)."
    if "center" in s and "hold" in s:
        return f"{label} crossed {s['center']} to {str(side).replace('_', ' ')} and has held for {s['hold']} sessions (value {_fmt(s.get('value'))})."
    if "releases" in s:
        return f"the leveraged-fund crowd is at percentile {_fmt(s.get('pct156'))} of {s.get('window')} weeks going into: {', '.join(s['releases'])}."
    return f"{label}: {side}."


def _trigger_phrase(trigger: str) -> str:
    return {"extreme": "reached an extreme of its own history", "speed": "moved unusually fast", "flip": "changed sign",
            "regime": "changed state", "divergence": "diverged from its usual partner"}.get(trigger, f"fired a {trigger} flag")


def write_questions(run_id: str, asof: str, episodes_doc: dict, observations: list, watch_version: str, templates: dict | None = None) -> dict:
    T = templates or load_templates()
    tsha = sha256_obj(T)[:12]
    by_obs = {o["obsId"]: o for o in observations}
    questions, skipped, seen = [], [], set()
    for ep in episodes_doc.get("episodes", []):
        item = ep.get("item", "")
        base, sym = _item_parts(item)
        trigger = ep.get("trigger")
        cls_name = T["itemClass"].get(base)
        if trigger == "stale" or cls_name is None:
            skipped.append({"episodeId": ep.get("episodeId"), "item": item, "reason": T["notQuestions"].get("stale") if trigger == "stale" else "no template for this item class yet"})
            continue
        c = T["classes"][cls_name]
        o = by_obs.get((ep.get("obsIds") or [None])[0]) or {}
        label = T["itemLabels"].get(base, base) + (f" ({sym})" if sym else "")
        unit = "weeks" if ep.get("cadence") == "weekly" else "sessions"
        hz = ", ".join(str(h) for h in c["horizons"])
        spec = {"template": cls_name, "item": item, "trigger": trigger, "side": ep.get("side"), "horizons": c["horizons"], "outcomeClass": c["outcomeClass"],
                "baseline": c["baseline"], "minN": c["minN"], "qtVersion": T["qtVersion"]}
        spec_hash = sha256_obj(spec)[:16]
        family_key = f"{c['mechanism']}|{c['variableClass']}|{c['outcomeClass']}|{c['horizonClass']}"
        family_id = sha256_obj(family_key)[:12]
        if (ep.get("episodeId"), spec_hash) in seen:
            continue
        seen.add((ep.get("episodeId"), spec_hash))
        side_txt = str(ep.get("side", "")).replace("_", " ")
        obs_txt = _observation_text(o, label, unit)
        questions.append({
            "questionId": sha256_obj([spec_hash, ep.get("episodeId")])[:16], "specHash": spec_hash, "episodeId": ep.get("episodeId"),
            "familyId": family_id, "familyKey": family_key, "mechanism": c["mechanism"],
            "runId": run_id, "date": ep.get("openedAt") or asof, "lastSeenAt": ep.get("lastSeenAt"), "episodeState": ep.get("state"),
            "item": item, "label": label, "trigger": trigger, "side": ep.get("side"), "cadence": ep.get("cadence"),
            "title": f"{label}: {_trigger_phrase(trigger)} ({side_txt})",
            "why": f"The scanner's frozen {trigger} rule fired on {label} on {ep.get('openedAt') or asof}. It is one observation, not a finding.",
            "observation": obs_txt,
            "hypothesis": f"When this condition holds, the outcome ({c['outcome'].format(horizons=hz)}) differs from the baseline by more than the smallest effect of interest.",
            "dataNeeded": c["dataNeeded"], "horizons": c["horizons"], "horizonUnit": c["unit"], "baseline": c["baseline"],
            "smallestEffect": c["smallestEffect"], "minN": c["minN"], "mirror": c["mirror"], "placebo": c["placebo"],
            "dataBoundary": T["dataBoundary"], "inputFlags": o.get("inputFlags", []),
            "watchVersion": watch_version, "qtVersion": T["qtVersion"], "templateSha": tsha, "status": "queued",
        })
    return {"schema": "roe.questions.v1", "runId": run_id, "asof": asof, "qtVersion": T["qtVersion"], "templateSha": tsha,
            "questions": questions, "notQuestions": skipped}
