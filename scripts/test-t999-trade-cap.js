#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t999-trade-cap.js — 상한의 마지막 한 개도 판다 · 상한 탐색은 상한에 닿을 때까지 넓힌다 [T999] ==========
//
// ★왜 [T999 · T988 회부 1 · 2] ① 상한 절삭이 낼 낱개를 `⌊maxGive ÷ 평균 단위⌋` 로 깎았다. `maxGive = ⌊T⌋`(T = 마을이 내줄 몫 전부를 사는 낼 단위)라
//   깎인 낱개의 단위는 늘 T 아래다 — 받는 몫이 상한에 못 닿는다(상한 1 판은 어느 양으로도 한 개를 못 받는다).
//   ② 상한 이분 탐색의 첫 상계(`⌈cap ÷ 첫 조각 비율⌉ × 4`)가 T 보다 작으면 넓히지 않아 `maxGive` 가 작게 끝났다.
//   손잡이 하나 `T999_TRADE_CAP`(켬 기본 · `=0` = 종전) — 켜면 상한에 닿은 주문은 받을 양 그대로 가장 적은 낱개로 깎고(한 개 넘침은 종전 절삭 · 거절)
//   상한 탐색은 받을 양 올림의 연속해와 같은 함수(`_giveForTake` · 받을 양 = 상한)로 넓힌다.
//
// 재는 것:
//   ① 술어 — `=== '0'` 만 끔(켬 기본) · 읽는 자리 = `server/trade.js` 하나 · 끔 탐침
//   ② 글자 — 절삭 함수의 T999 갈래 하나(한 개 넘침 검사 · 이분 탐색) · 부르는 자리 셋에 받을 낱개 함수(견적 둘 `_tkN` · 실행 `_takeN`) ·
//      상한 탐색 = `_giveForTake(…, cap, cap, hi)`(끔 = 종전 걸음 그대로) · "더 내야 한다" 의 참 `_moreWorks` 에 T999 한 줄
//   ③ 판 — `test-t835-quote-weight` 아이 판 세계 · 짐 그대로(T988 하네스 꼴 — 시드 7 · 마을 5 · 200날 · 낼 것 둘 × 받을 것 여섯 × 열량 짝 끔/켬 ·
//      낼 양 1 ~ 12 = 1,440 줄 · 받을 양 1 2 3 5 8 13 21 34 = 960 줄 · 켬 · 끔 나란히):
//      ⓐ 미끼(끔) — 상한에 닿은 낼 양 주문(한 개 넘침 아님 · 가진 것 안)이 다 상한보다 덜 받거나 거절 · 받을 양이 상한 안인데 못 닿는 줄이 있다
//      ⓑ ★켬 — 그 줄이 다 상한 전부(낼 양 축) · 받을 양(받을 양 축)을 받는다 · ⓒ ★켬 — 낸 낱개는 최소다(하나 덜 내면 그 양에 못 닿는다 — 마른 견적)
//      ⓓ ★켬 — 견적 = 실행(낼 양 축 받을 · 낼 낱개 · 받을 양 축 낼 · 받을 낱개) · ⓔ 넘는 몫은 마지막 낱개의 조각뿐(낸 단위 ≥ T · 하나 덜 낸 단위 < T)
//      ⓕ 그 밖 줄의 값은 켬 = 끔(실행 됨 · 낸 · 받은 · 견적 수 — 상계가 넓어진 짝의 상계 칸 둘 밖) · ⓖ 켬 판의 거절 · 경고 말이 그 판의 참(T988 잣대 · 거짓 0)
//   ④ 상계 — 짝마다 참 경계 T(짐 없는 견적 `capped` 의 경계 · 두 배 걸음 + 이분 40): 켬 `maxGive` = ⌊T⌋ 전부 · 끔은 모자란 짝이 있다(미끼)
//   ⑤ 판 — 같은 세계 · 상한 1 판(T988 ⑤ 꼴 — 받을 것 곳간 재고만 상한이 1 이 되게 · 짝마다 되돌림 · 낱개 하나 = T × 0.6 · 가진 것 30):
//      끔 = 어느 양으로도 안 선다(1 ~ 30 개 실제 실행) · 켬 = 낼 양 2 · 받을 양 1 이 선다(받는 1 · 견적 = 실행) · 낼 양 1 은 "… — 더 내야 한다"(참 — 2 개면 선다)
//
// 실행: node scripts/test-t999-trade-cap.js   (존 안 띄움 · 아이 판 둘(나란히) · 약 9분)
//       [T999_DUMP=<폴더>] — 아이 판 출력(켬 · 끔)을 그 폴더에 on.json · off.json 으로 남긴다(계측용 · 판정 무변)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PANEL = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
const panelSrc = (PANEL.match(/function renderTradePanel[^]*?\n  \}\n/) || [''])[0];

if (process.env.T999_SUB) {   // ── 아이 판 ──
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
  const XO = (x) => (x.ok ? { ok: 1, give: x.give, take: x.take, giveUnits: x.giveUnits } : { ok: 0, err: x.err });
  const out = [], pairs = [];
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable;
  const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
  const TAKES = ['wood', 'stone', 'food', 'salt', 'fish', 'hide'];
  //   무게 다른 짐 — `test-t835-quote-weight` 그 글자 · 기준 무게는 낼 것 아이템 정본 순서로 미리(T835 하네스가 처음 부를 때 붙는 차례와 같다 · T988 하네스 그대로)
  const W0 = {}; let k = 0;
  for (const g of GIVES) for (const it of D.items.get(g)) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2;
  const unitsOf = (it, n) => { if (W0[it] == null) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2; let u = 0; for (let i = 0; i < n; i++) u += W0[it] * (1 + 0.5 / (1 + i)); return +u.toFixed(4); };
  //   참 경계 T — 짐 없는 견적의 `capped`(조각 계획이 상한에 닿나 — 상한 탐색과 무관한 칸)가 켜지는 낼 단위 · 두 배 걸음 + 이분 40
  const trueT = (vil, vi, give, take) => {
    const capAt = (x) => { const q = Trade.quote(L, econV2, vil, vi, give, take, x, {}); return !!(q && !q.err && q.capped); };
    let lo = 0, hi = 1; for (let g = 0; g < 60 && !capAt(hi); g++) { lo = hi; hi *= 2; }
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (capAt(mid)) hi = mid; else lo = mid; }
    return lo;
  };
  for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of TAKES) {
    if (give === take || !D.toEcon.get(take)) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    const its = D.items.get(give);
    const restore = (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
    const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
    const T = (b && !b.err && b.cap > 0) ? trueT(vil, vi, give, take) : null;
    pairs.push({ vi, pair: give + '>' + take, cap: b && !b.err ? b.cap : null, maxGive: b && !b.err ? b.maxGive : null, T: T == null ? null : +T.toFixed(6) });
    for (const tk of [null, K]) {
      const tkO = tk ? { takeKcal: tk } : {};
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : (j === 1 ? 5 : 30); }); return o; };
      const HAVE = Object.values(mkInv()).reduce((a, c) => a + c, 0);
      const u1 = Number(unitsOf(its[0], 1));
      const q1 = Trade.quote(L, econV2, vil, vi, give, take, u1, tkO); const oneOver = !!(q1 && !q1.err && q1.capped);
      const hostOpts = (inv, qty, want) => { const u = u1 * qty, per = qty > 0 ? u / qty : 1; return { u, o: Object.assign({ want, perItem: per, inventory: inv, unitsOf, giveCount: qty }, tkO) }; };
      const ex = (inv, qty, want) => Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want, unitsOf, deposit: V.playerVillageDeposit }, tkO));
      //   가진 것 전부를 냈을 때의 몫(절삭 전 — 상한에 닿으면 상한 전부 · 아니면 그 견적의 받을 양) — 받을 양 축 "닿을 수 있나"
      const qAll = Trade.quote(L, econV2, vil, vi, give, take, 1, Object.assign({ inventory: mkInv(), unitsOf, giveCount: HAVE }, tkO));
      const potAll = (qAll && !qAll.err) ? (qAll.capped ? qAll.cap : qAll.take) : null;
      for (const axis of ['give', 'want']) for (const n of (axis === 'give' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 5, 8, 13, 21, 34])) {
        const snap = JSON.stringify(v.storage), inv = mkInv();
        const h = axis === 'give' ? hostOpts(inv, n, 0) : hostOpts(inv, 1, n);
        const q = Trade.quote(L, econV2, vil, vi, give, take, h.u, h.o);
        const x = axis === 'give' ? ex(inv, n, 0) : ex(inv, 0, n); restore(snap);
        //   하나 덜 낸 마른 견적(낸 낱개가 최소인가 · 넘는 몫) — 실행이 섰고 둘 이상 냈을 때
        let m1 = null;
        if (x.ok && x.give >= 2) { const q2 = Trade.quote(L, econV2, vil, vi, give, take, 1, Object.assign({ inventory: mkInv(), unitsOf, giveCount: x.give - 1 }, tkO));
          m1 = q2 && !q2.err ? { capped: !!q2.capped, take: q2.take, units: q2.giveUnitsPicked } : { err: 1 }; }
        let cf = null;   // "더 내야 한다" 의 참 — 가진 것 안에서 더 내 서는 실행(T988 잣대)
        if (axis === 'give' && !x.ok && /더 내야 합니다/.test(x.err || '')) for (let n2 = n + 1; n2 <= HAVE && cf == null; n2++) { const s2 = JSON.stringify(v.storage); const x2 = ex(mkInv(), n2, 0); restore(s2); if (x2.ok && x2.take > 0) cf = n2; }
        out.push({ axis, vi, tk: tk ? 1 : 0, pair: give + '>' + take, n, oneOver, have: HAVE, potAll, q: q.err ? { err: q.err } : q, x: XO(x), m1, cf,
          sc: q.err ? null : screen(vi, give, take, q, axis, axis === 'want' ? n : 0, axis === 'give' ? n : 1) });
      }
    }
  }
  //   ⑤ 상한 1 판 — 받을 것 곳간 재고만 상한이 1 이 되게(`1.5 ÷ STOCK_FRAC` · 짝마다 되돌림) · 낱개 하나 = T × 0.6(한 개는 마을이 다 받고 · 그 한 개로는
  //     받을 것 한 개에 못 닿고 · 둘은 상한을 넘는다) · 가진 것 30 · 낼 양 1 · 2 · 받을 양 1 · 낼 양 1 은 2 ~ 30 개 실제 실행으로 더 내 서는 것을 찾는다
  for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of TAKES) {
    if (give === take || !D.toEcon.get(take)) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    const its = D.items.get(give);
    const restore = (snap) => { const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S); };
    const snap0 = JSON.stringify(v.storage);
    v.storage[take] = 1.5 / Trade.CFG.STOCK_FRAC;
    const b = Trade.quote(L, econV2, vil, vi, give, take, 1, {});
    const T1 = (b && !b.err && b.cap === 1) ? trueT(vil, vi, give, take) : 0;
    if (!(T1 > 0)) { restore(snap0); continue; }
    const U = 0.6 * T1, unitsOfU = (it, n) => n * U, HAVE = 30;
    const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? HAVE : 0; }); return o; };
    const q1 = Trade.quote(L, econV2, vil, vi, give, take, U, {}); const oneOver = !!(q1 && !q1.err && q1.capped);
    const ex1 = (inv, qty, want) => Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want, unitsOf: unitsOfU, deposit: V.playerVillageDeposit });
    for (const [axis, n] of [['give', 1], ['give', 2], ['want', 1]]) {
      const snap = JSON.stringify(v.storage), inv = mkInv();
      const q = Trade.quote(L, econV2, vil, vi, give, take, U * (axis === 'give' ? n : 1), { want: axis === 'want' ? n : 0, perItem: U, inventory: inv, unitsOf: unitsOfU, giveCount: axis === 'give' ? n : 1 });
      const x = axis === 'give' ? ex1(inv, n, 0) : ex1(inv, 0, n); restore(snap);
      let cf = null;
      if (axis === 'give' && n === 1) for (let n2 = 2; n2 <= HAVE && cf == null; n2++) { const s2 = JSON.stringify(v.storage); const x2 = ex1(mkInv(), n2, 0); restore(s2); if (x2.ok && x2.take > 0) cf = n2; }
      out.push({ cap1: 1, axis, vi, tk: 0, pair: give + '>' + take, n, oneOver, have: HAVE, potAll: 1, T: +T1.toFixed(6), maxGive: b.maxGive, q: q.err ? { err: q.err } : q, x: XO(x), m1: null, cf,
        sc: q.err ? null : screen(vi, give, take, q, axis, axis === 'want' ? n : 0, axis === 'give' ? n : 1) });
    }
    restore(snap0);
  }
  console.log = _l;
  process.stdout.write(JSON.stringify({ on: Trade.T999_ON, words: Trade.T988_ON, out, pairs }) + '\n', () => process.exit(0));   // 큰 출력 — 파이프에 다 흘려보낸 뒤 끝낸다
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T);

console.log('\n=== 상한의 마지막 한 개도 판다 · 상한 탐색은 상한에 닿을 때까지 (T999) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = T.match(/const T999_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T999_TRADE_CAP === '0'\);/g) || [];
  ok(decl.length === 1, "① 선언 하나 · `=== '0'` 만 끔(켬 기본)", `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T999_TRADE_CAP')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나', readers.join(','));
  const probe = (val) => { const e = Object.assign({}, process.env); delete e.T999_TRADE_CAP; if (val != null) e.T999_TRADE_CAP = val;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T999_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('0')} · ${probe('1')}`); }

console.log('\n② 글자 — 절삭 갈래 하나 · 받을 낱개 함수 · 상한 탐색 · "더 내야 한다"');
{ const trim = (C.match(/function _trimToCap\([^]*?\n\}\n/) || [''])[0];
  ok(/function _trimToCap\(econV2, v, giveRes, takeRes, n0, unitsAt, capped, maxGive, perItem, cap, takeN\) \{/.test(trim) && (trim.match(/T999_ON/g) || []).length === 1
    && /if \(T999_ON && capped && n0 >= 1 && typeof takeN === 'function'\) \{/.test(trim) && /planSliced\(econV2, v, giveRes, takeRes, u1, cap\)\.gave >= u1 - 1e-9/.test(trim)
    && /while \(hi - lo > 1\) \{ const mid = Math\.floor\(\(lo \+ hi\) \/ 2\); if \(tk\(mid\) >= top\) hi = mid; else lo = mid; \}/.test(trim)
    && /const n = \(capped && perItem > 0\) \? Math\.min\(n0, Math\.floor\(maxGive \/ perItem\)\) : n0;/.test(trim),
    '② 절삭 함수의 T999 갈래 하나 — 상한에 닿고 한 개 넘침이 아니면 받을 양 그대로 가장 적은 낱개(이분 탐색) · 그 밖 = 종전 절삭 글자 그대로');
  const calls = (C.match(/(?<!function )_trimToCap\(/g) || []).length;
  ok(calls === 3 && /_gN \? _gAt : \(\(c\) => c \* per\), true, maxGive, per, cap, _tkN\);/.test(C) && /_trimToCap\(econV2, v, giveRes, takeRes, n, _uAt, true, maxGive, un \/ n, cap, _tkN\);/.test(C)
    && /_trimToCap\(econV2, v, giveRes, takeRes, q0, \(c\) => _units\(_pick\(c\)\), qt\.capped, qt\.maxGive, perItem, capU, _takeN\);/.test(C)
    && /const _tkN = \(t\) => \(conv \? conv\.items\(t\)\.items : Math\.floor\(t\)\);/.test(C),
    '② 부르는 자리 셋(견적 낼 양 · 견적 받을 양 · 실행) 다 받을 낱개 함수를 넘긴다(견적 `_tkN` = 견적 `take` 식 · 실행 `_takeN`)', `${calls}`);
  ok(/if \(T999_ON\) hi = _giveForTake\(econV2, v, giveRes, takeRes, cap, cap, hi\);\s*else for \(let i = 0; i < 24; i\+\+\) \{\s*const mid = \(lo \+ hi\) \/ 2;\s*const pl = planSliced\(econV2, v, giveRes, takeRes, mid, cap\);\s*if \(pl\.took >= cap - 1e-9\) hi = mid; else lo = mid;\s*\}/.test(C),
    '② 상한 탐색 = `_giveForTake`(받을 양 = 상한 · 못 닿으면 넓힌다) · 끔 갈래 = 종전 이분 걸음 그대로');
  ok(/if \(!\(maxN > n0\)\) return false;\s*if \(T999_ON && !free\(maxN\)\) return true;\s*if \(!free\(n0 \+ 1\)\) return false;/.test(C),
    '② "더 내야 한다" 의 참(`_moreWorks`) — 켬이면 가진 것 안에 상한에 닿는 낱개가 있으면 참(절삭이 상한까지 판다 · 끔 = T988 글자)'); }

const sub = (mode, val) => new Promise((res, rej) => {
  const e = Object.assign({}, process.env, { T999_SUB: mode, T999_TRADE_CAP: val });
  const p = spawn(process.execPath, [__filename], { env: e, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '';
  p.stdout.setEncoding('utf8');   // 조각 경계에 걸린 한글 바이트를 잇는다
  p.stdout.on('data', (b) => { o += b; }); p.stderr.on('data', () => {});
  p.on('exit', (c) => { try { res(JSON.parse(o.trim().split('\n').pop())); } catch (err) { rej(new Error(`아이 판 ${mode}/${val} 종료 ${c}`)); } });
});
//   말 참 가르기(T988 하네스 잣대 그대로 — 줄의 말이 그 판과 맞나 · 빈 목록 = 참)
const N_ = '\\d+(?:\\.\\d+)?';
const E1 = new RegExp(`^마을이 .+ ${N_}개를 내줄 수 없습니다\\. 지금 내줄 수 있는 것은 ${N_}개까지입니다\\.$`), E5 = new RegExp(`^.+ 한 개 값이 마을이 내줄 수 있는 .+ 전부\\(${N_}\\)보다 비쌉니다\\. 이 마을은 지금 그 값을 치를 수 없습니다\\.$`);
const E6 = /^그 양으로는 한 개도 바꿀 수 없습니다\. 더 내야 합니다\.$/, E6a = /^그 양으로는 한 개도 바꿀 수 없습니다\.$/, E4 = /^마을에 .+이\(가\) 남아 있지 않습니다\.$/;
const E3 = new RegExp(`^.+ ${N_}개를 받으려면 .+ ${N_}개가 있어야 하는데 그만큼 없습니다\\.$`), E3g = /^그만큼 갖고 있지 않습니다\.$/;
const CAPW = new RegExp(`^마을이 지금 내줄 수 있는 .+은\\(는\\) ${N_}개까지입니다$`), S5 = new RegExp(`^마을이 내줄 수 있는 것은 ${N_}개까지라 (${N_})개만 받습니다\\.$`);
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
      if (E6.test(w) && r.cf == null && !/더 내야 합니다/.test(e)) L.push('화면 "더 내야 한다" 인데 실행은 다른 말');
      const m = S5.exec(w); if (m && +m[1] > 0) L.push('화면 "n개만 받는다(n > 0)" 인데 실행은 거절');
    }
    if (r.axis === 'want' && !warn.length && !deal.some((d) => /내야 할/.test(d))) L.push('화면 빈 견적(까닭 0)');
    if (r.sc.go) L.push('화면 단추가 켜졌는데 실행은 거절');
  } else if (r.axis === 'give') {
    if (r.q.take !== r.x.take) L.push('화면 받을 양 ≠ 실행');
    for (const w of warn) { const m = /까지라 (\d+)개만 받습니다\.$/.exec(w); if (m && +m[1] !== r.x.give) L.push('화면 "n개만 받는다" ≠ 실행 낸 낱개'); }
  } else {
    const want = /^.+ (\d+) 받으려면 — 내야 할 .+ (\d+) \(낱개라 올림 · 그러면 .+ (\d+)\)$/.exec(deal[0] || '');
    const shortL = !want && /^.+ (\d+(?:\.\d+)?) .+ (\d+)$/.exec(deal[0] || '');
    if (want) { if (+want[2] !== r.x.give || +want[3] !== r.x.take) L.push('화면 낼 · 받을 ≠ 실행'); if (r.x.take < r.n) L.push('화면 "받으려면 — 내야 할" 인데 받을 양에 못 닿는다'); }
    else if (shortL) { if (+shortL[1] !== r.x.give || +shortL[2] !== r.x.take) L.push('화면(낼 양 축 줄) ≠ 실행'); if (!(r.x.take < r.n)) L.push('낼 양 축 줄인데 받을 양에 닿는다'); }
    else L.push('화면 거래 줄 없음');
  }
  return L;
}
const inv = (r) => !r.x.ok && (E3.test(r.x.err || '') || E3g.test(r.x.err || ''));   // 가진 것 모자람(견적은 모른다 — 실행이 먼저 거절)
(async () => {
  console.log('\n③ 판 — T835 아이 판 세계 · 짐 그대로 · 두 축 2,400 줄(켬 · 끔 나란히) · 줄마다 견적 · 실행 · 하나 덜 낸 마른 견적 · 화면');
  const [ON, OFF] = await Promise.all([sub('grid', '1'), sub('grid', '0')]);
  if (process.env.T999_DUMP) { fs.mkdirSync(process.env.T999_DUMP, { recursive: true });   // 계측용 — 아이 판 출력 그대로(판정에 안 쓴다)
    fs.writeFileSync(path.join(process.env.T999_DUMP, 'on.json'), JSON.stringify(ON) + '\n'); fs.writeFileSync(path.join(process.env.T999_DUMP, 'off.json'), JSON.stringify(OFF) + '\n'); }
  const on = ON.out.filter((r) => !r.cap1), off = OFF.out.filter((r) => !r.cap1), kOn = ON.out.filter((r) => r.cap1), kOff = OFF.out.filter((r) => r.cap1);
  ok(ON.on === true && OFF.on === false && ON.words === true && on.length === off.length && on.length === 2400 && on.every((r, i) => r.pair === off[i].pair && r.n === off[i].n && r.axis === off[i].axis && r.tk === off[i].tk && r.vi === off[i].vi),
    '③ 전제 — 손잡이가 실제로 읽힌다(T988 말은 켬) · 두 판 줄이 짝을 이룬다(1,440 + 960)', `${on.length} 줄`);
  //   과녁 줄 — 낼 양: 견적이 상한에 닿았고(`capped` — 조각 계획 칸 · 손잡이와 무관) 한 개 넘침이 아니고 가진 것 안 · 받을 양: 받을 양 ≤ 상한 · 한 개 넘침 아님 · 가진 것 전부면 닿는다
  const tgtG = (r) => r.axis === 'give' && !r.q.err && r.q.capped && !r.oneOver && r.n <= r.have;
  const tgtW = (r) => r.axis === 'want' && !r.q.err && r.n <= r.q.cap && !r.oneOver && r.potAll != null && r.potAll >= r.n;
  const G = on.map((r, i) => i).filter((i) => tgtG(off[i])), W = on.map((r, i) => i).filter((i) => tgtW(off[i]));
  const shortG = (r) => !r.x.ok || r.x.take < r.q.cap, shortW = (r) => !inv(r) && (!r.x.ok || r.x.take < r.n);
  const gOff = G.filter((i) => shortG(off[i])), wOff = W.filter((i) => shortW(off[i]));
  ok(G.length >= 100 && gOff.length === G.length && wOff.length >= 1,
    'ⓐ 미끼(끔) — 상한에 닿은 낼 양 주문(한 개 넘침 아님 · 가진 것 안)이 다 상한보다 덜 받거나 거절 · 받을 양이 상한 안인데 못 닿는 줄이 있다',
    `낼 양 ${gOff.length}/${G.length}(거절 ${gOff.filter((i) => !off[i].x.ok).length}) · 받을 양 ${wOff.length}/${W.length}`);
  const gOn = G.filter((i) => shortG(on[i])), wOn = W.filter((i) => shortW(on[i]));
  ok(gOn.length === 0 && wOn.length === 0, '★★ⓑ 켬 — 그 줄이 다 상한 전부(낼 양) · 받을 양(받을 양)을 받는다',
    gOn.length + wOn.length ? `낼 양 ${gOn.length} · 받을 양 ${wOn.length} · 예 ${JSON.stringify(on[gOn[0] != null ? gOn[0] : wOn[0]])}`.slice(0, 600) : `낼 양 ${G.length} · 받을 양 ${W.length}`);
  //   최소 — 실행이 둘 이상 냈으면 하나 덜 낸 마른 견적은 그 양에 못 닿는다(상한에 닿으면 상한 전부라 닿는다 — 그러면 최소가 아니다)
  //   (낼 양 축은 상한 절삭 줄만 — 상한 아래 낼 양은 사람이 정한 낱개다 · 받을 양 축은 선 줄 다 — 올림 걸음이 최소다 · 캐논 ②)
  const got = (r) => (r.axis === 'give' ? r.x.take : r.n);
  const minRows = on.filter((r) => r.x.ok && r.x.give >= 2 && r.m1 && !r.m1.err && (tgtG(r) || r.axis === 'want'));
  const minBad = minRows.filter((r) => !(!r.m1.capped && r.m1.take < got(r)));
  ok(minBad.length === 0 && minRows.filter((r) => tgtG(r)).length >= 50, '★ⓒ 켬 — 낸 낱개는 최소다(하나 덜 내면 그 양에 못 닿는다 · 낼 양 상한 절삭 줄 · 받을 양 선 줄)',
    `${minRows.length} 줄(낼 양 상한 ${minRows.filter((r) => tgtG(r)).length}) · 어긋남 ${minBad.length}${minBad.length ? ' · 예 ' + JSON.stringify([minBad[0].axis, minBad[0].vi, minBad[0].pair, minBad[0].n, minBad[0].x, minBad[0].m1]) : ''}`);
  //   견적 = 실행 — 낼 양: 받을 양 · 낼 낱개(절삭이면 `giveUsed`) · 받을 양: 낼 · 받을 낱개 · 실행이 거절하면 견적도 거래 0(가진 것 모자람은 견적이 모른다)
  const qx = (r) => { const q = r.q; if (q.err || inv(r)) return true;
    if (r.axis === 'give') return r.x.ok ? (q.take === r.x.take && (q.giveUsed != null ? q.giveUsed === r.x.give : r.x.give === r.n)) : (!(q.take > 0) || q.giveUsed === 0);
    return r.x.ok ? (q.giveNeeded === r.x.give && q.takeAtNeeded === r.x.take) : !(q.giveNeeded > 0); };
  const qxBad = on.filter((r) => !qx(r));
  ok(qxBad.length === 0, '★ⓓ 켬 — 견적 = 실행(2,400 줄)', qxBad.length ? `${qxBad.length} · 예 ${JSON.stringify(qxBad[0]).slice(0, 500)}` : '2,400 줄');
  //   넘는 몫 — 열량 짝 끔 낼 양 과녁 줄: 낸 단위 ≥ T(상한 전부를 산다) · 하나 덜 낸 단위 < T(넘는 몫은 마지막 낱개의 조각)
  const TT = new Map(ON.pairs.map((p) => [p.vi + '|' + p.pair, p.T]));
  const ov = G.filter((i) => on[i].tk === 0 && on[i].x.ok && on[i].x.give >= 2).map((i) => { const r = on[i], Tp = TT.get(r.vi + '|' + r.pair);
    return { r, Tp, ex: r.x.giveUnits - Tp, last: r.m1 && r.m1.units != null ? r.x.giveUnits - r.m1.units : null }; });
  const ovBad = ov.filter((z) => !(z.ex >= -2e-3 && z.r.m1 && z.r.m1.units < z.Tp + 2e-3));
  const frac = ov.filter((z) => z.last > 0).map((z) => z.ex / z.last);
  ok(ov.length >= 20 && ovBad.length === 0, 'ⓔ 켬 — 넘는 몫은 마지막 낱개의 조각뿐(낸 단위 ≥ T · 하나 덜 낸 단위 < T · 열량 짝 끔 낼 양 과녁 줄)',
    `${ov.length} 줄 · 어긋남 ${ovBad.length} · 넘는 몫 ÷ 마지막 낱개 최대 ${frac.length ? Math.max(...frac).toFixed(3) : '-'}`);
  //   그 밖 무변 — 과녁 밖 줄의 실행 값(됨 · 낸 · 받은)은 켬 = 끔 · 상한 절삭을 안 지난 견적(양쪽 다 `capped` · `wantTrimmed` 0)은 수도 같다
  //     (말 칸 · 상계가 넓어진 짝의 상계 칸 둘 — `maxGive` · 받을 양 연속해 — 밖)
  const wide = new Set(ON.pairs.filter((p, i) => p.maxGive !== OFF.pairs[i].maxGive).map((p) => p.vi + '|' + p.pair));
  const strip = (r) => { const o = Object.assign({}, r.q); delete o.why; delete o.wantShort; if (wide.has(r.vi + '|' + r.pair)) { delete o.maxGive; delete o.giveNeededUnits; } return JSON.stringify(o); };
  const vx = (r) => JSON.stringify([r.x.ok, r.x.give, r.x.take]);
  const rest = on.map((r, i) => i).filter((i) => !tgtG(off[i]) && !tgtW(off[i]));
  const plain = (i) => !on[i].q.err && !off[i].q.capped && !off[i].q.wantTrimmed && !on[i].q.wantTrimmed;
  const restX = rest.filter((i) => vx(on[i]) !== vx(off[i])), restQ = rest.filter((i) => plain(i) && strip(on[i]) !== strip(off[i]));
  ok(restX.length === 0 && restQ.length === 0, 'ⓕ 그 밖 줄의 값은 켬 = 끔(실행 됨 · 낸 · 받은 — 과녁 밖 줄 다 · 견적 수 — 상한 절삭을 안 지난 줄 · 말 칸 · 상계 칸 둘 밖)',
    restX.length + restQ.length ? `실행 ${restX.length} · 견적 ${restQ.length} · 예 ${JSON.stringify([on[(restX[0] != null ? restX : restQ)[0]].axis, on[(restX[0] != null ? restX : restQ)[0]].pair, on[(restX[0] != null ? restX : restQ)[0]].n])}` : `실행 ${rest.length} 줄 · 견적 ${rest.filter(plain).length} 줄 · 상계 넓어진 짝 ${wide.size}`);
  const lOn = on.filter((r) => lies(r).length);
  ok(lOn.length === 0, '★ⓖ 켬 판의 거절 · 경고 말이 그 판의 참(T988 잣대 · 2,400 줄)', lOn.length ? `${lOn.length} · 예 ${JSON.stringify({ r: [lOn[0].axis, lOn[0].vi, lOn[0].pair, lOn[0].n], l: lies(lOn[0]), x: lOn[0].x })}` : '거짓 0');

  console.log('\n④ 상계 — 짝마다 참 경계 T(짐 없는 견적 capped 경계 · 두 배 걸음 + 이분 40) · ⌊T⌋ 와 견적 maxGive');
  const P = ON.pairs.map((p, i) => ({ p, o: OFF.pairs[i] })).filter((z) => z.p.T != null);
  const pOn = P.filter((z) => z.p.maxGive !== Math.floor(z.p.T)), pOff = P.filter((z) => z.o.maxGive < Math.floor(z.p.T));
  ok(P.length >= 40 && P.every((z) => z.p.T === z.o.T), '④ 전제 — 짝 넉넉 · 참 경계는 손잡이와 무관(두 판 T 같다)', `${P.length} 짝`);
  ok(pOff.length >= 1, '④ 미끼(끔) — 첫 상계가 못 닿아 maxGive 가 ⌊T⌋ 보다 작은 짝이 있다', pOff.map((z) => `마을${z.p.vi} ${z.p.pair} ${z.o.maxGive} < ${Math.floor(z.p.T)}`).join(' · '));
  ok(pOn.length === 0, '★④ 켬 — 짝마다 maxGive = ⌊T⌋', pOn.length ? JSON.stringify(pOn.slice(0, 3)) : `${P.length} 짝`);

  console.log('\n⑤ 판 — 같은 세계 · 상한 1 판(받을 것 곳간 재고만 상한 1 · 짝마다 되돌림) · 낱개 하나 = T × 0.6 · 가진 것 30 · 낼 양 1 · 2 · 받을 양 1');
  const kz = (A, ax, n) => A.filter((r) => r.axis === ax && r.n === n);
  ok(kOn.length >= 12 && kOn.length === kOff.length && kOn.every((r) => !r.q.err && r.q.cap === 1 && !r.oneOver), '⑤ 전제 — 그 판이 선다 · 상한 1 · 한 개 넘침 아님', `${kOn.length / 3} 짝`);
  ok(kOff.every((r) => !r.x.ok) && kz(kOff, 'give', 1).every((r) => r.cf == null), '⑤ 미끼(끔) — 세 줄 다 거절 · 낼 양 1 에서 2 ~ 30 개 실제 실행이 서는 것 0(어느 양으로도 안 선다)');
  const g1 = kz(kOn, 'give', 1), g2 = kz(kOn, 'give', 2), w1 = kz(kOn, 'want', 1);
  ok(g2.every((r) => r.x.ok && r.x.give === 2 && r.x.take === 1 && r.q.take === 1 && r.q.giveUsed === 2) && w1.every((r) => r.x.ok && r.x.give === 2 && r.x.take === 1 && r.q.giveNeeded === 2 && r.q.takeAtNeeded === 1),
    '★⑤ 켬 — 낼 양 2 · 받을 양 1 이 선다(받는 1 · 낸 2 · 견적 = 실행)');
  ok(g1.every((r) => !r.x.ok && E6.test(r.x.err || '') && r.q.why === r.x.err && r.cf === 2) && kOn.every((r) => lies(r).length === 0),
    '★⑤ 켬 — 낼 양 1 은 "그 양으론 한 개도 못 바꾼다 — 더 내야 한다"(참 — 2 개면 선다 · 견적 = 실행 말 · 거짓 0)', g1[0] ? g1[0].x.err : '-');
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ ' + (e && e.message)); process.exit(1); });
