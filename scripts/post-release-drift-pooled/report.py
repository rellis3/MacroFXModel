"""post-release-drift-pooled: RESULTS.md + results.json in the research-protocol format."""
from __future__ import annotations

import math
import subprocess

import pandas as pd

from common import BARS, BRANCH, HORIZONS, IDS, PREREG, PREREG_COMMIT, ROOT, SLUG, Params, jdump


def _f(x, k=3):
    return "—" if x is None or (isinstance(x, float) and not math.isfinite(x)) else f"{x:+.{k}f}"


def _p(x):
    return "—" if x is None or not math.isfinite(x) else f"{x:.3f}"


def prereg_commit() -> str:
    try:
        r = subprocess.run(["git", "log", "-1", "--format=%h", "--", PREREG], capture_output=True, text=True, cwd=ROOT)
        return r.stdout.strip() or PREREG_COMMIT
    except Exception:
        return PREREG_COMMIT


def write(out_dir, params: Params, res: dict, power: dict, coverage: list, notes: list, deviations: list, ran_at: str,
          selftest: bool = False):
    commit = prereg_commit()
    verdicts = {idn: res["ids"][idn]["verdict"].lower() for idn in IDS}
    cells_json = []
    for idn in IDS:
        for h in HORIZONS:
            st = res["ids"][idn]["cells"][h]
            cells_json.append({"name": f"{idn} {h}", "n": st["n"], "est": st["est"], "lo": st["lo"], "hi": st["hi"],
                               "mde": st["power"]["mde"], "bar": st["bar"], "p": st["p"], "p_holm": st["p_holm"],
                               "t": st["t_stat"], "verdict": res["ids"][idn]["cell_verdicts"][h].split(" ")[0],
                               "gate": {k: v for k, v in st["gate"].items()}})
    J = {"id": SLUG, "verdicts": verdicts, "ranAt": ran_at, "seed": params.seed, "B": params.B, "n_flip": params.n_flip,
         "n_placebo": params.n_placebo, "prereg": PREREG, "preregCommit": commit, "branch": BRANCH,
         "selftest": selftest, "scoredCells": 8, "cells": cells_json, "power": power, "detail": res}
    jdump(J, out_dir / "results.json")

    L = [f"# {SLUG} — results{' (SYNTHETIC SELFTEST, not a result)' if selftest else ''}", "",
         f"Prereg: `{PREREG}` (committed in `{commit}`, 2026-11-14). Run {ran_at[:10]}, seed {params.seed}, "
         f"B = {params.B}, sign flips {params.n_flip}, placebo replicates {params.n_placebo}.",
         f"Branch `{BRANCH}`. Ledger ids: `{IDS[0]}`, `{IDS[1]}`.", ""]
    for idn in IDS:
        L.append(f"## Verdict `{idn}`: {res['ids'][idn]['verdict']}")
        L.append("")
        c = res["ids"][idn]["cells"]
        h2 = c["h2"]
        L.append(f"Registered gate (prereg §4, conditions 1-7, continuation or reversal) per cell; Holm over 4 horizons. "
                 f"Headline h2 (21:00 UK): {_f(h2['est'])}σ [{_f(h2['lo'])}, {_f(h2['hi'])}], n = {h2['n']} events, "
                 f"Holm p {h2['p_holm']:.4f}, placebo percentile {h2['placebo_pct']:.1f}. "
                 f"Cell labels: " + ", ".join(f"{h} {res['ids'][idn]['cell_verdicts'][h]}" for h in HORIZONS) + ".")
        L.append("")
        L.append("| Cell | n | Estimate (σ) | 95% CI (event-cluster) | MDE (placebo) | Pass bar | Holm p | t | Gate (cont / rev) | Cell verdict |")
        L.append("|---|---|---|---|---|---|---|---|---|---|")
        for h in HORIZONS:
            st = c[h]
            g = st["gate"]
            gs = "/".join("".join("1" if g[s][k] else "0" for k in ("c1_holm", "c2_bar", "c3_placebo", "c4_halves", "c5_trim", "c6_beta", "c7_instruments"))
                          for s in ("continuation", "reversal"))
            L.append(f"| {h} | {st['n']} | {_f(st['est'])} | [{_f(st['lo'])}, {_f(st['hi'])}] | {st['power']['mde']:.3f} "
                     f"({st['power']['power_verdict']}) | {st['bar']:.2f} | {st['p_holm']:.4f} | {_f(st['t_stat'], 2)} | {gs} | "
                     f"{res['ids'][idn]['cell_verdicts'][h]} |")
        L.append("\nGate string = conditions c1..c7 as 1/0 (c1 Holm p, c2 bar, c3 placebo 97.5/2.5 pct, c4 halves, c5 top-1% "
                 "clusters removed, c6 drift-adjusted β, c7 ≥ 3 of 5 instruments); continuation / reversal.\n")
    L.append("## Controls (placebo, drift, concentration, sensitivities)\n")
    L.append("| id | h | placebo mean | placebo 2.5-97.5 | pct | halves | top-1% removed (p) | β drift-adj [CI] | last 3y | instruments |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for idn in IDS:
        for h in HORIZONS:
            st = res["ids"][idn]["cells"][h]
            L.append(f"| {idn.split('-')[2]} | {h} | {_f(st['placebo_mean'])} | {_f(st['placebo_q025'])} .. {_f(st['placebo_q975'])} | "
                     f"{st['placebo_pct']:.1f} | {_f(st['half1'])} / {_f(st['half2'])} | {_f(st['trim_est'])} ({st['trim_p']:.3f}) | "
                     f"{_f(st['beta'])} [{_f(st['beta_lo'])}, {_f(st['beta_hi'])}] | {_f(st['last3_est'])} | "
                     + ", ".join(f"{k} {_f(v, 2)}" for k, v in st["inst_means"].items()) + " |")
    L.append("\n**Sensitivities** (estimate [CI]):\n")
    for idn in IDS:
        for h in HORIZONS:
            s = res["ids"][idn]["cells"][h]["sensitivities"]
            L.append(f"- {idn.split('-')[2]} {h}: " + "; ".join(
                f"{k} {_f(v.get('est'))} [{_f(v.get('lo'))}, {_f(v.get('hi'))}]" for k, v in s.items()))
    L.append("\n## Power run (committed before scoring; reads no event outcome)\n")
    L.append(f"Placebo within-event ρ̄ (h2, signed legs): {power.get('rho_bar_placebo_h2', float('nan')):.3f} "
             f"(the prereg table assumed 0.45).\n")
    L.append("| cell | n events | placebo SE | MDE (α 0.0125) | bar | verdict | power at bar | recovery ok | null rejection | placebo mean ok |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for k, v in power["cells"].items():
        L.append(f"| {k} | {v['n_events']} | {v['boot_se_median']:.4f} | {v['mde']:.3f} | {v['bar']:.2f} | {v['power_verdict']} | "
                 f"{v['power_at_bar']:.2f} | {v['checks']['recovery_within_0.25bar']} | {v['positive_control']['0xbar']['reject_0.05']:.3f} | "
                 f"{v['checks']['placebo_mean_within_0.5bar']} |")
    L.append("\n## Trading view (R at a 0.5σ stop; descriptive)\n")
    L.append("| id | h | rows | unresolved | R gross | R net | placebo-entry R | gross − placebo | net R event CI | P(win) | E[win] | E[loss] | stop rate | MAE / MFE median (σ) |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for idn in IDS:
        for h in HORIZONS:
            r = res["ids"][idn]["cells"][h]["R"]
            L.append(f"| {idn.split('-')[2]} | {h} | {r['rows']} | {r['unresolved_rows']} | {_f(r['mean_R_gross'])} | {_f(r['mean_R_net'])} | "
                     f"{_f(r['placebo_entry_R'])} | {_f(r['gross_minus_placebo'])} | [{_f(r['net_R_event_ci'][0])}, {_f(r['net_R_event_ci'][1])}] | "
                     f"{r['p_win']:.2f} | {_f(r['E_win'], 2)} | {_f(r['E_loss'], 2)} | {r['stop_rate']:.2f} | {r['MAE_median']:.2f} / {r['MFE_median']:.2f} |")
    L.append("\n## Deviations from the prereg\n")
    L += [f"- {d}" for d in deviations] or ["- None."]
    L.append("\n## Descriptive (not part of the verdict)\n")
    for idn in IDS:
        sl = res["slices"][idn]
        ch = sl["chance"]
        L.append(f"**{idn} slices** (BH q 0.10): {sl['bh_survivors']} survive; {ch['passes']} of {ch['tests']} at p < 0.05 "
                 f"vs {ch['expected']:.1f} expected by chance (P ≥ that: {ch['p_at_least']:.3f}). Survivors are candidates for "
                 "their own prereg, never results.\n")
        L.append("| slice | n | est | CI | p | BH |")
        L.append("|---|---|---|---|---|---|")
        for k, v in sl["cells"].items():
            L.append(f"| {k} | {v['n']} | {_f(v['est'])} | [{_f(v.get('lo'))}, {_f(v.get('hi'))}] | "
                     f"{_p(v['p'])} | {'yes' if v.get('bh_q10') else ''} |")
        L.append("")
    d = res["descriptive"]
    L.append("In-line events (s = 0), unsigned USD-positive-direction σ return: " +
             ", ".join(f"{h} {_f(v['mean'])} (n {v['n']})" for h, v in d["in_line_unsigned_sigma"].items()))
    L.append("\nB0 (placebo, d-direction mean σ return per instrument): " +
             "; ".join(f"{h}: " + ", ".join(f"{k} {_f(v)}" for k, v in m.items()) for h, m in d["B0_placebo_inst"].items()))
    L.append("\nBy year (h2): " + "; ".join(f"{idn.split('-')[2]}: " + ", ".join(f"{y} {_f(v, 2)}" for y, v in res['ids'][idn]['cells']['h2']['by_year'].items()) for idn in IDS))
    L.append("\n## Data\n")
    L += coverage
    L += [f"- {n}" for n in notes]
    L.append("\n## What this changes\n")
    L.append("Per prereg §8, by the verdict words above: VALIDATED → a research-only decaying lean at the passing horizon "
             "and a forward-record prereg; CONTEXT → a release-day page line with size and interval, never a trade; "
             "NULL → the desk stops saying \"trade the surprise\"; UNDERPOWERED → recorded with power.json, more release "
             "families as one family is the next design.")
    (out_dir / "RESULTS.md").write_text("\n".join(L) + "\n")
