# ADVenture by R&D Labs

A game-style AdTech learning app for DataBeat: 8 games, a daily mission, AdCoins and levels, a pet companion and tour,
Google login restricted to @databeat.io, and an admin area for new questions and reported questions.

It is a plain static site (no build step) for GitHub Pages and Firebase's free plan.

## Quick try (no setup)

Run `python3 -m http.server` in this folder and open http://localhost:8000.
The app starts in demo mode: a fake login, and progress stays in that browser.

## Going live

Follow the step-by-step guide that came with this package ("ADVenture Setup Guide").
It covers Firebase, GitHub Pages, testing, adding your logo and pet images, and how to use Claude Code to check the site on different screens.

## Folders and files

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Page and look |
| `app.js` | Screens, tour, home, settings, routing |
| `engines.js` | The eight games, hints, timer |
| `ads.js` | The joke ad that plays before a hint |
| `admin.js` | Add-questions and Reports screens |
| `data.js` | Game list, pets, tour, how-to text, joke ads, starter questions |
| `store.js` | Data layer (demo mode and Firebase) |
| `validate.js` | Upload checks and the AI prompts |
| `crossword.js`, `util.js`, `ui.js` | Helpers |
| `config.js` | Your settings: domain, Firebase keys, demo switch |
| `firestore.rules` | Database security rules |
| `pets/` | Pet images go here (see `pets/README.txt`) |
| `assets/` | Your logo goes here (see `assets/README.txt`) |
