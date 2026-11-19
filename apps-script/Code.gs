/**
 * SJ Wellness – backend (Google Apps Script, bound to the "SJ Wellness Data" Google Sheet)
 * ---------------------------------------------------------------------------------------
 * One web app URL, called by the website with POST (Content-Type: text/plain, JSON body).
 *
 * Public actions (parents, no login):
 *   submitOnboarding  – saves the onboarding form, creates or updates the child
 *   feedbackContext   – checks a feedback link code, returns only the child's and parent's first names
 *   submitFeedback    – saves feedback against the child the code belongs to, then closes the code
 *
 * Coach actions (need a Firebase ID token from an email listed in COACH_EMAILS):
 *   getAll, markSeen, saveNote, prepareFeedbackLink, markLinkSent, setCalledBack, setContacted
 *
 * Script properties (Project Settings → Script properties):
 *   COACH_EMAILS      Google accounts allowed into the coach app, comma separated
 *   NOTIFY_EMAIL      where "new form" alert emails go (usually Coach Sonal's Gmail)
 *   FIREBASE_API_KEY  the Web API key of the Firebase project (used to check sign-ins)
 *   APP_URL           e.g. https://sj-wellness.web.app (used in alert emails)
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 */

var TABLES = {
  Children: ['id', 'createdAt', 'updatedAt', 'matchKey', 'childName', 'parentName', 'mobile', 'seen', 'notes', 'data'],
  Feedback: ['id', 'childId', 'token', 'submittedAt', 'rating', 'continueOn', 'referenceOk', 'seen', 'calledBack', 'data'],
  Links: ['token', 'childId', 'createdAt', 'sentAt', 'remindedAt', 'status', 'usedAt'],
  Referrals: ['id', 'childId', 'feedbackId', 'createdAt', 'name', 'mobile', 'contacted']
};
var LINK_DAYS = 60;          // feedback links stop working after this many days
var MAX_PAYLOAD = 20000;     // characters of JSON per form
var MAX_PUBLIC_PER_MIN = 30; // simple flood protection for public submissions

/* ============================== entry points ============================== */

function doGet() {
  return json_({ ok: true, service: 'sj-wellness', time: now_() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'BAD_REQUEST', message: 'Could not read the request.' }); }
  try {
    var action = String(req.action || '');
    var data;
    if (PUBLIC_ACTIONS_.hasOwnProperty(action)) data = PUBLIC_ACTIONS_[action](req);
    else if (COACH_ACTIONS_.hasOwnProperty(action)) data = COACH_ACTIONS_[action](req, verifyCoach_(req.idToken));
    else throw userError_('BAD_REQUEST', 'Unknown action.');
    return json_({ ok: true, data: data });
  } catch (err) {
    if (err && err.code) return json_({ ok: false, error: err.code, message: err.message });
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'SERVER', message: 'Something went wrong on our side. Please try again.' });
  }
}

/** Run once from the editor (Run ▶ setup) to create the tabs and grant permissions. */
function setup() {
  Object.keys(TABLES).forEach(function (t) { sheet_(t); });
  var p = PropertiesService.getScriptProperties();
  ['COACH_EMAILS', 'NOTIFY_EMAIL', 'FIREBASE_API_KEY', 'APP_URL'].forEach(function (k) {
    if (!p.getProperty(k)) console.log('Remember to set the script property ' + k);
  });
  return 'Ready';
}

/* ============================== public actions ============================== */

var PUBLIC_ACTIONS_ = {
  submitOnboarding: function (req) {
    floodGuard_();
    var d = cleanPayload_(req.data);
    if (d.website) return { saved: true }; // hidden spam trap was filled in
    requireText_(d.childName, 'child’s name');
    requireText_(d.dob, 'date of birth');
    requireText_(d.p1Name, 'parent’s name');
    requireText_(d.p1Mobile, 'mobile number');
    if (!validPhone_(d.p1Mobile)) throw userError_('INVALID', 'Please check the mobile number.');
    if (d.consent !== true) throw userError_('INVALID', 'Please tick the permission box.');
    if (!Array.isArray(d.conditions) || !d.conditions.length) throw userError_('INVALID', 'Please answer the health question.');

    var key = matchKey_(d.p1Mobile, d.childName);
    var t = now_(), childId, childName = clip_(d.childName, 120);
    withLock_(function () {
      var rows = readAll_('Children');
      var ex = rows.filter(function (r) { return r.matchKey === key; })[0];
      if (ex) {
        var merged = parseJson_(ex.data);
        Object.keys(d).forEach(function (k) { merged[k] = d[k]; });
        update_('Children', ex._row, { updatedAt: t, childName: childName, parentName: clip_(d.p1Name, 120), mobile: clip_(d.p1Mobile, 20), seen: false, data: JSON.stringify(merged) });
        childId = ex.id;
      } else {
        childId = newId_(12);
        append_('Children', { id: childId, createdAt: t, updatedAt: t, matchKey: key, childName: childName, parentName: clip_(d.p1Name, 120),
          mobile: clip_(d.p1Mobile, 20), seen: false, notes: '', data: JSON.stringify(d) });
      }
    });
    notify_('New onboarding form: ' + childName,
      'An onboarding form has arrived for ' + childName + ' (parent: ' + clip_(d.p1Name, 120) + ').\nRead it before the first session.');
    return { saved: true };
  },

  feedbackContext: function (req) {
    var token = cleanToken_(req.token);
    if (!token) return { status: 'invalid' };
    var link = findLink_(token);
    if (!link) return { status: 'invalid' };
    var child = findChild_(link.childId);
    if (!child) return { status: 'invalid' };
    var d = parseJson_(child.data);
    var first = firstName_(d.nickname) || firstName_(d.childName || child.childName);
    var parentFirst = firstName_(d.p1Name || child.parentName);
    if (link.status === 'used') return { status: 'used', childFirst: first };
    if (isExpired_(link)) return { status: 'expired', childFirst: first };
    return { status: 'open', childFirst: first, parentFirst: parentFirst, gender: d.gender || '' };
  },

  submitFeedback: function (req) {
    floodGuard_();
    var token = cleanToken_(req.token);
    if (!token) throw userError_('LINK', 'This link is not valid. Please ask Coach Sonal for a new one.');
    var d = cleanPayload_(req.data);
    if (['Very happy', 'Happy', 'It was okay', 'Not happy'].indexOf(d.rating) < 0) throw userError_('INVALID', 'Please choose how happy you are.');
    var childName = '', parentName = '';
    withLock_(function () {
      var link = findLink_(token);
      if (!link) throw userError_('LINK', 'This link is not valid. Please ask Coach Sonal for a new one.');
      if (link.status === 'used') throw userError_('USED', 'We already have your feedback for this link. Thank you!');
      if (isExpired_(link)) throw userError_('LINK', 'This link has expired. Please ask Coach Sonal for a new one.');
      var child = findChild_(link.childId);
      if (!child) throw userError_('LINK', 'This link is not valid. Please ask Coach Sonal for a new one.');
      childName = child.childName; parentName = child.parentName;
      var t = now_(), fid = newId_(12);
      append_('Feedback', { id: fid, childId: link.childId, token: token, submittedAt: t, rating: d.rating,
        continueOn: clip_(d.continueOn, 60), referenceOk: clip_(d.referenceOk, 60), seen: false, calledBack: false, data: JSON.stringify(d) });
      update_('Links', link._row, { status: 'used', usedAt: t });
      if (d.refsAgreed === true && Array.isArray(d.refs)) {
        d.refs.slice(0, 3).forEach(function (r) {
          if (!r || !String(r.name || '').trim() || !validPhone_(r.mobile)) return;
          append_('Referrals', { id: newId_(10), childId: link.childId, feedbackId: fid, createdAt: t, name: clip_(r.name, 120), mobile: clip_(r.mobile, 20), contacted: false });
        });
      }
    });
    notify_('New feedback: ' + childName,
      parentName + ' has shared feedback about ' + childName + ' (' + d.rating + ').' +
      (/^Yes/.test(d.continueOn || '') ? '\nThey would like to continue. Please call them.' : ''));
    return { saved: true };
  }
};

/* ============================== coach actions ============================== */

var COACH_ACTIONS_ = {
  getAll: function () {
    function rows(name) { return readAll_(name).map(function (r) { delete r._row; return r; }); }
    var children = rows('Children').map(function (r) { r.data = parseJson_(r.data); delete r.matchKey; return r; });
    var feedback = rows('Feedback').map(function (r) { r.data = parseJson_(r.data); return r; });
    var links = rows('Links').map(function (r) { r.expired = isExpired_(r); return r; });
    return { children: children, feedback: feedback, links: links, referrals: rows('Referrals'), serverTime: now_() };
  },

  markSeen: function (req) {
    var id = String(req.childId || '');
    withLock_(function () {
      var c = findChild_(id);
      if (!c) throw userError_('NOT_FOUND', 'Child not found.');
      if (c.seen !== true) update_('Children', c._row, { seen: true });
      readAll_('Feedback').forEach(function (f) { if (f.childId === id && f.seen !== true) update_('Feedback', f._row, { seen: true }); });
    });
    return { done: true };
  },

  saveNote: function (req) {
    var id = String(req.childId || '');
    withLock_(function () {
      var c = findChild_(id);
      if (!c) throw userError_('NOT_FOUND', 'Child not found.');
      update_('Children', c._row, { notes: clip_(req.note, 3000) });
    });
    return { done: true };
  },

  /** Returns the child's open feedback link, creating one if needed. Does not count as "asked" until markLinkSent. */
  prepareFeedbackLink: function (req) {
    var id = String(req.childId || ''), out;
    withLock_(function () {
      if (!findChild_(id)) throw userError_('NOT_FOUND', 'Child not found.');
      var open = readAll_('Links').filter(function (l) { return l.childId === id && l.status === 'open' && !isExpired_(l); });
      if (open.length) { var l = open[open.length - 1]; out = { token: l.token, createdAt: l.createdAt, sentAt: l.sentAt }; return; }
      var token = newToken_();
      append_('Links', { token: token, childId: id, createdAt: now_(), sentAt: '', remindedAt: '', status: 'open', usedAt: '' });
      out = { token: token, createdAt: now_(), sentAt: '' };
    });
    return out;
  },

  markLinkSent: function (req) {
    var token = cleanToken_(req.token);
    withLock_(function () {
      var l = token && findLink_(token);
      if (!l) throw userError_('NOT_FOUND', 'Link not found.');
      if (!l.sentAt) update_('Links', l._row, { sentAt: now_() });
      else update_('Links', l._row, { remindedAt: now_() });
    });
    return { done: true };
  },

  setCalledBack: function (req) {
    var id = String(req.feedbackId || '');
    withLock_(function () {
      var f = readAll_('Feedback').filter(function (r) { return r.id === id; })[0];
      if (!f) throw userError_('NOT_FOUND', 'Feedback not found.');
      update_('Feedback', f._row, { calledBack: req.value !== false });
    });
    return { done: true };
  },

  setContacted: function (req) {
    var id = String(req.referralId || '');
    withLock_(function () {
      var r = readAll_('Referrals').filter(function (x) { return x.id === id; })[0];
      if (!r) throw userError_('NOT_FOUND', 'Referral not found.');
      update_('Referrals', r._row, { contacted: req.value !== false });
    });
    return { done: true };
  }
};

/* ============================== coach sign-in check ============================== */

function verifyCoach_(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) throw userError_('AUTH', 'Please sign in again.');
  var cache = CacheService.getScriptCache();
  var ck = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var email = cache.get(ck);
  if (!email) {
    var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(prop_('FIREBASE_API_KEY')), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw userError_('AUTH', 'Please sign in again.');
    var u = (JSON.parse(res.getContentText()).users || [])[0];
    if (!u || !u.email || u.emailVerified !== true) throw userError_('AUTH', 'Please sign in again.');
    email = String(u.email).toLowerCase();
    cache.put(ck, email, 600);
  }
  var allowed = prop_('COACH_EMAILS').toLowerCase().split(/[\s,;]+/).filter(String);
  if (allowed.indexOf(email) < 0) throw userError_('FORBIDDEN', 'The account ' + email + ' is not allowed into the coach app.');
  return email;
}

/* ============================== sheet helpers ============================== */

function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw new Error('Script is not bound to a Sheet and SHEET_ID is not set.');
    ss = SpreadsheetApp.openById(id);
  }
  return ss;
}
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(TABLES[name]); sh.setFrozenRows(1); }
  return sh;
}
function headers_(sh) { return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String); }
function readAll_(name) {
  var sh = sheet_(name), v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var hd = v[0].map(String), out = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] == null) continue;
    var o = { _row: i + 1 };
    hd.forEach(function (h, j) { var x = v[i][j]; o[h] = x instanceof Date ? x.toISOString() : x; });
    out.push(o);
  }
  return out;
}
function append_(name, obj) {
  var sh = sheet_(name), hd = headers_(sh);
  sh.appendRow(hd.map(function (h) { return cell_(obj[h]); }));
}
function update_(name, rowNum, patch) {
  var sh = sheet_(name), hd = headers_(sh);
  Object.keys(patch).forEach(function (k) {
    var c = hd.indexOf(k);
    if (c >= 0) sh.getRange(rowNum, c + 1).setValue(cell_(patch[k]));
  });
}
// A leading apostrophe stores the value as plain text: "+91…" and "=…" are never treated as formulas or numbers.
function cell_(v) {
  if (v === true || v === false) return v;
  if (v == null) return '';
  v = String(v);
  return v ? "'" + v : '';
}
function findChild_(id) { return id ? readAll_('Children').filter(function (r) { return r.id === id; })[0] : null; }
function findLink_(token) { return readAll_('Links').filter(function (l) { return l.token === token; })[0]; }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================== small helpers ============================== */

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function now_() { return new Date().toISOString(); }
function prop_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw userError_('CONFIG', 'The app is not fully set up yet (missing ' + k + ').');
  return v;
}
function userError_(code, message) { var e = new Error(message); e.code = code; return e; }
function parseJson_(s) { if (s && typeof s === 'object') return s; try { return JSON.parse(s || '{}') || {}; } catch (e) { return {}; } }
function clip_(s, n) { return String(s == null ? '' : s).slice(0, n); }
function requireText_(v, label) { if (!String(v || '').trim()) throw userError_('INVALID', 'Please fill in the ' + label + '.'); }
function cleanPayload_(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw userError_('INVALID', 'The form could not be read.');
  var s = JSON.stringify(d);
  if (s.length > MAX_PAYLOAD) throw userError_('INVALID', 'The form is too long. Please shorten the longest answers.');
  return JSON.parse(s);
}
function digits_(s) { return String(s || '').replace(/\D/g, ''); }
function phone10_(s) { var d = digits_(s); if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2); if (d.length === 11 && d[0] === '0') d = d.slice(1); return d; }
function validPhone_(s) {
  var raw = String(s || '').trim(); if (!raw) return false;
  if (raw[0] === '+' && raw.slice(0, 3) !== '+91') { var n = digits_(raw).length; return n >= 8 && n <= 15; }
  return /^[6-9]\d{9}$/.test(phone10_(raw));
}
function niceName_(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function firstName_(s) { var n = String(s || '').trim().split(/\s+/)[0] || ''; return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; }
function matchKey_(mobile, name) { return phone10_(mobile) + '|' + niceName_(name); }
function newId_(n) { return Utilities.getUuid().replace(/-/g, '').slice(0, n); }
// 32 hex characters from two UUIDs (well over 100 random bits): impossible to guess.
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32); }
function cleanToken_(t) { t = String(t || '').toLowerCase(); return /^[a-f0-9]{24,40}$/.test(t) ? t : ''; }
function isExpired_(l) {
  var t = Date.parse(l.createdAt);
  return l.status === 'open' && !isNaN(t) && (Date.now() - t) > LINK_DAYS * 864e5;
}
function floodGuard_() {
  var c = CacheService.getScriptCache(), k = 'flood_' + Math.floor(Date.now() / 60000);
  var n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 120);
  if (n > MAX_PUBLIC_PER_MIN) throw userError_('BUSY', 'Too many forms at once. Please try again in a minute.');
}
function notify_(subject, body) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (!to) return;
    var url = PropertiesService.getScriptProperties().getProperty('APP_URL');
    MailApp.sendEmail({ to: to, subject: subject, body: body + (url ? '\n\nOpen the coach app: ' + url.replace(/\/$/, '') + '/coach/' : '') });
  } catch (e) {
    console.warn('Alert email failed: ' + e); // the form is already saved
  }
}
