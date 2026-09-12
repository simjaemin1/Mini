// === scripts/code-only.js — 소스에서 **주석만** 걷어내는 정본 [T171 2026-09-11] =========
//
// ★★왜 정본 하나인가 — **사본이 사본을 낳았다.** T152 §3 이 세어 보니 `codeOnly` 가
//   스무 파일에 **스물넷**으로 흩어져 있었고 판이 넷이었다(줄필터 · 블록 먼저 · 줄 먼저 ·
//   블록+http 가드). 그중 "블록 먼저" 열넷은 `server/villages.js:20` 의
//   `// … sim/* …` 를 **블록 주석의 시작**으로 읽어 파일의 **67.9%** 를 삼켰다(T171 §0-ⓑ 실측).
//   T100 5판과 T163 이 각자 "줄 먼저" 수리본을 만들었지만 그것도 사본이었고,
//   문자열 안의 `//`·블록 주석 안의 `//` 앞에서는 여전히 틀린다. 정규식으로는 못 푼다 —
//   **주석이 어디서 시작하는지는 토크나이저만 안다.**
//
// ★그래서 `acorn` 의 토크나이저를 쓴다(`package.json` 에 이미 있다 · `test-client-globals` 가 쓴다).
//   `onComment` 가 주석 구간 [start, end) 를 정확히 준다 — 문자열·정규식 리터럴 안의
//   `//` 는 애초에 주석이 아니므로 **불리지 않는다**.
//
// ★★**공백으로 덮는다 — 지우지 않는다.** 줄바꿈은 그대로 두고 나머지 글자만 공백으로 바꾼다.
//   ⇒ 길이·오프셋·줄 번호가 **한 칸도 안 움직인다**. 하네스가 `indexOf('function _pestAt')` 로
//   찾은 자리를 그대로 `src.slice(i, …)` 에 쓰는 곳이 여럿인데(예: `test-hunt-port`),
//   옛 제거기는 그 자리를 흔들었다. 덮기는 그 흔들림까지 없앤다.
//
// ★파편(함수 본문 한 토막)도 들어온다 — 토크나이저는 완결된 프로그램을 요구하지 않는다.
//   그래도 끝맺지 않은 문자열 같은 것이 오면 던질 수 있으니, **그때까지 모인 주석은 덮고**
//   나머지는 원문 그대로 돌린다(조용히 전부 포기하지 않는다).
'use strict';
const acorn = require('acorn');

/** 소스에서 주석 구간을 공백으로 덮는다(줄바꿈 보존 · 길이·오프셋 불변). 정규식 0. */
function codeOnly(src) {
  const s = String(src == null ? '' : src);
  if (!s) return s;
  const spans = [];
  const opts = {
    ecmaVersion: 2022,
    allowHashBang: true,
    onComment: (block, text, start, end) => { spans.push([start, end]); },
  };
  try {
    const t = acorn.tokenizer(s, opts);
    for (;;) { const tok = t.getToken(); if (tok.type === acorn.tokTypes.eof) break; }
  } catch (e) {
    // 파편·비표준 조각 — 여기까지 모인 주석만 덮는다(아래 공용 경로가 처리한다).
  }
  if (!spans.length) return s;
  const out = s.split('');
  for (const [a, b] of spans) {
    // ★해시뱅(`#!/usr/bin/env node`)은 주석이 아니다 — acorn 이 주석으로 넘겨주지만
    //   실행 파일의 첫 줄이고 하네스가 소스에서 찾는 대상이라 **덮지 않는다**(실측: `farm-metrics.js`).
    if (a === 0 && s.charCodeAt(0) === 35 && s.charCodeAt(1) === 33) continue;
    for (let i = a; i < b && i < out.length; i++) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
  }
  return out.join('');
}

module.exports = codeOnly;
module.exports.codeOnly = codeOnly;
