#!/usr/bin/env node
// === scripts/t902-gl-shots.js — 물 층 · 산 GL 이 그려지나(T891 · T898 손잡이 켬 · 끔) — 브라우저마다 스크린샷 · 러너 밖 계측 자 ==========
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 실클라 하나를 띄워
//     ① 어촌1 물가에 서서 `uiCfg.waterHalf` 끔 · 켬 — 물 층 상태(`__waterDbg` · GL 캔버스 크기 · 물 상자) + 스크린샷
//     ② 광산1 에 서서 `uiCfg.mtReadPx` 끔 · 켬 — 산 청크 캐시를 비우고(`__mt3gl(1)`) 다 구운 뒤 산 GL 상태 · 세그먼트 화소 해시 · 옮기기 계량 + 스크린샷
//   를 남긴다. 페이지 오류 · 콘솔 오류도 같이 적는다.
//   ★두 손잡이(T891 · T898)는 아직 각 가지에만 있다 — main 에서 돌리면 손잡이 칸을 바꿔도 그림이 그대로다(갈래가 없다).
//     실험 트리(main + 두 가지 병합 · 커밋 밖)에서 돌린다(보고 §3).
// 실행: [E2E_BROWSER=webkit] node scripts/t902-gl-shots.js [--out /tmp/t902/shots]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t902/shots'); fs.mkdirSync(OUT, { recursive: true });
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t902s-c-${process.pid}.db`, ZDB = `/tmp/t902s-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  console.log(`\n=== T902 물 층 · 산 GL 스크린샷 — 브라우저 ${BR} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`console.${m.type()}: ` + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(3000);
  const knobs = await page.evaluate(() => ({ waterHalf: 'waterHalf' in uiCfg ? uiCfg.waterHalf : '(칸 없음)', mtReadPx: 'mtReadPx' in uiCfg ? uiCfg.mtReadPx : '(칸 없음)',
    t891: typeof _t891Half === 'function', t898: typeof t898On === 'function', ua: navigator.userAgent }));
  console.log(`  · ${JSON.stringify(knobs)}`);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  const tp = (x, y) => page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
  const res = { browser: BR, knobs, water: [], mt: [] };
  // ① 물 — 어촌1 물가
  const fv = rows.find((r) => r.name === '어촌1');
  await tp(fv.cx * 32 + 16, fv.cy * 32 + 16); await sleep(8000);
  const shore = await page.evaluate(() => {
    const a = window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs(); const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
    const c0 = [Math.floor(a.x / 32), Math.floor(a.y / 32)];
    for (let r = 1; r < 90; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const wx = (c0[0] + dx) * 32 + 16, wy = (c0[1] + dy) * 32 + 16;
      if (!isWaterAtAbs(wx, wy)) continue;
      const L = Math.hypot(dx, dy); let lx = wx, ly = wy;
      for (let k = 1; k < 12; k++) { const tx = wx - Math.round(dx / L * k) * 32, ty = wy - Math.round(dy / L * k) * 32; if (!isWaterAtAbs(tx, ty)) { lx = tx - Math.round(dx / L * 2) * 32; ly = ty - Math.round(dy / L * 2) * 32; break; } }
      return [lx - (z2.worldOffsetX || 0), ly - (z2.worldOffsetY || 0)];
    }
    return null;
  });
  if (shore) { await tp(shore[0], shore[1]); }
  await sleep(10000);
  for (const on of [false, true]) {
    await page.evaluate((o) => { uiCfg.waterHalf = o; }, on); await sleep(4000);
    const st = await page.evaluate(() => ({ dbg: window.__waterDbg ? { on: window.__waterDbg.on, webgl: window.__waterDbg.webgl } : null,
      cv: (typeof _wgl !== 'undefined' && _wgl.cv) ? [_wgl.cv.width, _wgl.cv.height] : null, rect: (typeof _wfCache !== 'undefined' && _wfCache.rect) || null }));
    const f = path.join(OUT, `${BR}-water-${on ? 'on' : 'off'}.png`); await page.screenshot({ path: f });
    res.water.push({ on, st, shot: f }); console.log(`  · 물 ${on ? '켬' : '끔'}: ${JSON.stringify(st)}`);
  }
  // ② 산 — 광산1
  const mv = rows.find((r) => r.name === '광산1');
  await tp(mv.cx * 32 + 16, mv.cy * 32 + 16); await sleep(8000);
  const snap = () => page.evaluate(() => ({ n: _mt3BakeN, ms: _mt3BakeMs, jobs: _mt3Jobs.size, ok: _mgl.ok, cv: _mgl.cv ? [_mgl.cv.width, _mgl.cv.height] : null,
    x: (typeof _mt898 !== 'undefined') ? Object.assign({}, _mt898) : null }));
  const settle = async () => { const t0 = Date.now(); let last = await snap(), same = 0;
    while (Date.now() - t0 < 600000) { await sleep(1000); const s = await snap(); if (s.jobs === 0 && s.n === last.n && s.n > 0) same++; else same = 0; last = s; if (same >= 5) return true; } return false; };
  const hashAll = () => page.evaluate(() => { let h = 0x811c9dc5, segs = 0, chunks = 0;
    for (const [, sg] of _mt3Chunk) { chunks++; for (const s of sg || []) { segs++; const cv = s.img; if (!cv || !cv.width) continue;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } } }
    return { chunks, segs, h: h.toString(16) }; });
  await settle();
  for (const on of [false, true]) {
    const a = await snap();
    await page.evaluate((o) => { uiCfg.mtReadPx = o; window.__mt3gl(1); needsRedraw = true; }, on); await sleep(8000);
    const done = await settle(); const b = await snap(); const H = await hashAll();
    const f = path.join(OUT, `${BR}-mt-${on ? 'on' : 'off'}.png`); await page.screenshot({ path: f });
    const r = { on, done, gl: b.ok, cv: b.cv, chunks: b.n - a.n, perChunk: b.n > a.n ? +((b.ms - a.ms) / (b.n - a.n)).toFixed(0) : null,
      moveOn: b.x && a.x ? b.x.n - a.x.n : null, moveOff: b.x && a.x ? b.x.nOff - a.x.nOff : null, H, shot: f };
    res.mt.push(r); console.log(`  · 산 ${on ? '켬' : '끔'}: ${JSON.stringify(r)}`);
  }
  res.errs = errs;
  console.log(`  · 오류 ${errs.length}: ${JSON.stringify(errs.slice(0, 10))}`);
  fs.writeFileSync(path.join(OUT, `${BR}-res.json`), JSON.stringify(res, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
