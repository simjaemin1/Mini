'use strict';
// (@regress 없음 — 러너 밖 · T810 관찰기 · 제품 무변)
// === scripts/t810-observe.js — T810 관찰기: 습격은 어떻게 대상 마을로 오는 캐러밴을 줄이나(간접 몫) ==================================
//
// ★[T810 2026-10-19 · T796 회부 2] T796: 습격이 있는 판은 대상 마을로 **오는** 캐러밴이 적다(첫해 353 대 477~556) — 대상 마을 자신의
//   캐러밴은 그 창에 한 번도 안 털렸다. 그러면 습격이 **어느 마을의 무엇을** 줄여 그 마을이 대상에 안 보내게 됐나.
//   서버 판 자(`t577-server-run.js`) 곁 프리로드 · 갈래 env 는 이 파일만 읽는다(제품 손잡이 0):
//     NODE_OPTIONS="-r $PWD/scripts/t810-observe.js" node scripts/t577-server-run.js 800 1020,7,42     # ⓐ main
//     … T810_ARM=g     ⓖ 갱 전투만 끔(T796 ⓖ 와 같은 갈래 — `banditGang` 을 부른 자리가 econ 도착 · 귀환 전투면 null · 교역 결정은 원래 값)
//     … T810_ARM=loot0 ㉠ 장물 0 — 습격은 그대로 · 장물이 단의 식량이 되지 않는다(`onBanditLoot` 를 학습 두 줄만 남긴 것으로 — 아래 ⚠)
//     … T810_ARM=learn0 ㉡ 피해 학습 0 — 장물은 그대로 · 습격이 마을 `_banditRisk` 를 안 올린다(`onBanditLoot` 앞뒤로 두 마을 값을 되돌린다)
//     … T810_ARM=skip1 ⓩ 대조 — 첫 습격 조우 하나만 건너뛴다(세계가 ⓖ 와 같은 날 갈린다 · 그 뒤 습격은 그대로 — 차가 습격 몫인지 갈림 몫인지 가른다)
//     … T810_ARM=keep  ㉢ 행상 피살만 0 — 전투 · 짐 잃음 · 호위 죽음은 그대로 · 죽은 행상이 마을 명부에서 안 빠진다(`killTrader` 한 줄을 이 프리로드가 건너뛴다)
//   ⚠㉠ 은 `server/bandits.js onBanditLoot` 의 학습 두 줄(+0.15 · 맞은편 절반 · 0.6 상한)을 이 파일에 다시 적는다(관찰 갈래의 사본 · 제품 무변).
//
//   읽기만 하는 자리(econ 소스를 적재 때 이 프리로드 안에서만 고쳐 쓴다 — 아래 `INJ` · 값을 바꾸는 줄 0 · 갈래 ㉢ 한 줄만 행동):
//     ⓓ 교역 결정 — (출발 · 목적지 · 10일 칸)마다 [본 수 · 이익>0 수 · 최대 이익 · 기대손실 합 · 길 위험>0 수]
//     ⓞ 출발 마을 — (마을 · 10일 칸)마다 [결정 날 · 인구 합 · 여유 노동(spareCap) 합 · 교역 중 합 · 생산자 없음 · 후보(잉여) 없음 · 이익 길 없음 · 기회비용 관문 막힘 · 관문 통과]
//     ⓖ 관문 — (출발 · 1등 목적지 · 10일 칸)마다 [통과 · 막힘 · 1등 이익 합]
//     ⓑ 도적 — 날마다 [단 수 · 단원 합 · 단 식량 합]
//   + T796 관찰기 하루 줄(마을마다 인구 · 곳간 · … · 누계 · 식량 일꾼) · 새 캐러밴 · 교역 기록(같은 칸 · 같은 순서).
const path = require('path');
const fs = require('fs');
const Module = require('module');
if (!process.env.T577_SEED) return;   // 부모 러너 — 아무것도 안 한다
const ARM = process.env.T810_ARM || 'a';
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t810.json' : '';
const ROOT = path.join(__dirname, '..');
const V2F = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const BIN = 10;

// ── econ 소스 고쳐 쓰기(이 프로세스 · 적재 때 한 번 · 읽기만 하는 부름) ─────────────────────────
const INJ = [
  ['    const alreadySent = new Set();', "    if (globalThis.__t810) globalThis.__t810.orig(a.v, day, N, spareCap, currentlyTrading);\n    const alreadySent = new Set();"],
  ['      if (!lp.npc) break;', "      if (!lp.npc) { if (globalThis.__t810) globalThis.__t810.stop(a.v, day, 4); break; }"],
  ['      if (!candidates.length) break;', "      if (!candidates.length) { if (globalThis.__t810) globalThis.__t810.stop(a.v, day, 5); break; }"],
  ['          const totalProfit = profitPerUnit * N_units;', "          const totalProfit = profitPerUnit * N_units;\n          if (globalThis.__t810) globalThis.__t810.ev(a.v, b.v, day, totalProfit, expectedLossRatio, banditX0);"],
  ['      if (!best) break;', "      if (!best) { if (globalThis.__t810) globalThis.__t810.stop(a.v, day, 6); break; }"],
  ['      if (best.profit <= lp.mv * tripDays * (1 - 0.5 * slack)) break;', "      if (globalThis.__t810) globalThis.__t810.gate(a.v, best.b.v, day, best.profit, best.profit <= lp.mv * tripDays * (1 - 0.5 * slack));\n      if (best.profit <= lp.mv * tripDays * (1 - 0.5 * slack)) break;"],
];
if (ARM === 'keep') INJ.push(['    if (i >= 0) { v.npcs.splice(i, 1); if (v.counts) v.counts[t.currentJob] = Math.max(0, (v.counts[t.currentJob] || 0) - 1); }',
  "    if (i >= 0 && !globalThis.__T810_KEEP) { v.npcs.splice(i, 1); if (v.counts) v.counts[t.currentJob] = Math.max(0, (v.counts[t.currentJob] || 0) - 1); }\n    if (i >= 0 && globalThis.__T810_KEEP) globalThis.__T810_KEEP.n++;"]);
const injMiss = [];
{
  const _p = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename !== V2F) return _p(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) {
      for (const [a, b] of INJ) { const k = src.split(a).length - 1; if (k !== 1) injMiss.push([a.trim().slice(0, 60), k]); else src = src.replace(a, b); }
      return _c.call(this, src, fn);
    };
    return _p(m, filename);
  };
}
if (ARM === 'keep') globalThis.__T810_KEEP = { n: 0 };

const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const B = require(path.join(ROOT, 'server', 'bandits'));
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'gatherer', 'forager'];
const rec = { arm: ARM, inj: INJ.length, injMiss, names: null, foodJobs: FOOD_JOBS, bin: BIN, rows: [], caravans: [], trades: [], fw: {},
  ev: {}, orig: {}, gate: {}, gangs: [], gangCalls: {}, keep: 0, lootCalls: 0 };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const seenC = new WeakSet(), seenT = new WeakSet();
let IDX = new Map();   // econ 마을 → 번호(날마다 다시 — 마을 수가 바뀌어도 이름 번호는 첫날 표)
const ix = (v) => { const i = IDX.get(v); if (i != null) return i; return rec.names ? rec.names.indexOf(v && v.name) : -1; };
globalThis.__t810 = {
  orig(v, day, N, spare, trading) { const k = ix(v) + '|' + ((day / BIN) | 0); const o = rec.orig[k] || (rec.orig[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0]); o[0]++; o[1] += N; o[2] += spare; o[3] += trading; },
  stop(v, day, slot) { const k = ix(v) + '|' + ((day / BIN) | 0); const o = rec.orig[k] || (rec.orig[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0]); o[slot]++; },
  ev(a, b, day, tot, loss, risk) {
    const k = ix(a) + '|' + ix(b) + '|' + ((day / BIN) | 0); const e = rec.ev[k] || (rec.ev[k] = [0, 0, -1e18, 0, 0]);
    e[0]++; if (tot > 0) e[1]++; if (tot > e[2]) e[2] = tot; e[3] += loss; if (risk > 0) e[4]++;
  },
  gate(a, b, day, profit, blocked) {
    const ko = ix(a) + '|' + ((day / BIN) | 0); const o = rec.orig[ko] || (rec.orig[ko] = [0, 0, 0, 0, 0, 0, 0, 0, 0]); o[blocked ? 7 : 8]++;
    const k = ix(a) + '|' + ix(b) + '|' + ((day / BIN) | 0); const g = rec.gate[k] || (rec.gate[k] = [0, 0, 0]); g[blocked ? 1 : 0]++; g[2] += profit;
  },
};
const FW = new Map();
function fw(res) {
  if (!res) return 0;
  if (FW.has(res)) return FW.get(res);
  let w = 0;
  try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[res] = (st[res] || 0) + 1; w = V1.totalFoodEquivalent({ storage: st, npcs: [] }) || 0; } catch (e) { w = 0; }
  FW.set(res, w); rec.fw[res] = w; return w;
}
const RAID_CALLERS = new Set(['_caravanArrive', 'tickCaravansV2']);
const _hold = { stack: '' };
function caller() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 3; Error.captureStackTrace(_hold, caller); Error.stackTraceLimit = L;
  const m = /at (?:Object\.)?([A-Za-z_$][\w$]*)/.exec(String(_hold.stack).split('\n')[2] || ''); return m ? m[1] : '?';
}
function arm(world) {   // 날마다 — 호스트가 훅을 다시 꽂았으면 다시 감싼다(표 `_t810`)
  if (!world.banditGang || !world.onBanditLoot) return;
  if (world.banditGang._t810 && world.onBanditLoot._t810) return;
  const g = world.banditGang._t810 ? world.banditGang._t810orig : world.banditGang;
  const loot = world.onBanditLoot._t810 ? world.onBanditLoot._t810orig : world.onBanditLoot;
  rec.armed = (rec.armed || 0) + 1;
  const mark = (f, o) => { f._t810 = 1; f._t810orig = o; return f; };
  world.banditGang = mark(function (a, b) { return g(a, b); }, g);
  world.onBanditLoot = mark(function () { return loot.apply(this, arguments); }, loot);
  if (ARM === 'g') world.banditGang = function (a, b) { const who = caller(); const r = RAID_CALLERS.has(who) ? null : g(a, b); const c = rec.gangCalls[who] || (rec.gangCalls[who] = [0, 0]); c[0]++; if (r && r.n > 0) c[1]++; return r; };
  if (ARM === 'g') mark(world.banditGang, g);
  if (ARM === 'skip1') {   // ⓩ 대조 — 첫 습격 조우 하나만 null(ⓖ 와 같은 날 세계가 갈린다) · 그 뒤 습격은 그대로
    world.banditGang = function (a, b) { const r = g(a, b); if (!rec.skipped && r && r.n > 0 && RAID_CALLERS.has(caller())) { rec.skipped = 1; return null; } return r; };
    mark(world.banditGang, g);
  }
  if (ARM === 'loot0') world.onBanditLoot = function (victim, other, res, amt) {   // ⚠학습 두 줄의 사본(`server/bandits.js onBanditLoot`) — 단 식량 · 장물 0
    rec.lootCalls++;
    if (!(amt > 0)) return;
    if (!world.banditGang(victim, other)) return;   // 그 길에 단이 없으면 원래도 아무것도 안 한다
    victim._banditRisk = Math.min(0.6, (victim._banditRisk || 0) + 0.15);
    other._banditRisk = Math.min(0.6, (other._banditRisk || 0) + 0.15 * 0.5);
  };
  if (ARM === 'loot0') mark(world.onBanditLoot, loot);
  if (ARM === 'learn0') world.onBanditLoot = function (victim, other) {
    rec.lootCalls++;
    const r0 = victim && victim._banditRisk, r1 = other && other._banditRisk;
    const out = loot.apply(this, arguments);
    if (victim) victim._banditRisk = r0; if (other) other._banditRisk = r1;
    return out;
  };
  if (ARM === 'learn0') mark(world.onBanditLoot, loot);
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { arm(world); snap(world, day | 0); } catch (e) { console.error('[t810] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) { rec.names = V.map((v) => v.name); for (const r of ['food', 'fish', 'meat', 'cooked_food', 'wheat', 'rice', 'barley', 'millet', 'fruit', 'vegetable', 'mushroom']) fw(r); }
  IDX = new Map(V.map((v) => [v, rec.names.indexOf(v.name)]));
  rec.rows.push([day, V.map((v) => {
    const T = v.tradeStats || {}, C = v.counts || {};
    let eaten = 0; for (const k in (v._foodEaten || {})) eaten += +v._foodEaten[k] || 0;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    return [(v.npcs || []).length, r2(tfe), r2(eaten), v._deathsToday || 0, r2(v.surplusEMA && v.surplusEMA.food),
      v._kDbg ? v._kDbg.prod : null, r2(v.lastStats && v.lastStats.production), r2(v._banditRisk), 0,
      r2(T.foodImported), T.caravansSent || 0, r2(T.cargoSent), T.caravansRaided || 0, r2(T.cargoLost), T.tradersKilled || 0, T.banditsRepelled || 0,
      FOOD_JOBS.map((j) => Math.round(C[j] || 0)), Math.round(C.warrior || 0), Math.round(C.merchant || 0), r2(v._idleFrac)];
  })]);
  for (const c of world.caravans || []) {
    if (seenC.has(c)) continue; seenC.add(c);
    const fi = ix(c.from), ti = ix(c.to); if (fi < 0 || ti < 0) continue;
    rec.caravans.push([day, fi, ti, c.giveRes || null, r2(c.giveAmt), c.escort || 0, 0, c.travelDays || 0]);
  }
  const TL = world.tradeLog || [];
  for (let j = TL.length - 1; j >= 0 && j >= TL.length - 600; j--) {
    const t = TL[j]; if (!t || seenT.has(t)) continue; seenT.add(t);
    rec.trades.push([day, rec.names.indexOf(t.from), rec.names.indexOf(t.to), t.sent ? t.sent.res : null, t.sent ? r2(t.sent.amt) : 0, t.bought ? t.bought.res : null, t.bought ? r2(t.bought.amt) : 0, t.raided ? 1 : 0, t.abandoned ? 1 : 0]);
  }
  let gn = 0, gm = 0, gf = 0; try { for (const g of (B.gangs() || [])) { gn++; gm += g.n || 0; gf += g.food || 0; } } catch (e) {}
  rec.gangs.push([day, gn, gm, r2(gf)]);
  if (globalThis.__T810_KEEP) rec.keep = globalThis.__T810_KEEP.n;
}
process.on('exit', () => {
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
