#!/usr/bin/env node
// === scripts/lab-tool-life-ab.js — T180 ③ 도구 수명 랩 A/B ===============================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠랩 파일은 손잡이(`window.L_TOOL_WEAR`)로만 가른다 — 두 팔의 소스가 **완전히 같다**.
//
//   기본(`L_TOOL_WEAR=1` = 지금 값 = 종전 비트) × 반(`=0.5`)
//   "반" 은 새 수가 아니라 **A/B 의 눈금**이다 — 값 판정은 재민(카드 §2).
//
// 물음(카드 ②): `도구≈0` 일수 · `돌<0.2` 일수 · 인구 · 소멸 · **도구Q·무기Q**(넓게 번지는지 — T152 위험)
//
// 실행: node scripts/lab-tool-life-ab.js [일수=800] [마을수=8] [배수=0.5]
//   T180_SEEDS=1020,7,42   T180_LAB_JSON=/tmp/t180-lab.json
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const NVIL = parseInt(process.argv[3], 10) || 8;
const HALF = parseFloat(process.argv[4]) || 0.5;
const SEEDS = (process.env.T180_SEEDS || '1020,7,42').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
const OUT = process.env.T180_LAB_JSON || '';
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

async function arm(seed, mul) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.L_TOOL_WEAR=${mul};`);
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
      o.vil0 = VILS.length;
      o.mul = (ECON_WORLD || {}).toolWearMul != null ? ECON_WORLD.toolWearMul : 1;   // 배수 1 이면 문을 안 연다
      const tr = VILS.map((v) => ({ name: v.name,
        base: (v.econ && v.econ._baseStone != null) ? v.econ._baseStone : null,
        d0: 0, dLow: 0, toolLow: 0, popMax: 0, toolMin: Infinity }));
      const byName = new Map(tr.map((t) => [t.name, t]));
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        for (const v of VILS) {
          const t = byName.get(v.name); if (!t) continue;
          const e = v.econ; if (!e) continue;
          t.d0++;
          if (((e.storage && e.storage.stone) || 0) < 0.2) t.dLow++;
          const tl = (e.storage && e.storage.tool) || 0;
          if (tl < 0.05) t.toolLow++;
          if (tl < t.toolMin) t.toolMin = tl;
          const n = (e.npcs && e.npcs.length) || 0; if (n > t.popMax) t.popMax = n;
        }
      }
      for (const t of tr) if (!isFinite(t.toolMin)) t.toolMin = null;
      o.vil1 = VILS.length;
      o.pop = VILS.reduce((a, v) => a + ((v.econ && v.econ.npcs) ? v.econ.npcs.length : 0), 0);
      o.rows = tr;
      o.floorConst = (typeof L_STONE_FLOOR !== 'undefined') ? L_STONE_FLOOR : null;
      // 도구Q·무기Q — 엔진이 쥔 품질보정 총량(사본 0)
      o.tool = VILS.reduce((a, v) => a + (((v.econ || {}).storage || {}).tool || 0), 0);
      o.toolQ = VILS.reduce((a, v) => { const e = v.econ || {}; const q = (e._toolQden > 0) ? e._toolQnum / e._toolQden : 1;
        return a + ((e.storage || {}).tool || 0) * q; }, 0);
      o.weapQ = VILS.reduce((a, v) => { const e = v.econ || {}; const q = (e._weapQden > 0) ? e._weapQnum / e._weapQden : 1;
        return a + ((e.storage || {}).weapon || 0) * q; }, 0);
      o.stone = VILS.reduce((a, v) => a + (((v.econ || {}).storage || {}).stone || 0), 0);
    } catch (e) { o.err = String((e && e.message) || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const sum = (a) => a.reduce((x, y) => x + y, 0);

(async () => {
  const all = [];
  for (const seed of SEEDS) {
    const base = await arm(seed, 1);
    const half = await arm(seed, HALF);
    all.push({ seed, base, half });
    if (base.err) console.log(`  ⚠ seed ${seed} 기본 오류: ${base.err}`);
    if (half.err) console.log(`  ⚠ seed ${seed} 반 오류: ${half.err}`);
  }
  console.log(`\n=== T180 ③ 도구 수명 랩 A/B — ${DAYS}일 · 마을 ${NVIL} · 시드 ${SEEDS.join(',')} · 눈금 ×${HALF} ===`);
  const a0 = all[0];
  if (a0) console.log(`  기본 팔 배수 ${a0.base.mul}(= 문 안 열림) · 반 팔 배수 ${a0.half.mul}`);
  const fl = (r) => r.rows.filter((t) => t.base != null && r.floorConst != null && Math.abs(t.base - r.floorConst) < 1e-9);
  console.log(`\nⓐ 바닥 마을 — 도구≈0 일수 · 돌<0.2 일수 (중앙)`);
  console.log(`  시드 | 바닥곳 | **도구≈0 기본→반** | 돌<0.2 기본→반 | 도구 최저(중앙)`);
  for (const s of all) {
    const fo = fl(s.base), fn = fl(s.half);
    console.log(`  ${String(s.seed).padStart(4)} | ${String(fo.length).padStart(2)}/${s.base.vil0}`
      + ` | **${med(fo.map((t) => t.toolLow))} → ${med(fn.map((t) => t.toolLow))}**`
      + ` | ${med(fo.map((t) => t.dLow))} → ${med(fn.map((t) => t.dLow))}`
      + ` | ${(med(fo.map((t) => t.toolMin || 0)) || 0).toFixed(3)} → ${(med(fn.map((t) => t.toolMin || 0)) || 0).toFixed(3)}`);
  }
  console.log(`\nⓑ 전체 — 인구 · 소멸 · 도구Q · 무기Q (넓게 번지나)`);
  console.log(`  시드 | 인구 기본→반 | 소멸 | 도구 재고 | **도구Q** | **무기Q** | 돌 재고`);
  for (const s of all) {
    console.log(`  ${String(s.seed).padStart(4)} | ${s.base.pop} → ${s.half.pop} (${((s.half.pop / (s.base.pop || 1) - 1) * 100).toFixed(1)}%)`
      + ` | ${s.base.vil0 - s.base.vil1}/${s.base.vil0} → ${s.half.vil0 - s.half.vil1}/${s.half.vil0}`
      + ` | ${s.base.tool.toFixed(0)} → ${s.half.tool.toFixed(0)}`
      + ` | **${s.base.toolQ.toFixed(1)} → ${s.half.toolQ.toFixed(1)}**`
      + ` | **${s.base.weapQ.toFixed(1)} → ${s.half.weapQ.toFixed(1)}**`
      + ` | ${s.base.stone.toFixed(0)} → ${s.half.stone.toFixed(0)}`);
  }
  console.log(`\nⓒ 바닥 마을 최고인구 합`);
  for (const s of all) {
    const fo = fl(s.base), fn = fl(s.half);
    console.log(`  ${String(s.seed).padStart(4)} | ${sum(fo.map((t) => t.popMax))} → ${sum(fn.map((t) => t.popMax))}`);
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(all, null, 1)); console.log(`\n  JSON: ${OUT}`); }
})();
