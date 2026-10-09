"""Score the pre-fixed finalists F1-F10 (plans/RATE_DIFF_NQ_LEADLAG_PLAN.md) on the confirmation period, TRADES and MIDPOINT.

Rule (fixed before confirmation): same sign as exploration AND beyond the scrambled-day 95% band (correlogram items),
or Granger p < 0.05 (Granger items).
    python scripts/rate_diff_nq/finalists.py
"""
import json
from pathlib import Path

R = Path("analysis/output/rate_diff_nq")
load = lambda d: json.loads((R / d / "results.json").read_text())
runs = {k: load(k) for k in ("explore", "explore_mid", "confirm", "confirm_mid")}

# (id, claim, series, timeframe, kind, lag or direction, expected sign)
F = [("F1a", "Nasdaq leads diff (Granger) 15m", "US-EU Dec26", "15m", "granger", "price->rate", None),
     ("F1b", "Nasdaq leads diff (Granger) 30m", "US-EU Dec26", "30m", "granger", "price->rate", None),
     ("F1c", "Nasdaq leads generic diff (Granger) 15m", "US-EU generic 6-12m", "15m", "granger", "price->rate", None),
     ("F2", "Nasdaq precedes diff by 1 bar (k=-1)", "US-EU Dec26", "15m", "corr", -1, +1),
     ("F3a", "SR3Z6 precedes Nasdaq by 1 bar (k=+1)", "US leg SR3Z6", "15m", "corr", 1, +1),
     ("F3b", "SR3H7 precedes Nasdaq by 1 bar (k=+1)", "US leg SR3H7", "15m", "corr", 1, +1),
     ("F4a", "SR3Z6 up day d -> Nasdaq down d+1", "US leg SR3Z6", "daily", "corr", 1, -1),
     ("F4b", "SR3H7 up day d -> Nasdaq down d+1", "US leg SR3H7", "daily", "corr", 1, -1),
     ("F4c", "diff up day d -> Nasdaq down d+1", "US-EU Dec26", "daily", "corr", 1, -1),
     ("F5", "Nasdaq leads diff by 4h (k=-1)", "US-EU Dec26", "4h", "corr", -1, +1),
     ("F6a", "diff same-bar positive 15m", "US-EU Dec26", "15m", "corr", 0, +1),
     ("F6b", "diff same-bar positive 1h", "US-EU Dec26", "1h", "corr", 0, +1),
     ("F6c", "diff same-day positive", "US-EU Dec26", "daily", "corr", 0, +1),
     ("F8a", "COG pair leads Nasdaq (Granger) 15m", "COG pair SR3U6-ER3U6", "15m", "granger", "rate->price", None),
     ("F8b", "Nasdaq leads COG pair (Granger) 15m", "COG pair SR3U6-ER3U6", "15m", "granger", "price->rate", None),
     ("F9", "COG pair precedes Nasdaq by 1 bar (k=+1)", "COG pair SR3U6-ER3U6", "15m", "corr", 1, +1),
     ("F10", "COG pair up day d -> Nasdaq down d+1", "COG pair SR3U6-ER3U6", "daily", "corr", 1, -1)]


def val(run, s, tf, kind, key):
    r = runs[run]["series"].get(s, {}).get(tf)
    if r is None:
        return None
    if kind == "granger":
        g = r["granger"].get(key)
        return None if g is None else {"p": g["p"], "coef_sum": g["coef_sum"]}
    c = r["correlogram"].get(str(key))
    return None if c is None else {"corr": c["corr"], "null95": c["null95"]}


rows, md = [], ["# Finalists F1–F10 on the confirmation period (2026-04-01 → 10-08)", "",
                "Rule fixed before confirmation: same sign AND beyond the scrambled-day 95% band (correlations), or Granger p < 0.05.", "",
                "| # | claim | explore (trades / mid) | confirm trades | confirm mid | confirmed? |", "|---|---|---|---|---|---|"]
for fid, claim, s, tf, kind, key, sign in F:
    v = {run: val(run, s, tf, kind, key) for run in runs}
    if kind == "granger":
        show = lambda x: "n/a" if x is None else f"p {x['p']:.3f}"
        ok = lambda x: x is not None and x["p"] < 0.05
    else:
        show = lambda x: "n/a" if x is None else f"{x['corr']:+.3f}{'★' if abs(x['corr']) > x['null95'] else ''}"
        ok = lambda x: x is not None and (x["corr"] > 0) == (sign > 0) and abs(x["corr"]) > x["null95"]
    conf_t, conf_m = ok(v["confirm"]), ok(v["confirm_mid"])
    verdict = "YES (both)" if conf_t and conf_m else ("trades only" if conf_t else ("mid only" if conf_m else "no"))
    rows.append({"id": fid, "claim": claim, "values": v, "confirmed_trades": conf_t, "confirmed_mid": conf_m})
    md.append(f"| {fid} | {claim} | {show(v['explore'])} / {show(v['explore_mid'])} | {show(v['confirm'])} | {show(v['confirm_mid'])} | **{verdict}** |")
(R / "finalists.json").write_text(json.dumps(rows, indent=1))
(R / "FINALISTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
