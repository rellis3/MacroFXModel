// js/terminal/terminalFeel.js: loads the PREVIEW features of the Desk Terminal (command line, linked selection) for the sessions allowed to see them.
//
// A preview feature is a registry surface with the hide reason 'preview' (js/terminal/tabRegistry.js): the owner always sees it, the desk login sees
// it only once the owner flips its switch (desk-admin.html, or the "Preview features" panel at the top of the Info map tab). This loader is the
// reason a desk login with the switch off sees NO TRACE: it asks the registry's answer (deskSurfaceOn, set by access.js) and imports nothing,
// adds no stylesheet, no key handler and no button when the answer is no. If the access check failed, access.js already treats the session as a
// viewer with the defaults, so the answer is no (fails closed).
const on = id => globalThis.deskSurfaceOn?.(id) === true;

function addCss() {
  if (document.getElementById('feelCss')) return;
  const l = document.createElement('link');
  l.id = 'feelCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/command-line.css';
  document.head.appendChild(l);
}
function addAlCss() {
  if (document.getElementById('alCss')) return;
  const l = document.createElement('link');
  l.id = 'alCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/alerts.css';
  document.head.appendChild(l);
}
function addKcCss() {
  if (document.getElementById('kcCss')) return;
  const l = document.createElement('link');
  l.id = 'kcCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/kchart.css';
  document.head.appendChild(l);
}
function addCdCss() {
  if (document.getElementById('cdCss')) return;
  const l = document.createElement('link');
  l.id = 'cdCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/calendar-drills.css';
  document.head.appendChild(l);
}
function addExCss() {
  if (document.getElementById('exCss')) return;
  const l = document.createElement('link');
  l.id = 'exCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/export.css';
  document.head.appendChild(l);
}
function addNsCss() {
  if (document.getElementById('nsCss')) return;
  const l = document.createElement('link');
  l.id = 'nsCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/news-search.css';
  document.head.appendChild(l);
}
function addMonCss() {
  if (document.getElementById('monCss')) return;
  const l = document.createElement('link');
  l.id = 'monCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/monitor.css';
  document.head.appendChild(l);
}
function addInCss() {
  if (document.getElementById('inCss')) return;
  const l = document.createElement('link');
  l.id = 'inCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/insight.css';
  document.head.appendChild(l);
}
function addWsCss() {
  if (document.getElementById('wsCss')) return;
  const l = document.createElement('link');
  l.id = 'wsCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/workspace.css';
  document.head.appendChild(l);
}
function addAsCss() {
  if (document.getElementById('asCss')) return;
  const l = document.createElement('link');
  l.id = 'asCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/asof.css';
  document.head.appendChild(l);
}
function addGwCss() {
  if (document.getElementById('gwCss')) return;
  const l = document.createElement('link');
  l.id = 'gwCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/ghost-walk.css';
  document.head.appendChild(l);
}
function addSlCss() {
  if (document.getElementById('slCss')) return;
  const l = document.createElement('link');
  l.id = 'slCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/since-last.css';
  document.head.appendChild(l);
}
function addRpCss() {
  if (document.getElementById('rpvCss')) return;
  const l = document.createElement('link');
  l.id = 'rpvCss'; l.rel = 'stylesheet'; l.href = 'js/terminal/replay-viz.css';
  document.head.appendChild(l);
}
/** The Pair page's and the Replay's opener hooks are set by terminalTabs.js; wait (up to 6 s) so linked selection can wrap them. */
const hooksReady = () => new Promise(res => {
  const t0 = Date.now();
  const go = () => ((typeof globalThis.openPairPage === 'function' && typeof globalThis.openReplay === 'function') || Date.now() - t0 > 6000 ? res() : setTimeout(go, 100));
  go();
});

/** The keys of the status object (and of what start() returns), in the order the features start. */
export const FEEL_KEYS = ['asof', 'chart', 'insight', 'alerts', 'workspace', 'linked', 'monitor', 'newsSearches', 'calendarDrills', 'replayViz', 'ghostWalk', 'oiTime', 'eventReplay', 'sinceLast', 'riskStrip', 'exporter', 'cmdline'];

export async function start() {
  // globalThis.__deskFeel is what each feature did on THIS page (js/terminal/featureStatus.js words it; the Info map tab's Preview features panel and
  // the command line read it), so a missing button can be explained without a console: { requested, loaded, error } per feature.
  const feel = globalThis.__deskFeel = { startedAt: Date.now(), done: false, features: {} };
  const rec = async (key, wanted, fn) => {
    const r = feel.features[key] = { requested: !!wanted, loaded: false, error: null };
    if (!wanted) return false;
    try { const res = await fn(); r.loaded = res === true || (!!res && res !== 'later'); if (res === 'later') r.waiting = true; } catch (e) { r.error = e?.message ?? String(e); console.warn(key, e); }   // 'later' = installed, attaches when its tab is built
    return r.loaded;
  };
  const finish = () => {
    feel.done = true; feel.finishedAt = Date.now();
    try { globalThis.dispatchEvent?.(new Event('deskfeel')); } catch { /* no events here */ }
    return Object.fromEntries(FEEL_KEYS.map(k => [k, !!feel.features[k]?.loaded]));
  };
  const want = { linked: on('widget.linked'), cmdline: on('widget.cmdline'), workspace: on('tab.workspace'), alerts: on('widget.alerts'), chart: on('tab.kchart'), monitor: on('tab.monitor'), insight: on('tab.insight'), newsSearches: on('panel.news.saved'), exporter: on('widget.export'), calendarDrills: on('panel.cal.drills'), replayViz: on('widget.replayviz'), asof: on('widget.asof'), ghostWalk: on('widget.ghostwalk'), oiTime: on('widget.oitime'), eventReplay: on('widget.eventreplay'), sinceLast: on('panel.changed.since'), riskStrip: on('panel.risk.strip') };
  // the as-of gate (js/terminal/asofBoot.js) holds market-data reads when the page was opened with ?asof=: a session that may not use the clock lets it go at once
  if (!want.asof && globalThis.__deskAsof?.requested) globalThis.__deskAsof.abandon('not available to this session');
  if (!Object.values(want).some(Boolean)) { for (const k of FEEL_KEYS) feel.features[k] = { requested: false, loaded: false, error: null }; return finish(); }
  if (want.linked || want.cmdline) addCss();
  await rec('asof', want.asof, async () => { addAsCss(); const m = await import('./asofClock.js'); return m.mountAsof(); });   // first: it may be holding the page's reads
  await rec('chart', want.chart, async () => { addKcCss(); const m = await import('./kchartView.js'); return m.mountKChart(); });
  await rec('insight', want.insight, async () => { addInCss(); const m = await import('./insightView.js'); return m.mountInsight(); });
  await rec('alerts', want.alerts, async () => { addAlCss(); const m = await import('./alertsView.js'); return m.mountAlerts(); });
  await rec('workspace', want.workspace, async () => { addWsCss(); const m = await import('./workspaceView.js'); return m.mountWorkspace(); });
  await rec('linked', want.linked, async () => { await hooksReady(); const m = await import('./linkedSelection.js'); return m.mountLinked(); });
  await rec('monitor', want.monitor, async () => { addMonCss(); const m = await import('./monitorView.js'); return m.mountMonitor(); });   // after linked selection, so a picked row can be shared
  await rec('newsSearches', want.newsSearches, async () => { addNsCss(); const m = await import('./newsSearchView.js'); return m.installNewsSearches() || (document.getElementById('nt-saved') ? false : 'later'); });   // the News tab is built on first visit: the install hook mounts the bar then
  await rec('calendarDrills', want.calendarDrills, async () => { addCdCss(); const m = await import('./calendarDrillsView.js'); return m.mountCalendarDrills(); });
  await rec('replayViz', want.replayViz, async () => { addRpCss(); const m = await import('./replayViz.js'); return m.mountReplayViz(); });
  await rec('oiTime', want.oiTime, async () => { addRpCss(); addGwCss(); const m = await import('./oiTime.js'); return m.mountOiTime(); });   // the three OI-over-time buttons sit beside the ghost walk button on the OI terrain card
  await rec('eventReplay', want.eventReplay, async () => { addRpCss(); addGwCss(); const m = await import('./eventReplay.js'); return m.mountEventReplay(); });   // a button at the top of the Calendar tab and the EVENTREPLAY command
  await rec('sinceLast', want.sinceLast, async () => { addSlCss(); const m = await import('./sinceLast.js'); return m.mountSinceLast(); });   // a card at the top of the Changed tab
  await rec('riskStrip', want.riskStrip, async () => { const m = await import('./flagStrip.js'); return m.mountRiskStrip(); });   // a slim card at the top of the Overview; the Insight > Risk flags ribbons load from flagsView.js
  await rec('ghostWalk', want.ghostWalk, async () => { addRpCss(); addGwCss(); const m = await import('./ghostWalk.js'); return m.mountGhostWalk(); });   // after the player's own css; the button sits on the OI terrain card
  await rec('exporter', want.exporter, async () => { addExCss(); const m = await import('./exportView.js'); return m.mountExport(); });   // after the boards it decorates are mounted
  await rec('cmdline', want.cmdline, async () => { const m = await import('./commandLine.js'); return m.mountCommandLine(); });
  return finish();
}

if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', () => start(), { once: true });
}
