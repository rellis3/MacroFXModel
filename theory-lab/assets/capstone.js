/* Capstone workbenches (capstone-vol.html, capstone-macro.html).
 *
 * The page defines window.TL_CAPSTONE = { id, title, file, calc(api) } before loading this.
 * Markup it reads:
 *   <input data-k="vix" data-src="vol.vix" data-source="Cboe via FRED">  a number (or <select>)
 *   <span data-asof="vix"></span>                                     its date / provenance
 *   <textarea data-note="term"></textarea>                            the learner's sentence
 *   <section class="cw-step">…<h3>…</h3>…</section>                   one capstone step
 *   #cw-status, #cw-download, #cw-clear
 *
 * Numbers come from /theory-lab/capstone-board.json (education zone, cached values only,
 * each with its own date). Offline, opened from a file, signed out or not cached yet:
 * every box stays blank and the page works as a fill-in template.
 *
 * Storage is this browser only: the notes, and any number the learner typed. A typed
 * number is kept only while the live value it replaced is unchanged, so tomorrow's
 * board is never hidden behind yesterday's edit.
 */
(function () {
  var C = window.TL_CAPSTONE; if (!C) return;
  var KEY = 'theoryLabCapstone_' + C.id;
  var state = (function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } })();
  state.notes = state.notes || {}; state.vals = state.vals || {};
  function save() { state.savedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private window: the page still works */ } }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  var fields = $$('[data-k]'), live = {};
  function field(k) { for (var i = 0; i < fields.length; i++) if (fields[i].getAttribute('data-k') === k) return fields[i]; return null; }

  var api = {
    val: function (k) { var f = field(k); return f ? String(f.value).trim() : ''; },
    num: function (k) { var v = parseFloat(api.val(k).replace(/,/g, '')); return isFinite(v) ? v : null; },
    live: function (k) { return live[k] || null; },
    // change over the board's own window (five observations), only when the value shown is the live one
    chg: function (k) { var L = live[k], v = api.num(k); return L && L.prev != null && v === L.value ? v - L.prev : null; },
    sameDate: function (ks) { var d = ks.map(function (k) { return live[k] && live[k].date; }); return d.every(function (x) { return x && x === d[0]; }); },
    set: function (name, html) { $$('[data-calc="' + name + '"]').forEach(function (e) { e.innerHTML = html; }); },
    fmt: function (v, dp) { return v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); },
    sgn: function (v, dp, unit) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + api.fmt(Math.abs(v), dp) + (unit || ''); },
  };

  function asof(k) {
    var e = document.querySelector('[data-asof="' + k + '"]'), f = field(k); if (!e || !f) return;
    var L = live[k], typed = state.vals[k] && String(f.value).trim() !== '' && (!L || String(f.value) !== String(L.value));
    if (L && !typed) e.textContent = 'as of ' + L.date + (L.prevDate ? ' · 5 obs earlier ' + L.prevDate + ': ' + L.prev : '') + ' · ' + (f.getAttribute('data-source') || '');
    else if (String(f.value).trim() !== '') e.textContent = 'your entry' + (L ? ' (live value ' + L.value + ', as of ' + L.date + ')' : '');
    else e.textContent = f.getAttribute('data-src') ? 'not available here: look it up and type it in' : 'your input';
  }
  function recalc() { fields.forEach(function (f) { asof(f.getAttribute('data-k')); }); try { C.calc(api); } catch (e) { if (window.console) console.warn('[capstone]', e); } }

  function apply(board) {
    fields.forEach(function (f) {
      var k = f.getAttribute('data-k'), src = f.getAttribute('data-src'), L = null;
      if (src && board) { L = src.split('.').reduce(function (o, p) { return o ? o[p] : null; }, board); }
      if (L && L.value == null && L.sign) L = { value: L.sign, date: L.date };
      if (L && L.value != null && L.date) live[k] = L;
      var saved = state.vals[k];
      if (live[k] && !(saved && saved.liveDate === live[k].date)) f.value = live[k].value;
      else if (saved && saved.v != null) f.value = saved.v;
      else if (f.getAttribute('data-default') != null && f.value === '') f.value = f.getAttribute('data-default');
    });
    $$('[data-note]').forEach(function (t) { var v = state.notes[t.getAttribute('data-note')]; if (v != null) t.value = v; });
    var st = document.getElementById('cw-status'), n = Object.keys(live).length;
    if (st) {
      st.className = 'tl-solid ' + (n ? 'green' : 'amber');
      st.innerHTML = n
        ? '<strong>Today\'s board is filled in.</strong> ' + n + ' numbers loaded, each with its own date underneath; markets close on different calendars, so the dates do not always match. Overwrite any number and every calculation follows.'
        : '<strong>No live numbers here.</strong> The board could not be loaded (offline, opened as a file, signed out, or the server has not cached it yet). Type today\'s values into the boxes; every calculation and the verdicts work the same.';
    }
    recalc();
  }

  document.addEventListener('input', function (e) {
    var t = e.target, k = t.getAttribute && t.getAttribute('data-k'), n = t.getAttribute && t.getAttribute('data-note');
    if (k) { state.vals[k] = { v: t.value, liveDate: live[k] ? live[k].date : null }; if (live[k] && String(t.value) === String(live[k].value)) delete state.vals[k]; save(); recalc(); }
    else if (n) { state.notes[n] = t.value; save(); }
  });
  document.addEventListener('change', function (e) { var t = e.target; if (t.tagName === 'SELECT' && t.getAttribute('data-k')) { state.vals[t.getAttribute('data-k')] = { v: t.value, liveDate: live[t.getAttribute('data-k')] ? live[t.getAttribute('data-k')].date : null }; save(); recalc(); } });

  function text() {
    var out = [C.title, 'Written ' + new Date().toISOString().slice(0, 10) + ' · Theory Lab capstone workbench', ''];
    $$('.cw-step').forEach(function (s) {
      var h = s.querySelector('h3'); out.push('== ' + (h ? h.textContent.trim() : '') + ' ==');
      s.querySelectorAll('[data-k]').forEach(function (f) {
        var lab = s.querySelector('label[for="' + f.id + '"]'), a = s.querySelector('[data-asof="' + f.getAttribute('data-k') + '"]');
        out.push('  ' + (lab ? lab.textContent.trim() : f.getAttribute('data-k')) + ': ' + (String(f.value).trim() || '(blank)') + (a ? '  [' + a.textContent.trim() + ']' : ''));
      });
      s.querySelectorAll('[data-calc]').forEach(function (c) { var t = (c.innerText || c.textContent).replace(/\s*\n\s*/g, ' · ').replace(/[ \t]+/g, ' ').trim(); if (t) out.push('  = ' + t); });
      s.querySelectorAll('[data-note]').forEach(function (t) { out.push('  My read: ' + (t.value.trim() || '(not written)')); });
      s.querySelectorAll('.tl-verdict').forEach(function (v) {
        var tag = v.querySelector('.tl-verdict-tag'), id = v.getAttribute('data-evidence'), claim = v.querySelector('.tl-verdict-ledger p');
        out.push('  Desk verdict' + (id ? ' (' + id + ')' : '') + ': ' + (tag ? tag.textContent.trim().toUpperCase() : '') + (claim ? ' · ' + claim.textContent.trim() : ''));
      });
      out.push('');
    });
    return out.join('\n');
  }
  var dl = document.getElementById('cw-download');
  if (dl) dl.addEventListener('click', function () {
    var t = text();
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
      a.download = C.file + '-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { window.prompt('Copy your read:', t); }
  });
  var cl = document.getElementById('cw-clear');
  if (cl) cl.addEventListener('click', function () {
    if (!window.confirm('Clear everything you wrote on this page (in this browser)?')) return;
    state = { notes: {}, vals: {} };
    try { localStorage.removeItem(KEY); } catch (e) {}
    $$('[data-note]').forEach(function (t) { t.value = ''; });
    fields.forEach(function (f) { f.value = live[f.getAttribute('data-k')] ? live[f.getAttribute('data-k')].value : (f.getAttribute('data-default') || ''); });
    recalc();
  });

  apply(null);   // the template first, so nothing waits on the network
  if (!window.fetch || location.protocol === 'file:') return;
  var me = document.currentScript || document.querySelector('script[src*="capstone.js"]');
  fetch(new URL('../capstone-board.json', me ? me.src : location.href).href, { credentials: 'same-origin' })
    .then(function (r) { return r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null; })
    .then(function (j) { if (j) apply(j); })
    .catch(function () { /* stay a template */ });
})();
