#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-slot-keep.js — 재기동 직후 무효화 · 교역로 슬롯을 서로 버리지 않는다 (T1036 ③ · T1026 회부 2) ============
//
// ★왜 [T945 §4 · T1026]
//   교역로 재개형 A* 는 슬롯이 하나다(`_pathJob`). 다시 뜬 직후(되살림 줄 T775 에 길 없는 캐러밴이 선 때) 무효화가 오면
//   되살림 줄(`_t775Resume`)과 선계산(`_routeWarmStep`)이 같은 틱 안에서 서로 다른 쌍으로 슬롯을 부르며 **서로의 일을 버렸다** —
//   60날 세계에서 15분 동안 버림 ≈ 26,000 · 다 판 쌍 11 에서 멈춤 · 틱 p50 17ms(T1026 판 여섯 · `scripts/t1026-thrash.js` · 러너 밖 17분 판).
//   T1026 이 `T1026_SLOT_KEEP`(켬 기본) — "주인이 이 틱이나 바로 앞 틱에 이어 판 일은 버리지 않고 다른 문이 기다린다"로 고쳤다.
//   이 하네스는 그 꼴을 **러너 안 5분 판**으로 잡는다.
//
// 틀: 씨앗 세계(`slicer-seed` 정본) · 빠른 날 →
//   1판: 선계산 끔 · 캐러밴이 길에 나설 때까지 날을 돌리고 · 무효화로 교역로 캐시(메모리 · DB)를 비운 채 내린다.
//   2판: 같은 DB 로 재기동 = **다시 뜬 직후** · 선계산 켬 · 유예 0(`VILLAGE_ROUTE_WARM_IDLE_MS=0` — 이미 있는 손잡이 · 두 문이 처음부터 겹치게) ·
//        되살림 줄이 선 그 순간 **진짜 무효화 한 번 더**(`/routedbg?invalidate=1` = 벽 · 울타리) · 그 뒤 `/perf` probe `t1026` 을 본다.
//
// 검사:
//   ① [상황] 1판에서 교역로가 실제로 파였고 · 무효화가 메모리 · DB 를 비웠다
//   ② [상황] 2판 — 되살림 줄이 섰고(길 없는 캐러밴) · 선계산 줄이 섰다(두 문이 다 슬롯을 부를 일이 있다)
//   ③ ★★자명 통과 금지 — 두 문이 **실제로 다퉜다**: 되살림 줄과 선계산이 서로를 기다렸다(기다림 각 ≥ 1). 안 다퉜으면 아래 "버림 0"은 공짜다.
//   ④ ★★**쥐고 있던 일을 버린 수 0**(`dropFresh` — 이 틱 · 앞 틱에 이어 판 일을 다른 문이 버린 수). `T1026_SLOT_KEEP=0` 이면 서로 버림이라 빨갛다.
//   ⑤ ★★다 판 쌍이 멈추지 않는다 — 되살림 줄이 비고(길 없는 캐러밴이 다 몸을 받았다) · 다 판 쌍이 두 문의 버림보다 많다(종전 꼴 = 버림 수만 · 다 판 몇).
//   (표 · 판정 아님) 문마다 일 시작 · 기다림 · 버림 · 선계산 남은 쌍.
//
// 실행: node scripts/test-slot-keep.js      (되돌림 탐침: T1026_SLOT_KEEP=0 node scripts/test-slot-keep.js → ③ · ④ · ⑤ 빨강이어야 한다)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
const { SEED_C, SEED_Z, ensureSeed } = require('./slicer-seed.js');   // ★T160 씨앗 정본(없으면 스스로 만든다)

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const DAY_MS = 3000;                 // test-route-persist 와 같은 빠른 날
const DAYS = 5;                      // test-route-persist 1판과 같은 날 수
const WATCH_MS = 120000;             // 2판에서 보는 창의 상한(표에만 — 걸리면 이름을 붙인다)
const CDB = '/tmp/slotkeep-c.db', ZDB = '/tmp/slotkeep-z.db';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lg = fs.createWriteStream(`/tmp/slotkeep-${env.ZONE_ID || 'central'}.log`, { flags: 'w' });
  p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
async function jget(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return {}; } }
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };
async function up(warm, extra) {
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _up = await FB.waitUp(_central, /central server up on/, { name: 'central' });
  if (!_up.ok) { console.log(`  ★${_up.why}`); return false; }
  const _zone = boot('zone.js', Object.assign({
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    VILLAGE_ROUTE_WARM: warm ? '1' : '0',
  }, extra || {}));
  const _zp = FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  return (await _zp).ok;
}
async function down() { killAll(); await sleep(4000); }
const probe = (j) => (j && j.econTick && j.econTick.probe) || {};
const pairs = (t, a, b) => ((t && t.drop) ? ((t.drop[`${a}>${b}`] | 0) + (t.drop[`${b}>${a}`] | 0)) : 0);

(async () => {
  console.log('\n=== 재기동 직후 무효화 — 교역로 슬롯을 서로 버리지 않는다(T1036 ③ · T1026) ===');
  console.log(`  손잡이 T1026_SLOT_KEEP=${process.env.T1026_SLOT_KEEP === '0' ? '0 (종전 · 되돌림 탐침 — ③ · ④ · ⑤ 가 빨개야 맞다)' : '켬(기본)'}`);
  { const r = await ensureSeed();
    if (!r.ok) { console.log(`  ✗ 씨앗 준비 실패 — ${r.why}`); process.exit(1); }
    if (r.built) console.log('  (이 판이 씨앗을 만들었다 — 다음 실행부터는 곧바로 시작한다)'); }
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);

  // ── 1판: 날을 돌려 캐러밴을 길에 세우고 · 교역로를 비운 채 내린다 ──────────────────────
  if (!await up(false)) { console.log('  ✗ 1판 기동 실패'); process.exit(1); }
  let P1 = {};
  for (let i = 0; i < 400; i++) { await sleep(2000); P1 = await jget(`http://localhost:${ZPORT}/perf`); if (P1.econTick && P1.econTick.days >= DAYS) break; }
  const cold1 = probe(P1).routeCold | 0;
  const inv1 = await jget(`http://localhost:${ZPORT}/routedbg?invalidate=1`);
  const R1 = await jget(`http://localhost:${ZPORT}/routedbg`);
  console.log(`  1판  날 ${P1.econTick ? P1.econTick.days : '?'} · 판 교역로 ${cold1} · 무효화 ${!!inv1.invalidated} → 캐시 메모리 ${R1.mem} · DB ${R1.db}`);
  ok(cold1 >= 1, '① [상황] 1판에서 교역로가 실제로 파였다(캐러밴이 길에 나섰다)', `${cold1}쌍`);
  ok(R1.mem === 0 && R1.db === 0, '① [상황] 무효화가 교역로 캐시를 메모리 · DB 둘 다 비웠다(다시 뜨면 길이 없다)', `메모리 ${R1.mem} · DB ${R1.db}`);
  await down();

  // ── 2판: 다시 뜬 직후 · 선계산 켬(유예 0) · 되살림 줄이 선 순간 무효화 한 번 더 ────────────
  if (!await up(true, { VILLAGE_ROUTE_WARM_IDLE_MS: '0' })) { console.log('  ✗ 2판 기동 실패'); process.exit(1); }
  let P0 = {}, R0 = {};
  for (let i = 0; i < 300; i++) { P0 = await jget(`http://localhost:${ZPORT}/perf`); const t = probe(P0).t775; if (t && (t.wait > 0 || t.done)) break; await sleep(200); }
  const inv2 = await jget(`http://localhost:${ZPORT}/routedbg?invalidate=1`);
  R0 = await jget(`http://localhost:${ZPORT}/routedbg`);
  const p0 = probe(P0), w0 = p0.t775 ? p0.t775.wait : 0;
  console.log(`  2판  되살림 줄 ${w0}대 · 무효화 ${!!inv2.invalidated} · 선계산 줄 ${R0.warmLeft}/${R0.warmTotal} · 슬롯 손잡이 ${p0.t1026 ? p0.t1026.on : '(없음)'}`);
  ok(w0 >= 1, '② [상황] 다시 뜬 직후 되살림 줄이 섰다(길 없는 캐러밴이 슬롯을 부를 일이 있다)', `${w0}대`);
  ok(R0.warmLeft >= 1, '② [상황] 무효화가 선계산 줄을 다시 세웠다(선계산도 슬롯을 부를 일이 있다)', `${R0.warmLeft}쌍`);
  ok(!!(p0.t1026 && typeof p0.t1026.on === 'boolean'), '② [상황] 슬롯 셈(`/perf` probe `t1026`)이 배선돼 있다', p0.t1026 ? JSON.stringify({ on: p0.t1026.on }) : 'X');

  const c0 = p0.routeCold | 0, t0 = Date.now();
  let P = P0, R = R0;
  while (Date.now() - t0 < WATCH_MS) {
    await sleep(3000);
    P = await jget(`http://localhost:${ZPORT}/perf`); R = await jget(`http://localhost:${ZPORT}/routedbg`);
    const t = probe(P).t775;
    if (t && (t.done || t.wait === 0) && R.warmLeft === 0) break;
  }
  const pr = probe(P), T = pr.t1026 || {}, t775 = pr.t775 || {};
  const watched = Date.now() - t0;
  const doneN = (pr.routeCold | 0) - c0, mutual = pairs(T, 'resume775', 'warm');
  console.log(`  표(판정 아님) ${Math.round(watched / 1000)}초 · 시작 ${JSON.stringify(T.start || {})} · 기다림 ${JSON.stringify(T.yield || {})} · 버림 ${JSON.stringify(T.drop || {})} · 쥐고 있던 일 버림 ${T.dropFresh | 0}`);
  console.log(`                다 판 쌍 +${doneN} · 되살림 줄 ${t775.wait}대(몸 ${t775.spawned | 0}) · 선계산 남음 ${R.warmLeft}/${R.warmTotal}${watched >= WATCH_MS ? ` · ★창 상한 ${WATCH_MS / 1000}초에 걸렸다` : ''}`);
  const y = T.yield || {};
  ok((y.resume775 | 0) >= 1 && (y.warm | 0) >= 1,
    '③ ★★자명 통과 금지 — 되살림 줄과 선계산이 **실제로 다퉜다**(서로를 기다렸다 — 안 다퉜으면 아래 "버림 0"은 공짜다)', `기다림 되살림 줄 ${y.resume775 | 0} · 선계산 ${y.warm | 0}`);
  ok((T.dropFresh | 0) === 0, '④ ★★**쥐고 있던 일을 버린 수 0** — 주인이 이 틱 · 앞 틱에 이어 판 일은 다른 문이 버리지 않는다', `${T.dropFresh | 0}회 · 되살림 줄 ↔ 선계산 버림 ${mutual}`);
  ok(!!(t775.done || t775.wait === 0), '⑤ ★★다 판 쌍이 멈추지 않는다 — 되살림 줄이 비었다(길 없는 캐러밴이 다 몸을 받았다)', `남은 ${t775.wait}대 · 몸 ${t775.spawned | 0}`);
  ok(doneN > mutual, '⑤ ★★다 판 쌍이 두 문의 버림보다 많다(종전 꼴 = 버림만 늘고 다 판은 제자리)', `다 판 +${doneN} > 버림 ${mutual}`);

  await down();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); killAll(); process.exit(1); });
