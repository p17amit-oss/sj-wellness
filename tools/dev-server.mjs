// Local preview: serves public/ like Firebase Hosting and answers /api with the real Code.gs (via the emulator).
// Run: node tools/dev-server.mjs   then open http://localhost:8080/join/  and  http://localhost:8080/coach/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmulator } from './gas-emulator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const port = Number(process.env.PORT || 8080);
const dataFile = process.env.DEV_DATA === 'memory' ? null : path.join(root, 'tools', '.dev-data.json');
const emu = createEmulator({
  codePath: path.join(root, 'apps-script', 'Code.gs'),
  props: { AUTH_MODE: process.env.AUTH_MODE || 'open', COACH_KEY: 'test-coach-key-123', COACH_EMAILS: 'coach@example.com', NOTIFY_EMAIL: 'coach@example.com', FIREBASE_API_KEY: 'dev', APP_URL: 'http://localhost:' + port },
  users: { dev: 'coach@example.com', intruder: 'someone@example.com' },
  dataFile
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const DEV_CONFIG = `window.SJ_CONFIG = { API_URL: '/api', AUTH: '${process.env.AUTH_MODE || 'open'}', FIREBASE: {}, MAPS_URL: 'https://maps.app.goo.gl/tiZRrPpCCRnW7KR2A', REVIEW_URL: 'https://search.google.com/local/writereview?placeid=ChIJ83LREBLD5zsRIyAEh45XQ-c' };`;

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' }); res.end(body); }
function fileFor(p) {
  let f = path.join(pub, decodeURIComponent(p));
  if (!f.startsWith(pub)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => send(res, 200, 'application/json', JSON.stringify(emu.post(body))));
    return;
  }
  if (url.pathname === '/__mail') return send(res, 200, 'application/json', JSON.stringify(emu.mail));
  if (url.pathname === '/config.js') return send(res, 200, TYPES['.js'], DEV_CONFIG);
  if ((url.pathname === '/join' || url.pathname === '/coach' || url.pathname === '/f') ) { res.writeHead(301, { Location: url.pathname + '/' }); return res.end(); }
  let f = fileFor(url.pathname);
  if (!f && url.pathname.startsWith('/f/')) f = path.join(pub, 'f', 'index.html');
  if (!f) return send(res, 404, TYPES['.html'], fs.readFileSync(path.join(pub, '404.html')));
  send(res, 200, TYPES[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
}).listen(port, () => console.log('SJ Wellness dev server on http://localhost:' + port));
