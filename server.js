// Minimal static server so the dashboard runs at http://localhost:8917
// (Google OAuth does not allow file:// pages). No dependencies — plain Node.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8917;
const ROOT = __dirname;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Dashboard running: http://localhost:${PORT}  (Ctrl+C to stop)`));
