import { S } from './state.js';
import { getPipSize, pipsBetween, getConfluenceThreshold, getAsiaMinPips, toMyfxbSym } from './utils.js';
import { getAnchorPrice, directionFromPrice, getDailyFibLevels } from './ranges.js';
import { getCaps } from './caps.js';
import { calcPositionSize } from './vol.js';
import { oiLoadStore } from './oi.js';

const _DFIB_STRENGTH = { gold: 3, silver: 2, bronze: 1 };

// Cross-session cluster detection — marks Asia and Monday confluences that land
// within the confluence threshold of each other. Run on the raw arrays before merge.
export function detectCrossSessionClusters(asiaConfs, mondayConfs, symbol) {
  const pipSize   = getPipSize(symbol);
  const threshold = getConfluenceThreshold(symbol) * pipSize;

  asiaConfs.forEach(ac => {
    mondayConfs.forEach(mc => {
      const diff = Math.abs(ac.price - mc.price);
      if (diff <= threshold) {
        ac.crossSessionMatch = true;
        mc.crossSessionMatch = true;
        ac.crossSessionGap   = diff / pipSize;
        mc.crossSessionGap   = diff / pipSize;
      }
    });
  });
}

export function filterConfluences(confluences) {
  if (S.currentMode === 'strongest') return confluences.filter(c => c.isTight);
  return confluences;
}

export function enhanceConfluences(confluences, currentPrice, bias, pivots, volRegime, macroScore) {
  const symbol = S.currentPair.symbol;
  const pipSize = getPipSize(symbol);
  const atr = volRegime.atr;

  const anchorPrice = getAnchorPrice(symbol);

  const sortedByPrice = [...confluences].sort((a, b) => a.price - b.price);

  // Phase 3: OI proximity caps — same formula as entry scanner
  const _oiCaps    = getCaps(symbol);
  const _oiIsGold  = pipSize >= 0.1 && symbol.includes('XAU');
  const _oiPipMult = _oiIsGold ? 1.0 : pipSize;
  const oiCapDist  = Math.min(atr * _oiCaps.oiAtrFrac,  _oiCaps.oiPipCap  * _oiPipMult);
  const gexCapDist = Math.min(atr * _oiCaps.gexAtrFrac, _oiCaps.gexPipCap * _oiPipMult);
  const rngCapDist = Math.min(atr * _oiCaps.rngAtrFrac, _oiCaps.rngPipCap * _oiPipMult);
  const _oiData    = oiLoadStore()[symbol] || null;
  const _dailyOpens = S.sessionData?.dailyOpens || [];

  // Daily Fib retracement matching — only when Asia range is wide enough
  const _asiaRange  = S.asiaRangeData[symbol]?.today?.range ?? 0;
  const _asiaPips   = _asiaRange / pipSize;
  const _asiaMinPips = getAsiaMinPips(symbol);
  const _dfibThreshold = getConfluenceThreshold(symbol) * pipSize;
  const _dailyFibs = _asiaPips >= _asiaMinPips ? getDailyFibLevels(symbol) : [];
  const _structLevels = S.structuralFibData[symbol]?.levels || [];

  return confluences.map(c => {
    const direction = directionFromPrice(c.price, anchorPrice, symbol);
    const distance = pipsBetween(currentPrice, c.price, symbol);

    const aligned = direction != null && (
      (direction === 'short' && bias === 'SHORT') ||
      (direction === 'long'  && bias === 'LONG')
    );

    const _enhCaps   = getCaps(symbol);
    const _isGoldEnh = pipSize >= 0.1 && symbol.includes('XAU');
    const pivotCapPrice = _isGoldEnh
      ? Math.min(atr * _enhCaps.enhPivAtrFrac, _enhCaps.enhPivPipCap * 1.0)
      : Math.min(atr * _enhCaps.enhPivAtrFrac, _enhCaps.enhPivPipCap * pipSize);

    let pivotMatch = null;
    let _pivBestDist = Infinity;
    Object.entries(pivots).forEach(([key, val]) => {
      if (!val || isNaN(val)) return;
      const dist = Math.abs(c.price - val);
      if (dist <= pivotCapPrice && dist < _pivBestDist) {
        pivotMatch = key.toUpperCase();
        _pivBestDist = dist;
      }
    });

    // Phase 3: OI level within proximity boosts star rating
    let oiMatch = null;
    if (_oiData) {
      if (Math.abs(c.price - _oiData.callWall) <= oiCapDist) oiMatch = 'Call Wall';
      else if (Math.abs(c.price - _oiData.putWall) <= oiCapDist) oiMatch = 'Put Wall';
      else if (Math.abs(c.price - _oiData.maxPain) <= oiCapDist) oiMatch = 'Max Pain';
      if (!oiMatch && _oiData.gexProfile && _oiData.gexProfile.length > 1) {
        for (let i = 1; i < _oiData.gexProfile.length; i++) {
          if (Math.sign(_oiData.gexProfile[i].netGex) !== Math.sign(_oiData.gexProfile[i-1].netGex)) {
            if (Math.abs(c.price - _oiData.gexProfile[i].strike) <= gexCapDist) {
              oiMatch = 'Gamma Flip'; break;
            }
          }
        }
      }
    }

    // Retail cluster proximity (Myfxbook avgLongPrice / avgShortPrice)
    // Uses same oiCapDist threshold as OI walls — both are positioning clusters.
    let retailCluster = null;
    const _mfxSent = S.myfxSentiment[toMyfxbSym(symbol)];
    if (_mfxSent && _mfxSent.avgLongPrice && _mfxSent.avgShortPrice) {
      const retailLevels = [
        { price: _mfxSent.avgLongPrice,  label: 'Retail Long Cluster',  side: 'long'  },
        { price: _mfxSent.avgShortPrice, label: 'Retail Short Cluster', side: 'short' },
      ].filter(l => l.price && Math.abs(l.price - c.price) <= oiCapDist);
      if (retailLevels.length > 0) retailCluster = retailLevels[0];
    }

    // Find all daily opens within proximity — newest-first, take first as label
    const matchingOpens = _dailyOpens.filter(d => Math.abs(c.price - d.price) <= rngCapDist);
    const nearDailyOpen = matchingOpens.length > 0 ? matchingOpens[0] : null;

    // Daily Fib retracement match — pick strongest matching level at this price.
    // Zone entries (GP): confluence must fall INSIDE priceMin–priceMax.
    // Point entries: confluence must be within _dfibThreshold of the level price.
    let dailyFib = null;
    if (_dailyFibs.length > 0) {
      const matches = _dailyFibs.filter(f =>
        f.isZone
          ? c.price >= f.priceMin && c.price <= f.priceMax
          : Math.abs(c.price - f.price) <= _dfibThreshold
      );
      if (matches.length > 0) {
        matches.sort((a, b) => (_DFIB_STRENGTH[b.strength] || 0) - (_DFIB_STRENGTH[a.strength] || 0));
        dailyFib = matches[0];
      }
    }

    // Structural fib matching — count how many of the multi-pass fib levels land within threshold.
    // Density ≥ 3 = three independent anchor pairs agree on this price = extra star.
    let structuralFib = null;
    if (_structLevels.length > 0) {
      const sfMatches = _structLevels.filter(sf =>
        sf.isZone
          ? c.price >= sf.priceMin && c.price <= sf.priceMax
          : Math.abs(sf.price - c.price) <= _dfibThreshold
      );
      if (sfMatches.length > 0) {
        sfMatches.sort((a, b) => (_DFIB_STRENGTH[b.strength] || 0) - (_DFIB_STRENGTH[a.strength] || 0));
        structuralFib = { ...sfMatches[0], count: sfMatches.length };
      }
    }

    // Fix 8: track structural stars (level quality) separately from alignment stars
    let structuralStars = 1;
    if (c.isTight)                 structuralStars++;
    if (pivotMatch)                structuralStars++;
    if (oiMatch)                   structuralStars++;
    if (nearDailyOpen)             structuralStars++;
    if (matchingOpens.length >= 3) structuralStars++;
    if ((c.density || 1) >= 2)     structuralStars++;
    if (dailyFib)                  structuralStars++;
    if (structuralFib)             structuralStars++;
    if ((structuralFib?.count ?? 0) >= 3) structuralStars++;
    if (c.crossSessionMatch)       structuralStars++; // Asia + Monday fibs agree on this price
    if (retailCluster)             structuralStars += 0.5; // retail positioning cluster nearby

    let confirmationStars = 0;
    if (aligned) confirmationStars++;

    // Crowding bonus/penalty based on Myfxbook sentiment vs macro bias
    let crowdingAdj = 0;
    if (_mfxSent) {
      const crowdOpposesBias = (bias === 'LONG'  && _mfxSent.sentiment === 'SHORT_HEAVY') ||
                               (bias === 'SHORT' && _mfxSent.sentiment === 'LONG_HEAVY');
      const crowdAgreesBias  = (bias === 'LONG'  && _mfxSent.sentiment === 'LONG_HEAVY') ||
                               (bias === 'SHORT' && _mfxSent.sentiment === 'SHORT_HEAVY');
      if (crowdOpposesBias && _mfxSent.crowding === 'EXTREME') crowdingAdj =  1.0;  // squeeze fuel
      else if (crowdOpposesBias && _mfxSent.crowding === 'STRONG')   crowdingAdj =  0.5;
      else if (crowdAgreesBias  && _mfxSent.crowding === 'EXTREME')  crowdingAdj = -0.5; // crowded trade
    }

    let stars = structuralStars + confirmationStars + crowdingAdj;

    const baseSize = calcPositionSize(macroScore, volRegime);
    const sizeAdj = aligned ? 1 : 0.5;
    const finalSize = Math.round(baseSize * sizeAdj);

    const stopDist = volRegime.stopDist || atr * 1.0;

    // ATR-based SL using 30m bars × user-configured multiplier
    let slAtrDist = stopDist; // safe fallback — same as primary SL
    try {
      const _rbOpts    = (() => { try { return JSON.parse(localStorage.getItem('range_bias_opts') || '{}'); } catch(e) { return {}; } })();
      const _slAtrMult = _rbOpts.slAtrMult ?? 1.5;
      const _bars30m   = S.ohlc30m?.[symbol]?.values;
      if (_bars30m && _bars30m.length >= 15) {
        const _ATR_A     = 0.15;
        const _barsChron = [..._bars30m].reverse(); // oldest-first
        let _ema = Math.abs(parseFloat(_barsChron[1].high) - parseFloat(_barsChron[1].low));
        for (let _i = 2; _i < Math.min(_barsChron.length, 60); _i++) {
          const _h  = parseFloat(_barsChron[_i].high);
          const _l  = parseFloat(_barsChron[_i].low);
          const _pc = parseFloat(_barsChron[_i - 1].close);
          const _tr = Math.max(_h - _l, Math.abs(_h - _pc), Math.abs(_l - _pc));
          if (isFinite(_tr) && _tr > 0) _ema = _ATR_A * _tr + (1 - _ATR_A) * _ema;
        }
        if (isFinite(_ema) && _ema > 0) slAtrDist = _ema * _slAtrMult;
      }
    } catch(e) {}

    const remaining = volRegime.remainingRange || atr;
    const tpCap     = remaining * 0.85;

    let tp = null, tpDist = null, tpSource = 'ATR', tpCapped = false;

    if (direction === 'long') {
      const nextConf = sortedByPrice.find(other =>
        other.price > c.price + stopDist * 0.5 && other !== c
      );
      if (nextConf) {
        const confDist = nextConf.price - c.price;
        if (confDist <= tpCap) {
          tp = nextConf.price;
          tpDist = confDist;
          tpSource = 'Next confluence';
        }
      }
    } else if (direction === 'short') {
      const nextConf = [...sortedByPrice].reverse().find(other =>
        other.price < c.price - stopDist * 0.5 && other !== c
      );
      if (nextConf) {
        const confDist = c.price - nextConf.price;
        if (confDist <= tpCap) {
          tp = nextConf.price;
          tpDist = confDist;
          tpSource = 'Next confluence';
        }
      }
    }

    if (tp == null && direction != null) {
      // Use 2.2R for session-sourced confluences (Asia/Monday) — validated in backtest.
      const isSessionLevel = (c.source === 'asia' || c.source === 'monday');
      const targetMult = isSessionLevel ? 2.2 : (volRegime.tpMult || 1.5);
      const tpRaw = stopDist * targetMult;
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : (isSessionLevel ? '2.2R' : 'ATR');
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }

    const rrRaw  = stopDist > 0 && tpDist != null ? (tpDist / stopDist) : 0;
    const poorRR = rrRaw < 1.0;

    // TP path risk — warn if a structural fib sits between entry and TP.
    // Buffer of 15% of stopDist on each end avoids flagging levels right at entry or TP.
    let tpFibRisk = null;
    if (direction && tp != null && _structLevels.length > 0) {
      const buf = stopDist * 0.15;
      const inPath = _structLevels.filter(sf =>
        direction === 'long'
          ? sf.price > c.price + buf && sf.price < tp - buf
          : sf.price < c.price - buf && sf.price > tp + buf
      );
      if (inPath.length > 0) {
        inPath.sort((a, b) => direction === 'long' ? a.price - b.price : b.price - a.price);
        tpFibRisk = inPath[0];
      }
    }

    return {
      ...c,
      direction,
      distance,
      aligned,
      pivotMatch,
      oiMatch,
      dailyFib,           // { label, direction, strength } of matching daily Fib level, or null
      structuralFib,      // { label, direction, passType, timeLabel, count } or null
      tpFibRisk,          // nearest structural fib sitting in TP path, or null (warn only)
      nearDailyOpen,      // { date, price, label } of most recent matching daily open, or null
      retailCluster,      // { price, label, side } of nearby Myfxbook avg price cluster, or null
      dailyOpenCount: matchingOpens.length,
      stars,
      structuralStars,    // Fix 8: level quality stars (isTight, pivots, OI, fib clusters)
      confirmationStars,  // Fix 8: directional alignment stars
      size: finalSize,
      sl: direction === 'long'  ? c.price - stopDist :
          direction === 'short' ? c.price + stopDist : null,
      slAtr: direction === 'long'  ? c.price - slAtrDist :
             direction === 'short' ? c.price + slAtrDist : null,
      slAtrPips: slAtrDist / pipSize,
      tp,
      tpSource,
      stopPips:  stopDist / pipSize,
      tpPips:    tpDist != null ? tpDist / pipSize : 0,
      tpCapped,
      poorRR,
      rrRaw:     rrRaw.toFixed(1),
    };
  });
}
