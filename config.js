// Edit this file after you create your Firebase project (see the setup guide).
export const CONFIG = {
  // Only accounts at this email domain can sign in.
  ALLOWED_DOMAIN: 'databeat.io',

  // true  = try the app locally with a fake user and no Firebase (data stays in this browser).
  // false = real Google login and shared data. Set to false once Firebase is configured.
  DEMO_MODE: true,

  FIREBASE: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  },

  // Questions are cached in each browser this long, which keeps database reads low.
  CACHE_MINUTES: 360,

  // Joke ad before a hint: total length and when the Skip button appears (seconds).
  AD_SECONDS: 5,
  AD_SKIP_AFTER: 3
};
