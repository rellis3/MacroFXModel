"""positioning-into-release — the registered test (MD files/POSITIONING_INTO_RELEASE_PREREG.md).

Runs the frozen design with the PRE-RESULTS data amendments recorded in that file (2026-10-22):
OANDA M15 closes for the London-day range, six pairs (no NZD price), ForexFactory high-impact
calendar 2018-01-02 -> 2025-04-07, an explicit rate-decision exclusion list, seed 20261014.

R = London-day true range / trailing 20-day ATR (both from 15-min closes).
D = close-to-close move against the crowded side, in ATR units, net of the matched control's drift.
Effect = mean over crowded event-days of (value - mean of the same pair x kind x vol-decile control cell).
"""
import json, os, subprocess, sys
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, ROOT)
from forge.ff_calendar import load_repaired  # noqa: E402

OUT = os.path.join(ROOT, "analysis/output/positioning-into-release")
M15 = os.path.join(ROOT, "analysis/output/rates_residual/m15")
COT = os.path.join(ROOT, "analysis/output/cot-extreme-duration/cot_weekly.csv")
SEED, REPS = 20261014, 2000
START, END = pd.Timestamp("2018-01-02"), pd.Timestamp("2025-04-07")
LDN = ZoneInfo("Europe/London")
# pair -> (file, base ccy, quote ccy, COT sym); COT net is already in pair terms (JPY/CAD/CHF flipped)
PAIRS = {"EURUSD": ("EUR_USD", "EUR", "USD", "EUR"), "GBPUSD": ("GBP_USD", "GBP", "USD", "GBP"),
         "AUDUSD": ("AUD_USD", "AUD", "USD", "AUD"), "USDJPY": ("USD_JPY", "USD", "JPY", "JPY"),
         "USDCAD": ("USD_CAD", "USD", "CAD", "CAD"), "USDCHF": ("USD_CHF", "USD", "CHF", "CHF")}
SHUTDOWN_REPORTS = ("2018-12-18", "2019-02-26")   # published weeks late; dropped so no report is used early
DECISIONS = {  # second PRE-RESULTS amendment
    "USD": {"Federal Funds Rate", "FOMC Statement", "FOMC Press Conference"},
    "EUR": {"Main Refinancing Rate", "ECB Press Conference"},
    "GBP": {"Official Bank Rate", "MPC Official Bank Rate Votes", "Monetary Policy Summary", "MPC Rate Statement"},
    "JPY": {"BOJ Policy Rate", "Overnight Call Rate", "Monetary Policy Statement", "BOJ Press Conference"},
    "AUD": {"Cash Rate", "RBA Rate Statement"},
    "CAD": {"Overnight Rate", "BOC Rate Statement", "BOC Press Conference"},
    "CHF": {"SNB Policy Rate", "Libor Rate", "SNB Monetary Policy Assessment", "SNB Press Conference"},
}
MIN_BARS = 40   # a London weekday with fewer 15-min closes is a holiday stub


# ── prices ───────────────────────────────────────────────────────────────────
def london_days(file):
    s = pd.read_parquet(os.path.join(M15, file + ".parquet"))["close"].astype(float).sort_index()
    loc = s.index.tz_localize("UTC").tz_convert(LDN)
    df = pd.DataFrame({"c": s.values, "d": loc.date}, index=s.index)
    g = df.groupby("d").c
    day = pd.DataFrame({"hi": g.max(), "lo": g.min(), "close": g.last(), "n": g.size()})
    day.index = pd.to_datetime(day.index).astype("datetime64[ns]"); day.index.name = "date"
    day = day[(day.index.dayofweek < 5) & (day.n >= MIN_BARS)]
    day["prev"] = day.close.shift(1)
    day["tr"] = np.maximum(day.hi, day.prev) - np.minimum(day.lo, day.prev)
    day["atr"] = day.tr.shift(1).rolling(20, min_periods=20).mean()
    day["rv"] = np.log(day.close / day.prev).shift(1).rolling(20, min_periods=20).std()
    day["R"] = day.tr / day.atr
    day["mv"] = (day.close - day.prev) / day.atr
    return day


# ── positioning ──────────────────────────────────────────────────────────────
def cot_states(sym):
    c = pd.read_csv(COT, parse_dates=["report_date"])
    c = c[(c.sym == sym) & (c.oi > 0)].sort_values("report_date").reset_index(drop=True)
    sh = (c.spec_net / c.oi).values
    pct = np.full(len(c), np.nan)
    for i in range(len(c)):
        prior = sh[max(0, i - 155):i]
        if len(prior) >= 52:
            pct[i] = round(100 * (prior < sh[i]).sum() / len(prior))
    c["share"], c["pct"] = sh, pct
    c = c[~((c.report_date >= SHUTDOWN_REPORTS[0]) & (c.report_date <= SHUTDOWN_REPORTS[1]))]
    c["usable"] = (c.report_date + pd.Timedelta(days=6)).astype("datetime64[ns]")
    # extremeOf(leg, 80, 20) exactly
    c["crowd"] = np.where((c.share > 0) & (c.pct >= 80), 1, np.where((c.share < 0) & (c.pct <= 20), -1, 0))
    c["trim"] = np.where((c.share > 0) & (c.pct <= 20), 1, np.where((c.share < 0) & (c.pct >= 80), -1, 0))
    return c[["usable", "report_date", "share", "pct", "crowd", "trim"]].dropna(subset=["pct"])


# ── calendar ─────────────────────────────────────────────────────────────────
def calendar():
    cal = load_repaired()
    cal = cal[cal.Currency.isin(["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"])].copy()
    cal["date"] = pd.to_datetime(cal["date"]).astype("datetime64[ns]")
    cal = cal[(cal.date >= START - pd.Timedelta(days=40)) & (cal.date <= END)]
    names = sorted(cal.Event.unique().tolist())
    kinds = json.loads(subprocess.run(["node", os.path.join(os.path.dirname(__file__), "kinds.mjs")],
                                      input=json.dumps(names), capture_output=True, text=True, check=True).stdout)
    cal["kind"] = cal.Event.map(kinds)
    cal["decision"] = (cal.kind == "rate").values | np.array([e in DECISIONS.get(c, ()) for c, e in zip(cal.Currency, cal.Event)])
    return cal


def build_panel():
    cal = calendar()
    dec = cal[cal.decision].groupby("Currency").date.apply(set).to_dict()
    hi = cal[(cal.impact == "high") & ~cal.decision].sort_values(["t_utc", "Event"])
    rows = []
    for pair, (file, b, q, sym) in PAIRS.items():
        day = london_days(file)
        day = day[(day.index >= START) & (day.index <= END)].dropna(subset=["R", "mv", "rv"])
        st = cot_states(sym)
        day = pd.merge_asof(day.reset_index().sort_values("date"),
                            st.sort_values("usable"), left_on="date", right_on="usable", direction="backward")
        legs = (b, q)
        ev = hi[hi.Currency.isin(legs)]
        first = ev.groupby("date").first()          # earliest high-impact release that day for either leg
        day["kind"] = day.date.map(first.kind)
        day["event"] = day.date.map(first.Event)
        day["rate_day"] = [any(d in dec.get(c, set()) for c in legs) for d in day.date]
        day["vdec"] = pd.qcut(day.rv, 10, labels=False)
        day["pair"] = pair
        rows.append(day)
    p = pd.concat(rows, ignore_index=True)
    p["week"] = p.date.dt.strftime("%G-%V")
    return p, cal


# ── the effect, and its week bootstrap ──────────────────────────────────────
def effect(test, ctrl, keys, col, sign=None, rng=None, reps=REPS):
    """mean(test value - control cell mean); sign (array) applied to the difference for D."""
    test = test.copy(); ctrl = ctrl.copy()
    allk = pd.concat([test[keys], ctrl[keys]]).drop_duplicates().reset_index(drop=True)
    allk["cell"] = np.arange(len(allk))
    test = test.merge(allk, on=keys); ctrl = ctrl.merge(allk, on=keys)
    weeks = pd.Index(sorted(set(test.week) | set(ctrl.week)))
    tw, cw = weeks.get_indexer(test.week), weeks.get_indexer(ctrl.week)
    tv, cv = test[col].values, ctrl[col].values
    ts = np.ones(len(test)) if sign is None else np.asarray(test[sign].values, float)
    nc = len(allk)

    def est(wt):
        cs = np.bincount(ctrl.cell, weights=cv * wt[cw], minlength=nc)
        cn = np.bincount(ctrl.cell, weights=wt[cw], minlength=nc)
        has = cn[test.cell.values] > 0
        cm = np.where(cn > 0, cs / np.maximum(cn, 1e-12), np.nan)[test.cell.values]
        d = ts * (tv - cm)
        w = wt[tw] * has
        return np.nansum(d * w) / w.sum() if w.sum() > 0 else np.nan, int(has.sum())

    point, matched = est(np.ones(len(weeks)))
    out = {"effect": round(float(point), 4), "n_test": int(len(test)), "n_matched": matched,
           "unmatched": int(len(test) - matched), "n_control": int(len(ctrl))}
    if rng is not None:
        bs = np.array([est(np.bincount(rng.integers(0, len(weeks), len(weeks)), minlength=len(weeks)).astype(float))[0]
                       for _ in range(reps)])
        out["ci"] = [round(float(np.nanpercentile(bs, 2.5)), 4), round(float(np.nanpercentile(bs, 97.5)), 4)]
    return out


def judge(res, kind):
    e, ci = res["all"]["effect"], res["all"]["ci"]
    h1, h2 = res["half1"]["effect"], res["half2"]["effect"]
    pos = sum(1 for v in res["per_pair"].values() if v["effect"] is not None and np.sign(v["effect"]) == np.sign(e) and v["effect"] != 0)
    ci_ex = ci[0] > 0 or ci[1] < 0
    halves = np.sign(h1) == np.sign(h2) == np.sign(e)
    if kind == "R":
        checks = {"effect >= +0.15 ATR": e >= 0.15, "CI excludes 0": ci_ex, "same sign both halves": bool(halves),
                  ">= 4 of 6 pairs positive": sum(1 for v in res["per_pair"].values() if (v["effect"] or 0) > 0) >= 4}
    else:
        checks = {"CI excludes 0": ci_ex, "same sign both halves": bool(halves), ">= 5 of 6 pairs on the pooled sign": pos >= 5}
    return {"checks": {k: bool(v) for k, v in checks.items()}, "passes": bool(all(checks.values()))}


def run_arm(p, test_mask, ctrl_mask, keys, rng, dir_col):
    test, ctrl = p[test_mask].copy(), p[ctrl_mask].copy()
    test["neg"] = -test[dir_col]           # D: + = moved against the crowded (or trimmed) side
    med = test.date.median()
    res = {}
    for col, sign in (("R", None), ("mv", "neg")):
        r = {"all": effect(test, ctrl, keys, col, sign, rng),
             "half1": effect(test[test.date <= med], ctrl[ctrl.date <= med], keys, col, sign),
             "half2": effect(test[test.date > med], ctrl[ctrl.date > med], keys, col, sign),
             "per_pair": {pr: effect(test[test.pair == pr], ctrl[ctrl.pair == pr], keys, col, sign) if (test.pair == pr).any() else {"effect": None}
                          for pr in PAIRS}}
        r["verdict"] = judge(r, "R" if col == "R" else "D")
        res["R" if col == "R" else "D"] = r
    res["n_by_pair"] = test.groupby("pair").size().to_dict()
    res["median_split"] = str(med.date())
    return res


def main():
    rng = np.random.default_rng(SEED)
    p, cal = build_panel()
    p = p.dropna(subset=["pct", "vdec"])
    nonrate = ~p.rate_day
    event = p.kind.notna() & nonrate
    quiet = p.kind.isna() & nonrate
    crowded, trimmed = p.crowd != 0, p.trim != 0

    res = {"id": "positioning-into-release", "seed": SEED, "window": [str(p.date.min().date()), str(p.date.max().date())],
           "pairs": list(PAIRS), "n_days": int(len(p)), "n_event_days": int(event.sum()), "n_quiet_days": int(quiet.sum()),
           "n_rate_days_excluded": int((~nonrate).sum()),
           "sanity_event_vs_quiet_R": [round(float(p[event].R.mean()), 3), round(float(p[quiet].R.mean()), 3)],
           "crowded_share_of_event_days": round(float(crowded[event].mean()), 3)}
    res["kinds"] = p[event].kind.value_counts().to_dict()

    res["main"] = run_arm(p, event & crowded, event & ~crowded, ["pair", "kind", "vdec"], rng, "crowd")
    n_by = res["main"]["n_by_pair"]
    res["min_events"] = {"crowded_event_days": int((event & crowded).sum()), "pairs_with_25+": int(sum(v >= 25 for v in n_by.values())),
                         "passes": bool((event & crowded).sum() >= 150 and sum(v >= 25 for v in n_by.values()) >= 4)}
    res["placebo"] = run_arm(p, quiet & crowded, quiet & ~crowded, ["pair", "vdec"], rng, "crowd")
    res["mirror"] = run_arm(p, event & trimmed, event & ~crowded & ~trimmed, ["pair", "kind", "vdec"], rng, "trim")

    void = {"placebo_R": res["placebo"]["R"]["verdict"]["passes"], "placebo_D": res["placebo"]["D"]["verdict"]["passes"],
            "mirror_R": res["mirror"]["R"]["verdict"]["passes"], "mirror_D": res["mirror"]["D"]["verdict"]["passes"]}
    res["void_checks"] = void

    def word(q):
        if not res["min_events"]["passes"]:
            return "UNDERPOWERED"
        if void[f"placebo_{q}"] or void[f"mirror_{q}"]:
            return "NULL (void: placebo or mirror fired)"
        return "VALIDATED" if res["main"][q]["verdict"]["passes"] else "NULL"
    res["verdict"] = {"R": word("R"), "D": word("D")}

    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=str)
    m = res["main"]
    print(json.dumps({k: res[k] for k in ("window", "n_days", "n_event_days", "n_quiet_days", "n_rate_days_excluded", "sanity_event_vs_quiet_R",
                                         "crowded_share_of_event_days", "min_events", "void_checks", "verdict")}, indent=1))
    for arm in ("main", "placebo", "mirror"):
        for q in ("R", "D"):
            a = res[arm][q]
            print(arm, q, a["all"], "halves", a["half1"]["effect"], a["half2"]["effect"],
                  {k: v["effect"] for k, v in a["per_pair"].items()}, a["verdict"])


if __name__ == "__main__":
    main()
