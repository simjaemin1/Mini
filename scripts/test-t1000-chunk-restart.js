#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1000-chunk-restart.js — 달리다 SIGKILL · 재기동 뒤 자리 되돌림 ≤ 청크 한 변 (T1000) ==================
//
// ★왜 [T989 회부 1 → T1000 · PM 10-30] `T989_CHUNK_SAVE` 켬 기본. 주기 저장(30초)만이면 강제 종료 뒤 자리가 최대 147.7m(달리기) 되돌아간다.
//   켜면 청크(한 변 1024px = 32m)를 넘을 때마다 저장하므로 되돌림 ≤ 청크 한 변 + 저장 차례 몫이다.
//
// 재는 것(central · 존을 진짜로 띄운다 — `test-save-periodic` ⓒ 꼴 · 주기 저장 간격은 운영 기본 30초 그대로):
//   팔 둘(켬 = env 없음 · 끔 = `T989_CHUNK_SAVE=0`) · 같은 대본: 손님 입장 → 기준 저장(`__e2e_give` 한 번 · central 행에 닿을 때까지)
//   → 한 초 걸음(160px)만큼 비켜 선다 → **다음 저장이 central 행에 닿을 때까지** 선다(주기 저장 — 행 `last_seen` 이 바뀐다)
//   → 그 즉시 동쪽으로 달린다(걷기 · 달리기 섞임 — 스태미나) → **청크 경계를 둘 이상 넘고 2 × 1024px 를 넘게 달린 그 자리**에서
//   소켓을 닫지 않고 존만 **SIGKILL** → 존 재기동 → 같은 토큰으로 재접속 → 되살아난 자리 ↔ 죽기 직전 자리
//   ⓐ [상황] 두 팔 다 청크 경계를 둘 이상 넘었다(달린 거리 > 2 × 1024px)
//   ⓐ' [상황] 끔 — 달리기 앞 저장 뒤 죽기까지 저장 0(행 `last_seen` 그대로 — 되돌림의 기준 = 달리기 앞 자리)
//   ⓑ ★켬 — 되돌림 ≤ 청크 한 변(1024px) + 한 초 걸음(달리기 160px) — 이미 있는 수 둘
//   ⓒ ★끔 — 되돌림 > 청크 한 변(종전 결함이 보인다 · 자명 통과 금지)
//   ★★[T1017 2026-10-31] 끔 미끼는 **저장 시각에 묶는다**(벽시계 아님). 종전엔 기준 저장 뒤 20초를 벽시계로 달렸다 — 사람마다 첫 주기 저장 자리가
//     `_periodicSave` 첫 배정에서 0~30초 사이로 흩어지므로(zone.js `Math.random() * SAVE_INTERVAL_MS`) 그 20초 안에 주기 저장이 끼면
//     그 뒤 몫만 남아 끔 되돌림이 청크 한 변 아래로 떨어졌다(land1031 게이트 · PM 상자 552 · 867px · 이 컨테이너 홀로 179px).
//     ⇒ 주기 저장이 central 행에 닿은 **바로 뒤**(서버 권위 시각 `last_seen`)에 달리기 시작해 거리 조건(서버 권위 자리)에서 죽인다 — 다음 주기 저장은
//     그 30초 뒤라 상자 빠르기와 무관하게 미끼가 선다(달리기 2,048px ≈ 13초). 두 팔이 같은 대본을 탄다(손잡이만 다르다).
//
// 실행: node scripts/test-t1000-chunk-restart.js   (존 기동 넷 · 수 분)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));
const ROOT = path.join(__dirname, '..');
const CPORT = 3410, ZPORT = 3420;
const CDB = `/tmp/t1000-c-${process.pid}.db`, ZDB = `/tmp/t1000-z-${process.pid}.db`;
const clean = () => { for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
function bootZone(extra) {
  const z = boot('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' }, extra || {}));
  z.__up = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  return z;
}
function openSession(token) {
  const s = { ws: new WS(`ws://localhost:${ZPORT}` + (token ? `?guest_token=${encodeURIComponent(token)}` : '')), pid: null, playerId: null, guestToken: null, pos: null, welcomed: false };
  s.ws.on('message', (d) => { let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.type === 'welcome') { s.welcomed = true; s.pid = m.pid; s.playerId = m.playerId || null; s.guestToken = m.guestToken || null; }
    else if (m.type === 'tick' && s.pid) { const me = (m.players || []).find((p) => p.pid === s.pid); if (me) s.pos = { x: me.x, y: me.y }; } });
  s.ws.on('error', () => {});
  s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
  s.ready = new Promise((res, rej) => { s.ws.on('open', res); s.ws.on('error', rej); });
  return s;
}
async function waitWelcome(s, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (s.welcomed && s.pos) return true; await sleep(100); } return false; }
// ★[T1017] 운영 기본 주기 저장 간격(zone.js `SAVE_INTERVAL_MS` 기본 — 머리말의 "30초") · 아래 기다림의 그물(판정 아님)에만 쓴다 · 새 수 0
const SAVE_MS = 30000;
// ★[T1017] central 행 — 안 문(되돌이 · `CENTRAL_SECRET` 없음)이라 행 전체가 온다: `last_x` · `last_y` · `last_seen`(central 이 쓴 시각 · 서버 권위)
async function rowOf(playerId) {
  try { const r = await fetch(`http://localhost:${CPORT}/player/${encodeURIComponent(playerId)}`, { signal: AbortSignal.timeout(5000) }); return ((await r.json()) || {}).player || null; }
  catch (e) { return null; }
}
// ★[T1017] 조건 대기 하나 — 세계가 말할 때까지(상한은 그물 · 걸리면 부르는 쪽 [상황] 이 이름을 댄다)
async function waitFor(fn, capMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; await sleep(100); }
  return { v: null, ms: Date.now() - t0, timedOut: true };
}
// ★[T1017] 존 하나만 죽이고 **죽은 것을 확인**한다(종전 1.5초 잠 대신 — 아이의 `exit`)
function killWait(p) {
  return new Promise((res) => { if (p.exitCode !== null || p.signalCode !== null) return res(); p.once('exit', () => res()); try { p.kill('SIGKILL'); } catch (e) { res(); } });
}
const chunkCross = (a, b) => Math.abs(Math.floor(b.x / 1024) - Math.floor(a.x / 1024)) + Math.abs(Math.floor(b.y / 1024) - Math.floor(a.y / 1024));

async function arm(env) {
  clean();
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  let z = bootZone(env);
  const zu = await z.__up;
  const A = openSession(null); await A.ready;
  const w = await waitWelcome(A);
  // ① 기준 저장 한 번 — central 행에 닿을 때까지(종전 1.5초 잠)
  A.send({ type: '__e2e_give', items: { berry: 3 } });
  const g = await waitFor(async () => { const r = await rowOf(A.playerId); let inv = {}; try { inv = JSON.parse((r && r.inventory_json) || '{}') || {}; } catch (e) {} return (inv.berry >= 3) ? r : null; }, 2 * SAVE_MS);
  // ② 한 초 걸음(160px)만큼 비켜 선다 — 주기 저장은 안 움직인 사람을 안 쓰고 지나간다(zone.js `_periodicSave` · `skippedClean`).
  //   비켜 서 두면 다음 주기 저장이 반드시 central 행에 닿고, 그 시각이 곧 "방금 저장했다"의 증인이다.
  let seq = 1;
  const q = { ...A.pos };
  await waitFor(async () => { A.send({ type: 'input', vx: 1, vy: 0, seq: seq++, sprint: true }); await sleep(33); return Math.hypot(A.pos.x - q.x, A.pos.y - q.y) >= 160 || null; }, SAVE_MS);
  A.send({ type: 'input', vx: 0, vy: 0, seq: seq++ });   // 선다
  // ③ 다음 저장이 central 행에 닿을 때까지 선다(행 `last_seen` 이 기준 저장의 그것보다 크다 — central 이 쓴 시각)
  const seen0 = g.v ? g.v.last_seen : null;
  //   ★닿은 저장이 **선 자리**를 썼는지도 본다 — 기준 저장 자리에서 한 초 걸음(160px) 넘게 떨어진 자리(비켜 서는 도중 · 같은 자리의 덧저장은 안 센다).
  const s1 = await waitFor(async () => { const r = await rowOf(A.playerId); return (r && seen0 != null && r.last_seen > seen0 && g.v
    && Math.hypot(r.last_x - g.v.last_x, r.last_y - g.v.last_y) >= 160) ? r : null; }, 2 * SAVE_MS);
  // ④ 그 즉시 동쪽으로 달린다 — 청크 경계를 둘 이상 넘고 2 × 1024px 를 넘게 달린 그 자리에서 멈춘다(서버 권위 자리 · 벽시계 0).
  //   막히면 남북으로 비켜 간다(입력만 · 세계는 서버가 정한다). 상한(주기 저장 간격)은 그물 — 거기 걸리면 아래 [상황] 이 빨갛다.
  const p0 = { ...A.pos };
  let vy = 0, last = { ...A.pos }, stuck = 0, writes = 0, seenRun = s1.v ? s1.v.last_seen : null;
  const run0 = Date.now();
  while (!(chunkCross(p0, A.pos) >= 2 && Math.hypot(A.pos.x - p0.x, A.pos.y - p0.y) > 2048) && Date.now() - run0 < SAVE_MS) {
    A.send({ type: 'input', vx: 1, vy, seq: seq++, sprint: true });
    await sleep(33);
    if (seq % 30 === 0) {
      const d = Math.hypot(A.pos.x - last.x, A.pos.y - last.y); if (d < 20) { stuck++; vy = (stuck % 2) ? 1 : -1; } else vy = 0; last = { ...A.pos };
      const r = await rowOf(A.playerId); if (r && r.last_seen !== seenRun) { writes++; seenRun = r.last_seen; }   // 달리는 동안 닿은 저장(표 · 켬 = 청크 저장)
    }
  }
  const runMs = Date.now() - run0;
  const pKill = { ...A.pos };
  await killWait(z);   // ★소켓을 닫지 않는다 — 존만 죽인다
  procs.splice(procs.indexOf(z), 1);
  const rowK = await rowOf(A.playerId);   // central 은 산다 — 죽기 전 마지막으로 닿은 저장
  z = bootZone(env);
  const zu2 = await z.__up;
  const B = openSession(A.guestToken); await B.ready;
  const w2 = await waitWelcome(B);
  const back = B.pos ? Math.hypot(B.pos.x - pKill.x, B.pos.y - pKill.y) : Infinity;
  const ran = Math.hypot(pKill.x - p0.x, pKill.y - p0.y);
  const crossed = chunkCross(p0, pKill);
  try { A.ws.terminate(); B.ws.close(); } catch (e) {}
  for (const p of procs.slice()) await killWait(p);
  procs.length = 0; clean();
  return { up: cu.ok && zu.ok && zu2.ok && w && w2, same: B.playerId === A.playerId, p0, pKill, ran, crossed, back, rebornAt: B.pos,
           saved: !g.timedOut && !s1.timedOut, waitGiveMs: g.ms, waitSaveMs: s1.ms, runMs, writes,
           lastSaveKept: !!(rowK && s1.v && rowK.last_seen === s1.v.last_seen),
           rowK: rowK ? { x: rowK.last_x, y: rowK.last_y } : null };
}

(async () => {
  console.log('\n=== 달리다 SIGKILL · 재기동 뒤 자리 되돌림 (T1000 · T989_CHUNK_SAVE 켬 기본) ===\n');
  const on = await arm({});
  const off = await arm({ T989_CHUNK_SAVE: '0' });
  for (const [k, r] of [['켬', on], ['끔(=0)', off]]) console.log(`  · ${k}: 달린 ${Math.round(r.ran)}px(${(r.ran / 32).toFixed(1)}m · 청크 경계 ${r.crossed}) · 되돌림 ${Math.round(r.back)}px(${(r.back / 32).toFixed(1)}m)`
    + ` · 기준 저장까지 ${r.waitGiveMs}ms · 달리기 앞 저장까지 ${r.waitSaveMs}ms · 달리기 ${r.runMs}ms · 달리는 동안 닿은 저장 ${r.writes}번 · 죽기 전 마지막 저장 자리 ${r.rowK ? `(${Math.round(r.rowK.x)},${Math.round(r.rowK.y)})` : '없음'} · 되살아난 자리 ${r.rebornAt ? `(${Math.round(r.rebornAt.x)},${Math.round(r.rebornAt.y)})` : '없음'}`);
  ok(on.up && off.up && on.same && off.same, '[상황] 기동 넷 · 재접속 둘 · 같은 영속 신원');
  ok(on.saved && off.saved, '[상황] 두 팔 다 기준 저장 · 달리기 앞 저장이 central 행에 닿았다(저장 시각 `last_seen` · 선 자리)', `켬 ${on.waitGiveMs} · ${on.waitSaveMs}ms · 끔 ${off.waitGiveMs} · ${off.waitSaveMs}ms`);
  ok(on.crossed >= 2 && off.crossed >= 2 && on.ran > 2048 && off.ran > 2048, '[상황] 두 팔 다 청크 경계를 둘 이상 넘었다', `${on.crossed} · ${off.crossed}`);
  ok(off.lastSaveKept, '[상황] 끔 — 달리기 앞 저장 뒤 죽기까지 central 행에 닿은 저장 0(행 `last_seen` 그대로 · 되돌림의 기준 = 달리기 앞 자리)', `달리는 동안 닿은 저장 ${off.writes}번 · 달리기 ${off.runMs}ms`);
  ok(on.back <= 1024 + 160, '★켬 — 되돌림 ≤ 청크 한 변 + 달리기 1초(1,184px = 37m)', `${Math.round(on.back)}px`);
  ok(off.back > 1024, '★끔(`=0`) — 되돌림 > 청크 한 변(종전 — 마지막 저장 = 달리기 앞 저장 자리)', `${Math.round(off.back)}px`);
  console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
