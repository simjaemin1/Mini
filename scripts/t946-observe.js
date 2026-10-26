'use strict';
// (@regress 없음 — 러너 밖 · T946 관찰기 · 제품 무변 · 읽기만)
// === scripts/t946-observe.js — 첫 두 달(31~90날) 굶주림 · 시딩 곳간 · 첫 수확 앞 식량 흐름 — 랩 자(`t17-metrics.js`) · 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:
//     랩:   T946_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t946-observe.js" [T858_NO_SHIELD=1] node scripts/t17-metrics.js 150 1020
//     서버: NODE_OPTIONS="-r $PWD/scripts/t946-observe.js" [T858_NO_SHIELD=1] node scripts/t577-server-run.js 150 1020,7,42
//           (아이 존만 · 판 JSON 곁 `<판>-<시드>.t946.json`)
//   ① 창설 한 번(`createVillage` 를 감싸 돌려받은 마을만 읽는다 — 인수 · 값 그대로): 창설 인구 · 창설날 · 곳간 식량 · 식량 환산 · 땅(비옥 · 물 · 사냥감) · 첫 직업 칸.
//   ② 날마다(장부 `scanDay` · econ 하루 끝 · `T946_DAYS` 앞까지 · 기본 150): 마을마다 한 줄 —
//      인구 · 그날 굶어 죽음 · 보호막이 지운 압력 · 곳간 식량(`storage.food`) · 식량 환산(`totalFoodEquivalent`) · 식량 흐름 EMA ·
//      그날 흐름(산출 − 먹을 몫 = econ 의 `dailySurplus` — EMA 두 날 값에서 econ 의 그 식 `EMA = 0.95·EMA₋₁ + 0.05·흐름` 을 뒤집어 읽는다 · 사본 0) ·
//      받은 식량 누계(`tradeStats.foodImported` · 100날 창마다 0 으로 돌아간다) · 낸 캐러밴 누계 · 농부 · 어부 · 사냥꾼 · 채집 수 · hunger 칸 · 남은 빚.
//   ⚠흐름은 EMA 의 산수 역이다 — 부동소수 끝자리만 다를 수 있다(값은 소수 셋째 자리로 적는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T946_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t946.json' : '') : process.env.T946_OUT;
if (!OUT) return;
const DAYS = +(process.env.T946_DAYS || 150);
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const r3 = (x) => Math.round((+x || 0) * 1e3) / 1e3;
const rec = {
  where: SERVER ? 'server' : path.basename(A1),
  knob: Object.fromEntries(['T858_NO_SHIELD', 'T100_FIELD_YIELD', 'T932_SMELT_CONT', 'BOOMFIT', 'LANDFIT', 'ENABLE_BANDITS', 'DCTL_SKIP', 'DCTL_ARM', 'T627_TRIP_DAY', 'T315_MAPBEDS', 'VILLAGE_LIFE']
    .map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  econ: { T100_FIELD_YIELD: !!V1.T100_FIELD_YIELD, seedFoodDays0: typeof V1.seedFoodDays === 'function' ? V1.seedFoodDays(0) : null, DAILY_FOOD_CONSUMPTION: V1.DAILY_FOOD_CONSUMPTION },
  born: {},
  cols: ['pop', 'deaths', 'shieldAte', 'food', 'tfe', 'foodEMA', 'flow', 'foodImp', 'sent', 'farmer', 'fisher', 'hunter', 'forager', 'hunger', 'accum'],
  names: null, rows: [],
};
const mkV = V1.createVillage;
V1.createVillage = function (opts) {
  const v = mkV.apply(this, arguments);
  try {
    const o = opts || {};
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const L = v.land || {};
    rec.born[v.name] = { initN: (v.npcs || []).length, bornDay: o.bornDay != null ? o.bornDay : null, food: r3(v.storage && v.storage.food), tfe: r3(tfe),
      fert: r3(L.fertility), water: r3(L.water), game: r3(L.game), ore: r3(L.ore), counts: Object.assign({}, v.counts || {}), restored: false };
  } catch (e) { rec.err = String(e && e.message); }
  return v;
};
let last = -1;
const prevEMA = new Map();
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if ((day | 0) !== last && (day | 0) < DAYS) { last = day | 0; snap(world, day | 0); } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  for (const v of V) if (rec.names.indexOf(v.name) < 0) rec.names.push(v.name);
  const row = new Array(rec.names.length).fill(null);
  for (const v of V) {
    const i = rec.names.indexOf(v.name), d = v._dpDebug || {};
    if (!rec.born[v.name]) rec.born[v.name] = { restored: true, firstSeen: day };
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const ema = +(v.surplusEMA && v.surplusEMA.food) || 0;
    const pe = prevEMA.has(v.name) ? prevEMA.get(v.name) : 0;   // createVillage 의 surplusEMA.food 는 0 에서 선다
    prevEMA.set(v.name, ema);
    const C = v.counts || {};
    row[i] = [(v.npcs || []).length, v._deathsToday || 0, r3(v._shieldAte), r3(v.storage && v.storage.food), r3(tfe), r3(ema), r3((ema - 0.95 * pe) / 0.05),
      r3(v.tradeStats && v.tradeStats.foodImported), (v.tradeStats && v.tradeStats.caravansSent) || 0,
      C.farmer || 0, C.fisher || 0, C.hunter || 0, C.forager || 0, r3(d.hunger), r3(v._dPAccum)];
  }
  rec.rows.push([day, row]);
}
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
