import assert from 'node:assert/strict';
import { deskRead, TERMS } from './deskRead.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const row = (key, change, kind = 'price', z = 1) => ({ key, change, kind, z });
const sect = (key, label, change) => ({ key, label, change });
const full = () => ({
  state: { state: 'Narrow and concentrated', quiet: false, alternatives: [{ name: 'Rates are driving', met: 3, total: 4 }],
    breadth: { leader: { label: 'Technology', change: 8.2 }, laggard: { label: 'Materials', change: -7.2 },
      sectorsUp: 2, sectorsTotal: 11, concentration: -5.5 } },
  board: [row('tips', 24, 'rate'), row('bei', 1, 'rate'), row('us10y', 26, 'rate'), row('us2y', 52, 'rate'),
          row('curve', -26, 'gap'), row('vixterm', 0, 'level')],
  sectors: [sect('xlre', 'Real estate', -6.0), sect('xlu', 'Utilities', -5.9), sect('xlf', 'Financials', -4.0)],
  confirmations: { met: 3, total: 4, items: [
    { label: 'Gold should be lower — it pays no interest', ok: true, got: '-6.4%' },
    { label: 'The Nasdaq should lag the S&P — its earnings sit furthest out', ok: false, got: '+4.0pts' },
    { label: 'Real estate should lag', ok: true, got: '-6.0%' },
    { label: 'Utilities should lag', ok: true, got: '-5.9%' }] },
  findings: [], links: [], book: null,
});

t('the read leads with breadth, because an index and its members are different markets', () => {
  const r = deskRead(full());
  assert.equal(r.paragraphs[0].id, 'state');
  assert.match(r.paragraphs[0].text, /Narrow and concentrated/);
  assert.match(r.paragraphs[0].text, /2 of 11 sectors are rising/);
  assert.match(r.paragraphs[0].text, /average share is lagging the index by 5\.5 points/);
});

t('it names what KIND of rate move it is, which changes what everything downstream means', () => {
  const r = deskRead(full());
  const d = r.paragraphs.find(p => p.id === 'driver');
  assert.match(d.text, /it is a real one/);
  assert.match(d.text, /96% of that is the real yield/);
  assert.match(d.text, /front end is doing more of the work/);
  // and the opposite case reads as the opposite trade, not as the same sentence
  const infl = full(); infl.board = [row('tips', 2, 'rate'), row('bei', 24, 'rate'), row('us10y', 26, 'rate')];
  assert.match(deskRead(infl).paragraphs.find(p => p.id === 'driver').text, /inflation move rather than a growth one/);
});

t('an abstract rates move is landed on actual businesses', () => {
  const r = deskRead(full()).paragraphs.find(p => p.id === 'landed');
  assert.match(r.text, /Real estate -6\.0%/);
  assert.match(r.text, /a bank.s margin is the gap between what it borrows at and what it lends at/);
});

t('the thing that did NOT follow gets its own paragraph', () => {
  const r = deskRead(full()).paragraphs.find(p => p.id === 'disobeyed');
  assert.ok(r, 'a 3-of-4 mechanism must surface its failure');
  assert.match(r.text, /3 of 4/);
  assert.match(r.text, /\+4\.0pts/);
  assert.match(r.text, /the exception is the story/);
  assert.match(r.text, /the Nasdaq should lag the S&P/, 'proper nouns must survive -- an earlier version lowercased them');
  // a mechanism that landed completely has no such paragraph to write
  const clean = full(); clean.confirmations = { met: 4, total: 4, items: clean.confirmations.items.map(i => ({ ...i, ok: true })) };
  assert.equal(deskRead(clean).paragraphs.some(p => p.id === 'disobeyed'), false);
});

t('it never predicts, in any paragraph, on any input', () => {
  const inputs = [full(), { ...full(), confirmations: null }, {}];
  for (const inp of inputs) for (const p of deskRead(inp).paragraphs) {
    assert.doesNotMatch(p.text, /\b(will|should rise|should fall|expect .* to|target|buy|sell|short|long the)\b/i,
      `predicted: ${p.text}`);
    assert.doesNotMatch(p.text, /\b(bullish|bearish)\b/i);
  }
});

t('a quiet board gets a short honest read, not a padded one', () => {
  const r = deskRead({ state: { quiet: true }, board: [], sectors: [] });
  assert.equal(r.empty, true);
  assert.equal(r.paragraphs.length, 1);
  assert.match(r.paragraphs[0].text, /stories get invented/);
});

t('range is only claimed where a validated trigger is actually firing', () => {
  const noInv = deskRead(full());
  assert.doesNotMatch(noInv.paragraphs.map(p => p.text).join(' '), /bigger days/);
  const inv = full(); inv.board = [...inv.board.filter(b => b.key !== 'vixterm'), row('vixterm', 0, 'level')];
  inv.board.find(b => b.key === 'vixterm').last = -2.1;
  const w = deskRead(inv).paragraphs.find(p => p.id === 'watch');
  assert.match(w.text, /validated range trigger/);
  assert.match(w.text, /not a direction/);
});

t('jargon it actually used is returned for definition, and nothing it did not', () => {
  const r = deskRead(full());
  assert.ok(r.terms.includes('real yield'), 'the read says "real yield" and must offer to define it');
  assert.ok(r.terms.includes('breakevens'));
  assert.ok(!r.terms.includes('dispersion'), 'it never mentioned dispersion');
  for (const k of r.terms) assert.ok(TERMS[k] && TERMS[k].length > 60, `${k} needs a real definition`);
});

t('missing inputs drop their sentence instead of printing a gap', () => {
  for (const bad of [{}, { board: null }, { state: null, sectors: null, board: null }]) {
    const r = deskRead(bad);
    assert.ok(r.paragraphs.length >= 1);
    for (const p of r.paragraphs) {
      assert.doesNotMatch(p.text, /undefined|NaN|null|\[object/);
      assert.ok(p.text.trim().length > 20);
    }
  }
});

console.log(`deskRead: ${n} groups, all passed`);
