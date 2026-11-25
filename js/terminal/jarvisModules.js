// js/terminal/jarvisModules.js: the plug-in list for Jarvis's panels. A module is { id, label, render(pane, api), drawGlobe?(ctx, g, api) } and registers itself with registerJarvisModule().
// Each lives in its own file (jarvisMod<Name>.js) listed in MODULE_FILES; a file that is missing or throws is skipped, so one panel can never break the HUD.
//   render(pane, api): fill the pane element (innerHTML) and wire its buttons. Called every time the module's button is pressed.
//   drawGlobe(ctx, g, api): optional, called every frame after the globe's own markers. g = { P(vec, h) -> {x, y, z} (z > 0 faces the viewer), X, Y, Rg (centre and radius in px), ctr: { lat, lon }, t (seconds), fade, zoom }.
//   views?: [{ id, label, draw(ctx, g, api), onEnter?(api), onLeave?(api) }]: extra 3D views that appear as buttons beside GLOBE / CANDLES / ... and are drawn every frame while selected.
//     env (optional, per view): { accent: a theme token name ('blue2' 'pur' 'gold' 'up' 'dn'), chrome: 'clean' (hides the big readout, region buttons and briefing so the view has the whole screen), scan: false (no scanlines) }.
//     Switching to a view re-themes the WHOLE HUD to its env: the background glow, the borders and buttons, the title and g.C.blue all follow the accent, so every analysis has its own world.
//     g = { t (seconds), fade (0..1), dt, W, H (canvas px), cx, cy (screen centre), SC (a scale that fits the screen), proj(p3, cam?) -> { x, y, s, z } (project a 3D point with the HUD's camera (st.yaw/pitch/zoom) unless you pass your own),
//           poly(idx, pts, fill, alpha, stroke), hit(key, x, y) (make something clickable: a click sets st.sel = key), C (theme colours: up dn gold blue tx tx2 cy) }.
//   scenes: a module may ALSO register a SHOW scene through showCore.registerShowScene (see js/terminal/showCore.js).
//   api: { ID, st (the HUD state: win, sel, graph, dates, idx, view ...), $(sel) (a HUD element by id suffix), jf(url, opts) (fetch JSON), esc, say(text, force), blip(freq, dur), names (node key -> label),
//          doc, win (the window), setMod(id), ask(question) (opens ASK and asks), tcol(tone), colours() }.
// Everything a module draws is DESCRIPTION ONLY: never a forecast, never a trade. A module that spends money (a model call) must be owner-only on the server and capped.
export const EXTRA = [];
export const registerJarvisModule = m => { if (m?.id && typeof m.render === 'function' && !EXTRA.some(x => x.id === m.id)) EXTRA.push(m); return m; };
export const MODULE_FILES = ['./jarvisModPrecedent.js', './jarvisModPapers.js', './jarvisModExplain.js', './jarvisModFilm.js', './jarvisModMarkets.js', './jarvisModShow.js', './jarvisViewSession.js', './jarvisViewBook.js', './jarvisViewChain.js', './jarvisViewYields.js', './jarvisViewWx.js', './jarvisViewCcy.js', './jarvisViewNet.js', './jarvisViewVol.js', './jarvisViewGamma.js', './jarvisModNews.js',
  // the hologram views (WebGL, js/terminal/jarvisGL.js); a file that is not there yet is simply skipped
  './jarvisViewReactor.js', './jarvisViewGammaPillar.js', './jarvisViewGammaTerrain.js', './jarvisViewVolSurface.js', './jarvisViewRatePaths.js', './jarvisViewFxMatrix.js', './jarvisViewDayAhead.js', './jarvisViewSurprise.js', './jarvisViewShockwave.js', './jarvisViewCot.js', './jarvisViewCycle.js', './jarvisViewMoneyGlobe.js', './jarvisViewBoard.js', './broadcastPanels.js', './jarvisModBroadcast.js'];
export const viewsOf = () => EXTRA.flatMap(m => (Array.isArray(m.views) ? m.views : []));
export async function loadModules() { await Promise.all(MODULE_FILES.map(f => import(f).catch(() => null))); return EXTRA; }
