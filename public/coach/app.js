/* SJ Wellness – coach app (installable PWA at /coach/). Needs config.js and common.js loaded first. */
const CFG = window.SJ_CONFIG || {};
const FB_VER = '13.2.0';
const CACHE_KEY = 'sjw_coach_cache_v1';
const JOIN_DAYS = 30; // without a recorded first session, a child counts as "Swimming" after a month
const ROOT = document.getElementById('app');
const COACH_FIRST = CFG.COACH_FIRST || 'Sonal';

/* ---------------- state ---------------- */
const MODE = CFG.AUTH === 'google' || CFG.AUTH === 'key' ? CFG.AUTH : 'open';
const KEY_STORE = 'sjw_coach_key';
let COACH_KEY = '';
let FB = null, USER = null, DATA = null, LOADED_AT = 0, FROM_CACHE = false, LOADING = false, STARTED = false;
const C = { screen: 'children', view: 'list', q: '', stage: 'all', fu: 'continue', cond: 'all', openKey: null, listY: 0 };
let KIDS = [], REFS = [], VOICES = [];
let installEvt = null;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/coach/sw.js', { scope: '/coach/' }).catch(() => {});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (DATA) rerender(); });

/* ---------------- start-up and access ---------------- */
async function boot() {
  page('Opening…', '', true);
  if (MODE === 'open') { USER = { email: '' }; return start(); }
  if (MODE === 'key') {
    const fromUrl = new URLSearchParams(location.search).get('key');
    if (fromUrl) { try { store && store.setItem(KEY_STORE, fromUrl); } catch (e) {} history.replaceState(null, '', '/coach/'); }
    COACH_KEY = fromUrl || (store && store.getItem(KEY_STORE)) || '';
    if (!COACH_KEY) { page('Open your coach link', 'Please open the coach link Amit sent you, once. After that this app remembers it.'); return; }
    USER = { email: '' }; return start();
  }
  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`);
    const auth = authMod.getAuth(appMod.initializeApp(CFG.FIREBASE));
    FB = { auth, mods: authMod };
    authMod.getRedirectResult(auth).catch((err) => signInScreen(friendlyAuthError(err)));
    authMod.onAuthStateChanged(auth, (u) => {
      if (u) { if (!USER || USER.uid !== u.uid) { USER = u; start(); } }
      else { USER = null; signInScreen(); }
    });
  } catch (err) {
    if (loadCache()) { FROM_CACHE = true; buildCoach(); render(); }
    else page('You are offline', 'Connect to the internet once to sign in. After that, the app also works at the pool without signal.');
  }
}
function signInScreen(error) {
  ROOT.textContent = '';
  ROOT.appendChild(h('div', { class: 'center' }, h('div', { class: 'mark', text: 'SJ' }),
    h('h1', { text: 'SJ Wellness' }), h('p', { text: 'Sign in with the Google account that Coach Sonal uses.' }),
    h('button', { type: 'button', class: 'btn btn-primary block', onclick: signIn }, icon('lock'), 'Sign in with Google'),
    error && h('p', { class: 'err' }, icon('alert'), error)));
}
async function signIn() {
  const { auth, mods } = FB;
  const provider = new mods.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  try { if (standalone) await mods.signInWithRedirect(auth, provider); else await mods.signInWithPopup(auth, provider); }
  catch (err) {
    if (/popup/.test(err.code || '')) { try { await mods.signInWithRedirect(auth, provider); return; } catch (e) { err = e; } }
    if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') signInScreen(friendlyAuthError(err));
  }
}
function friendlyAuthError(err) {
  if (!err) return '';
  if (err.code === 'auth/network-request-failed') return 'No internet connection. Please try again.';
  if (err.code === 'auth/unauthorized-domain') return 'This web address is not allowed in the sign-in settings yet.';
  return 'Sign-in did not work. Please try again.';
}
async function signOutNow() {
  try { store && store.removeItem(CACHE_KEY); } catch (e) {}
  DATA = null;
  if (MODE === 'google' && FB) await FB.mods.signOut(FB.auth); else location.reload();
}
function page(title, text, spinner) {
  ROOT.textContent = '';
  ROOT.appendChild(h('div', { class: 'center' }, h('div', { class: 'mark', text: 'SJ' }), h('h1', { text: title }),
    text && h('p', { text: text }), spinner && h('div', { class: 'spin', role: 'status', 'aria-label': 'Loading' })));
}

async function token() { return MODE === 'google' && USER ? USER.getIdToken() : ''; }
async function call(action, payload) {
  const body = MODE === 'key' ? Object.assign({ coachKey: COACH_KEY }, payload || {}) : payload;
  try { return await api(action, body, await token()); }
  catch (err) {
    if (err.code === 'AUTH') {
      if (MODE === 'google') { toast('Please sign in again.'); if (FB) FB.mods.signOut(FB.auth); }
      if (MODE === 'key') { try { store && store.removeItem(KEY_STORE); } catch (e) {} page('This coach link is not valid', err.message); }
    }
    if (err.code === 'BAD_REQUEST' && /Unknown action/.test(err.message)) err.message = 'This needs the latest server code. Please update the Apps Script.';
    throw err;
  }
}
async function start() {
  if (loadCache()) { FROM_CACHE = true; buildCoach(); render(); } else page('Loading your swimmers…', '', true);
  await refresh(true);
  if (!STARTED) { STARTED = true; setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 3 * 60 * 1000); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && USER && Date.now() - LOADED_AT > 60 * 1000) refresh(); });
window.addEventListener('online', () => { if (USER) refresh(); });
async function refresh(first) {
  if (LOADING) return;
  LOADING = true;
  try {
    DATA = await call('getAll', {}); LOADED_AT = Date.now(); FROM_CACHE = false; saveCache();
    buildCoach(); rerender();
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      ROOT.textContent = '';
      ROOT.appendChild(h('div', { class: 'center' }, h('div', { class: 'mark', text: 'SJ' }), h('h1', { text: 'This account is not allowed' }),
        h('p', { text: err.message }), h('button', { type: 'button', class: 'btn btn-primary block', onclick: signOutNow }, 'Use a different account')));
    } else if (err.code !== 'AUTH') {
      if (DATA) { FROM_CACHE = true; rerender(); if (!first) toast(err.message); } else page('Could not load', err.message);
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
const COND_SHORT = { 'Autism (ASD)': 'Autism', 'ADHD': 'ADHD', 'Down syndrome': 'Down syndrome', 'Cerebral palsy': 'Cerebral palsy', 'Developmental delay': 'Developmental delay', 'Intellectual disability': 'Intellectual disability', 'Sensory processing': 'Sensory needs', 'Speech delay': 'Speech delay' };
const COND_PHRASE = { 'Autism (ASD)': 'autism', 'ADHD': 'ADHD', 'Down syndrome': 'Down syndrome', 'Cerebral palsy': 'cerebral palsy', 'Developmental delay': 'developmental delay', 'Intellectual disability': 'an intellectual disability', 'Sensory processing': 'sensory needs', 'Speech delay': 'speech delay' };
const STAGES = [
  { k: 'new', label: 'Just joined', hint: 'Read the form before the first session.' },
  { k: 'swim', label: 'Swimming', hint: 'Ask for feedback when the course ends.' },
  { k: 'asked', label: 'Feedback asked', hint: 'Waiting for the parent to reply.' },
  { k: 'done', label: 'Feedback received', hint: 'Course finished.' }
];
const PASTELS = [['#E6EFFA', '#3E6DB5'], ['#E5F0ED', '#2F6B63'], ['#FBF1E4', '#A15F19'], ['#EFEDF9', '#6052A8'], ['#FBEAF0', '#A23E6A'], ['#EAF3E3', '#4C7A2B'], ['#F1EEE8', '#6E5E46']];
const byTime = (f) => (a, b) => (String(a[f]) < String(b[f]) ? -1 : 1);
const daysSince = (iso) => (Date.now() - new Date(iso)) / 864e5;
function relWord(c) { return c.p.p1Relation === 'Mother' ? 'mother' : c.p.p1Relation === 'Father' ? 'father' : 'parent'; }
function mainCond(c) { const d = (c.p.diagnosis || []).find((x) => COND_SHORT[x]); return d || ''; }
function ofChild(c) { const d = mainCond(c); return (c.age != null ? 'of a ' + c.age + '-year-old' : 'of a young swimmer') + (d ? ' with ' + COND_PHRASE[d] : ''); }
function careNotes(p) {
  const out = [];
  (p.conditions || []).forEach((x) => { if (CRIT[x]) out.push({ t: CRIT[x], crit: true }); else if (WARN[x]) out.push({ t: WARN[x] }); });
  if (p.medicines === 'Yes') out.push({ t: 'Medicines' });
  if (p.water === 'Nervous or scared') out.push({ t: 'Scared of water' });
  if (p.water === 'Has never been in a pool') out.push({ t: 'First time in a pool' });
  if (p.toilet === 'Needs help' || p.toilet === 'Uses diapers') out.push({ t: 'Toilet help' });
  return out;
}
function avatar(c, lg) {
  let n = 0; String(c.name).split('').forEach((ch) => { n = (n * 31 + ch.charCodeAt(0)) >>> 0; });
  const [bg, fg] = PASTELS[n % PASTELS.length];
  return h('span', { class: 'ava' + (lg ? ' lg' : ''), style: 'background:' + bg + ';color:' + fg, 'aria-hidden': 'true', text: initials(c.name) });
}
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
    c.reminded = c.link && c.link.remindedAt ? c.link.remindedAt : null;
    c.pending = !!c.req;
    c.newOb = ch.seen !== true;
    c.newFb = c.fbs.some((f) => f.seen !== true);
    c.unseen = c.newOb || c.newFb;
    c.name = niceName(p.childName || ch.childName) || 'Unnamed child';
    c.first = firstName(p.nickname) || firstName(c.name);
    c.parent = niceName(p.p1Name || ch.parentName) || 'Parent';
    c.age = ageFromDob(p.dob);
    c.care = careNotes(p);
    c.started = ch.startedOn ? String(ch.startedOn).slice(0, 10) : '';
    c.swimSince = c.started || (daysSince(c.joined) > JOIN_DAYS ? c.joined : '');
    c.wantsMore = !!(c.fb && /^Yes/.test(c.fb.continueOn || (c.fb.data || {}).continueOn || ''));
    c.calledBack = !!(c.fb && c.fb.calledBack === true);
    c.unhappy = !!(c.fb && c.fb.rating === 'Not happy');
    c.needsCall = (c.wantsMore || c.unhappy) && !c.calledBack;
    c.stage = c.pending ? 'asked' : c.fb ? 'done' : c.swimSince ? 'swim' : 'new';
    return c;
  });
  const kidById = {}; KIDS.forEach((c) => { kidById[c.key] = c; });
  REFS = (d.referrals || []).filter((r) => kidById[r.childId]).map((r) => ({ id: r.id, name: niceName(r.name), mobile: r.mobile, date: r.createdAt, kid: kidById[r.childId], done: r.contacted === true }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  VOICES = KIDS.filter((c) => c.fb && /^Yes/.test(c.fb.referenceOk || (c.fb.data || {}).referenceOk || ''));
}
function counts() {
  return { unread: KIDS.filter((c) => c.unseen).length, toCall: KIDS.filter((c) => c.wantsMore && !c.calledBack).length, newRefs: REFS.filter((r) => !r.done).length };
}

/* ---------------- frame ---------------- */
function render() {
  ROOT.textContent = '';
  let screen = null;
  if (C.view === 'detail') { const c = KIDS.find((x) => x.key === C.openKey); if (c) screen = detail(c); else C.view = 'list'; }
  if (!screen) screen = C.screen === 'follow' ? followScreen() : childrenScreen();
  ROOT.appendChild(screen);
  ROOT.appendChild(nav());
  const n = counts().unread;
  document.title = (n ? '(' + n + ') ' : '') + 'SJ Wellness';
  if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
function rerender() { if (!DATA) return; const y = window.scrollY; render(); window.scrollTo(0, y); }
function go(screen) { C.screen = screen; C.view = 'list'; C.openKey = null; C.q = ''; render(); window.scrollTo(0, 0); }
function nav() {
  const k = counts();
  const items = [['children', 'users', 'Children', k.unread], ['follow', 'phone', 'Follow-ups', k.toCall + k.newRefs]];
  return h('nav', { class: 'nav', 'aria-label': 'Main' }, h('div', { class: 'nav-in' }, items.map(([id, ic, label, n]) =>
    h('button', { type: 'button', class: 'nav-b', 'aria-current': C.screen === id && C.view === 'list' ? 'page' : null, onclick: () => go(id) },
      icon(ic), h('span', { text: label }), n ? h('span', { class: 'badge', text: String(n) }) : null))));
}
function greeting() { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; }
function syncLine() {
  return h('div', null,
    FROM_CACHE && h('p', { class: 'offline' }, icon('wifi'), 'Offline. Showing details saved ' + relTime(LOADED_AT) + '.'),
    h('p', { class: 'sync' }, 'Updated ' + relTime(LOADED_AT), h('button', { type: 'button', onclick: () => { toast('Refreshing…'); refresh(); } }, 'Refresh')));
}
function relTime(ms) {
  if (!ms) return 'not yet';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const hr = Math.round(m / 60); if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
  return relDate(new Date(ms).toISOString());
}
function installCard() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || (store && store.getItem('sjw_install_dismissed'))) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installEvt && !ios) return null;
  const dismiss = () => { try { store && store.setItem('sjw_install_dismissed', '1'); } catch (e) {} rerender(); };
  return h('div', { class: 'card install' },
    h('p', { text: ios ? 'Add this app to your home screen: tap Share, then “Add to Home Screen”.' : 'Install this app on your phone. It also works at the pool without signal.' }),
    installEvt && h('button', { type: 'button', class: 'pill', onclick: async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; rerender(); } }, 'Install'),
    h('button', { type: 'button', class: 'x', 'aria-label': 'Not now', onclick: dismiss }, icon('x')));
}
function empty(t, s) { return h('div', { class: 'empty' }, h('strong', { text: t }), s); }
function callBtn(num, label) { return h('a', { class: 'icon-btn', href: telHref(num), 'aria-label': label || 'Call' }, icon('phone')); }
function waBtn(num, label, text) { return h('a', { class: 'icon-btn wa', href: waHref(num, text), target: '_blank', rel: 'noopener', 'aria-label': label || 'WhatsApp' }, icon('chat')); }
function waNumber(c) { return c.p.waSame === false && c.p.whatsapp ? c.p.whatsapp : c.p.p1Mobile; }

/* ---------------- Children ---------------- */
function childrenScreen() {
  const k = counts();
  const s = h('div', { class: 'screen' });
  s.appendChild(h('header', { class: 'top' },
    h('div', null, h('p', { class: 'hello', text: greeting() + ', ' + COACH_FIRST }), h('h1', { class: 'title', text: 'Your swimmers' }),
      h('p', { class: 'sub', text: KIDS.length + (KIDS.length === 1 ? ' child' : ' children') + (k.unread ? ' · ' + k.unread + ' new' : '') })),
    h('button', { type: 'button', class: 'pill', onclick: openOnboardSheet }, icon('send'), 'Send form')));
  s.appendChild(syncLine());
  add(s, installCard());
  const list = h('div');
  const q = h('input', { type: 'search', id: 'c_search', placeholder: 'Search child or parent', 'aria-label': 'Search child or parent' });
  q.value = C.q; q.addEventListener('input', () => { C.q = q.value; fillKids(list); });
  s.appendChild(h('div', { class: 'search' }, icon('search'), q));
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Show' });
  [{ k: 'all', label: 'All' }].concat(STAGES).forEach((st) => {
    const n = st.k === 'all' ? KIDS.length : KIDS.filter((c) => c.stage === st.k).length;
    chips.appendChild(h('button', { type: 'button', class: 'chip st-' + st.k, 'aria-pressed': C.stage === st.k ? 'true' : 'false', onclick: () => { C.stage = st.k; rerender(); } },
      st.k !== 'all' && h('span', { class: 'dot' }), st.label, h('span', { class: 'n', text: String(n) })));
  });
  s.appendChild(chips);
  fillKids(list);
  s.appendChild(list);
  if (MODE === 'google') s.appendChild(h('p', { class: 'footnote' }, 'Signed in as ' + (USER && USER.email || '') + '. ', h('button', { type: 'button', class: 'text-btn', onclick: signOutNow }, 'Sign out')));
  return s;
}
function fillKids(list) {
  list.textContent = '';
  if (!KIDS.length) { list.appendChild(empty('No children yet', 'Tap “Send form” to share the onboarding form on WhatsApp.')); return; }
  const q = C.q.trim().toLowerCase(), qd = digits(q);
  const items = KIDS.filter((c) => !q || [c.name, c.parent, niceName(c.p.p2Name), niceName(c.p.nickname)].join(' ').toLowerCase().includes(q) || (qd.length >= 3 && phone10(c.p.p1Mobile).includes(qd)));
  let any = false;
  STAGES.forEach((st) => {
    if (C.stage !== 'all' && C.stage !== st.k) return;
    const group = items.filter((c) => c.stage === st.k);
    if (!group.length) return;
    any = true;
    group.sort((a, b) => (b.unseen - a.unseen) || (st.k === 'asked' ? (a.req < b.req ? -1 : 1) : st.k === 'swim' ? a.name.localeCompare(b.name) : (latest(a) < latest(b) ? 1 : -1)));
    list.appendChild(h('section', { class: 'group st-' + st.k },
      h('div', { class: 'group-h' }, h('span', { class: 'dot' }), h('h2', { text: st.label }), h('span', { class: 'n', text: String(group.length) })),
      h('p', { class: 'group-hint', text: st.hint }),
      h('div', { class: 'cards' }, group.map(kidCard))));
  });
  if (!any) list.appendChild(empty(q ? 'No match' : 'No one here right now', q ? 'Check the spelling, or try the parent’s name.' : 'Children move here as their course goes on.'));
}
function latest(c) { return c.fb ? c.fb.submittedAt : (c.updated || c.joined); }
function ageLine(c) {
  const bits = [];
  if (c.age != null) bits.push(c.age + ' yrs');
  bits.push(firstName(c.parent) + ', ' + relWord(c));
  return bits.join(' · ');
}
function careLine(c) {
  if (!c.care.length) return null;
  const crit = c.care.some((x) => x.crit);
  const list = c.care.slice().sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0));
  const shown = list.slice(0, 2).map((x) => x.t).join(', ') + (list.length > 2 ? ' +' + (list.length - 2) : '');
  return h('span', { class: 'care' + (crit ? ' crit' : '') }, icon('alert'), h('span', { text: shown }));
}
function kidCard(c) {
  const fb = c.fb || {};
  const rateCls = fb.rating === 'Not happy' ? 'crit' : fb.rating === 'It was okay' ? 'warn' : 'ok';
  const top = h('button', { type: 'button', class: 'kid-open', onclick: () => openKid(c.key) },
    avatar(c),
    h('span', { class: 'kid-body' },
      h('span', { class: 'kid-top' }, h('span', { class: 'kid-name', text: c.name }), c.newOb ? h('span', { class: 'new-dot', text: 'New form' }) : c.newFb ? h('span', { class: 'new-dot', text: 'New feedback' }) : null),
      h('span', { class: 'kid-meta', text: ageLine(c) }),
      (c.stage === 'new' || c.stage === 'swim') ? careLine(c) : null,
      c.stage === 'done' ? h('span', { class: 'tags' }, h('span', { class: 'tag ' + rateCls, text: fb.rating || 'Feedback' }), c.wantsMore && h('span', { class: 'tag ok', text: 'Wants to continue' })) : null),
    h('span', { class: 'chev' }, icon('right')));
  let foot = h('div', { class: 'kid-foot' });
  if (c.stage === 'new') {
    foot.appendChild(h('button', { type: 'button', class: 'main', onclick: () => setStarted(c, todayISO()) }, icon('check'), 'Mark as started'));
    foot.appendChild(callBtn(c.p.p1Mobile, 'Call ' + c.parent));
    foot.appendChild(waBtn(waNumber(c), 'WhatsApp ' + c.parent));
  } else if (c.stage === 'swim') {
    foot.appendChild(h('span', { class: 'note', text: 'Since ' + monthYear(c.swimSince) }));
    foot.appendChild(h('button', { type: 'button', class: 'main', onclick: () => openFeedbackSheet(c, false) }, icon('send'), 'Ask for feedback'));
  } else if (c.stage === 'asked') {
    foot.appendChild(h('span', { class: 'note', text: 'Asked ' + relDate(c.req) + (c.reminded ? ' · reminded ' + relDate(c.reminded) : '') }));
    foot.appendChild(h('button', { type: 'button', class: 'main fit', onclick: () => openFeedbackSheet(c, true) }, 'Remind'));
  } else if (c.needsCall) {
    foot.appendChild(h('a', { class: 'main' + (c.unhappy ? ' crit' : ''), href: telHref(c.p.p1Mobile) }, icon('phone'), c.unhappy ? 'Call to listen' : 'Call back'));
    foot.appendChild(h('button', { type: 'button', class: 'text-btn', onclick: () => setCalled(c) }, 'Mark done'));
  } else foot = null;
  return h('article', { class: 'card kid' }, top, foot);
}

/* ---------------- Follow-ups ---------------- */
function followScreen() {
  const toCall = KIDS.filter((c) => c.wantsMore && !c.calledBack).sort((a, b) => (a.fb.submittedAt < b.fb.submittedAt ? 1 : -1));
  const called = KIDS.filter((c) => c.wantsMore && c.calledBack);
  const refsNew = REFS.filter((r) => !r.done), refsDone = REFS.filter((r) => r.done);
  const s = h('div', { class: 'screen' });
  s.appendChild(h('header', { class: 'top' }, h('div', null, h('p', { class: 'hello', text: 'People to get back to' }), h('h1', { class: 'title', text: 'Follow-ups' }))));
  s.appendChild(syncLine());
  const tabs = [['continue', toCall.length, 'Continue'], ['refs', refsNew.length, 'Referrals'], ['share', VOICES.length, 'Share number']];
  s.appendChild(h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Follow-up lists' }, tabs.map(([k, n, label]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': C.fu === k ? 'true' : 'false', onclick: () => { C.fu = k; rerender(); } },
      h('span', { class: 'seg-n', text: String(n) }), h('span', { class: 'seg-l', text: label })))));
  if (C.fu === 'continue') {
    s.appendChild(h('p', { class: 'lead', text: 'Parents who want another round. Call to plan it.' }));
    if (!toCall.length) s.appendChild(empty('All caught up', 'Parents who want to continue appear here.'));
    else s.appendChild(h('div', { class: 'list' }, toCall.map((c) => h('div', { class: 'row' },
      avatar(c),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: c.parent }),
        h('div', { class: 'row-sub', text: c.first + '’s ' + relWord(c) + ' · ' + relDate(c.fb.submittedAt) }),
        h('button', { type: 'button', class: 'text-btn', onclick: () => setCalled(c) }, 'Mark done')),
      h('div', { class: 'row-acts' }, callBtn(c.p.p1Mobile, 'Call ' + c.parent), waBtn(waNumber(c), 'WhatsApp ' + c.parent))))));
    if (called.length) s.appendChild(doneList('Done', called.map((c) => c.parent + ' · ' + c.first + '’s ' + relWord(c))));
  } else if (C.fu === 'refs') {
    s.appendChild(h('p', { class: 'lead', text: 'Families your parents recommended. They agreed to a call.' }));
    if (!refsNew.length) s.appendChild(empty('No new referrals', 'They arrive with feedback.'));
    else s.appendChild(h('div', { class: 'list' }, refsNew.map((r) => h('div', { class: 'row' },
      h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: r.name }),
        h('div', { class: 'row-sub', text: 'From ' + firstName(r.kid.parent) + ' · ' + relDate(r.date) }),
        h('button', { type: 'button', class: 'text-btn', onclick: () => setContacted(r) }, 'Mark contacted')),
      h('div', { class: 'row-acts' }, callBtn(r.mobile, 'Call ' + r.name),
        h('button', { type: 'button', class: 'icon-btn wa', 'aria-label': 'Send onboarding form to ' + r.name, onclick: () => openReferralSheet(r) }, icon('send')))))));
    if (refsDone.length) s.appendChild(doneList('Contacted', refsDone.map((r) => r.name + ' · from ' + firstName(r.kid.parent))));
  } else {
    const tally = {}; VOICES.forEach((c) => { const m = mainCond(c); if (m) tally[m] = (tally[m] || 0) + 1; });
    const conds = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || COND_SHORT[a].localeCompare(COND_SHORT[b]));
    if (C.cond !== 'all' && !conds.includes(C.cond)) C.cond = 'all';
    s.appendChild(h('p', { class: 'lead', text: 'Parents happy to talk to new families. Share their number on WhatsApp.' }));
    if (conds.length > 1) {
      const chips = h('div', { class: 'chips', style: 'margin-top:0;margin-bottom:12px', role: 'group', 'aria-label': 'Condition' });
      ['all'].concat(conds).forEach((k) => chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': C.cond === k ? 'true' : 'false', onclick: () => { C.cond = k; rerender(); } }, k === 'all' ? 'All' : COND_SHORT[k])));
      s.appendChild(chips);
      requestAnimationFrame(() => { const on = chips.querySelector('[aria-pressed="true"]'); if (on && on.offsetLeft + on.offsetWidth > chips.clientWidth) chips.scrollLeft = on.offsetLeft - 18; });
    }
    const shown = VOICES.filter((c) => C.cond === 'all' || mainCond(c) === C.cond);
    if (!shown.length) s.appendChild(empty('No one yet', 'Parents who agree in their feedback appear here.'));
    else s.appendChild(h('div', { class: 'list' }, shown.map((c) => {
      const line = 'You can speak to ' + firstName(c.parent) + ', ' + relWord(c) + ' ' + ofChild(c) + ': ' + fmtPhone(c.p.p1Mobile);
      const cond = mainCond(c);
      return h('div', { class: 'row' }, avatar(c),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: c.parent }),
          h('div', { class: 'row-sub', text: [cond ? COND_SHORT[cond] : '', c.first + (c.age != null ? ', ' + c.age : '')].filter(Boolean).join(' · ') })),
        h('div', { class: 'row-acts' }, callBtn(c.p.p1Mobile, 'Call ' + c.parent),
          h('a', { class: 'icon-btn wa', href: waHref('', line), target: '_blank', rel: 'noopener', 'aria-label': 'Share ' + c.parent + '’s number on WhatsApp' }, icon('share'))));
    })));
  }
  return s;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function doneList(title, lines) {
  return h('details', { class: 'done-list' }, h('summary', null, title + ' (' + lines.length + ')', icon('right')),
    h('div', { class: 'list' }, lines.map((t) => h('div', { class: 'done-row', text: t }))));
}

/* ---------------- writes (optimistic, then saved) ---------------- */
function setCalled(c, value) {
  value = value !== false;
  c.fb.calledBack = value; buildCoach(); rerender();
  toast(value ? 'Marked done.' : 'Moved back.', value ? () => setCalled(c, false) : null);
  call('setCalledBack', { feedbackId: c.fb.id, value }).then(saveCache, (e) => { toast(e.message); refresh(); });
}
function setContacted(r, value, quiet) {
  value = value !== false;
  const row = (DATA.referrals || []).find((x) => x.id === r.id); if (row) row.contacted = value;
  buildCoach(); rerender();
  if (!quiet) toast(value ? 'Marked contacted.' : 'Moved back.', value ? () => setContacted(r, false) : null);
  return call('setContacted', { referralId: r.id, value }).then(saveCache, (e) => { toast(e.message); refresh(); });
}
function setStarted(c, date) {
  const prev = c.row.startedOn || '';
  c.row.startedOn = date; buildCoach(); rerender();
  toast(date ? c.first + ' moved to Swimming.' : 'First session date cleared.', () => setStarted(c, prev));
  return call('setStarted', { childId: c.key, date }).then(saveCache, (e) => { c.row.startedOn = prev; buildCoach(); rerender(); toast(e.message); });
}
function markSeen(c) {
  if (!c.unseen) return;
  c.row.seen = true; (DATA.feedback || []).forEach((f) => { if (f.childId === c.key) f.seen = true; });
  call('markSeen', { childId: c.key }).then(saveCache, () => {});
}

/* ---------------- child page ---------------- */
function openKid(key) {
  C.listY = window.scrollY; C.view = 'detail'; C.openKey = key;
  const c = KIDS.find((x) => x.key === key);
  render(); window.scrollTo(0, 0);
  if (c && c.unseen) { markSeen(c); buildCoach(); const n = ROOT.querySelector('.nav'); if (n) n.replaceWith(nav()); }
}
function closeKid() { C.view = 'list'; C.openKey = null; render(); window.scrollTo(0, C.listY || 0); }
function kv(rows) {
  const shown = rows.filter((r) => r && !isBlank(r[1]));
  if (!shown.length) return null;
  return h('dl', { class: 'kv' }, shown.map(([label, val, cls]) => h('div', null, h('dt', { text: label }), val instanceof Node ? h('dd', null, val) : h('dd', { class: cls || null, text: String(val) }))));
}
function section(title, body, opts) {
  opts = opts || {};
  if (!body && !opts.empty) return null;
  return h('section', { class: 'card section' + (opts.cls ? ' ' + opts.cls : '') }, h('h2', null, opts.icon && icon(opts.icon), title),
    body || h('p', { class: 'sub', style: 'margin:0 0 12px', text: opts.empty }), opts.foot);
}
function tagList(arr) { return arr && arr.length ? h('span', { class: 'tags' }, arr.map((x) => h('span', { class: 'tag', text: x }))) : null; }
function hasWords(d) { return !isBlank(d.story) || !isBlank(d.nowCan); }
const CONT_SHORT = { 'Yes, please contact me': ['Wants to continue', 'ok'], 'Maybe later': ['Maybe later', ''], 'No, not for now': ['Not continuing', 'warn'] };
function detail(c) {
  const p = c.p, s = h('div', { class: 'screen' });
  const stage = STAGES.find((x) => x.k === c.stage);
  s.appendChild(h('button', { type: 'button', class: 'back', onclick: closeKid }, icon('left'), 'Back'));
  const bits = [c.age != null ? c.age + ' yrs' : '', p.gender && p.gender !== 'Prefer not to say' ? p.gender : '', p.grade ? 'Class ' + p.grade : ''].filter(Boolean).join(' · ');
  s.appendChild(h('div', { class: 'hero' }, avatar(c, true), h('div', null,
    h('h1', { text: c.name }), h('p', { text: [p.nickname ? '“' + p.nickname + '”' : '', bits].filter(Boolean).join(' · ') }),
    h('span', { class: 'tags' }, h('span', { class: 'tag stage st-' + c.stage, text: stage.label })))));

  s.appendChild(h('div', { class: 'quick' },
    h('a', { class: 'btn btn-primary', href: telHref(p.p1Mobile) }, icon('phone'), 'Call ' + firstName(c.parent)),
    h('a', { class: 'btn btn-soft', href: waHref(waNumber(c)), target: '_blank', rel: 'noopener' }, icon('chat'), 'WhatsApp')));
  add(s, c.stage === 'new' ? h('button', { type: 'button', class: 'btn btn-plain block next', onclick: () => setStarted(c, todayISO()) }, icon('check'), 'First session done? Mark as started')
    : c.stage === 'swim' ? h('button', { type: 'button', class: 'btn btn-plain block next', onclick: () => openFeedbackSheet(c, false) }, icon('send'), 'Course over? Ask for feedback')
    : c.stage === 'asked' ? h('button', { type: 'button', class: 'btn btn-plain block next', onclick: () => openFeedbackSheet(c, true) }, icon('chat'), 'Send a reminder')
    : null);

  if (c.fb) {
    const d = c.fb.data || {};
    const rateCls = d.rating === 'Not happy' ? 'crit' : d.rating === 'It was okay' ? 'warn' : 'ok';
    const cont = CONT_SHORT[d.continueOn];
    const perms = [/^Yes/.test(d.referenceOk || '') ? 'Number can be shared' : '',
      hasWords(d) && /^Yes, with/.test(d.shareWords || '') ? 'Words can be shared' : hasWords(d) && /^Yes, without/.test(d.shareWords || '') ? 'Words can be shared, no name' : ''].filter(Boolean);
    s.appendChild(section('Feedback', h('div', null,
      h('div', { class: 'tags', style: 'margin:2px 0 10px' }, h('span', { class: 'tag ' + rateCls, text: d.rating || 'Feedback' }), cont && h('span', { class: 'tag ' + cont[1], text: cont[0] })),
      !isBlank(d.story) ? h('p', { class: 'quote', text: '“' + d.story + '”' }) : null,
      kv([['Changes noticed', tagList(d.changes)], ['Can do now', d.nowCan], ['Could do better', d.better],
        ['Permission', perms.length ? perms.join(' · ') : '']])),
    { icon: 'heart', foot: h('div', { class: 'section-foot' }, h('span', { class: 'foot-l', text: 'From ' + firstName(c.parent) + ', ' + relDate(c.fb.submittedAt) }),
      c.needsCall ? h('button', { type: 'button', class: 'text-btn', onclick: () => setCalled(c) }, 'Mark called')
        : c.pending ? h('span', { class: 'tag warn', text: 'Asked again' }) : h('button', { type: 'button', class: 'text-btn', onclick: () => openFeedbackSheet(c, false) }, 'Ask again')) }));
  }

  const conds = (p.conditions || []).filter((x) => x !== 'None of these');
  const critCls = conds.some((x) => CRIT[x]) ? 'crit' : '';
  s.appendChild(section('Before the session', kv([
    ['Health', conds.length ? conds.join(', ') : ((p.conditions || []).length ? 'Nothing reported' : ''), critCls],
    ['What to know', p.conditionsDetail, critCls],
    ['Medicines', p.medicines === 'Yes' ? (p.medicinesDetail || 'Yes') : p.medicines === 'No' ? 'None' : ''],
    ['In the water', p.water], ['Toilet and changing', p.toilet],
    ['Diagnosis', withOther(p.diagnosis, p.diagnosisOther).join(', ')],
    ['Can be upset by', withOther(p.upsets, p.upsetsOther).join(', ')]]), { cls: 'warm', icon: 'alert', empty: 'Nothing noted by the parent.' }));
  add(s, section('How to connect', kv([['Communicates', p.communication], ['Calms down with', p.calms], ['Loves', p.loves],
    ['Parent hopes for', tagList(p.goals)], ['In their words', p.goalsNote]])));

  const ta = h('textarea', { id: 'c_note', placeholder: 'Anything to remember for ' + c.first + '…', 'aria-label': 'My notes for ' + c.name });
  ta.value = c.row.notes || '';
  const saved = h('span', { class: 'saved', 'aria-live': 'polite' });
  s.appendChild(section('My notes', h('div', { class: 'notes' }, ta, h('div', { class: 'bar' },
    h('button', { type: 'button', class: 'btn btn-soft sm', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true; saved.textContent = 'Saving…';
      try { await call('saveNote', { childId: c.key, note: ta.value }); c.row.notes = ta.value; saveCache(); saved.textContent = 'Saved'; }
      catch (err) { saved.textContent = ''; toast(err.message); }
      b.disabled = false; setTimeout(() => { if (saved.textContent === 'Saved') saved.textContent = ''; }, 2500);
    } }, 'Save note'), saved))));

  s.appendChild(moreDetails(c));
  return s;
}
function moreDetails(c) {
  const p = c.p, box = h('div', { class: 'more-in' });
  const part = (title, body) => { if (body) box.appendChild(h('div', { class: 'part' }, h('h3', { text: title }), body)); };

  const fam = h('div');
  [['p1', c.parent], ['p2', niceName(p.p2Name)]].forEach(([pre, name]) => {
    if (!name) return;
    const mob = p[pre + 'Mobile'];
    fam.appendChild(h('div', { class: 'person' }, h('div', { class: 'row-main' }, h('div', { class: 'row-title', text: name }),
      h('div', { class: 'row-sub', text: [p[pre + 'Relation'], p[pre + 'Occupation'], mob ? fmtPhone(mob) : ''].filter(Boolean).join(' · ') })),
      mob && callBtn(mob, 'Call ' + name)));
  });
  add(fam, kv([['WhatsApp', p.waSame === false ? fmtPhone(p.whatsapp) : ''], ['Email', p.email], ['Home address', p.address]]));
  part('Family', fam);

  const th = (p.therapy || []).filter((x) => x !== 'No therapy now');
  part('Therapy', kv([['Ongoing', th.length ? withOther(th, p.therapistTypeOther).join(', ') : ((p.therapy || []).length ? 'None at the moment' : '')],
    ['Therapist', [p.therapistName, p.therapistContact].filter(Boolean).join(' · ')], ['May talk to the therapist', p.therapistOk]]));

  const fsVal = h('dd', { text: c.started ? fmtDate(c.started) : 'Not recorded' });
  const fsRow = h('div', { class: 'fs-row' }, h('div', null, h('dt', { text: 'First session' }), fsVal));
  const change = h('button', { type: 'button', class: 'text-btn', onclick: () => {
    const inp = h('input', { type: 'date', class: 'date-in', max: todayISO(), 'aria-label': 'First session date' }); inp.value = c.started || '';
    fsRow.textContent = '';
    fsRow.appendChild(inp);
    fsRow.appendChild(h('button', { type: 'button', class: 'text-btn', onclick: () => setStarted(c, inp.value) }, 'Save'));
    inp.focus();
  } }, c.started ? 'Change' : 'Add date');
  fsRow.appendChild(change);
  const course = h('div', null, h('dl', { class: 'kv' }, fsRow), kv([['Joined', fmtDate(c.joined)],
    ['Heard about you from', [p.heardFrom === 'Other' ? (p.heardOther || 'Other') : p.heardFrom, p.referrerName].filter(Boolean).join(' · ')],
    ['Consent', p.consent === true ? 'Given, signed by ' + niceName(p.signature) : 'Not given']]));
  part('Course', course);

  const hist = [{ at: c.joined, t: 'Onboarding form' }]
    .concat(c.updated && c.updated !== c.joined ? [{ at: c.updated, t: 'Form updated' }] : [])
    .concat(c.started ? [{ at: c.started, t: 'First session' }] : [])
    .concat((DATA.links || []).filter((l) => l.childId === c.key && l.sentAt).map((l) => ({ at: l.sentAt, t: 'Feedback asked' })))
    .concat(c.fbs.map((f) => ({ at: f.submittedAt, t: 'Feedback received' })))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  part('History', h('ul', { class: 'history' }, hist.map((x) => h('li', null, h('span', { text: x.t }), h('span', { text: fmtDate(x.at) })))));

  return h('details', { class: 'card more' }, h('summary', null, h('span', null, h('strong', { text: 'Family, therapy and course' }),
    h('span', { class: 'more-sub', text: 'Contacts, therapist, dates' })), icon('right')), box);
}

/* ---------------- sheets (WhatsApp messages) ---------------- */
function sheet(title, sub) {
  const root = document.getElementById('sheet-root');
  const body = h('div');
  function close() { root.textContent = ''; document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet_t' },
    h('h2', { id: 'sheet_t', tabindex: '-1', text: title }), sub && h('p', { class: 'sub', text: sub }), body,
    h('button', { type: 'button', class: 'btn btn-plain block', style: 'margin-top:10px', onclick: close }, 'Close'));
  const bg = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } }, box);
  root.textContent = ''; root.appendChild(bg);
  document.addEventListener('keydown', onKey);
  try { box.querySelector('#sheet_t').focus({ preventScroll: true }); } catch (e) {}
  return { body, close };
}
function sheetActions(sh, msg, waNum, onSent) {
  sh.body.textContent = '';
  sh.body.appendChild(h('p', { class: 'msg', text: msg }));
  sh.body.appendChild(h('a', { class: 'btn btn-wa block', href: waHref(waNum, msg), target: '_blank', rel: 'noopener', onclick: () => { if (onSent) onSent(); sh.close(); } }, icon('chat'), 'Send on WhatsApp'));
  sh.body.appendChild(h('button', { type: 'button', class: 'btn btn-soft block', onclick: () => { copyText(msg, 'Message copied.'); if (onSent) onSent(); } }, icon('copy'), 'Copy message'));
}
function openOnboardSheet() {
  const msg = 'Namaste! Before your child’s first swimming session, please fill in this short form so I can plan safe and happy sessions. It takes about 6 minutes.\n\n' + location.origin + '/join/\n\nCoach Sonal, SJ Wellness';
  sheetActions(sheet('Send onboarding form', 'Same link for every new family. Pick the parent in WhatsApp.'), msg, '', null);
}
function openReferralSheet(r) {
  const msg = 'Namaste ' + firstName(r.name) + '! ' + r.kid.parent + ' told me you might like swimming sessions for your child. I am Coach Sonal from SJ Wellness. If you are interested, please fill in this short form so I can plan safe and happy sessions:\n\n' + location.origin + '/join/\n\nCoach Sonal';
  sheetActions(sheet('Send form to ' + firstName(r.name), 'Mentions who recommended you.'), msg, r.mobile, () => { if (!r.done) setContacted(r, true); });
}
async function openFeedbackSheet(c, reminder) {
  const pf = firstName(c.parent);
  const sh = sheet(reminder ? 'Remind ' + pf : 'Ask ' + pf + ' for feedback', 'This link is only for ' + c.first + '. No details to type again.');
  sh.body.appendChild(h('p', { class: 'waiting' }, h('span', { class: 'spin' }), 'Preparing the link…'));
  let link;
  try { link = await call('prepareFeedbackLink', { childId: c.key }); }
  catch (err) { sh.body.textContent = ''; sh.body.appendChild(h('p', { class: 'err' }, icon('alert'), err.message)); return; }
  const url = location.origin + '/f/?c=' + link.token;
  const msg = reminder
    ? 'Namaste ' + pf + '! A gentle reminder to share how ' + c.first + '’s swimming went. It takes about 2 minutes.\n\n' + url + '\n\nThank you,\nCoach Sonal'
    : 'Namaste ' + pf + '! ' + c.first + ' has finished this round of swimming sessions. I would love to hear how they went for your family. It takes about 2 minutes.\n\n' + url + '\n\nThank you,\nCoach Sonal, SJ Wellness';
  let marked = false;
  sheetActions(sh, msg, waNumber(c), () => {
    if (marked) return; marked = true;
    const now = new Date().toISOString();
    const links = DATA.links || (DATA.links = []);
    let l = links.find((x) => x.token === link.token);
    if (!l) { l = { token: link.token, childId: c.key, createdAt: link.createdAt, sentAt: '', remindedAt: '', status: 'open', usedAt: '', expired: false }; links.push(l); }
    if (!l.sentAt) l.sentAt = now; else l.remindedAt = now;
    buildCoach(); rerender(); saveCache();
    toast(reminder ? 'Reminder sent.' : c.first + ' moved to Feedback asked.');
    call('markLinkSent', { token: link.token }).catch((e) => toast(e.message));
  });
}

/* Start last, after every constant above is defined. */
boot();
