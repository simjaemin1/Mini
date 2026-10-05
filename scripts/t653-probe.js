// (러너 밖 · T653 자 — 적재 순간 덧붙임 · 동작 0)
// =============================================================================
// `node -r ./scripts/t653-probe.js scripts/t525-cross-zone.js two hanbando nippon 800 <씨>` (워커도 같은 -r 을 물려받는다)
//   `t574-probe` · `t635-probe` 와 같은 자리(econ 하루 틱 `economy-sim-v2.tickWorldV2` 뒤)에서 **읽기만** 한다 — 세계를 한 칸도 안 바꾼다.
//   마을마다(이름 열쇠):
//     ⓐ 인구 길 · 아사(`_deathsToday`) · 인구식의 항 합(`_dpDebug` — 로지스틱 · 굶주림 · 건강 · 행복 · 위신 · 주거 막힘 날 · 끝 주거) ·
//        K 와 그 셋(`_kDbg` — 자리 · 식량 흐름 · 연료) 평균 · 마을 스탯(행복 · 건강 · 위신) 평균
//     ⓑ 장부(`world.tradeLog` — 날마다 새 줄만): 받은 · 보낸 양(식량 · 조개 · 바다 종 · 그 밖) · 조개를 받으며 내준 값(그 줄의 맞짐 양 × 그 품목 값) ·
//        이 마을 캐러밴 짐 kg(가는 짐 + 오는 짐 · `weights.kgOf`) 중 조개 · 바다 종 · 식량 몫
//   출력: `${T653_PROBE_OUT}.${존}.json`(100일마다 · 마지막 날 덮어씀). 손잡이 없으면 아무것도 안 한다.
// =============================================================================
'use strict';
const OUT = process.env.T653_PROBE_OUT;
if (OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.cwd();
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const W = require(path.join(ROOT, 'server', 'weights'));
  const SP = require(path.join(ROOT, 'server', 'specialty')).RESOURCES;
  const ZONE = process.env.T17_ZONE && !String(process.env.T17_ZONE).includes('+') ? process.env.T17_ZONE : 'hanbando';
  const DAYS = parseInt(require('worker_threads').isMainThread ? process.argv[2] : process.argv[1], 10) || 800;
  const SEA = new Set(['red_seabream', 'sea_bass', 'mullet', 'black_porgy', 'rockfish', 'horse_mackerel', 'mackerel', 'herring', 'sardine', 'anchovy', 'shrimp', 'crab', 'octopus', 'squid']);
  const FOODX = new Set(['food', 'fish', 'meat', 'cooked_food', 'wheat', 'rice', 'barley', 'millet', 'dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg', 'fruit', 'vegetable', 'mushroom']);
  const kind = (r) => r === 'shell_bangle' ? 'shell' : (SEA.has(r) ? 'sea' : ((FOODX.has(r) || (SP[r] && SP[r].contributes && SP[r].contributes.subsistence > 0)) ? 'food' : 'other'));
  const kg = (r) => { try { return W.kgOf(r) || 1; } catch (e) { return 1; } };
  const st = { zone: ZONE, days: 0, env: {}, vil: {}, zonePop: [] };
  for (const k of Object.keys(process.env)) if (/^T(574|602|635|653)_/.test(k)) st.env[k] = process.env[k];
  const V = (name) => st.vil[name] || (st.vil[name] = { pop: [], deaths: 0, terms: { logi: 0, hunger: 0, health: 0, happy: 0, prestige: 0 }, gated: 0, K: 0, kSlot: 0, kProd: 0, kFuel: 0, n: 0,
    hap: 0, hea: 0, pre: 0, inQ: { food: 0, shell: 0, sea: 0, other: 0 }, outQ: { food: 0, shell: 0, sea: 0, other: 0 }, paidShell: 0, cargoKg: { food: 0, shell: 0, sea: 0, other: 0 }, trips: 0, minPop: Infinity });
  const orig = V2.tickWorldV2;
  V2.tickWorldV2 = function (w) {
    const L0 = w.tradeLog || [], mark = L0.length ? L0[L0.length - 1] : null;
    const r = orig.apply(this, arguments);
    try {
      st.days++;
      const vs = w.villages || [];
      const byName = {};
      let zp = 0;
      for (const v of vs) {
        byName[v.name] = v;
        const a = V(v.name), N = (v.npcs && v.npcs.length) || 0; zp += N;
        if (st.days === 1 || st.days % 50 === 0 || st.days >= DAYS) a.pop.push([st.days, N]);
        if (N < a.minPop) a.minPop = N;
        a.deaths += v._deathsToday || 0;
        const d = v._dpDebug; if (d) { for (const k of Object.keys(a.terms)) a.terms[k] += +d[k] || 0; if (d.gated) a.gated++; a.K += +d.K || 0; a.housing = d.housing; }
        const kd = v._kDbg; if (kd) { a.kSlot += kd.slot || 0; a.kProd += kd.prod || 0; a.kFuel += kd.fuel || 0; }
        const s = v.lastStats; if (s) { a.hap += s.happiness || 0; a.hea += s.health || 0; a.pre += s.prestige || 0; }
        a.n++;
      }
      if (st.days === 1 || st.days % 50 === 0 || st.days >= DAYS) st.zonePop.push([st.days, zp]);
      // 그날 새 장부 줄
      const L = w.tradeLog || [];
      let i = L.length - 1; const neu = [];
      while (i >= 0 && L[i] !== mark) { neu.push(L[i]); i--; }
      for (const e of neu) {
        const A = byName[e.from] ? V(e.from) : null, B = byName[e.to] ? V(e.to) : null;   // A = 캐러밴 낸 마을(이 존) · B = 받은 마을
        const s = e.sent, b = e.bought;
        if (A) A.trips++;
        if (s && s.res && s.amt > 0) {
          const k = kind(s.res);
          if (A) { A.outQ[k] += s.amt; A.cargoKg[k] += s.amt * kg(s.res); }
          if (B) B.inQ[k] += s.amt;
          if (k === 'shell' && B && b && b.res && b.amt > 0) { const P = byName[e.to] && byName[e.to]._priceCache; B.paidShell += b.amt * ((P && P[b.res]) || 0); }
        }
        if (b && b.res && b.amt > 0) {
          const k = kind(b.res);
          if (A) { A.inQ[k] += b.amt; A.cargoKg[k] += b.amt * kg(b.res); }
          if (B) B.outQ[k] += b.amt;
          if (k === 'shell' && A && s && s.res && s.amt > 0) { const P = byName[e.from] && byName[e.from]._priceCache; A.paidShell += s.amt * ((P && P[s.res]) || 0); }
        }
      }
      if (st.days % 100 === 0 || st.days >= DAYS) { try { fs.writeFileSync(`${OUT}.${ZONE}.json`, JSON.stringify(st)); } catch (e) {} }
    } catch (e) { st.err = String(e && e.stack); }
    return r;
  };
}
