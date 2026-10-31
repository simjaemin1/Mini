#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t988-trade-words.js — 거래가 안 서는 판의 말은 그 판의 참이다 [T988] ==========
//
// ★왜 [T988 · T976 회부 1 · 2] 거래소 거절 말이 판을 잘못 갈랐다 — 받을 양 주문의 절삭 0 판(받을 양 ≤ 상한)에 "… 못 내준다 — 지금 내줄 수 있는 건 N까지다" ·
//   화면 "마을이 지금 내줄 수 있는 X은(는) N까지다" · 낼 양 축은 `maxGive ≥ 1` 이면 더 내도 안 되는 판에 "더 내야 한다" · 받을 양이 절삭돼 못 닿는 판에 화면이
//   "X W 받으려면 — 내야 할 G n (낱개라 올림 …)". 손잡이 하나 `T988_TRADE_WORDS`(켬 기본 · `=0` = 종전) — 켜면 거절 말은 `_whyNot` 하나가 종전 낱말로 낸다.
//
// 재는 것:
//   ① 술어 — `=== '0'` 만 끔(켬 기본) · 읽는 자리 = `server/trade.js` 하나 · 끔 탐침
//   ② 글자 — `_whyNot` 하나 · 부르는 자리(견적 두 · 실행 하나 · 실행 받을 양 첫 문은 견적의 그 말) · 말 넷이 종전 글자(새 말투 0) · 클라 두 줄은 낼 양 축 그 줄 글자 그대로
//   ③ 판 — `test-t835-quote-weight` 아이 판 세계 · 짐 그대로(시드 7 · 마을 5 · 200날 · 낼 것 둘 × 받을 것 여섯 × 열량 짝 끔/켬 · 낼 양 1 ~ 12 = 1,440 줄 ·
//      받을 양 1 2 3 5 8 13 21 34 = 960 줄) · 줄마다 견적 · 실행 · 화면(`renderTradePanel` 글자 그대로) · 참을 가를 재료(낼 것 한 개를 마을이 다 받나 —
//      짐 없는 견적의 `capped` · "더 내야 한다" 면 +1 개부터 가진 것 전부까지 실제 실행 가운데 서는 것이 있나):
//      ⓐ 미끼(끔) — 거짓 줄이 있다(자명 통과 금지) · ⓑ ★켬 — 거짓 줄 0 · ⓒ ★켬 — 견적이 실은 거절 말 = 실행 거절 말 ·
//      ⓓ 값 무변 — 견적 수(말 칸 밖) · 실행(됨 · 낸 · 받은) 켬 = 끔 · ⓔ 켬 말은 다 종전 낱말
//   ④ 판 — 같은 세계 · 낱개 하나가 `maxGive` 보다 무겁지만 마을이 다 받을 수 있는 짐(낼 양 = 다 사는 단위를 넘는 개수 · 받을 양 = 상한 전부 — 절삭이 깎는 판 ·
//      한 개 넘침 아님) — 두 축 다 "그 양으론 한 개도 못 바꾼다"
//   ⑤ 판 — 같은 세계 · 상한 1 판(받을 것 곳간 재고만 상한이 1 이 되게 · 짝마다 되돌림 · 낱개 하나 = 상한을 다 사는 단위의 0.6 — 한 개는 다 받지만 그 한 개로는
//      받을 것 한 개에 못 닿고 둘은 절삭이 하나로 깎는다) · 낼 양 1 · 받을 양 1 — 미끼(끔) 두 축 다 거짓 · 켬 두 축 다 "그 양으론 한 개도 못 바꾼다"
//      (낸 한 개가 절삭에 안 걸린 판도 "더 내야 한다" 의 참은 `_moreWorks` 가 가른다 — 곳간 재고 4 이상 8 미만이면 실제로 상한 1 판이다)
//   ★[T1010] ③ ④ ⑤ 는 두 세계에서 돈다 — 켬 기본(`T999_TRADE_CAP=1` · T976 · T988 · T999 다 켬) · 되돌림 짝(`T999_TRADE_CAP=0` — T999 전 종전 절삭 판 · 종전 단언 그대로).
//      켬 기본 세계의 참 값 · 말: 받을 양이 절삭돼 못 닿는 판 0(T999 ① — `wantShort` 갈래는 되돌림 짝이 잰다) · 미끼 거짓 꼴 셋(넷째 "받으려면 — 내야 할" 꼴은 판이 없다) ·
//      ④ 판은 두 축 다 선다(상한 전부 · 견적 = 실행 · 거절 말 0) · ⑤ 판은 낼 양 1 이 "… — 더 내야 한다"(참 — 2 개면 선다) · 받을 양 1 이 선다(낸 2 · 받은 1) ·
//      ⑤ 미끼(끔)는 `maxGive` 0 짝의 "한 개 값이 전부보다 비싸다"(한 개는 다 받는다 — 거짓)
//
// 실행: node scripts/test-t988-trade-words.js   (존 안 띄움 · 아이 판 넷(세계 둘 × 켬 · 끔 · 세계마다 나란히) · 약 13분)
//       [T988_DUMP=<폴더>] — 아이 판 출력(켬 · 끔)을 그 폴더에 on.json · off.json(켬 기본 세계) · on-cap0.json · off-cap0.json(되돌림 짝)으로 남긴다(계측용 · 판정 무변)
'use strict';
// ★[T1010 2026-10-31 · T999 회부 4] 켬 기본 세계로 — 종전(T999 · 10-30)은 이 하네스를 `T999_TRADE_CAP` 끈 판 하나에서 돌렸다(켬 기본 세계를 안 봤다).
//   이제 ③ ④ ⑤ 는 켬 기본 세계(T999 켬 — 그 세계의 참 말 · 값으로)와 되돌림 짝(`=0` — 종전 절삭 판 · 종전 단언 한 글자 그대로) 둘 다 잰다(단언 무름 0).
const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PANEL = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
const panelSrc = (PANEL.match(/function renderTradePanel[^]*?\n  \}\n/) || [''])[0];

if (process.env.T988_SUB) {   // ── 아이 판 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js')), K = require(SV('kcal.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const mk = new Function('myTrade', 'trGive', 'trTake', 'trQuote', 'trAxis', 'trWant', 'trQty', 'inventory', 'itemKo', 'myCarry', 'itemWeights', 'renderSide', 'document', 'window', panelSrc + '\nreturn renderTradePanel;');
  const screen = (vi, give, take, q, axis, want, qty) => {   // 패널 글자 그대로 — 자유 변수만 넣는다(수는 전부 서버 견적의 것)
    const myTrade = { name: '랩마을' + vi, numeraireKo: Events.koRes(give), spread: 0.1, member: null,
      rows: [{ res: give, ko: Events.koRes(give), num: 1, sell: 0, mine: 2, canGive: true, canTake: false }, { res: take, ko: Events.koRes(take), num: 1, sell: q.cap, mine: 0, canGive: false, canTake: true }] };
    const body = { innerHTML: '', querySelectorAll: () => [] };
    mk(myTrade, give, take, Object.assign({}, q, { takeRes: take }), axis, want, qty, {}, (x) => x, null, null, () => {}, { getElementById: () => null }, {})(body);
    const h = body.innerHTML, deal = h.slice(h.indexOf('<div class="tr-deal">'), h.indexOf('<div class="tr-qty">'));
    const lines = []; const re = /<div class="(tr-line|tr-warn)">([^]*?)<\/div>/g; let m;
    while ((m = re.exec(deal))) lines.push([m[1], m[2].replace(/<[^>]+>/g, '')]);
    return { lines, go: !/id="trGo" disabled/.test(h) };
  };
  const strip = (q) => { const o = Object.assign({}, q); delete o.why; delete o.wantShort; return o; };
  const out = [];
  if (process.env.T988_SUB === 'grid') {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const D = L.deliverable;
    const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
    //   무게 다른 짐 — `test-t835-quote-weight` 그 글자(아이템마다 기준 무게 · 낱개마다 앞이 무겁다) · ★기준 무게는 낼 것 아이템 정본 순서로 **미리** 준다:
    //     T835 처럼 처음 부를 때 주면 켬(“더 내야 한다” 를 가리려 가진 것 끝까지 잰다)과 끔이 아이템을 처음 부르는 차례가 달라 두 판의 짐이 갈린다(같은 세계가 아니다)
    const W0 = {}; let k = 0;
    for (const g of GIVES) for (const it of D.items.get(g)) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2;
    const unitsOf = (it, n) => { if (W0[it] == null) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2; let u = 0; for (let i = 0; i < n; i++) u += W0[it] * (1 + 0.5 / (1 + i)); return +u.toFixed(4); };
    for (let vi = 0; vi < 5; vi++) for (const tk of [null, K]) for (const give of GIVES) for (const take of ['wood', 'stone', 'food', 'salt', 'fish', 'hide']) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
      const its = D.items.get(give);
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : (j === 1 ? 5 : 30); }); return o; };
      const HAVE = Object.values(mkInv()).reduce((a, b) => a + b, 0);   // 가진 것 전부(낱개) — "더 내야 한다" 의 참은 이 안에서 더 내 서는 실행이 있나
      const restore = (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
      const hostOpts = (inv, qty, want) => { const u = Number(unitsOf(its[0], 1)) * qty, per = qty > 0 ? u / qty : 1;
        return { u, o: Object.assign(tk ? { want, perItem: per, takeKcal: tk } : { want, perItem: per }, { inventory: inv, unitsOf, giveCount: qty }) }; };
      const ex = (inv, qty, want) => Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want, unitsOf, deposit: V.playerVillageDeposit }, tk ? { takeKcal: tk } : {}));
      const u1 = Number(unitsOf(its[0], 1));
      const q1 = Trade.quote(L, econV2, vil, vi, give, take, u1, tk ? { takeKcal: tk } : {});   // 짐 없는 견적 — 낼 것 한 개(고른 첫 개체)를 마을이 다 받나
      const oneOver = !!(q1 && !q1.err && q1.capped);
      for (const axis of ['give', 'want']) for (const n of (axis === 'give' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 5, 8, 13, 21, 34])) {
        const snap = JSON.stringify(v.storage), inv = mkInv();
        const h = axis === 'give' ? hostOpts(inv, n, 0) : hostOpts(inv, 1, n);
        const q = Trade.quote(L, econV2, vil, vi, give, take, h.u, h.o);
        const x = axis === 'give' ? ex(inv, n, 0) : ex(inv, 0, n); restore(snap);
        let cf = null;   // "더 내야 한다" 의 참 — 가진 것 안에서 더 내 서는 실행이 있나(+1 개부터 가진 것 전부까지 · 실제 실행으로)
        if (axis === 'give' && !x.ok && /더 내야 한다/.test(x.err || '')) for (let n2 = n + 1; n2 <= HAVE && cf == null; n2++) { const s2 = JSON.stringify(v.storage); const x2 = ex(mkInv(), n2, 0); restore(s2); if (x2.ok && x2.take > 0) cf = n2; }
        out.push({ axis, vi, tk: tk ? 1 : 0, pair: give + '>' + take, n, oneOver, q: q.err ? { err: q.err } : strip(q), why: q.why || null, short: !!q.wantShort,
          x: x.ok ? { ok: 1, give: x.give, take: x.take } : { ok: 0, err: x.err }, cf, sc: q.err ? null : screen(vi, give, take, q, axis, axis === 'want' ? n : 0, axis === 'give' ? n : 1) });
      }
    }
    //   ④ 절삭이 깎는 판 — 같은 세계 · 낱개 하나 = (`maxGive` + 마을이 내줄 몫 전부를 사는 낼 단위) ÷ 2(그 둘 사이 — 한 개 넘침 아님) · 짐 없는 견적으로 다 사는 단위를 이분 탐색
    //     낼 양 = 다 사는 단위를 넘는 개수(상한 절삭이 걸린다) · 받을 양 = 마을이 내줄 몫 전부(올림이 둘 이상을 낸다 → 절삭 0)
    for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of ['wood', 'stone', 'food', 'salt', 'fish', 'hide']) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
      const its = D.items.get(give);
      const capAt = (x) => { const q = Trade.quote(L, econV2, vil, vi, give, take, x, {}); return !!(q && !q.err && q.capped); };
      let lo = 0, hi = 1; for (let g = 0; g < 40 && !capAt(hi); g++) { lo = hi; hi *= 2; }
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (capAt(mid)) hi = mid; else lo = mid; }
      const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
      if (!(b && !b.err && b.cap >= 1 && b.maxGive >= 1 && Math.floor(lo) === b.maxGive && lo - b.maxGive > 0.05)) continue;   // `maxGive` = ⌊다 사는 단위⌋ < 낱개 ≤ 다 사는 단위
      const U = (b.maxGive + lo) / 2, unitsOfU = (it, n) => n * U;
      const restore = (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : 30; }); return o; };
      const q1 = Trade.quote(L, econV2, vil, vi, give, take, U, {}); const oneOver = !!(q1 && !q1.err && q1.capped);
      const nG = Math.ceil(lo / U) + 1, nW = b.cap;
      for (const axis of ['give', 'want']) {
        const snap = JSON.stringify(v.storage), inv = mkInv(), n = axis === 'give' ? nG : nW;
        const q = Trade.quote(L, econV2, vil, vi, give, take, axis === 'give' ? U * nG : U, { want: axis === 'want' ? nW : 0, perItem: U, inventory: inv, unitsOf: unitsOfU, giveCount: axis === 'give' ? nG : 1 });
        const x = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: axis === 'give' ? nG : 0, want: axis === 'want' ? nW : 0, unitsOf: unitsOfU, deposit: V.playerVillageDeposit });
        restore(snap);
        out.push({ cut: 1, axis, vi, tk: 0, pair: give + '>' + take, n, oneOver, U: +U.toFixed(4), hi: +lo.toFixed(4), maxGive: b.maxGive, q: q.err ? { err: q.err } : strip(q), why: q.why || null, short: !!q.wantShort,
          x: x.ok ? { ok: 1, give: x.give, take: x.take } : { ok: 0, err: x.err }, cf: null, sc: q.err ? null : screen(vi, give, take, q, axis, axis === 'want' ? nW : 0, axis === 'give' ? nG : 1) });
      }
    }
    //   ⑤ 상한 1 판 — 같은 세계 · 받을 것 곳간 재고만 상한이 1 이 되게 놓는다(`1.5 ÷ STOCK_FRAC` · 짝마다 판 뒤 되돌림) · 낱개 하나 = 상한을 다 사는 단위의 0.6
    //     (한 개는 마을이 다 받고 · 그 한 개로는 받을 것 한 개에 못 닿고 · 둘은 상한을 넘어 절삭이 하나로 깎는다 — 더 내도 안 된다) · 낼 양 1 · 받을 양 1
    for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of ['wood', 'stone', 'food', 'salt', 'fish', 'hide']) {
      if (give === take || !D.toEcon.get(take)) continue;
      const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
      const its = D.items.get(give);
      const restore = (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
      const snap0 = JSON.stringify(v.storage);
      v.storage[take] = 1.5 / Trade.CFG.STOCK_FRAC;
      const capAt = (x) => { const q = Trade.quote(L, econV2, vil, vi, give, take, x, {}); return !!(q && !q.err && q.capped); };
      let lo = 0, hi = 1; for (let g = 0; g < 40 && !capAt(hi); g++) { lo = hi; hi *= 2; }
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (capAt(mid)) hi = mid; else lo = mid; }
      const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
      if (!(b && !b.err && b.cap === 1 && lo > 0)) { restore(snap0); continue; }
      const U = 0.6 * lo, unitsOfU = (it, n) => n * U, HAVE = 30;
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? HAVE : 0; }); return o; };
      const q1 = Trade.quote(L, econV2, vil, vi, give, take, U, {}); const oneOver = !!(q1 && !q1.err && q1.capped);
      const ex1 = (inv, qty, want) => Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want, unitsOf: unitsOfU, deposit: V.playerVillageDeposit });
      for (const axis of ['give', 'want']) {
        const snap = JSON.stringify(v.storage), inv = mkInv();
        const q = Trade.quote(L, econV2, vil, vi, give, take, U, { want: axis === 'want' ? 1 : 0, perItem: U, inventory: inv, unitsOf: unitsOfU, giveCount: 1 });
        const x = axis === 'give' ? ex1(inv, 1, 0) : ex1(inv, 0, 1); restore(snap);
        let cf = null;
        if (axis === 'give' && !x.ok && /더 내야 한다/.test(x.err || '')) for (let n2 = 2; n2 <= HAVE && cf == null; n2++) { const s2 = JSON.stringify(v.storage); const x2 = ex1(mkInv(), n2, 0); restore(s2); if (x2.ok && x2.take > 0) cf = n2; }
        out.push({ cap1: 1, axis, vi, tk: 0, pair: give + '>' + take, n: 1, oneOver, U: +U.toFixed(4), hi: +lo.toFixed(4), maxGive: b.maxGive, q: q.err ? { err: q.err } : strip(q), why: q.why || null, short: !!q.wantShort,
          x: x.ok ? { ok: 1, give: x.give, take: x.take } : { ok: 0, err: x.err }, cf, sc: q.err ? null : screen(vi, give, take, q, axis, axis === 'want' ? 1 : 0, 1) });
      }
      restore(snap0);
    }
  }
  console.log = _l;
  process.stdout.write(JSON.stringify({ on: Trade.T988_ON, cap: Trade.T999_ON, out }) + '\n', () => process.exit(0));   // 큰 출력 — 파이프에 다 흘려보낸 뒤 끝낸다(곧장 exit 하면 잘린다)
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T), CP = codeOnly(panelSrc);

console.log('\n=== 거래가 안 서는 판의 말은 그 판의 참이다 (T988) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = T.match(/const T988_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T988_TRADE_WORDS === '0'\);/g) || [];
  ok(decl.length === 1, "① 선언 하나 · `=== '0'` 만 끔(켬 기본)", `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T988_TRADE_WORDS')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나(클라는 손잡이를 안 읽는다 — 칸이 오면 그린다)', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T988_TRADE_WORDS; if (v != null) e.T988_TRADE_WORDS = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T988_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('0')} · ${probe('1')}`); }

console.log('\n② 글자 — 말 함수 하나 · 부르는 자리 · 종전 낱말');
{ ok((C.match(/function _whyNot\(/g) || []).length === 1, '② 말 함수 `_whyNot` 하나(사본 0)');
  const calls = (C.match(/(?<!function )_whyNot\(econV2, v, giveRes, takeRes, /g) || []).length;
  ok(calls === 3, '② 부르는 자리 셋 — 견적 받을 양 절삭 0 · 견적 낼 양 받을 낱개 0 · 실행 거절 문', `${calls}`);
  const mw = (C.match(/function _moreWorks\(/g) || []).length, mwCalls = (C.match(/(?<!function )_moreWorks\(econV2, v, giveRes, takeRes, /g) || []).length;
  ok(mw === 1 && mwCalls === 3 && /const more = !out\.capped && g > 0 && \(_G \? \(_gN > 0 && _moreWorks\(/.test(C) && /const more = !\(wantTake > 0\) && !qt\.capped && give > 0 && _moreWorks\(econV2, v, giveRes, takeRes, q0, have, G\.at, capU, _takeN\);/.test(C),
    '② "더 내야 한다" 의 참 `_moreWorks` 하나 — 견적 낼 양 축(인벤 · 인벤 없음) · 실행 거절 문(낼 양 주문 · 절삭 안 걸림 · 가진 것 안)', `정의 ${mw} · 부름 ${mwCalls}`);
  ok(/if \(T988_ON && qw\.why\) return \{ ok: false, err: qw\.why \};/.test(C), '② 실행 받을 양 첫 문은 견적이 실은 그 말(같은 함수의 답)');
  //   말 넷 — `_whyNot` 의 글자가 끔 갈래(종전) 글자와 한 글자 같다 · 넷째는 종전 말의 앞 토막
  const body = (C.match(/function _whyNot\([^]*?\n\}\n/) || [''])[0];
  const lits = (s) => (s.match(/`[^`]*`|'[^']*'/g) || []).join(' ');
  const old4 = /if \(qt\.cap <= 0\) return \{ ok: false, err: (`마을에 \$\{Events\.koRes\(takeRes\)\}이\(가\) 남아 있지 않다`) \};/.exec(C);
  const old5 = /err: (`\$\{Events\.koRes\(giveRes\)\} 한 개 값이 마을이 내줄 수 있는 `)\s*\+ (`\$\{Events\.koRes\(takeRes\)\} 전부\(\$\{qt\.cap\}\)보다 비싸다 — 이 마을은 지금 그 값을 못 치른다`)/.exec(C);
  const old6 = /return \{ ok: false, err: ('그 양으론 한 개도 못 바꾼다 — 더 내야 한다') \};/.exec(C);
  const b5 = old5 ? old5[1] + ' ' + old5[2].replace('${qt.cap}', '${capShow}') : null;
  ok(!!(old4 && old5 && old6) && body.includes(old4[1]) && lits(body).includes(b5) && body.includes(old6[1]) && body.includes("'그 양으론 한 개도 못 바꾼다'") && old6[1].startsWith("'그 양으론 한 개도 못 바꾼다"),
    '② ★말 넷은 종전 글자(새 말투 0) — "남아 있지 않다" · "… 한 개 값이 … 전부(N)보다 비싸다 — 못 치른다" · "더 내야 한다" · 그 앞 토막');
  const giveLine = /h \+= `<div class="tr-line">\$\{gk\} <b>\$\{trQuote\.give\}<\/b> \$\{tk\} <b>\$\{trQuote\.take\}<\/b><\/div>`;/.test(CP);
  const shortLine = /h \+= `<div class="tr-line">\$\{gk\} <b>\$\{trQuote\.giveNeeded\}<\/b> \$\{tk\} <b>\$\{trQuote\.takeAtNeeded\}<\/b><\/div>`;/.test(CP);
  const capWarn = /`<div class="tr-warn">마을이 내줄 수 있는 건 \$\{trQuote\.cap\}까지 — \$\{trQuote\.giveUsed != null \? trQuote\.giveUsed : trQuote\.maxGive\}개만 받는다<\/div>`/.test(CP);
  const shortWarn = /`<div class="tr-warn">마을이 내줄 수 있는 건 \$\{trQuote\.cap\}까지 — \$\{trQuote\.giveNeeded\}개만 받는다<\/div>`/.test(CP);
  ok(giveLine && shortLine && capWarn && shortWarn && /trQuote\.wantShort/.test(CP) && /\$\{trQuote\.why \|\| `마을이 지금 내줄 수 있는 \$\{tk\}은\(는\) \$\{trQuote\.cap\}까지다`\}/.test(CP) && /if \(!wantAxis && trQuote\.why\)/.test(CP),
    '② 클라 — `why` 가 오면 그 말 · `wantShort` 면 낼 양 축의 두 줄 글자 그대로(칸이 없으면 종전 글자)', `${panelSrc.length}자`); }

const sub = (mode, v, env) => new Promise((res, rej) => {
  const e = Object.assign({}, process.env, env || {}, { T988_SUB: mode, T988_TRADE_WORDS: v });
  const p = spawn(process.execPath, [__filename], { env: e, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '';
  p.stdout.setEncoding('utf8');   // 조각 경계에 걸린 한글 바이트를 잇는다(조각마다 글자로 풀면 깨진다)
  p.stdout.on('data', (b) => { o += b; }); p.stderr.on('data', () => {});
  p.on('exit', (c) => { try { res(JSON.parse(o.trim().split('\n').pop())); } catch (err) { rej(new Error(`아이 판 ${mode}/${v} 종료 ${c}`)); } });
});
//   참 가르기 — 줄의 말(화면 · 실행)이 그 판과 맞나(거짓 이유 목록 · 빈 목록 = 참)
const N_ = '\\d+(?:\\.\\d+)?';   // 상한 · 낱개 수(열량 짝이 없으면 상한은 소수일 수 있다)
const E1 = new RegExp(`^마을이 .+ ${N_}개를 못 내준다 — 지금 내줄 수 있는 건 ${N_}까지다$`), E5 = new RegExp(`^.+ 한 개 값이 마을이 내줄 수 있는 .+ 전부\\(${N_}\\)보다 비싸다 — 이 마을은 지금 그 값을 못 치른다$`);
const E6 = /^그 양으론 한 개도 못 바꾼다 — 더 내야 한다$/, E6a = /^그 양으론 한 개도 못 바꾼다$/, E4 = /^마을에 .+이\(가\) 남아 있지 않다$/;
const E3 = new RegExp(`^.+ ${N_}개를 받으려면 .+ ${N_}개가 필요한데 그만큼 없다$`), E3g = /^그만큼 갖고 있지 않다$/;
const CAPW = new RegExp(`^마을이 지금 내줄 수 있는 .+은\\(는\\) ${N_}까지다$`), S5 = new RegExp(`^마을이 내줄 수 있는 건 ${N_}까지 — (${N_})개만 받는다$`);
const OLD = [E1, E5, E6, E6a, E4, E3, E3g, CAPW, S5];
function lies(r) {
  const L = [];
  if (r.q.err) return L;
  const warn = r.sc.lines.filter((l) => l[0] === 'tr-warn').map((l) => l[1]), deal = r.sc.lines.filter((l) => l[0] === 'tr-line').map((l) => l[1]);
  if (!r.x.ok) {
    const e = r.x.err || '';
    if (E1.test(e) && !(r.n > r.q.cap)) L.push('실행 "못 내준다 — N까지" 인데 받을 양 ≤ N');
    if (E5.test(e) && !r.oneOver) L.push('실행 "한 개 값이 전부보다 비싸다" 인데 마을이 그 한 개를 다 받는다');
    if (E6.test(e) && r.cf == null) L.push('실행 "더 내야 한다" 인데 더 내도 안 된다');
    if (E4.test(e) && !(r.q.cap <= 0)) L.push('실행 "남아 있지 않다" 인데 상한 > 0');
    for (const w of warn) {
      if (CAPW.test(w) && !(r.n > r.q.cap)) L.push('화면 "내줄 수 있는 X은(는) N까지다" 인데 받을 양 ≤ N');
      if (E5.test(w) && !r.oneOver) L.push('화면 "한 개 값이 전부보다 비싸다" 인데 마을이 그 한 개를 다 받는다');
      if (E6.test(w) && r.cf == null && !/더 내야 한다/.test(e)) L.push('화면 "더 내야 한다" 인데 실행은 다른 말');
      const m = S5.exec(w); if (m && +m[1] > 0) L.push('화면 "n개만 받는다(n > 0)" 인데 실행은 거절');
    }
    if (r.axis === 'want' && !warn.length && !deal.some((d) => /내야 할/.test(d))) L.push('화면 빈 견적(까닭 0)');
    if (r.sc.go) L.push('화면 단추가 켜졌는데 실행은 거절');
  } else {
    if (r.axis === 'give') {
      if (r.q.take !== r.x.take) L.push('화면 받을 양 ≠ 실행');
      for (const w of warn) { const m = /— (\d+)개만 받는다$/.exec(w); if (m && +m[1] !== r.x.give) L.push('화면 "n개만 받는다" ≠ 실행 낸 낱개'); }
    } else {
      const want = /^.+ (\d+) 받으려면 — 내야 할 .+ (\d+) \(낱개라 올림 · 그러면 .+ (\d+)\)$/.exec(deal[0] || '');
      const shortL = !want && /^.+ (\d+(?:\.\d+)?) .+ (\d+)$/.exec(deal[0] || '');
      if (want) { if (+want[2] !== r.x.give || +want[3] !== r.x.take) L.push('화면 낼 · 받을 ≠ 실행'); if (r.x.take < r.n) L.push('화면 "받으려면 — 내야 할" 인데 받을 양에 못 닿는다'); }
      else if (shortL) { if (+shortL[1] !== r.x.give || +shortL[2] !== r.x.take) L.push('화면(낼 양 축 줄) ≠ 실행'); if (!(r.x.take < r.n)) L.push('낼 양 축 줄인데 받을 양에 닿는다');
        for (const w of warn) { const m = /— (\d+)개만 받는다$/.exec(w); if (m && +m[1] !== r.x.give) L.push('화면 "n개만 받는다" ≠ 실행 낸 낱개'); } }
      else L.push('화면 거래 줄 없음');
    }
  }
  return L;
}
//   ★[T1010] 세계 둘 — 켬 기본(T999 켬 — 상한의 마지막 한 개도 판다) · 되돌림 짝(T999 끔 — 종전 절삭 판 · 종전 단언 그대로)
const WORLDS = [
  { name: '켬 기본 — T976 · T988 · T999 켬', env: { T999_TRADE_CAP: '1' }, cap: true, tag: '' },
  { name: '되돌림 짝 — `T999_TRADE_CAP=0`(종전 절삭 판 · 종전 단언 그대로)', env: { T999_TRADE_CAP: '0' }, cap: false, tag: '-cap0' },
];
(async () => {
 for (const W of WORLDS) {
  console.log(`\n③ 판 [${W.name}] — T835 아이 판 세계 · 짐 그대로 · 두 축 2,400 줄(켬 · 끔 나란히) · 줄마다 견적 · 실행 · 화면 · 참`);
  const [ON, OFF] = await Promise.all([sub('grid', '1', W.env), sub('grid', '0', W.env)]);
  if (process.env.T988_DUMP) { fs.mkdirSync(process.env.T988_DUMP, { recursive: true });   // 계측용 — 아이 판 출력 그대로(판정에 안 쓴다)
    fs.writeFileSync(path.join(process.env.T988_DUMP, `on${W.tag}.json`), JSON.stringify(ON) + '\n'); fs.writeFileSync(path.join(process.env.T988_DUMP, `off${W.tag}.json`), JSON.stringify(OFF) + '\n'); }
  const on = { on: ON.on, out: ON.out.filter((r) => !r.cut && !r.cap1) }, off = { on: OFF.on, out: OFF.out.filter((r) => !r.cut && !r.cap1) };
  const cOn = { out: ON.out.filter((r) => r.cut) }, cOff = { out: OFF.out.filter((r) => r.cut) };
  const kOn = { out: ON.out.filter((r) => r.cap1) }, kOff = { out: OFF.out.filter((r) => r.cap1) };
  ok(on.on === true && off.on === false && ON.cap === W.cap && OFF.cap === W.cap && on.out.length === off.out.length && on.out.length === 2400, '③ 전제 — 손잡이가 실제로 읽힌다(이 세계의 T999) · 두 판 줄 수 같다(1,440 + 960)', `${on.out.length} 줄 · T999 ${ON.cap}`);
  const refuse = on.out.filter((r) => !r.q.err && !r.x.ok), nShort = on.out.filter((r) => r.short).length;
  if (!W.cap) ok(refuse.filter((r) => r.axis === 'want').length >= 100 && refuse.filter((r) => r.axis === 'give').length >= 100 && on.out.some((r) => r.short),
    '③ 전제 — 거절 판이 두 축에 넉넉하고 받을 양이 절삭돼 못 닿는 판도 있다(자명 통과 금지)', `거절 받을 양 ${refuse.filter((r) => r.axis === 'want').length} · 낼 양 ${refuse.filter((r) => r.axis === 'give').length} · 못 닿음 ${nShort}`);
  //   ★[T1010] 켬 기본 세계 — T999 ① 이 받을 양 축 절삭을 받을 양 그대로 두어(올림 걸음이 낸 낱개가 이미 최소) 받을 양이 절삭돼 못 닿는 판이 없다 — `wantShort` 갈래 말은 되돌림 짝이 잰다
  else ok(refuse.filter((r) => r.axis === 'want').length >= 100 && refuse.filter((r) => r.axis === 'give').length >= 100 && nShort === 0,
    '③ 전제 — 거절 판이 두 축에 넉넉하다(자명 통과 금지) · 받을 양이 절삭돼 못 닿는 판은 0(T999 ① — `wantShort` 갈래는 되돌림 짝이 잰다)', `거절 받을 양 ${refuse.filter((r) => r.axis === 'want').length} · 낼 양 ${refuse.filter((r) => r.axis === 'give').length} · 못 닿음 ${nShort}`);
  const lOff = off.out.map((r) => ({ r, l: lies(r) })).filter((z) => z.l.length), lOn = on.out.map((r) => ({ r, l: lies(r) })).filter((z) => z.l.length);
  const kinds = (Z) => { const o = {}; for (const z of Z) for (const w of z.l) o[w] = (o[w] || 0) + 1; return o; };
  const ko = kinds(lOff);
  const K4 = ['실행 "못 내준다 — N까지" 인데 받을 양 ≤ N', '화면 "내줄 수 있는 X은(는) N까지다" 인데 받을 양 ≤ N', '실행 "더 내야 한다" 인데 더 내도 안 된다', '화면 "받으려면 — 내야 할" 인데 받을 양에 못 닿는다'];
  if (!W.cap) ok(lOff.length > 0 && ko[K4[0]] > 0 && ko[K4[1]] > 0 && ko[K4[2]] > 0 && ko[K4[3]] > 0, 'ⓐ 미끼(끔) — 거짓 줄이 있다(네 꼴 다)', `${lOff.length} 줄 · ${JSON.stringify(ko)}`);
  else ok(lOff.length > 0 && ko[K4[0]] > 0 && ko[K4[1]] > 0 && ko[K4[2]] > 0 && !(ko[K4[3]] > 0),
    'ⓐ 미끼(끔) — 거짓 줄이 있다(세 꼴 · 넷째 "받으려면 — 내야 할" 꼴은 이 세계에 판이 없다 — 받을 양이 절삭돼 못 닿는 판 0)', `${lOff.length} 줄 · ${JSON.stringify(ko)}`);
  ok(lOn.length === 0, '★★ⓑ 켬 — 거짓 줄 0(두 축 · 화면 · 실행)', lOn.length ? `${lOn.length} · 예 ${JSON.stringify({ r: [lOn[0].r.axis, lOn[0].r.vi, lOn[0].r.tk, lOn[0].r.pair, lOn[0].r.n], l: lOn[0].l, x: lOn[0].r.x, sc: lOn[0].r.sc.lines })}` : '2,400 줄');
  //   ⓒ 견적이 실은 거절 말 — 실행이 그 거절 문에 닿으면 한 글자 같다(같은 함수) · 실행은 그 앞 문(가진 것 모자람 — 견적은 모른다)에서 먼저 거절할 수 있다
  const why = on.out.filter((r) => r.why), sameW = why.filter((r) => !r.x.ok && r.x.err === r.why), invW = why.filter((r) => !r.x.ok && (E3.test(r.x.err) || E3g.test(r.x.err)));
  ok(why.length > 0 && sameW.length > 0 && sameW.length + invW.length === why.length, '★ⓒ 켬 — 견적이 실은 거절 말 = 실행 거절 말(같은 함수 · 화면이 실행과 같은 말을 한다 · 가진 것이 모자란 줄은 실행이 그 말로 먼저 거절)',
    `${why.length} 줄 = 같은 말 ${sameW.length} + 가진 것 모자람 ${invW.length}`);
  const vx = (r) => JSON.stringify([r.q, r.x.ok, r.x.give, r.x.take]);
  const AO = ON.out, AF = OFF.out, vd = AO.map((r, i) => i).filter((i) => vx(AO[i]) !== vx(AF[i]));   // 판 셋(③ · ④ · ⑤) 다
  ok(AO.length === AF.length && vd.length === 0, 'ⓓ 값 무변 — 견적 수(말 칸 밖) · 실행(됨 · 낸 · 받은) 켬 = 끔 한 자리도 안 다르다(③ · ④ · ⑤ 판 다)',
    vd.length ? `${vd.length} 줄 · 첫 줄 ${JSON.stringify([AO[vd[0]].axis, AO[vd[0]].vi, AO[vd[0]].tk, AO[vd[0]].pair, AO[vd[0]].n])} 켬 ${vx(AO[vd[0]])} · 끔 ${vx(AF[vd[0]])}` : `${AO.length} 줄`);
  const msgs = []; for (const r of on.out) { if (r.q.err) continue; if (r.x.err) msgs.push(r.x.err); if (r.sc) for (const l of r.sc.lines) if (l[0] === 'tr-warn') msgs.push(l[1]); }
  const novel = [...new Set(msgs.filter((s) => !/^받으면 /.test(s) && !OLD.some((re) => re.test(s))))];
  ok(novel.length === 0, 'ⓔ 켬 말은 다 종전 낱말(새 말투 0)', novel.length ? novel.slice(0, 3).join(' / ') : `${new Set(msgs).size} 가지`);
  console.log(`\n④ 판 [${W.name}] — 같은 세계 · 절삭이 깎지만 한 개 넘침은 아닌 짐(낱개 하나 = (maxGive + 다 사는 단위) ÷ 2 · 낼 양 = 다 사는 단위를 넘는 개수 · 받을 양 = 상한 전부)`);
  if (!W.cap) {
    ok(cOn.out.length >= 4 && cOn.out.every((r) => !r.oneOver && !r.x.ok), '④ 전제 — 그 판이 선다 · 한 개 넘침 아님 · 두 축 다 거절', `${cOn.out.length} 줄`);
    ok(cOff.out.filter((r) => r.axis === 'give').some((r) => E6.test(r.x.err || '')), '④ 미끼(끔) — 낼 양 축이 "더 내야 한다"(더 내도 짐이 다 무거워 안 된다)');
    ok(cOn.out.every((r) => E6a.test(r.x.err || '') && (r.why == null || r.why === r.x.err)) && cOn.out.every((r) => lies(Object.assign({}, r, { cf: null })).length === 0),
      '★④ 켬 — 두 축 다 "그 양으론 한 개도 못 바꾼다"(한 개 넘침이라 우기지 않는다 · 거짓 0)', cOn.out[0] ? cOn.out[0].x.err : '-');
  } else {
    //   ★[T1010] 켬 기본 세계 — 그 판은 T999 ① 이 상한 전부를 판다(한 개는 마을이 다 받는다 · 둘이면 상한을 넘는다) — T988 의 말이 걸릴 거절 판이 아니다
    ok(cOn.out.length >= 4 && cOn.out.length === cOff.out.length && cOn.out.every((r) => !r.oneOver), '④ 전제 — 그 판이 선다 · 한 개 넘침 아님', `${cOn.out.length} 줄`);
    ok(cOff.out.every((r) => r.x.ok), '④ 끔(T988 말 끔)도 두 축 다 선다 — 거절 말이 걸릴 판이 아니다(T999 ①)', `${cOff.out.filter((r) => r.x.ok).length}/${cOff.out.length}`);
    const full = (r) => r.x.ok && r.why == null && !r.short && lies(r).length === 0
      && (r.axis === 'give' ? (r.x.take === r.q.cap && r.q.take === r.x.take && r.q.giveUsed === r.x.give) : (r.x.take >= r.n && r.q.giveNeeded === r.x.give && r.q.takeAtNeeded === r.x.take));
    ok(cOn.out.every(full), '★④ 켬 — 두 축 다 선다 — 상한 전부를 받는다(낼 양 축 받을 = 상한 · 받을 양 축 받을 양 = 상한) · 견적 = 실행 · 말 칸 없음 · 거짓 0',
      cOn.out[0] ? `${cOn.out.filter(full).length}/${cOn.out.length} · 예 낼 양 ${cOn.out[0].n} → 낸 ${cOn.out[0].x.give} · 받은 ${cOn.out[0].x.take}(상한 ${cOn.out[0].q.cap})` : '-');
  }
  console.log(`\n⑤ 판 [${W.name}] — 같은 세계 · 상한 1 판(받을 것 곳간 재고만 상한 1 · 판 뒤 되돌림) · 낱개 하나 = 상한을 다 사는 단위의 0.6 · 낼 양 1 · 받을 양 1`);
  const kG = kOff.out.filter((r) => r.axis === 'give'), kW = kOff.out.filter((r) => r.axis === 'want');
  if (!W.cap) {
    ok(kOn.out.length >= 4 && kOn.out.length === kOff.out.length && kOn.out.every((r) => !r.q.err && r.q.cap === 1 && !r.oneOver && !r.x.ok),
      '⑤ 전제 — 그 판이 선다 · 상한 1 · 한 개 넘침 아님(마을이 한 개를 다 받는다) · 두 축 다 거절', `${kOn.out.length} 줄 · 짝 ${kOn.out.length / 2}`);
    ok(kOff.out.every((r) => lies(r).length > 0) && kG.every((r) => E6.test(r.x.err || '') || E5.test(r.x.err || '')) && kW.every((r) => E1.test(r.x.err || '')),
      '⑤ 미끼(끔) — 두 축 다 거짓 — 낼 양 축 "더 내야 한다"(더 내도 절삭이 하나로 깎는다) · `maxGive` 0 이면 "한 개 값이 전부보다 비싸다"(한 개는 다 받는다) · 받을 양 축 "못 내준다 — 1까지"(받을 양 1)',
      `${kOff.out.filter((r) => lies(r).length > 0).length} 줄 · 낼 양 ${[...new Set(kG.map((r) => (E6.test(r.x.err || '') ? '더 내야 한다' : '한 개 값이 비싸다')))].join(' · ')}`);
    ok(kOn.out.every((r) => E6a.test(r.x.err || '') && r.why === r.x.err && lies(r).length === 0),
      '★⑤ 켬 — 두 축 다 "그 양으론 한 개도 못 바꾼다"(견적 = 실행 · 거짓 0 — 낸 한 개가 절삭에 안 걸려도 "더 내야 한다" 라 하지 않는다)', kOn.out[0] ? kOn.out[0].x.err : '-');
  } else {
    //   ★[T1010] 켬 기본 세계 — 받을 양 1 은 선다(낸 2 · 받은 1 — T999 ①) · 낼 양 1 은 그 한 개로 받을 것 한 개에 못 닿고 2 개면 선다 — "더 내야 한다" 가 참이다
    ok(kOn.out.length >= 4 && kOn.out.length === kOff.out.length && kOn.out.every((r) => !r.q.err && r.q.cap === 1 && !r.oneOver),
      '⑤ 전제 — 그 판이 선다 · 상한 1 · 한 개 넘침 아님(마을이 한 개를 다 받는다)', `${kOn.out.length} 줄 · 짝 ${kOn.out.length / 2}`);
    const e5 = kG.filter((r) => r.maxGive < 1);
    ok(kW.every((r) => r.x.ok && r.x.give === 2 && r.x.take === 1) && kG.every((r) => !r.x.ok && (r.maxGive >= 1 ? (E6.test(r.x.err || '') && r.cf === 2) : (E5.test(r.x.err || '') && lies(r).length > 0))) && e5.length > 0,
      '⑤ 미끼(끔) — 낼 양 축 `maxGive` 0 짝은 "한 개 값이 전부보다 비싸다"(거짓 — 한 개는 다 받는다) · `maxGive` ≥ 1 짝의 "더 내야 한다" 는 이 세계에선 참(2 개면 선다) · 받을 양 1 은 선다(낸 2 · 받은 1)',
      `거짓 ${kOff.out.filter((r) => lies(r).length > 0).length} 줄(비싸다 ${e5.length}) · 더 내야 한다(참) ${kG.length - e5.length} · 받을 양 섬 ${kW.filter((r) => r.x.ok).length}/${kW.length}`);
    const g1 = kOn.out.filter((r) => r.axis === 'give'), w1 = kOn.out.filter((r) => r.axis === 'want');
    ok(g1.every((r) => !r.x.ok && E6.test(r.x.err || '') && r.why === r.x.err && r.cf === 2) && w1.every((r) => r.x.ok && r.x.give === 2 && r.x.take === 1 && r.q.giveNeeded === 2 && r.q.takeAtNeeded === 1) && kOn.out.every((r) => lies(r).length === 0),
      '★⑤ 켬 — 낼 양 1 은 "그 양으론 한 개도 못 바꾼다 — 더 내야 한다"(참 — 2 개면 선다 · 견적 = 실행 말) · 받을 양 1 은 선다(낸 2 · 받은 1 · 견적 = 실행) · 거짓 0', g1[0] ? g1[0].x.err : '-');
  }
 }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ ' + (e && e.message)); process.exit(1); });
