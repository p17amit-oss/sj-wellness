/* SJ Wellness – settings. Fill these in once (see README, steps 2 and 3). None of these are secrets. */
window.SJ_CONFIG = {
  // Apps Script web app URL (Deploy → Manage deployments → Web app URL, ends with /exec)
  API_URL: 'PASTE_APPS_SCRIPT_WEB_APP_URL',
  // Firebase web app settings (Project settings → General → Your apps → SDK setup and configuration → Config)
  FIREBASE: {
    apiKey: 'PASTE_FIREBASE_API_KEY',
    authDomain: 'PASTE_PROJECT_ID.web.app',
    projectId: 'PASTE_PROJECT_ID',
    appId: 'PASTE_FIREBASE_APP_ID'
  },
  // Google Maps listing, used for the "Write a Google review" button after feedback
  MAPS_URL: 'https://maps.app.goo.gl/tiZRrPpCCRnW7KR2A',
  // Leave false in production. true skips Google sign-in (local testing only).
  DEV_AUTH: false
};
