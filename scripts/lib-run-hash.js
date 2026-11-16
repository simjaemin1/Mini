'use strict';
// === scripts/lib-run-hash.js — 판 JSON 지문(`runHash`)의 정의 하나 (T1315) =====================================
//
// ★왜 [지시 T1315 ⑤ · 11-13 → 11-14 기준선 다시 굽기]
//   판 JSON 지문은 판 끝 결과(여덟 수 · 해체 · 마을 칸 …)가 같은지를 본다. 그런데 `bodyExit`(몸이 준 까닭 꼬리표 · T590 · T1307)는
//   **세는 자**다 — 꼬리표만 고쳐도(전사 꼬리표 T1307 · unknown 출처 T1315) 같은 판의 지문이 바뀌어 기준선을 다시 구워야 했다.
//   그래서 지문에서 뺀다: 세는 자 칸(`bodyExit` · `warCorpse`)과 판 밖 칸(`env` · `days`)은 지문 밖.
//   정의가 바뀐 표시 = `RUN_HASH_DEF` — 기준선 파일에 이 값이 적혀 있어야 지문끼리 견준다(옛 기준선은 여덟 수 · 해체 · 빈 마을로 견준다).
//
// 쓰는 곳: `scripts/server-baseline-check.js`(만들기 · 견주기) · 하네스 `scripts/test-t1315-war-corpse.js`(미끼 포함)
const crypto = require('crypto');
const RUN_HASH_DEF = 'T1315';                                   // 지문 정의 표시(기준선 파일 `runHashDef`)
const RUN_HASH_DROP = ['env', 'days', 'bodyExit', 'warCorpse'];   // 지문 밖 칸 — 판 밖(env · days) · 세는 자(bodyExit · warCorpse)
function runHashOf(run, drop) {
  const strip = Object.assign({}, run);
  for (const k of (drop || RUN_HASH_DROP)) delete strip[k];
  return crypto.createHash('sha1').update(JSON.stringify(strip)).digest('hex').slice(0, 16);
}
module.exports = { RUN_HASH_DEF, RUN_HASH_DROP, runHashOf };
