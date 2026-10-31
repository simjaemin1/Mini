#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t807-quote-exec.js — 거래소 견적 = 실행(상한에 닿을 때) [T807] ==========
//
// ★왜 [T792 회부 2] 상한(곳간 재고 × `STOCK_FRAC`)에 닿으면 견적은 소수 give(상한에 닿는 그 몫)로 받을 양을 냈고,
//   실행은 낼 양을 낱개로 내려(`⌊maxGive ÷ 평균 단위/개⌋`) 그 give 로 받았다 — 화면 "6 내면 44" · 실제 4 내고 36.
//   손잡이 하나 `T807_QUOTE_TRIM`(★T817 켬 기본 · `=0` = 종전 견적) — 켜면 견적과 실행이 같은 절삭 함수(`_trimToCap`)를 지난다.
//
// 재는 것:
//   ① 술어 — ★[T817] 켬 기본(`=0` 만 끔) · 끔 탐침 · 읽는 자리 = `server/trade.js` 하나
//   ② 끔 = 종전 글자 — 견적의 절삭 · 실행의 절삭 둘 다 손잡이 뒤 · 종전 실행 글자가 끔 갈래에 그대로
//   ③ 같은 곳간 · 같은 순간(곳간 재고를 판마다 되돌린다) — 마을 다섯 · 짝 아홉 · 낼 양 1~12 · 열량 짝 끔/켬:
//      ⓐ 미끼(끔) — 상한에 닿은 판에서 견적 ≠ 실행이 있다(자명 통과 금지)
//      ⓑ ★켬 — 견적의 받을 양 = 실행이 준 양 · 견적의 `giveUsed` = 실행이 낸 낱개 · 실행이 못 하면 견적도 0
//      ⓒ 켬 — 상한에 닿은 판이 실제로 있다 · 실행 결과(낸 · 받은 · 곳간)는 끔과 한 자리도 안 다르다(고친 것은 견적뿐)
//         ★[T1010] 켬 기본 세계(T999 켬)에서는 T999 ① 줄(상한에 닿음 · 한 개 넘침 아님 — 절삭 함수의 T999 갈래는 T807 켬 갈래만 지난다)만 갈리고
//         그 줄은 켬 실행이 상한 전부를 받는다(끔보다 덜 받는 줄 0) · 그 밖 줄은 한 자리도 안 다르다
//      ⓓ 켬 — 상한에 안 닿은 판의 견적은 끔과 같다
//      ⓔ 켬 — 무거운 물건(1개 = 2.25단위) 판도 견적 = 실행
//   ★[T1010] ③ · ⓔ 는 두 세계에서 돈다 — 켬 기본(`T999_TRADE_CAP=1` · T807 · T835 · T999 다 켬) · 되돌림 짝(`T999_TRADE_CAP=0` — T999 전 종전 절삭 판 · 종전 단언 그대로)
//
// 실행: node scripts/test-t807-quote-exec.js   (존 안 띄움 · 아이 판 여덟(세계 둘 × 짐 둘 × 켬 · 끔 — 켬 · 끔은 나란히) · 약 5분)
'use strict';
// ★[T1010 2026-10-31 · T999 회부 3 · 4] 켬 기본 세계로 — 종전(T999 · 10-30)은 이 하네스를 `T999_TRADE_CAP` 끈 판 하나에서 돌렸다(켬 기본 세계를 안 봤다).
//   이제 ③ · ⓔ 는 켬 기본 세계(T999 켬 — ★ⓒ 는 그 세계의 참 값으로)와 되돌림 짝(`=0` — 종전 절삭 판 · 종전 단언 한 글자 그대로) 둘 다 잰다(단언 무름 0).
const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T807_SUB === '1') {   // ── 아이 판: 세계 하나 · 판마다 곳간을 되돌린다 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js')), K = require(SV('kcal.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable, rows = [];
  const PER = +process.env.T807_PER || 1;   // 낼 물건 1개의 단위(무거운 물건 판)
  const unitsOf = PER !== 1 ? (it, n) => n * PER : undefined;
  for (let vi = 0; vi < 5; vi++) for (const tk of [null, K]) for (const [give, take] of [['wood', 'meat'], ['wood', 'stone'], ['food', 'wood'], ['wood', 'food'], ['stone', 'wood'], ['food', 'fish'],
    ['salt', 'food'], ['meat_game', 'food'], ['fruit', 'wood']]   /* ★[T817] 값진 것 → 흔한 것 짝 셋 — 낱개 하나가 상한의 큰 몫을 사는 판(깎음이 나는 쪽 · 켬 기본 세계에서 깎음 0 이던 표본) */) {
    const gItem = D.toEcon.get(give), tItem = D.toEcon.get(take); if (!gItem || !tItem) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    //   ★[T1010] 한 개 넘침 — 낼 것 한 개(PER 단위)를 마을이 다 못 받는 판(짐 없는 견적의 `capped` · 마른 견적) · T999 ① 은 그 판에 안 선다(종전 절삭)
    const q1 = Trade.quote(L, econV2, vil, vi, give, take, PER, tk ? { takeKcal: tk } : {}), oneOver = (q1 && !q1.err && q1.capped) ? 1 : 0;
    for (let qty = 1; qty <= 12; qty++) {
      const snap = JSON.stringify(v.storage), inv = { [gItem]: 400 };
      const opts = tk ? { want: 0, perItem: PER, takeKcal: tk } : { want: 0, perItem: PER };
      const q = Trade.quote(L, econV2, vil, vi, give, take, qty * PER, opts);
      const s0 = +v.storage[take] || 0;
      const x = Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: qty, want: 0, unitsOf, deposit: V.playerVillageDeposit }, tk ? { takeKcal: tk } : {}));
      const dSpent = +(s0 - (+v.storage[take] || 0)).toFixed(4);
      const S = JSON.parse(snap); for (const k of Object.keys(v.storage)) if (!(k in S)) delete v.storage[k]; Object.assign(v.storage, S);
      rows.push([vi, tk ? 1 : 0, give + '>' + take, qty, q.err ? null : q.take, q.capped ? 1 : 0, q.giveUsed == null ? null : q.giveUsed, x.ok ? 1 : 0, x.ok ? x.give : null, x.ok ? x.take : null, dSpent, oneOver, q.err ? null : q.cap]);
    }
  }
  console.log = _l;
  process.stdout.write(JSON.stringify({ on: Trade.T807_ON, cap: Trade.T999_ON, rows }) + '\n', () => process.exit(0));   // ★[T1010] 나란히 받는다 — 파이프에 다 흘려보낸 뒤 끝낸다
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T);

console.log('\n=== 거래소 견적 = 실행(상한에 닿을 때) (T807) ===');
console.log('\n① 술어 · 읽는 자리');
{ const decl = T.match(/const T807_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T807_QUOTE_TRIM === '0'\);/g) || [];
  ok(decl.length === 1, '① 선언 하나 · ★[T817] 켬 기본(`=0` 만 끔)', `선언 ${decl.length}`);
  //   ★[T817] 끔 탐침 — 모듈을 그대로 불러 손잡이 값을 본다(env 없음 = 켬 · `=0` = 끔)
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T807_QUOTE_TRIM; if (v != null) e.T807_QUOTE_TRIM = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T807_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔', `${probe(null)} · ${probe('0')}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T807_QUOTE_TRIM')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나', readers.join(',')); }

console.log('\n② 끔 = 종전 글자');
{ ok(/if \(T807_ON && out\.capped\) \{/.test(C), '② 견적의 절삭은 켬 · 상한에 닿을 때만');
  //   ★[T999] 실행 절삭 부름에 받을 낱개 함수 한 칸(`_takeN`)만 더 허락(그 밖 글자 그대로)
  ok(/if \(T807_ON\) \{[^]*?_trimToCap\(econV2, v, giveRes, takeRes, q0, \(c\) => _units\(_pick\(c\)\), qt\.capped, qt\.maxGive, perItem, capU(?:, _takeN)?\)/.test(C), '② 실행의 절삭 = 같은 함수(`_trimToCap`) · 고른 그 개체들의 실제 무게');
  ok(/\} else \{\s*if \(qt\.capped && perItem > 0\) give = Math\.min\(q0, Math\.floor\(qt\.maxGive \/ perItem\)\);\s*wantW = _pick\(give\);/.test(C), '② 끔 갈래 = 종전 실행 글자 그대로');
  const uses = (C.match(/_trimToCap\(/g) || []).length;
  ok(uses === 4, '② 절삭 함수 — 정의 하나 · 부름 셋(견적 · 실행 · ★T835 받을 양 견적) · 사본 0', `${uses}`); }

//   ★[T1010] 아이 판은 켬 · 끔 둘씩 나란히(세계 둘 × 짐 둘 = 여덟 판 — 줄 글자 · 판정 무변)
const sub = (env) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T807_SUB: '1' }), stdio: ['ignore', 'pipe', 'pipe'] }); let o = '';
  p.stdout.setEncoding('utf8'); p.stdout.on('data', (b) => { o += b; }); p.stderr.on('data', () => {});
  p.on('exit', (c) => { try { res(JSON.parse(o.trim().split('\n').pop())); } catch (err) { rej(new Error(`아이 판 ${JSON.stringify(env)} 종료 ${c}`)); } });
});
//   ★[T1010] 세계 둘 — 켬 기본(T999 켬 — 상한의 마지막 한 개도 판다) · 되돌림 짝(T999 끔 — 종전 절삭 판 · 종전 단언 그대로)
const WORLDS = [
  { name: '켬 기본 — T807 · T835 · T999 켬', env: { T999_TRADE_CAP: '1' }, cap: true },
  { name: '되돌림 짝 — `T999_TRADE_CAP=0`(종전 절삭 판 · 종전 단언 그대로)', env: { T999_TRADE_CAP: '0' }, cap: false },
];
(async () => {
for (const W of WORLDS) {
console.log(`\n③ [${W.name}] 같은 곳간 · 같은 순간 — 마을 다섯 · 짝 아홉 · 낼 양 1~12 · 열량 짝 끔/켬`);
{ const [off, on] = await Promise.all([sub(Object.assign({ T807_QUOTE_TRIM: '0' }, W.env)), sub(Object.assign({ T807_QUOTE_TRIM: '1' }, W.env))]);
  //   행 = [마을 · 열량짝 · 짝 · 낼 양 · 견적 받을 · 견적 상한 · 견적 giveUsed · 실행 됨 · 실행 낸 · 실행 받은 · 곳간 나감 · ★[T1010] 한 개 넘침 · 견적 cap]
  const lie = (r) => (r[4] == null ? false : (r[7] ? (r[4] !== r[9] || (r[6] != null && r[6] !== r[8])) : r[4] > 0));
  const offBad = off.rows.filter(lie), onBad = on.rows.filter(lie), capped = on.rows.filter((r) => r[5]);
  ok(off.on === false && on.on === true && off.cap === W.cap && on.cap === W.cap, '③ 전제 — 손잡이가 실제로 읽힌다(아이 판 둘 · 이 세계의 T999)', `${off.on} · ${on.on} · T999 ${on.cap}`);
  ok(offBad.length > 0 && offBad.every((r) => r[5] === 1), 'ⓐ 미끼(끔) — 견적 ≠ 실행이 있다 · 모두 상한에 닿은 판', `${offBad.length}/${off.rows.length} · 예 ${JSON.stringify(offBad[0])}`);
  ok(onBad.length === 0, '★★ⓑ 켬 — 견적 받을 양 = 실행이 준 양 · giveUsed = 실행이 낸 낱개 · 실행이 못 하면 견적 0', `${onBad.length}/${on.rows.length}${onBad.length ? ' · 예 ' + JSON.stringify(onBad[0]) : ''}`);
  ok(capped.length > 30 && capped.some((r) => r[7] && r[8] < r[3]), 'ⓒ 상한에 닿은 판이 실제로 있다(자명 통과 금지) · 그중 낱개를 깎아 바꾼 판', `${capped.length} · 깎음 ${capped.filter((r) => r[7] && r[8] < r[3]).length}`);
  const ex = (r) => JSON.stringify([r[7], r[8], r[9], r[10]]);
  if (!W.cap) ok(on.rows.length === off.rows.length && on.rows.every((r, i) => ex(r) === ex(off.rows[i])), '★ⓒ 켬 — 실행(됨 · 낸 · 받은 · 곳간 나감)은 끔과 한 자리도 안 다르다 — 고친 것은 견적뿐');
  else {
    //   ★[T1010] 켬 기본 세계의 참 값 — T999 ① 은 절삭 함수의 T999 갈래(T807 켬 갈래만 지난다)라 T807 켬 · 끔 실행은 T999 ① 줄(상한에 닿음 · 한 개 넘침 아님)에서만 갈린다
    //     (끔 갈래는 종전 실행 글자 — 낱개를 `⌊maxGive ÷ 평균 단위⌋` 로 깎는다) · 그 줄은 켬 실행이 상한 전부(견적 `cap` — 열량 짝이면 받을 낱개)를 받는다
    const t999 = (r) => r[5] === 1 && r[11] === 0;
    const dif = on.rows.map((r, i) => i).filter((i) => ex(on.rows[i]) !== ex(off.rows[i]));
    ok(on.rows.length === off.rows.length && dif.length > 0 && dif.every((i) => t999(on.rows[i]) && t999(off.rows[i])),
      '★ⓒ 켬 — 실행(됨 · 낸 · 받은 · 곳간 나감)은 끔과 T999 ① 줄(상한에 닿음 · 한 개 넘침 아님)만 다르다 · 그 밖 줄은 한 자리도 안 다르다 — T807 이 고친 것은 견적뿐',
      `갈린 ${dif.length} 줄 / T999 ① 줄 ${on.rows.filter(t999).length} / ${on.rows.length}`);
    const full = on.rows.map((r, i) => i).filter((i) => t999(on.rows[i]));
    const short = full.filter((i) => { const r = on.rows[i], o = off.rows[i]; return !(r[7] === 1 && r[9] === Math.floor(r[12]) && r[9] >= (o[7] ? o[9] : 0)); });
    ok(full.length > 0 && short.length === 0, '★ⓒ 켬 — 그 줄은 켬 실행이 상한 전부를 받는다(T999 의 값 · 끔보다 덜 받는 줄 0)',
      `${full.length} 줄 · 끔이 덜 받던 줄 ${full.filter((i) => !(off.rows[i][7] && off.rows[i][9] >= on.rows[i][9])).length}${short.length ? ' · 어긋남 ' + short.length + ' · 예 ' + JSON.stringify([on.rows[short[0]], off.rows[short[0]]]) : ''}`);
  }
  ok(on.rows.every((r, i) => r[5] || r[4] === off.rows[i][4]), 'ⓓ 켬 — 상한에 안 닿은 판의 견적은 끔과 같다'); }
console.log(`\nⓔ [${W.name}] 무거운 물건(1개 = 2.25단위)`);
{ const [off, on] = await Promise.all([sub(Object.assign({ T807_QUOTE_TRIM: '0', T807_PER: '2.25' }, W.env)), sub(Object.assign({ T807_QUOTE_TRIM: '1', T807_PER: '2.25' }, W.env))]);
  const lie = (r) => (r[4] == null ? false : (r[7] ? (r[4] !== r[9] || (r[6] != null && r[6] !== r[8])) : r[4] > 0));
  ok(off.rows.filter(lie).length > 0, 'ⓔ 미끼(끔) — 무거운 물건 판에도 견적 ≠ 실행이 있다', `${off.rows.filter(lie).length}/${off.rows.length}`);
  ok(on.rows.filter(lie).length === 0 && on.rows.filter((r) => r[5]).length > 0, '★ⓔ 켬 — 무거운 물건 판도 견적 = 실행(상한 판 포함)', `${on.rows.filter(lie).length} · 상한 ${on.rows.filter((r) => r[5]).length}`); }
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ ' + (e && e.message)); process.exit(1); });
