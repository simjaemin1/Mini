'use strict';
// (@regress 없음 — 러너 밖 · T918 탐침 · 제품 0 · 읽기만)
// === scripts/t918-ore-probe.js — 서버 판 자(`t577-server-run.js` · `server-baseline-check.js`) 곁 프리로드 ==========
//
// ★왜 [T855 → T918] 기준선 시드 42 가 바쁜 고리 옆 판에서만 날 375 광산6 광석 한 칸이 갈린다 — 첫 다른 쓰기 = 광부 둘의 광석 산출 ×1.003186
//   = `addProduce` 의 `satMul('ore')`(광석 그림자 가격 · `world.priceFn` = `computeShadowPrices`). 그 가격 입력을 날마다 뜬다.
//
// 뜨는 것(날 T918_FROM~T918_TO · 기본 369~376 · 마을 T918_VIL · 기본 광산6):
//   calls — 그 마을의 `world.priceFn` 부름 하나마다 [world.day · 그날 몇째 부름 · 부른 자리(스택 위 econ 함수 셋) · 벽시계(판 시작부터 ms)
//           · 값(ore · copper · tin · iron · charcoal) · 세계 유효수요 캐시(그날 · ore 재고 · 인구 · 만든 마을 · 만든 순서)]
//   scans — 장부 하루 끝(`scanDay`)마다 그 마을의 가격 입력 원문: 곳간 전 칸 · counts · 인구 · `_consEMA` · `dailyProductionBuf` · `surplusEMA`
//           · `_oreMixEff` · `land.oreMix` · `land.ore` · `priceBase.ore`
//   effBuilds — 세계 유효수요 캐시(`world._effDemCache`)가 새로 서는 순간마다 [world.day · 캐시 날 · 그때 부른 마을 · 벽시계 · ore 재고 · 인구]
//   ⇒ `<판>.t918.json`
//
// 쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t918-ore-probe.js" node scripts/server-baseline-check.js 계측/서버기준선_<날>.json --seeds 42 --days 400
if (!process.env.T577_OUT) return;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const VIL = process.env.T918_VIL || '광산6';
const FROM = +(process.env.T918_FROM || 369), TO = +(process.env.T918_TO || 376);
const T0 = Date.now();
const out = { vil: VIL, from: FROM, to: TO, calls: [], scans: [], effBuilds: [] };
const site = () => (new Error().stack || '').split('\n').slice(3, 9)
  .map((l) => { const m = l.match(/at (?:(\S+) )?\(?(.*?):(\d+):\d+\)?$/); return m ? (m[1] || '?') + '@' + path.basename(m[2]) + ':' + m[3] : ''; })
  .filter((s) => s && !s.includes('t918-ore-probe')).slice(0, 3).join(' < ');
const R = (x) => (typeof x === 'number' ? +x.toPrecision(15) : x);
const pick = (o) => { if (!o || typeof o !== 'object') return o; const r = {}; for (const k of Object.keys(o).sort()) r[k] = R(o[k]); return r; };
let hooked = false, callN = 0, callDay = -1, lastVil = null, effSeq = 0;
function hook(world) {
  hooked = true;
  const pf = world.priceFn;
  if (typeof pf === 'function') {
    world.priceFn = function (v) {
      lastVil = v && v.name;
      const r = pf.apply(this, arguments);
      try {
        const d = world.day | 0;
        if (v && v.name === VIL && d >= FROM && d <= TO) {
          if (d !== callDay) { callDay = d; callN = 0; }
          const c = world._effDemCache;
          out.calls.push([d, ++callN, site(), Date.now() - T0, r ? { ore: R(r.ore), copper: R(r.copper), tin: R(r.tin), iron: R(r.iron), charcoal: R(r.charcoal) } : null,
            c ? [c.day, R(c.stock && c.stock.ore), c.pop, c._t918By || null, c._t918Seq || 0] : null]);
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return r;
    };
  }
  let cur = world._effDemCache;
  Object.defineProperty(world, '_effDemCache', { configurable: true, enumerable: true, get() { return cur; }, set(x) {
    cur = x;
    try {
      const d = world.day | 0;
      if (x && typeof x === 'object' && d >= FROM && d <= TO) {
        //   만든 마을 · 차례는 캐시 칸이 다 찬 **뒤** 적는다(세우는 함수가 같은 객체를 채운다) — 값은 다음 부름 때 읽는다
        Object.defineProperty(x, '_t918By', { value: lastVil, enumerable: false });
        Object.defineProperty(x, '_t918Seq', { value: ++effSeq, enumerable: false });
        out.effBuilds.push([d, x.day, lastVil, Date.now() - T0, site()]);
      }
    } catch (e) {}
  } });
}
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      if (!hooked && world) hook(world);
      const d = day | 0;
      if (d >= FROM && d <= TO) {
        const v = (world.villages || []).find((q) => q.name === VIL);
        if (v) out.scans.push([d, Date.now() - T0, {
          storage: pick(v.storage), counts: pick(v.counts), pop: (v.npcs || []).length, consEMA: pick(v._consEMA), dpb: pick(v.dailyProductionBuf),
          surplusEMA: pick(v.surplusEMA), oreMixEff: pick(v._oreMixEff), oreMix: pick(v.land && v.land.oreMix), landOre: v.land && v.land.ore,
          priceBaseOre: world.priceBase && world.priceBase.ore,
        }]);
      }
    } catch (e) {}
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(process.env.T577_OUT + '.t918.json', JSON.stringify(out)); } catch (e) {} });
