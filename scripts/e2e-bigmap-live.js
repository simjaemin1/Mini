#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-bigmap-live.js — 큰 지도가 **열려 있는 동안** 살아 있는가 (T39) ====
//
// ★왜 [T39 2026-09-01]
//   T0-b 실측: `needsRedraw` 가 두 변수다. 바깥 조각들(11-r1-mountain·30-n-net·32-m-render)이
//   **32번 대입**하는 것은 선언이 없어 `window.needsRedraw`(암묵 전역)이고, **읽는 곳이 0** 이다
//   (메인 렌더 루프는 매 프레임 무조건 그린다). 큰 지도는 자기 IIFE 안에 `let needsRedraw` 를
//   따로 갖고 있어, 그 32번을 **한 번도 못 본다.**
//   ⇒ 큰 지도의 `needsRedraw` 를 세우는 것은 **사람의 손짓뿐**이다(열기·줌·드래그·내 위치 버튼)
//     + 지형 무효화 훅(`__invalidateMinimapCache`) 하나.
//   그런데 지도는 **내 위치 표식**(getMyAbs → 원)을 그린다.
//   ⇒ 예측: 지도를 열어 둔 채 걸으면 **표식이 안 따라온다.** 이 하네스가 그걸 잰다.
//
// ★자명 통과 금지 둘:
//   ⓐ 실제로 움직였나 — 서버가 준 좌표가 정말 바뀌었는지 먼저 assert 한다.
//      (안 움직였으면 "그림이 그대로다"는 아무것도 증명 못 한다)
//   ⓑ 계측기가 변화를 볼 줄 아나 — 드래그로 **일부러** 다시 그리게 해서 화소가 바뀌는지 본다.
//      (그림이 늘 같아 보이는 자라면 ①도 자명 통과다)
//
// 실행: node scripts/e2e-bigmap-live.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const HEADED = process.argv.includes('--headed');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-bigmap-live';
fs.mkdirSync(SHOTS, { recursive: true });
// ★★포트는 **고정이어야 한다** — 실측으로 배웠다.
//   처음엔 T10-① 처럼 빈 포트를 골랐더니 로비의 "월드 입장" 버튼이 계속 disabled 였다.
//   원인: 로비는 central 의 `/zones` 가 준 `wsUrl` 로 붙는데, 그 포트는 **zone-config 의 표**에서
//   나온다(`ZONES[id].port` = 3020). `PORT` env 로 존을 옮겨도 central 은 3020 을 광고한다
//   ⇒ 로비가 존을 죽은 것으로 본다. (`ZONE_HOSTS` 는 host 만 바꾸고 port 는 못 바꾼다.)
//   ⇒ 브라우저를 거치는 하네스는 3010/3020 을 써야 한다. 대신 **뜨기 전에 비어 있는지 확인**하고,
//     안 비어 있으면 남의 서버를 재는 대신 **큰 소리로 죽는다**(T10-① 이 고친 그 함정).
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/bml-c-${process.pid}.db`, ZDB = `/tmp/bml-z-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function assertPortsFree() {
  const bad = [];
  for (const [n, p] of [['central', CPORT], ['zone', ZPORT]]) if (!(await portFree(p))) bad.push(`${n}:${p}`);
  return bad;
}
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._err = ''; p._died = null;
  p.stdout.on('data', () => {});
  p.stderr.on('data', (b) => { p._err = (p._err + String(b)).slice(-3000); });
  p.on('exit', (c, s) => { p._died = `code=${c} sig=${s}`; });
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitUp(p, url, tries = 300) {
  for (let i = 0; i < tries; i++) {
    if (p._died) {
      console.log(`  ✗ ${p._name} 가 떠보지도 못하고 죽었다 (${p._died})`);
      const t = p._err.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      if (t) console.log(`      stderr: ${t.slice(0, 250)}`);
      return false;
    }
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}
// ★★자를 두 개 쓴다 — 처음 판이 **평균**만 봐서 헛돌았다.
//   내 위치 표식은 반지름 6px 짜리 점이다(≈113화소). 1280×800 캔버스에서 그게 통째로 옮겨 가도
//   **평균 화소 차는 0.04** 다 — 문턱을 0.5 로 잡아 놓고 "안 움직인다"고 읽었다.
//   ⇒ 작은 것이 움직이는지는 **바뀐 화소의 수**로 센다. 평균은 참고로만 남긴다.
function pxdiff(a, b) {
  let s = 0, t = 0, n = 0;
  const h = Math.min(a.height, b.height), w = Math.min(a.width, b.width);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4; t++;
    const d = (Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2])) / 3;
    s += d;
    if (d > 20) n++;               // 눈에 보이는 차이만 센다(압축·앤티앨리어싱 잡음 제외)
  }
  return { avg: t ? s / t : 0, changed: n };
}

(async () => {
  console.log('\n=== 큰 지도가 열려 있는 동안 살아 있는가 (T39) ===');
  const busy = await assertPortsFree();
  ok(busy.length === 0, '⓪ 포트가 비어 있다 — 앞 하네스의 서버가 남아 있으면 **남의 세계**를 재게 된다',
     busy.length ? `쥐고 있는 것: ${busy.join(', ')}` : `${CPORT}/${ZPORT} 비었음`);
  if (busy.length) { console.log('\n  ★포트가 안 비어서 검사를 진행하지 않는다 — 아래 숫자는 "안 쟀다"는 뜻이다.');
    console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zp = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
    E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0',
  });
  const cUp = await waitUp(cp, `http://localhost:${CPORT}/zones`); ok(cUp, 'central 기동');
  const zUp = await waitUp(zp, `http://localhost:${ZPORT}/health`); ok(zUp, 'zone 기동');
  if (!cUp || !zUp) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(!!(await page.evaluate(() => window.__getMyAbs())), '① 존 입장');

  // ── 큰 지도를 연다 (M) ────────────────────────────────────────────────
  await page.keyboard.press('m');
  await sleep(1200);
  const opened = await page.evaluate(() => {
    const el = document.getElementById('bigMapPanel');
    return !!el && !el.classList.contains('hidden');
  });
  ok(opened, '② 큰 지도가 열렸다 (M)');

  const shotMap = async (n) => {
    const el = await page.$('#bigMapPanel canvas');
    const p2 = path.join(SHOTS, n + '.png');
    if (!el) return null;
    await el.screenshot({ path: p2 });
    return PNG.sync.read(fs.readFileSync(p2));
  };
  const A = await shotMap('01-open');
  ok(!!A, '③ 지도 캔버스를 찍었다');

  // ── ⓑ 계측기가 변화를 볼 줄 아나 — 드래그로 **일부러** 다시 그린다 ──────────
  {
    const box = await (await page.$('#bigMapPanel canvas')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await sleep(700);
    const D = await shotMap('02-dragged');
    const d = pxdiff(A, D);
    ok(d.changed > 500, '★④ 자명 통과 금지 — 계측기가 변화를 본다(드래그하면 화소가 바뀐다)',
       `바뀐 화소 ${d.changed} · 평균 ${d.avg.toFixed(2)}`);
    // 원래 자리로 되돌려 놓는다(다음 판의 기준선을 흔들지 않게)
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await sleep(700);
  }

  // ── ★배율을 먼저 맞춘다 — 이걸 안 해서 처음 판이 헛돌았다 ────────────────
  //   지도를 열면 기본이 **전체보기**(zoom ≈ 0.001)다. 그 배율에서 83 월드px 는 화면에서
  //   0.08px — 표식이 따라와도 화소가 안 바뀐다. 즉 그 자리에서 잰 "0.00" 은
  //   "안 따라온다"가 아니라 **"이 배율에선 못 잰다"** 였다(계측 설계의 실수).
  //   ⇒ "📍 내 위치"(zoom 0.5)로 맞추고 잰다. 83px 이동 = 화면 41px.
  {
    const meBtn = await page.$('#bigMapMeBtn');
    ok(!!meBtn, '④-a 내 위치 버튼이 있다');
    if (meBtn) await meBtn.click();
    await sleep(900);
    const z = await page.evaluate(() => (window.__bigMapDbg && window.__bigMapDbg().zoom) || null);
    console.log(`    (배율 ${z === null ? '미상 — 훅 없음' : z})`);
  }

  // ── 본 검사: 지도를 **건드리지 않고** 걷는다 ────────────────────────────
  //   ★잡음 바닥 먼저 — **아무것도 안 하고** 두 장을 찍는다(족보 80).
  //     살아 있는 세계라 가만히 있어도 화소가 조금 흔들린다. 그 아래를 "변화"라고 부르면 안 된다.
  const N0 = await shotMap('03a-noise-a');
  await sleep(1200);
  const N1 = await shotMap('03b-noise-b');
  const noise = pxdiff(N0, N1);
  console.log(`    (잡음 바닥 — 가만히 1.2초: 바뀐 화소 ${noise.changed} · 평균 ${noise.avg.toFixed(3)})`);

  const B0 = await shotMap('03-before-walk');
  const p0 = await page.evaluate(() => window.__getMyAbs());
  //   ★한 번 **길게** 누른다. 처음엔 짧게 24번 눌렀는데 9px 밖에 안 갔다 —
  //     뗄 때마다 클라가 vx=0 을 보내서 사실상 제자리걸음이었다(측정이 아니라 입력 방식의 문제).
  await page.keyboard.down('d');
  await sleep(4000);
  await page.keyboard.up('d');
  await sleep(1500);
  const p1 = await page.evaluate(() => window.__getMyAbs());
  const moved = Math.hypot((p1.x - p0.x), (p1.y - p0.y));
  ok(moved > 60, '★⑤ 자명 통과 금지 — 실제로 걸었다(안 걸었으면 아래가 아무 뜻이 없다)', `${moved.toFixed(0)}px 이동`);

  const B1 = await shotMap('04-after-walk');
  const dWalk = pxdiff(B0, B1);
  ok(dWalk.changed > Math.max(30, noise.changed * 3),
     '★★⑥ 지도를 안 건드려도 **내 위치 표식이 따라온다**(열어 둔 지도가 낡지 않는다)',
     `바뀐 화소 ${dWalk.changed} (잡음 바닥 ${noise.changed} · 걸은 거리 ${moved.toFixed(0)}px)`);

  ok(errs.length === 0, '⑦ 클라 콘솔 오류 0건', errs.slice(0, 2).join(' | ') || '없음');
  console.log(`  스크린샷 → ${SHOTS}`);
  await browser.close();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e && e.message); process.exit(1); });
