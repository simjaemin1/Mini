#!/usr/bin/env node
// (표 없음 — **계측기다. 러너에 넣지 마라.**)
// === scripts/tidal-metrics.js — 갯벌 대리 지표 ====================================
//   재민이 실기 전에 봐야 할 수를 한 장으로 낸다. **판정하지 않는다** — 수만 낸다.
//     ① 물때 — 한 주기 몇 분, 그중 몇 분이 열리나
//     ② **갯벌 한 물때 수확 kg** (카드가 요구한 수)
//     ③ 그 수확이 적재 상한과 만나면 어떻게 되나(T12 지게와의 접점)
//     ④ 먹을 것으로서의 값 — 허기 한 칸에 몇 개인가
//     ⑤ 겨울나기 셈에 얹으면
//   ★★[T54] 둘이 더 붙었다:
//     ⑥ **물 한 병** — 갈증 몇 %인가, 들판을 몇 분 건너나
//     ⑦ **말리기** — 한 물때 수확이 건굴 몇 단위 = 겨울 며칠인가(⑤의 "아니다"가 뒤집히는지)
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
  if (!T.isCatch(k)) continue;   // ★[T54] 그릇(민물)은 먹을 것이 아니라 마실 것이다 — ⑥에서 따로 낸다
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
console.log('   ⇒ ★T52 의 답: 갯벌은 겨울 비축이 **아니었다**. 그 자리에서 먹거나 파는 것이었다.');

// ── ⑥ 물 한 병 [T54] ───────────────────────────────────────────────────────
console.log('\n⑥ 물 한 병 — ★T54 가 연 것');
const B = require(path.join(ROOT, 'server', 'body.js'));
const fw = food[T.FRESH];
console.log(`   한 되 = 갈증 **+${fw.thirst}**(게이지 100 중 ${fw.thirst}%) · ${kg(T.FRESH)}kg · 마시면 빈 병이 돌아온다`);
const thirstSec = (B.CFG && (B.CFG.THIRST_SEC || B.CFG.BODY_THIRST_SEC)) || null;
if (thirstSec) {
  const secPerPct = thirstSec / 100;
  console.log(`   갈증 0→100 이 ${Math.round(thirstSec / 60)}분(실시간) ⇒ 한 되가 **${(fw.thirst * secPerPct / 60).toFixed(1)}분**을 벌어 준다`);
  const capBottles = Math.floor(bare / kg(T.FRESH));
  console.log(`   맨몸(${bare}kg)으로 최대 ${capBottles}되 ⇒ **${(capBottles * fw.thirst * secPerPct / 60).toFixed(0)}분**치 물을 진다(짐을 물로만 채웠을 때)`);
  const PI2 = require(path.join(ROOT, 'server', 'player-items.js'));
  const i10 = PI2.craftItem('carrier', 10, { wood: 2 });
  const cap10 = bare + i10.attrs.load - W.kgOf('carrier');
  console.log(`   지게 Lv10(${cap10}kg)이면 **${(Math.floor(cap10 / kg(T.FRESH)) * fw.thirst * secPerPct / 60).toFixed(0)}분**치 — 물이 짐과 맞바꿔진다`);
} else {
  console.log('   (갈증 소모 속도 손잡이를 못 읽었다 — body.CFG 를 확인해라)');
}
console.log('   ⇒ ★물은 이제 **짐이다**. 내륙 횡단은 "물가를 따라가느냐, 물을 지고 질러가느냐"의 판단이 된다.');

// ── ⑦ 말리기 [T54] ─────────────────────────────────────────────────────────
console.log('\n⑦ 말리기 — ★"갯벌은 겨울 비축이 아니다"가 뒤집히나');
const hungerPerDay = (() => {
  const hs = (B.CFG && (B.CFG.HUNGER_SEC || B.CFG.BODY_HUNGER_SEC)) || null;
  if (!hs) return null;
  const dayMs = 24 * 60 * 1000;
  return 100 * (dayMs / 1000) / hs;   // 하루에 채워야 하는 허기 총량
})();
const dryRows = Object.entries(Sp.PRESERVE).filter(([k, r]) => r.kind === 'dry' && T.isCatch(r.from));
for (const [key, r] of dryRows) {
  const eff = T.driedEffects()[r.out];
  const raw = T.CATCH[r.from].food;
  console.log(`   ${r.label.padEnd(7)} ${T.koOf(r.from)} → ${Sp.PRESERVED_ITEMS[r.out].ko}`
    + ` · 허기 ${raw.hunger}→**${eff.hunger}** · 갈증 ${raw.thirst}→**${eff.thirst}**`
    + ` · ${kg(r.from)}kg→**${kg(r.out)}kg** · 보관 ${Sp.shelfOf(r.from)}일→**${Sp.shelfOf(r.out)}일**`);
  if (hungerPerDay) {
    const perDay = hungerPerDay / eff.hunger;
    console.log(`            ⇒ 하루치 ${perDay.toFixed(1)}단위(${(perDay * kg(r.out)).toFixed(2)}kg) · 겨울 한 주 **${(perDay * 7).toFixed(1)}단위(${(perDay * 7 * kg(r.out)).toFixed(2)}kg)**`);
  }
}
if (hungerPerDay) {
  // 한 물때 수확을 전부 말리면 며칠인가 — 맨몸 상한으로 잘라서
  const perPick = 1;   // 한 번에 한 단위
  const picks = byTime;
  const oyShare = n.oyster / tot, wdShare = n.seaweed / tot, abShare = n.abalone / tot;
  const dOy = Math.floor(picks * oyShare * perPick), dWd = Math.floor(picks * wdShare * perPick);
  const hun = dOy * T.driedEffects().dried_oyster.hunger + dWd * T.driedEffects().dried_seaweed.hunger;
  const kgs = dOy * kg('dried_oyster') + dWd * kg('dried_seaweed');
  console.log(`   ★한 물때 **이론 상한**(${picks}회 · 쉬지 않고 칸을 옮겨 다닐 때 · 굴 ${(oyShare * 100).toFixed(0)}% 해조 ${(wdShare * 100).toFixed(0)}% 전복 ${(abShare * 100).toFixed(0)}%)을 전부 말리면`);
  console.log(`     건굴 ${dOy} + 마른 미역 ${dWd} = 허기 **${hun}** · 무게 **${kgs.toFixed(2)}kg** ⇒ **${(hun / hungerPerDay).toFixed(1)}일치**`);
  console.log(`     ⇒ ★★말린 것은 ${kgs.toFixed(2)}kg 밖에 안 나가므로 맨몸 ${bare}kg 으로 **${Math.floor(bare / (kgs / Math.max(1, dOy + dWd)))}단위**까지 진다 —`);
  console.log(`        생물로는 등짐이 병목이었는데 **말리면 그 병목이 사라진다**(수분을 두고 오는 것이다).`);
  console.log('   ⇒ ★★★T54 의 답: 갯벌은 **이제 겨울 비축이 된다**. 다만 보관은 갯벌이 아니라 **건조대**가 만든다.');
}
console.log('\n(수는 전부 정본에서 온다 — 이 스크립트는 계산만 한다.)');
