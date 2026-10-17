from ._wb import *

# ── From words to a score, and the Twitter-mood search (nlp-trading-signals-sentiment) ──
# Embedding positions copy eight words of the lesson's own illustrative scatter (not fitted to any corpus),
# rescaled to 0-10. Scores are the lesson's conceptual worked example (+0.10, +0.55, +0.35).
# Episode facts are the lesson's: Bollen, Mao & Zeng, 9.8 million tweets from 2008, one positive/
# negative series and six moods, "Calm" at a lag of a few days, 87.6% on a few weeks of December
# 2008 test days; a London fund launched in 2011 closed within about a year; Lachanski & Pav (2017)
# could not reproduce it.
_DOV = [('dovish', 140, 90), ('ease', 110, 130), ('cut', 165, 150), ('stimulus', 95, 190)]
_HAW = [('hawkish', 480, 95), ('tighten', 510, 135), ('raise', 455, 155), ('inflation risk', 500, 190)]
def _xy(cx, cy): return [round((cx - 20) / 60, 2), round((275 - cy) / 25.5, 2)]

WORDS = [('w1', 95, 'committee'), ('w2', 235, 'attentive'), ('w3', 375, 'inflation'), ('w4', 505, 'risks')]

NLP = dict(w=600, h=770, intro='How a model turns a Fed sentence into a number, step by step, and then the famous time a text score fooled everyone. Press play, or step through.', steps=[
    step('Start with a sentence an analyst reads by eye: a classic hedge phrase that reads hawkish. The job is to turn it into a number a system can use.',
         note('sent', 300, 24, '“the committee remains highly attentive to inflation risks”', 'purple', 17)),
    step('The crude way counts words. Each word is just a 1 in one slot of a huge list: "inflation" is no closer to "risks" than to "coffee". No meaning at all.',
         *[chip(i, x, 66, t, None) for i, x, t in WORDS]),
    step('Word2Vec (2013) learns a short vector for each word from the company it keeps. Words used in similar contexts land close together: a hawkish neighborhood and a dovish one. (Illustrative positions.)',
         chart('emb', (10, 100, 330, 250), 'Word vectors (illustrative)', [0, 10], [0, 10], [], [], pl=16, pb=14),
         *[dot('d' + str(i), 'emb', _xy(x, y), w, 'blue', dx=8, dy=-10, anchor='start', size=15) for i, (w, x, y) in enumerate(_DOV)],
         *[dot('h' + str(i), 'emb', _xy(x, y), w, 'red', dx=-8, dy=-10, anchor='end', size=15) for i, (w, x, y) in enumerate(_HAW)]),
    step('The catch: Word2Vec gives every word one fixed vector. "Hold" in "the Fed will hold rates" gets exactly the same vector as "hold" in "hold my coffee".',
         box('fixed', 360, 100, 230, 110, 'one vector per word:\n“hold rates” =\n“hold my coffee”', 'red', size=18)),
    step('BERT (2019) reads the whole sentence at once, in both directions, using attention. Each word\'s vector is built from every other word around it, so "hold" means what its sentence says.',
         arrow('w1', 'w4', bend=-26, tone='green', id='fw'), arrow('w4', 'w2', bend=-16, tone='green', id='bw'),
         box('bert', 360, 228, 230, 122, 'BERT reads both ways:\neach word gets\nits context', 'green', size=18)),
    step('FinBERT (2019) is BERT trained further on financial text, so "attentive to inflation risks" reads as the loaded phrase it is. Out comes a hawkish score. Across three statements (illustrative): +0.10, +0.55, +0.35.',
         chart('sc', (10, 372, 330, 222), 'Hawkish score by meeting', [0.4, 3.6], [0, 0.75], [[0, '0'], [0.5, '+0.5']], [[1, 't−2'], [2, 't−1'], [3, 't']], pl=44),
         dict(bars='scb', chart='sc', data=[[1, 0.10, '+0.10', 'amber'], [2, 0.55, '+0.55', 'red'], [3, 0.35, '+0.35', 'amber']], bw=46, ms=1100)),
    step('One reading is noisy: sarcasm, negation and hedges trip models up, and 0.55 is not a 55% chance of anything. The trend across meetings carries the information: a hawkish jump, then a partial, data-dependent retreat.',
         series('tr', 'sc', [[1, 0.10], [2, 0.55], [3, 0.35]], 'purple', dash=True, ms=800)),
    step('Now the famous case. Bollen, Mao and Zeng took about 9.8 million tweets from 2008 and turned each day\'s text into seven series: one positive/negative score and six "moods".',
         box('tw', 360, 372, 230, 92, '9.8 million tweets\n→ 7 daily series', 'blue', size=19)),
    step('Positive/negative did not predict the Dow. But one mood of six, "Calm", seemed to lead it by a few days, and called the daily direction with 87.6% accuracy, on a test of a few weeks in December 2008.',
         box('calm', 360, 478, 230, 116, '1 mood of 6, “Calm”,\nat a few days\' lag:\n87.6% on a few weeks', 'amber', size=18)),
    step('Many series, several lags, a test window of weeks: many chances to find something by luck. A fund launched in 2011 to trade it closed within about a year. A 2017 replication could not recover the result.',
         box('fail', 10, 610, 580, 62, 'fund closed within about a year · 2017 replication: no result', 'red', size=19),
         dict(cross='calm')),
    step('The lesson in one board: turning text into a number always works. Whether that number predicts anything is a separate claim, and only an out-of-sample test can settle it.',
         note('end', 300, 704, 'Text → number: always works.\nNumber → edge: test it out of sample.', 'green', 19)),
])


BOARD = dict(name='nlp_trading_signals_sentiment', lesson='nlp-trading-signals-sentiment',
             title='From a Fed sentence to a score, and the tweet that fooled everyone', cfg=NLP,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=13)
