// A small Chrome DevTools Protocol client for the manual builder: start headless Chrome, open tabs, send commands.
// It uses Node's own WebSocket, so the repository needs no browser-automation package.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** CHROME_PATH, then the usual Chrome install places, then Edge. */
export function findChrome({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  if (env.CHROME_PATH) return exists(env.CHROME_PATH) ? env.CHROME_PATH : null;
  const candidates =
    platform === 'win32'
      ? [
          path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
          path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        ]
      : platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((candidate) => exists(candidate)) || null;
}

/**
 * @returns {Promise<{ newPage(): Promise<CdpPage>, close(): Promise<void> }>}
 */
export async function launchChrome(chromePath) {
  const profile = mkdtempSync(path.join(tmpdir(), 'weve-manual-chrome-'));
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--disable-gpu', 'about:blank'],
    { stdio: 'ignore' },
  );

  // Chrome writes the port it picked and the browser endpoint into DevToolsActivePort.
  const portFile = path.join(profile, 'DevToolsActivePort');
  let endpoint = '';
  for (let tries = 0; tries < 150 && !endpoint; tries += 1) {
    if (existsSync(portFile)) {
      const [port, browserPath] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (port && browserPath) endpoint = `ws://127.0.0.1:${port}${browserPath}`;
    }
    if (!endpoint) await sleep(100);
  }
  if (!endpoint) {
    chrome.kill();
    throw new Error('크롬을 띄우지 못했습니다(DevToolsActivePort가 생기지 않음).');
  }

  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('크롬 개발자 도구에 연결하지 못했습니다.')), { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    } else if (message.method && message.sessionId) {
      for (const listener of listeners.get(message.sessionId) || []) listener(message.method, message.params);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1);
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return {
    async newPage() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      return new CdpPage((method, params) => send(method, params, sessionId), (listener) => {
        listeners.set(sessionId, [...(listeners.get(sessionId) || []), listener]);
      }, () => send('Target.closeTarget', { targetId }));
    },
    async close() {
      try {
        await send('Browser.close');
      } catch {
        // Already gone.
      }
      socket.close();
      if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
      else chrome.kill();
      // Chrome may still hold files for a moment on Windows.
      for (let tries = 0; tries < 10; tries += 1) {
        try {
          rmSync(profile, { recursive: true, force: true });
          break;
        } catch {
          await sleep(300);
        }
      }
    },
  };
}

export class CdpPage {
  constructor(send, subscribe, close) {
    this.send = send;
    this.subscribe = subscribe;
    this.closeTarget = close;
  }

  /** Evaluates an expression in the page and returns its value; a thrown error in the page becomes a thrown error here. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description);
    }
    return result.result.value;
  }

  /** Waits until the expression is truthy. */
  async waitFor(expression, timeoutMs = 20000, what = expression) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      if (await this.evaluate(`Boolean(${expression})`).catch(() => false)) return;
      if (Date.now() > until) throw new Error(`기다리다 시간이 지났습니다: ${what}`);
      await sleep(200);
    }
  }

  onConsole(callback) {
    this.subscribe((method, params) => {
      if (method === 'Runtime.consoleAPICalled') callback(params.type, params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    });
  }

  async close() {
    await this.closeTarget().catch(() => undefined);
  }
}
