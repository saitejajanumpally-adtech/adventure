# R&D AdVenture (build 4)

A static web app: GitHub Pages for the site, Firebase for login and data.

## Upgrading from build 3 (do this in order)
1. Unzip this file on your computer. You will see a folder called `adventure`.
2. In your GitHub repository, upload everything inside `adventure` and replace the existing files.
   `config.js` already contains your Firebase details, so you do not need to edit it.
3. Open Firebase, then Firestore Database, then Rules. Replace the rules with the contents of `firestore.rules`
   and press Publish. This step matters: the new admin screens, feedback, sign-in tracking and question tallies
   all need the new rules, and they will not save until you publish them.
4. Wait about a minute, then open the live site with a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).
5. Sign in as admin and open Admin. Everything you used to edit in `config.js` or Firebase is now in the app.

## What is new in build 4
- Hints in every game, with limits: one per question in quiz games, 3 per Stack sorter round (once per card),
  2 per Ad-flow round (after your first check), 3 per crossword (one per word) and 1 per Jargon match.
  A hinted item earns half AdCoins and a round with a hint cannot be perfect.
- The pet says what a hint did, and a note appears by the answers. After 15 idle seconds the pet offers help.
- Better hint text for every starter question (myth or fact, acronyms and odd one out).
- Text size: Compact, Standard (default) or Comfortable, in Settings.
- Ad-free pass bought with AdCoins (150 AdCoins for 7 days by default). Level comes from everything earned,
  so spending never lowers it. The top bar shows your spendable balance.
- My pets page (companion, each pet's job and who hosts each game). Settings keeps only real settings.
- Help and feedback form (the page, device type, browser, screen size and app version are attached automatically).
- What's new list and a home page banner.
- Admin area: Insights (any date range, per game and per person, CSV exports), Add questions, Question browser
  (switch off, edit, delete, download a backup), Reports (with history and export), People (add or remove admins,
  reset a player), Feedback inbox (filters and export), Game settings and Announcements.

## Good to know
- Sign-in and daily activity are recorded from the day you publish build 4. Earlier history cannot be recovered,
  so "All time" uses each player's lifetime totals.
- Names and emails in reports appear for each player after their first sign-in on build 4.
- The first admin always stays set in Firebase (the `config/admins` document). In the app you cannot remove
  yourself or the last admin.
- Firebase free plan: about 50,000 reads and 20,000 writes a day. At 250 players normal use is a small fraction.
  Opening Insights reads each player once (cached for 10 minutes, with a Refresh button).

## Settings still in config.js (used until an admin changes them in the app)
`FLOOR_GOAL`, `WEEK_GOAL_DAYS`, `WEEK_BONUS`, `AD_SECONDS`, `AD_SKIP_AFTER`, `AD_FREE_PRICE`, `AD_FREE_DAYS`,
`IDLE_NUDGE_SECONDS`, `APP_VERSION`.
