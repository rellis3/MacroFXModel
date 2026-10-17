/* Theory Lab — trade journal (journal.html). Trades live in localStorage theoryLabJournal, this browser only;
 * CSV and JSON export, JSON restore. R = (exit − entry) × side ÷ |entry − stop| unless typed in.
 * checklist.html can hand over a draft (theoryLabJournalDraft): trade name, lessons ticked, note.
 */
(function () {
  'use strict';
  var K = 'theoryLabJournal', L = window.TL_LESSONS || {};
  var form = document.getElementById('jn-form'), chipsEl = document.getElementById('jn-chips'), lin = document.getElementById('jn-lesson-in');
  function all() { try { return JSON.parse(localStorage.getItem(K) || '[]') || []; } catch (e) { return []; } }
  function put(a) { try { localStorage.setItem(K, JSON.stringify(a)); } catch (e) { msg('Could not save: browser storage is full or blocked.'); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t) { document.getElementById('jn-msg').textContent = t; }
  function title(slug) { var x = L[slug]; return x ? x.t.replace(/&amp;/g, '&') : slug; }
  function num(v) { return v === '' || v == null ? null : +v; }
  function rOf(t) {
    if (t.r != null && t.r !== '') return +t.r;
    if (t.entry == null || t.stop == null || t.exit == null || t.entry === t.stop) return null;
    return Math.round((t.exit - t.entry) * t.dir / Math.abs(t.entry - t.stop) * 100) / 100;
  }
  // lesson picker
  var bySlug = Object.keys(L), byTitle = {};
  document.getElementById('jn-lessons').innerHTML = bySlug.map(function (s) { byTitle[title(s)] = s; return '<option value="' + esc(title(s)) + '">'; }).join('');
  var chips = [];
  function paintChips() { chipsEl.innerHTML = chips.map(function (s, i) { return '<span class="jn-chip">' + esc(title(s)) + ' <button type="button" data-x="' + i + '" aria-label="Remove">×</button></span>'; }).join(''); }
  function addLesson() { var s = byTitle[lin.value.trim()]; if (s && chips.indexOf(s) < 0) { chips.push(s); paintChips(); } lin.value = ''; }
  lin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addLesson(); } });
  lin.addEventListener('change', function () { if (byTitle[lin.value.trim()]) addLesson(); });
  chipsEl.addEventListener('click', function (e) { var x = e.target.getAttribute('data-x'); if (x != null) { chips.splice(+x, 1); paintChips(); } });
  // draft from the checklist
  var editing = null;
  function reset() { form.reset(); form.d.value = new Date().toISOString().slice(0, 10); chips = []; paintChips(); editing = null; document.getElementById('jn-cancel').hidden = true; document.getElementById('jn-save').textContent = 'Save trade'; }
  reset();
  try {
    var dr = JSON.parse(localStorage.getItem('theoryLabJournalDraft') || 'null');
    if (dr) {
      form.inst.value = dr.name || ''; form.note.value = (dr.note || '') + (dr.checklist ? '\n(Checklist: ' + dr.checklist + ' ticked)' : '');
      chips = (dr.lessons || []).filter(function (s) { return L[s]; }); paintChips();
      localStorage.removeItem('theoryLabJournalDraft'); msg('Filled in from your checklist. Add the prices and save.');
    }
  } catch (e) {}
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = { id: editing || Date.now().toString(36), d: form.d.value, inst: form.inst.value.trim(), dir: +form.dir.value, conf: num(form.conf.value),
      entry: num(form.entry.value), stop: num(form.stop.value), exit: num(form.exit.value), r: num(form.r.value), lessons: chips.slice(),
      note: form.note.value.trim(), proc: form.proc.value, review: form.review.value.trim() };
    var a = all(), i = a.map(function (x) { return x.id; }).indexOf(t.id);
    if (i >= 0) a[i] = t; else a.push(t);
    put(a); reset(); msg('Saved.'); render();
  });
  document.getElementById('jn-cancel').addEventListener('click', function () { reset(); msg(''); });
  // list + stats
  function stats(ts) {
    var c = ts.filter(function (t) { return rOf(t) != null; }), n = c.length, w = c.filter(function (t) { return rOf(t) > 0; }).length, tot = 0;
    c.forEach(function (t) { tot += rOf(t); });
    return { n: n, win: n ? w / n : 0, avg: n ? tot / n : 0, tot: tot };
  }
  function fmtR(x) { return (x > 0 ? '+' : '') + x.toFixed(2) + 'R'; }
  function render() {
    var a = all().sort(function (x, y) { return x.d < y.d ? 1 : -1; }), s = stats(a);
    var box = document.getElementById('jn-stats');
    if (!s.n) box.innerHTML = '<p class="tl-hint">Closed trades show here: win rate, average R and which lessons the winners leaned on.</p>';
    else {
      var per = {};
      a.forEach(function (t) { (t.lessons || []).forEach(function (l) { (per[l] = per[l] || []).push(t); }); });
      var rows = Object.keys(per).map(function (l) { return { l: l, s: stats(per[l]) }; }).filter(function (x) { return x.s.n; }).sort(function (x, y) { return y.s.tot - x.s.tot; });
      var g = { gg: 0, gb: 0, bg: 0, bb: 0 };
      a.forEach(function (t) { var r = rOf(t); if (r == null || !t.proc) return; g[(t.proc === 'good' ? 'g' : 'b') + (r > 0 ? 'g' : 'b')]++; });
      box.innerHTML = '<div class="tl-stat-row jn-top">' +
        '<div class="tl-stat"><div class="pr-big">' + s.n + '</div><div class="tl-hint">closed trades</div></div>' +
        '<div class="tl-stat"><div class="pr-big">' + Math.round(100 * s.win) + '%</div><div class="tl-hint">winners</div></div>' +
        '<div class="tl-stat"><div class="pr-big">' + fmtR(s.avg) + '</div><div class="tl-hint">expectancy per trade</div></div>' +
        '<div class="tl-stat"><div class="pr-big">' + fmtR(s.tot) + '</div><div class="tl-hint">total</div></div></div>' +
        (s.n < 20 ? '<p class="tl-hint">With ' + s.n + ' trades these numbers are mostly noise: a coin flip lands 60/40 often over this few. Read them after twenty or thirty.</p>' : '') +
        '<div class="jn-split"><div><h3>By lesson</h3>' + (rows.length ? '<table class="pr-mas"><thead><tr><th>Lesson relied on</th><th>Trades</th><th>Win</th><th>Avg</th><th>Total</th></tr></thead><tbody>' +
          rows.map(function (x) { return '<tr><td><a href="lessons/' + esc(x.l) + '.html">' + esc(title(x.l)) + '</a></td><td class="pr-num">' + x.s.n + '</td><td class="pr-num">' + Math.round(100 * x.s.win) + '%</td><td class="pr-num">' + fmtR(x.s.avg) + '</td><td class="pr-num">' + fmtR(x.s.tot) + '</td></tr>'; }).join('') +
          '</tbody></table>' : '<p class="tl-hint">Tag trades with lessons to see this.</p>') + '</div>' +
        '<div><h3>Decision vs result</h3><table class="jn-grid"><tr><th></th><th>Won</th><th>Lost</th></tr>' +
        '<tr><th>Good process</th><td class="ok">' + g.gg + '<span>deserved</span></td><td>' + g.gb + '<span>bad luck</span></td></tr>' +
        '<tr><th>Poor process</th><td class="warn">' + g.bg + '<span>dumb luck</span></td><td class="bad">' + g.bb + '<span>deserved</span></td></tr></table>' +
        '<p class="tl-hint">The dangerous cell is "dumb luck": wins that teach you to break your rules.</p></div></div>';
    }
    document.getElementById('jn-list').innerHTML = a.length ? '<table class="pr-mas jn-list"><thead><tr><th>Date</th><th>Trade</th><th>R</th><th>Lessons</th><th></th></tr></thead><tbody>' + a.map(function (t) {
      var r = rOf(t);
      return '<tr><td class="pr-num">' + esc(t.d) + '</td><td>' + (t.dir > 0 ? 'Long ' : 'Short ') + esc(t.inst) + (t.note ? '<div class="tl-hint">' + esc(t.note) + '</div>' : '') + (t.review ? '<div class="tl-hint">Review: ' + esc(t.review) + '</div>' : '') + '</td>' +
        '<td class="pr-num ' + (r == null ? '' : r > 0 ? 'jn-win' : 'jn-loss') + '">' + (r == null ? 'open' : fmtR(r)) + '</td>' +
        '<td class="jn-ls">' + (t.lessons || []).map(function (l) { return '<a href="lessons/' + esc(l) + '.html">' + esc(title(l)) + '</a>'; }).join(', ') + '</td>' +
        '<td><button type="button" class="tl-btn" data-edit="' + esc(t.id) + '">Edit</button> <button type="button" class="tl-btn" data-del="' + esc(t.id) + '">Delete</button></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="tl-hint">No trades yet.</p>';
  }
  document.getElementById('jn-list').addEventListener('click', function (e) {
    var ed = e.target.getAttribute('data-edit'), de = e.target.getAttribute('data-del'), a = all();
    if (de && window.confirm('Delete this trade?')) { put(a.filter(function (t) { return t.id !== de; })); render(); }
    if (ed) {
      var t = a.filter(function (x) { return x.id === ed; })[0]; if (!t) return;
      editing = t.id; ['d', 'inst', 'note', 'proc', 'review'].forEach(function (k) { form[k].value = t[k] || ''; });
      form.dir.value = String(t.dir); ['conf', 'entry', 'stop', 'exit', 'r'].forEach(function (k) { form[k].value = t[k] == null ? '' : t[k]; });
      chips = (t.lessons || []).slice(); paintChips();
      document.getElementById('jn-cancel').hidden = false; document.getElementById('jn-save').textContent = 'Save changes';
      form.scrollIntoView({ behavior: 'smooth' });
    }
  });
  function download(text, name, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  document.getElementById('jn-csv').addEventListener('click', function () {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['date', 'instrument', 'side', 'confidence', 'entry', 'stop', 'exit', 'R', 'lessons', 'process', 'note', 'review']].concat(all().map(function (t) {
      return [t.d, t.inst, t.dir > 0 ? 'long' : 'short', t.conf, t.entry, t.stop, t.exit, rOf(t), (t.lessons || []).join(' '), t.proc, t.note, t.review];
    }));
    download(rows.map(function (r) { return r.map(q).join(','); }).join('\n') + '\n', 'trade-journal.csv', 'text/csv');
  });
  document.getElementById('jn-json').addEventListener('click', function () { download(JSON.stringify(all(), null, 1), 'trade-journal-backup.json', 'application/json'); });
  document.getElementById('jn-import').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var inc = JSON.parse(txt); if (!Array.isArray(inc)) throw new Error('not a journal backup');
      var a = all(), ids = a.map(function (t) { return t.id; }), added = 0;
      inc.forEach(function (t) { if (t && t.id && t.d && ids.indexOf(t.id) < 0) { a.push(t); added++; } });
      put(a); render(); msg('Restored ' + added + ' trade' + (added === 1 ? '' : 's') + '.');
    }).catch(function (err) { msg('Could not read that file: ' + err.message); });
    e.target.value = '';
  });
  render();
})();
