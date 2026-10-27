'use strict';
// (@regress 없음 — 러너 밖 · T845 관찰기 · 제품 무변 · 읽기만)
// === scripts/t845-observe.js — 징발자가 마을 밥상에 남는 몫(T815 회부 3 · T423 군량 짐) — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:  T745_VCLOCK=1 NODE_OPTIONS="--require $PWD/scripts/t745-vclock.js --require $PWD/scripts/t845-observe.js" \
//               T577_DIR=<판 폴더> node scripts/t577-server-run.js 600 1020,7,42      (`T577_SEED` 가 있는 아이 존만 · 판 JSON 곁 `<판>-<시드>.t845.json`)
//   econ 하루 끝(장부 `scanDay` — t577 · t650 · t815 와 같은 문)에 마을마다 한 줄 — econ 이 이미 가진 칸을 그대로 읽는다(사본 0):
//     인구 N · 곳간 식량 환산(`totalFoodEquivalent`) · 그날 먹은 합(`_foodEaten`) · 징발(`_warDraft`) · 그중 원정(그 사람의 전쟁 `world._warWars` 에서 이 마을이 공격) ·
//     방어 소집(이 마을이 방어) · 짐 꾼 표식(`_warPack` — T423 켬에서만 붙는다) · 밥상 인원(`_warPack ∧ _warDraft` 를 뺀 수 — econ `_t423EatN` 그 식) · 자유민(N − 징발 · T815 표 잣대) · 포로 ·
//     그날 죽음 · 누적 압력(`_dPAccum`) · 굶주림 항(`_dpDebug.hunger`) · 식량 일꾼 · 원정 중 실체 교전 국면(`phase 'battle'` — war-core 하루 고리가 짐을 안 줄이는 국면)인 사람.
//   그리고 그날 선 원정(`born` = 그날)의 군량 적재(`_packLoad` — 곳간에서 뗀 식량 환산 · 병력 · 적재 일수) ·
//   날마다 살아 있는 원정(`world._warWars`)의 국면(`phase` · `op`) · 남은 짐 일수(`_packRem`) · 병력.
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED || !/server[\/\\]zone\.js$/.test(process.argv[1] || '')) return;
const OUT = process.env.T845_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t845.json' : '');
if (!OUT) return;
const SRV = path.dirname(path.resolve(process.argv[1])), ROOT = path.dirname(SRV);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const Ev = require(path.join(SRV, 'events'));
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'gatherer', 'forager'];
const rec = { knob: { T423_RATION_ACT: process.env.T423_RATION_ACT || null }, names: null, rows: [], packs: [], wars: [],
  cols: ['pop', 'tfe', 'eaten', 'drafted', 'atk', 'def', 'packers', 'eatN', 'free', 'captive', 'deathsToday', 'dPAccum', 'hunger', 'foodWorkers', 'atkBattle'],
  warCols: ['id', 'atk', 'def', 'phase', 'op', 'packRem', 'force'] };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
let last = -1;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if ((day | 0) !== last) { last = day | 0; snap(world, day | 0); } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  //   전쟁 id → (공격 econ 마을 · 방어 econ 마을) — 사람 표식 `_warDraft` 는 그 전쟁 id 다(war-core `warDraftFill` · `warDraftBind`)
  const W = world._warWars || [], byId = new Map();
  for (const w of W) {
    byId.set(w.id, { atk: w.atk && (w.atk.econ || w.atk), def: w.def && (w.def.econ || w.def), battle: w.phase === 'battle' });
    if (w.born === day) rec.packs.push([day, w.atk && w.atk.name, w.def && w.def.name, w.force | 0, r2(w._packLoad), r2(w._packDays)]);
  }
  if (W.length) rec.wars.push([day, W.map((w) => [w.id, w.atk && w.atk.name, w.def && w.def.name, w.phase || null, w.op || null, r2(w._packRem), w.force | 0])]);
  rec.rows.push([day, V.map((v) => {
    const C = v.counts || {}, D = v._dpDebug || {};
    let eaten = 0; for (const k in (v._foodEaten || {})) eaten += +v._foodEaten[k] || 0;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    let dr = 0, atk = 0, def = 0, pk = 0, cap = 0, atkB = 0;
    for (const n of (v.npcs || [])) {
      if (n.captive) cap++;
      if (!n._warDraft) continue;
      dr++; if (n._warPack) pk++;
      const w = byId.get(n._warDraft);
      if (w && w.atk === v) { atk++; if (w.battle) atkB++; } else if (w && w.def === v) def++;
    }
    const N = (v.npcs || []).length;
    return [N, r2(tfe), r2(eaten), dr, atk, def, pk, pk ? N - pk : N, N - dr, cap, DD.deathsToday(v), r2(v._dPAccum), r2(D.hunger), FOOD_JOBS.reduce((s, j) => s + Math.round(C[j] || 0), 0), atkB];   // 자유민 = N − 징발(T815 표와 같은 잣대 · 포로는 따로 센다)
  })]);
}
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
