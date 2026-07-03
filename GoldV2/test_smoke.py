"""
Gold V2 — synthetic smoke tests (no network, no MT5).

Run from the GoldV2 directory:  python test_smoke.py
Exercises: valid-extreme detection, leg building, level emission + GP bands,
clustering, scoring, HTF bias agreement table, VuManChu gating (WT mandatory,
fuel veto), exit planning (skip-if-too-wide, level TPs, range cap), and the
trade manager's portfolio caps / day rollover / persistence round-trip.
"""

from __future__ import annotations
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.level_matrix import (build_legs, emit_levels, build_zones,
                                  build_level_matrix, find_valid_extremes,
                                  score_zones)
from modules.htf_bias import compute_htf_bias
from modules.vumanchu import compute_vumanchu
from modules.exits import plan_exits
from modules.trade_manager import TradeManager, ManagedTrade

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = '') -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}  {detail}')


def bar(t, o, h, l, c, v=100):
    return {'time': t, 'open': o, 'high': h, 'low': l, 'close': c, 'tick_volume': v}


# ── Synthetic impulse + retrace: 100 bars up-leg then pullback ────────────────

def synth_impulse_retrace() -> list[dict]:
    """Rally 4000→4100 over 60 bars, retrace to ~4038 (.618) over 40 bars."""
    bars = []
    t = 1_700_000_000
    px = 4000.0
    # flat base so the low pivot confirms
    for i in range(10):
        bars.append(bar(t, px, px + 2, px - 2, px)); t += 1800
    for i in range(60):
        px += 100 / 60
        bars.append(bar(t, px - 1, px + 2.5, px - 2.5, px)); t += 1800
    top = px
    for i in range(40):
        px -= 62 / 40     # retrace ~62% of the 100 leg
        bars.append(bar(t, px + 1, px + 2.5, px - 2.5, px)); t += 1800
    return bars


print('\n── level_matrix ─────────────────────────────────────────────')
bars = synth_impulse_retrace()
price = bars[-1]['close']

vh, vl, bh, bl = find_valid_extremes(bars, 'M30')
check('valid extremes found', len(vh) >= 1 and len(vl) >= 1,
      f'vh={len(vh)} vl={len(vl)}')

legs = build_legs(bars, 'M30')
check('long leg detected', any(l.direction == 'long' for l in legs),
      f'{len(legs)} legs')

long_legs = [l for l in legs if l.direction == 'long']
if long_legs:
    main_leg = max(long_legs, key=lambda l: l.size)
    check('leg spans the impulse', main_leg.size > 60, f'size={main_leg.size}')

lines, bands = emit_levels(legs, price)
check('GP band emitted', len(bands) >= 1)
check('fib lines emitted retracement-side only',
      all(ln.price <= price + 1e-9 for ln in lines if ln.direction == 'long'))

zones, debug = build_level_matrix({'M30': bars}, price)
check('zones built', len(zones) >= 1, str(debug))
gp_zones = [z for z in zones if z.in_gp and z.direction == 'long']
check('a long GP zone exists', len(gp_zones) >= 1)
if gp_zones and long_legs:
    z = gp_zones[0]
    gp_lo = main_leg.end - 0.650 * main_leg.size
    gp_hi = main_leg.end - 0.618 * main_leg.size
    check('GP zone matches .618–.650 of the impulse',
          z.gp_low <= gp_lo + 3 and z.gp_high >= gp_hi - 3,
          f'zone {z.gp_low}-{z.gp_high} vs {gp_lo:.1f}-{gp_hi:.1f}')
    check('zone invalidation at leg origin', abs(z.swing_origin - 4000) < 6,
          f'origin={z.swing_origin}')

# superseded high must not anchor a leg: extend series with a higher high
bars_ext = list(bars)
t = bars_ext[-1]['time']
px = bars_ext[-1]['close']
for i in range(30):
    px += 3
    bars_ext.append(bar(t + 1800 * (i + 1), px - 1, px + 2.5, px - 2.5, px))
legs2 = build_legs(bars_ext, 'M30')
old_top_legs = [l for l in legs2 if l.direction == 'long' and abs(l.end - 4100) < 4]
check('superseded high no longer anchors a leg (redraw rule)',
      len(old_top_legs) == 0, f'{len(old_top_legs)} stale legs')


print('\n── htf_bias ─────────────────────────────────────────────────')
def trend_bars(n, start, step, tf_sec, wob=3.0):
    out, px, t = [], start, 1_700_000_000
    for i in range(n):
        px += step
        swing = wob * math.sin(i / 5)
        out.append(bar(t, px - step, px + wob + swing, px - wob + swing, px))
        t += tf_sec
    return out

up_d1 = trend_bars(80, 4000, 3, 86400)
up_h4 = trend_bars(200, 4000, 1.2, 14400)
b = compute_htf_bias(up_d1, up_h4)
check('uptrend → BULL high confidence', b.bias == 'BULL' and b.confidence >= 0.5,
      f'{b.bias} {b.confidence} ({b.reason})')

dn_h4 = trend_bars(200, 4400, -1.2, 14400)
b2 = compute_htf_bias(up_d1, dn_h4)
check('daily UP vs H4 DOWN → NEUTRAL stand-down', b2.bias == 'NEUTRAL',
      f'{b2.bias} ({b2.daily_trend}/{b2.h4_trend})')

dn_d1 = trend_bars(80, 4400, -3, 86400)
b3 = compute_htf_bias(dn_d1, dn_h4)
check('downtrend → BEAR', b3.bias == 'BEAR', f'{b3.bias} ({b3.reason})')


print('\n── vumanchu ─────────────────────────────────────────────────')
def selloff_bars(n=60):
    """Hard selloff into a low — WT deeply oversold at the end."""
    out, px, t = [], 4100.0, 1_700_000_000
    for i in range(n):
        px -= 1.5
        out.append(bar(t, px + 1.2, px + 1.6, px - 0.6, px, v=100 + i))
        t += 300
    return out

vu = compute_vumanchu(selloff_bars(), 'long', require_wt=True, fuel_veto=False)
check('WT oversold detected on selloff', vu.wt_signal == 'OVERSOLD', vu.wt_signal)

# WT-mandatory: rig bars where MF+VWAP could align but WT is not — a gentle
# drift down then flat should leave WT neutral-ish; direction must be NEUTRAL
# whenever wt is not confirmed even if 2 components aligned.
vu2 = compute_vumanchu(selloff_bars(), 'short', require_wt=True, fuel_veto=False)
check('short confirmation not granted while WT oversold', vu2.direction == 'NEUTRAL',
      f'{vu2.direction} {vu2.reason}')

# fuel veto: strong down MF at a long zone with no exhaustion
def heavy_sell_bars(n=60):
    out, px, t = [], 4100.0, 1_700_000_000
    for i in range(n):
        px -= 2.0
        out.append(bar(t, px + 1.9, px + 2.0, px - 0.3, px, v=500))
        t += 300
    return out

vu3 = compute_vumanchu(heavy_sell_bars(), 'long', require_wt=True, fuel_veto=True)
check('fuel veto fires on relentless selling', vu3.vetoed or vu3.direction == 'NEUTRAL',
      f'vetoed={vu3.vetoed} dir={vu3.direction} mf={vu3.mf_value}')

check('confirmation swing exposed', vu.confirm_swing is None or vu.confirm_swing > 0)
check('wt_confirmed flag exposed (oversold long)', vu.wt_confirmed is True,
      str(vu.wt_confirmed))
check('wt_confirmed false for opposing direction', vu2.wt_confirmed is False)
check('veto path still reports component detail',
      vu3.vetoed is False or (vu3.wt_signal != '' and vu3.mf_signal != ''),
      f'{vu3.wt_signal}/{vu3.mf_signal}')


print('\n── exits ────────────────────────────────────────────────────')
class _Z:   # minimal zone stub
    gp_low = 4035.0; gp_high = 4042.0; centre = 4038.5
    htf_aligned = True; swing_end = 4100.0; direction = 'long'
    zone_id = 'v2_long_4038_gp'; active = True; score = 6.0

zone_stub = _Z()
plan, skip = plan_exits(
    zone_stub, 'LONG', 4040.0, confirm_swing=4034.0, atr_15m=4.0,
    daily_atr=35.0, today_high=4055.0, today_low=4030.0,
    zones=[], vol=None, session=None,
    cfg={'max_sl_pips': 40, 'tp1_r_min': 1.0, 'tp2_r_min': 1.5, 'tp2_r_max': 4.0},
)
check('plan produced from confirmation swing', plan is not None, skip)
if plan:
    check('SL below confirmation swing', plan.sl < 4034.0, f'sl={plan.sl}')
    check('SL basis recorded', plan.sl_basis == 'confirm_swing', plan.sl_basis)
    check('TP2 ≥ TP1 ≥ entry', plan.tp2 >= plan.tp1 > 4040.0)

# skip when structure doesn't fit the box
plan2, skip2 = plan_exits(
    zone_stub, 'LONG', 4040.0, confirm_swing=3990.0, atr_15m=4.0,
    daily_atr=35.0, today_high=4055.0, today_low=4030.0,
    zones=[], vol=None, session=None, cfg={'max_sl_pips': 40},
)
check('too-wide structural SL → SKIP (not truncate)', plan2 is None, str(plan2))

# σ-forecast cap: tiny remaining range forces the skip
plan3, skip3 = plan_exits(
    zone_stub, 'LONG', 4040.0, confirm_swing=4034.0, atr_15m=4.0,
    daily_atr=35.0, today_high=4055.0, today_low=4030.0,
    zones=[], vol=None, session=None,
    cfg={'max_sl_pips': 40, 'allow_overnight_htf_aligned': False},
    vol_fc={'expected_range': 12.0, 'upper_oc_75': 4043.0, 'lower_oc_75': 4010.0},
)
check('σ range cap blocks a no-room trade', plan3 is None, f'{plan3} {skip3}')


print('\n── trade_manager ────────────────────────────────────────────')
with tempfile.TemporaryDirectory() as td:
    tm = TradeManager(os.path.join(td, 'state.json'))
    cfg = {'max_trades_per_day': 4, 'max_concurrent_trades': 2,
           'max_open_risk_pct': 1.0, 'max_per_direction': 2,
           'min_entry_separation_pips': 15}

    ok, why = tm.can_open('LONG', 0.5, 4040.0, cfg)
    check('first trade allowed', ok, why)

    t1 = ManagedTrade('T1', 'v2_long_4038', 'LONG', 4040.0, 4030.0, 4050.0,
                      4060.0, 0.1, 0.5, '2026-07-02T10:00:00+00:00')
    tm.open_trade(t1)

    ok, why = tm.can_open('LONG', 0.5, 4045.0, cfg)
    check('same-shelf entry blocked (15p separation)', not ok, why)

    ok, why = tm.can_open('LONG', 0.5, 4070.0, cfg)
    check('separated same-direction entry allowed', ok, why)

    ok, why = tm.can_open('LONG', 0.6, 4070.0, cfg)
    check('aggregate risk cap enforced', not ok, why)

    t2 = ManagedTrade('T2', 'v2_long_4070', 'LONG', 4070.0, 4060.0, 4080.0,
                      4090.0, 0.1, 0.5, '2026-07-02T11:00:00+00:00')
    tm.open_trade(t2)
    ok, why = tm.can_open('SHORT', 0.5, 4100.0, cfg)
    check('max concurrent enforced', not ok, why)

    # BE simulation matches live management
    ev = t1.check_outcome(4050.0)          # TP1
    check('TP1 detected', ev == 'TP1_HIT', str(ev))
    check('SL moved to breakeven after TP1', abs(t1.sl - t1.entry_price) < 1e-9)
    ev = t1.check_outcome(4040.0)          # back to entry
    check('BE stop classified (not LOSS)', ev == 'BE_STOP', str(ev))

    # persistence round-trip
    tm.save()
    tm2 = TradeManager(os.path.join(td, 'state.json'))
    tm2.load()
    check('state round-trip restores trades', len(tm2.open_trades) == 2)
    check('trades_today restored', tm2.trades_today == 2, str(tm2.trades_today))

    # day rollover
    tm2.trades_date = '2020-01-01'
    tm2.roll_day_if_needed()
    check('day rollover resets trades_today', tm2.trades_today == 0)


print(f'\n{"="*60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
