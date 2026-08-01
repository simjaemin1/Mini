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
  // ★[재민 확정] **순동(純銅)** — 주석 없이 구리만으로 만든 것. 만들 수는 있으나 무르다.
  //   고증: 세계적으로 순동기시대(Chalcolithic)가 있었고 순동 도구·장신구가 실제로 쓰였다.
  //   다만 담금질이 안 되고 물러서 무기로는 열등했다 — 주석을 넣어야 경도가 오른다.
  //   ⇒ 주석 병목을 **막는 벽이 아니라 등급 차이**로 만든다:
  //     마제석기(0.6) < 순동(0.7) < 철(0.85) < 흑요석 날(0.95) < 청동(1.0)
  //     구리만 있는 마을은 순동으로 버티고, 주석을 쥔 쪽이 군사적 우위를 갖는다(현실 구조 그대로).
  //   ★수치는 손으로 정하지 않는다 — 아래에서 합금 모델이 계산해 덮어쓴다(순동 = 0.466).
  copper: 0.7,
};

// ── 주조(鑄造): 임의 배합의 등급을 금속학이 계산한다 [재민 확정] ──────────────
// "주석·구리·납뿐만 아니라 금·철·은 등 **모든 광물**을 가능하게. 값에 따라 연속적으로."
//
// ★MAT_GRADE 는 "재료 한 가지"를 위한 손으로 적은 표다. 그 표를 늘리는 대신
//   **배합 자체를 받는다**: matGrade({copper:0.83, tin:0.17}) → specialty.alloyGrade.
//   표는 그대로 두되, 표와 모델이 **어긋나면 안 되므로** 겹치는 항목(순동)은 모델이 덮어쓴다.
//
// ★어디까지 주조로 볼 것인가 — 시대가 자른다.
//   청동기 노는 1085℃(구리)까지다. 철(1538℃)·아연(907℃에서 증발)은 못 녹인다.
//   ⇒ alloySmeltable() 이 참인 금속만 도가니에 들어간다. 철·흑요석·돌·나무·뼈는
//     '주조'가 아니라 깎고 두드려 만드는 것이라 옛 단일재료 경로(MAT_GRADE)를 그대로 쓴다.
let Specialty = null;
try { Specialty = require('./specialty'); } catch (e) { Specialty = null; }
const MAT_KO = { copper: '구리', tin: '주석', lead: '납', zinc: '아연', silver: '은', gold: '금', iron: '철', nickel: '니켈' };
const CAST_ERA = 'bronze';
const CAST_MAX_KINDS = 3;      // 재민: "금속 3개까지 합금을 자유롭게"
const CAST_GRADE_MAX = 1.6;    // 폭주 방지 상한(금 배합이 청동의 2배를 넘지 못하게)
function castable(m) { return !!(Specialty && Specialty.ALLOY_E && Specialty.ALLOY_E[m] && Specialty.alloySmeltable(m, CAST_ERA)); }
function castKinds() { return Specialty ? Object.keys(Specialty.ALLOY_E).filter(castable) : []; }
// 아이템 유형 → 합금 평가 축. 무기·갑옷·도구는 경도×인성×경량성, 장신구는 광택×주조성.
const CAST_KIND = { weapon: 'weapon', armor: 'weapon', tool: 'weapon', clothes: 'ornament' };
// 배합 → 등급. 전부 주조 가능 금속일 때만 합금 모델을 쓴다(그 외엔 MAT_GRADE 가중평균).
function castGrade(materials, kind) {
  if (!Specialty || !Specialty.alloyGrade) return null;
  const ks = Object.keys(materials || {}).filter((k) => materials[k] > 0);
  if (!ks.length || ks.length > CAST_MAX_KINDS) return null;
  if (!ks.every(castable)) return null;
  const g = Specialty.alloyGrade(materials, kind || 'weapon');
  return g > 0 ? Math.min(CAST_GRADE_MAX, g) : null;
}

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
// 재료 믹스 등급 — 주조 금속만으로 된 배합이면 **합금 모델**, 아니면 옛 무게 가중평균.
function matGrade(materials, kind) {
  const cg = castGrade(materials, kind);
  if (cg != null) return cg;
  let num = 0, den = 0;
  for (const m in materials) { const g = MAT_GRADE[m]; if (g == null) continue; num += materials[m] * g; den += materials[m]; }
  return den > 0 ? num / den : 0.6;
}
// ★표와 모델을 한 값으로 못박는다 — 순동을 손으로 0.7 이라 적어놨었는데 모델은 0.466 이라 한다.
//   같은 재료가 UI 미리보기(표)와 실제 제작(모델)에서 다른 값이면 그게 버그다. 모델을 따른다.
if (Specialty && Specialty.alloyGrade) {
  for (const m of castKinds()) { const g = Specialty.alloyGrade({ [m]: 1 }, 'weapon'); if (g > 0) MAT_GRADE[m] = +g.toFixed(3); }
}
// ★★운철(隕鐵) — 등급을 손으로 적지 않는다. **합금 모델이 낸 니켈 프리미엄**을 철 앵커에 곱한다.
//   [재민 확정 · era.js §METEORIC] "니켈의 역할은 난이도가 아니라 성능이다 — 순철보다 단단하고
//   덜 삭는다(3천 년 유물이 남은 이유)". Fe93/Ni7 은 모델이 순철보다 약 6% 좋다고 답한다.
//   iron 은 청동기에 주조 불가라 위 루프가 못 덮어쓰므로(=손으로 적은 0.85 가 앵커로 남는다),
//   운철도 그 앵커에 **비율만** 얹는다. 두 값이 서로 다른 척도를 타면 그게 버그다.
if (Specialty && Specialty.alloyGrade) {
  const gFe = Specialty.alloyGrade({ iron: 1 }, 'weapon');
  const gMet = Specialty.alloyGrade({ iron: 0.93, nickel: 0.07 }, 'weapon');   // era.METEORIC 과 같은 배합
  MAT_GRADE.meteoric_iron = gFe > 0 ? +(MAT_GRADE.iron * (gMet / gFe)).toFixed(3) : MAT_GRADE.iron;
}

// ── 제작: 플레이어 숙련 × 재료 → 인스턴스 (설계 §3 숙련 진행 가시화) ──
function craftItem(type, skillLevel, materials) {
  const def = ITEM_TYPES[type];
  if (!def) throw new Error('unknown item type: ' + type);
  const q = qSkill(skillLevel) * matGrade(materials, CAST_KIND[type]);   // 0.24(초보·삼베) ~ 1.0(만렙·모피/청동)
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
  const rq = qSkill(skillLevel) * matGrade(materials, CAST_KIND[inst.type]);
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
  // 주조품은 배합을 이름에 달아준다 — "무기[공격 109]" 보다 "무기(구리83·주석17)" 가 정보다.
  const alloy = inst.mix && Object.keys(inst.mix).length
    ? '(' + Object.entries(inst.mix).map(([k, v]) => (MAT_KO[k] || k) + Math.round(v) + '%').join('·') + ')' : '';
  return def.label + alloy + ' [' + parts.join(' · ') + ']' + (inst.craftedSkill != null ? ' — Lv' + inst.craftedSkill + ' 제작' : '');
}

module.exports = { MAT_GRADE, ITEM_TYPES, Q_SKILL_SPAN, DURA_SPAN, qSkill, matGrade, craftItem, wearItem, repairItem, decayFreshness, materializeFromVillage, sellNudge, displayItem,
  castable, castKinds, castGrade, CAST_KIND, CAST_MAX_KINDS, CAST_GRADE_MAX, CAST_ERA, MAT_KO };

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
