// @@split:32-m-render — M/R2 — 렌더 루프·배치·전쟁 표시
  // 14.54-d: 배치 사전 체크 — 빨간 ghost 표시용
  function isPlacementBlocked(itemType, cx, cy, dir) {
    const floorN = myFloor || 0;
    // 1) 다른 사람 사유지 안인지
    const cellWx = cx * 32 + 16, cellWy = cy * 32 + 16;
    for (const c of conns.values()) {
      for (const cl of c.claims ? c.claims.values() : []) {
        if (cl.ownerPid && myPid && cl.ownerPid !== myPid &&
            cellWx >= cl.x && cellWx < cl.x + cl.w &&
            cellWy >= cl.y && cellWy < cl.y + cl.h) {
          return true;
        }
      }
    }
    // 2) 같은 cell 같은 floor에 다른 건축물 있는지
    if (itemType === 'item_wall' || itemType === 'item_door') {
      // wall/door는 edge — 정규화된 edge에 wall/door 있는지
      let useCx = cx, useCy = cy, useSide = 'N';
      if      (dir === 'N') { useCx = cx; useCy = cy;     useSide = 'N'; }
      else if (dir === 'S') { useCx = cx; useCy = cy + 1; useSide = 'N'; }
      else if (dir === 'E') { useCx = cx; useCy = cy;     useSide = 'E'; }
      else if (dir === 'W') { useCx = cx - 1; useCy = cy; useSide = 'E'; }
      for (const c of conns.values()) {
        const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if ((b.type !== 'wall' && b.type !== 'door') || (b.floor || 0) !== floorN) continue;
          const bCx = Math.floor((b.x - ox) / 32);
          const bCy = Math.floor((b.y - oy) / 32);
          if (bCx === useCx && bCy === useCy && b.data?.side === useSide) return true;
        }
      }
    } else {
      // 일반: 해당 cell에 다른 building 있나
      for (const c of conns.values()) {
        const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if ((b.floor || 0) !== floorN) continue;
          if (b.type === 'wall' || b.type === 'door') continue;
          const bCx = Math.floor((b.x - ox) / 32);
          const bCy = Math.floor((b.y - oy) / 32);
          if (bCx === cx && bCy === cy) return true;
        }
      }
      // stair: cell 3 (auto floor 자리, floor+1)에도 충돌 검사
      if (itemType === 'item_stair') {
        const dv = (dir === 'W') ? { x: -1, y: 0 } : { x: 0, y: -1 };
        const acx = cx + dv.x * 3;
        const acy = cy + dv.y * 3;
        for (const c of conns.values()) {
          const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if ((b.floor || 0) !== floorN + 1) continue;
            if (b.type === 'wall' || b.type === 'door') continue;
            const bCx = Math.floor((b.x - ox) / 32);
            const bCy = Math.floor((b.y - oy) / 32);
            if (bCx === acx && bCy === acy) return true;
          }
        }
      }
    }
    return false;
  }
  // 14.53-i: placement ghost — 마우스 위치에 실루엣 미리보기
  function drawPlacementGhost() {
    if (!placementMode) return;
    if (placementMode.special) {
      // ★움집터(6×4)·길드 곳간(5×3) 발자국 윤곽 고스트 — 커서 셀 기준(서버 좌표 규약 동형)
      const wx0 = placementCursor.wx, wy0 = placementCursor.wy;
      const ccx = Math.floor(wx0 / 32), ccy = Math.floor(wy0 / 32);
      const psite = placementMode.special === 'psite';
      const hut = placementMode.special === 'hut_site' || psite;   // ★[11차 T4] 의뢰 집도 같은 6×4 움집 발자국(실체 동일)
      const kiln = placementMode.special === 'kiln_site';          // ★숯가마도 같은 2×2 계약
      const furn = placementMode.special === 'furnace_site' || kiln;   // ★노 2×2 발자국(재민 확정 — 사유지 안)
      // ★의뢰 집터의 발자국 규약은 **마을 정본**([cx-5..cx+0]×[cy-5..cy-2], 서버 lifeRequestPlayerSite와 동일)
      const fx0 = furn ? ccx : (psite ? ccx - 5 : (hut ? ccx - 3 : ccx - 2)), fy0 = furn ? ccy : (psite ? ccy - 5 : (hut ? ccy - 2 : ccy - 1));
      const fx1 = furn ? ccx + 1 : (psite ? ccx + 0 : (hut ? ccx + 2 : ccx + 2)), fy1 = furn ? ccy + 1 : (psite ? ccy - 2 : (hut ? ccy + 1 : ccy + 1));   // ★노 2×2 = 서버 tryFurnaceStart 규약 동형
      const myIso0 = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const pt = (cx2, cy2) => { const i = w2i(cx2 * 32, cy2 * 32); return { x: i.x - myIso0.x + W / 2, y: i.y - myIso0.y + H / 2 - (myFloor || 0) * FLOOR_HEIGHT }; };
      const p1 = pt(fx0, fy0), p2 = pt(fx1 + 1, fy0), p3 = pt(fx1 + 1, fy1 + 1), p4 = pt(fx0, fy1 + 1);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath();
      ctx.fillStyle = hut ? 'rgba(154,122,74,0.25)' : 'rgba(165,129,63,0.25)'; ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = hut ? '#c9b28a' : '#e0b060'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(kiln ? '숯가마 2×2 — 사유지 안' : (furn ? `${placementMode.kind === 'bloomery' ? '괴련로' : '노(爐)'} 2×2 — 사유지 안` : (psite ? '마을에 집 의뢰 6×4 (재료 선납)' : (hut ? '움집터 6×4 (수혈 굴착)' : '길드 곳간 5×3 (밀폐)'))), (p1.x + p3.x) / 2, p1.y - 8);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }
    if (!placementMode.itemType) return;
    const wx = placementCursor.wx, wy = placementCursor.wy;
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    const dir = placementMode.dir || 'N';
    const it = placementMode.itemType;
    let cellCx, cellCy, side;
    if (it === 'item_wall' || it === 'item_door') {
      if      (dir === 'N') { cellCx = cx; cellCy = cy;     side = 'N'; }
      else if (dir === 'S') { cellCx = cx; cellCy = cy + 1; side = 'N'; }
      else if (dir === 'E') { cellCx = cx; cellCy = cy;     side = 'E'; }
      else                  { cellCx = cx - 1; cellCy = cy; side = 'E'; }
    }
    const centerCx = (it === 'item_wall' || it === 'item_door') ? (cellCx * 32 + 16) : (cx * 32 + 16);
    const centerCy = (it === 'item_wall' || it === 'item_door') ? (cellCy * 32 + 16) : (cy * 32 + 16);
    const iso = w2i(centerCx, centerCy);
    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const sx = iso.x - myIso.x + W/2;
    const sy = iso.y - myIso.y + H/2 - (myFloor || 0) * FLOOR_HEIGHT;
    const HALF = 16, H_FLOOR = 64;
    const o2s = (dx, dy, dz = 0) => ({ x: sx + (dx - dy), y: sy + (dx + dy) * 0.5 - dz });
    // 14.54-d: 충돌/사유지 사전 체크. 안 되면 빨간색 ghost.
    const blocked = isPlacementBlocked(it, cx, cy, dir);
    ctx.save();
    const t = (Date.now() % 1000) / 1000;
    const a = 0.35 + 0.25 * Math.abs(Math.sin(t * Math.PI));
    if (blocked) {
      ctx.fillStyle = `rgba(220,80,80,${a})`;
      ctx.strokeStyle = `rgba(255,140,140,${a + 0.3})`;
    } else {
      ctx.fillStyle = `rgba(120,200,255,${a})`;
      ctx.strokeStyle = `rgba(180,230,255,${a + 0.3})`;
    }
    ctx.lineWidth = 2;
    if (it === 'item_wall' || it === 'item_door') {
      let p1, p2;
      if (side === 'N') { p1 = { dx: -HALF, dy: -HALF }; p2 = { dx: HALF, dy: -HALF }; }
      else              { p1 = { dx: HALF,  dy: -HALF }; p2 = { dx: HALF, dy: HALF }; }
      const a_top = o2s(p1.dx, p1.dy, H_FLOOR);
      const b_top = o2s(p2.dx, p2.dy, H_FLOOR);
      const a_bot = o2s(p1.dx, p1.dy, 0);
      const b_bot = o2s(p2.dx, p2.dy, 0);
      ctx.beginPath();
      ctx.moveTo(a_top.x, a_top.y); ctx.lineTo(b_top.x, b_top.y);
      ctx.lineTo(b_bot.x, b_bot.y); ctx.lineTo(a_bot.x, a_bot.y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_fence') {
      const h = H_FLOOR * 0.5;
      const tl = o2s(-HALF, -HALF, h), tr = o2s(HALF, -HALF, h);
      const br = o2s(HALF, HALF, h), bl = o2s(-HALF, HALF, h);
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_floor') {
      ctx.beginPath();
      ctx.moveTo(o2s(-HALF, -HALF).x, o2s(-HALF, -HALF).y);
      ctx.lineTo(o2s(HALF, -HALF).x, o2s(HALF, -HALF).y);
      ctx.lineTo(o2s(HALF, HALF).x, o2s(HALF, HALF).y);
      ctx.lineTo(o2s(-HALF, HALF).x, o2s(-HALF, HALF).y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_stair') {
      // 14.54-c: stair ghost — 3×1×1 박스 + auto floor. dir = N 또는 W만.
      const dv = (dir === 'W') ? { x: -1, y: 0 } : { x: 0, y: -1 }; // N 또는 W만
      const pv = { x: -dv.y, y: dv.x };
      const cc = (along, perp, z) => o2s(dv.x * along + pv.x * perp, dv.y * along + pv.y * perp, z);
      const start = -16, end = 80, half = HALF;
      const zBot = 0, zTop = H_FLOOR;
      const ftl = cc(end, -half, zTop), ftr = cc(end, half, zTop);
      const fbl = cc(end, -half, zBot), fbr = cc(end, half, zBot);
      const ntl = cc(start, -half, zTop), ntr = cc(start, half, zTop);
      const nbl = cc(start, -half, zBot), nbr = cc(start, half, zBot);
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(ntr.x, ntr.y);
      ctx.lineTo(ftr.x, ftr.y); ctx.lineTo(ftl.x, ftl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(nbl.x, nbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ftr.x, ftr.y); ctx.lineTo(fbr.x, fbr.y);
      // ramp 사선 — cell 0(near) 아래 → cell 2(far) 위 (계단 올라가는 방향)
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(ftl.x, ftl.y);
      ctx.moveTo(nbr.x, nbr.y); ctx.lineTo(ftr.x, ftr.y);
      ctx.stroke();
      // auto floor (cell 3, floor+1) — z=H_FLOOR 평면 다이아몬드 (floor 일반과 동일)
      const fStart = 80, fEnd = 80 + 32;
      const af_a = cc(fStart, -half, H_FLOOR);
      const af_b = cc(fEnd,   -half, H_FLOOR);
      const af_c = cc(fEnd,    half, H_FLOOR);
      const af_d = cc(fStart,  half, H_FLOOR);
      ctx.beginPath();
      ctx.moveTo(af_a.x, af_a.y); ctx.lineTo(af_b.x, af_b.y);
      ctx.lineTo(af_c.x, af_c.y); ctx.lineTo(af_d.x, af_d.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      const h = 24;
      const tl = o2s(-HALF, -HALF, h), tr = o2s(HALF, -HALF, h);
      const br = o2s(HALF, HALF, h), bl = o2s(-HALF, HALF, h);
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${ITEM_LABEL[it] || it} (${dir}) · 휠=회전 · 좌클릭=배치`, sx, sy - 60);
    ctx.restore();
  }
  // 14.51: 3초 progress bar (DOM overlay)
  function ensureBuildProgressEl() {
    let el = document.getElementById('buildProgress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'buildProgress';
      el.style.cssText = 'position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);background:rgba(20,25,30,0.92);color:#fff;padding:10px 20px;border-radius:8px;border:2px solid #f0c674;z-index:9999;display:none;font-size:14px;pointer-events:none;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
      el.innerHTML = '<div class="bp-text" style="margin-bottom:6px;font-weight:bold">작업 중...</div><div style="width:240px;height:10px;background:#333;border-radius:5px;overflow:hidden"><div class="bp-fill" style="height:100%;background:linear-gradient(90deg,#f0c674,#ffd88a);width:0%"></div></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function updateBuildProgressEl() {
    const el = ensureBuildProgressEl();
    if (!buildAction) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const elapsed = performance.now() - buildAction.startedAt;
    const pct = Math.min(100, (elapsed / buildAction.durationMs) * 100);
    el.querySelector('.bp-fill').style.width = pct.toFixed(1) + '%';
    el.querySelector('.bp-text').textContent = buildAction.kind === 'place' ? '🏗️ 배치 중... (이동 시 취소)' : '🔧 분해 중... (이동 시 취소)';
  }

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

  // === 렌더링 (아이소메트릭) ===
  function render() {
    if (!primaryZoneId) return;
    const pConn = conns.get(primaryZoneId);
    if (!pConn || !pConn.meta) return;
    // 14.51: 진행 중 build/dismantle 작업 갱신 (3초 timer)
    updateBuildAction();

    // 카메라/본인 스프라이트는 보간 위치(myAbsRender)를 사용 → 30Hz 예측을 60fps로 부드럽게.
    // (충돌/로직은 계속 myAbsPredicted 사용 — render 좌표만 보간.)
    let _camAbs = (_renderReady ? myAbsRender : myAbsPredicted);
    // §4-4 P4: 전투 관전 카메라(랩 focusCameraOnBattle 정합·0.6s smoothstep). active=전투 focus 유지, returning=본체 복귀 트윈.
    if (_warSpec.active && _warSpec.to && _warSpec.from) {
      const k = Math.min(1, (performance.now() - _warSpec.t0) / _warSpec.dur), s = k * k * (3 - 2 * k);
      _camAbs = { x: _warSpec.from.x + (_warSpec.to.x - _warSpec.from.x) * s, y: _warSpec.from.y + (_warSpec.to.y - _warSpec.from.y) * s };
    } else if (_warSpec.returning && _warSpec.from) {
      const k = Math.min(1, (performance.now() - _warSpec.t0) / _warSpec.dur), s = k * k * (3 - 2 * k);
      _camAbs = { x: _warSpec.from.x + (_camAbs.x - _warSpec.from.x) * s, y: _warSpec.from.y + (_camAbs.y - _warSpec.from.y) * s };
      if (k >= 1) _warSpec.returning = false;
    }
    _lastCamAbs = { x: _camAbs.x, y: _camAbs.y };   // 트윈 출발점 캡처(관전 진입/복귀 공용)
    // §19 4파: 뷰(카메라) 경도 오프셋 갱신 — 존 폭 대비 0~4.5%(하루 비율). worldPhase()가 로컬 태양시로 소비.
    { const _lz = clientFindZoneAt(_camAbs.x, _camAbs.y); _lonView = _lz ? ((_camAbs.x - _lz.worldOffsetX) / Math.max(1, _lz.zoneWidth)) * 0.045 : 0; }
    const myIso = w2i(_camAbs.x, _camAbs.y);
    // === [조준 시야 밀기 2026-08-30] ==========================================
    //   ★★오프셋은 **화면 변환(camX/camY)에만** 더한다. `_camAbs`(월드)는 한 비트도 안 건드린다
    //     ⇒ 안개 원점·내 스프라이트 위치·물 흐름 표본이 전부 **캐릭터 그대로**다.
    //     (커서로 안개를 걷으면 정찰이 공짜가 된다 — 시야 확장은 설계할 일이지 카메라의 부작용이 아니다.)
    //   ★조준 안 할 땐 오프셋이 정확히 0 ⇒ `myIso.x + 0 === myIso.x`(IEEE754 정확) — 화면 불변.
    {
      const _tn = performance.now();
      const _adt = Math.min(0.1, (_tn - (_aimT || _tn)) / 1000); _aimT = _tn;
      let _tx = 0, _ty = 0;
      if (_aiming) {
        // 커서가 화면 중심에서 얼마나 떨어졌나 → 그 절반만큼, 최대 AIM_LOOK_PX 만큼 민다.
        // ★마우스는 **실제 화면** 좌표다. 이 블록은 월드 패스 안이라 W/H 가 가상 크기이므로
        //   W0/H0 로 재고 배율로 나눠 가상 공간으로 옮긴다(ZOOM=1 이면 종전과 같은 값).
        const _dx = (lastMouseSx - W0 / 2) / ZOOM, _dy = (lastMouseSy - H0 / 2) / ZOOM;
        const _m = Math.hypot(_dx, _dy);
        if (_m > 1e-6) { const _k = Math.min(AIM_LOOK_PX, _m * 0.5) / _m; _tx = _dx * _k; _ty = _dy * _k; }
      }
      const _e = 1 - Math.exp(-_adt / AIM_LOOK_TAU);   // 부드러운 이징 — 뚝 이동 금지
      _aimLookX += (_tx - _aimLookX) * _e;
      _aimLookY += (_ty - _aimLookY) * _e;
      if (!_aiming && Math.abs(_aimLookX) < 0.01 && Math.abs(_aimLookY) < 0.01) { _aimLookX = 0; _aimLookY = 0; }
    }
    const camX = myIso.x + _aimLookX, camY = myIso.y + _aimLookY;
    _lastCamIso = { x: camX, y: camY };   // 커서→월드 투영이 **렌더가 실제로 쓴** 원점을 쓰게
    // 조준 월드 방향 — 몸에서 커서로. (공격 배선·페이싱이 이걸 쓴다)
    if (_aiming) {
      const _cw = screenToWorldAbs(lastMouseSx, lastMouseSy);
      const _ax = _cw.wx - _camAbs.x, _ay = _cw.wy - _camAbs.y;
      const _al = Math.hypot(_ax, _ay);
      if (_al > 1e-6) { _aimDirX = _ax / _al; _aimDirY = _ay / _al; myFacingVx = _aimDirX; myFacingVy = _aimDirY; }
    }
    const toScreen = (ix, iy) => ({ x: ix - camX + W / 2, y: iy - camY + H / 2 });

    // 배경 — 검정 (시야 밖)
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, W, H);

    const TS = pConn.meta.tileSize;
    // 타일/엔티티 컬링 중심도 카메라(보간) 위치 기준 → 화면 중심과 일치.
    const worldCx = _camAbs.x, worldCy = _camAbs.y;
    const VIEW_RADIUS = 650;
    // 14.49-e6e: 타일은 화면 전체 덮는 더 큰 범위로 그림 (1500px).
    // 그래야 vignette 가장자리가 셀 stairstep 안 보임 (타일 없는 빈 영역의 boundary가 hard edge).
    const TILE_RENDER_RADIUS = 1500;

    // === 1) 지면 다이아몬드 타일 ===
    const t0WX = Math.floor((worldCx - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + TILE_RENDER_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + TILE_RENDER_RADIUS) / TS) * TS;

    const _tlT0 = performance.now();
    const _zlist = Object.values(zonesMeta);   // hoist — 타일마다 배열 재할당하던 것 제거 (GC 폭주 원인)
    const _halfTS = TS / 2;
    // ★★[배치 19 실장 A] 지면은 **정적**이다 — iso 512×256 타일로 구워 두고 drawImage 만 한다.
    //   종전엔 프레임마다 셀 다이아몬드 ~9,000장을 칠했다(반경 1,500px). 이제 화면을 덮는
    //   타일 ~30장의 blit 이고, 굽는 비용은 그 타일을 처음 볼 때 한 번만 든다.
    //   텍스처가 아직 안 왔거나 legacy 손잡이면 **종전 경로**로 그대로 떨어진다(무회귀).
    const _LEG = !!_t19.legacy || _gtexReady < 3;
    // 손잡이가 바뀌면 구워 둔 타일은 옛 문법이다 — 버린다(A/B 가 같은 프레임에서 성립하려면 필수)
    // ★[배치 21 10차] 물가 여백도 **타일에 굳는다** — 지문에 같이 넣는다. 지문이 두 군데면
    //   서로의 캐시를 지우며 매 프레임 다시 굽는다(합칠 때 실제로 그럴 뻔했다).
    //   ★`waterOff` 도 지문에 들어간다 — **굽는 그림이 바뀌기 때문**이다(물 셀이 진흙↔단색으로 갈린다).
    //     빠져 있어서 물을 껐다 켜도 옛 타일이 그대로 남았다. 풀 카펫 항등식 판정이 이걸 잡았다
    //     (강가만 평균 |Δ| 6.18 · 12.6% 어긋남 — 초원은 0.395 였다).
    { const _kf = (_LEG ? 'L' : '') + (_t19.stateOff ? 'S' : '') + (_t19.wxOff ? 'W' : '')
                + (_t19.waterOff ? 'o' : '') + ((_t19.windOff || _t19.windGrassOff) ? 'g' : 'G')
                + 'm' + (_t19.shMarginOff ? 'x' : (_t19.shMargin == null ? 1 : _t19.shMargin));
      if (_gtKnob !== _kf) { _gtKnob = _kf; _groundTiles.clear(); _shMarginN = 0; } }
    if (!_LEG) _waterInit();   // ★타일을 굽기 **전에** 물 가능 여부를 확정한다(진흙/단색 갈림이 타일에 굳는다)
    window.__groundDbg = { legacy: _LEG, tex: _gtexReady, texNames: Object.keys(GTEX).filter(k => GTEX[k] && GTEX[k].naturalWidth), tiles: 0, baked: 0, cached: _groundTiles.size, stateCells: 0 };
    { // ★[배치 20 B] 타일 상태 계측·주입 — 하네스는 서버 방송과 **같은 입구**(_tsIngest)로만 들어온다.
      const _c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      window.__tileStateDbg = {
        off: !!_t19.stateOff, sb: (typeof SoilBase !== 'undefined'),
        soilCells: _c && _c.soil ? _c.soil.size : -1,
        roadCells: _c && _c.roads ? _c.roads.size : -1,
        farmCells: _farmCells ? _farmCells.size : -1,
        wxActive: (_c && _c.simVillages) ? _c.simVillages.filter((v) => v.wx).length : -1,
        q: TS_SOIL_Q,
      };
      window.__tileStateFeed = (flat) => { const n = _tsIngest(_c, flat || []); needsRedraw = true; return n; };
      // ★[날씨 축] 방송과 **같은 입구**. wxMap = { 마을id → [이름, fertility계수] | null }
      window.__wxFeed = (m) => { const n = _wxIngest(_c, m || {}); needsRedraw = true; return n; };
      window.__wxDbg = () => {
        if (!_c || !_c.simVillages) return null;
        const on = _c.simVillages.filter((v) => v.wx);
        return { off: !!_t19.wxOff, villages: _c.simVillages.length, active: on.length,
                 sample: on.slice(0, 4).map((v) => ({ id: v.id, name: v.name, cx: v.cx, cy: v.cy, wx: v.wx, R: Math.round(_wxRadiusPx(v)) })),
                 nearest: _c.simVillages.map((v) => ({ id: v.id, name: v.name, cx: v.cx, cy: v.cy, R: Math.round(_wxRadiusPx(v)),
                   d: Math.round(Math.hypot((_c.meta.worldOffsetX + v.cx * CL_BUILDING_SIZE) - _camAbs.x, ((_c.meta.worldOffsetY || 0) + v.cy * CL_BUILDING_SIZE) - _camAbs.y)) }))
                   .sort((a, b) => a.d - b.d).slice(0, 3) };
      };
      // 답압(길)도 방송과 **같은 입구**로 넣는다 — 하네스가 우회로를 쓰지 않게.
      window.__roadFeed = (flat) => {
        if (!_c) return 0;
        if (!_c.roads) _c.roads = new Map();
        for (let i = 0; i + 2 < flat.length; i += 3) {
          const k = flat[i] + ',' + flat[i + 1];
          if (flat[i + 2]) _c.roads.set(k, flat[i + 2]); else _c.roads.delete(k);
        }
        _gtInvalidateCells(_c, flat, 3); needsRedraw = true; return flat.length / 3;
      };
      // ★셀 → 화면 좌표. 하네스가 투영 수학을 **다시 쓰지 않게**(사본이면 둘이 같이 틀린다).
      window.__cellScreen = (lcx, lcy) => {
        if (!_c || !_c.meta) return null;
        const wx = _c.meta.worldOffsetX + lcx * 32 + 16, wy = (_c.meta.worldOffsetY || 0) + lcy * 32 + 16;
        const iso = w2i(wx, wy);
        return { x: iso.x - camX + W / 2, y: iso.y - camY + H / 2 };
      };
      window.__camCellLocal = () => {
        if (!_c || !_c.meta) return null;
        return [Math.floor((_camAbs.x - _c.meta.worldOffsetX) / 32), Math.floor((_camAbs.y - (_c.meta.worldOffsetY || 0)) / 32)];
      };
      window.__tileStateAt = (lcx, lcy) => {
        if (!_c || !_c.meta) return null;
        const rec = _c.soil ? _c.soil.get(lcx + ',' + lcy) : null;
        const wx = _c.meta.worldOffsetX + lcx * 32 + 16, wy = (_c.meta.worldOffsetY || 0) + lcy * 32 + 16;
        const kind = isWaterAtAbs(wx, wy) ? 'water' : (isRockAtAbs(wx, wy) ? 'rock' : 'land');
        return { kind, soil: _tsSoil(lcx, lcy, kind, rec), base: (typeof SoilBase !== 'undefined' ? SoilBase.baseAt(kind, lcx, lcy) : null),
                 geo: rec ? rec.geo : 0, ore: rec ? rec.ore : 15, road: _c.roads ? (_c.roads.get(lcx + ',' + lcy) || 0) : 0,
                 dyn: !!rec, tiles: _groundTiles.size };
      };
    }
    if (!_LEG) {
      const isoX0 = camX - W / 2, isoY0 = camY - H / 2;
      const t0x = Math.floor(isoX0 / GT_W), t1x = Math.floor((isoX0 + W) / GT_W);
      const t0y = Math.floor(isoY0 / GT_H), t1y = Math.floor((isoY0 + H) / GT_H);
      const _fr = (window._tileFrames || 0);
      let baked = 0, drawn = 0, nStrip = 0;
      //   바람 세기·시각은 자연물과 **같은 정본**을 쓴다(_windAt/_windT) — 날씨 훅도 같이 먹는다.
      const _gwT = _windT() * GT_WAVE_W, _gwT2 = _windT() * GT_WAVE_W2;
      const _gw = (_t19.windOff || _t19.windGrassOff) ? 0 : _windAt(_windT()) * GT_GRASS_AMP;
      // ★★★[재민 2026-08-24 "아니 세로줄"] 잎 층은 **모든 바탕을 깐 뒤에** 따로 그린다.
      //   한 타일씩 (바탕 → 잎)을 반복하면, 잎을 off 만큼 오른쪽으로 밀어 옆 타일 영역까지
      //   넘겨 그려 놓고 **그 다음 타일의 불투명 바탕이 그 넘어온 잎을 덮어 버린다**.
      //   그러면 타일 경계마다 폭 |off| 만큼 잎 빛이 사라져 **세로 검은 줄**이 남는다.
      //   실측: 열별 최장 연속 98행 @x=988 · 89행 @x=476 (간격 512 = GT_W).
      //     바람 0 → 사라짐 · 바람 2.5 → 줄이 굵어지고 x=994 로 이동 · 잎 층 끔 → 사라짐.
      //   ⇒ 2패스. 바탕을 전부 깔고 나서 잎을 얹으면 덮을 바탕이 더 없다.
      const _blPass = [];
      for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
        const key = tx + '_' + ty;
        let ent = _groundTiles.get(key);
        if (!ent) {
          if (baked >= GT_BAKE_PER_FRAME) continue;   // 굽기 예산 초과 — 다음 프레임에(그 자리는 배경색)
          ent = _bakeGroundTile(tx, ty, _zlist); _groundTiles.set(key, ent); baked++;
        }
        ent.used = _fr;
        const _dx = Math.round(tx * GT_W - camX + W / 2), _dy = Math.round(ty * GT_H - camY + H / 2);
        ctx.drawImage(ent.cv, _dx, _dy);
        // ★★풀 카펫 흔들림 — 잎 층을 **가로 띠**로 어긋나게 가산 blit 한다.
        //   · 위상은 **iso 세로 좌표**(월드)로 준다 — 화면에 붙으면 카메라를 움직일 때 파도 따라온다.
        //   · 띠 16px = 타일당 16장. 실측(짝 비교) **+4.6ms/f** — 옛 주석 +0.53 은 틀렸다.
        //   · 'lighter' = 가산. 바탕이 (텍스처−평탄색)만큼 어둡게 구워져 있어 합이 원본과 같다.
        if (ent.bl) _blPass.push(ent, _dx, _dy, ty);
        drawn++;
      }
      // ── 2패스: 잎 층(가산) ─ 위 주석 참조. 바탕을 전부 깐 뒤라 덮일 일이 없다.
      for (let bi = 0; bi < _blPass.length; bi += 4) {
        const ent = _blPass[bi], _dx = _blPass[bi + 1], _dy = _blPass[bi + 2], ty = _blPass[bi + 3];
          if (_gw > 0) {
            // ★★[렉 라운드 2026-08-09] 흔들림 비용은 **픽셀(필레이트)** 에 비례한다 —
            //   띠 높이를 16/32/64px 로 바꿔도 18.6/16.2/17.6ms 로 잡음 안이었다(짝 비교 실측).
            //   ⇒ 띠 개수를 줄이는 안(ⓐ)은 0ms 다. 줄일 건 **그리는 픽셀**뿐이다.
            //   ⇒ 화면 밖은 잘라 낸다: 타일 격자(512×256)가 캔버스를 넘어 최대 2048×1280 을
            //     그리고 1400×900 만 쓴다 — **52% 가 화면 밖**이었다.
            ctx.globalCompositeOperation = 'lighter';
            for (let sY = 0; sY < GT_H; sY += GT_STRIP) {
              const sh = Math.min(GT_STRIP, GT_H - sY);
              const isoY = ty * GT_H + sY;
              const ph = isoY * GT_WAVE_K + _gwT;
              // ★[렉 라운드 실측] 목적지가 **소수**면 캔버스가 이중선형 재샘플링을 탄다.
              //   띠 개수·픽셀 수를 바꿔도 비용이 안 변한 이유가 이것이다. 진폭이 ±2.2px 라
              //   정수로 반올림해도 파도는 그대로 읽힌다. (손잡이 __gtFrac 로 A/B 가능)
              const off = _gtFrac ? (Math.sin(ph) * _gw) : Math.round(Math.sin(ph) * _gw);
              // 화면 사각형으로 잘라 낸다(그림은 안 변한다 — 잘린 건 원래 안 보이던 픽셀이다)
              const dX = _dx + off, dY = _dy + sY;
              let sx = 0, sw = GT_W, sy = sY, sHh = sh, ddx = dX, ddy = dY;
              if (dX < 0) { sx = -dX; sw -= sx; ddx = 0; }
              if (dX + GT_W > W) sw -= (dX + GT_W - W);
              if (dY < 0) { const c = -dY; sy += c; sHh -= c; ddy = 0; }
              if (dY + sh > H) sHh -= (dY + sh - H);
              if (sw <= 0 || sHh <= 0) continue;                  // 완전히 화면 밖인 띠
              // ★밀림만으로는 '미끄러진다'로 읽힌다 — 실제 밀밭은 돌풍이 지나갈 때 **빛도 함께 훑는다**.
              //   가산 층이라 alpha 를 흔들면 그게 그대로 명암 물결이 된다(비용 0).
              ctx.globalAlpha = 0.90 + 0.10 * Math.sin(ph * 1.0 + 1.1);
              ctx.drawImage(ent.bl, sx, sy, sw, sHh, ddx, ddy, sw, sHh);
              nStrip++;
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          } else if (ent.bl) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(ent.bl, _dx, _dy);        // 무풍 — 어긋남 0. 그림은 옛것과 같아야 한다
            ctx.globalCompositeOperation = 'source-over';
          }
      }
      window.__groundDbg.tiles = drawn; window.__groundDbg.baked = baked; window.__groundDbg.cached = _groundTiles.size;
      window.__groundDbg.strips = nStrip; window.__groundDbg.gwind = _gw;
      { let sc = 0; for (const e of _groundTiles.values()) sc += (e.state || 0); window.__groundDbg.stateCells = sc; }
      window.__groundDbg.margins = _shMarginN;
      const _cap = (_t19.windOff || _t19.windGrassOff) ? GT_MAX : GT_MAX_WIND;   // 잎 층이 있으면 타일당 2배
      if (_groundTiles.size > _cap) {   // 오래 안 쓴 타일부터 버린다(카메라가 멀어진 것)
        const ks = [..._groundTiles.entries()].sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
        for (let i = 0; i < ks.length - _cap; i++) _groundTiles.delete(ks[i][0]);
      }
    } else {
    // ── 종전 경로(폴백·A/B 대조군): 셀 다이아몬드 단색 ─────────────────────────
    const t0WX = Math.floor((worldCx - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + TILE_RENDER_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + TILE_RENDER_RADIUS) / TS) * TS;
    for (let wx = t0WX; wx < t1WX; wx += TS) {
      for (let wy = t0WY; wy < t1WY; wy += TS) {
        const cxw = wx + _halfTS, cyw = wy + _halfTS;
        const dist = Math.hypot(cxw - worldCx, cyw - worldCy);
        if (dist > TILE_RENDER_RADIUS) continue;   // 원형 컬링 — zone 조회/그리기 전에 모서리 스킵
        const iso = w2i(cxw, cyw);
        const s = toScreen(iso.x, iso.y);
        let zMeta = null;
        for (let zi = 0; zi < _zlist.length; zi++) {
          const zm = _zlist[zi];
          const ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
          const zW3 = zm.zoneWidth || 100000, zH3 = zm.zoneHeight || 100000;
          if (wx >= ox && wx < ox + zW3 && wy >= oy && wy < oy + zH3) { zMeta = zm; break; }
        }
        if (!zMeta) {
          const fallback = (primaryZoneId && zonesMeta[primaryZoneId]?.groundColor) || '#3a5a3a';
          drawDiamond(s.x, s.y, TS, fallback);
          continue;
        }
        const isWater = isWaterAtAbs(cxw, cyw, zMeta);
        const isRock = !isWater && isRockAtAbs(cxw, cyw, zMeta);
        let tileColor, tintColor, tintStrength;
        if (isWater) {
          tileColor = zMeta.isOcean ? zMeta.groundColor : '#2a5a8a';
          tintColor = zMeta.isOcean ? zMeta.tintColor : '#1a4a7a';
          tintStrength = 0.07;
        } else if (isRock) {
          tileColor = '#6e6356';
          tintColor = '#4a4138';
          tintStrength = 0.12;
        } else {
          tileColor = latitudeColor(cyw, worldHeight, zMeta.groundColor);
          const distFromPole = Math.min(cyw, worldHeight - cyw);
          const isIce = distFromPole <= ICE_BAND_PX;
          tintColor = isIce ? '#9bb5cc' : zMeta.tintColor;
          tintStrength = isIce ? 0.06 : 0.13;
        }
        drawDiamond(s.x, s.y, TS, blendTint(tileColor, tintColor, tintStrength));
      }
    }
    }

    // ★★[배치 20 B 계측기 수리] `_tileAcc`/`_tileFrames` 는 **하네스 전용**이다 — 아무도 중간에
    //   건드리면 안 된다. 30프레임마다 도는 `[render]` 디버그 블록이 `_tileAcc` 만 0 으로 되돌리고
    //   `_tileFrames` 는 그대로 두는 바람에, 하네스가 "리셋 → 3초 대기 → 둘 다 읽기" 를 하면
    //   **마지막 리셋 이후의 잔여분을 전체 프레임 수로 나눈 값**이 나왔다.
    //   e2e-terrain ⑥ 이 legacy 지면 0.00ms/f · 비율 ×Infinity 를 내며 이 결함을 드러냈다.
    //   ⇒ 디버그 블록은 제 몫(`_tileAccDbg`)을 따로 쌓는다. (계측기 오류 8건째 — 판정이 아니라 대본.)
    //   ⚠배치 19 보고의 지면 3.34 → 0.08ms/f 도 이 깨진 계측기로 잰 값이다. 방향(타일 blit 이
    //     셀 9,000장보다 싸다)은 맞지만 **숫자는 다시 재야 한다**.
    const _tlDt = performance.now() - _tlT0;
    window._tileAcc = (window._tileAcc||0) + _tlDt;
    window._tileAccDbg = (window._tileAccDbg||0) + _tlDt;
    window._tileFrames = (window._tileFrames||0) + 1;   // ★성능은 창 길이가 아니라 **프레임당 ms** 로 잰다

    // === 1-b) 물 레이어 (WebGL 셰이더) + 블록 프리즘 단면 ===
    //   순서가 문법이다: 지면(진흙) → **물** → 프리즘 면 → (물가 술) → 엔티티.
    //   프리즘 면이 물 뒤에 오는 이유 = 면이 물의 절단선을 덮어야 '블록'으로 읽힌다.
    const _wtT0 = performance.now();
    let _waterOn = false, _nPrism = 0, _nShore = 0;
    if (!_LEG && !_t19.waterOff) {
      // ★시간은 **게임 시계**다(프레임 시간 아님) — 같은 게임 시각이면 같은 그림이라 하네스가 재현 가능.
      // ★★그런데 `worldNow()/1000` 을 그대로 넘기면 안 된다 — 1.7e9 초다. GLSL highp float 는
      //   유효숫자 7자리라 `ADV*uT` 가 1.1e11 이 되면 **파동·노이즈 인자가 통째로 뭉개진다**
      //   (1패스 실화면: 물이 흐르지도 반짝이지도 않는 뿌연 판이었다). 기준시각을 빼서 0 부터 센다.
      if (_waterT0 === null) _waterT0 = worldNow();
      const _tSec = (_t19.freezeT != null ? _t19.freezeT : (worldNow() - _waterT0) / 1000);
      _waterOn = _drawWaterLayer(ctx, W, H, camX, camY, _tSec);
      if (_waterOn) {
        // 화면에 걸치는 셀 범위 — iso 네 모서리 역변환
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (const [ix2, iy2] of [[camX - W / 2, camY - H / 2], [camX + W / 2, camY - H / 2],
                                  [camX - W / 2, camY + H / 2], [camX + W / 2, camY + H / 2]]) {
          const wx2 = (2 * iy2 + ix2) / 2, wy2 = (2 * iy2 - ix2) / 2;
          if (wx2 < mnx) mnx = wx2; if (wx2 > mxx) mxx = wx2;
          if (wy2 < mny) mny = wy2; if (wy2 > mxy) mxy = wy2;
        }
        if (!_t19.prismOff)
          _nPrism = _drawPrisms(ctx, toScreen, Math.floor(mnx / 32) - 1, Math.floor(mny / 32) - 1,
                                Math.ceil(mxx / 32) + 1, Math.ceil(mxy / 32) + 1);
        // ★[재민 지적] 물가 풀 넘김 — 뭍의 **자기 풀 텍스처**를 물 위로 몇 px 넘겨 셀 경계의
        //   칼자국을 없앤다. 물·프리즘 **뒤**라서 물에 안 가려진다. 지면 타일과 같은 격자·같은 캐시.
        if (!_t19.shoreOff && !_LEG && _gtexReady >= 3) {
          const _sx0 = Math.floor((camX - W / 2) / GT_W), _sx1 = Math.floor((camX + W / 2) / GT_W);
          const _sy0 = Math.floor((camY - H / 2) / GT_H), _sy1 = Math.floor((camY + H / 2) / GT_H);
          for (let ty = _sy0; ty <= _sy1; ty++) for (let tx = _sx0; tx <= _sx1; tx++) {
            const k2 = tx + '_' + ty;
            let e2 = _shoreTiles.get(k2);
            if (!e2) { e2 = _bakeShoreTile(tx, ty, _zlist); _shoreTiles.set(k2, e2); }
            if (e2.cv) { ctx.drawImage(e2.cv, Math.round(tx * GT_W - camX + W / 2), Math.round(ty * GT_H - camY + H / 2)); _nShore += e2.n; }
          }
          if (_shoreTiles.size > 400) _shoreTiles.clear();
        }
      }
    }
    window._waterAcc = (window._waterAcc || 0) + (performance.now() - _wtT0);
    // 카메라 셀의 흐름 벡터 — 하네스가 "물이 **하류로** 흐르는가"를 재려면 기대 방향이 필요하다
    //   (하네스가 rivers path 를 다시 파싱하면 그게 사본이다 — 정본 계산을 그대로 물어본다).
    const _fw = _waterOn ? _flowAtCell(Math.floor(_camAbs.x / 32), Math.floor(_camAbs.y / 32)) : [0, 0];
    window.__waterDbg = { on: _waterOn, webgl: _wgl.ok, prisms: _nPrism, shore: _nShore, shoreTiles: _shoreTiles.size, flowKey: _wfCache.key,
                          segs: _riverSegs ? _riverSegs.length : 0, flowAtCam: _fw, rect: _wfCache.rect,
                          flowIso: [_fw[0] - _fw[1], (_fw[0] + _fw[1]) / 2],
                          camCell: [Math.floor(_camAbs.x / 32), Math.floor(_camAbs.y / 32)],
                          pend: window.__wfPendN || 0, askR: WF_ASK_R,
                          segGrid: _segGrid.map ? _segGrid.map.size : 0, flowCache: _flowCellCache.size,
                          buildMs: window.__wfBuildMs || 0, buildMax: window.__wfBuildMax || 0,
                          buildN: window.__wfBuildN || 0, wetReuse: window.__wfReuse || 0 };
    // ★[물가 렉 계측] 흐름 텍스처 원점을 실제 주행처럼 옮겨 가며 **정본 `_buildFlowTex` 를 그대로**
    //   호출해 장당 시간을 잰다. 계측기가 계산을 다시 쓰지 않는다(사본 금지) — 렌더러가 부르는
    //   그 함수를 부른다. 걸어서 재려면 512px 마다 8초가 걸려 A/B 를 못 돈다.
    //   step = 원점 이동(셀). 16 = 실제 주행 한 칸(겹침 87.5%) · 128 = 완전히 새 땅.
    // ★[재민 2026-08-24 "물은 북→남인데 반대로 흐르는 띠가 있다"] 흐름 **방향**을 화면 좌표로 뽑는다.
    //   지금까지 세 번의 계측이 전부 헛다리였던 이유: 셋 다 움직임의 **크기**만 쟀다(열별 표준편차·
    //   경사 이음매·모션 히트맵). 방향이 뒤집힌 띠는 크기가 이웃과 똑같아서 셋 다 못 본다.
    //   계측기가 방향을 다시 계산하면 사본이다 — 셰이더가 읽는 그 값(`_flowAtCell`)을 그대로 묻고,
    //   화면 좌표도 렌더러와 **같은 식**(iso = wx-wy, (wx+wy)/2)으로 낸다.
    window.__flowMap = (R) => {
      R = R || 40;
      const c0 = Math.floor(_camAbs.x / 32), c1 = Math.floor(_camAbs.y / 32);
      const out = [];
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const cx = c0 + i, cy = c1 + j;
        if (!isWaterAtAbs(cx * 32 + 16, cy * 32 + 16)) continue;
        const f = _flowAtCell(cx, cy);
        out.push([cx, cy, +f[0].toFixed(4), +f[1].toFixed(4), +(f[2] || 0).toFixed(3)]);
      }
      return { cam: [camX, camY], camCell: [c0, c1], drop: WATER_DROP, W: W, H: H, cells: out };
    };
    window.__wfProbe = (n, step) => {
      const out = []; const bx = _wfCache.ox, by = _wfCache.oy;
      const keepPrev = _wfPrev.wet, keepOx = _wfPrev.ox, keepOy = _wfPrev.oy, keepKey = _wfCache.key;
      for (let i = 1; i <= n; i++) {
        window.__wfFlowMs = 0; window.__wfFlowN = 0;
        const t0 = performance.now();
        _buildFlowTex(null, bx + i * step, by + i * step);
        out.push({ ms: +(performance.now() - t0).toFixed(1), wet: +(window.__wfWetMs || 0).toFixed(1),
                   phi: +(window.__wfPhiMs || 0).toFixed(1),
                   flow: +(window.__wfFlowMs || 0).toFixed(1), flowN: window.__wfFlowN || 0,
                   reuse: window.__wfReuse || 0, asked: window.__wfAsked || 0, pend: window.__wfPending || 0 });
      }
      _wfPrev.wet = keepPrev; _wfPrev.ox = keepOx; _wfPrev.oy = keepOy; _wfCache.key = keepKey;
      return out;
    };
    // ★[물가 렉 A/B] 캐시를 식혀 **처음 보는 땅**의 비용을 다시 재게 한다. 같은 길을 두 번
    //   걸어 손잡이만 바꿔 비교하려면 이게 있어야 한다(안 그러면 두 번째 주행이 캐시로 공짜다).
    window.__wfReset = () => {
      _flowCellCache.clear(); _flowCellOld.clear(); _wfPrev.wet = null; _wfCache.key = null; _wfCache.pending = false;
      _waterCellCache.clear();
      window.__wfBuildMs = 0; window.__wfBuildMax = 0; window.__wfBuildN = 0; window.__wfBuildSum = 0;
      window.__wfFirstMs = 0; window.__wfSteadyN = 0; window.__wfSteadySum = 0;
    };
    // === 2) 엔티티 수집 (depth sort용) ===
    const renderables = [];
    const renderT = performance.now() - INTERP_DELAY_MS;
    // ★[배치 20 A] 산 세그먼트 — 엔티티와 **같은 목록**에 태워 z 정렬한다(앵커 wx+wy).
    //   따로 그리면 산 뒤에 선 사람이 산 위로 뜬다.
    const _mtT0 = performance.now();
    const _nMt = _mtCollect(renderables, worldCx, worldCy);
    window._mtAcc = (window._mtAcc || 0) + (performance.now() - _mtT0);
    window.__mtDbg = { mt3d: !_t19.mt3dOff, mt3budget: MT3_BUDGET, mt3view: MT3_VIEW, mt3rockc: _mt3RockC.size, mt3chunks: _mt3Chunk.size, mt3fail: !!_mt3Fail, mt3culled: _mt3Culled, mt3cull: MT3_CULL, mt3over: +_mt3Over.toFixed(2), mt3overTight: +_mt3OverT.toFixed(2), mt3overPaint: +_mt3OverP.toFixed(2), mt3near90: _mt3Near, mt3skip: _mt3Skip, mt3skipMaxH: _mt3SkipMax, mt3pad: MT3_PAD, mt3dcap: MT3_DCAP,
      mt3bakeMs: +_mt3BakeMs.toFixed(1), mt3bakeN: _mt3BakeN, segs: _nMt, sprites: _mtLoaded + '/' + _mtWanted, cached: _mtSegCache.size, chunks: _mtChunk.size, legacy: !!_t19.mtLegacy, destroyed: _mtDestroyed.size };
    // ★★[배치 20 C] 산 계측·파괴 훅 — 하네스가 배치 수학을 **다시 쓰지 않게** 정본이 만든
    //   세그먼트를 그대로 내보낸다. 하네스가 능선 보행·밴드 실측을 재구현하면 그게 사본이라
    //   둘이 같이 틀려도 통과한다(자명 통과).
    window.__mtProbe = () => {
      const H = _hardTerrain; if (!H || !_mtAnchors) return null;
      const out = [];
      if (!_t19.mtLegacy) {                      // 덮개 배치 — 카메라 주변 청크의 정본 세그먼트
        const z0 = zonesMeta[primaryZoneId]; if (!z0) return out;
        const ox0 = z0.worldOffsetX, oy0 = z0.worldOffsetY || 0;
        const cc = Math.floor(worldCx / 32), rc = Math.floor(worldCy / 32);
        for (let gy = Math.floor((rc - 60) / MT_CH); gy <= Math.floor((rc + 60) / MT_CH); gy++)
          for (let gx = Math.floor((cc - 60) / MT_CH); gx <= Math.floor((cc + 60) / MT_CH); gx++)
            for (const g2 of _mtChunkSegs(primaryZoneId, gx, gy))
              out.push({ ridge: g2.tier, ri: 0, x: g2.x, y: g2.y, nm: g2.name, sc: g2.sc, vy: g2.vy,
                         lcx: Math.floor((g2.x - ox0) / 32), lcy: Math.floor((g2.y - oy0) / 32) });
        return out;
      }
      for (const zid in H) {
        const z = zonesMeta[zid]; if (!z || zid !== primaryZoneId) continue;
        const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
        const rs = H[zid].ridges || [];
        for (let ri = 0; ri < rs.length; ri++) {
          const segs = _mtPlaceRidge(zid, rs[ri], ox, oy, ri);
          for (const g2 of segs) out.push({ ridge: rs[ri].name, ri, x: g2.x, y: g2.y, nm: g2.name, sc: g2.sc,
                                            lcx: Math.floor((g2.x - ox) / 32), lcy: Math.floor((g2.y - oy) / 32) });
        }
      }
      return out;
    };
    // 파괴 이벤트의 **클라 쪽 규격** — 서버 메커니즘이 생기면 방송이 이 함수를 부르면 된다.
    //   (§A-6 실측: 서버에 바위 셀 제거 메커니즘이 아직 0건이다.)
    window.__mtDestroy = (cells) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return 0;
      let n2 = 0;
      for (const [lcx, lcy] of (cells || [])) {
        const wx = c.meta.worldOffsetX + lcx * 32, wy = (c.meta.worldOffsetY || 0) + lcy * 32;
        _mtDestroyed.add(primaryZoneId + '_' + Math.floor(wx / 32) + '_' + Math.floor(wy / 32)); n2++;
        _mt3InvalidateCell(primaryZoneId, Math.floor(wx / 32), Math.floor(wy / 32));
      }
      _mtSegCache.clear(); _mtChunk.clear();     // 밴드/가장자리 실측이 바뀌었으니 배치를 다시 계산한다
      _gtInvalidateCells(c, (cells || []).flat(), 2);   // 지면(바위색)도 그 자리만 다시 굽는다
      needsRedraw = true;
      return n2;
    };
    // ★가상 위치에서의 가림 계측 — 하네스가 자리를 찾을 때 **정본 판정을 그대로** 쓴다.
    //   배치 수학을 node 쪽에서 다시 쓰면(사본) 둘이 같이 틀려도 통과한다.
    // ★★셀 하나를 **누가** 덮는지 정본에서 묻는다 [재민 "정확하게 산 셀인 곳에만"]
    //   앞서 두 번, 넘침을 '규칙'(남동 부채꼴 / 바위까지 거리)으로 가르려다 둘 다 헐거웠다.
    //   정확한 기준은 스프라이트 자체에 있다: 앵커의 세로 위치 v0 = oy/h 를 기준으로
    //     · v < v0  → 셀이 앵커보다 **화면 위** = 산 몸통 뒤에 가림(정상)
    //     · v > v0  → 셀이 앵커보다 **화면 아래** = 산의 **앞 치맛자락**이 얹힘(결함)
    //   여기에 앵커 셀이 바위가 아니면 그것도 결함이다.
    window.__mtSpillAt = (lcx, lcy) => {
      const z0 = zonesMeta[primaryZoneId]; if (!z0 || !_mtLastRend || !_mtToScr) return null;
      const ox0 = z0.worldOffsetX, oy0 = z0.worldOffsetY || 0;
      const wx = ox0 + lcx * 32 + 16, wy = oy0 + lcy * 32 + 16;
      const pIso = w2i(wx, wy), ps = _mtToScr(pIso.x, pIso.y);
      let cov = 0, foot = 0, offRock = 0, mt3Skipped = 0;
      for (const it of _mtLastRend) {
        if (it.kind !== 'mtseg') continue;
        // ★이 훅은 **스프라이트 판 전용**이다. 높이장 판(sg.mt3)은 sg.name 이 없어 아래에서
        //   전부 걸러진다 — 조용히 0 을 돌려주면 "넘침 0%"가 자명 통과가 된다.
        //   ⇒ 몇 장을 못 봤는지 **세어서 내보낸다**. 하네스가 이 값으로 훅의 눈멂을 잡는다.
        if (it.sg && it.sg.mt3) { mt3Skipped++; continue; }
        const sg = it.sg, an = _mtAnchors[sg.name], im = MTX[sg.name];
        if (!an || !im || !im.naturalWidth) continue;
        const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
        const W = im.naturalWidth * sc, H = im.naturalHeight * sc * vy;
        const c = _mtToScr(w2i(sg.x, sg.y).x, w2i(sg.x, sg.y).y);
        const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
        const u = (ps.x - dx) / W, v = (ps.y - dy) / H;
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue;
        if (_mtAlphaAt(sg.name, u, v) <= 0.30) continue;
        cov++;
        const v0 = an.oy / im.naturalHeight;           // 앵커(발치)의 세로 위치
        if (v > v0 + 0.02) foot++;                     // 앵커보다 아래 = 앞 치맛자락
        if (!_mtRockAt(primaryZoneId, sg.x, sg.y)) offRock++;
      }
      return { cov, foot, offRock, mt3Skipped };
    };
    // 여유 셀을 바꿔 가며 **한 번의 부팅으로 여러 값을 재기** 위한 훅(probe-mttol 이 쓴다)
    window.__mtSetTol = (v) => { MT_FIT_TOL = +v; _mtChunk.clear(); needsRedraw = true; return MT_FIT_TOL; };
    window.__mtOccAt = (wx, wy) => {
      if (!_mtToScr || !_mtAnchors || !_mtLastRend) return null;
      const p = w2i(wx, wy), sp = _mtToScr(p.x, p.y);
      const save = _mtOcc;
      _mtOcc = { x: sp.x, y: sp.y - 14, z: (wx + wy) * 0.5 + MT_OCC_ZB };
      let n = 0, front = 0, back = 0;
      for (const it of _mtLastRend) {
        if (it.kind !== 'mtseg') continue;
        if (_mtFadeSide(it.sg, it.z)) front++; else back++;   // ★'앞' = 정본 술어 그대로
        if (_mtOccludesMe(it.sg, it.z)) n++;
      }
      _mtOcc = save;
      return { n, front, back };
    };
    // 정본 바위 술어(파괴 반영) — 하네스가 '가장자리에서만 판다' 규칙을 **사본 없이** 검사한다
    window.__mtIsRock = (lcx, lcy) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return null;
      const cx = Math.floor((c.meta.worldOffsetX + lcx * 32) / 32);
      const cy = Math.floor(((c.meta.worldOffsetY || 0) + lcy * 32) / 32);
      return !!_mt3RockCell(primaryZoneId, cx, cy);
    };
    // 시험 손잡이 — 가림 판정의 플레이어 z 편향. 0=앞 벽 전부, 500=현행
    // 정본 높이장에서 그 셀의 높이(m)를 읽는다 — 하네스가 벽 높이를 사본 없이 잰다
    window.__mtHeightAt = (lcx, lcy) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return null;
      const cx = Math.floor((c.meta.worldOffsetX + lcx * 32) / 32);
      const cy = Math.floor(((c.meta.worldOffsetY || 0) + lcy * 32) / 32);
      const gx = Math.floor(cx / MT3_CH), gy = Math.floor(cy / MT3_CH);
      const F = _mt3Field(primaryZoneId, gx, gy); if (!F) return 0;
      return +F.hAt(cx - F.i0, cy - F.j0).toFixed(2);
    };
    // 격자 조회 — 청크마다 필드를 **한 번만** 굽고 그 안의 셀을 몰아서 읽는다.
    //   (셀마다 __mtHeightAt 를 부르면 청크 필드를 매번 다시 굽는다 — 40×40 챔퍼 × 셀 수.)
    window.__mtHeightGrid = (lcx0, lcy0, w, h) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return null;
      const bx = Math.floor(c.meta.worldOffsetX / 32), by = Math.floor((c.meta.worldOffsetY || 0) / 32);
      const out = new Float32Array(w * h);
      const byChunk = new Map();
      for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) {
        const cx = bx + lcx0 + a, cy = by + lcy0 + b;
        const k = Math.floor(cx / MT3_CH) + '_' + Math.floor(cy / MT3_CH);
        let arr = byChunk.get(k); if (!arr) byChunk.set(k, arr = []);
        arr.push([cx, cy, b * w + a]);
      }
      for (const [k, arr] of byChunk) {
        const p = k.split('_');
        const F = _mt3Field(primaryZoneId, +p[0], +p[1]);
        for (const [cx, cy, idx] of arr) out[idx] = F ? F.hAt(cx - F.i0, cy - F.j0) : 0;
      }
      return Array.from(out);
    };
    // 화면 한 점을 **어느 띠가 실제로 칠했나** — 정본이 그린 캔버스의 알파를 직접 읽는다.
    //   '띠가 덮는다'와 '그 화소를 칠한다'는 다른 말이다. 후자를 재야 원인이 좁혀진다.
    window.__mtPaintAt = (sx, sy) => {
      if (!_mtToScr || !_mtLastRend) return null;
      let cover = 0, paint = 0; const hits = [];
      for (const it of _mtLastRend) {
        if (it.kind !== 'mtseg') continue;
        const sg = it.sg; if (!sg.mt3 || !sg.img) continue;
        const p = w2i(sg.x, sg.y), c = _mtToScr(p.x, p.y);
        const ux = Math.round(sx - (c.x - sg.ox)), uy = Math.round(sy - (c.y - sg.oy));
        if (ux < 0 || uy < 0 || ux >= sg.img.width || uy >= sg.img.height) continue;
        cover++;
        let a = 0;
        try { a = sg.img.getContext('2d').getImageData(ux, uy, 1, 1).data[3]; } catch (e) { a = -1; }
        if (a > 8) { paint++; if (hits.length < 6) { let px = null;
          try { const d = sg.img.getContext('2d').getImageData(ux, uy, 1, 1).data; px = [d[0], d[1], d[2], d[3]]; } catch (e) {}
          hits.push({ z: Math.round(it.z), rgba: px, w: sg.img.width, h: sg.img.height, uy }); } }
      }
      return { cover, paint, hits };
    };
    // 화면 한 점을 **어느 셀의 표면이 덮어야 하는가** — 정본 필드(corS)로 직접 푼다.
    //   "안 칠했다"는 관측을 셀 이름까지 좁히는 계측기. 칠한 띠를 세는 __mtPaintAt 의 짝이다.
    window.__mtWhoCovers = (sx, sy, R) => {
      if (!_mtToScr) return null;
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return null;
      const me = window.__getMyAbs ? window.__getMyAbs() : null; if (!me) return null;
      const pi = Math.floor(me.x / 32), pj = Math.floor(me.y / 32);
      R = R || 70;
      const Fc = new Map();
      const fieldOf = (cx, cy) => {
        const gx = Math.floor(cx / MT3_CH), gy = Math.floor(cy / MT3_CH), k = gx + ',' + gy;
        if (!Fc.has(k)) Fc.set(k, _mt3Field(primaryZoneId, gx, gy) || null);
        return Fc.get(k);
      };
      const P = (F, ci, cj) => {                       // 셀 국소좌표 → 화면
        const wxp = (F.i0 + ci) * 32, wyp = (F.j0 + cj) * 32;
        return _mtToScr(wxp - wyp, (wxp + wyp) * 0.5 - F.corS(ci, cj) * 32);
      };
      // ★★[계측기 수리 2026-08-24] 볼록 부호 판정을 쓰다가 **틀린 관측**을 냈다.
      //   급경사에서는 모서리 높이차(최대 96px)가 셀 다이아(32px)보다 커서 사각형이
      //   **나비넥타이(자기교차)** 가 된다. 볼록 판정은 그때 전부 '바깥'이라 답한다.
      //   그 탓에 "갈색 6점 중 5점은 덮을 셀이 0장"이라는 결론을 냈었다 — 철회한다.
      //   ⇒ GL 이 실제로 그리는 대로 **삼각형 둘**로 나눠 본다(사본이 아니라 같은 분할).
      const inTri = (a, b, c, x, y) => {
        const d1 = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        const d2 = (c.x - b.x) * (y - b.y) - (c.y - b.y) * (x - b.x);
        const d3 = (a.x - c.x) * (y - c.y) - (a.y - c.y) * (x - c.x);
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      };
      const inQuad = (q, x, y) => inTri(q[0], q[1], q[2], x, y) || inTri(q[0], q[2], q[3], x, y);
      const out = { hit: [], scanned: 0, noField: 0 };
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const cx = pi + di, cy = pj + dj;
        const F = fieldOf(cx, cy); if (!F) { out.noField++; continue; }
        const i = cx - F.i0, j = cy - F.j0;
        if (!F.isRock(i, j)) continue;
        out.scanned++;
        const q = [P(F, i, j), P(F, i + 1, j), P(F, i + 1, j + 1), P(F, i, j + 1)];
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const t of q) { if (t.x < x0) x0 = t.x; if (t.x > x1) x1 = t.x; if (t.y < y0) y0 = t.y; if (t.y > y1) y1 = t.y; }
        if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
        if (!inQuad(q, sx, sy)) continue;
        out.hit.push({ i: cx, j: cy, h: +F.corS(i + 0.5, j + 0.5).toFixed(1), cut: !!F.isCut(i, j),
                       z: Math.round((cx * 32 + 16 + cy * 32 + 16) * 0.5) });
      }
      out.hit.sort((a, b) => b.z - a.z);
      return out;
    };
    window.__mtStage = (pts) => { _mtStagePts = (pts && pts.length) ? pts : null; _mtStageLog = null; needsRedraw = true; return _mtStagePts ? _mtStagePts.length : 0; };
    window.__mtStageGet = () => _mtStageLog;
    // 이 셀이 메시에 드는가 — ⓑ2("산이 바위 밖으로 넘치지 않는가")의 정본 판정기.
    //   ★스프라이트 시절의 `__mtSpillAt` 은 높이장 판(sg.mt3)을 **못 본다**(sg.name 이 없다).
    //     그 훅으로 재면 cov 가 늘 0 이라 "넘침 0%"가 자명 통과가 된다. 메시 소속으로 잰다.
    window.__mt3MeshAt = (lcx, lcy) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return null;
      const cx = Math.floor((c.meta.worldOffsetX + lcx * 32) / 32);
      const cy = Math.floor(((c.meta.worldOffsetY || 0) + lcy * 32) / 32);
      const F = _mt3Field(primaryZoneId, Math.floor(cx / MT3_CH), Math.floor(cy / MT3_CH));
      if (!F) return { mesh: false, rock: false, adj: false, cut: false };
      const i = cx - F.i0, j = cy - F.j0;
      const rock = !!F.isRock(i, j);
      let adj = false;
      for (let q = -1; q <= 1 && !adj; q++) for (let r = -1; r <= 1; r++)
        if (F.isRock(i + r, j + q)) { adj = true; break; }
      return { mesh: _mt3IsMesh(F, i, j), rock, adj, cut: !!F.isCut(i, j) };
    };
    window.__mtDual = (v) => { MT3_DUAL = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_DUAL; };
    window.__mtZOcc = (v) => { MT_OCC_ZB = +v; needsRedraw = true; return MT_OCC_ZB; };
    // ② 경계 오프셋 손잡이 — 발치(0)에서 위로 미는 화면 px. 후보를 그림 짝으로 고른다.
    window.__mtFadeZOff = (v) => { MT_FADE_ZOFF = +v; needsRedraw = true; return MT_FADE_ZOFF; };
    window.__mtFadeZSoft = (v) => { MT_FADE_ZSOFT = +v; needsRedraw = true; return MT_FADE_ZSOFT; };
    // 화면 가로줄 손잡이 — 1=자른다(기본) · 0=옛 방식(띠 z 만). 아래로 미는 여유는 px.
    window.__mtFadeClip = (v) => { MT_FADE_CLIP = v ? 1 : 0; needsRedraw = true; return MT_FADE_CLIP; };
    window.__mtFadeYOff = (v) => { MT_FADE_YOFF = +v; needsRedraw = true; return MT_FADE_YOFF; };
    window.__mtClearDestroy = () => {
      const n2 = _mtDestroyed.size;
      // ★되돌릴 때도 **부술 때와 같은 무효화**를 돌려야 3D 띠가 다시 구워진다.
      //   키는 `zid_cx_cy` — 존 이름에 '_' 가 있어도 안전하게 **뒤에서** 자른다.
      for (const k of _mtDestroyed) {
        const i2 = k.lastIndexOf('_'); if (i2 < 1) continue;
        const i1 = k.lastIndexOf('_', i2 - 1); if (i1 < 0) continue;
        _mt3InvalidateCell(k.slice(0, i1), +k.slice(i1 + 1, i2), +k.slice(i2 + 1));
      }
      _mtDestroyed.clear(); _mtSegCache.clear(); _mtChunk.clear(); _groundTiles.clear();
      needsRedraw = true; return n2;
    };
    // ★[배치 21] 자연물 산포 — 물가 술 + 초원 소품. 산 세그먼트와 같은 목록·같은 z 규약.
    const _natT0 = performance.now();
    const _natItems = [];
    const _nNat = _natCollect(_natItems, worldCx, worldCy);
    _natItems.sort((a, b) => a.z - b.z);
    window._natAcc = (window._natAcc || 0) + (performance.now() - _natT0);
    window.__natDbg = { fringe: _nNat[0], props: _nNat[1], sprites: _natLoaded + '/' + _natWanted,
                        chunks: _natChunk.size, blocked: _natBlockSet ? _natBlockSet.size : 0,
                        trees: _treeSpritesLoaded, treeDraw: { n: _treeDraw.n, h: _treeDraw.h, px: _treeDraw.px, aspect: _treeDraw.aspect } };

    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      for (const r of c.resources.values()) {
        const ax = ox + r.x, ay = oy + r.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        renderables.push({ z: iso.y, kind: 'resource', r, iso, ax, ay, wx: ax, wy: ay });
      }
      // Phase 14.23: ground item 렌더
      if (c.groundItems) {
        for (const gi of c.groundItems.values()) {
          const ax = ox + gi.x, ay = oy + gi.y;
          if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
          const iso = w2i(ax, ay);
          renderables.push({ z: iso.y + 5, kind: 'ground_item', gi, iso, ax, ay, wx: ax, wy: ay });
        }
      }
      for (const cl of c.claims.values()) {
        // guild claim은 가장 배경(z 가장 작게)으로 — 너무 많아서 다른 거 가리지 않게
        const cax = ox + cl.x + cl.w/2, cay = oy + cl.y + cl.h/2;
        if (Math.abs(cax - worldCx) > VIEW_RADIUS + 200 || Math.abs(cay - worldCy) > VIEW_RADIUS + 200) continue;
        const baseZ = cl.kind === 'guild' ? -800 : -400;
        renderables.push({ z: w2i(cax, cay).y + baseZ, kind: 'claim', cl, off: ox, offY: oy, wx: cax, wy: cay });
      }
      // §16 답압 길: 등급 셀 바닥 틴트(베이크 무접촉 오버레이 — 흙길/다져진 길). 시야 내만 push.
      if (c.roads && c.roads.size) {
        for (const [rk, lv] of c.roads) {
          const ci = rk.indexOf(','); const rcx = +rk.slice(0, ci), rcy = +rk.slice(ci + 1);
          const rax = ox + rcx * CL_BUILDING_SIZE + 16, ray = oy + rcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(rax - worldCx) > VIEW_RADIUS || Math.abs(ray - worldCy) > VIEW_RADIUS) continue;
          renderables.push({ z: w2i(rax, ray).y - 950, kind: 'road', rcx: rax - 16, rcy: ray - 16, lv, wx: rax, wy: ray });
        }
      }
      // ★[다리 층] 통나무 널다리 상판 — 길(-950)보다 위, 건물보다 아래(-930). 물 위 정적 사물.
      if (c.bridges && c.bridges.size) {
        for (const bk of c.bridges) {
          const ci = bk.indexOf(','); const bcx = +bk.slice(0, ci), bcy = +bk.slice(ci + 1);
          const bax = ox + bcx * CL_BUILDING_SIZE + 16, bay = oy + bcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(bax - worldCx) > VIEW_RADIUS || Math.abs(bay - worldCy) > VIEW_RADIUS) continue;
          // ★스프라이트 종류 판정(다리 셀 집합만으로 결정 — 서버 페이로드 불변):
          //   다리는 폭 2셀이라 축 판정에 이웃 1칸만 보면 평행한 옆줄 때문에 헷갈린다 → **2칸 앞까지** 세어
          //   더 길게 뻗은 쪽을 다리 축으로 잡는다. 그 축 방향으로 이웃이 없는 쪽 = 뭍에 닿는 끝(cap).
          const cnt = (dx, dy) => { let n = 0; for (let k = 1; k <= 2; k++) if (c.bridges.has((bcx + dx * k) + ',' + (bcy + dy * k))) n++; return n; };
          const ax = (cnt(-1, 0) + cnt(1, 0)) >= (cnt(0, -1) + cnt(0, 1)) ? 'x' : 'y';
          const hiN = ax === 'x' ? c.bridges.has((bcx + 1) + ',' + bcy) : c.bridges.has(bcx + ',' + (bcy + 1));
          const loN = ax === 'x' ? c.bridges.has((bcx - 1) + ',' + bcy) : c.bridges.has(bcx + ',' + (bcy - 1));
          const bs = 'bridge_' + (!hiN ? 'cap1' : (!loN ? 'cap0' : 'mid')) + '_' + ax;
          renderables.push({ z: w2i(bax, bay).y - 930, kind: 'bridge', bx: bax, by: bay, bk, bs, wx: bax, wy: bay });
        }
      }
      // ★★[11차 T3 환호] 도랑 타일 — 길(-950)보다 위, 다리(-930)보다 아래(-940). 마을 소유 정적 사물.
      //   축 판정은 다리와 **같은 규약**(2칸 앞까지 세어 긴 쪽이 도랑 축) — 폭 2셀이라 이웃 1칸만 보면 옆줄에 헷갈린다.
      //   모서리(양축 모두 뻗음) = ditch_c. 스프라이트가 없으면 파인 흙 다이아로 폴백(도랑이 안 보이면 함정이 된다).
      if (c.ditches && c.ditches.size) {
        for (const dk of c.ditches) {
          const ci = dk.indexOf(','); const dcx = +dk.slice(0, ci), dcy = +dk.slice(ci + 1);
          const dax = ox + dcx * CL_BUILDING_SIZE + 16, day2 = oy + dcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(dax - worldCx) > VIEW_RADIUS || Math.abs(day2 - worldCy) > VIEW_RADIUS) continue;
          const cnt = (dx, dy) => { let n = 0; for (let k = 1; k <= 2; k++) if (c.ditches.has((dcx + dx * k) + ',' + (dcy + dy * k))) n++; return n; };
          const hx = cnt(-1, 0) + cnt(1, 0), hy = cnt(0, -1) + cnt(0, 1);
          const ds = (hx >= 2 && hy >= 2) ? 'ditch_c' : (hx >= hy ? 'ditch_x' : 'ditch_y');
          renderables.push({ z: w2i(dax, day2).y - 940, kind: 'ditch', bx: dax, by: day2, ds, wx: dax, wy: day2 });
        }
      }
      // ★[곳간② 재고 표시] 곳간 사다리 앞 칸(cx, cy+2)에 짐더미 — 재고 구간 2단계.
      //   곳간은 문 없는 고상 구조라 사다리 칸이 NPC의 저장·인출 자리다(서버 _granLadder와 같은 셀).
      //   z는 자원과 동형(iso.y)이라 곳간 벽·NPC와 깊이 정렬이 맞는다.
      if (c.granStock && c.granStock.size) {
        for (const [gk, st] of c.granStock) {
          if (!(st > 0)) continue;
          const ci = gk.indexOf(','); const gc0 = +gk.slice(0, ci), gcx = gc0, gcy = +gk.slice(ci + 1) + 2;   // 사다리 칸
          const gax = ox + gcx * CL_BUILDING_SIZE + 16, gay = oy + gcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(gax - worldCx) > VIEW_RADIUS || Math.abs(gay - worldCy) > VIEW_RADIUS) continue;
          renderables.push({ z: w2i(gax, gay).y, kind: 'granpile', gx: gax, gy: gay, st, wx: gax, wy: gay });
          // ★[곳간 연출 세분화] 벽에 기대 놓은 소품(멍석 말이·삼태기) — 사다리 옆 칸(발자국 남동 모서리 밖).
          //   재고가 있는 곳간에만(=사람이 드나드는 곳간) 놓아 '쓰이는 창고'로 읽히게 한다.
          const pax = ox + (gc0 + 2) * CL_BUILDING_SIZE + 16, pay = gay;
          renderables.push({ z: w2i(pax, pay).y, kind: 'granpile', gx: pax, gy: pay, prop: 1, wx: pax, wy: pay });
        }
      }
      // ★★[10차 T4 장마당] 캐러밴이 큰집 마당에 머무는 동안에만 좌판이 깔린다(서버 markets = phase 'linger' 목적지).
      //   자리 = 큰집 남벽 문(ccx, ccy+3~4) 앞 마당 원판 — 문 통로(ccx 열)는 비워 두고 좌우로 흩어 놓는다.
      //   고증(A-1): 상설 점포가 아니라 **폈다 걷는 물건**이라 캐러밴이 떠나면 이 배열 자체가 사라진다.
      if (c.markets && c.markets.length) {
        for (let mi = 0; mi + 1 < c.markets.length; mi += 2) {
          const mcx = c.markets[mi], mcy = c.markets[mi + 1];
          for (const [_mk, _mdx, _mdy] of MARKET_STALLS) {
            const _mx = ox + (mcx + _mdx) * CL_BUILDING_SIZE + 16, _my = oy + (mcy + _mdy) * CL_BUILDING_SIZE + 16;
            if (Math.abs(_mx - worldCx) > VIEW_RADIUS || Math.abs(_my - worldCy) > VIEW_RADIUS) continue;
            renderables.push({ z: w2i(_mx, _my).y, kind: 'cellprop', key: _mk, gx: _mx, gy: _my, wx: _mx, wy: _my });
          }
        }
      }
      // §4-4 Stage 4A: 마을 시뮬 영토 — 경계 셀(b: [dx,dy,mask...]) 반투명 렌더. claim보다 더 배경(-900).
      if (c.simVillages) {
        for (const v of c.simVillages) {
          const vcx = ox + v.cx * CL_BUILDING_SIZE + 16, vcy = oy + v.cy * CL_BUILDING_SIZE + 16;
          const cullR = (v.r || 1200);
          if (Math.abs(vcx - worldCx) > VIEW_RADIUS + cullR || Math.abs(vcy - worldCy) > VIEW_RADIUS + cullR) continue;
          renderables.push({ z: w2i(vcx, vcy).y - 900, kind: 'simvil', v, off: ox, offY: oy, wx: vcx, wy: vcy });
        }
      }
      // §11 도적: 소굴·야영 마커 1종(서버 bandit_camps) — 점유 단은 진하게, 빈 소굴은 흐리게
      if (c.banditCamps) {
        for (const bc of c.banditCamps) {
          const bx = ox + bc.x, by = oy + bc.y;
          if (Math.abs(bx - worldCx) > VIEW_RADIUS + 200 || Math.abs(by - worldCy) > VIEW_RADIUS + 200) continue;
          renderables.push({ z: w2i(bx, by).y - 300, kind: 'banditcamp', bc, off: ox, offY: oy, wx: bx, wy: by });
        }
      }
      const _hutRs = [], _hutSeen = new Set();   // ★[침대 진입] 이번 프레임 움집 렉트+지붕 표시 여부 — 실내 NPC 가림 판정(others 루프 소비)
      // ★★[2026-08-04c 배치 17 ①] **실내 컷어웨이가 한 번도 안 먹던 원인 — 좌표계 불일치.**
      //   `data.hut`·`data.bld` 렉트는 **존 로컬 셀**이다(서버가 b.cx 로 굽는다). 그런데 실내 판정은
      //   `myAbsPredicted`(월드 절대)를 32 로 나눠 비교하고 있었다. 한반도는 worldOffsetX=409,984 이라
      //   플레이어 셀이 13,775 로 나오고 렉트는 960~967 이다 — **영원히 false.**
      //   그래서 큰집·움집 안에 서 있어도 지붕이 안 걷히고, 남·동벽도 안 눕고, 실내 NPC 가림도 안 됐다.
      //   (재민 실화면 재현: /tmp/b17-shots/in_hall.png — 큰집 안인데 지붕이 온전하고 플레이어가 그 위에 떠 있다.)
      //   ⇒ 이 존의 **로컬 셀**로 바꾼다. 존을 여러 개 캐시해도 각자 제 원점으로 재므로 안전하다.
      const _myLcx = Math.floor((myAbsPredicted.x - ox) / CL_BUILDING_SIZE);
      const _myLcy = Math.floor((myAbsPredicted.y - oy) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        // ★움집 지붕: 서버 태그 data.hut=[x0,y0,x1,y1] — 지붕은 벽 유닛(64px) '위에' 얹힌 스프라이트[사용자 확정: 유닛 문법].
        //   벽은 항상 그대로 렌더(통나무 스킨·문=벽 개구·콜라이더 불변). 바닥만 밖에서 억제(지붕에 가림) + 캐리어 1셀이 지붕 합성.
        //   플레이어가 발자국 안/문 앞 1셀(0층)이면 지붕만 걷힘(컷어웨이) → 실내 바닥·가구 노출.
        // ★[에셋 2차] 고상곳간(data.gran) — 실물 벽·바닥은 시각만 억제(콜라이더·밀폐 불변), 캐리어 1셀이 통짜
        //   스프라이트(기둥+판벽+이엉) 합성. 컷어웨이 없음(문 없는 밀폐 — 반출입은 사다리 연출).
        const _granI = _bldSpr.granary || _granC;   // ★10차: 3D 스프라이트 우선, 없으면 베이크 폴백
        const _grn = _granI && b.data && b.data.gran;
        if (_grn) {
          if (b.type === 'floor') {
            const _fgx = Math.floor(b.x / CL_BUILDING_SIZE), _fgy = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fgx === _grn[2] && _fgy === _grn[3]) {   // 캐리어=남동단 바닥 1셀(스프라이트 전체가 이 z — 뒤 개체 가림 최대 보장)
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 200 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 200) {
                const _giso = w2i(rax - 160, ray - 96);   // 지붕 로컬 원점=발자국 북서(x0-0.5,y0-0.5) — 캐리어(x1,y1)에서 (-5,-3)셀... x:(x0-0.5)-(x1+0.5)=-5셀=-160, y:-3셀=-96
                renderables.push({ z: (rax + ray) * 0.5 + 40, kind: 'hutroof', img: _granI, iso: _giso, wx: rax, wy: ray });
              }
            }
          }
          continue;   // 벽·바닥 실물 렌더 억제(스프라이트가 대체)
        }
        // ★[에셋 2차] 큰집 지붕(data.bld) — 움집 문법 동형: 벽은 항상(통나무 스킨), 바닥=밖 억제, 캐리어=남행 문
        //   좌측 바닥 1셀이 지붕 합성. 컷어웨이=발자국 안/문앞 1셀(남벽 문 2칸 x0+3·x0+4).
        const _hallI = _bldSpr.hall_roof || _hallRoofC;   // ★10차: 3D 스프라이트 우선
        const _bld2 = _hallI && b.data && b.data.bld;
        if (_bld2 && b.type === 'floor') {
          const _mbx = _myLcx, _mby = _myLcy;   // ★배치 17: 존 로컬 셀(위 주석 — 절대 좌표로 재던 것이 컷어웨이 불발의 원인)
          const _binside = (myFloor || 0) === 0 && ((_mbx >= _bld2[0] && _mbx <= _bld2[2] && _mby >= _bld2[1] && _mby <= _bld2[3])
            || (_mby === _bld2[3] + 1 && (_mbx === _bld2[0] + 3 || _mbx === _bld2[0] + 4)));
          { const _hk = 'B' + _bld2[0] + ',' + _bld2[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _bld2, roofOn: !_binside }); } }   // 실내 NPC 가림(움집과 동일 규칙)
          if (!_binside) {
            const _fbx = Math.floor(b.x / CL_BUILDING_SIZE), _fby = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fbx === _bld2[0] + 3 && _fby === _bld2[3]) {
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 300 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 300) {
                const _riso = w2i(rax - 128, ray - 256);   // 원점=북서(x0-0.5,y0-0.5): 캐리어(x0+3,y1)에서 (-4,-8)셀
                renderables.push({ z: (rax + ray) * 0.5 + 80, kind: 'hutroof', img: _hallI, iso: _riso, wx: rax, wy: ray });   // ★벽 4면 상회: 8×8은 남벽 동단·동벽 남단=캐리어+72 — +80으로 전부 상회(움집 +64 논리 동형)
              }
            }
            continue;   // 밖=실내 바닥 억제(지붕에 가림)
          }
        }
        const _hutI = _bldSpr.hut_roof || _hutRoofC;   // ★10차: 3D 스프라이트 우선
        const _hut = _hutI && b.data && b.data.hut;
        // ★[마당 소품 — 에셋 10차] 구역 기하 정본 자리에 화덕·장독 2점. 서버 페이로드는 그대로 두고
        //   움집 태그(data.hut=[x0,y0,x1,y1])에서 유도한다(실내 화덕·침대가 이미 쓰는 방식과 동형).
        //   집 앵커 (cx,cy) = (x1, y1+2) → 화덕(cx-2,cy) · 장독(cx+2,cy-4)(cx+4,cy-3).
        //   컷어웨이와 무관하게 항상 보인다(마당 사물). 캐리어=발자국 남동단 1셀(움집당 정확 1회).
        if (_hut && b.type === 'floor') {
          const _pcx = Math.floor(b.x / CL_BUILDING_SIZE), _pcy = Math.floor(b.y / CL_BUILDING_SIZE);
          if (_pcx === _hut[2] && _pcy === _hut[3]) {
            for (const [_pk, _pdx, _pdy] of [['yard_hearth', -2, 2], ['yard_jar1', 2, -2], ['yard_jar2', 4, -1]]) {
              const _px2 = ox + (_hut[2] + _pdx) * CL_BUILDING_SIZE + 16, _py2 = oy + (_hut[3] + _pdy) * CL_BUILDING_SIZE + 16;
              if (Math.abs(_px2 - worldCx) > VIEW_RADIUS || Math.abs(_py2 - worldCy) > VIEW_RADIUS) continue;
              renderables.push({ z: w2i(_px2, _py2).y, kind: 'cellprop', key: _pk, gx: _px2, gy: _py2, wx: _px2, wy: _py2 });
            }
          }
        }
        if (_hut && b.type === 'floor') {
          const _mcx = _myLcx, _mcy = _myLcy;   // ★배치 17: 존 로컬 셀
          const _inside = (myFloor || 0) === 0 && ((_mcx >= _hut[0] && _mcx <= _hut[2] && _mcy >= _hut[1] && _mcy <= _hut[3])
            || (_mcy === _hut[3] + 1 && (_mcx === _hut[0] + 2 || _mcx === _hut[0] + 3)));   // ★문 앞 1셀에서도 개방(열린 문으로 내부 엿보기 — PZ 관례)
          { const _hk = _hut[0] + ',' + _hut[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _hut, roofOn: !_inside }); } }   // ★[침대 진입] 렉트+지붕 여부 수집(움집당 1회)
          if (!_inside) {
            const _fcx = Math.floor(b.x / CL_BUILDING_SIZE), _fcy = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fcx === _hut[0] + 2 && _fcy === _hut[3]) {   // 캐리어=남행 문 좌측 바닥 1셀(움집당 정확 1회)
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 200 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 200) {
                const _riso = w2i(rax - 96, ray - 128);       // 지붕 로컬 원점 = 북서 오버행 모서리(캐리어 중심 - (3,4)셀)
                renderables.push({ z: (rax + ray) * 0.5 + 64, kind: 'hutroof', img: _hutI, iso: _riso, wx: rax, wy: ray });   // ★지붕은 자기 집 벽 4면보다 무조건 앞[사용자 지적]: 벽 z 최대=남벽 동단·동벽 남단 (캐리어+56) — +24는 SE 구간 벽이 처마를 덮었음. +64로 전부 상회. 남측 개체는 지붕이 64px 떠 있어 픽셀 비겹침(플레이어는 +500 별도)이라 안전
              }
            }
            continue;
          }
        }
        // wall은 cell edge 좌표 (b.x, b.y = cell 좌상단). 다른 건축은 cell 중심.
        let ax, ay;
        if (b.type === 'wall') {
          const side = b.data?.side || 'N';
          // edge 중간점 — N: 북쪽 변 중간, E: 동쪽 변 중간
          if (side === 'N') { ax = ox + b.x + 16; ay = oy + b.y; }
          else /* E */     { ax = ox + b.x + 32; ay = oy + b.y + 16; }
        } else if (b.type === 'stair') {
          // 14.49-e7ah: stair는 3 cell 분할 push. 각 cell이 자기 z로 sort.
          // 14.49-e7aj: b.x/b.y는 이미 cell 중심 (addBlock에서 +16). +16 추가 X.
          const dir = b.data?.dir || 'N';
          const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
          const baseAx = ox + b.x; // cell 0 center (b.x already cell center)
          const baseAy = oy + b.y;
          const bZ = (b.floor || 0) * FLOOR_HEIGHT;
          for (let cellN = 0; cellN < 3; cellN++) {
            const cAx = baseAx + dv.x * cellN * CL_BUILDING_SIZE;
            const cAy = baseAy + dv.y * cellN * CL_BUILDING_SIZE;
            if (Math.abs(cAx - worldCx) > VIEW_RADIUS || Math.abs(cAy - worldCy) > VIEW_RADIUS) continue;
            const iso = w2i(cAx, cAy, bZ);
            renderables.push({
              z: (cAx + cAy) * 0.5 + (b.floor || 0) * 0.5,
              kind: 'stair_cell', b, iso, ax: cAx, ay: cAy, cellN, dv, wx: cAx, wy: cAy,
            });
          }
          continue;
        } else {
          ax = ox + b.x; ay = oy + b.y;
        }
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const bZ = (b.floor || 0) * FLOOR_HEIGHT;
        const iso = w2i(ax, ay, bZ);
        let _bz = (ax + ay) * 0.5 + (b.floor || 0) * 0.5;
        if (b.type === 'vtile') _bz -= 960;   // ★지면 타일은 실셀 텍스처(64×32)로 승격 — 길(-950)·개체 아래 배경층으로
        renderables.push({ z: _bz, kind: 'building', b, iso, ax, ay, off: ox, offY: oy, wx: ax, wy: ay });   // ★배치 17: off — 남·동벽 페이드가 존 로컬 셀을 재려면 원점이 필요하다
      }
      // ★[2026-08-04c 배치 17 ①] 실내 컷어웨이 진단 훅 — 하네스가 "지붕이 실제로 걷혔나"를 계약 수준에서
      //   확인할 수 있게 이번 프레임의 발자국 렉트·지붕 표시 여부·내 로컬 셀을 노출한다.
      //   화면 픽셀 비교와 **둘 다** 봐야 자명 통과를 막는다(계약만 보면 렌더가 틀려도 통과한다).
      if (_hutRs.length) window.__cutawayDbg = { lcx: _myLcx, lcy: _myLcy, zone: (c.meta && c.meta.id) || null,
        rects: _hutRs.map((h) => ({ r: h.r.slice(), roofOn: !!h.roofOn })) };
      for (const m of c.mobs.values()) {
        const pos = sampleAt(m.buf, renderT, m.x, m.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        // 14.49-d: mob도 floor*FLOOR_HEIGHT + z 적용 (계단 위 추격 시 위로 솟음)
        const mFloor = m.floor || 0;
        const mZ = mFloor * FLOOR_HEIGHT + (m.z || 0);
        const iso = w2i(ax, ay, mZ);
        renderables.push({ z: iso.y, kind: 'mob', m, iso, ax, ay, wx: ax, wy: ay });
      }
      // Phase 5-7: 사체
      for (const co of c.corpses.values()) {
        const ax = ox + co.x, ay = oy + co.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay, 0);
        renderables.push({ z: iso.y, kind: 'corpse', co, iso, ax, ay, wx: ax, wy: ay });
      }
      for (const o of c.others.values()) {
        const pos = sampleAt(o.buf, renderT, o.x, o.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        // ★[침대 진입 — PZ 동형] 움집 실내 NPC(취침·요양)는 그 집 지붕이 그려져 있으면(뷰어가 밖) 숨김 —
        //   플레이어 z(+500)가 지붕 z(캐리어+64)를 항상 이겨 '지붕 위에 누워 자는' 그림이 되기 때문. 들어가면(컷어웨이) 보인다.
        if ((o.floor || 0) === 0 && _hutRs.length) {
          const _ncx = Math.floor(pos.x / CL_BUILDING_SIZE), _ncy = Math.floor(pos.y / CL_BUILDING_SIZE);   // ★배치 17: 렉트가 존 로컬이라 NPC 도 로컬 셀로(ax/ay 는 절대 — 영원히 불일치였다)
          let _hide = false;
          for (const _h of _hutRs) { if (_ncx >= _h.r[0] && _ncx <= _h.r[2] && _ncy >= _h.r[1] && _ncy <= _h.r[3]) { _hide = _h.roofOn; break; } }
          if (_hide) continue;
        }
        // §4-4 Stage 4A: 마을 NPC 직업 이모지 접두 (simJob — econ 분포와 매 게임일 동기)
        const _sjEmoji = (o.simJob && SIM_JOB_EMOJI[o.simJob]) || '';
        const displayName = (_sjEmoji ? _sjEmoji + ' ' : '') + (o.tribeName ? `[${o.tribeName}] ${o.name}` : o.name);
        const oFloor = o.floor || 0;
        const oZ = oFloor * FLOOR_HEIGHT + (o.z || 0); // 14.49-d: 계단 위 z 포함
        const isoF = w2i(ax, ay, oZ);
        renderables.push({ z: (ax + ay) * 0.5 + oFloor * 0.5 + 500, kind: 'player', wx: ax, wy: ay, pid: o.pid, name: displayName, color: o.color || '#5a9ae0', hp: o.hp, maxHp: o.maxHp, iso: isoF, ax, ay, floor: oFloor, lastAttackAt: o.lastAttackAt, vx: o.vx, vy: o.vy, _fvx: o._fvx, _fvy: o._fvy, npc: o.npc, _war: o._war, bt: o.bt, bs: o.bs, bc: o.bc, br: o.br, cap: o.cap, act: o.act });
      }
    }
    {
      // 본인 스프라이트도 카메라(보간) 위치 사용 → 항상 화면 중앙 + 60fps 부드러운 스크롤.
      const myDisplay = myTribeName ? `[${myTribeName}] ${myName}` : myName;
      const myZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0); // 14.49-c: 계단 z 추가
      const isoMe = w2i(_camAbs.x, _camAbs.y, myZ);
      renderables.push({ z: (_camAbs.x + _camAbs.y) * 0.5 + myFloor * 0.5 + 500, kind: 'player', wx: _camAbs.x, wy: _camAbs.y, pid: myPid, name: myDisplay, color: myColor, hp: myHp, maxHp: myMaxHp, iso: isoMe, ax: _camAbs.x, ay: _camAbs.y, isMe: true });
    }

    // ★★[2026-08-04d 배치 18 ②] **자동 지붕** — 닫힌 방 위엔 지붕이 저절로 얹힌다.
    //   앵커 규약은 마을 지붕과 같다(실측으로 확인): 발자국 [x0,y0,x1,y1] 의 지붕 로컬 원점 =
    //   **(x0-1, y0-1) 셀의 좌상단**. 움집·큰집·곳간 세 곳의 기존 오프셋이 전부 이 식과 일치한다.
    //   z 는 그 렉트의 남동 끝 칸 기준 +64 — 제 벽 4면을 전부 상회한다(움집 +64 논리 동형).
    //   컷어웨이: 내가 **그 방 안**이면 지붕을 아예 안 그린다(투명이 아니라 미표시 — 좀보이드 문법).
    const _roomRoofDbg = [];
    {
      const _mrx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), _mry = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const _mrRoom = cellRoomCache.get(`${_mrx}_${_mry}_${myFloor}`) || null;
      const _roofHideAbove = !!_mrRoom, _roofViewFloor = myFloor;   // 지붕 블록은 정렬 앞이라 여기서 직접 잰다
      for (const room of srvRooms.values()) {
        // ★[배치 18 ③] 실내면 **내 층보다 위** 방의 지붕은 안 그린다(그 층 자체가 숨김).
        //   밖이면 전 층 지붕을 다 그린다 — 2층집 지붕이 보여야 2층집이다.
        if (_roofHideAbove && (room.floor | 0) > (_roofViewFloor | 0)) continue;
        const inside = !!(_mrRoom && _mrRoom.id === room.id);
        const _boxes = [], _origins = [];
        for (const r of roomRects(room)) {
          const w = r[2] - r[0] + 1, h = r[3] - r[1] + 1;
          const img = roofImgFor(w, h);
          if (!img) continue;
          const oax = (r[0] - 1) * CL_BUILDING_SIZE, oay = (r[1] - 1) * CL_BUILDING_SIZE;   // 지붕 로컬 원점(절대 px)
          const cax = r[2] * CL_BUILDING_SIZE, cay = r[3] * CL_BUILDING_SIZE;               // z 캐리어 = 남동 끝 칸
          if (Math.abs(cax - worldCx) > VIEW_RADIUS + 400 || Math.abs(cay - worldCy) > VIEW_RADIUS + 400) continue;
          // ★[배치 18 ③] **층 z 리프트** — 2층 방 지붕은 한 층 높이만큼 떠야 한다.
          //   빠져 있어서 2층 지붕이 1층 지붕과 같은 높이에 겹쳐 그려지고 있었다(E2E 가 잡았다).
          const _iso = w2i(oax, oay, (room.floor | 0) * FLOOR_HEIGHT);
          // ★[배치 18 ②] 하네스가 **화면 어디를 봐야 하는지**를 클라 제 투영으로 알려 준다(사본 금지).
          //   지붕을 안 그릴 때도(컷어웨이) 상자는 계산한다 — 같은 자리에서 전/후를 재려면 필요하다.
          { const _s = toScreen(_iso.x, _iso.y);
            _boxes.push([Math.round(_s.x - img._ox), Math.round(_s.y - img._oy), Math.round(_s.x - img._ox + img.width), Math.round(_s.y - img._oy + img.height)]);
            // 발자국과 **지붕 로컬 원점의 화면 좌표**도 같이 — 층 리프트를 재려면 이미지 크기에 안 흔들리는 값이 필요하다
            //   (상자 좌표는 앵커 _ox/_oy 가 지붕 크기마다 달라 크기가 다른 두 지붕을 비교할 수 없다).
            _origins.push({ r: r.slice(), sx: Math.round(_s.x), sy: Math.round(_s.y) }); }
          if (inside) continue;   // 컷어웨이 — 내가 그 방 안이면 지붕을 아예 안 그린다
          renderables.push({ z: (cax + cay) * 0.5 + 64 + (room.floor | 0) * (FLOOR_HEIGHT * 0.5), kind: 'hutroof', img, iso: _iso, floor: room.floor | 0, wx: cax, wy: cay });
        }
        _roomRoofDbg.push({ id: room.id, floor: room.floor | 0, roofOn: !inside, cells: room.cells.size, boxes: _boxes, origins: _origins });
      }
      window.__roomRoofDbg = { myRoom: _mrRoom ? _mrRoom.id : null, floor: myFloor, roofs: _roomRoofDbg };
    }

    renderables.sort((a, b) => a.z - b.z);

    // ★[재민 2026-08-07] 산 가림 뚫기 기준점 — 내 화면 좌표와 내 z 를 프레임당 1회만 잡는다.
    //   z 는 플레이어 renderable 과 **같은 식**을 써야 한다(사본 금지 — 여기서 어긋나면
    //   "가리는데 안 뚫리는" 산이 생긴다). floor 는 산 판정과 무관해 0 으로 둔다.
    _mtOcc = null;
    if (_mtAnchors && myAbsPredicted) {
      const _op = w2i(myAbsPredicted.x, myAbsPredicted.y), _os = toScreen(_op.x, _op.y);
      _mtOcc = { x: _os.x, y: _os.y - 14, z: (myAbsPredicted.x + myAbsPredicted.y) * 0.5 + MT_OCC_ZB };
      // ★흐림 문턱은 **편향 없이** 내 z 그대로 + 캐릭터 키 오프셋. 방아쇠(_mtOcc.z)와 일부러 다르다.
      // ★문턱을 1/4 px 격자에 맞춘다(그 아래 자릿수는 그림에 못 나타나고 캐시만 깨진다).
      _mtFadeZ = Math.round(((myAbsPredicted.x + myAbsPredicted.y) * 0.5 + MT_FADE_ZOFF) * 4) / 4;
      // ★★눈금에 **히스테리시스**를 준다. 그냥 반올림하면 원값이 눈금 경계에 앉았을 때
      //   예측 좌표의 미세한 떨림만으로 문턱이 두 값 사이를 오간다 — 경계가 8px 씩 깜빡이고
      //   결정론 판정(같은 상태 두 프레임 동일)이 깨진다(실측 |Δ| 2.69).
      //   ⇒ 지금 값에서 눈금의 0.75 배 넘게 벗어날 때만 옮긴다.
      if (MT_FADE_CQ > 0) {
        const q = MT_FADE_CQ;
        if (_mtFadeZQ == null || Math.abs(_mtFadeZ - _mtFadeZQ) > q * 0.75)
          _mtFadeZQ = Math.round(_mtFadeZ / q) * q;
        _mtFadeZ = _mtFadeZQ;
      } else _mtFadeZQ = null;
      // 가로줄 = 내 **발치 화면 y** + 아래로 미는 여유(몸통을 안 가르게)
      _mtFadeLineY = _os.y + MT_FADE_YOFF;
    } else { _mtFadeZ = null; _mtFadeLineY = null; }
    // ★계측기는 판정을 **다시 유도하지 않는다** — `_mtDraw` 가 세는 수를 그대로 읽는다(사본 금지).
    _mtFadedN = 0; _mtSplitN = 0; _mtCutRenderN = 0; _mtCutBuiltN = 0; _mtCutFailN = 0;
    _mtSplitSegs.length = 0; _mtFadeFlush = 0; _mtFadeSoftN = 0;
    window.__mtOccDbg = { n: 0, faded: 0, front: 0, fade: +_mtFadeAmt.toFixed(2),
      pt: _mtOcc ? { x: Math.round(_mtOcc.x), y: Math.round(_mtOcc.y) } : null, z: _mtOcc ? Math.round(_mtOcc.z) : null,
      // ★fz 는 **정본 문턱 그대로**(반올림 안 한다) — 판정기가 이 값으로 앞/뒤를 가른다.
      fz: _mtFadeZ, zoff: MT_FADE_ZOFF, zsoft: MT_FADE_ZSOFT, cut: MT_FADE_CUT, cq: MT_FADE_CQ,
      plane: MT_FADE_PLANE, split: 0, cutRender: 0, fadeFlush: 0, fadeSoft: 0,
      clip: MT_FADE_CLIP, lineY: _mtFadeLineY != null ? Math.round(_mtFadeLineY) : null, yoff: MT_FADE_YOFF };
    _mtToScr = toScreen;
    _mtUpdateFade(renderables, _mtFadeDt());

    // 14.49-e7ab/ag: 위층 BFS cutaway
    const _renderMyCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const _renderMyCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    // ★[배치 18 ③] 옛 위층 BFS 두 개는 소비처가 없어졌다 — 재민 확정 문법("위층 = 완전 숨김 ·
    //   밖 = 전체 복원")이 골라 숨길 이유를 없앴다. 함수는 남겨 두되 매 프레임 돌리지 않는다.
    //   (`aboveCutawayWalls` 는 배치 17 시점에 이미 계산만 하고 읽는 곳이 없는 죽은 값이었다.)
    // ★[사용자 지적 — 밖에서도 동벽이 눕던 버그] 방향성 남·동벽 페이드의 실내 게이트(프레임당 1회):
    //   내가 실내일 때만 발동 — 밖에서는 모든 벽 불투명.
    // ★[배치 18 ①] 이제 방은 **서버 판정**이다(rooms_update). 없으면 실외다 — 클라가 대신 계산하지 않는다.
    //   문이 개구(문 개체가 없는)인 마을 움집·큰집은 서버도 방을 못 만든다 → 종전대로 발자국 렉트
    //   태그(data.hut/data.bld)가 그쪽 실내 판정 정본이다(벽 페이드 분기에서 처리 · 회귀 0).
    let _myRoom = null;
    { const _mr = cellRoomCache.get(`${_renderMyCx}_${_renderMyCy}_${myFloor}`);
      _myRoom = (_mr && _mr.isIndoor) ? _mr : null; }
    // ★★[2026-08-04d 배치 18 ③] **층 렌더 문법** (재민 확정: "1층에 들어가면 고층은 투명해지는 거 맞지?")
    //   · 내 층   = 컷어웨이(지붕 걷힘 + 남·동벽 눕힘)
    //   · 위층    = **완전 숨김**(투명이 아니라 미표시 — 반투명 위층은 아래를 읽기 어렵게 만든다)
    //   · 아래층  = 그대로(내 바닥 밑으로 보인다)
    //   · **밖    = 전체 복원** — 밖에서 2층집은 2층집으로 보여야 한다. 종전엔 밖에서도 위층을
    //               부분적으로 숨겨(BFS) 2층이 반쯤 지워진 그림이었다.
    //   ★히스테리시스: 계단 위에서 myFloor 가 오가면 위층이 깜빡인다. 층이 **250ms 동안 유지**돼야
    //     렌더 층을 옮긴다. 판정·충돌은 종전대로 myFloor 를 쓴다 — 이건 **보이는 층**만의 값이다.
    { const _nowMs = performance.now();
      if (myFloor !== _viewFloorPend) { _viewFloorPend = myFloor; _viewFloorAt = _nowMs; }
      if (_viewFloor !== _viewFloorPend && _nowMs - _viewFloorAt > 250) _viewFloor = _viewFloorPend; }
    const _hideAbove = !!_myRoom;   // 실내일 때만 위층을 숨긴다(밖 = 전체 복원)
    window.__floorViewDbg = { myFloor, viewFloor: _viewFloor, indoors: !!_myRoom, hideAbove: _hideAbove, room: _myRoom ? _myRoom.id : null };

    // ═══════════════════════════════════════════════════════════════════════
    // ★★[배치 21 수리] 자연물(물가 술·들꽃)은 **안개 마스크보다 먼저** 그린다.
    //   1패스는 renderables 에 태워 엔티티와 z 정렬했는데(배치 20 산 세그먼트 본보기를 따랐다),
    //   마스크 합성이 **엔티티 렌더 앞**이라 자연물이 안개 위로 떠올랐다 —
    //   **한 번도 못 본 새까만 셀 위에 풀과 꽃이 그대로 보였다**(재민 지적).
    //   실측(fogprobe): 미탐사 픽셀 450,566 중 밝은 픽셀 **1,142 → 자연물 끄면 9**.
    //   99.2%가 이 층이었다. 서버 엔티티(나무·건물)는 AOI 650px 안에서만 오고 그 범위는
    //   사실상 항상 '본 곳'이라 이 문제가 드러나지 않았는데, 자연물은 **클라가 1,500px 까지
    //   스스로 만들어** 미탐사 영역까지 뻗는다. 그래서 이 층에서만 새로 터진 것이다.
    //   ⇒ 마스크 앞으로 옮기면 지면과 **똑같은 3단계**를 그대로 받는다:
    //      미탐사=완전히 가려짐 · 봤지만 시야 밖=지면과 같은 20% 어둠 · 시야 안=밝음.
    //      (배치 19가 남긴 "지면 데코는 안개 마스크 앞" 계약이 바로 이 뜻이었다.)
    //   ⇒ 대가: 엔티티가 항상 자연물 위에 그려진다(사람이 갈대 뒤에 서도 앞으로 나온다).
    //      풀·꽃은 지면 데코라 이 편이 낫다 — 산 세그먼트처럼 큰 물체였다면 반대였을 것이다.
    _mtStageLog = _mtStagePts ? [] : null; _mtStage(ctx, 'A_지면');
    if (!_t19.natOff) {
      const _wt = _windT(), _ww = _t19.windOff ? 0 : _windAt(_wt);
      const _nt0 = performance.now();
      for (const it of _natItems) _natDraw(ctx, it, toScreen, _wt, _ww);
      // 자연물 패스 비용 — 32프레임 이동평균. 바람 on/off 비교의 정본 계측기다.
      _natMs = _natMs * 0.969 + (performance.now() - _nt0) * 0.031;
      if (window.__natDbg) { window.__natDbg.ms = _natMs; window.__natDbg.wind = _ww; }
    }

    // 3단계 안개 마스크(미탐사 검정 · 봤지만 시야 밖 0.2 · 시야 안 0) — **엔티티 렌더 앞**.
    //   ★왜 여기인가(되돌린 이유, 실측): 마스크를 월드 렌더 **전체 뒤**로 옮겨 봤더니
    //   **지붕·산처럼 높은 물체가 자기 발밑 셀의 안개에 눌렸다.** 가시성 폴리곤은 **지면**에서
    //   벽을 광선으로 잘라 만드는데, 지붕은 그 셀보다 화면상 한참 위에 그려지기 때문이다.
    //   실측: e2e-rooms 의 이엉 픽셀 **29.0% → 2.4%**(집 옆에 서 있는데 내 지붕이 캄캄해졌다),
    //   e2e-cutaway 지붕 신호 41.6 → 28.2. ⇒ 3단계 감쇠는 **지면 전용**으로 되돌리고,
    //   재민 규칙("안 가본 곳엔 아무것도")은 **미탐사 전용 2차 마스크**로 따로 건다(아래).
    // mask 자체는 entity render 후에 만들어짐 — 즉 1 frame 지연. 카메라 델타로 보정한다.
    if (window._shadowMask) {
      const _maskM = 64; // mask 생성부 FOG_MASK_M과 동일해야 함
      let mdx = 0, mdy = 0;
      if (window._shadowMaskPx !== undefined) {
        const p0x = window._shadowMaskPx, p0y = window._shadowMaskPy;
        const p1x = _camAbs.x, p1y = _camAbs.y; // K22: 마스크 빌드/저장과 동일 기준(_camAbs)
        // ★[안개 정렬 수리 2026-09-01] 마스크는 1프레임 늦게 온다. 그 사이 달라진 건 카메라만이 아니라
        //   **조준 밀기**도다. 밀기 델타를 안 더하면 조준을 시작·중단하는 순간마다 마스크가 미끄러진다.
        //   이징(TAU 0.12s)이라 프레임당 변화는 20px 안쪽 — 아래 ±_maskM(64) 여유 안이다.
        const a0x = window._shadowMaskAx || 0, a0y = window._shadowMaskAy || 0;
        // 정수로 반올림 — subpixel drawImage는 Safari 리샘플링 강제 + 경계 떨림의 원인
        mdx = Math.round((p0x - p0y) - (p1x - p1y) + (a0x - _aimLookX));
        mdy = Math.round(((p0x + p0y) - (p1x + p1y)) / 2 + (a0y - _aimLookY));
        if (Math.abs(mdx) > _maskM || Math.abs(mdy) > _maskM) { mdx = 0; mdy = 0; }
      }
      ctx.drawImage(window._shadowMask, mdx - _maskM, mdy - _maskM);
    }
    _mtStage(ctx, 'B_안개후');

    // ═══════════════════════════════════════════════════════════════════════
    // ★★[재민 확정 2026-08-06] **한 번도 안 가본 곳은 그 어떤 것도 보여서는 안 된다.**
    //   ⇒ 개체(entity)마다 **자기 셀이 '본 셀'인지** 보고, 아니면 아예 안 그린다.
    //
    //   ★왜 화면 마스크가 아니라 개체 단위인가 — 실측으로 두 번 확인했다.
    //     안개 마스크를 월드 렌더 **전체 뒤**로 얹어 봤더니 **지붕·산처럼 높은 물체가
    //     자기 뒤편 미탐사 셀에 잘렸다**. 가시성 폴리곤은 **지면**에서 벽을 광선으로 잘라
    //     만드는데 지붕은 그 셀보다 화면상 한참 위에 그려지기 때문이다.
    //     실측: e2e-rooms 이엉 픽셀 **29.0% → 2.8%**(집 옆에 서 있는데 내 지붕이 캄캄해졌다).
    //     ⇒ 재민 규칙의 뜻은 "안 가본 셀 위 **픽셀** 금지"가 아니라 "안 가본 자리의 **사물** 금지"다.
    //       그래서 **사물의 자리(wx,wy)** 로 판정한다. 내가 본 집이면 지붕은 온전히 보인다.
    //
    //   ★판정 정본은 `_seenChunks`(안개가 '봤다'를 기록하는 바로 그 자료)다 — 사본 금지.
    //   ★구멍 금지: 모든 push 에 `wx/wy` 를 달았고, 없는 항목은 **세어서 내보낸다**
    //     (`__fogGateDbg.missing`). 하네스가 0 을 요구한다 — 조용히 새는 종류가 없게.
    // ═══════════════════════════════════════════════════════════════════════
    let _gateSkipped = 0, _gateMissing = 0, _gateFree = 0; const _gateMissKind = {};
    _gateDrawn.length = 0;
    _entBoxes.length = 0;
    if (window.__simvilCells) { const _p = window.__simvilCells; _p.cand = 0; _p.unseen = 0; _p.drawnUnseen = 0; _p.samples.length = 0; }
    const _seenCell1 = (cx, cy) => {
      const sc = window._seenChunks; if (!sc) return true;   // 첫 프레임(기록 전)은 통과
      const chSet = sc.get((cx >> 4) + '_' + (cy >> 4));
      return !!chSet && chSet.has(cx * 65536 + cy);
    };
    // ★★구조물은 **발자국 어느 한 칸이라도 봤으면** 보인다 — 앵커 한 칸으로 재면 안 된다.
    //   실측 결함: 밖에서 지은 집은 **안에 들어가 본 적이 없다**. 벽이 시야를 막아 내부 셀이
    //   영영 '본 셀'이 안 되고, 지붕 앵커가 그 내부라 **내가 지은 내 집 지붕이 사라졌다**
    //   (e2e-rooms 이엉 29.0% → 3.2%). 안개의 목적은 '안 가본 땅'을 가리는 것이지
    //   내가 지나쳐 본 건물을 숨기는 게 아니다.
    //   ⇒ 구조물은 앵커 + 반경 R셀의 8방위까지 9칸을 본다(R 은 발자국 크기 기준).
    //   ★★[리베이스 합류 2026-08-07] **산(mtseg)은 이 게이트에서 뺀다.** 근거는 취향이 아니라 실측이다:
    //     ⓐ 산 세션이 `_mtCollectCover` 로 다시 쓰면서 내 5차가 달았던 wx/wy 가 사라졌고,
    //        하네스 "구멍 0" 가 37건으로 잡았다. 그래서 자리는 다시 달았다(계측은 살아 있어야 한다).
    //     ⓑ 그런데 자리를 달고 게이트를 걸었더니 **산이 사라졌다**:
    //          앵커만(R=1) → 산 앞에 서도 **115장 중 10장**만 그려짐
    //          발자국 반경 5 → **16장**   (대조군: origin/main 은 e2e-mtocc **10/10**)
    //        원인은 명확하다 — **가시성 폴리곤은 바위에서 끊긴다.** 그래서 바위 셀은 사실상
    //        영영 '본 셀'로 기록되지 않는다. 어떤 반경을 줘도 게이트는 '안 가본 산'이 아니라
    //        **모든 산**을 지운다. 이 층에 게이트는 **틀린 도구**다.
    //     ⓒ 규칙의 뜻으로 돌아가면: 재민 규칙은 **안 가본 곳의 '정보'가 새면 안 된다**였고
    //        대상은 남의 집·논밭·영토였다. 산은 지형이고 실제로 수십 km 밖에서 보인다.
    //     ⇒ **면제 목록에 명시**한다. 조용히 빠지는 게 아니라 이름을 적어 두고 하네스가 그 목록을
    //        대조한다 — 나중에 누가 말없이 하나 더 빼면 판정이 깨진다.
    //     ★재민 판단 회부: 산에도 안개를 적용하려면 게이트가 아니라 **안개 마스크 앞에 그리기**가
    //        맞고, 그건 §6-c 1패스에서 지붕이 잘렸던 문제를 산에서 다시 풀어야 한다(별도 작업).
    const _GATE_FREE = { mtseg: 1 };   // ★의도적 면제 — 지형이다. 추가하려면 위 근거처럼 실측을 남겨라.
    const _GATE_R = { building: 4, hutroof: 4, simvil: 10, claim: 4, banditcamp: 4, stair_cell: 1 };
    const _seenFor = (kind, wx, wy) => {
      const cx = Math.floor(wx / CL_BUILDING_SIZE), cy = Math.floor(wy / CL_BUILDING_SIZE);
      if (_seenCell1(cx, cy)) return true;
      const R = _GATE_R[kind]; if (!R) return false;
      for (let k = 0; k < 8; k++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][k] * R, dy = [0, 0, 1, -1, 1, -1, 1, -1][k] * R;
        if (_seenCell1(cx + dx, cy + dy)) return true;
      }
      return false;
    };

    // === 3) 엔티티 그리기 ===
    _mtStage(ctx, 'C_루프전');
    for (const item of renderables) {
      if (item.wx === undefined) { _gateMissing++; _gateMissKind[item.kind] = (_gateMissKind[item.kind] || 0) + 1; }
      else if (_GATE_FREE[item.kind]) { _gateFree++; }
      else if (!item.isMe && !_t19.fogGateOff && !_seenFor(item.kind, item.wx, item.wy)) { _gateSkipped++; continue; }
      else if (item.wx !== undefined) {
        _gateDrawn.push(item.wx, item.wy, item.kind);
        //  ★생물만, 손잡이가 켜졌을 때만 — 라이브에선 이 줄이 한 번도 안 돈다.
        if (_t19.entBoxes && (item.kind === 'mob' || item.kind === 'player' || item.kind === 'corpse')) {
          const _pp = w2i(item.wx, item.wy), _sp = toScreen(_pp.x, _pp.y);
          _entBoxes.push(item.kind, Math.round(_sp.x), Math.round(_sp.y));
        }
      }
      if (item.kind === 'claim') {
        const cl = item.cl, off = item.off, offY = item.offY || 0;
        const sc = (wx, wy) => { const pp = w2i(off + wx, offY + wy); return toScreen(pp.x, pp.y); };
        const s1 = sc(cl.x, cl.y), s2 = sc(cl.x + cl.w, cl.y), s3 = sc(cl.x + cl.w, cl.y + cl.h), s4 = sc(cl.x, cl.y + cl.h);
        // kind별 색상
        let fill, stroke, label;
        if (cl.kind === 'guild') {
          if (cl.personalAssigned) { fill = 'rgba(180,160,100,0.22)'; stroke = 'rgba(220,200,140,0.7)'; label = `🏠 ${cl.ownerName}`; }
          else { fill = 'rgba(90,154,224,0.18)'; stroke = 'rgba(120,175,235,0.95)'; label = `🏛️ ${cl.guildTribeName || cl.ownerName}`; }
        } else if (cl.kind === 'temporary') { fill = 'rgba(220,130,60,0.16)'; stroke = 'rgba(220,130,60,0.7)'; label = `⛺ ${cl.ownerName}`; }
        else { fill = 'rgba(240,198,116,0.18)'; stroke = 'rgba(240,198,116,0.8)'; label = `🏠 ${cl.ownerName}`; }

        if (cl.cells && cl.cells.length) {
          // 영토 = 셀 집합 (격자 단위) — 각 셀 채움 + 경계(이웃 안 owned) 외곽선. bbox 화면 밖이면 스킵.
          const mnx = Math.min(s1.x,s2.x,s3.x,s4.x), mxx = Math.max(s1.x,s2.x,s3.x,s4.x);
          const mny = Math.min(s1.y,s2.y,s3.y,s4.y), mxy = Math.max(s1.y,s2.y,s3.y,s4.y);
          if (!(mxx < -60 || mnx > W + 60 || mxy < -60 || mny > H + 60)) {
            const S = CL_BUILDING_SIZE;
            const own = cl._cset || (cl._cset = new Set(cl.cells.map(c => c[0] + ',' + c[1])));
            ctx.fillStyle = fill; ctx.beginPath();
            for (const [cx, cy] of cl.cells) {
              const a = sc(cx*S, cy*S), b = sc((cx+1)*S, cy*S), c = sc((cx+1)*S, (cy+1)*S), d = sc(cx*S, (cy+1)*S);
              ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath();
            }
            ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.beginPath();
            for (const [cx, cy] of cl.cells) {
              const a = sc(cx*S, cy*S), b = sc((cx+1)*S, cy*S), c = sc((cx+1)*S, (cy+1)*S), d = sc(cx*S, (cy+1)*S);
              if (!own.has(cx + ',' + (cy-1))) { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
              if (!own.has((cx+1) + ',' + cy)) { ctx.moveTo(b.x,b.y); ctx.lineTo(c.x,c.y); }
              if (!own.has(cx + ',' + (cy+1))) { ctx.moveTo(c.x,c.y); ctx.lineTo(d.x,d.y); }
              if (!own.has((cx-1) + ',' + cy)) { ctx.moveTo(d.x,d.y); ctx.lineTo(a.x,a.y); }
            }
            ctx.stroke();
          }
        } else {
          // 단일 사각 (personal/temporary)
          ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.lineTo(s3.x,s3.y); ctx.lineTo(s4.x,s4.y); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
          ctx.strokeStyle = stroke; ctx.lineWidth = (cl.kind === 'guild') ? 2.5 : 1.2;
          ctx.setLineDash(cl.kind === 'guild' ? [] : [6,4]); ctx.stroke(); ctx.setLineDash([]);
        }
        { ctx.fillStyle = stroke; ctx.font = (cl.kind === 'guild') ? 'bold 13px sans-serif' : '11px sans-serif'; ctx.fillText(label, s1.x + 6, s1.y + 14); }
        // Phase 4d-16-c: NPC 사유지 cell에 facility sprite (emoji)
        if (cl.facilityType) {
          const cs = toScreen(w2i(off + cl.x + cl.w/2, offY + cl.y + cl.h/2).x, w2i(off + cl.x + cl.w/2, offY + cl.y + cl.h/2).y);
          // farmland는 stage별 emoji 사용
          let emoji = FACILITY_EMOJI[cl.facilityType] || '';
          if (cl.facilityType === 'farmland' && cl.farmStage != null) {
            // 에셋 5차: 4단계 3D 스프라이트 우선(미로드 시 이모지 폴백)
            const _cs = cropSprite(cl.farmStage, off + cl.x, offY + cl.y);
            if (_cs) { ctx.drawImage(_cs, cs.x - 20, cs.y - 25, 40, 40); emoji = ''; }
            else emoji = FARM_STAGE_EMOJI[cl.farmStage] || '🌾';
          }
          if (emoji) {
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 230, 180, 0.9)';
            ctx.fillText(emoji, cs.x, cs.y);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            // Phase 4d-16-d: forge 가끔 연기 파티클 (시각 동작 — client only, deterministic by time)
            if (cl.facilityType === 'forge' && Math.sin((Date.now() + (cl.x + cl.y) * 13) * 0.001) > 0.8) {
              ctx.fillStyle = 'rgba(160, 80, 40, 0.5)';
              ctx.beginPath();
              ctx.arc(cs.x, cs.y - 8, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (item.kind === 'road') {
        // §16 답압 길 — 셀 다이아몬드 틴트: lv1 흙길(옅음)·lv2 다져진 길(짙음). 지면 위·모든 것 아래(-950).
        const a = toScreen(w2i(item.rcx, item.rcy).x, w2i(item.rcx, item.rcy).y);
        const b2 = toScreen(w2i(item.rcx + 32, item.rcy).x, w2i(item.rcx + 32, item.rcy).y);
        const c2 = toScreen(w2i(item.rcx + 32, item.rcy + 32).x, w2i(item.rcx + 32, item.rcy + 32).y);
        const d2 = toScreen(w2i(item.rcx, item.rcy + 32).x, w2i(item.rcx, item.rcy + 32).y);
        ctx.fillStyle = item.lv >= 2 ? 'rgba(168,134,88,0.42)' : 'rgba(150,124,86,0.26)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.fill();
      } else if (item.kind === 'mtseg') {
        _mtDraw(ctx, item, toScreen);
      } else if (item.kind === 'ditch') {
        // ★[11차 T3 환호] 도랑 — 8차 셀 정합 스프라이트(이미지 중심=셀 중심·128px). 없으면 파인 흙 다이아 폴백.
        if (!drawBridgeSprite(item.ds, item.bx, item.by, toScreen)) {
          const x0 = item.bx - 16, y0 = item.by - 16;
          const P = (dx, dy) => { const p = w2i(x0 + dx, y0 + dy); return toScreen(p.x, p.y); };
          const a1 = P(0, 0), b1 = P(32, 0), c1 = P(32, 32), d1 = P(0, 32);
          ctx.fillStyle = '#3a2c1d';
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(20,14,8,0.85)'; ctx.lineWidth = 1; ctx.stroke();
        }
      } else if (item.kind === 'bridge') {
        // ★[다리 층] 통나무 널다리 상판 — 청동기 후기 고증: 통나무를 걸치고 널을 깐 다리(석조 아치 금지).
        //   셀 다이아 상판(널 결) + 물그림자. 물 위 정적 사물이라 애니메이션 없음.
        const x0 = item.bx - 16, y0 = item.by - 16;
        const P = (dx, dy) => { const p = w2i(x0 + dx, y0 + dy); return toScreen(p.x, p.y); };
        const a1 = P(0, 0), b1 = P(32, 0), c1 = P(32, 32), d1 = P(0, 32);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';   // 수면 그림자
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y + 5); ctx.lineTo(b1.x, b1.y + 5); ctx.lineTo(c1.x, c1.y + 5); ctx.lineTo(d1.x, d1.y + 5); ctx.closePath(); ctx.fill();
        // ★[에셋 9차] Blender 통나무 널다리 타일 — 로드됐으면 벡터 대신 스프라이트.
        //   렌더 규약: 카메라가 w2i와 동일한 2:1(방위 45°·고도 30°), ortho_scale=2√2 ⇒ **이미지 중심=셀 중심,
        //   셀 다이아 폭=이미지 폭의 1/2**. 따라서 셀 중심에 한 변 128px(=64×2) 정사각으로 그리면 정확히 맞는다.
        if (drawBridgeSprite(item.bs, item.bx, item.by, toScreen)) continue;
        ctx.fillStyle = '#8a6a40';            // 널 상판(스프라이트 미로드 폴백 — 이하 벡터 경로)
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(70,50,28,0.85)'; ctx.lineWidth = 1;
        ctx.stroke();
        // 널 결 2줄(셀 내부 분할) — 축소해도 '판자'로 읽히게
        ctx.strokeStyle = 'rgba(62,44,24,0.55)';
        ctx.beginPath();
        for (const t of [10.7, 21.3]) { const p1 = P(t, 0), p2 = P(t, 32); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
        ctx.stroke();
      } else if (item.kind === 'cellprop') {
        // ★[마당 소품] 화덕·장독 — 다리 타일과 같은 셀 정합 규약(이미지 중심=셀 중심·128px). 폴백은 없음(없으면 안 그림).
        drawBridgeSprite(item.key, item.gx, item.gy, toScreen);
      } else if (item.kind === 'granpile') {
        // ★[곳간② 재고 표시] 볏짚 단 더미 — 재고 1~19=작은 더미, 20+=큰 더미(G_STOCK_CAP=60 기준 1/3 분기).
        //   스프라이트는 다리 타일과 **같은 셀 정합 카메라**로 렌더돼 같은 규약(중심=셀 중심·128px)으로 그린다.
        // 재고 구간 3단계(G_STOCK_CAP=60 기준 1/3·2/3): 1~19 · 20~39 · 40+ / prop=벽 기대 소품
        const _pk = item.prop ? 'gran_prop' : (item.st >= 40 ? 'gran_pile3' : (item.st >= 20 ? 'gran_pile2' : 'gran_pile1'));
        if (item.prop) { drawBridgeSprite(_pk, item.gx, item.gy, toScreen); continue; }
        if (!drawBridgeSprite(_pk, item.gx, item.gy, toScreen)) {
          const gp = toScreen(w2i(item.gx, item.gy).x, w2i(item.gx, item.gy).y);   // 폴백: 단순 더미
          ctx.fillStyle = 'rgba(0,0,0,0.20)';
          ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c8ab63';
          ctx.beginPath(); ctx.ellipse(gp.x, gp.y - 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (item.kind === 'simvil') {
        // §4-4 Stage 4A: 마을 시뮬 영토 — 서버가 경계 셀만 전송(b: [dx,dy,mask...] 중심 상대,
        //   mask 비트 1=N 2=E 4=S 8=W = 영토 바깥과 맞닿은 변). 반투명 초록(길드 파랑과 구분).
        const v = item.v, off = item.off, offY = item.offY || 0;
        const S = CL_BUILDING_SIZE;
        const sc = (wx, wy) => { const pp = w2i(off + wx, offY + wy); return toScreen(pp.x, pp.y); };
        // ★★[안개 위 논밭 수리 2026-08-30 재민 실기 재현] **셀마다** 안개를 본다.
        //   결함 기전: 이 항목은 `renderables` 에 **마을 중심 좌표 하나**(wx,wy)로 실린다.
        //   개체 안개 게이트는 그 한 점만 보므로, **중심을 한 번 본 마을이면 반경 1,200px 의
        //   영토 셀 전부가 그려졌다** — 한 번도 안 가본 새까만 땅 위에 논밭 띠와 경계선이 떴다.
        //   (배치 21이 자연물에서 고친 것과 **같은 결함의 다른 층**이다: 클라가 스스로 만들어
        //    내는 넓은 그림은 개체 하나로 게이트하면 반드시 샌다.)
        //   ⇒ 재민 규칙("안 가본 자리의 사물 금지")을 **셀 단위**로 적용한다.
        //     판정 정본은 `_seenCell1`(= `_seenChunks`) 하나다 — 사본 금지.
        const _cellSeen = (cx, cy) => _t19.simvilCellGateOff || _seenCell1(off / 32 + cx, offY / 32 + cy);
        const fill = 'rgba(150,205,130,0.13)', stroke = 'rgba(175,225,145,0.9)';
        if (v.b && v.b.length) {
          // 경계 셀 은은한 채움 (띠) + 외곽변만 실선 → 정확한 영토 외곽선
          ctx.fillStyle = fill; ctx.beginPath();
          for (let i = 0; i < v.b.length; i += 3) {
            const cx = v.cx + v.b[i], cy = v.cy + v.b[i + 1];
            // ★계측 — 후보 셀 · 그중 안 본 셀 · **안 본 셀인데 그린 것**(= 위반).
            //   `unseen>0` 이어야 이 검사가 자명 통과가 아니고, `drawnUnseen===0` 이어야 수리된 것이다.
            const _seen = _seenCell1(off / 32 + cx, offY / 32 + cy);
            const _draw = _cellSeen(cx, cy);
            const _pr = window.__simvilCells;
            if (_pr) {
              _pr.cand++;
              if (!_seen) { _pr.unseen++; if (_draw) { _pr.drawnUnseen++; if (_pr.samples.length < 8) _pr.samples.push([off / 32 + cx, offY / 32 + cy]); } }
            }
            if (!_draw) continue;   // ★안 가본 셀엔 안 그린다
            const a = sc(cx * S, cy * S), b2 = sc((cx + 1) * S, cy * S), c2 = sc((cx + 1) * S, (cy + 1) * S), d2 = sc(cx * S, (cy + 1) * S);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath();
          }
          ctx.fill();
          ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath();
          for (let i = 0; i < v.b.length; i += 3) {
            const cx = v.cx + v.b[i], cy = v.cy + v.b[i + 1], m = v.b[i + 2];
            if (!_cellSeen(cx, cy)) continue;   // ★외곽선도 같은 게이트
            const a = sc(cx * S, cy * S), b2 = sc((cx + 1) * S, cy * S), c2 = sc((cx + 1) * S, (cy + 1) * S), d2 = sc(cx * S, (cy + 1) * S);
            if (m & 1) { ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); }
            if (m & 2) { ctx.moveTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); }
            if (m & 4) { ctx.moveTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); }
            if (m & 8) { ctx.moveTo(d2.x, d2.y); ctx.lineTo(a.x, a.y); }
          }
          ctx.stroke();
        } else if (_cellSeen(v.cx, v.cy)) {
          // 구DB(경계 미영속) 폴백 — 중심+반경 점선 원 (월드 좌표 24각형 → 투영·줌에 자동 정합)
          //   ★원은 셀 단위로 자를 수 없다 ⇒ **중심 셀을 본 경우에만** 그린다(안 본 마을은 통째로 숨는다).
          const r = v.r || 800;
          ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
          ctx.beginPath();
          for (let a2 = 0; a2 <= 24; a2++) {
            const th = a2 / 24 * Math.PI * 2;
            const p = sc(v.cx * S + 16 + Math.cos(th) * r, v.cy * S + 16 + Math.sin(th) * r);
            if (a2 === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
        // §19/§2 4파: 영토 크립 링 — econ land.size(매일 1셀 단위 성장)의 등가 반경(호박색 점선·sim_village_day 갱신).
        //   공간 실물화(bnd)는 시딩 스냅샷(부채 — 계획서 §2) — 이 링이 경제 영토의 '현재 크기'를 정직 표시.
        if (v.tr && _cellSeen(v.cx, v.cy)) {   // ★크립 링도 중심 셀을 본 마을만
          ctx.strokeStyle = 'rgba(222,202,132,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
          ctx.beginPath();
          for (let a2 = 0; a2 <= 28; a2++) { const th = a2 / 28 * Math.PI * 2; const p = sc(v.cx * S + 16 + Math.cos(th) * v.tr, v.cy * S + 16 + Math.sin(th) * v.tr); if (a2 === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
          ctx.stroke(); ctx.setLineDash([]);
        }
        if (_cellSeen(v.cx, v.cy)) { // 라벨 — 회관 위. ★안 가본 마을의 이름·인구는 안 알려 준다(정찰이 공짜가 되면 안 된다)
          const ctr = sc(v.cx * S + 16, v.cy * S + 16);
          ctx.fillStyle = stroke; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(`🏘️ ${v.name}${v.pop != null ? ' · ' + v.pop + '명' : ''}`, ctr.x, ctr.y - 46);
          ctx.textAlign = 'start';
        }
      } else if (item.kind === 'banditcamp') {
        // §11 도적: 소굴·야영 마커 1종 — 검은 막사+🏴(랩 렌더 동형 최소판). n>0=점유 단(인원 라벨), n=0=빈 소굴(재결성 대기, 흐림).
        const bc = item.bc, boff = item.off, boffY = item.offY || 0;
        const bp = w2i(boff + bc.x, boffY + bc.y);
        const sp = toScreen(bp.x, bp.y);
        ctx.globalAlpha = bc.n > 0 ? 0.95 : 0.4;
        ctx.fillStyle = '#241d18';
        ctx.beginPath(); ctx.moveTo(sp.x - 14, sp.y + 8); ctx.lineTo(sp.x, sp.y - 10); ctx.lineTo(sp.x + 14, sp.y + 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(200,80,60,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🏴', sp.x, sp.y - 12);
        if (bc.n > 0) { ctx.fillStyle = '#e8b0a0'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('도적 ' + bc.n + '명', sp.x, sp.y + 22); }
        ctx.textAlign = 'start'; ctx.globalAlpha = 1;
      } else if (item.kind === 'resource') {
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // ★★[재민 확정 2026-08-06] **식물·무생물은 항상 그려진다.** 뒤돌았다고 숲이 사라지면 안 된다.
        //   Phase 14.39 가 자원에도 `entityVisibility`(현재 facing 부채꼴 × 벽 LoS)를 걸어 뒀는데,
        //   그건 **살아 움직이는 것**(사람·동물)을 위한 판정이다. 나무·바위·광맥·덤불·약초는
        //   지형에 가까운 정적 사물이라 시선 방향과 무관하게 그 자리에 있어야 한다.
        //   거리 vignette 는 남긴다 — AOI(650px) 경계에서 튀어나오는 팝인을 무르게 하는 장치다.
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        if (item.r.type === 'tree') drawTreeIso(s.x, s.y, item.r.r || 8, item.r.h || 60, item.ax, item.ay);
        else if (item.r.type === 'rock') drawRockIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'berry_bush') drawBerryBushIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'water_pool') drawWaterPoolIso(s.x, s.y);
        else if (item.r.type === 'herb') drawHerbIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'ore') drawOreIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'meteorite') drawMeteoriteIso(s.x, s.y, item.ax, item.ay);   // ★운철 낙하지
        if (item.r.hp < item.r.maxHp) {
          const pct = item.r.hp / item.r.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(s.x - 10, s.y - 28, 20, 3);
          ctx.fillStyle = '#9adb6e'; ctx.fillRect(s.x - 10, s.y - 28, 20 * pct, 3);
        }
        ctx.globalAlpha = 1;
      } else if (item.kind === 'ground_item') {
        const s = toScreen(item.iso.x, item.iso.y);
        const gi = item.gi;
        // ★[재민 확정 2026-08-06] 바닥에 떨어진 물건도 **항상 보인다** — 내가 떨군 걸 뒤돌았다고
        //   못 찾으면 안 된다. 거리 vignette 만 남긴다.
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // 아이콘 — 3D 렌더 이미지 우선, 미로드 시 이모지 폴백
        drawItemIcon(ctx, gi.item, s.x, s.y - 4, 18);
        // 개수 ×N (>1일 때)
        if (gi.count > 1) {
          ctx.font = '9px sans-serif'; ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2;
          ctx.strokeText(`×${gi.count}`, s.x + 9, s.y + 5);
          ctx.fillText(`×${gi.count}`, s.x + 9, s.y + 5);
        }
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1;
      } else if (item.kind === 'player') {
        // 14.49-e7ad: 위층 player 안 그림 (본인 제외). 아래층은 정상 alpha.
        const pFloor = item.floor || 0;
        if (!item.isMe && pFloor > myFloor) continue;
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = item.isMe ? 1 : Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        // Phase 14.39: 본인 외 player는 시야 뒤면 안 보임
        if (!item.isMe) {
          vis *= entityVisibility(item.ax, item.ay, d);
          if (vis < 0.05) continue;
        }
        ctx.globalAlpha = vis;
        // Phase 14.35+14.37: 본인은 키입력/lastAttack/facing, 다른 player는 vx/vy/lastAttackAt
        const now = performance.now();
        let moving = false, attackPhase = 0, fvx = 0, fvy = 0;
        if (item.isMe) {
          const { wx, wy } = worldKeysDir();
          moving = (wx !== 0 || wy !== 0);
          // ★[조준 모드] 조준 중엔 페이싱이 **커서**를 따른다(render 상단에서 이미 세팅됨) —
          //   이동 방향이 덮어쓰면 옆걸음·뒷걸음이 안 나온다.
          if (moving && !_aiming) { myFacingVx = wx; myFacingVy = wy; }
          fvx = myFacingVx; fvy = myFacingVy;
          const dt = now - myLastAttackAt;
          if (dt < 300) attackPhase = 1 - dt / 300;
        } else {
          const ovx = item.vx || 0, ovy = item.vy || 0;
          moving = (Math.abs(ovx) + Math.abs(ovy)) > 5;
          // 다른 player facing — others에 lastFvx/Fvy 캐시 필요. 일단 현재 vx/vy 또는 prev
          if (moving) { fvx = ovx; fvy = ovy; }
          else { fvx = item._fvx || 1; fvy = item._fvy || 0; }
          if (item.lastAttackAt && now - item.lastAttackAt < 300) attackPhase = 1 - (now - item.lastAttackAt) / 300;
        }
        // Phase 14.41: 다운 상태 — 본인은 myIsDown, 다른 사람은 downStates Map
        const downFlag = item.isMe ? myIsDown : !!downStates.get(item.pid);
        // ★[캐릭터 스프라이트] 플래그가 켜져 있고 시트가 다 떠 있으면 시트로, 아니면 종전 도형으로.
        //   ⚠**NPC 주민은 제외**한다 — 사람 시트를 마을에 입히는 건 별도 배치다(회부).
        //     서버가 첫 가시 메타에 `npc` 1비트를 실어 준다(makeEntry — 애니용 필드가 아니라 신원).
        //   다운/전쟁 병사/포로는 종전 도형 경로 유지(누운 모습·병종색·밧줄은 시트에 없다).
        const _spriteOk = !downFlag && !item._war && !item.cap && !item.npc &&
          drawCharSprite(s.x, s.y, !!item.isMe, {
            pid: item.pid, fvx, fvy,
            speed: item.isMe ? Math.hypot(myVel.vx, myVel.vy)
                             : Math.hypot(item.vx || 0, item.vy || 0),
            aiming: item.isMe ? !!_aiming : false,
            attackAt: item.isMe ? myLastAttackAt : (item.lastAttackAt || 0),
          });
        if (!_spriteOk) drawPlayerIso(s.x, s.y, item.name, item.color, item.isMe, { moving, attackPhase, fvx, fvy, isDown: downFlag, war: item._war, bt: item.bt, bs: item.bs, bc: item.bc, br: item.br, cap: item.cap, act: item.act });
        // HP bar for others (전쟁 병사는 만피여도 항상 표시 + 진영색 테두리)
        if (!item.isMe) {
          const o = item.hp !== undefined ? item : null;
          if (o && o.hp !== undefined && o.maxHp && (o.hp < o.maxHp || item._war)) {
            ctx.fillStyle = '#222'; ctx.fillRect(s.x - 14, s.y - 30, 28, 4);
            ctx.fillStyle = item._war ? (WAR_SIDE_COL[item.bs | 0] || '#d85a5a') : '#d85a5a';
            ctx.fillRect(s.x - 14, s.y - 30, 28 * Math.max(0, Math.min(1, o.hp / o.maxHp)), 4);
          }
        }
        ctx.globalAlpha = 1;
        const bubble = speechBubbles.get(item.pid);
        if (bubble && performance.now() < bubble.until) {
          drawSpeechBubble(s.x, s.y - 32, bubble.text);
        }
      } else if (item.kind === 'building') {
        const s = toScreen(item.iso.x, item.iso.y);
        const bf = item.b.floor || 0;
        const bType = item.b.type;
        // 14.49-e7ad: 아래층 정상 alpha 1.0 (사용자 요구). z-sort로 위층이 우선 덮음.
        if (bf < myFloor) {
          ctx.globalAlpha = 1.0;
        }
        // 14.49-e7ag: 위층 처리
        // - floor: 가장 위쪽(max floor)만 그림. BFS cutaway 안이면 skip.
        // - wall: 외벽만. BFS cutaway 안이면 skip.
        // - 그 외 (chest, farmland): BFS cutaway 안이면 skip. 그 외는 기존대로 skip.
        else if (bf > _viewFloor) {
          // ★[배치 18 ③] 재민 확정 문법: **실내면 위층 완전 숨김 · 밖이면 전체 복원**.
          //   밖에서는 아래 옛 BFS 부분 숨김을 타지 않는다 — 2층집이 2층집으로 보여야 한다.
          if (!_hideAbove) { ctx.globalAlpha = 1.0; }
          else continue;
        }
        // ↑ 위 분기가 옛 '위층 부분 숨김(aboveCutawayCells BFS)'을 대체했다 — 재민 확정 문법이
        //   "위층 = 완전 숨김 · 밖 = 전체 복원"이라 BFS 로 골라 숨길 이유가 없어졌다.
        //   (그 BFS 는 '내 칸 **바로 위에** 천장 타일이 있을 때만' 켜져서, 천장에 구멍이 하나만 있어도
        //    위층이 통째로 드러나던 반쪽 규칙이었다.)
        // 14.49-e7ac: wall edge 방향성 기반 cutaway
        // 가로 wall (side='N'): dy로 판정. dy > 8 = S 벽 → cutaway.
        // 세로 wall (side='E'): dx로 판정. dx > 8 = E 벽 → cutaway.
        else if ((bType === 'wall' || bType === 'fence') && bf === myFloor) {
          const dx = item.ax - myAbsPredicted.x;
          const dy = item.ay - myAbsPredicted.y;
          const side = item.b.data?.side;
          let isCutaway = false;
          if (side === 'N' && dy > 8) isCutaway = true;
          else if (side === 'E' && dx > 8) isCutaway = true;
          // ★실내 게이트[사용자 지적]: 페이드는 "내가 그 건물 안"일 때만 — 원 의도(입실 시 남·동벽이 눕는 실내감) 복원.
          if (isCutaway) {
            const _rect = item.b.data?.hut || item.b.data?.bld;   // 움집/큰집 = 발자국 렉트 판정(문 개구로 방 BFS가 새는 구조)
            if (_rect) {
              // ★★[배치 17 ①] 렉트는 **존 로컬 셀**이다 — `_renderMyCx`(절대)로 재던 것이
              //   "남·동벽이 안 눕는다"의 원인이었다(한반도 offset 409,984 → 셀 13,775 vs 렉트 960~967).
              //   renderable 에 실어 온 존 원점(off/offY)으로 로컬 셀을 다시 잰다.
              const _lcx = Math.floor((myAbsPredicted.x - (item.off || 0)) / CL_BUILDING_SIZE);
              const _lcy = Math.floor((myAbsPredicted.y - (item.offY || 0)) / CL_BUILDING_SIZE);
              isCutaway = (myFloor || 0) === 0 && _lcx >= _rect[0] && _lcx <= _rect[2] && _lcy >= _rect[1] && _lcy <= _rect[3];
            } else if (_myRoom) {                                  // 일반 건물 = 방 시스템: 이 벽이 '내 방'에 접해 있을 때만
              let _wcx, _wcy, _ocx, _ocy;
              // 변 정규화(서버 findEdgeWall 과 같다): N 벽 (cx,cy) 는 (cx,cy)와 (cx,cy-1) 사이 · E 벽은 (cx,cy)와 (cx+1,cy) 사이.
              // ★[배치 18 ②] E 갈래가 한 칸 서쪽으로 밀려 있었다(`-1` 뒤 `+1`) — (cx-1,cy)·(cx,cy) 를 보고 있었다.
              //   동쪽 바깥벽에서는 우연히 같은 답이 나와 드러나지 않던 선재 오류다. 정본 정규화로 맞춘다.
              if (side === 'N') { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE); _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx; _ocy = _wcy - 1; }
              else { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE); _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx + 1; _ocy = _wcy; }
              isCutaway = cellRoomCache.get(`${_wcx}_${_wcy}_${bf}`) === _myRoom || cellRoomCache.get(`${_ocx}_${_ocy}_${bf}`) === _myRoom;
            } else isCutaway = false;                              // 실외 = 전 벽 불투명
          }
          if (isCutaway) {
            const dist = Math.hypot(dx, dy);
            const NEAR = 8 * CL_BUILDING_SIZE;
            const FAR  = 14 * CL_BUILDING_SIZE;
            const minA = bType === 'fence' ? 0.3 : 0.05;
            if (dist < NEAR) {
              ctx.globalAlpha = minA;
            } else if (dist < FAR) {
              const t = (dist - NEAR) / (FAR - NEAR);
              ctx.globalAlpha = minA + (1 - minA) * t;
            }
          }
        }
        drawBuildingIso(s.x, s.y, item.b.type, item.b);
        ctx.globalAlpha = 1;
      } else if (item.kind === 'hutroof') {
        // ★v3 반수혈 움집 지붕 — 베이크 스프라이트 1장(전 움집 공용). 앵커=지붕 로컬 원점 iso.
        const s = toScreen(item.iso.x, item.iso.y);
        { const _rimg = item.img || _hutRoofC; ctx.drawImage(_rimg, s.x - _rimg._ox, s.y - _rimg._oy); }   // ★[에셋 2차] 움집·큰집 지붕·곳간 통짜 공용 합성
      } else if (item.kind === 'stair_cell') {
        // 14.49-e7ah: stair cell N의 8 sub-step만 그림. z-sort 정확.
        const s = toScreen(item.iso.x, item.iso.y);
        const bf = item.b.floor || 0;
        const cx = Math.floor(item.ax / CL_BUILDING_SIZE);
        const cy = Math.floor(item.ay / CL_BUILDING_SIZE);
        if (bf > _viewFloor && _hideAbove) continue;   // ★[배치 18 ③] 계단도 같은 문법 — 실내면 위층 숨김
        drawStairCellPart(s.x, s.y, item.cellN, item.b);
      } else if (item.kind === 'mob') {
        // 14.49-e7ad: 위층 mob 안 그림. 아래층은 정상 alpha.
        const mFloor = item.m.floor || 0;
        if (mFloor > myFloor) continue;
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        drawMobIso(s.x, s.y, item.m);
        ctx.globalAlpha = 1;
      } else if (item.kind === 'corpse') {
        // Phase 5-7: 사체 — emoji
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // ★[재민 확정 2026-08-06] 시체도 **항상 보인다**(더는 살아 움직이는 것이 아니다).
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', s.x, s.y);
        ctx.globalAlpha = 1;
      }
    }
    _mtStage(ctx, 'D_루프후');
    _mtFlushFade(ctx);   // ★흐린 산 한 겹을 여기서 한 번에 덮는다(겹침 누적 방지)
    // ★계측기는 **그린 뒤** 그대로 받아 적는다(사본 금지)
    if (window.__mtOccDbg) { const D = window.__mtOccDbg;
      D.split = _mtSplitN; D.cutRender = _mtCutRenderN; D.fadeFlush = _mtFadeFlush; D.fadeSoft = _mtFadeSoftN; }
    _mtStage(ctx, 'E_흐림후');

    // ★★[2026-08-25 사건 레이어] 촌장 말풍선 — 마을 중심 위. 렌더러블 루프 **뒤**라 건물에 안 가린다.
    //   설계 §3.2: 소식은 대시보드가 아니라 **세계 안의 말**로 온다. 그래서 HUD 가 아니라 여기 그린다.
    if (villageBubbles.size) {
      const nowMs = performance.now();
      for (const [vid, bb] of [...villageBubbles]) {
        if (nowMs >= bb.until) { villageBubbles.delete(vid); continue; }
        const a = _evVillageAnchorAbs(vid);
        if (!a) continue;
        const p0 = w2i(a.x, a.y), sp = toScreen(p0.x, p0.y);
        if (sp.x < -260 || sp.y < -160 || sp.x > canvas.width + 260 || sp.y > canvas.height + 160) continue;
        let y = sp.y - 54;
        for (let i = bb.lines.length - 1; i >= 0; i--) { drawSpeechBubble(sp.x, y, bb.lines[i]); y -= 26; }
      }
    }

    // ★★[낚시 v2] 찌 — 대기는 잔물결, 입질은 **확 잠긴다**. 이 한 장면이 이 동사의 손맛 전부다.
    //   HUD 가 아니라 **세계 안**에 그린다(말풍선과 같은 규약 · 새 패널 금지).
    if (fishState) {
      const nowMs = performance.now();
      const p0 = w2i(fishState.x, fishState.y), sp = toScreen(p0.x, p0.y);
      if (!(sp.x < -80 || sp.y < -80 || sp.x > canvas.width + 80 || sp.y > canvas.height + 80)) {
        const bite = fishState.state === 'bite';
        const t = (nowMs - fishState.since) / 1000;
        // 대기: 느린 상하 1px. 입질: 빠르게 흔들리며 아래로 잠긴다(잠김 깊이가 남은 시간을 말한다).
        const bob = bite ? Math.sin(t * 26) * 3 + Math.min(7, t * 14) : Math.sin(t * 2.2) * 1.2;
        ctx.save();
        // 물결
        ctx.strokeStyle = bite ? 'rgba(255,225,150,0.85)' : 'rgba(210,235,255,0.5)';
        ctx.lineWidth = bite ? 2 : 1;
        for (let i = 0; i < (bite ? 3 : 2); i++) {
          const rr = (bite ? 7 : 5) + i * 6 + (bite ? (t * 26 % 6) : (t * 8 % 5));
          ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 2, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // 찌 — 서 있는 막대 + 붉은 머리
        const by = sp.y + bob;
        ctx.strokeStyle = 'rgba(240,240,235,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sp.x, by - 12); ctx.lineTo(sp.x, by + 2); ctx.stroke();
        ctx.fillStyle = bite ? '#ff5a3c' : '#e04a2f';
        ctx.beginPath(); ctx.arc(sp.x, by - 14, bite ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // 잡은 직후 — **크기가 눈에 보인다**(대어는 크게). 숫자를 읽게 하지 않는다.
    if (fishFx) {
      const nowMs = performance.now();
      if (nowMs >= fishFx.until) fishFx = null;
      else {
        const k = 1 - (fishFx.until - nowMs) / 2200;
        const cx = canvas.width / 2, cy = canvas.height / 2 - 70 - k * 34;
        const size = Math.round(20 + Math.min(34, fishFx.kg * 7));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.font = `${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🐟', cx, cy);
        ctx.font = `bold ${Math.round(13 + Math.min(9, fishFx.kg * 2))}px system-ui, sans-serif`;
        ctx.fillStyle = fishFx.big ? '#ffd27a' : '#dfe8f0';
        ctx.fillText(`${fishFx.kg.toFixed(1)}kg${fishFx.record ? ' ★' : ''}`, cx, cy + size * 0.7);
        ctx.restore();
      }
    }

    // === 14.49-e7o: 옛 vignette/directional shadow 제거 — fog of war가 시야 전담 (3-state 깔끔) ===

    // === 4-c) 14.49-e7j: PZ식 visibility polygon (정석 알고리즘) ===
    // 1) 시야 범위 내 wall 수집 + 경계 박스
    // 2) 각 endpoint마다 3 ray (theta-ε, theta, theta+ε) cast
    // 3) 각 ray와 가장 가까운 wall 교점
    // 4) 교점 각도순 정렬 → visibility polygon
    // 5) 화면 dark fill → destination-out으로 polygon 안 투명하게
    {
      // K21: fog도 카메라와 같은 보간 위치(_camAbs=myAbsRender) 기준. myAbsPredicted(30Hz 계단)을 쓰면
      //   땅은 myAbsRender로 매끄럽게 흐르는데 부채꼴만 30Hz로 어긋나 경계가 떨림. 같은 기준으로 묶어 떨림 제거.
      const px = _camAbs.x, py = _camAbs.y;
      window.__fogOrigin = { x: px, y: py };   // ★진단 훅 — 조준 중에도 **캐릭터 그대로**여야 한다
      const myCx = Math.floor(px / CL_BUILDING_SIZE);
      const myCy = Math.floor(py / CL_BUILDING_SIZE);
      // wall iteration radius (벽 수집 범위) vs ray cast range (광선 닿는 거리)
      // ray range는 화면 너비보다 충분히 커야 화면 가장자리까지 시야 정상
      const SHADOW_RANGE_CELLS = 16; // 벽 수집은 16 cell만 (perf)
      const MAX_RANGE = Math.max(W, H) * 2; // ray range는 화면 2배 (시야 화면 전체 커버)
      ensureWallMap();
      // ★★[안개 정렬 수리 2026-09-01 · 재민 실기 "검은 안개랑 뒤틀려버린다"]
      //   시야의 **원점**(px,py = 캐릭터)과 마스크가 **그려지는 자리**는 다른 것이다.
      //   종전엔 둘을 같은 식으로 썼는데, 월드는 `camX = myIso.x + _aimLookX` 로 그린다.
      //   ⇒ 조준(우클릭)으로 카메라가 밀린 만큼 마스크만 제자리에 남아 **땅과 어긋났다**(최대 180px).
      //   여기서 빼는 건 화면 배치뿐이다 — 광선은 여전히 캐릭터에서 쏜다(아래 rsi·visibleWorldPath).
      //   그래서 "지형지물에 가려지면 끌어서 봐도 안 보인다"가 그대로 지켜진다.
      const _aoX = _aimLookX, _aoY = _aimLookY;   // 이 프레임 월드가 실제로 쓴 밀기
      function w2sx(wx, wy) { return (wx - wy) - (px - py) - _aoX + W/2; }
      function w2sy(wx, wy) { return (wx + wy) * 0.5 - (px + py) * 0.5 - _aoY + H/2; }
      // 1) 벽 수집
      const segs = [];
      for (const key of clWallCellMap.keys()) {
        const [cxs, cys, side, fs] = key.split('_');
        const cx = +cxs, cy = +cys, f = +fs;
        if (f !== myFloor) continue;
        if (Math.abs(cx - myCx) > SHADOW_RANGE_CELLS) continue;
        if (Math.abs(cy - myCy) > SHADOW_RANGE_CELLS) continue;
        if (side === 'N') {
          segs.push({ ax: cx * CL_BUILDING_SIZE, ay: cy * CL_BUILDING_SIZE,
                      bx: (cx + 1) * CL_BUILDING_SIZE, by: cy * CL_BUILDING_SIZE });
        } else {
          segs.push({ ax: (cx + 1) * CL_BUILDING_SIZE, ay: cy * CL_BUILDING_SIZE,
                      bx: (cx + 1) * CL_BUILDING_SIZE, by: (cy + 1) * CL_BUILDING_SIZE });
        }
      }
      // Phase 5-8: 나무도 시야 차단 — 6각형으로 근사.
      // 시야 알고리즘이 O(6 × 선분²)라, 밀집 숲(나무 수백)에선 선분 수천 개 → 프레임당 수백만~천만 교차 검사로
      // 메인스레드가 멈춤(→ 서버 tick 못 읽어 orphan). 그래서 '가까운 N그루'만 시야를 막게 상한을 둔다.
      //   가까운 나무가 어차피 먼 나무를 가리므로 시각적 차이는 거의 없고, 비용은 O(상한²)로 고정.
      const pc = conns.get(primaryZoneId);
      if (pc) {
        const oxz = pc.meta?.worldOffsetX || 0, oyz = pc.meta?.worldOffsetY || 0;
        const SHADOW_RANGE_PX = SHADOW_RANGE_CELLS * CL_BUILDING_SIZE;
        const MAX_TREE_OCCLUDERS = 22;   // 시야 막는 나무 최대 수 (밀도 무관 비용 상한)
        const treeOcc = [];
        for (const r of pc.resources.values()) {
          if (r.type !== 'tree' || !r.r) continue;
          const tx = r.x + oxz, ty = r.y + oyz;
          const ddx = tx - px, ddy = ty - py;
          if (Math.abs(ddx) > SHADOW_RANGE_PX || Math.abs(ddy) > SHADOW_RANGE_PX) continue;
          const d2 = ddx * ddx + ddy * ddy;
          const occR = r.r * 1.7;
          if (d2 < occR * occR) continue;   // 나무 바로 밑(캐노피 안)이면 제외 — 사방 블랙아웃 방지
          treeOcc.push({ tx, ty, tr: r.r, d2 });
        }
        if (treeOcc.length > MAX_TREE_OCCLUDERS) {
          treeOcc.sort((a, b) => a.d2 - b.d2);   // 가까운 순
          treeOcc.length = MAX_TREE_OCCLUDERS;
        }
        for (const t of treeOcc) {
          const N = 6, tr = t.tr * 1.7;   // 캐노피 크기로 시야 차단 (줄기 r보다 크게 → 더 많이 가림, 크기 비례)
          for (let i = 0; i < N; i++) {
            const a1 = (i / N) * Math.PI * 2;
            const a2 = ((i + 1) / N) * Math.PI * 2;
            segs.push({
              ax: t.tx + Math.cos(a1) * tr, ay: t.ty + Math.sin(a1) * tr,
              bx: t.tx + Math.cos(a2) * tr, by: t.ty + Math.sin(a2) * tr,
            });
          }
        }
      }
      // ★[11차 재민 확정] 산은 완벽한 콜라이더다 — **건너편이 절대 안 보인다**.
      //   지금까지 바위 시야 차단은 야생 AI(server/wildlife.js losRk)에만 걸려 있어서, 늑대는 산 너머를
      //   못 보는데 플레이어 화면에는 산 너머가 그대로 보였다. 그 비대칭을 없앤다.
      //   구현: 바위 덩어리의 **실루엣**(비바위와 맞닿은 변)만 선분으로 넣는다. 안쪽 변은 어차피
      //   바깥 변에 가려 시야에 영향이 없고, 넣으면 선분만 수백 개 늘어 O(선분²)를 터뜨린다.
      //   비용 고정 장치 두 겹:
      //     ① 플레이어가 **셀을 옮길 때만** 다시 만든다(프레임마다 1681번 지형 판정하면 메인루프가 멈춘다).
      //     ② 같은 줄로 이어지는 변은 하나로 합치고(런 병합), 그래도 많으면 가까운 순 상한.
      //   나무(MAX_TREE_OCCLUDERS 22)와 같은 사고방식 — 가까운 것이 먼 것을 어차피 가린다.
      {
        const ROCK_RANGE_CELLS = 20;         // 수집 반경(셀) — 화면 대각선보다 넉넉
        const MAX_ROCK_SEGS = 90;            // 선분 상한(런 병합 후) — 나무 132선분과 합쳐도 O(선분²)가 감당된다
        const rcx = Math.floor(px / 32), rcy = Math.floor(py / 32);
        let rc = window._rockOccCache;
        if (!rc || rc.cx !== rcx || rc.cy !== rcy || rc.zid !== primaryZoneId) {
          const R = ROCK_RANGE_CELLS, segsR = [];
          const isR = (cx, cy) => isRockAtAbs(cx * 32 + 16, cy * 32 + 16);
          // 가로 변(N/S): y줄마다 x로 훑으며 '바위인데 위(아래)가 비바위'인 구간을 런으로 묶는다
          for (let cy = rcy - R; cy <= rcy + R; cy++) {
            for (const [dy, edge] of [[-1, 0], [1, 1]]) {
              let run = null;
              for (let cx = rcx - R; cx <= rcx + R + 1; cx++) {
                const on = cx <= rcx + R && isR(cx, cy) && !isR(cx, cy + dy);
                if (on) { if (!run) run = [cx, cx]; else run[1] = cx; }
                else if (run) {
                  const y = (cy + edge) * 32;
                  segsR.push({ ax: run[0] * 32, ay: y, bx: (run[1] + 1) * 32, by: y });
                  run = null;
                }
              }
            }
          }
          // 세로 변(W/E)
          for (let cx = rcx - R; cx <= rcx + R; cx++) {
            for (const [dx, edge] of [[-1, 0], [1, 1]]) {
              let run = null;
              for (let cy = rcy - R; cy <= rcy + R + 1; cy++) {
                const on = cy <= rcy + R && isR(cx, cy) && !isR(cx + dx, cy);
                if (on) { if (!run) run = [cy, cy]; else run[1] = cy; }
                else if (run) {
                  const x = (cx + edge) * 32;
                  segsR.push({ ax: x, ay: run[0] * 32, bx: x, by: (run[1] + 1) * 32 });
                  run = null;
                }
              }
            }
          }
          rc = window._rockOccCache = { cx: rcx, cy: rcy, zid: primaryZoneId, segs: segsR };
        }
        let rs = rc.segs;
        if (rs.length > MAX_ROCK_SEGS) {
          const d2 = (s) => { const mx = (s.ax + s.bx) / 2 - px, my = (s.ay + s.by) / 2 - py; return mx * mx + my * my; };
          rs = rs.slice().sort((a, b) => d2(a) - d2(b)).slice(0, MAX_ROCK_SEGS);
        }
        for (const s of rs) segs.push(s);
      }
      // 경계 박스 4변 (ray 종료점) — MAX_RANGE 큰 박스
      const bMin = MAX_RANGE;
      segs.push({ ax: px - bMin, ay: py - bMin, bx: px + bMin, by: py - bMin });
      segs.push({ ax: px + bMin, ay: py - bMin, bx: px + bMin, by: py + bMin });
      segs.push({ ax: px + bMin, ay: py + bMin, bx: px - bMin, by: py + bMin });
      segs.push({ ax: px - bMin, ay: py + bMin, bx: px - bMin, by: py - bMin });
      // 2) endpoints + angles
      const eps = 0.0001;
      const angles = [];
      for (const s of segs) {
        const a1 = Math.atan2(s.ay - py, s.ax - px);
        const a2 = Math.atan2(s.by - py, s.bx - px);
        angles.push(a1 - eps, a1, a1 + eps, a2 - eps, a2, a2 + eps);
      }
      // ray-segment intersection. returns t (ray param) or null.
      function rsi(dx, dy, s) {
        const sx = s.bx - s.ax, sy = s.by - s.ay;
        const den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-10) return null;
        const t = ((s.ax - px) * sy - (s.ay - py) * sx) / den;
        const u = ((s.ax - px) * dy - (s.ay - py) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) return t;
        return null;
      }
      // 14.49-e7u: facing cone 적용. cone 안 angle만 ray cast → fan polygon
      const facingLen = Math.hypot(myFacingVx, myFacingVy);
      const hasFacing = facingLen > 0.001;
      const fxn = hasFacing ? myFacingVx / facingLen : 0;
      const fyn = hasFacing ? myFacingVy / facingLen : 0;
      const CONE_COS = -0.34; // cos(110°)
      const halfCone = Math.acos(CONE_COS);
      const facingAngle = hasFacing ? Math.atan2(fyn, fxn) : 0;
      function angleInCone(a) {
        if (!hasFacing) return true;
        let diff = a - facingAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return Math.abs(diff) <= halfCone;
      }
      // cone boundary ray도 추가
      const filteredAngles = [];
      if (hasFacing) {
        filteredAngles.push(facingAngle - halfCone + 0.001, facingAngle + halfCone - 0.001);
      }
      for (const a of angles) {
        if (angleInCone(a)) filteredAngles.push(a);
      }
      // 3) 각 각도마다 closest hit
      const hits = [];
      for (const a of filteredAngles) {
        const dx = Math.cos(a), dy = Math.sin(a);
        let best = MAX_RANGE;
        for (const s of segs) {
          const t = rsi(dx, dy, s);
          if (t !== null && t < best) best = t;
        }
        hits.push({ a, x: px + dx * best, y: py + dy * best });
      }
      // 4) facing 기준 normalized angle로 정렬 (cone이 atan2 wrap 가로지를 때 sort 잘못 방지)
      function normalizedDiff(a) {
        let d = a - facingAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      }
      if (hasFacing) {
        hits.sort((u, v) => normalizedDiff(u.a) - normalizedDiff(v.a));
      } else {
        hits.sort((u, v) => u.a - v.a);
      }
      // 5) Off-screen mask canvas — fog of war 적용
      //    - unseen (한 번도 못 봤음): 완전 검은색 alpha 1.0
      //    - seen (한 번 봤지만 현재 시야 밖): 어둠 alpha 0.5
      //    - visible (지금 보고 있음): hole (alpha 0)
      // FOG_MASK_M: 화면보다 사방 64px 크게 — 다음 frame 합성 시 카메라 델타만큼 밀어도
      // 가장자리에 빈 띠(검은 strip 깜빡임)가 안 생기게 하는 여유분.
      const FOG_MASK_M = 64;
      if (!window._shadowMask || window._shadowMask.width !== W + FOG_MASK_M * 2 || window._shadowMask.height !== H + FOG_MASK_M * 2) {
        window._shadowMask = document.createElement('canvas');
        window._shadowMask.width = W + FOG_MASK_M * 2;
        window._shadowMask.height = H + FOG_MASK_M * 2;
      }
      if (!window._seenChunks) window._seenChunks = new Map(); // "chX_chY" → Set(packed cx*65536+cy)
      const seenChunks = window._seenChunks;
      const mc = window._shadowMask;
      const mctx = mc.getContext('2d');

      // 14.49-e7u: cumulative polygon 방식 (cell stairstep 0, polygon 직선)
      // - visible polygon = fan-shape (cone 안 ray cast 결과)
      // - + 플레이어 중심 small circle (cone 무관 항상 보이는 가까운 원)
      // - cumulative seen path = visible polygon들의 누적 union (world coord)
      // - mask: 검은색 → seen alpha 0.8 빼기 → visible alpha 1.0 빼기 → 합성

      // visible polygon (world coord) — fan + close circle
      const visibleWorldPath = new Path2D();
      const CLOSE_RADIUS = 128; // 4 cell, cone 무관 visible
      if (hits.length > 0) {
        if (hasFacing) {
          // fan: player center → sorted hits → back to player
          visibleWorldPath.moveTo(px, py);
          for (const h of hits) {
            visibleWorldPath.lineTo(h.x, h.y);
          }
          visibleWorldPath.lineTo(px, py);
        } else {
          // full 360°
          visibleWorldPath.moveTo(hits[0].x, hits[0].y);
          for (let i = 1; i < hits.length; i++) {
            visibleWorldPath.lineTo(hits[i].x, hits[i].y);
          }
          visibleWorldPath.closePath();
        }
      }
      // + 가까운 영역 (cone 무관, full 360°) — 벽 막힘 ray cast로 wall clip
      const CLOSE_RAYS = 36;
      const closeHits = [];
      for (let i = 0; i < CLOSE_RAYS; i++) {
        const a = (i / CLOSE_RAYS) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        let best = CLOSE_RADIUS;
        for (const s of segs) {
          const t = rsi(dx, dy, s);
          if (t !== null && t < best) best = t;
        }
        closeHits.push({ x: px + dx * best, y: py + dy * best });
      }
      visibleWorldPath.moveTo(closeHits[0].x, closeHits[0].y);
      for (let i = 1; i < closeHits.length; i++) {
        visibleWorldPath.lineTo(closeHits[i].x, closeHits[i].y);
      }
      visibleWorldPath.closePath();

      // 14.49-e7y → rewrite: visible polygon을 1px=1cell 미니 캔버스에 rasterize해서 seen 마킹.
      // 옛 isPointInPath(셀 중심 1점, FOG_RANGE 18셀) 방식의 빈틈 수정:
      //   1) 화면에 보이는 먼 영역(~47셀)이 seen으로 기록 안 돼 "봤는데 새까만" 버그
      //   2) 부분만 보인 셀(시야 부채꼴 가장자리)이 기록 안 됨 → 커버리지 ≥25%면 seen
      const FOG_MARK_RANGE = 48; // TILE_RENDER_RADIUS(1500px)/32 ≈ 47셀
      const G = FOG_MARK_RANGE * 2 + 1;
      if (!window._fogGridCv || window._fogGridCv.width !== G) {
        window._fogGridCv = document.createElement('canvas');
        window._fogGridCv.width = G; window._fogGridCv.height = G;
      }
      const gctx = window._fogGridCv.getContext('2d', { willReadFrequently: true });
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, G, G);
      // world px → grid px: scale 1/32, 원점 = cell (myCx-R, myCy-R)
      gctx.setTransform(1 / 32, 0, 0, 1 / 32, -(myCx - FOG_MARK_RANGE), -(myCy - FOG_MARK_RANGE));
      gctx.fillStyle = '#fff';
      gctx.fill(visibleWorldPath);
      const gdata = gctx.getImageData(0, 0, G, G).data;
      for (let gj = 0; gj < G; gj++) {
        for (let gi = 0; gi < G; gi++) {
          if (gdata[(gj * G + gi) * 4 + 3] < 64) continue; // 커버리지 < 25%
          const scx = myCx - FOG_MARK_RANGE + gi;
          const scy = myCy - FOG_MARK_RANGE + gj;
          const chKey = `${scx >> 4}_${scy >> 4}`;
          let chSet = seenChunks.get(chKey);
          if (!chSet) { chSet = new Set(); seenChunks.set(chKey, chSet); }
          chSet.add(scx * 65536 + scy); // packed int (cx<19100, cy<11900 — 안전)
        }
      }

      // mask render — 매 frame mode 명시 (이전 frame destination-out 상태 잔존 방지)
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, mc.width, mc.height);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fillRect(0, 0, mc.width, mc.height);

      // (i) seen cells: iso diamond single path → destination-out alpha 0.8 (살짝 어둠)
      // 청크(16셀) 단위 저장 — 탐험으로 seen이 수만 개로 늘어도 viewport 주변 청크만 순회
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'destination-out';
      mctx.fillStyle = 'rgba(0,0,0,0.8)';
      // ★경로를 Path2D 로 한 번만 만들어 두 마스크에 **같은 기하**로 뚫는다(사본 금지).
      //   3단계 마스크는 0.8(살짝 어둠), 미탐사 마스크는 1.0(완전 제거) — 알파만 다르다.
      const seenPath = new Path2D();
      const halfW = 32, halfH = 16, expand = 1;
      const FOG_DRAW_RANGE = 52; // 화면 끝까지 (옛 35는 가장자리 누락)
      const ch0x = (myCx - FOG_DRAW_RANGE) >> 4, ch1x = (myCx + FOG_DRAW_RANGE) >> 4;
      const ch0y = (myCy - FOG_DRAW_RANGE) >> 4, ch1y = (myCy + FOG_DRAW_RANGE) >> 4;
      for (let chx = ch0x; chx <= ch1x; chx++) {
        for (let chy = ch0y; chy <= ch1y; chy++) {
          const chSet = seenChunks.get(`${chx}_${chy}`);
          if (!chSet) continue;
          for (const packed of chSet) {
            const cxs = Math.floor(packed / 65536), cys = packed % 65536;
            const wxC = (cxs + 0.5) * CL_BUILDING_SIZE;
            const wyC = (cys + 0.5) * CL_BUILDING_SIZE;
            // mask canvas는 화면보다 +FOG_MASK_M 큼 — 좌표를 M만큼 평행이동
            const sxC = w2sx(wxC, wyC) + FOG_MASK_M;
            const syC = w2sy(wxC, wyC) + FOG_MASK_M;
            if (sxC < -64 || sxC > mc.width + 64 || syC < -32 || syC > mc.height + 32) continue;
            seenPath.moveTo(sxC - halfW - expand, syC);
            seenPath.lineTo(sxC, syC - halfH - expand);
            seenPath.lineTo(sxC + halfW + expand, syC);
            seenPath.lineTo(sxC, syC + halfH + expand);
            seenPath.closePath();
          }
        }
      }
      mctx.fill(seenPath);

      // (ii) visible polygon: world → screen iso transform → destination-out alpha 1.0 (밝음)
      mctx.save();
      mctx.setTransform(1, 0.5, -1, 0.5, W/2 - (px - py) - _aoX + FOG_MASK_M, H/2 - (px + py)/2 - _aoY + FOG_MASK_M);   // ★밀기 포함 — (i)본 셀과 (ii)부채꼴이 같은 프레임에 있어야 한다
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fill(visibleWorldPath);
      mctx.restore();

      // mask 생성 시점의 플레이어 위치 기록 — 다음 frame 합성 시 카메라 델타 보정용
      window._shadowMaskPx = px;
      window._shadowMaskPy = py;
      window._shadowMaskAx = _aoX;   // ★밀기도 같이 — 합성 보정이 카메라와 밀기 **둘 다** 따라가야 한다
      window._shadowMaskAy = _aoY;

      // ★[재민 확정 2026-08-06] 합성은 **이 블록 아래**, 화살까지 다 그린 뒤에 한다.
      //   (옛 주석: "다음 frame entity render 전에 합성" — 그 배치가 미탐사 위 누출의 원인이었다.)
    }

    // === Phase 5-I: 화살 발사체 렌더 (절대좌표 → 등속 외삽 → iso 화면) ===
    if (window._arrows && window._arrows.size) {
      const tnow = performance.now();
      for (const [aid, ar] of window._arrows) {
        const dt = (tnow - ar.t0) / 1000;
        if (dt > 4.5) { window._arrows.delete(aid); continue; } // 안전 만료
        const ax = ar.ax + ar.vx * dt, ay = ar.ay + ar.vy * dt;
        const iso = w2i(ax, ay);
        const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
        const sx = iso.x - myIso.x + W / 2, sy = iso.y - myIso.y + H / 2;
        if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
        // 화살: 진행 방향 짧은 선 + 촉
        const vlen = Math.hypot(ar.vx, ar.vy) || 1;
        const ex = (ar.vx / vlen) * 18, ey = (ar.vy / vlen) * 9; // iso 기울임 근사
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sx - ex, sy - ey); ctx.lineTo(sx + ex, sy + ey); ctx.stroke();
        ctx.fillStyle = '#d8d0c0';
        ctx.beginPath(); ctx.arc(sx + ex, sy + ey, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    window.__fogGateDbg = { skipped: _gateSkipped, missing: _gateMissing, missKind: _gateMissKind,
                            free: _gateFree, freeKinds: Object.keys(_GATE_FREE).sort(), total: renderables.length,
                            drawn: _gateDrawn.length / 3 };

    // ↓↓ 여기부터는 **안개 위**다. 월드 사물을 여기서 그리면 미탐사 셀에 누출된다.
    //   현재 안개 위에 남는 것 = 밤 오버레이(어둡게만) · 인접 존 방향 화살 · 전투 지시자 ·
    //   HUD/미니맵 — 전부 **화면 UI**라 의도된 것이다.
    //   ※단 하나 예외: 아래 '캐나디아 마을 작업장 시각화'는 월드 좌표 개발용 오버레이인데
    //     `primaryZoneId === 'canadia'` 에서만 돈다(한반도 단독 운영이라 실행되지 않는다).
    //     canadia 를 살릴 일이 생기면 그 블록을 이 합성 **위로** 옮겨라.
    // === 4-1) 밤 어두움 오버레이 — 푸른 톤, 시야는 더 좁아짐 ===
    const dk = darknessLevel();
    if (dk > 0) {
      // 푸른빛 도는 어두움 — 한밤엔 시야 절반쯤으로 줄어드는 느낌
      const nightGrad = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, Math.max(W, H) * 0.45);
      nightGrad.addColorStop(0, `rgba(10, 18, 40, ${0.05 * dk})`);  // 중심도 살짝 어둡게
      nightGrad.addColorStop(0.5, `rgba(8, 14, 32, ${0.45 * dk})`);
      nightGrad.addColorStop(1, `rgba(4, 8, 20, ${0.85 * dk})`);
      ctx.fillStyle = nightGrad;
      ctx.fillRect(0, 0, W, H);
    }
    _mtStage(ctx, 'F_밤후');

    // === Phase 4d-4: 캐나디아 마을 작업장 시각화 (각 직업 work area) ===
    if (primaryZoneId === 'canadia' && _canadiaVillages.length) {
      const ox = pConn.meta.worldOffsetX || 0;
      const oy = pConn.meta.worldOffsetY || 0;
      for (const v of _canadiaVillages) {
        if (!v.coord || !v.jobs) continue;
        const cx = v.coord.x, cy = v.coord.y;
        for (const [job, count] of Object.entries(v.jobs)) {
          if (!count || count < 1) continue;
          const def = CANADIA_JOB[job];
          if (!def) continue;
          // work area center (server JOB_WORK_OFFSET과 동일 식)
          const ax = ox + cx + Math.cos(def.angle) * def.dist;
          const ay = oy + cy + Math.sin(def.angle) * def.dist;
          // viewport cull
          const dvx = ax - worldCx, dvy = ay - worldCy;
          if (Math.abs(dvx) > 1300 || Math.abs(dvy) > 1300) continue;
          const iso = w2i(ax, ay);
          const s = toScreen(iso.x, iso.y);
          // 다이아 ground patch (96 × 48 iso = 3x3 cell 정도)
          const halfW = 80, halfH = 40;
          ctx.fillStyle = def.color;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - halfH);
          ctx.lineTo(s.x + halfW, s.y);
          ctx.lineTo(s.x, s.y + halfH);
          ctx.lineTo(s.x - halfW, s.y);
          ctx.closePath();
          ctx.fill();
          // 외곽선
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
          // 직업 아이콘
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.lineWidth = 3;
          ctx.strokeText(def.emoji, s.x, s.y + 4);
          ctx.fillText(def.emoji, s.x, s.y + 4);
          // 라벨 — "농지 ×3"
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#ffe8a0';
          const txt = `${def.label} ×${count}`;
          ctx.strokeText(txt, s.x, s.y - halfH - 6);
          ctx.fillText(txt, s.x, s.y - halfH - 6);
          ctx.textAlign = 'start';
        }
      }
    }

    // === Phase 4d-11: 캐러밴 시각화 제거 — NPC entity가 직접 이동 (마차 객체 X) ===
    if (false && primaryZoneId === 'canadia' && _canadiaCaravans.length) {
      const ox = pConn.meta.worldOffsetX || 0;
      const oy = pConn.meta.worldOffsetY || 0;
      for (const c of _canadiaCaravans) {
        const ax = ox + c.x;
        const ay = oy + c.y;
        // viewport cull — 화면 밖이면 skip
        const dx = ax - worldCx, dy = ay - worldCy;
        if (Math.abs(dx) > 1200 || Math.abs(dy) > 1200) continue;
        const iso = w2i(ax, ay);
        const s = toScreen(iso.x, iso.y);
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        // 마차 본체 (작은 사다리꼴)
        ctx.fillStyle = c.state === 'outbound' ? '#c8a060' : '#8090c8';
        ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x - 10, s.y - 4);
        ctx.lineTo(s.x + 10, s.y - 4);
        ctx.lineTo(s.x + 8, s.y + 2);
        ctx.lineTo(s.x - 8, s.y + 2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // 지붕
        ctx.fillStyle = '#a07040';
        ctx.beginPath();
        ctx.moveTo(s.x - 10, s.y - 4);
        ctx.lineTo(s.x, s.y - 12);
        ctx.lineTo(s.x + 10, s.y - 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // 바퀴 2개
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath(); ctx.arc(s.x - 6, s.y + 2, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 6, s.y + 2, 2.5, 0, Math.PI*2); ctx.fill();
        // 호위 별 (있을 때)
        if (c.escort > 0) {
          ctx.fillStyle = '#ff6060';
          ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⚔️' + c.escort, s.x, s.y - 14);
        }
        // 라벨 — from → to
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const arrow = c.state === 'outbound' ? '→' : '←';
        const txt = `${c.from} ${arrow} ${c.to}`;
        ctx.strokeText(txt, s.x, s.y - 22);
        ctx.fillText(txt, s.x, s.y - 22);
        // Phase 4d-5: 빌려온 NPC 이름
        if (c.npcName) {
          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#cce';
          const npcTxt = `🚶 ${c.npcName}`;
          ctx.strokeText(npcTxt, s.x, s.y - 33);
          ctx.fillText(npcTxt, s.x, s.y - 33);
        }
        ctx.textAlign = 'start';
      }
    }

    // === 5) 인접 존 방향 화살표 (4방향) ===
    drawNeighborArrow(pConn.meta.east, '동');
    drawNeighborArrow(pConn.meta.west, '서');
    drawNeighborArrow(pConn.meta.north, '북');
    drawNeighborArrow(pConn.meta.south, '남');
    // === 5b) §4-4 P4: 진행 전투 지시자(화면 안=교전 마커, 화면 밖=방향 화살) ===
    drawBattleIndicators(toScreen);
  }

  function drawNeighborArrow(neighborId, label) {
    if (!neighborId) return;
    const nm = zonesMeta[neighborId];
    if (!nm) return;
    const tx = nm.worldOffsetX + 512;
    const ty = (nm.worldOffsetY || 0) + 512;
    const dx = tx - myAbsPredicted.x;
    const dy = ty - myAbsPredicted.y;
    // 같은 존이거나 거리 0이면 표시 안 함
    if (Math.hypot(dx, dy) < 100) return;
    // 월드 방향을 iso 화면 방향으로
    const iso = { x: dx - dy, y: (dx + dy) * 0.5 };
    const ilen = Math.hypot(iso.x, iso.y) || 1;
    const dirX = iso.x / ilen, dirY = iso.y / ilen;
    // 화면 가장자리에서 안쪽으로 살짝 들어온 위치
    const r = Math.min(W, H) * 0.42;
    const ax = W/2 + dirX * r;
    const ay = H/2 + dirY * r;
    // 화살표 (다이아 모양 포인터)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dirY, dirX));
    ctx.fillStyle = 'rgba(240, 198, 116, 0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // 라벨 (화살표 안쪽)
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0c674';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    const labelX = W/2 + dirX * (r - 26);
    const labelY = H/2 + dirY * (r - 26);
    const text = `${nm.displayName.split(' ')[0]} ${label}`;
    ctx.strokeText(text, labelX, labelY);
    ctx.fillText(text, labelX, labelY);
    ctx.textAlign = 'start';
  }

  // ═══════════ §4-4 P4: 전쟁 전투 관전·지휘·지시자 (랩 focusCameraOnBattle·drawNeighborArrow 정합) ═══════════
  // 레지스트리 만료 — 2Hz broadcast 끊김(종전·시야밖) 6s, 종료 표식 5s 잔류 후 제거.
  function pruneWarBattles() {
    const now = performance.now(); let changed = false;
    for (const [id, b] of warBattles) {
      if ((now - (b.seenAt || 0)) > 6000 || (b.resolvedAt && (now - b.resolvedAt) > 5000)) {
        warBattles.delete(id); changed = true;
        if (_warSpec.id === id) stopSpectate();
        if (_warCmdId === id) _warCmdId = null;
      }
    }
    return changed;
  }
  // 화면 안=교전 마커(atk A:B def), 화면 밖=가장자리 방향 화살(drawNeighborArrow 패턴).
  function drawBattleIndicators(toScreen) {
    if (!warBattles.size) return;
    if (pruneWarBattles()) updateWarHud();
    for (const b of warBattles.values()) {
      const iso = w2i(b.ox, b.oy), s = toScreen(iso.x, iso.y), m = 46;
      const off = (s.x < m || s.x > W - m || s.y < m || s.y > H - m);
      const col = (b.phase === 'resolved') ? '#c9c04b' : (_warSpec.id === b.id ? '#ffe14d' : '#ff8a5a');
      if (off) {
        const dx = s.x - W / 2, dy = s.y - H / 2, ang = Math.atan2(dy, dx), r = Math.min(W, H) * 0.42;
        const ax = W / 2 + Math.cos(ang) * r, ay = H / 2 + Math.sin(ang) * r;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-7, 9); ctx.lineTo(-2, 0); ctx.lineTo(-7, -9); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
        const lxp = W / 2 + Math.cos(ang) * (r - 26), lyp = H / 2 + Math.sin(ang) * (r - 26);
        ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = `⚔️ ${b.aliveA}:${b.aliveB}`;
        ctx.strokeText(txt, lxp, lyp); ctx.fillText(txt, lxp, lyp); ctx.textAlign = 'start';
      } else {
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = (b.phase === 'resolved')
          ? `⚑ ${b.atk || ''} vs ${b.def || ''} 종료`
          : `⚔️ ${b.atk || ''} ${b.aliveA} : ${b.aliveB} ${b.def || ''}`;
        ctx.strokeText(txt, s.x, s.y - 44); ctx.fillText(txt, s.x, s.y - 44); ctx.textAlign = 'start';
      }
    }
  }
  // 관전 카메라 — 현재 카메라(_lastCamAbs)에서 전투 origin(abs px)으로 0.6s 트윈(render가 구동).
  function focusCameraOnBattle(b) {
    if (!b) return;
    _warSpec.active = true; _warSpec.returning = false; _warSpec.id = b.id;
    _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y };
    _warSpec.to = { x: b.ox, y: b.oy }; _warSpec.t0 = performance.now();
  }
  function spectateBattle(id) { const b = warBattles.get(id); if (b) { focusCameraOnBattle(b); updateWarHud(); } }
  function stopSpectate() {
    if (_warSpec.active) { _warSpec.returning = true; _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y }; _warSpec.t0 = performance.now(); }
    _warSpec.active = false; _warSpec.id = null; _warSpec.to = null;
    updateWarHud();
  }
  // 지휘 참가/해제 — war_command_join 송신(서버 진영·근접 검증). 기존 input 채널(WASD) 그대로 재사용. id=null=해제.
  function setCommand(id) {
    _warCmdId = id; _warCmdMsg = id ? '지휘 요청 중…' : '';
    sendPrimary({ type: 'war_command_join', warId: id });
    if (id) { const b = warBattles.get(id); if (b) focusCameraOnBattle(b); }
    updateWarHud();
  }
  function toggleCommand(id) { setCommand(_warCmdId === id ? null : id); }
  // 스펙테이터 HUD DOM — 진행 전투 목록·A/B 카운트·casus·phase + 관전/지휘 버튼.
  function _warBtnCss(bg) {
    return 'flex:1;padding:3px 6px;font:11px sans-serif;color:#e6ebf2;background:' + bg
      + ';border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;';
  }
  function ensureWarHud() {
    if (_warHudEl) return _warHudEl;
    const host = document.getElementById('game') || document.body;
    const el = document.createElement('div');
    el.id = 'warHud';
    el.style.cssText = 'position:absolute;top:64px;right:12px;z-index:40;width:236px;max-height:60vh;overflow:auto;'
      + 'background:rgba(16,20,26,0.88);border:1px solid rgba(255,138,90,0.5);border-radius:8px;'
      + 'padding:8px 10px;font:12px/1.5 sans-serif;color:#e6ebf2;box-shadow:0 4px 16px rgba(0,0,0,0.5);display:none;';
    host.appendChild(el); _warHudEl = el; return el;
  }
  function updateWarHud() {
    const el = ensureWarHud(), list = [...warBattles.values()];
    if (!list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block'; el.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:bold;color:#ff9a6a;margin-bottom:6px;';
    head.textContent = `⚔️ 진행 전투 ${list.length}`; el.appendChild(head);
    for (const b of list) {
      const row = document.createElement('div');
      row.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);padding:5px 0;';
      const title = document.createElement('div');
      title.innerHTML = `<span style="color:${WAR_SIDE_COL[0]}">${b.atk || '?'}</span> vs `
        + `<span style="color:${WAR_SIDE_COL[1]}">${b.def || '?'}</span>`;
      row.appendChild(title);
      const stat = document.createElement('div');
      stat.style.cssText = 'color:#9fb0c4;font-size:11px;';
      stat.textContent = `A ${b.aliveA} · B ${b.aliveB} · ${b.casus || ''} · ${b.phase === 'resolved' ? '종료' : '교전'}`;
      row.appendChild(stat);
      if (b.phase !== 'resolved') {
        const btns = document.createElement('div');
        btns.style.cssText = 'margin-top:4px;display:flex;gap:6px;';
        const bSpec = document.createElement('button');
        bSpec.textContent = (_warSpec.id === b.id) ? '관전중' : '관전';
        bSpec.style.cssText = _warBtnCss((_warSpec.id === b.id) ? '#356b3a' : '#2a3340');
        bSpec.addEventListener('click', () => spectateBattle(b.id)); btns.appendChild(bSpec);
        const bCmd = document.createElement('button');
        bCmd.textContent = (_warCmdId === b.id) ? '지휘 해제' : '지휘';
        bCmd.style.cssText = _warBtnCss((_warCmdId === b.id) ? '#8a4a2a' : '#2a3340');
        bCmd.addEventListener('click', () => toggleCommand(b.id)); btns.appendChild(bCmd);
        row.appendChild(btns);
      }
      el.appendChild(row);
    }
    if (_warSpec.active || _warSpec.returning || _warCmdId) {
      const foot = document.createElement('div');
      foot.style.cssText = 'margin-top:6px;border-top:1px solid rgba(255,255,255,0.12);padding-top:5px;';
      if (_warCmdMsg) { const mm = document.createElement('div'); mm.style.cssText = 'color:#ffd27a;font-size:11px;margin-bottom:4px;'; mm.textContent = _warCmdMsg; foot.appendChild(mm); }
      const bStop = document.createElement('button');
      bStop.textContent = '관전/지휘 종료 → 내 캐릭터';
      bStop.style.cssText = _warBtnCss('#4a4432');
      bStop.addEventListener('click', () => { if (_warCmdId) setCommand(null); stopSpectate(); }); foot.appendChild(bStop);
      el.appendChild(foot);
    }
  }

  // === 그리기 헬퍼 ===
  function drawDiamond(cx, cy, size, color) {
    const hw = size;
    const hh = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  const WALL_HEIGHT = 64; // 14.49-e2: FLOOR_HEIGHT(64)와 같음
  // 14.49-e7ah: stair cell N의 8 sub-step만 그림. anchor (x, y) = cell N center.
  function drawStairCellPart(x, y, cellN, building) {
    const H = FLOOR_HEIGHT;
    const dir = building?.data?.dir || 'N';
    const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const pv = { x: -dv.y, y: dv.x };
    function worldOffToScreen(wx, wy, wz) {
      return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
    }
    const SUB_PER_CELL = 8;
    const SUB_TOTAL = 24;
    const SUB_WIDTH = CL_BUILDING_SIZE / SUB_PER_CELL;
    for (let subInCell = 0; subInCell < SUB_PER_CELL; subInCell++) {
      const S = cellN * SUB_PER_CELL + subInCell;
      // cell N 중심 기준 (anchor가 cell N center): subInCell offset
      const w = (subInCell - 3.5) * SUB_WIDTH;
      const z = (S / (SUB_TOTAL - 1)) * H;
      const halfDV = SUB_WIDTH / 2;
      const halfPV = CL_BUILDING_SIZE / 2;
      function corner(dvSign, pvSign) {
        const wx = dv.x * (w + halfDV * dvSign) + pv.x * halfPV * pvSign;
        const wy = dv.y * (w + halfDV * dvSign) + pv.y * halfPV * pvSign;
        const sc = worldOffToScreen(wx, wy, z);
        return { x: x + sc.x, y: y + sc.y };
      }
      const c1 = corner(-1, -1);
      const c2 = corner( 1, -1);
      const c3 = corner( 1,  1);
      const c4 = corner(-1,  1);
      const prevZ = S === 0 ? 0 : ((S - 1) / (SUB_TOTAL - 1)) * H;
      if (z > prevZ) {
        const c1d = { x: c1.x, y: c1.y + (z - prevZ) };
        const c4d = { x: c4.x, y: c4.y + (z - prevZ) };
        ctx.fillStyle = '#4a2a14';
        ctx.strokeStyle = '#2a1808';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
        ctx.lineTo(c4d.x, c4d.y); ctx.lineTo(c1d.x, c1d.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#b08858';
      ctx.strokeStyle = '#5a3818';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawBuildingIso(x, y, type, building) {
    if (type === 'vtile') {
      // ★[실체화 동기 — 랩 정본] 마을 지면 타일: yard=부지 원판(다짐 흙), plaza=큰집 마당 광장, garden=텃밭(이랑)
      const kind = (building?.data?.kind) || 'yard';
      // ★[텃밭 3D — 에셋 10차] 이랑·새싹 타일(1셀 정합 스프라이트). 미로드 시 아래 벡터 이랑 폴백.
      if (kind === 'garden' && drawCellSpriteAt('yard_garden', x, y)) return;
      if (kind !== 'garden' && _tileYardC) {
        // ★생성형 텍스처 실셀 다이아(64×32) — 마당·광장이 이어진 다짐 지면으로 읽힘(구 반크기 점묘 폐지)
        ctx.drawImage(kind === 'plaza' ? _tilePlazaC : _tileYardC, x - 32, y - 16);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y); ctx.closePath();
      if (kind === 'plaza') ctx.fillStyle = 'rgba(158,128,82,0.62)';
      else if (kind === 'garden') ctx.fillStyle = '#5e7038';
      else ctx.fillStyle = 'rgba(122,88,54,0.5)';
      ctx.fill();
      if (kind === 'garden') {
        ctx.strokeStyle = 'rgba(58,82,34,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
        ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 12, y + 2);
        ctx.stroke();
      }
      return;
    }
    if (type === 'hut_site') {
      // ★움집터 — 수혈 구덩이 + 단계 진행. stage 1=구덩이, 2=굴립주, 3=도리·서까래 골조, 4=완공(hut로 전환)
      const st = (building?.data?.stage) | 0;
      // ★[공정 3D — 에셋 10차] 완공 움집과 **같은 발자국(6×4)·같은 앵커 계약**의 단계 스프라이트.
      //   행 px(b.x,b.y)는 발자국 중심이 아니라 (x0+2.5, y0+1.5)셀이라, 발자국 북서 오버행 모서리까지의
      //   델타를 iso로 변환해 앵커를 잡는다(w2i가 선형이라 델타 변환이 성립).
      {
        const _sp = _bldSpr['hut_s' + st], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 30, y); ctx.closePath();
      ctx.fillStyle = 'rgba(74,58,40,0.55)'; ctx.fill();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9a7a4a'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (st >= 2) { ctx.fillStyle = '#7a5a30'; for (const [px2, py2] of [[-18, 0], [0, -9], [18, 0], [0, 9], [-9, -4], [9, 4]]) ctx.fillRect(x + px2 - 1.5, y + py2 - 5, 3, 7); }
      if (st >= 3) { ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x, y - 12); ctx.lineTo(x + 18, y); ctx.stroke(); }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'hut') {
      // 완공 앵커 — 몸체(벽·바닥)는 기존 경로가 그림. 라벨만.
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e8d8b0'; ctx.textAlign = 'center';
      ctx.fillText('움집', x, y - 6);
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-02e ⑤] 조업 진척 게이지 — 노·숯가마 공용. 서버가 data.job{startedAt,until} 을 내려 준다.
    //   서버·클라가 **같은 식**을 쓴다(서버 _jobProgress 와 동일): (now−startedAt)/(until−startedAt).
    const _jobBar = (bld, cx, cy) => {
      const j = bld && bld.data && bld.data.job;
      if (!j || !j.until || !j.startedAt) return null;
      const now = Date.now();
      const p = Math.max(0, Math.min(1, (now - j.startedAt) / Math.max(1, j.until - j.startedAt)));
      const W = 34, H = 5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cx - W / 2, cy - 44, W, H);
      ctx.fillStyle = p >= 1 ? '#7cd97c' : '#ff9a3c';
      ctx.fillRect(cx - W / 2 + 1, cy - 43, (W - 2) * p, H - 2);
      return { p, remain: Math.max(0, Math.ceil((j.until - now) / 1000)) };
    };
    if (type === 'furnace_site' || type === 'furnace') {
      // ★노(爐) — 재민 확정(움집 동형 공정). 단계별 표현: 1=돌 기초, 2=노벽, 3=풀무, 완공=노+불.
      const st = (building?.data?.stage) | 0;
      const done = type === 'furnace';
      // ★[에셋] 움집터와 **같은 앵커 계약** — 발자국 2×2 북서 오버행 모서리에 붙인다.
      //   행 px(b.x,b.y)는 발자국 중심이라 (x0-0.5, y0-0.5)셀까지의 델타를 iso로 변환한다(w2i 선형).
      {
        const _sp = _bldSpr[done ? 'furnace' : ('furn_s' + st)], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          const _kko2 = (_d.kind) === 'bloomery' ? '괴련로' : '노(爐)';
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          const _jb = done ? _jobBar(building, x, y) : null;
          ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? `${_kko2} — 클릭=출탕` : `${_kko2} 조업 중 ${_jb.remain}초`) : `${_kko2} — 클릭=장입`)
                            : `${_kko2} 터 ${st}/3단계 (클릭=시공)`, x, y - 28);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(90,70,58,0.9)' : 'rgba(90,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#b09070'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 노벽(원통) 몸체
        ctx.fillStyle = done ? '#6a5040' : '#7a6a58';
        ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 13, y - 12, 26, 12);
        ctx.beginPath(); ctx.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (done) {   // 불꽃 + 연기 표식
        ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.ellipse(x, y - 13, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.ellipse(x, y - 13, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      const _kko = (building?.data?.kind) === 'bloomery' ? '괴련로' : '노(爐)';
      const _kn = (building?.data?.kind) === 'bloomery' ? 3 : 3;
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(done ? `${_kko} — 클릭=제련` : `${_kko} 터 ${st}/${_kn}단계 (클릭=시공)`, x, y - 26);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'kiln_site' || type === 'charcoal_kiln') {
      // ★숯가마 — 노와 같은 2×2 계약. 밀폐 봉토 둔덕 + 연도(굴뚝). 불꽃이 없다(공기를 막아 찌는 설비).
      const st = (building?.data?.stage) | 0;
      const done = type === 'charcoal_kiln';
      {
        const _sp = _bldSpr[done ? 'charcoal_kiln' : 'kiln_s1'], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
          { const _jb = done ? _jobBar(building, x, y) : null;
            ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                              : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 28); }
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(74,62,50,0.9)' : 'rgba(88,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#9a8464'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 봉토 둔덕(반구)
        ctx.fillStyle = done ? '#5b4a38' : '#6f6152';
        ctx.beginPath(); ctx.ellipse(x, y - 4, 15, 11, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 15, y - 4, 30, 4);
      }
      if (done) {   // 연도(굴뚝) + 연기
        ctx.fillStyle = '#4a3c30'; ctx.fillRect(x + 8, y - 20, 4, 10);
        ctx.fillStyle = 'rgba(200,200,200,0.5)';
        ctx.beginPath(); ctx.ellipse(x + 10, y - 24, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
      { const _jb = done ? _jobBar(building, x, y) : null;
        ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                          : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 26); }
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-03e 배치 12 ①] 마을 회관 — 터(단계)와 완공. 노·숯가마 렌더와 같은 결(2×2 앵커+라벨).
    if (type === 'village_site' || type === 'village_hall') {
      const done = type === 'village_hall';
      const st = (building?.data?.stage) | 0;
      // 굴립주(기둥 박아 세운 큰집) — 기둥 넷 + 이엉 지붕. 터는 지경석만.
      ctx.fillStyle = done ? '#6b5638' : '#57534a';
      for (const [dx, dy] of [[-14, -4], [14, -4], [-14, 8], [14, 8]]) { ctx.fillRect(x + dx - 2, y + dy - (done ? 20 : 4), 4, done ? 22 : 6); }
      if (done) {
        ctx.fillStyle = '#8a6f42';
        ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.lineTo(x + 22, y - 20); ctx.lineTo(x - 22, y - 20); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5c4a2c'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = done ? '#ffe9b0' : '#e6d6b6'; ctx.textAlign = 'center';
      ctx.fillText(done ? '마을 회관 — 클릭=재고' : `마을 회관 터 ${st}/3단계 (클릭=시공)`, x, y - (done ? 48 : 14));
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'guild_granary' || type === 'granary') {
      // ★고상곳간 앵커 — 몸체는 _granC 통짜 스프라이트(에셋 2차)가 대체: 표석 폐지, 라벨만(지붕 위)
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(type === 'guild_granary' ? '길드 곳간' : '곳간', x, y - 56);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'farmland') {
      // 갈색 흙 다이아 + 작물
      const data = building?.data || {};
      if (data.sim) {
        // §4-4 Stage 4A: 마을 시뮬 경작지(비영속 타일) — 논(무논=물빛)·밭(이랑) 정적 렌더.
        //   성장 게이지·'수확가능' 라벨 없음(마을 소유 — 플레이어 수확 대상 아님). 셀 꽉 채워 띠가 이어져 보임.
        const dry = !!data.dry;
        ctx.beginPath();
        ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y); ctx.closePath();
        ctx.fillStyle = dry ? '#7c6034' : '#3f5c46'; ctx.fill();
        ctx.strokeStyle = dry ? '#5e4724' : '#324a38'; ctx.lineWidth = 0.6; ctx.stroke();
        if (dry) {
          // 밭이랑 2줄
          ctx.strokeStyle = 'rgba(94,71,36,0.9)'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
          ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 12, y + 2);
          ctx.stroke();
        } else {
          // 무논 물 반사 + 모 3포기
          ctx.fillStyle = 'rgba(130,190,170,0.35)';
          ctx.beginPath();
          ctx.moveTo(x, y - 5); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 10, y); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#69a05a'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (const [oxp, oyp] of [[-6, 0], [0, -2], [6, 1]]) {
            ctx.moveTo(x + oxp, y + oyp); ctx.lineTo(x + oxp, y + oyp - 5);
          }
          ctx.stroke();
        }
        return;
      }
      const readyAt = data.readyAt || 0;
      const now = Date.now();
      const isReady = now >= readyAt;
      const growProgress = readyAt > data.plantedAt ? Math.min(1, (now - data.plantedAt) / (readyAt - data.plantedAt)) : 1;
      // 에셋 5차: 4단계 3D 스프라이트(갈은 흙/어린싹/자람/익음). 미로드 시 아래 벡터 렌더 폴백.
      {
        const _st = isReady ? 3 : Math.min(2, Math.floor(growProgress * 3));
        const _cs = cropSprite(_st, building ? building.x : x, building ? building.y : y);
        if (_cs) {
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(_cs, x - 24, y - 30, 48, 48);
          if (isReady) {
            ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#9adb6e'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
            ctx.strokeText('수확가능', x, y - 20); ctx.fillText('수확가능', x, y - 20);
            ctx.textAlign = 'start';
          }
          return;
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 흙
      ctx.beginPath();
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 14, y + 2);
      ctx.lineTo(x, y + 8); ctx.lineTo(x - 14, y + 2); ctx.closePath();
      ctx.fillStyle = '#5a3a20'; ctx.fill();
      ctx.strokeStyle = '#3a2810'; ctx.lineWidth = 1; ctx.stroke();
      // 작물 — growProgress에 따라 크기 다름
      const cropH = 3 + 8 * growProgress;
      ctx.fillStyle = isReady ? '#2a8a4a' : '#5aa050';
      for (const [ox, oy] of [[-6, -2], [0, -3], [6, -1]]) {
        ctx.fillRect(x + ox - 1, y + oy - cropH/2, 2, cropH);
      }
      if (isReady) {
        // 빨간 베리 (수확 가능 표시)
        ctx.fillStyle = '#c83a3a';
        for (const [ox, oy] of [[-6, -8], [0, -10], [6, -8]]) {
          ctx.beginPath(); ctx.arc(x + ox, y + oy, 2, 0, Math.PI*2); ctx.fill();
        }
        // "READY" 라벨
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#9adb6e';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
        ctx.strokeText('수확가능', x, y - 16);
        ctx.fillText('수확가능', x, y - 16);
        ctx.textAlign = 'start';
      }
      return;
    }
    if (type === 'wall') {
      const H = WALL_HEIGHT;
      const side = building?.data?.side || 'N';
      const damaged = !!building?.data?.damaged; // Phase 14.33
      ctx.strokeStyle = damaged ? '#5a2a2a' : '#3a3a3a';
      ctx.lineWidth = 0.5;
      if (damaged) ctx.globalAlpha = 0.45; // 부서진 wall은 반투명
      if (side === 'N') {
        // cell N edge: 좌상 (x-16, y-8) → 우하 (x+16, y+8). 바닥선.
        // 윗면(z=H): 좌상 (x-16, y-8-H) → 우하 (x+16, y+8-H).
        // 측면(앞쪽 보이는 면) = bottom 사선과 top 사선 잇는 직사각형.
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8);       // 바닥 TL = cell TL
        ctx.lineTo(x + 16, y + 8);       // 바닥 TR = cell TR
        ctx.lineTo(x + 16, y + 8 - H);   // 윗면 TR
        ctx.lineTo(x - 16, y - 8 - H);   // 윗면 TL
        ctx.closePath();
        if (_wallNC && !damaged) {   // ★통나무 텍스처(생성 에셋) — 전 벽 유닛 공용 스킨(전단 변환으로 평행사변형에 정합)
          ctx.save(); ctx.clip(); ctx.translate(x - 16, y - 8); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.drawImage(_wallNC, 0, -H); ctx.restore(); ctx.stroke();
        } else { ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); } // 나무색(폴백/파손)
        // 윗면 (cell edge 위 H px) — 얇은 평행사변형으로 입체감
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8 - H);
        ctx.lineTo(x + 16, y + 8 - H);
        ctx.lineTo(x + 14, y + 6 - H);
        ctx.lineTo(x - 18, y - 10 - H);
        ctx.closePath();
        ctx.fillStyle = '#b8a075'; ctx.fill(); ctx.stroke();
      } else { // E
        // cell E edge: 우상 (x+16, y-8) → 우하 (x-16, y+8). 바닥선.
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8);       // 바닥 TR = cell TR
        ctx.lineTo(x - 16, y + 8);       // 바닥 BR = cell BR
        ctx.lineTo(x - 16, y + 8 - H);   // 윗면 BR
        ctx.lineTo(x + 16, y - 8 - H);   // 윗면 TR
        ctx.closePath();
        if (_wallEC && !damaged) {   // ★통나무 텍스처 — 그늘면
          ctx.save(); ctx.clip(); ctx.translate(x - 16, y + 8); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.drawImage(_wallEC, 0, -H); ctx.restore(); ctx.stroke();
        } else { ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); }
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8 - H);
        ctx.lineTo(x - 16, y + 8 - H);
        ctx.lineTo(x - 18, y + 6 - H);
        ctx.lineTo(x + 14, y - 10 - H);
        ctx.closePath();
        ctx.fillStyle = '#b8a075'; ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1; // Phase 14.33: damaged wall 반투명 복원
    } else if (type === 'floor') {
      // ★움집 실내(컷어웨이로만 도달 — 밖에선 지붕 스킨이 억제): 다짐흙 바닥 + 정본 가구.
      //   침대 6 = BEDO 앵커 상대 [[-4,-4],[-3,-4],[-2,-4],[-1,-4],[-4,-3],[-1,-3]](랩 정본 — 1인 1침대 고증, HOME_SLOTS와 같은 사상)
      //   화덕 = (-2,-3)(수혈주거 중앙 노지 고증). 앵커: 건물=[cx-5..cx+0]×[cy-5..cy-2] → cx=x1·cy=y1+2.
      //   시각 전용(durango-consistency: 물리 실체 침대→리스폰·NPC 취침 연동은 생활 층 이관 묶음).
      if (building?.data?.hut && _tileHutC) {
        const _h = building.data.hut;
        ctx.drawImage(_tileHutC, x - 32, y - 16);
        const _dx = Math.floor(building.x / 32) - _h[2], _dy = Math.floor(building.y / 32) - (_h[3] + 2);
        const _bed = (_dy === -4 && _dx >= -4 && _dx <= -1) || (_dy === -3 && (_dx === -4 || _dx === -1));
        if (_bed) {
          ctx.beginPath();   // 거적 침상(납작 매트)
          ctx.moveTo(x, y - 9); ctx.lineTo(x + 20, y + 1); ctx.lineTo(x, y + 11); ctx.lineTo(x - 20, y + 1); ctx.closePath();
          ctx.fillStyle = '#c8a95e'; ctx.fill();
          ctx.strokeStyle = '#8a713c'; ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = 'rgba(138,113,60,0.7)'; ctx.beginPath();   // 짚결
          ctx.moveTo(x - 12, y - 1); ctx.lineTo(x + 8, y + 7); ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 12, y + 5); ctx.stroke();
          ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 12, y - 8, 10, 5);   // 목침(북측)
        } else if (_dx === -2 && _dy === -3) {
          const _g = ctx.createRadialGradient(x, y, 2, x, y, 26);   // 화덕 — 은은한 잉걸빛
          _g.addColorStop(0, 'rgba(255,150,60,0.35)'); _g.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = _g; ctx.beginPath(); ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2e2620'; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6e675e';
          for (let _a = 0; _a < 6; _a++) { const _t = _a / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(_t) * 13, y + Math.sin(_t) * 6.5, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = '#ff9a4a'; ctx.fillRect(x - 2, y - 2, 4, 3);
          ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 1, y - 1, 2, 1);
        }
        return;
      }
      // 14.49-e7e: 바닥 — 셀 꽉 채우는 isometric 다이아 (TS=32 ground tile과 동일 크기).
      // 14.49-e7ak DEBUG: floor 별 색 (1층 기본, 2층 주황, 3층 빨강)
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 32, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 32, y);
      ctx.closePath();
      const fl = building?.floor ?? building?.data?.floor ?? 0;
      let fillCol = '#8a6a4a';   // 1층 (floor=0) 기본
      if (fl === 1) fillCol = '#ff8a3c';     // 2층 — 주황
      else if (fl === 2) fillCol = '#e63a3a'; // 3층 — 빨강
      ctx.fillStyle = fillCol; ctx.fill();
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 0.5; ctx.stroke();
    } else if (type === 'door') {
      // 14.50: 문 — wall과 비슷한 sprite, 색 다름. open이면 반투명 + 짧게.
      const H = WALL_HEIGHT;
      const side = building?.data?.side || 'N';
      const open = !!building?.data?.open;
      const drawH = open ? H * 0.25 : H; // 열림: 1/4 높이
      const col = open ? 'rgba(140, 100, 60, 0.4)' : '#6a4a2a'; // 닫힘: 진한 갈색, 열림: 반투명
      ctx.strokeStyle = open ? 'rgba(60,40,20,0.5)' : '#3a2010';
      ctx.lineWidth = 0.6;
      ctx.fillStyle = col;
      if (side === 'N') {
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8);
        ctx.lineTo(x + 16, y + 8);
        ctx.lineTo(x + 16, y + 8 - drawH);
        ctx.lineTo(x - 16, y - 8 - drawH);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8);
        ctx.lineTo(x - 16, y + 8);
        ctx.lineTo(x - 16, y + 8 - drawH);
        ctx.lineTo(x + 16, y - 8 - drawH);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // 닫힘 시 손잡이 점
      if (!open) {
        ctx.fillStyle = '#f0c674';
        ctx.beginPath();
        if (side === 'N') ctx.arc(x + 8, y - H/2, 1.5, 0, Math.PI * 2);
        else              ctx.arc(x - 8, y - H/2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'chest') {
      // Phase 4d-2: 거래소 chest 식별 (canadia zone)
      const isExchange = building?.data?.isExchange === true;
      const village = building?.data?.village || null;
      // 색상 — 거래소면 금색/주황, 일반은 나무색
      const topCol = isExchange ? '#e8b85e' : '#a87246';
      const rightCol = isExchange ? '#b88838' : '#7c5232';
      const leftCol = isExchange ? '#d09a48' : '#946040';
      const edgeCol = isExchange ? '#6b4a18' : '#5a3a1c';
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 윗면
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 14, y - 4);
      ctx.lineTo(x, y + 4); ctx.lineTo(x - 14, y - 4); ctx.closePath();
      ctx.fillStyle = topCol; ctx.fill();
      ctx.strokeStyle = edgeCol; ctx.lineWidth = 1; ctx.stroke();
      // 우측면
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = rightCol; ctx.fill(); ctx.stroke();
      // 좌측면
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 4); ctx.lineTo(x - 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = leftCol; ctx.fill(); ctx.stroke();
      // 자물쇠 / 거래소 별표
      if (isExchange) {
        ctx.fillStyle = '#fff8d0';
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
        ctx.strokeText('★', x, y + 1);
        ctx.fillText('★', x, y + 1);
        ctx.textAlign = 'start';
      } else {
        ctx.fillStyle = '#f0c674';
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      // 거래소 라벨 — 마을 이름 floating
      if (isExchange && village) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        // 배경 박스
        const txt = `🏪 ${village}`;
        const w = ctx.measureText(txt).width + 8;
        ctx.fillStyle = 'rgba(40,30,15,0.85)';
        ctx.fillRect(x - w/2, y - 32, w, 16);
        ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1;
        ctx.strokeRect(x - w/2, y - 32, w, 16);
        // 텍스트
        ctx.fillStyle = '#ffe8a0';
        ctx.fillText(txt, x, y - 20);
        ctx.textAlign = 'start';
      }
    } else if (type === 'fence') {
      // 14.50: 울타리 — cell 전체 차지, 절반 높이, orientation (EW/NS)로 막대 방향만 다름
      const fH = WALL_HEIGHT * 0.5;
      const half = CL_BUILDING_SIZE / 2; // 16
      const ori = building?.data?.orientation || 'NS';
      // 4 모서리 (top 평면)
      const tl = { x: x + (-half - (-half)), y: y + ((-half) + (-half)) * 0.5 - fH };
      const tr = { x: x + (half - (-half)), y: y + (half + (-half)) * 0.5 - fH };
      const br = { x: x + (half - half), y: y + (half + half) * 0.5 - fH };
      const bl = { x: x + (-half - half), y: y + (-half + half) * 0.5 - fH };
      // 4 모서리 (bottom 평면) — z=0
      const tlB = { x: tl.x, y: tl.y + fH };
      const trB = { x: tr.x, y: tr.y + fH };
      const brB = { x: br.x, y: br.y + fH };
      const blB = { x: bl.x, y: bl.y + fH };
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.fill();
      // 측면 (오른쪽 두 면) — fill
      ctx.fillStyle = '#6a4828';
      ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(brB.x, brB.y); ctx.lineTo(trB.x, trB.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3e22';
      ctx.beginPath(); ctx.moveTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y); ctx.lineTo(brB.x, brB.y); ctx.closePath(); ctx.fill();
      // 상단 평면
      ctx.fillStyle = '#7c5a32';
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.fill();
      // orientation 표시 — 막대 라인 (EW: 동서로 가로지름, NS: 남북으로)
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.5;
      if (ori === 'EW') {
        // 동(우)서(좌) — iso상 가로축 = 화면상 (dx=±1, dy=0) → 화면 x ±32
        ctx.beginPath();
        const ax = x - 16, bx = x + 16;
        ctx.moveTo(ax, y - fH); ctx.lineTo(bx, y - fH); ctx.stroke();
      } else {
        // 남북 — iso (dx=0, dy=±1) → 화면 (0, ±16)
        ctx.beginPath();
        const ay = y - fH - 16, by = y - fH + 16;
        ctx.moveTo(x, ay); ctx.lineTo(x, by); ctx.stroke();
      }
      // 윤곽
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.stroke();
    } else if (type === 'stair') {
      // === PZ식 3-cell 24-subStep 계단 (14.49-e2) ===
      // anchor (this draw 좌표 x, y) = cell 0 (낮은 발판) 중심. dir 방향으로 cell 1, 2 추가.
      // 총 24 sub-step (각 cell당 8 sub-step), z = subStep * (FLOOR_HEIGHT/24) (0~64).
      // 시각: 24개 평평한 step tread + 사이 vertical riser. 진짜 미세 계단 모양.
      const H = FLOOR_HEIGHT; // 64
      const dir = building?.data?.dir || 'N';
      // dir별 단위벡터 (world 좌표계)
      const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
      // dir 수직 (perpendicular) 단위벡터 — 어느 쪽이든 한 방향으로 잡음
      const pv = { x: -dv.y, y: dv.x };
      // world offset (픽셀, cell 0 anchor 기준) → 스크린 offset
      function worldOffToScreen(wx, wy, wz) {
        return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
      }
      // 그림자 (3 cell 전체 길이)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      const midC = { wx: dv.x * 32, wy: dv.y * 32 }; // cell 1 중심
      const midS = worldOffToScreen(midC.wx, midC.wy, 0);
      ctx.ellipse(x + midS.x, y + midS.y + 4, 36, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // 6 sub-step 그리기. 각 sub-step:
      //   - 시작 wx,wy = anchor 중심 + dv * (subStep - 2.5) * 16 (subStep 0 = -2.5×16 = -40, ...)
      //     wait — anchor center가 cell 0 중심임. cell 0 안 sub-step 0의 중심 = anchor - dv*8 (반쪽 뒤로)
      //     subStep S의 중심 (world): anchor + dv * (S - 2.5) * 16
      //     이러면 S=0: anchor - 40, S=5: anchor + 40. cell 0 (S=0,1) = -40~-8, cell 1 (S=2,3) = 8~40, cell 2 (S=4,5) = 56~88...
      //     아니다. cell 0 중심 = anchor, cell 1 중심 = anchor + dv*32, cell 2 중심 = anchor + dv*64.
      //     subStep 0 (cell 0 low half) 중심 = anchor + dv * (-8) = anchor - dv*8
      //     subStep 1 (cell 0 high half) 중심 = anchor + dv * 8
      //     subStep 2 (cell 1 low half) 중심 = anchor + dv * 24
      //     subStep 3 (cell 1 high half) 중심 = anchor + dv * 40
      //     subStep 4 (cell 2 low half) 중심 = anchor + dv * 56
      //     subStep 5 (cell 2 high half) 중심 = anchor + dv * 72
      // 각 슬랩 두께: dv 방향 16, perpendicular 32.
      // 각 sub-step 슬랩 — cell 0 (S=0~7), cell 1 (S=8~15), cell 2 (S=16~23). 총 24개.
      // cell N 중심 = anchor + dv * N * 32. cell 안에서 sub-step S_in_cell (0~7) 중심 = cell_center + dv * ((S_in_cell - 3.5) * 4)
      // (각 sub-step 너비 = 32/8 = 4 px along dir)
      const SUB_PER_CELL = 8;
      const SUB_TOTAL = 24;
      const SUB_WIDTH = CL_BUILDING_SIZE / SUB_PER_CELL; // = 4 px
      for (let S = 0; S < SUB_TOTAL; S++) {
        const cellN = Math.floor(S / SUB_PER_CELL);
        const subInCell = S % SUB_PER_CELL;
        const w = cellN * CL_BUILDING_SIZE + (subInCell - 3.5) * SUB_WIDTH;
        const z = (S / (SUB_TOTAL - 1)) * H; // 0 ~ H
        const halfDV = SUB_WIDTH / 2;
        const halfPV = CL_BUILDING_SIZE / 2;
        function corner(dvSign, pvSign) {
          const wx = dv.x * (w + halfDV * dvSign) + pv.x * halfPV * pvSign;
          const wy = dv.y * (w + halfDV * dvSign) + pv.y * halfPV * pvSign;
          const sc = worldOffToScreen(wx, wy, z);
          return { x: x + sc.x, y: y + sc.y };
        }
        const c1 = corner(-1, -1);
        const c2 = corner( 1, -1);
        const c3 = corner( 1,  1);
        const c4 = corner(-1,  1);
        // riser — 이전 sub-step과 z 차이만큼
        const prevZ = S === 0 ? 0 : ((S - 1) / (SUB_TOTAL - 1)) * H;
        if (z > prevZ) {
          const c1d = { x: c1.x, y: c1.y + (z - prevZ) };
          const c4d = { x: c4.x, y: c4.y + (z - prevZ) };
          ctx.fillStyle = '#4a2a14';
          ctx.strokeStyle = '#2a1808';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
          ctx.lineTo(c4d.x, c4d.y); ctx.lineTo(c1d.x, c1d.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // tread
        ctx.fillStyle = '#b08858';
        ctx.strokeStyle = '#5a3818';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // ↑ 화살표 (가장 높은 sub-step 위)
      const topZ = H;
      const tcell = 2, tsub = 7;
      const tw = tcell * CL_BUILDING_SIZE + (tsub - 3.5) * SUB_WIDTH;
      const topS = worldOffToScreen(dv.x * tw, dv.y * tw, topZ);
      ctx.fillStyle = '#cdd6e3';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + topS.x, y + topS.y - 8);
      ctx.lineTo(x + topS.x - 5, y + topS.y - 2);
      ctx.lineTo(x + topS.x + 5, y + topS.y - 2);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      return; // 끝 — 옛 사선 ramp 그림 코드 skip
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 측면 W 삼각형 (그림자 톤)
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 1;
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.moveTo(sb.x, sb.y); ctx.lineTo(wb.x, wb.y); ctx.lineTo(wT.x, wT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 측면 E 삼각형 (햇빛 톤)
      ctx.fillStyle = '#9a7a4a';
      ctx.beginPath();
      ctx.moveTo(sb.x, sb.y); ctx.lineTo(eb.x, eb.y); ctx.lineTo(eT.x, eT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 뒷면 NW + NE (가장 어둠)
      ctx.fillStyle = '#5a3a1c';
      ctx.beginPath();
      ctx.moveTo(wb.x, wb.y); ctx.lineTo(nb.x, nb.y); ctx.lineTo(nT.x, nT.y); ctx.lineTo(wT.x, wT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nb.x, nb.y); ctx.lineTo(eb.x, eb.y); ctx.lineTo(eT.x, eT.y); ctx.lineTo(nT.x, nT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 사선 top — 걸어가는 면
      ctx.fillStyle = '#b08858';
      ctx.beginPath();
      ctx.moveTo(sT.x, sT.y); ctx.lineTo(wT.x, wT.y); ctx.lineTo(nT.x, nT.y); ctx.lineTo(eT.x, eT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // step 선 5개 — S→N 방향으로 등간격, 좌우 ramp 가장자리에 닿음
      ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 1.2;
      for (let i = 1; i <= 5; i++) {
        const f = i / 6;
        let l, r;
        if (f < 0.5) {
          const t = f * 2;
          l = { x: sT.x + (wT.x - sT.x) * t, y: sT.y + (wT.y - sT.y) * t };
          r = { x: sT.x + (eT.x - sT.x) * t, y: sT.y + (eT.y - sT.y) * t };
        } else {
          const t = (f - 0.5) * 2;
          l = { x: wT.x + (nT.x - wT.x) * t, y: wT.y + (nT.y - wT.y) * t };
          r = { x: eT.x + (nT.x - eT.x) * t, y: eT.y + (nT.y - eT.y) * t };
        }
        ctx.beginPath();
        ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }
      // 위 방향 화살표 (계단 정상)
      ctx.fillStyle = '#cdd6e3';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      const aX = nT.x, aY = nT.y - 4;
      ctx.beginPath();
      ctx.moveTo(aX, aY - 5); ctx.lineTo(aX - 5, aY + 2); ctx.lineTo(aX + 5, aY + 2);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      // 14.49-e7b: 라벨 제거 (자동 계단이라 키 안내 불필요)
    } else if (type === 'workbench') {
      // ★★[시설 제작창 2026-08-29] **작업대** — 널판 상판 + 다리 넷 + 얹힌 돌.
      //   ⚠**발판 도형이다**(회부: 시설 신규 스프라이트). 자연물·건물 정본 에셋으로 교체 예정.
      //   지금 벡터로 그리는 이유: 스프라이트를 새로 그리는 건 이 배치의 일이 아니고,
      //   그렇다고 안 그리면 **"데이터는 있는데 세계엔 없는"** 시설이 된다(족보 67 과 같은 함정).
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3520';
      ctx.fillRect(x - 13, y - 2, 3, 8); ctx.fillRect(x + 10, y - 2, 3, 8);      // 다리
      ctx.fillStyle = '#7a5a33';                                                  // 상판(널판)
      ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 18, y - 3); ctx.lineTo(x, y + 6); ctx.lineTo(x - 18, y - 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a4123'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 7.5); ctx.lineTo(x + 9, y + 1.5); ctx.stroke();
      ctx.fillStyle = '#8d8d8d';                                                  // 얹힌 숫돌
      ctx.beginPath(); ctx.ellipse(x + 3, y - 6, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'drying_rack') {
      // ★★[부패·보존 배치 2026-08-31] **건조대** — 장대 둘 + 가로대 + 걸린 것들.
      //   ⚠작업대와 같은 규약의 **발판 도형**이다(회부: 시설 신규 스프라이트).
      //   안 그리면 "데이터는 있는데 세계엔 없는" 시설이 된다(족보 67) — 그 함정을 다시 밟지 않는다.
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4f2a';                                                   // 장대 둘
      ctx.fillRect(x - 14, y - 20, 3, 26);
      ctx.fillRect(x + 11, y - 20, 3, 26);
      ctx.fillStyle = '#8a6a3c';                                                   // 가로대
      ctx.fillRect(x - 15, y - 21, 30, 3);
      ctx.strokeStyle = '#9d8a5f'; ctx.lineWidth = 1;                              // 풀 끈
      ctx.beginPath(); ctx.moveTo(x - 14, y - 17); ctx.lineTo(x - 10, y - 21); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 14, y - 17); ctx.lineTo(x + 10, y - 21); ctx.stroke();
      // 걸린 것 셋 — 마르는 중인 물건(바람에 아주 조금 흔들린다)
      const _sw = Math.sin(performance.now() * 0.0016) * 0.9;
      for (let i = -1; i <= 1; i++) {
        const hx = x + i * 9 + _sw * (i === 0 ? 0.6 : 1);
        ctx.strokeStyle = '#7d6b48'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + i * 9, y - 18); ctx.lineTo(hx, y - 13); ctx.stroke();
        ctx.fillStyle = i === 0 ? '#c9a97a' : '#b9976a';
        ctx.beginPath(); ctx.ellipse(hx, y - 8, 3.2, 5.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,70,40,0.7)';
        ctx.beginPath(); ctx.moveTo(hx, y - 12.5); ctx.lineTo(hx, y - 3.5); ctx.stroke();
      }
    } else if (type === 'campfire') {
      // 모닥불 — 통나무 + 흔들리는 불꽃
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 통나무 받침
      ctx.fillStyle = '#5a3a1c';
      ctx.fillRect(x - 10, y - 1, 20, 4);
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(x - 8, y + 3, 16, 2);
      // 불꽃 (시간 기반 흔들림)
      const tt = performance.now() * 0.008;
      const flicker = Math.sin(tt) * 1.5;
      ctx.fillStyle = '#ff6a2a';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 1);
      ctx.quadraticCurveTo(x - 3 + flicker, y - 12, x, y - 16);
      ctx.quadraticCurveTo(x + 4 + flicker, y - 11, x + 5, y - 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffce4a';
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 2);
      ctx.quadraticCurveTo(x + flicker, y - 9, x + 1, y - 13);
      ctx.quadraticCurveTo(x + 3 + flicker, y - 8, x + 3, y - 2);
      ctx.closePath(); ctx.fill();
    } else if (type === 'siege_camp') {
      // Phase 14.5 — 공성 캠프: 텐트(삼각 천막)
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 텐트 본체 (삼각)
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x - 16, y + 4);
      ctx.closePath();
      ctx.fillStyle = '#7a5a3a'; ctx.fill();
      ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 1; ctx.stroke();
      // 입구 (어두운 사다리꼴)
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.lineTo(x + 2, y - 8);
      ctx.lineTo(x - 2, y - 8);
      ctx.closePath();
      ctx.fillStyle = '#2a1a0a'; ctx.fill();
      // 깃발 — 상단
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 28); ctx.stroke();
      ctx.fillStyle = '#c83a3a';
      ctx.beginPath();
      ctx.moveTo(x, y - 28); ctx.lineTo(x + 7, y - 25); ctx.lineTo(x, y - 22); ctx.closePath();
      ctx.fill();
      // 만료까지 남은 시간 (작은 게이지)
      const exp = building?.data?.expiresAt;
      if (exp) {
        const remain = Math.max(0, exp - Date.now());
        const pct = Math.min(1, remain / (10 * 60 * 1000));
        ctx.fillStyle = '#222'; ctx.fillRect(x - 12, y + 8, 24, 2);
        ctx.fillStyle = pct > 0.3 ? '#9adb6e' : '#c83a3a'; ctx.fillRect(x - 12, y + 8, 24 * pct, 2);
      }
    }
  }
