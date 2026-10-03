/* Live desk verdicts for Theory Lab lessons.
 *
 * A verdict box opts in with the ledger id and the date of the ledger entry the
 * author wrote against:
 *   <div class="tl-verdict null" data-evidence="funding-stress" data-evidence-date="2026-10-02">
 *     <span class="tl-verdict-tag">Null</span><span>authored text…</span></div>
 * (slide decks: .sl-stamp / .sl-stamp-tag, same attributes).
 *
 * On load this asks the server for those ids and, for each box:
 *   - sets the tag and colour from the ledger's CURRENT verdict;
 *   - flags the box when the study was re-run after the lesson was written, or the
 *     verdict changed, so stale prose is visible rather than silently wrong;
 *   - adds a collapsed "what the desk found" with the ledger's own claim and result.
 * Offline / file:// / any fetch failure leaves the authored box exactly as written.
 */
(function () {
  // Labels say what was tested, not what is true. A null here is one desk's test, on its
  // own data, instruments and period, finding nothing usable; it is not a verdict on the
  // theory the lesson teaches, and the test itself can be what is wrong.
  var LABEL = { validated: 'Desk test: held up', null: 'Desk test: nothing found', context: 'Desk data: base rate', underpowered: 'Desk test: too small to tell' };
  var SCOPE = 'What this means: this desk tested the trading claim on its own data, instruments and period and found nothing usable. That is not a verdict on the theory above, and the test itself may be what is off.';
  var VARIANTS0 = ['null', 'underpowered'];
  // Every "nothing found" box, live or authored, carries the same scope line.
  function addScope(box) {
    if (box.querySelector('.tl-verdict-scope')) return;
    var tag = box.querySelector('.tl-verdict-tag, .sl-stamp-tag');
    var body = tag ? tag.nextElementSibling : null;
    if (!body) return;
    var p = document.createElement('div'); p.className = 'tl-verdict-scope'; p.textContent = SCOPE;
    body.appendChild(p);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tl-verdict, .sl-stamp'), function (b) {
    if (VARIANTS0.some(function (v) { return b.classList.contains(v); })) addScope(b);
  });
  var boxes = Array.prototype.slice.call(document.querySelectorAll('[data-evidence]'));
  if (!boxes.length || !window.fetch) return;
  var ids = boxes.map(function (b) { return b.getAttribute('data-evidence'); })
    .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  var me = document.currentScript || document.querySelector('script[src*="verdicts.js"]');
  var url = new URL('../desk-verdicts.json', me ? me.src : location.href);
  url.searchParams.set('ids', ids.join(','));
  var VARIANTS = ['validated', 'null', 'context', 'underpowered', 'untested'];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  fetch(url.href, { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.entries) return;
      boxes.forEach(function (box) {
        var e = j.entries[box.getAttribute('data-evidence')];
        if (!e) return;
        var slide = box.classList.contains('sl-stamp');
        var pre = slide ? 'sl-stamp' : 'tl-verdict';
        var authored = VARIANTS.filter(function (v) { return box.classList.contains(v); })[0];
        var wroteAgainst = box.getAttribute('data-evidence-date') || '';
        VARIANTS.forEach(function (v) { box.classList.remove(v); });
        box.classList.add(e.verdict);
        var tag = box.querySelector('.' + pre + '-tag');
        if (tag) tag.textContent = LABEL[e.verdict] || e.verdict;
        var oldScope = box.querySelector('.tl-verdict-scope'); if (oldScope) oldScope.remove();
        var body = tag ? tag.nextElementSibling : null;
        if (!body) { body = el('span'); box.appendChild(body); }
        if (authored !== e.verdict || (wroteAgainst && e.date > wroteAgainst)) {
          var n = el('div', pre + '-updated');
          n.textContent = (authored !== e.verdict
            ? 'The desk re-tested this: ' + (LABEL[e.verdict] || e.verdict).toLowerCase()
            : 'The desk re-ran this study') + ' (ledger dated ' + e.date + '). The text below was written against the earlier result.';
          body.insertBefore(n, body.firstChild);
        }
        var d = el('details', pre + '-ledger');
        d.appendChild(el('summary', null, 'What the desk found · ledger dated ' + e.date));
        d.appendChild(el('p', null, 'Claim tested: ' + e.claim));
        d.appendChild(el('p', null, 'Result: ' + e.result));
        body.appendChild(d);
        if (e.verdict === 'null' || e.verdict === 'underpowered') addScope(box);
        box.setAttribute('data-evidence-live', '1');
      });
    })
    .catch(function () { /* keep the authored box */ });
})();
