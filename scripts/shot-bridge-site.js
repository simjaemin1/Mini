#!/usr/bin/env node
// === scripts/shot-bridge-site.js — 다리 자리 현행/제안을 셀 단위로 그려 비교 이미지 만들기 ===
// 게임 terrain.js 판정 그대로 창(window)을 래스터화하고, 현행 다리(빨강)·제안 다리(초록)를 겹쳐 그린다.
// 실행: node scripts/shot-bridge-site.js            (/tmp/bridges-replan.json 의 제안을 씀)
'use strict';
const fs = require('fs');
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = 'hanbando', SZ = 32;
const P = JSON.parse(fs.readFileSync('/tmp/bridges-replan.json', 'utf8'));
const Z = ZONES[ZID];

// 현행 다리 성분
const cur = []; { const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) cur.push([b[i], b[i + 1]]); }
const kk = (c) => c[0] + ',' + c[1];
const cset = new Set(cur.map(kk)), seen = new Set(), groups = [];
for (const c of cur) {
  if (seen.has(kk(c))) continue;
  const st = [c]; seen.add(kk(c)); const g = [];
  while (st.length) { const q = st.pop(); g.push(q); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (q[0] + dx) + ',' + (q[1] + dy); if (cset.has(k) && !seen.has(k)) { seen.add(k); st.push([q[0] + dx, q[1] + dy]); } } }
  groups.push(g);
}
const newCells = []; for (let i = 0; i + 1 < P.bridges.length; i += 2) newCells.push([P.bridges[i], P.bridges[i + 1]]);
const nset = new Set(newCells.map(kk));

const scenes = [];
for (const pr of P.proposals) {
  const g = groups[pr.n - 1];
  // ★제안 셀은 **이 다리 근처 것만** 골라야 한다 — 전부 넣으면 창이 지도 절반이 된다(첫 시도가 730×640셀이었다).
  const gx = g.map((c) => c[0]), gy = g.map((c) => c[1]);
  const bx0 = Math.min(...gx), bx1 = Math.max(...gx), by0 = Math.min(...gy), by1 = Math.max(...gy);
  const NEARBY = 120;
  const prop = newCells.filter((c) => !cset.has(kk(c))
    && c[0] > bx0 - NEARBY && c[0] < bx1 + NEARBY && c[1] > by0 - NEARBY && c[1] < by1 + NEARBY);
  const all = g.concat(prop);
  const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
  const PAD = 26;
  const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD, y0 = Math.min(...ys) - PAD, y1 = Math.max(...ys) + PAD;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const grid = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const px = x * SZ + SZ / 2, py = y * SZ + SZ / 2;
      row += terrain.isWaterCellLocal(ZID, px, py) ? 'w' : (terrain.isRockCellLocal(ZID, px, py) ? 'r' : '.');
    }
    grid.push(row);
  }
  // 제안 다리 셀만(현행과 겹치지 않는 것) — 이 창 안에 드는 것
  const mine = prop.filter((c) => c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1);
  scenes.push({ n: pr.n, river: pr.river, shift: pr.shift, span: pr.span, heads: pr.heads, x0, y0, w, h, grid, old: g, neo: mine });
}
fs.writeFileSync('/tmp/bridge-scenes.json', JSON.stringify(scenes));
console.log('장면 ' + scenes.length + '개 → /tmp/bridge-scenes.json');
for (const s of scenes) console.log('  #' + s.n + ' ' + s.river + ' 창 ' + s.w + '×' + s.h + '셀 · 현행 ' + s.old.length + '칸 · 제안 ' + s.neo.length + '칸');
