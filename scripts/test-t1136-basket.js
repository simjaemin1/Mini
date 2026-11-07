#!/usr/bin/env node
// @regress
// === scripts/test-t1136-basket.js — 바구니 교역 · 캐러밴 = 몸 걸음(소수 날) · 짐은 kg (T1136 · 손잡이 `T1136_BASKET` · 끔 기본) ===
//
// ★왜 [★재민 11-03 교역 ⓐ] 한 다리 한 품목 · 100 낱개(무게 무관 — 돌 100 = 400kg 를 한 사람이 졌다) · 날은 정수(모든 캐러밴이 econ 날 경계 = 자정에 닿았다).
//   켬: 실을 수 있는 품목 전부에서 "1 kg 더 실었을 때 한계 이득이 가장 큰 품목"을 한 낱개씩(물 채우기) · 짐 상한 = 몸 짐 정본 25kg × 상인 하나 ·
//   다리 날 = 거리 ÷ 캐러밴 하루 걸음(소수 그대로 · 밤에도 걷는다) · 닿은 그 시각에 거래(사건 처리기 `basketFlush`) · 받아 올 짐도 B 에서 같은 물 채우기(물물 · 외상 0).
//
//  ① 손잡이 — 끔(기본)이면 바구니 캐러밴 0 · `T1136_BASKET=1` · 주입(`world.t1136Basket`)이면 선다
//  ② 물 채우기 — 1 kg 당 한계 이득 순 · kg 상한 · 낱개 상한 · 예산 · 받을 값 목표(⑥ 계획 ㄴ) · 같으면 앞 차례
//  ③ 계획 — 짐 ≤ 25kg(가는 길 · 받아 올 짐) · 낱개 정수 · 덜 싣기(남는 값 < 남은 낱개의 받을 값) · 이득 = 낱개 이득 합 − 남는 값
//  ④ 시각 — 다리 날 = 거리 ÷ 하루 걸음(소수) · 도착 = 그 시각 · 같은 처리 안에서 시각 차례 · 장부 날 = ⌊t⌋ + 1 · 귀로 = 닿은 시각 + 다리 날
//  ⑤ 질량 — 사건 처리 앞뒤로 품목마다 (곳간 + 금고 + 길 위 짐) 합이 같다(약탈 0 판)
//  ⑥ 외상 0 — 받을 것이 없으면 안 판다(짐째 집으로 · 세금 0 · 수입 셈 0)
//  ⑦ 몸 시계 = 날 머리 — 날 사이를 잘게(⅛일) 쪼개 처리해도 세계가 글자 그대로 같다(서버 호스트가 그때그때 치러도 헤드리스와 같은 값)
//  ⑧ 신선도 — 정수 날은 T784 곡선 그대로 · 소수 날은 그 사이(내려가기만)
//  ⑨ 무게 · 상한 — 정본(`weights.kgOfOrDefault` · `carry.CFG.CAP_KG`)
//  ⑩ 예약 — 받는 마을 값은 제 짐보다 먼저 닿을 짐만 더한다 · 파는 쪽(B 잉여)은 먼저 닿을 캐러밴이 사 갈 계획 짐을 뺀다
//  ⑪ 식량 빚(T1074 켬 판) — 빚 마을은 먹을 것을 못 낸다
//  ⑫ 몸 걸음(T474 켬 판) — 다리 날 = 거리 ÷ 7,200 · 짧은 다리는 하루 안에 갔다 온다(econ 날 경계에 안 묶인다)
// 실행: node scripts/test-t1136-basket.js
'use strict';
// ★[T1216-K3] 자연사(T1206 · land1050 켬 기본)는 누가 죽을지를 사람 id 해시로 고르는데, 사람 id 가 프로세스 전체 마을 계수기(`sim/economy-sim.js` `_nextVillageId`)에서 나와
//   한 프로세스 안 둘째 판은 다른 사람이 죽는다 — 이 하네스는 한 프로세스에서 두 판을 비트로 견준다. 그래서 자연사를 끔으로 묶는다(뿌리는 보고 T1216_K3 제품 회부).
if (process.env.T1206_NAT_DEATH == null) process.env.T1206_NAT_DEATH = '0';
// 종전 상인 한 명 판은 명시적으로 되돌림. 기본 호위 운반은 T1182에서 검증.
process.env.T1136_ESCORT_CARRY = '0';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const mkWorld = (V2, seed, n) => V2.createWorldV2({ seed, villageCount: n || 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
const sumAll = (world) => {   // 품목마다 곳간 + 금고(품목 칸) + 길 위 바구니 짐
  const S = {};
  const add = (r, q) => { if (q) S[r] = (S[r] || 0) + q; };
  for (const v of world.villages) { for (const r in v.storage) add(r, +v.storage[r] || 0); for (const r in (v.treasury || {})) if (r !== '_cash') add(r, +v.treasury[r] || 0); }
  for (const c of world.caravans) { if (!c.basket || c._done) continue; for (const it of (c.state === 'outbound' ? c.basket : (c._retBasket || []))) add(it.res, it.amt); }
  return S;
};

if (process.env.T1136_SUB) {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const P = V2._t1136Probe, out = { knob: V2.T1136_BASKET, speed: V2.CARAVAN_DAY_SPEED };
  if (process.env.T1136_SUB === 'knob') {   // ① env 판 — 손잡이만으로 바구니가 선다
    const w = mkWorld(V2, 7);
    let n = 0; w.onBasket = (k) => { if (k === 'launch') n++; };
    for (let d = 0; d < 20; d++) V2.tickWorldV2(w);
    out.launch = n; out.basketNow = w.caravans.filter((c) => c.basket).length;
  } else if (process.env.T1136_SUB === 'debt') {   // ⑪ T1074 켬 판 — 빚 마을의 내보낼 몫
    const w = mkWorld(V2, 7); w.t1136Basket = true;
    for (let d = 0; d < 30; d++) V2.tickWorldV2(w);
    const fe = (v, r) => { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = 1; return V1.totalFoodEquivalent({ storage: st, npcs: [], _world: v._world }); };
    let v = null, C0 = null;
    for (const x of w.villages) { const C = P.cands(x); if (C.some((c) => ['food', 'fish', 'meat', 'cooked_food'].includes(c.res) || fe(x, c.res) > 0)) { v = x; C0 = C; break; } }
    out.has = !!v;
    if (v) {
      out.before = C0.map((c) => c.res);
      v.npcs[0]._fd = 1;   // 한 사람이 하루치 빚
      out.after = P.cands(v).map((c) => c.res);
      out.edibleAfter = out.after.filter((r) => ['food', 'fish', 'meat', 'cooked_food'].includes(r) || fe(v, r) > 0);
      out.edibleBefore = out.before.filter((r) => ['food', 'fish', 'meat', 'cooked_food'].includes(r) || fe(v, r) > 0);
    }
  } else if (process.env.T1136_SUB === 'walk') {   // ⑫ T474 켬 판 — 몸 걸음 시계
    const w = mkWorld(V2, 7); w.t1136Basket = true;
    const L = [], H = [];
    w.onBasket = (k, x) => { if (k === 'launch') L.push({ id: x.c.id, d: x.t, dist: x.c.distance, tOut: x.c.travelDays, arr: x.c.arriveDay, ret: x.c.returnArriveDay });
      if (k === 'home') H.push({ id: x.c.id, t: x.t, day: w.day }); };
    for (let d = 0; d < 20; d++) V2.tickWorldV2(w);
    out.L = L.slice(0, 40); out.H = H.slice(0, 40);
  }
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (kind, env) => { const e = Object.assign({}, process.env, env || {}, { T1136_SUB: kind }); delete e.NODE_OPTIONS;
  for (const k of ['T1136_BASKET', 'T474_CARAVAN_WALK', 'T1074_FOOD_DEBT', 'T496_CARAVAN_REST']) if (!env || !(k in env)) delete e[k];
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };

const _log = console.log; console.log = () => {}; console.warn = () => {};
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const W = require(path.join(ROOT, 'server', 'weights')), CY = require(path.join(ROOT, 'server', 'carry'));
console.log = _log;
const P = V2._t1136Probe;
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b));

console.log('\n=== T1136 — 바구니 교역 · 캐러밴 = 몸 걸음 · 짐은 kg ===');
// ── ① 손잡이 ─────────────────────────────────────────────────────────────────────
console.log('\n① 손잡이');
{
  const w = mkWorld(V2, 7); let n = 0; w.onBasket = () => { n++; };
  const _l = console.log; console.log = () => {}; for (let d = 0; d < 20; d++) V2.tickWorldV2(w); console.log = _l;
  ok(V2.T1136_BASKET === false && n === 0 && !w.caravans.some((c) => c.basket) && w.tradeLog.length > 0, '끔(기본) — 바구니 캐러밴 0 · 종전 교역은 돈다', `종전 장부 줄 ${w.tradeLog.length}`);
  const K = sub('knob', { T1136_BASKET: '1' });
  ok(K.knob === true && K.launch > 0, "`T1136_BASKET=1` — 바구니가 선다", `떠남 ${K.launch}`);
  const K2 = sub('knob', { T1136_BASKET: 'true' });
  ok(K2.knob === false && K2.launch === 0, "'1' 밖의 값(true)은 끔");
}
// ── ② 물 채우기 ─────────────────────────────────────────────────────────────────
console.log('\n② 물 채우기');
{
  const mk = (res, kg, gs, extra) => ({ res, kg, max: gs.length, at: (j) => Object.assign({ g: gs[j - 1], cr: gs[j - 1] + 1, spend: 0, c: 1 }, extra ? extra(j) : {}) });
  //   A: kg 1 · 이득 10, 8, 6, 4 (1kg 당 10 · 8 · 6 · 4) / B: kg 2 · 이득 30, 10 (1kg 당 15 · 5)
  const F1 = P.fill([mk('A', 1, [10, 8, 6, 4]), mk('B', 2, [30, 10])], 5, null, 'kg', null);
  ok(F1.units.map((u) => u.i).join('') === '1000' && F1.k.join(',') === '3,1' && near(F1.kg, 5), '1 kg 당 한계 이득 순(B1 15 → A1 10 → A2 8 → A3 6) · 짐 5kg 에서 멈춘다(B2 5 는 자리 없음)', `차례 ${F1.units.map((u) => 'AB'[u.i]).join('')} · k ${F1.k}`);
  const F2 = P.fill([mk('A', 1, [10, 8, 6, 4]), mk('B', 2, [30, 10])], 100, null, 'kg', null);
  ok(F2.k.join(',') === '4,2', '낱개 상한(max)까지만 — 자리가 남아도 더 없다', `k ${F2.k}`);
  const F3 = P.fill([mk('A', 1, [10, -1, 6]), mk('B', 1, [5])], 10, null, 'kg', null);
  ok(F3.k.join(',') === '1,1', '한계 이득 ≤ 0 이면 그 품목은 끝(뒤 낱개가 다시 양수여도 — 곡선이 오목이라 실제로는 없다)', `k ${F3.k}`);
  const sp = (j) => ({ spend: 3 });
  const F4 = P.fill([mk('A', 1, [10, 8, 6], sp), mk('B', 1, [9, 7], sp)], 10, 10, 'kg', null);
  ok(F4.k.join(',') === '2,1' && near(F4.spent, 9), '예산 — 쓴 값 합 ≤ 예산(셋째 낱개에서 9, 넷째는 12 > 10 이라 끝)', `k ${F4.k} · 쓴 ${F4.spent}`);
  const F5 = P.fill([mk('A', 1, [5, 5]), mk('B', 1, [5, 5])], 3, null, 'kg', null);
  ok(F5.units.map((u) => u.i).join('') === '001', '같으면 앞 차례(A1 = B1 → A · A2 = B1 → A · 그다음 B)', F5.units.map((u) => 'AB'[u.i]).join(''));
  const cr = (c) => (j) => ({ c, cr: 10 });
  const F6 = P.fill([mk('A', 1, [9, 9, 9], cr(5)), mk('B', 1, [9, 9, 9], cr(2))], 10, null, 'cr', 25);
  ok(F6.k.join(',') === '0,3' && near(F6.cr, 30), "계획 ㄴ('cr') — 받을 값 대비 내 값이 싼 낱개부터 · 받을 값 합이 목표(25)에 닿으면 멈춘다", `k ${F6.k} · 받을 값 ${F6.cr}`);
}
// ── ③~⑦ 세계 판(주입 켬) ───────────────────────────────────────────────────────────
const _q = console.log; console.log = () => {};
const w = mkWorld(V2, 7); w.t1136Basket = true;
const LA = [], AR = [], HO = [];
let flushOrderOk = true, lastT = -Infinity, inFlush = false;
w.onBasket = (k, x) => {
  if (k === 'launch') LA.push({ c: x.c, plan: x.plan, t: x.t });
  else if (k === 'arrive' || k === 'bail') { AR.push({ k, c: x.c, t: x.t, x, rowDay: w.tradeLog.length ? w.tradeLog[w.tradeLog.length - 1].day : null, ret: x.c.returnArriveDay, arrDay: x.c.arriveDay }); if (x.t < lastT - 1e-12) flushOrderOk = false; lastT = x.t; }
  else if (k === 'home') { HO.push({ c: x.c, t: x.t, ret: x.c.returnArriveDay }); if (x.t < lastT - 1e-12) flushOrderOk = false; lastT = x.t; }
};
let massOk = true, massWorst = 0, massN = 0;
for (let d = 0; d < 40; d++) {
  const P0 = V2.tickWorldV2Parts(w);
  //   ⑤ 질량 — 날 머리의 사건 처리 앞뒤(머리 = 날 올림 → 장 정산 → 바구니 처리 → …): 처리만 따로 불러 앞뒤를 견준다(날 경계 앞 몫)
  const S0 = sumAll(w); lastT = -Infinity;
  const ev = V2.basketFlush(w, w.day + 1, false);
  const S1 = sumAll(w);
  if (ev.length) { massN++; for (const r of new Set([...Object.keys(S0), ...Object.keys(S1)])) { const a = S0[r] || 0, b = S1[r] || 0, e = Math.abs(a - b) / Math.max(1, Math.abs(a)); if (e > massWorst) massWorst = e; if (e > 1e-9) massOk = false; } }
  P0.head(); for (const v of w.villages) P0.village(v); P0.trade(); P0.caravans(); P0.tail();
}
console.log = _q;
console.log('\n③ 계획');
{
  const cap = P.capKg();
  const pl = LA.map((x) => x.plan);
  ok(pl.length > 20, '상황 — 바구니 떠남이 있다', `${pl.length}`);
  ok(pl.every((p) => p.kg <= cap + 1e-9 && p.kgRet <= cap + 1e-9), `짐 ≤ ${cap}kg — 가는 길 · 받아 올 짐 둘 다`, `가는 길 최대 ${Math.max(...pl.map((p) => p.kg)).toFixed(2)} · 받아 올 짐 최대 ${Math.max(...pl.map((p) => p.kgRet)).toFixed(2)}`);
  ok(pl.every((p) => p.out.every((o) => Number.isInteger(o.amt) && o.amt >= 1) && p.ret.every((o) => Number.isInteger(o.amt) && o.amt >= 1)), '낱개 정수(최소 1) — 올림 손해는 계산 안에(⑤)');
  ok(pl.every((p) => p.how !== 'kg' || p.out.every((o) => o.lastCr > p.leftover - 1e-9)), "덜 싣기(⑥) — 계획 ㄱ의 남는 값 < 실은 품목 마지막 낱개의 받을 값(더 뺄 낱개가 없다)",
    `남는 값 중앙 ${(pl.map((p) => p.leftover).sort((a, b) => a - b)[pl.length >> 1] || 0).toFixed(2)}`);
  const mult = pl.filter((p) => p.out.length + p.ret.length >= 3).length;
  ok(mult > 0, '품목 여럿 — 한 다리에 품목 셋 이상(가는 길 + 받아 올 짐)', `${mult}/${pl.length} · 가는 길 품목 수 ${JSON.stringify(pl.reduce((o, p) => { o[p.out.length] = (o[p.out.length] || 0) + 1; return o; }, {}))}`);
  ok(LA.every((x) => x.c.kg <= cap + 1e-9 && near(x.c.kg, x.c.basket.reduce((s, it) => s + it.amt * P.kg(it.res), 0))), '캐러밴 짐 kg = 낱개 × 정본 무게 합', '');
  ok(pl.every((p) => Number.isFinite(p.gain) && p.gain > 0), '떠난 다리의 이득 > 0(기회비용 관문을 넘었다)');
}
console.log('\n④ 시각');
{
  const spd = V2.CARAVAN_DAY_SPEED;
  ok(LA.every((x) => near(x.c.arriveDay - x.c.departDay, x.c.distance / spd) && near(x.c.travelDays, x.c.distance / spd) && x.c.departDay === x.t), `다리 날 = 거리 ÷ 하루 걸음 ${spd}(소수 그대로 · 올림 0)`, LA.slice(0, 3).map((x) => x.c.travelDays.toFixed(3)).join(' · '));
  ok(LA.some((x) => x.c.arriveDay % 1 !== 0), '소수 도착 — econ 날 경계(자정)가 아닌 시각에 닿는다', LA.slice(0, 4).map((x) => (x.c.arriveDay % 1).toFixed(3)).join(' · '));
  ok(AR.length > 10 && AR.every((a) => a.t === a.arrDay || a.k === 'bail'), '닿은 그 시각에 거래(도착 사건 시각 = arriveDay)', `${AR.length}`);
  ok(AR.every((a) => a.rowDay === Math.floor(a.t) + 1), '장부 줄 날 = ⌊t⌋ + 1(그 시각 뒤 첫 장부 날)');
  ok(AR.every((a) => near(a.ret, a.t + (a.c._t1136.tBack))), '귀로 = 닿은 시각 + 다리 날(곧장 돌아선다 · 머묾 0)');
  ok(HO.length > 10 && HO.every((h) => h.t === h.ret), '집 도착 = 그 시각', `${HO.length}`);
  ok(flushOrderOk, '한 처리 안에서 시각 차례(같은 시각 = id 차례)');
}
console.log('\n⑤ 질량');
ok(massN > 5 && massOk, '사건 처리 앞뒤로 품목마다 (곳간 + 금고 + 길 위 짐) 같다(약탈 0 판 · 세금은 값 칸 · 길드 3% 는 금고 품목)', `처리 ${massN}번 · 최대 어긋남 ${massWorst.toExponential(1)}`);
console.log('\n⑥ 외상 0');
{
  const _l = console.log; console.log = () => {};
  const w2 = mkWorld(V2, 7); w2.t1136Basket = true;
  let c = null;
  for (let d = 0; d < 40 && !c; d++) { V2.tickWorldV2(w2); c = w2.caravans.find((x) => x.basket && x.state === 'outbound') || null; }
  console.log = _l;
  ok(!!c, '상황 — 가는 길 바구니 캐러밴이 있다');
  if (c) {
    const B = c.to, A = c.from;
    for (const r of Object.keys(B.storage)) B.storage[r] = 0;   // B 에 팔 것이 하나도 없다
    const before = {}; for (const it of c.basket) before[it.res] = A.storage[it.res] || 0;
    const trBefore = {}; for (const it of c.basket) trBefore[it.res] = (A.treasury && A.treasury[it.res]) || 0;
    const _l2 = console.log; console.log = () => {};
    V2.basketFlush(w2, c.arriveDay, true);
    console.log = _l2;
    const sold = c.basket.reduce((s, it) => s + (B.storage[it.res] || 0), 0);
    ok(c.state === 'inbound' && sold === 0 && (c._retBasket || []).every((x) => x.back) && near((c._retBasket || []).reduce((s, x) => s + x.amt, 0), c.basket.reduce((s, x) => s + x.amt, 0)),
      '받을 것이 없으면 안 판다 — B 곳간 그대로 · 짐이 통째로 귀로에', `귀로 짐 ${JSON.stringify((c._retBasket || []).map((x) => [x.res, x.amt]))}`);
    const _l3 = console.log; console.log = () => {};
    V2.basketFlush(w2, c.returnArriveDay, true);
    console.log = _l3;
    ok(c._done && c.basket.every((it) => near((A.storage[it.res] || 0) - before[it.res], it.amt) && near(((A.treasury && A.treasury[it.res]) || 0), trBefore[it.res])),
      '집 도착 — 안 판 짐이 그대로 곳간에(길드 3% 0 · 종전 빈손 귀환과 같은 뜻)');
  }
}
console.log('\n⑦ 몸 시계 = 날 머리');
{
  const run = (slices) => {
    const _l = console.log; console.log = () => {};
    const v = mkWorld(V2, 11); v.t1136Basket = true;
    let n = 0;
    for (let d = 0; d < 30; d++) {
      if (slices) for (let k = 1; k <= slices; k++) n += V2.basketFlush(v, v.day + k / slices, false).length;   // 날 사이를 잘게 — 서버 몸 시계(`_t1136Clock`)와 같은 부름
      V2.tickWorldV2(v);
    }
    console.log = _l;
    const snap = JSON.stringify({ st: v.villages.map((x) => [x.name, x.npcs.length, Object.keys(x.storage).sort().map((r) => [r, +(+x.storage[r]).toFixed(9)])]),
      tl: v.tradeLog.map((t) => [t.day, t.t, t.from, t.to, t.basket, t.retBasket, t.back]), car: v.caravans.map((c) => [c.id, c.state, c.arriveDay, c.returnArriveDay]) });
    return { snap, n };
  };
  const A1 = run(0), A2 = run(8);
  ok(A2.n > 0 && A1.snap === A2.snap, '⅛일마다 미리 치러도(서버 몸 시계) 날 머리에서만 치른 판과 글자 그대로 같다', `미리 치른 사건 ${A2.n}`);
}
console.log('\n⑧ 신선도');
{
  const L = require(path.join(ROOT, 'server', 'lots'));
  const r = ['fish', 'meat', 'food', 'fruit', 'vegetable'].find((x) => L.isLot(x));
  const f0 = P.F(r, 10, 13), f1 = V2._t784Probe.F(r, 3, 10, 0);
  ok(!!r && near(f0, f1, 1e-12), `정수 날은 T784 곡선 그대로(${r} · 10 → 13)`, `${f0.toFixed(6)} = ${f1.toFixed(6)}`);
  const seq = [10, 10.25, 10.5, 11, 11.75, 12.5].map((t1) => P.F(r, 10, t1));
  ok(seq.every((x, i) => i === 0 || x <= seq[i - 1] + 1e-12) && seq[0] === 1, '소수 날 — 1 에서 내려가기만', seq.map((x) => x.toFixed(4)).join(' '));
  ok(P.F('stone', 10, 30) === 1, '늙지 않는 품목(돌) = 1');
}
console.log('\n⑨ 무게 · 상한');
ok(P.capKg() === CY.CFG.CAP_KG && ['food', 'stone', 'wood', 'herb', 'rice'].every((r) => P.kg(r) === W.kgOfOrDefault(r)), `짐 상한 = carry.CAP_KG(${CY.CFG.CAP_KG}) · 무게 = weights.kgOfOrDefault`, ['food', 'stone', 'herb'].map((r) => `${r} ${P.kg(r)}`).join(' · '));
console.log('\n⑩ 예약');
{
  const A = { name: 'A' }, B = { name: 'B' };
  const fake = { caravans: [
    { id: 1, basket: [{ res: 'rice', amt: 5 }], state: 'outbound', from: A, to: B, arriveDay: 3.2, _t1136: { ret: [{ res: 'fish', amt: 2 }], tBack: 0.2 } },
    { id: 2, basket: [{ res: 'rice', amt: 7 }], state: 'outbound', from: A, to: B, arriveDay: 3.9, _t1136: { ret: [], tBack: 0.9 } },
    { id: 3, basket: [{ res: 'rice', amt: 1 }], state: 'inbound', from: B, to: A, arriveDay: 2, returnArriveDay: 3.5, _retBasket: [{ res: 'salt', amt: 4 }] } ] };
  const R = P.resv(fake, null);
  ok(P.rv(R, B, 'rice', 3.5) === 5 && P.rv(R, B, 'rice', 4) === 12 && P.rv(R, B, 'rice', 3.0) === 0, '받는 마을 값 = 제 짐이 닿는 시각까지 먼저 닿을 짐만 더한다(3.2 · 3.9 도착 → 3.5 에 5 · 4 에 12)');
  ok(P.rv(R.out, B, 'fish', 3.2) === 2 && P.rv(R.out, B, 'fish', 3.1) === 0, '파는 쪽 — 먼저 닿을 캐러밴이 B 에서 사 갈 계획 짐은 B 몫에서 미리 뺀다(그 도착 시각)');
  ok(P.rv(R, A, 'fish', 3.41) === 2 && P.rv(R, A, 'fish', 3.39) === 0 && P.rv(R, B, 'salt', 3.5) === 4 && P.rv(P.resv(fake, fake.caravans[0]), B, 'rice', 4) === 7, '계획한 받아 올 짐 → A · 귀로 짐 → 집 · 제 캐러밴은 뺀다');
}
console.log('\n⑪ 식량 빚(T1074 켬 판)');
{
  const D = sub('debt', { T1074_FOOD_DEBT: '1' });
  ok(D.has && D.edibleBefore.length > 0, '상황 — 먹을 것을 내보낼 몫에 둔 마을', `${(D.edibleBefore || []).join(' ')}`);
  ok(D.has && D.edibleAfter.length === 0 && D.after.length >= 0, '★빚이 서면 먹을 것(식량류 · 식량 환산 품목)을 못 낸다 · 다른 품목은 그대로', `뒤 ${(D.after || []).join(' ') || '없음'}`);
}
console.log('\n⑫ 몸 걸음(T474 켬 판)');
{
  const K = sub('walk', { T474_CARAVAN_WALK: '1' });
  ok(K.speed === V2.caravanWalkPerDay(), `캐러밴 하루 걸음 = 몸 걸음(${K.speed})`);
  ok(K.L.length > 5 && K.L.every((x) => near(x.tOut, x.dist / K.speed)) && K.L.some((x) => x.tOut < 0.5), '다리 날 = 거리 ÷ 7,200(소수 — 반나절 안 다리가 있다)', K.L.slice(0, 4).map((x) => x.tOut.toFixed(3)).join(' · '));
  const same = K.H.filter((h) => { const l = K.L.find((x) => x.id === h.id); return l && h.t < l.d + 1; });
  ok(same.length > 0, '짧은 다리는 떠난 그날 안에 갔다 온다(집 도착 < 떠난 날 + 1 — 날 경계에 안 묶인다)', `${same.length}/${K.H.length}`);
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
