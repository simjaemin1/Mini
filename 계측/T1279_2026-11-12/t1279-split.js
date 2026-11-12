'use strict';
// === 계측/T1279_2026-11-12/t1279-split.js — 요리 문 ① 손해 고리 갈라 재기(메모리 되돌림 · 제품 파일 수정 0 · T1265 꼴) ===
//   쓰는 법: node -r <이 파일> … — env `T1279_SPLIT=probe|A|B`(손잡이 `T1260_FOOD_READS=1` 판 위에서)
//     probe = 바꾸는 것 없음 · 요리 한 번마다 든 식량 환산(재료 한 단 1 + 부재료 0.5 × 환산) · 난 식량 환산(조리식 × 환산)을 센다
//     A     = ⓐ 요리사 서는 조건만 종전(`cookTarget` 둘째 문 = `food` 칸 — T1265 문 ① 끔과 같은 글자)
//     B     = ⓑ 요리가 식량 값에 닿는 길만 끊음 — 조리식을 든 식량 환산만큼만 낸다(순 식량 0 · 요리사 · 재료 · 다양성은 그대로)
//     C     = ⓒ 요리사 정원만 종전 — 고르기의 정원 충원 줄(`counts.cook < cookTarget(v)` → 요리사)만 종전 문(`food` 칸)으로 · 값 줄(`case 'cook'`)은 켬 그대로
//   셈: 요리 한 번(n · 든 · 난 환산) · 정원 줄이 요리사를 낸 번(pick) · 요리사 갈무리(pres — 뗀 양)
//   모든 갈래가 probe 셈을 같이 한다. 셈과 닿은 자리 수를 exit 에 `T1279_AUDIT` 파일로 적는다.
const fs = require('fs');
const Module = require('module'), compile = Module.prototype._compile;
const MODE = process.env.T1279_SPLIT || 'probe';
if (!['probe', 'A', 'B', 'C'].includes(MODE)) throw Error('T1279_SPLIT probe|A|B|C');
const S = { mode: MODE, hit: {}, n: 0, inEq: 0, outEq: 0, pick: 0, byDay: {} };
globalThis.__T1279P = () => { S.pick++; };
globalThis.__T1279_NEUTRAL = MODE === 'B';
globalThis.__T1279C = (v, inEq, outEq) => { S.n++; S.inEq += inEq; S.outEq += outEq;
  const d = (v._world && v._world.day) || (v._day) || 0; const b = Math.floor(d / 100); const B = S.byDay[b] || (S.byDay[b] = [0, 0, 0]); B[0]++; B[1] += inEq; B[2] += outEq; };
const COOK_FROM = '        const cooked = jdef.base * skillMul * toolBoost * efficiency;';
const COOK_TO = '        let cooked = jdef.base * skillMul * toolBoost * efficiency;\n'
  + '        { const __fc = storageFoodPer(v, \'cooked_food\') || 1.12; const __in = 1 + usedSides.reduce((s, r) => s + 0.5 * (storageFoodPer(v, r) || 0), 0);\n'
  + '          if (globalThis.__T1279_NEUTRAL) cooked = __in / __fc; globalThis.__T1279C(v, __in, cooked * __fc); }';
const SITES = [['/sim/economy-sim.js', COOK_FROM, COOK_TO, 'cook']];
const PICK_FROM = "  if ((counts.cook || 0) < cookTarget(v)) return 'cook';";
const PICK_TO = MODE === 'C'
  ? "  if ((counts.cook || 0) < __t1279CookOld(v)) { globalThis.__T1279P(); return 'cook'; }"
  : "  if ((counts.cook || 0) < cookTarget(v)) { globalThis.__T1279P(); return 'cook'; }";
SITES.push(['/sim/economy-sim.js', PICK_FROM, PICK_TO, 'pick']);
// ⓒ 의 종전 정원 = 종전 둘째 문(`food` 칸)을 먼저 보고 · 열리면 같은 `cookTarget`(나머지 조건 같음)
if (MODE === 'C') SITES.push(['/sim/economy-sim.js', 'function cookTarget(v) {',
  'function __t1279CookOld(v) { const N = v.npcs.length || 1; if ((v.storage.food || 0) < N * 8) return 0; return cookTarget(v); }\nfunction cookTarget(v) {', 'old']);
if (MODE === 'A') SITES.push(['/sim/economy-sim.js', 't1260FoodOf(v) < N * 8', '(v.storage.food || 0) < N * 8', 'gate']);
Module.prototype._compile = function (src, file) {
  const f = file.replace(/\\/g, '/');
  for (const [tail, from, to, key] of SITES) if (f.endsWith(tail)) {
    const parts = src.split(from);
    if (parts.length !== 2) throw Error(`T1279 ${key}: 글자 ${parts.length - 1} 곳(기대 1)`);
    src = parts.join(to); S.hit[key] = (S.hit[key] || 0) + 1;
  }
  return compile.call(this, src, file);
};
process.on('exit', () => { if (process.env.T1279_AUDIT) try { fs.writeFileSync(process.env.T1279_AUDIT, JSON.stringify(S)); } catch (e) {} });
