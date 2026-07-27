// OI PASTE CONTRACT — the regression oracle for the CME QuikStrike paste path.
//   node js/oiPasteContract.test.mjs
//
// WHY THIS EXISTS. The OI analyser was reviewed four times and passed every time,
// because every review checked the code against itself. The parser was internally
// consistent and the math (`oiCalcMaxPain`) was correct — it just ran on the wrong
// expiry, anchored to a garbage futures price, and produced plausible-looking
// levels. Broken and working were indistinguishable from the inside.
//
// So this file asserts against an EXTERNAL reference: real EUR/USD pastes captured
// 2026-07-24/27 (`js/fixtures/`) and the levels the C.OG vendor card displayed for
// the same data. If a change here stops reproducing the vendor's numbers, that is a
// regression regardless of how reasonable the code looks.
//
// The prior test file (`oiMatrix.test.mjs`) missed all of this because every fixture
// in it is an index or gold price ABOVE 50 — the exact guard that fails on FX.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseOIMatrix, oiParseTable, oiCalcMaxPain, pickPrimaryExpiry, resolveSmileExpiry,
  parseIVSettlement, oiMatrixTermStructure } from './oi.js';
import { oiStoreToLevels } from './oiConfluence.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = n => readFileSync(join(HERE, 'fixtures', n), 'utf8');

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

const MATRIX = fx('oi-eurusd-heatmap-matrix.txt');          // full 18-expiry heatmap, as pasted
const SETTLE = fx('oi-eurusd-mo4n6-settlements.txt');       // MO4N6 per-strike chain, as pasted

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE VENDOR ORACLE — the C.OG card for MO4N6, 2026-07-24 settles.
//    Card showed, in FUTURES terms: call wall 1.1450 · put wall 1.1450 · max pain 1.1450.
//    These three numbers are ground truth. Reproducing them is the whole point.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[vendor oracle — MO4N6 settlements chain reproduces the C.OG card]');
{
  const iv = parseIVSettlement(SETTLE);
  ok('settlements chain parses', !!iv && iv.strikes.length === 41, `${iv?.strikes.length} strikes`);

  const K = iv.strikes, C = iv.calls, P = iv.puts;
  const wall = arr => K[arr.indexOf(Math.max(...arr))];

  ok('CARD: max pain  = 1.1450', near(oiCalcMaxPain(K, C, P), 1.1450, 1e-9), oiCalcMaxPain(K, C, P).toFixed(4));
  ok('CARD: call wall = 1.1450', near(wall(C), 1.1450, 1e-9), wall(C).toFixed(4));
  ok('CARD: put wall  = 1.1450', near(wall(P), 1.1450, 1e-9), wall(P).toFixed(4));

  // The per-strike OI is present and correct in this paste — it must not be discarded.
  ok('per-strike OI carried through (1.1450 → 419C / 480P)',
    C[K.indexOf(1.1450)] === 419 && P[K.indexOf(1.1450)] === 480);

  // The title line carries the LIVE futures price and the real DTE. The course
  // (education/open-interest-course-notes.md L212) requires the CURRENT futures
  // price for the basis, not the settle — so this must be read, not ignored.
  ok('DTE read from the title line', iv.dte === 0.20, `${iv.dte}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FX ANCHOR — the bug that poisoned everything downstream.
//    Header carries `1.13965` (6EU6). The old guard required a header number > 50,
//    so it skipped 1.13965 and parsed `74` out of the text "74 DTE".
// ─────────────────────────────────────────────────────────────────────────────
console.log('[FX futures anchor — must not be scavenged from a "N DTE" label]');
{
  const m = parseOIMatrix(MATRIX);
  // Row count varies with WHICH expiry is selected (strikes empty in that column are
  // dropped), so assert the ladder is real rather than pinning a number that would
  // just re-encode today's choice.
  ok('matrix parses into a real strike ladder', !!m && m.strikes.length >= 40,
    `${m?.strikes.length} strikes, ${Math.min(...m.strikes)}–${Math.max(...m.strikes)}`);
  ok('futures price is the FX rate, not a DTE label', near(m.futures, 1.13965, 1e-9), `${m.futures}`);
  ok('futures price is NOT 74 (the "74 DTE" token)', m.futures !== 74);
  ok('futures price is NOT 6 (parseFloat of the contract code "6EU6")', m.futures !== 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXPIRY SELECTION — the course's rule (L487): "nearest expiration with
//    significant liquidity", scored on NEAR-THE-MONEY OI so far-dated tail hedges
//    can't win. With a broken anchor, near-money OI computed as 0 for all 18
//    columns and the code silently fell back to biggest-total-OI — picking the
//    39-DTE September monthly, which is exactly the distortion the rule exists
//    to prevent.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[expiry selection — near-money scoring must actually run]');
{
  const m = parseOIMatrix(MATRIX);
  ok('an expiry was selected', !!m.primaryExpiry);
  ok('near-money OI is non-zero (scoring ran, no silent fallback)',
    m.primaryExpiry.nearOI > 0, `nearOI=${m.primaryExpiry.nearOI}`);
  ok('did NOT pick the 39-DTE tail-hedge column by total OI',
    m.primaryExpiry.dte !== 39, `dte=${m.primaryExpiry.dte}`);
  ok('picked the near-money-liquid expiry (11 DTE for this fixture)',
    m.primaryExpiry.dte === 11, `dte=${m.primaryExpiry.dte}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE SILENT FALLBACK — a broken anchor must fail loudly, not switch scoring
//    method and return a confident answer. This is the failure MODE that made the
//    bug invisible for months, so it gets its own assertion.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[no silent degradation on a bad anchor]');
{
  const lines = MATRIX.split('\n');
  const hdr = lines.findIndex(l => {
    const c = l.split('\t').map(s => s.trim()).filter(Boolean);
    return c.length >= 4 && c.every(x => x === 'C' || x === 'P');
  });
  const dtes = [];
  for (let i = 0; i < hdr; i++) {
    const mm = lines[i].match(/(-?\d+)\s*DTE/g);
    if (mm) for (const t of mm) dtes.push(parseInt(t, 10));
  }
  const rows = [];
  for (let i = hdr + 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    const s = parseFloat((c[0] || '').replace(/,/g, ''));
    if (!Number.isFinite(s) || s <= 0) continue;
    const cp = [];
    for (let j = 1; j < c.length; j += 2) {
      const a = parseFloat((c[j] || '').replace(/,/g, '')), b = parseFloat((c[j + 1] || '').replace(/,/g, ''));
      cp.push([Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0]);
    }
    rows.push({ strike: s, cp });
  }
  const bad = pickPrimaryExpiry(rows, dtes, 74);        // the poisoned anchor
  ok('a nonsensical anchor is reported, not silently absorbed',
    bad.anchorValid === false, `anchorValid=${bad.anchorValid}`);
  const good = pickPrimaryExpiry(rows, dtes, 1.13965);  // the real one
  ok('a valid anchor scores near-money OI', good.nearOI > 0 && good.anchorValid === true,
    `nearOI=${good.nearOI}`);
  // A bad anchor must DEGRADE GRACEFULLY, not switch scoring rule. It falls back to
  // the median strike (a real ATM proxy) and still scores on near-money OI, so it
  // recovers the same expiry — while `anchorValid:false` tells the caller to warn.
  // The old code instead switched to biggest-total-OI and picked the 39-DTE column.
  ok('a poisoned anchor still scores on near-money OI (no rule switch)',
    bad.scoredOn === 'nearMoneyOI', `scoredOn=${bad.scoredOn}`);
  ok('graceful recovery: poisoned anchor lands on the same expiry as the valid one',
    bad.dte === good.dte, `${bad.dte} vs ${good.dte}`);
  ok('and it is NOT the old wrong answer (39 DTE)', bad.dte !== 39, `dte=${bad.dte}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FULL-MATRIX PRESERVATION — the paste holds 18 expiries; the term structure
//    must expose all of them. (Storage previously kept only the selected column,
//    silently discarding 17/18 of every daily capture.)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[full matrix retained — all expiries reachable]');
{
  const ts = oiMatrixTermStructure(MATRIX, 1);
  ok('term structure covers the populated expiries', ts.length >= 15, `${ts.length} expiries`);
  ok('near expiries present (1 DTE)', ts.some(r => r.dte === 1));
  ok('far expiries present (74 DTE)', ts.some(r => r.dte === 74));
  ok('per-expiry max pain differs across the curve (not one collapsed number)',
    new Set(ts.map(r => r.maxPain)).size > 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FORMAT SAFETY — a settlements chain pasted into the OI box must be REJECTED
//    or routed, never column-guessed. Previously it survived only because <2 rows
//    happened to pass; on a day with more positive Call-Chg values it would have
//    silently produced strikes around 0.07.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[format safety — no column guessing on a settlements paste]');
{
  const out = oiParseTable(SETTLE);
  const guessed = out && out.strikes.some(s => s < 0.5);
  ok('settlements paste never yields sub-0.5 "strikes"', !guessed,
    out ? `min strike ${Math.min(...out.strikes)}` : 'rejected');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. LIVE SMILE-EXPIRY HINT — resolvable from the pastes ALONE, so it can fire on
//    paste instead of costing a full Analyse-save-Analyse round trip. Analyse and
//    the live hint call the SAME function, so they can never disagree.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[live smile hint — resolves from pastes, no save required]');
{
  const TERM = fx('oi-eurusd-settlements-term.txt');

  const h = resolveSmileExpiry(MATRIX, TERM);
  ok('hint resolves from OI + Settlements alone', !!h && !!h.code, `${h?.code}`);
  ok('hint names the expiry the WALLS came from (11 DTE → EUUQ6)',
    h.code === 'EUUQ6', `${h.code}`);
  ok('matched by CODE, not by DTE arithmetic', h.matchedOn === 'code', `matchedOn=${h.matchedOn}`);
  ok('hint carries the expiry date for the paste', !!h.date, `${h.date}`);

  // A DTE match would have silently resolved 11 DTE to TU1Q6 (11 DTE by the Settlements
  // table's own reckoning) — the wrong contract, with nothing to indicate it. Code
  // matching gets EUUQ6 right regardless of how each table counts days.
  ok('code match survives the two tables counting DTE differently',
    h.code === 'EUUQ6' && h.matchedDte === 14 && h.dte === 11,
    `heatmap ${h.dte} DTE vs table ${h.matchedDte} DTE, still ${h.code}`);

  // STALENESS IS A DATE QUESTION, NOT A DTE-DIFF QUESTION. The Settlements table is
  // published per settlement and its DTE counts from that settle date; the heatmap
  // counts from today. Midweek they differ by 1, over a weekend by 3. Comparing the
  // two numbers flagged every Monday as stale (a real false positive on live data).
  // The expiry DATE is absolute, so the table's own as-of date is recoverable from it.
  ok('table as-of date recovered from the absolute expiry date',
    h.tableAsOf === '2026-07-24', `${h.tableAsOf}`);
  ok('no clock supplied → no staleness claim', h.tableStaleDays === null);
  ok('a Monday reading Friday settles is NOT stale (<= 4 days)', (() => {
    const x = resolveSmileExpiry(MATRIX, TERM, { now: Date.UTC(2026, 6, 27) });  // Mon 27 Jul
    return x.tableStaleDays === 3;
  })(), '3 days = normal weekend lag');
  ok('a genuinely old table IS stale', (() => {
    const x = resolveSmileExpiry(MATRIX, TERM, { now: Date.UTC(2026, 7, 3) });   // Mon 3 Aug
    return x.tableStaleDays === 10 && x.tableStaleDays > 4;
  })(), '10 days');

  // The heatmap header alone now yields the code (no Settlements table needed for
  // the hint itself — the table only adds the human-readable expiry date).
  ok('OI alone → DTE + code, but no date', (() => {
    const x = resolveSmileExpiry(MATRIX, '');
    return x && x.dte === 11 && x.code === 'EUUQ6' && x.date === null;
  })());
  ok('neither input → null (no misleading hint)', resolveSmileExpiry('', '') === null);

  // The Settlements table is auto-detected in box 1 too — the hint must still work
  // for anyone who pastes it there rather than into its own box.
  ok('term structure found in the smile box as well', (() => {
    const x = resolveSmileExpiry(MATRIX, '', { rawIV: TERM });
    return x && x.code === 'EUUQ6';
  })());

  // ── The smile box's OWN expiry, so the hint can compare instead of assuming ──
  // Reopening the modal repopulates the smile box from storage, so "box is non-empty"
  // proves nothing about WHICH expiry it holds. The first version of the hint hid
  // itself whenever the box had a chain, which meant pasting a fresh OI/Settlements
  // table showed nothing at all (reported 2026-07-27). The code comparison is what
  // makes the three states — matches / wrong expiry / unknown — distinguishable.
  const TITLE = 'EUR/USD (EUU|6E) EUUQ6 (10.88 DTE) vs 1.14065 (+0.00125) - Settles';
  ok('smile expiry code read from a real title line', (() => {
    const x = parseIVSettlement(TITLE + '\n' + SETTLE.split('\n').slice(1).join('\n'));
    return x?.expiryCode === 'EUUQ6';
  })(), 'EUUQ6');
  ok('live futures + fractional DTE read from the same line', (() => {
    const x = parseIVSettlement(TITLE + '\n' + SETTLE.split('\n').slice(1).join('\n'));
    return x?.futures === 1.14065 && x?.dte === 10.88;
  })());
  ok('a titleless smile chain yields no code (hint must not assume it matches)', (() => {
    const noTitle = SETTLE.split('\n').slice(1).join('\n');
    const x = parseIVSettlement(noTitle);
    return x && x.strikes.length >= 2 && x.expiryCode === null;
  })());
  ok('smile code and required code are comparable (mismatch is detectable)', (() => {
    const x = parseIVSettlement(SETTLE);                       // MO4N6 fixture
    const req = resolveSmileExpiry(MATRIX, TERM);              // walls on EUUQ6
    return x.expiryCode === 'MO4N6' && req.code === 'EUUQ6' && x.expiryCode !== req.code;
  })());

  // A partial/garbage paste must not throw — this runs on every keystroke.
  ok('partial paste does not throw', (() => {
    for (const junk of ['1.14', 'Strike\tC\tP', '\t\t\t', MATRIX.slice(0, 200)]) {
      try { resolveSmileExpiry(junk, junk); } catch { return false; }
    }
    return true;
  })());
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. WALL SELECTION — compute once in the modal, let the export and the bot filter.
//    Replaces a hard `topWalls = 2` cap that silently dropped everything past the
//    two biggest per side (it hid EUR/USD's largest put strike from the indicator).
//    A wall must be BOTH relatively outsized (the 3× tier) and absolutely meaningful
//    (a share of the biggest wall on its side) — tier alone lets deep-OTM tail hedges
//    in, because out there the neighbouring strikes are empty.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[wall selection — tier AND size, not a fixed count]');
{
  const inst = {
    maxPain: 1.1550,
    callWall: 1.1425, putWall: 1.1400,
    callWalls: [
      { strike: 1.1600, oi: 6867, tier: 'strong' },     // real
      { strike: 1.1500, oi: 3525, tier: 'moderate' },   // real
      { strike: 1.2450, oi: 1808, tier: 'strong' },     // tail hedge: 3x vs empty neighbours
      { strike: 1.3000, oi: 745,  tier: 'strong' },     // tail hedge
      { strike: 1.1425, oi: 376,  tier: null },         // the headline wall — trivially small
    ],
    putWalls: [
      { strike: 1.1400, oi: 12020, tier: 'strong' },
      { strike: 1.1450, oi: 8173,  tier: 'moderate' },
      { strike: 1.1300, oi: 7608,  tier: 'moderate' },  // biggest all-expiry put — was dropped by the cap
      { strike: 1.1050, oi: 2442,  tier: 'strong' },    // tail hedge
    ],
  };
  const at = (lv, t) => lv.filter(l => l.type === t).map(l => l.price).sort((a, b) => a - b);

  const lv = oiStoreToLevels(inst);
  ok('more than the old 2 walls per side survive', at(lv, 'put_wall').length >= 3,
    at(lv, 'put_wall').join(' '));
  ok('the biggest put strike is exported (the reported miss)', at(lv, 'put_wall').includes(1.1300));
  ok('deep-OTM tail hedges are NOT walls', !at(lv, 'call_wall').includes(1.2450) && !at(lv, 'call_wall').includes(1.3000),
    at(lv, 'call_wall').join(' '));
  ok('a trivially small HEADLINE wall is not dressed as a wall', !at(lv, 'call_wall').includes(1.1425));
  ok('real walls both sides', at(lv, 'call_wall').join() === '1.15,1.16' && at(lv, 'put_wall').join() === '1.13,1.14,1.145',
    `calls ${at(lv, 'call_wall')} | puts ${at(lv, 'put_wall')}`);

  // Never blank an instrument out: a thin chain with nothing tiered still yields the
  // top 2, so raising the bar can't silently remove all of a pair's levels.
  const thin = { putWalls: [{ strike: 1.10, oi: 40, tier: null }, { strike: 1.09, oi: 30, tier: null }] };
  ok('thin chain falls back to the top 2 rather than emitting nothing',
    at(oiStoreToLevels(thin), 'put_wall').length === 2);

  // Back-compat: an explicit count still means exactly that (bots/tests that ask).
  ok('explicit topWalls still caps at that count',
    at(oiStoreToLevels(inst, { topWalls: 2 }), 'put_wall').length <= 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SOFT NEAR-MONEY WINDOW — relevance scaled by the reference move, not a
//    hard percentage. Gold's biggest call OI (8,008 at 5,370) was abandoned paper
//    31% above spot on a contract expiring next day; it outranked the real wall
//    purely on size. A hard cutoff fixes that but is knife-edge: ±7.5% put the
//    boundary at 4,397 and ±7.6% at 4,400, flipping the answer by 100 points.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[soft near-money window — scaled by the reference move]');
{
  const spot = 4079, refMove = { move: 103.3, source: 'implied' };   // gold, implied
  const inst = {
    spot, refMove,
    callWall: 4300, putWall: 4000,
    callWalls: [
      { strike: 5370, oi: 8008, tier: 'strong' },     // 31% out, expiring tomorrow
      { strike: 5350, oi: 8001, tier: 'strong' },
      { strike: 4300, oi: 3188, tier: 'strong' },     // the real one
      { strike: 4150, oi: 2829, tier: 'moderate' },
    ],
    putWalls: [{ strike: 4000, oi: 4171, tier: 'strong' }, { strike: 3200, oi: 2000, tier: 'strong' }],
  };
  const at = (lv, t) => lv.filter(l => l.type === t).map(l => l.price).sort((a, b) => a - b);
  const lv = oiStoreToLevels(inst);

  ok('abandoned deep-OTM OI is excluded despite being the LARGEST',
    !at(lv, 'call_wall').includes(5370) && !at(lv, 'call_wall').includes(5350),
    at(lv, 'call_wall').join(' '));
  ok('the real near-money wall survives', at(lv, 'call_wall').includes(4300));
  ok('far put paper excluded too', !at(lv, 'put_wall').includes(3200), at(lv, 'put_wall').join(' '));

  // No cliff: nudging the scale must not flip the answer, which a hard cutoff did.
  const near = k => at(oiStoreToLevels({ ...inst, refMove }, { nearK: k }), 'call_wall').join(',');
  ok('a small change in the window scale does not flip the result',
    near(2.4) === near(2.5) && near(2.5) === near(2.6), `${near(2.4)} | ${near(2.6)}`);

  // Must degrade, never blank: no spot/refMove ⇒ weight 1 ⇒ size-only ranking.
  ok('no refMove → falls back to size-only, still returns walls',
    at(oiStoreToLevels({ ...inst, refMove: null, spot: null }), 'call_wall').length > 0);

  // A wider reference move (higher vol / longer DTE) must admit more distant walls —
  // the whole point of scaling rather than hard-coding a percentage.
  ok('a wider reference move reaches further out', (() => {
    const wide = oiStoreToLevels({ ...inst, refMove: { move: 600, source: 'flat-vol' } });
    return at(wide, 'call_wall').includes(5370);
  })());
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
