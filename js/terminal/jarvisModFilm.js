// js/terminal/jarvisModFilm.js: FILM, "While you slept". A sped-up replay of the last few sessions of the chain over the main view, with plain captions for what it finds.
// Snapshot history does not hold chain values, so this replays the HUD's own daily scrub (win.deskChainData(win, date)); see jarvisFilmCore.js. DESCRIPTION ONLY.
import { registerJarvisModule } from './jarvisModules.js';
import { buildGraph } from './jarvisCore.js';
import { pickDates, frameDelay, buildFrames, captionsFor, closingCaption, SPEEDS, FILM_SESSIONS } from './jarvisFilmCore.js';

let timer = 0, token = 0;
const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };

function render(pane, api) {
  stop(); const my = ++token;
  try {
    const esc = api.esc, win = api.win, st = api.st;
    const F = { frames: null, links: [], i: 0, playing: false, speed: 1, narrate: false, lines: [], loading: false, gen: 0 };
    pane.innerHTML = '<h3>FILM · while you slept</h3><div class="jv-row"><button type="button" data-f="play">PLAY</button><button type="button" data-f="restart">RESTART</button>'
      + SPEEDS.map(s => `<button type="button" data-f="speed" data-s="${s}" aria-pressed="${s === 1}">${s}x</button>`).join('')
      + '<button type="button" data-f="narrate" aria-pressed="false">NARRATE</button></div>'
      + '<div class="jv-row"><progress data-f="bar" max="1" value="0" style="flex:1"></progress><span class="jv-sub" data-f="pos"></span></div><div data-f="caps"></div>'
      + `<p class="jv-sub">Replays the chain over the last ${FILM_SESSIONS} sessions, one day at a time, using only what was known on each day. Captions describe what moved; none of it is a forecast.</p>`;
    const q = s => pane.querySelector(`[data-f="${s}"]`);
    const alive = () => my === token && pane.isConnected && st.mod === 'film' && !!api.doc.getElementById(api.ID);
    const showCaps = () => { q('caps').innerHTML = F.lines.map(l => `<p class="${l.level === 'warn' ? 'jv-am' : ''}">${esc(l.text)}</p>`).join('') || '<p class="jv-sub">Press PLAY.</p>'; };
    const sync = () => { const n = F.frames?.length ?? 0; q('bar').value = n > 1 ? Math.min(1, F.i / (n - 1)) : 0; q('pos').textContent = n ? `${F.frames[Math.min(F.i, n - 1)].date} · ${Math.min(F.i + 1, n)}/${n}` : ''; q('play').textContent = F.playing ? 'PAUSE' : 'PLAY'; };
    // the voice LEADS: with NARRATE on, the next frame is shown only after this one has been spoken in full (api.speak resolves when he finishes), never on the timer alone
    const say = t => (F.narrate && api.speak ? api.speak(t, 1) : Promise.resolve());
    async function loadFrames() {
      F.loading = true; q('caps').innerHTML = '<p class="jv-sub">Reading the last sessions...</p>';
      const dates = pickDates(st.dates, FILM_SESSIONS), gs = [];
      for (const d of dates) {
        if (!alive()) return false;
        let r = null; const latest = d === st.dates[st.dates.length - 1];
        try { r = await win.deskChainData?.(st.win, latest ? null : d); } catch (e) { r = null; }
        if (r?.links?.length) gs.push({ date: d, graph: buildGraph(r.links), links: r.links });
      }
      F.loading = false;
      if (!alive()) return false;
      if (gs.length < 2) { q('caps').innerHTML = '<p>The chain history is not available, so there is nothing to replay yet. Open the Chain tab once and try again.</p>'; return false; }
      F.frames = buildFrames(gs, api.names); F.links = gs.map(x => x.links); return true;
    }
    function show(i) {
      const f = F.frames[i], links = F.links[i];
      const di = st.dates.indexOf(f.date); st.idx = di >= st.dates.length - 1 ? -1 : di;
      try { api.setGraph?.(buildGraph(links), win.deskChainSummary?.(links, st.win) ?? null); } catch (e) { /* the HUD keeps its last picture */ }
      const sl = api.$('sl'); if (sl && di >= 0) sl.value = di;
      const cs = captionsFor(f); F.lines.push(...cs); F.lines = F.lines.slice(-8); showCaps(); sync();
      return cs.length ? say(cs.map(c => c.text).join(' ')) : Promise.resolve();
    }
    function finish() { F.playing = false; const t = closingCaption(F.frames); F.lines.push({ level: 'info', text: t }); F.lines = F.lines.slice(-9); showCaps(); sync(); say(t); }
    async function tick() {
      if (!alive()) { stop(); return; }
      if (!F.playing) return;
      if (F.i >= F.frames.length) { finish(); return; }
      const gen = F.gen, said = show(F.i); F.i++; sync();
      await Promise.all([said, new Promise(r => { timer = setTimeout(r, frameDelay(F.speed)); })]);      // at least the frame's own time, and never before the narration has finished
      if (gen === F.gen && F.playing) tick();
    }
    async function play() {
      if (F.playing) { F.playing = false; F.gen++; stop(); api.st.speakStop?.(); sync(); return; }
      if (F.loading) return;
      if (!F.frames && !(await loadFrames())) return;
      if (F.i >= F.frames.length) { F.i = 0; F.lines = []; }
      F.playing = true; F.gen++; sync(); tick();
    }
    pane.onclick = async e => {
      try {
        const b = e.target.closest('button[data-f]'); if (!b) return; const a = b.dataset.f; api.blip(620, 0.04);
        if (a === 'play') await play();
        else if (a === 'restart') { stop(); api.st.speakStop?.(); F.playing = false; F.gen++; F.i = 0; F.lines = []; showCaps(); sync(); await play(); }
        else if (a === 'speed') { F.speed = +b.dataset.s; for (const x of pane.querySelectorAll('[data-f="speed"]')) x.setAttribute('aria-pressed', String(x === b)); }
        else if (a === 'narrate') { F.narrate = !F.narrate; if (F.narrate) api.st.voice = true; b.setAttribute('aria-pressed', String(F.narrate)); if (!F.narrate) { api.win.speechSynthesis?.cancel(); api.st.speakStop?.(); } }
      } catch (err) { /* never into the HUD */ }
    };
    showCaps(); sync();
  } catch (e) { try { pane.innerHTML = '<p>The film could not load.</p>'; } catch (e2) { /* nothing */ } }
}

registerJarvisModule({ id: 'film', label: 'FILM', render });
