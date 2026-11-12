'use strict';
// === 계측/T1279_2026-11-12/t1279-price.js — 식량 값 성분 셈(메모리 · 제품 파일 수정 0) ===
//   `_targetV2(v, 'food')` 이 낸 것(목표 · 유효 재고 · 웃돈 상한)을 10날 칸마다 모아 `T1279_PRICE` 파일로 적는다(t1279-split.js 와 같이 얹을 수 있다)
//   칸: n · 목표/N · 재고(sEff)/N · 값 · 상한에 닿은 몫 · 장부(surplusEMA.food)/N · 곳간 식량 환산/N
const fs = require('fs');
const Module = require('module'), compile = Module.prototype._compile;
const B = {};
globalThis.__T1279T = (v, T) => {
  const d = (v._world && v._world.day) || 0, k = Math.floor(d / 10), N = (v.npcs && v.npcs.length) || 1;
  const b = B[k] || (B[k] = { n: 0, tgt: 0, sEff: 0, p: 0, sat: 0, sp: 0, fe: 0, adj: 0 });
  const r = Math.pow(T.target / T.sEff, T.e), p = T.base * Math.max(0, Math.min(T.maxAdj, r));
  b.n++; b.tgt += T.target / N; b.sEff += T.sEff / N; b.p += p; b.sat += r >= T.maxAdj ? 1 : 0; b.adj += Math.min(T.maxAdj, r);
  b.sp += ((v.surplusEMA && v.surplusEMA.food) || 0) / N;
};
const FROM = 'function _targetV2(v, r, ctx) {';
const TO = 'function _targetV2(v, r, ctx) { const __o = __t1279T2(v, r, ctx); if (r === \'food\' && globalThis.__T1279T) globalThis.__T1279T(v, __o); return __o; }\nfunction __t1279T2(v, r, ctx) {';
let hit = 0;
Module.prototype._compile = function (src, file) {
  if (file.replace(/\\/g, '/').endsWith('/sim/economy-sim-v2.js')) { const parts = src.split(FROM); if (parts.length !== 2) throw Error('T1279 price: 글자 ' + (parts.length - 1)); src = parts.join(TO); hit++; }
  return compile.call(this, src, file);
};
process.on('exit', () => { if (process.env.T1279_PRICE) try { fs.writeFileSync(process.env.T1279_PRICE, JSON.stringify({ hit, B })); } catch (e) {} });
