from ._wb import *

# ── Purchasing power parity: one coffee, two currencies (purchasing-power-parity) ──
# The lesson's own numbers: an identical coffee costs $3 in New York and £3 in London;
# GBP/USD 1.50, so the London coffee is £3 × 1.50 = $4.50, 50% more. Absolute PPP:
# S = P_dom / P_for = $3 / £3 = 1.00 (vs 1.50 in the market). Big Mac: $5.50 in the US vs
# the equivalent of $3.20 elsewhere: (5.50 − 3.20) / 5.50 = 41.8% ≈ 42% cheap. Relative PPP:
# 8% vs 2% inflation → the currency should fall by roughly the 6-point gap. Rogoff (1996)
# half-lives of three to five years; a "20% undervalued" reading can widen for years first.
# The real-exchange-rate path is ILLUSTRATIVE, shaped like the lesson's stylized chart
# (a ~10-year undervalued leg, then a ~6-year overvalued leg, over 24 years).
# Japan 2022–24: US CPI peaked at 9.1% (June 2022); USD/JPY ~115 at the start of 2022, near
# 152 that October, past 160 in 2024 (the line joins only those stated points: approx.);
# Fed from near zero to 5.25–5.50% by July 2023; BoJ at −0.1% until March 2024; MoF bought
# yen in 2022 and 2024, slowing the fall without reversing it.

def _cup(id, x, y, tone):
    """A coffee cup doodle as draw-on lines; (x, y) = top-left of the cup body."""
    P = lambda pts: [[x + px, y + py] for px, py in pts]
    parts = [[[0, 10], [8, 78], [62, 78], [70, 10], [0, 10]],
             [[68, 24], [84, 26], [86, 44], [78, 56], [64, 58]],
             [[-8, 86], [78, 86]],
             [[22, 2], [16, -5], [24, -11], [18, -18]], [[44, 2], [38, -5], [46, -11], [40, -18]]]
    return [dict(line=f'{id}{i}', points=P(p), tone=tone, width=3, ms=260) for i, p in enumerate(parts)]

assert round((5.50 - 3.20) / 5.50 * 100) == 42 and 3 * 1.50 == 4.50

RFX = [[0, 10], [1, 15], [2, 20], [3, 23], [4, 25], [5, 26], [6, 23], [7, 19], [8, 16], [9, 13], [10, 5],
       [11, -3], [12, -9], [13, -13], [14, -12], [15, -7], [16, -1], [17, 5], [18, 9], [19, 11], [20, 10],
       [21, 12], [22, 9], [23, 7], [24, 6]]
RC = (10, 516, 580, 214)
JC = (10, 742, 350, 168)

PPP = dict(w=600, h=920, intro='One coffee priced in two currencies, a cheap-o-meter for whole economies, and why the pull back to fair value takes years. Press play, or step through.', steps=[
    step('An identical cup of coffee, same beans, same size: it costs $3 in New York and £3 in London.',
         note('ny', 66, 20, 'New York', 'blue', 18), *_cup('c1', 32, 64, 'blue'), chip('pd', 66, 172, '$3', 'blue'),
         note('ld', 528, 20, 'London', 'purple', 18), *_cup('c2', 486, 64, 'purple'), chip('pp', 528, 172, '£3', 'purple')),
    step('The exchange rate is 1.50: one pound buys $1.50. Convert the London coffee into dollars: £3 × 1.50 = $4.50. That is 50% more than New York\'s, for the very same coffee.',
         chip('rate', 300, 28, 'GBP/USD = 1.50', 'amber'),
         icon('gbp', 'coin', 468, 104, 0.42, 'purple', sym='£'),
         box('conv', 150, 58, 300, 64, 'London coffee in dollars', 'purple', sub='$3.00', size=18),
         move('gbp', 278, 66, 1000), dict(hide='gbp'),
         dict(count='conv', **{'from': 3.0, 'to': 4.5, 'dp': 2, 'pre': '£3 × 1.50 = $', 'ms': 1000})),
    step('That is the Law of One Price: strip out transport costs, tariffs and taxes, and an identical, tradeable good should cost the same everywhere in one currency. If not, someone buys where it is cheap and sells where it is dear until the gap closes.',
         arrow('pd', 'pp', 'buy cheap → sell dear', 'green', bend=42)),
    step('Absolute PPP asks what exchange rate would make it fair: the price ratio, $3 ÷ £3 = 1.00. The market says 1.50, so on this one coffee the pound looks 50% expensive.',
         box('imp', 150, 130, 300, 64, 'PPP rate: $3 ÷ £3 = 1.00', 'green', sub='market: 1.50', size=18),
         dict(pulse='rate')),
    step('Scale it up from one coffee to a whole basket, like a CPI basket. It rarely holds exactly: baskets differ between countries, and rent and haircuts can\'t be shipped across a border to close a price gap.',
         icon('rent', 'house', 34, 250, 0.6, 'amber', 'rent', lsize=17),
         icon('hair', 'person', 150, 250, 0.6, 'amber', 'haircut', lsize=17),
         dict(cross='rent'), dict(cross='hair'),
         note('ship', 140, 360, 'can\'t be shipped', 'red', 18)),
    step('The Big Mac Index is the famous shortcut: $5.50 in the US against the equivalent of $3.20 elsewhere makes that currency about 42% cheap. A memorable illustration, not a model: one good, with local rent and wages baked in.',
         chart('bm', (300, 240, 290, 168), 'A Big Mac, in dollars', [0.4, 2.6], [0, 8], [[0, '$0']],
               [[1, 'US'], [2, 'elsewhere']], pl=44, pr=12),
         dict(bars='bmb', chart='bm', bw=58, ms=1000, data=[[1, 5.5, '$5.50', 'blue'], [2, 3.2, '$3.20', 'amber']]),
         cnote('bmc', 'bm', [2, 5.6], '≈ 42% cheap', 'amber', 18)),
    step('Relative PPP is the version that survives real data. If prices rise 8% a year at home and 2% abroad, the home currency should lose roughly the 6-point gap each year, so neither side gets steadily cheaper.',
         icon('th1', 'thermo', 30, 418, 0.5, 'red', 'home 8%', lsize=17),
         icon('th2', 'thermo', 140, 418, 0.5, 'blue', 'abroad 2%', lsize=17),
         box('rel', 290, 426, 300, 72, 'home currency falls', 'green', sub='≈ 8% − 2% = 6% a year', size=18),
         arrow('th2', 'rel', tone='green')),
    step('The real exchange rate turns this into a cheap-o-meter: the currency\'s value after adjusting for both price levels. If PPP held exactly it would never move. In practice it wanders above or below fair value for years (illustrative path).',
         chart('rx', RC, 'Real exchange rate (illustrative)', [0, 24], [-25, 36],
               [[20, '+20%'], [0, '0'], [-20, '−20%']], [[0, 'yr 0'], [10, '10'], [20, '20'], [24, '24']], pl=56, pr=16),
         series('fv', 'rx', [[0, 0], [24, 0]], None, dash=True, label='PPP fair value', lat=[24, 0], ldx=-2, ldy=14, lanchor='end', ms=500),
         series('rr', 'rx', RFX, 'purple', ms=1800),
         cnote('uv', 'rx', [7.2, 31], 'undervalued: ~10 years', 'purple', 17, anchor='start'),
         cnote('ov', 'rx', [13, -21], 'overvalued: ~6 years', 'purple', 17, anchor='start')),
    step('It does drift back, but slowly. Rogoff\'s "PPP puzzle": a deviation takes roughly three to five years to shrink by half. Here a 26% gap takes four years to become 13%.',
         dot('h1', 'rx', [5, 26], '26%', 'green', dy=-14),
         dot('h2', 'rx', [9, 13], '13%: half gone', 'green', dx=10, dy=-6, anchor='start')),
    step('The trap: "20% undervalued" is not a buy signal. Nothing stops a cheap currency getting cheaper first. Buy at the first dot and you sit through years of a wider gap before it narrows.',
         dot('w1', 'rx', [2, 20], '20%: buy?', 'red', dx=10, dy=18, anchor='start'),
         dict(pulse='rr')),
    step('It actually happened. In 2022–24 the yen was deeply cheap on PPP, and US inflation (peaking at 9.1%) ran far above Japan\'s, so relative PPP said the yen should rise. It fell: USD/JPY went from about 115 to near 152 that October, and past 160 in 2024.',
         chart('jp', JC, 'USD/JPY (approx.)', [2021.85, 2024.75], [105, 172],
               [[110, '110'], [130, '130'], [150, '150'], [170, '170']],
               [[2022, '2022'], [2023, '2023'], [2024, '2024']], pl=46, pr=14),
         series('jy', 'jp', [[2022.0, 115], [2022.8, 152], [2024.5, 161]], 'red', ms=1300),
         dot('j1', 'jp', [2022.0, 115], '~115', 'red', dx=8, dy=4, anchor='start'),
         dot('j2', 'jp', [2022.8, 152], '~152', 'red', dy=-14),
         dot('j3', 'jp', [2024.5, 161], '160+', 'red', dx=-8, dy=-14, anchor='end')),
    step('What won: the interest-rate gap, not the price gap. The Fed went from near zero to 5.25–5.50%; the Bank of Japan stayed at −0.1% until March 2024. Money chased the yield out of yen. Japan\'s yen-buying in 2022 and 2024 slowed the fall but did not reverse it.',
         icon('fed', 'bank', 392, 744, 0.5, 'green', 'Fed\n5.25–5.50%', sym='$', lsize=16),
         icon('boj', 'bank', 502, 744, 0.5, 'red', 'BoJ\n−0.1%', sym='¥', lsize=16),
         icon('flow', 'cash', 512, 834, 0.42, 'amber', sym='¥'),
         move('flow', 400, 834, 1300)),
    step('So PPP is a real long-run anchor and a hopeless short-run clock. For a multi-year decision, like a treasurer hedging a five-year liability, it is a genuine input. For a trade measured in weeks, it says almost nothing.',
         chip('anc', 480, 900, 'an anchor, not a clock', 'green'),
         dict(pulse='fv')),
])


BOARD = dict(name='ppp', lesson='purchasing-power-parity', title='PPP: one coffee, two prices, and a very slow pull', cfg=PPP,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=12)
