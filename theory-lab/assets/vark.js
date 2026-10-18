/* Theory Lab — the VARK layer: every lesson teaches the same idea four ways.
 *
 *   .tl-eqbuild   Visual       a key equation built one term at a time (Back / Next / Show all)
 *   .tl-listen    Aural        a two-voice spoken version of the lesson, written for the ear
 *   (self-test)   Aural        "Quiz me aloud": reads each .tl-quiz question, waits, reads the answer
 *   .tl-predict   Kinesthetic  lock in a guess before touching the sliders, then check it
 *   .tl-drill     Kinesthetic  a dated decision you commit to before seeing what happened
 *
 * .tl-picture and .tl-fits are static markup and need nothing here.
 * Speech uses the browser's own SpeechSynthesis, nothing external. LaTeX conversion and
 * sentence splitting are borrowed from tts.js (window.TLSpeech), which must load first.
 * Without JS, or without speech, every block shows in full: nothing is ever locked away.
 * Guesses and drill choices are kept in this browser only (localStorage theoryLabVark).
 * Markup for each block: education/LESSON_STYLE_GUIDE.md §5.19.
 */
(function () {
  'use strict';
  var page = document.getElementById('page') || document.body;
  var slug = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '').replace(/-micro$/, '') || 'page'; // a deck shares its lesson's answers and recording
  var KEY = 'theoryLabVark';
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(label, cls) { var b = el('button', 'tl-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; return b; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function remember(kind, i, v, store) {
    var k = store || slug, all = load(); all[k] = all[k] || {}; all[k][kind] = all[k][kind] || {};
    if (v == null) delete all[k][kind][i]; else all[k][kind][i] = v;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private window: still works */ }
  }
  function recalled(kind, i, store) { var s = load()[store || slug]; return s && s[kind] ? s[kind][i] : undefined; }
  function typeset(node) { if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([node]).catch(function () {}); }

  // ── Speech helpers (shared by the dialogue and the spoken quiz) ───────────────
  var S = window.TLSpeech || { textToSpeechFriendly: function (t) { return t.replace(/\s+/g, ' ').trim(); }, splitForSpeech: function (t) { return [t]; } };
  var synth = ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') ? window.speechSynthesis : null;
  var RATE_KEY = 'theoryLabTTSRate', VOICE_KEY = 'theoryLabTTSVoiceName';
  var token = 0; // bumped on every new batch, so a cancelled batch's callbacks do nothing
  function voicesEn() {
    if (!synth) return [];
    var v = synth.getVoices(), en = v.filter(function (x) { return /^en/i.test(x.lang); });
    return en.length ? en : v;
  }
  // Two speakers: the reader's saved voice (or the first English one), then a different one.
  // With only one voice installed, the second speaker gets a lower pitch instead.
  function speakerVoices() {
    var v = voicesEn(), saved = null;
    try { saved = localStorage.getItem(VOICE_KEY); } catch (e) {}
    var a = v.filter(function (x) { return x.name === saved; })[0] || v[0] || null;
    var b = v.filter(function (x) { return a && x.name !== a.name && x.lang.slice(0, 2) === a.lang.slice(0, 2); })[0] || null;
    return [{ voice: a, pitch: 1.05 }, b ? { voice: b, pitch: 1 } : { voice: a, pitch: 0.8 }];
  }
  function rate() { var r = 1; try { r = parseFloat(localStorage.getItem(RATE_KEY)) || 1; } catch (e) {} return r; }
  function utter(text, who, onstart, onend) {
    var u = new SpeechSynthesisUtterance(text);
    u.rate = rate();
    if (who && who.voice) u.voice = who.voice;
    if (who) u.pitch = who.pitch;
    var my = token;
    if (onstart) u.onstart = function () { if (my === token) onstart(); };
    if (onend) { u.onend = function () { if (my === token) onend(); }; u.onerror = u.onend; }
    return u;
  }
  function hush() { token++; if (synth && (synth.speaking || synth.pending)) synth.cancel(); }
  window.addEventListener('pagehide', hush);

  // ── Equation build-up ─────────────────────────────────────────────────────────
  $$('.tl-eqbuild').forEach(function (box) {
    var steps = $$('.tl-eqbuild-step', box); if (steps.length < 2) return;
    box.classList.add('js');
    var k = 0, back = btn('◀ Back'), next = btn('Next term ▶', 'active'), all = btn('Show every step'), count = el('span', 'tl-eqbuild-count');
    var bar = el('div', 'tl-eqbuild-bar'); bar.appendChild(back); bar.appendChild(next); bar.appendChild(all); bar.appendChild(count);
    box.appendChild(bar);
    function show(i) {
      k = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (s, j) { s.classList.toggle('on', j === k); });
      back.disabled = k === 0; next.disabled = k === steps.length - 1;
      count.textContent = 'Step ' + (k + 1) + ' of ' + steps.length;
    }
    back.addEventListener('click', function () { show(k - 1); });
    next.addEventListener('click', function () { show(k + 1); });
    all.addEventListener('click', function () {
      var on = !box.classList.contains('all'); box.classList.toggle('all', on);
      all.textContent = on ? 'One step at a time' : 'Show every step';
      back.hidden = next.hidden = count.hidden = on;
    });
    show(0);
  });

  // ── Confidence: every guess and every call carries "how sure were you?" ───────
  // Stored with the answer as { v, c, ok, at } so practice.html can chart calibration (hit rate per
  // confidence level) across every lesson. Older entries were the bare answer; recall() accepts both.
  function confPicker() {
    var w = el('label', 'tl-conf'), sel = el('select', 'tl-conf-select');
    w.appendChild(document.createTextNode('How sure? '));
    [50, 60, 70, 80, 90, 100].forEach(function (n) { var o = el('option', null, n + '%'); o.value = n; if (n === 70) o.selected = true; sel.appendChild(o); });
    w.appendChild(sel); w.sel = sel; return w;
  }
  function val(x) { return x && typeof x === 'object' ? x.v : x; }

  // ── Predict first ─────────────────────────────────────────────────────────────
  function initPredict(box, idx, store) {
    var reveal = box.querySelector('.tl-predict-reveal'); if (!reveal) return;
    store = store || slug;
    box.classList.add('js');
    var opts = box.querySelector('.tl-predict-options');
    var form = el('div', 'tl-predict-form'), verdict = el('div', 'tl-predict-verdict'), input = null, lock = btn('Lock in my guess', 'active'), again = btn('Guess again'), conf = confPicker();
    again.hidden = true;
    var name = 'tlp-' + store + '-' + idx;
    if (opts) {
      $$('li', opts).forEach(function (li, j) {
        var lab = el('label'), r = el('input'); r.type = 'radio'; r.name = name; r.value = String(j);
        while (li.firstChild) lab.appendChild(li.firstChild);
        lab.insertBefore(r, lab.firstChild); li.appendChild(lab);
      });
    } else {
      input = el('input', 'tl-scratch-input'); input.type = 'number'; input.step = 'any'; input.inputMode = 'decimal';
      var u0 = (box.getAttribute('data-unit') || '').trim(); input.placeholder = 'your guess' + (u0 ? ' (' + u0 + ')' : '');
      input.setAttribute('aria-label', 'Your guess');
      form.appendChild(input);
    }
    form.appendChild(conf); form.appendChild(lock); form.appendChild(again);
    box.insertBefore(form, reveal); box.insertBefore(verdict, reveal);
    function picked() { var r = box.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }
    function judge(v) {
      if (opts) { var lis = $$('li', opts), right = lis.filter(function (li) { return li.hasAttribute('data-correct'); })[0]; return !!right && String(lis.indexOf(right)) === String(v); }
      var ans = parseFloat(box.getAttribute('data-answer')), tol = parseFloat(box.getAttribute('data-tol')) || 0;
      return isFinite(ans) && Math.abs(parseFloat(v) - ans) <= tol;
    }
    function settle(rec) {
      var v = val(rec), unit = box.getAttribute('data-unit') || '', ok = judge(v);
      box.classList.add('locked'); lock.hidden = true; again.hidden = false; conf.hidden = true;
      if (opts) {
        var lis = $$('li', opts), right = lis.filter(function (li) { return li.hasAttribute('data-correct'); })[0];
        lis.forEach(function (li, j) {
          var r = li.querySelector('input'); if (r) { r.checked = String(j) === String(v); r.disabled = true; }
          li.classList.toggle('right', li === right); li.classList.toggle('wrong', String(j) === String(v) && li !== right);
        });
        verdict.className = 'tl-predict-verdict ' + (ok ? 'close' : 'far');
        verdict.textContent = ok ? '✓ Right. Now check it below.' : '✗ Not quite. The right answer is marked in green.';
      } else {
        var ans = parseFloat(box.getAttribute('data-answer')), g = parseFloat(v);
        input.value = v; input.disabled = true;
        verdict.className = 'tl-predict-verdict ' + (ok ? 'close' : 'far');
        verdict.textContent = (ok ? '✓ Close. ' : 'You guessed ' + g + unit + '. ') + 'The answer is ' + box.getAttribute('data-answer') + unit + '.' + (ok ? '' : ' Off by ' + +Math.abs(g - ans).toFixed(4) + unit + '.');
      }
      if (rec && typeof rec === 'object' && rec.c) verdict.textContent += ' You were ' + rec.c + '% sure.';
      typeset(reveal);
    }
    lock.addEventListener('click', function () {
      var v = opts ? picked() : (input.value.trim() === '' ? null : input.value.trim());
      if (v == null || (!opts && !isFinite(parseFloat(v)))) { verdict.className = 'tl-predict-verdict far'; verdict.textContent = opts ? 'Pick one first.' : 'Type a number first. A rough guess is the point.'; return; }
      var rec = { v: v, c: +conf.sel.value, ok: judge(v), at: Date.now() };
      remember('p', idx, rec, store); settle(rec);
    });
    again.addEventListener('click', function () {
      remember('p', idx, null, store); box.classList.remove('locked'); lock.hidden = false; again.hidden = true; conf.hidden = false; verdict.textContent = ''; verdict.className = 'tl-predict-verdict';
      if (input) { input.disabled = false; input.value = ''; input.focus(); }
      if (opts) $$('li', opts).forEach(function (li) { li.classList.remove('right', 'wrong'); var r = li.querySelector('input'); if (r) { r.disabled = false; r.checked = false; } });
    });
    var prev = recalled('p', idx, store); if (prev != null) settle(prev);
  }
  $$('.tl-predict').forEach(function (box, idx) { initPredict(box, idx); });

  // ── Scenario drill ────────────────────────────────────────────────────────────
  // store/idx let practice.html run a lesson's drill and record it under that lesson.
  function initDrill(box, idx, store, onDone) {
    var list = box.querySelector('.tl-drill-options'); if (!list) return;
    store = store || slug;
    box.classList.add('js');
    var lis = $$(':scope > li', list), name = 'tld-' + store + '-' + idx;
    lis.forEach(function (li, j) {
      var why = li.querySelector('.tl-drill-why'), lab = el('label'), r = el('input');
      r.type = 'radio'; r.name = name; r.value = String(j);
      Array.prototype.slice.call(li.childNodes).forEach(function (n) { if (n !== why) lab.appendChild(n); });
      lab.insertBefore(r, lab.firstChild); li.insertBefore(lab, why || null);
    });
    var bar = el('div', 'tl-btnrow'), conf = confPicker(), commit = btn('Commit to this call', 'active'), reset = btn('Try the drill again'), note = el('span', 'tl-hint', 'Decide before you look. The outcome stays hidden until you commit.');
    reset.hidden = true; commit.disabled = true;
    bar.appendChild(conf); bar.appendChild(commit); bar.appendChild(reset); bar.appendChild(note);
    list.parentNode.insertBefore(bar, list.nextSibling);
    list.addEventListener('change', function () { commit.disabled = false; });
    function settle(rec) {
      var v = val(rec);
      box.classList.add('done'); commit.hidden = true; reset.hidden = false; conf.hidden = true;
      lis.forEach(function (li, j) { var r = li.querySelector('input'); if (r) { r.checked = String(j) === String(v); r.disabled = true; } li.classList.toggle('picked', String(j) === String(v)); });
      var c = lis[+v], verdict = c ? c.getAttribute('data-verdict') : '';
      note.textContent = (verdict === 'good' ? 'You picked the best call. Read why the others cost money.' : verdict === 'ok' ? 'Defensible, but there was a better call. Compare the reasons.' : 'That one would have cost you. Read the reasons, then try again later.') + (rec && rec.c ? ' You were ' + rec.c + '% sure.' : '');
      typeset(box);
      if (onDone) onDone(verdict);
    }
    commit.addEventListener('click', function () {
      var r = box.querySelector('input[name="' + name + '"]:checked'); if (!r) return;
      var c = lis[+r.value], rec = { v: r.value, c: +conf.sel.value, ok: !!c && c.getAttribute('data-verdict') === 'good', at: Date.now() };
      remember('d', idx, rec, store); settle(rec);
    });
    reset.addEventListener('click', function () {
      remember('d', idx, null, store); box.classList.remove('done'); commit.hidden = false; commit.disabled = true; reset.hidden = true; conf.hidden = false;
      note.textContent = 'Decide before you look. The outcome stays hidden until you commit.';
      lis.forEach(function (li) { li.classList.remove('picked'); var r = li.querySelector('input'); if (r) { r.disabled = false; r.checked = false; } });
    });
    var prev = recalled('d', idx, store); if (prev != null && lis[+val(prev)]) settle(prev);
  }
  $$('.tl-drill').forEach(function (box, idx) { initDrill(box, idx); });

  // ── Faded worked example: the same calculation again, with more of it left to you ─
  // <div class="tl-fade"> … <div class="tl-fade-round"> … <span class="tl-blank" data-answer="0.1" data-tol="0.001" data-unit="%"></span> … </div> …
  $$('.tl-fade').forEach(function (box) {
    box.classList.add('js');
    $$('.tl-fade-round', box).forEach(function (round) {
      var blanks = $$('.tl-blank', round); if (!blanks.length) return;
      blanks.forEach(function (b) {
        var i = el('input', 'tl-scratch-input tl-blank-input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal';
        i.setAttribute('aria-label', 'Fill in the value'); b.textContent = ''; b.appendChild(i);
        var u = (b.getAttribute('data-unit') || '').trim(); if (u) b.appendChild(document.createTextNode(' ' + u));
      });
      var bar = el('div', 'tl-btnrow'), check = btn('Check my numbers', 'active'), show = btn('Show the answers'), msg = el('span', 'tl-hint');
      bar.appendChild(check); bar.appendChild(show); bar.appendChild(msg); round.appendChild(bar);
      check.addEventListener('click', function () {
        var right = 0;
        blanks.forEach(function (b) {
          var i = b.querySelector('input'), ans = parseFloat(b.getAttribute('data-answer')), tol = parseFloat(b.getAttribute('data-tol')) || 0, g = parseFloat(i.value);
          var ok = isFinite(g) && Math.abs(g - ans) <= tol; b.classList.toggle('right', ok); b.classList.toggle('wrong', !ok); if (ok) right++;
        });
        msg.textContent = right === blanks.length ? '✓ All ' + right + ' right. On to the next round.' : right + ' of ' + blanks.length + ' right. Rework the red ones from the step before.';
      });
      show.addEventListener('click', function () {
        blanks.forEach(function (b) { var i = b.querySelector('input'); i.value = b.getAttribute('data-answer'); b.classList.remove('wrong'); b.classList.add('shown'); });
        msg.textContent = 'Answers filled in. Try the next round without peeking.';
      });
    });
  });

  // ── In your own words (read/write) ────────────────────────────────────────────
  (function () {
    var intu = document.querySelector('#page .tl-box.intuition'); if (!intu || document.querySelector('.tl-ownwords')) return;
    var NK = 'theoryLabNotes', box = el('div', 'tl-ownwords');
    box.innerHTML = '<div class="tl-ownwords-label">✍ In your own words</div><p class="tl-ownwords-q">Explain the idea above in two or three sentences, as if to a colleague. No symbols. Writing it is what makes it yours.</p>';
    var ta = el('textarea', 'tl-scratch-input tl-ownwords-text'); ta.rows = 3; ta.setAttribute('aria-label', 'Your explanation');
    var note = el('div', 'tl-hint', 'Saved in this browser.');
    function all() { try { return JSON.parse(localStorage.getItem(NK) || '{}') || {}; } catch (e) { return {}; } }
    ta.value = (all()[slug] || {}).own || '';
    ta.addEventListener('input', function () { var a = all(); a[slug] = a[slug] || {}; a[slug].own = ta.value; a[slug].at = Date.now(); try { localStorage.setItem(NK, JSON.stringify(a)); } catch (e) {} note.textContent = 'Saved. Compare it with the TL;DR at the top when you have finished the lesson.'; });
    box.appendChild(ta); box.appendChild(note);
    intu.parentNode.insertBefore(box, intu.nextSibling);
  })();

  // ── Self-test: answer first, then grade yourself ──────────────────────────────
  // theoryLabQuiz[slug][i] = { g: 1 | 0.5 | 0, a: typed answer, at }. A lesson counts as mastered at 70%+.
  var QK = 'theoryLabQuiz';
  function quizAll() { try { return JSON.parse(localStorage.getItem(QK) || '{}') || {}; } catch (e) { return {}; } }
  (function () {
    var quiz = $$('#page details.tl-quiz'); if (!quiz.length) return;
    var score = el('div', 'tl-quiz-score'); score.id = 'tl-selftest'; quiz[0].parentNode.insertBefore(score, quiz[0]);
    function paint() {
      var mine = quizAll()[slug] || {}, got = 0, n = 0;
      quiz.forEach(function (d, i) { var r = mine[i]; if (r) { n++; got += r.g; } });
      var pct = quiz.length ? got / quiz.length : 0;
      score.className = 'tl-quiz-score' + (pct >= 0.7 ? ' mastered' : '');
      score.innerHTML = n ? 'Your self-test: <b>' + got + ' / ' + quiz.length + '</b>' + (pct >= 0.7 ? ' · ✓ mastered' : n < quiz.length ? ' · ' + (quiz.length - n) + ' still to try' : ' · go back over the ones you missed, then try again') : 'Type an answer to each question before you open it, then grade yourself. 70% or more marks the lesson as mastered.';
    }
    quiz.forEach(function (d, i) {
      var sum = d.querySelector('summary'), ans = d.querySelector('.tl-answer'); if (!sum || !ans) return;
      var mine = (quizAll()[slug] || {})[i];
      var tryBox = el('div', 'tl-quiz-try'), ta = el('textarea', 'tl-scratch-input'); ta.rows = 2; ta.placeholder = 'Your answer first. One line is enough.'; ta.setAttribute('aria-label', 'Your answer to question ' + (i + 1));
      if (mine && mine.a) ta.value = mine.a;
      tryBox.appendChild(ta); d.parentNode.insertBefore(tryBox, d);
      var allowed = !!mine;
      sum.addEventListener('click', function (e) {
        if (d.open || allowed || ta.value.trim()) { allowed = true; return; }
        e.preventDefault(); ta.focus(); ta.placeholder = 'Have a go first, even a guess. Or click the question again to reveal anyway.'; allowed = true;
      });
      var g = el('div', 'tl-btnrow tl-quiz-grade'), lab = el('span', 'tl-hint', 'How did you do?');
      g.appendChild(lab);
      [['✓ Got it', 1], ['~ Partly', 0.5], ['✗ Missed it', 0]].forEach(function (x) {
        var b = btn(x[0]); b.setAttribute('data-g', x[1]);
        b.addEventListener('click', function () {
          var all = quizAll(); all[slug] = all[slug] || {}; all[slug][i] = { g: x[1], a: ta.value.trim(), at: Date.now() };
          try { localStorage.setItem(QK, JSON.stringify(all)); } catch (e2) {}
          $$('button', g).forEach(function (o) { o.classList.toggle('active', o === b); }); paint();
        });
        if (mine && mine.g === x[1]) b.classList.add('active');
        g.appendChild(b);
      });
      ans.appendChild(g);
    });
    paint();
  })();

  // ── Flashcards: questions and takeaways as an Anki-ready file ────────────────
  // Anki imports tab-separated text and renders \( … \) maths itself, so the TeX stays as written.
  function cardHTML(node) {
    var c = node.cloneNode(true);
    $$('script,style,svg,button,.tl-quiz-grade,.tl-eli5', c).forEach(function (n) { n.remove(); });
    return c.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/\t/g, ' ').trim();
  }
  function cardsFromDoc(doc, title) {
    var rows = [], tag = (title || '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60);
    $$('details.tl-quiz', doc).forEach(function (d) {
      var s = d.querySelector('summary'), a = d.querySelector('.tl-answer'); if (!s || !a) return;
      rows.push([cardHTML(s).replace(/^Q\d+\.\s*/, ''), cardHTML(a), tag]);
    });
    $$('.tl-takeaway', doc).forEach(function (t) {
      var b = t.querySelector('strong'); if (!b) return;
      var rest = t.cloneNode(true), bb = rest.querySelector('strong'); if (bb) bb.remove();
      $$('.tl-takeaway-icon', rest).forEach(function (n) { n.remove(); });
      rows.push(['Takeaway from ' + (title || 'this lesson') + ': ' + cardHTML(b).replace(/\.$/, '') + '. Why?', cardHTML(rest), tag]);
    });
    return rows;
  }
  function downloadTSV(rows, name) {
    var txt = '#separator:tab\n#html:true\n#tags column:3\n' + rows.map(function (r) { return r.join('\t'); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/tab-separated-values;charset=utf-8' }));
    a.download = name + '.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  (function () {
    var first = document.querySelector('#page details.tl-quiz'); if (!first) return;
    var h1 = document.querySelector('h1.tl-title'), title = h1 ? h1.textContent.trim() : slug;
    var b = btn('⬇ Flashcards for Anki'); b.title = 'Download this lesson’s self-test questions and takeaways as an Anki import file';
    b.addEventListener('click', function () { downloadTSV(cardsFromDoc(document, title), 'flashcards-' + slug); });
    var row = el('div', 'tl-btnrow tl-cards-row'); row.appendChild(b);
    var sc = document.querySelector('.tl-quiz-score'); (sc || first).parentNode.insertBefore(row, sc || first);
  })();

  // ── Print: open every fold, show every equation step ──────────────────────────
  var reopened = [];
  window.addEventListener('beforeprint', function () {
    reopened = $$('details:not([open])'); reopened.forEach(function (d) { d.open = true; });
    $$('.tl-eqbuild.js').forEach(function (b) { b.classList.add('all', 'print-all'); });
  });
  window.addEventListener('afterprint', function () {
    reopened.forEach(function (d) { d.open = false; }); reopened = [];
    $$('.tl-eqbuild.print-all').forEach(function (b) { b.classList.remove('all', 'print-all'); });
  });

  // ── Light or dark ─────────────────────────────────────────────────────────────
  (function () {
    var root = document.documentElement, TK = 'theoryLabTheme';
    var b = el('button', 'tl-theme-toggle'); b.type = 'button';
    function paint() { var light = root.getAttribute('data-theme') === 'light'; b.textContent = light ? '☾ Dark' : '☀ Light'; b.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme'); }
    b.addEventListener('click', function () {
      var light = root.getAttribute('data-theme') !== 'light';
      if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
      try { localStorage.setItem(TK, light ? 'light' : 'dark'); } catch (e) {}
      paint();
    });
    paint(); document.body.appendChild(b);
  })();

  window.TLVark = { initDrill: initDrill, initPredict: initPredict, cardsFromDoc: cardsFromDoc, downloadTSV: downloadTSV, quizAll: quizAll, store: load };

  // ── Listen: the two-voice spoken version ──────────────────────────────────────
  // Recorded voices when theory-lab/audio/manifest.json has a file whose hash matches this exact dialogue
  // (education/tools/build_audio.py, free local Kokoro voices); the browser's own voices otherwise.
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  $$('.tl-listen').forEach(function (box) {
    var lines = $$('.tl-listen-script p', box); if (!lines.length) return;
    // captured now, before MathJax can rewrite any \( … \) into markup
    var said = lines.map(function (p) { return S.textToSpeechFriendly(p.textContent || ''); });
    var raw = lines.map(function (p) { return (p.getAttribute('data-who') || '') + ': ' + (p.textContent || '').replace(/\s+/g, ' ').trim(); }).join('\n');
    var who = []; lines.forEach(function (p) { var w = p.getAttribute('data-who') || ''; if (who.indexOf(w) < 0) who.push(w); });
    box.classList.add('js');
    var bar = el('div', 'tl-listen-bar'), play = btn('▶ Play', 'active'), stop = btn('⏹ Stop'), tx = btn('Show transcript'), status = el('span', 'tl-listen-status');
    stop.hidden = true;
    if (synth) { bar.appendChild(play); bar.appendChild(stop); }
    bar.appendChild(tx); bar.appendChild(status);
    var script = box.querySelector('.tl-listen-script'); box.insertBefore(bar, script);
    var mins = box.getAttribute('data-minutes');
    status.textContent = synth ? lines.length + ' lines' + (mins ? ' · about ' + mins + ' min' : '') : 'Speech is not available in this browser: read the transcript.';
    if (!synth) { box.classList.add('show'); tx.textContent = 'Hide transcript'; }
    tx.addEventListener('click', function () { var on = !box.classList.contains('show'); box.classList.toggle('show', on); tx.textContent = on ? 'Hide transcript' : 'Show transcript'; });
    var state = 'idle', current = null, rec = null;   // rec = { audio, starts } when a recording is in use
    function mark(i) { if (current === lines[i]) return; if (current) current.classList.remove('speaking'); current = lines[i]; current.classList.add('speaking'); status.textContent = 'Line ' + (i + 1) + ' of ' + lines.length + ' · ' + (lines[i].getAttribute('data-who') || ''); }
    function done() { state = 'idle'; play.textContent = '▶ Play'; stop.hidden = true; if (current) current.classList.remove('speaking'); current = null; status.textContent = 'Finished. Play again any time.'; }
    function speakAll() {
      hush();
      var sp = speakerVoices(), last = lines.length - 1;
      // every utterance is queued now, inside the click, so no engine drops a later one
      said.forEach(function (text, i) {
        var voice = sp[Math.max(0, who.indexOf(lines[i].getAttribute('data-who') || '')) % 2];
        var parts = S.splitForSpeech(text);
        parts.forEach(function (part, j) {
          synth.speak(utter(part, voice, j === 0 ? function () { mark(i); } : null, i === last && j === parts.length - 1 ? done : null));
        });
      });
    }
    play.addEventListener('click', function () {
      if (rec) {
        if (state === 'playing') { rec.audio.pause(); state = 'paused'; play.textContent = '▶ Resume'; return; }
        hush(); rec.audio.playbackRate = rate();
        var pr = rec.audio.play(); if (pr && pr.catch) pr.catch(function () { status.textContent = 'Could not play the recording. Try again, or use the browser voices.'; });
      } else {
        if (state === 'playing') { synth.pause(); state = 'paused'; play.textContent = '▶ Resume'; return; }
        if (state === 'paused') { synth.resume(); state = 'playing'; play.textContent = '⏸ Pause'; return; }
        speakAll();
      }
      state = 'playing'; play.textContent = '⏸ Pause'; stop.hidden = false;
      if (!box.classList.contains('show')) tx.click();
    });
    stop.addEventListener('click', function () {
      if (rec) { rec.audio.pause(); rec.audio.currentTime = 0; } else hush();
      done(); status.textContent = 'Stopped.';
    });
    // Look for a recording of exactly this dialogue.
    if (!window.fetch || location.protocol === 'file:') return;
    var me = document.querySelector('script[src*="vark.js"]');
    var base = new URL('../audio/', me ? me.src : location.href).href;
    fetch(base + 'manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (man) {
      var m = man && man[slug]; if (!m || m.hash !== fnv1a(raw)) return;
      var audio = new Audio(); audio.preload = 'none'; audio.src = base + slug + '.m4a';
      rec = { audio: audio, starts: m.starts || [] };
      if (!synth) { bar.insertBefore(play, tx); bar.insertBefore(stop, tx); }
      audio.addEventListener('timeupdate', function () {
        var t = audio.currentTime, i = 0; while (i + 1 < rec.starts.length && rec.starts[i + 1] <= t) i++; mark(i);
      });
      audio.addEventListener('ended', done);
      var dl = el('a', 'tl-btn', '⬇ Download'); dl.href = audio.src; dl.setAttribute('download', slug + '.m4a');
      var swap = btn('Use browser voices');
      swap.addEventListener('click', function () {
        if (rec) { audio.pause(); done(); rec = null; swap.textContent = 'Use recorded voices'; status.textContent = 'Browser voices.'; if (!synth) { play.hidden = stop.hidden = true; } }
        else { rec = { audio: audio, starts: m.starts || [] }; swap.textContent = 'Use browser voices'; status.textContent = 'Recorded voices · ' + Math.round(m.seconds / 60) + ' min'; play.hidden = false; }
      });
      bar.appendChild(dl); if (synth) bar.appendChild(swap);
      status.textContent = 'Recorded voices · ' + Math.max(1, Math.round(m.seconds / 60)) + ' min';
    }).catch(function () { /* no recordings here: browser voices */ });
  });

  // ── Quiz me aloud ─────────────────────────────────────────────────────────────
  (function () {
    var quiz = $$('details.tl-quiz', page); if (!quiz.length || !synth) return;
    var items = quiz.map(function (d) {
      var s = d.querySelector('summary'), a = d.querySelector('.tl-answer');
      return { d: d, q: S.textToSpeechFriendly((s ? s.textContent : '').replace(/^\s*Q\d+\.\s*/, '')), a: S.textToSpeechFriendly(a ? a.textContent : '') };
    }).filter(function (x) { return x.q && x.a; });
    if (!items.length) return;
    var box = el('div', 'tl-quizaloud');
    var bar = el('div', 'tl-btnrow'), go = btn('🎧 Quiz me aloud', 'active'), reveal = btn('Reveal now'), next = btn('Next question ▶', 'active'), end = btn('Stop');
    var think = el('select', 'tl-listen-select'); think.setAttribute('aria-label', 'Thinking time');
    [5, 10, 20, 30].forEach(function (n) { var o = el('option', null, n + 's to think'); o.value = n; if (n === 10) o.selected = true; think.appendChild(o); });
    var qline = el('div', 'tl-quizaloud-q'), timer = el('span', 'tl-quizaloud-timer'), hint = el('span', 'tl-hint', 'Hear each question, answer it out loud, then hear the model answer. Good for a walk.');
    [go, think, reveal, next, end, timer].forEach(function (b) { bar.appendChild(b); });
    reveal.hidden = next.hidden = end.hidden = true;
    box.appendChild(bar); box.appendChild(qline); box.appendChild(hint);
    var anchor = document.querySelector('.tl-quiz-score') || quiz[0]; anchor.parentNode.insertBefore(box, anchor);
    var i = -1, tick = null;
    function clear() { if (tick) clearInterval(tick); tick = null; timer.textContent = ''; }
    function answer() {
      clear(); reveal.hidden = true; var it = items[i]; it.d.open = true;
      hush();
      // short utterances, all queued at once: long ones stall on some engines
      var parts = S.splitForSpeech('Answer. ' + it.a);
      parts.forEach(function (part, j) {
        synth.speak(utter(part, null, null, j < parts.length - 1 ? null : function () {
          if (i < items.length - 1) next.hidden = false; else { qline.textContent = 'That was the last question. Well done.'; next.hidden = true; }
        }));
      });
    }
    function ask(k) {
      i = k; var it = items[i]; clear(); hush();
      go.hidden = true; end.hidden = false; next.hidden = true; reveal.hidden = false;
      qline.textContent = 'Question ' + (i + 1) + ' of ' + items.length + ': ' + it.q;
      it.d.open = false; it.d.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var parts = S.splitForSpeech('Question ' + (i + 1) + '. ' + it.q);
      parts.forEach(function (part, j) {
        synth.speak(utter(part, null, null, j < parts.length - 1 ? null : function () {
          var left = parseInt(think.value, 10) || 10; timer.textContent = left + 's';
          tick = setInterval(function () { left--; timer.textContent = left + 's'; if (left <= 0) answer(); }, 1000);
        }));
      });
    }
    go.addEventListener('click', function () { ask(0); });
    next.addEventListener('click', function () { ask(i + 1); });
    reveal.addEventListener('click', answer);
    end.addEventListener('click', function () { clear(); hush(); go.hidden = false; reveal.hidden = next.hidden = end.hidden = true; qline.textContent = ''; i = -1; });
  })();
})();
