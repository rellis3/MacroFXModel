// Paper Library: "In short" and "How it could help us", built ONLY from what the desk already wrote into paper.notes plus the
// abstract. Pure functions (no DOM, no network, no model calls). Nothing is invented: a missing field is left out, and a paper the
// desk has not read says so. Text is trimmed at sentence boundaries; HTML builders escape everything.
import { escapeHtml as esc, lessonLinks } from './model.js';

const ABBR = /^(?:e\.g|i\.e|et al|vs|etc|fig|figs|eq|eqs|no|cf|approx|u\.s|u\.k|inc|ltd|dr|mr|ms|prof|sec|vol|[a-z])\.$/i;

const clean = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** End offsets of sentences in `s` (a boundary is . ! ? plus optional closer, then a space and an upper-case/digit/quote start; abbreviations skipped). */
function sentenceEnds(s) {
  const ends = [], re = /[.!?]["')\]]?(?=\s+["'(\[]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    const word = s.slice(0, end).split(/\s/).pop();
    if (!ABBR.test(word)) ends.push(end);
  }
  return ends;
}

/** Trim to at most `max` characters: whole sentences if possible, else a word boundary and an ellipsis. */
export function trimAt(text, max = 240) {
  const s = clean(text); if (!s || s.length <= max) return s;
  const ends = sentenceEnds(s).filter(e => e <= max);
  if (ends.length && ends[ends.length - 1] >= Math.min(60, max * 0.4)) return s.slice(0, ends[ends.length - 1]);
  const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(' ');
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:(\-–—]+$/, '') + '…';
}

/** First sentence of `text`, trimmed to `max` characters. '' for empty input. */
export function firstSentence(text, max = 220) {
  const s = clean(text); if (!s) return '';
  const e = sentenceEnds(s)[0];
  return trimAt(e ? s.slice(0, e) : s, max);
}

const hasNotes = n => !!(n && typeof n === 'object' && (clean(n.claim) || clean(n.mechanism) || clean(n.method)));
const YES = /^(yes|true|holds?|robust|y)\b/i, NO = /^(no|false|not|none|fails?|n)\b/i, PART = /^(partly|partial|mixed|some)/i;
const tri = v => { const s = clean(v); return !s ? 'unclear' : PART.test(s) ? 'partly' : YES.test(s) ? 'yes' : NO.test(s) ? 'no' : 'unclear'; };

/** The evidence line for the notes: { tone: 'good'|'warn'|'bad'|'mute', text }. Wording only restates the desk's own fields. */
export function evidenceOf(notes) {
  if (!hasNotes(notes)) return null;
  const oos = tri(notes.outOfSample), costs = tri(notes.costs), bits = [];
  let tone = 'mute';
  if (oos === 'yes') { bits.push('holds out of sample'); tone = 'good'; }
  else if (oos === 'partly') { bits.push('only partly holds out of sample'); tone = 'warn'; }
  else if (oos === 'no') { bits.push('not shown out of sample (in-sample evidence only)'); tone = 'bad'; }
  else bits.push('out-of-sample evidence unclear');
  if (costs === 'yes') bits.push('survives costs');
  else if (costs === 'no') { bits.push('not shown to survive costs'); if (tone === 'good') tone = 'warn'; }
  else if (costs === 'partly') bits.push('costs only partly covered');
  const st = clean(notes.stance).toLowerCase();
  if (st === 'supports' || st === 'contradicts' || st === 'mixed') bits.push(`desk stance: ${st}`);
  return { tone, text: 'Evidence: ' + bits.join('; ') };
}

function dataLine(n) {
  const d = n.data;
  const data = typeof d === 'string' ? clean(d) : d && typeof d === 'object' ? [d.market, d.period, d.frequency].map(clean).filter(Boolean).join(', ') : '';
  const method = clean(n.method);
  return [data && 'Data: ' + trimAt(data, 110), method && 'Method: ' + trimAt(method, 140)].filter(Boolean).join('. ');
}

/**
 * "In short" for the reader. -> { state: 'notes'|'abstract'|'none', items: [{ kind, text }], evidence, note }
 * kinds: claim, effect, setup, caveat, abstract. At most 4 items. state 'abstract'/'none' = the desk has not read it (note says so).
 */
export function inShort(p) {
  const n = p && p.notes;
  if (hasNotes(n)) {
    const items = [];
    const claim = trimAt(n.claim || n.mechanism, 280); if (claim) items.push({ kind: 'claim', text: claim });
    const eff = trimAt(n.effect, 200); if (eff) items.push({ kind: 'effect', text: eff });
    const setup = dataLine(n); if (setup) items.push({ kind: 'setup', text: setup });
    const cav = trimAt(Array.isArray(n.caveats) ? n.caveats.map(clean).filter(Boolean)[0] : n.caveats, 170);
    if (cav && items.length < 4) items.push({ kind: 'caveat', text: 'Caveat: ' + cav });
    return { state: 'notes', items: items.slice(0, 4), evidence: evidenceOf(n), note: '' };
  }
  const a = firstSentence(p && p.abstract, 260);
  if (a) return { state: 'abstract', items: [{ kind: 'abstract', text: a }], evidence: null, note: 'Not read by the desk yet. This is the first sentence of the abstract, nothing more.' };
  return { state: 'none', items: [], evidence: null, note: 'Not read by the desk yet, and no abstract is held, so nothing is claimed about this paper.' };
}

/** One line for a paper card: { text, muted }. */
export function cardLine(p) {
  const n = p && p.notes;
  if (hasNotes(n)) {
    const t = firstSentence(n.claim || n.mechanism, 150);
    const ev = evidenceOf(n), tag = ev && ev.tone === 'bad' ? ' (in-sample only)' : ev && ev.tone === 'good' ? ' (holds out of sample)' : '';
    if (t) return { text: t + tag, muted: false };
  }
  const a = firstSentence(p && p.abstract, 150);
  return a ? { text: 'Not read yet. Abstract: ' + a, muted: true } : { text: 'Not read by the desk yet.', muted: true };
}

/**
 * "How it could help us". -> { state, relevance, idea, desk: [{ id, verdict, claim, href }], lessons: [{ slug, href, label }], note }
 * `lessons`: paper.theory slugs when the server supplied them, else the tag-based fallback links.
 */
export function helpUs(p) {
  const n = p && p.notes, read = hasNotes(n);
  const slugs = Array.isArray(p && p.theory) ? p.theory : null;
  const lessons = slugs
    ? slugs.filter(s => /^[\w-]+$/.test(String(s))).map(s => ({ slug: s, href: '/theory-lab/lessons/' + s + '.html', label: String(s).replace(/^institutional-/, '').replace(/-/g, ' ') }))
    : lessonLinks(p && p.tags);
  const desk = ((p && p.desk) || []).slice(0, 4).map(d => ({ id: String(d.id), verdict: clean(d.verdict) || 'entry', claim: trimAt(d.claim || d.id, 150), href: '/evidence.html#ev-' + encodeURIComponent(d.id) }));
  const relevance = read ? trimAt(n.relevance, 380) : '', idea = read ? trimAt(n.testHere, 380) : '';
  let note = '';
  if (!read) note = 'Not read by the desk yet, so there is no stated use. You can still open a case from the title and abstract.';
  else if (!relevance && !idea) note = 'The desk noted no direct use or test for this paper.';
  return { state: read ? 'notes' : 'unread', relevance, idea, desk, lessons, note };
}

const KIND = { claim: 'Claim', effect: 'Effect', abstract: 'Abstract' };
/** HTML for the In short card. */
export function inShortHtml(p) {
  const s = inShort(p);
  const li = s.items.map(i => `<li class="k-${i.kind}">${KIND[i.kind] ? `<b>${KIND[i.kind]}.</b> ` : ''}${esc(i.text)}</li>`).join('');
  return `<section class="lib-sum lib-short" aria-labelledby="sumShortH"><div class="lib-kicker" id="sumShortH">In short</div>` +
    (li ? `<ul>${li}</ul>` : '') +
    (s.evidence ? `<p class="lib-ev ${s.evidence.tone}">${esc(s.evidence.text)}</p>` : '') +
    (s.note ? `<p class="lib-sum-note">${esc(s.note)}</p>` : '') + `</section>`;
}
/** HTML for the How it could help us card (carries the "Test this idea" button, id caseBtn). */
export function helpHtml(p) {
  const h = helpUs(p);
  let b = '';
  if (h.relevance) b += `<p><b>Why it matters here.</b> ${esc(h.relevance)}</p>`;
  if (h.idea) b += `<p class="lib-idea"><b>An idea we could test.</b> ${esc(h.idea)}</p>`;
  if (h.note) b += `<p class="lib-sum-note">${esc(h.note)}</p>`;
  if (h.desk.length) b += `<div class="lib-sum-links"><span>Desk entries</span>${h.desk.map(d => `<a href="${esc(d.href)}" target="_blank" rel="noopener">${esc(d.verdict)}: ${esc(d.claim)}</a>`).join('')}</div>`;
  if (h.lessons.length) b += `<div class="lib-sum-links"><span>Theory Lab</span>${h.lessons.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>`;
  return `<section class="lib-sum lib-help" aria-labelledby="sumHelpH"><div class="lib-kicker" id="sumHelpH">How it could help us</div>${b}` +
    `<div class="lib-sum-act"><button type="button" class="lib-btn primary lib-test" id="caseBtn">Test this idea</button><small>Opens a research case from this paper. No model call.</small></div></section>`;
}
