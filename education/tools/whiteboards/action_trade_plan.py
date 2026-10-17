from ._wb import *

# ── From a view to a trade plan (action-trade-plan) ──────────────────────────
# The lesson's worked example: EUR/USD long at 1.0850, ATR 65 pips, invalidation 1.0780,
# buffer 0.25 ATR ≈ 16 pips → stop 1.0764, D = 86 pips = 1.32 ATR, target 1.1000 = 150 pips
# = 1.74R, break-even 36.4%, $500 risk → 0.58 lots, +$870 at target, weekend gap to 1.0700
# → −$870. The 20-pip pain stop sits at 1.0830 (0.31 ATR). The price path in step 9 is
# illustrative only (it is labelled so on the board and in the caption).
ENTRY, INV, STOP, TGT, PAIN, GAPFILL = 1.0850, 1.0780, 1.0764, 1.1000, 1.0830, 1.0700
ATR = 65
BUF = round(0.25 * ATR)                       # 16 pips
assert abs((INV - BUF / 10000) - STOP) < 1e-9
D = round((ENTRY - STOP) * 10000)             # 86 pips
T = round((TGT - ENTRY) * 10000)              # 150 pips
LOTS = int(500 / (D * 10) * 100) / 100        # 0.58
assert D == 86 and T == 150 and LOTS == 0.58
assert round(T / D, 2) == 1.74 and round(100 / (1 + T / D), 1) == 36.4
assert round(LOTS * T * 10) == 870

PATH = [[0, 1.0850], [1, 1.0838], [2, 1.0815], [3, 1.0832], [4, 1.0861], [5, 1.0849], [6, 1.0884],
        [7, 1.0905], [8, 1.0893], [9, 1.0932], [10, 1.0951], [11, 1.0974], [12, 1.1000]]

def flat(v): return [[0, v], [15, v]]
def rlab(v, dy=0): return dict(lat=[15, v], ldx=6, ldy=dy, lanchor='start', lsize=15)

CH = (10, 170, 580, 330)
TRADE_PLAN = dict(w=600, h=720, intro='One view, turned into five numbers written before you click: entry, invalidation, stop, target and size. Press play, or step through.', steps=[
    step('A view: EUR/USD looks cheap against the 2-year rate spread and should recover toward 1.1000 over about three weeks. Price is 1.0850. A view has a direction and a reason, but no prices and no size.',
         icon('you', 'person', 20, 10, 0.7, 'blue', 'you', lsize=18),
         icon('view', 'scroll', 130, 10, 0.7, 'blue', 'the view', lsize=18),
         note('vnote', 410, 60, 'direction + reason', 'blue', 19),
         note('vnote2', 410, 92, 'no prices, no size', 'red', 19)),
    step('First number: entry at 1.0850. An ordinary day moves about 65 pips from high to low. That is the ATR, the yardstick for noise.',
         chart('px', CH, 'EUR/USD: the plan on a price chart', [0, 15], [1.0680, 1.1030],
               [[1.07, '1.0700'], [1.08, '1.0800'], [1.09, '1.0900'], [1.10, '1.1000']],
               [[0, 'entry'], [5, '5'], [10, '10'], [15, '15 sessions']], pl=62, pr=128),
         series('entry', 'px', flat(ENTRY), None, ms=500, label='entry 1.0850', **rlab(ENTRY, -10)),
         chip('atr', 470, 120, 'ATR 65 pips', 'blue')),
    step('Second number, from the analysis: the March low at 1.0780 held even when the spread was at its widest. A daily close below it means the reason is wrong. That price is the invalidation level.',
         series('inv', 'px', flat(INV), 'amber', ms=500, label='invalid. 1.0780', **rlab(INV, -9))),
    step('Third: the stop goes just beyond invalidation, by a quarter of an ATR. 0.25 × 65 ≈ 16 pips, so the stop is 1.0764. That is 86 pips from entry, or 1.32 ATR.',
         series('stop', 'px', flat(STOP), 'red', ms=500, label='stop 1.0764', **rlab(STOP, 10))),
    step('Shade half an ATR either side of entry: a normal day\'s wiggle. The stop sits well outside it, so if it is hit, that means something. The reason was wrong.',
         dict(gap='noise', chart='px', top=flat(ENTRY + 0.00325), bot=flat(ENTRY - 0.00325), tone='blue', op=0.18),
         dict(note='nlab', chart='px', at=[0.3, ENTRY + 0.00325], text='± ½ ATR: noise', tone='blue', size=16, anchor='start', dx=0, dy=-10)),
    step('A trader who only wants to risk 20 pips puts the stop at 1.0830 instead: 0.31 ATR, inside the noise. Nothing about the thesis changes at 1.0830. A quiet morning can hit it.',
         series('pain', 'px', flat(PAIN), 'red', dash=True, ms=500, label='pain stop 1.0830', **rlab(PAIN, 2))),
    step('Fourth: the target, also from the analysis: 1.1000, 150 pips away. That is 150 ÷ 86 = 1.74R, so the trade breaks even before costs if it wins 36.4% of the time.',
         series('tgt', 'px', flat(TGT), 'green', ms=500, label='target 1.1000', **rlab(TGT)),
         box('rr', 10, 515, 280, 84, 'target = 150 pips = 1.74R\nbreak-even win rate 36.4%', 'green', size=18)),
    step('Fifth, and last: the size. Decide the money first: 0.5% of $100,000 is $500. One lot loses 86 × $10 = $860 over the stop distance, so $500 ÷ $860 = 0.58 lots, rounded down.',
         box('size', 310, 515, 280, 84, 'size = $500 ÷ (86 × $10)', 'purple', sub='0.00 lots', size=18),
         dict(count='size', **{'from': 0, 'to': 0.58, 'dp': 2, 'suf': ' lots', 'ms': 1400})),
    step('One illustrative path: an ordinary dip on day 2 takes out the 20-pip pain stop. Then price climbs to 1.1000. The analysis stop never came close, and at target the plan makes 0.58 × 150 × $10 = $870.',
         dict(dim='noise'), dict(dim='nlab'),
         series('path', 'px', PATH, 'purple', ms=1800, label='illustrative path', lat=[9, 1.0932], ldx=10, ldy=14, lanchor='start', lsize=15),
         dot('hitpain', 'px', [2, 1.0815], 'pain stop hit', 'red', dx=8, dy=20, anchor='start'),
         dot('hittgt', 'px', [12, TGT], '+$870', 'green', dy=-16)),
    step('A stop is an order, not a guarantee. If a weekend gap opened at 1.0700, the stop would fill there: a loss of 0.58 × 150 × $10 = $870, 1.74 times the plan. Around weekends and events, size for the gap.',
         series('gapl', 'px', flat(GAPFILL), 'red', dash=True, ms=500, label='gap fill 1.0700', **rlab(GAPFILL, 8)),
         box('gapbox', 10, 614, 280, 96, 'weekend gap to 1.0700?\nthe stop fills there:\nloss $870, not $500', 'red', size=18)),
    step('It happened: on 15 January 2015 the Swiss National Bank dropped its 1.20 floor under EUR/CHF without warning. Stops just under 1.20 filled far lower, and losses were many times what plans allowed.',
         box('snb', 310, 614, 280, 96, 'SNB, 15 Jan 2015:\nstops under 1.20\nfilled far lower', 'amber', size=18)),
    step('Five numbers, written before you click: entry, invalidation, stop, target and size. The reason sets the stop, and the stop sets the size. Fear belongs in the size, never in the stop.',
         dict(hide='vnote'), dict(hide='vnote2'),
         note('sum', 410, 60, 'reason → stop → size', 'green', 20),
         note('sum2', 410, 92, 'written before entry', 'green', 19)),
])


BOARD = dict(name='action_trade_plan', lesson='action-trade-plan', title='From a view to a trade plan, drawn step by step', cfg=TRADE_PLAN,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)
