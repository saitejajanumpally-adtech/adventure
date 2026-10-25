// Rules: AdCoins, perfect bonus, replays, no repeats, daily and weekly bonuses, floor goal, level vs balance.
import { test, expect } from '@playwright/test';
import { openApp, watchErrors, profile, readProfile, playQuiz, answerQuiz, nextQuestion, useHint, balance, PACKS } from '../helpers.js';

// Every badge already earned, so badge rewards do not blur the scoring numbers.
const ALL_BADGES = { first: 1, flawless: 1, fire: 1, pals: 1, allround: 1, yield: 1 };
const base = (over = {}) => profile({ badges: ALL_BADGES, ...over });
const WED = new Date('2026-10-28T10:00:00'); // a Wednesday; its week starts Monday 2026-10-26

test.beforeEach(async ({ page }) => { await page.clock.install({ time: WED }); });

test('new questions: 10 per correct answer, +20 for a perfect round', async ({ page }) => {
  const w = watchErrors(page);
  await openApp(page, { profile: base(), hash: '#/play/myth-or-fact' });
  await playQuiz(page, [true, true, true, true, true, true]);
  const p = await readProfile(page);
  expect(p.coins).toBe(80);
  expect(p.perfectRounds).toBe(1);
  await expect(page.locator('.result h1')).toHaveText('Perfect round');
  w.expectNone();
});

test('a wrong answer: no perfect bonus', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/acronym-decoder' });
  await playQuiz(page, [true, false, true, true, false, true]);
  expect((await readProfile(page)).coins).toBe(40);
});

test('a hinted answer earns half and the round is never perfect', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/acronym-decoder' });
  await useHint(page);
  await expect(page.locator('.opt.gone')).toHaveCount(2); // multiple choice: two wrong answers removed
  await answerQuiz(page, true); await nextQuestion(page);
  await playQuiz(page, [true, true, true, true, true]);
  const p = await readProfile(page);
  expect(p.coins).toBe(5 + 50);
  expect(p.perfectRounds).toBe(0);
  await expect(page.locator('.result h1')).not.toHaveText('Perfect round');
});

test('questions do not repeat until the whole pool has been seen; repeats earn nothing new', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/myth-or-fact' });
  const first = [];
  for (let i = 0; i < 6; i++) { first.push((await answerQuiz(page, true)).id); await nextQuestion(page); }
  await page.waitForSelector('.result');
  const pool = PACKS['myth-or-fact'].map((x) => x.id);
  const unseen = pool.filter((id) => !first.includes(id));
  expect(unseen).toHaveLength(2);
  await page.getByRole('link', { name: 'Play again' }).click();
  const second = [];
  for (let i = 0; i < 6; i++) { second.push((await answerQuiz(page, true)).id); await nextQuestion(page); }
  await page.waitForSelector('.result');
  for (const id of unseen) expect(second).toContain(id); // the 2 unseen come before any repeat
  const p = await readProfile(page);
  expect(p.coins).toBe(80 + 20); // round 2: only the 2 new questions pay, and a mixed round gets no perfect bonus
});

test('replays earn only the improvement over the best replay', async ({ page }) => {
  const seen = { 'myth-or-fact': PACKS['myth-or-fact'].map((x) => x.id) };
  await openApp(page, { profile: base({ seenAll: seen, replayBest: { 'myth-or-fact': 50 } }), hash: '#/play/myth-or-fact' });
  await playQuiz(page, [true, true, true, true, true, true]); // replay worth 80, best was 50
  let p = await readProfile(page);
  expect(p.coins).toBe(30);
  expect(p.replayBest['myth-or-fact']).toBe(80);
  await page.getByRole('link', { name: 'Play again' }).click();
  await playQuiz(page, [true, true, true, false, true, true]); // worth 50, below the best
  p = await readProfile(page);
  expect(p.coins).toBe(30);
  expect(p.replayBest['myth-or-fact']).toBe(80);
});

test('daily warm-up bonus of 30 is paid once a day', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/daily-warmup' });
  await playQuiz(page, [true, true, true]);
  let p = await readProfile(page);
  expect(p.coins).toBe(30 + 20 + 30);
  expect(p.missionDay).toBe('2026-10-28');
  await page.getByRole('link', { name: 'Play again' }).click();
  await playQuiz(page, [true, true, true]); // same day: same 3 questions, now replays, no second bonus
  p = await readProfile(page);
  expect(p.coins).toBe(80 + 50); // first replay: improvement over a best replay of 0 = 50
  await page.clock.setSystemTime(new Date('2026-10-29T09:00:00'));
  await page.getByRole('link', { name: 'Play again' }).click();
  await playQuiz(page, [true, true, true]);
  p = await readProfile(page);
  expect(p.missionDay).toBe('2026-10-29');
  expect(p.coins).toBeGreaterThanOrEqual(130 + 30); // next day: bonus again
});

test('weekly goal: 5 different days in a Monday to Sunday week pays +30 once', async ({ page }) => {
  await openApp(page, { profile: base({ weekKey: '2026-10-26', weekDays: [0, 1, 3, 4] }), hash: '#/play/myth-or-fact' });
  await playQuiz(page, [true, false, false, false, false, false]);
  let p = await readProfile(page);
  expect(p.weekDays.sort()).toEqual([0, 1, 2, 3, 4]);
  expect(p.weekBonusKey).toBe('2026-10-26');
  expect(p.coins).toBe(10 + 30);
  await expect(page.locator('.result')).toContainText('Weekly goal reached');
  await page.clock.setSystemTime(new Date('2026-11-01T20:00:00')); // Sunday, same week
  await page.getByRole('link', { name: 'Play again' }).click();
  await playQuiz(page, [true, false, false, false, false, false]);
  p = await readProfile(page);
  expect(p.coins).toBe(40 + 10); // no second weekly bonus
});

test('weekly goal resets on Monday', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-02T00:00:30')); // Monday, just after midnight
  await openApp(page, { profile: base({ weekKey: '2026-10-26', weekDays: [0, 1, 2, 3], lastDay: '2026-11-01', streak: 3 }), hash: '#/play/myth-or-fact' });
  await playQuiz(page, [true, false, false, false, false, false]);
  const p = await readProfile(page);
  expect(p.weekKey).toBe('2026-11-02');
  expect(p.weekDays).toEqual([0]);
  expect(p.coins).toBe(10);
  expect(p.streak).toBe(4); // Sunday then Monday still counts as consecutive days
});

test('floor goal counts completed rounds only, with no names', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/myth-or-fact' });
  await answerQuiz(page, true); // start a round, then leave: not counted
  await page.goto('/#/home');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_floor_2026-10-26')))).toBeNull();
  await page.goto('/#/play/myth-or-fact');
  await playQuiz(page, [true, true, true, true, true, true]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_floor_2026-10-26')))).toBe(1);
  await page.goto('/#/home');
  await expect(page.locator('.xcard', { hasText: 'Floor goal' })).toContainText('1 of 300 puzzle rounds this week');
  await expect(page.locator('.xcard', { hasText: 'Floor goal' })).not.toContainText('Teja');
});

test('level comes from lifetime AdCoins; spending lowers the balance only', async ({ page }) => {
  await openApp(page, { profile: base({ coins: 720, spent: 600 }) });
  expect(await balance(page)).toBe(120);
  await page.locator('.avatar').click();
  await expect(page.locator('.menu-head')).toContainText('Level 5');
  await expect(page.locator('.menu-head')).toContainText('120 AdCoins');
});

test('ad-free pass: 150 AdCoins for 7 days, level unchanged, no ad before hints', async ({ page }) => {
  await openApp(page, { profile: base({ coins: 300 }), hash: '#/settings' });
  await page.getByRole('button', { name: 'Buy for 150' }).click();
  await page.locator('.dialog').getByRole('button', { name: 'Buy for 150' }).click();
  const p = await readProfile(page);
  expect(p.spent).toBe(150);
  expect(p.coins).toBe(300);
  expect(Math.round((p.adFreeUntil - WED.getTime()) / 864e5)).toBe(7);
  expect(await balance(page)).toBe(150);
  await page.goto('/#/play/acronym-decoder');
  await page.locator('.hintbtn:visible').click();
  await expect(page.locator('.opt.gone')).toHaveCount(2);
  await expect(page.locator('.adcard')).toHaveCount(0);
});

test('ad-free pass cannot be bought without enough AdCoins', async ({ page }) => {
  await openApp(page, { profile: base({ coins: 400, spent: 300 }), hash: '#/settings' });
  await expect(page.locator('.passbox .btn')).toBeDisabled();
  await expect(page.locator('.passbox')).toContainText('You need 50 more');
});

test('admin can change the pass price', async ({ page }) => {
  await openApp(page, { profile: base({ coins: 300 }), hash: '#/settings', cfg: { adSeconds: 1, adSkip: 1, adFreePrice: 200, adFreeDays: 3 } });
  await expect(page.locator('.passbox .btn')).toHaveText('Buy for 200');
  await expect(page.locator('.passbox')).toContainText('3 days');
});
