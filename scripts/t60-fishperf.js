#!/usr/bin/env node
// === scripts/t60-fishperf.js — T60 ② 낚시 양방향의 **대가**를 잰다(진단 전용) ======
// 왜: 러너에서 `test-route-persist`·`test-site-memo`·`e2e-rtt` 셋이 같은 모양으로 죽었다
//     (폴링이 30초×4 를 못 받음 = 존 서버 루프가 수십 초 막힘). T42-b 와 같은 species 다.
//     의심: ⓐ `_fishAnchors` 첫 walk(반경 150셀 · 마을 51곳) ⓑ 하루 앵커 수 × drawStock
//           ⓒ `fishCells` Map 증식 → `deficitBy`(마을마다 전수) · `diffuse`(전수)
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 수치를 낸다.
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t60-fishperf-${process.pid}.db`;
const path = require('path');
const R_ = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 30;

const { ZONES } = R_('server/zone-config');
const T = R_('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const Villages = R_('server/villages');
const S = R_('server/sustain');
const F = R_('server/fishing');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const vils = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  vils.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy });
}
console.log(`마을 ${vils.length}곳 · LABOR_R ${S.LABOR_R} · FISH_BK 24 · DRAW_R ${F.CFG.DRAW_R} · CELL_K ${F.CFG.CELL_K}`);

// ── ⓐ 앵커 walk 비용(현행 구현 그대로) ─────────────────────────────────────
const FISH_BK = 24, R = S.LABOR_R;
function anchorsOf(v) {
  const seen = new Set(), out = [];
  for (let dy = -R; dy <= R; dy += 2) {
    for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = v.ccx + dx, y = v.ccy + dy;
      if (!ta.isWater(x, y)) continue;
      const bk = Math.floor(x / FISH_BK) + ',' + Math.floor(y / FISH_BK);
      if (seen.has(bk)) continue;
      seen.add(bk); out.push([x, y]);
    }
  }
  return out;
}
let t0 = Date.now();
const A = vils.map(anchorsOf);
const tAnchor = Date.now() - t0;
const counts = A.map((a) => a.length).sort((a, b) => a - b);
const tot = counts.reduce((s, x) => s + x, 0);
console.log(`\nⓐ 앵커 walk(51곳 한 번에) **${tAnchor}ms** · 앵커 합 ${tot} · 마을당 중앙 ${counts[counts.length >> 1]} · 최대 ${counts[counts.length - 1]} · 0개 마을 ${counts.filter((x) => !x).length}곳`);

// ── ⓑ 하루치 drawStock + ⓒ Map 증식 · deficitBy · diffuse ──────────────────
//   하루 어획량은 실측 대신 **보수적 상수**: econ 어부 산출은 마을당 하루 수십 econ 단위다.
const OUT_PER_VILLAGE = parseFloat(process.env.OUT || '') || 20;   // econ 단위/일 (넉넉히)
const perStock = F.stockToEcon(1);
console.log(`   stockToEcon(1) = ${perStock} · 하루 마을당 ${OUT_PER_VILLAGE} econ = ${(OUT_PER_VILLAGE / perStock).toFixed(1)} stock`);
let now = Date.now();
console.log(`\n일 | drawStock호출 | fishCells | draw ms | deficitBy×51 ms | diffuse ms`);
for (let d = 1; d <= DAYS; d++) {
  now += 86400000 / 60;   // 게임 하루(24분 캐논)
  let calls = 0;
  const t1 = Date.now();
  vils.forEach((v, i) => {
    const an = A[i]; if (!an.length) return;
    const per = (OUT_PER_VILLAGE / perStock) / an.length;
    for (const a of an) { F.drawStock(a[0], a[1], per, now, null); calls++; }
  });
  const tDraw = Date.now() - t1;
  const t2 = Date.now();
  for (const v of vils) {
    F.deficitBy((key) => {
      const i2 = key.indexOf('_'); if (i2 < 0) return false;
      const kx = +key.slice(0, i2), ky = +key.slice(i2 + 1);
      return Math.hypot(kx - v.ccx, ky - v.ccy) <= R;
    }, now);
  }
  const tDef = Date.now() - t2;
  const t3 = Date.now();
  F.diffuse(1 / 60, null);
  const tDif = Date.now() - t3;
  if (d <= 5 || d % 5 === 0) console.log(`${String(d).padStart(2)} | ${String(calls).padStart(13)} | ${String(F.fishCells.size).padStart(9)} | ${String(tDraw).padStart(7)} | ${String(tDef).padStart(15)} | ${String(tDif).padStart(10)}`);
}
