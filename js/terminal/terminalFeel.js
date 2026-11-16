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

export async function start() {
  const wantLinked = on('widget.linked'), wantCmd = on('widget.cmdline'), wantWs = on('tab.workspace'), wantAl = on('widget.alerts'), wantKc = on('tab.kchart'), wantMon = on('tab.monitor'), wantIn = on('tab.insight'), wantNs = on('panel.news.saved'), wantEx = on('widget.export'), wantCd = on('panel.cal.drills'), wantRp = on('widget.replayviz');
  if (!wantLinked && !wantCmd && !wantWs && !wantAl && !wantKc && !wantMon && !wantIn && !wantNs && !wantEx && !wantCd && !wantRp) return { replayViz: false, linked: false, cmdline: false, workspace: false, alerts: false, chart: false, monitor: false, insight: false, newsSearches: false, exporter: false, calendarDrills: false };
  if (wantLinked || wantCmd) addCss();
  let linked = false, cmdline = false, workspace = false, alerts = false, chart = false, monitor = false, insight = false, newsSearches = false, exporter = false, calendarDrills = false, replayViz = false;
  try {
    if (wantKc) { addKcCss(); const m = await import('./kchartView.js'); chart = !!m.mountKChart(); }
  } catch (e) { console.warn('chart', e); }
  try {
    if (wantIn) { addInCss(); const m = await import('./insightView.js'); insight = !!m.mountInsight(); }
  } catch (e) { console.warn('insight', e); }
  try {
    if (wantAl) { addAlCss(); const m = await import('./alertsView.js'); alerts = !!m.mountAlerts(); }
  } catch (e) { console.warn('alerts', e); }
  try {
    if (wantWs) { addWsCss(); const m = await import('./workspaceView.js'); workspace = !!m.mountWorkspace(); }
  } catch (e) { console.warn('workspace', e); }
  try {
    if (wantLinked) { await hooksReady(); const m = await import('./linkedSelection.js'); linked = !!m.mountLinked(); }
  } catch (e) { console.warn('linked selection', e); }
  try {
    if (wantMon) { addMonCss(); const m = await import('./monitorView.js'); monitor = !!m.mountMonitor(); }   // after linked selection, so a picked row can be shared
  } catch (e) { console.warn('monitor', e); }
  try {
    if (wantNs) { addNsCss(); const m = await import('./newsSearchView.js'); newsSearches = !!m.installNewsSearches(); }
  } catch (e) { console.warn('news searches', e); }
  try {
    if (wantCd) { addCdCss(); const m = await import('./calendarDrillsView.js'); calendarDrills = !!m.mountCalendarDrills(); }
  } catch (e) { console.warn('calendar drills', e); }
  try {
    if (wantRp) { addRpCss(); const m = await import('./replayViz.js'); replayViz = !!m.mountReplayViz(); }
  } catch (e) { console.warn('replay on a visualisation', e); }
  try {
    if (wantEx) { addExCss(); const m = await import('./exportView.js'); exporter = !!m.mountExport(); }   // after the boards it decorates are mounted
  } catch (e) { console.warn('export', e); }
  try {
    if (wantCmd) { const m = await import('./commandLine.js'); cmdline = !!m.mountCommandLine(); }
  } catch (e) { console.warn('command line', e); }
  return { replayViz, linked, cmdline, workspace, alerts, chart, monitor, insight, newsSearches, exporter, calendarDrills };
}

if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', () => start(), { once: true });
}
