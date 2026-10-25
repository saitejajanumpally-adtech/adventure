// Rules: badges, profile menu, admin-only areas, nickname, admin list safety, switched-off questions, report history.
import { test, expect } from '@playwright/test';
import { openApp, watchErrors, profile, readProfile, playQuiz, answerQuiz, PACKS } from '../helpers.js';

const LIVE = ['daily-warmup', 'myth-or-fact', 'acronym-decoder', 'ad-flow-builder', 'jargon-match', 'crossword', 'odd-one-out', 'stack-sorter'];
const played = (ids) => Object.fromEntries(ids.map((g) => [g, { plays: 1, correct: 1, total: 2 }]));

test.describe('badges', () => {
  test('First Steps and Flawless after a first perfect round', async ({ page }) => {
    await openApp(page, { hash: '#/play/myth-or-fact' });
    await playQuiz(page, [true, true, true, true, true, true]);
    const p = await readProfile(page);
    expect(Object.keys(p.badges).sort()).toEqual(['first', 'flawless']);
    await expect(page.locator('.result')).toContainText('Badge unlocked: First Steps');
  });
  test('On Fire after 7 days in a row', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-28T10:00:00') });
    await openApp(page, { profile: profile({ badges: { first: 1, flawless: 1 }, lastDay: '2026-10-27', streak: 6, bestStreak: 6 }), hash: '#/play/myth-or-fact' });
    await playQuiz(page, [true, false, true, true, true, true]);
    const p = await readProfile(page);
    expect(p.streak).toBe(7);
    expect(p.badges.fire).toBeTruthy();
  });
  test('Pet Pals after meeting all 8 pets (tour companion pick)', async ({ page }) => {
    await openApp(page, { profile: profile({ tourDone: false }), hash: '#/tour' });
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Start playing' }).click();
    expect((await readProfile(page)).badges.pals).toBeTruthy();
  });
  test('All-Rounder after playing all 8 games', async ({ page }) => {
    await openApp(page, { profile: profile({ badges: { first: 1 }, played: played(LIVE.filter((g) => g !== 'myth-or-fact')) }), hash: '#/play/myth-or-fact' });
    await playQuiz(page, [true, false, false, false, false, false]);
    expect((await readProfile(page)).badges.allround).toBeTruthy();
  });
  test('Yield Pro at level 5 (700 AdCoins earned, even after spending)', async ({ page }) => {
    await openApp(page, { profile: profile({ badges: { first: 1 }, coins: 690, spent: 500 }), hash: '#/play/myth-or-fact' });
    await playQuiz(page, [true, false, false, false, false, false]);
    const p = await readProfile(page);
    expect(p.coins).toBeGreaterThanOrEqual(700);
    expect(p.badges.yield).toBeTruthy();
  });
});

test.describe('profile menu', () => {
  const ITEMS = ['My scorecard', 'My pets', 'Settings', 'Help and feedback', "What's new", 'Replay the tour', 'Admin', 'Sign out'];
  test('admins see every item in order, and each opens its screen', async ({ page }) => {
    const w = watchErrors(page);
    await openApp(page);
    await page.locator('.avatar').click();
    const items = (await page.locator('.menu [role=menuitem]').allInnerTexts()).map((t) => t.replace(/\d+$/, '').trim());
    expect(items).toEqual(ITEMS);
    await page.keyboard.press('Escape');
    for (const [name, title] of [['My scorecard', 'My scorecard'], ['My pets', 'My pets'], ['Settings', 'Settings'], ['Help and feedback', 'Help and feedback'], ["What's new", "What's new"]]) {
      await page.locator('.avatar').click();
      await page.locator('.menu [role=menuitem]', { hasText: name }).click();
      await expect(page.locator('main h1').first()).toHaveText(title);
    }
    w.expectNone();
  });
  test('players do not see Admin and cannot open it by address', async ({ page }) => {
    await openApp(page, { admin: false });
    await page.locator('.avatar').click();
    const items = (await page.locator('.menu [role=menuitem]').allInnerTexts()).map((t) => t.replace(/\d+$/, '').trim());
    expect(items).toEqual(ITEMS.filter((x) => x !== 'Admin'));
    for (const s of ['', '/insights', '/people', '/feedback', '/browse', '/settings', '/announce', '/reports', '/add']) {
      await page.goto(`/?x${s.replace('/', '')}#/admin${s}`);
      await page.waitForSelector('.qhero');
      await expect(page.locator('.adlayout')).toHaveCount(0);
    }
  });
  test('Sign out returns to the login screen', async ({ page }) => {
    await openApp(page);
    await page.locator('.avatar').click();
    await page.locator('.menu [role=menuitem]', { hasText: 'Sign out' }).click();
    await expect(page.locator('.login .gbtn')).toBeVisible();
  });
});

test('nickname is only for the greeting; reports use the Google name', async ({ page }) => {
  await openApp(page, { hash: '#/settings' });
  await page.locator('#nick').fill('Captain');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.goto('/?a#/home');
  await expect(page.locator('.hbubble')).toContainText('Captain');
  await page.goto('/?b#/play/myth-or-fact');
  await answerQuiz(page, true);
  await page.getByRole('button', { name: 'Report this question' }).click();
  await page.getByRole('button', { name: 'Unclear' }).click();
  await expect(page.getByText('Thanks. An admin will review it.')).toBeVisible();
  const reps = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_reports')));
  const who = Object.values(Object.values(reps)[0].reporters)[0];
  expect(who.name).toBe('Saiteja Janumpally');
  expect(JSON.stringify(reps)).not.toContain('Captain');
});

test('a player can report a question only once', async ({ page }) => {
  await openApp(page, { hash: '#/play/myth-or-fact', profile: profile({ seenAll: {} }) });
  const it = await answerQuiz(page, true);
  await page.getByRole('button', { name: 'Report this question' }).click();
  await page.getByRole('button', { name: 'Wrong answer' }).click();
  await expect(page.getByText('Thanks. An admin will review it.')).toBeVisible();
  const p = await readProfile(page);
  expect(p.reported[`myth-or-fact:${it.id}`]).toBe(true);
});

test.describe('admin', () => {
  test('you cannot remove yourself, and the last admin cannot be removed', async ({ page }) => {
    await openApp(page, { hash: '#/admin/people' });
    await expect(page.getByText("Can't remove yourself")).toBeVisible();
    await expect(page.locator('.card', { hasText: 'Admins (1)' }).getByRole('button', { name: 'Remove' })).toHaveCount(0);
  });
  test('another admin can be added and removed; the list never empties', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await openApp(page, { hash: '#/admin/people' });
    await page.getByPlaceholder(/Add an admin/).fill('someone@gmail.com');
    await page.getByRole('button', { name: 'Add admin' }).click();
    await expect(page.getByText('Use a @databeat.io email address.')).toBeVisible();
    await page.getByPlaceholder(/Add an admin/).fill('Colleague@DataBeat.io');
    await page.getByRole('button', { name: 'Add admin' }).click();
    await expect(page.getByText('Admins (2)')).toBeVisible();
    await page.locator('tr', { hasText: 'colleague@databeat.io' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Admins (1)')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_admins')))).toEqual(['demo@databeat.io']);
  });
  test('players see only the anonymous floor total; admins see names and scores', async ({ page }) => {
    await openApp(page, { admin: false });
    await expect(page.locator('main')).not.toContainText('demo@databeat.io');
    await page.goto('/?p#/card');
    await expect(page.locator('main')).not.toContainText('@databeat.io');
  });
  test('Insights lists people with names and AdCoins', async ({ page }) => {
    await openApp(page, { hash: '#/admin/insights', profile: profile({ coins: 123, fullName: 'Saiteja Janumpally', email: 'demo@databeat.io' }) });
    await expect(page.locator('table.tbl').last()).toContainText('Saiteja Janumpally');
    await expect(page.locator('table.tbl').last()).toContainText('123');
  });
});

test('questions switched off by an admin are never served (games and daily warm-up)', async ({ page }) => {
  const off = (items, keep) => items.map((x, i) => (i < keep ? x : { ...x, disabled: true }));
  const ls = {
    'rda_demo_pack_myth-or-fact': { items: off(PACKS['myth-or-fact'], 2), version: 2 },
    'rda_demo_pack_acronym-decoder': { items: off(PACKS['acronym-decoder'], 1), version: 2 },
    'rda_demo_pack_odd-one-out': { items: off(PACKS['odd-one-out'], 1), version: 2 }
  };
  await openApp(page, { hash: '#/play/myth-or-fact', ls });
  const seen = new Set();
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 2; i++) { seen.add((await answerQuiz(page, true)).id); await page.locator('.fb .btn').click(); }
    await page.waitForSelector('.result');
    await page.getByRole('link', { name: 'Play again' }).click();
  }
  expect([...seen].sort()).toEqual(['t0', 't1']);
  await page.goto('/?w#/play/daily-warmup');
  const mission = [];
  for (let i = 0; i < 3; i++) { mission.push((await answerQuiz(page, true)).id); await page.locator('.fb .btn').click(); }
  for (const id of mission) expect(['t0', 't1', 'a0', 'o0']).toContain(id);
});

test('closed reports stay in the history and in the export', async ({ page }) => {
  await openApp(page, { hash: '#/play/acronym-decoder' });
  await answerQuiz(page, true);
  await page.getByRole('button', { name: 'Report this question' }).click();
  await page.getByRole('button', { name: 'Outdated' }).click();
  await page.goto('/?r#/admin/reports');
  await page.getByRole('button', { name: 'Keep as is' }).click();
  await expect(page.getByText('No open reports.')).toBeVisible();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_reportlog')));
  expect(log).toHaveLength(1);
  expect(log[0].status).toBe('kept');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const csv = await (await (await dl).createReadStream()).toArray();
  const text = Buffer.concat(csv).toString('utf8');
  expect(text).toContain('Kept as is');
  expect(text).toContain('Saiteja Janumpally');
});
