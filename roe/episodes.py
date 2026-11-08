"""DISCOVERY EPISODES (ROE section 6.1). Observations are never deleted; episodes are labels added on top.

  observation id = sha256(item, trigger, triggerVersion, side, date)[:16]   (a repeated run is a no-op)
  episode        = consecutive firings of the same (item, trigger, side) where fewer than g sessions pass without a firing
                   (g = 3 sessions, frozen in the config; a weekly item counts g WEEKS = 3 reports, i.e. 15 sessions,
                   because one week between two weekly reports is not a gap in its own observation opportunities)
  states         = opened (first firing, seen on the as-of session), persisting (fired again, or silent for < g sessions),
                   closed (silent for >= g sessions)
  familyId       = null in P1 (hypothesis families are assigned by the question writer, P3)
"""
from __future__ import annotations

import json
from pathlib import Path

from .util import add_sessions, sessions_between, sha256_obj


def obs_id(item: str, trigger: str, trigger_version: str, side: str, date: str) -> str:
    return sha256_obj([item, trigger, trigger_version, side, date])[:16]


def gap_for(cadence: str, cfg: dict) -> int:
    g = cfg["episode"]["gapSessions"]
    return g * 5 if cadence == "weekly" else g


def build_episodes(observations: list, asof: str, cfg: dict):
    """observations: dicts with item, trigger, side, date, cadence, obsId (any order, duplicates by obsId ignored).
    Returns (episodes, {obsId: episodeId}). Only observations dated <= asof are used (causal)."""
    seen, groups = set(), {}
    for o in observations:
        if o["date"] > asof or o["obsId"] in seen:
            continue
        seen.add(o["obsId"])
        groups.setdefault((o["item"], o["trigger"], o["side"]), []).append(o)
    episodes, mapping = [], {}
    for (item, trigger, side), obs in sorted(groups.items()):
        obs.sort(key=lambda o: (o["date"], o["obsId"]))
        cadence = obs[-1].get("cadence", "daily")
        g = gap_for(cadence, cfg)
        cur = None
        for o in obs:
            if cur is not None:
                silent = max(0, sessions_between(cur["lastSeenAt"], o["date"]) - 1)
                if silent < g:
                    cur["obsIds"].append(o["obsId"])
                    cur["lastSeenAt"] = max(cur["lastSeenAt"], o["date"])
                    continue
            cur = {"episodeId": sha256_obj([item, trigger, side, o["date"]])[:16], "item": item, "trigger": trigger, "side": side,
                   "cadence": cadence, "openedAt": o["date"], "lastSeenAt": o["date"], "obsIds": [o["obsId"]], "familyId": None}
            episodes.append(cur)
        # (cur segmentation is by construction; map below)
    for e in episodes:
        silent_now = sessions_between(e["lastSeenAt"], asof) if asof > e["lastSeenAt"] else 0
        g = gap_for(e["cadence"], cfg)
        if silent_now >= g:
            e["state"] = "closed"
            e["closedAt"] = add_sessions(e["lastSeenAt"], g)
        else:
            e["closedAt"] = None
            e["state"] = "opened" if (len(e["obsIds"]) == 1 and silent_now == 0) else "persisting"
        e["nObservations"] = len(e["obsIds"])
        e["sessionsSinceLastSeen"] = silent_now
        e["dayIndex"] = max(1, sessions_between(e["openedAt"], e["lastSeenAt"]) + 1)
        for oid in e["obsIds"]:
            mapping[oid] = e["episodeId"]
    episodes.sort(key=lambda e: (e["state"] == "closed", e["item"], e["trigger"], e["side"], e["openedAt"]))
    return episodes, mapping


def load_prior_observations(out_dir, asof: str, exclude_run: str | None = None) -> list:
    """Observations written by earlier runs (roe_out/*/observations.jsonl), dated <= asof. Observations are append-only
    across runs; duplicates by obsId are dropped downstream."""
    out = []
    base = Path(out_dir)
    if not base.exists():
        return out
    for d in sorted(base.iterdir()):
        f = d / "observations.jsonl"
        if d.name == exclude_run or not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                o = json.loads(line)
                if o.get("date", "") <= asof:
                    out.append(o)
    return out
