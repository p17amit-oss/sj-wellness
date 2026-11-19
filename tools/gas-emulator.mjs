// Runs apps-script/Code.gs in Node with small stand-ins for the Google services it uses.
// Used for local development and tests only. Sheets behaviour that matters here is copied:
// a leading apostrophe stores text as-is, booleans stay booleans, rows are read back as a 2D array.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

export function createEmulator({ codePath, props = {}, users = {}, dataFile = null } = {}) {
  const sheets = new Map(); // name -> array of rows
  const mail = [];
  if (dataFile && fs.existsSync(dataFile)) {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(dataFile, 'utf8')))) sheets.set(k, v);
  }
  const persist = () => { if (dataFile) fs.writeFileSync(dataFile, JSON.stringify(Object.fromEntries(sheets), null, 1)); };
  const store = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);

  function makeSheet(name) {
    const rows = sheets.get(name);
    const width = () => rows.reduce((m, r) => Math.max(m, r.length), 0);
    const grid = (r0, c0, nr, nc) => {
      const out = [];
      for (let r = 0; r < nr; r++) { const row = []; for (let c = 0; c < nc; c++) { const v = (rows[r0 + r] || [])[c0 + c]; row.push(v === undefined ? '' : v); } out.push(row); }
      return out;
    };
    return {
      getName: () => name,
      appendRow: (vals) => { rows.push(vals.map(store)); persist(); },
      getLastRow: () => rows.length,
      getLastColumn: () => width(),
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => grid(0, 0, rows.length, width()) }),
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => grid(r - 1, c - 1, nr, nc),
        setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = store(v); persist(); },
        setValues: (vals) => { vals.forEach((rv, i) => rv.forEach((v, j) => { while (rows.length < r + i) rows.push([]); rows[r - 1 + i][c - 1 + j] = store(v); })); persist(); },
        setFontWeight: () => {}
      })
    };
  }
  const ss = {
    getSheetByName: (n) => (sheets.has(n) ? makeSheet(n) : null),
    insertSheet: (n) => { sheets.set(n, []); return makeSheet(n); }
  };
  const cache = new Map();
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, String(v)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props[k] == null ? null : String(props[k])) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64url')
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        if (!/accounts:lookup/.test(url)) throw new Error('Unexpected fetch ' + url);
        const tok = JSON.parse(opts.payload).idToken;
        const email = users[tok];
        const body = email ? { users: [{ email, emailVerified: true }] } : { error: { message: 'INVALID_ID_TOKEN' } };
        return { getResponseCode: () => (email ? 200 : 400), getContentText: () => JSON.stringify(body) };
      }
    },
    MailApp: { sendEmail: (m) => mail.push(m) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: path.basename(codePath) });
  return {
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent()),
    get: () => JSON.parse(ctx.doGet().getContent()),
    sheets, mail
  };
}
