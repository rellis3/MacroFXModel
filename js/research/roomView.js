// Research rooms page (research.html): pure HTML builders, in the Desk Terminal's look. No DOM, no fetch: js/research/app.js wires them.
// Tested in js/research/roomView.test.mjs.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Each seat's colour family (class suffix) and the labels the page shows. */
export const TONE = { owner: 'you', translator: 'tr', onfile: 'eb', librarian: 'li', quant: 'q', macro: 'm', flow: 'f', head: 'h', system: 'sys', volopt: 'g1', rates: 'g2', skeptic: 'g3', theory: 'g4' };
export const LABEL = { owner: 'You', translator: 'Translator', onfile: 'Already on file', librarian: 'Librarian', quant: 'Quant researcher', macro: 'Macro researcher', flow: 'Flow researcher', head: 'Head of Research', system: 'Room',
  volopt: 'Vol & options', rates: 'Rates & curves', skeptic: 'Skeptic', theory: 'Theory desk' };
export const SHORT = { owner: 'You', translator: 'Tr', onfile: 'EB', librarian: 'Li', quant: 'Q', macro: 'M', flow: 'F', head: 'H', system: '·', volopt: 'VO', rates: 'RC', skeptic: 'Sk', theory: 'Th' };
const tone = who => TONE[who] ?? 'sys';
const label = who => LABEL[who] ?? who;
export const SHAPES = [['lead-lag', 'Does A lead B?', 'Lead-lag across a range of lags'], ['after-event', 'After X, what next?', 'What follows an event or an extreme'],
  ['regime', 'When does it work?', 'Split by regime or condition'], ['fade-follow', 'Fade or follow?', 'Reversal or continuation at a level'], ['read-something', 'Something I read', 'A paper, a C.OG clip, a chart']];

const VERDICT_CLS = { validated: 'up', null: 'nul', underpowered: 'gold', context: 'pur' };
export const verdictChip = v => `<span class="chip ${VERDICT_CLS[String(v).toLowerCase()] ?? ''}">${esc(String(v ?? '?').toUpperCase())}</span>`;
const time = at => { const d = new Date(at); return Number.isFinite(d.getTime()) ? d.toISOString().slice(5, 16).replace('T', ' ') : ''; };
export const avatar = (who, cls = '') => `<span class="av t-${tone(who)} ${cls}" aria-hidden="true">${esc(SHORT[who] ?? '?')}</span>`;
const thumbs = imgs => (imgs?.length ? `<div class="thumbs">${imgs.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="attached picture" loading="lazy"></a>`).join('')}</div>` : '');
const li = a => (a ?? []).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('');

/** The stage line: it follows what happened. */
export function stageLine(stages = []) {
  return `<ol class="stages" aria-label="Where this idea is (fills in by itself)">${stages.map(s => `<li class="st-${esc(s.state)}">${s.state === 'done' ? '✓ ' : ''}${esc(s.label)}</li>`).join('<li class="st-sep" aria-hidden="true"></li>')}</ol>`;
}
export const stageDots = (stages = []) => `<span class="dots" aria-label="${esc(stages.filter(s => s.state === 'done').length)} of ${stages.length} steps done">${stages.map(s => `<i class="d-${esc(s.state)}"></i>`).join('')}</span>`;

/** One row on the Rooms list. */
export function roomRow(r) {
  const seats = (r.seats ?? []).map(s => avatar(s.who, `sm s-${esc(s.state)}`)).join('');
  return `<a class="room-row" href="#room=${encodeURIComponent(r.id)}">`
    + `<span class="rr-t"><b>${esc(r.title)}</b><small>${r.isRoom ? 'Room' : 'Older case'} · ${esc(time(r.updatedAt))}</small></span>`
    + `<span class="rr-s">${seats || '<small class="muted">nobody yet</small>'}</span>`
    + `<span class="rr-l">${r.last ? `<b class="c-${tone(r.last.who)}">${esc(r.last.label)}:</b> ${esc(r.last.text)}` : ''}</span>`
    + `<span class="rr-w"><span class="chip ${r.waiting?.on === 'you' ? 'gold' : r.waiting?.on === 'team' ? 'pur' : ''}">${esc(r.waiting?.why ?? '')}</span>${stageDots(r.stages)}</span></a>`;
}

/** The Rooms list, grouped by who each room waits on. */
export function roomsList(rooms = []) {
  const g = { you: [], team: [], closed: [] };
  for (const r of rooms) (g[r.waiting?.on] ?? g.you).push(r);
  const sec = (k, h, empty) => `<section class="rgroup"><div class="sec"><h2>${h}</h2><span class="lbl">${g[k].length}</span></div>${g[k].length ? g[k].map(roomRow).join('') : `<p class="muted">${empty}</p>`}</section>`;
  return sec('you', 'Waiting on you', 'Nothing is waiting on you.') + sec('team', 'The team is working', 'Nobody is working right now.') + sec('closed', 'Parked and closed', 'Nothing parked yet.');
}

/** The table: the idea in the middle, the seats round it. Positions in % so it scales. */
export function tableHtml(seats = [], { title = '', waiting = null } = {}) {
  const n = Math.max(seats.length, 1);
  const seat = (s, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2, x = 50 + 39 * Math.cos(a), y = 50 + 39 * Math.sin(a);
    const st = { spoke: 'spoke', thinking: 'thinking…', waiting: 'waiting', benched: 'benched', suggested: 'suggested', idle: s.note || 'when called' }[s.state] ?? s.state;
    return `<button type="button" class="seat s-${esc(s.state)}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" data-seat="${esc(s.who)}" aria-label="${esc(label(s.who))}: ${esc(st)}">${avatar(s.who)}<span class="sn">${esc(label(s.who).replace(' researcher', ''))}</span><span class="ss">${esc(s.note && s.state === 'spoke' ? s.note : st)}</span></button>`;
  };
  return `<div class="table"><div class="tcore"><b>${esc(title)}</b>${waiting ? `<small class="${waiting.on === 'you' ? 'gold' : ''}">${waiting.on === 'you' ? 'waiting on you' : waiting.on === 'team' ? 'the team is working' : esc(waiting.why)}</small>` : ''}</div>${seats.map(seat).join('')}</div>`;
}

/** The guests box and the bench under the table. */
export function guestsBox({ room = {}, guests = {}, maxGuests = 2, seats = [] } = {}) {
  const at = room.guests ?? [], sugg = (room.suggested ?? []).filter(g => !at.includes(g)), others = Object.keys(guests).filter(g => !at.includes(g) && !sugg.includes(g));
  const full = at.length >= maxGuests;
  const row = (g, btns) => `<div class="grow">${avatar(g, 'sm')}<span>${esc(guests[g]?.label ?? g)}</span><span class="gb">${btns}</span></div>`;
  const core = seats.filter(s => s.kind === 'core');
  return `<div class="card gbox"><div class="ch"><h3>Guests</h3><span class="r lbl">${at.length} of ${maxGuests} chairs used</span></div>`
    + (at.length ? at.map(g => row(g, `<button type="button" class="btn" data-act="talk" data-who="${esc(g)}">Ask</button><button type="button" class="btn ghost" data-act="seat" data-action="remove" data-who="${esc(g)}">Remove</button>`)).join('') : '')
    + (sugg.length ? `<p class="muted">Suggested from the topic:</p>${sugg.map(g => row(g, `<button type="button" class="btn gold" data-act="seat" data-action="accept" data-who="${esc(g)}"${full ? ' disabled' : ''}>Accept</button><button type="button" class="btn ghost" data-act="seat" data-action="dismiss" data-who="${esc(g)}">Not now</button>`)).join('')}` : '')
    + (others.length ? `<p class="muted">Invite someone else:</p><div class="inv">${others.map(g => `<button type="button" class="btn ghost" data-act="seat" data-action="accept" data-who="${esc(g)}"${full ? ' disabled' : ''}>+ ${esc(guests[g]?.label ?? g)}</button>`).join('')}</div>` : '')
    + `<div class="bench"><p class="muted">Core researchers. Bench one when it has nothing to add here; it stays at the table, greyed out.</p>${core.map(s => `<button type="button" class="btn ${s.state === 'benched' ? 'gold' : 'ghost'}" data-act="seat" data-action="${s.state === 'benched' ? 'unbench' : 'bench'}" data-who="${esc(s.who)}">${s.state === 'benched' ? 'Bring back' : 'Bench'} ${esc(label(s.who).replace(' researcher', ''))}</button>`).join('')}</div></div>`;
}

const leaderTarget = b => {
  const leaders = (b?.variables ?? []).filter(v => v.role === 'leader').map(v => v.name), tgt = b?.target?.label || b?.target?.series || b?.target?.unknownSeries || '';
  return leaders.length || tgt ? `<div class="lt">${leaders.map(n => `<span class="node">${esc(n)}</span>`).join('') || '<span class="node dim">leader?</span>'}<span class="arrow" aria-hidden="true"></span><span class="node">${esc(tgt || 'target?')}</span></div>` : '';
};
/** The brief as a picture (the translator's message, and the New idea page). */
export function briefCard(b, d = null) {
  if (!b) return '';
  const m = b.method ?? {};
  const seen = new Set(), once = id => (seen.has(id) ? false : (seen.add(id), true));
  const held = d ? `<div class="drv">${d.target && once(d.target.id) ? `<span class="${d.target.have ? 'ok' : 'no'}">${esc(d.target.id)} ${d.target.have ? 'held' : 'missing'}</span>` : ''}${(d.variables ?? []).flatMap(v => [...(v.components ?? []).filter(c => once(c.id)).map(c => `<span class="${c.have ? 'ok' : 'no'}">${esc(c.id)} ${c.have ? 'held' : 'missing'}</span>`), ...(v.unknown ?? []).map(u => `<span class="no">${esc(u)} not held</span>`)]).join('')}<span class="${d.quickTestReady ? 'ok' : 'no'}">${d.quickTestReady ? 'quick-test ready' : 'not quick-test ready as it stands'}</span></div>` : '';
  return `<div class="brief"><b class="bt">${esc(b.title)}</b><p class="hyp">${esc(b.hypothesis)}</p>${b.mechanism ? `<p class="muted">Why it might hold: ${esc(b.mechanism)}</p>` : ''}${leaderTarget(b)}`
    + `${m.lags ? `<p><span class="lbl">Lags</span> ${esc(m.lags)}</p>` : ''}${m.regimes?.length ? `<p><span class="lbl">Split by</span> ${esc(m.regimes.join(' · '))}</p>` : ''}`
    + `${(b.variables ?? []).length ? `<details><summary>Variables and method</summary><ul>${(b.variables ?? []).map(v => `<li><b>${esc(v.name)}</b> (${esc(v.role)}): ${esc(v.construction)}${v.transform ? ` · ${esc(v.transform)}` : ''}</li>`).join('')}</ul>${m.steps?.length ? `<ol>${li(m.steps)}</ol>` : ''}${b.assumptions?.length ? `<p class="lbl">Assumptions</p><ul>${li(b.assumptions)}</ul>` : ''}</details>` : ''}`
    + `${held}${(b.missing ?? []).length ? `<p class="muted">Still missing: ${esc(b.missing.map(x => `${x.what}${x.suggestedSource ? ` (try ${x.suggestedSource})` : ''}`).join('; '))}</p>` : ''}${b.question ? `<p class="q"><b>One question for you.</b> ${esc(b.question)}</p>` : ''}</div>`;
}

/** One message in the conversation. */
export function messageHtml(m) {
  const who = m.who, head = (extra = '') => `<div class="mh"><b class="c-${tone(who)}">${esc(label(who))}</b>${extra}<span class="mt">${esc(time(m.at))}</span></div>`;
  const wrap = (body, cls = '') => `<div class="msg ${cls}" data-key="${esc(m.key)}">${avatar(who)}<div class="mb">${body}</div></div>`;
  switch (m.kind) {
    case 'system': return `<div class="divider"><span>${esc(m.text)}</span></div>`;
    case 'owner': case 'pending': return `<div class="msg mine${m.kind === 'pending' ? ' pend' : ''}" data-key="${esc(m.key)}"><div class="mb">${head(m.kind === 'pending' ? '<span class="chip pur">waiting for the researchers</span>' : '')}<p class="tx">${esc(m.text)}</p>${thumbs(m.images)}</div>${avatar('owner')}</div>`;
    case 'brief': return wrap(`${head(' <span class="lbl">turned your words into a brief</span>')}${briefCard(m.brief, m.dataCheck)}`, 'k-brief');
    case 'onfile': return wrap(`${head(' <span class="lbl">Evidence Book · checked by code, free</span>')}<ul class="ef">${(m.entries ?? []).map(e => `<li>${verdictChip(e.verdict)} <b>${esc(e.id)}</b> ${esc(e.claim)}</li>`).join('')}</ul>`, 'k-eb');
    case 'library': return wrap(`${head(` <span class="lbl">${(m.papers ?? []).length} papers from the library</span>`)}<ul class="pl">${(m.papers ?? []).map(p => `<li><b>${esc(p.title)}</b>${p.year ? ` <span class="muted">(${esc(p.year)})</span>` : ''}${p.why ? `<br><small class="muted">${esc(p.why)}</small>` : ''}</li>`).join('')}</ul>`, 'k-li');
    case 'answer': return wrap(`${head(` <span class="lbl">round ${esc(m.round)}</span>`)}${m.headline ? `<p class="hl">${esc(m.headline)}</p>` : ''}${m.text ? `<p class="tx">${esc(m.text)}</p>` : ''}${m.questions?.length ? `<p class="asks"><span class="lbl">Asks you</span> ${esc(m.questions.join(' · '))}</p>` : ''}${m.proposals?.length ? `<div class="drv">${m.proposals.map(p => `<span title="${esc(p.id)}">${p.revised ? 'revised: ' : 'proposal: '}${esc(p.title)}</span>`).join('')}</div>` : ''}`);
    case 'talk': return m.pass ? `<div class="msg k-pass" data-key="${esc(m.key)}">${avatar(who, 'sm')}<span class="muted">${esc(label(who))} passed${m.error ? ` (${esc(m.error)})` : ''}</span></div>`
      : wrap(`${head(m.replyTo ? ` <span class="lbl">to ${esc(label(m.replyTo))}</span>` : '')}<p class="tx">${esc(m.text)}</p>`, 'k-talk');
    case 'head': return wrap(`${head(m.nextStep ? ` <span class="chip gold">next: ${esc(m.nextStep)}</span>` : '')}<p class="hl">${esc(m.headline)}</p>${m.agree?.length ? `<p class="lbl">Agree</p><ul>${li(m.agree)}</ul>` : ''}${m.disagree?.length ? `<p class="lbl">Disagree</p><ul>${li(m.disagree)}</ul>` : ''}${m.nextStepWhy ? `<p class="muted">${esc(m.nextStepWhy)}</p>` : ''}${m.plan?.variable ? `<p><span class="lbl">Plan</span> ${esc(m.plan.title ?? '')} ${esc(m.plan.variable)}${m.plan.benchmark ? ` · must beat ${esc(m.plan.benchmark)}` : ''}</p>` : ''}`, 'k-head');
    case 'error': return `<div class="msg k-err" data-key="${esc(m.key)}">${avatar(who, 'sm')}<span>${esc(label(who))}: ${esc(m.text)}</span></div>`;
    default: return '';
  }
}
export const conversationHtml = (tl = []) => tl.map(messageHtml).join('') || '<p class="muted">Nothing said yet.</p>';
