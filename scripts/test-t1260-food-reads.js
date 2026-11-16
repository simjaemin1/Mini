#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1260-food-reads.js — T1260: 식량을 한 품목(`storage.food`)만 읽는 문(손잡이 `T1260_FOOD_READS` · 끔 기본 · `'1'` 만 켬) ======
//   아이 판 둘(끔 · 켬)이 같은 가짜 마을(곳간 `food` 0 · 생선 · 곡식 넉넉)을 정본 함수로 물어 JSON 한 줄을 낸다 — 판 몸통은 이 파일 하나(사본 0).
//   ① 끔 = 종전 — 문이 `food` 칸만 본다(요리 문 0 · 개간 문 열림) · 요리 재료 갈래는 끔이면 안 부른다(③ 글자)
//   ② 켬 = 합계 — 요리 문 섬 · 개간 문 닫힘(120일치 넘는 곳간) · 요리 재료 한 단을 가장 많이 쌓인 곡식 품목에서
//   ③ 글자 — 손잡이 읽는 자리 하나(econ) + 전쟁 층 하나 · 문 셋(요리 · 개간 · 곳간 증설)이 같은 함수(`t1260FoodOf`)를 부른다 · 전쟁 층 추정 문이 `_feD`
//   ④ [자명 통과 금지 · 미끼] 문 셋 중 하나를 `storage.food` 로 되돌린 사본은 ③ 의 검사에서 빠진다(검사가 실제로 문다)
//   ⑦ [T1298] 손잡이 `T1298_LEDGER` · `T1298_HEALTH`(끔 기본 · `'1'` 만 · T1260 켬 안에서만) — 옮김(조리식 · 보존식)은 장부 · 잠재 생산 0 · 조리식 · 보존식이 재료 건강 몫을 잇는다
//   ⑥ [T1286] 손잡이 `T1286_COOK_SPARE` · `T1286_PRODK`(끔 기본 · `'1'` 만 · T1279 켬 안에서만) — 남는 시간 요리(정원 0 · 옮김 · 재료 한 단만 · 부재료 그대로 · 조리식 ≤ 든 환산) · 부양력 조리식 칸 0
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
  out.spare86 = E.T1286_COOK_SPARE; out.prodk86 = E.T1286_PRODK;
  out.led98 = E.T1298_LEDGER; out.hl98 = E.T1298_HEALTH;
  {   // ⑦ T1298 — 생선 갈무리 한 번(곳간 생선 N×4 · 손 5): 장부 칸 · 건강 칸 · 마을 건강(같은 포화)
    const w = mk(); w.storage = { food: N * 100, fish: N * 1.5, meat: 0, cooked_food: 0, dried_fish: 0 };   // 생선 1인당 1.5 — 포화(1인당 2) 밑 선형 구간
    const dp = {}; const add = (r, a) => { w.storage[r] = (w.storage[r] || 0) + a; dp[r] = (dp[r] || 0) + a; };
    const h0 = E._computeVillageStats(w, N).health;
    E._preserveSurplus(w, { fish: 'dried_fish' }, 5, add, null, E.T877_ON ? E._t860Unit : null);
    const h1 = E._computeVillageStats(w, N).health;
    out.pv98 = { took: N * 1.5 - w.storage.fish, made: w.storage.dried_fish || 0, hpu: (w._t1298H && w._t1298H.dried_fish) || 0, h0, h1,
      ledgerIn: E.totalFoodProductionEquivalent(E.T1298_LEDGER ? E.t1298Moved(dp) : dp, w), moved: JSON.stringify(E.t1298Moved({ cooked_food: 3, dried_fish: 2, fish: 1 })) };
    const c = {}; E.t1298Carry(c, 'cooked_food', 2, 4, 0); E.t1298Carry(c, 'cooked_food', 0, 4, 4); out.cr98 = c._t1298H ? c._t1298H.cooked_food : null;   // 2/4 = 0.5 → (4×0.5 + 0)/8 = 0.25
  }
  if (E.T1286_COOK_SPARE) {   // ⑥ 남는 시간 요리 한 번 — 부자 마을 · 남는 손 0.4(잠재 10 · 실제 6) · 숙련 10(상한이 무는 쪽)
    const w = mk(), a = E.totalFoodEquivalent(w), rice0 = w.storage.rice, side0 = ['fish', 'vegetable', 'fruit'].map((r) => w.storage[r]), dp = {};
    E.t1286Cook(w, { skills: { cooking: 10 } }, [0, 0], 10, 6, dp);
    out.ck = { d: E.totalFoodEquivalent(w) - a, cooked: dp.cooked_food || 0, st: w.storage.cooked_food, rice: rice0 - w.storage.rice, counts: w.counts.cook || 0, cookTarget: E.cookTarget(w), C: w._t1286C || null,
      sideKept: ['fish', 'vegetable', 'fruit'].every((r, i) => w.storage[r] === side0[i]) };
    const z = mk(), dz = {}; E.t1286Cook(z, {}, [0, 0], 10, 10, dz); out.ck0 = dz.cooked_food || 0;   // 남는 손 0
    const q = mk(); q.storage = { food: 5, fish: 5, meat: 0, cooked_food: 0 }; const dq = {}; E.t1286Cook(q, {}, [0, 0], 10, 6, dq); out.ckPoor = dq.cooked_food || 0;   // 식량 안보 문 밑
  }
  const vil = { econ: mk(), _potSet: new Set(['0,0']), _farmSet: new Set() };
  try { out.needClear = VIL.__labProbe._clearProbe.needClear(vil); } catch (e) { out.needClear = 'err ' + String(e && e.message).slice(0, 80); }
  console.log(JSON.stringify(out));
  process.exit(0);
}
const run = (env) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  if (env.T1260_FOOD_READS == null) delete e.T1260_FOOD_READS;
  if (env.T1279_COOK == null) delete e.T1279_COOK;
  if (env.T1286_COOK_SPARE == null) delete e.T1286_COOK_SPARE;
  if (env.T1286_PRODK == null) delete e.T1286_PRODK;
  if (env.T1298_LEDGER == null) delete e.T1298_LEDGER;
  if (env.T1298_HEALTH == null) delete e.T1298_HEALTH;
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
  && /const dailyFoodProd = totalFoodProductionEquivalent\((?:T1298_LEDGER \? _t1298Moved\(dailyProduction\) : )?T1279_COOK \? Object\.assign\(\{\}, dailyProduction, \{ cooked_food: 0 \}\) : dailyProduction, v\);/.test(es)
  && (es.match(/T1279_COOK \?/g) || []).length === 1;
ok(ledger(ES), '⑤ 글자 — 손잡이 읽는 자리 하나(T1260 켬과 곱) · 장부 자리 하나(`dailyFoodProd` · 켬 = 조리식 칸 0 · 끔 = `dailyProduction` 그대로) · 다른 자리 0');
ok(!k1.err && !on.err && on.cook > 0 && k1.cook === 0 && k2.cook === off.cook && k3.cook === on.cook,
  '⑤ T1279 ② 정원 — 켬 = 부자 마을(쌀 N×300)에도 `cookTarget` 0 · T1260 켬 · 손잡이 끔은 종전 정원 그대로 · `yes` = 종전', { on: on.cook, k1: k1.cook, k2: k2.cook, k3: k3.cook });
const quota = (es) => (es.match(/if \(T1279_COOK\) return 0;/g) || []).length === 1
  && /function cookTarget\(v\) \{\n  if \(T1279_COOK\) return 0;/.test(es);
ok(quota(ES), '⑤ 글자 — 정원 자리 하나(`cookTarget` 첫 줄 · 켬 = 0) · 다른 자리 0');
const baitQ = ES.replace('  if (T1279_COOK) return 0;', '');
ok(baitQ !== ES && !quota(baitQ), '⑤ [자명 통과 금지 · 미끼] 정원 줄을 뺀 사본 — 글자 검사가 문다', { Q: quota(baitQ) });
const baitL = ES.replace('T1279_COOK ? Object.assign({}, dailyProduction, { cooked_food: 0 }) : dailyProduction, v)', 'dailyProduction, v)');
const baitK = ES.replace('const T1279_COOK = T1260_FOOD_READS && (', 'const T1279_COOK = (');
const baitP = ES.replace("Object.assign({}, dailyProduction, { cooked_food: 0 })", "Object.assign({}, dailyProduction, { fish: 0 })");
ok(baitL !== ES && baitK !== ES && baitP !== ES && !ledger(baitL) && !ledger(baitK) && !ledger(baitP),
  '⑤ [자명 통과 금지 · 미끼] 장부 자리를 종전으로 · 손잡이를 T1260 과 떼어 · 0 으로 만드는 칸을 딴 품목으로 바꾼 사본 셋 — 글자 검사가 셋 다 문다', { L: ledger(baitL), K: ledger(baitK), P: ledger(baitP) });
//   ⑥ T1286 — 남는 시간 요리(정원 0 · 옮김 · 식량을 안 늘림) · 부양력 조리식 칸 0
const s1 = run({ T1260_FOOD_READS: '1', T1279_COOK: '1', T1286_COOK_SPARE: '1', T1286_PRODK: '1' }), s2 = run({ T1260_FOOD_READS: '1', T1286_COOK_SPARE: '1', T1286_PRODK: '1' }), s3 = run({ T1260_FOOD_READS: '1', T1279_COOK: '1', T1286_COOK_SPARE: 'yes', T1286_PRODK: 'yes' });
ok(!s1.err && !s2.err && !s3.err && off.spare86 === false && on.spare86 === false && k1.spare86 === false && k1.prodk86 === false && s1.spare86 === true && s1.prodk86 === true && s2.spare86 === false && s2.prodk86 === false && s3.spare86 === false && s3.prodk86 === false,
  "⑥ T1286 손잡이 둘 — 끔 기본 · `'1'` 만 · `T1279_COOK` 켠 판 안에서만(T1279 끔 + `'1'` = 꺼짐 · `yes` = 꺼짐)", { off: off.spare86, k1: k1.spare86, s1: [s1.spare86, s1.prodk86], s2: [s2.spare86, s2.prodk86], s3: [s3.spare86, s3.prodk86] });
{ const c = s1.ck || {};
  ok(c.cooked > 0 && Math.abs(c.st - c.cooked) < 1e-9 && c.rice > 0 && c.d <= 1e-9 && c.sideKept === true && c.counts === 0 && c.cookTarget === 0 && c.C && c.C.n === 1 && c.C.days === 1,
    '⑥ 남는 시간 요리 한 번 — 조리식이 곳간에 들고 재료(곡식)가 빠진다 · 부재료(생선 · 남새 · 과일 — 건강 기여 칸)는 그대로 · 곳간 식량 환산이 늘지 않는다(숙련 10 에도) · 요리사 0 · 정원 0 · 셈 1 번 1 날', c);
  ok(s1.ck0 === 0 && s1.ckPoor === 0, '⑥ 남는 손 0 이면 요리 0 · 식량 안보 문(N×35 · N×8) 밑이면 요리 0', { ck0: s1.ck0, poor: s1.ckPoor }); }
const body86 = (es) => { const i = es.indexOf('function _t1286Cook('); if (i < 0) return null; const j = es.indexOf('\n}\n', i); return j < 0 ? null : es.slice(i, j); };
const spare = (es) => { const b = body86(es); if (!b) return false;
  return !/currentJob|counts|switchNPCJob|cookTarget|COOK_SIDE_INGREDIENTS/.test(b)
    && b.includes('per > 0 ? s / per : 0)') && b.includes('JOBS.cook.base')
    && b.includes('if (ck) v.storage[ck[0]] -= s / ck[1]; else v.storage.food -= s;')
    && (es.match(/const _t1286 = T1286_COOK_SPARE \? \[_potA, _actA\] : null;/g) || []).length === 1
    && (es.match(/if \(_t1286\) _t1286Cook\(v, npc, _t1286, _potA, _actA, dailyProduction\);/g) || []).length === 1
    && (es.match(/_t1286Cook\(/g) || []).length === 2
    && /const T1286_COOK_SPARE = T1279_COOK && \(\(typeof process !== 'undefined' && process\.env\) \? process\.env\.T1286_COOK_SPARE === '1' : false\);/.test(es)
    && /const T1286_PRODK = T1279_COOK && \(\(typeof process !== 'undefined' && process\.env\) \? process\.env\.T1286_PRODK === '1' : false\);/.test(es)
    && /const dailyFoodProdPotential = totalFoodProductionEquivalent\((?:T1298_LEDGER \? _t1298Moved\(dailyProductionPotential\) : )?T1286_PRODK \? Object\.assign\(\{\}, dailyProductionPotential, \{ cooked_food: 0 \}\) : dailyProductionPotential, v\);/.test(es); };
ok(spare(ES), '⑥ 글자 — 남는 시간 요리 함수(직업 · 정원 · 차출 · 부재료를 안 건드림 · 조리식 ≤ 든 환산 · 재료를 뗀다) · 몸 머리 · 꼬리 자리 하나씩 · 손잡이 둘(T1279 와 곱) · 부양력 자리 하나');
const baitPost = ES.replace('  v.storage.cooked_food = (v.storage.cooked_food || 0) + cooked;\n', "  npc.currentJob = 'cook';\n  v.storage.cooked_food = (v.storage.cooked_food || 0) + cooked;\n");
const baitMake = ES.replace(', per > 0 ? s / per : 0)', ', Infinity)');
const baitSide = ES.replace('  if (ck) v.storage[ck[0]] -= s / ck[1]; else v.storage.food -= s;\n', '  if (ck) v.storage[ck[0]] -= s / ck[1]; else v.storage.food -= s;\n  for (const r of COOK_SIDE_INGREDIENTS) if ((v.storage[r] || 0) >= 0.5 * s) v.storage[r] -= 0.5 * s;\n');
const baitFree = ES.replace('  if (ck) v.storage[ck[0]] -= s / ck[1]; else v.storage.food -= s;\n', '');
const baitKnob = ES.replace('const T1286_COOK_SPARE = T1279_COOK && (', 'const T1286_COOK_SPARE = (');
ok([baitPost, baitMake, baitFree, baitKnob, baitSide].every((b) => b !== ES && !spare(b)),
  '⑥ [자명 통과 금지 · 미끼] 남는 시간 요리가 요리사를 세우는 사본 · 조리식이 든 환산을 넘어 새로 생기는 사본 · 재료를 안 떼는 사본 · 손잡이를 T1279 와 뗀 사본 · 부재료(건강 칸)를 조리식으로 먹어 치우는 사본 — 다섯 다 문다',
  { post: spare(baitPost), make: spare(baitMake), free: spare(baitFree), knob: spare(baitKnob), side: spare(baitSide) });
//   ⑦ T1298 — 옮김은 생산이 아니다(장부 · 잠재에서 조리식 · 보존식 칸 0) · 조리식 · 보존식이 재료의 건강 몫을 잇는다
const t1 = run({ T1260_FOOD_READS: '1', T1298_LEDGER: '1', T1298_HEALTH: '1' }), t2 = run({ T1298_LEDGER: '1', T1298_HEALTH: '1' }), t3 = run({ T1260_FOOD_READS: '1', T1298_LEDGER: 'yes', T1298_HEALTH: 'yes' });
ok(!t1.err && !t2.err && !t3.err && off.led98 === false && on.led98 === false && on.hl98 === false && t1.led98 === true && t1.hl98 === true && t2.led98 === false && t2.hl98 === false && t3.led98 === false && t3.hl98 === false,
  "⑦ T1298 손잡이 둘 — 끔 기본 · `'1'` 만 · T1260 켠 판 안에서만(T1260 끔 + `'1'` · `yes` = 꺼짐)", { on: [on.led98, on.hl98], t1: [t1.led98, t1.hl98], t2: [t2.led98, t2.hl98], t3: [t3.led98, t3.hl98] });
{ const a = on.pv98 || {}, b = t1.pv98 || {};
  ok(a.took > 0 && a.made > 0 && a.ledgerIn > 0 && b.took === a.took && b.ledgerIn === 0,
    '⑦ 장부 — 끔이면 갈무리 산출(건어물)이 그날 생산으로 들고(두 번 셈) · 켜면 0(옮김)', { off: a.ledgerIn, on: b.ledgerIn, took: b.took, made: b.made });
  ok(/"cooked_food":0/.test(b.moved || '') && /"dried_fish":0/.test(b.moved || '') && /"fish":1/.test(b.moved || ''), '⑦ 옮김 칸 — 조리식 · 보존식 0 · 원물(생선)은 그대로', b.moved);
  ok(a.hpu === 0 && a.h1 < a.h0 - 1e-6 && Math.abs(b.hpu - b.took * 0.4 / b.made) < 1e-9 && Math.abs(b.h1 - b.h0) < 1e-6,
    '⑦ 건강 — 끔이면 생선을 말리면 마을 건강이 준다(건어물 건강 0) · 켜면 건어물 한 단위가 뗀 생선 건강 합 ÷ 낸 수를 잇고 마을 건강이 그대로(선형 구간)', { off: [a.h0, a.h1], on: [b.h0, b.h1], hpu: b.hpu });
  ok(Math.abs(t1.cr98 - 0.25) < 1e-12, '⑦ 건강 칸 평균 — (있던 양 × 칸 + 든 건강) ÷ (있던 양 + 낸 양) · 2/4 → 곡식만 4 더 → 0.25', t1.cr98); }
const led98 = (es) => /const dailyFoodProd = totalFoodProductionEquivalent\(T1298_LEDGER \? _t1298Moved\(dailyProduction\) : T1279_COOK \? /.test(es)
  && /const dailyFoodProdPotential = totalFoodProductionEquivalent\(T1298_LEDGER \? _t1298Moved\(dailyProductionPotential\) : T1286_PRODK \? /.test(es)
  && /function _t1298Moved\(prod\) \{ const o = Object\.assign\(\{\}, prod, \{ cooked_food: 0 \}\); for \(const r of PRESERVED_FOODS\) o\[r\] = 0; return o; \}/.test(es)
  && /const T1298_LEDGER = T1260_FOOD_READS && /.test(es) && /const T1298_HEALTH = T1260_FOOD_READS && /.test(es);
const hl98 = (es) => (es.match(/_t1298Carry\(v, /g) || []).length === 4
  && es.includes('if (T1298_HEALTH && v._t1298H && v._t1298H[id] > 0) stats.health += v._t1298H[id] * sat;')
  && es.includes('T[P] = (b * (T[P] || 0) + Math.max(0, H)) / (b + out);');
ok(led98(ES) && hl98(ES), '⑦ 글자 — 장부 · 잠재 자리 하나씩(켬 = 옮김 칸 0) · 옮김 칸 함수 · 손잡이 둘(T1260 과 곱) · 건강 잇는 자리 넷(갈무리 · 갈래 요리 · 남는 시간 요리 · 어종 갈무리) · 마을 건강 자리 하나');
const baitL98 = ES.replace('T1298_LEDGER ? _t1298Moved(dailyProduction) : ', '');
const baitP98 = ES.replace('for (const r of PRESERVED_FOODS) o[r] = 0; ', '');
const baitH98 = ES.replace('if (T1298_HEALTH && v._t1298H && v._t1298H[id] > 0) stats.health += v._t1298H[id] * sat;', '');
const baitC98 = ES.replace('T[P] = (b * (T[P] || 0) + Math.max(0, H)) / (b + out);', 'T[P] = 0;');
ok([baitL98, baitP98].every((b) => b !== ES && !led98(b)) && [baitH98, baitC98].every((b) => b !== ES && !hl98(b)),
  '⑦ [자명 통과 금지 · 미끼] 갈무리를 다시 생산으로 센 사본 둘(장부 자리 종전 · 보존식 칸을 안 지움) · 건강을 0 으로 되돌린 사본 둘(마을 건강 자리 뺌 · 칸을 0 으로) — 넷 다 문다',
  { L: led98(baitL98), P: led98(baitP98), H: hl98(baitH98), C: hl98(baitC98) });
console.log(`\n=== T1260 식량 한 품목 읽는 문: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
