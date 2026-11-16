/* js/terminal/asofBoot.js: the fetch gate of the whole-terminal as-of clock. A CLASSIC script, loaded in <head> before anything else on the Desk Terminal page.
 *
 * What it does, and all it does: it wraps window.fetch once. While no as-of time is set it is a straight pass-through (a desk login, or anyone with the
 * feature off, never goes any other way). When the page was opened with ?asof=2026-11-12T14:30Z it HOLDS every market-data read until js/terminal/asofClock.js
 * (a preview feature: the owner always, the desk login only when switched on) has installed the answerer, then every read is answered by that answerer or
 * refused: a read is never passed to the live server in a past view. If the feature is not available to this session, or the clock does not come up within
 * 20 seconds, the gate lets go and the page is live again (the as-of value is dropped from the address).
 * Pass-through for the whole time: non-GET requests, other origins, anything that is not /api/, and the plumbing routes the page and the clock need before it can decide anything
 * (/api/desk-session, /api/desk-access, /api/desk-snapshots, /api/nav-layout).
 * Pure rules live in js/asofCore.js; a test (js/terminal/asofBoot.test.mjs) runs this file in a fake window and checks it agrees with them.
 */
(function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.__deskAsof || typeof g.fetch !== 'function') return;
  var real = g.fetch.bind(g);
  var PLUMBING = /^\/api\/(desk-access|desk-session|desk-snapshots|nav-layout)(\/|\?|$)/;

  function parse(raw) {
    if (raw == null) return null;
    var s = String(raw).trim(); if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T12:00Z';
    else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
    else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?Z$/.test(s)) s = s.replace(' ', 'T');
    else if (!/^\d{13}$/.test(s)) return null;
    var t = /^\d{13}$/.test(s) ? Number(s) : Date.parse(s);
    return isFinite(t) && t > Date.parse('2000-01-01') && t < Date.parse('2100-01-01') ? t : null;
  }
  var loc = g.location || { search: '', hash: '', href: 'http://localhost/', origin: 'http://localhost' };
  var raw = null;
  try { raw = new URLSearchParams(String(loc.search || '').replace(/^\?/, '')).get('asof'); } catch (e) { raw = null; }
  if (!raw) { var m = /^#asof=([^&]+)/.exec(String(loc.hash || '')); raw = m ? decodeURIComponent(m[1]) : null; }
  var t0 = parse(raw);

  var A = g.__deskAsof = { version: 1, t: t0, active: false, holding: false, answer: null, log: [], realFetch: real, failed: null, requested: t0 != null, parse: parse };
  var resolveReady = function () {};
  A.ready = new Promise(function (res) { resolveReady = res; });

  function dropParam() {
    try {
      var u = new URL(loc.href); u.searchParams.delete('asof');
      if (/^#asof=/.test(u.hash)) u.hash = '';
      if (g.history && g.history.replaceState) g.history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (e) { /* the address stays as it is */ }
  }
  /** The clock is up: answer every market-data read with `answerFn(pathAndSearch, realFetch, input, init) -> Promise<Response>` from now on. */
  A.activate = function (answerFn, t) {
    A.answer = answerFn; if (t != null) A.t = t; A.active = true; A.holding = false; A.failed = null; resolveReady();
  };
  /** Back to live (or never was): reads go straight to the server again. */
  A.deactivate = function () { A.active = false; A.holding = false; A.answer = null; A.t = null; resolveReady(); };
  /** This session may not use the clock (feature off, viewer, or it did not load): the page is live, and the address forgets the as-of time. */
  A.abandon = function (why) { A.failed = why || 'not available'; A.active = false; A.holding = false; A.answer = null; A.t = null; dropParam(); resolveReady(); };

  if (t0 != null) {
    A.holding = true;
    setTimeout(function () { if (A.holding) A.abandon('the clock did not start'); }, 20000);
  }

  g.fetch = function (input, init) {
    if (!A.holding && !A.active) return real(input, init);
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var method = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    var u; try { u = new URL(url, loc.href); } catch (e) { return real(input, init); }
    if (u.origin !== loc.origin || u.pathname.indexOf('/api/') !== 0 || method !== 'GET' || PLUMBING.test(u.pathname + u.search)) return real(input, init);
    var go = function () {
      if (!A.active) return real(input, init);   // the gate was let go (feature off): live, as if the clock were not there
      if (typeof A.answer !== 'function') return Promise.resolve(new Response(JSON.stringify({ ok: false, noRecord: true, error: 'No record could be read for this time. Nothing live is shown in a past view.' }), { status: 200, headers: { 'content-type': 'application/json' } }));
      return Promise.resolve().then(function () { return A.answer(u.pathname + u.search, real, input, init); }).catch(function (e) {
        // an answerer that fails REFUSES; it never falls through to the live server
        return new Response(JSON.stringify({ ok: false, noRecord: true, error: 'No record could be read for this time (' + (e && e.message ? e.message : 'error') + '). Nothing live is shown in a past view.' }), { status: 200, headers: { 'content-type': 'application/json' } });
      });
    };
    return A.holding ? A.ready.then(go) : go();
  };
})();
