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

// ── multi-horizon outcomes ───────────────────────────────────────────────────
{
  const r2 = buildRow({ instrument:'gold', slotTs:T0, price:3600, sigma:0.0002,
                        priorMove:-0.004, horizon:60, horizons:[15,60,240],
                        state:{stackZone:-1,per:{}}, hit:{deltaPP:2.9,baseline:0.517},
                        verdict:{read:'FADE'} });
  ok(Array.isArray(r2.horizons) && r2.horizons.length===3,
     'buildRow carries every horizon it will be scored at');

  const px = { gold: { [T0+15*60]:3590, [T0+60*60]:3630, [T0+240*60]:3700 } };
  const pAt = async (i,ts)=>px[i]?.[ts] ?? null;

  // only 15m has elapsed
  const res = await resolveDue([r2], pAt, { now:(T0+20*60)*1000 });
  ok(!!r2.outcomes[15] && !r2.outcomes[60], 'resolves ONLY the horizons that have elapsed');
  ok(r2.resolved===false, 'headline flag waits for the headline horizon');
  ok(res.pending===1, 'row stays pending while later horizons are open');
  ok(r2.outcomes[15].reverted===false, '15m: prior down, forward down -> continued');
  ok(r2.outcomes[15].correct===false, '15m: FADE was wrong there');

  // now 60m and 240m
  await resolveDue([r2], pAt, { now:(T0+300*60)*1000 });
  ok(!!r2.outcomes[60] && !!r2.outcomes[240], 'later horizons fill in on a subsequent pass');
  ok(r2.outcomes[60].reverted===true && r2.outcomes[240].reverted===true,
     'the SAME read scores differently by horizon — the whole reason for logging several');
  ok(r2.resolved===true && r2.correct===true, 'headline horizon mirrored to the top level');
  ok(r2.fwdMove===r2.outcomes[60].fwdMove, 'top-level fields mirror the headline horizon exactly');

  // an already-scored horizon is never rewritten
  const before = JSON.stringify(r2.outcomes[15]);
  await resolveDue([r2], async()=>9999, { now:(T0+900*60)*1000 });
  ok(JSON.stringify(r2.outcomes[15])===before,
     'a scored outcome is immutable — no quiet re-scoring once the answer is known');

  // per-horizon scoring
  const s15 = scoreRows([r2], 15), s240 = scoreRows([r2], 240);
  ok(s15.scored===1 && s15.hitPct===0, 'scoreRows(15) scores the 15m outcome');
  ok(s240.scored===1 && s240.hitPct===100, 'scoreRows(240) scores the 240m outcome');
  ok(scoreRows([r2]).hitPct===100, 'scoreRows() with no horizon keeps the old headline behaviour');

  // path capture
  const r3 = buildRow({ instrument:'gold', slotTs:T0, price:100, sigma:0.0002,
                        priorMove:-0.004, horizon:15, horizons:[15],
                        state:{}, hit:{}, verdict:{read:'FADE'} });
  const pathAt = async ()=>({ mfe:0.02, mae:-0.005, tMfeMin:7 });
  await resolveDue([r3], async()=>101, { now:(T0+3600)*1000, pathAt });
  ok(r3.outcomes[15].mfe===0.02 && r3.outcomes[15].tMfeMin===7,
     'path capture records MFE and WHEN — "right way first, then reversed" is now answerable');
  ok(Math.abs(r3.outcomes[15].mfeSigma - 0.02/(0.0002*Math.sqrt(15))) < 1e-9,
     'excursions are sigma-normalised the same way the lab did');
}

console.log(`\nvumanchuLogger: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
