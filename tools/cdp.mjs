// Minimal headless-Chrome driver over the DevTools protocol. No dependencies.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function launch({ width = 1280, height = 720, port = 9300 + Math.floor(Math.random() * 500) } = {}) {
  const profile = fs.mkdtempSync(path.join(process.env.SCRATCH || os.tmpdir(), 'orbit-chrome-'));
  const proc = spawn('/usr/bin/google-chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await new Promise(r => setTimeout(r, 100));
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) { proc.kill(); throw new Error('chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method) events.push(d);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const waitFor = async (method, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const i = events.findIndex(e => e.method === method); if (i >= 0) return events.splice(i, 1)[0]; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('timeout waiting for ' + method);
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return {
    send, waitFor, events,
    async open(file) { await send('Page.navigate', { url: 'file://' + path.resolve(file) }); await waitFor('Page.loadEventFired'); },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async screenshot(file, w, h) {
      const r = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    errors() { return events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')).map(e => JSON.stringify(e.params).slice(0, 600)); },
    close() { try { ws.close(); } catch {} proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
}
