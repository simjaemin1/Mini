#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T591 ② 해안 띠 몫 자 · 정본 식 그대로 부른다)
// 존마다 해안선 띠(`chunk.generateCoastlineWaterTiles` = 서버 `WATER_TILES`)가 존 칸의 몇 %를 먹나. `--find` 면 닛폰 띠 % 가
//   한반도 % 와 같아지는 배수 k 를 이분으로 찾는다(띠는 k 에 단조 · 새 수 0 = 한반도 몫 유도). 폭은 `t591-variant.js` 예비 적재로 바꾼다.
// 쓰는 법: node scripts/t591-band.js [--find] [--zones hanbando,nippon]
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const { ZONES, findZoneAt } = R('server/zone-config');
const chunk = R('server/chunk');
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const pct = (zid, k) => {
  const Z = Object.assign({}, ZONES[zid], { id: zid }); if (k != null) Z.coastBandK = k;
  const n = Math.ceil(Z.zoneWidth / 32) * Math.ceil(Z.zoneHeight / 32);
  const s = chunk.generateCoastlineWaterTiles(Z, 32, findZoneAt, OR);
  return { band: s.size, cells: n, pct: s.size / n * 100 };
};
const zs = (process.argv.includes('--zones') ? process.argv[process.argv.indexOf('--zones') + 1] : 'hanbando,nippon').split(',');
const out = {};
for (const z of zs) { out[z] = pct(z); console.log(`${z}: 폭 ${ZONES[z].zoneWidth} · 띠 ${out[z].band} / ${out[z].cells} = ${out[z].pct.toFixed(3)}% · coastBandK ${ZONES[z].coastBandK || 1}`); }
if (process.argv.includes('--find')) {
  const target = out.hanbando ? out.hanbando.pct : pct('hanbando').pct;
  let lo = 0.05, hi = 1;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (pct('nippon', m).pct > target) hi = m; else lo = m; }
  const k3 = Math.round((lo + hi) / 2 * 1000) / 1000;
  const r = pct('nippon', k3);
  console.log(`k(닛폰 띠 % = 한반도 ${target.toFixed(3)}%) = ${k3} → ${r.pct.toFixed(3)}% (띠 ${r.band})`);
  console.log(JSON.stringify({ target, k: k3, nippon: r }));
}
