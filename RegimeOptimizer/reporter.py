"""
reporter.py — Generates a standalone dark-themed HTML report from optimizer results.

Usage:
    python reporter.py results/EURUSD_20260607T120000.json
    # or called from optimizer.py --report flag
"""

import json
import sys
from pathlib import Path


_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>{bot_label} Optimizer Report — {pair}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#0d1117;color:#c9d1d9;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;line-height:1.5}}
  h1{{font-size:20px;padding:18px 24px;background:#161b22;border-bottom:1px solid #30363d;color:#f0f6fc}}
  h2{{font-size:13px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.06em;margin:20px 24px 8px}}
  .meta{{padding:8px 24px;background:#161b22;color:#8b949e;font-size:12px;border-bottom:1px solid #30363d}}
  .section{{margin:0 24px 24px}}
  /* Results table */
  table{{width:100%;border-collapse:collapse;font-size:12px}}
  th{{background:#161b22;color:#8b949e;padding:6px 10px;text-align:right;font-weight:500;border-bottom:1px solid #30363d;white-space:nowrap}}
  th:first-child,th:nth-child(2){{text-align:left}}
  td{{padding:5px 10px;border-bottom:1px solid #21262d;text-align:right;vertical-align:top}}
  td:first-child,td:nth-child(2){{text-align:left;font-weight:500}}
  tr:hover td{{background:#161b22}}
  .pos{{color:#3fb950}} .neg{{color:#f85149}} .neu{{color:#c9d1d9}}
  .split-hdr{{color:#8b949e;font-size:10px;display:block;margin-bottom:1px}}
  /* Equity chart grid */
  .chart-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:12px}}
  .chart-card{{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px}}
  .chart-title{{font-size:11px;color:#8b949e;margin-bottom:8px}}
  canvas{{width:100%!important;height:180px!important}}
  /* Importance bars */
  .imp-list{{display:flex;flex-direction:column;gap:5px}}
  .imp-row{{display:flex;align-items:center;gap:8px}}
  .imp-label{{width:180px;font-size:12px;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
  .imp-bar-bg{{flex:1;background:#21262d;border-radius:2px;height:12px}}
  .imp-bar-fill{{height:12px;border-radius:2px;background:#388bfd}}
  .imp-val{{width:45px;text-align:right;font-size:11px;color:#8b949e}}
  /* Config diff panel */
  .diff-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px}}
  .diff-item{{background:#161b22;border:1px solid #30363d;border-radius:4px;padding:8px 10px;font-size:12px}}
  .diff-key{{color:#8b949e;margin-bottom:2px}}
  .diff-val{{font-weight:600;color:#f0f6fc}}
  .diff-delta.up{{color:#3fb950}} .diff-delta.dn{{color:#f85149}} .diff-delta.no{{color:#8b949e}}
  /* Tabs */
  .tabs{{display:flex;gap:2px;margin:0 24px 0;border-bottom:1px solid #30363d}}
  .tab{{padding:7px 14px;cursor:pointer;border-radius:4px 4px 0 0;font-size:12px;font-weight:500;color:#8b949e;background:none;border:none;border-bottom:2px solid transparent}}
  .tab.active{{color:#f0f6fc;border-bottom-color:#388bfd;background:#161b22}}
  .tab-pane{{display:none}} .tab-pane.active{{display:block}}
</style>
</head>
<body>
<h1>{bot_label} Regime Optimizer Report — {pair}</h1>
<div class="meta">
  Generated: {generated_at} &nbsp;|&nbsp; Trials: {n_trials:,} &nbsp;|&nbsp;
  Data: {months_data}m &nbsp;|&nbsp;
  Train: {train_bars:,} bars &nbsp;|&nbsp; Val: {val_bars:,} bars &nbsp;|&nbsp; Test: {test_bars:,} bars
</div>

<div class="tabs" id="tabs">
  <button class="tab active" data-tab="overview">Overview</button>
  <button class="tab" data-tab="equity">Equity Curves</button>
  <button class="tab" data-tab="params">Best Config</button>
  <button class="tab" data-tab="importance">Param Importance</button>
</div>

<!-- OVERVIEW TAB -->
<div id="tab-overview" class="tab-pane active" style="margin-top:16px">
  <div class="section">
  <h2>Top 20 Results</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Trial</th>
      <th>Train Sh</th><th>Train WR</th><th>Train PF</th><th>Train DD</th><th>Train N</th>
      <th>Val Sh</th><th>Val WR</th><th>Val PF</th><th>Val DD</th><th>Val N</th>
      <th>Test Sh</th><th>Test WR</th><th>Test PF</th><th>Test DD</th><th>Test N</th>
      <th>Obj</th>
    </tr></thead>
    <tbody id="results-tbody"></tbody>
  </table>
  </div>
</div>

<!-- EQUITY TAB -->
<div id="tab-equity" class="tab-pane" style="margin-top:16px">
  <div class="section">
  <h2>Top 5 Equity Curves (Train | Val | Test)</h2>
  <div class="chart-grid" id="chart-grid"></div>
  </div>
</div>

<!-- PARAMS TAB -->
<div id="tab-params" class="tab-pane" style="margin-top:16px">
  <div class="section">
  <h2>Best Config vs Defaults</h2>
  <div class="diff-grid" id="diff-grid"></div>
  </div>
</div>

<!-- IMPORTANCE TAB -->
<div id="tab-importance" class="tab-pane" style="margin-top:16px">
  <div class="section">
  <h2>Parameter Importance (Fanova)</h2>
  <div class="imp-list" id="imp-list"></div>
  </div>
</div>

<script>
const DATA = {json_data};

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {{
  btn.addEventListener('click', () => {{
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  }});
}});

// ── Results table ─────────────────────────────────────────────────────────────
function colorSh(v) {{
  if (v == null || v === '') return '<span class="neu">—</span>';
  const c = v > 0.5 ? 'pos' : v > 0 ? 'neu' : 'neg';
  return `<span class="${{c}}">${{(+v).toFixed(2)}}</span>`;
}}
function colorDd(v) {{
  if (v == null || v === '') return '<span class="neu">—</span>';
  const c = v < 10 ? 'pos' : v < 20 ? 'neu' : 'neg';
  return `<span class="${{c}}">${{(+v).toFixed(1)}}%</span>`;
}}
function colorWr(v) {{
  if (v == null || v === '') return '<span class="neu">—</span>';
  const c = v >= 55 ? 'pos' : v >= 45 ? 'neu' : 'neg';
  return `<span class="${{c}}">${{(+v).toFixed(0)}}%</span>`;
}}
function colorPf(v) {{
  if (v == null || v === '') return '<span class="neu">—</span>';
  const c = v > 1.5 ? 'pos' : v > 1.0 ? 'neu' : 'neg';
  return `<span class="${{c}}">${{(+v).toFixed(2)}}</span>`;
}}

const tbody = document.getElementById('results-tbody');
DATA.top_results.forEach(r => {{
  const tr = r.train || {{}}, va = r.val || {{}}, te = r.test || {{}};
  const row = document.createElement('tr');
  row.innerHTML = [
    `<td>${{r.rank}}</td>`,
    `<td>#${{r.trial_number}}</td>`,
    `<td>${{colorSh(tr.sharpe)}}</td>`,
    `<td>${{colorWr(tr.win_rate)}}</td>`,
    `<td>${{colorPf(tr.pf)}}</td>`,
    `<td>${{colorDd(tr.max_dd)}}</td>`,
    `<td>${{tr.trades ?? '—'}}</td>`,
    `<td>${{colorSh(va.sharpe)}}</td>`,
    `<td>${{colorWr(va.win_rate)}}</td>`,
    `<td>${{colorPf(va.pf)}}</td>`,
    `<td>${{colorDd(va.max_dd)}}</td>`,
    `<td>${{va.trades ?? '—'}}</td>`,
    `<td>${{colorSh(te.sharpe)}}</td>`,
    `<td>${{colorWr(te.win_rate)}}</td>`,
    `<td>${{colorPf(te.pf)}}</td>`,
    `<td>${{colorDd(te.max_dd)}}</td>`,
    `<td>${{te.trades ?? '—'}}</td>`,
    `<td><strong>${{(+r.objective).toFixed(3)}}</strong></td>`,
  ].join('');
  tbody.appendChild(row);
}});

// ── Equity curves ─────────────────────────────────────────────────────────────
const SPLIT_COLORS = {{ train: '#388bfd', val: '#3fb950', test: '#e3b341' }};

function buildEquityChart(container, tradesSets, labels) {{
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const datasets = tradesSets.map((trades, i) => {{
    const eq = [];
    let acc = 0;
    (trades || []).forEach(p => {{ acc += p; eq.push(acc); }});
    return {{
      label: labels[i],
      data: eq,
      borderColor: Object.values(SPLIT_COLORS)[i],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
    }};
  }});
  new Chart(canvas, {{
    type: 'line',
    data: {{ datasets }},
    options: {{
      responsive: true,
      animation: false,
      plugins: {{
        legend: {{ labels: {{ color: '#8b949e', boxWidth: 12, font: {{ size: 11 }} }} }},
      }},
      scales: {{
        x: {{ display: false }},
        y: {{
          grid: {{ color: '#21262d' }},
          ticks: {{ color: '#8b949e', font: {{ size: 10 }} }},
        }},
      }},
    }},
  }});
}}

const grid = document.getElementById('chart-grid');
DATA.top_results.slice(0, 5).forEach((r, idx) => {{
  const card = document.createElement('div');
  card.className = 'chart-card';
  const title = document.createElement('div');
  title.className = 'chart-title';
  title.textContent = `#${{r.rank}} — trial ${{r.trial_number}}  |  obj ${{(+r.objective).toFixed(3)}}`;
  card.appendChild(title);
  // We stored equity arrays in analytics but they were stripped for top-20 JSON.
  // We'll show a placeholder message if equity data isn't available.
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#8b949e;font-size:11px;padding:40px 0;text-align:center';
  msg.textContent = 'Equity curves require --equity flag (re-run with --report --equity)';
  card.appendChild(msg);
  grid.appendChild(card);
}});

// ── Best config diff ───────────────────────────────────────────────────────────
const BOT_DEFAULTS = {bot_defaults_json};
const best = DATA.top_results[0];
const diffGrid = document.getElementById('diff-grid');
if (best) {{
  Object.entries(best.config).forEach(([k, v]) => {{
    const def = BOT_DEFAULTS[k];
    const delta = def != null ? v - def : null;
    let cls = 'no', symbol = '=';
    if (delta != null && delta > 0) {{ cls = 'up'; symbol = '+' + delta.toFixed(2).replace(/\.?0+$/, ''); }}
    if (delta != null && delta < 0) {{ cls = 'dn'; symbol = delta.toFixed(2).replace(/\.?0+$/, ''); }}
    const item = document.createElement('div');
    item.className = 'diff-item';
    item.innerHTML = `
      <div class="diff-key">${{k.replace(/_/g,' ')}}</div>
      <div class="diff-val">${{typeof v === 'number' ? v.toFixed(2).replace(/\.?0+$/,'') : v}}
        <span class="diff-delta ${{cls}}" style="font-size:11px;margin-left:6px">${{symbol}}</span>
      </div>`;
    diffGrid.appendChild(item);
  }});
}}

// ── Param importance ──────────────────────────────────────────────────────────
const impList = document.getElementById('imp-list');
const imps = DATA.param_importances || [];
const maxImp = imps.length ? Math.max(...imps.map(x => x.importance)) : 1;
imps.forEach(p => {{
  const row = document.createElement('div');
  row.className = 'imp-row';
  row.innerHTML = `
    <div class="imp-label">${{p.param.replace(/_/g,' ')}}</div>
    <div class="imp-bar-bg"><div class="imp-bar-fill" style="width:${{(p.importance/maxImp*100).toFixed(1)}}%"></div></div>
    <div class="imp-val">${{(p.importance*100).toFixed(1)}}%</div>`;
  impList.appendChild(row);
}});
if (!imps.length) {{
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#8b949e;padding:12px;font-size:12px';
  msg.textContent = 'Importance data not available (requires ≥ 4 completed trials with optuna.importance).';
  impList.appendChild(msg);
}}
</script>
</body>
</html>
"""


_V4_DEFAULTS = {
    "entry_conf": 70, "candle_hold": 2, "entry_score_min": 65,
    "sl_atr_mult": 1.8, "window_start": 7, "window_end": 20,
    "post_exit_cooldown": 0, "max_range_hold_bars": 30, "mfe_trail_r": 1.0,
    "mfe_suppress_r": 1.5, "conf_floor": 45, "drop_thresh": 15,
    "slope_thresh": -5, "slope_bars": 3, "bocpd_thresh": 70,
    "bocpd_exit_bars": 4, "bocpd_exit_bars_range": 8, "hold_score_min": 40,
    "score_drop_exit": 30, "score_drop_bars": 2, "mfe_retrace_pct": 0.25,
    "mfe_min_r": 1.0, "decay_exit": 0.70,
}

_BOT_LABELS = {"v1": "V1", "v2": "V2", "v4": "V4", "v5": "V5", "v6": "V6"}


def _defaults_for_bot(bot: str) -> dict:
    if bot in ("v1", "v2", "v6"):
        from backtester_v1v2v6 import V1_DEFAULTS, V2_DEFAULTS, V6_DEFAULTS
        return {"v1": V1_DEFAULTS, "v2": V2_DEFAULTS, "v6": V6_DEFAULTS}[bot]
    return _V4_DEFAULTS


def generate_report(json_path: str) -> str:
    """Generate HTML report from a results JSON file. Returns the HTML file path."""
    p    = Path(json_path)
    data = json.loads(p.read_text())

    bot          = data.get("bot", "v4")
    bot_defaults = _defaults_for_bot(bot)

    sb = data.get("split_bars", {})
    html = _HTML_TEMPLATE.format(
        pair=data["pair"],
        bot_label=_BOT_LABELS.get(bot, bot.upper()),
        generated_at=data.get("generated_at", ""),
        n_trials=data.get("n_trials", 0),
        months_data=data.get("months_data", 0),
        train_bars=sb.get("train", 0),
        val_bars=sb.get("val", 0),
        test_bars=sb.get("test", 0),
        json_data=json.dumps(data),
        bot_defaults_json=json.dumps(bot_defaults),
    )

    out_path = p.with_suffix(".html")
    out_path.write_text(html, encoding="utf-8")
    return str(out_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python reporter.py <results/file.json>")
        sys.exit(1)
    path = generate_report(sys.argv[1])
    print(f"Report written to: {path}")
