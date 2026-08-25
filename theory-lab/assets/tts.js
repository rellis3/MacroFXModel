/* Theory Lab — "Listen to this lesson" reader.
   Uses the browser's built-in SpeechSynthesis API only — no external
   service, no account, no AI model. Purely additive: does nothing until
   the reader button is clicked, and never changes what's on the page. */
(function () {
  'use strict';

  var toggleBtn = document.getElementById('tts-toggle');
  var page = document.getElementById('page');
  if (!toggleBtn || !page) return;

  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    toggleBtn.hidden = true;
    return;
  }

  var synth = window.speechSynthesis;
  var RATE_KEY = 'theoryLabTTSRate';
  var VOICE_KEY = 'theoryLabTTSVoiceName';

  // ---------- LaTeX -> speakable text ----------
  var GREEK = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', Gamma: 'gamma',
    delta: 'delta', Delta: 'delta', epsilon: 'epsilon', varepsilon: 'epsilon',
    zeta: 'zeta', eta: 'eta', theta: 'theta', Theta: 'theta', vartheta: 'theta',
    iota: 'iota', kappa: 'kappa', lambda: 'lambda', Lambda: 'lambda',
    mu: 'mu', nu: 'nu', xi: 'xi', Xi: 'xi', pi: 'pi', Pi: 'pi',
    rho: 'rho', varrho: 'rho', sigma: 'sigma', Sigma: 'sigma',
    tau: 'tau', upsilon: 'upsilon', phi: 'phi', Phi: 'phi', varphi: 'phi',
    chi: 'chi', psi: 'psi', Psi: 'psi', omega: 'omega', Omega: 'omega'
  };
  var WORDS = {
    sum: 'sum of', prod: 'product of', int: 'integral of', oint: 'contour integral of',
    infty: 'infinity', times: 'times', cdot: 'times', div: 'divided by',
    leq: 'less than or equal to', le: 'less than or equal to',
    geq: 'greater than or equal to', ge: 'greater than or equal to',
    neq: 'not equal to', ne: 'not equal to', approx: 'approximately',
    equiv: 'is equivalent to', propto: 'proportional to',
    rightarrow: 'to', to: 'to', Rightarrow: 'implies', leftarrow: 'from',
    Leftrightarrow: 'if and only if', iff: 'if and only if',
    in: 'in', notin: 'not in', forall: 'for all', exists: 'there exists',
    partial: 'partial', nabla: 'gradient of', sim: 'distributed as',
    hat: '', bar: '', tilde: '', vec: '', dot: '', ddot: '',
    pm: 'plus or minus', mp: 'minus or plus', mid: 'given', perp: 'perpendicular to',
    cup: 'union', cap: 'intersection', subset: 'subset of', subseteq: 'subset of or equal to',
    emptyset: 'the empty set', varnothing: 'the empty set',
    top: '', bot: '', dagger: '', star: 'star', ast: 'star',
    quad: ' ', qquad: ' ', text: '', mathrm: '', mathbf: '', mathbb: '', mathcal: '', boldsymbol: '', operatorname: ''
  };

  function latexToSpeech(tex) {
    var s = tex;
    s = s.replace(/\\text\{([^}]*)\}/g, ' $1 ');
    s = s.replace(/\\(?:mathrm|mathbf|mathbb|mathcal|boldsymbol|operatorname)\{([^}]*)\}/g, ' $1 ');
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, ' $1 over $2 ');
    s = s.replace(/\\sqrt\{([^}]*)\}/g, ' square root of $1 ');
    s = s.replace(/\\sqrt/g, ' square root of ');
    s = s.replace(/\\left|\\right/g, '');
    s = s.replace(/\\[,;!:]/g, ' ');
    s = s.replace(/\\\\/g, '. ');
    s = s.replace(/\\([a-zA-Z]+)/g, function (m, name) {
      if (GREEK.hasOwnProperty(name)) return ' ' + GREEK[name] + ' ';
      if (WORDS.hasOwnProperty(name)) return WORDS[name] ? ' ' + WORDS[name] + ' ' : ' ';
      return ' ';
    });
    s = s.replace(/\^\{([^}]*)\}/g, ' to the power of $1 ');
    s = s.replace(/\^([a-zA-Z0-9])/g, ' to the power of $1 ');
    s = s.replace(/_\{([^}]*)\}/g, ' sub $1 ');
    s = s.replace(/_([a-zA-Z0-9])/g, ' sub $1 ');
    s = s.replace(/[{}]/g, ' ');
    s = s.replace(/[\\^_]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function textToSpeechFriendly(raw) {
    var s = raw;
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, function (_, inner) { return ' ' + latexToSpeech(inner) + ' '; });
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, function (_, inner) { return ' ' + latexToSpeech(inner) + ' '; });
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, function (_, inner) { return ' ' + latexToSpeech(inner) + ' '; });
    s = s.replace(/\$([^$]*?)\$/g, function (_, inner) { return ' ' + latexToSpeech(inner) + ' '; });
    return s.replace(/\s+/g, ' ').trim();
  }

  // Keeping each utterance short is what actually protects every engine —
  // known stall bugs (a long utterance silently cutting off partway
  // through) only bite past a certain duration, and a short one simply
  // finishes and hands off to the next before that can trigger. A dense
  // lesson paragraph easily runs 30+ seconds as one utterance, so split on
  // sentence boundaries (falling back to a hard
  // word-boundary cut for any one "sentence" that's still too long).
  var MAX_UTTERANCE_CHARS = 110;
  function splitForSpeech(text) {
    if (text.length <= MAX_UTTERANCE_CHARS) return [text];
    // No lookbehind (unsupported in older Safari) — split on the
    // punctuation via a capturing group, then re-glue each piece with the
    // punctuation that ended it.
    var pieces = text.split(/([.!?])\s+(?=[A-Z(])/);
    var sentences = [];
    for (var i = 0; i < pieces.length; i += 2) {
      var s = (pieces[i] || '') + (pieces[i + 1] || '');
      s = s.trim();
      if (s) sentences.push(s);
    }
    if (!sentences.length) sentences = [text];
    var out = [];
    sentences.forEach(function (sentence) {
      while (sentence.length > MAX_UTTERANCE_CHARS) {
        var cut = sentence.lastIndexOf(' ', MAX_UTTERANCE_CHARS);
        if (cut < 40) cut = MAX_UTTERANCE_CHARS;
        out.push(sentence.slice(0, cut).trim());
        sentence = sentence.slice(cut).trim();
      }
      if (sentence) out.push(sentence);
    });
    return out;
  }

  // ---------- Build the reading queue ----------
  var CHUNK_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote', 'figcaption', 'summary',
    '.tl-box-label', '.tl-tldr-label', '.tl-chart-label', '.tl-chart-caption', '.tl-takeaway'
  ].join(',');
  var EXCLUDE_SELECTOR = [
    '.tl-crumb', '.tl-glosslink', '.tl-kicker', '.tl-meta', '.tl-eli5',
    '.tl-eli5-toggle', '.tl-tts-toggle', '.tl-tts-bar', '.tl-footer-nav',
    '.tl-symbols', '.tl-quiz', 'svg', 'script', 'style'
  ].join(',');

  function buildQueue() {
    var raw = Array.prototype.slice.call(page.querySelectorAll(CHUNK_SELECTOR));
    var kept = raw.filter(function (el) {
      if (el.closest(EXCLUDE_SELECTOR)) return false;
      var anc = el.parentElement;
      while (anc && anc !== page) {
        if (raw.indexOf(anc) !== -1 && !anc.closest(EXCLUDE_SELECTOR)) return false;
        anc = anc.parentElement;
      }
      return true;
    });
    var queue = [];
    kept.forEach(function (el) {
      var text = textToSpeechFriendly(el.textContent || '');
      if (text.length < 2) return;
      splitForSpeech(text).forEach(function (part) { queue.push({ el: el, text: part }); });
    });
    return queue;
  }

  // Built eagerly, right now, rather than lazily on first click. This
  // script runs as a deferred script, so it executes synchronously right
  // before DOMContentLoaded — before the page's async MathJax bundle can
  // possibly finish loading and re-render \(...\) source into styled
  // spans. Waiting until the user clicks "Listen" would usually run after
  // MathJax has already typeset the page, silently losing the raw LaTeX
  // source (e.g. "x^2" becoming plain "x2" with no exponent to convert).
  var queue = buildQueue();

  // ---------- Playback state ----------
  var bar, playBtn, prevBtn, nextBtn, closeBtn, rateSelect, voiceSelect, progressLabel, progressFill;
  var idx = -1;
  var isPlaying = false;
  var lastHighlighted = null;
  var currentVoice = null;
  var currentRate = 1;

  // Canceling can fire a still-pending utterance's onend/onerror
  // synchronously in some browsers. Without a generation guard, a stale
  // callback from a batch that's since been superseded (a skip, a
  // rate/voice change) could still fire stopReader() after the fact.
  // Bumping this token before every queueBatch()/cancel() makes any
  // leftover callback from a superseded batch a no-op.
  var utterToken = 0;
  function invalidateUtterance() { utterToken++; }

  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'tl-tts-bar';
    bar.innerHTML =
      '<div class="tl-tts-bar-inner">' +
      '<button type="button" class="tl-tts-btn" data-act="prev" title="Previous paragraph" aria-label="Previous paragraph">⏮</button>' +
      '<button type="button" class="tl-tts-btn tl-tts-play" data-act="play" title="Play" aria-label="Play">▶</button>' +
      '<button type="button" class="tl-tts-btn" data-act="next" title="Next paragraph" aria-label="Next paragraph">⏭</button>' +
      '<div class="tl-tts-progress">' +
      '<span class="tl-tts-progress-label" data-role="label">Ready to read this lesson aloud</span>' +
      '<div class="tl-tts-progress-track"><div class="tl-tts-progress-fill" data-role="fill"></div></div>' +
      '</div>' +
      '<select class="tl-tts-select" data-role="rate" title="Playback speed" aria-label="Playback speed">' +
      '<option value="0.75">0.75×</option><option value="1" selected>1×</option>' +
      '<option value="1.25">1.25×</option><option value="1.5">1.5×</option>' +
      '<option value="1.75">1.75×</option><option value="2">2×</option>' +
      '</select>' +
      '<select class="tl-tts-select" data-role="voice" title="Voice" aria-label="Voice"></select>' +
      '<button type="button" class="tl-tts-close" data-act="close" title="Close reader" aria-label="Close reader">×</button>' +
      '</div>';
    document.body.appendChild(bar);

    playBtn = bar.querySelector('[data-act="play"]');
    prevBtn = bar.querySelector('[data-act="prev"]');
    nextBtn = bar.querySelector('[data-act="next"]');
    closeBtn = bar.querySelector('[data-act="close"]');
    rateSelect = bar.querySelector('[data-role="rate"]');
    voiceSelect = bar.querySelector('[data-role="voice"]');
    progressLabel = bar.querySelector('[data-role="label"]');
    progressFill = bar.querySelector('[data-role="fill"]');

    playBtn.addEventListener('click', function () { isPlaying ? pause() : play(); });
    prevBtn.addEventListener('click', function () { skip(-1); });
    nextBtn.addEventListener('click', function () { skip(1); });
    closeBtn.addEventListener('click', closeReader);

    rateSelect.addEventListener('change', function () {
      currentRate = parseFloat(rateSelect.value) || 1;
      try { localStorage.setItem(RATE_KEY, String(currentRate)); } catch (e) {}
      if (isPlaying) queueBatch(idx);
    });
    voiceSelect.addEventListener('change', function () {
      var voices = synth.getVoices();
      currentVoice = voices[parseInt(voiceSelect.value, 10)] || null;
      try { localStorage.setItem(VOICE_KEY, currentVoice ? currentVoice.name : ''); } catch (e) {}
      if (isPlaying) queueBatch(idx);
      syncBarHeight();
    });

    var savedRate = null;
    try { savedRate = parseFloat(localStorage.getItem(RATE_KEY)); } catch (e) {}
    if (savedRate && !isNaN(savedRate)) {
      currentRate = savedRate;
      rateSelect.value = String(savedRate);
    }

    populateVoices();
    synth.addEventListener('voiceschanged', populateVoices);
  }

  function populateVoices() {
    if (!voiceSelect) return;
    var voices = synth.getVoices();
    if (!voices.length) return;
    var savedName = null;
    try { savedName = localStorage.getItem(VOICE_KEY); } catch (e) {}
    var sorted = voices.map(function (v, i) { return { v: v, i: i }; }).sort(function (a, b) {
      var aEn = /^en/i.test(a.v.lang) ? 0 : 1;
      var bEn = /^en/i.test(b.v.lang) ? 0 : 1;
      return aEn - bEn || a.v.name.localeCompare(b.v.name);
    });
    voiceSelect.innerHTML = '';
    sorted.forEach(function (entry) {
      var opt = document.createElement('option');
      opt.value = String(entry.i);
      opt.textContent = entry.v.name + ' (' + entry.v.lang + ')';
      voiceSelect.appendChild(opt);
    });
    var chosen = sorted[0];
    if (savedName) {
      var found = sorted.find(function (entry) { return entry.v.name === savedName; });
      if (found) chosen = found;
    }
    if (chosen) {
      voiceSelect.value = String(chosen.i);
      currentVoice = chosen.v;
    }
    syncBarHeight();
  }

  function updateProgress() {
    if (!queue.length) { progressLabel.textContent = 'No readable text found on this page'; return; }
    if (idx < 0) {
      progressLabel.textContent = 'Ready to read this lesson aloud — ' + queue.length + ' sections';
      progressFill.style.width = '0%';
      return;
    }
    progressLabel.textContent = 'Section ' + (idx + 1) + ' of ' + queue.length;
    progressFill.style.width = Math.round(((idx + 1) / queue.length) * 100) + '%';
  }

  function updatePlayBtn() {
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    playBtn.title = isPlaying ? 'Pause' : 'Play';
  }

  function highlight(el) {
    if (lastHighlighted) lastHighlighted.classList.remove('tl-tts-speaking');
    var details = el.closest('details');
    if (details && !details.open) details.open = true;
    el.classList.add('tl-tts-speaking');
    lastHighlighted = el;
    var rect = el.getBoundingClientRect();
    var inView = rect.top >= 80 && rect.bottom <= (window.innerHeight - 100);
    if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearHighlight() {
    if (lastHighlighted) lastHighlighted.classList.remove('tl-tts-speaking');
    lastHighlighted = null;
  }

  // A previous version of this reader periodically called pause()+resume()
  // as a "keep-alive" nudge, based on a documented desktop-Chrome bug where
  // very long utterances silently stall. That workaround was itself found
  // to be the actual cause of a real-world failure on Android — pause()/
  // resume() there goes through a completely different code path (Blink's
  // bridge to the OS-level TextToSpeech service, not desktop Chrome's own
  // engine) with its own, differently-documented quirks, and calling it
  // repeatedly was reliably killing playback a few seconds in, every time.
  // No such nudge is needed any more: splitForSpeech caps every utterance
  // at roughly a sentence (~110 chars, well under any known stall
  // threshold), and queueBatch's own internal browser queue doesn't depend
  // on timely callbacks to keep advancing. Removed rather than re-scoped a
  // fourth time — the risk of an undiscovered quirk on some other platform
  // now outweighs whatever this was still buying.

  // Every previous fix here (#1326, #1328, #1329) chained speak() calls
  // one at a time, each new call made from inside the PREVIOUS utterance's
  // async onend/onerror callback. That reactive chaining is the actual
  // problem: several engines — iOS Safari chief among them, in numerous
  // independent reports — only reliably honor speak() calls that are
  // synchronously traceable back to a real user gesture (the click that
  // opened the reader), and start silently dropping calls made later from
  // an async callback after just a couple of hops. No error, no onstart,
  // nothing — playback just goes dead a couple of utterances in, which
  // matches this bug's exact signature and explains why fixing cancel()
  // timing, keep-alive scoping, and utterance length never actually
  // resolved it: none of those touched the real cause.
  //
  // The fix is to stop manually chaining at all. SpeechSynthesis already
  // has its own internal queue — calling speak() many times back-to-back
  // enqueues each utterance, and the engine plays them in order on its
  // own without any JS involvement to advance between them. Queuing every
  // remaining utterance for the rest of the lesson synchronously, all
  // within the click/skip/rate-change handler's own call stack, means no
  // speak() call ever again originates from an async callback — sidestepping
  // this whole bug class rather than working around one symptom of it.
  function queueBatch(startIndex) {
    invalidateUtterance();
    var myToken = utterToken;
    if (synth.speaking || synth.pending) synth.cancel();
    if (startIndex < 0 || startIndex >= queue.length) { stopReader(); return; }
    idx = startIndex;
    highlight(queue[startIndex].el);
    updateProgress();
    var lastIndex = queue.length - 1;
    for (var i = startIndex; i <= lastIndex; i++) {
      (function (i) {
        var u = new SpeechSynthesisUtterance(queue[i].text);
        u.rate = currentRate;
        if (currentVoice) u.voice = currentVoice;
        // Progress/highlight tracks playback as the engine actually gets
        // to each item — more accurate than setting it up front, and if
        // one item's onstart happens not to fire, the engine's own queue
        // still moves on to the next utterance regardless (unlike the old
        // design, nothing here depends on this callback to keep playing).
        u.onstart = function () {
          if (myToken !== utterToken) return;
          idx = i;
          highlight(queue[i].el);
          updateProgress();
        };
        if (i === lastIndex) {
          u.onend = function () { if (myToken === utterToken) stopReader(); };
          u.onerror = function () { if (myToken === utterToken) stopReader(); };
        }
        synth.speak(u);
      })(i);
    }
  }

  function play() {
    if (!queue.length) { progressLabel.textContent = 'No readable text found on this page'; return; }
    isPlaying = true;
    updatePlayBtn();
    if (synth.paused && (synth.speaking || synth.pending)) { synth.resume(); return; }
    queueBatch(idx < 0 ? 0 : idx);
  }

  function pause() {
    isPlaying = false;
    updatePlayBtn();
    synth.pause();
  }

  function stopReader() {
    isPlaying = false;
    idx = -1;
    updatePlayBtn();
    invalidateUtterance();
    synth.cancel();
    clearHighlight();
    updateProgress();
  }

  function skip(delta) {
    if (!queue.length) return;
    var next = Math.max(0, Math.min(queue.length - 1, (idx < 0 ? 0 : idx) + delta));
    if (isPlaying) { queueBatch(next); }
    else {
      invalidateUtterance();
      if (synth.speaking || synth.pending) synth.cancel();
      idx = next; highlight(queue[idx].el); updateProgress();
    }
  }

  // The bar's height varies with voice-name length and viewport width
  // (it wraps to more rows on narrow screens), so #page's bottom padding
  // tracks the bar's real measured height via a CSS custom property
  // rather than a guessed fixed value.
  function syncBarHeight() {
    if (!bar) return;
    document.body.style.setProperty('--tl-tts-bar-h', bar.getBoundingClientRect().height + 'px');
  }

  function openReader() {
    if (!bar) buildBar();
    bar.classList.add('open');
    document.body.classList.add('tl-tts-open');
    toggleBtn.classList.add('active');
    toggleBtn.textContent = '🔊 Reader open';
    syncBarHeight();
    updateProgress();
    play();
  }

  function closeReader() {
    stopReader();
    if (bar) bar.classList.remove('open');
    document.body.classList.remove('tl-tts-open');
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = '🔊 Listen to this lesson';
  }

  window.addEventListener('resize', function () {
    if (bar && bar.classList.contains('open')) syncBarHeight();
  });

  toggleBtn.addEventListener('click', function () {
    if (bar && bar.classList.contains('open')) closeReader();
    else openReader();
  });

  window.addEventListener('pagehide', function () { synth.cancel(); });
  window.addEventListener('beforeunload', function () { synth.cancel(); });
})();
