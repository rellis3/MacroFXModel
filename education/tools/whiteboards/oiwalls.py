from ._wb import *

# ── Open-interest walls and max pain (open-interest-walls-max-pain) ────────────
# The lesson's own illustrative seven-strike chain (spot near 255):
#   strike 235 240 245 250 255 260 265 / calls 800 1200 2000 2400 2200 7800 1400
#   puts 2000 6500 2600 2300 2200 1600 900.
# Call wall 260: 7,800 vs 2,200 at 255 = 3.5x (past the lesson's "3x+ = strong" bar);
# put wall 240: 6,500 vs 2,600 at 245 = 2.5x ("moderate-to-strong").
# TotalPain(S) = sum call OI x max(0, S-k) + sum put OI x max(0, k-S), recomputed below and
# checked against the lesson's table (204,000 ... 191,000); minimum at 250 = max pain.
# Scenario: the 240 put wall bounces price on day one, is ~5,100 by day two, breaks on day
# three. GameStop, January 2021: under $20 to an intraday $483 on 28 January; whether dealer
# hedging (a "gamma squeeze") drove it is contested (SEC staff report, October 2021).
# Caveat kept as the lesson states it: tests of max pain as a magnet have not supported it.
K = [235, 240, 245, 250, 255, 260, 265]
CALL = [800, 1200, 2000, 2400, 2200, 7800, 1400]
PUT = [2000, 6500, 2600, 2300, 2200, 1600, 900]
def pain(S):
    c = sum(o * max(0, S - k) for k, o in zip(K, CALL)); p = sum(o * max(0, k - S) for k, o in zip(K, PUT))
    return c, p
PAIN = [sum(pain(S)) for S in K]
assert PAIN == [204000, 127500, 89500, 74500, 83000, 113500, 191000], PAIN
assert pain(250) == (34000, 40500)
assert round(7800 / 2200, 1) == 3.5 and 6500 / 2600 == 2.5

OI = (10, 128, 580, 322)
PC = (10, 462, 580, 214)
def px(t): return round(OI[0] + 56 + (t - 231) / 38 * (OI[2] - 70), 1)   # strike → board x (pl 56, pr 14)
SPOT_Y = 226
def _k(v): return f'{v:,}'

OIW = dict(w=600, h=900, intro='Read an options chain as a map: where the walls are, where max pain is, and how much (or how little) either one moves price. The lesson\'s own seven-strike chain.', steps=[
    step('Every option has two sides: a buyer, and a writer who is short it, often a dealer who hedges. Open interest is how many contracts are still outstanding at each strike.',
         icon('buy', 'crowd', 34, 6, 0.6, 'blue', 'option buyers', lsize=17),
         icon('dlr', 'bank', 484, 6, 0.6, 'amber', 'writers / dealers', sym='$', lsize=17),
         icon('opt', 'scroll', 400, 18, 0.4, 'purple'),
         move('opt', 160, 18, 1200)),
    step('Here is a chain (illustrative numbers from the lesson), with the instrument trading near 255. Call open interest stacks up above the line.',
         chart('oi', OI, 'Open interest by strike: calls up, puts down', [231, 269], [-8800, 10200],
               [[8000, '8k'], [4000, '4k'], [0, '0'], [-4000, '4k'], [-8000, '8k']],
               [[k, str(k)] for k in K], pl=56, pr=14, zero=True),
         dict(bars='cb', chart='oi', bw=34, ms=1100, data=[[k, o, _k(o), 'blue'] for k, o in zip(K, CALL) if k != 260]),
         dict(bars='cw', chart='oi', bw=34, ms=1100, data=[[260, 7800, '7,800', 'blue']]),
         chip('spot', px(255), SPOT_Y, 'spot', 'amber')),
    step('Put open interest hangs below it.',
         dict(bars='pb', chart='oi', bw=34, ms=1100, data=[[k, -o, _k(o), 'red'] for k, o in zip(K, PUT) if k != 240]),
         dict(bars='pw', chart='oi', bw=34, ms=1100, data=[[240, -6500, '6,500', 'red']]),
         ),
    step('A wall is an outlier, not just a big number. The 260 strike carries 7,800 calls against 2,200 next door: 3.5 times, past the lesson\'s 3× bar for a strong wall. That is the call wall.',
         dict(pulse='cw'),
         cnote('cwl', 'oi', [262.4, 7000], 'call wall', 'blue', 18, anchor='start')),
    step('Below spot, 240 has 6,500 puts against 2,600 next door: 2.5 times, a moderate-to-strong put wall.',
         dict(pulse='pw'),
         cnote('pwl', 'oi', [242.4, -6000], 'put wall', 'red', 18, anchor='start')),
    step('The usual read, from the dealer-hedging mechanism of the previous lesson: hedging around the walls leans against moves toward them, so they get read as resistance and support, a rough 240–260 range. A read of one snapshot, valid only while that open interest stays.',
         move('spot', px(259), SPOT_Y, 700), move('spot', px(243), SPOT_Y, 1100), move('spot', px(255), SPOT_Y, 800)),
    step('Max pain is a different idea. At expiry, writers owe the intrinsic value of every option that finishes in the money: calls struck below the settlement price, puts struck above it. Out-of-the-money options cost them nothing.',
         icon('pay', 'cash', 470, 70, 0.4, 'green', sym='$'),
         move('pay', 150, 70, 1300)),
    step('Try settling at 250. Calls at 235, 240 and 245 pay 34,000; puts at 255, 260 and 265 pay 40,500. Total pain: 74,500.',
         box('calc', 10, 686, 580, 84, 'settle at 250: calls 34,000 + puts 40,500', 'green', sub='0', size=19),
         dict(count='calc', **{'from': 0, 'to': 74500, 'dp': 0, 'pre': 'total pain = ', 'ms': 1200})),
    step('Do the same at every strike. Total pain bottoms out at 250, and that is max pain: the price where writers, as a group, pay the least. It is neither wall, because it is a whole-chain minimum, not one strike\'s pile.',
         chart('pc', PC, 'Total pain if it settles at… (thousands)', [231, 269], [0, 235],
               [[0, '0'], [100, '100'], [200, '200']], [[k, str(k)] for k in K], pl=56, pr=14),
         dict(bars='pn', chart='pc', bw=34, ms=1300, data=[[k, v / 1000, f'{v / 1000:g}', 'green' if k == 250 else 'purple'] for k, v in zip(K, PAIN)]),
         series('mp', 'oi', [[250, -8800], [250, -3700]], 'green', dash=True, label='max pain 250', lat=[250, -7600], ldx=8, ldy=0, lanchor='start', ms=400),
         series('mp2', 'oi', [[250, 3700], [250, 10200]], 'green', dash=True, ms=400)),
    step('The folk claim: price drifts from 255 down to 250 into expiry. The logic is real (it is the outcome writers like best), but tests of max pain as a magnet have not supported it. Treat it as a description of this snapshot, not a forecast.',
         move('spot', px(250), SPOT_Y, 1200),
         cnote('nf', 'oi', [249, 8800], 'claimed pull:\nnot found in tests', 'red', 17, anchor='end', dx=-6),
         move('spot', px(255), SPOT_Y, 900)),
    step('Keep two mechanisms apart. Dealer hedging is continuous and mechanical, at any time. Max pain is a payout argument about one moment, settlement. They can point the same way; conflating them breeds overconfidence.',
         box('m1', 10, 782, 285, 108, 'dealer hedging', 'blue', sub='continuous, mechanical', size=19),
         box('m2', 305, 782, 285, 108, 'max pain', 'green', sub='a payout at expiry', size=19)),
    step('And a wall is a live snapshot. Day one, price bounces off the 240 put wall. Day two, profit-taking has thinned it to about 5,100. Day three, the retest finds too little left to defend it, and the level gives way. The strike never changed; the open interest did.',
         move('spot', px(242), SPOT_Y, 900), move('spot', px(249), SPOT_Y, 700),
         dict(hide='pw'), dict(bars='pw2', chart='oi', bw=34, ms=900, data=[[240, -5100, '~5,100', 'red']]),
         move('spot', px(236), SPOT_Y, 1200)),
    step('Walls can fail the other way too. GameStop, January 2021: call walls were overrun and rebuilt higher within days, and the stock went from under $20 to an intraday $483 on 28 January. Whether dealer hedging of those calls drove it is contested, not settled.',
         dict(hide='calc'),
         box('gme', 10, 686, 580, 84, 'GameStop, Jan 2021: under $20 → $483', 'red', sub='"gamma squeeze"? contested', size=19),
         icon('rk', 'rocket', 270, 4, 0.62, 'red')),
])


BOARD = dict(name='oiwalls', lesson='open-interest-walls-max-pain', title='Open-interest walls and max pain, read as a map', cfg=OIW,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=11)
