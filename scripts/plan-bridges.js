#!/usr/bin/env node
// === 다리 계획기 (오프라인) ===
// 스폰(mainSquare)에서 뭍으로 도달 불가한 마을을 찾고, 그 마을을 본토에 잇는 **가장 좁은 물목**에
// 통나무 널다리를 놓을 셀을 계산한다. 결과를 zone-config.js 의 ZONES[zone].bridges 로 박아 넣는다
// (다리 = 맵에 만들어두는 사물 — path-core 계약 "물=차단, 다리 칸만 통행. 판정은 호출측 blocked 콜백 소관").
//
// 실행: node scripts/plan-bridges.js [zoneId]
//   출력: 도달성 진단 + 제안 다리 셀 배열(JSON)
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = process.argv[2] || 'hanbando';
const Z = ZONES[ZID];
if (!Z) { console.error('알 수 없는 존:', ZID); process.exit(1); }
const SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ);
const STEP = 4;                       // 코스 격자(=VILLAGE_DIST_STEP 동형) — 판정 8.9M → 0.55M
const CW = Math.ceil(NX / STEP), CH = Math.ceil(NY / STEP);

// 셀 판정 메모(0=미평가 1=뭍 2=물 3=바위) — 지형 콜이 ~11µs라 반복 조회를 캐시로 눌러야 실행 시간이 산다
const memo = new Uint8Array(NX * NY);
function cellKind(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return 3;
  const i = cy * NX + cx;
  let v = memo[i];
  if (v) return v;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  v = terrain.isWaterCellLocal(ZID, x, y) ? 2 : (terrain.isRockCellLocal(ZID, x, y) ? 3 : 1);
  memo[i] = v; return v;
}
const blockedCell = (cx, cy) => cellKind(cx, cy) !== 1;
const waterCell = (cx, cy) => cellKind(cx, cy) === 2;

console.log(`[다리 계획] ${ZID} ${NX}×${NY}셀 → 코스 ${CW}×${CH}(step ${STEP})`);
const t0 = Date.now();
// 코스 통행 격자 — 코스 셀 중심 1점 판정(교역 거리 행렬과 동일 근사)
const pass = new Uint8Array(CW * CH);
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) pass[j * CW + i] = blockedCell(i * STEP, j * STEP) ? 0 : 1;
console.log(`  통행 격자 구축 ${Date.now() - t0}ms · 뭍 ${pass.reduce((a, b) => a + b, 0)}/${CW * CH}`);

// 연결 성분 라벨링(4방)
const comp = new Int32Array(CW * CH).fill(-1);
let nComp = 0; const compSize = [];
const stack = [];
for (let s = 0; s < CW * CH; s++) {
  if (!pass[s] || comp[s] >= 0) continue;
  const id = nComp++; let sz = 0;
  stack.length = 0; stack.push(s); comp[s] = id;
  while (stack.length) {
    const c = stack.pop(); sz++;
    const ci = c % CW, cj = (c / CW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + dx, nj = cj + dy;
      if (ni < 0 || nj < 0 || ni >= CW || nj >= CH) continue;
      const n = nj * CW + ni;
      if (pass[n] && comp[n] < 0) { comp[n] = id; stack.push(n); }
    }
  }
  compSize.push(sz);
}
const at = (cx, cy) => comp[Math.min(CH - 1, Math.max(0, Math.round(cy / STEP))) * CW + Math.min(CW - 1, Math.max(0, Math.round(cx / STEP)))];
const nearestComp = (cx, cy, R) => {   // 중심이 물이면 주변에서 가장 가까운 뭍 성분
  for (let r = 0; r <= (R || 12); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const c = at(cx + dx * STEP, cy + dy * STEP);
    if (c >= 0) return c;
  }
  return -1;
};
console.log(`  연결 성분 ${nComp}개 · 최대 ${Math.max(...compSize)}칸`);

const msx = Math.round(Z.mainSquare.x / SZ), msy = Math.round(Z.mainSquare.y / SZ);
const mainC = nearestComp(msx, msy);
console.log(`  스폰(${msx},${msy}) 성분 #${mainC} (크기 ${compSize[mainC]})`);

const vs = terrain.getZoneVillages(ZID) || [];
const cut = [];
for (const v of vs) {
  const vx = Math.round(v.x / SZ), vy = Math.round(v.y / SZ);
  const c = nearestComp(vx, vy);
  if (c !== mainC) cut.push({ name: v.name, cx: vx, cy: vy, comp: c, size: c >= 0 ? compSize[c] : 0 });
}
console.log(`\n[도달 불가 마을] ${cut.length}/${vs.length}`);
for (const c of cut) console.log(`  · ${c.name} @(${c.cx},${c.cy}) 성분 #${c.comp} 크기 ${c.size}`);
if (!cut.length) { console.log('\n전 마을 도보 도달 가능 — 다리 불필요.'); process.exit(0); }

// ── 최협부 탐색: 대상 성분과 본토 성분 사이를 잇는 **가장 짧은 물 구간** ──
// 대상 마을 주변 박스에서 물 셀을 훑어, 축(4방향) 직선으로 물을 건너 반대편이 본토 성분이면 후보.
function findNeck(target, box) {
  const R = box || 260;                  // 셀 반경(=13.4km 상당) — 어촌 접근로 스캔 범위
  const cands = [];
  for (let cy = target.cy - R; cy <= target.cy + R; cy += 1) {
    for (let cx = target.cx - R; cx <= target.cx + R; cx += 1) {
      if (cx < 1 || cy < 1 || cx >= NX - 1 || cy >= NY - 1) continue;
      if (blockedCell(cx, cy)) continue;                       // 시작은 뭍
      if (at(cx, cy) !== target.comp) continue;                // 대상 섬 쪽 물가
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!waterCell(cx + dx, cy + dy)) continue;            // 바로 앞이 물이어야 물가
        let len = 0, x = cx + dx, y = cy + dy;
        while (len < 60 && waterCell(x, y)) { x += dx; y += dy; len++; }
        if (len === 0 || len >= 60) continue;
        if (blockedCell(x, y)) continue;                       // 반대편 착지점이 뭍이어야
        if (at(x, y) !== mainC) continue;                      // 반대편이 본토여야
        cands.push({ len, x0: cx, y0: cy, x1: x, y1: y, dx, dy,
          d: Math.hypot(cx - target.cx, cy - target.cy) });
      }
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (a.len - b.len) || (a.d - b.d));        // 최단 도하 → 마을에 가까운 순
  return cands[0];
}

const out = {};
for (const c of cut) {
  const t1 = Date.now();
  const neck = findNeck(c);
  if (!neck) { console.log(`\n  [${c.name}] 최협부 못 찾음(스캔 범위 밖 or 대양 분리) — 스킵`); continue; }
  console.log(`\n[${c.name}] 최협부: (${neck.x0},${neck.y0}) → (${neck.x1},${neck.y1}) 도하 ${neck.len}셀 · 마을거리 ${Math.round(neck.d)}셀 (${Date.now() - t1}ms)`);
  // 다리 셀 = 물 구간 전체 + **양끝 뭍 1칸**(접지). 폭 2셀(통나무 널다리 — 사람 교행).
  //   ★k는 0..len+1: k=0이 이쪽 뭍, k=1..len이 물, k=len+1이 건너편 뭍(착지).
  //   len까지만 깔면 상판이 물에서 끝나 '뭍에 안 걸친 다리'가 된다(하네스 ③에서 검출됨).
  const cells = [];
  const perp = neck.dx ? [0, 1] : [1, 0];
  for (let k = 0; k <= neck.len + 1; k++) {
    const bx = neck.x0 + neck.dx * k, by = neck.y0 + neck.dy * k;
    for (let w = 0; w < 2; w++) cells.push([bx + perp[0] * w, by + perp[1] * w]);
  }
  out[c.name] = { cells, span: neck.len, from: [neck.x0, neck.y0], to: [neck.x1, neck.y1] };
  console.log(`  다리 셀 ${cells.length}개(폭 2 × 길이 ${neck.len + 2})`);
}

console.log('\n=== zone-config ZONES.' + ZID + '.bridges 에 넣을 값 ===');
const flat = [];
for (const [nm, b] of Object.entries(out)) for (const c of b.cells) flat.push(c[0], c[1]);
console.log(JSON.stringify(flat));
console.log(`(flat [cx,cy,...] ${flat.length / 2}셀 · 대상 ${Object.keys(out).join(', ')})`);
console.log(`총 ${Date.now() - t0}ms`);
