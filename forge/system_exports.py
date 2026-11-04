"""The standard system outputs for Python studies: the mirror of js/systemExports.js (plan §9ac).

Writes analysis/output/systems/<id>/: trades.json, toolkit_pct.csv, toolkit_r.csv, toolkit_cash.csv and
data_terminal.csv, byte-identical to the JS writer for the same trades (both are checked against
tests/fixtures/system_exports/). The tearsheet.json is computed by the JS side: after a Python study writes its
trades, run `node scripts/systems/writeSystemOutputs.mjs <id> analysis/output/systems/<id>/trades.json` (or let the
server compute it on request: /api/system-backtest?id=<id>).

    from forge.system_exports import write_system_outputs
    write_system_outputs('ppp-gap', trades, model='PPP gap')

Trade dict: instrument, direction ('Long'/'Short'), entryMs, exitMs (UTC epoch ms), R, and optionally riskPct (1),
maeR, mfeR, returnPct, maePct, mfePct, entry, stop, exit, model, tags (list), notes.
"""
from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LDN = ZoneInfo('Europe/London')
TOOLKIT_HEADERS = {'pct': 'Date,Return %,MAE %', 'r': 'date,R,MAE (R)', 'cash': 'Trade Date,PnL ($),Risk ($)'}
TERMINAL_HEADER = ['Date', 'Time', 'Exit Date', 'Exit Time', 'Instrument', 'Direction', 'Model', 'Risk %', 'Return %', 'MAE %', 'MFE %', 'Tags', 'Notes']
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fin(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def london(ms):
    if not _fin(ms):
        return '', ''
    t = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(LDN)
    return t.strftime('%Y-%m-%d'), t.strftime('%H:%M')


def _num(x, d=4):
    """JS String(+x.toFixed(d)): shortest form of the rounded value, no trailing .0."""
    if not _fin(x):
        return ''
    r = round(x + 0.0, d)
    if r == 0:
        return '0'
    return str(int(r)) if r == int(r) else repr(r)


def normalise_trades(raw, risk_pct=1.0, model=''):
    out, errors = [], []
    for i, t in enumerate(raw or []):
        side = str(t.get('direction', t.get('side', ''))).lower()
        d = 'Long' if side in ('long', 'buy', '1') else 'Short' if side in ('short', 'sell', '-1') else None
        rp = t['riskPct'] if _fin(t.get('riskPct')) else risk_pct
        R = t['R'] if _fin(t.get('R')) else (t['returnPct'] / rp if _fin(t.get('returnPct')) and rp > 0 else None)
        if not t.get('instrument') or not d or not _fin(t.get('exitMs')) or not _fin(R):
            errors.append(f'trade {i}: needs instrument, direction, exitMs and R (or returnPct)')
            continue
        mae = t['maeR'] if _fin(t.get('maeR')) else (t['maePct'] / rp if _fin(t.get('maePct')) and rp > 0 else None)
        mfe = t['mfeR'] if _fin(t.get('mfeR')) else (t['mfePct'] / rp if _fin(t.get('mfePct')) and rp > 0 else None)
        tags = t.get('tags') or []
        out.append({
            'instrument': str(t['instrument']), 'direction': d, 'entryMs': t['entryMs'] if _fin(t.get('entryMs')) else t['exitMs'], 'exitMs': t['exitMs'],
            'entry': t.get('entry'), 'stop': t.get('stop'), 'target': t.get('target', t.get('tp')), 'exit': t.get('exit'), 'pair': t.get('pair'), 'riskPct': rp, 'R': R,
            'maeR': min(0, mae) if _fin(mae) else None, 'mfeR': max(0, mfe) if _fin(mfe) else None,
            'returnPct': t['returnPct'] if _fin(t.get('returnPct')) else R * rp,
            'maePct': t['maePct'] if _fin(t.get('maePct')) else (min(0, mae) * rp if _fin(mae) else None),
            'mfePct': t['mfePct'] if _fin(t.get('mfePct')) else (max(0, mfe) * rp if _fin(mfe) else None),
            'features': t.get('features') if isinstance(t.get('features'), dict) else None,
            'model': t.get('model') or model, 'tags': tags if isinstance(tags, list) else [x for x in str(tags).replace(',', ' ').split() if x],
            'notes': t.get('notes') or '',
        })
    out.sort(key=lambda x: (x['exitMs'], x['entryMs']))
    return out, errors


def _esc(v):
    s = '' if v is None else str(v)
    return '"' + s.replace('"', '""') + '"' if any(c in s for c in ',"\n') else s


def _js(v):
    """How JS template-literal interpolation prints a stored price (1.035 → 1.035, 2.0 → 2)."""
    return str(int(v)) if _fin(v) and v == int(v) else str(v)


def toolkit_csv(trades, kind='pct', account=100000.0, risk_pct=None):
    rows = [TOOLKIT_HEADERS[kind]]
    for t in trades:
        d = london(t['exitMs'])[0]
        mae_r = t['maeR'] if _fin(t.get('maeR')) else min(0, t['R'])
        rp = risk_pct if risk_pct is not None else t['riskPct']
        if kind == 'pct':
            rows.append(f"{d},{_num(t['returnPct'])},{_num(t['maePct'] if _fin(t.get('maePct')) else mae_r * t['riskPct'])}")
        elif kind == 'r':
            rows.append(f"{d},{_num(t['R'])},{_num(mae_r)}")
        else:
            risk = account * rp / 100
            rows.append(f"{d},{t['R'] * risk:.2f},{risk:.2f}")
    return '\n'.join(rows) + '\n'


def terminal_csv(trades):
    rows = [','.join(TERMINAL_HEADER)]
    for t in trades:
        d, tm = london(t['entryMs'])
        ed, et = london(t['exitMs'])
        notes = t.get('notes') or '; '.join(x for x in [
            f"entry {_js(t['entry'])}" if t.get('entry') is not None else '',
            f"SL {_js(t['stop'])}" if t.get('stop') is not None else '',
            f"exit {_js(t['exit'])}" if t.get('exit') is not None else ''] if x)
        rows.append(','.join(_esc(v) for v in [d, tm, ed, et, t['instrument'], t['direction'], t['model'], _num(t['riskPct']),
                                               _num(t['returnPct']), _num(t.get('maePct')), _num(t.get('mfePct')), ' '.join(t['tags']), notes]))
    return '\n'.join(rows) + '\n'


def write_system_outputs(sys_id, raw, model='', account=100000.0, meta=None, out_dir=None):
    trades, errors = normalise_trades(raw, model=model)
    if not trades:
        raise ValueError('no usable trades: ' + '; '.join(errors[:3]))
    d = out_dir or os.path.join(ROOT, 'analysis', 'output', 'systems', sys_id)
    os.makedirs(d, exist_ok=True)
    files = {
        'trades.json': '{"id":' + json.dumps(sys_id) + ',"meta":' + json.dumps({**(meta or {}), 'model': model, 'skipped': len(errors), 'writer': 'python'}) + ',"trades":[\n' + ',\n'.join(json.dumps(t) for t in trades) + '\n]}\n',
        'toolkit_pct.csv': toolkit_csv(trades, 'pct'), 'toolkit_r.csv': toolkit_csv(trades, 'r'),
        'toolkit_cash.csv': toolkit_csv(trades, 'cash', account=account), 'data_terminal.csv': terminal_csv(trades),
    }
    for f, body in files.items():
        with open(os.path.join(d, f), 'w', newline='') as fh:
            fh.write(body)
    return {'dir': d, 'trades': len(trades), 'skipped': len(errors), 'files': list(files)}
