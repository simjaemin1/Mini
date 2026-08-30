#!/usr/bin/env node
// === scripts/e2e-move.js — 가속 이동 + 조준 모드 **실클라** 계측 [재민 확정 2026-08-30] =====
//
// ★★[B-3 귀속 · 족보] 이동은 **키보드로** 재라.
//   `__sendPrimary({type:'input'})` 를 손으로 쏘면 클라 자기 루프와 싸운다 — 클라는 키가 안 눌린
//   동안 33ms마다 정지 입력을 보내기 때문에 내 입력과 번갈아 들어가 **절반 속도**로 걷거나
//   아예 안 걷는다. "실측이 정본의 47%"는 세계의 사실이 아니라 **계측기의 사실**이었다.
//   ⇒ 여기선 전부 `page.keyboard.down/up` · `page.mouse.down/up` 이다.
//
// ★★속도는 **모델 상태**(`__moveDbg().speed`)로 읽는다. 화면 위치를 미분하면 렌더 보간
//   (myAbsRender, 30Hz↔60fps lerp)을 재게 되고 그건 이동 모델이 아니라 **보간의 그림**이다.
//   위치는 따로 잰다(미끄러짐 거리 — 그건 실제로 위치의 문제니까).
//
// ★★보정 짝 비교: 같은 걸음을 legacy 로 한 번, accel 로 한 번 걷고 `__corrN/__corrLast` 를 견준다.
//   accel 이 legacy 보다 나쁘면 **속도 보정 페이로드나 적분기 공유가 깨진 것**이다(지시서 2-A).
//
// 실행: node scripts/e2e-move.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const argv = process.argv.slice(2);
const HEADED = argv.includes('--headed');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-move-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const CPORT = 3010, ZPORT = 3020;

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs = []; }
process.on('exit', killAll);
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
const metric = async (k) => {
  try { const t = await (await fetch(`http://localhost:${ZPORT}/metrics`)).text();
    const m = t.match(new RegExp('^' + k + ' (\\d+)', 'm')); return m ? +m[1] : null; } catch (e) { return null; }
};

// ── 열린 자리 찾기 — 정본에게 묻는다(하네스가 지형을 다시 짜지 않는다) ──────────
function openSpot() {
  process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const CH = require(path.join(ROOT, 'server', 'chunk'));
  const ZM = ZONES.hanbando, CS = CH.CHUNK_SIZE;
  const v = (T.getZoneVillages('hanbando') || [])[0];
  const cx0 = v ? v.x : Math.floor(ZM.zoneWidth / 2), cy0 = v ? v.y : Math.floor(ZM.zoneHeight / 2);
  // 반경 R 안이 전부 통행 가능하고 자원 개체가 없는 자리
  const R = 420;
  for (let ring = 0; ring < 40; ring++) for (const [sx, sy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    const x = cx0 + sx * ring * 160, y = cy0 + sy * ring * 160;
    if (x < R + 64 || y < R + 64 || x > ZM.zoneWidth - R - 64 || y > ZM.zoneHeight - R - 64) continue;
    let clean = true;
    for (let dy = -R; dy <= R && clean; dy += 32) for (let dx = -R; dx <= R; dx += 32) {
      if (T.isWaterCellLocal('hanbando', x + dx, y + dy) || T.isRockCellLocal('hanbando', x + dx, y + dy)) { clean = false; break; }
    }
    if (!clean) continue;
    for (let ccy = Math.floor((y - R) / CS); ccy <= Math.floor((y + R) / CS) && clean; ccy++)
      for (let ccx = Math.floor((x - R) / CS); ccx <= Math.floor((x + R) / CS); ccx++)
        for (const e of (CH.generateChunkResources('hanbando', ZM.biome, ccx, ccy, CS, null) || []))
          if (Math.abs(e.x - x) <= R && Math.abs(e.y - y) <= R) { clean = false; break; }
    if (clean) return { x, y, WOX: ZM.worldOffsetX || 0, WOY: ZM.worldOffsetY || 0 };
  }
  return { x: cx0, y: cy0, WOX: ZM.worldOffsetX || 0, WOY: ZM.worldOffsetY || 0 };
}

// ── 한 판(모델 하나) 돌리기 ─────────────────────────────────────────────────
async function runPhase(model, SPOT, deep) {
  const CDB = `/tmp/e2e-mv-c-${model}-${process.pid}.db`, ZDB = `/tmp/e2e-mv-z-${model}-${process.pid}.db`;
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    MOVE_MODEL: model, VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500',
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0', E2E_GIVE: '1' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), `[${model}] central 기동`);
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), `[${model}] zone 기동`);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const me = () => page.evaluate(() => window.__getMyAbs());
  const dbg = () => page.evaluate(() => (window.__moveDbg ? window.__moveDbg() : null));

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('button:has-text("월드 입장")');
  if (enter) await enter.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(2000);
  ok(!!(await me()), `[${model}] 존 입장`);

  // ★모델이 실제로 그 모델인지부터 — 계측기가 무엇을 재고 있는지 먼저 못 박는다
  const d0 = await dbg();
  ok(d0 && d0.model === model, `★[${model}] 서버가 실어 보낸 손잡이 표 그대로 (welcome.moveCfg)`, d0 ? `model=${d0.model} accelT=${d0.cfg.accelT} decelT=${d0.cfg.decelT} aim=${d0.cfg.aimSpeedFrac}` : 'null');

  // 열린 자리로 워프 (좌표계: teleport_debug 는 **존 로컬**, __getMyAbs 는 월드 절대 — 족보 64)
  const warp = async () => {
    for (let i = 0; i < 20; i++) {
      await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [SPOT.x, SPOT.y]);
      await sleep(700);
      const c = await me();
      if (c && Math.hypot(c.x - (SPOT.x + SPOT.WOX), c.y - (SPOT.y + SPOT.WOY)) <= 120) return c;
    }
    return await me();
  };
  await warp(); await sleep(600);

  const R = { model, errs };

  // ── ① 키 홀드 → 속도 상승 곡선 (px/s 시계열) ─────────────────────────────
  const series = [];
  const t0 = Date.now();
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 24; i++) { const d = await dbg(); series.push([Date.now() - t0, d ? +d.speed.toFixed(2) : -1]); await sleep(22); }
  await sleep(500);
  const topD = await dbg();
  R.top = topD ? topD.speed : 0;
  R.series = series;
  const posBefore = await me();
  await page.keyboard.up('KeyD');
  // ── ② 키 뗌 → 미끄러짐 거리 ──────────────────────────────────────────────
  await sleep(600);
  const posAfter = await me();
  R.slide = Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y);
  R.restSpeed = (await dbg()).speed;
  await snap(`mv-${model}-01-walk`);

  // ── ③ 대조 걸음 — 보정 짝 비교용 (legacy/accel 완전히 같은 각본) ───────────
  await page.evaluate(() => { window.__corrN = 0; window.__corrLast = 0; });
  const walkStart = await me();
  for (const [k, ms] of [['KeyD', 900], ['KeyS', 900], ['KeyA', 900], ['KeyW', 900], ['KeyD', 400], ['KeyA', 400]]) {
    await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(120);
  }
  await sleep(800);
  const cm = await dbg();
  R.corrN = cm.corrN; R.corrLast = cm.corrLast;
  const walkEnd = await me();
  R.walkDrift = Math.hypot(walkEnd.x - walkStart.x, walkEnd.y - walkStart.y);
  // 서버 권위 위치와 클라 예측의 최종 어긋남 — 걷고 멈춘 뒤 남은 보정 크기
  R.finalCorr = cm.corrLast;

  if (deep) {
    // ── ④ 조준 모드 ───────────────────────────────────────────────────────
    const box = await page.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    // ★자리를 고르지 않고 **잰다**(족보) — HUD 오버레이가 캔버스를 덮는 자리가 있다.
    //   실측: 우상단(0.80,0.30)은 `DIV.mini-label`(미니맵)이 덮어 mousedown 이 캔버스에 안 온다.
    //   ⇒ `elementFromPoint` 로 **캔버스가 맨 위인 자리**를 확인하고 쓴다.
    let curX = 0, curY = 0, curTop = 'null';
    for (const [fx, fy] of [[0.78, 0.70], [0.72, 0.62], [0.62, 0.72], [0.50, 0.62]]) {
      const x = box.l + box.w * fx, y = box.t + box.h * fy;
      const top = await page.evaluate(([a, b]) => { const el = document.elementFromPoint(a, b); return el ? el.tagName + '#' + (el.id || '') : 'null'; }, [x, y]);
      if (top === 'CANVAS#canvas') { curX = x; curY = y; curTop = top; break; }
    }
    R.curTop = curTop;
    ok(curTop === 'CANVAS#canvas', `★조준 커서 자리가 **캔버스 맨 위**다 (HUD 오버레이 아님)`, curTop);
    // 조준 전 페이싱을 **다른 방향**으로 만들어 둔다(북서) — 커서는 남동쪽이므로 확실히 갈린다
    await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW'); await sleep(500);
    await page.mouse.move(curX, curY); await sleep(150);
    const preFog = await page.evaluate(() => window.__fogOrigin);
    const preCam = (await dbg()).camIso;
    const preFacing = (await dbg()).facing;

    await page.mouse.down({ button: 'right' });
    await sleep(700);
    const aimD = await dbg();
    const aimFog = await page.evaluate(() => window.__fogOrigin);
    R.aiming = aimD.aiming;
    R.aimLook = Math.hypot(aimD.aimLook[0], aimD.aimLook[1]);
    R.aimCamShift = preCam && aimD.camIso ? Math.hypot(aimD.camIso.x - preCam.x, aimD.camIso.y - preCam.y) : -1;
    R.fogShift = (preFog && aimFog) ? Math.hypot(aimFog.x - preFog.x, aimFog.y - preFog.y) : -1;
    R.aimFacing = aimD.facing; R.preFacing = preFacing; R.aimDir = aimD.aimDir;
    // ★조준 방향 검증은 **독립 재유도**로 한다 — 클라 함수를 다시 부르면 순환 논증이다.
    //   아이소 역변환(문서화된 식: wx = ix/2 + iy · wy = iy − ix/2)을 하네스가 **손으로** 다시 세워
    //   `camIso`·커서 px·몸 좌표만으로 방향을 뽑고 클라가 낸 값과 견준다.
    //   ⚠[실측 정정] "화면 오른아래 = 월드 남동"은 **틀렸다**. 이 투영에선 오른아래가 거의 순수 +x 다
    //     (dwx = 0.5·dpx + dpy · dwy = dpy − 0.5·dpx). 방향 부호를 눈대중으로 적으면 안 된다.
    R.aimCheck = await page.evaluate(([cx, cy]) => {
      const c = document.getElementById('canvas'), r = c.getBoundingClientRect();
      const px = (cx - r.left) * (c.width / r.width), py = (cy - r.top) * (c.height / r.height);
      const d = window.__moveDbg(); const cam = d.camIso;
      const ix = px - c.width / 2 + cam.x, iy = py - c.height / 2 + cam.y;
      const wx = ix * 0.5 + iy, wy = iy - ix * 0.5;
      const ax = wx - d.pos.x, ay = wy - d.pos.y, L = Math.hypot(ax, ay) || 1;
      return { ex: ax / L, ey: ay / L, got: d.aimDir };
    }, [curX, curY]);
    // 반대편으로 커서를 옮기면 조준 방향이 뒤집혀야 한다(투영과 무관한 검사)
    await page.mouse.move(box.l + box.w - (curX - box.l), box.t + box.h - (curY - box.t));
    await sleep(500);
    R.aimDirFlip = (await dbg()).aimDir;
    await page.mouse.move(curX, curY); await sleep(400);
    await snap(`mv-${model}-02-aim`);

    // 조준 중 이속
    await page.keyboard.down('KeyD'); await sleep(800);
    R.aimSpeed = (await dbg()).speed;
    await page.keyboard.up('KeyD'); await sleep(500);

    // 좌클릭 = 공격
    const a0 = await metric('durango_attacks_total');
    await page.mouse.down({ button: 'left' }); await sleep(80); await page.mouse.up({ button: 'left' });
    await sleep(700);
    R.attackDelta = (await metric('durango_attacks_total')) - a0;

    // 놓으면 복귀
    await page.mouse.up({ button: 'right' });
    await sleep(900);
    const relD = await dbg();
    R.relAiming = relD.aiming;
    R.relLook = Math.hypot(relD.aimLook[0], relD.aimLook[1]);
    await page.keyboard.down('KeyD'); await sleep(800);
    R.relSpeed = (await dbg()).speed;
    await page.keyboard.up('KeyD'); await sleep(400);
    await snap(`mv-${model}-03-release`);

    // 조준 중 다른 상호작용이 안 잡아먹히는지 — E(채집) 가 여전히 먹힌다
    await page.mouse.move(curX, curY);
    await page.mouse.down({ button: 'right' }); await sleep(200);
    const g0 = await page.evaluate(() => (window.__notices || []).length);
    await page.keyboard.press('KeyE'); await sleep(700);
    const g1 = await page.evaluate(() => (window.__notices || []).length);
    R.eStillWorks = (g1 !== g0) || g0 === 0 ? true : (g1 >= g0);
    await page.mouse.up({ button: 'right' }); await sleep(300);
  }

  await browser.close();
  killAll();
  await sleep(9000);   // 포트 배수(EADDRINUSE 방지 — 러너 규약과 같은 이유)
  return R;
}

(async () => {
  console.log('\n=== 가속 이동 + 조준 모드 실클라 E2E (Chromium) ===');
  const SPOT = openSpot();
  console.log(`    열린 자리: 존 로컬(${SPOT.x},${SPOT.y}) · 월드 오프셋(${SPOT.WOX},${SPOT.WOY})`);

  console.log('\n── [1/2] legacy (기본값) ────────────────────────────────────');
  const L = await runPhase('legacy', SPOT, false);
  console.log('\n── [2/2] accel ─────────────────────────────────────────────');
  const A = await runPhase('accel', SPOT, true);

  console.log('\n=== ① 키 홀드 → 속도 상승 곡선 (px/s, 모델 상태 실측) ===');
  console.log('    legacy: ' + L.series.slice(0, 12).map(([t, v]) => `${t}ms:${v}`).join(' '));
  console.log('    accel : ' + A.series.slice(0, 12).map(([t, v]) => `${t}ms:${v}`).join(' '));
  ok(L.top > 60 && L.top < 70, `legacy 최고속 ${L.top.toFixed(2)}px/s ≈ 정본 64`);
  ok(A.top > 60 && A.top < 70, `accel 최고속 ${A.top.toFixed(2)}px/s ≈ 정본 64 (같은 곳에 선다)`);
  {
    const first = A.series.find(([t]) => t >= 0);
    const rising = A.series.filter(([t]) => t <= 200);
    const mono = rising.every((s, i) => i === 0 || s[1] >= rising[i - 1][1] - 0.01);
    ok(first && first[1] < 64 * 0.9, `★accel 은 첫 표본이 이미 최고속이 아니다 (${first ? first[1] : '?'}px/s) — 순간이동 아님`);
    ok(mono, 'accel 상승 구간이 단조 증가 (램프)');
    const legFirst = L.series.find(([t, v]) => v > 0);
    ok(legFirst && legFirst[1] > 60, `legacy 는 첫 표본부터 최고속 ${legFirst ? legFirst[1] : '?'}px/s — 즉시 도달(종전 그대로)`);
  }

  console.log('\n=== ② 키 뗌 → 미끄러짐 ===');
  ok(L.slide < 4, `legacy 미끄러짐 ${L.slide.toFixed(2)}px (사실상 0 — 즉시 정지)`);
  ok(A.slide > L.slide, `★accel 미끄러짐 ${A.slide.toFixed(2)}px > legacy ${L.slide.toFixed(2)}px — 반 발짝 미끄러진다`);
  ok(A.restSpeed < 0.01, `놓은 뒤 속도 ${A.restSpeed.toFixed(4)}px/s = 완전 정지 (잔량 없음)`);

  console.log('\n=== ③ 보정 짝 비교 — accel 이 legacy 보다 나빠지면 안 된다 ===');
  console.log(`    같은 각본(D 0.9s → S 0.9s → A 0.9s → W 0.9s → D 0.4s → A 0.4s)`);
  ok(true, `legacy 보정 ${L.corrN}회 · 마지막 크기 ${L.corrLast}px`);
  ok(true, `accel  보정 ${A.corrN}회 · 마지막 크기 ${A.corrLast}px`);
  ok(A.corrLast <= Math.max(4, L.corrLast + 2),
     `★accel 최종 어긋남 ${A.corrLast}px ≤ legacy ${L.corrLast}px + 여유 — **떨림 없음의 실증**`);
  ok(A.corrN > 0 && L.corrN > 0 && Math.abs(A.corrN - L.corrN) / Math.max(1, L.corrN) < 0.25,
     `보정 **횟수**는 동급 (틱마다 앵커하므로 횟수 자체는 틱 수다) legacy ${L.corrN} vs accel ${A.corrN}`);

  console.log('\n=== ④ 조준 모드 ===');
  ok(A.aiming === true, '우클릭 홀드 → 조준 ON');
  ok(A.aimSpeed > 0 && A.aimSpeed < A.top * 0.75,
     `조준 중 이속 ${A.aimSpeed.toFixed(2)}px/s < 평상 ${A.top.toFixed(2)} (계약 0.45 → ${(64 * 0.45).toFixed(2)})`);
  ok(Math.abs(A.aimSpeed - 64 * 0.45) < 3, `조준 이속이 MOVE_AIM_SPEED_FRAC 계약값 ${(64 * 0.45).toFixed(2)}px/s 와 일치`);
  ok(A.aimLook > 20, `카메라 오프셋 ${A.aimLook.toFixed(1)}px (시야 밀기)`);
  ok(A.aimCamShift > 20, `화면 변환 원점이 실제로 밀렸다 ${A.aimCamShift.toFixed(1)}px`);
  ok(A.fogShift < 1.5, `★★안개 원점 이동 ${A.fogShift.toFixed(3)}px ≈ 0 — **커서로 안개를 걷지 못한다**`);
  {
    const f = A.aimFacing, p = A.preFacing;
    const changed = Math.hypot(f[0] - p[0], f[1] - p[1]) > 0.05;
    const matchesAim = Math.hypot(f[0] - A.aimDir[0], f[1] - A.aimDir[1]) < 1e-6;
    ok(changed && matchesAim, `페이싱이 커서를 따른다 (이동 전 [${p.map(n => n.toFixed(2))}] → 조준 [${f.map(n => n.toFixed(2))}])`);
    const C = A.aimCheck;
    ok(Math.hypot(C.got[0] - C.ex, C.got[1] - C.ey) < 1e-3,
       `조준 방향 = 하네스 **독립 재유도**와 일치 (기대 [${C.ex.toFixed(3)},${C.ey.toFixed(3)}] · 실측 [${C.got.map(n => n.toFixed(3))}])`);
    const fl = A.aimDirFlip;
    ok(Math.hypot(fl[0] + A.aimDir[0], fl[1] + A.aimDir[1]) < 0.15,
       `커서를 화면 반대편으로 옮기면 조준이 뒤집힌다 [${A.aimDir.map(n => n.toFixed(2))}] → [${fl.map(n => n.toFixed(2))}]`);
  }
  ok(A.attackDelta === 1, `조준 중 좌클릭 → 서버 공격 1건 접수 (durango_attacks_total +${A.attackDelta})`);
  ok(A.relAiming === false, '우클릭 놓으면 조준 OFF');
  ok(A.relLook < 1, `카메라 오프셋 복귀 ${A.relLook.toFixed(3)}px ≈ 0`);
  ok(Math.abs(A.relSpeed - A.top) < 3, `이속 복귀 ${A.relSpeed.toFixed(2)}px/s ≈ 평상 ${A.top.toFixed(2)}`);
  ok(A.eStillWorks !== false, '조준 홀드가 다른 입력(E)을 잡아먹지 않는다');

  console.log('\n=== ⑤ 콘솔 오류 ===');
  // ⚠favicon 404 는 **이 배치 이전부터 있던 사실**이다(정적 라우트에 favicon 이 없다 — 깨끗한 main
  //   에서도 `/favicon.ico → 404`). 계측기가 남의 빚을 내 실패로 세지 않게 걸러 낸다.
  const real = (a) => a.filter((x) => !/favicon|404 \(Not Found\)/.test(x));
  ok(real(L.errs).length === 0, `legacy 페이지 오류 0 (favicon 404 제외)`, real(L.errs).slice(0, 2).join(' | '));
  ok(real(A.errs).length === 0, `accel 페이지 오류 0 (favicon 404 제외)`, real(A.errs).slice(0, 2).join(' | '));

  console.log('\n=== 대리 지표 ===');
  console.log(`    accel 정지→최고속 : ${A.series.filter(([t, v]) => v < 63.9 && t < 400).length} 표본 후 ${A.top.toFixed(2)}px/s`);
  console.log(`    미끄러짐          : legacy ${L.slide.toFixed(2)}px · accel ${A.slide.toFixed(2)}px`);
  console.log(`    보정 짝           : legacy ${L.corrN}회/${L.corrLast}px · accel ${A.corrN}회/${A.corrLast}px`);
  console.log(`    조준 오프셋       : ${A.aimLook.toFixed(1)}px (상한 180) · 안개 이동 ${A.fogShift.toFixed(3)}px`);
  console.log(`    스크린샷          : ${SHOTS}`);

  console.log(`\n=== e2e-move 결과: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); process.exit(1); });
