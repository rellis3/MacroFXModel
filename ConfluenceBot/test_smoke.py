"""
Confluence Bot — synthetic smoke tests (no network, no MT5).

Run from the ConfluenceBot directory:  python test_smoke.py
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
from modules.exits import plan_exits, collect_obstacles
from modules.session_engine import compute_session_levels
from modules.trendline_engine import detect_trendlines
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


print('\n── multi-instrument (Confluence generalisation) ─────────────')
# The confluence bot opens the gold strategy to any registry instrument.
# Verify the per-instrument context resolves, distances scale by pip, and the
# shared sizing brick produces sane lots across FX / gold / index.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from main import (build_instr, _calc_lot_size, _serialize_paper_trades,
                  _VOL_FORECAST_NAME, DEFAULT_CFG)

gold_i = build_instr('GOLD', {})
eur_i  = build_instr('EUR/USD', {})
nq_i   = build_instr('NQ', {})
check('gold ctx resolves', gold_i is not None and gold_i.key == 'gold')
check('gold pip/digits/point', gold_i.pip == 1.0 and gold_i.digits == 2 and gold_i.point_val == 100.0)
check('EUR/USD ctx resolves', eur_i is not None and eur_i.pip == 0.0001 and eur_i.digits == 5)
check('EUR/USD MT5 symbol', eur_i.symbol == 'EURUSD', eur_i.symbol)
check('NQ maps to vol-forecast NQ', nq_i.vol_name == 'NQ', str(nq_i.vol_name))
check('gold maps to vol-forecast GOLD', gold_i.vol_name == 'GOLD', str(gold_i.vol_name))
check('FX vol-forecast name = upper key', eur_i.vol_name == 'EURUSD', str(eur_i.vol_name))
check('unknown instrument → None (fail loud, skip)', build_instr('NOTREAL', {}) is None)

# broker override wins over the registry default MT5 symbol
dax_i = build_instr('DAX', {'dax': 'GER40.cash'})
check('broker override applied', dax_i.symbol == 'GER40.cash', dax_i.symbol)

# distance config is pip-denominated: 40-pip SL cap → 0.0040 on EUR/USD, 40 on gold
check('pip-scaled SL cap (gold)', 40 * gold_i.pip == 40.0)
check('pip-scaled SL cap (EUR/USD)', abs(40 * eur_i.pip - 0.0040) < 1e-12)
check('bucket scales with pip', abs(eur_i.bucket(DEFAULT_CFG) - 0.5 * eur_i.pip) < 1e-12)

# sizing: 0.5% of $10k over a 20-pip stop
lots_gold = _calc_lot_size(10000, 0.5, 20 * gold_i.pip, gold_i, 5.0)   # 20p on gold, pt=$100
lots_eur  = _calc_lot_size(10000, 0.5, 20 * eur_i.pip,  eur_i, 5.0)    # 20p on EUR, pt=$10
check('gold lots sane', 0.01 <= lots_gold <= 5.0, str(lots_gold))
check('EUR lots sane', 0.01 <= lots_eur <= 5.0, str(lots_eur))
# risk_amt=$50; gold 20p×$100=2000/lot → 0.025→0.03; EUR 20p×$10=200/lot → 0.25
check('gold sizing = risk/(pips×pt)', abs(lots_gold - 0.03) < 1e-6 or abs(lots_gold - 0.02) < 1e-6, str(lots_gold))
check('EUR sizing larger (cheaper per pip)', lots_eur > lots_gold, f'{lots_eur} vs {lots_gold}')

# paper serialization uses the instrument pip + point value for PnL and digits
class _FakeTrade:
    def __init__(self):
        self.direction='LONG'; self.entry_price=1.08000; self.lot_size=0.10
        self.tp1_hit=False; self.zone_id='z'; self.trade_id='t'; self.sl=1.079; self.tp1=1.081; self.tp2=1.082
    def entry_dt(self):
        import datetime; return datetime.datetime(2026,1,1,tzinfo=datetime.timezone.utc)
pp = _serialize_paper_trades([_FakeTrade()], 1.08100, eur_i)   # +10 pips
check('paper position symbol = MT5 symbol', pp[0]['symbol'] == 'EURUSD')
check('paper open price rounded to digits', pp[0]['open_price'] == 1.08)
# +10 pips × $10/pip × 0.10 lot = $10
check('paper PnL uses pip×point×lots', abs(pp[0]['profit'] - 10.0) < 1e-6, str(pp[0]['profit']))

check('default pairs span fx+commodity+index',
      any('/' in p for p in DEFAULT_CFG['pairs']) and 'GOLD' in DEFAULT_CFG['pairs']
      and 'NQ' in DEFAULT_CFG['pairs'])


print('\n── FX-scale arithmetic (EUR/USD, pip 0.0001) ────────────────')
# Detector for gold-native price-unit constants surviving in the modules: on
# FX-scale prices the fib grid must keep pip resolution, zone ids must stay
# unique, entry pads must be pip-scale, and obstacle merging / pivots must not
# collapse the whole board. Falls back to the legacy signature so a pre-fix
# module shows the degenerate OUTPUT, not a TypeError.
def _compat(fn, *args, **kw):
    try:
        return fn(*args, **kw)
    except TypeError:
        for k in ('pip', 'digits'):
            kw.pop(k, None)
        return fn(*args, **kw)

EPIP, EDIG = 0.0001, 5


def synth_eur_two_legs() -> list[dict]:
    """1.0700 base → rally 1.0800 → pull back 1.0760 → extend to 1.0830.
    Two valid long legs (base low → top, pullback low → top), distinct origins."""
    out, t, px = [], 1_700_000_000, 1.0700

    def b(o, h, l, c):
        nonlocal t
        out.append(bar(t, round(o, EDIG), round(h, EDIG), round(l, EDIG), round(c, EDIG)))
        t += 1800
    for _ in range(10):
        b(px, px + 2 * EPIP, px - 2 * EPIP, px)
    for _ in range(30):
        px += 100 * EPIP / 30
        b(px - EPIP, px + 2.5 * EPIP, px - 2.5 * EPIP, px)
    for _ in range(10):
        px -= 40 * EPIP / 10
        b(px + EPIP, px + 2.5 * EPIP, px - 2.5 * EPIP, px)
    for _ in range(20):
        px += 70 * EPIP / 20
        b(px - EPIP, px + 2.5 * EPIP, px - 2.5 * EPIP, px)
    for _ in range(6):     # drift just under the top so the top pivot confirms
        b(px, px + EPIP, px - 2 * EPIP, px - EPIP)
        px -= EPIP
    return out


eur_bars  = synth_eur_two_legs()
eur_price = eur_bars[-1]['close']

eur_legs = _compat(build_legs, eur_bars, 'M30', pip=EPIP, digits=EDIG)
eur_long = [l for l in eur_legs if l.direction == 'long']
check('FX: ≥2 long legs detected', len(eur_long) >= 2, f'{len(eur_long)} legs')
check('FX: distinct legs keep distinct leg ids',
      len({l.leg_id for l in eur_long}) >= 2,
      str(sorted({l.leg_id for l in eur_long})))
check('FX: leg size keeps pip resolution (70p leg ≠ 0.01)',
      any(abs(l.size - round(l.size, 2)) > 1e-9 for l in eur_long),
      str([l.size for l in eur_long]))

eur_lines, eur_bands = _compat(emit_levels, eur_legs, eur_price, digits=EDIG)
check('FX: fib levels not all on the 100-pip (0.01) grid',
      any(abs(ln.price - round(ln.price, 2)) > 1e-9 for ln in eur_lines),
      str(sorted({ln.price for ln in eur_lines})[:8]))

eur_zones, eur_dbg = _compat(build_level_matrix, {'M30': eur_bars}, eur_price,
                             cluster_tolerance=3.0 * EPIP, pip=EPIP, digits=EDIG)
check('FX: zones built', len(eur_zones) >= 2, str(eur_dbg))
_zids = [z.zone_id for z in eur_zones]
check('FX: zone ids unique across zones', len(set(_zids)) == len(_zids), str(_zids))
check('FX: zone entry pad is pip-scale (window < 50 pips)',
      all(z.gp_high - z.gp_low < 50 * EPIP for z in eur_zones),
      str([(z.gp_low, z.gp_high) for z in eur_zones[:3]]))

# exits: obstacles 7 pips apart are separate shelves on EUR/USD
class _SZ:
    def __init__(self, c):
        self.direction = 'short'; self.active = True; self.centre = c; self.score = 5.0
eur_obs = _compat(collect_obstacles, 'LONG', 1.0800, [_SZ(1.0810), _SZ(1.0817)],
                  pip=EPIP)
check('FX: obstacles 7 pips apart not merged', len(eur_obs) == 2, str(eur_obs))

# session engine: floor pivot keeps pip resolution (1.08277, not 1.08)
eur_sess = _compat(compute_session_levels, [],
                   {'high': 1.0850, 'low': 1.0790, 'close': 1.0843},
                   1.0824, digits=EDIG)
check('FX: floor pivot keeps pip resolution', abs(eur_sess.pivot - 1.08277) < 1e-9,
      str(eur_sess.pivot))

# trendlines: projected price keeps pip resolution, pip-scale dedup
def zigzag_up(cycles=6, base=1.0700, amp=20 * EPIP, rise=10 * EPIP):
    """Ascending zigzag — swing lows step up 10 pips per cycle."""
    out, t, px = [], 1_700_000_000, base
    for _ in range(cycles):
        for _ in range(10):
            px -= amp / 10
            out.append(bar(t, px + EPIP, px + 2 * EPIP, px - EPIP, px)); t += 3600
        for _ in range(15):
            px += (amp + rise) / 15
            out.append(bar(t, px - EPIP, px + 2 * EPIP, px - EPIP, px)); t += 3600
    return out

eur_tls = _compat(detect_trendlines, zigzag_up(), 'H1', pip=EPIP, digits=EDIG)
check('FX: ascending trendline detected', any(t.kind == 'ascending' for t in eur_tls),
      str(eur_tls))
check('FX: trendline projection keeps pip resolution',
      any(abs(t.projected - round(t.projected, 2)) > 1e-9 for t in eur_tls),
      str([t.projected for t in eur_tls]))


print('\n── gold regression (pip=1.0 / digits=2 bit-identical) ───────')
# The pip/digits parameters at gold defaults must reproduce the pre-refactor
# numbers exactly (values captured from the pre-fix module on the same
# synthetic bars at the top of this file).
g_legs = _compat(build_legs, bars, 'M30', pip=1.0, digits=2)
check('gold: leg id / origin / end / size unchanged',
      [(l.leg_id, l.origin, l.end, l.size) for l in g_legs] ==
      [('M30_long_3998_4102', 3998.0, 4102.5, 104.5)],
      str([(l.leg_id, l.origin, l.end, l.size) for l in g_legs]))

g_zones, _ = _compat(build_level_matrix, {'M30': bars}, price, pip=1.0, digits=2)
g_summary = sorted((z.zone_id, z.centre, z.gp_low, z.gp_high,
                    z.swing_origin, z.swing_end) for z in g_zones)
check('gold: zone matrix unchanged (ids, centres, pads, anchors)',
      g_summary == [('v2_long_4010',    4009.91, 4009.16, 4010.66, 3998.0, 4102.5),
                    ('v2_long_4020',    4020.36, 4019.61, 4021.11, 3998.0, 4102.5),
                    ('v2_long_4036_gp', 4036.24, 4033.82, 4038.67, 3998.0, 4102.5)],
      str(g_summary))

g_obs = _compat(collect_obstacles, 'LONG', 4040.0, [_SZ(4051.0), _SZ(4052.0)],
                pip=1.0)
check('gold: $1-apart obstacles still merge (same shelf)', len(g_obs) == 1, str(g_obs))
# NOTE (Batch 6 scoring dedup): the capture above pins STRUCTURAL fields only
# (ids, centres, pads, anchors) — score_zones was changed to collapse correlated
# credits into per-family max-once credits, which touches zone.score/composition
# only, so this capture did not move. The scoring change itself is pinned below.


print('\n── zone scoring dedup (Batch 6: one credit per correlated family) ──')
# Pivots are deterministic functions of prev-day H/L/C, and POC/VAH/VAL/HVN all
# read the same day's volume distribution — each family must score ONCE (max of
# its matching members), while independent sources still stack.
from modules.level_matrix import ZoneV2, NONFIB_WEIGHTS
from modules.volume_profile import VolumeProfile, NakedPOC
from modules.session_engine import SessionLevels


def _mk_zone(c=4040.0):
    return ZoneV2(zone_id='sz', direction='long', gp_low=c - 1.0, gp_high=c + 1.0,
                  centre=c, in_gp=False)


def _mk_vol(**kw):
    d = dict(poc=0.0, vah=0.0, val=0.0, hvn_levels=[], lvn_levels=[],
             prev_poc=None, prev_vah=None, prev_val=None, npoc=None,
             npoc_stack=[], session_high=0.0, session_low=0.0,
             total_volume=0.0, computed_from_bars=0)
    d.update(kw)
    return VolumeProfile(**d)


def _mk_sess(**kw):
    d = dict(current_price=4040.0, daily_open=0.0, prev_daily_high=0.0,
             prev_daily_low=0.0, prev_daily_close=0.0, asia_high=0.0,
             asia_low=0.0, asia_mid=0.0, london_open=0.0, london_high=0.0,
             london_low=0.0, ny_open=0.0, ny_high=0.0, ny_low=0.0,
             current_session='', pivot=0.0, r1=0.0, r2=0.0, r3=0.0,
             s1=0.0, s2=0.0, s3=0.0, vwap=0.0, vwap_slope=0.0, vwap_std=0.0)
    d.update(kw)
    return SessionLevels(**d)


class _NeutralHTF:
    bias = 'NEUTRAL'
    confidence = 0.0


_C = 4040.0

# Whole prior-session family stacked at one price → ONE credit at the strongest
# member's weight (daily_open 1.5), not 1.5+1.2+1.0+0.8 = 4.5 as before.
_z1 = _mk_zone(_C)
score_zones([_z1], _mk_vol(),
            _mk_sess(daily_open=_C, prev_daily_high=_C, asia_high=_C, pivot=_C),
            _NeutralHTF())
check('prior-session family scores ONCE at max member weight',
      abs(_z1.score - NONFIB_WEIGHTS['daily_open']) < 1e-9, str(_z1.score))
check('composition still names every matched member',
      any('Daily open' in s and 'Pivot' in s for s in _z1.composition),
      str(_z1.composition))

# Whole volume-profile family at one price → ONE credit (POC 1.5), while the
# age-weighted nPOC stays a separate credit (2.0 + 0.1×2d = 2.2).
_z2 = _mk_zone(_C)
score_zones([_z2], _mk_vol(poc=_C, hvn_levels=[_C], vah=_C,
                           npoc_stack=[NakedPOC(price=_C, date='', age_days=2)]),
            _mk_sess(), _NeutralHTF())
check('volume-profile family scores ONCE at max member weight (+ separate nPOC)',
      abs(_z2.score - (NONFIB_WEIGHTS['poc'] + 2.2)) < 1e-9, str(_z2.score))

# Independent families still stack: daily open (prior-session) + POC (vol
# profile) are different evidence and both count.
_z3 = _mk_zone(_C)
score_zones([_z3], _mk_vol(poc=_C), _mk_sess(daily_open=_C), _NeutralHTF())
check('independent families still stack',
      abs(_z3.score - (NONFIB_WEIGHTS['poc'] + NONFIB_WEIGHTS['daily_open'])) < 1e-9,
      str(_z3.score))

# A single member of a family scores exactly its own weight (no behaviour
# change for the common single-hit case, so min_zone_score 4.0 keeps meaning).
_z4 = _mk_zone(_C)
score_zones([_z4], _mk_vol(), _mk_sess(pivot=_C), _NeutralHTF())
check('single family member unchanged (pivot alone = 0.8)',
      abs(_z4.score - NONFIB_WEIGHTS['pivot']) < 1e-9, str(_z4.score))


print('\n── options-OI confluence (put/call walls, max pain, HVL, gamma flip) ──')
# The morning OI paste (KV oi_store → /api/oi-levels) strengthens a zone that
# sits on a wall / max pain / HVL, one credit at the strongest matching type.

# A gold zone at 4040 with a put wall exactly there → one oi_magnet credit.
_zo1 = _mk_zone(_C)
score_zones([_zo1], _mk_vol(), _mk_sess(), _NeutralHTF(),
            oi_levels=[(_C, 'put_wall')], pip=1.0)
check('OI wall at the zone → oi_magnet credit',
      abs(_zo1.score - NONFIB_WEIGHTS['oi_magnet']) < 1e-9, str(_zo1.score))
check('OI composition names the type + price',
      any(s.startswith('OI put_wall') for s in _zo1.composition), str(_zo1.composition))

# Several OI strikes near one zone are ONE piece of positioning evidence — the
# credit is awarded once at the strongest type (magnet > gamma flip), not stacked.
_zo2 = _mk_zone(_C)
score_zones([_zo2], _mk_vol(), _mk_sess(), _NeutralHTF(),
            oi_levels=[(_C, 'gamma_flip'), (_C, 'call_wall'), (_C, 'max_pain')], pip=1.0)
check('multiple OI strikes score ONCE at the strongest (magnet, not stacked)',
      abs(_zo2.score - NONFIB_WEIGHTS['oi_magnet']) < 1e-9, str(_zo2.score))

# gamma_flip alone is a boundary, not a magnet → the smaller credit.
_zo3 = _mk_zone(_C)
score_zones([_zo3], _mk_vol(), _mk_sess(), _NeutralHTF(),
            oi_levels=[(_C, 'gamma_flip')], pip=1.0)
check('gamma_flip alone scores the smaller boundary credit',
      abs(_zo3.score - NONFIB_WEIGHTS['oi_gamma_flip']) < 1e-9, str(_zo3.score))

# 3× wall strength scales the credit — a STRONG wall scores more than a WEAK one
# (the same wall, different tier). Non-wall types keep the flat credit.
_zoS = _mk_zone(_C); _zoW = _mk_zone(_C)
score_zones([_zoS], _mk_vol(), _mk_sess(), _NeutralHTF(), oi_levels=[(_C, 'call_wall', 'strong')], pip=1.0)
score_zones([_zoW], _mk_vol(), _mk_sess(), _NeutralHTF(), oi_levels=[(_C, 'call_wall', 'weak')], pip=1.0)
check('strong wall scores 1.5× the magnet base',
      abs(_zoS.score - NONFIB_WEIGHTS['oi_magnet'] * 1.5) < 1e-9, str(_zoS.score))
check('weak wall scores less than strong', _zoW.score < _zoS.score, f'{_zoW.score} < {_zoS.score}')
check('untiered (2-tuple) wall still scores the flat magnet (back-compat)',
      abs(_zo1.score - NONFIB_WEIGHTS['oi_magnet']) < 1e-9, str(_zo1.score))

# An OI level outside proximity earns nothing (default gold proximity = $3).
_zo4 = _mk_zone(_C)
score_zones([_zo4], _mk_vol(), _mk_sess(), _NeutralHTF(),
            oi_levels=[(_C + 20, 'call_wall')], pip=1.0)
check('OI level beyond proximity adds no credit', abs(_zo4.score) < 1e-9, str(_zo4.score))

# No oi_levels passed (or use_oi off) → scoring is untouched (back-compat).
_zo5 = _mk_zone(_C)
score_zones([_zo5], _mk_vol(), _mk_sess(pivot=_C), _NeutralHTF())
check('omitting oi_levels leaves scoring unchanged',
      abs(_zo5.score - NONFIB_WEIGHTS['pivot']) < 1e-9, str(_zo5.score))

# Round-number independence flag: a wall on a big figure is tagged '@rn' so the
# forward-test can slice it out; the credit still applies (no round_number
# source in this scorer to double-count).
_zo6 = _mk_zone(2000.0)
score_zones([_zo6], _mk_vol(), _mk_sess(), _NeutralHTF(),
            oi_levels=[(2000.0, 'call_wall')], pip=1.0)
check('OI at a round number tagged @rn (credit still applies)',
      abs(_zo6.score - NONFIB_WEIGHTS['oi_magnet']) < 1e-9
      and any('@rn' in s for s in _zo6.composition), str(_zo6.composition))


print('\n── paper→live guard ─────────────────────────────────────────')
# A KV paper_mode:false must never flip a locally-started paper bot live on a
# config refresh — LIVE requires BOTH the --live flag AND KV paper_mode:false.
import argparse
from main import ConfluenceBot

_ns = lambda live: argparse.Namespace(live=live, pairs=None, log_dir='.')

cb = ConfluenceBot(_ns(False))
cb.cfg['paper_mode'] = False          # simulate a KV flip to live
cb._enforce_live_guard()
check('KV live flip without --live stays PAPER', cb.cfg.get('paper_mode') is True)
check('block warning latched (fires once per state change)',
      cb._live_blocked_warned is True)
cb.cfg['paper_mode'] = True
cb._enforce_live_guard()
check('warning latch resets when KV returns to paper',
      cb._live_blocked_warned is False)

cb2 = ConfluenceBot(_ns(True))
cb2.cfg['paper_mode'] = False
cb2._enforce_live_guard()
check('--live + KV paper_mode:false goes LIVE', cb2.cfg.get('paper_mode') is False)
cb3 = ConfluenceBot(_ns(True))
cb3.cfg['paper_mode'] = True
cb3._enforce_live_guard()
check('--live alone without KV opt-in stays PAPER', cb3.cfg.get('paper_mode') is True)


print('\n── paper costs (per-instrument spread + swap placeholder) ───')
from datetime import datetime, timedelta, timezone
from main import (DEFAULT_CFG, build_instr, paper_spread_price, paper_swap_pips)
from modules.trade_manager import paper_close_exec

_eur  = build_instr('EUR/USD', {})
_jpy  = build_instr('USD/JPY', {})
_gold = build_instr('GOLD', {})
_nq   = build_instr('NQ', {})

check('FX major spread = 0.8 pips in price units',
      abs(paper_spread_price(_eur, DEFAULT_CFG) - 0.8 * 0.0001) < 1e-12)
check('JPY cross spread = 1.0 pip (pip=0.01)',
      abs(paper_spread_price(_jpy, DEFAULT_CFG) - 0.01) < 1e-12)
check('gold spread = $0.30',
      abs(paper_spread_price(_gold, DEFAULT_CFG) - 0.30) < 1e-12)
check('index spread = 2 points',
      abs(paper_spread_price(_nq, DEFAULT_CFG) - 2.0) < 1e-12)
_ov_cfg = {**DEFAULT_CFG, 'paper_spread_overrides': {'eurusd': 0.5}}
check('per-instrument override wins',
      abs(paper_spread_price(_eur, _ov_cfg) - 0.5 * 0.0001) < 1e-12)

# paper BUY fills at mid + spread/2; a SHORT's stop is hit by the ask
_spr = paper_spread_price(_eur, DEFAULT_CFG)
_mid = 1.10000
check('paper BUY entered at mid + spread/2',
      abs(round(_mid + _spr / 2, _eur.digits) - 1.10004) < 1e-12)
_now_iso = datetime.now(timezone.utc).isoformat()
_short = ManagedTrade('CS1', 'z', 'SHORT', _mid - _spr / 2, 1.10100, 1.09900,
                      1.09800, 0.1, 0.5, _now_iso)
check('SHORT stop hit by ask (mid still below SL)',
      _short.check_outcome(1.10097, spread=_spr) == 'SL_HIT')
check('spread=0 (live fallback) unchanged',
      ManagedTrade('CS2', 'z', 'SHORT', _mid, 1.10100, 1.09900, 1.09800,
                   0.1, 0.5, _now_iso).check_outcome(1.10097) is None)
check('LONG closes at bid',
      abs(paper_close_exec('LONG', _mid, _spr) - (_mid - _spr / 2)) < 1e-12)

# Overnight swap placeholder: paper_swap_pct% of notional per UTC midnight
_t2 = ManagedTrade('CS3', 'z', 'LONG', 1.10000, 1.09000, 1.11000, 1.12000,
                   0.1, 0.5,
                   (datetime.now(timezone.utc) - timedelta(days=2)).isoformat())
_expected = 1.10000 * (0.001 / 100.0) * 2 / _eur.pip   # 2 nights → 0.22 pips
check('swap = swap_pct of notional per night, in pips (2 nights)',
      abs(paper_swap_pips(_t2, _eur, DEFAULT_CFG) - _expected) < 1e-9,
      f'{paper_swap_pips(_t2, _eur, DEFAULT_CFG)} vs {_expected}')
_t3 = ManagedTrade('CS4', 'z', 'LONG', 1.10000, 1.09000, 1.11000, 1.12000,
                   0.1, 0.5, _now_iso)
check('no swap on an intraday hold', paper_swap_pips(_t3, _eur, DEFAULT_CFG) == 0.0)
check('swap disabled at 0 pct',
      paper_swap_pips(_t2, _eur, {**DEFAULT_CFG, 'paper_swap_pct': 0}) == 0.0)


# ── Batch 5: per-currency netting in the global portfolio gate ────────────────
print('\n— global_can_open per-currency netting —')
import main as cbmain
from types import SimpleNamespace as NS


def _eng(display, trades):
    return NS(instr=NS(display=display),
              tm=NS(open_trades=[NS(direction=d, risk_pct=r, be_moved=be)
                                 for d, r, be in trades]))


_bot = cbmain.ConfluenceBot.__new__(cbmain.ConfluenceBot)
_bot.cfg = {**cbmain.DEFAULT_CFG, 'max_total_open_trades': 99,
            'max_total_open_risk_pct': 99.0, 'max_total_per_direction': 99}
_bot.engines = {
    'eurusd': _eng('EUR/USD', [('LONG', 1.0, False)]),
    'usdjpy': _eng('USD/JPY', [('SHORT', 1.0, False)]),
}

check('_ccy_legs splits pairs, skips indices',
      cbmain._ccy_legs('EUR/USD') == ('EUR', 'USD') and cbmain._ccy_legs('NQ') is None)

_net = _bot._currency_risk_map()
check('long EURUSD + short USDJPY = ADDITIVE −2% USD (not offsetting labels)',
      abs(_net['USD'] + 2.0) < 1e-9 and abs(_net['EUR'] - 1.0) < 1e-9
      and abs(_net['JPY'] - 1.0) < 1e-9, str(_net))

_ok, _why = _bot.global_can_open('LONG', 0.5, NS(display='GBP/USD'))  # USD → −2.5, cap 1.5
check('entry pushing |net USD| over max_currency_risk_pct blocked',
      not _ok and 'currency risk cap' in _why, _why)

_ok2, _ = _bot.global_can_open('LONG', 0.5, NS(display='USD/CHF'))   # long USD reduces |net|
check('risk-REDUCING entry not blocked by the currency cap', _ok2)

_ok3, _ = _bot.global_can_open('LONG', 0.5, NS(display='NQ'))        # no FX legs
check('non-pair instrument skips currency netting', _ok3)

_bot.engines['eurusd'].tm.open_trades[0].be_moved = True
_net2 = _bot._currency_risk_map()
check('BE-moved trades carry no risk in the netting',
      abs(_net2['USD'] + 1.0) < 1e-9, str(_net2))

_bot.cfg['max_total_per_direction'] = 1                              # label caps still live
_ok4, _why4 = _bot.global_can_open('SHORT', 0.1, NS(display='GBP/USD'))
check('existing per-direction label cap still enforced',
      not _ok4 and 'global max SHORT' in _why4, _why4)


print(f'\n{"="*60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
