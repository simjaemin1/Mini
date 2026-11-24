'use strict';
// (@regress 없음 — 러너 밖 · T1475 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1475-observe.js — 멎는 날 앞뒤의 광산5 · 임업2: 광부 · 광부 값 · 곳간 · 병기고 · 주석 짐 · 식량 — 날마다 한 줄 ==========
//   쓰는 법(랩): T1475_OUT=<out.json> NODE_OPTIONS="… -r $PWD/scripts/t1385-lab-probe.js -r $PWD/scripts/t1407-observe.js -r $PWD/scripts/t1475-observe.js" node scripts/t17-metrics.js <날수> <시드>
//   ⚠싣는 차례: **맨 뒤**(t1407 과 같은 까닭 — 주조 훅을 세계마다 한 번 감싸 사슬 맨 안에 선다 · 앞 관찰기의 "맨 바깥이 제 것인가" 휴전을 안 깬다).
//   ⚠값을 바꾸지 않는다 — 곳간 · 상태 · 가격 캐시는 읽기만 · 정본 함수는 읽기 함수(`_foodSecF` · `totalFoodEquivalent` · `storageFoodPer` · `_bronzeCapable` · `_t1344Mix`(그림자 칸))만 부른다.
//   `allocRealCandidates` · `_t1226Table` 처럼 EMA 를 접는(상태를 바꾸는) 함수는 부르지 않는다 — 광부 값은 마을이 이미 접어 둔 EMA(`v._allocEma`)를 읽어 식을 그대로 옮겨 센다.
//   ① 광부 값(고르는 자가 견주는 수 — 정본 `allocRealCandidates` 2판 · 항마다 (1인당 실현 양) × (값) × period(100)):
//      vTin = 접은 주석 원석 산출 ÷ 광부 수 × 원석 주석 값 × 100 · vCu = 구리 원석 같은 꼴 · vOre = 나머지 원석 항 · vMiner = 셋 합(광부 0 명이면 정본은 폴백 = 땅 상수 식 `minerStat`).
//      다른 직업 값 = 같은 꼴(농부 식량 · 어부 물고기 · 사냥꾼 고기+0.3 가죽 · 나무꾼 나무 · 채집 채소+0.6 약초 + 돌) — 그 직업 사람이 0 이면 폴백(땅 상수 식) · `best` = 가장 높은 다른 직업 · `need` = 그날 고르는 자의 모자란 일(`_dbgSwitch`).
//   ② 곳간 날치: 주석 원석 · 주석 · 구리 · 청동(곳간 칸 `bronze`) · 가격(주석 · 원석 주석 · 구리 원석 · 식량) · 병기고(근접검 · 청동 근접검 · 석검 · 목표 N × 0.72 — t1385 와 같은 그림자 셈).
//   ③ 교역 장부 새 줄(날 + 1 칸에 붙인다 = 그 날 아침까지 끝난 일): 주석 · 원석 주석 · 먹을 것(식량 환산)을 마을마다 나가고 들어온 양 · 줄 수.
const path = require('path'), fs = require('fs');
const OUT = process.env.T1475_OUT || ''; if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (n) => { const m = new RegExp('const ' + n + ' = ([\\d.]+);').exec(SRC); return m ? +m[1] : null; };
const C = { PC: K('MELEE_ARMORY_PC'), FRAC: K('BRONZE_ARMORY_FRAC'), SF0: K('SWORD_FRAC_INIT'), YF: K('TIN_DEPOSIT_YIELD_FLAT') };
const VILS = (process.env.T1475_VILS || '광산5,임업2,광산4,어촌1,어촌11,농촌18,어촌5,농촌10,어촌14').split(',');
const FROM = +(process.env.T1475_FROM || 0), TO = process.env.T1475_TO ? +process.env.T1475_TO : Infinity;
const r4 = (x) => (x == null || !isFinite(+x) ? null : +(+x).toFixed(4));
const OG = V1.OreGoods;
const COLS = ['N', 'miner', 'tinShare', 'landOre', 'landTin', 'eOreTin', 'eOreCu', 'eOreOth', 'pOreTin', 'pOreCu', 'vTin', 'vCu', 'vOre', 'vMiner', 'minerStat', 'vFarmer', 'vFisher', 'vHunter', 'vWood', 'vForager', 'best', 'vBest', 'need',
  'minedTin', 'minedCu', 'oreTin', 'tin', 'oreCu', 'cu', 'bronze', 'pTin', 'pFood', 'metalGlut', 'tinGlut', 'weapon', 'melee', 'bronzeS', 'stoneS', 'target', 'castTin', 'castBz', 'cap', 'secF',
  'nF', 'nFi', 'nH', 'nW', 'nFo', 'foodDays', 'foodStock', 'fdDead', 'smith'];
const TCOLS = ['tinOut', 'tinIn', 'oreTinOut', 'oreTinIn', 'tinLegs', 'foodOutEq', 'foodInEq', 'foodInLegs', 'foodOutLegs'];
const BEST = ['farmer', 'fisher', 'hunter', 'lumberjack', 'forager'];
const rec = { cols: COLS, tcols: TCOLS, vils: VILS, consts: C, knobs: { from: FROM, to: TO === Infinity ? null : TO }, names: null, mix: {}, day: {}, trade: {}, err: null };
let W = null, lastDay = null, ready = false;
const SH = new Map(), CAST = new Map(), HOOKED = new WeakSet(), SEEN = new WeakSet(), FP = new Map();
function hook(w) {
  if (HOOKED.has(w)) return; HOOKED.add(w);
  const inner = w.onCast || null;
  const f = function (v, m, amt) {
    try { const c = CAST.get(v.name) || [0, 0, 0]; c[0] += +amt || 0; c[1] += (+amt || 0) * (+(m && m.bronzeness) || 0); c[2] += +((m && m.take) || {}).tin || 0; CAST.set(v.name, c); }
    catch (e) { rec.err = rec.err || ('cast ' + String(e && e.stack || e).slice(0, 300)); }
    if (inner) return inner.apply(this, arguments);
  };
  f._t1475 = true; w.onCast = f;
}
function foodPer(res) {
  if (FP.has(res)) return FP.get(res);
  let f = 0; try { f = +V1.storageFoodPer((W && W.villages && W.villages[0]) || { storage: {}, npcs: [] }, res) || 0; } catch (e) { f = 0; }
  if (!(f > 0)) f = 0; FP.set(res, f); return f;
}
function tradeLegs(day) {   // 교역 장부 꼬리 — 우리 마을이 낀 줄만(날 + 1 칸)
  const L = W && W.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  const mark = (d, name, k, a) => { const T = rec.trade[d + 1] || (rec.trade[d + 1] = {}); const row = T[name] || (T[name] = TCOLS.map(() => 0)); row[TCOLS.indexOf(k)] += a; };
  for (let j = i + 1; j < L.length; j++) {
    const r = L[j]; if (!r || typeof r !== 'object') continue; SEEN.add(r);
    const d = r.day | 0;
    const one = (res, amt, from, to) => {
      if (!res || !(amt > 0)) return;
      const W1 = VILS.includes(from), W2 = VILS.includes(to);
      if (res === 'tin') { if (W1) { mark(d, from, 'tinOut', amt); mark(d, from, 'tinLegs', 1); } if (W2) { mark(d, to, 'tinIn', amt); mark(d, to, 'tinLegs', 1); } }
      else if (res === 'ore_tin') { if (W1) { mark(d, from, 'oreTinOut', amt); mark(d, from, 'tinLegs', 1); } if (W2) { mark(d, to, 'oreTinIn', amt); mark(d, to, 'tinLegs', 1); } }
      else { const fe = foodPer(res); if (fe > 0) { if (W1) { mark(d, from, 'foodOutEq', fe * amt); mark(d, from, 'foodOutLegs', 1); } if (W2) { mark(d, to, 'foodInEq', fe * amt); mark(d, to, 'foodInLegs', 1); } } }
    };
    if (!r.abandoned) {
      if (Array.isArray(r.basket)) for (const it of r.basket) { if (it) one(it.res, +it.amt, r.from, r.to); }
      else { if (r.sent) one(r.sent.res, +r.sent.amt, r.from, r.to); if (r.sent2) one(r.sent2.res, +r.sent2.amt, r.from, r.to); }
    }
    if (Array.isArray(r.retBasket)) for (const it of r.retBasket) { if (it) one(it.res, +it.amt, r.to, r.from); }
    else if (r.bought) one(r.bought.res, +r.bought.amt, r.to, r.from);
  }
}
const clampP = (x, d) => Math.max(0.05, Math.min(200, x == null ? d : x));
function snap(day) {
  const vils = (W && W.villages) || []; if (!vils.length) return;
  if (!rec.names) rec.names = vils.map((v) => v.name);
  tradeLegs(day);
  const inWin = day >= FROM && day <= TO;
  const rows = {};
  for (const v of vils) {
    const name = v.name, N = (v.npcs || []).length;
    // 그림자 병기고(t1385 와 같은 셈 — 그 관찰기 칸은 읽을 길이 없어 같은 식을 옮긴다)
    const st = v.storage || {}, cnt = v.counts || {};
    const stoneC = +v._stoneWeaponMade || 0, ironC = +v._ironWeaponMade || 0, bzC = +v._bronzeWeaponMade || 0;
    let S = SH.get(name);
    if (!S) { S = { storage: { weapon: 0 }, _swordFrac: null, _swordMadeToday: 0, _t1344BzT: 0, _t1344Q: 0, _t1344M: null, _p: [stoneC, ironC, bzC] }; SH.set(name, S); }
    const cst = CAST.get(name) || [0, 0, 0]; CAST.delete(name);
    const dStone = Math.max(0, stoneC - S._p[0]), dIron = Math.max(0, ironC - S._p[1]); S._p = [stoneC, ironC, bzC];
    S.storage.weapon = +st.weapon || 0; S._swordFrac = v._swordFrac != null ? v._swordFrac : C.SF0; S._swordMadeToday = dStone + cst[0] + dIron; S._t1344BzT = cst[1];
    try { V1._t1344Mix(S); } catch (e) { rec.err = rec.err || ('mix ' + String(e && e.stack || e).slice(0, 300)); }
    if (!N || !VILS.includes(name) || !inWin) continue;
    const melee = (+st.weapon || 0) * S._swordFrac, bronzeS = melee * Math.max(0, Math.min(1, S._t1344Q || 0));
    const land = v.land || {}, mixL = land.oreMix || null;
    if (!rec.mix[name]) rec.mix[name] = { ore: r4(land.ore), tin: r4(land.tin), oreMix: mixL ? Object.fromEntries(Object.entries(mixL).map(([k, q]) => [k, r4(q)])) : null };
    const sh = {}; try { Object.assign(sh, OG.shares(mixL && Object.keys(mixL).length ? mixL : OG.POOL)); } catch (e) { /* 자리 */ }
    const idTin = OG.idOf('tin'), idCu = OG.idOf('copper');
    const E = v._allocEma || {}, pc = v._priceCache || {}, PER = 100;
    const nM = cnt.miner || 0, eT = +E[idTin] || 0, eC = +E[idCu] || 0;
    let eO = 0; for (const k of OG.ids) if (k !== idTin && k !== idCu) eO += +E[k] || 0;
    let vOre = 0; for (const k of OG.ids) if (k !== idTin && k !== idCu) vOre += nM > 0 ? (+E[k] || 0) / nM * clampP(pc[k], 1) * PER : 0;
    const vTin = nM > 0 ? eT / nM * clampP(pc[idTin], 1) * PER : 0, vCu = nM > 0 ? eC / nM * clampP(pc[idCu], 1) * PER : 0;
    const wOre = Object.entries(sh).reduce((a, [k, f]) => a + f * clampP(pc[OG.idOf(k)], 1), 0);
    const minerStat = Math.max((land.ore || 0) * wOre * (1 - (v._metalGlut || 0)), (land.tin || 0) * C.YF * clampP(pc.tin, 1) * (1 - (v._tinGlut || 0))) * 0.3 * PER;
    const stat = {
      farmer: (land.fertility || 0) * 0.4 * PER * clampP(pc.food, 1),
      fisher: (land.water || 0) * 1.2 * PER * clampP(pc.fish, 1),
      hunter: (land.game || 0) * 0.7 * PER * (clampP(pc.meat, 1) + 0.3 * clampP(pc.hide, 1)),
      lumberjack: (land.wood || 0) * 0.3 * PER * clampP(pc.wood, 1),
      forager: 0 };
    const nJ = { farmer: cnt.farmer || 0, fisher: cnt.fisher || 0, hunter: cnt.hunter || 0, lumberjack: cnt.lumberjack || 0, forager: cnt.forager || 0 };
    const real = {
      farmer: (+E.food || 0) * clampP(pc.food, 1), fisher: (+E.fish || 0) * clampP(pc.fish, 1), hunter: (+E.meat || 0) * (clampP(pc.meat, 1) + 0.3 * clampP(pc.hide, 1)),
      lumberjack: (+E.wood || 0) * clampP(pc.wood, 1), forager: (+E.vegetable || 0) * clampP(pc.vegetable, 1) + 0.6 * (+E.herb || 0) * clampP(pc.herb, 1) + (+E.stone || 0) * clampP(pc.stone, 1) };
    const val = {}; for (const j of BEST) val[j] = nJ[j] > 0 ? real[j] / nJ[j] * PER : stat[j];
    let best = null, vb = -1; for (const j of BEST) if (val[j] > vb) { vb = val[j]; best = j; }
    let secF = null, fe = null, cap = null;
    try { secF = V1._foodSecF(v); } catch (e) { /* 자리 */ }
    try { fe = V1.totalFoodEquivalent(v); } catch (e) { /* 자리 */ }
    try { cap = V1._bronzeCapable(v) ? 1 : 0; } catch (e) { /* 자리 */ }
    const dp = v.dailyProductionBuf || {};
    const needJ = v._dbgSwitch && v._dbgSwitch.day != null ? v._dbgSwitch.need : null;
    rows[name] = [N, nM, r4(sh.tin != null ? sh.tin : (sh[idTin] != null ? sh[idTin] : null)), r4(land.ore), r4(land.tin), r4(eT), r4(eC), r4(eO), r4(pc[idTin]), r4(pc[idCu]), r4(vTin), r4(vCu), r4(vOre), r4(vTin + vCu + vOre), r4(minerStat),
      r4(val.farmer), r4(val.fisher), r4(val.hunter), r4(val.lumberjack), r4(val.forager), best, r4(vb), needJ,
      r4(dp[idTin]), r4(dp[idCu]), r4(st[idTin]), r4(st.tin), r4(st[idCu]), r4(st.copper), r4(st.bronze), r4(pc.tin), r4(pc.food), r4(v._metalGlut), r4(v._tinGlut), r4(st.weapon), r4(melee), r4(bronzeS), r4(melee - bronzeS), r4(N * C.PC), r4(cst[2]), r4(cst[1]), cap, r4(secF),
      cnt.farmer || 0, cnt.fisher || 0, cnt.hunter || 0, cnt.lumberjack || 0, cnt.forager || 0, r4(fe != null ? fe / Math.max(1, N) : null), r4(st.food), v._fdDeadTot || 0, cnt.smith || 0];
  }
  if (inWin) rec.day[day] = rows;
  if (day % 100 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!W && v && v._world) W = v._world;
    if (W) hook(W);
    if (day !== lastDay) { lastDay = day; if (ready) snap(day); ready = true; }
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 400)); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { if (W) tradeLegs(lastDay); write(); } catch (e) { /* 자리 */ } });
