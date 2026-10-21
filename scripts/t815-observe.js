'use strict';
// === scripts/t815-observe.js — T815 관찰기: 징발 묶임 마을의 하루 장부(서버 판 자 `t577-server-run.js` 곁 프리로드 · 읽기만 · 제품 손잡이 0) ===
//
// ★[T815 2026-10-19 · T796 §3-4] 1020 농촌16 이 인구 44 에 400~500일 묶여 죽음 1 이 매일 세어졌는데 식량 일꾼은 0, 곳간엔 식량 1,928.
//   무엇이 압력을 쌓았나를 마을마다 하루 한 줄로 남긴다(econ 이 이미 남기는 `_dpDebug` 를 그대로 읽는다 — 사본 0).
//   쓰는 법:  NODE_OPTIONS="-r $PWD/scripts/t815-observe.js" node scripts/t577-server-run.js 800 1020,7,42
//             (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>-<시드>.t815.json`)
//   하루 한 줄(마을마다): [인구 · 곳간 식량 환산(`totalFoodEquivalent`) · 그날 먹은 합(`_foodEaten`) · 그날 죽음(`_deathsToday`) · 죽음 누계(`_deadTot`) ·
//     누적 압력(`_dPAccum`) · 징발 수(`_warDraft`) · 그중 짐 꾼(`_warPack`) · 남은 자유인 · K · 로지스틱 항 · 굶주림 항 · 건강 항 · 행복 항 · 위신 항 · 그날 dP ·
//     식량 부양력(`_kDbg.prod`) · 식량 흐름 EMA · 식량 일꾼 수 · 그날 소비 대상 N(`_t423EatN` 판 · 읽기만)]
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T815_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t815.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'gatherer', 'forager'];
const rec = { names: null, rows: [], cols: ['pop', 'tfe', 'eaten', 'deathsToday', 'deadTot', 'dPAccum', 'drafted', 'packers', 'free', 'K', 'logi', 'hunger', 'health', 'happy', 'prestige', 'dP', 'prodK', 'surplusFood', 'foodWorkers'] };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t815] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, V.map((v) => {
    const C = v.counts || {}, D = v._dpDebug || {};
    let eaten = 0; for (const k in (v._foodEaten || {})) eaten += +v._foodEaten[k] || 0;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    let dr = 0, pk = 0; for (const n of (v.npcs || [])) { if (n._warDraft) { dr++; if (n._warPack) pk++; } }
    const N = (v.npcs || []).length;
    return [N, r2(tfe), r2(eaten), v._deathsToday || 0, v._deadTot || 0, r2(v._dPAccum), dr, pk, N - dr,
      D.K, D.logi, D.hunger, D.health, D.happy, D.prestige, D.dP,
      v._kDbg ? v._kDbg.prod : null, r2(v.surplusEMA && v.surplusEMA.food), FOOD_JOBS.reduce((s, j) => s + Math.round(C[j] || 0), 0)];
  })]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
