'use strict';
// (@regress 없음 — 러너 밖 · T1230 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1230-observe.js — 인구가 왜 안 느나: 날마다 출생 · 죽음 · 떠남 · 행복 항 · 출생 문 · 하한(텃밭) — econ `tickVillage` 곁 ===========
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1230-observe.js" node scripts/t577-server-run.js 800 1020   (판 JSON 곁 `<판>-<시드>.t1230.json`)
//   랩 자:      T1230_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1230-observe.js" node scripts/t176-ab.js 800 1020
//   날마다(세계 합): 인구 · 출생(그날 새로 선 사람 — `tickVillage` 앞에 없던 몸) · 죽음(`_deadTot` 차) · 떠남(`_emigTot` 차) ·
//     dP 항 합(`_dpDebug` — logi · hunger · health · happy · prestige · 마지막 dP) · 문(주거 `gated` · 곳간 `_t1149Gate`) ·
//     행복(사람 가중 h · 좋은 것 G · 사치품 · 겪은 일 E · 붐빔 부담 B) · 하한이 넣은 양(`_t100FloorTot` 차) · 먹은 식량(`_consDay.food` — 그날 틱 앞의 어제 값)
//   출생 0 인 마을-날의 까닭(앞에서부터 하나): 주거 문 · 곳간 문 · K(logi ≤ 0) · 행복(다른 항 합 > 0 인데 행복 항이 0 밑으로) · 그 밖(분수 누적 중 · 자리 없음 · 상한)
//   50날마다: 직업별 사람 수 합.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1230_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1230.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'vil', 'pop', 'born', 'dead', 'emig', 'logi', 'hunger', 'health', 'happy', 'prestige', 'dP', 'gHouse', 'gGran', 'hW', 'GW', 'luxW', 'EW', 'BW', 'floor', 'eat',
  'zHouse', 'zGran', 'zK', 'zH', 'zOther',
  'pxN', 'pxPop', 'pxWoodW', 'pxFoodW', 'woodSt', 'lumber', 'farmer', 'houseDef', 'fieldFood'], rows: [], jobs: [], err: null };
//   ★[T1234] 덧붙인 칸: 시세(그날 세계 공급 캐시가 이미 선 마을만 — 관찰기가 캐시를 먼저 세우지 않는다 · `pxN` = 잰 마을 수 · 사람 가중 목재 · 식량 값) ·
//     곳간 목재 · 나무꾼 · 농부 · 침상 모자람(Σ max(0, 사람 − min(주거, 지도 침상))) · 밭 식량(econ `_t368FoodTot` 차)
let V2 = null; try { V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')); } catch (e) { V2 = null; }
let cur = null;
const seen = new WeakSet();
function flush() { if (cur) { const r = cur; rec.rows.push(rec.cols.map((k) => (typeof r[k] === 'number' ? +r[k].toFixed(4) : r[k]))); } }
let lastWrite = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let pre = null;
  try {
    if (!cur || cur.day !== day) {
      flush();
      cur = { day }; for (const k of rec.cols) if (k !== 'day') cur[k] = 0;
      if (day % 50 === 0 && v._world && v._world.villages) {
        const j = {}; for (const w of v._world.villages) for (const k of Object.keys(w.counts || {})) j[k] = (j[k] || 0) + (w.counts[k] | 0);
        rec.jobs.push([day, j]);
      }
      if (day % 50 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }   // 50날마다(가상 시계 판은 `Date.now` 가 econ 날에 묶여 벽시계 간격이 안 선다)
    }
    for (const n of (v.npcs || [])) seen.add(n);
    pre = { dead: v._deadTot || 0, emig: v._emigTot || 0, floor: v._t100FloorTot || 0, eat: (v._consDay && v._consDay.food) || 0, ff: +v._t368FoodTot || 0 };
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const ret = _t.apply(this, arguments);
  try {
    const N = (v.npcs || []).length; if (!pre) return ret;
    let born = 0; for (const n of (v.npcs || [])) if (!seen.has(n)) { born++; seen.add(n); }
    const c = cur, g = v._dpDebug || {}, s = v.lastStats || {};
    if (N > 0) c.vil++;
    c.pop += N; c.born += born; c.dead += (v._deadTot || 0) - pre.dead; c.emig += (v._emigTot || 0) - pre.emig;
    c.floor += (v._t100FloorTot || 0) - pre.floor; c.eat += pre.eat;
    for (const k of ['logi', 'hunger', 'health', 'happy', 'prestige', 'dP']) c[k] += +g[k] || 0;
    if (g.gated) c.gHouse++; if (v._t1149Gate) c.gGran++;
    if (N > 0) {
      c.hW += (+s.happiness || 0) * N; c.GW += (+s.happinessGoods || 0) * N; c.luxW += (+s.happinessLux || 0) * N;
      c.EW += (+v._t1134E || 0) * N; c.BW += (+s.happinessBurden || 0) * N;
      if (born === 0) {
        if (g.gated) c.zHouse++;
        else if (v._t1149Gate) c.zGran++;
        else if ((+g.logi || 0) <= 0) c.zK++;
        else if ((+g.happy || 0) < 0 && (+g.logi || 0) + (+g.hunger || 0) + (+g.health || 0) + (+g.prestige || 0) > 0 && (+g.dP || 0) <= 0) c.zH++;
        else c.zOther++;
      }
      c.woodSt += (v.storage && v.storage.wood) || 0; c.lumber += (v.counts && v.counts.lumberjack) | 0; c.farmer += (v.counts && v.counts.farmer) | 0;
      const cap = Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity);
      if (cap !== Infinity) c.houseDef += Math.max(0, N - cap);
      c.fieldFood += (+v._t368FoodTot || 0) - pre.ff;
      const W = v._world, dc = W && W._effDemCache;
      if (V2 && V2.computeShadowPrices && dc && dc.day === W.day) {
        const px = V2.computeShadowPrices(v); c.pxN++; c.pxPop += N; c.pxWoodW += (+px.wood || 0) * N; c.pxFoodW += (+px.food || 0) * N;
      }
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
