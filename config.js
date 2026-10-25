// Edit this file after you create your Firebase project (see the setup guide).
export const CONFIG = {
  // Only accounts at this email domain can sign in.
  ALLOWED_DOMAIN: 'databeat.io',

  // true  = try the app locally with a fake user and no Firebase (data stays in this browser).
  // false = real Google login and shared data. Set to false once Firebase is configured.
  DEMO_MODE: false,

  FIREBASE: {
    apiKey: 'AIzaSyCe5kRH-q8JKMwUUXMDoFMHQq40oPquaFU',
    authDomain: 'adventure-rd.firebaseapp.com',
    projectId: 'adventure-rd',
    appId: '1:510089681762:web:6ccdebd55cab1ac0c16a3b'
  },

  // Questions are cached in each browser this long, which keeps database reads low.
  CACHE_MINUTES: 360,

  // Joke ad before a hint: total length and when the Skip button appears (seconds).
  AD_SECONDS: 5,
  AD_SKIP_AFTER: 3,

  // Floor goal: completed puzzle rounds across the whole floor each week (no names are shown).
  FLOOR_GOAL: 300,

  // Weekly goal: play on this many different days in a Monday to Sunday week for a bonus.
  WEEK_GOAL_DAYS: 5,
  WEEK_BONUS: 30,

  // Ad-free pass: what it costs in AdCoins and how many days it lasts. Admins can change these in the app.
  AD_FREE_PRICE: 150,
  AD_FREE_DAYS: 7,

  // The pet offers help after this many idle seconds (quiz and puzzle games with a hint).
  IDLE_NUDGE_SECONDS: 15,

  APP_VERSION: '4.0'
};
