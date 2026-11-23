import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT 必须是 0–65535 之间的整数。');
  process.exit(1);
}
const healthPath = '/__preflop_lab_health';
const appId = 'preflop-lab-local';
function openBrowser(url) {
  if (!process.argv.includes('--open')) return;
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, [url], { stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.warn(`无法自动打开浏览器，请手动访问 ${url}`));
  browser.unref();
}
async function isExistingTrainer(url) {
  try {
    const health = await fetch(url + healthPath, { signal: AbortSignal.timeout(2000) });
    if (health.ok) return (await health.json()).app === appId;
    // Earlier local servers have no health endpoint. Match this checkout's
    // exact HTML before treating a service on the occupied port as our app.
    if (health.status !== 404) return false;
    const page = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return page.ok && await page.text() === await readFile(resolve(root, 'index.html'), 'utf8');
  } catch { return false; }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === healthPath) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ app: appId, pid: process.pid, root }));
      return;
    }
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root + sep) || pathname.split('/').some(p => p.startsWith('.'))) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', async error => {
  const url = `http://127.0.0.1:${port}`;
  if (error.code === 'EADDRINUSE' && !process.argv.includes('--exclusive') && await isExistingTrainer(url)) {
    console.log(`Preflop Lab 已在运行，直接使用现有服务：${url}`);
    openBrowser(url);
    return;
  }
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被其他程序占用。未关闭该程序；请设置其他 PORT 后重试。`
    : `无法启动本地服务：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`Local: ${url}`);
  openBrowser(url);
});
