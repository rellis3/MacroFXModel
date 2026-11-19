// js/terminal/jarvisModules.js: the plug-in list for Jarvis's panels. A module is { id, label, render(pane, api), drawGlobe?(ctx, g, api) } and registers itself with registerJarvisModule().
// Each lives in its own file (jarvisMod<Name>.js) listed in MODULE_FILES; a file that is missing or throws is skipped, so one panel can never break the HUD.
//   render(pane, api): fill the pane element (innerHTML) and wire its buttons. Called every time the module's button is pressed.
//   drawGlobe(ctx, g, api): optional, called every frame after the globe's own markers. g = { P(vec, h) -> {x, y, z} (z > 0 faces the viewer), X, Y, Rg (centre and radius in px), ctr: { lat, lon }, t (seconds), fade, zoom }.
//   api: { ID, st (the HUD state: win, sel, graph, dates, idx, view ...), $(sel) (a HUD element by id suffix), jf(url, opts) (fetch JSON), esc, say(text, force), blip(freq, dur), names (node key -> label),
//          doc, win (the window), setMod(id), ask(question) (opens ASK and asks), tcol(tone), colours() }.
// Everything a module draws is DESCRIPTION ONLY: never a forecast, never a trade. A module that spends money (a model call) must be owner-only on the server and capped.
export const EXTRA = [];
export const registerJarvisModule = m => { if (m?.id && typeof m.render === 'function' && !EXTRA.some(x => x.id === m.id)) EXTRA.push(m); return m; };
export const MODULE_FILES = ['./jarvisModPrecedent.js', './jarvisModPapers.js', './jarvisModExplain.js', './jarvisModFilm.js', './jarvisModMarkets.js'];
export async function loadModules() { await Promise.all(MODULE_FILES.map(f => import(f).catch(() => null))); return EXTRA; }
