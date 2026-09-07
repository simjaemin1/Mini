#!/usr/bin/env node
// === scripts/test-lab-alloc.js — T161 하네스: 실현 배분이 실제로 실현을 보는가 ============
//
// @regress 아님 — **랩 하네스다**(브라우저를 띄운다). 러너 전수에는 안 넣는다.
//
// 무엇을 거나:
//   ① 되돌림 — `L_ALLOC_REAL=0` 이면 문이 안 열린다(`world.allocFn` 부재 = 종전 비트)
//   ② 문이 열리면 후보 목록이 실제로 다시 쓰인다(EMA 가 선다)
//   ③ 첫 정산 전 폴백 = **종전 값 그대로**(문이 열려도 첫 호출은 null 을 돌려준다)
//   ④ ★양 자리 — 실현 산출을 반으로 줄이면 한계가치도 반이 된다
//   ⑤ ★값 자리 — 바구니 구성이 바뀌면(한 품목 값만 올리면) 한계가치가 그 몫만큼 따라간다
//   ⑥ 바구니는 **엔진 표**가 정한다(사본 0) — `JOBS[j].output`·`byproduct`·`foragerYieldsFor`
//   ⑦ 돌연변이 — 창을 0 으로(`L_ALLOC_WIN=0`) 하면 평활이 사라져 하루치 요동이 그대로 든다
//   ⑧ 서버 표 — `FORAGE_FOOD_FACTOR` 에 `mulberry_fruit` 이 있고 값은 산포도와 같다(새 수 0)
//
// 실행: node scripts/test-lab-alloc.js
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const LAB = path.resolve(__dirname, '..', 'lab', '전쟁실험실.html');
const PRNG = (seed) => `(()=>{let s=${seed}|0;Math.random=function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();`;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d ? '  ' + d : '')); } };

async function open(env) {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG(7));
  if (env) await p.addInitScript(env);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + LAB, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1200);
  return { b, p, errs };
}

(async () => {
  console.log('\n=== T161 랩 배분 하네스 ===\n');

  // ── ⑧ 서버 표 먼저(브라우저 없이) ───────────────────────────────────────────
  console.log('⑧ 서버 표 — 오디 식량계수');
  {
    const E = require(path.resolve(__dirname, '..', 'sim', 'economy-sim.js'));
    const F = E.FORAGE_FOOD_FACTOR;
    ok(F.mulberry_fruit !== undefined, '`mulberry_fruit` 이 FORAGE_FOOD_FACTOR 에 있다', `= ${F.mulberry_fruit}`);
    ok(F.mulberry_fruit === F.grape, '값은 산포도(`grape`)와 **같은 수**다 — 새 수 0', `grape=${F.grape}`);
    const src = require('fs').readFileSync(path.resolve(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
    ok(/FORAGE_FOOD_FACTOR\.mulberry_fruit\s*=\s*FORAGE_FOOD_FACTOR\.grape\s*;/.test(src),
       '소스가 **수를 안 적고 참조로** 쓴다(손으로 0.3 을 적지 않았다)');
  }

  // ── ① 되돌림 ───────────────────────────────────────────────────────────────
  console.log('\n① 되돌림 = **기본** — 문을 안 연다(다른 세션의 랩 기준선을 안 건드린다)');
  {
    const { b, p, errs } = await open(null);   // ★기본이 곧 되돌림이다(문을 안 연다)
    const r = await p.evaluate(() => { document.getElementById('seed').value = '7'; document.getElementById('nvil').value = '4'; reseed(); lifeInit();
      for (let d = 0; d < 40; d++) lifeDayAll(true);
      return { attached: typeof (ECON_WORLD || {}).allocFn === 'function', ema: !!(VILS[0].econ._t161ema), pop: VILS.reduce((a, v) => a + v.econ.npcs.length, 0) }; });
    ok(!r.attached, '`world.allocFn` 이 **없다**');
    ok(!r.ema, '마을에 EMA 가 안 선다(처방이 한 번도 안 돌았다)');
    ok(errs.length === 0, '페이지 오류 0', errs.join(' | '));
    await b.close();
  }

  // ── ②③ 문이 열린다 · 첫 호출은 폴백 ────────────────────────────────────────
  console.log('\n②③ 문이 열린다 · 첫 정산 전 폴백');
  {
    const { b, p, errs } = await open('window.L_ALLOC_REAL=1;');
    const r = await p.evaluate(() => {
      document.getElementById('seed').value = '7'; document.getElementById('nvil').value = '4'; reseed(); lifeInit();
      const out = { attached: typeof ECON_WORLD.allocFn === 'function' };
      // 첫 호출 — 손으로 문을 두드려 본다(엔진이 부르는 것과 같은 계약)
      const v = VILS[0].econ;
      const ctx = { period: 100, counts: { farmer: 1 }, w: () => 1, JOBS: { farmer: { output: 'food' } }, forageYields: () => ({}) };
      out.first = ECON_WORLD.allocFn(v, ECON_WORLD, [['farmer', 42]], ctx);
      out.emaAfterFirst = !!v._t161ema;
      v.dailyProductionBuf.food = 10;
      ECON_WORLD.day = (ECON_WORLD.day || 0) + 100;
      out.second = ECON_WORLD.allocFn(v, ECON_WORLD, [['farmer', 42]], ctx);
      return out; });
    ok(r.attached, '`world.allocFn` 이 걸려 있다');
    ok(r.first === null, '★첫 호출은 **null** 을 돌려준다 = 종전 후보 그대로(폴백)');
    ok(r.emaAfterFirst, '그래도 EMA 는 그때부터 접기 시작한다');
    ok(Array.isArray(r.second) && r.second.length === 1 && r.second[0][0] === 'farmer',
       '둘째 호출부터 후보를 다시 쓴다', JSON.stringify(r.second));
    ok(errs.length === 0, '페이지 오류 0', errs.join(' | '));
    await b.close();
  }

  // ── ④⑤⑥⑦ 양·값·바구니·창 ─────────────────────────────────────────────────
  console.log('\n④⑤⑥⑦ 양 자리 · 값 자리 · 바구니 · 창');
  {
    const { b, p, errs } = await open('window.L_ALLOC_REAL=1;');
    const r = await p.evaluate(() => {
      document.getElementById('seed').value = '7'; document.getElementById('nvil').value = '4'; reseed(); lifeInit();
      const W = ECON_WORLD, out = {};
      const mk = () => { const v = { dailyProductionBuf: {}, npcs: [] }; return v; };
      const ctx = (counts, wf, JOBS, yields) => ({ period: 100, counts, w: wf || (() => 1),
        JOBS: JOBS || { farmer: { output: 'food' } }, forageYields: () => (yields || {}) });
      const settle = (v, c, prod, wf, JOBS, yields) => {      // 두 번 불러 EMA 를 세운다(창을 다 채운다)
        W.day = 0; v._t161day = undefined; v._t161ema = undefined;
        v.dailyProductionBuf = Object.assign({}, prod);
        W.allocFn(v, W, [['farmer', 1]], ctx(c, wf, JOBS, yields));
        W.day = 100000;                                       // Δ일 ≫ 창 ⇒ α=1 ⇒ EMA = 오늘치
        return W.allocFn(v, W, [['farmer', 1]], ctx(c, wf, JOBS, yields))[0][1];
      };
      // ④ 양 — 실현을 반으로
      const g1 = settle(mk(), { farmer: 2 }, { food: 20 });
      const g2 = settle(mk(), { farmer: 2 }, { food: 10 });
      out.q = [g1, g2];
      // ④' 1인당 — 인원을 두 배로
      const g3 = settle(mk(), { farmer: 4 }, { food: 20 });
      out.perCap = [g1, g3];
      // ⑤ 값 — 값만 두 배로
      const g4 = settle(mk(), { farmer: 2 }, { food: 20 }, (r) => (r === 'food' ? 2 : 1));
      out.price = [g1, g4];
      // ⑤' 바구니 구성 — 부산물이 절반, 그 값만 올린다
      const J2 = { farmer: { output: 'food', byproduct: { wheat: 0.25 } } };
      const g5 = settle(mk(), { farmer: 2 }, { food: 10, wheat: 10 }, () => 1, J2);
      const g6 = settle(mk(), { farmer: 2 }, { food: 10, wheat: 10 }, (r) => (r === 'wheat' ? 3 : 1), J2);
      out.basket = [g5, g6];
      // ⑥ 바구니가 엔진 표를 읽나 — byproduct 를 빼면 그 몫이 사라진다
      const g7 = settle(mk(), { farmer: 2 }, { food: 10, wheat: 10 }, () => 1, { farmer: { output: 'food' } });
      out.table = [g5, g7];
      // ⑥' 채집꾼 — forageYields 가 바구니에 들어간다
      const JF = { forager: { produceSpecial: 'forager' } };
      const cf = (c, wf, y) => ({ period: 100, counts: c, w: wf || (() => 1), JOBS: JF, forageYields: () => y });
      const settleF = (prod, y) => { const v = mk(); W.day = 0; v._t161day = undefined; v._t161ema = undefined;
        v.dailyProductionBuf = Object.assign({}, prod);
        W.allocFn(v, W, [['forager', 1]], cf({ forager: 1 }, null, y)); W.day = 100000;
        return W.allocFn(v, W, [['forager', 1]], cf({ forager: 1 }, null, y))[0][1]; };
      out.forage = [settleF({ mushroom: 5, stone: 5 }, { mushroom: 1 }), settleF({ mushroom: 5, stone: 5 }, {})];
      // ⑦ 창 — 0 이면 평활 없음(하루치가 그대로), 1 이면 Δ일/창 만큼만 접힌다
      const winTest = (win) => { window.L_ALLOC_WIN = win; const v = mk();
        W.day = 0; v.dailyProductionBuf = { food: 0 }; W.allocFn(v, W, [['farmer', 1]], ctx({ farmer: 1 }));
        W.day = 1; v.dailyProductionBuf = { food: 100 };                       // 하루만 폭등
        return W.allocFn(v, W, [['farmer', 1]], ctx({ farmer: 1 }))[0][1]; };
      out.win = [winTest(1), winTest(0)];
      window.L_ALLOC_WIN = 1;
      return out; });
    const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1e-6 : t) * Math.max(1, Math.abs(a));
    ok(near(r.q[1], r.q[0] / 2), '★④ 실현 산출이 반이면 한계가치도 **반**이다', `${r.q[0]} → ${r.q[1]}`);
    ok(near(r.perCap[1], r.perCap[0] / 2), "④' 인원이 두 배면 1인당이라 **반**이다", `${r.perCap[0]} → ${r.perCap[1]}`);
    ok(near(r.price[1], r.price[0] * 2), '★⑤ 값이 두 배면 한계가치도 **두 배**다', `${r.price[0]} → ${r.price[1]}`);
    ok(r.basket[1] > r.basket[0] * 1.9 && r.basket[1] < r.basket[0] * 2.1,
       "★⑤' 바구니 절반 품목의 값을 3배로 하면 **평균이 2배**(양 가중)", `${r.basket[0]} → ${r.basket[1]}`);
    ok(near(r.table[1], r.table[0] / 2), '⑥ 바구니는 **엔진 표**가 정한다 — byproduct 를 빼면 그 몫이 빠진다', `${r.table[0]} → ${r.table[1]}`);
    ok(r.forage[0] > r.forage[1], "⑥' 채집꾼 바구니에 `foragerYieldsFor` 가 들어간다", `${r.forage[0]} vs ${r.forage[1]}`);
    ok(r.win[1] > r.win[0] * 5, '★⑦ 돌연변이 — 창을 0 으로 하면 하루 요동이 그대로 든다', `창1 ${r.win[0].toFixed(2)} · 창0 ${r.win[1].toFixed(2)}`);
    ok(errs.length === 0, '페이지 오류 0', errs.join(' | '));
    await b.close();
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})();
