/* Theory Lab — Practice: one mixed drill a day, plus how well calibrated your calls are.
 *
 *   #pr-drill     today's scenario drill, picked from every lesson's drill by the date (same for
 *                 everyone on the same day), and "Another drill" for one you haven't done yet.
 *                 Drills come from practice-data.js (+ practice-admin.js for the desk), built by
 *                 js/buildPracticeIndex.mjs. Answers go through vark.js, so they are stored under
 *                 the lesson they came from and show as done there too.
 *   #pr-calib     every predict-first guess and drill call you made with a "How sure?" level,
 *                 bucketed by confidence: hit rate against confidence, plus the Brier score.
 *   #pr-mastery   your self-test grades per lesson (theoryLabQuiz) and the questions you missed.
 * All of it reads this browser's localStorage only.
 */
(function () {
  'use strict';
  var D = window.TL_DRILLS || [], L = window.TL_LESSONS || {}, V = window.TLVark;
  var drillBox = document.getElementById('pr-drill'), calBox = document.getElementById('pr-calib'), masBox = document.getElementById('pr-mastery');
  if (!V || !drillBox) return;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function day(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rec(slug) { var s = V.store()[slug]; return s && s.d ? s.d[0] : undefined; }
  function mathjax(node) {
    if (window.MathJax && MathJax.typesetPromise) { MathJax.typesetPromise([node]).catch(function () {}); return; }
    if (document.getElementById('MathJax-script')) return;
    window.MathJax = { tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] }, startup: { typeset: true } };
    var s = document.createElement('script'); s.id = 'MathJax-script'; s.async = true; s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'; document.head.appendChild(s);
  }

  // ── Today's drill ─────────────────────────────────────────────────────────────
  var today = day(Date.now()), shown = null;
  function streak() {
    var days = {}, all = V.store();
    Object.keys(all).forEach(function (k) { var d = all[k].d || {}; Object.keys(d).forEach(function (i) { if (d[i] && d[i].at) days[day(d[i].at)] = 1; }); });
    var n = 0, t = Date.now(); if (!days[today]) t -= 864e5; // a streak survives until today's drill is due
    while (days[day(t)]) { n++; t -= 864e5; }
    return { n: n, total: Object.keys(days).length };
  }
  function done() { return D.filter(function (d) { return rec(d.slug) != null; }).length; }
  function render(d, why) {
    shown = d;
    var head = '<div class="pr-from">' + why + ' · from <a href="lessons/' + esc(d.slug) + '.html">' + d.title + '</a></div>';
    drillBox.innerHTML = head + d.html + '<div class="tl-btnrow pr-next"><button type="button" class="tl-btn" id="pr-another">Another drill ▶</button><span class="tl-hint" id="pr-count"></span></div>';
    var box = drillBox.querySelector('.tl-drill');
    V.initDrill(box, 0, d.slug, paintCount);
    document.getElementById('pr-another').addEventListener('click', another);
    paintCount(); mathjax(drillBox);
  }
  function paintCount() {
    var s = streak();
    document.getElementById('pr-count').textContent = done() + ' of ' + D.length + ' drills done' + (s.n ? ' · ' + s.n + '-day streak' : '') + '.';
    paintCalib();
  }
  function another() {
    var fresh = D.filter(function (d) { return rec(d.slug) == null && d !== shown; });
    var pool = fresh.length ? fresh : D.filter(function (d) { return d !== shown; }).sort(function (a, b) { return (rec(a.slug).at || 0) - (rec(b.slug).at || 0); }).slice(0, 10);
    if (!pool.length) return;
    render(pool[Math.floor(Math.random() * pool.length)], fresh.length ? 'One you haven\'t done' : 'One you did longest ago');
    drillBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (!D.length) drillBox.innerHTML = '<p class="tl-hint">No drills found.</p>';
  else render(D[hash(today) % D.length], 'Today\'s drill');

  // ── Calibration ───────────────────────────────────────────────────────────────
  // Every { c, ok } record: drill calls ('d') and predict-first guesses ('p'), across every lesson.
  function calls() {
    var out = [], all = V.store();
    Object.keys(all).forEach(function (k) {
      ['d', 'p'].forEach(function (kind) {
        var m = all[k][kind] || {};
        Object.keys(m).forEach(function (i) { var r = m[i]; if (r && typeof r === 'object' && r.c && typeof r.ok === 'boolean') out.push({ c: +r.c, ok: r.ok, kind: kind }); });
      });
    });
    return out;
  }
  function paintCalib() {
    if (!calBox) return;
    var cs = calls();
    if (cs.length < 3) {
      calBox.innerHTML = '<p class="tl-hint">You have made ' + cs.length + ' call' + (cs.length === 1 ? '' : 's') + ' with a confidence level so far. Every drill and every "predict first" guess asks how sure you are. After a handful, this shows whether your 80% calls come true about 80% of the time.</p>';
      return;
    }
    var B = [50, 60, 70, 80, 90, 100], bk = B.map(function (c) { return { c: c, n: 0, hit: 0 }; }), brier = 0, sc = 0, sh = 0;
    cs.forEach(function (x) {
      var b = bk[Math.max(0, Math.min(B.length - 1, Math.round((x.c - 50) / 10)))]; b.n++; if (x.ok) b.hit++;
      brier += Math.pow(x.c / 100 - (x.ok ? 1 : 0), 2); sc += x.c; sh += x.ok ? 1 : 0;
    });
    brier /= cs.length; var avgC = sc / cs.length, hit = 100 * sh / cs.length, gap = avgC - hit;
    var W = 340, H = 240, l = 44, r = 14, t = 14, b = 36, maxN = Math.max.apply(null, bk.map(function (x) { return x.n; }));
    function X(c) { return l + (c - 50) / 50 * (W - l - r); }
    function Y(p) { return t + (1 - p / 100) * (H - t - b); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pr-calsvg" role="img" aria-label="Hit rate against stated confidence">';
    [0, 25, 50, 75, 100].forEach(function (p) { svg += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(p) + '" y2="' + Y(p) + '" class="pr-grid"/><text x="' + (l - 6) + '" y="' + (Y(p) + 4) + '" text-anchor="end" class="pr-ax">' + p + '%</text>'; });
    B.forEach(function (c) { svg += '<text x="' + X(c) + '" y="' + (H - b + 16) + '" text-anchor="middle" class="pr-ax">' + c + '%</text>'; });
    svg += '<text x="' + ((l + W - r) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="pr-ax">How sure you said you were</text>';
    svg += '<line x1="' + X(50) + '" y1="' + Y(50) + '" x2="' + X(100) + '" y2="' + Y(100) + '" class="pr-diag"/>';
    var pts = bk.filter(function (x) { return x.n; });
    if (pts.length > 1) svg += '<polyline class="pr-line" points="' + pts.map(function (x) { return X(x.c) + ',' + Y(100 * x.hit / x.n); }).join(' ') + '"/>';
    pts.forEach(function (x) { var p = 100 * x.hit / x.n; svg += '<circle cx="' + X(x.c) + '" cy="' + Y(p) + '" r="' + (4 + 6 * Math.sqrt(x.n / maxN)) + '" class="pr-dot"><title>' + x.c + '% sure: ' + x.hit + ' of ' + x.n + ' right (' + Math.round(p) + '%)</title></circle>'; });
    svg += '</svg>';
    var verdict = Math.abs(gap) <= 5 ? 'Your confidence matches your hit rate. That is rarer than it sounds.' :
      gap > 0 ? 'You are <b>overconfident by ' + Math.round(gap) + ' points</b>: on average you said ' + Math.round(avgC) + '% and were right ' + Math.round(hit) + '% of the time. On the desk that means positions sized too big for what you actually know.' :
        'You are <b>underconfident by ' + Math.round(-gap) + ' points</b>: right ' + Math.round(hit) + '% of the time while saying ' + Math.round(avgC) + '%. You may be sizing too small on calls you get right.';
    calBox.innerHTML = '<div class="pr-cal">' + svg + '<div class="pr-cal-txt">' +
      '<div class="pr-big">' + brier.toFixed(3) + '</div><div class="tl-hint">Brier score over ' + cs.length + ' calls. 0 is perfect; always saying "50%" scores 0.250; lower is better.</div>' +
      '<p>' + verdict + '</p>' +
      '<p class="tl-hint">Dots sit on the dashed line when you are calibrated: your 80% calls come true 80% of the time. Bigger dots mean more calls at that level. The theory is in <a href="lessons/action-calibration-scoring.html">Calibration &amp; scoring</a>.</p>' +
      '</div></div>';
  }
  paintCalib();

  // ── Mastery ───────────────────────────────────────────────────────────────────
  (function () {
    if (!masBox) return;
    var q = V.quizAll(), rows = [], missed = [];
    Object.keys(q).forEach(function (slug) {
      var info = L[slug]; if (!info) return;
      var m = q[slug] || {}, got = 0, n = 0;
      Object.keys(m).forEach(function (i) { var r = m[i]; if (!r) return; n++; got += r.g; if (r.g < 1) missed.push({ slug: slug, t: info.t, i: +i, g: r.g, at: r.at }); });
      if (n) rows.push({ slug: slug, t: info.t, got: got, n: n, q: info.q || n, pct: got / (info.q || n) });
    });
    var total = Object.keys(L).length, mastered = rows.filter(function (r) { return r.pct >= 0.7; }).length;
    if (!rows.length) { masBox.innerHTML = '<p class="tl-hint">No self-tests graded yet. At the end of each lesson, type an answer, open the question, then mark yourself Got it, Partly or Missed. Lessons where you score 70% or more show here as mastered.</p>'; return; }
    rows.sort(function (a, b) { return a.pct - b.pct; });
    var h = '<div class="pr-mas-head"><div class="pr-big">' + mastered + ' <span>of ' + total + '</span></div><div class="tl-hint">lessons mastered (70%+ on the self-test). ' + rows.length + ' tested so far.</div></div>';
    h += '<table class="pr-mas"><thead><tr><th>Lesson</th><th>Score</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
      var w = Math.round(100 * Math.min(1, r.pct));
      return '<tr' + (r.pct >= 0.7 ? ' class="ok"' : '') + '><td><a href="lessons/' + esc(r.slug) + '.html#tl-selftest">' + r.t + '</a></td><td class="pr-num">' + r.got + ' / ' + r.q + '</td><td><span class="pr-bar"><i style="width:' + w + '%"></i></span></td></tr>';
    }).join('') + '</tbody></table>';
    if (missed.length) {
      missed.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      h += '<h3>Questions to go back to</h3><ul class="pr-missed">' + missed.slice(0, 15).map(function (x) {
        return '<li><a href="lessons/' + esc(x.slug) + '.html">' + x.t + '</a>, question ' + (x.i + 1) + (x.g ? ' (partly)' : '') + '</li>';
      }).join('') + '</ul><p class="tl-hint">Missed questions also come back first in "Due for review" on the hub.</p>';
    }
    masBox.innerHTML = h;
  })();
})();
