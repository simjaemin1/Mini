#!/usr/bin/env node
// === scripts/t891-water-probe.js — 물 층 ½ 해상도(T891 · `T891_WATER_HALF`) 계측 자 · 러너 밖 ==========================
//
//   실클라 하나(Chromium · 이 상자 = SwiftShader 소프트웨어 GL)로 **물 있는 마을**에 서서 같은 판 안에서 끔 → 켬 → 끔(ABA) 으로 잰다.
//   켬/끔은 클라 손잡이 칸(`uiCfg.waterHalf`)을 페이지에서 바꾼다 — 같은 자리 · 같은 세계라야 그림을 견줄 수 있다.
//   서버 env → welcome 칸이 실제로 실리는지는 판 머리에서 한 번 본다(env 없음 · `--env 1` 이면 칸이 있어야 — ★T912 켬 기본 · `--env 0` 이면 없어야).
//   잰 것:
//     · 판당 물 층 ms — 물 GL 캔버스(`_wgl.cv`)를 2D 로 옮기는 `drawImage` 한 번의 시간(소프트웨어 GL 이 셰이더를 실제로 도는 자리 · T881 §1)
//       + 한 판(rAF 간격) ms · 판 수. 갈래마다 8초.
//     · 그림 — 물 시간을 멈춘 채(`_t19.freezeT` — 이미 있는 손잡이) 같은 자리 물 상자를 갈래마다 한 장씩 찍어
//       끔↔끔(잡음 바닥) · 끔↔켬 화소 차(평균 |Δ| · 차 > 24 인 화소 비율)를 낸다. 사람 눈 비교용 PNG 도 남긴다.
// 실행: node scripts/t891-water-probe.js [--env 0|1](없음 = 서버 기본 · ★T912 켬 기본) [--out /tmp/t891] [--village 어촌1]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENV = arg('--env', ''), OUT = arg('--out', '/tmp/t891'), WANT = arg('--village', '');   // ★[T912] 기본 = env 를 안 싣는다(서버 기본 = 켬) · 끔은 `--env 0`
const ENVL = ENV === '' ? '기본' : ENV;
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t891-c-${process.pid}.db`, ZDB = `/tmp/t891-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', shutdown);

(async () => {
  console.log(`\n=== T891 물 층 ½ 해상도 계측 — 서버 env T891_WATER_HALF=${ENV === '' ? '(없음 · 기본 켬)' : ENV} ===`);
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', ...(ENV !== '' ? { T891_WATER_HALF: ENV } : {}) });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  await sleep(4000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => { const s = document.getElementById('startZone'); return s ? s.options.length : 0; })) break; await sleep(500); }
  const enter = await page.$('#enter'); if (enter) await enter.click();
  const inw = await FixClock.waitInWorld(page, { timeoutMs: 180000 });
  if (!inw.ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(2000);
  const welcomeHalf = await page.evaluate(() => !!(uiCfg && uiCfg.waterHalf));
  console.log(`  · welcome uiCfg.waterHalf = ${welcomeHalf}(서버 env ${ENVL})`);
  // 물 있는 마을 — DB 에서 마을을 읽고 차례로 서 본다(물 상자가 가장 큰 곳)
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  const order = WANT ? rows.filter((r) => r.name === WANT) : rows.filter((r) => /어촌/.test(r.name)).concat(rows.filter((r) => !/어촌/.test(r.name)));
  let spot = null;
  for (const v of order.slice(0, 8)) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [v.cx * 32 + 16, v.cy * 32 + 16]);
    await sleep(5000);
    const w = await page.evaluate(() => ({ on: !!(window.__waterDbg && window.__waterDbg.on), gl: window.__waterDbg && window.__waterDbg.webgl, rect: (typeof _wfCache !== 'undefined' && _wfCache.rect) || null }));
    const area = w.rect ? w.rect[2] * w.rect[3] : 0;
    console.log(`  · ${v.name}: 물 층 ${w.on} · webgl ${w.gl} · 물 상자 ${w.rect ? w.rect.join(',') : '-'} (${area}px²)`);
    if (w.on && area > 200000) { spot = { v, w }; break; }
    if (w.on && (!spot || area > spot.w.rect[2] * spot.w.rect[3])) spot = { v, w };
  }
  if (!spot) { console.log('물이 보이는 마을이 없다'); process.exit(1); }
  if (spot.v !== order.find((o) => o === spot.v)) {}
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [spot.v.cx * 32 + 16, spot.v.cy * 32 + 16]);
  await sleep(5000);
  //   물가에 선다 — 안개(가 본 곳만 보인다)에 가린 물은 견줄 수 없다. 마을 중심에서 가장 가까운 물 칸을 찾아 그 앞 뭍 칸으로 옮긴다.
  const shore = await page.evaluate(() => {
    const a = window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs(); const z = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
    const c0 = [Math.floor(a.x / 32), Math.floor(a.y / 32)];
    for (let r = 1; r < 90; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const wx = (c0[0] + dx) * 32 + 16, wy = (c0[1] + dy) * 32 + 16;
      if (!isWaterAtAbs(wx, wy)) continue;
      // 물 칸에서 마을 쪽으로 세 칸 물러난 뭍 칸
      const L = Math.hypot(dx, dy); let lx = wx, ly = wy;
      for (let k = 1; k < 12; k++) { const tx = wx - Math.round(dx / L * k) * 32, ty = wy - Math.round(dy / L * k) * 32; if (!isWaterAtAbs(tx, ty)) { lx = tx - Math.round(dx / L * 2) * 32; ly = ty - Math.round(dy / L * 2) * 32; break; } }
      return { water: [wx, wy], land: [lx, ly], local: [lx - (z.worldOffsetX || 0), ly - (z.worldOffsetY || 0)], r };
    }
    return null;
  });
  console.log(`  · 물가: ${JSON.stringify(shore)}`);
  if (shore) { await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), shore.local); }
  await sleep(9000);
  // 판 계측 갈래 — 끔 · 켬 · 끔 각 8초
  await page.evaluate(() => {
    const D0 = CanvasRenderingContext2D.prototype.drawImage;
    window.__t891 = { w: [], f: [] };
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
      if (typeof _wgl !== 'undefined' && img === _wgl.cv) { const t0 = performance.now(); const r = D0.call(this, img, ...a); window.__t891.w.push(performance.now() - t0); return r; }
      return D0.call(this, img, ...a);
    };
    let last = performance.now();
    const tick = (t) => { window.__t891.f.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const arm = async (half, ms) => {
    await page.evaluate((h) => { uiCfg.waterHalf = h; }, half);
    await sleep(1500);   // 갈래가 바뀐 첫 판(GL 캔버스 크기 바꿈)을 버린다
    await page.evaluate(() => { window.__t891.w = []; window.__t891.f = []; });
    await sleep(ms);
    return page.evaluate(() => ({ w: window.__t891.w.slice(), f: window.__t891.f.slice() }));
  };
  const stat = (a) => { if (!a.length) return { n: 0 }; const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
  const A = await arm(false, 8000), B = await arm(true, 8000), C = await arm(false, 8000);
  const res = { env: ENVL, welcomeHalf, village: spot.v.name, rect: spot.w.rect,
    off1: { water: stat(A.w), frame: stat(A.f) }, on: { water: stat(B.w), frame: stat(B.f) }, off2: { water: stat(C.w), frame: stat(C.f) } };
  // 그림 — 물 시간을 멈추고 같은 자리 물 상자를 끔 · 끔 · 켬 · 끔으로 한 장씩
  const { PNG } = require('pngjs');
  await page.evaluate(() => { window.__terrain19.freezeT = 12.25; });
  const shot = async (half, tag) => {
    await page.evaluate((h) => { uiCfg.waterHalf = h; }, half);
    await sleep(1800);
    const r = await page.evaluate(() => (typeof _wfCache !== 'undefined' && _wfCache.rect) || null);
    const f = path.join(OUT, `water-${tag}.png`);
    await page.screenshot({ path: f });
    return { f, r };
  };
  const s0 = await shot(false, 'off-a'), s1 = await shot(false, 'off-b'), s2 = await shot(true, 'on'), s3 = await shot(false, 'off-c');
  const read = (f) => PNG.sync.read(fs.readFileSync(f));
  const box = s0.r || spot.w.rect;
  const diff = (fa, fb) => {
    const a = read(fa), b = read(fb); let sum = 0, big = 0, n = 0;
    const [x0, y0, w, h] = box;
    for (let y = Math.max(0, y0); y < Math.min(a.height, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x0 + w); x++) {
      const i = (y * a.width + x) * 4; const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
      sum += d; if (d > 24) big++; n++;
    }
    return { meanAbs: +(sum / Math.max(1, n)).toFixed(2), bigPct: +(100 * big / Math.max(1, n)).toFixed(2), px: n };
  };
  // 사람 눈 비교용 — 물 상자 가운데 400×240 을 끔 · 켬 나란히(원본 크기 · 확대 없음)
  const crop = (src, cx, cy, W, H) => { const o = new PNG({ width: W, height: H }); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.min(src.width - 1, Math.max(0, cx + x)), sy = Math.min(src.height - 1, Math.max(0, cy + y)); const i = (sy * src.width + sx) * 4, j = (y * W + x) * 4; o.data[j] = src.data[i]; o.data[j + 1] = src.data[i + 1]; o.data[j + 2] = src.data[i + 2]; o.data[j + 3] = 255; } return o; };
  const side = new PNG({ width: 820, height: 240 });
  const wsc = shore ? await page.evaluate(([x, y]) => { const s = window.__w2s(x, y); const cv = document.getElementById('canvas'); const r = cv.getBoundingClientRect(); return { x: r.left + s.px * (r.width / cv.width), y: r.top + s.py * (r.height / cv.height) }; }, shore.water) : null;
  const ccx = Math.max(0, Math.round(wsc ? wsc.x - 200 : box[0] + box[2] / 2 - 200)), ccy = Math.max(0, Math.round(wsc ? wsc.y - 120 : box[1] + box[3] / 2 - 120));
  const L = crop(read(s0.f), ccx, ccy, 400, 240), R = crop(read(s2.f), ccx, ccy, 400, 240);
  for (let y = 0; y < 240; y++) for (let x = 0; x < 820; x++) { const j = (y * 820 + x) * 4; const srcImg = x < 400 ? L : (x >= 420 ? R : null); if (!srcImg) { side.data[j + 3] = 255; continue; } const xx = x < 400 ? x : x - 420; const i = (y * 400 + xx) * 4; side.data[j] = srcImg.data[i]; side.data[j + 1] = srcImg.data[i + 1]; side.data[j + 2] = srcImg.data[i + 2]; side.data[j + 3] = 255; }
  fs.writeFileSync(path.join(OUT, 'water-side-off-on.png'), PNG.sync.write(side));
  const boxAll = box; const offAll = { offA_offB: diff(s0.f, s1.f), offA_on: diff(s0.f, s2.f), offA_offC: diff(s0.f, s3.f) };
  box.splice(0, 4, ccx, ccy, 400, 240);   // 물가 둘레 400×240 — 물이 실제로 보이는 곳
  res.pic = { wholeRect: offAll, crop: [ccx, ccy, 400, 240], cropDiff: { offA_offB: diff(s0.f, s1.f), offA_on: diff(s0.f, s2.f), offA_offC: diff(s0.f, s3.f) } };
  fs.writeFileSync(path.join(OUT, `t891-res-env${ENVL}.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); shutdown(); process.exit(0);
})().catch((e) => { console.log('탐침 실패:', e && e.stack); shutdown(); process.exit(1); });
