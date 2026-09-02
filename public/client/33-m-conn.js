// @@split:33-m-conn — M/N — primary 재연결 백오프·연결 상태 변수·서버 보정 리컨실리에이션·orphan 감지 (T51 ②)
  // === Primary WS가 죽으면 자동 재연결 (predicted 위치 그대로) ===
  // ★★[접속 진단 배치 2026-08-30] **백오프.** 종전엔 매 프레임 즉시 재연결이라,
  //   서버가 계속 실패하는 동안 15초마다 붙었다 끊었다를 **영원히** 반복했다(실기 로그 그대로).
  //   그건 서버에도 부담이고, 화면엔 아무 말도 안 나와 사용자에겐 그냥 멈춘 게임이다.
  //   ⇒ 시도 간격을 늘린다(1·2·4·8·15초 상한). 자동 회복은 그대로 살아 있다 — 느려질 뿐이다.
  //   ⇒ 확정 오류(`conn_error`)면 처음부터 상한 간격 — 같은 오류를 빨리 반복해 봐야 소용없다.
  function _reconnectDelayMs() {
    if (connPhase === 'error') return 15000;
    const n = Math.max(0, connAttempts - 1);
    return Math.min(15000, 1000 * Math.pow(2, n));
  }
  function ensurePrimaryConnection() {
    if (kicked) return;
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState <= 1) return;
    const pm = zonesMeta[primaryZoneId];
    if (!pm) return;
    const now = performance.now();
    if (_reconnAt && now - _reconnAt < _reconnectDelayMs()) return;
    _reconnAt = now;
    // ★유령 클라 fix: 옛 소켓을 확실히 닫고 지운다(닫지 않고 지우면 잔여 메시지가 새 conn으로 샌다).
    if (c) { try { c.ws.close(); } catch (e) {} conns.delete(primaryZoneId); }
    // 재연결 = 서버가 새 pid로 스폰(좌표 인자는 서버가 쓰지 않음) → 옛 pid는 즉시 폐기하고
    // 위치는 welcome 앵커만을 정본으로 삼는다.
    myPid = null;
    _selfGone = true;
    const localX = myAbsPredicted.x - pm.worldOffsetX;
    const localY = myAbsPredicted.y - (pm.worldOffsetY || 0);
    console.warn('[recover] primary 재연결', primaryZoneId);
    connect(primaryZoneId, 'primary', { x: localX, y: localY, inventory });
  }

  // === 경계에서 멈춤 감지 → 강제 핸드오프 ===
  // 진짜 stuck인 경우에만 (서버 핸드오프 메시지 손실 같은 케이스)
  // 핸드오프 직후 1.5초간은 비활성 (정상 cooldown)
  let lastTickWithMyPidAt = 0;
  let initialWelcomeReceived = false;
  let worldWidth = 2048;
  let worldHeight = 2048;
  let lastRttMs = 0;
  // 부드러운 서버 보정 — snap 대신 150ms에 걸쳐 lerp
  let correctionVel = { x: 0, y: 0 };
  let correctionUntil = 0;
  let correctionIgnoreWall = false; // 벽 사이 갈림 보정 — 벽 무시하고 부드럽게 슬라이드(권위 위치는 항상 유효)
  // kicked 상태에선 자동 재연결 안 함
  let kicked = false;
  // loop/setupChat 중복 시작 방지
  let loopStarted = false;
  let chatSetup = false;

  // === 서버 권위 좌표 → 클라 예측 리컨실리에이션 (input replay) ===
  // Gabriel Gambetta 모델: 서버 권위 self pos + ackSeq 받으면
  //   1) myAbsPredicted 를 권위 위치에 anchor
  //   2) ack 된(seq <= ackSeq) 입력은 pendingInputs 에서 drop
  //   3) 남은 미ack 입력을 predictStep 으로 replay → 드리프트 없이 재현된 예측 위치
  // predictStep 이 서버 per-tick move 와 동일하므로 replay 결과 == 서버가 곧 도달할 위치.
  // 매 tick anchor+replay 라 어긋남이 누적되지 않음 → 벽에서 스턱/슬립 없음.
  // 옛 correctionVel/Until/IgnoreWall lerp 머신은 리컨실리에이션이 완전 대체 — 항상 0/false 로 비워둠.
  // ★★[이동 모델 2026-08-30] **보정은 위치+속도 한 쌍이다.**
  //   가속 모델에서 속도는 상태다 — 위치만 스냅하면 스냅 직후 두 적분 곡선이 다시 벌어져
  //   보정이 영원히 반복된다(그게 곧 떨림). 서버가 tick.selfVx/selfVy 로 짝을 보낸다.
  //   legacy 에선 서버가 안 보내고 여기서도 안 쓴다(속도가 입력의 함수 = 상태 없음).
  function applyServerCorrection(absX, absY, ackSeq, srvVx, srvVy) {
    const ex = absX - myAbsPredicted.x, ey = absY - myAbsPredicted.y;
    const dist = Math.hypot(ex, ey);
    window.__corrN = (window.__corrN | 0) + 1; window.__corrLast = Math.round(dist);   // 진단 훅(읽기 전용)
    // === 러버밴딩 계측 (기본 OFF — window._desyncDbg=true로 켬) ===
    if (dist > 48 && window._desyncDbg === true) {
      const wallBetween = clientIsBlockedByWall(absX, absY, myAbsPredicted.x, myAbsPredicted.y, myFloor);
      const pc = clCellOf(myAbsPredicted.x, myAbsPredicted.y);
      const sc = clCellOf(absX, absY);
      const stair = clFindStairForCell(pc.cx, pc.cy) ? 1 : 0;
      console.log(`[desync] dist=${dist.toFixed(0)} pred=${pc.cx},${pc.cy}(${myAbsPredicted.x.toFixed(0)},${myAbsPredicted.y.toFixed(0)}) srv=${sc.cx},${sc.cy} f${myFloor} stairCell=${stair} wallBetween=${wallBetween?1:0}`);
    }
    // lerp 머신은 항상 비활성 (리컨실리에이션이 대체)
    correctionVel = { x: 0, y: 0 };
    correctionUntil = 0;
    correctionIgnoreWall = false;
    const ack = (typeof ackSeq === 'number') ? ackSeq : 0;
    // Edge guard: 권위와의 차이가 거대(존 핸드오프/텔포)면 replay 하지 않고 즉시 snap + 입력 비움.
    if (dist > 2000) {
      myAbsPredicted = { x: absX, y: absY };
      pendingInputs.length = 0;
      myVel.vx = 0; myVel.vy = 0;   // 텔포/핸드오프 — 관성도 함께 끊는다
      // 텔포 — 렌더 보간 앵커도 즉시 권위로 (카메라가 텔포 구간을 lerp 하지 않게)
      _renderPrev = { x: absX, y: absY };
      _renderCurr = { x: absX, y: absY };
      myAbsRender = { x: absX, y: absY };
      _predAccum = 0;
      return;
    }
    // 1) 권위에 anchor — 위치**와 속도** 둘 다
    myAbsPredicted = { x: absX, y: absY };
    if (typeof srvVx === 'number' && typeof srvVy === 'number') { myVel.vx = srvVx; myVel.vy = srvVy; }
    // 2) ack 된 입력 drop
    while (pendingInputs.length && pendingInputs[0].seq <= ack) pendingInputs.shift();
    // 3) 남은 미ack 입력 replay (각 입력의 sprint/aim 상태로 — 속도 재현)
    for (const ip of pendingInputs) predictStep(PRED_STEP, ip.wx, ip.wy, ip.sprint, ip.aim);
  }

  // === Orphan 감지 — 서버에서 내 플레이어가 사라졌는데 클라는 모르는 경우 ===
  // 2초간 내 pid가 tick에 안 들어오면 primary 재연결
  function checkOrphan() {
    if (!primaryZoneId || lastTickWithMyPidAt === 0) return;
    if (performance.now() - lastTickWithMyPidAt > 2000) {
      console.warn('[recover] 내 pid가 2초간 tick에 없음 - primary 재연결');
      // ★유령 클라 fix: 서버에 내 실체가 없다고 판정된 순간부터 예측 정지 + pid 폐기.
      //   (옛 코드는 재연결 동안에도 옛 좌표로 계속 전진해서 welcome 앵커와 실좌표 괴리가 커졌다.)
      _selfGone = true;
      myPid = null;
      pendingInputs.length = 0;
      myVel.vx = 0; myVel.vy = 0;   // ★관성도 끊는다(유령 클라 복구)
      _predAccum = 0;
      lastTickWithMyPidAt = 0; // 0으로 리셋 — 재연결 WS가 첫 틱 받을 때까지 orphan 검사 비활성. now()로 두면 느린 연결(사파리/Private Relay)에서 establishing 중인 WS를 2초마다 죽여 무한루프가 됨.
      if (conns.has(primaryZoneId)) closeConnection(primaryZoneId);
      // ensurePrimaryConnection이 다음 프레임에 재연결
    }
  }
  // checkStuckAtEdge 제거됨 — 서버 권위 + HTTP 핸드오프로 신뢰성 확보

