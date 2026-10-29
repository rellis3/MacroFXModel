// line-touch-limit-unseen: every line touch on the unseen pairs (forge/LINE_TOUCH_LIMIT_UNSEEN_PREREG.md).
// processPair from analysis/line_touch_response_study.mjs, unedited; only the output folder differs, and sessions
// after 2026-08-20 (the lockbox) are dropped.
//
//   node scripts/line-touch-limit-unseen/touches.mjs [pair ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

delete process.env.R2_ACCESS_KEY; delete process.env.R2_SECRET_KEY;   // local cache only
const { processPair } = await import('../../analysis/line_touch_response_study.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'analysis/output/line-touch-limit-unseen/response');
export const UNSEEN = ['audcad', 'audchf', 'audnzd', 'cadchf', 'eurcad', 'eurgbp', 'eurjpy', 'eurnzd', 'gbpaud',
  'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'nzdcad', 'nzdjpy', 'nzdusd', 'usdcad'];
const LAST = '2026-08-20';

fs.mkdirSync(OUT, { recursive: true });
const pairs = process.argv.slice(2).length ? process.argv.slice(2) : UNSEEN;
for (const p of pairs) {
  console.log(`${p.toUpperCase()}:`);
  const r = await processPair(p);
  if (!r) { console.log('  skipped'); continue; }
  const before = r.days.length;
  r.days = r.days.filter(d => d.date <= LAST);
  r.coverage = { from: r.days[0].date, to: r.days[r.days.length - 1].date, sessions: r.days.length, droppedAfterCut: before - r.days.length };
  fs.writeFileSync(path.join(OUT, `${p}-response.json`), JSON.stringify(r));
  console.log(`  kept ${r.days.length} sessions (${before - r.days.length} after ${LAST} dropped)`);
}
