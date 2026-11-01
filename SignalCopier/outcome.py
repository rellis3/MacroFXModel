"""What a signal did, measured on M1 bars — one resolver for live and backfill.

Pure: a signal dict + bars in, an outcome dict out. The live bot re-runs it on
each open signal as new bars arrive; the history backfill runs it once per past
signal. Both therefore score a signal the same way.

Fill rules (conservative where the bar can't tell us the order of events):
  market  fills at ``recv_px`` (the mid the bot saw when the message arrived),
          else at the open of the first bar after the post
  limit   fills AT its price on the first bar after the post that trades
          through it, before its cancel-at time
  stop    fills at max(price, bar open) for a buy (gaps cost you), mirrored for a sell
Exit: SL or TP on a bar's range. If one bar holds both, SL wins. A limit's fill
bar can stop it out but not take profit. A timed or channel close exits at the
open of the first bar at/after that time. One full spread is charged per trade.

Bars are ``{time, open, high, low, close}`` with ``time`` = bar open, UTC epoch.
``now`` (live only) lets a resting order past its cancel time with no fill in
the bars resolve as unfilled before a later bar arrives.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

UK = ZoneInfo('Europe/London')
TEMPLATE_HEADER = ['Date', 'Time', 'Exit Date', 'Exit Time', 'Instrument', 'Direction', 'Model',
                   'Risk %', 'Return %', 'MAE %', 'MFE %', 'Tags', 'Notes']


def resolve(sig, bars, spread=0.0, now=None):
    d = 1 if sig['side'] == 'BUY' else -1
    entry, sl, tp = sig['entry'], sig.get('sl'), sig.get('tp')
    posted = sig['posted_ts']
    cancel_ts, close_ts = sig.get('cancel_ts'), sig.get('close_ts')
    after = [b for b in bars if b['time'] >= posted]
    out = {'state': 'waiting', 'fill_ts': None, 'fill_px': None, 'exit_ts': None, 'exit_px': None,
           'exit_reason': None, 'best_px': None, 'worst_px': None}

    # ── fill ─────────────────────────────────────────────────────────────
    i0 = None
    if sig['order'] == 'market':
        fill = sig.get('recv_px') or (after[0]['open'] if after else None)
        if fill is None:
            return out
        out.update(fill_ts=posted, fill_px=fill)
        i0, tp_from = 0, 0
    else:
        for i, b in enumerate(after):
            if (cancel_ts and b['time'] >= cancel_ts) or (close_ts and b['time'] >= close_ts):
                out['state'] = 'unfilled'
                return out
            if sig['order'] == 'limit':
                hit = b['low'] <= entry if d > 0 else b['high'] >= entry
                px = entry
            else:
                hit = b['high'] >= entry if d > 0 else b['low'] <= entry
                px = max(entry, b['open']) if d > 0 else min(entry, b['open'])
            if hit:
                out.update(fill_ts=b['time'], fill_px=px)
                i0, tp_from = i, i + 1
                break
        if i0 is None:
            # past its cancel / close time with no fill in the bars we have
            if now is not None and any(t and now >= t for t in (cancel_ts, close_ts)):
                out['state'] = 'unfilled'
            return out
    fill = out['fill_px']
    best = worst = fill
    out['state'] = 'open'

    # ── manage ───────────────────────────────────────────────────────────
    for i in range(i0, len(after)):
        b = after[i]
        if close_ts and b['time'] >= close_ts:
            out.update(state='done', exit_ts=b['time'], exit_px=b['open'],
                       exit_reason=sig.get('close_reason') or 'close')
            break
        hi, lo = b['high'], b['low']
        sl_hit = sl is not None and (lo <= sl if d > 0 else hi >= sl)
        tp_hit = tp is not None and i >= tp_from and (hi >= tp if d > 0 else lo <= tp)
        if sl_hit:
            worst = sl if d > 0 and sl < worst or d < 0 and sl > worst else worst
            out.update(state='done', exit_ts=b['time'], exit_px=sl, exit_reason='sl')
            break
        if tp_hit:
            worst = min(worst, lo) if d > 0 else max(worst, hi)
            best = tp if d > 0 and tp > best or d < 0 and tp < best else best
            out.update(state='done', exit_ts=b['time'], exit_px=tp, exit_reason='tp')
            break
        best = max(best, hi) if d > 0 else min(best, lo)
        worst = min(worst, lo) if d > 0 else max(worst, hi)
    out.update(best_px=best, worst_px=worst)
    if out['state'] == 'open' and after:          # no exit yet: mark at the latest bar
        out.update(mark_px=after[-1]['close'], mark_ts=after[-1]['time'])
    out.update(_r_stats(d, fill, sl, out['exit_px'] if out['state'] == 'done' else
                        (after[-1]['close'] if after else fill), best, worst, spread))
    return out


def _r_stats(d, fill, sl, mark, best, worst, spread):
    risk = abs(fill - sl) if sl is not None else 0
    if not risk:
        return {'r': None, 'mae_r': None, 'mfe_r': None, 'cost_r': None}
    cost = spread / risk
    return {'r': round(d * (mark - fill) / risk - cost, 4),
            'mae_r': round(max(0.0, d * (fill - worst) / risk + cost), 4),
            'mfe_r': round(max(0.0, d * (best - fill) / risk - cost), 4),
            'cost_r': round(cost, 4)}


def _uk(ts):
    t = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(UK)
    return t.strftime('%Y-%m-%d'), t.strftime('%H:%M')


def template_row(sig, out, risk_pct=1.0):
    """The COG import-template row for a finished (or still-open) signal.
    Times are UK. Return/MAE/MFE are % of account at ``risk_pct`` per 1R."""
    if out.get('fill_ts') is None or out.get('r') is None:
        return None
    d, t = _uk(out['fill_ts'])
    ed, et = _uk(out['exit_ts']) if out.get('exit_ts') else ('', '')
    style = sig.get('style') or 'single'
    tags = [style, sig['order'], out.get('exit_reason') or 'open']
    notes = (f"entry {out['fill_px']:g} SL {sig['sl']:g}"
             + (f" TP {sig['tp']:g}" if sig.get('tp') is not None else '')
             + (f"; exit {out['exit_reason']} @ {out['exit_px']:g}" if out.get('exit_px') is not None else '; still open')
             + f"; spread {out['cost_r']:.3f}R paid; times UK; ColezTrades signal {sig.get('id', '')}")
    return {
        'Date': d, 'Time': t, 'Exit Date': ed, 'Exit Time': et,
        'Instrument': sig['symbol'], 'Direction': 'Long' if sig['side'] == 'BUY' else 'Short',
        'Model': f"ColezTrades {style.title()}",
        'Risk %': round(risk_pct, 4),
        'Return %': round(out['r'] * risk_pct, 4),
        'MAE %': round(out['mae_r'] * risk_pct, 4),
        'MFE %': round(out['mfe_r'] * risk_pct, 4),
        'Tags': ' '.join(tags), 'Notes': notes,
    }


def to_csv(rows):
    def esc(v):
        s = '' if v is None else str(v)
        return '"' + s.replace('"', '""') + '"' if any(c in s for c in ',"\n') else s
    return '\n'.join([','.join(TEMPLATE_HEADER)] + [','.join(esc(r.get(h)) for h in TEMPLATE_HEADER) for r in rows]) + '\n'
