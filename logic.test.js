// Logic tests that need no browser: dates and weeks, CSV export, insights maths, question upload checks.
import { test, expect } from '@playwright/test';
import { dateKey, yesterdayKey, weekKey, weekdayIndex } from '../../util.js';
import { toCsv, presetRange, computeInsights, peopleCsv, feedbackCsv } from '../../admin.js';
import { normalizeItem, validatePack } from '../../validate.js';
import { fixProfile } from '../../store.js';

const at = (s) => new Date(s); // local time, like the app

test.describe('dates and Monday-to-Sunday weeks', () => {
  test('week starts on Monday for every day of the week', () => {
    for (const [day, monday] of [['2026-10-26', '2026-10-26'], ['2026-10-28', '2026-10-26'], ['2026-11-01', '2026-10-26'], ['2026-11-02', '2026-11-02']]) {
      expect(weekKey(at(`${day}T12:00:00`)), day).toBe(monday);
    }
  });
  test('around midnight', () => {
    expect(dateKey(at('2026-11-01T23:59:59'))).toBe('2026-11-01');
    expect(dateKey(at('2026-11-02T00:00:00'))).toBe('2026-11-02');
    expect(weekKey(at('2026-11-01T23:59:59'))).toBe('2026-10-26');
    expect(weekKey(at('2026-11-02T00:00:00'))).toBe('2026-11-02');
    expect(weekdayIndex(at('2026-11-01T23:59:59'))).toBe(6);
    expect(weekdayIndex(at('2026-11-02T00:00:00'))).toBe(0);
  });
  test('across months, years and leap days', () => {
    expect(weekKey(at('2026-12-31T10:00:00'))).toBe('2026-12-28');
    expect(weekKey(at('2027-01-03T10:00:00'))).toBe('2026-12-28');
    expect(weekKey(at('2027-01-04T10:00:00'))).toBe('2027-01-04');
    expect(weekKey(at('2026-03-01T10:00:00'))).toBe('2026-02-23');
    expect(yesterdayKey(at('2027-01-01T00:10:00'))).toBe('2026-12-31');
    expect(yesterdayKey(at('2028-03-01T09:00:00'))).toBe('2028-02-29');
    expect(yesterdayKey(at('2026-03-01T09:00:00'))).toBe('2026-02-28');
  });
  test('daylight-saving changes do not shift the week (Europe and US change dates)', () => {
    for (const d of ['2026-03-29T01:30:00', '2026-03-08T02:30:00', '2026-10-25T02:30:00', '2026-11-01T01:30:00']) {
      const k = weekKey(at(d));
      expect(at(`${k}T12:00:00`).getDay(), d).toBe(1);
    }
  });
  test('admin date presets', () => {
    expect(presetRange('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(presetRange('today', '2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(presetRange('last30', '2026-03-01')).toEqual({ from: '2026-01-31', to: '2026-03-01' });
    expect(presetRange('quarter', '2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-11-15' });
    expect(presetRange('quarter', '2027-01-02')).toEqual({ from: '2027-01-01', to: '2027-01-02' });
  });
});

test.describe('CSV export', () => {
  const parse = (csv) => { // a small CSV reader that follows the same rules as Excel
    const rows = [[]]; let cell = '', q = false;
    const s = csv.replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === ',') { rows.at(-1).push(cell); cell = ''; } else if (c === '\r' && s[i + 1] === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); i++; } else cell += c;
    }
    rows.at(-1).push(cell);
    return rows;
  };
  test('commas, quotes and line breaks survive the round trip', () => {
    const tricky = ['a,b', 'say "hi"', 'line one\nline two', 'cr\r\nlf', '', 'plain', 'émoji ✓'];
    const csv = toCsv([['Head'], ...tricky.map((t) => [t])]);
    expect(csv.startsWith('﻿')).toBe(true); // Excel needs this to read accents and symbols
    expect(parse(csv).slice(1).map((r) => r[0])).toEqual(tricky);
  });
  test('numbers stay numbers and empty values stay empty', () => {
    expect(toCsv([[1, 0, null, undefined, -5]])).toBe('﻿1,0,,,-5');
  });
  test('text that starts like a formula cannot run in Excel', () => {
    const rows = parse(toCsv([['=HYPERLINK("http://evil","x")'], ['+1+1'], ['-2+3'], ['@SUM(A1)'], ['\tTAB'], ['normal']]));
    for (const [v] of rows.slice(0, 5)) expect(v, v).not.toMatch(/^[=+\-@\t\r]/);
    expect(rows[5][0]).toBe('normal');
  });
  test('feedback export keeps every column even with missing fields', () => {
    const rows = parse(feedbackCsv([{ createdAt: 0, message: 'hello, "world"' }]));
    expect(rows[0]).toHaveLength(15);
    expect(rows[1]).toHaveLength(15);
    expect(rows[1][4]).toBe('hello, "world"');
  });
});

test.describe('insights maths', () => {
  const users = [
    { uid: 'a', fullName: 'Ann Lee', email: 'ann@databeat.io', coins: 120, signIns: 3, lastDay: '2026-10-28', streak: 2, played: { 'myth-or-fact': { plays: 2, correct: 10, total: 12, coins: 120 } },
      activity: { '2026-10-28': { r: 1, c: 6, t: 6, s: 80, g: { 'myth-or-fact': { r: 1, c: 6, t: 6, s: 80, pf: 1 } } }, '2026-09-01': { r: 1, c: 4, t: 6, s: 40, g: { 'myth-or-fact': { r: 1, c: 4, t: 6, s: 40, pf: 0 } } } } },
    { uid: 'b', name: 'Bo' }, // signed in on an old build: almost every field missing
    { uid: 'c', fullName: 'Old Player', played: { crossword: { plays: 1 } }, lastDay: '2026-05-01' } // played before daily records existed
  ];
  test('counts people and rounds in a range, and handles missing fields', () => {
    const r = computeInsights(users, { from: '2026-10-26', to: '2026-11-01' }, '2026-10-28');
    expect(r.kpi).toEqual({ signedIn: 3, totalSignIns: 3, activeRange: 1, active30: 1, neverPlayed: 1 });
    const mf = r.games.find((g) => g.id === 'myth-or-fact');
    expect(mf).toMatchObject({ players: 1, active: 1, rounds: 1, accuracy: 100, avgScore: 80, perfect: 1 });
    expect(r.people.find((p) => p.uid === 'b')).toMatchObject({ name: 'Bo', rounds: 0, accuracy: null, coins: 0, level: 1 });
  });
  test('all time uses lifetime totals', () => {
    const r = computeInsights(users, presetRange('all', '2026-10-28'), '2026-10-28', true);
    expect(r.games.find((g) => g.id === 'myth-or-fact').rounds).toBe(2);
    expect(r.people.find((p) => p.uid === 'a').rounds).toBe(2);
  });
  test('people export has one row per person', () => {
    const csv = peopleCsv(users, presetRange('week', '2026-10-28'), false, '2026-10-28');
    expect(csv.split('\r\n')).toHaveLength(4);
  });
});

test.describe('question uploads', () => {
  test('rejects bad items with a clear message', () => {
    expect(() => normalizeItem('acronym-decoder', { q: 'What is CPM?', options: ['a', 'b', 'c'], answer: 0, why: 'Because it is.' })).toThrow('needs exactly 4 options');
    expect(() => normalizeItem('myth-or-fact', { q: 'Statement here', answer: 'maybe', why: 'Because it is.' })).toThrow('answer must be "fact" or "myth"');
    expect(() => normalizeItem('myth-or-fact', { q: 'Statement here', answer: 'fact', why: 'Because it is.', hint: 'x'.repeat(201) })).toThrow('hint is too long');
    expect(() => normalizeItem('stack-sorter', { title: 'T', layers: ['A', 'B'], cards: [{ name: 'x', layer: 5 }, { name: 'y', layer: 0 }, { name: 'z', layer: 1 }, { name: 'w', layer: 1 }], why: 'Because it is.' })).toThrow('wrong layer number');
  });
  test('accepts a good pack and skips duplicates', () => {
    const good = { q: 'What does CPM stand for?', options: ['Cost per mille', 'Clicks per minute', 'Cost per month', 'Count per mile'], answer: 'Cost per mille', why: 'Mille means thousand.' };
    const v = validatePack('acronym-decoder', { items: [good, good] }, []);
    expect(v.valid).toHaveLength(1);
    expect(v.dups.length + v.errors.length).toBe(1);
    expect(v.valid[0].answer).toBe(0);
  });
});

test('old profiles get every newer field with a safe default', () => {
  const p = fixProfile({ name: 'Old', xp: 90, settings: { petMode: 'daily' } });
  expect(p.coins).toBe(90);
  expect(p.settings).toMatchObject({ petMode: 'daily', coach: true, textSize: 'standard', motion: true });
  for (const k of ['badges', 'activity', 'played', 'seenAll', 'replayBest', 'met', 'reported']) expect(p[k], k).toEqual({});
  expect(p.weekDays).toEqual([]);
  expect(p.spent).toBe(0);
});
