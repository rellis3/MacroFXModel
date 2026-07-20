import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import statsmodels.api as sm
from statsmodels.stats.stattools import durbin_watson
from statsmodels.stats.diagnostic import het_breuschpagan
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
df = df.dropna().reset_index(drop=True)

X = sm.add_constant(df['IFO_Direction'].values)
y = df['DAX_Return'].values
results = sm.OLS(y, X).fit()

print("="*70)
print("OLS REGRESSION: DAX_Return = b0 + b1 * IFO_Direction")
print("="*70)
print(results.summary())

dw = durbin_watson(results.resid)
jb_stat, jb_pvalue = stats.jarque_bera(results.resid)
bp_stat, bp_pvalue, _, _ = het_breuschpagan(results.resid, X)

print("\n" + "="*70)
print("DIAGNOSTICS")
print("="*70)
print(f"Durbin-Watson: {dw:.4f}")
print(f"Jarque-Bera: {jb_stat:.4f} (p={jb_pvalue:.4f})")
print(f"Breusch-Pagan: {bp_stat:.4f} (p={bp_pvalue:.4f})")

beta_0 = results.params[0]
beta_1 = results.params[1]

print(f"\nInterpretation:")
print(f"1 point IFO increase -> {beta_1:.3f}% DAX return")
print(f"R-squared: {results.rsquared:.4f}")

fig, ax = plt.subplots(figsize=(10, 8))
ax.scatter(df['IFO_Direction'], df['DAX_Return'], alpha=0.5, s=50)
x_line = np.linspace(df['IFO_Direction'].min(), df['IFO_Direction'].max(), 100)
y_line = beta_0 + beta_1 * x_line
ax.plot(x_line, y_line, color='red', linewidth=2)
ax.axhline(0, color='gray', linestyle='--', alpha=0.5)
ax.axvline(0, color='gray', linestyle='--', alpha=0.5)
ax.set_xlabel('IFO Direction')
ax.set_ylabel('DAX Return (%)')
ax.set_title(f'IFO vs DAX | R² = {results.rsquared:.4f}')
ax.grid(True, alpha=0.3)
fig.savefig(os.path.join(OUTPUT_DIR, 'regression_scatter.png'), dpi=300)

fig2, ax2 = plt.subplots(figsize=(10, 6))
ax2.scatter(results.fittedvalues, results.resid, alpha=0.5)
ax2.axhline(0, color='red', linestyle='--')
ax2.set_xlabel('Fitted Values')
ax2.set_ylabel('Residuals')
ax2.set_title('Residual Plot')
fig2.savefig(os.path.join(OUTPUT_DIR, 'regression_residuals.png'), dpi=300)

print(f"\nPlots saved to {OUTPUT_DIR}")
