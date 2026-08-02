#!/usr/bin/env node
// === scripts/ab-longcurve.js — 장기 러너의 **궤적** 집계 =====================
// ★[2026-08-02f ③ 장기 스트레스] 소멸 0 은 800일에서만 실증됐다. 좀비 덫·day365 절벽처럼
//   이 프로젝트가 만난 결함은 전부 "시간이 지나야 드러나는" 종류였다 — 800일 너머는 아무도 안 봤다.
//   그래서 1,600일을 돌리고 **400일 간격 스냅샷**으로 곡선을 본다. 최종값만 보면
//   "800일엔 멀쩡했다가 1,200일에 무너지고 1,600일에 다시 회복" 같은 진동을 통째로 놓친다.
//   ★소멸/좀비 판정 기준은 `ab-summary.js` 와 **같은 잣대**를 쓴다(사본 금지 — 두 집계가 갈리면 지표가 거짓말한다).
//   사용: node scripts/ab-longcurve.js <태그> [간격일=400]
'use strict';
const fs = require('fs');
const econ = require('/root/minirepo/sim/economy-sim.js');
const FE = (obj) => { try { return econ.totalFoodEquivalent(obj || {}); } catch (e) { return 0; } };
const TAG = process.argv[2] || 'long1600';
const STEP = parseInt(process.argv[3], 10) || 400;
const SEEDS = [1020, 7, 42];

// 마을 궤적(history: {d,p,f} 10일 표본)에서 시점 d 의 인구를 읽는다. 없으면 가장 가까운 이전 표본.
const popAt = (v, d) => {
  const h = v.history || [];
  let best = null;
  for (const s of h) { if (s.d <= d && (!best || s.d > best.d)) best = s; }
  return best ? best.p : null;
};

const perSeed = [];
for (const s of SEEDS) {
  const f = `/tmp/lab/${TAG}_${s}.json`;
  if (!fs.existsSync(f)) { console.log(`  (시드 ${s} 덤프 없음)`); continue; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const DAYS = d.days || 1600;
  const marks = [];
  for (let t = STEP; t <= DAYS; t += STEP) marks.push(t);
  if (marks[marks.length - 1] !== DAYS) marks.push(DAYS);
  const curve = marks.map(t => {
    let pop = 0, dead = 0, zomb = 0, seen = 0;
    for (const v of d.villages) {
      const p = popAt(v, t);
      if (p == null) continue;
      seen++; pop += p;
      if (p === 0) { dead++; continue; }
      if (p < 10) zomb++;   // ★ab-summary 와 같은 잣대(최종 인구 <10 = 좀비)
    }
    return { t, pop, dead, zomb, seen };
  });
  // 최종 상태(정확값 — history 표본이 아니라 덤프의 확정값)
  let fPop = 0, fDead = 0, fZomb = 0, fTool = 0, fWq = 0, fWraw = 0, rockW = 0, rockPop = 0, rockN = 0;
  for (const v of d.villages) {
    const cur = v.pop; fPop += cur;
    fTool += (v.storage && v.storage.tool) || 0;
    const q = (v._int && v._int._weapQ) || 0.5; const n0 = (v.storage && v.storage.weapon) || 0;
    fWraw += n0; fWq += n0 * q;
    if ((v.land && v.land.stone || 0) >= 1.0 && cur > 0) { rockW += FE(v.storage) + FE(v.treasury) + ((v.treasury && v.treasury._cash) || 0); rockPop += cur; rockN++; }
    if (cur === 0) { fDead++; continue; }
    if (cur < 10) fZomb++;
  }
  perSeed.push({ s, days: DAYS, curve, fPop, fDead, fZomb, fTool, fWq: +fWq.toFixed(0), fWraw,
    rockW: rockPop > 0 ? +(rockW / rockPop).toFixed(1) : 0, rockN,
    // ★후반에 죽은/좀비가 된 마을을 이름으로 남긴다 — 궤적 덤프의 입구
    late: d.villages.filter(v => v.pop < 10).map(v => ({ n: v.name, p: v.pop, peak: (v.history || []).reduce((a, h) => Math.max(a, h.p), v.pop) })) });
}
const pad = (s, w) => String(s).padEnd(w);
console.log(`=== 장기 궤적 [${TAG}] · ${STEP}일 간격 · 시드 ${perSeed.map(x => x.s).join('/')} ===\n`);
if (perSeed.length) {
  const marks = perSeed[0].curve.map(c => c.t);
  console.log(`${pad('시점', 8)}${marks.map(() => '').join('')}${pad('인구(3시드 평균)', 20)}${pad('소멸', 8)}${pad('좀비', 8)}`);
  for (let i = 0; i < marks.length; i++) {
    const rows = perSeed.map(x => x.curve[i]).filter(Boolean);
    const p = rows.reduce((a, r) => a + r.pop, 0) / rows.length;
    const dd = rows.reduce((a, r) => a + r.dead, 0) / rows.length;
    const zz = rows.reduce((a, r) => a + r.zomb, 0) / rows.length;
    const each = perSeed.map(x => x.curve[i] ? x.curve[i].pop : '-').join(' / ');
    console.log(`${pad(marks[i] + '일', 8)}${pad(p.toFixed(0), 20)}${pad(dd.toFixed(2), 8)}${pad(zz.toFixed(2), 8)}  (${each})`);
  }
  const avg = (f) => (perSeed.reduce((a, x) => a + f(x), 0) / perSeed.length);
  console.log(`\n[최종 확정값] 인구 ${avg(x => x.fPop).toFixed(0)} · 소멸 ${avg(x => x.fDead).toFixed(2)}/19 · 좀비 ${avg(x => x.fZomb).toFixed(2)} · 도구 ${avg(x => x.fTool).toFixed(0)} · 무기Q ${avg(x => x.fWq).toFixed(0)} · 무기수 ${avg(x => x.fWraw).toFixed(0)} · 산골 1인당 부 ${avg(x => x.rockW).toFixed(1)}`);
  for (const x of perSeed) {
    console.log(`  시드 ${pad(x.s, 6)} 인구 ${pad(x.fPop, 7)} 소멸 ${pad(x.fDead, 4)} 좀비 ${pad(x.fZomb, 4)} 무기Q ${pad(x.fWq, 6)}` + (x.late.length ? `  ← 10명 미만: ${x.late.map(l => `${l.n}(${l.p}, 최대 ${l.peak})`).join(', ')}` : ''));
  }
}
