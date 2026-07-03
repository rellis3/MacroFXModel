// Trade Decision Engine — decision log (JSONL, append-only).
//
// Every decide() call appends one row: timestamp, request, the FULL feature
// vector, score and decision. Double duty (ARCHITECTURE.md §6):
//   1. Audit — decide() is deterministic given a snapshot, so any row replays.
//   2. Training set — join rows with realized outcomes (triple-barrier, the
//      entryLedgerV2 machinery) and each row is a labeled meta-labeling example.
//
// File lives in Trade_Decision_Engine/data/ (git-ignored). Rotation is future
// work — at one row per zone touch this stays small for a long time.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TDE_DATA_DIR ?? path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'decisions.jsonl');

export function appendDecision(entry) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ logged_at: Date.now(), ...entry }) + '\n');
  } catch (e) {
    console.error('[trade-decision] log append failed:', e.message ?? e);
  }
}

export function readRecent(limit = 100) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

export function logPath() { return LOG_FILE; }
