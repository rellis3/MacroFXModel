import pandas as pd
import numpy as np
import os

DATA_DIR = "../data"
OUTPUT_DIR = "../output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

ifo_df = pd.read_csv(os.path.join(DATA_DIR, "RAWDATA.csv"))
ifo_df.columns = ifo_df.columns.str.strip()
ifo_df['Date'] = pd.to_datetime(ifo_df['Date'], format='%d/%m/%Y')
ifo_df['Year'] = ifo_df['Date'].dt.year
ifo_df['Month'] = ifo_df['Date'].dt.month
ifo_df = ifo_df.rename(columns={'ISO BE': 'IFO_Level', 'ISO BE Change %': 'IFO_Change_Pct'})

dax_daily = pd.read_csv(os.path.join(DATA_DIR, "dax_raw.csv"), encoding='utf-8-sig')
dax_daily.columns = dax_daily.columns.str.strip()
dax_daily['Price'] = dax_daily['Price'].str.replace(',', '').astype(float)
dax_daily['Date'] = pd.to_datetime(dax_daily['Date'], format='%d/%m/%Y')
dax_daily = dax_daily.sort_values('Date').reset_index(drop=True)
dax_daily['Year'] = dax_daily['Date'].dt.year
dax_daily['Month'] = dax_daily['Date'].dt.month

dax_monthly = dax_daily.groupby(['Year', 'Month']).agg({'Date': 'last', 'Price': 'last'}).reset_index()
dax_monthly.columns = ['Year', 'Month', 'Date', 'DAX_Price']
dax_monthly['DAX_Return'] = dax_monthly['DAX_Price'].pct_change() * 100

merged_df = pd.merge(
    ifo_df[['Year', 'Month', 'Date', 'IFO_Level', 'IFO_Change_Pct']],
    dax_monthly[['Year', 'Month', 'DAX_Price', 'DAX_Return']],
    on=['Year', 'Month'], how='inner'
)
merged_df = merged_df.sort_values('Date').reset_index(drop=True)

merged_df['IFO_Previous'] = merged_df['IFO_Level'].shift(1)
merged_df['IFO_Direction'] = merged_df['IFO_Level'] - merged_df['IFO_Previous']
merged_df['IFO_Bullish'] = merged_df['IFO_Direction'] > 0
merged_df['IFO_Bearish'] = merged_df['IFO_Direction'] < 0
merged_df['Position'] = np.where(merged_df['IFO_Direction'] > 0, 1, -1)

merged_df = merged_df.dropna().reset_index(drop=True)

output_path = os.path.join(OUTPUT_DIR, "prepared_data.csv")
merged_df.to_csv(output_path, index=False)

print(f"Data prepared: {len(merged_df)} observations")
print(f"Period: {merged_df['Date'].iloc[0].strftime('%Y-%m')} to {merged_df['Date'].iloc[-1].strftime('%Y-%m')}")
print(f"Saved to: {output_path}")
