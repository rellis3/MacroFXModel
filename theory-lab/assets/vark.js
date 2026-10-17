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
  var slug = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '') || 'page';
  var KEY = 'theoryLabVark';
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(label, cls) { var b = el('button', 'tl-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; return b; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function remember(kind, i, v) {
    var all = load(); all[slug] = all[slug] || {}; all[slug][kind] = all[slug][kind] || {};
    if (v == null) delete all[slug][kind][i]; else all[slug][kind][i] = v;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private window: still works */ }
  }
  function recalled(kind, i) { var s = load()[slug]; return s && s[kind] ? s[kind][i] : undefined; }
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

  // ── Predict first ─────────────────────────────────────────────────────────────
  $$('.tl-predict').forEach(function (box, idx) {
    var reveal = box.querySelector('.tl-predict-reveal'); if (!reveal) return;
    box.classList.add('js');
    var opts = box.querySelector('.tl-predict-options');
    var form = el('div', 'tl-predict-form'), verdict = el('div', 'tl-predict-verdict'), input = null, lock = btn('Lock in my guess', 'active'), again = btn('Guess again');
    again.hidden = true;
    var name = 'tlp-' + idx;
    if (opts) {
      $$('li', opts).forEach(function (li, j) {
        var lab = el('label'), r = el('input'); r.type = 'radio'; r.name = name; r.value = String(j);
        while (li.firstChild) lab.appendChild(li.firstChild);
        lab.insertBefore(r, lab.firstChild); li.appendChild(lab);
      });
    } else {
      input = el('input', 'tl-scratch-input'); input.type = 'number'; input.step = 'any'; input.inputMode = 'decimal';
      input.placeholder = 'your guess' + (box.getAttribute('data-unit') ? ' (' + box.getAttribute('data-unit') + ')' : '');
      input.setAttribute('aria-label', 'Your guess');
      form.appendChild(input);
    }
    form.appendChild(lock); form.appendChild(again);
    box.insertBefore(form, reveal); box.insertBefore(verdict, reveal);
    function picked() { var r = box.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; }
    function settle(v) {
      var unit = box.getAttribute('data-unit') || '';
      box.classList.add('locked'); lock.hidden = true; again.hidden = false;
      if (opts) {
        var lis = $$('li', opts), right = lis.filter(function (li) { return li.hasAttribute('data-correct'); })[0];
        lis.forEach(function (li, j) {
          var r = li.querySelector('input'); if (r) { r.checked = String(j) === String(v); r.disabled = true; }
          li.classList.toggle('right', li === right); li.classList.toggle('wrong', String(j) === String(v) && li !== right);
        });
        var ok = right && String(lis.indexOf(right)) === String(v);
        verdict.className = 'tl-predict-verdict ' + (ok ? 'close' : 'far');
        verdict.textContent = ok ? '✓ Right. Now check it below.' : '✗ Not quite. The right answer is marked in green.';
      } else {
        var ans = parseFloat(box.getAttribute('data-answer')), tol = parseFloat(box.getAttribute('data-tol')) || 0, g = parseFloat(v);
        input.value = v; input.disabled = true;
        var close = isFinite(ans) && Math.abs(g - ans) <= tol;
        verdict.className = 'tl-predict-verdict ' + (close ? 'close' : 'far');
        verdict.textContent = (close ? '✓ Close. ' : 'You guessed ' + g + unit + '. ') + 'The answer is ' + box.getAttribute('data-answer') + unit + '.' + (close ? '' : ' Off by ' + +Math.abs(g - ans).toFixed(4) + unit + '.');
      }
      typeset(reveal);
    }
    lock.addEventListener('click', function () {
      var v = opts ? picked() : (input.value.trim() === '' ? null : input.value.trim());
      if (v == null || (!opts && !isFinite(parseFloat(v)))) { verdict.className = 'tl-predict-verdict far'; verdict.textContent = opts ? 'Pick one first.' : 'Type a number first. A rough guess is the point.'; return; }
      remember('p', idx, v); settle(v);
    });
    again.addEventListener('click', function () {
      remember('p', idx, null); box.classList.remove('locked'); lock.hidden = false; again.hidden = true; verdict.textContent = ''; verdict.className = 'tl-predict-verdict';
      if (input) { input.disabled = false; input.value = ''; input.focus(); }
      if (opts) $$('li', opts).forEach(function (li) { li.classList.remove('right', 'wrong'); var r = li.querySelector('input'); if (r) { r.disabled = false; r.checked = false; } });
    });
    var prev = recalled('p', idx); if (prev != null) settle(prev);
  });

  // ── Scenario drill ────────────────────────────────────────────────────────────
  $$('.tl-drill').forEach(function (box, idx) {
    var list = box.querySelector('.tl-drill-options'); if (!list) return;
    box.classList.add('js');
    var lis = $$(':scope > li', list), name = 'tld-' + idx;
    lis.forEach(function (li, j) {
      var why = li.querySelector('.tl-drill-why'), lab = el('label'), r = el('input');
      r.type = 'radio'; r.name = name; r.value = String(j);
      Array.prototype.slice.call(li.childNodes).forEach(function (n) { if (n !== why) lab.appendChild(n); });
      lab.insertBefore(r, lab.firstChild); li.insertBefore(lab, why || null);
    });
    var bar = el('div', 'tl-btnrow'), commit = btn('Commit to this call', 'active'), reset = btn('Try the drill again'), note = el('span', 'tl-hint', 'Decide before you look. The outcome stays hidden until you commit.');
    reset.hidden = true; commit.disabled = true;
    bar.appendChild(commit); bar.appendChild(reset); bar.appendChild(note);
    list.parentNode.insertBefore(bar, list.nextSibling);
    list.addEventListener('change', function () { commit.disabled = false; });
    function settle(v) {
      box.classList.add('done'); commit.hidden = true; reset.hidden = false;
      lis.forEach(function (li, j) { var r = li.querySelector('input'); if (r) { r.checked = String(j) === String(v); r.disabled = true; } li.classList.toggle('picked', String(j) === String(v)); });
      var c = lis[+v], verdict = c ? c.getAttribute('data-verdict') : '';
      note.textContent = verdict === 'good' ? 'You picked the best call. Read why the others cost money.' : verdict === 'ok' ? 'Defensible, but there was a better call. Compare the reasons.' : 'That one would have cost you. Read the reasons, then try again later.';
      typeset(box);
    }
    commit.addEventListener('click', function () { var r = box.querySelector('input[name="' + name + '"]:checked'); if (!r) return; remember('d', idx, r.value); settle(r.value); });
    reset.addEventListener('click', function () {
      remember('d', idx, null); box.classList.remove('done'); commit.hidden = false; commit.disabled = true; reset.hidden = true;
      note.textContent = 'Decide before you look. The outcome stays hidden until you commit.';
      lis.forEach(function (li) { li.classList.remove('picked'); var r = li.querySelector('input'); if (r) { r.disabled = false; r.checked = false; } });
    });
    var prev = recalled('d', idx); if (prev != null && lis[+prev]) settle(prev);
  });

  // ── Listen: the two-voice spoken version ──────────────────────────────────────
  $$('.tl-listen').forEach(function (box) {
    var lines = $$('.tl-listen-script p', box); if (!lines.length) return;
    // captured now, before MathJax can rewrite any \( … \) into markup
    var said = lines.map(function (p) { return S.textToSpeechFriendly(p.textContent || ''); });
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
    var state = 'idle', current = null;
    function mark(i) { if (current) current.classList.remove('speaking'); current = lines[i]; current.classList.add('speaking'); status.textContent = 'Line ' + (i + 1) + ' of ' + lines.length + ' · ' + (lines[i].getAttribute('data-who') || ''); }
    function done() { state = 'idle'; play.textContent = '▶ Play'; stop.hidden = true; if (current) current.classList.remove('speaking'); current = null; status.textContent = 'Finished. Play again any time.'; }
    play.addEventListener('click', function () {
      if (state === 'playing') { synth.pause(); state = 'paused'; play.textContent = '▶ Resume'; return; }
      if (state === 'paused') { synth.resume(); state = 'playing'; play.textContent = '⏸ Pause'; return; }
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
      state = 'playing'; play.textContent = '⏸ Pause'; stop.hidden = false;
      if (!box.classList.contains('show')) tx.click();
    });
    stop.addEventListener('click', function () { hush(); done(); status.textContent = 'Stopped.'; });
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
    quiz[0].parentNode.insertBefore(box, quiz[0]);
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
