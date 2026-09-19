#!/usr/bin/env node
// === scripts/t311-hunt.js — 고기 1/3 누수 · 관찰 모드 미선발: 호출 수·값으로 짚는다 (T311) =======
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 [T297 §1 읽기 2·3]
//   T297 이 `mining` 마을에서 잰 것 둘:
//     ③ 사냥꾼 수 39↔39~40 · 잡은 마릿수 −0.0/−0.7/−0.7% 인데 **곳간 고기 −35.9/−39.7/−30.8%**.
//     ② 채집꾼이 **관찰 0명 ↔ 빨리감기 11~13명**(fruit·vegetable·mushroom·herb·twig·stone 전부 −100%).
//   T311 카드는 그 둘을 `huntIncomeReal` ↔ econ ↔ `_t172mul` 사이의 **호출 수·값**으로 짚으라 한다.
//
// ★자리 지도 — 고기가 지나는 길(전부 남의 파일 · 여기서 새로 계산하는 수 0)
//   ⓐ 랩 `전쟁실험실.html:9818 huntIncomeReal(v,npc,baseAmt)` → `return kills/hn`
//        `kills = v._hkillDay` (어제 잡은 마릿수) · `hn = v.counts.hunter` (**증분 캐시**)
//   ⓑ 엔진 `economy-sim.js:2303` 주입 문 — 사냥꾼 npc **한 명마다 한 번** 부른다.
//        그 자리에서 `npc._t172mul = skillMul*toolBoost*inputMult` 를 심는다(T172).
//   ⓒ `addProduce(meat, baseAmt)` → `amt *= _hpm*_hwm*_prodMul*satMul*_laborMul*_siegeM*_capM`
//   ⇒ **하루 고기 = Σ_{부른 사냥꾼} (kills/hn) × (문 뒤 배수)**
//     = `hkill × (호출 수 / hn) × M`.  ★누수는 두 곳밖에 없다: `호출 수/hn` 과 `M`.
//   그래서 이 자는 그 둘을 **따로** 적는다. 새 식을 세우지 않는다 — 나눗셈 둘이다.
//
// ★미선발도 같은 `counts` 를 본다 — `hasSlot(v,job,cap,counts) = cap[job] > counts[job]`
//   (`economy-sim.js:2086`). 그래서 이 자는 **`counts`(증분 캐시) 대 `v.npcs` 실제 인구조사**를
//   직업별로 같이 적는다. 둘이 어긋나면 그 어긋남이 ①의 분모이면서 ②의 문턱이다.
//
// ★★그리고 **두 팔이 같은 함수를 같은 인자 하나만 달리 부른다**는 것도 같이 적는다.
//   `lifeDayAll(doBulk)` → `lifeDay(doBulk)` 하나뿐이고(랩 `:11548`·`:11558`), 그 인자가
//   실제로 갈리는 자리는 **집 진척 한 줄**이다(랩 `:11809`):
//     빨리감기 `inc = L_BUILDRATE × slack`  ↔  관찰 `inc = min(L_BUILDCAP, max(crew초/L_BUILDSEC, L_BUILDRATE × 0.25 × slack))`
//   그 `inc` 가 `builtFloors` → `econ._mapBeds`(맵 완공 침대) → **econ 성장 게이트**
//   (`_hcap = min(housing, _mapBeds)` · `economy-sim.js:3150`)로 이어진다.
//   ⇒ 그래서 이 자는 날마다 `housing` · `_mapBeds` · 완공 층수 · 크루 누적초도 같이 적는다.
//     "누가 정본이냐"는 값이 아니라 **그 한 줄의 입력**이 답한다.
//
// ★손잡이: T311_DAYS=30 · T311_SEED=1020 · T311_NVIL=3 · T311_POP=40 · T311_SPEED=119
//          T311_JSON=/tmp/x.json · T311_ARM=obs|bulk|both(기본) · CHROME=<크로미움>
//   ⚠INIT·가상 시계·실물 손잡이는 `scripts/t297-observe.js` 의 그것을 **그대로** 쓴다(사본 아니라 같은 문법).
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const LAB = 'file://' + path.join(ROOT, 'lab', '전쟁실험실.html');
const CHROME = process.env.CHROME || '';

const DAYS = parseInt(process.env.T311_DAYS || '30', 10) || 30;
const SEED = parseInt(process.env.T311_SEED || '1020', 10);
const NVIL = parseInt(process.env.T311_NVIL || '3', 10) || 3;
const POP = parseInt(process.env.T311_POP || '40', 10) || 40;
const SPEED = parseInt(process.env.T311_SPEED || '119', 10) || 119;
const PRNG = process.env.T311_PRNG || ('0x' + (((0x9e3779b9 ^ Math.imul(SEED | 0, 0x85ebca6b)) >>> 0).toString(16)));
const ARM = process.env.T311_ARM || 'both';

const INIT = (prng) => `
(() => {
  let s = ${prng};
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0;
  const _raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => _raf(() => { vt += 16.667; cb(vt); });
  window.__vt = () => vt;
  window.L_HUNTINCOME = 'real';
  window.L_WOODINCOME = 'real';
  window.process = { env: { T100_FIELD_YIELD: '1', T193_LEDGER: '1' } };
})();
`;

// ★계측 — **랩 파일은 안 만진다.** 페이지에서 함수 둘을 감싼다.
//   ⓐ `huntIncomeReal` — 전역 함수 선언이라 `window.huntIncomeReal` 로 덮으면
//     랩 자신이 매일 `ECON_WORLD.huntIncomeFn=…huntIncomeReal` 로 다시 심을 때 **감싼 것**을 심는다(:11553).
//   ⓑ `lifeDayAll` — T297 이 쓴 그 자리. 하루가 끝난 직후 장부·캐시·인구조사를 적는다.
const HOOK = () => {
  if (window.__t311) return;
  // ★직업 목록은 짓지 않는다 — `counts` 캐시의 키와 실제 인구조사 키의 **합집합**을 돈다(누락 0).
  window.__t311 = { days: 0, vil: {}, day1: {} };
  const V = (n) => (window.__t311.vil[n] || (window.__t311.vil[n] = {
    hiCalls: 0, hiRetSum: 0, hiHnSum: 0, hiKillSum: 0, meat: 0, hkill: 0,
    days: 0, driftDays: 0, driftMax: 0, driftJobMax: {}, rows: [],
  }));
  const nameOf = (v) => {                    // econ 마을 → 랩 이름(VILS 백참조가 없으면 econ.name)
    if (typeof VILS !== 'undefined' && VILS) for (const vil of VILS) if (vil.econ === v) return vil.name;
    return (v && v.name) || '?';
  };
  const _hi = window.huntIncomeReal;
  window.huntIncomeReal = function (v, npc, baseAmt, mul) {
    const r = _hi.apply(this, arguments);
    const t = V(nameOf(v));
    t.hiCalls++;
    t.hiRetSum += (typeof r === 'number' ? r : 0);
    t.hiHnSum += ((v.counts && v.counts.hunter) || 0);
    t.hiKillSum += (v._hkillDay || 0);
    t._mulSum = (t._mulSum || 0) + (typeof mul === 'number' ? mul : 0);
    t._t172 = (npc && typeof npc._t172mul === 'number') ? npc._t172mul : null;
    return r;
  };
  const _orig = window.lifeDayAll;
  window.lifeDayAll = function () {
    const before = {};
    for (const vil of VILS) { const e = vil.econ; if (e) before[vil.name] = { calls: V(vil.name).hiCalls, ret: V(vil.name).hiRetSum }; }
    const out = _orig.apply(this, arguments);
    const A = window.__t311;
    for (const vil of VILS) {
      const e = vil.econ; if (!e) continue;
      const t = V(vil.name);
      // ★인구조사 — `v.npcs` 를 직접 세어 본다(증분 캐시 `counts` 와 견주려고)
      const cen = {}; for (const n of (e.npcs || [])) cen[n.currentJob] = (cen[n.currentJob] || 0) + 1;
      const cnt = e.counts || {};
      let sumC = 0, sumX = 0, dmax = 0;
      const keys = {}; for (const k in cnt) keys[k] = 1; for (const k in cen) keys[k] = 1;
      for (const j in keys) {
        const c = cnt[j] || 0, x = cen[j] || 0; sumC += c; sumX += x;
        const d = c - x; if (Math.abs(d) > Math.abs(t.driftJobMax[j] || 0)) t.driftJobMax[j] = d;
        if (Math.abs(d) > Math.abs(dmax)) dmax = d;
      }
      const buf = e.dailyProductionBuf || {};
      const dCalls = t.hiCalls - ((before[vil.name] || {}).calls || 0);
      const dRet = t.hiRetSum - ((before[vil.name] || {}).ret || 0);
      t.days++;
      t.meat += (buf.meat || 0);
      t.hkill += (e._hkillDay || 0);
      if (sumC !== sumX) t.driftDays++;
      if (Math.abs(dmax) > Math.abs(t.driftMax)) t.driftMax = dmax;
      t.role = vil.role || 'agri';
      t.pop = (e.npcs || []).length;
      t.popCounts = sumC;
      t.deaths = vil._deaths || 0;
      t.inj = vil._inj || 0;
      t.last = {
        cntHunter: cnt.hunter || 0, cenHunter: cen.hunter || 0,
        cntForager: cnt.forager || 0, cenForager: cen.forager || 0,
        cntFisher: cnt.fisher || 0, cenFisher: cen.fisher || 0,
        laborMul: (e._laborMul == null ? 1 : e._laborMul),
        hwmLast: (e._hwmLast == null ? null : e._hwmLast),
        health: (e.lastStats && e.lastStats.health) != null ? +e.lastStats.health.toFixed(4) : null,
        happy: (e.lastStats && e.lastStats.happiness) != null ? +e.lastStats.happiness.toFixed(4) : null,
        prodS: (e.lastStats && e.lastStats.production) != null ? +e.lastStats.production.toFixed(4) : null,
        stockMeat: +((e.storage && e.storage.meat) || 0).toFixed(3),
        t172: t._t172,
      };
      // ★[②] 집 진척 사슬 — `inc`(랩 :11809) → `builtFloors` → `econ._mapBeds` → 성장 게이트
      let _bf = 0, _crew = 0, _hn = 0, _pf = 0;
      for (const h of (vil.houses || [])) {
        if (h.player) { _pf += (h.builtFloors || 0); continue; }
        _hn++; _bf += (h.builtFloors || 0); _crew += (h._crewTot || 0);
      }
      t.last.housing = (e.housing == null ? null : +e.housing.toFixed(3));
      t.last.mapBeds = (e._mapBeds == null ? null : e._mapBeds);
      t.last.houses = _hn; t.last.builtFloors = _bf; t.last.crewTot = Math.round(_crew); t.last.playerFloors = _pf;
      t.rows.push({
        d: A.days + 1, pop: t.pop, cnt: sumC, drift: sumC - sumX,
        housing: (e.housing == null ? null : +e.housing.toFixed(3)), beds: (e._mapBeds == null ? null : e._mapBeds),
        hN: _hn, bf: _bf, crew: Math.round(_crew), foodEq: +((e.storage && e.storage.food) || 0).toFixed(2),
        dh: (cnt.hunter || 0) - (cen.hunter || 0), df: (cnt.forager || 0) - (cen.forager || 0),
        cH: cnt.hunter || 0, xH: cen.hunter || 0, cF: cnt.forager || 0, xF: cen.forager || 0,
        capF: null,
        calls: dCalls, ret: +dRet.toFixed(4), meat: +(buf.meat || 0).toFixed(4),
        hkill: +(e._hkillDay || 0).toFixed(4), deaths: vil._deaths || 0,
      });
    }
    A.days++;
    return out;
  };
  // ★집 진척 상수는 **랩이 갖는다** — 여기서 짓지 않고 읽어만 둔다(사본 0)
  window.__t311.K = {
    L_BUILDRATE: (typeof L_BUILDRATE !== 'undefined') ? L_BUILDRATE : null,
    L_BUILDCAP: (typeof L_BUILDCAP !== 'undefined') ? L_BUILDCAP : null,
    L_BUILDSEC: (typeof L_BUILDSEC !== 'undefined') ? L_BUILDSEC : null,
    L_FLOORCAP: (typeof L_FLOORCAP !== 'undefined') ? L_FLOORCAP : null,
  };
  window.__t311out = () => window.__t311;
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
      const d = await page.evaluate(() => window.__t311.days);
      if (d >= DAYS) break;
      if (Date.now() - t0 > 3600000) { errs.push('시간 초과 — day ' + d); break; }
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => lifeToggle());
  } else {
    await page.evaluate((n) => { for (let i = 0; i < n; i++) lifeDayAll(true); }, DAYS);
  }
  const out = await page.evaluate(() => window.__t311out());
  const ms = Date.now() - t0;
  await browser.close();
  return { arm, seed: SEED, days: out.days, ms, errs, vil: out.vil, K: out.K };
}

(async () => {
  const res = {};
  for (const a of (ARM === 'both' ? ['obs', 'bulk'] : [ARM])) {
    process.stderr.write(`  · ${a} 시드 ${SEED} ${DAYS}일 …\n`);
    res[a] = await runArm(a);
    process.stderr.write(`    ${res[a].days}일 · ${(res[a].ms / 1000).toFixed(1)}초 · 오류 ${res[a].errs.length}\n`);
  }
  if (process.env.T311_JSON) { fs.writeFileSync(process.env.T311_JSON, JSON.stringify(res, null, 1)); console.log('  JSON: ' + process.env.T311_JSON); }
  const arms = Object.keys(res);
  const names = Object.keys((res[arms[0]] || {}).vil || {});
  for (const n of names) {
    const r0 = res[arms[0]].vil[n] || {};
    console.log(`\n### ${n} (${r0.role}) — 시드 ${SEED} · ${DAYS}일`);
    console.log('  | 팔 | 인구 | Σcounts | 어긋난 날 | 최대 어긋남 | 사냥꾼 counts↔조사 | 채집 counts↔조사 | 어부 counts↔조사 | 맹수死 |');
    console.log('  |---|---|---|---|---|---|---|---|---|');
    for (const a of arms) {
      const t = res[a].vil[n] || {}; const L = t.last || {};
      console.log(`  | ${a === 'obs' ? '관찰' : '빨리감기'} | ${t.pop} | ${t.popCounts} | ${t.driftDays}/${t.days} | ${t.driftMax} | ${L.cntHunter}↔${L.cenHunter} | ${L.cntForager}↔${L.cenForager} | ${L.cntFisher}↔${L.cenFisher} | ${t.deaths} |`);
    }
    console.log('\n  **고기 사슬** — 하루 고기 = `hkill × (호출 수/hn) × M`');
    console.log('  | 팔 | 잡은 마릿수 Σ | huntIncomeReal 호출 Σ | Σhn(호출마다) | Σ반환값 | 곳간行 고기 Σ | 호출/hn | M = 고기/Σ반환 |');
    console.log('  |---|---|---|---|---|---|---|---|');
    for (const a of arms) {
      const t = res[a].vil[n] || {};
      const rc = t.hiHnSum ? (t.hiCalls / (t.hiHnSum / Math.max(1, t.hiCalls))) : 0;
      const perCall = t.hiCalls ? (t.hiHnSum / t.hiCalls) : 0;
      console.log(`  | ${a === 'obs' ? '관찰' : '빨리감기'} | ${(t.hkill || 0).toFixed(2)} | ${t.hiCalls} | ${(t.hiHnSum || 0).toFixed(0)} (평균 hn ${perCall.toFixed(2)}) | ${(t.hiRetSum || 0).toFixed(2)} | ${(t.meat || 0).toFixed(2)} | ${perCall ? (t.hiCalls / t.days / perCall).toFixed(4) : '—'} | ${t.hiRetSum ? (t.meat / t.hiRetSum).toFixed(4) : '—'} |`);
    }
    for (const a of arms) {
      const L = (res[a].vil[n] || {}).last || {};
      console.log(`  ${a === 'obs' ? '관찰' : '빨리감기'} 문 뒤 배수 재료 — _laborMul ${L.laborMul} · _hwmLast ${L.hwmLast} · health ${L.health} · happy ${L.happy} · production ${L.prodS} · 곳간 meat ${L.stockMeat} · npc._t172mul ${L.t172}`);
    }
    console.log('\n  **성장 게이트** — `_hcap = min(housing, _mapBeds)`(`economy-sim.js:3150`) · 침대는 `builtFloors × L_FLOORCAP`');
    console.log('  | 팔 | 인구 | econ housing | 맵 침대 _mapBeds | 집 채 | 완공 층 | 크루 누적초 |');
    console.log('  |---|---|---|---|---|---|---|');
    for (const a of arms) {
      const L = (res[a].vil[n] || {}).last || {};
      console.log(`  | ${a === 'obs' ? '관찰' : '빨리감기'} | ${(res[a].vil[n] || {}).pop} | ${L.housing} | ${L.mapBeds} | ${L.houses} | ${L.builtFloors} | ${L.crewTot} |`);
    }
    if (process.env.T311_ROWS) {
      for (const a of arms) {
        const t = res[a].vil[n] || {};
        console.log(`\n  [${a}] 일별 — d/pop/Σcnt/어긋남/사냥어긋/채집어긋/호출/반환/고기/마릿수/死/housing/침대/완공층/크루초`);
        for (const r of (t.rows || [])) console.log(`   ${r.d}\t${r.pop}\t${r.cnt}\t${r.drift}\t${r.dh}\t${r.df}\t${r.calls}\t${r.ret}\t${r.meat}\t${r.hkill}\t${r.deaths}\t${r.housing}\t${r.beds}\t${r.bf}\t${r.crew}`);
      }
    }
  }
  for (const a of arms) console.log(`\n[${a}] ${res[a].days}일 · ${(res[a].ms / 1000).toFixed(1)}초 · 페이지오류 ${res[a].errs.length}${res[a].errs.length ? ' — ' + res[a].errs.slice(0, 2).join(' | ') : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
