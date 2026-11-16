// js/terminal/exportCore.js: EXPORT helpers, pure (no DOM globals, no fetch): a table on screen -> CSV text, a file name, and the small rules that keep an export honest.
//
// What is exported is ONLY what the page is showing right now: the table's own cells, as the person reads them. Nothing is fetched and nothing goes to a server. A desk login
// is shown only the viewer copy of each board (owner-only markup is never drawn for it: js/terminal/links.js ownerOnly), so what it can export is what it can see.
// Control columns (move / remove buttons, anything marked data-noexport) and hidden rows or cells are left out; sort arrows are stripped from headers.
//
// A cell that starts with = + - @ could be run as a formula by a spreadsheet. A leading minus or plus on a NUMBER is left alone (it is a number); anything else that starts
// with those characters gets a leading apostrophe, the usual guard.

const NUM = /^[+\-−]?[0-9][0-9,]*(\.[0-9]+)?(%|[a-zA-Z]{0,3})?$/;

/** One cell as safe CSV text (quotes doubled, wrapped when it holds a comma, quote or line break). */
export function csvCell(v) {
  let s = String(v ?? '').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
  if (/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !NUM.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** head = ['Market', ...], rows = [[...], ...] -> CSV text with a byte-order mark (so a spreadsheet reads the characters properly) and CRLF line ends. */
export function toCsv(head, rows) {
  const lines = [head, ...rows].map(r => r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

const txt = el => String(el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const skipped = el => !!el && (el.hasAttribute?.('hidden') || el.hasAttribute?.('data-noexport') || /(^|\s)(mon-ctl|sr|owner-only)(\s|$)/.test(el.getAttribute?.('class') ?? ''));
const kidsOf = el => el?.children ?? el?.kids ?? [];
const arrows = s => s.replace(/\s*[▲▼↑↓]\s*$/u, '').trim();

/**
 * A table element -> { head, body } of plain text, left to right as drawn. Works on any table the terminal draws (thead th, tbody tr, td or th cells).
 * Returns { head: [], body: [] } for something that is not a table with rows.
 */
export function tableRows(table) {
  if (!table?.querySelectorAll) return { head: [], body: [] };
  const keep = cells => [...cells].filter(c => !skipped(c));
  const headRow = table.querySelector?.('thead tr'), head = headRow ? keep(kidsOf(headRow)).map(c => arrows(txt(c))) : [];
  const trs = [...table.querySelectorAll('tbody tr')].filter(r => !skipped(r));
  const body = trs.map(r => keep(kidsOf(r)).map(txt)).filter(r => r.some(c => c !== ''));
  // a single wide "nothing here" row is not data
  if (body.length === 1 && body[0].length === 1 && !head.length) return { head, body: [] };
  return { head, body };
}

export const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'board';

/** desk-monitor-2026-11-16-1030.csv (UTC, so a file name means the same thing wherever it was saved). */
export function exportName(title, ext, now = Date.now()) {
  const asof = globalThis.__deskAsof?.active && Number.isFinite(globalThis.__deskAsof.t) ? globalThis.__deskAsof.t : null;   // a past view says so in the file name
  const d = new Date(asof ?? now), p = n => String(n).padStart(2, '0');
  return `desk-${slug(title)}${asof != null ? '-asof' : ''}-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.${ext}`;
}

/** Replace var(--token) (and a fallback form var(--token, x)) in serialised SVG with the colours the page resolves them to, so a standalone image keeps its colours. */
export function resolveCssVars(text, getVar, fallback = 'gray') {
  return String(text).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, name, fb) => { const v = String(getVar(name) ?? '').trim().replace(/"/g, "'"); return v || (fb ? fb.trim() : fallback); });   // a font stack like "JetBrains Mono", monospace sits inside a double-quoted attribute: single quotes keep the SVG valid
}

/** Is this canvas or svg a board chart (not an icon)? w and h are its drawn size in px. */
export const isChart = (w, h) => Number(w) >= 160 && Number(h) >= 80;

/** The most useful thing to export from a scope: the table with the most body rows, or null. tables = array of elements. */
export function biggestTable(tables) {
  let best = null, n = 0;
  for (const t of tables) { const r = tableRows(t).body.length; if (r > n) { n = r; best = t; } }
  return best;
}
