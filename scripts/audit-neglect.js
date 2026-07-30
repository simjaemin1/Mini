#!/usr/bin/env node
// === scripts/audit-neglect.js — 소외 구역 정밀 검사 ===
//
// ★[11차 재민 지시] "좁게만 형성되면 괜찮지만, 드넓은 구역이 소외되어버리면 그건 밸런스가 안 맞잖아."
//
// 그래서 **총 면적%로는 부족하다.** 같은 5%라도 실낱같은 띠 백 개와 사방 200m 덩어리 하나는 다르다.
// 이 감사는 소외 구역을 **덩이 단위로** 재고, 덩이마다 두 값을 본다:
//   · 면적(셀)        — 얼마나 큰가
//   · **내접 반경**    — 덩이 안쪽으로 얼마나 깊이 들어가는가(= 덩이 경계까지 최대 거리)
//     길고 가는 띠는 면적이 커도 내접 반경이 작다. "드넓다"를 가르는 건 이 값이다.
//
// 소외 = 물까지 ≥ DW 이고 숲까지 ≥ DF (둘 다 멀어야 소외 — 하나만 멀면 그 하나로 먹고산다)
//
// 실행: node scripts/audit-neglect.js [--zone hanbando] [--dw 180] [--df 180] [--png /tmp/neglect.png]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const DW = parseFloat(val('--dw', '180'));
const DF = parseFloat(val('--df', '180'));
const PNG = val('--png', '/tmp/neglect.png');
const CELL = 32, S = 4;             // 4셀 격자 — 내접 반경을 셀 단위로 말할 수 있는 해상도

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const Z = ZONES[ZID];
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);
const gw = Math.ceil(W / S), gh = Math.ceil(H / S);

console.log('=== 소외 구역 검사 · ' + ZID + ' · 격자 ' + gw + '×' + gh + '(' + S + '셀) · 기준 물 ≥' + DW + ' & 숲 ≥' + DF + ' ===');
const t0 = Date.now();
const kind = new Uint8Array(gw * gh);   // 0평지 1물 2바위 3숲
for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
  const x = gx * S + (S >> 1), y = gy * S + (S >> 1), px = x * CELL + 16, py = y * CELL + 16;
  kind[gy * gw + gx] = terrain.isWaterCellLocal(ZID, px, py) ? 1
    : (terrain.isRockCellLocal(ZID, px, py) ? 2 : (terrain.getForestMultiplier(ZID, px, py) > 1.2 ? 3 : 0));
}
console.log('  격자 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');

// 체임퍼 거리(5·7) — 격자 단위 ×S = 셀
function chamfer(pred) {
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
console.log('  뭍 ' + land.toLocaleString() + '표본 중 소외 ' + negN.toLocaleString() + ' = ' + (negN / land * 100).toFixed(1) + '%');

// ── 덩이 라벨링 + 내접 반경(덩이 안에서 경계까지 체임퍼) ──
const inner = chamfer((i) => !neg[i]);   // 소외 아님에서의 거리 = 소외 덩이 안쪽 깊이
const lab = new Int32Array(gw * gh).fill(-1);
const comps = [];
for (let i = 0; i < neg.length; i++) {
  if (lab[i] >= 0 || !neg[i]) continue;
  const id = comps.length, st = [i]; lab[i] = id;
  let n = 0, sx = 0, sy = 0, inr = 0, ix = 0, iy = 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  while (st.length) {
    const q = st.pop(), x = q % gw, y = (q - x) / gw;
    n++; sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const r = cd(inner, q); if (r > inr) { inr = r; ix = x; iy = y; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const k = ny * gw + nx; if (lab[k] >= 0 || !neg[k]) continue; lab[k] = id; st.push(k);
    }
  }
  comps.push({ id, cells: n * S * S, inr: Math.round(inr), cx: Math.round(sx / n * S), cy: Math.round(sy / n * S),
    ix: ix * S, iy: iy * S, w: (x1 - x0 + 1) * S, h: (y1 - y0 + 1) * S });
}
comps.sort((a, b) => b.inr - a.inr || b.cells - a.cells);
console.log('\n소외 덩이 ' + comps.length + '개');

// ★"드넓다"의 판정 — 내접 반경으로 가른다. 반경 R이면 지름 2R 짜리 원이 통째로 들어간다는 뜻.
const BANDS = [[80, '★심각 — 사방 160셀(160m)이 통째로 빈다'], [50, '넓음'], [30, '보통'], [0, '가는 띠(무해)']];
const bandOf = (r) => BANDS.find((b) => r >= b[0]);
const agg = new Map();
for (const c of comps) { const b = bandOf(c.inr)[1]; const e = agg.get(b) || { n: 0, cells: 0 }; e.n++; e.cells += c.cells; agg.set(b, e); }
console.log('내접 반경별:');
for (const [, name] of BANDS) { const e = agg.get(name); if (e) console.log('  ' + name.padEnd(38) + ' 덩이 ' + String(e.n).padStart(3) + '개 · ' + e.cells.toLocaleString() + '셀 (뭍의 ' + (e.cells / (land * S * S) * 100).toFixed(1) + '%)'); }

console.log('\n큰 덩이 상위 10 (내접 반경 순):');
console.log('  반경  면적(셀)     중심          가장 깊은 점    bbox');
for (const c of comps.slice(0, 10)) {
  console.log('  ' + String(c.inr).padStart(4) + '  ' + String(c.cells).padStart(9) + '  (' + c.cx + ',' + c.cy + ')'.padEnd(6)
    + '   (' + c.ix + ',' + c.iy + ')'.padEnd(6) + '   ' + c.w + '×' + c.h);
}

// 마을이 어느 덩이에 앉아 있나
const vs = terrain.getZoneVillages(ZID) || [];
const hit = [];
for (const v of vs) {
  const gx = Math.min(gw - 1, Math.round(v.x / CELL / S)), gy = Math.min(gh - 1, Math.round(v.y / CELL / S));
  const i = gy * gw + gx; if (!neg[i]) continue;
  const c = comps.find((q) => q.id === lab[i]);
  hit.push({ n: v.name, inr: c ? c.inr : 0, cells: c ? c.cells : 0, dw: Math.round(cd(dW, i)), df: Math.round(cd(dF, i)) });
}
hit.sort((a, b) => b.inr - a.inr);
console.log('\n소외 덩이에 앉은 마을 ' + hit.length + '곳:');
for (const h of hit) console.log('  ' + h.n.padEnd(7) + ' 덩이 반경 ' + String(h.inr).padStart(3) + '셀 · 면적 ' + String(h.cells).padStart(8) + ' · 물 ' + h.dw + ' 숲 ' + h.df);

// ── PNG ──
const buf = Buffer.alloc(gw * gh * 3);
const put = (i, c) => { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; };
for (let i = 0; i < kind.length; i++) {
  if (kind[i] === 1) put(i, [46, 110, 168]);
  else if (kind[i] === 2) put(i, [112, 101, 88]);
  else if (!neg[i]) put(i, [74, 110, 66]);
  else { const r = cd(inner, i); put(i, r >= 80 ? [210, 60, 60] : r >= 50 ? [220, 120, 50] : r >= 30 ? [200, 180, 70] : [150, 160, 90]); }
}
for (const v of vs) {
  const gx = Math.round(v.x / CELL / S), gy = Math.round(v.y / CELL / S);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= gw || y >= gh) continue; put(y * gw + x, [255, 255, 255]); }
}
const raw = Buffer.alloc(gh * (gw * 3 + 1));
for (let y = 0; y < gh; y++) { raw[y * (gw * 3 + 1)] = 0; buf.copy(raw, y * (gw * 3 + 1) + 1, y * gw * 3, (y + 1) * gw * 3); }
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const ch = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const tb = Buffer.from(t); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([tb, dd]))); return Buffer.concat([l, tb, dd, cc]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(gw, 0); ih.writeUInt32BE(gh, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(PNG, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
console.log('\n' + PNG + ' — 빨강 반경80+ · 주황 50+ · 노랑 30+ · 연두 가는 띠 · 흰점 마을');
