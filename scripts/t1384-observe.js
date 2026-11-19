'use strict';
// (@regress 없음 — 러너 밖 · T1384 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1384-observe.js — 먹을거리를 못 내는 마을은 왜 굶나: 마을-날 식량 장부 · 교역 식량 짐 · 파는 쪽 문 · 제 캐러밴 문 ==========
//   쓰는 법(서버 자): NODE_OPTIONS="… -r $PWD/scripts/t1384-observe.js" node scripts/t577-server-run.js 400 1020   → 판 곁 `<판>-<시드>.t1384.json`
//           (랩):     T1384_LAB_OUT=<out.json> node -r scripts/t1384-observe.js scripts/t176-ab.js 800 1020 (또는 econ-lab-real.js 100 0)
//   ① 마을 틱 겹(econ `tickVillage` 마을마다): 앞뒤 곳간 식량 환산(`storageFoodEquivalent`) · 식량 흐름 EMA(`surplusEMA.food` = 0.95 × 어제 + 0.05 × 그날 생산 − 필요 →
//      그날 생산 − 필요를 되푼다) · 그날 먹은 몫(`_foodEaten` × `storageFoodPer`) — 필요 = 사람 × `DAILY_FOOD_CONSUMPTION` · 생산 = (생산 − 필요) + 필요 · 모자람 = 필요 − 먹음
//   ② 날 머리(그날 첫 부름 — 어제 하루가 다 돈 곳간): 마을마다 한 줄(`vcols`) — 사람 · 식량 안보(`_foodSecF`) · 곳간 식량 환산 · 어제 필요 · 생산 · 먹음 · 모자람 · 흐름 EMA ·
//      굶어 죽음 · 죽음 · 떠남 · 못 떠남 누계 · 직업 · 교역 중 · 여유 몫(`_idleFrac`) · 교역 자리(`spareCap` — 종전 식 그대로) · 위기(흐름 EMA < 0) · 식량 값(`_priceCache.food`) ·
//      금고(`treasury._cash`) · 내보낼 후보 수 · 그 가운데 먹을 것(`storageFoodPer` > 0) 수 · ★어제 틱의 K 분해(econ 진단 칸 `_kDbg` — 식량 자리 · 식량 흐름 · 땔감) · 인구 갱신 항(`_dpDebug` — K · 로지스틱 · 굶주림 · 건강 · 행복 · 집 · 집 문 · dP) · 들여온 식량 EMA(`_importEMA`) · 나무꾼 · 곳간 목재 · 돌 · 땔감 충당(`_fuelCov`)
//   ③ 교역 장부(`world.tradeLog` 꼬리 — 읽기만): 줄마다 보낸 짐 · 귀로 짐의 식량 환산 · 광산 · 임업 마을이 낀 줄은 품목 그대로(`legs`)
//   ④ 광산 마을 제 캐러밴 문(날마다): 후보 × 가까운 20(`_near20` — econ 이 캐시한 그 열)마다 다리 이익(종전 식 — 운반비 · 손실 `_legRiskV2` · 신선도 `_t784F` · `_legProfitPerUnit`) →
//      가장 좋은 다리 · 위기면 식량 있는 목적지 다리(P2) · 기회비용 문(최저 생산자 `_lowestProducer` × 왕복 날 × (1 − 0.5 × 여유)) — 그날 낼 수 있었나
//   ⑤ 10날마다 광산 마을마다 파는 쪽 문: 먹을 것 후보가 있는 마을 S 마다 [거리 · S 의 가까운 20 안 · 정보 거리 안 · 막힘 · S → 광산 먹을 것 다리 이익 · S 의 가장 좋은 다리 이익 · 그 목적지]
//   econ 안쪽 함수 몇은 내보내지 않아 모듈을 실을 때 내보낸 칸 하나(`__t1384`)만 덧붙인다(값 · 차례 무변 — 판은 안 건드린다 · 무섭동은 끔 판 견줌으로 잰다).
//   ⚠값을 바꾸지 않는다 — 곳간 · 캐시를 읽기만 한다 · 세계 캐시를 채우는 함수(세계 공급 · 값표)는 부르지 않는다(값은 `_priceCache` 를 읽는다).
const path = require('path');
const fs = require('fs');
const Module = require('module');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const LAB = process.env.T1384_LAB_OUT || '';
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1384.json' : '') : LAB;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V2FILE = path.join(ROOT, 'sim', 'economy-sim-v2.js');
{   // econ v2 안쪽 함수를 내보낸 칸 하나로(실을 때 한 번 · 몸통 무변)
  const _js = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename === V2FILE) {
      const src = fs.readFileSync(filename, 'utf8') + '\n;module.exports.__t1384 = { _exportCandidatesV2, _legRiskV2, _legProfitPerUnit, _destBlockedV2, _t784F, _elevKmOf, travelDaysForDistance, '
        + 'FOOD_CLASSES, FOOD_PULL_TOL, CARGO_PER_TRIP, TRADE_SPARE_UTIL, CRISIS_TRADE_PC, SUBSISTENCE_PER_NPC, T784_CARGO_AGE, T1152_TC };\n';
      return m._compile(src, filename);
    }
    return _js(m, filename);
  };
}
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2 = require(V2FILE);
const X = V2.__t1384;
const r3 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(3));
const isMine = (n) => /^광산\d+$/.test(n), isWood = (n) => /^임업\d+$/.test(n);
const DFC = V1.DAILY_FOOD_CONSUMPTION || 1;
const MARGIN = V2.FORWARD_PRICE_MARGIN_NEV || 0.95;
const rec = {
  mode: SERVER ? 'server' : 'lab',
  knobs: { T1384_MINE_FOOD: process.env.T1384_MINE_FOOD || null, T1384_FOOD_KEEP: process.env.T1384_FOOD_KEEP || null, T1384_FOOD_ROUTE: process.env.T1384_FOOD_ROUTE || null, T1347_FETCH: process.env.T1347_FETCH || null, T784: !!(X && X.T784_CARGO_AGE), T1152: !!(X && X.T1152_TC) },
  consts: X ? { DFC, CARGO: X.CARGO_PER_TRIP, SPARE: X.TRADE_SPARE_UTIL, CRISIS: X.CRISIS_TRADE_PC, TOL: X.FOOD_PULL_TOL, MARGIN } : null,
  names: null,
  vcols: ['N', 'secF', 'stockEq', 'need', 'prod', 'eaten', 'short', 'surpEMA', 'fdDead', 'dead', 'emig', 'emigLost', 'farmer', 'forager', 'hunter', 'fisher', 'miner', 'smith', 'mason', 'warrior',
    'trading', 'idleFrac', 'spareCap', 'crisis', 'pFood', 'cash', 'nCand', 'foodCand',
    'kSlot', 'kProd', 'kFuel', 'K', 'logi', 'hungerT', 'healthT', 'happyT', 'housing', 'gated', 'dP', 'impEMA', 'lumber', 'wood', 'stone', 'fuelCov'],   // 어제 틱의 K 분해(`_kDbg` — 식량 자리 · 식량 흐름 · 땔감) · 인구 갱신 항(`_dpDebug`) · 들여온 식량 EMA(`_importEMA` — K 흐름 몫에 든다)
  day: {},
  lcols: ['day', 'from', 'to', 'sentRes', 'sentAmt', 'sentEq', 'boughtRes', 'boughtAmt', 'boughtEq', 'dist', 'raided'],
  legs: [],                 // 광산 · 임업이 낀 줄(품목 그대로) + 다른 마을 사이 먹을 것 줄
  ocols: ['nCand', 'cands', 'bestTot', 'bestRes', 'bestTo', 'gate', 'pass', 'crisis', 'fTot', 'fTo', 'trading', 'spareCap', 'lpMv'],
  own: {},                  // [날] → { 광산: [...ocols] }
  scols: ['S', 'dist', 'inNear', 'inRange', 'blocked', 'fRes', 'fTot', 'bestTot', 'bestTo', 'bestRes', 'stockEqS', 'secFS'],
  sell: {},                 // [날] → { 광산: [[...scols] …] }
  err: null,
};
let W = null, lastDay = -1, ready = false;
const TICK = new Map();   // 마을 → 그날 틱 흐름 [필요 · 생산 · 먹음 · 모자람]
const foodPer = (v, r) => { try { const f = V1.storageFoodPer(v, r); return f > 0 ? f : 0; } catch (e) { return 0; } };
const stockEq = (v) => { try { return V1.storageFoodEquivalent(v); } catch (e) { return null; } };
const secF = (v) => { try { return V1._foodSecF(v); } catch (e) { return null; } };
function cands(v) { try { return X._exportCandidatesV2({ v }, (v.npcs || []).length); } catch (e) { rec.err = rec.err || ('cand ' + String(e && e.stack || e).slice(0, 300)); return []; } }
function spareOf(v, day) {
  const N = (v.npcs || []).length;
  let sc = Math.max(1, Math.floor(N * (v._idleFrac || 0) * X.TRADE_SPARE_UTIL));
  const crisis = !!(v.surplusEMA && v.surplusEMA.food < 0);
  if (crisis) sc = Math.max(sc, Math.ceil(N * X.CRISIS_TRADE_PC));
  let tr = 0; for (const n of (v.npcs || [])) if (n._tradingUntil && n._tradingUntil > day) tr++;
  return { sc, crisis, tr };
}
// 한 다리 이익(종전 첫째 화물 고리의 식 그대로 — 운반비 · 손실 · 신선도 · 단위 이익 × 짐)
function legTot(av, bv, res, surplus, day) {
  const pa = av._priceCache, pb = bv._priceCache; if (!pa || !pb) return null;
  const pFrom = pa[res], pTo0 = pb[res]; if (!(pFrom > 0) || !(pTo0 > 0)) return null;
  const dist = V1.villageDist(av, bv); if (!isFinite(dist)) return null;
  const { transportCostPerUnit, expectedLossRatio } = X._legRiskV2(W, { v: av }, { v: bv }, dist);
  let pTo = pTo0 * MARGIN;
  if (X.T784_CARGO_AGE) pTo = pTo * X._t784F(res, X.travelDaysForDistance(dist), day, X._elevKmOf(bv));
  const ppu = X._legProfitPerUnit(pFrom, pTo, transportCostPerUnit, expectedLossRatio);
  return { tot: ppu * Math.min(surplus, X.CARGO_PER_TRIP), dist };
}
function destHasFood(bv) {   // P2 `_destHasFood` 와 같은 문(식량 4류 가운데 하나라도 출발 문을 넘는 곳간)
  const bn = (bv.npcs || []).length; for (const fr in X.FOOD_CLASSES) { const bs = bv.storage[fr] || 0; const bt = Math.max((X.SUBSISTENCE_PER_NPC[fr] || 0) * bn * 30, bn * 0.3); if (bs > bt) return true; }
  return false;
}
function ownGate(v, day) {   // ④ 제 캐러밴 문
  const C = cands(v), sp = spareOf(v, day), near = v._near20 || [], infoR = (W && W.infoRange) || 400;
  let best = null, bestF = null;
  for (const c of C) for (const nb of near) {
    if (!nb || nb === v) continue;
    let bl = false; try { bl = X._destBlockedV2({ v }, { v: nb }, day); } catch (e) { bl = false; }
    if (bl) continue;
    const L = legTot(v, nb, c.res, c.surplus, day); if (!L || L.dist > infoR || !(L.tot > 0)) continue;
    if (!best || L.tot > best.tot) best = { tot: L.tot, res: c.res, to: nb.name, dist: L.dist };
    if (sp.crisis && destHasFood(nb) && (!bestF || L.tot > bestF.tot)) bestF = { tot: L.tot, to: nb.name };
  }
  let pick = best; if (sp.crisis && bestF && best && bestF.tot >= best.tot * X.FOOD_PULL_TOL) pick = Object.assign({}, best, { tot: bestF.tot, to: bestF.to });
  let lp = null; try { lp = V2._lowestProducer(v, v._priceCache || {}, day); } catch (e) { lp = null; }
  let gate = null, pass = 0;
  if (pick && lp && lp.npc) { const trip = X.travelDaysForDistance(pick.dist) * 2, slack = Math.max(0, Math.min(1, v._slack || 0)); gate = lp.mv * trip * (1 - 0.5 * slack); pass = pick.tot > gate ? 1 : 0; }
  const top = [...C].sort((a, b) => b.surplus - a.surplus).slice(0, 3).map((c) => `${c.res}:${(+c.surplus).toFixed(1)}`).join(' ');
  return [C.length, top, r3(pick && pick.tot), pick && pick.res, pick && pick.to, r3(gate), pass, sp.crisis ? 1 : 0, r3(bestF && bestF.tot), bestF && bestF.to, sp.tr, sp.sc, r3(lp && lp.mv)];
}
function sellerInfo(vils, day) {   // ⑤ 앞 — 파는 마을마다 한 번(그날): 먹을 것 후보 · 가장 좋은 다리(후보 × 가까운 20)
  const infoR = (W && W.infoRange) || 400, I = new Map();
  for (const S of vils) {
    if (!(S.npcs || []).length) continue;
    const C = cands(S); const FC = C.filter((c) => foodPer(S, c.res) > 0); if (!FC.length) continue;
    let best = null; for (const c of C) for (const nb of (S._near20 || [])) { if (!nb || nb === S) continue; const L = legTot(S, nb, c.res, c.surplus, day); if (!L || L.dist > infoR) continue; if (!best || L.tot > best.tot) best = { tot: L.tot, to: nb.name, res: c.res }; }
    I.set(S, { FC, best, eq: stockEq(S), sf: secF(S) });
  }
  return I;
}
function sellGate(M, I, day) {   // ⑤ 파는 쪽 문 — 먹을 것 후보가 있는 마을 S 마다
  const out = [], infoR = (W && W.infoRange) || 400;
  for (const [S, info] of I) {
    if (S === M) continue;
    let bl = false; try { bl = X._destBlockedV2({ v: S }, { v: M }, day); } catch (e) { bl = false; }
    const inNear = (S._near20 || []).includes(M) ? 1 : 0, dist = V1.villageDist(S, M);
    let fBest = null; for (const c of info.FC) { const L = legTot(S, M, c.res, c.surplus, day); if (L && (!fBest || L.tot > fBest.tot)) fBest = { tot: L.tot, res: c.res }; }
    const best = info.best;
    out.push([S.name, r3(dist), inNear, isFinite(dist) && dist <= infoR ? 1 : 0, bl ? 1 : 0, fBest && fBest.res, r3(fBest && fBest.tot), r3(best && best.tot), best && best.to, best && best.res, r3(info.eq), r3(info.sf)]);
  }
  return out;
}
const SEEN = new WeakSet();
function readLog() {
  const L = W && W.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  const byName = new Map((W.villages || []).map((v) => [v.name, v]));
  for (let j = i + 1; j < L.length; j++) {
    const row = L[j]; if (!row || typeof row !== 'object') continue; SEEN.add(row);
    try {
      const fv = byName.get(row.from), tv = byName.get(row.to);
      const s = (!row.abandoned && row.sent) ? row.sent : null, b = row.bought || null;
      const sEq = s && tv ? (+s.amt || 0) * foodPer(tv, s.res) : 0, bEq = b && fv ? (+b.amt || 0) * foodPer(fv, b.res) : 0;
      const watch = isMine(row.from) || isMine(row.to) || isWood(row.from) || isWood(row.to);
      if (watch || sEq > 0 || bEq > 0) rec.legs.push([row.day | 0, row.from, row.to, s && s.res, r3(s && s.amt), r3(sEq), b && b.res, r3(b && b.amt), r3(bEq), row.distance | 0, row.raided ? 1 : 0]);
    } catch (e) { rec.err = rec.err || ('log ' + String(e && e.stack || e).slice(0, 300)); }
  }
}
function snap(day) {
  const vils = (W && W.villages) || []; if (!vils.length) return;
  if (!rec.names) rec.names = vils.map((v) => v.name);
  readLog();
  const rows = [];
  for (const v of vils) {
    const N = (v.npcs || []).length, cnt = v.counts || {}, t = TICK.get(v) || null, sp = N ? spareOf(v, day) : { sc: 0, crisis: false, tr: 0 };
    const C = N ? cands(v) : [];
    rows.push([N, r3(secF(v)), r3(stockEq(v)), r3(t && t[0]), r3(t && t[1]), r3(t && t[2]), r3(t && t[3]), r3(v.surplusEMA && v.surplusEMA.food), v._fdDeadTot || 0, v._deadTot || 0, v._emigTot || 0, r3(v._emigLost || 0),
      cnt.farmer || 0, cnt.forager || 0, cnt.hunter || 0, cnt.fisher || 0, cnt.miner || 0, cnt.smith || 0, cnt.mason || 0, cnt.warrior || 0,
      sp.tr, r3(v._idleFrac || 0), sp.sc, sp.crisis ? 1 : 0, r3(v._priceCache && v._priceCache.food), r3(v.treasury && v.treasury._cash), C.length, C.filter((c) => foodPer(v, c.res) > 0).length,
      ...(() => { const k = v._kDbg || {}, p = v._dpDebug || {}; return [r3(k.slot), r3(k.prod), r3(k.fuel), r3(p.K), r3(p.logi), r3(p.hunger), r3(p.health), r3(p.happy), r3(p.housing), p.gated ? 1 : 0, r3(p.dP), r3(v._importEMA), cnt.lumberjack || 0, r3((v.storage || {}).wood), r3((v.storage || {}).stone), r3(v._fuelCov)]; })()]);
  }
  rec.day[day] = rows;
  const O = {}; for (const v of vils) if (isMine(v.name) && (v.npcs || []).length) O[v.name] = ownGate(v, day);
  rec.own[day] = O;
  if (day % 10 === 0) { const I = sellerInfo(vils, day), S = {}; for (const M of vils) if (isMine(M.name) && (M.npcs || []).length) S[M.name] = sellGate(M, I, day); rec.sell[day] = S; }
  if (day % 10 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!W && v && v._world) W = v._world;
    if (day !== lastDay) { lastDay = day; if (ready) snap(day); ready = true; }
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 400)); }
  let N0 = 0, S0 = 0;
  try { N0 = (v.npcs || []).length; S0 = (v.surplusEMA && v.surplusEMA.food) || 0; } catch (e) { /* 자리 */ }
  const ret = _t.apply(this, arguments);
  try {
    if (N0 > 0) {
      const S1 = (v.surplusEMA && v.surplusEMA.food) || 0, need = N0 * DFC, surp = (S1 - 0.95 * S0) / 0.05;
      let eaten = 0; const E = v._foodEaten || {}; for (const r in E) eaten += (+E[r] || 0) * foodPer(v, r);
      TICK.set(v, [need, surp + need, eaten, Math.max(0, need - eaten)]);
    } else TICK.set(v, [0, 0, 0, 0]);
  } catch (e) { rec.err = rec.err || ('tick ' + String(e && e.stack || e).slice(0, 300)); }
  return ret;
};
process.on('exit', () => { try { if (lastDay >= 0) snap(lastDay + 1); } catch (e) { /* 자리 */ } write(); });
