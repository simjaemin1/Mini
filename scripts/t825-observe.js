'use strict';
// (@regress 없음 — 러너 밖 · T825 관찰기 · 제품 무변)
// === scripts/t825-observe.js — T825: 곳간이 바닥인 마을이 먹을 것을 내다 파나(서버 판 자 `t577-server-run.js` 곁 프리로드 · 읽기만) ==========
//   NODE_OPTIONS="-r $PWD/scripts/t825-observe.js" [T825_FOOD_KEEP=1] [T825_SKIP1=1] node scripts/t577-server-run.js 800 1020,7,42
//   `T825_SKIP1=1` = T810 ⓩ 꼴 갈림 대조 — 첫 습격 조우 하나만 null(그 뒤 습격 그대로 · 세계가 그날 갈린다 · 손잡이가 아니라 이 프리로드의 갈래).
//   읽는 창구: econ 계측 훅 `world.onTradeLeg`(T206 — 주입 없으면 비트 동일 · 출발 leg 하나마다) · 장부 `scanDay`(하루 끝).
//   ⇒ `<판>-<시드>.t825.json`:
//     legs  — 먹을 것(식량 환산 > 0)을 실은 leg 마다 [날 · 출발 · 품목 · 단위 · 1단위 식량 값 · 출발 인구 · 출발 곳간 식량 환산(실은 뒤) · 그 품목 남은 곳간]
//     days  — 날마다 마을마다 [인구 · 곳간 식량 환산 · 생곡 셋(쌀 · 밀 · 보리) 곳간]
//     buys  — 교역 기록(`world.tradeLog`)에서 굶는 날 출발 마을이 사 온 것 [날 · 출발 · 보낸 품목 · 양 · 사 온 품목 · 양]
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t825.json' : '';
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const SKIP1 = process.env.T825_SKIP1 === '1';
const GRAIN = ['rice', 'wheat', 'barley'];
const rec = { on: process.env.T825_FOOD_KEEP === '1', skip1: SKIP1, skipped: 0, names: null, fw: {}, legs: [], days: [], buys: [], hooked: 0 };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const FW = new Map();
function fw(v, r) {   // 1 단위의 식량 환산(정본 `totalFoodEquivalent` 를 그 품목 1 만 든 곳간에)
  if (FW.has(r)) return FW.get(r);
  let f = 0; try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; f = +V1.totalFoodEquivalent({ storage: st, npcs: [], _world: v && v._world }) || 0; } catch (e) { f = 0; }
  FW.set(r, f); rec.fw[r] = f; return f;
}
const tfe = (v) => { try { return V1.totalFoodEquivalent(v); } catch (e) { return -1; } };
const RAID = new Set(['_caravanArrive', 'tickCaravansV2']);
const _hold = { stack: '' };
function caller() {
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 3; Error.captureStackTrace(_hold, caller); Error.stackTraceLimit = L;
  const m = /at (?:Object\.)?([A-Za-z_$][\w$]*)/.exec(String(_hold.stack).split('\n')[2] || ''); return m ? m[1] : '?';
}
const seenT = new WeakSet();
function arm(world) {
  if (!world.onTradeLeg || !world.onTradeLeg._t825) {
    const prev = world.onTradeLeg || null;
    const f = function (o) {
      try {
        const v = world.villages[o.vid]; if (!v) return;
        const k = fw(v, o.res);
        if (k > 0) rec.legs.push([o.day | 0, rec.names ? rec.names.indexOf(v.name) : o.vid, o.res, r2(o.units), k, (v.npcs || []).length, r2(tfe(v)), r2(v.storage[o.res])]);
      } catch (e) {}
      if (prev) return prev.apply(this, arguments);
    };
    f._t825 = 1; world.onTradeLeg = f; rec.hooked++;
  }
  if (SKIP1 && world.banditGang && !world.banditGang._t825) {
    const g = world.banditGang;
    const w = function (a, b) { const r = g(a, b); if (!rec.skipped && r && r.n > 0 && RAID.has(caller())) { rec.skipped = 1; return null; } return r; };
    w._t825 = 1; world.banditGang = w;
  }
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      arm(world);
      const V = world.villages;
      if (!rec.names) rec.names = V.map((v) => v.name);
      const row = new Array(rec.names.length).fill(null);
      for (const v of V) { const i = rec.names.indexOf(v.name); if (i < 0) continue; row[i] = [(v.npcs || []).length, r2(tfe(v)), GRAIN.map((g) => r2(v.storage[g]))]; }
      rec.days.push([day | 0, row]);
      const TL = world.tradeLog || [];
      for (let j = TL.length - 1; j >= 0 && j >= TL.length - 600; j--) {
        const t = TL[j]; if (!t || seenT.has(t)) continue; seenT.add(t);
        const fi = rec.names.indexOf(t.from); if (fi < 0) continue;
        const r = row[fi]; if (!r || !(r[1] < r[0])) continue;
        rec.buys.push([day | 0, fi, t.sent ? t.sent.res : null, t.sent ? r2(t.sent.amt) : 0, t.bought ? t.bought.res : null, t.bought ? r2(t.bought.amt) : 0]);
      }
    } catch (e) { console.error('[t825] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
