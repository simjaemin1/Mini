'use strict';
// (@regress 없음 — 러너 밖 · T1336 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1336-observe.js — 몸 : 랩 식량 장부 날 줄(T1325 회부 1 · 몸 식량이 랩보다 많다) — econ `tickVillage` 곁 ===
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1336-observe.js" node scripts/t1308-long-run.js 120 1020 …   (판 JSON 곁 `<판>-<시드>.t1336.json`)
//   랩 자:      T1336_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1336-observe.js" T1243_FARM_ON=1 node scripts/t176-ab.js 120 1020
//   날마다(세계 합 · 식량 등가 = econ `storageFoodPer` — 곳간 합계와 같은 자):
//     생산(틱 안 · `v.dailyProductionBuf`) 무리별 — `pMeat` 고기 · `pFish` 물고기(종 · 해산) · `pFor` 채집(과일 · 채소 · 버섯 · 나무 열매)
//       · `pGrain` 생곡 · 작물 · `food` · `pCook` 조리식 · `pPres` 보존식 · `pOth` 그 밖
//     일꾼 — `nHun` 사냥꾼 · `nFis` 어부 · `nFor` 채집꾼 · `nFar` 농부 · `nCook` 요리사(틱 뒤)
//     먹음 · 씀 — `cons` 어제 하루 `_consDay` 의 식량 등가 합(틱 머리에서 폴드 직전에 읽는다 = 틱 사이 서버 몫까지 하루 온전히)
//     곳간 — `stIn` 틱 앞 · `stOut` 틱 뒤 · `dTick` 틱 안 변화 · `dGap` 앞 틱 뒤 → 이 틱 앞(틱 사이 · 서버 수확 배달 · 짐 · 캐러밴 · 몸 요리)
//     사람 — `pop` · `fdDead` 식량 빚 죽음(누계 차) · `emig` 떠남(누계 차) · `famV` 기근 문 마을(곳간 < 사람 × 10)
//   주사위 0 · 캐시 0 · 세계에 아무것도 안 쓴다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1336_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1336.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const COLS = ['day', 'vil', 'pop', 'pMeat', 'pFish', 'pFor', 'pGrain', 'pCook', 'pPres', 'pOth', 'nHun', 'nFis', 'nFor', 'nFar', 'nCook',
  'cons', 'stIn', 'stOut', 'dTick', 'dGap', 'fdDead', 'emig', 'famV'];
const rec = { cols: COLS, rows: [], err: null, server: SERVER };
const FOR = new Set(Object.keys(V1.FORAGE_FOOD_FACTOR || {}));
const GRAIN = new Set(V1.RAW_GRAINS || []);
const PRES = new Set(V1.PRESERVED_FOODS || []);
const FISHY = /fish|salmon|shrimp|crab|oyster|seaweed|clam|eel|carp|trout|mackerel|squid/;
function group(r) {
  if (r === 'cooked_food') return 'pCook';
  if (PRES.has(r)) return 'pPres';
  if (r === 'meat' || /meat/.test(r)) return 'pMeat';
  if (FISHY.test(r)) return 'pFish';
  if (FOR.has(r)) return 'pFor';
  if (GRAIN.has(r) || r === 'food') return 'pGrain';
  return 'pOth';   // 작물(econ 이 모르는 주입 작물 — `_t368FoodPer`)은 아래에서 pGrain 으로 옮긴다
}
let cur = null, lastWrite = -1;
const lastOut = new WeakMap(), lastFd = new WeakMap(), lastEm = new WeakMap();
function flush() { if (cur) rec.rows.push(COLS.map((k) => (typeof cur[k] === 'number' ? +cur[k].toFixed(3) : cur[k]))); }
const fe = (v) => { try { return V1.storageFoodEquivalent ? V1.storageFoodEquivalent(v, v.storage, false) : V1.totalFoodEquivalent(v); } catch (e) { return 0; } };
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let pre = null;
  try {
    if (!cur || cur.day !== day) {
      flush();
      cur = { day }; for (const k of COLS) if (k !== 'day') cur[k] = 0;
      if (day % 10 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
    }
    const s0 = fe(v);
    let c = 0; const d = v._consDay; if (d) for (const r in d) { const f = V1.storageFoodPer(v, r); if (f > 0 && d[r] > 0) c += d[r] * f; }
    cur.cons += c; cur.stIn += s0;
    if (lastOut.has(v)) cur.dGap += s0 - lastOut.get(v);
    pre = { s0 };
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const r = _t.apply(this, arguments);
  try {
    if (pre) {
      cur.vil++;
      const N = (v.npcs || []).length; cur.pop += N;
      const s1 = fe(v); cur.stOut += s1; cur.dTick += s1 - pre.s0; lastOut.set(v, s1);
      if (s1 < N * 10) cur.famV++;
      const P = v.dailyProductionBuf || {};
      for (const k in P) {
        const q = +P[k] || 0; if (!(q > 0)) continue;
        const f = V1.storageFoodPer(v, k); if (!(f > 0)) continue;
        let g = group(k); if (g === 'pOth' && !V1.RESOURCES.includes(k)) g = 'pGrain';
        cur[g] += q * f;
      }
      const C = v.counts || {};
      cur.nHun += C.hunter || 0; cur.nFis += C.fisher || 0; cur.nFor += C.forager || 0; cur.nFar += C.farmer || 0; cur.nCook += C.cook || 0;
      const fd = v._fdDeadTot || 0, em = v._emigTot || 0;
      if (lastFd.has(v)) cur.fdDead += fd - lastFd.get(v); lastFd.set(v, fd);
      if (lastEm.has(v)) cur.emig += em - lastEm.get(v); lastEm.set(v, em);
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
