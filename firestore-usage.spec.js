// Counts Firestore reads and writes for the main journeys, using the real (non-demo) data code with a stand-in
// Firebase library (tests/mock-firebase). Then checks that a normal day at 250 players fits the free plan.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { PACKS, answerQuiz } from '../helpers.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'counting once is enough');

const PLAYER = { uid: 'p1', email: 'player@databeat.io', emailVerified: true, displayName: 'Pat Player' };
const ADMIN = { uid: 'a1', email: 'boss@databeat.io', emailVerified: true, displayName: 'Ada Admin' };
const today = () => new Date().toISOString().slice(0, 10);
const userDoc = (i) => ({ name: `P${i}`, fullName: `Player ${i}`, email: `p${i}@databeat.io`, coins: 100 + i, tourDone: true, signIns: 3, lastSeen: Date.now(),
  played: { 'myth-or-fact': { plays: 3, correct: 12, total: 18, coins: 140 } }, seenAll: { 'myth-or-fact': ['t1', 't2'] },
  activity: { [today()]: { r: 1, c: 4, t: 6, s: 40, pf: 0, h: 0, g: { 'myth-or-fact': { r: 1, c: 4, t: 6, s: 40, pf: 0 } } } } });

async function boot(page, user, extraDocs = []) {
  await page.route('https://www.gstatic.com/firebasejs/**', async (r) => {
    const name = r.request().url().split('/').pop();
    r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(`tests/mock-firebase/${name}`, 'utf8') });
  });
  const docs = [
    ['config/admins', { emails: [ADMIN.email] }],
    ...Object.entries(PACKS).map(([g, items]) => [`packs/${g}`, { items, version: 1 }]),
    [`users/${PLAYER.uid}`, { name: 'Pat', fullName: 'Pat Player', email: PLAYER.email, coins: 50, tourDone: true, howSeen: Object.fromEntries(Object.keys(PACKS).map((g) => [g, true])), settings: { motion: false } }],
    [`users/${ADMIN.uid}`, { name: 'Ada', fullName: 'Ada Admin', email: ADMIN.email, coins: 10, tourDone: true }],
    ...extraDocs
  ];
  await page.addInitScript(({ user, docs }) => {
    window.__fakeUser = user;
    window.__fs = { docs: new Map(docs), reads: 0, writes: 0, deletes: 0, log: [] };
  }, { user, docs });
  await page.goto('/');
}
const settle = (page) => page.waitForTimeout(1200);
const take = (page) => page.evaluate(() => { const s = window.__fs; const r = { reads: s.reads, writes: s.writes, deletes: s.deletes, log: s.log.slice() }; s.reads = 0; s.writes = 0; s.deletes = 0; s.log = []; return r; });
const results = {};

test('player journeys', async ({ page }) => {
  await boot(page, PLAYER);
  await page.waitForSelector('.qhero'); await settle(page);
  results['Sign-in and first Home (empty browser cache)'] = await take(page);

  await page.evaluate(() => { location.hash = '#/card'; }); await page.waitForSelector('.grid4');
  await page.evaluate(() => { location.hash = '#/home'; }); await page.waitForSelector('.qhero'); await settle(page);
  results['Open Home again'] = await take(page);

  await page.evaluate(() => { location.hash = '#/game/myth-or-fact'; }); await page.waitForSelector('.hero'); await settle(page);
  await page.evaluate(() => { location.hash = '#/play/myth-or-fact'; });
  for (let i = 0; i < 6; i++) { await answerQuiz(page, i !== 2); await page.locator('.fb .btn').first().click(); }
  await page.waitForSelector('.result'); await settle(page);
  results['One played round (intro + 6 questions + results)'] = await take(page);

  await page.evaluate(() => { location.hash = '#/play/daily-warmup'; });
  for (let i = 0; i < 3; i++) { await answerQuiz(page, true); await page.locator('.fb .btn').first().click(); }
  await page.waitForSelector('.result'); await settle(page);
  results['Daily warm-up round'] = await take(page);

  await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForSelector('#nick');
  await page.locator('#s-liveTimer').click(); await settle(page);
  results['Change one setting'] = await take(page);
});

test('a returning player in a new browser session (cache warm)', async ({ page }) => {
  await boot(page, PLAYER);
  await page.waitForSelector('.qhero'); await settle(page); await take(page);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload(); await page.waitForSelector('.qhero'); await settle(page);
  results['Sign-in, later the same day (browser cache warm)'] = await take(page);
});

test('admin journeys with 250 players', async ({ page }) => {
  const players = Array.from({ length: 250 }, (_, i) => [`users/u${i}`, userDoc(i)]);
  await boot(page, ADMIN, players);
  await page.waitForSelector('.qhero'); await settle(page);
  results['Admin sign-in and Home'] = await take(page);
  await page.evaluate(() => { location.hash = '#/admin/insights'; }); await page.waitForSelector('.kpis'); await settle(page);
  results['Admin opens Insights (250 players)'] = await take(page);
  await page.evaluate(() => { location.hash = '#/admin/reports'; }); await settle(page);
  await page.evaluate(() => { location.hash = '#/admin/insights'; }); await page.waitForSelector('.kpis'); await settle(page);
  results['Admin opens Insights again within 10 minutes'] = await take(page);
  await page.evaluate(() => { location.hash = '#/admin/people'; }); await page.waitForSelector('text=Players (252)'); await settle(page);
  results['Admin opens People'] = await take(page);
  await page.evaluate(() => { location.hash = '#/admin/browse'; }); await page.waitForSelector('.tbl'); await settle(page);
  results['Admin opens Question browser'] = await take(page);
});

test.afterAll(() => {
  const n = (k) => results[k] || { reads: 0, writes: 0 };
  // A normal day: every player signs in once with a fresh cache, opens Home 3 more times, plays the warm-up and 3 rounds,
  // changes one setting; 5 admins sign in, open Insights twice, People, Reports and the Question browser once.
  const P = 250, A = 5;
  const reads = P * (n('Sign-in and first Home (empty browser cache)').reads + 3 * n('Open Home again').reads + 3 * n('One played round (intro + 6 questions + results)').reads + n('Daily warm-up round').reads)
    + A * (n('Admin sign-in and Home').reads + n('Admin opens Insights (250 players)').reads + n('Admin opens Insights again within 10 minutes').reads + n('Admin opens People').reads + n('Admin opens Question browser').reads);
  const writes = P * (n('Sign-in and first Home (empty browser cache)').writes + 3 * n('One played round (intro + 6 questions + results)').writes + n('Daily warm-up round').writes + n('Change one setting').writes)
    + A * (n('Admin sign-in and Home').writes);
  const day = { reads, writes, limitReads: 50000, limitWrites: 20000 };
  fs.mkdirSync('tests/reports', { recursive: true });
  fs.writeFileSync('tests/reports/firestore-usage.json', JSON.stringify({ results, day }, null, 2));
  console.table(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { reads: v.reads, writes: v.writes, deletes: v.deletes }])));
  console.log('Normal day at 250 players:', day);
  expect(reads).toBeLessThan(50000);
  expect(writes).toBeLessThan(20000);
});
