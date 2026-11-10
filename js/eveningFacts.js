/**
 * The day's facts for the evening edition (owner 2026-11-10: "feels a little too focused and not a general analysis of
 * the day"). The 10 Nov issue never named the day's main event (US Core CPI at 13:30), wrote about it as still to come,
 * and said "no feed explains" gold's fall on a day the wire carried a hawkish Fed speaker. The writer had only the
 * prices, the morning book and the score. These are the missing inputs, as prompt text:
 *
 *   releases    what printed today, actual against forecast, and the measured 30-minute reaction (release scorecard)
 *   headlines   the day's tier-1/2 headlines, their read, and whether the market moved with them in the next 30 min
 *   rates       today's closes and day changes in US yields, the dollar index, VIX and MOVE
 *   timing      for each big mover, the 30 minutes that carried most of its move (from the same M1 bars as the score)
 *
 * Pure: the server does the fetching (server.js _evFacts). A missing input is said, never filled.
 */
import { windowFor } from './deskScore.js';

const LONDON = 'Europe/London';
export const londonHM = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const sgn = (x, dp = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(dp)}`;

/**
 * For each market that moved at least `minU` u, the 30 minutes (London) that carried the largest part of its 08:00-21:00
 * move, and that part as a share of the whole day's move. Largest movers first, at most `top`.
 */
export function moveTiming(barsByInst, moves, date, { minU = 1, top = 14, spanMin = 30 } = {}) {
  const { entryMs, exitMs } = windowFor(date), out = [];
  const names = Object.entries(moves ?? {}).filter(([, m]) => m.u != null && Math.abs(m.u) >= minU)
    .sort((a, b) => Math.abs(b[1].u) - Math.abs(a[1].u)).slice(0, top).map(([n]) => n);
  for (const n of names) {
    const w = (barsByInst?.[n] ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
    if (w.length < 10) continue;
    const day = w.at(-1).close - w[0].open; if (!day) continue;
    let best = null, j = 0;
    for (let i = 0; i < w.length; i++) {
      const start = i ? w[i - 1].close : w[0].open, t0 = w[i].time * 1000;
      while (j < w.length - 1 && w[j + 1].time * 1000 <= t0 + spanMin * 60_000) j++;
      if (j < i) j = i;
      const mv = w[j].close - start;
      if (!best || Math.abs(mv) > Math.abs(best.mv)) best = { mv, from: t0, to: w[j].time * 1000 + 60_000 };
    }
    if (!best) continue;
    out.push({ inst: n, u: moves[n].u, from: londonHM(best.from), to: londonHM(best.to), share: Math.round((best.mv / day) * 100) });
  }
  return out;
}
export function timingText(rows) {
  if (!rows?.length) return '(no market moved 1 u or more, or no bars)';
  return rows.map(r => `${r.inst} ${sgn(r.u)} u on the day: its biggest 30 minutes were ${r.from}-${r.to} London, ${r.share}% of the day's move${Math.abs(r.share) >= 60 ? ' (most of the day in one burst)' : Math.abs(r.share) <= 25 ? ' (spread through the day)' : ''}`).join('\n');
}

/**
 * The day's releases (calendar events, high and medium impact, already out) with actual against forecast, and the
 * release scorecard's measured reactions where it ran (high impact; 30 minutes after the print).
 */
export function releasesText(events = [], scorecards = [], { now = Date.now() } = {}) {
  const evs = events.filter(e => e?.ms && e.ms <= now && ['high', 'medium'].includes(String(e.impact ?? '').toLowerCase())).sort((a, b) => a.ms - b.ms);
  if (!evs.length && !scorecards.length) return '(no high- or medium-impact releases on the calendar today, or the calendar was not available)';
  const lines = evs.map(e => {
    const v = x => (x == null || x === '' ? null : String(x));
    const sc = scorecards.find(s => Math.abs((s.ms ?? 0) - e.ms) < 60_000 && String(s.country ?? '').toUpperCase() === String(e.country ?? '').toUpperCase());
    // the scorecard's prints carry the actual it filled after the release, when the calendar has none
    const pr = (sc?.prints ?? []).find(x => String(x.event ?? '').trim().toLowerCase() === String(e.event ?? '').trim().toLowerCase());
    const a = v(e.actual) ?? v(pr?.actual), f = v(e.estimate), p = v(e.prev);
    const re = sc?.reactions?.length ? ` · next 30 min: ${sc.reactions.slice(0, 4).map(r => `${r.name} ${r.dir} ${Math.abs(r.move)} ${r.unit}${r.ratio != null ? ` (${r.ratio}x an ordinary half-hour)` : ''}`).join(', ')}` : '';
    return `${londonHM(e.ms)} London [${e.country}] ${e.event} (${String(e.impact).toLowerCase()}): ${a != null ? `actual ${a}` : 'actual not on the feed'}${f != null ? ` vs forecast ${f}` : ''}${p != null ? ` (previous ${p})` : ''}${re}`;
  });
  return lines.join('\n') || '(none)';
}

/** The day's tier-1/2 headlines (newest last), with the news analyst's read and the 30-minute reaction where measured. */
export function headlinesText(items = [], { sinceMs, untilMs, limit = 25 } = {}) {
  const hs = items.filter(h => h?.title && (sinceMs == null || h.ms >= sinceMs) && (untilMs == null || h.ms < untilMs))
    .filter(h => (+(h.read?.tier ?? h.tier) || 3) <= 2).sort((a, b) => a.ms - b.ms).slice(-limit);
  if (!hs.length) return '(no tier-1/2 headlines on the wire today, or the wire was not available)';
  return hs.map(h => {
    const im = Object.entries(h.read?.impact ?? {}).filter(([, v]) => +v).map(([k, v]) => `${k}${+v > 0 ? '↑' : '↓'}`).join(' ');
    const m30 = h.react?.m30?.label;
    return `${londonHM(h.ms)} T${h.read?.tier ?? h.tier ?? '?'} ${h.title}${im ? ` · read: ${im}` : ''}${h.read?.why ? ` (${h.read.why})` : ''}${m30 ? ` · 30 min later the market moved ${m30 === 'with' ? 'the way the read implied' : m30 === 'against' ? 'against the read' : m30}` : ''}`;
  }).join('\n');
}

/** Yahoo tickers for the rates-and-dollar block, with how each day change is said. */
export const RATE_SERIES = [
  { key: 'us3m', ticker: '^IRX', label: 'US 3-month bill yield', unit: 'bp' },
  { key: 'us5y', ticker: '^FVX', label: 'US 5-year yield', unit: 'bp' },
  { key: 'us10y', ticker: '^TNX', label: 'US 10-year yield', unit: 'bp' },
  { key: 'us30y', ticker: '^TYX', label: 'US 30-year yield', unit: 'bp' },
  { key: 'dxy', ticker: 'DX-Y.NYB', label: 'Dollar index (DXY)', unit: '%' },
  { key: 'vix', ticker: '^VIX', label: 'VIX', unit: 'pts' },
  { key: 'move', ticker: '^MOVE', label: 'MOVE (bond volatility)', unit: 'pts' },
];
/** series: { key: [{ date, value }] } daily closes. Only a close dated `date` counts as today's. */
export function ratesText(series = {}, date) {
  const rows = RATE_SERIES.map(s => {
    const xs = (series[s.key] ?? []).filter(o => Number.isFinite(o?.value));
    if (xs.length < 2) return `${s.label}: not available`;
    const last = xs.at(-1), prev = xs.at(-2);
    if (last.date !== date) return `${s.label}: no close for ${date} yet (last ${last.date}, ${last.value.toFixed(2)})`;
    const ch = s.unit === 'bp' ? `${sgn((last.value - prev.value) * 100, 0)}bp` : s.unit === '%' ? `${sgn((last.value / prev.value - 1) * 100, 2)}%` : `${sgn(last.value - prev.value, 2)} pts`;
    return `${s.label}: ${last.value.toFixed(s.unit === 'bp' ? 3 : 2)}${s.unit === 'bp' ? '%' : ''}, ${ch} on the day`;
  });
  return `${rows.join('\n')}\n(US 2-year: not in this feed; real yields and breakevens publish a day late, so they are not here.)`;
}

/** The morning's risks that named a time today: by the evening these have happened, so the writer reports them. */
export function pastEvents(risks = [], date) {
  const out = [];
  for (const r of risks ?? []) {
    const m = String(r).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/); if (!m) continue;
    out.push(String(r));
  }
  return out.length ? `${out.map(x => `- ${x}`).join('\n')}\nEvery time named above is earlier than this evening (${date}): these have HAPPENED. Report what came out, from the releases above; never write about them as still to come.` : '(the morning named no timed events)';
}
