'use strict';
// (@regress 없음 — 러너 밖 · T924 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t924-observe.js — T924 관찰기: 죽음 빚(`_dPAccum`) · 건강/행복 항 가르기 · 원정 길이(서버 판 자 `t577-server-run.js` 곁 프리로드) ===
//
// ★[T924 2026-10-25 · 재민 10-24 "창고에 식량이 쌓여 있을 텐데 자유민이 그렇게 빨리 죽어..? 원정도 몇 달씩 가는 게 아니지 않나"]
//   쓰는 법:  NODE_OPTIONS="-r $PWD/scripts/t924-observe.js" node scripts/t577-server-run.js 800 1020,7,42
//             (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>-<시드>.t924.json` · `T924_OUT` 로 바꿀 수 있다)
//   ① 마을 × econ 날 한 줄 — econ 이 부르는 `tickVillage`(v2 가 `v1.tickVillage` 로 부른다) 를 감싸 **그 틱 앞뒤**를 읽는다:
//      틱 앞 빚 · 틱 뒤 빚 · 그날 죽음 · 징발 · 짐꾼 · 자유민 · 곳간(식량 환산) · `_dpDebug` 항 다섯 · `lastStats`(행복 · 건강 · 식품군 · 여가 · 땔감 충당 · 옷 충당) ·
//      ★건강 · 행복을 **항목별로 가른다** — econ 정본 `_computeVillageStats` 를 그 마을 얕은 사본에 칸 하나씩 지워 다시 부른다
//        (곳간 재고 → 식단(먹은 군) → 여가 → 땔감 → 한랭 · 옷 → 가죽 · 나머지 0 · 사본 0 · 새 수 0 — 상수를 옮겨 적지 않는다)
//      + 같은 함수를 **먹는 사람 수**(N − 짐꾼 — 마을 밥상에 앉는 사람)로 부른 값(무엇이 N 에 든 부재자 몫인가).
//      흥미로운 줄(징발 · 죽음 · 빚 ≤ −1 · 10일마다)엔 곳간 품목별 몫(건강 · 행복)도 남긴다.
//   ② 원정 × 날 한 줄 — 장부 하루 경계(`ledger.scanDay`)에서 `world._warWars` 를 읽는다: 국면(`phase`) · 작전(`op`) · 포위 · 공격 마을 징발(그 전쟁 표식) ·
//      방어 마을 징발 · 짐 잔량(일) · 몸에 실림 — 사라진 날 = 해제 날.
//   ⚠읽기만 — 마을 칸 · 전쟁 칸에 쓰지 않는다(`_computeVillageStats` 는 읽기만 하는 순수 함수다 · RNG 무접촉).
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T924_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t924.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const CVS = V1._computeVillageStats;
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'gatherer', 'forager'];
const COLS = ['day', 'pop', 'pop0', 'free', 'drafted', 'packers', 'a0', 'a1', 'deathsToday', 'deadTot', 'tfe', 'eaten',
  'K', 'logi', 'hunger', 'healthT', 'happyT', 'prestigeT', 'dP', 'gated',
  'happiness', 'health', 'foodGroups', 'leisure', 'fuelCov', 'clothCov', 'coldStress',
  'h_stor', 'h_div', 'h_fuel', 'h_cold', 'h_lg', 'p_stor', 'p_div', 'p_leis', 'p_cold', 'p_lg',
  'h_eat', 'p_eat', 'chk', 'foodWorkers', 'kSlot', 'kProd', 'kFuel', 'shieldAte', 'captives', 'idleFrac', 'tradingN', 'items'];
const WCOLS = ['day', 'phase', 'op', 'siege', 'atkDr', 'defDr', 'packRem', 'onBodies', 'eta', 'bodyPhase', 'bodyMode', 'fightState', 'fightT', 'contacts', 'standoffs', 'aliveA', 'aliveB', 'atkPids', 'defPids'];
const rec = { cols: COLS, wcols: WCOLS, v: {}, wars: {}, errs: 0, err0: null, chkBad: 0 };
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
const r4 = (x) => Math.round(+x * 10000) / 10000;
//   `_computeVillageStats` 가 읽는 칸만 옮긴 작은 마을(얕은 · 읽기만) — 온 마을 값과 같은지는 `chk` 가 줄마다 본다(다르면 1).
const KEYS = ['storage', '_weapQ', '_foodEaten', '_idleFrac', '_tradingN', '_fuelCov', '_coldStress', '_clothCov', '_clothQ', '_lgCov'];
function mini(v) { const o = {}; for (const k of KEYS) o[k] = v[k]; if (!o.storage) o.storage = {}; return o; }
function stat(v, N, patch) { return CVS(Object.assign(mini(v), patch), N); }
function split(v, N) {
  // 칸을 하나씩 지워 간다 — 지운 몫 = 앞 값 − 뒤 값(econ 함수 그대로 · 순서 고정)
  const full = stat(v, N, {});
  const p0 = { storage: {} }, s0 = stat(v, N, p0);
  const p1 = Object.assign({}, p0, { _foodEaten: {} }), s1 = stat(v, N, p1);
  const p2 = Object.assign({}, p1, { _idleFrac: 0 }), s2 = stat(v, N, p2);
  const p3 = Object.assign({}, p2, { _fuelCov: undefined }), s3 = stat(v, N, p3);
  const p4 = Object.assign({}, p3, { _coldStress: 0 }), s4 = stat(v, N, p4);
  const p5 = Object.assign({}, p4, { _lgCov: 0 }), s5 = stat(v, N, p5);
  const d = (a, b, k) => (a[k] || 0) - (b[k] || 0);
  return { full, base: s5, h: [d(full, s0, 'health'), d(s0, s1, 'health'), d(s2, s3, 'health'), d(s3, s4, 'health'), d(s4, s5, 'health')],
    p: [d(full, s0, 'happiness'), d(s0, s1, 'happiness'), d(s1, s2, 'happiness'), d(s3, s4, 'happiness'), d(s4, s5, 'happiness')] };
}
function items(v, N, full) {
  const o = {};
  for (const k of Object.keys(v.storage || {})) {
    if (!((v.storage[k] || 0) > 0)) continue;
    const st = Object.assign({}, v.storage); delete st[k];
    const s = stat(v, N, { storage: st });
    const dh = (full.health || 0) - (s.health || 0), dp = (full.happiness || 0) - (s.happiness || 0);
    if (Math.abs(dh) > 5e-5 || Math.abs(dp) > 5e-5) o[k] = [r4(dh), r4(dp)];
  }
  return o;
}
function row(v, day, a0, n0) {
  const N = (v.npcs || []).length, D = v._dpDebug || {}, S = v.lastStats || {}, C = v.counts || {};
  let dr = 0, pk = 0, cap = 0; for (const n of (v.npcs || [])) { if (n._warDraft) { dr++; if (n._warPack) pk++; } if (n.captive) cap++; }
  let eaten = 0; for (const k in (v._foodEaten || {})) eaten += +v._foodEaten[k] || 0;
  let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
  let sp = null, he = null, pe = null, chk = 0, it = null;
  const NS = n0;   // econ 이 stat 을 부른 그 N(틱 머리 `v.npcs.length` — 출생 · 죽음은 그 뒤다)
  if (typeof CVS === 'function' && NS > 0) {
    sp = split(v, NS);
    chk = (Math.abs((sp.full.health || 0) - (S.health || 0)) + Math.abs((sp.full.happiness || 0) - (S.happiness || 0)) > 1e-9) ? 1 : 0;
    if (chk) rec.chkBad++;
    if (pk > 0) { const se = stat(v, Math.max(1, NS - pk), {}); he = se.health; pe = se.happiness; } else { he = sp.full.health; pe = sp.full.happiness; }
    if (dr > 0 || (v._deathsToday || 0) > 0 || (+v._dPAccum || 0) <= -1 || day % 10 === 0) it = items(v, NS, sp.full);
  }
  const k = v._kDbg || {};
  const R = [day, N, n0, N - dr, dr, pk, r3(a0), r3(v._dPAccum), v._deathsToday || 0, v._deadTot || 0, r3(tfe), r3(eaten),
    D.K, D.logi, D.hunger, D.health, D.happy, D.prestige, D.dP, D.gated ? 1 : 0,
    r3(S.happiness), r3(S.health), S.foodGroups, r3(S.leisure), r3(S.fuelCov), r3(S.clothCov), r3(v._coldStress),
    sp ? r3(sp.h[0]) : null, sp ? r3(sp.h[1]) : null, sp ? r3(sp.h[2]) : null, sp ? r3(sp.h[3]) : null, sp ? r3(sp.h[4]) : null,
    sp ? r3(sp.p[0]) : null, sp ? r3(sp.p[1]) : null, sp ? r3(sp.p[2]) : null, sp ? r3(sp.p[3]) : null, sp ? r3(sp.p[4]) : null,
    r3(he), r3(pe), chk, FOOD_JOBS.reduce((s, j) => s + Math.round(C[j] || 0), 0), k.slot, k.prod, k.fuel, r3(v._shieldAte), cap, r3(v._idleFrac), v._tradingN || 0, it];
  (rec.v[v.name] || (rec.v[v.name] = [])).push(R);
}
const _tick = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const a0 = +(v && v._dPAccum) || 0, n0 = (v && v.npcs) ? v.npcs.length : 0;
  const r = _tick.apply(this, arguments);
  try { row(v, day | 0, a0, n0); } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  return r;
};
const PH = { march: 1, battle: 2, return: 3 }, OP = { march: 1, camp: 2, siege: 3, assault: 4, withdraw: 5 };
//   전쟁 몸(호스트 `state.warBodies` — 전쟁 id 열쇠)은 하네스 문 `__p3Bind({})`(빈 목 = 아무것도 안 덮는다 · 운영 경로 무접촉)로 읽는다 —
//   존이 이미 실은 모듈만(`require.cache` · 관찰기가 villages.js 를 먼저 싣지 않는다 — 실는 차례 무변).
let _vst = null;
function vstate() {
  if (_vst) return _vst;
  try { const k = require.resolve(path.join(ROOT, 'server', 'villages.js')); const m = require.cache[k]; if (m && m.exports && typeof m.exports.__p3Bind === 'function') _vst = m.exports.__p3Bind({}).state; } catch (e) { _vst = null; }
  return _vst;
}
const BM = { fight: 1, camp: 2 }, FS = { form: 1, advance: 2, engaged: 3 };
let lastDay = -1;
function wars(world, day) {
  if (day === lastDay) return; lastDay = day;
  const W = world._warWars || [], seen = new Set();
  const S = vstate(), WB = S && S.warBodies, WL = S && S.warLive;
  for (const w of W) {
    const id = w.id; seen.add(id);
    let o = rec.wars[id];
    if (!o) o = rec.wars[id] = { id, atk: w.atk && w.atk.name, def: w.def && w.def.name, casus: w.casus, force: w.force, draftN: w._draftN, born: w.born, marchDays: w.marchDays, first: day, end: null, tl: [] };
    const cnt = (vil) => { const e = vil && vil.econ; let k = 0; if (e && e.npcs) for (const n of e.npcs) if (n._warDraft === id) k++; return k; };
    const b = WB && WB.get ? WB.get(id) : null, f = b && b.fight;
    let ac = null; if (f && WL && typeof WL.aliveCounts === 'function') { try { ac = WL.aliveCounts(f); } catch (e) { ac = null; } }
    o.tl.push([day, PH[w.phase] || 0, OP[w.op] || 0, w._siegeOn ? 1 : 0, cnt(w.atk), cnt(w.def), r3(w._packRem), w._packOnBodies || 0, w.eta,
      b ? (b.phase || '-') : null, b ? (BM[b.mode] || b.mode || 0) : null, f ? (FS[f.state] || f.state || 0) : null, f ? r3(f.t) : null, f ? (f.contacts || 0) : null, f ? (f.standoffs || 0) : null,
      ac ? ac.aliveA : null, ac ? ac.aliveB : null, b ? (b.pids ? b.pids.length : 0) : null, b ? (b.defPids ? b.defPids.length : 0) : null]);
    o.last = day;
  }
  for (const id in rec.wars) { const o = rec.wars[id]; if (o.end == null && !seen.has(+id) && o.last != null && o.last < day) o.end = day; }
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { wars(world, day | 0); } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
