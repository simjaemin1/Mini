#!/usr/bin/env node
// === scripts/t297-observe.js — 관찰(실걸음) ↔ 빨리감기(수식) 직업별 하루 산출 (T297) ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 [설계/설계_생산_실체.md · 재민 09-18]
//   *"npc 가 낚시하는 순간 물고기가 들어가고, 나무를 베는 순간 통나무가 생긴다"* 를 캐논으로 세웠다.
//   옮기기 전에 물을 것: **지금 수식이 내는 하루 양이, 몸이 실제로 하는 하루 양과 얼마나 다른가.**
//   랩은 두 모드를 이미 갖고 있다 — 관찰(실걸음 · `lifeLoop` 의 slow 갈래)과 빨리감기(`lifeDayAll(true)`).
//   같은 씨·같은 세계로 둘을 나란히 돌려 **직업별 하루 산출 합**을 견준다. 그 차이가 등가 자의 바닥이다.
//
// ★★어떻게 헤드리스로 관찰 모드를 도나 — **이미 있는 문법을 그대로 쓴다**(새 발명 0):
//   `scripts/test-lab-psite.js:29 INIT` 의 **가상 시계**다. `performance.now` 를 프레임마다 16.667ms 씩
//   나아가는 가짜 시계로 바꾸고 `requestAnimationFrame` 을 감싼다 ⇒ 벽시계가 아니라 **프레임 수**가 시간이다.
//   그래서 관찰 모드가 CPU 가 낼 수 있는 만큼 빨리 돌고, 같은 씨면 **결정론**이다(이 자가 두 판으로 증명한다).
//   속도는 119× — `dGM = 119 × 0.016667 = 1.983 < 6` 이라 랩의 `slow`(실보행) 갈래가 유지된다(psite 주석의 그 수).
//
// ★손잡이(전부 이 파일 것 · 세계 손잡이 아님):
//   T297_DAYS=30 · T297_SEED=1020 · T297_NVIL=3 · T297_POP=40 · T297_SPEED=119
//   T297_JSON=/tmp/x.json · T297_PRNG=0x9e3779b9 · T297_ARM=obs|bulk|both(기본)
//   CHROME=<크로미움 경로>(없으면 playwright 기본)
//
// ★실물 손잡이는 **적재 전에** 심는다(카드 지시: 실물 전부 켬):
//   `window.L_HUNTINCOME='real'` · `window.L_WOODINCOME='real'`(랩 모드 손잡이)
//   `window.process.env.T100_FIELD_YIELD='1'`(밭 실물 · 4판) · `T193_LEDGER='1'`(그 실물을 **장부에 적는다**)
//   ⚠`T193_LEDGER` 없이는 밭 실물이 `dailyProductionBuf` 에 안 남아 **식량 열이 빈다** — 자가 못 본다.
//   ⚠번들은 `root.process` 를 그대로 쓴다(`economy-engine.browser.js:9` shim) ⇒ window 에 심으면 엔진이 읽는다.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const LAB = 'file://' + path.join(ROOT, 'lab', '전쟁실험실.html');
const CHROME = process.env.CHROME || '';

const DAYS = parseInt(process.env.T297_DAYS || '30', 10) || 30;
const SEED = parseInt(process.env.T297_SEED || '1020', 10);
const NVIL = parseInt(process.env.T297_NVIL || '3', 10) || 3;
const POP = parseInt(process.env.T297_POP || '40', 10) || 40;
const SPEED = parseInt(process.env.T297_SPEED || '119', 10) || 119;
// ★★[T297 자기수리 2026-09-19] 씨는 **PRNG 에도 들어가야 한다.**
//   처음엔 psite 처럼 PRNG 상수를 고정(0x9e3779b9)했는데, 랩 세계의 대부분이 `Math.random` 에서 나오므로
//   그러면 **시드를 바꿔도 같은 세계**가 나온다(실측: 시드 1020 과 7 이 여덟 칸 전부 한 자도 안 달랐다).
//   "3시드"가 3세계가 아니면 T252 자를 댈 수가 없다 ⇒ 씨에서 PRNG 상수를 **유도**한다(새 수 0 — 섞는 상수는
//   이 파일이 이미 쓰는 해시 상수 둘). `T297_PRNG` 로 덮어쓸 수 있다(psite 문법 유지).
const PRNG = process.env.T297_PRNG || ('0x' + (((0x9e3779b9 ^ Math.imul(SEED | 0, 0x85ebca6b)) >>> 0).toString(16)));
const ARM = process.env.T297_ARM || 'both';

// ★[test-lab-psite.js:29 그대로] 씨 고정 + 가상 시계. 여기에 실물 손잡이 심기만 덧댄다.
const INIT = (prng) => `
(() => {
  let s = ${prng};
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0;
  const _raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => _raf(() => { vt += 16.667; cb(vt); });
  window.__vt = () => vt;
  // ★실물 모드 — 랩 손잡이 둘 + 엔진 env 둘(번들이 root.process 를 읽는다)
  window.L_HUNTINCOME = 'real';
  window.L_WOODINCOME = 'real';
  window.process = { env: { T100_FIELD_YIELD: '1', T193_LEDGER: '1' } };
})();
`;

// ★장부 수집기 — **랩 파일은 안 만진다.** 페이지에서 \`lifeDayAll\` 을 감싸 하루가 끝날 때마다 적는다.
//   econ 틱은 \`lifeDayAll\` 머리에서 돈다 ⇒ 함수가 돌아온 직후 \`dailyProductionBuf\` 가 **그날치**다.
//   ⚠랩 관찰 모드는 일부 흐름을 econ 장부를 안 거치고 **곳간에 바로** 넣는다(벌채 부산물 \`_defoWood\` ·
//     T226 이 적은 실물 열매). 그래서 곳간·실물 계수기도 같이 적는다 — 어느 직업이 같은 장부를 안 쓰는지가 표다.
const HOOK = () => {
  if (window.__t297) return;
  window.__t297 = { days: 0, prod: {}, real: {}, stock0: {}, stockN: {} };
  const RES = ['food', 'fish', 'meat', 'wood', 'stone', 'ore', 'hide', 'fruit', 'vegetable', 'mushroom', 'herb', 'twig', 'salt', 'tool', 'weapon'];
  const snap = (into) => {
    for (const vil of VILS) {
      const e = vil.econ; if (!e) continue;
      const t = (into[vil.name] || (into[vil.name] = {}));
      for (const r of RES) t[r] = +(((e.storage && e.storage[r]) || 0)).toFixed(4);
    }
  };
  snap(window.__t297.stock0);
  const _orig = window.lifeDayAll;
  window.lifeDayAll = function () {
    const out = _orig.apply(this, arguments);
    const A = window.__t297;
    for (const vil of VILS) {
      const e = vil.econ; if (!e) continue;
      const p = (A.prod[vil.name] || (A.prod[vil.name] = {}));
      const buf = e.dailyProductionBuf || {};
      for (const k in buf) { const x = buf[k]; if (x > 0) p[k] = +((p[k] || 0) + x).toFixed(6); }
      const q = (A.real[vil.name] || (A.real[vil.name] = {}));
      q.wcut = +((q.wcut || 0) + (e._wcutDay || 0)).toFixed(6);     // ★어제 벤 목재(랩 실물 · T166 문이 읽는 그 수)
      q.hkill = +((q.hkill || 0) + (e._hkillDay || 0)).toFixed(6);  // ★어제 잡은 마릿수(T154)
      q.defoWood = +(e._defoWood || 0).toFixed(6);                  // ★벌채 부산물 — 곳간에 **직접** 들어간다(장부 밖)
      q.role = vil.role || 'agri';
      q.pop = (e.npcs || []).length;
      const c = e.counts || {};
      q.counts = { farmer: c.farmer || 0, fisher: c.fisher || 0, hunter: c.hunter || 0, lumberjack: c.lumberjack || 0, miner: c.miner || 0, forager: c.forager || 0 };
      q.land = { water: e.land.water, fertility: e.land.fertility, wood: e.land.wood, ore: e.land.ore, game: e.land.game, stone: e.land.stone };
    }
    A.days++;
    return out;
  };
  window.__t297snapN = () => { snap(window.__t297.stockN); return window.__t297; };
};

async function runArm(arm) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e).slice(0, 160)));
  await page.addInitScript(INIT(PRNG));
  await page.goto(LAB, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => typeof window.lifeToggle === 'function' && typeof VILS !== 'undefined', null, { timeout: 120000 });
  await page.evaluate(({ nv, pop, seed }) => {
    document.getElementById('nvil').value = String(nv);
    document.getElementById('pop').value = String(pop);
    document.getElementById('seed').value = String(seed);
    reseed(); lifeInit();
  }, { nv: NVIL, pop: POP, seed: SEED });
  await page.evaluate(HOOK);
  const t0 = Date.now();
  if (arm === 'obs') {
    await page.evaluate(({ sp }) => {
      const sel = document.getElementById('simSpeed');
      if (![...sel.options].some((o) => o.value === String(sp))) sel.add(new Option(sp + '×(계측기)', String(sp)));
      sel.value = String(sp);
      lifeToggle();
    }, { sp: SPEED });
    for (;;) {
      const d = await page.evaluate(() => window.__t297.days);
      if (d >= DAYS) break;
      if (Date.now() - t0 > 3600000) { errs.push('시간 초과 — day ' + d); break; }
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => lifeToggle());
  } else {
    await page.evaluate((n) => { for (let i = 0; i < n; i++) lifeDayAll(true); }, DAYS);
  }
  const out = await page.evaluate(() => window.__t297snapN());
  const ms = Date.now() - t0;
  const vt = await page.evaluate(() => (window.__vt ? window.__vt() : null));
  await browser.close();
  return { arm, seed: SEED, days: out.days, ms, vt, errs, prod: out.prod, real: out.real, stock0: out.stock0, stockN: out.stockN };
}

(async () => {
  const res = {};
  for (const a of (ARM === 'both' ? ['obs', 'bulk'] : [ARM])) {
    process.stderr.write(`  · ${a} 시드 ${SEED} ${DAYS}일 …\n`);
    res[a] = await runArm(a);
    process.stderr.write(`    ${res[a].days}일 · 벽시계 ${(res[a].ms / 1000).toFixed(1)}초 · 가상시계 ${(res[a].vt / 1000 / 60).toFixed(1)}분 · 오류 ${res[a].errs.length}\n`);
  }
  if (process.env.T297_JSON) { fs.writeFileSync(process.env.T297_JSON, JSON.stringify(res, null, 1)); console.log('  JSON: ' + process.env.T297_JSON); }
  // 표 — 마을별 · 품목별 30일 합
  const KEYS = ['food', 'fish', 'meat', 'wood', 'stone', 'ore', 'fruit', 'vegetable', 'mushroom'];
  const arms = Object.keys(res);
  const names = Object.keys((res[arms[0]] || {}).prod || {});
  for (const n of names) {
    const r0 = res[arms[0]].real[n] || {};
    console.log(`\n### ${n} (${r0.role}) · 인구 ${r0.pop} · 직업 ${JSON.stringify(r0.counts)}`);
    console.log(`  land ${JSON.stringify(r0.land)}`);
    console.log('  | 품목 | ' + arms.map((a) => (a === 'obs' ? '관찰' : '빨리감기')).join(' | ') + ' | Δ% |');
    console.log('  |---|' + arms.map(() => '---|').join('') + '---|');
    for (const k of KEYS) {
      const v = arms.map((a) => ((res[a].prod[n] || {})[k] || 0));
      if (v.every((x) => x === 0)) continue;
      const d = (v.length === 2 && v[1] !== 0) ? ((v[0] - v[1]) / v[1] * 100) : null;
      console.log(`  | ${k} | ` + v.map((x) => x.toFixed(2)).join(' | ') + ` | ${d == null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(1) + '%'} |`);
    }
    for (const a of arms) {
      const q = res[a].real[n] || {};
      console.log(`  ${a === 'obs' ? '관찰' : '빨리감기'} 실물 계수기 — 벤 목재 ${(q.wcut || 0).toFixed(2)} · 잡은 마릿수 ${(q.hkill || 0).toFixed(2)} · 벌채부산물(장부 밖) ${(q.defoWood || 0).toFixed(2)}`);
    }
  }
  for (const a of arms) console.log(`\n[${a}] ${res[a].days}일 · 벽시계 ${(res[a].ms / 1000).toFixed(1)}초 · 페이지오류 ${res[a].errs.length}${res[a].errs.length ? ' — ' + res[a].errs.slice(0, 2).join(' | ') : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
