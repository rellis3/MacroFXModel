"""overnight-hold-toolkit: the banked overnight-hold trades through a prop-toolkit replica.

Prereg: forge/OVERNIGHT_HOLD_TOOLKIT_PREREG.md. Replica of C.OG's Prop Firm Toolkit method as its page describes it
(block bootstrap of the trade history, a real program's rules); his code is password-protected and was not read.

Writes analysis/output/overnight-hold-toolkit/: toolkit_{nq,gold,combined}_{gross,net}.csv (his exact upload format),
results.json.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'analysis/output/overnight-hold'
OUT = ROOT / 'analysis/output/overnight-hold-toolkit'
SEED = 20261025
PATHS = 5000
BLOCK = 5
MAX_DAYS = 500
SIZES = [0.5, 1, 2, 3, 5]
# banked 95% CI of mean net per trade (analysis/output/overnight-hold/RESULTS.md)
NET_CI = {'nq': (0.0011, 0.0660), 'gold': (-0.0092, 0.0538)}

FTMO = dict(name='FTMO 2-step', phases=[0.10, 0.05], max_loss=0.10, daily=0.05, min_days=4, time_limit=None)
GENERIC = dict(name='generic (engine)', phases=[0.08], max_loss=0.10, daily=0.05, min_days=1, time_limit=30,
               trailing=True, consistency=0.30)


def load(key):
    t = pd.read_csv(SRC / f'honest_trades_{key}.csv')
    gross = pd.DataFrame({'Date': t.exitDate, 'Return %': t.grossPct, 'MAE %': np.minimum(t.maePct, 0)})
    net = pd.DataFrame({'Date': t.exitDate, 'Return %': t.net,
                        'MAE %': np.minimum(t.maePct, 0) - t.spread - t.financing})
    return gross, net


def combine(a, b):
    """Third pass: both instruments at half size, aggregated by exit date (worst points assumed simultaneous)."""
    m = pd.concat([a.assign(w=0.5), b.assign(w=0.5)])
    m['r'] = m['Return %'] * m.w
    m['m'] = m['MAE %'] * m.w
    g = m.groupby('Date').agg(r=('r', 'sum'), m=('m', 'sum')).reset_index()
    return pd.DataFrame({'Date': g.Date, 'Return %': g.r, 'MAE %': g.m})


def draws(rng, n_rows, n_paths, n_days):
    """Indices for a block bootstrap: blocks of BLOCK consecutive rows, start uniform, wrapping."""
    nb = -(-n_days // BLOCK)
    starts = rng.integers(0, n_rows, size=(n_paths, nb))
    idx = (starts[:, :, None] + np.arange(BLOCK)[None, None, :]) % n_rows
    return idx.reshape(n_paths, nb * BLOCK)[:, :n_days]


def first_true(a):
    """Index of first True per row, or -1."""
    has = a.any(axis=1)
    return np.where(has, a.argmax(axis=1), -1)


def run_phase(rng, r, m, k, target, rules):
    """One challenge phase from balance 1.0. Returns outcome codes (1 pass, 0 fail, 2 timeout) and days used."""
    n_days = rules['time_limit'] or MAX_DAYS
    idx = draws(rng, len(r), PATHS, n_days)
    R = k * r[idx] / 100.0
    M = k * m[idx] / 100.0
    E = np.cumprod(1.0 + R, axis=1)
    Eprev = np.concatenate([np.ones((PATHS, 1)), E[:, :-1]], axis=1)
    low = Eprev * (1.0 + M)
    fail = (low < Eprev - rules['daily']) | (low < 1.0 - rules['max_loss']) | (E < 1.0 - rules['max_loss'])
    if rules.get('trailing'):
        peak = np.maximum.accumulate(np.concatenate([np.ones((PATHS, 1)), E], axis=1), axis=1)[:, :-1]
        fail |= low < peak - rules['max_loss']
    day = np.arange(1, n_days + 1)[None, :]
    hit = (E >= 1.0 + target) & (day >= rules['min_days'])
    if rules.get('consistency'):
        gain = E - Eprev
        best = np.maximum.accumulate(np.maximum(gain, 0), axis=1)
        cons_bad = hit & (best > rules['consistency'] * (E - 1.0))
    fi, hi = first_true(fail), first_true(hit)
    out = np.full(PATHS, 2)
    days = np.full(PATHS, n_days)
    passed = (hi >= 0) & ((fi < 0) | (hi < fi))
    failed = (fi >= 0) & ((hi < 0) | (fi <= hi))
    out[passed] = 1
    days[passed] = hi[passed] + 1
    out[failed] = 0
    days[failed] = fi[failed] + 1
    reason = {'daily_or_maxloss': int(failed.sum())}
    if rules.get('consistency'):
        c = passed & cons_bad[np.arange(PATHS), np.maximum(hi, 0)]
        out[c] = 0
        reason['consistency'] = int(c.sum())
    return out, days, reason


def funded_stage(rng, r, m, k, rules, n_paths):
    """12 months funded: 80% of month-end profit paid out and balance reset; a breach ends the account."""
    if n_paths == 0:
        return 0.0, 0.0
    idx = draws(rng, len(r), n_paths, 252)
    R, M = k * r[idx] / 100.0, k * m[idx] / 100.0
    E = np.ones(n_paths)
    alive = np.ones(n_paths, bool)
    paid = np.zeros(n_paths)
    for d in range(252):
        low = E * (1 + M[:, d])
        breach = alive & ((low < E - rules['daily']) | (low < 1 - rules['max_loss']))
        alive &= ~breach
        E = np.where(alive, E * (1 + R[:, d]), E)
        alive &= E >= 1 - rules['max_loss']
        if (d + 1) % 21 == 0:
            pay = alive & (E > 1)
            paid[pay] += 0.8 * (E[pay] - 1)
            E[pay] = 1.0
    return float(paid.mean()), float(1 - alive.mean())


def simulate(rows, k, rules, rng):
    r = rows['Return %'].to_numpy(float)
    m = rows['MAE %'].to_numpy(float)
    alive = np.ones(PATHS, bool)
    days = np.zeros(PATHS)
    per_phase = []
    for tgt in rules['phases']:
        out, d, reason = run_phase(rng, r, m, k, tgt, rules)
        per_phase.append({'pass': float((out == 1).mean()), 'fail': float((out == 0).mean()),
                          'timeout': float((out == 2).mean()), **reason})
        days += np.where(alive, d, 0)
        alive &= out == 1
    funded = float(alive.mean())
    res = {'funded': funded, 'phases': per_phase,
           'median_days_to_funded': float(np.median(days[alive])) if alive.any() else None}
    if rules is FTMO:
        payout, blown = funded_stage(rng, r, m, k, rules, int(alive.sum()))
        res['payout_12m_pct_of_account'] = 100 * payout
        res['funded_blown_12m'] = blown
        res['breakeven_fee_pct_of_account'] = 100 * funded * payout
    return res


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    books = {}
    for key in ('nq', 'gold'):
        books[key] = dict(zip(('gross', 'net'), load(key)))
    books['combined'] = {c: combine(books['nq'][c], books['gold'][c]) for c in ('gross', 'net')}
    for b, d in books.items():
        for c, df in d.items():
            df.to_csv(OUT / f'toolkit_{b}_{c}.csv', index=False, float_format='%.4f')

    results = {'seed': SEED, 'paths': PATHS, 'block': BLOCK, 'sizes': SIZES, 'books': {}}
    for b, d in books.items():
        rb = {}
        variants = {'gross': d['gross'], 'net': d['net']}
        for c in ('gross', 'net'):
            df = d[c]
            z = df.copy()
            mu = df['Return %'].mean()
            z['Return %'] -= mu
            z['MAE %'] -= mu
            variants[f'{c}_zero_edge'] = z
        if b in NET_CI:
            mu = d['net']['Return %'].mean()
            for tag, edge in zip(('net_ci_low', 'net_ci_high'), NET_CI[b]):
                s = d['net'].copy()
                s['Return %'] += edge - mu
                s['MAE %'] += edge - mu
                variants[tag] = s
        for v, df in variants.items():
            rb[v] = {'mean_return_pct': float(df['Return %'].mean()), 'rows': int(len(df)), 'ftmo': {}, 'generic': {}}
            for k in SIZES:
                rb[v]['ftmo'][str(k)] = simulate(df, k, FTMO, rng)
                rb[v]['generic'][str(k)] = simulate(df, k, GENERIC, rng)
            print(b, v, {k: round(rb[v]['ftmo'][str(k)]['funded'], 3) for k in SIZES})
        results['books'][b] = rb
    results['posthoc_A1'] = posthoc(books, rng)
    (OUT / 'results.json').write_text(json.dumps(results, indent=1))


def historical(rows, k, rules=FTMO, step=21):
    """POST-HOC (A1): FTMO 2-step on the actual trade sequence, a fresh attempt every `step` rows, no resampling."""
    r = rows['Return %'].to_numpy(float) * k / 100
    m = rows['MAE %'].to_numpy(float) * k / 100
    tally = {'funded': 0, 'failed': 0, 'unfinished': 0}
    days = []
    for s in range(0, len(r), step):
        i, ok = s, True
        for tgt in rules['phases']:
            E, n = 1.0, 0
            while True:
                if i >= len(r):
                    ok = None
                    break
                low = E * (1 + m[i])
                if low < E - rules['daily'] or low < 1 - rules['max_loss']:
                    ok = False
                    i += 1
                    break
                E *= 1 + r[i]
                i += 1
                n += 1
                if E < 1 - rules['max_loss']:
                    ok = False
                    break
                if E >= 1 + tgt and n >= rules['min_days']:
                    break
            if ok is not True:
                break
        tally['funded' if ok else ('failed' if ok is False else 'unfinished')] += 1
        if ok:
            days.append(i - s)
    done = tally['funded'] + tally['failed']
    return {**tally, 'funded_of_finished': tally['funded'] / done if done else None,
            'median_days': float(np.median(days)) if days else None}


def posthoc(books, rng):
    """POST-HOC (A1, results seen): historical sequence and a month-long bootstrap block, k = 1, descriptive."""
    global BLOCK
    out = {}
    for b, d in books.items():
        for c in ('gross', 'net'):
            out[f'{b}_{c}_historical_k1'] = historical(d[c], 1)
            out[f'{b}_{c}_historical_k0.5'] = historical(d[c], 0.5)
    saved, BLOCK = BLOCK, 21
    for b, d in books.items():
        df = d['net']
        z = df.copy()
        z['Return %'] -= df['Return %'].mean()
        z['MAE %'] -= df['Return %'].mean()
        out[f'{b}_net_block21_k1'] = simulate(df, 1, FTMO, rng)['funded']
        out[f'{b}_net_zero_edge_block21_k1'] = simulate(z, 1, FTMO, rng)['funded']
    BLOCK = saved
    print(json.dumps(out, indent=1))
    return out


if __name__ == '__main__':
    main()
