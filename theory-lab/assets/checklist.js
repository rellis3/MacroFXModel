/* Theory Lab — pre-trade checklist (checklist.html). Ticks and notes are saved in this browser
 * (localStorage theoryLabChecklist) until "Clear for the next trade". "Log it in the journal" hands the
 * trade name, the unticked questions and the note (not lessons: tag those yourself, by what the trade relied on) to journal.html as a draft (theoryLabJournalDraft).
 * Desk-only questions arrive as window.TL_CHECK_DESK from a DESK block in the page.
 */
(function () {
  'use strict';
  // [section, question, lesson slug, why it matters]
  var Q = [
    ['The idea', 'Can you state the thesis in one sentence, and the price or event that would prove it wrong?', 'process-vs-outcome-decision-journals', 'If you cannot say what would make you wrong, you will not know when you are.'],
    ['The idea', 'How often has this setup worked before? Do you know the base rate, not just the memorable wins?', 'bayesian-inference', 'Start from how often it works, then update on today\'s evidence.'],
    ['The idea', 'How many other ideas did you look at before this one? Would it still stand out after that many tries?', 'multiple-testing', 'Look at enough charts and something always looks like a pattern.'],
    ['The idea', 'Has it worked on data you did not use to find it?', 'walk-forward-purged-cv', 'In-sample results flatter everything.'],
    ['The market today', 'What regime is this: calm or stressed, trending or ranging? Does your setup belong in it?', 'regime-switching-state-space', 'Most edges work in one regime and bleed in the other.'],
    ['The market today', 'What range is implied volatility pricing over your holding period? Is your target inside it?', 'vix-uncertainty-not-fear', 'A target three implied moves away is a lottery ticket.'],
    ['The market today', 'Is there a scheduled release or central bank decision before your horizon? Have you sized for the gap?', 'event-trading-playbook', 'Price moves on the surprise, and stops do not fill at their level through it.'],
    ['The market today', 'Is it month-end, quarter-end or near the 4pm London fix?', 'fx-fixings-wm-reuters', 'Mechanical flows can push price against a good idea for an hour.'],
    ['The market today', 'Are there large option strikes or dealer gamma near your entry, stop or target?', 'gamma-exposure-dealer-hedging', 'Dealer hedging pins price near big strikes and speeds it up away from them.'],
    ['The market today', 'Do you know what holding costs or earns: the carry and the forward points?', 'interest-rate-parity', 'Negative carry is a cost you pay every day the idea takes to work.'],
    ['Size and risk', 'Is the stop where the thesis is wrong, rather than at a loss you find comfortable?', 'trade-management-exits', 'A stop placed by pain tolerance gets hit by noise.'],
    ['Size and risk', 'Is the size set so that hitting the stop costs a fixed, small share of the account?', 'kelly-criterion', 'Even a real edge ruins you when it is overbet.'],
    ['Size and risk', 'Counted together with your open positions, how much of the same bet do you hold?', 'correlation-networks-mst', 'Three USD trades are one trade with three times the size.'],
    ['Size and risk', 'What happens if price gaps straight through the stop?', 'extreme-value-theory', 'Tails are fatter than the normal curve says, and they arrive overnight.'],
    ['Size and risk', 'After spread, slippage and swap, is the expected value still positive?', 'execution-algorithms', 'An edge smaller than its costs is a donation.'],
    ['Exit plan', 'Do you have a target, a time stop, and a rule for moving the stop?', 'trade-management-exits', 'Decide the exits while you are calm, not while the trade is moving.'],
    ['Exit plan', 'What news would make you close early, even with the stop untouched?', 'trade-management-exits', 'The reason you entered can disappear before the price tells you.'],
    ['You', 'Are you trying to win back a recent loss?', 'loss-aversion-prospect-theory', 'Losses make people take bigger risks to get back to even.'],
    ['You', 'Are you on a winning streak and sizing up because of it?', 'overconfidence-overtrading', 'Streaks raise confidence faster than they raise skill.'],
    ['You', 'If this goes against you, will you hold it hoping it comes back?', 'disposition-effect', 'Most traders sell winners too early and hold losers too long.'],
    ['You', 'Is this the consensus trade everyone is already in?', 'herding-narratives-bubbles', 'When everyone is positioned the same way, the exit is crowded.'],
    ['You', 'Have you written the trade and your reasons down before entering?', 'process-vs-outcome-decision-journals', 'Without a record you cannot tell a good decision from a lucky one.']
  ];
  (window.TL_CHECK_DESK || []).forEach(function (d) {
    var at = -1; Q.forEach(function (q, i) { if (q[0] === d[0]) at = i; });
    Q.splice(at + 1, 0, d);
  });
  var K = 'theoryLabChecklist', list = document.getElementById('ck-list'), name = document.getElementById('ck-name'), note = document.getElementById('ck-note');
  function get() { try { return JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { return {}; } }
  function save(s) { s.at = Date.now(); try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function key(q) { return q[2] + ':' + q[1].slice(0, 40); }
  var st = get(); st.t = st.t || {};
  var sec = '', h = '';
  Q.forEach(function (q, i) {
    if (q[0] !== sec) { if (sec) h += '</ol>'; sec = q[0]; h += '<h2>' + esc(sec) + '</h2><ol class="ck-ol">'; }
    h += '<li><label><input type="checkbox" data-i="' + i + '"' + (st.t[key(q)] ? ' checked' : '') + '> <span>' + esc(q[1]) + '</span></label>' +
      '<div class="ck-why">' + esc(q[3]) + ' <a href="lessons/' + q[2] + '.html">Lesson →</a></div></li>';
  });
  list.innerHTML = h + '</ol>';
  name.value = st.name || ''; note.value = st.note || '';
  function ticked() { return Q.filter(function (q) { return st.t[key(q)]; }); }
  function paint() { document.getElementById('ck-score').textContent = ticked().length + ' of ' + Q.length + ' ticked'; }
  list.addEventListener('change', function (e) { var i = e.target.getAttribute('data-i'); if (i == null) return; st.t[key(Q[+i])] = e.target.checked; save(st); paint(); });
  name.addEventListener('input', function () { st.name = name.value; save(st); });
  note.addEventListener('input', function () { st.note = note.value; save(st); });
  function asText() {
    return 'Pre-trade checklist' + (st.name ? ': ' + st.name : '') + '\n' + new Date().toLocaleString() + '\n\n' +
      Q.map(function (q) { return (st.t[key(q)] ? '[x] ' : '[ ] ') + q[1]; }).join('\n') + (st.note ? '\n\nNote: ' + st.note : '') + '\n';
  }
  document.getElementById('ck-copy').addEventListener('click', function (e) {
    var b = e.target, t = asText();
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = '✓ Copied'; }, function () { window.prompt('Copy the checklist:', t); });
    setTimeout(function () { b.textContent = 'Copy as text'; }, 2000);
  });
  document.getElementById('ck-print').addEventListener('click', function () {
    var was = list.querySelectorAll('input:checked'); Array.prototype.forEach.call(was, function (c) { c.checked = false; });
    window.print(); Array.prototype.forEach.call(was, function (c) { c.checked = true; });
  });
  document.getElementById('ck-clear').addEventListener('click', function () {
    if (!window.confirm('Clear every tick and note for the next trade?')) return;
    st = { t: {} }; save(st); name.value = ''; note.value = '';
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (c) { c.checked = false; }); paint();
  });
  document.getElementById('ck-journal').addEventListener('click', function () {
    var miss = Q.filter(function (q) { return !st.t[key(q)]; });
    try { localStorage.setItem('theoryLabJournalDraft', JSON.stringify({ name: st.name || '', note: (st.note || '') + (miss.length ? (st.note ? '\n' : '') + 'Not ticked: ' + miss.map(function (q) { return q[1]; }).join(' | ') : ''), checklist: ticked().length + '/' + Q.length })); } catch (e) {}
  });
  paint();
})();
