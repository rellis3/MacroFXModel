/**
 * newsCalendar — parse the economic-calendar CSV and answer "what news hit this
 * session?" as an EX-ANTE, exogenous conditioning signal (the calendar is known
 * before the session, so it's lookahead-free by construction).
 *
 * CSV columns: date, datetime_raw (UTC), country, ccy, impact, event, actual,
 * previous, consensus. Impact tiers: Standard < Moderate < Major (Major = the
 * NFP/CPI/FOMC/central-bank tier that drives trend-day expansion/continuation).
 *
 * Pure; the caller passes the CSV text + a session window. No network, no DOM.
 */

const IMPACT_RANK = { standard: 1, moderate: 2, major: 3 };

// Minimal quoted-CSV field split (handles "double""quotes" and embedded commas).
function _csvSplit(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const _num = s => {
  if (s == null) return null;
  const t = String(s).replace(/["',\s]/g, '');
  if (!t || !/[0-9]/.test(t)) return null;
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
};

// Parse the CSV text → [{ ms, ccy, rank, event, surprise }] sorted ascending by ms.
export function parseCalendarCsv(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = _csvSplit(line);
    if (f.length < 6) continue;
    const ms = Date.parse((f[1] || '').trim().replace(' ', 'T') + 'Z');   // datetime_raw is UTC
    if (!isFinite(ms)) continue;
    const ccy = (f[3] || '').trim().toUpperCase();
    const rank = IMPACT_RANK[(f[4] || '').trim().toLowerCase()] || 0;
    const surprise = (() => { const a = _num(f[6]), c = _num(f[8]); return a != null && c != null ? a - c : null; })();
    out.push({ ms, ccy, rank, event: (f[5] || '').trim(), surprise });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

// The currencies whose news matters for an instrument. FX = both legs; indices/
// commodity = their home currency (US indices + gold = USD-driven).
const _INDEX_CCY = { US30: 'USD', SPX500: 'USD', NQ: 'USD', NAS100: 'USD', US2000: 'USD', DE30: 'EUR', UK100: 'GBP', GOLD: 'USD', XAUUSD: 'USD' };
export function pairCurrencies(pair) {
  const P = String(pair).toUpperCase().replace('/', '');
  if (_INDEX_CCY[P]) return new Set([_INDEX_CCY[P]]);
  if (/^[A-Z]{6}$/.test(P)) return new Set([P.slice(0, 3), P.slice(3, 6)]);
  return new Set(['USD']);
}

// Aggregate the news in [startMs, endMs] for the given currencies. Binary-searches
// the sorted events. Returns the session's news profile + a 3-way bucket.
export function newsForWindow(events, ccySet, startMs, endMs) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (events[m].ms < startMs) lo = m + 1; else hi = m; }
  let maxRank = 0, count = 0, hasMajor = false, surpMag = 0, surpSign = 0, majorEvent = null;
  for (let i = lo; i < events.length && events[i].ms <= endMs; i++) {
    const e = events[i];
    if (!ccySet.has(e.ccy)) continue;
    count++;
    if (e.rank > maxRank) maxRank = e.rank;
    if (e.rank >= 3) { hasMajor = true; if (!majorEvent) majorEvent = e.event; }
    if (e.surprise != null && Math.abs(e.surprise) > Math.abs(surpMag)) { surpMag = e.surprise; surpSign = Math.sign(e.surprise); }
  }
  const bucket = hasMajor ? 'major' : count > 0 ? 'minor' : 'none';
  return { count, maxRank, hasMajor, bucket, surpSign, surpMag, majorEvent };
}
