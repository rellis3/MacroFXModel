import { S } from './state.js';
import { getPipSize, pipsBetween, getConfluenceThreshold, getAsiaMinPips, toMyfxbSym } from './utils.js';
import { getAnchorPrice, directionFromPrice, getDailyFibLevels } from './ranges.js';
import { getCaps } from './caps.js';
import { calcPositionSize } from './vol.js';
import { oiLoadStore } from './oi.js';
import { computeDivergences } from './divergence.js';
import { detectPolarityFlip } from './polarity.js';

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

// Pre-enhancement structural quality filter.
// Asia/Monday confluences already proved cross-temporal agreement (today vs yesterday,
// or this Monday vs last Monday within the pip threshold) — always keep them.
// Only apply the density/tight gate to injected single-source levels (volConfs, oiConfs
// with density:1) that haven't gone through the temporal cross-check.
export function filterConfluences(confluences) {
  if (!confluences.length) return confluences;
  const quality = confluences.filter(c =>
    c.source === 'asia' || c.source === 'monday' || c.source === 'cross' ||
    c.isTight || (c.density ?? 1) >= 2 || c.crossSessionMatch
  );
  return quality.length > 0 ? quality : confluences;
}

// Cross-source merge — collapses Asia + Monday levels that land within the
// same within-source merge distance into a single averaged level.
// Call this immediately after assembling [...asiaConfs, ...mondayConfs].
// Halves the level count when Asia and Monday ranges overlap (very common for Gold).
export function mergeCrossSources(confluences, symbol) {
  if (!confluences.length) return confluences;

  const pipSize = getPipSize(symbol);
  const caps    = getCaps(symbol);
  const _eqCapMap = { NAS100_USD: 'nas100', SPX500_USD: 'spx500', DE30_USD: 'de30', UK100_GBP: 'uk100', US30_USD: 'us30', US2000_USD: 'us2000' };
  const bucket  = symbol.includes('XAU') ? caps.gold : _eqCapMap[symbol] ? caps[_eqCapMap[symbol]] : caps.fx;
  // Use same merge distance as within-source clustering in confluence-core.js
  const mergeDist = (bucket?.confluencePips ?? 4) * (bucket?.mergeFactor ?? 0.30) * pipSize;

  const sorted = [...confluences].sort((a, b) => a.price - b.price);
  const result = [];
  let cluster  = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const centre = cluster.reduce((s, c) => s + c.price, 0) / cluster.length;
    if (sorted[i].price - centre <= mergeDist) {
      cluster.push(sorted[i]);
    } else {
      result.push(_collapseCluster(cluster));
      cluster = [sorted[i]];
    }
  }
  result.push(_collapseCluster(cluster));
  return result;
}

function _collapseCluster(cluster) {
  if (cluster.length === 1) return cluster[0];

  const price     = cluster.reduce((s, c) => s + c.price, 0) / cluster.length;
  const hasAsia   = cluster.some(c => c.source === 'asia');
  const hasMonday = cluster.some(c => c.source === 'monday');
  const hasVol    = cluster.some(c => c.source === 'volforecast');
  const density   = cluster.reduce((s, c) => s + (c.density || 1), 0);
  const pipDiff   = Math.min(...cluster.map(c => c.pipDiff ?? Infinity));
  const isTight   = cluster.some(c => c.isTight);
  const todayFibs     = [...new Set(cluster.flatMap(c => c.todayFibs   ?? (c.todayFib   ? [c.todayFib]   : [])))];
  const yesterdayFibs = [...new Set(cluster.flatMap(c => c.yesterdayFibs ?? (c.yesterdayFib ? [c.yesterdayFib] : [])))];

  return {
    ...cluster[0],
    price,
    isTight,
    density,
    pipDiff,
    todayFibs,
    yesterdayFibs,
    todayFib:         todayFibs[0]     ?? cluster[0].todayFib,
    yesterdayFib:     yesterdayFibs[0] ?? cluster[0].yesterdayFib,
    source:           hasAsia && hasMonday ? 'cross' : (hasAsia ? 'asia' : (hasMonday ? 'monday' : 'volforecast')),
    crossSessionMatch: hasAsia && hasMonday,
    hasVolForecast:   hasVol,
  };
}

// keyLevels: { pdhHigh, pdhLow, pwhHigh, pwhLow } — optional previous-day/week extremes.
// These are the most watched institutional reference levels and earn a dedicated star bonus
// when a confluence zone coincides with them.
export function enhanceConfluences(confluences, currentPrice, bias, pivots, volRegime, macroScore, keyLevels = null) {
  const symbol = S.currentPair.symbol;
  const pipSize = getPipSize(symbol);
  const atr = volRegime.atr;

  // Compute oscillator divergences once for the whole symbol — applied per-level by direction
  const divs = (() => { try { return computeDivergences(symbol); } catch(e) { return { rsi: {}, wt5m: {} }; } })();

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

  // Polarity flip — read config once, reverse browser's newest-first bars to chronological order
  const _alertFlipCfg  = (() => { try { return JSON.parse(localStorage.getItem('tg_alert_cfg') || '{}'); } catch(e) { return {}; } })();
  const _flipCandles   = _alertFlipCfg.flipCandles ?? 3;
  const _bars5mChron   = S.ohlc5m?.[symbol]?.values?.length ? [...S.ohlc5m[symbol].values].reverse() : null;
  const _hmm5mRegime   = S.hmm5mRegimes?.[symbol] ?? null;

  return confluences.map(c => {
    const rawDirection = directionFromPrice(c.price, anchorPrice, symbol);
    const _flip        = rawDirection
      ? detectPolarityFlip({ price: c.price, direction: rawDirection }, _bars5mChron, _hmm5mRegime, _flipCandles)
      : null;
    const direction    = _flip ? _flip.newDirection : rawDirection;
    const distance = pipsBetween(currentPrice, c.price, symbol);

    const aligned = direction != null && (
      (direction === 'short' && bias === 'SHORT') ||
      (direction === 'long'  && bias === 'LONG')
    );
    // Three-state alignment for display: 'aligned' | 'opposing' | 'neutral'
    const alignStatus = !direction          ? 'neutral'
      : aligned                             ? 'aligned'
      : (bias === 'NEUTRAL' || !bias)       ? 'neutral'
      : 'opposing';

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

    // Phase 3: OI level within proximity boosts star rating — check all ranked walls.
    // Star weight scales with wall strength: a match on the heaviest wall = full star,
    // a minor wall = half. Gamma flip = 0.75, max pain = 0.5 (weaker structural pulls).
    let oiMatch = null;
    let oiStars = 0;
    if (_oiData) {
      const _cw = _oiData.callWalls?.length ? _oiData.callWalls
                : (_oiData.callWall ? [{ strike: _oiData.callWall, oi: _oiData.callWallOI || 0 }] : []);
      const _pw = _oiData.putWalls?.length  ? _oiData.putWalls
                : (_oiData.putWall  ? [{ strike: _oiData.putWall,  oi: _oiData.putWallOI  || 0 }] : []);
      const _maxWallOI = Math.max(1, _cw[0]?.oi || 0, _pw[0]?.oi || 0);
      const _wallStars = oi => Math.max(0.5, Math.min(1, 0.5 + 0.5 * ((oi || 0) / _maxWallOI)));
      for (const w of _cw) { if (Math.abs(c.price - w.strike) <= oiCapDist) { oiMatch = 'Call Wall'; oiStars = _wallStars(w.oi); break; } }
      if (!oiMatch) for (const w of _pw) { if (Math.abs(c.price - w.strike) <= oiCapDist) { oiMatch = 'Put Wall'; oiStars = _wallStars(w.oi); break; } }
      if (!oiMatch && Math.abs(c.price - _oiData.maxPain) <= oiCapDist) { oiMatch = 'Max Pain'; oiStars = 0.5; }
      if (!oiMatch && _oiData.gexProfile && _oiData.gexProfile.length > 1) {
        for (let i = 1; i < _oiData.gexProfile.length; i++) {
          if (Math.sign(_oiData.gexProfile[i].netGex) !== Math.sign(_oiData.gexProfile[i-1].netGex)) {
            if (Math.abs(c.price - _oiData.gexProfile[i].strike) <= gexCapDist) {
              oiMatch = 'Gamma Flip'; oiStars = 0.75; break;
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

    // Previous-day high/low and previous-week high/low checks.
    // These are the most watched institutional reference levels (from Asia backtest confluence
    // module system). The Asia backtest engine scores these as pdhPdl (weight 2.0) and
    // pwhPwl (weight 1.5) — highest-weighted modules. Porting them here closes the gap
    // between the backtest engine's zone quality and the dashboard's star rating.
    let pdhMatch = null, pwhMatch = null;
    if (keyLevels) {
      const _klTol = _dfibThreshold;
      if (keyLevels.pdhHigh != null && Math.abs(c.price - keyLevels.pdhHigh) <= _klTol)
        pdhMatch = 'PDH';
      else if (keyLevels.pdhLow != null && Math.abs(c.price - keyLevels.pdhLow) <= _klTol)
        pdhMatch = 'PDL';
      if (keyLevels.pwhHigh != null && Math.abs(c.price - keyLevels.pwhHigh) <= _klTol)
        pwhMatch = 'PWH';
      else if (keyLevels.pwhLow != null && Math.abs(c.price - keyLevels.pwhLow) <= _klTol)
        pwhMatch = 'PWL';
    }

    // Fix 8: track structural stars (level quality) separately from alignment stars
    let structuralStars = 1;
    if (c.isTight)                 structuralStars += 4;
    if (pivotMatch)                structuralStars++;
    if (pdhMatch)                  structuralStars++;  // prev-day H/L — top institutional level
    if (pwhMatch)                  structuralStars++;  // prev-week H/L — weekly extreme
    if (oiMatch)                   structuralStars += oiStars;  // weighted by wall strength
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

    // Divergence tags — RSI (daily) and WaveTrend (5m), matched to level direction
    const divTags = [];
    let divStars = 0;

    if (direction === 'long') {
      if (divs.rsi.bullDiv) {
        divTags.push({
          label:   `RSI Div ↑ (${divs.rsi.bullDiv.barsAgo}d ago)`,
          tooltip: `Daily RSI bullish divergence: price made lower low but RSI made higher low — momentum reversing up`,
        });
        divStars += 1;
      }
      if (divs.wt5m.bullDiv) {
        divTags.push({
          label:   `WT Div ↗ (${divs.wt5m.bullDiv.barsAgo}×5m)`,
          tooltip: `5m WaveTrend bullish divergence: price lower low, WT higher low — intraday momentum turning`,
        });
        divStars += 1;
      }
    } else if (direction === 'short') {
      if (divs.rsi.bearDiv) {
        divTags.push({
          label:   `RSI Div ↓ (${divs.rsi.bearDiv.barsAgo}d ago)`,
          tooltip: `Daily RSI bearish divergence: price made higher high but RSI made lower high — momentum fading`,
        });
        divStars += 1;
      }
      if (divs.wt5m.bearDiv) {
        divTags.push({
          label:   `WT Div ↘ (${divs.wt5m.bearDiv.barsAgo}×5m)`,
          tooltip: `5m WaveTrend bearish divergence: price higher high, WT lower high — intraday momentum topping`,
        });
        divStars += 1;
      }
    }

    let stars = Math.min(5, structuralStars + confirmationStars + crowdingAdj + divStars);

    const baseSize = calcPositionSize(macroScore, volRegime);
    const sizeAdj = aligned ? 1 : 0.5;
    const finalSize = Math.round(baseSize * sizeAdj);

    // Structural SL — nearest confluence on adverse side, hard-capped at slMaxAtrMult × ATR.
    // This replaces the old daily-ATR stop which was far too wide for intraday level entries.
    const _slMaxAtrMult = (S._caps || {}).slMaxAtrMult ?? 0.5;
    const _maxSlDist    = atr * _slMaxAtrMult;
    const _slBuffer     = pipSize * 2; // buffer just beyond the adverse level

    let slDist;
    if (direction === 'long') {
      const adverse = [...sortedByPrice].reverse().find(o => o !== c && o.price < c.price - pipSize * 0.5);
      slDist = adverse
        ? Math.min((c.price - adverse.price) + _slBuffer, _maxSlDist)
        : _maxSlDist;
    } else if (direction === 'short') {
      const adverse = sortedByPrice.find(o => o !== c && o.price > c.price + pipSize * 0.5);
      slDist = adverse
        ? Math.min((adverse.price - c.price) + _slBuffer, _maxSlDist)
        : _maxSlDist;
    } else {
      slDist = _maxSlDist;
    }
    // Noise floor: never tighter than 5% of daily ATR
    slDist = Math.max(slDist, atr * 0.05);

    // ATR-based SL using 30m bars × user-configured multiplier
    let slAtrDist = atr * 1.0; // fallback: 1× daily ATR
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
        other.price > c.price + slDist * 0.5 && other !== c
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
        other.price < c.price - slDist * 0.5 && other !== c
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
      const tpRaw = slDist * targetMult;
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : (isSessionLevel ? '2.2R' : 'ATR');
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }

    const rrRaw  = slDist > 0 && tpDist != null ? (tpDist / slDist) : 0;
    const poorRR = rrRaw < 1.0;

    // TP path risk — warn if a structural fib sits between entry and TP.
    // Buffer of 15% of slDist on each end avoids flagging levels right at entry or TP.
    let tpFibRisk = null;
    if (direction && tp != null && _structLevels.length > 0) {
      const buf = slDist * 0.15;
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
      tags: _flip ? [{ label: '🔄 Role Reversal', tooltip: _flip.reason }, ...(c.tags ?? [])] : (c.tags ?? []),
      direction,
      originalDirection: rawDirection,
      isFlipped:   !!_flip,
      flipReason:  _flip?.reason ?? null,
      distance,
      aligned,
      alignStatus,
      pivotMatch,
      pdhMatch,           // 'PDH' | 'PDL' | null — previous-day high/low alignment
      pwhMatch,           // 'PWH' | 'PWL' | null — previous-week high/low alignment
      oiMatch,
      dailyFib,           // { label, direction, strength } of matching daily Fib level, or null
      structuralFib,      // { label, direction, passType, timeLabel, count } or null
      tpFibRisk,          // nearest structural fib sitting in TP path, or null (warn only)
      nearDailyOpen,      // { date, price, label } of most recent matching daily open, or null
      retailCluster,      // { price, label, side } of nearby Myfxbook avg price cluster, or null
      dailyOpenCount: matchingOpens.length,
      divTags,            // [ { label, tooltip } ] divergence signals aligned with level direction
      divStars,           // 0–2 extra stars from RSI/WT divergence confirmation
      stars,
      structuralStars,    // Fix 8: level quality stars (isTight, pivots, OI, fib clusters)
      confirmationStars,  // Fix 8: directional alignment stars
      size: finalSize,
      sl: direction === 'long'  ? c.price - slDist :
          direction === 'short' ? c.price + slDist : null,
      slAtr: direction === 'long'  ? c.price - slAtrDist :
             direction === 'short' ? c.price + slAtrDist : null,
      slAtrPips: slAtrDist / pipSize,
      tp,
      tpSource,
      stopPips:  slDist / pipSize,
      tpPips:    tpDist != null ? tpDist / pipSize : 0,
      tpCapped,
      poorRR,
      rrRaw:     rrRaw.toFixed(1),
    };
  });
}
