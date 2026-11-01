#!/usr/bin/env node
// === scripts/t1052-water-eq.js — 물 셰이더 마른 자리 먼저 거르기(T1052 ②) 같은 화소 증명 · 셰이더 시간 · 러너 밖 계측 자 ======================
//
//   T1045 · T1052 자와 같은 입장으로 들어가, 들어간 자리를 가운데로 카메라 자리 --spots 곳(가로 · 세로 ±--step px 격자)에서
//   물 층 그리기(`_drawWaterLayer`)를 **같은 시각(tSec 고정) · 같은 화면 크기**로 끔(`uiCfg.waterCheap` 없음) · 켬(true) 두 번 불러,
//   그때마다 같은 무늬를 깐 2D 캔버스(1100×720)에 물 층을 그려 통째로 읽어 FNV 해시 · 다른 화소 수를 견준다(흐름 텍스처 미결이 없을 때까지 먼저 굽는다 ·
//   켬이 그리기를 건너뛴 판도 2D 결과로 견준다). 물 화소 몫은 끔 판 GL 캔버스 readPixels 로 센다.
//   그리고 같은 자리에서 끔 · 켬 각 --rep 번 `drawArrays` + `gl.finish()` 를 재서 셰이더 시간을 견준다. 자만 부른다 — 화면 그리기 판은 그대로 돈다.
// 실행: [E2E_BROWSER=webkit] node scripts/t1052-water-eq.js [--spots 9] [--step 600] [--rep 5] [--n 1] [--out /tmp/t1052] [--tag 이름]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', '1'), SPOTS = +arg('--spots', '9'), STEP = +arg('--step', '600'), REP = +arg('--rep', '5');
const OUT = arg('--out', '/tmp/t1052'); fs.mkdirSync(OUT, { recursive: true });
const BRW = require('./e2e-browser');
const BR = BRW.which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZIDS = ['hanbando', 'nippon'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });
const portFree = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });

const EQ = ([spots, step, rep]) => {
  if (typeof _wgl === 'undefined' || !_waterInit()) return { err: 'GL 없음' };
  const gl = _wgl.gl, W = 1100, H = 720, tS = 123.456;
  const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H; const sc = scratch.getContext('2d');
  const c0 = _lastCamIso || { x: 0, y: 0 };
  const side = Math.round(Math.sqrt(spots)), half = (side - 1) / 2;
  const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  const was = uiCfg.waterCheap;
  const draw = (cheap, cx, cy) => { if (cheap) uiCfg.waterCheap = true; else delete uiCfg.waterCheap; return _drawWaterLayer(sc, W, H, cx, cy, tS); };
  const out = [];
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    const cx = c0.x + (i - half) * step, cy = c0.y + (j - half) * step;
    for (let k = 0; k < 400; k++) { draw(false, cx, cy); if (!_wfCache.pending) break; }   // 흐름 텍스처 미결 없이
    const res = {};
    for (const m of [false, true]) {
      // ★2D 결과로 견준다(건너뛴 판은 GL 캔버스가 안 바뀌므로 readPixels 는 증거가 못 된다) — 판마다 같은 무늬를 깐 2D 캔버스 위에 물 층을 그리고 통째로 읽는다
      const g0 = sc.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#3a5'); g0.addColorStop(1, '#a53'); sc.globalCompositeOperation = 'copy'; sc.fillStyle = g0; sc.fillRect(0, 0, W, H); sc.globalCompositeOperation = 'source-over';
      const ok = draw(m, cx, cy); gl.finish();
      const px = sc.getImageData(0, 0, W, H).data;
      res[m ? 'on' : 'off'] = { ok, px, h: fnv(px) };
    }
    let diff = 0, wet = 0; const a = res.off.px, b = res.on.px;
    { const gpx = new Uint8Array(_wgl.cv.width * _wgl.cv.height * 4); draw(false, cx, cy); gl.finish(); gl.readPixels(0, 0, _wgl.cv.width, _wgl.cv.height, gl.RGBA, gl.UNSIGNED_BYTE, gpx); for (let q = 3; q < gpx.length; q += 4) if (gpx[q]) wet++; wet = wet * 4 * (a.length / 4) / gpx.length; }   // 물 화소 몫(GL · 끔 판)
    for (let q = 0; q < a.length; q += 4) { if (a[q] !== b[q] || a[q + 1] !== b[q + 1] || a[q + 2] !== b[q + 2] || a[q + 3] !== b[q + 3]) diff++; }
    const tm = {};
    for (const m of [false, true]) { let t = 0; for (let r = 0; r < rep; r++) { const t0 = performance.now(); draw(m, cx, cy); gl.finish(); t += performance.now() - t0; } tm[m ? 'on' : 'off'] = +(t / rep).toFixed(2); }
    out.push({ cam: [Math.round(cx), Math.round(cy)], drawn: res.off.ok, hOff: res.off.h, hOn: res.on.h, diff, wetPct: +(100 * wet / (a.length / 4)).toFixed(1), msOff: tm.off, msOn: tm.on, cv: [_wgl.cv.width, _wgl.cv.height], rect: _wfCache.rect });
  }
  if (was === true) uiCfg.waterCheap = true; else delete uiCfg.waterCheap;
  return { out, half: _t891Half(), ua: navigator.userAgent.slice(0, 50) };
};

(async () => {
  console.log(`\n=== T1052 물 셰이더 같은 화소 · 시간 — ${BR} · 자리 ${SPOTS} · 걸음 ${STEP}px · ${REP}번 · ${TAG} ===`);
  const all = [];
  for (let i = 0; i < N; i++) {
    for (const port of [CPORT].concat(ZIDS.map((z) => ZONES[z].port))) if (!await portFree(port)) { console.log(`포트 ${port} 가 비어 있지 않다`); process.exit(1); }
    const DDIR = `/tmp/t1052e-${process.pid}-${i}`; fs.mkdirSync(DDIR, { recursive: true });
    const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZIDS.join(',') });
    const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
    const common = { CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' };
    const ups = {};
    for (const z of ZIDS) { const p = boot('zone.js', Object.assign({ PORT: String(ZONES[z].port), ZONE_ID: z, DB_PATH: `${DDIR}/w-${z}.db`, ENABLE_VILLAGES: z === 'hanbando' ? '1' : '0' }, common)); ups[z] = FB.waitUp(p, /zone server up on/, { name: z, capMs: 600000 }); }
    const zu = {}; for (const z of ZIDS) zu[z] = await ups[z];
    if (!cu.ok || !ZIDS.every((z) => zu[z].ok)) { console.log('기동 실패'); process.exit(1); }
    const browser = await BRW.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    for (let k = 0; k < 120; k++) { const okz = await page.evaluate(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) { s.value = 'hanbando'; return true; } return false; }); if (okz) break; await sleep(500); }
    await sleep(3000);
    const en = await page.$('#enter'); if (en) await en.click();
    await FixClock.waitInWorld(page, { timeoutMs: 240000 });
    await sleep(8000);
    const r = await page.evaluate(EQ, [SPOTS, STEP, REP]);
    if (r.err) { console.log(r.err); process.exit(1); }
    console.log(`--- ${i + 1} --- ½ 해상도 ${r.half} · ${r.ua}`);
    for (const o of r.out) console.log(`   카메라 ${o.cam.join(',')} · 그림 ${o.drawn} · 물 ${o.wetPct}% · 해시 끔 ${o.hOff} 켬 ${o.hOn} · 다른 화소 ${o.diff} · 셰이더 끔 ${o.msOff}ms 켬 ${o.msOn}ms · GL ${o.cv.join('×')}`);
    all.push(r);
    fs.writeFileSync(path.join(OUT, `t1052-eq-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs: all }, null, 1));
    await browser.close(); killAll(); await sleep(2000);
  }
  const rows = all.flatMap((r) => r.out);
  const sum = (k) => rows.reduce((a, o) => a + o[k], 0);
  console.log(`\n== ${TAG}: 자리 ${rows.length} · 다른 화소 합 ${sum('diff')} · 해시 같음 ${rows.filter((o) => o.hOff === o.hOn).length}/${rows.length} · 셰이더 합 끔 ${sum('msOff').toFixed(1)} → 켬 ${sum('msOn').toFixed(1)}ms`);
  process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); killAll(); process.exit(1); });
