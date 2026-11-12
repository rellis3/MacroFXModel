// Research rooms page (research.html): the wiring. Views: the rooms list (#), one room (#room=<id>), a new idea (#new).
// Server: /api/research-room* (js/researchRoom.js) for the rooms, the table and short remarks; /api/research-pod/brief for the translator;
// /api/research-pod/case/{reply,review,status} for rounds, the Head and parking (the same case machinery the Desk Office uses).
import { esc, roomsList, tableHtml, guestsBox, stageLine, conversationHtml, briefCard, SHAPES, LABEL, verdictChip } from './roomView.js';
import { loopHtml, agendasHtml, registerHtml, latestHtml, queueHtml, intakeHtml } from './hubView.js';

const $ = id => document.getElementById(id);
const S = { view: null, id: null, poll: null, data: null, filter: null, to: 'all', shape: null, brief: null, lastCount: -1, pics: [], hub: null, lane: 'auto', fromCard: null };

async function api(url, body = null) {
  const r = await fetch(url, body ? { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin', cache: 'no-store' });
  const d = await r.json().catch(() => ({ ok: false, error: `the server sent something unreadable (${r.status})` }));
  if (r.status === 401) throw new Error('Log in to the dashboard first, then reload this page.');
  if (!r.ok || d.ok === false) throw new Error(d.error || `request failed (${r.status})`);
  return d;
}
const say = (el, msg, bad = false) => { if (el) { el.textContent = msg; el.classList.toggle('bad', bad); } };
const stopPoll = () => { clearTimeout(S.poll); S.poll = null; };

function show(view) {
  S.view = view;
  for (const v of ['home', 'in', 'rooms', 'room', 'new']) $(`v-${v}`).hidden = v !== view;
  document.querySelectorAll('#tabs a').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === view || (view === 'room' && b.dataset.t === 'rooms'))));
}

// ── the rooms list ──────────────────────────────────────────────────────────────────────────────────────────────
async function loadRooms() {
  show('rooms'); stopPoll();
  const box = $('roomsList'); box.innerHTML = '<p class="muted">Loading the rooms…</p>';
  try {
    const d = await api('/api/research-room/list');
    box.innerHTML = d.rooms.length ? roomsList(d.rooms) : '<div class="card empty"><h3>No rooms yet</h3><p class="muted">Start with an idea, however rough.</p><a class="btn pri" href="#new">New idea</a></div>';
    $('talkCap').textContent = d.talk?.callsUsed != null ? `remarks ${d.talk.callsUsed}/${d.talk.callsCap}` : '';
    if (d.rooms.some(r => r.waiting?.on === 'team')) S.poll = setTimeout(() => { if (S.view === 'rooms') loadRooms(); }, 8000);
  } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}

// ── one room ────────────────────────────────────────────────────────────────────────────────────────────────────
function renderRoom(d) {
  S.data = d;
  $('rmTitle').textContent = d.title; document.title = `${d.title} · Research`;
  $('rmStages').innerHTML = stageLine(d.stages);
  $('rmTable').innerHTML = tableHtml(d.seats, { title: d.title, waiting: d.waiting });
  $('rmGuests').innerHTML = guestsBox({ room: d.room, guests: d.guests, maxGuests: d.maxGuests, seats: d.seats });
  const tl = S.filter ? d.timeline.filter(m => m.who === S.filter || m.kind === 'system') : d.timeline;
  const conv = $('rmConv'), atEnd = conv.scrollHeight - conv.scrollTop - conv.clientHeight < 80;
  conv.innerHTML = (S.filter ? `<div class="filterbar">Showing only ${esc(LABEL[S.filter] ?? S.filter)} <button type="button" class="btn ghost" data-act="unfilter">Show everyone</button></div>` : '') + conversationHtml(tl);
  if (atEnd || S.lastCount !== d.timeline.length) conv.scrollTop = conv.scrollHeight;
  S.lastCount = d.timeline.length;
  const running = d.job?.status === 'running', started = d.timeline.some(m => m.kind === 'answer');
  $('rmStatus').innerHTML = running ? `<span class="spin" aria-hidden="true"></span> ${esc(d.job.stage || 'working')}` : esc(d.waiting?.why ?? '');
  $('rmSend').textContent = started ? 'Send' : 'Start the discussion';
  $('rmText').placeholder = started ? 'Reply to the team. Push back, answer their questions, swap a layer…' : 'Anything to add before they start? (optional) Then press Start the discussion.';
  for (const b of ['rmSend', 'rmHead', 'rmDiscuss']) $(b).disabled = running;
  $('rmHead').disabled = running || !d.timeline.some(m => m.kind === 'answer');
  $('rmDiscuss').disabled = running || !d.timeline.some(m => m.kind === 'answer');
  $('rmPark').textContent = d.status === 'open' ? 'Park' : 'Reopen';
  $('rmCap').textContent = d.talk?.callsUsed != null ? `Short remarks: ${d.talk.callsUsed} of ${d.talk.callsCap} calls used` : '';
  document.querySelectorAll('#rmTo button').forEach(b => { b.hidden = b.dataset.to !== 'all' && !d.seats.some(s => s.who === b.dataset.to && s.state !== 'benched'); b.setAttribute('aria-pressed', String(b.dataset.to === S.to)); });
  stopPoll();
  if (running || d.waiting?.on === 'team') S.poll = setTimeout(() => { if (S.view === 'room' && S.id === d.id) loadRoom(d.id, true); }, 4000);
}
async function loadRoom(id, quiet = false) {
  if (!quiet) { show('room'); S.id = id; S.filter = null; S.lastCount = -1; S.pics = []; renderPics(); $('rmConv').innerHTML = '<p class="muted">Opening the room…</p>'; say($('rmMsg'), ''); }
  try { renderRoom(await api(`/api/research-room?id=${encodeURIComponent(id)}`)); }
  catch (e) { if (!quiet) $('rmConv').innerHTML = `<p class="bad">${esc(e.message)}</p>`; else say($('rmMsg'), e.message, true); }
}
function renderPics() { $('rmPics').innerHTML = S.pics.map(p => `<span title="${esc(p.description)}">${esc(p.name)}<button type="button" data-unpic="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join(''); }
async function act(fn, okMsg = '') {
  say($('rmMsg'), 'Working…');
  try { await fn(); say($('rmMsg'), okMsg); await loadRoom(S.id, true); } catch (e) { say($('rmMsg'), e.message, true); }
}
function wireRoom() {
  $('rmSend').addEventListener('click', () => act(async () => {
    const raw = $('rmText').value.trim(), started = S.data?.timeline.some(m => m.kind === 'answer');
    if (!raw && started) throw new Error('Write your reply first.');
    const text = raw ? (S.to !== 'all' ? `(to the ${LABEL[S.to]}) ${raw}` : raw) : 'Please discuss the brief: what is realistic, what would you test first, and what would you swap or drop?';
    await api('/api/research-pod/case/reply', { id: S.id, text, ...(S.pics.length ? { images: S.pics.map(p => p.id) } : {}) }); $('rmText').value = ''; S.pics = []; renderPics();
  }, 'Sent. The researchers answer one after another.'));
  $('rmHead').addEventListener('click', () => act(() => api('/api/research-pod/case/review', { id: S.id }), 'The Head of Research is reading the room.'));
  $('rmDiscuss').addEventListener('click', () => act(() => api('/api/research-room/talk', { id: S.id, who: 'discuss' }), 'Each seat gives one short remark or passes.'));
  $('rmPark').addEventListener('click', () => act(() => api('/api/research-pod/case/status', { id: S.id, status: S.data?.status === 'open' ? 'parked' : 'open' })));
  $('rmTo').addEventListener('click', e => { const b = e.target.closest('button[data-to]'); if (!b) return; S.to = b.dataset.to; document.querySelectorAll('#rmTo button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('v-room').addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-seat]'); if (!b) return;
    if (b.dataset.seat) { S.filter = S.filter === b.dataset.seat ? null : b.dataset.seat; renderRoom(S.data); return; }
    if (b.dataset.act === 'unfilter') { S.filter = null; renderRoom(S.data); return; }
    if (b.dataset.act === 'seat') act(() => api('/api/research-room/seat', { id: S.id, action: b.dataset.action, who: b.dataset.who }));
    if (b.dataset.act === 'talk') act(() => api('/api/research-room/talk', { id: S.id, who: b.dataset.who }), `${LABEL[b.dataset.who] ?? 'The guest'} is thinking.`);
  });
  $('rmFile').addEventListener('change', async e => {
    const files = [...(e.target.files ?? [])].slice(0, 6 - S.pics.length); e.target.value = '';
    for (const f of files) {
      say($('rmMsg'), `Reading ${f.name} (the picture reader, one call)…`);
      try {
        const r = await fetch(`/api/research-pod/image?context=${encodeURIComponent((S.data?.title ?? '').slice(0, 300))}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': f.type }, body: f });
        const d = await r.json().catch(() => ({ ok: false, error: `unreadable reply (${r.status})` }));
        if (!r.ok || !d.ok) throw new Error(d.error || `upload failed (${r.status})`);
        S.pics.push({ id: d.id, name: f.name, description: d.description ?? '' }); renderPics(); say($('rmMsg'), 'Attached. It goes with your next message.');
      } catch (err) { say($('rmMsg'), `${f.name}: ${err.message}`, true); }
    }
  });
  $('rmPics').addEventListener('click', e => { const b = e.target.closest('[data-unpic]'); if (!b) return; S.pics = S.pics.filter(p => p.id !== b.dataset.unpic); renderPics(); });
  $('rmText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('rmSend').click(); });
}

// ── a new idea ──────────────────────────────────────────────────────────────────────────────────────────────────
const lines = s => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean);
function editedBrief() {
  if (!S.brief) return null;
  const b = structuredClone(S.brief.brief);
  b.title = $('bfTitle').value.trim() || b.title; b.restated = $('bfRest').value.trim() || b.restated; b.hypothesis = $('bfHyp').value.trim() || b.hypothesis;
  return b;
}
function renderBriefEditor() {
  const r = S.brief, out = $('niOut');
  if (!r) { out.innerHTML = ''; return; }
  const b = r.brief;
  out.innerHTML = `<div class="card"><div class="ch"><h3>The brief</h3><span class="r lbl">${esc(r.callsUsed ?? '?')} of ${esc(r.callsCap ?? '?')} translator calls used</span></div>`
    + `<p class="muted">Fix anything it got wrong, right here. This is what the team will work from.</p>`
    + `<label class="fl">Title<input id="bfTitle" value="${esc(b.title)}" maxlength="70"></label>`
    + `<label class="fl">Your idea in clear words<textarea id="bfRest" rows="5" maxlength="1200">${esc(b.restated ?? b.hypothesis)}</textarea></label>`
    + `<label class="fl">In one line<textarea id="bfHyp" rows="2" maxlength="400">${esc(b.hypothesis)}</textarea></label>`
    + `<div id="bfPreview">${briefCard(b, r.dataCheck)}</div>`
    + `<div class="actions"><button type="button" class="btn pri" id="niOpen">Open the room →</button><span class="muted">Nothing runs until you press Start the discussion inside.</span></div></div>`;
  for (const id of ['bfTitle', 'bfRest', 'bfHyp']) $(id).addEventListener('input', () => { $('bfPreview').innerHTML = briefCard(editedBrief(), r.dataCheck); });
  $('niOpen').addEventListener('click', () => openRoom(true));
  checkOnFile(`${b.title} ${b.hypothesis} ${(b.searchTerms ?? []).join(' ')}`);
}
async function checkOnFile(q) {
  const box = $('niFile'); box.innerHTML = '<p class="muted">Checking the Evidence Book…</p>';
  try { const d = await api(`/api/research-room/onfile?q=${encodeURIComponent(q.slice(0, 1500))}`);
    box.innerHTML = d.entries.length ? `<ul class="ef">${d.entries.map(e => `<li>${verdictChip(e.verdict)} <b>${esc(e.id)}</b> ${esc(e.claim)}</li>`).join('')}</ul>` : '<p class="muted">Nothing close on file: this looks new.</p>'; }
  catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
async function openRoom(withBrief) {
  const text = $('niText').value.trim(), msg = $('niMsg');
  say(msg, 'Opening the room: checking the Evidence Book and the library…');
  try {
    const d = await api('/api/research-room/open', { text, shape: S.shape, ...(withBrief && S.brief ? { brief: editedBrief() } : {}), ...(S.fromCard ? { fromCard: S.fromCard } : {}) });
    S.brief = null; S.fromCard = null; $('niText').value = ''; renderBriefEditor(); say(msg, '');
    location.hash = `room=${encodeURIComponent(d.id)}`;
  } catch (e) { say(msg, e.message, true); }
}
function wireNew() {
  $('niShapes').innerHTML = SHAPES.map(([k, t, s]) => `<button type="button" class="shape" data-shape="${esc(k)}" aria-pressed="false"><b>${esc(t)}</b><small>${esc(s)}</small></button>`).join('');
  $('niShapes').addEventListener('click', e => { const b = e.target.closest('[data-shape]'); if (!b) return; S.shape = S.shape === b.dataset.shape ? null : b.dataset.shape; document.querySelectorAll('#niShapes .shape').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.shape === S.shape))); });
  $('niGo').addEventListener('click', async () => {
    const t = $('niText').value.trim(), msg = $('niMsg');
    if (t.length < 12) { say(msg, 'Write a sentence or two about the idea first.', true); return; }
    $('niGo').disabled = true; say(msg, 'Translating (one small AI call)…');
    try { S.brief = await api('/api/research-pod/brief', { text: t }); say(msg, ''); renderBriefEditor(); }
    catch (e) { say(msg, e.message, true); } finally { $('niGo').disabled = false; }
  });
  $('niPlain').addEventListener('click', () => { if ($('niText').value.trim().length < 12) { say($('niMsg'), 'Write a sentence or two about the idea first.', true); return; } openRoom(false); });
}
async function loadNew() {
  show('new'); stopPoll();
  try { const d = await api('/api/research-pod/brief'); $('niCalls').textContent = d.callsUsed != null ? `${d.callsUsed} of ${d.callsCap} translator calls used` : ''; } catch { /* a nicety */ }
}

// ── the hub: Home (the loop map, the Director's questions, studies in flight, latest verdicts) and Drop in ───────
async function loadHub(view = 'home', anchor = null) {
  show(view); stopPoll();
  try {
    const d = S.hub = await api('/api/research-hub');
    $('hubLoop').innerHTML = loopHtml(d.map);
    $('hubAgendas').innerHTML = agendasHtml(d.agendas);
    $('hubReg').innerHTML = registerHtml(d.register);
    $('hubLatest').innerHTML = latestHtml(d.map.find(s => s.id === 'known')?.latest);
    $('hubIntake').innerHTML = intakeHtml(d.intake?.slice(0, 6) ?? null);
    $('hubLessons').innerHTML = d.lessons ? `${d.lessons.total} method lessons from the teachers${d.lessons.proposed ? `, <b class="gold">${d.lessons.proposed} proposed edits to the research rules wait on you</b>` : ''} (education/RESEARCH_METHOD_LESSONS.md).` : '';
    $('inQueue').innerHTML = queueHtml(d.queue, d.lanes);
    $('inLedger').innerHTML = intakeHtml(d.intake);
    if (!$('inLanes').children.length) renderLanes(d.lanes);
  } catch (e) { $('hubLoop').innerHTML = `<p class="bad">${esc(e.message)}</p>`; $('inQueue').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
  if (anchor) $(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderLanes(lanes) {
  $('inLanes').innerHTML = Object.entries(lanes ?? {}).map(([k, t]) => `<button type="button" class="shape" data-lane="${esc(k)}" aria-pressed="${k === S.lane}"><b>${esc(k === 'auto' ? 'Not sure' : k)}</b><small>${esc(t)}</small></button>`).join('');
}
function wireHub() {
  $('hubAgendas').addEventListener('click', e => {
    const b = e.target.closest('[data-card]'); if (!b) return;
    const c = (S.hub?.agendas ?? []).flatMap(a => a.cards.map(x => ({ ...x, agenda: a.title }))).find(x => x.key === b.dataset.card); if (!c) return;
    S.fromCard = `${c.key} ${c.title} ${c.text}`;
    $('niText').value = `From the Director's agenda "${c.agenda}", Q${c.n} (${c.score ?? '?'}/15): ${c.title}.\n\n${c.text}`;
    location.hash = 'new';
  });
  $('inLanes').addEventListener('click', e => { const b = e.target.closest('[data-lane]'); if (!b) return; S.lane = b.dataset.lane; document.querySelectorAll('#inLanes [data-lane]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.lane === S.lane))); });
  $('inGo').addEventListener('click', async () => {
    const msg = $('inMsg'), url = $('inUrl').value.trim(), text = $('inText').value.trim(), note = $('inNote').value.trim(), files = [...($('inFile').files ?? [])];
    if (!url && !text && !files.length) { say(msg, 'Paste a link, some text, or pick a file first.', true); return; }
    $('inGo').disabled = true; const done = [], bad = [];
    try {
      if (url) { try { await api('/api/research-hub/drop', { lane: S.lane, url, note }); done.push('the link'); $('inUrl').value = ''; } catch (e) { bad.push(`link: ${e.message}`); } }
      if (text) { try { await api('/api/research-hub/drop', { lane: S.lane, text, note }); done.push('the text'); $('inText').value = ''; } catch (e) { bad.push(`text: ${e.message}`); } }
      for (const f of files) {
        say(msg, `Sending ${f.name}…`);
        try {
          const pdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
          const r = pdf ? await fetch('/api/research-pod/upload', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(f.name) }, body: f })
            : await fetch(`/api/research-hub/drop/image?lane=${encodeURIComponent(S.lane)}&name=${encodeURIComponent(f.name)}&note=${encodeURIComponent(note.slice(0, 600))}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': f.type }, body: f });
          const d = await r.json().catch(() => ({ ok: false, error: `unreadable reply (${r.status})` }));
          if (!r.ok || !d.ok) throw new Error(d.error || `failed (${r.status})`);
          done.push(pdf ? `${f.name} (${d.skipped ? 'already in the library' : 'into the Library backlog'})` : f.name);
        } catch (e) { bad.push(`${f.name}: ${e.message}`); }
      }
      $('inFile').value = ''; if (!bad.length) $('inNote').value = '';
      say(msg, [done.length ? `Dropped in: ${done.join(', ')}.` : '', bad.length ? `Not taken: ${bad.join(' · ')}` : ''].filter(Boolean).join(' '), bad.length > 0);
      await loadHub('in');
    } finally { $('inGo').disabled = false; }
  });
}

const ANCHORS = { ask: 'sec-ask', test: 'sec-test', known: 'sec-known', shelf: 'sec-shelf' };
function route() {
  const h = location.hash.replace(/^#/, ''), m = h.match(/^room=(.+)$/);
  if (m) loadRoom(decodeURIComponent(m[1])); else if (h === 'new') loadNew(); else if (h === 'rooms') loadRooms(); else if (h === 'in') loadHub('in');
  else loadHub('home', ANCHORS[h] ?? null);
}
wireRoom(); wireNew(); wireHub();
window.addEventListener('hashchange', route);
route();
