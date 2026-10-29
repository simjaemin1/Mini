'use strict';
// === scripts/t727-observe.js — T727 관찰기(서버 판 자 `t577-server-run.js` 곁 프리로드 · 읽기만) =====================
//
// ★[T727 2026-10-13] "장마당 켬 판 시드 7 소멸 마을 — 어느 마을 · 언제 · 왜". 세계에 아무것도 안 쓴다.
//   쓰는 법:  NODE_OPTIONS="-r $PWD/scripts/t727-observe.js" T727_OUT=/tmp/x.json \
//             VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 node scripts/t577-server-run.js 400 7
//   (아이 서버만 잰다 — `T577_SEED` 가 없는 부모 러너에선 아무것도 안 한다.)
//   랩 자(t176)에도 같은 줄:  T727_LAB=1 T727_OUT=/tmp/y.json node -r ./scripts/t727-observe.js scripts/t176-ab.js 400 7
//   하는 일: 장부 `scanDay(world, day)` 가 받는 그 world 로 마을마다 하루 한 줄 —
//     [인구 · 곳간 식량(도적 층 잣대 food+fish+meat+cooked) · 식량 환산(totalFoodEquivalent) · 잉여 EMA(food) · 행복 ·
//      순감 날(_bdtFall) · 위기(_bdtCri) · 그날 아사 · 누적 아사 · 해체 표 · 주거 ·
//      장 대기(이 마을로 와 정산을 기다리는 캐러밴 수 · 그 짐) · 이 마을로 돌아오는 식량(귀환 중 화물 · 식량류) ·
//      그날 교역 기록(보낸 · 받은 · 사 간 · 사 온)]
//   + 도적 층 로그 줄(해체 · 절망 이탈 · 토벌)은 아이 로그에 이미 있다(러너가 남긴다).
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED && process.env.T727_LAB !== '1') return;   // 부모 러너 — 아무것도 안 한다
const OUT = process.env.T727_OUT || '';
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const Ev = require(path.join(ROOT, 'server', 'events'));
const FOOD = { food: 1, fish: 1, meat: 1, cooked_food: 1 };
const rec = { names: null, rows: [], trades: [], settle: [] };
const seen = new WeakSet();
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t727] 관측 실패:', e.message); }
    return sd.apply(this, arguments);   // t577 훅이 이 뒤에 끝 날 process.exit 을 부른다 — 그 앞에 찍는다
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  const idx = new Map(V.map((v, i) => [v, i]));
  const pend = V.map(() => [0, 0]), back = V.map(() => 0);
  for (const c of world.caravans || []) {
    if (c._t707 && idx.has(c.to)) { const k = idx.get(c.to); pend[k][0]++; pend[k][1] += c._t707.give || 0; }
    if (c.state === 'inbound' && idx.has(c.from) && c._returningRes && FOOD[c._returningRes]) back[idx.get(c.from)] += c._returningAmt || 0;
  }
  const r2 = (x) => Math.round((+x || 0) * 100) / 100;
  rec.rows.push([day, V.map((v, i) => {
    const St = v.storage || {};
    const fe = (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0);
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    return [(v.npcs || []).length, r2(fe), r2(tfe), r2(v.surplusEMA && v.surplusEMA.food), r2(v.lastStats && v.lastStats.happiness),
      v._bdtFall || 0, r2(v._bdtCri), DD.deathsToday(v), v._deadTot || 0, v._banditized ? 1 : 0, r2(v.housing),
      pend[i][0], r2(pend[i][1]), r2(back[i])];
  })]);
  // 교역 기록 — 처음 보는 줄만(장부는 5000 줄에서 앞을 자른다 · 하루 수십 줄이라 안 놓친다)
  const T = world.tradeLog || [];
  for (let j = T.length - 1; j >= 0 && j >= T.length - 400; j--) {
    const t = T[j]; if (!t || seen.has(t)) continue; seen.add(t);
    rec.trades.push([t.day, t.from, t.to, t.sent ? t.sent.res : null, t.sent ? t.sent.amt : 0, t.bought ? t.bought.res : null, t.bought ? t.bought.amt : 0, t.abandoned ? 1 : 0, t.raided ? 1 : 0, day]);
  }
  if (world._t707Stat) rec.settle.push([day, world._t707Stat.settled]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
