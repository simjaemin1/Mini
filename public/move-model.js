// =============================================================================
// public/move-model.js — **플레이어 이동 모델 정본**(서버·클라 공용) [재민 확정 2026-08-30]
//
// ★★사본 금지. 서버는 `require('../public/move-model.js')` 로 **이 파일 자체**를 읽고,
//   클라는 `<script src="move-model.js">` 로 **같은 파일**을 읽는다.
//   `soil-base.js` 가 세운 그 규약이다. 왜 이게 급소인가:
//     이동 적분이 두 벌이면 서버 권위와 클라 예측이 **매 틱 몇 px씩 갈라지고**,
//     리컨실리에이션이 그 차이를 매 틱 되돌린다 = **캐릭터가 떤다**(러버밴딩).
//     legacy 시절에도 두 벌이었고(zone.js 7409 · client.js 7310) 두 곳의 곱셈 순서가
//     달라 마지막 ULP 가 어긋났다. 가속 모델은 상태(속도)를 들고 다니므로 그 어긋남이
//     **누적**된다 — 두 벌이면 반드시 터진다. ⇒ 한 함수로 못 박는다.
//
// ★★이동을 고치려면 **이 파일만** 고쳐라. zone.js·client.js 는 이 함수를 부르기만 한다.
//
// 좌표·단위: px, 초. 속도는 px/s. dt 는 초.
//   콜라이더(벽·나무·지형)는 **호출자의 몫**이다 — 이 모듈은 위치를 모른다.
//   이 모듈이 내는 것은 "이 스텝의 속도"와 "이 스텝의 위치 델타(dx,dy)" 둘뿐이고,
//   호출자가 그 델타를 자기 콜라이더에 통과시킨다(서버·클라의 콜라이더 미러는 종전 그대로).
//
// === 모델 ===
//   legacy : 종전과 동일. 입력 → **즉시** 최고속. 상태 없음. (기본값)
//   accel  : 속도 벡터에 등가속/등감속. 방향 전환은 벡터 가속이 자연히 부드럽게 한다.
//            ★별도 각가속도 상태 없음(재민 확정 — 8방향 스프라이트에선 벡터 회전으로 충분).
//
// === 적분 ===
//   세미-임플리싯 오일러: **속도를 먼저** 갱신하고, 그 새 속도로 위치를 옮긴다.
//   dt 는 인자다 — 프레임레이트 상수를 이 파일 어디에도 쓰지 마라.
//   (속도는 고정 입력에서 dt 불변이 **정확**하다. 위치는 램프 구간에서만 a·dt²/4 만큼
//    스텝 크기에 따라 갈리는데, 램프가 끝나면 더 안 벌어진다. `test-move` ① 이 그 상한을 못 박는다.)
// =============================================================================
(function (root) {
  'use strict';

  // === 손잡이 정본 ===
  //   서버는 env 로 읽어 `paramsFrom()` 에 넘기고, 그 표를 그대로 클라에 실어 보낸다
  //   (`welcome.moveCfg`). 클라가 자기 기본값을 들고 있으면 그게 곧 두 번째 사본이다.
  var DEFAULTS = {
    model: 'legacy',      // MOVE_MODEL=legacy|accel
    baseSpeed: 64,        // MOVE_SPEED (px/s) — 정본은 zone.js. 여기 값은 fallback 일 뿐
    sprintMult: 2.5,      // SPRINT_MULT
    accelT: 0.20,         // MOVE_ACCEL_T  — 0 → (현재)최고속 도달 초
    decelT: 0.15,         // MOVE_DECEL_T  — 키 뗌 → 정지 초
    aimSpeedFrac: 0.45,   // MOVE_AIM_SPEED_FRAC — 조준 중 이속 배율
  };

  function paramsFrom(src) {
    var s = src || {};
    return {
      model: (s.model === 'accel') ? 'accel' : 'legacy',
      baseSpeed: num(s.baseSpeed, DEFAULTS.baseSpeed),
      sprintMult: num(s.sprintMult, DEFAULTS.sprintMult),
      accelT: Math.max(1e-4, num(s.accelT, DEFAULTS.accelT)),
      decelT: Math.max(1e-4, num(s.decelT, DEFAULTS.decelT)),
      aimSpeedFrac: num(s.aimSpeedFrac, DEFAULTS.aimSpeedFrac),
    };
  }
  function num(v, d) { var n = (typeof v === 'number') ? v : parseFloat(v); return (isFinite(n)) ? n : d; }

  // === 배율 한 곳 ===
  //   ★종전엔 "최고속에만" 곱했다. 가속 모델에선 **가속에도** 같은 배율이 곱해진다 —
  //     무거우면 출발이 굼뜨다. 무게가 몸이 된다.
  //   ★곱셈 순서는 **서버 legacy 식과 글자 그대로 같다**(zone.js 옛 7409줄):
  //       (w/len) * BASE * min(1,hyp) * spMult * bodyMult
  //     클라 옛 식은 `w * (BASE*sp*body)` 라 마지막 ULP 가 서버와 달랐다. 이제 둘 다 이 줄을 쓴다.
  function maxSpeedOf(P, sprint, bodyMult, aim) {
    var m = P.baseSpeed * (sprint ? P.sprintMult : 1) * bodyMult;
    if (aim) m = m * P.aimSpeedFrac;
    return m;
  }

  // === 한 스텝 ===
  //   state : { vx, vy }  — accel 모드에서만 의미가 있다(호출자가 보관·복원한다)
  //   input : { wx, wy, sprint, bodyMult, aim }   wx,wy 는 **정규화된 월드 방향**(정지=0,0)
  //   dt    : 초
  //   반환  : { vx, vy, dx, dy }  — dx,dy 는 콜라이더 **통과 전** 위치 델타
  function stepMove(state, input, dt, params) {
    var P = params || DEFAULTS;
    var wx = num(input && input.wx, 0), wy = num(input && input.wy, 0);
    var bodyMult = num(input && input.bodyMult, 1);
    var sprint = !!(input && input.sprint), aim = !!(input && input.aim);
    var hyp = Math.hypot(wx, wy), len = hyp || 1;
    var vmax = maxSpeedOf(P, sprint, bodyMult, aim);

    if (P.model !== 'accel') {
      // --- legacy: 입력이 곧 속도. 상태 없음(서버 옛 식과 **비트 동일**) ---
      var lvx = (wx / len) * P.baseSpeed * Math.min(1, hyp) * (sprint ? P.sprintMult : 1) * bodyMult;
      var lvy = (wy / len) * P.baseSpeed * Math.min(1, hyp) * (sprint ? P.sprintMult : 1) * bodyMult;
      if (aim) { lvx = lvx * P.aimSpeedFrac; lvy = lvy * P.aimSpeedFrac; }
      return { vx: lvx, vy: lvy, dx: lvx * dt, dy: lvy * dt };
    }

    // --- accel: 목표 속도로 **등가속** 접근 ---
    var vx = num(state && state.vx, 0), vy = num(state && state.vy, 0);
    var tvx = (wx / len) * vmax * Math.min(1, hyp);
    var tvy = (wy / len) * vmax * Math.min(1, hyp);
    var stopping = (wx === 0 && wy === 0);
    // ★가속도에도 배율이 산다: vmax 가 bodyMult 를 품고 있으므로 rate 가 함께 줄어든다.
    var rate = vmax / (stopping ? P.decelT : P.accelT);
    var dvx = tvx - vx, dvy = tvy - vy;
    var d = Math.hypot(dvx, dvy);
    var step = rate * dt;
    if (d <= step || d === 0) { vx = tvx; vy = tvy; }          // 도달 — 넘어서지 않는다
    else { vx += (dvx / d) * step; vy += (dvy / d) * step; }    // 벡터 가속(급반전도 이 한 줄이 처리)
    return { vx: vx, vy: vy, dx: vx * dt, dy: vy * dt };        // 세미-임플리싯: 새 속도로 옮긴다
  }

  // === 서버 검증용 — 이 모델이 한 스텝에 낼 수 있는 **최대 이동 px** ===
  //   스피드핵 경계. accel 이라고 legacy 보다 커지지 않는다(최고속이 상한이므로) —
  //   그래도 "모델이 허용하는 최대 + 여유"라는 계약을 한 곳에 둔다.
  function maxStepPx(params, dt, bodyMultMax) {
    var P = params || DEFAULTS;
    var vmax = P.baseSpeed * P.sprintMult * num(bodyMultMax, 1);
    return vmax * dt;
  }

  var API = {
    DEFAULTS: DEFAULTS,
    paramsFrom: paramsFrom,
    maxSpeedOf: maxSpeedOf,
    stepMove: stepMove,
    maxStepPx: maxStepPx,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MoveModel = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
