// Theory Lab — per-lesson reading-progress tracker.
// Tracks max scroll depth reached and active (visible-tab) reading time for
// the current lesson, converts both into a single 0-100% "how far through"
// number, and persists it to localStorage under theoryLabProgress[slug].
// Everything here is local to this browser — there is no account and no
// server; hub.html reads the same key to paint per-card progress rings.
(function(){
  'use strict';
  var STORAGE_KEY = 'theoryLabProgress';
  var slug = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '');
  if (!slug) return;

  function readStore(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function writeStore(store){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (e) {}
  }

  var saved = readStore()[slug] || {};
  var rec = {
    scrollPct: Number(saved.scrollPct) || 0,
    activeSec: Number(saved.activeSec) || 0,
    percent: Number(saved.percent) || 0,
    firstVisit: saved.firstVisit || Date.now(),
    completedAt: saved.completedAt || null
  };

  var readMinutes = 10;
  var metaEl = document.querySelector('.tl-meta');
  if (metaEl) {
    var m = metaEl.textContent.match(/(\d+(?:\.\d+)?)\s*min read/i);
    if (m) readMinutes = parseFloat(m[1]);
  }
  var readSec = Math.max(60, readMinutes * 60);

  function scrollPctNow(){
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 40) return 0; // page doesn't really scroll — lean on the time signal instead
    return Math.min(1, Math.max(0, window.scrollY / scrollable));
  }

  function bestPercent(){
    var sPct = Math.max(rec.scrollPct, scrollPctNow());
    var tPct = Math.min(1, rec.activeSec / readSec);
    var live = Math.round(Math.min(1, Math.max(sPct, tPct)) * 100);
    return Math.max(rec.percent, live); // high-water mark — never drops on rescroll
  }

  var bar = document.createElement('div');
  bar.id = 'tl-progress-bar';
  var fill = document.createElement('div');
  fill.id = 'tl-progress-bar-fill';
  bar.appendChild(fill);
  document.body.appendChild(bar);

  function paint(){
    fill.style.width = bestPercent() + '%';
  }

  var rafPending = false;
  window.addEventListener('scroll', function(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function(){
      rafPending = false;
      rec.scrollPct = Math.max(rec.scrollPct, scrollPctNow());
      paint();
    });
  }, { passive: true });

  function persist(){
    rec.percent = bestPercent();
    rec.updatedAt = Date.now();
    if (rec.percent >= 100 && !rec.completedAt) rec.completedAt = Date.now();
    var store = readStore(); // re-read so another open tab's lesson entry isn't clobbered
    store[slug] = rec;
    writeStore(store);
  }

  var ticks = 0;
  setInterval(function(){
    if (document.visibilityState === 'visible') rec.activeSec += 1;
    paint();
    ticks++;
    if (ticks % 5 === 0) persist();
  }, 1000);

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') persist();
  });
  window.addEventListener('pagehide', persist);

  rec.scrollPct = Math.max(rec.scrollPct, scrollPctNow());
  paint();
  persist();
})();
