"""Tables for analysis/output/regime-picks-rule/RESULTS.md from results.json (the prose sections are written by hand).

    python -X utf8 -I scripts/regime-picks-rule/report.py > analysis/output/regime-picks-rule/tables.md
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
r = json.loads((ROOT / "analysis/output/regime-picks-rule/results.json").read_text())
f = lambda x, p=4: "—" if x is None else f"{x:+.{p}f}"
L = []
L += ["### Scored cells", "", "| Cell | n rows / dates | Estimate (R per inst-session) | 95% CI | SE used | MDE | Bar | "
      "Holm p | H1 / H2 | shuffle 97.5th / real pct | plant detect | Gates failed | Cell verdict |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
for c in r["cells"]:
    failed = ", ".join(k for k, v in c["gates"].items() if not v) or "none"
    L.append(f"| {c['cell']} | {c['n_rows']:,} / {c['n_dates']:,} | {f(c['est'])} | [{f(c['lo'])}, {f(c['hi'])}] | "
             f"{c['se']:.4f} | {c['mde']:.4f} | {c['bar']:+.2f} | {c['holm_p']:.3f} | {f(c['H1'])} / {f(c['H2'])} | "
             f"{f(c['shuffle_p97_5'])} / {c['shuffle_pct']:.0f} | {c['detected']:.0%} | {failed} | **{c['verdict']}** |")
L += ["", f"Family verdicts: " + ", ".join(f"`{k}` **{v}**" for k, v in r["family_verdicts"].items()), ""]
h = r["hmm_minus_chain"]
L += [f"G5 (HMM book − chain book): {f(h['est'])} [{f(h['lo'])}, {f(h['hi'])}].", ""]
L += ["### Always-on rules and the regime-free picker (test period)", "",
      "| Book | R per inst-session | 95% CI | trade rate | R per trade |", "|---|---|---|---|---|"]
for k, v in r["always"].items():
    L.append(f"| always {k} | {f(v['est'])} | [{f(v['lo'])}, {f(v['hi'])}] | {v['trade_rate']:.0%} | {f(v['per_trade'])} |")
b = r["book0"]
L.append(f"| regime-free picker | {f(b['est'])} | [{f(b['lo'])}, {f(b['hi'])}] | — | picks per refit: {', '.join(sorted(set(b['picks'])))} |")
L += ["", "### Regime book vs each rule alone (book − always-k)", "", "| Family | − FADE | − FOLLOW | − BREAK | flat share | pick shares |",
      "|---|---|---|---|---|---|"]
for F, fo in r["families"].items():
    vr = fo["vs_rule"]
    ps = ", ".join(f"{k} {v:.0%}" for k, v in fo["pick_share_test"].items())
    L.append(f"| {F} | {f(vr['FADE']['est'])} [{f(vr['FADE']['lo'])}, {f(vr['FADE']['hi'])}] | "
             f"{f(vr['FOLLOW']['est'])} [{f(vr['FOLLOW']['lo'])}, {f(vr['FOLLOW']['hi'])}] | "
             f"{f(vr['BREAK']['est'])} [{f(vr['BREAK']['lo'])}, {f(vr['BREAK']['hi'])}] | {fo['flat_share_test']:.0%} | {ps} |")
L += ["", "### Regime × rule, net R per instrument-session on the test period (BH q = 0.10 over each family's cells)", "",
      "| Family | Regime | test share | n | FADE | FOLLOW | BREAK |", "|---|---|---|---|---|---|---|"]
for F, fo in r["families"].items():
    by = {}
    for x in fo["regime_x_rule"]:
        by.setdefault(x["regime"], {})[x["rule"]] = x
    for reg, d in by.items():
        cell = lambda k: (f"{f(d[k]['est'], 3)} [{f(d[k]['lo'], 3)}, {f(d[k]['hi'], 3)}]" + (" ★" if d[k].get("bh_q10") else "")) if k in d else "—"
        n = next(iter(d.values()))["n"]
        L.append(f"| {F} | {reg} | {fo['label_share_test'].get(reg, 0):.0%} | {n:,} | {cell('FADE')} | {cell('FOLLOW')} | {cell('BREAK')} |")
L += ["", "★ = survives BH q = 0.10 (a candidate, never a result).", ""]
L += ["### Picks per quarterly refit", ""]
for F, fo in r["families"].items():
    seq = [" / ".join(f"{k}:{v}" for k, v in p.items()) for p in fo["picks"]]
    uniq = []
    for i, s in enumerate(seq):
        if not uniq or uniq[-1][1] != s:
            uniq.append((r["refits"][i], s))
    L.append(f"- **{F}**: " + "; ".join(f"from {d}: {s}" for d, s in uniq))
L.append(f"- **regime-free**: " + "; ".join(f"{d}: {p}" for d, p in zip(r["refits"], r["book0"]["picks"]) if True)[:600])
L += ["", "### Controls", ""]
for F, fo in r["families"].items():
    pl = fo["plant"]
    L.append(f"- **{F}** planted (bar-sized regime×rule edge, full re-pick, 40 plants): C1 detected {pl['C1']['detected']:.0%} "
             f"(mean recovered {f(pl['C1']['mean_recovered'])}), C2 detected {pl['C2']['detected']:.0%} "
             f"(mean recovered {f(pl['C2']['mean_recovered'])}). Label-block shuffle: C1 mean {f(fo['shuffle']['C1']['mean'])} "
             f"sd {fo['shuffle']['C1']['sd']:.4f}; C2 mean {f(fo['shuffle']['C2']['mean'])} sd {fo['shuffle']['C2']['sd']:.4f}.")
c = r["canaries"]
L.append(f"- Leak canaries: smoothed HMM labels → C1 {f(c['hmm_smoothed']['C1'])}, C2 {f(c['hmm_smoothed']['C2'])} "
         f"(labels agree with filtered {c['hmm_smoothed']['label_agreement_with_filtered']:.0%}); realised-day label → "
         f"C1 {f(c['realised_day']['C1'])}, C2 {f(c['realised_day']['C2'])}.")
L += ["", "### Evidence-pack diagnosis labels", ""]
for k, v in r["evidence_packs"].items():
    pc = next((x for x in v["plant"] if x["multiple_of_bar"] == 1.0), None)
    L.append(f"- `{k}`: {v['label']} (pack plant 1× detected {pc['detected_share']:.0%}; canary {f(v['canary']['estimate_with_leak'])} vs clean {f(v['canary']['estimate_clean'])})")
L += ["", "### By asset group (C1 / C2)", "", "| Family | group | n | C1 [CI] | C2 [CI] |", "|---|---|---|---|---|"]
for x in r["descriptive"]["by_group"]:
    L.append(f"| {x['fam']} | {x['group']} | {x['n']:,} | {f(x['C1'])} [{f(x['C1_lo'])}, {f(x['C1_hi'])}] | {f(x['C2'])} [{f(x['C2_lo'])}, {f(x['C2_hi'])}] |")
L += ["", "### By instrument, always-on rules (R per instrument-session; per trade in brackets)", "",
      "| inst | FADE | FOLLOW | BREAK |", "|---|---|---|---|"]
for x in r["always_by_inst"]:
    L.append(f"| {x['inst']} | {f(x['FADE'], 3)} ({f(x['FADE_per_trade'], 3)}) | {f(x['FOLLOW'], 3)} ({f(x['FOLLOW_per_trade'], 3)}) | {f(x['BREAK'], 3)} ({f(x['BREAK_per_trade'], 3)}) |")
bi = [x for x in r["descriptive"]["by_inst"] if x["bh_q10"]]
L += ["", f"By instrument C2 cells surviving BH q = 0.10: {len(bi)} of {len(r['descriptive']['by_inst'])}"
      + (": " + ", ".join(f"{x['fam']}/{x['inst']} {f(x['C2'])}" for x in bi) if bi else "."), ""]
L += ["### By year (C1 / C2)", "", "| Family | " + " | ".join(str(y) for y in sorted({x['year'] for x in r['descriptive']['by_year']})) + " |",
      "|---|" + "---|" * len({x['year'] for x in r['descriptive']['by_year']})]
for F in r["families"]:
    ys = sorted([x for x in r["descriptive"]["by_year"] if x["fam"] == F], key=lambda x: x["year"])
    L.append(f"| {F} | " + " | ".join(f"{x['C1']:+.3f} / {x['C2']:+.3f}" for x in ys) + " |")
L += ["", "### Exits / skips on the test period", ""]
for k, v in r["exit_or_skip_reasons_test"].items():
    L.append(f"- {k}: " + ", ".join(f"{a} {b:,}" for a, b in v.items()))
L += ["", "### Build", "", f"- Open mismatch share (forecast-history open vs first M1 mid open): {r['open_mismatch_share']:.4f}",
      f"- Rows dropped for a missing regime label: {r['build'].get('dropped_no_label')}",
      "- Session skips by instrument: " + "; ".join(f"{k} {v}" for k, v in r["build"]["skips"].items())]
hk = {i: sorted({v['K'] for v in d.values()}) for i, d in r["build"]["hmm"].items()}
L.append("- HMM K chosen per instrument (across yearly folds): " + "; ".join(f"{i} {k}" for i, k in hk.items()))
fr = [v["flip_rate"] for d in r["build"]["hmm"].values() for v in d.values()]
L.append(f"- HMM filtered-label daily flip rate: median {sorted(fr)[len(fr) // 2]:.3f} (range {min(fr):.3f}–{max(fr):.3f})")
print("\n".join(L))
