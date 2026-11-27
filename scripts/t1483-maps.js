// [T1483] 마을 둘레 지형 그림 — 서버 지형 자료에서 직접 그린다(제품 코드 손 0). 쓰임: node scripts/t1483-maps.js <나갈곳>
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), SZ = 32, OUT = process.argv[2] || path.join(ROOT, '계측', 'T1483_2026-11-25', 'maps');
const T = require(path.join(ROOT, 'server', 'terrain')); const { ZONES } = require(path.join(ROOT, 'server', 'zone-config')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const vils = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando.villages;
const R = 90, PX = 4;  // 마을 둘레 ±90칸(±2880px) · 칸당 4점
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(w, h, rgb) { const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); } const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const COL = { water: [70, 130, 200], rock: [110, 110, 115], forest: [60, 130, 70], plain: [226, 214, 170], bridge: [150, 100, 60] };
const Zb = ZONES.hanbando, BR = new Set(); for (let i = 0; i + 1 < (Zb.bridges || []).length; i += 2) BR.add(Zb.bridges[i] + ',' + Zb.bridges[i + 1]);
const names = ['농촌18', '농촌10', '농촌21', '농촌6', '광산3'], stat = {};
for (const nm of names) {
  const v = vils.find((q) => q.name === nm); if (!v) { console.error('없음', nm); continue; }
  const cx = Math.floor(v.x / SZ), cy = Math.floor(v.y / SZ), W = (2 * R + 1) * PX, buf = Buffer.alloc(W * W * 3);
  const cnt = { water: 0, rock: 0, forest: 0, plain: 0 }; let nearestForest = null, nearestWater = null;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const x = cx + i, y = cy + j, px = x * SZ + 16, py = y * SZ + 16; let k = 'plain';
    if (x < 0 || y < 0) k = 'rock'; else if (T.isWaterCellLocal('hanbando', px, py)) k = BR.has(x + ',' + y) ? 'bridge' : 'water'; else if (T.isRockCellLocal('hanbando', px, py)) k = 'rock'; else if (T.getForestMultiplier('hanbando', px, py) > 1.5) k = 'forest';
    if (cnt[k] !== undefined) cnt[k]++; const d = Math.hypot(i, j);
    if (k === 'forest' && (nearestForest === null || d < nearestForest)) nearestForest = d; if (k === 'water' && (nearestWater === null || d < nearestWater)) nearestWater = d;
    const c = COL[k]; for (let a = 0; a < PX; a++) for (let b = 0; b < PX; b++) { const o = (((j + R) * PX + a) * W + (i + R) * PX + b) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; }
  }
  const mid = R * PX + PX / 2; for (let d = -9; d <= 9; d++) for (const [x, y] of [[mid + d, mid], [mid, mid + d]]) { const o = (y * W + x) * 3; buf[o] = 220; buf[o + 1] = 20; buf[o + 2] = 20; }
  for (let d = -2; d <= 2; d++) for (let e = -2; e <= 2; e++) { const o = ((mid + d) * W + mid + e) * 3; buf[o] = 220; buf[o + 1] = 20; buf[o + 2] = 20; }
  fs.writeFileSync(path.join(OUT, nm + '.png'), png(W, W, buf));
  stat[nm] = { x: v.x, y: v.y, type: v.type, cx, cy, cells: cnt, 가까운숲칸: nearestForest === null ? null : +nearestForest.toFixed(1), 가까운물칸: nearestWater === null ? null : +nearestWater.toFixed(1) };
}
fs.writeFileSync(path.join(OUT, 'maps.json'), JSON.stringify({ 창: `마을 중심 ±${R}칸(칸 ${SZ}px)`, 색: '파랑 물 · 회색 바위/산 · 초록 숲(숲배수>1.5) · 갈색 다리 · 베이지 평지 · 빨간 십자 마을', stat }, null, 1));
console.log(JSON.stringify(stat));
