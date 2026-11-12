// === scripts/browser-driver.js — 두 브라우저 손잡이 · 사진 대비 잼(T1115 에서 떼어 냄 · T1124 가 같이 쓴다) =====================
//
// ⚠계측 · e2e 도구다(제품 무변). 같은 쪽 안 글자(`ev(src)` — 식 하나)를 크롬과 WebKit 에 그대로 넣는다.
//   · chromium — Playwright(이 상자 정본)
//   · webkit   — Playwright WebKit 이 있으면 그것, 없으면 **WebKitGTK MiniBrowser + WebKitWebDriver**(W3C WebDriver · Safari 와 같은 WebKit 엔진 · GTK 포트)
//     WebKitGTK 길: `apt-get install webkit2gtk-driver xvfb` — `Xvfb` · `WebKitWebDriver` 를 여기서 띄운다(부르는 쪽 `boot` 로 · 끝날 때 같이 죽는다).
//   손잡이: `page(W, H)` → `{ goto(url) · ev(src) · shot(file) · key(k, shift) · close() }`
//   사진 대비: `contrastOf(png, { plates:[[x,y,w,h]], texts:[[x,y,w,h]], dpr })` — 판 가운데 띠 밝기 가운데값 ↔ 글자 자리 밝기 99.5% 끝 · WCAG 비
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 두 브라우저 손잡이 — evaluate · screenshot · viewport · goto · key ────────────────────────────
async function playwrightDriver(kind) {
  const PW = require('playwright');
  const browser = await PW[kind].launch();
  return {
    name: kind, version: browser.version(),
    async page(W, H) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      return {
        goto: (u) => page.goto(u, { waitUntil: 'domcontentloaded' }),
        ev: (src) => page.evaluate(src),
        shot: (file) => page.screenshot({ path: file }),
        key: (k, shift) => page.keyboard.press(shift ? `Shift+${k}` : k),
        close: () => page.close(),
      };
    },
    close: () => browser.close(),
  };
}
async function webkitGtkDriver(boot) {
  const which = (b) => spawnSync('sh', ['-c', `command -v ${b}`]).stdout.toString().trim();
  if (!which('WebKitWebDriver') || !which('Xvfb')) throw new Error('WebKitGTK 길이 없다 — apt-get install webkit2gtk-driver xvfb');
  const MB = ['/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', '/usr/lib/x86_64-linux-gnu/webkitgtk-6.0/MiniBrowser'].find((p) => fs.existsSync(p));
  const DISP = ':' + (90 + (process.pid % 9)), WPORT = require('./lib-port').port(4444);   // lib-port: 포트 아님(DISP = X 화면 번호 · WPORT 는 lib-port)
  boot('Xvfb', [DISP, '-screen', '0', '1700x1300x24']);
  await sleep(800);
  boot('WebKitWebDriver', [`--port=${WPORT}`], { DISPLAY: DISP });
  await sleep(800);
  const B = `http://127.0.0.1:${WPORT}`;
  const j = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const o = await r.json(); if (o.value && o.value.error) throw new Error(`${p}: ${o.value.error} ${o.value.message}`); return o.value; };
  let ver = null;
  return {
    name: 'webkit', get version() { return ver; },
    async page(W, H) {
      const s = await j('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'MiniBrowser', 'webkitgtk:browserOptions': { binary: MB, args: ['--automation'] } } } });
      ver = `WebKitGTK ${s.capabilities.browserVersion}`;
      const id = s.sessionId;
      // 창 크기 → 보이는 칸이 W×H 가 되게(창 장식 몫을 한 번 재서 더한다)
      await j('POST', `/session/${id}/window/rect`, { width: W, height: H });
      const inner = await j('POST', `/session/${id}/execute/sync`, { script: 'return [innerWidth, innerHeight]', args: [] });
      await j('POST', `/session/${id}/window/rect`, { width: W + (W - inner[0]), height: H + (H - inner[1]) });
      return {
        goto: (u) => j('POST', `/session/${id}/url`, { url: u }),
        ev: (src) => j('POST', `/session/${id}/execute/sync`, { script: `return (${src});`, args: [] }),
        shot: async (file) => { const b64 = await j('GET', `/session/${id}/screenshot`); fs.writeFileSync(file, Buffer.from(b64, 'base64')); },
        key: async (k, shift) => {   // W3C 동작(키) — Shift 는 \uE008
          const seq = []; if (shift) seq.push({ type: 'keyDown', value: '\uE008' });
          seq.push({ type: 'keyDown', value: k }, { type: 'keyUp', value: k }); if (shift) seq.push({ type: 'keyUp', value: '\uE008' });
          await j('POST', `/session/${id}/actions`, { actions: [{ type: 'key', id: 'kb', actions: seq }] }); await j('DELETE', `/session/${id}/actions`);
        },
        close: () => j('DELETE', `/session/${id}`),
      };
    },
    close: async () => {},
  };
}

// 사진에서 대비 — PNG 디코드(PIL 없이 · node zlib) → 판 가운데 띠 밝기 · 글자 캔버스 자리 99.5% 밝기
function pngGray(file) {
  const zlib = require('zlib'); const b = fs.readFileSync(file);
  let o = 8, W = 0, H = 0, ct = 0, idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len); if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); ct = d[9]; } else if (t === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 6 ? 4 : 3, st = W * bpp, px = Buffer.alloc(W * H * bpp);
  for (let y = 0; y < H; y++) { const f = raw[y * (st + 1)], src = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), dst = px.subarray(y * st, (y + 1) * st), up = y ? px.subarray((y - 1) * st, y * st) : null;
    for (let i = 0; i < st; i++) { const a = i >= bpp ? dst[i - bpp] : 0, u = up ? up[i] : 0, c = (up && i >= bpp) ? up[i - bpp] : 0; let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); } dst[i] = v & 255; } }
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return { W, H, L: (x, y) => { const i = (y * W + x) * bpp; return 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]); } };
}
function contrastOf(file, rects) {
  const g = pngGray(file), s = rects.dpr || 1;
  const plateL = [], textL = [];
  for (const [x, y, w, h] of rects.plates) { const cy = Math.round((y + h / 2) * s); for (let i = Math.round((x + w * 0.45) * s); i < Math.round((x + w * 0.55) * s); i++) if (i >= 0 && i < g.W && cy >= 0 && cy < g.H) plateL.push(g.L(i, cy)); }
  for (const [x, y, w, h] of rects.texts) for (let yy = Math.round(y * s); yy < Math.round((y + h) * s); yy++) for (let xx = Math.round(x * s); xx < Math.round((x + w) * s); xx++) if (xx >= 0 && xx < g.W && yy >= 0 && yy < g.H) textL.push(g.L(xx, yy));
  if (!plateL.length || !textL.length) return null;
  plateL.sort((a, b) => a - b); textL.sort((a, b) => a - b);
  const pL = plateL[plateL.length >> 1], tL = textL[Math.floor(textL.length * 0.995)];
  return +((tL + 0.05) / (pL + 0.05)).toFixed(2);
}

// 부르는 쪽이 고른 브라우저 — webkit 은 Playwright 판이 있으면 그것, 없으면 WebKitGTK
async function open(kind, boot) {
  if (kind !== 'webkit') return playwrightDriver('chromium');
  try { const d = await playwrightDriver('webkit'); return d; } catch (e) { return webkitGtkDriver(boot); }
}
// ★[T1124] 판 밝기를 **글자 자리 · 모따기 테(12px)를 뺀 판 칸 전체**의 가운데값으로 — 한 줄짜리 판(알림)은 가운데 띠가 글자 위에 걸린다
function contrastFree(file, rects) {
  const g = pngGray(file), s = rects.dpr || 1, M = 12, pad = 2;
  const inText = (x, y) => rects.texts.some(([tx, ty, tw, th]) => x >= tx - pad && x <= tx + tw + pad && y >= ty - pad && y <= ty + th + pad);
  const plateL = [], textL = [];
  for (const [x, y, w, h] of rects.plates) for (let yy = y + M; yy < y + h - M; yy += 3) for (let xx = x + M; xx < x + w - M; xx += 3) {
    if (inText(xx, yy)) continue; const X = Math.round(xx * s), Y = Math.round(yy * s); if (X >= 0 && X < g.W && Y >= 0 && Y < g.H) plateL.push(g.L(X, Y));
  }
  for (const [x, y, w, h] of rects.texts) for (let yy = Math.round(y * s); yy < Math.round((y + h) * s); yy++) for (let xx = Math.round(x * s); xx < Math.round((x + w) * s); xx++) if (xx >= 0 && xx < g.W && yy >= 0 && yy < g.H) textL.push(g.L(xx, yy));
  if (!plateL.length || !textL.length) return null;
  plateL.sort((a, b) => a - b); textL.sort((a, b) => a - b);
  const pL = plateL[plateL.length >> 1], tL = textL[Math.floor(textL.length * 0.995)];
  return +((tL + 0.05) / (pL + 0.05)).toFixed(2);
}
module.exports = { open, playwrightDriver, webkitGtkDriver, pngGray, contrastOf, contrastFree };
