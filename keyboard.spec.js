// Keyboard-only use: Tab order, visible focus, Escape, A-D and M/F shortcuts, dialogs that trap and return focus.
import { test, expect } from '@playwright/test';
import { openApp, profile, answerQuiz, PACKS } from '../helpers.js';

const focused = (page) => page.evaluate(() => { const el = document.activeElement; return { tag: el.tagName, text: (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 40), cls: el.className, inDialog: !!el.closest('.dialog') }; });
const outlineOf = (page) => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });

test('Tab order starts at the logo, then the profile button, then the page; focus is visible', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari only tabs to links with Option+Tab by default');
  await openApp(page);
  await page.keyboard.press('Tab');
  expect((await focused(page)).text).toMatch(/ADVenture|AD/);
  let o = await outlineOf(page);
  expect(o.style).not.toBe('none'); expect(o.width).toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  expect((await focused(page)).text).toBe('Profile menu');
  o = await outlineOf(page);
  expect(o.style).not.toBe('none');
  await page.keyboard.press('Tab');
  const third = await focused(page);
  expect(third.tag).toMatch(/A|BUTTON/);
});

test('profile menu: opens with Enter, Escape closes it and resets aria-expanded', async ({ page }) => {
  await openApp(page);
  await page.locator('.avatar').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.locator('.avatar')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toBeHidden();
  await expect(page.locator('.avatar')).toHaveAttribute('aria-expanded', 'false');
});

test('A to D answers multiple choice; M and F answer myth or fact', async ({ page }) => {
  await openApp(page, { hash: '#/play/acronym-decoder' });
  const q = (await page.locator('.qtext').innerText()).trim();
  const it = PACKS['acronym-decoder'].find((x) => x.q === q);
  const labels = await page.locator('.opt .ot').allInnerTexts();
  const letter = 'abcd'[labels.indexOf(it.options[it.answer])];
  await page.keyboard.press(letter);
  await expect(page.locator('.fb.ok')).toBeVisible();
  await page.goto('/?m#/play/myth-or-fact');
  const q2 = (await page.locator('.qtext').innerText()).trim();
  const it2 = PACKS['myth-or-fact'].find((x) => x.q === q2);
  await page.keyboard.press(it2.answer ? 'f' : 'm');
  await expect(page.locator('.fb.ok')).toBeVisible();
});

test('How to play dialog: focus moves in, Tab stays inside, Escape closes, focus returns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, { hash: '#/play/myth-or-fact' });
  const opener = page.locator('.coachpanel .how');
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dialog')).toBeVisible();
  expect((await focused(page)).inDialog).toBe(true);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect((await focused(page)).inDialog, `Tab ${i + 1} left the dialog`).toBe(true); }
  await page.keyboard.press('Shift+Tab'); expect((await focused(page)).inDialog).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.classList.contains('how'))).toBe(true);
});

test('answer shortcuts do nothing while a dialog is open', async ({ page }) => {
  await openApp(page, { hash: '#/play/myth-or-fact' });
  await page.locator('.how:visible').first().click();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.keyboard.press('m');
  await page.keyboard.press('f');
  await expect(page.locator('.fb')).toHaveCount(0);
});

test('Leave this round dialog: Escape keeps you playing', async ({ page }) => {
  await openApp(page, { hash: '#/play/myth-or-fact' });
  await answerQuiz(page, true);
  await page.locator('.xbtn').click();
  await expect(page.locator('.dialog')).toContainText('Leave this round?');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.qcard')).toBeVisible();
});

test('the joke ad cannot be closed with Escape and keeps focus inside', async ({ page }) => {
  await openApp(page, { hash: '#/play/acronym-decoder', cfg: { adSeconds: 4, adSkip: 3 } });
  await page.locator('.hintbtn:visible').click();
  await expect(page.locator('.adcard')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.adcard')).toBeVisible();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); expect((await focused(page)).inDialog).toBe(true); }
});

test('old-style profile without the newer fields still works everywhere', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const old = { name: 'Teja', xp: 140, streak: 2, lastDay: '2026-01-01', played: { 'myth-or-fact': { plays: 1, correct: 4, total: 6 } }, seenAll: { 'myth-or-fact': ['t0'] }, met: { cat: true }, howSeen: { 'myth-or-fact': true }, tourDone: true, companion: 'cat', settings: { petMode: 'fixed', hintAds: true } };
  await openApp(page, { profile: old });
  await expect(page.locator('.pill.c')).toHaveText('140');
  for (const hsh of ['#/card', '#/pets', '#/settings', '#/new', '#/help', '#/admin/insights', '#/admin/people']) { await page.goto(`/?${hsh.replace(/\W/g, '')}${hsh}`); await page.waitForTimeout(300); }
  await page.goto('/?play#/play/myth-or-fact');
  for (let i = 0; i < 6; i++) { await answerQuiz(page, true); await page.locator('.fb .btn').click(); }
  await page.waitForSelector('.result');
  expect(errors).toEqual([]);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_profile')));
  expect(p.activity).toBeTruthy(); expect(p.weekDays.length).toBe(1); expect(p.badges.first).toBeTruthy();
});

test('dates: a streak continues across a month and year end, and the week starts on Monday', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-01T08:00:00') }); // a Friday
  await openApp(page, { profile: profile({ lastDay: '2026-12-31', streak: 4, weekKey: '2026-12-28', weekDays: [3] }), hash: '#/play/myth-or-fact' });
  for (let i = 0; i < 6; i++) { await answerQuiz(page, true); await page.locator('.fb .btn').click(); }
  await page.waitForSelector('.result');
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_profile')));
  expect(p.streak).toBe(5);
  expect(p.weekKey).toBe('2026-12-28');
  expect(p.weekDays.sort()).toEqual([3, 4]);
  expect(Object.keys(p.activity)).toEqual(['2027-01-01']);
});

test('dates: a round finished just after midnight counts for the new day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T23:59:40') }); // Sunday night
  await openApp(page, { profile: profile({ lastDay: '2026-10-31', streak: 1, weekKey: '2026-10-26', weekDays: [5] }), hash: '#/play/myth-or-fact' });
  for (let i = 0; i < 5; i++) { await answerQuiz(page, true); await page.locator('.fb .btn').click(); }
  await page.clock.setSystemTime(new Date('2026-11-02T00:00:05')); // Monday
  await answerQuiz(page, true); await page.locator('.fb .btn').click();
  await page.waitForSelector('.result');
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_profile')));
  expect(p.lastDay).toBe('2026-11-02');
  expect(p.weekKey).toBe('2026-11-02');
  expect(p.weekDays).toEqual([0]);
  expect(p.streak).toBe(1); // Saturday -> Monday skips Sunday, so the streak restarts
});
