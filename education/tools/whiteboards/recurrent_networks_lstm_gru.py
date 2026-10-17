from ._wb import *
import math

# ── Whisper down the line vs. the conveyor belt (recurrent-networks-lstm-gru) ──
# Per-step factors are the lesson's illustrative ones: 0.75 (vanilla RNN's dominant
# eigenvalue) vs 0.95 (a forget gate that stays mostly open), over 15 steps back:
# 0.75^15 ≈ 0.013, 0.95^15 ≈ 0.463. The scalar LSTM is the lesson's worked example:
# w_f = w_i = w_o = 2, w_C = 1, C0 = 0, x = 1, 0.5, −1 → C = 0.671, 0.828, 0.008.


def sig(z):
    return 1 / (1 + math.exp(-z))


C, CS = 0.0, []
for x in (1, 0.5, -1):
    g = sig(2 * x)
    C = g * C + g * math.tanh(x)
    CS.append(round(C, 3))
assert CS == [0.671, 0.828, 0.008], CS

RNN = [[k, round(0.75 ** k, 4)] for k in range(16)]
LSTM = [[k, round(0.95 ** k, 4)] for k in range(16)]
XS = [60, 150, 240, 330, 420]

RNNB = dict(w=600, h=690, intro='A network that reads returns one day at a time, and why its memory fades unless it adds instead of multiplying. Press play, or step through.', steps=[
    step('A recurrent network reads a series in order: day 1, then day 2, then day 3, carrying a running note forward. That note is the hidden state.',
         *[chip('x%d' % i, XS[i], 30, 'day %d' % (i + 1), 'blue') for i in range(5)],
         box('h', 470, 8, 120, 50, 'note h', 'purple', size=19),
         arrow('x4', 'h', None, 'purple')),
    step('At every step the same rule runs: mix the old note with the new day, squash the result, and pass it on. The same weight is used at every single step.',
         note('rule', 300, 90, 'new note = squash(weight × old note + new input)', 'purple', 19)),
    step('Training sends an error signal back through every step. Each step multiplies it by the same factor; say 0.75 (illustrative). After one step back, 0.75 is left; after two, 0.56.',
         chart('g', (10, 116, 580, 270), 'Training signal left, by steps back (illustrative)', [0, 15], [0, 1.08],
               [[0, '0'], [0.5, '0.5'], [1, '1']], [[0, '0'], [5, '5'], [10, '10'], [15, '15']], pl=40, pr=30),
         series('rnn', 'g', RNN, 'red', ms=1600)),
    step('After 15 steps back, 0.75 to the 15th power is about 0.013: barely one percent. Whatever happened on the early days can hardly teach the network anything. That is the vanishing gradient.',
         dot('r15', 'g', [15, RNN[-1][1]], '≈ 0.01', 'red', dx=-10, dy=-16, anchor='end')),
    step('If the factor were above 1, the signal would blow up instead: the exploding gradient. Clipping the gradient patches that direction; nothing so simple fixes the vanishing one.',
         note('exp', 300, 410, 'above 1: explodes (clip it) · below 1: vanishes (no easy patch)', 'amber', 17)),
    step('The LSTM adds a second memory, the cell state, like a conveyor belt. Gates take things off and put things on, but the belt carries memory forward by adding. Through one step the signal is scaled only by the forget gate.',
         box('belt', 20, 440, 560, 56, 'cell state: keep old × forget gate, add new × input gate', 'green', size=18)),
    step('If the forget gate learns to stay near 0.95, about 0.46 of the signal survives 15 steps, instead of 0.01. Same length of sequence, far longer memory.',
         series('lstm', 'g', LSTM, 'green', ms=1600),
         dot('l15', 'g', [15, LSTM[-1][1]], '≈ 0.46', 'green', dx=-10, dy=-16, anchor='end')),
    step('The gates can also throw memory away. In the worked example the cell holds 0.671, then 0.828. Then a sharp input of −1 shuts every gate to 0.119, and the memory drops to 0.008 in one step.',
         dict(hide='belt'), dict(hide='exp'),
         chart('c', (10, 410, 580, 200), 'Worked example: cell state after each input', [0.4, 3.6], [0, 1.05],
               [[0, '0'], [0.5, '0.5'], [1, '1']], [[1, 'x = 1'], [2, 'x = 0.5'], [3, 'x = −1']], pl=40),
         dict(bars='cb', chart='c', data=[[1, CS[0], '0.671', 'green'], [2, CS[1], '0.828', 'green'], [3, CS[2], '0.008', 'red']], bw=70, ms=1200)),
    step('The GRU keeps the same additive idea with two gates and no separate belt: fewer parameters, often as good, not always. Which wins is an empirical question.',
         note('gru', 300, 634, 'GRU: same additive trick, two gates, one state', 'blue', 18)),
    step('A flexible memory also fits noise. Fischer and Krauss (2018) found an LSTM ranking S&P 500 stocks beat a random forest and logistic regression, but its returns faded sharply after about 2010. Beat a simple baseline out of sample before you believe one.',
         note('end', 300, 670, 'remember further back, then prove it out of sample', 'amber', 19)),
])


BOARD = dict(name='recurrent_networks_lstm_gru', lesson='recurrent-networks-lstm-gru',
             title='Why a recurrent network forgets, and how the LSTM remembers', cfg=RNNB,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
