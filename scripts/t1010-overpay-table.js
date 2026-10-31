#!/usr/bin/env node
// === scripts/t1010-overpay-table.js — 넘는 몫 표(T999 ① 상한 절삭 · 켬 기본 세계) [T1010] ==========
//
// ★왜 [T1010 · T999 회부 1] T999 켬은 상한에 닿은 주문을 상한 전부를 사는 **가장 적은 낱개**로 깎는다 — 넘는 몫은 마지막 낱개의 조각이다.
//   그 몫이 판마다(짐 · 열량 짝) 얼마나 큰가를 잰다. 표 기계다 — 단언 0 · 판정 0(표 · 줄 수 · 불변식 어긋남 수만 낸다).
//
// 넘는 몫 = 낸 단위 − X* · X* = **실제로 받은 낱개**(낼 양 축 T999 ① 줄 = 상한 전부)를 사는 가장 적은 연속 낼 단위
//   (짐 없는 마른 견적 — `capped` 면 상한 전부 · 아니면 견적 `take` · 두 배 걸음 + 이분 40) · 마지막 낱개 몫 = 넘는 몫 ÷ (낸 단위 − 하나 덜 낸 단위)
//   — 낸 단위 가운데 받은 것을 사는 데 안 든 몫(마을 · 거래소 몫)이 마지막 낱개의 얼마인가.
//   불변식(최소 — T999 ⓒ · ⓔ 의 꼴): 하나 덜 낸 단위 < X* ≤ 낸 단위(낸 단위는 실행이 셋째 자리로 낸 수 · 허용 2e-3) — 어긋난 줄을 센다.
//   사람이 보는 몫: 마지막 낱개가 산 받을 것(받은 − 하나 덜 냈으면 받을 것) · 그것이 앞 낱개 평균(하나 덜 냈으면 받을 것 ÷ 하나 덜 낸 낱개)의 몇 배인가.
//
// 판(아이 판 하나씩 — 각 판은 그 하네스 아이 판의 세계 · 짐 · 부르는 차례 그대로 · 마른 견적은 곳간을 되돌린 뒤):
//   A 무게 다른 짐 — `test-t835-quote-weight` · T988 · T999 하네스 아이 판 그대로(시드 7 · 마을 5 · 200날 · 낼 것 둘 × 받을 것 여섯 ·
//       기준 무게 0.6 ~ 2.4 · 낱개마다 앞이 무겁다 · 가진 것 2 · 5 · 30 · 열량 짝 끔/켬) — 낼 양 1 ~ 12 · 받을 양 1 2 3 5 8 13 21 34(캐논 ② 낱개라 올림 — 견줌:
//       올림이 낸 낱개는 받을 양보다 더 받는 몫이 되므로 넘는 몫은 받은 것 기준으로 잰다)
//   B 고른 짐 — `test-t807-quote-exec` 아이 판 그대로(같은 세계 · 짝 아홉 · 낼 양 1 ~ 12 · 1개 = 1단위 · 가진 것 400 · 열량 짝 끔/켬)
//   C 무거운 짐 — 같은 판 · 1개 = 2.25단위(T807 ⓔ)
//   D 무거운 짐 — T988 ④ 판(낱개 하나 = (maxGive + T) ÷ 2 — 한 개로는 상한에 못 닿고 둘이면 넘는다 · 낼 양 = ⌈T ÷ 낱개⌉ + 1 · 받을 양 = 상한 전부 · 열량 짝 끔)
//   E 상한 1 판 — T988 · T999 ⑤ 판(받을 것 곳간 재고만 상한 1 · 낱개 = T × 0.6 · 낼 양 2 · 받을 양 1 · 열량 짝 끔)
//   줄 = 실행이 선 거래 가운데 T999 ① 이 깎은 것(낼 양 축: 견적 `capped` · 한 개 넘침 아님) · 받을 양 축은 선 거래 다(D · E 는 받을 양 = 상한)
//
// 실행: node scripts/t1010-overpay-table.js [--json <파일>]   (존 안 띄움 · 아이 판 넷(둘씩 나란히) · 약 13분)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T1010_SUB) {   // ── 아이 판 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js')), K = require(SV('kcal.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable, mode = process.env.T1010_SUB, rows = [];
  const restoreOf = (v) => (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
  //   X* — 받을 낱개 need 를 사는 가장 적은 연속 낼 단위(짐 없는 마른 견적 · 상한에 닿으면 상한 전부라 닿는다)
  const xStar = (vil, vi, give, take, tkO, need) => {
    const at = (x) => { const q = Trade.quote(L, econV2, vil, vi, give, take, x, tkO); return !!(q && !q.err && (q.capped || q.take >= need)); };
    let lo = 0, hi = 1; for (let g = 0; g < 60 && !at(hi); g++) { lo = hi; hi *= 2; }
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (at(mid)) hi = mid; else lo = mid; }
    return hi;
  };
  const trueT = (vil, vi, give, take) => {   // 짐 없는 견적의 `capped` 가 켜지는 낼 단위(T999 하네스 그 글자)
    const capAt = (x) => { const q = Trade.quote(L, econV2, vil, vi, give, take, x, {}); return !!(q && !q.err && q.capped); };
    let lo = 0, hi = 1; for (let g = 0; g < 60 && !capAt(hi); g++) { lo = hi; hi *= 2; }
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (capAt(mid)) hi = mid; else lo = mid; }
    return lo;
  };
  const ko = (r) => Events.koRes(r);
  if (mode === 'A') {
    const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
    const TAKES = ['wood', 'stone', 'food', 'salt', 'fish', 'hide'];
    const W0 = {}; let k = 0;   // T988 · T999 하네스 그대로 — 기준 무게는 낼 것 아이템 정본 순서로 미리
    for (const g of GIVES) for (const it of D.items.get(g)) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2;
    const unitsOf = (it, n) => { if (W0[it] == null) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2; let u = 0; for (let i = 0; i < n; i++) u += W0[it] * (1 + 0.5 / (1 + i)); return +u.toFixed(4); };
    for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of TAKES) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ, restore = restoreOf(v);
      const its = D.items.get(give);
      for (const tk of [null, K]) {
        const tkO = tk ? { takeKcal: tk } : {};
        const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : (j === 1 ? 5 : 30); }); return o; };
        const snap0 = JSON.stringify(v.storage);
        const u1 = Number(unitsOf(its[0], 1));
        const q1 = Trade.quote(L, econV2, vil, vi, give, take, u1, tkO), oneOver = !!(q1 && !q1.err && q1.capped);
        const b = Trade.quote(L, econV2, vil, vi, give, take, 1, tkO), top = (b && !b.err) ? b.cap : 0;
        const xsCap = top >= 1 ? xStar(vil, vi, give, take, tkO, top) : null;
        restore(snap0);
        const dry = (c) => { if (c < 1) return { u: 0, take: 0 }; const s = JSON.stringify(v.storage);
          const q2 = Trade.quote(L, econV2, vil, vi, give, take, 1, Object.assign({ inventory: mkInv(), unitsOf, giveCount: c }, tkO)); restore(s);
          return { u: q2.giveUnitsPicked, take: q2.take, capped: !!q2.capped }; };
        const ex = (inv, qty, want) => Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want, unitsOf, deposit: V.playerVillageDeposit }, tkO));
        for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
          const snap = JSON.stringify(v.storage), inv = mkInv(), u = u1 * n;
          const q = Trade.quote(L, econV2, vil, vi, give, take, u, Object.assign({ want: 0, perItem: u / n, inventory: inv, unitsOf, giveCount: n }, tkO));
          const x = ex(inv, n, 0); restore(snap);
          if (!(x.ok && !q.err && q.capped && !oneOver)) continue;
          const p = dry(x.give - 1);
          rows.push({ board: 'A', tk: tk ? 1 : 0, vi, pair: give + '>' + take, ko: [ko(give), ko(take)], axis: 'give', n, c: x.give, uC: x.giveUnits, uP: p.u, xs: xsCap, take: x.take, need: top, takeP: p.take, cap: top });
        }
        const xsN = {};   // 받은 낱개마다 X*(올림이 받을 양보다 더 받게 했으면 그 더 받은 것까지 산 단위)
        for (const n of [1, 2, 3, 5, 8, 13, 21, 34]) {
          const snap = JSON.stringify(v.storage), inv = mkInv();
          const x = ex(inv, 0, n); restore(snap);
          if (!x.ok) continue;
          if (xsN[x.take] == null) { const s = JSON.stringify(v.storage); xsN[x.take] = xStar(vil, vi, give, take, tkO, x.take); restore(s); }
          const p = dry(x.give - 1);
          rows.push({ board: 'A', tk: tk ? 1 : 0, vi, pair: give + '>' + take, ko: [ko(give), ko(take)], axis: 'want', n, c: x.give, uC: x.giveUnits, uP: p.u, xs: xsN[x.take], take: x.take, need: x.take, takeP: p.take, cap: top });
        }
      }
    }
  } else if (mode === 'B') {
    const PER = +process.env.T1010_PER || 1, unitsOf = PER !== 1 ? (it, n) => n * PER : undefined;
    for (let vi = 0; vi < 5; vi++) for (const tk of [null, K]) for (const [give, take] of [['wood', 'meat'], ['wood', 'stone'], ['food', 'wood'], ['wood', 'food'], ['stone', 'wood'], ['food', 'fish'],
      ['salt', 'food'], ['meat_game', 'food'], ['fruit', 'wood']]) {   // T807 하네스 짝 아홉 그대로
      const gItem = D.toEcon.get(give), tItem = D.toEcon.get(take); if (!gItem || !tItem) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ, restore = restoreOf(v);
      const tkO = tk ? { takeKcal: tk } : {};
      const snap0 = JSON.stringify(v.storage);
      const q1 = Trade.quote(L, econV2, vil, vi, give, take, PER, tkO), oneOver = !!(q1 && !q1.err && q1.capped);
      const b = Trade.quote(L, econV2, vil, vi, give, take, 1, tkO), top = (b && !b.err) ? b.cap : 0;
      const xsCap = top >= 1 ? xStar(vil, vi, give, take, tkO, top) : null;
      restore(snap0);
      for (let qty = 1; qty <= 12; qty++) {
        const snap = JSON.stringify(v.storage), inv = { [gItem]: 400 };
        const q = Trade.quote(L, econV2, vil, vi, give, take, qty * PER, Object.assign({ want: 0, perItem: PER }, tkO));
        const x = Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want: 0, unitsOf, deposit: V.playerVillageDeposit }, tkO));
        restore(snap);
        if (!(x.ok && !q.err && q.capped && !oneOver)) continue;
        const s = JSON.stringify(v.storage), qP = x.give >= 2 ? Trade.quote(L, econV2, vil, vi, give, take, (x.give - 1) * PER, tkO) : null; restore(s);
        rows.push({ board: PER === 1 ? 'B' : 'C', tk: tk ? 1 : 0, vi, pair: give + '>' + take, ko: [ko(give), ko(take)], axis: 'give', n: qty, c: x.give, uC: x.give * PER, uP: (x.give - 1) * PER, xs: xsCap, take: x.take, need: top,
          takeP: qP ? qP.take : 0, cap: top });
      }
    }
  } else if (mode === 'DE') {
    const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
    const TAKES = ['wood', 'stone', 'food', 'salt', 'fish', 'hide'];
    //   D — T988 ④ 판 그대로(낱개 하나 = (maxGive + 다 사는 단위) ÷ 2 · 낼 양 = ⌈다 사는 단위 ÷ 낱개⌉ + 1 · 받을 양 = 상한 전부)
    for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of TAKES) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ, restore = restoreOf(v);
      const its = D.items.get(give);
      const lo = trueT(vil, vi, give, take);
      const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
      if (!(b && !b.err && b.cap >= 1 && b.maxGive >= 1 && Math.floor(lo) === b.maxGive && lo - b.maxGive > 0.05)) continue;
      const U = (b.maxGive + lo) / 2, unitsOfU = (it, n) => n * U;
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : 30; }); return o; };
      const nG = Math.ceil(lo / U) + 1, nW = b.cap;
      for (const axis of ['give', 'want']) {
        const snap = JSON.stringify(v.storage), inv = mkInv();
        const x = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: axis === 'give' ? nG : 0, want: axis === 'want' ? nW : 0, unitsOf: unitsOfU, deposit: V.playerVillageDeposit });
        restore(snap);
        if (!x.ok) { rows.push({ board: 'D', tk: 0, vi, pair: give + '>' + take, axis, refused: x.err }); continue; }
        const s = JSON.stringify(v.storage), qP = x.give >= 2 ? Trade.quote(L, econV2, vil, vi, give, take, (x.give - 1) * U, {}) : null; restore(s);
        rows.push({ board: 'D', tk: 0, vi, pair: give + '>' + take, ko: [ko(give), ko(take)], axis, n: axis === 'give' ? nG : nW, c: x.give, uC: x.give * U, uP: (x.give - 1) * U, xs: lo, take: x.take, need: b.cap,
          takeP: qP ? qP.take : 0, cap: b.cap, U: +U.toFixed(4) });
      }
    }
    //   E — 상한 1 판(T988 · T999 ⑤ 그대로 · 받을 것 곳간 재고만 `1.5 ÷ STOCK_FRAC` · 짝마다 되돌림 · 낱개 = T × 0.6 · 가진 것 30)
    for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of TAKES) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ, restore = restoreOf(v);
      const its = D.items.get(give);
      const snap0 = JSON.stringify(v.storage);
      v.storage[take] = 1.5 / Trade.CFG.STOCK_FRAC;
      const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
      const T1 = (b && !b.err && b.cap === 1) ? trueT(vil, vi, give, take) : 0;
      if (!(T1 > 0)) { restore(snap0); continue; }
      const U = 0.6 * T1, unitsOfU = (it, n) => n * U;
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 30 : 0; }); return o; };
      for (const [axis, n] of [['give', 2], ['want', 1]]) {
        const snap = JSON.stringify(v.storage), inv = mkInv();
        const x = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: axis === 'give' ? n : 0, want: axis === 'want' ? n : 0, unitsOf: unitsOfU, deposit: V.playerVillageDeposit });
        restore(snap);
        if (!x.ok) { rows.push({ board: 'E', tk: 0, vi, pair: give + '>' + take, axis, refused: x.err }); continue; }
        rows.push({ board: 'E', tk: 0, vi, pair: give + '>' + take, ko: [ko(give), ko(take)], axis, n, c: x.give, uC: x.give * U, uP: (x.give - 1) * U, xs: T1, take: x.take, need: 1, takeP: 0, cap: 1, U: +U.toFixed(4) });
      }
      restore(snap0);
    }
  }
  console.log = _l;
  process.stdout.write(JSON.stringify({ mode, cap: Trade.T999_ON, words: Trade.T988_ON, rows }) + '\n', () => process.exit(0));
  return;
}

const sub = (mode, env) => new Promise((res, rej) => {
  const e = Object.assign({}, process.env, env || {}, { T1010_SUB: mode });
  const p = spawn(process.execPath, [__filename], { env: e, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (b) => { o += b; }); p.stderr.on('data', () => {});
  p.on('exit', (c) => { try { res(JSON.parse(o.trim().split('\n').pop())); } catch (err) { rej(new Error(`아이 판 ${mode} 종료 ${c}`)); } });
});
const f3 = (x) => (x == null ? '-' : (+x).toFixed(3));
(async () => {
  const t0 = Date.now();
  const [A, DE] = await Promise.all([sub('A'), sub('DE')]);
  const [B, C] = await Promise.all([sub('B', { T1010_PER: '1' }), sub('B', { T1010_PER: '2.25' })]);
  const all = [...A.rows, ...B.rows, ...C.rows, ...DE.rows];
  const live = all.filter((r) => !r.refused).map((r) => {
    const ov = r.uC - r.xs, last = r.uC - r.uP;
    const buy = r.take - r.takeP, avg = r.c >= 2 ? r.takeP / (r.c - 1) : null;   // 마지막 낱개가 산 받을 것 · 앞 낱개 평균
    return Object.assign(r, { ov: +ov.toFixed(4), last: +last.toFixed(4), frac: last > 0 ? +(ov / last).toFixed(4) : null, buy, rel: avg > 0 ? +(buy / avg).toFixed(4) : null,
      bad: !(r.uP < r.xs + 2e-3 && r.xs <= r.uC + 2e-3 && r.take >= r.need) });
  });
  const GROUPS = [
    ['A', 'give', 0, 'A 무게 다른 짐(T835 · 0.6 ~ 3.6 단위/개)'], ['A', 'give', 1, 'A 무게 다른 짐(T835 · 0.6 ~ 3.6 단위/개)'],
    ['B', 'give', 0, 'B 고른 짐(1 단위/개)'], ['B', 'give', 1, 'B 고른 짐(1 단위/개)'],
    ['C', 'give', 0, 'C 무거운 짐(2.25 단위/개)'], ['C', 'give', 1, 'C 무거운 짐(2.25 단위/개)'],
    ['D', 'give', 0, 'D 무거운 짐(T988 ④ · 낱개 = (maxGive + T) ÷ 2)'], ['D', 'want', 0, 'D 무거운 짐(T988 ④) · 받을 양 = 상한 전부'],
    ['E', 'give', 0, 'E 상한 1 판(낱개 = T × 0.6) · 낼 양 2'], ['E', 'want', 0, 'E 상한 1 판 · 받을 양 1'],
    ['A', 'want', 0, 'A 받을 양 축(캐논 ② 낱개라 올림 — 견줌)'], ['A', 'want', 1, 'A 받을 양 축(캐논 ② 낱개라 올림 — 견줌)'],
  ];
  const table = GROUPS.map(([bd, ax, tk, name]) => {
    const R = live.filter((r) => r.board === bd && r.axis === ax && r.tk === tk);
    const F = R.filter((r) => r.frac != null).map((r) => r.frac).sort((a, b) => a - b);
    const top = R.slice().sort((a, b) => (b.frac || 0) - (a.frac || 0) || b.ov - a.ov)[0] || null;
    const ovMax = R.length ? Math.max(...R.map((r) => r.ov)) : null;
    return { board: bd, axis: ax, tk, name, rows: R.length, over0: R.filter((r) => r.ov > 2e-3).length, f50: F.filter((f) => f >= 0.5).length, f90: F.filter((f) => f >= 0.9).length, bad: R.filter((r) => r.bad).length,
      pairs: [...new Set(R.map((r) => r.vi + ':' + r.pair))].length, takes: [...new Set(R.map((r) => r.pair.split('>')[1]))],
      buy1: R.filter((r) => r.c >= 2 && r.buy <= 1).length, rel10: R.filter((r) => r.rel != null && r.rel < 0.1).length,
      relMin: (() => { const z = R.filter((r) => r.rel != null).sort((a, b) => a.rel - b.rel)[0]; return z ? { vi: z.vi, pair: z.pair, ko: z.ko, c: z.c, take: z.take, takeP: z.takeP, rel: z.rel } : null; })(),
      refused: all.filter((r) => r.refused && r.board === bd && r.axis === ax).length,
      fracMax: F.length ? F[F.length - 1] : null, fracP50: F.length ? F[Math.floor(F.length / 2)] : null, ovMax: ovMax == null ? null : +ovMax.toFixed(3),
      worst: top ? { vi: top.vi, pair: top.pair, ko: top.ko, n: top.n, c: top.c, uC: +(+top.uC).toFixed(3), uP: +(+top.uP).toFixed(3), xs: +top.xs.toFixed(3), take: top.take, takeP: top.takeP, cap: top.cap, frac: top.frac, ov: top.ov } : null };
  });
  const out = { made: new Date().toISOString().slice(0, 10), world: '시드 7 · 마을 5 · 200날(T835 · T807 · T988 · T999 하네스 아이 판 세계)', cap: A.cap, words: A.words,
    sec: Math.round((Date.now() - t0) / 1000), table, rows: live.length, bad: live.filter((r) => r.bad).length,
    all: live.map((r) => [r.board, r.axis, r.tk, r.vi, r.pair, r.n, r.c, +(+r.uC).toFixed(4), +(+r.uP).toFixed(4), +r.xs.toFixed(4), r.take, r.takeP, r.need, r.frac, r.rel]),
    allCols: ['판', '축', '열량 짝', '마을', '짝', '낼 양 · 받을 양', '낸 낱개', '낸 단위', '하나 덜 낸 단위', 'X*', '받은', '하나 덜 냈으면 받을', 'X* 의 받을 낱개(= 받은)', '마지막 낱개 몫', '마지막 낱개가 산 것 ÷ 앞 낱개 평균'] };
  console.log('| 판 · 짐 | 열량 짝 | 축 | 줄(짝) | 넘침 > 0 | ≥ 0.5 · ≥ 0.9 | 마지막 낱개 몫 최대 · 중앙 | 넘는 단위 최대 | 마지막 낱개가 산 것 ≤ 1 · < 앞 평균 10% | 가장 큰 줄 | 어긋남 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of table) {
    const w = t.worst ? `마을${t.worst.vi} ${t.worst.ko[0]} ${t.worst.c}개(${f3(t.worst.uC)}) → ${t.worst.ko[1]} ${t.worst.take} · ${t.worst.c - 1}개(${f3(t.worst.uP)})면 ${t.worst.takeP} · X* ${f3(t.worst.xs)}` : '-';
    console.log(`| ${t.name} | ${t.tk ? '켬' : '끔'} | ${t.axis === 'give' ? '낼 양' : '받을 양'} | ${t.rows}(${t.pairs}) | ${t.over0} | ${t.f50} · ${t.f90} | ${f3(t.fracMax)} · ${f3(t.fracP50)} | ${f3(t.ovMax)} | ${t.buy1} · ${t.rel10} | ${w} | ${t.bad} |`);
  }
  console.log(`\n켬 기본(T999 ${out.cap} · T988 ${out.words}) · 줄 ${out.rows} · 불변식 어긋남 ${out.bad} · ${out.sec}초`);
  const ji = process.argv.indexOf('--json');
  if (ji > 0 && process.argv[ji + 1]) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1) + '\n');
})().catch((e) => { console.log('✗ ' + (e && e.message)); process.exit(1); });
