/* Theory Lab — "Watch it" whiteboard player.
 *
 * Draws an explanation step by step, as if on a board: boxes and arrows draw
 * themselves on, numbers count, the piece that just changed flashes, and a
 * caption (optionally read aloud) says what happened. Vanilla JS + inline SVG,
 * no libraries, no network (the marker font is a Google Font, with a fallback).
 *
 * Markup — one block per animation:
 *   <div class="wb" data-title="The yen carry unwind">
 *     <script type="application/json">{ "w": 600, "h": 400, "steps": [ … ] }</script>
 *   </div>
 *
 * A step is { "cap": "caption", "do": [ ops… ] }. Ops (ids are yours to choose):
 *   {"box":"id","x":,"y":,"w":,"h":,"text":"Line 1\nLine 2","sub":"value","tone":"blue","top":true}
 *   {"chip":"id","x":,"y":,"text":"$100bn bond","tone":"amber"}      small pill, movable
 *   {"icon":"id","name":"bank","x":,"y":,"s":0.8,"tone":"…","label":"BoJ","sym":"¥"}   hand-drawn doodle,
 *       movable; x,y = top-left of its 100×100 box × s. Names: bank govt cash coin house factory
 *       ship barrel gold up down person crowd piggy scroll bolt rocket fire shield scales thermo
 *       megaphone clock ice umbrella globe warn domino pawn key dice (bank/cash/coin/piggy take "sym")
 *   {"move":"id","x":,"y":}                                            slide a chip / box
 *   {"arrow":["from","to"],"label":"…","tone":"red","bend":40,"dash":true,"id":"opt"}
 *   {"note":"id","x":,"y":,"text":"…","tone":"…","size":22,"anchor":"middle"}   free text (or "chart":"cid","at":[t,v],"dx":,"dy":)
 *   {"line":"id","points":[[x,y],…],"tone":"…","width":3}             draw-on polyline
 *   {"count":"boxId","from":161.9,"to":141.7,"dp":1,"pre":"","suf":""} tween a box's sub line
 *   {"sub":"boxId","text":"…"}                                         replace a box's sub line
 *   {"pulse":"id"}   flash      {"dim":"id"}   fade back      {"hide":"id"}   remove      {"cross":"id"}   strike through
 * Mini charts (data coordinates; xd/yd are the axis ranges):
 *   {"chart":"id","x":,"y":,"w":,"h":,"title":"…","xd":[x0,x1],"yd":[y0,y1],"yt":[[v,"label"]],"xt":[[t,"label"]],"zero":true}
 *   {"series":"id","chart":"cid","pts":[[t,v],…],"tone":"…","dash":true,"label":"US","lat":[t,v]}
 *   {"gap":"id","chart":"cid","top":[[t,v]…],"bot":[[t,v]…],"tone":"red","op":0.22}   shaded band between two lines
 *   {"dot":"id","chart":"cid","at":[t,v],"text":"…","dx":,"dy":,"anchor":"start"}
 *   {"bars":"id","chart":"cid","data":[[t,value,"label",tone?],…],"bw":22}             grow from zero
 * Tones: blue, green, red, amber, purple (default: plain chalk).
 *
 * Rendering is replayed from step 0 whenever you jump, so any frame can be reached
 * instantly; only the step being entered going forward is animated. With
 * prefers-reduced-motion the board shows each step's end state without motion.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadFont() {
    if (document.getElementById('wb-font')) return;
    var l = document.createElement('link');
    l.id = 'wb-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap';
    document.head.appendChild(l);
  }

  // ── Doodle icons, drawn in a 100×100 box. Each entry: stroke paths (drawn on in
  //    order), optional filled paths, and where a currency symbol sits. ─────────
  var ICONS = {
    bank:    { d: ['M8,40 L50,12 L92,40 Z', 'M18,44 V80 M34,44 V80 M50,44 V80 M66,44 V80 M82,44 V80', 'M10,84 H90 M4,92 H96'], sym: [50, 31, 18] },
    govt:    { d: ['M28,40 Q50,8 72,40', 'M50,8 V2 M50,2 L62,6 L50,10', 'M14,40 H86', 'M20,44 V80 M38,44 V80 M62,44 V80 M80,44 V80', 'M10,84 H90 M4,92 H96'] },
    cash:    { d: ['M14,62 H86 V86 H14 Z', 'M10,52 H82 V76', 'M6,42 H78 V66 H6 Z'], fill: ['M6,42 H78 V66 H6 Z'], sym: [42, 55, 18] },
    coin:    { d: ['M50,50 m-34,0 a34,34 0 1,0 68,0 a34,34 0 1,0 -68,0', 'M50,50 m-25,0 a25,25 0 1,0 50,0 a25,25 0 1,0 -50,0'], sym: [50, 52, 26] },
    house:   { d: ['M12,50 L50,16 L88,50', 'M22,44 V88 H78 V44', 'M42,88 V64 H58 V88', 'M66,30 V16 H74 V38'] },
    factory: { d: ['M8,88 V50 L28,38 V50 L48,38 V50 L68,38 V88 Z', 'M68,88 V14 H80 V88', 'M16,62 H24 M36,62 H44 M56,62 H64', 'M74,10 q6,-6 12,-2 q6,-6 10,0'] },
    ship:    { d: ['M6,62 H94 L82,84 H18 Z', 'M20,62 V44 H40 V62 M42,62 V44 H62 V62 M64,62 V44 H84 V62 M31,44 V30 H51 V44', 'M2,92 q8,-6 16,0 q8,6 16,0 q8,-6 16,0 q8,6 16,0 q8,-6 16,0 q8,6 16,0'] },
    barrel:  { d: ['M24,20 Q50,8 76,20 V82 Q50,94 24,82 Z', 'M24,20 Q50,32 76,20', 'M24,42 Q50,54 76,42 M24,62 Q50,74 76,62'] },
    gold:    { d: ['M14,78 L26,52 H74 L86,78 Z', 'M30,52 L40,30 H60 L70,52'], fill: ['M14,78 L26,52 H74 L86,78 Z', 'M30,52 L40,30 H60 L70,52 Z'] },
    up:      { d: ['M10,10 V90 H92', 'M16,78 L36,60 L50,68 L70,40 L86,24', 'M74,22 L86,24 L84,36'] },
    down:    { d: ['M10,10 V90 H92', 'M16,22 L36,40 L50,32 L70,62 L86,76', 'M74,78 L86,76 L84,64'] },
    person:  { d: ['M50,26 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0', 'M22,92 Q24,48 50,46 Q76,48 78,92'] },
    crowd:   { d: ['M30,36 m-11,0 a11,11 0 1,0 22,0 a11,11 0 1,0 -22,0', 'M8,86 Q10,54 30,52 Q50,54 52,86', 'M70,36 m-11,0 a11,11 0 1,0 22,0 a11,11 0 1,0 -22,0', 'M48,86 Q50,54 70,52 Q90,54 92,86', 'M50,52 m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0', 'M26,98 Q28,70 50,68 Q72,70 74,98'] },
    piggy:   { d: ['M20,58 Q20,30 52,30 Q84,30 84,56 Q84,78 60,80 H44 Q20,80 20,58 Z', 'M84,52 H94 V62 H84', 'M34,80 V92 M68,80 V92', 'M40,34 L46,22 L54,32', 'M44,40 H60'], sym: [52, 60, 16] },
    scroll:  { d: ['M22,14 H76 V80 Q76,92 64,92 H22 Q10,92 10,80 V26 Q10,14 22,14 Z', 'M22,32 H62 M22,46 H62 M22,60 H50', 'M64,92 Q52,92 52,80 H88 Q88,92 76,92'] },
    bolt:    { d: ['M58,4 L22,56 H48 L38,96 L80,40 H52 Z'], fill: ['M58,4 L22,56 H48 L38,96 L80,40 H52 Z'] },
    rocket:  { d: ['M50,6 Q74,26 70,64 H30 Q26,26 50,6 Z', 'M50,32 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0', 'M30,64 L16,80 L32,76 M70,64 L84,80 L68,76', 'M42,70 Q50,98 58,70'] },
    fire:    { d: ['M50,94 Q16,92 20,58 Q24,38 40,24 Q38,44 50,48 Q48,26 62,8 Q66,30 78,44 Q90,62 80,80 Q72,94 50,94 Z', 'M50,90 Q36,86 40,70 Q44,62 50,58 Q52,70 60,74 Q64,86 50,90 Z'] },
    shield:  { d: ['M50,6 L86,20 Q86,70 50,94 Q14,70 14,20 Z', 'M32,50 L46,64 L70,36'] },
    scales:  { d: ['M50,10 V86 M30,90 H70', 'M14,26 H86', 'M14,26 L4,56 H24 Z M86,26 L76,56 H96 Z'] },
    thermo:  { d: ['M42,14 Q42,6 50,6 Q58,6 58,14 V62 Q70,70 66,84 Q60,96 50,96 Q36,96 34,84 Q30,70 42,62 Z', 'M50,30 V78', 'M62,22 H72 M62,34 H72 M62,46 H72'] },
    megaphone: { d: ['M14,40 H34 L76,16 V84 L34,60 H14 Z', 'M34,40 V60', 'M24,60 L30,84 H40 L36,60', 'M84,36 Q92,50 84,64'] },
    clock:   { d: ['M50,50 m-40,0 a40,40 0 1,0 80,0 a40,40 0 1,0 -80,0', 'M50,24 V50 L68,62'] },
    ice:     { d: ['M24,30 L50,18 L76,30 L76,70 L50,82 L24,70 Z', 'M24,30 L50,42 L76,30 M50,42 V82', 'M30,90 Q40,96 50,92 Q60,96 70,90'] },
    umbrella:{ d: ['M8,50 Q50,0 92,50 Q80,42 70,50 Q60,42 50,50 Q40,42 30,50 Q20,42 8,50 Z', 'M50,50 V84 Q50,94 40,92'] },
    globe:   { d: ['M50,50 m-40,0 a40,40 0 1,0 80,0 a40,40 0 1,0 -80,0', 'M10,50 H90', 'M50,10 Q24,50 50,90 Q76,50 50,10', 'M18,28 Q50,38 82,28 M18,72 Q50,62 82,72'] },
    warn:    { d: ['M50,8 L94,88 H6 Z', 'M50,36 V62', 'M50,74 V76'] },
    domino:  { d: ['M10,90 L22,30 L38,32 L26,92 Z', 'M40,92 L60,38 L74,44 L54,98 Z', 'M66,96 L92,58 L100,68 L76,104 Z'] },
    pawn:    { d: ['M50,26 m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0', 'M38,44 H62 L58,52 H42 Z', 'M42,52 Q40,72 30,80 H70 Q60,72 58,52', 'M24,80 H76 V92 H24 Z'] },
    key:     { d: ['M30,50 m-18,0 a18,18 0 1,0 36,0 a18,18 0 1,0 -36,0', 'M48,50 H92 V62 M78,50 V60'] },
    dice:    { d: ['M14,14 H86 V86 H14 Z', 'M32,32 v1 M68,32 v1 M50,50 v1 M32,68 v1 M68,68 v1'] }
  };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function tone(t) { return 'wb-t-' + (t || 'chalk'); }
  function wait(ms, token, b) {
    return new Promise(function (res) { setTimeout(function () { res(token === b.token); }, ms); });
  }

  function drawOn(path, ms, anim) {
    var len = 0;
    try { len = path.getTotalLength(); } catch (e) { len = 0; }
    if (!len || !anim) return;
    path.style.strokeDasharray = len + ' ' + len;
    path.style.strokeDashoffset = len;
    path.getBoundingClientRect();
    path.style.transition = 'stroke-dashoffset ' + ms + 'ms ease-in-out';
    path.style.strokeDashoffset = '0';
    setTimeout(function () { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; path.style.transition = ''; }, ms + 50);
  }
  function fadeIn(node, ms, anim) {
    if (!anim) return;
    node.style.opacity = '0';
    node.getBoundingClientRect();
    node.style.transition = 'opacity ' + ms + 'ms ease';
    node.style.opacity = '';
    setTimeout(function () { node.style.transition = ''; }, ms + 50);
  }

  // Where the straight line from a box's centre towards (tx,ty) leaves the box.
  function edgePoint(r, tx, ty, pad) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    var hw = r.w / 2 + pad, hh = r.h / 2 + pad;
    var s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return [cx + dx * s, cy + dy * s];
  }

  function Board(root) {
    var cfg;
    try { cfg = JSON.parse(root.querySelector('script[type="application/json"]').textContent); }
    catch (e) { root.textContent = ''; return; }
    this.root = root; this.cfg = cfg; this.steps = cfg.steps || [];
    this.idx = -1; this.playing = false; this.token = 0; this.speak = false;
    this.build();
  }

  Board.prototype.build = function () {
    var b = this, cfg = this.cfg, root = this.root;
    root.innerHTML = '';
    root.classList.add('wb-ready');
    var title = root.getAttribute('data-title') || cfg.title || 'Watch it';

    var head = document.createElement('div'); head.className = 'wb-head';
    head.innerHTML = '<span class="wb-badge">▶ Watch it</span><span class="wb-title"></span>';
    head.querySelector('.wb-title').textContent = title;
    root.appendChild(head);

    var stage = document.createElement('div'); stage.className = 'wb-stage';
    root.appendChild(stage);
    this.svg = el('svg', { viewBox: '0 0 ' + (cfg.w || 600) + ' ' + (cfg.h || 400), role: 'img', 'aria-label': title + ' — animated diagram; the caption below and the text version describe every step' }, stage);
    var defs = el('defs', {}, this.svg);
    // userSpaceOnUse: a bbox-relative region would clip perfectly straight lines to nothing.
    var f = el('filter', { id: 'wb-rough-' + Board.n, filterUnits: 'userSpaceOnUse', x: -40, y: -40, width: (cfg.w || 600) + 80, height: (cfg.h || 400) + 80 }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.035', numOctaves: '2', seed: '3', result: 'n' }, f);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '2.2' }, f);
    this.filterId = 'wb-rough-' + Board.n; Board.n++;
    this.layer = el('g', {}, this.svg);

    var start = document.createElement('button');
    start.type = 'button'; start.className = 'wb-start';
    start.innerHTML = '<span>▶</span> Play the explanation';
    start.addEventListener('click', function () { start.hidden = true; b.play(); });
    stage.appendChild(start);
    this.startBtn = start;

    var cap = document.createElement('div'); cap.className = 'wb-cap'; cap.setAttribute('aria-live', 'polite');
    cap.textContent = cfg.intro || 'Press play to watch it build, or step through at your own pace.';
    root.appendChild(cap); this.cap = cap;

    var bar = document.createElement('div'); bar.className = 'wb-bar';
    bar.innerHTML =
      '<button type="button" class="wb-btn" data-a="restart" aria-label="Start again">⟲</button>' +
      '<button type="button" class="wb-btn" data-a="prev" aria-label="Previous step">◀</button>' +
      '<button type="button" class="wb-btn wb-play" data-a="play" aria-label="Play">▶</button>' +
      '<button type="button" class="wb-btn" data-a="next" aria-label="Next step">▶|</button>' +
      '<div class="wb-dots" role="group" aria-label="Jump to step"></div>' +
      '<button type="button" class="wb-btn wb-voice" data-a="voice" aria-pressed="false" aria-label="Read captions aloud">🔈</button>';
    root.appendChild(bar);
    this.playBtn = bar.querySelector('.wb-play');
    this.voiceBtn = bar.querySelector('.wb-voice');
    if (!('speechSynthesis' in window)) this.voiceBtn.hidden = true;
    var dots = bar.querySelector('.wb-dots'); this.dots = [];
    this.steps.forEach(function (_, i) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'wb-dot';
      d.setAttribute('aria-label', 'Step ' + (i + 1));
      d.addEventListener('click', function () { b.stop(); b.startBtn.hidden = true; b.go(i, false); });
      dots.appendChild(d); b.dots.push(d);
    });
    bar.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      var act = a.getAttribute('data-a');
      b.startBtn.hidden = true;
      if (act === 'play') b.playing ? b.stop() : b.play();
      else if (act === 'next') { b.stop(); if (b.idx < b.steps.length - 1) b.go(b.idx + 1, true); }
      else if (act === 'prev') { b.stop(); if (b.idx > 0) b.go(b.idx - 1, false); else b.go(0, false); }
      else if (act === 'restart') { b.stop(); b.go(-1, false); b.play(); }
      else if (act === 'voice') {
        b.speak = !b.speak; a.setAttribute('aria-pressed', String(b.speak)); a.textContent = b.speak ? '🔊' : '🔈';
        if (!b.speak) window.speechSynthesis.cancel(); else if (b.idx >= 0) b.say(b.steps[b.idx].cap);
      }
    });

    var tr = document.createElement('details'); tr.className = 'wb-transcript';
    var sm = document.createElement('summary'); sm.textContent = 'Read it as text'; tr.appendChild(sm);
    var ol = document.createElement('ol');
    this.steps.forEach(function (s) { var li = document.createElement('li'); li.textContent = s.cap || ''; ol.appendChild(li); });
    tr.appendChild(ol); root.appendChild(tr);
  };
  Board.n = 0;

  Board.prototype.reset = function () {
    while (this.layer.firstChild) this.layer.removeChild(this.layer.firstChild);
    this.items = {};
    this.edges = el('g', { class: 'wb-edges' }, this.layer);
    this.nodes = el('g', { class: 'wb-nodes' }, this.layer);
    this.marks = el('g', { class: 'wb-marks' }, this.layer);
  };

  // Jump to step i. Every earlier step is redrawn instantly; step i animates if asked.
  Board.prototype.go = function (i, anim) {
    var b = this; b.token++;
    var tok = b.token;
    b.reset();
    for (var k = 0; k < i; k++) b.steps[k].do.forEach(function (op) { b.op(op, false, tok); });
    b.idx = i;
    b.dots.forEach(function (d, j) { d.classList.toggle('on', j <= i); d.classList.toggle('cur', j === i); });
    if (i < 0) { b.cap.textContent = b.cfg.intro || 'Press play to watch it build.'; return Promise.resolve(true); }
    var s = b.steps[i];
    b.cap.innerHTML = '<span class="wb-n">' + (i + 1) + '/' + b.steps.length + '</span> ';
    b.cap.appendChild(document.createTextNode(s.cap || ''));
    if (b.speak) b.say(s.cap);
    var live = anim && !REDUCED;
    var chain = Promise.resolve(true);
    s.do.forEach(function (op) {
      chain = chain.then(function (ok) {
        if (!ok || tok !== b.token) return false;
        var ms = b.op(op, live, tok);
        return live ? wait(ms, tok, b) : true;
      });
    });
    return chain;
  };

  Board.prototype.play = function () {
    var b = this;
    if (b.idx >= b.steps.length - 1) b.go(-1, false);
    b.playing = true; b.playBtn.textContent = '❚❚'; b.playBtn.setAttribute('aria-label', 'Pause');
    var tok;
    (function next() {
      if (!b.playing) return;
      if (b.idx >= b.steps.length - 1) { b.stop(); return; }
      b.go(b.idx + 1, true).then(function (ok) {
        tok = b.token;
        if (!ok || !b.playing) return;
        var words = (b.steps[b.idx].cap || '').split(/\s+/).length;
        var dwell = Math.max(1800, words * 260);
        b.afterSpeech(dwell).then(function () { if (b.playing && tok === b.token) next(); });
      });
    })();
  };
  Board.prototype.stop = function () {
    this.playing = false; this.playBtn.textContent = '▶'; this.playBtn.setAttribute('aria-label', 'Play');
    if (this.speak) window.speechSynthesis.cancel();
  };
  Board.prototype.say = function (text) {
    try {
      var s = window.speechSynthesis; s.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var rate = parseFloat(localStorage.getItem('theoryLabTTSRate') || '1');
      if (rate > 0.4 && rate < 3) u.rate = rate;
      s.speak(u);
    } catch (e) {}
  };
  Board.prototype.afterSpeech = function (minMs) {
    var b = this;
    return new Promise(function (res) {
      var t0 = Date.now();
      (function check() {
        var talking = b.speak && window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
        if (Date.now() - t0 >= (b.speak ? 600 : minMs) && !talking) return res();
        setTimeout(check, 150);
      })();
    });
  };

  // Apply one op. Returns how long its animation takes (ms) so steps can sequence.
  Board.prototype.op = function (op, anim, tok) {
    var b = this, it = b.items, rough = 'url(#' + b.filterId + ')';
    if (op.box) {
      var g = el('g', { class: 'wb-box ' + tone(op.tone), transform: 'translate(' + op.x + ' ' + op.y + ')' }, b.nodes);
      var r = el('rect', { x: 0, y: 0, width: op.w, height: op.h, rx: 10, class: 'wb-stroke', filter: rough }, g);
      var lines = String(op.text || '').split('\n'), fs = op.size || 22, sub = op.sub !== undefined;
      var total = lines.length + (sub ? 1 : 0), top = op.top ? fs * 0.9 : op.h / 2 - (total - 1) * fs * 0.55;
      var t = el('text', { x: op.w / 2, y: top, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'wb-label', 'font-size': fs }, g);
      lines.forEach(function (ln, i) { var ts = el('tspan', { x: op.w / 2, dy: i ? fs * 1.1 : 0 }, t); ts.textContent = ln; });
      var st = null;
      if (sub) {
        st = el('text', { x: op.w / 2, y: top + lines.length * fs * 1.1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'wb-sub', 'font-size': fs * 0.95 }, g);
        st.textContent = op.sub;
      }
      it[op.box] = { kind: 'box', g: g, x: op.x, y: op.y, w: op.w, h: op.h, sub: st };
      drawOn(r, 650, anim); fadeIn(t, 400, anim); if (st) fadeIn(st, 400, anim);
      return 700;
    }
    if (op.icon) {
      var spec = ICONS[op.name]; if (!spec) return 0;
      var sc = op.s || 0.8, ig = el('g', { class: 'wb-icon ' + tone(op.tone), transform: 'translate(' + op.x + ' ' + op.y + ') scale(' + sc + ')' }, b.nodes);
      (spec.fill || []).forEach(function (d) { var f = el('path', { d: d, class: 'wb-ifill' }, ig); fadeIn(f, 500, anim); });
      var paths = spec.d.map(function (d) { return el('path', { d: d, class: 'wb-stroke wb-istroke', filter: rough }, ig); });
      var per = Math.max(140, 700 / paths.length);
      paths.forEach(function (pth, i) {
        if (!anim) return;
        pth.style.opacity = '0';
        setTimeout(function () { if (tok !== b.token) return; pth.style.opacity = ''; drawOn(pth, per + 120, true); }, i * per);
      });
      var sym = op.sym && spec.sym;
      if (sym) {
        var st2 = el('text', { x: spec.sym[0], y: spec.sym[1], 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': spec.sym[2] * (op.symScale || 1), class: 'wb-isym' }, ig);
        st2.textContent = op.sym; fadeIn(st2, 400, anim);
      }
      var w0 = 100 * sc, labEl = null;
      if (op.label) {
        labEl = el('text', { x: op.x + w0 / 2, y: op.y + w0 + (op.lsize || 18) * 0.85, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': op.lsize || 18, class: 'wb-ilabel ' + tone(op.tone) }, b.marks);
        String(op.label).split('\n').forEach(function (ln, i) { var ts = el('tspan', { x: op.x + w0 / 2, dy: i ? (op.lsize || 18) * 1.1 : 0 }, labEl); ts.textContent = ln; });
        fadeIn(labEl, 500, anim);
      }
      it[op.icon] = { kind: 'box', g: ig, x: op.x, y: op.y, w: w0, h: w0, s: sc, lab: labEl };
      return Math.min(900, paths.length * per + 200);
    }
    if (op.chip) {
      var cg = el('g', { class: 'wb-chip ' + tone(op.tone), transform: 'translate(' + op.x + ' ' + op.y + ')' }, b.marks);
      var csz = op.size || 17, cw = Math.max(64, String(op.text).length * csz * 0.5 + 22);
      el('rect', { x: -cw / 2, y: -16, width: cw, height: 32, rx: 16, class: 'wb-chip-bg' }, cg);
      var ct = el('text', { x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': csz, class: 'wb-chip-t' }, cg);
      ct.textContent = op.text;
      it[op.chip] = { kind: 'chip', g: cg, x: op.x, y: op.y, w: 0, h: 0 };
      fadeIn(cg, 350, anim);
      return 400;
    }
    if (op.move) {
      var m = it[op.move]; if (!m) return 0;
      var ox = m.x, oy = m.y; m.x = op.x; m.y = op.y;
      var scl = m.s ? ' scale(' + m.s + ')' : '';
      var place = function (x, y) {
        m.g.setAttribute('transform', 'translate(' + x + ' ' + y + ')' + scl);
        if (m.lab) m.lab.setAttribute('transform', 'translate(' + (x - op0x) + ' ' + (y - op0y) + ')');
      };
      var op0x = m.x0 === undefined ? (m.x0 = ox) : m.x0, op0y = m.y0 === undefined ? (m.y0 = oy) : m.y0;
      if (!anim) { place(op.x, op.y); return 0; }
      var dur = op.ms || 900, t0 = performance.now();
      (function frame(now) {
        if (tok !== b.token) return;
        var p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        place(ox + (op.x - ox) * e, oy + (op.y - oy) * e);
        if (p < 1) requestAnimationFrame(frame);
      })(t0);
      return dur;
    }
    if (op.arrow) {
      var A = it[op.arrow[0]], B = it[op.arrow[1]]; if (!A || !B) return 0;
      var ac = [A.x + A.w / 2, A.y + A.h / 2], bc = [B.x + B.w / 2, B.y + B.h / 2];
      var dx = bc[0] - ac[0], dy = bc[1] - ac[1], len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, bend = op.bend || 0;
      var mid = [(ac[0] + bc[0]) / 2 + nx * bend, (ac[1] + bc[1]) / 2 + ny * bend];
      var p0 = A.kind === 'box' ? edgePoint(A, mid[0], mid[1], 6) : ac;
      var p2 = B.kind === 'box' ? edgePoint(B, mid[0], mid[1], 10) : bc;
      // Control point from the clipped ends, so the curve's middle sits `bend` off the
      // straight line between them and the end tangent always points at the target.
      var c = [(p0[0] + p2[0]) / 2 + nx * bend * 2, (p0[1] + p2[1]) / 2 + ny * bend * 2];
      var ag = el('g', { class: 'wb-arrow ' + tone(op.tone) }, b.edges);
      var path = el('path', { d: 'M' + p0 + ' Q' + c + ' ' + p2, class: 'wb-stroke', filter: rough, 'stroke-dasharray': op.dash ? '7 7' : null }, ag);
      var tx = p2[0] - c[0], ty = p2[1] - c[1], tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      var hx = p2[0] - tx * 14, hy = p2[1] - ty * 14;
      var head = el('path', { d: 'M' + (hx + ty * 8) + ',' + (hy - tx * 8) + ' L' + p2 + ' L' + (hx - ty * 8) + ',' + (hy + tx * 8), class: 'wb-stroke wb-tip' }, ag);
      var lab = null;
      if (op.label) {
        var lx = 0.25 * p0[0] + 0.5 * c[0] + 0.25 * p2[0], ly = 0.25 * p0[1] + 0.5 * c[1] + 0.25 * p2[1];
        var side = bend < 0 ? -1 : 1, ox2 = nx * side, oy2 = ny * side;
        // Beside a near-vertical arrow, set the label off to one side instead of across the line.
        var anchor = Math.abs(ox2) > 0.8 ? (ox2 > 0 ? 'start' : 'end') : 'middle';
        var estW = String(op.label).length * (op.size || 19) * 0.52, W = b.cfg.w || 600;
        if (anchor === 'end' && lx - 10 - estW < 4) { anchor = 'start'; ox2 = 1; }
        else if (anchor === 'start' && lx + 10 + estW > W - 4) { anchor = 'end'; ox2 = -1; }
        lab = el('text', { x: lx + ox2 * (anchor === 'middle' ? 14 : 10), y: ly + oy2 * 14, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-size': op.size || 19, class: 'wb-alabel' }, ag);
        lab.textContent = op.label;
      }
      it[op.id || (op.arrow[0] + '>' + op.arrow[1])] = { kind: 'arrow', g: ag, x: 0, y: 0, w: 0, h: 0 };
      if (anim && !op.dash) drawOn(path, 700, true); else fadeIn(path, 500, anim);
      if (anim) { head.style.opacity = '0'; setTimeout(function () { if (tok === b.token) fadeIn(head, 200, true); head.style.opacity = ''; }, 650); }
      if (lab) fadeIn(lab, 500, anim);
      return 800;
    }
    if (op.note) {
      var fsz = op.size || 20;
      if (op.chart && op.at && it[op.chart]) { op = Object.assign({}, op, { x: it[op.chart].px(op.at[0]) + (op.dx || 0), y: it[op.chart].py(op.at[1]) + (op.dy || 0) }); }
      var tt = el('text', { x: op.x, y: op.y, 'text-anchor': op.anchor || 'middle', 'dominant-baseline': 'middle', 'font-size': fsz, class: 'wb-free ' + tone(op.tone) }, b.marks);
      String(op.text || '').split('\n').forEach(function (ln, i) { var ts = el('tspan', { x: op.x, dy: i ? fsz * 1.15 : 0 }, tt); ts.textContent = ln; });
      it[op.note] = { kind: 'text', g: tt, x: op.x, y: op.y, w: 0, h: 0 };
      fadeIn(tt, 450, anim);
      return 450;
    }
    if (op.line) {
      var pl = el('path', { d: 'M' + op.points.map(function (p) { return p.join(','); }).join(' L'), class: 'wb-stroke wb-line ' + tone(op.tone), filter: rough, 'stroke-width': op.width || 3 }, b.edges);
      it[op.line] = { kind: 'line', g: pl };
      drawOn(pl, op.ms || 1100, anim);
      return op.ms || 1100;
    }
    // ── Mini charts: a hand-drawn frame with data-space mapping, then series,
    //    shaded gaps, labelled dots and bars drawn into it. ─────────────────────
    if (op.chart && op.xd) {   // (series, gap, dot and bars also carry 'chart')
      var C = { kind: 'box', x: op.x, y: op.y, w: op.w, h: op.h, xd: op.xd, yd: op.yd,
                pl: op.pl || 40, pr: op.pr || 12, pt: op.pt || 34, pb: op.pb || 26 };
      C.px = function (t) { return C.x + C.pl + (t - C.xd[0]) / (C.xd[1] - C.xd[0]) * (C.w - C.pl - C.pr); };
      C.py = function (v) { return C.y + C.h - C.pb - (v - C.yd[0]) / (C.yd[1] - C.yd[0]) * (C.h - C.pt - C.pb); };
      var cg2 = el('g', { class: 'wb-chart ' + tone(op.tone) }, b.nodes);
      C.g = cg2;
      var frame = el('rect', { x: op.x, y: op.y, width: op.w, height: op.h, rx: 10, class: 'wb-stroke wb-frame', filter: rough }, cg2);
      var ax = el('path', { d: 'M' + C.px(C.xd[0]) + ',' + (C.y + C.pt - 4) + ' L' + C.px(C.xd[0]) + ',' + C.py(C.yd[0]) + ' L' + C.px(C.xd[1]) + ',' + C.py(C.yd[0]), class: 'wb-stroke wb-axis', filter: rough }, cg2);
      var tt2 = el('text', { x: op.x + 12, y: op.y + 18, 'font-size': op.size || 19, class: 'wb-ctitle', 'dominant-baseline': 'middle' }, cg2);
      tt2.textContent = op.title || '';
      (op.yt || []).forEach(function (yt) {
        var yl = el('text', { x: C.px(C.xd[0]) - 5, y: C.py(yt[0]), 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': 16, class: 'wb-tick' }, cg2);
        yl.textContent = yt[1];
      });
      (op.xt || []).forEach(function (xt) {
        var xl = el('text', { x: C.px(xt[0]), y: C.py(C.yd[0]) + 13, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 16, class: 'wb-tick' }, cg2);
        xl.textContent = xt[1];
      });
      if (op.zero) el('path', { d: 'M' + C.px(C.xd[0]) + ',' + C.py(0) + ' L' + C.px(C.xd[1]) + ',' + C.py(0), class: 'wb-stroke wb-zero' }, cg2);
      it[op.chart] = C;
      drawOn(frame, 600, anim); drawOn(ax, 500, anim); fadeIn(tt2, 400, anim);
      return 650;
    }
    if (op.series) {
      var SC = it[op.chart]; if (!SC) return 0;
      var spts = op.pts.map(function (q) { return [SC.px(q[0]), SC.py(q[1])]; });
      var sp = el('path', { d: 'M' + spts.map(function (q) { return q.join(','); }).join(' L'), class: 'wb-stroke wb-series ' + tone(op.tone), filter: op.dash ? null : rough, 'stroke-width': op.width || 3.2, 'stroke-dasharray': op.dash ? '8 6' : null }, b.edges);
      it[op.series] = { kind: 'line', g: sp };
      if (op.label) {
        var lp = op.lat ? [SC.px(op.lat[0]), SC.py(op.lat[1])] : spts[spts.length - 1];
        var sl = el('text', { x: lp[0] + (op.ldx || 0), y: lp[1] + (op.ldy || -12), 'text-anchor': op.lanchor || 'middle', 'dominant-baseline': 'middle', 'font-size': op.lsize || 17, class: 'wb-slabel ' + tone(op.tone) }, b.marks);
        sl.textContent = op.label; fadeIn(sl, 400, anim);
      }
      if (op.dash) fadeIn(sp, op.ms || 700, anim); else drawOn(sp, op.ms || 1100, anim);
      return op.ms || 1100;
    }
    if (op.gap) {
      var GC = it[op.chart]; if (!GC) return 0;
      var poly = op.top.map(function (q) { return GC.px(q[0]) + ',' + GC.py(q[1]); })
        .concat(op.bot.slice().reverse().map(function (q) { return GC.px(q[0]) + ',' + GC.py(q[1]); }));
      var gp = el('polygon', { points: poly.join(' '), class: 'wb-gap ' + tone(op.tone), 'fill-opacity': op.op || 0.22 }, b.edges);
      b.edges.insertBefore(gp, b.edges.firstChild);
      it[op.gap] = { kind: 'area', g: gp };
      fadeIn(gp, 700, anim);
      return 750;
    }
    if (op.dot) {
      var DC = it[op.chart]; if (!DC) return 0;
      var dx0 = DC.px(op.at[0]), dy0 = DC.py(op.at[1]);
      var dg = el('g', { class: 'wb-dotg ' + tone(op.tone) }, b.marks);
      el('circle', { cx: dx0, cy: dy0, r: op.r || 5.5, class: 'wb-dot-c' }, dg);
      if (op.text) {
        var dl = el('text', { x: dx0 + (op.dx || 0), y: dy0 + (op.dy === undefined ? -14 : op.dy), 'text-anchor': op.anchor || 'middle', 'dominant-baseline': 'middle', 'font-size': op.size || 17, class: 'wb-dlabel' }, dg);
        String(op.text).split('\n').forEach(function (ln, i) { var ts = el('tspan', { x: dx0 + (op.dx || 0), dy: i ? (op.size || 17) * 1.1 : 0 }, dl); ts.textContent = ln; });
      }
      it[op.dot] = { kind: 'mark', g: dg, x: dx0, y: dy0, w: 0, h: 0 };
      fadeIn(dg, 400, anim); b.flash(it[op.dot], anim);
      return 500;
    }
    if (op.bars) {
      var BC = it[op.chart]; if (!BC) return 0;
      var bw = op.bw || 22, base = BC.py(0), bdur = op.ms || 900;
      var bg = el('g', { class: 'wb-bars' }, b.edges);
      op.data.forEach(function (d) {
        var cx = BC.px(d[0]), top = BC.py(d[1]), neg = d[1] < 0;
        var r = el('rect', { x: cx - bw / 2, width: bw, y: base, height: 0, rx: 3, class: 'wb-bar ' + (d[3] ? tone(d[3]) : (neg ? 'wb-t-red' : 'wb-t-green')), filter: rough }, bg);
        var lab2 = el('text', { x: cx, y: neg ? top + 14 : top - 12, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': op.size || 17, class: 'wb-dlabel ' + (d[3] ? tone(d[3]) : (neg ? 'wb-t-red' : 'wb-t-green')) }, bg);
        lab2.textContent = d[2] || '';
        var y0 = Math.min(base, top), hh = Math.abs(top - base);
        if (!anim) { r.setAttribute('y', y0); r.setAttribute('height', hh); return; }
        lab2.style.opacity = '0';
        var t0 = performance.now();
        (function grow(now) {
          if (tok !== b.token) return;
          var p = Math.min(1, (now - t0) / bdur), e = 1 - Math.pow(1 - p, 3), cur = hh * e;
          r.setAttribute('height', cur); r.setAttribute('y', neg ? base : base - cur);
          if (p < 1) requestAnimationFrame(grow); else fadeIn(lab2, 300, true), lab2.style.opacity = '';
        })(t0);
      });
      it[op.bars] = { kind: 'bars', g: bg };
      return bdur + 150;
    }
    if (op.count) {
      var cb = it[op.count]; if (!cb || !cb.sub) return 0;
      var fmt = function (v) { return (op.pre || '') + v.toFixed(op.dp || 0) + (op.suf || ''); };
      if (!anim) { cb.sub.textContent = fmt(op.to); return 0; }
      var cdur = op.ms || 1200, c0 = performance.now();
      (function tick(now) {
        if (tok !== b.token) return;
        var p = Math.min(1, (now - c0) / cdur);
        cb.sub.textContent = fmt(op.from + (op.to - op.from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      })(c0);
      b.flash(cb, anim);
      return cdur;
    }
    if (op.sub) {
      var sb = it[op.sub]; if (!sb || !sb.sub) return 0;
      sb.sub.textContent = op.text; fadeIn(sb.sub, 400, anim); b.flash(sb, anim);
      return 450;
    }
    if (op.pulse) { var pb = it[op.pulse]; if (pb) b.flash(pb, anim); return anim ? 700 : 0; }
    if (op.dim) { var db = it[op.dim]; if (db) { db.g.classList.add('wb-dim'); if (db.lab) db.lab.classList.add('wb-dim'); } return anim ? 350 : 0; }
    if (op.hide) { var hb = it[op.hide]; if (hb) { hb.g.classList.add('wb-gone'); if (hb.lab) hb.lab.classList.add('wb-gone'); } return anim ? 300 : 0; }
    if (op.cross) {
      var xb = it[op.cross]; if (!xb || xb.kind !== 'box') return 0;
      var xp = el('path', { d: 'M' + (xb.x - 6) + ',' + (xb.y + xb.h + 6) + ' L' + (xb.x + xb.w + 6) + ',' + (xb.y - 6), class: 'wb-stroke wb-t-red wb-cross', filter: rough }, b.marks);
      drawOn(xp, 450, anim);
      return 500;
    }
    return 0;
  };
  Board.prototype.flash = function (item, anim) {
    if (!anim || !item.g) return;
    item.g.classList.remove('wb-flash'); item.g.getBoundingClientRect(); item.g.classList.add('wb-flash');
    setTimeout(function () { item.g.classList.remove('wb-flash'); }, 900);
  };

  function init() {
    var boards = document.querySelectorAll('.wb:not(.wb-ready)');
    if (!boards.length) return;
    loadFont();
    Array.prototype.forEach.call(boards, function (r) { new Board(r); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
