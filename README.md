# SJ Wellness – parent forms and coach app

Two parent links and one coach app:

| Who | Address | What it does |
|---|---|---|
| Parents | `https://<project>.web.app/join/` | Onboarding form, before the first session. Same link for every family. |
| Parents | `https://<project>.web.app/f/<code>` | Feedback form. One personal link per child, made by the coach app. |
| Coach Sonal | `https://<project>.web.app/coach/` | Installable phone app (PWA). Google sign-in, works offline at the pool. |

```
Parent's phone ──► /join/ or /f/<code>  ──┐
                                           ├─► Apps Script web app ──► Google Sheet "SJ Wellness Data"
Coach app (/coach/, Google sign-in) ──────┘          │                    (Children, Feedback, Links, Referrals)
                                                     └─► email alert to Coach Sonal for every new form
```

**How feedback maps to the right child.** When the coach taps *Ask for feedback*, the server makes a random
32-character code and stores it in the `Links` tab next to that child's ID. The WhatsApp message carries
`/f/<code>`. The feedback page sends only the code; the server looks up the child, shows the parent just the
child's and parent's first names, saves the answers under that child's ID, and closes the code. A used code
shows "Thank you", a made-up code shows "not valid", and codes expire after 60 days.

**Privacy.** Parent pages can only add a form; they can never read anything. Only Google accounts listed in
`COACH_EMAILS` can read data. Text is stored as plain text in the Sheet (no formulas). Keep the Sheet unshared
and turn on 2-step verification for the Google account that owns it.

---

## One-time setup (about 30 minutes)

Use one Google account for everything below. Best: a dedicated account for SJ Wellness that Coach Sonal owns
and you can also sign in to. Whoever owns the Sheet owns the data.

### 1. Firebase project (hosting + sign-in)
1. Go to <https://console.firebase.google.com> → **Create a project** → name it e.g. `sj-wellness`. Analytics: off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Project settings (gear) → General → Your apps → Web (`</>`)** → nickname `web` → Register (no Hosting checkbox needed).
   Copy `apiKey`, `projectId`, `appId` from the config shown.
4. **Authentication → Settings → Authorized domains**: check that `<project>.web.app` is listed (it is by default).
5. Sign-in runs on the `web.app` address, so Google must accept it: open <https://console.cloud.google.com> (same project)
   → **APIs & Services → Credentials → OAuth 2.0 Client IDs → "Web client (auto created by Google Service)"** and add
   - Authorized JavaScript origins: `https://<project>.web.app`
   - Authorized redirect URIs: `https://<project>.web.app/__/auth/handler`
6. Leave the Firebase API key without website restrictions: the server also uses it to check sign-ins.

### 2. Google Sheet + Apps Script (data + server)
1. Create a Google Sheet named **SJ Wellness Data**.
2. **Extensions → Apps Script.** Delete the sample code, paste all of `apps-script/Code.gs`.
   In **Project Settings** tick *Show "appsscript.json"* and replace it with `apps-script/appsscript.json`.
3. **Project Settings → Script properties → Add:**
   - `COACH_EMAILS` = Coach Sonal's Gmail, plus yours, comma separated
   - `NOTIFY_EMAIL` = where new-form alerts go (Coach Sonal's Gmail)
   - `FIREBASE_API_KEY` = the `apiKey` from step 1.3
   - `APP_URL` = `https://<project>.web.app`
4. In the editor choose the function **setup** → **Run** → allow the permissions. Four tabs appear in the Sheet.
5. **Deploy → New deployment → type: Web app** → Execute as **Me** → Who has access **Anyone** → Deploy.
   Copy the **Web app URL** (ends in `/exec`).

Updating the server later: paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
The URL stays the same.

### 3. Fill in `public/config.js`
Put in `API_URL` (step 2.5) and the Firebase values (step 1.3, with `authDomain` = `<projectId>.web.app`),
and the project ID in `.firebaserc`. Commit and push. None of these values are secrets.

### 4. Auto-deploy from GitHub
On a laptop with Node installed, in this repo:
```bash
npx firebase-tools@latest login
npx firebase-tools@latest init hosting:github
#   repository: p17amit-oss/sj-wellness
#   run a build script before every deploy? No
#   deploy to the live channel when a PR is merged? Yes, branch: main
npx firebase-tools@latest deploy --only hosting      # first deploy
git add .github && git commit -m "Add deploy workflows" && git push
```
`init hosting:github` creates a deploy service account and adds it to the repo's secrets for you. After this,
every push to `main` goes live.

### 5. Put the app on Coach Sonal's phone
Open `https://<project>.web.app/coach/` in Chrome (Android) or Safari (iPhone), sign in with her Google account,
then **Install app** (Android) or **Share → Add to Home Screen** (iPhone). Make sure Gmail notifications are on,
because new-form alerts arrive by email.

---

## Check it works (5 minutes)
1. Open `/join/` on your phone, fill a test child, submit. An alert email should arrive and the child shows under **Just joined**.
2. In the coach app open the child → **Ask for feedback** → **Send on WhatsApp** to yourself.
3. Open that link, submit feedback. The child moves to **Feedback received**; check Follow-ups.
4. Open the same link again: it should say thank you. Delete the test rows from the Sheet afterwards.

## Local development
```bash
node tools/dev-server.mjs        # http://localhost:8080/join/ and /coach/ (no sign-in, local test data)
node tools/test-backend.mjs      # 31 checks against the real Code.gs
```
The dev server runs the real `Code.gs` against an in-memory stand-in for the Sheet.

## Limits worth knowing
- Apps Script answers in about 1–3 seconds; fine for one coach and a few hundred families.
- Alerts are emails (Gmail notification on her phone), not app push notifications.
- Consumer Google accounts can send about 100 emails a day from Apps Script.
- If two forms arrive in the same second, a lock makes them wait their turn; nothing is lost.
