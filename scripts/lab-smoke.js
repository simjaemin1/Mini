#!/usr/bin/env node
// === scripts/lab-smoke.js — 랩 HTML 을 헤드리스로 열어 엔진이 실제로 도는지 본다 ===
//
// ★[2026-08-01] 인라인 엔진을 갈아끼운 뒤 "파일이 커졌다"만 보고 끝내면 안 된다.
//   랩은 엔진 내부(counts·storage·caravans·_grudgeBlock 등)를 직접 읽는 훅이 여럿이라,
//   엔진 모양이 바뀌면 조용히 죽는다. 그래서 실제로 브라우저에 띄우고
//   ① 콘솔 에러 0 ② createWorldV2/tickWorldV2 가 존재 ③ N일 틱이 실제로 인구를 만든다
//   를 확인한다.
//
// 실행: node scripts/lab-smoke.js <lab.html> [days=200]
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const LAB = process.argv[2];
const DAYS = parseInt(process.argv[3], 10) || 200;
if (!LAB) { console.error('사용: node scripts/lab-smoke.js <lab.html> [days]'); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await page.goto('file://' + path.resolve(LAB), { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);

  const r = await page.evaluate((days) => {
    const out = { has: {}, err: null };
    const E = window.EconEngine;
    out.has.EconEngine = !!E;
    if (!E) return out;
    for (const k of ['createWorldV2', 'tickWorldV2', 'createVillage', 'tickVillage', 'computeVillagePrices', 'setSeed'])
      out.has[k] = typeof E[k] === 'function';
    try {
      E.setSeed(42);
      // 본 게임(server/villages.js:1647)·전쟁실험실(7913)과 같은 옵션
      const w = E.createWorldV2({ seed: 42, villageCount: 6, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
      for (let d = 0; d < days; d++) E.tickWorldV2(w);
      out.day = w.day;
      out.pop = w.villages.reduce((s, v) => s + v.npcs.length, 0);
      out.alive = w.villages.filter(v => v.npcs.length > 0).length;
      out.trades = (w.tradeLog || []).length;
      const st = {};
      for (const v of w.villages) for (const k in v.storage) st[k] = (st[k] || 0) + v.storage[k];
      out.stock = Object.fromEntries(Object.entries(st).filter(([, x]) => x > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, x]) => [k, +x.toFixed(0)]));
      const jobs = {};
      for (const v of w.villages) for (const n of v.npcs) jobs[n.currentJob] = (jobs[n.currentJob] || 0) + 1;
      out.jobs = jobs;
      out.armor = +st.armor ? +st.armor.toFixed(1) : 0;
      out.clothes = st.clothes ? +st.clothes.toFixed(1) : 0;
    } catch (e) { out.err = e && (e.stack || e.message); }
    return out;
  }, DAYS);

  await browser.close();

  const name = path.basename(LAB);
  console.log(`\n=== ${name} 헤드리스 스모크 (${DAYS}일) ===`);
  console.log('  엔진 노출: ' + Object.entries(r.has).map(([k, v]) => `${k}${v ? '✅' : '❌'}`).join(' '));
  if (r.err) console.log('  ❌ 틱 예외:\n' + r.err);
  else console.log(`  day=${r.day} 인구=${r.pop} 생존마을=${r.alive} 거래=${r.trades} · 갑옷=${r.armor} 옷=${r.clothes}`);
  if (r.stock) console.log('  재고: ' + Object.entries(r.stock).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (r.jobs) console.log('  직업: ' + Object.entries(r.jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`  콘솔 에러 ${errs.length}건` + (errs.length ? ':\n    ' + errs.slice(0, 12).join('\n    ') : ' ✅'));

  const bad = r.err || errs.length || !r.has.EconEngine || !r.has.tickWorldV2 || !(r.pop > 0);
  console.log(bad ? '  → 실패 ❌\n' : '  → 통과 ✅\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
