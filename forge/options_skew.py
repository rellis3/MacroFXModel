"""Options skew from an option chain: the pure maths behind scripts/rates_line/refresh_options_skew.py (owner, 2026-11-04).

For one expiry, given the future's price F and the out-of-the-money calls and puts with their implied vols and deltas
(from IBKR's model greeks):

  atm   the implied vol at the money (vol interpolated at strike F)
  c25   the vol of the 25-delta call, p25 the vol of the 25-delta put (interpolated by delta)
  rr25  risk reversal = c25 - p25: positive = the market pays more for upside protection than downside
  bf25  butterfly = (c25 + p25) / 2 - atm: how much the wings cost over the middle (fear of a big move either way)

All vols in vol points (IBKR's 0.0812 -> 8.12). No IBKR import: tested in forge/test_options_skew.py.
"""
from datetime import date, datetime

TENORS = {'1w': 7, '1m': 30, '3m': 91}


def interp(points, x):
    """Linear interpolation of y at x over [(x, y)] (any order); None outside the range or with fewer than 2 points."""
    pts = sorted((float(a), float(b)) for a, b in points if a is not None and b is not None)
    if len(pts) < 2 or x < pts[0][0] or x > pts[-1][0]:
        return None
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


def skew_from_chain(F, calls, puts):
    """calls / puts: [{'strike', 'iv' (decimal), 'delta'}]. Only out-of-the-money options are used (calls above F,
    puts below), the ones whose quotes carry the skew. Returns a dict, or None when the chain is too thin."""
    oc = [c for c in calls if c.get('iv') and c.get('delta') is not None and c['strike'] >= F and 0.03 < c['delta'] < 0.97]
    op = [p for p in puts if p.get('iv') and p.get('delta') is not None and p['strike'] <= F and -0.97 < p['delta'] < -0.03]
    if len(oc) < 2 or len(op) < 2:
        return None
    # at the money: the vol curve across strikes (puts below F, calls above), read at F
    smile = [(p['strike'], p['iv']) for p in op] + [(c['strike'], c['iv']) for c in oc]
    atm = interp(smile, F)
    c25 = interp([(c['delta'], c['iv']) for c in oc], 0.25)
    p25 = interp([(-p['delta'], p['iv']) for p in op], 0.25)
    if atm is None or c25 is None or p25 is None:
        return None
    r = lambda v: round(v * 100, 2)
    return {'atm': r(atm), 'c25': r(c25), 'p25': r(p25), 'rr25': r(c25 - p25), 'bf25': r((c25 + p25) / 2 - atm), 'n': len(oc) + len(op)}


def pick_expiries(expiries, today=None, targets=TENORS, min_days=3):
    """{tenor: (expiry 'YYYYMMDD', days)}: for each target the listed expiry nearest to it, at least min_days out."""
    today = today or date.today()
    days = []
    for e in set(expiries):
        try:
            d = (datetime.strptime(str(e)[:8], '%Y%m%d').date() - today).days
        except ValueError:
            continue
        if d >= min_days:
            days.append((str(e)[:8], d))
    out = {}
    for t, want in targets.items():
        if days:
            best = min(days, key=lambda x: (abs(x[1] - want), x[1]))
            # only an expiry reasonably near the tenor counts: a 30-day option is not a 3-month reading
            if abs(best[1] - want) <= want * 0.5 + 3:
                out[t] = best
    return out


def strike_window(F, strikes, days, vol_guess, n_side=10, width=2.5):
    """Up to n_side listed strikes each side of F, spread evenly out to about width standard deviations. Indices, gold
    and oil list strikes so close together that the nearest ten all sit near the money and never reach the 25-delta
    options; spacing them across the window does (owner's first run, 2026-11-04)."""
    sd = F * vol_guess * (max(days, 1) / 365) ** 0.5
    lo, hi = F - width * sd, F + width * sd

    def spread(ks):
        if len(ks) <= n_side:
            return ks
        step = (len(ks) - 1) / (n_side - 1)
        return [ks[round(i * step)] for i in range(n_side)]
    below = spread(sorted([k for k in strikes if lo <= k <= F], reverse=True))
    above = spread(sorted([k for k in strikes if F <= k <= hi]))
    return sorted(set(below + above))
