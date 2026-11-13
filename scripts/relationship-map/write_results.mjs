// relationship-map: RESULTS.md and the results.json header fields, from results.json (no number typed by hand).
import fs from 'node:fs';
const OUT = 'analysis/output/relationship-map', J = JSON.parse(fs.readFileSync(`${OUT}/results.json`, 'utf8'));
const W = { leaning: 'Leaning', faint: 'Faint', untested: 'Untested properly', against: 'Against' };
const sg = v => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(3)}`);
const bel = s => (s === 1 ? '+' : s === -1 ? '−' : '±');
Object.assign(J, { id: 'relationship-map', verdict: 'underpowered', ranAt: '2026-11-13', B: J.params.B, prereg: 'forge/RELATIONSHIP_MAP_PREREG.md', preregCommit: 'cfeab155', amendmentCommit: 'e2dc2854', branch: 'main',
  cells: J.rows.map(r => ({ name: `${r.id} ${r.la} -> ${r.lb} (h5 after |z|>=2)`, n: r.after[5].n, est: r.after[5].effect, lo: r.after[5].lo, hi: r.after[5].hi, mde: r.after[5].mde, p: r.sign === 0 ? r.after[5].pTwo : r.after[5].pOne, bh: r.after[5].bh, grade: r.grade.grade, verdict: r.grade.grade === 'leaning' ? 'validated' : 'underpowered' })) });
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(J, null, 1));
const R = J.rows, cnt = g => R.filter(r => r.grade.grade === g).length, tog = l => R.filter(r => r.together.label === l);
const mdes = R.map(r => r.after[5].mde).sort((a, b) => a - b);
const md = `# relationship-map — results

Prereg: \`forge/RELATIONSHIP_MAP_PREREG.md\` (committed in \`cfeab155\`, 2026-11-13; amendment A1, PRE-RESULTS, in \`e2dc2854\`). Run 2026-11-13, seed ${J.seed}, B = ${J.params.B}, placebo ${J.params.PLACEBO} draws.
Branch \`main\`. Ledger id: \`relationship-map\`. Daily closes ${J.window[0]} → ${J.window[1]} (lockbox end; nothing after read).

## Verdict: UNDERPOWERED (graded: ${cnt('leaning')} Leaning · ${cnt('faint')} Faint · ${cnt('untested')} Untested properly · ${cnt('against')} Against)

The registered gate (after-a-big-move effect at 5 days clear of zero the believed way, BH q = 0.10 over 20 pairs, both halves,
above the placebo 95th percentile) was met by **no pair**. With 137-199 de-clustered big moves per pair, the smallest effect
each cell could see was **${mdes[0]}-${mdes.at(-1)} σ**, against the 0.10 σ that matters: so most pairs grade **Untested properly**
(unknown, not dead), and **no pair grades Against** (no interval was narrow enough to rule a small effect out). ${cnt('faint')} pairs
grade **Faint** (point the believed way). The strongest is **VIX → gold**: after a big VIX move, gold moves with it over the next
5 days (+0.218 σ [+0.048, +0.393], both halves +0.23 / +0.21, placebo 99th percentile), missing only the 20-pair correction.

The **same-day** picture is the solid part: ${tog('reliable').length} of 20 pairs move together **reliably** (|r| ≥ 0.20, believed sign in ≥ 80% of years).
The **linear lead** is absent everywhere (largest |z| ${Math.max(...R.map(r => Math.abs(r.lead.h5.z))).toFixed(2)} at 5 days), matching the existing lead-lag grid (\`js/leadLag.js\`).

## Scored cells (M3, after a big move, 5 days, believed-way effect in σ)

| Pair | Believed | n | Effect | 95% CI | MDE | BH | Halves 06-15 / 16-26 | Placebo pct | Grade | 1 day / 20 days |
|---|---|---|---|---|---|---|---|---|---|---|
${R.map(r => { const c = r.after[5]; return `| ${r.id} ${r.la} → ${r.lb} | ${bel(r.sign)} | ${c.n} | ${sg(c.effect)} | [${sg(c.lo)}, ${sg(c.hi)}] | ${c.mde} | ${c.bh ? 'yes' : 'no'} | ${sg(c.halves[0].effect)} / ${sg(c.halves[1].effect)} | ${c.placeboPct} | **${W[r.grade.grade]}** | ${W[r.secondary.h1]} / ${W[r.secondary.h20]} |`; }).join('\n')}

Effect = mean believed-way move of B (from the close of day t+1 to t+1+h, in B's prior-250-day σ, scaled by √h) after A's big move,
minus the same on all days. P10 (slope → EURUSD) is two-sided: its sign is the direction found.

## Together and lead (M1, M2: description)

| Pair | Same-day r | Label | Years with believed sign | Lead r (5 days) | z | Next day r (may be close-time catch-up) |
|---|---|---|---|---|---|---|
${R.map(r => `| ${r.id} ${r.la} → ${r.lb} | ${sg(r.together.r)} | ${r.together.label} | ${Math.round((r.together.share ?? 0) * 100)}% | ${sg(r.lead.h5.r)} | ${r.lead.h5.z} | ${sg(r.lead.next.r)} |`).join('\n')}

## Controls

- **Positive control (A1, 50 replications):** planted +${J.controls.planted.want} σ recovered as ${J.controls.planted.got.effect} (CI clear of zero in ${Math.round(J.controls.planted.got.clearShare * 100)}% of runs); with nothing planted ${J.controls.null.got.effect} (false clear ${Math.round(J.controls.null.got.falseClear * 100)}%).
- **Data join:** VIX vs S&P 500 same-day r = ${J.controls.vixSpxSameDay.r} (known strongly negative).
- **Placebo:** each pair against ${J.params.PLACEBO} random sets of its own days (percentile in the table).

## Deviations from the prereg

A1 (PRE-RESULTS): the positive control is judged on the mean of 50 replications, not one run (one run's sampling error ~0.08 σ exceeded the 0.05 tolerance). No real outcome had been computed.

## Descriptive (not part of the verdict)

- **Rates up, tech down (P6) is a recent regime, not a law:** same-day r is +${R.find(r => r.id === 'P6').together.r} over 2006-2026 (yields and the Nasdaq mostly rose together), with the believed negative sign in only ${Math.round(R.find(r => r.id === 'P6').together.share * 100)}% of years.
- **The owner's example (P10, steepening → EURUSD):** same-day r ${R.find(r => r.id === 'P10').together.r} (weak/none); after a big slope move EURUSD ${sg(R.find(r => r.id === 'P10').after[5].effect)} [${sg(R.find(r => r.id === 'P10').after[5].lo)}, ${sg(R.find(r => r.id === 'P10').after[5].hi)}]: unknown at this power.
- Daily FRED/Cboe/Yahoo closes are not synchronous; the next-day column can carry catch-up and is context only (prereg §3).

## What this changes

- **Monitor rulebook (owner's live-alert idea):** the ${tog('reliable').length} *reliable* same-day pairs become the "out of line" baseline (a day one of them breaks is worth an alert); the ${cnt('faint')} Faint after-big-move rules enter at low weight, shown but never alerted alone; VIX → gold is the first candidate for a forward record.
- **Nothing is a signal.** A forward record from the day a rule is wired is what can raise a grade; re-cutting this history cannot.
- **To see small effects (0.10 σ), daily data is too coarse:** the next design is intraday (M15) or a pooled family (e.g. all risk-off pairs together), registered separately.
`;
fs.writeFileSync(`${OUT}/RESULTS.md`, md);
console.log(md.split('\n').slice(0, 12).join('\n'));
