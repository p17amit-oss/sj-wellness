/* SJ Wellness – shared helpers for the parent pages and the coach app. */
(function (g) {
'use strict';
var CFG = g.SJ_CONFIG || {};

function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, c) {
  if (c == null || c === false || c === '') return;
  if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
  el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}
var ICONS = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  wifi: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
};
function icon(name) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
  s.innerHTML = ICONS[name] || '';
  return s;
}
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function phone10(s) { var d = digits(s); if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2); if (d.length === 11 && d[0] === '0') d = d.slice(1); return d; }
function validPhone(s) {
  var raw = String(s || '').trim(); if (!raw) return true;
  if (raw[0] === '+' && raw.slice(0, 3) !== '+91') { var n = digits(raw).length; return n >= 8 && n <= 15; }
  return /^[6-9]\d{9}$/.test(phone10(raw));
}
function fmtPhone(s) { var d = phone10(s); return d.length === 10 ? d.slice(0, 5) + ' ' + d.slice(5) : String(s || ''); }
function intlPhone(s) { var raw = String(s || '').trim(), d = phone10(raw); if (d.length === 10) return '91' + d; return digits(raw); }
function telHref(s) { return 'tel:+' + intlPhone(s); }
function waHref(s, text) { return 'https://wa.me/' + (s ? intlPhone(s) : '') + (text ? '?text=' + encodeURIComponent(text) : ''); }
function isBlank(v) { return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length); }
function niceName(s) {
  s = String(s || '').trim().replace(/\s+/g, ' ');
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = s.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  return s;
}
function firstName(s) { return niceName(s).split(' ')[0] || ''; }
function initials(s) { var p = niceName(s).split(' ').filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function todayISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function ageFromDob(dob) {
  if (!dob) return null; var d = new Date(dob + 'T00:00:00'); if (isNaN(d)) return null;
  var n = new Date(), a = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}
function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function monthYear(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function relDate(iso) {
  var d = new Date(iso), t = new Date();
  if (isNaN(d)) return '';
  var days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 7) return days + ' days ago';
  return 'on ' + fmtDate(iso);
}
function withOther(arr, other) { return (arr || []).map(function (x) { return x === 'Other' && other ? other : x; }); }
var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
}
var store = (function () { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; } catch (e) { return null; } })();
function copyText(txt, okMsg) {
  try { navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, function () { toast('Could not copy here. Press and hold the text to copy it.'); }); }
  catch (e) { toast('Could not copy here. Press and hold the text to copy it.'); }
}

/** Calls the Apps Script backend. text/plain keeps it a "simple" request, so no CORS preflight is needed. */
function api(action, payload, idToken) {
  var body = Object.assign({ action: action }, payload || {});
  if (idToken) body.idToken = idToken;
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
  return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json(); }, function () {
      var e = new Error(navigator.onLine === false ? 'You are offline. Please check your internet and try again.' : 'Could not reach the server. Please try again.');
      e.code = 'NETWORK'; throw e;
    })
    .then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res || !res.ok) { var e = new Error((res && res.message) || 'Something went wrong. Please try again.'); e.code = res && res.error; throw e; }
      return res.data;
    });
}

Object.assign(g, {
  h: h, add: add, icon: icon, digits: digits, phone10: phone10, validPhone: validPhone, fmtPhone: fmtPhone, intlPhone: intlPhone,
  telHref: telHref, waHref: waHref, isBlank: isBlank, niceName: niceName, firstName: firstName, initials: initials, todayISO: todayISO,
  ageFromDob: ageFromDob, fmtDate: fmtDate, monthYear: monthYear, relDate: relDate, withOther: withOther, toast: toast, store: store,
  copyText: copyText, api: api
});
})(window);
