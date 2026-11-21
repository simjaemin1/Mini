#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 6   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1407-tin-world.js — 청동이 드문 까닭을 세계에: ㉡ 광부의 원석 값 = 쓸 곳 + 팔 곳(`T1407_ORE_WORTH`) · ㉢ 굶는 날 수출 주조 손 값 = 식량 일(`T1407_FOOD_FIRST`) — 끔 기본 둘(T1407)
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수를 그대로 부른다 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `'1'` 만 켬(없음 · '0' · 'true' = 끔) · v2 세계 칸 `oreWorthFn` 은 ㉡ 켬에서만 선다(끔 = 칸 없음)
//   ② 원석 한 단위 값(v2 `t1407OreWorth` 정본 — T1293 빈자리 몫 · T1313 넘는 몫 두 줄):
//      O1 녹임 목표 빈자리 ≥ 덩이 = 그 칸 값 그대로 · O2 빈자리 0 · 빈자리 있는 이웃 없음 = 0 ·
//      O3 빈자리 0 · 빈자리 있는 이웃 = 그 이웃 순수출가(`netExportValue` 빈자리 갈래 — 같은 함수로 다시 잰 값) > 0 · O4 빈자리 = 덩이 ÷ 2 → 반 × 그 칸 값 + 반 × 이웃 값
//   ③ v1 두 자리가 같은 값을 읽는다(같은 마을 · 같은 날 · 끔 판과 견준다):
//      P1 산출 포만(정본 `tickVillage` 하루 — 광부 스물 · 주석 광맥 · 산 이웃 없음): 빈자리 0 = 켬 0 · 끔 > 0 / 빈자리 5 = 켬은 빈자리 + 광부 한 사람 몫 안 · 끔은 그 넷 배 넘게
//      P2 광부 값(`oreValue` — 피커 · 기회비용): 켬 = 몫 × 원석 값(광부 하루 몫 덩이) = 이웃 순수출가(빈자리 0 · 산 이웃 하나) · 끔 = 몫 × 값(종전)
//   ④ 굶는 날 수출 주조(`_t1333ExportCast` 정본 · 묶음 켬 — `T1385_BRONZE_NOCAP` · `T1398_BRONZE_BAND`):
//      F1 굶는 마을(곳간 < 사람 × 30일치) · 이웃이 칼을 사 준다 · 싼 손(무기장 0.004)이 있다 — 끔 = 문 열림 · 켬 = 닫힘(식량 일 손 값 > 주조 몫)
//      F2 굶지 않는 마을(같은 마을 · 곳간만 60일치) — 켬 = 끔 = 열림
//      F3 손 값 = 자리 있는 식량 일 넷의 기회비용 가운데 큰 것(정본 `opportunityCost` 로 다시 잰 값과 같다)
//   ⑤ 끔 = 종전 — 손잡이 없음 · '0' · 'true' 세계(마을 여섯 · 날 30 · `tickWorldV2`)가 같은 해시
//   ⑥ 글자 — 손잡이 둘은 `'1'` 비교 한 줄씩 · v2 세계 칸은 켬에서만 한 줄
//   ⑦ 미끼(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 어느 단언이 빨강이 되는지 단언한다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 싣는다):
//      nofill(빈자리 몫을 늘 1 → O2) · noover(넘는 몫 값 0 → O3) · nosat(산출 포만이 원석 값을 안 읽는다 → P1) · noval(광부 값이 원석 값을 안 읽는다 → P2) ·
//      allday(굶지 않는 날도 → F2) · nohand(손 값을 안 올린다 → F1)
//
// 실행: node scripts/test-t1407-tin-world.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1407_HARNESS_ARM || '', MUT = process.env.T1407_MUTANT || '';
const V1F = 'sim/economy-sim.js', V2F = 'sim/economy-sim-v2.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔 · 빨강이 되어야 할 단언]
const BAITS = {
  nofill: [V2F, '  const g = _t1293Fill(v, id, _targetCtxV2(v), 1, units);', '  const g = 1;', ['b'], ['O2']],
  noover: [V2F, '  return g * p + (g < 1 ? (1 - g) * _t1313Over(v, id) : 0);', '  return g * p;', ['b'], ['O3']],
  nosat: [V1F, 'const adj = (_w07 && OreGoods.isOre(r) ? _w07(v, r, amt, _satP[r] || 0) : (_satP[r] || 1)) / (_satB[r] || 1);', 'const adj = (_satP[r] || 1) / (_satB[r] || 1);', ['b'], ['P1']],
  noval: [V1F, 'n+=f*(W07?W07(v,id,u07*f,p):p);', 'n+=f*p;', ['b'], ['P2']],
  allday: [V1F, 'if (T1407_FOOD_FIRST && _t1085Hungry(v)) labor = Math.max(labor, _t1407FoodHand(v, p));', 'if (T1407_FOOD_FIRST) labor = Math.max(labor, _t1407FoodHand(v, p));', ['c'], ['F2']],
  nohand: [V1F, 'if (T1407_FOOD_FIRST && _t1085Hungry(v)) labor = Math.max(labor, _t1407FoodHand(v, p));', 'if (T1407_FOOD_FIRST && _t1085Hungry(v)) labor = Math.max(labor, 0);', ['c'], ['F1']],
};
const FOOD_JOBS = ['farmer', 'fisher', 'hunter', 'forager'];

// ── 아이 판 ──────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of ['T1407_ORE_WORTH', 'T1407_FOOD_FIRST', 'T1385_BRONZE_NOCAP', 'T1398_BRONZE_BAND', 'T1333_EXPORT_CAST', 'T1333_ALLOY_ORDER', 'T1333_WS_INPUT', 'T1344_BRONZE_STOCK',
    'T1384_FOOD_KEEP', 'T1384_FOOD_ROUTE', 'T1384_MINE_FOOD', 'T1363_FAMINE_TOOLS', 'T1293_ORE_SAT', 'T1313_SURPLUS_EXPORT', 'T1266_ORE_BODY', 'T1226_JOB_FLEX']) delete process.env[k];
  for (const k of Object.keys(process.env)) if (/^T1385_BRONZE_NOCAP_/.test(k)) delete process.env[k];
  if (ARM === 'z') { process.env.T1407_ORE_WORTH = '0'; process.env.T1407_FOOD_FIRST = '0'; }
  if (ARM === 't') { process.env.T1407_ORE_WORTH = 'true'; process.env.T1407_FOOD_FIRST = 'true'; }
  if (ARM === 'b') process.env.T1407_ORE_WORTH = '1';
  if (ARM === 'c' || ARM === 'c0') { process.env.T1385_BRONZE_NOCAP = '1'; process.env.T1398_BRONZE_BAND = '1'; }
  if (ARM === 'c') process.env.T1407_FOOD_FIRST = '1';
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knobs: null, U: null, H: null };
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
    if (!B) out.loadErr = 'bait unknown ' + MUT;
    else M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, B[0])) return old(m, f);
      const x = fs.readFileSync(f, 'utf8');
      if (x.split(B[1]).length !== 2) throw new Error('bait site count ' + MUT);
      m._compile(x.replace(B[1], B[2]), f);
    };
  }
  let E = null, V2 = null;
  const _l0 = console.log; console.log = () => {};
  try { E = require(path.join(ROOT, V1F)); V2 = require(path.join(ROOT, V2F)); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  console.log = _l0;
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const er = (e) => ({ err: String((e && e.stack) || e).slice(0, 300) });
  const r6 = (x) => (x == null || !isFinite(x) ? x : +(+x).toFixed(6));
  const mkV = (name, pop, x, y, extra) => {
    const v = E.createVillage(Object.assign({ fertility: 1.0, water: 0.8, stone: 1.0, ore: 0, wood: 1.0, game: 0.7, arable: 1, size: 70, initialPop: pop, name }, extra || {}));
    v.coord = { x: x || 0, y: y || 0 };
    return v;
  };
  const zero = (v) => { for (const r of Object.keys(v.storage)) if (typeof v.storage[r] === 'number') v.storage[r] = 0; };
  const mkW = (day) => {
    if (E.setSeed) E.setSeed(1);
    const w = V2.createWorldV2({ seed: 908, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0 });
    w.villages = []; w.events = []; w.caravans = []; w.day = day || 1;
    w.add = (v) => { v._world = w; w.villages.push(v); return v; };
    return w;
  };
  const room = (v, id) => { const T = V2._targetV2(v, id, V2._targetCtxV2(v)); return T ? T.target - T.sEff : 0; };
  if (E && V2) {
    const U = out.U = {};
    const T = (k, f) => { try { U[k] = quiet(f); } catch (e) { U[k] = er(e); } };
    T('knobs', () => { const w = mkW(1); return { ore: E.T1407_ORE_WORTH, food: E.T1407_FOOD_FIRST, wfn: typeof w.oreWorthFn }; });
    // ② 원석 한 단위 값(정본 v2 함수 — 손잡이와 무관하게 정의된다)
    T('worth', () => {
      const w = mkW(1), p = 0.7;
      const A = w.add(mkV('T1407A', 20, 0, 0, { ore: 1, oreMix: { tin: 1 } })), B = w.add(mkV('T1407B', 20, 300, 0));
      zero(A); zero(B);
      A._consEMA = { ore_tin: 1, tin: 1 }; A.storage.ore_tin = 5; B.storage.ore_tin = 300;   // B = 녹이지 않는 이웃(빈자리 0)
      const rm = room(A, 'ore_tin');
      const o1 = V2.t1407OreWorth(A, 'ore_tin', rm / 2, p);
      const o4 = V2.t1407OreWorth(A, 'ore_tin', rm * 2, p), over4 = V2.netExportValue(w, A, 'ore_tin', true);
      A.storage.ore_tin = 100;
      const rm2 = room(A, 'ore_tin'), o2 = V2.t1407OreWorth(A, 'ore_tin', 5, p);
      const C = w.add(mkV('T1407C', 20, 0, 300)); zero(C); C._consEMA = { ore_tin: 2, tin: 1 }; w.day = 2;   // 녹이는 이웃(빈자리 있음) · 날을 넘겨 순수출가 캐시를 비운다
      const o3 = V2.t1407OreWorth(A, 'ore_tin', 5, p), over3 = V2.netExportValue(w, A, 'ore_tin', true);
      return { p, rm: r6(rm), o1: r6(o1), o4: r6(o4), over4: r6(over4), rm2: r6(rm2), o2: r6(o2), o3: r6(o3), over3: r6(over3) };
    });
    // ③ P2 광부 값 — 빈자리 0 마을 · 산 이웃 하나(C)
    T('val', () => {
      const w = mkW(1), p = 0.7;
      const A = w.add(mkV('T1407A', 20, 0, 0, { ore: 1, oreMix: { tin: 1 } })), C = w.add(mkV('T1407C', 20, 0, 300));
      zero(A); zero(C);
      A._consEMA = { ore_tin: 1, tin: 1 }; A.storage.ore_tin = 100; C._consEMA = { ore_tin: 2, tin: 1 };
      const pf = (id) => (id === 'ore_tin' ? p : 1);
      return { p, val: r6(E.oreValue(A, pf)), over: r6(V2.netExportValue(w, A, 'ore_tin', true)), rm: r6(room(A, 'ore_tin')) };
    });
    // ③ P1 산출 포만 — 정본 마을 틱 하루(광부 스물 · 주석 광맥 · 이웃 없음) · 빈자리 5 → 빈자리 0
    T('sat', () => {
      const w = mkW(5);
      const M = w.add(mkV('T1407M', 20, 0, 0, { ore: 1, oreMix: { tin: 1 } }));
      for (const n of M.npcs) n.currentJob = 'miner';
      M.counts = E.jobCounts(M); M.storage.tool = 40; M.storage.food = 2000;
      const rows = [];
      for (const stock of [10, 45]) {
        M.storage.ore_tin = stock; M._consEMA = Object.assign(M._consEMA || {}, { ore_tin: 1, tin: 1 });
        const rm = room(M, 'ore_tin');
        E.tickVillage(M, w.day); w.day++;
        rows.push({ stock, rm: r6(rm), mined: r6((M.dailyProductionBuf && M.dailyProductionBuf.ore_tin) || 0), miners: M.npcs.filter((n) => n.currentJob === 'miner').length });
      }
      return { rows, per: r6(((E.JOBS && E.JOBS.miner && E.JOBS.miner.base) || 0) * 1) };
    });
    // ④ 굶는 날 수출 주조(묶음 켬 팔에서만 뜻이 있다 — 끔 팔도 같은 셈을 돌린다)
    T('cast', () => {
      const w = mkW(3);
      const V = w.add(mkV('T1407V', 20, 0, 600)), Bw = w.add(mkV('T1407W', 20, 300, 600));
      zero(V); zero(Bw);
      V.storage.copper = 10; V.storage.tin = 2; V.storage.food = 5;
      V.npcs[0].currentJob = 'weaponsmith'; V.npcs[1].currentJob = 'smith';   // 싼 손(무기장 0.004) · 붓는 손
      const N = V.npcs.length, fe0 = E.totalFoodEquivalent(V);
      const nef = w.netExportFn(V, 'weapon');
      const hungry = E._t1333ExportCast(V);
      const pp = E._oppPrice(V);
      const hand = E._t1407FoodHand(V, pp), ref = Math.max(...FOOD_JOBS.map((j) => E.opportunityCost({ currentJob: j, skills: {} }, V, pp)));
      V.storage.food = N * 60; w.day = 4;
      const fed = E._t1333ExportCast(V), fe1 = E.totalFoodEquivalent(V);
      return { N, fe0: r6(fe0), fe1: r6(fe1), nef: r6(nef), hungry, fed, hand: r6(hand), ref: r6(ref), band: !!E.T1398_BRONZE_BAND };
    });
    // ⑤ 끔 = 종전 — 짧은 세계(마을 여섯 · 날 30)
    if (['n', 'z', 't'].includes(ARM)) {
      try {
        out.H = quiet(() => {
          if (E.setSeed) E.setSeed(7);
          const w = V2.createWorldV2({ seed: 7, villageCount: 6, picker: 'rational' });
          for (let d = 0; d < 30; d++) V2.tickWorldV2(w);
          const snap = w.villages.map((v) => [v.name, v.npcs.length, Object.keys(v.storage).sort().map((k) => [k, +(+v.storage[k] || 0).toFixed(6)])]);
          return crypto.createHash('md5').update(JSON.stringify(snap)).digest('hex');
        });
      } catch (e) { out.H = er(e); }
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── 어미 ──────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failed = [];
const ok = (k, c, m) => { if (c) { pass++; } else { fail++; failed.push(k); console.log(`  ✗ ${k} ${m || ''}`); } };
const run = (arm, mut) => {
  const env = { ...process.env, T1407_HARNESS_ARM: arm };
  if (mut) env.T1407_MUTANT = mut; else delete env.T1407_MUTANT;
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  try { return JSON.parse(r.stdout); } catch (e) { return { loadErr: 'child ' + (r.stderr || '').slice(0, 300) }; }
};
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
// 단언 묶음 — 미끼 판에서도 같은 함수로 판정한다(이름 → 참 · 거짓)
function judge(R) {
  const A = {};
  const U = (a, k) => (R[a] && R[a].U && R[a].U[k] && !R[a].U[k].err ? R[a].U[k] : null);
  const wb = U('b', 'worth');
  if (wb) {
    A.O1 = wb.rm > 0 && near(wb.o1, wb.p);
    A.O2 = wb.rm2 <= 0 && wb.o2 === 0;
    A.O3 = wb.over3 > 0 && near(wb.o3, wb.over3);
    A.O4 = wb.rm > 0 && near(wb.o4, 0.5 * wb.p + 0.5 * wb.over4);
  }
  const s0 = U('n', 'sat'), s1 = U('b', 'sat');
  if (s0 && s1 && s0.rows.length === 2 && s1.rows.length === 2) {
    const [a0, b0] = s0.rows, [a1, b1] = s1.rows;
    A.P1 = b1.rm <= 0 && b1.mined === 0 && b0.mined > 0 && a1.rm > 0 && a1.mined > 0 && a1.mined <= a1.rm + s1.per + 1e-6 && a0.mined > 4 * (a1.rm + s1.per);
  }
  const v0 = U('n', 'val'), v1 = U('b', 'val');
  if (v0 && v1) A.P2 = near(v0.val, v0.p) && v1.rm <= 0 && v1.over > 0 && near(v1.val, v1.over);
  const c0 = U('c0', 'cast'), c1 = U('c', 'cast');
  if (c0 && c1) {
    A.F1 = c0.band && c1.band && c0.nef > 0 && c0.fe0 < c0.N * 30 && c0.hungry === true && c1.hungry === false && c1.hand > 0;
    A.F2 = c0.fe1 >= c0.N * 30 && c0.fed === true && c1.fed === c0.fed;
    A.F3 = near(c1.hand, c1.ref);
  }
  return A;
}
console.log('T1407 청동이 드문 까닭을 세계에 — ㉡ 원석 값 = 쓸 곳 + 팔 곳 · ㉢ 굶는 날 수출 주조 손 값 = 식량 일(끔 기본)');
const R = {};
for (const a of ['n', 'z', 't', 'b', 'c', 'c0']) R[a] = run(a);
for (const a of Object.keys(R)) ok('load ' + a, !R[a].loadErr, R[a].loadErr || '');
for (const a of Object.keys(R)) for (const k of ['knobs', 'worth', 'val', 'sat', 'cast']) ok(`unit ${a}.${k} 돈다`, R[a].U && R[a].U[k] && !R[a].U[k].err, R[a].U && R[a].U[k] && R[a].U[k].err);
// ① 손잡이
const kn = (a) => R[a] && R[a].U && R[a].U.knobs;
ok('knob 없음 = 끔(둘 다 · 세계 칸 없음)', kn('n') && kn('n').ore === false && kn('n').food === false && kn('n').wfn === 'undefined');
ok("knob '0' = 끔", kn('z') && kn('z').ore === false && kn('z').food === false && kn('z').wfn === 'undefined');
ok("knob 'true' = 끔", kn('t') && kn('t').ore === false && kn('t').food === false && kn('t').wfn === 'undefined');
ok("knob T1407_ORE_WORTH '1' = ㉡ 켬 · 세계 칸 선다", kn('b') && kn('b').ore === true && kn('b').food === false && kn('b').wfn === 'function');
ok("knob T1407_FOOD_FIRST '1' = ㉢ 켬(㉡ 끔 · 칸 없음)", kn('c') && kn('c').food === true && kn('c').ore === false && kn('c').wfn === 'undefined');
const A = judge(R);
const NAME = {
  O1: '원석 값 — 빈자리 ≥ 덩이 = 그 칸 값', O2: '원석 값 — 빈자리 0 · 산 이웃 없음 = 0', O3: '원석 값 — 빈자리 0 · 산 이웃 = 그 이웃 순수출가(빈자리 갈래)', O4: '원석 값 — 빈자리 반 = 반 × 값 + 반 × 이웃 값',
  P1: '산출 포만 — 빈자리 0 = 켬 0 · 끔 > 0 / 빈자리 5 = 켬은 빈자리 + 한 사람 몫 안', P2: '광부 값(oreValue) — 켬 = 원석 값 · 끔 = 값',
  F1: '굶는 날 수출 주조 — 끔 열림 · 켬 닫힘(식량 일 손 값)', F2: '굶지 않는 날 — 켬 = 끔', F3: '손 값 = 식량 일 넷 기회비용 가운데 큰 것',
};
for (const k of Object.keys(NAME)) ok(`${k} ${NAME[k]}`, A[k] === true, A[k] === undefined ? '(못 잼)' : '');
// ⑤ 끔 = 종전
const HH = (a) => (R[a] && typeof R[a].H === 'string' ? R[a].H : null);
ok("끔 = 종전 — 세계 날 30 '0' · 'true' = 없음(같은 해시)", HH('n') && HH('n') === HH('z') && HH('n') === HH('t'), JSON.stringify([HH('n'), HH('z'), HH('t')]));
// ⑥ 글자
{
  const s1 = fs.readFileSync(path.join(ROOT, V1F), 'utf8'), s2 = fs.readFileSync(path.join(ROOT, V2F), 'utf8');
  ok("글자 — 손잡이 둘은 '1' 비교 한 줄씩", /const T1407_ORE_WORTH = \(typeof process !== 'undefined' && process\.env && process\.env\.T1407_ORE_WORTH === '1'\);/.test(s1)
    && /const T1407_FOOD_FIRST = \(typeof process !== 'undefined' && process\.env && process\.env\.T1407_FOOD_FIRST === '1'\);/.test(s1));
  ok('글자 — v2 세계 칸은 켬에서만 한 줄', s2.split('if (v1.T1407_ORE_WORTH) world.oreWorthFn = t1407OreWorth;').length === 2);
}
// ⑦ 미끼 — 바꾼 자리 1곳 · 정한 단언이 빨강(아이 판 싣기 실패 0)이면 초록
const baitRun = (name) => {
  const B = BAITS[name], sites = fs.readFileSync(path.join(ROOT, B[0]), 'utf8').split(B[1]).length - 1;
  if (sites !== 1 || B[1] === B[2]) return { sites, good: false, why: '자리 수' };
  const RB = Object.assign({}, R);
  for (const a of B[3]) RB[a] = run(a, name);
  const AB = judge(RB), dead = B[3].filter((a) => RB[a].loadErr);
  return { sites, good: !dead.length && B[4].every((k) => AB[k] === false), why: dead.length ? '아이 판 죽음 ' + dead.join(' ') : B[4].map((k) => `${k} ${AB[k]}`).join(' · ') };
};
let b;
b = baitRun('nofill'); ok(b.sites === 1 && b.good, '미끼 nofill — 빈자리 몫(`_t1293Fill`)을 늘 1 로 둔 사본 → O2 빨강(빈자리 0 · 산 이웃 없음에도 값이 선다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('noover'); ok(b.sites === 1 && b.good, '미끼 noover — 넘는 몫 값(`_t1313Over`)을 뺀 사본 → O3 빨강(산 이웃이 있어도 0)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nosat'); ok(b.sites === 1 && b.good, '미끼 nosat — 산출 포만이 원석 값을 안 읽는 사본 → P1 빨강(빈자리 0 인데 캔다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('noval'); ok(b.sites === 1 && b.good, '미끼 noval — 광부 값(`oreValue`)이 원석 값을 안 읽는 사본 → P2 빨강(값표 값 그대로)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('allday'); ok(b.sites === 1 && b.good, '미끼 allday — 굶는 날 거름(`_t1085Hungry`)을 뺀 사본 → F2 빨강(굶지 않는 날 문도 닫힌다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nohand'); ok(b.sites === 1 && b.good, '미끼 nohand — 손 값을 안 올린 사본 → F1 빨강(굶는 날 문이 열린다)', `바꾼 자리 ${b.sites} · ${b.why}`);
console.log(`\n결과: ${pass} 통과 · ${fail} 실패${fail ? ' — ' + failed.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
