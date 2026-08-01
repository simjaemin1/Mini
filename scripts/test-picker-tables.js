#!/usr/bin/env node
// === picker 가치표 드리프트 하네스 ===
// 계약: 두 picker(pickDeficitJob / pickDeficitJob_rational)가 return할 수 있는 모든 직업은
//       전환 보류(hold) 게이트의 가치표 OUT1·OUTRES에 등록돼 있어야 한다.
// 배경: 표에 없는 직업은 needValue가 폴백(0.5 × 식량가)으로 계산돼 전환이 상시 보류된다.
//       cook(유령 박멸 #4)·tailor(2026-08-01, 의복 축 800일 사망)가 실제로 이렇게 죽었다.
//       merchant는 산출재가 없는 직업이라 명시 예외.
// 실행: node scripts/test-picker-tables.js
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

function cutFn(name) {
  const st = src.indexOf('function ' + name + '(');
  if (st < 0) throw new Error('함수 없음: ' + name);
  let d = 0, i = src.indexOf('{', st);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(st, j + 1); }
  }
}
// picker가 return하는 직업 리터럴 전수(문자열 return + fallback 배열)
function returnedJobs(fnSrc) {
  const jobs = new Set();
  for (const m of fnSrc.matchAll(/return '([a-z_]+)'/g)) jobs.add(m[1]);
  for (const m of fnSrc.matchAll(/\[([^\]]*)\]\.find/g))
    for (const q of m[1].matchAll(/'([a-z_]+)'/g)) jobs.add(q[1]);
  // 배열 정렬 후 [0][0] 반환 패턴(foodOpts/opts)
  for (const m of fnSrc.matchAll(/\[\['([a-z_]+)'[^\]]*\], \['([a-z_]+)'[^\]]*\], \['([a-z_]+)'[^\]]*\], \['([a-z_]+)'/g))
    [m[1], m[2], m[3], m[4]].forEach((j) => jobs.add(j));
  return jobs;
}
// OUT1/OUTRES 키 파싱
function tableKeys(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\};'));
  if (!m) throw new Error(name + ' 표 없음');
  const keys = new Set();
  for (const q of m[1].matchAll(/([a-z_]+):/g)) keys.add(q[1]);
  return keys;
}

const EXCEPT = new Set(['merchant']);   // 산출재 없는 직업 — needValue 폴백 감수(명시 예외)
const out1 = tableKeys('OUT1'), outres = tableKeys('OUTRES');
const all = new Set([...returnedJobs(cutFn('pickDeficitJob')), ...returnedJobs(cutFn('pickDeficitJob_rational'))]);

console.log('[picker가 반환 가능한 직업 → OUT1·OUTRES 등록 검사]');
console.log('  발견 직업:', [...all].sort().join(', '));
for (const j of [...all].sort()) {
  if (EXCEPT.has(j)) { console.log('  - ' + j + ': 명시 예외(산출재 없음)'); continue; }
  ok(out1.has(j), `${j} ∈ OUT1`);
  ok(outres.has(j), `${j} ∈ OUTRES`);
}
console.log('\n[표 자체 정합 — OUT1 키 = OUTRES 키]');
ok([...out1].sort().join() === [...outres].sort().join(), `OUT1(${out1.size}) = OUTRES(${outres.size})`);

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
