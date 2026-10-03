// js/dataMap.js — the 🗄 Data Map overlay: every data feed the desk runs on, what it is
// for, where it is used and when it last actually updated.
//
// The third map, next to 🗺 Site Map (pages) and 🔌 API Map (endpoints). Those two are
// hand-written HTML; this one is NOT, on purpose. The feed list lives in one registry
// (js/dataFeeds.js), each feed's series and their traps come from the series catalogue
// (js/dataCatalogue.js), "where used" is scanned from the repo by the server, and
// "last updated" comes from the same timestamps /api/data-health reads -- so the map
// cannot quietly drift from the code the way a hand-kept list does.
//
// Usage: load this script and call openDataMap(). js/commandHub.js loads it on demand
// from its nav pill; index.html / today.html load it next to siteApiMap.js.
// Classic script (no module) so an inline onclick can reach openDataMap.

(function () {
  if (window.openDataMap) return;

  if (!document.getElementById('dmStyles')) {
    var style = document.createElement('style');
    style.id = 'dmStyles';
    style.textContent = `
#dmOverlay{display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);align-items:center;justify-content:center}
#dmOverlay.open{display:flex}
#dmModal{background:#0d1117;border:1px solid #1e2a3a;border-radius:14px;width:min(1080px,97vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.7);font-family:'DM Sans',system-ui,sans-serif;color:#e2e8f0}
#dmHeader{display:flex;align-items:center;gap:10px;padding:14px 18px 10px;flex-shrink:0;flex-wrap:wrap}
#dmHeader h2{margin:0;font-size:15px;font-weight:700;flex:1;white-space:nowrap}
#dmSearch{background:#111827;border:1px solid #1e2a3a;border-radius:7px;color:#e2e8f0;font-size:12px;padding:6px 11px;width:220px;outline:none;font-family:inherit}
#dmSearch:focus{border-color:#a78bfa}
.dm-x{background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;line-height:1;padding:2px 6px}
.dm-x:hover{color:#e2e8f0}
#dmSummary{display:flex;gap:6px;flex-wrap:wrap;padding:0 18px 10px;flex-shrink:0}
.dm-chip{border:1px solid #1e2a3a;background:#111827;color:#94a3b8;border-radius:999px;font-size:11px;font-weight:600;padding:4px 10px;cursor:pointer;font-family:inherit;white-space:nowrap}
.dm-chip b{color:#e2e8f0;font-weight:700;margin-right:3px}
.dm-chip.on{border-color:#a78bfa;color:#e2e8f0;background:#1a1530}
.dm-chip .d{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px}
#dmCats{display:flex;gap:6px;flex-wrap:wrap;padding:0 18px 10px;border-bottom:1px solid #1e2a3a;flex-shrink:0}
#dmBody{overflow-y:auto;padding:12px 18px 20px;display:flex;flex-direction:column;gap:20px}
.dm-note{font-size:11px;color:#64748b;line-height:1.5;margin:0}
.dm-cat-hd{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 0 6px;border-bottom:1px solid #1e2a3a;margin-bottom:4px;display:flex;gap:8px;align-items:baseline}
.dm-cat-hd span{color:#64748b;font-weight:600;letter-spacing:0;text-transform:none}
.dm-feed{border-radius:8px;padding:8px 8px;cursor:pointer;border:1px solid transparent}
.dm-feed:hover{background:#121826}
.dm-feed.open{background:#121826;border-color:#1e2a3a}
.dm-top{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:8px;align-items:baseline}
.dm-dot{width:9px;height:9px;border-radius:50%;display:inline-block;transform:translateY(1px)}
.dm-name{font-size:12.5px;font-weight:600;color:#e2e8f0}
.dm-prov{font-size:10px;font-weight:600;color:#8b9ab0;background:#161d2b;border:1px solid #232f42;border-radius:4px;padding:0 5px;margin-left:6px;white-space:nowrap}
.dm-when{font-size:11px;color:#94a3b8;white-space:nowrap;text-align:right}
.dm-when small{display:block;font-size:10px;color:#64748b}
.dm-purpose{grid-column:2/4;font-size:11.5px;color:#8b9ab0;line-height:1.45;margin-top:2px}
.dm-uses{grid-column:2/4;font-size:10.5px;color:#5b7085;margin-top:3px}
.dm-more{display:none;grid-column:2/4;margin-top:8px;font-size:11.5px;line-height:1.5}
.dm-feed.open .dm-more{display:block}
.dm-kv{display:grid;grid-template-columns:110px minmax(0,1fr);gap:4px 10px}
.dm-kv dt{color:#64748b;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding-top:1px}
.dm-kv dd{margin:0;color:#c9d4e3;overflow-wrap:anywhere}
.dm-kv code{font-family:'JetBrains Mono',Consolas,monospace;font-size:10.5px;background:#161d2b;border-radius:4px;padding:0 4px;color:#c9d4e3}
.dm-kv a{color:#93c5fd;text-decoration:none}
.dm-kv a:hover{text-decoration:underline}
.dm-series{display:flex;flex-direction:column;gap:5px;max-height:260px;overflow:auto}
.dm-sw{font-size:10.5px;color:#64748b;line-height:1.4}
.dm-tag{font-size:9px;font-weight:700;border-radius:4px;padding:0 4px;letter-spacing:.04em;text-transform:uppercase}
.dm-tag.ok{background:#0d3b2e;color:#34d399}
.dm-tag.warn{background:#3b2a0d;color:#fbbf24;cursor:help}
.dm-why{border-left:3px solid #334155;padding:2px 0 2px 8px;color:#c9d4e3}
.dm-empty{font-size:12px;color:#64748b;padding:20px 0;text-align:center}
.dm-warn{border:1px solid #3b2a0d;background:#1c1609;border-radius:8px;padding:8px 10px;font-size:11.5px;color:#fbbf24;line-height:1.5}
.dm-warn code{font-family:'JetBrains Mono',Consolas,monospace;font-size:10.5px;color:#fde68a}
@media (max-width:700px){
  #dmModal{width:100vw;max-height:100vh;height:100vh;border-radius:0}
  #dmSearch{width:100%;order:3}
  #dmSummary,#dmCats{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  #dmSummary::-webkit-scrollbar,#dmCats::-webkit-scrollbar{display:none}
  .dm-kv{grid-template-columns:1fr;gap:0}
  .dm-kv dt{margin-top:6px}
}
`;
    document.head.appendChild(style);
  }

  // The vocabulary a reader sees. "unknown" is gone: it described the code's state, not
  // the feed's. A cache that has not filled since a restart is "loading"; a feed with
  // no timestamp to check is "not tracked" -- and the map says which, and why.
  var STATUS = {
    current:   { label: 'Current',        colour: '#10b981', rank: 5 },
    behind:    { label: 'Behind',         colour: '#f59e0b', rank: 2 },
    stale:     { label: 'Stale',          colour: '#f87171', rank: 1 },
    dead:      { label: 'Dead',           colour: '#ef4444', rank: 0 },
    loading:   { label: 'Loading',        colour: '#60a5fa', rank: 3 },
    file:      { label: 'Static file',    colour: '#a78bfa', rank: 4 },
    untracked: { label: 'Not tracked',    colour: '#475569', rank: 6 },
  };
  var ATTENTION = { behind: 1, stale: 1, dead: 1 };

  var state = { data: null, filter: 'all', cat: 'all', q: '', open: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function ago(iso) {
    var ms = Date.parse(iso || '');
    if (!isFinite(ms)) return null;
    var m = Math.max(0, (Date.now() - ms) / 60000);
    if (m < 60) return Math.round(m) + ' min ago';
    if (m < 48 * 60) return Math.round(m / 60) + 'h ago';
    return Math.round(m / 1440) + ' days ago';
  }

  function inject() {
    if (document.getElementById('dmOverlay')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div id="dmOverlay" onclick="if(event.target===this)closeDataMap()">' +
      '<div id="dmModal" role="dialog" aria-label="Data Map">' +
      '<div id="dmHeader"><h2>🗄 Data Map</h2>' +
      '<input id="dmSearch" type="search" placeholder="Search feeds, series, pages…" autocomplete="off">' +
      '<button class="dm-x" title="Reload" onclick="dmReload()">↻</button>' +
      '<button class="dm-x" title="Close" onclick="closeDataMap()">✕</button></div>' +
      '<div id="dmSummary"></div><div id="dmCats"></div><div id="dmBody"></div></div></div>');
    document.getElementById('dmSearch').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); render(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeDataMap(); });
  }

  function matches(f) {
    if (state.filter === 'attention' && !ATTENTION[f.status]) return false;
    if (state.filter !== 'all' && state.filter !== 'attention' && f.status !== state.filter) return false;
    if (state.cat !== 'all' && f.category !== state.cat) return false;
    if (!state.q) return true;
    var hay = [f.name, f.provider, f.purpose, f.details, f.store, f.refresh, (f.endpoints || []).join(' '),
      (f.series || []).map(function (x) { return x.id + ' ' + (x.label || ''); }).join(' '),
      (f.pages || []).map(function (p) { return p.file + ' ' + (p.title || ''); }).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(state.q) >= 0;
  }

  function feedHtml(f) {
    var s = STATUS[f.status] || STATUS.untracked;
    var when = f.lastUpdated ? ago(f.lastUpdated) : null;
    var right = when ? esc(when) + '<small>' + s.label + '</small>' : '<small style="color:' + s.colour + '">' + s.label + '</small>';
    var pages = f.pages || [];
    var nSer = (f.series || []).length;
    var usesTxt = (nSer ? nSer + ' series · ' : '') + (pages.length
      ? 'Used on ' + pages.slice(0, 4).map(function (p) { return esc(p.title || p.file); }).join(', ') + (pages.length > 4 ? ' +' + (pages.length - 4) + ' more' : '')
      : (f.consumers ? 'Used by ' + esc(f.consumers) : 'No page reads it directly'));
    var kv = '';
    var row = function (k, v) { if (v) kv += '<dt>' + k + '</dt><dd>' + v + '</dd>'; };
    row('Status', '<div class="dm-why">' + esc(f.why || s.label) + '</div>');
    row('What it is', esc(f.details));
    row('Provider', esc(f.provider) + (f.source ? ' · <code>' + esc(f.source) + '</code>' : ''));
    row('Refreshes', esc(f.refresh));
    row('Stored in', f.store ? '<code>' + esc(f.store) + '</code>' : '');
    row('Last update', f.lastUpdated ? esc(String(f.lastUpdated).replace('T', ' ').slice(0, 16)) + ' UTC' : '');
    row('API', (f.endpoints || []).map(function (e) { return '<code>' + esc(e) + '</code>'; }).join(' '));
    row('Pages', pages.map(function (p) { return '<a href="' + esc(p.file) + '" target="_blank">' + esc(p.title || p.file) + '</a>'; }).join(' · '));
    row('Also feeds', esc(f.consumers));
    var ser = f.series || [];
    if (ser.length) row('Series (' + ser.length + ')', '<div class="dm-series">' + ser.map(function (x) {
      return '<div><code>' + esc(x.id) + '</code> ' + esc(x.label || '') +
        (x.tested ? ' <span class="dm-tag ok" title="tested in the evidence book">tested</span>' : '') +
        (x.trap ? ' <span class="dm-tag warn" title="' + esc(x.trap) + '">trap</span>' : '') +
        (x.why ? '<div class="dm-sw">' + esc(x.why) + '</div>' : '') + '</div>';
    }).join('') + '</div>');
    return '<div class="dm-feed' + (state.open[f.id] ? ' open' : '') + '" data-id="' + esc(f.id) + '">' +
      '<div class="dm-top"><span class="dm-dot" style="background:' + s.colour + '" title="' + s.label + '"></span>' +
      '<div><span class="dm-name">' + esc(f.name) + '</span><span class="dm-prov">' + esc(f.provider) + '</span></div>' +
      '<div class="dm-when">' + right + '</div>' +
      '<div class="dm-purpose">' + esc(f.purpose) + '</div>' +
      '<div class="dm-uses">' + usesTxt + '</div>' +
      '<div class="dm-more"><dl class="dm-kv">' + kv + '</dl></div></div></div>';
  }

  function render() {
    var d = state.data;
    var sum = document.getElementById('dmSummary'), cats = document.getElementById('dmCats'), body = document.getElementById('dmBody');
    if (!d) { sum.innerHTML = ''; cats.innerHTML = ''; body.innerHTML = '<div class="dm-empty">Loading the catalogue…</div>'; return; }
    if (d.error) { body.innerHTML = '<div class="dm-empty">Could not load the catalogue: ' + esc(d.error) + '</div>'; return; }

    var c = d.summary.byStatus || {};
    var chip = function (key, label, n, colour) {
      return '<button class="dm-chip' + (state.filter === key ? ' on' : '') + '" data-filter="' + key + '">' +
        (colour ? '<span class="d" style="background:' + colour + '"></span>' : '') + '<b>' + n + '</b>' + label + '</button>';
    };
    var html = chip('all', 'feeds', d.feeds.length);
    if (d.summary.needsEyes) html += chip('attention', 'need attention', d.summary.needsEyes, '#ef4444');
    ['current', 'loading', 'file', 'untracked'].forEach(function (k) { if (c[k]) html += chip(k, STATUS[k].label.toLowerCase(), c[k], STATUS[k].colour); });
    sum.innerHTML = html;

    cats.innerHTML = '<button class="dm-chip' + (state.cat === 'all' ? ' on' : '') + '" data-cat="all">All areas</button>' +
      d.categories.map(function (k) {
        var n = d.feeds.filter(function (f) { return f.category === k.id; }).length;
        return n ? '<button class="dm-chip' + (state.cat === k.id ? ' on' : '') + '" data-cat="' + esc(k.id) + '"><span class="d" style="background:' + k.colour + '"></span>' + esc(k.label) + ' <span style="color:#64748b">' + n + '</span></button>' : '';
      }).join('');

    var out = '<p class="dm-note">Every feed the desk runs on — tap one for its series, how it refreshes, where it is stored, the endpoints that serve it and the pages that read it. ' +
      'Freshness is judged against each feed’s own schedule in business days, so Friday’s close is current on Monday. ' +
      '<b style="color:#94a3b8">Loading</b> means an in-memory cache that has not refilled since the last deploy (it warms itself a few minutes after boot); ' +
      '<b style="color:#94a3b8">Not tracked</b> means no timestamp is recorded for it yet, which is not the same as broken.</p>';
    if (d.uncatalogued && d.uncatalogued.length && state.cat === 'all' && !state.q) {
      out += '<div class="dm-warn">⚠ The server fetches from ' + d.uncatalogued.length + ' host' + (d.uncatalogued.length > 1 ? 's' : '') +
        ' this catalogue does not describe yet: ' + d.uncatalogued.map(function (h) { return '<code>' + esc(h) + '</code>'; }).join(' ') +
        '. Add them to <code>js/dataFeeds.js</code>.</div>';
    }
    var shown = 0;
    d.categories.forEach(function (k) {
      var rows = d.feeds.filter(function (f) { return f.category === k.id && matches(f); })
        .sort(function (a, b) { return (STATUS[a.status] || STATUS.untracked).rank - (STATUS[b.status] || STATUS.untracked).rank || a.name.localeCompare(b.name); });
      if (!rows.length) return;
      shown += rows.length;
      out += '<section><div class="dm-cat-hd" style="color:' + k.colour + '">' + esc(k.label) + '<span>' + esc(k.blurb || '') + '</span></div>' + rows.map(feedHtml).join('') + '</section>';
    });
    if (!shown) out += '<div class="dm-empty">No feed matches that.</div>';
    out += '<p class="dm-note">Catalogue built ' + esc(ago(d.generatedAt) || '') + ' · server up since ' + esc(String(d.bootedAt || '').replace('T', ' ').slice(0, 16)) + ' UTC · ' +
      'source of truth: <code>js/dataFeeds.js</code> (feeds) + <code>js/dataCatalogue.js</code> (series) + a scan of every page for the endpoints it calls.</p>';
    body.innerHTML = out;
  }

  function bind() {
    var m = document.getElementById('dmModal');
    if (m.__bound) return; m.__bound = true;
    m.addEventListener('click', function (e) {
      var t = e.target.closest('[data-filter],[data-cat],.dm-feed');
      if (!t || e.target.closest('a')) return;
      if (t.dataset.filter) { state.filter = t.dataset.filter; render(); }
      else if (t.dataset.cat) { state.cat = t.dataset.cat; render(); }
      else if (t.dataset.id) {
        if (window.getSelection && String(window.getSelection())) return;   // let people copy a series id
        state.open[t.dataset.id] = !state.open[t.dataset.id]; t.classList.toggle('open');
      }
    });
  }

  window.dmReload = function () {
    state.data = null; render();
    return fetch('/api/data-catalogue').then(function (r) { return r.json(); }).then(function (j) {
      state.data = j && j.ok ? j : { error: (j && j.error) || 'bad response' };
      render();
      if (typeof window.chubHealthPaint === 'function' && j && j.ok) window.chubHealthPaint(j.summary);
    }).catch(function (e) { state.data = { error: e.message }; render(); });
  };

  /** opts.filter: 'attention' opens straight onto the feeds that need eyes. */
  window.openDataMap = function (opts) {
    inject(); bind();
    if (opts && opts.filter) state.filter = opts.filter;
    document.getElementById('dmOverlay').classList.add('open');
    if (!state.data || state.data.error) window.dmReload(); else render();
  };
  window.closeDataMap = function () { var o = document.getElementById('dmOverlay'); if (o) o.classList.remove('open'); };
})();
