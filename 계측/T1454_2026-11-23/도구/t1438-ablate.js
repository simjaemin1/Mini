'use strict';
// T1438 갈래 판 — 켠 판에서 빈 마을이 왜 생기나(가름용 · 제품 무변 · 프리로드로만) · T1438_ABLATE=wood,hd0,ded,indoor
//   wood   = NPC 뼈대 · 곳간 손질이 곳간 통나무 · 돌을 안 쓴다(지붕 풀만)
//   hd0    = econ 추상 집 노후(HOUSE_DECAY)를 0 으로(물리 낡음만)
//   ded    = 집 짓는 날 손질 품을 안 뺀다
//   indoor = 몸 줄에 지붕 몫(indoorF)을 안 준다
const Module = require('module'), path = require('path');
const A = new Set(String(process.env.T1438_ABLATE || '').split(',').filter(Boolean));
if (!A.size) return;
const P = [];
if (A.has('wood')) P.push(['villages.js', "const raws = t.type === 'granary' ? ['wood', 'stone'] : (part.k === 'roof' ? ['fiber'] : ['wood']);", "const raws = t.type === 'granary' ? [] : (part.k === 'roof' ? ['fiber'] : []);"]);
if (A.has('hd0')) P.push(['economy-sim.js', 'const HOUSE_DECAY = 0.0015;', 'const HOUSE_DECAY = 0;']);
if (A.has('ded')) P.push(['villages.js', 'if (T1438_DECAY) st = Math.max(0, st - _t1438Ded(vil));', '']);
if (A.has('nudge')) P.push(['villages.js', '  if (T1438_DECAY) { try { _t1438VilDay(vil); }', '  if (!globalThis.__t1438Nudge && state.world && (state.world.day | 0) >= 50 && vil.econ && vil.econ.storage && vil.econ.storage.wood >= 1) { vil.econ.storage.wood -= 1; globalThis.__t1438Nudge = vil.name; console.error(`[t1438-ablate] 날 ${state.world.day} ${vil.name} 통나무 −1`); }\n  if (T1438_DECAY) { try { _t1438VilDay(vil); }']);   // 대조 — 끔 + 통나무 하나(날 50 · 한 마을) = 흔들림만
if (A.has('spare')) P.push(['villages.js', "if (item !== 'fiber') { got = E.actFromGranary(vil.econ, item, want); if (!(got > 0)) { _t1438V.noWood++; continue; } }", "if (item !== 'fiber') { const _sp = item === 'wood' ? Math.floor(Math.max(0, E.woodSpare(vil.econ)) + 1e-9) : want; got = _sp > 0 ? E.actFromGranary(vil.econ, item, Math.min(want, _sp)) : 0; if (!(got > 0)) { _t1438V.noWood++; continue; } }"]);   // 통나무는 잉여만(woodSpare — 비축 · 집 몫 뒤)
if (A.has('indoor')) P.push(['zone.js', '...(T1438_DECAY ? { indoorF: _t1438Roof(p, _indoor) } : null)', '...null']);
const _c = Module.prototype._compile;
Module.prototype._compile = function (src, fn) {
  for (const [f, a, b] of P) if (path.basename(fn) === f && fn.indexOf('/server/') >= 0 || (path.basename(fn) === f && fn.indexOf('/sim/') >= 0)) {
    const n = src.split(a).length - 1;
    if (n !== 1) { console.error(`[t1438-ablate] ${f} 자리 ${n}번 — 멈춤`); process.exit(5); }
    src = src.replace(a, b); console.error(`[t1438-ablate] ${f} 바꿈(${[...A].join(',')})`);
  }
  return _c.call(this, src, fn);
};
