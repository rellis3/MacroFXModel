"""
cost_model — subtract a realistic round-trip cost from every touch-engine trade
and ask what survives. This is the gate: nothing in the leaderboard counts as
"an edge" until it clears this, same rule the rest of the repo already applies
(volatilityExhaustion's own Phase-1 plan: "must beat the naive benchmark OOS
AFTER COSTS").

Source of truth for the cost table: js/perLineStrategy.js PAIR_COST_PCT (:36-48)
-- the SAME per-pair round-trip % table an existing level-touch strategy in this
repo already uses to cost fade/continuation trades. Picked over the flatter
pylego/costs.py pip table specifically because it's granular per-pair (a flat
fx=0.8pip average would UNDERSTATE cost on the wide crosses -- GBPNZD, AUDNZD,
EURNZD -- that the raw leaderboard leans on).

Each touch's win/loss size is already known and symmetric (+/- barrier_price,
theta*sigma of that day, stored on the record by touch_engine). Cost is a FLAT
% of the touch's price level (round-trip, so charged once per trade, not per
leg) -- NOT scaled by the barrier, because spread/slippage cost is a property
of the instrument's liquidity, not of how far price is expected to travel.
That's exactly why a small barrier (calm day, tight instrument) can be cost-
dominated even when a wide barrier on the same pair is not.
"""
import numpy as np

# Round-trip cost, % of price. js/perLineStrategy.js:36-48 (verbatim).
PAIR_COST_PCT = {
    'eurusd': 0.008, 'gbpusd': 0.010, 'usdjpy': 0.009, 'usdchf': 0.011,
    'usdcad': 0.011, 'audusd': 0.011, 'nzdusd': 0.013,
    'eurgbp': 0.013, 'eurjpy': 0.014, 'eurchf': 0.015, 'euraud': 0.018,
    'eurcad': 0.018, 'eurnzd': 0.038,
    'gbpjpy': 0.018, 'gbpchf': 0.022, 'gbpaud': 0.030, 'gbpcad': 0.032, 'gbpnzd': 0.045,
    'audjpy': 0.016, 'cadjpy': 0.018, 'chfjpy': 0.018, 'nzdjpy': 0.020,
    'audnzd': 0.030, 'audcad': 0.028, 'audchf': 0.030,
    'nq': 0.008, 'gold': 0.020,
}
DEFAULT_COST_PCT = {'fx': 0.012, 'index': 0.010, 'commodity': 0.020}   # DEFAULT_COST_PCT, same file


def cost_for(instrument, asset_class='fx'):
    return PAIR_COST_PCT.get(instrument.lower(), DEFAULT_COST_PCT.get(asset_class, DEFAULT_COST_PCT['fx']))


def cost_adjust(records, instrument, asset_class='fx'):
    """For every DECIDED touch (continuation/reversion), compute the net R (in
    barrier units, so instruments/levels are comparable) after a flat round-trip
    cost. Returns per-record {side, gross_r, net_r, net_win} plus aggregate
    fade/follow net win-rate and mean net R. `side` = 'fade' (reversion is the
    win) or 'follow' (continuation is the win) -- reported for BOTH, since a
    trade counts as a win or loss depending on which side you'd have taken."""
    cost_pct = cost_for(instrument, asset_class) / 100.0
    out = []
    for r in records:
        if r['outcome'] not in ('continuation', 'reversion'):
            continue
        barrier = r['barrier_price']
        if not (barrier > 0):
            continue
        cost_price = cost_pct * r['level_px']
        cost_r = cost_price / barrier      # cost expressed in barrier units
        cont_win = 1.0 if r['outcome'] == 'continuation' else -1.0
        out.append(dict(
            level=r['level'], day_i=r['day_i'],
            follow_gross_r=cont_win, follow_net_r=cont_win - cost_r,
            fade_gross_r=-cont_win, fade_net_r=-cont_win - cost_r,
            cost_r=cost_r,
        ))
    return out


def summarize_costed(costed, levels):
    """Per level: gross vs net win-rate and mean-R for both sides, plus the
    cost's size relative to the barrier (cost_r) so you can see WHY a level
    died (tiny barrier swallowed by cost) vs whether it just wasn't a real edge."""
    from collections import defaultdict
    by_level = defaultdict(list)
    for c in costed:
        by_level[c['level']].append(c)

    table = {}
    for level in levels:
        rows = by_level.get(level, [])
        n = len(rows)
        if n == 0:
            continue
        follow_net_r = np.array([r['follow_net_r'] for r in rows])
        fade_net_r = np.array([r['fade_net_r'] for r in rows])
        cost_r = np.array([r['cost_r'] for r in rows])
        table[level] = dict(
            n=n,
            avg_cost_r=round(float(cost_r.mean()), 3),          # cost as a fraction of the barrier
            follow_net_win_rate=round(100 * float((follow_net_r > 0).mean()), 1),
            follow_mean_net_r=round(float(follow_net_r.mean()), 3),
            fade_net_win_rate=round(100 * float((fade_net_r > 0).mean()), 1),
            fade_mean_net_r=round(float(fade_net_r.mean()), 3),
        )
    return table
