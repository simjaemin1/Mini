#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t766-dissolve.js — 해체 문 손잡이 `T766_DISSOLVE_INCOMING`(기본 끔) — 끔 = 종전 글자 · 켬 = 오는 식량이 있으면 해체 안 함 · 미끼 ===
//
// ★왜 [T766 2026-10-15] 해체 조건 "식량 < 인구 × 3일치"가 **이 마을로 오는 식량**(귀환 중 화물 · 장마당 대기 짐 — T727 관찰기가 센 두 칸)을
//   안 봤다(T727 회부 2). 손잡이 하나(`server/bandits.js`)가 그 둘을 곳간 식량에 더한다 — 문턱 그대로 · 새 수 0.
//   ① 글자 — 해체 조건 종전 글자가 그대로 있고, 새 칸은 맨 끝에 `!(T766_INCOMING && _t766Held(…))` 로만 붙었다(끔 = 단락 평가로 무평가) ·
//      손잡이는 `=== '1'` 만 켠다
//   ② 판정 — `daily` 의 그 조건 글자와 `_t766Held` 글자를 떠서 함수로 돌린다(존 부팅 0 · 사본 0 · test-ghost-band 와 같은 문법) ·
//      오는 식량은 정본 `incomingFood`(모듈 내보냄) 그대로. 끔 = 모든 경우 해체(종전) · `_t766Held` 0회.
//      켬 = 귀환 중 식량 · 장마당 대기 식량이 문턱을 채우면 보류(셈 +1), 문턱 아래면 해체.
//      미끼 — 귀환 중 나무 · 다른 마을 귀환 식량 · 이 마을을 **떠나는** 장 대기 짐 · 아직 오는 길(outbound)인 짐 · 문턱 1 모자람 → 해체(안 센다)
//   ③ 모듈 — 아이 프로세스 둘(env 없음 · `=1`)에서 `t766On()` 이 손잡이를 따른다 · `=0`/`true` 는 끔
// ⚠존을 부팅하지 않는다.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

const SRC = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
console.log('\n=== T766 해체 문 손잡이 — 끔 = 종전 · 켬 = 오는 식량 · 미끼 ===');

// ── ① 글자 ─────────────────────────────────────────────────────────────────
const OLD = 'if (day >= _open && !e._banditized && (e._bdtFall || 0) >= BDT_DIS_FALL && fe < n * BDT_DIS_FOOD\n'
  + '        && n >= BDT_GMIN && n <= Math.max(4, Math.min(20, (e._bdtPeak || n) * 0.55))';
const i0 = SRC.indexOf(OLD);
ok(i0 > 0, '① 해체 조건 종전 글자가 그대로 있다(곳간 식량 · 순감 · 잔존 · 피크 문턱)');
const iBr = SRC.indexOf(') {', i0 + OLD.length);
const tail = i0 > 0 ? SRC.slice(i0 + OLD.length, iBr) : '';
ok(/^\s*\/\/[^\n]*\n\s*&& !\(T766_INCOMING && _t766Held\(host\.world, vil, fe, n, day\)\)\s*$/.test(tail),
  '① 새 칸은 맨 끝 하나 — `!(T766_INCOMING && _t766Held(…))`(끔 = 단락 평가로 무평가)', JSON.stringify(tail.trim().split('\n').pop().trim()));
ok(/const T766_INCOMING = [^\n]*process\.env\.T766_DISSOLVE_INCOMING === '1';/.test(SRC), "① 손잡이는 `=== '1'` 만 켠다(기본 끔)");
ok((SRC.match(/_t766Held\(/g) || []).length === 2, '① `_t766Held` 는 정의 하나 · 부름 하나(해체 조건 안)');

// ── ② 판정 — 조건 글자 · `_t766Held` 글자를 떠서 돌린다 ───────────────────────
const cond = SRC.slice(i0 + 'if ('.length, iBr).replace(/\/\/[^\n]*/g, '');
const hS = SRC.indexOf('function _t766Held('), hE = SRC.indexOf('\n}\n', hS) + 2;
const heldSrc = SRC.slice(hS, hE);
const B = require(path.join(ROOT, 'server', 'bandits'));
function decide(on, sc) {
  const S = { stats: {} }, logs = [];
  let calls = 0;
  const mkHeld = new Function('S', 'log', 'incomingFood', 'BDT_DIS_FOOD', heldSrc + '\nreturn _t766Held;');
  const real = mkHeld(S, (d, m) => logs.push(m), B.incomingFood, 3);
  const held = (...a) => { calls++; return real(...a); };
  const f = new Function('day', '_open', 'e', 'fe', 'n', 'BDT_DIS_FALL', 'BDT_DIS_FOOD', 'BDT_GMIN', 'T766_INCOMING', '_t766Held', 'host', 'vil', `return (${cond});`);
  const e = { _banditized: 0, _bdtFall: 5, _bdtPeak: 20, storage: { food: 6, fish: 4 } };
  const other = { name: '이웃' };
  const world = { caravans: sc.car(e, other) };
  const fe = 10, n = 6;   // 문턱 = 6명 × 3일 = 18 · 곳간 10
  const dis = f(800, 400, e, fe, n, 5, 3, 3, on, held, { world }, { name: '농촌9', econ: e });
  return { dis, calls, held: S.stats.t766Held || 0, logs };
}
const SC = [
  { k: '오는 식량 없음', car: () => [], on: true },
  { k: '귀환 중 식량 8(곳간 10 + 8 = 18 = 문턱)', car: (e, o) => [{ state: 'inbound', from: e, to: o, _returningRes: 'food', _returningAmt: 8 }], on: false },
  { k: '장마당 대기 물고기 12(정산 때 이 마을 곳간에)', car: (e, o) => [{ state: 'inbound', from: o, to: e, giveRes: 'fish', _t707: { give: 12 } }], on: false },
  { k: '둘이 합쳐 문턱(귀환 고기 5 + 대기 익힌 밥 3)', car: (e, o) => [{ state: 'inbound', from: e, to: o, _returningRes: 'meat', _returningAmt: 5 }, { state: 'inbound', from: o, to: e, giveRes: 'cooked_food', _t707: { give: 3 } }], on: false },
  { k: '미끼 — 귀환 중 나무 50', car: (e, o) => [{ state: 'inbound', from: e, to: o, _returningRes: 'wood', _returningAmt: 50 }], on: true },
  { k: '미끼 — 다른 마을로 귀환하는 식량 50', car: (e, o) => [{ state: 'inbound', from: o, to: e, _returningRes: 'food', _returningAmt: 50 }], on: true },
  { k: '미끼 — 이 마을을 떠나는 장 대기 식량 50(도착이 이웃)', car: (e, o) => [{ state: 'inbound', from: e, to: o, giveRes: 'food', _t707: { give: 50 } }], on: true },
  { k: '미끼 — 아직 오는 길(outbound) 식량 50', car: (e, o) => [{ state: 'outbound', from: o, to: e, giveRes: 'food', giveAmt: 50 }], on: true },
  { k: '미끼 — 장 대기 소금 50(식량류 밖)', car: (e, o) => [{ state: 'inbound', from: o, to: e, giveRes: 'salt', _t707: { give: 50 } }], on: true },
  { k: '미끼 — 귀환 식량 7.9(문턱 0.1 모자람)', car: (e, o) => [{ state: 'inbound', from: e, to: o, _returningRes: 'food', _returningAmt: 7.9 }], on: true },
];
let offCalls = 0, offDis = 0, onHeld = 0, baitDis = 0, baits = 0;
for (const sc of SC) {
  const a = decide(false, sc), b = decide(true, sc);
  offCalls += a.calls; if (a.dis) offDis++;
  if (!b.dis) onHeld++;
  if (/미끼/.test(sc.k)) { baits++; if (b.dis && b.held === 0) baitDis++; }
  ok(a.dis === true && a.calls === 0 && b.dis === sc.on && b.held === (sc.on ? 0 : 1),
    `② ${sc.k} — 끔 해체(종전) · 켬 ${sc.on ? '해체' : '**보류**'}`, `끔 ${a.dis ? '해체' : '보류'}/부름 ${a.calls} · 켬 ${b.dis ? '해체' : '보류'}/셈 ${b.held}${b.logs.length ? ' · ' + b.logs[0] : ''}`);
}
ok(offCalls === 0 && offDis === SC.length, '② 끔 — 모든 경우 해체(종전 글자 그대로) · `_t766Held` 부름 0', `${offDis}/${SC.length} · 부름 ${offCalls}`);
ok(onHeld === 3 && baitDis === baits && baits === 6, '② 켬 — 보류는 오는 식량이 문턱을 채운 셋뿐 · 미끼 여섯은 모두 해체(자명 통과 아님 — 갈린다)', `보류 ${onHeld} · 미끼 해체 ${baitDis}/${baits}`);

// ── ③ 모듈 — 손잡이 읽기(아이 프로세스) ───────────────────────────────────────
const probe = (v) => {
  const env = Object.assign({}, process.env); delete env.T766_DISSOLVE_INCOMING;
  if (v != null) env.T766_DISSOLVE_INCOMING = v;
  return execFileSync(process.execPath, ['-e', `process.stdout.write(String(require(${JSON.stringify(path.join(ROOT, 'server', 'bandits'))}).t766On()))`], { env, cwd: ROOT }).toString();
};
const pr = { none: probe(null), one: probe('1'), zero: probe('0'), tru: probe('true') };
ok(pr.none === 'false' && pr.one === 'true' && pr.zero === 'false' && pr.tru === 'false', "③ 모듈 — env 없음 끔 · `=1` 켬 · `=0` · `=true` 끔", JSON.stringify(pr));

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
