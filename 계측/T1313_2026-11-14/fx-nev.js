// 쓰는 법: node 계측/T1313_2026-11-14/fx-nev.js  (레포 뿌리에서 · 하네스 ⑬ fxSat 그 꼴을 그대로 옮긴 측정 · 제품 아님)
// 측정만 — ⑬ 고정판(하네스 fxSat 그 꼴)에서 이웃 b 곳간별 순수출가: 종전 갈래 · 빈자리 갈래 · 그 마을 그림자 값
process.env.T1293_ORE_SAT = '1'; process.env.T1313_SURPLUS_EXPORT = '1'; process.env.T1271_ORE_CAP = '1'; process.env.T1188_ORE_SPLIT = '1'; process.env.T724_MINE_ACT = '1';
process.env.T427_WORK_REACH = '0'; process.env.ENABLE_VILLAGES = '0'; process.env.T1192_FISH_SPECIES = '0'; process.env.T1266_ORE_BODY = '1';
const ROOT = require('path').resolve(__dirname, '..', '..');
const E = require(ROOT + '/sim/economy-sim'), E2 = require(ROOT + '/sim/economy-sim-v2');
function fx(flow, bOpt) {
  const w = E2.createWorldV2({ seed: 42, villageCount: 3, infoRange: 5000 }), [a, b, c] = w.villages; E.bindProductionActs(w);
  a.land.ore = 1; a.land.oreMix = { copper: 1 }; b.land.oreMix = { copper: 1 };
  a._consEMA = Object.assign(a._consEMA || {}, { ore_copper: flow, copper: 5 }); delete a._consEMA.fruit;
  a.storage.copper = 0.5; a.storage.fruit = 0; a.storage.food = 60;
  c.storage.copper = 100; c.storage.ore_copper = 2000; c.storage.fruit = 100;
  b._consEMA = Object.assign(b._consEMA || {}, { ore_copper: bOpt.flow, copper: 5 }); b.storage.ore_copper = bOpt.stock; b.storage.copper = 0;
  if (bOpt.near != null) b.coord = { x: a.coord.x + bOpt.near, y: a.coord.y };
  a.storage.ore_copper = 61; w.day++;
  const d = Math.hypot(b.coord.x - a.coord.x, b.coord.y - a.coord.y);
  const T = E2._targetV2(b, 'ore_copper', E2._targetCtxV2(b));
  const px = E2.computeShadowPrices(a);
  return { dist: +d.toFixed(0), bTarget: T && +T.target.toFixed(1), bStock: bOpt.stock, nev: +E2.netExportValue(w, a, 'ore_copper').toFixed(3), nevRoom: +E2.netExportValue(w, a, 'ore_copper', true).toFixed(3), pxA: +(px.ore_copper || 0).toFixed(3) };
}
for (const near of [50, null]) for (const st of [0, 100, 149, 150, 200]) console.log(JSON.stringify(fx(2, { flow: 5, stock: st, near })));
