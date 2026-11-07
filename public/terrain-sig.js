// =============================================================================
// public/terrain-sig.js — **존 지형 절 서명 정본**(서버 · 클라 공용) [T1163 2026-11-05]
//
// ★사본 금지(move-model.js · soil-base.js 규약). 서버는 `require('../public/terrain-sig.js')`,
//   클라는 `<script src="terrain-sig.js">` 로 **같은 파일**을 읽는다.
//
// ★무엇: 존 하나의 지형 절(`hanbando-terrain.json[zone]`)을 JSON 글자로 적은 것의 서명.
//   클라는 로비에서 `/terrain.json` 을 이미 받는다(T1131 `?v=` immutable). 그 절의 서명을 존 접속 주소에
//   `hf=<서명>` 로 실으면, 존은 제 파일 절 서명과 같을 때 첫 접속 · 관측 welcome 에서 `hardcodedTerrain` 을 뺀다
//   (서버 손잡이 `T1163_WELCOME_SIG` — 끔 기본 · `server/zone.js`). 모르거나 다르면 종전대로 싣는다.
//
// ★왜 sha1 이 아닌가: 라이브 접속이 아직 http(IP)라 브라우저 `crypto.subtle` 이 없다(보안 문맥 전용).
//   서명은 판 갈림(파일이 바뀌었나)만 가리면 된다 — 적대 입력이 아니다. 그래서 두 갈래 32비트 섞기
//   (UTF-16 글자 단위 · 서버 · 브라우저가 같은 JS 문자열을 같은 차례로 본다) + 글자 수.
//   꼴: `<글자 수 36진>-<16 hex>` 예 `kf3a-0123456789abcdef`.
//
// ★JSON.stringify 는 ECMAScript 정본(칸 차례 = 넣은 차례 · 수 글자 = Number::toString)이라
//   node 와 브라우저가 같은 객체(같은 파일을 JSON.parse 한 것)에서 같은 글자를 낸다.
//   ⚠런타임에 칸이 붙은 객체(`terrain.js _isPointInRiver` 의 `_segIdx` 같은 것)를 세면 안 된다 —
//     서버는 파일을 따로 읽은 사본으로 세고(zone.js `_t1163FileSig`), 클라는 받은 직후(setHardcoded 앞) 센다.
// =============================================================================
(function (root) {
  'use strict';
  function sigOfString(s) {
    let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (n) => ('00000000' + (n >>> 0).toString(16)).slice(-8);
    return s.length.toString(36) + '-' + hex(h1) + hex(h2);
  }
  function terrainSig(obj) {
    if (obj == null || typeof obj !== 'object') return null;
    return sigOfString(JSON.stringify(obj));
  }
  const api = { sigOfString, terrainSig };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TerrainSig = api;
})(typeof window !== 'undefined' ? window : this);
