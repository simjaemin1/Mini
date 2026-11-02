#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t965-want-start.js — 받을 양 주문의 올림 걸음은 최소 낱개 아래에서 출발한다 [T965] ==========
//
// ★왜 [T965 · land1028 게이트 `test-t835-quote-weight` ⓓ 빨강] 올림 걸음(`_climbToWant`)은 위로만 걷는다 — 출발점이 최소 낱개 **아래**여야 최소가 나온다.
//   견적의 켬 갈래(T835 — 고른 그 개체들의 단위)는 출발점을 `⌊연속해 ÷ 첫 개체 단위⌋` 로 잡았다. 정본 순서로 고르면 뒤 아이템이 첫 개체보다 무거울 수 있고
//   그때 출발점이 최소 위라 받을 양보다 많이 낸다(실행은 견적 낱개에서 위로만 걸어 같이 넘친다).
//   손잡이 하나 `T965_WANT_START`(켬 기본 · `=0` = 종전) — 켜면 두 자리(견적의 켬 갈래 · 실행의 받을 양 주문)가 출발점을
//   **단위가 연속해를 안 넘는 마지막 낱개**(`_countAtOrBelow` — 고른 그 개체들의 단위에 정수 이분 탐색)로 잡는다.
//
// 재는 것:
//   ① 술어 — `=== '0'` 만 끔(켬 기본) · 읽는 자리 = `server/trade.js` 하나 · 끔 탐침
//   ② 글자 — 출발점 함수 하나 · 견적의 켬 갈래 · 실행의 받을 양 주문이 그 함수 · 끔 갈래는 종전 식 · 올림 걸음 한 자리 그대로 · 단위 이음은 `_giver` 하나
//   ③ 판 — 첫 개체가 가볍고 뒤가 무거운 짐(낱개 단위 = 그 판의 연속해 ÷ 8 · 뒤 ÷ 2 — 픽스처 수 · 세계 값과 무관하게 여러 낱개가 든다) · 마을 다섯(시드 7 · 0날) ·
//      받을 것 여섯 · 받을 양 1 ~ 13:
//      ⓐ 미끼(끔) — 넘침(실행이 낸 낱개보다 하나 적게 내도 받을 양에 닿는다)이 있다(자명 통과 금지)
//      ⓑ ★켬 — 실행이 낸 낱개는 최소다 · 견적의 낼 낱개 · 받을 양 = 실행
//      ⓒ ★켬 — 가진 것으로 못 닿으면 실행은 "그만큼 없다" · 그 말의 낱개 = 견적의 낼 낱개
//      ⓓ 무게가 고른 짐(모두 1 단위)은 켬 · 끔 판이 한 줄도 안 다르다(출발점이 종전과 같은 수)
//
// 실행: node scripts/test-t965-want-start.js   (존 안 띄움 · 아이 판 넷)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T965_SUB) {   // ── 아이 판: 0날 세계 · 판마다 곳간 · 인벤을 되돌린다 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable;
  const give = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r)[0];
  const its = D.items.get(give);
  const EVEN = process.env.T965_SUB === 'even';
  //   짐 — 낱개 단위를 그 판의 연속해(받을 양에 닿는 낼 단위 · 손잡이와 무관한 견적 칸 `giveNeededUnits`)에 맞춘다(세계 값과 무관하게 여러 낱개가 든다):
  //     첫 아이템 낱개 = 연속해 ÷ 8 · 나머지 = 연속해 ÷ 2(정본 순서로 고르면 첫 개체 뒤가 무겁다) · 고른 판(`even`)은 모두 연속해 ÷ 4
  const mkInv = (big) => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : (big ? 30 : 0); }); return o; };
  const rows = [], short = [];
  const restore = (v, snap) => { const S = JSON.parse(snap); for (const k of Object.keys(v.storage)) if (!(k in S)) delete v.storage[k]; Object.assign(v.storage, S); };
  for (let vi = 0; vi < 5; vi++) for (const take of ['wood', 'stone', 'food', 'fish', 'salt', 'hide']) {
    if (take === give || !D.toEcon.get(take)) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    for (const want of [1, 2, 3, 5, 8, 13]) {
      const g0 = Trade.quote(L, econV2, vil, vi, give, take, 1, { want, perItem: 1 });
      if (!(g0 && !g0.err && g0.giveNeededUnits > 0)) { rows.push([vi, take, want, null, null, 0, null, null, null]); continue; }
      const gu = g0.giveNeededUnits, unitsOf = (it, n) => n * (EVEN ? gu / 4 : (it === its[0] ? gu / 8 : gu / 2));
      const host = (inv, cnt, w) => ({ u: Number(unitsOf(its[0], 1)) * cnt, o: { want: w, perItem: Number(unitsOf(its[0], 1)), inventory: inv, unitsOf, giveCount: cnt } });   // 호스트 `villageTradeQuote` 꼴
      const snap = JSON.stringify(v.storage), inv = mkInv(true);
      const h = host(inv, 1, want), q = Trade.quote(L, econV2, vil, vi, give, take, h.u, h.o);
      const x = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: 0, want, unitsOf, deposit: V.playerVillageDeposit });
      restore(v, snap);
      //   최소인가 — 실행이 낸 낱개보다 하나 적게 내는 마른 견적(같은 고르기)이 받을 양에 닿으면 넘침
      let minOk = null;
      if (x.ok && x.give > 1 && x.take >= want) {
        const inv2 = mkInv(true), h2 = host(inv2, x.give - 1, 0), q2 = Trade.quote(L, econV2, vil, vi, give, take, h2.u, h2.o);
        minOk = (q2 && !q2.err && q2.take >= want) ? 0 : 1;
        restore(v, snap);
      }
      rows.push([vi, take, want, q.err ? null : (q.giveNeeded == null ? null : q.giveNeeded), q.err ? null : (q.takeAtNeeded == null ? null : q.takeAtNeeded), x.ok ? 1 : 0, x.ok ? x.give : null, x.ok ? x.take : null, minOk]);
      //   가진 것으로 못 닿는 판 — 첫 아이템 둘만(가벼운 것 · 연속해의 1/4) 든 짐
      if (!EVEN) {
        const sinv = mkInv(false), sh = host(sinv, 1, want), sq = Trade.quote(L, econV2, vil, vi, give, take, sh.u, sh.o);
        const sx = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: sinv, giveRes: give, takeRes: take, giveQty: 0, want, unitsOf, deposit: V.playerVillageDeposit });
        restore(v, snap);
        const m = /([0-9]+)개가 있어야 하는데 그만큼 없습니다/.exec(sx.err || '');
        short.push([vi, take, want, sq.err ? null : (sq.giveNeeded == null ? null : sq.giveNeeded), sx.ok ? 1 : 0, m ? +m[1] : null]);
      }
    }
  }
  console.log = _l; console.log(JSON.stringify({ on: Trade.T965_ON, give, its: its.length, rows, short }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T);

console.log('\n=== 받을 양 주문의 올림 걸음은 최소 낱개 아래에서 출발한다 (T965) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = T.match(/const T965_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T965_WANT_START === '0'\);/g) || [];
  ok(decl.length === 1, "① 선언 하나 · `=== '0'` 만 끔(켬 기본)", `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T965_WANT_START')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T965_WANT_START; if (v != null) e.T965_WANT_START = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T965_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('0')} · ${probe('1')}`); }

console.log('\n② 글자 — 출발점 함수 하나 · 두 자리 · 끔 갈래 · 올림 한 자리');
{ ok((C.match(/function _countAtOrBelow\(/g) || []).length === 1, '② 출발점 함수 `_countAtOrBelow` 하나(사본 0)');
  ok(/const n = _climbToWant\(\(T965_ON && _G\) \? _countAtOrBelow\(gu, _uAt, Infinity\) : Math\.floor\(gu \/ perItem\), want, _uAt, _takeAt, Infinity\);/.test(C),
    '② 견적 — 켬 갈래(T835 · 고른 그 개체들)만 그 함수 · 끔 = 종전 `⌊연속해 ÷ 첫 개체 단위⌋`');
  ok(/q0 = T965_ON \? _climbToWant\(_countAtOrBelow\(qw\.giveNeededUnits, G\.at, Infinity\), wantTake, G\.at, _tw, Infinity\)\s*: _climbToWant\(qw\.giveNeeded, wantTake, \(c\) => _units\(_pick\(c\)\), _tw, have\);/.test(C),
    '② 실행 — 켬 = 연속해 아래 마지막 낱개에서 · 고른 그 개체들(`G.at`)로 · 끔 = 종전(견적 낱개에서 · 가진 것까지)');
  ok(/const at = \(c\) => \(c <= have \? units\(pick\(c\)\) : units\(pick\(have\)\) \+ \(c - have\) \* \(\(have >= 1 \? units\(pick\(1\)\) : 0\) \|\| 1\)\);/.test(C) && /const _gAt = _G \? _G\.at : null;/.test(C),
    '② 단위 이음(가진 것 너머 = 첫 개체 단위)은 `_giver` 의 `at` 하나 — 견적 `_gAt` 이 그 함수(값 무변)');
  ok(T.split('takeAt(unitsAt(n)) < want').length - 1 === 1, '② 올림 걸음은 그대로 한 자리(`test-trade` ⑨ⓓ 돌연변이 자리)'); }

const sub = (mode, env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T965_SUB: mode }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());
console.log('\n③ 판 — 첫 개체가 가볍고 뒤가 무거운 짐(0날 세계 · 낱개 단위 = 연속해 ÷ 8 · 뒤 ÷ 2)');
{ const on = sub('1', { T965_WANT_START: '1' }), off = sub('1', { T965_WANT_START: '0' });
  //   행 = [마을 · 받을 것 · 받을 양 · 견적 낼 낱개 · 견적 받을 양 · 실행 됨 · 실행 낸 · 실행 받은 · 최소]
  ok(on.on === true && off.on === false && on.its > 1, '③ 전제 — 손잡이가 실제로 읽힌다 · 낼 것은 아이템이 여럿인 재화', `${on.give} · 아이템 ${on.its}`);
  const done = on.rows.filter((r) => r[5] && r[7] >= r[2]);
  ok(done.length >= 20, '③ 전제 — 받을 양에 닿은 실행이 넉넉하다(자명 통과 금지)', `${done.length}/${on.rows.length}`);
  const over = (R) => R.filter((r) => r[8] === 0);
  ok(over(off.rows).length > 0, 'ⓐ 미끼(끔) — 넘침이 있다(하나 적게 내도 닿는다)', `${over(off.rows).length} · 예 ${JSON.stringify(over(off.rows)[0])}`);
  ok(over(on.rows).length === 0 && on.rows.some((r) => r[8] === 1), '★★ⓑ 켬 — 실행이 낸 낱개는 최소다', `넘침 ${over(on.rows).length}`);
  const lie = on.rows.filter((r) => r[5] ? (r[3] !== r[6] || r[4] !== r[7]) : (r[3] != null && r[3] > 0));
  ok(lie.length === 0, '★★ⓑ 켬 — 견적의 낼 낱개 · 받을 양 = 실행(못 하면 견적도 못 한다)', `${lie.length}/${on.rows.length}${lie.length ? ' · 예 ' + JSON.stringify(lie[0]) : ''}`);
  const sh = on.short.filter((r) => r[3] != null && r[3] > 2);   // 가벼운 둘로는 못 닿는 판
  ok(sh.length > 0 && sh.every((r) => r[4] === 0 && r[5] === r[3]), '★ⓒ 켬 — 가진 것으로 못 닿으면 "그만큼 없다" · 그 낱개 = 견적의 낼 낱개',
    `${sh.length} 판${sh.length ? ' · 예 ' + JSON.stringify(sh[0]) : ''}`);
  const eOn = sub('even', { T965_WANT_START: '1' }), eOff = sub('even', { T965_WANT_START: '0' });
  ok(eOn.rows.length > 0 && JSON.stringify(eOn.rows) === JSON.stringify(eOff.rows), 'ⓓ 무게가 고른 짐 — 켬 · 끔 판이 한 줄도 안 다르다(출발점이 종전과 같은 수)', `${eOn.rows.length} 줄`); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
