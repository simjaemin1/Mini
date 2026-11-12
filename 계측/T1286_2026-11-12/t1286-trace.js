'use strict';
// === 계측/T1286_2026-11-12/t1286-trace.js — 마을 날 지문(메모리 · 제품 파일 수정 0) ===
//   tickVillage 머리에서 마을마다 읽기만 한다(값 함수 · 난수를 부르지 않는다): 날 · 이름 · N · 농부 · 요리사 · 곳간 식량 환산 · `food` 칸 · 곳간 합 · 장부(surplusEMA.food) · 금고 합 · 직업 지문
//   env: T1286_TRACE=<파일>(JSON 줄) · T1286_TRACE_DAYS(기본 200)
//        T1286_ONE=<마을 이름> → 그 마을 밖은 `cookTarget` 0(한 마을만 정원 요리사 · 나머지 50곳 0)
const fs = require('fs');
const Module = require('module'), compile = Module.prototype._compile;
const OUT = process.env.T1286_TRACE, DAYS = +(process.env.T1286_TRACE_DAYS || 200), ONE = process.env.T1286_ONE || null;
const rows = []; const S = { hit: {}, one: ONE };
globalThis.__T1286Tr = (v, day, E) => {
  if (!OUT || day > DAYS) return;
  const st = v.storage || {}; let sum = 0; for (const k in st) sum += +st[k] || 0;
  let tre = 0; for (const k in (v.treasury || {})) tre += +v.treasury[k] || 0;
  const c = v.counts || {}; const jobs = Object.keys(c).sort().map((k) => k + c[k]).join(',');
  rows.push([day, v.name, v.npcs.length, c.farmer || 0, c.cook || 0, +E.totalFoodEquivalent(v).toFixed(4), +(st.food || 0).toFixed(4), +sum.toFixed(3),
    +(((v.surplusEMA || {}).food) || 0).toFixed(4), +tre.toFixed(3), jobs]);
};
//        T1286_NUDGE=<이름>:<날>:<품목>:<양> → 그 날 그 마을 틱 머리에서 곳간 그 품목에 양을 더한다(요리 무관 영 판 — 교역 흔들림 자)
const NUDGE = process.env.T1286_NUDGE ? process.env.T1286_NUDGE.split(':') : null;
globalThis.__T1286Nudge = (v, day) => { if (NUDGE && v.name === NUDGE[0] && day === +NUDGE[1]) { v.storage[NUDGE[2]] = (v.storage[NUDGE[2]] || 0) + +NUDGE[3]; S.nudged = (S.nudged || 0) + 1; } };
globalThis.__T1286One = (v) => !ONE || v.name === ONE;
const SITES = [['/sim/economy-sim.js', 'function tickVillage(v, day) {\n', 'function tickVillage(v, day) {\n  if (globalThis.__T1286Nudge) globalThis.__T1286Nudge(v, day);\n  if (globalThis.__T1286Tr) globalThis.__T1286Tr(v, day, module.exports);\n', 'trace']];
//        T1286_NOPRES=1 → 요리사 갈무리 줄(`_preserveSurplus(v, PRESERVE_FROM, jdef.base * skillMul, …)`)을 뺀다
if (process.env.T1286_NOPRES === '1') SITES.push(['/sim/economy-sim.js', '      if (T17_PRESERVE) _preserveSurplus(v, PRESERVE_FROM, jdef.base * skillMul, addProduce, null, T877_ON ? _t860Unit : null);', '      ;', 'nopres']);
if (ONE) SITES.push(['/sim/economy-sim.js', 'function cookTarget(v) {\n', 'function cookTarget(v) {\n  if (!globalThis.__T1286One(v)) return 0;\n', 'one']);
Module.prototype._compile = function (src, file) {
  const f = file.replace(/\\/g, '/');
  for (const [tail, from, to, key] of SITES) if (f.endsWith(tail)) {
    const parts = src.split(from); if (parts.length !== 2) throw Error(`T1286 ${key}: 글자 ${parts.length - 1} 곳(기대 1)`);
    src = parts.join(to); S.hit[key] = (S.hit[key] || 0) + 1;
  }
  return compile.call(this, src, file);
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify({ S, cols: ['d', 'name', 'N', 'farmer', 'cook', 'fe', 'food', 'stSum', 'sp', 'tre', 'jobs'], rows })); } catch (e) {} });
