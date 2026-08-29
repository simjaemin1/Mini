#!/usr/bin/env node
// === scripts/craft-metrics.js — 시설 제작창 대리 지표 ============================
//
// ★[재민 확정 2026-08-29 · 검증 §5] 지시가 요구한 셋:
//   ① 조잡 → 정품 **사다리 시간·비용 표**
//   ② **자작 vs 구매 손익 표**(상호의존 방어선의 수치화 — 듀랑고병이 나는지)
//   ③ **제작 시간 채택값**
//
// ⚠계측기다 — PASS/FAIL 을 세지 않는다. **러너에 넣지 마라.**
// ⚠수를 여기서 다시 정하지 않는다: 품질은 `player-items`, 시간·시설은 `facility`,
//   레시피·건축비는 `zone.__testBind()` 가 낸 **정본 값**이다.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36500 + (process.pid % 90));
process.env.DB_PATH = `/tmp/craft-metrics-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l;
const H = Zone.__testBind();
const F = require(path.join(ROOT, 'server', 'facility.js'));
const PI = require(path.join(ROOT, 'server', 'player-items.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const pad = (s, n) => String(s).padStart(n);
const padr = (s, n) => { s = String(s); let w = 0; for (const c of s) w += (c.charCodeAt(0) > 0x2000 ? 2 : 1); return s + ' '.repeat(Math.max(0, n - w)); };

console.log('\n=== 시설 제작창 대리 지표 (정본만 사용) ===');

// ── ③ 제작 시간 채택값 ─────────────────────────────────────────────────────
console.log('\n③ 제작 시간 채택값 (전부 env 손잡이 · **벽시계**다 — 게임일과 무관하고 오프라인에도 흐른다)');
console.log(`  요리 CRAFT_COOK_MS  ${pad(F.CRAFT_MS.cook, 8)}ms  (${(F.CRAFT_MS.cook / 1000).toFixed(0)}초 — 불에 얹는 일)`);
console.log(`  도구 CRAFT_TOOL_MS  ${pad(F.CRAFT_MS.tool, 8)}ms  (${(F.CRAFT_MS.tool / 60000).toFixed(1)}분 — 갈아 만드는 일)`);
console.log(`  제련 CRAFT_SMELT_MS ${pad(F.CRAFT_MS.smelt, 8)}ms  (${(F.CRAFT_MS.smelt / 60000).toFixed(1)}분)`);
console.log(`  시설 반경 ${F.FACILITIES.workbench.range}px · 대기열 상한 ${F.MAX_QUEUE}개/시설`);

// ── ① 사다리 ───────────────────────────────────────────────────────────────
console.log('\n① 조잡 → 정품 사다리 (나무 채집 기준)');
const CR = H.RECIPES.crude_axe, EQ = H.EQUIPMENT_RECIPES.tool;
const TE = H.TOOL_EFFECTS, TD = H.TOOL_MAX_DURABILITY;
const kg = (o) => Object.entries(o).reduce((a, [k, n]) => a + (W.kgOf(k) || 0) * n, 0);
console.log(`  ${padr('단', 6)}${padr('재료', 30)}${pad('시설', 8)}${pad('시간', 8)}${pad('배수', 6)}${pad('내구', 7)}${pad('평생', 7)}`);
console.log(`  ${padr('맨손', 6)}${padr('—', 30)}${pad('없음', 8)}${pad('0', 8)}${pad(1, 6)}${pad('∞', 7)}${pad('∞', 7)}`);
console.log(`  ${padr('조잡', 6)}${padr(Object.entries(CR.cost).map(([k, n]) => `${k}×${n}`).join(' '), 30)}${pad('없음', 8)}${pad('즉시', 8)}${pad(TE.crude_axe.gatherWoodMult, 6)}${pad(TD.crude_axe, 7)}${pad(TE.crude_axe.gatherWoodMult * TD.crude_axe, 7)}`);
for (const mat of ['stone', 'bronze']) {
  const g = PI.MAT_GRADE[mat];
  const inst0 = PI.craftItem('tool', 0, { [mat]: EQ.qty });
  const inst10 = PI.craftItem('tool', 10, { [mat]: EQ.qty });
  console.log(`  ${padr('정품', 6)}${padr(`${mat}×${EQ.qty} (등급 ${g})`, 30)}${pad('작업대', 8)}${pad((F.CRAFT_MS.tool / 60000).toFixed(1) + '분', 8)}${pad('—', 6)}${pad(`${inst0.durMax}~${inst10.durMax}`, 7)}${pad('—', 7)}`);
}
console.log(`  ★조잡 재료 ${kg(CR.cost).toFixed(1)}kg vs 정품 재료 ${(W.kgOf('stone') * EQ.qty).toFixed(1)}kg · 작업대 선투자 ${JSON.stringify(H.BUILDING_COST.workbench)}(${kg(H.BUILDING_COST.workbench).toFixed(0)}kg)`);
console.log(`  ★정품 도구는 **효율 속성**(efficiency)으로 일한다 — 조잡본의 ×2 배수와는 다른 축이다(장착 가산).`);

// ── ② 자작 vs 구매 ─────────────────────────────────────────────────────────
console.log('\n② 자작 vs 구매 — **자급이 마을 대장간을 죽이는가**(상호의존 방어선)');
const VQ = [0.45, 0.60, 0.75];
console.log(`  ${padr('숙련', 8)}${pad('자작 품질', 11)}${pad('자작 내구', 11)}  │ ` + VQ.map((q) => pad(`마을Q ${q}`, 11)).join(''));
let cross = {};
for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const s = PI.craftItem('tool', lvl, { stone: EQ.qty });
  const buys = VQ.map((q) => PI.materializeFromVillage('tool', q, () => 0.5));
  VQ.forEach((q, i) => { if (cross[q] == null && s.q > buys[i].q) cross[q] = lvl; });
  if ([0, 2, 4, 6, 8, 10].includes(lvl)) {
    console.log(`  ${padr('Lv' + lvl, 8)}${pad(s.q.toFixed(3), 11)}${pad(s.durMax, 11)}  │ ` + buys.map((b) => pad(b.q.toFixed(3), 11)).join(''));
  }
}
console.log(`  ★역전 숙련(자작이 구매를 이기기 시작하는 레벨): ` + VQ.map((q) => `마을Q ${q} → Lv${cross[q] != null ? cross[q] : '>10'}`).join(' · '));
const xp = H.CRAFT_XP_PER_LEVEL || 6;
console.log(`  ★그 레벨까지 만들어야 하는 개수: Lv${cross[0.6]} × ${xp}개/레벨 = **${cross[0.6] * xp}개** (한 개 ${(F.CRAFT_MS.tool / 60000).toFixed(1)}분 → 총 ${(cross[0.6] * xp * F.CRAFT_MS.tool / 60000).toFixed(0)}분)`);
console.log(`  ★재료비는 **같다**(둘 다 ${EQ.qty}개) — 손익을 가르는 건 **숙련과 시간**뿐이다.`);
console.log(`  ⇒ 방어선: 초보는 사는 게 낫고(품질 ${PI.craftItem('tool', 0, { stone: 3 }).q.toFixed(2)} < ${PI.materializeFromVillage('tool', 0.6, () => 0.5).q.toFixed(2)}),`);
console.log(`     **도구를 업으로 삼은 사람만** 만드는 게 남는다. 자급자족이 일방적으로 이기지 않는다.`);
console.log(`  ⚠단 이건 **품질 축**의 손익이다. 도구는 econ 재화가 아니라 거래소 시세가 없다(§0 실측) —`);
console.log(`     "재료 시세로 사서 자작 vs 완제품 구매"의 **가격 비교는 아직 성립하지 않는다**(회부).`);
console.log('');
process.exit(0);
