# Tests for R&D AdVenture

These tests are for checking the app on your computer. They are not part of the website and are never loaded by it.
They run the app in demo mode inside the test browser only, so `config.js` is never changed.

## One-time setup

```
npm install
npx playwright install chromium webkit firefox
```

The Firestore rules tests also need Java 21 or newer on your PATH (for the Firebase emulator).

## Run

| What | Command | Time |
| --- | --- | --- |
| Logic tests (dates, CSV, insights, uploads) | `npx playwright test --project=unit` | seconds |
| Behaviour tests in Chrome, Safari (WebKit) and Firefox | `npx playwright test --project=chromium --project=webkit --project=firefox` | about 10 minutes |
| Firestore rules, in the emulator | `npm run test:rules` | about 1 minute |
| Screenshot sweep with layout checks | `SCREENS=1 npx playwright test --project=screens-chromium` then `node tests/screens/summarize.js` | about 15 minutes |

Screenshots go to `tests/screens/` and reports to `tests/reports/` (both are left out of git).

## What is where

- `helpers.js`: demo mode, small question packs with known answers, and helpers that play each game.
- `e2e/`: the product rules (scoring, hints, badges, goals, menus, admin), keyboard use, security, time zones,
  and Firestore usage (`firestore-usage.spec.js` counts reads and writes with a stand-in Firebase in `mock-firebase/`).
- `unit/`: logic that needs no browser.
- `rules/`: Firestore security rules.
- `screens/`: the screenshot sweep.
