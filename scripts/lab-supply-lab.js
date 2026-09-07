#!/usr/bin/env node
// === scripts/lab-supply-lab.js — T151 ⓒ 랩 재현: 품목이 늘면 랩에서도 인구가 움직이나 =========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠**랩 파일 무접촉.** `lab/전쟁실험실.html` 은 한 글자도 안 고친다 — 손잡이(`process.env`)와
//   콘솔만 쓴다. 인라인 번들이 이미 `var process = root.process || {env:{}}` 로 셔틀을 두고 있어
//   페이지가 뜨기 **전에** `window.process` 를 심으면 `specialty.js` 의 게이트가 그걸 읽는다.
//
// 두 팔(같은 난수열 · 같은 시드 · 짝지은 비교):
//   ON  = 기본            → `RESOURCES.acorn/chestnut/mulberry_fruit` 셋이 선다(TRADABLE +3)
//   OFF = T135_TREES=0    → 셋이 안 선다
// ⚠랩에는 나무 층 주입(`world.forageTakeFn`)이 없다 — **대체는 랩에서 안 일어난다.**
//   그래서 이 판이 재는 것은 **품목 등재 하나**다(서버 3판 §0ⓓ 가 잰 그 축).
//
// 실행: node scripts/lab-supply-lab.js [일수=800] [시드=7] [마을수=8]
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 7;
const NVIL = parseInt(process.argv[4], 10) || 8;
const SHOT = process.env.T151_SHOT || '';

const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

async function arm(label, envObj, seed) {
  const SEED = seed;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG_INIT(SEED));
  await p.addInitScript(`window.process = { env: ${JSON.stringify(envObj)} };`);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(({ days, seed, nvil }) => {
    const out = { err: null };
    try {
      const si = document.getElementById('seed'); if (si) si.value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = String(nvil);
      reseed(); lifeInit();
      out.vil0 = VILS.length;
      for (let d = 0; d < days; d++) lifeDayAll(true);
      out.vil1 = VILS.length;
      out.pop = VILS.reduce((a, v) => a + ((v.econ && v.econ.npcs) ? v.econ.npcs.length : 0), 0);
      // 품목표가 실제로 몇 개인지 — 랩이 쥔 그 표를 읽는다(사본 0)
      const S = (typeof Specialty !== "undefined") ? Specialty : null;
      out.res = S && S.RESOURCES ? Object.keys(S.RESOURCES).length : null;
      out.hasNew = S && S.RESOURCES ? ['acorn', 'chestnut', 'mulberry_fruit'].filter(k => !!S.RESOURCES[k]) : [];
      // 곳간 합 — 네 열매
      out.stock = {};
      for (const k of ['acorn', 'chestnut', 'mulberry_fruit', 'grape', 'fruit', 'vegetable'])
        out.stock[k] = +VILS.reduce((a, v) => a + (((v.econ && v.econ.storage) || {})[k] || 0), 0).toFixed(1);
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  }, { days: DAYS, seed: SEED, nvil: NVIL });
  r.errs = errs.slice(0, 4);
  r.label = label;
  await b.close();
  return r;
}

const SEEDS = (process.env.T151_SEEDS || String(SEED)).split(',').map(x => parseInt(x, 10)).filter(Number.isFinite);

(async () => {
  const table = [];
  for (const sd of SEEDS) {
    const on = await arm('ON  (품목 셋 있음)', {}, sd);
    const off = await arm('OFF (품목 셋 없음)', { T135_TREES: '0' }, sd);
    table.push({ sd, on, off });
  }
  const ON = table[0].on, OFF = table[0].off;
  const d = (a, b) => (a ? ((b - a) / a * 100).toFixed(1) + '%' : '—');
  console.log(`\n=== T151 ⓒ 랩 재현 — 전쟁실험실 · 시드 ${SEED} · ${DAYS}일 · 마을 ${NVIL} ===`);
  console.log(`  랩 파일 무접촉(손잡이 process.env 만) · 대체는 랩에 없다(품목 등재 하나만 잰다)\n`);
  for (const r of [OFF, ON]) {
    console.log(`  ${r.label}  인구 ${String(r.pop).padStart(5)} · 마을 ${r.vil1}/${r.vil0} · 품목표 ${r.res} · 새 품목 [${r.hasNew.join(',')}]`);
    if (r.err) console.log(`     ⚠ ${r.err}`);
    if (r.errs && r.errs.length) console.log(`     ⚠ ${r.errs.join(' | ')}`);
  }
  console.log('');
  for (const t of table) console.log(`  ★시드 ${String(t.sd).padStart(4)}  인구 ${String(t.off.pop).padStart(5)} → ${String(t.on.pop).padStart(5)}  (${d(t.off.pop, t.on.pop)})  · 품목표 ${t.off.res} → ${t.on.res}`);
  console.log(`   곳간 OFF ${JSON.stringify(OFF.stock)}`);
  console.log(`   곳간 ON  ${JSON.stringify(ON.stock)}`);
  if (SHOT) {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
    await p.addInitScript(PRNG_INIT(SEED));
    await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1200);
    await p.evaluate((d) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#14110d;color:#e8e0d0;font:16px/1.7 monospace;padding:34px;z-index:99999';
      el.innerHTML = d;
      document.body.appendChild(el);
    }, `<div style="font-size:22px;margin-bottom:18px">T151 &#8203;ⓒ 랩 재현 — 품목 셋이 늘면 인구가 움직이나</div>
        <div style="opacity:.7;margin-bottom:20px">전쟁실험실 · ${DAYS}일 · 마을 ${NVIL} · 랩 파일 무접촉(process.env 손잡이만) · 대체 없음 — <b>품목 등재 하나만</b> 잰다</div>
        <table style="border-collapse:collapse;font-size:17px">
          <tr><th style="text-align:left;padding:8px 26px 8px 0">시드</th><th style="text-align:right;padding:8px 26px 8px 0">OFF 인구</th><th style="text-align:right;padding:8px 26px 8px 0">ON 인구</th><th style="text-align:right;padding:8px 26px 8px 0">Δ</th><th style="text-align:left;padding:8px 0">품목표</th></tr>
          ${table.map(t => `<tr><td style="padding:8px 26px 8px 0">시드 ${t.sd}</td><td style="text-align:right;padding:8px 26px 8px 0">${t.off.pop}</td><td style="text-align:right;padding:8px 26px 8px 0">${t.on.pop}</td><td style="text-align:right;padding:8px 26px 8px 0">${d(t.off.pop, t.on.pop)}</td><td style="padding:8px 0;opacity:.7">${t.off.res} → ${t.on.res}</td></tr>`).join('')}
        </table>
        <div style="margin-top:24px;font-size:20px">★ 품목표 세 줄이 인구를 ${table.map(t => d(t.off.pop, t.on.pop)).join(' · ')} 움직인다</div>
        <div style="margin-top:22px;opacity:.65;font-size:14px;max-width:940px;line-height:1.8">품목표 한 줄이 늘면 econ 의 TRADABLE 집합이 늘고, 값과 교역이 나무 층과 무관하게 움직인다.<br>서버 3판 §0ⓓ 가 잰 것과 같은 축이다(시드 1020 OFF 6,459 → 6,580).</div>`);
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    await p.screenshot({ path: SHOT });
    await b.close();
    console.log(`\n  그림: ${SHOT}`);
  }
})();
