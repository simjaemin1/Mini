#!/usr/bin/env node
// (표 없음 — **계측기다. 러너에 넣지 마라.**)
// === scripts/tidal-metrics.js — 갯벌 대리 지표 ====================================
//   재민이 실기 전에 봐야 할 수를 한 장으로 낸다. **판정하지 않는다** — 수만 낸다.
//     ① 물때 — 한 주기 몇 분, 그중 몇 분이 열리나
//     ② **갯벌 한 물때 수확 kg** (카드가 요구한 수)
//     ③ 그 수확이 적재 상한과 만나면 어떻게 되나(T12 지게와의 접점)
//     ④ 먹을 것으로서의 값 — 허기 한 칸에 몇 개인가
//     ⑤ 겨울나기 셈에 얹으면
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require(path.join(ROOT, 'server', 'tidal.js'));
const F = require(path.join(ROOT, 'server', 'forage.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const C = require(path.join(ROOT, 'server', 'carry.js'));
const Sp = require(path.join(ROOT, 'server', 'spoil.js'));
const Specialty = require(path.join(ROOT, 'server', 'specialty.js'));

console.log('=== 갯벌 대리 지표 ===\n');

// ── ① 물때 ──────────────────────────────────────────────────────────────────
const P = T.CFG.PERIOD_MS, openMin = (T.CFG.OPEN_FRAC * P) / 60000;
console.log('① 물때');
console.log(`   주기 **${(P / 60000).toFixed(2)}분**(반일주조 M2 12h25m — 고증 그대로 · 벽시계)`);
console.log(`   그중 갯벌이 드러나는 시간 **${openMin.toFixed(2)}분**(${(T.CFG.OPEN_FRAC * 100).toFixed(0)}%)`);
console.log(`   ⇒ 하루(게임일 24분)에 물때가 **${(24 / (P / 60000)).toFixed(1)}번** 돌고, 캘 수 있는 건 **${(openMin * 24 / (P / 60000)).toFixed(1)}분**`);

// ── ② 한 물때 수확 ──────────────────────────────────────────────────────────
console.log('\n② 갯벌 한 물때 수확 — ★카드가 요구한 수');
const CD = F.CFG.COOLDOWN_MS, CAP = F.CFG.CAP, REF = F.CFG.REFILL_MIN;
console.log(`   채집 쿨다운 ${CD}ms · 한 자리가 품은 양 ${CAP} · 리필 ${REF}분(자염과 **같은 손잡이** — 갯벌 전용 없음)`);
const openMs = T.CFG.OPEN_FRAC * P;
const byTime = Math.floor(openMs / Math.max(1, CD));
console.log(`   시간만 따지면 한 물때에 **${byTime}회**(쿨다운 상한)`);
// 자리를 옮겨 가며 캔다 — 한 자리는 CAP 에서 마른다
const cellsNeeded = Math.ceil(byTime / CAP);
console.log(`   그런데 한 자리는 ${CAP}회면 마른다 ⇒ **${cellsNeeded}칸**을 옮겨 다녀야 그 수가 나온다(반독점)`);
// 분포대로 무게를 낸다(결정론 — 표본이 아니라 전수)
let n = { seaweed: 0, oyster: 0, abalone: 0 }, tot = 0;
for (let cx = 0; cx < 600; cx++) for (let cy = 0; cy < 60; cy++) {
  const k = T.pickAt(cx * 32 + 16, cy * 32 + 16, 0); if (k) { n[k]++; tot++; }
}
const kg = (k) => W.kgOf(k);
const avgKg = (n.seaweed * kg('seaweed') + n.oyster * kg('oyster') + n.abalone * kg('abalone')) / tot;
const avgVal = (n.seaweed * Specialty.RESOURCES.seaweed.baseValue + n.oyster * Specialty.RESOURCES.oyster.baseValue
              + n.abalone * Specialty.RESOURCES.abalone.baseValue) / tot;
console.log(`   자리 분포(전수 ${tot}칸): 해조 ${(n.seaweed / tot * 100).toFixed(1)}% · 굴 ${(n.oyster / tot * 100).toFixed(1)}% · 전복 ${(n.abalone / tot * 100).toFixed(1)}%`);
console.log(`   한 번에 평균 **${avgKg.toFixed(3)}kg** · econ 값 평균 **${avgVal.toFixed(2)}**`);
console.log(`   ⇒ ★한 물때 수확 = ${byTime}회 × ${avgKg.toFixed(3)}kg = **${(byTime * avgKg).toFixed(1)}kg** (이론 상한 · 쉬지 않고 옮겨 다닐 때)`);

// ── ③ 적재 상한과 만나면 ────────────────────────────────────────────────────
console.log('\n③ 그 수확이 **적재 상한**과 만나면 (T12 지게 접점)');
const bare = C.CFG.CAP_KG;
console.log(`   맨몸 상한 ${bare}kg ⇒ 한 물때 이론치 ${(byTime * avgKg).toFixed(1)}kg 중 **${Math.min(bare, byTime * avgKg).toFixed(1)}kg** 만 들고 나온다`);
const PI = require(path.join(ROOT, 'server', 'player-items.js'));
for (const lv of [0, 10]) {
  const i = PI.craftItem('carrier', lv, { wood: 2 });
  const cap = bare + i.attrs.load - W.kgOf('carrier');
  console.log(`   지게 Lv${String(lv).padStart(2)} ⇒ 짐 ${cap}kg — 굴로 치면 **${Math.floor(cap / kg('oyster'))}개**(맨몸 ${Math.floor(bare / kg('oyster'))}개)`);
}
console.log('   ⇒ ★갯벌은 **시간이 아니라 등짐이 병목**이다. 지게가 여기서 두 번째 쓸모를 얻는다.');

// ── ④ 먹을 것으로서 ─────────────────────────────────────────────────────────
console.log('\n④ 먹을 것으로서의 값');
const food = T.foodMap();
for (const [k, e] of Object.entries(food)) {
  const per = 100 / e.hunger;
  console.log(`   ${T.koOf(k).padEnd(3)} 허기 ${String(e.hunger).padStart(2)} · 갈증 ${String(e.thirst).padStart(2)} · ${kg(k)}kg`
            + ` ⇒ 배를 다 채우려면 **${Math.ceil(per)}개(${(Math.ceil(per) * kg(k)).toFixed(1)}kg)** · 보관 ${Sp.shelfOf(k)}일`);
}
console.log('   ⇒ ★굴은 **주식이 아니다**(배를 채우려면 34개 = 6.8kg). 별미이자 교역품이고,');
console.log('      조개탕으로 가면 요리 인스턴스(품질·신선도)가 되어 값이 달라진다.');

// ── ⑤ 겨울나기 셈에 얹으면 ──────────────────────────────────────────────────
console.log('\n⑤ 겨울나기 넷째 수치');
console.log('   부패: 겨울 한 주 = 건어물 11.7단위 · 작물: 밭 6칸 · 자염: 절임 한 통 = 바닷가 왕복');
console.log(`   갯벌: 한 물때 ${(Math.min(bare, byTime * avgKg)).toFixed(1)}kg(맨몸) — 그런데 **굴은 ${Sp.shelfOf('oyster')}일이면 상한다**.`);
console.log('   ⇒ ★갯벌은 겨울 비축이 **아니다**. 그 자리에서 먹거나, 말리거나(회부), 파는 것이다.');
console.log('\n(수는 전부 정본에서 온다 — 이 스크립트는 계산만 한다.)');
