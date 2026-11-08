#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1161-two-prices.js — T1161 · K13: 거래소 견적 · 실행이 두 칸만 묻는다 — 값은 전 표의 그 칸과 같다 ======
//   정본 `econV2.shadowPricesOf(v, keys)` · 접근자 `Events.pricesFreshOf` · 거래소 자리 넷(`server/trade.js` 넘침 둘 · `planSliced` · `quote`).
//   ① 같은 값 — 세계(시드 7 · 마을 5 · 날 0 · 60 · 200)의 마을마다 값표 전 칸(226 + 원석 · 값표 밖 이름)을 두 칸씩 물어 전 표와 **비트 같음**(`Object.is`)
//      · 원석이 낀 짝(상한) · 값표 밖 이름(칸 없음 = 전 표의 `undefined`) · 같은 이름 두 번 · 빈 목록
//   ② 세계 공급 캐시(`_effDemCache`)가 전 표와 같은 순간에 선다 — 하루 첫 물음이 두 칸이어도 그 뒤 재고를 바꿔 물은 값이 전 표 판과 같다(미끼: 캐시를 안 세우면 갈린다)
//   ③ 세계를 안 바꾼다 — 물은 뒤 마을 곳간 · 세계 지문이 그대로
//   ④ 거래소 — 견적(낼 양 · 받을 양) · 실행(곳간이 실제로 바뀜) · 시세표(넘침 딱지)가 손잡이 켬(두 칸) · 끔(`T1161_TWO_PRICES=0` · 전 표) 판에서 같은 수(아이 판 둘 · JSON 바이트 같음)
//   ⑤ 빠름 — 두 칸이 전 표보다 빠르다(보고 칸 · 단언은 3배 이상)
// 실행: node scripts/test-t1161-two-prices.js   (존 안 띄움 · 약 1분)
'use strict';
if (process.env.T1074_FOOD_DEBT == null) process.env.T1074_FOOD_DEBT = '0';   // 거래소 형제 하네스(t988 · t835)와 같은 판 세계
if (process.env.T858_NO_SHIELD == null) process.env.T858_NO_SHIELD = '0';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SV = (f) => path.join(ROOT, 'server', f);

if (process.env.T1161_SUB) {   // ── 아이 판(④) — 거래소 견적 · 조각 계획 수를 JSON 으로 ──
  const _l = console.log; console.log = () => {};
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 120; d++) econV2.tickWorldV2(world);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable;
  const out = { on: Events.T1161_TWO_PRICES, rows: [] };
  const GIVES = [...D.items.keys()].filter((r) => D.toEcon.get(r)).slice(0, 4);
  for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of ['wood', 'stone', 'food', 'salt', 'ore']) {
    if (give === take) continue;
    const vil = { name: 'm' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] };
    for (const q of [1, 3, 8]) {
      const r = Trade.quote(L, econV2, vil, vi, give, take, q, {});
      out.rows.push([vi, give, take, q, r]);
    }
    const inv = {}; inv[D.items.get(give)[0]] = 40;
    out.rows.push([vi, give, take, 'want', Trade.quote(L, econV2, vil, vi, give, take, 1, { want: 4, perItem: 1 })]);
    out.rows.push([vi, give, take, 'exec', Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: 3, deposit: V.playerVillageDeposit })]);   // 실행 — 곳간이 실제로 바뀐다(두 판 같은 차례)
    out.rows.push([vi, give, take, 'store', JSON.stringify(vil.econ.storage)]);
  }
  for (let vi = 0; vi < 5; vi++) out.rows.push([vi, 'board', Trade.board(L, econV2, { name: 'm' + vi, econ: world.villages[vi] }, vi, {}, GIVES[0])]);   // 시세표 · 넘침 딱지(넘침 판정이 한 칸을 묻는다)
  console.log = _l;
  require('fs').writeFileSync(process.env.T1161_SUB, JSON.stringify(out));   // 파이프는 끝에서 잘린다 — 파일로
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const _l = console.log; console.log = () => {};
const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));   // ★[T1203] ② 판마다 흐름 상태 되돌리기(`rngState` · `setRngState`)
const Events = require(SV('events.js'));
console.log = _l;

const ELAS = econV2.ELASTICITY, KEYS = Object.keys(ELAS);
ok(typeof econV2.shadowPricesOf === 'function' && typeof Events.pricesFreshOf === 'function' && Events.T1161_TWO_PRICES === true,
  '①-0 정본 · 접근자가 있다 · 손잡이 켬 기본', { keys: KEYS.length });

const mkWorld = (days) => { const _q = console.log; console.log = () => {}; try { return mkWorld0(days); } finally { console.log = _q; } };
const mkWorld0 = (days) => { const w = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 }); for (let d = 0; d < days; d++) econV2.tickWorldV2(w); return w; };
const fp = (w) => JSON.stringify(w.villages.map((v) => v.storage));

// ① 같은 값
let checked = 0, bad = [], oreSeen = 0, outside = 0;
for (const days of [0, 60, 200]) {
  const w = mkWorld(days);
  for (const v of w.villages) {
    const full = econV2.computeShadowPrices(v);
    const names = KEYS.concat(['ore', '__없는_품목__', 'constructor', 'toString']);
    for (let i = 0; i < names.length; i++) {
      const a = names[i], b = names[(i * 37 + 11) % names.length];
      const two = econV2.shadowPricesOf(v, [a, b]);
      for (const k of [a, b]) {
        checked++;
        if (k === 'ore') oreSeen++;
        const own = Object.prototype.hasOwnProperty;
        const fv = own.call(full, k) ? full[k] : undefined, tv = own.call(two, k) ? two[k] : undefined;
        if (fv === undefined) outside++;
        if (!Object.is(fv, tv)) bad.push({ days, v: v.id, k, fv, tv });
      }
      const extra = Object.keys(two).filter((k) => k !== a && k !== b);
      if (extra.length) bad.push({ days, extra });
    }
    // 원석 + 금속 짝 · 같은 이름 두 번 · 빈 목록
    const t1 = econV2.shadowPricesOf(v, ['ore', 'ore']), t0 = econV2.shadowPricesOf(v, []);
    // ★[T1203 2026-11-07] T1188 원석 쪼개기 켬(land1048 뒤 기본)이면 옛 `ore` 는 값표 칸이 아니다(`TRADABLE` 에서 빠진다 · 전 표에 칸 없음) — 칸 수는 전 표를 따른다.
    const oreN = Object.prototype.hasOwnProperty.call(full, 'ore') ? 1 : 0;
    if (!Object.is(t1.ore, full.ore) || Object.keys(t1).length !== oreN || Object.keys(t0).length !== 0) bad.push({ days, v: v.id, oreDup: t1, empty: t0 });
  }
}
ok(bad.length === 0, '①-1 두 칸 = 전 표의 그 칸(비트 같음 · 날 0 · 60 · 200 · 마을 5 · 전 칸 + 원석 · 값표 밖 이름)', { checked, oreSeen, outside, bad: bad.slice(0, 3) });
ok(oreSeen > 0 && outside > 0, '①-2 판이 원석 상한 · 값표 밖 이름을 지났다(자명 통과 금지)', { oreSeen, outside });

// ② 세계 공급 캐시의 순간 — 새 날 첫 물음이 전 표인 판(A) · 두 칸인 판(B) · 아무것도 안 묻는 판(C · 미끼 = 두 칸이 캐시를 안 세우는 꼴) ·
//    그 뒤 같은 날 세계 공급을 바꾸고 마을 0 의 전 표를 묻는다. 칸마다 B = A 여야 하고, 미끼 C 는 어딘가에서 A 와 갈려야 한다(캐시 순간이 값에 닿는 판이 있다).
{
  // ★[T1203 2026-11-07] 판 넷이 **같은 세계**여야 견준다 — econ 마을 번호 계수기(`_nextVillageId` · 프로세스 전역)가 앞 판(① 의 세계 셋 · 이 절의 앞 판)마다 늘어
  //   같은 시드라도 마을 id 가 달라진다(v6 … ↔ v21 …) — id 에 묶인 칸이 값에 닿아 판끼리 갈렸다(①을 안 돈 프로세스에선 초록 · 보고 T1203 §2).
  //   판마다 econ 흐름 상태(`rngState` — 씨 · 사람 · 마을 계수기)를 같은 값으로 되돌린 뒤 세계를 짓는다(정본 접근자 · 세계 흐름 무변).
  const S0 = V1.rngState();
  const run = (mode) => {
    V1.setRngState(S0);
    const w = mkWorld(60); const v = w.villages[0];
    w.day += 1; delete w._effDemCache;   // 새 날 — 캐시 없음
    if (mode === 'A') econV2.computeShadowPrices(v);
    else if (mode === 'B') econV2.shadowPricesOf(v, ['food', 'wood']);
    else if (mode === 'B2') econV2.shadowPricesOf(v, ['__없는_품목__']);   // 값표 밖 칸만 — `_targetV2` 를 한 번도 안 지나도 캐시는 선다(데움 줄)
    for (const u of w.villages) for (const k of KEYS) u.storage[k] = (u.storage[k] || 0) * 3 + 2;   // 같은 날 세계 공급이 바뀐다
    return econV2.computeShadowPrices(v);
  };
  const A = run('A'), B = run('B'), B2 = run('B2'), C = run('C');
  const diffB = KEYS.filter((k) => !Object.is(A[k], B[k]) || !Object.is(A[k], B2[k])), diffC = KEYS.filter((k) => !Object.is(A[k], C[k]));
  ok(diffB.length === 0, '②-1 새 날 첫 물음이 두 칸이어도 그날 캐시는 전 표 판과 같은 순간에 선다(뒤 값 전 칸 같음)', { diffB: diffB.slice(0, 5) });
  ok(diffC.length > 0, '②-2 미끼 — 캐시를 안 세우는 판은 뒤 값이 갈린다(②-1 이 자명하지 않다)', { diffC: diffC.length, eg: diffC[0], A: A[diffC[0]], C: C[diffC[0]] });
}
// ③ 세계를 안 바꾼다
{
  const w = mkWorld(60); const before = fp(w);
  for (const v of w.villages) for (const k of KEYS) econV2.shadowPricesOf(v, [k, 'ore']);
  ok(fp(w) === before, '③ 물은 뒤 곳간 그대로');
}

// ④ 거래소 — 켬 · 끔 아이 판 JSON 바이트 같음
{
  const os = require('os'), fs = require('fs');
  const sub = (on) => { const f = path.join(os.tmpdir(), `t1161-${process.pid}-${on ? 'on' : 'off'}.json`); execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1161_SUB: f, T1161_TWO_PRICES: on ? '1' : '0' }), stdio: 'ignore' }); const t = fs.readFileSync(f, 'utf8'); fs.unlinkSync(f); return t; };
  const a = JSON.parse(sub(true)), b = JSON.parse(sub(false));
  const sa = JSON.stringify(a.rows), sb = JSON.stringify(b.rows);
  const rows = a.rows.length, deals = a.rows.filter((r) => r[3] === 'exec' && r[4] && r[4].ok).length, gluts = a.rows.filter((r) => r[1] === 'board').reduce((n, r) => n + r[2].rows.filter((x) => x.glut).length, 0);
  ok(a.on === true && b.on === false, '④-0 아이 판 손잡이 켬 · 끔이 섰다');
  ok(sa === sb, '④-1 견적 · 실행 · 곳간 · 시세표 켬 = 끔(JSON 바이트 같음)', { rows, deals, bytes: sa.length });
  ok(rows > 100 && deals > 10 && gluts > 0, '④-2 판이 서는 실행 · 넘침 딱지를 지났다(자명 통과 금지)', { rows, deals, gluts });
}

// ⑤ 빠름
{
  const w = mkWorld(60), v = w.villages[0], N = 300;
  let t = process.hrtime.bigint(); for (let i = 0; i < N; i++) econV2.computeShadowPrices(v); const tf = Number(process.hrtime.bigint() - t) / 1e6;
  t = process.hrtime.bigint(); for (let i = 0; i < N; i++) econV2.shadowPricesOf(v, ['wood', 'ore']); const tt = Number(process.hrtime.bigint() - t) / 1e6;
  ok(tf / tt >= 3, '⑤ 두 칸(나무 · 원석)이 전 표보다 3배 이상 빠르다', { fullMs: +(tf / N).toFixed(4), twoMs: +(tt / N).toFixed(4), x: +(tf / tt).toFixed(1) });
}

console.log(`\n${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
