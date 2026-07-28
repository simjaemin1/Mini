#!/usr/bin/env node
// === 도보 도달성 감사 (실셀 정본) ===
// 계획기(plan-bridges.js)의 연결 성분 분해는 **코스 격자(step 4)** 근사라 1~3셀짜리 좁은 육교(isthmus)를
// 못 보고 "단절"로 오판한다. 이 스크립트는 **실셀(1셀) BFS 한 번**으로 스폰에서 도달 가능한 영역을 만들고
// 50개 마을 전부를 한 번에 판정한다 — 마을마다 BFS를 돌리는 것보다 훨씬 싸고, 결과가 정본이다.
//
// 실행: node scripts/audit-reachability.js [zoneId]
//   출력: 마을별 [다리 전 / 다리 후] 도달 여부 + 요약
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = process.argv[2] || 'hanbando';
const Z = ZONES[ZID], SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ);
const N = NX * NY;

const BRIDGE = new Set();
{ const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BRIDGE.add(b[i] + '_' + b[i + 1]); }

const memo = new Uint8Array(N);   // 0 미평가 1 뭍 2 물 3 바위
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

function flood(sx, sy, useBridge) {
  const seen = new Uint8Array(N);
  const q = new Int32Array(N + 16);
  let head = 0, tail = 0;
  const push = (cx, cy) => { const i = cy * NX + cx; if (seen[i]) return; seen[i] = 1; q[tail++] = i; };
  if (blocked(sx, sy, useBridge)) {
    let ok = false;
    for (let r = 1; r <= 24 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!blocked(sx + dx, sy + dy, useBridge)) { push(sx + dx, sy + dy); ok = true; break; }
    }
  } else push(sx, sy);
  while (head < tail) {
    const i = q[head++]; const cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      if (blocked(nx, ny, useBridge)) continue;
      push(nx, ny);
    }
  }
  return { seen, n: tail };
}

// 마을 도달 판정 = 마을 중심 반경 R 안에 도달 셀이 하나라도 있으면 도달(중심이 물·바위일 수 있음)
function villageReached(seen, cx, cy, R) {
  R = R || 8;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
    if (seen[y * NX + x]) return true;
  }
  return false;
}

const sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ);
const vs = terrain.getZoneVillages(ZID) || [];
console.log(`[도달성 감사] ${ZID} ${NX}×${NY}셀(${N.toLocaleString()}) · 마을 ${vs.length} · 다리 셀 ${BRIDGE.size}`);
console.log(`스폰 (${sx},${sy})`);

let t0 = Date.now();
const off = flood(sx, sy, false);
console.log(`\n다리 OFF 도달 영역: ${off.n.toLocaleString()}셀 (${((off.n / N) * 100).toFixed(1)}%) · ${Date.now() - t0}ms`);
t0 = Date.now();
const on = flood(sx, sy, true);
console.log(`다리 ON  도달 영역: ${on.n.toLocaleString()}셀 (${((on.n / N) * 100).toFixed(1)}%) · ${Date.now() - t0}ms`);
console.log(`다리로 열린 영역: +${(on.n - off.n).toLocaleString()}셀`);

const rows = [];
for (const v of vs) {
  const cx = Math.round(v.x / SZ), cy = Math.round(v.y / SZ);
  rows.push({ name: v.name, cx, cy, before: villageReached(off.seen, cx, cy), after: villageReached(on.seen, cx, cy) });
}
const already = rows.filter(r => r.before);
const opened = rows.filter(r => !r.before && r.after);
const still = rows.filter(r => !r.after);
console.log(`\n[요약] 원래 도달 ${already.length} · 다리로 열림 ${opened.length} · 여전히 불가 ${still.length} (총 ${rows.length})`);
console.log(`\n다리로 열린 마을(${opened.length}): ${opened.map(r => r.name).join(', ') || '-'}`);
console.log(`\n여전히 도달 불가(${still.length}):`);
for (const r of still) console.log(`  · ${r.name} @(${r.cx},${r.cy})`);
console.log(`\n원래부터 도달 가능했던 마을(${already.length}): ${already.map(r => r.name).join(', ')}`);
