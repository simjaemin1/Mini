#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T588 ①④⑤ 자 · 제품 무변)
// =============================================================================
// 존 하나의 **해안선 띠 마스크**를 서버 정본 `chunk.generateCoastlineWaterTiles` 그대로 불러 떨군다(사본 0 —
//   T549 `t549-coast-band.js` 는 식을 옮겨 손잡이를 달았지만, 여기선 손잡이가 정본 안에 있다: `T588_COAST`).
//   ⇒ 끔 판 = 지금 바이트 · 켬 판 = T588 구간 성격 생성기. 둘 다 같은 함수 · 같은 인자(존 서버 `zone.js` 와 같다).
// 내는 것:
//   <out.u8>       NY×NX 바이트(1 = 띠 바다 · 0 = 뭍) — T549 `t549-coast-shape.py` 가 먹는 꼴 그대로
//   <out.json>     존 기하(셀) · 바다 변(어느 바다 존의 어느 변이 이 존 어디에 닿나) · 띠 칸 수 · 걸린 ms
// 쓰는 법: [T588_COAST=a|b] node scripts/t588-coast-mask.js <zoneId> <out.u8> [out.json] [--table <안.json>] [--with-ref]
//   --table: **자 안에서만** 구간 성격을 갈아 끼운다({ scale, chars, sections? } — `public/coast-shape.js` 의 SCALE·CHAR·SECTIONS 꼴) ·
//            정본 표는 그 파일 하나다(이 손잡이는 T549 `--a3` 처럼 안을 재는 자리 · 제품 무변 · T588_COAST 켬 판에서만 뜻이 있다).
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando', OUT = process.argv[3] || '/tmp/band.u8', META = (process.argv[4] && !process.argv[4].startsWith('--')) ? process.argv[4] : '';
const { ZONES, findZoneAt } = R('server/zone-config');
const chunk = R('server/chunk');
const SZ = 32, ZONE = { ...ZONES[Z], id: Z };
if (!ZONES[Z] || ZONES[Z].isOcean) { console.error(`[T588 mask] 뭍 존이 아니다: ${Z}`); process.exit(2); }
const OCEAN = Object.entries(ZONES).filter(([, z]) => z.isOcean)
  .map(([id, z]) => ({ id, x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const OR = OCEAN.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));   // 존 서버가 넘기는 꼴 그대로(키 넷)
const NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ);
const TI = process.argv.indexOf('--table');
const TABLE = TI > 0 ? JSON.parse(fs.readFileSync(process.argv[TI + 1], 'utf8')) : null;
const WITH_REF = process.argv.indexOf('--with-ref') > 0;   // 참고치(확실도 '약') 구간까지 켠 안 — 자 안에서만
if (TABLE || WITH_REF) {   // 정본 생성기 그대로 · 표만 갈아 끼운다(같은 함수 · 같은 인자 — chunk.js 가 넘기는 지금 식 깊이도 같은 함수)
  const CS = R('public/coast-shape.js');
  const gen = CS.generate;
  CS.generate = (zone, ts, ors, zones, base, noise, old, opts) => gen(zone, ts, ors, zones, base, noise, old,
    Object.assign({}, opts || {}, TABLE ? { chars: TABLE.chars || CS.CHAR, scale: TABLE.scale || CS.SCALE, sections: TABLE.sections || CS.SECTIONS } : {},
      WITH_REF ? { withRef: true } : {}));
}
const t0 = Date.now();
const set = chunk.generateCoastlineWaterTiles(ZONE, SZ, findZoneAt, OR);
const ms = Date.now() - t0;
const M = new Uint8Array(NX * NY);
for (const k of set) { const u = k.indexOf('_'); const tx = +k.slice(0, u), ty = +k.slice(u + 1); M[ty * NX + tx] = 1; }
fs.writeFileSync(OUT, Buffer.from(M.buffer));
// 바다 변 — 이 존 사각의 네 변 중 바다 존과 맞닿은 구간(셀) · 꼭짓점으로만 닿는 바다(모서리)
const zx0 = ZONE.worldOffsetX, zy0 = ZONE.worldOffsetY, zx1 = zx0 + ZONE.zoneWidth, zy1 = zy0 + ZONE.zoneHeight;
const sides = [];
for (const O of OCEAN) {
  const ox = [Math.max(zx0, O.x0), Math.min(zx1, O.x1)], oy = [Math.max(zy0, O.y0), Math.min(zy1, O.y1)];
  if (O.y1 === zy0 && ox[0] < ox[1]) sides.push({ side: 'N', ocean: O.id, a: Math.floor((ox[0] - zx0) / SZ), b: Math.ceil((ox[1] - zx0) / SZ) });
  if (O.y0 === zy1 && ox[0] < ox[1]) sides.push({ side: 'S', ocean: O.id, a: Math.floor((ox[0] - zx0) / SZ), b: Math.ceil((ox[1] - zx0) / SZ) });
  if (O.x1 === zx0 && oy[0] < oy[1]) sides.push({ side: 'W', ocean: O.id, a: Math.floor((oy[0] - zy0) / SZ), b: Math.ceil((oy[1] - zy0) / SZ) });
  if (O.x0 === zx1 && oy[0] < oy[1]) sides.push({ side: 'E', ocean: O.id, a: Math.floor((oy[0] - zy0) / SZ), b: Math.ceil((oy[1] - zy0) / SZ) });
  for (const [cx, cy, nm] of [[zx0, zy0, 'NW'], [zx1, zy0, 'NE'], [zx0, zy1, 'SW'], [zx1, zy1, 'SE']]) {
    const touch = (O.x0 === cx || O.x1 === cx) && (O.y0 === cy || O.y1 === cy);
    const inside = (cx > O.x0 && cx < O.x1) || (cy > O.y0 && cy < O.y1);
    if (touch && !inside && !sides.some((s) => s.ocean === O.id && s.side !== 'corner')) sides.push({ side: 'corner', corner: nm, ocean: O.id });
  }
}
let n = 0; for (const v of M) n += v;
// 구간 상자(세계 px) — 켬 판에서 정본 생성기가 쓴 그 꼴(같은 compile · 같은 표) · 끔 판도 기록(그림에 구간 이름을 얹는다)
let secs = [];
try {
  const CS = R('public/coast-shape.js');
  const C = CS.compile(ZONES, 6000, 5000, Object.assign({}, TABLE ? { chars: TABLE.chars || CS.CHAR, scale: TABLE.scale || CS.SCALE, sections: TABLE.sections || CS.SECTIONS } : {}, WITH_REF ? { withRef: true } : {},
    process.env.T588_COAST === 'b' ? { variant: 'b' } : {}));
  secs = C.secs.map((q) => ({ id: q.id, ko: q.ko, zone: q.zone, side: q.side || null, corner: q.corner || null, ax: q.ax, bx: q.bx, ay: q.ay, by: q.by, T: C.T, H: q.H, A: q.A, amp: q.amp,
    borrow: q.borrow || null, D: q.D }));   // ★추신2 — 빌림(그림·표가 '빌려 씀'을 적는다)
  // ⚠6000/5000 은 chunk.js COASTLINE_BASE·NOISE 를 읽어 대조한다(아래) — 다르면 자를 고쳐라
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'chunk.js'), 'utf8');
  if (!/const COASTLINE_BASE = 6000;/.test(src) || !/const COASTLINE_NOISE = 5000;/.test(src)) { console.error('[T588 mask] chunk.js 띠 상수가 6000/5000 이 아니다 — 자를 고쳐라'); process.exit(3); }
} catch (e) { if (e && e.code !== 'MODULE_NOT_FOUND') throw e; }
const meta = { zone: Z, name: ZONES[Z].displayName, NX, NY, x0: zx0, y0: zy0, w: ZONE.zoneWidth, h: ZONE.zoneHeight, knob: process.env.T588_COAST || '',
  withRef: WITH_REF, band: n, bandPct: 100 * n / (NX * NY), ms, sides, ocean: OCEAN, secs };
if (META) fs.writeFileSync(META, JSON.stringify(meta));
console.log(JSON.stringify({ zone: Z, NX, NY, band: n, bandPct: +meta.bandPct.toFixed(3), ms, sides: sides.map((s) => s.side === 'corner' ? `corner:${s.corner}:${s.ocean}` : `${s.side}:${s.ocean}[${s.a},${s.b})`) }));
