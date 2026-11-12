#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1260-food-reads.js — T1260: 식량을 한 품목(`storage.food`)만 읽는 문(손잡이 `T1260_FOOD_READS` · 끔 기본 · `'1'` 만 켬) ======
//   아이 판 둘(끔 · 켬)이 같은 가짜 마을(곳간 `food` 0 · 생선 · 곡식 넉넉)을 정본 함수로 물어 JSON 한 줄을 낸다 — 판 몸통은 이 파일 하나(사본 0).
//   ① 끔 = 종전 — 문이 `food` 칸만 본다(요리 문 0 · 개간 문 열림) · 요리 재료 갈래는 끔이면 안 부른다(③ 글자)
//   ② 켬 = 합계 — 요리 문 섬 · 개간 문 닫힘(120일치 넘는 곳간) · 요리 재료 한 단을 가장 많이 쌓인 곡식 품목에서
//   ③ 글자 — 손잡이 읽는 자리 하나(econ) + 전쟁 층 하나 · 문 셋(요리 · 개간 · 곳간 증설)이 같은 함수(`t1260FoodOf`)를 부른다 · 전쟁 층 추정 문이 `_feD`
//   ④ [자명 통과 금지 · 미끼] 문 셋 중 하나를 `storage.food` 로 되돌린 사본은 ③ 의 검사에서 빠진다(검사가 실제로 문다)
//   ⑤ [T1279] 손잡이 `T1279_COOK`(끔 기본 · `'1'` 만 · T1260 켬 안에서만) — 켜면 ① 식량 흐름 장부(`dailyFoodProd`)가 조리식 칸을 0 으로 센다(요리는 옮김) · ② 정원 요리사 0(`cookTarget`)
//      · 장부 자리 하나 · 끔 = 종전 글자 · [미끼] 장부 자리를 종전으로 되돌린 사본 · T1260 과 떼어 놓은 사본을 검사가 문다
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };

if (process.argv[2] === '--child') {
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const VIL = require(path.join(ROOT, 'server', 'villages'));
  const N = 50;   // 요리 정원 6% 클램프(⌊N × 0.06⌋)가 0 이 안 되는 크기
  const mk = () => ({ npcs: Array.from({ length: N }, () => ({})), counts: {}, land: { fertility: 0.55 }, _consEMA: {}, surplusEMA: {}, treasury: {},
    storage: { food: 0, fish: N * 200, meat: 0, cooked_food: 0, rice: N * 300, wheat: N * 10, vegetable: N * 5, fruit: N * 5 },
    dailyProductionBuf: { vegetable: 30, fruit: 30 } });
  const v = mk();
  const out = { on: E.T1260_FOOD_READS, cook79: E.T1279_COOK, foodOf: E.t1260FoodOf(v), total: E.totalFoodEquivalent(v), cook: E.cookTarget(v) };
  const st = E.t1260CookStaple(v); out.staple = st ? st[0] : null;
  const vil = { econ: mk(), _potSet: new Set(['0,0']), _farmSet: new Set() };
  try { out.needClear = VIL.__labProbe._clearProbe.needClear(vil); } catch (e) { out.needClear = 'err ' + String(e && e.message).slice(0, 80); }
  console.log(JSON.stringify(out));
  process.exit(0);
}
const run = (env) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  if (env.T1260_FOOD_READS == null) delete e.T1260_FOOD_READS;
  if (env.T1279_COOK == null) delete e.T1279_COOK;
  delete e.T1243_FARM_ON; delete e.T1229_FIELD_GROW;
  const r = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: e, encoding: 'utf8', timeout: 120000, maxBuffer: 16 << 20 });
  const line = String(r.stdout || '').split('\n').filter((l) => l.startsWith('{')).pop();
  try { return JSON.parse(line); } catch (err) { return { err: String(r.stderr || '').slice(-400) || 'JSON 없음' }; }
};
console.log('\n=== T1260 식량 한 품목 읽는 문 ===');
const off = run({}), on = run({ T1260_FOOD_READS: '1' }), odd = run({ T1260_FOOD_READS: 'yes' });
ok(!off.err && off.on === false && off.foodOf === 0 && off.total > 0, '① 끔(기본) — 손잡이 꺼짐 · 식량 읽기 = `food` 칸 0(곳간엔 생선 · 곡식이 있다 — 자명 통과 금지 · 합계 > 0)', off.err || { foodOf: off.foodOf, total: off.total });
ok(!off.err && off.cook === 0 && off.needClear === true, '① 끔 — 요리 문 0 · 개간 문 열림(곳간이 빈 것으로 본다 — 종전)', off.err || off);
ok(!on.err && on.on === true && Math.abs(on.foodOf - on.total) < 1e-9 && on.foodOf > N_FOOD(on), '② 켬 — 식량 읽기 = 곳간 합계 정본(`totalFoodEquivalent`)', on.err || { foodOf: on.foodOf, total: on.total });
ok(!on.err && on.cook > 0 && on.needClear === false, '② 켬 — 요리 문이 선다(> 0) · 개간 문 닫힘(120일치 넘는 곳간)', on.err || on);
ok(!on.err && on.staple === 'rice', '② 켬 — 요리 재료 한 단 = 하루치 환산이 가장 큰 곡식 품목(벼 · 밀보다 많다)', on.err || on.staple);
ok(!odd.err && odd.on === false && odd.foodOf === 0, "① `'1'` 밖 값(`yes`)은 끔", odd.err || odd);
function N_FOOD(o) { return 50 * 120; }
//   ③ 글자 — 문 셋 · 손잡이 읽는 자리 · 전쟁 층
const ES = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const WS = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8');
const gates = (es, vs) => {
  const ck = es.slice(es.indexOf('function cookTarget('), es.indexOf('function cookTarget(') + 500);
  const nc = vs.slice(vs.indexOf('function _lifeNeedClear('), vs.indexOf('function _lifeNeedClear(') + 400);
  const ga = vs.slice(vs.indexOf('function _lifeGranAdd('), vs.indexOf('function _lifeGranAdd(') + 1400);
  return { cook: /t1260FoodOf\(v\) < N \* 8/.test(ck) && !/storage\.food/.test(ck),
    clear: /_lifeEcon\(\)\.t1260FoodOf\(e\) > e\.npcs\.length \* 120/.test(nc) && !/storage\.food/.test(nc),
    gran: /const food = _lifeEcon\(\)\.t1260FoodOf\(vil\.econ\);/.test(ga) && !/storage\.food/.test(ga) };
};
const G = gates(ES, VS);
ok(G.cook && G.clear && G.gran, '③ 문 셋(요리 8일 · 개간 120일 · 곳간 증설 목표)이 한 함수 `t1260FoodOf` 를 부른다 · 셋 다 `storage.food` 글자 0', G);
ok((ES.match(/process\.env\.T1260_FOOD_READS/g) || []).length === 1 && /const T1260_FOOD_READS = \(typeof process !== 'undefined' && process\.env\) \? process\.env\.T1260_FOOD_READS === '1' : false;/.test(ES)
  && /function t1260FoodOf\(v\) \{ return T1260_FOOD_READS \? totalFoodEquivalent\(v\) : \(\(v && v\.storage && v\.storage\.food\) \|\| 0\); \}/.test(ES),
  "③ econ 손잡이 읽는 자리 하나 · `'1'` 만 켬 · 켬 = 합계 정본 · 끔 = `food` 칸");
ok(/_ck = v\.storage\.food >= 1 \? null : \(T1260_FOOD_READS \? _t1260CookStaple\(v\) : null\)/.test(ES) && /if \(_ck\) v\.storage\[_ck\[0\]\] -= 1 \/ _ck\[1\]; else v\.storage\.food -= 1;/.test(ES),
  '③ 요리사 재료 — `food` 칸이 비면(켬만) 곡식 품목에서 하루치 1 을 · 끔 = 종전 `food -= 1`');
const wc = WS.slice(WS.indexOf('const _feOf ='));
ok((WS.match(/process\.env\.T1260_FOOD_READS/g) || []).length === 1 && /const _feD = \(e\) => \(_T1260 \? _feOf\(e\) : warFE\(e\)\);/.test(wc)
  && (wc.match(/warFE\(/g) || []).length === 2 && (wc.match(/_feD\(/g) || []).length >= 9,
  '③ 전쟁 층 — 식량 추정 문이 `_feD`(켬 = 주입 정본 `_feOf` · 끔 = `warFE`) · `createWar` 안에 `warFE` 직접 부름 0(정의 둘뿐)', { warFE: (wc.match(/warFE\(/g) || []).length, feD: (wc.match(/_feD\(/g) || []).length });
//   ④ 미끼 — 문 하나씩 `storage.food` 로 되돌린 사본
const baitCook = ES.replace('t1260FoodOf(v) < N * 8', '(v.storage.food || 0) < N * 8');
const baitClear = VS.replace('_lifeEcon().t1260FoodOf(e) > e.npcs.length * 120', '((e.storage && e.storage.food) || 0) > e.npcs.length * 120');
const baitGran = VS.replace('const food = _lifeEcon().t1260FoodOf(vil.econ);', 'const food = (vil.econ.storage && vil.econ.storage.food) || 0;');
const b1 = gates(baitCook, VS), b2 = gates(ES, baitClear), b3 = gates(ES, baitGran);
ok(baitCook !== ES && baitClear !== VS && baitGran !== VS && !b1.cook && !b2.clear && !b3.gran,
  '④ [자명 통과 금지] 요리 · 개간 · 곳간 증설 문을 하나씩 `storage.food` 로 되돌린 사본 셋 — ③ 의 검사가 셋 다 문다', { cook: b1.cook, clear: b2.clear, gran: b3.gran });
//   ⑤ T1279 — 요리는 옮김(식량 흐름 장부에서 조리식 칸 0)
const k1 = run({ T1260_FOOD_READS: '1', T1279_COOK: '1' }), k2 = run({ T1279_COOK: '1' }), k3 = run({ T1260_FOOD_READS: '1', T1279_COOK: 'yes' });
ok(!off.err && !on.err && off.cook79 === false && on.cook79 === false, '⑤ T1279 끔(기본) — T1260 끔 · 켬 둘 다 `T1279_COOK` 꺼짐', { off: off.cook79, on: on.cook79 });
ok(!k1.err && k1.cook79 === true && !k2.err && k2.cook79 === false && !k3.err && k3.cook79 === false,
  "⑤ T1279 켬 = `'1'` · T1260 켠 판 안에서만(T1260 끔 + `'1'` = 꺼짐 · `yes` = 꺼짐)", { k1: k1.cook79, k2: k2.cook79, k3: k3.cook79 });
{ const E = require(path.join(ROOT, 'sim', 'economy-sim'));   // 장부 자(같은 환산 함수)가 조리식 칸을 실제로 세는지 — 0 으로 만든 자리가 무동작이 아님을 보인다
  const v = { storage: {}, npcs: [{}], land: {}, counts: {} }, prod = { cooked_food: 10, fish: 5 };
  const a = E.totalFoodProductionEquivalent(prod, v), b = E.totalFoodProductionEquivalent(Object.assign({}, prod, { cooked_food: 0 }), v);
  ok(a > b && b > 0, '⑤ 장부 자가 조리식 칸을 센다(조리식 10 + 생선 5 > 생선 5 > 0) — 칸 0 이 실제로 장부를 바꾼다', { a, b }); }
const ledger = (es) => (es.match(/process\.env\.T1279_COOK/g) || []).length === 1
  && /const T1279_COOK = T1260_FOOD_READS && \(\(typeof process !== 'undefined' && process\.env\) \? process\.env\.T1279_COOK === '1' : false\);/.test(es)
  && /const dailyFoodProd = totalFoodProductionEquivalent\(T1279_COOK \? Object\.assign\(\{\}, dailyProduction, \{ cooked_food: 0 \}\) : dailyProduction, v\);/.test(es)
  && (es.match(/T1279_COOK \?/g) || []).length === 1;
ok(ledger(ES), '⑤ 글자 — 손잡이 읽는 자리 하나(T1260 켬과 곱) · 장부 자리 하나(`dailyFoodProd` · 켬 = 조리식 칸 0 · 끔 = `dailyProduction` 그대로) · 다른 자리 0');
ok(!k1.err && !on.err && on.cook > 0 && k1.cook === 0 && k2.cook === off.cook && k3.cook === on.cook,
  '⑤ T1279 ② 정원 — 켬 = 부자 마을(쌀 N×300)에도 `cookTarget` 0 · T1260 켬 · 손잡이 끔은 종전 정원 그대로 · `yes` = 종전', { on: on.cook, k1: k1.cook, k2: k2.cook, k3: k3.cook });
const quota = (es) => (es.match(/if \(T1279_COOK\) return 0;/g) || []).length === 1
  && /function cookTarget\(v\) \{\n  if \(T1279_COOK\) return 0;/.test(es);
ok(quota(ES), '⑤ 글자 — 정원 자리 하나(`cookTarget` 첫 줄 · 켬 = 0) · 다른 자리 0');
const baitQ = ES.replace('  if (T1279_COOK) return 0;', '');
ok(baitQ !== ES && !quota(baitQ), '⑤ [자명 통과 금지 · 미끼] 정원 줄을 뺀 사본 — 글자 검사가 문다', { Q: quota(baitQ) });
const baitL = ES.replace('totalFoodProductionEquivalent(T1279_COOK ? Object.assign({}, dailyProduction, { cooked_food: 0 }) : dailyProduction, v)', 'totalFoodProductionEquivalent(dailyProduction, v)');
const baitK = ES.replace('const T1279_COOK = T1260_FOOD_READS && (', 'const T1279_COOK = (');
const baitP = ES.replace("{ cooked_food: 0 }", "{ fish: 0 }");
ok(baitL !== ES && baitK !== ES && baitP !== ES && !ledger(baitL) && !ledger(baitK) && !ledger(baitP),
  '⑤ [자명 통과 금지 · 미끼] 장부 자리를 종전으로 · 손잡이를 T1260 과 떼어 · 0 으로 만드는 칸을 딴 품목으로 바꾼 사본 셋 — 글자 검사가 셋 다 문다', { L: ledger(baitL), K: ledger(baitK), P: ledger(baitP) });
console.log(`\n=== T1260 식량 한 품목 읽는 문: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
