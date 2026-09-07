#!/usr/bin/env node
// === scripts/lab-alloc-arms.js — T161 ⓒ 4팔 표: 품목 등재 × 배분식 =========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠랩 파일은 손잡이(`window.*`)로만 가른다.
//
// 네 팔(같은 난수열 · 같은 시드 · 짝지은 비교):
//   품목  OFF(`T135_TREES=0`) / ON(기본)   ×   배분  종전(`L_ALLOC_REAL=0`) / 실현(기본)
//
// 물음(T151 이 남긴 것):
//   · 품목 등재의 −20% 가 실현 배분에서 **사라지나 줄어드나 그대로인가**
//   · 부호가 시드마다 다르던 것이 **안정되나**
//   · K 축 분포(자리/식량/연료)가 어떻게 움직이나
//   · **폭주** — 산출↑→배분↑→산출↑ 이 한 직업으로 쏠리나(최대 직업 점유율) · MSY 상한은 여전히 서나
//
// 실행: node scripts/lab-alloc-arms.js [일수=400] [마을수=8]
//   T161_SEEDS=7,1020,42   T161_SHOT=산그림/랩/배분_4팔.png
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 400;
const NVIL = parseInt(process.argv[3], 10) || 8;
const SEEDS = (process.env.T161_SEEDS || '7,1020,42').split(',').map(x => parseInt(x, 10)).filter(Number.isFinite);
const SHOT = process.env.T161_SHOT || '';
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

async function arm(seed, items, alloc) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(seed));
  await p.addInitScript(`window.process={env:${items ? '{}' : "{T135_TREES:'0'}"}};window.L_ALLOC_REAL=${alloc ? 1 : 0};`);
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
      o.attached = typeof (ECON_WORLD || {}).allocFn === 'function';
      for (let d = 0; d < days; d++) lifeDayAll(true);
      o.vil1 = VILS.length;
      o.pop = VILS.reduce((a, v) => a + ((v.econ && v.econ.npcs) ? v.econ.npcs.length : 0), 0);
      // K 축 분포 — 엔진이 노출하는 `_kDbg` 를 읽는다(사본 0)
      o.bind = { slot: 0, prod: 0, fuel: 0, none: 0 };
      o.K = 0;
      for (const v of VILS) { const k = v.econ && v.econ._kDbg; if (!k) { o.bind.none++; continue; }
        const m = Math.min(k.slot, k.prod, k.fuel); o.K += m;
        if (m === k.fuel) o.bind.fuel++; else if (m === k.prod) o.bind.prod++; else o.bind.slot++; }
      // 쏠림 — 직업 분포와 최대 점유율
      const jc = {}; let tot = 0;
      for (const v of VILS) for (const n of ((v.econ && v.econ.npcs) || [])) { jc[n.currentJob] = (jc[n.currentJob] || 0) + 1; tot++; }
      o.jobs = jc; o.totalNpc = tot;
      const top = Object.entries(jc).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
      o.topJob = top[0]; o.topShare = tot ? +(top[1] / tot).toFixed(3) : 0;
      o.nJobs = Object.keys(jc).length;
      // MSY 상한이 여전히 서는가 — 엔진이 쥔 `_forageScale`
      const fs = VILS.map(v => (v.econ && v.econ._forageScale != null) ? v.econ._forageScale : null).filter(x => x != null);
      o.forageScale = fs.length ? +(fs.reduce((a, b) => a + b, 0) / fs.length).toFixed(3) : null;
      o.forageScaleMin = fs.length ? +Math.min.apply(null, fs).toFixed(3) : null;
    } catch (e) { o.err = String(e && e.message || e); }
    return o;
  }, { days: DAYS, seed, nvil: NVIL });
  r.errs = errs.slice(0, 3);
  await b.close();
  return r;
}

(async () => {
  const rows = [];
  for (const sd of SEEDS) {
    const cell = {};
    for (const items of [0, 1]) for (const alloc of [0, 1]) cell[`${items}${alloc}`] = await arm(sd, items, alloc);
    rows.push({ sd, cell });
  }
  const pct = (a, b) => (a ? ((b - a) / a * 100).toFixed(1) + '%' : '—');
  console.log(`\n=== T161 ⓒ 4팔 — 전쟁실험실 · ${DAYS}일 · 마을 ${NVIL} ===`);
  console.log(`  팔 = {품목 등재 OFF/ON} × {배분 종전/실현}. 랩 파일은 손잡이로만 가른다.\n`);
  console.log('  시드 | 배분   | 품목OFF | 품목ON  |   Δ품목 | 묶은축(ON) 자리/식량/연료 | 최대직업(ON) | MSY평균(ON)');
  for (const { sd, cell } of rows) {
    for (const alloc of [0, 1]) {
      const off = cell[`0${alloc}`], on = cell[`1${alloc}`];
      console.log(`  ${String(sd).padStart(4)} | ${alloc ? '실현' : '종전'}   | ${String(off.pop).padStart(7)} | ${String(on.pop).padStart(7)} | ${pct(off.pop, on.pop).padStart(7)} | ${String(on.bind.slot).padStart(6)}/${String(on.bind.prod).padStart(2)}/${String(on.bind.fuel).padStart(2)}          | ${(on.topJob + ' ' + (on.topShare * 100).toFixed(0) + '%').padEnd(12)} | ${on.forageScale}`);
    }
  }
  console.log('\n  ★배분 종전 → 실현 (같은 품목 팔 안에서)');
  for (const { sd, cell } of rows)
    console.log(`  시드 ${String(sd).padStart(4)}  품목OFF ${cell['00'].pop} → ${cell['01'].pop} (${pct(cell['00'].pop, cell['01'].pop)})   ·   품목ON ${cell['10'].pop} → ${cell['11'].pop} (${pct(cell['10'].pop, cell['11'].pop)})`);
  console.log('\n  ★쏠림 검사 — 직업 가짓수 · 최대 점유율 · MSY(`_forageScale`) 최소');
  for (const { sd, cell } of rows) for (const a of [0, 1])
    console.log(`  시드 ${String(sd).padStart(4)} ${a ? '실현' : '종전'}  ON: 직업 ${cell[`1${a}`].nJobs}가지 · 최대 ${cell[`1${a}`].topJob} ${(cell[`1${a}`].topShare * 100).toFixed(0)}% · MSY 평균 ${cell[`1${a}`].forageScale} 최소 ${cell[`1${a}`].forageScaleMin}`);
  const bad = rows.flatMap(r => Object.values(r.cell)).filter(c => c.err || (c.errs && c.errs.length));
  if (bad.length) { console.log('\n  ⚠오류'); for (const c of bad) console.log('   ', c.err || c.errs.join(' | ')); }
  if (process.env.T161_JSON) { fs.writeFileSync(process.env.T161_JSON, JSON.stringify(rows)); console.log('\n  → ' + process.env.T161_JSON); }

  if (SHOT) {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1180, height: 700 } });
    await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1000);
    const tr = rows.map(({ sd, cell }) => [0, 1].map(a => `<tr>
      <td style="padding:7px 22px 7px 0">${a ? '' : '시드 ' + sd}</td>
      <td style="padding:7px 22px 7px 0">${a ? '실현' : '종전'}</td>
      <td style="text-align:right;padding:7px 22px 7px 0">${cell[`0${a}`].pop}</td>
      <td style="text-align:right;padding:7px 22px 7px 0">${cell[`1${a}`].pop}</td>
      <td style="text-align:right;padding:7px 22px 7px 0;font-weight:${a ? 700 : 400}">${pct(cell[`0${a}`].pop, cell[`1${a}`].pop)}</td>
      <td style="text-align:right;padding:7px 22px 7px 0;opacity:.8">${cell[`1${a}`].bind.slot}/${cell[`1${a}`].bind.prod}/${cell[`1${a}`].bind.fuel}</td>
      <td style="padding:7px 0;opacity:.8">${cell[`1${a}`].topJob} ${(cell[`1${a}`].topShare * 100).toFixed(0)}%</td></tr>`).join('')).join('');
    await p.evaluate((html) => { const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#14110d;color:#e8e0d0;font:15px/1.6 monospace;padding:32px;z-index:99999';
      el.innerHTML = html; document.body.appendChild(el); },
      `<div style="font-size:21px;margin-bottom:14px">T161 &#8203;ⓒ 4팔 — 배분식이 실현 산출을 보면 품목 등재의 충격이 어떻게 되나</div>
       <div style="opacity:.7;margin-bottom:18px">전쟁실험실 · ${DAYS}일 · 마을 ${NVIL} · 랩 파일은 손잡이로만 가른다 · 배분 종전 = <b>L_ALLOC_REAL=0</b>(종전 비트)</div>
       <table style="border-collapse:collapse;font-size:15px">
         <tr style="opacity:.75"><th style="text-align:left;padding:7px 22px 7px 0">시드</th><th style="text-align:left;padding:7px 22px 7px 0">배분</th><th style="text-align:right;padding:7px 22px 7px 0">품목 OFF</th><th style="text-align:right;padding:7px 22px 7px 0">품목 ON</th><th style="text-align:right;padding:7px 22px 7px 0">Δ품목</th><th style="text-align:right;padding:7px 22px 7px 0">묶은축 자리/식량/연료</th><th style="text-align:left;padding:7px 0">최대 직업</th></tr>
         ${tr}
       </table>`);
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    await p.screenshot({ path: SHOT });
    await b.close();
    console.log(`  그림: ${SHOT}`);
  }
})();
