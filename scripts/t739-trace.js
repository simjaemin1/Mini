// === scripts/t739-trace.js — T739 하루 장부 훅(계측 · 읽기만 · 제품 무접촉) ===============================
//
// ★왜 [T739 ① ③] T726 켬이 인구를 18 % 깎는 고리를 날마다 따라가려면, 하루의 각 문(장 정산 · 마을 하루 · 자급 · 부패 ·
//   교역 출발 · 캐러밴 · 꼬리)에서 곳간이 얼마나 움직였는지와 인구 식의 항(로지스틱 · 굶주림 · 건강 · 행복 · 위신 · 집 문)을
//   같이 적어야 한다. 엔진은 그 장부를 따로 갖고 있지 않다 — 그래서 **바깥에서 문 사이 곳간을 찍는다**(값 0 · 차례 0).
//
// 어떻게(세계에 쓰는 것 0):
//   · `econV2.tickWorldV2` 를 같은 몸통으로 다시 부른다 — `tickWorldV2Parts(world)` 의 head → village(마을마다) → trade →
//     caravans → tail(제품 `tickWorldV2` 와 같은 차례 · 같은 함수). 문 사이에서 곳간만 읽는다.
//   · `v1.tickVillage` · `v1.adjustGuildTax` 는 v2 가 모듈 속성으로 부른다 ⇒ 감싸서 앞뒤 곳간 · 오늘 산출(`dailyProductionBuf`) ·
//     오늘 먹은 것(`_foodEaten`)을 읽는다. 자급(`tickSubsistence`)은 그 함수의 식(min(N × 1인 몫, 곳간) · 무기·갑옷 마모)을
//     자급 표(`SUBSISTENCE_PER_NPC` — 내보낸 정본)로 되짚고, 부패 = 마을 문 끝 곳간과의 나머지다.
//   · 날 끝에 마을마다 인구 식의 항(`_dpDebug`) · K 분해(`_kDbg`) · 확장 · 금고 · 곳간 몇 품목을 적는다.
//   · 갈림 지문(마을 × 날): 곳간 전부 · 먹은 것 · 그날 띄운 캐러밴 · 인구 식 dP · 인구 — 그리고 날 1~120 과 그 뒤 10일마다
//     그림자가격(`computeShadowPrices` — 날 끝 · 그날 유효수요 캐시를 그대로 읽는다).
//   검산: 훅 판의 t17 JSON = 훅 없는 판(보고 §2).
//
// 쓰는 법: NODE_OPTIONS="--require <레포>/scripts/t739-trace.js" T739_TRACE_OUT=/tmp/x.json node scripts/t17-metrics.js 800 1020
//   자리 갈래와 같이: NODE_OPTIONS="--require <레포>/scripts/t739-arms.js --require <레포>/scripts/t739-trace.js"(차례 그대로)
'use strict';
const OUT = process.env.T739_TRACE_OUT || '';
if (OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const v2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const v1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const SUBS = v2.SUBSISTENCE_PER_NPC;
  const G = ['wheat', 'rice', 'barley', 'millet', 'food', 'fish', 'meat', 'cooked_food', 'dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg',
    'fruit', 'vegetable', 'mushroom', 'herb', 'wood', 'stone', 'tool', 'weapon', 'armor', 'clothes', 'hide', 'leather', 'fur', 'hemp', 'bone', 'ore', 'charcoal', 'salt'];
  const VG = ['food', 'wheat', 'rice', 'barley', 'fish', 'meat', 'wood', 'stone', 'tool', 'weapon', 'clothes', 'herb', 'hide'];
  const PG = ['food', 'wheat', 'wood', 'stone', 'tool', 'weapon', 'clothes', 'herb', 'fish', 'meat'];
  const PH = ['H', 'V1', 'GT', 'SUB', 'DEC', 'TR', 'CA', 'TL'];
  const r6 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toPrecision(6) : (x == null ? null : x);
  const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const stHash = (o) => { const ks = Object.keys(o).filter((k) => typeof o[k] === 'number' && o[k] !== 0).sort(); let s = ''; for (const k of ks) s += k + ':' + o[k].toPrecision(15) + ';'; return fnv(s); };
  const snap = (v) => { const st = v.storage || {}; const a = new Float64Array(G.length); for (let i = 0; i < G.length; i++) a[i] = st[G[i]] || 0; return a; };
  const T = { meta: { sites: process.env.T739_SITES || '', knob: process.env.T726_ONE_TARGET || '', G, VG, PG, PH, names: null }, day: [], vday: [], vprice: {}, fp: [], vcum: null };
  let W = null, names = null, dayRec = null, vi = -1, inVillage = false;
  const seen = new WeakSet();
  const addPh = (ph, vIdx, a, b) => { const P = dayRec.ph[ph], C = T.vcum[vIdx][ph]; for (let i = 0; i < G.length; i++) { const d = b[i] - a[i]; if (d !== 0) { P[i] += d; C[i] += d; } } };
  // v1 마을 하루 · 길드 세 — 감싸서 앞뒤만 읽는다
  const _tv = v1.tickVillage, _gt = v1.adjustGuildTax;
  let s0 = null, s1 = null, s2 = null;
  v1.tickVillage = function (v) {
    const before = inVillage ? snap(v) : null;
    const r = _tv.apply(this, arguments);
    if (inVillage && before) {
      s1 = snap(v); addPh('V1', vi, before, s1);
      const dp = v.dailyProductionBuf || {}, eat = v._foodEaten || {};
      for (let i = 0; i < G.length; i++) { const g = G[i]; if (dp[g]) dayRec.prod[i] += dp[g]; if (eat[g]) dayRec.eat[i] += eat[g]; }
      dayRec._eatFp[vi] = stHash(eat);
    }
    return r;
  };
  v1.adjustGuildTax = function (v) {
    const r = _gt.apply(this, arguments);
    if (inVillage && s1) { s2 = snap(v); addPh('GT', vi, s1, s2); }
    return r;
  };
  const _tick = v2.tickWorldV2;
  v2.tickWorldV2 = function (world) {
    W = world;
    if (!names) { names = world.villages.map((v) => v.name); T.meta.names = names; T.vcum = names.map(() => { const o = {}; for (const p of PH) o[p] = new Float64Array(G.length); return o; }); T.vday = names.map(() => []); }
    const grow = () => { while (T.vday.length < world.villages.length) { const v = world.villages[T.vday.length]; names.push(v.name);
      const o = {}; for (const p of PH) o[p] = new Float64Array(G.length); T.vcum.push(o); T.vday.push([]); T.meta.grew = (T.meta.grew || 0) + 1; } };
    let n = world.villages.length;
    dayRec = { ph: {}, prod: new Float64Array(G.length), eat: new Float64Array(G.length), legs: 0, legRes: {}, _eatFp: [], _car: [] };
    for (const p of PH) dayRec.ph[p] = new Float64Array(G.length);
    const P = v2.tickWorldV2Parts(world);
    let pre = world.villages.map(snap);
    P.head();
    grow(); n = world.villages.length;   // 제품 몸통은 head 뒤의 마을 배열을 그대로 돈다(머릿수가 바뀌면 그 배열)
    for (let k = 0; k < n; k++) { dayRec._eatFp[k] = ''; dayRec._car[k] = ''; }
    let post = world.villages.map(snap);
    for (let k = 0; k < Math.min(pre.length, n); k++) addPh('H', k, pre[k], post[k]);
    for (const v of world.villages) {
      const k = world.villages.indexOf(v);
      vi = k; inVillage = true; s1 = null; s2 = null;
      P.village(v);
      inVillage = false;
      const s3 = snap(v);
      if (s2) {
        // 자급 되짚기(tickSubsistence 의 식 — 식량은 v1 이 이미 먹었다) · 무기 · 갑옷 마모 · 부패 = 나머지
        const N = v.npcs.length, sub = new Float64Array(G.length);
        for (let i = 0; i < G.length; i++) { const g = G[i]; if (g === 'food' || !SUBS[g]) continue; sub[i] = -Math.min(N * SUBS[g], s2[i]); }
        const warN = (v.counts && v.counts.warrior) || 0, huntN = (v.counts && v.counts.hunter) || 0;
        const iw = G.indexOf('weapon'), ia = G.indexOf('armor');
        sub[iw] = -Math.min((warN + huntN * 0.5) * 0.01, s2[iw]); sub[ia] = -Math.min(warN * 0.01, s2[ia]);
        const s2b = new Float64Array(G.length); for (let i = 0; i < G.length; i++) s2b[i] = s2[i] + sub[i];
        addPh('SUB', k, s2, s2b); addPh('DEC', k, s2b, s3);
      }
    }
    pre = world.villages.map(snap); P.trade(); grow(); post = world.villages.map(snap);
    for (let k = 0; k < Math.min(pre.length, post.length); k++) addPh('TR', k, pre[k], post[k]);
    // 그날 띄운 캐러밴(출발 문이 막 넣은 것 — 떠난 날 밤엔 반드시 길 위)
    const idx = new Map(world.villages.map((v, k) => [v, k]));
    for (const c of (world.caravans || [])) if (c && typeof c === 'object' && !seen.has(c)) {
      seen.add(c); dayRec.legs++;
      dayRec.legRes[c.giveRes] = (dayRec.legRes[c.giveRes] || 0) + 1;
      const k = idx.get(c.from); if (k != null) dayRec._car[k] += `${c.giveRes}:${c.giveAmt}${c.giveRes2 ? ',' + c.giveRes2 + ':' + c.giveAmt2 : ''}|`;
    }
    pre = world.villages.map(snap); P.caravans(); grow(); post = world.villages.map(snap);
    for (let k = 0; k < Math.min(pre.length, post.length); k++) addPh('CA', k, pre[k], post[k]);
    pre = world.villages.map(snap); P.tail(); grow(); post = world.villages.map(snap);
    for (let k = 0; k < Math.min(pre.length, post.length); k++) addPh('TL', k, pre[k], post[k]);
    n = world.villages.length;
    // 날 끝 — 마을 줄 · 지문
    const D = world.day | 0;
    const wantPrice = D <= 120 || D % 10 === 0;
    const fpDay = [];
    const prDay = wantPrice ? [] : null;
    let pop = 0;
    for (let k = 0; k < n; k++) {
      const v = world.villages[k], N = (v.npcs || []).length; pop += N;
      const dp = v._dpDebug || {}, kd = v._kDbg || {};
      let feq = null; try { feq = v1.totalFoodEquivalent ? v1.totalFoodEquivalent(v) : null; } catch (e) {}
      const row = [N, dp.K, dp.logi, dp.hunger, dp.health, dp.happy, dp.prestige, dp.housing, dp.gated ? 1 : 0, dp.dP, kd.slot, kd.prod, kd.fuel,
        v.expansions || 0, v.land ? v.land.size : null, v.treasury ? v.treasury._cash : null, feq].map(r6);
      for (const g of VG) row.push(r6((v.storage || {})[g] || 0));
      T.vday[k].push(row);
      let prh = '';
      if (wantPrice) { const p = v2.computeShadowPrices(v); prh = stHash(p); prDay.push(PG.map((g) => r6(p[g]))); }
      fpDay.push([stHash(v.storage || {}), prh, dayRec._car[k], dayRec._eatFp[k], dp.dP != null ? String(dp.dP) : '', String(N)]);
    }
    if (wantPrice) T.vprice[D] = prDay;
    T.fp.push(fpDay);
    const ph = {}; for (const p of PH) ph[p] = Array.from(dayRec.ph[p], r6);
    T.day.push({ d: D, pop, ph, prod: Array.from(dayRec.prod, r6), eat: Array.from(dayRec.eat, r6), legs: dayRec.legs, legRes: dayRec.legRes });
    return undefined;   // 제품 tickWorldV2 는 값을 안 돌려준다
  };
  void _tick;
  process.on('exit', () => {
    try {
      const vcum = T.vcum ? T.vcum.map((o) => { const r = {}; for (const p of PH) r[p] = Array.from(o[p], r6); return r; }) : null;
      fs.writeFileSync(OUT, JSON.stringify(Object.assign({}, T, { vcum })));
    } catch (e) { process.stderr.write('[t739-trace] 쓰기 실패 ' + e.message + '\n'); }
  });
}
