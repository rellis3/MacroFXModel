// js/terminal/mediaView.js: the MEDIA section, drawn into any element. Used by the desk terminal's Media tab (tab.media, owner only) and Helix's MEDIA panel
// (js/terminal/jarvisModMedia.js). Data: GET /api/helix/media (owner only; js/jarvis/helixMedia.js). The pure half (days, order, filters, resume) is mediaCore.js.
//   VIDEOS   every H.E.L.I.X. video by London day, newest first, programmes in broadcast order; a card plays in place (youtube-nocookie, one player at a time).
//   PODCAST  the episodes by day and one audio player: play/pause, scrubber, 1x / 1.25x / 1.5x, the place in each episode kept in this browser.
// Unlisted videos stay unlisted: nothing here lists them anywhere, it only embeds them for the owner. Description only.
import { groupByDay, filterItems, partsIn, clock, thumbUrl, embedUrl, watchUrl, londonTime, londonDate, resumeAt, nextSpeed, trimPositions, safeSrc, PART_LABEL } from './mediaCore.js';

const LS_POS = 'helixMedia:pos:v1', LS_UI = 'helixMedia:ui:v1';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window or blocked storage: the page works without it */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
.mx{--mxa:var(--jva,var(--blue2,#4fb3ff));color:var(--tx,#eef0fb);font:13px/1.45 Inter,"Segoe UI",system-ui,sans-serif;max-width:1400px;margin:0 auto;padding:12px 16px 24px;box-sizing:border-box}
.mx *{box-sizing:border-box}
.mx.hx{padding:0;font-size:12px}   /* inside Helix's pane, which scrolls and pads itself */
.mx-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:10px}
.mx-h{font:600 12px/1 var(--mono,ui-monospace,monospace);letter-spacing:.22em;color:var(--mxa);margin-right:auto}
.mx-seg{display:inline-flex;border:1px solid var(--line2,#2c3866);border-radius:8px;overflow:hidden}
.mx-seg button,.mx-btn{background:var(--bg1,#0c1124);color:var(--tx2,#a9b0d0);border:0;padding:6px 12px;font:600 11px/1 var(--mono,monospace);letter-spacing:.12em;cursor:pointer}
.mx-btn{border:1px solid var(--line2,#2c3866);border-radius:8px;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.mx-seg button[aria-pressed=true]{background:color-mix(in srgb,var(--mxa) 22%,var(--bg1,#0c1124));color:var(--tx,#fff)}
.mx-btn:hover,.mx-seg button:hover{color:var(--tx,#fff)}
.mx-f{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.mx-f select,.mx-f input{background:var(--bg1,#0c1124);color:var(--tx,#eef0fb);border:1px solid var(--line2,#2c3866);border-radius:8px;padding:6px 8px;font:inherit;min-width:0}
.mx-f input[type=search]{flex:1 1 180px}
.mx-f label{display:inline-flex;align-items:center;gap:6px;color:var(--tx3,#8088ae);font-size:11px}
.mx-n{color:var(--tx3,#8088ae);font-size:11px;margin:-4px 0 10px}
.mx-day{margin:14px 0 8px;display:flex;align-items:center;gap:10px;font:600 12px/1 var(--mono,monospace);letter-spacing:.16em;color:var(--tx2,#a9b0d0)}
.mx-day::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line2,#2c3866),transparent)}
.mx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:12px}
.mx-card{background:var(--bg1,#0c1124);border:1px solid var(--line,#1f2950);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.mx-card.on{grid-column:1/-1;border-color:var(--mxa)}
.mx-media{position:relative;aspect-ratio:16/9;background:#000;display:block;width:100%;border:0;padding:0;cursor:pointer}
.mx-media img{width:100%;height:100%;object-fit:cover;display:block;opacity:.9}
.mx-media:hover img{opacity:1}
.mx-media iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.mx-card.on .mx-media{max-width:960px;margin:0 auto}
.mx-play{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:color-mix(in srgb,#000 55%,transparent);border:1px solid color-mix(in srgb,#fff 55%,transparent);display:grid;place-items:center}
.mx-play::before{content:"";margin-left:4px;border-left:14px solid #fff;border-top:9px solid transparent;border-bottom:9px solid transparent}
.mx-len{position:absolute;right:6px;bottom:6px;background:color-mix(in srgb,#000 75%,transparent);color:#fff;font:600 11px/1 var(--mono,monospace);padding:3px 5px;border-radius:4px}
.mx-badge{display:inline-block;font:600 10px/1 var(--mono,monospace);letter-spacing:.12em;padding:3px 6px;border-radius:4px;border:1px solid var(--line2,#2c3866);color:var(--tx2,#a9b0d0)}
.mx-badge.morning{color:var(--gold,#e8b85a);border-color:color-mix(in srgb,var(--gold,#e8b85a) 50%,transparent)}
.mx-badge.evening{color:var(--pur2,#b4a9ff);border-color:color-mix(in srgb,var(--pur2,#b4a9ff) 50%,transparent)}
.mx-badge.short{color:var(--teal,#5fd0c9);border-color:color-mix(in srgb,var(--teal,#5fd0c9) 50%,transparent)}
.mx-badge.weekly,.mx-badge.special{color:var(--up,#2fd39a);border-color:color-mix(in srgb,var(--up,#2fd39a) 50%,transparent)}
.mx-body{padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;flex:1}
.mx-t{font-weight:500;color:var(--tx,#eef0fb);overflow-wrap:anywhere}
.mx-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;color:var(--tx3,#8088ae);font-size:11px;margin-top:auto}
.mx-meta a{color:var(--mxa);text-decoration:none}.mx-meta a:hover{text-decoration:underline}
.mx-empty{color:var(--tx2,#a9b0d0);padding:18px;border:1px dashed var(--line2,#2c3866);border-radius:10px;text-align:center}
.mx-player{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--bg,#070a17) 92%,transparent);backdrop-filter:blur(6px);border:1px solid var(--line2,#2c3866);border-radius:12px;padding:10px 12px;margin-bottom:12px;display:grid;grid-template-columns:auto 1fr auto;gap:6px 12px;align-items:center}
.mx-pp{width:42px;height:42px;border-radius:50%;border:1px solid var(--mxa);background:color-mix(in srgb,var(--mxa) 18%,transparent);color:var(--tx,#fff);font-size:16px;cursor:pointer}
.mx-pp:disabled{opacity:.4;cursor:default}
.mx-now{min-width:0}.mx-now .mx-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-scrub{grid-column:1/-1;display:flex;align-items:center;gap:8px;font:11px/1 var(--mono,monospace);color:var(--tx2,#a9b0d0)}
.mx-scrub input{flex:1;min-width:0;accent-color:var(--mxa)}
.mx-ep{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--bg1,#0c1124);border:1px solid var(--line,#1f2950);border-radius:10px;padding:8px 10px;margin-bottom:6px;color:var(--tx,#eef0fb);cursor:pointer;font:inherit}
.mx-ep.on{border-color:var(--mxa)}
.mx-ep .mx-t{flex:1;min-width:0}
.mx-ep small{color:var(--tx3,#8088ae);font-size:11px;white-space:nowrap}
.mx-bar{height:3px;border-radius:2px;background:var(--line,#1f2950);margin-top:4px;overflow:hidden}.mx-bar i{display:block;height:100%;background:var(--mxa)}
.mx-note{color:var(--tx3,#8088ae);font-size:11px;margin-top:14px}
@media (max-width:560px){.mx{padding:10px 16px 20px}.mx-f select,.mx-f label{flex:1 1 45%}.mx-f label input{flex:1}}
`;

/**
 * Draw the MEDIA section into `root`. opts: { variant: 'desk' | 'helix', win, doc, fetch }. Returns { refresh(), destroy() }.
 * A second mount on the same root replaces the first (its audio is stopped).
 */
export function mount(root, opts = {}) {
  const win = opts.win ?? globalThis.window, doc = opts.doc ?? root.ownerDocument, fetchFn = opts.fetch ?? ((u, o) => win.fetch(u, o));
  root.__mxDestroy?.(); ACTIVE.get(opts.variant ?? 'desk')?.destroy();   // a re-mount (Helix redraws its pane) never leaves an orphaned player behind
  if (!doc.getElementById('mx-css')) { const s = doc.createElement('style'); s.id = 'mx-css'; s.textContent = CSS; doc.head.appendChild(s); }
  const ui = { tab: 'videos', part: '', from: '', to: '', q: '', ...pick(lsGet(LS_UI), ['tab']) };
  const S = { videos: [], podcasts: [], feed: null, err: null, loaded: false, ep: null, speed: 1 };
  const year = new Date().getFullYear();
  root.innerHTML = `<div class="mx${opts.variant === 'helix' ? ' hx' : ''}" data-mx></div>`;
  const box = root.querySelector('[data-mx]');
  const audio = doc.createElement('audio'); audio.preload = 'metadata'; AUDIOS.add(audio);
  let lastSave = 0;

  const savePos = (force = false) => {
    if (!S.ep || !Number.isFinite(audio.currentTime)) return;
    const now = Date.now(); if (!force && now - lastSave < 4000) return; lastSave = now;
    const m = lsGet(LS_POS); m[S.ep.id] = { t: Math.round(audio.currentTime), d: Math.round(audio.duration || S.ep.seconds || 0), at: now }; lsPut(LS_POS, trimPositions(m));
  };
  audio.addEventListener('timeupdate', () => { savePos(); paintScrub(); });
  audio.addEventListener('pause', () => { savePos(true); paintPP(); });
  audio.addEventListener('play', () => { for (const a of AUDIOS) if (a !== audio && !a.paused) a.pause(); paintPP(); });   // one player at a time across the tab and Helix
  audio.addEventListener('ended', () => { const m = lsGet(LS_POS); if (S.ep) delete m[S.ep.id]; lsPut(LS_POS, m); paintPP(); });
  audio.addEventListener('loadedmetadata', () => { const at = resumeAt(lsGet(LS_POS)[S.ep?.id]?.t, audio.duration); if (at) audio.currentTime = at; audio.playbackRate = S.speed; paintScrub(); });
  audio.addEventListener('error', () => { const n = box.querySelector('[data-pnote]'); if (n) n.textContent = 'This episode could not be loaded (the feed key or the file is missing on the server).'; });

  function filtersHtml(list) {
    const parts = partsIn(list);
    return `<div class="mx-f">
      <select data-f="part" aria-label="Programme"><option value="">All programmes</option>${parts.map(p => `<option value="${p}"${ui.part === p ? ' selected' : ''}>${esc(PART_LABEL[p] ?? p)}</option>`).join('')}</select>
      <label>From <input type="date" data-f="from" value="${esc(ui.from)}"></label><label>To <input type="date" data-f="to" value="${esc(ui.to)}"></label>
      <input type="search" data-f="q" placeholder="Search titles" value="${esc(ui.q)}" aria-label="Search titles">
    </div>`;
  }
  const head = () => `<div class="mx-top"><span class="mx-h">MEDIA · H.E.L.I.X.</span>
    <span class="mx-seg" role="group" aria-label="Section"><button data-tab="videos" aria-pressed="${ui.tab === 'videos'}">VIDEOS ${S.videos.length || ''}</button><button data-tab="podcast" aria-pressed="${ui.tab === 'podcast'}">PODCAST ${S.podcasts.length || ''}</button></span>
    ${S.feed ? '<button class="mx-btn" data-copy>COPY FEED LINK</button>' : ''}<button class="mx-btn" data-reload title="Fetch the list again">↻</button></div>`;

  function videosHtml() {
    const list = filterItems(S.videos, ui), days = groupByDay(list, year);
    const cards = days.map(d => `<div class="mx-day">${esc(d.label)}</div><div class="mx-grid">${d.items.map(v => `<div class="mx-card" data-card="${esc(v.id)}">
        <button class="mx-media" data-play="${esc(v.id)}" aria-label="Play ${esc(v.title)}"><img loading="lazy" alt="" src="${esc(thumbUrl(v.id))}"><span class="mx-play"></span>${v.seconds ? `<span class="mx-len">${esc(clock(v.seconds))}</span>` : ''}</button>
        <div class="mx-body"><div class="mx-t">${esc(v.title)}</div>
        <div class="mx-meta"><span class="mx-badge ${esc(v.part)}">${esc(PART_LABEL[v.part] ?? v.part)}</span><span>${esc(londonTime(v.at))}</span><a href="${esc(watchUrl(v.id, v.format))}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a></div></div></div>`).join('')}</div>`).join('');
    return `${filtersHtml(S.videos)}<div class="mx-n">${list.length} of ${S.videos.length} video${S.videos.length === 1 ? '' : 's'} · unlisted on YouTube, shown only to you</div>
      ${cards || `<div class="mx-empty">${S.videos.length ? 'No video matches these filters.' : 'No videos yet. They appear here as the laptop uploads them; earlier ones come in with jarvis_broadcast/backfill_media.py.'}</div>`}`;
  }

  function podcastHtml() {
    const list = filterItems(S.podcasts, ui), days = groupByDay(list, year), pos = lsGet(LS_POS);
    const ep = S.ep;
    const player = `<div class="mx-player"><button class="mx-pp" data-pp ${ep ? '' : 'disabled'} aria-label="Play or pause">${audio.paused ? '▶' : '❚❚'}</button>
      <div class="mx-now"><div class="mx-t">${ep ? esc(ep.title) : 'Pick an episode below'}</div><div class="mx-meta" data-pnote>${ep ? `${esc(PART_LABEL[ep.part] ?? '')} · ${esc(londonDate(ep.at) ?? '')}` : 'The place in each episode is kept in this browser.'}</div></div>
      <button class="mx-btn" data-speed aria-label="Playback speed">${S.speed}×</button>
      <div class="mx-scrub"><span data-cur>0:00</span><input type="range" min="0" max="1000" value="0" step="1" data-scrub aria-label="Position" ${ep ? '' : 'disabled'}><span data-dur>${ep?.seconds ? esc(clock(ep.seconds)) : '0:00'}</span></div></div>`;
    const rows = days.map(d => `<div class="mx-day">${esc(d.label)}</div>${d.items.map(e => {
      const p = pos[e.id], frac = p && (p.d || e.seconds) ? Math.min(1, p.t / (p.d || e.seconds)) : 0;
      return `<button class="mx-ep${ep?.id === e.id ? ' on' : ''}" data-ep="${esc(e.id)}"><span class="mx-badge ${esc(e.part)}">${esc(PART_LABEL[e.part] ?? 'EPISODE')}</span>
        <span class="mx-t">${esc(e.title)}${frac > 0.01 ? `<span class="mx-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></span>` : ''}</span><small>${esc(clock(e.seconds))}</small></button>`;
    }).join('')}`).join('');
    return `${player}${filtersHtml(S.podcasts)}${rows || `<div class="mx-empty">${S.podcasts.length ? 'No episode matches these filters.' : S.feed ? 'No episodes yet.' : 'The podcast feed is off on the server (no HELIX_PODCAST_KEY).'}</div>`}
      <div class="mx-note">The feed link opens in any podcast app. It is private: anyone with the link can listen, so keep it to yourself.</div>`;
  }

  function paint() {
    if (!S.loaded) { box.innerHTML = `${head()}<div class="mx-empty">Loading…</div>`; return; }
    if (S.err) { box.innerHTML = `${head()}<div class="mx-empty">${esc(S.err)}</div>`; return; }
    box.innerHTML = head() + (ui.tab === 'podcast' ? podcastHtml() : videosHtml());
    paintScrub();
  }
  function paintPP() { const b = box.querySelector('[data-pp]'); if (b) b.textContent = audio.paused ? '▶' : '❚❚'; }
  function paintScrub() {
    const r = box.querySelector('[data-scrub]'); if (!r || !S.ep) return;
    const d = audio.duration || S.ep.seconds || 0;
    if (!r.matches(':active')) r.value = d ? String(Math.round((audio.currentTime / d) * 1000)) : '0';
    box.querySelector('[data-cur]').textContent = clock(audio.currentTime || 0); box.querySelector('[data-dur]').textContent = clock(d);
  }
  function stopVideos() { box.querySelectorAll('.mx-card.on').forEach(c => { c.classList.remove('on'); const m = c.querySelector('.mx-media'); m.querySelector('iframe')?.remove(); m.querySelectorAll('img,.mx-play,.mx-len').forEach(x => { x.hidden = false; }); }); }
  function playVideo(id) {
    const card = box.querySelector(`[data-card="${CSS_ID(id)}"]`); if (!card || card.classList.contains('on')) return;
    stopVideos(); if (!audio.paused) audio.pause();
    const m = card.querySelector('.mx-media'), f = doc.createElement('iframe');
    f.src = embedUrl(id); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.title = card.querySelector('.mx-t')?.textContent ?? 'video';
    m.querySelectorAll('img,.mx-play,.mx-len').forEach(x => { x.hidden = true; }); m.appendChild(f); card.classList.add('on');
    card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  function pickEpisode(id) {
    const e = S.podcasts.find(x => x.id === id), src = safeSrc(e?.src); if (!e || !src) return;
    if (S.ep?.id === id) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
    savePos(true); S.ep = e; audio.src = src; audio.playbackRate = S.speed; audio.play().catch(() => {}); paint();
  }

  box.addEventListener('click', ev => {
    const t = ev.target.closest('button,a'); if (!t || !box.contains(t)) return;
    if (t.dataset.tab) { ui.tab = t.dataset.tab; lsPut(LS_UI, { tab: ui.tab }); if (ui.tab === 'podcast') stopVideos(); paint(); }
    else if (t.dataset.play) playVideo(t.dataset.play);
    else if (t.dataset.ep) pickEpisode(t.dataset.ep);
    else if ('pp' in t.dataset) { if (S.ep) audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
    else if ('speed' in t.dataset) { S.speed = nextSpeed(S.speed); audio.playbackRate = S.speed; t.textContent = `${S.speed}×`; }
    else if ('copy' in t.dataset) copyFeed(t);
    else if ('reload' in t.dataset) load();
  });
  box.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.f) { ui[t.dataset.f] = t.value; const keep = t.dataset.f === 'q' ? t.selectionStart : null; paint(); if (keep != null) { const q = box.querySelector('[data-f="q"]'); q?.focus(); q?.setSelectionRange(keep, keep); } }
    else if ('scrub' in t.dataset) { const d = audio.duration || S.ep?.seconds || 0; if (d) { audio.currentTime = (+t.value / 1000) * d; paintScrub(); } }
  });
  async function copyFeed(btn) {
    const url = `${win.location.origin}${S.feed}`;
    try { await win.navigator.clipboard.writeText(url); btn.textContent = 'COPIED'; } catch (e) { win.prompt?.('The private podcast feed:', url); }
    setTimeout(() => { btn.textContent = 'COPY FEED LINK'; }, 1800);
  }

  async function load() {
    S.loaded = false; paint();
    try {
      const r = await fetchFn('/api/helix/media', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (r.status === 401 || r.status === 403) throw new Error('Media is owner only: sign in with the main login.');
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ? `The media list did not load: ${j.error}` : `The media list did not load (HTTP ${r.status}).`);
      S.videos = Array.isArray(j.videos) ? j.videos : []; S.podcasts = Array.isArray(j.podcasts) ? j.podcasts : []; S.feed = typeof j.podcastFeed === 'string' && j.podcastFeed.startsWith('/api/helix/podcast/') ? j.podcastFeed : null; S.err = null;
    } catch (e) { S.err = e.message; }
    S.loaded = true; paint();
  }
  const destroy = () => { savePos(true); audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) { /* ignore */ } AUDIOS.delete(audio); if (ACTIVE.get(opts.variant ?? 'desk')?.destroy === destroy) ACTIVE.delete(opts.variant ?? 'desk'); };
  root.__mxDestroy = destroy; ACTIVE.set(opts.variant ?? 'desk', { destroy });
  load();
  return { refresh: load, destroy };
}

const AUDIOS = new Set(), ACTIVE = new Map();
const CSS_ID = id => String(id).replace(/[^A-Za-z0-9_-]/g, '');
function pick(o, keys) { const out = {}; for (const k of keys) if (o?.[k] != null) out[k] = o[k]; return out; }
