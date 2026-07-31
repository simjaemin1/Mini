#!/usr/bin/env node
// === scripts/plan-small-forests.js — 소외 구역에 **자잘한 숲**을 뿌린다 ===
//
// ★[11차 재민 확정 순서] ①지류를 소외구역에 더 추가 → **②자잘한 숲 구역 추가** → ③남은 곳에 자잘 광맥
//   지류는 3개만 가능했다(14개는 바위 관통·마을 관통·산맥 나란함으로 정당하게 걸러짐).
//   물을 더 못 넣는 자리엔 숲으로 생계를 만든다 — 임업·사냥·채집이 한꺼번에 열린다.
//
// 소외 정의(audit-neglect 와 동일): 물까지 ≥180셀 **그리고** 숲까지 ≥180셀.
//   숲 하나가 생기면 그 덩이의 "숲 거리"가 무너져 소외에서 빠진다.
//
// 배치 원칙
//   · 숲 반경은 **자잘하게**(기본 40~90셀 타원). 기존 대수해(덕미수해 rx 11,000px=344셀)와 다르다.
//     한반도 내륙 산간의 실제 식생은 큰 수해가 아니라 골짜기마다 흩어진 잡목림이다.
//   · 소외 덩이의 **가장 깊은 점**(내접 반경 최대점)에 먼저 놓는다 — 한 개로 가장 많이 지운다.
//   · 큰 덩이는 여러 개(덩이 내접 반경 / 60 개, 최대 4) — 하나로는 180셀 반경을 못 덮는다.
//   · 마을 중심 반경 VIL_CLEAR 안 금지 — **마을 안엔 숲이 없어야 한다**(11차 규약, clearTreesInCells).
//   · 물·바위 위 중심 금지. 기존 숲과 MIN_SEP 이상 이격(있는 숲을 덧칠하면 낭비).
//   · densityMult 는 1.4~1.8(잡목림) — 대수해 3.2 와 구분되게. getForestMultiplier > 1.2 라야
//     소외 판정에서 "숲"으로 세어진다.
//
// 실행: node scripts/plan-small-forests.js [--zone hanbando] [--max 40] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const APPLY = has('--apply');
const MAXN = parseInt(val('--max', '40'), 10);
const CELL = 32, S = 4;          // 소외 격자 간격(셀) — audit-neglect 와 동일
const DW = 180, DF = 180;        // 소외 기준(셀)
const R_MIN = 40, R_MAX = 90;    // 자잘한 숲 반경(셀)
const VIL_CLEAR = 55;            // 마을 중심 금지 반경(셀) — 영토(land.size×25 ≈ 반경 30)+여유
const MIN_SEP = 70;              // 기존 숲과 최소 이격(셀)
const MIN_COMP = 40;             // 이보다 작은 소외 덩이는 무시(격자 셀 수) — 가는 띠는 무해

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const GAME = path.join(__dirname, '..', 'server', ZID + '-terrain.json');
const doc = require(GAME);
const d = doc[ZID];
const Z = ZONES[ZID];
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);
const gw = Math.ceil(W / S), gh = Math.ceil(H / S);

console.log('=== 자잘한 숲 배치 · ' + ZID + ' · 격자 ' + gw + '×' + gh + '(' + S + '셀) ===');
console.log('기존 숲 ' + d.forests.length + '개 · 강 ' + d.rivers.length + '개 · 광맥 ' + d.ores.length + '개');

// ── 지형 표본 + 소외 판정 (audit-neglect 동형) ──
const t0 = Date.now();
const kind = new Uint8Array(gw * gh);   // 0평지 1물 2바위 3숲
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const x = gx * S + (S >> 1), y = gy * S + (S >> 1), px = x * CELL + 16, py = y * CELL + 16;
    kind[gy * gw + gx] = terrain.isWaterCellLocal(ZID, px, py) ? 1
      : (terrain.isRockCellLocal(ZID, px, py) ? 2 : (terrain.getForestMultiplier(ZID, px, py) > 1.2 ? 3 : 0));
  }
  if (gy % 200 === 0) process.stdout.write('  y ' + gy + '/' + gh + '\r');
}
console.log('  표본 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's                ');

function chamfer(pred) {   // 체임퍼 5·7 (격자 단위 ×S = 셀)
  const INF = 1 << 28, a = new Int32Array(gw * gh);
  for (let i = 0; i < a.length; i++) a[i] = pred(i) ? 0 : INF;
  const up = (i, j, c) => { if (a[j] + c < a[i]) a[i] = a[j] + c; };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!a[i]) continue; if (x > 0) up(i, i - 1, 5); if (y > 0) up(i, i - gw, 5); if (x > 0 && y > 0) up(i, i - gw - 1, 7); if (x < gw - 1 && y > 0) up(i, i - gw + 1, 7); }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!a[i]) continue; if (x < gw - 1) up(i, i + 1, 5); if (y < gh - 1) up(i, i + gw, 5); if (x < gw - 1 && y < gh - 1) up(i, i + gw + 1, 7); if (x > 0 && y < gh - 1) up(i, i + gw - 1, 7); }
  return a;
}
const dW = chamfer((i) => kind[i] === 1), dF = chamfer((i) => kind[i] === 3);
const cd = (a, i) => a[i] / 5 * S;
const isLand = (i) => kind[i] !== 1 && kind[i] !== 2;
const neg = new Uint8Array(gw * gh);
let land = 0, negN = 0;
for (let i = 0; i < kind.length; i++) {
  if (!isLand(i)) continue; land++;
  if (cd(dW, i) >= DW && cd(dF, i) >= DF) { neg[i] = 1; negN++; }
}
console.log('  뭍 ' + land.toLocaleString() + '표본 중 소외 ' + negN.toLocaleString() + ' = ' + (negN / land * 100).toFixed(2) + '%');

// ── 덩이 라벨링 + 내접 반경(가장 깊은 점) ──
const inner = chamfer((i) => !neg[i]);
const lab = new Int32Array(gw * gh).fill(-1);
const comps = [];
for (let i = 0; i < neg.length; i++) {
  if (lab[i] >= 0 || !neg[i]) continue;
  const id = comps.length, st = [i]; lab[i] = id;
  let n = 0, inr = 0, ix = 0, iy = 0;
  const pts = [];
  while (st.length) {
    const q = st.pop(), x = q % gw, y = (q - x) / gw;
    n++; pts.push([x, y]);
    const r = cd(inner, q); if (r > inr) { inr = r; ix = x; iy = y; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const k = ny * gw + nx; if (lab[k] >= 0 || !neg[k]) continue; lab[k] = id; st.push(k);
    }
  }
  comps.push({ id, g: n, cells: n * S * S, inr: Math.round(inr), ix, iy, pts });
}
comps.sort((a, b) => b.inr - a.inr || b.g - a.g);
const big = comps.filter((c) => c.g >= MIN_COMP);
console.log('  소외 덩이 ' + comps.length + '개 · ' + MIN_COMP + '격자 이상 ' + big.length + '개');

// ── 배치 ──
const vs = terrain.getZoneVillages(ZID) || [];
const placed = [];   // {cx,cy,r} 셀 단위
const NAMES = ['숯골', '떡갈숲', '물푸레숲', '자작골', '싸리숲', '느티골', '박달숲', '옻나무골', '산벚숲', '굴참골',
  '가래숲', '오리목골', '층층숲', '고로쇠골', '단풍숲', '서어골', '쪽동백숲', '노간주골', '산초숲', '개옻골',
  '까치박달숲', '들메골', '음나무숲', '피나무골', '함박숲', '난티골', '복자기숲', '팥배골', '산딸숲', '아그배골',
  '보리수숲', '쉬나무골', '말채숲', '윤노리골', '덜꿩숲', '병꽃골', '광대싸리숲', '노린재골', '조록싸리숲', '땅비싸리골'];

function okAt(cx, cy, r) {
  if (cx < r || cy < r || cx >= W - r || cy >= H - r) return '존 밖';
  const px = cx * CELL + 16, py = cy * CELL + 16;
  if (terrain.isWaterCellLocal(ZID, px, py)) return '물 위';
  if (terrain.isRockCellLocal(ZID, px, py)) return '바위 위';
  for (const v of vs) { const dd = Math.hypot(v.x / CELL - cx, v.y / CELL - cy); if (dd < VIL_CLEAR + r * 0.5) return '마을 ' + v.name + ' 에서 ' + Math.round(dd) + '셀'; }
  for (const f of d.forests) {
    if (!f.center) continue;
    const fr = Math.max(f.rx || 0, f.ry || 0) / CELL;
    const dd = Math.hypot(f.center[0] / CELL - cx, f.center[1] / CELL - cy);
    if (dd < fr + r + MIN_SEP) return '기존 숲 ' + (f.name || '?') + ' 에서 ' + Math.round(dd) + '셀';
  }
  for (const p of placed) { const dd = Math.hypot(p.cx - cx, p.cy - cy); if (dd < p.r + r + MIN_SEP) return '새 숲에서 ' + Math.round(dd) + '셀'; }
  return null;
}

const added = [];
const skip = {};
let nameI = 0;
for (const c of big) {
  if (added.length >= MAXN) break;
  // 큰 덩이는 여러 개 — 하나로는 180셀 반경을 못 덮는다
  const want = Math.max(1, Math.min(4, Math.round(c.inr / 60)));
  // 후보: 가장 깊은 점부터, 그리고 덩이 안에서 서로 떨어진 점들
  const cand = [[c.ix, c.iy]];
  const step = Math.max(1, Math.floor(c.pts.length / 400));
  for (let i = 0; i < c.pts.length; i += step) cand.push(c.pts[i]);
  let made = 0;
  for (const [gx, gy] of cand) {
    if (made >= want || added.length >= MAXN) break;
    const cx = gx * S + (S >> 1), cy = gy * S + (S >> 1);
    // 반경은 덩이 크기에 맞춘다(작은 덩이에 큰 숲을 넣으면 낭비)
    const r = Math.max(R_MIN, Math.min(R_MAX, Math.round(c.inr * 0.8)));
    const why = okAt(cx, cy, r);
    if (why) { skip[why.replace(/\d+/g, 'N')] = (skip[why.replace(/\d+/g, 'N')] || 0) + 1; continue; }
    // 타원으로 살짝 찌그러뜨린다(완벽한 원이면 지도에서 인공적으로 보인다)
    const h = ((cx * 374761393 + cy * 668265263) >>> 8) % 1000 / 1000;
    const rx = Math.round(r * (0.75 + h * 0.5)), ry = Math.round(r * (0.75 + (1 - h) * 0.5));
    const nm = NAMES[nameI % NAMES.length] + (nameI >= NAMES.length ? String(Math.floor(nameI / NAMES.length) + 1) : '');
    nameI++;
    added.push({ name: nm, center: [cx * CELL + 16, cy * CELL + 16], rx: rx * CELL, ry: ry * CELL, densityMult: +(1.4 + h * 0.4).toFixed(2), _comp: c.id, _inr: c.inr, _rc: [rx, ry] });
    placed.push({ cx, cy, r: Math.max(rx, ry) });
    made++;
  }
}

console.log('\n만든 숲 ' + added.length + '개');
for (const a of added) console.log('  「' + a.name + '」 (' + Math.round(a.center[0] / CELL) + ',' + Math.round(a.center[1] / CELL) + ') 반경 ' + a._rc[0] + '×' + a._rc[1] + '셀 · 밀도 ' + a.densityMult + ' · 소외덩이 반경 ' + a._inr);
const sk = Object.entries(skip).sort((a, b) => b[1] - a[1]);
if (sk.length) console.log('건너뜀 ' + sk.reduce((s, e) => s + e[1], 0) + ': ' + sk.slice(0, 6).map(([k, v]) => k + '×' + v).join(' · '));

if (!APPLY) { console.log('\n★계산만 — 쓰려면 --apply'); process.exit(0); }
for (const a of added) d.forests.push({ name: a.name, center: a.center, rx: a.rx, ry: a.ry, densityMult: a.densityMult });
fs.writeFileSync(GAME, JSON.stringify(doc, null, 1));
console.log('\n★적용됨 → ' + GAME + ' (숲 ' + d.forests.length + '개)');
console.log('  다음: audit-neglect 재측정 → audit-terrain-quality → 셀맵·에디터 재빌드');
