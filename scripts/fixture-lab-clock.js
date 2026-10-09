// === scripts/fixture-lab-clock.js — 랩 하네스의 시계 **정본** [T660 2026-10-08 · 꼴은 T649] ==============
//
// ★왜 — 랩 하네스(관찰 모드 · 실걸음)가 **실시간**으로 표본을 고르면 같은 파일도 판마다 갈린다.
//   T649 가 `test-lab-psite` ⑧ 에서 뿌리 셋을 가렸다(T641 실측: 같은 main 파일이 B 16/16 · 15/15 · A 14/15 · 16/16):
//     ⓐ 판정 순간(지정 · 개장 · 끝)을 400ms·300ms 마다 들여다본 첫 표본으로 고른다 → 몇째 프레임인지가 상자 부하를 따른다.
//     ⓑ 시계 원점 — 종전 래퍼 `requestAnimationFrame = (cb) => _raf(() => { vt += 16.667; cb(vt); })` 는
//        **실제** rAF 마다 vt 를 밀어 **토글 때의 vt** 가 적재 시간을 따랐다 → dt 의 끝자리(부동소수)가 달라져
//        며칠 뒤 세계가 갈린다(T649 실측: 원점만 0 ↔ 60프레임 다른 두 판 — 400 프레임 같음 · 2,900 프레임 갈림).
//     ⓒ 벽시계 마감(180초 · 900초 · 1,500초) — 넘으면 조용히 짧은 창으로 판정했다.
//   덤: 종전 래퍼는 콜백**마다** 16.667 을 더해, uiLoop 와 한 프레임에 같이 도는 lifeLoop 의 dt 가 33.334ms 였다(T649 실측).
//
// ★이 정본이 페이지에 심는 것(랩 파일은 안 건드린다):
//   · Math.random = mulberry32(받은 씨) · performance.now = 가상시계(원점 0)
//   · rAF 는 **줄로 받기만** 한다 — 프레임은 하네스가 민다. 한 프레임 = 줄에 선 콜백 전부를 **같은 now** 로 한 번씩
//     (브라우저 rAF 규약 그대로 · 그 사이 새로 선 콜백은 다음 프레임) · now += 16.667.
//   · 토글 전엔 한 프레임도 안 돈다 → 시계 원점이 판마다 같다.
//   · 마감은 실시간이 아니라 **"시계가 섰나"** — `lifeOn` 이 꺼졌거나 생활 시계(`lifeLoop`)가 다음 프레임 줄에 없으면 던진다.
//     콜백이 던지면 그 예외가 하네스까지 그대로 올라온다(종전엔 pageerror 로 찍히고 시계만 섰다).
//
// 페이지 안 이름: `__step()` 한 프레임 · `__tick()` 한 프레임 + 시계 정지 검사(→ 프레임 번호) ·
//                 `__untilDay(d)` 랩 날 d 의 **첫 프레임**까지(→ 프레임 번호) · `__frame()` · `__vt()`(가상 ms)
//
// ★사본 금지 — 랩 하네스가 각자 세우면 그게 사본이다. 여기 한 자리에 둔다
//   (`fixture-clock` 과 같은 규약 — `test-*`·`e2e-*` 이름을 안 써서 러너·린트가 하네스로 안 센다).
//   쓰는 곳: `test-lab-psite` · `test-lab-mining` · `test-lab-market`.
'use strict';

const FRAME_MS = 16.667;    // 한 프레임의 가상 시간(종전 래퍼의 그 수)

/** 적재 **전에** 심는 글(`page.addInitScript`) — `prng` = mulberry32 씨(글자 · 예 `'0x9e3779b9'`) */
const init = (prng) => `
(() => {
  let s = ${prng};
  Math.random = function(){ s|=0; s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  let vt = 0, n = 0;
  const Q = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { Q.push(cb); return Q.length; };
  window.__step = () => { const q = Q.splice(0); vt += ${FRAME_MS}; n++; for (const cb of q) cb(vt); };
  window.__tick = () => {
    window.__step();
    if (!lifeOn || Q.indexOf(lifeLoop) < 0) throw new Error('시계 정지 — 생활 시계가 다음 프레임 줄에 없다 · day ' + VILS[0].day + ' · 프레임 ' + n);
    return n;
  };
  window.__untilDay = (d) => { while (VILS[0].day < d) window.__tick(); return n; };
  window.__frame = () => n;
  window.__vt = () => vt;
})();
`;

/** 랩 날 d 의 첫 프레임까지 민다 — 돌려주는 값 = 그 프레임 번호 */
const untilDay = (page, d) => page.evaluate((x) => window.__untilDay(x), d);

module.exports = { FRAME_MS, init, untilDay };
