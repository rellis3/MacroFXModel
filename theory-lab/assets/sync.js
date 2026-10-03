/* Theory Lab — sync reading progress across devices with a sync code.
 *
 * The education login is one shared password, so there is no account to hang
 * progress on. Instead: "Get a code" on one device uploads this browser's
 * progress (theoryLabProgress), chosen path (theoryLabPath) and capstone ticks
 * (theoryLabPathChecks) under a random code; "Enter a code" on another device
 * downloads that and MERGES it in. From then on the device remembers the code,
 * pushes changes when the tab is hidden (at most once a minute) and pulls on
 * paths.html load. The code is the only handle — anyone with it can read and add
 * to that progress, nothing more. Everything keeps working offline; sync just
 * waits for the next chance.
 *
 * Loaded by paths.html (which renders the panel into #tl-sync) and, only when a
 * code is linked, injected by progress.js / deck.js on lesson pages so reading
 * there is pushed too.
 *
 * window.TLSync.merge(local, remote) is pure (no storage, no DOM) and is tested
 * by js/progressSync.test.mjs alongside the server's copy in js/progressSync.js.
 */
(function (root) {
  'use strict';

  // ── Pure merge (keep in step with js/progressSync.js mergeSyncPayload) ──────
  function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function minTs(a, b) { return a && b ? Math.min(a, b) : (a || b || null); }
  function maxTs(a, b) { return a && b ? Math.max(a, b) : (a || b || null); }
  function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  function mergeLesson(a, b) {
    if (!a) return copy(b);
    if (!b) return copy(a);
    return {
      percent: Math.max(+a.percent || 0, +b.percent || 0),
      scrollPct: Math.max(+a.scrollPct || 0, +b.scrollPct || 0),
      activeSec: Math.max(+a.activeSec || 0, +b.activeSec || 0),
      firstVisit: minTs(a.firstVisit, b.firstVisit),
      completedAt: minTs(a.completedAt, b.completedAt),
      updatedAt: maxTs(a.updatedAt, b.updatedAt)
    };
  }
  function keysOf(a, b) {
    var seen = {}, out = [];
    [a, b].forEach(function (o) { Object.keys(o).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } }); });
    return out;
  }
  // Per lesson: percent/scroll/time are high-water marks, the first completion is
  // kept. Path: this device's choice wins; the remote one fills an empty slot.
  // Capstone ticks: union (a tick on either device counts).
  function merge(local, remote) {
    local = isPlain(local) ? local : {}; remote = isPlain(remote) ? remote : {};
    var lp = isPlain(local.progress) ? local.progress : {}, rp = isPlain(remote.progress) ? remote.progress : {};
    var progress = {};
    keysOf(lp, rp).forEach(function (s) { progress[s] = mergeLesson(isPlain(lp[s]) ? lp[s] : null, isPlain(rp[s]) ? rp[s] : null); });
    var lc = isPlain(local.checks) ? local.checks : {}, rc = isPlain(remote.checks) ? remote.checks : {};
    var checks = {};
    keysOf(lc, rc).forEach(function (id) {
      var o = {};
      [lc[id], rc[id]].forEach(function (src) { if (isPlain(src)) Object.keys(src).forEach(function (i) { if (src[i]) o[i] = true; }); });
      checks[id] = o;
    });
    return { progress: progress, path: local.path || remote.path || null, checks: checks };
  }

  root.TLSync = { merge: merge };
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return; // test/vm context

  // ── Storage (every access guarded: private mode / blocked storage must not break the page) ──
  var K_PROG = 'theoryLabProgress', K_PATH = 'theoryLabPath', K_CHECK = 'theoryLabPathChecks';
  var K_CODE = 'theoryLabSyncCode', K_LAST = 'theoryLabSyncLast', K_AT = 'theoryLabSyncAt';
  var MIN_GAP = 60 * 1000;
  function rawGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function rawSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function getJ(k, d) { try { var v = JSON.parse(rawGet(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function setJ(k, v) { rawSet(k, JSON.stringify(v)); }

  function gather() {
    var p = getJ(K_PROG, {}), c = getJ(K_CHECK, {}), path = getJ(K_PATH, null);
    return { progress: isPlain(p) ? p : {}, path: typeof path === 'string' && path ? path : null, checks: isPlain(c) ? c : {} };
  }
  // Writes the merged state back. Progress is re-merged with what is in storage
  // NOW, so a lesson tab persisting in the meantime is never rolled back.
  function apply(m) {
    var now = gather();
    var fresh = merge(now, m);
    setJ(K_PROG, fresh.progress);
    if (fresh.path) setJ(K_PATH, fresh.path);
    setJ(K_CHECK, fresh.checks);
    try { document.dispatchEvent(new CustomEvent('tl-sync-updated')); } catch (e) {}
  }
  // Canonical form (sorted slugs, fixed field order) so "has anything changed since
  // the last push?" is not fooled by key order.
  function fingerprint(s) {
    var m = merge(s, s), out = [];
    Object.keys(m.progress).sort().forEach(function (k) { var r = m.progress[k]; out.push([k, Math.round(r.percent), r.scrollPct, r.activeSec, r.firstVisit, r.completedAt, r.updatedAt]); });
    var ch = Object.keys(m.checks).sort().map(function (id) { return [id, Object.keys(m.checks[id]).sort().join(',')]; }).filter(function (x) { return x[1]; });
    return JSON.stringify([out, m.path, ch]);
  }
  function code() { var c = rawGet(K_CODE); return c && /^[2-9A-HJKMNP-Z]{10}$/.test(c) ? c : null; }
  function pretty(c) { return c.slice(0, 5) + '-' + c.slice(5); }

  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    // .../theory-lab/assets/sync.js  ->  .../theory-lab/progress-sync
    if (s) return s.replace(/assets\/sync\.js(\?.*)?$/, 'progress-sync');
    return (/\/lessons\//.test(location.pathname) ? '../' : '') + 'progress-sync';
  })();

  function req(method, c, body, keepalive) {
    var opts = { method: method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (keepalive) opts.keepalive = true;
    return fetch(base + (c ? '/' + c : ''), opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // ── Push: only when linked, only when something changed, at most once a minute ──
  var timer = null;
  function push(opts) {
    opts = opts || {};
    var c = code(); if (!c) return Promise.resolve(null);
    var state = gather(), fp = fingerprint(state);
    if (fp === rawGet(K_LAST) && !opts.force) return Promise.resolve(null);
    var wait = MIN_GAP - (Date.now() - (+rawGet(K_AT) || 0));
    if (wait > 0 && !opts.force) {
      if (!timer) timer = setTimeout(function () { timer = null; push(); }, wait + 50);
      return Promise.resolve(null);
    }
    rawSet(K_AT, String(Date.now()));
    return req('PUT', c, state, !!opts.keepalive).then(function (j) {
      rawSet(K_LAST, fp);
      if (j && j.data && !opts.keepalive) apply(j.data);   // the server merged in the other devices' progress
      return j;
    }).catch(function (e) {
      if (e && e.status === 404) { rawSet(K_CODE, null); rawSet(K_LAST, null); }   // code gone (expired): unlink quietly
      // Another device on this code wrote seconds ago: not an error, just try again shortly.
      if (e && e.status === 429) { if (!timer) timer = setTimeout(function () { timer = null; push({ force: true }).catch(function () {}); }, 15000); return null; }
      throw e;
    });
  }
  function pull() {
    var c = code(); if (!c) return Promise.resolve(null);
    return req('GET', c).then(function (j) {
      apply(j.data || {});
      // If this device had something the server lacked, send it back (subject to the 1/min gap).
      if (fingerprint(gather()) !== fingerprint(merge(j.data || {}, {}))) return push().catch(function () {}).then(function () { return j; });
      rawSet(K_LAST, fingerprint(gather()));
      return j;
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') push({ keepalive: true }).catch(function () {});
  });
  window.addEventListener('online', function () { push().catch(function () {}); });

  root.TLSync.push = push;
  root.TLSync.pull = pull;
  root.TLSync.code = code;

  // ── Panel (paths.html only) ─────────────────────────────────────────────────
  var panel = document.getElementById('tl-sync');
  if (!panel) return;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function status(msg, kind) {
    var el = panel.querySelector('.ts-status');
    if (el) { el.textContent = msg || ''; el.className = 'ts-status' + (kind ? ' ' + kind : ''); }
  }
  function offlineMsg(e) {
    if (e && e.status === 404) return 'That code wasn’t found. Check it and try again.';
    if (e && e.status === 429) return 'Too many sync requests just now. Try again in a minute.';
    if (e && e.status) return 'Sync failed: ' + e.message;
    return 'Couldn’t reach the server. Your progress is safe on this device; it will sync next time.';
  }
  function render() {
    var c = code();
    var h = '<h2>Sync across devices</h2>';
    if (c) {
      h += '<p>This device is linked. Enter this code on your other phone, tablet or laptop to share reading progress, your path and capstone ticks.</p>' +
        '<div class="ts-code" aria-label="Your sync code">' + esc(pretty(c)) + '</div>' +
        '<div class="ts-row"><button type="button" data-act="now">Sync now</button><button type="button" data-act="unlink" class="ts-quiet">Unlink this device</button></div>';
    } else {
      h += '<p>Progress is saved per browser. To carry it between devices, get a code here and enter it on the other one. Progress from both is merged: the furthest you got on each lesson counts.</p>' +
        '<div class="ts-row"><button type="button" data-act="get">Get a code</button></div>' +
        '<form class="ts-row" data-act="enter"><input type="text" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="ABCDE-FGHJK" aria-label="Sync code"><button type="submit">Enter a code</button></form>';
    }
    h += '<div class="ts-status" role="status"></div><p class="ts-note">Treat the code like a password for your reading list: anyone with it can see and add to this progress. It holds no name or email. Unused codes expire after about a year.</p>';
    panel.innerHTML = h;
  }
  panel.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'get') {
      b.disabled = true; status('Creating a code…');
      req('POST', null, gather()).then(function (j) {
        rawSet(K_CODE, j.code); rawSet(K_AT, String(Date.now())); rawSet(K_LAST, fingerprint(gather()));
        render(); status('Linked. Enter this code on your other device.', 'ok');
      }).catch(function (err) { b.disabled = false; status(offlineMsg(err), 'bad'); });
    } else if (act === 'now') {
      b.disabled = true; status('Syncing…');
      pull().then(function () { return push({ force: true }); })
        .then(function () { status('Up to date.', 'ok'); }, function (err) { status(offlineMsg(err), 'bad'); if (!code()) render(); })
        .then(function () { b.disabled = false; });
    } else if (act === 'unlink') {
      if (!confirm('Stop syncing this device? Your progress here stays; it just won’t be shared any more.')) return;
      rawSet(K_CODE, null); rawSet(K_LAST, null); rawSet(K_AT, null);
      render(); status('Unlinked. Progress on this device is unchanged.');
    }
  });
  panel.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = panel.querySelector('input[name=code]');
    var c = String(input && input.value || '').toUpperCase().replace(/[\s-]/g, '');
    if (!/^[2-9A-HJKMNP-Z]{10}$/.test(c)) { status('A code is 10 letters and digits, like ABCDE-FGHJK.', 'bad'); return; }
    status('Fetching progress…');
    req('GET', c).then(function (j) {
      apply(j.data || {});
      rawSet(K_CODE, c); rawSet(K_LAST, null); rawSet(K_AT, null);
      return push({ force: true }).catch(function () {});   // give the code this device's progress too
    }).then(function () {
      render(); status('Linked. Progress from both devices is merged.', 'ok');
    }, function (err) { status(offlineMsg(err), 'bad'); });
  });
  render();
  if (code()) pull().then(function () { status('Up to date.', 'ok'); }, function (err) { status(offlineMsg(err), 'bad'); if (!code()) render(); });
})(typeof window !== 'undefined' ? window : globalThis);
