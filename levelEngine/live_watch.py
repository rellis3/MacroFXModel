#!/usr/bin/env python3
"""
live_watch — turns the two validated NQ candidates (levelEngine/robustness_check.py,
confluence_velocity.py) into a live alert + forward-outcome log. NOT a trading bot:
places no orders, sizes no positions. It detects the exact touch condition the
backtest defines, Telegram-alerts the instant it fires, then keeps watching to
log what actually happened -- continuation, reversion, or no_react -- against the
SAME theta*sigma barriers the backtest used. This is the honest way to keep
validating these two leads: a real forward record, not another retrospective cut.

Deliberately reuses existing repo infrastructure instead of building new (same
philosophy as PatternBot/pattern_live_bot.mjs, which this is modeled on):
  - Live candles: GET /api/pattern-lab/live-candles/nq (OANDA, js/oandaIntraday.js).
    tf=1d for the sigma lookback, tf=1m for today's bars -- 1m was just added to
    the live route's PL_LIVE_GRAN (server.js) specifically for this, since the
    backtest's touch/barrier detection was measured bar-by-bar on M1.
  - Telegram: POST /api/telegram -- the dashboard already holds the bot
    token/chat id; this script never touches credentials.
  - Dedup/status state: GET/POST /api/kv/get|set, same pattern as pattern_bot_state
    / pattern_bot_status.
  - ALL touch/level/budget/velocity math is imported UNCHANGED from cog_levels.py,
    original_levels.py, and touch_engine.py -- the live detector cannot silently
    diverge from what the backtest actually measured, because it's the same code.

The two signals watched (from robustness_check.py / confluence_velocity.py --
neither cleared full Bonferroni significance, both are the strongest leads this
project produced; this log is what would eventually confirm or kill them):
  1. close_dn_med, budget_used < 0.4 (early-day touch), side=follow
  2. close_up_75,  velocity >= 0.45 (fast spike into the level), side=follow
  each checked under BOTH calc engines (cog, original) independently.

Config gate: KV key `level_engine_bot_config` = {enabled: bool}. Defaults OFF,
matching this repo's existing alert-bot convention (PatternBot) -- a fresh
deploy never starts alerting until someone opts in.

Run via `python3 levelEngine/live_watch.py` -- wired into start.sh as a
restart-on-crash background loop alongside the other bots.
"""
import os
import sys
import time
import json
from datetime import datetime, timezone

import numpy as np
import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'volatilityExhaustion'))
from vol_exhaustion_lib import london_parts  # noqa: E402
import cog_levels                            # noqa: E402
import original_levels                       # noqa: E402
from touch_engine import _level_series, _first_touch, UPSIDE, budget_used_at, velocity_at  # noqa: E402

DASHBOARD_URL = os.environ.get('DASHBOARD_URL', f"http://localhost:{os.environ.get('PORT', 3000)}")
POLL_SECONDS = int(os.environ.get('LEVEL_BOT_POLL_SECONDS', 60))   # M1-resolution signal -> poll every minute
REQUEST_TIMEOUT = 20

PAIR = 'nq'
ASSET_CLASS = 'index'
THETA = 0.25
HORIZON_MIN = 60
DAILY_LOOKBACK = 100   # 'D' candles for sigma warmup -- comfortably more than any window (YZ30/GARCH/HV20) needs

CALC_MODULES = {'cog': cog_levels, 'original': original_levels}

# The only two things this project has real (if not fully Bonferroni-significant)
# evidence for. Add here, don't hardcode elsewhere, if a future filter round
# produces a third.
SIGNALS = [
    dict(name='close_dn_med_low_budget', level='close_dn_med', side='follow',
         condition=lambda t: t['budget_used'] is not None and t['budget_used'] < 0.4),
    dict(name='close_up_75_high_velocity', level='close_up_75', side='follow',
         condition=lambda t: t['velocity'] is not None and t['velocity'] >= 0.45),
]

KV_CONFIG, KV_STATE, KV_STATUS, KV_LOG = (
    'level_engine_bot_config', 'level_engine_bot_state', 'level_engine_bot_status', 'level_engine_fwd_log',
)


# ── dashboard HTTP helpers (same routes/shape as PatternBot) ──────────────────
def api_get(path):
    r = requests.get(f'{DASHBOARD_URL}{path}', timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json()


def api_post(path, body):
    try:
        r = requests.post(f'{DASHBOARD_URL}{path}', json=body, timeout=REQUEST_TIMEOUT)
        return r.json()
    except Exception as e:
        return dict(ok=False, error=str(e))


def kv_get(key, default=None):
    res = api_get(f'/api/kv/get?key={key}')
    return default if res.get('miss') else res.get('data', default)


def kv_put(key, data):
    return api_post('/api/kv/set', dict(key=key, data=data, timestamp=int(time.time() * 1000)))


def send_telegram(message):
    return api_post('/api/telegram', dict(message=message, parseMode='HTML'))


def fetch_live_candles(pair, tf, count):
    res = api_get(f'/api/pattern-lab/live-candles/{pair}?tf={tf}&count={count}')
    if not res.get('ok'):
        raise RuntimeError(res.get('error', 'live-candles fetch failed'))
    return res['candles']   # ascending [{time, open, high, low, close}]


# ── sigma / today's bars, built from live candles via the SAME calc modules ──
def daily_sigma_and_pct(calc):
    """Fetch daily candles (through yesterday -- the live route only returns
    complete candles), append ONE placeholder 'today' row, and call the
    UNCHANGED daily_sigma_fraction()/pct_from_sigma() from cog_levels.py /
    original_levels.py. The placeholder's own OHLC values are never read by
    those functions when computing the LAST index's forecast (every estimator
    there is causal: pred[-1] depends only on days strictly before it) -- this
    is exactly how build_level_frame's per-day sigma[i] already works, just
    stopped one day short of a live 'today' that doesn't exist as history yet.
    """
    candles = fetch_live_candles(PAIR, '1d', DAILY_LOOKBACK)
    if len(candles) < 35:
        raise RuntimeError(f'only {len(candles)} daily candles -- not enough sigma warmup')
    o = np.array([c['open'] for c in candles] + [candles[-1]['close']])
    h = np.array([c['high'] for c in candles] + [candles[-1]['close']])
    lo = np.array([c['low'] for c in candles] + [candles[-1]['close']])
    c_ = np.array([c['close'] for c in candles] + [candles[-1]['close']])
    daily = dict(open=o, high=h, low=lo, close=c_)

    mod = CALC_MODULES[calc]
    sigma_series = mod.daily_sigma_fraction(daily, ASSET_CLASS)
    sigma_today = float(sigma_series[-1])
    pct = mod.pct_from_sigma(sigma_today) if calc == 'cog' else mod.pct_from_sigma(sigma_today, ASSET_CLASS)
    return sigma_today, pct


def today_bars():
    """Today's (London calendar day) M1 bars so far, ascending, as numpy arrays
    -- same day-boundary rule (Europe/London) as the whole backtest."""
    candles = fetch_live_candles(PAIR, '1m', 1440)
    if not candles:
        return None
    utc_min = np.array([c['time'] // 60 for c in candles], dtype=np.int64)
    day_idx, _ = london_parts(utc_min)
    today_idx = day_idx[-1]                       # the most recent bar's London day
    mask = day_idx == today_idx
    if mask.sum() < 2:
        return None
    return dict(
        time=utc_min[mask] * 60,
        open=np.array([c['open'] for c in candles])[mask],
        high=np.array([c['high'] for c in candles])[mask],
        low=np.array([c['low'] for c in candles])[mask],
        close=np.array([c['close'] for c in candles])[mask],
    )


# ── alert message / KV log record ──────────────────────────────────────────
def fmt_alert(calc, signal, level_px, budget_used, velocity, cont_px, rev_px):
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    lines = [
        f"\U0001F4CD <b>NQ {signal['level']}</b> touched -- {signal['name']} ({calc})",
        f"Time: {now}",
        f"Touch price: {level_px:.2f}",
        f"budget_used={budget_used:.2f}" if budget_used is not None else '',
        f"velocity={velocity:.2f}" if velocity is not None else '',
        f"Predicted: <b>{signal['side']}</b> -- continuation target {cont_px:.2f} / reversion {rev_px:.2f} within {HORIZON_MIN}min",
        "<i>Signal, not a trade. Forward-tracked -- result posted when it resolves.</i>",
    ]
    return '\n'.join(l for l in lines if l)


def fmt_result(rec):
    outcome = rec['outcome']
    emoji = {'continuation': '✅', 'reversion': '❌', 'no_react': '➖'}.get(outcome, '')
    right = (outcome == 'continuation') if rec['side'] == 'follow' else (outcome == 'reversion')
    verdict = 'RIGHT' if right and outcome != 'no_react' else ('WRONG' if outcome != 'no_react' else 'NO REACT')
    return (f"{emoji} <b>Result</b> -- NQ {rec['level']} ({rec['signal']}, {rec['calc']}): "
            f"{outcome} -- {verdict}\nFired {datetime.fromtimestamp(rec['touch_time'], tz=timezone.utc).strftime('%H:%M UTC')}, "
            f"resolved {datetime.now(timezone.utc).strftime('%H:%M UTC')}")


# ── detect new touches ──────────────────────────────────────────────────────
def detect(state, log, alerts_sent):
    bars = today_bars()
    if bars is None or bars['high'].size < 2:
        return
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    for calc in CALC_MODULES:
        sigma_today, pct = daily_sigma_and_pct(calc)
        dl = dict(open=float(bars['open'][0]), hl50=pct['hl50'], hl75=pct['hl75'],
                  oc50=pct['oc50'], oc75=pct['oc75'])
        series_by_level = _level_series(dl, bars['high'], bars['low'])
        barrier_price = THETA * sigma_today * dl['open']

        for signal in SIGNALS:
            level = signal['level']
            series = series_by_level[level]
            touch_idx = _first_touch(level, series, bars['high'], bars['low'])
            if touch_idx is None:
                continue
            budget_used = budget_used_at(touch_idx, series_by_level['_prior_low'],
                                          series_by_level['_prior_high'], dl['hl50'], dl['open'])
            velocity = velocity_at(level, touch_idx, bars['close'], sigma_today)
            if not signal['condition'](dict(budget_used=budget_used, velocity=velocity)):
                continue

            fired_key = f"{signal['name']}:{calc}:{today_str}"
            if fired_key in state['fired']:
                continue

            level_px = float(series[touch_idx])
            if level in UPSIDE:
                cont_px, rev_px = level_px + barrier_price, level_px - barrier_price
            else:
                cont_px, rev_px = level_px - barrier_price, level_px + barrier_price

            msg = fmt_alert(calc, signal, level_px, budget_used, velocity, cont_px, rev_px)
            res = send_telegram(msg)
            if res.get('ok'):
                alerts_sent['sent'] += 1
            else:
                alerts_sent['failed'] += 1
                print(f'[level-bot] telegram send failed: {res.get("error")}')

            state['fired'][fired_key] = True
            log.append(dict(
                signal=signal['name'], calc=calc, level=level, side=signal['side'],
                touch_time=int(bars['time'][touch_idx]), level_px=level_px,
                cont_px=cont_px, rev_px=rev_px, barrier_price=barrier_price,
                budget_used=budget_used, velocity=velocity,
                horizon_min=HORIZON_MIN, resolved=False, outcome=None,
            ))
            print(f'[level-bot] ALERT {fired_key} @ {level_px:.2f}')


# ── resolve pending signals against fresh live bars ─────────────────────────
def resolve(log, results_sent):
    pending = [r for r in log if not r['resolved']]
    if not pending:
        return
    recent = fetch_live_candles(PAIR, '1m', 200)   # comfortably spans any HORIZON_MIN=60 window
    if not recent:
        return
    now = int(time.time())

    for rec in pending:
        window = [c for c in recent if rec['touch_time'] < c['time'] <= rec['touch_time'] + rec['horizon_min'] * 60]
        outcome = None
        for c in window:
            hit_cont = (c['high'] >= rec['cont_px']) if rec['level_px'] < rec['cont_px'] else (c['low'] <= rec['cont_px'])
            hit_rev = (c['high'] >= rec['rev_px']) if rec['level_px'] < rec['rev_px'] else (c['low'] <= rec['rev_px'])
            if hit_cont and hit_rev:
                outcome = 'ambiguous'
                break
            if hit_cont:
                outcome = 'continuation'
                break
            if hit_rev:
                outcome = 'reversion'
                break
        if outcome is None and now > rec['touch_time'] + rec['horizon_min'] * 60:
            outcome = 'no_react'   # horizon expired, neither barrier hit
        if outcome is None:
            continue   # still open, nothing to do yet

        rec['outcome'] = outcome
        rec['resolved'] = True
        res = send_telegram(fmt_result(rec))
        if res.get('ok'):
            results_sent['sent'] += 1
        else:
            results_sent['failed'] += 1
        print(f"[level-bot] RESOLVED {rec['signal']}:{rec['calc']} -> {outcome}")


# ── main cycle ────────────────────────────────────────────────────────────
def run_once():
    config = kv_get(KV_CONFIG, {}) or {}
    if config.get('enabled') is not True:
        kv_put(KV_STATUS, dict(lastRunAt=datetime.now(timezone.utc).isoformat(), enabled=False))
        print('[level-bot] disabled (set level_engine_bot_config.enabled=true to turn on) -- skipping cycle')
        return

    state = kv_get(KV_STATE, {}) or {}
    state.setdefault('fired', {})
    log = kv_get(KV_LOG, []) or []
    alerts_sent = dict(sent=0, failed=0)
    results_sent = dict(sent=0, failed=0)
    error = None

    try:
        detect(state, log, alerts_sent)
        resolve(log, results_sent)
    except Exception as e:
        error = str(e)
        print(f'[level-bot] cycle error: {error}')

    kv_put(KV_STATE, state)
    kv_put(KV_LOG, log)
    kv_put(KV_STATUS, dict(
        lastRunAt=datetime.now(timezone.utc).isoformat(), enabled=True,
        alertsSent=alerts_sent['sent'], alertsFailed=alerts_sent['failed'],
        resultsSent=results_sent['sent'], resultsFailed=results_sent['failed'],
        pendingCount=sum(1 for r in log if not r['resolved']), error=error,
    ))


def main():
    print(f'[level-bot] starting -- NQ, {len(SIGNALS)} signals x {len(CALC_MODULES)} calcs, '
          f'poll every {POLL_SECONDS}s, dashboard={DASHBOARD_URL}')
    while True:
        try:
            run_once()
        except Exception as e:
            print(f'[level-bot] cycle crashed: {e}')
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
