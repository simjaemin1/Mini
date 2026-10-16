// === scripts/lib-emoji.js — "이모지" 정의 **정본 한 벌** (하네스가 함께 읽는다 · `test-`·`e2e-` 이름이 아니라 러너가 안 돈다) ==========
//
// ★[T760 · PM 정함 2026-10-15] 먹선 캐논의 "이모지 0" 은 **그림 글자** — 기본 표시가 이모지인 코드 포인트다.
//   · `\p{Emoji_Presentation}` — 아무것도 안 붙여도 그림으로 뜨는 것(⏳ 🕛 📋 ✅ 🪵 …)
//   · `\p{Emoji}` + VS16(U+FE0F) — 글자 기호에 "그림으로" 표식을 붙인 것(☀️ ✔️ …)
//   ★(U+2605) · ◆ · ⚑(U+2691) · ✔(표식 없이) 같은 **글자 기호는 이모지가 아니다** — 하네스 이름의 강조로 온 레포에 쓰인다.
//   종전 두 하네스(`test-harness-lint` ② · `test-itemlabel` ⑫)는 `\p{Extended_Pictographic}` 이었다 — 그건 "그림 문자가 될 수 있는 것"
//   전부라 ★ ⚑ 를 같이 물었다(T751 회부 1).
'use strict';
const EMOJI = /\p{Emoji_Presentation}|\p{Emoji}️/u;
/** 글 안에 기본 표시가 이모지인 글자가 있나 */
const hasEmoji = (s) => EMOJI.test(String(s == null ? '' : s));
/** 글 안의 이모지 글자들(VS16 은 앞 글자에 붙여서) */
const emojiIn = (s) => String(s == null ? '' : s).match(/\p{Emoji_Presentation}|\p{Emoji}️/gu) || [];
module.exports = { EMOJI, hasEmoji, emojiIn };
