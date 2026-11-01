#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-resume-slice.js — 다시 뜬 직후 되살림 줄이 틱 몫을 넘겨 쌓지 않는다 (T1061 · T1036 회부 2) ============
//
// ★왜 [T1036 회부 2 · T1061]
//   다시 뜬 직후 되살림 줄(`_t775Resume`)은 몸이 없는 캐러밴을 한 틱에 전부 차례로 불렀고(`spawnCaravanBody`), 대마다 공유 예산의 남은 몫
//   (바닥나면 1ms)을 넘겼다. 걷는 길(`_walkResume` — 걷는 길 캐시는 메모리뿐이라 다시 뜨면 전부 다시 판다)은 구간을 **시작하기 전에** 예산을 보므로
//   1ms 를 받은 캐러밴도 구간 하나는 판다 — "1ms + 한 조각"이 대마다 쌓여 한 틱이 길어졌다(T1036 프로파일 · 부팅 12~18초 · 한 틱 몫 40~67ms).
//   T1061 `T1061_RESUME_SLICE`(켬 기본): 이 틱 몫이 바닥나면 남은 캐러밴은 차례 그대로 줄에 남긴다(T896 의 그 계약).
// ★벽시계로 단언하지 않는다 — 틱 ms 는 상자(steal · 코어 수)에 흔들린다(T1036). 단언은 **조각 몫 셈**으로만 한다:
//   "이 틱 몫이 이미 바닥난 뒤에 부른 캐러밴 수"(`/perf` probe `t1061.overCalls` — 부작용 없는 `TB.left` 로 잰다).
//
// 틀: 씨앗 세계(`slicer-seed` 정본) · 1판 빠른 날(3초) 5날 → **무효화 없이** 정상 종료(T728 장부 이음 — 교역로는 DB 에 남고 걷는 길은 메모리라 사라진다)
//   → 2판 같은 DB · 정본 하루로 재기동(= 다시 뜬 직후 · 교역로 복원 · 걷는 길 전부 다시) → 되살림 줄이 빌 때까지 `/perf` probe `t1061` · `t775`.
//
// 검사:
//   ① [상황] 1판에서 교역로가 파였다 · 정상 종료했다
//   ② [상황] 2판 — 되살림 줄이 섰고(몸 없는 캐러밴) · 걷는 길을 실제로 팠다
//   ③ ★★자명 통과 금지 — 되살림 줄이 **이 틱 몫을 실제로 다 썼다**(몫이 바닥나 다음 틱으로 미룬 캐러밴 ≥ 1). 안 바닥났으면 아래 "0"은 공짜다.
//   ④ ★★**이 틱 몫이 바닥난 뒤에 부른 캐러밴 0**(`overCalls`). `T1061_RESUME_SLICE=0` 이면 종전 쌓임이라 빨갛다.
//   ⑤ 되살림이 끝났다 — 줄이 비었고 · 몸을 받기 전에 장부가 끝난 캐러밴 0(`t775.lost` — 미룬 탓에 잃은 캐러밴이 없다)
//   (표 · 판정 아님) 걷는 길 한 틱 몫 최대(ms · 부름 수) · 30ms · 16ms 넘은 틱 수 · 미룬 수.
//
// 실행: node scripts/test-resume-slice.js      (되돌림 탐침: T1061_RESUME_SLICE=0 node scripts/test-resume-slice.js → ③ · ④ 빨강이어야 한다)
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
const CDB = '/tmp/resumeslice-c.db', ZDB = '/tmp/resumeslice-z.db';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lg = fs.createWriteStream(`/tmp/resumeslice-${env.ZONE_ID || 'central'}.log`, { flags: 'w' });
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
//   ★1판은 **정상 종료**(SIGTERM)로 내린다 — 다시 떠도 장부를 이어 가는 종료 저장(T728 · `t728Shutdown`)은 정상 종료에서만 돈다.
//     SIGKILL 로 내리면 다시 뜬 세계에 길 위 캐러밴이 없어 되살림 줄이 안 선다(첫 판 실측 · ② 빨강). 존이 스스로 끝날 때까지 기다린다(상한은 표에만).
async function downGraceful() {
  const z = procs.find((p) => p.spawnargs.some((a) => /zone\.js$/.test(a)));
  if (z && z.exitCode === null) { const gone = new Promise((r) => z.once('exit', r)); try { z.kill('SIGTERM'); } catch (e) {} const t = Date.now(); await Promise.race([gone, sleep(60000)]); console.log(`  (1판 존 정상 종료 ${Date.now() - t}ms${z.exitCode === null ? ' — ★60초 안에 안 끝났다' : ''})`); }
  await down();
}
const probe = (j) => (j && j.econTick && j.econTick.probe) || {};

(async () => {
  console.log('\n=== 다시 뜬 직후 — 되살림 줄이 틱 몫을 넘겨 쌓지 않는다(T1061 · T1036 회부 2) ===');
  console.log(`  손잡이 T1061_RESUME_SLICE=${process.env.T1061_RESUME_SLICE === '0' ? '0 (종전 · 되돌림 탐침 — ③ · ④ 가 빨개야 맞다)' : '켬(기본)'}`);
  { const r = await ensureSeed();
    if (!r.ok) { console.log(`  ✗ 씨앗 준비 실패 — ${r.why}`); process.exit(1); }
    if (r.built) console.log('  (이 판이 씨앗을 만들었다 — 다음 실행부터는 곧바로 시작한다)'); }
  cp(SEED_C, CDB); cp(SEED_Z, ZDB);

  // ── 1판: 날을 돌려 캐러밴을 길에 세우고 · 무효화 없이 정상 종료 ─────────────────────────
  if (!await up(false)) { console.log('  ✗ 1판 기동 실패'); process.exit(1); }
  let P1 = {};
  for (let i = 0; i < 400; i++) { await sleep(2000); P1 = await jget(`http://localhost:${ZPORT}/perf`); if (P1.econTick && P1.econTick.days >= DAYS) break; }
  const R1 = await jget(`http://localhost:${ZPORT}/routedbg`);
  console.log(`  1판  날 ${P1.econTick ? P1.econTick.days : '?'} · 판 교역로 ${probe(P1).routeCold | 0} · 캐시 DB ${R1.db}`);
  ok((R1.db | 0) >= 1, '① [상황] 1판에서 교역로가 파였다(다시 뜨면 복원된다 — 걷는 길만 다시 판다)', `DB ${R1.db}행`);
  await downGraceful();

  // ── 2판: 다시 뜬 직후(정본 하루) — 되살림 줄이 빌 때까지 ──────────────────────────────
  if (!await up(true, { VILLAGE_DAY_MS: '1440000' })) { console.log('  ✗ 2판 기동 실패'); process.exit(1); }
  let P0 = {};
  for (let i = 0; i < 300; i++) { P0 = await jget(`http://localhost:${ZPORT}/perf`); const t = probe(P0).t775; if (t && (t.wait > 0 || t.done || t.spawned > 0)) break; await sleep(200); }
  const p0 = probe(P0), w0 = p0.t775 ? (p0.t775.wait | 0) + (p0.t775.spawned | 0) : 0;
  const t0 = Date.now();
  let P = P0;
  while (Date.now() - t0 < WATCH_MS) {
    const t = probe(P).t775;
    if (t && (t.done || t.wait === 0)) break;
    await sleep(2000); P = await jget(`http://localhost:${ZPORT}/perf`);
  }
  const pr = probe(P), T = pr.t1061 || {}, t775 = pr.t775 || {}, watched = Date.now() - t0;
  const RS = await jget(`http://localhost:${ZPORT}/routedbg`);   // 값 같음 서명(표) — 켬 · 끔 판을 견줄 때 쓴다(walkSig · bodySig)
  console.log(`  2판  되살림 줄(처음) ${w0}대 · 손잡이 ${T.on} · ${Math.round(watched / 1000)}초${watched >= WATCH_MS ? ` · ★창 상한 ${WATCH_MS / 1000}초에 걸렸다` : ''}`);
  console.log(`  표(판정 아님) 걷는 길 부름 ${T.walkCalls | 0} · 합 ${T.walkMs | 0}ms · 한 부름 최대 ${T.callMax | 0}ms · 한 틱 몫 최대 ${T.tickMax | 0}ms(부름 ${T.tickMaxCalls | 0}) · 30ms 넘은 틱 ${T.over30 | 0} · 16ms 넘은 틱 ${T.over16 | 0} · 미룬 캐러밴 ${T.held | 0} · 몸 ${t775.spawned | 0}`);
  console.log(`  서명(표 · 켬 ↔ 끔 견줌용) 걷는 길 ${RS.walkN}쌍 ${RS.walkSig} · 몸 ${RS.bodyN}대 ${RS.bodySig}`);
  ok(w0 >= 1, '② [상황] 다시 뜬 직후 되살림 줄이 섰다(몸 없는 캐러밴)', `${w0}대`);
  ok((T.walkCalls | 0) >= 1, '② [상황] 걷는 길을 실제로 팠다(다시 뜨면 걷는 길 캐시는 비어 있다)', `${T.walkCalls | 0}번`);
  ok((T.held | 0) >= 1, '③ ★★자명 통과 금지 — 되살림 줄이 **이 틱 몫을 실제로 다 썼다**(바닥나 다음 틱으로 미룬 캐러밴 ≥ 1 — 안 바닥났으면 아래 "0"은 공짜다)', `${T.held | 0}대`);
  ok(T.overCalls === 0, '④ ★★**이 틱 몫이 바닥난 뒤에 부른 캐러밴 0** — 미루지 않고 쌓으면 "1ms + 한 조각"이 대마다 붙는다', `${T.overCalls}번`);
  ok(!!(t775.done || t775.wait === 0) && (t775.lost | 0) === 0, '⑤ 되살림이 끝났다 — 줄이 비었고 · 몸을 받기 전에 장부가 끝난 캐러밴 0(미룬 탓에 잃은 캐러밴이 없다)', `남은 ${t775.wait}대 · 잃음 ${t775.lost | 0} · 몸 ${t775.spawned | 0}`);

  await down();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); killAll(); process.exit(1); });
