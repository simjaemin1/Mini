// === scripts/t480-view-probe.js — `WATER_TILES` 창 게이트(T480 ②) · 계측 예비 적재 · 러너 밖 ===========================
//   `node -r scripts/t480-view-probe.js server/zone.js` — zone.js 원문 **뒤에** 읽기 창 하나를 덧붙여 컴파일한다(동작 0 · t432/t453 문법).
//   존이 다 적재된 순간 **생성기를 한 번 더** 불러(같은 인자) 그 문자열 Set 과 존의 `WATER_TILES` 를 전수로 견준다:
//   ⓐ size ⓑ `for…of` 순서·값 전부 ⓒ `forEachTile` 순서·값 전부 ⓓ 생성기 키 전부 `has` = true ⓔ 무작위 칸 20만 · 꼴 틀린 키 여럿 `has` 같은 답.
//   결과 한 줄을 `[t480-view]` 로 찍고 `T480_VIEW_OUT` 에 JSON.
'use strict';
const Module = require('module');
const path = require('path');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(path.join('server', 'zone.js'))) content += `
;(function () {
  const t0 = Date.now();
  const src = generateCoastlineWaterTiles({ ...ZONE, id: ZONE_ID }, 32, findZoneAt, OCEAN_RECTS);
  const r = { zone: ZONE_ID, srcSize: src.size, viewSize: WATER_TILES.size, isSet: WATER_TILES instanceof Set, seqDiff: 0, tileDiff: 0, hasMissing: 0, probeDiff: 0, probes: 0 };
  { const a = src[Symbol.iterator](), b = WATER_TILES[Symbol.iterator](); for (;;) { const x = a.next(), y = b.next(); if (x.done && y.done) break; if (x.done !== y.done || x.value !== y.value) { r.seqDiff++; if (x.done || y.done) break; } } }
  if (typeof WATER_TILES.forEachTile === 'function') { const it = src[Symbol.iterator](); WATER_TILES.forEachTile((tx, ty) => { const n = it.next(); if (n.done || n.value !== tx + '_' + ty) r.tileDiff++; }); if (!it.next().done) r.tileDiff++; }
  for (const k of src) if (!WATER_TILES.has(k)) r.hasMissing++;
  let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const W = Math.ceil(ZONE.zoneWidth / 32), H = Math.ceil(ZONE.zoneHeight / 32);
  const odd = ['', '_', '1_', '_1', '01_2', '1_02', '-1_2', '1_-2', ' 1_2', '1_2 ', '1.0_2', '1e0_2', W + '_0', '0_' + H, 'x_y', '1_2_3'];
  for (const k of odd) { r.probes++; if (src.has(k) !== WATER_TILES.has(k)) r.probeDiff++; }
  for (let i = 0; i < 200000; i++) { const k = Math.floor(rnd() * (W + 4) - 2) + '_' + Math.floor(rnd() * (H + 4) - 2); r.probes++; if (src.has(k) !== WATER_TILES.has(k)) r.probeDiff++; }
  r.ms = Date.now() - t0;
  r.ok = r.srcSize === r.viewSize && !r.seqDiff && !r.tileDiff && !r.hasMissing && !r.probeDiff;
  console.log('[t480-view] ' + JSON.stringify(r));
  if (process.env.T480_VIEW_OUT) require('fs').writeFileSync(process.env.T480_VIEW_OUT, JSON.stringify(r));
})();
`;
  return _compile.call(this, content, filename);
};
