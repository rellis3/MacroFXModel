"""
Level Matrix Engine V2 — valid-extreme fib matrix → level clustering → zones.

Design (per the trader's model of how Max draws gold):

  1. VALID EXTREMES. A swing high is *invalidated the moment a later bar trades
     above it*; a swing low is invalidated when a later bar trades below it.
     What survives is the "staircase" of unbroken highs above price and
     unbroken lows below price — the anchors a trader would still have on
     the chart. (V1 kept every pivot pair in the window, so superseded legs
     spawned near-duplicate zones that inflated their own confluence score.)

  2. FIB MATRIX. Every valid low paired with every later valid high (long
     legs) and vice versa (short legs) yields a fib set. The .382 / .5 /
     .786 / .886 retracements are emitted as level LINES. The .618–.650
     golden pocket is emitted as a BAND (a zone, not a line — anything
     inside it is stronger confluence).

  3. CLUSTERING. Same-direction lines within `cluster_tolerance` of each
     other collapse into one candidate zone; overlapping golden-pocket bands
     merge and act as zone seeds. Lines near a GP band join that band's zone.

  4. SCORING. Fib evidence counts DISTINCT LEGS, once each (weighted by TF
     and by which level of the leg landed here), capped so fib evidence
     alone can't dominate. Non-fib confluences (nPOC, VWAP anchors, POC/HVN/
     VAH/VAL, daily open, prev-day H/L, session H/L, pivots, aligned
     trendlines, HTF alignment) add on top — one credit per category.

The output ZoneV2 keeps the field names downstream code needs (zone_id,
direction, gp_low/gp_high as the entry window, swing_origin, score,
composition, htf_aligned, active).
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

# ── Constants (per-TF thresholds shared with V1's tuning) ─────────────────────

MIN_ATR_MULT: dict[str, float] = {
    'D1': 2.0, 'H4': 1.8, 'H1': 1.5, 'M30': 1.2, 'M15': 1.0,
}
PIVOT_N: dict[str, int] = {
    'D1': 3, 'H4': 4, 'H1': 4, 'M30': 4, 'M15': 3,
}
PIVOT_CLUSTER_ATR = 0.25     # merge near-duplicate pivots (wick variation)
COHERENCE_ATR     = 0.4      # wick tolerance beyond origin inside a leg

# TF weight of one contributing leg
TF_WEIGHT: dict[str, float] = {'D1': 2.0, 'H4': 1.5, 'H1': 1.2, 'M30': 1.0, 'M15': 0.8}

# Which fib level of the leg landed in this cluster (deep retraces are the
# stronger reads per the Jay/Max backtests; GP handled via the band bonus)
KIND_WEIGHT: dict[str, float] = {
    'fib_886': 1.2, 'fib_786': 1.1, 'fib_500': 0.8, 'fib_382': 0.8,
    'retest':  0.9,
}

NONFIB_WEIGHTS = {
    'npoc_base':    2.0,    # + 0.1/day old, cap 3.0
    'poc':          1.5,
    'hvn':          1.2,
    'vah_val':      1.0,
    'vwap_anchor':  1.8,    # + 0.05/day old, cap 2.5
    'daily_open':   1.5,
    'prev_day_hl':  1.2,
    'session_hl':   1.0,
    'pivot':        0.8,
    'htf_aligned':  1.5,
    'trendline_2t': 1.2,
    'trendline_3t': 1.8,
    'vol_forecast': 1.2,    # σ-forecast exhaustion line (oc median/75 from open)
    'oi_magnet':    1.5,    # options wall / max-pain / HVL at the zone — a dealer-hedging
                            # magnet that strengthens a reversal here (put/call wall,
                            # max pain, high-vol/high-gamma line)
    'oi_gamma_flip': 0.8,   # gamma-flip strike — a regime BOUNDARY, not a magnet, so it
                            # earns a smaller credit and is tagged apart (per oiConfluence)
}

GP_BONUS       = 1.5    # entry window sits inside a golden pocket
FIB_SCORE_CAP  = 6.0    # max total score from fib legs alone
PROXIMITY_PIPS = 3.0    # $ tolerance when testing non-fib levels vs zone centre


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class FibLeg:
    leg_id: str
    tf: str
    direction: str        # long | short
    origin: float         # impulse start (low for long, high for short)
    end: float            # impulse end   (high for long, low for short)
    origin_time: int
    end_time: int
    size: float
    age_bars: int


@dataclass
class LevelLine:
    price: float
    kind: str             # fib_382 | fib_500 | fib_786 | fib_886 | retest
    tf: str
    direction: str
    leg_id: str


@dataclass
class GPBand:
    low: float
    high: float
    tf: str
    direction: str
    leg_id: str


@dataclass
class ZoneV2:
    zone_id: str
    direction: str            # long | short
    gp_low: float             # entry window low  (name kept for downstream compat)
    gp_high: float            # entry window high
    centre: float
    in_gp: bool               # window sits inside a golden pocket band
    legs: list[FibLeg] = field(default_factory=list)
    line_kinds: list[str] = field(default_factory=list)
    swing_origin: float = 0.0     # structural invalidation (furthest leg origin)
    swing_end: float = 0.0        # primary leg's impulse end (TP reference)
    invalidation: float = 0.0     # == swing_origin (explicit alias)
    primary: Optional[FibLeg] = None   # highest-weight contributing leg (viewer markup)
    tf: str = ''                  # dominant TF label (for journal/ML compat)
    score: float = 0.0
    htf_aligned: bool = False
    composition: list = field(default_factory=list)
    active: bool = True

    @property
    def distinct_legs(self) -> int:
        return len(self.legs)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _compute_atr(bars: list[dict], alpha: float = 0.15) -> float:
    if len(bars) < 2:
        return 10.0
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return tr


def _find_pivots(bars: list[dict], n: int) -> tuple[list[int], list[int]]:
    highs  = [b['high'] for b in bars]
    lows   = [b['low']  for b in bars]
    ph, pl = [], []
    for i in range(n, len(bars) - n):
        if highs[i] >= max(highs[i - n: i + n + 1]):
            ph.append(i)
        if lows[i] <= min(lows[i - n: i + n + 1]):
            pl.append(i)
    return ph, pl


def _cluster_pivots(indices: list[int], bars: list[dict],
                    mode: str, tol: float) -> list[int]:
    """Merge consecutive pivots within tol (same structural point, wick noise)."""
    if not indices:
        return indices
    get = (lambda i: bars[i]['high']) if mode == 'high' else (lambda i: bars[i]['low'])
    out = [indices[0]]
    for idx in indices[1:]:
        if abs(get(idx) - get(out[-1])) <= tol:
            better = (mode == 'high' and get(idx) > get(out[-1])) or \
                     (mode == 'low'  and get(idx) < get(out[-1]))
            if better:
                out[-1] = idx
        else:
            out.append(idx)
    return out


# ── Step 1: valid (unbroken) extremes ─────────────────────────────────────────

def find_valid_extremes(bars: list[dict], tf: str
                        ) -> tuple[list[int], list[int], list[int], list[int]]:
    """
    Returns (valid_high_idx, valid_low_idx, broken_high_idx, broken_low_idx).

    A pivot high is VALID while no later bar's high exceeds it; the moment a
    new high forms above it, it is invalidated (the leg gets redrawn to the
    new extreme — the trader's rule). Mirror logic for lows. Broken pivots
    are returned separately so recent breaks can seed retest levels.
    """
    n   = PIVOT_N.get(tf, 3)
    atr = _compute_atr(bars)
    ph, pl = _find_pivots(bars, n)
    tol = atr * PIVOT_CLUSTER_ATR
    ph  = _cluster_pivots(ph, bars, 'high', tol)
    pl  = _cluster_pivots(pl, bars, 'low',  tol)

    highs = [b['high'] for b in bars]
    lows  = [b['low']  for b in bars]

    valid_h, broken_h = [], []
    for i in ph:
        later_max = max(highs[i + 1:], default=float('-inf'))
        (valid_h if later_max <= highs[i] else broken_h).append(i)

    valid_l, broken_l = [], []
    for i in pl:
        later_min = min(lows[i + 1:], default=float('inf'))
        (valid_l if later_min >= lows[i] else broken_l).append(i)

    return valid_h, valid_l, broken_h, broken_l


# ── Step 2: legs + level emission ─────────────────────────────────────────────

def build_legs(bars: list[dict], tf: str,
               pip: float = 1.0, digits: int = 2) -> list[FibLeg]:
    """
    Long legs: every valid low → every LATER valid high.
    Short legs: every valid high → every LATER valid low.
    Both endpoints being unbroken is what enforces "invalidated when a new
    high/low forms" — superseded extremes never enter the matrix.

    pip / digits: instrument scale — leg ids quantise endpoints to whole pips
    and prices round to `digits`. Gold (pip=1.0, digits=2) reproduces the
    GoldV2 ids and numbers exactly.
    """
    if len(bars) < 20:
        return []

    atr      = _compute_atr(bars)
    min_size = atr * MIN_ATR_MULT.get(tf, 1.5)
    coh_tol  = atr * COHERENCE_ATR
    length   = len(bars)
    highs    = [b['high'] for b in bars]
    lows     = [b['low']  for b in bars]

    vh, vl, _, _ = find_valid_extremes(bars, tf)

    legs: list[FibLeg] = []

    for li in vl:
        lp = lows[li]
        for hi in vh:
            if hi <= li:
                continue
            hp = highs[hi]
            if hp - lp < min_size:
                continue
            if min(lows[li:hi + 1]) < lp - coh_tol:
                continue    # price reversed through the origin mid-leg
            legs.append(FibLeg(
                leg_id=f'{tf}_long_{round(lp / pip)}_{round(hp / pip)}',
                tf=tf, direction='long',
                origin=round(lp, digits), end=round(hp, digits),
                origin_time=bars[li].get('time', 0),
                end_time=bars[hi].get('time', 0),
                size=round(hp - lp, digits),
                age_bars=length - 1 - hi,
            ))

    for hi in vh:
        hp = highs[hi]
        for li in vl:
            if li <= hi:
                continue
            lp = lows[li]
            if hp - lp < min_size:
                continue
            if max(highs[hi:li + 1]) > hp + coh_tol:
                continue
            legs.append(FibLeg(
                leg_id=f'{tf}_short_{round(lp / pip)}_{round(hp / pip)}',
                tf=tf, direction='short',
                origin=round(hp, digits), end=round(lp, digits),
                origin_time=bars[hi].get('time', 0),
                end_time=bars[li].get('time', 0),
                size=round(hp - lp, digits),
                age_bars=length - 1 - li,
            ))

    return legs


_FIB_RATIOS = (('fib_382', 0.382), ('fib_500', 0.500),
               ('fib_786', 0.786), ('fib_886', 0.886))


def emit_levels(legs: list[FibLeg], current_price: float,
                digits: int = 2) -> tuple[list[LevelLine], list[GPBand]]:
    """
    Emit fib LINES (.382/.5/.786/.886) and the GOLDEN-POCKET BAND (.618–.650)
    per leg. Only levels on the retracement side of price are kept (a buy
    level above price / sell level below price is not an entry candidate).
    """
    lines: list[LevelLine] = []
    bands: list[GPBand] = []

    for leg in legs:
        r = leg.size
        if leg.direction == 'long':
            hi = leg.end
            level = lambda f: hi - f * r
        else:
            lo = leg.end
            level = lambda f: lo + f * r

        gp_a, gp_b = level(0.618), level(0.650)
        band = GPBand(low=round(min(gp_a, gp_b), digits), high=round(max(gp_a, gp_b), digits),
                      tf=leg.tf, direction=leg.direction, leg_id=leg.leg_id)
        # Retracement-side check for the band (allow price already inside it)
        if leg.direction == 'long' and band.low <= current_price + 1e-9 or \
           leg.direction == 'short' and band.high >= current_price - 1e-9:
            # long: band must not be entirely above price; short: not entirely below
            if not (leg.direction == 'long' and band.low > current_price) and \
               not (leg.direction == 'short' and band.high < current_price):
                bands.append(band)

        for kind, f in _FIB_RATIOS:
            p = round(level(f), digits)
            if leg.direction == 'long' and p > current_price:
                continue
            if leg.direction == 'short' and p < current_price:
                continue
            lines.append(LevelLine(price=p, kind=kind, tf=leg.tf,
                                   direction=leg.direction, leg_id=leg.leg_id))

    return lines, bands


def emit_retest_lines(bars: list[dict], tf: str, current_price: float,
                      max_break_age_bars: int = 30,
                      pip: float = 1.0, digits: int = 2) -> list[LevelLine]:
    """
    A recently broken high with price now holding above it becomes a long
    retest level (old resistance → support); mirror for lows. Only breaks
    within the last `max_break_age_bars` bars qualify, and only while price
    is within 3×ATR of the level.
    """
    atr = _compute_atr(bars)
    highs = [b['high'] for b in bars]
    lows  = [b['low']  for b in bars]
    _, _, broken_h, broken_l = find_valid_extremes(bars, tf)

    out: list[LevelLine] = []
    n = len(bars)

    for i in broken_h:
        lvl = highs[i]
        if not (0 < current_price - lvl <= atr * 3):
            continue
        break_idx = next((j for j in range(i + 1, n) if highs[j] > lvl), None)
        if break_idx is None or n - 1 - break_idx > max_break_age_bars:
            continue
        out.append(LevelLine(price=round(lvl, digits), kind='retest', tf=tf,
                             direction='long', leg_id=f'{tf}_retestH_{round(lvl / pip)}'))

    for i in broken_l:
        lvl = lows[i]
        if not (0 < lvl - current_price <= atr * 3):
            continue
        break_idx = next((j for j in range(i + 1, n) if lows[j] < lvl), None)
        if break_idx is None or n - 1 - break_idx > max_break_age_bars:
            continue
        out.append(LevelLine(price=round(lvl, digits), kind='retest', tf=tf,
                             direction='short', leg_id=f'{tf}_retestL_{round(lvl / pip)}'))

    return out


# ── Step 3: clustering into zones ─────────────────────────────────────────────

def _merge_bands(bands: list[GPBand]) -> list[dict]:
    """Merge overlapping same-direction GP bands. Returns cluster dicts."""
    clusters: list[dict] = []
    for band in sorted(bands, key=lambda b: b.low):
        placed = False
        for cl in clusters:
            if cl['direction'] != band.direction:
                continue
            if band.low <= cl['high'] and band.high >= cl['low']:
                cl['low']  = min(cl['low'], band.low)
                cl['high'] = max(cl['high'], band.high)
                cl['leg_ids'].add(band.leg_id)
                placed = True
                break
        if not placed:
            clusters.append({'low': band.low, 'high': band.high,
                             'direction': band.direction,
                             'leg_ids': {band.leg_id}, 'kinds': set(),
                             'is_gp': True})
    return clusters


def build_zones(legs_by_tf: dict[str, list[FibLeg]],
                lines: list[LevelLine], bands: list[GPBand],
                cluster_tolerance: float = 3.0,
                pip: float = 1.0, digits: int = 2) -> list[ZoneV2]:
    """
    GP bands seed zones (merged where overlapping); lines join a band's zone
    when within tolerance of it, otherwise they cluster among themselves.

    cluster_tolerance is in PRICE UNITS (caller passes config pips × pip).
    pip / digits scale the entry pad, the zone-id bucket and the price
    rounding; gold defaults (pip=1.0, digits=2) match GoldV2 exactly.
    """
    leg_index: dict[str, FibLeg] = {}
    for legs in legs_by_tf.values():
        for leg in legs:
            leg_index[leg.leg_id] = leg

    clusters = _merge_bands(bands)

    loose: list[LevelLine] = []
    for ln in lines:
        joined = False
        for cl in clusters:
            if cl['direction'] != ln.direction or not cl.get('is_gp'):
                continue
            if cl['low'] - cluster_tolerance <= ln.price <= cl['high'] + cluster_tolerance:
                cl['leg_ids'].add(ln.leg_id)
                cl['kinds'].add(ln.kind)
                cl['low']  = min(cl['low'], ln.price)
                cl['high'] = max(cl['high'], ln.price)
                joined = True
                break
        if not joined:
            loose.append(ln)

    # Greedy price clustering of the remaining lines, per direction
    for direction in ('long', 'short'):
        dir_lines = sorted([l for l in loose if l.direction == direction],
                           key=lambda l: l.price)
        cur: Optional[dict] = None
        for ln in dir_lines:
            if cur and ln.price - cur['high'] <= cluster_tolerance:
                cur['high'] = ln.price
                cur['leg_ids'].add(ln.leg_id)
                cur['kinds'].add(ln.kind)
            else:
                cur = {'low': ln.price, 'high': ln.price, 'direction': direction,
                       'leg_ids': {ln.leg_id}, 'kinds': {ln.kind}, 'is_gp': False}
                clusters.append(cur)

    zones: list[ZoneV2] = []
    for cl in clusters:
        legs = [leg_index[lid] for lid in cl['leg_ids'] if lid in leg_index]
        # retest pseudo-legs have no FibLeg entry; keep zones that have either
        retest_only = not legs and any(k == 'retest' for k in cl['kinds'])
        if not legs and not retest_only:
            continue

        centre = round((cl['low'] + cl['high']) / 2, digits)
        pad    = max(0.5 * pip, cluster_tolerance * 0.25)   # floor = half a pip
        lo, hi = round(cl['low'] - pad, digits), round(cl['high'] + pad, digits)

        if legs:
            primary = max(legs, key=lambda lg: TF_WEIGHT.get(lg.tf, 1.0) * lg.size)
            if cl['direction'] == 'long':
                origin = min(lg.origin for lg in legs)   # deepest support
            else:
                origin = max(lg.origin for lg in legs)
            swing_end = primary.end
            tf_label  = primary.tf
        else:
            primary   = None
            origin    = lo if cl['direction'] == 'long' else hi
            swing_end = 0.0
            tf_label  = 'RT'

        zones.append(ZoneV2(
            # 2-pip id bucket (2 price units on gold — unchanged) so a zone
            # keeps its id across small refresh-to-refresh centre drift.
            zone_id=f"v2_{cl['direction']}_{int(round(centre / (2 * pip)) * 2)}"
                    + ('_gp' if cl.get('is_gp') else ''),
            direction=cl['direction'],
            gp_low=lo, gp_high=hi, centre=centre,
            in_gp=bool(cl.get('is_gp')),
            legs=legs,
            line_kinds=sorted(cl['kinds']),
            swing_origin=round(origin, digits),
            invalidation=round(origin, digits),
            swing_end=round(swing_end, digits),
            primary=primary,
            tf=tf_label,
        ))

    return zones


# ── Step 4: scoring ───────────────────────────────────────────────────────────

def _near(a: float, b: float, tol: float = PROXIMITY_PIPS) -> bool:
    return b != 0.0 and abs(a - b) <= tol


def _near_round(price: float, pip: float, tol_pips: float = 10.0) -> bool:
    """Diagnostic mirror of oiConfluence.nearRoundNumber (JS). Big OI strikes
    cluster on round numbers (big-figure / half / quarter of the pip decade);
    a hit that only lands where a round number already sits is not independent
    evidence. This scorer has no `round_number` source to double-count, so the
    OI credit still applies — the flag is surfaced in the composition only, so
    the forward-test can slice OI-at-round-number apart. Kept tiny + pure."""
    if not (price > 0) or not (pip > 0):
        return False
    tol = tol_pips * pip
    step = pip * 100                       # one "big figure" = 100 pips
    for frac in (1.0, 0.5, 0.25):
        grid = step * frac
        nearest = round(price / grid) * grid
        if abs(price - nearest) <= tol:
            return True
    return False


def score_zones(zones: list[ZoneV2], vol, session, htf,
                trendlines: Optional[list] = None,
                fib_cap: float = FIB_SCORE_CAP,
                vol_levels: Optional[list[tuple[float, str]]] = None,
                oi_levels: Optional[list[tuple[float, str]]] = None,
                pip: float = 1.0,
                proximity: float = PROXIMITY_PIPS) -> list[ZoneV2]:
    """
    vol:        VolumeProfile (volume_profile.py)
    session:    SessionLevels (session_engine.py)
    htf:        HTFBias       (htf_bias.py)
    trendlines: list[Trendline] (trendline_engine.py)
    vol_levels: optional [(price, label)] σ-forecast exhaustion lines from
                /api/vol-forecast (midnight-anchored oc median/75 levels) —
                a zone sitting where the day statistically exhausts is a
                stronger fade location.
    oi_levels:  optional [(price, type)] options-OI levels — the user's
                manually-updated put/call walls, max pain, HVL and gamma flip
                (KV oi_store → the JS oiConfluence.oiStoreToLevels brick, served
                by /api/oi-levels). A wall/max-pain/HVL sitting at a zone is a
                dealer-hedging magnet that strengthens a reversal there; the
                gamma-flip strike is a regime boundary and earns a smaller,
                separately-tagged credit. NOTE (FX vs index asymmetry): the
                source is CME OI — real exchange data even for the FX pairs, but
                CME-listed FX options are a small slice of an OTC-dominated
                market, so the visible walls are partial and the effect is weak;
                on the equity indices the listed book is ~the whole market and
                the dealer-gamma effect is genuine. Behind `use_oi`, forward-
                measurable, paper-first on FX.
    pip:        instrument pip size — only used for the round-number diagnostic
                on OI hits. Gold default (1.0) is a no-op for callers that omit
                oi_levels.
    proximity:  price-unit tolerance for testing a non-fib level against a
                zone centre. Defaults to the gold-tuned PROXIMITY_PIPS ($3);
                multi-instrument callers pass config_pips × pip_size so the
                clustering distance scales with the instrument.
    """
    def near(a: float, b: float, mult: float = 1.0) -> bool:
        return b != 0.0 and abs(a - b) <= proximity * mult

    for zone in zones:
        c     = zone.centre
        comp: list[str] = []
        score = 0.0

        # ── Fib evidence: one credit per DISTINCT leg, TF- and kind-weighted ──
        fib_score = 0.0
        for leg in zone.legs:
            kind_w = max((KIND_WEIGHT.get(k, 1.0) for k in zone.line_kinds), default=1.0)
            fib_score += TF_WEIGHT.get(leg.tf, 1.0) * kind_w
        if zone.legs:
            tf_counts: dict[str, int] = {}
            for leg in zone.legs:
                tf_counts[leg.tf] = tf_counts.get(leg.tf, 0) + 1
            tf_sum = '+'.join(f'{n}{tf}' for tf, n in sorted(tf_counts.items()))
            comp.append(f'{len(zone.legs)} legs ({tf_sum})')
        if 'retest' in zone.line_kinds:
            fib_score += KIND_WEIGHT['retest']
            comp.append('structural retest')
        score += min(fib_score, fib_cap)

        # ── Golden pocket bonus ───────────────────────────────────────────────
        if zone.in_gp:
            score += GP_BONUS
            comp.append('golden pocket')

        # ── nPOC stack (age-weighted, one credit) ────────────────────────────
        for npoc in vol.npoc_stack:
            if near(c, npoc.price):
                score += min(NONFIB_WEIGHTS['npoc_base'] + npoc.age_days * 0.1, 3.0)
                comp.append(f'nPOC {npoc.price:.1f} ({npoc.age_days}d)')
                break

        # ── Today's POC / HVN / VAH / VAL — ONE volume-profile family credit ─
        # POC, HVNs and the value-area edges are all reads of the same day's
        # volume distribution; a zone at the POC is almost always inside the
        # value area too, so stacking their credits double-counts one fact.
        # Award the family ONCE at the strongest matching member's weight
        # (Batch 6 scoring dedup). nPOC above stays separate — it is
        # age-weighted and describes a PRIOR day's distribution.
        vp_credit = 0.0
        vp_hits: list[str] = []
        if near(c, vol.poc):
            vp_credit = max(vp_credit, NONFIB_WEIGHTS['poc'])
            vp_hits.append(f'POC {vol.poc:.1f}')
        for hvn in vol.hvn_levels:
            if near(c, hvn):
                vp_credit = max(vp_credit, NONFIB_WEIGHTS['hvn'])
                vp_hits.append(f'HVN {hvn:.1f}')
                break
        if near(c, vol.vah):
            vp_credit = max(vp_credit, NONFIB_WEIGHTS['vah_val'])
            vp_hits.append('VAH')
        elif near(c, vol.val):
            vp_credit = max(vp_credit, NONFIB_WEIGHTS['vah_val'])
            vp_hits.append('VAL')
        if vp_credit > 0.0:
            score += vp_credit
            comp.append(' + '.join(vp_hits))

        # ── VWAP anchors (age-weighted, one credit) ──────────────────────────
        for anchor in session.vwap_anchors:
            if near(c, anchor.price, 1.5):
                score += min(NONFIB_WEIGHTS['vwap_anchor'] + anchor.age_days * 0.05, 2.5)
                comp.append(f'VWAP anchor {anchor.price:.1f} ({anchor.age_days}d)')
                break

        # ── Trendlines (direction-aligned only, one credit) ──────────────────
        if trendlines:
            for tl in trendlines:
                if not near(c, tl.projected, 2.0):
                    continue
                aligned = ((tl.kind == 'ascending'  and zone.direction == 'long') or
                           (tl.kind == 'descending' and zone.direction == 'short'))
                if aligned:
                    w = (NONFIB_WEIGHTS['trendline_3t'] if tl.touches >= 3
                         else NONFIB_WEIGHTS['trendline_2t'])
                    score += w
                    comp.append(f'{tl.tf} {tl.kind} TL ({tl.touches}t)')
                    break

        # ── σ-forecast exhaustion lines (one credit) ──────────────────────────
        if vol_levels:
            for p, lbl in vol_levels:
                if near(c, p, 1.5):
                    score += NONFIB_WEIGHTS['vol_forecast']
                    comp.append(f'σ {lbl} {p:.1f}')
                    break

        # ── Options OI levels — ONE credit at the strongest matching type ─────
        # The user's manually-updated OI (put/call walls, max pain, HVL, gamma
        # flip). Multiple OI strikes near one zone are one piece of positioning
        # evidence, so award once at the strongest weight (magnet > gamma flip),
        # never stacked. gamma_flip is a boundary not a magnet → smaller credit.
        # Round-number independence is flagged (diagnostic only — see
        # _near_round): this scorer has no round_number source, so the credit
        # applies either way, but the tag lets the forward-test slice it out.
        if oi_levels:
            oi_w, oi_ty, oi_p = 0.0, None, None
            for p, ty in oi_levels:
                if not near(c, p):
                    continue
                w = (NONFIB_WEIGHTS['oi_gamma_flip'] if ty == 'gamma_flip'
                     else NONFIB_WEIGHTS['oi_magnet'])
                if w > oi_w:
                    oi_w, oi_ty, oi_p = w, ty, p
            if oi_w > 0.0:
                score += oi_w
                rn = ' @rn' if _near_round(oi_p, pip) else ''
                comp.append(f'OI {oi_ty} {oi_p:.5g}{rn}')

        # ── Session / daily levels — ONE prior-session-structure credit ──────
        # Floor pivots are deterministic functions of prev-day H/L/C, and the
        # daily open / prev-day H/L / session H/L all describe the same prior
        # session's structure — when one sits at a zone the others usually do
        # too, so separate credits quadruple-count one piece of evidence.
        # Award the family ONCE at the strongest matching member's weight
        # (Batch 6 scoring dedup). σ-forecast lines, VWAP anchors, trendlines
        # and HTF alignment are independent sources and keep their own credits.
        ps_credit = 0.0
        ps_hits: list[str] = []
        if session.daily_open and near(c, session.daily_open, 1.5):
            ps_credit = max(ps_credit, NONFIB_WEIGHTS['daily_open'])
            ps_hits.append('Daily open')
        if near(c, session.prev_daily_high, 1.5) or near(c, session.prev_daily_low, 1.5):
            ps_credit = max(ps_credit, NONFIB_WEIGHTS['prev_day_hl'])
            ps_hits.append('Prev day H/L')
        for lvl in (session.asia_high, session.asia_low, session.london_high,
                    session.london_low, session.ny_high, session.ny_low):
            if lvl and near(c, lvl, 1.5):
                ps_credit = max(ps_credit, NONFIB_WEIGHTS['session_hl'])
                ps_hits.append('Session H/L')
                break
        for pvt in (session.pivot, session.r1, session.r2, session.s1, session.s2):
            if near(c, pvt, 1.5):
                ps_credit = max(ps_credit, NONFIB_WEIGHTS['pivot'])
                ps_hits.append('Pivot')
                break
        if ps_credit > 0.0:
            score += ps_credit
            comp.append(' + '.join(ps_hits))

        # ── HTF alignment ─────────────────────────────────────────────────────
        bullish = zone.direction == 'long'
        if (htf.bias == 'BULL' and bullish) or (htf.bias == 'BEAR' and not bullish):
            score += NONFIB_WEIGHTS['htf_aligned']
            zone.htf_aligned = True
            comp.append(f'HTF {htf.bias}')
        elif htf.bias != 'NEUTRAL':
            score -= 1.0
            zone.htf_aligned = False
            comp.append(f'counter-{htf.bias}')
        else:
            zone.htf_aligned = False

        zone.score       = round(score, 2)
        zone.composition = comp

    zones.sort(key=lambda z: z.score, reverse=True)
    return zones


# ── Zone activity between refreshes ───────────────────────────────────────────

def update_zone_activity(zones: list[ZoneV2], recent_closes: list[float]) -> None:
    """Expire a zone once two consecutive closes are beyond its invalidation."""
    if len(recent_closes) < 2:
        return
    last2 = recent_closes[-2:]
    for zone in zones:
        if not zone.active:
            continue
        if zone.direction == 'long' and all(c < zone.invalidation for c in last2):
            zone.active = False
        elif zone.direction == 'short' and all(c > zone.invalidation for c in last2):
            zone.active = False


# ── Top-level convenience ─────────────────────────────────────────────────────

def build_level_matrix(bars_by_tf: dict[str, list[dict]], current_price: float,
                       cluster_tolerance: float = 3.0,
                       include_retests: bool = True,
                       pip: float = 1.0, digits: int = 2) -> tuple[list[ZoneV2], dict]:
    """
    bars_by_tf: {'H4': [...], 'M30': [...]} chronological bars per entry TF.
    Returns (zones, debug_info). Zones are unscored — call score_zones next.

    cluster_tolerance is in PRICE UNITS. pip / digits are the instrument's
    scale, threaded through leg ids, level rounding, zone pads and zone ids;
    the gold defaults (pip=1.0, digits=2) reproduce GoldV2 bit-for-bit.
    """
    legs_by_tf: dict[str, list[FibLeg]] = {}
    all_lines: list[LevelLine] = []
    all_bands: list[GPBand] = []

    for tf, bars in bars_by_tf.items():
        if not bars:
            continue
        legs = build_legs(bars, tf, pip=pip, digits=digits)
        legs_by_tf[tf] = legs
        lines, bands = emit_levels(legs, current_price, digits=digits)
        all_lines.extend(lines)
        all_bands.extend(bands)
        if include_retests:
            all_lines.extend(emit_retest_lines(bars, tf, current_price,
                                               pip=pip, digits=digits))

    zones = build_zones(legs_by_tf, all_lines, all_bands, cluster_tolerance,
                        pip=pip, digits=digits)

    debug = {
        'legs':  {tf: len(legs) for tf, legs in legs_by_tf.items()},
        'lines': len(all_lines),
        'bands': len(all_bands),
        'zones': len(zones),
    }
    return zones, debug
