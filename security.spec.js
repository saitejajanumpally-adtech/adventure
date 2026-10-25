// Security and robustness: text from people is always shown as text; every screen loads without console errors.
import { test, expect } from '@playwright/test';
import { openApp, watchErrors, profile } from '../helpers.js';

const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"\'&';
const xssFired = (page) => page.evaluate(() => window.__xss || document.querySelectorAll('main img[src="x"], main script').length);

test('names, nicknames, feedback, announcements and questions are shown as plain text', async ({ page }) => {
  const ls = {
    rda_demo_announce: { banner: { on: true, text: XSS, until: '' }, entries: [{ id: 'x1', type: 'major', title: XSS, text: XSS, date: '2026-10-26' }], minor: XSS },
    rda_demo_feedback: [{ id: 'f1', uid: 'other', name: XSS, email: 'x@databeat.io', type: 'problem', message: XSS, page: XSS, createdAt: Date.now(), status: 'open' }],
    'rda_demo_pack_myth-or-fact': { items: [{ id: 'x', q: XSS, answer: true, why: XSS, hint: XSS }], version: 9 },
    rda_demo_reports: { r1: { id: 'r1', game: 'myth-or-fact', itemId: 'x', count: 1, reporters: { u: { name: XSS, email: XSS, reason: 'other', at: 1 } }, reasons: { other: 1 }, preview: XSS, createdAt: 1 } },
    rda_demo_others: [{ uid: 'o1', name: XSS, fullName: XSS, email: 'o@databeat.io', coins: 5, played: {}, activity: {} }]
  };
  await openApp(page, { profile: profile({ nickname: XSS }), ls });
  const screens = ['#/home', '#/new', '#/play/myth-or-fact', '#/admin/feedback', '#/admin/reports', '#/admin/insights', '#/admin/people', '#/admin/browse', '#/admin/announce'];
  for (const s of screens) {
    await page.goto(`/?${s.replace(/\W/g, '')}${s}`);
    await page.waitForTimeout(600);
    expect(await xssFired(page), `script ran on ${s}`).toBeFalsy();
  }
  await page.goto('/?h2#/home');
  await expect(page.locator('.banner')).toContainText('<img src=x');
});

test('the feedback form sends text as typed and limits it to 2000 characters', async ({ page }) => {
  await openApp(page, { hash: '#/help' });
  await page.locator('#fb-msg').fill('x'.repeat(2500));
  expect((await page.locator('#fb-msg').inputValue()).length).toBe(2000);
  await page.locator('#fb-msg').fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Please write a few words')).toBeVisible();
  await page.locator('#fb-msg').fill(XSS);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Thank you')).toBeVisible();
  const fb = await page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_feedback')));
  expect(fb[0]).toMatchObject({ uid: 'demo', type: 'problem', message: XSS, email: 'demo@databeat.io' });
});

test('every screen loads with no console errors', async ({ page }) => {
  test.setTimeout(240_000);
  const w = watchErrors(page);
  await openApp(page, { profile: profile({ coins: 260, played: { 'myth-or-fact': { plays: 2, correct: 9, total: 12 } } }) });
  const screens = ['#/home', '#/game/myth-or-fact', '#/play/myth-or-fact', '#/play/acronym-decoder', '#/play/daily-warmup', '#/play/ad-flow-builder', '#/play/jargon-match', '#/play/crossword',
    '#/play/odd-one-out', '#/play/stack-sorter', '#/card', '#/pets', '#/settings', '#/help', '#/new', '#/tour',
    '#/admin/insights', '#/admin/add', '#/admin/browse', '#/admin/reports', '#/admin/people', '#/admin/feedback', '#/admin/settings', '#/admin/announce', '#/nowhere'];
  for (const s of screens) { await page.goto(`/?${s.replace(/\W/g, '')}${s}`); await page.waitForTimeout(500); }
  w.expectNone();
});
