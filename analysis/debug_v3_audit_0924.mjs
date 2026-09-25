// Run v3's REAL 2026-09-24 trades through the rewritten audit function
// directly, to see exactly which match/mismatch and why -- pivoting from
// the abstract "backtest daily total" chase to the concrete comparison the
// owner actually wants: real v3 trades vs the honest backtest, per trade.
import { auditVoteAtlasDrift, normalizeTradeHistoryForVoteAtlasAudit } from '../js/voteAtlasDriftAudit.js';

const raw = [{"position_id":42603456,"symbol":"AUDJPY","direction":"SELL","lots":2.63,"open_price":111.098,"close_price":110.856,"profit":403.18,"swap":0,"commission":0,"time_open":1790222043,"time_close":1790226081,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"},
{"position_id":42607836,"symbol":"AUDJPY","direction":"SELL","lots":3.06,"open_price":110.838,"close_price":111.113,"profit":-533.04,"swap":0,"commission":0,"time_open":1790226057,"time_close":1790229745,"tz_offset_sec":10800,"comment":"VA3[downp75_1]","date":"2026-09-24"},
{"position_id":42607493,"symbol":"AUDUSD","direction":"SELL","lots":3.07,"open_price":0.70232,"close_price":0.70397,"profit":-506.55,"swap":0,"commission":0,"time_open":1790225895,"time_close":1790241277,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"},
{"position_id":42617358,"symbol":"EURCHF","direction":"SELL","lots":3.21,"open_price":0.93738,"close_price":0.93901,"profit":-634.84,"swap":0,"commission":0,"time_open":1790244745,"time_close":1790245839,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"},
{"position_id":42617536,"symbol":"USDCHF","direction":"SELL","lots":2.95,"open_price":0.82305,"close_price":0.82479,"profit":-622.5,"swap":0,"commission":0,"time_open":1790245026,"time_close":1790245841,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"},
{"position_id":42618619,"symbol":"UK100","direction":"BUY","lots":11.1,"open_price":10733.3,"close_price":10686.3,"profit":-691.11,"swap":0,"commission":0,"time_open":1790246613,"time_close":1790248462,"tz_offset_sec":10800,"comment":"VA3[upp50_1]","date":"2026-09-24"},
{"position_id":42614851,"symbol":"US500","direction":"SELL","lots":18.21,"open_price":7692.3,"close_price":7666.1,"profit":477.1,"swap":0,"commission":0,"time_open":1790240144,"time_close":1790253487,"tz_offset_sec":10800,"comment":"VA3[downp50_2]","date":"2026-09-24"},
{"position_id":42619621,"symbol":"DE40","direction":"SELL","lots":4.39,"open_price":25223.9,"close_price":25344.1,"profit":-599.64,"swap":0,"commission":0,"time_open":1790248306,"time_close":1790256117,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"},
{"position_id":42623700,"symbol":"US500","direction":"SELL","lots":20.37,"open_price":7665.9,"close_price":7691.8,"profit":-527.58,"swap":0,"commission":0,"time_open":1790253497,"time_close":1790268422,"tz_offset_sec":10800,"comment":"VA3[downp75_1]","date":"2026-09-24"},
{"position_id":42583342,"symbol":"UK100","direction":"BUY","lots":12.8,"open_price":10710.7,"close_price":10756.9,"profit":782.89,"swap":-32.13,"commission":0,"time_open":1790189362,"time_close":1790277486,"tz_offset_sec":10800,"comment":"VA3[downp50_2]","date":"2026-09-24"},
{"position_id":42624015,"symbol":"US2000","direction":"SELL","lots":32.11,"open_price":2826.495,"close_price":2842.05,"profit":-499.47,"swap":0,"commission":0,"time_open":1790253884,"time_close":1790278865,"tz_offset_sec":10800,"comment":"VA3[downp50_1]","date":"2026-09-24"}];

const normalized = normalizeTradeHistoryForVoteAtlasAudit(raw, 'VA3');
console.log('normalized:', JSON.stringify(normalized, null, 2));

const report = await auditVoteAtlasDrift(normalized, { minMargin: 3 });
console.log('\n=== REPORT ===');
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
console.log('\n=== PER-TRADE RESULTS ===');
for (const r of report.results) console.log(JSON.stringify(r));
