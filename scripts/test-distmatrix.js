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

say(`\n=== 거리행렬 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
