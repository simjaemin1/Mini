// server/player-items.js — 플레이어 아이템 인스턴스 시스템 (candidate E 구현 슬라이스, 2026-07-13)
// 설계: durango-mini/플레이어_아이템_속성_설계.md · 생활층_인계훅.md §3.
// ★econ 무접촉: 이 모듈은 플레이어 제작/장비/내구 로직만. NPC 경제(economy-sim)는 스칼라+EMA 그대로.
//   통합점(다음): server/zone.js:938 스칼라 인벤토리 → { materials:{스택}, equipment:[인스턴스] }.
//   이 모듈이 인스턴스 생성·속성 수치·내구를 담당하고, zone.js는 인벤토리 보관/장착/방송만 얹으면 됨.
// ★코히런스: 재료 등급·숙련→품질 공식을 econ(economy-sim.js CLOTH_Q_MAT·_qSkill)과 *동일값* 공유 —
//   플레이어가 만든 옷 품질과 마을 스톡 품질(_clothQ)이 같은 척도라야 구매 실체화/판매 넛지가 정합.
'use strict';

// ── 재료 품질 등급 (economy-sim.js CLOTH_Q_MAT 단일 진실 + 무기/도구 재료 확장) ──
const MAT_GRADE = {
  // 옷감/가죽 (CLOTH_Q_MAT verbatim)
  fur: 1.0, ramie: 0.9, leather: 0.85, hide: 0.65, hemp: 0.6,
  // 무기/도구 재료 (WEAP_Q 티어: 청동>철>석 · 도구/활)
  bronze: 1.0, iron: 0.85, stone: 0.6, wood: 0.7, bone: 0.8, obsidian: 0.95,
};

// ── 유형별 속성 정의 (설계 §2: 유형당 2~3개, 기존 econ 채널 매핑) ──
const ITEM_TYPES = {
  clothes: { label: '옷',   attrs: { warmth: '방한' },      baseDura: 120, attrScale: 62,  durable: true },  // 방한 ~ 보온-eq(CLOTH_MAT_WARMTH_PER 반영)
  armor:   { label: '갑옷', attrs: { defense: '방어' },     baseDura: 200, attrScale: 100, durable: true },
  weapon:  { label: '무기', attrs: { attack: '공격' },      baseDura: 150, attrScale: 100, durable: true },
  tool:    { label: '도구', attrs: { efficiency: '효율' },  baseDura: 180, attrScale: 100, durable: true },
  food:    { label: '요리', attrs: { nutrition: '영양', buff: '버프' }, perishable: true, freshDays: 5 },
};

const Q_SKILL_SPAN = 0.6;   // economy-sim.js WEAP_Q_SKILL_SPAN / CLOTH_Q_SKILL_SPAN 동일
const DURA_SPAN = 0.6;      // 품질→수명 폭(내구 = base×(1+DURA_SPAN×q)) — econ서 기각된 내구의 플레이어층 재활용(설계 §5)

// 숙련(0~10) → _qSkill 0.4~1.0 (economy-sim 동일 공식)
function qSkill(level) {
  const l = Math.max(0, Math.min(10, level || 0));
  return 1 - Q_SKILL_SPAN + Q_SKILL_SPAN * (l / 10);
}
// 재료 믹스 등급(무게 가중평균)
function matGrade(materials) {
  let num = 0, den = 0;
  for (const m in materials) { const g = MAT_GRADE[m]; if (g == null) continue; num += materials[m] * g; den += materials[m]; }
  return den > 0 ? num / den : 0.6;
}

// ── 제작: 플레이어 숙련 × 재료 → 인스턴스 (설계 §3 숙련 진행 가시화) ──
function craftItem(type, skillLevel, materials) {
  const def = ITEM_TYPES[type];
  if (!def) throw new Error('unknown item type: ' + type);
  const q = qSkill(skillLevel) * matGrade(materials);   // 0.24(초보·삼베) ~ 1.0(만렙·모피/청동)
  const inst = { type, q: +q.toFixed(3), craftedSkill: skillLevel, attrs: {} };
  for (const a in def.attrs) {
    if (a === 'buff') inst.attrs.buff = +q.toFixed(2);
    else if (a === 'freshness') continue;
    else inst.attrs[a] = Math.round((def.attrScale || 100) * q);
  }
  if (def.durable) { inst.durMax = Math.round(def.baseDura * (1 + DURA_SPAN * q)); inst.dura = inst.durMax; }
  if (def.perishable) { inst.attrs.freshness = 100; inst.craftedAt = null; }   // craftedAt은 호출측이 게임시각 주입
  return inst;
}

// ── 내구 소모/수선 (설계 §5: 인스턴스별이라 NPC 경제 전역 피드백 0 = econ서 기각된 내구가 여기선 안전) ──
function wearItem(inst, amount) {
  if (inst.dura == null) return inst;
  inst.dura = Math.max(0, inst.dura - (amount || 1));
  inst.broken = inst.dura === 0;
  return inst;
}
function repairItem(inst, skillLevel, materials) {
  if (inst.dura == null || inst.durMax == null) return inst;
  const rq = qSkill(skillLevel) * matGrade(materials);
  inst.dura = Math.min(inst.durMax, inst.dura + Math.round(inst.durMax * 0.5 * rq));
  inst.broken = inst.dura === 0;
  return inst;
}

// ── 요리 신선도 감쇠 (인스턴스 타임스탬프 — 갓 지은 요리 > 식은 요리) ──
function decayFreshness(inst, nowGameDays) {
  if (inst.type !== 'food' || inst.craftedAt == null) return inst;
  const age = nowGameDays - inst.craftedAt;
  const life = ITEM_TYPES.food.freshDays;
  inst.attrs.freshness = Math.max(0, Math.round(100 * (1 - age / life)));
  return inst;
}

// ── 경계 계약 (설계 §4): 구매 = 마을 품질 EMA(_clothQ/_weapQ/_cookQ 0~1) ±소분산 샘플로 실체화 ──
//   대표 재료 등급은 마을 품질을 역산 근사(플레이어 제작과 같은 척도).
function materializeFromVillage(type, villageQ, rand) {
  const r = (typeof rand === 'function' ? rand() : Math.random());
  const q = Math.max(0.1, Math.min(1, (villageQ || 0.6) + (r - 0.5) * 0.2));
  // q = qSkill(lvl) × matGrade ≈ q → 대표 숙련 역산(재료 등급 0.8 가정)
  const lvl = Math.max(0, Math.min(10, Math.round((q / 0.8 - (1 - Q_SKILL_SPAN)) / Q_SKILL_SPAN * 10)));
  return craftItem(type, lvl, { _proxy: 0.8 * 1 });   // _proxy 등급 0.8 대표
}
// 판매 = 용해 + 품질이 마을 EMA 넛지(명장 플레이어가 마을 스톡 품질 견인 — 남획이 gameRich에 기록되는 것 동형).
function sellNudge(villageQ, inst, weight) {
  const w = weight == null ? 0.05 : weight;   // EMA 넛지 강도(약하게)
  return (villageQ || 0.6) * (1 - w) + (inst.q || 0.6) * w;
}

// ── 표시: "가죽 외투 [방한 62 · 내구 85/85] — 재봉 Lv7 제작" (설계 §3 뿌듯함) ──
function displayItem(inst) {
  const def = ITEM_TYPES[inst.type] || { label: inst.type, attrs: {} };
  const parts = [];
  for (const a in inst.attrs) {
    const lbl = def.attrs[a] || (a === 'freshness' ? '신선도' : a);
    parts.push(lbl + ' ' + inst.attrs[a]);
  }
  if (inst.dura != null) parts.push('내구 ' + inst.dura + '/' + inst.durMax);
  return def.label + ' [' + parts.join(' · ') + ']' + (inst.craftedSkill != null ? ' — Lv' + inst.craftedSkill + ' 제작' : '');
}

module.exports = { MAT_GRADE, ITEM_TYPES, Q_SKILL_SPAN, DURA_SPAN, qSkill, matGrade, craftItem, wearItem, repairItem, decayFreshness, materializeFromVillage, sellNudge, displayItem };

// ── 자가검증 (node server/player-items.js) ──
if (require.main === module) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.log('❌ ' + m)); };

  // 1) 숙련 진행 가시화: Lv0 삼베옷 < Lv10 모피옷 (방한·내구 둘 다↑)
  const c0 = craftItem('clothes', 0, { hemp: 1 });
  const c10 = craftItem('clothes', 10, { fur: 1 });
  console.log('Lv0 삼베옷 :', displayItem(c0));
  console.log('Lv10 모피옷:', displayItem(c10));
  ok(c10.attrs.warmth > c0.attrs.warmth, '방한 숙련·재료 진행');
  ok(c10.durMax > c0.durMax, '내구 숙련·재료 진행');
  ok(Math.abs(c0.q - qSkill(0) * 0.6) < 1e-9, 'q = _qSkill×재료등급(삼베 0.6)');
  ok(Math.abs(c10.q - qSkill(10) * 1.0) < 1e-9, 'q = 만렙×모피(1.0)');

  // 2) 무기/도구/갑옷 속성 + 내구
  const sword = craftItem('weapon', 7, { bronze: 1 });
  console.log('청동검(Lv7):', displayItem(sword));
  ok(sword.attrs.attack > 0 && sword.dura > 0, '무기 공격·내구');

  // 3) 내구 소모/파손/수선
  wearItem(sword, sword.dura - 5); ok(sword.dura === 5 && !sword.broken, '마모');
  wearItem(sword, 10); ok(sword.dura === 0 && sword.broken, '파손');
  repairItem(sword, 7, { bronze: 1 }); ok(sword.dura > 0 && !sword.broken, '수선');

  // 4) 요리 신선도 감쇠
  const dish = craftItem('food', 5, { meat: 0.5, vegetable: 0.5 }); dish.craftedAt = 100;
  ok(dish.attrs.nutrition > 0 && dish.attrs.buff > 0, '요리 영양·버프');
  decayFreshness(dish, 100); ok(dish.attrs.freshness === 100, '갓 지은 신선도 100');
  decayFreshness(dish, 102.5); ok(dish.attrs.freshness === 50, '2.5일 후 신선도 50(5일 수명)');
  decayFreshness(dish, 106); ok(dish.attrs.freshness === 0, '상함');

  // 5) 경계 계약: 판매 넛지가 마을 품질을 명장 방향으로 견인
  const nudged = sellNudge(0.5, { q: 1.0 }); ok(nudged > 0.5 && nudged < 1.0, '판매 EMA 넛지(마을 품질↑)');
  // 구매 실체화: 마을 품질 높으면 좋은 옷
  const bought = materializeFromVillage('clothes', 0.9, () => 0.5); ok(bought.attrs.warmth > 0, '구매 실체화');

  console.log('');
  console.log('자가검증: ' + pass + ' 통과 / ' + fail + ' 실패 ' + (fail ? '❌' : '✅'));
  process.exit(fail ? 1 : 0);
}
