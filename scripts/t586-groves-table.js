#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T586 ① 군락 표 · 관측 전용 · 정본 무변)
// =============================================================================
// 두 존(한반도 · 닛폰) 수동 군락(`ZONE_TERRAIN[z].groves`)을 같은 자로 나란히 잰다:
//   ⓐ 지형별(`chunk._wildClass`) 군락 수 · 마을 채집 원판(반경 = 걸음 × forage.CFG.WALK_SEC ÷ 32) 셀 · 셀당 밀도
//      — `scripts/t450-wild-groves.js --derive` 의 `derive()` 와 같은 식(그 스크립트는 한반도 고정이라 존을 받게 옮겼다)
//   ⓑ 마을별 원판 안 군락 수(자기 마을 군락 + 이웃 마을 군락이 원판에 들면 그것도) · 종(kind)별
//   ⓒ 면적 비례 수(한반도 군락 × 닛폰 뭍 / 한반도 뭍 — T524 자 뭍 셀 수)
// 쓰는 법: node scripts/t586-groves-table.js [--json out.json] [--land-hb <셀> --land-np <셀>]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const _l = console.log; console.log = () => {};
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const F = require(path.join(ROOT, 'server', 'forage'));
console.log = _l;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE = +((zsrc.match(/const MOVE_SPEED = (\d+);/) || [])[1]);
const R = Math.round(MOVE * F.CFG.WALK_SEC / 32);
function table(Z) {
  const G = (T.ZONE_TERRAIN[Z] && T.ZONE_TERRAIN[Z].groves) || [];
  const V = T.getZoneVillages(Z) || [];
  const byClass = {}, byKind = {};
  for (const g of G) {
    const c = CH._wildClass(Z, g.center[0], g.center[1]) || 'water·rock';
    (byClass[c] = byClass[c] || { n: 0, kinds: {} }).n++;
    byClass[c].kinds[g.kind] = (byClass[c].kinds[g.kind] || 0) + 1;
    byKind[g.kind] = (byKind[g.kind] || 0) + 1;
  }
  const seen = new Set(), cells = {};
  const perVil = [];
  for (const v of V) {
    const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const k = (vx + dx) * 65536 + (vy + dy); if (seen.has(k)) continue; seen.add(k);
      const c = CH._wildClass(Z, (vx + dx) * 32 + 16, (vy + dy) * 32 + 16) || 'water·rock';
      cells[c] = (cells[c] || 0) + 1;
    }
    const inD = G.filter((g) => Math.hypot(g.center[0] - v.x, g.center[1] - v.y) <= R * 32);
    const k = {}; for (const g of inD) k[g.kind] = (k[g.kind] || 0) + 1;
    perVil.push({ name: v.name, n: inD.length, own: G.filter((g) => g.vil === v.name).length, kinds: k });
  }
  return { zone: Z, groves: G.length, villages: V.length, withGrove: perVil.filter((r) => r.own > 0).length, byClass, byKind, cells, perVil };
}
const res = { R, hb: table('hanbando'), np: table('nippon') };
const lh = +arg('--land-hb', 0), ln = +arg('--land-np', 0);
if (lh > 0 && ln > 0) res.areaShare = { landHb: lh, landNp: ln, groves: +(res.hb.groves * ln / lh).toFixed(2) };
const fmt = (o) => JSON.stringify(o);
console.log(`채집 원판 반경 ${R}셀(걸음 ${MOVE} × WALK_SEC ${F.CFG.WALK_SEC} ÷ 32)`);
for (const t of [res.hb, res.np]) {
  console.log(`\n## ${t.zone} — 군락 ${t.groves} · 마을 ${t.villages} · 군락 받은 마을 ${t.withGrove} · 종 ${fmt(t.byKind)}`);
  console.log('| 지형 | 군락 | 종 | 원판 셀 | 셀당 밀도 |');
  for (const c of ['forest', 'edge', 'riverside', 'plain', 'water·rock']) {
    const b = t.byClass[c] || { n: 0, kinds: {} }, cl = t.cells[c] || 0;
    console.log(`| ${c} | ${b.n} | ${fmt(b.kinds)} | ${cl} | ${cl ? (b.n / cl).toExponential(3) : '—'} |`);
  }
  const ns = t.perVil.map((r) => r.n).sort((a, b) => a - b);
  console.log(`마을별 원판 안 군락 — 0곳 ${ns.filter((x) => !x).length} · 중앙 ${ns[ns.length >> 1]} · 최대 ${ns[ns.length - 1]} · 평균 ${(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(2)}`);
}
if (res.areaShare) console.log(`\n면적 비례 군락 = ${res.hb.groves} × ${ln} / ${lh} = ${res.areaShare.groves}`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(res, null, 1));
