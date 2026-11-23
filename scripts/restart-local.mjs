import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const serverFile = resolve(root, 'scripts/serve.mjs');
const port = Number(process.env.PORT || 5173);
const url = `http://127.0.0.1:${port}`;
const samePath = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

function portOccupied() {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = occupied => { socket.destroy(); resolve(occupied); };
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
    socket.setTimeout(1000, () => finish(true));
  });
}

async function existingTrainerPid() {
  const health = await fetch(url + '/__preflop_lab_health', { signal: AbortSignal.timeout(2000) });
  let legacy = health.status === 404;
  if (health.ok) {
    const info = await health.json();
    if (info.app === 'preflop-lab-local' && typeof info.root === 'string' && samePath(info.root, root)
      && Number.isInteger(info.pid) && info.pid > 0 && info.pid !== process.pid) return info.pid;
    legacy = info.app === 'preflop-lab-local' && info.pid === undefined && info.root === undefined;
  }
  // Migrate the older Windows server, which had no PID/root health metadata.
  // Check both its rendered entry point and application source, then inspect
  // only the process listening on this loopback port. Never stop all Node apps.
  if (process.platform === 'win32' && legacy) {
    for (const file of ['index.html', 'src/app.js']) {
      const response = await fetch(url + (file === 'index.html' ? '/' : '/' + file), { signal: AbortSignal.timeout(2000) });
      if (!response.ok || await response.text() !== await readFile(resolve(root, file), 'utf8')) throw new Error('端口上的服务不属于当前训练器，未停止它。');
    }
    const command = `$owners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${port} -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if ($owners.Count -ne 1) { throw 'Ambiguous listener' }; Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $owners[0]) | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10000, encoding: 'utf8' });
    const info = JSON.parse(stdout);
    const line = String(info.CommandLine || '').replaceAll('\\', '/').toLowerCase();
    const expected = serverFile.replaceAll('\\', '/').toLowerCase();
    const relative = /(?:^|[\s"])scripts\/serve\.mjs(?:[\s"]|$)/.test(line);
    if (String(info.Name).toLowerCase() === 'node.exe' && (line.includes(expected) || relative)
      && Number.isInteger(info.ProcessId) && info.ProcessId > 0 && info.ProcessId !== process.pid) return info.ProcessId;
  }
  throw new Error('端口上的服务不是可确认的当前项目服务，未停止它。');
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 之间的整数。');
  console.log(`正在重启 Preflop Lab：${url}`);
  if (await portOccupied()) {
    const pid = await existingTrainerPid();
    console.log(`正在停止旧服务（PID ${pid}）…`);
    try { process.kill(pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    for (let attempt = 0; attempt < 50 && await portOccupied(); attempt++) await delay(100);
    if (await portOccupied()) throw new Error(`端口 ${port} 尚未释放，请稍后重试。`);
  }
  console.log('正在启动新服务。请保持此窗口打开；关闭窗口会结束本次服务。');
  const args = [serverFile, '--exclusive', ...(process.argv.includes('--open') ? ['--open'] : [])];
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'inherit', windowsHide: true });
  const stop = () => { if (child.exitCode === null && !child.killed) child.kill(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.exitCode = code ?? (signal ? 0 : 1);
      console.log('本次训练器服务已停止。');
      resolve();
    });
  });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

main().catch(error => {
  console.error(`重启失败：${error.message}`);
  console.error(`请保留此窗口查看错误；当前地址为 ${url}`);
  process.exitCode = 1;
});
