"""Evidence pack: the same proof bundle for every study, so a verdict can be checked rather than trusted.

Owner, 2026-11-15: "with all tests I want evidence of why it's null / doesn't work, as I don't trust your results."

Every study builds a tidy table of scored rows and calls `build_pack(...)`. The table has one row per scored unit:
    date (datetime64 or str YYYY-MM-DD), inst (str), signal (float; the study's direction score or state code),
    side (+1/-1/0: what the rule would do), outcome (float: signed move in the study's unit, e.g. sigma or R),
    optional: cost (float, same unit, >= 0), cluster (str/int: the block for the bootstrap; default = date)

and passes the hooks the pack cannot know:
    estimate_fn(rows) -> float        the study's headline statistic (e.g. mean side*outcome, BSS, IC)
    bar                               the pass bar for that statistic (the useful effect size)
    plant_fn(rows, effect, rng) -> rows   returns a copy of the REAL rows with a known effect of size `effect`
                                      added (e.g. outcome += effect * side on signal days). Used for the
                                      positive control: the pipeline must find a planted bar-sized effect.
    leak_fn(rows, rng) -> rows        optional: returns rows whose signal has been given tomorrow's outcome
                                      (a deliberate lookahead). The canary: the estimate must jump.

Outputs, in <out>/evidence/:
    evidence.json        every number below, machine-readable (the site page reads this)
    EVIDENCE.md          the same, written for a person, ending with the checklist verdict
    placebo.png          real estimate vs the shuffled-signal distribution
    buckets.png          outcome by signal decile (or state) with 95% CIs
    breakdown.png        estimate by instrument and by year with 95% CIs
    plants.png           positive control: detection rate at 0.5x, 1x, 2x the bar
    sample_rows.csv      30 random scored rows to spot-check against a chart

Nothing here decides a verdict on its own: the prereg's gate does. The pack explains it.
"""
from __future__ import annotations

import json
import math
import os
from typing import Callable, Optional

import numpy as np
import pandas as pd

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except Exception:  # charts are optional; numbers are not
    plt = None


# ── small statistics ─────────────────────────────────────────────────────────────────────────────────────────

def _clusters(rows: pd.DataFrame) -> np.ndarray:
    col = "cluster" if "cluster" in rows.columns else "date"
    return rows[col].astype(str).to_numpy()


def block_ci(rows: pd.DataFrame, estimate_fn: Callable, rng: np.random.Generator, B: int = 1000):
    """Cluster bootstrap (resample whole clusters, default = dates). Returns (lo, hi, se)."""
    cl = _clusters(rows)
    uniq, inv = np.unique(cl, return_inverse=True)
    groups = [np.flatnonzero(inv == k) for k in range(len(uniq))]
    vals = []
    for _ in range(B):
        pick = rng.integers(0, len(groups), len(groups))
        idx = np.concatenate([groups[p] for p in pick])
        v = estimate_fn(rows.iloc[idx])
        if v is not None and np.isfinite(v):
            vals.append(v)
    if len(vals) < 20:
        return (float("nan"), float("nan"), float("nan"))
    v = np.asarray(vals)
    return (float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5)), float(v.std(ddof=1)))


def shuffled_placebo(rows: pd.DataFrame, estimate_fn: Callable, rng: np.random.Generator, n: int = 500):
    """Shuffle the signal/side ACROSS dates within each instrument (keeps each market's signal mix and the
    outcome series intact; breaks only the link between them)."""
    out = []
    for _ in range(n):
        r = rows.copy()
        for inst, g in r.groupby("inst").groups.items():
            g = np.asarray(list(g))
            perm = rng.permutation(len(g))
            for c in ("signal", "side"):
                if c in r.columns:
                    r.loc[g, c] = r.loc[g, c].to_numpy()[perm]
        v = estimate_fn(r)
        if v is not None and np.isfinite(v):
            out.append(v)
    return np.asarray(out)


# ── the pack ─────────────────────────────────────────────────────────────────────────────────────────────────

def build_pack(rows: pd.DataFrame, *, slug: str, out: str, estimate_fn: Callable, bar: float, unit: str,
               plant_fn: Optional[Callable] = None, leak_fn: Optional[Callable] = None,
               verdict_word: Optional[str] = None, seed: int = 20261115, B: int = 1000, n_placebo: int = 500,
               n_plants: int = 40, signal_is_state: bool = False, notes: str = "") -> dict:
    rows = rows.reset_index(drop=True).copy()
    rows["date"] = pd.to_datetime(rows["date"])
    rng = np.random.default_rng(seed)
    ev_dir = os.path.join(out, "evidence")
    os.makedirs(ev_dir, exist_ok=True)

    est = float(estimate_fn(rows))
    lo, hi, se = block_ci(rows, estimate_fn, rng, B)
    pack = {"slug": slug, "unit": unit, "bar": bar, "n_rows": int(len(rows)),
            "n_clusters": int(len(np.unique(_clusters(rows)))), "n_instruments": int(rows["inst"].nunique()),
            "span": [str(rows["date"].min().date()), str(rows["date"].max().date())],
            "estimate": est, "ci": [lo, hi], "se": se, "verdict_word": verdict_word, "notes": notes}

    # 1. placebo
    plc = shuffled_placebo(rows, estimate_fn, rng, n_placebo)
    pack["placebo"] = {"n": int(len(plc)), "mean": float(plc.mean()) if len(plc) else None,
                       "p2_5": float(np.percentile(plc, 2.5)) if len(plc) else None,
                       "p97_5": float(np.percentile(plc, 97.5)) if len(plc) else None,
                       "real_percentile": float((plc < est).mean() * 100) if len(plc) else None}

    # 2. buckets (deciles of signal, or states)
    if signal_is_state:
        rows["_bucket"] = rows["signal"].astype(str)
    else:
        try:
            rows["_bucket"] = pd.qcut(rows["signal"].rank(method="first"), 10, labels=[f"D{i}" for i in range(1, 11)])
        except Exception:
            rows["_bucket"] = "all"
    buckets = []
    for b, g in rows.groupby("_bucket", observed=True):
        m = g["outcome"].mean()
        s = g["outcome"].std(ddof=1) / math.sqrt(max(len(g), 1))
        buckets.append({"bucket": str(b), "n": int(len(g)), "mean_outcome": float(m), "lo": float(m - 1.96 * s),
                        "hi": float(m + 1.96 * s), "mean_side": float(g["side"].mean()) if "side" in g else None})
    pack["buckets"] = buckets

    # 3. breakdowns
    def _by(col_series, label):
        res = []
        for k, idx in rows.groupby(col_series).groups.items():
            g = rows.loc[idx]
            if len(g) < 30:
                continue
            e = estimate_fn(g)
            l, h, _ = block_ci(g, estimate_fn, rng, max(200, B // 5))
            res.append({label: str(k), "n": int(len(g)), "estimate": float(e) if e is not None else None, "ci": [l, h]})
        return res
    pack["by_instrument"] = _by(rows["inst"], "inst")
    pack["by_year"] = _by(rows["date"].dt.year, "year")
    mid = rows["date"].sort_values().iloc[len(rows) // 2]
    pack["by_half"] = _by(np.where(rows["date"] <= mid, "H1", "H2"), "half")

    # 4. concentration and costs
    if "side" in rows and len(rows) > 100:
        contrib = (rows["side"] * rows["outcome"]).abs()
        keep = contrib <= contrib.quantile(0.99)
        pack["without_top1pct"] = float(estimate_fn(rows[keep]))
    if "cost" in rows.columns:
        net = rows.copy()
        net["outcome"] = net["outcome"] - net["cost"] * (net["side"] != 0)
        pack["net_of_cost"] = float(estimate_fn(net))

    # 5. positive control on the REAL rows
    plants = []
    if plant_fn is not None:
        for mult in (0.5, 1.0, 2.0):
            hits, ests = 0, []
            for _ in range(n_plants):
                r = plant_fn(rows.drop(columns=["_bucket"]), bar * mult, rng)
                e = float(estimate_fn(r))
                l, h, _ = block_ci(r, estimate_fn, rng, 200)
                ests.append(e)
                hits += int(l > 0) if bar > 0 else int(h < 0)
            plants.append({"multiple_of_bar": mult, "planted": bar * mult, "detected_share": hits / n_plants,
                           "mean_recovered": float(np.mean(ests))})
    pack["positive_control"] = plants

    # 6. lookahead canary
    if leak_fn is not None:
        leaked = leak_fn(rows.drop(columns=["_bucket"]), rng)
        pack["lookahead_canary"] = {"estimate_with_leak": float(estimate_fn(leaked)), "estimate_clean": est}

    # 7. sample rows
    samp = rows.drop(columns=["_bucket"]).sample(n=min(30, len(rows)), random_state=seed).sort_values("date")
    samp.to_csv(os.path.join(ev_dir, "sample_rows.csv"), index=False)

    # 8. checklist diagnosis
    pack["diagnosis"] = diagnose(pack)

    with open(os.path.join(ev_dir, "evidence.json"), "w") as f:
        json.dump(pack, f, indent=1, default=float)
    _charts(pack, ev_dir)
    _markdown(pack, ev_dir)
    return pack


def diagnose(p: dict) -> dict:
    """A fixed checklist, so 'null' always says which kind of null it is."""
    lo, hi = p["ci"]
    bar = p["bar"]
    pc = p.get("positive_control") or []
    one_x = next((x for x in pc if x["multiple_of_bar"] == 1.0), None)
    halves = [h["estimate"] for h in p.get("by_half", []) if h.get("estimate") is not None]
    insts = [x["estimate"] for x in p.get("by_instrument", []) if x.get("estimate") is not None]
    checks = {
        "ci_excludes_zero": bool(lo > 0 or hi < 0),
        "ci_excludes_bar": bool(hi < bar) if bar > 0 else bool(lo > bar),
        "beats_placebo_97_5": bool(p["placebo"]["p97_5"] is not None and p["estimate"] > p["placebo"]["p97_5"]),
        "pipeline_finds_planted_bar": (one_x["detected_share"] >= 0.8) if one_x else None,
        "same_sign_both_halves": (len(halves) == 2 and halves[0] * halves[1] > 0) if halves else None,
        "share_instruments_same_sign": (sum(1 for x in insts if x * (p["estimate"] or 1) > 0) / len(insts)) if insts else None,
        "survives_top1pct_removed": (p.get("without_top1pct") is not None and p["without_top1pct"] * p["estimate"] > 0),
        "survives_costs": (p.get("net_of_cost") > 0) if p.get("net_of_cost") is not None else None,
    }
    if checks["pipeline_finds_planted_bar"] is False:
        label = "UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown"
    elif checks["ci_excludes_zero"] and p["estimate"] < 0 < bar:
        label = "WRONG SIGN: there is an effect, and it is the opposite of the claim"
    elif checks["ci_excludes_bar"] and not checks["ci_excludes_zero"]:
        label = "FLAT: the test could see a useful effect (planted control found), and the interval rules it out"
    elif checks["ci_excludes_zero"] and checks["ci_excludes_bar"]:
        label = "SMALL BUT REAL: above zero, below the useful size"
    elif checks["ci_excludes_zero"] and checks["survives_costs"] is False:
        label = "REAL GROSS, GONE NET: costs eat it"
    elif checks["ci_excludes_zero"] and checks["same_sign_both_halves"] is False:
        label = "UNSTABLE: significant overall but one half disagrees"
    elif checks["ci_excludes_zero"]:
        label = "REAL: check the prereg gate for the formal verdict"
    else:
        label = "INCONCLUSIVE: the interval includes both zero and the useful size"
    return {"checks": checks, "label": label}


def _charts(p: dict, d: str) -> None:
    if plt is None:
        return
    # placebo
    try:
        fig, ax = plt.subplots(figsize=(6, 3.2))
        ax.axvspan(p["placebo"]["p2_5"], p["placebo"]["p97_5"], color="#bbb", alpha=.4, label="shuffled 95% band")
        ax.axvline(p["estimate"], color="#c0392b", lw=2, label=f"real {p['estimate']:+.4g}")
        ax.axvline(p["bar"], color="#2c7", ls="--", label=f"useful bar {p['bar']:+.4g}")
        ax.axvline(0, color="#333", lw=.6)
        ax.set_title(f"{p['slug']}: real vs shuffled ({p['unit']})"); ax.legend(fontsize=7)
        fig.tight_layout(); fig.savefig(os.path.join(d, "placebo.png"), dpi=110); plt.close(fig)
    except Exception:
        pass
    # buckets
    try:
        b = p["buckets"]
        fig, ax = plt.subplots(figsize=(6.5, 3.2))
        x = np.arange(len(b)); m = [r["mean_outcome"] for r in b]
        ax.errorbar(x, m, yerr=[[mm - r["lo"] for mm, r in zip(m, b)], [r["hi"] - mm for mm, r in zip(m, b)]], fmt="o")
        ax.axhline(0, color="#333", lw=.6); ax.set_xticks(x); ax.set_xticklabels([r["bucket"] for r in b], fontsize=7, rotation=30)
        ax.set_title(f"{p['slug']}: outcome by signal bucket (95% CI)"); ax.set_ylabel(p["unit"])
        fig.tight_layout(); fig.savefig(os.path.join(d, "buckets.png"), dpi=110); plt.close(fig)
    except Exception:
        pass
    # breakdown
    try:
        rows = [("inst", r) for r in p["by_instrument"]] + [("year", r) for r in p["by_year"]]
        fig, ax = plt.subplots(figsize=(7, max(3, 0.22 * len(rows))))
        for i, (k, r) in enumerate(rows):
            lo, hi = r["ci"]
            ax.plot([lo, hi], [i, i], color="#555"); ax.plot(r["estimate"], i, "o", color="#2471a3" if k == "inst" else "#ca6f1e")
        ax.axvline(0, color="#333", lw=.6); ax.axvline(p["bar"], color="#2c7", ls="--")
        ax.set_yticks(range(len(rows))); ax.set_yticklabels([str(r.get("inst", r.get("year"))) for _, r in rows], fontsize=7)
        ax.set_title(f"{p['slug']}: by instrument (blue) and year (orange)")
        fig.tight_layout(); fig.savefig(os.path.join(d, "breakdown.png"), dpi=110); plt.close(fig)
    except Exception:
        pass
    # plants
    try:
        if p["positive_control"]:
            fig, ax = plt.subplots(figsize=(4.5, 3))
            xs = [r["multiple_of_bar"] for r in p["positive_control"]]
            ax.plot(xs, [r["detected_share"] for r in p["positive_control"]], "o-")
            ax.axhline(0.8, color="#2c7", ls="--"); ax.set_ylim(0, 1.05)
            ax.set_xlabel("planted effect (x useful bar)"); ax.set_ylabel("share detected")
            ax.set_title("positive control on the real data")
            fig.tight_layout(); fig.savefig(os.path.join(d, "plants.png"), dpi=110); plt.close(fig)
    except Exception:
        pass


def _markdown(p: dict, d: str) -> None:
    f = lambda x: "—" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:+.4g}"
    L = [f"# Evidence pack: {p['slug']}", "",
         f"Unit: {p['unit']}. Useful bar: {f(p['bar'])}. {p['n_rows']} scored rows, {p['n_clusters']} independent "
         f"clusters, {p['n_instruments']} instruments, {p['span'][0]} → {p['span'][1]}. Prereg verdict: "
         f"**{p.get('verdict_word') or '—'}**.", "",
         f"## Diagnosis: {p['diagnosis']['label']}", "",
         "| Check | Result |", "|---|---|"]
    for k, v in p["diagnosis"]["checks"].items():
        L.append(f"| {k.replace('_', ' ')} | {v if not isinstance(v, float) else f'{v:.0%}'} |")
    L += ["", f"**Headline:** {f(p['estimate'])} [{f(p['ci'][0])}, {f(p['ci'][1])}]. Shuffled-signal 95% band "
          f"[{f(p['placebo']['p2_5'])}, {f(p['placebo']['p97_5'])}]; the real estimate sits at the "
          f"{p['placebo']['real_percentile']:.0f}th percentile of the shuffles." if p['placebo']['real_percentile'] is not None else "", ""]
    if p["positive_control"]:
        L += ["## Positive control (a known effect planted in the real data)", "", "| Planted | Detected | Mean recovered |", "|---|---|---|"]
        L += [f"| {r['multiple_of_bar']}× bar ({f(r['planted'])}) | {r['detected_share']:.0%} | {f(r['mean_recovered'])} |" for r in p["positive_control"]]
        L.append("")
    if p.get("lookahead_canary"):
        c = p["lookahead_canary"]
        L += [f"**Lookahead canary:** with tomorrow deliberately leaked in, the estimate becomes {f(c['estimate_with_leak'])} "
              f"(clean {f(c['estimate_clean'])}). A test that cannot see a leak this large would be broken.", ""]
    for key, title, lab in (("by_instrument", "By instrument", "inst"), ("by_year", "By year", "year"), ("by_half", "By half", "half")):
        if p.get(key):
            L += [f"## {title}", "", f"| {lab} | n | estimate | 95% CI |", "|---|---|---|---|"]
            L += [f"| {r[lab]} | {r['n']} | {f(r['estimate'])} | [{f(r['ci'][0])}, {f(r['ci'][1])}] |" for r in p[key]]
            L.append("")
    if p.get("without_top1pct") is not None:
        L.append(f"Without the largest 1% of rows: {f(p['without_top1pct'])}.")
    if p.get("net_of_cost") is not None:
        L.append(f"Net of costs: {f(p['net_of_cost'])}.")
    L += ["", "## Signal buckets", "", "| bucket | n | mean outcome | 95% CI |", "|---|---|---|---|"]
    L += [f"| {r['bucket']} | {r['n']} | {f(r['mean_outcome'])} | [{f(r['lo'])}, {f(r['hi'])}] |" for r in p["buckets"]]
    L += ["", "Charts: placebo.png, buckets.png, breakdown.png, plants.png. Spot-check rows: sample_rows.csv.", ""]
    if p.get("notes"):
        L += ["## Notes", "", p["notes"], ""]
    with open(os.path.join(d, "EVIDENCE.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


if __name__ == "__main__":  # self-test: a planted effect must be found, a null must not
    rng = np.random.default_rng(1)
    n = 3000
    dates = pd.date_range("2018-01-01", periods=600, freq="B")
    df = pd.DataFrame({"date": np.repeat(dates, 5), "inst": np.tile(list("ABCDE"), 600)})
    df["signal"] = rng.normal(size=len(df)); df["side"] = np.sign(df["signal"]).astype(int)
    df["outcome"] = rng.normal(size=len(df))
    est = lambda r: float((r["side"] * r["outcome"]).mean())
    plant = lambda r, e, g: r.assign(outcome=r["outcome"] + e * r["side"])
    leak = lambda r, g: r.assign(side=np.sign(r["outcome"]).astype(int))
    out = os.path.join(os.environ.get("TEMP", "/tmp"), "evidence_pack_selftest")
    p = build_pack(df, slug="selftest-null", out=out, estimate_fn=est, bar=0.1, unit="sigma", plant_fn=plant,
                   leak_fn=leak, n_placebo=100, n_plants=10, B=200)
    assert p["positive_control"][1]["detected_share"] >= 0.8, p["positive_control"]
    assert not p["diagnosis"]["checks"]["ci_excludes_zero"] or abs(p["estimate"]) < 0.05
    assert p["lookahead_canary"]["estimate_with_leak"] > 0.5
    print("evidence pack SELFTEST PASSED:", p["diagnosis"]["label"])
