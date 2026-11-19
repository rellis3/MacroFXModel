// js/terminal/jarvisModShow.js: SHOW, the narrated tour of the morning. Jarvis takes over the screen (cinema mode: the controls fade away), speaks, and the picture FOLLOWS him: each scene changes
// only when its narration has finished, never on a timer. The camera drifts and flies while he talks (the world, today's candles with a fly-through, the bias lean, the chain, the day ahead).
// With the voice off the same words appear as subtitles and the pace is reading speed. Esc ends it. DESCRIPTION ONLY: nothing in it is a forecast or a trade. Words come from showCore.js (templates, no model call).
import { registerJarvisModule } from './jarvisModules.js';
import { buildScenes, readSeconds, SHOW_HOOKS } from './showCore.js';
import { boardSummary, topMovers } from './jarvisCandles.js';
import { REGIONS } from './jarvisCore.js';
import { buildMarketGeo } from './jarvisMarkets.js';

const LS = 'jarvisShow:v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch (e) { /* private window */ } };
let GEO = null;
const lerp = (a, b, p) => a + (b - a) * p, ease = p => p * p * (3 - 2 * p);

registerJarvisModule({
  id: 'show', label: 'SHOW',
  render(pane, api) {
    const { esc, st } = api, prefs = lsGet();
    let token = 0, raf = 0;
    const ctl = { paused: false, rate: 1, jump: null };
    pane.innerHTML = `<h3>THE SHOW</h3><p>A narrated tour of your morning: the world, today's candles with a fly-through, the bias lean, the chain and the day ahead. Jarvis speaks, and the picture follows him, never the other way round. Press Esc to end it.</p>
<div class="jv-row"><button type="button" data-s="go">▶ START THE SHOW</button><button type="button" data-s="voice" aria-pressed="${prefs.voice !== false}">VOICE ${prefs.voice !== false ? 'ON' : 'OFF'}</button><label class="jv-sub">length <select data-s="len"><option value="quick" selected>morning brief (about 2 min)</option><option value="full">full tour (everything)</option></select></label><label class="jv-sub">pace <select data-s="rate"><option value="0.9">calm</option><option value="1" selected>normal</option><option value="1.15">brisk</option></select></label></div>
<p class="jv-sub" data-s="status">Ready. With the voice off it plays as subtitles at reading speed.</p>`;
    const q = s => pane.querySelector(`[data-s="${s}"]`), status = t => { const e = q('status'); if (e) e.textContent = t; };
    q('rate').value = String(prefs.rate ?? 1); q('len').value = prefs.len ?? 'quick'; q('len').onchange = e => lsPut({ len: e.target.value });
    q('voice').onclick = e => { const on = !(lsGet().voice !== false); lsPut({ voice: on }); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.textContent = `VOICE ${on ? 'ON' : 'OFF'}`; };
    q('rate').onchange = e => lsPut({ rate: +e.target.value });

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function stop() { token++; cancelAnimationFrame(raf); api.sfx.ambient(false); api.st.speakStop?.(); api.caption(null); api.cinema(false); api.st.spin = true; }

    // the camera moves WHILE he talks; how far it gets is tied to how long the line should take, and it holds its last pose if he runs on
    function motion(scene, dur, my) {
      let el = 0, last = performance.now();
      const cd = st.cd, zs = cd ? Object.values(cd.layout).map(p => p.z) : [0], zMin = Math.min(...zs), zMax = Math.max(...zs);
      const tick = () => {
        if (my !== token) return; const nowT = performance.now(); if (!ctl.paused) el += nowT - last; last = nowT; const p = Math.min(1, el / (dur * 1000));
        if (scene.cam?.fly) { const k = ease(p), z = scene.cam.lean ? lerp(zMax + 0.4, zMin - 0.4, k) : lerp(zMin - 0.4, zMax + 0.4, k); api.flyTo(Math.sin(k * 5) * 0.55, z); }
        if (scene.cam?.drift) st.zoom = 1 + 0.25 * ease(p);
        try { scene.motion?.(api, p); } catch (e) { /* a scene's camera must never stop the show */ }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function enter(scene) {
      if (st.view !== scene.view) api.setView(scene.view);
      st.spin = true; st.zoom = 1;
      if (scene.view === 'globe') {
        if (scene.cam?.focus) { GEO ??= buildMarketGeo(); const g = GEO[scene.cam.focus]; if (g) api.globeTo(g[0], g[1], 2.2); }
        else { const [la, lo, z] = REGIONS[scene.cam?.region ?? 'world']; api.globeTo(la, st.gl.tlon, z); st.spin = true; st.gl.tlat = la; }
      }
      if (scene.view === 'candles') { st.cdTarget = { x: 0, z: -1.6 }; st.cdCam = { x: 0, z: -1.6 }; }
      try { scene.enter?.(api); } catch (e) { /* ignore */ }
    }

    async function run() {
      const my = ++token; status('Gathering the morning...');
      const cd = await api.candles(), rows = cd?.rows ?? [];
      let events = null; try { const m = await api.jf('/api/jarvis/morning'); if (m?.ok && Array.isArray(m.events)) events = m.events.map(e => (typeof e === 'string' ? e : e.title ?? e.event ?? e.name ?? '')).filter(Boolean); } catch (e) { /* the digest is optional */ }
      if (my !== token) return;
      const extra = {}; await Promise.all(SHOW_HOOKS.map(async h => { try { extra[h.id] = (await h.prepare?.(api)) ?? null; } catch (e) { extra[h.id] = null; } }));
      if (my !== token) return;
      const chain = st.sum ? { holding: st.sum.holding, broken: st.sum.broken, quiet: st.sum.quiet, headline: st.sum.headline } : null;
      const scenes = buildScenes({ now: new Date(), movers: topMovers(rows, 5), board: rows.length ? boardSummary(rows) : null, chain, events, extra, mode: q('len').value });
      ctl.rate = +q('rate').value || 1; ctl.paused = false; ctl.jump = null; st.voice = lsGet().voice !== false;
      const sync = () => api.cineLabel(ctl.rate, ctl.paused);
      const steps = [0.75, 1, 1.25, 1.5, 1.75, 2];
      api.cinema(true, () => { stop(); status('Ended.'); }, {
        next: () => { ctl.jump = -1; api.st.speakCtl?.stop(); },
        prev: () => { ctl.jump = -2; api.st.speakCtl?.stop(); },
        pause: () => { ctl.paused = !ctl.paused; api.st.speakCtl?.pause(ctl.paused); sync(); },
        fast: () => { ctl.rate = steps.find(x => x > ctl.rate + 1e-6) ?? 2; sync(); },
        slow: () => { ctl.rate = [...steps].reverse().find(x => x < ctl.rate - 1e-6) ?? 0.75; sync(); },
      }); api.sfx.ambient(true); sync();
      let i = 0;
      while (i < scenes.length && my === token) {
        const sc = scenes[i]; if (i) api.sfx.whoosh(); enter(sc); api.caption(sc.text, `${sc.title.toUpperCase()}   ·   ${i + 1} / ${scenes.length}`);
        motion(sc, readSeconds(sc.text) / ctl.rate, my);
        await api.speak(sc.text, ctl.rate);          // the voice leads: nothing moves on until he has finished the line, or you skip it
        cancelAnimationFrame(raf); if (my !== token) break;
        if (ctl.jump != null) { i = ctl.jump === -1 ? i + 1 : Math.max(0, i - 1); ctl.jump = null; continue; }
        while (ctl.paused && my === token) await sleep(120);
        if (my === token) await sleep(650 / ctl.rate);
        i++;
      }
      if (my === token) { api.sfx.ambient(false); api.caption(null); api.cinema(false); api.setView('globe'); status('Finished. Press START to watch again.'); }
    }
    q('go').onclick = () => { stop(); run(); };
    // leaving the panel never ends a show in progress (cinema hides the panel anyway); closing Jarvis does, via cinemaStop
  },
});
