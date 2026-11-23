import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
function launch(port) {
  return spawn(process.execPath, [script], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}
async function finishLaunch(port) {
  const child = launch(port);
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b);
  child.stderr.on('data', b => stderr += b);
  const timer = setTimeout(() => child.kill(), 8000);
  try { const [code] = await once(child, 'exit'); return { code, stdout, stderr }; }
  finally { clearTimeout(timer); }
}
async function stub(t, respond) {
  const server = http.createServer(respond);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return server.address().port;
}

test('first launch serves the trainer; a duplicate reuses it without an uncaught error', { timeout: 10000 }, async t => {
  const child = launch(0);
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', b => { output += b; const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/); if (match) resolve(match[1]); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited before ready: ${code}`)));
  });
  assert.equal((await fetch(url)).status, 200);
  const health = await (await fetch(url + '/__preflop_lab_health')).json();
  assert.equal(health.app, 'preflop-lab-local');
  assert.equal(health.pid, child.pid);
  assert.equal(health.root, fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, ''));
  const repeat = await finishLaunch(new URL(url).port);
  assert.equal(repeat.code, 0);
  assert.match(repeat.stdout, /已在运行/);
  assert.equal(repeat.stderr, '');
  assert.equal((await fetch(url)).status, 200);
});

test('duplicate launch also recognizes the earlier server without a health endpoint', { timeout: 10000 }, async t => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const port = await stub(t, (req, res) => req.url === '/' ? res.end(html) : res.writeHead(404).end('Not found'));
  const result = await finishLaunch(port);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /已在运行/);
  assert.equal(result.stderr, '');
});

test('an unrelated occupied port is reported without stopping or replacing its service', { timeout: 10000 }, async t => {
  const port = await stub(t, (req, res) => req.url === '/' ? res.end('Other application') : res.writeHead(404).end());
  const result = await finishLaunch(port);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /已被其他程序占用/);
  assert.doesNotMatch(result.stderr, /Unhandled|node:events/);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'Other application');
});
