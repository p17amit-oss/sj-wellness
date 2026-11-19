# SJ Wellness – parent forms and coach app

Two parent links and one coach app:

| Who | Address | What it does |
|---|---|---|
| Parents | `https://<your-site>/join/` | Onboarding form, before the first session. Same link for every family. |
| Parents | `https://<your-site>/f/?c=<code>` | Feedback form. One personal link per child, made by the coach app. |
| Coach Sonal | `https://<your-site>/coach/` | Installable phone app (PWA). Works offline at the pool. Login can be switched on later. |

```
Parent's phone ──► /join/ or /f/?c=<code> ┐
                                           ├─► Apps Script web app ──► Google Sheet "SJ Wellness Data"
Coach app (/coach/) ──────────────────────┘          │                    (Children, Feedback, Links, Referrals)
                                                     └─► email alert to Coach Sonal for every new form
```

**How feedback maps to the right child.** When the coach taps *Ask for feedback*, the server makes a random
32-character code and stores it in the `Links` tab next to that child's ID. The WhatsApp message carries
`/f/?c=<code>`. The feedback page sends only the code; the server looks up the child, shows the parent just the
child's and parent's first names, saves the answers under that child's ID, and closes the code. A used code
shows "Thank you", a made-up code shows "not valid", and codes expire after 60 days.

**Coach access (testing phase).** The coach app currently has **no login** (`AUTH_MODE` open). Anyone who
finds the coach address or the server URL can read every child's details, so use **made-up test families
only** until you switch on one of the protected modes below. Parent pages can only add a form in every mode;
they can never read anything. Text is stored as plain text in the Sheet (no formulas).

| Mode | Coach experience | Use when |
|---|---|---|
| `open` | No login | Testing with made-up families |
| `key` | No login screen; she opens a private link `…/coach/?key=…` once and the phone remembers it | Real families, before Google sign-in is set up |
| `google` | Signs in once with her Google account | Long term |

The mode is set in two places that must match: `AUTH_MODE` in the Apps Script properties and `AUTH` in `public/config.js`.

---

## One-time setup for testing (about 20 minutes)

It is a PWA: a website that installs on the phone's home screen and opens like an app. There is no Play Store
or App Store step. The site is only static files (HTML, JS, CSS), so any static host works; the data and server
logic live in Google Sheets + Apps Script.

Use one Google account for the Sheet. Best: a dedicated account for SJ Wellness that Coach Sonal owns and you
can also sign in to. Whoever owns the Sheet owns the data.

### 1. Google Sheet + Apps Script (data + server)
1. Create a Google Sheet named **SJ Wellness Data**.
2. **Extensions → Apps Script.** Delete the sample code, paste all of `apps-script/Code.gs`.
   In **Project Settings** tick *Show "appsscript.json"* and replace it with `apps-script/appsscript.json`.
3. **Project Settings → Script properties → Add:**
   - `NOTIFY_EMAIL` = where new-form alerts go (Coach Sonal's Gmail, or yours while testing)
   - `APP_URL` = the site address from step 3 (you can add it after step 3)
   - (`AUTH_MODE` can stay unset; unset means open.)
4. In the editor choose the function **setup** → **Run** → allow the permissions. Four tabs appear in the Sheet.
5. **Deploy → New deployment → type: Web app** → Execute as **Me** → Who has access **Anyone** → Deploy.
   Copy the **Web app URL** (ends in `/exec`).

Updating the server later: paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
The URL stays the same.

### 2. Fill in `public/config.js`
`API_URL` = the Web app URL from step 1.5. Keep `AUTH: 'open'`. Commit and push. Not a secret.

### 3. Host the site (pick one; every push to `main` then goes live)
- **Cloudflare Pages (recommended):** free, and the free plan allows business use. dash.cloudflare.com →
  **Workers & Pages → Create → Pages → Connect to Git** → choose `p17amit-oss/sj-wellness` → Framework preset
  **None**, Build command **empty**, Build output directory **`public`** → Save and Deploy.
  Address: `https://<project-name>.pages.dev`.
- **Vercel:** what the driver PWA uses. **Add New → Project → import the repo → Framework: Other** → Deploy
  (`vercel.json` already points it at `public/`). Its free Hobby plan is for non-commercial use, so fine for
  testing; once Coach Sonal uses it for her business, move to Cloudflare or Vercel Pro.
- **Firebase Hosting:** `npx firebase-tools@latest init hosting:github` then `deploy --only hosting`
  (`firebase.json` is ready; put the project ID in `.firebaserc`).

Then set `APP_URL` in the Apps Script properties to the site address.

### 4. Put the app on a phone
Open `https://<your-site>/coach/` in Chrome (Android) or Safari (iPhone), then **Install app** (Android)
or **Share → Add to Home Screen** (iPhone). New-form alerts arrive by email, so keep Gmail notifications on.

---

## Before real families: switch on protection

### Option A – private coach link (`key`, 5 minutes, no login screen)
1. Apps Script → Script properties: `AUTH_MODE` = `key`, `COACH_KEY` = a long random text
   (for example two UUIDs from <https://www.uuidgenerator.net/> joined together).
2. `public/config.js`: `AUTH: 'key'`. Push.
3. Send Coach Sonal `https://<your-site>/coach/?key=<COACH_KEY>` once, privately. She opens it and installs
   the app; the phone remembers the key and removes it from the address bar. To lock out an old phone, change `COACH_KEY`.

### Option B – Google sign-in (`google`, 15 minutes)
This is the only part that needs a Firebase project (for Firebase Authentication). The steps below assume the
site is on Firebase Hosting; if it is on Cloudflare or Vercel, use your site address in place of `<project>.web.app`
and ask Claude to switch sign-in to the popup flow.

1. Firebase console → **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
2. **Project settings (gear) → General → Your apps → Web (`</>`)** → nickname `web` → Register.
   Copy `apiKey`, `projectId`, `appId` into `FIREBASE` in `public/config.js` (`authDomain` = `<projectId>.web.app`).
3. **Authentication → Settings → Authorized domains**: check `<project>.web.app` is listed.
4. <https://console.cloud.google.com> (same project) → **APIs & Services → Credentials → OAuth 2.0 Client IDs →
   "Web client (auto created by Google Service)"** and add
   - Authorized JavaScript origins: `https://<project>.web.app`
   - Authorized redirect URIs: `https://<project>.web.app/__/auth/handler`
5. Leave the Firebase API key without website restrictions (the server uses it to check sign-ins).
6. Apps Script → Script properties: `AUTH_MODE` = `google`, `COACH_EMAILS` = her Gmail and yours,
   `FIREBASE_API_KEY` = the `apiKey`. Then `public/config.js`: `AUTH: 'google'`. Push.

Also: keep the Sheet unshared, turn on 2-step verification for its Google account, and delete test rows.

## Check it works (5 minutes)
1. Open `/join/` on your phone, fill a test child, submit. An alert email should arrive and the child shows under **Just joined**.
2. In the coach app open the child → **Ask for feedback** → **Send on WhatsApp** to yourself.
3. Open that link, submit feedback. The child moves to **Feedback received**; check Follow-ups.
4. Open the same link again: it should say thank you. Delete the test rows from the Sheet afterwards.

## Local development
```bash
node tools/dev-server.mjs        # http://localhost:8080/join/ and /coach/ (local test data)
AUTH_MODE=key node tools/dev-server.mjs   # try the private-link mode: /coach/?key=test-coach-key-123
node tools/test-backend.mjs      # 37 checks against the real Code.gs
```
The dev server runs the real `Code.gs` against an in-memory stand-in for the Sheet.

## Limits worth knowing
- Apps Script answers in about 1–3 seconds; fine for one coach and a few hundred families.
- Alerts are emails (Gmail notification on her phone), not app push notifications.
- Consumer Google accounts can send about 100 emails a day from Apps Script.
- If two forms arrive in the same second, a lock makes them wait their turn; nothing is lost.
