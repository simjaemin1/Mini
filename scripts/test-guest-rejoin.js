#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-guest-rejoin.js — 게스트 재접속이 몸을 잃는가 (B-6) ============
//
// ★왜 [재민 확정 2026-08-25 · 회부 B-6]
//   직전 배치가 실클라 E2E 를 짜다 부딪혔다: 게스트가 입장 직후 재접속하며
//   **새 플레이어가 스폰 지점에 생기고 그 사이 진행이 씻긴다.**
//   그 배치는 우회했고(워프 되풀이), 진단만 남겼다. 이번엔 고친다 — 그러나
//   ★**인계 문서의 진단도 실측으로 검증한다**(원칙 ㉔). 수리 전에 이 하네스로 증상을 직접 재현하고,
//   수리 후에 같은 하네스로 사라졌는지 본다. **짝 비교가 아니면 고쳤다고 말하지 않는다.**
//
// ★왜 브라우저가 아니라 원시 WebSocket 인가
//   증상의 핵심은 **두 소켓이 한 신원으로 겹치는 순간**이다. 브라우저로는 그 순간을
//   만들 수도 없고(워치독이 제 마음대로 끊는다) 잴 수도 없다. `ws` 로 붙으면 내가 직접
//   "닫지 않고 두 번째를 연다"·"닫자마자 연다"를 만들 수 있다. 판당 ~1분.
//   (이 칼은 직전 배치에서 `teleport_debug` 결백을 자를 때도 썼다 — 메모리 등재됨.)
//
// ★★1차 작성이 **자명 통과했다**(25/25). 원인을 적어 둔다 — 같은 함정에 또 빠지지 않게:
//   위치를 워프로 옮기고 물건을 `__e2e_give` 로 줬는데, **그 픽스처가 `savePlayer` 를 부른다**
//   (`zone.js` E2E_GIVE 분기). `savePlayer` 는 extra 없이 불리면 `player.x/y` 를 기본값으로 쓰므로
//   **테스트하려던 "미저장 상태"를 하네스가 스스로 저장해 버렸다.** 검사는 통과했지만 아무것도 안 쟀다.
//   ⇒ 지금 판은 ①물건을 **먼저** 주고(저장 유발) ②그 뒤 **진짜 이동 입력**으로 걷는다(저장 없음).
//     그리고 걷기 전후로 **central 에 저장된 좌표를 직접 읽어** "미저장 드리프트가 실제로 있다"를
//     선행 assert 한다 — 그게 참이 아니면 이 검사는 아무 의미가 없다.
//
// 실행: node scripts/test-guest-rejoin.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const net = require('net');
const ROOT = path.join(__dirname, '..');
// ★★[T10-① 2026-09-01] **고정 포트를 버렸다.** 이유는 추측이 아니라 실측이다:
//   앞 하네스의 central·zone 이 3010/3020 을 아직 쥐고 있으면 —
//     ① 이 하네스가 띄운 자식 둘은 EADDRINUSE 로 **즉시 죽는다**
//     ② 그런데 `boot()` 는 자식의 죽음을 안 봤고 stderr 를 버렸다(조용한 죽음)
//     ③ `waitHttp` 는 **남의 서버**에 붙어 "기동 OK" 로 통과한다
//     ④ 그 뒤 모든 검사는 **남의 세계**를 잰다. 그 세계엔 E2E_GIVE 가 없으니
//        `__e2e_give` 가 아무 일도 안 하고 인벤 검사 4건이 떨어진다.
//   ⇒ 화면에는 "게스트 재접속이 인벤을 잃는다"로 보인다. **없는 회귀를 보고하는 판**이다.
//   재현: 3010/3020 에 서버를 띄워 두고 이 하네스를 돌리면 PASS 22 / FAIL 4 (전부 인벤 검사).
//   ⇒ 고침 셋(전부 하네스 쪽 — 본문 판정은 한 글자도 안 건드렸다):
//     ⓐ 포트를 **부팅 직전에 빈 것으로 고른다**(pid 기반 시작점 · bind 로 실제 확인)
//     ⓑ 자식이 죽으면 **즉시** 그 사실과 stderr 꼬리를 찍고 실패한다(300초 기다리지 않는다)
//     ⓒ zone 에게 central 위치를 **읽히는 이름**으로 준다(아래 CENTRAL_PORT 주석 참조)
let CPORT = 0, ZPORT = 0;
function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPorts() {
  const base = 34000 + ((process.pid * 2) % 8000);   // 같은 순간 두 하네스가 겹칠 확률을 낮춘다
  for (let i = 0; i < 500; i++) {
    const c = base + i * 2, z = c + 1;
    if (await portFree(c) && await portFree(z)) return [c, z];
  }
  throw new Error('빈 포트 쌍을 못 찾았다');
}
const CDB = `/tmp/gj-central-${process.pid}.db`, ZDB = `/tmp/gj-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (b) => { const s = String(b); if (/중복 차단|1회용|승계/.test(s)) process.stdout.write(`      [srv] ${s.trim().slice(0, 120)}\n`); });
  // ★stderr 를 버리지 않는다 — 종전엔 `() => {}` 였고, 그래서 EADDRINUSE 가 **한 글자도 안 보였다.**
  p._name = name; p._err = ''; p._died = null;
  p.stderr.on('data', (b) => { p._err = (p._err + String(b)).slice(-4000); });
  p.on('exit', (code, sig) => { p._died = `code=${code} sig=${sig}`; });
  procs.push(p);
  return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
// ★자식이 죽었으면 **그 자리에서** 끝낸다. 종전엔 죽은 줄 모르고 300초를 기다렸고,
//   그 사이 남의 서버가 답하면 "기동 OK" 로 통과했다(위 ③).
async function waitUp(p, url, tries = 300) {
  for (let i = 0; i < tries; i++) {
    if (p._died) {
      console.log(`  ✗ ${p._name} 가 떠보지도 못하고 죽었다 (${p._died})`);
      const tail = p._err.trim().split('\n').filter(Boolean).slice(-4).join(' | ');
      if (tail) console.log(`      stderr: ${tail.slice(0, 300)}`);
      return false;
    }
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  console.log(`  ✗ ${p._name} 가 ${tries}초 안에 안 떴다 — ${url}`);
  return false;
}

// ── 세션 하나 = 소켓 하나. 내가 여는 시점을 완전히 통제한다 ────────────────────
function openSession(token) {
  const url = `ws://localhost:${ZPORT}` + (token ? `?guest_token=${encodeURIComponent(token)}` : '');
  const s = {
    ws: new WS(url), token: token || null, pid: null, playerId: null, guestToken: null,
    pos: null, inv: null, kicked: null, ticks: 0, welcomed: false,
  };
  s.ws.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.type === 'welcome') {
      s.welcomed = true; s.pid = m.pid; s.playerId = m.playerId || null; s.guestToken = m.guestToken || null;
      if (m.inventory) s.inv = { ...m.inventory };
    } else if (m.type === 'tick' && s.pid) {
      const me = (m.players || []).find((p) => p.pid === s.pid);
      if (me) { s.pos = { x: me.x, y: me.y }; s.ticks++; }
    } else if (m.type === 'inventory') { s.inv = { ...m.inventory };
    } else if (m.type === 'kicked') { s.kicked = m.reason || 'kicked'; }
  });
  s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
  s.close = () => { try { s.ws.close(); } catch (e) {} };
  s.ready = new Promise((res, rej) => { s.ws.on('open', res); s.ws.on('error', rej); });
  return s;
}
// ★central 에 **실제로 저장된** 좌표 — "미저장 드리프트가 있다"를 증명하는 유일한 원천.
async function savedPos(playerId) {
  try {
    const r = await fetch(`http://localhost:${CPORT}/player/${encodeURIComponent(playerId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    const p = j.player || j;
    return (typeof p.last_x === 'number') ? { x: p.last_x, y: p.last_y, zone: p.last_zone } : null;
  } catch (e) { return null; }
}
// 진짜 이동 입력 — `savePlayer` 를 부르지 않는 유일한 진행이다(그래서 증상의 무대다).
async function walk(s, seconds, vx, vy) {
  const end = Date.now() + seconds * 1000;
  let seq = 1;
  while (Date.now() < end) { s.send({ type: 'input', vx, vy, seq: seq++, sprint: false }); await sleep(33); }
  s.send({ type: 'input', vx: 0, vy: 0, seq: seq++, sprint: false });
  await sleep(300);
}
async function waitWelcome(s, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (s.welcomed && s.pos) return true; await sleep(100); }
  return false;
}

(async () => {
  console.log('\n=== 게스트 재접속 — 몸이 보존되는가 (B-6) ===');
  [CPORT, ZPORT] = await pickPorts();
  console.log(`  [격리] central :${CPORT} · zone :${ZPORT} (부팅 직전에 빈 것으로 고름) · DB ${CDB}`);
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zp = boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
    // ★★zone 은 `CENTRAL_URL` 을 **안 읽는다**(zone-config.js:423~424 는 CENTRAL_HOST/CENTRAL_PORT 다).
    //   종전 판이 준 CENTRAL_URL 은 아무도 안 보는 값이었고, 3010 이 기본값이라 **우연히** 맞았다.
    //   포트를 옮기는 순간 그 우연이 깨지므로 읽히는 이름으로 준다. (CENTRAL_URL 은 남겨 둔다 — 무해)
    CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1',
  });
  const cUp = await waitUp(cp, `http://localhost:${CPORT}/zones`);
  ok(cUp, 'central 기동');
  const zUp = await waitUp(zp, `http://localhost:${ZPORT}/health`);
  ok(zUp, 'zone 기동');
  // ★기동에 실패하면 **여기서 끝낸다.** 종전엔 그대로 진행해 뒤 검사가 전부 엉뚱한 이유로 떨어졌고,
  //   보고서에는 "게스트 재접속이 인벤을 잃는다"로 보였다(없는 회귀).
  if (!cUp || !zUp) {
    console.log('\n  ★기동 실패라 검사를 진행하지 않는다 — 아래 숫자는 "안 쟀다"는 뜻이다.');
    console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
    shutdown(); process.exit(1);
  }
  await sleep(2000);

  // ── ① 첫 입장 — 몸을 만들고 **움직이고 물건을 얻는다** ────────────────────
  const A = openSession(null);
  await A.ready;
  ok(await waitWelcome(A), '① 첫 입장 — welcome + tick 도달');
  ok(!!A.guestToken && /^[0-9a-f]{64}$/.test(A.guestToken), '① 게스트 토큰 발급', A.guestToken ? A.guestToken.slice(0, 8) + '…' : 'X');
  ok(!!A.playerId && A.playerId.startsWith('anon_'), '① 영속 신원(playerId) 발급', A.playerId || 'X');
  const spawn = { ...A.pos };

  // ★순서가 이 하네스의 전부다: **물건 먼저(저장 유발) → 그 다음 걷기(저장 없음).**
  //   그래야 "central 에 남은 좌표"와 "실제 몸의 좌표"가 벌어진 상태가 만들어진다.
  A.send({ type: '__e2e_give', items: { berry: 41 } });
  await sleep(1500);
  ok((A.inv || {}).berry === 41, '①a 전제: 물건을 얻었다(이때 저장이 한 번 일어난다)', `berry=${(A.inv || {}).berry}`);
  await sleep(1200);                                   // fire-and-forget 착지 대기
  const savedBefore = await savedPos(A.playerId);
  ok(!!savedBefore, '①b 전제: central 에 좌표가 저장돼 있다', savedBefore ? `(${Math.round(savedBefore.x)},${Math.round(savedBefore.y)})` : 'X');

  // ★★[2026-08-27 무게 배치] **걸린 시간이 아니라 벌어진 거리**로 멈춘다.
  //   왜 바꿨나: 무게 모델이 들어오면서 검사 플레이어가 **느려졌다**(시작 지급 33.6kg + 베리 41개 20.5kg
  //   = 용량 25kg 의 216% → 이속 ×0.58). 4초 고정으로 걷던 종전 판은 250px 나가던 것이 **145px** 이 됐고,
  //   `drift > 200` 전제가 깨졌다 — 제품은 옳은데 하네스가 자기 걸음 속도를 상수로 박아 둔 것이었다.
  //   ⇒ 목표 거리까지 **걷고 다시 재는** 모양으로 고친다. 앞으로 걸음 배율이 또 바뀌어도 안 깨진다.
  const DRIFT_MIN = 200;
  let moved = { ...A.pos }, drift = 0;
  for (let round = 0; round < 6; round++) {
    await walk(A, 4, 1, 0.35);                          // ★진짜 이동 — 저장 없음
    moved = { ...A.pos };
    drift = savedBefore ? Math.hypot(moved.x - savedBefore.x, moved.y - savedBefore.y) : 0;
    if (drift > DRIFT_MIN) break;
  }
  ok(drift > DRIFT_MIN, '★①c 전제: **미저장 드리프트가 실제로 생겼다** — 이게 거짓이면 이 검사는 아무것도 안 잰다',
    `저장된 (${Math.round((savedBefore||{}).x)},${Math.round((savedBefore||{}).y)}) vs 몸 (${Math.round(moved.x)},${Math.round(moved.y)}) = ${Math.round(drift)}px`);
  const invA = { ...A.inv };
  const token = A.guestToken, pidA = A.playerId;

  // ── ② 입장 직후 재접속 — **드레인 창 없이**(증상이 난 그 갈래) ─────────────
  //   클라의 `ensurePrimaryConnection` 은 같은 틱에 close→connect 한다. 그걸 그대로 재현한다:
  //   닫자마자(대기 0) 같은 토큰으로 새 소켓.
  A.close();
  const B = openSession(token);
  await B.ready;
  ok(await waitWelcome(B), '② 드레인 없이 즉시 재접속 — welcome 도달');
  ok(B.playerId === pidA, '② 같은 토큰 → 같은 영속 신원(playerId)', `${pidA} vs ${B.playerId}`);
  const dB = B.pos ? Math.hypot(B.pos.x - moved.x, B.pos.y - moved.y) : Infinity;
  const dSavedB = (B.pos && savedBefore) ? Math.hypot(B.pos.x - savedBefore.x, B.pos.y - savedBefore.y) : Infinity;
  ok(dB < 64, '★② 위치 보존 — 걷던 자리에서 이어진다(낡은 저장 좌표로 되돌아가지 않는다)',
    `걷던 자리와 ${Math.round(dB)}px · 낡은 저장 좌표와 ${Math.round(dSavedB)}px`);
  ok((B.inv || {}).berry === 41, '★② 인벤 보존', `berry=${(B.inv || {}).berry}`);

  // ── ③ 두 소켓이 **겹치는** 순간 — 닫지 않고 두 번째를 연다 ────────────────
  //   서버는 중복을 kick 으로 끊는다(zone.js 동일 zone 중복 차단). 그때 **새 세션이
  //   살아 있는 몸을 이어받는가**, 아니면 낡은 central 행을 읽어 스폰으로 가는가.
  B.send({ type: '__e2e_give', items: { stone: 7 } });
  await sleep(1500);
  const savedMid = await savedPos(pidA);
  // ★같은 이유로 여기도 거리 기준이다(위 ①c 주석 참조 — 짐이 무거우면 4초로는 200px 을 못 간다).
  let moved2 = { ...B.pos }, drift2 = 0;
  for (let round = 0; round < 6; round++) {
    await walk(B, 4, -1, 0.6);                          // 다시 미저장 드리프트를 만든다
    moved2 = { ...B.pos };
    drift2 = savedMid ? Math.hypot(moved2.x - savedMid.x, moved2.y - savedMid.y) : 0;
    if (drift2 > DRIFT_MIN) break;
  }
  ok(drift2 > DRIFT_MIN, '③a 전제: 두 번째 세션도 **미저장 드리프트**를 만들었다', `${Math.round(drift2)}px`);
  const C = openSession(token);              // ★B 를 닫지 않는다
  await C.ready;
  ok(await waitWelcome(C), '③ 겹친 재접속 — welcome 도달');
  await sleep(800);
  ok(B.kicked === 'duplicate_login', '③b 전제: 서버가 옛 세션을 중복으로 끊었다(이 갈래를 실제로 밟았다)', B.kicked || '안 끊김');
  const dC = C.pos ? Math.hypot(C.pos.x - moved2.x, C.pos.y - moved2.y) : Infinity;
  ok(C.playerId === pidA, '③ 같은 신원 유지');
  ok(dC < 64, '★③ 겹친 재접속에서도 몸을 이어받는다', `끊긴 자리와 ${Math.round(dC)}px`);
  ok((C.inv || {}).berry === 41 && (C.inv || {}).stone >= 7, '★③ 인벤 보존(두 번의 획득 모두)',
    `berry=${(C.inv || {}).berry} stone=${(C.inv || {}).stone}`);

  // ── ④ 한참 뒤 재접속 — 드레인 창이 충분한 정상 경로(회귀 가드) ────────────
  await walk(C, 3, 0.3, -1);
  const moved3 = { ...C.pos };
  C.close();
  await sleep(3000);                          // 종전 하네스가 쓰던 드레인 창(fire-and-forget 착지)
  const D = openSession(token);
  await D.ready;
  ok(await waitWelcome(D), '④ 드레인 뒤 재접속 — welcome 도달');
  const dD = D.pos ? Math.hypot(D.pos.x - moved3.x, D.pos.y - moved3.y) : Infinity;
  ok(D.playerId === pidA, '④ 같은 신원 유지');
  ok(dD < 64, '④ 위치 보존(정상 경로 — 종전에도 되던 것)', `${Math.round(dD)}px`);
  ok((D.inv || {}).berry === 41, '④ 인벤 보존');

  // ── ⑤ 토큰이 다르면 **다른 사람**이어야 한다(수리가 신원을 뭉개지 않았는지) ──
  const E = openSession(null);
  await E.ready;
  ok(await waitWelcome(E), '⑤ 토큰 없이 접속 — welcome 도달');
  ok(E.playerId !== pidA, '⑤ 토큰이 없으면 새 사람이다(수리가 신원을 뭉개지 않았다)', `${E.playerId}`);
  ok(!(E.inv || {}).berry, '⑤ 새 사람은 남의 물건을 물려받지 않는다', `berry=${(E.inv || {}).berry || 0}`);
  // ⚠1차 판정("남의 자리에서 200px 넘게 떨어져 있다")은 **틀린 기준**이었다 —
  //   새 게스트는 원래 **마을광장(도착 지점)** 에 오고, 앞 사람이 마침 그 근처를 걸었으면 가깝다.
  //   옳은 성질은 "남과 멀다"가 아니라 **"도착 지점에서 시작한다"** 이다(§9.2 — 캐릭터는
  //   발생하지 않고 도착한다). 그리고 "남의 몸을 안 물려받았다"는 위 두 줄이 이미 잰다.
  const dE = E.pos ? Math.hypot(E.pos.x - spawn.x, E.pos.y - spawn.y) : Infinity;
  ok(dE < 64, '⑤ 새 사람은 **도착 지점**에서 시작한다(남의 몸을 물려받지 않는다)',
    `도착 지점과 ${Math.round(dE)}px`);

  D.close(); E.close();
  shutdown();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); shutdown(); process.exit(1); });
