/**
 * The Chain, evening edition (owner, 2026-11-03: "do both"). After the day is scored (21:10 London) the desk writes
 * what happened across the 41 markets and how the morning book did, in the issue's own look.
 *
 * Built on the server from what it already has at 21:10: the day's M1 bars (the same ones the score used), the
 * morning book and its rulings, the score and the evening review, and the evening writer's prose
 * (desk/roles/evening_writer.md). Every number is measured; every reading of it is labelled.
 *
 * Pure. Tested in js/newsletterEvening.test.mjs. Design: plans/DESK_ANALYST_PIPELINE.md §9l.
 */
import { MAG_CSS, barFigure, flatTable, tileRow, evBadge } from './newsletterMag.js';
import { BASE_CSS, DISCLAIMER } from './newsletter.js';
import { instName, prose, reviewPage, moveText } from './newsletterDesk.js';
import { DESK_UNIVERSE } from './deskPack.js';
import { windowFor, unitOf } from './deskScore.js';

const GROUP_LABEL = { fx_majors: 'FX majors', fx_crosses: 'FX crosses', indices: 'Stock indices', metals: 'Metals', energy: 'Energy', ags: 'Agriculture', crypto: 'Crypto' };

/**
 * The day's move for every market from 08:00 to 21:00 London: % change, and the same move in the day's forecast unit
 * (u, the p50 distance from the morning's levels) where the book had levels. Also the high-low range in u.
 */
export function dayMoves(barsByInst, cards, date) {
  const { entryMs, exitMs } = windowFor(date), out = {};
  for (const [n, bars] of Object.entries(barsByInst ?? {})) {
    const w = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
    if (!w.length) continue;
    const o = w[0].open, c = w.at(-1).close, hi = Math.max(...w.map(b => b.high)), lo = Math.min(...w.map(b => b.low));
    const u = unitOf(cards?.[n]?.levels);
    out[n] = { pct: +((c / o - 1) * 100).toFixed(3), chg: c - o, u: u ? +((c - o) / u).toFixed(2) : null, rangeU: u ? +((hi - lo) / u).toFixed(2) : null };
  }
  return out;
}

/** The text the evening writer reads about the day's moves: by group, largest first, with the book's view on each. */
export function movesText(moves, cards) {
  return Object.entries(DESK_UNIVERSE).map(([g, names]) => {
    const rows = names.filter(n => moves[n]).sort((a, b) => Math.abs(moves[b].u ?? moves[b].pct) - Math.abs(moves[a].u ?? moves[a].pct))
      .map(n => `${n} ${moves[n].pct > 0 ? '+' : ''}${moves[n].pct}%${moves[n].u != null ? ` (${moves[n].u > 0 ? '+' : ''}${moves[n].u} u, range ${moves[n].rangeU} u)` : ''} · book: ${cards?.[n]?.rating ?? 'no card'}`);
    return rows.length ? `${GROUP_LABEL[g]}: ${rows.join('; ')}` : '';
  }).filter(Boolean).join('\n');
}


const CCY8 = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
/** Each currency's day, read from its pairs: the mean move in u across every pair it is in, signed for that currency. */
export function currencyStrength(moves) {
  const acc = Object.fromEntries(CCY8.map(c => [c, []]));
  for (const [n, m] of Object.entries(moves ?? {})) {
    if (n.length !== 6 || m.u == null) continue;
    const a = n.slice(0, 3), b = n.slice(3);
    if (acc[a]) acc[a].push(m.u); if (acc[b]) acc[b].push(-m.u);
  }
  return CCY8.filter(c => acc[c].length).map(c => ({ ccy: c, v: +(acc[c].reduce((x, y) => x + y, 0) / acc[c].length).toFixed(2), n: acc[c].length })).sort((x, y) => y.v - x.v);
}

/** Every market as a coloured tile (green up, red down, stronger colour for a bigger move in u), grouped. */
export function moveGrid(moves, cards, H) {
  const { esc } = H, col = u => { const z = Math.max(-1, Math.min(1, u / 2.5)); return z >= 0 ? `rgba(11,122,85,${0.12 + z * 0.75})` : `rgba(180,35,47,${0.12 - z * 0.75})`; };
  const groups = Object.entries(DESK_UNIVERSE).map(([g, names]) => {
    const rows = names.filter(n => moves[n]?.u != null); if (!rows.length) return '';
    return `<div style="margin:6px 0 2px;font:700 10px var(--sans,system-ui);letter-spacing:.08em;color:#5b6b82">${esc(GROUP_LABEL[g].toUpperCase())}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${rows.map(n => { const u = moves[n].u, dark = Math.abs(u) > 1.2, v = cards?.[n]?.rating ? cards[n].rating.replace('STRONG_', '').toLowerCase() : '';
      return `<div style="width:118px;padding:5px 6px;border-radius:6px;background:${col(u)};color:${dark ? '#fff' : '#14202e'};font:11px var(--sans,system-ui)"><b style="display:block;font-size:11px">${esc(instName(n))}${v && v !== 'flat' ? ` <span style="font-weight:400;opacity:.8">· ${esc(v)}</span>` : ''}</b><span style="font-family:Consolas,Menlo,monospace">${u > 0 ? '+' : u < 0 ? '−' : ''}${Math.abs(u).toFixed(1)}u</span><span style="display:block;font-size:9.5px;opacity:.85">${esc(moveText(n, moves[n].chg, moves[n].pct))}</span></div>`; }).join('')}</div>`;
  }).join('');
  return `<div style="margin:6px 0 10px">${groups}</div>`;
}

const sg = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}`;

/**
 * The whole evening issue as a self-contained page. ev: { date, issue (writer: subject, standfirst, sections),
 * score, reflection, movers, record, moves, cards }.
 */
export function renderEvening(ev, H) {
  const { esc } = H, M = { date: new Date(ev.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  const candles = '<svg class="logo" viewBox="0 0 28 22" width="26" height="20" aria-hidden="true"><g stroke-width="1.6" stroke-linecap="round"><line x1="5" y1="2" x2="5" y2="20" stroke="#19d3a0"/><rect x="2.5" y="7" width="5" height="9" rx="1" fill="#19d3a0" stroke="none"/><line x1="14" y1="1" x2="14" y2="17" stroke="#ff5d73"/><rect x="11.5" y="4" width="5" height="9" rx="1" fill="#ff5d73" stroke="none"/><line x1="23" y1="4" x2="23" y2="21" stroke="#ffb020"/><rect x="20.5" y="8" width="5" height="9" rx="1" fill="#ffb020" stroke="none"/></g></svg>';
  const short = new Date(ev.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const mh = sec => `<div class="mh"><b>${candles}The Chain</b><span>${esc(sec)}</span><span>Evening · ${esc(short)}</span></div>`;
  const is = ev.issue ?? {}, moves = ev.moves ?? {}, cards = ev.cards ?? {};
  const LBL = { 'Observed data': 'observed', 'Model output': 'model', 'Tested association': 'tested', 'Context, not a signal': 'context', Hypothesis: 'hyp', 'Untested interpretation': 'untested' };
  const all = Object.entries(moves).filter(([, m]) => m.u != null);
  const up = all.filter(([, m]) => m.u > 0).length, big = all.filter(([, m]) => Math.abs(m.u) >= 1).length;
  const tiles = tileRow([
    { name: 'Markets up, 08:00-21:00', value: `${up} of ${all.length}`, sub: `${all.length - up} down`, tone: up > all.length / 2 ? 'up' : 'dn' },
    { name: 'Moves past a typical half-day', value: String(big), sub: 'at least 1 u either way', tone: '' },
    { name: "The book's day score", value: ev.score?.S != null ? `${sg(ev.score.S)} u` : '–', sub: ev.score?.eligible ? 'counts in the test' : 'does not count in the test', tone: ev.score?.S > 0 ? 'up' : ev.score?.S < 0 ? 'dn' : '' },
  ], H);
  const cs = currencyStrength(moves);
  const ccyFig = cs.length >= 4 ? barFigure('The currencies today, strongest to weakest (average move in u across their pairs)', cs.map(c => ({ label: c.ccy, v: c.v, note: `${c.n} pairs` })), H, { unit: '', note: '' }) : '';
  const sections = (is.sections ?? []).map(s => `<h3 class="ss" style="margin:14px 0 4px">${esc(s.title)}</h3><p class="evl">${evBadge(LBL[s.label] ?? 'untested')}</p><p>${esc(prose(s.body, { sentences: 3, chars: 420 }))}</p>`).join('');
  const rv = reviewPage({ score: ev.score, reflection: ev.reflection, movers: ev.movers, record: ev.record }, H, { title: 'The book against the day', compact: true });
  const subject = is.subject ? `Evening: ${is.subject}` : `Evening: the day in ${all.length} markets`;
  const p1 = `<div class="pg p1">${mh('The day')}<div class="kick">Evening edition · ${esc(M.date)}</div><h1 class="hd">${esc(is.subject ?? 'The day, in the markets')}</h1>
${is.standfirst ? `<p class="ld">${esc(prose(is.standfirst, { sentences: 2, chars: 300 }))}</p>` : ''}<p class="small3">Written by the desk pipeline at the close from the day's prices, the morning book and the evening review. Moves run 08:00 to 21:00 London; u is the morning forecast's p50 distance, so 1 u is a typical half-day move.</p>
${tiles}${ccyFig}${sections ? `<div class="kick" style="margin-top:12px">What happened</div>${sections}` : ''}</div>`;
  const p2 = `<div class="pg pgflow">${mh('Every market')}<div class="kick">The day in every market</div><h2 class="sh">Where the moves were</h2><p class="evl">${evBadge('observed')}<span style="font:11px var(--sans,system-ui);color:#5b6b82">08:00 to 21:00 London, in u (1 u = that market's typical half-day move), with the move in pips (FX) or points and in percent. Green rose, red fell; the label is the morning book's view.</span></p>${moveGrid(moves, cards, H)}</div>`;
  const p3 = rv ? `<div class="pg pgflow">${mh(rv.section)}${rv.html}</div>` : '';
  const foot = `<div class="foot"><h4>NOT FINANCIAL ADVICE</h4>${DISCLAIMER.map(d => `<p>${esc(d.replace(/^NOT FINANCIAL ADVICE\.\s*/, ''))}</p>`).join('')}<div class="meta">The Chain · evening ${esc(ev.date)}</div></div>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>${BASE_CSS}${MAG_CSS}</style></head><body><div class="wrap mgw"><div class="mg">${p1}${p2}${p3}</div>${foot}</div></body></html>`;
  const text = [subject, '', is.standfirst ?? '', '', ...(is.sections ?? []).flatMap(s => [s.title.toUpperCase(), s.body, '']), ev.reflection?.headline ? `The book against the day: ${ev.reflection.headline}` : '', '', '---', ...DISCLAIMER].join('\n');
  return { subject: subject.slice(0, 120), html, text };
}
