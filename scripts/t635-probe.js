// (러너 밖 · T635 자 — 적재 순간 덧붙임 · 동작 0)
// =============================================================================
// `node -r ./scripts/t635-probe.js scripts/t525-cross-zone.js two hanbando nippon 800 <씨>` (워커도 같은 -r 을 물려받는다)
//   `t574-probe.js` 와 같은 자리(econ 하루 틱 `economy-sim-v2.tickWorldV2` 뒤)에서 **읽기만** 한다 — 세계를 한 칸도 안 바꾼다.
//   T635 의 품목(조개 팔찌감 · 해안 새 어종 일곱 + 견줄 옥 · 생선 · 형제 셋)마다:
//     ⓐ 값 경로 — 존 가운데 마을의 값(`v._priceCache` — 교역이 쓰는 그 캐시)과 그 비(÷ 기준값) · 바닥(econ `PRICE_ADJ_MIN`)에 붙은 날 · ×3 넘은 날
//     ⓑ 재고 — 존 합 · 가진 마을 수 · 가진 마을들의 가운데 값(path 칸 다섯째)
//     ⓒ 거래 — 그날 새로 붙은 교역 장부 줄(`world.tradeLog` — 5000 줄로 잘리므로 날마다 새 줄만 센다)의 건수 · 양 · **쌍**(보낸 마을 → 받은 마을) · 존 넘음
//   출력: `${T635_PROBE_OUT}.${존}.json`(100일마다 · 마지막 날 덮어씀). 손잡이 없으면 아무것도 안 한다.
// =============================================================================
'use strict';
const OUT = process.env.T635_PROBE_OUT;
if (OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.cwd();
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const ZONE = process.env.T17_ZONE && !String(process.env.T17_ZONE).includes('+') ? process.env.T17_ZONE : 'hanbando';
  const DAYS = parseInt(require('worker_threads').isMainThread ? process.argv[2] : process.argv[1], 10) || 800;
  const IDS = ['shell_bangle', 'jade', 'red_seabream', 'sea_bass', 'mullet', 'black_porgy', 'rockfish', 'horse_mackerel', 'mackerel', 'fish', 'salmon', 'pollock', 'herring'];
  const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  const ADJ_MIN = +((/const PRICE_ADJ_MIN = ([\d.]+);/.exec(SRC) || [])[1]);
  const st = { zone: ZONE, days: 0, adjMin: ADJ_MIN, env: {}, base: {}, path: {}, floorDays: {}, over3Days: {}, stockEnd: {}, stockMax: {}, holders: {}, trades: {}, pop: [] };
  for (const k of Object.keys(process.env)) if (/^T(574|602|623|635)_/.test(k)) st.env[k] = process.env[k];
  const pairs = {};
  const med = (a) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const write = () => {
    for (const k of Object.keys(pairs)) { const t = st.trades[k]; t.pairs = Object.keys(pairs[k]).length; t.topPairs = Object.entries(pairs[k]).sort((a, b) => b[1] - a[1]).slice(0, 8); }
    try { fs.writeFileSync(`${OUT}.${ZONE}.json`, JSON.stringify(st)); } catch (e) {}
  };
  const orig = V2.tickWorldV2;
  V2.tickWorldV2 = function (w) {
    const L0 = w.tradeLog || [], mark = L0.length ? L0[L0.length - 1] : null;
    const r = orig.apply(this, arguments);
    try {
      st.days++;
      const vs = w.villages || [];
      if (!Object.keys(st.base).length) {
        const SP = require(path.join(ROOT, 'server', 'specialty')).RESOURCES;
        const i0 = SRC.indexOf('const BASE_VALUE_V2 = {'), i1 = SRC.indexOf('\n};', i0);
        const BV = require('vm').runInNewContext('(' + SRC.slice(SRC.indexOf('{', i0), i1 + 2) + ')');
        for (const k of IDS) st.base[k] = (k in BV) ? (BV[k] || 1) : ((SP[k] && SP[k].baseValue) || 1);
      }
      for (const k of IDS) {
        const ps = [], ph = []; let stock = 0, hold = 0;
        for (const v of vs) {
          const P = v._priceCache; const p = P && P[k]; if (p > 0) ps.push(p);
          const q = (v.storage && v.storage[k]) || 0; stock += q; if (q > 1e-6) { hold++; if (p > 0) ph.push(p); }
        }
        const mh = med(ph);   // 가진 마을들의 가운데 값(가진 마을이 없으면 null)
        const m = med(ps), rr = m != null ? m / (st.base[k] || 1) : null;
        if (rr != null && rr <= ADJ_MIN * 1.0001) st.floorDays[k] = (st.floorDays[k] || 0) + 1;
        if (rr != null && rr > 3) st.over3Days[k] = (st.over3Days[k] || 0) + 1;
        if (st.days === 1 || st.days % 25 === 0 || st.days >= DAYS) (st.path[k] || (st.path[k] = [])).push([st.days, m != null ? +m.toFixed(4) : null, +stock.toFixed(3), hold, mh != null ? +mh.toFixed(4) : null]);
        st.stockEnd[k] = +stock.toFixed(3); if (stock > (st.stockMax[k] || 0)) st.stockMax[k] = +stock.toFixed(3);
        st.holders[k] = hold;
      }
      // 그날 새 장부 줄 — 끝에서부터 어제 마지막 줄을 만날 때까지
      const L = w.tradeLog || [];
      let i = L.length - 1; const neu = [];
      while (i >= 0 && L[i] !== mark) { neu.push(L[i]); i--; }
      for (const e of neu) {
        for (const side of ['sent', 'bought']) {
          const x = e[side]; if (!x || !x.res || !(x.amt > 0) || IDS.indexOf(x.res) < 0) continue;
          const t = st.trades[x.res] || (st.trades[x.res] = { n: 0, amt: 0, xzone: 0, pairs: 0 });
          t.n++; t.amt = +(t.amt + x.amt).toFixed(3); if (e.xzone) t.xzone++;
          const pk = side === 'sent' ? `${e.from}>${e.to}` : `${e.to}>${e.from}`;
          const P = pairs[x.res] || (pairs[x.res] = {}); P[pk] = (P[pk] || 0) + 1;
        }
      }
      if (st.days % 50 === 0 || st.days === 1) st.pop.push([st.days, vs.reduce((s, v) => s + ((v.npcs && v.npcs.length) || 0), 0), vs.length]);
      if (st.days % 100 === 0 || st.days >= DAYS) write();
    } catch (e) { st.err = String(e && e.message); }
    return r;
  };
}
