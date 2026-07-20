import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os

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
df = df.dropna().reset_index(drop=True)

df['Strategy_Return'] = df['Position'] * df['DAX_Return']
df['Cum_Strategy'] = (1 + df['Strategy_Return']/100).cumprod() - 1
df['Cum_BuyHold'] = (1 + df['DAX_Return']/100).cumprod() - 1

years = len(df) / 12
total_return = df['Cum_Strategy'].iloc[-1] * 100
total_bh = df['Cum_BuyHold'].iloc[-1] * 100
cagr = ((1 + total_return/100) ** (1/years) - 1) * 100
cagr_bh = ((1 + total_bh/100) ** (1/years) - 1) * 100
annual_vol = df['Strategy_Return'].std() * np.sqrt(12)
sharpe = (cagr - 3.8) / annual_vol

cum = (1 + df['Strategy_Return']/100).cumprod()
running_max = cum.expanding().max()
drawdown = (cum - running_max) / running_max * 100
max_dd = drawdown.min()

win_rate = (df['Strategy_Return'] > 0).sum() / len(df) * 100

print(f"Period: {df['Date'].iloc[0].strftime('%Y-%m')} to {df['Date'].iloc[-1].strftime('%Y-%m')}")
print(f"Total Return: {total_return:.2f}% vs Buy&Hold: {total_bh:.2f}%")
print(f"CAGR: {cagr:.2f}% vs Buy&Hold: {cagr_bh:.2f}%")
print(f"Sharpe: {sharpe:.3f}")
print(f"Max Drawdown: {max_dd:.2f}%")
print(f"Win Rate: {win_rate:.1f}%")

fig, ax = plt.subplots(figsize=(14, 7))
ax.plot(df['Date'], (1 + df['Cum_Strategy']) * 100, linewidth=2, label='IFO Strategy')
ax.plot(df['Date'], (1 + df['Cum_BuyHold']) * 100, linewidth=2, alpha=0.7, label='Buy & Hold')
ax.set_title(f'IFO Strategy | CAGR: {cagr:.2f}% | Sharpe: {sharpe:.3f} | Max DD: {max_dd:.1f}%')
ax.set_xlabel('Date')
ax.set_ylabel('Portfolio Value')
ax.legend()
ax.grid(True, alpha=0.3)
fig.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, 'base_strategy_equity.png'), dpi=300)

df.to_csv(os.path.join(OUTPUT_DIR, 'base_strategy_results.csv'), index=False)
print(f"Saved plots and results to {OUTPUT_DIR}")
