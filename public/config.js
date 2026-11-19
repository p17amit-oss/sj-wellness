/* SJ Wellness – settings. None of these are secrets. See README. */
window.SJ_CONFIG = {
  // Apps Script web app URL (Deploy → Manage deployments → Web app URL, ends with /exec)
  API_URL: 'PASTE_APPS_SCRIPT_WEB_APP_URL',
  // How the coach app gets in. Must match AUTH_MODE in the Apps Script properties.
  //   'open'   no login (testing with made-up families only)
  //   'key'    no login screen; the coach opens /coach/?key=<COACH_KEY> once on her phone
  //   'google' Google sign-in (needs the FIREBASE settings below)
  AUTH: 'open',
  // Only for AUTH: 'google' (Project settings → General → Your apps → Config)
  FIREBASE: {
    apiKey: '',
    authDomain: 'PASTE_PROJECT_ID.web.app',
    projectId: '',
    appId: ''
  },
  // Google Maps listing, used for the "Write a Google review" button after feedback
  MAPS_URL: 'https://maps.app.goo.gl/tiZRrPpCCRnW7KR2A'
};
