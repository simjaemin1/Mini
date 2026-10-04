// (러너 밖 · T623 ② 끼워 보기 — 사본 판 훅 · 제품 무변 · 손잡이 없음)
// =============================================================================
// `node -r ./scripts/t623-cand-hook.js -r ./scripts/t574-probe.js scripts/t525-cross-zone.js two hanbando nippon 800 <씨>`
//   (워커 둘도 같은 -r 을 물려받는다 — 존마다 품목표에 같은 값이 선다)
//   T623_ARM = now | low | high
//     now  — 손대지 않는다(지금 임시 값 = T574·T602 형제 복제)
//     low  — 새 품목 열의 기준값(`baseValue`)을 후보 **낮음**으로 · high — 후보 **높음**으로(`scripts/t623-cand.js build()` 의 items)
//   ⚠품목표에 줄이 서려면 새 품목 손잡이 둘(`T574_NEW_ITEMS=1` · `T602_NEW_FISH=1`)을 판 env 에 같이 건다(이 훅은 손잡이를 안 건다).
//   ⚠econ v2 는 실릴 때 `BASE_VALUE_V2[id] = specialty.baseValue` 로 값표를 채운다 ⇒ 이 훅은 econ 보다 **먼저** 실려 품목표의 그 칸만 바꾼다.
//   T623_PROBE_OUT 를 주면 새 품목 열하나(+ 견준 넷)의 날마다 값 비(존 가운데) · 폭주(×3 넘음) · 바닥(값 = 기준값 × ADJ_MIN) 날 ·
//     재고 · 장부 흐름을 `${T623_PROBE_OUT}.${존}.json` 에 쓴다(읽기만 — 세계를 한 칸도 안 바꾼다 · t574-probe 와 같은 자리).
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ARM = process.env.T623_ARM || 'now';
const ROOT = process.cwd();
const IDS = ['cinnabar', 'iron_sand', 'shell_bangle', 'amazonite', 'red_seabream', 'sea_bass', 'mullet', 'black_porgy', 'rockfish', 'horse_mackerel', 'mackerel'];
const CMP = ['obsidian', 'copper', 'murex_shell', 'jade_raw', 'pollock', 'salmon', 'herring'];
const applied = {};
if (ARM === 'low' || ARM === 'high') {
  const B = require(path.join(ROOT, 'scripts', 't623-cand.js')).build();
  const SP = require(path.join(ROOT, 'server', 'specialty')).RESOURCES;   // 판 env 의 손잡이로 실린 그 품목표(econ 이 곧 물 캐시)
  for (const id of IDS) {
    const it = B.items[id]; const v = it && (ARM === 'low' ? it.lo : it.hi);
    if (!SP[id] || v == null) { applied[id] = null; continue; }   // 품목이 없거나(천하석) 후보가 빈칸이면 그대로
    applied[id] = { from: SP[id].baseValue, to: v };
    SP[id] = Object.assign({}, SP[id], { baseValue: v });
  }
}
const OUT = process.env.T623_PROBE_OUT;
if (OUT) {
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  const ADJ_MIN = +((/const PRICE_ADJ_MIN = ([\d.]+);/.exec(SRC) || [])[1]);   // 바닥 비 = econ 의 그 글자(새 수 0)
  const ZONE = process.env.T17_ZONE && !String(process.env.T17_ZONE).includes('+') ? process.env.T17_ZONE : 'hanbando';
  //   ⚠워커 스레드의 argv 는 [node, 날, 씨] 다(스크립트 칸이 없다 — t525 두 존 판) · 직접 판은 [node, 스크립트, 날, 씨]
  const DAYS = parseInt(require('worker_threads').isMainThread ? process.argv[2] : process.argv[1], 10) || 800;
  const W = [...IDS, ...CMP];
  const st = { zone: ZONE, arm: ARM, applied, adjMin: ADJ_MIN, days: 0, base: {}, over3Days: {}, floorDays: {}, firstOver3: {}, maxMedRatio: {}, medAt: {}, stockEnd: {}, stockMax: {}, flows: {} };
  const orig = V2.tickWorldV2;
  const write = (w) => {
    const fl = {};
    for (const e of (w.tradeLog || [])) for (const side of ['sent', 'bought', 'sent2']) { const x = e[side]; if (x && x.res && W.includes(x.res) && x.amt > 0) fl[x.res] = +((fl[x.res] || 0) + x.amt).toFixed(3); }
    st.flows = fl;
    try { fs.writeFileSync(`${OUT}.${ZONE}.json`, JSON.stringify(st)); } catch (e) {}
  };
  V2.tickWorldV2 = function (w) {
    const r = orig.apply(this, arguments);
    try {
      st.days++;
      const vs = w.villages || [];
      const SP = require(path.join(ROOT, 'server', 'specialty')).RESOURCES;
      if (!Object.keys(st.base).length) for (const k of W) st.base[k] = SP[k] ? (SP[k].baseValue || 1) : null;
      for (const k of W) {
        if (st.base[k] == null) continue;
        const a = [];
        let stock = 0;
        for (const v of vs) { stock += (v.storage && v.storage[k]) || 0; const P = v._priceCache; if (P && P[k] > 0) a.push(P[k] / st.base[k]); }
        if (stock > (st.stockMax[k] || 0)) st.stockMax[k] = +stock.toFixed(3);
        if (!a.length) continue;
        a.sort((x, y) => x - y);
        const m = a[Math.floor(a.length / 2)];
        if (m > 3) { st.over3Days[k] = (st.over3Days[k] || 0) + 1; if (st.firstOver3[k] == null) st.firstOver3[k] = st.days; }
        if (m <= ADJ_MIN * (1 + 1e-9)) st.floorDays[k] = (st.floorDays[k] || 0) + 1;
        if (!(m <= (st.maxMedRatio[k] || 0))) st.maxMedRatio[k] = +m.toFixed(4);
        if (st.days === 1 || st.days % 100 === 0) (st.medAt[k] = st.medAt[k] || []).push([st.days, +m.toFixed(4)]);
      }
      if (st.days % 100 === 0 || st.days >= DAYS) {
        for (const k of W) { let s = 0; for (const v of vs) s += (v.storage && v.storage[k]) || 0; st.stockEnd[k] = +s.toFixed(3); }
        write(w);
      }
    } catch (e) {}
    return r;
  };
}
