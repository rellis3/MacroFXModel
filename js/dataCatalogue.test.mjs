// Tests for js/dataCatalogue.js.
//
// The catalogue is only worth having if it cannot drift from what the server actually
// fetches. The inventory got lost in the first place because the ids live in six
// different constants across server.js and js/, so nobody -- including me -- could see
// them at once: I proposed adding four series the repo already pulled, and separately said
// there was no FX implied-vol feed when EVZCLS had been configured all along.
//
// So the load-bearing test here is the two-way one: every FRED id reachable in the code is
// catalogued, and every catalogued id is actually used. Adding a series without a `why`
// now fails the build.
//
// Run:  node --test js/dataCatalogue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SOURCES, GROUPS, byId, untested, withTraps } from './dataCatalogue.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every FRED id the code actually asks for, scraped from the places that declare them. */
function fredIdsInCode() {
  // every file that NAMES a series id. Missing one makes the catalogue look stale when
  // it is the scan that is incomplete, so this list is part of the test's contract.
  const files = ['server.js', '_worker.js', 'js/weekMap.js', 'js/macroCore.js', 'js/volForecastBench.js',
                 'js/fredActuals.js', 'js/cpiEngine.js', 'js/creditStressEngine.js', 'GlobalLiquidity/backtestCore.mjs'];
  const ids = new Set();
  // the shapes these are declared in: `fred: 'X'`, `'X'` inside an id map, CVOL_SERIES, etc.
  const re = /\b(?:DGS[0-9]+(?:MO)?|DFII[0-9]+|T[0-9]+YIE|T[0-9]+YIFR|T10Y2Y|THREEFYTP10|DFEDTARU|DTB3|DCPF3M|SOFR|EFFR|IORB|IOER|RPONTSYD|RRPONTSYD|WLCFLPCL|WALCL|WTREGEN|WRESBAL|TOTBKCR|NFCI|BAML[A-Z0-9]+|VIXCLS|VXVCLS|GVZCLS|EVZCLS|OVXCLS|DTWEXBGS|DEX[A-Z]{4,5}|DCOILWTICO|DGASNYH|DHOILNYH|DHHNGSP|CPIAUCSL|CPILFESL|PCEPILFE|PPIFIS|CES[0-9]+|DGORDER|AAA10Y|BAA10Y|IRLTLT01[A-Z]{2}M156N|IRSTCI01[A-Z]{2}M156N|IR3TIB01[A-Z]{2}M156N)\b/g;
  for (const f of files) {
    let src;
    try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    // only inside quotes — a bare word in a comment is prose, not a fetch
    for (const m of src.matchAll(/'([A-Z0-9]{3,})'|"([A-Z0-9]{3,})"/g)) {
      const v = m[1] ?? m[2];
      if (v && re.test(v)) ids.add(v);
      re.lastIndex = 0;
    }
  }
  return ids;
}

test('every FRED series the code fetches is in the catalogue', () => {
  const used = fredIdsInCode();
  const known = new Set(CATALOGUE.map(c => c.id));
  const missing = [...used].filter(id => !known.has(id)).sort();
  assert.deepEqual(missing, [],
    `\nFetched but undocumented — add them with a why, a readBy and either a verdict or an empty evidence list:\n  ${missing.join('\n  ')}\n`);
});

test('every catalogued series is actually fetched somewhere', () => {
  const used = fredIdsInCode();
  const stale = CATALOGUE.filter(c => c.source === 'fred' && !used.has(c.id)).map(c => c.id).sort();
  assert.deepEqual(stale, [],
    `\nCatalogued but no longer fetched — remove them, or the catalogue becomes a wish list:\n  ${stale.join('\n  ')}\n`);
});

test('every entry says why it is here and who reads it', () => {
  for (const c of CATALOGUE) {
    assert.ok(c.why && c.why.length > 20, `${c.id} has no usable "why"`);
    assert.ok(Array.isArray(c.readBy) && c.readBy.length, `${c.id} is read by nothing — then why is it fetched?`);
    assert.ok(c.label && c.label.length > 2, `${c.id} has no label`);
    assert.ok(SOURCES[c.source], `${c.id} cites an unknown source "${c.source}"`);
    assert.ok(Array.isArray(c.evidence), `${c.id} must carry an evidence array, empty if never tested`);
  }
});

// A chapter citing a renamed finding shows nothing and looks fine. Same failure here.
test('every verdict cited actually exists in the ledger', () => {
  const ledger = new Set(DESK_EVIDENCE.map(e => e.id));
  const ghosts = [];
  for (const c of CATALOGUE) for (const id of c.evidence) if (!ledger.has(id)) ghosts.push(`${c.id} -> ${id}`);
  assert.deepEqual(ghosts, [], `\nCited findings that are not in js/deskEvidence.js:\n  ${ghosts.join('\n  ')}\n`);
});

test('no series is listed twice', () => {
  const ids = CATALOGUE.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'a series appears more than once');
});

test('the untested list is the answer to "what should we pull next"', () => {
  const u = untested();
  assert.ok(u.length > 0, 'if everything were tested this list would be empty, which would be news');
  // the specific one that prompted the catalogue
  assert.ok(u.some(c => c.id === 'T10Y2Y'),
    'T10Y2Y is pulled and has never been scored — if that changes, update the catalogue, do not delete the test');
});

test('the traps carry real detail, not a shrug', () => {
  const traps = withTraps();
  assert.ok(traps.length >= 5, `only ${traps.length} traps recorded`);
  for (const c of traps) assert.ok(c.trap.length > 40, `${c.id}'s trap note is too thin to help anyone`);
  // the three that have actually cost something
  for (const id of ['DCOILWTICO', 'EVZCLS', 'IOER']) {
    assert.ok(byId(id)?.trap, `${id} must carry its trap — it has already misled once`);
  }
});

// DEUCPIALLMINMEI is deliberately absent: the OECD MEI mirror died in 2025-03 and the
// regime table moved to Eurostat, so it is no longer fetched and has no row here. A dead
// series that is still FETCHED needs a row; one that is gone needs nothing.
test('a retired series is labelled retired, not quietly left looking live', () => {
  for (const id of ['IOER', 'EVZCLS']) {
    const c = byId(id);
    assert.match(c.trap, /DEAD|retired|BY DESIGN|stopped|last/i, `${id} should say plainly that it has stopped`);
  }
});

test('lookups behave', () => {
  assert.equal(byId('DGS2').group, 'curve');
  assert.equal(byId('nope'), null);
  assert.ok(GROUPS.includes('credit'));
  assert.ok(GROUPS.length >= 8);
});
