// Shared helpers. The app runs in demo mode inside the test browser only: config.js on disk is never changed.
import { expect } from '@playwright/test';

/* ---------- small known question packs, so every test knows the right answers ---------- */
const tf = (i, answer, hint) => ({ id: `t${i}`, q: `Statement number ${i} for testing`, answer, why: `Because statement ${i} is ${answer ? 'true' : 'false'}.`, ...(hint ? { hint: 'A testing clue' } : {}) });
const mc = (p, i, answer) => ({ id: `${p}${i}`, q: `Question ${p}${i}: pick the right option`, options: ['Option A', 'Option B', 'Option C', 'Option D'].map((o) => `${o} ${p}${i}`), answer, why: `Option ${'ABCD'[answer]} is right.`, hint: 'A testing clue' });
export const PACKS = {
  'myth-or-fact': Array.from({ length: 8 }, (_, i) => tf(i, i % 2 === 0, true)),
  'acronym-decoder': Array.from({ length: 8 }, (_, i) => mc('a', i, i % 4)),
  'odd-one-out': Array.from({ length: 8 }, (_, i) => mc('o', i, (i + 1) % 4)),
  'ad-flow-builder': [{ id: 'f1', title: 'Test flow', steps: ['Step one', 'Step two', 'Step three', 'Step four', 'Step five'], why: 'That is the order.' }],
  'jargon-match': [{ id: 'm1', title: 'Test pairs', pairs: [['Alpha', 'First letter'], ['Bravo', 'Second letter'], ['Charlie', 'Third letter'], ['Delta', 'Fourth letter']].map(([term, def]) => ({ term, def })) }],
  'stack-sorter': [{ id: 's1', title: 'Test stack', layers: ['Sell side', 'Exchange', 'Buy side'], cards: [{ name: 'SSP', layer: 0 }, { name: 'Ad exchange', layer: 1 }, { name: 'DSP', layer: 2 }, { name: 'Publisher', layer: 0 }, { name: 'Advertiser', layer: 2 }], why: 'Sellers, the middle, buyers.' }],
  crossword: [{ id: 'c1', title: 'Test grid', words: [{ answer: 'FLOOR', clue: 'Minimum price' }, { answer: 'BID', clue: 'An offer' }, { answer: 'CPM', clue: 'Cost per mille' }, { answer: 'FILL', clue: 'Rate of served requests' }, { answer: 'PIXEL', clue: 'Tracking image' }, { answer: 'LOT', clue: 'A batch' }] }]
};
const ALL_HOW = Object.fromEntries(['daily-warmup', ...Object.keys(PACKS)].map((g) => [g, true]));

export const profile = (over = {}) => ({
  name: 'Teja', coins: 0, streak: 0, bestStreak: 0, lastDay: '', missionDay: '', lastGame: '',
  played: {}, seenAll: {}, replayBest: {}, bestTime: {}, met: {}, howSeen: ALL_HOW, reported: {},
  badges: {}, weekKey: '', weekDays: [], weekBonusKey: '', perfectRounds: 0, spent: 0, adFreeUntil: 0, newSeen: 'v4-hints',
  activity: {}, companion: 'panda', tourDone: true,
  settings: { petMode: 'fixed', liveTimer: false, motion: false, coach: true, textSize: 'standard' }, ...over
});

/* Opens the app in demo mode. opts: profile, cfg (admin game settings), admin, signedOut, ls (extra localStorage), hash */
export async function openApp(page, opts = {}) {
  const { admin = true, hash = '#/home', cfg = { adSeconds: 1, adSkip: 1 } } = opts;
  await page.route('**/config.js', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('DEMO_MODE: false', 'DEMO_MODE: true') }); });
  if (!admin) await page.route('**/store.js', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('async isAdmin() { return true; }', 'async isAdmin() { return false; }') }); });
  const ls = { rda_demo_cfg: cfg, ...(opts.ls || {}) };
  if (opts.profile !== null) ls.rda_demo_profile = opts.profile || profile();
  if (opts.signedOut) ls.rda_demo_signed_out = true;
  if (opts.packs !== false) for (const [g, items] of Object.entries(PACKS)) ls[`rda_demo_pack_${g}`] ??= { items, version: 1 };
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
  }, ls);
  await page.goto(`/${hash}`);
  await page.waitForSelector('#app > :not(.login), .login .gbtn');
}

/* Collects console errors and uncaught exceptions. Call expectNoErrors() at the end of a test. */
// Pet moods with no picture yet (README: "think, streak, hurt" can be added later). The app falls back to another
// picture, but the browser still logs the 404. Those are expected; any other failed file is an error.
const OPTIONAL_PET = /\/pets\/[a-z]+-(think|streak|hurt)\.(webp|png)$/;
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !OPTIONAL_PET.test(new URL(r.url()).pathname)) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { errors, expectNone: () => expect(errors, errors.join('\n')).toEqual([]) };
}

export const readProfile = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rda_demo_profile')));
export const writeProfile = (page, p) => page.evaluate((x) => localStorage.setItem('rda_demo_profile', JSON.stringify(x)), p);

/* ---------- answering ---------- */
const findQuiz = (text) => {
  for (const [g, items] of Object.entries(PACKS)) { const it = items.find((x) => x.q === text); if (it) return { g, it }; }
  throw new Error(`Unknown question: ${text}`);
};
/* Answers the question on screen. right=false picks a wrong answer. Returns the item. */
export async function answerQuiz(page, right = true) {
  const text = (await page.locator('.qtext').innerText()).trim();
  const { it } = findQuiz(text);
  if (typeof it.answer === 'boolean') await page.locator('.opt.tf').nth((it.answer === right) ? 1 : 0).click();
  else {
    const want = right ? it.options[it.answer] : it.options[(it.answer + 1) % 4];
    await page.locator('.opt', { hasText: want }).click();
  }
  return it;
}
export async function nextQuestion(page) { await page.locator('.fb .btn').first().click(); }

/* Plays a whole quiz round. pattern: array of true/false (right or wrong) per question. */
export async function playQuiz(page, pattern) {
  for (const right of pattern) { await answerQuiz(page, right); await nextQuestion(page); }
  await page.waitForSelector('.result');
}

/* The Hint button sits in the coach panel on laptops and under the question on phones. */
export const hintBtn = (page) => page.locator('.hintbtn:visible');
export async function useHint(page) {
  await hintBtn(page).click();
  await page.waitForTimeout(150);
  await page.waitForSelector('.adcard', { state: 'detached', timeout: 10_000 });
}

/* Puts the ad-flow steps in the right order using the arrow buttons. */
export async function sortFlow(page) {
  const steps = PACKS['ad-flow-builder'][0].steps;
  for (let p = 0; p < steps.length; p++) {
    for (let guard = 0; guard < 10; guard++) {
      const texts = await page.locator('.sl .sl-text').allInnerTexts();
      const at = texts.indexOf(steps[p]);
      if (at === p) break;
      await page.locator('.sl').nth(at).locator('.arr').first().click();
    }
  }
}
export async function matchAll(page, wrongFirst = 0) {
  const pairs = PACKS['jargon-match'][0].pairs;
  for (let i = 0; i < wrongFirst; i++) {
    await page.locator('.mcols > div:first-child .mbtn:not(:disabled)').first().click();
    const term = (await page.locator('.mbtn.sel').innerText()).trim();
    const right = pairs.find((p) => p.term === term).def;
    const open = await page.locator('.mbtn.def:not(:disabled)').allInnerTexts();
    await page.locator('.mbtn.def:not(:disabled)', { hasText: open.find((t) => t.trim() !== right) }).click();
  }
  for (const p of pairs) {
    if (await page.locator('.mbtn:disabled', { hasText: p.term }).count()) continue;
    if (await page.locator('.fb').count()) break;
    await page.locator('.mbtn:not(.def)', { hasText: p.term }).click();
    await page.locator('.mbtn.def', { hasText: p.def }).click();
  }
}
export async function sortCard(page, right = true) {
  const pz = PACKS['stack-sorter'][0];
  const name = (await page.locator('.bigcard').innerText()).trim();
  const card = pz.cards.find((c) => c.name === name);
  const layer = right ? card.layer : (card.layer + 1) % pz.layers.length;
  await page.locator('.opts .opt').nth(layer).click();
}
export async function solveClue(page, index) {
  const clue = page.locator('.clue:not(:disabled)').nth(index);
  const text = (await clue.innerText()).replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)$/, '');
  const w = PACKS.crossword[0].words.find((x) => x.clue === text);
  await clue.click();
  await page.locator('#cw-in').fill(w.answer);
  await page.locator('#cw-in').press('Enter');
}
export const balance = async (page) => Number((await page.locator('.pill.c').innerText()).trim());
