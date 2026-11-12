#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t835-quote-weight.js — 무거운 물건 견적도 고른 그 개체들의 무게로 [T835] ==========
//
// ★왜 [T807 정보] 견적은 낼 물건의 단위를 한 개짜리 어림(첫 아이템 1개 단위 × 개수 — 호스트 `villageTradeQuote`)으로 잡고,
//   실행은 고른 그 개체들(`_pick` · `_units`)로 잰다 — 무게가 다른 짐이면 견적 ≠ 실행.
//   손잡이 하나 `T835_QUOTE_WEIGHT`(★T847 켬 기본 · `=0` = 종전 견적) — 켜면 견적이 실행과 같은 고르기 · 단위 셈(`_giver`)을 지난다.
//
// 재는 것:
//   ① 술어 — ★[T847] `=== '0'` 만 끔(켬 기본) · 읽는 자리 = `server/trade.js` 하나 · 끔 탐침
//   ② 글자 — 실행의 고르기 · 단위 셈이 `_giver` 하나(사본 0) · 견적의 켬 갈래가 그 함수 · 호스트가 인벤을 넘긴다(전달만)
//   ③ 같은 곳간 · 같은 순간 — 마을 다섯 · 낼 것(무게 다른 아이템 여럿) 둘 × 받을 것 여섯 · 낼 양 1~12 · 열량 짝 끔/켬 · 무게 다른 짐(아이템마다 · 낱개마다):
//      ⓐ 미끼(끔) — 견적 ≠ 실행이 있다(자명 통과 금지)
//      ⓑ ★켬 — 낼 양 주문: 견적 받을 양 = 실행이 준 양 · giveUsed = 실행이 낸 낱개 · 실행이 못 하면 견적 0
//      ⓒ ★켬 — 실행(됨 · 낸 · 받은 · 곳간 나감)은 끔과 한 자리도 안 다르다(낼 양 주문)
//      ⓓ ★켬 — 받을 양 주문(`want`): 견적의 낼 낱개 · 받을 양 = 실행(상한에 닿아 실행이 깎으면 견적도 깎는다 · 못 하면 견적도 못 한다) · 실행은 받을 양에 닿는 최소 낱개
//
// 실행: node scripts/test-t835-quote-weight.js   (존 안 띄움 · 약 3분)
'use strict';
// ★[T1127 2026-11-04] 이 하네스가 재는 것은 굶주림 길(식량 빚 · 보호막) 밖이다 — 판 세계를 T1127 앞(`T1074_FOOD_DEBT=0 T858_NO_SHIELD=0` = 종전 바이트)으로 묶는다.
//   T1127 이 두 손잡이를 켬 기본으로 바꾼 뒤 이 하네스의 작은 판 세계(인구 · 곳간 · 교역)가 갈려 단언이 빨개졌다(main 에선 초록 · 보고 T1127 §4). 켬 기본 세계에서 같은 단언을 다시 세우는 일은 회부. 부르는 쪽이 값을 주면 그 값이 먼저다.
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
if (process.env.T1074_FOOD_DEBT == null) process.env.T1074_FOOD_DEBT = '0';
if (process.env.T858_NO_SHIELD == null) process.env.T858_NO_SHIELD = '0';
// ★[T965 2026-10-28] 열다섯째 판(`T931_SLOTK_EMA` 켬 기본) 세계 그대로 돈다 — PM 10-27(land1028)의 `=0` 묶음을 지웠다(단언 · 픽스처 무변).
//   그 세계에서 ⓓ 가 갈린 것(켬 넘침 79 · 견적 ≠ 실행 2/960 · 켬 ≠ 끔 실행 81)은 결함이었다 — 받을 양 주문의 올림 걸음이 최소 낱개 **위**에서 출발해
//   내려오지 못했다(정본 순서로 고르면 뒤 아이템이 첫 개체보다 무겁다 · `server/trade.js` `T965_WANT_START` · 보고 T965). 고친 뒤 두 세계 16/16.
const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T835_SUB === '1') {   // ── 아이 판: 세계 하나 · 판마다 곳간 · 인벤을 되돌린다 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js')), K = require(SV('kcal.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable, rows = [], wrows = [];
  //   무게 다른 짐 — 아이템마다 기준 무게가 다르고(0.6 ~ 2.4 단위) · 같은 아이템도 낱개마다 다르다(앞 낱개가 무겁다 — 로트 꼴)
  const W0 = {}; let k = 0;
  const unitsOf = (it, n) => { if (W0[it] == null) W0[it] = 0.6 + ((k++ * 7) % 10) * 0.2; let u = 0; for (let i = 0; i < n; i++) u += W0[it] * (1 + 0.5 / (1 + i)); return +u.toFixed(4); };
  const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
  const TAKES = ['wood', 'stone', 'food', 'salt', 'fish', 'hide'];
  for (let vi = 0; vi < 5; vi++) for (const tk of [null, K]) for (const give of GIVES) for (const take of TAKES) {
    if (give === take || !D.toEcon.get(take)) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    const its = D.items.get(give);
    const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : (j === 1 ? 5 : 30); }); return o; };
    const hostOpts = (inv, qty, want) => {   // 호스트 `villageTradeQuote` 와 같은 꼴(개수 → 어림 단위 · perItem · 인벤 전달)
      const u = Number(unitsOf(its[0], 1)) * qty, per = qty > 0 ? u / qty : 1;
      return { u, o: Object.assign(tk ? { want, perItem: per, takeKcal: tk } : { want, perItem: per }, { inventory: inv, unitsOf, giveCount: qty }) };
    };
    for (let qty = 1; qty <= 12; qty++) {
      const snap = JSON.stringify(v.storage), inv = mkInv();
      const h = hostOpts(inv, qty, 0), q = Trade.quote(L, econV2, vil, vi, give, take, h.u, h.o);
      const s0 = +v.storage[take] || 0, inv0 = JSON.stringify(inv);
      const x = Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want: 0, unitsOf, deposit: V.playerVillageDeposit }, tk ? { takeKcal: tk } : {}));
      const dSpent = +(s0 - (+v.storage[take] || 0)).toFixed(4);
      const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S);
      rows.push([vi, tk ? 1 : 0, give + '>' + take, qty, q.err ? null : q.take, q.capped ? 1 : 0, q.giveUsed == null ? null : q.giveUsed, x.ok ? 1 : 0, x.ok ? x.give : null, x.ok ? x.take : null, dSpent, inv0 === JSON.stringify(mkInv()) ? 1 : 0]);
    }
    for (const want of [1, 2, 3, 5, 8, 13, 21, 34]) {   // 받을 양 주문
      const snap = JSON.stringify(v.storage), inv = mkInv();
      const h = hostOpts(inv, 1, want), q = Trade.quote(L, econV2, vil, vi, give, take, h.u, h.o);
      const x = Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: 0, want, unitsOf, deposit: V.playerVillageDeposit }, tk ? { takeKcal: tk } : {}));
      //   최소인가 — 실행이 낸 낱개보다 하나 적게 내면 받을 양에 못 닿는가(같은 고르기 · 같은 계획 — 마른 견적 하나)
      let minOk = null;
      if (x.ok && x.give > 1 && x.take >= want) {
        const S2 = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S2)) delete v.storage[kk]; Object.assign(v.storage, S2);
        const inv2 = mkInv(), h2 = hostOpts(inv2, x.give - 1, 0), q2 = Trade.quote(L, econV2, vil, vi, give, take, h2.u, Object.assign({}, h2.o, { inventory: inv2 }));
        minOk = (q2 && !q2.err && q2.take >= want) ? 0 : 1;
      }
      const S = JSON.parse(snap); for (const kk of Object.keys(v.storage)) if (!(kk in S)) delete v.storage[kk]; Object.assign(v.storage, S);
      wrows.push([vi, tk ? 1 : 0, give + '>' + take, want, q.err ? null : (q.giveNeeded == null ? null : q.giveNeeded), q.err ? null : (q.takeAtNeeded == null ? null : q.takeAtNeeded), x.ok ? 1 : 0, x.ok ? x.give : null, x.ok ? x.take : null, minOk]);
    }
  }
  //   ★[T1162] 쓰기가 끝난 뒤에 나간다 — 맥 파이프는 비동기라 `console.log` 직후 `process.exit` 가 8,192 바이트에서 잘랐다(출력 글자는 그대로)
  console.log = _l; process.stdout.write(JSON.stringify({ on: Trade.T835_ON, gives: GIVES, rows, wrows }) + '\n', () => process.exit(0));
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T);

console.log('\n=== 무거운 물건 견적도 고른 그 개체들의 무게로 (T835) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = T.match(/const T835_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T835_QUOTE_WEIGHT === '0'\);/g) || [];
  ok(decl.length === 1, '① 선언 하나 · ★[T847] `=== \'0\'` 만 끔(켬 기본)', `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T835_QUOTE_WEIGHT')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T835_QUOTE_WEIGHT; if (v != null) e.T835_QUOTE_WEIGHT = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T835_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('0')}`); }

console.log('\n② 글자 — 고르기 · 단위 셈 하나');
{ const defs = (C.match(/function _giver\(/g) || []).length, pickers = (C.match(/const pick = \(cnt\) =>/g) || []).length;
  ok(defs === 1 && pickers === 1 && /const G = _giver\(D, inventory, giveRes, unitsOf\);/.test(C), '② 실행의 고르기 · 단위 셈 = `_giver` 하나(정본 순서 고르기 사본 0)', `정의 ${defs} · 고르기 ${pickers}`);
  ok(/const _G = \(T835_ON && opts && opts\.inventory\) \? _giver\(ledger\.deliverable, opts\.inventory, giveRes,/.test(C), '② 견적의 켬 갈래가 같은 함수 · 인벤이 올 때만');
  const Vs = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')), Zs = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
  ok(/\{ inventory: opts\.inventory, unitsOf: \(typeof unitsOf === 'function'\) \? unitsOf : undefined, giveCount: _n \}/.test(Vs) && /\{ want: msg\.want, inventory: player\.inventory(?:, [^}]*)? \}/.test(Zs),
    '② 호스트 — 존이 낼 사람 인벤을 넘기고 마을 문이 그대로 전달한다(손잡이는 안 읽는다 · 뒤에 수수료 칸 feeRate · feeOwe 가 붙어도 된다 — T1151)'); }

// ★[T1121 2026-11-03] 아이 판 둘(끔 · 켬)을 **나란히** — 둘은 서로 안 닿는다(판마다 세계 하나 · 같은 씨 · 같은 짐 · 프로세스 따로).
//   종전엔 하나씩 차례로 돌려(execFileSync) 2코어 상자에서 한 코어가 놀았다(386초 · T1121 표 8위). `test-t988-trade-words` · `test-t807-quote-exec` 가 이미 쓰는 꼴 그대로다.
//   받는 차례 · 단언 · 찍는 글자는 종전 그대로 — 증명 = 줄이기 전후 출력 바이트 같음(보고 T1121 §3). 아이가 죽으면 이름을 붙여 빨강(종전: 잡히지 않은 예외로 죽음 · 둘 다 rc 1).
const sub = (env) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T835_SUB: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let o = '', e = '';
  p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');   // 조각 경계에 걸린 한글 바이트를 잇는다
  p.stdout.on('data', (b) => { o += b; }); p.stderr.on('data', (b) => { e += b; });
  p.on('close', (c) => { if (c !== 0) return rej(new Error(`아이 판 ${JSON.stringify(env)} 종료 ${c} · ${e.trim().split('\n').pop() || ''}`));
    try { res(JSON.parse(o.trim().split('\n').pop())); } catch (err) { rej(new Error(`아이 판 ${JSON.stringify(env)} 출력을 못 읽었다 · ${err.message}`)); } });
});
console.log('\n③ 같은 곳간 · 같은 순간 — 무게 다른 짐');
(async () => {
{ const [off, on] = await Promise.all([sub({ T835_QUOTE_WEIGHT: '0' }), sub({ T835_QUOTE_WEIGHT: '1' })]);
  //   행 = [마을 · 열량짝 · 짝 · 낼 양 · 견적 받을 · 견적 상한 · 견적 giveUsed · 실행 됨 · 실행 낸 · 실행 받은 · 곳간 나감 · 인벤 그대로]
  const lie = (r) => (r[4] == null ? false : (r[7] ? (r[4] !== r[9] || (r[6] != null && r[6] !== r[8])) : r[4] > 0));
  ok(off.on === false && on.on === true && off.gives.length === 2, '③ 전제 — 손잡이가 실제로 읽힌다 · 무게 다른 아이템 여럿인 낼 것 둘', `${off.gives.join(' · ')}`);
  ok(on.rows.length > 300 && on.rows.filter((r) => r[7]).length > 100, '③ 전제 — 바뀐 판이 넉넉하다(자명 통과 금지)', `${on.rows.length} 판 · 됨 ${on.rows.filter((r) => r[7]).length}`);
  const offBad = off.rows.filter(lie), onBad = on.rows.filter(lie);
  ok(offBad.length > 0, 'ⓐ 미끼(끔) — 낼 양 주문에서 견적 ≠ 실행이 있다', `${offBad.length}/${off.rows.length} · 예 ${JSON.stringify(offBad[0])}`);
  ok(onBad.length === 0, '★★ⓑ 켬 — 견적 받을 양 = 실행이 준 양 · giveUsed = 실행이 낸 낱개 · 실행이 못 하면 견적 0', `${onBad.length}/${on.rows.length}${onBad.length ? ' · 예 ' + JSON.stringify(onBad[0]) : ''}`);
  const ex = (r) => JSON.stringify([r[7], r[8], r[9], r[10]]);
  ok(on.rows.every((r, i) => ex(r) === ex(off.rows[i])), '★ⓒ 켬 — 실행(됨 · 낸 · 받은 · 곳간 나감)은 끔과 한 자리도 안 다르다(낼 양 주문)');
  ok(on.rows.every((r) => r[11] === 1), 'ⓒ 마른 견적 — 견적이 인벤을 안 건드린다(견적 직후 인벤 = 처음)');
  //   받을 양 주문 = [마을 · 열량짝 · 짝 · 받을 · 견적 낼 낱개 · 견적 받을 · 실행 됨 · 실행 낸 · 실행 받은 · 최소]
  const wlie = (r) => (r[6] ? (r[4] !== r[7] || r[5] !== r[8]) : (r[4] != null && r[4] > 0));
  const wOff = off.wrows.filter(wlie), wOn = on.wrows.filter(wlie), wDone = on.wrows.filter((r) => r[6]);
  ok(wOff.length > 0, 'ⓓ 미끼(끔) — 받을 양 주문에서 견적 ≠ 실행이 있다', `${wOff.length}/${off.wrows.length} · 예 ${JSON.stringify(wOff[0])}`);
  ok(wDone.length > 50 && wOn.length === 0, '★★ⓓ 켬 — 받을 양 주문: 견적의 낼 낱개 · 받을 양 = 실행', `${wOn.length}/${on.wrows.length} · 됨 ${wDone.length}${wOn.length ? ' · 예 ' + JSON.stringify(wOn[0]) : ''}`);
  const wex = (r) => JSON.stringify([r[6], r[7], r[8]]);
  ok(on.wrows.every((r, i) => wex(r) === wex(off.wrows[i])), '★ⓓ 켬 — 받을 양 주문의 실행(됨 · 낸 · 받은)도 끔과 한 자리도 안 다르다 — 고친 것은 견적뿐');
  const minBadOn = on.wrows.filter((r) => r[9] === 0), minBadOff = off.wrows.filter((r) => r[9] === 0);
  ok(minBadOn.length === 0 && on.wrows.some((r) => r[9] === 1), '★ⓓ 켬 — 실행이 낸 낱개는 최소다(하나 적으면 못 닿는다 · 캐논 ② 올림)', `켬 넘침 ${minBadOn.length} · 끔 넘침 ${minBadOff.length}`); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ ' + (e && e.message)); process.exit(1); });
