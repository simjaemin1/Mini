#!/usr/bin/env node
// === scripts/lab-stone-ab.js — T163 (B) 석재 바닥 ② 랩 A/B ================================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠랩 파일은 손잡이(`window.L_STONEREAL`)로만 가른다 — 랩 소스는 두 팔이 **완전히 같다**.
//
// 두 팔(같은 난수열 · 같은 시드 · 짝지은 비교):
//   OFF(`L_STONEREAL=0` · 기본 · 종전 비트)  ×  ON(`L_STONEREAL=1` · 관 굵기를 실물 바위에서 유도)
//
// 물음 셋(카드 T163):
//   ⓐ 바닥 마을의 `storage.stone < 0.2` 인 날 비율(서버 실측 지금 절반)이 얼마로
//   ⓑ 인구 · 소멸
//   ⓒ 바닥 마을이 **동시에** 움직이는 크기(관 굵기 배수 · 몇 곳)
//
// 실행: node scripts/lab-stone-ab.js [일수=800] [마을수=8]
//   T163_SEEDS=1020,7,42   T163_JSON=/tmp/t163-lab.json
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const NVIL = parseInt(process.argv[3], 10) || 8;
const SEEDS = (process.env.T163_SEEDS || '1020,7,42').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
const OUT = process.env.T163_JSON || '';
// ★결정론 — 랩은 Math.random 을 쓴다. 페이지가 뜨기 전에 시드 PRNG 로 갈아 끼운다(lab-trees 선례).
//   두 팔이 같은 난수열을 쓰므로 A/B 가 **짝지은 비교**가 된다(차이 = 관 굵기뿐).
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

async function arm(seed, on) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.L_STONEREAL=${on ? 1 : 0};`);
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
      o.attached = typeof (ECON_WORLD || {}).stoneBudgetFn === 'function';
      // 마을별 추적자 — 바닥 마을(`baseStone == L_STONE_FLOOR`)만 따로 센다
      const tr = VILS.map((v) => ({
        name: v.name, base: (v.econ && v.econ._baseStone != null) ? v.econ._baseStone : null,
        pop0: (v.econ && v.econ.npcs) ? v.econ.npcs.length : 0,
        k: (typeof stoneRealFn === 'function' && v.econ) ? stoneRealFn(v.econ) : null,
        d0: 0, dLow: 0, dZero: 0, stoneMin: Infinity, toolLow: 0, popMax: 0, alive: 1,
      }));
      const byName = new Map(tr.map((t) => [t.name, t]));
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        for (const v of VILS) {
          const t = byName.get(v.name); if (!t) continue;
          const e = v.econ; if (!e) continue;
          const st = (e.storage && e.storage.stone) || 0;
          t.d0++;
          if (st < 0.2) t.dLow++;
          if (st <= 1e-9) t.dZero++;
          if (st < t.stoneMin) t.stoneMin = st;
          if (((e.storage && e.storage.tool) || 0) < 0.05) t.toolLow++;
          const n = (e.npcs && e.npcs.length) || 0;
          if (n > t.popMax) t.popMax = n;
        }
      }
      const live = new Set(VILS.map((v) => v.name));
      for (const t of tr) { t.alive = live.has(t.name) ? 1 : 0; if (!isFinite(t.stoneMin)) t.stoneMin = null; }
      o.vil1 = VILS.length;
      o.pop = VILS.reduce((a, v) => a + ((v.econ && v.econ.npcs) ? v.econ.npcs.length : 0), 0);
      o.rows = tr;
      o.floorConst = (typeof L_STONE_FLOOR !== 'undefined') ? L_STONE_FLOOR : null;
      o.scatter = (typeof L_STONE_SCATTER !== 'undefined') ? L_STONE_SCATTER : null;
      // 곳간 합 — 돌·도구
      o.stone = VILS.reduce((a, v) => a + (((v.econ || {}).storage || {}).stone || 0), 0);
      o.tool = VILS.reduce((a, v) => a + (((v.econ || {}).storage || {}).tool || 0), 0);
    } catch (e) { o.err = String((e && e.message) || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

(async () => {
  const all = [];
  for (const seed of SEEDS) {
    const off = await arm(seed, false);
    const on = await arm(seed, true);
    all.push({ seed, off, on });
    if (off.err) console.log(`  ⚠ seed ${seed} OFF 오류: ${off.err}`);
    if (on.err) console.log(`  ⚠ seed ${seed} ON 오류: ${on.err}`);
  }
  console.log(`\n=== T163 (B) 석재 바닥 ② 랩 A/B — ${DAYS}일 · 마을 ${NVIL} · 시드 ${SEEDS.join(',')} ===`);
  const a0 = all[0] && all[0].on;
  if (a0) console.log(`  주입 문 열림(ON) ${a0.attached} · 랩 바닥항 L_STONE_FLOOR=${a0.floorConst} · 흩어진 바위 밀도 L_STONE_SCATTER=${a0.scatter}`);
  const fl = (r) => r.rows.filter((t) => t.base != null && Math.abs(t.base - r.floorConst) < 1e-9);
  console.log(`\nⓐ 바닥 마을의 \`돌<0.2\` 인 날 비율`);
  console.log(`  시드 | 바닥곳/전체 | OFF 중앙/최대 | ON 중앙/최대 | 돌 0 찍은 곳 OFF→ON`);
  for (const s of all) {
    const fo = fl(s.off), fn = fl(s.on);
    const ro = fo.map((t) => t.dLow / (t.d0 || 1)), rn = fn.map((t) => t.dLow / (t.d0 || 1));
    console.log(`  ${String(s.seed).padStart(4)} | ${String(fo.length).padStart(2)}/${s.off.vil0} | `
      + `${pct(med(ro))} / ${pct(ro.length ? Math.max(...ro) : null)} | `
      + `${pct(med(rn))} / ${pct(rn.length ? Math.max(...rn) : null)} | `
      + `${fo.filter((t) => t.dZero > 0).length} → ${fn.filter((t) => t.dZero > 0).length}`);
  }
  console.log(`\nⓑ 인구 · 소멸 · 곳간`);
  console.log(`  시드 | 인구 OFF→ON | 소멸 OFF→ON | 돌 재고 OFF→ON | 도구 재고 OFF→ON`);
  for (const s of all) {
    console.log(`  ${String(s.seed).padStart(4)} | ${s.off.pop} → ${s.on.pop} (${((s.on.pop / (s.off.pop || 1) - 1) * 100).toFixed(1)}%) | `
      + `${s.off.vil0 - s.off.vil1}/${s.off.vil0} → ${s.on.vil0 - s.on.vil1}/${s.on.vil0} | `
      + `${s.off.stone.toFixed(1)} → ${s.on.stone.toFixed(1)} | ${s.off.tool.toFixed(1)} → ${s.on.tool.toFixed(1)}`);
  }
  console.log(`\nⓒ 관 굵기 — 몇 곳이 동시에, 얼마나`);
  console.log(`  시드 | 마을 | base(land.stone) → 유도 K | 배수`);
  for (const s of all) {
    for (const t of s.on.rows) {
      if (t.base == null || t.k == null) continue;
      console.log(`  ${String(s.seed).padStart(4)} | ${t.name.padEnd(6)} | ${t.base.toFixed(3)} → ${t.k.toFixed(4)} | ×${(t.k / (t.base || 1)).toFixed(3)}`);
    }
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(all, null, 1)); console.log(`\n  JSON: ${OUT}`); }
})();
