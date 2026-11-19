// Backend checks against the real Code.gs (run: node tools/test-backend.mjs)
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createEmulator } from './gas-emulator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emu = createEmulator({
  codePath: path.join(root, 'apps-script', 'Code.gs'),
  props: { AUTH_MODE: 'google', COACH_EMAILS: 'Coach@Example.com, amit@example.com', NOTIFY_EMAIL: 'coach@example.com', FIREBASE_API_KEY: 'k', APP_URL: 'https://x.web.app' },
  users: { good: 'coach@example.com', other: 'stranger@example.com' }
});
let n = 0; const ok = (m) => { n++; console.log('✓ ' + m); };
const onboarding = (extra = {}) => Object.assign({
  childName: 'Kabir Nair', dob: '2019-03-14', p1Name: 'Priya Nair', p1Mobile: '98200 00001', consent: true, conditions: ['None of these'], water: 'Nervous or scared'
}, extra);

// public: onboarding validation
let r = emu.post({ action: 'submitOnboarding', data: onboarding({ consent: false }) });
assert.equal(r.ok, false); assert.equal(r.error, 'INVALID'); ok('rejects onboarding without consent');
r = emu.post({ action: 'submitOnboarding', data: onboarding({ p1Mobile: '12345' }) });
assert.equal(r.error, 'INVALID'); ok('rejects a bad mobile number');
r = emu.post({ action: 'submitOnboarding', data: onboarding({ goalsNote: '=HYPERLINK("http://evil")', p1Occupation: '+91 test' }) });
assert.equal(r.ok, true); ok('accepts a valid onboarding form');
assert.equal(emu.mail.length, 1); assert.match(emu.mail[0].subject, /Kabir Nair/); ok('emails the coach about a new form');

// coach auth
r = emu.post({ action: 'getAll' }); assert.equal(r.error, 'AUTH'); ok('getAll without sign-in is refused');
r = emu.post({ action: 'getAll', idToken: 'forged' }); assert.equal(r.error, 'AUTH'); ok('getAll with an invalid token is refused');
r = emu.post({ action: 'getAll', idToken: 'other' }); assert.equal(r.error, 'FORBIDDEN'); ok('a signed-in stranger is refused');
r = emu.post({ action: 'getAll', idToken: 'good' }); assert.equal(r.ok, true); ok('the coach can read everything');
assert.equal(r.data.children.length, 1);
const kabir = r.data.children[0];
assert.equal(kabir.data.goalsNote, '=HYPERLINK("http://evil")'); ok('formula-like text is stored as plain text');
assert.equal(kabir.seen, false); assert.equal(kabir.matchKey, undefined);

// same parent + child again updates, a sibling creates a new child
emu.post({ action: 'submitOnboarding', data: onboarding({ p1Mobile: '+91 98200-00001', childName: 'KABIR  NAIR', school: 'Little Steps' }) });
emu.post({ action: 'submitOnboarding', data: onboarding({ childName: 'Myra Nair' }) });
r = emu.post({ action: 'getAll', idToken: 'good' });
assert.equal(r.data.children.length, 2); ok('re-submitting the same child updates it; a sibling is a new child');
assert.equal(r.data.children.find((c) => c.id === kabir.id).data.school, 'Little Steps');
const myra = r.data.children.find((c) => c.childName === 'Myra Nair');

// feedback link lifecycle
r = emu.post({ action: 'prepareFeedbackLink', childId: kabir.id }); assert.equal(r.error, 'AUTH'); ok('parents cannot create feedback links');
r = emu.post({ action: 'prepareFeedbackLink', childId: kabir.id, idToken: 'good' });
const token = r.data.token; assert.match(token, /^[a-f0-9]{32}$/); ok('coach gets a 32-character random link code');
r = emu.post({ action: 'prepareFeedbackLink', childId: kabir.id, idToken: 'good' });
assert.equal(r.data.token, token); ok('asking again re-uses the open link (reminders keep the same link)');
r = emu.post({ action: 'getAll', idToken: 'good' });
assert.equal(r.data.links[0].sentAt, ''); ok('a prepared link is not counted as "asked" until it is sent');
emu.post({ action: 'markLinkSent', token, idToken: 'good' });
r = emu.post({ action: 'getAll', idToken: 'good' }); assert.ok(r.data.links[0].sentAt); ok('marking as sent records the time');

r = emu.post({ action: 'feedbackContext', token });
assert.deepEqual([r.data.status, r.data.childFirst, r.data.parentFirst], ['open', 'Kabir', 'Priya']); ok('the link shows only first names');
assert.equal(Object.keys(r.data).length, 4); ok('the link exposes nothing else about the child');
r = emu.post({ action: 'feedbackContext', token: 'f'.repeat(32) }); assert.equal(r.data.status, 'invalid'); ok('a made-up code is invalid');
r = emu.post({ action: 'feedbackContext', token: '../../etc' }); assert.equal(r.data.status, 'invalid'); ok('a malformed code is invalid');

r = emu.post({ action: 'submitFeedback', token, data: { rating: 'Great' } }); assert.equal(r.error, 'INVALID'); ok('feedback needs a valid rating');
r = emu.post({ action: 'submitFeedback', token, data: {
  rating: 'Very happy', continueOn: 'Yes, please contact me', referenceOk: 'Yes, share my number', story: 'He loves it.',
  refs: [{ name: 'Sneha Patil', mobile: '90000 11111' }, { name: 'No Number', mobile: '' }], refsAgreed: true } });
assert.equal(r.ok, true); ok('feedback is saved');
r = emu.post({ action: 'getAll', idToken: 'good' });
const fb = r.data.feedback[0];
assert.equal(fb.childId, kabir.id); ok('feedback is stored against the same child the link was made for');
assert.notEqual(fb.childId, myra.id);
assert.equal(r.data.links[0].status, 'used'); ok('the link closes after use');
assert.equal(r.data.referrals.length, 1); assert.equal(r.data.referrals[0].name, 'Sneha Patil'); ok('only complete, agreed referrals are saved');
r = emu.post({ action: 'submitFeedback', token, data: { rating: 'Happy' } }); assert.equal(r.error, 'USED'); ok('a used link cannot be submitted twice');
r = emu.post({ action: 'feedbackContext', token }); assert.equal(r.data.status, 'used'); ok('a used link says thank you');

// a new round gets a new link
r = emu.post({ action: 'prepareFeedbackLink', childId: kabir.id, idToken: 'good' });
assert.notEqual(r.data.token, token); ok('asking after feedback creates a fresh link');

// coach updates
emu.post({ action: 'markSeen', childId: kabir.id, idToken: 'good' });
emu.post({ action: 'saveNote', childId: kabir.id, note: 'Loves trains', idToken: 'good' });
emu.post({ action: 'setCalledBack', feedbackId: fb.id, value: true, idToken: 'good' });
emu.post({ action: 'setContacted', referralId: r.data.token ? emu.post({ action: 'getAll', idToken: 'good' }).data.referrals[0].id : '', value: true, idToken: 'good' });
r = emu.post({ action: 'getAll', idToken: 'good' });
const k2 = r.data.children.find((c) => c.id === kabir.id);
assert.equal(k2.seen, true); assert.equal(k2.notes, 'Loves trains'); assert.equal(r.data.feedback[0].seen, true);
assert.equal(r.data.feedback[0].calledBack, true); assert.equal(r.data.referrals[0].contacted, true); ok('seen, notes, called back and contacted are saved');

// expiry
const links = emu.sheets.get('Links');
const hdr = links[0]; const iC = hdr.indexOf('createdAt'), iT = hdr.indexOf('token');
const openRow = links.find((row) => row[iT] !== token && row[iT] !== 'token');
openRow[iC] = new Date(Date.now() - 61 * 864e5).toISOString();
r = emu.post({ action: 'feedbackContext', token: openRow[iT] }); assert.equal(r.data.status, 'expired'); ok('links expire after 60 days');

r = emu.post('not json'); assert.equal(r.error, 'BAD_REQUEST'); ok('garbage input is refused cleanly');
r = emu.post({ action: 'dropTables' }); assert.equal(r.error, 'BAD_REQUEST'); ok('unknown actions are refused');
// access modes
const code = path.join(root, 'apps-script', 'Code.gs');
const open = createEmulator({ codePath: code, props: {} });
open.post({ action: 'submitOnboarding', data: onboarding() });
r = open.post({ action: 'getAll' }); assert.equal(r.ok, true); assert.equal(r.data.children.length, 1); ok('AUTH_MODE missing = open: coach actions work without login (testing)');
const keyed = createEmulator({ codePath: code, props: { AUTH_MODE: 'key', COACH_KEY: 'k3y-long-random-text' } });
r = keyed.post({ action: 'getAll' }); assert.equal(r.error, 'AUTH'); ok('key mode: no key is refused');
r = keyed.post({ action: 'getAll', coachKey: 'k3y-long-random-texT' }); assert.equal(r.error, 'AUTH'); ok('key mode: a wrong key is refused');
r = keyed.post({ action: 'getAll', coachKey: 'k3y-long-random-text' }); assert.equal(r.ok, true); ok('key mode: the right key works');
r = keyed.post({ action: 'submitOnboarding', data: onboarding() }); assert.equal(r.ok, true); ok('key mode: parent forms still need no key');
const noKey = createEmulator({ codePath: code, props: { AUTH_MODE: 'key' } });
r = noKey.post({ action: 'getAll', coachKey: 'anything' }); assert.equal(r.error, 'CONFIG'); ok('key mode without COACH_KEY set refuses everyone');
console.log(`\nAll ${n} backend checks passed.`);
