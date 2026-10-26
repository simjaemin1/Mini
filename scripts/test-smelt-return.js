#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-smelt-return.js — 대장장이가 하루를 다 제련에 쓴 날, 마을 하루가 거기서 끝나던 결함 [T932] ======================
//
// ★왜 [T923 회부 1 → T932] `tickVillage` 일하기 루프(`for (const npc of v.npcs)`) 안 대장장이 갈래의
//   `if (_smeltFrac >= 0.999) { workNPC(npc); return; }` 는 `continue` 여야 할 자리에 `return` 이었다 — 그 대장장이 뒤 차례 주민이 그날 일을 안 하고,
//   루프 뒤 꼬리(먹기 · 마모 · K · 인구 · 직업 전환 · 나이)도 안 돌았다. 손잡이 `T932_SMELT_CONT`(켬 기본 · `=0` = 종전 글자)가 고친다.
//
// 재는 것:
//   ① 술어 — `T932_SMELT_CONT` 는 `!(… === '0')`(켬 기본) · 읽는 자리 하나 · 일하기 루프 안에서 tickVillage 를 끝내는 return 은 **끔 갈래 하나뿐**이고
//      그 바로 앞이 `if (T932_SMELT_CONT) continue;` 다(acorn 으로 루프 전수 — 중첩 함수 안 return 은 그 함수만 끝낸다 · 같은 루프의 continue 셋은 그대로)
//   ② 한 마을 하루(가짜 마을 · 존 안 띄움 · 아이 판 둘 — 켬 · `=0`): 첫 차례 대장장이 + 그 땅의 주민 아홉 · 원석 500 · 금속 0 · 연료 넉넉
//      ⓐ 전제 — 두 판 다 그 대장장이가 하루를 다 제련에 쓴다(`t932Stat` · 원석 · 구리 같은 값 = 그 사람의 하루는 고침이 안 바꾼다)
//      ⓑ 켬 — 열 명 다 나이 +1/365 · 곳간 식량이 먹은 만큼 준다 · 뒤 차례 아홉이 일한다(숙련 xp · 금고 세금)
//      ⓒ ★자명 통과 금지 — 끔(`=0`) 판은 같은 자로 **빨강**: 나이 0명 · 곳간 식량 그대로 · 뒤 차례 xp · 세금 0(결함이 실제로 보인다)
//
// 실행: node scripts/test-smelt-return.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ── 아이 판: 한 마을 하루 ──
if (process.env.T932_SUB === '1') {
  const _l = console.log; console.log = () => {};
  const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  if (econ.setSeed) econ.setSeed(1);
  // 픽스처 땅(구리 광산 — t17 시딩 캐시 광산3 의 land 그대로 · 수가 아니라 자리)
  const lp = { fertility: 0.32, arable: 1, water: 0.08, wood: 0.67, game: 0.74, stone: 2.13, ore: 0.24, size: 138, baseSize: 138, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, oreMix: { copper: 0.9, gold: 0.05, silver: 0.05 }, oreGrade: 0.5153, oreP: 0.0909, oreDist: 0.4, coastal: false };
  const v = econ.createVillage({ ...lp, name: '시험광산', initialPop: 10 });
  const sm = v.npcs[0]; v.counts[sm.currentJob] = (v.counts[sm.currentJob] || 0) - 1; sm.currentJob = 'smith'; v.counts.smith = (v.counts.smith || 0) + 1;
  const others = v.npcs.slice(1).map((n) => n.currentJob);
  v.storage.ore = 500; for (const k of ['copper', 'tin', 'lead', 'silver', 'gold', 'iron', 'arsenic']) v.storage[k] = 0;
  v.storage.wood = 1000; v.storage.charcoal = 1000;
  const sk = (n) => JSON.stringify([n.skills, n.skillXp, n.traits]);
  const age0 = v.npcs.map((n) => n.age), sk0 = v.npcs.map(sk), food0 = v.storage.food, s0 = econ.t932Stat.days;
  const tr0 = Object.values(v.treasury || {}).reduce((a, x) => a + (+x || 0), 0);
  econ.tickVillage(v, 1);
  const out = { on: econ.T932_SMELT_CONT, fired: econ.t932Stat.days - s0, others, n: v.npcs.length,
    aged: v.npcs.filter((n, i) => n.age > age0[i]).length, food0, food1: v.storage.food, ore: +v.storage.ore.toFixed(6), copper: +(v.storage.copper || 0).toFixed(6),
    worked: v.npcs.slice(1).filter((n, i) => sk(n) !== sk0[i + 1]).length,
    tax: +(Object.values(v.treasury || {}).reduce((a, x) => a + (+x || 0), 0) - tr0).toFixed(6) };
  console.log = _l; console.log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const L = SRC.split('\n');

console.log('① 술어 · 루프 전수');
ok(/const T932_SMELT_CONT = !\(typeof process !== 'undefined' && process\.env && process\.env\.T932_SMELT_CONT === '0'\);/.test(SRC), '`T932_SMELT_CONT` 는 `!(… === \'0\')` — 켬 기본 · 되돌림 `=0`');
ok((SRC.match(/process\.env\.T932_SMELT_CONT/g) || []).length === 1, '읽는 자리 하나(econ 모듈 머리)', (SRC.match(/process\.env\.T932_SMELT_CONT/g) || []).length);
{
  const acorn = require('acorn');
  const ast = acorn.parse(SRC, { ecmaVersion: 'latest', locations: true });
  let tick = null;
  (function f(n) { if (!n || typeof n !== 'object' || tick) return; if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'tickVillage') { tick = n; return; } for (const k in n) { const c = n[k]; if (Array.isArray(c)) c.forEach(f); else if (c && typeof c.type === 'string') f(c); } })(ast);
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  let loop = null;   // tickVillage 안 `for (const … of v.npcs)` 중 가장 긴 것 = 일하기 루프
  (function f(n) { if (!n || typeof n !== 'object') return; if (FN.has(n.type) && n !== tick) return; if (n.type === 'ForOfStatement' && SRC.slice(n.right.start, n.right.end) === 'v.npcs' && (!loop || n.end - n.start > loop.end - loop.start)) loop = n; for (const k in n) { const c = n[k]; if (Array.isArray(c)) c.forEach(f); else if (c && typeof c.type === 'string') f(c); } })(tick ? tick.body : null);
  ok(!!tick && !!loop, '전제 — tickVillage 와 그 일하기 루프를 찾았다', loop ? `${loop.loc.start.line}~${loop.loc.end.line}줄` : '');
  const ends = [], nested = [], conts = [];
  const LOOPS = new Set(['ForOfStatement', 'ForInStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement']);
  (function w(n, inFn, inner) {
    if (!n || typeof n !== 'object') return;
    let f2 = inFn, i2 = inner;
    if (FN.has(n.type)) f2 = true;
    else if (LOOPS.has(n.type)) i2 = inner + 1;
    if (n.type === 'ReturnStatement') (inFn ? nested : ends).push(n.loc.start.line);
    if (n.type === 'ContinueStatement' && !n.label && !inFn && inner === 0) conts.push(n.loc.start.line);
    for (const k in n) { if (k === 'loc') continue; const c = n[k]; if (Array.isArray(c)) c.forEach((x) => w(x, f2, i2)); else if (c && typeof c.type === 'string') w(c, f2, i2); }
  })(loop ? loop.body : null, false, 0);
  ok(ends.length === 1, '일하기 루프 안에서 tickVillage(마을 하루)를 끝내는 return 은 하나뿐', ends.join(','));
  const prev = ends.length === 1 ? L[ends[0] - 2] : '';
  ok(ends.length === 1 && /^\s*return;/.test(L[ends[0] - 1]) && /if \(T932_SMELT_CONT\) continue;/.test(prev), '그 return 은 끔 갈래 — 바로 앞 줄이 `if (T932_SMELT_CONT) continue;`', ends.length ? `${ends[0] - 1}~${ends[0]}줄` : '');
  ok(nested.length >= 1, '중첩 함수 안 return 은 그 함수만 끝낸다(따로 셈 · 마을 하루 무관)', nested.join(','));
  ok(conts.length === 4, '같은 루프의 continue — 교역 원정 · 징발 · [T932] 제련 날 · 재고 상한 넷', conts.join(','));
}

console.log('② 한 마을 하루 — 첫 차례 대장장이가 하루를 다 제련에 쓴다(켬 · 끔 아이 판)');
const sub = (extra) => JSON.parse(execFileSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T932_SUB: '1' }, extra), encoding: 'utf8' }).trim().split('\n').pop());
const envOn = Object.assign({}, process.env); delete envOn.T932_SMELT_CONT;
const A = JSON.parse(execFileSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign(envOn, { T932_SUB: '1' }), encoding: 'utf8' }).trim().split('\n').pop());
const B = sub({ T932_SMELT_CONT: '0' });
ok(A.on === true && B.on === false, '손잡이 — 기본 켬 · `=0` 끔', `${A.on} · ${B.on}`);
ok(A.fired === 1 && B.fired === 1, 'ⓐ 전제 — 두 판 다 그 갈래가 선다(대장장이가 하루를 다 제련에 썼다)', `켬 ${A.fired} · 끔 ${B.fired}`);
ok(A.ore === B.ore && A.copper === B.copper && A.copper > 0, 'ⓐ 그 대장장이의 하루는 같다(원석 · 구리) — 고침은 그 사람 몫을 안 바꾼다', `원석 ${A.ore} · 구리 ${A.copper}`);
ok(A.others.length === 9 && A.others.every((j) => j !== 'smith'), 'ⓐ 뒤 차례 아홉은 대장장이가 아니다(그 갈래에 안 든다)', A.others[0]);
ok(A.aged === A.n, 'ⓑ 켬 — 열 명 다 나이 +1/365(루프 뒤 꼬리가 돈다)', `${A.aged}/${A.n}`);
ok(A.food1 < A.food0, 'ⓑ 켬 — 곳간 식량이 먹은 만큼 준다', `${A.food0} → ${+A.food1.toFixed(3)}`);
ok(A.worked > 0 && A.tax > 0, 'ⓑ 켬 — 뒤 차례 아홉이 일했다(숙련 xp · 금고 세금)', `${A.worked}/9 · 세금 ${A.tax}`);
ok(B.aged === 0, 'ⓒ ★자명 통과 금지 — 끔 판은 같은 자로 빨강: 나이 0명(꼬리가 안 돈다 · 종전 결함)', `${B.aged}/${B.n}`);
ok(B.food1 === B.food0, 'ⓒ 끔 — 곳간 식량 그대로(그날 아무도 안 먹었다)', `${B.food0} → ${B.food1}`);
ok(B.worked === 0 && B.tax === 0, 'ⓒ 끔 — 뒤 차례 아홉의 숙련 xp · 금고 세금 0(그날 일을 안 했다)', `${B.worked}/9 · 세금 ${B.tax}`);

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
