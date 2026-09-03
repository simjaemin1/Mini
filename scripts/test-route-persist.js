#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-route-persist.js — 교역로 캐시 영속 ==============================
//
// ★왜 [재민 확정 2026-09-01 · T42 ①]
//   T41 뒤 남은 **조각 최대**는 캐러밴 한 대의 콜드 A* 였다(실측 1,265~1,695ms · 조각 최대 242~482ms).
//   슬라이서는 조각보다 잘게 못 자르고, 계산 자체를 싸게 만들려면 `sim/path-core.js`(랩·서버 공용
//   정본)를 째야 한다 — 금지다. ⇒ **일어나지 않게** 한다: 한 번 판 길은 재기동해도 남는다.
//
// ★★"같은 답을 더 싸게"임을 증명하는 방법이 이 하네스의 핵심이다.
//   `path-core` 머리 주석이 이미 보증한다 — *"같은 두 점·같은 세계면 재계산이 같은 복도를
//   결정론으로 재현"*. 하지만 **보증은 밟아 봐야 검사가 된다**(T41 단조성 감사와 같은 규약).
//   ⇒ `?audit=N` 이 캐시에 든 경로를 **실제로 다시 계산해** 비교한다. 불일치 0 이어야 한다.
//
// 검사:
//   ① [상황] 첫 부팅에서 콜드 A* 가 실제로 일어나고 캐시가 쌓인다(아니면 아래가 자명 통과)
//   ② ★★재기동하면 **DB 에서 복원**된다 — 메모리 캐시가 부팅 직후부터 차 있다
//   ③ ★★감사 — 캐시 경로가 재계산과 **비트 동일**
//   ④ 무효화가 **메모리와 DB 를 둘 다** 비운다(한쪽만 지우면 다음 부팅에 썩은 길이 살아난다)
//   ⑤ 세계 서명이 바뀌면 통째로 버린다(지형·존 설정 교체 — 파일 mtime 을 건드려 시늉한다)
//   ⑥ 선계산이 사람 없을 때 완주하고, 그 뒤 경계에서 거의 안 판다
//   ⑦ ★★[T42-b] 선계산이 **루프를 놓아 준다** — 유예(사람이 나간 뒤)와 간격(걸음 사이)이 실제로 지켜진다
//
// ★★⑦ 이 왜 생겼나 [T42-b 2026-09-01]
//   T42 1차의 선계산은 "사람이 없으면" 매 프레임 한 쌍씩 쉬지 않고 돌았다. 실측하니 걸음 하나가
//   최대 2,393ms 이고 그게 30Hz 로 이어져 **루프가 70초 동안 사실상 100% 막혔다**.
//   그 사이 `savePlayer` 의 central 쓰기가 소켓으로 나가지도 못했고, `e2e-rumor ⑦`(복귀 브리핑)이
//   "부재 0일"로 깨졌다 — 이 하네스는 그걸 **못 잡았다**(사람이 없는 판만 재고 있었으니까).
//   ⇒ 배운 것: **사람이 없다 ≠ 할 일이 없다.** ⑦ 이 그 문장을 검사로 만든다.
//
// 실행: node scripts/test-route-persist.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const DAY_MS = parseInt(process.env.ROUTE_DAY_MS || '', 10) || 3000;
const DAYS = parseInt(process.env.ROUTE_DAYS || '', 10) || 5;
const SEED_C = '/tmp/slicer-seed-central.db', SEED_Z = '/tmp/slicer-seed-zone.db';
const CDB = '/tmp/routep-c.db', ZDB = '/tmp/routep-z.db';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lg = fs.createWriteStream(`/tmp/routep-${env.ZONE_ID || 'central'}.log`, { flags: 'w' });
  p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(u, n = 300) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
// ★★keep-alive 경합 때문에 러너 안에서 두 번 죽었다(`HeadersTimeoutError`).
//   왜: 서버 루프가 A* 한 걸음(최대 2.6초) 동안 막히면 node 의 keep-alive 시계(기본 5초)가 늦게 울려
//   **클라이언트가 막 쓴 소켓을 서버가 닫는다**. 그러면 그 요청은 답을 못 받고 undici 기본 300초를 기다린다.
//   ⇒ 폴링은 소켓을 **재사용하지 않는다**(`connection: close`) + 20초 상한 + 재시도.
//   ⚠판정을 무르게 만들지 않는다: 재시도해도 서버가 진짜 죽었으면 아래 ⑥ "선계산이 완주한다"가
//     그대로 떨어진다(루프가 150회를 다 돌고 warmLeft>0 으로 끝난다). 가리는 게 아니라 **끊긴 소켓만** 뺀다.
let _netRetry = 0;
async function jfetch(u, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { last = e; _netRetry++; await sleep(300); }
  }
  throw last;
}
const jget = async (u) => (await jfetch(u)).json();
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };

// ★DB 를 **지우지 않고** 다시 띄운다 — 그게 이 하네스의 주제(재기동해도 남는가)다.
// ★①~⑤ 는 **선계산을 끄고**(`VILLAGE_ROUTE_WARM=0`) 잰다. 안 끄면 무효화 직후 선계산이 곧바로
//   다시 채워서 "비웠는가"를 못 잰다(첫 판이 그랬다: 81 → 1). 선계산 자체는 ⑥에서 켜고 잰다.
async function up(warm, extra) {
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) return false;
  boot('zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    VILLAGE_ROUTE_WARM: warm ? '1' : '0',
  }, extra || {}));
  return waitHttp(`http://localhost:${ZPORT}/health`, 300);
}
async function down() { killAll(); await sleep(4000); }
async function runDays(n) {
  for (let i = 0; i < 400; i++) {
    await sleep(2000);
    const j = await jget(`http://localhost:${ZPORT}/perf`);
    if (j.econTick && j.econTick.days >= n) return j;
  }
  return null;
}

(async () => {
  console.log('\n=== 교역로 캐시 영속 — 한 번 판 길은 재기동해도 남는다 ===');
  if (!fs.existsSync(SEED_Z)) { console.log('  ✗ 씨앗 DB 없음 — `node scripts/test-tick-slicer.js` 를 먼저 한 번 돌려라'); process.exit(1); }
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);

  // ── 1판: 첫 부팅 — 콜드가 쌓인다 ────────────────────────────────────────
  if (!await up()) { console.log('  ✗ 1판 기동 실패'); process.exit(1); }
  const P1 = await runDays(DAYS);
  const R1 = await jget(`http://localhost:${ZPORT}/routedbg`);
  const A1 = await jget(`http://localhost:${ZPORT}/routedbg?audit=8`);
  const pr1 = P1 && P1.econTick ? P1.econTick.probe : {};
  console.log(`\n  1판(첫 부팅)  콜드 ${pr1.routeCold} · 적중 ${pr1.routeHit} · 최대 ${pr1.routeMax}ms · 캐시 메모리 ${R1.mem} · DB ${R1.db}`);
  ok(pr1.routeCold >= 5, '① [상황] 첫 부팅에서 콜드 A* 가 실제로 일어난다', `${pr1.routeCold}회`);
  ok(R1.db >= pr1.routeCold, '① 콜드로 판 길이 **DB 에 남는다**', `DB ${R1.db}행 ≥ 콜드 ${pr1.routeCold}`);
  ok(A1.audit && A1.audit.n >= 5, '① [상황] 감사가 실제로 돌았다(재계산 표본)', `${A1.audit ? A1.audit.n : 0}쌍`);
  ok(A1.audit && A1.audit.mismatch === 0, '③ ★★캐시 경로가 재계산과 **비트 동일**',
    A1.audit ? `불일치 ${A1.audit.mismatch}/${A1.audit.n}${A1.audit.first ? ' · 첫 사례 ' + A1.audit.first : ''}` : '감사 실패');
  // ★★[T42-b] **기본값이 안전한가**를 여기서 한 번 못 박는다(이 판은 오버라이드가 없다).
  //   ⑦ 은 재기 좋게 예산을 줄여 잰다 — 그러면 "실제로 배포되는 값"은 아무도 안 본 채 지나간다.
  //   0 이면 T42 1차의 그 동작(매 프레임 쉼 없이)으로 돌아간다. 그 회귀를 이 한 줄이 막는다.
  console.log(`  기본 예산  간격 ${R1.warmGapMs}ms · 유예 ${R1.warmIdleMs}ms · 선계산 ${R1.warmOn ? '켬' : '끔'}`);
  ok(R1.warmGapMs >= 100 && R1.warmIdleMs >= 20000, '① ★★기본 예산이 안전하다(간격 ≥100ms · 유예 ≥20초)',
    `간격 ${R1.warmGapMs}ms · 유예 ${R1.warmIdleMs}ms`);
  // ★★유예는 **시계 하나로는 모자랐다**(러너에서 부재 창이 13초라 꼬리에 데우기가 끼어들었다).
  //   그래서 시계 말고 **일 자체**를 본다: `savePlayer` 가 돌려주는 Promise 를 세는 술어.
  //   그 배선이 빠지면 유예가 조용히 시계 하나로 되돌아간다 — 이 줄이 그걸 막는다.
  ok(typeof R1.ioBusy === 'boolean' && typeof R1.ioQuietMs === 'number',
    '① ★★날아가는 central 쓰기 술어가 실제로 배선돼 있다(빠지면 유예가 시계 하나로 되돌아간다)',
    `ioBusy=${R1.ioBusy} · 마지막 착지 뒤 ${R1.ioQuietMs}ms`);
  const dbAfter1 = R1.db;
  await down();

  // ── 2판: 같은 DB 로 재기동 — 복원되는가 ─────────────────────────────────
  if (!await up()) { console.log('  ✗ 2판 기동 실패'); process.exit(1); }
  const R2boot = await jget(`http://localhost:${ZPORT}/routedbg`);
  console.log(`  2판(재기동 직후)  캐시 메모리 **${R2boot.mem}** · DB ${R2boot.db}   ← 부팅하자마자 차 있어야 한다`);
  ok(R2boot.primed >= dbAfter1, '② ★★재기동 직후 **DB 에서 물려받았다**', `물려받은 ${R2boot.primed}쌍 ≥ 1판 DB ${dbAfter1}`);
  const P2 = await runDays(DAYS);
  const R2 = await jget(`http://localhost:${ZPORT}/routedbg`);
  const pr2 = P2 && P2.econTick ? P2.econTick.probe : {};
  console.log(`  2판(${DAYS}일 뒤)  콜드 ${pr2.routeCold}(그 중 물려받은 쌍 ${pr2.routeColdPrimed}) · 적중 ${pr2.routeHit}`);
  ok(pr2.routeHit > 0, '② 복원된 캐시가 실제로 **적중한다**', `적중 ${pr2.routeHit}`);
  // ★"콜드가 줄었다"로는 못 잰다 — 세계가 계속 굴러 **다른 쌍**이 열리므로 두 판의 기간이 같은 기간이 아니다
  //   (첫 판에서 52 → 80 이 나왔다). 정확히 물을 수 있는 것은 이것이다: **물려받은 쌍을 다시 팠는가.**
  ok(pr2.routeColdPrimed === 0, '② ★★물려받은 쌍은 **한 번도 다시 안 판다**(영속이 헛일이 아니다)',
    `다시 판 물려받은 쌍 ${pr2.routeColdPrimed}/${R2boot.primed}`);

  // ── ④ 무효화가 둘 다 비우는가(진짜 훅을 부른다) ─────────────────────────
  const before = await jget(`http://localhost:${ZPORT}/routedbg`);
  const inv = await jget(`http://localhost:${ZPORT}/routedbg?invalidate=1`);
  const after = await jget(`http://localhost:${ZPORT}/routedbg`);
  ok(before.mem > 0 && before.db > 0, '④ [상황] 무효화 전에 캐시가 실제로 차 있다', `메모리 ${before.mem} · DB ${before.db}`);
  ok(after.mem === 0, '④ 무효화가 **메모리**를 비운다', `${before.mem} → ${after.mem}`);
  ok(after.db === 0, '④ ★★무효화가 **DB 도** 비운다(한쪽만 지우면 다음 부팅에 썩은 길이 살아난다)', `${before.db} → ${after.db}`);
  await down();

  // ── ⑤ 세계 서명 — 지형 파일이 바뀌면 통째로 버린다 ──────────────────────
  if (!await up()) { console.log('  ✗ 3판 기동 실패'); process.exit(1); }
  await runDays(2);
  const R3 = await jget(`http://localhost:${ZPORT}/routedbg`);
  ok(R3.db > 0, '⑤ [상황] 서명 검사 전에 캐시가 다시 쌓였다', `DB ${R3.db}`);
  await down();
  const TF = path.join(ROOT, 'server', 'hanbando-terrain.json');
  const st0 = fs.statSync(TF);
  fs.utimesSync(TF, st0.atime, new Date(st0.mtimeMs + 60000));   // ★내용은 그대로 — **mtime 만** 민다(지형 교체 시늉)
  try {
    if (!await up()) { console.log('  ✗ 4판 기동 실패'); process.exit(1); }
    const R4 = await jget(`http://localhost:${ZPORT}/routedbg`);
    console.log(`  4판(서명 바뀜)  물려받은 ${R4.primed} · 캐시 메모리 ${R4.mem} · 서명 ${String(R4.sig).slice(0, 60)}…`);
    // ★메모리 크기로는 못 잰다 — 부팅 뒤 몇 초 사이에 교역이 새 길을 판다. **물려받은 수**가 답이다.
    ok(R4.primed === 0, '⑤ ★★세계 서명이 다르면 옛 경로를 **한 쌍도 안 물려받는다**', `물려받은 ${R4.primed}쌍`);
    await down();
  } finally {
    fs.utimesSync(TF, st0.atime, st0.mtime);   // ★원상 복구 — 레포 파일을 바꾼 채로 두지 않는다
  }
  ok(Math.round(fs.statSync(TF).mtimeMs) === Math.round(st0.mtimeMs), '⑤ [정리] 지형 파일 mtime 을 되돌렸다');

  // ── ⑥⑦ 선계산 — 사람이 없을 때 스스로 데우되, **루프를 놓아 가며** 데운다 ──
  // ★간격은 줄여서(60ms) 완주를 재고, **유예는 오히려 넉넉히**(90초) 잡는다.
  //   왜 넉넉히: 유예는 **큐가 선 순간**부터 흐르는데 기동이 30초 걸리는 판이 있어서,
  //   짧게 잡으면 하네스가 들여다보기도 전에 창이 닫힌다(실측 — 관측 0회로 떨어졌다).
  //   기본값(250 / 30,000)은 ① 이 따로 확인한다.
  const WGAP = 60, WIDLE = 90000;
  if (!await up(true, { VILLAGE_ROUTE_WARM_GAP_MS: String(WGAP), VILLAGE_ROUTE_WARM_IDLE_MS: String(WIDLE) })) {
    console.log('  ✗ 5판 기동 실패'); process.exit(1);
  }
  // ★유예 시계는 **큐가 선 순간**부터 흐른다(`_routeWarmBuild`). /health 가 뜬 시각이 아니다 —
  //   마을 시뮬 init 이 더 늦게 끝나므로, 부팅 시각으로 재면 판정이 기동 속도에 흔들린다.
  let W0 = await jget(`http://localhost:${ZPORT}/routedbg`);
  for (let i = 0; i < 60 && !(W0.warmTotal > 0); i++) { await sleep(500); W0 = await jget(`http://localhost:${ZPORT}/routedbg`); }
  const tQ = Date.now();
  ok(W0.warmTotal > 20, '⑥ [상황] 데울 쌍이 실제로 잡혔다(마을마다 가까운 N곳)', `${W0.warmTotal}쌍 · 남은 ${W0.warmLeft}`);
  ok(W0.warmGapMs === WGAP && W0.warmIdleMs === WIDLE, '⑦ [상황] 이 판의 예산이 실제로 먹혔다(사본이 아니라 서버가 말한다)',
    `간격 ${W0.warmGapMs}ms · 유예 ${W0.warmIdleMs}ms`);

  // ── ⑦b **유예** — 사람이 나간(=부팅한) 직후에는 한 쌍도 안 데운다.
  //   왜 이 줄이 있나: 나간 사람의 저장이 아직 소켓 밖으로 못 나갔다. 그때 A* 를 돌리면 그 쓰기가
  //   루프 순번을 못 받는다 — 그게 `e2e-rumor ⑦`("부재 0일")을 깨뜨린 그 자리다.
  //   ★★밖에서 시계로 재면 안 된다 — 유예는 **큐가 선 순간**부터 흐르는데 그 순간을 밖에서 모른다
  //     (`up()` 가 /health 를 기다린 뒤 마을 init 이 더 걸린다). 한 판이 그것 때문에 1쌍 차이로 떨어졌다.
  //     ⇒ 서버가 **남은 유예**(`warmIdleLeftMs`)를 그대로 말하고, 그게 남아 있는 동안만 판정한다.
  let idleN = 0, idleBad = 0, idleWorst = '';
  for (let i = 0; i < 80; i++) {
    const W = await jget(`http://localhost:${ZPORT}/routedbg`);
    if (!(W.warmIdleLeftMs > 1000)) break;      // 유예가 곧 끝난다 — 여기서 멈춘다
    idleN++;
    if (W.warmLeft !== W.warmTotal) { idleBad++; if (!idleWorst) idleWorst = `남은 ${W.warmLeft}/${W.warmTotal} (유예 ${W.warmIdleLeftMs}ms 남았는데)`; }
    await sleep(400);
  }
  ok(idleN >= 8, '⑦ [상황] 유예 창을 실제로 여러 번 들여다봤다(자명 통과 금지)', `${idleN}회 · 간격 400ms`);
  ok(idleN * 400 / WGAP > 30, '⑦ [상황] 그 창이 충분히 넓다(유예가 없었다면 수십 쌍은 데워졌을 창)',
    `${idleN * 400}ms ÷ ${WGAP}ms = 약 ${Math.round(idleN * 400 / WGAP)}쌍`);
  ok(idleBad === 0, '⑦ ★★유예가 지켜진다 — 그 창 안에서는 **한 쌍도 안 데운다**',
    idleBad ? `${idleBad}/${idleN}회 위반 · 첫 사례 ${idleWorst}` : `${idleN}회 전부 0쌍`);

  // ── ⑦c 데우는 동안 **서버가 계속 대답하는가**. /health 를 100ms 로 두드려 응답 간격 최대를 잰다.
  //   ⚠한 걸음(A*) 동안은 어차피 막힌다 — 못 줄인다(정본 수술 금지 · 재개 가능 A* 는 회부).
  //   그래서 판정은 "**걸음보다 오래** 막히지 않는다" 다: 걸음이 끝나면 곧바로 대답해야 한다.
  let hMax = 0, hLast = Date.now(), hN = 0;
  let hStop = false;
  const hPing = (async () => {
    while (!hStop) {
      try { await fetch(`http://localhost:${ZPORT}/health`, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) }); const t = Date.now(); hN++; if (t - hLast > hMax) hMax = t - hLast; hLast = t; }
      catch (e) { /* 막혀서 실패한 것도 간격에 그대로 잡힌다 */ }
      await sleep(100);
    }
  })();
  const tWarm = Date.now();
  let W1 = W0;
  for (let i = 0; i < 150 && W1.warmLeft > 0; i++) { await sleep(2000); W1 = await jget(`http://localhost:${ZPORT}/routedbg`); }
  const warmMs = Date.now() - tWarm;
  hStop = true; await hPing;
  // ★선계산의 **대가**도 같이 적는다 — A* 한 번이 100~2,400ms 라 그 걸음 동안은 루프가 막힌다.
  //   그래서 사람이 없고 + 유예가 지나고 + 걸음 사이를 쉰 뒤에만 돈다. 숨기지 않고 수치로 남긴다.
  const WP = await jget(`http://localhost:${ZPORT}/perf`);
  const wRouteMax = (WP.econTick && WP.econTick.probe) ? (WP.econTick.probe.routeMax | 0) : 0;
  console.log(`  5판(선계산)  ${W0.warmTotal}쌍 중 남은 ${W1.warmLeft} · 캐시 메모리 ${W1.mem} · DB ${W1.db} · 완주 ${(warmMs / 1000).toFixed(0)}초`);
  console.log(`    ↳ 데우는 동안 이벤트 루프 최대 막힘 ${WP.loop ? WP.loop.max : '?'}ms (p99 ${WP.loop ? WP.loop.p99 : '?'}) · 한 걸음 최대 ${wRouteMax}ms`);
  console.log(`    ↳ /health 응답 간격 최대 ${hMax}ms (${hN}회 두드림) — **걸음보다 오래 막히면 안 된다**`);
  console.log(`    ↳ 폴링 재시도 ${_netRetry}회 (끊긴 소켓 재접속 — 0이 정상, 러너 부하에서만 는다)`);
  ok(W1.warmLeft === 0, '⑥ ★★사람이 없는 동안 **선계산이 완주한다**', `남은 ${W1.warmLeft}/${W0.warmTotal}`);
  ok(warmMs >= W0.warmTotal * WGAP * 0.7, '⑦ ★간격이 실제로 지켜진다(걸음 사이를 쉬었다)',
    `완주 ${warmMs}ms ≥ ${W0.warmTotal}쌍 × ${WGAP}ms × 0.7 = ${Math.round(W0.warmTotal * WGAP * 0.7)}ms`);
  ok(hN > 100, '⑦ [상황] /health 를 실제로 여러 번 두드렸다(자명 통과 금지)', `${hN}회`);
  ok(wRouteMax > 0, '⑦ [상황] 데우는 동안 A* 가 실제로 돌았다(자명 통과 금지)', `한 걸음 최대 ${wRouteMax}ms`);
  ok(hMax <= wRouteMax + 1500, '⑦ ★★데우는 동안에도 서버가 대답한다 — **한 걸음보다 오래 막히지 않는다**',
    `응답 간격 최대 ${hMax}ms ≤ 걸음 ${wRouteMax}ms + 1500ms`);
  ok(W1.mem >= W0.warmTotal, '⑥ 데운 만큼 캐시에 들어갔다', `메모리 ${W1.mem} ≥ ${W0.warmTotal}`);
  const A6 = await jget(`http://localhost:${ZPORT}/routedbg?audit=8`);
  ok(A6.audit && A6.audit.mismatch === 0, '⑥ ★선계산한 경로도 재계산과 **비트 동일**', A6.audit ? `불일치 ${A6.audit.mismatch}/${A6.audit.n}` : '감사 실패');
  // ★그리고 그 뒤 게임일 경계에서는 팔 길이 없어야 한다 — 이 배치의 목적 그 자체다.
  //   ⚠`routeCold` 는 **누계**다(선계산이 판 579 가 들어 있다) — 완주 시점부터의 **증분**으로 잰다.
  //   누계로 재면 "선계산이 판 것"을 "경계에서 판 것"으로 오독한다(첫 판이 그랬다: 585 회).
  const P6a = await jget(`http://localhost:${ZPORT}/perf`);
  const cold0 = (P6a.econTick && P6a.econTick.probe) ? P6a.econTick.probe.routeCold : 0;
  const day0 = (P6a.econTick && P6a.econTick.days) ? P6a.econTick.days : 0;
  const P6 = await runDays(day0 + 3);
  const pr6 = P6 && P6.econTick ? P6.econTick.probe : {};
  const dCold = (pr6.routeCold || 0) - cold0;
  console.log(`  5판(선계산 뒤 3일)  콜드 증분 **${dCold}** (누계 ${cold0} → ${pr6.routeCold}) · 적중 ${pr6.routeHit}`
    + ` · 조각 최대 ${P6 && P6.econTick.last ? P6.econTick.last.maxChunk + 'ms(' + P6.econTick.last.maxChunkAt + ')' : '?'}`);
  ok(dCold <= 5, '⑥ ★★선계산 뒤 경계에서 **거의 안 판다**', `3일 동안 새로 판 길 ${dCold}쌍`);
  ok(P6 && P6.econTick.last && P6.econTick.last.maxChunkAt !== 'caravan', '⑥ ★★가장 큰 조각이 더는 **캐러밴이 아니다**',
    P6 && P6.econTick.last ? `${P6.econTick.last.maxChunk}ms(${P6.econTick.last.maxChunkAt})` : '?');
  await down();

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
