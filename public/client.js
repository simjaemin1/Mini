// 클라이언트 — 아이소메트릭 렌더링 + 다중 존 동시 구독 + 끊김 없는 핸드오프
// 핵심: 절대 월드 좌표를 사용해서 존 경계를 시각적으로 안 보이게.
//      현재 존에 primary 연결, 인접 존에는 observer 연결로 미리 보기.
// === CLIENT BUILD: 14.53 (도구 instance 시스템 + hotkey 슬롯 1번) ===
console.log('%c[durango-mini] client build = 14.53 (도구 instance + 1번 슬롯)', 'color:#5a9ae0;font-weight:bold;font-size:14px');

(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width, H = canvas.height;
  // Phase 14.19: 전체화면 — viewport 가득. resize 시 동적 재조정.
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    W = canvas.width; H = canvas.height;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // === 아이소메트릭 투영 (2:1 다이아몬드) — 2.5D ===
  // worldX,worldY (픽셀) → 화면상 iso 픽셀. z(높이)는 화면 y에서 빼서 위로 올림.
  // (1,0,0) → (1, 0.5), (0,1,0) → (-1, 0.5), (0,0,1) → (0, -1) 형태.
  // 모든 호출자는 z=0 기본 — Phase 13.2에서 건물/계단에 z>0 도입.
  const FLOOR_HEIGHT = 64; // 14.49-e2: 32 → 64 (한 층 2배)
  function w2i(wx, wy, wz = 0) {
    return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
  }

  // === 상태 ===
  let zonesMeta = {};
  let marketplaceUrl = '';
  let myName = '여행자';
  let myUsername = '';
  let myHp = 100, myMaxHp = 100; // 로그인 시 username (= server의 player_id). 게스트면 ''
  let myPassword = ''; // 로그인 시 password
  let myColor = '#f0c674';
  let myAbsPos = { x: 0, y: 0 };
  let myAbsPredicted = { x: 0, y: 0 };
  let primaryZoneId = null;
  let myPid = null;
  let inventory = { wood: 0, stone: 0 };
  let tools = {};     // 14.52 옛 호환 (사용 X)
  // 14.53: 도구 instance 리스트 + equipped는 toolItemId + hotkey1 슬롯
  let toolItems = [];   // [{id, type, d, max}]
  let equipped = null;  // toolItemId (null = 맨손)
  let hotkey1 = null;   // 1번 슬롯 toolItemId
  // 14.53 helpers
  function findToolInstance(id) {
    return toolItems.find(t => t.id === id) || null;
  }
  function hasToolTypeAlive(type) {
    return toolItems.some(t => t.type === type && t.d > 0);
  }
  function getEquippedInstance() {
    return equipped ? findToolInstance(equipped) : null;
  }
  // 옛 API 호환 (renderCraftPanel 등 옛 코드용)
  function hasToolAlive(name) { return hasToolTypeAlive(name); }
  function toolDurStr(name) {
    // type 이름일 수도, instance id일 수도
    let inst = findToolInstance(name);
    if (!inst) inst = toolItems.find(t => t.type === name && t.d > 0);
    if (!inst) return '';
    return `${inst.d}/${inst.max}`;
  }
  let recipes = {};   // 서버에서 받은 도구 레시피
  let itemRecipes = {}; // 14.50: 아이템 가공 레시피 (plank 등)
  let buildingRecipes = {}; // 14.51: 건축물 제작 레시피 (제작창에서 만들면 인벤 아이템)
  let cookRecipes = {}; // 서버에서 받은 요리 레시피
  let foodEffects = {}; // 서버에서 받은 음식 효과 정보 (표시용)
  let myHunger = 100, myThirst = 100, myVp = 0;
  const VP_THRESHOLD = 50; // 클라 표시용 — 서버와 동일해야 함
  let myTribeId = null, myTribeName = null;
  let myPvpEnabled = false;
  let myBuildFloor = 0; // 2.5D — 현재 건축 층 (Z=위, X=아래)
  let myFloor = 0;      // 캐릭터가 현재 있는 층 (계단으로 이동)
  let myStairZ = 0;     // 14.49-c: 계단 위 z 보간 (서버 발 z, 0~32)
  // Phase 14.30: 건축 placement mode
  // 14.51: placementMode = { itemType, floor, dir } — itemType 'item_wall' 등 (제작창에서 만든 아이템).
  //        옛 호환: { type, floor } — 직접 빌드용 (deprecated). itemType이 있으면 place_building 송신.
  let placementMode = null;
  let placementCursor = { wx: 0, wy: 0 }; // 마우스 따라가는 abs 좌표
  // 14.51: 건축 모드 (B 토글)
  let buildMode = false;
  // 14.51: placement 회전 (wall/door = N/E, fence = NS/EW, stair = N/E/S/W)
  let placingDir = 'N';
  // 14.51: 진행 중 작업 (3초). { kind:'place'|'dismantle', startedAt, durationMs, payload }
  let buildAction = null;
  // 14.51 + 14.53-g: 건축 모드 hover (분해 대상 건축물). cell에 여러 개면 휠로 cycle.
  let hoverBuildingId = null;
  let hoverList = [];        // 마우스 근처 building id list (가까운 순)
  let hoverIndex = 0;        // hoverList 안 현재 선택 index
  let lastMouseSx = 0, lastMouseSy = 0; // 캔버스 좌표 (px)
  let myLastAttackAt = 0; // Phase 14.35: 공격 모션
  let myFacingVx = 1, myFacingVy = 0; // Phase 14.37: 본인 마지막 facing (기본 동쪽)
  // Phase 14.40: Shift 달리기
  let mySprint = false;
  // Phase 14.41: 사망/구조
  let myIsDown = false;
  let myDownedAt = 0;
  let myDownRescueWindowMs = 10000;
  let myRespawnOptions = [];      // [{ claimId, kind, x, y }]
  const downStates = new Map();    // pid -> true (다운된 다른 플레이어)
  // Phase 14.42-a: home zone (영구 부활 fallback)
  let myHomeZone = null;
  let myHomeX = null, myHomeY = null;

  // === Phase 14.45: 위도 biome — 극지 빙하 + 툰드라 그라데이션 ===
  // 서버 ICE_BAND_PX와 일치. 그 바깥 TUNDRA_BAND_PX까지 보간.
  const ICE_BAND_PX = 1500; // v8: 800→1500
  const TUNDRA_BAND_PX = 2500;
  const ICE_COLOR = '#dde8f0'; // 약간 푸르스름한 흰색
  function _h2i(c) { return parseInt(c.slice(1), 16); }
  function _mixHex(a, b, t) {
    const pa = _h2i(a), pb = _h2i(b);
    const r = Math.round(((pa>>16)&255) * (1-t) + ((pb>>16)&255) * t);
    const g = Math.round(((pa>>8)&255)  * (1-t) + ((pb>>8)&255)  * t);
    const bl = Math.round((pa&255)      * (1-t) + (pb&255)      * t);
    return '#' + ((r<<16)|(g<<8)|bl).toString(16).padStart(6, '0');
  }
  // 절대 월드 y에 따라 색 보정. totalHeight = 전체 월드 높이 (남북 합).
  function latitudeColor(absY, totalH, baseColor) {
    const distFromPole = Math.min(absY, totalH - absY);
    if (distFromPole >= TUNDRA_BAND_PX) return baseColor;
    if (distFromPole <= ICE_BAND_PX)    return ICE_COLOR;
    const t = (distFromPole - ICE_BAND_PX) / (TUNDRA_BAND_PX - ICE_BAND_PX);
    return _mixHex(ICE_COLOR, baseColor, t);
  }

  // === Phase 14.46-b-mini: 해안선 water tiles (서버 chunk.js generateCoastlineWaterTiles와 동일 알고리즘) ===
  const COASTLINE_BASE = 600, COASTLINE_NOISE = 400;
  function _coastNoise(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return (((h * 9301 + 49297) >>> 0) % 1000) / 1000;
  }
  function _coastSmoothNoise(side, zoneId, t) {
    const STEP = 8;
    const t0 = Math.floor(t / STEP) * STEP;
    const t1 = t0 + STEP;
    const n0 = _coastNoise(`${side}_${zoneId}_${t0}`);
    const n1 = _coastNoise(`${side}_${zoneId}_${t1}`);
    const frac = (t - t0) / STEP;
    const u = frac * frac * (3 - 2 * frac);
    return n0 * (1 - u) + n1 * u;
  }
  function clientFindZoneAt(absX, absY) {
    for (const z of Object.values(zonesMeta)) {
      if (absX >= z.worldOffsetX && absX < z.worldOffsetX + z.zoneWidth &&
          absY >= z.worldOffsetY && absY < z.worldOffsetY + z.zoneHeight) return z;
    }
    return null;
  }
  function computeCoastlineWaterTiles(zone, tileSize) {
    const waterTiles = new Set();
    if (zone.isOcean) return waterTiles;
    const cols = Math.ceil(zone.zoneWidth / tileSize);
    const rows = Math.ceil(zone.zoneHeight / tileSize);
    const maxDist = COASTLINE_BASE + COASTLINE_NOISE;
    function isOceanAt(absX, absY) {
      const z = clientFindZoneAt(absX, absY);
      return !!(z && z.isOcean);
    }
    for (let ty = 0; ty < rows; ty++) {
      const absY = zone.worldOffsetY + ty * tileSize;
      const distN = ty * tileSize, distS = (rows - 1 - ty) * tileSize;
      for (let tx = 0; tx < cols; tx++) {
        const absX = zone.worldOffsetX + tx * tileSize;
        const distW = tx * tileSize, distE = (cols - 1 - tx) * tileSize;
        if (Math.min(distW, distE, distN, distS) > maxDist) continue;
        if (distW < maxDist && isOceanAt(zone.worldOffsetX - 1, absY)) {
          const n = _coastSmoothNoise('W', zone.id, ty) * COASTLINE_NOISE;
          if (distW < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
        }
        if (distE < maxDist && isOceanAt(zone.worldOffsetX + zone.zoneWidth + 1, absY)) {
          const n = _coastSmoothNoise('E', zone.id, ty) * COASTLINE_NOISE;
          if (distE < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
        }
        if (distN < maxDist && isOceanAt(absX, zone.worldOffsetY - 1)) {
          const n = _coastSmoothNoise('N', zone.id, tx) * COASTLINE_NOISE;
          if (distN < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
        }
        if (distS < maxDist && isOceanAt(absX, zone.worldOffsetY + zone.zoneHeight + 1)) {
          const n = _coastSmoothNoise('S', zone.id, tx) * COASTLINE_NOISE;
          if (distS < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
        }
      }
    }
    return waterTiles;
  }
  // zonesMeta 받으면 모든 zone water tiles 미리 계산. zonesMeta 갱신 시 다시 호출.
  const waterTilesByZone = {}; // { zoneId: Set("tx_ty") }
  function precomputeAllWaterTiles() {
    const TS = 32;
    for (const z of Object.values(zonesMeta)) {
      waterTilesByZone[z.id] = computeCoastlineWaterTiles(z, TS);
    }
  }
  // 절대 좌표에서 물 여부 판정 (콜라이더 + 렌더용)
  function isWaterAtAbs(absX, absY) {
    const z = clientFindZoneAt(absX, absY);
    if (!z) return false;
    if (z.isOcean) return true;
    const tx = Math.floor((absX - z.worldOffsetX) / 32);
    const ty = Math.floor((absY - z.worldOffsetY) / 32);
    const set = waterTilesByZone[z.id];
    return !!(set && set.has(`${tx}_${ty}`));
  }

  // 14.49-e6-c: 시야 재구성
  // 지형: 중앙 80px 원 = 항상 full bright. 뒤쪽 = 0.85 (덜 어둡게).
  // dot 보간 연속 (cos-like) → 부드러움.
  function coneMultGround(dwx, dwy, dist) {
    if (dist < 80) return 1; // PZ식 중앙 원형 vision
    if (myFacingVx === 0 && myFacingVy === 0) return 0.95;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy; // -1 ~ 1
    return 0.925 + 0.075 * dot; // 앞=1.0, 뒤=0.85 (덜 어둡게)
  }
  // entity (player/mob/item): 중앙 원형 + 뒤쪽 완전 차단 (PZ식)
  function coneMultEntity(dwx, dwy, dist) {
    if (dist < 80) return 1; // 가까이면 무조건 보임
    if (myFacingVx === 0 && myFacingVy === 0) return 1;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy;
    if (dot > 0.1) return 1;
    if (dot > -0.2) return (dot + 0.2) / 0.3; // fade
    return 0; // 뒤 안 보임
  }
  // 14.49-e6-c: entity 가시성 = cone × LoS (벽 너머 mob/player 안 보임)
  // worldCx === myAbsPredicted.x (카메라 = 플레이어 중심) — 직접 사용해도 안전.
  function entityVisibility(ax, ay, dist) {
    const dwx = ax - myAbsPredicted.x;
    const dwy = ay - myAbsPredicted.y;
    let vis = coneMultEntity(dwx, dwy, dist);
    if (vis > 0.01 && dist > 32) {
      const myCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
      const myCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const tCx = Math.floor(ax / CL_BUILDING_SIZE);
      const tCy = Math.floor(ay / CL_BUILDING_SIZE);
      if (!hasLineOfSight(myCx, myCy, tCx, tCy, myFloor)) vis = 0;
    }
    return vis;
  }
  // 14.49-e6-c: 벽 line-of-sight — fromCell → toCell 사이 wall edge로 막혔나
  // cell-by-cell Bresenham-style traversal. wallCellMap 사용 (O(1) 체크).
  function hasLineOfSight(fromCx, fromCy, toCx, toCy, floor) {
    if (fromCx === toCx && fromCy === toCy) return true;
    let cx = fromCx, cy = fromCy;
    let steps = 0;
    const MAX = 30;
    while ((cx !== toCx || cy !== toCy) && steps < MAX) {
      steps++;
      const dx = toCx - cx, dy = toCy - cy;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        const sx = dx > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, sx, 0, floor)) return false;
        cx += sx;
      } else if (dy !== 0) {
        const sy = dy > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, 0, sy, floor)) return false;
        cy += sy;
      } else break;
    }
    return true;
  }

  // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
  // wall은 cell edge에 (data.side ∈ {N, E}). BUILDING_SIZE=32 서버와 동일.
  const CL_BUILDING_SIZE = 32;
  function clCellOf(x, y) { return { cx: Math.floor(x / CL_BUILDING_SIZE), cy: Math.floor(y / CL_BUILDING_SIZE) }; }
  // 14.51: 3초 progress 작업 시작 (place 또는 dismantle)
  function startBuildAction(kind, payload) {
    if (buildAction) { showNotice('이미 작업 중'); return; }
    const durationMs = 3000;
    buildAction = { kind, startedAt: performance.now(), durationMs, payload, startPx: lastMouseSx, startPy: lastMouseSy };
    showNotice(kind === 'place' ? '🏗️ 배치 중... (3초)' : '🔧 분해 중... (3초)');
  }
  function cancelBuildAction(reason) {
    if (!buildAction) return;
    buildAction = null;
    if (reason) showNotice(reason);
  }
  // 매 frame 호출 — 작업 진행 + 완료 시 송신
  function updateBuildAction() {
    if (!buildAction) return;
    const now = performance.now();
    const elapsed = now - buildAction.startedAt;
    // 이동 중이면 취소 (PZ식 — 정지 상태에서만 작업)
    if (Math.abs(myAbsPredicted.vx || 0) > 1 || Math.abs(myAbsPredicted.vy || 0) > 1) {
      cancelBuildAction('이동으로 작업 취소'); return;
    }
    if (elapsed >= buildAction.durationMs) {
      // 완료 → 송신
      const { kind, payload } = buildAction;
      if (kind === 'place') {
        sendPrimary({
          type: 'place_building',
          itemType: payload.itemType,
          floor: payload.floor,
          dir: payload.dir,
          atX: payload.atX, atY: payload.atY,
        });
        // 인벤 0 되면 placement 종료
        if ((inventory[payload.itemType] || 0) <= 1) {
          placementMode = null; showNotice('인벤 떨어짐 — 배치 종료');
        }
      } else if (kind === 'dismantle') {
        sendPrimary({ type: 'dismantle_building', buildingId: payload.buildingId });
      }
      buildAction = null;
    }
  }
  // 14.50: player 80px 안 가장 가까운 door (toggle용)
  function findNearestDoor(px, py, floor) {
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'door') continue;
        if ((b.floor || 0) !== floor) continue;
        const ax = ox + b.x, ay = oy + b.y;
        const d = Math.hypot(ax - px, ay - py);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }
  function clHasFenceAt(cellCx, cellCy, floor) {
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'fence') continue;
        if ((b.floor || 0) !== floor) continue;
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        if (oxCells + bcx === cellCx && oyCells + bcy === cellCy) return true;
      }
    }
    return false;
  }
  function clHasWallAt(absX, absY, cellCx, cellCy, side, floor) {
    // 모든 zone conns의 buildings 다 검색 (zone 경계 cross 시 이웃 zone wall도 적용)
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const ox = zm.worldOffsetX || 0, oy = zm.worldOffsetY || 0;
      // absX/Y → 이 zone의 local 좌표
      const lx = absX - ox, ly = absY - oy;
      if (lx < -64 || lx > (zm.zoneWidth || 10240) + 64) continue;
      if (ly < -64 || ly > (zm.zoneHeight || 10240) + 64) continue;
      const targetCx = cellCx - Math.floor(ox / CL_BUILDING_SIZE);
      const targetCy = cellCy - Math.floor(oy / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'wall' && b.type !== 'fence') continue;
        if ((b.floor || 0) !== floor) continue;
        const bSide = b.data?.side;
        if (!bSide) continue; // 옛 큐브 wall은 무시
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        if (bcx === targetCx && bcy === targetCy && bSide === side) return true;
      }
    }
    return false;
  }
  // === 14.49-e6-b: BFS room flood fill — RimWorld식 정확한 indoor 판정 ===
  // 1) clWallCellMap: 모든 wall edge 위치 O(1) lookup (절대 cell + side + floor)
  // 2) cellRoomCache: 셀 → roomData (한 영역의 모든 cell이 같은 roomData 공유)
  //    roomData = { id, cells: Set, isIndoor }
  // BFS는 영역 단위 1번. 같은 영역의 모든 cell이 같이 cache됨.
  // wall 변경 broadcast 시 양옆 cell BFS 즉시 재계산 (eager invalidate).
  // 이 결과는 wall cutaway에만 사용. 시야와는 무관.
  const clWallCellMap = new Map(); // "cx_cy_side_floor" → true (절대 cell)
  const cellRoomCache = new Map(); // "cx_cy_floor" → roomData
  const clFloorCellMap = new Map(); // "cx_cy_floor" → true (위층 BFS cutaway용)
  const clMaxFloorMap = new Map(); // "cx_cy" → max floor (가장 위쪽 floor tile)
  let nextRoomId = 1;
  let clWallMapBuiltAt = 0;
  const ROOM_INDOOR_MAX = 200; // BFS 200 cell 이내에 escape 못 하면 indoor. 200 cell 넘으면 outdoor.

  function clRebuildWallCellMap() {
    clWallCellMap.clear();
    cellRoomCache.clear(); // wall 다 다시 → room도 다시
    clFloorCellMap.clear();
    clMaxFloorMap.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        const f = b.floor || 0;
        if (b.type === 'wall' || (b.type === 'door' && !b.data?.open)) {
          // 14.50: 닫힌 door도 wall처럼 시야/collider 차단
          const side = b.data?.side;
          if (!side) continue;
          if (b.data?.damaged) continue;
          clWallCellMap.set(`${oxCells + bcx}_${oyCells + bcy}_${side}_${f}`, true);
        } else if (b.type === 'floor') {
          const absKey = `${oxCells + bcx}_${oyCells + bcy}`;
          clFloorCellMap.set(`${absKey}_${f}`, true);
          const curMax = clMaxFloorMap.get(absKey);
          if (curMax === undefined || curMax < f) clMaxFloorMap.set(absKey, f);
        }
      }
    }
    clWallMapBuiltAt = performance.now();
  }
  function ensureWallMap() {
    if (clWallMapBuiltAt === 0 || performance.now() - clWallMapBuiltAt > 5000) clRebuildWallCellMap();
  }
  // 14.49-e7ab: 위층 BFS cutaway — 머리 위 floor tile에서 BFS로 연결된 building의 모든 wall 완전 투명
  function computeAboveCutawayWalls(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    const visited = new Set();
    const queue = [[myCx, myCy]];
    visited.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && visited.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (visited.has(k)) continue;
        if (clFloorCellMap.has(`${nx}_${ny}_${aboveFloor}`)) {
          visited.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    // building cells의 4 edge wall key 생성
    for (const k of visited) {
      const [cxs, cys] = k.split('_');
      const cx = +cxs, cy = +cys;
      result.add(`${cx}_${cy}_N_${aboveFloor}`);   // N edge
      result.add(`${cx}_${cy}_E_${aboveFloor}`);   // E edge
      result.add(`${cx}_${cy+1}_N_${aboveFloor}`); // S edge = 인접 cell의 N
      result.add(`${cx-1}_${cy}_E_${aboveFloor}`); // W edge = 인접 cell의 E
    }
    return result;
  }
  // 14.49-e7ag/al: 머리 위 BFS cutaway — floor tile OR stair cell 인 곳도 expand
  // stair는 그 위치에 floor tile 없어도 BFS 연속 (사용자 요구)
  function computeAboveCutawayCells(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    function isCellInBuilding(cx, cy) {
      // floor tile at aboveFloor OR stair cell (stair.floor === myFloor, 위층은 stair 위)
      if (clFloorCellMap.has(`${cx}_${cy}_${aboveFloor}`)) return true;
      if (clStairCellCache && clStairCellCache.has(`${cx}_${cy}`)) {
        const entry = clStairCellCache.get(`${cx}_${cy}`);
        if (entry && entry.stair && (entry.stair.floor || 0) === myFloor) return true;
      }
      return false;
    }
    const queue = [[myCx, myCy]];
    result.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && result.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (result.has(k)) continue;
        if (isCellInBuilding(nx, ny)) {
          result.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    return result;
  }
  // 인접 cell (cx, cy) → (cx+dx, cy+dy) 사이 벽 있나? dx,dy는 ±1만 (cardinal)
  function clHasWallBetween(cx, cy, dx, dy, floor) {
    if (dx === 1)  return clWallCellMap.has(`${cx}_${cy}_E_${floor}`);
    if (dx === -1) return clWallCellMap.has(`${cx-1}_${cy}_E_${floor}`);
    if (dy === 1)  return clWallCellMap.has(`${cx}_${cy+1}_N_${floor}`);
    if (dy === -1) return clWallCellMap.has(`${cx}_${cy}_N_${floor}`);
    return false;
  }
  // BFS from (cx, cy): 영역 fill. 200 cell 미만이면 indoor, 넘으면 outdoor.
  // 같은 영역의 모든 cell이 같은 roomData 공유.
  function computeRoom(cx, cy, floor) {
    ensureWallMap();
    const visited = new Set();
    const queue = [[cx, cy]];
    const startKey = `${cx}_${cy}_${floor}`;
    visited.add(`${cx}_${cy}`);
    let capped = false;
    while (queue.length > 0) {
      if (visited.size >= ROOM_INDOOR_MAX) { capped = true; break; }
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        if (clHasWallBetween(x, y, dx, dy, floor)) continue;
        const nx = x + dx, ny = y + dy;
        const k = `${nx}_${ny}`;
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
    const room = {
      id: nextRoomId++,
      cells: visited,
      isIndoor: !capped, // BFS가 cap 안 닿고 끝났으면 enclosed = indoor
    };
    // 영역 안의 모든 cell에 같은 roomData 박음
    for (const k of visited) {
      cellRoomCache.set(`${k}_${floor}`, room);
    }
    return room;
  }
  function isCellIndoor(cx, cy, floor) {
    ensureWallMap();
    const key = `${cx}_${cy}_${floor}`;
    const cached = cellRoomCache.get(key);
    if (cached) return cached.isIndoor;
    const room = computeRoom(cx, cy, floor);
    return room.isIndoor;
  }
  function playerIsIndoors() {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    return isCellIndoor(cx, cy, myFloor);
  }
  // Eager invalidate: 양옆 cell이 속한 room 전체 invalidate + 즉시 BFS 다시.
  function invalidateRoomsAroundWall(absCx, absCy, side, floor) {
    // wall side='N' on (cx,cy) → 양옆 cell = (cx, cy)와 (cx, cy-1)
    // wall side='E' on (cx,cy) → 양옆 cell = (cx, cy)와 (cx+1, cy)
    const pairs = side === 'E'
      ? [[absCx, absCy], [absCx + 1, absCy]]
      : [[absCx, absCy], [absCx, absCy - 1]];
    const roomsToInvalidate = new Set();
    for (const [cx, cy] of pairs) {
      const r = cellRoomCache.get(`${cx}_${cy}_${floor}`);
      if (r) roomsToInvalidate.add(r);
    }
    for (const r of roomsToInvalidate) {
      for (const k of r.cells) cellRoomCache.delete(`${k}_${floor}`);
    }
    // 새로 BFS — 양옆 cell 둘 다 (같은 room이면 두 번째는 cache hit으로 skip됨)
    for (const [cx, cy] of pairs) {
      computeRoom(cx, cy, floor);
    }
  }
  window.playerIsIndoors = playerIsIndoors;
  window.dbg = () => {
    ensureWallMap();
    const floors = {};
    for (const k of clWallCellMap.keys()) {
      const f = k.split('_')[3];
      floors[f] = (floors[f] || 0) + 1;
    }
    return {
      pos: { ...myAbsPredicted },
      cell: { cx: Math.floor(myAbsPredicted.x/CL_BUILDING_SIZE), cy: Math.floor(myAbsPredicted.y/CL_BUILDING_SIZE) },
      floor: myFloor,
      indoors: playerIsIndoors(),
      wallCells: clWallCellMap.size,
      wallsByFloor: floors,
      rooms: new Set([...cellRoomCache.values()]).size,
      cachedCells: cellRoomCache.size,
    };
  };
  // 14.49-e3-perf2: 계단 측면 진입 차단 + 클라 stair cell 캐시 (O(1))
  function clDirVec(dir) {
    if (dir === 'N') return { x: 0, y: -1 };
    if (dir === 'S') return { x: 0, y: 1 };
    if (dir === 'E') return { x: 1, y: 0 };
    if (dir === 'W') return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  // 전역 abs cell key → { stairRef, step }. building 추가/제거 시 dirty 마킹.
  const clStairCellCache = new Map();
  let clStairCacheBuildAt = 0;
  function clRebuildStairCellCache() {
    clStairCellCache.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'stair') continue;
        const dir = b.data?.dir || 'N';
        const dv = clDirVec(dir);
        const acx = Math.floor(b.x / CL_BUILDING_SIZE);
        const acy = Math.floor(b.y / CL_BUILDING_SIZE);
        for (let s = 0; s <= 2; s++) {
          const absCx = oxCells + acx + dv.x * s;
          const absCy = oyCells + acy + dv.y * s;
          clStairCellCache.set(`${absCx}_${absCy}`, { stair: b, step: s });
        }
      }
    }
    clStairCacheBuildAt = performance.now();
  }
  function clFindStairForCell(cx, cy) {
    // 0.5초마다 lazy rebuild (building add/remove broadcast가 자주 안 옴)
    if (performance.now() - clStairCacheBuildAt > 500) clRebuildStairCellCache();
    return clStairCellCache.get(`${cx}_${cy}`) || null;
  }
  function clientIsBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0) {
    const oc = clCellOf(oldX, oldY);
    const nc = clCellOf(newX, newY);
    if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
    // 14.50: fence cell 진입 차단 (cell 전체 차지)
    if (clHasFenceAt(nc.cx, nc.cy, playerFloor)) return true;
    // 14.49-e3: 계단 측면 진입 차단. 14.49-e7am: floor check 추가 (server와 일치).
    const enteringStair = clFindStairForCell(nc.cx, nc.cy);
    if (enteringStair) {
      const fromStair = clFindStairForCell(oc.cx, oc.cy);
      const sameStair = fromStair && fromStair.stair.id === enteringStair.stair.id;
      if (!sameStair) {
        const dir = enteringStair.stair.data?.dir || 'N';
        const dv = clDirVec(dir);
        const moveX = nc.cx - oc.cx, moveY = nc.cy - oc.cy;
        const stairFloor = enteringStair.stair.floor || 0;
        const lowEntry = enteringStair.step === 0 && moveX === dv.x && moveY === dv.y && playerFloor === stairFloor;
        const highEntry = enteringStair.step === 2 && moveX === -dv.x && moveY === -dv.y && playerFloor === stairFloor + 1;
        if (!lowEntry && !highEntry) return true;
      }
    }
    let blocked = false, reason = '';
    if (nc.cx > oc.cx && clHasWallAt(oldX, oldY, oc.cx, oc.cy, 'E', playerFloor)) { blocked = true; reason = 'E'; }
    else if (nc.cx < oc.cx && clHasWallAt(newX, newY, nc.cx, nc.cy, 'E', playerFloor)) { blocked = true; reason = 'W'; }
    else if (nc.cy > oc.cy && clHasWallAt(newX, newY, nc.cx, nc.cy, 'N', playerFloor)) { blocked = true; reason = 'S'; }
    else if (nc.cy < oc.cy && clHasWallAt(oldX, oldY, oc.cx, oc.cy, 'N', playerFloor)) { blocked = true; reason = 'N'; }
    // DEBUG — 클라가 어떤 cell→cell 시도하는지, 막힘/통과 결과까지
    if (window._collDbg !== false) {
      console.log(`[coll] cell ${oc.cx},${oc.cy}→${nc.cx},${nc.cy} f${playerFloor} ${blocked ? 'BLOCKED:' + reason : 'pass'} (zones: ${Array.from(conns.keys()).map(k => k + ':' + (conns.get(k).buildings?.size||0)).join(',')})`);
    }
    return blocked;
  }
  window._collDbg = false; // 콘솔에서 window._collDbg = true로 켤 수 있음 (기본 OFF)
  let lastServerPingMs = 0;
  let lastTickAt = 0;

  // 색상 팔레트
  const COLORS = ['#f0c674', '#5a9ae0', '#e07a5a', '#9a6ad8', '#5ad88a', '#d85a8a', '#5ad8d8', '#d8d85a'];

  // 채팅 상태
  let chatActive = false;
  const chatLog = []; // {name, color, text, t}
  const speechBubbles = new Map(); // pid -> {text, until}

  // === 월드 시계 (Day/Night) ===
  // serverNow = clientNow + serverNowOffset 으로 보정한 timestamp 기준 phase 계산.
  // 모든 zone이 동일한 epoch+dayLength 쓰니까 클라/서버 시계 차이만 보정하면 동일 phase.
  let worldClock = null;
  function worldNow() {
    return Date.now() + (worldClock ? worldClock.serverNowOffset : 0);
  }
  function worldPhase() {
    if (!worldClock) return 0.2; // 기본: 한낮
    const t = (worldNow() - worldClock.epoch) % worldClock.dayLengthMs;
    return t / worldClock.dayLengthMs;
  }
  function isNight() {
    if (!worldClock) return false;
    return worldPhase() > worldClock.dayPhaseRatio;
  }
  function darknessLevel() {
    if (!worldClock) return 0;
    const p = worldPhase();
    const dr = worldClock.dayPhaseRatio;
    if (p < dr - 0.05) return 0;
    if (p < dr) return (p - (dr - 0.05)) / 0.05;
    if (p > 0.95) return (1 - p) / 0.05;
    return 1;
  }
  // HUD 표시용 — "07:42" 같은 24시간 시계 문자열
  function gameTimeString() {
    if (!worldClock) return '--:--';
    const p = worldPhase();
    // phase 0 = 새벽 6시로 잡자 — 익숙한 감각
    const hours24 = ((p * 24) + 6) % 24;
    const hh = Math.floor(hours24);
    const mm = Math.floor((hours24 - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  // 존별 연결과 상태
  //   conns[zoneId] = { ws, role: 'primary'|'observer', meta, resources, claims, others }
  const conns = new Map();

  // === Entity interpolation (다른 플레이어/mob 부드러운 움직임) ===
  // 서버 tick(10Hz, 100ms 간격) 위치를 timestamped buffer에 쌓고, 렌더는 (now - INTERP_DELAY_MS)
  // 시점의 위치를 양옆 두 샘플 사이 선형 보간으로 그린다. 60fps에서 연속적으로 흐름.
  // 본인 캐릭터(myAbsPredicted)는 입력 예측이라 영향 없음.
  // 핸드오프 시 player_left/mob_removed 받으면 즉시 비우니까 잔상 없음.
  const INTERP_DELAY_MS = 60;  // server tick 33ms(30Hz) + 약간의 jitter buffer
  const INTERP_HISTORY_MS = 1000;
  function pushSample(buf, t, x, y) {
    buf.push({ t, x, y });
    const cutoff = t - INTERP_HISTORY_MS;
    while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
  }
  function sampleAt(buf, t, fallbackX, fallbackY) {
    if (!buf || buf.length === 0) return { x: fallbackX, y: fallbackY };
    if (t <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
    const last = buf[buf.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (a.t <= t && t <= b.t) {
        const dt = b.t - a.t;
        const u = dt > 0 ? (t - a.t) / dt : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    return { x: last.x, y: last.y };
  }

  // === 입력 ===
  const keys = new Set();
  // e.code → 게임 키 매핑 — OS 키보드 layout(한/영) 무관
  // 'KeyW' → 'w' 등으로 정규화해서 게임 로직은 한 가지만 보면 됨
  const CODE_TO_KEY = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyC: 'c', KeyT: 't', KeyY: 'y', KeyF: 'f',
    KeyB: 'b', KeyH: 'h', KeyM: 'm', KeyK: 'k', KeyJ: 'j', KeyR: 'r', KeyL: 'l',
    KeyP: 'p', KeyO: 'o', KeyG: 'g', KeyN: 'n', KeyV: 'v', KeyZ: 'z', KeyX: 'x',
    KeyU: 'u', KeyI: 'i', Comma: ',', Period: '.',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3',
    ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
    Space: ' ', Enter: 'enter', Tab: 'tab',
  };
  function normalizeKey(e) {
    // e.code 우선 (한글 IME 등에서도 동일). fallback: e.key
    return CODE_TO_KEY[e.code] || (e.key || '').toLowerCase();
  }
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
    // Phase 14.46-a-fix: 이동 키 누르는 즉시도 송신 (시작 지연도 줄임)
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) {
      sendInput();
    }
    // Phase 14.41: 다운 중엔 행동 키 차단 (R 키 구조 시도만 별도 처리 — 본인이 다운 아닐 때만)
    if (myIsDown) {
      // 다운 중엔 어떤 행동도 안 함 — 부활 패널에서만 클릭
      return;
    }
    if (k === 'e') {
      // 14.50: E 키 — 주변 door가 있으면 toggle, 없으면 gather
      const nearDoor = findNearestDoor(myAbsPredicted.x, myAbsPredicted.y, myFloor);
      if (nearDoor) sendPrimary({ type: 'door_toggle', buildingId: nearDoor.id });
      else sendPrimary({ type: 'gather' });
    }
    // 14.53: 1키 = hotkey1 슬롯 토글 (착용 ↔ 해제)
    if (k === '1') {
      sendPrimary({ type: 'toggle_hotkey' });
    }
    else if (k === 'c' && e.shiftKey) sendPrimary({ type: 'claim', kind: 'guild' });  // 길드 영토 (Shift+C)
    else if (k === 'c') sendPrimary({ type: 'claim', kind: 'personal' });  // 개인 사유지 (1 grid)
    else if (k === 't' && !e.shiftKey) sendPrimary({ type: 'claim', kind: 'temporary' });  // 임시 사유지 (1 grid)
    else if (k === 't') sendPrimary({ type: 'trade_offer', give: 'wood' });
    else if (k === 'y') sendPrimary({ type: 'trade_offer', give: 'stone' });
    else if (k === 'f') { sendPrimary({ type: 'attack' }); myLastAttackAt = performance.now(); }
    else if (k === 'b') {
      // 14.51: B 키 = 건축 모드 토글 (옛 즉시 wall build 폐기)
      buildMode = !buildMode;
      if (!buildMode) { placementMode = null; }
      showNotice(buildMode ? '🏗️ 건축 모드 ON (인벤에서 건축물 클릭)' : '건축 모드 OFF');
      if (invOpen) renderInvPanel(document.getElementById('invBody')); // 재렌더 (강조 갱신)
    }
    else if (k === 'h') sendPrimary({ type: 'build', buildType: 'chest', floor: myBuildFloor });
    else if (k === 'j') sendPrimary({ type: 'build', buildType: 'campfire', floor: myBuildFloor });
    // Q 단축키 제거 — 공성캠프는 임시 사유지로 대체 예정 (Phase 14.18)
    else if (k === 'l') sendPrimary({ type: 'build', buildType: 'fence', floor: myBuildFloor });
    // I 키는 새 인벤 패널 (좀보이드식). 바닥은 건축 패널에서 클릭으로.
    else if (k === 'p') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
    else if (k === 'o') sendPrimary({ type: 'harvest' });
    else if (k === 'g') sendPrimary({ type: 'feed' });
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
    else if (k === 'm') toggleMarketplace();
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
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && mySprint) { mySprint = false; updateHud(); }
    const k = normalizeKey(e);
    keys.delete(k);
    // Phase 14.46-a-fix: WASD/Arrow를 떼면 즉시 input 송신 (vx=0,vy=0) — 33ms 인터벌 기다리지 말고.
    // 이게 빠지면 ping이 200ms일 때 키 뗀 뒤 ~250ms간 더 걷는 현상 발생.
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) {
      sendInput();
    }
  });
  // blur 이벤트로 keys 초기화 안 함 — 콘솔 열기/탭 전환 등 사소한 이유로 키가 reset돼서
  // 사용자가 "막힌 느낌" 받는 원인. 진짜 화면 떠나면 어차피 keyup 자연스럽게 일어남.
  // window.addEventListener('blur', () => { keys.clear(); });

  function openChat() {
    chatActive = true;
    keys.clear();
    const input = document.getElementById('chatInput');
    input.classList.add('active');
    input.focus();
    input.value = '';
  }
  function closeChat(send = false) {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    chatActive = false;
    input.classList.remove('active');
    input.blur();
    input.value = '';
    if (send && text) {
      sendPrimary({ type: 'chat', text });
    }
  }
  function setupChat() {
    const input = document.getElementById('chatInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeChat(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeChat(false);
      }
    });
  }

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'gather') sendPrimary({ type: 'gather' });
      else if (a === 'claim') sendPrimary({ type: 'claim' });
      else if (a === 'trade_wood') sendPrimary({ type: 'trade_offer', give: 'wood' });
      else if (a === 'trade_stone') sendPrimary({ type: 'trade_offer', give: 'stone' });
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
      else if (a === 'harvest') sendPrimary({ type: 'harvest' });
      else if (a === 'feed') sendPrimary({ type: 'feed' });
      else if (a === 'tribe') toggleTribePanel();
      else if (a === 'pvp_toggle') sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      else if (a === 'cook') toggleCookPanel();
      else if (a === 'market') toggleMarketplace();
    };
  });

  function sendPrimary(obj) {
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  }

  // === 부트 ===
  async function boot() {
    const res = await fetch('/zones');
    const data = await res.json();
    zonesMeta = data.zones;
    marketplaceUrl = data.marketplaceUrl || '';
    // Phase 14.46-b-mini: 모든 zone water tiles 사전 계산 (~수만 tiles, ~100ms)
    try { precomputeAllWaterTiles(); } catch (e) { console.warn('water tile compute fail:', e); }

    // 2D 그리드 월드 크기 계산
    worldWidth = 0;
    worldHeight = 0;
    for (const z of Object.values(zonesMeta)) {
      worldWidth = Math.max(worldWidth, z.worldOffsetX + (z.zoneWidth || 1024));
      worldHeight = Math.max(worldHeight, (z.worldOffsetY || 0) + (z.zoneHeight || 1024));
    }

    // localStorage에서 이전 프로필 복원 (패스워드는 저장 안 함 — 매번 입력)
    const savedName = localStorage.getItem('durango_username');
    if (savedName) document.getElementById('name').value = savedName;
    const savedColor = localStorage.getItem('durango_color');
    myColor = savedColor && COLORS.includes(savedColor) ? savedColor : COLORS[0];

    // 색상 팔레트 UI
    const picker = document.getElementById('colorPicker');
    for (const c of COLORS) {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === myColor ? ' selected' : '');
      sw.style.background = c;
      sw.dataset.color = c;
      sw.onclick = () => {
        myColor = c;
        for (const el of picker.children) el.classList.toggle('selected', el.dataset.color === c);
      };
      picker.appendChild(sw);
    }

    const sel = document.getElementById('startZone');
    function refreshZoneOptions() {
      sel.innerHTML = '';
      for (const [id, z] of Object.entries(zonesMeta)) {
        const opt = document.createElement('option');
        opt.value = id;
        const popPart = (z.population !== null && z.population !== undefined && z.cap)
          ? ` · ${z.population}/${z.cap}명${z.full ? ' (가득참)' : ''}`
          : '';
        opt.textContent = `${z.displayName} (RTT ≈ ${(z.simulatedLatencyMs || 0) * 2}ms)${popPart}`;
        if (z.full) opt.disabled = true;
        if (id === data.defaultZone && !z.full) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    refreshZoneOptions();

    // 14.42-a: 이름 입력 시 기존 계정 여부 확인 → zone picker 토글
    //   - 게스트(이름+비번 없음): picker 노출 — 지역 직접 선택
    //   - 신규 가입(이름+비번 있음, DB에 없음): picker 노출 — 영구 home 됨
    //   - 기존 로그인(이름+비번 있음, DB에 있음): picker 숨김 + last_zone 자동 사용
    const nameInput = document.getElementById('name');
    const pwInput = document.getElementById('password');
    const zoneRow = document.getElementById('zoneRow');
    const existingHint = document.getElementById('existingLoginHint');
    let checkTimer = null;
    let lastCheckedName = null;
    // 기존 계정의 자동 라우팅용 — 마지막에 fetch한 player.last_zone (or home_zone)
    window.__autoZone = null;
    async function refreshLobbyMode() {
      const u = nameInput.value.trim();
      const p = pwInput.value;
      if (!u || !p) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
        return;
      }
      if (u === lastCheckedName) return; // debounce
      lastCheckedName = u;
      try {
        const r = await fetch('/check_username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) });
        const d = await r.json();
        if (d.taken) {
          zoneRow.classList.add('hidden');
          existingHint.classList.remove('hidden');
          // 기존 계정 — last_zone/home_zone 가져와서 자동 라우팅
          try {
            const r2 = await fetch('/player/' + encodeURIComponent(u));
            if (r2.ok) {
              const pd = await r2.json();
              const dest = (pd.player?.last_zone) || (pd.player?.home_zone);
              if (dest && zonesMeta[dest]) {
                window.__autoZone = dest;
                existingHint.innerHTML = `🔑 기존 계정 — <b>${zonesMeta[dest].displayName}</b>의 마지막 위치에서 시작합니다`;
              }
            }
          } catch (e) {}
        } else {
          zoneRow.classList.remove('hidden');
          existingHint.classList.add('hidden');
          window.__autoZone = null;
        }
      } catch (e) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
      }
    }
    function debouncedCheck() {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(refreshLobbyMode, 250);
    }
    nameInput.addEventListener('input', debouncedCheck);
    pwInput.addEventListener('input', debouncedCheck);

    // 로비에서 10초마다 zone 인구 갱신
    const zoneRefreshTimer = setInterval(async () => {
      if (document.getElementById('lobby').classList.contains('hidden')) {
        clearInterval(zoneRefreshTimer);
        return;
      }
      try {
        const r = await fetch('/zones');
        const d = await r.json();
        zonesMeta = d.zones;
        refreshZoneOptions();
      } catch (e) {}
    }, 10000);

    document.getElementById('enter').onclick = () => {
      const inputName = document.getElementById('name').value.trim();
      const inputPw = document.getElementById('password').value;
      myName = inputName || '여행자';
      myUsername = inputName; // 빈 문자열이면 게스트
      myPassword = inputPw;
      if (inputName) localStorage.setItem('durango_username', inputName);
      localStorage.setItem('durango_color', myColor);
      document.getElementById('authError').classList.add('hidden');
      // 재진입 시 모든 클라 상태 초기화
      kicked = false;
      initialWelcomeReceived = false;
      chatActive = false;
      keys.clear();
      // 채팅 입력창 비활성화 상태로
      const chatInput = document.getElementById('chatInput');
      if (chatInput) { chatInput.classList.remove('active'); chatInput.blur(); chatInput.value = ''; }
      // 14.42-a: 기존 계정이면 last_zone/home_zone으로 자동 라우팅 (zone picker 무시)
      const startZone = window.__autoZone || sel.value;
      document.getElementById('lobby').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      connect(startZone, 'primary', null);
      // setupChat과 loop는 한 번만
      if (!chatSetup) { setupChat(); chatSetup = true; }
      if (!loopStarted) { loopStarted = true; loop(); }
    };

    // RTT 측정 — 1초마다 primary에 ping
    // 14.43: pong watchdog — 5초 이상 pong 못 받으면 ws 좀비로 간주, 강제 close → 자동 재연결
    setInterval(() => {
      const c = conns.get(primaryZoneId);
      if (!c || c.ws.readyState !== 1) return;
      const now = performance.now();
      // 초기엔 lastPongAt 없으니까 첫 ping부터 기록 시작
      if (!c.lastPongAt && c.firstPingAt && now - c.firstPingAt > 15000) {
        console.warn('[recover] ping 후 15초간 pong 한 번도 못 받음 — ws 좀비, 강제 close');
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (c.lastPongAt && now - c.lastPongAt > 7000) {
        console.warn(`[recover] pong 마지막 ${((now - c.lastPongAt)/1000).toFixed(1)}초 전 — ws 좀비, 강제 close`);
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (!c.firstPingAt) c.firstPingAt = now;
      c.ws.send(JSON.stringify({ type: 'ping', t: now }));
    }, 1000);

    // 14.43: 탭이 다시 보이면 — 백그라운드 동안 RAF 멈춰서 watchdog/checkOrphan 안 돌았을 수 있음.
    // 마지막 tick 5초 넘으면 primary 좀비로 간주, 강제 끊고 즉시 재연결 트리거.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      const stale = !lastTickAt || (now - lastTickAt > 5000);
      console.log(`[recover] visibilitychange visible — lastTick ${lastTickAt ? Math.round(now - lastTickAt) + 'ms 전' : '없음'} stale=${stale}`);
      if (stale && primaryZoneId) {
        const c = conns.get(primaryZoneId);
        if (c) { try { c.ws.close(); } catch (e) {} }
        // observer ws들도 같이 정리 (얘들도 보통 같이 죽어있음)
        for (const [zid, conn] of conns) {
          if (zid !== primaryZoneId) { try { conn.ws.close(); } catch (e) {} }
        }
        // 재트리거 방지 — 다음 welcome이 lastTickAt 갱신할 때까지 stale 판정 안 나게
        lastTickAt = now;
      }
    });

    // observer viewport 업데이트 — 1초마다 자기 abs position을 각 observer zone-local로 변환
    setInterval(() => {
      for (const [zid, c] of conns) {
        if (c.role !== 'observer' || c.ws.readyState !== 1) continue;
        const zm = zonesMeta[zid];
        if (!zm) continue;
        const zW = zm.zoneWidth || 1024, zH = zm.zoneHeight || 1024;
        const localX = Math.max(0, Math.min(zW, myAbsPredicted.x - zm.worldOffsetX));
        const localY = Math.max(0, Math.min(zH, myAbsPredicted.y - (zm.worldOffsetY||0)));
        c.ws.send(JSON.stringify({ type: 'viewport_update', x: localX, y: localY }));
      }
    }, 1000);

    refreshHealth();
    healthInterval = setInterval(refreshHealth, 3000);

    // Phase 14.30 + 14.51: 캔버스 mousemove → placement cursor + hover building
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      lastMouseSx = px; lastMouseSy = py;
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      // 14.53-g fix: 2층 이상 player일 때, 마우스 py에 floor*FLOOR_HEIGHT 더해 그 층의 plane으로 투영
      const ix = px - W/2 + myIso.x;
      const iy = (py + (myFloor || 0) * FLOOR_HEIGHT) - H/2 + myIso.y;
      const wx = ix * 0.5 + iy;
      const wy = iy - ix * 0.5;
      if (placementMode) {
        placementCursor.wx = wx;
        placementCursor.wy = wy;
      }
      // 14.51 + 14.53-e + 14.53-g/i: hover list. wall/door는 양쪽 cell 모두에서 후보 (edge 공유).
      if (buildMode && !placementMode) {
        const candidates = [];
        const mouseCx = Math.floor(wx / 32);
        const mouseCy = Math.floor(wy / 32);
        for (const c of conns.values()) {
          const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if ((b.floor || 0) !== myFloor) continue;
            const isEdge = (b.type === 'wall' || b.type === 'door');
            const bAbsX = ox + b.x, bAbsY = oy + b.y;
            const bCx = Math.floor(bAbsX / 32);
            const bCy = Math.floor(bAbsY / 32);
            let match = false;
            if (isEdge) {
              // wall 저장: N → cell (bCx, bCy)의 윗 edge = cell (bCx, bCy-1)의 아래 edge
              // E → cell (bCx, bCy)의 우측 edge = cell (bCx+1, bCy)의 좌측 edge
              const side = b.data?.side || 'N';
              if (side === 'N') {
                match = (mouseCx === bCx) && (mouseCy === bCy || mouseCy === bCy - 1);
              } else if (side === 'E') {
                match = (mouseCy === bCy) && (mouseCx === bCx || mouseCx === bCx + 1);
              }
            } else {
              match = (bCx === mouseCx && bCy === mouseCy);
            }
            if (!match) continue;
            const ax = bAbsX + (isEdge ? 16 : 0);
            const ay = bAbsY + (isEdge ? 16 : 0);
            const d = Math.hypot(ax - wx, ay - wy);
            candidates.push({ id: b.id, d });
          }
        }
        candidates.sort((a, b) => a.d - b.d);
        // 14.54-b: auto floor hover → 부모 stair로 redirect (둘이 같은 그룹)
        const redirectMap = new Map();
        for (const c of candidates) {
          const bb = (function(){ for (const cc of conns.values()) { const x = cc.buildings.get(c.id); if (x) return x; } return null; })();
          if (bb && bb.type === 'floor' && bb.data?._parentStairId) {
            redirectMap.set(c.id, bb.data._parentStairId);
          }
        }
        let newList = candidates.map(c => redirectMap.get(c.id) || c.id);
        // 중복 제거 (같은 stair에 여러 cell이 같이 잡힐 수 있음)
        newList = newList.filter((id, i) => newList.indexOf(id) === i);
        // 옛 hoverBuildingId가 새 list 안에 있으면 index 유지, 아니면 0
        const oldId = hoverBuildingId;
        if (newList.length === 0) {
          hoverList = []; hoverIndex = 0; hoverBuildingId = null;
        } else if (newList.join() !== hoverList.join()) {
          hoverList = newList;
          const keep = oldId ? hoverList.indexOf(oldId) : -1;
          hoverIndex = (keep >= 0) ? keep : 0;
          hoverBuildingId = hoverList[hoverIndex];
        }
      } else {
        hoverList = []; hoverIndex = 0; hoverBuildingId = null;
      }
    });

    // 14.53-g/i: 건축 모드 마우스 휠 — placement 중이면 회전, hover 중이면 cycle
    canvas.addEventListener('wheel', (e) => {
      if (!buildMode) return;
      const delta = (e.deltaY > 0) ? 1 : -1;
      // placement 중 → 회전 (wall/door = N→E→S→W, fence = NS↔EW, stair = N→E→S→W)
      if (placementMode && placementMode.itemType) {
        e.preventDefault();
        const it = placementMode.itemType;
        if (it === 'item_wall' || it === 'item_door') {
          const seq = ['N', 'E', 'S', 'W'];
          const i = seq.indexOf(placementMode.dir || 'N');
          placementMode.dir = seq[(i + delta + 4) % 4];
        } else if (it === 'item_stair') {
          // 14.54-c2: 계단은 N(남→북) 또는 W(동→서) 2방향만
          placementMode.dir = (placementMode.dir === 'N') ? 'W' : 'N';
        } else if (it === 'item_fence') {
          placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
        }
        return;
      }
      // hover cycle
      if (hoverList.length > 1) {
        e.preventDefault();
        hoverIndex = ((hoverIndex + delta) % hoverList.length + hoverList.length) % hoverList.length;
        hoverBuildingId = hoverList[hoverIndex];
      }
    }, { passive: false });
    // 14.51: 우클릭 = placement 회전 (wall/door = N/E, fence = NS/EW, stair = N/E/S/W). 기본 우클릭 메뉴 차단.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!placementMode || !placementMode.itemType) return;
      const it = placementMode.itemType;
      if (it === 'item_wall' || it === 'item_door') {
        placementMode.dir = (placementMode.dir === 'N') ? 'E' : 'N';
      } else if (it === 'item_fence') {
        placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
      } else if (it === 'item_stair') {
        const seq = ['N', 'E', 'S', 'W'];
        const i = seq.indexOf(placementMode.dir || 'N');
        placementMode.dir = seq[(i + 1) % 4];
      }
      showNotice(`회전: ${placementMode.dir}`);
    });
    // Phase 14.22: 캔버스 클릭 → screen → world 좌표 변환 → chest bbox hit-test
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      // 캔버스 안 픽셀 좌표 (canvas.width/height와 css width/height 다를 수 있으니 스케일)
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      // toScreen 역: ix = px - W/2 + camX; iy = py - H/2 + camY
      // 14.53-g fix: 2층+ player일 때 py에 floor*FLOOR_HEIGHT 더해 그 층 plane으로 투영
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const ix = px - W/2 + myIso.x;
      const iy = (py + (myFloor || 0) * FLOOR_HEIGHT) - H/2 + myIso.y;
      // iso 역변환: wx = ix/2 + iy, wy = iy - ix/2
      const clickWx = ix * 0.5 + iy;
      const clickWy = iy - ix * 0.5;
      // Phase 14.30 / 14.51: placement mode 우선 — 그 위치에 3초 progress → 빌드
      if (placementMode) {
        // 사용자 위치에서 거리 체크 (160px)
        const distMe = Math.hypot(clickWx - myAbsPredicted.x, clickWy - myAbsPredicted.y);
        if (distMe > 160) { showNotice('너무 멀어서 거기에 못 지음 (160px)'); return; }
        if (placementMode.itemType) {
          // 14.51: 3초 progress 시작 → 완료 시 server 송신 + 인벤 차감 (server 측에서)
          startBuildAction('place', {
            itemType: placementMode.itemType,
            floor: placementMode.floor || 0,
            dir: placementMode.dir || 'N',
            atX: clickWx, atY: clickWy,
          });
        } else {
          // 옛 호환 (즉시)
          sendPrimary({ type: 'build', buildType: placementMode.type, floor: placementMode.floor, atX: clickWx, atY: clickWy });
          if (!e.shiftKey) { placementMode = null; showNotice('배치 모드 종료'); }
        }
        return;
      }
      // 14.51 + 14.53-e: 건축 모드 + hover building → 3초 progress 분해
      if (buildMode && hoverBuildingId && !buildAction) {
        let target = null, ox = 0, oy = 0;
        for (const c of conns.values()) {
          const b = c.buildings.get(hoverBuildingId);
          if (b) { target = b; ox = c.meta?.worldOffsetX||0; oy = c.meta?.worldOffsetY||0; break; }
        }
        if (target) {
          const isEdge = (target.type === 'wall' || target.type === 'door');
          const tx = ox + target.x + (isEdge ? 16 : 0);
          const ty = oy + target.y + (isEdge ? 16 : 0);
          const d = Math.hypot(tx - myAbsPredicted.x, ty - myAbsPredicted.y);
          if (d > 160) { showNotice('너무 멀어서 분해 못함 (160px)'); return; }
          startBuildAction('dismantle', { buildingId: hoverBuildingId });
          return;
        }
      }
      // 1) ground item hit-test 우선 (작은 거 위에 클릭)
      let hitGi = null;
      for (const c of conns.values()) {
        if (!c.meta || !c.groundItems) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const gi of c.groundItems.values()) {
          const absX = ox + gi.x, absY = oy + gi.y;
          if (Math.abs(absX - clickWx) <= 14 && Math.abs(absY - clickWy) <= 14) {
            hitGi = gi; break;
          }
        }
        if (hitGi) break;
      }
      if (hitGi) {
        const c = conns.get(primaryZoneId);
        const ox = c?.meta?.worldOffsetX || 0, oy = c?.meta?.worldOffsetY || 0;
        const distToMe = Math.hypot((ox + hitGi.x) - myAbsPredicted.x, (oy + hitGi.y) - myAbsPredicted.y);
        if (distToMe > 100) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        sendPrimary({ type: 'pickup_item', giId: hitGi.id });
        return;
      }
      // 2) chest bbox hit-test (chest는 32×32 cell, b.x/b.y가 cell 중심)
      let hitChest = null;
      for (const c of conns.values()) {
        if (!c.meta) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if (b.type !== 'chest') continue;
          const absX = ox + b.x, absY = oy + b.y;
          if (Math.abs(absX - clickWx) <= 20 && Math.abs(absY - clickWy) <= 20) {
            hitChest = b; break;
          }
        }
        if (hitChest) break;
      }
      if (hitChest) {
        const c = conns.get(primaryZoneId);
        const ox = c?.meta?.worldOffsetX || 0, oy = c?.meta?.worldOffsetY || 0;
        const distToMe = Math.hypot((ox + hitChest.x) - myAbsPredicted.x, (oy + hitChest.y) - myAbsPredicted.y);
        if (distToMe > 160) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        if (typeof openInvWithContainer === 'function') openInvWithContainer(hitChest.id);
      }
    });

    // 거래소·상자 패널 이벤트
    document.getElementById('marketBuyBtn')?.addEventListener('click', () => placeOrder('buy'));
    document.getElementById('marketSellBtn')?.addEventListener('click', () => placeOrder('sell'));
    document.getElementById('marketCloseBtn')?.addEventListener('click', toggleMarketplace);
    document.getElementById('craftCloseBtn')?.addEventListener('click', toggleCraft);
    document.getElementById('cookCloseBtn')?.addEventListener('click', toggleCookPanel);
    document.getElementById('tribeCloseBtn')?.addEventListener('click', toggleTribePanel);
    document.getElementById('chestCloseBtn')?.addEventListener('click', closeChest);
    document.getElementById('chestPutWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestPutStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'stone', amount: 1}); });
    document.getElementById('chestTakeWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestTakeStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'stone', amount: 1}); });
  }

  // 14.46-b-smooth-fix: health 폴링 실패 시 자동 중단 (TLS/HTTPS 강제 환경에서 콘솔 도배 방지)
  let healthFailCount = 0;
  let healthInterval = null;
  async function refreshHealth() {
    try {
      const r = await fetch('/health');
      const h = await r.json();
      healthFailCount = 0;
      const lines = Object.entries(h).map(([id, s]) =>
        `${id}: ${s.up ? '🟢 ' + (s.players ?? 0) + '명' : '🔴 down'}`);
      document.getElementById('health').innerText = lines.join('  ');
    } catch (e) {
      healthFailCount++;
      if (healthFailCount >= 3 && healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
        console.warn('[health] fetch 3회 실패 → 폴링 중단 (HTTPS 강제 환경)');
        const el = document.getElementById('health');
        if (el) el.innerText = '(health 폴링 비활성)';
      }
    }
  }

  // === 연결 관리 ===
  function connect(zoneId, role, transfer) {
    const existing = conns.get(zoneId);
    if (existing) {
      if (existing.role !== role) existing.role = role;
      if (role === 'primary') primaryZoneId = zoneId;
      return;
    }
    const meta = zonesMeta[zoneId];
    if (!meta) return;
    const params = new URLSearchParams();
    if (role === 'observer') {
      params.set('observer', '1');
      // observer는 자기 viewport(예측 좌표를 해당 zone-local로 변환) 전송
      const meta2 = zonesMeta[zoneId];
      if (meta2) {
        const zW2 = meta2.zoneWidth || 1024, zH2 = meta2.zoneHeight || 1024;
        params.set('vx', Math.max(0, Math.min(zW2, myAbsPredicted.x - meta2.worldOffsetX)));
        params.set('vy', Math.max(0, Math.min(zH2, myAbsPredicted.y - (meta2.worldOffsetY||0))));
      }
    } else if (transfer && transfer.token) {
      // 핸드오프는 인증 우회 — 토큰이 source 서버에서 발급한 신원 증명
      params.set('handoff_token', transfer.token);
    } else {
      // 신규 접속 — 인증 정보 전송
      if (myUsername) params.set('username', myUsername);
      if (myPassword) params.set('password', myPassword);
      params.set('name', myName);
      params.set('color', myColor);
    }
    const url = `${meta.wsUrl}/?${params.toString()}`;
    const ws = new WebSocket(url);
    const c = {
      ws, role, zoneId,
      meta: null,
      resources: new Map(),
      claims: new Map(),
      buildings: new Map(),
      mobs: new Map(),
      groundItems: new Map(), // Phase 14.23 — 바닥 떨어진 아이템
      others: new Map(),
    };
    conns.set(zoneId, c);
    if (role === 'primary') primaryZoneId = zoneId;
    ws.onmessage = (ev) => handleMessage(zoneId, JSON.parse(ev.data));
    ws.onclose = () => { if (conns.get(zoneId) === c) conns.delete(zoneId); };
    ws.onerror = () => {};
  }

  function closeConnection(zoneId) {
    const c = conns.get(zoneId);
    if (!c) return;
    try { c.ws.close(); } catch (e) {}
    conns.delete(zoneId);
  }

  function handleMessage(zoneId, msg) {
    const c = conns.get(zoneId);
    if (!c) return;

    if (msg.type === 'welcome') {
      c.meta = msg.zone;
      c.resources.clear(); c.claims.clear(); c.buildings.clear(); c.mobs.clear();
      if (c.groundItems) c.groundItems.clear();
      for (const r of (msg.resources || [])) c.resources.set(r.id, r);
      for (const cl of (msg.claims || [])) c.claims.set(cl.id, cl);
      for (const b of (msg.buildings || [])) c.buildings.set(b.id, b);
      for (const m of (msg.mobs || [])) c.mobs.set(m.mid, m);
      for (const gi of (msg.groundItems || [])) c.groundItems.set(gi.id, gi);
      // 월드 시계 동기화 — 서버 now와 클라 now 차이를 보정해서 동일 phase 계산
      if (msg.worldClock) {
        worldClock = {
          epoch: msg.worldClock.epoch,
          dayLengthMs: msg.worldClock.dayLengthMs,
          dayPhaseRatio: msg.worldClock.dayPhaseRatio,
          serverNowOffset: msg.worldClock.serverNow - Date.now(), // serverNow = clientNow + offset
        };
      }

      if (!msg.observer) {
        myPid = msg.pid;
        inventory = msg.inventory;
        if (msg.tools) tools = msg.tools;
        if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
        if (msg.equipped !== undefined) equipped = msg.equipped;
        if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
        setTimeout(() => { try { updateHotkeyBar(); } catch(e){} }, 100);
        if (msg.recipes) recipes = msg.recipes;
        if (msg.itemRecipes) itemRecipes = msg.itemRecipes;
        if (msg.buildingRecipes) buildingRecipes = msg.buildingRecipes;
        if (msg.cookRecipes) cookRecipes = msg.cookRecipes;
        if (msg.foodEffects) foodEffects = msg.foodEffects;
        if (msg.self.hp !== undefined) { myHp = msg.self.hp; myMaxHp = msg.self.maxHp; }
        if (typeof msg.self.hunger === 'number') myHunger = msg.self.hunger;
        if (typeof msg.self.thirst === 'number') myThirst = msg.self.thirst;
        if (typeof msg.self.vp === 'number') myVp = msg.self.vp;
        if (msg.self.tribeId !== undefined) myTribeId = msg.self.tribeId;
        if (msg.self.tribeName !== undefined) myTribeName = msg.self.tribeName;
        if (typeof msg.self.floor === 'number') myFloor = msg.self.floor;
        // 14.42-a — home 위치 (없으면 null)
        myHomeZone = msg.self.homeZone || null;
        myHomeX = (typeof msg.self.homeX === 'number') ? msg.self.homeX : null;
        myHomeY = (typeof msg.self.homeY === 'number') ? msg.self.homeY : null;
        const absX = msg.zone.worldOffsetX + msg.self.x;
        const absY = (msg.zone.worldOffsetY || 0) + msg.self.y;
        myAbsPos = { x: absX, y: absY };
        if (!initialWelcomeReceived) {
          myAbsPredicted = { x: absX, y: absY };
          initialWelcomeReceived = true;
        } else {
          applyServerCorrection(absX, absY);
        }
        lastTickWithMyPidAt = performance.now();
        updateHud();
      }
    } else if (msg.type === 'tick') {
      const now = performance.now();
      if (c.role === 'primary') {
        if (lastTickAt) lastServerPingMs = now - lastTickAt;
        lastTickAt = now;
        // 14.49-c: 계단 z (0~32) — 서버 권위 값을 클라가 부드럽게 따라감
        if (typeof msg.selfZ === 'number') myStairZ = msg.selfZ;
      }
      for (const pp of msg.players) {
        if (pp.pid === myPid && c.role === 'primary') {
          const absX = c.meta.worldOffsetX + pp.x;
          const absY = (c.meta.worldOffsetY || 0) + pp.y;
          myAbsPos = { x: absX, y: absY };
          applyServerCorrection(absX, absY);
          lastTickWithMyPidAt = now;
        } else {
          // 서버가 메타 필드(name/color/maxHp/tribeName)를 첫 visible 때만 보냄. 나머진 prev 캐시 유지.
          const prev = c.others.get(pp.pid);
          const buf = prev?.buf || [];
          pushSample(buf, now, pp.x, pp.y);
          const vxNow = pp.vx || 0, vyNow = pp.vy || 0;
          const fvxKeep = (vxNow !== 0 || vyNow !== 0) ? vxNow : (prev?._fvx || 1);
          const fvyKeep = (vxNow !== 0 || vyNow !== 0) ? vyNow : (prev?._fvy || 0);
          c.others.set(pp.pid, {
            pid: pp.pid,
            x: pp.x, y: pp.y,
            z: pp.z || 0, // 14.49-d: 계단 위 z
            floor: pp.floor || 0,
            vx: vxNow, vy: vyNow,
            _fvx: fvxKeep, _fvy: fvyKeep, // Phase 14.37: 마지막 facing
            name: pp.name ?? prev?.name ?? '?',
            color: pp.color ?? prev?.color ?? '#5a9ae0',
            hp: pp.hp,
            maxHp: pp.maxHp ?? prev?.maxHp ?? 100,
            tribeName: pp.tribeName !== undefined ? pp.tribeName : prev?.tribeName,
            buf,
            lastX: prev?.x ?? pp.x, lastY: prev?.y ?? pp.y,
            lastT: now,
            lastAttackAt: prev?.lastAttackAt || 0,
          });
          // Phase 14.41: tick에 isDown=1 있으면 다운 상태 갱신 (보강 — broadcast 누락 대비)
          if (pp.isDown) downStates.set(pp.pid, true);
          else if (pp.isDown === undefined && downStates.has(pp.pid)) {
            // tick은 absent 키를 못 보냄. player_down_state로만 해제됨.
          }
        }
      }
      const alive = new Set(msg.players.map(p => p.pid));
      for (const pid of c.others.keys()) if (!alive.has(pid)) { c.others.delete(pid); downStates.delete(pid); }
      // mob 갱신 (tick에 포함된 것)
      if (Array.isArray(msg.mobs)) {
        const aliveMobs = new Set(msg.mobs.map(m => m.mid));
        for (const m of msg.mobs) {
          // mob도 메타(type/maxHp/tameOwner)는 첫 visible 때만. 나머지엔 prev 유지.
          const prev = c.mobs.get(m.mid);
          const buf = prev?.buf || [];
          pushSample(buf, now, m.x, m.y);
          const mvx = m.vx || 0, mvy = m.vy || 0;
          c.mobs.set(m.mid, {
            mid: m.mid,
            x: m.x, y: m.y,
            z: m.z || 0, floor: m.floor || 0, // 14.49-d
            vx: mvx, vy: mvy,
            _fvx: (mvx !== 0 || mvy !== 0) ? mvx : (prev?._fvx || 1),
            _fvy: (mvx !== 0 || mvy !== 0) ? mvy : (prev?._fvy || 0),
            hp: m.hp,
            type: m.type ?? prev?.type ?? 'deer',
            maxHp: m.maxHp ?? prev?.maxHp ?? 10,
            tameOwner: m.tameOwner !== undefined ? m.tameOwner : prev?.tameOwner,
            tameOwnerName: m.tameOwnerName !== undefined ? m.tameOwnerName : prev?.tameOwnerName,
            buf,
            lastX: prev?.x ?? m.x, lastY: prev?.y ?? m.y,
            lastT: now,
          });
        }
        // AOI 시야 밖으로 나간 mob 정리 (tick에 없으면 제거)
        for (const mid of c.mobs.keys()) if (!aliveMobs.has(mid)) c.mobs.delete(mid);
      }
    } else if (msg.type === 'inventory') {
      inventory = msg.inventory; updateHud(); renderCraftPanel(); if (cookOpen) renderCookPanel();
    } else if (msg.type === 'tools_update' || msg.type === 'tools') {
      // 14.53: toolItems 리스트 + equipped (instance id) + hotkey1
      if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
      if (msg.tools) tools = msg.tools; // 옛 호환
      if (msg.equipped !== undefined) equipped = msg.equipped;
      if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
      updateHotkeyBar();
      updateHud(); renderCraftPanel();
      // 좌측 sidePanel craft 열려있으면 갱신
      const sp = document.getElementById('sidePanel');
      if (sp && sp.classList.contains('open')) {
        const spBody = document.getElementById('spBody');
        if (spBody && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody);
      }
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'resource_removed') {
      c.resources.delete(msg.id);
    } else if (msg.type === 'resource_update') {
      const r = c.resources.get(msg.id); if (r) r.hp = msg.hp;
    } else if (msg.type === 'resource_spawn') {
      c.resources.set(msg.resource.id, msg.resource);
    } else if (msg.type === 'claim_added') {
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'claim_removed') {
      c.claims.delete(msg.id);
    } else if (msg.type === 'building_added') {
      c.buildings.set(msg.building.id, msg.building);
      if (msg.building.type === 'stair') clStairCacheBuildAt = 0;
      if (msg.building.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에 즉시 추가 + 양옆 room invalidate + 즉시 BFS
        const b = msg.building;
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.set(`${absCx}_${absCy}_${side}_${f}`, true);
          invalidateRoomsAroundWall(absCx, absCy, side, f);
        }
      }
    } else if (msg.type === 'building_removed') {
      const b = c.buildings.get(msg.id);
      if (b?.type === 'stair') clStairCacheBuildAt = 0;
      if (b?.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에서 즉시 제거 + 양옆 room invalidate + 즉시 BFS
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.delete(`${absCx}_${absCy}_${side}_${f}`);
          invalidateRoomsAroundWall(absCx, absCy, side, f);
        }
      }
      c.buildings.delete(msg.id);
    } else if (msg.type === 'building_updated') {
      // 14.50: door open/close 등 building data 변경. wall cache 무효화 (door state 영향).
      const b = c.buildings.get(msg.building.id);
      if (b) {
        b.data = msg.building.data;
        if (b.type === 'door') clWallMapBuiltAt = 0; // door state 변경 → cache 재빌드
      }
    } else if (msg.type === 'ground_item_added') {
      if (c.groundItems) c.groundItems.set(msg.gi.id, msg.gi);
    } else if (msg.type === 'ground_item_removed') {
      if (c.groundItems) c.groundItems.delete(msg.id);
    } else if (msg.type === 'player_attacked') {
      // Phase 14.35: 다른 player 공격 모션 — others에서 그 pid 찾아 lastAttackAt 저장
      for (const con of conns.values()) {
        const o = con.others?.get(msg.pid);
        if (o) o.lastAttackAt = performance.now();
      }
    } else if (msg.type === 'building_damaged') {
      const b = c.buildings.get(msg.id);
      if (b) {
        b.data = b.data || {};
        b.data.hp = msg.hp;
        b.data.damaged = msg.damaged;
      }
    } else if (msg.type === 'mob_damaged') {
      const m = c.mobs.get(msg.mid); if (m) m.hp = msg.hp;
    } else if (msg.type === 'mob_removed') {
      c.mobs.delete(msg.mid);
    } else if (msg.type === 'mob_spawn') {
      c.mobs.set(msg.mob.mid, msg.mob);
    } else if (msg.type === 'mob_tamed') {
      const m = c.mobs.get(msg.mid);
      if (m) { m.tameOwner = msg.owner; m.tameOwnerName = msg.ownerName; }
    } else if (msg.type === 'player_damaged') {
      if (msg.pid === myPid) { myHp = msg.hp; updateHud(); }
      else {
        const o = c.others.get(msg.pid); if (o) o.hp = msg.hp;
      }
    } else if (msg.type === 'player_respawn') {
      if (msg.pid === myPid) {
        myHp = msg.hp;
        // Phase 14.41: 부활 → 다운 상태 해제
        myIsDown = false;
        myDownedAt = 0;
        myRespawnOptions = [];
        hideDownPanel();
        // 서버가 자기 사유지 좌표로 텔레포트했으니 클라 좌표도 즉시 동기화
        if (msg.x !== undefined && c.meta) {
          const absX = c.meta.worldOffsetX + msg.x;
          const absY = (c.meta.worldOffsetY || 0) + msg.y;
          myAbsPos = { x: absX, y: absY };
          myAbsPredicted = { x: absX, y: absY };
          correctionVel = { x: 0, y: 0 };
          correctionUntil = 0;
        }
        updateHud();
      } else {
        downStates.delete(msg.pid); // 다른 사람도 부활하면 down 해제
      }
    } else if (msg.type === 'player_downed') {
      // Phase 14.41: 본인 사망 — 부활 패널 표시
      if (msg.pid === myPid) {
        myIsDown = true;
        myDownedAt = performance.now();
        myDownRescueWindowMs = msg.rescueWindowMs || 10000;
        myRespawnOptions = msg.options || [];
        showDownPanel();
      }
    } else if (msg.type === 'player_down_state') {
      // 다른 사람 다운/일어남 상태 (시각용)
      if (msg.pid === myPid) {
        // 본인은 player_downed/respawn 로직으로 처리. 여기선 안 변경
      } else {
        if (msg.isDown) downStates.set(msg.pid, true);
        else downStates.delete(msg.pid);
      }
    } else if (msg.type === 'chest_state') {
      // 상자 UI에 반영
      window.__lastChestState = msg;
      renderChestUi(msg.buildingId, msg.data);
    } else if (msg.type === 'player_left') {
      c.others.delete(msg.pid);
    } else if (msg.type === 'gauges') {
      if (typeof msg.hunger === 'number') myHunger = msg.hunger;
      if (typeof msg.thirst === 'number') myThirst = msg.thirst;
      if (typeof msg.vp === 'number') myVp = msg.vp;
      updateHud();
    } else if (msg.type === 'pvp_state') {
      myPvpEnabled = !!msg.enabled;
      updateHud();
    } else if (msg.type === 'floor_changed') {
      myFloor = msg.floor;
      updateHud();
    } else if (msg.type === 'handoff') {
      // 서버가 발급한 토큰으로 새 zone에 접속.
      const target = msg.targetZone;
      const token = msg.token;
      if (target === primaryZoneId) return;
      if (!zonesMeta[target]) return;
      console.log('[handoff]', primaryZoneId, '→', target, 'token=', token.slice(0,8));
      const oldPrimary = primaryZoneId;
      primaryZoneId = target;

      // ★ observer로 미리 연결된 ws가 있으면 promote만 — 새 ws 안 만듦 → 끊김 ~0
      const existingTarget = conns.get(target);
      if (existingTarget && existingTarget.role === 'observer' && existingTarget.ws.readyState === 1) {
        console.log('[handoff] ✨ promote existing observer ws');
        existingTarget.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
        existingTarget.role = 'primary';
        // server가 welcome 보낼 거 — 기존 handleMessage('welcome')에서 처리
      } else {
        // observer 미리 연결 안 됐으면 새 ws 만들기 (기존 흐름)
        if (existingTarget) closeConnection(target);
        connect(target, 'primary', { token });
      }
      // 옛 primary observer로 demote — broadcast 갭 줄임
      const oldConn = conns.get(oldPrimary);
      if (oldConn) oldConn.role = 'observer';
      showNotice(zonesMeta[target].displayName);
    } else if (msg.type === 'kicked') {
      // 다른 곳에서 로그인되어 강제 종료
      kicked = true;
      const reasonMap = { duplicate_login: '다른 곳에서 로그인되어 종료되었습니다.' };
      const text = reasonMap[msg.reason] || `종료 사유: ${msg.reason}`;
      console.warn('[kicked]', text);
      // 모든 연결 정리 후 로비로
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'zone_full') {
      // zone 가득 참 — 로비로 복귀 + 알림
      const text = `${zonesMeta[msg.zone]?.displayName || msg.zone} 가득 참 (${msg.current}/${msg.cap}명). 다른 zone 선택.`;
      console.warn('[zone_full]', text);
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      // zone 인구 강제 새로고침
      fetch('/zones').then(r => r.json()).then(d => { zonesMeta = d.zones; }).catch(() => {});
      return;
    } else if (msg.type === 'auth_error') {
      // 로비로 복귀, 에러 표시
      const reasonMap = {
        wrong_password: '패스워드가 틀렸습니다.',
        username_taken: '이미 사용 중인 이름입니다.',
      };
      const text = reasonMap[msg.reason] || `인증 실패: ${msg.reason}`;
      console.warn('[auth]', text);
      // 연결 종료, 게임 화면 → 로비
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'pong') {
      // 14.43: watchdog용 — 최근 pong 시각 기록
      c.lastPongAt = performance.now();
      if (c.role === 'primary') lastRttMs = c.lastPongAt - msg.t;
    } else if (msg.type === 'chat') {
      // 같은 zone(또는 observer zone)에서 온 채팅. 길드 채팅이면 prefix 표시.
      const prefix = msg.tribe ? `[길드:${msg.tribe}] ` : '';
      chatLog.push({ name: prefix + msg.name, color: msg.color || '#5a9ae0', text: msg.text, t: msg.t, isTribe: !!msg.tribe });
      if (chatLog.length > 20) chatLog.shift();
      speechBubbles.set(msg.pid, { text: (msg.tribe ? '🛡️ ' : '') + msg.text, until: performance.now() + 4000 });
      renderChatLog();
    } else if (msg.type === 'notice') {
      showNotice(msg.text);
    }
  }

  // === 인접 존 자동 구독/해제 ===
  // 시야 반경(VIEW_RADIUS=650) + 여유 = 800. 시야에 들어오기 전에 미리 구독.
  const PEEK_THRESHOLD = 900;  // 이웃 zone 경계에서 이만큼 안쪽에 있으면 observer 미리 연결
  function manageNeighborSubscriptions() {
    if (!primaryZoneId) return;
    const pmeta = zonesMeta[primaryZoneId];
    if (!pmeta) return;
    const pMeta = zonesMeta[primaryZoneId];
    const zoneW = pMeta?.zoneWidth || 1024, zoneH = pMeta?.zoneHeight || 1024;
    const localX = myAbsPredicted.x - pmeta.worldOffsetX;
    const localY = myAbsPredicted.y - (pmeta.worldOffsetY || 0);
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
      const nZoneW = zm.zoneWidth || 1024;
      const nZoneH = zm.zoneHeight || 1024;
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

  // === 입력 전송 ===
  let lastInputSentAt = 0;
  function sendInput() {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    // Phase 14.41: 다운 중이면 입력 전송 X (서버도 무시하지만 트래픽 줄임)
    if (myIsDown) {
      c.ws.send(JSON.stringify({ type: 'input', vx: 0, vy: 0, sprint: false }));
      lastInputSentAt = performance.now();
      return;
    }
    const { wx, wy } = worldKeysDir();
    // Phase 14.40: Shift = sprint. 게이지 너무 낮으면 서버에서 자동 거부.
    c.ws.send(JSON.stringify({ type: 'input', vx: wx, vy: wy, sprint: !!mySprint }));
    lastInputSentAt = performance.now();
  }

  // Phase 14.41: 근처 다운된 같은 길드원 찾기 (RESCUE_RANGE_PX = 80)
  function findNearestDownedGuildmate() {
    if (!myTribeId) return null;
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      if (!c.others) continue;
      for (const o of c.others.values()) {
        if (!downStates.get(o.pid)) continue;
        if (!o.tribeName || o.tribeName !== myTribeName) continue;
        const ax = (c.meta?.worldOffsetX || 0) + o.x;
        const ay = (c.meta?.worldOffsetY || 0) + o.y;
        const d = Math.hypot(myAbsPredicted.x - ax, myAbsPredicted.y - ay);
        if (d < bestD) { best = o; bestD = d; }
      }
    }
    return best;
  }

  // === 메인 루프 ===
  let prevT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;

    if (now - lastInputSentAt > 33) sendInput();

    // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
    // primary zone의 buildings + 이웃 zone들도 검사 (zone 경계 cross 시).
    // wall은 cell edge에 있음 (data.side ∈ {N, E}). cell 가로지를 때만 검사.
    // BUILDING_SIZE = 32 (server와 동일).
    // 인라인 함수 X — 매 프레임 만들기 비싸서 위에 한 번 정의함

    // 클라이언트 예측: 입력으로 즉시 반응 (시각 부드러움)
    // Phase 13.9.a: wall edge 콜라이더 클라 사이드 복제 — 서버와 동일 로직
    const { wx, wy } = worldKeysDir();
    if (!myIsDown && (wx !== 0 || wy !== 0)) {
      // Phase 14.40: Shift 달리기 — 클라 예측도 1.6× (게이지 5 이하면 자동 해제)
      const canSprintClient = mySprint && myHunger > 5 && myThirst > 5;
      const speed = 220 * (canSprintClient ? 1.6 : 1);
      // 14.53-j: stair cell 안이면 dir 축으로 projection (server와 동일 — 떨림 차단)
      let mwx = wx, mwy = wy;
      {
        const curCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
        const curCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
        const stairHit = clFindStairForCell(curCx, curCy);
        if (stairHit) {
          const dir = stairHit.stair.data?.dir || 'N';
          const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
                   : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
          const proj = mwx * dv.x + mwy * dv.y;
          mwx = proj * dv.x;
          mwy = proj * dv.y;
        }
      }
      let nx = myAbsPredicted.x + mwx * speed * dt;
      let ny = myAbsPredicted.y + mwy * speed * dt;
      // 각 축 별로 wall check (slide 가능)
      if (clientIsBlockedByWall(nx, myAbsPredicted.y, myAbsPredicted.x, myAbsPredicted.y, myFloor)) nx = myAbsPredicted.x;
      if (clientIsBlockedByWall(myAbsPredicted.x, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) ny = myAbsPredicted.y;
      if (clientIsBlockedByWall(nx, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      // 14.46-b-mini: 물 타일 진입 차단 (보트 없을 때)
      if (isWaterAtAbs(nx, myAbsPredicted.y) && !isWaterAtAbs(myAbsPredicted.x, myAbsPredicted.y)) nx = myAbsPredicted.x;
      if (isWaterAtAbs(myAbsPredicted.x, ny) && !isWaterAtAbs(myAbsPredicted.x, myAbsPredicted.y)) ny = myAbsPredicted.y;
      if (isWaterAtAbs(nx, ny) && !isWaterAtAbs(myAbsPredicted.x, myAbsPredicted.y)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      myAbsPredicted.x = nx;
      myAbsPredicted.y = ny;
    }
    // 서버 권위 좌표로의 부드러운 보정 (snap 대신 lerp)
    if (now < correctionUntil) {
      myAbsPredicted.x += correctionVel.x * dt;
      myAbsPredicted.y += correctionVel.y * dt;
    }
    // 전체 월드 그리드 안으로만 clamp (2x2면 0~2048)
    myAbsPredicted.x = Math.max(0, Math.min(worldWidth - 1, myAbsPredicted.x));
    myAbsPredicted.y = Math.max(0, Math.min(worldHeight - 1, myAbsPredicted.y));

    ensurePrimaryConnection();
    checkOrphan();
    manageNeighborSubscriptions();
    render();
    drawBuildOverlay(); // 14.51: hover outline
    drawPlacementGhost(); // 14.53-i: placement 시 실루엣 미리보기
    updateBuildProgressEl(); // 14.51: 3초 progress bar (DOM)
    updateMinimap();
    requestAnimationFrame(loop);
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
      // ramp 사선 (옆면 위→아래 시각)
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(fbr.x, fbr.y);
      ctx.stroke();
      // auto floor 박스 (cell 3, floor+1) — stair 박스 위층 끝 옆에 붙음
      const autoFloorId = b.data?._autoFloorId;
      if (autoFloorId) {
        const fStart = 80,  fEnd = 80 + 32; // cell 3 (along dir axis)
        const afBot = H_FLOOR, afTop = H_FLOOR + 6; // 위층 floor 두께
        const af_ntl = c(fStart, -half, afTop), af_ntr = c(fStart, half, afTop);
        const af_ftl = c(fEnd,  -half, afTop), af_ftr = c(fEnd,  half, afTop);
        const af_nbl = c(fStart, -half, afBot), af_nbr = c(fStart, half, afBot);
        const af_fbl = c(fEnd,  -half, afBot), af_fbr = c(fEnd,  half, afBot);
        ctx.beginPath();
        ctx.moveTo(af_ntl.x, af_ntl.y); ctx.lineTo(af_ntr.x, af_ntr.y);
        ctx.lineTo(af_ftr.x, af_ftr.y); ctx.lineTo(af_ftl.x, af_ftl.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(af_nbl.x, af_nbl.y); ctx.lineTo(af_nbr.x, af_nbr.y);
        ctx.lineTo(af_fbr.x, af_fbr.y); ctx.lineTo(af_fbl.x, af_fbl.y); ctx.closePath();
        ctx.stroke();
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
    const label = (ITEM_LABEL['item_' + b.type] || b.type);
    const cycleHint = hoverList.length > 1 ? ` [${hoverIndex+1}/${hoverList.length}] 휠로 변경` : '';
    ctx.fillText(`🔧 ${label} 분해 (클릭, 3초)${cycleHint}`, sx, sy - 60);
    ctx.restore();
  }
  // 14.53-i: placement ghost — 마우스 위치에 실루엣 미리보기
  function drawPlacementGhost() {
    if (!placementMode || !placementMode.itemType) return;
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
    ctx.save();
    const t = (Date.now() % 1000) / 1000;
    const a = 0.35 + 0.25 * Math.abs(Math.sin(t * Math.PI));
    ctx.fillStyle = `rgba(120,200,255,${a})`;
    ctx.strokeStyle = `rgba(180,230,255,${a + 0.3})`;
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
      // ramp 사선
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(fbr.x, fbr.y);
      ctx.stroke();
      // auto floor cell 3, floor+1
      const fStart = 80, fEnd = 80 + 32;
      const afBot = H_FLOOR, afTop = H_FLOOR + 6;
      const af_ntl = cc(fStart, -half, afTop), af_ntr = cc(fStart, half, afTop);
      const af_ftl = cc(fEnd, -half, afTop), af_ftr = cc(fEnd, half, afTop);
      const af_nbl = cc(fStart, -half, afBot), af_nbr = cc(fStart, half, afBot);
      const af_fbl = cc(fEnd, -half, afBot), af_fbr = cc(fEnd, half, afBot);
      ctx.beginPath();
      ctx.moveTo(af_ntl.x, af_ntl.y); ctx.lineTo(af_ntr.x, af_ntr.y);
      ctx.lineTo(af_ftr.x, af_ftr.y); ctx.lineTo(af_ftl.x, af_ftl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(af_nbl.x, af_nbl.y); ctx.lineTo(af_nbr.x, af_nbr.y);
      ctx.lineTo(af_fbr.x, af_fbr.y); ctx.lineTo(af_fbl.x, af_fbl.y); ctx.closePath();
      ctx.stroke();
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
  function ensurePrimaryConnection() {
    if (kicked) return;
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState <= 1) return;
    const pm = zonesMeta[primaryZoneId];
    if (!pm) return;
    if (c) conns.delete(primaryZoneId);
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
  // kicked 상태에선 자동 재연결 안 함
  let kicked = false;
  // loop/setupChat 중복 시작 방지
  let loopStarted = false;
  let chatSetup = false;

  // === 서버 권위 좌표 → 클라 예측 보정 ===
  // Phase 14.46-b-smooth: 임계 16 → 48 (1.5 tile). 평지에서 RTT 지터로 인한 작은 드리프트는 무시.
  // 너무 빡빡하면 walking 중 자주 짧게 뒤로 밀려나는 느낌 발생. wall stuck은 50~100px 차이라 여전히 감지됨.
  // - <48px: 무시 (정상 lag 드리프트)
  // - 48~500px: lerp (150ms — 부드럽게)
  // - >500px: 즉시 snap
  function applyServerCorrection(absX, absY) {
    const ex = absX - myAbsPredicted.x, ey = absY - myAbsPredicted.y;
    const dist = Math.hypot(ex, ey);
    if (dist > 500) {
      myAbsPredicted = { x: absX, y: absY };
      correctionVel = { x: 0, y: 0 };
      correctionUntil = 0;
    } else if (dist > 48) {
      const T = 0.15; // 150ms — 부드러운 보정
      correctionVel.x = ex / T;
      correctionVel.y = ey / T;
      correctionUntil = performance.now() + T * 1000;
    } else {
      correctionVel = { x: 0, y: 0 };
      correctionUntil = 0;
    }
  }

  // === Orphan 감지 — 서버에서 내 플레이어가 사라졌는데 클라는 모르는 경우 ===
  // 2초간 내 pid가 tick에 안 들어오면 primary 재연결
  function checkOrphan() {
    if (!primaryZoneId || lastTickWithMyPidAt === 0) return;
    if (performance.now() - lastTickWithMyPidAt > 2000) {
      console.warn('[recover] 내 pid가 2초간 tick에 없음 - primary 재연결');
      lastTickWithMyPidAt = performance.now(); // 무한루프 방지
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

    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const camX = myIso.x, camY = myIso.y;
    const toScreen = (ix, iy) => ({ x: ix - camX + W / 2, y: iy - camY + H / 2 });

    // 배경 — 검정 (시야 밖)
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, W, H);

    const TS = pConn.meta.tileSize;
    const worldCx = myAbsPredicted.x, worldCy = myAbsPredicted.y;
    const VIEW_RADIUS = 650;
    // 14.49-e6e: 타일은 화면 전체 덮는 더 큰 범위로 그림 (1500px).
    // 그래야 vignette 가장자리가 셀 stairstep 안 보임 (타일 없는 빈 영역의 boundary가 hard edge).
    const TILE_RENDER_RADIUS = 1500;

    // === 1) 지면 다이아몬드 타일 ===
    const t0WX = Math.floor((worldCx - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + TILE_RENDER_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + TILE_RENDER_RADIUS) / TS) * TS;

    for (let wx = t0WX; wx < t1WX; wx += TS) {
      for (let wy = t0WY; wy < t1WY; wy += TS) {
        // 2x2 그리드 — 어떤 zone에 속하는지 X·Y 둘 다 확인
        let zMeta = null;
        for (const zm of Object.values(zonesMeta)) {
          const ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
          const zW3 = zm.zoneWidth || 1024, zH3 = zm.zoneHeight || 1024;
          if (wx >= ox && wx < ox + zW3 && wy >= oy && wy < oy + zH3) { zMeta = zm; break; }
        }
        const iso = w2i(wx + TS / 2, wy + TS / 2);
        const s = toScreen(iso.x, iso.y);
        const cellWx = wx + TS/2 - worldCx;
        const cellWy = wy + TS/2 - worldCy;
        const dist = Math.hypot(cellWx, cellWy);
        // 14.49-e6f: zone 정보 없어도 placeholder dark tile 그림 (canvas 배경 노출 방지 = stairstep 없앰)
        let visibility = 1;
        if (dist > TILE_RENDER_RADIUS) continue;
        if (!zMeta) {
          // 14.49-e7g: primary zone groundColor로 placeholder (색 차이 stairstep 제거)
          const fallback = (primaryZoneId && zonesMeta[primaryZoneId]?.groundColor) || '#3a5a3a';
          drawDiamond(s.x, s.y, TS, fallback);
          continue;
        }
        // 14.49-e7g: LoS shadow도 일단 끔 (셀 stairstep 원인 후보). vignette만으로 시야 제어.
        // (벽 너머 가시성은 추후 polygon shadow로 재구현 필요)
        // 14.49-e7f: per-tile cone 제거됨. directional shadow는 vignette 단계에서 픽셀 단위.

        // 14.49-e7h: per-tile noise variation 제거 (셀 mosaic = stairstep 원인). 단조하지만 깔끔.
        const isWater = isWaterAtAbs(wx + TS/2, wy + TS/2);
        let tileColor, tintColor, tintStrength;
        if (isWater) {
          tileColor = zMeta.isOcean ? zMeta.groundColor : '#2a5a8a';
          tintColor = zMeta.isOcean ? zMeta.tintColor : '#1a4a7a';
          tintStrength = 0.07; // 고정 (옛 0.04~0.10 → 평균)
        } else {
          tileColor = latitudeColor(wy + TS/2, worldHeight, zMeta.groundColor);
          const distFromPole = Math.min(wy + TS/2, worldHeight - (wy + TS/2));
          const isIce = distFromPole <= ICE_BAND_PX;
          tintColor = isIce ? '#9bb5cc' : zMeta.tintColor;
          tintStrength = isIce ? 0.06 : 0.13; // 고정 (옛 평균값)
        }
        ctx.globalAlpha = visibility;
        drawDiamond(s.x, s.y, TS, tileColor);
        ctx.globalAlpha = visibility * tintStrength;
        drawDiamond(s.x, s.y, TS, tintColor);
        ctx.globalAlpha = 1;
      }
    }

    // === 2) 엔티티 수집 (depth sort용) ===
    const renderables = [];
    const renderT = performance.now() - INTERP_DELAY_MS;

    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      for (const r of c.resources.values()) {
        const ax = ox + r.x, ay = oy + r.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        renderables.push({ z: iso.y, kind: 'resource', r, iso, ax, ay });
      }
      // Phase 14.23: ground item 렌더
      if (c.groundItems) {
        for (const gi of c.groundItems.values()) {
          const ax = ox + gi.x, ay = oy + gi.y;
          if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
          const iso = w2i(ax, ay);
          renderables.push({ z: iso.y + 5, kind: 'ground_item', gi, iso, ax, ay });
        }
      }
      for (const cl of c.claims.values()) {
        // guild claim은 가장 배경(z 가장 작게)으로 — 너무 많아서 다른 거 가리지 않게
        const cax = ox + cl.x + cl.w/2, cay = oy + cl.y + cl.h/2;
        if (Math.abs(cax - worldCx) > VIEW_RADIUS + 200 || Math.abs(cay - worldCy) > VIEW_RADIUS + 200) continue;
        const baseZ = cl.kind === 'guild' ? -800 : -400;
        renderables.push({ z: w2i(cax, cay).y + baseZ, kind: 'claim', cl, off: ox, offY: oy });
      }
      for (const b of c.buildings.values()) {
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
              kind: 'stair_cell', b, iso, ax: cAx, ay: cAy, cellN, dv,
            });
          }
          continue;
        } else {
          ax = ox + b.x; ay = oy + b.y;
        }
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const bZ = (b.floor || 0) * FLOOR_HEIGHT;
        const iso = w2i(ax, ay, bZ);
        renderables.push({ z: (ax + ay) * 0.5 + (b.floor || 0) * 0.5, kind: 'building', b, iso, ax, ay });
      }
      for (const m of c.mobs.values()) {
        const pos = sampleAt(m.buf, renderT, m.x, m.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        // 14.49-d: mob도 floor*FLOOR_HEIGHT + z 적용 (계단 위 추격 시 위로 솟음)
        const mFloor = m.floor || 0;
        const mZ = mFloor * FLOOR_HEIGHT + (m.z || 0);
        const iso = w2i(ax, ay, mZ);
        renderables.push({ z: iso.y, kind: 'mob', m, iso, ax, ay });
      }
      for (const o of c.others.values()) {
        const pos = sampleAt(o.buf, renderT, o.x, o.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        const displayName = o.tribeName ? `[${o.tribeName}] ${o.name}` : o.name;
        const oFloor = o.floor || 0;
        const oZ = oFloor * FLOOR_HEIGHT + (o.z || 0); // 14.49-d: 계단 위 z 포함
        const isoF = w2i(ax, ay, oZ);
        renderables.push({ z: (ax + ay) * 0.5 + oFloor * 0.5 + 500, kind: 'player', pid: o.pid, name: displayName, color: o.color || '#5a9ae0', hp: o.hp, maxHp: o.maxHp, iso: isoF, ax, ay, floor: oFloor, lastAttackAt: o.lastAttackAt, vx: o.vx, vy: o.vy, _fvx: o._fvx, _fvy: o._fvy });
      }
    }
    {
      const iso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const myDisplay = myTribeName ? `[${myTribeName}] ${myName}` : myName;
      const myZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0); // 14.49-c: 계단 z 추가
      const isoMe = w2i(myAbsPredicted.x, myAbsPredicted.y, myZ);
      renderables.push({ z: (myAbsPredicted.x + myAbsPredicted.y) * 0.5 + myFloor * 0.5 + 500, kind: 'player', pid: myPid, name: myDisplay, color: myColor, hp: myHp, maxHp: myMaxHp, iso: isoMe, ax: myAbsPredicted.x, ay: myAbsPredicted.y, isMe: true });
    }

    renderables.sort((a, b) => a.z - b.z);

    // 14.49-e7ab/ag: 위층 BFS cutaway
    const _renderMyCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const _renderMyCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    const aboveCutawayWalls = computeAboveCutawayWalls(_renderMyCx, _renderMyCy, myFloor);
    const aboveCutawayCells = computeAboveCutawayCells(_renderMyCx, _renderMyCy, myFloor);

    // 14.49-e7ae: mask composite를 entity render 전으로 (entity가 mask 위에 = mask 영향 X)
    // mask 자체는 entity render 후에 만들어짐 (현재 위치 그대로). 즉 1 frame 지연.
    // window._shadowMask가 persistent canvas라 이전 frame mask가 보존됨. 첫 frame은 빈 mc (transparent).
    if (window._shadowMask) ctx.drawImage(window._shadowMask, 0, 0);

    // === 3) 엔티티 그리기 ===
    for (const item of renderables) {
      if (item.kind === 'claim') {
        const cl = item.cl, off = item.off, offY = item.offY || 0;
        const p1 = w2i(off + cl.x,         offY + cl.y);
        const p2 = w2i(off + cl.x + cl.w,  offY + cl.y);
        const p3 = w2i(off + cl.x + cl.w,  offY + cl.y + cl.h);
        const p4 = w2i(off + cl.x,         offY + cl.y + cl.h);
        const s1 = toScreen(p1.x, p1.y), s2 = toScreen(p2.x, p2.y);
        const s3 = toScreen(p3.x, p3.y), s4 = toScreen(p4.x, p4.y);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y); ctx.lineTo(s4.x, s4.y); ctx.closePath();
        // Phase 14.18.b: kind별 색상 — guild(파랑)/personal(노랑)/temporary(주황)
        let fill, stroke, label;
        if (cl.kind === 'guild') {
          fill = 'rgba(90, 154, 224, 0.10)'; stroke = 'rgba(90, 154, 224, 0.45)';
          label = `🏛️ ${cl.guildTribeName || cl.ownerName}`;
        } else if (cl.kind === 'temporary') {
          fill = 'rgba(220, 130, 60, 0.16)'; stroke = 'rgba(220, 130, 60, 0.7)';
          label = `⛺ ${cl.ownerName}`;
        } else { // personal
          fill = 'rgba(240, 198, 116, 0.18)'; stroke = 'rgba(240, 198, 116, 0.8)';
          label = `🏠 ${cl.ownerName}`;
        }
        ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        if (cl.kind === 'guild') ctx.setLineDash([]); // 길드 = 실선
        else ctx.setLineDash([6, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        // 라벨은 guild는 너무 많아서 생략, personal/temporary만
        if (cl.kind !== 'guild') {
          ctx.fillStyle = stroke; ctx.font = '11px sans-serif';
          ctx.fillText(label, s1.x + 6, s1.y + 14);
        }
      } else if (item.kind === 'resource') {
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // Phase 14.39: 자원도 entity — 시야 뒤면 안 보임. 단 거리 vignette는 부드럽게.
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        if (item.r.type === 'tree') drawTreeIso(s.x, s.y);
        else if (item.r.type === 'rock') drawRockIso(s.x, s.y);
        else if (item.r.type === 'berry_bush') drawBerryBushIso(s.x, s.y);
        else if (item.r.type === 'water_pool') drawWaterPoolIso(s.x, s.y);
        else if (item.r.type === 'herb') drawHerbIso(s.x, s.y);
        else if (item.r.type === 'ore') drawOreIso(s.x, s.y);
        if (item.r.hp < item.r.maxHp) {
          const pct = item.r.hp / item.r.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(s.x - 10, s.y - 28, 20, 3);
          ctx.fillStyle = '#9adb6e'; ctx.fillRect(s.x - 10, s.y - 28, 20 * pct, 3);
        }
        ctx.globalAlpha = 1;
      } else if (item.kind === 'ground_item') {
        const s = toScreen(item.iso.x, item.iso.y);
        const gi = item.gi;
        // Phase 14.39: 바닥 아이템도 entity cone
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        const vis = entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        const icon = (ITEM_ICONS && ITEM_ICONS[gi.item]) || ({wood:'🪵',stone:'🪨'}[gi.item]) || '📦';
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // 아이콘
        ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, s.x, s.y - 4);
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
          if (moving) { myFacingVx = wx; myFacingVy = wy; }
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
        drawPlayerIso(s.x, s.y, item.name, item.color, item.isMe, { moving, attackPhase, fvx, fvy, isDown: downFlag });
        // HP bar for others
        if (!item.isMe) {
          const o = item.hp !== undefined ? item : null;
          if (o && o.hp !== undefined && o.maxHp && o.hp < o.maxHp) {
            ctx.fillStyle = '#222'; ctx.fillRect(s.x - 14, s.y - 30, 28, 4);
            ctx.fillStyle = '#d85a5a'; ctx.fillRect(s.x - 14, s.y - 30, 28 * (o.hp / o.maxHp), 4);
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
        else if (bf > myFloor) {
          if (bType === 'floor') {
            const cx = Math.floor(item.ax / CL_BUILDING_SIZE);
            const cy = Math.floor(item.ay / CL_BUILDING_SIZE);
            const cellKey = `${cx}_${cy}`;
            if (aboveCutawayCells.has(cellKey)) continue; // BFS cutaway
            const maxF = clMaxFloorMap.get(cellKey);
            if (maxF !== undefined && bf !== maxF) continue; // 가장 위쪽 아님
            ctx.globalAlpha = 1.0;
          } else if (bType === 'wall' || bType === 'fence') {
            const side = item.b.data?.side || 'N';
            let absCx, absCy, cx2, cy2;
            if (side === 'N') {
              absCx = Math.floor(item.ax / CL_BUILDING_SIZE);
              absCy = Math.floor(item.ay / CL_BUILDING_SIZE);
              cx2 = absCx; cy2 = absCy - 1;
            } else {
              absCx = Math.floor(item.ax / CL_BUILDING_SIZE) - 1;
              absCy = Math.floor(item.ay / CL_BUILDING_SIZE);
              cx2 = absCx + 1; cy2 = absCy;
            }
            // BFS cutaway: 양쪽 cell 중 하나라도 in BFS면 skip
            if (aboveCutawayCells.has(`${absCx}_${absCy}`) || aboveCutawayCells.has(`${cx2}_${cy2}`)) continue;
            ensureWallMap();
            const r1 = cellRoomCache.get(`${absCx}_${absCy}_${bf}`);
            const r2 = cellRoomCache.get(`${cx2}_${cy2}_${bf}`);
            const isOuter = (!r1 || !r1.isIndoor) || (!r2 || !r2.isIndoor);
            if (!isOuter) continue;
            ctx.globalAlpha = 0.85;
          } else {
            continue;
          }
        }
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
      } else if (item.kind === 'stair_cell') {
        // 14.49-e7ah: stair cell N의 8 sub-step만 그림. z-sort 정확.
        const s = toScreen(item.iso.x, item.iso.y);
        const bf = item.b.floor || 0;
        const cx = Math.floor(item.ax / CL_BUILDING_SIZE);
        const cy = Math.floor(item.ay / CL_BUILDING_SIZE);
        if (bf > myFloor && aboveCutawayCells.has(`${cx}_${cy}`)) continue;
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
      const px = myAbsPredicted.x, py = myAbsPredicted.y;
      const myCx = Math.floor(px / CL_BUILDING_SIZE);
      const myCy = Math.floor(py / CL_BUILDING_SIZE);
      // wall iteration radius (벽 수집 범위) vs ray cast range (광선 닿는 거리)
      // ray range는 화면 너비보다 충분히 커야 화면 가장자리까지 시야 정상
      const SHADOW_RANGE_CELLS = 16; // 벽 수집은 16 cell만 (perf)
      const MAX_RANGE = Math.max(W, H) * 2; // ray range는 화면 2배 (시야 화면 전체 커버)
      ensureWallMap();
      function w2sx(wx, wy) { return (wx - wy) - (px - py) + W/2; }
      function w2sy(wx, wy) { return (wx + wy) * 0.5 - (px + py) * 0.5 + H/2; }
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
      if (!window._shadowMask || window._shadowMask.width !== W || window._shadowMask.height !== H) {
        window._shadowMask = document.createElement('canvas');
        window._shadowMask.width = W;
        window._shadowMask.height = H;
      }
      if (!window._seenCells) window._seenCells = new Set();
      const seenCells = window._seenCells;
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

      // 14.49-e7y: cumulative polygon 폐기. visible polygon 안 cell들을 seenCells에 add.
      // seen ↔ unseen 경계 = cell boundary (cell-aligned). visible ↔ seen = polygon.
      // perf: 시간 무관, viewport 안 cell loop만.
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      const FOG_RANGE = SHADOW_RANGE_CELLS + 2;
      for (let cx = myCx - FOG_RANGE; cx <= myCx + FOG_RANGE; cx++) {
        for (let cy = myCy - FOG_RANGE; cy <= myCy + FOG_RANGE; cy++) {
          const wxC = (cx + 0.5) * CL_BUILDING_SIZE;
          const wyC = (cy + 0.5) * CL_BUILDING_SIZE;
          if (mctx.isPointInPath(visibleWorldPath, wxC, wyC)) {
            seenCells.add(`${cx}_${cy}_${myFloor}`);
          }
        }
      }

      // mask render — 매 frame mode 명시 (이전 frame destination-out 상태 잔존 방지)
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fillRect(0, 0, W, H);

      // (i) seen cells: iso diamond single path → destination-out alpha 0.8 (살짝 어둠)
      mctx.globalCompositeOperation = 'destination-out';
      mctx.fillStyle = 'rgba(0,0,0,0.8)';
      mctx.beginPath();
      const halfW = 32, halfH = 16, expand = 1;
      const FOG_DRAW_RANGE = 35;
      for (const key of seenCells) {
        const parts = key.split('_');
        // 14.49-e7af: floor 체크 제거 — 다른 floor에서 본 cell도 seen 처리 (위층 갔을 때 1층 seen 영역 보임)
        const cxs = +parts[0], cys = +parts[1];
        if (Math.abs(cxs - myCx) > FOG_DRAW_RANGE) continue;
        if (Math.abs(cys - myCy) > FOG_DRAW_RANGE) continue;
        const wxC = (cxs + 0.5) * CL_BUILDING_SIZE;
        const wyC = (cys + 0.5) * CL_BUILDING_SIZE;
        const sxC = w2sx(wxC, wyC);
        const syC = w2sy(wxC, wyC);
        if (sxC < -64 || sxC > W + 64 || syC < -32 || syC > H + 32) continue;
        mctx.moveTo(sxC - halfW - expand, syC);
        mctx.lineTo(sxC, syC - halfH - expand);
        mctx.lineTo(sxC + halfW + expand, syC);
        mctx.lineTo(sxC, syC + halfH + expand);
        mctx.closePath();
      }
      mctx.fill();

      // (ii) visible polygon: world → screen iso transform → destination-out alpha 1.0 (밝음)
      mctx.save();
      mctx.setTransform(1, 0.5, -1, 0.5, W/2 - (px - py), H/2 - (px + py)/2);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fill(visibleWorldPath);
      mctx.restore();

      // 14.49-e7ae: mask composite는 다음 frame entity render 전에 합성 (entity가 mask 위)
      // wall 2차 render 폐기 — entity가 mask 위에 그려지므로 mask 가림 X
    }

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

    // === 5) 인접 존 방향 화살표 (4방향) ===
    drawNeighborArrow(pConn.meta.east, '동');
    drawNeighborArrow(pConn.meta.west, '서');
    drawNeighborArrow(pConn.meta.north, '북');
    drawNeighborArrow(pConn.meta.south, '남');
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
    if (type === 'farmland') {
      // 갈색 흙 다이아 + 작물
      const data = building?.data || {};
      const readyAt = data.readyAt || 0;
      const now = Date.now();
      const isReady = now >= readyAt;
      const growProgress = readyAt > data.plantedAt ? Math.min(1, (now - data.plantedAt) / (readyAt - data.plantedAt)) : 1;
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
        ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); // 나무색
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
        ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke();
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
      // 나무상자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 14, y - 4);
      ctx.lineTo(x, y + 4); ctx.lineTo(x - 14, y - 4); ctx.closePath();
      ctx.fillStyle = '#a87246'; ctx.fill();
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = '#7c5232'; ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 4); ctx.lineTo(x - 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = '#946040'; ctx.fill(); ctx.stroke();
      // 자물쇠 노란점
      ctx.fillStyle = '#f0c674';
      ctx.fillRect(x - 2, y - 2, 4, 4);
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

  function drawMobIso(x, y, mob) {
    const isWolf = mob.type === 'wolf';
    // Phase 14.38: mob facing (world vx/vy → iso 방향)
    const fvx = mob._fvx ?? 1, fvy = mob._fvy ?? 0;
    const fdx = fvx - fvy, fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen;
    // 머리 위치: 몸통 중심에서 facing 방향으로 6px 앞
    const headOX = facingX * 6, headOY = facingY * 3 - 4; // y는 살짝 위
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (isWolf) {
      // 회색 늑대
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      ctx.beginPath(); ctx.arc(x + headOX, y + headOY, 3, 0, Math.PI * 2); ctx.fillStyle = '#555'; ctx.fill();
      // 눈 (머리 위 facing 방향)
      ctx.fillStyle = '#f00';
      ctx.fillRect(x + headOX + facingX * 1.5 - 0.5, y + headOY + facingY * 1.5 - 0.5, 1, 1);
    } else {
      // 갈색 사슴
      ctx.fillStyle = '#a07050';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      const dhx = x + headOX, dhy = y + headOY - 3;
      ctx.beginPath(); ctx.arc(dhx, dhy, 3, 0, Math.PI * 2); ctx.fillStyle = '#8a5a3a'; ctx.fill();
      // 뿔 (facing 방향, 짧게 두 가닥)
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(dhx - 1, dhy - 2); ctx.lineTo(dhx - 2, dhy - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dhx + 1, dhy - 2); ctx.lineTo(dhx + 2, dhy - 5); ctx.stroke();
    }
    // HP bar
    if (mob.hp < mob.maxHp) {
      ctx.fillStyle = '#222'; ctx.fillRect(x - 10, y - 16, 20, 3);
      ctx.fillStyle = '#d85a5a'; ctx.fillRect(x - 10, y - 16, 20 * (mob.hp / mob.maxHp), 3);
    }
    // 이름
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = mob.tameOwner ? '#ffb0c0' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
    const baseLabel = isWolf ? '늑대' : '사슴';
    const label = mob.tameOwner ? `❤️ ${baseLabel} (${mob.tameOwnerName || ''})` : baseLabel;
    ctx.strokeText(label, x, y - 20); ctx.fillText(label, x, y - 20);
    ctx.textAlign = 'start';
  }

  function drawTreeIso(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(x - 2, y - 4, 4, 10);
    ctx.beginPath();
    ctx.ellipse(x, y - 12, 11, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2d5a2a'; ctx.fill();
    ctx.strokeStyle = '#1a3a18'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - 3, y - 16, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  }

  function drawRockIso(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.lineTo(x - 6, y - 6);
    ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + 10, y - 2);
    ctx.lineTo(x + 8, y + 5);
    ctx.lineTo(x - 4, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#8a8a8a'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 2, y - 7); ctx.lineTo(x + 0, y - 3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  }

  function drawBerryBushIso(x, y) {
    // 낮은 덤불 + 빨간 베리들
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a4a20';
    ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a3a10'; ctx.lineWidth = 1; ctx.stroke();
    // 베리들
    ctx.fillStyle = '#c83a3a';
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 3, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y + 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, y + 2, 1.5, 0, Math.PI*2); ctx.fill();
  }

  function drawWaterPoolIso(x, y) {
    // 푸른 다이아 (반짝이는 작은 연못)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 14, y);
    ctx.lineTo(x, y + 6); ctx.lineTo(x - 14, y); ctx.closePath();
    ctx.fillStyle = '#2a6aa8'; ctx.fill();
    ctx.strokeStyle = '#1a4a78'; ctx.lineWidth = 1; ctx.stroke();
    // 반짝이
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(x - 4, y - 1, 3, 1, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 5, y + 2, 2, 0.8, 0, 0, Math.PI*2); ctx.fill();
  }

  // Phase 14.3 — 약초 (herb): 작은 녹색 꽃 무더기
  function drawHerbIso(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI*2); ctx.fill();
    // 줄기 3개
    ctx.strokeStyle = '#3a7a3a'; ctx.lineWidth = 1.5;
    for (const [ox, oy] of [[-4, 0], [0, -2], [4, 0]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox, y - 10 + oy); ctx.stroke();
    }
    // 잎/꽃
    ctx.fillStyle = '#7ac86a';
    for (const [ox, oy] of [[-4, -10], [0, -12], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 2.5, 0, Math.PI*2); ctx.fill();
    }
    // 노란 꽃 점
    ctx.fillStyle = '#e8d048';
    for (const [ox, oy] of [[-4, -10], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 1, 0, Math.PI*2); ctx.fill();
    }
  }

  // Phase 14.3 — 광물 (ore): 회색 바위 + 빛나는 금속 결정
  function drawOreIso(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 5, 0, 0, Math.PI*2); ctx.fill();
    // 바위 본체
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 12, y - 2); ctx.lineTo(x + 8, y + 6);
    ctx.lineTo(x - 8, y + 6); ctx.closePath();
    ctx.fillStyle = '#5a5a6a'; ctx.fill();
    ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1; ctx.stroke();
    // 금속 결정 (반짝)
    ctx.fillStyle = '#c8a838';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 4); ctx.lineTo(x, y - 9);
    ctx.lineTo(x + 3, y - 4); ctx.lineTo(x, y - 1); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a7820'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath(); ctx.arc(x, y - 6, 1.5, 0, Math.PI*2); ctx.fill();
  }

  function drawSpeechBubble(x, y, text) {
    if (!text) return;
    ctx.font = '12px sans-serif';
    const padding = 6;
    const maxWidth = 200;
    // 줄바꿈
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 15;
    const bubW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
    const bubH = lines.length * lineH + padding * 2;
    const bx = x - bubW / 2;
    const by = y - bubH - 8;
    // 배경
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bubW, bubH, 6);
    else ctx.rect(bx, by, bubW, bubH);
    ctx.fill(); ctx.stroke();
    // 꼬리
    ctx.beginPath();
    ctx.moveTo(x - 5, by + bubH);
    ctx.lineTo(x, by + bubH + 6);
    ctx.lineTo(x + 5, by + bubH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.fill(); ctx.stroke();
    // 텍스트
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, by + padding + (i + 1) * lineH - 3);
    }
    ctx.textAlign = 'start';
  }

  // Phase 14.35: 걷기 + 공격 모션
  // - moving: walking bob (sin wave) + 다리 교차
  // - attackPhase 0~1: 무기 휘두름 (앞으로 lunge + 회복)
  function drawPlayerIso(x, y, name, color, isMe = false, opts = {}) {
    const t = performance.now() * 0.01;
    const moving = opts.moving || false;
    const isDown = !!opts.isDown; // Phase 14.41
    const attackP = Math.max(0, opts.attackPhase || 0); // 0=쉼, 1=시작, 0.5=중간
    // Phase 14.41: 다운 — 누워있는 모습 (옆으로 길게)
    if (isDown) {
      // 그림자 크게
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 몸통 (옆으로 누움)
      ctx.fillStyle = color;
      ctx.fillRect(x - 12, y - 2, 22, 7);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 2, 22, 7);
      // 머리 (한쪽 끝)
      ctx.beginPath(); ctx.arc(x + 12, y + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0d8b8'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      // X 눈 (다운)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + 13, y + 2);
      ctx.moveTo(x + 13, y - 1); ctx.lineTo(x + 10, y + 2); ctx.stroke();
      // 이름 + 💀
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8888';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText('💀 ' + name, x, y - 12);
      ctx.fillText('💀 ' + name, x, y - 12);
      ctx.textAlign = 'start';
      return;
    }
    // Phase 14.37: facing — vx/vy를 iso 화면 방향으로 변환
    // world(vx,vy) → iso 화면 dx,dy: dx = vx-vy, dy = (vx+vy)/2
    const fvx = opts.fvx || 0, fvy = opts.fvy || 0;
    const fdx = fvx - fvy;
    const fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen; // 화면상 방향 unit vector
    // walk bob (위아래 살짝)
    const bob = moving ? Math.sin(t * 1.3) * 1.6 : 0;
    // attack lunge (앞으로 살짝 — 화면상 동남 방향)
    const lungeAmt = Math.sin(attackP * Math.PI) * 5;
    const lx = x + lungeAmt * 0.5;
    const ly = y + lungeAmt * 0.3;

    // 그림자 — 발이 움직일 때도 그림자 고정
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

    // 다리 (걷기 시 좌우 교차)
    const legSwing = moving ? Math.sin(t * 1.8) * 2 : 0;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(lx - 4, ly + 3, 3, 5 - legSwing);
    ctx.fillRect(lx + 1, ly + 3, 3, 5 + legSwing);

    // 몸통 (bob 적용)
    ctx.fillStyle = color;
    ctx.fillRect(lx - 5, ly - 6 + bob, 10, 12);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - 5, ly - 6 + bob, 10, 12);

    // 팔 + 슬래시 (공격 시 앞쪽으로 휘두름)
    if (attackP > 0) {
      // 팔
      ctx.strokeStyle = '#f0d8b8'; ctx.lineWidth = 2;
      const swing = Math.sin(attackP * Math.PI);
      const armX = lx + facingX * 8 + swing * facingX * 6;
      const armY = ly - 2 + bob + facingY * 4 + swing * facingY * 3;
      ctx.beginPath();
      ctx.moveTo(lx + facingX * 2, ly + bob + facingY * 1);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      // Phase 14.38: 슬래시 호 — facing 방향 앞쪽에 짧은 흰 arc (반투명)
      const slashR = 16;
      const slashCx = lx + facingX * 10;
      const slashCy = ly + bob + facingY * 6;
      const baseAng = Math.atan2(facingY, facingX);
      // 호 각도: attackP 0→1 진행 따라 -π/3 → +π/3 회전 (휘두름)
      const sweep = (attackP - 0.5) * (Math.PI * 0.8);
      ctx.strokeStyle = `rgba(255, 255, 255, ${attackP * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(slashCx, slashCy, slashR, baseAng + sweep - 0.4, baseAng + sweep + 0.4);
      ctx.stroke();
    }

    // 머리 (bob 적용)
    const hx = lx, hy = ly - 11 + bob;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d8b8'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    // Phase 14.37: 눈 (facing 방향) — 작은 검은 점 2개
    if (fvx !== 0 || fvy !== 0) {
      const eyeOX = facingX * 2.5, eyeOY = facingY * 1.5;
      // 두 눈 (좌우 분리) — facing에 수직인 방향
      const perpX = -facingY, perpY = facingX;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(hx + eyeOX + perpX * 1.5, hy + eyeOY + perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + eyeOX - perpX * 1.5, hy + eyeOY - perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
    }

    // 이름표
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 22);
    ctx.fillText(name, x, y - 22);
    ctx.textAlign = 'start';
  }

  // === HUD ===
  // 음식 아이콘 매핑 (인벤토리 표시 + 클릭 시 'eat' 송신)
  const ITEM_ICONS = {
    berry: '🫐', fiber: '🌾', meat_raw: '🥩', meat_cooked: '🍗',
    hide: '🦌', berry_jam: '🍯', water_bottle: '🥤',
    seed_berry: '🌱', herb: '🌿', ore: '⛏️',
    // 14.50: 목공 자원
    wood: '🪵', plank: '🪚', stone: '🪨',
    // 14.51: 건축물 아이템 (인벤에 들어가는 형태)
    item_wall: '🧱', item_floor: '⬜', item_door: '🚪', item_fence: '🪵',
    item_stair: '🪜', item_chest: '📦', item_campfire: '🔥', item_farmland: '🌱',
  };
  const ITEM_LABEL = {
    berry: '베리', fiber: '풀', meat_raw: '날고기', meat_cooked: '구운고기',
    hide: '가죽', berry_jam: '베리잼', water_bottle: '물병',
    seed_berry: '베리씨앗', herb: '약초', ore: '광물',
    wood: '통나무', plank: '판자', stone: '돌',
    item_wall: '벽', item_floor: '바닥', item_door: '문', item_fence: '울타리',
    item_stair: '계단', item_chest: '상자', item_campfire: '모닥불', item_farmland: '농지',
  };

  // 14.53: 우클릭 컨텍스트 메뉴 — 임의 옵션 list 받아서 마우스 위치에 띄움.
  let _ctxMenuEl = null;
  function hideContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
    document.removeEventListener('click', hideContextMenu, true);
    document.removeEventListener('contextmenu', hideContextMenu, true);
  }
  function showContextMenu(x, y, options) {
    hideContextMenu();
    const m = document.createElement('div');
    m.id = 'ctxMenu';
    m.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:rgba(20,25,32,0.97);border:1px solid #5a7ab0;border-radius:6px;z-index:99999;min-width:180px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-size:13px;color:#fff;font-family:sans-serif`;
    for (const opt of options) {
      const it = document.createElement('div');
      it.textContent = opt.label;
      it.style.cssText = 'padding:8px 14px;cursor:pointer;border-radius:4px;user-select:none';
      it.onmouseenter = () => it.style.background = 'rgba(90,122,176,0.3)';
      it.onmouseleave = () => it.style.background = 'transparent';
      it.onclick = (e) => {
        e.stopPropagation();
        hideContextMenu();
        try { opt.onClick(); } catch(err) { console.warn('ctx menu err', err); }
      };
      m.appendChild(it);
    }
    document.body.appendChild(m);
    _ctxMenuEl = m;
    // viewport 밖이면 보정
    const rect = m.getBoundingClientRect();
    if (rect.right > window.innerWidth) m.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) m.style.top = (window.innerHeight - rect.height - 8) + 'px';
    // 외부 클릭 = 닫기
    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, true);
      document.addEventListener('contextmenu', hideContextMenu, true);
    }, 50);
  }
  // 14.53: 화면 하단 중앙 hotkey 슬롯 (1번). 드래그로 도구 등록 + 1키로 토글.
  function ensureHotkeyBar() {
    let bar = document.getElementById('hotkeyBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'hotkeyBar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:500;display:flex;gap:8px;pointer-events:none';
    bar.innerHTML = `
      <div id="hkSlot1" data-slot="1" style="pointer-events:auto;width:64px;height:64px;background:rgba(15,18,22,0.92);border:2px solid #444;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;user-select:none">
        <div style="position:absolute;top:2px;left:4px;font-size:10px;color:#8a93a0;font-weight:bold">1</div>
        <div class="hk-icon" style="font-size:24px;line-height:1">·</div>
        <div class="hk-label" style="font-size:9px;color:#6c7686;margin-top:1px">비어있음</div>
      </div>
    `;
    document.body.appendChild(bar);
    const slot = bar.querySelector('#hkSlot1');
    // 드래그 받기
    slot.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (types && (Array.from(types).includes('text/x-tool-instance'))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.style.borderColor = '#f0c674';
      }
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = (equipped && equipped === hotkey1) ? '#7cd97c' : '#444';
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/x-tool-instance');
      if (id) sendPrimary({ type: 'set_hotkey', toolItemId: id });
    });
    // 클릭 = 토글 (1키와 동일)
    slot.addEventListener('click', () => {
      if (!hotkey1) { showNotice('인벤에서 도구를 드래그하세요'); return; }
      sendPrimary({ type: 'toggle_hotkey' });
    });
    // 우클릭 = 슬롯 비우기
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (hotkey1) {
        sendPrimary({ type: 'set_hotkey', toolItemId: null });
        showNotice('1번 슬롯 비움');
      }
    });
    return bar;
  }
  function updateHotkeyBar() {
    const bar = ensureHotkeyBar();
    const slot = bar.querySelector('#hkSlot1');
    if (!slot) return;
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    const iconEl = slot.querySelector('.hk-icon');
    const labelEl = slot.querySelector('.hk-label');
    if (hotkey1) {
      const inst = toolItems.find(t => t.id === hotkey1);
      if (inst) {
        iconEl.textContent = TOOL_ICON_MAP[inst.type] || '🔧';
        const dur = `${inst.d}/${inst.max}`;
        const isEq = (equipped === inst.id);
        labelEl.textContent = isEq ? '✓착용 중' : '대기';
        labelEl.style.color = isEq ? '#7cd97c' : '#8fc8ff';
        slot.style.borderColor = isEq ? '#7cd97c' : '#5a7ab0';
        slot.style.background = isEq ? 'rgba(40,80,40,0.92)' : 'rgba(15,18,22,0.92)';
        slot.title = `${inst.type} (${dur}) — 1키 또는 클릭 = 토글, 우클릭 = 슬롯 비우기`;
      } else {
        // hotkey instance 사라짐 (서버에서 cleanup될 거임)
        iconEl.textContent = '·';
        labelEl.textContent = '깨짐';
        labelEl.style.color = '#e07060';
        slot.style.borderColor = '#444';
        slot.style.background = 'rgba(15,18,22,0.92)';
      }
    } else {
      iconEl.textContent = '·';
      labelEl.textContent = '비어있음';
      labelEl.style.color = '#6c7686';
      slot.style.borderColor = '#444';
      slot.style.background = 'rgba(15,18,22,0.92)';
      slot.title = '인벤에서 도구를 드래그해서 등록 (1키로 토글)';
    }
  }
  function updateHud() {
    document.getElementById('invWood').textContent = inventory.wood || 0;
    const plankEl = document.getElementById('invPlank');
    if (plankEl) plankEl.textContent = inventory.plank || 0;
    document.getElementById('invStone').textContent = inventory.stone || 0;
    const eqEl = document.getElementById('equippedBadge');
    if (eqEl) {
      const icons = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
      // 14.53: equipped = toolItemId → instance 찾아 type 표시
      const inst = equipped ? findToolInstance(equipped) : null;
      if (inst) {
        const TOOL_ICON_MAP2 = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
        eqEl.textContent = `${TOOL_ICON_MAP2[inst.type] || ''} ${inst.type} ${inst.d}/${inst.max}`;
      } else {
        eqEl.textContent = '맨손';
      }
    }
    const hpEl = document.getElementById('hpFill');
    if (hpEl) {
      hpEl.style.width = `${Math.max(0, (myHp / myMaxHp) * 100)}%`;
      document.getElementById('hpText').textContent = `${Math.round(myHp)}/${myMaxHp}`;
    }
    // hunger / thirst bar
    const hungerEl = document.getElementById('hungerFill');
    if (hungerEl) {
      hungerEl.style.width = `${Math.max(0, myHunger)}%`;
      document.getElementById('hungerText').textContent = `🍖 ${Math.round(myHunger)}`;
    }
    const thirstEl = document.getElementById('thirstFill');
    if (thirstEl) {
      thirstEl.style.width = `${Math.max(0, myThirst)}%`;
      document.getElementById('thirstText').textContent = `💧 ${Math.round(myThirst)}`;
    }
    const vpEl = document.getElementById('vpFill');
    if (vpEl) {
      vpEl.style.width = `${Math.max(0, Math.min(100, myVp))}%`;
      const txt = myVp >= VP_THRESHOLD
        ? `⚠️ 적대감 ${Math.round(myVp)} — 내 영지 보호 해제됨!`
        : `⚖️ 적대감 ${Math.round(myVp)}/${VP_THRESHOLD}`;
      document.getElementById('vpText').textContent = txt;
      document.querySelector('.vp-bar')?.classList.toggle('danger', myVp >= VP_THRESHOLD);
    }
    // Phase 14.40: Sprint 뱃지 — Shift 누르고 있을 때 시각 피드백
    const pvpBadgeForSprint = document.getElementById('pvpBadge');
    if (pvpBadgeForSprint) {
      let sprintBadge = document.getElementById('sprintBadge');
      if (!sprintBadge) {
        sprintBadge = document.createElement('span');
        sprintBadge.id = 'sprintBadge';
        sprintBadge.className = 'badge';
        sprintBadge.title = 'Shift = 달리기 (배고픔/목마름 1.5배 소모)';
        pvpBadgeForSprint.parentNode.insertBefore(sprintBadge, pvpBadgeForSprint);
      }
      const canSp = mySprint && myHunger > 5 && myThirst > 5;
      sprintBadge.textContent = canSp ? '🏃 달리기' : (mySprint ? '😩 지침' : '🚶 걷기');
      sprintBadge.style.background = canSp ? 'rgba(80,180,80,0.35)' : '';
    }
    // PvP 뱃지
    const pvpBadge = document.getElementById('pvpBadge');
    if (pvpBadge) {
      pvpBadge.textContent = myPvpEnabled ? '⚔️ PvP ON' : '🕊️ PvP OFF';
      pvpBadge.style.background = myPvpEnabled ? 'rgba(176,48,48,0.4)' : '';
      pvpBadge.onclick = () => sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      pvpBadge.style.cursor = 'pointer';
    }
    // 건축 층 뱃지
    let floorBadge = document.getElementById('floorBadge');
    if (!floorBadge && pvpBadge) {
      floorBadge = document.createElement('span');
      floorBadge.id = 'floorBadge';
      floorBadge.className = 'badge';
      floorBadge.title = '건축 층 (Z=위, X=아래)';
      pvpBadge.parentNode.insertBefore(floorBadge, pvpBadge.nextSibling);
    }
    if (floorBadge) floorBadge.textContent = `🏗️ 짓:${myBuildFloor}F · 🚶 ${myFloor}F`;
    // 음식/extra 인벤토리
    const foodRow = document.getElementById('invFoodRow');
    if (foodRow) {
      const items = Object.keys(ITEM_ICONS).filter(k => (inventory[k] || 0) > 0);
      foodRow.innerHTML = '';
      for (const k of items) {
        const sp = document.createElement('span');
        const isFood = !!foodEffects[k];
        sp.className = 'inv' + (isFood ? '' : ' disabled');
        sp.textContent = `${ITEM_ICONS[k]} ${ITEM_LABEL[k]} ${inventory[k]}`;
        if (isFood) {
          const eff = foodEffects[k];
          sp.title = `먹기 (+허기 ${eff.hunger||0}${eff.thirst?', +갈증 '+eff.thirst:''}${eff.hpDelta?', HP '+eff.hpDelta:''})`;
          sp.onclick = () => sendPrimary({ type: 'eat', item: k });
        } else {
          sp.title = `${ITEM_LABEL[k]} (먹을 수 없음 — 가공/거래용)`;
        }
        foodRow.appendChild(sp);
      }
    }
    let total = 1;
    for (const c of conns.values()) total += c.others.size;
    document.getElementById('playerCount').textContent = `${total}명`;
    const simLat = primaryZoneId ? (zonesMeta[primaryZoneId]?.simulatedLatencyMs || 0) * 2 : 0;
    const rttStr = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '측정중';
    document.getElementById('pingBadge').textContent = `📡 RTT ${rttStr} (sim ${simLat}ms)`;
    if (primaryZoneId) {
      document.getElementById('zoneBadge').textContent =
        `📍 ${zonesMeta[primaryZoneId].displayName}`;
      const zm = zonesMeta[primaryZoneId];
      const lx = myAbsPredicted.x - zm.worldOffsetX;
      const ly = myAbsPredicted.y - (zm.worldOffsetY || 0);
      // 14.49-e6-a: z 좌표 = floor*FLOOR_HEIGHT + stair z (실제 픽셀 높이)
      const totalZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0);
      document.getElementById('coordBadge').textContent =
        `월드(x=${Math.round(myAbsPredicted.x)}, y=${Math.round(myAbsPredicted.y)}, z=${Math.round(totalZ)}px) · 로컬(${Math.round(lx)}, ${Math.round(ly)})`;
    }
    const { wx, wy } = worldKeysDir();
    const dir = (wx === 0 && wy === 0) ? '정지' :
      ((wy < 0 ? '북' : wy > 0 ? '남' : '') + (wx > 0 ? '동' : wx < 0 ? '서' : '') || '?');
    document.getElementById('velBadge').textContent =
      `방향: ${dir} (vx=${wx.toFixed(2)}, vy=${wy.toFixed(2)})`;
    // 시간 뱃지 — 낮/밤/황혼/새벽 아이콘
    const tb = document.getElementById('timeBadge');
    if (tb) {
      const p = worldPhase();
      const dr = worldClock ? worldClock.dayPhaseRatio : 0.7;
      let icon = '☀️';
      if (p < 0.05) icon = '🌅';
      else if (p < dr - 0.05) icon = '☀️';
      else if (p < dr) icon = '🌇';
      else if (p < 0.95) icon = '🌙';
      else icon = '🌄';
      tb.textContent = `${icon} ${gameTimeString()}${isNight() ? ' (밤)' : ''}`;
    }
  }
  // 좌표는 실시간 갱신이 자연스러워서 더 자주
  setInterval(updateHud, 100);

  function updateMinimap() {
    const row = document.getElementById('miniRow');
    if (!row) return;
    if (!row.dataset.built) {
      row.innerHTML = '';
      // 14.46-a: 24 zone × 가변 크기 → worldOffsetX/Y 기준으로 절대 위치 배치 (실제 지리 반영)
      const W = row.clientWidth || 320, H = row.clientHeight || 200;
      const sx = W / worldWidth, sy = H / worldHeight;
      for (const z of Object.values(zonesMeta)) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.style.background = z.groundColor;
        cell.style.left = (z.worldOffsetX * sx) + 'px';
        cell.style.top  = ((z.worldOffsetY||0) * sy) + 'px';
        cell.style.width  = (z.zoneWidth * sx) + 'px';
        cell.style.height = (z.zoneHeight * sy) + 'px';
        cell.dataset.zone = z.id;
        const label = document.createElement('span');
        // 짧은 이름 (괄호 부분 제거)
        const short = (z.displayName || z.id).split(' ')[0].replace(/\(.*?\)/g, '').trim();
        label.textContent = short;
        cell.appendChild(label);
        row.appendChild(cell);
      }
      // dot — 따로 1개만 (활성 zone 위에 띄움). 절대 좌표 기준이라 어느 zone이든 같은 dot 위치 사용.
      const dot = document.createElement('div');
      dot.className = 'mini-dot';
      dot.id = 'miniDot';
      row.appendChild(dot);
      row.dataset.built = '1';
    }
    // 매 프레임: active zone 표시 + dot 위치 갱신
    const W = row.clientWidth || 320, H = row.clientHeight || 200;
    const sx = W / worldWidth, sy = H / worldHeight;
    for (const cell of row.children) {
      if (!cell.dataset.zone) continue;
      const id = cell.dataset.zone;
      const c = conns.get(id);
      cell.classList.toggle('active', id === primaryZoneId);
      cell.style.opacity = id === primaryZoneId ? 1 : (c && c.role === 'observer') ? 0.85 : 0.5;
    }
    const dot = document.getElementById('miniDot');
    if (dot) {
      dot.style.left = (myAbsPredicted.x * sx) + 'px';
      dot.style.top  = (myAbsPredicted.y * sy) + 'px';
    }
  }

  function renderChatLog() {
    const el = document.getElementById('chatLog');
    if (!el) return;
    el.innerHTML = '';
    const lines = chatLog.slice(-5); // 최근 5줄만
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'chat-line';
      div.style.borderLeftColor = line.color;
      const nameSpan = document.createElement('b');
      nameSpan.style.color = line.color;
      nameSpan.textContent = line.name + ':';
      div.appendChild(nameSpan);
      div.appendChild(document.createTextNode(' ' + line.text));
      el.appendChild(div);
    }
  }

  // === 거래소 UI ===
  let marketOpen = false;
  function toggleMarketplace() {
    // Phase 14.16: 옛 modal 대신 새 슬라이드 패널로
    if (typeof togglePanel === 'function') return togglePanel('market');
    marketOpen = !marketOpen;
    const panel = document.getElementById('marketPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !marketOpen);
    if (marketOpen) refreshMarket();
  }
  async function refreshMarket() {
    try {
      const r = await fetch('/market/orders');
      const data = await r.json();
      const list = document.getElementById('marketOrders');
      if (!list) return;
      list.innerHTML = '';
      for (const o of data.orders.slice(-20).reverse()) {
        const li = document.createElement('div');
        li.className = 'market-order';
        const isMine = o.player_id === myUsername;
        li.innerHTML = `<span class="${o.side === 'sell' ? 'sell' : 'buy'}">${o.side === 'sell' ? '판매' : '구매'}</span>
          ${o.item} ×${o.amount} @ ${o.price_item} ${o.price_amount}/개
          <span class="who">${o.player_id}${isMine ? ' (나)' : ''}</span>
          ${isMine ? `<button data-cancel="${o.id}">취소</button>` : ''}`;
        list.appendChild(li);
      }
      list.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.onclick = async () => {
          await fetch('/market/cancel', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ player_id: myUsername, order_id: +btn.dataset.cancel }),
          });
          refreshMarket();
        };
      });
    } catch (e) { console.error(e); }
  }
  async function placeOrder(side) {
    if (!myUsername) { showNotice('로그인이 필요합니다 (게스트 거래소 사용 불가)'); return; }
    const item = document.getElementById('marketItem').value;
    const amount = +document.getElementById('marketAmount').value || 1;
    const priceItem = item === 'wood' ? 'stone' : 'wood';
    const priceAmount = +document.getElementById('marketPrice').value || 1;
    try {
      const r = await fetch('/market/order', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ player_id: myUsername, side, item, amount, price_item: priceItem, price_amount: priceAmount }),
      });
      const data = await r.json();
      if (data.error) showNotice(`거래소: ${data.error}`);
      else showNotice(`주문 등록: ${data.matched === 'full' ? '즉시 체결!' : data.matched === 'partial' ? '부분 체결' : '대기 중'}`);
      refreshMarket();
    } catch (e) { showNotice('거래소 오류'); }
  }

  // === 상자 UI === (Phase 14.21 — 옛 modal 폐기, 새 인벤 패널로 redirect)
  let openChestId = null;
  function openChest(buildingId) {
    if (typeof openInvWithContainer === 'function') return openInvWithContainer(buildingId);
    openChestId = buildingId;
    document.getElementById('chestPanel')?.classList.remove('hidden');
    renderChestUi(buildingId, null);
  }
  function closeChest() {
    openChestId = null;
    document.getElementById('chestPanel')?.classList.add('hidden');
  }

  // === Craft 패널 ===
  let craftOpen = false;
  function toggleCraft() {
    if (typeof togglePanel === 'function') return togglePanel('craft'); // 14.16
    craftOpen = !craftOpen;
    const panel = document.getElementById('craftPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !craftOpen);
    if (craftOpen) renderCraftPanel();
  }
  const TOOL_ICONS = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
  const TOOL_LABELS = { axe: '도끼', pickaxe: '곡괭이', sword: '검' };
  function renderCraftPanel() {
    const list = document.getElementById('craftList');
    if (!list) return;
    list.innerHTML = '';
    const eqLabel = equipped ? `${TOOL_ICONS[equipped]||''} ${TOOL_LABELS[equipped]||equipped}` : '없음';
    const eqEl = document.getElementById('equippedNow');
    if (eqEl) eqEl.textContent = eqLabel;
    for (const [name, r] of Object.entries(recipes)) {
      const have = hasToolAlive(name) ? 1 : 0;
      const canCraft = !hasToolAlive(name) && (inventory.wood || 0) >= r.wood && (inventory.stone || 0) >= r.stone;
      const isEq = equipped === name;
      const row = document.createElement('div');
      row.className = 'craft-row' + (isEq ? ' eq' : '');
      row.innerHTML = `
        <div class="craft-icon">${TOOL_ICONS[name] || '🔧'}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} <span class="craft-have">×${have}</span></div>
          <div class="craft-cost">🪵 ${r.wood} · 🪨 ${r.stone}</div>
        </div>
        <button class="craft-btn" data-craft="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        <button class="equip-btn" data-equip="${name}" ${have > 0 ? '' : 'disabled'}>${isEq ? '해제' : '장착'}</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft', recipe: b.dataset.craft }));
    list.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
      const t = b.dataset.equip;
      sendPrimary({ type: 'equip', tool: equipped === t ? null : t });
    });
    // 14.50: 아이템 가공 (plank — 통나무→판자, 톱 필요)
    if (itemRecipes && Object.keys(itemRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #333;font-weight:bold';
      hdr.textContent = '— 아이템 가공 (목공) —';
      list.appendChild(hdr);
      for (const [name, ir] of Object.entries(itemRecipes)) {
        const hasTool = !ir.requiresTool || hasToolAlive(ir.requiresTool);
        const canCraft = hasTool && Object.entries(ir.from).every(([k, v]) => (inventory[k] || 0) >= v);
        const fromStr = Object.entries(ir.from).map(([k, v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ');
        const toStr = Object.entries(ir.to).map(([k, v]) => `${ITEM_ICONS[k]||k} ×${v}`).join(' ');
        const toolStr = ir.requiresTool ? ` (${ir.requiresTool} 필요)` : '';
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon">🪚</div>
          <div class="craft-info">
            <div class="craft-name">${ir.label}${toolStr}</div>
            <div class="craft-cost">${fromStr} → ${toStr}</div>
          </div>
          <button class="craft-btn" data-craftitem="${name}" ${canCraft ? '' : 'disabled'}>가공</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftitem]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_item', recipe: b.dataset.craftitem }));
    }
    // 14.51: 건축물 제작 (제작 → 인벤 → 건축 모드에서 배치)
    if (buildingRecipes && Object.keys(buildingRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #333;font-weight:bold';
      hdr.textContent = '— 건축물 제작 (만들면 인벤 → 건축 모드에서 배치) —';
      list.appendChild(hdr);
      for (const [name, br] of Object.entries(buildingRecipes)) {
        const hasHammer = !br._needHammer && !br._useHammer || hasToolAlive('hammer');
        const cost = {};
        for (const [k, v] of Object.entries(br)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        const canCraft = hasHammer && Object.entries(cost).every(([k, v]) => (inventory[k] || 0) >= v);
        const costStr = Object.entries(cost).map(([k, v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ');
        const hammerStr = br._needHammer ? ' 🔨' : '';
        const have = inventory[name] || 0;
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon">${ITEM_ICONS[name] || '🏗️'}</div>
          <div class="craft-info">
            <div class="craft-name">${br.label} <span class="craft-have">×${have}</span>${hammerStr}</div>
            <div class="craft-cost">${costStr || '-'}</div>
          </div>
          <button class="craft-btn" data-craftbuild="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftbuild]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_building', recipe: b.dataset.craftbuild }));
    }
  }
  function renderChestUi(id, data) {
    if (id !== openChestId) return;
    const wood = data?.wood || 0, stone = data?.stone || 0;
    document.getElementById('chestWood').textContent = wood;
    document.getElementById('chestStone').textContent = stone;
  }

  // === Cook 패널 ===
  let cookOpen = false;
  function toggleCookPanel() {
    cookOpen = !cookOpen;
    const panel = document.getElementById('cookPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !cookOpen);
    if (cookOpen) renderCookPanel();
  }
  function renderCookPanel() {
    const list = document.getElementById('cookList');
    if (!list) return;
    list.innerHTML = '';
    const entries = Object.entries(cookRecipes || {});
    if (entries.length === 0) {
      list.innerHTML = '<div class="hint">요리 레시피 없음</div>';
      return;
    }
    for (const [name, r] of entries) {
      const canCook = Object.entries(r.cost).every(([k, v]) => (inventory[k] || 0) >= v);
      const costStr = Object.entries(r.cost).map(([k, v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ');
      const prodStr = Object.entries(r.produces).map(([k, v]) => `${ITEM_ICONS[k]||k} ×${v}`).join(' ');
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.innerHTML = `
        <div class="craft-icon">${ITEM_ICONS[name] || '🍳'}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} → ${prodStr}</div>
          <div class="craft-cost">${costStr}</div>
        </div>
        <button class="craft-btn" data-cook="${name}" ${canCook ? '' : 'disabled'}>요리</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-cook]').forEach(b => b.onclick = () => sendPrimary({ type: 'cook', recipe: b.dataset.cook }));
  }
  // 인벤토리 바뀌면 패널 열려있을 때 갱신
  function rerenderPanelsIfOpen() {
    if (craftOpen) renderCraftPanel();
    if (cookOpen) renderCookPanel();
  }

  // === Phase 14.41: 다운 / 부활 패널 ===
  function showDownPanel() {
    const panel = document.getElementById('downPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderDownPanel();
  }
  function hideDownPanel() {
    const panel = document.getElementById('downPanel');
    if (panel) panel.classList.add('hidden');
  }
  function renderDownPanel() {
    const optBox = document.getElementById('downOptions');
    if (!optBox) return;
    optBox.innerHTML = '';
    // 우선순위 정렬: personal > temporary > guild > home
    const KIND_ORDER = { personal: 0, temporary: 1, guild: 2, home: 3 };
    const KIND_LABEL = { personal: '개인', temporary: '임시', guild: '🛡️ 길드', home: '🏛️ 마을광장' };
    const sorted = [...myRespawnOptions].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    if (sorted.length === 0) {
      const none = document.createElement('div');
      none.className = 'down-opt-none';
      none.innerHTML = '⚠️ 부활 가능한 지점이 없습니다.<br/>사유지를 만들거나 길드에 가입하세요.<br/><span style="font-size:10px;opacity:0.7">길드원이 R 키로 구조해줄 수 있음</span>';
      optBox.appendChild(none);
    } else {
      for (const o of sorted) {
        const btn = document.createElement('button');
        btn.className = `down-opt ${o.kind}`;
        const kindLabel = KIND_LABEL[o.kind] || o.kind;
        btn.innerHTML = `<span class="kind-badge">${kindLabel}</span> (${Math.round(o.x)}, ${Math.round(o.y)})에서 부활`;
        btn.onclick = () => sendPrimary({ type: 'respawn_choice', kind: o.claimId });
        optBox.appendChild(btn);
      }
    }
    // 첫 렌더 시 hint 초기화
    const hint = document.getElementById('downRescueHint');
    if (hint) hint.classList.remove('expired');
  }
  // 1초마다 타이머 업데이트 + 윈도우 만료 시 hint 회색
  setInterval(() => {
    if (!myIsDown) return;
    const elapsedMs = performance.now() - myDownedAt;
    const remainMs = Math.max(0, myDownRescueWindowMs - elapsedMs);
    const sec = Math.ceil(remainMs / 1000);
    const tEl = document.getElementById('downTimer');
    const hint = document.getElementById('downRescueHint');
    if (remainMs > 0) {
      if (tEl) tEl.textContent = sec;
      if (hint) hint.classList.remove('expired');
    } else {
      if (hint) {
        hint.classList.add('expired');
        hint.innerHTML = '⌛ 구조 가능 시간 지남. 사유지를 선택해 부활하세요.';
      }
    }
  }, 500);

  // === 길드 패널 ===
  let tribeOpen = false;
  function toggleTribePanel() {
    if (typeof togglePanel === 'function') return togglePanel('tribe'); // 14.16
    tribeOpen = !tribeOpen;
    const panel = document.getElementById('tribePanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !tribeOpen);
    if (tribeOpen) renderTribePanel();
  }
  async function renderTribePanel() {
    const body = document.getElementById('tribeBody');
    if (!body) return;
    body.innerHTML = '<div class="hint">로딩 중...</div>';
    if (!myUsername || myUsername.startsWith('anon_')) {
      body.innerHTML = '<div class="hint">게스트 모드는 길드 사용 불가 — 로그인 필요</div>';
      return;
    }
    if (myTribeId) {
      // 내 길드 정보
      try {
        const r = await fetch(`/tribe/${myTribeId}`);
        const data = await r.json();
        const members = (data.members || []).map(m =>
          `<div class="craft-row"><span style="background:${m.color};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px"></span>${m.name}${m.player_id === data.tribe.leader_id ? ' 👑' : ''}</div>`
        ).join('');
        // Phase 14.2 — 길드 vp + treasury + behavior_tier
        const vp = data.tribe.vp || 0;
        let tierLabel, tierColor;
        if (vp < 30) { tierLabel = '청정 (clean)'; tierColor = '#9adb6e'; }
        else if (vp < 80) { tierLabel = '보통 (normal)'; tierColor = '#e8c878'; }
        else { tierLabel = '악성 (evil)'; tierColor = '#e85040'; }
        const treasury = data.treasury || {};
        const trItems = Object.entries(treasury).filter(([k,v]) => v > 0)
          .map(([k,v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ') || '(비어있음)';
        const isNpc = data.tribe.is_npc;
        const tierBadge = isNpc ? `<span class="badge" style="background:#5a7aa8">NPC길드 (${data.tribe.behavior_tier})</span>` : '';
        // Phase 14.9 — 전쟁 선포 대상 목록 (내 길드 X, 이미 전쟁중 X)
        let warsHtml = '';
        let declareHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          const myWars = (wd.wars || []).filter(w => w.attacker_guild_id === myTribeId || w.defender_guild_id === myTribeId);
          if (myWars.length > 0) {
            warsHtml = '<div class="hint" style="margin-top:8px">⚔️ 진행 중 전쟁:</div>' + myWars.map(w => {
              const other = w.attacker_guild_id === myTribeId ? `→ [${w.defender_name}] (공격)` : `← [${w.attacker_name}] (방어)`;
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">${other}</div><div class="craft-cost">tier=${w.tier} · loot=${(w.loot_rate*100).toFixed(0)}% · damage=${(w.damage_rate*100).toFixed(0)}%</div></div><button class="craft-btn" data-end-war="${w.id}">종전</button></div>`;
            }).join('');
          }
          // 선포 대상 — NPC 길드 우선 (플레이어 길드끼리도 가능)
          const allR = await fetch('/tribes');
          const allD = await allR.json();
          const candidates = (allD.tribes || []).filter(t => t.id !== myTribeId &&
            !(wd.wars || []).some(w => (w.attacker_guild_id === myTribeId && w.defender_guild_id === t.id) || (w.defender_guild_id === myTribeId && w.attacker_guild_id === t.id))
          );
          if (candidates.length > 0) {
            declareHtml = '<div class="hint" style="margin-top:8px">🗡️ 선전포고 대상:</div>' + candidates.slice(0, 10).map(t => {
              const v = t.vp || 0;
              const tag = v < 30 ? '청정 (침략시 적대감↑)' : v < 80 ? '보통' : '악성 (토벌!)';
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${t.is_npc?' 🤖':''}</div><div class="craft-cost">${tag} vp=${v.toFixed(0)}</div></div><button class="craft-btn" data-declare="${t.id}">선포</button></div>`;
            }).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">소속 길드: <b>[${myTribeName}]</b> (멤버 ${data.members.length}명) ${tierBadge}</div>
          <div class="hint" style="margin-top:6px">⚖️ 길드 명성: <b style="color:${tierColor}">${vp.toFixed(0)}/200 · ${tierLabel}</b></div>
          <div class="hint" style="font-size:11px;opacity:0.7">청정=침략 시 약함·침략자 +대량적대감 / 악성=토벌 대상</div>
          <div class="hint" style="margin-top:6px">🏦 길드 금고: <b>${trItems}</b></div>
          <div class="hint" style="margin-top:6px">🏛️ 사유지 슬롯 (Phase 14.18): <b>${countMyClaimsClient()}</b><br/><span style="font-size:10px;opacity:0.7">C=개인 (길드영토 안만) · T=임시 (어디든) · Shift+C=길드영토 (멤버만)</span></div>
          ${warsHtml}
          ${declareHtml}
          <div class="hint" style="margin-top:8px">멤버 목록:</div>
          ${members}
          <div class="hint" style="margin-top:8px">길드 채팅: <b>Enter → /t 메시지</b></div>
          <button class="craft-btn" id="tribeLeaveBtn" style="margin-top:12px;background:#b03030">길드 탈퇴</button>
        `;
        // 선포 버튼 핸들러
        body.querySelectorAll('[data-declare]').forEach(b => b.onclick = async () => {
          const did = parseInt(b.dataset.declare, 10);
          if (!confirm('선전포고하면 침략자 적대감이 부과될 수 있어요. 진행할까요?')) return;
          const r = await fetch('/war/declare', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ attacker_guild_id: myTribeId, defender_guild_id: did, declared_by: myUsername }) });
          const d = await r.json();
          if (d.ok) { showNotice(`⚔️ 전쟁 선포! tier=${d.tier} loot=${(d.loot_rate*100).toFixed(0)}%`); renderTribePanel(); }
          else alert(d.error || '선포 실패');
        });
        body.querySelectorAll('[data-end-war]').forEach(b => b.onclick = async () => {
          const wid = parseInt(b.dataset.endWar, 10);
          const r = await fetch('/war/end', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ war_id: wid }) });
          const d = await r.json();
          if (d.ok) { showNotice('🕊️ 전쟁 종료'); renderTribePanel(); }
          else alert(d.error || '종전 실패');
        });
        document.getElementById('tribeLeaveBtn').onclick = async () => {
          if (!confirm('정말 탈퇴하시겠습니까?')) return;
          const r = await fetch('/tribe/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername }) });
          const d = await r.json();
          if (d.ok) { myTribeId = null; myTribeName = null; sendPrimary({ type: 'tribe_set', tribeId: null, tribeName: null }); renderTribePanel(); }
          else alert(d.error || '탈퇴 실패');
        };
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    } else {
      // 길드 없음 — 만들기 또는 가입
      try {
        const r = await fetch('/tribes');
        const data = await r.json();
        const list = (data.tribes || []).map(t => {
          const vp = t.vp || 0;
          let tag, col;
          if (vp < 30) { tag = '청정'; col = '#9adb6e'; }
          else if (vp < 80) { tag = '보통'; col = '#e8c878'; }
          else { tag = '악성'; col = '#e85040'; }
          const npcBadge = t.is_npc ? ' 🤖' : '';
          return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${npcBadge}</div><div class="craft-cost">멤버 ${t.member_count} · <span style="color:${col}">${tag} ${vp.toFixed(0)}</span></div></div><button class="craft-btn" data-join="${t.id}">가입</button></div>`;
        }).join('');
        // Phase 14.9 — 전쟁 활성 목록 표시
        let warsHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          if ((wd.wars || []).length > 0) {
            warsHtml = '<div class="hint" style="margin-top:12px">⚔️ 활성 전쟁:</div>' +
              wd.wars.map(w => `<div class="craft-row" style="font-size:12px"><div class="craft-info">[${w.attacker_name}] → [${w.defender_name}] (${w.tier})</div></div>`).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">새 길드 만들기:</div>
          <div style="display:flex;gap:6px;margin:4px 0 12px">
            <input id="tribeNameInput" maxlength="20" placeholder="길드 이름" style="flex:1;padding:4px 6px"/>
            <button class="craft-btn" id="tribeCreateBtn">만들기</button>
          </div>
          <div class="hint">또는 기존 길드 가입:</div>
          ${list || '<div class="hint">(길드 없음)</div>'}
          ${warsHtml}
        `;
        document.getElementById('tribeCreateBtn').onclick = async () => {
          const name = document.getElementById('tribeNameInput').value.trim();
          if (!name) return;
          const r = await fetch('/tribe/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, name }) });
          const d = await r.json();
          if (d.ok) { myTribeId = d.tribe_id; myTribeName = d.name; sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name }); renderTribePanel(); }
          else alert(d.error || '생성 실패');
        };
        body.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
          const tid = parseInt(b.dataset.join, 10);
          const r = await fetch('/tribe/join', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, tribe_id: tid }) });
          const d = await r.json();
          if (d.ok) {
            myTribeId = d.tribe_id; myTribeName = d.name;
            sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name });
            if (d.promoted) showNotice(`👑 [${d.name}] 길드 운영권 인수! 당신이 새 리더입니다`);
            renderTribePanel();
          }
          else alert(d.error || '가입 실패');
        });
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    }
  }

  let noticeTimer;
  function showNotice(text) {
    document.getElementById('notice').textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      document.getElementById('notice').textContent = '';
    }, 2500);
  }

  boot();

  // === Phase 14.17: 좀보이드 정통 — 좌측 사이드바 + 상단 인벤 드롭다운 ===
  // 사이드 아이콘 4개(제작/건축/길드/거래소) + 인벤은 상단 드롭다운(별개)
  let activeSide = null; // 좌측 패널 (한 번에 1개)
  let invOpen = false;

  function openSide(name) {
    activeSide = name;
    document.getElementById('sidePanel').classList.add('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.toggle('active', t.dataset.side === name));
    document.getElementById('spTitle').textContent = ({
      craft: '🔨 제작', build: '🏗️ 건축', tribe: '🛡️ 길드', market: '🏪 거래소',
      skills: '📚 스킬', claims: '🏛️ 사유지',
    })[name] || name;
    renderSide(name);
  }
  function closeSide() {
    activeSide = null;
    document.getElementById('sidePanel').classList.remove('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.remove('active'));
  }
  function toggleSide(name) {
    if (activeSide === name) closeSide();
    else openSide(name);
  }
  // 호환: 옛 togglePanel(name)이 inv면 인벤 토글, 나머지는 좌측 패널
  function togglePanel(name) {
    if (name === 'inv') return toggleInv();
    return toggleSide(name);
  }

  function openInv() {
    if (invOpen) return;
    invOpen = true;
    document.getElementById('invDropdown').classList.add('open');
    renderInvPanel(document.getElementById('invBody'));
  }
  function closeInv() {
    if (!invOpen) return;
    invOpen = false;
    document.getElementById('invDropdown').classList.remove('open');
  }
  function toggleInv() { invOpen ? closeInv() : openInv(); }

  document.querySelectorAll('.sb-icon').forEach(t => {
    t.addEventListener('click', () => toggleSide(t.dataset.side));
  });

  // Phase 14.21: 인벤 hover-open (mouseleave 자동닫힘 폐기 — outside click만 닫음)
  const invToggleEl = document.getElementById('invToggle');
  const invDropEl = document.getElementById('invDropdown');
  invToggleEl.addEventListener('mouseenter', openInv);
  invToggleEl.addEventListener('click', toggleInv);
  // 빈 화면 클릭에서만 닫음 (아래 mousedown handler)

  // 빈 화면 클릭 → 인벤·사이드 패널 둘 다 닫음
  document.addEventListener('mousedown', (e) => {
    const inInv = invDropEl.contains(e.target) || invToggleEl.contains(e.target);
    const inSide = document.getElementById('sidePanel').contains(e.target) || document.getElementById('sidebar').contains(e.target);
    const inChat = document.getElementById('chatPanel')?.contains(e.target);
    if (!inInv && !inSide && !inChat) {
      if (invOpen) closeInv();
      if (activeSide) closeSide();
    }
  });

  document.getElementById('spClose').addEventListener('click', closeSide);

  // Esc 처리
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (placementMode) { placementMode = null; showNotice('배치 모드 취소'); e.stopPropagation(); return; }
      if (invOpen) { closeInv(); e.stopPropagation(); }
      else if (activeSide) { closeSide(); e.stopPropagation(); }
    }
  });
  // 단축키 (I=인벤 / K=제작 / Shift+B=건축) — 채팅 input focused 아닐 때만
  document.addEventListener('keydown', (e) => {
    const ci = document.getElementById('chatInput');
    if (document.activeElement === ci) return;
    const k = e.key.toLowerCase();
    if (k === 'i') { toggleInv(); e.preventDefault(); }
    else if (k === 'k') { toggleSide('craft'); e.preventDefault(); }
    else if (k === 'b' && e.shiftKey) { toggleSide('build'); e.preventDefault(); }
    else if (k === 'y') { toggleSide('claims'); e.preventDefault(); }
    else if (k === 'p') { toggleSide('skills'); e.preventDefault(); }
  });

  function renderSide(name) {
    const body = document.getElementById('spBody');
    if (name === 'craft') renderCraftPanel2(body);
    else if (name === 'build') renderBuildPanel(body);
    else if (name === 'claims') renderClaimsPanel(body);
    else if (name === 'tribe') { body.innerHTML = '<div id="tribeBody"></div>'; renderTribePanel(); }
    else if (name === 'market') renderMarketPanel(body);
    else if (name === 'skills') renderSkillsPanel(body);
  }

  // 14.49-e7an: 스킬 패널 프로토타입 (UI only, hardcoded values)
  const PROTO_SKILLS = {
    production: [
      { id: 'farming',   name: '농사', icon: '🌾', level: 1, exp: 0 },
      { id: 'foraging',  name: '채집', icon: '🌿', level: 1, exp: 0 },
      { id: 'fishing',   name: '낚시', icon: '🎣', level: 1, exp: 0 },
      { id: 'mining',    name: '채광', icon: '⛏️', level: 1, exp: 0 },
      { id: 'carpentry', name: '목공', icon: '🪚', level: 1, exp: 0 },
      { id: 'medicine',  name: '의료', icon: '💊', level: 1, exp: 0 },
    ],
    combat: [
      { id: 'sword',  name: '검술', icon: '⚔️', level: 1, exp: 0 },
      { id: 'spear',  name: '창술', icon: '🔱', level: 1, exp: 0 },
      { id: 'bow',    name: '궁술', icon: '🏹', level: 1, exp: 0 },
      { id: 'axe',    name: '도끼', icon: '🪓', level: 1, exp: 0 },
      { id: 'shield', name: '방패', icon: '🛡️', level: 1, exp: 0 },
    ],
  };
  const PROTO_TALENT = { used: 0, max: 30 };

  function expForLevel(lv) { return 50 + lv * lv * 25; } // 1→100, 2→200, 3→375...

  function renderSkillsPanel(body) {
    const totalLevel = [...PROTO_SKILLS.production, ...PROTO_SKILLS.combat].reduce((s, k) => s + k.level, 0);
    function skillRow(s) {
      const need = expForLevel(s.level);
      const pct = Math.min(100, Math.floor(s.exp / need * 100));
      return `<div class="skill-row">
        <span class="skill-icon">${s.icon}</span>
        <span class="skill-name">${s.name}</span>
        <span class="skill-lv">Lv ${s.level}</span>
        <div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div><span class="skill-bar-text">${s.exp}/${need}</span></div>
        <button class="skill-talent-btn" data-skill="${s.id}" title="특성 (분야 ${s.level}개까지 가능)">⭐ 0/${s.level}</button>
      </div>`;
    }
    body.innerHTML = `
      <style>
        .skill-section-head { color:#f0c674; font-size:13px; font-weight:bold; padding:8px 4px 4px; }
        .skill-row { display:flex; align-items:center; gap:6px; padding:5px 4px; border-bottom:1px solid #2a3038; }
        .skill-icon { font-size:18px; width:24px; text-align:center; }
        .skill-name { width:46px; color:#cfd6dd; font-size:12px; }
        .skill-lv { width:42px; color:#8a93a0; font-size:11px; }
        .skill-bar { flex:1; height:14px; background:#1a1f25; border:1px solid #2a3038; position:relative; overflow:hidden; border-radius:2px; }
        .skill-bar-fill { height:100%; background:linear-gradient(90deg,#3a7a3a,#5aa55a); transition:width 0.3s; }
        .skill-bar-text { position:absolute; top:0; left:0; right:0; bottom:0; text-align:center; color:#cfd6dd; font-size:10px; line-height:14px; text-shadow:0 0 2px #000; }
        .skill-talent-btn { background:#2a3038; color:#cfd6dd; border:1px solid #3a4048; padding:2px 6px; font-size:10px; cursor:pointer; border-radius:2px; }
        .skill-talent-btn:hover { background:#3a4048; }
        .skill-pool { background:#1a1f25; padding:8px; border:1px solid #2a3038; border-radius:3px; margin:8px 4px; text-align:center; }
        .skill-pool-bar { height:10px; background:#0a0e12; border:1px solid #2a3038; margin-top:4px; border-radius:2px; overflow:hidden; }
        .skill-pool-fill { height:100%; background:linear-gradient(90deg,#5a7ad8,#9aafe0); }
        .skill-hint { color:#6c7686; font-size:10px; padding:4px; text-align:center; }
      </style>
      <div class="skill-pool">
        <div style="color:#cfd6dd;font-weight:bold">⭐ 특성 포인트 ${PROTO_TALENT.used}/${PROTO_TALENT.max}</div>
        <div class="skill-pool-bar"><div class="skill-pool-fill" style="width:${PROTO_TALENT.used/PROTO_TALENT.max*100}%"></div></div>
        <div style="color:#8a93a0;font-size:10px;margin-top:3px">총 레벨 ${totalLevel}</div>
      </div>
      <div class="skill-section-head">🛠️ 생산</div>
      ${PROTO_SKILLS.production.map(skillRow).join('')}
      <div class="skill-section-head" style="margin-top:8px">⚔️ 전투</div>
      ${PROTO_SKILLS.combat.map(skillRow).join('')}
      <div class="skill-hint">프로토타입 — 활동 시 자동으로 exp 쌓이는 시스템은 다음 단계</div>
    `;
    body.querySelectorAll('.skill-talent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showNotice(`${btn.dataset.skill} 특성 트리 — 다음 단계에서 구현`);
      });
    });
  }

  // Phase 14.26: 사유지 패널 — 내 claim 목록 + 해제 + 위치 텔레포트 안내
  function renderClaimsPanel(body) {
    const KIND_ICON = { personal: '🏠', temporary: '⛺', guild: '🏛️' };
    const KIND_NAME = { personal: '개인', temporary: '임시', guild: '길드영토' };
    const my = [];
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== myUsername) continue;
        my.push(cl);
      }
    }
    my.sort((a, b) => (a.kind || 'z').localeCompare(b.kind || 'z') || (a.createdAt - b.createdAt));
    const counts = { personal: 0, temporary: 0, guild: 0 };
    for (const cl of my) counts[cl.kind || 'personal']++;
    const list = my.length === 0
      ? '<div style="color:#6c7686;padding:14px;text-align:center">설치한 사유지가 없습니다</div>'
      : my.map(cl => {
          const k = cl.kind || 'personal';
          return `<div class="sp-list-row">
            <span>${KIND_ICON[k]} ${KIND_NAME[k]} @ (${cl.x},${cl.y})</span>
            <button class="craft-btn" data-unclaim="${cl.id}" style="background:#b03030;padding:3px 8px">해제</button>
          </div>`;
        }).join('');
    body.innerHTML = `
      <div class="hint">슬롯 사용: 개인 ${counts.personal}/9 · 임시 ${counts.temporary}/4 · 길드영토 ${counts.guild}/50</div>
      <div class="hint" style="font-size:11px;opacity:0.7;margin-bottom:10px">
        <b>C</b>=개인 사유지 (길드 영토 안만) · <b>T</b>=임시 (어디든) · <b>Shift+C</b>=길드 영토 (멤버만)<br/>
        해제하면 슬롯 회수. 자원은 환불 안 됨. 다른 위치 가서 다시 설치 가능.
      </div>
      <div class="inv-col-head">내 사유지 목록 (${my.length}개)</div>
      ${list}
    `;
    body.querySelectorAll('[data-unclaim]').forEach(btn => btn.onclick = () => {
      if (!confirm('이 사유지를 해제하시겠습니까? (자원 환불 X)')) return;
      sendPrimary({ type: 'unclaim', claimId: btn.dataset.unclaim });
      setTimeout(() => renderClaimsPanel(body), 200);
    });
  }

  // Phase 14.20: 깜빡 fix — 패널 갱신 빈도 3초로 (이전 1초). content hash 비교는 다음 sprint.
  // 길드 패널: 사용자가 입력 안 했으면 안 갱신 (fetch 깜빡 방지). 옛 1초 setInterval 폐기.
  let lastSideRenderAt = 0;
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

  // === Phase 14.21: 좀보이드 정통 인벤 — 좌(내인벤) | 가운데(활성 컨테이너) | 우(컨테이너 탭) ===
  const ITEM_CAT = {
    wood: '자재', stone: '자재', ore: '자재',
    berry: '음식', meat_raw: '음식', meat_cooked: '음식', berry_jam: '음식', herb: '약초',
    water_bottle: '음료',
    fiber: '잡화', seed_berry: '씨앗', hide: '잡화',
    axe: '도구', pickaxe: '도구', sword: '도구',
  };

  // 근처 모든 chest (120px 반경)
  function nearbyContainers() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const b of pc.buildings.values()) {
      if (b.type !== 'chest') continue;
      const absX = ox + b.x, absY = oy + b.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 120) list.push({ b, d, absX, absY });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  // 활성 컨테이너 (사용자 선택 또는 가까운 거 자동)
  let activeContainerId = null;
  // 외부에서 호출: chest 클릭하면 인벤 열고 그 chest 선택
  window.openInvWithContainer = function openInvWithContainer(chestId) {
    activeContainerId = chestId;
    openInv();
  };

  // Phase 14.25: 내 사유지 카운트 (kind별)
  function countMyClaimsClient() {
    let p = 0, t = 0, g = 0;
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== myUsername) continue;
        if (cl.kind === 'temporary') t++;
        else if (cl.kind === 'guild') g++;
        else p++;
      }
    }
    return `개인 ${p}/9 · 임시 ${t}/4 · 길드영토 ${g}/50`;
  }

  // 근처 ground items (80px 반경) — 바닥 pseudo-container 내용
  function nearbyGroundItems() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta || !pc.groundItems) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const gi of pc.groundItems.values()) {
      const absX = ox + gi.x, absY = oy + gi.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 100) list.push({ gi, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  function renderInvPanel(body) {
    // 14.53-e: 재렌더 전 각 컬럼의 scrollTop 저장 (mine + chest)
    const _savedScroll = {};
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      _savedScroll[tgt] = el.scrollTop;
    });
    const conts = nearbyContainers();
    // 바닥 탭 항상 마지막에. activeContainerId === 'ground' 면 바닥 표시
    if (activeContainerId && activeContainerId !== 'ground' && !conts.find(c => c.b.id === activeContainerId)) activeContainerId = null;
    if (!activeContainerId) activeContainerId = conts.length > 0 ? conts[0].b.id : 'ground';
    const activeC = (activeContainerId !== 'ground' && activeContainerId) ? conts.find(c => c.b.id === activeContainerId)?.b : null;
    const isGround = (activeContainerId === 'ground');

    const rowsHtml = (inv, kind, chestId) => {
      const entries = Object.entries(inv).filter(([k, v]) => v > 0).sort((a, b) => {
        const ca = ITEM_CAT[a[0]] || 'zzz', cb = ITEM_CAT[b[0]] || 'zzz';
        return ca.localeCompare(cb) || a[0].localeCompare(b[0]);
      });
      if (entries.length === 0) return `<tr><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">(비어있음)</td></tr>`;
      return entries.map(([k, v]) => {
        const icon = (ITEM_ICONS && ITEM_ICONS[k]) || ({wood:'🪵',stone:'🪨'}[k]) || '📦';
        const label = (ITEM_LABEL && ITEM_LABEL[k]) || k;
        const cat = ITEM_CAT[k] || '기타';
        const isContainerItem = (kind === 'chest');
        const canMove = isContainerItem ? true : !!chestId;
        const btn = canMove
          ? `<button data-move="${kind}" data-item="${k}" data-cid="${chestId || ''}">${isContainerItem ? '↑' : '↓'}</button>`
          : '';
        return `<tr><td class="it-icon">${icon}</td><td class="it-name">${label} <span class="it-count">×${v}</span></td><td class="it-cat">${cat}</td><td class="it-action">${btn}</td></tr>`;
      }).join('');
    };

    const myCount = Object.values(inventory).filter(v => v > 0).length + (toolItems ? toolItems.length : 0);
    // 14.53: toolItems row (각 instance 별 행)
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    const toolRowsHtml = () => {
      if (!toolItems || toolItems.length === 0) return '';
      return toolItems.map(t => {
        const isEq = (equipped === t.id);
        const isHot = (hotkey1 === t.id);
        const icon = TOOL_ICON_MAP[t.type] || '🔧';
        const durColor = t.d > t.max * 0.5 ? '#7cd97c' : (t.d > t.max * 0.2 ? '#e0c060' : '#e07060');
        const eqBadge = isEq ? '<span style="color:#7cd97c;font-weight:bold">✓장착</span>' : '';
        const hotBadge = isHot ? '<span style="color:#f0c674">⌨1</span>' : '';
        return `<tr draggable="true" data-toolid="${t.id}" data-tooltype="${t.type}" style="cursor:grab;${isEq?'background:rgba(124,217,124,0.08)':''}">
          <td class="it-icon">${icon}</td>
          <td class="it-name">
            <div>${t.type} ${eqBadge} ${hotBadge}</div>
            <div style="font-size:10px;color:${durColor}">내구도 ${t.d}/${t.max}</div>
          </td>
          <td class="it-cat">도구</td>
          <td class="it-action">
            <button data-equiptool="${t.id}" title="${isEq?'해제':'착용'}">${isEq?'해제':'착용'}</button>
          </td>
        </tr>`;
      }).join('');
    };
    // 좌: 내 인벤 (toolItems 먼저, 그다음 자원)
    const myTable = `<div class="inv-col" data-drop-target="mine">
      <div class="inv-col-head">🎒 내 인벤토리<span class="col-count">(${myCount}종)</span></div>
      <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
        <table class="inv-table">
          <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
          <tbody>${toolRowsHtml()}${rowsHtml(inventory, 'mine', activeC ? activeC.id : (isGround ? 'ground' : null))}</tbody>
        </table>
      </div></div>`;

    // 가운데: 활성 컨테이너 내용
    let chestTable;
    if (isGround) {
      // 바닥 — ground items 다 모아 보여줌 (각 행이 별도 gi)
      const gItems = nearbyGroundItems();
      const giRows = gItems.length === 0
        ? `<tr><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">(바닥에 아이템 없음 — 드롭하면 여기에 표시됩니다)</td></tr>`
        : gItems.map(({ gi }) => {
            const icon = (ITEM_ICONS[gi.item]) || ({wood:'🪵',stone:'🪨'}[gi.item]) || '📦';
            const label = (ITEM_LABEL[gi.item]) || gi.item;
            const cat = ITEM_CAT[gi.item] || '기타';
            return `<tr><td class="it-icon">${icon}</td><td class="it-name">${label} <span class="it-count">×${gi.count}</span></td><td class="it-cat">${cat}</td><td class="it-action"><button data-pickup="${gi.id}">↑</button></td></tr>`;
          }).join('');
      chestTable = `<div class="inv-col" data-drop-target="ground">
        <div class="inv-col-head">🌍 바닥 (근처 ${gItems.length}개)</div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${giRows}</tbody>
          </table>
        </div></div>`;
    } else if (activeC) {
      const chestCount = Object.values(activeC.data || {}).filter(v => v > 0).length;
      chestTable = `<div class="inv-col" data-drop-target="${activeC.id}">
        <div class="inv-col-head">📦 ${activeC.ownerName || '?'}<span class="col-count">(${chestCount}종)</span></div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${rowsHtml(activeC.data || {}, 'chest', activeC.id)}</tbody>
          </table>
        </div></div>`;
    } else {
      chestTable = `<div class="inv-col"><div class="inv-col-head">컨테이너</div><div style="flex:1"></div></div>`;
    }

    // 우측 탭 — chest들 + 바닥 (항상)
    const chestTabs = conts.map(({ b, d }) => {
      const total = Object.values(b.data || {}).reduce((s, v) => s + v, 0);
      const isActive = b.id === activeContainerId ? 'active' : '';
      return `<div class="cont-tab ${isActive}" data-cid="${b.id}" title="${b.ownerName || '?'} · ${d.toFixed(0)}px">
        <div class="ct-icon">📦</div>
        <div class="ct-count">${total}</div>
      </div>`;
    }).join('');
    const gCount = nearbyGroundItems().length;
    const groundTab = `<div class="cont-tab ${isGround ? 'active' : ''}" data-cid="ground" title="근처 바닥 아이템">
      <div class="ct-icon">🌍</div>
      <div class="ct-count">${gCount}</div>
    </div>`;
    const tabsCol = `<div class="cont-tabs">${chestTabs}${groundTab}</div>`;

    body.innerHTML = `<div class="inv-three-col" style="height:100%">${myTable}${chestTable}${tabsCol}</div>`;
    // 14.53-e: scrollTop 복원
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      if (typeof _savedScroll[tgt] === 'number') el.scrollTop = _savedScroll[tgt];
    });

    // 액션 버튼 (↑ ↓ 픽업)
    body.querySelectorAll('[data-move]').forEach(btn => btn.onclick = () => {
      const kind = btn.dataset.move;
      const item = btn.dataset.item;
      const cid = btn.dataset.cid;
      if (!cid) return;
      // 바닥으로 → drop_item
      if (cid === 'ground') {
        if (kind !== 'mine') return; // 바닥→mine은 픽업 버튼 따로
        sendPrimary({ type: 'drop_item', item, amount: 1 });
        return;
      }
      // chest로/에서 — 모든 아이템 (Phase 14.25)
      if (kind === 'mine') sendPrimary({ type: 'chest_put', buildingId: cid, item, amount: 1 });
      else sendPrimary({ type: 'chest_take', buildingId: cid, item, amount: 1 });
    });
    body.querySelectorAll('[data-pickup]').forEach(btn => btn.onclick = () => {
      sendPrimary({ type: 'pickup_item', giId: btn.dataset.pickup });
    });
    // 14.53: 도구 instance 착용/해제 + 드래그 (hotkey 등록)
    body.querySelectorAll('[data-equiptool]').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.equiptool;
      // 이미 장착이면 해제, 아니면 장착
      if (equipped === id) sendPrimary({ type: 'equip', toolItemId: null });
      else sendPrimary({ type: 'equip', toolItemId: id });
    });
    body.querySelectorAll('tr[data-toolid]').forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-tool-instance', tr.dataset.toolid);
        e.dataTransfer.effectAllowed = 'copy';
      });
      // 14.53: 도구 우클릭 메뉴
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = tr.dataset.toolid;
        const type = tr.dataset.tooltype;
        const isEq = (equipped === id);
        const isHot = (hotkey1 === id);
        showContextMenu(e.clientX, e.clientY, [
          { label: isEq ? '해제' : '착용', onClick: () => sendPrimary({ type: 'equip', toolItemId: isEq ? null : id }) },
          { label: isHot ? '1번 슬롯에서 빼기' : '1번 슬롯에 등록', onClick: () => sendPrimary({ type: 'set_hotkey', toolItemId: isHot ? null : id }) },
        ]);
      });
    });
    // 14.53: 자원/음식 행 우클릭 메뉴 (먹기 / 드롭)
    body.querySelectorAll('.inv-col[data-drop-target="mine"] .inv-table tbody tr:not([data-toolid])').forEach(tr => {
      const btn = tr.querySelector('[data-move][data-item]');
      if (!btn) return;
      const item = btn.dataset.item;
      if (!item) return;
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const opts = [];
        // 음식이면 먹기
        if (foodEffects && foodEffects[item]) {
          opts.push({ label: '🍴 먹기', onClick: () => sendPrimary({ type: 'eat', item }) });
        }
        opts.push({ label: '🗑 1개 버리기 (바닥)', onClick: () => sendPrimary({ type: 'drop_item', item, amount: 1 }) });
        if ((inventory[item] || 0) >= 10) {
          opts.push({ label: '🗑 10개 버리기', onClick: () => sendPrimary({ type: 'drop_item', item, amount: 10 }) });
        }
        if (opts.length) showContextMenu(e.clientX, e.clientY, opts);
      });
    });
    body.querySelectorAll('[data-cid]').forEach(t => {
      if (!t.classList.contains('cont-tab')) return;
      t.onclick = () => { activeContainerId = t.dataset.cid; renderInvPanel(body); };
    });

    // 14.51: 건축 모드 ON일 때 — 내 인벤의 건축물 row 강조 + 클릭 시 placement mode 진입
    if (buildMode) {
      body.querySelectorAll('.inv-col[data-drop-target="mine"] .inv-table tbody tr').forEach(tr => {
        const btn = tr.querySelector('[data-move][data-item]');
        if (!btn) return;
        const item = btn.dataset.item;
        if (!item || !item.startsWith('item_')) return;
        // 강조 스타일
        tr.style.cursor = 'pointer';
        tr.style.outline = '2px solid #f0c674';
        tr.style.background = 'rgba(240,198,116,0.1)';
        tr.title = '클릭 → 건축 모드에서 배치';
        tr.onclick = (e) => {
          // ↑↓ 버튼 클릭은 기존 동작 유지
          if (e.target.tagName === 'BUTTON') return;
          // 기본 dir 결정
          let dir = 'N';
          if (item === 'item_fence') dir = 'NS';
          // 14.54-c2: stair는 N 또는 W만
          // 14.53-h: 항상 현재 player floor에서만 배치 (다른 층 설치 차단)
          placementMode = { itemType: item, floor: myFloor, dir };
          placingDir = dir;
          showNotice(`📍 ${ITEM_LABEL[item] || item} 배치 모드 — 좌클릭=배치, 우클릭=회전, ESC=취소`);
          // 인벤은 그대로 열어 두어도 OK. 닫고 싶으면 toggleInv() 호출.
        };
      });
    }

    // === Phase 14.24: HTML5 드래그 + 폴리시 ===
    body.querySelectorAll('.inv-table tbody tr').forEach(tr => {
      const btn = tr.querySelector('[data-move]');
      if (!btn) return;
      tr.setAttribute('draggable', 'true');
      tr.addEventListener('dragstart', (e) => {
        const item = btn.dataset.item;
        const payload = { kind: btn.dataset.move, item, cid: btn.dataset.cid };
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
        tr.classList.add('dragging');
        // 작은 ghost (이모지 + 라벨)
        const icon = (ITEM_ICONS && ITEM_ICONS[item]) || ({wood:'🪵',stone:'🪨'}[item]) || '📦';
        const label = (ITEM_LABEL && ITEM_LABEL[item]) || item;
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = `${icon} ${label}`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 18, 18);
        setTimeout(() => ghost.remove(), 0);
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        // 모든 drop-zone class 정리
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.drag-over-ground').forEach(el => el.classList.remove('drag-over-ground'));
      });
    });

    // drop targets
    body.querySelectorAll('.cont-tab').forEach(t => {
      t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('drag-over'); });
      t.addEventListener('dragleave', () => t.classList.remove('drag-over'));
      t.addEventListener('drop', (e) => {
        e.preventDefault(); t.classList.remove('drag-over');
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          const amount = dragAmountFromEvent(e);
          handleDrop(payload, t.dataset.cid, amount);
        } catch (err) {}
      });
    });
    body.querySelectorAll('[data-drop-target]').forEach(col => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drag-over');
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          const amount = dragAmountFromEvent(e);
          handleDrop(payload, col.dataset.dropTarget, amount);
        } catch (err) {}
      });
    });
  }

  // Phase 14.24 — Shift=10, Ctrl/Alt/Meta=99, 평소=1
  function dragAmountFromEvent(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return 99;
    if (e.shiftKey) return 10;
    return 1;
  }

  // 드래그 결과 처리: payload(원본) → target(목적지) + amount
  function handleDrop(payload, target, amount = 1) {
    const { kind, item, cid: srcCid } = payload;
    if (kind === 'mine' && target === 'mine') return;
    if (kind === 'chest' && target === srcCid) return;
    if (kind === 'mine' && target === 'ground') {
      sendPrimary({ type: 'drop_item', item, amount });
      return;
    }
    if (kind === 'mine' && target && target !== 'ground' && target !== 'mine') {
      // Phase 14.25: 모든 아이템 상자 OK
      sendPrimary({ type: 'chest_put', buildingId: target, item, amount });
      return;
    }
    if (kind === 'chest' && target === 'mine') {
      sendPrimary({ type: 'chest_take', buildingId: srcCid, item, amount });
      return;
    }
    if (kind === 'chest' && target === 'ground') {
      sendPrimary({ type: 'chest_take', buildingId: srcCid, item, amount });
      setTimeout(() => sendPrimary({ type: 'drop_item', item, amount }), 120);
      return;
    }
  }

  // 빈 화면(canvas) drop → 바닥에 떨어뜨리기 (Shift=10, Ctrl=99)
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over-ground'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over-ground'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over-ground');
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      handleDrop(payload, 'ground', dragAmountFromEvent(e));
    } catch (err) {}
  });

  // === 제작창 (카테고리 + 레시피) ===
  let craftCat = 'tool';
  function renderCraftPanel2(body) {
    // 14.50/14.51: 서버에서 받은 동적 recipes 사용 (axe/saw/hammer + 건축물 + 가공)
    const TOOL_ICON = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    let items = [];
    if (craftCat === 'tool') {
      // recipes = { axe: {wood,stone,label}, ... } (server에서 받음)
      items = Object.entries(recipes || {}).map(([id, r]) => ({
        id, msgType: 'craft', icon: TOOL_ICON[id] || '🔧',
        name: r.label || id,
        cost: { wood: r.wood || 0, stone: r.stone || 0 },
        have: hasToolAlive(id) ? 1 : 0,
        durStr: toolDurStr(id),
      }));
    } else if (craftCat === 'building') {
      // 14.51 buildingRecipes — 제작 → 인벤 → 건축 모드에서 배치
      items = Object.entries(buildingRecipes || {}).map(([id, r]) => {
        const cost = {};
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        return {
          id, msgType: 'craft_building', icon: ITEM_ICONS[id] || '🏗️',
          name: r.label || id,
          cost, needHammer: !!r._needHammer,
          have: inventory[id] || 0,
        };
      });
    } else if (craftCat === 'item') {
      // 14.50 itemRecipes — 통나무→판자 등
      items = Object.entries(itemRecipes || {}).map(([id, r]) => ({
        id, msgType: 'craft_item', icon: ITEM_ICONS[id] || '🪚',
        name: r.label || id,
        cost: r.from || {},
        produces: r.to || {},
        needTool: r.requiresTool,
      }));
    } else if (craftCat === 'food') {
      // cookRecipes (server) 또는 hardcoded fallback
      const cr = cookRecipes || {};
      if (Object.keys(cr).length === 0) {
        items = [
          { id: 'meat_cooked', msgType: 'cook', icon: '🍗', name: '고기 굽기', cost: { meat_raw: 1 }, needCampfire: true },
          { id: 'berry_jam', msgType: 'cook', icon: '🍯', name: '베리잼', cost: { berry: 3 }, needCampfire: true },
          { id: 'water_bottle', msgType: 'cook', icon: '🥤', name: '물병', cost: { fiber: 2 }, needCampfire: true },
        ];
      } else {
        items = Object.entries(cr).map(([id, r]) => ({
          id, msgType: 'cook', icon: ITEM_ICONS[id] || '🍳',
          name: r.label || id, cost: r.cost || {}, needCampfire: true,
        }));
      }
    }
    const cats = [
      { id: 'tool',     label: '🔧 도구' },
      { id: 'building', label: '🏗️ 건축물' },
      { id: 'item',     label: '🪚 가공' },
      { id: 'food',     label: '🍖 음식/요리' },
    ];
    body.innerHTML = `
      <div class="craft-layout">
        <div class="craft-cats">
          ${cats.map(c => `<div class="craft-cat ${c.id===craftCat?'active':''}" data-cat="${c.id}">${c.label}</div>`).join('')}
        </div>
        <div class="craft-items">
          ${items.length === 0 ? '<div style="color:#8a93a0;padding:20px;text-align:center">레시피 없음</div>' : items.map(r => {
            // need 체크
            const costOK = Object.entries(r.cost).every(([k,v]) => (inventory[k]||0) >= v);
            const hammerOK = !r.needHammer || hasToolAlive('hammer');
            const toolOK = !r.needTool || hasToolAlive(r.needTool);
            const canMake = costOK && hammerOK && toolOK;
            const costStr = Object.entries(r.cost).map(([k,v]) => `${(ITEM_ICONS&&ITEM_ICONS[k])||k} ${v}`).join(' · ') || '-';
            const flags = [];
            if (r.needHammer) flags.push('🔨');
            if (r.needTool) flags.push(r.needTool);
            if (r.needCampfire) flags.push('🔥');
            if (r.produces) {
              const prodStr = Object.entries(r.produces).map(([k,v]) => `${(ITEM_ICONS&&ITEM_ICONS[k])||k}×${v}`).join(' ');
              flags.push(`→ ${prodStr}`);
            }
            const haveBadge = (typeof r.have === 'number')
              ? (r.durStr
                  ? ` <span style="color:#7cd97c;font-weight:normal">[${r.durStr}]</span>`
                  : ` <span style="color:#8fc8ff;font-weight:normal">×${r.have}</span>`)
              : '';
            return `<div class="craft-recipe ${canMake?'can-make':'cant-make'}">
              <div class="cr-icon">${r.icon}</div>
              <div class="cr-info"><div class="cr-name">${r.name}${haveBadge}</div><div class="cr-cost">${costStr}${flags.length?' · '+flags.join(' · '):''}</div></div>
              <button data-craft="${r.id}" data-msg="${r.msgType}" ${canMake?'':'disabled'}>제작</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => { craftCat = c.dataset.cat; renderCraftPanel2(body); });
    body.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const id = b.dataset.craft;
      const msgType = b.dataset.msg;
      sendPrimary({ type: msgType, recipe: id });
    });
  }

  // === 건축 모드 패널 (14.51 신 시스템 안내 + ON/OFF 토글) ===
  function renderBuildPanel(body) {
    const status = buildMode ? '<span style="color:#7cd97c">ON</span>' : '<span style="color:#ff7c7c">OFF</span>';
    body.innerHTML = `
      <div style="padding:12px;color:#cfd6e0;line-height:1.6;font-size:13px">
        <h3 style="margin:0 0 12px 0;color:#f0c674">🏗️ 건축 모드 ${status}</h3>
        <button id="buildToggleBtn" style="width:100%;padding:10px;background:${buildMode?'#7cd97c':'#3a4a5a'};color:#fff;border:none;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;margin-bottom:12px">
          ${buildMode ? '⏹ 건축 모드 끄기' : '▶ 건축 모드 켜기'} (B키)
        </button>
        <div style="background:#1a1f25;padding:10px;border-radius:4px;font-size:12px;color:#8a93a0">
          <p style="margin:0 0 8px 0;color:#f0c674;font-weight:bold">📋 사용법</p>
          <p style="margin:0 0 6px 0">① 🔨 <b>제작</b> 패널에서 "건축물" 탭 → 벽/바닥 제작 (자원+망치 소비) → 인벤에 들어감</p>
          <p style="margin:0 0 6px 0">② <b>B키</b>로 건축 모드 ON</p>
          <p style="margin:0 0 6px 0">③ <b>I</b>로 인벤 → 건축물 아이템 클릭 → placement 모드</p>
          <p style="margin:0 0 6px 0">④ 맵 좌클릭 → <b>3초 progress</b> → 배치 (이동 시 취소)</p>
          <p style="margin:0 0 6px 0">⑤ 우클릭 = 회전 · ESC = placement 종료</p>
          <p style="margin:0 0 0 0">⑥ 건축물에 마우스 hover → 좌클릭 → <b>3초 progress</b> → 분해 (인벤 +1)</p>
        </div>
        <div style="background:#2a1f15;padding:10px;border-radius:4px;font-size:12px;color:#c89070;margin-top:8px">
          ⚠️ 옛 즉시 빌드 시스템은 제거됨. 모든 건축물 = 제작→인벤→배치.
        </div>
      </div>`;
    document.getElementById('buildToggleBtn').onclick = () => {
      buildMode = !buildMode;
      if (!buildMode) placementMode = null;
      showNotice(buildMode ? '🏗️ 건축 모드 ON' : '건축 모드 OFF');
      renderBuildPanel(body);
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    };
  }

  // === 거래소 패널 (기존 modal 코드 재활용) ===
  function renderMarketPanel(body) {
    body.innerHTML = `
      <div class="market-form">
        <label>아이템:
          <select id="m2Item"><option value="wood">🪵 나무</option><option value="stone">🪨 돌</option></select>
        </label>
        <label>수량: <input id="m2Amount" type="number" value="1" min="1" max="99" /></label>
        <label>개당 가격: <input id="m2Price" type="number" value="1" min="1" max="99" /></label>
        <button id="m2Buy" class="buy">구매</button>
        <button id="m2Sell" class="sell">판매</button>
      </div>
      <div class="market-hint">반대 통화로 거래 (나무 거래는 돌로, 돌 거래는 나무로). 게스트 불가.</div>
      <div id="m2Orders" style="margin-top:12px"></div>`;
    document.getElementById('m2Buy').onclick = () => {
      const item = document.getElementById('m2Item').value;
      const amount = parseInt(document.getElementById('m2Amount').value, 10);
      const price = parseInt(document.getElementById('m2Price').value, 10);
      sendPrimary({ type: 'market_order', side: 'buy', item, amount, price });
    };
    document.getElementById('m2Sell').onclick = () => {
      const item = document.getElementById('m2Item').value;
      const amount = parseInt(document.getElementById('m2Amount').value, 10);
      const price = parseInt(document.getElementById('m2Price').value, 10);
      sendPrimary({ type: 'market_order', side: 'sell', item, amount, price });
    };
    // 활성 주문
    fetch('/market/orders').then(r => r.json()).then(d => {
      const orders = d.orders || [];
      document.getElementById('m2Orders').innerHTML = '<div class="inv-col-head">활성 주문</div>' +
        (orders.length ? orders.map(o => `<div class="sp-list-row">${o.side==='buy'?'🟢 구매':'🔴 판매'} ${o.item} ×${o.amount} @ ${o.price}</div>`).join('') : '<div style="color:#6c7686;padding:10px">(주문 없음)</div>');
    }).catch(() => {});
  }
})();
