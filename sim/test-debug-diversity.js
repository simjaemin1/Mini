// 거래 0건 원인 — 토지 다양성 확인 + 자원 생산 추적
const economy = require('./economy-sim');

function checkWorld(picker, seed, days) {
  const world = economy.createWorld({ seed, villageCount: 20, picker });
  for (let i = 0; i < days; i++) economy.tickWorld(world);

  // 토지 분포
  const types = { food:0, mineral:0, wood:0, fish:0, generic:0 };
  for (const v of world.villages) {
    if (v.land.fertility > 1.2 && v.land.ore < 1.0) types.food++;
    else if (v.land.ore > 1.0 && v.land.fertility < 0.8) types.mineral++;
    else if (v.land.wood > 1.2 && v.land.fertility < 1.0) types.wood++;
    else if (v.land.water > 1.2 && v.land.fertility < 1.0) types.fish++;
    else types.generic++;
  }
  console.log(`\n[${picker}/seed${seed}/day${days}] 토지 분포:`, types);
  // 자원 생산 — 살아있는 마을의 wood/stone/ore 합계
  let totalWood=0, totalStone=0, totalOre=0, totalFood=0;
  for (const v of world.villages) {
    if (v.npcs.length < 1) continue;
    totalWood += v.storage.wood || 0;
    totalStone += v.storage.stone || 0;
    totalOre += v.storage.ore || 0;
    totalFood += v.storage.food || 0;
  }
  console.log(`  자원: food=${totalFood.toFixed(0)} wood=${totalWood.toFixed(0)} stone=${totalStone.toFixed(0)} ore=${totalOre.toFixed(0)}`);
  console.log(`  거래: ${world.tradeLog.length}건, 활성 캐러밴: ${world.caravans.length}`);
  // offer/demand 시뮬 (현재 시점)
  let villagesWithFoodOffer = 0, villagesWithFoodDemand = 0;
  let villagesWithWoodOffer = 0, villagesWithWoodDemand = 0;
  for (const v of world.villages) {
    const N = v.npcs.length || 1;
    if ((v.storage.food || 0) > N * 30 * 0.5) villagesWithFoodOffer++;
    if ((v.storage.food || 0) < N * 30 * 1.2) villagesWithFoodDemand++;
    if ((v.storage.wood || 0) > N * 5 * 0.5) villagesWithWoodOffer++;
    if ((v.storage.wood || 0) < N * 5 * 1.2) villagesWithWoodDemand++;
  }
  console.log(`  food offer/demand: ${villagesWithFoodOffer}/${villagesWithFoodDemand}, wood offer/demand: ${villagesWithWoodOffer}/${villagesWithWoodDemand}`);
}

checkWorld('rational', 42, 500);
checkWorld('rational', 42, 2000);
checkWorld('legacy', 42, 500);
checkWorld('legacy', 42, 2000);
