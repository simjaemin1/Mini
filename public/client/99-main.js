// @@split:99-main — 최상위 실행문 — 뒤 참조 26개(원문 순서)
// @@moved-begin:199
  window.__moveDbg = () => ({
    model: _moveParams.model, vx: myVel.vx, vy: myVel.vy,
    speed: Math.hypot(myVel.vx, myVel.vy),
    aiming: !!_aiming, aimLook: [_aimLookX, _aimLookY], aimDir: [_aimDirX, _aimDirY],
    facing: [myFacingVx, myFacingVy], camIso: _lastCamIso,
    cfg: _moveParams, pos: { x: myAbsPredicted.x, y: myAbsPredicted.y },
    corrN: window.__corrN | 0, corrLast: window.__corrLast | 0,
  });
// @@moved-end:199
// @@moved-begin:212
  window.__inWorld = () => !!(connEverReady && myPid);
// @@moved-end:212
// @@moved-begin:214
  window.__getMarkets = () => { const out = {}; for (const [zid, c] of conns) out[zid] = (c && c.markets) ? c.markets.slice() : null; return out; };
// @@moved-end:214
// @@moved-begin:216
  window.__getDitches = () => { let recv = 0; for (const [, c] of conns) recv += (c && c.ditches) ? c.ditches.size : 0; return { recv, mirror: _ditchAbs.size }; };
// @@moved-end:216
// @@moved-begin:219
  window.__getAllBuildings = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) out.push({ id: b.id, type: b.type, wx: ox + b.x, wy: oy + b.y, stage: (b.data && b.data.stage) | 0 });
    }
    return out;
  };
// @@moved-end:219
// @@moved-begin:230
  window.__getNpcs = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const p of c.others.values()) if (p.simJob) out.push({ pid: p.pid, wx: ox + p.x, wy: oy + p.y, job: p.simJob, act: p.act || null });
    }
    return out;
  };
// @@moved-end:230
// @@moved-begin:238
  window.__getClaims = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const cl of (c.claims ? c.claims.values() : [])) out.push({ id: cl.id, kind: cl.kind, wx: ox + cl.x, wy: oy + cl.y, w: cl.w, h: cl.h });
    }
    return out;
  };
// @@moved-end:238
// @@moved-begin:247
  window.__getAllWalls = () => {
    const walls = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'wall') continue;
        walls.push({ wx: ox + b.x, wy: oy + b.y, side: b.data?.side || 'N' });
      }
    }
    return walls;
  };
// @@moved-end:247
// @@moved-begin:491
  window.__tickGap = () => (lastTickAt ? Math.round(performance.now() - lastTickAt) : -1);
// @@moved-end:491
// @@moved-begin:600
  (async () => {
    try {
      const r = await fetch('/terrain.json');
      if (!r.ok) return;
      const all = await r.json();
      if (!window.Terrain || !window.Terrain.setHardcoded) return;
      for (const [zid, data] of Object.entries(all)) window.Terrain.setHardcoded(zid, data);
      // ★[배치 19 B] 물 흐름의 정본 = 이 rivers path 다(상류→하류 순서). terrain.js 는 이걸
      //   `window.Terrain` 으로 내보내지 않으므로(_getHardcoded 는 서버 전용 export) **여기서**
      //   받은 원본을 그대로 잡아 둔다 — 서버 파일을 건드리지 않고 사본도 만들지 않는다.
      _hardTerrain = all; _riverSegs = null; _flowCellCache.clear(); _flowCellOld.clear(); _segGrid.map = null;
      _wfCache.key = null; _wfCache.pending = false; _wfPrev.wet = null;   // 지형이 갈렸으니 물 판정 재사용본도 버린다
      _waterCellCache.clear();
      _natChunk.clear();      // ★[배치 21] 자연물 청크 배치도 지형 파생 — 같은 지점에서 무효화
      _shoreTiles.clear();
      _rockCellCache.clear();
      _groundTiles.clear();   // ★[배치 19] 지면 베이크는 지형 파생물 — 같은 지점에서 함께 버린다
      if (typeof window.__invalidateMinimapCache === 'function') window.__invalidateMinimapCache();
      console.log('[terrain] 전체 hardcoded 선로딩:', Object.keys(all).join(','));
    } catch (e) { console.warn('[terrain] preload 실패:', e.message); }
  })();
// @@moved-end:600
// @@moved-begin:1028
  window.__shoreProbe = (R, cx0, cy0) => {
    R = R || 900;
    if (cx0 == null) { cx0 = _natLastC[0]; cy0 = _natLastC[1]; }
    const w = [];
    const c0 = Math.floor((cx0 - R) / 32), c1 = Math.floor((cx0 + R) / 32);
    const r0 = Math.floor((cy0 - R) / 32), r1 = Math.floor((cy0 + R) / 32);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      if (isWaterAtAbs(wx, wy) || isRockAtAbs(wx, wy)) continue;
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        if (!isWaterAtAbs(wx + nx * 32, wy + ny * 32)) continue;
        w.push(_shoreMargin(cx, cy, k));
      }
    }
    return w;
  };
// @@moved-end:1028
// @@moved-begin:2207
  (async () => {
    try {
      const r = await fetch('/assets/mountains/mountain_anchors.json');
      if (!r.ok) return;
      _mtAnchors = await r.json();
      const names = Object.keys(_mtAnchors); _mtWanted = names.length;
      // ★확장자는 앵커가 들고 있다(포장본은 webp). 자기 서술 — 클라가 형식을 짐작하지 않는다.
      for (const n of names) { const im = new Image(); im.onload = () => _mtLoaded++; im.src = '/assets/mountains/' + n + (_mtAnchors[n].ext || '.png'); MTX[n] = im; }
      // ★알파 지도 정본 — 굽는 쪽이 만든 하나를 클라도 하네스도 같이 쓴다.
      //   전엔 클라는 이미지를 축소해서, node 하네스는 PNG 를 읽어서 각자 만들었다.
      //   둘이 같이 틀리면 판정이 통과한다(자명 통과). 없으면 종전대로 이미지에서 유도한다.
      try {
        const ra = await fetch('/assets/mountains/mountain_alpha.json');
        if (ra.ok) {
          const j = await ra.json(); const N = j.n || 64;
          for (const k in j.a) {
            const bin = atob(j.a[k]), u = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            _mtAlphaMap.set(k, { N, a: u });
          }
          console.log('[mt] 알파 지도 정본', Object.keys(j.a).length, '종');
        }
      } catch (e) { }
      console.log('[mt] 산 스프라이트', names.length, '종 로드 시작');
    } catch (e) { console.warn('[mt] 앵커 로드 실패:', e.message); }
  })();
// @@moved-end:2207
// @@moved-begin:2234
  window.__isRockAt = (wx, wy) => !!_mtRockAt(primaryZoneId, wx, wy);
// @@moved-end:2234
// @@moved-begin:3420
  window.__mt3bakeRst = () => { _mt3BakeMs = 0; _mt3BakeN = 0; return 1; };
// @@moved-end:3420
// @@moved-begin:4829
  window.__natProbe = () => {
    const roads = [], claims = [], villages = [];
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      const ocx = Math.round(ox / CL_BUILDING_SIZE), ocy = Math.round(oy / CL_BUILDING_SIZE);
      if (c.roads) for (const rk of c.roads.keys()) {
        const ci = rk.indexOf(',');
        roads.push([ocx + +rk.slice(0, ci), ocy + +rk.slice(ci + 1)]);
      }
      for (const cl of (c.claims ? c.claims.values() : [])) claims.push([ox + cl.x, oy + cl.y, cl.w, cl.h]);
      if (c.simVillages) for (const v of c.simVillages)
        villages.push([ox + v.cx * CL_BUILDING_SIZE + 16, oy + v.cy * CL_BUILDING_SIZE + 16,
                       Math.max(v.r || 0, v.tr || 0) || 800]);
    }
    return { props: _natLastPr.map((p) => [p.x, p.y]), roads, claims, villages,
             farms: (window.__getAllBuildings ? window.__getAllBuildings().filter((b) => b.type === 'farmland').map((b) => [b.wx, b.wy]) : []) };
  };
// @@moved-end:4829
// @@moved-begin:4885
  window.__windProbe = () => ({ t: _windT(), w: _windAt(_windT()), off: !!_t19.windOff, force: _t19.windForce });
// @@moved-end:4885
// @@moved-begin:5153
  (function _loadVilTex() {
    try {
      const th = new Image(), ea = new Image(), wl = new Image(); let n = 0;
      const done = () => { if (++n === 3) { try { _bakeVilArt(th, ea, wl); } catch (e) { console.warn('[vilart] bake 실패 — 폴백 렌더 유지', e); } } };
      th.onload = done; ea.onload = done; wl.onload = done; th.src = TEX_THATCH_URL; ea.src = TEX_EARTH_URL; wl.src = TEX_WALL_URL;
    } catch (e) { /* 폴백: 기존 단색 렌더 */ }
  })();
// @@moved-end:5153
// @@moved-begin:5811
  window.addEventListener('keydown', (e) => {
    // Phase 14.40: Shift는 modal/채팅 상관 없이 sprint 상태로만 트랙
    if (e.key === 'Shift' && !mySprint) { mySprint = true; updateHud(); }
    if (chatActive) return;
    const k = normalizeKey(e);
    if (k === 'enter') {
      e.preventDefault();
      openChat();
      return;
    }
    if (k === ' ' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
    if (keys.has(k)) return;
    keys.add(k);
    // 리컨실리에이션: 입력 전송은 루프의 고정 스텝이 전담(≤33ms). keydown 즉시-send 제거 —
    //   즉시-send가 스텝/accumulator를 불규칙하게 건드려 이동이 버벅거렸음. 시작 지연 ≤33ms로 무시 가능.
    // Phase 14.41: 다운 중엔 행동 키 차단 (R 키 구조 시도만 별도 처리 — 본인이 다운 아닐 때만)
    if (myIsDown) {
      // 다운 중엔 어떤 행동도 안 함 — 부활 패널에서만 클릭
      return;
    }
    if (k === 'e') {
      // ★[11차 채광 재설계] E를 **누르고 있으면 1초마다 반복** — 채굴이 60타에 덩이 하나라
      //   한 번씩 누르게 두면 손가락이 남아난다. 서버가 1초/타를 강제하므로 과송신은 무해하고,
      //   문 토글·도살은 첫 1회만(반복 타이머는 gather 전용 — 문이 깜빡이지 않는다).
      if (!window.__eRepeat) window.__eRepeat = setInterval(() => {
        if (!keys.has('e') || chatActive || myIsDown) { clearInterval(window.__eRepeat); window.__eRepeat = null; return; }
        sendPrimary({ type: 'gather' });
      }, 1000);
      // 14.50: E 키 — 주변 door 토글, 없으면 사체 도살, 없으면 gather
      const nearDoor = findNearestDoor(myAbsPredicted.x, myAbsPredicted.y, myFloor);
      if (nearDoor) sendPrimary({ type: 'door_toggle', buildingId: nearDoor.id });
      else {
        // Phase 5-7: 근처 사체 찾기
        let nearestCorpse = null, nearestDist = 80;
        const pc = conns.get(primaryZoneId);
        if (pc) {
          const ox = pc.meta?.worldOffsetX || 0, oy = pc.meta?.worldOffsetY || 0;
          for (const co of pc.corpses.values()) {
            const d = Math.hypot(co.x + ox - myAbsPredicted.x, co.y + oy - myAbsPredicted.y);
            if (d < nearestDist) { nearestDist = d; nearestCorpse = co; }
          }
        }
        if (nearestCorpse) sendPrimary({ type: 'butcher', cid: nearestCorpse.cid });
        else sendPrimary({ type: 'gather' });
      }
    }
    // 14.53: 1키 = hotkey1 슬롯 토글 (착용 ↔ 해제)
    if (k === '1') {
      sendPrimary({ type: 'toggle_hotkey' });
    }
    else if (k === 'o') sendPrimary({ type: 'sort_ore' });   // ★[11차] 선광 — 캔 원석 덩이를 광석/맥석으로 가른다
    else if (k === 'c' && e.shiftKey) sendPrimary({ type: 'claim', kind: 'guild' });  // 길드 영토 (Shift+C)
    else if (k === 'c') sendPrimary({ type: 'claim', kind: 'personal' });  // 개인 사유지 (1 grid)
    else if (k === 't' && !e.shiftKey) sendPrimary({ type: 'claim', kind: 'temporary' });  // 임시 사유지 (1 grid)
    // ★[재민 확정 2026-08-27] T/Y 물물교환 **제거** — 동의 없는 인벤 이동이자 경제 우회였다.
    //   플레이어 간 거래는 양방향 제안·수락으로 다시 설계한다(회부_무게_다음층.md P항).
    else if (k === 'f' && e.shiftKey) sendPrimary({ type: 'fish_cast' });   // ★[낚시 v2] 던지기 → (입질 뒤) 챔질. 서버가 상태로 가른다
    else if (k === 'f') { sendPrimary({ type: 'attack' }); myLastAttackAt = performance.now(); }
    else if (k === 'g') {
      // Phase 5-I: 원거리 공격 — 마우스 방향으로 화살. aim은 primary zone-local 좌표.
      const pc = conns.get(primaryZoneId);
      if (pc && pc.meta && window._lastMouseWx !== undefined) {
        const aimX = window._lastMouseWx - (pc.meta.worldOffsetX || 0);
        const aimY = window._lastMouseWy - (pc.meta.worldOffsetY || 0);
        sendPrimary({ type: 'ranged_attack', aimX, aimY });
        myLastAttackAt = performance.now();
      }
    }
    else if (k === 'b') {
      // 14.51: B 키 = 건축 모드 토글 (옛 즉시 wall build 폐기)
      buildMode = !buildMode;
      if (!buildMode) { placementMode = null; }
      showNotice(buildMode ? '🏗️ 건축 모드 ON (인벤에서 건축물 클릭)' : '건축 모드 OFF');
      if (invOpen) renderInvPanel(document.getElementById('invBody')); // 재렌더 (강조 갱신)
    }
    else if (k === 'h') sendPrimary({ type: 'build', buildType: 'chest', floor: myBuildFloor });
    // ★★[T18 2026-09-01] `&& !e.shiftKey` 한 줄 — **이 체인은 Shift 를 안 가렸다.**
    //   그래서 `Shift+J` 가 여기까지 내려와 **모닥불을 짓는다**(다른 bare-letter 도 전부 같다).
    //   §8.2 는 사이드바 버튼마다 단축키 병기를 요구하는데, 그 규약을 지키려면 이 자리가 먼저 열려야 한다.
    //   ⇒ `Shift+J` 를 연대기(📜)에 내줬다. 나머지 글자의 같은 결함은 회부(M/H 영역).
    else if (k === 'j' && !e.shiftKey) sendPrimary({ type: 'build', buildType: 'campfire', floor: myBuildFloor });
    // Q 단축키 제거 — 공성캠프는 임시 사유지로 대체 예정 (Phase 14.18)
    else if (k === 'l') sendPrimary({ type: 'build', buildType: 'fence', floor: myBuildFloor });
    // I 키는 새 인벤 패널 (좀보이드식). 바닥은 건축 패널에서 클릭으로.
    else if (k === 'p') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
    else if (k === 'o') sendPrimary({ type: 'harvest' });
    else if (k === 'g') sendPrimary({ type: 'feed' });
    else if (k === 'n' && e.shiftKey) {
      // ★납품 — 품목을 안 보낸다. **서버가** 낼 수 있는 첫 의뢰를 고른다(권위는 서버에 있다).
      if (evNearVid == null) showNotice('📋 마을 중심에서 너무 멀다');
      else sendPrimary({ type: 'village_deliver', vid: evNearVid });
    }
    else if (k === 'g' && e.shiftKey) {
      if (evNearVid == null) showNotice('📋 마을 중심에서 너무 멀다');
      else sendPrimary({ type: 'village_board', vid: evNearVid });
    }
    else if (k === 'n') toggleTribePanel();
    else if (k === 'v') sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
    else if (k === 'z') { myBuildFloor = Math.min(5, myBuildFloor + 1); showNotice(`건축 층: ${myBuildFloor}F`); updateHud(); }
    else if (k === 'x') { myBuildFloor = Math.max(0, myBuildFloor - 1); showNotice(`건축 층: ${myBuildFloor}F`); updateHud(); }
    // 14.49-e7b: ,/. 키 제거 (자동 계단 도입 후 불필요)
    else if (k === 'u') {
      // 14.49-d: 빌드 시 player facing(myFacingVx/Vy)으로 stair dir 결정
      let bdir = 'N';
      const fx = myFacingVx || 0, fy = myFacingVy || 0;
      if (Math.abs(fx) > Math.abs(fy)) bdir = fx > 0 ? 'E' : 'W';
      else if (fy !== 0) bdir = fy > 0 ? 'S' : 'N';
      sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor, dir: bdir });
    }
    else if (k === 'm') { if (window.bigMap) window.bigMap.toggle(); }  // Phase 5-2-mini: M = 지도 (시장은 사이드바 클릭)
    else if (k === 'k') toggleCraft();
    else if (k === 'r' && e.shiftKey) sendPrimary({ type: 'repair_building' }); // Phase 14.34 수리
    else if (k === 'r') {
      // Phase 14.41: R = 우선 근처 다운 길드원 구조 시도, 없으면 요리 패널
      const target = findNearestDownedGuildmate();
      if (target) sendPrimary({ type: 'rescue_request', pid: target.pid });
      else toggleCookPanel();
    }
    else if (k === '1') sendPrimary({ type: 'equip', tool: 'axe' });
    else if (k === '2') sendPrimary({ type: 'equip', tool: 'pickaxe' });
    else if (k === '3') sendPrimary({ type: 'equip', tool: 'sword' });
    else if (k === '0') sendPrimary({ type: 'equip', tool: null });
  });
// @@moved-end:5811
// @@moved-begin:5930
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && mySprint) { mySprint = false; updateHud(); }
    const k = normalizeKey(e);
    keys.delete(k);
    if (k === 'e' && window.__eRepeat) { clearInterval(window.__eRepeat); window.__eRepeat = null; }   // ★채굴 반복 정지
    // 정지도 루프 고정 스텝이 ≤33ms 내 전송 (즉시-send 제거 — 스텝/accumulator 불규칙 건드림이 버벅 원인이었음).
  });
// @@moved-end:5930
// @@moved-begin:5973
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'gather') sendPrimary({ type: 'gather' });
      else if (a === 'claim') sendPrimary({ type: 'claim' });
      else if (a === 'attack') sendPrimary({ type: 'attack' });
      else if (a === 'build_wall') sendPrimary({ type: 'build', buildType: 'wall', floor: myBuildFloor });
      else if (a === 'build_chest') sendPrimary({ type: 'build', buildType: 'chest', floor: myBuildFloor });
      else if (a === 'build_campfire') sendPrimary({ type: 'build', buildType: 'campfire', floor: myBuildFloor });
      // build_siege 제거 — 임시 사유지로 대체 (14.18)
      else if (a === 'build_fence') sendPrimary({ type: 'build', buildType: 'fence', floor: myBuildFloor });
      else if (a === 'build_door') sendPrimary({ type: 'build', buildType: 'door', floor: myBuildFloor });
      else if (a === 'build_farmland') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
      else if (a === 'build_stair') sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor });
      else if (a === 'build_floor') sendPrimary({ type: 'build', buildType: 'floor', floor: myBuildFloor });
      else if (a === 'hut_start') { buildMode = true; placementMode = { special: 'hut_site' }; showNotice('⛏️ 움집터 배치 모드 — 클릭 위치에 6×4 수혈 굴착 (곡괭이 필요 · B=취소)'); }   // ★움집 고증 건축(좀보이드 커서 배치)
      else if (a === 'furnace_start') {   // ★노 건설(재민 확정 — 움집 동형). kind=도가니로/괴련로(시대가 정한다)
        const kind = btn.dataset.kind || 'crucible';
        buildMode = true; placementMode = { special: 'furnace_site', kind };
        showNotice(`🔥 ${kind === 'bloomery' ? '괴련로' : '노(爐)'} 터 배치 — 내 사유지/길드 사유지 안 2×2 (B=취소)`);
      }
      else if (a === 'kiln_start') { buildMode = true; placementMode = { special: 'kiln_site' }; showNotice('🪵 숯가마 터 배치 — 내 사유지/길드 사유지 안 2×2 (돌 4·곡괭이 · B=취소)'); }   // ★숯가마(노와 같은 계약)
      // ★★[2026-08-03e 배치 12 ①] 마을 회관 — 노·숯가마와 **완전히 같은 배치 계약**(2×2·사유지·단계).
      //   다른 건 완공이 곧 마을 등록이라는 것뿐이다. 자리 가능 여부는 서버가 착공 전에 판정한다.
      else if (a === 'village_start') { buildMode = true; placementMode = { special: 'village_site' }; showNotice('🏘️ 마을 회관 터 배치 — 내 사유지/길드 사유지 안 2×2 (터 다지기 → 환호 → 굴립주 · B=취소)'); }
      // ★[11차 T4] 마을 크루에게 집 의뢰 — placementMode.special 재사용(발명 0). 검증·재료·배치는 서버 권위.
      else if (a === 'psite_request') { buildMode = true; placementMode = { special: 'psite' }; showNotice('🏠 집 의뢰 모드 — 마을 영토 안을 클릭 (기둥6·서까래8·이엉8 선납 · B=취소)'); }
      else if (a === 'harvest') sendPrimary({ type: 'harvest' });
      else if (a === 'feed') sendPrimary({ type: 'feed' });
      else if (a === 'tribe') toggleTribePanel();
      else if (a === 'pvp_toggle') sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      else if (a === 'cook') toggleCookPanel();
      else if (a === 'market') toggleMarketplace();
    };
  });
// @@moved-end:5973
// @@moved-begin:6049
  window.__getActiveSide = () => activeSide;
// @@moved-end:6049
// @@moved-begin:12048
  window.__panelOpen = () => activeSide || null;
// @@moved-end:12048
// @@moved-begin:12091
  window.__ground = () => nearbyGroundItems().map(({ gi }) => ({ id: gi.id, item: gi.item, count: gi.count, kg: gi.kg, led: gi.led || null, tool: gi.tool || null }));
// @@moved-end:12091
// @@moved-begin:12454
  (function preloadItemIcons() {
    if (typeof Image !== 'function') return;
    const keys = Object.keys(ITEM_ICONS).filter((k) => !ICON_NO_RENDER.has(k));
    let settled = 0;
    const done = () => {
      if (++settled === keys.length) { try { updateHud(); } catch (e) {} }
    };
    for (const k of keys) {
      const im = new Image();
      im.onload = () => { ITEM_ICON_IMG[k] = im; _iconImgLoaded++; done(); };
      im.onerror = () => { done(); };
      im.src = '/assets/icons/' + k + '.png';
    }
  })();
// @@moved-end:12454
// @@moved-begin:13719
  window.__openInv = (cid) => { if (cid) activeContainerId = cid; openInv(); return true; };
// @@moved-end:13719
// @@moved-begin:14155
  setInterval(() => {
    const now = Date.now();
    // 인벤: 1초에 한 번 (item 변경 자주)
    if (invOpen) renderInvPanel(document.getElementById('invBody'));
    // 사이드 패널: 5초에 한 번만 (사용자 input fetch에 의존하니까)
    if (activeSide && now - lastSideRenderAt > 5000) {
      renderSide(activeSide);
      lastSideRenderAt = now;
    }
  }, 1000);
// @@moved-end:14155
