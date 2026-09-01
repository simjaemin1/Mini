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
const jget = async (u) => (await (await fetch(u)).json());
const cp = (src, dst) => { for (const sfx of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + sfx, dst + sfx); } catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} } } };

// ★DB 를 **지우지 않고** 다시 띄운다 — 그게 이 하네스의 주제(재기동해도 남는가)다.
// ★①~⑤ 는 **선계산을 끄고**(`VILLAGE_ROUTE_WARM=0`) 잰다. 안 끄면 무효화 직후 선계산이 곧바로
//   다시 채워서 "비웠는가"를 못 잰다(첫 판이 그랬다: 81 → 1). 선계산 자체는 ⑥에서 켜고 잰다.
async function up(warm) {
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!await waitHttp(`http://localhost:${CPORT}/zones`, 120)) return false;
  boot('zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    VILLAGE_ROUTE_WARM: warm ? '1' : '0',
  });
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

  // ── ⑥ 선계산 — 사람이 없을 때 스스로 데운다(경계에서 팔 길을 미리 판다) ────
  if (!await up(true)) { console.log('  ✗ 5판 기동 실패'); process.exit(1); }
  const W0 = await jget(`http://localhost:${ZPORT}/routedbg`);
  ok(W0.warmTotal > 20, '⑥ [상황] 데울 쌍이 실제로 잡혔다(마을마다 가까운 N곳)', `${W0.warmTotal}쌍 · 남은 ${W0.warmLeft}`);
  let W1 = W0;
  for (let i = 0; i < 60 && W1.warmLeft > 0; i++) { await sleep(2000); W1 = await jget(`http://localhost:${ZPORT}/routedbg`); }
  // ★선계산의 **대가**도 같이 적는다 — A* 한 번이 100~1,900ms 라 데우는 동안 루프가 그만큼 막힌다.
  //   그래서 사람이 없을 때만 돈다(코드가 그렇게 게이트한다). 숨기지 않고 수치로 남긴다.
  const WP = await jget(`http://localhost:${ZPORT}/perf`);
  console.log(`  5판(선계산)  ${W0.warmTotal}쌍 중 남은 ${W1.warmLeft} · 캐시 메모리 ${W1.mem} · DB ${W1.db}`);
  console.log(`    ↳ 데우는 동안 이벤트 루프 최대 막힘 ${WP.loop ? WP.loop.max : '?'}ms (p99 ${WP.loop ? WP.loop.p99 : '?'}) — **사람이 없을 때만** 도는 대가다`);
  ok(W1.warmLeft === 0, '⑥ ★★사람이 없는 동안 **선계산이 완주한다**', `남은 ${W1.warmLeft}/${W0.warmTotal}`);
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
