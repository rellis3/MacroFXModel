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

export function detectConfluencesCore(todayLevels, yesterdayLevels, {
  pipSize,
  normalDistance,
  tightDistance,
  mergeDistance,
  priceMode    = 'midpoint',
  clusterMerge = true,
  source        = null,
}) {
  function selectPrice(a, b) {
    if (priceMode === 'lowest')  return Math.min(a, b);
    if (priceMode === 'highest') return Math.max(a, b);
    return (a + b) / 2;
  }

  const rawPairs = [];
  for (const today of todayLevels) {
    for (const yesterday of yesterdayLevels) {
      const diff = Math.abs(today.price - yesterday.price);
      if (diff <= normalDistance) {
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
