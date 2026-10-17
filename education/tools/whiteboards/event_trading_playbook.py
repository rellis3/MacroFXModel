from ._wb import *
from math import sqrt, pi

# ── Trading a scheduled release (event-trading-playbook) ─────────────────────────────
# Event vol: the lesson's illustrative EUR/USD quotes. Thursday expiry 7% over 4 trading days,
# Friday expiry (spans payrolls) 9% over 5 days, spot 1.0800, 252-day clock.
S1, T1, S2, T2, SPOT, PIP = 0.07, 4, 0.09, 5, 1.08, 0.0001
ORD = S1 ** 2                                  # 0.0049, one ordinary day
EV = S2 ** 2 * T2 - S1 ** 2 * T1               # 0.0209, the event day alone
SE = sqrt(EV)                                  # 14.46%
MOVE = SE / sqrt(252) * SPOT / PIP             # 98.4 pips
ORD_MOVE = S1 / sqrt(252) * SPOT / PIP         # 47.6 pips
BE = sqrt(2 / pi) * MOVE                       # 78.5 pips
W = EV / ORD                                   # 4.27 ordinary days
assert round(SE * 100, 1) == 14.5 and round(MOVE) == 98 and round(ORD_MOVE) == 48 and round(BE) == 78
# Real episode, US CPI 10 Nov 2022 (BLS release; AP closing figures): headline 7.7% y/y vs ~7.9%
# expected; S&P 500 +5.5%, Nasdaq Composite +7.4%, Dow +3.7%; 2-year 4.62% -> 4.32%; core 6.3% vs ~6.5%.
# Sizing: $500 risk, $10/pip per 100k EUR/USD; 30-pip stop -> 1.7 lots; 3 sd ~ 295 pips -> 0.17 lots.
LOTS_STOP = 500 / (30 * 10)
LOTS_GAP = 500 / (3 * MOVE * 10)
assert round(LOTS_STOP, 1) == 1.7 and round(LOTS_GAP, 2) == 0.17

VAR = (10, 130, 360, 250)
RX = (10, 560, 280, 220)

ETP = dict(w=600, h=920, intro='One week of EUR/USD option quotes, one payrolls Friday, and one real CPI release. How the size of the move is priced before the number, and what actually moves price after it. Press play, or step through.', steps=[
    step('Payrolls are out on Friday at 8:30 a.m. New York. Two EUR/USD option expiries sit either side of it: Thursday\'s, 4 trading days at 7% volatility, ends before the release. Friday\'s, 5 days at 9%, spans it.',
         icon('clk', 'clock', 62, 6, 0.62, 'amber', 'payrolls Fri 8:30', lsize=17),
         box('thu', 210, 14, 170, 80, 'Thu expiry\n4 days · 7%', 'blue', size=18),
         box('fri', 420, 14, 170, 80, 'Fri expiry\n5 days · 9%', 'amber', size=18)),
    step('Volatility doesn\'t add up across days, but variance does. Each ordinary day carries 0.07 squared, 0.0049. The Thursday expiry is four of them: 0.0196.',
         chart('var', VAR, 'Variance carried by each day', [0.4, 5.6], [0, 0.024], [[0, '0'], [0.01, '0.01'], [0.02, '0.02']],
               [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri']], pl=52),
         dict(bars='ob', chart='var', data=[[1, ORD, '1×', 'blue'], [2, ORD, '1×', 'blue'], [3, ORD, '1×', 'blue'], [4, ORD, '1×', 'blue']], bw=40, ms=1100)),
    step(f'The Friday expiry\'s total is 0.09 squared times 5: 0.0405. Take away Thursday\'s 0.0196 and what is left, 0.0209, is payrolls day on its own. It is worth about {W:.1f} ordinary days.',
         dict(bars='evb', chart='var', data=[[5, round(EV, 4), f'{W:.1f}×', 'amber']], bw=40, ms=1100),
         dict(pulse='fri')),
    step(f'Take the square root: the event day is priced at {SE * 100:.1f}% annualised. Divide by the square root of 252, about 15.9, and multiply by 1.0800: ±{MOVE:.0f} pips for one standard deviation. An ordinary day is ±{ORD_MOVE:.0f}.',
         box('se', 390, 130, 200, 100, f'event vol\n√0.0209 = {SE * 100:.1f}%', 'purple', size=18),
         box('pips', 390, 262, 200, 118, 'payrolls day, 1 sd', 'amber', sub='±0 pips', size=18),
         arrow('se', 'pips', None, 'purple'),
         dict(count='pips', **{'from': 0, 'to': round(MOVE)}, dp=0, pre='±', suf=' pips', ms=1200)),
    step(f'A straddle over the release costs about 0.8 of that standard deviation: roughly {BE:.0f} pips. That is the move the market already charges for. A straddle pays only if the move beats it.',
         note('be', 490, 412, f'breakeven ≈ {BE:.0f} pips', 'amber', 17)),
    step('Once the number is out, the event\'s variance is spent. The next expiry no longer contains it, so short-dated implied vol falls back towards the ordinary level. That is the vol crush.',
         dict(dim='evb'),
         note('crush', 190, 412, 'after 8:30: amber bar spent', 'red', 17)),
    step('A real release: US CPI on 10 November 2022. The consensus was about 7.9% a year; the print was 7.7%. Still nearly four times the Fed\'s target, but 0.2 points below what was priced.',
         box('E', 10, 440, 160, 90, 'consensus\n≈ 7.9% y/y', 'blue', size=18),
         box('A', 220, 440, 160, 90, 'actual\n7.7% y/y', 'amber', size=18),
         box('s', 430, 440, 160, 90, 'surprise\nA − E ≈ −0.2', 'green', size=18),
         arrow('E', 'A', None, None),
         arrow('A', 's', None, 'green')),
    step('Prices reacted to the surprise, not the level. At the close the S&P 500 was up 5.5%, its best day since April 2020, the Nasdaq Composite 7.4% and the Dow 3.7%. The 2-year Treasury yield fell from 4.62% to 4.32%.',
         chart('rx', RX, 'Close, 10 Nov 2022 (%)', [0.4, 3.6], [0, 8.6], [[0, '0'], [4, '4'], [8, '8']],
               [[1, 'S&P'], [2, 'Nasdaq'], [3, 'Dow']], pl=36),
         dict(bars='rb', chart='rx', data=[[1, 5.5, '+5.5', 'green'], [2, 7.4, '+7.4', 'green'], [3, 3.7, '+3.7', 'green']], bw=40, ms=1100),
         box('y2', 310, 560, 280, 90, '2-year Treasury yield', 'blue', sub='4.62%', size=18),
         dict(count='y2', **{'from': 4.62, 'to': 4.32}, dp=2, suf='%', ms=1300)),
    step('Then the second move. The first is a fast jump on the headline in thin liquidity. The second comes from the details: here core CPI, 6.3% against about 6.5% expected, agreed with the headline, and the rally extended the next day. Revisions or a press conference can just as easily reverse it.',
         box('m1', 310, 676, 110, 104, 'first\nmove', 'amber', size=18),
         box('m2', 480, 676, 110, 104, 'second\nmove', 'green', size=18),
         arrow('m1', 'm2', None, 'green')),
    step(f'Sizing. With $500 at risk and $10 a pip, a 30-pip stop says {LOTS_STOP:.1f} lots. But that stop sits inside the priced move, and a stop fills at the next available price. Sizing for three event standard deviations, about {3 * MOVE:.0f} pips, says {LOTS_GAP:.2f} lots.',
         box('stop', 10, 808, 280, 100, f'30-pip stop\n→ {LOTS_STOP:.1f} lots', 'red', size=18),
         box('gap', 310, 808, 280, 100, f'3 sd ≈ {3 * MOVE:.0f} pips\n→ {LOTS_GAP:.2f} lots', 'green', size=18),
         dict(cross='stop')),
    step('The playbook in three lines. Know the move that is priced before the number. Trade the surprise, not the level. Size for the gap, not the stop.',
         dict(pulse='pips'), dict(pulse='s'), dict(pulse='gap')),
])


BOARD = dict(name='event_trading_playbook', lesson='event-trading-playbook', title='Trading a release: the priced move, the surprise and the gap', cfg=ETP,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=8)
