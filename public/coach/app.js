/* SJ Wellness – coach app (installable PWA at /coach/). Needs config.js and common.js loaded first. */
const CFG = window.SJ_CONFIG || {};
const FB_VER = '13.2.0';
const CACHE_KEY = 'sjw_coach_cache_v1';
const JOIN_DAYS = 30; // a child counts as "Just joined" for their first month
const ROOT = document.getElementById('app');

/* ---------------- state ---------------- */
let FB = null;           // { auth, mods } once Firebase loads
let USER = null;         // signed-in user (or dev user)
let DATA = null;         // last data from the server
let LOADED_AT = 0;
let FROM_CACHE = false;
let LOADING = false;
const C = { screen: 'children', view: 'list', q: '', stage: 'all', fu: 'continue', openKey: null, listY: 0 };
let KIDS = [], REFS = [], VOICES = [];

/* ---------------- start-up ---------------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/coach/sw.js', { scope: '/coach/' }).catch(() => {});
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (DATA) rerender(); });

boot();

async function boot() {
  page('Opening…', '', true);
  if (CFG.DEV_AUTH) { USER = { email: 'dev@localhost', getIdToken: async () => 'dev' }; return start(); }
  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`);
    const app = appMod.initializeApp(CFG.FIREBASE);
    const auth = authMod.getAuth(app);
    FB = { auth, mods: authMod };
    authMod.getRedirectResult(auth).catch((err) => signInScreen(friendlyAuthError(err)));
    authMod.onAuthStateChanged(auth, (u) => {
      if (u) { if (!USER || USER.uid !== u.uid) { USER = u; start(); } }
      else { USER = null; signInScreen(); }
    });
  } catch (err) {
    // Usually offline: show the last saved copy if there is one.
    if (loadCache()) { FROM_CACHE = true; buildCoach(); render(); }
    else page('You are offline', 'Connect to the internet once to sign in. After that, the app also works at the pool without signal.');
  }
}

function signInScreen(error) {
  ROOT.textContent = '';
  ROOT.appendChild(h('div', { class: 'center-page' },
    h('div', { class: 'mono', 'aria-hidden': 'true', text: 'SJ' }),
    h('h1', { text: 'SJ Wellness coach app' }),
    h('p', { text: 'Sign in with the Google account that Coach Sonal uses.' }),
    h('button', { type: 'button', class: 'gbtn', onclick: signIn }, icon('lock'), 'Sign in with Google'),
    error && h('p', { class: 'err', role: 'alert' }, icon('alert'), error)));
}
async function signIn() {
  const { auth, mods } = FB;
  const provider = new mods.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  try {
    if (standalone) await mods.signInWithRedirect(auth, provider);
    else await mods.signInWithPopup(auth, provider);
  } catch (err) {
    if (/popup/.test(err.code || '')) { try { await mods.signInWithRedirect(auth, provider); return; } catch (e) { err = e; } }
    if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') signInScreen(friendlyAuthError(err));
  }
}
function friendlyAuthError(err) {
  if (!err) return '';
  if (err.code === 'auth/network-request-failed') return 'No internet connection. Please try again.';
  if (err.code === 'auth/unauthorized-domain') return 'This web address is not allowed in Firebase sign-in settings yet.';
  return 'Sign-in did not work. Please try again.';
}
async function signOutNow() {
  try { store && store.removeItem(CACHE_KEY); } catch (e) {}
  DATA = null;
  if (FB) await FB.mods.signOut(FB.auth); else location.reload();
}

function page(title, text, spinner) {
  ROOT.textContent = '';
  ROOT.appendChild(h('div', { class: 'center-page' },
    h('div', { class: 'mono', 'aria-hidden': 'true', text: 'SJ' }),
    h('h1', { text: title }), text && h('p', { text: text }),
    spinner && h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' })));
}

async function token() { return USER ? USER.getIdToken() : ''; }
async function call(action, payload) {
  try { return await api(action, payload, await token()); }
  catch (err) {
    if (err.code === 'AUTH') { toast('Please sign in again.'); if (FB) FB.mods.signOut(FB.auth); }
    throw err;
  }
}

async function start() {
  if (loadCache()) { FROM_CACHE = true; buildCoach(); render(); } else page('Loading your swimmers…', '', true);
  await refresh(true);
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 3 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && USER && Date.now() - LOADED_AT > 60 * 1000) refresh(); });
window.addEventListener('online', () => { if (USER) refresh(); });

async function refresh(first) {
  if (LOADING) return;
  LOADING = true;
  try {
    const d = await call('getAll', {});
    DATA = d; LOADED_AT = Date.now(); FROM_CACHE = false; saveCache();
    buildCoach(); rerender();
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      ROOT.textContent = '';
      ROOT.appendChild(h('div', { class: 'center-page' }, h('div', { class: 'mono', text: 'SJ' }), h('h1', { text: 'This account is not allowed' }),
        h('p', { text: err.message + ' Sign in with Coach Sonal’s account, or ask Amit to add this one.' }),
        h('button', { type: 'button', class: 'btn btn-main', style: 'margin-top:24px', onclick: signOutNow }, 'Use a different account')));
    } else if (err.code !== 'AUTH') {
      if (DATA) { FROM_CACHE = true; rerender(); if (!first) toast(err.message); }
      else page('Could not load', err.message);
    }
  } finally { LOADING = false; }
}
function saveCache() { try { store && store.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: DATA })); } catch (e) {} }
function loadCache() {
  try { const c = JSON.parse((store && store.getItem(CACHE_KEY)) || 'null'); if (c && c.data) { DATA = c.data; LOADED_AT = c.at; return true; } } catch (e) {}
  return false;
}

/* ---------------- data → children ---------------- */
const CRIT = { 'Seizures or epilepsy': 'Seizures', 'Heart condition': 'Heart condition', 'Asthma or breathing difficulty': 'Breathing' };
const WARN = { 'Ear infections or ear tubes': 'Ears', 'Skin condition or allergy': 'Skin or allergy', 'Low muscle tone': 'Low muscle tone' };
const COND = { 'Autism (ASD)': 'autism', 'ADHD': 'ADHD', 'Down syndrome': 'Down syndrome', 'Cerebral palsy': 'cerebral palsy', 'Developmental delay': 'developmental delay', 'Intellectual disability': 'an intellectual disability', 'Sensory processing': 'sensory needs', 'Speech delay': 'speech delay' };
const STAGES = [
  { k: 'new', label: 'Just joined', hint: 'Onboarding form received. Read it before the first session.' },
  { k: 'swim', label: 'Swimming', hint: 'In their course. Ask for feedback when it ends.' },
  { k: 'asked', label: 'Feedback asked', hint: 'Course finished. Waiting for the parent to reply.' },
  { k: 'done', label: 'Feedback received', hint: 'Course finished and feedback is in.' }
];
const byTime = (f) => (a, b) => (String(a[f]) < String(b[f]) ? -1 : 1);
function flagsFor(p) {
  const out = [];
  (p.conditions || []).forEach((c) => { if (CRIT[c]) out.push({ t: CRIT[c], crit: true }); else if (WARN[c]) out.push({ t: WARN[c] }); });
  if (p.medicines === 'Yes') out.push({ t: 'Takes medicines' });
  if (p.water === 'Nervous or scared') out.push({ t: 'Scared of water' });
  if (p.water === 'Has never been in a pool') out.push({ t: 'First time in a pool' });
  if (p.toilet === 'Needs help' || p.toilet === 'Uses diapers') out.push({ t: 'Needs toilet help' });
  return out;
}
function relLower(r) { return r ? r.toLowerCase() : 'parent'; }
function relWord(c) { return c.p.p1Relation === 'Mother' ? 'mother' : c.p.p1Relation === 'Father' ? 'father' : 'parent'; }
function ofChild(c) { const d = (c.p.diagnosis || []).filter((x) => COND[x]); return (c.age != null ? 'of a ' + c.age + '-year-old' : 'of a young swimmer') + (d.length ? ' with ' + COND[d[0]] : ''); }
function cap1(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function buildCoach() {
  const d = DATA || { children: [], feedback: [], links: [], referrals: [] };
  KIDS = (d.children || []).map((ch) => {
    const p = ch.data || {};
    const c = { key: ch.id, row: ch, p, joined: ch.createdAt, updated: ch.updatedAt };
    c.fbs = (d.feedback || []).filter((f) => f.childId === ch.id).sort(byTime('submittedAt'));
    c.fb = c.fbs.length ? c.fbs[c.fbs.length - 1] : null;
    const open = (d.links || []).filter((l) => l.childId === ch.id && l.status === 'open' && !l.expired).sort(byTime('createdAt'));
    c.link = open.length ? open[open.length - 1] : null;
    c.req = c.link && c.link.sentAt ? c.link.sentAt : null;
    c.pending = !!c.req;
    c.newOb = ch.seen !== true;
    c.newFb = c.fbs.some((f) => f.seen !== true);
    c.unseen = c.newOb || c.newFb;
    c.name = niceName(p.childName || ch.childName) || 'Unnamed child';
    c.first = firstName(p.nickname) || firstName(c.name);
    c.parent = niceName(p.p1Name || ch.parentName) || 'Parent';
    c.age = ageFromDob(p.dob);
    c.flags = flagsFor(p);
    c.lvl = c.flags.some((f) => f.crit) ? 'crit' : c.flags.length ? 'warn' : '';
    c.wantsMore = !!(c.fb && /^Yes/.test(c.fb.continueOn || (c.fb.data || {}).continueOn || ''));
    c.calledBack = !!(c.fb && c.fb.calledBack === true);
    c.stage = c.pending ? 'asked' : c.fb ? 'done' : ((Date.now() - new Date(c.joined)) / 864e5 <= JOIN_DAYS ? 'new' : 'swim');
    return c;
  });
  const kidById = {}; KIDS.forEach((c) => { kidById[c.key] = c; });
  REFS = (d.referrals || []).filter((r) => kidById[r.childId]).map((r) => ({ id: r.id, name: niceName(r.name), mobile: r.mobile, date: r.createdAt, kid: kidById[r.childId], done: r.contacted === true }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  VOICES = KIDS.filter((c) => c.fb && /^Yes/.test(c.fb.referenceOk || (c.fb.data || {}).referenceOk || ''));
}
function counts() {
  return {
    unread: KIDS.filter((c) => c.unseen).length,
    toCall: KIDS.filter((c) => c.wantsMore && !c.calledBack).length,
    newRefs: REFS.filter((r) => !r.done).length
  };
}

/* ---------------- rendering ---------------- */
function render() {
  ROOT.textContent = '';
  let screen = null;
  if (C.view === 'detail') {
    const c = KIDS.find((x) => x.key === C.openKey);
    if (c) screen = detail(c); else C.view = 'list';
  }
  if (!screen) screen = C.screen === 'follow' ? followScreen() : childrenScreen();
  ROOT.appendChild(screen);
  ROOT.appendChild(bottomNav());
  const n = counts().unread;
  document.title = (n ? '(' + n + ') ' : '') + 'SJ Wellness coach';
  if (navigator.setAppBadge) { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); }
}
function rerender() { if (!DATA) return; const y = window.scrollY; render(); window.scrollTo(0, y); }
function go(screen) { C.screen = screen; C.view = 'list'; C.openKey = null; C.q = ''; render(); window.scrollTo(0, 0); }

function bottomNav() {
  const k = counts();
  const items = [['children', 'users', 'Children', k.unread], ['follow', 'phone', 'Follow-ups', k.toCall + k.newRefs]];
  return h('nav', { class: 'bnav', 'aria-label': 'Main' }, h('div', { class: 'bnav-in' }, items.map((it) =>
    h('button', { type: 'button', class: 'bn', 'aria-current': C.screen === it[0] && C.view === 'list' ? 'page' : null, onclick: () => go(it[0]) },
      icon(it[1]), h('span', { text: it[2] }), it[3] ? h('span', { class: 'dot bn-dot', text: String(it[3]) }) : null))));
}
function screenHead(title, sub) {
  return h('header', { class: 'c-head' }, h('div', null, h('p', { class: 'c-brand', text: 'SJ Wellness' }), h('h1', { class: 'c-title', text: title }), sub && h('p', { class: 'c-sum', text: sub })));
}
function syncLine() {
  const when = LOADED_AT ? relTime(LOADED_AT) : 'not yet';
  return h('div', null,
    FROM_CACHE && h('p', { class: 'banner' }, icon('wifi'), 'Offline. Showing details saved ' + when + '.'),
    h('div', { class: 'sync' }, h('span', { text: 'Updated ' + when }),
      h('button', { type: 'button', class: 'linkbtn', onclick: () => { toast('Refreshing…'); refresh(); } }, 'Refresh')));
}
function relTime(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const hrs = Math.round(m / 60); if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  return relDate(new Date(ms).toISOString());
}
function installCard() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || (store && store.getItem('sjw_install_dismissed'))) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installEvt && !ios) return null;
  const dismiss = () => { try { store && store.setItem('sjw_install_dismissed', '1'); } catch (e) {} rerender(); };
  return h('div', { class: 'install' },
    h('p', null, h('strong', { text: 'Put this app on your home screen. ' }), ios ? 'Tap the Share button, then “Add to Home Screen”.' : 'It opens like any other app and works at the pool without signal.'),
    h('div', { class: 'fu-foot' },
      installEvt && h('button', { type: 'button', class: 'mini mini-strong', onclick: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; rerender(); } }, icon('download'), 'Install app'),
      h('button', { type: 'button', class: 'linkbtn', onclick: dismiss }, 'Not now')));
}
function empty(t, s) { return h('div', { class: 'empty' }, h('strong', { text: t }), s); }

/* ---------- Children (by stage) ---------- */
function childrenScreen() {
  const cv = h('div', { class: 'cv app' }, screenHead('Your swimmers', KIDS.length + (KIDS.length === 1 ? ' child' : ' children')));
  add(cv, installCard());
  cv.appendChild(syncLine());
  cv.appendChild(h('button', { type: 'button', class: 'btn btn-main block', style: 'margin-top:14px', onclick: openOnboardSheet }, icon('send'), 'Send onboarding form'));
  const list = h('div');
  const s = h('input', { type: 'search', id: 'c_search', placeholder: 'Search by child or parent name', 'aria-label': 'Search by child or parent name' });
  s.value = C.q; s.addEventListener('input', () => { C.q = s.value; fillKids(list); });
  cv.appendChild(h('div', { class: 'search' }, icon('search'), s));
  const bar = h('div', { class: 'stagebar', role: 'group', 'aria-label': 'Show children who are' });
  [{ k: 'all', label: 'All' }].concat(STAGES).forEach((st) => {
    const n = st.k === 'all' ? KIDS.length : KIDS.filter((c) => c.stage === st.k).length;
    bar.appendChild(h('button', { type: 'button', class: 'stg stg-' + st.k, 'aria-pressed': C.stage === st.k ? 'true' : 'false', onclick: () => { C.stage = st.k; rerender(); } },
      h('span', { text: st.label }), h('span', { class: 'stg-n', text: String(n) })));
  });
  cv.appendChild(bar);
  fillKids(list);
  cv.appendChild(list);
  cv.appendChild(h('p', { class: 'signout' }, 'Signed in as ' + (USER && USER.email || '') + '. ', h('button', { type: 'button', class: 'linkbtn', onclick: signOutNow }, 'Sign out')));
  return cv;
}
function fillKids(list) {
  list.textContent = '';
  if (!KIDS.length) { list.appendChild(empty('No children yet', 'Tap “Send onboarding form” to share it on WhatsApp. New forms appear here.')); return; }
  const q = C.q.trim().toLowerCase(), qd = digits(q);
  const items = KIDS.filter((c) => !q || [c.name, c.parent, niceName(c.p.p2Name), niceName(c.p.nickname)].join(' ').toLowerCase().includes(q) || (qd.length >= 3 && phone10(c.p.p1Mobile).includes(qd)));
  let any = false;
  STAGES.forEach((st) => {
    if (C.stage !== 'all' && C.stage !== st.k) return;
    const group = items.filter((c) => c.stage === st.k);
    if (!group.length) return;
    any = true;
    group.sort((a, b) => (b.unseen - a.unseen) || (st.k === 'asked' ? (a.req < b.req ? -1 : 1) : st.k === 'swim' ? a.name.localeCompare(b.name) : (latest(a) < latest(b) ? 1 : -1)));
    list.appendChild(h('div', { class: 'stage-head stg-' + st.k }, h('h2', null, st.label, h('span', { class: 'stage-n', text: String(group.length) })), h('p', { text: st.hint })));
    list.appendChild(h('div', { class: 'kids' }, group.map(kidCard)));
  });
  if (!any) list.appendChild(empty(q ? 'No match' : 'No one here right now', q ? 'Check the spelling, or try the parent’s name.' : 'Children move here as their course goes on.'));
}
function latest(c) { return c.fb ? c.fb.submittedAt : (c.updated || c.joined); }
function callLink(num, label, cls) { return h('a', { class: cls || 'mini', href: telHref(num) }, icon('phone'), label); }
function waLink(num, label, text, cls) { return h('a', { class: cls || 'mini', href: waHref(num, text), target: '_blank', rel: 'noopener' }, icon('chat'), label); }
function kidCard(c) {
  const bits = [];
  if (c.age != null) bits.push('Age ' + c.age);
  if (c.p.gender && c.p.gender !== 'Prefer not to say') bits.push(c.p.gender.toLowerCase());
  const showFlags = c.stage === 'new' || c.stage === 'swim';
  const shown = c.flags.slice(0, 3), more = c.flags.length - shown.length;
  const fb = c.fb || {};
  const badge = c.newOb ? 'Unread form' : c.newFb ? 'New feedback' : '';
  const wa = c.p.waSame === false ? c.p.whatsapp : c.p.p1Mobile;
  const body = h('button', { type: 'button', class: 'kid-open', onclick: () => openKid(c.key) },
    h('span', { class: 'av', text: initials(c.name) }),
    h('span', { class: 'kid-main' },
      h('span', { class: 'kid-top' }, h('span', { class: 'kid-name', text: c.name }), badge && h('span', { class: 'pill-new', text: badge })),
      h('span', { class: 'kid-sub', text: bits.join(', ') + (bits.length ? '. ' : '') + c.parent + ', ' + relLower(c.p.p1Relation) }),
      c.stage === 'new' && h('span', { class: 'kid-sub', text: 'Joined ' + relDate(c.joined) }),
      c.stage === 'swim' && h('span', { class: 'kid-sub', text: 'Swimming since ' + monthYear(c.joined) }),
      c.stage === 'asked' && h('span', { class: 'kid-status' }, h('span', { class: 'st st-wait', text: 'Asked ' + relDate(c.req) })),
      c.stage === 'done' && h('span', { class: 'kid-status' },
        h('span', { class: 'st ' + (fb.rating === 'Not happy' ? 'st-bad' : fb.rating === 'It was okay' ? 'st-wait' : 'st-ok'), text: fb.rating || 'Feedback' }),
        c.wantsMore && h('span', { class: 'st st-ok', text: 'Wants to continue' }),
        h('span', { class: 'kid-sub', text: relDate(fb.submittedAt) })),
      showFlags && c.flags.length ? h('span', { class: 'flags' },
        shown.map((f) => h('span', { class: 'flag' + (f.crit ? ' crit' : '') }, icon('alert'), f.t)),
        more > 0 && h('span', { class: 'flag more', text: '+' + more + ' more' })) : null),
    h('span', { class: 'chev' }, icon('right')));
  const act = h('div', { class: 'kid-acts' });
  if (c.stage === 'new') {
    act.appendChild(callLink(c.p.p1Mobile, 'Call ' + firstName(c.parent)));
    act.appendChild(waLink(wa, 'WhatsApp'));
  } else if (c.stage === 'swim') {
    act.appendChild(h('button', { type: 'button', class: 'mini mini-strong', onclick: () => openFeedbackSheet(c, false) }, icon('send'), 'Ask for feedback'));
  } else if (c.stage === 'asked') {
    act.appendChild(h('button', { type: 'button', class: 'mini mini-strong', onclick: () => openFeedbackSheet(c, true) }, icon('chat'), 'Send a reminder'));
  } else {
    act.appendChild(h('button', { type: 'button', class: 'mini', onclick: () => openKid(c.key) }, icon('heart'), 'Read feedback'));
    if (c.wantsMore && !c.calledBack) act.appendChild(callLink(c.p.p1Mobile, 'Call to plan next round', 'mini mini-strong'));
  }
  return h('div', { class: 'kid stage-' + c.stage + (c.unseen ? ' is-new' : '') + (showFlags && c.lvl ? ' lvl-' + c.lvl : '') }, body, act);
}

/* ---------- Follow-ups ---------- */
function followScreen() {
  const toCall = KIDS.filter((c) => c.wantsMore && !c.calledBack).sort((a, b) => (a.fb.submittedAt < b.fb.submittedAt ? 1 : -1));
  const called = KIDS.filter((c) => c.wantsMore && c.calledBack);
  const refsNew = REFS.filter((r) => !r.done), refsDone = REFS.filter((r) => r.done);
  const cv = h('div', { class: 'cv app' }, screenHead('Follow-ups', 'People to call, and numbers you may share.'));
  cv.appendChild(syncLine());
  const tiles = [
    { k: 'continue', n: toCall.length, label: 'Want to continue', sub: 'to call' },
    { k: 'refs', n: refsNew.length, label: 'Referrals', sub: 'new families' },
    { k: 'share', n: VOICES.length, label: 'Can share number', sub: 'parents' }
  ];
  cv.appendChild(h('div', { class: 'tiles', role: 'tablist', 'aria-label': 'Follow-up lists' }, tiles.map((t) =>
    h('button', { type: 'button', role: 'tab', class: 'tile tile-' + t.k, 'aria-selected': C.fu === t.k ? 'true' : 'false', onclick: () => { C.fu = t.k; rerender(); } },
      h('span', { class: 'tile-n', text: String(t.n) }), h('span', { class: 'tile-l', text: t.label }), h('span', { class: 'tile-s', text: t.sub })))));
  const box = h('div', { role: 'tabpanel' });
  if (C.fu === 'continue') {
    box.appendChild(h('p', { class: 'fu-intro', text: 'These parents said yes to more sessions. Call them to plan the next round.' }));
    if (!toCall.length) box.appendChild(empty('No calls pending', 'Parents who want to continue will appear here.'));
    toCall.forEach((c) => {
      box.appendChild(h('div', { class: 'card fu' },
        h('div', { class: 'card-top' }, h('strong', { text: c.parent }), h('span', { class: 'kid-sub', text: relDate(c.fb.submittedAt) })),
        h('p', { class: 'card-sub', text: c.first + '’s ' + relWord(c) + '. Rated the course: ' + String(c.fb.rating || '').toLowerCase() + '.' }),
        acts(c.p.p1Mobile, c.p.waSame === false ? c.p.whatsapp : null),
        h('div', { class: 'fu-foot' },
          h('button', { type: 'button', class: 'linkbtn', onclick: () => openKid(c.key) }, 'Open ' + c.first + '’s page'),
          h('button', { type: 'button', class: 'mini', onclick: () => setCalled(c) }, icon('check'), 'Done'))));
    });
    if (called.length) { box.appendChild(h('h2', { class: 'sec', text: 'Done' })); called.forEach((c) => box.appendChild(h('p', { class: 'done-row', text: c.parent + ', ' + c.first + '’s ' + relWord(c) }))); }
  } else if (C.fu === 'refs') {
    box.appendChild(h('p', { class: 'fu-intro', text: 'Families recommended by your parents. They have agreed to a call from you.' }));
    if (!refsNew.length) box.appendChild(empty('No new referrals', 'They arrive with feedback.'));
    refsNew.forEach((r) => {
      box.appendChild(h('div', { class: 'card fu' },
        h('div', { class: 'card-top' }, h('strong', { text: r.name }), h('span', { class: 'kid-sub', text: relDate(r.date) })),
        h('p', { class: 'card-sub', text: 'Recommended by ' + r.kid.parent + ', ' + r.kid.first + '’s ' + relWord(r.kid) + '.' }),
        acts(r.mobile, null),
        h('div', { class: 'fu-foot' },
          h('button', { type: 'button', class: 'mini', onclick: () => openReferralSheet(r) }, icon('send'), 'Send onboarding form'),
          h('button', { type: 'button', class: 'mini', onclick: () => setContacted(r) }, icon('check'), 'Contacted'))));
    });
    if (refsDone.length) { box.appendChild(h('h2', { class: 'sec', text: 'Contacted' })); refsDone.forEach((r) => box.appendChild(h('p', { class: 'done-row', text: r.name + ', recommended by ' + r.kid.parent }))); }
  } else {
    box.appendChild(h('p', { class: 'fu-intro', text: 'These parents agreed you may give their number to new families who want to talk to someone.' }));
    if (!VOICES.length) box.appendChild(empty('No one yet', 'Parents who agree in their feedback will appear here.'));
    VOICES.forEach((c) => {
      const line = 'You can speak to ' + firstName(c.parent) + ', ' + relWord(c) + ' ' + ofChild(c) + ': ' + fmtPhone(c.p.p1Mobile);
      box.appendChild(h('div', { class: 'card fu' },
        h('div', { class: 'card-top' }, h('strong', { text: c.parent }), h('span', { class: 'kid-sub', text: fmtPhone(c.p.p1Mobile) })),
        h('p', { class: 'card-sub', text: cap1(relWord(c)) + ' ' + ofChild(c) + '. With you since ' + monthYear(c.joined) + '.' }),
        h('div', { class: 'fu-foot' },
          h('button', { type: 'button', class: 'mini mini-strong', onclick: () => copyText(line, 'Copied. Paste it in the new parent’s chat.') }, icon('copy'), 'Copy to share'),
          callLink(c.p.p1Mobile, 'Call'))));
    });
  }
  cv.appendChild(box);
  return cv;
}
function acts(mobile, wa) {
  const num = fmtPhone(mobile), w = fmtPhone(wa || mobile);
  return h('div', { class: 'acts' },
    h('a', { class: 'act act-call', href: telHref(mobile) }, h('span', null, icon('phone'), 'Call'), h('small', { text: num })),
    h('a', { class: 'act act-wa', href: waHref(wa || mobile), target: '_blank', rel: 'noopener' }, h('span', null, icon('chat'), 'WhatsApp'), h('small', { text: w })));
}

/* ---------- writes (optimistic, then saved to the Sheet) ---------- */
function setCalled(c) {
  c.fb.calledBack = true; buildCoach(); rerender(); toast('Marked as done.');
  call('setCalledBack', { feedbackId: c.fb.id, value: true }).then(saveCache, (e) => { toast(e.message); refresh(); });
}
function setContacted(r) {
  const row = (DATA.referrals || []).find((x) => x.id === r.id); if (row) row.contacted = true;
  buildCoach(); rerender(); toast('Marked as contacted.');
  return call('setContacted', { referralId: r.id, value: true }).then(saveCache, (e) => { toast(e.message); refresh(); });
}
function markSeen(c) {
  if (!c.unseen) return;
  c.row.seen = true; (DATA.feedback || []).forEach((f) => { if (f.childId === c.key) f.seen = true; });
  call('markSeen', { childId: c.key }).then(saveCache, () => {});
}

/* ---------- child page ---------- */
function openKid(key) {
  C.listY = window.scrollY; C.view = 'detail'; C.openKey = key;
  const c = KIDS.find((x) => x.key === key);
  render(); window.scrollTo(0, 0);
  if (c && c.unseen) { markSeen(c); buildCoach(); const nav = ROOT.querySelector('.bnav'); if (nav) nav.replaceWith(bottomNav()); }
}
function closeKid() { C.view = 'list'; C.openKey = null; render(); window.scrollTo(0, C.listY || 0); }
function row(label, val, tone) {
  if (isBlank(val)) return null;
  return h('div', { class: 'row' }, h('p', { class: 'row-l', text: label }), val instanceof Node ? val : h('p', { class: 'row-v' + (tone ? ' ' + tone : ''), text: String(val) }));
}
function block(title, cls, rows, emptyText, ico) {
  const shown = rows.filter(Boolean);
  if (!shown.length && !emptyText) return null;
  return h('section', { class: 'blk ' + (cls || '') }, h('h2', null, ico && icon(ico), title),
    shown.length ? shown : h('p', { class: 'row-v', style: 'color:var(--mist);margin-top:8px', text: emptyText }));
}
function chipList(arr) { return arr && arr.length ? h('div', { class: 'chips' }, arr.map((x) => h('span', { class: 'chip', text: x }))) : null; }
function hasWords(d) { return !isBlank(d.story) || !isBlank(d.nowCan); }
function feedbackBlock(c) {
  const d = c.fb.data || {};
  const foot = h('div', { class: 'blk-foot' },
    c.pending ? h('span', { class: 'st st-wait', text: 'Asked again ' + relDate(c.req) }) :
      h('button', { type: 'button', class: 'linkbtn', onclick: () => openFeedbackSheet(c, false) }, 'Ask for feedback again after the next round'));
  return h('section', { class: 'blk fb' },
    h('h2', null, 'Parent feedback', c.newFb && h('span', { class: 'pill-new', text: 'New' })),
    h('p', { class: 'kid-sub', text: 'From ' + firstName(c.parent) + ', received ' + relDate(c.fb.submittedAt) }),
    row('Overall', d.rating, d.rating === 'Not happy' ? 'crit' : d.rating === 'Very happy' ? 'good' : ''),
    row('Keep swimming?', d.continueOn, /^Yes/.test(d.continueOn || '') ? 'good' : ''),
    row('Changes noticed', chipList(d.changes)),
    row('Can do now', d.nowCan),
    !isBlank(d.story) ? h('blockquote', { class: 'quote', text: '“' + d.story + '”' }) : null,
    row('Could do better', d.better),
    row('May share their words', hasWords(d) ? d.shareWords || 'Not answered' : null),
    row('May share their number with new parents', d.referenceOk),
    foot);
}
function askBlock(c) {
  if (c.pending) {
    return h('section', { class: 'blk plain' }, h('h2', { text: 'Feedback' }),
      h('p', { class: 'row-v', style: 'margin-top:6px', text: 'You asked ' + relDate(c.req) + '. Waiting for ' + firstName(c.parent) + '.' }),
      h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn btn-soft', onclick: () => openFeedbackSheet(c, true) }, icon('chat'), 'Send a reminder')));
  }
  return h('section', { class: 'blk plain' }, h('h2', { text: 'Feedback' }),
    h('p', { class: 'row-v', style: 'margin-top:6px', text: 'When ' + c.first + '’s course ends, ask ' + firstName(c.parent) + ' how it went. It takes them about 2 minutes.' }),
    h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn btn-main', onclick: () => openFeedbackSheet(c, false) }, icon('send'), 'Ask for feedback')));
}
function detail(c) {
  const p = c.p, cv = h('div', { class: 'cv app' });
  const stage = STAGES.find((s) => s.k === c.stage);
  cv.appendChild(h('button', { type: 'button', class: 'back', onclick: closeKid }, icon('left'), 'Back'));
  const sub = [c.age != null ? 'Age ' + c.age : '', p.gender && p.gender !== 'Prefer not to say' ? p.gender : '', p.grade ? 'Class ' + p.grade : '', p.school].filter(Boolean).join(', ');
  cv.appendChild(h('div', { class: 'd-head' },
    h('span', { class: 'av big', text: initials(c.name) }),
    h('div', null,
      h('h1', { class: 'd-name', text: c.name }),
      p.nickname && h('p', { class: 'd-sub', text: 'Likes to be called ' + p.nickname }),
      h('p', { class: 'd-sub', text: sub }),
      h('div', { class: 'kid-status' }, h('span', { class: 'st stage-pill stg-' + c.stage, text: stage.label }), h('span', { class: 'kid-sub', text: 'Joined ' + monthYear(c.joined) })))));
  cv.appendChild(h('section', { class: 'call' },
    h('p', { class: 'call-who' }, c.parent, h('span', { class: 'call-rel', text: p.p1Relation ? ', ' + relLower(p.p1Relation) : '' })),
    acts(p.p1Mobile, p.waSame === false ? p.whatsapp : null)));
  if (c.fb) cv.appendChild(feedbackBlock(c));
  const conds = (p.conditions || []).filter((x) => x !== 'None of these');
  const critCond = conds.some((x) => CRIT[x]) ? 'crit' : '';
  add(cv, block('Before the session', 'safety', [
    row('Health conditions', conds.length ? conds.join(', ') : ((p.conditions || []).length ? 'None reported' : ''), critCond),
    row('What to know', p.conditionsDetail, critCond),
    row('Regular medicines', p.medicines === 'Yes' ? (p.medicinesDetail || 'Yes') : p.medicines === 'No' ? 'None' : ''),
    row('In the water at the start', p.water),
    row('Toilet and changing', p.toilet),
    row('Diagnosis', withOther(p.diagnosis, p.diagnosisOther).join(', ')),
    row('Can be upset by', withOther(p.upsets, p.upsetsOther).join(', '))
  ], 'The parent has not noted anything.', 'alert'));
  add(cv, block('How to connect', 'plain', [row('Communicates', p.communication), row('Calms down with', p.calms), row('Loves', p.loves)], 'Nothing added yet.'));
  add(cv, block('Parent’s goals', 'plain', [row('Top priorities', chipList(p.goals)), row('In their words', p.goalsNote)], 'No goals added yet.'));
  if (!c.fb) cv.appendChild(askBlock(c));
  const fam = h('section', { class: 'blk plain' }, h('h2', { text: 'Family' }));
  [['p1', c.parent], ['p2', niceName(p.p2Name)]].forEach(([pre, name]) => {
    if (!name) return;
    const mob = p[pre + 'Mobile'];
    fam.appendChild(h('div', { class: 'person' },
      h('p', null, h('strong', { text: name }), p[pre + 'Relation'] ? ', ' + relLower(p[pre + 'Relation']) : ''),
      p[pre + 'Occupation'] && h('p', { class: 'kid-sub', text: p[pre + 'Occupation'] }),
      mob && callLink(mob, fmtPhone(mob))));
  });
  add(fam, [row('WhatsApp', p.waSame === false ? fmtPhone(p.whatsapp) : 'Same as mobile'), row('Email', p.email), row('Home address', p.address)]);
  cv.appendChild(fam);
  const th = (p.therapy || []).filter((x) => x !== 'No therapy now');
  add(cv, block('Therapy', 'plain', [
    row('Therapy', th.length ? withOther(th, p.therapistTypeOther).join(', ') : ((p.therapy || []).length ? 'None at the moment' : '')),
    row('Therapist', p.therapistName), row('Therapist contact', p.therapistContact), row('You may speak with the therapist', p.therapistOk)
  ], 'No therapy details given.'));
  add(cv, block('Found you through', 'plain', [row('Source', p.heardFrom === 'Other' ? (p.heardOther || 'Other') : p.heardFrom), row('Referred by', p.referrerName)], ''));
  add(cv, block('Permission', 'plain', [row('Consent to keep these details', p.consent === true ? 'Given on ' + fmtDate(c.updated || c.joined) + ', signed by ' + niceName(p.signature) : 'Not given')], ''));
  const nb = h('section', { class: 'blk plain' }, h('h2', { text: 'My notes' }));
  const ta = h('textarea', { id: 'c_note', rows: 3, placeholder: 'Anything to remember for ' + c.first + '…', 'aria-label': 'My notes for ' + c.name });
  ta.value = c.row.notes || '';
  const saved = h('span', { class: 'saved', 'aria-live': 'polite' });
  nb.appendChild(ta);
  nb.appendChild(h('div', { class: 'note-bar' }, h('button', { type: 'button', class: 'btn btn-main', style: 'flex:none', onclick: async (e) => {
    const btn = e.currentTarget; btn.disabled = true; saved.textContent = 'Saving…';
    try { await call('saveNote', { childId: c.key, note: ta.value }); c.row.notes = ta.value; saveCache(); saved.textContent = 'Note saved'; }
    catch (err) { saved.textContent = ''; toast(err.message); }
    btn.disabled = false; setTimeout(() => { if (saved.textContent === 'Note saved') saved.textContent = ''; }, 2500);
  } }, 'Save note'), saved));
  cv.appendChild(nb);
  const hist = [{ at: c.joined, t: 'Onboarding form' }]
    .concat(c.updated && c.updated !== c.joined ? [{ at: c.updated, t: 'Onboarding form updated' }] : [])
    .concat(c.fbs.map((s) => ({ at: s.submittedAt, t: 'Feedback' })))
    .concat((DATA.links || []).filter((l) => l.childId === c.key && l.sentAt).map((l) => ({ at: l.sentAt, t: 'You asked for feedback' })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  cv.appendChild(h('section', { class: 'blk plain' }, h('h2', { text: 'History' }),
    h('ul', { class: 'forms' }, hist.map((x) => h('li', { text: fmtDate(x.at) + ': ' + x.t })))));
  return cv;
}

/* ---------- sheets (WhatsApp messages) ---------- */
function sheet(title, sub) {
  const root = document.getElementById('sheet-root');
  const body = h('div');
  function close() { root.textContent = ''; document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet_t' },
    h('h2', { id: 'sheet_t', tabindex: '-1', text: title }), sub && h('p', { class: 'card-sub', text: sub }), body,
    h('button', { type: 'button', class: 'btn btn-quiet block', onclick: close }, 'Close'));
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } }, box);
  root.textContent = ''; root.appendChild(bg);
  document.addEventListener('keydown', onKey);
  try { box.querySelector('#sheet_t').focus({ preventScroll: true }); } catch (e) {}
  return { body, close };
}
function sheetActions(sh, msg, waNumber, onSent) {
  sh.body.textContent = '';
  sh.body.appendChild(h('p', { class: 'msg', text: msg }));
  sh.body.appendChild(h('a', { class: 'btn btn-main block', style: 'background:#1E7A4C', href: waHref(waNumber, msg), target: '_blank', rel: 'noopener',
    onclick: () => { if (onSent) onSent(); sh.close(); } }, icon('chat'), 'Send on WhatsApp'));
  sh.body.appendChild(h('button', { type: 'button', class: 'btn btn-soft block', onclick: () => { copyText(msg, 'Message copied.'); if (onSent) onSent(); } }, icon('copy'), 'Copy message'));
}
function openOnboardSheet() {
  const msg = 'Namaste! Before your child’s first swimming session, please fill in this short form so I can plan safe and happy sessions. It takes about 6 minutes.\n\n' + location.origin + '/join/\n\nCoach Sonal, SJ Wellness';
  const sh = sheet('Send onboarding form', 'The same link works for every new family. Choose the parent in WhatsApp.');
  sheetActions(sh, msg, '', null);
}
function openReferralSheet(r) {
  const msg = 'Namaste ' + firstName(r.name) + '! ' + r.kid.parent + ' told me you might like swimming sessions for your child. I am Coach Sonal from SJ Wellness. If you are interested, please fill in this short form so I can plan safe and happy sessions:\n\n' + location.origin + '/join/\n\nCoach Sonal';
  const sh = sheet('Send onboarding form to ' + firstName(r.name), 'A personal note that mentions who recommended you.');
  sheetActions(sh, msg, r.mobile, () => setContacted(r));
}
async function openFeedbackSheet(c, reminder) {
  const pf = firstName(c.parent);
  const sh = sheet(reminder ? 'Send a reminder' : 'Ask ' + pf + ' for feedback', 'This link is only for ' + c.first + '. ' + pf + ' will not need to type in any details again.');
  sh.body.appendChild(h('p', { class: 'sheet-wait' }, h('span', { class: 'spinner' }), 'Preparing ' + c.first + '’s link…'));
  let link;
  try { link = await call('prepareFeedbackLink', { childId: c.key }); }
  catch (err) { sh.body.textContent = ''; sh.body.appendChild(h('p', { class: 'err' }, icon('alert'), err.message)); return; }
  const url = location.origin + '/f/' + link.token;
  const msg = reminder
    ? 'Namaste ' + pf + '! A gentle reminder to share how ' + c.first + '’s swimming went. It takes about 2 minutes.\n\n' + url + '\n\nThank you,\nCoach Sonal'
    : 'Namaste ' + pf + '! ' + c.first + ' has finished this round of swimming sessions. I would love to hear how they went for your family. It takes about 2 minutes.\n\n' + url + '\n\nThank you,\nCoach Sonal, SJ Wellness';
  let marked = false;
  sheetActions(sh, msg, c.p.waSame === false ? c.p.whatsapp : c.p.p1Mobile, () => {
    if (marked) return; marked = true;
    const now = new Date().toISOString();
    const links = DATA.links || (DATA.links = []);
    let l = links.find((x) => x.token === link.token);
    if (!l) { l = { token: link.token, childId: c.key, createdAt: link.createdAt, sentAt: '', remindedAt: '', status: 'open', usedAt: '', expired: false }; links.push(l); }
    if (!l.sentAt) l.sentAt = now; else l.remindedAt = now;
    buildCoach(); rerender(); saveCache();
    if (!reminder) toast(c.first + ' moved to “Feedback asked”.');
    call('markLinkSent', { token: link.token }).catch((e) => toast(e.message));
  });
}
