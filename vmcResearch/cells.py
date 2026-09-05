"""cells.py - the state definitions, one function per section of the brief.

Each function returns {label: boolean mask}. Nothing here computes an outcome
or a statistic; scoring is `stats.Scorer`'s job, so a state can be re-scored
against a different outcome without redefining it.

A NOTE ON WHAT A "BULLISH STATE" IS
-----------------------------------
Every cell below is defined so its label states the direction it implies. That
matters because the scan evaluates cells against a SIGNED outcome: a cell
labelled bullish must produce a positive forward return to count, and a
bullish cell that reliably produces a negative one is a real finding (the
signal is inverted), not a null. Averaging bullish and bearish cells into one
"is VuManChu informative" number would hide exactly that.
"""
from __future__ import annotations

import numpy as np

TFS = (5, 15, 60, 240)
OB1, OB2, OS1, OS2 = 53.0, 60.0, -53.0, -60.0


def _g(p, tf, name):
    return p['tf%d_%s' % (tf, name)].to_numpy(float)


def tf_bull(p, tf):
    """Per-timeframe trichotomy: +1 bullish, -1 bearish, 0 mixed.

    Bullish = WT above zero AND WT1 above WT2 (level and cross agree). The
    'mixed' bucket is kept rather than forced to a side; a disagreement between
    level and cross is a real state and collapsing it would erase the very
    conflicts the MTF section is about.
    """
    wt1, sp = _g(p, tf, 'wt1'), _g(p, tf, 'wt_spread')
    out = np.zeros(len(p), dtype=np.int8)
    out[(wt1 > 0) & (sp > 0)] = 1
    out[(wt1 < 0) & (sp < 0)] = -1
    return out


# -- section 2: WaveTrend shape and trajectory -------------------------------

SHAPE_NAMES = {3: 'rising_sharply', 2: 'rising_slowly', 1: 'recovering_from_OS',
               0: 'flat', -1: 'rejecting_from_OB', -2: 'falling_slowly',
               -3: 'falling_sharply', -4: 'rolling_over', 4: 'accelerating_up'}


def wavetrend(p, tf):
    wt1, sp = _g(p, tf, 'wt1'), _g(p, tf, 'wt_spread')
    shape = _g(p, tf, 'wt_shape')
    since = _g(p, tf, 'bars_since_cross')
    cdir = _g(p, tf, 'last_cross_dir')
    czero = _g(p, tf, 'cross_above_zero')
    c = {}
    for code, name in SHAPE_NAMES.items():
        c['tf%d/shape=%s' % (tf, name)] = shape == code
    c['tf%d/zone=OB2' % tf] = wt1 >= OB2
    c['tf%d/zone=OB1' % tf] = (wt1 >= OB1) & (wt1 < OB2)
    c['tf%d/zone=above0' % tf] = (wt1 > 0) & (wt1 < OB1)
    c['tf%d/zone=below0' % tf] = (wt1 < 0) & (wt1 > OS1)
    c['tf%d/zone=OS1' % tf] = (wt1 <= OS1) & (wt1 > OS2)
    c['tf%d/zone=OS2' % tf] = wt1 <= OS2
    # Crosses, split by which side of zero they happened on - the brief asks
    # for this split explicitly and it is the one that changes the read.
    fresh = since <= 1
    c['tf%d/cross=bull_fresh' % tf] = fresh & (cdir > 0)
    c['tf%d/cross=bear_fresh' % tf] = fresh & (cdir < 0)
    c['tf%d/cross=bull_below0' % tf] = fresh & (cdir > 0) & (czero < 0)
    c['tf%d/cross=bull_above0' % tf] = fresh & (cdir > 0) & (czero > 0)
    c['tf%d/cross=bear_above0' % tf] = fresh & (cdir < 0) & (czero > 0)
    c['tf%d/cross=bear_below0' % tf] = fresh & (cdir < 0) & (czero < 0)
    c['tf%d/cross=bull_from_OS' % tf] = fresh & (cdir > 0) & (wt1 <= OS1)
    c['tf%d/cross=bear_from_OB' % tf] = fresh & (cdir < 0) & (wt1 >= OB1)
    c['tf%d/cross=bull_aged' % tf] = (since > 3) & (since <= 12) & (cdir > 0)
    c['tf%d/cross=bear_aged' % tf] = (since > 3) & (since <= 12) & (cdir < 0)
    # Spread expansion vs contraction - momentum expanding or exhausting.
    ssl = _g(p, tf, 'spread_slope')
    c['tf%d/spread=expanding_bull' % tf] = (sp > 0) & (ssl > 0)
    c['tf%d/spread=contracting_bull' % tf] = (sp > 0) & (ssl < 0)
    c['tf%d/spread=expanding_bear' % tf] = (sp < 0) & (ssl < 0)
    c['tf%d/spread=contracting_bear' % tf] = (sp < 0) & (ssl > 0)
    return c


# -- section 4: Money Flow ---------------------------------------------------

def money_flow(p, tf):
    mf, sl = _g(p, tf, 'mf'), _g(p, tf, 'mf_slope')
    ac, run = _g(p, tf, 'mf_accel'), _g(p, tf, 'mf_run')
    c = {}
    c['tf%d/mf=pos_rising' % tf] = (mf > 0) & (sl > 0)
    c['tf%d/mf=pos_falling' % tf] = (mf > 0) & (sl < 0)
    c['tf%d/mf=neg_rising' % tf] = (mf < 0) & (sl > 0)
    c['tf%d/mf=neg_falling' % tf] = (mf < 0) & (sl < 0)
    c['tf%d/mf=pos_accel' % tf] = (mf > 0) & (sl > 0) & (ac > 0)
    c['tf%d/mf=neg_accel' % tf] = (mf < 0) & (sl < 0) & (ac < 0)
    c['tf%d/mf=persistent_pos' % tf] = (mf > 0) & (run > 20)
    c['tf%d/mf=persistent_neg' % tf] = (mf < 0) & (run > 20)
    c['tf%d/mf=just_turned_pos' % tf] = (mf > 0) & (run <= 2)
    c['tf%d/mf=just_turned_neg' % tf] = (mf < 0) & (run <= 2)
    return c


def price_vs_mf(p, tf):
    """The four quadrants the brief names, with price direction taken from the
    prevailing leg rather than the last candle."""
    mf, sl = _g(p, tf, 'mf'), _g(p, tf, 'mf_slope')
    up = p['trend_dir'].to_numpy() > 0
    dn = p['trend_dir'].to_numpy() < 0
    return {
        'tf%d/quad=price_up_mf_up' % tf: up & (sl > 0),
        'tf%d/quad=price_up_mf_dn' % tf: up & (sl < 0),
        'tf%d/quad=price_dn_mf_up' % tf: dn & (sl > 0),
        'tf%d/quad=price_dn_mf_dn' % tf: dn & (sl < 0),
        'tf%d/quad=price_up_mf_neg' % tf: up & (mf < 0),
        'tf%d/quad=price_dn_mf_pos' % tf: dn & (mf > 0),
    }


# -- section 5: divergence ---------------------------------------------------

def divergence(p, tf):
    reg, hid = _g(p, tf, 'div_regular'), _g(p, tf, 'div_hidden')
    return {
        'tf%d/div=reg_bull' % tf: reg > 0,
        'tf%d/div=reg_bear' % tf: reg < 0,
        'tf%d/div=hid_bull' % tf: hid > 0,
        'tf%d/div=hid_bear' % tf: hid < 0,
    }


def divergence_context(p, tf):
    """The brief's real divergence question: not 'does it work' but 'when'."""
    reg = _g(p, tf, 'div_regular')
    mf = _g(p, tf, 'mf')
    vw = _g(p, tf, 'vwap_dist')
    slow = p['trend_dir_slow'].to_numpy()
    ph = p['phase'].to_numpy()
    c = {}
    for nm, m in (('bull', reg > 0), ('bear', reg < 0)):
        sgn = 1 if nm == 'bull' else -1
        c['tf%d/divctx=%s_HTFwith' % (tf, nm)] = m & (slow == sgn)
        c['tf%d/divctx=%s_HTFagainst' % (tf, nm)] = m & (slow == -sgn)
        c['tf%d/divctx=%s_mf_confirms' % (tf, nm)] = m & (np.sign(mf) == sgn)
        c['tf%d/divctx=%s_mf_denies' % (tf, nm)] = m & (np.sign(mf) == -sgn)
        c['tf%d/divctx=%s_extended_vwap' % (tf, nm)] = m & (np.abs(vw) > 2.0)
        c['tf%d/divctx=%s_near_vwap' % (tf, nm)] = m & (np.abs(vw) < 0.5)
        c['tf%d/divctx=%s_in_impulse' % (tf, nm)] = m & (ph == 1)
        c['tf%d/divctx=%s_in_pullback' % (tf, nm)] = m & (ph == 2)
        c['tf%d/divctx=%s_in_range' % (tf, nm)] = m & (ph == 0)
    return c


# -- sections 6/7: multi-timeframe alignment ---------------------------------

def mtf_alignment(p):
    b = {tf: tf_bull(p, tf) for tf in TFS}
    htf, h1, m15, m5 = b[240], b[60], b[15], b[5]
    c = {
        'mtf=full_bull': (htf > 0) & (h1 > 0) & (m15 > 0) & (m5 > 0),
        'mtf=full_bear': (htf < 0) & (h1 < 0) & (m15 < 0) & (m5 < 0),
        'mtf=HTFbull_LTFbear': (htf > 0) & (h1 > 0) & (m5 < 0),
        'mtf=HTFbear_LTFbull': (htf < 0) & (h1 < 0) & (m5 > 0),
        'mtf=HTFbull_LTFrealign': (htf > 0) & (h1 > 0) & (m15 < 0) & (m5 > 0),
        'mtf=HTFbear_LTFrealign': (htf < 0) & (h1 < 0) & (m15 > 0) & (m5 < 0),
        'mtf=conflict_HTF': (htf > 0) & (h1 < 0),
        'mtf=conflict_HTF_bear': (htf < 0) & (h1 > 0),
        'mtf=all_mixed': (htf == 0) & (h1 == 0) & (m15 == 0),
    }
    # Count of timeframes agreeing bullish / bearish - a dose-response check.
    # If MTF confluence is real, 4-of-4 must beat 3-of-4 must beat 2-of-4.
    nb = (htf > 0).astype(int) + (h1 > 0).astype(int) + (m15 > 0).astype(int) + (m5 > 0).astype(int)
    ns = (htf < 0).astype(int) + (h1 < 0).astype(int) + (m15 < 0).astype(int) + (m5 < 0).astype(int)
    for k in range(5):
        c['mtf=bull_count_%d' % k] = nb == k
        c['mtf=bear_count_%d' % k] = ns == k
    return c


# -- section 8/16: pullback and re-alignment sequences -----------------------

def pullback_sequence(p, tf_fast=5, tf_slow=60):
    """The brief's hypothesised pullback sequence, decomposed into its stages.

    Each stage is a strictly narrower state than the last, so the scan shows
    whether each added condition BUYS anything or merely shrinks the sample.
    That is the only way to tell a real confluence stack from a story.
    """
    ph = p['phase'].to_numpy()
    td = p['trend_dir'].to_numpy()
    slow_bull = tf_bull(p, tf_slow)
    f_wt1 = _g(p, tf_fast, 'wt1')
    f_sp = _g(p, tf_fast, 'wt_spread')
    f_since = _g(p, tf_fast, 'bars_since_cross')
    f_cdir = _g(p, tf_fast, 'last_cross_dir')
    f_mf = _g(p, tf_fast, 'mf')
    f_mfs = _g(p, tf_fast, 'mf_slope')
    f_vw = _g(p, tf_fast, 'vwap_dist')

    in_pb_up = (ph == 2) & (td > 0)
    c = {}
    c['seq1/pullback_up'] = in_pb_up
    c['seq2/+HTF_bull'] = in_pb_up & (slow_bull > 0)
    c['seq3/+LTF_bear'] = in_pb_up & (slow_bull > 0) & (f_sp < 0)
    c['seq4/+LTF_oversold'] = in_pb_up & (slow_bull > 0) & (f_sp < 0) & (f_wt1 <= OS1)
    c['seq5/+MF_recovering'] = in_pb_up & (slow_bull > 0) & (f_wt1 <= OS1) & (f_mfs > 0)
    c['seq6/+WT_bull_cross'] = in_pb_up & (slow_bull > 0) & (f_since <= 1) & (f_cdir > 0)
    c['seq7/+cross_from_OS'] = in_pb_up & (slow_bull > 0) & (f_since <= 1) & (f_cdir > 0) & (f_wt1 <= OS1)
    c['seq8/+MF_pos_at_cross'] = in_pb_up & (slow_bull > 0) & (f_since <= 1) & (f_cdir > 0) & (f_mf > 0)
    c['seq9/full_stack'] = (in_pb_up & (slow_bull > 0) & (f_since <= 1) & (f_cdir > 0)
                            & (f_wt1 <= OS1) & (f_mfs > 0) & (f_vw < 0))
    # The failure arm the brief asks for: same setup, money flow still negative.
    c['seqX/cross_but_MF_neg'] = (in_pb_up & (slow_bull > 0) & (f_since <= 1)
                                  & (f_cdir > 0) & (f_mf < 0) & (f_mfs < 0))
    c['seqX/cross_but_HTF_bear'] = in_pb_up & (slow_bull < 0) & (f_since <= 1) & (f_cdir > 0)
    return c


# -- section 11: VWAP interaction --------------------------------------------

def vwap_interaction(p, tf):
    vw = _g(p, tf, 'vwap_dist')
    wt1 = _g(p, tf, 'wt1')
    prev = np.concatenate([[np.nan], vw[:-1]])
    c = {
        'tf%d/vwap=far_above' % tf: vw > 2.0,
        'tf%d/vwap=above' % tf: (vw > 0.5) & (vw <= 2.0),
        'tf%d/vwap=at' % tf: np.abs(vw) <= 0.5,
        'tf%d/vwap=below' % tf: (vw < -0.5) & (vw >= -2.0),
        'tf%d/vwap=far_below' % tf: vw < -2.0,
        'tf%d/vwap=reclaim_up' % tf: (vw > 0) & (prev <= 0),
        'tf%d/vwap=lost_down' % tf: (vw < 0) & (prev >= 0),
    }
    # The brief's two contrasting reads, built explicitly.
    c['tf%d/vwap=extended_OB' % tf] = (vw > 2.0) & (wt1 >= OB1)
    c['tf%d/vwap=extended_OS' % tf] = (vw < -2.0) & (wt1 <= OS1)
    c['tf%d/vwap=at_vwap_OS' % tf] = (np.abs(vw) <= 0.5) & (wt1 <= OS1)
    c['tf%d/vwap=at_vwap_OB' % tf] = (np.abs(vw) <= 0.5) & (wt1 >= OB1)
    return c


# -- section 12: momentum transitions ----------------------------------------

def momentum(p, tf):
    sp, ssl = _g(p, tf, 'wt_spread'), _g(p, tf, 'spread_slope')
    sl, ac = _g(p, tf, 'wt1_slope'), _g(p, tf, 'wt1_accel')
    mf, mfs = _g(p, tf, 'mf'), _g(p, tf, 'mf_slope')
    wt1 = _g(p, tf, 'wt1')
    td = p['trend_dir'].to_numpy()
    return {
        'tf%d/mom=expansion_bull' % tf: (sp > 0) & (ssl > 0) & (mfs > 0),
        'tf%d/mom=expansion_bear' % tf: (sp < 0) & (ssl < 0) & (mfs < 0),
        # Exhaustion: price still going, oscillator no longer confirming.
        'tf%d/mom=exhaustion_up' % tf: (td > 0) & (wt1 > 0) & (sl < 0) & (mfs < 0),
        'tf%d/mom=exhaustion_dn' % tf: (td < 0) & (wt1 < 0) & (sl > 0) & (mfs > 0),
        # Reset: LTF negative but the slower leg still up.
        'tf%d/mom=reset_up' % tf: (p['trend_dir_slow'].to_numpy() > 0) & (wt1 < 0),
        'tf%d/mom=reset_dn' % tf: (p['trend_dir_slow'].to_numpy() < 0) & (wt1 > 0),
        # Failure: trying to continue, oscillator not regaining its extreme.
        'tf%d/mom=failure_up' % tf: (td > 0) & (wt1 > 0) & (wt1 < OB1 * 0.5) & (ac < 0),
        'tf%d/mom=decel_bull' % tf: (sl > 0) & (ac < 0),
        'tf%d/mom=decel_bear' % tf: (sl < 0) & (ac > 0),
    }


def all_single_tf(p, tfs=TFS):
    c = {}
    for tf in tfs:
        c.update(wavetrend(p, tf))
        c.update(money_flow(p, tf))
        c.update(divergence(p, tf))
        c.update(vwap_interaction(p, tf))
        c.update(momentum(p, tf))
    return c
