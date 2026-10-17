/* Theory Lab — "Due for review": spaced retrieval of lessons you have finished.
 *
 * Reads reading progress (localStorage theoryLabProgress, written by progress.js and
 * deck.js). A finished lesson (90%+) comes due 7 days after you finished it. Each review
 * asks one of its own self-test questions; "I knew it" pushes the next review further out
 * (7 → 21 → 60 → 150 days), "Shaky" brings it back in 7. Up to three lessons a visit,
 * oldest first. Questions you graded as missed in the lesson's self-test come first. The questions are fetched from the lesson pages themselves, so they never
 * drift from what the lesson asks. Review state: localStorage theoryLabReview, this
 * browser only. Needs <div id="tl-review" hidden></div> on the page.
 */
(function () {
  'use strict';
  var box = document.getElementById('tl-review'); if (!box || !window.fetch || !window.DOMParser) return;
  var DAY = 864e5, GAPS = [7, 21, 60, 150], MAX = 3;
  function get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var prog = get('theoryLabProgress', {}), rev = get('theoryLabReview', {}), now = Date.now();
  var base = box.getAttribute('data-base') || 'lessons/';
  var done = Object.keys(prog).map(function (k) {
    var r = prog[k] || {}, slug = k.replace(/-micro$/, '');
    return { slug: slug, at: r.completedAt || (Number(r.percent) >= 90 ? r.updatedAt : null) };
  }).filter(function (x) { return x.at && /^[a-z0-9-]+$/.test(x.slug); });
  var seen = {}; done = done.filter(function (x) { if (seen[x.slug]) return false; seen[x.slug] = 1; return true; });
  if (!done.length) return;
  function dueAt(x) { var r = rev[x.slug] || {}, b = Math.min(r.box || 0, GAPS.length - 1); return (r.last || x.at) + GAPS[b] * DAY; }
  var due = done.filter(function (x) { return dueAt(x) <= now; }).sort(function (a, b) { return dueAt(a) - dueAt(b); }).slice(0, MAX);
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  if (!due.length) {
    var next = done.map(dueAt).sort(function (a, b) { return a - b; })[0];
    box.innerHTML = '<div class="tl-review-head">🔁 Due for review</div><p class="tl-review-empty">Nothing due today. Your next review comes up on <b>' + new Date(next).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + '</b>.</p>';
    box.hidden = false; return;
  }
  function mathjax() {
    if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([box]).catch(function () {});
    if (document.getElementById('MathJax-script')) return;
    window.MathJax = { tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] }, startup: { typeset: true } };
    var s = document.createElement('script'); s.id = 'MathJax-script'; s.async = true; s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'; document.head.appendChild(s);
  }
  Promise.all(due.map(function (x) {
    return fetch(base + x.slug + '.html', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {
      if (!t) return null;
      var d = new DOMParser().parseFromString(t, 'text/html'), qs = d.querySelectorAll('details.tl-quiz');
      if (!qs.length) return null;
      // A question you graded yourself as missed (theoryLabQuiz, written by vark.js) comes back first.
      var r = rev[x.slug] || {}, mine = get('theoryLabQuiz', {})[x.slug] || {}, miss = Object.keys(mine).filter(function (i) { return mine[i] && mine[i].g < 1 && qs[+i]; });
      var q = qs[miss.length ? +miss[(r.n || 0) % miss.length] : (r.n || 0) % qs.length], h1 = d.querySelector('h1.tl-title'), s = q.querySelector('summary'), a = q.querySelector('.tl-answer');
      if (!s || !a) return null;
      return { slug: x.slug, title: h1 ? h1.textContent.trim() : x.slug, q: s.textContent.replace(/^\s*Q\d+\.\s*/, '').trim(), a: a.innerHTML };
    }).catch(function () { return null; });
  })).then(function (items) {
    items = items.filter(Boolean); if (!items.length) return;
    box.innerHTML = '<div class="tl-review-head">🔁 Due for review</div><p class="tl-review-sub">Lessons you finished a while ago. Answer each question in your head before you open it. Recalling is what makes it stick.</p>' +
      items.map(function (it, i) {
        return '<div class="tl-review-item" data-slug="' + esc(it.slug) + '"><div class="tl-review-from">From <a href="' + base + esc(it.slug) + '.html">' + esc(it.title) + '</a></div>' +
          '<details class="tl-quiz"><summary>' + esc(it.q) + '</summary><div class="tl-answer">' + it.a + '<div class="tl-btnrow tl-review-rate"><span class="tl-hint">How did you do?</span>' +
          '<button type="button" class="tl-btn active" data-rate="1">I knew it</button><button type="button" class="tl-btn" data-rate="0">Shaky</button></div></div></details></div>';
      }).join('');
    box.hidden = false; mathjax();
  });
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rate]'); if (!b) return;
    var item = b.closest('.tl-review-item'), slug = item.getAttribute('data-slug'), r = rev[slug] || {};
    r.box = b.getAttribute('data-rate') === '1' ? Math.min((r.box || 0) + 1, GAPS.length - 1) : 0;
    r.last = Date.now(); r.n = (r.n || 0) + 1; rev[slug] = r; set('theoryLabReview', rev);
    var when = new Date(r.last + GAPS[r.box] * DAY).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
    item.innerHTML = '<div class="tl-review-from">✓ ' + esc(item.querySelector('a').textContent) + ' · next review on <b>' + when + '</b></div>';
  });
})();
