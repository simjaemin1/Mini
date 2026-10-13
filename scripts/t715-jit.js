// (@regress 없음 — 러너 밖 · T715 계측기 · 제품 무변)
// === scripts/t715-jit.js — 존 프로세스에 얹는 preload: V8 최적화·최적화 풀림 흔적을 존 로그에 함께 찍는다 ==========
//   쓰는 법: T686_PRELOAD=$PWD/scripts/t715-jit.js T715_JIT=1 T715_DEC=1 node scripts/t686-spike.js run <판>
//   ★`v8.setFlagsFromString('--trace-opt --trace-deopt')` — V8 이 함수를 최적화(완료 줄에 준비·실행·마무리 ms)하거나 풀 때마다 존 표준출력(= `<판>.log`)에 한 줄.
//     T686 자 꼬리(T715_JIT=1)가 30 ms 넘는 틱마다 `[T715-SPIKE]` 줄을 같은 출력에 찍는다 ⇒ 그 줄 바로 앞의 V8 줄이 그 틱 안에서 일어난 일이다.
//   (세계에 0 — 읽기만 · V8 흔적 플래그는 코드 모양을 안 바꾼다)
'use strict';
if (process.env.T715_JIT === '1' && require('worker_threads').isMainThread) { try { require('v8').setFlagsFromString('--trace-opt --trace-deopt'); } catch (e) {} }
