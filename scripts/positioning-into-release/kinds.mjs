// Classify FF event names with the desk's own newsKind (js/positioningIntoEvent.js), so the
// Python harness never carries a second copy of the regex table. stdin: JSON array of names.
import { newsKind } from '../../js/positioningIntoEvent.js';
let s = ''; process.stdin.on('data', d => s += d).on('end', () => {
  const names = JSON.parse(s); const out = {};
  for (const n of names) out[n] = newsKind(n);
  process.stdout.write(JSON.stringify(out));
});
