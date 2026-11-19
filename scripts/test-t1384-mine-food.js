#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 6   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1384-mine-food.js — 굶는 마을이 지나가는 먹을 것을 붙든다(`T1384_FOOD_KEEP`) · 파는 쪽이 길 위의 먹을 것을 센다(`T1384_FOOD_ROUTE`) — 끔 기본 둘(T1384 · T1347 회부 4) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · 정본 틱 조각(`tickWorldV2Parts` 머리 · 교역 · 캐러밴)을 그대로 부른다 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `'1'` 만 켬(없음 · '0' · 'true' = 끔) · `T1384_MINE_FOOD='1'` = 둘 다
//   ② 붙든다(`_exportCandidatesV2` 정본 — `_t1188Probe.exportCandidates`):
//      K1 굶는 마을(식량 흐름 EMA < 0)이 곳간 식량 환산 36일치 밑이면 먹을 것(식량 환산이 있는 품목 — 생곡 포함) 후보 0 · 끔이면 생곡이 후보(T825 하루치 문)
//      K2 36일치 위면 그 몫(품목 단위 = 넘는 식량 ÷ 그 품목 1 단위 식량)까지만 · 0 보다 크다
//      K3 굶지 않는 마을 = 켬 · 끔 후보 열 같음 · K4 먹을 것 아닌 품목(가죽) = 켬 · 끔 같음
//   ③ 길 위를 센다(`_t1384Resv` · 바구니 예약 열 `_t1136Rv` · `_t1384Disc` 정본):
//      D1 가는 길 먹을 것만 센다(돌아오는 길 · 끝난 짐 · 먹을 것 아닌 짐 · 다른 마을로 가는 짐 0) · D2 그 다리보다 늦게 닿을 짐은 안 센다 ·
//      D3 먹을 것 아닌 품목은 비 1 · D4 비 = 결정층 한 줄로 잰 값(곳간 + 길 위 ÷ 지금 곳간 — 같은 함수로 다시 잰 값과 같다) · 0 < 비 ≤ 1 · 길 위 0 이면 1
//   ④ 판 R(꾸민 마을 넷 — 남는 농촌 둘 · 먼 농촌(굶는다 · 파는 쪽에 가깝다) · 굶는 광산(멀다) · 교역 조각만 · 날 10):
//      W1 끔 = 광산으로 간 먹을 것 줄 0(파는 쪽 둘이 다 가까운 굶는 마을로 — 천장 값이 같으면 가까운 곳) · W2 켬 = 줄이 선다 · W3 켬 광산 곳간 > 끔 ·
//      W4 남는 농촌은 남는 만큼만 판다(곳간이 제 하한 — 식량류 36일치 — 밑으로 안 내려간다 · 켬 · 끔 둘 다)
//   ⑤ 판 K(꾸민 마을 셋 — 남는 농촌 · 굶는 광산(생곡 · 가죽 · 나무를 든다) · 먼 농촌 · 날 10):
//      W5 끔 = 굶는 광산이 36일치 밑에서 먹을 것을 첫째 화물로 낸다 · W6 켬 = 36일치 밑에서는 0 · W7 켬 광산 곳간 식량 환산(끝) > 끔
//   ⑥ 끔 = 종전 — 손잡이 '0' · 'true' 판 R · K = 없음 판(같은 줄)
//   ⑦ 글자 — 손잡이는 `'1'` 비교 · 붙드는 문 한 블록(정본 후보 함수 안 · T1149 겨울 문 뒤) · 받는 값 곱 한 자리(첫째 화물 다리) · 길 위 셈은 마을 차례 머리 한 줄
//   ⑧ 미끼(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 어느 단언이 빨강이 되는지 단언한다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 싣는다):
//      noroom(36일치 몫 상한을 뺀다 → K1) · keepall(굶지 않는 마을에도 → K3) · discall(먹을 것 아닌 짐도 센다 → D3) · disclate(늦게 닿을 짐도 센다 → D2) ·
//      noroute(받는 값 곱을 뺀다 → W2) · sellerkeep(파는 쪽 식량류 하한을 뺀다 → W4)
//
// 실행: node scripts/test-t1384-mine-food.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1384_HARNESS_ARM || '', MUT = process.env.T1384_MUTANT || '';
const V2F = 'sim/economy-sim-v2.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔 · 빨강이 되어야 할 단언]
const BAITS = {
  noroom: [V2F, '            if (!(_room84 > 0)) continue;\n            if (stock > thresh) candidates.push({ res: r, surplus: Math.min(Math.max(1, stock - keep), _room84) });',
    '            if (stock > thresh) candidates.push({ res: r, surplus: Math.max(1, stock - keep) });', ['u1'], ['K1']],
  keepall: [V2F, 'if (T1384_FOOD_KEEP && a.v.surplusEMA && a.v.surplusEMA.food < 0) {', 'if (T1384_FOOD_KEEP) {', ['u1'], ['K3']],
  discall: [V2F, '.filter((x) => x.res && _t825FoodPer(c.to, x.res) > 0), c.arriveDay);', '.filter((x) => x.res), c.arriveDay);', ['u1'], ['D3']],
  disclate: [V2F, 'if (a[i] === r && a[i + 2] <= tBy) s += a[i + 1];', 'if (a[i] === r) s += a[i + 1];', ['u1'], ['D2']],
  noroute: [V2F, '          if (_r84) pTo *= _t1384Disc(_r84, b.v, cand.res, day + travelDaysForDistance(dist));', '', ['wr1'], ['W2']],
  sellerkeep: [V2F, 'if (FOODR[r]) { keep = target * 1.2; thresh = target * 1.4; }', 'if (FOODR[r]) { keep = 0; thresh = 0; }', ['wr1'], ['W4']],
};
const RDAYS = 10, KDAYS = 10;

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of ['T1384_FOOD_KEEP', 'T1384_FOOD_ROUTE', 'T1384_MINE_FOOD', 'T1347_FETCH', 'T1347_MIX_DEST', 'T1333_ALLOY_ORDER', 'T1344_MIX_LOAD', 'L_CARGO_TWO', 'T1136_BASKET', 'T1152_MARKET']) delete process.env[k];
  const KN = ARM.replace(/^(k0|kt|u0|u1|wr0|wr1|wk0|wk1|wrz|wrt|wkz|wkt|both)$/, '$1');
  if (['k0', 'wrz', 'wkz'].includes(KN)) { process.env.T1384_FOOD_KEEP = '0'; process.env.T1384_FOOD_ROUTE = '0'; process.env.T1384_MINE_FOOD = '0'; }
  if (['kt', 'wrt', 'wkt'].includes(KN)) { process.env.T1384_FOOD_KEEP = 'true'; process.env.T1384_FOOD_ROUTE = 'true'; process.env.T1384_MINE_FOOD = 'true'; }
  if (KN === 'u1') { process.env.T1384_FOOD_KEEP = '1'; process.env.T1384_FOOD_ROUTE = '1'; }
  if (KN === 'wr1') process.env.T1384_FOOD_ROUTE = '1';
  if (KN === 'wk1') process.env.T1384_FOOD_KEEP = '1';
  if (KN === 'both') process.env.T1384_MINE_FOOD = '1';
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knobs: null, U: null, W: null };
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
  try { E = require(path.join(ROOT, 'sim', 'economy-sim.js')); V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js')); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  console.log = _l0;
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const er = (e) => ({ err: String((e && e.message) || e).slice(0, 200) });
  if (V2) out.knobs = { keep: V2.T1384_FOOD_KEEP, route: V2.T1384_FOOD_ROUTE };
  const SUBS = (V2 && V2.SUBSISTENCE_PER_NPC && V2.SUBSISTENCE_PER_NPC.food) || 1;
  const mkV = (name, pop, x, y, w) => {
    const v = E.createVillage({ fertility: 1.0, water: 0.8, stone: 1.0, ore: 0, wood: 1.0, game: 0.7, arable: 1, size: 70, initialPop: pop, name });
    if (w) v._world = w;
    v.coord = { x: x || 0, y: y || 0 };
    return v;
  };
  const zero = (v, keep) => { for (const r of Object.keys(v.storage)) if (typeof v.storage[r] === 'number' && !(keep || []).includes(r)) v.storage[r] = 0; };
  const fe = (v) => +E.totalFoodEquivalent(v) || 0;
  const foodPer = (v, r) => { const s = v.storage; const o = {}; for (const k of Object.keys(s)) o[k] = 0; o[r] = 1; const t = { ...v, storage: o }; return +E.totalFoodEquivalent(t) || 0; };
  // ② ③ 한 마을 · 정본 함수
  if (V2 && (ARM === 'u0' || ARM === 'u1')) {
    const U = out.U = {};
    const T = (k, f) => { try { U[k] = quiet(f); } catch (e) { U[k] = er(e); } };
    const XC = V2._t1188Probe && V2._t1188Probe.exportCandidates;
    const N = 20;
    const vil = (st, ema) => {
      if (E.setSeed) E.setSeed(1);
      const v = mkV('T1384U', N);
      zero(v); Object.assign(v.storage, st);
      v.surplusEMA = { food: ema };
      return v;
    };
    const cand = (v) => XC({ v }, v.npcs.length).map((c) => [c.res, +(+c.surplus).toFixed(6)]).sort((p, q) => (p[0] < q[0] ? -1 : 1));
    const line36 = SUBS * N * 30 * 1.2;
    T('ex', () => {
      const lo = vil({ food: SUBS * N * 10, rice: 300, hide: 300 }, -1);        // 굶는 마을 · 곳간 식량 10일치 + 생곡 — 36일치 밑
      const hiRice = SUBS * N * 30;   // 생곡을 더해 36일치를 넘긴다
      const hi = vil({ food: line36, rice: 300 + hiRice, hide: 300 }, -1);   // 굶는 마을 · 식량류만으로 36일치 + 생곡
      const fed = vil({ food: SUBS * N * 10, rice: 300, hide: 300 }, +1);       // 굶지 않는 마을(같은 곳간)
      const fr = foodPer(hi, 'rice');
      return { lo: cand(lo), hi: cand(hi), fed: cand(fed), room: fr > 0 ? (fe(hi) - line36) / fr : null, fr, line36, feLo: fe(lo), feHi: fe(hi) };
    });
    T('disc', () => {
      if (E.setSeed) E.setSeed(1);
      const b = mkV('T1384B', 40); zero(b); b.surplusEMA = { food: -1 };
      const o = mkV('T1384O', 40); zero(o); o.surplusEMA = { food: -1 };
      const C = [
        { state: 'outbound', to: b, giveRes: 'food', giveAmt: 100, giveRes2: null, giveAmt2: 0, arriveDay: 5 },
        { state: 'outbound', to: b, giveRes: 'hide', giveAmt: 50, giveRes2: null, giveAmt2: 0, arriveDay: 5 },
        { state: 'inbound', to: b, giveRes: 'food', giveAmt: 70, arriveDay: 3 },
        { state: 'outbound', to: b, giveRes: 'food', giveAmt: 40, arriveDay: 4, _done: true },
        { state: 'outbound', to: o, giveRes: 'food', giveAmt: 30, arriveDay: 5 },
        { state: 'outbound', to: b, giveRes: 'food', giveAmt: 25, arriveDay: 9 },
      ];
      const R = V2._t1384Resv({ caravans: C });
      const ref = (v, r, q) => {   // 같은 함수로 다시 잰 값 비(곳간 칸만 바꾼 겉)
        const p0 = V2._priceFromV2(V2._targetV2(v, r, V2._targetCtxV2(v)));
        const view = Object.assign({}, v, { storage: Object.assign({}, v.storage, { [r]: (v.storage[r] || 0) + q }) });
        const p1 = V2._priceFromV2(V2._targetV2(view, r, V2._targetCtxV2(view)));
        return p0 > 0 ? Math.min(1, p1 / p0) : 1;
      };
      return {
        q5: V2._t1136Probe.rv(R, b, 'food', 5), q9: V2._t1136Probe.rv(R, b, 'food', 9), qh: V2._t1136Probe.rv(R, b, 'hide', 5), qo: V2._t1136Probe.rv(R, o, 'food', 5), q4: V2._t1136Probe.rv(R, b, 'food', 4),
        d4: V2._t1384Disc(R, b, 'food', 4), d5: V2._t1384Disc(R, b, 'food', 5), r5: ref(b, 'food', 100), d9: V2._t1384Disc(R, b, 'food', 9), r9: ref(b, 'food', 125),
        dh: V2._t1384Disc(R, b, 'hide', 5), dn: V2._t1384Disc(R, mkV('T1384N', 10), 'food', 5), d0: V2._t1384Disc(new Map(), b, 'food', 5),
      };
    });
  }
  // ④ ⑤ 판 — 교역 조각만(머리 · 교역 · 캐러밴) · 마을 틱 없음(먹지도 만들지도 않는다 — 곳간은 짐으로만 움직인다)
  const world = (kind) => {
    const W = { err: null, rows: [] };
    try {
      quiet(() => {
        if (E.setSeed) E.setSeed(1);
        const w = V2.createWorldV2({ seed: 908, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0 });
        w.villages = []; w.events = []; w.caravans = [];
        const add = (v) => { v._world = w; w.villages.push(v); return v; };
        const D = kind === 'R' ? RDAYS : KDAYS;
        let F1, F2 = null, G, M;
        if (kind === 'R') {   // 남는 농촌 둘(0, 0 · 0, 300) · 먼 농촌(굶는다 · 파는 쪽 서쪽 1,200) · 굶는 광산(동쪽 2,400) — 다 하루 길
          F1 = add(mkV('T1384F1', 40, 0, 0)); F2 = add(mkV('T1384F2', 40, 0, 300)); G = add(mkV('T1384G', 40, -1200, 0)); M = add(mkV('T1384M', 30, 2400, 0));
          for (const v of w.villages) zero(v);   // 먹을 것만 — 파는 쪽 후보는 식량류 하나
          F1.storage.food = F2.storage.food = SUBS * 40 * 30 * 1.4 + 200;   // 42일치(내보낼 문턱) + 200 — 짐 둘
          M.storage.food = SUBS * 30 * 2;
        } else {   // 남는 농촌 · 굶는 광산(생곡 · 가죽 · 나무 · 돌은 처음 곳간 그대로) · 먼 농촌
          F1 = add(mkV('T1384F1', 40, 0, 0)); G = add(mkV('T1384G', 40, -2400, 0)); M = add(mkV('T1384M', 30, 2400, 0));
          zero(F1, ['wheat', 'barley', 'hemp']); zero(G);
          F1.storage.food = SUBS * 40 * 30 * 1.4 + 300;
          M.storage.food = SUBS * 30 * 3; M.storage.rice = 300; M.storage.hide = 200;
        }
        W.keepF = SUBS * 40 * 30 * 1.2; W.lineM = SUBS * M.npcs.length * 30 * 1.2;
        w.day = 0;
        const P = V2.tickWorldV2Parts(w);
        for (let d = 0; d < D; d++) {
          P.head();
          for (const v of w.villages) { v._idleFrac = 0; v._slack = 0; v.surplusEMA = v.surplusEMA || {}; }
          M.surplusEMA.food = -1; G.surplusEMA.food = -1; F1.surplusEMA.food = 1; if (F2) F2.surplusEMA.food = 1;
          G.storage.food = 0;   // 먼 농촌은 날마다 다 먹는다(굶는 채로 남는다)
          const feM = fe(M), n0 = w.caravans.length;
          P.trade();
          const L = w.caravans.slice(n0).map((c) => [c.from.name.slice(5), c.to.name.slice(5), c.giveRes, +(+c.giveAmt).toFixed(3), foodPer(c.from, c.giveRes) > 0 ? 1 : 0]);
          P.caravans();
          W.rows.push({ d: w.day, feM0: +feM.toFixed(3), L, F1: +(F1.storage.food || 0).toFixed(3), F2: F2 ? +(F2.storage.food || 0).toFixed(3) : null, feM: +fe(M).toFixed(3) });
        }
      });
    } catch (e) { W.err = String((e && e.stack) || e).slice(0, 300); }
    return W;
  };
  if (V2 && /^w/.test(ARM)) out.W = world(/^wr/.test(ARM) ? 'R' : 'K');
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ── 어미 ────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failed = [];
const ok = (k, c, m) => { if (c) { pass++; } else { fail++; failed.push(k); console.log(`  ✗ ${k} ${m || ''}`); } };
const run = (arm, mut) => {
  const env = { ...process.env, T1384_HARNESS_ARM: arm };
  if (mut) env.T1384_MUTANT = mut; else delete env.T1384_MUTANT;
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  try { return JSON.parse(r.stdout); } catch (e) { return { loadErr: 'child ' + (r.stderr || '').slice(0, 300) }; }
};
const H = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex');
// 단언 묶음 — 미끼 판에서도 같은 함수로 판정한다(이름 → 참 · 거짓)
function judge(R) {
  const A = {};
  const U0 = R.u0 && R.u0.U, U1 = R.u1 && R.u1.U;
  if (U0 && U1 && U0.ex && U1.ex && !U0.ex.err && !U1.ex.err) {
    const has = (L, r) => L.some((x) => x[0] === r), get = (L, r) => (L.find((x) => x[0] === r) || [null, null])[1];
    const e0 = U0.ex, e1 = U1.ex;
    A.K1 = e1.feLo < e1.line36 && has(e0.lo, 'rice') && !e1.lo.some((x) => ['rice', 'food', 'wheat', 'barley', 'meat', 'fish'].includes(x[0]));
    A.K2 = e1.feHi > e1.line36 && e1.room > 0 && has(e1.hi, 'rice') && get(e1.hi, 'rice') > 0 && get(e1.hi, 'rice') <= e1.room + 1e-6;
    A.K3 = JSON.stringify(e0.fed) === JSON.stringify(e1.fed) && e1.fed.length > 0;
    A.K4 = has(e0.lo, 'hide') && get(e0.lo, 'hide') === get(e1.lo, 'hide');
  }
  if (U1 && U1.disc && !U1.disc.err) {
    const d = U1.disc;
    A.D1 = d.q5 === 100 && d.qh === 0 && d.qo === 30 && d.q9 === 125;
    A.D2 = d.q4 === 0 && d.d4 === 1 && d.d5 < 1;
    A.D3 = d.dh === 1 && d.qh === 0;
    A.D4 = d.d5 === d.r5 && d.d9 === d.r9 && d.d5 > 0 && d.d5 <= 1 && d.d9 <= d.d5 && d.dn === 1 && d.d0 === 1;
  }
  const W = (a) => R[a] && R[a].W && !R[a].W.err ? R[a].W : null;
  const legs = (Wx, from, to) => Wx.rows.reduce((s, r) => s + r.L.filter((l) => (!from || from.includes(l[0])) && l[1] === to && l[4]).length, 0);
  const wr0 = W('wr0'), wr1 = W('wr1');
  if (wr0 && wr1) {
    A.W1 = legs(wr0, ['F1', 'F2'], 'M') === 0 && legs(wr0, ['F1', 'F2'], 'G') > 0;
    A.W2 = legs(wr1, ['F1', 'F2'], 'M') > 0;
    A.W3 = wr1.rows[wr1.rows.length - 1].feM > wr0.rows[wr0.rows.length - 1].feM;
    A.W4 = [wr0, wr1].every((Wx) => Wx.rows.every((r) => r.F1 >= Wx.keepF - 1e-6 && r.F2 >= Wx.keepF - 1e-6)) && legs(wr1, ['F1', 'F2'], 'G') + legs(wr1, ['F1', 'F2'], 'M') > 0;
  }
  const wk0 = W('wk0'), wk1 = W('wk1');
  if (wk0 && wk1) {
    const out36 = (Wx) => Wx.rows.reduce((s, r) => s + (r.feM0 < Wx.lineM ? r.L.filter((l) => l[0] === 'M' && l[4]).length : 0), 0);
    A.W5 = out36(wk0) > 0;
    A.W6 = out36(wk1) === 0 && wk1.rows.some((r) => r.L.some((l) => l[0] === 'M'));
    A.W7 = wk1.rows[wk1.rows.length - 1].feM > wk0.rows[wk0.rows.length - 1].feM;
  }
  return A;
}
console.log('T1384 굶는 마을 식량 — 붙든다 · 길 위를 센다(끔 기본)');
const R = {};
for (const a of ['k0', 'kt', 'u0', 'u1', 'wr0', 'wr1', 'wk0', 'wk1', 'wrz', 'wrt', 'wkz', 'wkt', 'both']) R[a] = run(a);
for (const a of Object.keys(R)) ok('load ' + a, !R[a].loadErr, R[a].loadErr || '');
// ① 손잡이
const kn = (a) => R[a] && R[a].knobs;
ok('knob 없음 = 끔', kn('u0') && kn('u0').keep === false && kn('u0').route === false);
ok("knob '0' = 끔", kn('k0') && kn('k0').keep === false && kn('k0').route === false);
ok("knob 'true' = 끔", kn('kt') && kn('kt').keep === false && kn('kt').route === false);
ok("knob '1' = 켬", kn('u1') && kn('u1').keep === true && kn('u1').route === true);
ok("knob T1384_MINE_FOOD '1' = 둘 다", kn('both') && kn('both').keep === true && kn('both').route === true);
for (const a of ['u0', 'u1']) for (const k of ['ex', 'disc']) if (a === 'u1' || k === 'ex') ok(`unit ${a}.${k} 돈다`, R[a].U && R[a].U[k] && !R[a].U[k].err, R[a].U && R[a].U[k] && R[a].U[k].err);
for (const a of ['wr0', 'wr1', 'wk0', 'wk1', 'wrz', 'wrt', 'wkz', 'wkt']) ok(`world ${a} 돈다`, R[a].W && !R[a].W.err, R[a].W && R[a].W.err);
const A = judge(R);
const NAME = {
  K1: '붙든다 — 굶는 마을 36일치 밑 = 먹을 것 후보 0(끔은 생곡 후보)', K2: '붙든다 — 36일치 위 몫까지만(품목 단위)', K3: '붙든다 — 굶지 않는 마을 = 끔과 같은 후보', K4: '붙든다 — 먹을 것 아닌 품목 = 끔과 같다',
  D1: '길 위 — 가는 길 먹을 것만 센다', D2: '길 위 — 늦게 닿을 짐은 안 센다', D3: '길 위 — 먹을 것 아닌 품목 비 1', D4: '길 위 — 비 = 결정층 한 줄로 다시 잰 값 · 0 < 비 ≤ 1',
  W1: '판 R 끔 — 광산으로 간 먹을 것 줄 0', W2: '판 R 켬 — 광산으로 줄이 선다', W3: '판 R 켬 — 광산 곳간 > 끔', W4: '판 R — 남는 농촌은 제 하한(36일치) 밑으로 안 판다',
  W5: '판 K 끔 — 굶는 광산이 36일치 밑에서 먹을 것을 낸다', W6: '판 K 켬 — 36일치 밑에서는 0', W7: '판 K 켬 — 광산 곳간 > 끔',
};
for (const k of Object.keys(NAME)) ok(`${k} ${NAME[k]}`, A[k] === true, A[k] === undefined ? '(못 잼)' : '');
// ⑥ 끔 = 종전
const WH = (a) => R[a] && R[a].W ? H(R[a].W.rows) : null;
ok("끔 = 종전 — 판 R '0' · 'true' = 없음", WH('wr0') && WH('wr0') === WH('wrz') && WH('wr0') === WH('wrt'));
ok("끔 = 종전 — 판 K '0' · 'true' = 없음", WH('wk0') && WH('wk0') === WH('wkz') && WH('wk0') === WH('wkt'));
// ⑦ 글자
{
  const s = fs.readFileSync(path.join(ROOT, V2F), 'utf8');
  const cnt = (x) => s.split(x).length - 1;
  ok("글자 — 손잡이 둘은 '1' 비교 한 줄씩", /const T1384_FOOD_KEEP = \(typeof process !== 'undefined' && process\.env && \(process\.env\.T1384_FOOD_KEEP === '1' \|\| process\.env\.T1384_MINE_FOOD === '1'\)\);/.test(s)
    && /const T1384_FOOD_ROUTE = \(typeof process !== 'undefined' && process\.env && \(process\.env\.T1384_FOOD_ROUTE === '1' \|\| process\.env\.T1384_MINE_FOOD === '1'\)\);/.test(s));
  const xs = s.indexOf('function _exportCandidatesV2('), xe = s.indexOf('\nfunction ', xs + 10), body = s.slice(xs, xe);
  ok('글자 — 붙드는 문 한 블록 · 정본 후보 함수 안 · T1149 겨울 문 뒤', cnt('if (T1384_FOOD_KEEP && a.v.surplusEMA && a.v.surplusEMA.food < 0) {') === 1 && body.includes('if (T1384_FOOD_KEEP && a.v.surplusEMA')
    && body.indexOf('if (FOODR[r] && _t1149Wd(a.v) > 0) {') < body.indexOf('if (T1384_FOOD_KEEP'));
  ok('글자 — 받는 값 곱 한 자리 · 길 위 셈 한 줄(마을 차례 머리) · 예약 열은 바구니 함수 그대로(사본 0)', cnt('_t1384Disc(_r84,') === 1 && cnt('const _r84 = T1384_FOOD_ROUTE ? _t1384Resv(world) : null;') === 1 && cnt('_t1384Resv(') === 2
    && cnt('function _t1136Rv(') === 1 && cnt('function _t1136RvAdd(') === 1 && /function _t1384Resv\(world\) \{[^}]*_t1136RvAdd\(/.test(s) && /function _t1384Disc\([^)]*\) \{\n  const q = _t1136Rv\(/.test(s));
}
// ⑧ 미끼 — 바꾼 자리 1곳 · 정한 단언이 빨강(아이 판 싣기 실패 0)이면 초록
const V2SRC = fs.readFileSync(path.join(ROOT, V2F), 'utf8');
const baitRun = (name) => {
  const B = BAITS[name], sites = V2SRC.split(B[1]).length - 1;
  if (sites !== 1) return { sites, good: false, why: '자리 수' };
  const RB = Object.assign({}, R);
  for (const a of B[3]) RB[a] = run(a, name);
  const AB = judge(RB), dead = B[3].filter((a) => RB[a].loadErr);
  return { sites, good: !dead.length && B[4].every((k) => AB[k] === false), why: dead.length ? '아이 판 죽음 ' + dead.join(' ') : B[4].map((k) => `${k} ${AB[k]}`).join(' · ') };
};
let b;
b = baitRun('noroom');     ok(b.sites === 1 && b.good, '미끼 noroom — 36일치 몫 상한(`_room84`)을 뺀 사본 → K1 빨강(36일치 밑 굶는 마을도 생곡을 낸다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('keepall');    ok(b.sites === 1 && b.good, '미끼 keepall — 굶는 마을 거름(흐름 EMA < 0)을 뺀 사본 → K3 빨강(굶지 않는 마을 후보도 바뀐다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('discall');    ok(b.sites === 1 && b.good, '미끼 discall — 길 위 셈의 먹을 것 거름을 뺀 사본 → D3 빨강(가죽 짐도 센다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('disclate');   ok(b.sites === 1 && b.good, '미끼 disclate — 닿는 날 문(`<= tBy`)을 뺀 사본 → D2 빨강(늦게 닿을 짐도 센다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('noroute');    ok(b.sites === 1 && b.good, '미끼 noroute — 받는 값 곱(`_t1384Disc`)을 뺀 사본 → W2 빨강(광산으로 줄이 안 선다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('sellerkeep'); ok(b.sites === 1 && b.good, '미끼 sellerkeep — 파는 쪽 식량류 하한(keep · thresh)을 뺀 사본 → W4 빨강(남는 농촌이 제 하한 밑으로 판다)', `바꾼 자리 ${b.sites} · ${b.why}`);
console.log(`\n${fail ? '실패' : '통과'} ${pass}/${pass + fail}${failed.length ? ' — ' + failed.join(' · ') : ''}`);
process.exit(fail ? 1 : 0);
