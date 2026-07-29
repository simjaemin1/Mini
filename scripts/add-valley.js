#!/usr/bin/env node
// === scripts/add-valley.js — 산맥을 가로지르는 **계곡**(선형 통로)을 낸다 ===
//
// ★[11차 재민 확정] "산은 완벽한 콜라이더다. 하지만 원래 뚫려 있는 곳이 있어야 광산마을도 살 수 있다.
//   그걸 계곡이라고 부르자." — 고개(pass)는 반지름 41~58셀짜리 **원**이라 산을 100m씩 통째로 지운다.
//   계곡은 강과 같은 path+width 형식의 **선**이다: 좁고 길어 산맥이 산맥답게 남는다.
//
// 규격: server/terrain.js isRockCellLocal 이 valleys 를 '바위 아님'으로 처리(고개와 같은 우선순위).
//       클라 public/terrain.js 도 같은 거울 — 한쪽만 고치면 유령 벽이 된다.
//
// 이 스크립트는 **재기만 하고**, --apply 라야 hanbando-terrain.json 에 쓴다.
// 실행: node scripts/add-valley.js --name 오지계곡 --path 1818,236 1832,240 1846,246 1858,250 1872,254 --width 10 [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const NAME = val('--name', null);
const ZID = val('--zone', 'hanbando');
const WCELL = parseFloat(val('--width', '10'));
const CELL = 32;
if (!NAME) { console.error('--name 필요'); process.exit(2); }

// --path 뒤의 "x,y" 토큰들(다음 --플래그 전까지)
const pi = argv.indexOf('--path');
if (pi < 0) { console.error('--path 필요'); process.exit(2); }
const pts = [];
for (let i = pi + 1; i < argv.length && argv[i][0] !== '-'; i++) {
  const [x, y] = argv[i].split(',').map(Number);
  if (!isFinite(x) || !isFinite(y)) { console.error('경로점 형식 x,y: ' + argv[i]); process.exit(2); }
  pts.push([x, y]);
}
if (pts.length < 2) { console.error('경로점 2개 이상 필요'); process.exit(2); }

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const rock = (x, y) => terrain.isRockCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const water = (x, y) => terrain.isWaterCellLocal(ZID, x * CELL + 16, y * CELL + 16);

console.log('=== 계곡 「' + NAME + '」 · ' + ZID + (APPLY ? ' · 기록' : ' · 계산만') + ' ===');
console.log('  경로 ' + pts.map((p) => p.join(',')).join(' → ') + ' · 폭 ' + WCELL + '셀');

// ① 통로가 실제로 무엇을 지나는가 — 바위를 뚫고 있는지, 물을 건드리는지
let len = 0, nRock = 0, nWater = 0, nLand = 0;
const seen = new Set();
for (let s = 0; s < pts.length - 1; s++) {
  const [x1, y1] = pts[s], [x2, y2] = pts[s + 1];
  const d = Math.hypot(x2 - x1, y2 - y1); len += d;
  const n = Math.ceil(d * 2);
  for (let k = 0; k <= n; k++) {
    const t = k / n, cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
    const r = WCELL / 2;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (Math.hypot(dx, dy) > r) continue;
      const a = Math.round(cx + dx), b = Math.round(cy + dy), kk = a + ',' + b;
      if (seen.has(kk)) continue; seen.add(kk);
      if (water(a, b)) nWater++; else if (rock(a, b)) nRock++; else nLand++;
    }
  }
}
console.log('  덮는 셀 ' + seen.size + ' — 바위 ' + nRock + ' · 물 ' + nWater + ' · 이미 뭍 ' + nLand
  + '  (길이 ' + len.toFixed(0) + '셀=' + len.toFixed(0) + 'm)');
if (nWater) console.log('  ★물을 지난다 — 계곡은 바위만 열어야 한다(물 판정이 우선이라 실제로는 물로 남지만, 경로가 어긋났다는 신호다)');
if (!nRock) console.log('  ★바위를 하나도 안 지난다 — 이 계곡은 아무것도 열지 않는다');

// ② 양끝이 바위 **밖**에서 시작·끝나는가(허공에 뚫린 굴이 되지 않게)
for (const [lab, p] of [['시작', pts[0]], ['끝', pts[pts.length - 1]]]) {
  const isr = rock(p[0], p[1]), isw = water(p[0], p[1]);
  console.log('  ' + lab + ' (' + p.join(',') + ') = ' + (isw ? '물 ★' : isr ? '바위 ★산 안에서 끝난다' : '뭍 ✔'));
}

if (!APPLY) { console.log('\n계산만 — 쓰려면 --apply'); process.exit(0); }
const d = world[ZID];
d.valleys = d.valleys || [];
if (d.valleys.some((v) => v.name === NAME)) { console.error('이미 있음: ' + NAME); process.exit(1); }
// ★점 형식은 강·산맥과 **같아야 한다**: {pos:[x,y], width} — terrain.js _isPointInRiver 가 pos/배열만 읽는다
//   ({x,y}로 넣으면 좌표가 undefined 로 읽혀 계곡이 아무 데도 안 생긴다. 11차에 한 번 당했다.)
d.valleys.push({ name: NAME, path: pts.map((p) => ({ pos: [p[0] * CELL + 16, p[1] * CELL + 16], width: WCELL * CELL })) });
fs.copyFileSync(GAME, GAME + '.bak');
fs.writeFileSync(GAME, JSON.stringify(world));
console.log('\n★기록 완료 (백업 .bak) — 도달성 감사를 이어서 돌릴 것');
