#!/usr/bin/env node
// === scripts/cargo-diag.js — T206 §0-ⓐ 빈 수레 자 (출발 leg 전수) ========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// 같은 벽을 두 번 만났다: T173(귀환 화물 하나) · T200(출발 화물 하나 · 품목 간 대체 · 족보 161).
// 그 벽의 자리는 `sim/economy-sim-v2.js:696` 한 줄이다:
//     const N_units = Math.min(cand.surplus, CARGO_PER_TRIP);      // CARGO_PER_TRIP = 100
// 잉여가 100 에 못 미치면 수레가 **빈 채로** 간다. 이 자는 그 빈 자리를 센다.
//
// 세계 조립은 `t17-metrics.js`·`stone-trade-diag.js` 와 **같은 순서·같은 정본 함수**다.
// 읽는 창구는 **계측 전용 훅 하나**(`world.onTradeLeg` · 주입 없으면 비트 동일) — 문턱 규칙을
// 여기 다시 적지 않는다(사본 0).
//
// 실행: node scripts/cargo-diag.js [일수=800] [시드=1020]
//   T206_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t206-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const LV = R('server/livelihood');
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

const CACHE = process.env.LAB_SEEDCACHE || '/tmp/t163-seeds.json';
let seeds = null;
if (fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  try { fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {}
}

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
if (process.env.T206_CARGO_TWO === '1') world.cargoTwo = true;    // ★[T206 ②] 계측 전용 — 랩은 `L_CARGO_TWO` 로 같은 문
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

const FL = LV.FLOOR.stone;
const isFloor = (v) => Math.abs((v.land.stone || 0) - FL) < 1e-9;
const floorSet = new Set(world.villages.map((v, i) => (isFloor(v) ? i : -1)).filter((x) => x >= 0));

// ── 계측 전용 훅 — 읽기만 한다 ───────────────────────────────────────────────
const legs = [];
world.onTradeLeg = (o) => {
  legs.push({ vid: o.vid, res: o.res, units: o.units, cap: o.cap, nc: o.cands.length,
    c2: o.cands.length >= 2 ? o.cands[1].res : null, c2s: o.cands.length >= 2 ? o.cands[1].surplus : 0,
    room: Math.max(0, o.cap - o.units), ret: o.ret, day: o.day,
    second: o.second || null, secondUnits: o.secondUnits || 0 });
};

for (let d = 0; d < DAYS; d++) econV2.tickWorldV2(world, d);

const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pc = (n, d) => (d > 0 ? (n / d * 100).toFixed(1) + '%' : '—');
const fl = legs.filter((l) => floorSet.has(l.vid)), rest = legs.filter((l) => !floorSet.has(l.vid));

console.log(`\n=== T206 §0-ⓐ 빈 수레 자 — 시드 ${SEED} · ${DAYS}일 · 마을 ${world.villages.length}(바닥 ${floorSet.size}) ===`);
console.log(`  출발 leg 전수 **${legs.length}건** (바닥 ${fl.length} · 그 밖 ${rest.length}) · 수레 용량 ${legs.length ? legs[0].cap : '?'}`);

const show = (lab, g) => {
  if (!g.length) { console.log(`  ${lab} — 0건`); return; }
  const load = g.map((l) => l.units / l.cap);
  const full = g.filter((l) => l.units >= l.cap).length;
  const half = g.filter((l) => l.units < l.cap * 0.5).length;
  console.log(`  ${lab.padEnd(8)} | 적재율 중앙 **${(med(load) * 100).toFixed(1)}%** · 평균 ${(load.reduce((a, b) => a + b, 0) / g.length * 100).toFixed(1)}%`
    + ` · 만재 ${pc(full, g.length)} · **절반 미만 ${pc(half, g.length)}** · 빈자리 중앙 ${med(g.map((l) => l.room))} 단위`);
};
console.log(`\nⓐ-1 적재율`);
show('**바닥**', fl); show('그 밖', rest); show('전체', legs);

console.log(`\nⓐ-2 둘째 후보가 있었나 (\`candidates\` 길이 ≥2)`);
for (const [lab, g] of [['**바닥**', fl], ['그 밖', rest], ['전체', legs]]) {
  if (!g.length) continue;
  const two = g.filter((l) => l.nc >= 2);
  const twoRoom = two.filter((l) => l.room > 0);
  console.log(`  ${lab.padEnd(8)} | 후보 ≥2 **${pc(two.length, g.length)}** · 후보 수 중앙 ${med(g.map((l) => l.nc))}`
    + ` · **빈자리 있고 둘째도 있던 leg ${pc(twoRoom.length, g.length)}** (${twoRoom.length}건)`);
}
{
  const two = legs.filter((l) => l.nc >= 2 && l.room > 0);
  const by = {};
  for (const l of two) by[l.c2] = (by[l.c2] || 0) + 1;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`  둘째 후보 품목 상위 — ${top.map(([k, n]) => `${k} ${n}`).join(' · ') || '없다'}`);
  const sec = two.map((l) => Math.min(l.c2s, l.room));
  console.log(`  둘째로 더 실을 수 있던 양 — 중앙 ${med(sec)} 단위 · 합 ${sec.reduce((a, b) => a + b, 0).toFixed(0)} 단위`);
}
console.log(`\nⓐ-3 돌만 실은 leg (바닥 마을)`);
{
  const st = fl.filter((l) => l.res === 'stone');
  console.log(`  바닥 마을 출발 ${fl.length}건 중 **돌 ${st.length}건 (${pc(st.length, fl.length)})** · 그 적재율 중앙 ${(med(st.map((l) => l.units / l.cap)) * 100).toFixed(1)}%`);
  const by = {};
  for (const l of fl) by[l.res] = (by[l.res] || 0) + 1;
  console.log(`  바닥 마을 출발 품목 상위 — ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
}
console.log(`\nⓐ-4 귀환 화물 — 같은 자(T173 ⓑ)`);
{
  const withRet = legs.filter((l) => l.ret);
  const by = {};
  for (const l of withRet) by[l.ret] = (by[l.ret] || 0) + 1;
  console.log(`  출발 시 귀환재가 정해진 leg ${pc(withRet.length, legs.length)} · 품목 상위 — ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  const flRet = fl.filter((l) => l.ret === 'stone').length;
  console.log(`  바닥 마을 leg 중 귀환재가 **돌**인 것 ${pc(flRet, fl.length)} (${flRet}건)`);
}
if (process.env.T206_JSON) {
  const two = legs.filter((l) => l.nc >= 2 && l.room > 0);
  fs.writeFileSync(process.env.T206_JSON, JSON.stringify({ seed: SEED, legs: legs.length, floorLegs: fl.length,
    loadMedAll: med(legs.map((l) => l.units / l.cap)), loadMedFloor: med(fl.map((l) => l.units / l.cap)),
    twoAll: legs.filter((l) => l.nc >= 2).length, twoRoom: two.length,
    secondSum: two.map((l) => Math.min(l.c2s, l.room)).reduce((a, b) => a + b, 0),
    stoneFloorLegs: fl.filter((l) => l.res === 'stone').length,
    secondUnitsSum: legs.reduce((a, l) => a + (l.secondUnits || 0), 0) }, null, 1));
  console.log(`\n  JSON: ${process.env.T206_JSON}`);
}
