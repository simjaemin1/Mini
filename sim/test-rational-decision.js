// Phase 4d-6: 합리적 직업 picker vs legacy picker 비교 시뮬
//
// 가설: 사막 광물 마을 (fertility 낮음 + ore 높음)에서
//   - legacy: 식량 부족 게이트에 막혀 merchant/warrior 못 양성 → 인구 감소
//   - rational: 위험 조정 + 한계효용 기반 → 광부+상인+전사 균형 → 인구 유지
//
// 메트릭:
//   - 마을 생존율 (인구 > 5)
//   - 광물 도시 (fert < 0.4 + ore > 1.2) 평균 인구
//   - 평균 거래 수, 약탈 수, 식량 import 양
//   - 직업 분포 (광물 도시의 farmer/miner/merchant/warrior 비율)

const economy = require('./economy-sim');

const SEEDS = [42, 100, 500, 999];
const DAYS = 3000;

function runOne(picker, seed) {
  const world = economy.createWorld({ seed, villageCount: 20, picker });
  for (let i = 0; i < DAYS; i++) economy.tickWorld(world);
  return world;
}

function isMineral(v) {
  return v.land.fertility < 0.4 && v.land.ore > 1.2;
}
function isFood(v) {
  return v.land.fertility > 1.0;
}

function summarize(world, label) {
  const survivors = world.villages.filter(v => v.npcs.length > 5);
  const mineral = world.villages.filter(isMineral);
  const food = world.villages.filter(isFood);
  const mineralSurvivors = mineral.filter(v => v.npcs.length > 5);
  const avgMineralPop = mineral.length > 0 ?
    mineral.reduce((s, v) => s + v.npcs.length, 0) / mineral.length : 0;
  // 광물 도시 직업 분포
  const mjobs = { farmer:0, miner:0, prospector:0, merchant:0, warrior:0, smith:0, other:0 };
  let mtotalNpcs = 0;
  for (const v of mineral) {
    for (const n of v.npcs) {
      mtotalNpcs++;
      if (mjobs[n.currentJob] !== undefined) mjobs[n.currentJob]++;
      else mjobs.other++;
    }
  }
  // 시스템 전체 통계
  const totalSent = world.villages.reduce((s, v) => s + (v.tradeStats?.caravansSent || 0), 0);
  const totalRaided = world.villages.reduce((s, v) => s + (v.tradeStats?.caravansRaided || 0), 0);
  const totalFoodImp = world.villages.reduce((s, v) => s + (v.tradeStats?.foodImported || 0), 0);

  console.log(`\n=== ${label} (${DAYS}일 후) ===`);
  console.log(`마을 생존: ${survivors.length}/20 (인구 6+)`);
  console.log(`광물 도시 (fert<0.4 ore>1.2): ${mineral.length}개, 생존 ${mineralSurvivors.length}, 평균 인구 ${avgMineralPop.toFixed(1)}`);
  console.log(`식량 도시 (fert>1.0): ${food.length}개`);
  console.log(`총 거래: ${totalSent}, 약탈: ${totalRaided} (${totalSent>0?(totalRaided/totalSent*100).toFixed(1):0}%)`);
  console.log(`총 식량 수입: ${totalFoodImp.toFixed(0)}`);
  if (mtotalNpcs > 0) {
    console.log(`광물 도시 직업 분포 (n=${mtotalNpcs}):`);
    for (const [k,v] of Object.entries(mjobs)) {
      const pct = (v / mtotalNpcs * 100).toFixed(1);
      console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)} (${pct}%)`);
    }
  }
}

console.log(`[Phase 4d-6 비교 시뮬] ${SEEDS.length} 시드 × ${DAYS}일`);
for (const seed of SEEDS) {
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━ SEED ${seed} ━━━━━━━━━━━━━━━━━━━━━━━`);
  summarize(runOne('legacy', seed), `LEGACY picker (seed ${seed})`);
  summarize(runOne('rational', seed), `RATIONAL picker (seed ${seed})`);
}

console.log('\n\n[완료]');
