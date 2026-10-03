/* Theory Lab learning paths.
 *
 * Data: window.TL_PATHS (assets/paths-data.js). Reading progress comes from the same
 * localStorage key progress.js writes (theoryLabProgress[slug].percent); a lesson counts
 * as done when its full lesson OR its visual guide reached 90%. The chosen path and the
 * capstone checklist are per-browser conveniences in localStorage; everything renders
 * fine without storage.
 *
 * - On a lesson (full or visual guide): an "On your path" bar with stage, progress and
 *   previous/next within the path, inserted before the footer nav (or on the last slide).
 * - On paths.html (#tl-paths-app): the path chooser, the stages, and the capstone.
 */
(function () {
  var D = window.TL_PATHS; if (!D) return;
  var K_PROG = 'theoryLabProgress', K_PATH = 'theoryLabPath', K_CHECK = 'theoryLabPathChecks';
  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var prog = get(K_PROG, {});
  function pct(slug) { var a = prog[slug] || {}, b = prog[slug + '-micro'] || {}; return Math.max(+a.percent || 0, +b.percent || 0); }
  function done(slug) { return pct(slug) >= 90; }
  function path(id) { for (var i = 0; i < D.paths.length; i++) if (D.paths[i].id === id) return D.paths[i]; return null; }
  // A path's full reading order: the shared core first, then its own stages.
  function stages(p) { return [{ name: 'Core (shared by every path)', lessons: D.core.lessons }].concat(p.stages); }
  function order(p) { var o = []; stages(p).forEach(function (s) { s.lessons.forEach(function (l) { if (D.lessons[l] && o.indexOf(l) < 0) o.push(l); }); }); return o; }
  function onPath(p, slug) { return order(p).indexOf(slug) >= 0; }
  function stats(p) { var o = order(p), n = 0; o.forEach(function (l) { if (done(l)) n++; }); return { done: n, total: o.length }; }
  function checks(p) { var c = get(K_CHECK, {}); return c[p.id] || {}; }
  function complete(p) { var s = stats(p), c = checks(p); return s.done === s.total && p.deliverable.steps.every(function (_, i) { return c[i]; }); }
  var base = /\/lessons\//.test(location.pathname) ? '' : 'lessons/';
  var home = /\/lessons\//.test(location.pathname) ? '../paths.html' : 'paths.html';

  // ── Lesson pages ──────────────────────────────────────────────────────────
  var slug = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '').replace(/-micro$/, '');
  if (D.lessons[slug]) {
    var chosen = path(get(K_PATH, null));
    var member = D.paths.filter(function (p) { return onPath(p, slug); });
    var box = document.createElement('div'); box.className = 'tl-pathbar';
    var h = '';
    if (chosen && onPath(chosen, slug)) {
      var o = order(chosen), i = o.indexOf(slug), st = stats(chosen), sg = stages(chosen), si = 0;
      sg.forEach(function (s, k) { if (s.lessons.indexOf(slug) >= 0 && !si) si = k + 1; });
      h += '<div class="tl-pathbar-k">On your path · ' + esc(chosen.icon + ' ' + chosen.name) + '</div>' +
        '<div class="tl-pathbar-stage">Stage ' + si + ' of ' + sg.length + ': ' + esc(sg[si - 1].name) + ' · ' + st.done + ' of ' + st.total + ' lessons done</div>' +
        '<div class="tl-pathbar-meter"><i style="width:' + Math.round(100 * st.done / st.total) + '%"></i></div><div class="tl-pathbar-nav">' +
        (i > 0 ? '<a href="' + base + o[i - 1] + '.html">← ' + esc(D.lessons[o[i - 1]].t) + '</a>' : '<span></span>') +
        (i < o.length - 1 ? '<a href="' + base + o[i + 1] + '.html">' + esc(D.lessons[o[i + 1]].t) + ' →</a>'
          : '<a href="' + home + '#deliverable">Your capstone: ' + esc(chosen.deliverable.title) + ' →</a>') + '</div>';
      var others = member.filter(function (p) { return p !== chosen; });
      if (others.length) h += '<div class="tl-pathbar-also">Also on: ' + others.map(function (p) { return esc(p.icon + ' ' + p.name); }).join(' · ') + '</div>';
    } else if (member.length) {
      h += '<div class="tl-pathbar-k">Learning paths</div><div class="tl-pathbar-stage">' +
        (D.core.lessons.indexOf(slug) >= 0 ? 'Part of the core every path shares.' : 'This lesson is on: ' + member.map(function (p) { return esc(p.icon + ' ' + p.name); }).join(' · ')) +
        '</div><div class="tl-pathbar-nav"><span></span><a href="' + home + '">' + (chosen ? 'Your path doesn\'t include this one. See all paths →' : 'Choose a path, with a finish line →') + '</a></div>';
    } else return;
    box.innerHTML = h;
    var nav = document.querySelector('.tl-footer-nav');
    var slides = document.querySelectorAll('.sl-slide');
    if (nav) nav.parentNode.insertBefore(box, nav);
    else if (slides.length) { box.classList.add('in-deck'); slides[slides.length - 1].appendChild(box); }
    else document.body.appendChild(box);
    return;
  }

  // ── paths.html ────────────────────────────────────────────────────────────
  var app = document.getElementById('tl-paths-app'); if (!app) return;
  // Capstones with a pre-filled workbench page (today's numbers + live desk verdicts).
  var WORKBENCH = { volatility: 'capstone-vol.html', macro: 'capstone-macro.html' };
  function render() {
    var sel = path(get(K_PATH, null));
    var h = '<div class="tp-grid">' + D.paths.map(function (p) {
      var s = stats(p), on = sel && sel.id === p.id;
      return '<button type="button" class="tp-card' + (on ? ' on' : '') + '" data-path="' + p.id + '"><span class="tp-icon">' + p.icon + '</span>' +
        '<span class="tp-name">' + esc(p.name) + '</span><span class="tp-who">' + esc(p.who) + '</span>' +
        '<span class="tp-goal">Finish line: <b>' + esc(p.deliverable.title) + '</b></span>' +
        '<span class="tp-meter"><i style="width:' + Math.round(100 * s.done / s.total) + '%"></i></span><span class="tp-count">' + s.done + ' / ' + s.total + ' lessons' + (complete(p) ? ' · ✓ complete' : '') + '</span>' +
        '<span class="tp-cta">' + (on ? '✓ Your path' : 'Follow this path') + '</span></button>';
    }).join('') + '</div>';
    if (sel) {
      var c = checks(sel), st = stats(sel);
      h += '<section class="tp-detail"><h2>' + esc(sel.icon + ' ' + sel.name) + '</h2>';
      if (complete(sel)) h += '<div class="tl-solid green"><strong>Path complete.</strong> Every lesson read and the capstone built: ' + esc(sel.deliverable.title) + '.</div>';
      stages(sel).forEach(function (s, k) {
        var ls = s.lessons.filter(function (l) { return D.lessons[l]; });
        var n = ls.filter(done).length;
        h += '<div class="tp-stage"><div class="tp-stage-h"><span>Stage ' + (k + 1) + '</span>' + esc(s.name) + '<em>' + n + ' / ' + ls.length + '</em></div><ol>' +
          ls.map(function (l) {
            var p = pct(l), m = D.lessons[l];
            return '<li class="' + (p >= 90 ? 'done' : p > 0 ? 'started' : '') + '"><a href="' + base + l + '.html">' + esc(m.t) + '</a><span>' +
              (p >= 90 ? '✓ done' : p > 0 ? p + '% read' : m.min + ' min') + '</span></li>';
          }).join('') + '</ol></div>';
      });
      h += '<div class="tp-deliv" id="deliverable"><div class="tp-deliv-k">Capstone · your finish line</div><h3>' + esc(sel.deliverable.title) + '</h3><p>' + esc(sel.deliverable.what) + '</p>' +
        (WORKBENCH[sel.id] ? '<p><a class="tl-btn active" href="' + WORKBENCH[sel.id] + '">Open the workbench →</a></p>' : '') + '<ol>' +
        sel.deliverable.steps.map(function (s, i) {
          var m = D.lessons[s.lesson];
          return '<li><label><input type="checkbox" data-check="' + i + '"' + (c[i] ? ' checked' : '') + '> ' + esc(s.text) + '</label>' +
            (m ? '<a href="' + base + s.lesson + '.html">Learn it in: ' + esc(m.t) + '</a>' : '') + '</li>';
        }).join('') + '</ol><div class="tp-foot">' + st.done + ' of ' + st.total + ' lessons read · ' +
        sel.deliverable.steps.filter(function (_, i) { return c[i]; }).length + ' of ' + sel.deliverable.steps.length + ' capstone steps done</div></div></section>';
    } else h += '<p class="tp-hint">Pick a path above. The core lessons appear in every path; each path then has its own stages and ends with something you build.</p>';
    app.innerHTML = h;
  }
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-path]'); if (!b) return;
    set(K_PATH, b.getAttribute('data-path')); render();
    var d = app.querySelector('.tp-detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  app.addEventListener('change', function (e) {
    var i = e.target.getAttribute('data-check'); if (i == null) return;
    var sel = path(get(K_PATH, null)); if (!sel) return;
    var all = get(K_CHECK, {}); all[sel.id] = all[sel.id] || {}; all[sel.id][i] = e.target.checked; set(K_CHECK, all); render();
  });
  // assets/sync.js merged progress from another device: re-read and repaint.
  document.addEventListener('tl-sync-updated', function () { prog = get(K_PROG, {}); render(); });
  render();
})();
