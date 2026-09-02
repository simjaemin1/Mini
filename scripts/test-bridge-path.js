#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === T4 검증 하네스: 다리 층 — 어촌1 강 단절 해소 ===
// 실제 hanbando 지형 + zone-config의 bridges를 그대로 써서, 다리 **전/후** 도보 도달성을 대조한다.
//   · 통행 판정은 zone.js isTerrainBlockedLocal 과 **같은 식**을 재현: 바위=항상 차단,
//     물=차단하되 다리 셀이면 통행(다리는 물 위에만).
//   · 경로는 A*가 아니라 BFS 도달성으로 판정(A*는 노드 상한 1500이라 수천 셀 원거리엔 부적합 —
//     "경로가 존재하는가"라는 질문에는 BFS가 정확하다).
//
// 실행: node scripts/test-bridge-path.js [마을이름]   (기본 어촌1)
//   성분별 대표 마을로 3회 돌린다: 임업5(#0) · 농촌17(#9) · 어촌8(#10) · 어촌1(#12)
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = 'hanbando';
const Z = ZONES[ZID], SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ);

const BRIDGE = new Set();
{ const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BRIDGE.add(b[i] + '_' + b[i + 1]); }

const memo = new Uint8Array(NX * NY);   // 0 미평가 1 뭍 2 물 3 바위
function kind(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return 3;
  const i = cy * NX + cx; let v = memo[i];
  if (v) return v;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  v = terrain.isWaterCellLocal(ZID, x, y) ? 2 : (terrain.isRockCellLocal(ZID, x, y) ? 3 : 1);
  memo[i] = v; return v;
}
// zone.js isTerrainBlockedLocal 동형
const blocked = (cx, cy, useBridge) => {
  const k = kind(cx, cy);
  if (k === 3) return true;
  if (k === 2) return !(useBridge && BRIDGE.has(cx + '_' + cy));
  return false;
};

function reachable(sx, sy, tx, ty, useBridge, cap) {
  // ★상한 = 존 전체 셀 수(2188×4063 = 8.89M). 다리를 놓으면 도달 영역이 성분 합집합으로 커진다 —
  //   3M 상한을 쓰면 **다리가 제대로 놓였는데도 상한 소진으로 '도달 불가'가 나온다**(실제로 임업5·농촌17에서
  //   그렇게 오판했다). 상한은 "더 갈 데가 없음"을 뜻해야지 "예산이 떨어짐"을 뜻하면 안 된다.
  const LIM = cap || (NX * NY + 16);
  const seen = new Uint8Array(NX * NY);
  const q = new Int32Array(LIM);
  let head = 0, tail = 0, n = 0;
  const push = (cx, cy) => { const i = cy * NX + cx; if (seen[i]) return; seen[i] = 1; q[tail++] = i; };
  if (blocked(sx, sy, useBridge)) {   // 시작이 물이면 인접 뭍에서 출발
    let ok = false;
    for (let r = 1; r <= 20 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!blocked(sx + dx, sy + dy, useBridge)) { push(sx + dx, sy + dy); ok = true; break; }
    }
    if (!ok) return { ok: false, n: 0 };
  } else push(sx, sy);
  while (head < tail && n < LIM) {
    const i = q[head++]; n++;
    const cx = i % NX, cy = (i / NX) | 0;
    if (Math.abs(cx - tx) <= 2 && Math.abs(cy - ty) <= 2) return { ok: true, n };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      if (blocked(nx, ny, useBridge)) continue;
      if (tail < LIM) push(nx, ny);
    }
  }
  return { ok: false, n };
}

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('=== T4 다리 층 검증 (실지형 hanbando) ===');
console.log(`존 ${NX}×${NY}셀 · 다리 셀 ${BRIDGE.size}개`);
const TARGET = process.argv[2] || '어촌1';
const vs = terrain.getZoneVillages(ZID) || [];
const e1 = vs.find(v => v.name === TARGET);
chk(!!e1, `${TARGET} 좌표 ${e1 ? `(${Math.round(e1.x / SZ)},${Math.round(e1.y / SZ)})` : '없음'}`);
if (!e1) { console.log('대상 마을 없음 — 중단'); process.exit(1); }
const sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ);
const tx = Math.round(e1.x / SZ), ty = Math.round(e1.y / SZ);
console.log(`스폰(${sx},${sy}) → ${TARGET}(${tx},${ty}) 직선 ${Math.round(Math.hypot(tx - sx, ty - sy))}셀`);

console.log('\n[① 다리 전 — 도달 불가여야 함]');
let t0 = Date.now();
const before = reachable(sx, sy, tx, ty, false);
console.log(`  BFS 방문 ${before.n}셀 · ${Date.now() - t0}ms`);
chk(before.ok === false, `다리 없이 도보 도달: ${before.ok ? '가능(문제 — 애초에 단절이 아님)' : '불가 ✓ (강 단절 재현)'}`);

console.log('\n[② 다리 후 — 도달 가능해야 함]');
t0 = Date.now();
const after = reachable(sx, sy, tx, ty, true);
console.log(`  BFS 방문 ${after.n}셀 · ${Date.now() - t0}ms`);
chk(after.ok === true, `다리 놓고 도보 도달: ${after.ok ? '가능 ✓ (단절 해소)' : '불가(다리가 두 성분을 안 이음)'}`);

console.log('\n[③ 다리 셀 무결성]');
let onWater = 0, onRock = 0, onLand = 0;
for (const k of BRIDGE) {
  const [a, b] = k.split('_').map(Number);
  const kk = kind(a, b);
  if (kk === 2) onWater++; else if (kk === 3) onRock++; else onLand++;
}
console.log(`  물 위 ${onWater} · 뭍(접지) ${onLand} · 바위 ${onRock}`);
chk(onRock === 0, '바위 위 다리 0칸(다리는 물 위에만 — 산맥은 안 뚫음)');
chk(onWater > 0, `물 위 상판 ${onWater}칸(실제 도하 구간)`);
chk(onLand >= 2, `양끝 접지 ${onLand}칸(뭍에 걸침)`);
// 폭 2 연속성: 같은 행/열이 쌍으로 존재
let pairMiss = 0;
for (const k of BRIDGE) { const [a, b] = k.split('_').map(Number); if (!BRIDGE.has((a + 1) + '_' + b) && !BRIDGE.has((a - 1) + '_' + b)) pairMiss++; }
chk(pairMiss === 0, `폭 2셀 교행 연속성 — 짝 없는 칸 ${pairMiss}`);

console.log('\n[④ 바위는 여전히 차단(회귀)]');
let rockCells = 0, rockBlocked = 0;
for (let i = 0; i < 4000; i++) {
  const cx = (i * 137) % NX, cy = (i * 971) % NY;
  if (kind(cx, cy) === 3) { rockCells++; if (blocked(cx, cy, true)) rockBlocked++; }
}
chk(rockCells === 0 || rockBlocked === rockCells, `표본 바위 ${rockCells}칸 전부 차단 유지(${rockBlocked})`);

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
