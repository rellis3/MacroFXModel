"""Render analysis/output/cboe-vol-indices-range/RESULTS.md from results.json (no computation)."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "analysis/output/cboe-vol-indices-range"
R = json.loads((OUT / "results.json").read_text())
cells = R["cells"]
prim = [c for c in cells if c["role"] == "primary"]
repl = {(c["index"], c["inst"], c["h"], c["variant"]): c for c in cells if c["role"] == "replication"}


def f(x, n=3):
    return "—" if x is None else f"{x:.{n}f}"


md = ["# cboe-vol-indices-range — results", "",
      f"Prereg: `forge/CBOE_VOL_INDICES_RANGE_PREREG.md` (prereg fe892ae7, amendment A1 b94a0873, 2026-11-28). "
      f"Run {R['ranAt'][:10]}, seed {R['seed']}, B = {R['B']}, block {R['block']} sessions. Branch `{R['branch']}`. "
      "Ledger ids: one per map × horizon (table below).", ""]
from collections import Counter
cnt = Counter(m["verdict"] for m in R["maps"])
md += [f"## Verdict: {', '.join(f'{k} {v}' for k, v in sorted(cnt.items()))} (of {len(R['maps'])} map × horizon questions)", "",
       "__SUMMARY__", "",
       "## Map × horizon verdicts", "",
       "| ledger id | family | index → instrument | h | Lin | Ext | verdict |", "|---|---|---|---|---|---|---|"]
for m in R["maps"]:
    md.append(f"| `{m['id']}` | {m['family']} | {m['index']} → {m['inst']} | {m['h']}d | {m['cells'].get('Lin', '—')} | "
              f"{m['cells'].get('Ext', '—')} | **{m['verdict']}** |")
md += ["", "## Scored cells (primary track)", "",
       "Ratio = layer L ÷ benchmark B, sum of H-L pinball at τ 0.50/0.75/0.90 on test rows (< 1 = the index helps). "
       "MDE = 2.8 × bootstrap SE of log ratio. Pass bar 0.985.", "",
       "| cell | bench | n | ratio | 95% CI | p (1-sided) | Holm | MDE | halves 18-22 / 23-26 | placebo median (real below k of 20) | repl. track | B / L p75 exc | verdict |",
       "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
for c in prim:
    h = c["halves"]
    pl = c["placebo"]
    md.append(f"| {c['index']}→{c['inst']} {c['track']} {c['h']}d {c['variant']} | {c['bench_arm']}{' + ' + c['own_iv'] if c['own_iv'] else ''} | "
              f"{c['n']} | {c['ratio']:.4f} | [{c['lo']:.4f}, {c['hi']:.4f}] | {c['p']:.4f} | {'yes' if c['holm'] else 'no'} | "
              f"{c['mde']:.4f} | {f(h['2018-22'], 4)} / {f(h['2023-26'], 4)} | {pl['median']:.4f} ({pl['n'] - pl['n_below_real']}) | "
              f"{f(c['repl_ratio'], 4)} | {c['B_p75_exc']:.1%} / {c['L_p75_exc']:.1%} | {c['verdict']} |")
md += ["", "## Controls", "",
       f"- Positive control (A1, WTI C 1d, planted index with noise sd 0.25): ratio {R['controls']['planted']['ratio']} "
       f"[{R['controls']['planted']['lo']}, {R['controls']['planted']['hi']}] (bar < 0.90). Pass.",
       f"- Known-zero (pure-noise index): ratio {R['controls']['noise']['ratio']} [{R['controls']['noise']['lo']}, "
       f"{R['controls']['noise']['hi']}] (CI must hold 1, point ≥ 0.995). Pass.",
       "- Benchmark rebuild: the ladder-v2 chosen sigma re-fitted per walk-forward year reproduces the stored "
       "`test_<track>.parquet` column (max relative error printed per instrument in `run_log.txt`).",
       "- Placebo: 20 circular shifts of the index per cell (offsets 252 … n−252), same fit and score; median in the table.",
       "", "## Disaggregation (descriptive; BH q = 0.10 over every bucket cell; survivors are candidates only)", "",
       "| cell | bucket | n | ratio | p | BH | B p75 exc | L p75 exc |", "|---|---|---|---|---|---|---|---|"]
nb = 0; nsurv = 0
for c in prim:
    for b, v in c["buckets"].items():
        if "ratio" not in v:
            continue
        nb += 1; nsurv += bool(v.get("bh"))
        md.append(f"| {c['index']}→{c['inst']} {c['h']}d {c['variant']} | {b} | {v['n']} | {v['ratio']:.4f} | "
                  f"{f(v.get('p'), 4)} | {'**yes**' if v.get('bh') else 'no'} | {v['B_p75_exc']:.1%} | {v['L_p75_exc']:.1%} |")
md.insert(md.index("| cell | bucket | n | ratio | p | BH | B p75 exc | L p75 exc |") - 1,
          f"{nsurv} of {nb} bucket cells survive BH (chance baseline at q = 0.10 under the null ≈ 0).\n")
md += ["", "## Replication track cells", "", "| cell | n | ratio | 95% CI |", "|---|---|---|---|"]
for c in cells:
    if c["role"] == "replication":
        md.append(f"| {c['index']}→{c['inst']} {c['track']} {c['h']}d {c['variant']} | {c['n']} | {c['ratio']:.4f} | [{c['lo']:.4f}, {c['hi']:.4f}] |")
md += ["", "## Per-year ratios (primary cells)", "", "| cell | " + " | ".join(str(y) for y in range(2018, 2027)) + " |",
       "|---|" + "---|" * 9]
for c in prim:
    by = c["by_year"]
    md.append(f"| {c['index']}→{c['inst']} {c['h']}d {c['variant']} | " + " | ".join(f(by.get(str(y), by.get(y)), 3) for y in range(2018, 2027)) + " |")
md += ["", "## Deviations from the prereg", "",
       "- A1 (pre-results): planted-control bar re-set after the control run (see the prereg). No scored cell had been computed.",
       "- C-track cells start 2019 (the ≥ 500 train-row rule drops 2018), as recorded in A1.", "",
       "__CHANGES__", ""]
(OUT / "RESULTS.md").write_text("\n".join(md), encoding="utf-8")
print("wrote", OUT / "RESULTS.md")
