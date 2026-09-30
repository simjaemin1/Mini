// === server/bigmap-bake.js — 큰 지도 = 셀 술어의 그림 (T565 · 재민 실기 09-30) ==========
//
// ★왜 [T565]
//   `public/client/80-bigmap.js` 는 지형 json 의 **벡터**(산맥 = 폭 수천 px 띠 stroke · 강·호수·숲 타원·광맥 원)를
//   그렸고, 걷는 셀은 존의 술어(`isRockTileLocal` = terrain `isRockCellLocal`(능선 − 고개 − 계곡 − 물) ·
//   `isWaterTileLocal` = 해안 띠 `WATER_TILES` ∪ terrain `isWaterCellLocal` · `isBridgeTileLocal`)가 판정한다.
//   둘이 **다른 함수**라 지도와 땅이 어긋났다 — 산맥 한가운데를 줌인하면 빈 셀이 나왔다(자: `scripts/t565-map-audit.js`).
//
// ★여기엔 판정이 없다(새 판정 0 · 사본 0).
//   부르는 쪽(존)이 **제 술어**를 `q` 로 넘기고, 이 모듈은 그 술어를 **셀 중심**(tx·32+16, ty·32+16)에서
//   표본해 종류 번호 한 바이트로 적고 PNG(팔레트)로 싼다. 지도는 그 답의 그림이다.
//   종류의 순서 = 존의 걷기 판정 `_terrBlocked0`(바위 → 물 · 물 위 다리는 통행) 뒤에
//                 서버 `terrain.getTileType` 의 나머지(광맥 → 산 → 숲 → 뭍)를 이은 것이다.
//     · 광맥은 **주인**(`isOreClusterAt` = p 최대 광맥)이 큰 광맥일 때만.
//       ★★[재민 확정 · 종전 80-bigmap 에서 옮김] 자잘 광맥(o.minor)은 **지도에 안 그린다**.
//         "자잘광맥을 더 추가하는 방향으로.. 훨씬 많아야 해.. 그래야 탐험하는 재미가 있지"
//         지도에 전부 찍히면 발견이라는 게 없어진다 — 걸어 다니다 만나야 한다.
//         ※ "판 자잘 광맥은 지도에 표시로 남긴다"(발견 기록)는 별도 기능 — 설계 회부 대상.
//       (종전 줌인(배율 ≥ 1)은 이 규칙을 안 지키고 자잘 광맥 원까지 그렸다 — 이제 두 해상도가 이 한 줄을 본다.)
//     · 산(`getStoneMultiplier`)·숲(`getForestMultiplier`)의 문턱 1.5 는 종전 지도·`getTileType` 의 그 수다.
//
// ★해상도 둘, 함수 하나.
//   · 존 지도 — 지도 픽셀 하나 = STEP×STEP 셀(4×4) · 표본 셀 = 그 가운데(bx·4+2, by·4+2). 부팅 뒤 배경에서 한 번 굽는다.
//   · 줌인 조각 — 1픽셀 = 1셀 · TILE×TILE(64×64) 셀. 줌인 화면이 부를 때 굽는다.
//   두 해상도가 같은 `classAt` 을 부르므로 **겹치는 셀(표본 셀)에서 답이 같다**(줌인/줌아웃 같은 답).
//
// ★버전 = 구운 답의 해시(sha1 · 종류 바이트 + 팔레트). 지형 json · 다리 · 코드 어느 것이 바뀌어도 답이 바뀌면 버전이 바뀐다.
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');

const CLS = ['plain', 'water', 'rock', 'bridge', 'ore', 'mountain', 'forest'];
const K = { plain: 0, water: 1, rock: 2, bridge: 3, ore: 4, mountain: 5, forest: 6 };
// 색 = 종전 지도(80-bigmap `TILE_COLORS`) 그대로. 다리만 새 색이다(종전 지도는 다리를 안 그렸다).
//   뭍 = 존 바탕색(`groundColor` — 종전 지도의 바탕 그대로).
const COLORS = { water: '#1a3a6a', rock: '#6e6356', bridge: '#f2d492', ore: '#c4682a', mountain: '#8a8a8a', forest: '#2a5a2a' };
const STEP = 4;
const TILE = 64;
const CELL = 32;

function classAt(q, tx, ty) {
  const x = tx * CELL + 16, y = ty * CELL + 16;
  if (q.rock(x, y)) return K.rock;
  if (q.water(x, y)) return q.bridge(x, y) ? K.bridge : K.water;
  const o = q.ore(x, y);
  if (o && !o.minor) return K.ore;
  if (q.stone(x, y) > 1.5) return K.mountain;
  if (q.forest(x, y) > 1.5) return K.forest;
  return K.plain;
}
// 지도 픽셀 b 의 표본 셀(한 축) — 가운데 · 존 끝을 넘지 않는다
function sampleCell(b, step, n) { return Math.min(n - 1, b * step + (step >> 1)); }

function hexRgb(h, d) {
  const s = String(h || d || '#000000').replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function palette(groundColor) {
  return CLS.map((c) => (c === 'plain' ? hexRgb(groundColor, '#5a7c4a') : hexRgb(COLORS[c])));
}

// ── 존 지도 굽는 이 — 한 줄씩(부르는 쪽이 이벤트 루프에 자리를 내준다) ─────────────
function makeZoneBake(q, W, H, step) {
  step = step || STEP;
  const bw = Math.ceil(W / step), bh = Math.ceil(H / step);
  const idx = new Uint8Array(bw * bh);
  let row = 0;
  return {
    W, H, step, bw, bh, idx,
    rowsDone: () => row,
    done: () => row >= bh,
    bakeRow() {
      if (row >= bh) return false;
      const by = row++, ty = sampleCell(by, step, H), o = by * bw;
      for (let bx = 0; bx < bw; bx++) idx[o + bx] = classAt(q, sampleCell(bx, step, W), ty);
      return true;
    },
    // 셀 (cx,cy) 가 표본 셀이면 그 지도 픽셀의 번호, 아니면 -1
    pixelOf(cx, cy) {
      const bx = Math.floor(cx / step), by = Math.floor(cy / step);
      if (bx < 0 || by < 0 || bx >= bw || by >= bh) return -1;
      if (sampleCell(bx, step, W) !== cx || sampleCell(by, step, H) !== cy) return -1;
      return by * bw + bx;
    },
    // 런타임에 바뀐 셀(지은 다리) — 표본 셀만 다시 묻는다(같은 함수)
    repaint(cells) {
      let n = 0;
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const p = this.pixelOf(cells[i] | 0, cells[i + 1] | 0);
        if (p < 0 || Math.floor(p / bw) >= row) continue;   // 아직 안 구운 줄은 굽는 이가 알아서 새 답을 적는다
        const v = classAt(q, cells[i] | 0, cells[i + 1] | 0);
        if (idx[p] !== v) { idx[p] = v; n++; }
      }
      return n;
    },
  };
}

// ── 줌인 조각 — 1픽셀 = 1셀 ─────────────────────────────────────────────────
function bakeTile(q, W, H, TX, TY, size) {
  size = size || TILE;
  const x0 = TX * size, y0 = TY * size;
  if (!(TX >= 0 && TY >= 0 && x0 < W && y0 < H)) return null;
  const w = Math.min(size, W - x0), h = Math.min(size, H - y0);
  const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) idx[y * w + x] = classAt(q, x0 + x, y0 + y);
  return { TX, TY, x0, y0, w, h, idx };
}

// ── PNG(8비트 팔레트) — 틀은 `scripts/build-cell-map.js` 의 그것 ────────────────
const _crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function _crc(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = _crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function _chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const cc = Buffer.alloc(4); cc.writeUInt32BE(_crc(td));
  return Buffer.concat([len, td, cc]);
}
function _raw(w, h, idx) {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(idx.subarray(y * w, y * w + w), y * (w + 1) + 1); }
  return raw;
}
function _png(w, h, pal, z) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.from(pal.flatMap((p) => [p[0], p[1], p[2]]));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), _chunk('IHDR', ihdr), _chunk('PLTE', plte), _chunk('IDAT', z), _chunk('IEND', Buffer.alloc(0))]);
}
function encodePngSync(w, h, idx, pal) { return _png(w, h, pal, zlib.deflateSync(_raw(w, h, idx), { level: 9 })); }
function encodePng(w, h, idx, pal, cb) {
  zlib.deflate(_raw(w, h, idx), { level: 9 }, (err, z) => { if (err) return cb(err); cb(null, _png(w, h, pal, z)); });
}
function version(idx, pal) {
  return crypto.createHash('sha1').update(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)).update(Buffer.from(pal.flat())).digest('hex').slice(0, 12);
}

module.exports = { CLS, K, COLORS, STEP, TILE, CELL, classAt, sampleCell, palette, hexRgb, makeZoneBake, bakeTile, encodePng, encodePngSync, version };
