#!/usr/bin/env node
// === scripts/t297-sites.js — 현장 거리 자: 어부·광부의 하루를 행위로 역산한다 (T297 ②) =========
//
// ⚠**계측기다.** 제품 코드 무접촉 · 세계를 하루도 안 돌린다(`lifeInit` 직후의 배치만 읽는다).
//
// ★왜 — 지금 어부·광부 산출은 **수식**이다(`economy-sim.js:2281` `jdef.base × landBoost × …`).
//   캐논(설계_생산_실체 §1)은 "낚는 순간 손에"다. 옮기기 전에 물어야 할 것: **그 수식이 내는 하루 양이
//   사람의 하루 걸음으로 가능한 수인가.** 가능하지 않으면 옮길 값이 아니라 **고칠 값**이다.
//
// ★이 자가 읽는 것(전부 남의 파일의 수 — 새 수 0):
//   · 산출식      `economy-sim.js` `JOBS.fisher.base`·`JOBS.miner.base` + `land.*`(랩이 세운 그 마을)
//   · 현장 좌표   랩 `V.bank`(물가 셀 — 서버 `villages.js:4562` `bank` 와 동형) · `s.oreRich`(광맥 셀)
//   · 걸음 속도   `server/zone.js:679` `MOVE_SPEED = 64 px/s` = **2 m/s**(32px=1m) — 랩 `L_WALK=2셀/게임분`과 같은 수
//   · 하루 길이   랩 `L_MINDAY=1440` 게임분 · 낮 `L_DAWN 0.25 ~ L_DUSK 0.833` ⇒ **낮 840 게임분**
//   · 1셀 = 1m(랩 주석 `:10322`)
//
// 실행: node scripts/t297-sites.js [시드=1020]   ·   env: T297_NVIL=3 T297_POP=40 T297_JSON=…
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const LAB = 'file://' + path.join(ROOT, 'lab', '전쟁실험실.html');
const SEED = parseInt(process.argv[2] || process.env.T297_SEED || '1020', 10);
const NVIL = parseInt(process.env.T297_NVIL || '3', 10) || 3;
const POP = parseInt(process.env.T297_POP || '40', 10) || 40;
const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));

const INIT = `(() => { let s = 0x9e3779b9;
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  window.L_HUNTINCOME='real'; window.L_WOODINCOME='real';
  window.process = { env: { T100_FIELD_YIELD:'1', T193_LEDGER:'1' } }; })();`;

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  await page.addInitScript(INIT);
  await page.goto(LAB, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => typeof window.lifeInit === 'function' && typeof VILS !== 'undefined', null, { timeout: 120000 });
  const out = await page.evaluate(({ nv, pop, seed }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    reseed(); lifeInit();
    const rows = [];
    for (const vil of VILS) {
      const e = vil.econ, V = vil.V; if (!e || !V) continue;
      const c = vil.center || (V && V.center);
      const dist = (a) => Math.hypot(a.cx - c.cx, a.cy - c.cy);
      const bank = (V.bank || []).map(dist).sort((a, b) => a - b);
      // 광맥 셀 — 랩은 `oreRich` 맵(키 'x,y')에 실물 광맥을 둔다
      const ore = [];
      if (vil.oreRich) for (const k of vil.oreRich.keys()) { const i = k.indexOf(','); ore.push(Math.hypot(+k.slice(0, i) - c.cx, +k.slice(i + 1) - c.cy)); }
      ore.sort((a, b) => a - b);
      const med = (v) => (v.length ? (v.length % 2 ? v[v.length >> 1] : (v[(v.length >> 1) - 1] + v[v.length >> 1]) / 2) : null);
      rows.push({
        name: vil.name, role: vil.role || 'agri', pop: (e.npcs || []).length,
        land: { water: e.land.water, ore: e.land.ore, fertility: e.land.fertility, stone: e.land.stone },
        bankN: bank.length, bankMin: bank[0] ?? null, bankMed: med(bank), bankMax: bank[bank.length - 1] ?? null,
        oreN: ore.length, oreMin: ore[0] ?? null, oreMed: med(ore), oreMax: ore[ore.length - 1] ?? null,
        counts: Object.assign({}, e.counts || {}),
        // 랩이 실제로 배정한 어부 일터까지의 거리(배정 로직 `:8987` — 둑에 퍼진다)
        fisherWork: (vil.agents || []).filter((a) => a.job === 'fisher' && a.work).map((a) => +dist(a.work).toFixed(1)).sort((x, y) => x - y),
        minerWork: (vil.agents || []).filter((a) => a.job === 'miner' && a.work).map((a) => +dist(a.work).toFixed(1)).sort((x, y) => x - y),
      });
    }
    return { rows, L: { MINDAY: L_MINDAY, WALK: L_WALK, DAWN: L_DAWN, DUSK: L_DUSK } };
  }, { nv: NVIL, pop: POP, seed: SEED });
  await browser.close();

  // ── 역산 — 전부 남의 수에서 유도한다(새 수 0) ─────────────────────────────────────
  const J = econ.JOBS || {};
  const dayMin = out.L.MINDAY;                       // 1440 게임분
  const workMin = dayMin * (out.L.DUSK - out.L.DAWN);// 낮 840 게임분
  const walkCellPerMin = out.L.WALK;                 // 2 셀/게임분 (1셀 = 1m)
  console.log(`\n=== T297 ② 현장 거리 · 행위 역산 — 시드 ${SEED} · 마을 ${out.rows.length} ===`);
  console.log(`  하루 ${dayMin} 게임분 · 낮 ${workMin} 게임분(L_DAWN ${out.L.DAWN} ~ L_DUSK ${out.L.DUSK}) · 걸음 ${walkCellPerMin} 셀/게임분(=2 m/s · zone.js MOVE_SPEED 64px/s)`);
  console.log(`  어부 산출식 base ${J.fisher.base} × land.water × 배율  ·  광부 base ${J.miner ? J.miner.base : '?'} × land.ore × 배율`);
  const res = [];
  for (const r of out.rows) {
    const one = (base, land) => base * land;         // 배율(숙련·도구·투입)은 1 로 둔다 — 하한이 곧 상한 물음이 된다
    const fishPerFisher = one(J.fisher.base, r.land.water);
    const orePerMiner = J.miner ? one(J.miner.base, r.land.ore) : null;
    const trip = (d) => (d == null ? null : 2 * d / walkCellPerMin);       // 왕복 게임분
    const trips = (d) => (d == null ? null : Math.floor(workMin / trip(d)));
    const fMed = r.fisherWork.length ? r.fisherWork[r.fisherWork.length >> 1] : r.bankMed;
    const mMed = r.minerWork.length ? r.minerWork[r.minerWork.length >> 1] : r.oreMed;
    res.push(Object.assign({}, r, {
      fishPerFisher: +fishPerFisher.toFixed(4), orePerMiner: orePerMiner == null ? null : +orePerMiner.toFixed(4),
      fDist: fMed, fTripMin: trip(fMed), fTrips: trips(fMed),
      mDist: mMed, mTripMin: trip(mMed), mTrips: trips(mMed),
    }));
    console.log(`\n  [${r.name} · ${r.role}] 인구 ${r.pop} · land.water ${r.land.water} · land.ore ${r.land.ore}`);
    console.log(`    물가 셀 ${r.bankN}곳 — 마을중심에서 최소 ${r.bankMin == null ? '—' : r.bankMin.toFixed(1)}m · 중앙 ${r.bankMed == null ? '—' : r.bankMed.toFixed(1)}m · 최대 ${r.bankMax == null ? '—' : r.bankMax.toFixed(1)}m`);
    console.log(`    광맥 셀 ${r.oreN}곳 — 최소 ${r.oreMin == null ? '—' : r.oreMin.toFixed(1)}m · 중앙 ${r.oreMed == null ? '—' : r.oreMed.toFixed(1)}m · 최대 ${r.oreMax == null ? '—' : r.oreMax.toFixed(1)}m`);
    if (fMed != null) console.log(`    어부 1인 하루 수식 산출 **${fishPerFisher.toFixed(3)}** · 일터까지 ${fMed.toFixed(1)}m ⇒ 왕복 ${trip(fMed).toFixed(1)}게임분 ⇒ 낮에 **왕복 ${trips(fMed)}회** ⇒ 한 번에 **${(fishPerFisher / Math.max(1, trips(fMed))).toFixed(3)}**`);
    if (mMed != null && orePerMiner != null) console.log(`    광부 1인 하루 수식 산출 **${orePerMiner.toFixed(3)}** · 일터까지 ${mMed.toFixed(1)}m ⇒ 왕복 ${trip(mMed).toFixed(1)}게임분 ⇒ 낮에 **왕복 ${trips(mMed)}회** ⇒ 한 번에 **${(orePerMiner / Math.max(1, trips(mMed))).toFixed(3)}**`);
  }
  if (errs.length) console.log(`\n  ⚠페이지 오류 ${errs.length}: ${errs.slice(0, 2).join(' | ')}`);
  if (process.env.T297_JSON) { fs.writeFileSync(process.env.T297_JSON, JSON.stringify({ seed: SEED, L: out.L, rows: res }, null, 1)); console.log(`\n  JSON: ${process.env.T297_JSON}`); }
})().catch((e) => { console.error(e); process.exit(1); });
