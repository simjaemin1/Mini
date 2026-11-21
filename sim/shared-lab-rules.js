// T1409 — 랩/서버의 같은 계산. 입력·상태·호출 시점은 각 호스트가 소유한다.
'use strict';
function waterAccess(nd) { return Math.max(0.05, Math.min(1, 1 - nd / 140)); }
function oreRegenRaw(R0, days, K, reg0, reg1) {
  const A = reg0 + reg1, B = reg1 / K, asymptote = A / B;
  return Math.min(K, asymptote - (asymptote - R0) * Math.exp(-B * days));
}
function conscriptWith(individual, aggregate, v, mode, opts) {
  const ind = individual(v, mode, opts);
  if (ind) return ind;
  return aggregate(v, mode, opts);
}
module.exports = { waterAccess, oreRegenRaw, conscriptWith };
