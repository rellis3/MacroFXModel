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
  // Chrome's ~15s stall bug and Safari's separate pause()/resume()-restarts
  // bug (see startKeepAlive below) both only bite on long utterances, and
  // a short one simply finishes and hands off to the next before either
  // can trigger. A dense lesson paragraph easily runs 30+ seconds as one
  // utterance, so split on sentence boundaries (falling back to a hard
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
  var keepAliveTimer = null;
  // `window.chrome` is only ever set by an actual Chromium/Blink runtime
  // (V8 + the Chromium browser shell). Every iOS browser — including ones
  // branded Chrome or Edge — is required by Apple to render with WebKit
  // under the hood and does not set this, so this check reliably separates
  // "has Chrome's long-utterance stall bug" from "has WebKit's opposite
  // bug where pause()+resume() restarts the utterance from the start"
  // (a UA string check gets this wrong both ways: it misses Chromium
  // browsers with non-"Chrome/" UAs like Edge or Chrome-on-iOS, and it
  // can't distinguish real Chromium from an iOS browser merely branded
  // like one).
  var isChromiumEngine = typeof window.chrome !== 'undefined';

  // Canceling an utterance can fire its onend/onerror synchronously in some
  // browsers. Without a generation guard, that stale callback re-enters
  // speakChunk() and races the caller's own next speakChunk() call, which
  // can cascade through the whole queue in one tick. Bumping this token
  // before every cancel() makes any in-flight callback from the utterance
  // being canceled a no-op.
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
      if (isPlaying) restartCurrentChunk();
    });
    voiceSelect.addEventListener('change', function () {
      var voices = synth.getVoices();
      currentVoice = voices[parseInt(voiceSelect.value, 10)] || null;
      try { localStorage.setItem(VOICE_KEY, currentVoice ? currentVoice.name : ''); } catch (e) {}
      if (isPlaying) restartCurrentChunk();
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

  // Chromium/Blink engines silently stop a SpeechSynthesisUtterance
  // partway through if it runs past roughly 10-15 seconds; nudging with
  // pause()/resume() resets that internal timer. This is Chromium-only:
  // WebKit (Safari, and every iOS browser regardless of branding) has the
  // opposite bug where resume() after pause() restarts the utterance from
  // the beginning instead of continuing — running this workaround there
  // would make playback worse, not better. Splitting long paragraphs into
  // short utterances (see splitForSpeech above) is what protects WebKit,
  // since it has no equivalent safe keep-alive trick.
  function startKeepAlive() {
    stopKeepAlive();
    if (!isChromiumEngine) return;
    keepAliveTimer = setInterval(function () {
      if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
    }, 5000);
  }
  function stopKeepAlive() {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  }

  function speakChunk(i) {
    if (i < 0 || i >= queue.length) { stopReader(); return; }
    idx = i;
    highlight(queue[i].el);
    updateProgress();
    invalidateUtterance();
    var myToken = utterToken;
    // Only cancel when something is actually in flight (a skip, a
    // rate/voice change mid-utterance, or the very first play() call
    // landing on a non-idle engine). The normal case — advancing to the
    // next chunk after the previous one's onend already fired — has
    // nothing to cancel. Calling cancel() unconditionally before every
    // single speak(), several times a second once utterances are this
    // short, is a documented way to get both Chromium and WebKit's
    // speechSynthesis to quietly stop responding to speak() altogether
    // after a few cycles — no onstart/onend/onerror ever fires again,
    // which looks exactly like the reader going dead a few chunks in.
    if (synth.speaking || synth.pending) synth.cancel();
    speakOnce(myToken, i, false);
  }

  function speakOnce(myToken, i, isRetry) {
    if (myToken !== utterToken) return;
    var u = new SpeechSynthesisUtterance(queue[i].text);
    u.rate = currentRate;
    if (currentVoice) u.voice = currentVoice;
    var started = false;
    u.onstart = function () { started = true; };
    u.onend = function () { if (isPlaying && myToken === utterToken) speakChunk(idx + 1); };
    u.onerror = function () { if (isPlaying && myToken === utterToken) speakChunk(idx + 1); };
    synth.speak(u);
    // Some engines drop a speak() call silently under load — no callback
    // of any kind fires, not even onerror — rather than surfacing it as a
    // failure. If nothing happened within a couple of seconds, retry once
    // with a fresh utterance before giving up on this chunk, so one bad
    // speak() call can't permanently stall the reader.
    setTimeout(function () {
      if (myToken !== utterToken || started) return;
      if (!isRetry) { synth.cancel(); speakOnce(myToken, i, true); }
      else { speakChunk(i + 1); }
    }, 2000);
  }

  function restartCurrentChunk() {
    if (idx >= 0) speakChunk(idx);
  }

  function play() {
    if (!queue.length) { progressLabel.textContent = 'No readable text found on this page'; return; }
    isPlaying = true;
    updatePlayBtn();
    startKeepAlive();
    if (synth.paused && idx >= 0) { synth.resume(); return; }
    speakChunk(idx < 0 ? 0 : idx);
  }

  function pause() {
    isPlaying = false;
    updatePlayBtn();
    stopKeepAlive();
    synth.pause();
  }

  function stopReader() {
    isPlaying = false;
    idx = -1;
    updatePlayBtn();
    stopKeepAlive();
    invalidateUtterance();
    synth.cancel();
    clearHighlight();
    updateProgress();
  }

  function skip(delta) {
    if (!queue.length) return;
    var next = Math.max(0, Math.min(queue.length - 1, (idx < 0 ? 0 : idx) + delta));
    invalidateUtterance();
    synth.cancel();
    if (isPlaying) { speakChunk(next); }
    else { idx = next; highlight(queue[idx].el); updateProgress(); }
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
