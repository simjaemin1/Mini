// (러너 밖 · T653 자 — 혼돈 바닥 재기 · 하네스 쪽 훅 · 제품 무접촉)
// =============================================================================
// `node -r ./scripts/t653-nudge.js -r ./scripts/t653-probe.js scripts/t525-cross-zone.js two hanbando nippon 800 <씨>`
//   T653_NUDGE_DAY=<d> 이면 econ 하루 틱(`economy-sim-v2.tickWorldV2`) d 번째 뒤에 존 모든 마을 곳간의 모든 칸을 한 번 ×(1+1e-7) 한다.
//   물리로는 0 인 흔들기(천만분의 일) — 이 흔들기 하나로 800 일 뒤 존 인구가 얼마나 갈라지는지가 "손잡이 없이도 생기는 차"(혼돈 바닥)다.
//   T653_NUDGE_DAY 가 없으면 아무것도 안 한다(바이트 그대로).
// =============================================================================
'use strict';
const D = parseInt(process.env.T653_NUDGE_DAY || '', 10);
if (D > 0) {
  const path = require('path');
  const V2 = require(path.join(process.cwd(), 'sim', 'economy-sim-v2'));
  const orig = V2.tickWorldV2;
  let day = 0;
  V2.tickWorldV2 = function (w) {
    const r = orig.apply(this, arguments);
    day++;
    if (day === D) for (const v of (w.villages || [])) if (v && v.storage) for (const k of Object.keys(v.storage)) if (v.storage[k] > 0) v.storage[k] *= 1 + 1e-7;
    return r;
  };
}
