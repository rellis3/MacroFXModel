"""POST-HOC diagnostics for positioning-into-release (written after the registered result was seen;
descriptive only, never part of the verdict): concentration of the D effect by year / pair / kind /
crowd side / which leg released, leave-one-out, and whether crowding adds anything over the price
trend into the day (trailing 40-day move, strictly before the day)."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import run as R  # noqa: E402

p, cal = R.build_panel()
p = p.dropna(subset=["pct", "vdec"]).sort_values(["pair", "date"])
p["tr40"] = p.groupby("pair").close.transform(lambda s: np.log(s.shift(1) / s.shift(41)))
p["tsign"] = np.sign(p.tr40).fillna(0)
ev = p.kind.notna() & ~p.rate_day
t = p[ev & (p.crowd != 0)].copy()
cm = p[ev & (p.crowd == 0)].groupby(["pair", "kind", "vdec"]).mv.mean().rename("cm")
t = t.join(cm, on=["pair", "kind", "vdec"]).dropna(subset=["cm"])
t["D"] = -t.crowd * (t.mv - t.cm)
legs = {k: (v[1], v[2]) for k, v in R.PAIRS.items()}
byday = cal[(cal.impact == "high") & ~cal.decision].groupby("date").Currency.apply(set)


def who(r):
    s = byday.get(r.date, set()); b, q = legs[r.pair]; o = b if q == "USD" else q
    return "both" if "USD" in s and o in s else "USD only" if "USD" in s else "other only"


t["who"] = t.apply(who, axis=1)
agg = lambda g: {str(k): [round(float(v.mean()), 4), int(len(v))] for k, v in g}
e = p[ev].copy(); e["y"] = e.mv - e.groupby(["pair", "kind", "vdec"]).mv.transform("mean")
q = p[p.kind.isna() & ~p.rate_day].copy(); q["y"] = q.mv - q.groupby(["pair", "vdec"]).mv.transform("mean")
ols = lambda d: [round(float(x), 4) for x in np.linalg.lstsq(np.c_[np.ones(len(d)), d.crowd, d.tsign], -d.y.values, rcond=None)[0]]
strong = e.groupby("pair").tr40.transform(lambda s: s.abs().rank(pct=True)) >= 0.65
out = {
    "note": "POST-HOC, descriptive only",
    "by_year": agg(t.groupby(t.date.dt.year).D), "by_pair": agg(t.groupby("pair").D), "by_kind": agg(t.groupby("kind").D),
    "by_crowd_side": agg(t.groupby("crowd").D), "by_leg_released": agg(t.groupby("who").D),
    "leave_one_year_out": {str(y): round(float(t[t.date.dt.year != y].D.mean()), 4) for y in sorted(t.date.dt.year.unique())},
    "leave_one_pair_out": {pr: round(float(t[t.pair != pr].D.mean()), 4) for pr in sorted(t.pair.unique())},
    "ols_event_days_intercept_crowd_trend": ols(e), "ols_quiet_days_intercept_crowd_trend": ols(q),
    "strong_trend_reversal_event_days": round(float((-e[strong].tsign * e[strong].y).mean()), 4),
    "independent_weeks_crowded_event": int(t.week.nunique()),
}
json.dump(out, open(os.path.join(R.OUT, "diagnostics.json"), "w"), indent=1)
print(json.dumps(out, indent=1))
