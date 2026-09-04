#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-save-periodic.js — 주기 저장이 진행을 지키는가 =================
//
// ★왜 [재민 확정 2026-08-26]
//   `savePlayer` 는 접속·종료·핸드오프·행동 때만 돌았다. 그래서 **걷기만 한 진행은 어디에도 없었다** —
//   서버가 죽거나 재시작하면 마지막 행동 이후가 증발한다. B-6 수리는 "두 세션이 겹치는" 갈래만 막았고
//   **크래시 갈래는 그대로**였다. 이 하네스가 그 갈래를 잰다.
//
// ★★이 하네스의 제1 규약(배치 2 사고 재발 금지):
//   **픽스처가 검사 대상을 오염시키지 않는지 먼저 확인한다.** 직전 배치에서 `__e2e_give` 가
//   `savePlayer` 를 부르는 바람에 "미저장 상태"를 하네스가 스스로 저장해 **자명 통과**했다(25/25).
//   그래서 여기서는 **A/B 로 증명**한다:
//     · 주기 저장 **끄면**(간격 아주 크게) 걷기만으로는 central 좌표가 **안 움직인다** ← 픽스처 결백
//     · 주기 저장 **켜면** 같은 걷기로 central 좌표가 **따라온다**          ← 이 기능의 효과
//   둘 다 참이어야 이 검사가 무언가를 잰 것이다.
//
// 실행: node scripts/test-save-periodic.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/sp-central-${process.pid}.db`, ZDB = `/tmp/sp-zone-${process.pid}.db`;
const clean = () => { for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } };
clean();

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ★[T84] 서버 콘솔 줄은 **말**로 거른다(로그의 이모지가 빠지면 필터가 조용히 죽는다).
  p.stdout.on('data', (b) => { const s = String(b); if (/승계|사망|다운/.test(s)) process.stdout.write(`      [srv] ${s.trim().slice(0, 120)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function waitHttp(url, tries = 300) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
function bootZone(extraEnv) {
  return boot('zone', 'zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
  }, extraEnv || {}));
}

function openSession(token) {
  const url = `ws://localhost:${ZPORT}` + (token ? `?guest_token=${encodeURIComponent(token)}` : '');
  const s = { ws: new WS(url), pid: null, playerId: null, guestToken: null, pos: null, inv: null, welcomed: false };
  s.ws.on('message', (d) => {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.type === 'welcome') { s.welcomed = true; s.pid = m.pid; s.playerId = m.playerId || null; s.guestToken = m.guestToken || null; if (m.inventory) s.inv = { ...m.inventory }; }
    else if (m.type === 'tick' && s.pid) { const me = (m.players || []).find((p) => p.pid === s.pid); if (me) s.pos = { x: me.x, y: me.y }; }
    else if (m.type === 'inventory') s.inv = { ...m.inventory };
  });
  s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
  s.close = () => { try { s.ws.close(); } catch (e) {} };
  s.ready = new Promise((res, rej) => { s.ws.on('open', res); s.ws.on('error', rej); });
  return s;
}
async function waitWelcome(s, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (s.welcomed && s.pos) return true; await sleep(100); }
  return false;
}
async function savedPos(playerId) {
  try {
    const r = await fetch(`http://localhost:${CPORT}/player/${encodeURIComponent(playerId)}`);
    if (!r.ok) return null;
    const j = await r.json(); const p = j.player || j;
    return (typeof p.last_x === 'number') ? { x: p.last_x, y: p.last_y } : null;
  } catch (e) { return null; }
}
// 진짜 이동 입력 — 이것만이 `savePlayer` 를 부르지 않는 진행이다(그래서 이 검사의 무대다).
async function walk(s, seconds, vx, vy) {
  const end = Date.now() + seconds * 1000; let seq = 1;
  while (Date.now() < end) { s.send({ type: 'input', vx, vy, seq: seq++, sprint: false }); await sleep(33); }
  s.send({ type: 'input', vx: 0, vy: 0, seq: seq++, sprint: false });
  await sleep(300);
}

(async () => {
  console.log('\n=== 주기 저장 — 걷기만 한 진행이 크래시를 넘기는가 ===');
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');

  // ── ⓐ 대조군: 주기 저장 **끔**(간격을 아주 크게) — 걷기는 저장을 부르지 않는다 ──
  //   이게 참이 아니면 아래 ⓑ 의 통과는 주기 저장 덕분이 아니라 픽스처 덕분이다.
  let zone = bootZone({ SAVE_INTERVAL_MS: '999000' });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동(대조군 — 주기 저장 사실상 끔)');
  await sleep(2000);
  const A = openSession(null);
  await A.ready;
  ok(await waitWelcome(A), 'ⓐ 입장');
  A.send({ type: '__e2e_give', items: { berry: 13 } });   // 저장 1회 유발(기준점을 만든다)
  await sleep(2600);
  const base = await savedPos(A.playerId);
  ok(!!base, 'ⓐ 기준점: central 에 좌표가 저장됐다', base ? `(${Math.round(base.x)},${Math.round(base.y)})` : 'X');
  await walk(A, 6, 1, 0.4);
  const walked = { ...A.pos };
  const drift = base ? Math.hypot(walked.x - base.x, walked.y - base.y) : 0;
  ok(drift > 200, 'ⓐ 전제: 걸어서 기준점에서 멀어졌다', `${Math.round(drift)}px`);
  await sleep(2500);
  const afterCtl = await savedPos(A.playerId);
  const ctlMoved = (afterCtl && base) ? Math.hypot(afterCtl.x - base.x, afterCtl.y - base.y) : 0;
  ok(ctlMoved < 8, '★ⓐ **주기 저장이 없으면 걷기는 저장되지 않는다**(픽스처 결백 — 이 검사가 무언가를 잰다는 증명)',
    `central 이동 ${Math.round(ctlMoved)}px`);
  const tokenA = A.guestToken;
  A.close();
  await sleep(500);
  killAll();
  await sleep(1500);
  clean();

  // ── ⓑ 본군: 주기 저장 **켬** — 같은 걷기가 central 에 따라온다 ────────────────
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 재기동');
  zone = bootZone({ SAVE_INTERVAL_MS: '4000' });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동(본군 — 주기 저장 4초)');
  await sleep(2000);
  const B = openSession(null);
  await B.ready;
  ok(await waitWelcome(B), 'ⓑ 입장');
  B.send({ type: '__e2e_give', items: { berry: 21 } });
  await sleep(2600);
  const base2 = await savedPos(B.playerId);
  await walk(B, 8, 1, 0.4);                       // 주기(4초)를 여러 번 지나도록 충분히
  const walked2 = { ...B.pos };
  await sleep(5000);                              // 마지막 주기 + fire-and-forget 착지
  const after2 = await savedPos(B.playerId);
  const d2 = (after2) ? Math.hypot(after2.x - walked2.x, after2.y - walked2.y) : Infinity;
  const moved2 = (after2 && base2) ? Math.hypot(after2.x - base2.x, after2.y - base2.y) : 0;
  ok(moved2 > 200, '★ⓑ 주기 저장이 켜지면 central 좌표가 **따라온다**', `기준점에서 ${Math.round(moved2)}px 이동`);
  ok(d2 < 400, 'ⓑ 저장된 좌표가 실제 몸 근처다(마지막 주기 이내)', `몸과 ${Math.round(d2)}px`);
  const tokenB = B.guestToken, pidB = B.playerId;

  // ── ⓒ ★크래시 복원 — **graceful close 없이** SIGKILL 하고 재기동 ──────────────
  //   종료 플러시(ws close 핸들러)를 타면 이 검사는 주기 저장이 아니라 종료 저장을 재는 것이 된다.
  //   그래서 소켓을 **닫지 않고** 서버 프로세스를 그냥 죽인다.
  await walk(B, 6, -1, 0.5);
  const beforeCrash = { ...B.pos };
  await sleep(5000);                              // 주기 저장이 이 자리를 담을 시간
  const savedAtCrash = await savedPos(pidB);
  // ★소켓을 닫지 않는다 — zone 프로세스만 죽인다(SIGKILL: 종료 훅 없음)
  for (const p of procs) { if (p !== procs[0]) { try { p.kill('SIGKILL'); } catch (e) {} } }
  await sleep(2000);
  ok(!!savedAtCrash, 'ⓒ 전제: 크래시 직전 central 에 좌표가 있다', savedAtCrash ? `(${Math.round(savedAtCrash.x)},${Math.round(savedAtCrash.y)})` : 'X');
  const lag = savedAtCrash ? Math.hypot(savedAtCrash.x - beforeCrash.x, savedAtCrash.y - beforeCrash.y) : Infinity;
  ok(lag < 400, 'ⓒ 크래시 직전 저장본이 실제 자리와 가깝다(주기 이내)', `${Math.round(lag)}px`);

  procs.length = 1;                               // central 만 남긴다
  zone = bootZone({ SAVE_INTERVAL_MS: '4000' });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'ⓒ zone 재기동(크래시 후)');
  await sleep(2500);
  const C = openSession(tokenB);
  await C.ready;
  ok(await waitWelcome(C), 'ⓒ 같은 토큰으로 재접속');
  ok(C.playerId === pidB, 'ⓒ 같은 영속 신원');
  const dC = C.pos ? Math.hypot(C.pos.x - beforeCrash.x, C.pos.y - beforeCrash.y) : Infinity;
  ok(dC < 400, '★★ⓒ **크래시를 넘어 걷던 자리 근처에서 되살아난다**(주기 저장의 목적)',
    `크래시 직전 자리와 ${Math.round(dC)}px`);

  // ── ⓓ 승계된 몸이 낡은 좌표로 덮이지 않는다(B-6 규칙과의 정합) ───────────────
  //   같은 신원으로 겹쳐 접속해 몸을 승계시키고, 새 세션으로 걸은 뒤 주기 저장이 돌게 둔다.
  //   저장본은 **새 자리**여야 한다 — 옛 세션이 뒷문으로 낡은 좌표를 쓰면 이 검사가 잡는다.
  await walk(C, 4, 1, -0.6);
  const beforeTakeover = { ...C.pos };
  const D = openSession(tokenB);                  // ★C 를 닫지 않는다 → 승계
  await D.ready;
  ok(await waitWelcome(D), 'ⓓ 겹친 재접속(승계)');
  const dTake = D.pos ? Math.hypot(D.pos.x - beforeTakeover.x, D.pos.y - beforeTakeover.y) : Infinity;
  ok(dTake < 64, 'ⓓ 전제: 몸을 승계했다(B-6)', `${Math.round(dTake)}px`);
  await walk(D, 5, 0.5, 1);
  const afterNew = { ...D.pos };
  await sleep(6000);                              // 주기 저장이 여러 번 지나도록
  const savedFinal = await savedPos(pidB);
  const dNew = savedFinal ? Math.hypot(savedFinal.x - afterNew.x, savedFinal.y - afterNew.y) : Infinity;
  const dOld = savedFinal ? Math.hypot(savedFinal.x - beforeTakeover.x, savedFinal.y - beforeTakeover.y) : 0;
  ok(dNew < 400 && dNew < dOld, '★ⓓ 저장본은 **새 세션의 자리**다(밀려난 세션이 낡은 좌표로 덮지 않는다)',
    `새 자리와 ${Math.round(dNew)}px · 승계 전 자리와 ${Math.round(dOld)}px`);

  D.close(); C.close();
  await sleep(500);
  killAll();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  clean();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
