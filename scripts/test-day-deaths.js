#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-day-deaths.js — 마을 "그날 죽음" 정본 읽기(`scripts/lib-day-deaths.js`) · 관찰기가 옛 칸을 안 읽는다 (T963) ===
//
// ★[T963 · T943 회부 2] econ `v._deathsToday` 는 틱이 기근 고리 앞 `v._deathsToday = 0` 에 닿은 날만 다시 선다 — 빈 마을(틱 첫 줄 return) ·
//   `T932_SMELT_CONT=0` 판의 제련 날 return 에선 전날 값이 남아, 틱 뒤 · 하루 끝에 읽는 관찰기가 없는 죽음을 날마다 다시 셌다.
//   정본 = `_deadTot`(같은 고리 같은 줄에서 세는 누계)의 틱 앞뒤 차. 관찰기 열둘이 이 한 벌을 부른다.
// 재는 것 (서버 안 띄움 · 포트 0 · 마을 하나 · 아이 프로세스 둘)
//   ⓐ 죽음이 난 날 — 정본 = 옛 칸(그날 값이 선 날은 둘이 같다)
//   ⓑ ★그 다음 날 마을이 비었다(틱 첫 줄 return) — 옛 칸은 전날 값 그대로(자명 통과 금지: 구멍이 정말 있다) · 정본 0 · 누계 무변
//   ⓒ 읽기만 — 정본을 건 판과 안 건 판의 마을 JSON 이 바이트 같다(WeakMap · 마을 칸 0) · 두 번 걸어도 한 겹
//   ⓓ 틱을 못 감쌀 때 쓰는 `dayDelta` · 쌓인 표의 `fromDeadTot` — 누계 열 → 날마다 차
//   ⓔ 정적 — 관찰기(`scripts/t<번호>-…observe|probe|lab.js`)가 코드 줄에서 `._deathsToday` 를 안 읽는다 · 죽음을 읽는 관찰기는 정본을 부른다
//      (미끼: 옛 읽기 한 줄을 넣은 글은 문다)
//
// 실행: node scripts/test-day-deaths.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'sim', 'economy-sim.js');
const LIB = path.join(__dirname, 'lib-day-deaths.js');
const DD = require(LIB);
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 아이: 보호가 끝난 마을 하나(주민 20 · 나이 1,000일) — 날마다 압력 −3 을 얹어 죽음이 난 날을 찾고, 그 다음 날 마을을 비운 채 하루 더 돈다
const CHILD = `
const v1 = require(${JSON.stringify(SIM)});
const DD = require(${JSON.stringify(LIB)});
const lib = process.argv[1] === 'lib';
if (lib) { DD.install(v1); DD.install(v1); }
const once = lib ? v1.tickVillage : null;
const v = v1.createVillage({ initialPop: 20, name: 'p', wood: 0.45 });
v._bornDay = -1000;
let hit = null, d = 0;
for (d = 1; d <= 60 && !hit; d++) {
  v._dPAccum = Math.min(v._dPAccum || 0, -3);
  const t0 = +v._deadTot || 0;
  v1.tickVillage(v, d);
  if ((v._deathsToday || 0) > 0) hit = { day: d, old: v._deathsToday, neu: lib ? DD.deathsToday(v) : null, tot: (+v._deadTot || 0) - t0 };
}
let empty = null;
if (hit) {
  const tot0 = +v._deadTot || 0;
  v.npcs.length = 0;                   // 픽스처 — 마을이 빈 날(틱 첫 줄 return 갈래)
  v1.tickVillage(v, d);
  empty = { old: v._deathsToday || 0, neu: lib ? DD.deathsToday(v) : null, totGain: (+v._deadTot || 0) - tot0 };
}
console.log(JSON.stringify({ hit, empty, oneWrap: lib ? v1.tickVillage === once : null, vjson: JSON.stringify(v) }));
`;
const run = (arg) => JSON.parse(execFileSync(process.execPath, ['-e', CHILD, arg], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').pop());

console.log('\n=== 마을 "그날 죽음" 정본 읽기 (T963) ===');
const L = run('lib'), B = run('bare');
console.log('\n[ⓐ ⓑ 빈 마을 — 틱 첫 줄 return]');
ok(!!L.hit && L.hit.old > 0, 'ⓐ [전제] 압력을 얹은 마을에 죽음이 난 날이 있다', L.hit ? `${L.hit.day}날 · 죽음 ${L.hit.old}` : '없음');
ok(!!L.hit && L.hit.neu === L.hit.old && L.hit.tot === L.hit.old, 'ⓐ 죽음이 난 날 — 정본 = 옛 칸 = 누계 증분(그날 값이 선 날은 같다)', L.hit ? `${L.hit.neu} · ${L.hit.old} · ${L.hit.tot}` : '-');
ok(!!L.empty && L.empty.old === L.hit.old, 'ⓑ ★자명 통과 금지 — 빈 날 옛 칸은 전날 값 그대로다(구멍이 정말 있다)', L.empty ? `옛 칸 ${L.empty.old}` : '-');
ok(!!L.empty && L.empty.neu === 0 && L.empty.totGain === 0, 'ⓑ ★★빈 날 정본 = 0 · 누계 무변(없는 죽음을 안 센다)', L.empty ? `정본 ${L.empty.neu} · 누계 +${L.empty.totGain}` : '-');

console.log('\n[ⓒ 읽기만 · 한 겹]');
ok(L.vjson === B.vjson && L.vjson.length > 1000, 'ⓒ ★정본을 건 판 = 안 건 판 — 마을 JSON 바이트 같음(마을 칸 0)', `${L.vjson.length}B`);
ok(L.oneWrap === true, 'ⓒ 두 번 걸어도 한 겹(`install` 은 한 번만 감싼다)');

console.log('\n[ⓓ dayDelta · fromDeadTot]');
{
  const last = new Map(), v = { _deadTot: 5 };
  const a = DD.dayDelta(last, 'k', v, 3); v._deadTot = 5; const b = DD.dayDelta(last, 'k', v); v._deadTot = 9; const c = DD.dayDelta(last, 'k', v);
  ok(a === 2 && b === 0 && c === 4, 'ⓓ dayDelta — 첫 읽기는 시작 누계와의 차 · 그 뒤 지난 읽기와의 차', `${a} · ${b} · ${c}`);
  ok(JSON.stringify(DD.fromDeadTot([0, 2, 2, 5])) === '[0,2,0,3]' && JSON.stringify(DD.fromDeadTot([7, 9], 7)) === '[0,2]', 'ⓓ fromDeadTot — 누계 열 → 날마다 차(머리 누계 `base`)');
  const f = new Function('return (' + DD.dayDelta.toString() + ')')();
  const m2 = new Map(); ok(f(m2, 'k', { _deadTot: 4 }, 1) === 3, 'ⓓ 쪽 안으로 넘긴 같은 함수(`dayDelta.toString()` — t924-lab)가 같은 답');
}

console.log('\n[ⓔ 정적 — 관찰기가 옛 칸을 안 읽는다]');
const OBS = /^t\d+[a-z0-9-]*-(observe|probe|lab)\.js$/;
const codeReads = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).filter((l) => /\._deathsToday\b/.test(l));
const files = fs.readdirSync(__dirname).filter((f) => OBS.test(f)).sort();
const bad = [], users = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (codeReads(src).length) bad.push(f);
  if (/lib-day-deaths/.test(src)) users.push(f);
}
const WANT = ['t653-probe', 't727-observe', 't766-observe', 't796-observe', 't810-observe', 't815-observe', 't845-observe', 't858-observe', 't875-observe', 't924-observe', 't924-lab', 't931-observe', 't934-observe'].map((x) => x + '.js');
ok(files.length >= WANT.length, 'ⓔ [전제] 관찰기 파일을 실제로 훑었다(0 이면 아래가 자명 통과다)', `${files.length}개`);
ok(bad.length === 0, 'ⓔ ★★관찰기 코드 줄에 `._deathsToday` 읽기 0 — 그날 죽음은 정본(`lib-day-deaths`)으로 읽는다', bad.join(' '));
ok(WANT.every((f) => users.includes(f)), 'ⓔ 죽음을 읽던 관찰기 열셋이 다 정본을 부른다', WANT.filter((f) => !users.includes(f)).join(' ') || `${WANT.length}/${WANT.length}`);
const bait = 'const x = 1;\n    return [N, v.' + '_deathsToday || 0];\n// v.' + '_deathsToday 는 주석이라 안 문다\n';
ok(codeReads(bait).length === 1, 'ⓔ 자명 통과 금지 — 옛 읽기 한 줄을 넣은 미끼는 문다(주석 줄은 안 문다)', `${codeReads(bait).length}줄`);

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
