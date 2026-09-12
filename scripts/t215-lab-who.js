#!/usr/bin/env node
// === scripts/t215-lab-who.js — T215 ③ 랩 8마을 귀속 계측기 ==========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠코드 0 — `lab/전쟁실험실.html` 무접촉. 손잡이(`window.L_CARGO_TWO`)로만 가른다.
//
// T206 이 랩 시드 42 에서 −25.5%(349→260) 를 냈다. 그 −25.5% 가 **어느 마을**에서
// 나왔고 그 마을이 **무엇을 둘째로 실어 보냈나** 를 센다. 서버 계측기
// (`scripts/t215-cargo-who.js`)와 같은 자리를 같은 훅(`onTradeLeg`)으로 본다.
//
//   ⚠랩 8마을은 서버 51마을의 꼬리를 못 본다(족보 144). 랩은 기전을 보이는 자리다(족보 141).
//
// 실행: node scripts/t215-lab-who.js [일수=800] [마을수=8]
//   T215_LAB_SEEDS=42   T215_LAB_JSON=/tmp/t215-lab.json
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const NVIL = parseInt(process.argv[3], 10) || 8;
const SEEDS = (process.env.T215_LAB_SEEDS || '42').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
const OUT = process.env.T215_LAB_JSON || '';
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

async function arm(seed, on) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.L_CARGO_TWO=${on ? 1 : 0};`);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(({ days, seed, nvil }) => {
    const o = { err: null };
    try {
      document.getElementById('seed').value = String(seed);
      document.getElementById('nvil').value = String(nvil);
      reseed(); lifeInit();
      o.attached = (ECON_WORLD || {}).cargoTwo === true;
      const rows = VILS.map((v, i) => ({ i, name: v.name,
        base: (v.econ && v.econ._baseStone != null) ? v.econ._baseStone : null,
        pop0: (v.econ && v.econ.npcs) ? v.econ.npcs.length : 0,
        popEnd: 0, popMax: 0, legs: 0, twoLegs: 0, secondUnits: 0,
        first: {}, second: {}, dToolLow: 0, dStoneLow: 0 }));
      const byIdx = new Map(rows.map((t) => [t.i, t]));
      //   ★T215 — 계측기만. 훅은 T206 이 낸 자리 그대로(`world.onTradeLeg`).
      ECON_WORLD.onTradeLeg = (e) => {
        const t = byIdx.get(e.vid); if (!t) return;
        t.legs++;
        t.first[e.res] = (t.first[e.res] || 0) + e.units;
        if (e.second && e.secondUnits > 0) {
          t.twoLegs++; t.secondUnits += e.secondUnits;
          t.second[e.second] = (t.second[e.second] || 0) + e.secondUnits;
        }
      };
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        for (let i = 0; i < VILS.length; i++) {
          const t = byIdx.get(i); if (!t) continue;
          const e = VILS[i].econ; if (!e) continue;
          const n = (e.npcs && e.npcs.length) || 0; if (n > t.popMax) t.popMax = n;
          if (((e.storage || {}).tool || 0) < 0.05) t.dToolLow++;
          if (((e.storage || {}).stone || 0) < 0.2) t.dStoneLow++;
        }
      }
      for (let i = 0; i < VILS.length; i++) {
        const t = byIdx.get(i); if (!t) continue;
        const e = VILS[i].econ || {};
        t.popEnd = (e.npcs && e.npcs.length) || 0;
        t.foodStock = Math.round(((e.storage || {}).food || 0) * 10) / 10;
        t.stoneStock = Math.round(((e.storage || {}).stone || 0) * 10) / 10;
        t.surplusFood = Math.round((((e.surplusEMA || {}).food) || 0) * 1000) / 1000;
      }
      o.pop = rows.reduce((a, t) => a + t.popEnd, 0);
      o.rows = rows;
    } catch (e) { o.err = String((e && e.message) || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

const FOODS = new Set(['food', 'fish', 'meat', 'wheat', 'rice', 'barley', 'game', 'egg', 'milk',
  'fruit', 'nut', 'root', 'honey', 'shellfish', 'seaweed', 'salmon', 'shrimp', 'crab', 'oyster',
  'cooked_food', 'mushroom']);

(async () => {
  const all = [];
  for (const seed of SEEDS) {
    const off = await arm(seed, false);
    const on = await arm(seed, true);
    all.push({ seed, off, on });
    if (off.err) console.log(`  ⚠ seed ${seed} OFF 오류: ${off.err}`);
    if (on.err) console.log(`  ⚠ seed ${seed} ON 오류: ${on.err}`);
  }
  console.log(`\n=== T215 ③ 랩 8마을 귀속 — ${DAYS}일 · 마을 ${NVIL} · 시드 ${SEEDS.join(',')} ===`);
  for (const { seed, off, on } of all) {
    console.log(`\n--- 시드 ${seed}: 끔 ${off.pop} → 켬 ${on.pop} (${((on.pop - off.pop) / off.pop * 100).toFixed(1)}%) · 문 ${on.attached ? '열림' : '닫힘'}/${off.attached ? '열림' : '닫힘'}`);
    const O = new Map((off.rows || []).map((r) => [r.i, r]));
    const rows = (on.rows || []).slice().sort((a, b2) => (a.popEnd - (O.get(a.i) || {}).popEnd) - (b2.popEnd - (O.get(b2.i) || {}).popEnd));
    console.log(`     ${'마을'.padEnd(8)}${'바닥'.padStart(5)}${'끔'.padStart(6)}${'켬'.padStart(6)}${'Δ'.padStart(6)}${'leg끔'.padStart(7)}${'leg켬'.padStart(7)}${'둘째leg'.padStart(8)}${'둘째단위'.padStart(10)}${'식량비'.padStart(7)}  둘째 상위 4`);
    for (const r of rows) {
      const o = O.get(r.i) || {};
      const f2 = Object.entries(r.second || {}).reduce((a, [k, v]) => a + (FOODS.has(k) ? v : 0), 0);
      const top = Object.entries(r.second || {}).sort((x, y) => y[1] - x[1]).slice(0, 4)
        .map(([k, v]) => `${k}:${Math.round(v).toLocaleString()}`).join(' ');
      console.log(`     ${r.name.padEnd(8)}${String(r.base === 0.1 ? 'Y' : '.').padStart(5)}${String(o.popEnd).padStart(6)}${String(r.popEnd).padStart(6)}${String(r.popEnd - (o.popEnd || 0)).padStart(6)}${String(o.legs || 0).padStart(7)}${String(r.legs).padStart(7)}${String(r.twoLegs).padStart(8)}${Math.round(r.secondUnits).toLocaleString().padStart(10)}${(r.secondUnits > 0 ? (f2 / r.secondUnits * 100).toFixed(0) + '%' : '—').padStart(7)}  ${top}`);
    }
    const it = {}; let su = 0;
    for (const r of (on.rows || [])) { su += r.secondUnits; for (const [k, v] of Object.entries(r.second || {})) it[k] = (it[k] || 0) + v; }
    const f2 = Object.entries(it).reduce((a, [k, v]) => a + (FOODS.has(k) ? v : 0), 0);
    console.log(`     합: 둘째 ${Math.round(su).toLocaleString()} 단위 · 식량류 ${Math.round(f2).toLocaleString()} (${(f2 / su * 100).toFixed(1)}%)`);
    console.log(`     품목: ${Object.entries(it).sort((a, b2) => b2[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${Math.round(v).toLocaleString()}`).join(' · ')}`);
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(all, null, 1)); console.log(`\n  → ${OUT}`); }
})();
