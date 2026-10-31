#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-distmatrix.js — 교역 거리행렬 **증분 = 전쌍** 하네스 ==========
//
// ★왜 이 하네스인가 [2026-08-03d 배치 11 ①-2]
//   교역 BFS 거리행렬은 **전쌍**이라 18마을 153쌍에 **25.5초**가 걸린다(실측 로그).
//   플레이어가 마을을 세울 때마다 그걸 다시 돌면 그만큼 서버가 멎는다 — 그래서 증분화했다.
//   증분의 정확성은 "BFS 는 무향 대칭이라 소스가 누구든 같다"는 **논증**으로는 부족하다.
//   이 프로젝트가 배치 7 에서 논증(전수라고 믿은 스캔)으로 오진을 냈다. ⇒ **실지형에서 재본다.**
//
// 검사: 같은 마을 집합에 대해
//   ① 전쌍 계산 결과와 ② "N−1 곳 전쌍 → 1곳 추가 증분" 결과가 **완전 일치**(부동소수 오차 0)
//   ③ 증분이 실제로 더 빠르다(소스 BFS 횟수가 준다)
//   ④ 기존 행렬이 없거나 크기가 안 맞으면 **전쌍으로 폴백**(안전)
//
// 실행: node scripts/test-distmatrix.js   (지형만 읽는다 — 실서버 부팅·DB 없음)
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {};
// ★[T996] `T977_DIST_SAME` 켬 기본 — ①~⑦ 은 **BFS 셈**을 재는 검사라 이 프로세스는 끔 갈래로 돈다(env 를 안 줬을 때만 · 켬 갈래는 ⑧ 딸린 프로세스).
//   손잡이는 모듈을 읽을 때 정해지므로 require 앞에 둔다. `--t977-default` 딸린 프로세스는 env 를 지운 채(= 제품 기본) 돈다.
if (!(process.argv[2] || '').startsWith('--t977') && process.env.T977_DIST_SAME == null) process.env.T977_DIST_SAME = '0';
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const P = R('server/villages').__labProbe;
quiet = false; console.log = _log;

const Z = 'hanbando';
const ZONE = ZONES[Z];
const SZ = P.SZ;
const say = (...a) => _log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };

P.setZoneId(Z);
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isBlocked = (x, y) => { if (!_in(x, y)) return true; return isRock(x, y) || isWater(x, y); };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked, isWaterTileLocal: isWater });

say('=== 교역 거리행렬 증분 하네스 ===');
say(`  zone=${Z} · DIST_STEP=${P._distProbe.DIST_STEP}셀`);

// ── 마을 좌표: 실지도 시딩과 같은 인자(사본 금지) ─────────────────────────────
const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta);
//   ★하네스는 **작게** 잡는다 — 전쌍 BFS 가 마을 수에 비례해 느리다(18곳 25초).
//     8곳이면 쌍 28개로 정확성 검사에 충분하고, 같은 세계를 두 번 돌 수 있다.
const N = Math.min(8, picked.length);
const coords = picked.slice(0, N).map((hv) => ({ x: Math.round(hv.x / SZ) * 2.5, y: Math.round(hv.y / SZ) * 2.5 }));
say(`  마을 ${N}곳 (실지도 시딩 선별 앞 ${N}곳)`);

const mkWorld = (n) => ({ villages: coords.slice(0, n).map((c, i) => ({ name: 'v' + i, coord: { x: c.x, y: c.y } })) });
const run = (world, reason, opts) => {
  P._distProbe.setup(ta, ZONE, world, econ);
  const t0 = Date.now();
  quiet = true; const _l = console.log; console.log = () => {};
  P._distProbe.compute(reason, opts);
  console.log = _l; quiet = false;
  return { mat: world._distMatrix, ms: Date.now() - t0 };
};

// ── [T977] 딸린 프로세스(켬 갈래 · ⑧ 이 부른다) ──────────────────────────────────
if (process.argv[2] === '--t977-default') {   // ★[T996] 제품 기본(env 없음) — 셈 한 번 뒤 바탕이 서나
  const w = mkWorld(3); P._distProbe.setup(ta, ZONE, w, econ);
  const _l = console.log; console.log = () => {}; P._distProbe.compute('t996-default'); console.log = _l;
  _log('T996DEF ' + JSON.stringify({ env: process.env.T977_DIST_SAME == null ? null : process.env.T977_DIST_SAME, basis: !!P._distProbe.basis }));
  process.exit(0);
}
if (process.argv[2] === '--t977') {
  const enc = (m) => m.map((r) => r.map((d) => (isFinite(d) ? d : null)));
  const cap = (fn) => { const L = []; const _l = console.log; console.log = (...a) => L.push(a.join(' ')); try { fn(); } finally { console.log = _l; } return L.join('\n'); };
  const out = {};
  const w1 = mkWorld(N); P._distProbe.setup(ta, ZONE, w1, econ);
  cap(() => P._distProbe.compute('t977-1'));
  out.m1 = enc(w1._distMatrix); out.basis1 = !!P._distProbe.basis;
  P._distProbe.blkReset();
  const w2 = mkWorld(N); P._distProbe.setup(ta, ZONE, w2, econ);
  let y = 0; const L2 = cap(() => { const g = P._distProbe.gen('t977-2'); while (!g.next().done) y++; });
  out.m2 = enc(w2._distMatrix); out.y2 = y; out.tag2 = /같은 격자 · BFS 0/.test(L2);
  // 격자를 바꾼다 — 마을 0 코스 노드 둘레(반경 8 노드 — 스냅 구제 반경 너머)를 막는 술어 ⇒ 마을 0 쌍이 다 도달 불능이 된다
  const D = P._distProbe.DIST_STEP, c0 = coords[0], gx0 = Math.round(c0.x / 2.5 / D), gy0 = Math.round(c0.y / 2.5 / D);
  const isBlocked2 = (x, y) => (Math.abs(Math.floor(Math.floor(x / SZ) / D) - gx0) <= 8 && Math.abs(Math.floor(Math.floor(y / SZ) / D) - gy0) <= 8) || isBlocked(x, y);   // 술어는 존 좌표(px)를 받는다
  const ta2 = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked2, isWaterTileLocal: isWater });
  P._distProbe.blkReset();
  const w3 = mkWorld(N); P._distProbe.setup(ta2, ZONE, w3, econ);
  const L3 = cap(() => P._distProbe.compute('t977-3'));
  const m3 = enc(w3._distMatrix); out.tag3 = /같은 격자 · BFS 0/.test(L3);
  P._distProbe.blkReset(); P._distProbe.basisReset();
  const w3b = mkWorld(N); P._distProbe.setup(ta2, ZONE, w3b, econ); cap(() => P._distProbe.compute('t977-3b'));
  const m3b = enc(w3b._distMatrix), dif = (a, b) => { let d = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (a[i][j] !== b[i][j]) d++; return d; };
  out.d3 = dif(m3, out.m2); out.e3 = dif(m3, m3b);
  // 마을 좌표가 다르다(마을 0 을 한 칸 옮김) — 바탕(ta2 · 좌표 그대로) 뒤
  P._distProbe.blkReset();
  const mv = (n) => ({ villages: mkWorld(n).villages.map((v, i) => (i ? v : { name: v.name, coord: { x: v.coord.x + 2.5, y: v.coord.y } })) });
  const w4 = mv(N); P._distProbe.setup(ta2, ZONE, w4, econ); const L4 = cap(() => P._distProbe.compute('t977-4'));
  P._distProbe.blkReset(); P._distProbe.basisReset();
  const w4b = mv(N); P._distProbe.setup(ta2, ZONE, w4b, econ); cap(() => P._distProbe.compute('t977-4b'));
  out.tag4 = /같은 격자 · BFS 0/.test(L4); out.e4 = dif(enc(w4._distMatrix), enc(w4b._distMatrix));
  // ── [T996] 환호 적재 뒤 바탕 다시 세움 — 격자 A 에서 센 바탕 → 술어가 B 로 바뀜(환호 적재 흉내 · 무효화 없음) → 바탕만 다시 세움 → 무효화 → 같은 격자
  P._distProbe.blkReset(); P._distProbe.basisReset();
  out.gate0 = P._distProbe.basisRefresh();   // 바탕 없으면 안 선다
  const wA = mkWorld(N); P._distProbe.setup(ta, ZONE, wA, econ); cap(() => P._distProbe.compute('t996-A'));
  const bA = P._distProbe.basis.blk;
  const wB = mkWorld(N); P._distProbe.setup(ta2, ZONE, wB, econ);
  const memo0 = Buffer.from(P._distProbe.blkMemo);
  out.gate1 = P._distProbe.basisRefresh();
  let n5 = 0; const L5 = cap(() => { n5 = P._distProbe.basisRun(); });
  out.n5 = n5; out.tag5bfs = /바탕 다시 세움: .*BFS \d+소스/.test(L5); out.inj5 = wB._distMatrix !== undefined;
  out.tag5drop = /\[T1011\] 거리행렬 바탕 확인: 격자가 다르다/.test(L5); out.basis5 = !!P._distProbe.basis;   // ★[T1011] 미룸 갈래
  out.memo5 = Buffer.compare(memo0, Buffer.from(P._distProbe.blkMemo)) === 0;
  const bB = P._distProbe.basis ? P._distProbe.basis.blk : bA; let bd = 0; for (let i = 0; i < bB.length; i++) if (bB[i] !== bA[i]) bd++; out.bd5 = bd;
  P._distProbe.blkReset();   // 무효화
  const wC = mkWorld(N); P._distProbe.setup(ta2, ZONE, wC, econ); const L6 = cap(() => P._distProbe.compute('t996-C'));
  out.tag6 = /같은 격자 · BFS 0/.test(L6); out.e6 = dif(enc(wC._distMatrix), m3b);
  out.gate7 = P._distProbe.basisRefresh(); const L7 = cap(() => P._distProbe.basisRun()); out.tag7 = /바탕 다시 세움: .*같은 격자\(BFS 0\)/.test(L7);
  P._distProbe.blkReset(); const wD = mkWorld(N); P._distProbe.setup(ta2, ZONE, wD, econ); const L8 = cap(() => P._distProbe.compute('t1011-D'));   // 또 무효화
  out.tag8 = /같은 격자 · BFS 0/.test(L8); out.e8 = dif(enc(wD._distMatrix), m3b);
  _log('T977JSON ' + JSON.stringify(out));
  process.exit(0);
}

// ── ① 전쌍(기준) ─────────────────────────────────────────────────────────────
say('\n[① 전쌍 계산 — 기준]');
const full = run(mkWorld(N), 'full');
ok(!!full.mat && full.mat.length === N, `행렬 ${N}×${N} 생성 (${full.ms}ms)`);
{
  let finite = 0; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (isFinite(full.mat[i][j])) finite++;
  ok(finite > 0, `★유한 거리 쌍이 실재한다 — ${finite}/${N * (N - 1) / 2} (전부 Infinity 면 이 검사가 자명하게 통과한다)`);
}

// ── ② N−1 전쌍 → 1곳 증분 ────────────────────────────────────────────────────
say('\n[② N−1 전쌍 → 1곳 증분]');
const base = run(mkWorld(N - 1), 'base');
ok(base.mat.length === N - 1, `기준 행렬 ${N - 1}×${N - 1} (${base.ms}ms)`);
const grown = { villages: mkWorld(N).villages, _distMatrix: base.mat };
const inc = run(grown, 'incr', { incrementalFrom: N - 1 });
ok(inc.mat.length === N, `증분 후 ${N}×${N} (${inc.ms}ms)`);

// ── ③ 완전 일치 ──────────────────────────────────────────────────────────────
say('\n[③ 증분 = 전쌍 — 완전 일치]');
{
  let diff = 0, worst = 0, cmp = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = full.mat[i][j], b = inc.mat[i][j];
    cmp++;
    if (a === b) continue;                       // Infinity === Infinity 도 여기서 통과
    diff++; const d = Math.abs(a - b); if (d > worst) worst = d;
  }
  ok(cmp === N * N, `비교한 칸 ${cmp} = ${N}×${N} (검사가 실제로 전 칸을 밟았다)`);
  ok(diff === 0, `★불일치 ${diff}칸 — 증분 결과가 전쌍과 **완전히 같다**${diff ? ` (최대 차 ${worst})` : ''}`);
}

// ── ④ 증분이 실제로 싸다 ─────────────────────────────────────────────────────
say('\n[④ 증분이 더 싸다]');
ok(inc.ms <= full.ms, `증분 ${inc.ms}ms ≤ 전쌍 ${full.ms}ms (소스 BFS 1회 vs ${N - 1}회)`);
say(`    참고 — 기준(N−1) ${base.ms}ms + 증분 ${inc.ms}ms = ${base.ms + inc.ms}ms · 전쌍 재계산이면 ${full.ms}ms`);

// ── ⑤ 폴백 안전 ──────────────────────────────────────────────────────────────
say('\n[⑤ 기존 행렬이 없거나 크기가 다르면 전쌍으로 폴백]');
{
  const noPrev = { villages: mkWorld(N).villages };                       // 기존 행렬 없음
  const r1 = run(noPrev, 'nofallback', { incrementalFrom: N - 1 });
  let same = true; for (let i = 0; i < N && same; i++) for (let j = 0; j < N; j++) if (r1.mat[i][j] !== full.mat[i][j]) { same = false; break; }
  ok(same, '★기존 행렬이 없으면 전쌍으로 떨어진다 — 결과가 전쌍과 동일');

  const badPrev = { villages: mkWorld(N).villages, _distMatrix: [[0, 1], [1, 0]] };   // 크기 불일치
  const r2 = run(badPrev, 'badfallback', { incrementalFrom: N - 1 });
  let same2 = true; for (let i = 0; i < N && same2; i++) for (let j = 0; j < N; j++) if (r2.mat[i][j] !== full.mat[i][j]) { same2 = false; break; }
  ok(same2, '★크기가 안 맞는 행렬도 무시하고 전쌍 — 결과가 전쌍과 동일(썩은 값 재사용 없음)');
}

// ── ⑥ ★[T957] 조각으로 민 셈 = 한 번에 센 셈 ──────────────────────────────────
//   하루 마감 ⑪ 단계(켬)는 발생기(`_distMatrixGen`)를 조각 몫만큼씩 민다. 동기 문(`computeAndInjectDistMatrix`)도 같은 발생기를 한 번에 돌린다 —
//   여기서는 **한 양보씩** 끊어 밀고(그 사이에 다른 판 셈을 끼워 넣어 공유 칸이 흔들려도) 결과가 전쌍과 완전히 같은지 · 실제로 잘게 끊겼는지를 본다.
say('\n[⑥ ★[T957] 조각으로 민 셈 = 한 번에 센 셈]');
{
  const fs = require('fs');
  const V = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  ok(/const T957_DIST_SLICE = process\.env\.T957_DIST_SLICE !== '0';/.test(V), '손잡이 — 켬 기본 · `=0` 만 끔');
  ok((V.match(/add\('dist', \(\) => \{\n\s+if \(T957_DIST_SLICE\) return _t957DistStage\(\);/g) || []).length === 2, '하루 마감 ⑪ 두 자리(종전 · T731 창) 다 켬 줄이 첫 줄 · 끔 = 그 아래 종전 줄');
  ok(/function computeAndInjectDistMatrix\(reason, opts\) \{\n  const g = _distMatrixGen\(reason, opts\);\n  while \(!g\.next\(\)\.done\)/.test(V), '동기 문 = 같은 발생기를 한 번에(몸통 사본 0)');
  const w = mkWorld(N);
  P._distProbe.setup(ta, ZONE, w, econ);
  quiet = true; const _l = console.log; console.log = () => {};
  const g = P._distProbe.gen('slice');
  let y = 0, mixed = 0;
  for (;;) {
    const r = g.next(); if (r.done) break; y++;
    if (y % 500 === 0) { const other = mkWorld(N - 1); run(other, 'mix'); P._distProbe.setup(ta, ZONE, w, econ); mixed++; quiet = true; console.log = () => {}; }   // 사이에 다른 판 셈(공유 칸 · state.world 를 흔든다)
  }
  console.log = _l; quiet = false;
  const m = w._distMatrix;
  let diff = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!m || m[i][j] !== full.mat[i][j]) diff++;
  ok(y > 10 * N, `[상황] 실제로 잘게 끊겼다 — 양보 ${y}번(마을 ${N}곳 · 사이에 다른 판 셈 ${mixed}번)`);
  ok(!!m && m.length === N && diff === 0, `★★조각으로 민 셈이 전쌍과 **완전히 같다** — 불일치 ${diff}칸`);
}

// ── ⑦ ★[T968] 마감 밖에서 다 센 셈은 주입 앞에서 선다(`hold`) — 주입은 하루 마감 ⑪ 이 한다 ──────────────
say('\n[⑦ ★[T968] 다 센 셈은 주입 앞에서 선다 · 이어 밀면 같은 주입]');
{
  const fs = require('fs');
  const V = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  ok(/const T968_DIST_BG = process\.env\.T968_DIST_BG !== '0';/.test(V), '손잡이 — 켬 기본 · `=0` 만 끔(T957 그대로)');
  ok((V.match(/if \(!TB\.out\(TICK_SLICE_MS, 'dist'\)\) try \{ _t968DistBg\(\); \} catch \(e\) \{\}/g) || []).length === 2, '마감 밖 두 자리(결정 문 뒤 · 종전 자리) 다 교역로 다시 파기 다음 차례');
  ok(/function _t968DistBg\(\) \{\n  if \(!T957_DIST_SLICE \|\| !T968_DIST_BG \|\| state\.tickJobs\) return;/.test(V), '마감 중엔 안 민다 · T957 끔이면 안 선다');
  const w = mkWorld(N);
  P._distProbe.setup(ta, ZONE, w, econ);
  quiet = true; const _l = console.log; console.log = () => {};
  const g = P._distProbe.gen('hold', { hold: true });
  let y = 0, r;
  for (;;) { r = g.next(); if (r.done || r.value === '_ready') break; y++; }
  const before = w._distMatrix;
  const r2 = g.next();
  console.log = _l; quiet = false;
  ok(r.value === '_ready' && !r.done, `[상황] 다 셌을 때 주입 앞에서 섰다(양보 ${y}번 뒤 '_ready')`);
  ok(before === undefined, '★주입 앞에서 선 동안 세계 행렬은 그대로다(옛 행렬 — 여기선 없음)');
  const m = w._distMatrix;
  let diff = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (!m || m[i][j] !== full.mat[i][j]) diff++;
  ok(r2.done && !!m && diff === 0, `★★이어 밀면 주입 — 전쌍과 완전히 같다(불일치 ${diff}칸)`);
}

// ── ⑧ ★[T977] 같은 격자면 BFS 0 — 바탕 행렬 = 다시 센 행렬(바이트) · 격자가 바뀌면 종전 BFS ───────────────
//   손잡이는 모듈을 읽을 때 정해지므로 켬 갈래는 **딸린 프로세스**(`T977_DIST_SAME=1` · 이 파일 `--t977`)가 돌고, 여기(끔)서 센 전쌍과 견준다.
say('\n[⑧ ★[T977 · T996 · T1011] 같은 격자면 BFS 0 · 바탕 = 다시 센 셈 · 바뀌면 종전 BFS · 환호 적재 뒤 바탕 다시 세움 / 미룸]');
{
  const fs = require('fs');
  const V = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  ok(/const T977_DIST_SAME = process\.env\.T977_DIST_SAME !== '0';/.test(V), '손잡이 — ★T996 켬 기본 · `=0` 만 끔');
  ok(process.env.T977_DIST_SAME === '0' && P._distProbe.basis == null, '★끔이면 바탕을 안 만든다(위 ①~⑦ 셈 뒤에도 없음 · 이 프로세스 = 끔 갈래)');
  const { spawnSync } = require('child_process');
  { const e = Object.assign({}, process.env); delete e.T977_DIST_SAME;
    const d = spawnSync(process.execPath, [__filename, '--t977-default'], { env: e, encoding: 'utf8' });
    let D = null; try { D = JSON.parse((d.stdout || '').split('\n').filter((l) => l.startsWith('T996DEF '))[0].slice(8)); } catch (x) {}
    ok(!!D && D.env === null && D.basis === true, `★제품 기본(env 없음)이 켬 — 셈 뒤 바탕이 선다(${JSON.stringify(D)})`); }
  ok(/try \{ if \(SimVillages\.distBasisRefresh\) SimVillages\.distBasisRefresh\(\); \} catch \(e\) \{\}/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8')), '[T996] 환호 적재(`refreshDitchCells`) 끝에서 바탕 다시 세움을 부른다');
  const c = spawnSync(process.execPath, [__filename, '--t977'], { env: Object.assign({}, process.env, { T977_DIST_SAME: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 });
  let J = null; try { J = JSON.parse((c.stdout || '').split('\n').filter((l) => l.startsWith('T977JSON '))[0].slice(9)); } catch (e) {}
  ok(c.status === 0 && !!J, `딸린 프로세스(켬) 끝 — 종료 ${c.status}`);
  if (J) {
    const enc = (m) => m.map((r) => r.map((d) => (isFinite(d) ? d : null)));
    const F = enc(full.mat), eq = (a, b) => { let d = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (a[i][j] !== b[i][j]) d++; return d; };
    ok(J.basis1 && eq(J.m1, F) === 0, `[켬] 처음 셈(바탕 없음)이 끔 전쌍과 같다(불일치 ${eq(J.m1, F)}칸) · 바탕을 만들었다`);
    ok(J.tag2 && J.y2 > 0, `[상황] 무효화(메모 비움) 뒤 같은 격자 — 확인만 했다(로그 '같은 격자 · BFS 0' · 양보 ${J.y2}번)`);
    ok(eq(J.m2, F) === 0, `★★같은 격자 셈 = 끔 전쌍 — 바이트 동일(불일치 ${eq(J.m2, F)}칸)`);
    ok(J.d3 > 0 && !J.tag3, `[상황] 격자를 바꿨다(마을 0 둘레 반경 8 노드 막음 — 행렬이 ${J.d3}칸 달라진다) · 같은 격자 문을 안 탔다`);
    ok(J.e3 === 0, `★★격자가 바뀌면 종전 BFS — 바탕 없이 센 셈과 같다(불일치 ${J.e3}칸)`);
    ok(!J.tag4 && J.e4 === 0, `★마을 좌표가 다르면 같은 격자 문을 안 탄다 · 바탕 없이 센 셈과 같다(불일치 ${J.e4}칸)`);
    ok(J.gate0 === false && J.gate1 === true, `[T996] 바탕이 없으면 다시 세움이 안 선다 · 있으면 선다(${J.gate0} · ${J.gate1})`);
    ok(J.tag5bfs && J.n5 > 0 && J.bd5 > 0, `[상황] 술어가 바뀐 뒤(무효화 없음) 바탕을 BFS 로 다시 세웠다 — 양보 ${J.n5}번 · 바탕 메모가 ${J.bd5}칸 바뀜`);
    ok(!J.inj5 && J.memo5, '★다시 세움은 주입 0(세계 행렬 그대로) · 공유 메모 무접촉(바이트 같음)');
    ok(J.tag6 && J.e6 === 0, `★★그다음 무효화는 같은 격자(BFS 0) — 바뀐 격자에서 바탕 없이 센 셈과 같다(불일치 ${J.e6}칸)`);
    ok(J.tag8 && J.e8 === 0, `★또 무효화도 같은 격자(BFS 0) — 전쌍과 같다(불일치 ${J.e8}칸)`);
    ok(J.gate7 && J.tag7, '[T996] 격자가 그대로면 다시 세움도 확인만(BFS 0)');
    ok(!J.tag5drop && J.basis5, '[T1011] 끔(기본)이면 미룸 갈래를 안 탄다 — 바탕을 다시 세웠다');
  }
  // ── [T1011] 미룸 갈래(`T1011_BASIS_LAZY=1`) — 같은 딸린 프로세스 시나리오를 켬으로
  const c2 = spawnSync(process.execPath, [__filename, '--t977'], { env: Object.assign({}, process.env, { T977_DIST_SAME: '1', T1011_BASIS_LAZY: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 });
  let K = null; try { K = JSON.parse((c2.stdout || '').split('\n').filter((l) => l.startsWith('T977JSON '))[0].slice(9)); } catch (e) {}
  ok(/const T1011_BASIS_LAZY = process\.env\.T1011_BASIS_LAZY === '1';/.test(V), '[T1011] 손잡이 — 끔 기본 · `=1` 만 켬');
  ok(c2.status === 0 && !!K, `[T1011] 딸린 프로세스(미룸) 끝 — 종료 ${c2.status}`);
  if (K) {
    ok(K.gate1 && K.tag5drop && !K.tag5bfs && K.n5 > 0, `[T1011 · 상황] 술어가 바뀐 뒤 확인만 했다 — 갈려서 BFS 없이 바탕을 내려놓음(양보 ${K.n5}번)`);
    ok(!K.basis5 && !K.inj5 && K.memo5, '★[T1011] 내려놓은 뒤 바탕 0 · 주입 0 · 공유 메모 무접촉');
    ok(!K.tag6 && K.e6 === 0, `★★[T1011] 첫 무효화는 BFS 한 번 — 바뀐 격자 전쌍과 같다(불일치 ${K.e6}칸)`);
    ok(K.gate7 && K.tag7, '[T1011] 격자가 그대로면 확인만 · 바탕 그대로(BFS 0)');
    ok(K.tag8 && K.e8 === 0, `★★[T1011] 그다음 무효화는 같은 격자(BFS 0) — 전쌍과 같다(불일치 ${K.e8}칸)`);
  }
}

say(`\n=== 거리행렬 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
