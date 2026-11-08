"""summary.md: what is unusual today, with the freshness flags. OBSERVATION ONLY (no outcome, no performance)."""
from __future__ import annotations

import datetime as dt

HARD_FLAGS = ("STALE", "MISSING", "STALE_RUN", "FUTURE_TS", "PARTIAL_COMPONENTS", "REVISED", "INCOMPLETE_SESSION", "WEEKEND_STUB")


def hard(o) -> list:
    return [f for f in o["inputFlags"] if f.split(":")[0] in HARD_FLAGS]


def score(o) -> float:
    s = o.get("strength") or {}
    if o["trigger"] == "extreme":
        p = s.get("pct")
        if p:
            return max(abs(v - 50.0) for v in p.values()) / 5.0
        if "share5" in s:
            return 10 * s["share5"]
        if "count" in s:
            return float(s["count"])
        return 5.0
    if o["trigger"] == "speed":
        return abs(s.get("robustZ", 0.0))
    if o["trigger"] == "divergence":
        return abs(s.get("residualZ", 0.0))
    return 3.0


def fmt(x, nd=2):
    if x is None:
        return "-"
    if isinstance(x, float):
        return f"{x:.{nd}f}"
    return str(x)


def _line(o):
    s = o.get("strength") or {}
    bits = []
    if "pct" in s:
        bits.append("pct " + "/".join(f"{k}d:{v:.0f}" for k, v in s["pct"].items()))
    if "robustZ" in s:
        bits.append(f"z={s['robustZ']:.1f} over {s['horizon']}")
    if "residualZ" in s:
        bits.append(f"resid z={s['residualZ']:.1f} corr={s['corr']:.2f}")
    for k in ("share5", "share20", "count", "nFresh", "breakout", "of", "flipDistPct", "from", "to", "releases"):
        if k in s:
            bits.append(f"{k}={s[k]}")
    return "; ".join(bits)


def top10_table(top10) -> str:
    return ""


def render_summary(status, top10, observations, episodes, results_asof, series_recs, cfg, asof) -> str:
    L = []
    L.append(f"# ROE scan {asof}  (run `{status['runId']}`)")
    L.append("")
    L.append("> **OBSERVATION ONLY.** These are readings the frozen rules flagged as unusual today. They are not findings, not "
             "signals and not tested. No outcome, forward return or performance statistic is computed anywhere in this scan. "
             "Percentiles are the scanner's own causal ones (prior observations only); any server percentile is labelled "
             "'server, non-causal'.")
    L.append("")
    if status["state"] == "failed":
        L.append(f"## DISCOVERY NOT COMPLETED for {asof}")
        L.append("")
        for r in status["reasons"]:
            L.append(f"- {r}")
        L.append("")
        L.append("No observations from this run may be shown as today's board. (ROE section 10 item 7.)")
        return "\n".join(L) + "\n"
    L.append(f"**Status: {status['state']}** ({status['message']}). Items measured: {status['itemsMeasured']} of {status['itemsListed']} listed; "
             f"{status['observations']} observations (incl. {sum(1 for o in observations if o['backfilled'])} from the last "
             f"{cfg['episode']['lookbackSessions']} sessions, marked backfilled).")
    for r in status["reasons"]:
        L.append(f"- {r}")
    L.append("")
    cut = str(dt.date.fromisoformat(asof) - dt.timedelta(days=4))
    latest = {}
    for o in observations:
        if o["date"] >= cut:
            k = (o["item"], o["trigger"], o["side"])
            if k not in latest or o["date"] > latest[k]["date"]:
                latest[k] = o        # one row per underlying anomaly: its most recent observation
    ep_state = {e["episodeId"]: e["state"] for e in episodes}
    recent = [o for o in latest.values() if ep_state.get(o["episodeId"]) != "closed"]   # a closed episode is not 'today'
    by = {}
    for o in recent:
        by.setdefault(o["trigger"], []).append(o)
    L.append("## Counts by trigger (distinct item/trigger/side, latest observation dated in the last 4 days)")
    L.append("")
    L.append("| trigger | all | on fresh inputs | on flagged inputs |")
    L.append("|---|---|---|---|")
    for t in ("extreme", "speed", "flip", "divergence", "regime", "stale"):
        a = by.get(t, [])
        fr = [o for o in a if not hard(o)]
        L.append(f"| {t} | {len(a)} | {len(fr)} | {len(a) - len(fr)} |")
    L.append("")
    fresh = sorted([o for o in recent if o["trigger"] != "stale" and not hard(o)], key=lambda o: -score(o))
    L.append("## What is unusual today (fresh inputs, strongest first)")
    L.append("")
    if not fresh:
        L.append("Nothing fired on fresh inputs.")
    else:
        L.append("| item | trigger / side | reading | data date | other flags | episode |")
        L.append("|---|---|---|---|---|---|")
        ep = {e["episodeId"]: e for e in episodes}
        for o in fresh[:25]:
            e = ep.get(o["episodeId"])
            es = f"{e['state']} day {e['dayIndex']}" if e else "-"
            L.append(f"| {o['item']} | {o['trigger']} {o['side']}{' (' + o['variant'] + ')' if o.get('variant') else ''} | {_line(o)} | {o['date']} | {', '.join(o['inputFlags']) or '-'} | {es} |")
        if len(fresh) > 25:
            L.append(f"\n... {len(fresh) - 25} more in observations.jsonl")
    L.append("")
    flagged = sorted([o for o in recent if o["trigger"] != "stale" and hard(o)], key=lambda o: -score(o))
    L.append("## Fired on inputs that carry a freshness flag (treat with care)")
    L.append("")
    if not flagged:
        L.append("None.")
    else:
        L.append("| item | trigger / side | reading | data date | flags |")
        L.append("|---|---|---|---|---|")
        for o in flagged[:25]:
            L.append(f"| {o['item']} | {o['trigger']} {o['side']} | {_line(o)} | {o['date']} | {', '.join(hard(o))} |")
        if len(flagged) > 25:
            L.append(f"\n... {len(flagged) - 25} more in observations.jsonl")
    L.append("")
    st = [o for o in recent if o["trigger"] == "stale"]
    L.append(f"## Staleness ({len(st)} inputs/feeds flagged stale)")
    L.append("")
    for o in st[:30]:
        L.append(f"- `{o['item']}`: {(o.get('strength') or {}).get('detail') or (o.get('strength') or {})}")
    L.append("")
    live = [e for e in episodes if e["state"] != "closed" and e["trigger"] != "stale"]
    L.append(f"## Open and persisting episodes ({len(live)}; closed: {sum(1 for e in episodes if e['state'] == 'closed')})")
    L.append("")
    for e in live[:40]:
        L.append(f"- `{e['item']}` {e['trigger']} {e['side']}: {e['state']}, opened {e['openedAt']}, last seen {e['lastSeenAt']}, {e['nObservations']} observation(s)")
    L.append("")
    L.append("## Coverage of the owner's top-10 first watch items")
    L.append("")
    L.append("| # | item | status | evaluated / ran / fired | sources | flags |")
    L.append("|---|---|---|---|---|---|")
    for r in top10:
        L.append(f"| {r['n']} | {r['name']} | {r['status']} | {r['itemsEvaluated']} / {r['itemsRan']} / {r['fired']} | {'; '.join(r['sources']) or '-'} | {', '.join(r['flags'][:6]) or '-'} |")
    L.append("")
    bad = [s for s in series_recs if s["flags"]]
    L.append(f"## Input series with freshness flags ({len(bad)} of {len(series_recs)})")
    L.append("")
    for s in bad:
        L.append(f"- `{s['id']}` (last {s['last']}, {s['source']}): " + "; ".join(f"{f['code']} {f['detail']}" for f in s["flags"]))
    L.append("")
    L.append("## Not built in P1")
    L.append("")
    L.append("Question writer, hypothesis families (familyId is null), server routes and KV keys, R2 writes, the evaluator, QA, the board "
             "and the forward tracker (phases P2-P7). The remaining watch items of the 72 (P8) are not implemented.")
    return "\n".join(L) + "\n"
