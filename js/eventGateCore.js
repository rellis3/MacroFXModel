/**
 * Event Gate Core — Tier-1 brick: scheduled-event blackout windows.
 *
 * Turns an economic calendar (Finnhub shape) into per-CURRENCY blackout
 * windows, and answers "is this pair inside a window right now?". Pure — the
 * calendar is passed in, timestamps are computed here, nothing fetches.
 *
 * Consumers:
 *   • server.js `_refreshEventWindows` — hourly cron → KV `event_windows_v1`
 *     ({ generatedAt, preMin, postMin, windows }) for the Python bots.
 *   • pylego/events.py — reads those PRECOMPUTED windows (timestamps are data,
 *     not logic — the PYTHON_LEGO "generate-don't-port" rule; no formula port).
 *   • candidate consolidation: js/events.js (browser sizeMult) and
 *     bot/modules/news_risk.py implement the same idea separately — see
 *     LEGO_MODULES.md.
 *
 * This is RISK CONTROL, not alpha: suppressing entries around scheduled
 * high-impact prints needs no OOS edge proof — but consumers should still A/B
 * what the gate suppressed (tag, don't silently drop).
 */

// Calendar country code → currency. Superset of js/events.js COUNTRY_TO_CCY.
export const COUNTRY_TO_CCY = {
  US: 'USD', EU: 'EUR', EZ: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  GB: 'GBP', UK: 'GBP', JP: 'JPY', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CH: 'CHF',
  CN: 'CNY',
};

// Finnhub economic-calendar `time` is "YYYY-MM-DD HH:MM:SS" in UTC (per their
// docs). `new Date(s)` with a space separator parses as LOCAL time in V8 —
// wrong on any non-UTC box — so parse explicitly as UTC. Injectable via
// cfg.parseTime if a feed with different semantics is ever wired in.
export function parseFinnhubTimeUTC(s) {
  if (!s) return null;
  const iso = String(s).trim().replace(' ', 'T');
  const t = Date.parse(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return Number.isFinite(t) ? t : null;
}

// events: Finnhub economicCalendar rows ({ country, impact, time, event }).
// Returns per-currency windows sorted by start:
//   [{ ccy, startMs, endMs, eventTimeMs, impact, title }]
export function buildEventWindows(events, cfg = {}) {
  const {
    preMin = 45, postMin = 15,
    impacts = ['high'],
    countryToCcy = COUNTRY_TO_CCY,
    parseTime = parseFinnhubTimeUTC,
  } = cfg;
  const want = new Set(impacts.map(x => String(x).toLowerCase()));
  const out = [];
  for (const e of events || []) {
    if (!want.has(String(e?.impact ?? '').toLowerCase())) continue;
    const ccy = countryToCcy[String(e?.country ?? '').toUpperCase()];
    if (!ccy) continue;
    const t = parseTime(e.time ?? e.date);
    if (t == null) continue;
    out.push({
      ccy,
      startMs: t - preMin * 60_000,
      endMs:   t + postMin * 60_000,
      eventTimeMs: t,
      impact: String(e.impact).toLowerCase(),
      title: String(e.event ?? '').slice(0, 120),
    });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

// Extract the event-relevant currencies from any symbol form the platform uses
// ('eurusd', 'EUR_USD', 'EUR/USD', 'XAU_USD', 'NAS100_USD', 'DE30_EUR'…).
// Metals/indices resolve to their QUOTE/denomination currency (XAU→USD, DE30→EUR):
// their high-impact events are the quote economy's.
const _CCY = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF', 'CNY']);
export function pairCcys(sym) {
  const s = String(sym ?? '').toUpperCase().replace(/[/]/g, '_');
  const parts = s.includes('_') ? s.split('_')
    : (s.length === 6 ? [s.slice(0, 3), s.slice(3)] : [s]);
  return [...new Set(parts.filter(p => _CCY.has(p)))];
}

// The gate: is `nowMs` inside any window for any of `ccys`?
// Returns { blackout, reason, window } — reason is human-readable for audits.
export function eventGate(ccys, nowMs, windows) {
  for (const w of windows || []) {
    if (nowMs < w.startMs) break;              // sorted — nothing later can match
    if (nowMs <= w.endMs && ccys.includes(w.ccy)) {
      const mins = Math.round((w.eventTimeMs - nowMs) / 60_000);
      const when = mins >= 0 ? `in ${mins}m` : `${-mins}m ago`;
      return { blackout: true, reason: `${w.ccy} ${w.title || 'high-impact event'} ${when}`, window: w };
    }
  }
  return { blackout: false, reason: null, window: null };
}
