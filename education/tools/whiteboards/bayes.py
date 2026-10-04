from ._wb import *

# ── Bayesian inference: a flag fires, how much should you believe it? (bayesian-inference)
# The lesson's worked example: a trend-day classifier that is 80% accurate both ways
# (P(E|H) = 0.80, P(E|not H) = 0.20) and a 20% base rate of trend days. As natural
# frequencies (the lesson's own tree): 1,000 days -> 200 trend / 800 reversion ->
# 160 flagged + 40 missed / 160 flagged + 640 quiet -> 160 of 320 flagged = 50%.
# Bayes factor K = 0.80 / 0.20 = 4 ("substantial", Jeffreys 3-10). A 50% prior gives an
# 80% posterior (the lesson's own aside). Sequential step: today's 50% posterior as
# tomorrow's prior, times K = 4 for a second, conditionally independent flag, gives odds
# 1:1 x 4 = 4:1 = 80% (exact arithmetic from the lesson's rule; the independence caveat
# is the lesson's pitfall about correlated signals).
def post(prior, tp=0.80, fp=0.20): return tp * prior / (tp * prior + fp * (1 - prior))
assert round(post(0.20), 4) == 0.50 and round(post(0.50), 4) == 0.80 and round(post(0.50), 4) == 0.80
assert 1000 * 0.2 * 0.8 == 160 and round(1000 * 0.8 * 0.2) == 160

M0, M1, MY = 40, 560, 196                         # the belief meter: 0% at x=40, 100% at x=560
def mx(p): return round(M0 + (M1 - M0) * p, 1)
TICKS = [0, 0.2, 0.5, 0.8, 1.0]

BAYES = dict(w=600, h=880, intro='A classifier says "trend day". How much should you believe it? The lesson\'s 1,000-day count, step by step.', steps=[
    step('You run a classifier that flags "trend day". Its report says it is 80% accurate: it fires on 80% of real trend days and stays quiet on 80% of reversion days. Today it fires. Is there an 80% chance today is a trend day?',
         icon('clf', 'megaphone', 30, 8, 0.72, 'purple', 'the classifier', lsize=17),
         note('says', 250, 40, '"trend day!"', 'purple', 24),
         note('acc', 250, 82, '"80% accurate"', None, 19),
         box('guess', 420, 28, 150, 64, '80% sure?', 'amber', size=22)),
    step('Start before it says anything. Only 20% of days in this market are trend days; most days revert. That base rate is your prior: your belief before the evidence.',
         note('mt', 20, 140, 'your belief: is today a trend day?', 'blue', 18, anchor='start'),
         dict(line='meter', points=[[M0, MY], [M1, MY]], width=3, ms=600),
         *[dict(line=f'tk{i}', points=[[mx(p), MY - 7], [mx(p), MY + 7]], width=2.4, ms=150) for i, p in enumerate(TICKS)],
         *[note(f'tl{i}', mx(p), MY + 26, f'{round(p * 100)}%', None, 16) for i, p in enumerate(TICKS)],
         chip('bel', mx(0.20), MY - 28, 'belief', 'blue')),
    step('Count it out over 1,000 days. 200 are real trend days and 800 are reversion days.',
         box('all', 210, 250, 180, 50, '1,000 days', size=21),
         box('tr', 40, 344, 200, 56, '200 trend days', 'blue', size=20),
         box('rv', 340, 344, 230, 56, '800 reversion days', 'amber', size=20),
         arrow('all', 'tr'), arrow('all', 'rv'),
         note('l1', 186, 316, '20%', None, 18, anchor='end'), note('l2', 414, 316, '80%', None, 18, anchor='start')),
    step('The classifier fires on 80% of the real trend days: 160 flagged correctly. It misses the other 40.',
         box('tf', 10, 456, 130, 60, '160 flagged', 'green', size=20),
         box('tm', 160, 456, 104, 60, '40 missed', None, size=18),
         arrow('tr', 'tf'), arrow('tr', 'tm'),
         note('l3', 84, 428, '80%', None, 18, anchor='end')),
    step('Now the part people forget. It also fires on 20% of the 800 reversion days: another 160 flags, all false alarms. 640 reversion days stay quiet.',
         box('rf', 296, 456, 130, 60, '160 flagged', 'red', size=20),
         box('rq', 446, 456, 144, 60, '640 quiet', None, size=18),
         arrow('rv', 'rf'), arrow('rv', 'rq'),
         note('l4', 372, 428, '20%', None, 18, anchor='end')),
    step('Today the flag fired, so today is one of the flagged days. Rule out the rest. The flagged pile holds 160 real trend days and 160 false alarms: the same size.',
         dict(cross='tm'), dict(cross='rq'),
         box('pile', 110, 568, 380, 100, 'the flag fired: 320 days', top=True, size=20),
         chip('c1', 75, 532, '160 real', 'green'), chip('c2', 361, 532, '160 false', 'red'),
         move('c1', 220, 640, 1000), move('c2', 380, 640, 1000)),
    step('So the chance today is really a trend day is 160 out of 320: 50%, a coin flip. Not 80%. Your belief moves from 20% to 50%.',
         box('post', 150, 694, 300, 70, '160 ÷ 320', 'blue', sub='0%', size=20),
         dict(count='post', **{'from': 0, 'to': 50, 'dp': 0, 'suf': '%', 'ms': 1100}),
         chip('pr', mx(0.20), MY - 28, 'prior', 'purple'), dict(dim='pr'),
         move('bel', mx(0.50), MY - 28, 1100),
         dict(cross='guess')),
    step('How much was the flag worth on its own? The Bayes factor: 0.80 ÷ 0.20 = 4. A flag is 4 times likelier on a trend day than a reversion day. Prior odds 1 to 4, times 4, gives even odds. "Substantial" evidence on Jeffreys\' scale: real, not decisive.',
         box('bf', 20, 784, 560, 86, 'Bayes factor K = 0.80 ÷ 0.20 = 4', 'purple', sub='odds 1 : 4  × 4  →  1 : 1  =  50%', size=20)),
    step('The prior did the damage, not the classifier. If trend days were 50% of days instead, the same flag would take you to 80%. The rarer the thing, the further the answer falls below the quoted accuracy.',
         *[dict(hide=k) for k in ('all', 'tr', 'rv', 'tf', 'tm', 'rf', 'rq', 'pile', 'c1', 'c2',
                                  'all>tr', 'all>rv', 'tr>tf', 'tr>tm', 'rv>rf', 'rv>rq', 'l1', 'l2', 'l3', 'l4')],
         chart('br', (20, 246, 560, 424), 'Same 80% classifier, two base rates', [0.3, 5.2], [0, 100],
               [[0, '0%'], [50, '50%'], [100, '100%']], [[1.5, 'trend days 20%'], [4, 'trend days 50%']], pl=58, pr=14),
         dict(bars='bb', chart='br', data=[[1, 20, 'prior 20%', 'purple'], [2, 50, '→ 50%', 'blue'],
                                          [3.5, 50, 'prior 50%', 'purple'], [4.5, 80, '→ 80%', 'blue']], bw=62, ms=1300)),
    step('Tomorrow, today\'s 50% posterior becomes your prior. If a second flag fires, and it is truly independent of the first, even odds times 4 gives 4 to 1: 80%. Two flags that just re-detect the same thing would be counted twice.',
         chip('p2', mx(0.50), MY - 28, 'today', 'blue'), dict(dim='p2'),
         move('bel', mx(0.80), MY - 28, 1100),
         note('sec', 580, 140, 'after a 2nd, independent flag', 'blue', 17, anchor='end')),
    step('The flag moved your belief; it did not settle it. Evidence is not the probability it implies: always ask how rare the thing was to begin with.',
         dict(pulse='post'), dict(pulse='bel')),
])


BOARD = dict(name='bayes', lesson='bayesian-inference', title='One flag, 1,000 days: where the 80% goes', cfg=BAYES,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)
