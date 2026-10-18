'use strict';
// (@regress 없음 — 러너 밖 · T732 자 · 제품 무접촉 · 판정 0)
// === scripts/t732-freeze-hook.js — 켬 판에서 "지난 시간"만 빼고 보는 자: 존이 실리면 그 날을 얼린다 ===================
//
// ★왜 [T732 ⑤] 순간 열쇠는 "같은 날 = 나이 0"을 깬다 — 오늘 얻은 것도 지난 시간만큼 늙고, 픽스처 레코드 `t: 오늘` 은 그 날 0시다.
//   그래서 날 정수를 단언한 하네스가 켬 판에서 갈린다. 그 갈림이 **시간이 흐른 몫뿐인지**(버그가 아닌지)를 가르려고,
//   존 모듈이 실리는 순간 존 날을 얼린다(`__e2eFreezeZoneDay(true)` — 제품의 테스트 문 그대로 · 순간 시계가 그 날 0시에 선다).
//   얼린 판에서 켬 = 끔이면 갈림은 지난 시간 몫이다. 세계 · 제품은 한 글자도 안 바꾼다(문을 부를 뿐).
//
// 쓰는 법: NODE_OPTIONS="--require ./scripts/t732-freeze-hook.js" node scripts/test-food-sick.js   (★[T778] 순간 로트 켬 기본 — 끔 판은 `T732_MOMENT_LOT=0`)
//   (하위 실행이 env 를 물려받으면 아이 존도 얼린다.)
const Module = require('module');
const path = require('path');
const ZONE = path.join(__dirname, '..', 'server', 'zone.js');
const orig = Module.prototype.require;
let done = false;
Module.prototype.require = function (id) {
  const m = orig.apply(this, arguments);
  if (!done) {
    let abs = null; try { abs = Module._resolveFilename(id, this); } catch (e) { abs = null; }
    if (abs === ZONE && m && typeof m.__testBind === 'function') {
      done = true;
      try { m.__testBind().__e2eFreezeZoneDay(true); } catch (e) {}
    }
  }
  return m;
};
