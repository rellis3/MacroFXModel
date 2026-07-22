import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

res = json.load(open(sys.argv[1]))
equity = json.load(open(sys.argv[2]))
outfile = sys.argv[3]

BG='#0e1117'; FG='#c9d1d9'; UP='#26a69a'; DN='#ef5350'; GRID='#21262d'; ACC='#58a6ff'
plt.rcParams.update({'figure.facecolor':BG,'axes.facecolor':BG,'savefig.facecolor':BG,
    'text.color':FG,'axes.labelcolor':FG,'xtick.color':FG,'ytick.color':FG,'axes.edgecolor':GRID})

fig = plt.figure(figsize=(15,12))
gs = fig.add_gridspec(3,2, height_ratios=[1.1,1,1], hspace=0.42, wspace=0.22)

# ── Portfolio equity curve (cumulative R across all 26 pairs' trades) ──
ax = fig.add_subplot(gs[0,:])
cum = [e['cumR'] for e in equity]
ax.plot(range(len(cum)), cum, color=ACC, lw=1.3)
ax.axhline(0, color=GRID, lw=1)
sd = res['splitDate']
# find split index
sidx = next((i for i,e in enumerate(equity) if e['date']>=sd), len(equity)) if sd else len(equity)
ax.axvline(sidx, color='#e3b341', lw=1.2, ls='--')
ax.text(sidx, max(cum), '  OOS →', color='#e3b341', va='top', fontsize=10)
ax.fill_between(range(len(cum)), cum, 0, where=[c>=0 for c in cum], color=UP, alpha=0.12)
ax.fill_between(range(len(cum)), cum, 0, where=[c<0 for c in cum], color=DN, alpha=0.12)
ax.set_title(f"Portfolio equity — cumulative R across all {res['pairs']} pairs  ({res['window']}, {res['totalTrades']} trades)", fontsize=12)
ax.set_ylabel('Cumulative R'); ax.set_xlabel('trade # (chronological)')
ax.grid(True, color=GRID, lw=0.5, alpha=0.4)

# ── Per-pair OOS vs Full Sharpe bars ──
ax = fig.add_subplot(gs[1,:])
pp = sorted(res['perPair'], key=lambda p:p['full']['sharpe'])
names = [p['pair'] for p in pp]
full = [p['full']['sharpe'] for p in pp]
oos  = [p['oos']['sharpe'] for p in pp]
x = np.arange(len(names)); w=0.4
ax.bar(x-w/2, full, w, color=[UP if v>0 else DN for v in full], label='Full-sample Sharpe')
ax.bar(x+w/2, oos,  w, color=[ '#2ea043' if v>0 else '#f85149' for v in oos], alpha=0.6, label='OOS Sharpe')
ax.axhline(0, color=FG, lw=0.8)
ax.set_xticks(x); ax.set_xticklabels(names, rotation=55, ha='right', fontsize=8)
ax.set_title('Per-pair Sharpe (annualised, after costs) — full vs out-of-sample', fontsize=12)
ax.set_ylabel('Sharpe'); ax.legend(facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=9)
ax.grid(True, axis='y', color=GRID, lw=0.5, alpha=0.4)

# ── Yearly R heatmap-ish bar ──
ax = fig.add_subplot(gs[2,0])
years = sorted(res['byYear'].keys())
yv = [res['byYear'][y] for y in years]
ax.bar(years, yv, color=[UP if v>0 else DN for v in yv])
ax.axhline(0, color=FG, lw=0.8)
ax.set_title('Net R by calendar year (all pairs pooled)', fontsize=11)
ax.set_ylabel('Net R'); ax.tick_params(axis='x', rotation=45, labelsize=8)
ax.grid(True, axis='y', color=GRID, lw=0.5, alpha=0.4)

# ── Pooled metrics text panel ──
ax = fig.add_subplot(gs[2,1]); ax.axis('off')
pf = res['pooled']['full']; pi = res['pooled']['is']; po = res['pooled']['oos']
def g(d,k):
    v=d.get(k);
    return 'n/a' if v is None else (f'{v:.3f}' if isinstance(v,(int,float)) else str(v))
lines = [
 'POOLED PORTFOLIO (all 26 pairs, after costs)','',
 f"trades           {pf.get('trades')}",
 f"Sharpe  full     {g(pf,'sharpe')}",
 f"Sharpe  IS       {g(pi,'sharpe')}   (n={pi.get('trades')})",
 f"Sharpe  OOS      {g(po,'sharpe')}   (n={po.get('trades')})",
 f"Sortino full     {g(pf,'sortino')}",
 f"win rate         {g(pf,'winRate')} %",
 f"profit factor    {g(pf,'profitFactor')}",
 f"expectancy       {g(pf,'expectancy')} R",
 f"max drawdown     {g(pf,'maxDD')} R",
 f"sk/ exc.kurt     {g(pf,'skew')} / {g(pf,'excessKurt')}",
 f"VaR95 / CVaR95   {g(pf,'var95')} / {g(pf,'cvar95')} R",
 '',
 f"buy&hold mean Sharpe (benchmark)  {res['bhSharpeMean']}",
]
ax.text(0.02,0.98,'\n'.join(lines), va='top', ha='left', family='monospace', fontsize=11, color=FG)

fig.suptitle('Mechanised ColezTrades POI-reaction backtest — Stage 1–2 (levels only, 1:1 RR, costs on)', fontsize=13, y=0.995)
fig.savefig(outfile, dpi=110, bbox_inches='tight')
print('wrote', outfile)
