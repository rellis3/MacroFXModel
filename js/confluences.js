import { S } from './state.js';
import { getPipSize, pipsBetween } from './utils.js';
import { getAnchorPrice, directionFromPrice } from './ranges.js';
import { getCaps } from './caps.js';
import { calcPositionSize } from './vol.js';

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

    let stars = 1;
    if (c.isTight)             stars++;
    if (aligned)               stars++;
    if (pivotMatch)            stars++;
    if ((c.density || 1) >= 2) stars++;  // density bonus: 2+ fib pairs collapsed here

    const baseSize = calcPositionSize(macroScore, volRegime);
    const sizeAdj = aligned ? 1 : 0.5;
    const finalSize = Math.round(baseSize * sizeAdj);

    const stopDist = volRegime.stopDist || atr * 1.0;

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
      const tpRaw = stopDist * (volRegime.tpMult || 1.5);
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : 'ATR';
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }

    const rrRaw  = stopDist > 0 && tpDist != null ? (tpDist / stopDist) : 0;
    const poorRR = rrRaw < 1.0;

    return {
      ...c,
      direction,
      distance,
      aligned,
      pivotMatch,
      stars,
      size: finalSize,
      sl: direction === 'long'  ? c.price - stopDist :
          direction === 'short' ? c.price + stopDist : null,
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
