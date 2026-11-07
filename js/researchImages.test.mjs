import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sniffMime, validateUpload, MAX_BYTES, newImageId, isImageId, r2Key, imageUrl, visionPrompt, validateReading, readingText,
  emptyIndex, putImage, findImage, imageRecord, parseAttach, attachment, resolveAttach, picturesText, caseImages, PICTURES_HEADER, MAX_PER_MESSAGE,
} from './researchImages.js';
import { newCase, appendRound, caseText, roundSections, headSections } from './researchCase.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2]);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1');

test('sniffMime and validateUpload: only png, jpeg and webp, the bytes must match the type, within the size', () => {
  assert.equal(sniffMime(PNG), 'image/png'); assert.equal(sniffMime(JPG), 'image/jpeg'); assert.equal(sniffMime(WEBP), 'image/webp');
  assert.equal(sniffMime(Buffer.from('%PDF-1.4 hello world')), null);
  assert.deepEqual(validateUpload({ contentType: 'image/png', buf: PNG }), { ok: true, mime: 'image/png', ext: 'png' });
  assert.equal(validateUpload({ contentType: 'image/jpeg; charset=binary', buf: JPG }).ext, 'jpg');
  assert.equal(validateUpload({ contentType: 'image/jpg', buf: JPG }).ok, true);
  assert.equal(validateUpload({ contentType: 'image/webp', buf: WEBP }).ext, 'webp');
  assert.equal(validateUpload({ contentType: 'application/pdf', buf: PNG }).status, 415);
  assert.equal(validateUpload({ contentType: 'image/svg+xml', buf: Buffer.from('<svg/>') }).status, 415, 'no SVG (script inside an image)');
  assert.equal(validateUpload({ contentType: 'image/png', buf: JPG }).status, 415, 'a JPEG labelled PNG is refused');
  assert.equal(validateUpload({ contentType: 'image/png', buf: Buffer.alloc(0) }).status, 400);
  const big = Buffer.alloc(MAX_BYTES + 1); PNG.copy(big);
  assert.equal(validateUpload({ contentType: 'image/png', buf: big }).status, 413);
});

test('ids, keys and urls', () => {
  const id = newImageId('2026-11-06', 1_700_000_000_000, 0.5);
  assert.ok(isImageId(id), id);
  assert.ok(!isImageId('img-../../etc')); assert.ok(!isImageId('case-2026-11-06-x')); assert.ok(!isImageId(null));
  assert.equal(r2Key(id, 'jpg'), `research/images/${id}.jpg`);
  assert.equal(imageUrl(id), `/api/research-pod/image?id=${id}`);
});

test('visionPrompt carries the question and asks for exact transcription; validateReading keeps the four parts', () => {
  const p = visionPrompt({ context: 'Is EURUSD stretched?' });
  assert.match(p, /Is EURUSD stretched\?/); assert.match(p, /"extracted"/); assert.match(p, /digit for digit/); assert.match(p, /not verified/);
  assert.match(visionPrompt(), /not written the question yet/);
  assert.equal(validateReading(null).ok, false); assert.equal(validateReading([]).ok, false);
  assert.equal(validateReading({ extracted: ['x'] }).ok, false, 'a reading with no description fails');
  const v = validateReading({ description: 'A 4H EURUSD chart from TradingView', extracted: ['Instrument: EURUSD', { label: 'Level', value: 1.085 }, '', 7], observations: 'From the picture: above the 200 line', uncertain: null });
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.extracted, ['Instrument: EURUSD', 'label: Level, value: 1.085', '7']);
  assert.deepEqual(v.value.observations, ['From the picture: above the 200 line']); assert.deepEqual(v.value.uncertain, []);
  const t = readingText(v.value);
  assert.match(t, /^What it is: A 4H EURUSD chart/); assert.match(t, /Transcribed from the picture:\n- Instrument: EURUSD/); assert.match(t, /Read from the picture \(not verified\)/);
  assert.doesNotMatch(t, /Unreadable/);
});

const reading = { description: 'A table of Sharpe ratios', extracted: ['Row 1: Sharpe 1.42'], observations: ['From the picture: the best row is carry'], uncertain: ['Row 3 is cut off'] };
const rec = (id, r = reading) => imageRecord({ id, ext: 'jpg', mime: 'image/jpeg', bytes: 1000, stored: 'memory', reading: r, model: 'claude-sonnet-5', at: '2026-11-06T10:00:00Z' });

test('the index: newest first, replace by id, capped', () => {
  let ix = emptyIndex();
  for (let i = 0; i < 5; i++) ix = putImage(ix, rec(`img-2026-11-06-aaaa${i}`), 3);
  assert.deepEqual(ix.images.map(x => x.id), ['img-2026-11-06-aaaa4', 'img-2026-11-06-aaaa3', 'img-2026-11-06-aaaa2']);
  ix = putImage(ix, rec('img-2026-11-06-aaaa3', { ...reading, description: 'changed' }), 3);
  assert.equal(ix.images[0].id, 'img-2026-11-06-aaaa3'); assert.equal(ix.images.length, 3);
  assert.equal(findImage(ix, 'img-2026-11-06-aaaa3').reading.description, 'changed');
  assert.equal(findImage(null, 'img-2026-11-06-aaaa3'), null);
  assert.match(rec('img-2026-11-06-bbbb1').text, /Sharpe 1.42/);
});

test('parseAttach and resolveAttach: ids or { id, text }, at most six, unknown ids fail, the corrected text wins', () => {
  assert.deepEqual(parseAttach(undefined), { ok: true, items: [] });
  assert.equal(parseAttach('x').ok, false);
  assert.equal(parseAttach(Array.from({ length: MAX_PER_MESSAGE + 1 }, (_, i) => `img-2026-11-06-cccc${i}`)).ok, false);
  assert.equal(parseAttach(['../secret']).ok, false);
  const p = parseAttach(['img-2026-11-06-aaaa1', { id: 'img-2026-11-06-aaaa1' }, { id: 'img-2026-11-06-aaaa2', text: '  fixed  ' }]);
  assert.deepEqual(p.items, [{ id: 'img-2026-11-06-aaaa1', text: null }, { id: 'img-2026-11-06-aaaa2', text: 'fixed' }]);
  const ix = putImage(putImage(emptyIndex(), rec('img-2026-11-06-aaaa1')), rec('img-2026-11-06-aaaa2'));
  assert.equal(resolveAttach(ix, ['img-2026-11-06-zzzz9']).ok, false);
  const r = resolveAttach(ix, ['img-2026-11-06-aaaa1', { id: 'img-2026-11-06-aaaa2', text: 'Row 1: Sharpe 1.24 (the model misread it)' }]);
  assert.equal(r.ok, true);
  assert.equal(r.attachments[0].edited, false); assert.match(r.attachments[0].text, /Sharpe 1.42/); assert.equal(r.attachments[0].url, '/api/research-pod/image?id=img-2026-11-06-aaaa1');
  assert.equal(r.attachments[1].edited, true); assert.equal(r.attachments[1].text, 'Row 1: Sharpe 1.24 (the model misread it)');
  assert.deepEqual(r.attachments[1].reading, reading, 'the vision model\'s reading is kept beside the correction');
  // sending the unchanged text back is not an edit
  assert.equal(attachment(rec('img-2026-11-06-aaaa1'), rec('img-2026-11-06-aaaa1').text).edited, false);
});

test('picturesText and caseImages', () => {
  assert.equal(picturesText([]), '');
  const a = [attachment(rec('img-2026-11-06-aaaa1')), attachment(rec('img-2026-11-06-aaaa2'), 'corrected')];
  const t = picturesText(a);
  assert.ok(t.startsWith(PICTURES_HEADER)); assert.match(t, /Picture 1 \(img-2026-11-06-aaaa1\)/); assert.match(t, /Picture 2 \(img-2026-11-06-aaaa2, reading corrected by the owner\):\ncorrected/);
  const c = { images: [{ id: 'q1' }, { id: 'q2' }], rounds: [{ images: [{ id: 'r1' }] }, {}, { images: [{ id: 'r3' }, { id: 'q1' }] }], pending: { images: [{ id: 'p1' }] } };
  assert.deepEqual(caseImages(c).map(x => x.id), ['p1', 'q1', 'r3', 'r1', 'q2']);
  assert.deepEqual(caseImages(c, 2).map(x => x.id), ['p1', 'q1']);
  assert.deepEqual(caseImages({}), []);
});

test('a case carries its pictures into the round prompts and the Head\'s case text', () => {
  const qa = [attachment(rec('img-2026-11-06-aaaa1'))], ra = [attachment(rec('img-2026-11-06-aaaa2', { ...reading, extracted: ['Level 1.0850 resistance'] }))];
  let c = newCase({ id: 'case-x', question: 'What does this table say about carry?', date: '2026-11-06', images: qa });
  assert.equal(c.images.length, 1);
  assert.ok(!('images' in newCase({ id: 'y', question: 'q', date: '2026-11-06' })), 'no pictures: no field');
  c = appendRound(c, { owner: c.question, answers: { quant: { headline: 'h', proposals: [] } } });
  assert.ok(!('images' in c.rounds[0]));
  c = appendRound(c, { owner: 'And this chart?', answers: { quant: { headline: 'h2', proposals: [] } }, images: ra });
  assert.equal(c.rounds[1].images[0].id, 'img-2026-11-06-aaaa2');
  const t = caseText(c);
  assert.match(t, /Question \(2026-11-06\): What does this table say about carry\?\nPictures the owner attached/);
  assert.match(t, /The owner: And this chart\?\nPictures the owner attached[^\n]*\nPicture 1 \(img-2026-11-06-aaaa2\):\nWhat it is: A table/);
  assert.match(t, /Level 1.0850 resistance/);
  const rs = roundSections(c, 'macro', { ownerMessage: 'Look again', images: ra });
  assert.match(rs.at(-1)[1], /^Look again\n\nPictures the owner attached/);
  assert.equal(roundSections(c, 'macro', { ownerMessage: 'plain' }).at(-1)[1], 'plain');
  const hs = headSections(c);
  assert.match(hs.find(s => /whole case/.test(s[0]))[1], /Sharpe 1.42/);
});
