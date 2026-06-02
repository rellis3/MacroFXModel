// confluence-core.js — pure function, no state imports.
// Single source of truth for confluence detection shared by the dashboard
// (ranges.js), backtest engine (backtest-engine.js), and any future consumers.
//
// priceMode controls where the line is drawn when two fibs are confluent:
//   'midpoint' — average of the two prices  (current dashboard behaviour)
//   'lowest'   — lower of the two prices    (Pine Script default)
//   'highest'  — higher of the two prices
//
// clusterMerge controls whether nearby raw pairs are collapsed into one level:
//   true  — dashboard mode: group pairs within mergeDistance, average them
//   false — Pine Script mode: each qualifying pair gets its own level,
//           deduplicated only when two selected prices are < 0.1 pip apart
//
// sessionRange (optional): when provided, caps the effective confluence
//   distance to match the Pine Script formula:
//   effectiveDist = min(normalDistance, sessionRange × MIN_FIB_GAP × MAX_CAP_RATIO)
//   where MIN_FIB_GAP=0.25 (smallest step in the fib array) and MAX_CAP_RATIO=0.5.
//   This prevents the wide Gold/NAS pip threshold from matching fib pairs that are
//   many fib-grid steps apart, keeping confluence counts in line with the indicator.

const _MIN_FIB_GAP   = 0.25;  // smallest gap between consecutive fib values (0→0.25→…)
const _MAX_CAP_RATIO = 0.50;  // Pine Script max_allowed_threshold_ratio

export function detectConfluencesCore(todayLevels, yesterdayLevels, {
  pipSize,
  normalDistance,
  tightDistance,
  mergeDistance,
  priceMode    = 'midpoint',
  clusterMerge = true,
  source        = null,
  sessionRange  = null,  // pass range.range to enable Pine Script distance cap
}) {
  // Cap confluence distance: Pine Script limits it to range × minFibGap × 0.5
  const effectiveDist = (sessionRange != null && sessionRange > 0)
    ? Math.min(normalDistance, sessionRange * _MIN_FIB_GAP * _MAX_CAP_RATIO)
    : normalDistance;

  function selectPrice(a, b) {
    if (priceMode === 'lowest')  return Math.min(a, b);
    if (priceMode === 'highest') return Math.max(a, b);
    return (a + b) / 2;
  }

  const rawPairs = [];
  for (const today of todayLevels) {
    for (const yesterday of yesterdayLevels) {
      const diff = Math.abs(today.price - yesterday.price);
      if (diff <= effectiveDist) {
        const sameFib = today.fib === yesterday.fib;
        const entry = {
          price:        selectPrice(today.price, yesterday.price),
          todayFib:     today.fib,
          yesterdayFib: yesterday.fib,
          pipDiff:      diff / pipSize,
          isTight:      diff <= tightDistance || sameFib,
        };
        if (source != null) entry.source = source;
        rawPairs.push(entry);
      }
    }
  }

  if (!rawPairs.length) return [];
  rawPairs.sort((a, b) => a.price - b.price);

  if (!clusterMerge) {
    // Pine Script mode: deduplicate only when two selected prices are < 0.1 pip apart
    const result = [];
    for (const p of rawPairs) {
      if (!result.some(r => Math.abs(r.price - p.price) < pipSize * 0.1)) {
        result.push({ ...p, density: 1 });
      }
    }
    return result;
  }

  // Dashboard mode: cluster merge — group rawPairs within mergeDistance of the
  // running cluster centre; each cluster becomes one level at the average price.
  const clusters = [];
  let bucket = [rawPairs[0]];

  for (let i = 1; i < rawPairs.length; i++) {
    const centre = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
    if (rawPairs[i].price - centre <= mergeDistance) {
      bucket.push(rawPairs[i]);
    } else {
      clusters.push(bucket);
      bucket = [rawPairs[i]];
    }
  }
  clusters.push(bucket);

  return clusters.map(cluster => {
    const price         = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
    const density       = cluster.length;
    const pipDiff       = Math.min(...cluster.map(p => p.pipDiff));
    const isTight       = cluster.some(p => p.isTight);
    const todayFibs     = [...new Set(cluster.map(p => p.todayFib))];
    const yesterdayFibs = [...new Set(cluster.map(p => p.yesterdayFib))];
    const entry = {
      price,
      todayFib:      todayFibs[0],
      yesterdayFib:  yesterdayFibs[0],
      todayFibs,
      yesterdayFibs,
      pipDiff,
      isTight,
      density,
    };
    if (source != null) entry.source = source;
    return entry;
  });
}

// Merge Asia and Monday confluence arrays into a single deduped list.
// Pairs from different sources that land within mergeDistance are collapsed
// into one level — the result gets crossSessionMatch:true and source:'cross'.
// Pairs from the same source that survived within-session clustering but are
// still within mergeDistance are also collapsed (prevents near-duplicate lines).
export function mergeCrossSessionConfs(asiaConfs, mondayConfs, { mergeDistance, priceMode = 'midpoint' }) {
  const tagged = [
    ...asiaConfs.map(c  => ({ ...c,  _src: 'asia'   })),
    ...mondayConfs.map(c => ({ ...c, _src: 'monday' })),
  ].sort((a, b) => a.price - b.price);

  if (!tagged.length) return [];

  const buckets = [];
  let bucket = [tagged[0]];

  for (let i = 1; i < tagged.length; i++) {
    const centre = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
    if (tagged[i].price - centre <= mergeDistance) {
      bucket.push(tagged[i]);
    } else {
      buckets.push(bucket);
      bucket = [tagged[i]];
    }
  }
  buckets.push(bucket);

  return buckets.map(b => {
    const { _src, ...solo } = b[0];
    if (b.length === 1) return solo;

    const srcs        = [...new Set(b.map(x => x._src))];
    const crossSession = srcs.length > 1;

    let price;
    if      (priceMode === 'lowest')  price = Math.min(...b.map(x => x.price));
    else if (priceMode === 'highest') price = Math.max(...b.map(x => x.price));
    else                              price = b.reduce((s, x) => s + x.price, 0) / b.length;

    // Use the tightest / densest entry as the structural base
    const best = b.reduce((prev, curr) => {
      if (curr.isTight && !prev.isTight) return curr;
      if (!curr.isTight && prev.isTight) return prev;
      return (curr.density || 1) >= (prev.density || 1) ? curr : prev;
    });
    const { _src: _t, ...bestRest } = best;

    const todayFibs     = [...new Set(b.flatMap(x => x.todayFibs     ?? (x.todayFib     != null ? [x.todayFib]     : [])))];
    const yesterdayFibs = [...new Set(b.flatMap(x => x.yesterdayFibs ?? (x.yesterdayFib != null ? [x.yesterdayFib] : [])))];

    return {
      ...bestRest,
      price,
      isTight:           b.some(x => x.isTight),
      density:           b.reduce((s, x) => s + (x.density || 1), 0),
      pipDiff:           Math.min(...b.map(x => x.pipDiff ?? Infinity)),
      crossSessionMatch: crossSession || b.some(x => x.crossSessionMatch),
      source:            crossSession ? 'cross' : bestRest.source,
      todayFibs:         todayFibs.length  ? todayFibs     : bestRest.todayFibs,
      yesterdayFibs:     yesterdayFibs.length ? yesterdayFibs : bestRest.yesterdayFibs,
      todayFib:          todayFibs[0]     ?? bestRest.todayFib,
      yesterdayFib:      yesterdayFibs[0] ?? bestRest.yesterdayFib,
    };
  });
}
