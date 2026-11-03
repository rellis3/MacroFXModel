// Tests for js/theoryDesk.js.   node js/theoryDesk.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseRegister, opsReport, bankingDraft, outline, section, readingList, screen, validateTheories } from './theoryDesk.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const REG = `# Register
## Active
| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| old-study | Does the London open widen gold ranges | RUNNING | b1 | 2026-09-01 | \`forge/OLD_PREREG.md\` | — | — | waiting on data |
| done-not-banked | NQ drift after CPI | REGISTERED | b2 | 2026-11-01 | \`forge/NEW_PREREG.md\` | \`analysis/output/new/RESULTS.md\` | — | write up |
| banked-no-ledger | Yen carry and VIX | BANKED | main | 2026-10-30 | | \`analysis/output/carry/RESULTS.md\` | | closed |
| explore-1 | Exploratory: NQ event-day width | EXPLORATORY | main | 2026-11-02 | | | | Candidate: shadow (needs owner OK) |
## Done
| ID | Question | Status | Branch | Updated | Prereg | Results | Ledger | Next |
|---|---|---|---|---|---|---|---|---|
| fx-carry | FX carry factor on G10 | BANKED | main | 2026-10-01 | | | fx-carry | closed |
`;

t('register rows by section, with statuses', () => {
  const rows = parseRegister(REG);
  assert.equal(rows.length, 5); assert.equal(rows[0].prereg, 'forge/OLD_PREREG.md'); assert.equal(rows[4].section, 'Done');
});

t('ops: stale, ready to bank, banked with no ledger, orphan preregs, exploratory candidates', () => {
  const rows = parseRegister(REG), have = new Set(['analysis/output/new/RESULTS.md', 'forge/NEW_PREREG.md', 'forge/OLD_PREREG.md', 'forge/ORPHAN_PREREG.md']);
  const r = opsReport(rows, { files: [...have], exists: p => have.has(p), today: '2026-11-03' });
  assert.deepEqual(r.stale.map(x => x.id), ['old-study']); assert.equal(r.stale[0].days, 63);
  assert.deepEqual(r.readyToBank.map(x => x.id), ['done-not-banked']); assert.match(r.readyToBank[0].draft, /id: 'done-not-banked'/);
  assert.deepEqual(r.noLedger.map(x => x.id), ['banked-no-ledger']);
  assert.deepEqual(r.orphanPreregs, ['forge/ORPHAN_PREREG.md']);
  assert.deepEqual(r.exploratory.map(x => x.id), ['explore-1']);
  assert.equal(r.counts.BANKED, 2);
});

t('the real register parses', () => {
  const p = new URL('../plans/RESEARCH_REGISTER.md', import.meta.url);
  if (!existsSync(p)) return;
  const rows = parseRegister(readFileSync(p, 'utf8'));
  assert.ok(rows.length > 10, `only ${rows.length} rows`); assert.ok(rows.every(r => r.id && r.status));
});

t('sources: outline, section, reading list', () => {
  const md = '# T\n## 1. One\ntext\n### 1a\nmore\n## 2. Two\nother';
  assert.equal(outline(md), '- 1. One\n- 1a\n- 2. Two');
  assert.equal(section(md, '1. One'), '## 1. One\ntext\n### 1a\nmore');
  assert.equal(readingList('topic,title,authors,year\nVol,"Range, rough",A; B,2023\n'), '- Vol: Range, rough (2023)');
});

const good = { title: 'Head disagreement and the day score', variable: 'share of desk cards the Head flipped', condition: 'top tercile', horizons: '1, 3, 5 days', outcome: 'day score S', benchmark: 'bottom tercile days', placebo: 'shuffled flip shares', data: 'desk_run_score', power: '~40 days: too few', source: 'attribution', whyNew: 'not tested', priority: 'low' };
t('validation: needs a variable, benchmark and placebo; result wording is noted', () => {
  assert.equal(validateTheories({ headline: 'x', theories: [{ title: 'no placebo', variable: 'v', benchmark: 'b' }] }).ok, false);
  const v = validateTheories({ headline: 'x', theories: [good, { ...good, title: 'it works', priority: 'urgent' }] });
  assert.ok(v.ok); assert.equal(v.value.theories[1].priority, 'medium'); assert.equal(v.notes.length, 1);
});

t('screen flags a near-repeat of a register row or a ledger entry', () => {
  const rows = parseRegister(REG);
  const s = screen([{ ...good, title: 'FX carry factor', variable: 'G10 carry factor', condition: 'carry' }, good], rows, [{ id: 'cpi-drift', verdict: 'null', claim: 'NQ drift after CPI' }]);
  assert.equal(s[0].near[0].id, 'fx-carry'); assert.equal(s[1].near.length, 0);
});

console.log(`theoryDesk: ${n} tests passed`);
