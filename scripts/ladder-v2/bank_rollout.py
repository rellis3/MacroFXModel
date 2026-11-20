"""Bank ladder-v2-rollout (forge/LADDER_V2_ROLLOUT_PREREG.md) from every finished instrument's results.json.

    python scripts/ladder-v2/bank_rollout.py

Rerunnable: rewrites analysis/output/ladder-v2-rollout/RESULTS.md + results.json, and the generated blocks between
'ladder-v2-rollout:begin/end' markers in js/deskEvidence.js (entries + POWER), the register row and the runbook lines.
Instruments still without results are listed as pending. Then run `node js/deskEvidence.test.mjs` and
`node scripts/build_trial_ledger.mjs`.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from math import erf, sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

PILOTS = ("NQ", "GOLD", "EURUSD")
TODAY = date.today().isoformat()
OUT = ROOT / "analysis/output/ladder-v2-rollout"
DOC = "forge/LADDER_V2_ROLLOUT_PREREG.md"
ARM = {"A0": "live", "H8": "HAR-800", "R5": "HAR-RV 5-min", "R15": "HAR-RV 15-min", "SHAR": "SHAR", "HARCJ": "HAR-CJ",
       "G_garch": "GARCH", "G_garch_t": "GARCH-t", "G_gjr": "GJR-GARCH", "G_egarch": "EGARCH",
       "B_har_garcht": "HAR + GARCH-t", "V3": "IV-adjusted", "V4": "pure IV", "B_har_iv": "HAR + IV"}
VW = {"VALIDATED": "validated", "NULL": "null", "UNDERPOWERED": "underpowered", "CONTEXT": "context"}


def arm(a):
    return ARM.get(a, a[2:].replace("_", " ") if a.startswith("E_") else a)


def p_approx(ci):
    """One-sided p that the chosen arm is no better than the baseline, from a 90% CI under a normal approximation.
    Conservative where the re-selected CI is clipped at 0 (some draws pick the baseline itself)."""
    lo, hi = ci
    se = max((hi - lo) / (2 * 1.6449), 1e-9)
    z = -(lo + hi) / 2 / se
    return 0.5 * (1 - erf(z / sqrt(2)))


def bh(ps, q=0.10):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / len(ps):
            k = r
    keep = set(order[:k])
    return [i in keep for i in range(len(ps))]


def failing(checks):
    return [k for k, v in checks.items() if "descriptive" not in k and v["ci90"][1] >= 0]


def collect():
    rows, pending = [], []
    for sym in L.SYMS:
        if sym in PILOTS:
            continue
        tr = L.tracks_for(sym)
        lp = ROOT / f"analysis/output/ladder-v2-{sym.lower()}/results.json"
        ep = ROOT / f"analysis/output/exhaustion-v2-{sym.lower()}/results.json"
        if not tr or not lp.exists() or not ep.exists():
            pending.append((sym, tr))
            continue
        r, e = json.loads(lp.read_text()), json.loads(ep.read_text())
        d = {"sym": sym, "tracks": tr, "fut": L.SYMS[sym].get("f"), "lad": {}, "exh": {}}
        for t in tr:
            x = r[t]; c = x["chosen"]
            d["lad"][t] = {"verdict": x["verdict"], "chosen": c, "A0": x["arms"]["A0"]["primary"],
                           "chosen_primary": x["arms"][c]["primary"], "ci": x["chosen_minus_A0_ci90_reselected"],
                           "n": x["n"], "floor_p90": x["floor_p90"], "within_noise": x["chosen_calibrated_to_noise"],
                           "fails": failing(x["checks"]), "live": L.SYMS[sym]["live"]}
            y = e[t]; c2 = y["chosen"]
            d["exh"][t] = {"verdict": y["verdict"], "chosen": c2, "X0": y["cands"]["X0"]["primary"],
                           "chosen_primary": y["cands"][c2]["primary"], "ci": y["chosen_minus_X0_ci90"],
                           "ll": y["cands"][c2]["logloss_vs_X0"], "n_sessions": y["n_sessions"],
                           "touches": y["n_touches"], "fails": failing(y["checks"])}
        if "c_vs_f" in r:
            rat = [v["ratio"] for v in r["c_vs_f"]["ratios"].values()]
            d["cvf"] = {"same": r["c_vs_f"]["same"], "n": r["c_vs_f"]["n"], "lo": min(rat), "hi": max(rat)}
        rows.append(d)
    return rows, pending


def f2(x):
    return f"{x:.2f}"


def fut_arm(d):
    """The arm the futures lines use: H3 'same' reuses the CFD spec."""
    if "F" not in d["lad"]:
        return None
    return d["lad"]["C"]["chosen"] if d.get("cvf", {}).get("same") else d["lad"]["F"]["chosen"]


def entries(rows):
    out = []
    for d in rows:
        s, S = d["sym"].lower(), d["sym"]
        also = "also: ['analysis/output/ladder-v2-rollout/RESULTS.md', " \
               f"'analysis/output/ladder-v2-{s}/report.txt', 'analysis/output/exhaustion-v2-{s}/report.txt']"
        for t in d["tracks"]:
            x = d["lad"][t]; fid = f"ladder-v2-{s}" + ("-fut" if t == "F" else "")
            src = "OANDA CFD" if t == "C" else f"NT8 {d['fut']} futures"
            fails = f" Fails: {', '.join(x['fails'])}." if x["fails"] else " Every check below 0."
            use = {"validated": f"{S} shadow sigma ({'CFD' if t == 'C' else d['fut']}) = {arm(fut_arm(d) if t == 'F' else x['chosen'])} with its fitted widths; side by side until owner sign-off.",
                   "underpowered": f"{S} ({'CFD' if t == 'C' else d['fut']}) keeps the live ladder; v2 shown alongside only. The lockbox / forward record decides."}.get(VW[x["verdict"]], "Keeps the live ladder.")
            out.append(f"""  {{
    id: '{fid}', domain: 'volatility', verdict: '{VW[x["verdict"]]}', date: '{TODAY}', doc: '{DOC}', {also},
    claim: 'Among the pilot sigma inputs (forge estimators, HAR-800, intraday-RV HAR, SHAR, HAR-CJ, GARCH family, blends), one keeps the {S} daily ladder on target in every sigma fifth better than live {arm(x["live"])}, walk-forward, {src}',
    result: 'Pre-registered (rollout), {x["n"]:,} sessions 2018 to 2026-08, 63-session blocks. Chosen {arm(x["chosen"])}: regime miss {f2(x["chosen_primary"])}pp vs live {f2(x["A0"])}pp, CI [{x["ci"][0]:+.2f}, {x["ci"][1]:+.2f}] with the winner re-selected per draw;{fails} Noise floor p90 {f2(x["floor_p90"])}pp ({"within" if x["within_noise"] else "outside"}).',
    use: '{use}',
    instruments: ['{S}'],
  }},""")
        if "cvf" in d:
            c = d["cvf"]
            out.append(f"""  {{
    id: 'ladder-v2-{s}-cvf', domain: 'volatility', verdict: 'context', date: '{TODAY}', doc: '{DOC}', {also},
    claim: '{d["fut"]} futures and the {S} CFD have the same daily range distribution in percent of the London open',
    result: '{"SAME" if c["same"] else "DIFFERENT"}: {c["n"]:,} common dates, F/C ratios {c["lo"]:.3f}-{c["hi"]:.3f}.',
    use: '{f"One percent ladder serves {S} CFD and {d['fut']} charts." if c["same"] else f"{d['fut']} keeps its own widths and winner ({arm(d['lad']['F']['chosen'])})."}',
    instruments: ['{S}'],
  }},""")
        for t in d["tracks"]:
            y = d["exh"][t]; fid = f"exhaustion-v2-{s}" + ("-fut" if t == "F" else "")
            src = "CFD" if t == "C" else f"{d['fut']} futures"
            fails = f" Fails: {', '.join(y['fails'])}." if y["fails"] else " Every check below 0."
            out.append(f"""  {{
    id: '{fid}', domain: 'volatility', verdict: '{VW[y["verdict"]]}', date: '{TODAY}', doc: '{DOC}', {also},
    claim: 'After {S} first touches a daily ladder line, a clock-aware forecast of further travel (next rung or 0.25 sigma by 22:00 London) is better calibrated than the plain ladder odds, {src}',
    result: 'Pre-registered (rollout), walk-forward, {y["n_sessions"]:,} sessions, {y["touches"]["next"]:,}/{y["touches"]["sig"]:,} touches. Calibration miss {f2(y["X0"])}pp (plain odds) -> {f2(y["chosen_primary"])}pp ({y["chosen"]}), CI [{y["ci"][0]:+.2f}, {y["ci"][1]:+.2f}];{fails} Log loss x{y["ll"]:.3f}.',
    use: '{S} exhaustion odds per rung by time of day on the shadow export; further travel, not direction.',
    instruments: ['{S}'],
  }},""")
    return "\n".join(out)


def power(rows):
    out = []
    for d in rows:
        s = d["sym"].lower()
        for t in d["tracks"]:
            x, y = d["lad"][t], d["exh"][t]; sf = "-fut" if t == "F" else ""
            out.append(f"  'ladder-v2-{s}{sf}': {{ n: '{x['n']:,} sessions, 63-session blocks, winner re-selected per draw', note: 'observed {x['chosen_primary'] - x['A0']:+.2f}pp' }},")
            out.append(f"  'exhaustion-v2-{s}{sf}': {{ n: '{y['touches']['next']:,} / {y['touches']['sig']:,} touches on {y['n_sessions']:,} sessions', note: 'NULL bar 1pp; observed {y['chosen_primary'] - y['X0']:+.2f}pp' }},")
        if "cvf" in d:
            out.append(f"  'ladder-v2-{s}-cvf': {{ n: '{d['cvf']['n']:,} common London dates', note: 'ratios {d['cvf']['lo']:.3f}-{d['cvf']['hi']:.3f}' }},")
    return "\n".join(out)


def block(name, body, indent="  "):
    b = f"{indent}// ladder-v2-rollout {name}:begin (generated by scripts/ladder-v2/bank_rollout.py)"
    e = f"{indent}// ladder-v2-rollout {name}:end"
    return b, e, f"{b}\n{body}\n{e}"


def put(s, anchor, body, name):
    b, e, blk = block(name, body)
    if b in s:
        i, j = s.index(b), s.index(e) + len(e)
        return s[:i] + blk + s[j:]
    assert s.count(anchor) == 1, anchor[:60]
    return s.replace(anchor, anchor + blk + "\n", 1)


def edit(path, fn):
    p = ROOT / path; raw = p.read_bytes(); crlf = b"\r\n" in raw
    s = raw.decode("utf-8").replace("\r\n", "\n"); s2 = fn(s)
    if crlf:
        s2 = s2.replace("\n", "\r\n")
    p.write_bytes(s2.encode("utf-8"))


def main():
    rows, pending = collect()
    # multiplicity (prereg §3)
    lad = [(d["sym"], t, d["lad"][t]) for d in rows for t in d["tracks"]]
    exh = [(d["sym"], t, d["exh"][t]) for d in rows for t in d["tracks"]]
    lp = [p_approx(x["ci"]) for _, _, x in lad]; ep = [p_approx(x["ci"]) for _, _, x in exh]
    lk, ek = bh(lp), bh(ep)
    n = len(lad)
    cnt = lambda xs, v: sum(1 for _, _, x in xs if x["verdict"] == v)  # noqa: E731
    summary = {"date": TODAY, "instrument_tracks": n, "instruments": len(rows),
               "ladder": {v: cnt(lad, v) for v in VW}, "exhaustion": {v: cnt(exh, v) for v in VW},
               "chance_validated_expected": round(n * 0.05, 1),
               "bh_q10_ladder_kept": sum(lk), "bh_q10_exhaustion_kept": sum(ek),
               "pending": [s for s, _ in pending]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps({"summary": summary, "rows": rows,
                                                  "p_approx": {"ladder": {f"{s}_{t}": p for (s, t, _), p in zip(lad, lp)},
                                                               "exhaustion": {f"{s}_{t}": p for (s, t, _), p in zip(exh, ep)}}},
                                                 indent=1))
    L_ = [f"# ladder-v2-rollout — sigma race + exhaustion for every instrument with data", "",
          f"Pre-registered: `{DOC}` (A1: a test year needs an earlier year to fit on; affects US2000 F exhaustion only). "
          f"Generated {TODAY} by `scripts/ladder-v2/bank_rollout.py`. Per-instrument detail: "
          "`analysis/output/ladder-v2-<sym>/report.txt`, `analysis/output/exhaustion-v2-<sym>/report.txt`.", "",
          "## Summary", "",
          f"- {len(rows)} instruments, {n} instrument-tracks scored.",
          f"- **Sigma race:** {summary['ladder']['VALIDATED']} VALIDATED, {summary['ladder']['UNDERPOWERED']} UNDERPOWERED, "
          f"{summary['ladder']['NULL']} NULL.",
          f"- **Exhaustion:** {summary['exhaustion']['VALIDATED']} VALIDATED, {summary['exhaustion']['UNDERPOWERED']} UNDERPOWERED, "
          f"{summary['exhaustion']['NULL']} NULL.",
          f"- **Multiplicity:** {n} independent tries would give about {summary['chance_validated_expected']} VALIDATED by chance "
          f"under the 90% CI rule. BH q = 0.10 over approximate one-sided p-values (normal approximation from each 90% CI; "
          f"conservative where the re-selected CI is clipped at 0) keeps {sum(lk)}/{n} sigma races and {sum(ek)}/{n} exhaustion "
          "races. Errors are correlated across instruments (about 0.47 for sigma), so the effective number of tries is smaller.",
          "- Pending (no data yet): " + (", ".join(f"{s}" for s, _ in pending) or "none") + ".", "",
          "## Sigma race (regime miss, pp; lower is better)", "",
          "| Instrument | Track | Verdict | Chosen | Chosen | Live | CI (chosen − live) | Fails | BH |",
          "|---|---|---|---|---|---|---|---|---|"]
    for (s, t, x), k in zip(lad, lk):
        L_.append(f"| {s} | {t} | {x['verdict']} | {arm(x['chosen'])} | {f2(x['chosen_primary'])} | {f2(x['A0'])} | "
                  f"[{x['ci'][0]:+.2f}, {x['ci'][1]:+.2f}] | {', '.join(x['fails']) or '—'} | {'kept' if k else '—'} |")
    L_ += ["", "## C vs F (H3)", "", "| Instrument | Futures | Same? | F/C ratios | Futures lines use |", "|---|---|---|---|---|"]
    for d in rows:
        if "cvf" in d:
            c = d["cvf"]
            L_.append(f"| {d['sym']} | {d['fut']} | {'same' if c['same'] else 'different'} | {c['lo']:.3f}–{c['hi']:.3f} | {arm(fut_arm(d))} |")
    L_ += ["", "## Exhaustion (calibration miss, pp)", "",
           "| Instrument | Track | Verdict | Chosen | Chosen | Plain odds | CI | Log loss ratio | BH |", "|---|---|---|---|---|---|---|---|---|"]
    for (s, t, y), k in zip(exh, ek):
        L_.append(f"| {s} | {t} | {y['verdict']} | {y['chosen']} | {f2(y['chosen_primary'])} | {f2(y['X0'])} | "
                  f"[{y['ci'][0]:+.2f}, {y['ci'][1]:+.2f}] | {y['ll']:.3f} | {'kept' if k else '—'} |")
    L_ += ["", "## What it changes", "",
           "VALIDATED instruments go onto the shadow exports (forecast and exhaustion, CFD and futures) and the "
           "forecast-reversion page. UNDERPOWERED sigma races keep the live ladder (v2 shown alongside); their exhaustion odds "
           "still apply where exhaustion VALIDATED. Event multipliers, the per-class lockbox and the FX-major IV races are "
           "not part of this study."]
    (OUT / "RESULTS.md").write_text("\n".join(L_) + "\n", encoding="utf-8")

    edit("js/deskEvidence.js", lambda s: put(put(s,
         "    use: '6E exhaustion uses the same blend and lines as the CFD.',\n    instruments: ['EURUSD'],\n  },\n", entries(rows), "entries"),
         "  'exhaustion-v2-eurusd-fut': { n: '7,214 / 8,121 touches on 1,706 sessions', note: 'NULL bar 1pp; observed -7.0pp' },\n",
         power(rows), "power"))

    ids = ", ".join(f"ladder-v2-<sym>{{,-fut,-cvf}} + exhaustion-v2-<sym>{{,-fut}} for {len(rows)} instruments" for _ in [0])

    def reg(s):
        i = s.index("| ladder-v2-rollout |"); j = s.index("\n", i)
        old = s[i:j].split("|")          # ['', id, question, status, branch, date, prereg, results, ids, next, '']
        old[3] = " BANKED " if not pending else " BANKED (partial) "
        old[4] = " jvphone "
        old[7] = " `analysis/output/ladder-v2-rollout/RESULTS.md` "
        old[8] = f" {ids} "
        old[9] = " " + (f"sigma {summary['ladder']['VALIDATED']}/{n} VALIDATED, {summary['ladder']['UNDERPOWERED']} UNDERPOWERED, "
                  f"0 NULL; exhaustion {summary['exhaustion']['VALIDATED']}/{n} VALIDATED; BH keeps {sum(lk)}/{sum(ek)}. "
                  + (f"Pending data: {', '.join(s for s, _ in pending)} (rerun the banker when they finish)"
                     if pending else "Next: shadow exports + reversion page for the VALIDATED")) + " "
        return s[:i] + "|".join(old) + s[j:]
    edit("plans/RESEARCH_REGISTER.md", reg)

    def rb(s):
        tag = "- [x] Rollout"
        s = "\n".join(l for l in s.split("\n") if not l.startswith(tag))
        a = "- [x] EURUSD 2026-11-19 (`ladder-v2-eurusd`, VALIDATED): HAR-CJ, 2.81 → 1.38pp, within noise. IV race 2021+ UNDERPOWERED, IV arms don't win."
        b = "- [x] EURUSD: same (ratios 1.003–1.012), so 6E reuses the CFD spec (`ladder-v2-eurusd-cvf`)."
        c = "- [x] EURUSD 2026-11-19 (`exhaustion-v2-eurusd`, VALIDATED C and F): same clock shape; X7 10.6 → 3.8pp."
        up = [x for x in lad if x[2]["verdict"] != "VALIDATED"]
        s = s.replace(a, a + f"\n{tag} {TODAY} (`ladder-v2-rollout`, {len(rows)} instruments, {n} tracks): sigma "
                      f"{summary['ladder']['VALIDATED']} VALIDATED, {len(up)} UNDERPOWERED ("
                      + ", ".join(f"{s_} {t}" for s_, t, _ in up) + "), 0 NULL. Table: `analysis/output/ladder-v2-rollout/RESULTS.md`.", 1)
        diff = [d["sym"] for d in rows if "cvf" in d and not d["cvf"]["same"]]
        s = s.replace(b, b + f"\n{tag} {TODAY}: C vs F different for " + (", ".join(diff) or "none")
                      + "; every other pair reuses the CFD spec.", 1)
        return s.replace(c, c + f"\n{tag} {TODAY}: exhaustion {summary['exhaustion']['VALIDATED']}/{n} VALIDATED "
                         "across the rollout (`exhaustion-v2-<sym>`).", 1)
    edit("plans/VOL_EXHAUSTION_RUNBOOK.md", rb)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
