#!/usr/bin/env node
// === scripts/repair-bridge-ends.js — 지형이 바뀌면 다리 끝이 물에 빠진다. 뭍에 닿을 때까지 늘린다 ===
//
// ★11차에 세 번 반복된 실패 모양:
//   강을 고칠 때마다(잇기·폭 정정·스무딩·단조화) 도하부 폭이 조금씩 달라진다.
//   그러면 기존 다리가 **한쪽 끝이 물 위에서 끝나** 건널 수 없게 되고, 도달 마을이 49 → 38로 무너진다.
//   매번 계획기(수 분)를 다시 돌릴 일이 아니다 — 자리는 그대로 두고 **끝만 뭍까지 늘리면** 된다.
//
// 규격 불변: 폭 2셀 · 축 4방 직선 · 양끝 뭍 접지 1칸.
// 실행: node scripts/repair-bridge-ends.js [--zone hanbando] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const ZID = val('--zone', 'hanbando');
const CELL = 32;
// ★연장 상한 — 이걸 넘으면 '끝이 조금 빠진 것'이 아니라 **도하 자체가 달라진 것**이다.
//   실측(다리#8): 살여울천 하구를 율호에 이으면서 물이 넓어져 46칸이 필요해졌다. 그건 수리가 아니라
//   새 다리다 — 억지로 늘리지 말고 계획기에 넘긴다.
const MAXEXT = parseFloat(val('--maxext', '12'));

const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const CFG = path.join(__dirname, '..', 'server', 'zone-config.js');
const { ZONES } = require(CFG);
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const Z = ZONES[ZID];
const water = (x, y) => terrain.isWaterCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const rock = (x, y) => terrain.isRockCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const land = (x, y) => !water(x, y) && !rock(x, y);

const cells = [];
for (let i = 0; i + 1 < Z.bridges.length; i += 2) cells.push([Z.bridges[i], Z.bridges[i + 1]]);
const kk = (c) => c[0] + ',' + c[1];
const set = new Set(cells.map(kk));
const seen = new Set(), groups = [];
for (const c of cells) {
  if (seen.has(kk(c))) continue;
  const st = [c]; seen.add(kk(c)); const g = [];
  while (st.length) { const q = st.pop(); g.push(q); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (q[0] + dx) + ',' + (q[1] + dy); if (set.has(k) && !seen.has(k)) { seen.add(k); st.push([q[0] + dx, q[1] + dy]); } } }
  groups.push(g);
}

console.log('=== 다리 끝 수리 · ' + ZID + ' · ' + groups.length + '개 · ' + cells.length + '셀 ' + (APPLY ? '· 기록' : '· 계산만') + ' ===');
const add = [], needPlan = [];
groups.forEach((g, gi) => {
  const xs = g.map((c) => c[0]), ys = g.map((c) => c[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const vertical = (y1 - y0) >= (x1 - x0);
  const [dx, dy] = vertical ? [0, 1] : [1, 0];      // 축 방향
  const [px, py] = vertical ? [1, 0] : [0, 1];      // 폭 방향(2셀)
  const lo = vertical ? y0 : x0, hi = vertical ? y1 : x1;
  const fix = vertical ? x0 : y0;                    // 폭 방향 첫 칸
  const at = (k) => vertical ? [fix, k] : [k, fix];
  const bothLand = (k) => { const [a, b] = at(k); return land(a, b) && land(a + px, b + py); };
  const anyWater = (k) => { const [a, b] = at(k); return water(a, b) || water(a + px, b + py); };
  const note = [];
  // 양 끝이 뭍에 닿아 있나
  for (const [dir, end] of [[-1, lo], [+1, hi]]) {
    if (bothLand(end)) continue;                     // 이미 접지
    let k = end, ext = 0; const tmp = []; let ok = false, blocked = false;
    while (ext < MAXEXT) {
      k += dir; ext++;
      const [a, b] = at(k);
      if (rock(a, b) || rock(a + px, b + py)) { blocked = true; break; }   // 바위는 못 뚫는다
      tmp.push([a, b], [a + px, b + py]);
      if (bothLand(k)) { ok = true; break; }
    }
    if (ok) { add.push(...tmp); note.push((dir < 0 ? '앞' : '뒤') + '쪽 ' + ext + '칸 연장'); }
    else { needPlan.push(gi + 1); note.push((dir < 0 ? '앞' : '뒤') + '쪽 ★' + (blocked ? '바위에 막힘' : MAXEXT + '칸 안에 뭍 없음 — 계획기 필요')); }
  }
  const wet = g.filter((c) => water(c[0], c[1])).length;
  console.log('  다리#' + (gi + 1) + ' ' + (vertical ? '남북' : '동서') + ' ' + g.length + '셀 · 물 ' + wet + ' · '
    + (note.length ? note.join(' · ') : '양끝 접지 정상 ✔'));
});

if (needPlan.length) console.log('\n★계획기로 다시 뽑아야 할 다리: #' + [...new Set(needPlan)].join(', #'));
if (!add.length) { console.log('\n수리할 것 없음'); process.exit(0); }
const uniq = [];
for (const c of add) if (!set.has(kk(c))) { set.add(kk(c)); uniq.push(c); }
console.log('\n추가 셀 ' + uniq.length + '개: ' + uniq.flat().join(','));
if (APPLY) {
  let s = fs.readFileSync(CFG, 'utf8');
  const m = s.match(/(\n    bridges: \[)([0-9,]+)(\],\n)/);
  if (!m) { console.error('앵커 못 찾음'); process.exit(1); }
  s = s.replace(m[0], m[1] + m[2] + ',' + uniq.flat().join(',') + m[3]);
  fs.writeFileSync(CFG, s);
  console.log('★zone-config 기록 — 다리 셀 ' + (cells.length + uniq.length));
} else console.log('계산만 — 기록하려면 --apply');
