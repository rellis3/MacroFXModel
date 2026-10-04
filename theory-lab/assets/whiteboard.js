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
 *   {"move":"id","x":,"y":}                                            slide a chip / box
 *   {"arrow":["from","to"],"label":"…","tone":"red","bend":40,"dash":true,"id":"opt"}
 *   {"note":"id","x":,"y":,"text":"…","tone":"…","size":22,"anchor":"middle"}   free text
 *   {"line":"id","points":[[x,y],…],"tone":"…","width":3}             draw-on polyline
 *   {"count":"boxId","from":161.9,"to":141.7,"dp":1,"pre":"","suf":""} tween a box's sub line
 *   {"sub":"boxId","text":"…"}                                         replace a box's sub line
 *   {"pulse":"id"}   flash      {"dim":"id"}   fade back      {"hide":"id"}   remove      {"cross":"id"}   strike through
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
      if (!anim) { m.g.setAttribute('transform', 'translate(' + op.x + ' ' + op.y + ')'); return 0; }
      var dur = op.ms || 900, t0 = performance.now();
      (function frame(now) {
        if (tok !== b.token) return;
        var p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        m.g.setAttribute('transform', 'translate(' + (ox + (op.x - ox) * e) + ' ' + (oy + (op.y - oy) * e) + ')');
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
    if (op.dim) { var db = it[op.dim]; if (db) db.g.classList.add('wb-dim'); return anim ? 350 : 0; }
    if (op.hide) { var hb = it[op.hide]; if (hb) hb.g.classList.add('wb-gone'); return anim ? 300 : 0; }
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
