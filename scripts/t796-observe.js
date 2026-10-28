'use strict';
// === scripts/t796-observe.js — T796 관찰기: 빈 마을로 들어오던 식량 흐름(서버 판 자 `t577-server-run.js` 곁 프리로드 · 읽기만) =========
//
// ★[T796 2026-10-18 · T766 회부] 3시드 800일 빈 마을 17 중 9 가 **해체 없이 굶어** 빈다 — 도적 길 훅만 꺼도 사라진다. 무엇이 막히나.
//   쓰는 법(판 넷 — 갈래 env 는 이 프리로드만 읽는다 · 제품 손잡이 0):
//     NODE_OPTIONS="-r $PWD/scripts/t796-observe.js" node scripts/t577-server-run.js 800 1020,7,42                    # ⓐ main
//     NODE_OPTIONS=… T796_RISK_OFF=1 T796_GANG_OFF=1 node scripts/t577-server-run.js 800 1020,7,42                     # ⓑ′ 길 훅 둘 다 끔(T766 ⓑ′ 와 같은 두 줄)
//     NODE_OPTIONS=… T796_RISK_OFF=1 node scripts/t577-server-run.js 800 1020,7,42                                     # ⓔ 길 위험만 0(`banditRouteRisk` — 교역 결정이 읽는 위험)
//     NODE_OPTIONS=… T796_GANG_OFF=1 node scripts/t577-server-run.js 800 1020,7,42                                     # ⓕ 습격만 0(`banditGang` = null — 길목 갱 전투 · 장물 · 피해 학습)
//     NODE_OPTIONS=… T796_RAID_ONLY_OFF=1 node scripts/t577-server-run.js 800 1020,7,42                                # ⓖ 갱 전투만 0 — `banditGang` 을 부른 자리가
//       econ 캐러밴 도착 · 귀환(`_caravanArrive` · `tickCaravansV2` = 습격 전투)이면 null, 교역 결정(`tickTradeV2Steps` · `netExportValue` = 기대손실 · 호위 요청)과
//       호스트(소굴 사건)는 원래 값 그대로. 부른 자리는 호출 스택 한 칸으로 읽는다(제품 손잡이 0 · 이 프리로드만).
//   (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>-<시드>.t796.json`)
//   갈래는 장부 `scanDay` 마다 econ 이 읽는 도적 훅을 갈아 끼운다 — 해체 · 절망 이탈 · 소굴 · 유지비 · 토벌은 그대로 돈다(T766 ⓑ′ 와 같은 자리).
//
//   하루 한 줄(마을마다 · 읽기만):
//     [인구 · 곳간 식량 환산(`totalFoodEquivalent`) · 그날 먹은 합(`_foodEaten` 합) · 그날 죽음 · 식량 흐름 EMA(`surplusEMA.food`) ·
//      식량 부양력(`_kDbg.prod`) · 생산 배율(`lastStats.production`) · 도적 위험 학습(`_banditRisk`) · 오는 식량(T766 `incomingFood`) ·
//      누계: 받은 식량(`foodImported`) · 띄운 캐러밴 · 보낸 짐 · 습격당한 캐러밴 · 잃은 짐 · 행상 피살 · 격퇴 ·
//      식량 일꾼(농부 · 어부 · 사냥꾼 · 채집꾼 수)]
//   새 캐러밴(처음 보는 객체): [날 · 출발 · 도착 · 품목 · 양 · 호위 · 길 위험(띄운 순간 `banditRouteRisk`) · 이동일]
//   새 교역 기록(`world.tradeLog`): [기록 날 · 출발 · 도착 · 보낸 품목 · 양 · 사 온 품목 · 양 · 습격 · 빈손]
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;   // 부모 러너 — 아무것도 안 한다
const OUT = process.env.T796_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t796.json' : '');
const RISK_OFF = process.env.T796_RISK_OFF === '1', GANG_OFF = process.env.T796_GANG_OFF === '1', RAID_ONLY_OFF = process.env.T796_RAID_ONLY_OFF === '1';
const RAID_CALLERS = new Set(['_caravanArrive', 'tickCaravansV2']);
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const Ev = require(path.join(ROOT, 'server', 'events'));
const B = require(path.join(ROOT, 'server', 'bandits'));
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'gatherer', 'forager'];
const rec = { names: null, riskOff: RISK_OFF, gangOff: GANG_OFF, raidOnlyOff: RAID_ONLY_OFF, foodJobs: FOOD_JOBS, rows: [], caravans: [], trades: [], fw: {}, gangCalls: {}, gangSeen: {} };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const seenC = new WeakSet(), seenT = new WeakSet();
// 품목 하나의 식량 환산(곳간 잣대 `totalFoodEquivalent` 그대로 — 그 품목 1 만 든 빈 곳간에 묻는다 · 사본 0)
const FW = new Map();
function fw(res) {
  if (!res) return 0;
  if (FW.has(res)) return FW.get(res);
  let w = 0;
  try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[res] = (st[res] || 0) + 1; w = V1.totalFoodEquivalent({ storage: st, npcs: [] }) || 0; } catch (e) { w = 0; }
  FW.set(res, w); rec.fw[res] = w; return w;
}
let hooked = null;   // 원래 훅(갈래가 감싸기 전) — 띄운 순간 위험을 원래 값으로 적는다
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      if ((RISK_OFF || GANG_OFF || RAID_ONLY_OFF) && world.banditRouteRisk && !world.banditRouteRisk._t796) {
        hooked = { risk: world.banditRouteRisk, gang: world.banditGang };
        if (RISK_OFF) { world.banditRouteRisk = () => 0; } else { const f = hooked.risk; world.banditRouteRisk = (a, b) => f(a, b); }
        if (GANG_OFF) world.banditGang = () => null;
        else if (RAID_ONLY_OFF && hooked.gang) { const g = hooked.gang; world.banditGang = function (a, b) { const who = caller(); const r = RAID_CALLERS.has(who) ? null : g(a, b); tally(who, r, a); return r; }; }
        world.banditRouteRisk._t796 = 1;
      }
      snap(world, day | 0);
    } catch (e) { console.error('[t796] 관측 실패:', e.message); }
    return sd.apply(this, arguments);   // t577 훅이 끝 날 process.exit 을 부른다 — 그 앞에 찍는다
  };
  return L;
};
// 훅을 부른 econ 함수 이름(스택 한 칸 — ⓖ 갈래만 쓴다)
const _hold = { stack: '' };
function caller() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 3; Error.captureStackTrace(_hold, caller); Error.stackTraceLimit = L;
  const m = /at (?:Object\.)?([A-Za-z_$][\w$]*)/.exec(String(_hold.stack).split('\n')[2] || ''); return m ? m[1] : '?';
}
function tally(who, r, a) {   // 부른 자리별 [부름 · 갱 있음] · 교역 결정이 갱을 본 출발 마을(이름 → [부름 · 갱 있음])
  const c = rec.gangCalls[who] || (rec.gangCalls[who] = [0, 0]); c[0]++; if (r && r.n > 0) c[1]++;
  if (who === 'tickTradeV2Steps' && a && a.name) { const v = rec.gangSeen[a.name] || (rec.gangSeen[a.name] = [0, 0]); v[0]++; if (r && r.n > 0) v[1]++; }
}
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) { rec.names = V.map((v) => v.name); for (const r of ['food', 'fish', 'meat', 'cooked_food', 'wheat', 'rice', 'barley', 'millet', 'fruit', 'vegetable', 'mushroom']) fw(r); }
  const idx = new Map(V.map((v, i) => [v, i]));
  const riskOf = (a, b) => { try { const f = hooked ? hooked.risk : world.banditRouteRisk; return f ? r2(f(a, b)) : 0; } catch (e) { return -1; } };
  rec.rows.push([day, V.map((v) => {
    const T = v.tradeStats || {}, C = v.counts || {};
    let eaten = 0; for (const k in (v._foodEaten || {})) eaten += +v._foodEaten[k] || 0;
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    let inc = 0; try { inc = B.incomingFood(world, v); } catch (e) { inc = -1; }
    return [(v.npcs || []).length, r2(tfe), r2(eaten), DD.deathsToday(v), r2(v.surplusEMA && v.surplusEMA.food),
      v._kDbg ? v._kDbg.prod : null, r2(v.lastStats && v.lastStats.production), r2(v._banditRisk), r2(inc),
      r2(T.foodImported), T.caravansSent || 0, r2(T.cargoSent), T.caravansRaided || 0, r2(T.cargoLost), T.tradersKilled || 0, T.banditsRepelled || 0,
      FOOD_JOBS.map((j) => Math.round(C[j] || 0))];
  })]);
  for (const c of world.caravans || []) {
    if (seenC.has(c)) continue; seenC.add(c);
    if (!idx.has(c.from) || !idx.has(c.to)) continue;
    rec.caravans.push([day, idx.get(c.from), idx.get(c.to), c.giveRes || null, r2(c.giveAmt), c.escort || 0, riskOf(c.from, c.to), c.travelDays || 0]);
  }
  const TL = world.tradeLog || [];
  for (let j = TL.length - 1; j >= 0 && j >= TL.length - 600; j--) {
    const t = TL[j]; if (!t || seenT.has(t)) continue; seenT.add(t);
    const fi = rec.names.indexOf(t.from), ti = rec.names.indexOf(t.to);
    rec.trades.push([day, fi, ti, t.sent ? t.sent.res : null, t.sent ? r2(t.sent.amt) : 0, t.bought ? t.bought.res : null, t.bought ? r2(t.bought.amt) : 0, t.raided ? 1 : 0, t.abandoned ? 1 : 0]);
  }
}
process.on('exit', () => {
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
