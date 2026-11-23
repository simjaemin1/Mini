// (@regress 없음 — 러너 밖 · T1426 긴 판 자 공용 · 제품 무변)
// === scripts/lib-heap.js — 긴 서버 판 아이의 힙 상한을 자가 스스로 얹는다(T1420 회부 4 · T1426 ⑤ⓑ) ==========
//   왜: 끔 세계 900날 판(`t1308-long-run`)이 기본 힙(약 2 GB)에서 날 약 679 에 "JavaScript heap out of memory" 로 죽었다(보고 T1420 §3).
//   부르는 쪽이 `--max-old-space-size` 를 이미 줬으면 그대로 · 안 줬으면 `LONG_RUN_HEAP_MB`(기본 6,144 — `eq-run --server` 와 같은 수) 를 앞에 붙인다 ·
//   `LONG_RUN_HEAP_MB=0` = 안 붙임(옛 꼴). 힙 상한은 계산을 안 바꾼다(넘치면 죽을 뿐) — 끈 판 견줌이 그 증거(보고 T1426 가드).
'use strict';
const DEF_MB = 6144;
function withHeap(nodeOptions, env) {
  const o = nodeOptions || '', e = env || process.env;
  if (/--max-old-space-size/.test(o)) return o;
  if (e.LONG_RUN_HEAP_MB === '0') return o;
  return (`--max-old-space-size=${e.LONG_RUN_HEAP_MB || DEF_MB} ` + o).trim();
}
module.exports = { DEF_MB, withHeap };
