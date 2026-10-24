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

// ★[T799 → T830 2026-10-21] 헤드리스 칠하기 끔 · 프레임 지문 — 랩 하네스 둘(`test-lab-mining` · `test-lab-psite`)이 같이 쓴다(사본 금지 · 여기 한 자리).
//   실측(T799 CDP 프로파일 · 하루 726 프레임 ≈ 35~39초): `lifeLoop → draw()` 가 92.6% · 그중 캔버스 **그리기 호출**(fillRect 57.1% 외)이 과반.
//   ★끄는 것 = 캔버스 2D 의 **그리기 호출만**(픽셀을 칠하는 네이티브 메서드 → 빈 함수). draw() 의 JS 는 그대로 돈다 —
//     draw 가 상태를 건드리는 곳(`roadLevel` 렌더 조회 = 게으른 감쇠·Set 프룬 · `life/V` 초점 복원 · 마을 렌더 순회)이 있어서
//     draw 를 통째로 빼면 궤적이 갈릴 수 있다. 랩은 캔버스를 **읽지 않는다**(getImageData·toDataURL·isPointInPath·measureText 0곳)
//     → 픽셀을 안 칠해도 JS 가 보는 값은 같다. 증명 = `fp`(날마다 프레임 지문)가 `LAB_RENDER=1`(칠함) 판과 바이트 같음.
//   시계(위 `init`)는 무접촉 · 새 수 0. `LAB_RENDER=1` = 종전 판(칠함) 그대로.
const RENDER = process.env.LAB_RENDER === '1';
const NO_PAINT = `
(() => {
  const P = CanvasRenderingContext2D.prototype, nop = function () {};
  for (const k of ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage', 'putImageData', 'clip'])
    if (typeof P[k] === 'function') P[k] = nop;
})();
`;
/** 적재 **전에** 심는다(`init` 다음) — `LAB_RENDER=1` 이면 아무것도 안 한다 */
const noPaint = async (page) => { if (!RENDER) await page.addInitScript(NO_PAINT); };
//   ★[T909 · T684 회부 4] 적재 — 랩 파일 적재에도 벽시계 마감이 남아 있었다(`page.goto` 기본 30초 · 부하 걸린 상자에서 측정 전에 죽었다).
//     시계 정본 규약 그대로 마감을 없앤다(`timeout: 0` = 끔 · 수 없음). 적재가 끝났는지는 뒤의 `waitForFunction`(랩 함수가 섰나)이 본다.
const gotoLab = (page, url) => page.goto(url, { timeout: 0 });
const paintTag = () => (RENDER ? '칠함' : '칠하기 끔');

// 프레임 지문 — 지금 프레임의 세계를 글로 펴 FNV-1a 32비트. 숫자는 String() 전 자리(부동소수 끝자리까지).
//   마을 전부: 날 · 인구 · 주민(px·py·job·state·_mp·work) · 광맥 재고(셀별) · 집(built·builtFloors·player) · econ.land(ore·stone·size)·counts
//   + 가상시계 · 프레임 번호. 읽기만 한다(세계 무접촉).
const FP = () => {
  let h = 0x811c9dc5;
  const add = (x) => { const t = String(x); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= 124; h = Math.imul(h, 0x01000193) >>> 0; };
  add(window.__frame()); add(window.__vt());
  for (const v of VILS) {
    add(v.day); add(v.pop); add(v.agents.length);
    for (const a of v.agents) { add(a.px); add(a.py); add(a.job); add(a.state); add(a._mp); add(a.work ? a.work.cx + ',' + a.work.cy : '-'); }
    if (v.oreRich) for (const [k, r] of v.oreRich) { add(k); add(r); }
    if (v.houses) for (const q of v.houses) { add(q.cx + ',' + q.cy); add(q.built); add(q.builtFloors); add(q.player ? 1 : 0); }
    if (v.econ) { add(v.econ.land.ore); add(v.econ.land.stone); add(v.econ.land.size); add(JSON.stringify(v.econ.counts || {})); }
  }
  return ('00000000' + h.toString(16)).slice(-8);
};
/** 지금 프레임의 지문(8자) */
const fp = (page) => page.evaluate(FP);
/** 날별 지문 목록을 한 번 더 접은 값(8자) */
const fold = (list) => { let h = 0x811c9dc5; for (const c of list.join('/')) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); };

module.exports = { FRAME_MS, init, untilDay, noPaint, gotoLab, paintTag, fp, fold };
