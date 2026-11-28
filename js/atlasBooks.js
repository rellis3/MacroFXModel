/**
 * Atlas books (2026-11-27): the three bid/ask trade books the Vote Atlas and Fib Atlas
 * portfolio pages can switch between, built by scripts/atlas-books/build.mjs.
 *
 * Files live at `atlas-books/<book>/<system>/<pair>-votetrades.json`, on R2 (what Railway
 * reads) and in analysis/output/atlas-books/ (a local run). Same shape as the production
 * vote-trades files, so the portfolio code reads them unchanged; `cost` is 0 because the
 * bid/ask fill already carries the spread.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ATLAS_BOOKS = {
  honest: 'v2 honest book: in-sample-only vote book, v2 lines (Vote Atlas), bid/ask fills',
  gonogo: 'go/no-go book: the pre-registered atlas-honest-gonogo configuration, bid/ask fills',
  retest: 'retest book: honest-book lines and vote, fades enter on a stop after an overshoot and retest',
};

export const isAtlasBook = b => Object.prototype.hasOwnProperty.call(ATLAS_BOOKS, b);

export function bookKey(book, system, pair) {
  if (!isAtlasBook(book)) throw new Error(`unknown atlas book ${book}`);
  if (!['vote', 'asia', 'monday'].includes(system)) throw new Error(`unknown atlas system ${system}`);
  return `atlas-books/${book}/${system}/${String(pair).toLowerCase()}-votetrades.json`;
}

const LOCAL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'analysis', 'output');

/** The newer of the R2 copy and the local copy (by generatedAt), or null when neither exists. */
export async function loadBookTrades(book, system, pair, { getJSON } = {}) {
  const key = bookKey(book, system, pair);
  let remote = null, local = null;
  if (getJSON) { try { remote = await getJSON(key); } catch { remote = null; } }
  const file = path.join(LOCAL_ROOT, key);
  if (fs.existsSync(file)) { try { local = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { local = null; } }
  if (!remote) return local;
  if (!local) return remote;
  return Date.parse(remote.generatedAt) >= Date.parse(local.generatedAt) ? remote : local;
}
