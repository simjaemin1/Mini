// === scripts/t498-probe.js — 핸드오프 벽시계(출발 존) · 계측 예비 적재 · 러너 밖 (T498 ③) =====================
//   `NODE_OPTIONS=--require ./scripts/t498-probe.js` — zone.js 원문 **뒤에** 겉옷 하나를 덧붙여 컴파일한다(t432/t453 문법 · 동작 0).
//   `fireHandoff` 를 부르는 순간 → 끝나는 순간(= 클라에 'handoff' 를 보낸 뒤 · ACK 는 안 기다리는 함수다) ms 를 한 줄로 찍는다.
//   그 안에 든 것: [끔] central 저장 await + handoff_prepare await · [켬] handoff_prepare await 만.
'use strict';
const Module = require('module');
const path = require('path');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(path.join('server', 'zone.js'))) content += `
;(function () {
  const _f = fireHandoff;
  fireHandoff = async function (player, targetZoneId) {
    const t0 = performance.now(), was = !!(player && player.handingOff);
    try { return await _f.apply(this, arguments); }
    finally { if (!was && player && player.handingOff) console.log('[t498] fire→handoff ' + ZONE_ID + '→' + targetZoneId + ' ' + (performance.now() - t0).toFixed(1) + 'ms · 팔 ' + (process.env.T498_HANDOFF_PAYLOAD === '1' ? '켬' : '끔')); }
  };
})();
`;
  return _compile.call(this, content, filename);
};
