#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`)을 만지는 카드는 이 표를 전수로 돌려라 —
//              `bash scripts/run-regress.sh --list pixel`. 이름으로는 못 찾는다(T98: `e2e-nature` 는
//              하늘 때문에 셋이 빨갰는데 그 파일엔 `weather` 라는 낱말이 없어 `grep -l` 에 안 걸렸다).
// === scripts/e2e-fishing.js — 낚시 v2 **실클라** E2E ============================
//
// ★왜 [재민 확정 2026-08-26]
//   `test-fishing` 49/0 은 "물리와 계약이 맞는가"를 잰다. 이 레포가 배치 5 에서 배운 것은
//   **계약도 실행도 멀쩡한데 화면에서 도달 못 하는 층이 하나 더 있다**는 것이다(노를 한 번도 못 지었다).
//   그래서 여기서는 진짜 Chromium 을 띄우고 **사람이 하듯** 물가로 가서 Shift+F 를 누르고,
//   찌가 흔들리는 걸 보고, 채고, 한 번은 일부러 놓친다.
//
// ★★시간 모드: **얼리지 않는다.** 이 하네스는 *시간 자체가 주제*다(입질 대기 → 챔질 창).
//   대신 검사에 무관한 두 손잡이만 테스트값으로 연다:
//     · `FISH_WAIT_BASE_MS` 를 줄여 **데우는 시간**을 아낀다(입질 빈도는 test-fishing ① 이 잰다)
//     · `FISH_WIN_*` 를 늘려 **CDP 왕복 지연**을 흡수한다 — 이 검사의 대상은 사람의 반사신경이 아니라
//       "창 안이면 성공하고 창 밖이면 놓치는 기계가 화면까지 이어져 있는가"다.
//       (창이 크기에 따라 줄어드는 법칙은 `test-fishing ⑤` 가 정본 함수로 잰다.)
//
// 실행: node scripts/e2e-fishing.js [--headed]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-fish-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-fi-central-${process.pid}.db`, ZDB = `/tmp/e2e-fi-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const shots = [];
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★[T84] 서버 콘솔 줄은 **말**로 거른다(로그의 이모지가 빠지면 필터가 조용히 죽는다).
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|어장/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 110)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}

// ── 던질 자리 고르기 — **정본 모듈**에게 물어본다(하네스가 지형을 다시 읽지 않는다) ──
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const F = require(path.join(ROOT, 'server', 'fishing'));
const Z = 'hanbando', ZONE = ZONES[Z];
function pickRiverSpot() {
  let best = null;
  for (let y = 0; y < ZONE.zoneHeight; y += 61) {
    for (let x = 0; x < ZONE.zoneWidth; x += 61) {
      if (!T.isWaterCellLocal(Z, x, y)) continue;
      const sp = F.spotAt(T, Z, x, y);
      if (!sp.water || sp.kind === 'lake') continue;
      // 물가에 **설 수 있어야** 한다 — 옆 칸이 뭍인 강가를 고른다(플레이어는 물 위에 못 선다).
      let bankX = null, bankY = null;
      for (const [dx, dy] of [[64, 0], [-64, 0], [0, 64], [0, -64], [96, 0], [-96, 0], [0, 96], [0, -96]]) {
        if (!T.isWaterCellLocal(Z, x + dx, y + dy) && !T.isRockCellLocal(Z, x + dx, y + dy)) { bankX = x + dx; bankY = y + dy; break; }
      }
      if (bankX == null) continue;
      const sc = F.spotScore(sp);
      const v = sc.rate * sc.size;
      if (!best || v > best.v) best = { x, y, bankX, bankY, sp, v };
    }
  }
  return best;
}

(async () => {
  console.log('\n=== 낚시 v2 실클라 E2E (Chromium) ===');
  const spot = pickRiverSpot();
  ok(!!spot, '★전제 — 실지도에서 **설 수 있는 강가**를 찾았다(없으면 이 검사가 성립 안 한다)',
    spot ? `물(${spot.x},${spot.y}) 강둑(${spot.bankX},${spot.bankY}) u=${spot.sp.u.toFixed(2)} 종류 ${spot.sp.kind}` : 'X');
  if (!spot) { console.log('\n=== 0건 중 PASS 0 · FAIL 1 ==='); process.exit(1); }

  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    // ★테스트 전용 시간 손잡이 — 위 머리 주석의 두 가지. 라이브 기본은 그대로다.
    FISH_WAIT_BASE_MS: '1500', FISH_WAIT_MAX_MS: '6000',
    FISH_WIN_BASE_MS: '3000', FISH_WIN_MIN_MS: '2200',
  });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: !HEADED, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  const snap = async (n) => { const f = path.join(SHOTS, n + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; };

  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  const enterBtn = await page.$('#enter');
  ok(!!enterBtn, '로비에 입장 버튼(`#enter` · 「나루터로 간다」 — T84 개명)');
  if (enterBtn) await enterBtn.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(1500);
  ok(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs())), '존 입장 — 내 좌표 수신');

  // ── 강둑으로 워프 — 게스트 재접속에 씻길 수 있어 **수렴할 때까지** 되풀이(e2e-events 와 같은 규약) ──
  // ★★워프 판정에서 좌표계를 섞지 마라 — `__getMyAbs` 는 **절대 월드**, `teleport_debug` 는 **존 로컬**이다.
  //   (1차 실행에서 그냥 견줬다가 40만 px 차로 멀쩡한 도착이 실패로 보였다. 이 레포 단골 함정.)
  //   여기서는 **안정될 때까지** 되풀이 워프만 하고(게스트가 입장 직후 한 번 재접속해 워프를 씻는다),
  //   진짜 도착 증거는 아래 ② 의 **찌 자리**로 잡는다 — 서버가 고른 물이 내가 노린 물이면 도착한 것이다.
  let tp = false, prev = null;
  for (let i = 0; i < 25 && !tp; i++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [spot.bankX, spot.bankY]);
    await sleep(900);
    const a = await page.evaluate(() => window.__getMyAbs && window.__getMyAbs());
    if (a && prev && Math.hypot(a.x - prev.x, a.y - prev.y) < 4 && i >= 2) tp = true;
    prev = a;
  }
  const myPos = await page.evaluate(() => window.__getMyAbs && window.__getMyAbs());
  // ★★[2026-08-26] `__getMyAbs` 는 **절대 월드** 좌표이고 `teleport_debug` 는 **존 로컬**을 받는다.
  //   둘을 그냥 견주면 40만 px 차이가 나서 멀쩡한 도착이 실패로 보인다(1차 실행에서 그랬다 —
  //   이 레포의 단골 함정인 좌표계 혼선이다). 존 오프셋을 **클라에게 물어서** 맞춘다.
  ok(tp, '강둑 워프 수렴(좌표가 더 안 움직인다)', `me_abs(${Math.round(myPos.x)},${Math.round(myPos.y)}) · 목표 local(${spot.bankX},${spot.bankY})`);
  await snap('fi-01-at-bank');
  await page.click('canvas', { position: { x: 640, y: 400 } }).catch(() => {});

  // ── ① 화면의 물살이 **거짓말하지 않는다** ────────────────────────────────
  //   서버의 자리 판정(폭 단위 거리 u)과 클라 셰이더가 쓰는 u 가 같은 칸에서 같아야 한다.
  //   갈리면 "물을 보고 자리를 읽는다"는 이 동사의 전제가 무너진다(힌트가 거짓이 된다).
  //   ★하네스는 **식을 베끼지 않는다** — 서버 모듈과 클라 훅에게 각각 물어보고 맞대 볼 뿐이다.
  const fm = await page.evaluate(() => (window.__flowMap ? window.__flowMap(60) : null));
  ok(!!(fm && fm.cells && fm.cells.length), '★전제 — 클라 흐름맵에 물 칸이 실제로 있다', fm ? `${fm.cells.length}칸` : 'X');
  // ★클라 흐름맵의 색인은 **절대 셀**이다. 오프셋은 "내 절대 좌표 − 서버가 아는 내 로컬 좌표"로 잡는다.
  //   여기서 서버가 아는 로컬 = 방금 워프한 강둑(수렴을 위에서 확인했다).
  const offX = Math.round(myPos.x - spot.bankX), offY = Math.round(myPos.y - spot.bankY);
  const cellX = Math.floor((spot.x + offX) / 32), cellY = Math.floor((spot.y + offY) / 32);
  const cli = (fm && fm.cells || []).find((c) => c[0] === cellX && c[1] === cellY);
  const srvU = F.spotAt(T, Z, spot.x, spot.y).u;
  ok(!!cli, '★전제 — 던질 그 칸이 클라 흐름맵 안에 있다', cli ? `u=${cli[4]}` : `(${cellX},${cellY}) 없음 · 오프셋(${offX},${offY})`);
  if (cli) {
    const du = Math.abs(cli[4] - srvU);
    ok(du < 0.06, `★★① **화면의 물살이 힌트다** — 서버 u ${srvU.toFixed(3)} ↔ 클라 u ${cli[4]} (차 ${du.toFixed(4)})`);
  }

  // ── ②③④ 던지기 → 입질 → 챔질 ────────────────────────────────────────────
  // ★★[2026-08-26 수리] 이 셋은 **한 덩어리로** 돌려야 한다.
  //   1차 실행에서 ② 의 assert 와 스크린샷(수백 ms)이 **챔질 창을 통째로 까먹었다** —
  //   입질은 왔는데 하네스가 사진을 찍는 사이 창이 지나가 "입질이 안 온다"고 보고했다.
  //   (제품은 멀쩡했다. 알림 로그에 `놓쳤다 — 묵직한 놈이었다(2.3kg)` 가 남아 있었다.)
  //   ⇒ 던지고 나면 **왕복을 최소로** 하고 오직 상태만 본다. 판정과 사진은 다 끝난 뒤에.
  const invBefore = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
  await page.keyboard.press('Shift+KeyF');
  let stWait = null, bit = null, tBite = 0, tPress = 0;
  for (let i = 0; i < 400; i++) {
    const s2 = await page.evaluate(() => window.__fishState || null);
    if (s2 && s2.state === 'wait' && !stWait) stWait = s2;
    if (s2 && s2.state === 'bite') {
      bit = s2; tBite = Date.now();
      await page.keyboard.press('Shift+KeyF');   // ★본 즉시 챈다 — 사이에 아무것도 끼우지 않는다
      tPress = Date.now();
      break;
    }
    if (i > 30 && !stWait) break;
    await sleep(50);
  }
  let caught = null;
  for (let i = 0; i < 40 && !caught; i++) { await sleep(120); caught = await page.evaluate(() => window.__fishLast || null); }
  const invAfter = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
  const notes1 = await page.evaluate(() => (window.__notices || []).slice(-5));
  const stAfter = await page.evaluate(() => window.__fishState || null);
  await snap('fi-02-cast');

  ok(!!(stWait && stWait.state === 'wait'), '★★② Shift+F 로 **던져진다**(키 배선 → 서버 → 클라 상태)', stWait ? stWait.state : 'null');
  ok(!!(stWait && Number.isFinite(stWait.x) && Number.isFinite(stWait.y)), '★② 찌 자리를 **서버가** 정해 보내 준다',
    stWait ? `local(${Math.round(stWait.lx)},${Math.round(stWait.ly)}) → abs(${Math.round(stWait.x)},${Math.round(stWait.y)})` : 'X');
  // ★★찌가 **내 눈앞에** 있어야 한다. 서버 좌표를 절대 좌표로 안 옮기면 40만 px 밖에 그려져
  //   상태·알림은 멀쩡한데 화면엔 아무것도 없다 — 1차 실행에서 실제로 그랬다(수리함).
  const dFloat = stWait ? Math.hypot(stWait.x - myPos.x, stWait.y - myPos.y) : Infinity;
  ok(dFloat < 400, '★★② 찌가 **내 눈앞**에 있다(존 로컬 → 절대 변환이 살아 있다)', `${Math.round(dFloat)}px`);
  ok(stWait && Math.hypot(stWait.lx - spot.x, stWait.ly - spot.y) < 200,
    '★★② 서버가 고른 자리가 **의도한 그 물**이다 = 워프가 실제로 먹혔다',
    stWait ? `${Math.round(Math.hypot(stWait.lx - spot.x, stWait.ly - spot.y))}px` : 'X');
  ok(notes1.some((t) => /던졌다/.test(t)), '★② 던졌다는 알림이 화면에 온다');

  ok(!!bit, '★★③ 기다리면 **입질이 온다**(서버가 정한 시각에 상태가 바뀐다)', bit ? `창 ${bit.windowMs}ms` : '시간 초과');
  ok(!!(bit && bit.windowMs > 0), '★③ 창 폭을 **서버가** 실어 보낸다(클라가 지어내지 않는다)', bit ? `${bit.windowMs}ms` : 'X');
  if (bit) console.log(`    챔질 지연 실측: 입질 감지 → 키 입력 ${tPress - tBite}ms (창 ${bit.windowMs}ms · 서버 biteAt 기준 ${tPress - (bit.biteAt || tBite)}ms)`);

  ok(!!caught, '★★④ 창 안에 채면 **잡힌다**', caught ? `${caught.kg}kg ×${caught.n} ${caught.item}` : (notes1.slice(-1)[0] || '못 잡음'));
  ok(caught && (invAfter[caught.item] || 0) > (invBefore[caught.item] || 0),
    '★④ 잡은 물고기가 **인벤에 실제로** 들어왔다', caught ? `${caught.item} ${invBefore[caught.item] || 0} → ${invAfter[caught.item] || 0}` : 'X');
  ok(notes1.some((t) => /kg/.test(t)), '★④ 크기가 화면 알림에 보인다(숫자를 찾아 들어가지 않는다)', JSON.stringify(notes1.slice(-1)));
  ok(stAfter === null, '★④ 잡고 나면 찌가 사라진다(상태가 idle 로 돌아온다)');
  await snap('fi-04-caught');

  // ── ⑤ 창 **밖** — 일부러 놓친다 ──────────────────────────────────────────
  await page.evaluate(() => { window.__notices = []; window.__fishLast = null; });
  await page.keyboard.press('Shift+KeyF');
  let bit2 = null;
  for (let i = 0; i < 120 && !bit2; i++) {
    await sleep(100);
    const s3 = await page.evaluate(() => window.__fishState || null);
    if (s3 && s3.state === 'bite') bit2 = s3;
  }
  ok(!!bit2, '★전제 — 두 번째 입질이 왔다(놓침을 재려면 물어야 한다)', bit2 ? `창 ${bit2.windowMs}ms` : 'X');
  await sleep((bit2 ? bit2.windowMs : 3000) + 1600);   // 창을 **그냥 지나친다**
  const notes3 = await page.evaluate(() => (window.__notices || []).slice(-4));
  const stMiss = await page.evaluate(() => window.__fishState || null);
  ok(notes3.some((t) => /놓쳤다/.test(t)), '★★⑤ 창을 지나치면 **놓친다**(서버가 알아서 거둔다)', JSON.stringify(notes3.slice(-1)));
  ok(stMiss === null, '★⑤ 놓치면 찌가 사라진다');
  ok(!(await page.evaluate(() => window.__fishLast)), '★⑤ 놓쳤으면 물고기는 안 들어온다');
  await snap('fi-05-missed');

  // ── ⑥ 자리 이동 요구 — 물에서 멀면 못 던진다(서버가 판정) ────────────────
  await page.evaluate(() => window.__sendPrimary({ type: 'teleport_debug', x: 4000, y: 4000 }));
  await sleep(1200);
  await page.evaluate(() => { window.__notices = []; });
  await page.keyboard.press('Shift+KeyF');
  await sleep(1200);
  const notes4 = await page.evaluate(() => (window.__notices || []).slice(-3));
  ok(notes4.some((t) => /물에 닿지 않는다|물가로/.test(t)), '★⑥ 물에서 멀면 **서버가 거절**한다', JSON.stringify(notes4.slice(-1)));

  // ── ⑦ **손맛은 눈으로 확인한다** — 찌가 화면에 실제로 그려지는가 ───────────
  //   ★상태만 보면 안 된다. 이 레포가 배치 5 에서 배운 것: 계약이 다 맞는데 화면에 없을 수 있다.
  //     이번에도 실제로 그랬다 — 서버 좌표(존 로컬)를 절대 좌표로 안 옮겨 찌가 40만 px 밖에 그려졌다.
  //     상태·알림은 **전부 통과**했고 화면만 비어 있었다. 그래서 화소로 못 박는다.
  //   ★★그런데 화소 차이를 그냥 재면 **물 셰이더가 대신 대답한다**(1차 실측 13,905px — 찌가 아니라 물결이었다).
  //     ⇒ ⓐ 시계를 얼려 물결을 세우고(`__terrain19.freezeT` — 배치 21 이 쓰던 그 손잡이)
  //       ⓑ **대조군**(던지지 않은 두 장)을 먼저 재서 잡음 바닥을 알아낸 뒤
  //       ⓒ 찌가 그 바닥을 확실히 넘는지 본다. 문턱을 상수로 박지 않는다(산 아크 교훈 ③).
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [spot.bankX, spot.bankY]);
  await sleep(1400);
  await page.evaluate(() => window.__sendPrimary({ type: 'fish_reel' }));
  await sleep(500);
  const froze = await page.evaluate(() => {
    if (!window.__terrain19) return false;
    window.__terrain19.freezeT = 100; return true;
  });
  ok(froze, '★전제 — 시계를 얼렸다(물결이 서야 찌를 잰다)');
  await sleep(1200);
  const shotA = path.join(SHOTS, 'fi-06-nofloat-a.png');
  const shotB = path.join(SHOTS, 'fi-07-nofloat-b.png');
  const shotC = path.join(SHOTS, 'fi-08-float.png');
  await page.screenshot({ path: shotA }); await sleep(500);
  await page.screenshot({ path: shotB });
  shots.push(shotA, shotB, shotC);
  await page.keyboard.press('Shift+KeyF');
  let waited = null;
  for (let i = 0; i < 40 && !waited; i++) { await sleep(60); const q = await page.evaluate(() => window.__fishState || null); if (q && (q.state === 'wait' || q.state === 'bite')) waited = q; }
  // ★[T104 · T98 §4-c 문법] 화소를 재기 전에 **하늘과 바람을 끈다** — 재는 대상을 바꾸는 게 아니라
  //   잡음을 걷는 것이다(비/눈은 프레임마다 화소를 흔들고, 풀 흔들림도 같은 일을 한다).
  //   T98 이 11개에 넣은 그 두 줄인데 이 파일은 빠져 있었다 — `@pixel` 표를 세우며 드러났다.
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); 
    if (window.__terrain19) window.__terrain19.windOff = true; }).catch(() => {});
  await page.screenshot({ path: shotC });
  ok(!!waited, '★전제 — 화소 판정용 던지기가 성립했다', waited ? waited.state : 'X');
  {
    const PNG = require('pngjs').PNG;
    const rd = (f) => PNG.sync.read(fs.readFileSync(f));
    // ★★판정 상자 — **HUD 를 뺀다.** 1차 실측에서 대조군 412px·무게중심(227,275)이 나왔는데
    //   그건 찌가 아니라 좌상단 **알림 토스트와 RTT 핑**이었다(던지면 알림 글자가 바뀐다).
    //   HUD 는 DOM 이고 이 판정의 대상이 아니다 — e2e-nature 의 `BOX` 와 같은 규약으로 화면 가운데만 본다.
    const BOX = [440, 240, 900, 600];
    const diff = (A, B) => {
      let n = 0, sx = 0, sy = 0;
      for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
        const i = (y * A.width + x) * 4;
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 40) { n++; sx += x; sy += y; }
      }
      return { n, cx: n ? sx / n : 0, cy: n ? sy / n : 0 };
    };
    const A = rd(shotA), B = rd(shotB), C = rd(shotC);
    const base = diff(A, B);          // 대조군 — 안 던지고 찍은 두 장
    const withF = diff(B, C);         // 던진 뒤
    const dc = Math.hypot(withF.cx - A.width / 2, withF.cy - A.height / 2);
    console.log(`    판정 상자 [${BOX.join(',')}] (HUD 제외) — 대조군(안 던짐) ${base.n}px · 던진 뒤 ${withF.n}px` +
                ` · 무게중심(${Math.round(withF.cx)},${Math.round(withF.cy)}) 중앙에서 ${Math.round(dc)}px`);
    ok(base.n < 60, `★★대조군 — 얼린 화면은 거의 안 움직인다 (${base.n}px) = 아래 판정이 물결이나 HUD 를 재는 게 아니다`);
    ok(withF.n > Math.max(120, base.n * 3),
      `★★⑦ 던지면 화면이 **실제로 달라진다** = 찌가 그려진다 (${withF.n}px > 바닥 ${base.n}px × 3)`);
    ok(dc < 300, `★★⑦ 그 변화가 **내 앞 물 위**에 있다(중앙에서 ${Math.round(dc)}px < 300)`);
  }
  await page.evaluate(() => { if (window.__terrain19) window.__terrain19.freezeT = 0; });

  const jsErrs = errs.filter((e) => !/Failed to load resource/.test(e));
  const res404 = errs.filter((e) => /Failed to load resource/.test(e));
  ok(jsErrs.length === 0, '클라 JS 예외 0', jsErrs.slice(0, 2).join(' | '));
  if (res404.length) console.log(`    (참고: 정적 리소스 404 ${res404.length}건 — JS 예외가 아니다. 이 검사의 대상이 아니므로 따로 센다)`);
  console.log(`\n  스크린샷: ${shots.join(' ')}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  await browser.close(); shutdown();
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
