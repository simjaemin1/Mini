'use strict';
// === scripts/slicer-day-stop.js — `test-tick-slicer` 팔을 **같은 날에 세운다**(존에 `--require` 로 싣는다 · 제품 무접촉) [T665 · 2026-10-05] =====
//
// ★왜: ⑧ 은 팔 둘의 마을 행(`villages.econ_state`)을 **같은 날끼리만** 견준다. 종전엔 `econTick.days ≥ DAYS` 를 본 뒤 하루 둘을 더 흘리고
//   끝냈다 — 저장은 하루 마감 뒤 1마을/틱으로 배수되고 그 사이 다음 날이 또 열리니, 끄는 순간 팔마다 "어느 마을이 몇 일 치로 저장됐나"가
//   벽시계로 갈렸다. 그래서 같은 날 마을이 0~4곳만 남는 판이 생겼다(전제 빨강 · 실측 T665 §②).
// ★어떻게: 마을 모듈이 적재되면 존이 매 프레임 부르는 `onGameTick` 을 감싸 econ 날을 본다 — `SLICER_STOP_AT`(씨앗 날 + DAYS · 하네스가 준다 · 없으면 부팅 날 + `SLICER_STOP_DAYS`)에 닿으면 마을 시뮬 날을 **얼린다**
//   (`villages.__e2eDayFreeze(true)` — `e2e-trade` 가 쓰는 그 시험 문 · 새 날을 안 연다 · 그날 마감과 저장 배수는 끝까지 간다).
//   그러면 모든 팔이 같은 날에서 멎고, 하네스는 마을 행이 다 그날로 저장될 때까지 기다렸다 끈다.
const Module = require('module');
const N = parseInt(process.env.SLICER_STOP_DAYS || '', 10);
const AT = parseInt(process.env.SLICER_STOP_AT || '', 10);   // 절대 날(씨앗 날 + DAYS) — 있으면 이것(부팅 날을 늦게 읽어 하루 밀리는 경합이 없다)
const _load = Module._load;
let hooked = false;
Module._load = function (request) {
  const m = _load.apply(this, arguments);
  if (!hooked && ((Number.isFinite(N) && N > 0) || Number.isFinite(AT)) && /[\\/]villages(\.js)?$/.test(String(request)) && m && typeof m.__e2eDayFreeze === 'function' && typeof m.__p3Bind === 'function') {
    hooked = true;
    //   ★[T665] 200ms 타이머로 보면 **조각 0 팔(base · base2)이 하루씩 넘쳤다** — 조각 0 은 마감을 한 프레임에 다 하고, 그 마감이 하루(5초)보다 길면
    //   바로 다음 프레임이 그다음 날을 연다(타이머가 끼기 전). ⇒ 존이 매 프레임 부르는 `onGameTick` 을 감싸 **부르기 직전**에 본다:
    //   econ 날이 목표에 닿았으면 얼린다 — 얼림 검사는 그 함수 안에서 마감 조각이 다 빠진 뒤·새 날을 열기 전에 있으니 목표 + 1 일은 열릴 수 없다.
    let d0 = null, done = false, st = null;
    const _tick = m.onGameTick;
    m.onGameTick = function (now) {
      if (!done) {
        if (!st) { try { st = m.__p3Bind({}).state; } catch (e) {} }   // 같은 state 객체 — 한 번만 잡는다
        if (st && st.ready && st.world) {
          if (d0 == null) d0 = st.world.day;
          const target = Number.isFinite(AT) ? AT : d0 + N;
          if (st.world.day >= target && !st.dayFreeze) { m.__e2eDayFreeze(true); done = true; console.log(`[slicer-day-stop] 날 얼림 — world.day ${st.world.day} · 목표 ${target}`); }
        }
      }
      return _tick.apply(this, arguments);
    };
  }
  return m;
};
