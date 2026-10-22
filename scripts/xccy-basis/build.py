"""Cross-currency basis from CME FX futures vs OANDA spot (covered interest parity), daily.

Phase 1: EURUSD (6E) and GBPUSD (6B), 2015-12 -> 2026-08 (OANDA M1 ends 2026-08-20).

Per trading day d: the minutes 18:30-19:29 UTC with a futures trade where the futures 1-min close (NT8 per-contract files,
analysis/output/nt8/contracts) and the OANDA spot 1-min close both exist. Contract = the nearest quarterly
contract with >= MIN_T calendar days from spot value date (d + 2 business days) to delivery (3rd Wednesday).
  EUR (act/360 both legs):  b = [S(1 + r_usd t/360)/F - 1] * 360/t - r_eur
  GBP (USD act/360, GBP act/365): b = [S(1 + r_usd t/360)/F - 1] * 365/t - r_gbp
Negative b = a premium paid to borrow dollars against EUR/GBP (dollar scarcity). Reported in bp; the day value
is the median over the 15 minutes.

Rate variants:
  live     : the latest overnight fixings dated before d (known by 19:00 UTC on d), held flat over the tenor.
             Knowable on the day; its LEVEL carries expected policy moves, its day-to-day CHANGES mostly do not.
  realised : the overnight fixings actually compounded over [value date, delivery). Clean level, but only known
             after delivery -- descriptive / research only, never a live input.
Overnight legs: USD = SOFR (2018-04+), EFFR before; EUR = EUR STR (2019-10+), EONIA - 8.5bp before;
GBP = SONIA. All FRED (keyed API), cached in analysis/output/xccy-basis/rates/.

Outputs: analysis/output/xccy-basis/basis_daily.csv and feature-store parquet files
features/xccy_basis_{eur,gbp}_{live,realised}.parquet (date, asof, value, vintage, source).

Run: python scripts/xccy-basis/build.py
"""
import glob, json, math, os, re, urllib.request
from datetime import date, datetime, timedelta, timezone
import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'analysis', 'output', 'xccy-basis')
RATES = os.path.join(OUT, 'rates')
FEAT = os.path.join(ROOT, 'features')
os.makedirs(RATES, exist_ok=True)
MIN_T = 25   # forward points are ~10 pips; one 6E/6B tick (half a pip) is ~5bp of basis at 25 days, ~15-25bp at 10
# feed faults found on inspection 2026-10-22: futures-spot gap swings +-25 pips with flat rates, both 6E and 6B
DATA_FAULTS = pd.to_datetime(['2020-10-19', '2020-10-20', '2020-10-21', '2020-10-22'])
# CHF only, found 2026-10-23: contract 6S_06-22 futures-spot gap jumps 5<->25 pips day to day (intraday-consistent, clocks
# aligned, rates imply ~15) from 2022-04-20 to 2022-05-31; cause unknown (feed), so the window is excluded for CHF
PAIR_FAULTS = {'chf': pd.date_range('2022-04-20', '2022-05-31')}
# 2026-10-23: widened to 18:30-19:29 UTC and futures minutes WITH TRADES only -- thin 6S (and some 6J/6B) minutes carry
# stale closes while spot moves, which swung CHF forward points 4<->25 pips day to day in May 2022
MINUTES = [f'18:{m:02d}' for m in range(30, 60)] + [f'19:{m:02d}' for m in range(30)]
PAIRS = {'eur': dict(root='6E', spot='eurusd', fx_basis=360), 'gbp': dict(root='6B', spot='gbpusd', fx_basis=365),
         # phase 2 (2026-10-23): 6J/6S quote USD per JPY/CHF, so OANDA USDJPY/USDCHF spot is inverted
         'jpy': dict(root='6J', spot='usdjpy', fx_basis=365, invert=True), 'chf': dict(root='6S', spot='usdchf', fx_basis=360, invert=True)}


# ── rates ──────────────────────────────────────────────────────────────────────────────────────────
def fred_key():
    for line in open(os.path.join(ROOT, 'RegimeV2', '.env'), encoding='utf-8', errors='ignore'):
        m = re.match(r"\s*FRED_KEY\s*=\s*['\"]?([^'\"\s#]+)", line)
        if m:
            return m.group(1)
    raise SystemExit('FRED_KEY not found')


def fred(sid):
    path = os.path.join(RATES, f'{sid}.json')
    if not os.path.exists(path):
        u = f'https://api.stlouisfed.org/fred/series/observations?series_id={sid}&observation_start=2015-01-01&file_type=json&api_key={fred_key()}'
        open(path, 'w').write(urllib.request.urlopen(u, timeout=60).read().decode())
    obs = json.load(open(path))['observations']
    return pd.Series({pd.Timestamp(o['date']): float(o['value']) for o in obs if o['value'] not in ('.', '')}).sort_index()


def overnight_legs():
    sofr, effr = fred('SOFR'), fred('EFFR')
    usd = pd.concat([effr[effr.index < sofr.index[0]], sofr]).sort_index()
    estr, eonia = fred('ECBESTRVOLWGTTRMDMNRT'), fred('EONIARATE')
    eur = pd.concat([(eonia - 0.085)[eonia.index < estr.index[0]], estr]).sort_index()
    gbp = fred('IUDSOIA')
    return {'usd': usd, 'eur': eur, 'gbp': gbp, 'jpy': boj_tona(), 'chf': snb_saron()}


def _cached_text(name, url):
    path = os.path.join(RATES, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        open(path, 'wb').write(urllib.request.urlopen(req, timeout=90).read())
    return open(path, encoding='utf-8-sig').read()


def boj_tona():
    """TONA = BoJ uncollateralized overnight call rate, daily average (stat-search API, db FM01, STRDCLUCON)."""
    txt = _cached_text('BOJ_STRDCLUCON.csv', 'https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=csv&lang=en&db=FM01&code=STRDCLUCON&startDate=201501')
    out = {}
    for line in txt.splitlines():
        parts = line.split(',')
        if parts and parts[0] == 'STRDCLUCON' and len(parts) >= 2:
            d, v = parts[-2].strip(), parts[-1].strip()
            if v not in ('null', '') and re.match(r'^\d{8}$', d):
                out[pd.Timestamp(d)] = float(v)
    if not out:
        raise RuntimeError('BoJ TONA: no observations parsed')
    return pd.Series(out).sort_index()


def snb_saron():
    """SARON from the SNB data portal (cube snbgwdzid, series SARON)."""
    txt = _cached_text('SNB_snbgwdzid.csv', 'https://data.snb.ch/api/cube/snbgwdzid/data/csv/en')
    out = {}
    for line in txt.splitlines():
        parts = [x.strip('"') for x in line.split(';')]
        if len(parts) == 3 and parts[1] == 'SARON' and parts[2] not in ('',):
            try: out[pd.Timestamp(parts[0])] = float(parts[2])
            except ValueError: pass
    if not out:
        raise RuntimeError('SNB SARON: no observations parsed')
    return pd.Series(out).sort_index()


def latest_before(s, d, k=5):
    """median of the last k fixings dated strictly before d: strips one-day prints (Sep-2019 repo spike, quarter-ends)
    that would otherwise be held flat across a 3-month tenor"""
    i = s.index.searchsorted(d, side='left')
    return float(s.iloc[max(0, i - k):i].median()) if i >= k else np.nan


def compounded(s, start, end, basis):
    """simple-equivalent annual rate (%) of daily-compounded fixings over [start, end), each fixing held to the next fixing date"""
    if s.index[-1] < end - pd.Timedelta(days=4):
        return np.nan                                       # window not fully published yet
    idx = s.index
    i0 = idx.searchsorted(start, side='right') - 1
    if i0 < 0:
        return np.nan
    acc, t = 1.0, start
    j = i0
    while t < end:
        nxt = idx[j + 1] if j + 1 < len(idx) else end
        stop = min(max(nxt, t + pd.Timedelta(days=1)), end)
        days = (stop - t).days
        acc *= 1 + s.iloc[j] / 100 * days / basis
        t = stop
        j = min(j + 1, len(idx) - 1)
    total = (end - start).days
    return (acc - 1) * basis / total * 100


# ── calendar ─────────────────────────────────────────────────────────────────────────────────────────
def third_wed(y, m):
    d = date(y, m, 15)
    return pd.Timestamp(d + timedelta(days=(2 - d.weekday()) % 7))


def add_bdays(d, n):
    while n:
        d += pd.Timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


# ── data ─────────────────────────────────────────────────────────────────────────────────────────────
def load_contracts(root):
    out = {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'analysis', 'output', 'nt8', 'contracts', root, f'{root}_*.parquet'))):
        mm, yy = re.search(r'_(\d\d)-(\d\d)\.parquet$', p).groups()
        df = pd.read_parquet(p, columns=['timestamp', 'close', 'volume'])
        df = df[df.volume > 0]                                   # a print in that minute, not a stale carried close
        df = df.set_index(df.timestamp.dt.tz_convert('UTC').dt.tz_localize(None))['close']
        hm = df.index.strftime('%H:%M')
        df = df[np.isin(hm, MINUTES)]
        out[third_wed(2000 + int(yy), int(mm))] = df
    return out


def load_spot(sym):
    s = pd.read_parquet(os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1', f'{sym}_m1.parquet'), columns=['close'])['close']
    s.index = s.index.tz_convert('UTC').tz_localize(None)
    return s[np.isin(s.index.strftime('%H:%M'), MINUTES)]


def build_pair(name, cfg, legs):
    contracts, spot = load_contracts(cfg['root']), load_spot(cfg['spot'])
    if cfg.get('invert'):
        spot = 1.0 / spot
    fx = legs[name]; usd = legs['usd']
    days = sorted(set(spot.index.normalize()))
    rows = []
    for d in days:
        if d.weekday() >= 5:
            continue
        val = add_bdays(d, 2)
        choice = None
        for dlv in sorted(contracts):
            t = (dlv - val).days
            if t >= MIN_T:
                fc = contracts[dlv]
                if len(fc.loc[d:d + pd.Timedelta(hours=23, minutes=59)]):
                    choice = (dlv, t, fc); break
        if not choice:
            continue
        dlv, t, fc = choice
        fd = fc.loc[d:d + pd.Timedelta(hours=23, minutes=59)]
        sd = spot.loc[d:d + pd.Timedelta(hours=23, minutes=59)]
        j = pd.concat({'F': fd, 'S': sd}, axis=1, sort=True).dropna()
        if len(j) < 5:
            continue
        ru_live, rf_live = latest_before(usd, d), latest_before(fx, d)
        ru_real, rf_real = compounded(usd, val, dlv, 360), compounded(fx, val, dlv, cfg['fx_basis'])
        def bas(ru, rf):
            if not (np.isfinite(ru) and np.isfinite(rf)):
                return np.nan
            impl = (j.S * (1 + ru / 100 * t / 360) / j.F - 1) * cfg['fx_basis'] / t * 100   # implied foreign rate, %
            return float(((impl - rf) * 100).median())                                        # bp
        rows.append({'date': d, 'contract': dlv.strftime('%Y-%m'), 't_days': t, 'n_min': len(j),
                     'F': float(j.S.median() + (j.F - j.S).median()), 'S': float(j.S.median()), 'P': float((j.F - j.S).median()), 'r_usd_live': ru_live, 'r_fx_live': rf_live,
                     'basis_live': bas(ru_live, rf_live), 'basis_realised': bas(ru_real, rf_real),
                     'asof_live': d + pd.Timedelta(hours=19, minutes=15), 'asof_realised': dlv + pd.Timedelta(days=1)})
    df = pd.DataFrame(rows)
    # flags, trailing-only (usable live): a policy-rate step inside the last 5 sessions (the live leg lags a step that
    # futures had already priced), and a spike > 40bp from the trailing 10-day median (feed glitches such as
    # 2020-10-19..22, and genuine one-day squeezes -- kept in the CSV, dropped from the clean live feature)
    step = (df.r_usd_live.diff(5).abs() > 0.10) | (df.r_fx_live.diff(5).abs() > 0.10)
    df['flag_policy'] = step.rolling(5, min_periods=1).max().astype(bool)
    trail = df.basis_live.shift(1).rolling(10, min_periods=5).median()
    df['flag_spike'] = (df.basis_live - trail).abs() > 40
    # The spike flag is informational only: it also fires on genuine squeezes (Mar 2020, year-ends, Sep 2022 gilts),
    # which are what this series is for. Only documented feed faults are excluded (both pairs, impossible F-S gaps).
    df['flag_fault'] = df.date.isin(DATA_FAULTS) | df.date.isin(PAIR_FAULTS.get(name, []))
    df['basis_live_clean'] = df.basis_live.where(~df.flag_fault)          # level: faults removed; policy windows kept (flagged)
    # daily change at FIXED rate legs: today's F/S priced with yesterday's legs, minus yesterday's basis, same contract.
    # A policy step the futures had already priced cancels; a surprise in the implied differential still shows.
    fxb = cfg['fx_basis']
    prev = df.shift(1)
    same = (df.contract == prev.contract) & ~df.flag_fault & ~prev.flag_fault.fillna(True).astype(bool)
    def b_at(F, S, t, ru, rf):
        return ((S * (1 + ru / 100 * t / 360) / F - 1) * fxb / t * 100 - rf) * 100
    df['dchg'] = (b_at(df.F, df.S, df.t_days, prev.r_usd_live, prev.r_fx_live) - b_at(prev.F, prev.S, prev.t_days, prev.r_usd_live, prev.r_fx_live)).where(same)
    df.loc[df.flag_fault, 'basis_realised'] = np.nan
    return df


def write_feature(fid, df, col, asof_col, src):
    x = df[['date', col, asof_col]].dropna().rename(columns={col: 'value', asof_col: 'asof'})
    x['date'] = x['date'].dt.strftime('%Y-%m-%d')
    x['asof'] = pd.to_datetime(x['asof']).dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    x['vintage'] = None; x['source'] = src
    x[['date', 'asof', 'value', 'vintage', 'source']].to_parquet(os.path.join(FEAT, f'{fid}.parquet'), index=False)
    return len(x), x['date'].min(), x['date'].max()


def main():
    legs = overnight_legs()
    allp = []
    for name, cfg in PAIRS.items():
        df = build_pair(name, cfg, legs)
        df['pair'] = name
        allp.append(df)
        for var, col, asof in [('live', 'basis_live_clean', 'asof_live'), ('realised', 'basis_realised', 'asof_realised'), ('dchg', 'dchg', 'asof_live')]:
            n, a, b = write_feature(f'xccy_basis_{name}_{var}', df, col, asof, f'cme-nt8+oanda+fred:{cfg["root"]}')
            print(f'{name} {var}: {n} rows {a} -> {b}')
    out = pd.concat(allp)
    out.to_csv(os.path.join(OUT, 'basis_daily.csv'), index=False)
    # QA summary
    qa = {}
    for name in PAIRS:
        x = out[out.pair == name].set_index('date')
        bl, br = x.basis_live_clean, x.basis_realised
        same = x.contract == x.contract.shift()
        qa[name] = dict(days=len(x), live_median=float(bl.median()), realised_median=float(br.median()),
                        live_minus_realised_sd=float((bl - br).std()), daily_change_sd_live=float(bl.diff()[same].std()),
                        daily_change_abs_median=float(bl.diff()[same].abs().median()),
                        dchg_sd=float(x.dchg.std()), dchg_abs_median=float(x.dchg.abs().median()),
                        dchg_worst=[(str(k.date()), round(float(v), 1)) for k, v in x.dchg.sort_values().head(8).items()],
                        dchg_mar2020_sum=float(x.dchg['2020-03-01':'2020-03-31'].sum()),
                        flagged_policy=int(x.flag_policy.sum()), flagged_spike_info=int(x.flag_spike.sum()), excluded_faults=int(x.flag_fault.sum()),
                        spike_dates=[str(k.date()) for k in x.index[x.flag_spike]][:40],
                        mar2020_min_live=float(bl['2020-03-01':'2020-04-15'].min()), mar2020_min_realised=float(br['2020-03-01':'2020-04-15'].min()),
                        median_by_year_live={str(k): round(float(v), 1) for k, v in bl.groupby(bl.index.year).median().items()},
                        mean_t_days=float(x.t_days.mean()))
    json.dump(qa, open(os.path.join(OUT, 'qa.json'), 'w'), indent=2)
    print(json.dumps(qa, indent=1))


if __name__ == '__main__':
    main()
