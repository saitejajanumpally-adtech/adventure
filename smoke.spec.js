import { test, expect } from '@playwright/test';
import { openApp, watchErrors, playQuiz, readProfile } from '../helpers.js';
test('smoke: myth or fact round, all right', async ({ page }) => {
  const w = watchErrors(page);
  await openApp(page, { hash: '#/play/myth-or-fact' });
  await playQuiz(page, [true, true, true, true, true, true]);
  const p = await readProfile(page);
  console.log('coins', p.coins, 'badges', Object.keys(p.badges));
  w.expectNone();
});
