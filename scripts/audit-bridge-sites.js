#!/usr/bin/env node
// === scripts/audit-bridge-sites.js — 다리 자리가 "지을 만한 자리"인가를 실측한다 ===
//
// ★왜 필요한가(재민 지적: "다리를 누가 T자 강에다 짓냐")
//   plan-bridges.js 는 **연결성만** 풀었다 — 끊긴 성분과 본토를 잇는 **최단 도하**를 골랐다.
//   그 목적함수에는 "여기가 다리 놓을 만한 데냐"가 없다. 그래서 합류부(T자) 한복판이 뽑힐 수 있다.
//   합류부는 실제로 다리를 놓지 않는 자리다:
//     · 두 물줄기가 만나 유속·수심이 최악이고 세굴이 심하다(교각이 버티지 못한다)
//     · 교두보가 두 강 사이 **모래톱 쐐기**가 되어, 건너가도 갈 데가 없다
//     · 도하선이 지류 어귀를 비스듬히 지나 폭이 오히려 넓어진다
//   그래서 다리마다 다음을 잰다:
//     ① 도하 폭(실셀)             — 실제 물 칸 수
//     ② 합류부까지 거리           — 다리 중심에서 가장 가까운 **다른 강**까지 셀 거리
//     ③ 교두보 뭍 넓이            — 양끝 착지 칸에서 BFS(물·바위 제외, 반경 40셀) 도달 칸 수
//     ④ 상·하류 대안              — 같은 강 축을 따라 ±MAXSHIFT 안에서 더 나은 자리가 있는가
//                                   (더 좁고 · 합류부에서 멀고 · 교두보가 넓은 자리)
//
// 실행: node scripts/audit-bridge-sites.js [zoneId] [최대이동셀]
'use strict';
const path = require('path');
const T = require(path.join(__dirname, '..', 'server', 'terrain.js'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config.js'));

const ZID = process.argv[2] || 'hanbando';
const MAXSHIFT = parseInt(process.argv[3] || '60', 10);   // 상·하류로 몇 셀까지 대안을 찾을지
const CELL = 32;
const BFS_R = 40;              // 교두보 넓이를 재는 반경(셀)
const zc = ZONES[ZID];
if (!zc || !zc.bridges) { console.error('다리 없는 존:', ZID); process.exit(2); }

const water = (cx, cy) => T.isWaterCellLocal(ZID, cx * CELL + CELL / 2, cy * CELL + CELL / 2);
const rock = (cx, cy) => T.isRockCellLocal(ZID, cx * CELL + CELL / 2, cy * CELL + CELL / 2);
const land = (cx, cy) => !water(cx, cy) && !rock(cx, cy);
const NCX = Math.floor(zc.zoneWidth / CELL), NCY = Math.floor(zc.zoneHeight / CELL);
const inb = (cx, cy) => cx >= 0 && cy >= 0 && cx < NCX && cy < NCY;

// ── 다리 셀 → 4연결 성분(다리 N개) ────────────────────────────────────────
const cells = [];
for (let i = 0; i + 1 < zc.bridges.length; i += 2) cells.push([zc.bridges[i], zc.bridges[i + 1]]);
const key = (c) => c[0] + ',' + c[1];
const set = new Set(cells.map(key));
const seen = new Set(), groups = [];
for (const c of cells) {
  if (seen.has(key(c))) continue;
  const q = [c]; seen.add(key(c)); const g = [];
  while (q.length) {
    const cur = q.pop(); g.push(cur);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (cur[0] + dx) + ',' + (cur[1] + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([cur[0] + dx, cur[1] + dy]); }
    }
  }
  groups.push(g);
}

// ── 지표 ──────────────────────────────────────────────────────────────────
function headArea(cx, cy) {                       // 교두보에서 걸어 닿는 뭍 칸 수(반경 BFS_R)
  if (!inb(cx, cy) || !land(cx, cy)) return 0;
  const vis = new Set([cx + ',' + cy]); const q = [[cx, cy]]; let n = 0;
  while (q.length) {
    const [x, y] = q.shift(); n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (vis.has(k) || !inb(nx, ny)) continue;
      if (Math.abs(nx - cx) > BFS_R || Math.abs(ny - cy) > BFS_R) continue;
      if (!land(nx, ny)) continue;
      vis.add(k); q.push([nx, ny]);
    }
  }
  return n;
}
// 합류부 거리: 이 점에서 가장 가까운 "다른 강"까지 셀 거리(같은 강은 제외).
const terr = T.ZONE_TERRAIN[ZID] || null;
function riversAt(cx, cy, r) {                    // 반경 r 안에 걸치는 강 이름 집합
  const names = new Set();
  const t = terr || {};
  for (const rv of (t.rivers || [])) {
    const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay;
      const L2 = vx * vx + vy * vy || 1;
      let tt = ((cx * CELL - ax) * vx + (cy * CELL - ay) * vy) / L2; tt = Math.max(0, Math.min(1, tt));
      const w1 = (a.width != null) ? a.width : (rv.width || 200), w2 = (b.width != null) ? b.width : (rv.width || 200);
      const hw = (w1 + (w2 - w1) * tt) / 2;
      const d = Math.hypot(cx * CELL - (ax + vx * tt), cy * CELL - (ay + vy * tt));
      if (d < hw + r * CELL) { names.add(rv.name); break; }
    }
  }
  return names;
}
// ★[결함 수정] "0셀 안의 강 = 본류"로 잡으면 **합류부 한복판에서는 두 강이 모두 0셀**이라 둘 다 본류가 되고
//   '다른 강'이 0개 → 합류부를 놓친다. 본류는 **중심선이 가장 가까운 강 하나**로 정의한다.
function mainRiverAt(cx, cy) {
  let best = null;
  const t = terr || {};
  for (const rv of (t.rivers || [])) {
    const p = rv.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay;
      const L2 = vx * vx + vy * vy || 1;
      let tt = ((cx * CELL - ax) * vx + (cy * CELL - ay) * vy) / L2; tt = Math.max(0, Math.min(1, tt));
      const d = Math.hypot(cx * CELL - (ax + vx * tt), cy * CELL - (ay + vy * tt));
      if (!best || d < best.d) best = { d, name: rv.name };
    }
  }
  return best ? best.name : null;
}
function spanAt(cx, cy, axis) {                   // 그 자리에서의 실제 도하 폭(물 칸 수) + 양끝 착지 칸
  const [dx, dy] = axis === '남북' ? [0, 1] : [1, 0];
  let a = 0; while (a < 300 && water(cx - dx * a, cy - dy * a)) a++;
  let b = 0; while (b < 300 && water(cx + dx * b, cy + dy * b)) b++;
  if (a >= 300 || b >= 300) return null;
  return { span: a + b - (water(cx, cy) ? 1 : 0), h1: [cx - dx * a, cy - dy * a], h2: [cx + dx * b, cy + dy * b] };
}

console.log('=== 다리 자리 감사 · ' + ZID + ' (실셀 판정 = 게임 terrain.js 그대로) ===\n');
const report = [];
groups.forEach((g, gi) => {
  const xs = g.map((c) => c[0]), ys = g.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const axis = (y1 - y0) >= (x1 - x0) ? '남북' : '동서';
  const mid = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
  const s = spanAt(mid[0], mid[1], axis);
  const nm = [mainRiverAt(mid[0], mid[1])];
  const others = [...riversAt(mid[0], mid[1], 12)].filter((n) => !nm.includes(n));   // 12셀 안의 '다른 강' = 합류부
  const A1 = s ? headArea(s.h1[0], s.h1[1]) : 0, A2 = s ? headArea(s.h2[0], s.h2[1]) : 0;
  const cap = (BFS_R * 2 + 1) * (BFS_R * 2 + 1);
  const bad = [];
  if (others.length) bad.push('★합류부(12셀 안에 ' + others.join('·') + ')');
  if (Math.min(A1, A2) < cap * 0.10) bad.push('★교두보 쐐기(좁은 쪽 ' + Math.min(A1, A2) + '칸 = 반경 ' + BFS_R + ' 최대의 ' + (Math.min(A1, A2) / cap * 100).toFixed(1) + '%)');
  report.push({ gi: gi + 1, mid, axis, span: s ? s.span : null, cells: g.length, rivers: nm, others, A1, A2, bad, h1: s && s.h1, h2: s && s.h2 });
  console.log('다리#' + (gi + 1) + '  ' + axis + ' · ' + g.length + '셀 · x ' + x0 + '~' + x1 + ' y ' + y0 + '~' + y1);
  console.log('   강        : ' + (nm.join(', ') || '(없음?)') + (others.length ? '   ← 근처에 또: ' + others.join(', ') : ''));
  console.log('   실도하폭  : ' + (s ? s.span + '셀' : '측정불가'));
  console.log('   교두보 뭍 : ' + A1 + '칸 / ' + A2 + '칸  (반경 ' + BFS_R + ' 최대 ' + cap + ')');
  if (bad.length) console.log('   판정      : ' + bad.join(' + '));
  else console.log('   판정      : 무난');
  console.log('');
});

// ── 대안 탐색 ─────────────────────────────────────────────────────────────
console.log('=== 상·하류 대안(±' + MAXSHIFT + '셀) — 더 좁고 · 합류부에서 멀고 · 교두보 넓은 자리 ===\n');
for (const r of report) {
  if (!r.bad.length) { console.log('다리#' + r.gi + ' — 문제 없음, 탐색 생략'); continue; }
  const along = r.axis === '남북' ? [1, 0] : [0, 1];     // 도하축과 직교 = 강을 따라가는 방향
  const cands = [];
  for (let k = -MAXSHIFT; k <= MAXSHIFT; k++) {
    if (!k) continue;
    const cx = r.mid[0] + along[0] * k, cy = r.mid[1] + along[1] * k;
    if (!inb(cx, cy) || !water(cx, cy)) continue;
    const s = spanAt(cx, cy, r.axis); if (!s) continue;
    const own = mainRiverAt(cx, cy);
    const others = [...riversAt(cx, cy, 12)].filter((n) => n !== own);
    if (others.length) continue;                          // 합류부는 후보에서 제외
    const A1 = headArea(s.h1[0], s.h1[1]), A2 = headArea(s.h2[0], s.h2[1]);
    const cap = (BFS_R * 2 + 1) * (BFS_R * 2 + 1);
    if (Math.min(A1, A2) < cap * 0.10) continue;          // 쐐기 교두보도 제외
    cands.push({ k, cx, cy, span: s.span, A1, A2, h1: s.h1, h2: s.h2 });
  }
  cands.sort((a, b) => (a.span - b.span) || (Math.abs(a.k) - Math.abs(b.k)));
  console.log('다리#' + r.gi + ' (현행 도하 ' + r.span + '셀 · 교두보 ' + r.A1 + '/' + r.A2 + ')  후보 ' + cands.length + '개');
  for (const c of cands.slice(0, 5)) {
    console.log('   ' + (c.k > 0 ? '+' : '') + c.k + '셀 이동 → (' + c.cx + ',' + c.cy + ') 도하 ' + c.span + '셀 · 교두보 ' + c.A1 + '/' + c.A2
      + '   [' + c.h1.join(',') + '] ~ [' + c.h2.join(',') + ']');
  }
  if (!cands.length) console.log('   ±' + MAXSHIFT + '셀 안에 대안 없음 — 더 넓게 보거나 자리를 재설계해야 한다.');
  console.log('');
}
