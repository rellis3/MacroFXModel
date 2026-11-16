// js/cbLatestMeeting.test.mjs: the newest analysed meeting wins, never a re-analysis of an older one.
// node js/cbLatestMeeting.test.mjs
import assert from 'node:assert/strict';
import { latestAnalysisByMeeting } from './cbLatestMeeting.js';

const BOE = [{ date: '2026-07-30' }, { date: '2026-09-17' }, { date: '2026-11-05' }, { date: '2026-12-17' }];
const store = {
  'summary_2026-07-30': { kind: 'summary', meetingDate: '2026-07-30', generatedAt: '2026-11-10' },
  'summary_2026-09-17': { kind: 'summary', meetingDate: '2026-09-17', generatedAt: '2026-11-15' },   // re-analysed last: the old pointer rule picked this
  'summary_2026-11-05': { kind: 'summary', meetingDate: '2026-11-05', generatedAt: '2026-11-11' },
  'transcript_2026-11-05': { kind: 'transcript', meetingDate: '2026-11-05' },
};
const get = async (k, d) => store[`${k}_${d}`] ?? null;
const now = Date.parse('2026-11-16T15:00:00Z');

const a = await latestAnalysisByMeeting({ meetings: BOE, kindsOrder: ['summary', 'report', 'transcript'], get, nowMs: now });
assert.equal(a.meetingDate, '2026-11-05', 'the 5 Nov decision, not the older meeting that was re-analysed last');
assert.equal(a.kind, 'summary', 'the headline document first');

// only a transcript for the newest meeting: still that meeting
const only = { 'transcript_2026-11-05': store['transcript_2026-11-05'], 'summary_2026-09-17': store['summary_2026-09-17'] };
const b = await latestAnalysisByMeeting({ meetings: BOE, kindsOrder: ['summary', 'report', 'transcript'], get: async (k, d) => only[`${k}_${d}`] ?? null, nowMs: now });
assert.equal(b.meetingDate, '2026-11-05'); assert.equal(b.kind, 'transcript');

// a future meeting is never chosen; nothing analysed gives null
const c = await latestAnalysisByMeeting({ meetings: BOE, kindsOrder: ['summary'], get: async () => null, nowMs: now });
assert.equal(c, null);
const d = await latestAnalysisByMeeting({ meetings: BOE, kindsOrder: ['summary'], get: async (k, dt) => ({ meetingDate: dt }), nowMs: now });
assert.equal(d.meetingDate, '2026-11-05', 'December is in the future');

// the window limits how far back it looks
const e = await latestAnalysisByMeeting({ meetings: BOE, kindsOrder: ['summary'], get: async (k, dt) => (dt === '2026-07-30' ? { meetingDate: dt } : null), nowMs: now, window: 2 });
assert.equal(e, null);
console.log('cbLatestMeeting: ok');
