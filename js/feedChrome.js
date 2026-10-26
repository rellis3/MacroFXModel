// The Feed's tab bar on a detail page (styles: css/feed-theme.css).
//
// Include as the FIRST element inside <body>, so it runs before the page draws anything:
//   <script src="js/feedChrome.js" data-complex="liquidity" data-label="Global liquidity"></script>
// data-complex lights that tab (rates | liquidity | cross | commodities | options | credit | equities | currencies | positioning);
// data-s="1" also re-points --s1/--s2 as surfaces (pages built on css/index.css get this automatically).
//
// It adds body.feed (and body.dark, so pages built on css/index.css take their dark branch, charts included) and
// inserts the bar. Colours only; the page's own layout and scripts are untouched.
(() => {
  const me = document.currentScript, body = document.body;
  if (!body) return;
  const ix = !!document.querySelector('link[href*="css/index.css"]');
  body.classList.add('feed', 'dark');
  if (ix || me?.dataset.s === '1') body.classList.add('feed-s');
  const here = me?.dataset.complex ?? '', label = me?.dataset.label ?? document.title;
  const tabs = [['rates', 'the curve', '#rates'], ['liquidity', 'liquidity', '#liquidity'], ['cross', 'cross-asset', '#cross'],
    ['commodities', 'commodities', '#commodities', 'amb'], ['options', 'options', '#options']];
  const ext = [['credit', 'credit', 'credit-stress.html'], ['equities', 'equities · sectors', 'market-view.html'],
    ['currencies', 'currencies', 'fx-factor-v2.html'], ['positioning', 'positioning', 'cot-extremes.html']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bar = document.createElement('nav');
  bar.className = 'feed-bar'; bar.setAttribute('aria-label', 'The Feed');
  bar.innerHTML = `<a class="home" href="feed.html">THE FEED</a>`
    + tabs.map(([k, t, h, c]) => `<a class="${k === here ? 'on' : ''} ${c ?? ''}" href="feed.html${h}">${t}</a>`).join('')
    + `<span class="sep"></span>`
    + ext.map(([k, t, h]) => `<a class="${k === here ? 'on' : ''}" href="${h}">${t}</a>`).join('')
    + `<span class="here">you are in <b>${esc(label)}</b></span>`;
  body.insertBefore(bar, me && me.parentNode === body ? me.nextSibling : body.firstChild);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = '#02050b';
})();
