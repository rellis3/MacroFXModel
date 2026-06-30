/**
 * gen_instruments_json.mjs — the cross-language bridge for the instrument table.
 *
 * Serializes the canonical JS registry (js/instrumentRegistry.js) into
 * pylego/instruments.json so the Python bots read the SAME pip sizes / digits /
 * aliases the dashboard uses. This is Category-A of PYTHON_LEGO.md: data has one
 * source of truth (the JS registry); the JSON is GENERATED, never hand-edited.
 *
 *   node scripts/gen_instruments_json.mjs            # writes pylego/instruments.json
 *   node scripts/gen_instruments_json.mjs --check    # verify on-disk JSON is current (CI)
 *
 * Re-run whenever js/instrumentRegistry.js changes. The Python golden test
 * (pylego/instruments_test.py) also guards against the JSON drifting from a bot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INSTRUMENTS, INSTRUMENT_KEYS, resolveKey, EXTRA_ALIASES } from '../js/instrumentRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT = join(REPO_ROOT, 'pylego', 'instruments.json');

// Build the alias → canonical-key map exactly the way the JS registry does, so
// Python resolve_key() is bit-identical to JS resolveKey().
function buildAliases() {
  const aliases = {};
  for (const key of INSTRUMENT_KEYS) {
    const r = INSTRUMENTS[key];
    const add = s => { if (s) aliases[String(s).toLowerCase()] = key; };
    add(key);
    add(r.display);
    add(r.display.replace('/', ''));
    add(r.oanda);
    add(r.oanda.replace('_', ''));
    add(r.yahoo);
    add(r.mt5);
  }
  // Same extra short-name aliases the JS registry applies (spx500→spx, de30→dax…).
  for (const [a, key] of Object.entries(EXTRA_ALIASES)) {
    if (INSTRUMENTS[key] && !(a in aliases)) aliases[a] = key;
  }
  return aliases;
}

function build() {
  const instruments = {};
  for (const key of INSTRUMENT_KEYS) {
    const r = INSTRUMENTS[key];
    instruments[key] = {
      display: r.display,
      oanda: r.oanda,
      yahoo: r.yahoo,
      mt5: r.mt5,                 // reference/default broker symbol; bots may override locally
      assetClass: r.assetClass,
      pip: r.pip,
      digits: r.digits,
    };
  }
  return {
    _comment: 'GENERATED from js/instrumentRegistry.js by scripts/gen_instruments_json.mjs — do not hand-edit. See PYTHON_LEGO.md.',
    generatedFrom: 'js/instrumentRegistry.js',
    instruments,
    aliases: buildAliases(),
  };
}

const json = JSON.stringify(build(), null, 2) + '\n';

// sanity: every canonical key must round-trip through resolveKey
for (const key of INSTRUMENT_KEYS) {
  if (resolveKey(key) !== key) throw new Error(`registry self-check failed for "${key}"`);
}

if (process.argv.includes('--check')) {
  let onDisk = '';
  try { onDisk = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (onDisk !== json) {
    console.error('pylego/instruments.json is STALE — run: node scripts/gen_instruments_json.mjs');
    process.exit(1);
  }
  console.log('pylego/instruments.json is up to date.');
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT} (${INSTRUMENT_KEYS.length} instruments).`);
}
