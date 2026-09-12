#!/usr/bin/env node
// === scripts/test-lab-alloc.js — T161/T164 하네스: 실현 배분이 실제로 실현을 보는가 ==========
//
// @regress 아님 — **랩 하네스다**(브라우저를 띄운다). 러너 전수에는 안 넣는다.
//
// ★[T164] 정본이 `sim/economy-sim.js` 로 옮겨왔다. 그래서 이 하네스는 **두 경로를 다 건다**:
//   ⓢ 서버 경로 — `require('sim/economy-sim').allocRealCandidates` 를 직접 부른다(브라우저 없이)
//   ⓛ 랩 경로   — 인라인 번들이 **같은 함수**를 태우는지(손잡이 하나로 켜지는지)
//
// 무엇을 거나:
//   ① 되돌림 = 기본 — 손잡이가 없으면 `allocRealOn()` 이 거짓이고 마을에 EMA 가 안 선다
//   ② 손잡이를 켜면 후보 목록이 실제로 다시 쓰인다
//   ③ 첫 정산 전 폴백 = **종전 값 그대로**(첫 호출은 null)
//   ④ ★양 자리 — 실현 산출을 반으로 줄이면 한계가치도 반
//   ⑤ ★값 자리 — 바구니 구성이 바뀌면 한계가치가 그 몫만큼 따라간다
//   ⑥ 바구니는 **엔진 표**가 정한다(사본 0)
//   ⑦ 돌연변이 — 창을 0 으로(`L_ALLOC_WIN=0`) 하면 평활이 사라져 하루치 요동이 그대로 든다
//   ⑧ 서버 표 — `FORAGE_FOOD_FACTOR` 에 `mulberry_fruit` 이 있고 값은 산포도와 같다(새 수 0)
//   ⑨ ★사본 0 — 랩 HTML 이 제 `allocRealFn`/`allocBasketOf` 를 **안 들고 있다**
//   ⑩ ★[T184 2판] 주산물 항 — 항이 종전식의 그 품목·그 값식이고, 되돌림이 1판으로 돌아간다
//   ⑪ ★[T184 2판] **축 검사** — 실현÷종전 배율이 직업 간 한 자릿수 안(1판이면 두 자릿수 → 빨강)
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

  // ── ⑨ 사본 0 — 랩 HTML 이 제 처방을 안 들고 있다 ───────────────────────────
  console.log('\n⑨ 사본 0 — 정본은 econ 한 곳뿐');
  {
    const fs = require('fs');
    const html = fs.readFileSync(LAB, 'utf8');
    const inl = html.slice(html.indexOf('economy-engine'));   // 인라인 엔진 블록 이후 = 번들이 실은 정본
    const own = html.slice(0, html.indexOf('economy-engine'));
    ok(!/function\s+allocRealFn\s*\(/.test(html), '랩에 `allocRealFn` 정의가 **없다**(T161 사본 제거)');
    ok((html.match(/function\s+allocBasketOf\s*\(/g) || []).length === 1,
       '`allocBasketOf` 정의는 **하나**뿐이다(인라인 번들이 실은 정본)');
    ok(/ECON_WORLD\.allocFn/.test(html) === false, '랩이 `ECON_WORLD.allocFn` 을 안 건다(정본이 손잡이로 켠다)');
  }

  // ── ⓢ 서버 경로 — 브라우저 없이 정본을 직접 부른다 ─────────────────────────
  console.log('\nⓢ 서버 경로 — 정본 함수를 직접 (④⑤ 는 **1판 의미**라 `L_ALLOC_BASKET=1` 로 건다)');
  {
    const E = require(path.resolve(__dirname, '..', 'sim', 'economy-sim.js'));
    process.env.L_ALLOC_BASKET = '1';   // ★[T184] 아래 ④⑤ 는 바구니 소득(1판)의 성질이다
    delete process.env.L_ALLOC_REAL;
    ok(E.allocRealOn() === false, '손잡이가 없으면 **꺼짐**이 기본이다');
    process.env.L_ALLOC_REAL = '1';
    ok(E.allocRealOn() === true, '`L_ALLOC_REAL=1` 이면 켜진다');
    process.env.L_ALLOC_REAL = '0';
    ok(E.allocRealOn() === false, '`L_ALLOC_REAL=0` 이면 꺼진다(되돌림)');
    delete process.env.L_ALLOC_REAL;
    const JOBS = { farmer: { output: 'food', byproduct: { wheat: 0.25 } }, merchant: {} };
    const ctx = (counts, wf) => ({ period: 100, counts, w: wf || (() => 1), JOBS, forageYields: () => ({}) });
    const W = { day: 0 };
    const settle = (prod, counts, wf) => {
      const v = { dailyProductionBuf: Object.assign({}, prod) };
      W.day = 0; E.allocRealCandidates(v, W, [['farmer', 1]], ctx(counts, wf));
      W.day = 100000;                                   // Δ일 ≫ 창 ⇒ α=1 ⇒ EMA = 오늘치
      return E.allocRealCandidates(v, W, [['farmer', 1]], ctx(counts, wf))[0][1];
    };
    const v0 = { dailyProductionBuf: { food: 1 } };
    W.day = 0;
    ok(E.allocRealCandidates(v0, W, [['farmer', 9]], ctx({ farmer: 1 })) === null,
       'ⓢ③ 첫 호출은 **null**(폴백 = 종전 값)');
    const g1 = settle({ food: 20 }, { farmer: 2 });
    const g2 = settle({ food: 10 }, { farmer: 2 });
    ok(Math.abs(g2 - g1 / 2) < 1e-9, 'ⓢ④ 실현이 반이면 한계가치도 반', `${g1} → ${g2}`);
    const g3 = settle({ food: 20 }, { farmer: 2 }, (r) => (r === 'food' ? 2 : 1));
    ok(Math.abs(g3 - g1 * 2) < 1e-9, 'ⓢ⑤ 값이 두 배면 두 배', `${g1} → ${g3}`);
    const g4 = settle({ food: 10, wheat: 10 }, { farmer: 2 });
    const g5 = settle({ food: 10, wheat: 10 }, { farmer: 2 }, (r) => (r === 'wheat' ? 3 : 1));
    ok(Math.abs(g5 - g4 * 2) < 1e-9, "ⓢ⑤' 바구니 절반 값 3배 → 평균 2배(양 가중)", `${g4} → ${g5}`);
    const vm = { dailyProductionBuf: { food: 10 } };
    W.day = 0; E.allocRealCandidates(vm, W, [['merchant', 7]], ctx({ merchant: 1 })); W.day = 100000;
    ok(E.allocRealCandidates(vm, W, [['merchant', 7]], ctx({ merchant: 1 }))[0][1] === 7,
       'ⓢ 생산 없는 직업(상인)은 **받은 값 그대로**');
    // ⓢ⑦ 창 돌연변이
    const win = (wv) => { if (wv === null) delete process.env.L_ALLOC_WIN; else process.env.L_ALLOC_WIN = String(wv);
      const v = { dailyProductionBuf: { food: 0 } };
      W.day = 0; E.allocRealCandidates(v, W, [['farmer', 1]], ctx({ farmer: 1 }));
      v.dailyProductionBuf.food = 100; W.day = 1;
      return E.allocRealCandidates(v, W, [['farmer', 1]], ctx({ farmer: 1 }))[0][1]; };
    const w1 = win(null), w0 = win(0); delete process.env.L_ALLOC_WIN;
    ok(w0 > w1 * 5, 'ⓢ⑦ 돌연변이 — 창 0 이면 하루 요동이 그대로', `창1 ${w1.toFixed(2)} · 창0 ${w0.toFixed(2)}`);
    delete process.env.L_ALLOC_BASKET;
  }

  // ── ⑩⑪ ★[T184] 2판 — 주산물 항 · 축이 종전과 같은가 ────────────────────────
  console.log('\n⑩⑪ [T184 2판] 주산물 항 · 축 검사');
  {
    const E = require(path.resolve(__dirname, '..', 'sim', 'economy-sim.js'));
    delete process.env.L_ALLOC_BASKET;
    const W = (r) => ({ food: 3, fish: 5, meat: 7, hide: 2, wood: 4, ore: 9, vegetable: 6, herb: 8, stone: 1.5 }[r] || 1);
    const YIELDS = { fruit: 1, vegetable: 1, mushroom: 1, herb: 1, grape: 1 };
    const ctx = (counts) => ({ period: 100, counts, w: W, JOBS: E.JOBS, forageYields: () => YIELDS });
    // ⑩ 항의 품목·값식이 종전식 그대로인가
    const terms = (j) => E.allocTermsOf(j, ctx({}), {});
    const T = {}; for (const j of ['farmer', 'fisher', 'hunter', 'lumberjack', 'miner', 'forager', 'merchant'])
      T[j] = terms(j);
    ok(T.farmer.length === 1 && T.farmer[0][0].join() === 'food' && T.farmer[0][1]() === W('food'),
       '⑩ 농부 = (`food`, w(food)) — 종전식 그대로');
    ok(T.lumberjack[0][0].join() === 'wood' && T.lumberjack[0][1]() === W('wood'),
       '⑩ 나무꾼 = (`wood`, w(wood)) — 바구니가 **주산물 하나**(resin·bark·acorn 빠진다)');
    ok(T.miner[0][0].join() === 'ore' && T.miner[0][1]() === W('ore'), '⑩ 광부 = (`ore`, w(ore))');
    ok(T.hunter[0][0].join() === 'meat' && Math.abs(T.hunter[0][1]() - (W('meat') + 0.3 * W('hide'))) < 1e-12,
       '★⑩ 사냥꾼 값식의 **예외를 그대로 옮겼다** — `w(meat) + 0.3·w(hide)`');
    ok(T.forager.length === 2 && T.forager[1][0].join() === 'stone'
       && Math.abs(T.forager[0][1]() - (W('vegetable') + 0.6 * W('herb'))) < 1e-12
       && T.forager[0][0].indexOf('stone') < 0,
       '★⑩ 채집꾼은 **항이 둘** — (믹스, w(veg)+0.6·w(herb)) + (`stone`, w(stone))');
    ok(T.merchant === null, '⑩ 상인은 항이 없다 → 폴백(종전 값 그대로)');

    // ⑪ 축 검사 — 실현이 **종전식의 양**과 같으면 2판 값은 종전 값과 같아야 한다(비 = 1.00)
    const W0 = { day: 0 };
    const run = (job, prod, n) => {
      const v = { dailyProductionBuf: Object.assign({}, prod) };
      W0.day = 0; E.allocRealCandidates(v, W0, [[job, 1]], ctx({ [job]: n }));
      W0.day = 100000;
      return E.allocRealCandidates(v, W0, [[job, 1]], ctx({ [job]: n }))[0][1];
    };
    const N = 4, per = 2.5;                       // 1인당 실현 양(임의) — 종전식의 '땅×계수' 자리에 그대로 넣는다
    const cases = [
      ['farmer', { food: per * N }, per * W('food') * 100],
      ['fisher', { fish: per * N }, per * W('fish') * 100],
      ['lumberjack', { wood: per * N }, per * W('wood') * 100],
      ['miner', { ore: per * N }, per * W('ore') * 100],
      ['hunter', { meat: per * N }, per * (W('meat') + 0.3 * W('hide')) * 100],
    ];
    const ratios = [];
    for (const [j, prod, expect] of cases) {
      const g = run(j, prod, N);
      ratios.push(g / expect);
      ok(Math.abs(g / expect - 1) < 1e-9, `★⑪ ${j} — 실현 양이 종전 양과 같으면 값도 **같다**(비 1.000)`,
        `${g.toFixed(1)} vs ${expect.toFixed(1)}`);
    }
    const spread = Math.max.apply(null, ratios) / Math.min.apply(null, ratios);
    ok(spread < 10, '★⑪ 축 검사 — 직업 간 배율 퍼짐이 **한 자릿수 안**', `퍼짐 ×${spread.toFixed(2)}`);

    // ⑪ 돌연변이 — 1판(바구니 전체)으로 되돌리면 같은 설정에서 배율이 흩어진다
    process.env.L_ALLOC_BASKET = '1';
    const r1 = [];
    for (const [j, prod, expect] of cases) {
      const extra = Object.assign({}, prod);
      if (j === 'lumberjack') { extra.resin = per * N; extra.bark = per * N; }   // 종전식이 안 보던 부산물
      if (j === 'fisher') { extra.salmon = per * N; extra.salt = per * N; }
      r1.push(run(j, extra, N) / expect);
    }
    process.env.L_ALLOC_BASKET = '';
    const spread1 = Math.max.apply(null, r1) / Math.min.apply(null, r1);
    ok(spread1 > spread * 1.5, '★⑪ 돌연변이 — 1판(바구니 전체)으로 되돌리면 퍼짐이 **커진다**',
      `2판 ×${spread.toFixed(2)} → 1판 ×${spread1.toFixed(2)}`);
  }

  // ── ① 되돌림 ───────────────────────────────────────────────────────────────
  console.log('\n① 되돌림 = **기본** — 문을 안 연다(다른 세션의 랩 기준선을 안 건드린다)');
  {
    const { b, p, errs } = await open(null);   // ★기본이 곧 되돌림이다(손잡이가 없다)
    const r = await p.evaluate(() => { document.getElementById('seed').value = '7'; document.getElementById('nvil').value = '4'; reseed(); lifeInit();
      for (let d = 0; d < 40; d++) lifeDayAll(true);
      return { on: !!(EconEngine.allocRealOn && EconEngine.allocRealOn()), ema: !!(VILS[0].econ._allocEma), pop: VILS.reduce((a, v) => a + v.econ.npcs.length, 0) }; });
    ok(!r.on, '랩에서도 `allocRealOn()` 이 **거짓**이다(손잡이 없음 = 기본)');
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
      const out = { on: !!EconEngine.allocRealOn() };
      // 정본을 직접 부른다 — 랩이 태운 그 함수가 서버 것과 **같은 함수**인지 본다
      const v = VILS[0].econ;
      const ctx = { period: 100, counts: { farmer: 1 }, w: () => 1, JOBS: { farmer: { output: 'food' } }, forageYields: () => ({}) };
      out.first = EconEngine.allocRealCandidates(v, ECON_WORLD, [['farmer', 42]], ctx);
      out.emaAfterFirst = !!v._allocEma;
      v.dailyProductionBuf.food = 10;
      ECON_WORLD.day = (ECON_WORLD.day || 0) + 100;
      out.second = EconEngine.allocRealCandidates(v, ECON_WORLD, [['farmer', 42]], ctx);
      return out; });
    ok(r.on, '랩에서 손잡이가 켜지면 `allocRealOn()` 이 참이다');
    ok(r.first === null, '★첫 호출은 **null** 을 돌려준다 = 종전 후보 그대로(폴백)');
    ok(r.emaAfterFirst, '그래도 EMA 는 그때부터 접기 시작한다');
    ok(Array.isArray(r.second) && r.second.length === 1 && r.second[0][0] === 'farmer',
       '둘째 호출부터 후보를 다시 쓴다', JSON.stringify(r.second));
    ok(errs.length === 0, '페이지 오류 0', errs.join(' | '));
    await b.close();
  }

  // ── ④⑤⑥⑦ 양·값·바구니·창 ─────────────────────────────────────────────────
  console.log('\n④⑤⑥⑦ 양 자리 · 값 자리 · 바구니 · 창 (⑤\'⑥ 은 **1판 의미** — `L_ALLOC_BASKET=1`)');
  {
    const { b, p, errs } = await open('window.L_ALLOC_REAL=1;window.L_ALLOC_BASKET=1;');
    const r = await p.evaluate(() => {
      document.getElementById('seed').value = '7'; document.getElementById('nvil').value = '4'; reseed(); lifeInit();
      const W = ECON_WORLD, out = {}, A = EconEngine.allocRealCandidates;
      const mk = () => { const v = { dailyProductionBuf: {}, npcs: [] }; return v; };
      const ctx = (counts, wf, JOBS, yields) => ({ period: 100, counts, w: wf || (() => 1),
        JOBS: JOBS || { farmer: { output: 'food' } }, forageYields: () => (yields || {}) });
      const settle = (v, c, prod, wf, JOBS, yields) => {      // 두 번 불러 EMA 를 세운다(창을 다 채운다)
        W.day = 0; v._allocDay = undefined; v._allocEma = undefined;
        v.dailyProductionBuf = Object.assign({}, prod);
        A(v, W, [['farmer', 1]], ctx(c, wf, JOBS, yields));
        W.day = 100000;                                       // Δ일 ≫ 창 ⇒ α=1 ⇒ EMA = 오늘치
        return A(v, W, [['farmer', 1]], ctx(c, wf, JOBS, yields))[0][1];
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
      const settleF = (prod, y) => { const v = mk(); W.day = 0; v._allocDay = undefined; v._allocEma = undefined;
        v.dailyProductionBuf = Object.assign({}, prod);
        A(v, W, [['forager', 1]], cf({ forager: 1 }, null, y)); W.day = 100000;
        return A(v, W, [['forager', 1]], cf({ forager: 1 }, null, y))[0][1]; };
      out.forage = [settleF({ mushroom: 5, stone: 5 }, { mushroom: 1 }), settleF({ mushroom: 5, stone: 5 }, {})];
      // ⑦ 창 — 0 이면 평활 없음(하루치가 그대로), 1 이면 Δ일/창 만큼만 접힌다
      const winTest = (win) => { window.L_ALLOC_WIN = win; const v = mk();
        W.day = 0; v.dailyProductionBuf = { food: 0 }; A(v, W, [['farmer', 1]], ctx({ farmer: 1 }));
        W.day = 1; v.dailyProductionBuf = { food: 100 };                       // 하루만 폭등
        return A(v, W, [['farmer', 1]], ctx({ farmer: 1 }))[0][1]; };
      out.win = [winTest(1), winTest(0)];
      window.L_ALLOC_WIN = 1;
      return out; });
    const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? 1e-6 : t) * Math.max(1, Math.abs(a));
    ok(near(r.q[1], r.q[0] / 2), '★④ 실현 산출이 반이면 한계가치도 **반**이다', `${r.q[0]} → ${r.q[1]}`);
    ok(near(r.perCap[1], r.perCap[0] / 2), "④' 인원이 두 배면 1인당이라 **반**이다", `${r.perCap[0]} → ${r.perCap[1]}`);
    ok(near(r.price[1], r.price[0] * 2), '★⑤ 값이 두 배면 한계가치도 **두 배**다', `${r.price[0]} → ${r.price[1]}`);
    ok(r.basket[1] > r.basket[0] * 1.9 && r.basket[1] < r.basket[0] * 2.1,
       "★⑤' **바구니 소득(양 가중)** — 절반 품목의 값을 3배로 하면 소득이 2배", `${r.basket[0]} → ${r.basket[1]}`);
    ok(near(r.table[1], r.table[0] / 2), '⑥ 바구니는 **엔진 표**가 정한다 — byproduct 를 빼면 그 몫이 빠진다', `${r.table[0]} → ${r.table[1]}`);
    ok(r.forage[0] > r.forage[1], "⑥' 채집꾼 바구니에 `foragerYieldsFor` 가 들어간다", `${r.forage[0]} vs ${r.forage[1]}`);
    ok(r.win[1] > r.win[0] * 5, '★⑦ 돌연변이 — 창을 0 으로 하면 하루 요동이 그대로 든다', `창1 ${r.win[0].toFixed(2)} · 창0 ${r.win[1].toFixed(2)}`);
    ok(errs.length === 0, '페이지 오류 0', errs.join(' | '));
    await b.close();
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})();
