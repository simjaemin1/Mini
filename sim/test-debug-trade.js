// 거래 발동 안 되는 이유 진단 — 100일 + 모든 게이트 로그
const economy = require('./economy-sim');
const world = economy.createWorld({ seed: 42, villageCount: 20, picker: 'legacy' });

for (let i = 0; i < 100; i++) economy.tickWorld(world);

console.log(`\n=== Day ${world.day} 상태 ===`);
console.log(`마을 수: ${world.villages.length}`);
console.log(`총 캐러밴 (활성): ${world.caravans.length}`);
console.log(`총 거래 로그: ${world.tradeLog.length}`);
console.log();

// 각 마을 상태
for (const v of world.villages.slice(0, 5)) {
  const N = v.npcs.length;
  console.log(`[${v.name}] N=${N} food=${(v.storage.food||0).toFixed(0)} wood=${(v.storage.wood||0).toFixed(0)} stone=${(v.storage.stone||0).toFixed(0)} ore=${(v.storage.ore||0).toFixed(0)}`);
  console.log(`  토지: fert=${v.land.fertility.toFixed(2)} water=${v.land.water.toFixed(2)} wood=${v.land.wood.toFixed(2)} stone=${v.land.stone.toFixed(2)} ore=${v.land.ore.toFixed(2)}`);
  console.log(`  직업: ${Object.entries(v.counts).filter(([,n])=>n>0).map(([k,n])=>`${k}=${n}`).join(', ')}`);
  console.log(`  stats: sent=${v.tradeStats?.caravansSent||0} raided=${v.tradeStats?.caravansRaided||0} foodImp=${(v.tradeStats?.foodImported||0).toFixed(0)}`);
}

// 모든 마을 정렬 — pop 큰 순
console.log('\n=== 모든 마을 (pop 순) ===');
world.villages.slice().sort((a,b)=>b.npcs.length-a.npcs.length).forEach(v => {
  console.log(`  ${v.name.padEnd(8)} N=${String(v.npcs.length).padStart(3)} sent=${v.tradeStats?.caravansSent||0}`);
});
