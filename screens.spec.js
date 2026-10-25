// Screenshot sweep with automatic layout checks. Run:  SCREENS=1 npx playwright test --project=screens-chromium
// Screenshots go to tests/screens/<browser>/<size>/ and the findings to tests/reports/screens-<browser>--<batch>.json
import { test } from '@playwright/test';
import fs from 'node:fs';
import { openApp, profile, PACKS, useHint, answerQuiz } from '../helpers.js';

test.skip(!process.env.SCREENS, 'set SCREENS=1 to run the screenshot sweep');
test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'parallel' });

const SIZES = [[360, 640], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1536, 864], [1920, 1080], [844, 390]];
const QUICK = [[360, 640], [844, 390], [1280, 720]]; // WebKit and Firefox
const fast = { adSeconds: 1, adSkip: 1 };
const others = Array.from({ length: 30 }, (_, i) => ({ uid: `o${i}`, name: `P${i}`, fullName: `Player Number ${i} With A Long Name`, email: `player.number.${i}@databeat.io`, coins: 40 * i, signIns: i, lastSeen: Date.now() - i * 864e5,
  played: { 'myth-or-fact': { plays: i, correct: i * 4, total: i * 6, coins: i * 40 } }, activity: {}, badges: { first: 1 } }));
const SEED = {
  rda_demo_others: others,
  rda_demo_feedback: [
    { id: 'f1', uid: 'o1', name: 'Player Number 1', email: 'p1@databeat.io', type: 'problem', message: 'The crossword grid looked cut off on my phone when I turned it sideways. Also the hint button was hard to find.', page: '#/play/crossword', game: 'crossword', device: 'Phone', browser: 'Safari', screen: '390x844', version: '4.0', createdAt: Date.now() - 3600e3, status: 'open' },
    { id: 'f2', uid: 'o2', name: 'Player Number 2', email: 'p2@databeat.io', type: 'idea', message: 'A leaderboard per team would be fun.', page: '#/home', device: 'Laptop or desktop', browser: 'Chrome', screen: '1536x864', version: '4.0', createdAt: Date.now() - 86400e3, status: 'done', resolvedBy: 'demo@databeat.io', note: 'Planned' }],
  rda_demo_reports: { 'acronym-decoder__a1': { id: 'acronym-decoder__a1', game: 'acronym-decoder', itemId: 'a1', count: 2, reporters: { o1: { name: 'Player Number 1', email: 'p1@databeat.io', at: 1, reason: 'wrong' }, o2: { name: 'Player Number 2', email: 'p2@databeat.io', at: 2, reason: 'unclear' } }, reasons: { wrong: 1, unclear: 1 }, preview: PACKS['acronym-decoder'][1].q, createdAt: Date.now() - 7200e3 } },
  rda_demo_admins: ['demo@databeat.io', 'second.admin@databeat.io'],
  'rda_demo_versions_myth-or-fact': [{ id: '1', version: 1, count: 8, at: Date.now(), by: 'demo@databeat.io', note: 'Added items' }]
};
const busy = profile({ coins: 460, spent: 150, streak: 4, bestStreak: 9, lastDay: new Date().toISOString().slice(0, 10), badges: { first: 1, flawless: 1, allround: 1 }, met: { panda: 1, cat: 1, dog: 1, penguin: 1 },
  played: { 'myth-or-fact': { plays: 5, correct: 22, total: 30, coins: 240 }, crossword: { plays: 1, correct: 6, total: 6 } }, bestTime: { 'myth-or-fact': 64000 }, fullName: 'Saiteja Janumpally', email: 'demo@databeat.io' });

/* ---------- the checks, run inside the page ---------- */
function checks() {
  window.scrollTo(0, 0);
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const out = { hscroll: false, offscreen: [], clipped: [], small: [], tinyText: [], petOverText: [], overlap: [], modal: null, topbar: null };
  const visible = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0 && r.width > 0 && r.height > 0; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} "${(el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
  const inScroller = (el) => !!el.closest('.tscroll, .cw-wrap, .dialog');
  out.hscroll = document.documentElement.scrollWidth > vw + 1;
  // Only look at the top layer: an open dialog (how to play, joke ad) or the profile menu sits on top of the page by design.
  const layer = document.querySelector('.backdrop .dialog') || document.querySelector('.menu:not([hidden])');
  const inLayer = (el) => !layer || layer.contains(el) || (layer.classList.contains('menu') && el.closest('.topbar'));
  const all = [...document.querySelectorAll('body *')].filter((el) => !el.closest('.confetti, #toast, .sr-only') && visible(el) && inLayer(el));
  for (const el of all) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el) && s.position !== 'fixed') out.offscreen.push(`${name(el)} x=${Math.round(r.left)}..${Math.round(r.right)}`);
    if ((s.overflowX === 'hidden' || s.textOverflow === 'ellipsis' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2 && el.innerText && el.innerText.trim() && !el.matches('.pet-fig, .pet-fig *, .bar, .qbar, .ad-bar, .tscroll, .cw-wrap, .dialog, .sp5')) out.clipped.push(name(el));
  }
  // tap targets (a control inside a big enough label counts as the label)
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=radio], [role=switch], summary')) {
    if (!visible(el) || el.closest('.sr-only') || !inLayer(el)) continue;
    let r = el.getBoundingClientRect();
    const lab = el.closest('label');
    if (lab) r = lab.getBoundingClientRect();
    if ((r.width < 44 || r.height < 44) && !(el.closest('p') && el.tagName === 'A')) out.small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  // text size and pet pictures over text
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const pets = [...document.querySelectorAll('.pet-fig')].filter((el) => visible(el) && inLayer(el)).map((p) => ({ p, r: p.getBoundingClientRect() }));
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || !visible(el) || !inLayer(el) || el.closest('.sr-only, .pet-fig, .confetti, #toast, [aria-hidden=true], .word, .ti')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.tinyText.push(`${name(el)} ${fs}px`);
    const range = document.createRange(); range.selectNodeContents(n);
    for (const tr of range.getClientRects()) texts.push({ el, tr });
  }
  const hit = (a, b, pad = 2) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > pad && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > pad;
  for (const { p, r } of pets) {
    // the visible picture area (images are contained, so use the image box when there is one)
    const img = p.querySelector('img'); const pr = img ? img.getBoundingClientRect() : r;
    for (const { el, tr } of texts) if (!p.contains(el) && hit(pr, tr, 4)) { out.petOverText.push(`${name(p)} over ${name(el)}`); break; }
  }
  // controls on top of other controls
  const ctrls = [...document.querySelectorAll('a[href], button, input, select, textarea')].filter((el) => visible(el) && !el.closest('.sr-only') && inLayer(el)).map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i], b = ctrls[j];
    if (a.el.contains(b.el) || b.el.contains(a.el) || a.el.closest('label') === b.el.closest('label') && a.el.closest('label')) continue;
    if (hit(a.r, b.r, 3)) out.overlap.push(`${name(a.el)} / ${name(b.el)}`);
  }
  const d = document.querySelector('.dialog');
  if (d) { const r = d.getBoundingClientRect(); const s = getComputedStyle(d); out.modal = { fits: r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1, scrolls: d.scrollHeight > d.clientHeight + 1 ? s.overflowY : 'not needed', h: Math.round(r.height), vh }; }
  const tb = document.querySelector('.topbar');
  if (tb) { const r = tb.getBoundingClientRect(); const main = document.querySelector('main'); out.topbar = { height: Math.round(r.height), share: +(r.height / vh).toFixed(2), coversMain: main ? main.getBoundingClientRect().top < r.bottom - 1 : false }; }
  for (const k of ['offscreen', 'clipped', 'small', 'tinyText', 'petOverText', 'overlap']) out[k] = [...new Set(out[k])].slice(0, 25);
  return out;
}

/* ---------- getting to each screen ---------- */
const go = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(450); };
const SCREENS = [
  ['home', (p) => go(p, '#/home')],
  ['profile-menu', async (p) => { await go(p, '#/home'); await p.locator('.avatar').click(); }],
  ['game-intro-how-to-play', async (p) => { await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('rda_demo_profile')); x.howSeen = {}; localStorage.setItem('rda_demo_profile', JSON.stringify(x)); }); await p.reload(); await go(p, '#/game/acronym-decoder'); await p.waitForSelector('.dialog'); }],
  ...['daily-warmup', 'myth-or-fact', 'acronym-decoder', 'ad-flow-builder', 'jargon-match', 'crossword', 'odd-one-out', 'stack-sorter'].flatMap((g) => [
    [`play-${g}`, async (p) => { await go(p, '#/home'); await go(p, `#/play/${g}`); await p.waitForSelector('.play > :not(.muted)'); if (g === 'crossword') await p.locator('.clue').first().click(); }],
    [`hint-${g}`, async (p) => {
      if (g === 'ad-flow-builder') await p.getByRole('button', { name: 'Check order' }).click();
      if (g === 'crossword') await p.locator('.clue:not(:disabled)').first().click();
      await useHint(p);
      if (['daily-warmup', 'myth-or-fact', 'acronym-decoder', 'odd-one-out'].includes(g)) await answerQuiz(p, true);
    }]
  ]),
  ['result-crossword', async (p) => { await go(p, '#/home'); await go(p, '#/play/crossword'); await p.waitForSelector('.clue'); await p.locator('.linkbtn', { hasText: 'Give up' }).click(); await p.locator('.fb .btn').click(); await p.waitForSelector('.result'); }],
  ['result-quiz', async (p) => { await go(p, '#/home'); await go(p, '#/play/odd-one-out'); for (let i = 0; i < 6; i++) { await answerQuiz(p, i % 3 !== 0); await p.locator('.fb .btn').first().click(); } await p.waitForSelector('.result'); }],
  ...[['video', 'penguin', 0], ['countdown', 'penguin', 0.6], ['prize', 'panda', 0], ['install', 'panda', 0.6], ['cookie', 'cat', 0]].map(([fmt, pet, rnd]) => [`ad-${fmt}`, async (p) => {
    await go(p, '#/play/myth-or-fact'); await p.waitForSelector('.qtext');
    await p.evaluate(async ([pet, rnd]) => { const r = Math.random; Math.random = () => rnd; const m = await import('/ads.js'); m.showHintAd(pet, { seconds: 60, skipAfter: 1 }); Math.random = r; }, [pet, rnd]);
    await p.waitForSelector('.adcard'); await p.waitForTimeout(1300);
  }]),
  ['scorecard', (p) => go(p, '#/card')],
  ['my-pets', (p) => go(p, '#/pets')],
  ['settings', (p) => go(p, '#/settings')],
  ['help-and-feedback', (p) => go(p, '#/help')],
  ['whats-new', (p) => go(p, '#/new')],
  ...['insights', 'add', 'browse', 'reports', 'people', 'feedback', 'settings', 'announce'].map((s) => [`admin-${s}`, async (p) => { await go(p, `#/admin/${s}`); await p.waitForTimeout(500); }])
];

async function sweep(page, folder, report, key) {
  fs.mkdirSync(folder, { recursive: true });
  // login, then every tour slide and the companion picker
  await openApp(page, { signedOut: true, ls: SEED, cfg: fast });
  await page.screenshot({ path: `${folder}/login.png`, fullPage: true }); report[`${key} login`] = await page.evaluate(checks);
  await page.evaluate(() => { localStorage.removeItem('rda_demo_signed_out'); localStorage.setItem('rda_demo_profile', JSON.stringify({ name: 'Teja', tourDone: false })); });
  await page.reload(); await page.waitForSelector('.tour');
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${folder}/tour-${i + 1}.png`, fullPage: true }); report[`${key} tour-${i + 1}`] = await page.evaluate(checks);
    if (i < 8) await page.getByRole('button', { name: 'Next' }).click();
  }
  await page.evaluate((b) => localStorage.setItem('rda_demo_profile', JSON.stringify(b)), busy);
  await page.reload(); await page.waitForSelector('.qhero');
  for (const [name, reach] of SCREENS) {
    try {
      await reach(page);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
      report[`${key} ${name}`] = await page.evaluate(checks);
    } catch (e) { report[`${key} ${name}`] = { error: String(e.message || e).split('\n')[0] }; }
    await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
  }
}

const save = (browserName, key, report) => {
  fs.mkdirSync('tests/reports', { recursive: true });
  fs.writeFileSync(`tests/reports/screens-${browserName}--${key.replace(/[^\w-]/g, '_')}.json`, JSON.stringify(report, null, 1)); // one file per batch, safe in parallel
};

for (const [w, hgt] of SIZES) {
  test(`sizes ${w}x${hgt}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium' && !QUICK.some(([a, b]) => a === w && b === hgt), 'WebKit and Firefox: main sizes only');
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, reducedMotion: 'reduce', hasTouch: w < 900, isMobile: browserName === 'chromium' && w < 900 });
    const page = await ctx.newPage();
    const report = {};
    await sweep(page, `tests/screens/${browserName}/${w}x${hgt}`, report, `${w}x${hgt}`);
    save(browserName, `${w}x${hgt}`, report);
    await ctx.close();
  });
}

// Browser zoom: 125% and 150% shrink the space the page gets (in CSS pixels) and make every pixel bigger.
for (const [w, hgt] of [[1280, 720], [1920, 1080], [390, 844]]) for (const zoom of [1.25, 1.5]) {
  test(`zoom ${Math.round(zoom * 100)}% on ${w}x${hgt}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'zoom: Chromium only');
    const vp = { width: Math.round(w / zoom), height: Math.round(hgt / zoom) };
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: zoom, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); const report = {};
    await sweep(page, `tests/screens/${browserName}/zoom${Math.round(zoom * 100)}-${w}x${hgt}`, report, `zoom${Math.round(zoom * 100)} ${w}x${hgt}`);
    save(browserName, `zoom${Math.round(zoom * 100)}-${w}x${hgt}`, report); await ctx.close();
  });
}

// Text size setting: Compact, Standard (covered above) and Comfortable.
for (const [w, hgt] of [[360, 640], [1280, 720]]) for (const size of ['compact', 'comfortable']) {
  test(`text ${size} on ${w}x${hgt}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'text sizes: Chromium only');
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, reducedMotion: 'reduce', hasTouch: w < 900 });
    const page = await ctx.newPage(); const report = {};
    busy.settings = { ...busy.settings, textSize: size };
    await sweep(page, `tests/screens/${browserName}/text-${size}-${w}x${hgt}`, report, `text-${size} ${w}x${hgt}`);
    busy.settings = { ...busy.settings, textSize: 'standard' };
    save(browserName, `text-${size}-${w}x${hgt}`, report); await ctx.close();
  });
}
