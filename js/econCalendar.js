/**
 * Econ Calendar Core — Tier-1 brick: today's / this-week's scheduled economic
 * events from a FREE source (ForexFactory weekly JSON), normalized to the
 * Finnhub `economicCalendar` shape the app already consumes.
 *
 * Why this exists: Finnhub's `/calendar/economic` is a PREMIUM endpoint — a
 * free/basic key 403s on it, and every calendar consumer silently rendered
 * "no events" (the morning brief's "no tier-1 data", the today.html "Watch"
 * strip, per-pair event chips). The failure was swallowed, so the brief could
 * not tell a genuinely-quiet day from a dead feed. ForexFactory's `thisweek`
 * feed is free, needs no key, and covers the tier-1 releases + central-bank
 * events we gate on.
 *
 * Normalizes FF rows → the shape the rest of the app expects:
 *   { country (Finnhub-style code, e.g. 'US'/'EU'), event, impact (lowercase),
 *     time ("YYYY-MM-DD HH:MM:SS" UTC — same string Finnhub returns),
 *     ms (epoch), estimate, prev, actual }
 * FF's `country` field is actually a CURRENCY code ('USD'); we map it back to
 * the Finnhub country codes the downstream filters (_PAIR_NEWS_CC,
 * GATE_COUNTRIES, NEWS_CCY…) are keyed on, so nothing downstream changes.
 *
 * `fetchWeekEvents()` returns { ok, source, error, events } so callers can tell
 * a genuinely-quiet day (ok:true, events:[]) from a dead feed (ok:false) — the
 * morning brief needs that distinction to avoid declaring a data-light day when
 * the feed is just down.
 *
 * Pure-core split: `normalizeForexFactory(rows)` is pure and unit-tested on
 * synthetic rows (js/econCalendar.test.mjs, no network); only `fetchWeekEvents`
 * does I/O. Finnhub time parsing is reused from eventGateCore (not re-inlined).
 */

import { parseFinnhubTimeUTC } from './eventGateCore.js';

export const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// ForexFactory currency code → Finnhub-style calendar country code. Eurozone
// prints arrive as 'EUR' on FF (it does not split DE/FR/IT); 'EU' covers them
// in the downstream country filters, which also list 'DE' explicitly.
export const CCY_TO_COUNTRY = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP',
  AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH', CNY: 'CN',
};

const _emptyToNull = v => (v == null || v === '' ? null : v);

// Epoch ms → "YYYY-MM-DD HH:MM:SS" in UTC — the exact string shape Finnhub's
// calendar returns and that today.html re-parses (it appends 'Z' itself).
export function msToCalTimeUTC(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// ForexFactory `date` is ISO-8601 with an offset (e.g. "2026-07-14T13:30:00-04:00")
// or 'Z'. Date.parse handles both; returns epoch ms or null.
export function parseFFDate(s) {
  if (!s) return null;
  const t = Date.parse(String(s).trim());
  return Number.isFinite(t) ? t : null;
}

// Pure: normalize a ForexFactory `thisweek` array into the app's event shape.
// Rows with an unparseable date are dropped. Sorted ascending by time.
export function normalizeForexFactory(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const ms = parseFFDate(r?.date);
    if (ms == null) continue;
    const ccy = String(r?.country ?? '').toUpperCase();
    out.push({
      country:  CCY_TO_COUNTRY[ccy] ?? ccy,               // 'USD' → 'US'; unmapped kept as-is
      event:    r?.title ?? '',
      impact:   String(r?.impact ?? '').toLowerCase(),    // high|medium|low|holiday
      time:     msToCalTimeUTC(ms),
      ms,
      estimate: _emptyToNull(r?.forecast),
      prev:     _emptyToNull(r?.previous),
      actual:   _emptyToNull(r?.actual),
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// Pure: normalize a Finnhub `economicCalendar` array into the same shape (used
// by the fallback path). Finnhub already gives country codes + "YYYY-MM-DD
// HH:MM:SS" UTC times.
export function normalizeFinnhub(rows) {
  const out = [];
  for (const e of Array.isArray(rows) ? rows : []) {
    const ms = parseFinnhubTimeUTC(e?.time);
    if (ms == null) continue;
    out.push({
      country:  String(e?.country ?? '').toUpperCase(),
      event:    e?.event ?? '',
      impact:   String(e?.impact ?? '').toLowerCase(),
      time:     e?.time,
      ms,
      estimate: _emptyToNull(e?.estimate),
      prev:     _emptyToNull(e?.prev),
      actual:   _emptyToNull(e?.actual),
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// Module-level cache — one fetch feeds every consumer (morning brief, per-pair
// snapshots, /api/events) for the TTL.
let _cache = { at: 0, res: null };

/**
 * Fetch this week's scheduled events. ForexFactory (free) is primary; Finnhub
 * (premium — usually 403) is a best-effort fallback only if a key is present.
 *
 * @returns {Promise<{ok:boolean, source:'forexfactory'|'finnhub'|null,
 *                     error:string|null, events:Array}>}
 *   ok=false means the feed itself failed (distinct from a quiet week). On
 *   failure any still-cached events are returned so consumers degrade to stale
 *   rather than blank.
 */
export async function fetchWeekEvents({ finnhubKey, ttlMs = 30 * 60_000, now = Date.now(), _fetch = fetch } = {}) {
  if (_cache.res?.ok && now - _cache.at < ttlMs) return _cache.res;

  // Primary: ForexFactory
  let ffErr = null;
  try {
    const r = await _fetch(FF_URL, {
      headers: { 'User-Agent': 'MacroFXDashboard/1.0' },
      signal:  AbortSignal.timeout(12_000),
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows)) {
        const res = { ok: true, source: 'forexfactory', error: null, events: normalizeForexFactory(rows) };
        _cache = { at: now, res };
        return res;
      }
      ffErr = 'ForexFactory: non-array payload';
    } else {
      ffErr = `ForexFactory HTTP ${r.status}`;
    }
  } catch (e) {
    ffErr = `ForexFactory: ${e.message}`;
  }

  // Fallback: Finnhub (only worth trying if a key exists; usually 403 on free plans)
  if (finnhubKey) {
    try {
      const from = new Date(now).toISOString().slice(0, 10);
      const to   = new Date(now + 6 * 864e5).toISOString().slice(0, 10);
      const r = await _fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${finnhubKey}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const j = await r.json();
        const res = { ok: true, source: 'finnhub', error: null, events: normalizeFinnhub(j.economicCalendar ?? []) };
        _cache = { at: now, res };
        return res;
      }
      ffErr = `${ffErr}; Finnhub HTTP ${r.status}`;
    } catch (e) {
      ffErr = `${ffErr}; Finnhub: ${e.message}`;
    }
  }

  // Both sources down — surface the failure, degrade to stale events if any.
  return { ok: false, source: null, error: ffErr, events: _cache.res?.events ?? [] };
}

// Test seam — reset the module cache between unit tests.
export function _resetCache() { _cache = { at: 0, res: null }; }
