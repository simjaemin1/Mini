// === scripts/t479-build-probe.js — 집 켬·사슬 밖 마을의 자리 표 (T479 · 계측기 · 러너 밖 · 제품 무접촉) ==================
//   쓰는 법: `T479_JSON=<경로> node -r ./scripts/t479-build-probe.js scripts/t17-metrics.js 800 <seed>`
//            (`ENABLE_VILLAGES=1 … scripts/t176-ab.js 800 <seed>` 도 같다 — 생활층이 부르는 `tickWorldV2` 도 같은 모듈 속성이다)
//   세는 것(마을마다 · 800일 누계 · 세계는 읽기만):
//     · 생산 — 날마다 `dailyProductionBuf`(그날 산출) 중 생곡(밀·쌀·보리·조 — `t17-metrics` 의 RAWGRAIN 그 넷) · 통나무
//     · 직업 인·일 — 날마다 `counts`(직업별 사람 수) 합
//     · 집 — `housing` 이 하루에 늘어난 양의 합(노후 감가를 뺀 뒤의 순증가만) · 크루가 곳간에서 꺼낸 자재(`actFromGranary` 를 감싸 센다)
//     · 교역 — 캐러밴 id 당 한 번: 출발 화물(보낸 마을 유출 · 받은 마을 유입) · 귀환 화물(판 마을 유출 · 사 온 마을 유입) · 품목별
//   끔 판을 이 계측기 없이 잰 판과 견주어 **JSON 동일**을 보인다(보고/T479 §ⓐ) — 세계를 안 건드린다는 자.
'use strict';
const path = require('path'), fs = require('fs');
const R = process.cwd();
const V2 = require(path.join(R, 'sim', 'economy-sim-v2.js'));
const E = require(path.join(R, 'sim', 'economy-sim.js'));
const GRAIN = ['wheat', 'rice', 'barley', 'millet'];
const S = new Map();   // 마을 이름 → 누계
const st = (v) => { let s = S.get(v.name); if (!s) S.set(v.name, (s = { grainProd: 0, woodProd: 0, jobDays: {}, housing0: null, built: 0, act: {}, tin: {}, tout: {}, legsOut: 0, legsIn: 0 })); return s; };
const add = (o, k, n) => { if (n > 0) o[k] = (o[k] || 0) + n; };
const origAct = E.actFromGranary;
E.actFromGranary = function (v, item, units) { const t = origAct.apply(this, arguments); if (v && v.name && t > 0) add(st(v).act, item, t); return t; };
const origTick = V2.tickWorldV2; let W = null, day = 0; const seenOut = new Set(), seenRet = new Set(); const hPrev = new Map();
V2.tickWorldV2 = function (w) {
  W = w;
  for (const v of (w.villages || [])) if (v && v.name) hPrev.set(v.name, v.housing);
  const r = origTick.apply(this, arguments); day++;
  for (const v of (w.villages || [])) {
    if (!v || !v.name) continue; const s = st(v);
    const d = v.dailyProductionBuf || {};
    for (const g of GRAIN) s.grainProd += d[g] || 0;
    s.woodProd += d.wood || 0;
    for (const j in (v.counts || {})) add(s.jobDays, j, v.counts[j] || 0);
    if (s.housing0 == null && v.housing != null) s.housing0 = v.housing;
    const hp = hPrev.get(v.name); if (hp != null && v.housing != null && v.housing > hp) s.built += v.housing - hp;
  }
  for (const c of (w.caravans || [])) {
    if (!seenOut.has(c.id)) { seenOut.add(c.id);
      const a = st(c.from), b = st(c.to); a.legsOut++; b.legsIn++;
      add(a.tout, c.giveRes, c.giveAmt); add(b.tin, c.giveRes, c.giveAmt);
      if (c.giveRes2 && c.giveAmt2 > 0) { add(a.tout, c.giveRes2, c.giveAmt2); add(b.tin, c.giveRes2, c.giveAmt2); } }
    if (c._returningRes && c._returningAmt > 0 && !seenRet.has(c.id)) { seenRet.add(c.id);
      add(st(c.to).tout, c._returningRes, c._returningAmt); add(st(c.from).tin, c._returningRes, c._returningAmt); }
  }
  return r;
};
process.on('exit', () => {
  if (!process.env.T479_JSON || !W) return;
  const r1 = (o) => Object.fromEntries(Object.entries(o).map(([k, n]) => [k, +n.toFixed(1)]));
  const vs = W.villages.filter((v) => v && v.name).map((v) => { const s = st(v); return {
    name: v.name, pop: (v.npcs && v.npcs.length) || 0, grainProd: +s.grainProd.toFixed(1), woodProd: +s.woodProd.toFixed(1), jobDays: s.jobDays,
    housing0: s.housing0 == null ? null : +s.housing0.toFixed(1), housing: v.housing == null ? null : +v.housing.toFixed(1), built: +s.built.toFixed(1), act: r1(s.act),
    grainEnd: +GRAIN.reduce((a, g) => a + (v.storage[g] || 0), 0).toFixed(1), wood: +(v.storage.wood || 0).toFixed(1), food: +(v.storage.food || 0).toFixed(1),
    smelted: +(v._smeltedTotal || 0).toFixed(1), kiln: v._kiln ? 1 : 0, live: v._t400Live ? 1 : 0,
    legsOut: s.legsOut, legsIn: s.legsIn, tin: r1(s.tin), tout: r1(s.tout) }; });
  fs.writeFileSync(process.env.T479_JSON, JSON.stringify({ days: day, vs }));
});
