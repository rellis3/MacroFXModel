/* Theory Lab — one-page cheat sheet for a learning path (cheatsheet.html?path=<id>).
 * Built in the browser from the lessons themselves, so it never drifts from them: for each lesson on the path,
 * its key formula (the last step of the equation build-up, else the first displayed equation) and the bold line
 * of each takeaway. Path order and titles come from paths-data.js.
 */
(function () {
  'use strict';
  var D = window.TL_PATHS; if (!D || !window.fetch || !window.DOMParser) return;
  var out = document.getElementById('cs-out'), sel = document.getElementById('cs-path'), status = document.getElementById('cs-status');
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function order(p) {
    var o = [];
    [{ lessons: D.core.lessons }].concat(p.stages).forEach(function (s) { s.lessons.forEach(function (l) { if (D.lessons[l] && o.indexOf(l) < 0) o.push(l); }); });
    return o;
  }
  D.paths.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.icon + ' ' + p.name; sel.appendChild(o); });
  var want = (location.search.match(/[?&]path=([\w-]+)/) || [])[1];
  if (want && D.paths.some(function (p) { return p.id === want; })) sel.value = want;
  function formula(d) {
    var steps = d.querySelectorAll('.tl-eqbuild .tl-eqbuild-step'), m = null;
    if (steps.length) m = steps[steps.length - 1].querySelector('.tl-math');
    if (!m) m = Array.prototype.filter.call(d.querySelectorAll('#page .tl-math'), function (x) { return !x.closest('.tl-picture,.tl-predict,.tl-fade'); })[0];
    return m ? m.textContent.trim() : '';
  }
  function takeaways(d) {
    return Array.prototype.map.call(d.querySelectorAll('.tl-takeaway'), function (t) {
      var s = t.querySelector('strong'); return s ? s.innerHTML.trim() : '';
    }).filter(Boolean);
  }
  var run = 0;
  function build() {
    var p = D.paths.filter(function (x) { return x.id === sel.value; })[0], ls = order(p), my = ++run, got = 0;
    document.getElementById('cs-title').textContent = p.icon + ' ' + p.name + ': cheat sheet';
    document.title = p.name + ' cheat sheet — Theory Lab';
    history.replaceState(null, '', '?path=' + p.id);
    out.innerHTML = ''; status.textContent = 'Fetching ' + ls.length + ' lessons…';
    Promise.all(ls.map(function (l) {
      return fetch('lessons/' + l + '.html', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        if (my === run) status.textContent = 'Fetching lessons… ' + (++got) + ' / ' + ls.length;
        if (!t) return null;
        var d = new DOMParser().parseFromString(t, 'text/html');
        return { slug: l, t: D.lessons[l].t, f: formula(d), k: takeaways(d) };
      }).catch(function () { return null; });
    })).then(function (items) {
      if (my !== run) return;
      items = items.filter(Boolean);
      out.innerHTML = items.map(function (x, i) {
        return '<section class="cs-item"><h3><span>' + (i + 1) + '</span><a href="lessons/' + x.slug + '.html">' + esc(x.t) + '</a></h3>' +
          (x.f ? '<div class="cs-f">' + esc(x.f) + '</div>' : '') +
          (x.k.length ? '<ul>' + x.k.map(function (k) { return '<li>' + k + '</li>'; }).join('') + '</ul>' : '') + '</section>';
      }).join('');
      status.textContent = items.length + ' lessons.';
      if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([out]).catch(function () {});
    });
  }
  sel.addEventListener('change', build);
  document.getElementById('cs-print').addEventListener('click', function () { window.print(); });
  build();
})();
