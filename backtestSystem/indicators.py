"""
Math helpers — pure Python, no MT5 dependency.
All bar lists expected as dicts with keys: open, high, low, close
"""
import math


def compute_ema(values: list, period: int) -> list:
    if not values:
        return []
    k = 2.0 / (period + 1)
    result = [values[0]]
    for v in values[1:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


def compute_sma(values: list, period: int) -> list:
    result = []
    for i in range(len(values)):
        start = max(0, i - period + 1)
        result.append(sum(values[start:i + 1]) / (i - start + 1))
    return result


def compute_atr(bars: list, period: int = 14) -> float:
    """Wilder ATR. bars oldest-first."""
    if len(bars) < 2:
        return bars[0]['high'] - bars[0]['low'] if bars else 0.0
    trs = []
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    if len(trs) < period:
        return sum(trs) / len(trs) if trs else 0.0
    atr = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr = (atr * (period - 1) + trs[i]) / period
    return atr


def compute_rsi_normalized(values: list, period: int = 14) -> list:
    """RSI normalized to (-0.5, 0.5) range. values oldest-first."""
    n = len(values)
    if n < period + 1:
        return [0.0] * n
    result = [0.0] * period
    gains = losses = 0.0
    for i in range(1, period + 1):
        ch = values[i] - values[i - 1]
        if ch > 0:
            gains += ch
        else:
            losses -= ch
    ag, al = gains / period, losses / period
    result.append((100 - 100 / (1 + ag / (al or 1e-10))) / 100 - 0.5)
    for i in range(period + 1, n):
        ch = values[i] - values[i - 1]
        g  = ch if ch > 0 else 0.0
        ls = -ch if ch < 0 else 0.0
        ag = (ag * (period - 1) + g)  / period
        al = (al * (period - 1) + ls) / period
        result.append((100 - 100 / (1 + ag / (al or 1e-10))) / 100 - 0.5)
    return result


def compute_wavetrend(bars: list) -> list:
    """WaveTrend WT1. bars oldest-first. Returns list same length as bars."""
    n = len(bars)
    if n < 21:
        return [0.0] * n
    hlc3 = [(b['high'] + b['low'] + b['close']) / 3 for b in bars]
    esa  = compute_ema(hlc3, 10)
    devs = [abs(hlc3[i] - esa[i]) for i in range(n)]
    d    = compute_ema(devs, 10)
    ci   = [(hlc3[i] - esa[i]) / (0.015 * (d[i] or 1e-10)) for i in range(n)]
    return compute_ema(ci, 21)


def compute_money_flow(bars: list) -> list:
    """MoneyFlow normalized. bars oldest-first."""
    raw = [(1 if b['close'] >= b['open'] else -1) * max(0.0, b['high'] - b['low']) for b in bars]
    rsi_raw = _rsi_raw(raw, 14)
    return [(v - 50) / 50 for v in rsi_raw]


def _rsi_raw(values: list, period: int = 14) -> list:
    n = len(values)
    if n < period + 1:
        return [50.0] * n
    result = [50.0] * period
    gains = losses = 0.0
    for i in range(1, period + 1):
        ch = values[i] - values[i - 1]
        if ch > 0:
            gains += ch
        else:
            losses -= ch
    ag, al = gains / period, losses / period
    result.append(100 - 100 / (1 + ag / (al or 1e-10)))
    for i in range(period + 1, n):
        ch = values[i] - values[i - 1]
        g  = ch if ch > 0 else 0.0
        ls = -ch if ch < 0 else 0.0
        ag = (ag * (period - 1) + g)  / period
        al = (al * (period - 1) + ls) / period
        result.append(100 - 100 / (1 + ag / (al or 1e-10)))
    return result


def find_swing_pivots(values: list, N: int = 5) -> tuple:
    """Returns (highs, lows) as lists of {'val': float, 'i': int}."""
    highs, lows = [], []
    for i in range(N, len(values) - N):
        v = values[i]
        is_h = all(values[j] < v for j in range(i - N, i + N + 1) if j != i)
        is_l = all(values[j] > v for j in range(i - N, i + N + 1) if j != i)
        if is_h:
            highs.append({'val': v, 'i': i})
        if is_l:
            lows.append({'val': v, 'i': i})
    return highs, lows


def _nearest_pivot(pivots: list, target_idx: int, max_dist: int):
    best, best_d = None, float('inf')
    for p in pivots:
        d = abs(p['i'] - target_idx)
        if d <= max_dist and d < best_d:
            best_d = d
            best = p
    return best


def osc_divergence(closes: list, osc: list, side: str, N: int = 5):
    """Detect divergence. side='high' (bearish div) or 'low' (bullish div)."""
    p_highs, p_lows = find_swing_pivots(closes, N)
    o_highs, o_lows = find_swing_pivots(osc, N)
    md = N * 3
    if side == 'high':
        ph = p_highs[-2:]
        if len(ph) < 2 or ph[1]['val'] <= ph[0]['val']:
            return None
        oh1 = _nearest_pivot(o_highs, ph[0]['i'], md)
        oh2 = _nearest_pivot(o_highs, ph[1]['i'], md)
        if oh1 and oh2 and oh2['val'] < oh1['val']:
            return 'short'
    else:
        pl = p_lows[-2:]
        if len(pl) < 2 or pl[1]['val'] >= pl[0]['val']:
            return None
        ol1 = _nearest_pivot(o_lows, pl[0]['i'], md)
        ol2 = _nearest_pivot(o_lows, pl[1]['i'], md)
        if ol1 and ol2 and ol2['val'] > ol1['val']:
            return 'long'
    return None


def compute_adx(bars: list, period: int = 14):
    """Wilder ADX. bars oldest-first. Returns (adx, plus_di, minus_di) or (None, None, None)."""
    if len(bars) < period + 2:
        return None, None, None
    tr, pdm, ndm = [], [], []
    for i in range(1, len(bars)):
        h, l, pc  = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        ph, pl    = bars[i - 1]['high'], bars[i - 1]['low']
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
        up, dn = h - ph, pl - l
        pdm.append(up if up > dn and up > 0 else 0.0)
        ndm.append(dn if dn > up and dn > 0 else 0.0)

    def wilder(arr, p):
        s = sum(arr[:p])
        result = [s]
        for v in arr[p:]:
            s = s - s / p + v
            result.append(s)
        return result

    a_tr  = wilder(tr, period)
    s_pdm = wilder(pdm, period)
    s_ndm = wilder(ndm, period)

    plus_di  = [100 * s_pdm[i] / (a_tr[i] or 1e-10) for i in range(len(a_tr))]
    minus_di = [100 * s_ndm[i] / (a_tr[i] or 1e-10) for i in range(len(a_tr))]
    dx = [100 * abs(plus_di[i] - minus_di[i]) / ((plus_di[i] + minus_di[i]) or 1e-10)
          for i in range(len(plus_di))]

    if len(dx) < period:
        return None, plus_di[-1] if plus_di else None, minus_di[-1] if minus_di else None

    adx = sum(dx[:period]) / period
    for v in dx[period:]:
        adx = (adx * (period - 1) + v) / period

    return adx, plus_di[-1], minus_di[-1]


def compute_hurst(closes: list) -> float:
    """R/S Hurst exponent. closes oldest-first."""
    n = len(closes)
    if n < 16:
        return 0.5
    log_p  = [math.log(max(c, 1e-10)) for c in closes]
    scales = [s for s in [4, 8, 16, 32] if s * 3 <= n]
    log_n, log_rs = [], []
    for scale in scales:
        rs_vals = []
        for start in range(0, n - scale + 1, scale):
            seg  = log_p[start:start + scale]
            rets = [seg[i + 1] - seg[i] for i in range(len(seg) - 1)]
            if not rets:
                continue
            mean    = sum(rets) / len(rets)
            cum, cumdev = 0.0, []
            for r in rets:
                cum += r - mean
                cumdev.append(cum)
            R = max(cumdev) - min(cumdev)
            S = math.sqrt(sum((r - mean) ** 2 for r in rets) / len(rets))
            if S > 0 and R > 0:
                rs_vals.append(R / S)
        if rs_vals:
            log_n.append(math.log(scale))
            log_rs.append(math.log(sum(rs_vals) / len(rs_vals)))
    if len(log_n) < 2:
        return 0.5
    m  = len(log_n)
    mx = sum(log_n) / m
    my = sum(log_rs) / m
    num = sum((log_n[i] - mx) * (log_rs[i] - my) for i in range(m))
    den = sum((x - mx) ** 2 for x in log_n)
    return max(0.0, min(1.0, num / den)) if den > 0 else 0.5


def compute_macd(closes: list, fast: int = 12, slow: int = 26, signal: int = 9):
    """Returns (macd_line, signal_line). closes oldest-first."""
    e_fast = compute_ema(closes, fast)
    e_slow = compute_ema(closes, slow)
    macd_line = [e_fast[i] - e_slow[i] for i in range(len(closes))]
    sig_line  = compute_ema(macd_line[slow:], signal)
    return macd_line, sig_line
