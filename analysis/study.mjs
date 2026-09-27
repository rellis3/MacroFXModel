#!/usr/bin/env node
/**
 * The four steps, as a tool you can run without an assistant.
 *
 * WHY THIS EXISTS. This desk's method is pre-register → harness → control → ledger, and
 * until now it lived in habit and in whoever was driving. Habit is exactly what fails at
 * the moment it matters: the run that comes back exciting is the run you least want to
 * be trusting your memory of what you expected beforehand. So the sequence is made
 * mechanical, and the machine refuses the shortcuts rather than relying on discipline.
 *
 * WHAT IT ENFORCES, and each of these is a mistake this repo has actually made:
 *
 *   1. A RESULT CANNOT BE BANKED WITHOUT A PRE-REGISTRATION THAT PREDATES IT.
 *      Checked against git, not against a date typed into a file. If the prereg is
 *      uncommitted, or was committed after the results were written, `bank` refuses.
 *      This is the whole ballgame: an expectation written after seeing the numbers is
 *      not an expectation, and nothing else here protects you from that.
 *
 *      WHAT THIS DOES AND DOES NOT PROVE. A commit timestamp is a lower bound on when
 *      the expectation was FINALISED, not on when it was written. Run against this
 *      repo's own history, most existing studies fail it by a minute or two: the prereg
 *      was written first and honestly, then committed in the same batch as the results.
 *      That is not evidence of fudging and this tool does not claim it is. What it means
 *      is that the ordering was never PROVABLE, and going forward it is — commit the
 *      prereg on its own, and the record can be checked by anyone later, including you
 *      when you have forgotten what you expected.
 *
 *   2. THE HARNESS SHIPS WITH ITS CONTROL. The template cannot run without one, because
 *      the single most common way to fool yourself is a hit rate with no base rate --
 *      54.1% looks like an edge until you find the market does 54.1% anyway.
 *
 *   3. AN EVENT FLOOR, AND "UNTESTABLE" AS A REAL OUTCOME. Below the floor the cell
 *      reports UNTESTABLE, which is not a null. Dr Copper fired 5 times against a floor
 *      of 6; calling that "null" would have been a claim the data could not support.
 *
 *   4. THE VERDICT IS COMPUTED, NOT TYPED. `bank` takes it from the harness's own JSON,
 *      so the gate written down in step one is the gate that decides.
 *
 * Usage, offline, no keys needed for the scaffolding itself:
 *   node analysis/study.mjs new  <id> "<one-line claim>"   scaffold prereg + harness
 *   node analysis/study.mjs check <id>                     is this ready to bank?
 *   node analysis/study.mjs bank  <id>                     append to the ledger
 *   node analysis/study.mjs list                           every study and its state
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PREREG_DIR = path.join(ROOT, 'MD files');
const OUT_DIR = path.join(__dirname, 'output');
const LEDGER = path.join(ROOT, 'js', 'deskEvidence.js');

const preregPath = id => path.join(PREREG_DIR, `${id.toUpperCase().replace(/-/g, '_')}_PREREG.md`);
const harnessPath = id => path.join(__dirname, `${id.replace(/-/g, '_')}_study.mjs`);
const resultPath = id => path.join(OUT_DIR, `${id.replace(/-/g, '_')}.json`);

const git = (...args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
};

/** When was this path first committed? null if never. Seconds since epoch. */
function committedAt(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const out = git('log', '--diff-filter=A', '--format=%ct', '--', rel);
  if (!out) return null;
  return parseInt(out.split('\n').pop(), 10) || null;
}

const PREREG_TEMPLATE = (id, claim) => `# ${id.toUpperCase()} — ${claim}

**Pre-registered ${new Date().toISOString().slice(0, 10)}, before the harness was written or run.**

> Commit this file BEFORE writing the harness. \`study.mjs bank\` checks git and refuses a
> result whose pre-registration was committed afterwards.

## The claim

${claim}

State it in the words it was made in, including who made it and where, so the thing being
tested cannot drift into a friendlier version of itself.

## Why it is not already settled

What has been measured before, and why that does not answer this. If an existing result
LOOKS like it settles this, say precisely why it does not — a full-sample correlation
cannot see an effect that lives only at turning points, for instance.

## Definitions, fixed in advance

- **The setup**: exactly what counts as an instance. Include every threshold.
- **Knowable when?**: if the setup needs N bars to confirm, it is only knowable at N bars
  later, and every measurement starts there. This is the look-ahead that has bitten this
  repo more than once.
- **The outcome**: what is measured, over what horizon, from which bar.
- **The control**: what an ordinary period looks like, on the same instrument, same
  period. Without this a hit rate is meaningless.
- **De-clustering**: overlapping instances are not independent observations.
- **MIN_EVENTS**: __ per cell. Below it the cell is UNTESTABLE, which is NOT a null.

## Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | | |
| b | | |
| c | **THE GATE.** What must hold for this to count as real — both directions, both halves, or a mirror. | |

Writing the expectation down first is the point. A result that comes back against a
stated prior is worth something; one that confirms a prior you never wrote down is not.

## What this does NOT test

The parts of the claim this cannot reach, so the write-up cannot quietly claim them.
`;

const HARNESS_TEMPLATE = (id, claim) => `#!/usr/bin/env node
/**
 * ${id.toUpperCase()} — ${claim}
 *
 * Design frozen in MD files/${id.toUpperCase().replace(/-/g, '_')}_PREREG.md BEFORE this was written.
 *
 * Fill in the three marked sections. Everything else — control, bootstrap, halves,
 * the event floor and the verdict — is already wired, so the parts that are easy to
 * forget cannot be forgotten.
 *
 *   node analysis/${id.replace(/-/g, '_')}_study.mjs
 *   python scratchpad/runstudy.py analysis/${id.replace(/-/g, '_')}_study.mjs   (if it needs OANDA)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', '${id.replace(/-/g, '_')}.json');

// ── pre-registered constants — these must match the prereg exactly ───────────
const MIN_EVENTS = 30;
const HORIZONS = [5, 20];
const REPS = 1000, BLOCK = 5;

// ── stats: block bootstrap on the DIFFERENCE from control ────────────────────
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(Math.random() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(a, b) {
  if (a.length < MIN_EVENTS || b.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a, BLOCK)) - mean(draw(b, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length, diff: +(mean(a) - mean(b)).toFixed(4),
           lo: +lo.toFixed(4), hi: +hi.toFixed(4), real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
// TODO: load what the prereg says. Keep the loader boring and separate from the test.
const rows = [];

// ═══ 2. SETUP AND CONTROL ════════════════════════════════════════════════════
// TODO: fill setups. The control is every period NOT near a setup, on the same
// instrument over the same span — it is already excluded for you below, so do not
// hand-roll it.
const setups = [];                         // indices into rows
const near = new Set();
for (const i of setups) for (let k = i - Math.max(...HORIZONS); k <= i + Math.max(...HORIZONS); k++) near.add(k);

// ═══ 3. THE OUTCOME ══════════════════════════════════════════════════════════
// TODO: return the measured outcome at row i over n periods, or null.
const outcome = (i, n) => null;

// ── the run ──────────────────────────────────────────────────────────────────
const result = { id: '${id}', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS, cells: {} };
for (const H of HORIZONS) {
  const ev = [], ctl = [];
  for (const i of setups) { const v = outcome(i, H); if (v != null) ev.push(v); }
  for (let i = 0; i < rows.length - H; i++) { if (near.has(i)) continue; const v = outcome(i, H); if (v != null) ctl.push(v); }
  const cell = bootDiff(ev, ctl);
  result.cells['h' + H] = cell;
  console.log(\`H=\${H}: \` + (cell.untestable
    ? \`UNTESTABLE — \${cell.nA} events against a floor of \${MIN_EVENTS}. Not a null.\`
    : \`\${cell.diff >= 0 ? '+' : ''}\${cell.diff} [\${cell.lo}, \${cell.hi}] on n=\${cell.nA} vs \${cell.nB} controls — \${cell.real ? 'REAL' : 'null'}\`));
}

// ── the verdict, computed from the pre-registered gate ───────────────────────
// TODO: if the prereg's gate is stricter than "any cell real" — both directions, both
// halves, a mirror — encode it HERE. The verdict must come from the gate, never from
// reading the numbers afterwards.
const testable = Object.values(result.cells).filter(c => !c.untestable);
result.verdict = !testable.length ? 'UNTESTABLE' : testable.some(c => c.real) ? 'REAL' : 'NULL';
console.log('VERDICT: ' + result.verdict + (result.verdict === 'UNTESTABLE' ? ' — the question was not answered. This is not a null.' : ''));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('written ' + path.relative(process.cwd(), OUT));
`;

// ── commands ─────────────────────────────────────────────────────────────────
function cmdNew(id, claim) {
  if (!id || !claim) die('usage: study.mjs new <id> "<one-line claim>"');
  const p = preregPath(id), h = harnessPath(id);
  if (fs.existsSync(p)) die(`${path.relative(ROOT, p)} already exists — edit it rather than starting over`);
  fs.writeFileSync(p, PREREG_TEMPLATE(id, claim));
  if (!fs.existsSync(h)) fs.writeFileSync(h, HARNESS_TEMPLATE(id, claim));
  console.log(`pre-registration  ${path.relative(ROOT, p)}`);
  console.log(`harness           ${path.relative(ROOT, h)}`);
  console.log(`\nNEXT, and the order matters:`);
  console.log(`  1. fill in the prereg — expectations FIRST, before the harness has an answer`);
  console.log(`  2. git add + commit it on its own. bank refuses a prereg committed after the run`);
  console.log(`  3. fill the three TODO sections in the harness and run it`);
  console.log(`  4. node analysis/study.mjs bank ${id}`);
}

function state(id) {
  const p = preregPath(id), h = harnessPath(id), r = resultPath(id);
  const pAt = fs.existsSync(p) ? committedAt(p) : null;
  const rExists = fs.existsSync(r);
  let res = null; try { res = rExists ? JSON.parse(fs.readFileSync(r, 'utf8')) : null; } catch { /* unreadable */ }
  // `ranAt` is what the template writes; older harnesses in this repo used `at`, and
  // some wrote no timestamp at all. Fall back to the file's mtime rather than reporting
  // "the prereg came after the run" for a study whose JSON simply spells the key
  // differently — a false accusation from a checking tool is worse than no tool.
  const stamp = res?.ranAt ?? res?.at ?? null;
  const ranAt = stamp && Number.isFinite(Date.parse(stamp)) ? Math.floor(Date.parse(stamp) / 1000)
    : (rExists ? Math.floor(fs.statSync(r).mtimeMs / 1000) : null);
  const ranFrom = res?.ranAt ? 'ranAt' : res?.at ? 'at' : rExists ? 'file mtime' : null;
  return {
    id, prereg: fs.existsSync(p), preregCommitted: !!pAt, preregAt: pAt,
    harness: fs.existsSync(h), result: rExists, ranAt, ranFrom, verdict: res?.verdict ?? null,
    // the check that matters: was the expectation on the record before the answer existed?
    ordered: !!(pAt && ranAt && pAt < ranAt),
  };
}

function cmdCheck(id, quiet = false) {
  const s = state(id);
  const say = (ok, msg) => { if (!quiet) console.log(`  ${ok ? 'OK  ' : 'NO  '}${msg}`); return ok; };
  if (!quiet) console.log(`${id}:`);
  let ok = true;
  ok = say(s.prereg, 'a pre-registration exists') && ok;
  ok = say(s.preregCommitted, 'it is committed to git') && ok;
  ok = say(s.harness, 'a harness exists') && ok;
  ok = say(s.result, 'it has been run and wrote a result') && ok;
  ok = say(s.ordered, `the pre-registration was committed BEFORE the run${s.ranFrom === 'file mtime' ? ' (run time taken from the file mtime — the harness wrote no timestamp)' : ''}`) && ok;
  ok = say(!!s.verdict, `the harness computed a verdict${s.verdict ? ` (${s.verdict})` : ''}`) && ok;
  if (!quiet) console.log(ok ? '  → ready to bank' : '  → not bankable yet');
  return ok;
}

function cmdBank(id) {
  if (!cmdCheck(id)) die(`\nrefusing to bank ${id}. Fix the NO lines above.\n` +
    `If the order is wrong, the honest fix is to re-run AFTER committing the prereg — not to backdate it.`);
  const res = JSON.parse(fs.readFileSync(resultPath(id), 'utf8'));
  const verdict = ({ REAL: 'validated', NULL: 'null', UNTESTABLE: 'context' })[res.verdict] ?? 'context';
  const rel = path.relative(ROOT, preregPath(id)).replace(/\\/g, '/');
  const entry = `  {
    id: '${id}', domain: 'TODO', verdict: '${verdict}', date: '${new Date().toISOString().slice(0, 10)}', doc: '${rel}',
    claim: 'TODO — the claim as it was made, in its own words',
    result: 'TODO — the numbers, with intervals and n. Paste from ${path.relative(ROOT, resultPath(id)).replace(/\\/g, '/')}',
    use: 'TODO — what a page may and may not say because of this',
  },`;
  if (res.verdict === 'UNTESTABLE') {
    console.log('\nNOTE: the harness reported UNTESTABLE, so this banks as `context`, not `null`.');
    console.log('The question was not answered. Saying "null" would claim more than the data supports.');
  }
  console.log(`\nAdd to js/deskEvidence.js:\n\n${entry}\n`);
  console.log('Left for you to paste deliberately rather than written in automatically —');
  console.log('the claim and the "use" line are judgements, and a tool that guesses them');
  console.log('produces a ledger nobody trusts.');
}

function cmdList() {
  const ids = fs.existsSync(PREREG_DIR)
    ? fs.readdirSync(PREREG_DIR).filter(f => f.endsWith('_PREREG.md'))
        .map(f => f.replace(/_PREREG\.md$/, '').toLowerCase().replace(/_/g, '-'))
    : [];
  if (!ids.length) return console.log('no pre-registrations yet. Start one: study.mjs new <id> "<claim>"');
  console.log('id'.padEnd(34) + 'prereg  committed  run    ordered  verdict');
  for (const id of ids.sort()) {
    const s = state(id);
    const y = b => (b ? 'yes' : ' - ');
    console.log(id.padEnd(34) + y(s.prereg).padEnd(8) + y(s.preregCommitted).padEnd(11)
      + y(s.result).padEnd(7) + y(s.ordered).padEnd(9) + (s.verdict ?? ''));
  }
}

function die(msg) { console.error(msg); process.exit(1); }

// Only act as a CLI when RUN, not when imported for `state` -- otherwise importing the
// module to inspect a study prints the help text and returns nothing useful.
const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const [cmd, ...rest] = process.argv.slice(2);
if (isCli) switch (cmd) {
  case 'new': cmdNew(rest[0], rest.slice(1).join(' ')); break;
  case 'check': cmdCheck(rest[0]); break;
  case 'bank': cmdBank(rest[0]); break;
  case 'list': cmdList(); break;
  default:
    console.log(`the four steps, as a tool.\n
  study.mjs new  <id> "<claim>"   scaffold a pre-registration and a harness
  study.mjs check <id>            is it bankable? (prereg committed BEFORE the run?)
  study.mjs bank  <id>            print the ledger entry, refusing if the order is wrong
  study.mjs list                  every study and its state\n
Runs offline. The only thing it needs is git, to check that your expectation was on the
record before the answer existed.`);
}

export { state, committedAt };
