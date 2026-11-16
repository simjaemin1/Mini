'use strict';
// === scripts/lib-verdict.js — `assert` 만 쓰는 하네스의 공용 판정 줄 (T1301 · T1291 회부 4) ======================
//
// ★왜: 러너(`run-regress.sh`)는 RC=0 이어도 판정 줄(✓/✗ 표시 · 통과 · PASS · 결과 …)이 하나도 없으면 "결과줄 0개 → 실패"로 센다
//   (조용한 크래시 금지). node `assert` 만 쓰는 하네스는 단언이 다 서도 아무 말을 안 해서, 멀쩡한 판이 전수에서 빨갰다
//   (T1291 · `test-t1259-wood-cap`). 하네스마다 판정 줄을 손으로 적으면 말투가 갈리고(`PASS 4 / FAIL 0` 를 글자로 박은 판은
//   단언 수가 바뀌어도 4 라고 말한다) — 그래서 한 벌로 둔다.
//
// 쓰는 법:
//   const V = require('./lib-verdict')('test-x');        // { strict: true } 면 `assert/strict` 를 감싼다
//   const assert = V.assert;                              // node assert 그대로(같은 함수 · 같은 메시지 · 부른 수만 센다)
//   …단언…
//   V.end();                                              // 맨 끝 한 줄: `=== test-x 결과: N 통과 / 0 실패 ===`
//
// 규약(느슨하게 만들지 않는다):
//   · 단언이 던지면 node 가 RC≠0 으로 끝난다 — 종전 그대로(판정 줄이 없어도 러너가 RC 로 빨갛게 센다).
//   · `end()` 를 안 부르고 RC=0 으로 끝나면(일찍 return · `process.exit(0)` · 기다리던 것이 안 와 이벤트 루프가 빈 채 멈춤)
//     판정 줄 대신 `✗ <이름> — 판정 줄 전에 끝났다(조용한 끝)` 를 찍고 RC=1 로 바꾼다.
//   · 단언 0개로 `end()` 를 부르면 빨강(자명 통과 0).
//   · 이 줄은 판정을 짓지 않는다 — 센 수를 말할 뿐이다. 단언의 뜻 · 문턱은 하네스 몫이다.
const ASSERT_METHODS = ['ok', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual',
  'notDeepStrictEqual', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'match', 'doesNotMatch', 'fail', 'ifError'];
module.exports = function verdict(name, opt) {
  const base = require(opt && opt.strict ? 'assert/strict' : 'assert');
  let n = 0, ended = false, failed = false;
  const A = function () { n++; return base.apply(this, arguments); };
  for (const k of ASSERT_METHODS) if (typeof base[k] === 'function') A[k] = function () { n++; return base[k].apply(this, arguments); };
  A.AssertionError = base.AssertionError; A.strict = A;
  process.on('exit', (code) => {
    if (code !== 0 || failed) return;
    if (!ended) { console.log(`  ✗ ${name} — 판정 줄 전에 끝났다(조용한 끝 · 단언 ${n}개를 지나 RC=0)`); process.exit(1); }
  });
  return {
    assert: A,
    count: () => n,
    end(detail) {
      if (ended) return; ended = true;
      if (n === 0) { failed = true; console.log(`  ✗ ${name} — 단언 0개(자명 통과 금지)`); console.log(`=== ${name} 결과: 0 통과 / 1 실패 ===`); process.exitCode = 1; return; }
      console.log(`=== ${name} 결과: ${n} 통과 / 0 실패 ===${detail ? ' ' + detail : ''}`);
    },
  };
};
