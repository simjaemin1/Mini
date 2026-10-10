// (@regress 없음 — 러너 밖 · T683 계측기 · 제품 무변)
// === scripts/t683-seed-probe.js — 시딩 통나무가 **어느 문으로** 나가나 · 흐름 EMA · 통나무 0 마을 관찰자(세 자 공용) ==========
//   쓰는 법(아이 프로세스가 env 를 물려받는다 — 켜는 env 가 있을 때만 붙는다):
//     · 두 자(t17 · t176 — 같은 프로세스가 `econV2.tickWorldV2(world)` 를 날마다 부른다):
//         T683_PROBE_OUT=<파일> NODE_OPTIONS="--require <이 파일>" node scripts/t17-metrics.js 800 1020
//     · 서버 판(T650 자 · `t577-server-run.js` 의 아이 존 — `T577_OUT` 이 선 쪽만):
//         NODE_OPTIONS="--require <이 파일>" T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_DIR=<dir> node scripts/t577-server-run.js 400 1020
//         ⇒ 판마다 `<T577_OUT>.t683.json`(판 JSON 옆) · 부모(자 본체)는 `T577_OUT` 이 없어 아무것도 안 한다.
//   ★미리 적재하지 않는다 — 자가 econ 모듈을 처음 부를 때(`Module._load`) 그 모듈 객체를 감싼다. 그래서 어느 작업 트리의 자에
//     붙여도 그 트리의 모듈을 본다(경로를 안 쓴다) · 자가 env 를 세우고 부르는 차례도 그대로다.
//   ★잰다(마을마다 · econ 하루마다 한 번 — 두 자는 `tickWorldV2` 뒤 · 서버는 하루 마감 장부 `scanDay` 앞 · 같은 날 두 번 안 적는다):
//     · 시딩 곳간 — `createVillage` 가 돌려준 마을의 통나무(그 순간 · 첫 틱 전 · 이름으로 잇는다)
//     · n = `npcs.length` · 곳간 통나무 · 흐름 EMA(`_consEMA.wood`)
//     · 문 ① 발주(출발 화물) — 그날 새로 선 econ 캐러밴(`world.caravans` 의 `id` 가 지난번 최대보다 큰 것)의 통나무
//       (`giveRes`/`giveAmt` · 둘째 화물 `giveRes2`/`giveAmt2`) — **출발일**에 곳간에서 빠진 그 양(`tickTradeV2` 차감 자리)
//     · 문 ② 귀환 화물로 되사 감 — `world.tradeLog` 새 줄의 `bought.res === 'wood'`(받은 마을 `to` 곳간에서 나감 · 도착일 기록)
//     · 들어옴 — 새 줄의 `sent`(빈손 귀환 `abandoned` 는 뺀다 — 제 곳간으로 돌아온 것) · 그 마을 캐러밴이 되사 온 `bought`
//     · (서버 판만) 통나무 · 식량 그림자가격 — `world.priceFn`(v2 `computeShadowPrices`)을 **부르기만**(세계 캐시 `_effDemCache` 되돌림 · T659 관찰자 그 문)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고, 읽기만 한다. 파일은 `exit` 에서 쓴다.
//   ★통나무 0 마을(곳간 < 1 — T581 `wood0` · T659 그 문) · 첫 30일 수출 몫 · 표는 `scripts/t683-seed-table.js` 가 센다.
'use strict';
const LAB_OUT = process.env.T683_PROBE_OUT || '';
const SRV_OUT = (!LAB_OUT && process.env.T577_OUT) ? process.env.T577_OUT + '.t683.json' : '';
const OUT = LAB_OUT || SRV_OUT;
if (OUT) {
  const fs = require('fs');
  const Module = require('module');
  const PRICES = !!SRV_OUT;
  let V1 = null, V2 = null, EV = null;
  let names = null, last = null, maxCid = 0, lastRow = null;
  const seed = Object.create(null);
  const days = [];
  const S = [];
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const prices = (world, v) => {
    if (!PRICES || !world || typeof world.priceFn !== 'function') return null;
    const had = Object.prototype.hasOwnProperty.call(world, '_effDemCache'), c0 = world._effDemCache;
    try { return world.priceFn(v); } catch (e) { return null; } finally { if (had) world._effDemCache = c0; else delete world._effDemCache; }
  };
  const record = (world) => {
    try {
      const d = world && world.day;
      if (!Number.isFinite(d) || d === last) return;
      last = d;
      const V = world.villages || [];
      if (!names) { names = V.map((v) => v.name); for (let i = 0; i < V.length; i++) S.push({ n: [], wood: [], ema: [], exS: [], exB: [], imS: [], imB: [], pw: [], pf: [] }); }
      days.push(d);
      const idx = new Map(names.map((nm, k) => [nm, k]));
      const z = () => new Array(names.length).fill(0);
      const exS = z(), exB = z(), imS = z(), imB = z();
      // 문 ① — 그날 선 캐러밴(출발 화물)
      const C = Array.isArray(world.caravans) ? world.caravans : [];
      let mx = maxCid;
      for (const c of C) {
        if (!c || !(c.id > maxCid)) continue;
        if (c.id > mx) mx = c.id;
        const a = c.from ? idx.get(c.from.name) : undefined;
        if (a == null) continue;
        if (c.giveRes === 'wood' && c.giveAmt > 0) exS[a] += c.giveAmt;
        if (c.giveRes2 === 'wood' && c.giveAmt2 > 0) exS[a] += c.giveAmt2;
      }
      maxCid = mx;
      // 문 ② · 들어옴 — tradeLog 새 줄(앞을 잘라내도 — 5,000 줄 상한 — 지난번 마지막 줄을 뒤에서 찾는다)
      const TL = Array.isArray(world.tradeLog) ? world.tradeLog : [];
      let from = 0; if (lastRow) { const j = TL.lastIndexOf(lastRow); from = j >= 0 ? j + 1 : 0; }
      for (let j = from; j < TL.length; j++) {
        const t = TL[j], a = idx.get(t.from), b = idx.get(t.to);
        if (t.bought && t.bought.res === 'wood' && t.bought.amt > 0) { if (b != null) exB[b] += t.bought.amt; if (a != null) imB[a] += t.bought.amt; }
        if (!t.abandoned && t.sent && t.sent.res === 'wood' && t.sent.amt > 0 && b != null) imS[b] += t.sent.amt;
      }
      if (TL.length) lastRow = TL[TL.length - 1];
      for (let i = 0; i < V.length && i < S.length; i++) {
        const v = V[i], st = v.storage || {}, P = prices(world, v);
        S[i].n.push((v.npcs || []).length);
        S[i].wood.push(r3(st.wood || 0));
        S[i].ema.push(r3(((v._consEMA || {}).wood) || 0));
        S[i].exS.push(r3(exS[i])); S[i].exB.push(r3(exB[i])); S[i].imS.push(r3(imS[i])); S[i].imB.push(r3(imB[i]));
        if (PRICES) { S[i].pw.push(P ? r3(P.wood) : null); S[i].pf.push(P ? r3(P.food) : null); }
      }
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
  };
  // 자가 모듈을 처음 부를 때 감싼다(모양으로 알아본다 — 경로 무관)
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !V1 && typeof m.createVillage === 'function' && typeof m.tickVillage === 'function') {
        V1 = m;
        const cv = m.createVillage;   // 시딩 곳간 — 마을이 서는 그 순간의 통나무(이름 → 양 · 하루 틱 전)
        m.createVillage = function () { const v = cv.apply(this, arguments); try { if (v && v.name != null) seed[v.name] = r3((v.storage && v.storage.wood) || 0); } catch (e) {} return v; };
      }
      if (m && !V2 && typeof m.tickWorldV2 === 'function' && typeof m.computeShadowPrices === 'function') {
        V2 = m;
        if (LAB_OUT) { const tw = m.tickWorldV2; m.tickWorldV2 = function (world) { const r = tw.apply(this, arguments); record(world); return r; }; }
      }
      if (m && !EV && SRV_OUT && typeof m.createLedger === 'function') {
        EV = m;
        const mk = m.createLedger;
        m.createLedger = function () {
          const L = mk.apply(this, arguments);
          const sd = L.scanDay;
          L.scanDay = function (world) { record(world); return sd.apply(this, arguments); };
          return L;
        };
      }
    } catch (e) { /* 감싸기 실패도 세계에 아무것도 안 한다 */ }
    return m;
  };
  process.on('exit', () => {
    try {
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { T683_EMA_INIT: V1 && V1.T683_EMA_INIT, T683_EXPORT_FLOW: V2 && V2.T683_EXPORT_FLOW, T659_WOOD_FLOW: V2 && V2.T659_WOOD_FLOW },
        subsWood: V2 && V2.SUBSISTENCE_PER_NPC && V2.SUBSISTENCE_PER_NPC.wood, firewoodPc: V1 && V1.FIREWOOD_PC, prices: PRICES, names, seed: names ? names.map((nm) => (nm in seed ? seed[nm] : null)) : null, days, v: S }));
    } catch (e) {}
  });
}
