// =============================================================================
// public/dir-word.js — **방위말 정본**(서버 · 클라 공용) [T1204 · ★재민 11-07 문 29 ⓑ "그러자 b"]
//
// ★★사본 금지. 서버는 `require('../public/dir-word.js')` 로 **이 파일 자체**를 읽고(`server/onboarding.js` `_DIRWORD` ·
//   촌장 대사 · 쓰러짐의 외침 `rescue.js` 가 그것을 부른다), 클라는 `<script src="dir-word.js">` 로 **같은 파일**을 읽는다
//   (「지금 할 일」 칸이 "쉼터는 해 뜨는 북쪽으로 40걸음" 을 말한다 — `public/client/70-lobby.js`).
//   `move-model.js` · `soil-base.js` 가 세운 그 규약이다 — 같은 8방 표가 두 벌이면 "촌장은 해 지는 쪽이라는데 칸은 서쪽"이 된다.
//   몸은 `server/onboarding.js` 의 `_DIRWORD`(T56 · §9.5 "화살표 금지 · 방향은 대사로")를 **글자 그대로** 옮겼다.
//
// dx, dy = 화면 좌표 차(x 오른쪽 = 해 뜨는 쪽 · y 아래 = 남쪽). 반환 = 8방 낱말 하나.
// =============================================================================
(function (root) {
  'use strict';
  function dirWord(dx, dy) {
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    if (a >= -22.5 && a < 22.5) return '해 뜨는 쪽';
    if (a >= 22.5 && a < 67.5) return '해 뜨는 남쪽';
    if (a >= 67.5 && a < 112.5) return '남쪽';
    if (a >= 112.5 && a < 157.5) return '해 지는 남쪽';
    if (a >= 157.5 || a < -157.5) return '해 지는 쪽';
    if (a >= -157.5 && a < -112.5) return '해 지는 북쪽';
    if (a >= -112.5 && a < -67.5) return '북쪽';
    return '해 뜨는 북쪽';
  }
  const API = { dirWord: dirWord };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DirWord = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
