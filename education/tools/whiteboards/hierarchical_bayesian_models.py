from ._wb import *

# ── Hierarchical Bayes: partial pooling (hierarchical-bayesian-models) ────────
# The lesson's worked example: grand mean mu = 0.70, between-group variance tau^2 = 0.25,
# sigma^2 = 1, so B_j = 0.25 / (0.25 + 1/n_j) and theta_hat = B y + (1 - B) mu.
# Five strategies (n, raw Sharpe): A (5, 2.10), E (6, 1.90), C (8, -0.60), D (40, 0.75), B (50, 0.85).
MU, TAU2 = 0.70, 0.25
S = [('A', 5, 2.10), ('E', 6, 1.90), ('C', 8, -0.60), ('D', 40, 0.75), ('B', 50, 0.85)]
def _B(n): return TAU2 / (TAU2 + 1 / n)
def _sh(n, y): return _B(n) * y + (1 - _B(n)) * MU
R = {k: (i + 1, n, y, round(_B(n), 3), round(_sh(n, y), 3)) for i, (k, n, y) in enumerate(S)}
assert R['A'][3:] == (0.556, 1.478) and R['C'][4] == -0.167 and R['B'][3:] == (0.926, 0.839)

def arrow_(k, tone):
    x, n, y, b, s = R[k]
    lab = dict(dx=14, dy=0, anchor='start') if k in 'AEC' else dict(dx=0, dy=26, anchor='middle')
    return [series('a' + k, 'sh', [[x, y], [x, s]], tone, ms=700, width=2.4),
            dot('s' + k, 'sh', [x, s], f'{_sh(n, y):.2f}' if k in 'AEC' else f'→ {_sh(n, y):.2f}', 'blue', **lab)]
def _rl(k): return dict(dx=-14, dy=0, anchor='end') if k in 'AEC' else dict(dx=0, dy=-20, anchor='middle')

HB = dict(w=600, h=770, intro="Five strategies with very different track records, and one rule for how far to trust each. The lesson's own numbers. Press play, or step through.", steps=[
    step('Five strategies, five raw Sharpe ratios, each from its own trades alone. A shows 2.10, but on only 5 trades. B shows 0.85 on 50 trades.',
         chart('sh', (10, 10, 580, 330), 'Sharpe estimate, by strategy (trades)', [0.4, 5.6], [-1, 2.6],
               [[-0.5, '−0.5'], [0, '0'], [1, '1.0'], [2, '2.0']],
               [[1, 'A (5)'], [2, 'E (6)'], [3, 'C (8)'], [4, 'D (40)'], [5, 'B (50)']], pl=56, pr=16, zero=True),
         *[dot('r' + k, 'sh', [R[k][0], R[k][2]], f'{R[k][2]:.2f}', 'purple', **_rl(k)) for k in 'AECDB']),
    step('Option one, complete pooling: assume they are all the same and use one grand mean, 0.70, for everyone. It throws away the real differences that D and B have earned.',
         series('mu', 'sh', [[0.4, MU], [5.6, MU]], 'green', dash=True, ms=700, label='grand mean 0.70', lat=[0.4, MU], ldx=8, ldy=-16, lanchor='start')),
    step('Option two, no pooling: trust each raw number on its own. A\'s 2.10 from five trades is a rookie batting .750 after four at-bats. Mostly noise.',
         dict(pulse='rA'), dict(pulse='rE'), dict(pulse='rC')),
    step('Partial pooling sets a trust dial for each strategy: B = τ² ÷ (τ² + σ²/n). Here τ² = 0.25 is how much strategies truly differ and σ²/n is each one\'s own sampling noise, which shrinks as trades pile up.',
         box('dial', 10, 356, 580, 70, 'trust dial  B = τ² ÷ (τ² + σ²/n)', 'amber', size=21)),
    step('The dials: 0.556 for A on 5 trades, 0.600 for E, 0.667 for C, 0.909 for D and 0.926 for B on 50 trades. More trades, more trust in the strategy\'s own number.',
         chart('bc', (10, 440, 580, 190), 'Trust dial B, by strategy', [0.4, 5.6], [0, 1.15], [[0, '0'], [0.5, '0.5'], [1, '1']],
               [[1, 'A (5)'], [2, 'E (6)'], [3, 'C (8)'], [4, 'D (40)'], [5, 'B (50)']], pl=56, pr=16),
         dict(bars='bb', chart='bc', data=[[R[k][0], R[k][3], f'{R[k][3]:.3f}', 'amber' if R[k][3] < 0.8 else 'green'] for k in 'AECDB'], bw=56, ms=1200)),
    step('Now pull each raw number toward 0.70 by its dial. A: 0.556 × 2.10 + 0.444 × 0.70 = 1.48. Its flashy 2.10 drops hard, because five trades earn little trust.',
         *arrow_('A', 'amber')),
    step('E falls from 1.90 to 1.42. And C\'s ugly −0.60 is pulled up, to −0.17. A small sample is untrustworthy in either direction.',
         *arrow_('E', 'amber'), *arrow_('C', 'amber')),
    step('D and B barely move: 0.75 stays at 0.75 and 0.85 becomes 0.84. With 40 and 50 trades they have earned the trust, so the grand mean adds little.',
         *arrow_('D', 'green'), *arrow_('B', 'green')),
    step('The two extremes are just the ends of the dial. Set τ² to zero and every dial is 0: everyone gets 0.70. Let τ² grow without limit and every dial is 1: everyone keeps the raw number.',
         box('ends', 10, 644, 285, 116, 'τ² → 0: complete pooling\nτ² → ∞: no pooling', 'blue', size=18)),
    step('James and Stein proved that shrinking three or more estimates toward a common target lowers total squared error. But only pool groups that really belong together, and a shrunk number is still not a validated forecast.',
         box('js', 305, 644, 285, 116, 'shrink 3+ estimates →\nlower total error\nif they belong together', 'green', size=18)),
])


BOARD = dict(name='hierarchical_bayesian_models', lesson='hierarchical-bayesian-models', title='Partial pooling: pull each estimate by how little data it has', cfg=HB,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=7)
