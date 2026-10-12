#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T710 지형 마이그레이션 도구 ① · 판정 0 · 새 수 0)
// === scripts/t710-raster.js — 한 트리(정본 묶음)의 존 지형을 **셀마다** 굽는다 ===============================
//   그 트리의 정본 모듈을 그대로 불러 묻는다(사본 0): `server/terrain.js`(강 · 호수 · 바위 · 숲 · 산 · 광맥 — hanbando-terrain.json ·
//   region-bake-off.json) · `server/chunk.js generateCoastlineWaterTiles`(해안선 띠 — zone-config 존 사각 · 바다 사각) ·
//   `server/zone-config.js` 다리(`ZONES[z].bridges`) · `server/streams.js`(개울 비트 · 지문이 맞을 때만 켜진다 — 서버와 같은 문).
//   셀 = 32px 칸 · 묻는 점 = 칸 가운데(서버 `isWaterTileLocal` · `isRockTileLocal` 과 같은 점).
//   한 칸 한 바이트(비트): 1 해안 물 · 2 강·호수 물 · 4 바위 · 8 다리 · 16 개울 · 32 숲(배수 > 1.2 — 서버 숲 판정 그 문턱) · 64 산(돌 배수 > 1.5 — getTileType 그 문턱) · 128 광맥
//   + 광맥 칸마다 광맥 번호(서명 표의 줄 · 서명 = 가운데 · 반경 · 광종 · 자잘).
//   쓰는 법: node scripts/t710-raster.js --root <트리> --zone hanbando --out <파일.t710r>
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const ZONE = opt('--zone', 'hanbando');
const OUT = opt('--out', null);
if (!OUT) { console.error('쓰는 법: --root <트리> --zone <존> --out <파일>'); process.exit(2); }
const R = (p) => require(path.join(ROOT, p));
const T = R('server/terrain.js');
const ZC = R('server/zone-config.js');
const CH = R('server/chunk.js');
let ST = null; try { ST = R('server/streams.js'); } catch (e) { ST = null; }
const Z = ZC.ZONES[ZONE];
if (!Z) { console.error('존 없음:', ZONE); process.exit(2); }
const W = Math.ceil(Z.zoneWidth / 32), H = Math.ceil(Z.zoneHeight / 32);
const bits = new Uint8Array(W * H);
const ore = new Uint16Array(W * H);
const t0 = Date.now();
// 해안 물 — 서버 부팅과 같은 부름(zone.js `generateCoastlineWaterTiles({...ZONE, id}, 32, findZoneAt, OCEAN_RECTS)`)
const OCEAN = Object.values(ZC.ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const coast = CH.generateCoastlineWaterTiles({ ...Z, id: ZONE }, 32, ZC.findZoneAt, OCEAN);
for (const k of coast) { const i = k.indexOf('_'); const x = +k.slice(0, i), y = +k.slice(i + 1); if (x >= 0 && y >= 0 && x < W && y < H) bits[y * W + x] |= 1; }
const tCoast = Date.now() - t0;
// 다리
const bl = Z.bridges || [];
for (let i = 0; i + 1 < bl.length; i += 2) { const x = bl[i], y = bl[i + 1]; if (x >= 0 && y >= 0 && x < W && y < H) bits[y * W + x] |= 8; }
// 개울(서버와 같은 문 — 파일 지문이 지금 정본과 맞아야 켜진다)
let streamOn = false;
if (ST && typeof ST.load === 'function') { try { ST.load(ZONE); streamOn = !!(ST.stats && ST.stats(ZONE)); } catch (e) { streamOn = false; } }
// 광맥 서명 표
const oreSig = [], oreIdx = new Map();
const sigOf = (o) => `${o.center[0]},${o.center[1]}|${o.radius}|${o.mineral || ''}|${o.minor ? 1 : 0}`;
for (let y = 0; y < H; y++) {
  const py = y * 32 + 16;
  for (let x = 0; x < W; x++) {
    const px = x * 32 + 16, i = y * W + x;
    let b = bits[i];
    if (T.isWaterCellLocal(ZONE, px, py)) b |= 2;
    else if (T.isRockCellLocal(ZONE, px, py)) b |= 4;
    if (streamOn && ST.isStreamCell(ZONE, x, y)) b |= 16;
    if (T.getForestMultiplier(ZONE, px, py) > 1.2) b |= 32;
    if (T.getStoneMultiplier(ZONE, px, py) > 1.5) b |= 64;
    const o = T.isOreClusterAt(ZONE, px, py);
    if (o) { b |= 128; const s = sigOf(o); let k = oreIdx.get(s); if (k === undefined) { k = oreSig.length + 1; oreSig.push(s); oreIdx.set(s, k); } ore[i] = k; }
    bits[i] = b;
  }
}
const meta = { zone: ZONE, root: ROOT, W, H, coast: coast.size, bridges: bl.length / 2, streamOn, oreSig, sec: +((Date.now() - t0) / 1000).toFixed(1), tCoastMs: tCoast,
  files: {} };
// 정본 파일 지문(어느 판을 구웠나)
for (const f of ['server/hanbando-terrain.json', 'server/zone-config.js', 'server/region-bake-off.json', `server/streams/${ZONE}.bin`]) {
  try { meta.files[f] = require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 12); } catch (e) { meta.files[f] = null; }
}
const mj = Buffer.from(JSON.stringify(meta));
const hdr = Buffer.alloc(4); hdr.writeUInt32LE(mj.length, 0);
fs.writeFileSync(OUT, zlib.gzipSync(Buffer.concat([hdr, mj, Buffer.from(bits.buffer), Buffer.from(ore.buffer)])));
let cnt = [0, 0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < bits.length; i++) for (let k = 0; k < 8; k++) if (bits[i] & (1 << k)) cnt[k]++;
console.log(`[t710 굽기] ${ZONE} ${W}×${H} · ${meta.sec}s · 해안 ${cnt[0]} · 강호수 ${cnt[1]} · 바위 ${cnt[2]} · 다리 ${cnt[3]} · 개울 ${cnt[4]}${streamOn ? '' : '(꺼짐 — 지문 다름)'} · 숲 ${cnt[5]} · 산 ${cnt[6]} · 광맥 ${cnt[7]}(${oreSig.length}개) → ${OUT}`);
