// === scripts/t847-table.js — T847 ② 표: 버린 생선 · 고기 · 해산물 ↔ 그 마을 갈무리(읽기만) ==========================
// 쓰는 법: node scripts/t847-table.js <p1020.json> <p7.json> <p42.json>   (t847-preserve.js 가 낸 JSON · 시드 차례)
'use strict';
const fs = require('fs');
const SEEDS = [1020, 7, 42];
const FISH = ['fish', 'salmon'], MEAT = ['meat'], SEA = ['seaweed', 'shrimp', 'crab', 'oyster'];
const sum = (o, ks) => ks.reduce((a, k) => a + (+o[k] || 0), 0);
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const pc = (a, b) => b > 0 ? (100 * a / b).toFixed(1) + '%' : '—';
const out = { seeds: {} };
process.argv.slice(2).forEach((file, i) => {
  const s = SEEDS[i]; const P = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = P.rows.map((r) => {
    const fish = sum(r.rot, FISH), meat = sum(r.rot, MEAT), sea = sum(r.rot, SEA), all = Object.values(r.rot).reduce((a, b) => a + b, 0);
    return { name: r.name, days: r.days, cooks: r.days ? r.cookDays / r.days : 0, gate: r.cookDays ? r.gateOpen / r.cookDays : 0,
      budget: r.budget, used: r.used, takeFish: +r.take.fish || 0, takeMeat: +r.take.meat || 0, fish, meat, sea, all, rotDays: r.rotDays, rotDaysGate: r.rotDaysGateOpen };
  });
  const T = rows.reduce((a, r) => { for (const k of ['budget', 'used', 'takeFish', 'takeMeat', 'fish', 'meat', 'sea', 'all', 'rotDays', 'rotDaysGate']) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  const cookDays = P.rows.reduce((a, r) => a + r.cookDays, 0), gateOpen = P.rows.reduce((a, r) => a + r.gateOpen, 0);
  const noCook = rows.filter((r) => r.cooks < 0.05);
  T.noCookVillages = noCook.length; T.noCookRot = noCook.reduce((a, r) => a + r.fish + r.meat + r.sea, 0);
  T.cooksAvg = cookDays / 800; T.gateOpenPct = cookDays ? gateOpen / cookDays : 0;
  out.seeds[s] = { total: T, rows };
  const fms = T.fish + T.meat + T.sea;
  console.log(`\n시드 ${s} — 버림 합 ${f0(T.all)} · 생선 ${f0(T.fish)} · 고기 ${f0(T.meat)} · 해산물 ${f0(T.sea)} (셋 ${pc(fms, T.all)})`);
  console.log(`  요리사 평균 ${T.cooksAvg.toFixed(1)}명(51곳) · 문턱 열림 ${pc(gateOpen, cookDays)} · 손 ${f0(T.budget)} · 쓴 손 ${f0(T.used)}(${pc(T.used, T.budget)}) · 들인 생선 ${f0(T.takeFish)} · 고기 ${f0(T.takeMeat)}`);
  console.log(`  갈무리 ÷ 버림(생선 · 고기 · 해산물) ${pc(T.used, fms)} · ÷ 버림(생선 · 고기) ${pc(T.used, T.fish + T.meat)} · 요리사 없는 마을 ${T.noCookVillages}곳이 버림 ${pc(T.noCookRot, fms)}`);
  console.log(`  버린 날 ${T.rotDays} 중 그날 문턱 열린 날 ${T.rotDaysGate}(${pc(T.rotDaysGate, T.rotDays)})`);
  console.log('  | 마을 | 요리사 | 문턱 열림 | 갈무리 | 버린 생선 | 고기 | 해산물 | 갈무리 ÷ 셋 |');
  for (const r of rows.slice().sort((a, b) => (b.fish + b.meat + b.sea) - (a.fish + a.meat + a.sea)).slice(0, 6))
    console.log(`  | ${r.name} | ${r.cooks.toFixed(2)} | ${pc(r.gate, 1)} | ${f0(r.used)} | ${f0(r.fish)} | ${f0(r.meat)} | ${f0(r.sea)} | ${pc(r.used, r.fish + r.meat + r.sea)} |`);
});
if (process.env.T847_TABLE_OUT) fs.writeFileSync(process.env.T847_TABLE_OUT, JSON.stringify(out));
