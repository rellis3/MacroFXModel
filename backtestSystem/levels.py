"""
Asia and Monday range computation + Fibonacci level projection.
Matches backtest-engine.js: computeBodyRange(), projectFibLevels(), detectConfluences().
"""

FIB_LEVELS = [
    -10.5, -10, -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
    -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.75, -0.5, -0.25,
    0, 0.25, 0.5, 0.75,
    1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5,
]


def compute_asia_range(bars_5m_newest_first: list, today_london_date: str) -> dict | None:
    """
    Asia session = London midnight to 06:00 (lHour 0-5).
    bars_5m_newest_first: newest-first list of bar dicts with lDate, lHour, lMin.
    Requires ≥36 bars (3 hours) to be valid.
    Returns {high, low, range} or None.
    """
    session_bars = [
        b for b in bars_5m_newest_first
        if b.get('lDate') == today_london_date and 0 <= b.get('lHour', 24) < 6
    ]
    if len(session_bars) < 36:
        return None
    high = max(max(b['high'], b['close']) for b in session_bars)
    low  = min(min(b['low'],  b['open'])  for b in session_bars)
    if high <= low:
        return None
    return {'high': high, 'low': low, 'range': high - low}


def compute_monday_range(bars_30m_oldest_first: list) -> dict | None:
    """
    Monday range from 30m bars where lDay == 1 (Monday in JS convention).
    Requires ≥20 bars.
    Returns {high, low, range} or None.
    """
    monday_bars = [b for b in bars_30m_oldest_first if b.get('lDay') == 1]
    if len(monday_bars) < 20:
        return None
    high = max(max(b['high'], b['close']) for b in monday_bars)
    low  = min(min(b['low'],  b['open'])  for b in monday_bars)
    if high <= low:
        return None
    return {'high': high, 'low': low, 'range': high - low}


def project_fib_levels(range_data: dict) -> list:
    """Returns list of {fib, price} for all FIB_LEVELS."""
    if not range_data or range_data['range'] <= 0:
        return []
    return [
        {'fib': fib, 'price': range_data['low'] + range_data['range'] * fib}
        for fib in FIB_LEVELS
    ]


def detect_confluences(today_levels: list, yest_levels: list,
                       pip: float, tol_pips: float,
                       price_mode: str = 'midpoint',
                       cluster_merge: bool = True) -> list:
    """
    Find prices where today's Fib aligns with yesterday's Fib within tol_pips.
    Returns list of {price, fib, isTight, sources}.
    """
    normal_dist = tol_pips * pip
    tight_dist  = normal_dist * 0.10
    merge_dist  = normal_dist * 0.30

    raw = []
    for t in today_levels:
        for y in yest_levels:
            dist = abs(t['price'] - y['price'])
            if dist <= normal_dist:
                is_tight = dist <= tight_dist
                if price_mode == 'lowest':
                    price = min(t['price'], y['price'])
                elif price_mode == 'highest':
                    price = max(t['price'], y['price'])
                else:
                    price = (t['price'] + y['price']) / 2
                raw.append({
                    'price':   price,
                    'fib':     t['fib'],
                    'isTight': is_tight,
                    'sources': ['today', 'yesterday'],
                    'dist':    dist,
                })

    if not raw:
        return []

    raw.sort(key=lambda c: c['price'])

    if not cluster_merge:
        return raw

    # Merge nearby confluences within merge_dist
    merged = []
    used   = [False] * len(raw)
    for i, c in enumerate(raw):
        if used[i]:
            continue
        cluster = [c]
        for j in range(i + 1, len(raw)):
            if not used[j] and abs(raw[j]['price'] - c['price']) <= merge_dist:
                cluster.append(raw[j])
                used[j] = True
        used[i] = True
        avg_price = sum(x['price'] for x in cluster) / len(cluster)
        merged.append({
            'price':   avg_price,
            'fib':     cluster[0]['fib'],
            'isTight': any(x['isTight'] for x in cluster),
            'sources': list({s for x in cluster for s in x['sources']}),
            'count':   len(cluster),
        })

    return merged


def get_yesterday_range_bars(bars_5m_newest_first: list, today_date: str) -> list:
    """Extract yesterday's 5m bars from the window."""
    from datetime import datetime, timedelta
    yesterday = (datetime.strptime(today_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    return [b for b in bars_5m_newest_first if b.get('lDate') == yesterday]


def levels_near_price(levels: list, price: float, pip: float, tol_pips: float) -> list:
    """Filter confluence levels within tol_pips of current price."""
    tol = tol_pips * pip
    return [l for l in levels if abs(l['price'] - price) <= tol]
