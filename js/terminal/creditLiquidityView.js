/**
 * Desk Terminal, Macro tab: "Credit & liquidity" (HTML). Numbers come from js/creditLiquidityCore.js (/api/credit-liquidity); this lays them out
 * with the terminal's own classes and tokens only (themeTokens.test.mjs forbids a hard-coded colour). Drawings: js/terminal/boardViz.js.
 *
 * Reading rules kept visible on the board: stress up = red/gold, easier = green; a z-score of 0 is a normal year, not a forecast. The gate's
 * verdicts (long / short / blocked) are NOT shown, only the three z-scores it reads, and the pulse's next-day correlation is shown as measured (~0).
 */
import { ordinal } from './ordinal.js';
import { describe, csiTone } from '../creditLiquidityCore.js';
import { arcGauge, pctRails, glowLine, esc as vEsc, fin } from './boardViz.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';
import { dailyChip } from './timeframePills.js';

const sg = (v, d = 2) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);

const ZTONE = { up: 'var(--up)', dn: 'var(--dn)', gold: 'var(--gold)', pur: 'var(--pur2)' };
/** A diverging bar from a centre line: value on [-max, max]; stress-up tone for the credit rows, plain direction for liquidity. */
export function zBar(label, v, { max = 3, hot = 'dn', cool = 'up', title = '' } = {}) {
  if (!fin(v)) return `<div class="bv-zrow"><span class="bv-zl">${vEsc(label)}</span><span class="muted">–</span></div>`;
  const w = Math.min(50, Math.abs(v) / max * 50), pos = v >= 0;
  return `<div class="bv-zrow" title="${vEsc(title)}"><span class="bv-zl">${vEsc(label)}</span><div class="bv-zt"><i class="bv-zf" style="left:${pos ? 50 : 50 - w}%;width:${w}%;background:${ZTONE[pos ? hot : cool] ?? 'var(--flat)'}"></i><b class="bv-zc"></b></div><span class="mono bv-zv">${sg(v)}</span></div>`;
}

/** The credit-only part of the index: the mean of its two credit legs (the third leg is the VIX). null without both. */
export function creditOnly(k) { return fin(k?.quality) && fin(k?.credit) ? Math.round(((k.quality + k.credit) / 2) * 100) / 100 : null; }
/** Which leg drives the index: 'vix' when the VIX leg alone carries it (the credit legs are below a normal year while the index is above). */
export function csiDriver(c) {
  const k = c?.components ?? {}, cr = creditOnly(k);
  if (!fin(c?.value) || !fin(k.vix) || cr == null) return null;
  return c.value > 0.35 && cr < 0 && k.vix > 1 ? 'vix' : null;
}

function csiCard(cl, ice) {
  const c = cl.csi, k = c.components ?? {}, cr = creditOnly(k), drv = csiDriver(c);
  // the ICE option-adjusted spreads (Credit spreads card) against the Moody's legs here: they can disagree, and the reader should see it
  const iceTop = (ice?.rows ?? []).filter(r => fin(r.pctile1y) && r.pctile1y >= 90).map(r => r.label);
  const gauge = arcGauge({ value: c.value, min: -3, max: 3, label: 'Stress index', sub: `as of ${c.asOf}`, w: 260,
    zones: [{ from: -3, to: -1, tone: 'up' }, { from: -1, to: 1, tone: 'flat' }, { from: 1, to: 2, tone: 'gold' }, { from: 2, to: 3, tone: 'dn' }],
    ticks: [{ v: -2, label: '−2' }, { v: 0, label: '0' }, { v: 1, label: '1' }, { v: 2, label: '2' }] });
  const line = glowLine((c.series ?? []).map(p => p.v), { w: 300, h: 70, zeroLine: true, tone: 'var(--pur2)', label: 'The Credit Stress Index over three years' });
  return `<div class="card"><div class="ch"><span class="lbl">Credit Stress Index (credit spreads + the VIX)</span><span class="r"><span class="chip ${csiTone(c.value)}">${esc2(c.word)}</span></span></div>
<div class="bv-two"><div>${gauge}</div><div>
${zBar('Quality slope (Baa − Aaa)', k.quality, { title: 'How much more investment-grade-low companies pay than the best' })}${zBar('Credit spread (Baa − 10Y)', k.credit, { title: 'What a Baa company pays over the 10-year Treasury' })}${zBar('Equity fear (VIX)', k.vix, { title: 'The VIX' })}
<div class="bv-zrow" style="margin-top:6px"><span class="bv-zl"><b>Credit legs only</b></span><span class="mono bv-zv">${sg(cr)}</span></div>
${drv === 'vix' ? '<p class="bv-note"><b>The VIX leg drives this reading.</b> The two credit legs sit below a normal year; the index is above it because of the VIX.</p>' : ''}${iceTop.length && cr != null && cr < 0 ? `<p class="bv-note">The ICE option-adjusted spreads on the Credit spreads card below are at the top of their year (${esc2(iceTop.join(', '))}); the Moody's Baa measures here are not. The two families disagree.</p>` : ''}
<p class="muted bv-note">A stress index with an equity-fear leg, not a pure credit measure. Each bar is a 1-year rolling z-score of the same daily series (0 = a normal year); the index is their equal-weight average. Past 1 is stretched, past 2 is stressed.</p></div></div>
${line ? `<div class="bv-cap">Three years, about weekly</div>${line}` : ''}</div>`;
}
const esc2 = vEsc;

function spreadCard(cl) {
  const s = cl.spread; if (!s) return '';
  const rails = pctRails([
    { label: 'Baa − 10Y, 5 years', value: `${s.bp}bp`, pct: s.pct5y, pct2: s.pct20y },
    s.pct20y != null ? { label: 'Baa − 10Y, 20 years', value: `${s.bp}bp`, pct: s.pct20y } : null,
    s.quality?.pct5y != null ? { label: 'Quality slope, 5 years', value: `${s.quality.bp}bp`, pct: s.quality.pct5y, pct2: s.quality.pct20y } : null,
  ].filter(Boolean), { w: 520 });
  const line = glowLine(s.spark, { w: 300, h: 64, tone: 'var(--gold)', label: 'Baa minus 10-year Treasury, one year' });
  return `<div class="card"><div class="ch"><span class="lbl">Baa over the 10-year Treasury</span><span class="r muted">${dailyChip('daily data')} ${esc2(s.asOf)}</span></div>
<div class="bv-big"><span class="mono">${s.bp}bp</span><span class="mono ${s.chg20d > 0 ? 'dn' : s.chg20d < 0 ? 'up' : ''}">${s.chg20d != null ? `${sg(s.chg20d, 0)}bp / 20d` : ''}</span><span class="mono muted">${s.chg5d != null ? `${sg(s.chg5d, 0)}bp / 5d` : ''}</span></div>
${rails}${line ? `<div class="bv-cap">One year, weekly</div>${line}` : ''}
<p class="muted bv-note">Moody's Baa yield minus the 10-year Treasury, daily back to the 1980s: a long-history stand-in for credit spreads (the ICE option-adjusted series on the Credit spreads card below only reaches 2023). The dashed tick is the 20-year percentile where the 5-year one is drawn.</p></div>`;
}

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'XAU'];
function globalCard(cl) {
  const g = cl.g4, n = cl.net;
  const line = g ? glowLine((g.history ?? []).map(p => p.v), { w: 300, h: 74, zeroLine: true, tone: 'var(--blue)', label: 'Global central-bank liquidity, three years' }) : '';
  const per = g?.perCcy ? CCYS.filter(c => fin(g.perCcy[c])).map(c => zBar(c, g.perCcy[c], { max: 2, hot: 'up', cool: 'dn', title: `${c}'s central-bank liquidity, standardised` })).join('') : '';
  return `<div class="card"><div class="ch"><span class="lbl">Global liquidity</span><span class="r">${g?.phase ? `<span class="chip ${/fall/i.test(g.phase) ? 'dn' : /ris/i.test(g.phase) ? 'up' : ''}">${esc2(String(g.phase).toLowerCase())}</span>` : ''} <span class="muted">${esc2(g?.asOf ?? '')}</span></span></div>
${g ? `<div class="bv-stats"><div><span class="lbl">Level</span><div class="mono bv-kv">${sg(g.level)}</div></div><div><span class="lbl">Impulse</span><div class="mono bv-kv">${sg(g.impulse)}</div></div><div><span class="lbl">Cycle</span><div class="mono bv-kv">${sg(g.cycle)}</div></div><div><span class="lbl">Net liquidity pct</span><div class="mono bv-kv">${n?.pct != null ? `${ordinal(n.pct)}` : '–'}</div></div></div>${line}
<div class="bv-cap">By central bank (standardised)</div>${per}` : '<p class="muted">Global liquidity is not loaded yet.</p>'}
<p class="muted bv-note">Fed, ECB, BoJ and a PBoC proxy, converted to dollars and standardised. Level = how much liquidity there is; impulse = how fast it is changing. Net liquidity (the Fed's balance sheet less the Treasury's cash and reverse repo) sits on the Fed liquidity card below${n?.chg13w != null ? `: ${sg(n.chg13w, 0)}bn in 13 weeks` : ''}.</p></div>`;
}

function gateCard(cl) {
  const z = cl.gateZ, p = cl.pulse; if (!z && !p) return '';
  return `<div class="card"><div class="ch"><span class="lbl">Liquidity conditions and the settlement pulse</span><span class="r muted">${esc2(z?.asOf ?? '')}</span></div>
${z ? `${zBar('Net liquidity momentum', z.netliq, { max: 2, hot: 'up', cool: 'dn', title: 'The z-score the liquidity gate reads' })}${zBar('Curve (10Y − 2Y)', z.curve, { max: 2, hot: 'up', cool: 'dn', title: 'The z-score the liquidity gate reads' })}${zBar('US high-yield spread (ICE)', fin(z.credit) ? -z.credit : null, { max: 2, hot: 'dn', cool: 'up', title: 'The ICE US high-yield option-adjusted spread (FRED BAMLH0A0HYM2), 1-year z; positive = wider than a normal year. Not the Moody\'s Baa-Aaa slope on the Stress index card, which is why the two numbers differ.' })}
<p class="muted bv-note">The three 1-year (252-day) z-scores the old liquidity gate combined. The credit one is the ICE US high-yield spread, shown so that positive = wider (more stress); the Stress index card's quality slope is the Moody's Baa-Aaa, a different series. They are shown as conditions; the gate's own long / short / blocked verdicts are a trade filter and are not displayed.</p>` : ''}
${p ? `<div class="bv-cap">The TGA / reverse-repo settlement pulse</div><div class="bv-stats"><div><span class="lbl">Days</span><div class="mono bv-kv">${p.n}</div></div><div><span class="lbl">Same-day corr</span><div class="mono bv-kv">${sg(p.corrSameDay)}</div></div><div><span class="lbl">Next-day corr</span><div class="mono bv-kv">${sg(p.corrNextDay)}</div></div><div><span class="lbl">Next-day up</span><div class="mono bv-kv">${p.hitRateNextDay != null ? `${Math.round(p.hitRateNextDay * 100)}%` : '–'}</div></div></div>
<p class="muted bv-note">The change in Treasury cash and reverse repo on settlement days against Nasdaq: correlations near zero and a next-day hit rate of about a coin flip. Measured here as it is; it does not predict the next day.</p>` : ''}</div>`;
}

/** The whole board. cl = /api/credit-liquidity. h = { esc } (unused: kept for the call shape the other boards use). */
export function boardHtml(cl, extra = {}) {
  const head = `<div class="sec"><h2>Credit &amp; liquidity</h2><span class="lbl">how stretched credit is and how much central-bank liquidity there is · long history · context, not a signal</span></div>`;
  if (!cl?.ok) return `<div class="sfc" data-surface="panel.macro.creditliq">${head}<div class="card"><p class="muted">${esc2(cl?.error ?? 'not loaded yet')}. The credit and liquidity cards above stand on their own.</p></div></div>`;
  const say = describe(cl);
  const ev = [
    chipFor('macro-confluence-baa-credit', 'Tightening Baa credit and the next day of risk-on pairs: tested, no edge.'),
    chipFor('net-liquidity-tailwind-spx', 'Rising net liquidity and the next four weeks of stocks: within noise on 15 years.'),
    chipFor('funding-stress', 'A funding-stress reading and what follows: tested, null.'),
  ].filter(Boolean).join('');
  const stamp = `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${ev}<span class="muted">Context, not a signal: these describe how tight money is today. None of them has been shown to call the next move, so none is turned into a lean.</span></div>`;
  const links = ownerOnly(` ${ownerLink('credit-stress.html', 'Credit stress page')} · ${ownerLink('liquidity-pulse.html', 'Liquidity pulse page')} · ${ownerLink('global-liquidity.html', 'Global liquidity page')}.`);
  return `<div class="sfc" data-surface="panel.macro.creditliq">${head}
${say ? `<div class="card bv-say"><p>${esc2(say)}</p></div>` : ''}
<div class="grid g2" style="margin-top:14px">${csiCard(cl, extra.E?.['credit-board']?.ok ? extra.E['credit-board'] : null)}${spreadCard(cl)}</div>
<div class="grid g2" style="margin-top:14px">${globalCard(cl)}${gateCard(cl)}</div>
<p class="muted bv-note" style="margin-top:8px">${links}</p>${stamp}</div>`;
}
