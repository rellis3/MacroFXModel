"""
Feature detectors + direction scoring.
Faithful Python port of backtest-engine.js feature functions.

Bar conventions (matching JS engine):
  bars_5m_rev  — newest-first M5 list
  bars_30m     — oldest-first M30 list
  daily_bars   — oldest-first daily list
"""

import logging
from indicators import (
    compute_atr, compute_ema, compute_wavetrend, compute_money_flow,
    compute_rsi_normalized, osc_divergence, compute_adx, compute_hurst, compute_macd,
)

log = logging.getLogger(__name__)


# ── Boundary helper ───────────────────────────────────────────────────────────

def _nearest_boundary(price: float, asia: dict | None, monday: dict | None, atr: float) -> dict | None:
    """Return the range boundary (high or low) closest to price within ATR×0.22."""
    candidates = []
    if asia:
        candidates += [
            {'lvl': asia['high'],   'side': 'resistance', 'src': 'Asia H'},
            {'lvl': asia['low'],    'side': 'support',    'src': 'Asia L'},
        ]
    if monday:
        candidates += [
            {'lvl': monday['high'], 'side': 'resistance', 'src': 'Mon H'},
            {'lvl': monday['low'],  'side': 'support',    'src': 'Mon L'},
        ]
    prox = atr * 0.22
    near = [c for c in candidates if abs(price - c['lvl']) <= prox]
    if not near:
        return None
    return min(near, key=lambda c: abs(price - c['lvl']))


# ── Feature detectors ─────────────────────────────────────────────────────────

def feature_range_position(price: float, asia: dict | None, monday: dict | None, atr: float) -> dict:
    sources = [s for s in [
        {'src': 'Asia',   **asia}   if asia   else None,
        {'src': 'Monday', **monday} if monday else None,
    ] if s]
    if not sources:
        return {'signal': None, 'val': 'No range data'}
    best = min(sources, key=lambda r: min(abs(price - r['low']), abs(price - r['high'])))
    if min(abs(price - best['low']), abs(price - best['high'])) > atr * 0.22:
        return {'signal': None, 'val': 'Not at range boundary'}
    pos = (price - best['low']) / best['range']
    pct = round(pos * 100)
    if pos <= 0.20:
        return {'signal': 'long',  'val': f"{best['src']} bottom {pct}% — long zone"}
    if pos >= 0.80:
        return {'signal': 'short', 'val': f"{best['src']} top {pct}% — short zone"}
    return {'signal': None, 'val': f"{best['src']} mid {pct}% — no edge"}


def feature_choch_bos(bars_30m: list) -> dict:
    if not bars_30m or len(bars_30m) < 25:
        return {'signal': None, 'val': 'Need 25+ 30m bars'}
    sorted_bars = bars_30m[-80:]
    N, SH, SL   = 4, [], []
    for i in range(N, len(sorted_bars) - N):
        h = sorted_bars[i]['high']
        l = sorted_bars[i]['low']
        is_h = all(sorted_bars[j]['high'] < h for j in range(i - N, i + N + 1) if j != i)
        is_l = all(sorted_bars[j]['low']  > l for j in range(i - N, i + N + 1) if j != i)
        if is_h:
            SH.append({'price': h, 'i': i})
        if is_l:
            SL.append({'price': l, 'i': i})
    if len(SH) < 2 or len(SL) < 2:
        return {'signal': None, 'val': 'Not enough pivots'}
    sh0, sh1 = SH[-2], SH[-1]
    sl0, sl1 = SL[-2], SL[-1]
    hi_up, hi_dn = sh1['price'] > sh0['price'], sh1['price'] < sh0['price']
    lo_up, lo_dn = sl1['price'] > sl0['price'], sl1['price'] < sl0['price']
    if hi_up and lo_up: return {'signal': 'long',  'val': 'Bullish BOS — HH+HL'}
    if hi_dn and lo_dn: return {'signal': 'short', 'val': 'Bearish BOS — LH+LL'}
    if hi_dn and lo_up: return {'signal': 'long',  'val': 'Bullish CHoCH — LH+HL'}
    if hi_up and lo_dn: return {'signal': 'short', 'val': 'Bearish CHoCH — HH+LL'}
    return {'signal': None, 'val': 'Mixed structure'}


def feature_wick_rejection(bars_rev: list, price: float,
                            asia: dict | None, monday: dict | None,
                            atr: float, pip: float) -> dict:
    if not bars_rev or len(bars_rev) < 10:
        return {'signal': None, 'val': 'Need 10+ bars'}
    boundary = _nearest_boundary(price, asia, monday, atr)
    if not boundary:
        return {'signal': None, 'val': 'Not near boundary'}
    lvl, side, src = boundary['lvl'], boundary['side'], boundary['src']
    zone = max(atr * 0.12, pip * 3)
    wick_count = 0
    for b in bars_rev[:20]:
        h, l, o, c = b['high'], b['low'], b['open'], b['close']
        rng = h - l
        if rng < pip:
            continue
        near = abs(h - lvl) <= zone or abs(l - lvl) <= zone
        if not near:
            continue
        if side == 'resistance' and (h - max(o, c)) / rng >= 0.40:
            wick_count += 1
        if side == 'support'    and (min(o, c) - l)  / rng >= 0.40:
            wick_count += 1
    signal = (('long' if side == 'support' else 'short') if wick_count >= 2 else None)
    strength = 'strong' if wick_count >= 3 else ('moderate' if wick_count >= 2 else 'weak')
    return {'signal': signal, 'val': f'{wick_count} wicks at {src} — {strength}'}


def feature_rsi_divergence(bars_rev: list, price: float,
                            asia: dict | None, monday: dict | None,
                            atr: float, pip: float) -> dict:
    if not bars_rev or len(bars_rev) < 60:
        return {'signal': None, 'val': 'Need 60+ bars'}
    side = None
    for s in [
        {'lvl': asia['high']   if asia   else None, 'side': 'high'},
        {'lvl': asia['low']    if asia   else None, 'side': 'low'},
        {'lvl': monday['high'] if monday else None, 'side': 'high'},
        {'lvl': monday['low']  if monday else None, 'side': 'low'},
    ]:
        if s['lvl'] is not None and abs(price - s['lvl']) <= atr * 0.22:
            side = s['side']
            break
    if not side:
        return {'signal': None, 'val': 'Not near range extreme'}

    closed = list(reversed(bars_rev[1:101]))  # oldest-first, skip current
    if len(closed) < 50:
        return {'signal': None, 'val': 'Insufficient bars'}

    closes = [b['close'] for b in closed]
    wt1    = compute_wavetrend(closed)
    mf     = compute_money_flow(closed)
    rsi    = compute_rsi_normalized(closes, 14)

    wt1_sig  = osc_divergence(closes, wt1, side)
    mf_sig   = osc_divergence(closes, mf,  side)
    rsi_sig  = osc_divergence(closes, rsi, side)

    comps = [(n, s) for n, s in [('WTO', wt1_sig), ('MF', mf_sig), ('RSI', rsi_sig)] if s]
    lv = sum(1 for _, s in comps if s == 'long')
    sv = sum(1 for _, s in comps if s == 'short')

    if lv >= 2:
        names = '+'.join(n for n, s in comps if s == 'long')
        return {'signal': 'long',  'val': f'Bullish div 2/3: {names}'}
    if sv >= 2:
        names = '+'.join(n for n, s in comps if s == 'short')
        return {'signal': 'short', 'val': f'Bearish div 2/3: {names}'}
    detail = ' '.join(f'{n}({s})' for n, s in comps) if comps else 'No divergence'
    return {'signal': None, 'val': f'1/3 — {detail}' if comps else detail}


def feature_order_block(bars_rev: list, price: float,
                         asia: dict | None, monday: dict | None,
                         atr: float, pip: float) -> dict:
    if not bars_rev or len(bars_rev) < 15:
        return {'signal': None, 'val': 'Need 15+ bars'}
    boundary = _nearest_boundary(price, asia, monday, atr)
    if not boundary:
        return {'signal': None, 'val': 'Not near boundary'}
    lvl    = boundary['lvl']
    ob_sig = 'long' if boundary['side'] == 'support' else 'short'
    ordered = list(reversed(bars_rev[1:32]))  # oldest-first
    zone = atr * 0.25
    for i in range(len(ordered) - 2):
        b = ordered[i]
        o, c, h, l = b['open'], b['close'], b['high'], b['low']
        if h - l < pip:
            continue
        if not (abs(h - lvl) <= zone or abs(l - lvl) <= zone):
            continue
        next2 = ordered[i + 1:i + 3]
        if len(next2) < 2:
            continue
        if ob_sig == 'long'  and c < o and all(n['close'] > n['open'] for n in next2):
            return {'signal': 'long',  'val': f'Bullish OB at {lvl:.5f}'}
        if ob_sig == 'short' and c > o and all(n['close'] < n['open'] for n in next2):
            return {'signal': 'short', 'val': f'Bearish OB at {lvl:.5f}'}
    return {'signal': None, 'val': 'No OB near boundary'}


def feature_htf_ema(bars_5m_rev: list) -> dict:
    if not bars_5m_rev or len(bars_5m_rev) < 60:
        return {'signal': None, 'val': 'Need 60+ 5m bars'}
    sorted_bars = list(reversed(bars_5m_rev[1:]))  # oldest-first, skip current
    h1_closes   = [sorted_bars[i + 11]['close'] for i in range(0, len(sorted_bars) - 11, 12)
                   if not (sorted_bars[i + 11]['close'] != sorted_bars[i + 11]['close'])]
    if len(h1_closes) < 22:
        return {'signal': None, 'val': 'Not enough H1 bars'}
    ema21 = compute_ema(h1_closes, 21)
    ema50 = compute_ema(h1_closes, 50) if len(h1_closes) >= 51 else None
    last  = h1_closes[-1]
    e21   = ema21[-1]
    e50   = ema50[-1] if ema50 else None
    abv21 = last > e21
    abv50 = (last > e50) if e50 is not None else None
    signal = None
    if abv21 and (abv50 is None or abv50):
        signal = 'long'
    if not abv21 and (abv50 is None or not abv50):
        signal = 'short'
    e50_str = f' · EMA50 {"above" if abv50 else "below"}' if e50 is not None else ''
    return {'signal': signal, 'val': f'H1 EMA21 {"above" if abv21 else "below"}{e50_str}'}


def feature_vwap_slope(bars_rev: list, price: float, pip: float, today_date: str) -> dict:
    if not bars_rev or len(bars_rev) < 12:
        return {'signal': None, 'val': 'Need 12+ bars'}
    session = [b for b in bars_rev if b.get('lDate') == today_date and b.get('lHour', 0) >= 8]
    use     = list(reversed(session)) if len(session) >= 12 else list(reversed(bars_rev[-50:]))
    if len(use) < 6:
        return {'signal': None, 'val': 'Insufficient session data'}
    twap, cum = [], 0.0
    for i, b in enumerate(use):
        cum += (b['high'] + b['low'] + b['close']) / 3
        twap.append(cum / (i + 1))
    current_twap = twap[-1]
    sw    = min(8, len(twap) - 1)
    slope = twap[-1] - twap[-1 - sw] if sw > 0 else 0.0
    above = price > current_twap
    signal, strength = None, None
    if not above and slope > 0:   signal, strength = 'long',  'strong'
    elif not above:                signal, strength = 'long',  'mild'
    elif above and slope < 0:     signal, strength = 'short', 'strong'
    elif above:                   signal, strength = 'short', 'mild'
    s_dir = f'rising +{slope/pip:.1f}p' if slope > 0 else f'declining {slope/pip:.1f}p'
    return {'signal': signal, 'val': f'TWAP {current_twap:.5f} {s_dir} · price {"above" if above else "below"} {strength or ""}'}


def feature_adx_filter(bars_30m: list) -> dict:
    if not bars_30m or len(bars_30m) < 40:
        return {'signal': None, 'val': 'Need 40+ 30m bars'}
    adx, plus_di, minus_di = compute_adx(bars_30m[-200:], 14)
    if adx is None:
        return {'signal': None, 'val': 'ADX: insufficient data'}
    trend_up = plus_di > minus_di
    if adx < 20:
        return {'signal': None,                       'val': f'ADX {adx:.1f} — range-bound'}
    if adx > 28:
        return {'signal': 'long' if trend_up else 'short', 'val': f'ADX {adx:.1f} — trending {"↑" if trend_up else "↓"}'}
    return     {'signal': 'long' if trend_up else 'short', 'val': f'ADX {adx:.1f} · {"+DI" if trend_up else "-DI"} dominant'}


def feature_hurst_regime(daily_bars: list) -> dict:
    if not daily_bars or len(daily_bars) < 30:
        return {'signal': None, 'val': 'Need 30+ daily bars'}
    closes = [b['close'] for b in daily_bars[-80:] if b['close'] == b['close']]
    if len(closes) < 16:
        return {'signal': None, 'val': 'Insufficient close data'}
    H = compute_hurst(closes)
    if H < 0.45:
        return {'signal': None, 'val': f'Hurst {H:.2f} — mean-reverting (good)'}
    if H > 0.55:
        recent_dir = 'long' if closes[-1] > closes[-5] else 'short'
        return {'signal': recent_dir, 'val': f'Hurst {H:.2f} — trending {recent_dir}'}
    return {'signal': None, 'val': f'Hurst {H:.2f} — random walk'}


def feature_fvg_bias(bars_rev: list, price: float, atr: float, pip: float) -> dict:
    if not bars_rev or len(bars_rev) < 20:
        return {'signal': None, 'val': 'Need 20+ bars'}
    sorted_bars = list(reversed(bars_rev[1:101]))  # oldest-first
    fvgs = []
    for i in range(1, len(sorted_bars) - 1):
        pH = sorted_bars[i - 1]['high']
        pL = sorted_bars[i - 1]['low']
        nH = sorted_bars[i + 1]['high']
        nL = sorted_bars[i + 1]['low']
        if pH < nL:
            fvgs.append({'type': 'bullish', 'top': nL, 'bottom': pH, 'bar_idx': i})
        if nH < pL:
            fvgs.append({'type': 'bearish', 'top': pL, 'bottom': nH, 'bar_idx': i})

    unfilled = []
    for fvg in fvgs:
        filled = False
        for i in range(fvg['bar_idx'] + 2, len(sorted_bars)):
            if fvg['type'] == 'bullish' and sorted_bars[i]['low']  <= fvg['bottom']:
                filled = True; break
            if fvg['type'] == 'bearish' and sorted_bars[i]['high'] >= fvg['top']:
                filled = True; break
        if not filled:
            unfilled.append(fvg)

    if not unfilled:
        return {'signal': None, 'val': 'No unfilled FVGs'}

    for fvg in unfilled:
        if fvg['bottom'] <= price <= fvg['top']:
            size = round((fvg['top'] - fvg['bottom']) / pip)
            return {'signal': 'long' if fvg['type'] == 'bullish' else 'short',
                    'val': f'Inside {fvg["type"]} FVG ({size}p)'}

    nearby = sorted(
        [dict(fvg, mid=(fvg['top'] + fvg['bottom']) / 2) for fvg in unfilled
         if abs((fvg['top'] + fvg['bottom']) / 2 - price) <= atr * 0.5],
        key=lambda f: abs(f['mid'] - price),
    )
    if nearby:
        fvg = nearby[0]
        dist = round(abs(fvg['mid'] - price) / pip)
        return {'signal': 'long' if fvg['type'] == 'bullish' else 'short',
                'val': f'{fvg["type"]} FVG {dist}p away'}
    return {'signal': None, 'val': f'{len(unfilled)} unfilled FVGs — none within range'}


def feature_weekly_pivot(daily_bars: list, price: float, atr: float, pip: float) -> dict:
    if not daily_bars or len(daily_bars) < 8:
        return {'signal': None, 'val': 'Need 8+ daily bars'}

    from datetime import datetime, timedelta
    def week_of(date_str: str) -> str:
        d = datetime.strptime(date_str + 'T12:00:00', '%Y-%m-%dT%H:%M:%S')
        day = d.isoweekday() % 7  # 0=Sun, 1=Mon
        d  -= timedelta(days=(day + 6) % 7 - (0 if day == 1 else 0))
        # Monday of that week
        days_to_mon = (d.weekday())  # Mon=0
        return (d - timedelta(days=days_to_mon)).strftime('%Y-%m-%d')

    week_map: dict = {}
    for b in daily_bars:
        wk = week_of(b.get('lDate', '2000-01-01'))
        week_map.setdefault(wk, []).append(b)

    weeks = sorted(week_map.keys())
    if len(weeks) < 2:
        return {'signal': None, 'val': 'Not enough weekly bars'}

    wb  = week_map[weeks[-2]]
    H   = max(b['high']  for b in wb)
    L   = min(b['low']   for b in wb)
    C   = wb[-1]['close']
    PP  = (H + L + C) / 3
    R1, R2 = 2 * PP - L,        PP + (H - L)
    S1, S2 = 2 * PP - H,        PP - (H - L)

    levels = [
        {'name': 'WR2', 'lvl': R2, 'sig': 'short'},
        {'name': 'WR1', 'lvl': R1, 'sig': 'short'},
        {'name': 'WPP', 'lvl': PP, 'sig': None},
        {'name': 'WS1', 'lvl': S1, 'sig': 'long'},
        {'name': 'WS2', 'lvl': S2, 'sig': 'long'},
    ]
    best = min(levels, key=lambda l: abs(price - l['lvl']))
    dist = abs(price - best['lvl'])
    if dist > atr * 0.22:
        return {'signal': None, 'val': f'Nearest {best["name"]} {round(dist/pip)}p away'}
    return {'signal': best['sig'], 'val': f'Near {best["name"]} {best["lvl"]:.5f} ({round(dist/pip)}p)'}


def feature_ichimoku_cloud(daily_bars: list, price: float, pip: float) -> dict:
    if not daily_bars or len(daily_bars) < 78:
        return {'signal': None, 'val': 'Need 78+ daily bars'}

    def mid(bars, period, end_idx):
        sl = bars[max(0, end_idx - period + 1):end_idx + 1]
        if not sl:
            return None
        return (max(b['high'] for b in sl) + min(b['low'] for b in sl)) / 2

    last      = len(daily_bars) - 1
    cloud_idx = last - 26
    if cloud_idx < 51:
        return {'signal': None, 'val': 'Need 78+ bars for cloud'}

    tenkan = mid(daily_bars, 9,  last)
    kijun  = mid(daily_bars, 26, last)
    t26    = mid(daily_bars, 9,  cloud_idx)
    k26    = mid(daily_bars, 26, cloud_idx)
    span_a = (t26 + k26) / 2 if t26 and k26 else None
    span_b = mid(daily_bars, 52, cloud_idx)

    if any(x is None for x in [span_a, span_b, tenkan, kijun]):
        return {'signal': None, 'val': 'Ichimoku: insufficient data'}

    cloud_top = max(span_a, span_b)
    cloud_bot = min(span_a, span_b)
    cloud_sig, cloud_pos = None, 'inside cloud'
    if price > cloud_top:      cloud_sig, cloud_pos = 'long',  'above cloud'
    elif price < cloud_bot:    cloud_sig, cloud_pos = 'short', 'below cloud'

    tk_lbl  = 'TK bull ↑' if tenkan > kijun else ('TK bear ↓' if tenkan < kijun else 'TK flat')
    chikou  = daily_bars[last]['close']
    prior   = daily_bars[last - 26]['close']
    ch_lbl  = 'Chikou ↑' if chikou > prior else 'Chikou ↓'
    thick   = round(abs(span_a - span_b) / pip)
    color   = 'green' if span_a >= span_b else 'red'
    return {'signal': cloud_sig, 'val': f'{cloud_pos} ({thick}p {color}) · {tk_lbl} · {ch_lbl}'}


def feature_macd_signal(bars_rev: list, pip: float) -> dict:
    if not bars_rev or len(bars_rev) < 35:
        return {'signal': None, 'val': 'n/a'}
    closes    = list(reversed([b['close'] for b in bars_rev]))  # oldest-first
    macd_line, sig_line = compute_macd(closes)
    last      = macd_line[-1]
    last_sig  = sig_line[-1] if sig_line else 0
    above     = last > last_sig
    return {'signal': 'long' if above else 'short', 'val': f'MACD {last/pip:+.1f}p'}


# ── Main signal dispatcher ────────────────────────────────────────────────────

FEATURE_ORDER = [
    'rangePosition', 'chochBos', 'wickRejection', 'rsiDivergence',
    'orderBlock', 'htfEma', 'vwapSlope', 'adxFilter',
    'hurstRegime', 'fvgBias', 'weeklyPivot', 'ichimokuCloud', 'macdSignal',
]


def compute_direction(bars_5m_rev: list, bars_30m: list, daily_bars: list,
                      asia: dict | None, monday: dict | None,
                      price: float, pip: float, today_date: str,
                      feature_cfg: dict) -> dict:
    """
    Run all enabled features, determine direction by majority vote,
    score conviction for the winning direction.

    Returns:
      entry_dir:      'long' | 'short' | None
      conviction:     float -1..1
      confirm_count:  int
      conflict_count: int
      results:        list of feature result dicts
    """
    atr = compute_atr(bars_30m[-100:]) if bars_30m else (pip * 20)

    def run(key):
        cfg = feature_cfg.get(key, {})
        if not cfg.get('enabled', False):
            return None
        try:
            if key == 'rangePosition':
                out = feature_range_position(price, asia, monday, atr)
            elif key == 'chochBos':
                out = feature_choch_bos(bars_30m)
            elif key == 'wickRejection':
                out = feature_wick_rejection(bars_5m_rev, price, asia, monday, atr, pip)
            elif key == 'rsiDivergence':
                out = feature_rsi_divergence(bars_5m_rev, price, asia, monday, atr, pip)
            elif key == 'orderBlock':
                out = feature_order_block(bars_5m_rev, price, asia, monday, atr, pip)
            elif key == 'htfEma':
                out = feature_htf_ema(bars_5m_rev)
            elif key == 'vwapSlope':
                out = feature_vwap_slope(bars_5m_rev, price, pip, today_date)
            elif key == 'adxFilter':
                out = feature_adx_filter(bars_30m)
            elif key == 'hurstRegime':
                out = feature_hurst_regime(daily_bars)
            elif key == 'fvgBias':
                out = feature_fvg_bias(bars_5m_rev, price, atr, pip)
            elif key == 'weeklyPivot':
                out = feature_weekly_pivot(daily_bars, price, atr, pip)
            elif key == 'ichimokuCloud':
                out = feature_ichimoku_cloud(daily_bars, price, pip)
            elif key == 'macdSignal':
                out = feature_macd_signal(bars_5m_rev, pip)
            else:
                return None
        except Exception as exc:
            log.warning(f'Feature {key} raised: {exc}')
            out = {'signal': None, 'val': 'Error'}
        return {
            'key':    key,
            'label':  cfg.get('label', key),
            'signal': out['signal'],
            'val':    out['val'],
            'weight': cfg.get('weight', 1),
        }

    raw_results = [r for key in FEATURE_ORDER if (r := run(key)) is not None]

    # Weighted vote to determine direction
    long_pts = short_pts = max_pts = 0
    for r in raw_results:
        w = r['weight']
        max_pts += w
        if r['signal'] == 'long':  long_pts  += w
        if r['signal'] == 'short': short_pts += w

    if long_pts > short_pts:
        entry_dir = 'long'
    elif short_pts > long_pts:
        entry_dir = 'short'
    else:
        entry_dir = None

    if not entry_dir:
        return {'entry_dir': None, 'conviction': 0.0, 'confirm_count': 0,
                'conflict_count': 0, 'results': raw_results, 'atr': atr}

    # Score conviction for winning direction
    confirm_count = conflict_count = total_pts = 0
    scored = []
    for r in raw_results:
        confirms  = r['signal'] == entry_dir
        conflicts = r['signal'] is not None and r['signal'] != entry_dir
        pts = r['weight'] if confirms else (-r['weight'] if conflicts else 0)
        if confirms:  confirm_count  += 1
        if conflicts: conflict_count += 1
        total_pts += pts
        scored.append({**r, 'pts': pts, 'icon': '✓' if confirms else ('✗' if conflicts else '·')})

    conviction = total_pts / max_pts if max_pts > 0 else 0.0

    return {
        'entry_dir':     entry_dir,
        'conviction':    conviction,
        'confirm_count': confirm_count,
        'conflict_count': conflict_count,
        'total_pts':     total_pts,
        'max_pts':       max_pts,
        'results':       scored,
        'atr':           atr,
    }
