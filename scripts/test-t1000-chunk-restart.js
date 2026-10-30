#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1000-chunk-restart.js — 달리다 SIGKILL · 재기동 뒤 자리 되돌림 ≤ 청크 한 변 (T1000) ==================
//
// ★왜 [T989 회부 1 → T1000 · PM 10-30] `T989_CHUNK_SAVE` 켬 기본. 주기 저장(30초)만이면 강제 종료 뒤 자리가 최대 147.7m(달리기) 되돌아간다.
//   켜면 청크(한 변 1024px = 32m)를 넘을 때마다 저장하므로 되돌림 ≤ 청크 한 변 + 저장 차례 몫이다.
//
// 재는 것(central · 존을 진짜로 띄운다 — `test-save-periodic` ⓒ 꼴 · 주기 저장 간격은 운영 기본 30초 그대로):
//   팔 둘(켬 = env 없음 · 끔 = `T989_CHUNK_SAVE=0`): 손님 입장 → 기준 저장(`__e2e_give` 한 번) → 동쪽으로 20초 달린다(걷기 · 달리기 섞임 — 스태미나)
//   → 소켓을 닫지 않고 존만 **SIGKILL** → 존 재기동 → 같은 토큰으로 재접속 → 되살아난 자리 ↔ 죽기 직전 자리
//   ⓐ [상황] 두 팔 다 청크 경계를 둘 이상 넘었다(달린 거리 > 2 × 1024px)
//   ⓑ ★켬 — 되돌림 ≤ 청크 한 변(1024px) + 한 초 걸음(달리기 160px) — 이미 있는 수 둘
//   ⓒ ★끔 — 되돌림 > 청크 한 변(종전 결함이 보인다 · 자명 통과 금지 — 20초 안에 주기 저장이 오면 그 뒤 몫만 남는다: 끔 팔은 기준 저장 직후 바로 달리므로 첫 주기 저장 앞)
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

async function arm(env) {
  clean();
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  let z = bootZone(env);
  const zu = await z.__up;
  const A = openSession(null); await A.ready;
  const w = await waitWelcome(A);
  A.send({ type: '__e2e_give', items: { berry: 3 } });   // 기준 저장 한 번
  await sleep(1500);
  const p0 = { ...A.pos };
  // 동쪽으로 20초 — 막히면 남북으로 비켜 간다(입력만 · 세계는 서버가 정한다)
  let seq = 1, vy = 0, last = { ...A.pos }, stuck = 0;
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    A.send({ type: 'input', vx: 1, vy, seq: seq++, sprint: true });
    await sleep(33);
    if (seq % 30 === 0) { const d = Math.hypot(A.pos.x - last.x, A.pos.y - last.y); if (d < 20) { stuck++; vy = (stuck % 2) ? 1 : -1; } else vy = 0; last = { ...A.pos }; }
  }
  const pKill = { ...A.pos };
  for (const p of procs) if (p === z) { try { p.kill('SIGKILL'); } catch (e) {} }   // ★소켓을 닫지 않는다 — 존만 죽인다
  await sleep(1500);
  procs.splice(procs.indexOf(z), 1);
  z = bootZone(env);
  const zu2 = await z.__up;
  const B = openSession(A.guestToken); await B.ready;
  const w2 = await waitWelcome(B);
  const back = B.pos ? Math.hypot(B.pos.x - pKill.x, B.pos.y - pKill.y) : Infinity;
  const ran = Math.hypot(pKill.x - p0.x, pKill.y - p0.y);
  const crossed = Math.abs(Math.floor(pKill.x / 1024) - Math.floor(p0.x / 1024)) + Math.abs(Math.floor(pKill.y / 1024) - Math.floor(p0.y / 1024));
  try { A.ws.terminate(); B.ws.close(); } catch (e) {}
  await sleep(500); killAll(); await sleep(1000); clean();
  return { up: cu.ok && zu.ok && zu2.ok && w && w2, same: B.playerId === A.playerId, p0, pKill, ran, crossed, back, rebornAt: B.pos };
}

(async () => {
  console.log('\n=== 달리다 SIGKILL · 재기동 뒤 자리 되돌림 (T1000 · T989_CHUNK_SAVE 켬 기본) ===\n');
  const on = await arm({});
  const off = await arm({ T989_CHUNK_SAVE: '0' });
  for (const [k, r] of [['켬', on], ['끔(=0)', off]]) console.log(`  · ${k}: 달린 ${Math.round(r.ran)}px(${(r.ran / 32).toFixed(1)}m · 청크 경계 ${r.crossed}) · 되돌림 ${Math.round(r.back)}px(${(r.back / 32).toFixed(1)}m)`);
  ok(on.up && off.up && on.same && off.same, '[상황] 기동 넷 · 재접속 둘 · 같은 영속 신원');
  ok(on.crossed >= 2 && off.crossed >= 2 && on.ran > 2048 && off.ran > 2048, '[상황] 두 팔 다 청크 경계를 둘 이상 넘었다', `${on.crossed} · ${off.crossed}`);
  ok(on.back <= 1024 + 160, '★켬 — 되돌림 ≤ 청크 한 변 + 달리기 1초(1,184px = 37m)', `${Math.round(on.back)}px`);
  ok(off.back > 1024, '★끔(`=0`) — 되돌림 > 청크 한 변(종전 — 마지막 저장 = 기준 저장 자리)', `${Math.round(off.back)}px`);
  console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); killAll(); process.exit(1); });
