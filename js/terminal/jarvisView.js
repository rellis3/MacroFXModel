// js/terminal/jarvisView.js: the DOM half of Jarvis, the owner-only easter egg (widget.jarvis, typed as JARVIS in the command line). A full-screen HUD that re-skins the terminal
// while it is open and draws the macro chain as a rotating 3D object: markets on a cylinder, a thread per link with a particle flowing cause -> effect, colour = verdict.
// Drag to turn it, wheel to zoom, click a node for what it is and the links it sits on, 1D / 5D / 20D to change the window, Esc to leave.
// DESCRIPTION ONLY: it shows what moved and which textbook links held or broke. Never a forecast, never a trade. Core: jarvisCore.js. Own canvas, no library, no new feed:
// it reuses the Chain tab's loaders through globalThis.deskChainData (terminalTabs.js), so opening it adds no extra requests once the chain has loaded.
import { buildGraph, project, arcPoint, bootLines, VERDICT_WORD, radarRank, systemSummary } from './jarvisCore.js';
import { CHAIN_NODES } from '../macroChain.js';
import { shortLabel } from './chainBoard.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ID = 'jarvis';

const CSS = `#${ID}{position:fixed;inset:0;z-index:300;color:var(--tx);font-family:var(--mono,monospace);background:radial-gradient(ellipse at 50% 45%,color-mix(in srgb,var(--blue2) 22%,var(--bg)) 0%,var(--bg) 70%);overflow:hidden;animation:jv-in .6s ease-out}
@keyframes jv-in{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:none}}
#${ID} canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}#${ID} canvas:active{cursor:grabbing}
#${ID} .jv-top{position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:14px 18px;pointer-events:none}
#${ID} .jv-top>*{pointer-events:auto}#${ID} .jv-title{font-size:18px;letter-spacing:.42em;color:var(--blue2);text-shadow:0 0 14px var(--blue2)}
#${ID} .jv-sub{font-size:11px;color:var(--tx2);letter-spacing:.08em}#${ID} .jv-sp{flex:1}
#${ID} button{font:inherit;font-size:11px;letter-spacing:.08em;color:var(--tx);background:color-mix(in srgb,var(--bg1) 70%,transparent);border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer}
#${ID} button[aria-pressed="true"]{border-color:var(--blue2);color:var(--blue2);box-shadow:0 0 10px color-mix(in srgb,var(--blue2) 50%,transparent)}
#${ID} .jv-boot{position:absolute;left:18px;bottom:18px;max-width:min(460px,calc(100vw - 36px));font-size:12px;line-height:1.6;color:var(--tx2);pointer-events:none}
#${ID} .jv-boot b{color:var(--tx)}#${ID} .jv-boot .jv-hl{color:var(--gold)}
#${ID} .jv-card{position:absolute;right:18px;bottom:18px;width:min(360px,calc(100vw - 36px));max-height:55vh;overflow:auto;padding:14px;border:1px solid var(--blue2);border-radius:12px;background:color-mix(in srgb,var(--bg1) 82%,transparent);backdrop-filter:blur(6px);font-size:12px;line-height:1.5;box-shadow:0 0 24px color-mix(in srgb,var(--blue2) 35%,transparent)}
#${ID} .jv-card h3{margin:0 0 4px;font-size:14px;color:var(--blue2);letter-spacing:.06em}#${ID} .jv-card p{margin:6px 0;color:var(--tx2)}
#${ID} .jv-k{display:inline-block;font-size:10px;letter-spacing:.1em;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin-right:6px}
#${ID} .jv-hold{color:var(--blue2);border-color:var(--blue2)}#${ID} .jv-broke{color:var(--gold);border-color:var(--gold)}
#${ID} .jv-foot{position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:10px;color:var(--tx2);opacity:.7;pointer-events:none}
#${ID} .jv-pane{position:absolute;right:18px;top:64px;bottom:18px;width:min(440px,calc(100vw - 36px));overflow:auto;padding:14px;border:1px solid var(--blue2);border-radius:12px;background:color-mix(in srgb,var(--bg1) 86%,transparent);backdrop-filter:blur(6px);font-size:12px;line-height:1.55;box-shadow:0 0 24px color-mix(in srgb,var(--blue2) 35%,transparent)}
#${ID} .jv-pane h3{margin:0 0 6px;font-size:13px;letter-spacing:.14em;color:var(--blue2)}#${ID} .jv-pane p{margin:6px 0;color:var(--tx2)}#${ID} .jv-pane textarea{width:100%;min-height:74px;box-sizing:border-box;font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px}
#${ID} .jv-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}#${ID} .jv-ans{white-space:pre-wrap;color:var(--tx);margin:8px 0}#${ID} .jv-src{display:inline-block;font-size:10px;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin:2px 4px 2px 0;color:var(--tx2)}
#${ID} .jv-item{display:block;width:100%;text-align:left;border-radius:8px;margin:4px 0;padding:6px 10px}#${ID} .jv-up{color:var(--up)}#${ID} .jv-dn{color:var(--dn)}#${ID} .jv-am{color:var(--gold)}#${ID} table{width:100%;border-collapse:collapse}#${ID} td{padding:2px 4px;border-bottom:1px solid var(--line)}#${ID} td:last-child{text-align:right}
@media (max-width:640px){#${ID} .jv-boot{display:none}#${ID} .jv-title{font-size:14px}}
@media (prefers-reduced-motion:reduce){#${ID}{animation:none}}`;

let open = null;

export async function openJarvis(win = window) {
  const doc = win.document;
  if (open || doc.getElementById(ID)) return true;
  const root = doc.createElement('div'); root.id = ID; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Jarvis: the macro chain in 3D');
  root.innerHTML = `<style>${CSS}</style><canvas id="${ID}-cv"></canvas>
<div class="jv-top"><span class="jv-title" data-surface="widget.jarvis">J.A.R.V.I.S.</span><span class="jv-sub">the macro chain · description only</span><span class="jv-sp"></span>
<span id="${ID}-mods"></span><span id="${ID}-win"></span><button type="button" id="${ID}-spin" aria-pressed="true" title="Turn the chain by itself">AUTO-ROTATE</button><button type="button" id="${ID}-x" title="Esc">CLOSE ✕</button></div>
<div class="jv-pane" id="${ID}-pane" hidden></div><div class="jv-boot" id="${ID}-boot"></div><div class="jv-card" id="${ID}-card" hidden></div>
<div class="jv-foot">drag to turn · wheel to zoom · click a node · Esc to leave · none of this is a forecast</div>`;
  doc.body.appendChild(root);
  const $ = s => root.querySelector(`#${ID}-${s}`), cv = $('cv'), ctx = cv.getContext('2d');
  const tok = (n, fb) => { try { return win.getComputedStyle(doc.documentElement).getPropertyValue('--' + n).trim() || fb; } catch (e) { return fb; } };
  let C = { up: 'green', dn: 'red', gold: 'orange', blue: 'dodgerblue', tx: 'white', tx2: 'gray', cy: 'cyan' };
  const readTheme = () => { C = { up: tok('up', 'green'), dn: tok('dn', 'red'), gold: tok('gold', 'orange'), blue: tok('blue2', 'dodgerblue'), tx: tok('tx', 'white'), tx2: tok('tx2', 'gray'), cy: tok('cy', 'cyan') }; };
  readTheme();

  const st = { mod: 'chain', voice: false, win: 5, graph: null, sum: null, sel: null, yaw: 0.6, pitch: 0.28, zoom: 1, spin: true, t0: performance.now(), drag: null, w: 0, h: 0, proj: [] };
  const resize = () => { const d = Math.min(2, win.devicePixelRatio || 1); st.w = root.clientWidth; st.h = root.clientHeight; cv.width = st.w * d; cv.height = st.h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  resize(); win.addEventListener('resize', resize);

  $('win').innerHTML = [1, 5, 20].map(w => `<button type="button" data-w="${w}" aria-pressed="${w === st.win}">${w}D</button>`).join(' ');
  async function load(w) {
    st.win = w; st.sel = null; $('card').hidden = true;
    for (const b of $('win').querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.w === w));
    $('boot').innerHTML = '<b>Reading the chain…</b>';
    let r = null; try { r = await win.deskChainData?.(w); } catch (e) { r = null; }
    if (!r?.links?.length) { st.graph = null; $('boot').innerHTML = '<b>The chain feeds are not available right now.</b> Open the Chain tab once and try again.'; return; }
    st.graph = buildGraph(r.links); st.sum = win.deskChainSummary?.(r.links, w) ?? null;
    typeBoot(bootLines(st.sum, w));
    if (st.mod !== 'chain' && st.mod !== 'ask') R[st.mod]?.();
  }
  let typing = 0;
  function typeBoot(lines) {
    const my = ++typing; let i = 0; $('boot').innerHTML = '';
    const next = () => { if (my !== typing || !open) return; if (i >= lines.length) return; const d = doc.createElement('div'); if (i === 0) d.innerHTML = `<b>${esc(lines[i])}</b>`; else if (i === lines.length - 1 && lines.length > 3) d.className = 'jv-hl', d.textContent = lines[i]; else d.textContent = lines[i]; $('boot').appendChild(d); i++; win.setTimeout(next, 420); };
    next();
  }
  $('win').onclick = e => { const b = e.target.closest('button[data-w]'); if (b) load(+b.dataset.w); };
  $('spin').onclick = () => { st.spin = !st.spin; $('spin').setAttribute('aria-pressed', String(st.spin)); };

  // ── the modules: CHAIN (the 3D view), ASK, RADAR, BRIEF, SYSTEM. All reuse routes the terminal already has; nothing here trades or forecasts. ──
  const MODS = [['chain', 'CHAIN'], ['ask', 'ASK'], ['radar', 'RADAR'], ['brief', 'BRIEF'], ['system', 'SYSTEM']];
  $('mods').innerHTML = MODS.map(([id, l]) => `<button type="button" data-m="${id}" aria-pressed="${id === 'chain'}">${l}</button>`).join(' ');
  const jf = (u, o) => win.fetch(u, o).then(r => r.json());
  const say = t => { try { if (!st.voice || !win.speechSynthesis) return; win.speechSynthesis.cancel(); const u = new win.SpeechSynthesisUtterance(String(t).slice(0, 1200)); u.lang = 'en-GB'; win.speechSynthesis.speak(u); } catch (e) { /* no voice */ } };
  const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));
  const R = {
    ask() {
      const p = $('pane'), pre = st.sel && CHAIN_NODES[st.sel] ? `What is going on with ${CHAIN_NODES[st.sel].label} and the links around it today?` : '';
      p.innerHTML = `<h3>ASK JARVIS</h3><p>One answer from today's book, the analysts' reports, the desk's memory and the Evidence Book. It cites what it used and says when the data does not answer. Each question is one model call, owner only, 60 a day.</p>
<textarea id="${ID}-q" placeholder="Why is the desk short USD/JPY when the Fed is hawkish?">${esc(pre)}</textarea>
<div class="jv-row"><button type="button" id="${ID}-go">ASK</button><button type="button" id="${ID}-mic" title="Speak your question">SPEAK</button><button type="button" id="${ID}-voice" aria-pressed="${st.voice}">VOICE REPLY</button><span id="${ID}-st" class="jv-sub"></span></div><div id="${ID}-ans"></div>`;
      const q = p.querySelector(`#${ID}-q`), stt = p.querySelector(`#${ID}-st`), ans = p.querySelector(`#${ID}-ans`);
      const go = async () => {
        const text = q.value.trim(); if (text.length < 3) return;
        stt.textContent = 'Thinking…'; ans.textContent = '';
        const r = await jf('/api/desk-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text }) }).catch(e => ({ ok: false, error: e.message }));
        stt.textContent = r.ok ? (r.model ?? '') : '';
        ans.innerHTML = r.ok ? `<div class="jv-ans">${esc(r.answer)}</div>${(r.sources ?? []).map(x => `<span class="jv-src">${esc(x)}</span>`).join('')}` : `<p class="jv-dn">${esc(r.error ?? 'No answer')}</p>`;
        if (r.ok) say(r.answer);
      };
      p.querySelector(`#${ID}-go`).onclick = go;
      p.querySelector(`#${ID}-voice`).onclick = e => { st.voice = !st.voice; e.currentTarget.setAttribute('aria-pressed', String(st.voice)); if (!st.voice) win.speechSynthesis?.cancel(); };
      p.querySelector(`#${ID}-mic`).onclick = () => {
        const SRc = win.SpeechRecognition || win.webkitSpeechRecognition; if (!SRc) { stt.textContent = 'Voice input is not supported in this browser.'; return; }
        const rec = new SRc(); rec.lang = 'en-GB'; rec.onresult = ev => { q.value = ev.results[0][0].transcript; st.voice = true; go(); }; rec.onerror = () => { stt.textContent = 'Could not hear that.'; }; stt.textContent = 'Listening…'; rec.start();
      };
    },
    radar() {
      const p = $('pane'), r = st.graph ? radarRank(st.graph, names) : { items: [], broken: [] };
      p.innerHTML = `<h3>WHAT'S UNUSUAL · ${st.win}D</h3><p>Moves ranked by size against each series' own normal noise, broken links first. Unusual here means big for that series over this window. It describes the tape; it does not say what comes next.</p>`
        + (r.broken.length ? `<p class="jv-am"><b>${r.broken.length} textbook link${r.broken.length === 1 ? '' : 's'} broken:</b> ${r.broken.map(b => esc(b.short)).join(' · ')}</p>` : '')
        + (r.items.length ? r.items.map(i => `<button type="button" class="jv-item" data-k="${i.key}"><b class="${i.tone === 'wrong' ? 'jv-am' : i.tone === 'up' ? 'jv-up' : 'jv-dn'}">${esc(i.label)} ${esc(i.text)}</b><br><span class="jv-sub">${esc(i.why)}</span></button>`).join('') : '<p>Nothing is beyond its normal noise over this window.</p>');
      p.onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { st.sel = b.dataset.k; st.spin = false; $('spin').setAttribute('aria-pressed', 'false'); } };
    },
    async brief() {
      const p = $('pane'); p.innerHTML = '<h3>BRIEFING</h3><p>Reading the stored chain read…</p>';
      const d = await jf(`/api/chain-read?window=${st.win}`).catch(() => null), r = d?.read && typeof d.read === 'object' ? d.read : d;
      if (!d?.ok || !r) { p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3><p>No chain read has been written for the ${st.win}-day window today. Writing one is a model call: press Refresh on the Chain tab's read. Until then, the numbers are on the CHAIN and RADAR views.</p>`; return; }
      const paras = String(r.read ?? '').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
      p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3>${r.hook ? `<p class="jv-ans"><b>“${esc(r.hook)}”</b></p>` : ''}${paras.map(x => `<p>${esc(x)}</p>`).join('')}${r.next ? `<p><b>Next:</b> ${esc(r.next)}</p>` : ''}<div class="jv-row"><button type="button" id="${ID}-say">READ IT TO ME</button></div><p class="jv-sub">Written ${esc(d.generatedAt ?? '')}. An opinion in a trader's voice, not backtested, not a forecast. One read per window per day, shared by everyone.</p>`;
      p.querySelector(`#${ID}-say`).onclick = () => { const was = st.voice; st.voice = true; say([r.hook, ...paras].filter(Boolean).join('. ')); st.voice = was; };
    },
    async system() {
      const p = $('pane'); p.innerHTML = '<h3>SYSTEM</h3><p>Reading the server…</p>';
      const sm = systemSummary(await jf('/api/services').catch(() => null));
      if (!sm.ok) { p.innerHTML = '<h3>SYSTEM</h3><p>The server did not answer the health route.</p>'; return; }
      const n = v => (v == null ? 'n/a' : v);
      p.innerHTML = `<h3>SYSTEM</h3><p>This is the web server only, not the whole Railway project. Memory is the biggest part of the Railway bill; the peak is the highest minute sample since the last deploy.</p>
<table><tr><td>Memory now</td><td>${n(sm.rssMB)} MB</td></tr><tr><td>Memory peak since deploy</td><td>${n(sm.peakRssMB)} MB</td></tr><tr><td>JS heap in use</td><td>${n(sm.heapUsedMB)} MB</td></tr><tr><td>Up for</td><td>${n(sm.uptimeH)} h</td></tr><tr><td>Services switched on</td><td>${n(sm.enabled)} of ${n(sm.total)}</td></tr></table>
<h3 style="margin-top:12px">BUSIEST TODAY</h3><table>${sm.top.map(t => `<tr><td>${esc(t.id)}</td><td>${t.minutes} min · ${t.runs} runs${t.errors ? ` · <span class="jv-am">${t.errors} errors</span>` : ''}</td></tr>`).join('') || '<tr><td>nothing measured yet</td><td></td></tr>'}</table>`;
    },
  };
  function setMod(m) {
    st.mod = m; win.speechSynthesis?.cancel();
    for (const b of $('mods').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.m === m));
    $('pane').hidden = m === 'chain'; $('pane').onclick = null; $('boot').style.display = m === 'chain' ? '' : 'none';
    if (m === 'chain') showCard(); else { $('card').hidden = true; R[m]?.(); }
  }
  $('mods').onclick = e => { const b = e.target.closest('button[data-m]'); if (b) setMod(b.dataset.m); };

  // interaction
  cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture?.(e.pointerId); });
  cv.addEventListener('pointermove', e => { const d = st.drag; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy); st.yaw += dx * 0.006; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.004)); });
  cv.addEventListener('pointerup', e => { const d = st.drag; st.drag = null; if (d && d.moved < 5) pick(e.clientX, e.clientY); });
  cv.addEventListener('wheel', e => { e.preventDefault(); st.zoom = Math.max(0.5, Math.min(2.6, st.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect(); let best = null, bd = 28 * 28;
    for (const p of st.proj) { const dx = p.sx - (cx - r.left), dy = p.sy - (cy - r.top), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p.key; } }
    st.sel = best; showCard();
  }
  function showCard() {
    const card = $('card'), k = st.sel; if (st.mod !== 'chain' || !k || !st.graph) { card.hidden = true; return; }
    const n = st.graph.nodes.find(x => x.key === k), meta = CHAIN_NODES[k]; if (!n || !meta) { card.hidden = true; return; }
    const links = st.graph.edges.filter(e => e.from === k || e.to === k);
    card.innerHTML = `<h3>${esc(meta.label)}</h3><div>${n.end?.delta == null ? 'no data over this window' : `<b>${esc(n.end.text)}</b> over ${st.win} day${st.win === 1 ? '' : 's'}${n.end.moved ? '' : ' · inside its noise'}`}</div><p>${esc(meta.what)}</p>`
      + (links.length ? `<div style="margin-top:8px">${links.map(e => `<p><span class="jv-k ${e.verdict === 'holding' ? 'jv-hold' : e.verdict === 'broken' ? 'jv-broke' : ''}">${esc(VERDICT_WORD[e.verdict] ?? e.verdict)}</span><b>${esc(e.short)}</b><br>${esc(String(e.link.read ?? '').slice(0, 260))}</p>`).join('')}</div>` : '');
    card.hidden = false;
  }

  // drawing
  const col = tone => tone === 'up' ? C.up : tone === 'dn' ? C.dn : tone === 'wrong' ? C.gold : tone === 'quiet' ? C.tx2 : C.tx2;
  function ring(y, rad, alpha) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = project([Math.cos(a) * rad, y, Math.sin(a) * rad], cam()); const X = cx() + p.x * sc(), Y = cy() + p.y * sc(); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.globalAlpha = alpha; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.stroke();
  }
  const cam = () => ({ yaw: st.yaw, pitch: st.pitch, zoom: st.zoom }), cx = () => st.w / 2, cy = () => st.h / 2 - 10, sc = () => Math.min(st.w * 0.6, st.h) * 0.3;
  const sp = (p3) => { const p = project(p3, cam()); return { x: cx() + p.x * sc(), y: cy() + p.y * sc(), s: p.s, z: p.z }; };
  let raf = 0, last = performance.now();
  function frame(now) {
    if (!open) return; raf = win.requestAnimationFrame(frame);
    if (doc.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; if (st.spin && !st.drag) st.yaw += dt * 0.12;
    const t = (now - st.t0) / 1000;
    ctx.clearRect(0, 0, st.w, st.h);
    // the hologram frame: rings top and bottom, a faint axis, slow pulse
    ctx.lineWidth = 1; for (const [y, r, a] of [[-1.05, 1.35, 0.5], [-1.05, 1.15, 0.25], [1.05, 1.35, 0.5], [1.05, 1.15, 0.25], [0, 1.45, 0.12]]) ring(y, r, a * (0.8 + 0.2 * Math.sin(t * 1.4)));
    ctx.globalAlpha = 0.18; ctx.strokeStyle = C.blue; { const a = sp([0, -1.05, 0]), b = sp([0, 1.05, 0]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const g = st.graph; st.proj = [];
    if (!g) { ctx.globalAlpha = 1; return; }
    const by = Object.fromEntries(g.nodes.map(n => [n.key, n])), selK = st.sel;
    // threads
    for (const e of g.edges) {
      const a = by[e.from], b = by[e.to]; if (!a || !b) continue;
      const hot = e.verdict === 'holding' || e.verdict === 'broken', touch = selK && (e.from === selK || e.to === selK);
      if (!hot && !touch && e.verdict !== 'quiet') continue;
      const colr = e.verdict === 'broken' ? C.gold : e.verdict === 'holding' ? C.blue : C.tx2;
      const N = 22, pts = []; for (let i = 0; i <= N; i++) pts.push(sp(arcPoint(a.pos, b.pos, i / N)));
      const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length, fade = Math.max(0.12, Math.min(1, 0.75 - depth * 0.35));
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.globalAlpha = (hot ? 0.6 : touch ? 0.55 : 0.2) * fade; ctx.strokeStyle = colr; ctx.lineWidth = e.verdict === 'broken' ? 2.4 : hot ? 1.6 : 0.8; ctx.stroke();
      if (hot || touch) {
        const spd = e.verdict === 'broken' ? 0.5 : 0.28;
        for (let k = 0; k < 3; k++) { const u = (t * spd + k / 3) % 1, q = sp(arcPoint(a.pos, b.pos, u)); ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(q.x, q.y, (e.verdict === 'broken' ? 3.2 : 2.4) * q.s, 0, 6.2832); ctx.fill(); }
      }
    }
    // nodes, far to near
    const ns = g.nodes.map(n => ({ n, p: sp(n.pos) })).sort((u, v) => v.p.z - u.p.z);
    for (const { n, p } of ns) {
      const fade = Math.max(0.3, Math.min(1, 0.85 - p.z * 0.3)), r = (5 + n.style.size * 13) * p.s * 1.05, c = col(n.style.tone), pulse = n.style.tone === 'wrong' ? 1 + 0.18 * Math.sin(t * 4) : 1;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2 * pulse); grad.addColorStop(0, c); grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = (n.style.tone === 'quiet' || n.style.tone === 'none' ? 0.18 : 0.5) * fade; ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2 * pulse, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = fade; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55 * pulse, 0, 6.2832); ctx.fill();
      if (selK === n.key) { ctx.strokeStyle = C.tx; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, 6.2832); ctx.stroke(); }
      if (p.z < 0.6 || selK === n.key) { ctx.globalAlpha = fade * (n.style.tone === 'quiet' ? 0.6 : 1); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 3 * p.s)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(CHAIN_NODES[n.key] ? shortLabel(CHAIN_NODES[n.key]) : n.key, p.x, p.y + r * 1.9 + 8); }
      st.proj.push({ key: n.key, sx: p.x, sy: p.y });
    }
    ctx.globalAlpha = 1;
  }

  const close = () => {
    if (!open) return; open = null; win.cancelAnimationFrame(raf); win.removeEventListener('resize', resize); win.speechSynthesis?.cancel(); doc.removeEventListener('keydown', onKey, true); root.remove();
  };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  doc.addEventListener('keydown', onKey, true);
  $('x').onclick = close;
  open = { close };
  raf = win.requestAnimationFrame(frame);
  await load(st.win);
  return true;
}

export const closeJarvis = () => open?.close();
