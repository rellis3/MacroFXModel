/**
 * What the central banks, the Fed's Beige Book and the treasuries did lately, laid out for the weekly.
 *
 * The desk already reads each bank's latest statement, minutes or summary (/api/fomc|ecb|boe|boj|rba|snb|boc/latest), the Beige Book
 * (/api/beigebook/latest) and the fiscal events (/api/fiscal/events: UK Budget and forecasts, US quarterly refunding). Those are written by a
 * model from the documents. This module shows the parts that are facts about the documents (date, tone score, what concerns the bank,
 * the vote, what wording changed, the figures the treasury published) and drops any sentence that reads as a forecast.
 *
 * Stored text carries encoding damage (a pound sign arrives as "Â£"). It is repaired here, not left for the reader to decode.
 *
 * Pure. Tested in js/policyWeek.test.mjs.
 */
import { readIsSafe } from './newsletterRecord.js';

const BANKS = [['USD', 'Fed'], ['EUR', 'ECB'], ['GBP', 'Bank of England'], ['JPY', 'Bank of Japan'], ['AUD', 'RBA'], ['CAD', 'Bank of Canada'], ['CHF', 'SNB'], ['NZD', 'RBNZ']];
const KIND = { statement: 'statement', minutes: 'minutes', summary: 'summary of discussions', transcript: 'press conference' };
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

/** Undo "UTF-8 read as Windows-1252": 'Â£' -> '£', 'â€”' -> '—'. Text that is already clean comes back unchanged. */
export function repairText(s) {
  if (typeof s !== 'string' || !/[ÂÃâ]/.test(s)) return s;
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 256) bytes.push(c);
    else if (CP1252[c] != null) bytes.push(CP1252[c]);
    else return s;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)); } catch { return s; }
}

const clean = s => (typeof s === 'string' ? repairText(s).replace(/\s+/g, ' ').trim() : '');
const num = v => (Number.isFinite(v) ? v : null);
const shortDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? ''); return m ? `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]}` : ''; };
const firstSentences = (t, max) => { const s = clean(t); if (s.length <= max) return s; const cut = s.slice(0, max), i = cut.lastIndexOf('. '); return i > 60 ? cut.slice(0, i + 1) : `${cut.replace(/\s+\S*$/, '')}…`; };
/** A sentence is shown only when it reads as a description, not a forecast. */
const safe = t => { const s = clean(t); return s && readIsSafe(s) ? s : ''; };

/** Rows for the banks and the Beige Book: { bank, ccy, date, kind, regime, score, inflation, growth, vote, changed }. */
function bankRow(name, ccy, r) {
  const a = r?.ok ? r.analysis : null;
  if (!a) return { bank: name, ccy, missing: true };
  const d = a.dimensions ?? {};
  return {
    bank: name, ccy, date: r.meetingDate ?? null, kind: KIND[r.kind] ?? r.kind ?? '', regime: String(a.regime ?? '').toLowerCase(), score: num(a.hawkishScore),
    inflation: num(d.inflationConcern), growth: num(d.growthConcern), vote: safe(firstSentences(a.voteNote, 200).replace(/^(.+?[.!?])\s.*$/, '$1')) || '', changed: safe(firstSentences(a.whatChanged, 320)),
  };
}

export function policyWeek({ banks, beige, fiscal, nowMs = Date.now() } = {}) {
  const rows = BANKS.map(([ccy, name]) => bankRow(name, ccy, banks?.[ccy]));
  const bb = beige?.ok ? { ...bankRow('Beige Book', 'USD', beige), kind: 'regional survey' } : null;
  const day = 864e5;
  const ev = (fiscal?.events ?? []).filter(e => e && e.ms && (e.ms > nowMs - 60 * day)).sort((a, b) => b.ms - a.ms);
  const fis = ev.map(e => {
    const a = e.analysis ?? null, upcoming = e.ms > nowMs;
    return {
      id: e.id, ccy: e.ccy, title: clean(e.title), date: e.date, upcoming, kind: e.kind,
      stance: a?.stance ? String(a.stance).toLowerCase() : '', supply: a?.supply ? String(a.supply).toLowerCase() : '', credibility: a?.credibility ? String(a.credibility).toLowerCase() : '',
      figures: (e.rows ?? []).slice(0, 4).map(x => ({ label: clean(x.label), value: clean(x.value), change: x.change ? clean(x.change) : '' })),
      what: safe(firstSentences(a?.whatChanged, 360)),
    };
  });
  return { rows, beige: bb, fiscal: fis };
}

const score = r => (r.score === null ? '·' : r.score.toFixed(2));
const conc = v => (v === null ? '·' : v >= 0.7 ? 'high' : v >= 0.4 ? 'moderate' : 'low');

export function policyWeekHtml(p, esc) {
  if (!p) return '';
  const all = [...p.rows, ...(p.beige ? [p.beige] : [])];
  const body = all.map(r => r.missing
    ? `<tr><td class="n">${esc(r.bank)}</td><td class="m" colspan="4"><small>no read yet</small></td></tr>`
    : `<tr><td class="n">${esc(r.bank)}</td><td class="m">${esc(shortDate(r.date))}<br><small>${esc(r.kind)}</small></td><td class="m">${esc(r.regime || '·')} <small>${score(r)}</small></td><td class="m">inflation ${conc(r.inflation)}<br>growth ${conc(r.growth)}</td><td class="w">${r.vote ? `${esc(r.vote)} ` : ''}${r.changed ? `<small>${esc(r.changed)}</small>` : ''}</td></tr>`).join('');
  const banks = `<table class="t3"><tr><th>Bank</th><th>Latest read</th><th>Tone, 0 to 1</th><th>What it worries about</th><th>What the vote and the wording show</th></tr>${body}</table><p class="small3">Tone is a language score of the bank's own words, 0 for most dovish and 1 for most hawkish. It describes the document, not what the bank does next. Each row is the latest document the desk has read, so the dates differ.</p>`;
  const fb = p.fiscal.map(f => {
    const fig = f.figures.map(x => `${esc(x.label)}: <b>${esc(x.value)}</b>${x.change ? ` <small>(${esc(x.change)})</small>` : ''}`).join('<br>');
    const lbl = f.upcoming ? `<small>upcoming, ${esc(shortDate(f.date))}</small>` : `${esc(shortDate(f.date))}`;
    return `<tr><td class="n">${esc(f.ccy)}<br><small>${esc(f.title)}</small></td><td class="m">${lbl}</td><td class="m">${f.stance ? `${esc(f.stance)} budget stance<br>${f.supply ? `${esc(f.supply)} bond supply<br>` : ''}${f.credibility ? `credibility ${esc(f.credibility)}` : ''}` : '<small>not read yet</small>'}</td><td class="w">${fig}${f.what ? `<br><small>${esc(f.what)}</small>` : ''}</td></tr>`;
  }).join('');
  const fiscal = fb ? `<table class="t3"><tr><th>Treasury</th><th>Date</th><th>Read</th><th>Figures and what changed</th></tr>${fb}</table><p class="small3">Stance, supply and credibility are the desk's reading of each fiscal document: whether the plan spends more or less than before, whether it sells more bonds, and whether the new numbers look more or less believable. A description of the document, not of where markets go.</p>` : '';
  return banks + fiscal;
}
