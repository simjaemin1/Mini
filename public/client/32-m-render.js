// @@split:32-m-render — M — 건축 배치 판정·고스트·진행바 (T51 2차 분할 ① · 파일명은 분할 전 슬롯 이름 그대로)
  // ★[T1423 ⓐ] 못 놓는 칸(절대 칸) — 서버 `_t1423NoBuild` 와 같은 답: 다리 칸(`isBridgeAtAbs` — 걸음 예측 미러) · 물(`isWaterAtAbs` — 같은 미러) · 다리 머리(서버가 준 ㉮ 칸 줄)
  function _t1423NoAt(ax, ay) {
    if (!_t1423NoAbs.on) return false;
    const wx = ax * 32 + 16, wy = ay * 32 + 16;
    return isBridgeAtAbs(wx, wy) || isWaterAtAbs(wx, wy) || _t1423NoAbs.has(ax + ',' + ay);
  }
  // 14.54-d: 배치 사전 체크 — 빨간 ghost 표시용
  function isPlacementBlocked(itemType, cx, cy, dir) {
    const floorN = myFloor || 0;
    if (_t1423NoAbs.on) {   // ★[T1423 ⓐ] 칸 건물 = 그 칸 · 벽 · 문 = 변을 낀 두 칸(서버 `_tryBuildAt` 그 자리)
      if (itemType === 'item_wall' || itemType === 'item_door') {
        const ux = dir === 'W' ? cx - 1 : cx, uy = dir === 'S' ? cy + 1 : cy, side = (dir === 'E' || dir === 'W') ? 'E' : 'N';
        if (_t1423NoAt(ux, uy) || (side === 'N' ? _t1423NoAt(ux, uy - 1) : _t1423NoAt(ux + 1, uy))) return true;
      } else if (_t1423NoAt(cx, cy)) return true;
    }
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
  // ★★[T1392 · ★재민 11-19 "첫 땅은 무조건 3x3 단위로만"] 첫 집터 아홉 칸 미리보기 — C 를 누르기 전 선 자리를 가운데로 한 3×3 테두리(막힌 칸은 붉게).
//   판정은 서버 한 벌(`lot_probe` → `lot_preview` · `_t1392Check` — 남의 땅 · 물 · 바위 · 마을 시설 · 건물 · 영토 문)이다 — 클라는 칸을 옮길 때 묻고 받은 대로 그린다(재계산 0).
//   켬(welcome `uiCfg.firstLot`)이고 내 살아 있는 개인 칸이 0 일 때만(첫 등록) — 끔 = 이 함수가 곧바로 돌아간다(그림 · 메시지 0).
  let lotPreview = null, _lotProbeKey = '', _lotProbeAt = 0;
  function lotPreviewWho() { return (typeof myPlayerId !== 'undefined' && myPlayerId) || (typeof myUsername !== 'undefined' && myUsername) || null; }
  function lotPreviewWant() {
    if (!(typeof uiCfg !== 'undefined' && uiCfg && uiCfg.firstLot)) return false;
    const who = lotPreviewWho(); if (!who) return false;
    for (const c of conns.values()) for (const cl of (c.claims ? c.claims.values() : [])) if (cl && cl.ownerPid === who && cl.kind === 'personal' && (cl.state || 'active') !== 'free') return false;
    return true;
  }
  function lotPreviewOnMsg(msg, c) {
    if (!msg || !msg.first) { lotPreview = null; return; }
    const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
    lotPreview = { x0: msg.cx * 32 + ox, y0: msg.cy * 32 + oy, side: msg.side | 0 || 3, cells: msg.cells || [], gate: msg.gate || null, cost: msg.cost || null,
      key: Math.floor((msg.cx * 32 + ox) / 32) + ',' + Math.floor((msg.cy * 32 + oy) / 32) };
  }
  function drawLotPreview() {
    if (!lotPreviewWant()) { lotPreview = null; _lotProbeKey = ''; return; }
    if (typeof myAbsPredicted === 'undefined' || !myAbsPredicted) return;
    const k = Math.floor(myAbsPredicted.x / 32) + ',' + Math.floor(myAbsPredicted.y / 32), now = Date.now();   // [T1310 클라 시계] 미리보기 다시 묻기 간격(클라만의 간격 · 서버 시각과 안 견준다)
    if (k !== _lotProbeKey || (now - _lotProbeAt > 1000 && (!lotPreview || lotPreview.key !== k))) { _lotProbeKey = k; _lotProbeAt = now; sendPrimary({ type: 'lot_probe' }); }
    const L = lotPreview; if (!L || L.key !== k) return;
    const h = (L.side - 1) / 2, cx0 = Math.floor(L.x0 / 32), cy0 = Math.floor(L.y0 / 32);
    const myIso0 = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const pt = (cx2, cy2) => { const i = w2i(cx2 * 32, cy2 * 32); return { x: i.x - myIso0.x + W / 2, y: i.y - myIso0.y + H / 2 - (myFloor || 0) * FLOOR_HEIGHT }; };
    const bad = new Map(); for (const [dx, dy, why] of L.cells) bad.set(dx + ',' + dy, why);
    ctx.save();
    for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) {
      const x = cx0 + dx, y = cy0 + dy, a = pt(x, y), b = pt(x + 1, y), c2 = pt(x + 1, y + 1), d = pt(x, y + 1), blk = bad.has(dx + ',' + dy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = blk ? 'rgba(220,70,60,0.30)' : (L.gate ? 'rgba(220,150,60,0.12)' : 'rgba(240,198,116,0.10)'); ctx.fill();
      if (blk) { ctx.strokeStyle = 'rgba(230,90,80,0.95)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const p1 = pt(cx0 - h, cy0 - h), p2 = pt(cx0 + h + 1, cy0 - h), p3 = pt(cx0 + h + 1, cy0 + h + 1), p4 = pt(cx0 - h, cy0 + h + 1);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = (bad.size || L.gate) ? '#e0705f' : '#f0c674'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
    ctx.fillText(bad.size ? `집터 3×3 — 막힌 칸 ${bad.size}` : (L.gate ? '집터 3×3 — 영토 안' : `집터 3×3${L.cost ? ` — 나무 ${L.cost.wood} · 돌 ${L.cost.stone}` : ''}`), (p1.x + p3.x) / 2, p1.y - 8);
    ctx.textAlign = 'left';
    ctx.restore();
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
      const smallHut = hut && placementMode.kind === 'small';   // ★[T1392] 간이 움집 3×3 — 커서 칸이 가운데(서버 `_t1392HutStart` 와 같은 자리)
      let fx0 = furn ? ccx : (psite ? ccx - 5 : (hut ? ccx - 3 : ccx - 2)), fy0 = furn ? ccy : (psite ? ccy - 5 : (hut ? ccy - 2 : ccy - 1));
      let fx1 = furn ? ccx + 1 : (psite ? ccx + 0 : (hut ? ccx + 2 : ccx + 2)), fy1 = furn ? ccy + 1 : (psite ? ccy - 2 : (hut ? ccy + 1 : ccy + 1));   // ★노 2×2 = 서버 tryFurnaceStart 규약 동형
      if (smallHut) { fx0 = ccx - 1; fy0 = ccy - 1; fx1 = ccx + 1; fy1 = ccy + 1; }
      const myIso0 = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const pt = (cx2, cy2) => { const i = w2i(cx2 * 32, cy2 * 32); return { x: i.x - myIso0.x + W / 2, y: i.y - myIso0.y + H / 2 - (myFloor || 0) * FLOOR_HEIGHT }; };
      const p1 = pt(fx0, fy0), p2 = pt(fx1 + 1, fy0), p3 = pt(fx1 + 1, fy1 + 1), p4 = pt(fx0, fy1 + 1);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath();
      let _t1423B = false; if (_t1423NoAbs.on) for (let y = fy0; y <= fy1 && !_t1423B; y++) for (let x = fx0; x <= fx1; x++) if (_t1423NoAt(x, y)) { _t1423B = true; break; }   // ★[T1423 ⓐ] 발자국에 물 · 다리 · 다리 머리 — 붉게(서버가 거절하는 그 칸)
      ctx.fillStyle = _t1423B ? 'rgba(220,80,80,0.35)' : (hut ? 'rgba(154,122,74,0.25)' : 'rgba(165,129,63,0.25)'); ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = hut ? '#c9b28a' : '#e0b060'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(kiln ? '숯가마 2×2 — 사유지 안' : (furn ? `${placementMode.kind === 'bloomery' ? '괴련로' : '노(爐)'} 2×2 — 사유지 안` : (psite ? '마을에 집 의뢰 6×4 (재료 선납)' : (hut ? (smallHut ? '간이 움집터 3×3 (내 집터 위)' : '움집터 6×4 (수혈 굴착)') : '마을 곳간 5×3 (밀폐)'))), (p1.x + p3.x) / 2, p1.y - 8);
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
    const t = (Date.now() % 1000) / 1000;  // [T1310 클라 시계] 그림 깜빡임 주기
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
    ctx.fillText(`${itemKo(it)} (${dir}) · 휠=회전 · 좌클릭=배치`, sx, sy - 60);   // ★[T55]
    ctx.restore();
  }
  // 14.51: 3초 progress bar (DOM overlay)
  function ensureBuildProgressEl() {
    let el = document.getElementById('buildProgress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'buildProgress';
      el.style.cssText = 'position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);background:rgba(var(--pane-rgb), 0.92);color:var(--fg-strong);padding:10px 20px;border-radius: 0;border:2px solid var(--accent);z-index:9999;display:none;font-size:14px;pointer-events:none;text-align:center;box-shadow:0 4px 12px rgba(var(--bg-rgb), 0.4)';
      el.innerHTML = '<div class="bp-text" style="margin-bottom:6px;font-weight:bold">작업 중...</div><div style="width:240px;height:10px;background:var(--inset);border-radius: 0;overflow:hidden"><div class="bp-fill" style="height:100%;background:var(--accent-hi);width:0%"></div></div>';
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
    el.querySelector('.bp-text').textContent = buildAction.kind === 'place' ? '놓는 중… (움직이면 그만둠)' : '허무는 중… (움직이면 그만둠)';
  }

