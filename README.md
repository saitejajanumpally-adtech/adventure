# R&D AdVenture (build 3)

A static web app: GitHub Pages for the site, Firebase for login and data.

## Upgrading from the earlier version (do this in order)
1. Unzip this file on your computer. You will see a folder called `adventure`.
2. In your GitHub repository, upload everything inside `adventure` and replace the existing files.
   `config.js` already contains your Firebase details, so you do not need to edit it.
3. Open Firebase, then Firestore Database, then Rules. Replace the rules with the contents of `firestore.rules`
   (this adds the floor goal counter) and press Publish.
4. Wait about a minute, then open the live site with a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).

## What is in this build
- Full logo (wordmark, flask and R&D Labs) in the top bar on every screen
- New home page: mascot hero with quest, recommended game, level journey, weekly dots, tinted game panels, badges, floor goal
- New play screen: coach panel beside the question (hideable), plain question counter, X to quit, A/B/C/D and M/F keys
- 16 joke ads in 5 formats, two per pet, each with plain-words AdTech small print
- 80 pet lines (8 pets x 5 situations x 2 variants)
- 6 badges with AdCoin rewards, weekly goal bonus (30 AdCoins for 5 days in a week), floor goal (300 rounds a week, no names)
- Profile circle shows your initials; the menu holds scorecard, pet collection, settings, tour and sign out
- Pet pictures are included in `pets/`

## Settings you can change in config.js
`FLOOR_GOAL` (default 300 rounds per week), `WEEK_GOAL_DAYS` (5), `WEEK_BONUS` (30), `AD_SECONDS` (5), `AD_SKIP_AFTER` (3).
