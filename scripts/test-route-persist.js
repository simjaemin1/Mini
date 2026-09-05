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
// ★[T85] `ms` — 상한을 부르는 쪽이 정한다. 재개형 감사(⑧)는 579쌍을 **다시 파므로** 20초로는 모자란다
//   (그 한 번을 위해 폴링 상한을 통째로 늘리면 ⑥⑦ 의 '끊김 감지'가 무뎌진다 — 그래서 인자다).
async function jfetch(u, tries = 4, ms = 20000) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fetch(u, { headers: { connection: 'close' }, signal: AbortSignal.timeout(ms) }); }
    catch (e) { last = e; _netRetry++; await sleep(300); }
  }
  throw last;
}
const jget = async (u, ms) => (await jfetch(u, 4, ms)).json();
// ★★[T89] **진짜 접속 하나** — "접속 중에도 데운다"를 재려면 사람이 실제로 붙어 있어야 한다.
//   브라우저를 띄우지 않는다(이 하네스는 `test-*` 다) — `ws` 로 존에 그대로 들어간다
//   (`test-guest-identity` 와 같은 문법 · 서버가 보는 것은 똑같은 플레이어다).
const WebSocket = require('ws');
function connectWs(qs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${qs}`);
    const st = { ws, welcome: null, hb: null };
    const t = setTimeout(() => reject(new Error('welcome timeout')), 20000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome' && !st.welcome) { st.welcome = m; clearTimeout(t); resolve(st); }
    });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
    // ★★심장박동 — **없으면 30초 만에 쫓겨난다**(`zone.js`: "player: 30초간 input/ping 없으면 terminate").
    //   실측으로 걸렸다: 30초 창을 재는데 39/44 표본에서만 사람이 보였다 — 정책이 아니라
    //   **내 하네스 손님이 조용해서 쫓겨난 것**이었다. 진짜 클라도 ping 을 보낸다(사본 아님 · 같은 규약).
    st.hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 2000);
  });
}
const closeWs = (st) => new Promise((r) => { if (st.hb) clearInterval(st.hb); try { st.ws.on('close', r); st.ws.close(); } catch (e) { r(); } setTimeout(r, 1500); });
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

  // ── ⑦b **부팅 유예** — 큐가 선 직후에는 한 쌍도 안 데운다.
  //   ★★[T89] 유예의 **뜻이 좁아졌다**: 종전엔 "마지막 사람이 나간 지"였고 지금은 "**부팅한 지**"다.
  //     T42-b 가 그 유예에 준 이유는 두 갈래였다 — ① 막 나간 사람이 곧바로 돌아온다 ② 재기동 = 접속이 몰리는 때.
  //     ①은 한 걸음이 2.4초일 때만 아팠고 T85 뒤 31ms 다 ⇒ 지워졌다. ②는 여전히 참이라 남았다.
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
  ok(idleBad === 0, '⑦ ★★부팅 유예가 지켜진다 — 그 창 안에서는 **한 쌍도 안 데운다**',
    idleBad ? `${idleBad}/${idleN}회 위반 · 첫 사례 ${idleWorst}` : `${idleN}회 전부 0쌍`);

  // ── ★★[T89 2026-09-04 재민 확정] ⑦d **접속 중에도 데운다** ─────────────────────
  //   T42-b 는 *"사람이 있으면 멈춘다"* 였다 — 한 걸음이 최대 2,393ms 라 사람이 붙어 있을 때 데우면
  //   경계 스파이크를 평시 스파이크로 바꾸는 것뿐이었기 때문이다. T85 가 그 전제를 없앴다(최악 31ms).
  //   ⇒ 이 절은 그 정책 변경이 **실제로 일어났는지**를 잰다. 자명 통과 금지가 이 절의 전부다:
  //     ⓐ 사람이 **정말로** 붙어 있는지(서버가 `humans` 로 말한다 — 하네스가 세지 않는다)
  //     ⓑ 그 창 안에서 남은 쌍이 **실제로 줄었는지**(종전 정책이면 0이다 — 그게 대조다)
  //     ⓒ 그러는 동안 한 조각이 **예산 안**인지(T85 가 산 그것을 여기서도 지키는지)
  //   ⚠부팅 유예가 끝나기를 **먼저** 기다린다 — 유예 안에서 재면 "안 데운다"가 정책 때문인지
  //     유예 때문인지 갈리지 않는다(그러면 이 절이 ⑦b 를 두 번 재는 꼴이다).
  for (let i = 0; i < 300; i++) {
    const W = await jget(`http://localhost:${ZPORT}/routedbg`);
    if (!(W.warmIdleLeftMs > 0)) break;
    await sleep(Math.min(2000, W.warmIdleLeftMs + 100));
  }
  let wsA = null;
  try { wsA = await connectWs('name=%EB%8D%B0%EC%9A%B0%EA%B8%B0%EC%86%90%EB%8B%98'); await sleep(1500); } catch (e) { wsA = null; }
  ok(!!(wsA && wsA.welcome), '⑦d [상황] 사람 하나가 **실제로 접속했다**(가짜 플래그가 아니라 진짜 ws)',
    wsA && wsA.welcome ? `pid ${wsA.welcome.pid || wsA.welcome.playerId || '?'}` : '접속 실패');
  const Wc0 = await jget(`http://localhost:${ZPORT}/routedbg`);
  ok((Wc0.humans | 0) >= 1, '⑦d [상황] 서버도 **사람이 있다**고 말한다(그래야 아래가 뜻을 갖는다)', `humans=${Wc0.humans}`);
  ok(Wc0.warmLeft > 20, '⑦d [상황] 아직 데울 쌍이 넉넉히 남아 있다', `남은 ${Wc0.warmLeft}/${Wc0.warmTotal}`);
  //   ★§0-ⓑ 표를 여기서 만든다 — "접속 중 워밍의 비용"은 데운 쌍 수만으로는 못 읽는다.
  //     `ioBusy` 가 참인 비율(=정책이 아니라 **일**이 멈춘 비율)과 `pathDrop`(다른 탐색이 슬롯을 뺏은 수)을
  //     같이 재야 왜 느린지가 갈린다. 서버가 말하는 값만 쓴다(하네스가 세지 않는다 · 사본 금지).
  const P0c = await jget(`http://localhost:${ZPORT}/perf`);
  const pr0 = (P0c.econTick && P0c.econTick.probe) || {};
  const tC = Date.now();
  let Wc = Wc0, humanSeen = 0, look = 0, busySeen = 0;
  let hcMax = 0, hcLast = Date.now(), hcN = 0, hcStop = false;
  const hcPing = (async () => {
    while (!hcStop) {
      try { await fetch(`http://localhost:${ZPORT}/health`, { headers: { connection: 'close' }, signal: AbortSignal.timeout(30000) });
        const t = Date.now(); hcN++; if (t - hcLast > hcMax) hcMax = t - hcLast; hcLast = t; } catch (e) {}
      await sleep(100);
    }
  })();
  for (let i = 0; i < 80 && (Date.now() - tC) < 30000; i++) {
    await sleep(400);
    Wc = await jget(`http://localhost:${ZPORT}/routedbg`);
    look++; if ((Wc.humans | 0) >= 1) humanSeen++; if (Wc.ioBusy) busySeen++;
    if (Wc0.warmLeft - Wc.warmLeft >= 20) break;
  }
  hcStop = true; await hcPing;
  const warmedWithHuman = Wc0.warmLeft - Wc.warmLeft;
  const secC = Math.max(1, Math.round((Date.now() - tC) / 1000));
  const P1c = await jget(`http://localhost:${ZPORT}/perf`);
  const prC = (P1c.econTick && P1c.econTick.probe) || {};
  console.log(`  §0-ⓑ 접속 중 워밍 — ${secC}초 · 데운 쌍 ${warmedWithHuman} (${(warmedWithHuman / secC).toFixed(2)}쌍/초)`);
  console.log(`      ioBusy 참 ${busySeen}/${look} (${Math.round(busySeen / Math.max(1, look) * 100)}%) · pathJobs +${(prC.pathJobs | 0) - (pr0.pathJobs | 0)} · pathDrop +${(prC.pathDrop | 0) - (pr0.pathDrop | 0)}`);
  console.log(`      /health 응답 간격 최대 ${hcMax}ms (${hcN}회) — 종전 T42-b 실측 2,687ms`);
  // ⚠**내내**로 잰다(느슨하게 풀지 않는다). 한때 39/44 로 떨어졌는데 원인은 정책이 아니라
  //   조용한 손님이 30초 만에 쫓겨난 것이었다(`connectWs` 의 심장박동 주석) — 그 자리를 고쳤다.
  ok(humanSeen === look && look >= 5,
    '⑦d [상황] 재는 **내내** 사람이 붙어 있었다(중간에 끊겼으면 이 절은 헛것이다)',
    `${humanSeen}/${look}회`);
  ok(warmedWithHuman > 0, '★★⑦d **접속 중에도 데운다** — 종전 정책이었다면 0이다(T42 회부 2 종결)',
    `${secC}초 동안 ${warmedWithHuman}쌍 (남은 ${Wc0.warmLeft} → ${Wc.warmLeft})`);
  ok(hcMax <= 1500, '★★⑦d 사람이 붙어 있는 동안 **서버가 계속 대답한다**(종전 한 걸음 2,687ms → 조각)',
    `/health 응답 간격 최대 ${hcMax}ms`);
  {
    const Pc = await jget(`http://localhost:${ZPORT}/perf`);
    const pr = (Pc.econTick && Pc.econTick.probe) || {};
    const slice = Pc.sliceMs | 0;
    ok((pr.pathJobs | 0) > 0, '⑦d [상황] 재개형으로 판 길이 실제로 있다', `${pr.pathJobs}쌍`);
    ok((pr.pathSliceMax | 0) <= slice + (pr.pathChunkMax | 0) + 20,
      '★⑦d 접속 중에도 **한 조각이 예산 안**이다(T85 가 산 것을 정책이 안 깎았다)',
      `한 조각 최대 ${pr.pathSliceMax}ms ≤ 예산 ${slice}ms + 알갱이 ${pr.pathChunkMax}ms + 20ms`);
  }
  // ⑦e ★`ioBusy` 술어는 **그대로다** — 지금 밀려 있는 쓰기가 있으면 손을 뗀다.
  //   (정책을 풀면서 이것까지 풀면 `e2e-rumor ⑦`("부재 0일")이 되돌아온다.)
  {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const body = (() => { const i = src.indexOf('function _routeWarmStep'); if (i < 0) return '';
      const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j > 0 ? j : src.length); })();
    ok(body.length > 300, '⑦e [상황] `_routeWarmStep` 본문을 통째로 잡았다(창이 짧으면 아래가 헛것이다)', `${body.length}자`);
    ok(/d\.ioBusy && d\.ioBusy\(\)/.test(body), '★★⑦e `ioBusy` 술어가 **살아 있다** — 밀려 있는 쓰기가 있으면 손을 뗀다');
    ok(!/isNpc\)\s*\{[^}]*return/.test(body), '★⑦e 사람 존재로 **멈추는 줄이 없다**(정책이 실제로 풀렸다 — 주석이 아니라 코드로)');
    ok(/ROUTE_WARM_GAP_MS/.test(body) && /ROUTE_WARM_IDLE_MS/.test(body),
      '⑦e 두 수(유예·간격)는 **그대로 쓰인다** — 새 손잡이 0');
  }
  if (wsA) await closeWs(wsA);

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
  ok(W1.warmLeft === 0, '⑥ ★★선계산이 **완주한다**(★[T89] 접속 여부와 무관하게)', `남은 ${W1.warmLeft}/${W0.warmTotal}`);
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

  // ── ★★[T85 2026-09-03] ⑧ 재개 가능 A* — **정본 시드 세계 전 쌍이 비트 동일** ──────────────
  //   ★왜 여기인가: 579쌍은 **이 세계가 실제로 쓰는 쌍**이다(선계산 큐가 세운 그것).
  //     합성 격자로 재면 그건 다른 세계를 잰 것이다(족보: 계측기도 사본 금지).
  //     `sim/_path-core-test.js`(→ `scripts/test-path-core.js`)가 커널의 **형태**를 재고,
  //     여기서는 **이 세계의 전 쌍**을 잰다. 둘이 짝이다.
  //   ★`budget=1` = 한 노드마다 놓았다 이어 간다 = 순서 보존의 가장 센 증거.
  {
    const RS = await jget(`http://localhost:${ZPORT}/routedbg?resume=${W0.warmTotal + 50}&budget=1`, 900000);
    const R = RS.resume || {};
    ok((R.n | 0) >= W0.warmTotal, '⑧ [상황] 전 쌍을 실제로 다시 팠다(표본이 아니다)', `${R.n}쌍 / 선계산 ${W0.warmTotal}쌍`);
    ok((R.maxSlices | 0) > 100, '⑧ [상황] 예산 1노드가 실제로 잘게 쪼갰다 — 한 번에 끝났으면 자명 통과다',
      `한 쌍 최대 ${R.maxSlices}조각 · 합 ${R.slices}조각`);
    ok(R.mismatch === 0, '★★⑧ **전 쌍이 비트 동일** — 재개형이 동기 문과 같은 길을 낸다',
      `불일치 ${R.mismatch}/${R.n}${R.first ? ' · 첫 사례 ' + R.first : ''}`);
  }

  // ── ⑨ 한 조각이 **예산 안**에 든다 — 이 카드의 수(數) ────────────────────────
  {
    const P9 = await jget(`http://localhost:${ZPORT}/perf`);
    const pr = (P9.econTick && P9.econTick.probe) || {};
    const slice = P9.sliceMs | 0;
    ok((pr.pathJobs | 0) > 0, '⑨ [상황] 재개형으로 판 길이 실제로 있다(자명 통과 금지)', `${pr.pathJobs}쌍`);
    ok(pr.pathStepNodes > 0, '⑨ [상황] 노드 알갱이가 배선돼 있다', `${pr.pathStepNodes}노드마다 시계`);
    // ★한 조각(=재개형 한 번의 체류)의 상한 = 예산 + **알갱이 하나**. 알갱이 하나는 따로 잰다(아래).
    //   ⚠`0` 이면 재개형이 한 번도 양보 안 한 것 = 이 검사가 뜻이 없다 ⇒ 위 상황 assert 가 그걸 막는다.
    ok((pr.pathChunkMax | 0) <= 60, '⑨ 알갱이 하나(32노드)의 최악이 작다 — 이게 초과분의 전부다',
      `알갱이 최대 ${pr.pathChunkMax}ms`);
    ok((pr.pathSliceMax | 0) <= slice + (pr.pathChunkMax | 0) + 20, '★★⑨ 재개형 A* 의 **한 조각이 예산 안**이다(종전 1,265~1,695ms)',
      `한 조각 최대 ${pr.pathSliceMax}ms ≤ 예산 ${slice}ms + 알갱이 ${pr.pathChunkMax}ms + 20ms`);
    ok((pr.pathDrop | 0) >= 0, '⑨ (계측) 슬롯을 뺏겨 버린 중간 상태', `${pr.pathDrop}회`);
  }

  // ── ⑩ **동시 둘 금지**가 소스에 서 있다 ────────────────────────────────────
  //   격자 scratch 는 하나(gen-스탬프 하나 · `came` 는 스탬프도 없음)라 두 탐색이 번갈아 쓰면 깨진다
  //   (`sim/_path-core-test.js ④b` 가 그 깨짐을 실측으로 보인다). ⇒ 슬롯이 하나여야 한다.
  {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
    const slots = (src.match(/let _pathJob\b/g) || []).length;
    ok(slots === 1, '⑩ ★재개형 슬롯이 **하나**다(`_pathJob`)', `선언 ${slots}개`);
    ok(/_routeBegin\(x0, y0, x1, y1\) \{[\s\S]{0,900}?if \(_pathJob\) \{ _probe\.pathDrop\+\+; _pathJob = null; \}/.test(src),
      '★★⑩ **새 탐색이 시작되면 세워 둔 것을 버린다** — 동기 문(전쟁·귀환·감사)이 30Hz 로 끼어들어도 안 섞인다');
    ok(!/PathCore\.routePathBegin/.test(src.replace(/function _routeBegin[\s\S]*?\n\}/, '')),
      '⑩ 재개형 문을 여는 자리가 `_routeBegin` **하나**다(사본 0)');
  }
  await down();

  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
