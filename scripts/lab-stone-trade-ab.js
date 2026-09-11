#!/usr/bin/env node
// === scripts/lab-stone-trade-ab.js — T173 (B) 석재 처방 ① 랩 A/B ==========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠랩 파일은 손잡이(`window.L_STONE_TRADE`)로만 가른다 — 두 팔의 소스가 **완전히 같다**.
//
//   OFF(`L_STONE_TRADE=0` · 기본 · 종전 비트) × ON(`=1` · 귀환 화물에 석재 우선 한 줄)
//
// 물음 다섯(카드 T173 ③):
//   ⓐ 바닥 마을 `돌<0.2` 일수   ⓑ 도구≈0 일수(T163 이 보인 진짜 병목 · `_stCost` 게이트)
//   ⓒ 인구·소멸               ⓓ **파는 쪽** 마을의 돌 재고(빼앗아 오는 건 아닌가)
//   ⓔ 관이 넓어지는 배수(유입 ÷ 자체생산 — T163 ②의 ×0.029 와 같은 자리)
//
// 실행: node scripts/lab-stone-trade-ab.js [일수=800] [마을수=8]
//   T173_SEEDS=1020,7,42   T173_LAB_JSON=/tmp/t173-lab.json
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const NVIL = parseInt(process.argv[3], 10) || 8;
const SEEDS = (process.env.T173_SEEDS || '1020,7,42').split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
const OUT = process.env.T173_LAB_JSON || '';
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

async function arm(seed, on) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.L_STONE_TRADE=${on ? 1 : 0};`);
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
      o.attached = typeof (ECON_WORLD || {}).returnPullFn === 'function';
      o.thresh = (typeof L_STONE_NET_THRESH !== 'undefined') ? L_STONE_NET_THRESH : null;
      o.floorConst = (typeof L_STONE_FLOOR !== 'undefined') ? L_STONE_FLOOR : null;
      const tr = VILS.map((v) => ({ name: v.name,
        base: (v.econ && v.econ._baseStone != null) ? v.econ._baseStone : null,
        d0: 0, dLow: 0, dZero: 0, toolLow: 0, popMax: 0, prod: 0, imp: 0, impN: 0, ret: 0, exp: 0, stoneEnd: 0 }));
      const byName = new Map(tr.map((t) => [t.name, t]));
      const seen = new Set();
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        // 귀환 화물 — **실려 있는 동안** 센다(집에 닿은 캐러밴은 목록에서 빠진다 · 도착일로 세면 늘 0).
        //   ⚠첫 판이 그렇게 0 을 냈다. 캐러밴 id 로 한 번만 센다.
        for (const c of ((ECON_WORLD && ECON_WORLD.caravans) || [])) {
          if (!c._returningRes || seen.has(c.id)) continue;
          seen.add(c.id);
          const t = byName.get(c.from && c.from.name); if (!t) continue;
          t.ret = (t.ret || 0) + 1;
          if (c._returningRes !== 'stone') continue;
          t.impN = (t.impN || 0) + 1;
          t.imp += (+c._returningAmt || 0);
        }
        for (const v of VILS) {
          const t = byName.get(v.name); if (!t) continue;
          const e = v.econ; if (!e) continue;
          t.d0++;
          const st = (e.storage && e.storage.stone) || 0;
          if (st < 0.2) t.dLow++;
          if (st <= 1e-9) t.dZero++;
          if (((e.storage && e.storage.tool) || 0) < 0.05) t.toolLow++;
          const n = (e.npcs && e.npcs.length) || 0; if (n > t.popMax) t.popMax = n;
          const pb = e.dailyProductionBuf; if (pb && pb.stone > 0) t.prod += pb.stone;
        }
      }
      for (const v of VILS) { const t = byName.get(v.name); if (!t) continue;
        const e = v.econ || {}; t.stoneEnd = ((e.storage || {}).stone) || 0;
        t.exp = ((e.tradeStats && e.tradeStats.exportBy) || {}).stone || 0; }
      o.vil1 = VILS.length;
      o.pop = VILS.reduce((a, v) => a + ((v.econ && v.econ.npcs) ? v.econ.npcs.length : 0), 0);
      o.rows = tr;
    } catch (e) { o.err = String((e && e.message) || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const pctOf = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

(async () => {
  const all = [];
  for (const seed of SEEDS) {
    const off = await arm(seed, false);
    const on = await arm(seed, true);
    all.push({ seed, off, on });
    if (off.err) console.log(`  ⚠ seed ${seed} OFF 오류: ${off.err}`);
    if (on.err) console.log(`  ⚠ seed ${seed} ON 오류: ${on.err}`);
  }
  const a0 = all[0] && all[0].on;
  console.log(`\n=== T173 (B) 석재 처방 ① 랩 A/B — ${DAYS}일 · 마을 ${NVIL} · 시드 ${SEEDS.join(',')} ===`);
  if (a0) console.log(`  주입 문 열림(ON) ${a0.attached} · 문턱 L_STONE_NET_THRESH=${a0.thresh} · 랩 바닥항 ${a0.floorConst}`);
  const fl = (r) => r.rows.filter((t) => t.base != null && r.floorConst != null && Math.abs(t.base - r.floorConst) < 1e-9);
  const nf = (r) => r.rows.filter((t) => !(t.base != null && r.floorConst != null && Math.abs(t.base - r.floorConst) < 1e-9));

  console.log(`\nⓐ 바닥 마을 \`돌<0.2\` 일수 · ⓑ 도구≈0 일수`);
  console.log(`  시드 | 바닥곳 | 돌<0.2 OFF→ON(중앙) | 도구≈0 OFF→ON(중앙) | 돌 0 찍은 곳`);
  for (const s of all) {
    const fo = fl(s.off), fn = fl(s.on);
    console.log(`  ${String(s.seed).padStart(4)} | ${String(fo.length).padStart(2)}/${s.off.vil0}`
      + ` | ${med(fo.map((t) => t.dLow))} → ${med(fn.map((t) => t.dLow))} (${pctOf(med(fo.map((t) => t.dLow)) / 800)} → ${pctOf(med(fn.map((t) => t.dLow)) / 800)})`
      + ` | ${med(fo.map((t) => t.toolLow))} → ${med(fn.map((t) => t.toolLow))}`
      + ` | ${fo.filter((t) => t.dZero > 0).length} → ${fn.filter((t) => t.dZero > 0).length}`);
  }
  console.log(`\nⓒ 인구 · 소멸`);
  console.log(`  시드 | 인구 OFF→ON | 바닥 최고인구 합 OFF→ON | 소멸 OFF→ON`);
  for (const s of all) {
    const fo = fl(s.off), fn = fl(s.on);
    console.log(`  ${String(s.seed).padStart(4)} | ${s.off.pop} → ${s.on.pop} (${((s.on.pop / (s.off.pop || 1) - 1) * 100).toFixed(1)}%)`
      + ` | ${sum(fo.map((t) => t.popMax))} → ${sum(fn.map((t) => t.popMax))}`
      + ` | ${s.off.vil0 - s.off.vil1}/${s.off.vil0} → ${s.on.vil0 - s.on.vil1}/${s.on.vil0}`);
  }
  console.log(`\nⓓ 파는 쪽 — 빼앗아 오는 건 아닌가 (바닥 아닌 마을)`);
  console.log(`  시드 | 파는 곳 | 돌 재고(끝) 합 OFF→ON | 그쪽 돌<0.2 일수(중앙) OFF→ON | 그쪽 인구 OFF→ON`);
  for (const s of all) {
    const ro = nf(s.off), rn = nf(s.on);
    console.log(`  ${String(s.seed).padStart(4)} | ${ro.length} | ${sum(ro.map((t) => t.stoneEnd)).toFixed(0)} → ${sum(rn.map((t) => t.stoneEnd)).toFixed(0)}`
      + ` | ${med(ro.map((t) => t.dLow))} → ${med(rn.map((t) => t.dLow))}`
      + ` | ${sum(ro.map((t) => t.popMax))} → ${sum(rn.map((t) => t.popMax))}`);
  }
  console.log(`\nⓔ 관이 넓어지는 배수 — 바닥 마을 (유입 + 자체생산) ÷ 자체생산`);
  console.log(`  시드 | 자체생산 합 | 유입 OFF→ON (돌 귀환건/전체 귀환건) | **배수 OFF→ON**`);
  for (const s of all) {
    const fo = fl(s.off), fn = fl(s.on);
    const po = sum(fo.map((t) => t.prod)), pn = sum(fn.map((t) => t.prod));
    const io = sum(fo.map((t) => t.imp)), inn = sum(fn.map((t) => t.imp));
    const nO = sum(fo.map((t) => t.impN || 0)), nN = sum(fn.map((t) => t.impN || 0));
    const rO = sum(fo.map((t) => t.ret || 0)), rN = sum(fn.map((t) => t.ret || 0));
    console.log(`  ${String(s.seed).padStart(4)} | ${po.toFixed(0)} → ${pn.toFixed(0)} | ${io.toFixed(0)} → ${inn.toFixed(0)} (${nO}/${rO}건 → ${nN}/${rN}건)`
      + ` | ×${(po ? (po + io) / po : 0).toFixed(3)} → **×${(pn ? (pn + inn) / pn : 0).toFixed(3)}**`);
  }
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(all, null, 1)); console.log(`\n  JSON: ${OUT}`); }
})();
