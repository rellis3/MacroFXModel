/**
 * BacktestViewer — pluggable full-screen chart viewer
 *
 * DataAdapter interface (pass as `adapter` config):
 *   fetchTrades()         → Promise<Trade[]>
 *   fetchCandles(trade)   → Promise<Candle[]>   // {time,open,high,low,close}
 *   getLevels(trade)      → {entry,tp,sl,hl75H,hl75L,ocH,ocL,open} | null
 *   getDetail?(trade)     → {volRegime, asiaRange, ...extra}
 *
 * Usage:
 *   const viewer = new BacktestViewer({ container: document.body, adapter: VOL_ADAPTER });
 *   viewer.init();
 */
class BacktestViewer {
  constructor({ container, adapter }) {
    this.container = container;
    this.adapter   = adapter;

    // Chart
    this._chart = null;
    this._cs    = null;   // candlestick series

    // Data
    this._allTrades  = [];
    this._filtTrades = [];
    this._idx        = -1;
    this._currentTrade = null;
    this._candles    = [];

    // Running capital (computed from pnl_pct chain)
    this._capitals   = [];

    // Overlay lines
    this._levelLines = [];
    this._fibLines   = [];

    // Replay
    this._replayMode        = false;
    this._replayCursor      = 0;
    this._replayStart       = 0;
    this._replayTimer       = null;
    this._replayEntryMarked = false;

    // UI state
    this._showLevels = true;
    this._autoScale  = true;
    this._fibMode    = false;
    this._fibAnchor  = null;
    this._fResult    = '';
    this._fDir       = '';
    this._loading    = false;

    // Bound handlers for cleanup
    this._boundChartClick = null;
    this._boundKeydown    = null;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async init() {
    this._render();
    this._initChart();
    this._bindKeys();
    await this._loadTrades();
  }

  destroy() {
    this._stopReplayTimer();
    if (this._boundKeydown) document.removeEventListener('keydown', this._boundKeydown);
    if (this._chart)        this._chart.remove();
    this.container.innerHTML = '';
  }

  // ── DOM Construction ─────────────────────────────────────────────────────────

  _render() {
    this.container.innerHTML = `
<div class="bv-root" id="bvRoot">
  <!-- Top toolbar -->
  <div class="bv-topbar">
    <span class="bv-title" id="bvTitle">Backtest Viewer</span>
    <div class="bv-ctrl-group">
      <span class="bv-lbl">Result</span>
      <select class="bv-sel" id="bvFResult">
        <option value="">All</option>
        <option value="win">Win</option>
        <option value="loss">Loss</option>
        <option value="open">Open</option>
      </select>
    </div>
    <div class="bv-ctrl-group">
      <span class="bv-lbl">Direction</span>
      <select class="bv-sel" id="bvFDir">
        <option value="">All</option>
        <option value="BUY">Buy</option>
        <option value="SELL">Sell</option>
      </select>
    </div>
    <div class="bv-ctrl-group bv-ctrl-btns">
      <button class="bv-btn" id="bvResetView">Reset View</button>
      <button class="bv-btn bv-active" id="bvAutoScale">Auto Scale</button>
      <button class="bv-btn bv-active" id="bvLevels">Levels</button>
      <button class="bv-btn" id="bvFib">Fib</button>
      <button class="bv-btn" id="bvClearFib">Clear Fib</button>
      <button class="bv-btn" id="bvReplayBtn">Replay</button>
    </div>
    <span class="bv-stat" id="bvStat"></span>
  </div>

  <!-- Replay bar (hidden until activated) -->
  <div class="bv-replay-bar" id="bvReplayBar" style="display:none">
    <button class="bv-btn bv-replay-play" id="bvPlayBtn">▶ Play</button>
    <button class="bv-btn" id="bvStepBtn">Step ▶|</button>
    <button class="bv-btn" id="bvResetBtn">⟲ Reset</button>
    <span class="bv-lbl">Speed</span>
    <select class="bv-sel" id="bvSpeed">
      <option value="800">0.5×</option>
      <option value="350" selected>1×</option>
      <option value="150">2×</option>
      <option value="50">4×</option>
    </select>
    <span class="bv-replay-stat" id="bvReplayStat"></span>
    <button class="bv-btn bv-exit-replay" id="bvExitReplay">✕ Exit Replay</button>
  </div>

  <!-- Main body: chart + right panel -->
  <div class="bv-body">
    <div class="bv-chart-wrap">
      <div class="bv-chart" id="bvChart"></div>
      <div class="bv-chart-veil" id="bvVeil">
        <div id="bvVeilMsg">Select a trade from the list →</div>
      </div>
    </div>

    <div class="bv-panel">
      <div class="bv-detail-card" id="bvDetailCard">
        <div class="bv-panel-hdr">TRADE DETAIL</div>
        <div class="bv-detail-body" id="bvDetailBody">
          <div class="bv-no-trade">No trade selected</div>
        </div>
      </div>
      <div class="bv-list-hdr">
        <span id="bvListCount">—</span>
        <div class="bv-nav-btns">
          <button class="bv-btn bv-sm" id="bvPrevBtn" title="Previous trade (←)">‹ Prev</button>
          <button class="bv-btn bv-sm" id="bvNextBtn" title="Next trade (→)">Next ›</button>
        </div>
      </div>
      <div class="bv-list" id="bvList"></div>
    </div>
  </div>

  <!-- Keyboard shortcut hint -->
  <div class="bv-hints">
    ← → Navigate &nbsp;·&nbsp; R Replay &nbsp;·&nbsp; Space Step &nbsp;·&nbsp; L Levels &nbsp;·&nbsp; F Fib
  </div>
</div>`;

    // Bind controls
    document.getElementById('bvFResult') .addEventListener('change', () => { this._fResult = document.getElementById('bvFResult').value; this._applyFilters(); });
    document.getElementById('bvFDir')    .addEventListener('change', () => { this._fDir    = document.getElementById('bvFDir').value;    this._applyFilters(); });
    document.getElementById('bvResetView').addEventListener('click', () => this._resetView());
    document.getElementById('bvAutoScale').addEventListener('click', () => this._toggleAutoScale());
    document.getElementById('bvLevels')  .addEventListener('click', () => this._toggleLevels());
    document.getElementById('bvFib')     .addEventListener('click', () => this._enterFibMode());
    document.getElementById('bvClearFib').addEventListener('click', () => this._clearFib());
    document.getElementById('bvReplayBtn').addEventListener('click', () => this._openReplay());
    document.getElementById('bvPlayBtn') .addEventListener('click', () => this._togglePlay());
    document.getElementById('bvStepBtn') .addEventListener('click', () => this._stepReplay());
    document.getElementById('bvResetBtn').addEventListener('click', () => this._resetReplay());
    document.getElementById('bvExitReplay').addEventListener('click', () => this._closeReplay());
    document.getElementById('bvSpeed')   .addEventListener('change', e => {
      this._replaySpeed = +e.target.value;
      if (this._replayTimer) { this._stopReplayTimer(); this._startReplayTimer(); }
    });
    document.getElementById('bvPrevBtn').addEventListener('click', () => this._prevTrade());
    document.getElementById('bvNextBtn').addEventListener('click', () => this._nextTrade());

    // List click delegation
    document.getElementById('bvList').addEventListener('click', e => {
      const row = e.target.closest('.bv-row');
      if (row) this._selectTrade(+row.dataset.idx);
    });

    this._replaySpeed = 350;
  }

  // ── Chart Initialisation ─────────────────────────────────────────────────────

  _initChart() {
    const el = document.getElementById('bvChart');
    if (!el || !window.LightweightCharts) return;

    this._chart = LightweightCharts.createChart(el, {
      autoSize:  true,
      layout:    { background: { color: '#131722' }, textColor: '#d1d4dc' },
      grid:      { vertLines: { color: '#1c2133' }, horzLines: { color: '#1c2133' } },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a3348' },
      timeScale: { borderColor: '#2a3348', timeVisible: true, secondsVisible: false },
    });

    this._cs = this._chart.addCandlestickSeries({
      upColor:        '#26a69a', downColor:        '#ef5350',
      borderUpColor:  '#26a69a', borderDownColor:  '#ef5350',
      wickUpColor:    '#26a69a', wickDownColor:    '#ef5350',
    });

    this._boundChartClick = p => this._handleChartClick(p);
    this._chart.subscribeClick(this._boundChartClick);
  }

  // ── Data Loading ─────────────────────────────────────────────────────────────

  async _loadTrades() {
    this._setVeil('Loading trades…');
    try {
      this._allTrades = await this.adapter.fetchTrades();
      this._buildCapitals();
      this._applyFilters();
      this._setVeil('Select a trade from the list →');
    } catch (e) {
      this._setVeil('Error loading trades: ' + e.message);
    }
  }

  _buildCapitals() {
    let cap = 100000;
    this._capitals = this._allTrades.map(t => {
      cap = cap * (1 + (t.pnl_pct || 0) / 100);
      return Math.round(cap);
    });
  }

  _applyFilters() {
    this._filtTrades = this._allTrades.filter(t => {
      if (this._fResult && t.outcome !== this._fResult) return false;
      if (this._fDir    && t.side    !== this._fDir)    return false;
      return true;
    });
    // Build filtered capitals from filtered subset of trades
    this._filtCapitals = (() => {
      let cap = 100000;
      return this._filtTrades.map(t => {
        cap = cap * (1 + (t.pnl_pct || 0) / 100);
        return Math.round(cap);
      });
    })();
    this._renderList();
    this._updateStats();
  }

  _updateStats() {
    const n    = this._filtTrades.length;
    const wins = this._filtTrades.filter(t => t.outcome === 'win').length;
    const wr   = n ? (wins / n * 100).toFixed(1) : '—';
    document.getElementById('bvStat').textContent      = `${n.toLocaleString()} trades · Win ${wr}%`;
    document.getElementById('bvListCount').textContent = `${n.toLocaleString()} trades`;
  }

  // ── Trade Selection ──────────────────────────────────────────────────────────

  async _selectTrade(idx) {
    if (idx < 0 || idx >= this._filtTrades.length || this._loading) return;
    this._loading = true;

    this._closeReplay(/* silent */ true);

    const trade = this._filtTrades[idx];
    this._idx          = idx;
    this._currentTrade = trade;

    // Highlight row + scroll into view
    document.querySelectorAll('.bv-row').forEach(r => r.classList.remove('bv-selected'));
    const row = document.querySelector(`.bv-row[data-idx="${idx}"]`);
    if (row) { row.classList.add('bv-selected'); row.scrollIntoView({ block: 'nearest' }); }

    // Title
    document.getElementById('bvTitle').textContent =
      `${trade.instrument} M1 — Backtest Viewer`;

    this._setVeil('Loading M1 data…', true);

    try {
      const raw = await this.adapter.fetchCandles(trade);
      this._candles = raw.map(b => ({
        time:  this._toEpochSec(b.time),
        open:  b.open, high: b.high, low: b.low, close: b.close,
      }));
      this._renderChartFull();
      this._renderDetail(trade, idx);
      this._hideVeil();
    } catch (e) {
      this._setVeil('No M1 data — ' + e.message);
    }

    this._loading = false;
  }

  _prevTrade() { this._selectTrade(this._idx - 1); }
  _nextTrade() { this._selectTrade(this._idx + 1); }

  // ── Chart Rendering ──────────────────────────────────────────────────────────

  _renderChartFull() {
    if (!this._cs) return;
    this._cs.setData(this._candles);
    this._clearLevelLines();
    if (this._showLevels) this._renderLevels(this._currentTrade);
    this._renderMarkers(this._currentTrade);
    if (this._autoScale) this._cs.priceScale().applyOptions({ autoScale: true });
    this._zoomToTrade(this._currentTrade);
  }

  _renderLevels(trade) {
    if (!this._cs || !this._showLevels) return;
    const lvl = this.adapter.getLevels(trade);
    if (!lvl) return;

    const LS  = LightweightCharts.LineStyle;
    const add = (price, color, title, style) => {
      if (price == null) return null;
      return this._cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    };

    this._levelLines = [
      add(lvl.open,  '#6b7280', 'Open',   LS.Solid),
      add(lvl.hl75H, '#fbbf24', 'HL75↑',  LS.Dashed),
      add(lvl.hl75L, '#fbbf24', 'HL75↓',  LS.Dashed),
      add(lvl.ocH,   '#4f7df0', 'OC↑',    LS.Dashed),
      add(lvl.ocL,   '#4f7df0', 'OC↓',    LS.Dashed),
      add(lvl.entry, trade.side === 'SELL' ? '#ef5350' : '#26a69a', 'Entry', LS.Solid),
      add(lvl.tp,    '#26a69a', 'TP',      LS.Dotted),
      add(lvl.sl,    '#ef5350', 'SL',      LS.Dotted),
    ].filter(Boolean);
  }

  _clearLevelLines() {
    if (!this._cs) return;
    this._levelLines.forEach(l => { try { this._cs.removePriceLine(l); } catch {} });
    this._levelLines = [];
  }

  _renderMarkers(trade, replayUpTo = null) {
    if (!this._cs) return;
    const isSell = trade.side === 'SELL';
    const markers = [];

    if (trade.fill_time) {
      const ts = this._toEpochSec(trade.fill_time);
      if (replayUpTo == null || ts <= replayUpTo) {
        markers.push({
          time: ts, size: 1,
          position: isSell ? 'aboveBar' : 'belowBar',
          color:    isSell ? '#ef5350'  : '#26a69a',
          shape:    isSell ? 'arrowDown': 'arrowUp',
          text:     trade.side,
        });
      }
    }

    if (trade.exit_time && replayUpTo == null) {
      const ts  = this._toEpochSec(trade.exit_time);
      const win = trade.outcome === 'win';
      markers.push({
        time: ts, size: 0.6,
        position: isSell ? 'belowBar' : 'aboveBar',
        color:    win ? '#26a69a' : '#ef5350',
        shape:    'circle',
        text:     (trade.outcome || '').toUpperCase(),
      });
    }

    this._cs.setMarkers(markers.sort((a, b) => a.time - b.time));
  }

  _zoomToTrade(trade) {
    if (!this._chart || !trade.date) return;
    const dayStart = this._toEpochSec(trade.date + 'T00:00:00');
    this._chart.timeScale().setVisibleRange({
      from: dayStart - 3 * 3600,
      to:   dayStart + 27 * 3600,
    });
  }

  // ── Trade Detail Panel ───────────────────────────────────────────────────────

  _renderDetail(trade, idx) {
    const lvl    = this.adapter.getLevels(trade);
    const extra  = this.adapter.getDetail ? this.adapter.getDetail(trade) : {};
    const isSell = trade.side === 'SELL';
    const capital = this._filtCapitals[idx];

    const row = (lbl, val, cls = '') =>
      `<div class="bv-dr"><span class="bv-dl">${lbl}</span><span class="bv-dv ${cls}">${val ?? '—'}</span></div>`;

    const dirBadge = `<span class="bv-badge ${isSell ? 'sell' : 'buy'}">${trade.side}</span>`;
    const rgBadge  = `<span class="bv-badge rg-${(trade.regime || '').toLowerCase()}">${trade.regime || '—'}</span>`;

    const outcomeColor = trade.outcome === 'win' ? 'bv-green' : trade.outcome === 'loss' ? 'bv-red' : 'bv-amber';
    const pnlColor     = (trade.pnl_pct || 0) >= 0 ? 'bv-green' : 'bv-red';
    const pnlStr       = trade.pnl_pct != null
      ? `${trade.pnl_pct >= 0 ? '+' : ''}${trade.pnl_pct.toFixed(4)}%`
      : '—';

    const fillTime = trade.fill_time
      ? new Date(String(trade.fill_time).substring(0,19).replace(' ','T') + 'Z').toISOString().substring(11, 16)
      : '—';

    const asiaRange = extra.asiaRange || (trade.asia_low && trade.asia_high
      ? `${(+trade.asia_low).toFixed(5)} – ${(+trade.asia_high).toFixed(5)}`
      : '—');

    document.getElementById('bvDetailBody').innerHTML = [
      row('Date',       trade.date),
      row('Direction',  dirBadge),
      row('Entry px',   lvl ? lvl.entry.toFixed(5) : trade.open?.toFixed(5)),
      row('Entry time', fillTime),
      row('SL',         lvl?.sl?.toFixed(5), 'bv-red'),
      row('TP',         lvl?.tp?.toFixed(5), 'bv-green'),
      row('SD Level',   trade.hl_75_pct?.toFixed(2) ?? extra.sdLevel),
      row('Vol Regime', extra.volRegime || trade.vol_regime || '—'),
      row('Asia range', asiaRange),
      row('Regime',     rgBadge),
      row('Leg',        trade.leg || '—'),
      row('P&L',        pnlStr, pnlColor),
      row('Result',     `<span class="${outcomeColor}">${trade.outcome || '—'}</span>`),
      row('Capital',    capital ? `$${capital.toLocaleString()}` : '—'),
    ].join('');
  }

  // ── Trade List ───────────────────────────────────────────────────────────────

  _renderList() {
    const list = document.getElementById('bvList');
    if (!list) return;

    list.innerHTML = this._filtTrades.map((t, i) => {
      const isSell = t.side === 'SELL';
      const isWin  = t.outcome === 'win';
      const isLoss = t.outcome === 'loss';
      const pnlStr = t.pnl_pct != null
        ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(1)}%`
        : '';
      const pnlCls = isWin ? 'bv-green' : isLoss ? 'bv-red' : 'bv-amber';
      const selCls = i === this._idx ? ' bv-selected' : '';

      return `<div class="bv-row${selCls}" data-idx="${i}">
        <span class="bv-row-date">${t.date || '—'}</span>
        <span class="bv-badge ${isSell ? 'sell' : 'buy'}">${t.side}</span>
        <span class="bv-row-px">${(t.open || 0).toFixed(4)}</span>
        <span class="bv-outcome ${t.outcome || ''}">${(t.outcome || '').toUpperCase()}</span>
        <span class="bv-row-pnl ${pnlCls}">${pnlStr}</span>
      </div>`;
    }).join('');
  }

  // ── Replay Mode ──────────────────────────────────────────────────────────────

  _openReplay() {
    if (!this._currentTrade || !this._candles.length) return;
    this._replayMode = false;

    // Find bar just before fill_time, or start 30 bars before midpoint
    const trade  = this._currentTrade;
    const fillTs = trade.fill_time ? this._toEpochSec(trade.fill_time) : null;
    let entryIdx = fillTs ? this._candles.findIndex(c => c.time >= fillTs) : -1;
    if (entryIdx < 0) entryIdx = Math.floor(this._candles.length / 2);

    this._replayStart       = Math.max(0, entryIdx - 30);
    this._replayCursor      = this._replayStart;
    this._replayEntryMarked = false;
    this._replayMode        = true;

    document.getElementById('bvReplayBar').style.display = '';
    document.getElementById('bvPlayBtn').textContent = '▶ Play';

    // Show candles up to replay start
    this._cs.setData(this._candles.slice(0, this._replayCursor));
    this._clearLevelLines();
    this._cs.setMarkers([]);
    this._updateReplayStat();

    // Zoom to trade day
    this._zoomToTrade(trade);
  }

  _closeReplay(silent = false) {
    if (!this._replayMode && !silent) return;
    this._stopReplayTimer();
    this._replayMode = false;
    document.getElementById('bvReplayBar').style.display = 'none';
    if (!silent && this._currentTrade && this._candles.length) {
      this._renderChartFull();
    }
  }

  _togglePlay() {
    const btn = document.getElementById('bvPlayBtn');
    if (this._replayTimer) {
      this._stopReplayTimer();
      btn.textContent = '▶ Play';
    } else {
      this._startReplayTimer();
      btn.textContent = '⏸ Pause';
    }
  }

  _startReplayTimer() {
    this._replayTimer = setInterval(() => this._stepReplay(), this._replaySpeed);
  }

  _stopReplayTimer() {
    if (this._replayTimer) { clearInterval(this._replayTimer); this._replayTimer = null; }
  }

  _stepReplay() {
    if (!this._replayMode) return;
    if (this._replayCursor >= this._candles.length) {
      this._stopReplayTimer();
      document.getElementById('bvPlayBtn').textContent = '▶ Play';
      return;
    }

    this._cs.update(this._candles[this._replayCursor]);
    this._replayCursor++;

    // Reveal entry arrow when we pass the fill time
    const trade  = this._currentTrade;
    const fillTs = trade?.fill_time ? this._toEpochSec(trade.fill_time) : null;
    if (fillTs && !this._replayEntryMarked) {
      const curr = this._candles[this._replayCursor - 1];
      if (curr && curr.time >= fillTs) {
        this._replayEntryMarked = true;
        this._renderMarkers(trade, curr.time);
        if (this._showLevels) this._renderLevels(trade);
      }
    }

    this._updateReplayStat();
  }

  _resetReplay() {
    this._stopReplayTimer();
    document.getElementById('bvPlayBtn').textContent = '▶ Play';
    this._replayCursor      = this._replayStart;
    this._replayEntryMarked = false;
    this._cs.setData(this._candles.slice(0, this._replayCursor));
    this._clearLevelLines();
    this._cs.setMarkers([]);
    this._updateReplayStat();
  }

  _updateReplayStat() {
    const el = document.getElementById('bvReplayStat');
    if (!el) return;
    const cur  = this._replayCursor;
    const tot  = this._candles.length;
    const bar  = this._candles[Math.max(0, cur - 1)];
    const time = bar ? new Date(bar.time * 1000).toISOString().substring(0, 16) + 'Z' : '';
    el.textContent = `Bar ${cur} / ${tot}  ${time}`;
  }

  // ── Fibonacci Drawing ────────────────────────────────────────────────────────

  _enterFibMode() {
    this._fibAnchor = null;
    this._fibMode   = true;
    document.getElementById('bvFib').classList.add('bv-active');
    document.getElementById('bvChart').style.cursor = 'crosshair';
  }

  _exitFibMode() {
    this._fibMode   = false;
    this._fibAnchor = null;
    document.getElementById('bvFib').classList.remove('bv-active');
    document.getElementById('bvChart').style.cursor = '';
  }

  _handleChartClick(param) {
    if (!this._fibMode || !this._cs || !param.point) return;
    const price = this._cs.coordinateToPrice(param.point.y);
    if (price == null) return;

    if (!this._fibAnchor) {
      this._fibAnchor = price;
    } else {
      this._drawFib(this._fibAnchor, price);
      this._exitFibMode();
    }
  }

  _drawFib(priceA, priceB) {
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const colors = ['#ef5350', '#f97316', '#fbbf24', '#e2e8f0', '#4f7df0', '#a78bfa', '#26a69a'];
    const LS     = LightweightCharts.LineStyle;

    ratios.forEach((r, i) => {
      const price = priceA + (priceB - priceA) * r;
      const line  = this._cs.createPriceLine({
        price,
        color:            colors[i],
        lineWidth:        1,
        lineStyle:        LS.Dashed,
        axisLabelVisible: true,
        title:            `${(r * 100).toFixed(1)}%`,
      });
      this._fibLines.push(line);
    });
  }

  _clearFib() {
    if (!this._cs) return;
    this._fibLines.forEach(l => { try { this._cs.removePriceLine(l); } catch {} });
    this._fibLines = [];
    if (this._fibMode) this._exitFibMode();
  }

  // ── UI Toggles ───────────────────────────────────────────────────────────────

  _resetView() {
    if (this._currentTrade) this._zoomToTrade(this._currentTrade);
  }

  _toggleAutoScale() {
    this._autoScale = !this._autoScale;
    document.getElementById('bvAutoScale').classList.toggle('bv-active', this._autoScale);
    if (this._cs) this._cs.priceScale().applyOptions({ autoScale: this._autoScale });
  }

  _toggleLevels() {
    this._showLevels = !this._showLevels;
    document.getElementById('bvLevels').classList.toggle('bv-active', this._showLevels);
    if (!this._currentTrade) return;
    if (this._showLevels) this._renderLevels(this._currentTrade);
    else                  this._clearLevelLines();
  }

  // ── Keyboard Navigation ──────────────────────────────────────────────────────

  _bindKeys() {
    this._boundKeydown = e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this._prevTrade(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this._nextTrade(); }
      if (e.key === 'r' || e.key === 'R') this._openReplay();
      if (e.key === ' ' && this._replayMode) { e.preventDefault(); this._stepReplay(); }
      if (e.key === 'l' || e.key === 'L') this._toggleLevels();
      if (e.key === 'f' || e.key === 'F') this._enterFibMode();
      if (e.key === 'Escape') {
        if (this._fibMode)   this._exitFibMode();
        if (this._replayMode) this._closeReplay();
      }
    };
    document.addEventListener('keydown', this._boundKeydown);
  }

  // ── Veil (loading / empty state overlay) ────────────────────────────────────

  _setVeil(msg, spinner = false) {
    const veil = document.getElementById('bvVeil');
    const msg0 = document.getElementById('bvVeilMsg');
    if (msg0) msg0.textContent = msg;
    if (veil) {
      veil.style.display = '';
      veil.querySelector('.bv-spinner') && (veil.querySelector('.bv-spinner').style.display = spinner ? '' : 'none');
    }
  }

  _hideVeil() {
    const veil = document.getElementById('bvVeil');
    if (veil) veil.style.display = 'none';
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  _toEpochSec(t) {
    const s = String(t).substring(0, 19).replace(' ', 'T');
    return Math.floor(new Date(s + 'Z').getTime() / 1000);
  }
}
