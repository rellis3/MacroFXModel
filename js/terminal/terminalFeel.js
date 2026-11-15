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
/** The Pair page's and the Replay's opener hooks are set by terminalTabs.js; wait (up to 6 s) so linked selection can wrap them. */
const hooksReady = () => new Promise(res => {
  const t0 = Date.now();
  const go = () => ((typeof globalThis.openPairPage === 'function' && typeof globalThis.openReplay === 'function') || Date.now() - t0 > 6000 ? res() : setTimeout(go, 100));
  go();
});

export async function start() {
  const wantLinked = on('widget.linked'), wantCmd = on('widget.cmdline');
  if (!wantLinked && !wantCmd) return { linked: false, cmdline: false };
  addCss();
  let linked = false, cmdline = false;
  try {
    if (wantLinked) { await hooksReady(); const m = await import('./linkedSelection.js'); linked = !!m.mountLinked(); }
  } catch (e) { console.warn('linked selection', e); }
  try {
    if (wantCmd) { const m = await import('./commandLine.js'); cmdline = !!m.mountCommandLine(); }
  } catch (e) { console.warn('command line', e); }
  return { linked, cmdline };
}

if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', () => start(), { once: true });
}
