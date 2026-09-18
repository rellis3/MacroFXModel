/**
 * localStore.mjs — Fib Atlas's own copy of
 * `local_decision_engine/lib/localStore.mjs` (see that file's header for
 * the format rationale — reused verbatim, packToBinary/packFromBinary
 * unchanged). One difference from Vote Atlas's copy: Fib Atlas has TWO
 * books per pair (Asia's and Monday's — genuinely different data, each
 * ladder's own OOS-fit dimensions/buckets), so the book store is keyed by
 * `${pair}_${ladder}`. The M1 tail is still keyed by `pair` alone and
 * SHARED between both ladders — it's the same raw OANDA price series
 * either way, so one sync covers both.
 */
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { packToBinary, packFromBinary } from '../../js/volBacktestM1Engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const BOOK_DIR = path.join(DATA_DIR, 'book');
export const M1_DIR = path.join(DATA_DIR, 'm1');

async function ensureDirs() {
  await mkdir(BOOK_DIR, { recursive: true });
  await mkdir(M1_DIR, { recursive: true });
}

const bookKey = (pair, ladder) => `${pair}_${ladder}`;

export async function saveBook(pair, ladder, book) {
  await ensureDirs();
  await writeFile(path.join(BOOK_DIR, `${bookKey(pair, ladder)}.json`), JSON.stringify({ book, savedAt: new Date().toISOString() }));
}

export async function loadBook(pair, ladder) {
  try {
    const raw = await readFile(path.join(BOOK_DIR, `${bookKey(pair, ladder)}.json`), 'utf8');
    const j = JSON.parse(raw);
    return { book: j.book, savedAt: j.savedAt };
  } catch {
    return { book: null, savedAt: null };
  }
}

export async function bookAge(pair, ladder) {
  const { savedAt } = await loadBook(pair, ladder);
  if (!savedAt) return Infinity;
  return (Date.now() - Date.parse(savedAt)) / 3_600_000;
}

// M1 tail — shared across both ladders for one pair, same "local freshness,
// not remote-ETag" reasoning as Vote Atlas's identical copy.
export async function saveM1(pair, packed) {
  await ensureDirs();
  const buf = packToBinary(packed, 'local');
  await writeFile(path.join(M1_DIR, `${pair}.bin`), buf);
}

export async function loadM1(pair) {
  try {
    const buf = await readFile(path.join(M1_DIR, `${pair}.bin`));
    const out = packFromBinary(buf);
    return out ? out.packed : null;
  } catch {
    return null;
  }
}

export async function m1Age(pair) {
  try {
    const st = await stat(path.join(M1_DIR, `${pair}.bin`));
    return (Date.now() - st.mtimeMs) / 3_600_000; // hours
  } catch {
    return Infinity;
  }
}
