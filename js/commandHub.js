// js/commandHub.js — the shared 'Command Hub' top nav: dropdown menus (Live/Vol/
// FX BT/Research/Equity/Gold/Systems/Learn/WIP/Archived), starred Favourites, and the
// drag-to-reorder 'Edit Nav' modal (layout synced server-side via /api/nav-layout, so
// it follows you across pages/devices).
//
// Extracted 2026-08-15 from index.html/indexv2.html, which had silently drifted apart
// — indexv2 was missing the whole 'Archived' category (and therefore items filed under
// it), exactly the failure mode CLAUDE.md's Lego Principle 1 warns about ('the moment
// two copies drift, ... silently disagree'). This is the one copy now; every consumer
// (index.html, indexv2.html, today.html, ...) gets identical menus and one shared
// favourites/layout record instead of three that can disagree.
//
// Usage — a page just needs:
//   <div id="commandHub"></div>
//   <script src="js/commandHub.js"></script>
// This script injects its own CSS and the #navEditOverlay modal automatically; nothing
// else to wire up. Safe to omit entirely on a page that shouldn't show the nav.

(function () {
  if (!document.getElementById('chubStyles')) {
    var style = document.createElement('style');
    style.id = 'chubStyles';
    style.textContent = `
/* ── Command Hub (dropdown bar) ────────────────────────────────────────────── */
#commandHub{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:6px 14px;background:var(--s1,#111827);border-bottom:2px solid var(--border,#1e2a3a);}
.chub-dd{position:relative;display:inline-block}
.chub-btn{background:none;border:1px solid var(--border,#1e2a3a);border-radius:6px;color:var(--text2,#94a3b8);font-size:11px;font-weight:600;cursor:pointer;padding:4px 10px;font-family:'DM Sans',sans-serif;transition:background .1s,border-color .1s;white-space:nowrap}
.chub-btn:hover,.chub-dd.open .chub-btn{background:var(--s2,#161b27)}
.chub-menu{display:none;position:absolute;top:calc(100% + 3px);left:0;z-index:300;min-width:195px;max-height:72vh;overflow-y:auto;background:var(--s1,#111827);border:1px solid var(--border,#1e2a3a);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.55)}
.chub-dd.open .chub-menu{display:block}
.chub-item{display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:var(--text2,#94a3b8);font-size:12px;padding:6px 8px;border-radius:5px;line-height:1.25;transition:background .1s,color .1s}
.chub-item:hover{background:var(--s2,#161b27);color:var(--text,#e2e8f0)}
.ci-txt{flex:1;min-width:0}
.chub-star{background:none;border:none;cursor:pointer;font-size:11px;color:var(--text3,#4b5563);padding:0 0 0 8px;line-height:1;opacity:.2;transition:opacity .1s,color .1s;flex-shrink:0}
.chub-item:hover .chub-star{opacity:.7}
.chub-star:hover{opacity:1!important;color:#f59e0b!important}
.chub-star.starred{color:#f59e0b!important;opacity:1!important}
#chubFavDD{display:none}
#scratchBtn{background:none;border:1px solid var(--border,#1e2a3a);border-radius:6px;color:var(--text3,#4b5563);font-size:11px;font-weight:600;cursor:pointer;padding:4px 10px;font-family:'DM Sans',sans-serif;margin-left:auto;white-space:nowrap}
#scratchBtn:hover{background:var(--s2,#161b27);color:var(--text2,#94a3b8)}
#navEditBtn{background:none;border:1px solid var(--border,#1e2a3a);border-radius:6px;color:var(--text3,#4b5563);font-size:11px;font-weight:600;cursor:pointer;padding:4px 10px;font-family:'DM Sans',sans-serif;white-space:nowrap}
#navEditBtn:hover{background:var(--s2,#161b27);color:var(--text2,#94a3b8)}
#navEditOverlay{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:24px}
#navEditOverlay.open{display:flex}
#navEditModal{background:var(--s1,#111827);border:1px solid var(--border,#1e2a3a);border-radius:10px;width:100%;max-width:1240px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6)}
#navEditHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border,#1e2a3a)}
#navEditHead h3{margin:0;font-size:14px;color:var(--text,#e2e8f0);font-family:'DM Sans',sans-serif}
#navEditHint{font-size:11px;color:var(--text3,#4b5563);font-family:'DM Sans',sans-serif;text-align:right}
#navEditBody{display:flex;gap:10px;padding:14px 18px;overflow-x:auto;overflow-y:hidden;flex:1;min-height:0}
.ne-col{flex:0 0 195px;display:flex;flex-direction:column;background:var(--s2,#161b27);border:1px solid var(--border,#1e2a3a);border-radius:8px;min-height:0}
.ne-col-hd{font-size:11px;font-weight:700;padding:8px 10px;border-bottom:1px solid var(--border,#1e2a3a);font-family:'DM Sans',sans-serif}
.ne-col-list{flex:1;overflow-y:auto;padding:6px;min-height:80px}
.ne-item{background:var(--s1,#111827);border:1px solid var(--border,#1e2a3a);border-radius:5px;padding:6px 8px;font-size:11px;color:var(--text2,#94a3b8);margin-bottom:4px;cursor:grab;font-family:'DM Sans',sans-serif;line-height:1.3;user-select:none}
.ne-item.dragging{opacity:.35}
#navEditFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border,#1e2a3a)}
.ne-btn{background:none;border:1px solid var(--border,#1e2a3a);border-radius:6px;color:var(--text2,#94a3b8);font-size:12px;font-weight:600;cursor:pointer;padding:6px 14px;font-family:'DM Sans',sans-serif}
.ne-btn:hover{background:var(--s2,#161b27)}
.ne-btn.primary{background:#4f7df0;border-color:#4f7df0;color:#fff}
.ne-btn.primary:hover{background:#3d68d8}
.ne-btn.danger{color:#ef4444;border-color:rgba(239,68,68,.35);margin-right:auto}
`;
    document.head.appendChild(style);
  }

  var mount = document.getElementById('commandHub');
  if (mount) {
    mount.innerHTML = `

  <!-- Favourites (shown when any starred) -->
  <div class="chub-dd" id="chubFavDD">
    <button class="chub-btn" style="color:#f59e0b;border-color:rgba(245,158,11,.4)" onclick="chubToggleDD(event,'chubFavDD')">★ Favs ▾</button>
    <div class="chub-menu" id="chubFavMenu"></div>
  </div>

  <!-- Live -->
  <div class="chub-dd" id="chubDDlive">
    <button class="chub-btn" style="color:#10b981;border-color:rgba(16,185,129,.35)" onclick="chubToggleDD(event,'chubDDlive')">Live ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="desk.html" target="_blank" data-href="desk.html"><span class="ci-txt">🖥 The Desk</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('desk.html')" data-href="desk.html">☆</button></a>
      <a class="chub-item" href="today.html" target="_blank" data-href="today.html"><span class="ci-txt">☀️ Daily Brief</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('today.html')" data-href="today.html">☆</button></a>
      <a class="chub-item" href="fomc-sentiment.html" target="_blank" data-href="fomc-sentiment.html"><span class="ci-txt">🏛 FOMC Sentiment</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('fomc-sentiment.html')" data-href="fomc-sentiment.html">☆</button></a>
      <a class="chub-item" href="ecb-sentiment.html" target="_blank" data-href="ecb-sentiment.html"><span class="ci-txt">🇪🇺 ECB Sentiment</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('ecb-sentiment.html')" data-href="ecb-sentiment.html">☆</button></a>
      <a class="chub-item" href="labor-market.html" target="_blank" data-href="labor-market.html"><span class="ci-txt">💼 Labor Market</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('labor-market.html')" data-href="labor-market.html">☆</button></a>
      <a class="chub-item" href="boe-sentiment.html" target="_blank" data-href="boe-sentiment.html"><span class="ci-txt">🇬🇧 BoE Sentiment</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('boe-sentiment.html')" data-href="boe-sentiment.html">☆</button></a>
      <a class="chub-item" href="boj-sentiment.html" target="_blank" data-href="boj-sentiment.html"><span class="ci-txt">🇯🇵 BoJ Sentiment</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('boj-sentiment.html')" data-href="boj-sentiment.html">☆</button></a>
      <a class="chub-item" href="beige-book.html" target="_blank" data-href="beige-book.html"><span class="ci-txt">📖 Beige Book</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('beige-book.html')" data-href="beige-book.html">☆</button></a>
      <a class="chub-item" href="cpi.html" target="_blank" data-href="cpi.html"><span class="ci-txt">📈 CPI / Inflation</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cpi.html')" data-href="cpi.html">☆</button></a>
      <a class="chub-item" href="gdp.html" target="_blank" data-href="gdp.html"><span class="ci-txt">📊 GDP / Growth</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gdp.html')" data-href="gdp.html">☆</button></a>
      <a class="chub-item" href="ism.html" target="_blank" data-href="ism.html"><span class="ci-txt">🏭 Business Activity</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('ism.html')" data-href="ism.html">☆</button></a>
      <a class="chub-item" href="retail-sales.html" target="_blank" data-href="retail-sales.html"><span class="ci-txt">🛒 Retail Sales</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('retail-sales.html')" data-href="retail-sales.html">☆</button></a>
      <a class="chub-item" href="trade-balance.html" target="_blank" data-href="trade-balance.html"><span class="ci-txt">⚖️ Trade Balance</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trade-balance.html')" data-href="trade-balance.html">☆</button></a>
      <a class="chub-item" href="real-yield.html" target="_blank" data-href="real-yield.html"><span class="ci-txt">💰 Real Yield</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('real-yield.html')" data-href="real-yield.html">☆</button></a>
      <a class="chub-item" href="ppi.html" target="_blank" data-href="ppi.html"><span class="ci-txt">🏭 PPI</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('ppi.html')" data-href="ppi.html">☆</button></a>
      <a class="chub-item" href="yield-curve.html" target="_blank" data-href="yield-curve.html"><span class="ci-txt">📉 Yield Curve</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('yield-curve.html')" data-href="yield-curve.html">☆</button></a>
      <a class="chub-item" href="consumer-confidence.html" target="_blank" data-href="consumer-confidence.html"><span class="ci-txt">🙂 Consumer Confidence</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('consumer-confidence.html')" data-href="consumer-confidence.html">☆</button></a>
      <a class="chub-item" href="macro-scorecard.html" target="_blank" data-href="macro-scorecard.html"><span class="ci-txt">🏆 Macro Scorecard</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macro-scorecard.html')" data-href="macro-scorecard.html">☆</button></a>
      <a class="chub-item" href="levels.html" target="_blank" data-href="levels.html"><span class="ci-txt">🎯 Entry Lens</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('levels.html')" data-href="levels.html">☆</button></a>
      <a class="chub-item" href="oi-dashboard.html" target="_blank" data-href="oi-dashboard.html"><span class="ci-txt">◆ OI Analytics</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('oi-dashboard.html')" data-href="oi-dashboard.html">☆</button></a>
      <a class="chub-item" href="vol-forecast-v2.html" target="_blank" data-href="vol-forecast-v2.html"><span class="ci-txt">📐 Vol Forecast v2</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-forecast-v2.html')" data-href="vol-forecast-v2.html">☆</button></a>
      <a class="chub-item" href="forecast-replay.html" target="_blank" data-href="forecast-replay.html"><span class="ci-txt">📊 Forecast Replay</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-replay.html')" data-href="forecast-replay.html">☆</button></a>
      <a class="chub-item" href="cog-replay.html" target="_blank" data-href="cog-replay.html"><span class="ci-txt">📊 COG Replay</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-replay.html')" data-href="cog-replay.html">☆</button></a>
      <a class="chub-item" href="forecast-reversion.html" target="_blank" data-href="forecast-reversion.html"><span class="ci-txt">📈 Forecast Reversion</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-reversion.html')" data-href="forecast-reversion.html">☆</button></a>
      <a class="chub-item" href="vol-forecast-research.html" target="_blank" data-href="vol-forecast-research.html"><span class="ci-txt">🔬 Vol Forecast Research</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-forecast-research.html')" data-href="vol-forecast-research.html">☆</button></a>
      <a class="chub-item" href="vol-research-book.html" target="_blank" data-href="vol-research-book.html"><span class="ci-txt">📖 Vol Research Book</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-research-book.html')" data-href="vol-research-book.html">☆</button></a>
      <a class="chub-item" href="cross-pair-research.html" target="_blank" data-href="cross-pair-research.html"><span class="ci-txt">🧭 Cross-Pair Research</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cross-pair-research.html')" data-href="cross-pair-research.html">☆</button></a>
      <a class="chub-item" href="forecast-path.html" target="_blank" data-href="forecast-path.html"><span class="ci-txt">📐 Forecast Path (Cone &amp; Replay)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-path.html')" data-href="forecast-path.html">☆</button></a>
      <a class="chub-item" href="forecast-blend.html" target="_blank" data-href="forecast-blend.html"><span class="ci-txt">🔀 Forecast Blend (Model vs Analog)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-blend.html')" data-href="forecast-blend.html">☆</button></a>
      <a class="chub-item" href="expected-moves.html" target="_blank" data-href="expected-moves.html"><span class="ci-txt">📊 Expected Moves (All Pairs)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('expected-moves.html')" data-href="expected-moves.html">☆</button></a>
      <a class="chub-item" href="cog-level-poc.html" target="_blank" data-href="cog-level-poc.html"><span class="ci-txt">🎯 COG-Level POC</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-level-poc.html')" data-href="cog-level-poc.html">☆</button></a>
      <a class="chub-item" href="cog-reverse-engineer.html" target="_blank" data-href="cog-reverse-engineer.html"><span class="ci-txt">🔍 COG Reverse-Engineer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-reverse-engineer.html')" data-href="cog-reverse-engineer.html">☆</button></a>
      <a class="chub-item" href="qmr-tearsheet.html" target="_blank" data-href="qmr-tearsheet.html"><span class="ci-txt">📈 QMR Tearsheet</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('qmr-tearsheet.html')" data-href="qmr-tearsheet.html">☆</button></a>
      <a class="chub-item" href="cog-signal-log.html" target="_blank" data-href="cog-signal-log.html"><span class="ci-txt">📝 COG Signal Log</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-signal-log.html')" data-href="cog-signal-log.html">☆</button></a>
      <a class="chub-item" href="reversal-study.html" target="_blank" data-href="reversal-study.html"><span class="ci-txt">↩️ Reversal-Point Research</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('reversal-study.html')" data-href="reversal-study.html">☆</button></a>
      <a class="chub-item" href="reversal-fade.html" target="_blank" data-href="reversal-fade.html"><span class="ci-txt">🎯 Reversal-Fade Test</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('reversal-fade.html')" data-href="reversal-fade.html">☆</button></a>
      <a class="chub-item" href="cog-fade.html" target="_blank" data-href="cog-fade.html"><span class="ci-txt">🎯 COG-Fade Test</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-fade.html')" data-href="cog-fade.html">☆</button></a>
      <a class="chub-item" href="forecast-accuracy.html" target="_blank" data-href="forecast-accuracy.html"><span class="ci-txt">🎯 Forecast Accuracy</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-accuracy.html')" data-href="forecast-accuracy.html">☆</button></a>
      <a class="chub-item" href="reversion-proof.html" target="_blank" data-href="reversion-proof.html"><span class="ci-txt">🔬 Reversion Proof</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('reversion-proof.html')" data-href="reversion-proof.html">☆</button></a>
      <a class="chub-item" href="position-sizer.html" target="_blank" data-href="position-sizer.html"><span class="ci-txt">⚖️ Position Sizer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('position-sizer.html')" data-href="position-sizer.html">☆</button></a>
      <a class="chub-item" href="exhaustion-forecast.html" target="_blank" data-href="exhaustion-forecast.html"><span class="ci-txt">↩️ Exhaustion Forecast</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('exhaustion-forecast.html')" data-href="exhaustion-forecast.html">☆</button></a>
      <a class="chub-item" href="price-slowdown-lab.html" target="_blank" data-href="price-slowdown-lab.html"><span class="ci-txt">🐢 Price Slowdown Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('price-slowdown-lab.html')" data-href="price-slowdown-lab.html">☆</button></a>
      <a class="chub-item" href="fill-realism.html" target="_blank" data-href="fill-realism.html"><span class="ci-txt">🔬 Fill-Realism Ladder</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('fill-realism.html')" data-href="fill-realism.html">☆</button></a>
      <a class="chub-item" href="honest-policy.html" target="_blank" data-href="honest-policy.html"><span class="ci-txt">📉 Honest-Policy Portfolio</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('honest-policy.html')" data-href="honest-policy.html">☆</button></a>
      <a class="chub-item" href="news-exhaustion.html" target="_blank" data-href="news-exhaustion.html"><span class="ci-txt">🗞️ News-Exhaustion</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('news-exhaustion.html')" data-href="news-exhaustion.html">☆</button></a>
      <a class="chub-item" href="pooled-fade.html" target="_blank" data-href="pooled-fade.html"><span class="ci-txt">📈 Pooled Fade</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('pooled-fade.html')" data-href="pooled-fade.html">☆</button></a>
      <a class="chub-item" href="forecast-style-fade.html" target="_blank" data-href="forecast-style-fade.html"><span class="ci-txt">🎯 Forecast-Style Fade</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-style-fade.html')" data-href="forecast-style-fade.html">☆</button></a>
      <a class="chub-item" href="forward-track.html" target="_blank" data-href="forward-track.html"><span class="ci-txt">📡 Forward-Track Fade</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forward-track.html')" data-href="forward-track.html">☆</button></a>
      <a class="chub-item" href="fade-viewer.html" target="_blank" data-href="fade-viewer.html"><span class="ci-txt">🔍 Fade Viewer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('fade-viewer.html')" data-href="fade-viewer.html">☆</button></a>
      <a class="chub-item" href="vumanchu-chart.html" target="_blank" data-href="vumanchu-chart.html"><span class="ci-txt">〰️ VuManChu Pane → Image</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vumanchu-chart.html')" data-href="vumanchu-chart.html">☆</button></a>
      <a class="chub-item" href="vumanchu-state.html" target="_blank" data-href="vumanchu-state.html"><span class="ci-txt">🎯 VuManChu State &amp; Forward Validation</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vumanchu-state.html')" data-href="vumanchu-state.html">☆</button></a>
      <a class="chub-item" href="estimator-ab.html" target="_blank" data-href="estimator-ab.html"><span class="ci-txt">⚖️ Vol Estimator A/B</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('estimator-ab.html')" data-href="estimator-ab.html">☆</button></a>
      <a class="chub-item" href="vol-horse-race.html" target="_blank" data-href="vol-horse-race.html"><span class="ci-txt">🏇 Vol Horse Race</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-horse-race.html')" data-href="vol-horse-race.html">☆</button></a>
      <a class="chub-item" href="sigma-fade-ab.html" target="_blank" data-href="sigma-fade-ab.html"><span class="ci-txt">🔬 σ Fade A/B</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('sigma-fade-ab.html')" data-href="sigma-fade-ab.html">☆</button></a>
      <a class="chub-item" href="telegram-v2.html" target="_blank" data-href="telegram-v2.html"><span class="ci-txt">📡 Telegram v2</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('telegram-v2.html')" data-href="telegram-v2.html">☆</button></a>
      <a class="chub-item" href="performance.html" target="_blank" data-href="performance.html"><span class="ci-txt">📊 Performance</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('performance.html')" data-href="performance.html">☆</button></a>
      <a class="chub-item" href="journal.html" target="_blank" data-href="journal.html"><span class="ci-txt">📒 Journal</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('journal.html')" data-href="journal.html">☆</button></a>
      <a class="chub-item" href="bot-config.html" target="_blank" data-href="bot-config.html"><span class="ci-txt">🤖 Bot Config</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('bot-config.html')" data-href="bot-config.html">☆</button></a>
      <a class="chub-item" href="giveback.html" target="_blank" data-href="giveback.html"><span class="ci-txt">💸 Give-Back (exit quality)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('giveback.html')" data-href="giveback.html">☆</button></a>
      <a class="chub-item" href="backtest-vmc.html" target="_blank" data-href="backtest-vmc.html"><span class="ci-txt">🌊 Backtest VMC Test (entry quality)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('backtest-vmc.html')" data-href="backtest-vmc.html">☆</button></a>
      <a class="chub-item" href="backtest-exit-study.html" target="_blank" data-href="backtest-exit-study.html"><span class="ci-txt">🚪 Backtest Exit Study (TP/trail/time)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('backtest-exit-study.html')" data-href="backtest-exit-study.html">☆</button></a>
      <a class="chub-item" href="gold.html" target="_blank" data-href="gold.html"><span class="ci-txt">🥇 Gold Model</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold.html')" data-href="gold.html">☆</button></a>
      <a class="chub-item" href="gold-zones.html" target="_blank" data-href="gold-zones.html"><span class="ci-txt">🗺 Gold Zones</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold-zones.html')" data-href="gold-zones.html">☆</button></a>
      <a class="chub-item" href="nasdaq-threshold-engine.html" target="_blank" data-href="nasdaq-threshold-engine.html"><span class="ci-txt">📡 NQ Gate Live</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('nasdaq-threshold-engine.html')" data-href="nasdaq-threshold-engine.html">☆</button></a>
      <a class="chub-item" href="cog-v2-engine.html" target="_blank" data-href="cog-v2-engine.html"><span class="ci-txt">⚙ COG v2</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog-v2-engine.html')" data-href="cog-v2-engine.html">☆</button></a>
      <a class="chub-item" href="liquidity-pulse.html" target="_blank" data-href="liquidity-pulse.html"><span class="ci-txt">💧 Liq Pulse</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('liquidity-pulse.html')" data-href="liquidity-pulse.html">☆</button></a>
      <a class="chub-item" href="global-liquidity.html" target="_blank" data-href="global-liquidity.html"><span class="ci-txt">🌊 Global Liq</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('global-liquidity.html')" data-href="global-liquidity.html">☆</button></a>
      <a class="chub-item" href="trade-decision-engine.html" target="_blank" data-href="trade-decision-engine.html"><span class="ci-txt">🎯 Trade Decision</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trade-decision-engine.html')" data-href="trade-decision-engine.html">☆</button></a>
      <a class="chub-item" href="upcoming-trades.html" target="_blank" data-href="upcoming-trades.html"><span class="ci-txt">📋 Upcoming Trades</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('upcoming-trades.html')" data-href="upcoming-trades.html">☆</button></a>
      <a class="chub-item" href="trade-cards.html" target="_blank" data-href="trade-cards.html"><span class="ci-txt">🃏 Trade Cards</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trade-cards.html')" data-href="trade-cards.html">☆</button></a>
      <a class="chub-item" href="continuation-fade-ticker.html" target="_blank" data-href="continuation-fade-ticker.html"><span class="ci-txt">📡 Continuation/Fade</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('continuation-fade-ticker.html')" data-href="continuation-fade-ticker.html">☆</button></a>
    </div>
  </div>

  <!-- Vol & Forecast -->
  <div class="chub-dd" id="chubDDvol">
    <button class="chub-btn" style="color:#4f7df0;border-color:rgba(79,125,240,.35)" onclick="chubToggleDD(event,'chubDDvol')">Vol ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="honest-forecast-harness.html" target="_blank" data-href="honest-forecast-harness.html"><span class="ci-txt">🔬 Honest Harness</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('honest-forecast-harness.html')" data-href="honest-forecast-harness.html">☆</button></a>
      <a class="chub-item" href="credit-leadlag.html" target="_blank" data-href="credit-leadlag.html"><span class="ci-txt">🚨 Credit Lead-Lag</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('credit-leadlag.html')" data-href="credit-leadlag.html">☆</button></a>
      <a class="chub-item" href="rate-matrix.html" target="_blank" data-href="rate-matrix.html"><span class="ci-txt">🧮 Rate Matrix</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('rate-matrix.html')" data-href="rate-matrix.html">☆</button></a>
      <a class="chub-item" href="yield-coupling.html" target="_blank" data-href="yield-coupling.html"><span class="ci-txt">🧲 Yield Coupling</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('yield-coupling.html')" data-href="yield-coupling.html">☆</button></a>
      <a class="chub-item" href="yield-coupling-real.html" target="_blank" data-href="yield-coupling-real.html"><span class="ci-txt">🏦 Real DE–US Yields</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('yield-coupling-real.html')" data-href="yield-coupling-real.html">☆</button></a>
      <a class="chub-item" href="trend-basket.html" target="_blank" data-href="trend-basket.html"><span class="ci-txt">📈 Trend Basket</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trend-basket.html')" data-href="trend-basket.html">☆</button></a>
      <a class="chub-item" href="system-fx-carry-factor.html" target="_blank" data-href="system-fx-carry-factor.html"><span class="ci-txt">💱 FX Carry Factor</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-fx-carry-factor.html')" data-href="system-fx-carry-factor.html">☆</button></a>
      <a class="chub-item" href="multi-factor-book.html" target="_blank" data-href="multi-factor-book.html"><span class="ci-txt">🧱 Multi-Factor Book</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('multi-factor-book.html')" data-href="multi-factor-book.html">☆</button></a>
      <a class="chub-item" href="vol-backtest.html" target="_blank" data-href="vol-backtest.html"><span class="ci-txt">📊 Vol BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-backtest.html')" data-href="vol-backtest.html">☆</button></a>
      <a class="chub-item" href="vol-backtest-v2.html" target="_blank" data-href="vol-backtest-v2.html"><span class="ci-txt">📊 Vol BT v2</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-backtest-v2.html')" data-href="vol-backtest-v2.html">☆</button></a>
      <a class="chub-item" href="macrofx-zone-backtest.html" target="_blank" data-href="macrofx-zone-backtest.html"><span class="ci-txt">🎯 Decision-Zone BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macrofx-zone-backtest.html')" data-href="macrofx-zone-backtest.html">☆</button></a>
      <a class="chub-item" href="trend-flip-backtest.html" target="_blank" data-href="trend-flip-backtest.html"><span class="ci-txt">🔀 Trend-Flip BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trend-flip-backtest.html')" data-href="trend-flip-backtest.html">☆</button></a>
      <a class="chub-item" href="macrofx-decision-backtest.html" target="_blank" data-href="macrofx-decision-backtest.html"><span class="ci-txt">🧠 Decision Engine BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macrofx-decision-backtest.html')" data-href="macrofx-decision-backtest.html">☆</button></a>
      <a class="chub-item" href="weekly-vol-backtest.html" target="_blank" data-href="weekly-vol-backtest.html"><span class="ci-txt">📅 Weekly Vol BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('weekly-vol-backtest.html')" data-href="weekly-vol-backtest.html">☆</button></a>
      <a class="chub-item" href="vol-forecast-bench.html" target="_blank" data-href="vol-forecast-bench.html"><span class="ci-txt">📐 σ Benchmark</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-forecast-bench.html')" data-href="vol-forecast-bench.html">☆</button></a>
      <a class="chub-item" href="forecast-coverage.html" target="_blank" data-href="forecast-coverage.html"><span class="ci-txt">📏 Band Coverage</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-coverage.html')" data-href="forecast-coverage.html">☆</button></a>
      <a class="chub-item" href="analytics-desk.html" target="_blank" data-href="analytics-desk.html"><span class="ci-txt">🖥️ Analytics Desk</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('analytics-desk.html')" data-href="analytics-desk.html">☆</button></a>
      <a class="chub-item" href="book-stress.html" target="_blank" data-href="book-stress.html"><span class="ci-txt">🌊 Book Stress</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('book-stress.html')" data-href="book-stress.html">☆</button></a>
      <a class="chub-item" href="rank-ic.html" target="_blank" data-href="rank-ic.html"><span class="ci-txt">🎯 Rank-IC</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('rank-ic.html')" data-href="rank-ic.html">☆</button></a>
      <a class="chub-item" href="forecaster-backtest.html" target="_blank" data-href="forecaster-backtest.html"><span class="ci-txt">📈 Forecaster BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecaster-backtest.html')" data-href="forecaster-backtest.html">☆</button></a>
      <a class="chub-item" href="forecast-analysis.html" target="_blank" data-href="forecast-analysis.html"><span class="ci-txt">📊 Level Analyser</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-analysis.html')" data-href="forecast-analysis.html">☆</button></a>
      <a class="chub-item" href="forecast-book-report.html" target="_blank" data-href="forecast-book-report.html"><span class="ci-txt">📄 Book Report</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-book-report.html')" data-href="forecast-book-report.html">☆</button></a>
      <a class="chub-item" href="forecast-refresh.html" target="_blank" data-href="forecast-refresh.html"><span class="ci-txt">⟳ Data Refresh</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('forecast-refresh.html')" data-href="forecast-refresh.html">☆</button></a>
      <a class="chub-item" href="level-atlas-vote-backtest.html" target="_blank" data-href="level-atlas-vote-backtest.html"><span class="ci-txt">🗳 Level Atlas Vote Backtest</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('level-atlas-vote-backtest.html')" data-href="level-atlas-vote-backtest.html">☆</button></a>
      <a class="chub-item" href="level-atlas-vote-portfolio.html" target="_blank" data-href="level-atlas-vote-portfolio.html"><span class="ci-txt">🧺 Level Atlas Vote Portfolio</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('level-atlas-vote-portfolio.html')" data-href="level-atlas-vote-portfolio.html">☆</button></a>
    </div>
  </div>

  <!-- FX Range Backtests -->
  <div class="chub-dd" id="chubDDfxbt">
    <button class="chub-btn" style="color:#8b5cf6;border-color:rgba(139,92,246,.35)" onclick="chubToggleDD(event,'chubDDfxbt')">FX BT ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="asia-range-backtest.html" target="_blank" data-href="asia-range-backtest.html"><span class="ci-txt">📐 Asia Range BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('asia-range-backtest.html')" data-href="asia-range-backtest.html">☆</button></a>
      <a class="chub-item" href="asia-range-analysis.html" target="_blank" data-href="asia-range-analysis.html"><span class="ci-txt">📊 Asia Analysis</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('asia-range-analysis.html')" data-href="asia-range-analysis.html">☆</button></a>
      <a class="chub-item" href="range-fib-backtest.html" target="_blank" data-href="range-fib-backtest.html"><span class="ci-txt">📏 Range-Fib BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('range-fib-backtest.html')" data-href="range-fib-backtest.html">☆</button></a>
      <a class="chub-item" href="range-line-strategy.html" target="_blank" data-href="range-line-strategy.html"><span class="ci-txt">🎯 Range-Line</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('range-line-strategy.html')" data-href="range-line-strategy.html">☆</button></a>
      <a class="chub-item" href="range-zones.html" target="_blank" data-href="range-zones.html"><span class="ci-txt">📊 Range Zones</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('range-zones.html')" data-href="range-zones.html">☆</button></a>
      <a class="chub-item" href="liquidity-backtest.html" target="_blank" data-href="liquidity-backtest.html"><span class="ci-txt">💧 Liq Levels BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('liquidity-backtest.html')" data-href="liquidity-backtest.html">☆</button></a>
      <a class="chub-item" href="oi-zones.html" target="_blank" data-href="oi-zones.html"><span class="ci-txt">🎯 OI Zones</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('oi-zones.html')" data-href="oi-zones.html">☆</button></a>
      <a class="chub-item" href="pivot-spike-backtest.html" target="_blank" data-href="pivot-spike-backtest.html"><span class="ci-txt">📍 Pivot Spike BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('pivot-spike-backtest.html')" data-href="pivot-spike-backtest.html">☆</button></a>
      <a class="chub-item" href="regime-backtest.html" target="_blank" data-href="regime-backtest.html"><span class="ci-txt">⚡ Regime BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('regime-backtest.html')" data-href="regime-backtest.html">☆</button></a>
      <a class="chub-item" href="strategy-lab.html" target="_blank" data-href="strategy-lab.html"><span class="ci-txt">🥊 Strategy Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('strategy-lab.html')" data-href="strategy-lab.html">☆</button></a>
      <a class="chub-item" href="backtest-viewer.html" target="_blank" data-href="backtest-viewer.html"><span class="ci-txt">▶ BT Viewer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('backtest-viewer.html')" data-href="backtest-viewer.html">☆</button></a>
      <a class="chub-item" href="bot-config.html#tab-backtest" target="_blank" data-href="bot-config.html#tab-backtest"><span class="ci-txt">🖥 BT Monitor</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('bot-config.html#tab-backtest')" data-href="bot-config.html#tab-backtest">☆</button></a>
    </div>
  </div>

  <!-- Macro Research -->
  <div class="chub-dd" id="chubDDresearch">
    <button class="chub-btn" style="color:#f59e0b;border-color:rgba(245,158,11,.35)" onclick="chubToggleDD(event,'chubDDresearch')">Research ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="trend-v2.html" target="_blank" data-href="trend-v2.html"><span class="ci-txt">⚖️ Trend v2 σ-Sizing A/B</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trend-v2.html')" data-href="trend-v2.html">☆</button></a>
      <a class="chub-item" href="mve.html" target="_blank" data-href="mve.html"><span class="ci-txt">⚖️ Market Valuation</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('mve.html')" data-href="mve.html">☆</button></a>
      <a class="chub-item" href="correlations.html" target="_blank" data-href="correlations.html"><span class="ci-txt">⬡ Corr Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('correlations.html')" data-href="correlations.html">☆</button></a>
      <a class="chub-item" href="cot-extremes.html" target="_blank" data-href="cot-extremes.html"><span class="ci-txt">📋 COT Extremes</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cot-extremes.html')" data-href="cot-extremes.html">☆</button></a>
      <a class="chub-item" href="regime-viewer.html" target="_blank" data-href="regime-viewer.html"><span class="ci-txt">🔍 Regime Viewer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('regime-viewer.html')" data-href="regime-viewer.html">☆</button></a>
      <a class="chub-item" href="analysis.html" target="_blank" data-href="analysis.html"><span class="ci-txt">📊 Pattern Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('analysis.html')" data-href="analysis.html">☆</button></a>
      <a class="chub-item" href="hedge-signals-v2.html" target="_blank" data-href="hedge-signals-v2.html"><span class="ci-txt">⚡ Signals v2</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('hedge-signals-v2.html')" data-href="hedge-signals-v2.html">☆</button></a>
      <a class="chub-item" href="gold-miner-arb.html" target="_blank" data-href="gold-miner-arb.html"><span class="ci-txt">⛏️ Gold/GDX Arb</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold-miner-arb.html')" data-href="gold-miner-arb.html">☆</button></a>
      <a class="chub-item" href="diversification.html" target="_blank" data-href="diversification.html"><span class="ci-txt">🔗 Book Explorer</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('diversification.html')" data-href="diversification.html">☆</button></a>
      <a class="chub-item" href="macro-conditioner.html" target="_blank" data-href="macro-conditioner.html"><span class="ci-txt">🌡️ Macro Conditioner</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macro-conditioner.html')" data-href="macro-conditioner.html">☆</button></a>
      <a class="chub-item" href="range-level-edge.html" target="_blank" data-href="range-level-edge.html"><span class="ci-txt">📐 Range-Level Edge</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('range-level-edge.html')" data-href="range-level-edge.html">☆</button></a>
      <a class="chub-item" href="yield-spread.html" target="_blank" data-href="yield-spread.html"><span class="ci-txt">🎯 Yield-Spread</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('yield-spread.html')" data-href="yield-spread.html">☆</button></a>
      <a class="chub-item" href="touches-backtest.html" target="_blank" data-href="touches-backtest.html"><span class="ci-txt">🧬 Touches Backtest</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('touches-backtest.html')" data-href="touches-backtest.html">☆</button></a>
      <a class="chub-item" href="volatilityExhaustion/analysis-book.html" target="_blank" data-href="volatilityExhaustion/analysis-book.html"><span class="ci-txt">🌡 Vol-Exhaustion Book</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('volatilityExhaustion/analysis-book.html')" data-href="volatilityExhaustion/analysis-book.html">☆</button></a>
    </div>
  </div>

  <!-- NASDAQ / Equity -->
  <div class="chub-dd" id="chubDDequity">
    <button class="chub-btn" style="color:#06b6d4;border-color:rgba(6,182,212,.35)" onclick="chubToggleDD(event,'chubDDequity')">Equity ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="macro-equity-backtest.html" target="_blank" data-href="macro-equity-backtest.html"><span class="ci-txt">📊 Macro Eq BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macro-equity-backtest.html')" data-href="macro-equity-backtest.html">☆</button></a>
      <a class="chub-item" href="nasdaq-threshold-backtest.html" target="_blank" data-href="nasdaq-threshold-backtest.html"><span class="ci-txt">🧮 NQ Threshold BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('nasdaq-threshold-backtest.html')" data-href="nasdaq-threshold-backtest.html">☆</button></a>
      <a class="chub-item" href="nasdaq-liquidity-continuation.html" target="_blank" data-href="nasdaq-liquidity-continuation.html"><span class="ci-txt">📈 NQ Liq BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('nasdaq-liquidity-continuation.html')" data-href="nasdaq-liquidity-continuation.html">☆</button></a>
      <a class="chub-item" href="liquidity-gate-backtest.html" target="_blank" data-href="liquidity-gate-backtest.html"><span class="ci-txt">💧 Liq Gate BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('liquidity-gate-backtest.html')" data-href="liquidity-gate-backtest.html">☆</button></a>
      <a class="chub-item" href="zscore-backtest.html" target="_blank" data-href="zscore-backtest.html"><span class="ci-txt">⚡ Yield Z-Score</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('zscore-backtest.html')" data-href="zscore-backtest.html">☆</button></a>
      <a class="chub-item" href="vix-vol-carry-backtest.html" target="_blank" data-href="vix-vol-carry-backtest.html"><span class="ci-txt">🌋 VIX Vol-Carry</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vix-vol-carry-backtest.html')" data-href="vix-vol-carry-backtest.html">☆</button></a>
    </div>
  </div>

  <!-- Gold -->
  <div class="chub-dd" id="chubDDgold">
    <button class="chub-btn" style="color:#eab308;border-color:rgba(234,179,8,.35)" onclick="chubToggleDD(event,'chubDDgold')">Gold ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="gold.html" target="_blank" data-href="gold.html"><span class="ci-txt">🥇 Gold Model</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold.html')" data-href="gold.html">☆</button></a>
      <a class="chub-item" href="gold-zones.html" target="_blank" data-href="gold-zones.html"><span class="ci-txt">🗺 Gold Zones</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold-zones.html')" data-href="gold-zones.html">☆</button></a>
      <a class="chub-item" href="gold-backtest.html" target="_blank" data-href="gold-backtest.html"><span class="ci-txt">📊 Gold BT</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold-backtest.html')" data-href="gold-backtest.html">☆</button></a>
      <a class="chub-item" href="gold-lab.html" target="_blank" data-href="gold-lab.html"><span class="ci-txt">🔬 Gold Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('gold-lab.html')" data-href="gold-lab.html">☆</button></a>
      <a class="chub-item" href="system-gold-macro.html" target="_blank" data-href="system-gold-macro.html"><span class="ci-txt">📊 P6 Gold Macro</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-gold-macro.html')" data-href="system-gold-macro.html">☆</button></a>
    </div>
  </div>

  <!-- Portfolio Systems -->
  <div class="chub-dd" id="chubDDsystems">
    <button class="chub-btn" style="color:#14b8a6;border-color:rgba(20,184,166,.35)" onclick="chubToggleDD(event,'chubDDsystems')">Systems ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="hub.html" target="_blank" data-href="hub.html"><span class="ci-txt">⬡ Risk Hub</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('hub.html')" data-href="hub.html">☆</button></a>
      <a class="chub-item" href="system-credit-equity.html" target="_blank" data-href="system-credit-equity.html"><span class="ci-txt">📊 P2 Credit-Equity</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-credit-equity.html')" data-href="system-credit-equity.html">☆</button></a>
      <a class="chub-item" href="system-yield-curve.html" target="_blank" data-href="system-yield-curve.html"><span class="ci-txt">📊 P3 Yield Curve</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-yield-curve.html')" data-href="system-yield-curve.html">☆</button></a>
    </div>
  </div>

  <!-- Education -->
  <div class="chub-dd" id="chubDDedu">
    <button class="chub-btn" style="color:#a78bfa;border-color:rgba(167,139,250,.35)" onclick="chubToggleDD(event,'chubDDedu')">Learn ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="theory-lab/hub.html" target="_blank" data-href="theory-lab/hub.html"><span class="ci-txt">🎓 Theory Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('theory-lab/hub.html')" data-href="theory-lab/hub.html">☆</button></a>
      <a class="chub-item" href="cog/hub.html" target="_blank" data-href="cog/hub.html"><span class="ci-txt">📊 COG Hub</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('cog/hub.html')" data-href="cog/hub.html">☆</button></a>
      <a class="chub-item" href="repo-brick-map.html" target="_blank" data-href="repo-brick-map.html"><span class="ci-txt">🧩 Repo Brick Map</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('repo-brick-map.html')" data-href="repo-brick-map.html">☆</button></a>
    </div>
  </div>

  <!-- WIP -->
  <div class="chub-dd" id="chubDDwip">
    <button class="chub-btn" style="color:#64748b;border-color:rgba(100,116,139,.35)" onclick="chubToggleDD(event,'chubDDwip')">WIP ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="discipline-map.html" target="_blank" data-href="discipline-map.html" style="opacity:.7"><span class="ci-txt">🗺 Discipline Map</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('discipline-map.html')" data-href="discipline-map.html">☆</button></a>
      <a class="chub-item" href="level-chart-demo.html" target="_blank" data-href="level-chart-demo.html" style="opacity:.7"><span class="ci-txt">🧱 Level Chart Demo</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('level-chart-demo.html')" data-href="level-chart-demo.html">☆</button></a>
      <a class="chub-item" href="entry-trigger-lab.html" target="_blank" data-href="entry-trigger-lab.html" style="opacity:.7"><span class="ci-txt">🎯 Entry Trigger Lab</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('entry-trigger-lab.html')" data-href="entry-trigger-lab.html">☆</button></a>
      <a class="chub-item" href="asia-npoc-confluence.html" target="_blank" data-href="asia-npoc-confluence.html" style="opacity:.7"><span class="ci-txt">🧭 Asia NPOC Confluence</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('asia-npoc-confluence.html')" data-href="asia-npoc-confluence.html">☆</button></a>
    </div>
  </div>


  <!-- Archived — null results, superseded versions, stubs (see MD files/SITE_MAP.md) -->
  <div class="chub-dd" id="chubDDarchive">
    <button class="chub-btn" style="color:#6b7280;border-color:rgba(107,114,128,.35)" onclick="chubToggleDD(event,'chubDDarchive')">🗄 Archived ▾</button>
    <div class="chub-menu">
      <a class="chub-item" href="analogml-backtest.html" target="_blank" data-href="analogml-backtest.html"><span class="ci-txt">🧬 AnalogML BT (null — k-NN retired)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('analogml-backtest.html')" data-href="analogml-backtest.html">☆</button></a>
      <a class="chub-item" href="backtest-monitor.html" target="_blank" data-href="backtest-monitor.html"><span class="ci-txt">🖥 BT Monitor (moved → Bot Config)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('backtest-monitor.html')" data-href="backtest-monitor.html">☆</button></a>
      <a class="chub-item" href="backtest.html" target="_blank" data-href="backtest.html"><span class="ci-txt">📈 Backtest Engine (legacy)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('backtest.html')" data-href="backtest.html">☆</button></a>
      <a class="chub-item" href="claude-backtest.html" target="_blank" data-href="claude-backtest.html"><span class="ci-txt">🔬 Claude BT (→ Strategy Lab)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('claude-backtest.html')" data-href="claude-backtest.html">☆</button></a>
      <a class="chub-item" href="credit-stress.html" target="_blank" data-href="credit-stress.html"><span class="ci-txt">🚦 Credit Stress (null gate)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('credit-stress.html')" data-href="credit-stress.html">☆</button></a>
      <a class="chub-item" href="econ-trend.html" target="_blank" data-href="econ-trend.html"><span class="ci-txt">🌍 Econ Trend (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('econ-trend.html')" data-href="econ-trend.html">☆</button></a>
      <a class="chub-item" href="hedge-backtest.html" target="_blank" data-href="hedge-backtest.html"><span class="ci-txt">📊 Hedge BT v1 (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('hedge-backtest.html')" data-href="hedge-backtest.html">☆</button></a>
      <a class="chub-item" href="hedge-signals.html" target="_blank" data-href="hedge-signals.html"><span class="ci-txt">⚡ Signals v1 (null — use v2)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('hedge-signals.html')" data-href="hedge-signals.html">☆</button></a>
      <a class="chub-item" href="hurst-bench.html" target="_blank" data-href="hurst-bench.html"><span class="ci-txt">🔬 Hurst A/B (dropped)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('hurst-bench.html')" data-href="hurst-bench.html">☆</button></a>
      <a class="chub-item" href="indexv2.html" target="_blank" data-href="indexv2.html"><span class="ci-txt">📊 Market State v2 (superseded)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('indexv2.html')" data-href="indexv2.html">☆</button></a>
      <a class="chub-item" href="layer2-vol-audit.html" target="_blank" data-href="layer2-vol-audit.html"><span class="ci-txt">🔬 Layer 2 Vol Audit (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('layer2-vol-audit.html')" data-href="layer2-vol-audit.html">☆</button></a>
      <a class="chub-item" href="macro-direction.html" target="_blank" data-href="macro-direction.html"><span class="ci-txt">🧭 Macro Direction (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('macro-direction.html')" data-href="macro-direction.html">☆</button></a>
      <a class="chub-item" href="max-copier-backtest.html" target="_blank" data-href="max-copier-backtest.html"><span class="ci-txt">🧺 Max Copier BT (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('max-copier-backtest.html')" data-href="max-copier-backtest.html">☆</button></a>
      <a class="chub-item" href="nq-qmr-backtest.html" target="_blank" data-href="nq-qmr-backtest.html"><span class="ci-txt">⚡ NQ-QMR (retired 2026-07-29)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('nq-qmr-backtest.html')" data-href="nq-qmr-backtest.html">☆</button></a>
      <a class="chub-item" href="nq-qmr-backtest.legacy.html" target="_blank" data-href="nq-qmr-backtest.legacy.html"><span class="ci-txt">⚡ NQ-QMR legacy BT (void)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('nq-qmr-backtest.legacy.html')" data-href="nq-qmr-backtest.legacy.html">☆</button></a>
      <a class="chub-item" href="overnight-hold-backtest.html" target="_blank" data-href="overnight-hold-backtest.html"><span class="ci-txt">🌙 Overnight Hold BT (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('overnight-hold-backtest.html')" data-href="overnight-hold-backtest.html">☆</button></a>
      <a class="chub-item" href="poi-reaction-backtest.html" target="_blank" data-href="poi-reaction-backtest.html"><span class="ci-txt">🎯 POI-Reaction BT (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('poi-reaction-backtest.html')" data-href="poi-reaction-backtest.html">☆</button></a>
      <a class="chub-item" href="range-ext-backtest.html" target="_blank" data-href="range-ext-backtest.html"><span class="ci-txt">📏 Range-Ext BT brain (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('range-ext-backtest.html')" data-href="range-ext-backtest.html">☆</button></a>
      <a class="chub-item" href="results.html" target="_blank" data-href="results.html"><span class="ci-txt">📄 Hedge v1 Tearsheet (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('results.html')" data-href="results.html">☆</button></a>
      <a class="chub-item" href="sltp-distribution.html" target="_blank" data-href="sltp-distribution.html"><span class="ci-txt">🎯 SL/TP Distribution (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('sltp-distribution.html')" data-href="sltp-distribution.html">☆</button></a>
      <a class="chub-item" href="system-fx-carry.html" target="_blank" data-href="system-fx-carry.html"><span class="ci-txt">📊 P4 JPY Spot Proxy (→ Carry Factor)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-fx-carry.html')" data-href="system-fx-carry.html">☆</button></a>
      <a class="chub-item" href="system-fx-momentum.html" target="_blank" data-href="system-fx-momentum.html"><span class="ci-txt">📊 P5 FX Momentum (→ Trend Basket)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('system-fx-momentum.html')" data-href="system-fx-momentum.html">☆</button></a>
      <a class="chub-item" href="trend-ema-ab.html" target="_blank" data-href="trend-ema-ab.html"><span class="ci-txt">📈 EMA vs Momentum A/B (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trend-ema-ab.html')" data-href="trend-ema-ab.html">☆</button></a>
      <a class="chub-item" href="trend.html" target="_blank" data-href="trend.html"><span class="ci-txt">📈 Trend-Following (→ Trend v2)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('trend.html')" data-href="trend.html">☆</button></a>
      <a class="chub-item" href="vol-forecast.html" target="_blank" data-href="vol-forecast.html"><span class="ci-txt">📐 Vol Forecast v1 (→ v2)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vol-forecast.html')" data-href="vol-forecast.html">☆</button></a>
      <a class="chub-item" href="volatility-classifier-standalone.html" target="_blank" data-href="volatility-classifier-standalone.html"><span class="ci-txt">🔬 Vol Classifier standalone (orphan)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('volatility-classifier-standalone.html')" data-href="volatility-classifier-standalone.html">☆</button></a>
      <a class="chub-item" href="vumanchu-fade.html" target="_blank" data-href="vumanchu-fade.html"><span class="ci-txt">🌊 VuManChu Fade (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vumanchu-fade.html')" data-href="vumanchu-fade.html">☆</button></a>
      <a class="chub-item" href="vwap-reversion.html" target="_blank" data-href="vwap-reversion.html"><span class="ci-txt">📉 VWAP Reversion BT (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('vwap-reversion.html')" data-href="vwap-reversion.html">☆</button></a>
      <a class="chub-item" href="zscore-v2.html" target="_blank" data-href="zscore-v2.html"><span class="ci-txt">⚡ Yield Z-Score v2 (null)</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav('zscore-v2.html')" data-href="zscore-v2.html">☆</button></a>
    </div>
  </div>

  <button id="scratchBtn" onclick="scratchOpen()" title="Personal notes, synced across devices">📝 Notes</button>
  <button id="navEditBtn" onclick="navEditOpen()" title="Drag shortcuts between categories">✏️ Edit Nav</button>

`;
  }

  if (!document.getElementById('navEditOverlay')) {
    document.body.insertAdjacentHTML('beforeend', `
<div id="navEditOverlay" onclick="if(event.target===this)navEditClose()">
  <div id="navEditModal">
    <div id="navEditHead">
      <h3>Edit Nav</h3>
      <span id="navEditHint">Drag shortcuts to reorder or move to another category · saves to your account, same layout on every device</span>
    </div>
    <div id="navEditBody"></div>
    <div id="navEditFoot">
      <button class="ne-btn danger" onclick="navEditReset()">Reset to Default</button>
      <button class="ne-btn" onclick="navEditClose()">Cancel</button>
      <button class="ne-btn primary" id="navEditSaveBtn" onclick="navEditSave()">Save</button>
    </div>
  </div>
</div>
`);
  }

  var FAV_KEY='macrofx_favs';
  var LAYOUT_CACHE_KEY='macrofx_nav_layout_cache';
  function cGet(){try{return JSON.parse(localStorage.getItem(FAV_KEY)||'[]')}catch(e){return[]}}
  function cSet(f){try{localStorage.setItem(FAV_KEY,JSON.stringify(f))}catch(e){}}

  window.chubToggleDD=function(e,id){
    e.stopPropagation();
    document.querySelectorAll('#commandHub .chub-dd.open').forEach(function(d){if(d.id!==id)d.classList.remove('open');});
    document.getElementById(id).classList.toggle('open');
  };
  document.addEventListener('click',function(){
    document.querySelectorAll('#commandHub .chub-dd.open').forEach(function(d){d.classList.remove('open');});
  });

  window.chubToggleFav=function(href){
    var f=cGet(),i=f.indexOf(href);
    if(i>=0)f.splice(i,1);else f.push(href);
    cSet(f);cStars();cFavs();
  };

  function cStars(){
    var f=cGet();
    document.querySelectorAll('#commandHub .chub-star[data-href]').forEach(function(b){
      var s=f.indexOf(b.dataset.href)>=0;
      b.textContent=s?'★':'☆';b.classList.toggle('starred',s);
    });
  }

  function cFavs(){
    var f=cGet();
    var dd=document.getElementById('chubFavDD');
    var menu=document.getElementById('chubFavMenu');
    if(!dd||!menu)return;
    if(!f.length){dd.style.display='none';return;}
    dd.style.display='inline-block';
    var data={};
    document.querySelectorAll('#commandHub .chub-dd:not(#chubFavDD) .chub-item[data-href]').forEach(function(a){
      var h=a.dataset.href;
      if(h&&!data[h]){var t=a.querySelector('.ci-txt');data[h]={href:h,text:t?t.textContent:h};}
    });
    menu.innerHTML=f.map(function(h){
      var d=data[h];if(!d)return'';
      return'<a class="chub-item" href="'+h+'" target="_blank" data-href="'+h+'"><span class="ci-txt">'+d.text+'</span><button class="chub-star starred" onclick="event.preventDefault();event.stopPropagation();chubToggleFav(\''+h+'\')" data-href="'+h+'">★</button></a>';
    }).filter(Boolean).join('');
  }

  // ── Reorganizable nav layout ────────────────────────────────────────────
  // The HTML above is the DEFAULT grouping. A user can drag shortcuts between
  // categories via "Edit Nav"; the resulting {category -> [href,...]} map is
  // saved to KV (server.js /api/nav-layout) so it follows the user across
  // browsers/devices, with a localStorage copy for instant paint + offline use.
  var CATS=['chubDDlive','chubDDvol','chubDDfxbt','chubDDresearch','chubDDequity','chubDDgold','chubDDsystems','chubDDedu','chubDDwip','chubDDarchive'];
  var CAT_META={
    chubDDlive:{label:'Live',color:'#10b981'},
    chubDDvol:{label:'Vol',color:'#4f7df0'},
    chubDDfxbt:{label:'FX BT',color:'#8b5cf6'},
    chubDDresearch:{label:'Research',color:'#f59e0b'},
    chubDDequity:{label:'Equity',color:'#06b6d4'},
    chubDDgold:{label:'Gold',color:'#eab308'},
    chubDDsystems:{label:'Systems',color:'#14b8a6'},
    chubDDedu:{label:'Learn',color:'#a78bfa'},
    chubDDwip:{label:'WIP',color:'#64748b'},
    chubDDarchive:{label:'Archived',color:'#6b7280'}
  };
  var registry={};       // href -> {text}
  var defaultLayout={};  // catId -> [href,...] as hardcoded above
  var curLayout=null;    // catId -> [href,...] currently rendered

  function scrapeDefaults(){
    CATS.forEach(function(catId){
      var menu=document.querySelector('#'+catId+' .chub-menu');
      defaultLayout[catId]=[];
      if(!menu)return;
      menu.querySelectorAll('.chub-item[data-href]').forEach(function(a){
        var href=a.dataset.href;
        var t=a.querySelector('.ci-txt');
        registry[href]={text:t?t.textContent:href};
        defaultLayout[catId].push(href);
      });
    });
  }

  // Saved layout wins for hrefs it still knows about; any href that's new
  // (added to the page since the layout was last saved) or unrecognised in
  // the saved map falls back to its hardcoded default category.
  function resolveLayout(saved){
    var placed={},result={};
    CATS.forEach(function(catId){
      result[catId]=((saved&&saved[catId])||[]).filter(function(h){return registry[h]&&!placed[h];});
      result[catId].forEach(function(h){placed[h]=true;});
    });
    CATS.forEach(function(catId){
      defaultLayout[catId].forEach(function(h){
        if(!placed[h]){result[catId].push(h);placed[h]=true;}
      });
    });
    return result;
  }

  function itemHtml(href){
    var d=registry[href];if(!d)return'';
    return '<a class="chub-item" href="'+href+'" target="_blank" data-href="'+href+'"><span class="ci-txt">'+d.text+'</span><button class="chub-star" onclick="event.preventDefault();event.stopPropagation();chubToggleFav(\''+href.replace(/'/g,"\\'")+'\')" data-href="'+href+'">☆</button></a>';
  }

  function renderMenus(layout){
    curLayout=layout;
    CATS.forEach(function(catId){
      var menu=document.querySelector('#'+catId+' .chub-menu');
      if(!menu)return;
      menu.innerHTML=(layout[catId]||[]).map(itemHtml).join('');
    });
    cStars();cFavs();
  }

  function cacheLayout(l){try{localStorage.setItem(LAYOUT_CACHE_KEY,JSON.stringify(l))}catch(e){}}
  function cachedLayout(){try{return JSON.parse(localStorage.getItem(LAYOUT_CACHE_KEY)||'null')}catch(e){return null}}

  async function loadAndRender(){
    scrapeDefaults();
    renderMenus(resolveLayout(cachedLayout()));
    try{
      var r=await fetch('/api/nav-layout');
      var j=await r.json();
      if(j&&j.ok){
        renderMenus(resolveLayout(j.layout));
        cacheLayout(j.layout||null);
      }
    }catch(e){/* offline — keep cached/default rendering above */}
  }

  // ── Edit-mode modal (drag shortcuts between category columns) ───────────
  var dragEl=null;

  function buildEditBody(layout){
    var body=document.getElementById('navEditBody');
    body.innerHTML='';
    CATS.forEach(function(catId){
      var meta=CAT_META[catId];
      var col=document.createElement('div');
      col.className='ne-col';
      col.dataset.cat=catId;
      col.innerHTML='<div class="ne-col-hd" style="color:'+meta.color+'">'+meta.label+'</div><div class="ne-col-list"></div>';
      var list=col.querySelector('.ne-col-list');
      (layout[catId]||[]).forEach(function(href){
        var d=registry[href];if(!d)return;
        var it=document.createElement('div');
        it.className='ne-item';
        it.draggable=true;
        it.dataset.href=href;
        it.textContent=d.text;
        it.addEventListener('dragstart',function(e){
          dragEl=it;
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('text/plain',href);
          setTimeout(function(){it.classList.add('dragging');},0);
        });
        it.addEventListener('dragend',function(){it.classList.remove('dragging');dragEl=null;});
        list.appendChild(it);
      });
      list.addEventListener('dragover',function(e){
        e.preventDefault();
        if(!dragEl)return;
        var after=Array.from(list.querySelectorAll('.ne-item:not(.dragging)')).find(function(el){
          var r=el.getBoundingClientRect();
          return e.clientY<r.top+r.height/2;
        });
        if(after)list.insertBefore(dragEl,after);
        else list.appendChild(dragEl);
      });
      body.appendChild(col);
    });
  }

  window.navEditOpen=function(){
    buildEditBody(curLayout||resolveLayout(null));
    document.getElementById('navEditOverlay').classList.add('open');
  };
  window.navEditClose=function(){
    document.getElementById('navEditOverlay').classList.remove('open');
  };
  window.navEditReset=function(){
    buildEditBody(defaultLayout);
  };
  window.navEditSave=async function(){
    var layout={};
    document.querySelectorAll('#navEditBody .ne-col').forEach(function(col){
      layout[col.dataset.cat]=Array.from(col.querySelectorAll('.ne-item')).map(function(it){return it.dataset.href;});
    });
    renderMenus(layout);
    cacheLayout(layout);
    navEditClose();
    var btn=document.getElementById('navEditBtn');
    try{
      var r=await fetch('/api/nav-layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layout:layout})});
      var j=await r.json();
      if(!j||!j.ok)throw new Error(j&&j.error||'save failed');
    }catch(e){
      console.error('[nav-layout] sync to server failed, saved locally only:',e);
      var orig=btn.textContent;
      btn.textContent='⚠️ synced locally only';
      btn.style.color='#ef4444';
      setTimeout(function(){btn.textContent=orig;btn.style.color='';},4000);
    }
  };

  document.addEventListener('DOMContentLoaded',loadAndRender);
})();
