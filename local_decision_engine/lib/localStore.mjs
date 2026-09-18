/**
 * localStore.mjs — local-disk persistence for the decision engine's two
 * inputs: the per-pair book (synced daily from Railway) and a short,
 * locally-maintained M1 tail (kept fresh by sync.mjs via js/m1GapFill.js).
 *
 * Reuses js/volBacktestM1Engine.js's packToBinary/packFromBinary as-is for
 * the M1 tail (the same compact binary format already proven server-side
 * for the decoded-snapshot cache, 2026-09-16/17) — no new serialization
 * format invented here.
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

export async function saveBook(pair, book) {
  await ensureDirs();
  await writeFile(path.join(BOOK_DIR, `${pair}.json`), JSON.stringify({ book, savedAt: new Date().toISOString() }));
}

export async function loadBook(pair) {
  try {
    const raw = await readFile(path.join(BOOK_DIR, `${pair}.json`), 'utf8');
    const j = JSON.parse(raw);
    return { book: j.book, savedAt: j.savedAt };
  } catch {
    return { book: null, savedAt: null };
  }
}

// M1 tail is stored with a synthetic, locally-scoped "source" tag (not a
// real R2 ETag — this cache is keyed purely by local freshness, not by
// change-detection against a remote object, since it's continuously
// extended locally, not periodically re-decoded from a static archive).
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

export async function bookAge(pair) {
  const { savedAt } = await loadBook(pair);
  if (!savedAt) return Infinity;
  return (Date.now() - Date.parse(savedAt)) / 3_600_000;
}
