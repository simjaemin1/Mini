'use strict';
// T1398 계측기(하네스 아님). 정본 틱/주조 훅 뒤에서 곳간과 기존 값 캐시/거래 장부만 읽는다.
// 순수출가/값표를 새로 계산하지 않는다. 캐시에 없는 구매자는 unknown으로 센다.
const fs = require('fs'), path = require('path');
const server = !!(process.env.T577_SEED && /server[\\/]zone\.js$/.test(process.argv[1] || ''));
const out = server ? process.env.T577_OUT?.replace(/\.json$/, '.t1398.json') : process.env.T1398_OUT;
if (!out) return;
const E = require('../sim/economy-sim');
const gates = {}, days = [], casts = [], trades = [], seenTrades = new WeakSet();
let world, lastDay, hooked;
let deposits;
function gate(k, v, day, buyer) {
  const a = gates[k] || (gates[k] = { days: 0, cu: 0, tin: 0, hands: 0, buyer: 0, noBuyer: 0, unknown: 0, readyBuyer: 0, villages: {} });
  a.days++; a.cu += v.storage.copper || 0; a.tin += v.storage.tin || 0; a.hands += v.counts.smith || 0;
  a[buyer == null ? 'unknown' : buyer > 0 ? 'buyer' : 'noBuyer']++;
  if (buyer > 0 && (v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12 && (v.counts.smith || 0) > 0) a.readyBuyer++;
  a.villages[v.name] = (a.villages[v.name] || 0) + 1;
}
function snapshot(w, d) {
  if (!w || !w.villages || lastDay === d) return;
  lastDay = d; world = w;
  if (!deposits) deposits = w.villages.filter(v => (v.land?.oreMix?.tin || v.land?.tin || 0) > 0).map(v => ({ name: v.name, tin: v.land?.tin, mix: v.land?.oreMix?.tin }));
  let pop = 0, empty = 0, production = 0;
  for (const v of w.villages) {
    const n = v.npcs.length; pop += n; if (!n) { empty++; continue; }
    production += v._bronzeWeaponMade || 0;

  }
  collectTrades(w);
  days.push({ day: d, pop, empty, bronzeCum: production });
  if (d % 10 === 0) write();
}
const observed = new Map();
function observeVillage(v, d) {
  if (!v?._world || observed.get(v) === d || !v.npcs?.length) return;
  observed.set(v, d);
  const n = v.npcs.length, w = v._world;
    const cache = w._nevCache?.val, key = v.name + String.fromCharCode(0) + 'weapon';
    const buyer = cache?.has(key) ? cache.get(key) : null;
    if (!E._weaponThin(v)) gate('band', v, d, buyer);
    if ((v.storage.tin || 0) <= Math.max(3, n * 1.2) + n * 0.3) gate('tinReserve', v, d, buyer);
    if ((v.storage.weapon || 0) >= Math.max(2, ((v.counts.warrior || 0) + (v.counts.hunter || 0)) * 1.3) * 1.3) gate('returnWeapon', v, d, buyer);
    if ((v.counts.smith || 0) >= Math.max(1, Math.floor(n * 0.03))) gate('smith3pct', v, d, buyer);
    if ((v.storage.copper || 0) <= n * 3) gate('copper3N', v, d, buyer);
}
function collectTrades(w) {
  for (const t of w.tradeLog || []) {
    if (!t || seenTrades.has(t)) continue; seenTrades.add(t);
    if (t.sent?.res === 'weapon' || t.sent2?.res === 'weapon' || t.bought?.res === 'weapon' || [...(t.basket || []), ...(t.retBasket || [])].some(x => x.res === 'weapon')) trades.push(JSON.parse(JSON.stringify(t)));
  }
}
function hook(w) {
  if (!w || hooked === w.onCast) return;
  const prev = w.onCast;
  const fn = function(v, m, amt) { if (prev) prev.apply(this, arguments); casts.push({ day: w.day, village: v.name, amount: amt, bronze: amt * m.bronzeness, mix: m.mix, grade: m.grade, score: m.score }); };
  if (prev?._t1385) fn._t1385 = true; // 이미 감싼 T1385 훅을 다음 날 다시 감싸지 않는다.
  w.onCast = fn; hooked = fn;
}
const tick = E.tickVillage;
E.tickVillage = function(v, d) { const w = v?._world; snapshot(w, d); hook(w); const ret = tick.apply(this, arguments); observeVillage(v, d); return ret; };
function write() { fs.writeFileSync(out, JSON.stringify({ knob: !!E.T1398_BRONZE_BAND, deposits, gates, days, casts, trades, buyerMeaning: '기존 순수출가 캐시만 읽음. unknown은 미관측이며 0이 아님' })); }
process.on('exit', () => { if (world) collectTrades(world); write(); });
