/* Theory Lab — shared "visual guide" slide-deck engine. Handles navigation
   (buttons, arrow keys, touch swipe), the progress bar, tab groups, and
   quiz questions generically by scanning the page for known classes — a
   lesson page only needs its own markup plus, if it has bespoke
   interactive widgets (a custom slider, a calculator), a small inline
   <script> wiring just those up. Never copy this file; every visual-guide
   lesson should link to it directly. */
(function(){
  var slides = Array.prototype.slice.call(document.querySelectorAll('.sl-slide'));
  var total = slides.length;
  var idx = 0;
  var countEl = document.getElementById('sl-count');
  var totalEl = document.getElementById('sl-total');
  var prevBtn = document.getElementById('sl-prev');
  var nextBtn = document.getElementById('sl-next');
  var progressEl = document.getElementById('sl-progress');
  var viewport = document.getElementById('sl-viewport');
  var HUB_HREF = '../hub.html';

  // Reading-progress tracking — same localStorage key and record shape as
  // theory-lab/assets/progress.js's scroll-based tracker on the full,
  // article-style lessons. A slide deck has no scroll to measure, so
  // progress here is simply how far through the deck the reader has
  // navigated. A trailing "-micro" is stripped from the slug so a lesson's
  // full version and its visual-guide sibling share the SAME progress
  // entry — hub.html's per-card ring reflects whichever one was read,
  // and neither can regress the other (percent is a high-water mark).
  var PROGRESS_KEY = 'theoryLabProgress';
  var slug = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '').replace(/-micro$/, '');
  var progressRec = null;
  if (slug) {
    var readStore = function(){
      try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
      catch (e) { return {}; }
    };
    var saved = readStore()[slug] || {};
    progressRec = {
      scrollPct: Number(saved.scrollPct) || 0,
      activeSec: Number(saved.activeSec) || 0,
      percent: Number(saved.percent) || 0,
      firstVisit: saved.firstVisit || Date.now(),
      completedAt: saved.completedAt || null
    };
    var persistProgress = function(livePercent){
      progressRec.percent = Math.max(progressRec.percent, livePercent);
      progressRec.updatedAt = Date.now();
      if (progressRec.percent >= 100 && !progressRec.completedAt) progressRec.completedAt = Date.now();
      var store = readStore(); // re-read so another open tab's entry isn't clobbered
      store[slug] = progressRec;
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(store)); } catch (e) {}
    };
    window.addEventListener('pagehide', function(){ persistProgress(progressRec.percent); });
  }

  totalEl.textContent = total;
  for (var i = 0; i < total; i++) {
    var seg = document.createElement('div');
    seg.className = 'sl-seg';
    seg.innerHTML = '<i></i>';
    progressEl.appendChild(seg);
  }
  var segs = Array.prototype.slice.call(progressEl.querySelectorAll('.sl-seg'));

  function render(){
    slides.forEach(function(s, i){ s.classList.toggle('active', i === idx); });
    segs.forEach(function(s, i){
      s.classList.toggle('done', i < idx);
      s.classList.toggle('current', i === idx);
    });
    countEl.textContent = idx + 1;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === total - 1 ? 'Finish ✓' : 'Next →';
    viewport.scrollTop = 0;
    if (progressRec) persistProgress(Math.round(((idx + 1) / total) * 100));
  }

  function go(delta){
    var next = idx + delta;
    if (next < 0 || next > total - 1) return;
    idx = next;
    render();
  }

  prevBtn.addEventListener('click', function(){ go(-1); });
  nextBtn.addEventListener('click', function(){
    if (idx === total - 1) { window.location.href = HUB_HREF; return; }
    go(1);
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  });

  // Swipe navigation for touch devices. Ignored when the touch starts on an
  // interactive control (slider, tab, quiz button, input, link) so
  // dragging a slider or typing in a field never gets mistaken for a swipe.
  (function(){
    var startX = 0, startY = 0, tracking = false;
    var SWIPE_MIN_PX = 60;
    viewport.addEventListener('touchstart', function(e){
      var t = e.changedTouches[0];
      tracking = !t.target.closest('input, button, a, .sl-tabs');
      startX = t.clientX; startY = t.clientY;
    }, {passive: true});
    viewport.addEventListener('touchend', function(e){
      if (!tracking) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX, dy = t.clientY - startY;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        go(dx < 0 ? 1 : -1);
      }
    }, {passive: true});
  })();

  render();

  // Auto-wire every .sl-tabs group on the page — no per-lesson call needed.
  document.querySelectorAll('.sl-tabs').forEach(function(group){
    var tabs = Array.prototype.slice.call(group.querySelectorAll('.sl-tab'));
    tabs.forEach(function(tab){
      tab.addEventListener('click', function(){
        tabs.forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        var card = tab.closest('.sl-card');
        card.querySelectorAll('.sl-panel').forEach(function(p){ p.classList.remove('active'); });
        var target = document.getElementById(tab.getAttribute('data-panel'));
        if (target) target.classList.add('active');
      });
    });
  });

  // Auto-wire every quiz question on the page.
  document.querySelectorAll('.sl-quiz-q').forEach(function(q){
    var opts = Array.prototype.slice.call(q.querySelectorAll('.sl-quiz-opt'));
    var explain = q.querySelector('.sl-quiz-explain');
    opts.forEach(function(opt){
      opt.addEventListener('click', function(){
        opts.forEach(function(o){ o.disabled = true; });
        opts.forEach(function(o){ if (o.dataset.correct === 'true') o.classList.add('correct'); });
        if (opt.dataset.correct !== 'true') opt.classList.add('wrong');
        if (explain) explain.classList.add('shown');
      });
    });
  });
})();
