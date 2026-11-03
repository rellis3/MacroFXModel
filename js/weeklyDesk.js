/**
 * Agent 19: the weekly strategist (plans/DESK_ANALYST_PIPELINE.md §9x). On Sunday it writes the week's view: what
 * the last week's books said and how they scored, the themes carrying into the new week, a weekly currency ranking,
 * the week's high-impact releases with the desk's history of each, and the scenarios that would change the view.
 * Monday's evidence clerk reads it through the Desk Pack feed desk-weekly, as memory, never as a card.
 *
 * Pure: inputs are passed in (the server loads the runs, scores and calendar). One model call (role
 * desk/roles/weekly_strategist.md, schema weekly_view). Tested in js/weeklyDesk.test.mjs.
 */
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

/** ISO week label of a London date. */
export function isoWeek(date) {
  const d = new Date(`${date}T12:00:00Z`), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}

/** The last week's books, one line set per day: tone, ranking, headline, and the score where there is one. */
export function weekBooks(runs, scores) {
  const S = Object.fromEntries((scores ?? []).map(s => [s.date, s]));
  return (runs ?? []).filter(r => r?.head?.ok).map(r => {
    const b = r.head.book, cv = r.debate?.currency?.view, s = S[r.date];
    return { date: r.date, tone: b.global?.tone ?? null, conviction: r.debate?.global?.view?.conviction ?? null, ranking: cv?.ranking ?? null,
      biases: cv?.currencies ? Object.fromEntries(Object.entries(cv.currencies).map(([k, v]) => [k, v.bias])) : null, headline: b.headline ?? null,
      score: s ? { S: s.S, counts: !!s.eligible, placeboP95: s.placebo?.p95 ?? null } : null };
  });
}

/** The week's high-impact events, one line each, by London day. */
export function weekCalendar(events, now, { days = 7 } = {}) {
  const end = now + days * 864e5, seen = new Set();
  return (events ?? []).map(e => ({ ...e, ms: Number(e.ms ?? Date.parse(e.time)) }))
    .filter(e => e.ms > now && e.ms <= end && /high/i.test(String(e.impact ?? '')))
    .sort((a, b) => a.ms - b.ms)
    .filter(e => { const k = `${e.country}|${e.event}|${Math.round(e.ms / 6e4)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(e => `${new Date(e.ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })} ${e.country} ${e.event}${e.estimate ? ` (est ${e.estimate}, prev ${e.prev ?? 'n/a'})` : ''}`);
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** { headline, lastWeek, themes[{title, body}], currencies{CCY:{bias, why}}, ranking[], week[{when, event, why}], scenarios[{if, then}], watch[] } */
export function validateWeekly(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const headline = str(obj.headline, 300); if (!headline) return { ok: false, errors: ['headline missing'] };
  const currencies = {};
  for (const c of CCYS) { const v = obj.currencies?.[c]; const b = Math.round(Number(v?.bias)); if (v && Number.isFinite(b)) currencies[c] = { bias: Math.max(-2, Math.min(2, b)), why: str(v.why, 400) ?? '' }; }
  if (Object.keys(currencies).length < 6) return { ok: false, errors: [`a bias for every currency is needed (got ${Object.keys(currencies).length})`] };
  const ranking = (Array.isArray(obj.ranking) ? obj.ranking : []).filter(c => CCYS.includes(c));
  const value = {
    headline, lastWeek: str(obj.lastWeek, 1200) ?? '',
    themes: (Array.isArray(obj.themes) ? obj.themes : []).slice(0, 5).map(t => ({ title: str(t?.title, 120), body: str(t?.body, 900) })).filter(t => t.title && t.body),
    currencies, ranking: ranking.length === CCYS.length ? ranking : CCYS.slice().sort((a, b) => (currencies[b]?.bias ?? 0) - (currencies[a]?.bias ?? 0)),
    week: (Array.isArray(obj.week) ? obj.week : []).slice(0, 10).map(w => ({ when: str(w?.when, 60), event: str(w?.event, 160), why: str(w?.why, 400) })).filter(w => w.event),
    scenarios: (Array.isArray(obj.scenarios) ? obj.scenarios : []).slice(0, 5).map(x => ({ if: str(x?.if, 300), then: str(x?.then, 400) })).filter(x => x.if && x.then),
    watch: (Array.isArray(obj.watch) ? obj.watch : []).slice(0, 6).map(w => str(w, 240)).filter(Boolean),
  };
  if (!value.themes.length) return { ok: false, errors: ['no themes'] };
  return { ok: true, value };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The Sunday Telegram note. */
export function weeklyNote(rec) {
  const v = rec?.view; if (!v) return null;
  return [`🗓 <b>Desk week ahead · ${esc(rec.week)}</b>`, esc(v.headline), `Ranking: ${v.ranking.map(c => `${c}${v.currencies[c]?.bias > 0 ? '▲' : v.currencies[c]?.bias < 0 ? '▼' : ''}`).join(' › ')}`,
    ...v.themes.slice(0, 3).map(t => `• <b>${esc(t.title)}</b>`), v.week.length ? `Key dates: ${v.week.slice(0, 4).map(w => `${esc(w.when)} ${esc(w.event)}`).join(' · ')}` : null,
    '<i>The Desk Terminal has the full view · context, not orders</i>'].filter(Boolean).join('\n');
}
