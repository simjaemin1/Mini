// (@regress 없음 — 러너 밖 · T1426 성장 길 관측 · 제품 무변 · 읽기만)
// === scripts/lib-eq-grow.js — 랩 세계가 왜 안 멎나: 날마다 인구 식의 길(K 세 몫 · 주거 문 · dP 몫 · 땅 · 죽음 갈래)을 세계 합으로 한 줄 ==========
//   `t17-metrics` 의 `T1420_EQ=1` 갈래에서 `T1426_GROW=<파일>` 이면 날마다 `growDay(world)` 한 줄(열 = `COLS`).
//   읽는 칸(econ `tickVillage` 가 그날 쓴 것 — 이 자는 하나도 안 쓴다):
//     `v._kDbg` {slot, prod, fuel}(K 세 몫 — K = min) · `v._dpDebug` {K, logi, hunger, health, happy, prestige, housing, gated, dP} ·
//     `v._natExp`(그날 기대 자연사 — 출생 다시 맞춤 몫) · `v.land.size`(영토 · 셀 = ×25) · `v.expansions` · `v.lastExpansionDay` · `v._expandMBMC` {mb, mc} ·
//     누계 `_natDeadTot` · `_fdDeadTot` · `_deadTot` · `_emigTot` · `v.lastStats` {happiness, health, prestige}.
'use strict';
const COLS = ['d', 'N', 'K', 'slot', 'prod', 'fuel', 'housing',
  'bindSlot', 'bindProd', 'bindFuel', 'gated', 'dpPos', 'atK',
  'logi', 'hunger', 'health', 'happy', 'prestige', 'natExp', 'dP',
  'landSize', 'expCells', 'expToday', 'mbmcStop',
  'natDead', 'fdDead', 'dead', 'emig', 'hMean', 'healthMean', 'prestMean'];
function growDay(world) {
  const r = new Array(COLS.length).fill(0); const I = (k) => COLS.indexOf(k);
  r[0] = world.day;
  let nv = 0;
  for (const v of world.villages) {
    const N = v.npcs ? v.npcs.length : 0;
    r[I('N')] += N;
    const kd = v._kDbg, dd = v._dpDebug;
    if (kd) {
      r[I('slot')] += kd.slot || 0; r[I('prod')] += kd.prod || 0; r[I('fuel')] += kd.fuel || 0;
      const m = Math.min(kd.slot, kd.prod, kd.fuel);
      if (N > 0) { if (m === kd.slot) r[I('bindSlot')]++; else if (m === kd.prod) r[I('bindProd')]++; else r[I('bindFuel')]++; }
    }
    if (dd) {
      r[I('K')] += dd.K || 0; r[I('housing')] += dd.housing || 0;
      if (dd.gated) r[I('gated')]++;
      if (dd.dP > 0) r[I('dpPos')]++;
      if (N > 0 && N >= 0.98 * (dd.K || 0)) r[I('atK')]++;
      r[I('logi')] += dd.logi || 0; r[I('hunger')] += dd.hunger || 0; r[I('health')] += dd.health || 0;
      r[I('happy')] += dd.happy || 0; r[I('prestige')] += dd.prestige || 0; r[I('dP')] += dd.dP || 0;
    }
    r[I('natExp')] += v._natExp || 0;
    r[I('landSize')] += (v.land && v.land.size) || 0;
    r[I('expCells')] += v.expansions || 0;
    if (v.lastExpansionDay === world.day) r[I('expToday')]++;
    if (v._expandMBMC && v._expandMBMC.mb < v._expandMBMC.mc) r[I('mbmcStop')]++;
    r[I('natDead')] += v._natDeadTot || 0; r[I('fdDead')] += v._fdDeadTot || 0; r[I('dead')] += v._deadTot || 0; r[I('emig')] += v._emigTot || 0;
    if (v.lastStats && N > 0) { nv++; r[I('hMean')] += v.lastStats.happiness || 0; r[I('healthMean')] += v.lastStats.health || 0; r[I('prestMean')] += v.lastStats.prestige || 0; }
  }
  for (const k of ['hMean', 'healthMean', 'prestMean']) r[I(k)] = nv ? +(r[I(k)] / nv).toFixed(4) : 0;
  for (const k of ['K', 'slot', 'prod', 'fuel', 'housing', 'logi', 'hunger', 'health', 'happy', 'prestige', 'natExp', 'dP', 'landSize']) r[I(k)] = +r[I(k)].toFixed(3);
  return r;
}
module.exports = { COLS, growDay };
