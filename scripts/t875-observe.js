'use strict';
// (@regress 없음 — 러너 밖 · T875 관찰기 · 제품 무변 · 읽기만 — 갈래 팔(`T875_ARM`)만 그 판의 세계를 바꾼다)
// === scripts/t875-observe.js — 첫해 기근이 어느 층인가 — 랩 자(`t17-metrics.js` · `t176-ab.js`)와 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:
//     랩:   T875_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t875-observe.js" node scripts/t17-metrics.js 400 1020
//     서버: NODE_OPTIONS="-r $PWD/scripts/t875-observe.js" [T875_ARM=labseed,euclid,nolive,nomsy 중 몇 · labseed 는 T875_LABSEED=<씨 캐시>] node scripts/t577-server-run.js 400 1020,7,42
//           (아이 존만 · 판 JSON 곁 `<판>-<시드>.t875.json`)
//   제품 손잡이(`VILLAGE_LIFE` · `VILLAGE_NPC_CAP` · `VILLAGE_CARAVAN_MAX` · `T400_BUILD_ACT` …)는 부르는 쪽 env 그대로 아이에게 간다 — 이 파일은 그것을 안 읽는다.
//
//   ① 하루 장부 — 장부 `scanDay`(econ 하루 끝 · 랩 자 · 서버 훅이 다 같은 문)에서 날마다 마을마다 한 줄(econ 이 이미 가진 칸을 읽기만 · 사본 0):
//      [인구 · 곳간 식량 환산(`totalFoodEquivalent`) · 그날 굶어 죽음(`_deathsToday`) · 그날 보호막이 지운 압력(`_shieldAte`) · 주거(`housing`) ·
//       침상(`_mapBeds` · 없으면 −1) · K(`_dpDebug.K`) · 곳간 통나무(`storage.wood`) · 식량 흐름 EMA(`surplusEMA.food`) · 식량 수입 누계(`tradeStats.foodImported`) · 보낸 캐러밴 누계]
//   ② 시딩 단면 — `createVillage` 가 돌려준 마을의 land(수 칸) · storage · housing · 인구(그 순간 · 복사) — 랩 ↔ 서버 시딩이 같은 마을을 세우는지
//   ③ 크루 곳간 출구 — `actFromGranary`(집 · 곳간 · 다리 크루가 곳간에서 꺼내는 유일한 문)가 꺼낸 양(품목별 합 · 부른 수)
//   ④ 갈래 팔(`T875_ARM` · 쉼표로 여럿 · 서버 판만 뜻이 있다 · 제품 손잡이가 없는 네 갈래를 랩 쪽으로 돌리는 자리):
//      euclid — **교역로를 랩 쪽으로**: 서버가 `setDistMatrix` 로 넣는 지형 최단거리 행렬(닿지 못하는 쌍 = ∞)을 마을 좌표 유클리드
//               (랩 `villageDist` 의 폴백과 같은 식 — 모든 쌍 유한)로 바꿔 넣는다. 닿지 못하던 쌍 수 · 지형 / 유클리드 평균 비는 `rec.euclid` 에 적는다.
//      nolive — **집 행위를 랩 쪽으로**: econ 마을 하루(`tickWorldV2Parts().village` · `tickWorldV2`) 바로 앞에 `_t400Live` 를 지운다
//               ⇒ econ 이 집 자재를 랩처럼 곳간에서 직접 뺀다(목재 제약 · 단가 표는 그대로 — `T400_BUILD_ACT` 켬). 크루는 그대로 돈다(③ 이 꺼낸 양을 센다).
//      labseed — **시딩을 랩 쪽으로**: econ 마을의 land 인자를 랩 씨 캐시(`T875_LABSEED`)의 같은 이름 마을 `lp` 로(② 위 줄 · 몸 · 집 · 밭 칸은 서버 시딩 그대로).
//      nomsy  — **어장 상한을 랩 쪽으로**(카드 목록 밖 — 랩 쪽으로 다 돌린 판이 둘째 날 갈린 자리): 서버는 시딩 때 `land._fishBase` 를 두고 하루 마감마다
//               `refreshFishSustain` 이 `land.fishSustain`(econ `_fishScale = min(1, fishSustain / 잠재 어획)` 의 상한)을 매긴다. 랩 t17 은 `T17_MSY` 끔이라
//               그 키가 없다(어획 상한 없음). 이 팔은 econ 마을 land 의 그 두 칸을 늘 비운다(쓰기는 무시하고 센다 — `rec.nomsy`).
//               ★[T923] 랩도 상한을 거는 뒤(`T17_MSY` 켬 기본)엔 엔진의 시딩 MSY 칸(`v._fishMsySeed`)도 지운다(`rec.nomsySeed`) — 그래야 이 팔이 종전처럼 '상한 없음' 이다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T875_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t875.json' : '') : process.env.T875_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const ARMS = new Set(String(process.env.T875_ARM || '').split(',').map((s) => s.trim()).filter(Boolean));
const rec = {
  where: SERVER ? 'server' : path.basename(A1), arm: [...ARMS].sort().join(',') || null,
  knob: Object.fromEntries(['VILLAGE_LIFE', 'VILLAGE_NPC_CAP', 'VILLAGE_CARAVAN_MAX', 'T400_BUILD_ACT', 'T315_MAPBEDS', 'T627_TRIP_DAY', 'T858_NO_SHIELD', 'ENABLE_BANDITS', 'DCTL_SKIP', 'DCTL_ARM']
    .map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  cols: ['pop', 'tfe', 'deaths', 'shieldAte', 'housing', 'beds', 'K', 'wood', 'foodEMA', 'foodImp', 'carSent'],
  names: null, rows: [], seed: [], act: { calls: 0, took: {} }, euclid: null, nolive: 0,
};
const r1 = (x) => Math.round((+x || 0) * 10) / 10;
const r3 = (x) => Math.round((+x || 0) * 1e3) / 1e3;
// ② 시딩 단면 (+ 팔 `labseed` — 시딩을 랩 쪽으로: econ 마을을 세울 때 그 마을의 land 인자(`lp`)를 랩 씨 캐시(`T875_LABSEED` = `LAB_SEEDCACHE` 파일)의 같은 이름 마을 `lp` 로 바꿔 넣는다)
const NOMSY = SERVER && ARMS.has('nomsy');
if (NOMSY) rec.nomsy = 0;
const LABSEED = (SERVER && ARMS.has('labseed') && process.env.T875_LABSEED) ? (() => { try { return new Map(JSON.parse(fs.readFileSync(process.env.T875_LABSEED, 'utf8')).map((s) => [s.name, s.lp])); } catch (e) { return null; } })() : null;
if (LABSEED) rec.labseed = { cache: path.basename(process.env.T875_LABSEED), n: LABSEED.size, used: 0 };
{
  const cv = V1.createVillage;
  V1.createVillage = function (opts) {
    if (LABSEED && opts && LABSEED.has(opts.name)) { arguments[0] = Object.assign({}, opts, LABSEED.get(opts.name), { name: opts.name, initialPop: opts.initialPop, bornDay: opts.bornDay }); rec.labseed.used++; }
    const v = cv.apply(this, arguments);
    if (NOMSY && v && v.land) {   // ④ nomsy — 이 마을 land 의 어장 상한 두 칸을 늘 비운다(쓰기는 센다 · 읽기는 undefined = 랩 t17 의 "키 없음")
      for (const k of ['fishSustain', '_fishBase']) { delete v.land[k]; Object.defineProperty(v.land, k, { get() { return undefined; }, set() { rec.nomsy++; }, enumerable: false, configurable: true }); }
      // ★[T923] 엔진의 시딩 MSY 칸(`v._fishMsySeed` — `T17_MSY` 켬 기본 · 마을 하루 마감이 상한을 세우는 씨)도 비운다.
      //   안 비우면 둘째 날부터 상한이 다시 선다 — V2 가 날마다 land 를 사본(`{ ...land }`)으로 바꿔 끼워 위 두 게터(열거 안 됨)는 첫날 뒤 사라지고,
      //   이 팔이 상한을 막던 것은 사본에 `_fishBase` 가 없어 `refreshFishSustain` 이 빈손으로 돌던 덕이었다(T875 판 그대로 · 보고 T923 §4).
      if (v._fishMsySeed != null) { delete v._fishMsySeed; rec.nomsySeed = (rec.nomsySeed || 0) + 1; }
    }
    try {
      const land = {}; for (const k of Object.keys(v.land || {})) { const x = v.land[k]; if (typeof x === 'number' || typeof x === 'boolean') land[k] = typeof x === 'number' ? r3(x) : x; }
      const st = {}; for (const k of Object.keys(v.storage || {})) if (v.storage[k]) st[k] = r3(v.storage[k]);
      rec.seed.push({ name: v.name, n: (v.npcs || []).length, housing: v.housing != null ? r3(v.housing) : null, land, storage: st });
    } catch (e) { rec.seedErr = String(e && e.message); }
    return v;
  };
}
// ③ 크루 곳간 출구
{
  const af = V1.actFromGranary;
  V1.actFromGranary = function (v, item) {
    const took = af.apply(this, arguments);
    rec.act.calls++; if (took > 0) rec.act.took[item] = r3((rec.act.took[item] || 0) + took);
    return took;
  };
}
// ④ 갈래 팔
if (SERVER && ARMS.has('euclid')) {
  const sdm = V1.setDistMatrix;
  V1.setDistMatrix = function (world, matrix) {
    const V = (world && world.villages) || [];
    const n = (matrix && matrix.length) || 0;
    const E = []; let inf = 0, fin = 0, ratio = 0;
    for (let i = 0; i < n; i++) {
      const row = new Array(n), a = V[i];
      for (let j = 0; j < n; j++) {
        const b = V[j], old = matrix[i] ? matrix[i][j] : Infinity;
        const e = (i === j) ? 0 : (a && b && a.coord && b.coord) ? Math.hypot(a.coord.x - b.coord.x, a.coord.y - b.coord.y) : old;
        row[j] = e;
        if (i < j) { if (!Number.isFinite(old)) inf++; else if (e > 0) { fin++; ratio += old / e; } }
      }
      E.push(row);
    }
    rec.euclid = { n, calls: ((rec.euclid && rec.euclid.calls) || 0) + 1, infPairs: inf, finPairs: fin, meanRatio: fin ? r3(ratio / fin) : null };
    return sdm.call(this, world, E);
  };
}
if (SERVER && ARMS.has('nolive')) {
  const tp = V2.tickWorldV2Parts;
  V2.tickWorldV2Parts = function () {
    const P = tp.apply(this, arguments);
    const vf = P.village;
    P.village = function (ev) { if (ev && ev._t400Live) { ev._t400Live = false; rec.nolive++; } return vf.apply(this, arguments); };
    return P;
  };
  const tw = V2.tickWorldV2;
  V2.tickWorldV2 = function (world) { for (const ev of ((world && world.villages) || [])) if (ev && ev._t400Live) { ev._t400Live = false; rec.nolive++; } return tw.apply(this, arguments); };
}
// ① 하루 장부
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
  rec.rows.push([day, V.map((v) => {
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const ts = v.tradeStats || {};
    return [(v.npcs || []).length, r1(tfe), DD.deathsToday(v), r3(v._shieldAte), r1(v.housing), v._mapBeds != null ? r1(v._mapBeds) : -1,
      v._dpDebug ? r1(v._dpDebug.K) : -1, r1(v.storage && v.storage.wood), r3(v.surplusEMA && v.surplusEMA.food), r1(ts.foodImported), ts.caravansSent || 0];
  })]);
}
process.on('exit', () => { try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
