/* Theory Lab — Replay a real day (replay.html, desk only: the candles come from the desk's OANDA feed,
 * /api/ohlc-range, which is main-zone). Each episode shows the chart up to a moment of the morning, then
 * reveals one bar at a time while the reader trades it. Fills: market orders at the last close; a stop at
 * its level, or at the bar's open if price opened beyond it (a gap); in a disorderly bar (range more than
 * ten times the median bar so far) at the bar's close, because there were no prices in between to fill it.
 * Results per episode: localStorage theoryLabReplay.
 */
(function () {
  'use strict';
  var EP = [
    { id: 'snb-2015', pair: 'EUR_CHF', gran: 'M5', from: '2015-01-15', to: '2015-01-15', start: '2015-01-15T08:00:00Z', end: '2015-01-15T16:00:00Z',
      title: 'The Swiss franc floor · 15 January 2015',
      brief: '<p>Since September 2011 the Swiss National Bank has capped the franc: it promised to buy unlimited euros to keep EUR/CHF at or above 1.20. Three days ago its vice-chairman called the floor a cornerstone of policy. EUR/CHF sits a fraction above 1.20, and the trade everyone knows is to buy just above the floor with a tight stop: the SNB is on your side, so the downside looks like a few pips.</p><p>It is 8:00 in London. How do you trade today?</p>',
      after: '<p>At 9:30 London time the SNB scrapped the floor without warning and cut its deposit rate to −0.75%. EUR/CHF fell from 1.20 to below 0.90 within minutes, with almost no prices in between, then settled around 1.00 to 1.04. Stops just below 1.20 were filled hundreds of pips lower. Some brokers\' clients ended owing more than their accounts held; FXCM needed a $300m rescue loan.</p><p>The lesson is that a stop limits the price you want, not the price you get. A "can\'t lose" floor is a short option on the central bank changing its mind.</p>',
      lessons: ['trade-management-exits', 'tail-risk-hedging-convexity', 'extreme-value-theory'] },
    { id: 'gilts-2022', pair: 'GBP_USD', gran: 'M15', from: '2022-09-23', to: '2022-09-26', start: '2022-09-23T08:30:00Z', end: '2022-09-26T12:00:00Z',
      title: 'The mini-budget · 23–26 September 2022',
      brief: '<p>The new UK Chancellor is about to present a "fiscal event": large unfunded tax cuts, with no independent forecast from the Office for Budget Responsibility. The Bank of England raised rates yesterday but by less than some expected. Sterling is near 1.12 against the dollar, already weak on a strong dollar.</p><p>It is 9:30 in London, Friday. The statement is starting.</p>',
      after: '<p>Gilt yields jumped by the most in decades as markets asked who would fund the borrowing. Sterling fell through the day on Friday, and in thin Asian trading early on Monday it hit a record low near 1.035 before bouncing hard. Two days later the Bank of England stepped in to buy long gilts to stop a pension-fund fire sale.</p><p>Weekend and thin-session gaps are where stops fail, and a credibility shock reprices a currency like an emerging market\'s.</p>',
      lessons: ['domino-chain-cross-asset', 'event-trading-playbook', 'trade-management-exits'] },
    { id: 'brexit-2016', pair: 'GBP_USD', gran: 'M15', from: '2016-06-23', to: '2016-06-24', start: '2016-06-23T21:00:00Z', end: '2016-06-24T12:00:00Z',
      title: 'The Brexit referendum night · 23–24 June 2016',
      brief: '<p>Polls closed at 10pm. Markets and betting odds lean towards Remain, and sterling has rallied this week towards 1.50. Option risk reversals have been pricing a large sterling fall for weeks. Results will come in through the night, area by area.</p><p>It is 10pm in London. What do you hold through the count?</p>',
      after: '<p>Early results from the north-east came in well short of what Remain needed. Sterling fell more than 10% within hours, to about 1.32, its lowest since 1985. The vote was Leave, 52 to 48.</p><p>An event priced as a coin flip by options was treated as near-certain by spot. The skew was the warning.</p>',
      lessons: ['event-trading-playbook', 'fx-options-quoting-rr-bf', 'bayesian-inference'] },
    { id: 'mof-2022', pair: 'USD_JPY', gran: 'M15', from: '2022-09-22', to: '2022-09-22', start: '2022-09-22T02:00:00Z', end: '2022-09-22T16:00:00Z',
      title: 'Japan steps in · 22 September 2022',
      brief: '<p>The Fed hiked by 75bp yesterday. The Bank of Japan announces its decision this morning and is expected to keep rates negative and yields capped. The rate gap keeps widening and USD/JPY is near 144, a 24-year high. Officials have warned about "rapid, one-sided moves" for weeks, but Japan has not bought yen since 1998.</p><p>It is 3:00 in London. How do you trade the carry?</p>',
      after: '<p>The BoJ kept policy unchanged and USD/JPY pushed to about 145.9. In the afternoon in Tokyo the Ministry of Finance intervened, buying yen for the first time since 1998. USD/JPY fell more than five big figures, to around 140.3, within hours, then crept back as the rate gap was unchanged.</p><p>Intervention moves price fast, but the carry that caused the move keeps pulling. Positioning risk is two-sided.</p>',
      lessons: ['interest-rate-parity', 'central-bank-policy', 'trade-management-exits'] },
    { id: 'cpi-2022', pair: 'EUR_USD', gran: 'M5', from: '2022-11-10', to: '2022-11-10', start: '2022-11-10T12:30:00Z', end: '2022-11-10T20:00:00Z',
      title: 'A soft CPI print · 10 November 2022',
      brief: '<p>US inflation has run above 8% all year and the Fed has hiked by 75bp four times running. October CPI is out at 8:30 in New York (13:30 London). Consensus is about 0.6% on the month and 7.9% on the year. EUR/USD is just below parity.</p><p>It is 12:30 in London. Do you hold anything into the number?</p>',
      after: '<p>CPI came in at 0.4% on the month and 7.7% on the year, with core softer too. The dollar fell hard: EUR/USD rose more than two percent in a few hours, the S&amp;P 500 had its best day since 2020 and two-year Treasury yields fell about 30bp.</p><p>Price moves on the surprise, not the level. A 0.2-point miss on a closely watched number moved the dollar more than most months do.</p>',
      lessons: ['event-trading-playbook', 'central-bank-policy'] },
    { id: 'carry-2024', pair: 'USD_JPY', gran: 'H1', from: '2024-07-29', to: '2024-08-06', start: '2024-08-01T00:00:00Z', end: '2024-08-06T12:00:00Z',
      title: 'The carry unwind · 1–6 August 2024',
      brief: '<p>The Bank of Japan raised rates to 0.25% yesterday and said more could follow. USD/JPY has already fallen from about 162 in early July, but borrowing yen to buy higher-yielding assets is still one of the most crowded trades in the world. US payrolls are due on Friday.</p><p>It is the first of August. How do you hold the yen?</p>',
      after: '<p>Friday\'s payrolls were weak and triggered talk of a US recession. On Monday 5 August the Nikkei fell more than 12%, its worst day since 1987, as carry trades were unwound at once. USD/JPY traded down to about 142, and the VIX spiked above 60 before the open in New York.</p><p>Crowded carry is short volatility: it earns a little for a long time and then gives it back in a week.</p>',
      lessons: ['interest-rate-parity', 'domino-chain-cross-asset', 'vix-uncertainty-not-fear'] }
  ];
  var pick = document.getElementById('rp-pick'), game = document.getElementById('rp-game'), svg = document.getElementById('rp-chart');
  var RK = 'theoryLabReplay';
  function results() { try { return JSON.parse(localStorage.getItem(RK) || '{}') || {}; } catch (e) { return {}; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function paintPick() {
    var r = results();
    pick.innerHTML = '<div class="tl-grid">' + EP.map(function (e) {
      var x = r[e.id];
      return '<button type="button" class="tl-card rp-ep" data-ep="' + e.id + '"><h3>' + esc(e.title) + '</h3><p>' + e.pair.replace('_', '/') + ' · ' + e.gran + ' bars' +
        (x ? ' · your last run: ' + (x.pips >= 0 ? '+' : '') + x.pips.toFixed(1) + ' pips' : '') + '</p></button>';
    }).join('') + '</div>';
  }
  paintPick();
  var S = null;
  pick.addEventListener('click', function (e) { var b = e.target.closest('[data-ep]'); if (b) start(EP.filter(function (x) { return x.id === b.getAttribute('data-ep'); })[0]); });
  function start(ep) {
    game.hidden = false; document.getElementById('rp-after').hidden = true;
    document.getElementById('rp-brief').innerHTML = '<h3>' + esc(ep.title) + '</h3>' + ep.brief;
    status('Loading ' + ep.pair.replace('_', '/') + ' candles…');
    game.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetch('/api/ohlc-range?symbol=' + ep.pair + '&granularity=' + ep.gran + '&from=' + ep.from + '&to=' + ep.to, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        var endT = Date.parse(ep.end) / 1000, st = Date.parse(ep.start) / 1000;
        var bars = (d.values || []).map(function (b) { return { t: +b.t, dt: b.datetime, o: +b.open, h: +b.high, l: +b.low, c: +b.close }; })
          .filter(function (b) { return isFinite(b.c) && b.t <= endT; });
        var i0 = bars.findIndex(function (b) { return b.t >= st; });
        if (bars.length < 10 || i0 < 1) throw new Error('not enough candles for this day');
        S = { ep: ep, bars: bars, n: i0, pos: 0, entry: null, stop: null, real: 0, trades: [], pip: /JPY/.test(ep.pair) ? 0.01 : 0.0001, done: false, worst: 0 };
        draw(); status();
      })
      .catch(function (err) { status('Could not load the candles (' + esc(err.message) + '). The replay needs the desk\'s price feed.'); });
  }
  function last() { return S.bars[S.n - 1]; }
  function fx(p) { return Number(p).toFixed(S.pip < 0.001 ? 5 : 3); }
  function openPnl() { return S.pos ? (last().c - S.entry) * S.pos / S.pip : 0; }
  function medRange() { var r = S.bars.slice(0, S.n).map(function (b) { return b.h - b.l; }).sort(function (a, b) { return a - b; }); return r[Math.floor(r.length / 2)] || 0; }
  function close(px, why) {
    var p = (px - S.entry) * S.pos / S.pip; S.real += p;
    S.trades.push({ side: S.pos > 0 ? 'Long' : 'Short', entry: S.entry, exit: px, pips: p, why: why, at: last().dt });
    S.pos = 0; S.entry = null; S.stop = null;
  }
  function act(a) {
    if (!S || S.done) return;
    var px = last().c, sp = parseFloat(document.getElementById('rp-stop').value);
    if (a === 'buy' || a === 'sell') {
      var dir = a === 'buy' ? 1 : -1;
      if (S.pos === dir) return;
      if (S.pos) close(px, 'reversed');
      S.pos = dir; S.entry = px; S.stop = isFinite(sp) && sp > 0 ? px - dir * sp * S.pip : null;
    } else if (a === 'flat') { if (S.pos) close(px, 'closed by you'); }
    else if (a === 'next' || a === 'next6' || a === 'end') {
      var k = a === 'next' ? 1 : a === 'next6' ? 6 : S.bars.length;
      for (var i = 0; i < k && S.n < S.bars.length; i++) step();
      if (S.n >= S.bars.length) finish();
    }
    draw(); status();
  }
  function step() {
    var b = S.bars[S.n], med = medRange();
    S.n++;
    if (S.pos) S.worst = Math.min(S.worst, (S.pos > 0 ? b.l - S.entry : S.entry - b.h) / S.pip);
    if (S.pos && S.stop != null) {
      var hit = S.pos > 0 ? b.l <= S.stop : b.h >= S.stop;
      if (hit) {
        var gapped = S.pos > 0 ? b.o <= S.stop : b.o >= S.stop, wild = med > 0 && b.h - b.l > 10 * med;
        var fill = gapped ? b.o : wild ? b.c : S.stop;
        close(fill, gapped ? 'stop, filled at the gap' : wild ? 'stop, filled at the close of a disorderly bar' : 'stop');
      }
    }
  }
  function finish() {
    S.done = true; if (S.pos) close(last().c, 'closed at the end');
    var r = results(); r[S.ep.id] = { pips: S.real, at: Date.now() }; try { localStorage.setItem(RK, JSON.stringify(r)); } catch (e) {}
    var a = document.getElementById('rp-after');
    a.innerHTML = '<h3>What happened</h3>' + S.ep.after +
      '<p><b>Your result: ' + (S.real >= 0 ? '+' : '') + S.real.toFixed(1) + ' pips</b> over ' + S.trades.length + ' trade' + (S.trades.length === 1 ? '' : 's') + '.' +
      (S.worst < 0 ? ' Worst point against an open position: ' + S.worst.toFixed(1) + ' pips.' : '') + '</p>' +
      (S.trades.length ? '<table class="pr-mas"><thead><tr><th>Side</th><th>Entry</th><th>Exit</th><th>Pips</th><th>How it ended</th></tr></thead><tbody>' + S.trades.map(function (t) {
        return '<tr><td>' + t.side + '</td><td class="pr-num">' + fx(t.entry) + '</td><td class="pr-num">' + fx(t.exit) + '</td><td class="pr-num ' + (t.pips >= 0 ? 'jn-win' : 'jn-loss') + '">' + t.pips.toFixed(1) + '</td><td>' + esc(t.why) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="tl-hint">You stayed out. On some of these days that was the best trade available.</p>') +
      '<p>Read next: ' + S.ep.lessons.map(function (l) { return '<a href="lessons/' + l + '.html">' + l.replace(/-/g, ' ') + '</a>'; }).join(' · ') + '</p>' +
      '<div class="tl-btnrow"><button type="button" class="tl-btn" id="rp-again">Replay this day</button> <a class="tl-btn" href="journal.html">Log the lesson in your journal</a></div>';
    a.hidden = false;
    document.getElementById('rp-again').addEventListener('click', function () { start(S.ep); });
    paintPick();
  }
  function status(msg) {
    var el = document.getElementById('rp-status');
    if (msg) { el.textContent = msg; return; }
    var b = last(), left = S.bars.length - S.n;
    el.innerHTML = '<b>' + esc(b.dt) + '</b> London · ' + S.ep.pair.replace('_', '/') + ' <b>' + fx(b.c) + '</b> · ' +
      (S.pos ? (S.pos > 0 ? 'Long' : 'Short') + ' from ' + fx(S.entry) + (S.stop != null ? ', stop ' + fx(S.stop) : ', no stop') + ' · open ' + openPnl().toFixed(1) + ' pips' : 'Flat') +
      ' · banked ' + S.real.toFixed(1) + ' pips · ' + (S.done ? 'finished' : left + ' bars to go');
  }
  function draw() {
    var W = 800, H = 340, pad = 8, N = 140, vis = S.bars.slice(Math.max(0, S.n - N), S.n), lo = Infinity, hi = -Infinity;
    vis.forEach(function (b) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); });
    if (S.stop != null) { lo = Math.min(lo, S.stop); hi = Math.max(hi, S.stop); }
    var span = hi - lo || 1, w = (W - 60) / N, y = function (p) { return pad + (hi - p) / span * (H - 2 * pad); };
    var st = Date.parse(S.ep.start) / 1000, h = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var p = lo + f * span; h += '<line x1="0" x2="' + (W - 60) + '" y1="' + y(p) + '" y2="' + y(p) + '" class="pr-grid"/><text x="' + (W - 56) + '" y="' + (y(p) + 4) + '" class="pr-ax">' + +p.toFixed(S.pip < 0.001 ? 4 : 2) + '</text>'; });
    vis.forEach(function (b, i) {
      var x = i * w + w / 2, up = b.c >= b.o, cls = (b.t < st ? 'rp-ctx ' : '') + (up ? 'rp-up' : 'rp-dn');
      h += '<line x1="' + x + '" x2="' + x + '" y1="' + y(b.h) + '" y2="' + y(b.l) + '" class="' + cls + '"/>' +
        '<rect x="' + (x - w * 0.35) + '" width="' + Math.max(1, w * 0.7) + '" y="' + y(Math.max(b.o, b.c)) + '" height="' + Math.max(1, Math.abs(y(b.o) - y(b.c))) + '" class="' + cls + '"/>';
    });
    if (S.entry != null) h += '<line x1="0" x2="' + (W - 60) + '" y1="' + y(S.entry) + '" y2="' + y(S.entry) + '" class="rp-entry"/>';
    if (S.stop != null) h += '<line x1="0" x2="' + (W - 60) + '" y1="' + y(S.stop) + '" y2="' + y(S.stop) + '" class="rp-stopl"/>';
    svg.innerHTML = h;
  }
  game.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) act(b.getAttribute('data-act')); });
  document.addEventListener('keydown', function (e) { if (S && !S.done && e.key === 'ArrowRight' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) act('next'); });
})();
