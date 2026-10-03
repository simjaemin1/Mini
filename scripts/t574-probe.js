// (러너 밖 · T574 ③ 자 — 적재 순간 덧붙임 · 동작 0)
// =============================================================================
// `node -r ./scripts/t574-probe.js scripts/t17-metrics.js …` · `… scripts/t525-cross-zone.js two …`(워커도 같은 -r 을 물려받는다)
//   econ 하루 틱(`economy-sim-v2.tickWorldV2`) 뒤에 **읽기만** 한다 — 세계를 한 칸도 안 바꾼다(값표 캐시를 읽고 장부를 센다):
//   ⓐ 값 폭주 — 품목마다 마을 값표(`v._priceCache` — 교역이 쓰는 그 캐시)를 기준값(값표가 쓰는 `BASE_VALUE_V2[r] || 1` — 소스 표를 읽는다)
//      으로 나눈 비가 ×3 을 넘는 날 수(존 가운데 값 기준) · 마을·날 몫
//   ⓑ 흐름 — 교역 장부(`world.tradeLog`)를 품목별로 합한다: 존 안 / 존을 넘은 행(`xzone`) · 보냄·받음
//   ⓒ 인구 — 50일마다 존 인구(1인당 성장의 분모·분자)
//   출력: `${T574_PROBE_OUT}.${존}.json`(100일마다 · 마지막 날 덮어씀). 손잡이 없으면 아무것도 안 한다.
// =============================================================================
'use strict';
const OUT = process.env.T574_PROBE_OUT;
if (OUT) {
  const path = require('path'), fs = require('fs');
  // ⚠모듈은 **돌리는 레포**(cwd = 그 판의 작업 트리)에서 싣는다 — 이 파일이 다른 트리에 있어도 그 판의 econ 을 감싸야 한다
  const ROOT = process.cwd();
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const ZONE = process.env.T17_ZONE && !String(process.env.T17_ZONE).includes('+') ? process.env.T17_ZONE : 'hanbando';
  const DAYS = parseInt(process.argv[2], 10) || 800;
  const st = { zone: ZONE, days: 0, base: {}, over3Days: {}, over3VD: {}, vd: 0, pop: [], flows: null, maxRatio: {} };
  const orig = V2.tickWorldV2;
  let rows0 = 0;
  const write = (w) => {
    const fl = { inZone: {}, xzone: {}, n: 0, nx: 0 };
    for (const e of (w.tradeLog || [])) {
      const tgt = e.xzone ? fl.xzone : fl.inZone; if (e.xzone) fl.nx++; else fl.n++;
      for (const side of ['sent', 'bought', 'sent2']) { const x = e[side]; if (x && x.res && x.amt > 0) tgt[x.res] = +((tgt[x.res] || 0) + x.amt).toFixed(3); }
    }
    st.flows = fl;
    try { fs.writeFileSync(`${OUT}.${ZONE}.json`, JSON.stringify(st)); } catch (e) {}
  };
  V2.tickWorldV2 = function (w) {
    const r = orig.apply(this, arguments);
    try {
      st.days++;
      const vs = w.villages || [];
      if (vs.length && !Object.keys(st.base).length) {
        // 기준값 = 값표가 쓰는 `BASE_VALUE_V2[r] || 1` — 함수를 부르지 않고 **소스의 표를 읽는다**(세계에 손대지 않는 자 · 사본 아님: 읽기)
        const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
        const i0 = src.indexOf('const BASE_VALUE_V2 = {'), i1 = src.indexOf('\n};', i0);
        const BV = require('vm').runInNewContext('(' + src.slice(src.indexOf('{', i0), i1 + 2) + ')');
        //   specialty 품목은 v2 가 실을 때 `BASE_VALUE_V2[id] = r.baseValue || 1` 로 채운다(그 줄 그대로 읽는다)
        const SPEC = require(path.join(ROOT, 'server', 'specialty')).RESOURCES;
        for (const k of Object.keys(V2.ELASTICITY || {})) st.base[k] = (k in BV) ? (BV[k] || 1) : ((SPEC[k] && SPEC[k].baseValue) || 1);
      }
      const ratios = {};
      for (const v of vs) {
        const P = v._priceCache; if (!P) continue; st.vd++;
        for (const k in st.base) { const p = P[k]; if (!(p > 0)) continue; const q = p / (st.base[k] || 1); (ratios[k] = ratios[k] || []).push(q); if (q > 3) st.over3VD[k] = (st.over3VD[k] || 0) + 1; if (!(q <= (st.maxRatio[k] || 0))) st.maxRatio[k] = +q.toFixed(3); }
      }
      for (const k in ratios) { const a = ratios[k].sort((x, y) => x - y), m = a[Math.floor(a.length / 2)]; if (m > 3) st.over3Days[k] = (st.over3Days[k] || 0) + 1; }
      if (st.days % 50 === 0 || st.days === 1) st.pop.push([st.days, vs.reduce((s, v) => s + ((v.npcs && v.npcs.length) || 0), 0), vs.length]);
      if (st.days % 100 === 0 || st.days >= DAYS) write(w);
    } catch (e) {}
    return r;
  };
}
