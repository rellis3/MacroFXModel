import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CLI = path.join(__dirname, 'study.mjs');

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const run = (...a) => { try { return execFileSync('node', [CLI, ...a], { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { return (e.stdout ?? '') + (e.stderr ?? ''); } };

// ── The guard that matters ───────────────────────────────────────────────────
t('bank refuses a study with no pre-registration', () => {
  const out = run('bank', 'a-study-that-does-not-exist');
  assert.match(out, /NO\s+a pre-registration exists/);
  assert.match(out, /refusing to bank/);
});

t('and it refuses without offering a way around itself', () => {
  const out = run('bank', 'a-study-that-does-not-exist');
  // The failure mode of a checking tool is helpfully suggesting the cheat. It may NAME
  // the cheat in order to forbid it — what it must never do is provide one.
  assert.doesNotMatch(out, /--force|--skip|--no-check|override|git commit --amend|--date=/i);
  assert.match(out, /not to backdate it/, 'it should name the cheat in order to rule it out');
});

t('check reports each of the four steps separately', () => {
  const out = run('check', 'a-study-that-does-not-exist');
  for (const line of ['a pre-registration exists', 'committed to git', 'a harness exists',
                      'wrote a result', 'committed BEFORE the run', 'computed a verdict'])
    assert.ok(out.includes(line), `check should report "${line}"`);
});

// ── It must read this repo's real history without inventing a verdict ────────
t('list reads the pre-registrations already in the repo', () => {
  const out = run('list');
  assert.match(out, /prereg\s+committed\s+run\s+ordered\s+verdict/);
  assert.match(out, /rates-pivot-lead/, 'should find a study that exists');
});

t('state() is importable without the CLI printing help', () => {
  // importing for the exports must not run the command switch
  const out = execFileSync('node', ['-e',
    `import('./analysis/study.mjs').then(m => console.log(JSON.stringify(m.state('rates-pivot-lead'))))`],
    { cwd: ROOT, encoding: 'utf8' });
  assert.doesNotMatch(out, /the four steps, as a tool/, 'importing must not trigger the CLI');
  const s = JSON.parse(out.trim().split('\n').pop());
  assert.equal(s.prereg, true);
  assert.equal(s.preregCommitted, true);
  assert.equal(typeof s.ordered, 'boolean');
});

// A study whose JSON spells its timestamp differently must not be accused of running
// before its own pre-registration.
t('an older harness that wrote `at` instead of `ranAt` is still read correctly', async () => {
  const { state } = await import('./study.mjs');
  const s = state('rates-pivot-lead');
  assert.ok(s.ranAt, 'a run time must be recovered');
  assert.ok(['ranAt', 'at', 'file mtime'].includes(s.ranFrom));
  assert.notEqual(s.ranFrom, null);
});

// ── The scaffold ────────────────────────────────────────────────────────────
t('new writes a prereg whose expectations come before the method', () => {
  const id = 'zz-scaffold-selftest';
  const p = path.join(ROOT, 'MD files', 'ZZ_SCAFFOLD_SELFTEST_PREREG.md');
  const h = path.join(__dirname, 'zz_scaffold_selftest_study.mjs');
  for (const f of [p, h]) if (fs.existsSync(f)) fs.unlinkSync(f);
  try {
    run('new', id, 'a claim used only by the test suite');
    assert.ok(fs.existsSync(p) && fs.existsSync(h));
    const md = fs.readFileSync(p, 'utf8');
    assert.match(md, /Pre-registered/);
    assert.match(md, /expectation first/i, 'the hypotheses table must demand an expectation');
    assert.match(md, /MIN_EVENTS/, 'an event floor must be part of the template');
    assert.match(md, /UNTESTABLE, which is NOT a null/);
    assert.ok(md.indexOf('Hypotheses, expectation first') < md.indexOf('What this does NOT test'));

    const js = fs.readFileSync(h, 'utf8');
    // the control must be in the template, because forgetting it is the common failure
    assert.match(js, /SETUP AND CONTROL/);
    assert.match(js, /the control is every period NOT near a setup/i);
    assert.match(js, /bootDiff/);
    assert.match(js, /UNTESTABLE/);
    assert.match(js, /MIN_EVENTS/);
  } finally { for (const f of [p, h]) if (fs.existsSync(f)) fs.unlinkSync(f); }
});

t('new refuses to overwrite a pre-registration that already exists', () => {
  const out = run('new', 'rates-pivot-lead', 'something else entirely');
  assert.match(out, /already exists/);
  // and the original must be untouched
  const md = fs.readFileSync(path.join(ROOT, 'MD files', 'RATES_PIVOT_LEAD_PREREG.md'), 'utf8');
  assert.doesNotMatch(md, /something else entirely/);
});

console.log(`study: ${n} groups, all passed`);
