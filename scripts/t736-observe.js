'use strict';
// === scripts/t736-observe.js — T736 관찰기: 바닥 농촌으로 오는 캐러밴(서버 자 · 랩 자 곁 프리로드 · 읽기만) ==========
//
// ★[T736 2026-10-14] "농촌9 로 들어온 캐러밴이 서버 64 · 97 대 랩 348 · 157 — 거리행렬 · 도적 길 위험 · 이웃 크기 중 무엇인가"(T727 회부 3).
//   세계에 아무것도 안 쓴다(읽기만). 같은 파일이 두 자에 붙는다:
//     서버:  NODE_OPTIONS="-r $PWD/scripts/t736-observe.js" VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 \
//              node scripts/t577-server-run.js 400 1020,7,42   (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>.t736.json`)
//     랩:    T736_LAB=1 T736_OUT=/tmp/l.json node -r ./scripts/t736-observe.js scripts/t176-ab.js 400 7
//   장부 `scanDay(world, day)` 가 받는 world 로 하루 한 번:
//     ① 새로 뜬 캐러밴(처음 보는 객체) — [날 · 출발 · 도착 · 품목 · 양 · 거리(econ) · 이동일 · 호위 · 길 위험 · 길목 갱 인원 · 둘째 품목 · 양]
//     ② 바닥 마을(물 = 51곳 최솟값) 하나마다 — [그 마을을 top-20 이웃에 둔 마을 수 · 그중 길 위험 > 0 · 길목 갱 있음 · 그 이웃들 인구 합]
//     ③ 열흘마다 마을 인구 · 첫날 바닥 마을 거리 줄(villageDist — 서버 = 거리행렬 · 랩 = 유클리드) · 끝 날 같은 줄
//     ④ 교역 기록 중 바닥 마을이 낀 줄
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED && process.env.T736_LAB !== '1') return;   // 부모 러너 — 아무것도 안 한다
const OUT = process.env.T736_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t736.json' : '');   // 서버 자 = 판 JSON 곁(시드마다)
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = { names: null, water: null, coord: null, floor: null, caravans: [], expo: [], pop: [], dist0: null, distEnd: null, trades: [], day: 0 };
const seenC = new WeakSet(), seenT = new WeakSet();
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
function distRows(V) {
  return rec.floor.map((fi) => V.map((a) => r2(V1.villageDist(V[fi], a))));
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { console.error('[t736] 관측 실패:', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  rec.day = day;
  if (!rec.names) {
    rec.names = V.map((v) => v.name);
    rec.water = V.map((v) => r2(v.land && v.land.water));
    rec.coord = V.map((v) => [r2(v.coord && v.coord.x), r2(v.coord && v.coord.y)]);
    const wmin = Math.min(...V.map((v) => (v.land ? v.land.water : 9)));
    rec.floor = V.map((v, i) => (v.land && v.land.water <= wmin + 1e-9 ? i : -1)).filter((i) => i >= 0);
    rec.infoRange = world.infoRange || null;
  }
  if (!rec.dist0 && V.every((v) => v._distIdx != null || !world._distMatrix)) rec.dist0 = { day, rows: distRows(V), matrix: !!world._distMatrix };
  const idx = new Map(V.map((v, i) => [v, i]));
  const risk = (a, b) => (world.banditRouteRisk ? (world.banditRouteRisk(a, b) || 0) : 0);
  const gangN = (a, b) => { if (!world.banditGang) return 0; const g = world.banditGang(a, b); return g && g.n > 0 ? g.n : 0; };
  // ① 새 캐러밴
  for (const c of world.caravans || []) {
    if (seenC.has(c)) continue; seenC.add(c);
    if (!idx.has(c.from) || !idx.has(c.to)) continue;
    rec.caravans.push([c.departDay != null ? c.departDay : day, idx.get(c.from), idx.get(c.to), c.giveRes || null, r2(c.giveAmt), r2(c.distance), r2(c.travelDays),
      c.escort || 0, r2(risk(c.from, c.to)), gangN(c.from, c.to), c.giveRes2 || null, r2(c.giveAmt2)]);
  }
  // ② 바닥 마을 노출
  const row = [day];
  for (const fi of rec.floor) {
    const b = V[fi]; let nIn = 0, nRisk = 0, nGang = 0, popN = 0, nTrade = 0;
    for (const a of V) {
      if (a === b || !a._near20 || a._near20.indexOf(b) < 0) continue;
      nIn++; popN += (a.npcs || []).length;
      if ((a.npcs || []).length >= 2) nTrade++;
      if (risk(a, b) > 0) nRisk++;
      if (gangN(a, b) > 0) nGang++;
    }
    row.push([nIn, nTrade, nRisk, nGang, popN, (b.npcs || []).length]);
  }
  rec.expo.push(row);
  if (day % 10 === 0 || day === 1) rec.pop.push([day, V.map((v) => (v.npcs || []).length)]);
  // ④ 교역 기록(바닥 마을이 낀 줄)
  const T = world.tradeLog || [];
  const fname = new Set(rec.floor.map((i) => rec.names[i]));
  for (let j = T.length - 1; j >= 0 && j >= T.length - 400; j--) {
    const t = T[j]; if (!t || seenT.has(t)) continue; seenT.add(t);
    if (!fname.has(t.from) && !fname.has(t.to)) continue;
    rec.trades.push([t.day, t.from, t.to, t.sent ? t.sent.res : null, t.sent ? t.sent.amt : 0, t.bought ? t.bought.res : null, t.bought ? t.bought.amt : 0, t.abandoned ? 1 : 0, t.raided ? 1 : 0, t.distance]);
  }
  rec._lastWorld = world;
}
process.on('exit', () => {
  if (!OUT) return;
  try {
    const w = rec._lastWorld; delete rec._lastWorld;
    if (w && rec.floor) rec.distEnd = { day: rec.day, rows: distRows(w.villages), matrix: !!w._distMatrix, maxD: r2(w._distMatrixMax) };
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
