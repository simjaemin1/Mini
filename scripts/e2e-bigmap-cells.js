#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 세 밤 분할(T238) — 가장 가벼운 묶음에 단다
// @pixel    ← 화면을 화소로 잰다(큰 지도 캔버스 `getImageData`)
// === scripts/e2e-bigmap-cells.js — 큰 지도가 **셀의 답**을 그리나 · 남의 점이 오나 (T565 · 브라우저) ==========
//
// ★무엇을 재나 — 재민이 본 그 자리(새벌 동쪽 끝 산맥 띠를 닛폰 고개 **한재**가 뚫은 곳)를 실제 클라로 연다.
//   ① 존 그림 — 붙은 존 둘(새벌·닛폰)의 `/bigmap.png` 가 클라에 온다(버전 · 크기)
//   ② 줌아웃(셀 1px 미만) — 한재 한가운데 화소 = 뭍(바탕색) · 고개 밖 산맥 띠 = 바위색 (종전 지도는 여기를 바위로 그렸다)
//   ③ 줌인(셀 4px · 1셀 = 1픽셀 조각) — 같은 두 자리가 **같은 답** · 화면 안 표본 셀 전부에서 줌아웃 종류 = 줌인 종류
//   ④ 실시간 점 — 두 번째 손님이 들어와 옮겨 서면 첫 손님 지도에 노란 점이 오고, 누르면 그 사람이 골라진다
//   ⑤ 클라 콘솔 오류 0
//
// ★자명 통과 금지 — ②③은 **다른 두 색**(바탕 · 바위)을 둘 다 봐야 초록이다(한 색만 보는 자는 빈 그림에도 초록이다).
//   ④는 점이 0 → 1 로 **바뀌는 것**을 본다(처음부터 1이면 남의 세계다).
//
// 실행: node scripts/e2e-bigmap-cells.js [--headed] [--shots=/tmp/e2e-bigmap-cells]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const BB = require(path.join(ROOT, 'server', 'bigmap-bake'));
const zc = require(path.join(ROOT, 'server', 'zone-config'));
const HEADED = process.argv.includes('--headed');
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '--shots=/tmp/e2e-bigmap-cells').slice(8);
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, HPORT = zc.ZONES.hanbando.port, NPORT = zc.ZONES.nippon.port;
const DBS = [`/tmp/ebc-c-${process.pid}.db`, `/tmp/ebc-h-${process.pid}.db`, `/tmp/ebc-n-${process.pid}.db`];
const rmDbs = () => { for (const f of DBS) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
rmDbs();

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } rmDbs(); });
function portFree(port) {
  return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
}
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name;
  procs.push(p); return p;
}
const zoneEnv = (id, port, db) => ({ PORT: String(port), ZONE_ID: id, DB_PATH: db, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
  E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0' });
const hexRgb = (h) => BB.hexRgb(h);
const near = (c, h, tol) => { const r = hexRgb(h); return Math.abs(c[0] - r[0]) <= (tol || 2) && Math.abs(c[1] - r[1]) <= (tol || 2) && Math.abs(c[2] - r[2]) <= (tol || 2); };

(async () => {
  console.log('\n=== 큰 지도가 셀의 답을 그리나 · 남의 점 (T565 · 브라우저) ===');
  const busy = [];
  for (const p of [CPORT, HPORT, NPORT]) if (!(await portFree(p))) busy.push(p);
  ok(busy.length === 0, '⓪ 포트가 비어 있다', busy.length ? `쥔 포트 ${busy.join(',')}` : `${CPORT}/${HPORT}/${NPORT}`);
  if (busy.length) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: DBS[0], PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const cUp = await FB.waitUp(cp, /central server up on/, { name: 'central' });
  const hp = boot('hanbando', 'zone.js', zoneEnv('hanbando', HPORT, DBS[1]));
  const np = boot('nippon', 'zone.js', zoneEnv('nippon', NPORT, DBS[2]));
  const [hUp, nUp] = await Promise.all([FB.waitUp(hp, /zone server up on/, { name: 'hanbando' }), FB.waitUp(np, /zone server up on/, { name: 'nippon' })]);
  ok(cUp.ok && hUp.ok && nUp.ok, 'central · 새벌 · 닛폰 기동', [cUp, hUp, nUp].map((u) => u.why).join(' · '));
  if (!cUp.ok || !hUp.ok || !nUp.ok) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }

  // 참고할 자리 — 존이 구운 그림에서 고른다(자리 고르기만 · 판정은 아래 화소)
  let mapH = null;
  for (let i = 0; i < 120 && !mapH; i++) { const r = await fetch(`http://localhost:${HPORT}/bigmap.png`); if (r.status === 200) mapH = PNG.sync.read(Buffer.from(await r.arrayBuffer())); else await sleep(1000); }
  ok(!!mapH, '새벌 존 그림이 구워졌다(자리 고르기용)');
  const H = zc.ZONES.hanbando, pal = BB.palette(H.groundColor);
  const clsAt = (bx, by) => { const i = (by * mapH.width + bx) * 4; const c = [mapH.data[i], mapH.data[i + 1], mapH.data[i + 2]]; return pal.findIndex((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]); };
  const HJ = { x: 69800, y: 60000 };   // 한재(닛폰 고개 · T408 접합) — 새벌 로컬
  const hjB = { bx: Math.floor(HJ.x / 128), by: Math.floor(HJ.y / 128) };
  // 고개 밖 바위 — 한재에서 위로 올라가며 처음 만나는 바위 줄에서 두 칸 더(띠 안쪽)
  let rockB = null;
  for (let d = 1; d < 80 && !rockB; d++) if (clsAt(hjB.bx, hjB.by - d) === BB.K.rock && clsAt(hjB.bx, hjB.by - d - 2) === BB.K.rock) rockB = { bx: hjB.bx, by: hjB.by - d - 2 };
  ok(clsAt(hjB.bx, hjB.by) === BB.K.plain && !!rockB, '전제: 한재 한가운데 = 뭍 · 위쪽 띠 = 바위(존 그림에서)', rockB ? `바위 블록 (${rockB.bx},${rockB.by})` : '못 찾음');
  const abs = (lx, ly) => ({ x: H.worldOffsetX + lx, y: H.worldOffsetY + ly });
  const HJa = abs(HJ.x + 8, HJ.y + 16), RKa = abs(rockB.bx * 128 + 80, rockB.by * 128 + 80);   // 셀 가운데(4bx+2 셀 = 존 그림의 표본 셀)

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  const errs = [];
  A.on('pageerror', (e) => errs.push('A ' + String(e.message).slice(0, 160)));
  B.on('pageerror', (e) => errs.push('B ' + String(e.message).slice(0, 160)));
  const enter = async (page) => {
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 40 && !(await page.$('#enter')); i++) await sleep(250);
    const e = await page.$('#enter'); if (e) await e.click();
    // ★들어간 증인 = 서버가 준 내 번호와 0 아닌 자리(예측 자리의 초깃값 (0,0) 은 들어간 게 아니다)
    for (let i = 0; i < 120 && !(await page.evaluate(() => { const m = window.__getMyAbs && window.__getMyAbs(); return !!(m && (m.x || m.y) && typeof myPid !== 'undefined' && myPid); })); i++) await sleep(250);
    return page.evaluate(() => window.__getMyAbs());
  };
  const a0 = await enter(A);
  ok(!!a0, '손님 A 입장', a0 ? `(${Math.round(a0.x)},${Math.round(a0.y)})` : '');
  // ★[T98 §4-c] 화소를 재기 전에 하늘과 바람을 끈다(큰 지도는 둘 다 안 그리지만 `@pixel` 규약 그대로)
  await A.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); if (window.__terrain19) window.__terrain19.windOff = true; }).catch(() => {});
  await A.keyboard.press('m');
  for (let i = 0; i < 40 && !(await A.evaluate(() => window.__bigMapDbg && window.__bigMapDbg().visible)); i++) await sleep(100);
  const px = async (wx, wy) => A.evaluate(({ wx, wy }) => {
    const d = window.__bigMapDbg(); const c = document.getElementById('bigMapCanvas');
    const x = Math.round(wx * d.zoom + d.panX), y = Math.round(wy * d.zoom + d.panY);
    const v = c.getContext('2d').getImageData(x, y, 1, 1).data; return [v[0], v[1], v[2]];
  }, { wx, wy });
  const view = async (z, w) => { await A.evaluate(({ z, x, y }) => window.__bigMapView(z, x, y), { z, x: w.x, y: w.y }); await sleep(400); };

  // ── ① 존 그림 ──
  console.log('\n① 존 그림이 클라에 온다');
  await view(0.02, HJa);
  let dz = null;
  for (let i = 0; i < 80; i++) { dz = await A.evaluate(() => window.__bigMapDbg()); if (dz.zones.hanbando && dz.zones.hanbando.st === 'ok' && dz.zones.nippon && dz.zones.nippon.st === 'ok') break; await sleep(250); }
  ok(dz.zones.hanbando && dz.zones.hanbando.st === 'ok' && dz.zones.hanbando.w === mapH.width && !!dz.zones.hanbando.ver, '새벌 그림 — 받았다 · 크기 = 존이 구운 그림', JSON.stringify(dz.zones.hanbando));
  ok(dz.zones.nippon && dz.zones.nippon.st === 'ok', '닛폰 그림 — 받았다(이웃 존 · 그 존에게 직접 묻는다)', JSON.stringify(dz.zones.nippon));

  // ── ② 줌아웃 ──
  console.log('\n② 줌아웃(배율 0.02 · 셀 0.64px) — 한재 = 뭍 · 띠 = 바위');
  await view(0.02, HJa);
  await A.screenshot({ path: path.join(SHOTS, '02-zoomout.png'), clip: await A.evaluate(() => { const r = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  const oP = await px(HJa.x, HJa.y), oR = await px(RKa.x, RKa.y);
  ok(near(oP, H.groundColor) && near(oR, BB.COLORS.rock), '★한재 한가운데 = 바탕(뭍) · 띠 = 바위색(둘 다 봐야 초록)', `한재 rgb(${oP}) · 띠 rgb(${oR})`);

  // ── ③ 줌인 ──
  console.log('\n③ 줌인(배율 0.125 · 셀 4px · 1셀 = 1픽셀 조각) — 같은 답');
  await view(0.125, HJa);
  for (let i = 0; i < 60; i++) { const d = await A.evaluate(() => window.__bigMapDbg()); if (d.tilesOk >= 2 && d.tiles === d.tilesOk) break; await sleep(250); }
  await sleep(300);
  const dIn = await A.evaluate(() => window.__bigMapDbg());
  await A.screenshot({ path: path.join(SHOTS, '03-zoomin.png'), clip: await A.evaluate(() => { const r = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  ok(dIn.tilesOk >= 2, '조각이 왔다', `${dIn.tilesOk}/${dIn.tiles}장`);
  const iP = await px(HJa.x, HJa.y), iR = await px(RKa.x, RKa.y);
  ok(near(iP, H.groundColor) && near(iR, BB.COLORS.rock), '★★줌인도 한재 = 뭍 · 띠 = 바위(줌아웃과 같은 답)', `한재 rgb(${iP}) · 띠 rgb(${iR})`);
  // 화면 안 표본 셀 전부 — 줌인 화소의 종류 = 존 그림 픽셀의 종류(가장자리 1px · 셀 경계선 · 강 중심선은 줌인에 없다)
  const cmp = await A.evaluate(({ ox, oy, pal }) => {
    const d = window.__bigMapDbg(); const c = document.getElementById('bigMapCanvas'); const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height).data;
    const out = [];
    const cxA = Math.floor(((-d.panX) / d.zoom - ox) / 32), cxB = Math.floor(((c.width - d.panX) / d.zoom - ox) / 32);
    const cyA = Math.floor(((-d.panY) / d.zoom - oy) / 32), cyB = Math.floor(((c.height - d.panY) / d.zoom - oy) / 32);
    for (let cy = cyA - (((cyA % 4) + 4) % 4) + 2; cy <= cyB; cy += 4) for (let cx = cxA - (((cxA % 4) + 4) % 4) + 2; cx <= cxB; cx += 4) {   // 표본 셀(4b+2)만
      const px0 = Math.round((ox + cx * 32 + 16) * d.zoom + d.panX), py0 = Math.round((oy + cy * 32 + 16) * d.zoom + d.panY);   // 셀 가운데 화소
      if (px0 < 2 || py0 < 2 || px0 >= c.width - 2 || py0 >= c.height - 26) continue;   // 가장자리 · 범례 줄 밖
      const i = (py0 * c.width + px0) * 4, col = [img[i], img[i + 1], img[i + 2]];
      out.push([cx, cy, pal.findIndex((p) => Math.abs(p[0] - col[0]) <= 2 && Math.abs(p[1] - col[1]) <= 2 && Math.abs(p[2] - col[2]) <= 2)]);
    }
    return out;
  }, { ox: H.worldOffsetX, oy: H.worldOffsetY, pal });
  const hW = Math.ceil(H.zoneWidth / 32), hH = Math.ceil(H.zoneHeight / 32);
  let sameN = 0, sameOk = 0; const kinds = new Set();
  for (const [cx, cy, k] of cmp) { if (cx < 0 || cy < 0 || cx >= hW || cy >= hH) continue; sameN++; kinds.add(k); if (k === clsAt(Math.floor(cx / 4), Math.floor(cy / 4))) sameOk++; }
  ok(sameN > 500 && sameOk === sameN && kinds.has(BB.K.rock) && kinds.has(BB.K.plain), '★★화면 안 표본 셀 전부 — 줌인 화소 종류 = 존 그림 픽셀 종류', `${sameOk}/${sameN} · 종류 ${[...kinds].map((k) => BB.CLS[k] || k).join(',')}`);

  // ── ④ 실시간 점 ──
  console.log('\n④ 실시간 점 — 남이 들어와 옮겨 서면 노란 점 · 누르면 그 사람');
  await A.evaluate(() => { const b = document.getElementById('bigMapMeBtn'); if (b) b.click(); });
  await sleep(1500);
  const p0 = (await A.evaluate(() => window.__bigMapDbg())).pts;
  const b0 = await enter(B);
  ok(!!b0, '손님 B 입장', b0 ? `(${Math.round(b0.x)},${Math.round(b0.y)})` : '');
  const bz = await B.evaluate(() => (window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}));
  // B 를 A 곁에서 떼어 놓는다(같은 자리면 A 의 빨간 점이 노란 점을 덮는다) — 막힌 칸이면 서버가 거절하니 방향을 바꿔 본다
  let b1 = b0;
  for (const [ox, oy] of [[320, 0], [-320, 0], [0, 320], [0, -320], [480, 160]]) {
    const bLocal = { x: Math.round(b0.x - bz.worldOffsetX + ox), y: Math.round(b0.y - bz.worldOffsetY + oy) };
    await B.evaluate((p) => window.__sendPrimary({ type: 'teleport_debug', x: p.x, y: p.y }), bLocal);
    for (let i = 0; i < 15; i++) { b1 = await B.evaluate(() => window.__getMyAbs()); if (Math.hypot(b1.x - b0.x, b1.y - b0.y) > 200) break; await sleep(200); }
    if (Math.hypot(b1.x - b0.x, b1.y - b0.y) > 200) break;
  }
  ok(Math.hypot(b1.x - b0.x, b1.y - b0.y) > 200, 'B 가 A 곁을 떠났다(텔레포트 디버그)', `(${Math.round(b1.x)},${Math.round(b1.y)})`);
  let dl = null;
  for (let i = 0; i < 40; i++) { dl = await A.evaluate(() => window.__bigMapDbg()); if (dl.pts >= 1) break; await sleep(250); }
  ok(p0 === 0 && dl.pts === 1, '★점이 0 → 1(B 가 들어왔다 · A 자신은 점이 아니다)', `전 ${p0} · 후 ${dl.pts} · live ${JSON.stringify(dl.live)}`);
  const bPid = await B.evaluate(() => (typeof myPid !== 'undefined' ? myPid : null));
  const bScreen = await A.evaluate((w) => { const d = window.__bigMapDbg(); const c = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: c.x + w.x * d.zoom + d.panX, y: c.y + w.y * d.zoom + d.panY }; }, b1);
  const aScreen = await A.evaluate(() => { const d = window.__bigMapDbg(); const m = window.__getMyAbs(); return { x: m.x * d.zoom + d.panX, y: m.y * d.zoom + d.panY }; });
  await sleep(1200);   // 점이 다음 답으로 B 의 새 자리에 서게
  const bScreen2 = await A.evaluate(() => { const d = window.__bigMapDbg(); return d; });
  void bScreen2;
  await A.mouse.click(bScreen.x, bScreen.y);
  await sleep(400);
  const ds = await A.evaluate(() => window.__bigMapDbg());
  const topEl = await A.evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? (e.id || e.tagName) : null; }, bScreen);
  await A.screenshot({ path: path.join(SHOTS, '04-live.png'), clip: await A.evaluate(() => { const r = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  ok(ds.sel && ds.sel.pid === bPid && ds.sel.zid === 'hanbando', '★B 의 점을 누르면 B 가 골라진다(이름 표)', `sel ${JSON.stringify(ds.sel)} · B ${bPid} · 누른 자리의 맨 위 ${topEl} · 점 화면 (${Math.round(bScreen.x)},${Math.round(bScreen.y)}) · 나 (${Math.round(aScreen.x)},${Math.round(aScreen.y)})`);
  const yel = await A.evaluate((w) => { const d = window.__bigMapDbg(); const c = document.getElementById('bigMapCanvas'); const x = Math.round(w.x * d.zoom + d.panX), y = Math.round(w.y * d.zoom + d.panY);
    const v = c.getContext('2d').getImageData(x - 1, y - 1, 3, 3).data; let n = 0; for (let i = 0; i < v.length; i += 4) if (v[i] > 230 && v[i + 1] > 180 && v[i + 2] < 120) n++; return n; }, b1);
  ok(yel >= 3, 'B 자리에 노란 점 화소', `${yel}/9`);
  // 빈 곳을 누르면 풀린다 · B 가 A 와 같은 자리에 서도(빨간 점 밑) 누르면 B 가 골라진다(점은 가려도 사람은 거기 있다)
  const cRect = await A.evaluate(() => { const r = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await A.mouse.click(cRect.x + 40, cRect.y + 40);
  await sleep(300);
  const dUn = await A.evaluate(() => window.__bigMapDbg());
  ok(dUn.sel === null, '빈 곳을 누르면 이름 표가 풀린다', JSON.stringify(dUn.sel));
  const aNow = await A.evaluate(() => window.__getMyAbs());
  const aZ = await A.evaluate(() => (window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}));
  await B.evaluate((p) => window.__sendPrimary({ type: 'teleport_debug', x: p.x, y: p.y }), { x: Math.round(aNow.x - aZ.worldOffsetX), y: Math.round(aNow.y - aZ.worldOffsetY) });
  await sleep(2400);   // 다음 답(1초)에 B 가 A 자리로 온다
  const aSc = await A.evaluate(() => { const d = window.__bigMapDbg(); const m = window.__getMyAbs(); const c = document.getElementById('bigMapCanvas').getBoundingClientRect(); return { x: c.x + m.x * d.zoom + d.panX, y: c.y + m.y * d.zoom + d.panY }; });
  await A.mouse.click(aSc.x, aSc.y);
  await sleep(400);
  const dOv = await A.evaluate(() => window.__bigMapDbg());
  ok(dOv.sel && dOv.sel.pid === bPid, '★B 가 내 자리에 겹쳐 서도(빨간 점 밑) 누르면 B 가 골라진다', JSON.stringify(dOv.sel));

  ok(errs.length === 0, '⑤ 클라 콘솔 오류 0건', errs.slice(0, 2).join(' | ') || '없음');
  console.log(`  스크린샷 → ${SHOTS}`);
  await browser.close();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e && e.stack || e); process.exit(1); });
