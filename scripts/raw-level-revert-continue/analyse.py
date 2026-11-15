"""Summarise trades.csv.gz from run.py -> results.json + RESULTS_TABLES.md. Exploratory, not pre-registered."""
import json, os
import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/raw-level-revert-continue")
SEED, N_BOOT = 20261115, 1000
rng = np.random.default_rng(SEED)

T = pd.read_csv(os.path.join(OUT, "trades.csv.gz"))
T["bp_fade"] = T["fade"] * 1e4
T["bp_pl"] = T["pl_fade"] * 1e4
T["bp_cost"] = T["cost"] * 1e4
T["edge"] = T["bp_fade"] - T["bp_pl"]                     # fade vs same-geometry placebo, gross
T["edge_hold"] = (T["fade_hold"] - T["pl_hold"]) * 1e4
# R: a touch that closes right next to the stop rung has a near-zero stop and an absurd R, so each stop
# distance is floored at a quarter of the inner-to-outer span (the same floor for both rules).
_span = T["risk"] + T["reward"]
_rf, _rw = np.maximum(T["risk"], 0.25 * _span), np.maximum(T["reward"], 0.25 * _span)
T["R_fade_net"] = (T["fade"] - T["cost"]) / _rf       # fade risk = distance to the outer rung
T["R_follow_net"] = (-T["fade"] - T["cost"]) / _rw    # follow risk = distance back to the inner rung
T["R_fade_gross"] = T["fade"] / _rf
T["R_follow_gross"] = -T["fade"] / _rw
T["bp_fade_net"] = T["bp_fade"] - T["bp_cost"]
T["bp_follow_net"] = -T["bp_fade"] - T["bp_cost"]
T["rev"] = (T["res"] == "revert").astype(float)
T["cont"] = (T["res"] == "continue").astype(float)
T["nei"] = (T["res"] == "neither").astype(float)
T["tod"] = pd.cut(T["touch_hr"], [-1, 7, 12, 17, 22], labels=["00-07 Asia", "07-12 London", "12-17 NY overlap", "17-22 late"])
T["volreg"] = pd.cut(T["prev_hl_rank"], [-1, 1 / 3, 2 / 3, 2], labels=["calm (yday range low third)", "normal", "busy (yday range top third)"])
T["trend"] = np.where(T["with_trend"], "line in direction of 5-day trend", "line against 5-day trend")
RUNG_ORDER = ["p50", "p75", "p90"]


def boot_ci(df, col):
    """Date-clustered bootstrap CI of the mean of col."""
    g = df.groupby("date")[col].agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    n = len(g)
    if n < 10:
        return [np.nan, np.nan]
    idx = rng.integers(0, n, size=(N_BOOT, n))
    m = s[idx].sum(1) / c[idx].sum(1)
    return [float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))]


def boot_p(df, col):
    g = df.groupby("date")[col].agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    n = len(g)
    idx = rng.integers(0, n, size=(N_BOOT, n))
    m = s[idx].sum(1) / c[idx].sum(1)
    mean = s.sum() / c.sum()
    # two-sided p from centred bootstrap
    return float(min(1.0, 2 * min(((m - mean) >= abs(mean)).mean(), ((m - mean) <= -abs(mean)).mean()) + 1 / N_BOOT))


def cell(df):
    return dict(
        n=int(len(df)), days=int(df["date"].nunique()),
        revert_first=round(df["rev"].mean() * 100, 1), continue_first=round(df["cont"].mean() * 100, 1),
        neither=round(df["nei"].mean() * 100, 1),
        placebo_revert=round(df["pl_rev"].mean() * 100, 1), placebo_continue=round(df["pl_cont"].mean() * 100, 1),
        fade_bp=round(df["bp_fade"].mean(), 2), placebo_fade_bp=round(df["bp_pl"].mean(), 2),
        edge_bp=round(df["edge"].mean(), 2), edge_ci=[round(x, 2) for x in boot_ci(df, "edge")],
        edge_p=boot_p(df, "edge"),
        hold_edge_bp=round(df["edge_hold"].mean(), 2), hold_edge_ci=[round(x, 2) for x in boot_ci(df, "edge_hold")],
        cost_bp=round(df["bp_cost"].mean(), 2),
        fade_net_bp=round(df["bp_fade_net"].mean(), 2), fade_net_bp_ci=[round(x, 2) for x in boot_ci(df, "bp_fade_net")],
        follow_net_bp_ci=[round(x, 2) for x in boot_ci(df, "bp_follow_net")],
        fade_pf=round(df.loc[df.bp_fade_net > 0, "bp_fade_net"].sum() / -df.loc[df.bp_fade_net < 0, "bp_fade_net"].sum(), 3),
        follow_pf=round(df.loc[df.bp_follow_net > 0, "bp_follow_net"].sum() / -df.loc[df.bp_follow_net < 0, "bp_follow_net"].sum(), 3), follow_net_bp=round(df["bp_follow_net"].mean(), 2),
        fade_net_R=round(df["R_fade_net"].mean(), 3), follow_net_R=round(df["R_follow_net"].mean(), 3),
        fade_gross_R=round(df["R_fade_gross"].mean(), 3), follow_gross_R=round(df["R_follow_gross"].mean(), 3),
        fade_net_R_ci=[round(x, 3) for x in boot_ci(df, "R_fade_net")],
        follow_net_R_ci=[round(x, 3) for x in boot_ci(df, "R_follow_net")],
    )


def bh(ps, q=0.10):
    ps = np.asarray(ps); n = len(ps); o = np.argsort(ps)
    thr = q * (np.arange(1, n + 1)) / n
    ok = ps[o] <= thr
    k = np.nonzero(ok)[0].max() + 1 if ok.any() else 0
    res = np.zeros(n, bool); res[o[:k]] = True
    return res


R = {"seed": SEED, "label": "exploratory, not pre-registered", "n_touches": int(len(T)),
     "meta": json.load(open(os.path.join(OUT, "_build_meta.json")))}

# touch rates (calibration of the raw lines)
sess = T.groupby("inst")["date"].nunique()
R["sessions_by_inst"] = sess.to_dict()
tr = T.groupby(["fam", "rung", "side"]).size().unstack("side")
tot_sessions = None  # sessions with any touch differ by inst; use run-scored count from meta-free approach
R["touch_counts"] = {f"{f}|{r}": v for (f, r), v in tr.sum(axis=1).items()}

# 1. main pooled table, family x rung
main = {}
for fam in ["EXT", "HL", "OC"]:
    for rung in RUNG_ORDER:
        main[f"{fam}|{rung}"] = cell(T[(T.fam == fam) & (T.rung == rung)])
keys = list(main)
sig = bh([main[k]["edge_p"] for k in keys])
for k, s in zip(keys, sig):
    main[k]["bh_q10"] = bool(s)
R["main"] = main

# 2. per instrument (EXT), per class (EXT)
R["by_inst"] = {f"{i}|{r}": cell(T[(T.fam == "EXT") & (T.inst == i) & (T.rung == r)])
                for i in T.inst.unique() for r in RUNG_ORDER}
ik = list(R["by_inst"]); s2 = bh([R["by_inst"][k]["edge_p"] for k in ik])
for k, s in zip(ik, s2):
    R["by_inst"][k]["bh_q10"] = bool(s)
R["by_class"] = {f"{c}|{r}": cell(T[(T.fam == "EXT") & (T.klass == c) & (T.rung == r)])
                 for c in T.klass.unique() for r in RUNG_ORDER}

# 3. "why": conditioners, EXT family, each rung
cond = {}
for name in ["tod", "volreg", "trend", "year", "side"]:
    for lvl, g in T[T.fam == "EXT"].groupby(name, observed=True):
        for r in RUNG_ORDER:
            gg = g[g.rung == r]
            if len(gg) >= 200:
                cond[f"{name}|{lvl}|{r}"] = cell(gg)
ck = list(cond); s3 = bh([cond[k]["edge_p"] for k in ck])
for k, s in zip(ck, s3):
    cond[k]["bh_q10"] = bool(s)
R["conditioners"] = cond

# 4. equity curve per year: fade-every-line vs follow-every-line at 1% risk, EXT p50+p75+p90 all trades
yr = {}
for (y, rung), g in T[T.fam == "EXT"].groupby(["year", "rung"]):
    yr[f"{y}|{rung}"] = dict(n=int(len(g)), fade_R_sum=round(g["R_fade_net"].sum(), 1),
                            follow_R_sum=round(g["R_follow_net"].sum(), 1))
R["by_year_R"] = yr

json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=float)


def fmt_ci(c):
    return f"[{c[0]:+.2f}, {c[1]:+.2f}]"


lines = ["# raw-level-revert-continue tables (generated by analyse.py)", ""]
lines.append("## Main: pooled across 12 instruments")
lines.append("| family | rung | touches | revert first % | continue first % | neither % | placebo rev/cont % | fade edge vs placebo bp [95% CI] | BH | hold-to-close fade edge bp | cost bp | fade net bp | follow net bp | fade PF | follow PF | fade net R | follow net R |")
lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for k, c in main.items():
    f, r = k.split("|")
    lines.append(f"| {f} | {r} | {c['n']} | {c['revert_first']} | {c['continue_first']} | {c['neither']} | {c['placebo_revert']}/{c['placebo_continue']} | {c['edge_bp']:+.2f} {fmt_ci(c['edge_ci'])} | {'yes' if c['bh_q10'] else 'no'} | {c['hold_edge_bp']:+.2f} {fmt_ci(c['hold_edge_ci'])} | {c['cost_bp']} | {c['fade_net_bp']:+.2f} | {c['follow_net_bp']:+.2f} | {c['fade_pf']} | {c['follow_pf']} | {c['fade_net_R']:+.3f} | {c['follow_net_R']:+.3f} |")
lines += ["", "## By instrument (EXT family)", "| inst | rung | n | revert % | cont % | neither % | fade edge bp [CI] | BH | fade net R | follow net R |", "|---|---|---|---|---|---|---|---|---|---|"]
for k, c in R["by_inst"].items():
    i, r = k.split("|")
    lines.append(f"| {i} | {r} | {c['n']} | {c['revert_first']} | {c['continue_first']} | {c['neither']} | {c['edge_bp']:+.2f} {fmt_ci(c['edge_ci'])} | {'yes' if c['bh_q10'] else 'no'} | {c['fade_net_R']:+.3f} | {c['follow_net_R']:+.3f} |")
lines += ["", "## Conditioners (EXT family)", "| split | level | rung | n | revert % | placebo rev % | fade edge bp [CI] | BH | fade net R | follow net R |", "|---|---|---|---|---|---|---|---|---|---|"]
for k, c in cond.items():
    a, b, r = k.split("|")
    lines.append(f"| {a} | {b} | {r} | {c['n']} | {c['revert_first']} | {c['placebo_revert']} | {c['edge_bp']:+.2f} {fmt_ci(c['edge_ci'])} | {'yes' if c['bh_q10'] else 'no'} | {c['fade_net_R']:+.3f} | {c['follow_net_R']:+.3f} |")
open(os.path.join(OUT, "RESULTS_TABLES.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines[:16]))
