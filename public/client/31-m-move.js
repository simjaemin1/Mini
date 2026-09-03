// @@split:31-m-move — M 이동입력 — 입력·예측

  // === 인접 존 자동 구독/해제 ===
  // 시야 반경(VIEW_RADIUS=650) + 여유 = 800. 시야에 들어오기 전에 미리 구독.
  const PEEK_THRESHOLD = 900;  // 이웃 zone 경계에서 이만큼 안쪽에 있으면 observer 미리 연결
  function manageNeighborSubscriptions() {
    if (!primaryZoneId) return;
    const pmeta = zonesMeta[primaryZoneId];
    if (!pmeta) return;
    const pMeta = zonesMeta[primaryZoneId];
    const zoneW = pMeta?.zoneWidth || 100000, zoneH = pMeta?.zoneHeight || 100000;
    const localX = myAbsPredicted.x - pmeta.worldOffsetX;
    const localY = myAbsPredicted.y - (pmeta.worldOffsetY || 0);
    // Phase 5-G fix: player 위치 초기화 안 됨 (myAbsPredicted=0,0 → localXY 음수) → 모든 인접 zone에 storm connect
    // primary zone 안이 아닌 경우 (localXY 음수 또는 zone 밖) skip
    if (!isFinite(localX) || !isFinite(localY)) return;
    if (localX < 0 || localY < 0 || localX > zoneW || localY > zoneH) return;
    // 4방향 이웃 거리 계산
    const dirs = [
      { id: pmeta.east,  d: zoneW - localX },
      { id: pmeta.west,  d: localX },
      { id: pmeta.south, d: zoneH - localY },
      { id: pmeta.north, d: localY },
    ];
    for (const { id, d } of dirs) {
      if (!id) continue;
      if (d < PEEK_THRESHOLD && !conns.has(id)) {
        // Phase 5-G: 최근 close 후 cooldown — storm 방지
        const lastClose = _lastCloseAt.get(id) || 0;
        if (performance.now() - lastClose < RECONNECT_COOLDOWN_MS) continue;
        console.log('[neighbor] connect observer', id, 'd=', d, 'localXY=', myAbsPredicted.x - pmeta.worldOffsetX, myAbsPredicted.y - (pmeta.worldOffsetY || 0));
        connect(id, 'observer', null);
      } else if (d > PEEK_THRESHOLD * 1.6) {
        const c = conns.get(id);
        if (c && c.role === 'observer') closeConnection(id);
      }
    }
    // 멀리 떨어진 옛 observer 정리 (zone 중심과 거리)
    // 14.46-b-smooth-fix2: zone마다 크기 다름. 이웃 zone 자기 크기 기준으로 임계 계산.
    // 옛 코드는 primary zoneW 기준이라, 큰 이웃 zone은 매 프레임 open→close 사이클 도는 버그.
    for (const [zid, c] of conns) {
      if (zid === primaryZoneId) continue;
      const zm = zonesMeta[zid];
      if (!zm) continue;
      const nZoneW = zm.zoneWidth || 100000;
      const nZoneH = zm.zoneHeight || 100000;
      // 이웃 zone의 가장 가까운 변(엣지)까지 거리
      const edgeDistX = Math.max(0, Math.max(zm.worldOffsetX - myAbsPredicted.x, myAbsPredicted.x - (zm.worldOffsetX + nZoneW)));
      const edgeDistY = Math.max(0, Math.max((zm.worldOffsetY || 0) - myAbsPredicted.y, myAbsPredicted.y - ((zm.worldOffsetY || 0) + nZoneH)));
      const edgeDist = Math.hypot(edgeDistX, edgeDistY);
      // 이웃 zone 엣지에서 PEEK_THRESHOLD*1.6 이상 멀어졌으면 정리 (직접 이웃 hysteresis와 일치)
      if (edgeDist > PEEK_THRESHOLD * 1.6) closeConnection(zid);
    }
  }

  // === WASD = 화면 기준, 키 매핑은 45도 회전 (8방향 대각선 = 월드 cardinal) ===
  // W 단독: NW (-0.71, -0.71) → 화면 정 위
  // D 단독: NE (+0.71, -0.71) → 화면 정 오른쪽
  // S 단독: SE (+0.71, +0.71) → 화면 정 아래
  // A 단독: SW (-0.71, +0.71) → 화면 정 왼쪽
  // 두 키 조합: W+A=정서(-1,0), W+D=정북(0,-1), S+D=정동(1,0), S+A=정남(0,1).
  // 결과: 깔끔한 0/0.71/1 값만 나옴 + 속도 벡터와 화면 이동이 1:1.
  function worldKeysDir() {
    const w = keys.has('w') || keys.has('arrowup');
    const s = keys.has('s') || keys.has('arrowdown');
    const a = keys.has('a') || keys.has('arrowleft');
    const d = keys.has('d') || keys.has('arrowright');
    let wx = 0, wy = 0;
    // 각 키를 NW/NE/SE/SW 단위벡터로 더함
    if (w) { wx += -1; wy += -1; }
    if (d) { wx +=  1; wy += -1; }
    if (s) { wx +=  1; wy +=  1; }
    if (a) { wx += -1; wy +=  1; }
    const len = Math.hypot(wx, wy);
    if (len > 0) { wx /= len; wy /= len; }
    return { wx, wy };
  }

  // === 클라 사이드 예측: 고정 스텝(30Hz) + 입력 히스토리 + 서버 리컨실리에이션 ===
  // (Gabriel Gambetta "Fast-Paced Multiplayer" 모델)
  // 한 스텝 = 한 input seq = 서버 한 tick의 이동. predictStep(아래)은 서버 per-tick player move와
  // 수학적으로 동일해야 replay가 서버를 정확히 재현함 (옛 인라인 블록을 그대로 옮긴 것).
  // sendInput/loop/applyServerCorrection 보다 먼저 선언 — TDZ 회피.
  let _predAccum = 0;
  const PRED_STEP = 1 / 30;           // 서버 TICK_HZ=30 과 동일
  // ★★[이동 모델 2026-08-30] 적분은 **공유 모듈 한 곳**(`public/move-model.js`) — 서버 zone.js 가
  //   같은 파일을 require 한다. 이동을 고치려면 그 파일만 고쳐라.
  //   `myVel` 은 **가속 모델의 상태**다. legacy 에선 쓰이지 않는다(속도가 입력의 함수라 상태가 없다).
  let _moveParams = window.MoveModel.paramsFrom({});   // 서버 welcome.moveCfg 가 덮어쓴다
  let myVel = { vx: 0, vy: 0 };
  let inputSeq = 0;
  const pendingInputs = [];           // [{seq, wx, wy, sprint}] — ack 안 된 입력 (replay용)
  // 렌더 보간(60fps): 직전 스텝 위치 ↔ 현재 스텝 위치 사이를 _predAccum 비율로 lerp.
  let _renderPrev = { x: 0, y: 0 };
  let _renderCurr = { x: 0, y: 0 };
  let myAbsRender = { x: 0, y: 0 };   // 카메라/본인 스프라이트가 쓰는 보간 위치
  let _renderReady = false;           // 첫 스텝 전엔 myAbsPredicted 로 fallback

  // === 입력 전송 ===
  let lastInputSentAt = 0;
  // 이동키 down/up 즉시 송신용 — 시작/정지 지연을 줄임.
  // 리컨실리에이션 불변식 유지: "보낸 입력은 모두 seq를 갖고 pendingInputs에 기록되며 predictStep으로 시뮬"됨.
  // 즉시 1 스텝을 처리하고 accumulator에서 그만큼 차감 → 다음 loop while가 중복 적용 안 함.
  // (down 시: 위치 1/30 전진 + 기록. up/idle 시: zero-input → predictStep no-op이라 위치 불변, 기록만.)
  function sendInput() {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    // 다운 중: 기록/시뮬 없이 zero-input만 (서버 정지용). seq 포함.
    if (myIsDown) {
      inputSeq++;
      sendStepInput(inputSeq, 0, 0, false);
      return;
    }
    const { wx, wy } = worldKeysDir();
    const sp = !!mySprint;
    const am = !!_aiming;
    inputSeq++;
    pendingInputs.push({ seq: inputSeq, wx, wy, sprint: sp, aim: am });
    if (pendingInputs.length > 200) pendingInputs.shift();
    sendStepInput(inputSeq, wx, wy, sp, am);
    // 이 즉시 스텝만큼 미리 시뮬 + accumulator 차감 (loop while 중복 방지)
    if (_renderReady) _renderPrev = { x: myAbsPredicted.x, y: myAbsPredicted.y };
    predictStep(PRED_STEP, wx, wy, sp, am);
    if (_renderReady) { _renderCurr = { x: myAbsPredicted.x, y: myAbsPredicted.y }; }
    _predAccum -= PRED_STEP;
    if (_predAccum < 0) _predAccum = 0;
  }

  // Phase 14.41: 근처 다운된 사람 찾기 (RESCUE_RANGE_PX = 80)
  // ★★[T43 2026-09-02 재민 확정 · §12] **길드 제한을 없앴다.** §12 는 *"다른 플레이어"* 라고만 한다 —
  //   낯선 이가 업어 옮기는 것이 이 세계의 구조다. 그리고 이건 **열쇠 통일**이기도 하다:
  //   종전엔 서버가 `tribeId`(숫자)로, 여기가 `tribeName`(문자열)로 판정해 이름이 같고 id 가 다른
  //   두 길드에서 갈렸다(죽음 설계 §0-ⓒ 가 지적한 자리). 이제 **양쪽 다 소속을 안 본다** — 열쇠가 없다.
  function findNearestDownedGuildmate() {
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      if (!c.others) continue;
      for (const o of c.others.values()) {
        if (!downStates.get(o.pid)) continue;
        const ax = (c.meta?.worldOffsetX || 0) + o.x;
        const ay = (c.meta?.worldOffsetY || 0) + o.y;
        const d = Math.hypot(myAbsPredicted.x - ax, myAbsPredicted.y - ay);
        if (d < bestD) { best = o; bestD = d; }
      }
    }
    return best;
  }

  // (예측/리컨실리에이션 상태 변수는 위 sendInput 직전에 선언됨 — TDZ 회피)

  // 고정 스텝 1회 이동 — myAbsPredicted 를 직접 변형.
  // sprint 인자: live는 mySprint, replay는 각 입력의 sprint 상태를 넘김 (속도에 영향).
  function predictStep(dt, wx, wy, sprint, aim) {
    // ★유령 클라 fix: 서버에 내 실체가 없는 동안(_selfGone)은 예측 정지 — 유령이 걸어다니지 않게.
    // ★[정비 배치] `netStalled` 를 `_selfGone` 과 나란히 — 서버 틱이 없는 동안 걸으면 그게 유령이다.
    // ★[이동 모델] 그리고 **예측이 멈추면 관성도 멈춘다** — 서버 input 핸들러의 `isDown → p.vx=0`
    //   미러이자 정지 계약. 재개 첫 틱에 서버 `selfVx/selfVy` 로 다시 앵커된다.
    //   legacy 에선 myVel 이 안 쓰여 무영향(플래그 OFF 회귀 불변).
    if (myIsDown || _selfGone || netStalled) { myVel.vx = 0; myVel.vy = 0; return; }
    // ★legacy: 입력 0 이면 no-op(종전 그대로). accel: 입력 0 은 **감속 스텝**이다 — 빠지면 안 선다.
    const _accel = (_moveParams.model === 'accel');
    // ★[캐릭 시트] legacy 에서도 `myVel` 이 **지금 속도의 진실**이어야 한다 — 애니 상태기계가 이걸 읽는다.
    //   legacy 는 상태가 없으므로(속도=입력의 함수) 여기서 0 을 써도 이동은 한 비트도 안 바뀐다.
    if (!_accel && wx === 0 && wy === 0) { myVel.vx = 0; myVel.vy = 0; return; }
    // ★[3층 재배선] 달리기 판정은 **서버가 준 것 하나**다(사본 금지) — 옛 `myHunger>5 && myThirst>5` 는
    //   허기·갈증이 달리기를 막던 시절의 사본이다. 이제 막는 건 스태미나이고 그 판정은 서버가 한다.
    const canSprintClient = sprint && myCanSprint;

    // ★★[신체 상태 2026-08-26] 몸 상태 배율을 **여기에도** 곱한다. 서버는 `Body.effects().moveMult` 로
    //   같은 값을 쓰고 그 수를 `gauges.body.moveMult` 로 실어 보낸다 —
    //   **안 맞추면 매 틱 보정이 나서 러버밴딩**이 된다(이 줄의 원래 주석이 경고하던 바로 그것).
    //   호환: 아직 안 받았으면 1(=종전과 동일).
    // ★★[무게 배치] 신체 **× 과적**의 합산 배율. 서버 `moveMultOf()` 가 낸 그 수를 그대로 쓴다 —
    //   여기서 둘을 따로 곱하면 바닥(0.35) 규칙이 두 벌이 되고, 그 순간 러버밴딩이다.
    const bodyMult = (myCarry && typeof myCarry.combined === 'number') ? myCarry.combined
                   : ((myBody && typeof myBody.moveMult === 'number') ? myBody.moveMult : 1);
    // ★★적분 — 공유 모듈. 서버 zone.js 가 **같은 함수를 같은 인자로** 부른다.
    const _mv = window.MoveModel.stepMove(
      myVel, { wx: wx, wy: wy, sprint: canSprintClient, bodyMult: bodyMult, aim: !!aim },
      dt, _moveParams);
    myVel.vx = _mv.vx; myVel.vy = _mv.vy;
    let stepVx = _mv.vx, stepVy = _mv.vy;
    // ★★스피드핵 경계 미러(서버 movePlayerStep 과 같은 상한·같은 여유). legacy 에선 걸릴 수 없다.
    {
      const _cap = window.MoveModel.maxStepPx(_moveParams, dt, 1) * 1.25;
      const _mag = Math.hypot(stepVx * dt, stepVy * dt);
      if (_mag > _cap) { const _k = _cap / _mag; stepVx *= _k; stepVy *= _k; }
    }
    // 계단 축 투영 — ★서버는 **속도에** 건다(movePlayerStep 의 stepVx/stepVy). 여기도 같게 맞춘다.
    //   legacy 에선 proj(k·v) = k·proj(v) 이고 dv 성분이 정확히 0/±1 이라 **비트 동일**이다.
    //   accel 에선 다르다: 입력에 걸면 목표속도가 바뀌고 속도에 걸면 실제속도가 바뀐다 ⇒ 서버와 맞춰야 한다.
    //   ★myVel 자체는 투영하지 않는다(서버도 p.vx 를 그대로 둔다 — 지역 사본만 투영).
    {
      const curCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
      const curCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const stairHit = clFindStairForCell(curCx, curCy);
      if (stairHit) {
        const dir = stairHit.stair.data?.dir || 'N';
        const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
                 : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
        const proj = stepVx * dv.x + stepVy * dv.y;
        stepVx = proj * dv.x;
        stepVy = proj * dv.y;
      }
    }
    const speed = 64 * (canSprintClient ? 2.5 : 1) * bodyMult;   // auto-eject 밀어내기 전용(종전 식 보존)
    if (isTerrainBlockedAtAbs(myAbsPredicted.x, myAbsPredicted.y)) {
      let ejX = 0, ejY = 0, found = false;
      for (let r = 32; r <= 32 * 16 && !found; r += 32) {
        for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
          if (!isTerrainBlockedAtAbs(myAbsPredicted.x + d[0] * r, myAbsPredicted.y + d[1] * r)) { ejX = d[0]; ejY = d[1]; found = true; break; }
        }
      }
      if (found) {
        const len = Math.hypot(ejX, ejY) || 1;
        const push = speed * dt * 1.8;
        myAbsPredicted.x += (ejX / len) * push;
        myAbsPredicted.y += (ejY / len) * push;
      }
      myVel.vx = 0; myVel.vy = 0;   // ★서버 movePlayerStep 의 `p.vx=0; p.vy=0; return;` 미러(accel 상태 일치)
    } else {
      let nx = myAbsPredicted.x + stepVx * dt;
      let ny = myAbsPredicted.y + stepVy * dt;
      if (clientIsBlockedByWall(nx, myAbsPredicted.y, myAbsPredicted.x, myAbsPredicted.y, myFloor)) nx = myAbsPredicted.x;
      if (clientIsBlockedByWall(myAbsPredicted.x, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) ny = myAbsPredicted.y;
      if (clientIsBlockedByWall(nx, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      if (myFloor === 0 && (stepVx || stepVy)) {
        const trees = clientNearbyTrees(myAbsPredicted.x, myAbsPredicted.y);
        // ★탈출 밸브(서버 movePlayerStep 미러): 현재 위치가 이미 콜라이더 안이면 차단 해제 — 걸어나올 수 있게
        if (trees && !clientIsBlockedByTree(myAbsPredicted.x, myAbsPredicted.y, trees)) {
          if (clientIsBlockedByTree(nx, myAbsPredicted.y, trees)) nx = myAbsPredicted.x;
          if (clientIsBlockedByTree(myAbsPredicted.x, ny, trees)) ny = myAbsPredicted.y;
          if (clientIsBlockedByTree(nx, ny, trees)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
        }
      }
      if (isTerrainBlockedAtAbs(nx, myAbsPredicted.y)) {
        const tx = Math.floor(myAbsPredicted.x / 32);
        if (nx > myAbsPredicted.x) nx = (tx + 1) * 32 - 1;
        else if (nx < myAbsPredicted.x) nx = tx * 32;
        else nx = myAbsPredicted.x;
      }
      if (isTerrainBlockedAtAbs(myAbsPredicted.x, ny)) {
        const ty = Math.floor(myAbsPredicted.y / 32);
        if (ny > myAbsPredicted.y) ny = (ty + 1) * 32 - 1;
        else if (ny < myAbsPredicted.y) ny = ty * 32;
        else ny = myAbsPredicted.y;
      }
      if (isTerrainBlockedAtAbs(nx, ny)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      myAbsPredicted.x = nx;
      myAbsPredicted.y = ny;
    }
    // 전체 월드 그리드 안으로만 clamp (서버도 동일 — 옛 인라인은 loop 끝에서 했으나 스텝마다 적용해야 replay 일치)
    myAbsPredicted.x = Math.max(0, Math.min(worldWidth - 1, myAbsPredicted.x));
    myAbsPredicted.y = Math.max(0, Math.min(worldHeight - 1, myAbsPredicted.y));
  }

  // 고정 스텝마다 입력 1개를 서버로 전송 (seq 포함). sendInput 의 send 경로 재사용.
  function sendStepInput(seq, wx, wy, sprint, aim) {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    // ★[조준 모드] aim 이 **입력에 실려야** 서버 권위와 클라 예측이 같은 이속을 낸다.
    c.ws.send(JSON.stringify({ type: 'input', seq, vx: wx, vy: wy, sprint: !!sprint, aim: !!aim }));
    lastInputSentAt = performance.now();
  }

  // === 메인 루프 ===
  let prevT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;

    // 입력 전송은 이제 고정 스텝(아래 while)마다 1개씩 — 옛 33ms 게이트 sendInput() 제거.
    // 다운/멈춤일 때만 서버가 멈추도록 주기적 zero-input 전송.

    // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
    // primary zone의 buildings + 이웃 zone들도 검사 (zone 경계 cross 시).
    // wall은 cell edge에 있음 (data.side ∈ {N, E}). cell 가로지를 때만 검사.
    // BUILDING_SIZE = 32 (server와 동일).
    // 인라인 함수 X — 매 프레임 만들기 비싸서 위에 한 번 정의함

    // === 클라이언트 예측: 고정 30Hz 스텝 + 입력 기록/전송 ===
    // 한 스텝 = 한 input seq = 서버 한 tick. predictStep 이 myAbsPredicted 를 변형.
    // 서버 리컨실리에이션(applyServerCorrection)이 매 tick 권위 위치에 anchor 후 미ack 입력을 replay.
    const { wx, wy } = worldKeysDir();
    const moving = !myIsDown && (wx !== 0 || wy !== 0);
    // §4-4 P4: 관전 중(비지휘) 이동 입력 시 자동 복귀. 지휘 중엔 WASD=부대 지휘라 카메라 유지(관전 지속).
    if (_warSpec.active && !_warCmdId && (wx !== 0 || wy !== 0)) stopSpectate();
    _predAccum += dt;                       // dt는 loop에서 이미 0.1 cap
    if (_predAccum > 0.1) _predAccum = 0.1;
    let _stepped = false;
    while (_predAccum >= PRED_STEP) {
      if (!_stepped) { _renderPrev = { x: myAbsPredicted.x, y: myAbsPredicted.y }; _stepped = true; }
      inputSeq++;
      const sp = !!mySprint;
      const am = !!_aiming;
      // 적용 전에 기록 — replay가 그대로 재현하도록.
      pendingInputs.push({ seq: inputSeq, wx, wy, sprint: sp, aim: am });
      if (pendingInputs.length > 200) pendingInputs.shift();
      sendStepInput(inputSeq, wx, wy, sp, am);
      // legacy: moving=false 면 내부 early-return(위치 불변). accel: 감속 스텝으로 들어간다.
      predictStep(PRED_STEP, wx, wy, sp, am);
      _predAccum -= PRED_STEP;
    }
    if (_stepped) {
      _renderCurr = { x: myAbsPredicted.x, y: myAbsPredicted.y };
      _renderReady = true;
    }
    // ★[시설 제작창] 내 곁의 시설을 주기적으로 묻는다(1.2초) — 들어서면 창이 열려야 하니까.
    //   ⚠클라가 시설 목록을 캐시해 두면 그게 곧 낡은 목록이다(거래소가 하루 캐시로 배운 것과 같은 함정).
    if (now - _facAskAt > 1200) { _facAskAt = now; try { sendPrimary({ type: 'facility_ask' }); } catch (e) {} }
    // 멈춤/다운: 스텝이 입력을 안 보내는 구간 — 서버가 멈추도록 주기적 zero-input 전송 (seq 포함).
    if (!moving && (now - lastInputSentAt > 33)) {
      inputSeq++;
      if (_moveParams.model === 'accel') {
        // ★★[이동 모델 2026-08-30] accel 에선 **정지 입력도 감속 스텝**이다.
        //   legacy 에선 이 키프레임을 기록도 시뮬도 안 했다(정지 입력이 위치를 안 바꾸니 무해했다).
        //   가속 모델에선 서버만 한 스텝 더 감속해 **곧바로 갈린다** ⇒ 불변식대로 기록·시뮬한다:
        //   "보낸 입력은 모두 seq 를 갖고 pendingInputs 에 기록되며 predictStep 으로 시뮬된다".
        pendingInputs.push({ seq: inputSeq, wx: 0, wy: 0, sprint: false, aim: !!_aiming });
        if (pendingInputs.length > 200) pendingInputs.shift();
        sendStepInput(inputSeq, 0, 0, false, !!_aiming);
        if (!_stepped) { _renderPrev = { x: myAbsPredicted.x, y: myAbsPredicted.y }; _stepped = true; }
        predictStep(PRED_STEP, 0, 0, false, !!_aiming);
        _renderCurr = { x: myAbsPredicted.x, y: myAbsPredicted.y };
        _renderReady = true;
      } else {
        sendStepInput(inputSeq, 0, 0, false);
      }
    }
    // 렌더 위치 — myAbsPredicted(30Hz 예측 + 매 틱 리컨실리에이션 보정)로 '지수평활' 수렴(60fps).
    //   lerp(prev,curr)는 리컨실리에이션이 스텝 사이 myAbsPredicted를 ±수십px 보정하면 스텝 경계에서 점프로 받아 떨림.
    //   매 프레임 일정 비율로 당기는 평활은 그 점프를 여러 프레임에 분산 흡수 → 떨림 제거. (워프는 reconcile에서 직접 snap.)
    if (_renderReady) {
      // K20: 스텝 보간 복귀. self 예측은 30Hz 계단(myAbsPredicted). 직전 스텝(_renderPrev)↔현재 스텝(_renderCurr)을
      //   누적비율 a=_predAccum/PRED_STEP 로 lerp → 60fps에서 등속으로 흘러 카메라 30Hz 펄싱 제거.
      //   K18 지수평활은 계단을 못 펴 미세 펄싱했음. K19로 리컨실리에이션 보정이 ~0 → 보간 끝점이 안정 → 보간이 다시 부드러움.
      const a = _predAccum / PRED_STEP;   // while 루프 뒤라 0..1 보장
      myAbsRender.x = _renderPrev.x + (_renderCurr.x - _renderPrev.x) * a;
      myAbsRender.y = _renderPrev.y + (_renderCurr.y - _renderPrev.y) * a;
    } else {
      myAbsRender = { x: myAbsPredicted.x, y: myAbsPredicted.y };
      _renderReady = true;
    }

    ensurePrimaryConnection();
    checkOrphan();
    manageNeighborSubscriptions();
    const _zOn = zoomBegin();          // ★여기부터 월드 패스 — ZOOM=1 이면 아무 일도 안 일어난다
    { const _rA = performance.now(); render(); const _rd = performance.now() - _rA;
      window._gAcc = (window._gAcc||0)+_rd; window._gN = (window._gN||0)+1; if (_rd > (window._gMax||0)) window._gMax = _rd;
      if (window._gN >= 30) { if (window._renderDbg) { let _bn=0; for (const c of conns.values()) _bn += c.buildings.size;
        console.log(`[render] avg=${(window._gAcc/window._gN).toFixed(1)}ms tiles=${((window._tileAccDbg||0)/window._gN).toFixed(1)}ms max=${window._gMax.toFixed(0)}ms bld=${_bn}`); } window._gAcc=0; window._gN=0; window._gMax=0; window._tileAccDbg=0; } }
    drawArrowFx();      // 사냥꾼 화살 비행(서버 arrow_fx)
    drawBuildOverlay(); // 14.51: hover outline
    drawPlacementGhost(); // 14.53-i: placement 시 실루엣 미리보기
    zoomEnd(_zOn);      // ★월드 패스 끝 — 오프스크린을 화면에 통째로 늘리거나 줄여 얹는다
    updateBuildProgressEl(); // 14.51: 3초 progress bar (DOM)
    updateMinimap();
    requestAnimationFrame(loop);
  }
  // === 화살 이펙트 ===
  // 서버 arrow_fx 방송(사냥꾼 사격)을 비행시간 동안 보간해 그림. 카메라 기준은 render()가 남긴
  // _lastCamAbs(관전 카메라 포함) — 오버레이가 본체 렌더와 어긋나지 않게.
  function drawArrowFx() {
    if (!_arrowFx.length) return;
    const now = performance.now();
    const camIso = w2i(_lastCamAbs.x, _lastCamAbs.y);
    for (let i = _arrowFx.length - 1; i >= 0; i--) {
      const a = _arrowFx[i];
      const k = (now - a.at) / a.ms;
      if (k >= 1.2) { _arrowFx.splice(i, 1); continue; }   // 착탄 후 짧은 잔상(0.2×비행시간)
      const p = Math.min(1, k);
      const wx = a.x0 + (a.x1 - a.x0) * p, wy = a.y0 + (a.y1 - a.y0) * p;
      const iso = w2i(wx, wy);
      const sx = iso.x - camIso.x + W / 2;
      const sy = iso.y - camIso.y + H / 2 - 20;   // 활 높이(사수 가슴께)
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;   // 시야 밖은 자연히 스킵
      const i0 = w2i(a.x0, a.y0), i1 = w2i(a.x1, a.y1);
      const ang = Math.atan2(i1.y - i0.y, i1.x - i0.x);   // 화면(아이소 투영) 진행 방향
      ctx.save();
      ctx.globalAlpha = k > 1 ? Math.max(0, 1 - (k - 1) / 0.2) : 1;
      ctx.translate(sx, sy); ctx.rotate(ang);
      ctx.strokeStyle = '#5a4426'; ctx.lineWidth = 2;                     // 화살대(갈색)
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(4, 0); ctx.stroke();
      ctx.fillStyle = '#3a2f1c';                                          // 삼각촉
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -2.4); ctx.lineTo(3, 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8cfae';                                          // 살깃
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12.5, -2.2); ctx.lineTo(-12.5, 2.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // 14.51 + 14.53-e: 건축 모드 overlay — building 형태별 outline
  function drawBuildOverlay() {
    if (!buildMode || !hoverBuildingId || placementMode) return;
    let b = null, ox = 0, oy = 0;
    for (const c of conns.values()) {
      b = c.buildings.get(hoverBuildingId);
      if (b) { ox = c.meta?.worldOffsetX||0; oy = c.meta?.worldOffsetY||0; break; }
    }
    if (!b) return;
    // 14.53-e fix: wall/door b.x,b.y = cell 좌상단 좌표 (다른 건축물은 cell center).
    // outline은 cell center 기준으로 그리므로 wall/door는 +16 보정.
    const isEdge = (b.type === 'wall' || b.type === 'door');
    const wx = ox + b.x + (isEdge ? 16 : 0);
    const wy = oy + b.y + (isEdge ? 16 : 0);
    const iso = w2i(wx, wy);
    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const sx = iso.x - myIso.x + W/2;
    // 14.53-h fix: floor 보정은 FLOOR_HEIGHT(64) — 옛 *32는 절반만 올라감
    const sy = iso.y - myIso.y + H/2 - (b.floor || 0) * FLOOR_HEIGHT;
    const t = (Date.now() % 800) / 800;
    const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI));
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(240,198,116,${0.5 + glow * 0.5})`;
    ctx.fillStyle = `rgba(240,198,116,${0.08 + glow * 0.1})`;

    const H_FLOOR = 64; // 벽/문 높이
    const HALF = 16;    // cell 반쪽 (iso 좌표 단위 — TS/2)
    // iso 변환 helper (local cell offset → screen)
    const o2s = (dx, dy, dz = 0) => ({ x: sx + (dx - dy), y: sy + (dx + dy) * 0.5 - dz });

    if (b.type === 'wall' || b.type === 'door') {
      // wall edge: side 'N' = cell 북쪽 변 (y- 쪽), 'E' = 동쪽 변 (x+ 쪽). 세로 박스.
      const side = b.data?.side || 'N';
      const h = H_FLOOR;
      // edge endpoint 두 개 (cell 모서리). N: (-HALF, -HALF) ~ (HALF, -HALF). E: (HALF, -HALF) ~ (HALF, HALF).
      let p1, p2;
      if (side === 'N') { p1 = { dx: -HALF, dy: -HALF }; p2 = { dx: HALF, dy: -HALF }; }
      else              { p1 = { dx: HALF,  dy: -HALF }; p2 = { dx: HALF, dy: HALF }; }
      // 4 corner (top + bottom)
      const a_top = o2s(p1.dx, p1.dy, h);
      const b_top = o2s(p2.dx, p2.dy, h);
      const a_bot = o2s(p1.dx, p1.dy, 0);
      const b_bot = o2s(p2.dx, p2.dy, 0);
      ctx.beginPath();
      ctx.moveTo(a_top.x, a_top.y);
      ctx.lineTo(b_top.x, b_top.y);
      ctx.lineTo(b_bot.x, b_bot.y);
      ctx.lineTo(a_bot.x, a_bot.y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (b.type === 'fence') {
      // cell 전체, 절반 높이
      const h = H_FLOOR * 0.5;
      const tl = o2s(-HALF, -HALF, h);
      const tr = o2s( HALF, -HALF, h);
      const br = o2s( HALF,  HALF, h);
      const bl = o2s(-HALF,  HALF, h);
      const tlB = o2s(-HALF, -HALF, 0);
      const trB = o2s( HALF, -HALF, 0);
      const brB = o2s( HALF,  HALF, 0);
      const blB = o2s(-HALF,  HALF, 0);
      // top
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // bottom
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.stroke();
      // vertical edges
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tlB.x, tlB.y);
      ctx.moveTo(tr.x, tr.y); ctx.lineTo(trB.x, trB.y);
      ctx.moveTo(br.x, br.y); ctx.lineTo(brB.x, brB.y);
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y);
      ctx.stroke();
    } else if (b.type === 'floor') {
      // cell 평면 다이아몬드 (얇은 floor)
      ctx.beginPath();
      ctx.moveTo(o2s(-HALF, -HALF).x, o2s(-HALF, -HALF).y);
      ctx.lineTo(o2s( HALF, -HALF).x, o2s( HALF, -HALF).y);
      ctx.lineTo(o2s( HALF,  HALF).x, o2s( HALF,  HALF).y);
      ctx.lineTo(o2s(-HALF,  HALF).x, o2s(-HALF,  HALF).y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (b.type === 'stair') {
      // 14.54-c: 3×1×2 박스 (3 cell long × 1 cell wide × 2 floor tall) + auto floor 1 cell 박스
      const dir = b.data?.dir || 'N';
      const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
               : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
      // dir 수직 (cell width)
      const pv = { x: -dv.y, y: dv.x };
      // 박스 8 corner. cell 0 중심 = (0,0). cell 0 시작 = dv * -16, cell 2 끝 = dv * (2*32 + 16) = dv * 80.
      // perpendicular: ±16
      const start = -16;    // dir 축 시작
      const end = 80;       // dir 축 끝 (cell 2 끝)
      const half = HALF;    // perp ±
      const zBot = 0, zTop = H_FLOOR; // 14.54-c2: 1 floor 높이
      // 8 corner: [near/far][left/right][bot/top]
      const c = (along, perp, z) => o2s(dv.x * along + pv.x * perp, dv.y * along + pv.y * perp, z);
      const ftl = c(end,   -half, zTop);
      const ftr = c(end,    half, zTop);
      const fbl = c(end,   -half, zBot);
      const fbr = c(end,    half, zBot);
      const ntl = c(start, -half, zTop);
      const ntr = c(start,  half, zTop);
      const nbl = c(start, -half, zBot);
      const nbr = c(start,  half, zBot);
      // top face
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(ntr.x, ntr.y);
      ctx.lineTo(ftr.x, ftr.y); ctx.lineTo(ftl.x, ftl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // bottom face (윤곽만)
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y); ctx.closePath();
      ctx.stroke();
      // 4 vertical edges
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(nbl.x, nbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ftr.x, ftr.y); ctx.lineTo(fbr.x, fbr.y);
      ctx.stroke();
      // ramp 사선 — cell 0(near) 아래에서 cell 2(far) 위로 올라감
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(ftl.x, ftl.y);
      ctx.moveTo(nbr.x, nbr.y); ctx.lineTo(ftr.x, ftr.y);
      ctx.stroke();
      // auto floor (cell 3, floor+1) — z=H_FLOOR 평면에 cell 다이아몬드 (floor 일반과 동일)
      const autoFloorId = b.data?._autoFloorId;
      if (autoFloorId) {
        const fStart = 80, fEnd = 80 + 32;
        const af_a = c(fStart, -half, H_FLOOR);
        const af_b = c(fEnd,   -half, H_FLOOR);
        const af_c = c(fEnd,    half, H_FLOOR);
        const af_d = c(fStart,  half, H_FLOOR);
        ctx.beginPath();
        ctx.moveTo(af_a.x, af_a.y); ctx.lineTo(af_b.x, af_b.y);
        ctx.lineTo(af_c.x, af_c.y); ctx.lineTo(af_d.x, af_d.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    } else {
      // chest/campfire/farmland 등 — cell 정사각 wireframe (3D 박스)
      const h = 24;
      const tl = o2s(-HALF, -HALF, h);
      const tr = o2s( HALF, -HALF, h);
      const br = o2s( HALF,  HALF, h);
      const bl = o2s(-HALF,  HALF, h);
      const tlB = o2s(-HALF, -HALF, 0);
      const trB = o2s( HALF, -HALF, 0);
      const brB = o2s( HALF,  HALF, 0);
      const blB = o2s(-HALF,  HALF, 0);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tlB.x, tlB.y);
      ctx.moveTo(tr.x, tr.y); ctx.lineTo(trB.x, trB.y);
      ctx.moveTo(br.x, br.y); ctx.lineTo(brB.x, brB.y);
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y);
      ctx.stroke();
    }
    // 라벨 (cycle 가능하면 [n/total] 표시)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const label = itemKo('item_' + b.type);   // ★[T55] 정본 우선 — 없으면 `item_<type>` 이 남는다(종전은 `<type>`)
    const cycleHint = hoverList.length > 1 ? ` [${hoverIndex+1}/${hoverList.length}] 휠로 변경` : '';
    ctx.fillText(`${label} 분해 (클릭, 3초)${cycleHint}`, sx, sy - 60);
    ctx.restore();
  }
