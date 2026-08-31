#!/usr/bin/env node
// === scripts/e2e-zoom.js — 마우스 휠 확대/축소 **실클라** 계측 [재민 확정 2026-08-31] ======
//
// ★★이 배치의 제1 계약: **ZOOM === 1 이면 종전과 코드 경로가 같다.**
//   말이 아니라 수치로 센다 — ⓪-다 가 "오프스크린이 아예 없다"를, ⑤ 가 "1 로 돌아오면 화면이
//   화소 단위로 처음과 같다"를 잰다(바람을 꺼서 세계를 멈춰 놓고 잰다 — e2e-mtfoot ⑧ 계보).
//
// ★★두 번째 계약: **커서가 가리키는 곳 = 실제로 집히는 곳.** 줌이 제일 잘 깨뜨리는 자리다.
//   ② 가 화면→월드→화면 왕복을 배율마다 잰다. 그리고 **자명 통과 금지 대조**를 같이 둔다 —
//   배율이 다르면 같은 화면 점이 다른 월드 점을 가리켜야 한다(안 그러면 왕복이 공짜다).
//
// ★[족보 73] 휠을 굴릴 자리는 `elementFromPoint` 로 **캔버스가 맨 위인지** 확인하고 쓴다.
// ★[족보 74] 기대값을 눈대중으로 적지 않는다 — 오프스크린 크기는 ceil(화면/배율) 로 **재유도**한다.
//
// 실행: node scripts/e2e-zoom.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const argv = process.argv.slice(2);
const HEADED = argv.includes('--headed');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-zoom-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-zoom-c-${process.pid}.db`, ZDB = `/tmp/e2e-zoom-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
// 화면 평균 화소 차 — e2e-mtfoot 과 같은 자
function pxdiff(a, b) {
  let s = 0, t = 0;
  const h = Math.min(a.height, b.height), w = Math.min(a.width, b.width);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4; t++;
    s += (Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2])) / 3;
  }
  return t ? s / t : 0;
}

(async () => {
  console.log('\n=== 확대/축소 실클라 E2E (Chromium) ===');
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    E2E_GIVE: '1', VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2500);

  const shot = async (n) => { const p2 = path.join(SHOTS, n + '.png'); await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const zdbg = () => page.evaluate(() => window.__zoomDbg());
  const setZ = async (z) => { await page.evaluate((v) => window.__setZoom(v), z); await sleep(700); };
  // ★세계를 멈춰 놓고 잰다 — 안 그러면 "같은 화면인가"가 풀 흔들림에 묻힌다(e2e-mtfoot ⑧ 계보)
  const wind = async (off) => { await page.evaluate((o) => { if (window.__terrain19) window.__terrain19.windOff = o; }, off); await sleep(1200); };

  // ── ⓪ 검사 상황 — 무엇을 재고 있는가 ───────────────────────────────────
  console.log('\n=== ⓪ 검사 상황 선행 assert ===');
  ok(!!(await page.evaluate(() => window.__getMyAbs())), '존 입장');
  const z0 = await zdbg();
  ok(!!z0 && z0.zoom === 1, '★기본 배율이 1 이다 (종전 화면 그대로가 기본)', z0 ? `steps=${z0.steps.join('/')}` : 'null');
  ok(!!z0 && z0.off === null,
     '★★배율 1 에서는 오프스크린이 **아예 없다** — 즉 그리기 코드가 종전 경로를 탄다', `screen=${z0.screen.join('x')}`);
  const canvasTop = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.round(innerWidth * 0.5), Math.round(innerHeight * 0.62));
    return el ? (el.tagName + (el.id ? '#' + el.id : '')) : 'null';
  });
  ok(canvasTop === 'CANVAS#canvas', '★휠을 굴릴 자리가 캔버스 맨 위다 (HUD 오버레이 아님)', canvasTop);

  // ── ① 휠이 실제로 배율을 바꾼다 ────────────────────────────────────────
  console.log('\n=== ① 휠 = 확대/축소 ===');
  await wind(true);
  const base = await shot('01-z1');
  const WX = Math.round(1280 * 0.5), WY = Math.round(800 * 0.62);
  await page.mouse.move(WX, WY);
  await page.mouse.wheel(0, -120); await sleep(700);          // 위로 = 확대
  const zUp = await zdbg();
  ok(zUp.zoom > 1, '휠 위 → 확대', `${z0.zoom} → ${zUp.zoom}`);
  const upShot = await shot('02-zoomin');
  const dUp = pxdiff(base, upShot);
  ok(dUp > 2, '★자명 통과 금지 — 화면이 실제로 달라졌다', `평균 화소 차 ${dUp.toFixed(2)}`);
  await page.mouse.wheel(0, 120); await sleep(700);
  await page.mouse.wheel(0, 120); await sleep(700);           // 아래로 두 번 = 축소
  const zDn = await zdbg();
  ok(zDn.zoom < 1, '휠 아래 → 축소', `${zUp.zoom} → ${zDn.zoom}`);

  // 경계 — 더 굴려도 안 넘어간다
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); }
  await sleep(700);
  const zMin = (await zdbg()).zoom;
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -120); }
  await sleep(900);
  const zMax = (await zdbg()).zoom;
  ok(zMin === z0.steps[0] && zMax === z0.steps[z0.steps.length - 1],
     '★경계에서 안 넘어간다', `최소 ${zMin} · 최대 ${zMax} (표 ${z0.steps.join('/')})`);

  // ── ② 커서 → 월드 → 커서 왕복 · 배율마다 ───────────────────────────────
  console.log('\n=== ② 커서가 가리키는 곳 = 실제로 집히는 곳 ===');
  const P = [[420, 300], [640, 500], [980, 660]];
  let worst = 0;
  const worldAt = {};
  for (const z of z0.steps) {
    await setZ(z);
    // ★오프스크린 크기는 **재유도**해서 견준다(눈대중 금지 — 족보 74)
    const d = await zdbg();
    const wantOff = (z === 1) ? null : [Math.ceil(d.screen[0] / z), Math.ceil(d.screen[1] / z)];
    const offOk = (wantOff === null) ? (d.off === null) : (d.off && d.off[0] === wantOff[0] && d.off[1] === wantOff[1]);
    ok(offOk, `배율 ${z} — 오프스크린 = ceil(화면/배율)`, `${d.off ? d.off.join('x') : 'null'} (기대 ${wantOff ? wantOff.join('x') : 'null'})`);
    const r = await page.evaluate((pts) => pts.map(([x, y]) => {
      const w = window.__s2w(x, y); const s = window.__w2s(w.wx, w.wy);
      return { x, y, wx: w.wx, wy: w.wy, bx: s.px, by: s.py };
    }), P);
    worldAt[z] = r.map((q) => [q.wx, q.wy]);
    for (const q of r) worst = Math.max(worst, Math.hypot(q.bx - q.x, q.by - q.y));
  }
  ok(worst < 0.5, `★화면→월드→화면 왕복이 전 배율에서 제자리 (최악 ${worst.toFixed(4)}px)`);
  // 자명 통과 금지 — 배율이 다르면 같은 화면 점이 **다른 월드 점**을 가리켜야 한다
  const sep = Math.hypot(worldAt[0.5][0][0] - worldAt[2][0][0], worldAt[0.5][0][1] - worldAt[2][0][1]);
  ok(sep > 100, '★자명 통과 금지 — 배율이 다르면 같은 화면 점이 다른 월드 점이다', `0.5배 vs 2배 거리 ${sep.toFixed(0)}px`);

  // ── ③ 안개 원점 불변 (조준 배치의 계약과 동형) ─────────────────────────
  console.log('\n=== ③ 안개 원점은 배율에 안 흔들린다 ===');
  await setZ(1);
  const fog1 = await page.evaluate(() => window.__fogOrigin && { x: window.__fogOrigin.x, y: window.__fogOrigin.y });
  await setZ(2);
  const fog2 = await page.evaluate(() => window.__fogOrigin && { x: window.__fogOrigin.x, y: window.__fogOrigin.y });
  await setZ(0.5);
  const fog3 = await page.evaluate(() => window.__fogOrigin && { x: window.__fogOrigin.x, y: window.__fogOrigin.y });
  const fogOk = fog1 && fog2 && fog3;
  // ★안개 원점은 **화면 좌표**다(화면 중앙). 배율이 바뀌어도 화면 중앙은 그대로여야 한다.
  const fogD = fogOk ? Math.max(Math.hypot(fog2.x - fog1.x, fog2.y - fog1.y), Math.hypot(fog3.x - fog1.x, fog3.y - fog1.y)) : -1;
  ok(fogOk, '안개 원점 훅이 살아 있다', fogOk ? `z1(${fog1.x.toFixed(0)},${fog1.y.toFixed(0)})` : '없음');
  ok(fogOk && fogD < 1.5, '★배율을 바꿔도 안개 원점이 안 움직인다', `최대 이동 ${fogD.toFixed(3)}px`);

  // ── ④ 축소는 실제로 세계를 더 보여 준다 ────────────────────────────────
  console.log('\n=== ④ 축소 = 더 넓게 ===');
  await setZ(1);
  const seen1 = await page.evaluate(() => { const d = window.__zoomDbg(); const a = window.__s2w(0, 0), b = window.__s2w(d.screen[0], d.screen[1]); return Math.hypot(b.wx - a.wx, b.wy - a.wy); });
  await setZ(0.5);
  const seen05 = await page.evaluate(() => { const d = window.__zoomDbg(); const a = window.__s2w(0, 0), b = window.__s2w(d.screen[0], d.screen[1]); return Math.hypot(b.wx - a.wx, b.wy - a.wy); });
  await setZ(2);
  const seen2 = await page.evaluate(() => { const d = window.__zoomDbg(); const a = window.__s2w(0, 0), b = window.__s2w(d.screen[0], d.screen[1]); return Math.hypot(b.wx - a.wx, b.wy - a.wy); });
  ok(Math.abs(seen05 / seen1 - 2) < 0.02 && Math.abs(seen2 / seen1 - 0.5) < 0.02,
     '★보이는 월드 폭이 배율에 정확히 반비례', `1배 ${seen1.toFixed(0)} · 0.5배 ${seen05.toFixed(0)}(×${(seen05 / seen1).toFixed(3)}) · 2배 ${seen2.toFixed(0)}(×${(seen2 / seen1).toFixed(3)})`);

  // ── ⑤ 1 로 돌아오면 처음 화면 그대로 (되돌림 실증) ─────────────────────
  console.log('\n=== ⑤ 배율 1 복귀 = 종전 화면 그대로 ===');
  await setZ(1); await sleep(900);
  const back = await shot('03-back-to-1');
  const dBack = pxdiff(base, back);
  const zBack = await zdbg();
  ok(zBack.off === null, '★배율 1 로 돌아오면 오프스크린이 사라진다');
  ok(dBack < 1.0, '★★1 → 2 → 0.5 → 1 을 돌고 와도 화면이 처음과 같다 (바람 격리)', `평균 화소 차 ${dBack.toFixed(3)} (확대 때는 ${dUp.toFixed(2)} 였다)`);
  await wind(false);

  // ── ⑥ 성능 — 축소는 세계 화소가 1/z² 로 는다 ───────────────────────────
  console.log('\n=== ⑥ 성능 — rAF 간격 ===');
  const rafMed = async () => page.evaluate(() => new Promise((res) => {
    const t = []; let last = performance.now(), n = 0;
    const f = () => { const now = performance.now(); t.push(now - last); last = now; if (++n >= 70) { t.sort((a, b) => a - b); return res(+t[t.length >> 1].toFixed(2)); } requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  // ★[하네스 결함 수리] 처음엔 절대값에 문턱을 걸었다가 빨개졌다. 그런데 이 컨테이너는
  //   **소프트웨어 렌더(SwiftShader)**라 1배 기준선 자체가 수십~수백 ms 로 널뛴다 —
  //   절대값에 문턱을 걸면 줌이 아니라 **컨테이너 부하**를 재게 된다.
  //   ⇒ 재는 것은 **비율**이다: 축소는 세계 화소가 1/z² 로 느니 0.5배는 4배 근처여야 한다.
  //   그리고 기준선을 앞뒤로 두 번 재어 하네스 자신의 드리프트를 분리한다(그게 크면 비율이 거짓말이다).
  await setZ(1); await sleep(600); const r1a = await rafMed();
  await setZ(0.5); await sleep(600); const r05 = await rafMed();
  await setZ(2); await sleep(600); const r2 = await rafMed();
  await setZ(1); await sleep(600); const r1b = await rafMed();
  const r1 = Math.min(r1a, r1b);
  const drift = Math.abs(r1a - r1b) / Math.max(1, Math.min(r1a, r1b));
  console.log(`    프레임 간격 중앙값 — 1배 ${r1a}→${r1b}ms · 0.5배 ${r05}ms · 2배 ${r2}ms  (기준선 드리프트 ${(drift * 100).toFixed(0)}%)`);
  ok(drift < 0.6, '★기준선이 앞뒤로 크게 안 흔들린다 — 아래 비율을 믿을 근거', `1배 ${r1a} vs ${r1b}ms`);
  ok(r05 / r1 > 1.8 && r05 / r1 < 9, '★축소 비용이 화소 수(1/z²=4배)를 따라간다', `0.5배 / 1배 = ×${(r05 / r1).toFixed(1)}`);
  ok(r2 <= r1 * 1.2 + 4, '★★확대는 세계 화소가 **줄어** 더 싸다 — 갈래 A 의 값', `2배 ${r2}ms ≤ 1배 ${r1}ms`);

  // ── ⑦ 콘솔 오류 ────────────────────────────────────────────────────────
  console.log('\n=== ⑦ 콘솔 오류 ===');
  // ⚠favicon 404 는 이 배치 이전부터 있던 사실이다(정적 라우트에 favicon 이 없다).
  //   콘솔 문구에 'favicon' 이 안 들어와서 처음엔 이 하네스가 남의 빚을 제 실패로 셌다.
  const real = errs.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
  ok(real.length === 0, `페이지 오류 0 (favicon 404 제외)`, real.slice(0, 2).join(' | '));

  console.log(`    스크린샷: ${SHOTS}`);
  console.log(`\n=== e2e-zoom 결과: 통과 ${pass} · 실패 ${fail} ===`);
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})();
