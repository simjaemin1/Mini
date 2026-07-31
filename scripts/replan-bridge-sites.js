#!/usr/bin/env node
// === scripts/replan-bridge-sites.js — 합류부(T자)에 놓인 다리를 옮기고, 옮겨도 되는지 실측한다 ===
//
// ★문제(재민 지적)
//   plan-bridges.js 의 목적함수는 **최단 도하** 하나였다. "여기가 다리 놓을 만한 자리냐"가 없었다.
//   그래서 7개 중 3개가 지류 어귀(합류부)에 박혔다 — audit-bridge-sites.js 실측:
//     · #1 한여울강 × 맑바람천   · #2 자란천 × 봉홧둑천   · #5 연화천 × 옥돌천
//   합류부는 유속·세굴이 최악이고 교두보가 두 물줄기 사이 쐐기가 된다. 실제로 #1의 남쪽 교두보는
//   반경 40셀 안에 뭍이 1,708칸뿐이었다(반대편 3,328칸의 절반).
//
// ★이 스크립트가 하는 일
//   ① 문제 다리마다 강을 따라 ±SHIFT 안에서 후보를 뽑는다
//        - 12셀 안에 **다른 강**이 없을 것(합류부 배제)
//        - 양쪽 교두보의 뭍이 반경 40셀 최대의 10% 이상일 것(쐐기 배제)
//        - 도하 폭이 현행 이하일 것(더 길어지면 안 옮긴다)
//   ② 선택안으로 새 다리 셀 목록을 만든다(규격 불변: 폭 2셀 · 양끝 뭍 접지 k=0..len+1)
//   ③ ★옮기고도 **연결성이 유지되는지**를 실셀 BFS로 검증한다 — 이게 핵심이다.
//        다리는 끊긴 섬을 잇자고 놓은 것이다. 예뻐지자고 옮겼다가 마을이 떨어지면 개악이다.
//        마을 50개 도달 여부를 현행 vs 제안으로 **전수 대조**하고, 하나라도 잃으면 그 안은 버린다.
//
// 실행: node scripts/replan-bridge-sites.js [zoneId] [SHIFT]
//   출력: 제안 요약 + 새 bridges 배열(zone-config.js 에 붙여넣을 형태) → /tmp/bridges-replan.json
'use strict';
const fs = require('fs');
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = process.argv[2] || 'hanbando';
const SHIFT = parseInt(process.argv[3] || '60', 10);
const Z = ZONES[ZID], SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ), N = NX * NY;
const BFS_R = 40, CAP = (BFS_R * 2 + 1) * (BFS_R * 2 + 1), WEDGE = CAP * 0.10;
const CONFL = 12;   // 이 셀 안에 다른 강이 있으면 합류부로 본다

const memo = new Uint8Array(N);
function kind(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return 3;
  const i = cy * NX + cx; let v = memo[i];
  if (v) return v;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  v = terrain.isWaterCellLocal(ZID, x, y) ? 2 : (terrain.isRockCellLocal(ZID, x, y) ? 3 : 1);
  memo[i] = v; return v;
}
const isWater = (cx, cy) => kind(cx, cy) === 2;
const isLand = (cx, cy) => kind(cx, cy) === 1;

const terr = terrain.ZONE_TERRAIN[ZID] || {};
function riversNear(cx, cy, rCells) {
  const names = new Set();
  for (const rv of (terr.rivers || [])) {
    const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((cx * SZ - ax) * vx + (cy * SZ - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const w1 = (a.width != null) ? a.width : (rv.width || 200), w2 = (b.width != null) ? b.width : (rv.width || 200);
      const hw = (w1 + (w2 - w1) * t) / 2;
      if (Math.hypot(cx * SZ - (ax + vx * t), cy * SZ - (ay + vy * t)) < hw + rCells * SZ) { names.add(rv.name); break; }
    }
  }
  return names;
}
// ★[결함 수정] 합류부 판정을 "0셀 안의 강 = 본류"로 잡으면, **합류부 한복판에서는 두 강이 모두 0셀**이라
//   본류 집합에 둘 다 들어가고 '다른 강'이 0개가 되어 합류부가 아니라고 나온다(#5가 실제로 그랬다 —
//   옥돌천 안쪽 -0.1셀 자리를 "합류부 아님"으로 추천했다).
//   ⇒ 본류는 **중심선이 가장 가까운 강 하나**로 정의하고, 나머지는 전부 '다른 강'으로 센다.
function mainRiverAt(cx, cy) {
  let best = null;
  for (const rv of (terr.rivers || [])) {
    const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((cx * SZ - ax) * vx + (cy * SZ - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(cx * SZ - (ax + vx * t), cy * SZ - (ay + vy * t));
      if (!best || d < best.d) best = { d, name: rv.name };
    }
  }
  return best ? best.name : null;
}
function otherRiversNear(cx, cy, rCells) {
  const own = mainRiverAt(cx, cy);
  return [...riversNear(cx, cy, rCells)].filter((n) => n !== own);
}
function headArea(cx, cy) {
  if (!isLand(cx, cy)) return 0;
  const vis = new Set([cx + ',' + cy]); const q = [[cx, cy]]; let n = 0;
  while (q.length) {
    const [x, y] = q.shift(); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (vis.has(k) || Math.abs(nx - cx) > BFS_R || Math.abs(ny - cy) > BFS_R || !isLand(nx, ny)) continue;
      vis.add(k); q.push([nx, ny]);
    }
  }
  return n;
}
function crossAt(cx, cy, axis) {
  const [dx, dy] = axis === '남북' ? [0, 1] : [1, 0];
  let a = 0; while (a < 400 && isWater(cx - dx * a, cy - dy * a)) a++;
  let b = 0; while (b < 400 && isWater(cx + dx * b, cy + dy * b)) b++;
  if (a >= 400 || b >= 400) return null;
  return { span: a + b - (isWater(cx, cy) ? 1 : 0), h1: [cx - dx * a, cy - dy * a], h2: [cx + dx * b, cy + dy * b] };
}

// ── 현행 다리 → 성분 ───────────────────────────────────────────────────────
const cur = [];
{ const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) cur.push([b[i], b[i + 1]]); }
const kk = (c) => c[0] + ',' + c[1];
const curSet = new Set(cur.map(kk));
const seenG = new Set(), groups = [];
for (const c of cur) {
  if (seenG.has(kk(c))) continue;
  const st = [c]; seenG.add(kk(c)); const g = [];
  while (st.length) {
    const q = st.pop(); g.push(q);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k2 = (q[0] + dx) + ',' + (q[1] + dy);
      if (curSet.has(k2) && !seenG.has(k2)) { seenG.add(k2); st.push([q[0] + dx, q[1] + dy]); }
    }
  }
  groups.push(g);
}

// ── 다리 셀 생성 — 규격 불변: 폭 2셀 · 양끝 뭍 접지 ────────────────────────
function makeBridge(h1, h2, axis) {
  const cells = [];
  const [dx, dy] = axis === '남북' ? [0, 1] : [1, 0];
  const [px, py] = axis === '남북' ? [1, 0] : [0, 1];   // 폭 방향
  const len = Math.abs(axis === '남북' ? (h2[1] - h1[1]) : (h2[0] - h1[0]));
  const sgn = (axis === '남북' ? Math.sign(h2[1] - h1[1]) : Math.sign(h2[0] - h1[0])) || 1;
  for (let k = 0; k <= len; k++) {
    const x = h1[0] + dx * sgn * k, y = h1[1] + dy * sgn * k;
    cells.push([x, y], [x + px, y + py]);
  }
  return cells;
}

// ── 도달성 BFS ─────────────────────────────────────────────────────────────
function flood(bridgeSet) {
  const seen = new Uint8Array(N), q = new Int32Array(N + 16);
  let head = 0, tail = 0;
  const blocked = (cx, cy) => {
    const k = kind(cx, cy);
    if (k === 3) return true;
    if (k === 2) return !bridgeSet.has(cx + '_' + cy);
    return false;
  };
  const push = (cx, cy) => { const i = cy * NX + cx; if (seen[i]) return; seen[i] = 1; q[tail++] = i; };
  const sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ);
  if (blocked(sx, sy)) { for (let r = 1; r <= 24; r++) { let ok = false; for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) if (!blocked(sx + dx, sy + dy)) { push(sx + dx, sy + dy); ok = true; break; } if (ok) break; } }
  else push(sx, sy);
  while (head < tail) {
    const i = q[head++], cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY || blocked(nx, ny)) continue;
      push(nx, ny);
    }
  }
  return { seen, n: tail };
}
const vs = terrain.getZoneVillages(ZID) || [];
function reachedVillages(seen, R) {
  R = R || 8;
  const out = [];
  for (const v of vs) {
    const cx = Math.round(v.x / SZ), cy = Math.round(v.y / SZ);
    let ok = false;
    for (let dy = -R; dy <= R && !ok; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < NX && y < NY && seen[y * NX + x]) { ok = true; break; }
    }
    if (ok) out.push(v.name);
  }
  return new Set(out);
}

console.log('=== 다리 재배치 계획 · ' + ZID + ' ===\n');
const base = flood(new Set([...curSet].map((s) => s.replace(',', '_'))));
const baseVil = reachedVillages(base.seen);
console.log('현행: 도달 ' + base.n.toLocaleString() + '셀 · 마을 ' + baseVil.size + '/' + vs.length + '\n');

const proposals = [];
groups.forEach((g, gi) => {
  const xs = g.map((c) => c[0]), ys = g.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const axis = (y1 - y0) >= (x1 - x0) ? '남북' : '동서';
  const mid = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
  const own = [mainRiverAt(mid[0], mid[1])];
  const others = otherRiversNear(mid[0], mid[1], CONFL);
  const c0 = crossAt(mid[0], mid[1], axis);
  const A0 = c0 ? Math.min(headArea(c0.h1[0], c0.h1[1]), headArea(c0.h2[0], c0.h2[1])) : 0;
  if (!others.length && A0 >= WEDGE) { console.log('다리#' + (gi + 1) + ' — 합류부 아님 · 교두보 정상 → 유지'); return; }

  const along = axis === '남북' ? [1, 0] : [0, 1];
  let best = null;
  for (let k = -SHIFT; k <= SHIFT; k++) {
    if (!k) continue;
    const cx = mid[0] + along[0] * k, cy = mid[1] + along[1] * k;
    if (!isWater(cx, cy)) continue;
    const c = crossAt(cx, cy, axis); if (!c) continue;
    if (c0 && c.span > c0.span) continue;                     // 더 길어지면 안 옮긴다
    if (otherRiversNear(cx, cy, CONFL).length) continue;
    const a1 = headArea(c.h1[0], c.h1[1]), a2 = headArea(c.h2[0], c.h2[1]);
    if (Math.min(a1, a2) < WEDGE) continue;
    // 점수: 폭이 좁을수록 · 좁은 쪽 교두보가 넓을수록 · 덜 움직일수록
    const score = c.span * 1000 - Math.min(a1, a2) * 0.2 + Math.abs(k) * 2;
    if (!best || score < best.score) best = { score, k, cx, cy, c, a1, a2 };
  }
  console.log('다리#' + (gi + 1) + '  ' + axis + ' · ' + own.join(',') + (others.length ? '  ★합류부(' + others.join(',') + ')' : '  ★교두보 쐐기'));
  console.log('   현행: 도하 ' + (c0 ? c0.span : '?') + '셀 · 교두보 ' + (c0 ? headArea(c0.h1[0], c0.h1[1]) : 0) + '/' + (c0 ? headArea(c0.h2[0], c0.h2[1]) : 0));
  if (!best) { console.log('   → ±' + SHIFT + '셀 안에 대안 없음. 유지.\n'); return; }
  console.log('   제안: ' + (best.k > 0 ? '+' : '') + best.k + '셀 이동 → 도하 ' + best.c.span + '셀 · 교두보 ' + best.a1 + '/' + best.a2
    + '  [' + best.c.h1.join(',') + '] ~ [' + best.c.h2.join(',') + ']');
  proposals.push({ gi: gi + 1, axis, old: g, cells: makeBridge(best.c.h1, best.c.h2, axis), k: best.k, span: best.c.span, a1: best.a1, a2: best.a2, own });
  console.log('');
});

if (!proposals.length) { console.log('제안 없음.'); process.exit(0); }

// ── ★연결성 검증 — 옮기고도 마을을 하나도 잃지 않는가 ──────────────────────
console.log('=== 연결성 검증(실셀 BFS · 마을 ' + vs.length + '개 전수) ===');
const newCells = [];
{
  const drop = new Set();
  for (const p of proposals) for (const c of p.old) drop.add(kk(c));
  for (const c of cur) if (!drop.has(kk(c))) newCells.push(c);
  for (const p of proposals) newCells.push(...p.cells);
}
const newSet = new Set(newCells.map((c) => c[0] + '_' + c[1]));
const after = flood(newSet);
const afterVil = reachedVillages(after.seen);
const lost = [...baseVil].filter((n) => !afterVil.has(n));
const gained = [...afterVil].filter((n) => !baseVil.has(n));
console.log('  현행  도달 ' + base.n.toLocaleString() + '셀 · 마을 ' + baseVil.size);
console.log('  제안  도달 ' + after.n.toLocaleString() + '셀 · 마을 ' + afterVil.size + '  (Δ ' + (after.n - base.n >= 0 ? '+' : '') + (after.n - base.n).toLocaleString() + '셀)');
console.log('  ★잃은 마을: ' + (lost.length ? lost.join(', ') : '없음') + (gained.length ? '   / 얻은 마을: ' + gained.join(', ') : ''));
console.log('  다리 셀: ' + cur.length + ' → ' + newCells.length);
const ok = lost.length === 0;
console.log('\n판정: ' + (ok ? 'PASS — 옮겨도 연결성 손실 0' : 'FAIL — 마을을 잃는다. 이 안은 버린다.'));

fs.writeFileSync('/tmp/bridges-replan.json', JSON.stringify({
  zone: ZID, ok, lost, gained,
  proposals: proposals.map((p) => ({ n: p.gi, river: p.own, shift: p.k, span: p.span, heads: [p.a1, p.a2], cells: p.cells.length })),
  bridges: newCells.flat(),
}));
console.log('상세 → /tmp/bridges-replan.json (bridges 배열 포함)');
process.exit(ok ? 0 : 1);
