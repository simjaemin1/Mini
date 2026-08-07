#!/usr/bin/env node
// =============================================================================
// 산 가림 시험 자리 찾기
//
// ★왜 필요한가: 바위는 **콜라이더**다. 능선 남쪽에서 북쪽으로 걸어가 산을 지나칠 수 없다.
//   그래서 "산이 내 남동쪽에 있는" 자리는 걸어서 못 만든다 — 처음부터 그런 자리에 서야 한다.
//
// 가림 조건(클라 `_mtDraw` 와 같은 식):
//   ⓐ 산이 나보다 뒤에 정렬 : (mx+my)/2 > (px+py)/2 + 500   ← 플레이어 z 편향 +500
//   ⓑ 몸통이 나까지 닿는다  : 화면 세로차 < 앵커높이 oy*sc*vy
//   ⓒ 가로로 겹친다        : |Δiso.x| < 그린 폭의 절반
// 세그먼트는 `mock-mountain-cover.js` 의 placeA 와 같은 규약(= 클라 `_mtPlaceRidge` 이식 정본).
// ★단 이건 **자리 고르기**일 뿐이고, 판정 자체는 e2e 가 클라의 `__mtOccDbg` 로 한다.
// =============================================================================
'use strict';
const fs = require('fs'), path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const HARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const MTD = path.join(ROOT, 'public', 'assets', 'mountains');
const AN = JSON.parse(fs.readFileSync(path.join(MTD, 'mountain_anchors.json'), 'utf8'));
const CROSS_U = 10.1, ALONG_U = 4.8, PPU_SCR = 64 / Math.SQRT2;
// ★알파 지도 — **굽는 쪽이 만든 정본**(`mountain_alpha.json`)을 클라와 함께 쓴다.
//   전엔 여기서 PNG 를 직접 읽어 따로 만들었다. 둘이 같이 틀리면 판정이 통과한다(자명 통과).
//   상자만 보면 투명 여백(프레임의 86%)에 선 자리를 "가려졌다"고 잘못 고른다 — 실제로 그 덫에 빠졌다.
const _AJ = JSON.parse(fs.readFileSync(path.join(MTD, 'mountain_alpha.json'), 'utf8'));
const AN_N = _AJ.n || 64;
const ALPHA = {};
for (const k in _AJ.a) ALPHA[k] = Buffer.from(_AJ.a[k], 'base64');
function alphaAt(name, u, v) {
  const m = ALPHA[name]; if (!m) return 1;
  const ix = Math.max(0, Math.min(AN_N - 1, (u * AN_N) | 0)), iy = Math.max(0, Math.min(AN_N - 1, (v * AN_N) | 0));
  return m[iy * AN_N + ix] / 255;
}
const ROCKR = new Set(['한울대간', '눈메']);
const hash = (x, y, s) => { let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0; n = Math.imul(n ^ (n >>> 13), 1103515245); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const rock = (wx, wy) => T.isRockCellLocal('hanbando', Math.floor(wx / 32) * 32 + 16, Math.floor(wy / 32) * 32 + 16);

const SEGS = [];
for (const r of HARD.ridges) {
  const pts = r.path.map((p) => ({ x: p.pos[0], y: p.pos[1], w: p.width }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  const band = (px, py, ang) => { const nx = -Math.sin(ang), ny = Math.cos(ang); if (!rock(px, py)) return { n: 0, off: 0 }; let a = 0, b = 0; for (let k = 1; k <= 30; k++) { if (rock(px + nx * k * 32, py + ny * k * 32)) a = k; else break; } for (let k = 1; k <= 30; k++) { if (rock(px - nx * k * 32, py - ny * k * 32)) b = k; else break; } return { n: a + b + 1, off: (a - b) / 2 }; };
  const isF = !ROCKR.has(r.name);
  for (let s = 0; s < total;) {
    const p0 = at(s), bc = band(p0.x, p0.y, p0.ang);
    const sc = Math.max(0.6, bc.n / CROSS_U * 0.96);
    if (bc.n >= 2) {
      let deg = (p0.ang * 180 / Math.PI) % 180; if (deg < 0) deg += 180;
      const oct = Math.round(deg / 22.5) % 8;
      const x = p0.x + bc.off * 32 * -Math.sin(p0.ang), y = p0.y + bc.off * 32 * Math.cos(p0.ang);
      const rx = Math.round(x), ry = Math.round(y);
      const v = isF ? ((hash(rx, ry, 77) * 2) | 0) : ((hash(rx, ry, 77) * 3) | 0);
      SEGS.push({ x, y, name: (isF ? 'mt_F' : 'mt_G') + oct + 'v' + v, sc, vy: 0.86 + 0.28 * hash(rx, ry, 78) });
    }
    s += Math.max(40, ALONG_U * 32 * sc * 0.55);
  }
}
console.log(`세그먼트 ${SEGS.length}장`);

// 세그먼트를 (x+y) 로 정렬 — 후보마다 전 세그먼트를 훑지 않게
SEGS.sort((a, b) => (a.x + a.y) - (b.x + b.y));
const SUM = SEGS.map((s) => s.x + s.y);
function lowerBound(v) { let lo = 0, hi = SUM.length; while (lo < hi) { const m = (lo + hi) >> 1; if (SUM[m] < v) lo = m + 1; else hi = m; } return lo; }

function occluders(px, py) {
  const pz = (px + py) * 0.5 + 500, pIso = { x: px - py, y: (px + py) / 2 };
  const out = [];
  for (let i = lowerBound(pz * 2); i < SEGS.length; i++) {
    const s = SEGS[i], an = AN[s.name]; if (!an) continue;
    const dz = (s.x + s.y) * 0.5 - pz; if (dz > 4000) break;
    const sc = PPU_SCR / an.ppu * s.sc, vy = s.vy;
    const W = (an.w || 512) * sc, H = (an.h || 512) * sc * vy;
    const iso = { x: s.x - s.y, y: (s.x + s.y) / 2 };
    const dx = iso.x - an.ox * sc, dy = iso.y - an.oy * sc * vy;
    const u = (pIso.x - dx) / W, v = (pIso.y - 14 - dy) / H;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue;
    const al = alphaAt(s.name, u, v);
    if (al > 0.35) out.push({ s, dz, u: +u.toFixed(2), v: +v.toFixed(2), a: +al.toFixed(2) });
  }
  return out;
}

// 걸을 수 있는 자리 격자 훑기
const best = [];
for (let cx = 200; cx < 3000; cx += 7) {
  for (let cy = 20; cy < 1400; cy += 7) {
    const wx = cx * 32 + 16, wy = cy * 32 + 16;
    if (T.isWaterCellLocal('hanbando', wx, wy) || T.isRockCellLocal('hanbando', wx, wy)) continue;
    const oc = occluders(wx, wy);
    if (oc.length) best.push({ cx, cy, n: oc.length, big: Math.max(...oc.map((o) => o.s.sc)), sample: oc[0] });
  }
}
best.sort((a, b) => (b.big * 10 + b.n) - (a.big * 10 + a.n));
console.log(`가려지는 걸을 수 있는 자리 ${best.length}곳 (7셀 간격 표본)`);
for (const b of best.slice(0, 8)) {
  console.log(`  cx ${b.cx} cy ${b.cy} · 가린 산 ${b.n}장 · 최대 배율 ${b.big.toFixed(2)} · ${b.sample.s.name} u${b.sample.u} v${b.sample.v} dz ${Math.round(b.sample.dz)}`);
}
if (!best.length) console.log('  ※ 한 곳도 없다 — 가림은 현행 배치에서 안 일어난다는 뜻이다.');
