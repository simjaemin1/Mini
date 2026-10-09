// (@regress 없음 — 러너 밖 · T659 계측기 · 제품 무변)
// === scripts/t659-wood-probe.js — 서버 판 자(`t577-server-run.js`)에 얹는 **통나무 닻 · 흐름 · 값** 관찰자 ==========
//   쓰는 법(서버 판 자의 아이 존이 env 를 물려받는다 — 자식에게만 켜진다 · t634-collapse-probe 그 문법):
//     NODE_OPTIONS="--require $PWD/scripts/t659-wood-probe.js" T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_DIR=<dir> \
//       [T659_WOOD_FLOW=1] node scripts/t577-server-run.js 400 1020,7,42
//     ⇒ 판마다 `<T577_OUT>.t659.json`(판 JSON 옆) · 부모(자 본체)에선 `T577_OUT` 이 없어 아무것도 안 한다.
//   ★잰다(마을마다 · 하루 마감마다 — 서버 장부 `Events.createLedger().scanDay(world, day)` 가 받는 그 world):
//     · n = `npcs.length` · 곳간 통나무 · 하루 소비 EMA(`_consEMA.wood` — v2 가 `flowT = EMA × 30` 으로 읽는 그 값)
//     · 통나무 · 식량 그림자가격 — econ 정본 `world.priceFn`(= v2 `computeShadowPrices`)을 **부르기만**
//       (그날 세계 캐시 `_effDemCache` 는 부르기 전 것으로 되돌린다 — T581 `woodPrice` 그 문법 · 세계에 0)
//     · 기근 = `_dpDebug.hunger < 0`(t634 · `villages.villageFamine` 그 부호)
//     · 그날 통나무 소비 원값(`_consDay.wood` — 하루 마감 때 남은 그날 몫 · 다음 날 첫머리에 EMA 로 접힌다) · 그날 생산(`dailyProductionBuf.wood`)
//     · 나무꾼 수(`counts.lumberjack`) · 그날 통나무 교역(econ `world.tradeLog` 새 줄 — 보낸 통나무 `sent` · 되사 온 통나무 `bought`:
//       나감 = 보낸 쪽의 sent + 받은 쪽에서 되사 간 bought · 들어옴 = 받은 쪽의 sent + 보낸 쪽이 되사 온 bought — 도착 기록 날짜 기준)
//   ★닻(`SUBSISTENCE_PER_NPC.wood × n × 30`)·비·통나무 0 마을(곳간 < 1 — T581 `wood0` 그 문)은 표 기계(`t659-wood-anchor.js`)가 센다.
//   ★관찰만 한다 — 장부 함수를 감싸 같은 인수를 그대로 넘긴다. 그날 줄은 원래 함수를 부르기 **전에** 적고 파일은 `exit` 에서 쓴다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const OUT = OUT0 + '.t659.json';
  let names = null, last = -1;
  const days = [];
  const S = [];   // 마을마다 { n:[], wood:[], ema:[], pw:[], pf:[], fam:[], cons:[], prod:[], lj:[], tin:[], tout:[] }
  let lastRow = null;   // tradeLog 에서 지난번 본 마지막 줄(참조) — 앞을 잘라내도(5,000 줄 상한) 뒤에서 찾는다
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const prices = (world, v) => {
    if (!world || typeof world.priceFn !== 'function') return null;
    const had = Object.prototype.hasOwnProperty.call(world, '_effDemCache'), c0 = world._effDemCache;
    try { return world.priceFn(v); } catch (e) { return null; } finally { if (had) world._effDemCache = c0; else delete world._effDemCache; }
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const V = world.villages || [];
          if (!names) { names = V.map((v) => v.name); for (let i = 0; i < V.length; i++) S.push({ n: [], wood: [], ema: [], pw: [], pf: [], fam: [], cons: [], prod: [], lj: [], tin: [], tout: [] }); }
          days.push(d);
          const idx = new Map(names.map((nm, k) => [nm, k])), tin = new Array(names.length).fill(0), tout = new Array(names.length).fill(0);
          const TL = Array.isArray(world.tradeLog) ? world.tradeLog : [];
          let from = 0; if (lastRow) { const j = TL.lastIndexOf(lastRow); from = j >= 0 ? j + 1 : 0; }
          for (let j = from; j < TL.length; j++) {
            const t = TL[j], a = idx.get(t.from), b = idx.get(t.to);
            if (t.sent && t.sent.res === 'wood' && t.sent.amt > 0) { if (a != null) tout[a] += t.sent.amt; if (b != null) tin[b] += t.sent.amt; }
            if (t.bought && t.bought.res === 'wood' && t.bought.amt > 0) { if (b != null) tout[b] += t.bought.amt; if (a != null) tin[a] += t.bought.amt; }
          }
          if (TL.length) lastRow = TL[TL.length - 1];
          for (let i = 0; i < V.length && i < S.length; i++) {
            const v = V[i], st = v.storage || {}, P = prices(world, v), dbg = v._dpDebug;
            S[i].n.push((v.npcs || []).length);
            S[i].wood.push(r3(st.wood || 0));
            S[i].ema.push(r3(((v._consEMA || {}).wood) || 0));
            S[i].pw.push(P ? r3(P.wood) : null);
            S[i].pf.push(P ? r3(P.food) : null);
            S[i].fam.push(dbg && Number.isFinite(dbg.hunger) && dbg.hunger < 0 ? 1 : 0);
            S[i].cons.push(r3(((v._consDay || {}).wood) || 0));
            S[i].prod.push(r3(((v.dailyProductionBuf || {}).wood) || 0));
            S[i].lj.push((v.counts && v.counts.lumberjack) || 0);
            S[i].tin.push(r3(tin[i])); S[i].tout.push(r3(tout[i]));
          }
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => {
    try {
      const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
      fs.writeFileSync(OUT, JSON.stringify({ T659_WOOD_FLOW: V2.T659_WOOD_FLOW, subsWood: V2.SUBSISTENCE_PER_NPC.wood, names, days, v: S }));
    } catch (e) {}
  });
}
