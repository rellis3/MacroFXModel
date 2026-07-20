import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import statsmodels.api as sm
from scipy import stats
import os
import warnings
warnings.filterwarnings('ignore')

DATA_DIR = "../data"
OUTPUT_DIR = "../output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

ifo_df = pd.read_csv(os.path.join(DATA_DIR, "RAWDATA.csv"))
ifo_df.columns = ifo_df.columns.str.strip()
ifo_df['Date'] = pd.to_datetime(ifo_df['Date'], format='%d/%m/%Y')
ifo_df['Year'] = ifo_df['Date'].dt.year
ifo_df['Month'] = ifo_df['Date'].dt.month
ifo_df = ifo_df.rename(columns={'ISO BE': 'IFO_Level'})

dax_daily = pd.read_csv(os.path.join(DATA_DIR, "dax_raw.csv"), encoding='utf-8-sig')
dax_daily.columns = dax_daily.columns.str.strip()
dax_daily['Price'] = dax_daily['Price'].str.replace(',', '').astype(float)
dax_daily['Date'] = pd.to_datetime(dax_daily['Date'], format='%d/%m/%Y')
dax_daily = dax_daily.sort_values('Date')
dax_daily['Year'] = dax_daily['Date'].dt.year
dax_daily['Month'] = dax_daily['Date'].dt.month

dax_monthly = dax_daily.groupby(['Year', 'Month']).agg({'Date': 'last', 'Price': 'last'}).reset_index()
dax_monthly.columns = ['Year', 'Month', 'Date', 'DAX_Price']
dax_monthly['DAX_Return'] = dax_monthly['DAX_Price'].pct_change() * 100

df = pd.merge(
    ifo_df[['Year', 'Month', 'Date', 'IFO_Level']],
    dax_monthly[['Year', 'Month', 'DAX_Price', 'DAX_Return']],
    on=['Year', 'Month'], how='inner'
).sort_values('Date').reset_index(drop=True)

df['IFO_Previous'] = df['IFO_Level'].shift(1)
df['IFO_Direction'] = df['IFO_Level'] - df['IFO_Previous']
df['Position'] = np.where(df['IFO_Direction'] > 0, 1, -1)
df['Strategy_Return'] = df['Position'] * df['DAX_Return']
df = df.dropna().reset_index(drop=True)

df['Cum_Strategy'] = (1 + df['Strategy_Return']/100).cumprod() - 1
df['Cum_BuyHold'] = (1 + df['DAX_Return']/100).cumprod() - 1

strategy_returns = df['Strategy_Return']
benchmark_returns = df['DAX_Return']
years = len(df) / 12
rf = 3.8

total_return = df['Cum_Strategy'].iloc[-1] * 100
total_bh = df['Cum_BuyHold'].iloc[-1] * 100
cagr = ((1 + total_return/100) ** (1/years) - 1) * 100
cagr_bh = ((1 + total_bh/100) ** (1/years) - 1) * 100

annual_vol = strategy_returns.std() * np.sqrt(12)
annual_vol_bh = benchmark_returns.std() * np.sqrt(12)

sharpe = (cagr - rf) / annual_vol
sharpe_bh = (cagr_bh - rf) / annual_vol_bh

downside = strategy_returns[strategy_returns < 0]
downside_std = downside.std() * np.sqrt(12)
sortino = (cagr - rf) / downside_std if downside_std > 0 else np.inf

cum = (1 + strategy_returns/100).cumprod()
running_max = cum.expanding().max()
drawdown = (cum - running_max) / running_max * 100
max_dd = drawdown.min()

cum_bh = (1 + benchmark_returns/100).cumprod()
running_max_bh = cum_bh.expanding().max()
drawdown_bh = (cum_bh - running_max_bh) / running_max_bh * 100
max_dd_bh = drawdown_bh.min()

calmar = cagr / abs(max_dd) if max_dd != 0 else np.inf
win_rate = (strategy_returns > 0).sum() / len(strategy_returns) * 100
avg_win = strategy_returns[strategy_returns > 0].mean()
avg_loss = strategy_returns[strategy_returns < 0].mean()

skewness = stats.skew(strategy_returns)
kurtosis = stats.kurtosis(strategy_returns)
var_95 = np.percentile(strategy_returns, 5)
cvar_95 = strategy_returns[strategy_returns <= var_95].mean()

print("="*80)
print("TRACK RECORD & RISK/RETURN METRICS")
print("="*80)
print(f"Observations: {len(df)} | Frequency: 12 p.a. | rf = {rf}%")
print(f"Start: {df['Date'].iloc[0].strftime('%Y-%m-%d')}")
print(f"End: {df['Date'].iloc[-1].strftime('%Y-%m-%d')}")

print(f"\n{'Metric':<40} {'Strategy':<20} {'Benchmark':<20}")
print("-" * 80)
print(f"{'CAGR:':<40} {cagr:>18.2f}% {cagr_bh:>18.2f}%")
print(f"{'Annual Volatility:':<40} {annual_vol:>18.2f}% {annual_vol_bh:>18.2f}%")
print(f"{'Sharpe Ratio:':<40} {sharpe:>18.4f}  {sharpe_bh:>18.4f}")
print(f"{'Sortino Ratio:':<40} {sortino:>18.4f}")
print(f"{'Max Drawdown:':<40} {max_dd:>18.2f}% {max_dd_bh:>18.2f}%")
print(f"{'Calmar Ratio:':<40} {calmar:>18.4f}")
print(f"{'Skewness:':<40} {skewness:>18.4f}")
print(f"{'Excess Kurtosis:':<40} {kurtosis:>18.4f}")
print(f"{'Win Rate:':<40} {win_rate:>18.2f}%")
print(f"{'Avg Win:':<40} {avg_win:>18.4f}")
print(f"{'Avg Loss:':<40} {avg_loss:>18.4f}")
print(f"{'Hist VaR 95%:':<40} {var_95:>18.4f}")
print(f"{'Hist CVaR 95%:':<40} {cvar_95:>18.4f}")

print("\n" + "="*80)
print("OLS REGRESSION")
print("="*80)
X = sm.add_constant(df['IFO_Direction'].values)
y = df['DAX_Return'].values
ols_results = sm.OLS(y, X).fit()
print(ols_results.summary())

n_sims = 1000
mean_ret = strategy_returns.mean()
std_ret = strategy_returns.std()
mc_final = []
for _ in range(n_sims):
    sim_returns = np.random.normal(mean_ret, std_ret, len(df))
    sim_cum = (1 + sim_returns/100).prod() - 1
    mc_final.append(sim_cum * 100)
mc_final = np.array(mc_final)

print("\n" + "="*80)
print("MONTE CARLO (1000 paths)")
print("="*80)
print(f"Mean: {mc_final.mean():.2f}%")
print(f"5th Percentile: {np.percentile(mc_final, 5):.2f}%")
print(f"95th Percentile: {np.percentile(mc_final, 95):.2f}%")

fig1, ax1 = plt.subplots(figsize=(14, 8))
ax1.plot(df['Date'], (1 + df['Cum_Strategy']) * 100, linewidth=2, label='Strategy')
ax1.plot(df['Date'], (1 + df['Cum_BuyHold']) * 100, linewidth=2, alpha=0.7, label='Buy & Hold')
ax1.set_title(f'Equity Curve | CAGR: {cagr:.2f}% | Sharpe: {sharpe:.3f}')
ax1.legend()
ax1.grid(True, alpha=0.3)
fig1.savefig(os.path.join(OUTPUT_DIR, 'professional_equity.png'), dpi=300)

fig2, ax2 = plt.subplots(figsize=(14, 5))
ax2.fill_between(df['Date'], drawdown, 0, alpha=0.6)
ax2.set_title('Drawdown')
fig2.savefig(os.path.join(OUTPUT_DIR, 'professional_drawdown.png'), dpi=300)

fig3, ax3 = plt.subplots(figsize=(10, 6))
ax3.hist(strategy_returns, bins=40, alpha=0.7, edgecolor='black')
ax3.axvline(strategy_returns.mean(), color='red', linestyle='--')
ax3.set_title('Monthly Returns Distribution')
fig3.savefig(os.path.join(OUTPUT_DIR, 'professional_distribution.png'), dpi=300)

np.random.seed(42)
fig4, ax4 = plt.subplots(figsize=(12, 6))
for i in range(100):
    sim_returns = np.random.normal(mean_ret, std_ret, len(df))
    sim_cum = (1 + sim_returns/100).cumprod() * 100
    ax4.plot(range(len(df)), sim_cum, alpha=0.1, linewidth=0.8)
ax4.plot(range(len(df)), (1 + df['Cum_Strategy']) * 100, color='black', linewidth=2, label='Actual')
ax4.set_title('Monte Carlo Simulation')
ax4.legend()
fig4.savefig(os.path.join(OUTPUT_DIR, 'professional_montecarlo.png'), dpi=300)

fig5, ax5 = plt.subplots(figsize=(14, 10))
df['Year'] = df['Date'].dt.year
df['Month_Name'] = df['Date'].dt.strftime('%b')
heatmap_data = df.pivot_table(values='Strategy_Return', index='Year', columns='Month_Name', aggfunc='first')
month_order = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
heatmap_data = heatmap_data[[col for col in month_order if col in heatmap_data.columns]]
sns.heatmap(heatmap_data, annot=True, fmt='.1f', cmap='RdYlGn', center=0, ax=ax5)
ax5.set_title('Monthly Returns Heatmap')
fig5.savefig(os.path.join(OUTPUT_DIR, 'professional_heatmap.png'), dpi=300)

print(f"\nPlots saved to {OUTPUT_DIR}")
