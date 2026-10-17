/* Theory Lab — "Today in the lab" (hub.html, desk only). Reads the desk's live board
 * (capstone-board.json: VIX term structure, realised vol, dealer gamma, the curve, money-market
 * plumbing, FX) and points to the lessons that explain what is unusual today, with the numbers that
 * triggered each one. Nothing shows when the board is unavailable or nothing stands out.
 */
(function () {
  'use strict';
  var box = document.getElementById('tl-today'); if (!box || !window.fetch) return;
  function v(o) { return o && Number.isFinite(o.value) ? o.value : null; }
  function chg(o) { return o && Number.isFinite(o.value) && Number.isFinite(o.prev) && o.prev ? (o.value - o.prev) / o.prev : null; }
  function f(x, d) { return Number(x).toFixed(d == null ? 2 : d); }
  function monthEnd(d) {
    // last two weekdays of the month, or the first weekday of the next: when month-end hedge flows go through the fix
    var t = new Date(d), wd = function (x) { var w = x.getDay(); return w > 0 && w < 6; }, left = 0, x = new Date(t);
    for (x.setDate(x.getDate() + 1); x.getMonth() === t.getMonth(); x.setDate(x.getDate() + 1)) if (wd(x)) left++;
    var first = true; x = new Date(t.getFullYear(), t.getMonth(), 1);
    for (; x < t; x.setDate(x.getDate() + 1)) if (wd(x)) { first = false; break; }
    return wd(t) && (left < 2 || first);
  }
  fetch('capstone-board.json', { credentials: 'same-origin', cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (b) {
    if (!b) return;
    var V = b.vol || {}, M = b.macro || {}, out = [];
    var vix = v(V.vix), v3 = v(V.vix3m), v9 = v(V.vix9d), rv = v(V.rv20), sk = v(V.skew);
    if (vix != null && v3 != null && vix >= v3)
      out.push(['vix-uncertainty-not-fear', 'VIX ' + f(vix, 1) + ' is at or above VIX3M ' + f(v3, 1) + ': the curve is inverted, so the market is paying most for protection right now.']);
    else if (vix != null && v9 != null && v9 > vix * 1.1)
      out.push(['event-trading-playbook', 'VIX9D ' + f(v9, 1) + ' is well above VIX ' + f(vix, 1) + ': an event inside the next nine days is being priced.']);
    if (vix != null && rv != null && rv > 0 && vix / rv >= 1.6)
      out.push(['garch-volatility', 'Implied vol (VIX ' + f(vix, 1) + ') is ' + f(vix / rv, 1) + '× the S&P 500\'s 20-day realised vol (' + f(rv, 1) + '%). Either the market expects a jump or vol is overpriced.']);
    else if (vix != null && rv != null && rv > vix)
      out.push(['garch-volatility', 'Realised vol (' + f(rv, 1) + '%) is above implied (VIX ' + f(vix, 1) + '): options are cheap against how much the index is actually moving.']);
    if (V.nqGamma && V.nqGamma.sign === 'short')
      out.push(['gamma-exposure-dealer-hedging', 'Dealers are short gamma on the Nasdaq book (as of ' + V.nqGamma.date + '): their hedging adds to moves instead of damping them.']);
    if (sk != null && sk >= 150)
      out.push(['vega-volatility-surface', 'CBOE SKEW is ' + f(sk, 0) + ': far out-of-the-money puts are expensive relative to the at-the-money vol.']);
    var y2 = v(M.us2y), y10 = v(M.us10y);
    if (y2 != null && y10 != null && y10 - y2 < 0)
      out.push(['yield-curve-growth-expectations', 'The 2s10s curve is inverted at ' + f((y10 - y2) * 100, 0) + 'bp (2y ' + f(y2) + '%, 10y ' + f(y10) + '%).']);
    var sofr = v(M.sofr), iorb = v(M.iorb), srf = v(M.srfBn);
    if (sofr != null && iorb != null && sofr > iorb)
      out.push(['fed-corridor-iorb-srf-discount-window', 'SOFR ' + f(sofr) + '% is above interest on reserves ' + f(iorb) + '%: overnight cash is tight.' + (srf ? ' The standing repo facility lent $' + f(srf, 1) + 'bn.' : '')]);
    else if (srf != null && srf >= 1)
      out.push(['fed-corridor-iorb-srf-discount-window', 'Banks took $' + f(srf, 1) + 'bn from the Fed\'s standing repo facility: the ceiling of the corridor is in use.']);
    var jpy = chg(M.usdjpy);
    if (jpy != null && Math.abs(jpy) >= 0.025)
      out.push(['domino-chain-cross-asset', 'USD/JPY has moved ' + (jpy > 0 ? '+' : '') + f(jpy * 100, 1) + '% in five sessions (' + f(M.usdjpy.prev) + ' → ' + f(M.usdjpy.value) + '). Big yen moves are where carry trades unwind; see also interest-rate parity.']);
    ['eurusd', 'gbpusd'].forEach(function (k) {
      var c = chg(M[k]);
      if (c != null && Math.abs(c) >= 0.02) out.push(['interest-rate-parity', k.slice(0, 3).toUpperCase() + '/USD has moved ' + (c > 0 ? '+' : '') + f(c * 100, 1) + '% in five sessions: check whether the rate gap moved with it.']);
    });
    if (monthEnd(new Date()))
      out.push(['fx-fixings-wm-reuters', 'It is month-end: hedge rebalancing goes through the 4pm London fix, and can push the dollar against a good idea for an hour.']);
    var seen = {}; out = out.filter(function (x) { if (seen[x[0]]) return false; seen[x[0]] = 1; return true; }).slice(0, 4);
    var when = (V.vix && V.vix.date) || (M.us10y && M.us10y.date) || '';
    box.innerHTML = '<div class="tl-review-head">📡 Today in the lab' + (when ? ' · board as of ' + when : '') + '</div>' + (out.length
      ? '<p class="tl-review-sub">What stands out on the desk\'s board right now, and the lesson that explains it.</p><ul class="tl-today-list">' + out.map(function (x) {
          return '<li>' + x[1].replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' <a href="lessons/' + x[0] + '.html">Read why →</a></li>';
        }).join('') + '</ul>'
      : '<p class="tl-review-empty">Nothing on the board is unusual today: the vol curve is upward-sloping, the 2s10s curve is positive and money markets are calm. A good day to read something new.</p>');
    box.hidden = false;
  }).catch(function () {});
})();
