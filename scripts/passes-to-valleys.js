#!/usr/bin/env node
// === scripts/passes-to-valleys.js — 고개(원)를 계곡(선)으로 통합한다 ===
//
// ★[11차 재민 확정] "원 모양의 계곡은 없앨까? 전부 통로로 통합할까?" → 전부 계곡선으로.
//
// 왜: 실제 고개(령)는 능선이 낮아지는 **안부**를 넘어가는 길이다. 지도에서 보면 산줄기를 가로지르는
//   **가는 선**이지, 산이 지름 100m로 뻥 뚫린 구멍이 아니다. 지금 고개 10개는 전부 그 자리 산맥
//   두께보다 지름이 커서(41~58셀 반지름) 산맥을 통째로 지운다 — 쇠재 8,975셀, 한재 8,598셀….
//
// 방법: 고개마다 ①품은 산맥을 찾고 ②그 자리 능선의 접선에 **수직**으로 잘라 ③양끝이 뭍에 닿을 때까지
//   늘린다. 수직으로 자르는 게 핵심이다 — 비스듬히 자르면 같은 산줄기라도 파야 할 길이가 1.5~2배가 되고
//   상처가 길게 남는다(실측: 한울대간 정서 61셀 vs 수직 51셀).
//   물을 만나면 각도를 ±10°·±20°·±30° 틀어 다시 시도한다(계곡은 바위만 연다).
//
// 산맥 밖에 떠 있는 고개(지우는 바위 0셀 — 이름만 고개)는 가장 가까운 산맥 중심선으로 **옮긴 뒤** 자른다.
//
// 실행: node scripts/passes-to-valleys.js [--zone hanbando] [--width 10] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const ZID = val('--zone', 'hanbando');
const WCELL = parseFloat(val('--width', '10'));
const CELL = 32;
const EXT = 3;          // 바위 밖으로 더 물리는 여유(셀) — 끝이 절벽에 딱 붙어 끝나지 않게
const MAXLEN = 200;     // 이보다 길면 그건 고갯길이 아니라 산맥을 세로로 훑은 것
const SKIP = (val('--skip', '') || '').split(',').filter(Boolean);   // 손으로 놓을 것(자동 이동이 엉뚱한 경우)
const ZW = 2188, ZH = 4063;   // 존 셀 크기 — 산맥이 존 끝까지 뻗은 자리(쇠재·한재)는 **경계에서 끝나도 된다**
//   그쪽 이웃 존은 바다다. 즉 바다로 열리는 골짜기 — 실제 동해안 고개들이 하는 일과 같다.

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
// ★require 로 읽어야 한다 — terrain.js 도 같은 파일을 require 하므로 **같은 객체**를 공유한다.
//   fs.readFileSync + JSON.parse 로 따로 읽어서 고개를 지우면 terrain 은 그걸 못 보고, 고개 한복판을
//   "여긴 바위 아님"으로 답한다 → 길이 8셀짜리 가짜 계곡이 열 개 나온다(11차에 한 번 당했다).
const world = require(GAME);
const d = world[ZID];
const savedPasses = (d.passes || []).slice();
d.passes = [];   // ★고개를 뺀 상태의 지형으로 재야 한다 — 안 그러면 자기 구멍 안에서 "여긴 바위 아님"만 본다

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const rock = (x, y) => terrain.isRockCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const water = (x, y) => terrain.isWaterCellLocal(ZID, x * CELL + 16, y * CELL + 16);

const ridges = (d.ridges || []).filter((r) => !r._mirroredFrom && r.path && r.path.length > 1);
const P = (p) => p.pos ? p.pos : [p.x, p.y];

// 점을 품은(또는 가장 가까운) 산맥과 그 자리 접선
function hostOf(px, py) {
  let best = null;
  for (const r of ridges) {
    for (let i = 0; i < r.path.length - 1; i++) {
      const a = P(r.path[i]), b = P(r.path[i + 1]);
      const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
      let t = ((px - a[0]) * vx + (py - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const qx = a[0] + vx * t, qy = a[1] + vy * t;
      const hw = (r.path[i].width + (r.path[i + 1].width - r.path[i].width) * t) / 2;
      const dist = Math.hypot(px - qx, py - qy);
      if (!best || dist - hw < best.gap) best = { r, gap: dist - hw, dist, qx, qy, tx: vx, ty: vy, hw };
    }
  }
  return best;
}

console.log('=== 고개 → 계곡 · ' + ZID + ' · ' + savedPasses.length + '개 · 폭 ' + WCELL + '셀'
  + (APPLY ? ' · 기록' : ' · 계산만') + ' ===');

const made = [], failed = [];
for (const q of savedPasses) {
  if (SKIP.includes(q.name)) { console.log('  ' + q.name.padEnd(6) + ' — 건너뜀(손으로 놓는다)'); continue; }
  const h = hostOf(q.pos[0], q.pos[1]);
  if (!h) { failed.push([q.name, '품은 산맥 없음']); continue; }
  // 산맥 밖이면 중심선 위로 옮긴다(유령 고개 구제)
  const moved = h.gap > 0;
  const cx0 = moved ? h.qx : q.pos[0], cy0 = moved ? h.qy : q.pos[1];
  // 접선에 수직인 기준 방향
  const tl = Math.hypot(h.tx, h.ty) || 1;
  const nx0 = -h.ty / tl, ny0 = h.tx / tl;
  let got = null;
  for (const deg of [0, 10, -10, 20, -20, 30, -30]) {
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const nx = nx0 * ca - ny0 * sa, ny = nx0 * sa + ny0 * ca;
    const ends = [];
    for (const sgn of [+1, -1]) {
      let out = null, wet = false;
      for (let s = 1; s <= MAXLEN; s++) {
        const x = Math.round(cx0 / CELL + nx * sgn * s), y = Math.round(cy0 / CELL + ny * sgn * s);
        if (x < 0 || y < 0 || x >= ZW || y >= ZH) { out = s; break; }   // 존 경계 = 바다 쪽 — 여기서 끝나도 된다
        if (water(x, y)) { wet = true; break; }
        if (!rock(x, y)) { out = s + EXT; break; }
      }
      if (out == null || wet) { ends.length = 0; break; }
      ends.push(out);
    }
    if (ends.length === 2) { got = { nx, ny, a: ends[0], b: ends[1], deg }; break; }
  }
  if (!got) { failed.push([q.name, '물에 막혀 바위만 여는 축을 못 찾음']); continue; }
  // 4점 경로 — 가운데 두 점을 접선 방향으로 살짝 밀어 자연스러운 굽이
  const bend = Math.min(4, (got.a + got.b) / 10);
  const at = (s, off) => [
    Math.round(cx0 / CELL + got.nx * s + (h.tx / tl) * off),
    Math.round(cy0 / CELL + got.ny * s + (h.ty / tl) * off),
  ];
  const pts = [at(got.a, 0), at(got.a * 0.33, bend), at(-got.b * 0.33, -bend), at(-got.b, 0)];
  const len = got.a + got.b;
  made.push({ name: q.name, pts, len, moved, movedBy: moved ? Math.round(h.gap / CELL) : 0, deg: got.deg });
  console.log('  ' + q.name.padEnd(6) + ' ' + h.r.name.padEnd(5) + ' 길이 ' + len + '셀'
    + (got.deg ? ' · 축 ' + got.deg + '° 틀어' : '')
    + (moved ? ' · ★산맥 밖이라 중심선으로 ' + Math.round(h.gap / CELL) + '셀 옮김' : '')
    + ' · ' + pts.map((p) => p.join(',')).join(' → '));
}
for (const [n, why] of failed) console.log('  ★' + n + ' — ' + why);

if (!APPLY) { console.log('\n계산만 — 쓰려면 --apply'); process.exit(failed.length ? 1 : 0); }
if (failed.length) { console.error('\n실패가 있어 기록하지 않는다 — 먼저 해결할 것'); process.exit(1); }

d.valleys = d.valleys || [];
for (const m of made) {
  if (d.valleys.some((v) => v.name === m.name)) { console.error('이름 충돌: ' + m.name); process.exit(1); }
  d.valleys.push({ name: m.name, wasPass: true, path: m.pts.map((p) => ({ pos: [p[0] * CELL + 16, p[1] * CELL + 16], width: WCELL * CELL })) });
}
// 이웃 존에 복사돼 있던 **미러 사본**만 지운다 — 다른 존이 제 손으로 가진 고개는 건드리지 않는다
for (const z of Object.keys(world)) {
  if (z[0] === '_' || z === ZID || !world[z].passes) continue;
  world[z].passes = world[z].passes.filter((p) => !p._mirroredFrom);
}
d.passes = SKIP.length ? savedPasses.filter((q) => SKIP.includes(q.name)) : [];   // 건너뛴 건 남긴다(손으로 처리)
fs.copyFileSync(GAME, GAME + '.bak');
fs.writeFileSync(GAME, JSON.stringify(world));
console.log('\n★기록 완료 — 고개 ' + savedPasses.length + '개 → 계곡 ' + made.length + '개 (백업 .bak) · 도달성 감사를 이어서 돌릴 것');
