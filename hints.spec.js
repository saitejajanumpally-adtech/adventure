// Rules: hint limits per game, half AdCoins for hinted items, no perfect round with hints, joke ad before every hint.
import { test, expect } from '@playwright/test';
import { openApp, watchErrors, profile, readProfile, answerQuiz, nextQuestion, playQuiz, useHint, hintBtn, sortFlow, matchAll, sortCard, solveClue } from '../helpers.js';

const ALL_BADGES = { first: 1, flawless: 1, fire: 1, pals: 1, allround: 1, yield: 1 };
const base = (over = {}) => profile({ badges: ALL_BADGES, ...over });

test('quiz: one hint per question; myth or fact shows a clue', async ({ page }) => {
  const w = watchErrors(page);
  await openApp(page, { profile: base(), hash: '#/play/myth-or-fact' });
  await useHint(page);
  await expect(page.getByText('A testing clue').first()).toBeVisible();
  await expect(hintBtn(page)).toBeDisabled();
  await answerQuiz(page, true); await nextQuestion(page);
  await expect(hintBtn(page)).toBeEnabled(); // a fresh hint on the next question
  w.expectNone();
});

test('quiz on a phone: the clue is visible after a hint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, { profile: base(), hash: '#/play/myth-or-fact' });
  await useHint(page);
  await expect(page.locator('.hnote')).toBeVisible();
  await expect(page.locator('.hnote')).toContainText('A testing clue');
});

test('multiple choice hint removes two wrong answers and shows a clue', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/odd-one-out' });
  await useHint(page);
  await expect(page.locator('.opt.gone')).toHaveCount(2);
  await expect(page.locator('.opt.gone')).toHaveCount(2);
  await expect(page.getByText('A testing clue').first()).toBeVisible();
});

test('a joke ad plays before every hint (default 5 seconds, Skip after 3)', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/acronym-decoder', cfg: {} });
  await hintBtn(page).click();
  const skip = page.locator('.ad-skip, .ad-cta').last();
  await expect(page.locator('.adcard')).toBeVisible();
  await page.waitForTimeout(2200);
  await expect(page.locator('.adcard button:enabled', { hasText: /Skip ad$|Accept all|Install/ })).toHaveCount(0);
  await expect(page.locator('.ad-skip:enabled, .ad-alt:enabled')).toHaveCount(0);
  await page.waitForTimeout(1300);
  await expect(page.locator('.ad-skip:enabled, .ad-alt:enabled').first()).toBeVisible();
  await page.waitForSelector('.adcard', { state: 'detached', timeout: 4000 }); // ends by itself at 5 seconds
  await answerQuiz(page, true); await nextQuestion(page);
  await hintBtn(page).click();
  await expect(page.locator('.adcard')).toBeVisible(); // and again on the next hint
  void skip;
});

test('stack sorter: once per card, 3 per round, greys out wrong layers, half AdCoins, not perfect', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/stack-sorter' });
  for (let card = 0; card < 5; card++) {
    if (card < 3) {
      await expect(hintBtn(page)).toBeEnabled();
      await useHint(page);
      await expect(page.locator('.opts .opt.gone')).toHaveCount(1);
      await expect(hintBtn(page)).toBeDisabled(); // only once per card
    } else {
      await expect(hintBtn(page)).toBeDisabled(); // 3 per round used up
      await expect(hintBtn(page)).toContainText('No hints left');
    }
    await sortCard(page, true);
    await page.locator('.fb .btn').click();
  }
  await page.waitForSelector('.result');
  const p = await readProfile(page);
  expect(p.coins).toBe(3 * 5 + 2 * 10);
  expect(p.perfectRounds).toBe(0);
});

test('ad-flow builder: hint only after the first wrong check, 2 per puzzle, places and locks a step', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/ad-flow-builder' });
  await expect(hintBtn(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Check order' }).click();
  await expect(hintBtn(page)).toBeEnabled();
  await useHint(page);
  await expect(page.locator('.sl.locked')).toHaveCount(1);
  await useHint(page);
  await expect(page.locator('.sl.locked')).toHaveCount(2);
  await expect(hintBtn(page)).toBeDisabled();
  await expect(hintBtn(page)).toContainText('No hints left');
  await sortFlow(page);
  await page.getByRole('button', { name: 'Check order' }).click();
  await page.locator('.fb .btn', { hasText: 'See results' }).click();
  await page.waitForSelector('.result');
  const p = await readProfile(page);
  expect(p.coins).toBe(2 * 5 + 3 * 10);
  expect(p.perfectRounds).toBe(0);
});

test('crossword: one hint per word, 3 per puzzle, reveals the first letter', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/crossword' });
  await expect(hintBtn(page)).toBeDisabled(); // pick a clue first
  for (let k = 0; k < 3; k++) {
    await page.locator('.clue:not(:disabled)').nth(k).click();
    await useHint(page);
    await expect(page.locator('.cw-cell.hintc')).toHaveCount(k + 1);
    await expect(hintBtn(page)).toBeDisabled(); // only one per word
  }
  await page.locator('.clue:not(:disabled)').nth(3).click();
  await expect(hintBtn(page)).toBeDisabled();
  await expect(hintBtn(page)).toContainText('No hints left');
  const letters = await page.locator('.cw-cell.hintc').allInnerTexts();
  for (const l of letters) expect(l.trim().slice(-1)).toMatch(/^[A-Z]$/); // the cell may also show the clue number
});

test('crossword: hinted words earn half and the puzzle is not perfect', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/crossword' });
  await page.locator('.clue:not(:disabled)').first().click();
  await useHint(page);
  const total = await page.locator('.clue').count();
  for (let k = 0; k < total; k++) await solveClue(page, 0);
  await page.locator('.fb .btn', { hasText: 'See results' }).click();
  await page.waitForSelector('.result');
  const p = await readProfile(page);
  expect(p.coins).toBe(5 + (total - 1) * 10);
  expect(p.perfectRounds).toBe(0);
});

test('jargon match: 1 hint per puzzle reveals one pair, half AdCoins, not perfect', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/jargon-match' });
  await useHint(page);
  await expect(page.locator('.mcols > div:first-child .mbtn.ok')).toHaveCount(1);
  await expect(hintBtn(page)).toBeDisabled();
  await matchAll(page);
  await page.locator('.fb .btn', { hasText: 'See results' }).click();
  await page.waitForSelector('.result');
  const p = await readProfile(page);
  expect(p.coins).toBe(5 + 3 * 10);
  expect(p.perfectRounds).toBe(0);
});

test('jargon match: a hint used before "Try again" still stops a perfect round', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/jargon-match' });
  await useHint(page);
  await matchAll(page, 3); // three wrong matches: out of lives
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(hintBtn(page)).toBeDisabled(); // the one hint is spent
  await matchAll(page);
  await page.locator('.fb .btn', { hasText: 'See results' }).click();
  await page.waitForSelector('.result');
  const p = await readProfile(page);
  expect(p.perfectRounds).toBe(0);
  await expect(page.locator('.result h1')).not.toHaveText('Perfect round');
});

test('daily warm-up: a hint makes the round not perfect', async ({ page }) => {
  await openApp(page, { profile: base(), hash: '#/play/daily-warmup' });
  await useHint(page);
  await playQuiz(page, [true, true, true]);
  const p = await readProfile(page);
  expect(p.perfectRounds).toBe(0);
  expect(p.coins).toBe(5 + 20 + 30);
});
