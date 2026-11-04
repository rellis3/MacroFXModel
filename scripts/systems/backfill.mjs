/**
 * Backfill: every stored backtest trade list in the repo, through the standard system outputs (plan §9ad).
 *
 *   node scripts/systems/backfill.mjs            # all systems in scripts/systems/backfill_manifest.json
 *   node scripts/systems/backfill.mjs <id> ...   # only these
 *   node scripts/systems/backfill.mjs --check    # parse and report, write nothing
 *
 * The manifest says, per system, which files hold its trades and which column means what. Nothing is re-run: the
 * trades are the study's own stored output, so a system here is exactly what its study measured (gross or net as
 * the manifest says). Each lands in analysis/output/systems/<id>/ (trades.json, tearsheet.json, the toolkit and Data
 * Terminal CSVs) and shows on system-backtest.html with its post-mortem.
 *
 * Field spec (each mapping key): a column name, or { col, unit, map, const, fromFile, scale, add }.
 *   time units: 'iso' | 'date' (London 12:00 if no time) | 's' | 'ms' | 'min-after' (minutes after `anchor`, a time
 *   field or 'HH:MM' London on the row's date)
 *   result unit: 'R' | 'pct' | 'bp' (converted to pct)
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSystemOutputs } from './writeSystemOutputs.mjs';
import { london } from '../../js/systemExports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** CSV text → rows of objects (quoted fields handled). */
export function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.length);
  const split = l => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const head = split(lines[0] ?? '');
  return lines.slice(1).map(l => { const c = split(l); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}

const num = v => (v === '' || v == null ? NaN : +v);
/** London wall-clock date (+ optional HH:MM) to UTC ms. */
export function londonMs(date, hhmm = '12:00') {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number), [hh, mm] = hhmm.split(':').map(Number), guess = Date.UTC(y, m - 1, d, hh, mm);
  const [gd, gt] = london(guess), shown = Date.UTC(+gd.slice(0, 4), +gd.slice(5, 7) - 1, +gd.slice(8, 10), +gt.slice(0, 2), +gt.slice(3, 5));
  return guess - (shown - guess);
}
function pick(row, spec, file) {
  if (spec == null) return undefined;
  if (typeof spec === 'string') return row[spec];
  if ('const' in spec) return spec.const;
  if (spec.fromFile) { const m = path.basename(file).match(new RegExp(spec.fromFile)); return m ? m[1] : undefined; }
  return row[spec.col];
}
function timeOf(row, spec, file) {
  if (!spec) return NaN;
  const v = pick(row, spec, file), unit = spec.unit ?? 'iso';
  if (v == null || v === '') return NaN;
  if (unit === 's') return num(v) * 1000;
  if (unit === 'ms') return num(v);
  if (unit === 'date') return londonMs(String(v), spec.at ?? '12:00');
  if (unit === 'min-after') { const base = typeof spec.anchor === 'string' && /^\d\d:\d\d$/.test(spec.anchor) ? londonMs(String(row[spec.dateCol ?? 'date']), spec.anchor) : timeOf(row, spec.anchor, file); return base + num(v) * 60e3; }
  const s = String(v); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.includes('T') || s.includes(' ') ? s.replace(' ', 'T') + 'Z' : s + 'T12:00:00Z');
}
const val = (row, spec, file) => { if (spec == null) return NaN; const v = num(pick(row, spec, file)); return Number.isFinite(v) ? v * (spec.scale ?? 1) + (spec.add ?? 0) : NaN; };

/** One manifest entry → raw standard trades. */
export function tradesFor(sys, { read = f => readFileSync(path.join(ROOT, f), 'utf8') } = {}) {
  const out = [], f = sys.fields, problems = [];
  for (const file of sys.files) {
    if (!existsSync(path.join(ROOT, file)) && !sys.virtual) { problems.push(`missing ${file}`); continue; }
    const text = read(file);
    let rows = sys.format === 'json' ? (sys.tradesPath ? sys.tradesPath.split('.').reduce((o, k) => o?.[k], JSON.parse(text)) : JSON.parse(text)) : sys.format === 'jsonl' ? text.split('\n').filter(Boolean).map(l => JSON.parse(l)) : parseCsv(text);
    if (!Array.isArray(rows)) { problems.push(`${file}: no trades array`); continue; }
    if (sys.where) rows = rows.filter(r => Object.entries(sys.where).every(([k, v]) => (Array.isArray(v) ? v.map(String).includes(String(r[k])) : String(r[k]) === String(v))));
    for (const r of rows) {
      const dirRaw = String(pick(r, f.direction, file) ?? ''), dir = f.direction?.map ? f.direction.map[dirRaw] ?? f.direction.map[dirRaw.toLowerCase()] : dirRaw;
      const res = val(r, f.result, file), unit = f.result?.unit ?? 'R';
      const entryMs = timeOf(r, f.entryTime, file), exitMs = timeOf(r, f.exitTime ?? f.entryTime, file);
      const t = { instrument: String(pick(r, f.instrument, file) ?? '').toUpperCase(), direction: dir, entryMs, exitMs: Number.isFinite(exitMs) ? exitMs : entryMs,
        ...(unit === 'R' ? { R: res } : { returnPct: unit === 'bp' ? res / 100 : res, riskPct: sys.riskPct ?? 1 }),
        maeR: val(r, f.maeR, file), mfeR: val(r, f.mfeR, file), maePct: val(r, f.maePct, file), mfePct: val(r, f.mfePct, file),
        entry: f.entry ? num(pick(r, f.entry, file)) : null, stop: f.stop ? num(pick(r, f.stop, file)) : null, target: f.target ? num(pick(r, f.target, file)) : null, exit: f.exit ? num(pick(r, f.exit, file)) : null,
        tags: (f.tags ?? []).map(c => (r[c] != null && r[c] !== '' ? `${c}:${r[c]}` : null)).filter(Boolean),
        features: Object.fromEntries((f.features ?? []).map(c => [c, num(r[c])]).filter(([, v]) => Number.isFinite(v))) };
      for (const k of ['entry', 'stop', 'target', 'exit']) if (!Number.isFinite(t[k])) t[k] = null;
      out.push(t);
    }
  }
  return { trades: out, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'scripts/systems/backfill_manifest.json'), 'utf8'));
  const args = process.argv.slice(2), check = args.includes('--check'), only = args.filter(a => !a.startsWith('--'));
  for (const sys of manifest.systems.filter(s => !only.length || only.includes(s.id))) {
    const { trades, problems } = tradesFor(sys);
    if (check || !trades.length) { console.log(`${sys.id}: ${trades.length} rows${problems.length ? ` · ${problems.join('; ')}` : ''}`); continue; }
    try {
      const r = await writeSystemOutputs(sys.id, trades, { model: sys.name, doc: sys.doc ?? null, evidence: sys.evidence ?? null, source: sys.files, gross: sys.gross ?? null, costR: sys.costR ?? null, costs: sys.costs ?? null, backfill: true });
      console.log(`${sys.id}: ${r.trades} trades written${r.skipped ? `, ${r.skipped} skipped` : ''}${problems.length ? ` · ${problems.join('; ')}` : ''}`);
    } catch (e) { console.log(`${sys.id}: FAILED ${e.message}`); }
  }
}
