#!/usr/bin/env node
// @regress
// === scripts/test-ci-bait-trivial.js — 미끼(T1350) · 자명 통과 하네스 =================================================
// ★이 하네스는 일부러 **고침을 안 잰다**: 제품을 부르기만 하고 늘 참인 단언 하나. 옛 제품 위에서도 초록이다.
//   CI 의 옛 코드 빨강 단계가 이것을 "초록 ✗"(고침을 안 재는 새 하네스)로 잡아 빨강을 내야 한다. 가지는 PM 이 지운다.
'use strict';
const K = require('../server/kcal.js');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
ok(typeof K === 'object', '제품 모듈이 불린다(늘 참 — 미끼)');
console.log(`\n=== test-ci-bait-trivial 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
