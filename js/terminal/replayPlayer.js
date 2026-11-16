/**
 * The shared replay player (Desk Terminal, preview). One dialog that replays ONE visualisation's own history: a stage the visual draws into, a clock
 * label, "replaying history, not live", play / pause / step / speed (x1 x4 x16) / loop, a scrubber, and the honest coverage line.
 * Reusable by the event replay and the whole-terminal clock: they pass a different `def`.
 *
 *   openPlayer(def, { doc, win, raf, caf, now, opener })  ->  { close, state() }
 *   def = { id, title, note,
 *           load: async () => ({ frames: [{ t, data }], wanted?: { from }, extra?: any }),     the history we hold; never invented
 *           draw: (frames, i, { reduced, extra }) => html string,                              one frame (SVG or HTML), theme tokens only
 *           caption?: (frames, i, extra) => plain-words sentence for the frame (description only),
 *           label?: (frame) => the clock text }
 *
 * Keyboard: Space play/pause, arrows step, Home/End jump, + and - change speed, L loop, Esc close. Reduced motion: no fades or glow, and the same
 * controls step through the frames. The pure state machine and the coverage line are in js/replayVizCore.js (tested).
 */
import * as C from '../replayVizCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function openPlayer(def, { doc = document, win = window, raf = win.requestAnimationFrame?.bind(win), caf = win.cancelAnimationFrame?.bind(win), now = () => Date.now(), opener = null } = {}) {
  doc.getElementById('rpv-back')?.remove();
  const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const back = doc.createElement('div');
  back.id = 'rpv-back'; back.className = 'rpv-back'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', `Replay: ${def.title}`);
  back.innerHTML = `<div class="rpv"><div class="rpv-head"><b class="rpv-title">${esc(def.title)}</b><span class="chip rpv-chip">Replaying history, not live</span><button type="button" class="btn rpv-x" data-rpv="close" aria-label="Close the replay">Close</button></div>
<div class="rpv-date" id="rpv-date" aria-live="off"></div>
<div class="rpv-stage" id="rpv-stage"><p class="muted">Loading the history we hold…</p></div>
<div class="rpv-cap" id="rpv-cap" aria-live="polite"></div>
<div class="rpv-ctl"><button type="button" class="btn" data-rpv="first" aria-label="First frame">⏮</button><button type="button" class="btn" data-rpv="prev" aria-label="Step back one frame">◀</button><button type="button" class="btn rpv-play" id="rpv-play" data-rpv="toggle" aria-label="Play">▶ Play</button><button type="button" class="btn" data-rpv="next" aria-label="Step forward one frame">▶</button><button type="button" class="btn" data-rpv="last" aria-label="Last frame">⏭</button>
<span class="rpv-sp" role="group" aria-label="Speed"><button type="button" class="btn" data-speed="1" aria-pressed="true">x1</button><button type="button" class="btn" data-speed="4" aria-pressed="false">x4</button><button type="button" class="btn" data-speed="16" aria-pressed="false">x16</button></span>
<button type="button" class="btn" id="rpv-loop" data-rpv="loop" aria-pressed="false">Loop</button></div>
<input type="range" class="rpv-scrub" id="rpv-scrub" min="0" max="0" value="0" step="1" aria-label="Replay position" disabled>
<div class="rpv-cov muted" id="rpv-cov"></div>${def.note ? `<p class="rpv-note muted">${esc(def.note)}</p>` : ''}</div>`;
  if (reduced()) back.classList.add('rpv-reduced');
  doc.body.appendChild(back);
  const q = s => back.querySelector(s);
  const stage = q('#rpv-stage'), dateEl = q('#rpv-date'), capEl = q('#rpv-cap'), play = q('#rpv-play'), scrub = q('#rpv-scrub'), covEl = q('#rpv-cov'), loopB = q('#rpv-loop');
  let frames = [], extra = null, st = C.initState(0), raf0 = null, last = 0, closed = false;

  function paint() {
    if (!frames.length) return;
    const f = frames[st.i];
    stage.innerHTML = def.draw(frames, st.i, { reduced: reduced(), extra });
    dateEl.textContent = def.label ? def.label(f, st.i, frames.length) : `${C.niceDate(String(f.t).slice(0, 10))} · frame ${st.i + 1} of ${frames.length}`;
    capEl.textContent = def.caption ? def.caption(frames, st.i, extra) : '';
    scrub.value = String(st.i);
    play.textContent = st.playing ? '⏸ Pause' : '▶ Play'; play.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
    for (const b of back.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(+b.dataset.speed === st.speed));
    loopB.setAttribute('aria-pressed', String(st.loop));
  }
  function frameLoop() {
    raf0 = null; if (closed) return;
    const t = now(), dt = Math.min(250, t - last); last = t;
    const before = st.i; st = C.advance(st, dt);
    if (st.i !== before || !st.playing) paint();
    if (st.playing && raf) raf0 = raf(frameLoop);
    else if (!st.playing) paint();
  }
  const startLoop = () => { if (raf && raf0 == null && st.playing) { last = now(); raf0 = raf(frameLoop); } };
  function dispatch(action) {
    if (action === 'close') { close(); return; }
    st = C.act(st, action); paint(); startLoop();
  }
  function onClick(e) {
    const b = e.target.closest?.('[data-rpv],[data-speed]'); if (!b) return;
    if (b.dataset.speed) { st = C.setSpeed(st, +b.dataset.speed); paint(); return; }
    dispatch(b.dataset.rpv);
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = C.keyAction(e.key); if (!a) return;
    if (e.target?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;   // a focused button handles its own press
    e.preventDefault?.(); dispatch(a);
  }
  const onScrub = () => { st = C.seek({ ...st, playing: false }, +scrub.value); paint(); };
  const onTheme = () => paint();
  back.addEventListener('click', e => { if (e.target === back) { close(); return; } onClick(e); });
  back.addEventListener('keydown', onKey);
  scrub.addEventListener('input', onScrub);
  win.addEventListener?.('themechange', onTheme);
  function close() {
    if (closed) return; closed = true;
    if (raf0 != null) caf?.(raf0);
    win.removeEventListener?.('themechange', onTheme);
    back.remove();
    if (opener?.focus) { try { opener.focus(); } catch { /* gone */ } }
  }

  (async () => {
    try {
      const r = await def.load();
      if (closed) return;
      frames = Array.isArray(r?.frames) ? r.frames : []; extra = r?.extra ?? null;
      const cov = C.coverageOf(frames, r?.wanted ?? null);
      covEl.textContent = cov.text;
      if (cov.n < 2) { stage.innerHTML = `<p class="muted">${esc(cov.n ? 'Only one day is held, so there is nothing to play.' : cov.text)}</p>`; return; }
      st = C.initState(frames.length, { i: 0 });
      scrub.max = String(frames.length - 1); scrub.disabled = false;
      paint(); q('#rpv-play')?.focus?.();
    } catch (e) {
      if (!closed) { stage.innerHTML = `<p class="muted">The replay could not load: ${esc(e?.message ?? 'unknown error')}.</p>`; covEl.textContent = ''; }
    }
  })();
  return { close, state: () => st, frames: () => frames };
}
