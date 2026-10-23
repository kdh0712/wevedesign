// npm run manuals [-- --only office|estimate] [-- --base http://localhost:3000] [-- --shots id,id]
// --shots captures only those sections into a temp folder (no PDF), to check a screen while writing the content.
// Makes the staff PDF manuals (spec 2026-10-23 §4): opens each screen with made-up data, marks it, captures it, prints
// the manual and checks pages, links and size before writing manuals/<id>.pdf. A failed check writes nothing.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, launchChrome } from './cdp.mjs';
import { renderManual, validateManual } from './layout.mjs';
import { SCRUB_TEXT, buildMockData, mockInitScript } from './mock-data.mjs';
import { readPdfLinks } from './pdf-links.mjs';
import estimateManual from './estimate-manual.mjs';
import officeManual from './office-manual.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANUALS = { office: officeManual, estimate: estimateManual };
const MAX_PDF_BYTES = 4_000_000;
const JPEG_QUALITY = 80;
const VIEWPORT = { width: 1440, height: 900 };
const SETTLE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { only: null, base: 'http://localhost:3000', shots: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--only') args.only = argv[(index += 1)];
    else if (argv[index] === '--base') args.base = argv[(index += 1)].replace(/\/$/, '');
    else if (argv[index] === '--shots') args.shots = argv[(index += 1)].split(',').filter(Boolean);
    else throw new Error(`알 수 없는 옵션: ${argv[index]}`);
  }
  if (args.only && !MANUALS[args.only]) throw new Error(`--only 는 ${Object.keys(MANUALS).join(' | ')} 중 하나여야 합니다.`);
  return args;
}

async function isServing(base) {
  try {
    const response = await fetch(`${base}/manager-weve-7519`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Uses a running dev server, or starts `next dev` on the base port and stops it at the end.
async function ensureServer(base) {
  if (await isServing(base)) return () => undefined;
  const { hostname, port } = new URL(base);
  if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error(`${base} 에 연결할 수 없습니다.`);
  console.log(`개발 서버를 ${port || 80}번 포트로 띄웁니다…`);
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', port || '80'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const stop = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  };
  for (let waited = 0; waited < 120_000; waited += 1000) {
    if (await isServing(base)) return stop;
    await sleep(1000);
  }
  stop();
  throw new Error('개발 서버가 120초 안에 뜨지 않았습니다.');
}

// Installed into every captured page: finds elements by their visible text or a selector (spec §4.3 번호 붙이기).
function installManualHelpers() {
  const norm = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const CLICKABLE = 'button, a, [role="button"], [role="menuitem"], [role="tab"], summary, label';
  const describe = (target) => JSON.stringify(target);
  const findAll = (target, root = document) => {
    const spec = typeof target === 'string' ? { text: target } : target;
    const scope = spec.within ? findOne(spec.within, root) : root;
    let list;
    if (spec.selector) {
      list = [...scope.querySelectorAll(spec.selector)];
    } else {
      const wanted = norm(spec.text ?? spec.contains);
      const matches = (element) => (spec.text !== undefined ? norm(element.textContent) === wanted : norm(element.textContent).includes(wanted));
      const all = [...scope.querySelectorAll('*')].filter((element) => !['SCRIPT', 'STYLE', 'TITLE', 'HEAD'].includes(element.tagName) && matches(element));
      // The innermost element with the text, raised to the button or link around it when that holds the same text.
      list = all.filter((element) => !all.some((other) => other !== element && element.contains(other)));
      list = list.map((element) => {
        const clickable = element.closest(CLICKABLE);
        return clickable && scope.contains(clickable) && matches(clickable) ? clickable : element;
      });
    }
    if (spec.closest) list = list.map((element) => element.closest(spec.closest)).filter(Boolean);
    return [...new Set(list)].filter(visible);
  };
  const findOne = (target, root = document) => {
    const list = findAll(target, root);
    const nth = typeof target === 'object' ? target.nth : undefined;
    if (nth !== undefined) {
      // A negative nth counts from the end (-1 = the last one, e.g. the button in a window opened over a list).
      const element = list[nth < 0 ? list.length + nth : nth];
      if (!element) throw new Error(`대상을 찾지 못했습니다: ${describe(target)} (보이는 것 ${list.length}개)`);
      return element;
    }
    if (list.length !== 1) throw new Error(`대상이 ${list.length}개입니다: ${describe(target)}`);
    return list[0];
  };
  window.__manual = { findAll, findOne };
}

const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38 };

async function clickAt(page, target, { button = 'left', clickCount = 1 } = {}) {
  const point = await page.evaluate(`(() => {
    const element = window.__manual.findOne(${JSON.stringify(target)});
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  for (let count = 1; count <= clickCount; count += 1) {
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button, clickCount: count });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button, clickCount: count });
  }
}

async function runAction(page, action) {
  if (action.click) await clickAt(page, action.click);
  else if (action.doubleClick) await clickAt(page, action.doubleClick, { clickCount: 2 });
  else if (action.rightClick) await clickAt(page, action.rightClick, { button: 'right' });
  else if (action.scrollTo) {
    await page.evaluate(`window.__manual.findOne(${JSON.stringify(action.scrollTo)}).scrollIntoView({ block: 'start' })`);
  } else if (action.press) {
    const code = KEYS[action.press] || 0;
    for (const type of ['keyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', { type, key: action.press, code: action.press, windowsVirtualKeyCode: code });
    }
  } else if (action.setValue) {
    await page.evaluate(`(() => {
      const element = window.__manual.findOne(${JSON.stringify(action.setValue.target)});
      const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(action.setValue.value)});
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`);
  } else if (action.run) {
    await page.evaluate(action.run);
  } else if (!action.wait) {
    throw new Error(`알 수 없는 동작: ${JSON.stringify(action)}`);
  }
  await sleep(action.wait ?? SETTLE_MS);
}

// Hides the Next.js dev badge and anything the content asks to hide, swaps real names and numbers built into the
// screens for made-up ones (SCRUB_TEXT), then draws the red numbers (and boxes).
async function prepareForCapture(page, hide, marks, badgeSize) {
  await page.evaluate(`(() => {
    // The page itself and same-origin frames (the homepage preview).
    const docs = [document, ...[...document.querySelectorAll('iframe')].map((frame) => { try { return frame.contentDocument; } catch { return null; } }).filter((doc) => doc && doc.body)];
    for (const [from, to] of ${JSON.stringify(SCRUB_TEXT)}) for (const doc of docs) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
      }
      for (const field of doc.querySelectorAll('input, textarea')) {
        if (field.placeholder && field.placeholder.includes(from)) field.placeholder = field.placeholder.split(from).join(to);
        if (field.value && field.value.includes(from)) field.value = field.value.split(from).join(to);
      }
    }
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal { display: none !important; }';
    document.head.append(style);
    for (const target of ${JSON.stringify(hide)}) {
      for (const element of window.__manual.findAll(target)) element.style.setProperty('display', 'none', 'important');
    }
  })()`);
  await sleep(150);
  return page.evaluate(`(() => {
    const placed = [];
    const layer = document.createElement('div');
    layer.setAttribute('data-manual-marks', '');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.append(layer);
    const docWidth = document.documentElement.scrollWidth;
    for (const mark of ${JSON.stringify(marks)}) {
      const element = window.__manual.findOne(mark.target);
      const rect = element.getBoundingClientRect();
      // The element must be what is drawn at its centre: not scrolled out of a box (a wide table) or under something else.
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      // A see-through control laid over it in the same box (a file input over a drop zone) does not count as covering it.
      const hidden = hit !== null && !element.contains(hit) && !hit.contains(element) && !(element.parentElement && element.parentElement.contains(hit));
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      if (mark.box) {
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;border:3px solid #e4572e;border-radius:6px;box-shadow:0 0 0 2px rgba(255,255,255,.85);';
        Object.assign(box.style, { left: left - 4 + 'px', top: top - 4 + 'px', width: rect.width + 8 + 'px', height: rect.height + 8 + 'px' });
        layer.append(box);
      }
      const size = ${badgeSize};
      const place = mark.place || 'tl';
      let x = place === 'tr' || place === 'right' ? left + rect.width - size / 2 : left - size / 2;
      let y = place === 'left' || place === 'right' ? top + rect.height / 2 - size / 2 : top - size / 2;
      if (place === 'left') x = left - size - 4;
      if (place === 'right') x = left + rect.width + 4;
      if (place === 'bl') y = top + rect.height - size / 2;
      x = Math.max(2, Math.min(x, docWidth - size - 2));
      y = Math.max(2, y);
      const badge = document.createElement('div');
      badge.textContent = String(mark.n);
      badge.style.cssText = 'position:absolute;display:grid;place-items:center;border-radius:50%;background:#e4572e;color:#fff;font:800 ' + Math.round(size * 0.55) + 'px/1 "Malgun Gothic",sans-serif;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.35);';
      Object.assign(badge.style, { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' });
      layer.append(badge);
      placed.push({ n: mark.n, x: x + size / 2, y: y + size / 2, hidden });
    }
    return placed;
  })()`);
}

async function captureSection(chrome, base, manual, section, data, unmocked) {
  const shot = section.shot;
  const page = await chrome.newPage();
  try {
    page.onConsole((type, text) => {
      if (text.startsWith('[manual-mock] unmocked')) unmocked.add(`${manual.id}/${section.id}: ${text.replace('[manual-mock] unmocked ', '')}`);
    });
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: shot.width || VIEWPORT.width, height: shot.height || VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installManualHelpers.toString()})();` });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: mockInitScript(data, { session: shot.session !== false }) });
    await page.send('Page.navigate', { url: `${base}${shot.path}` });
    const ready = shot.ready || manual.ready;
    await page.waitFor(`(() => { try { return window.__manual.findAll(${JSON.stringify(ready)}).length > 0; } catch { return false; } })()`, 60000, `${section.id}: ${JSON.stringify(ready)}`);
    await sleep(800);
    for (const action of shot.actions || []) await runAction(page, action);
    // A whole-screen capture is shrunk more on the page, so its numbers are drawn bigger.
    const placed = await prepareForCapture(page, [...(manual.hide || []), ...(shot.hide || [])], shot.marks || [], shot.clip ? 28 : 38);
    await page.evaluate('document.fonts.ready.then(() => true)');

    let clip;
    if (shot.clip) {
      clip = await page.evaluate(`(() => {
        const rect = window.__manual.findOne(${JSON.stringify(shot.clip)}).getBoundingClientRect();
        const pad = ${shot.clipPad ?? 16};
        const x = Math.max(0, rect.left + window.scrollX - pad);
        const y = Math.max(0, rect.top + window.scrollY - pad);
        return { x, y, width: Math.min(rect.width + pad * 2, document.documentElement.scrollWidth - x), height: rect.height + pad * 2, scale: 1 };
      })()`);
    }
    // Every red number must be inside the picture, or the page would explain a number nobody can see.
    const frame = clip || (await page.evaluate(`({ x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight })`));
    const hidden = placed.filter((badge) => badge.hidden);
    if (hidden.length) throw new Error(`번호 ${hidden.map((badge) => badge.n).join(', ')}의 대상이 가려져 있습니다(상자 밖으로 스크롤됐거나 다른 것에 덮임).`);
    const outside = placed.filter((badge) => badge.x < frame.x || badge.y < frame.y || badge.x > frame.x + frame.width || badge.y > frame.y + frame.height);
    if (outside.length) throw new Error(`번호 ${outside.map((badge) => badge.n).join(', ')}이(가) 캡처 밖에 있습니다. shot.height를 키우거나 스크롤해 주세요.`);
    const { data: jpeg } = await page.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: JPEG_QUALITY,
      ...(clip ? { clip, captureBeyondViewport: true } : {}),
    });
    return `data:image/jpeg;base64,${jpeg}`;
  } catch (caught) {
    throw new Error(`[${manual.id}] 절 '${section.id}' 캡처 실패: ${caught instanceof Error ? caught.message : caught}`);
  } finally {
    await page.close();
  }
}

async function printPdf(chrome, html, pageIds) {
  const dir = mkdtempSync(path.join(tmpdir(), 'weve-manual-html-'));
  const file = path.join(dir, 'manual.html');
  writeFileSync(file, html);
  const page = await chrome.newPage();
  try {
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url: pathToFileURL(file).href });
    await page.waitFor(`document.readyState === 'complete' && [...document.images].every((image) => image.complete)`, 60000, '설명서 HTML 읽기');
    await page.evaluate('document.fonts.ready.then(() => true)');
    const ids = await page.evaluate(`[...document.querySelectorAll('.page')].map((element) => element.id)`);
    if (ids.join() !== pageIds.join()) throw new Error('HTML의 쪽 목록이 계획과 다릅니다.');
    const overflowing = await page.evaluate(
      `[...document.querySelectorAll('.page')].filter((element) => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1).map((element) => element.id)`,
    );
    if (overflowing.length) throw new Error(`쪽 내용이 넘칩니다: ${overflowing.join(', ')}`);
    const { data } = await page.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    return Buffer.from(data, 'base64');
  } finally {
    await page.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyPdf(id, bytes, pageIds, expectedLinks) {
  const { pageCount, links } = readPdfLinks(bytes);
  const problems = [];
  if (pageCount !== pageIds.length) problems.push(`PDF ${pageCount}쪽, 계획 ${pageIds.length}쪽`);
  const broken = links.filter((link) => link.uri || link.targetPage === null);
  if (broken.length) problems.push(`PDF 밖이나 없는 곳으로 가는 링크 ${broken.length}개`);
  const key = (link) => `${link.page}->${link.targetPage}`;
  const want = expectedLinks.map(key).sort();
  const got = links.filter((link) => !link.uri).map(key).sort();
  if (want.join() !== got.join()) {
    const missing = want.filter((item) => !got.includes(item));
    const extra = got.filter((item) => !want.includes(item));
    problems.push(`링크가 계획과 다릅니다 (계획 ${want.length}개, PDF ${got.length}개; 빠짐 ${missing.slice(0, 5).join(' ')}; 더 있음 ${extra.slice(0, 5).join(' ')})`);
  }
  if (bytes.length > MAX_PDF_BYTES) problems.push(`파일이 ${bytes.length.toLocaleString()}바이트로 ${MAX_PDF_BYTES.toLocaleString()}바이트를 넘습니다`);
  if (problems.length) throw new Error(`[${id}] PDF 확인 실패: ${problems.join(' / ')}`);
  return { pageCount, linkCount: links.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = args.only ? [MANUALS[args.only]] : Object.values(MANUALS);
  for (const manual of selected) validateManual(manual);

  const chromePath = findChrome();
  if (!chromePath) throw new Error('크롬이나 엣지를 찾지 못했습니다. CHROME_PATH 에 실행 파일 위치를 넣어 주세요.');
  const stopServer = await ensureServer(args.base);
  const chrome = await launchChrome(chromePath);
  const unmocked = new Set();
  const today = new Date();
  try {
    const data = buildMockData(today);
    for (const manual of selected) {
      const sections = manual.chapters.flatMap((chapter) => chapter.sections);
      if (args.shots) {
        const dir = path.join(tmpdir(), 'weve-manual-shots');
        mkdirSync(dir, { recursive: true });
        for (const section of sections.filter((item) => args.shots.includes(item.id))) {
          const dataUrl = await captureSection(chrome, args.base, manual, section, data, unmocked);
          const out = path.join(dir, `${manual.id}-${section.id}.jpg`);
          writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
          console.log(out);
        }
        continue;
      }
      const shots = {};
      for (const section of sections) {
        process.stdout.write(`[${manual.id}] ${section.id} 캡처…\n`);
        shots[section.id] = await captureSection(chrome, args.base, manual, section, data, unmocked);
      }
      const { html, pageIds, expectedLinks } = renderManual(manual, { shots, date: today });
      const bytes = await printPdf(chrome, html, pageIds);
      const result = verifyPdf(manual.id, bytes, pageIds, expectedLinks);
      mkdirSync(path.join(ROOT, 'manuals'), { recursive: true });
      writeFileSync(path.join(ROOT, 'manuals', `${manual.id}.pdf`), bytes);
      console.log(`[${manual.id}] manuals/${manual.id}.pdf: ${result.pageCount}쪽, 링크 ${result.linkCount}개, ${bytes.length.toLocaleString()}바이트`);
    }
  } finally {
    await chrome.close();
    stopServer();
  }
  if (unmocked.size) {
    console.error(`가짜 응답이 없는 API ${unmocked.size}개 (빈 응답으로 처리함):\n  ${[...unmocked].join('\n  ')}`);
    process.exitCode = 1;
  }
}

main().catch((caught) => {
  console.error(caught instanceof Error ? caught.message : caught);
  process.exit(1);
});
