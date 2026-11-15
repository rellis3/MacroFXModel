/**
 * The "What drives this" panel body, written for people (the Pair page and each card's modal).
 * Input is cardDrivers() from cardExplain.js (the stored run, signed onto the market); output is HTML.
 * Presentation only: a plain name per analyst, a one-line takeaway first, the supporting points as readable
 * sentences with the key figures picked out, sources tucked into a quiet "Where this comes from" line, feed gaps
 * in words. Every stored string goes through `esc`; claims are shown in full (never cut at a character limit).
 * Tested in js/terminal/humanDrivers.test.mjs.
 */
import { analystLabel, stance, takeaway, summaryLine, channelsPhrase, parseEvidence, staleWords, gapPhrase, gapCount, splitLead, emphasise } from './humanDrivers.js';

const SHOW = 3;                                            // points shown before "more"
const DOTS = n => { const k = Math.max(1, Math.min(3, Math.ceil(Math.abs(n)))); return '●'.repeat(k) + '○'.repeat(3 - k); };

function pointHtml(p, esc, refYear) {
  const cls = p.push > 0 ? 'up' : 'dn', word = p.push > 0 ? 'Tailwind' : 'Headwind';
  const { lead, rest } = splitLead(p.claim);
  const old = (p.staleFeeds ?? []).map(staleWords);
  return `<li class="hd-pt ${cls}"><span class="hd-dir ${cls}" title="${esc(`${word}: pushes this market ${p.push > 0 ? 'up' : 'down'} (weight ${Math.abs(p.push)})`)}"><i class="hd-dots" aria-hidden="true">${DOTS(p.push)}</i> ${word}</span>`
    + `<span class="hd-txt"><span class="hd-lead1">${emphasise(lead, esc, { refYear })}</span>${rest ? ` <span class="hd-rest">${emphasise(rest, esc, { refYear })}</span>` : ''}`
    + `${old.length ? ` <span class="hd-old" title="This point leans on a feed that was not fresh this morning">older data: ${esc(old.join(', '))}</span>` : ''}</span></li>`;
}

function sourcesHtml(a, esc) {
  const seen = new Map();
  for (const p of a.points) for (const e of parseEvidence(p.evidence)) if (!seen.has(e.label)) seen.set(e.label, e.note);
  const src = [...seen].map(([lab, note]) => `${esc(lab)}${note ? ` <span class="hd-note">(${esc(note)})</span>` : ''}`).join(' · ');
  const gaps = (a.gaps ?? []).map(gapPhrase);
  if (!src && !gaps.length) return '';
  return `<details class="hd-src"><summary>Where this comes from</summary>${src ? `<p class="hd-srcl">${src}</p>` : ''}${gaps.length ? `<p class="hd-gap"><b>${gapCount(gaps.length)} weren't available or were out of date this morning:</b> ${esc(gaps.join(', '))}.</p>` : ''}</details>`;
}

export function analystHtml(a, { market, esc, refYear, maxAbs }) {
  const s = stance(a.net), pct = s.cls === 'flat' ? 0 : Math.max(8, Math.round(100 * Math.abs(a.net) / (maxAbs || 1)));
  const shown = a.points.slice(0, SHOW), more = a.points.slice(SHOW);
  const gapN = (a.gaps ?? []).length;
  return `<section class="hd-an" data-an="${esc(a.id)}"><header class="hd-h"><h3 class="hd-name">${esc(analystLabel(a.id))}</h3>`
    + `<span class="hd-chip ${s.cls}" title="${esc(`Net push on ${market}: ${a.net > 0 ? '+' : a.net < 0 ? '−' : ''}${Math.abs(a.net)}. A tailwind pushes it up, a headwind pushes it down.`)}">${s.word}</span>`
    + `<span class="hd-bar ${s.cls}" role="img" aria-label="${esc(`${s.word}, weight ${Math.abs(a.net)}`)}"><i style="width:${pct}%"></i></span></header>`
    + `<p class="hd-take">${esc(takeaway(a, market))}<span class="hd-sub">${a.points.length} point${a.points.length === 1 ? '' : 's'}${gapN ? ` · <span class="hd-gapn">${gapCount(gapN)} missing</span>` : ''}</span></p>`
    + `<ul class="hd-pts">${shown.map(p => pointHtml(p, esc, refYear)).join('')}</ul>`
    + (more.length ? `<details class="hd-more"><summary>${more.length} more point${more.length === 1 ? '' : 's'}</summary><ul class="hd-pts">${more.map(p => pointHtml(p, esc, refYear)).join('')}</ul></details>` : '')
    + sourcesHtml(a, esc) + `</section>`;
}

/** The whole body: summary, then one card per analyst, strongest first. */
export function humanDriversHtml(x, { market, esc, refYear = new Date().getUTCFullYear() }) {
  const maxAbs = Math.max(1, ...x.analysts.map(a => Math.abs(a.net)));
  const sum = summaryLine(x.analysts, market);
  return `<div class="hd-sum"><p class="hd-lead">${esc(sum)}</p><p class="hd-ch">${esc(channelsPhrase(x.channels, market))}</p></div>`
    + x.analysts.map(a => analystHtml(a, { market, esc, refYear, maxAbs })).join('')
    + (x.more ? `<p class="hd-ch">${x.more} more analyst${x.more === 1 ? '' : 's'} had a smaller say and ${x.more === 1 ? 'is' : 'are'} not shown.</p>` : '');
}

/** Load the panel's stylesheet once (a new file, so the main page's CSS is untouched). */
export function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('hd-css')) return;
  const l = document.createElement('link'); l.id = 'hd-css'; l.rel = 'stylesheet'; l.href = 'js/terminal/humanDrivers.css';
  document.head.appendChild(l);
}
