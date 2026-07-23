import json, sys, datetime as dt
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

data = json.load(open(sys.argv[1]))
outfile = sys.argv[2]
pair = data['pair'].upper()
daily = data['daily']
trades = data['trades']

# Map each trade date to the nearest daily index (x = index avoids weekend gaps).
day_ts = [d['t'] for d in daily]
def ts_of(datestr): return int(dt.datetime.strptime(datestr,'%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp())
def idx_of(datestr):
    t = ts_of(datestr)
    best,bi = 1e18,0
    for i,dt_ in enumerate(day_ts):
        if abs(dt_-t)<best: best,bi=abs(dt_-t),i
    return bi

BG='#0e1117'; FG='#c9d1d9'; UP='#26a69a'; DN='#ef5350'; GRID='#21262d'
plt.rcParams.update({'figure.facecolor':BG,'axes.facecolor':BG,'savefig.facecolor':BG,
    'text.color':FG,'axes.labelcolor':FG,'xtick.color':FG,'ytick.color':FG,'axes.edgecolor':GRID})

fig, (ax1, ax2) = plt.subplots(2,1, figsize=(15,11), gridspec_kw={'height_ratios':[2,1]})

# ── Panel A: D1 candles + POI zone lines + trade entry markers ──
def candles(ax, bars):
    for i,b in enumerate(bars):
        col = UP if b['c']>=b['o'] else DN
        ax.plot([i,i],[b['l'],b['h']], color=col, lw=0.7, zorder=2)
        lo,hi = sorted([b['o'],b['c']])
        ax.add_patch(plt.Rectangle((i-0.3,lo),0.6,max(hi-lo,1e-9), color=col, zorder=3))
candles(ax1, daily)

seen_lab=set()
for t in trades:
    xi = idx_of(t['date'])
    win = t['outcome']=='win'
    mcol = UP if win else DN
    up = t['side']=='BUY'
    # zone line (confluence POI) — short horizontal segment at the zone price
    ax1.plot([xi-2.5,xi+2.5],[t['zonePrice'],t['zonePrice']], color='#e3b341', lw=1.1, alpha=0.55, zorder=4)
    # entry marker: triangle up for BUY, down for SELL; colour = win/loss
    ax1.scatter([xi],[t['entry']], marker='^' if up else 'v', s=70, color=mcol,
                edgecolor='white', linewidth=0.4, zorder=6)
ax1.set_title(f'{pair} — Daily candles with POI-reaction trades  (gold = confluence zone, ▲ BUY / ▼ SELL, green = win / red = loss)', fontsize=12, color=FG)
ax1.grid(True, color=GRID, lw=0.5, alpha=0.5)
ax1.set_ylabel('Price')
nlab = max(1,len(daily)//12)
ax1.set_xticks(range(0,len(daily),nlab)); ax1.set_xticklabels([daily[i]['t'] and dt.datetime.utcfromtimestamp(daily[i]['t']).strftime('%Y-%m-%d') for i in range(0,len(daily),nlab)], rotation=30, ha='right', fontsize=8)
ax1.set_xlim(-1,len(daily))
legend = [Line2D([0],[0],color='#e3b341',lw=2,label='POI confluence zone'),
          Line2D([0],[0],marker='^',color='w',markerfacecolor=UP,markersize=9,lw=0,label='winning entry'),
          Line2D([0],[0],marker='v',color='w',markerfacecolor=DN,markersize=9,lw=0,label='losing entry')]
ax1.legend(handles=legend, loc='upper left', facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=9)

# ── Panel B: one zoomed trade on M15 showing entry / SL / TP + fill→exit path ──
z = data['zoom']; zb = z['bars']; zi = z['info']
if zb and zi:
    candles(ax2, zb)
    ax2.axhline(zi['entry'], color='#58a6ff', lw=1.3, ls='-',  label=f"entry {zi['entry']}")
    ax2.axhline(zi['sl'],    color=DN,        lw=1.3, ls='--', label=f"stop {zi['sl']}")
    ax2.axhline(zi['tp'],    color=UP,        lw=1.3, ls='--', label=f"target {zi['tp']}")
    ax2.axhline(zi['zonePrice'], color='#e3b341', lw=1.0, ls=':', alpha=0.7, label='POI zone')
    # mark fill and exit x positions by matching bar times
    def x_at(tsec):
        for i,b in enumerate(zb):
            if b['t']>=tsec: return i
        return len(zb)-1
    if zi.get('fillTime'): ax2.scatter([x_at(zi['fillTime'])],[zi['entry']], marker='o', s=60, color='#58a6ff', zorder=7, edgecolor='white', lw=0.4)
    if zi.get('exitTime'):
        exl = zi['tp'] if zi['outcome']=='win' else zi['sl']
        ax2.scatter([x_at(zi['exitTime'])],[exl], marker='X', s=80, color=UP if zi['outcome']=='win' else DN, zorder=7, edgecolor='white', lw=0.5)
    ax2.set_title(f"Zoomed trade — {pair} {zi['date']} {zi['side']}  ({zi['outcome'].upper()}, R={zi['R']}, zone confluence={zi['zoneCount']}: {'+'.join(zi['zoneSources'])})", fontsize=11, color=FG)
    ax2.legend(loc='best', facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=9)
    ax2.grid(True, color=GRID, lw=0.5, alpha=0.5)
    ax2.set_ylabel('Price'); ax2.set_xlabel('M15 bars through the trade day')

fig.tight_layout()
fig.savefig(outfile, dpi=110)
print('wrote', outfile)
