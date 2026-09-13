#!/usr/bin/env node
// === scripts/t233-lab-gate-ab.js — T233 랩 8마을 둘째 관문 3팔 {off/two/twogate} ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠랩 파일은 손잡이(`L_CARGO_TWO` · `L_SPARECAP_FIX`)로만 가른다 — 네 팔의 소스가 **완전히 같다**.
//
// T215 가 낸 갈림: 랩 8마을은 총 leg −17.5% → 인구 −25.5% 인데, 서버 51마을은 총 leg 이 유지되고
// **재분배**로만 남았다. 랩이 그 효과가 가장 크게 보이는 자리라 인과를 여기서 먼저 가른다.
//   ⚠랩 8마을은 서버 51마을의 꼬리를 못 본다(족보 144) — 랩은 기전을 보이는 자리다(족보 141).
//
// 네 팔: off(궤적 기록) · two · twofix · fix(자기검증 — off 와 같아야 한다)
//
// 실행: node scripts/t223-lab-sparecap-ab.js [일수=800] [마을수=8]
//   T223_LAB_SEEDS=1020,7,42   T223_LAB_JSON=/tmp/t223-lab.json
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const NVIL = parseInt(process.argv[3], 10) || 8;
const SEEDS = (process.env.T223_LAB_SEEDS || '1020,7,42').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
const OUT = process.env.T223_LAB_JSON || '';
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

// arm: 'off' | 'two' | 'twofix' | 'fix' ; trace: {마을이름: [일별 spareCap]} (fix 계열만)
async function arm(seed, armName) {
  const TWO = (armName === 'two' || armName === 'twogate');
  const GATE = (armName === 'twogate');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.L_CARGO_TWO=${TWO ? 1 : 0};window.L_CARGO_TWO_GATE=${GATE ? 1 : 0};`);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(({ days, seed, nvil, armName, REC }) => {
    const o = { err: null, arm: armName };
    try {
      document.getElementById('seed').value = String(seed);
      document.getElementById('nvil').value = String(nvil);
      reseed(); lifeInit();
      o.gateAttached = (ECON_WORLD || {}).cargoTwoGate === true;
      o.twoAttached = (ECON_WORLD || {}).cargoTwo === true;
      const rows = VILS.map((v, i) => ({ i, name: v.name,
        base: (v.econ && v.econ._baseStone != null) ? v.econ._baseStone : null,
        pop0: (v.econ && v.econ.npcs) ? v.econ.npcs.length : 0,
        popEnd: 0, popMax: 0, legs: 0, twoLegs: 0, secondUnits: 0, second: {}, negPU: 0, negUnits: 0, blocked: 0 }));
      const byIdx = new Map(rows.map((t) => [t.i, t]));
      const nameOf = new Map(VILS.map((v, i) => [v.name, i]));
      ECON_WORLD.onTradeLeg = (e) => {
        const t = byIdx.get(e.vid); if (!t) return;
        t.legs++;
        t.blocked += (e.gateBlocked || 0);
        if (e.second && e.secondUnits > 0) {
          t.twoLegs++; t.secondUnits += e.secondUnits; t.second[e.second] = (t.second[e.second] || 0) + e.secondUnits;
          if ((e.p2ProfitPerUnit || 0) <= 0) { t.negPU++; t.negUnits += e.secondUnits; }   // ★적자 둘째
        }
      };
      //   ★끔 팔에서만 궤적을 **기록**한다 — `null` 을 돌려주므로 세계는 안 움직인다(하네스 ㉓).

      for (let d = 0; d < days; d++) lifeDayAll(true);
      for (let i = 0; i < VILS.length; i++) {
        const t = byIdx.get(i); if (!t) continue;
        const e = VILS[i].econ || {};
        t.popEnd = (e.npcs && e.npcs.length) || 0;
      }
      o.pop = rows.reduce((a, t) => a + t.popEnd, 0);
      o.legs = rows.reduce((a, t) => a + t.legs, 0);
      o.secondUnits = rows.reduce((a, t) => a + t.secondUnits, 0);
      o.rows = rows;
      o.negPU = rows.reduce((a, t) => a + t.negPU, 0);
      o.negUnits = rows.reduce((a, t) => a + t.negUnits, 0);
      o.blocked = rows.reduce((a, t) => a + t.blocked, 0);
    } catch (e) { o.err = String((e && e.message) || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL, armName, REC: false });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

const gini = (v) => { const a = v.slice().sort((x, y) => x - y), n = a.length, s = a.reduce((p, q) => p + q, 0);
  return s === 0 ? 0 : (2 * a.reduce((p, q, i) => p + (i + 1) * q, 0) - (n + 1) * s) / (n * s); };

(async () => {
  const all = [];
  for (const seed of SEEDS) {
    const off = await arm(seed, 'off');
    const two = await arm(seed, 'two');
    const twogate = await arm(seed, 'twogate');
    all.push({ seed, off, two, twogate });
    for (const a of [off, two, twogate]) if (a.err) console.log(`  ⚠ seed ${seed} ${a.arm} 오류: ${a.err}`);
  }
  console.log(`\n=== T233 랩 8마을 · 둘째 관문 3팔 — ${DAYS}일 · 시드 ${SEEDS.join(',')} ===`);
  for (const s of all) {
    console.log(`\n--- 시드 ${s.seed}`);
    console.log(`     ${'팔'.padEnd(10)}${'인구'.padStart(7)}${'Δ%'.padStart(9)}${'leg'.padStart(7)}${'둘째단위'.padStart(10)}${'적자둘째'.padStart(10)}${'적자단위'.padStart(10)}${'걸림'.padStart(8)}${'지니'.padStart(7)}  문(둘째/관문)`);
    for (const k of ['off', 'two', 'twogate']) {
      const a = s[k]; if (!a || a.err) continue;
      const dp = (a.pop - s.off.pop) / s.off.pop * 100;
      console.log(`     ${k.padEnd(10)}${String(a.pop).padStart(7)}${(k === 'off' ? '—' : dp.toFixed(1) + '%').padStart(9)}${String(a.legs).padStart(7)}${Math.round(a.secondUnits).toLocaleString().padStart(10)}${String(a.negPU).padStart(10)}${Math.round(a.negUnits).toLocaleString().padStart(10)}${String(a.blocked).padStart(8)}${gini(a.rows.map((r) => r.popEnd)).toFixed(3).padStart(7)}  ${a.twoAttached ? '켬' : '끔'}/${a.gateAttached ? '켬' : '끔'}`);
    }
    const same = JSON.stringify(s.off.rows.map((r) => r.popEnd)) === JSON.stringify(s.two.rows.map((r) => r.popEnd));
    if (same) console.log('     ⚠two ≡ off — 이 시드에선 둘째가 세계를 안 움직인다');
    console.log(`     ${'마을'.padEnd(8)}${'바닥'.padStart(5)}${'off'.padStart(6)}${'two'.padStart(6)}${'twogate'.padStart(9)}  ${'two-off'.padStart(8)}${'twogate-off'.padStart(12)}`);
    for (const r of s.off.rows.slice().sort((a, b2) => (s.two.rows[a.i].popEnd - a.popEnd) - (s.two.rows[b2.i].popEnd - b2.popEnd))) {
      const t = s.two.rows[r.i], g = s.twogate.rows[r.i];
      console.log(`     ${r.name.padEnd(8)}${String(r.base === 0.1 ? 'Y' : '.').padStart(5)}${String(r.popEnd).padStart(6)}${String(t.popEnd).padStart(6)}${String(g.popEnd).padStart(9)}  ${String(t.popEnd - r.popEnd).padStart(8)}${String(g.popEnd - r.popEnd).padStart(12)}`);
    }
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(all, null, 1)); console.log(`\n  → ${OUT}`); }
})();
