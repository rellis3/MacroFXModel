import { appendRows, buildRow, resolveDue, scoreRows, logKey, readRange } from './vumanchuLogger.js';
let pass=0, fail=0;
const ok=(c,l)=>{ if(c) pass++; else { fail++; console.log('  FAIL '+l); } };

// in-memory kv
const store=new Map();
const kv={ get:async k=>store.get(k)??null, put:async(k,v)=>{store.set(k,v);} };
const T0=1767225600;  // 2026-01-01T00:00:00Z

ok(logKey(T0*1000)==='vmlog_2026-01-01','logKey is one key per UTC day');

const mk=(inst,ts,read,prior,price,delta=2.9)=>buildRow({
  instrument:inst, slotTs:ts, price, sigma:0.0002, priorMove:prior, horizon:60,
  state:{stackZone:-1,per:{1:{code:'OS/fall'},5:{code:'OS/fall'},15:{code:'OS/fall'}}},
  hit:{matched:'L2',cell:'OS|OS|OS',n:6129,deltaPP:delta,pRevert:0.547,baseline:0.517},
  verdict:{read}});

// idempotent append
// gold: a real FADE. eurusd: a NONE read WITH a real prior move (so it is
// scorable). nzdusd: a genuinely flat bar, which must be skipped.
const rows=[mk('gold',T0,'FADE',-0.004,3600), mk('eurusd',T0,'NONE',-0.004,1.10),
            mk('nzdusd',T0,'NONE',0.0000001,0.60)];
let r=await appendRows(kv,rows,{now:T0*1000});
ok(r.added===3,'append: writes all rows');
r=await appendRows(kv,rows,{now:T0*1000});
ok(r.added===0,'append: same slot twice is deduped (cron double-fire safe)');
r=await appendRows(kv,[mk('gold',T0+300,'FADE',-0.004,3601)],{now:T0*1000});
ok(r.added===1,'append: a new slot is added');

// resolution
const all=JSON.parse(store.get('vmlog_2026-01-01'));
const prices={ gold:{[T0+3600]:3630, [T0+300+3600]:3590}, eurusd:{[T0+3600]:1.101},
               nzdusd:{[T0+3600]:0.601} };
const priceAt=async(i,ts)=>prices[i]?.[ts] ?? null;
let res=await resolveDue(all,priceAt,{now:(T0+7200)*1000});
ok(res.resolved===3 && res.skipped===1, `resolve: 3 scored, 1 flat-skipped (got ${res.resolved}/${res.skipped})`);
const gold=all.find(x=>x.instrument==='gold'&&x.slotTs===T0);
ok(gold.reverted===true,'resolve: prior down + forward up = reverted');
ok(gold.correct===true,'resolve: FADE was correct when it reverted');
const gold2=all.find(x=>x.slotTs===T0+300);
ok(gold2.reverted===false && gold2.correct===false,'resolve: FADE wrong when it continued');
const flat=all.find(x=>x.instrument==='nzdusd');
ok(flat.skipped==='flat','resolve: sub-0.5sigma prior move is excluded, matching the lab');
ok(flat.correct===undefined,'resolve: a skipped row is never scored');
const eur=all.find(x=>x.instrument==='eurusd');
ok(eur.correct===null,'resolve: a NONE read resolves its outcome but scores no hit');

// not-yet-due and unpriceable stay pending
const pend=[mk('gold',T0+99999,'FADE',-0.004,3600)];
ok((await resolveDue(pend,priceAt,{now:(T0+7200)*1000})).pending===1,'resolve: future rows stay pending');
const nop=[mk('nq',T0,'FADE',-0.004,20000)];
ok((await resolveDue(nop,priceAt,{now:(T0+7200)*1000})).pending===1,'resolve: unpriceable row stays pending, never scored on a stale quote');
ok(nop[0].resolved===false,'resolve: unpriceable row is not marked resolved');

// scoring
const sc=scoreRows(all);
ok(sc.scored===2,'score: NONE reads resolve but do not enter the hit rate');
ok(sc.hitPct===50,'score: 1 of 2 correct = 50%');
ok(sc.claimedBaselinePct===51.7,'score: reports the baseline the table claimed');
ok(sc.edgePP===-1.7,'score: edge is hit minus claimed baseline, not minus 50');
ok(sc.expectedPP===2.9,'score: surfaces what the table promised');
ok(sc.noiseBandPP>50,'score: at n=2 the noise band is enormous and says so');
ok(sc.byRead.NONE.n===1 && sc.byRead.NONE.resolved===0,
   'score: NONE reads are counted and their revert rate shown, but never scored as hits');
ok(sc.byRead.NONE.revertPct!==null,'score: NONE bucket still reports what price did');

console.log(`\nvumanchuLogger: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
