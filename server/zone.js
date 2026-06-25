// 존 서버 — 한 지역의 시뮬레이션을 권위적으로 처리
// 환경변수 ZONE_ID, PORT 로 어떤 존을 띄울지 결정
//
// 실제 분산 배포에서는 각 ZONE을 다른 국가의 서버에서 실행하면 됨.
// 프로토타입에서는 같은 머신에서 다른 포트로 시뮬레이션.

const WebSocket = require('ws');
const http = require('http');
const { ZONES, WORLD, isNight, worldPhase, darknessLevel, findZoneAt, worldDistance, worldDeltaX } = require('./zone-config');
const db = require('./zone-local-db'); // 로컬 zone DB — players 없음
const central = require('./central-client'); // central HTTP 클라이언트
const { Quadtree } = require('./quadtree'); // spatial index — O(N²) 검색 회피
const { ChunkManager, CHUNK_SIZE, generateChunkResources, generateVillagesForZone, generateCoastlineWaterTiles } = require('./chunk'); // 청크 단위 entity 분류 + procedural + 해안선
const { findPath: pfFindPath } = require('./pathfind'); // Phase 14.49-b: NPC A* pathfinding
const { ANIMALS } = require('./animals');  // Phase 5-6: 동물 mob 36종 catalog
const harvestedSeeds = new Set(); // 채집된 시드 자원 (DB에서 load)

// === 활성 청크 (12.2.b) — 사람 player + observer 위치 주변 청크만 시뮬레이션 ===
// 비활성 청크의 mob/NPC는 멈춤 — CPU 절약. 청크 시스템의 핵심.
const CHUNK_ACTIVE_RADIUS = 1200; // 시야(650) + AOI(800) + 약간 마진
let activeChunkKeys = new Set();
// 청크 활성/비활성 transition 감지 + procedural 자원 spawn/despawn
let prevActiveChunkKeys = new Set();
// 건물 broadcast 스태거 — 텔포/고속이동 시 한 마을 집(벽 수백채)이 한 틱에 다 가면 클라가 멈춤.
//   활성청크 건물을 큐에 넣고 틱당 BUILDING_SEND_PER_TICK채만 buildings_spawn. (건물 단위라 한 청크에
//   집 여러채여도 분산됨. 걷는 속도면 큐가 안 쌓여 즉시.)
let _buildingSendQueue = [];
const BUILDING_SEND_PER_TICK = 120;
function updateActiveChunks() {
  const newActive = new Set();
  // 사람 player 시야 기반 활성 청크
  for (const p of players.values()) {
    if (p.isNpc) continue;
    if (p.hp <= 0) continue;
    const { cx: pcx, cy: pcy } = chunkManager.chunkXY(p.x, p.y);
    const r = Math.ceil(CHUNK_ACTIVE_RADIUS / chunkManager.chunkSize);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const cx = pcx + dx, cy = pcy + dy;
      if (cx < 0 || cy < 0 || cx >= chunkManager.colsX || cy >= chunkManager.colsY) continue;
      newActive.add(chunkManager.keyOf(cx, cy));
    }
  }
  for (const data of observers.values()) {
    const { cx: pcx, cy: pcy } = chunkManager.chunkXY(data.viewerX, data.viewerY);
    const r = Math.ceil(CHUNK_ACTIVE_RADIUS / chunkManager.chunkSize);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const cx = pcx + dx, cy = pcy + dy;
      if (cx < 0 || cy < 0 || cx >= chunkManager.colsX || cy >= chunkManager.colsY) continue;
      newActive.add(chunkManager.keyOf(cx, cy));
    }
  }
  // transition: 새로 활성된 청크 → 즉시 activate (자원 spawn 즉시, 건물은 activateChunk 안에서 큐로)
  for (const k of newActive) {
    if (!prevActiveChunkKeys.has(k)) {
      const [cx, cy] = k.split('_').map(Number);
      activateChunk(cx, cy);
    }
  }
  // transition: 비활성된 청크 → 시드 자원 despawn (즉시 — 가벼움)
  for (const k of prevActiveChunkKeys) {
    if (!newActive.has(k)) {
      const [cx, cy] = k.split('_').map(Number);
      deactivateChunk(cx, cy);
    }
  }
  prevActiveChunkKeys = newActive;
  activeChunkKeys = newActive;
  // 건물 broadcast 큐 드레인 — 틱당 BUILDING_SEND_PER_TICK채만. 텔포로 한 마을 수백채가 큐에 쌓여도
  //   틱당 120채씩 나눠 보내 클라가 안 멈춤. 걷는 속도면 큐가 비어있어 영향 없음.
  if (_buildingSendQueue.length) {
    const batch = _buildingSendQueue.splice(0, BUILDING_SEND_PER_TICK);
    broadcast({ type: 'buildings_spawn', buildings: batch });
  }
}

// === 건물 lazy-load (GC 폭주 수정) ===
// 건물(NPC 집 3.3만채 등)은 DB(SQLite=C heap)에만 상주. 활성 청크 건물만 JS 객체로 materialize.
//   → 매 틱 살아있는 building 객체가 활성청크 수백채로 줄어 minor/major GC 정지 제거.
// id는 DB rowid 기반 결정값('b'+dbId) — deactivate→reactivate·재시작에도 클라 참조 안정.
//   dedupe: 같은 청크에 이미 같은 id(=같은 dbId)가 있으면(방금 놓은 플레이어 건물 등) skip → 중복 없음.
function materializeBuildingsInChunk(cx, cy) {
  const cs = chunkManager.chunkSize;
  const x0 = cx * cs, x1 = (cx + 1) * cs;
  const y0 = cy * cs, y1 = (cy + 1) * cs;
  let rows;
  try { rows = db.getBuildingsInRect(x0, y0, x1, y1); } catch (e) { return; }
  let stairAdded = false;
  for (const row of rows) {
    const id = `b${row.id}`;
    if (buildings.has(id)) continue; // 이미 메모리에 있음(플레이어 방금 건축 등) — 중복 방지
    const parsed = row.data ? JSON.parse(row.data) : null;
    const floor = (parsed && typeof parsed.floor === 'number') ? parsed.floor : 0;
    const b = {
      id, dbId: row.id,
      type: row.type,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      x: row.x, y: row.y,
      data: parsed,
      floor,
    };
    buildings.set(id, b);
    chunkManager.insertBuilding(b); // b._chunkKey 셋 (insertBuilding 내부)
    if (row.type === 'stair') stairAdded = true;
  }
  if (stairAdded) stairCellDirty = true; // stair cache 재구축 트리거 (active 건물만 인덱싱)
}

// 활성화 — 그 청크의 시드 자원 생성
// 14.46-b-smooth-fix: water tile에 떨어진 자원(나무·돌·약초 등)은 스킵.
//   기존: 해안선 water tile 위에 나무·돌 spawn → 바다에 떠 있는 모양 버그.
function activateChunk(cx, cy) {
  // 건물 lazy-load: 이 청크 건물을 DB에서 메모리로 (cleanZone보다 먼저 — cleanZone엔 건물 0이라 무해).
  materializeBuildingsInChunk(cx, cy);
  // Phase 5-G: cleanZone (한반도 강·호수 검증용) — 자원 spawn skip
  if (ZONE.cleanZone) return;
  const seedResources = generateChunkResources(ZONE_ID, ZONE.biome, cx, cy, chunkManager.chunkSize, harvestedSeeds);
  const spawned = [];
  for (const r of seedResources) {
    if (isTerrainBlockedLocal(r.x, r.y)) continue; // 바다 위 자원 차단
    resources.set(r.id, r);
    chunkManager.insertResource(r);
    spawned.push(r);
  }
  if (spawned.length) {
    resourcesDirty = true;
    broadcast({ type: 'resources_spawn', resources: spawned });  // 배치 — 숲 수백 그루를 개별로 안 보냄
  }
  // AOI 건물: 이 청크 건물(NPC 집 등)을 broadcast 큐에 (틱당 일부씩 — 텔포 폭주 방지)
  const _ch = chunkManager.chunks.get(chunkManager.keyOf(cx, cy));
  if (_ch && _ch.buildings.size) for (const b of _ch.buildings.values()) _buildingSendQueue.push(b);
}

// 비활성화 — 그 청크의 시드 자원만 제거 (수동 자원은 안 건드림)
function deactivateChunk(cx, cy) {
  const c = chunkManager.chunks.get(chunkManager.keyOf(cx, cy));
  if (!c) return;
  // AOI 건물: 비활성화 시 클라에서 제거 + 서버 메모리에서도 해제 (GC 폭주 수정).
  //   DB엔 그대로 남음 → 재활성 시 materializeBuildingsInChunk가 다시 로드(buildings_spawn).
  //   플레이어가 놓은 건물도 메모리에서만 내림(DB 보존) — 비활성 청크라 곁에 사람 없음.
  if (c.buildings.size) {
    broadcast({ type: 'buildings_removed', ids: Array.from(c.buildings.keys()) });
    // 아직 안 보낸 큐의 이 청크 건물은 빼기 (보내자마자 제거되는 낭비·불일치 방지)
    if (_buildingSendQueue.length) { const _k = chunkManager.keyOf(cx, cy); _buildingSendQueue = _buildingSendQueue.filter(b => b._chunkKey !== _k); }
    // 실제 메모리 해제 — buildings Map + chunk에서 제거. (snapshot 후 순회: removeBuilding이 c.buildings 변형)
    let stairRemoved = false;
    const _bs = Array.from(c.buildings.values());
    for (const b of _bs) {
      if (b.type === 'stair') stairRemoved = true;
      buildings.delete(b.id);
      chunkManager.removeBuilding(b);
    }
    if (stairRemoved) stairCellDirty = true; // stair cache 무효화 (active 건물만 인덱싱)
  }
  const toRemove = [];
  for (const r of c.resources.values()) if (r.isSeed) toRemove.push(r);
  if (!toRemove.length) return;
  const ids = [];
  for (const r of toRemove) {
    resources.delete(r.id);
    chunkManager.removeResource(r);
    ids.push(r.id);
  }
  resourcesDirty = true;
  broadcast({ type: 'resources_removed', ids });  // 배치 제거
}
function isChunkActiveKey(key) { return activeChunkKeys.has(key); }
function isPositionActive(x, y) {
  const { cx, cy } = chunkManager.chunkXY(x, y);
  return activeChunkKeys.has(chunkManager.keyOf(cx, cy));
}
// AOI: 활성 청크 안 건물만 (welcome용). 전 존 건물을 한 번에 안 보냄 — NPC 집 수만개로 welcome 폭주 방지.
//   나머지는 청크 활성/비활성 시 buildings_spawn / buildings_removed 로 점점 전송 (자원과 동일).
function activeChunkBuildings() {
  const out = [];
  for (const k of activeChunkKeys) { const c = chunkManager.chunks.get(k); if (c) for (const b of c.buildings.values()) out.push(b); }
  return out;
}

// === Spatial index — 매 tick 재구축 ===
// 모든 nearest-search (visiblePlayers, tryGather 등)에서 사용. message handler에서도
// stale 33ms 정도는 OK (다음 tick에 재구축).
let qtPlayers, qtMobs, qtResources, qtBuildings;
let resourcesDirty = true;  // 자원(나무·돌)은 static — 변경됐을 때만 quadtree 재구축
let _lastResRebuild = 0;    // qtResources 전체 재구축 throttle (5Hz 상한)
function rebuildSpatialIndex() {
  const W = ZONE.zoneWidth, H = ZONE.zoneHeight;
  qtPlayers   = new Quadtree(0, 0, W, H);
  qtMobs      = new Quadtree(0, 0, W, H);
  qtBuildings = new Quadtree(0, 0, W, H);
  for (const p of players.values()) {
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC(플레이어 먼 비활성 청크) — 인덱싱 스킵 → 1000명 확장
    qtPlayers.insert({ x: p.x, y: p.y, ref: p });
  }
  for (const m of mobs.values())       qtMobs.insert({ x: m.x, y: m.y, ref: m });
  // qtBuildings — 활성청크 건물만 인덱싱. queryCircle은 전부 플레이어 주변(활성청크)이라 충분.
  //   집 ON이면 전 존 건물 3만+채 → 매틱 전체 재삽입은 ~7ms(22% CPU). 활성청크만이면 ~수백채.
  for (const k of activeChunkKeys) { const c = chunkManager.chunks.get(k); if (c) for (const b of c.buildings.values()) qtBuildings.insert({ x: b.x, y: b.y, ref: b }); }
  // 자원은 안 움직임 — 매 tick 재삽입하면 숲 수천 그루를 30Hz로 재구축해 1 vCPU가 죽음.
  // 청크 활성/비활성·채집으로 바뀐 경우(resourcesDirty)에만 다시 만든다.
  // ★ 추가: 마을 NPC 채집·이동으로 resourcesDirty가 매틱 떠도, 전체 재구축은 자원 수만큼 비쌈
  //   (5만 그루 ≈ 18ms, 10만 ≈ 59ms). 그래서 dirty여도 200ms(5Hz) 상한으로 throttle.
  //   자원 검색·트리 충돌은 200ms staleness 무해(채집 후보가 한 박자 늦게 갱신될 뿐).
  if (!qtResources || (resourcesDirty && Date.now() - _lastResRebuild >= 200)) {
    qtResources = new Quadtree(0, 0, W, H);
    for (const r of resources.values()) qtResources.insert({ x: r.x, y: r.y, ref: r });
    resourcesDirty = false;
    _lastResRebuild = Date.now();
  }
}

// 플레이어 변경을 central에 fire-and-forget 저장
function savePlayer(player, extra = {}) {
  if (!player.playerId || player.playerId.startsWith('anon_') || player.playerId.startsWith('npc_')) return;
  // wood/stone은 별도 컬럼, 나머지 아이템(berry, meat_raw 등)은 inventory_json에
  const inv = player.inventory || {};
  const { wood = 0, stone = 0, ...extInv } = inv;
  const patch = {
    wood, stone,
    inventory_json: JSON.stringify(extInv),
    hunger: Math.round(player.hunger ?? 100),
    thirst: Math.round(player.thirst ?? 100),
    violation_points: Math.round(player.vp ?? 0),
    tribe_id: player.tribeId ?? null,
    floor: player.floor || 0,
    // 14.53: 새 format — { toolItems, hotkey1, equipped } 전체 직렬화
    tools_json: JSON.stringify({
      toolItems: player.toolItems || [],
      hotkey1: player.hotkey1 || null,
      equipped: player.equipped || null,
    }),
    equipped: player.equipped || null,
    last_zone: extra.last_zone ?? null, // 명시적으로 넘긴 zone만 변경
    last_x: extra.last_x ?? player.x,
    last_y: extra.last_y ?? player.y,
    color: player.color,
    ...extra,
  };
  central.updatePlayer(player.playerId, patch).catch(e =>
    console.warn(`[${process.env.ZONE_ID || 'zone'}] central save 실패 (${player.playerId}):`, e.message)
  );
}

const ZONE_ID = process.env.ZONE_ID || 'hanbando';
if (!ZONES[ZONE_ID]) {
  console.error(`[fatal] ZONE_ID=${ZONE_ID} 가 zone-config에 없음. 사용 가능: ${Object.keys(ZONES).join(', ')}`);
  process.exit(1);
}
const PORT = parseInt(process.env.PORT || ZONES[ZONE_ID]?.port || '3020', 10);
const ZONE = ZONES[ZONE_ID];
// Phase 14.46-a: chunkManager는 zone별 크기 사용
const chunkManager = new ChunkManager(ZONE.zoneWidth, ZONE.zoneHeight);
// Phase 14.46-a: 각 변에 이웃 zone이 있는지 (월드 가장자리 판정용 — ice barrier 등).
// 이웃 zone 자체가 무엇인지는 핸드오프 시점 abs lookup으로 결정. 여기는 단순 boolean.
const NEIGHBOR = {
  hasNorth: !!findZoneAt(ZONE.worldOffsetX + ZONE.zoneWidth/2, ZONE.worldOffsetY - 1),
  hasSouth: !!findZoneAt(ZONE.worldOffsetX + ZONE.zoneWidth/2, ZONE.worldOffsetY + ZONE.zoneHeight + 1),
  hasWest:  !!findZoneAt(ZONE.worldOffsetX - 1, ZONE.worldOffsetY + ZONE.zoneHeight/2),
  hasEast:  !!findZoneAt(ZONE.worldOffsetX + ZONE.zoneWidth + 1, ZONE.worldOffsetY + ZONE.zoneHeight/2),
};
// Phase 14.46-a: 마을 자동 생성 — 모듈 로드 시 mob spawn 등이 isNearVillage를 호출하므로 일찍 정의해야 함.
// Phase 4b: canadia는 시뮬 통합 모드 — 자동 마을 비활성화 (시뮬에서 마을 받음)
const VILLAGES = (ZONE_ID === 'canadia')
  ? []
  : ((ZONE.useHardcodedVillages && require('./terrain').getZoneVillages(ZONE_ID)) || generateVillagesForZone(ZONE));
{ const _hv = ZONE.useHardcodedVillages && require('./terrain').getZoneVillages(ZONE_ID); if (_hv) console.log(`[${ZONE_ID}] 하드코딩 마을 ${_hv.length}개 사용 (v9). 성능 최적화 후에만 켬.`); }
if (ZONE_ID === 'canadia') console.log(`[canadia] 자동 마을 비활성 (Phase 4b 시뮬 통합 모드)`);
const VILLAGE_SAFE_RADIUS = 600; // 늑대 이 안에 spawn X (마을 안전구역). isNearVillage()도 이거 씀.

// Phase 14.46-b-mini: 해안선 water tiles — ocean 인접 가장자리에 물 strip.
// ocean zone은 빈 set 받고 isOcean flag로 처리. 육지 zone만 실제 water tiles 보유.
// 주의: BUILDING_SIZE가 아래 ~218줄에서 정의되므로 여기선 리터럴 32 직접 사용 (TDZ 회피).
const OCEAN_RECTS = Object.values(ZONES).filter(z => z.isOcean).map(z => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const WATER_TILES = generateCoastlineWaterTiles(
  { ...ZONE, id: ZONE_ID },
  32, // = BUILDING_SIZE
  findZoneAt,
  OCEAN_RECTS
);
console.log(`[${ZONE_ID}] 🌊 해안선: ${WATER_TILES.size} water tiles (ocean=${ZONE.isOcean?'전체':'edge only'})`);
// Phase 5-1-fix: inland water (강·호수)는 zone start pre-compute 안 함 (수 분 timeout).
// 콜라이더 호출 시 terrain.isWaterCellLocal로 동적 검사 — cell center 기준 (시각과 일치).
const _terrain = require('./terrain');
function isWaterTileLocal(localX, localY) {
  if (ZONE.isOcean) return true;
  if (localX < 0 || localY < 0 || localX >= ZONE.zoneWidth || localY >= ZONE.zoneHeight) return false;
  const tx = Math.floor(localX / 32);
  const ty = Math.floor(localY / 32);
  if (WATER_TILES.has(`${tx}_${ty}`)) return true;
  // Phase 5-1-fix2: cell center로 검사 — 시각(cell-grid raster)과 일치.
  // sub-pixel 좌표 그대로 쓰면 콜라이더는 sub-pixel, 시각은 cell-grid → mismatch.
  const cellCx = tx * 32 + 16;
  const cellCy = ty * 32 + 16;
  return _terrain.isWaterCellLocal(ZONE_ID, cellCx, cellCy);
}
// Phase 5-H: 산맥 바위 셀 — 통행 불가. 물 > 바위 우선·고개 처리는 terrain.isRockCellLocal에서.
function isRockTileLocal(localX, localY) {
  if (ZONE.isOcean) return false;
  if (localX < 0 || localY < 0 || localX >= ZONE.zoneWidth || localY >= ZONE.zoneHeight) return false;
  const tx = Math.floor(localX / 32);
  const ty = Math.floor(localY / 32);
  return typeof _terrain.isRockCellLocal === 'function' && _terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
}
// 지형 차단 통합 (물 + 바위) — 이동·스폰·경로·텔레포트 검증 공용
function isTerrainBlockedLocal(x, y) { return isWaterTileLocal(x, y) || isRockTileLocal(x, y); }
// 메트릭 카운터
const metrics = {
  startedAt: Date.now(),
  handoffs_out: 0,
  handoffs_in: 0,
  handoff_acks: 0,
  handoff_timeouts: 0,
  chats: 0,
  attacks: 0,
  builds: 0,
  ws_connects: 0,
  ws_closes: 0,
};

if (!ZONE) {
  console.error(`[FATAL] Unknown zone: ${ZONE_ID}. Valid: ${Object.keys(ZONES).join(', ')}`);
  process.exit(1);
}

// === 인공 지연 시뮬레이션 ===
// 각 zone이 다른 국가에 있다고 가정. 송수신 양쪽에 단방향 지연 적용 → 총 RTT = 2x.
const LATENCY_MS = parseInt(process.env.LATENCY_MS || String(ZONE.simulatedLatencyMs || 0), 10);

const TICK_HZ = 30;
const MOVE_SPEED = 220; // px/sec
// Phase 14.40 — Shift 달리기: 1.6× 속도, hunger/thirst 1.5× 빠른 감소.
// 단 hunger/thirst가 5 이하면 자동 해제 (지쳐서 못 뜀).
const SPRINT_MULT = 1.6;
const SPRINT_DRAIN_MULT = 1.5;
const SPRINT_MIN_GAUGE = 5;
// Phase 14.41 — 사망/구조: downed 상태 유지 시간, 구조 가능 윈도우.
// 0~10초: 구조 가능 + 즉시 부활 가능.  10초 후: 부활만 가능.
const RESCUE_WINDOW_MS = 10000;
const RESCUE_RANGE_PX = 80;
// per-zone player cap — 환경변수로 조정. 차면 새 접속 거부.
// 부하 테스트로 측정한 단일 코어 한계 ~300. 안전 마진으로 150 기본.
const PLAYER_CAP = parseInt(process.env.PLAYER_CAP || '150', 10);
const GATHER_RANGE = 48;
const MAX_RESOURCES = 0; // Phase 12.2.e: procedural — 청크 활성화 시 lazy 생성. 이 변수 더 안 씀.

// Phase 5-G: hardcoded terrain (한반도·인접 zone)을 클라에 welcome으로 전달
function getHardcodedTerrainForZone() {
  try {
    const _terrain = require('./terrain');
    const _all = _terrain._getHardcoded && _terrain._getHardcoded();
    if (_all && _all[ZONE_ID]) return _all[ZONE_ID];
  } catch {}
  return null;
}

// === 상태 ===
const players = new Map();      // pid -> { ws, x, y, vx, vy, name, inventory, handingOff }
const observers = new Map();    // ws -> { viewerX, viewerY, lastSeen }
const resources = new Map();
const AOI_RADIUS = 800;         // 클라 VIEW_RADIUS(650) + 여유. 이 안의 player만 tick에 포함
const claims = new Map();
const buildings = new Map();    // id -> { id, dbId, type, ownerId, ownerName, x, y, data }
const mobs = new Map();         // mid -> { mid, type, x, y, vx, vy, hp, maxHp, aggroTarget, lastAttackAt, wanderUntil }
// Phase 5-I: 경계 전투 — 이웃 zone 플레이어 ghost(절대좌표) + 화살 발사체
const ghostPlayers = new Map(); // playerId -> { ax, ay, vx, vy, name, srcZone, recvAt } (절대좌표, 이웃 zone이 동기화)
const ghostBuildings = new Map(); // key "srcZone:id" -> { acx, acy, side, type, floor } (절대 cell, 경계 너머 벽 콜라이더)
const arrows = new Map();       // aid -> { aid, x, y, vx, vy, ownerPid, ownerId, dmg, ttl } (자기 zone 권위, local 좌표)
let nextArrowId = 1;
const ARROW_SPEED = 600;        // px/s (sim과 동일)
const ARROW_HIT_R = 40;
const ARROW_DMG = 25;
const ARROW_TTL_MS = 4000;
const GHOST_TTL_MS = 1500;      // 이 시간 넘게 갱신 안 된 ghost 제거
// Phase 5-K2: 경계 핸드오프 히스테리시스. 경계를 살짝 스치는 정도(0~COMMIT)로는 안 넘김.
// 이웃 zone으로 COMMIT px 이상 확실히 들어갔을 때만 핸드오프 → 경계에서 왔다갔다 해도
// 핑퐁 안 남(시간 쿨다운 불필요). 도착도 경계에서 이만큼 안쪽이라 즉시 되넘김 불가.
const HANDOFF_COMMIT = 256;     // px — 경계 양쪽 이 거리의 "겹침 띠"는 자유 이동

// Phase 5-7: 동물 사체 + 도살 시스템
const corpses = new Map();      // cid -> { cid, mobType, x, y, drops, spawnTime, killerPid }
let nextCorpseId = 1;
const CORPSE_DECAY_MS = 5 * 60 * 1000;  // 5분 후 부패

function spawnCorpse(mob, killerPid) {
  const cid = `c${nextCorpseId++}`;
  const def = ANIMALS[mob.type];
  const drops = (def && def.drops) ? def.drops : { meat_game: 1, leather: 1 };  // fallback (옛 mob)
  const corpse = {
    cid, mobType: mob.type,
    x: mob.x, y: mob.y,
    drops, spawnTime: Date.now(),
    killerPid,
  };
  corpses.set(cid, corpse);
  broadcast({ type: 'corpse_added', corpse: { cid, mobType: corpse.mobType, x: corpse.x, y: corpse.y, drops: corpse.drops } });
  return corpse;
}

function butcherCorpse(player, cid) {
  const corpse = corpses.get(cid);
  if (!corpse) { send(player.ws, { type: 'notice', text: '사체 없음' }); return; }
  const dist = Math.hypot(player.x - corpse.x, player.y - corpse.y);
  if (dist > 80) { send(player.ws, { type: 'notice', text: '너무 멀어' }); return; }
  // drop → 인벤
  const parts = [];
  for (const [item, amt] of Object.entries(corpse.drops)) {
    player.inventory[item] = (player.inventory[item] || 0) + amt;
    parts.push(`${item} ${amt}`);
  }
  const def = ANIMALS[corpse.mobType];
  const koName = def?.ko || corpse.mobType;
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `${koName} 도살 +${parts.join(', ')}` });
  savePlayer(player);
  corpses.delete(cid);
  broadcast({ type: 'corpse_removed', cid });
}

// welcome 후 player에게 기존 corpses 전송
function sendCorpsesInit(ws) {
  if (corpses.size === 0) return;
  const arr = [...corpses.values()].map(c => ({ cid: c.cid, mobType: c.mobType, x: c.x, y: c.y, drops: c.drops }));
  send(ws, { type: 'corpses_init', corpses: arr });
}

// 부패 cleanup — 30초마다
setInterval(() => {
  const now = Date.now();
  for (const [cid, c] of corpses) {
    if (now - c.spawnTime > CORPSE_DECAY_MS) {
      corpses.delete(cid);
      broadcast({ type: 'corpse_removed', cid });
    }
  }
}, 30000);
const BUILDING_SIZE = 32;
const DEBUG_COLLIDER = process.env.DEBUG_COLLIDER === '1'; // 명시적으로 켤 때만 (env DEBUG_COLLIDER=1)
// === 틱 스파이크 원인 진단: GC 정지 관측 (>30ms major GC면 로그) ===
try {
  const { PerformanceObserver } = require('perf_hooks');
  const _gcObs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.duration > 30) console.log(`[${ZONE_ID}] ⚠️ GC 정지 ${e.duration.toFixed(0)}ms (kind=${e.detail?.kind ?? '?'})`);
    }
  });
  _gcObs.observe({ entryTypes: ['gc'] });
} catch (e) { /* perf_hooks 없으면 skip */ }
// 14.50: 목공 사슬 — log(통나무) → plank(판자, saw 필요) → 벽/바닥/문/울타리 (hammer 필요)
//   wood = log (의미 변경). plank는 새 자원.
//   목공 type (wall/floor/fence/door)는 plank만 사용 + hammer 필수.
//   기타 type (chest/campfire/farmland/stair)은 기존 호환 유지.
// 14.52: 재료는 plank/wood만 (stone 제거). 망치/톱은 재료 아닌 "도구" — 내구도 소비.
const BUILDING_COST = {
  wall:     { plank: 2, _needHammer: true },                       // 판자 2 + 망치
  floor:    { plank: 1, _needHammer: true },                       // 판자 1 + 망치
  fence:    { plank: 1, _needHammer: true },                       // 판자 1 + 망치 (cell 전체, 시야 통과)
  door:     { plank: 2, _needHammer: true },                       // 판자 2 + 망치
  chest:    { plank: 4, _needHammer: true },                       // 판자 4 + 망치
  campfire: { wood: 3 },                                           // 통나무 3 (목공 X)
  farmland: { seed: 'seed_berry' },                                // 씨앗
  stair:    { plank: 4, _needHammer: true },                       // 판자 4 + 망치
};
const CROP_GROW_MS = 60 * 1000;
// 14.50: door도 닫혔을 때 blocking. fence는 cell 차지하지만 통과 가능 (사용자 의도: 시야는 통과, collider만 차단).
const BLOCKING_BUILDINGS = new Set(['wall', 'fence', 'door']);
// 14.49-e2: 층 높이 2배 (32 → 64). 벽·계단도 같이 2배.
const BUILDING_HEIGHT = { wall: 64, floor: 4, fence: 32, door: 64, chest: 24, campfire: 20, farmland: 4, stair: 64 };
// Phase 14.25: chest 저장 가능 아이템 (모든 자원 + 도구 + 음식)
const CHEST_ALLOWED_ITEMS = new Set([
  'wood', 'stone', 'ore', 'herb',
  'berry', 'fiber', 'meat_raw', 'meat_cooked', 'hide',
  'berry_jam', 'water_bottle', 'seed_berry',
  'axe', 'pickaxe', 'sword',
]);
// Phase 14.14: 건축물 maxHp — 손상=상태 전이 (영구파괴 X, 수리 가능)
const BUILDING_MAX_HP = { wall: 80, fence: 30, chest: 50, campfire: 20, farmland: 10, stair: 60, floor: 40 };
const FLOOR_HEIGHT = 64; // 14.49-e2: 32 → 64

// 14.49-e3-perf: stair cell 캐시 — O(1) lookup. (NPC 마을 spawn 시 addBlock에서 참조하므로 위로 끌어올림)
const stairCellCache = new Map(); // "cx_cy" → { stairId, step }
let stairCellDirty = true;

// === 위반 점수 (vp) — PvP 공격·타인 사유지 침범 시 누적, 시간당 감소 ===
const VP_TRESPASS_GATHER = 3;   // 남 영지 자원 채집 시도
const VP_ATTACK_PLAYER   = 8;   // PvP 공격 한 번
const VP_DECAY_PER_SEC   = 10 / 3600; // 시간당 -10
const VP_THRESHOLD       = 50;  // 이 이상이면 본인 사유지 보호 해제
const VP_MAX             = 100;

// Phase 5-6b: MOB_DEFS를 ANIMALS catalog에서 동적 생성 (36종 다 zone에 spawn 가능)
const MOB_DEFS = {};
for (const [id, a] of Object.entries(ANIMALS)) {
  MOB_DEFS[id] = {
    maxHp: a.hp || 10,
    speed: (a.speed || 3) * 30,            // animals.speed 5 → 150 px/sec
    aggroRange: a.aggressive ? 100 : 0,
    damage: a.aggressive ? Math.max(2, Math.floor(a.hp / 20)) : 0,
    sightRange: a.aggressive ? 200 : 0,
    loot: a.drops && Object.keys(a.drops).length ? a.drops : { meat_game: 1 },
    pack: a.pack || 1,
    tameFood: a.breeding ? (a.feed || 'wheat') : null,
    tameNeed: a.breeding ? 3 : null,
  };
}
const TAME_FOLLOW_DIST = 200; // 주인이 이만큼 멀어지면 따라옴
const TAME_FOLLOW_STOP = 80;  // 이만큼 가까우면 정지
const WOLF_TERRITORY_RADIUS = 700; // 늑대가 home에서 이만큼 벗어나면 추적 중단
const WOLF_WANDER_RADIUS = 250;    // 늑대 배회는 home 주변 이 범위 안
const WOLF_RETURN_SPEED_MULT = 0.5; // home 복귀 시 속도 (느긋하게)

// 같은 팩 늑대들에 어그로 전파 — 단 자기 영역 안에 있는 멤버만
function aggroPackmates(sourceWolf, targetPid) {
  if (!sourceWolf.packId) return;
  for (const other of mobs.values()) {
    if (other === sourceWolf) continue;
    if (other.type !== 'wolf' || other.packId !== sourceWolf.packId) continue;
    if (other.tameOwner) continue;          // 길든 늑대는 제외
    if (other.aggroTarget) continue;        // 이미 자기 타겟 있으면 유지
    if (Math.hypot(other.x - other.homeX, other.y - other.homeY) > WOLF_TERRITORY_RADIUS) continue;
    other.aggroTarget = targetPid;
  }
}

// === Crafting ===
// 도구 레시피: 인벤토리에 도구로 들어감 (player.tools)
// 14.50: saw/hammer 추가 (목공 도구). plank 변환 레시피는 별도 (saw 필요).
const RECIPES = {
  axe:     { wood: 5, stone: 2, label: '도끼' },
  pickaxe: { wood: 3, stone: 5, label: '곡괭이' },
  sword:   { wood: 2, stone: 8, label: '검' },
  saw:     { wood: 2, stone: 4, label: '톱' },    // 통나무 → 판자 가공용
  hammer:  { wood: 3, stone: 3, label: '망치' },  // 건축 시 필수
};
// 14.50: 자원 변환 레시피 (도구 필요). saw로 통나무→판자.
const ITEM_RECIPES = {
  plank:   { from: { wood: 1 }, to: { plank: 2 }, requiresTool: 'saw', label: '판자 (통나무 1 → 판자 2)' },
};
// 14.51/14.52: 건축물 = 인벤 아이템. 제작창에서 만들면 인벤에 들어가고, 건축 모드에서 배치한다.
// 14.52: 재료는 plank/wood만 (stone 제외). 망치/톱은 재료가 아닌 "도구" — 내구도 소비.
// _buildType = 실제 건축물 타입 (BUILDING_COST와 매핑). _useHammer = true면 hammer 내구도 1 소비.
const BUILDING_RECIPES = {
  item_wall:     { plank: 2,          _useHammer: true, _buildType: 'wall',     label: '벽 (Wall)' },
  item_floor:    { plank: 1,          _useHammer: true, _buildType: 'floor',    label: '바닥 (Floor)' },
  item_door:     { plank: 2,          _useHammer: true, _buildType: 'door',     label: '문 (Door)' },
  item_fence:    { plank: 1,          _useHammer: true, _buildType: 'fence',    label: '울타리 (Fence)' },
  item_stair:    { plank: 4,          _useHammer: true, _buildType: 'stair',    label: '계단 (Stair)' },
  item_chest:    { plank: 4,          _useHammer: true, _buildType: 'chest',    label: '상자 (Chest)' },
  item_campfire: { wood: 3,                              _buildType: 'campfire', label: '모닥불 (Campfire)' },
  item_farmland: { seed_berry: 1,                        _buildType: 'farmland', label: '농지 (Farmland)' },
};
// 14.52: 모든 도구의 최대 내구도 (제작 시 부여, 사용 시 1씩 감소, 0 되면 인벤서 제거)
const TOOL_MAX_DURABILITY = {
  axe:     100,
  pickaxe: 100,
  sword:   80,
  saw:     120, // 톱은 가공 전용이라 좀 길게
  hammer:  150, // 망치는 건축 전용이라 가장 길게
};
// 14.53: 도구는 instance 기반. player.toolItems = [{id, type, d, max}].
// 같은 종류 여러 개 OK, 각각 다른 내구도. equipped = toolItemId.
let _nextToolId = 1;
function genToolId() { return `t${Date.now().toString(36)}${(_nextToolId++).toString(36)}`; }

// 14.53: 도구 type 보유 + 살아있는 instance 있나
function hasTool(player, toolName) {
  if (!player.toolItems) return false;
  return player.toolItems.some(t => t.type === toolName && t.d > 0);
}
// 14.53: 현재 장착 instance 찾기
function getEquippedTool(player) {
  if (!player.equipped || !player.toolItems) return null;
  return player.toolItems.find(t => t.id === player.equipped) || null;
}
// 14.53: 장착 instance 내구도 소비. 0 되면 toolItems에서 제거, equipped/hotkey1 cleanup.
function consumeEquippedDurability(player, amount = 1) {
  const t = getEquippedTool(player);
  if (!t) return false;
  t.d -= amount;
  if (t.d <= 0) {
    const idx = player.toolItems.indexOf(t);
    if (idx >= 0) player.toolItems.splice(idx, 1);
    const breakName = t.type;
    if (player.equipped === t.id) player.equipped = null;
    if (player.hotkey1 === t.id) player.hotkey1 = null;
    send(player.ws, { type: 'notice', text: `${breakName} 깨짐` });
  }
  // 클라에 toolItems + equipped 갱신
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 });
  return true;
}
// 14.53: type 지정 내구도 소비 (장착 안 했어도 사용 — saw 가공, hammer 건축처럼)
// 가장 내구도 낮은 instance 우선 사용 (소진 빨리).
function consumeToolByType(player, toolName, amount = 1) {
  if (!player.toolItems) return false;
  // 장착된 게 type이면 그거 우선
  const eq = getEquippedTool(player);
  let target = (eq && eq.type === toolName) ? eq : null;
  if (!target) {
    // 내구도 가장 낮은 instance (소진 빨리)
    const candidates = player.toolItems.filter(t => t.type === toolName && t.d > 0);
    candidates.sort((a, b) => a.d - b.d);
    target = candidates[0] || null;
  }
  if (!target) return false;
  target.d -= amount;
  if (target.d <= 0) {
    const idx = player.toolItems.indexOf(target);
    if (idx >= 0) player.toolItems.splice(idx, 1);
    const breakName = target.type;
    if (player.equipped === target.id) player.equipped = null;
    if (player.hotkey1 === target.id) player.hotkey1 = null;
    send(player.ws, { type: 'notice', text: `${breakName} 깨짐` });
  }
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 });
  return true;
}
// 역매핑: building type → item key (분해 시 사용)
const BUILDING_TYPE_TO_ITEM = {};
for (const [item, r] of Object.entries(BUILDING_RECIPES)) {
  BUILDING_TYPE_TO_ITEM[r._buildType] = item;
}
// 요리 레시피: campfire 근처에서만 가능. cost = 인벤토리 소비, produces = 인벤토리 산출 (item: count)
const COOK_RECIPES = {
  meat_cooked: { cost: { meat_raw: 1 }, produces: { meat_cooked: 1 }, label: '구운 고기' },
  berry_jam:   { cost: { berry: 3 },    produces: { berry_jam: 1 },   label: '베리잼' },
};
// 음식 효과: hunger/thirst 회복량. 'eat' 메시지로 소비.
const FOOD_EFFECTS = {
  berry:        { hunger: 6,  thirst: 4 },
  meat_raw:     { hunger: 8,  thirst: 0, hpDelta: -3 }, // 날고기는 약간 해로움
  meat_cooked:  { hunger: 40, thirst: 0 },
  berry_jam:    { hunger: 18, thirst: 6 },
};
// 음료 (water_pool에서 E로 즉시 회복 — 인벤토리 아이템 아님)
const WATER_DRINK_AMOUNT = 35;

// 생존 게이지 상수
const HUNGER_MAX = 100;
const THIRST_MAX = 100;
const HUNGER_DRAIN_PER_SEC = 100 / 600; // 약 10분에 0까지
const THIRST_DRAIN_PER_SEC = 100 / 420; // 약 7분에 0까지
const STARVATION_HP_PER_SEC = 1;        // hunger/thirst 0이면 초당 -1 HP
// 장착 시 효과 — 채집/공격 데미지 배수
// 채집은 자원 hp 깎는 1회 데미지를 배수 적용. 기본 1.
const TOOL_EFFECTS = {
  axe:     { gatherWoodMult: 3, gatherStoneMult: 1, attackMult: 1.0 },
  pickaxe: { gatherWoodMult: 1, gatherStoneMult: 3, attackMult: 1.0 },
  sword:   { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 2.0 },
  saw:     { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 0.7 }, // 톱 = 건축 가공용, 전투 약함
  hammer:  { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 1.3 }, // 망치 = 건축 + 약간 강함
};
const PLAYER_MAX_HP = 100;
const PLAYER_ATTACK_RANGE = 60;
const PLAYER_ATTACK_DAMAGE = 10;
const PLAYER_ATTACK_COOLDOWN_MS = 500;
let nextMid = 1;
const pendingHandoffs = new Map(); // token -> { source_zone, name, x, y, vx, vy, inventory, createdAt } (수신측)
const outgoingHandoffs = new Map(); // token -> { pid, timeoutHandle } (송신측 — ACK 대기 중)
let nextPid = 1;
let nextRid = 1;
// nextBid 제거: 건물 id는 dbId 기반 결정값('b'+dbId)로 통일 (lazy-load materialize와 dedupe·재활성 안정).
let nextClaimId = 1;
// Phase 14.23: 바닥 아이템 (좀보이드식 world item — 누구나 보이고 누구나 픽업)
let nextGiId = 1;
const groundItems = new Map(); // id → { id, x, y, item, count, droppedAt }
const GROUND_ITEM_LIFETIME_MS = 10 * 60 * 1000; // 10분 자동 소멸

function generateToken() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
}

// === 자원 스폰 ===
// Phase 14.1+14.3: biome별 강한 편재 + herb/ore 추가 (chunk.js와 동기 유지)
function biomeResourceType() {
  const r = Math.random();
  if (ZONE.biome === 'plains') {
    if (r < 0.50) return 'berry_bush';
    if (r < 0.75) return 'herb';
    if (r < 0.95) return 'tree';
    if (r < 0.99) return 'rock';
    return 'water_pool';
  }
  if (ZONE.biome === 'mountains') {
    if (r < 0.55) return 'rock';
    if (r < 0.75) return 'ore';
    if (r < 0.85) return 'tree';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'berry_bush';
    return 'water_pool';
  }
  // forest
  if (r < 0.70) return 'tree';
  if (r < 0.85) return 'berry_bush';
  if (r < 0.93) return 'herb';
  if (r < 0.98) return 'rock';
  return 'water_pool';
}

// 자원 종류별 maxHp
const RESOURCE_HP = {
  tree: 3, rock: 4, berry_bush: 2, water_pool: 999, herb: 1, ore: 5,
};

function spawnOneResource() {
  const x = 32 + Math.random() * (ZONE.zoneWidth - 64);
  const y = 32 + Math.random() * (ZONE.zoneHeight - 64);
  const type = biomeResourceType();
  const maxHp = RESOURCE_HP[type] || 3;
  // DB에 영속화
  const dbId = db.insertResource({ type, x, y, hp: maxHp, max_hp: maxHp });
  const id = `r${nextRid++}`;
  const r = { id, dbId, x, y, type, hp: maxHp, maxHp };
  resources.set(id, r);
  chunkManager.insertResource(r);
  resourcesDirty = true;
  return r;
}

// === Phase 12.2.e: procedural — 자원은 청크 활성화 시 lazy 생성 ===
// 부팅 시 채집된 시드만 DB에서 load. 기존 resources 테이블 row는 무시 (procedural로 대체).
{
  const harvested = db.getAllHarvestedSeeds();
  for (const k of harvested) harvestedSeeds.add(k);
  console.log(`[${ZONE_ID}] 채집된 시드 자원 ${harvested.length}개 로드 (procedural 모드)`);
}

// === DB에서 자기 zone의 claims 로드 ===
{
  const rows = db.getClaims();
  for (const row of rows) {
    const id = `c${nextClaimId++}`;
    claims.set(id, {
      id,
      dbId: row.id,
      ownerPid: row.owner_id,  // DB의 player_id (안정적인 식별자)
      ownerName: row.owner_name,
      x: row.x, y: row.y, w: row.w, h: row.h,
    });
  }
  console.log(`[${ZONE_ID}] DB에서 claim ${rows.length}개 로드`);
}

// === Mob spawn — DB에 영속화 (위치/HP는 주기적 저장) ===
function spawnMob(type, opts = {}) {
  const def = MOB_DEFS[type];
  const mid = `m${nextMid++}`;
  let x, y;
  if (typeof opts.x === 'number' && typeof opts.y === 'number') {
    x = opts.x; y = opts.y;
  } else {
    // 늑대는 마을 안전구역 밖에서만 spawn. 14.46-b-smooth-fix: 물 타일도 회피.
    for (let att = 0; att < 30; att++) {
      x = 32 + Math.random() * (ZONE.zoneWidth - 64);
      y = 32 + Math.random() * (ZONE.zoneHeight - 64);
      const inWater = typeof isTerrainBlockedLocal === 'function' && isTerrainBlockedLocal(x, y);
      if (inWater) continue;
      if (type !== 'wolf' || !(typeof isNearVillage === 'function' && isNearVillage(x, y))) break;
    }
  }
  const hp = opts.hp ?? def.maxHp;
  // DB에 insert (dbId가 없으면 새로 만들고, 있으면 그대로 사용 — 로드 케이스)
  const dbId = opts.dbId ?? db.insertMob({ type, x, y, hp, max_hp: def.maxHp });
  const m = {
    mid, dbId, type,
    x, y, z: 0, floor: 0, // 14.49-d: mob도 floor + z 추적 (계단으로 추격)
    homeX: opts.homeX ?? x, homeY: opts.homeY ?? y, // 스폰 위치 = home (팩이면 리더 위치 공유)
    packId: opts.packId || null, // 같은 packId = 같은 무리. 어그로 공유.
    vx: 0, vy: 0,
    hp, maxHp: def.maxHp,
    aggroTarget: null,
    lastAttackAt: 0,
    wanderUntil: 0,
    tameProgress: opts.tameProgress || 0,
    tameOwner: opts.tameOwner || null,
    tameOwnerName: opts.tameOwnerName || null,
    dirty: false, // tick-by-tick 변경 추적 — 주기 저장에 사용
  };
  mobs.set(mid, m);
  chunkManager.insertMob(m);
  return m;
}
{
  // DB에서 기존 mob 로드 — 없으면 바이옴별 신규 스폰
  const existing = db.getMobs();
  if (existing.length > 0) {
    for (const row of existing) {
      spawnMob(row.type, {
        dbId: row.id, x: row.x, y: row.y, hp: row.hp,
        tameOwner: row.tame_owner || null,
        tameOwnerName: row.tame_owner_name || null,
      });
    }
    console.log(`[${ZONE_ID}] DB에서 mob ${existing.length}마리 로드`);
  } else if (ZONE.isOcean) {
    // 14.46-a: 해양 zone — mob 생성 안 함 (사슴/늑대 바다에 떠있으면 이상함).
    // 14.46-b에서 fish 추가 예정.
    console.log(`[${ZONE_ID}] 🌊 ocean zone — mob spawn skip`);
  } else if (ZONE.cleanZone) {
    // Phase 5-G: cleanZone (한반도 강·호수 검증) — mob spawn 안 함
    console.log(`[${ZONE_ID}] 🧹 cleanZone — mob spawn skip`);
  } else {
    // Phase 5-6b: zone biome 따라 huntableInBiome 활용. 사냥감 36종 다 활성.
    const { huntableInBiome } = require('./animals');
    const huntable = huntableInBiome(ZONE.biome);
    const peaceful = huntable.filter(id => !ANIMALS[id].aggressive);
    const aggressive = huntable.filter(id => ANIMALS[id].aggressive);
    const TOTAL_PEACEFUL = 300;
    const TOTAL_AGGRESSIVE = 150;
    // peaceful — density 비례 분배
    if (peaceful.length > 0) {
      const totalDensity = peaceful.reduce((s, id) => s + (ANIMALS[id].spawn_density || 0.03), 0);
      for (const id of peaceful) {
        const dens = ANIMALS[id].spawn_density || 0.03;
        const cnt = Math.max(1, Math.round(TOTAL_PEACEFUL * dens / totalDensity));
        for (let i = 0; i < cnt; i++) spawnMob(id);
      }
    } else {
      // fallback (해양 zone 등) — sheep 만
      for (let i = 0; i < 50; i++) spawnMob('sheep');
    }
    // aggressive — 무리. wolf/jackal/hyena 같은 pack
    let spawned = 0, packNum = 0;
    while (aggressive.length > 0 && spawned < TOTAL_AGGRESSIVE) {
      const id = aggressive[Math.floor(Math.random() * aggressive.length)];
      const def = ANIMALS[id];
      const targetSize = def.pack || 1;
      const packSize = Math.min(targetSize, TOTAL_AGGRESSIVE - spawned);
      const packId = `pack_${ZONE_ID}_${packNum++}_${Math.random().toString(36).slice(2,6)}`;
      let homeX, homeY;
      for (let att = 0; att < 20; att++) {
        homeX = 200 + Math.random() * (ZONE.zoneWidth - 400);
        homeY = 200 + Math.random() * (ZONE.zoneHeight - 400);
        if (!isNearVillage(homeX, homeY)) break;
      }
      for (let i = 0; i < packSize; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 50;
        spawnMob(id, {
          x: homeX + Math.cos(ang) * r,
          y: homeY + Math.sin(ang) * r,
          homeX, homeY, packId,
        });
        spawned++;
      }
      if (packSize > 1) console.log(`[${ZONE_ID}] 🐺 ${def.ko} 팩: ${packSize}마리 @ (${homeX.toFixed(0)},${homeY.toFixed(0)})`);
    }
    console.log(`[${ZONE_ID}] 새 mob 스폰: 평화 ${TOTAL_PEACEFUL}, 공격 ${spawned}`);
  }
}

// === AI NPC ===
// 사람 플레이어와 같은 players Map에 넣고 ws=null. 행동은 npcs Set로 별도 트래킹.
// 각 NPC는 자기 사유지 + 인벤토리 + 농사. 늑대 보면 도망. 죽으면 30초 후 리스폰.
const npcs = new Set(); // pid 모음 (players Map과 같은 pid 사용)
let nextNpcSerial = 1;
const NPC_NAMES = ['에코', '루나', '오리온', '베가', '카이', '미라', '솔', '아라'];
const NPC_COLORS = ['#d8806a', '#7aa8d0', '#9ad8a0', '#d8c060', '#c080d8', '#80d8c0'];
const NPC_COUNT_PER_ZONE = 30; // 면적 100배지만 NPC는 메모리 차지하니 30명만
const NPC_RESPAWN_MS = 30 * 1000;
const NPC_FLEE_RANGE = 250;        // 늑대 시야 안이면 도망
const NPC_CLAIM_SIZE = 192;

function spawnNpc(opts = {}) {
  // 위치: opts.x/y 우선, 없으면 zone 내부 랜덤 (클레임 충돌 안 나는 곳)
  let cx, cy;
  if (typeof opts.x === 'number' && typeof opts.y === 'number') {
    cx = opts.x; cy = opts.y;
    // 충돌나면 약간 흔들어서 16회 재시도
    for (let attempt = 0; attempt < 16; attempt++) {
      let collide = false;
      for (const c of claims.values()) {
        if (rectsOverlap(cx - NPC_CLAIM_SIZE/2, cy - NPC_CLAIM_SIZE/2, NPC_CLAIM_SIZE, NPC_CLAIM_SIZE, c.x, c.y, c.w, c.h)) { collide = true; break; }
      }
      if (!collide) break;
      // 마을 중심 주변에서 흔들기
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 200;
      cx = opts.x + Math.cos(ang) * r;
      cy = opts.y + Math.sin(ang) * r;
    }
  } else {
    cx = 200 + Math.random() * (ZONE.zoneWidth - 400);
    cy = 200 + Math.random() * (ZONE.zoneHeight - 400);
    for (let attempt = 0; attempt < 8; attempt++) {
      let collide = false;
      for (const c of claims.values()) {
        if (rectsOverlap(cx - NPC_CLAIM_SIZE/2, cy - NPC_CLAIM_SIZE/2, NPC_CLAIM_SIZE, NPC_CLAIM_SIZE, c.x, c.y, c.w, c.h)) { collide = true; break; }
      }
      if (!collide) break;
      cx = 200 + Math.random() * (ZONE.zoneWidth - 400);
      cy = 200 + Math.random() * (ZONE.zoneHeight - 400);
    }
  }
  // 사이즈 안 벗어나게 clamp
  cx = clamp(cx, NPC_CLAIM_SIZE, ZONE.zoneWidth - NPC_CLAIM_SIZE);
  cy = clamp(cy, NPC_CLAIM_SIZE, ZONE.zoneHeight - NPC_CLAIM_SIZE);
  const pid = `p${nextPid++}`;
  const npcId = `npc_${ZONE_ID}_${nextNpcSerial++}_${Math.random().toString(36).slice(2,6)}`;
  const name = (opts.name || NPC_NAMES[Math.floor(Math.random()*NPC_NAMES.length)]) + '🤖';
  const color = opts.color || NPC_COLORS[Math.floor(Math.random()*NPC_COLORS.length)];
  const player = {
    pid, playerId: npcId, ws: null,
    name, color,
    x: cx, y: cy, vx: 0, vy: 0,
    inventory: { wood: 0, stone: 0, berry: 0, fiber: 0, meat_raw: 0, hide: 0, seed_berry: 2 },
    tools: {}, equipped: null,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    hunger: HUNGER_MAX, thirst: THIRST_MAX, vp: 0,
    // NPC끼리 같은 마을 = 같은 길드 (zone 안 메모리 길드 — central 등록 X, 시각상만)
    tribeId: opts.villageId || null,
    tribeName: opts.villageName || null,
    pvpEnabled: false,
    isNpc: true,
    behavior: 'wander', targetX: cx, targetY: cy,
    nextDecisionAt: 0,
    lastAttackAt: 0, lastDamagedAt: 0,
    handingOff: false, lastSeen: Date.now(),
  };
  // Phase 14.18: NPC 개별 사유지 폐기. 마을 = 길드 사유지(공용 영토)에 거주.
  // 길드 사유지 개념은 14.18.b에서 도입 — 우선 NPC는 사유지 없이 집(wall)만.
  player.myClaim = null;
  // Phase 5-F: 직업·작업장 (시각 출퇴근용)
  player.npcJob = opts.npcJob || null;
  player.npcHomeX = opts.npcHomeX != null ? opts.npcHomeX : null;
  player.npcHomeY = opts.npcHomeY != null ? opts.npcHomeY : null;
  player.npcWorkX = opts.npcWorkX != null ? opts.npcWorkX : null;
  player.npcWorkY = opts.npcWorkY != null ? opts.npcWorkY : null;
  players.set(pid, player);
  npcs.add(pid);

  // NPC 자동 집 — 사유지 안에 작은 2x2 박스 + 계단 + 1F 한 칸 (다층 마을)
  // 그리드 32px 기준으로 사유지 중심 주변에 wall 배치
  const houseGx = Math.floor(cx / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  const houseGy = Math.floor(cy / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  // PZ식 3x3 집 — wall은 cell edge에. floor (바닥)는 cell 가운데에.
  // cell 좌표 (houseCx, houseCy) 기준 -1..+1 범위.
  const houseCx = Math.floor(cx / BUILDING_SIZE);
  const houseCy = Math.floor(cy / BUILDING_SIZE);
  // 건물 lazy-load: NPC 집 벽/바닥/계단은 DB에만 저장(JS heap에 안 올림).
  //   → 부팅 직후 NPC 건물 3.3만채가 메모리에 없음 = GC 폭주 제거. 플레이어가 그 청크를
  //   활성화하면 materializeBuildingsInChunk가 'b'+dbId id로 다시 올림(콜라이더·송신 동일).
  //   transient 객체를 안 만들어 GC 부담 최소화. NPC는 집 building 객체를 참조하지 않음(좌표만).
  function addWall(cellCx, cellCy, side, floor) {
    const wx = cellCx * BUILDING_SIZE;
    const wy = cellCy * BUILDING_SIZE;
    const data = { side, floor };
    db.insertBuilding({ type: 'wall', owner_id: npcId, owner_name: name, x: wx, y: wy, data: JSON.stringify(data) });
  }
  function addBlock(cellCx, cellCy, type, floor, extra = {}) {
    const bx = cellCx * BUILDING_SIZE + BUILDING_SIZE / 2;
    const by = cellCy * BUILDING_SIZE + BUILDING_SIZE / 2;
    const data = { floor, ...extra };
    db.insertBuilding({ type, owner_id: npcId, owner_name: name, x: bx, y: by, data: JSON.stringify(data) });
  }
  // Phase 4c: skipHouse 옵션 — canadia 통합 NPC는 집 안 만듦 (성능)
  if (opts.skipHouse) {
    console.log(`[${ZONE_ID}] 🤖 NPC 스폰: ${name} @ (${cx.toFixed(0)},${cy.toFixed(0)}) (집 없음)`);
    return player;
  }
  // 14.49-e2: 5x5 영역. cell 범위 (cx-2, cy-2) ~ (cx+2, cy+2). 계단 내부로 옮김.
  for (const f of [0, 1]) {
    // 북쪽 변 (cy-2의 N)
    for (let i = -2; i <= 2; i++) addWall(houseCx + i, houseCy - 2, 'N', f);
    // 남쪽 변 (cy+2의 S = cy+3의 N) — 입구 (가운데) 0F만 비움
    for (let i = -2; i <= 2; i++) {
      if (f === 0 && i === 0) continue; // 0F 입구
      addWall(houseCx + i, houseCy + 3, 'N', f);
    }
    // 동쪽 변 (cx+2의 E)
    for (let j = -2; j <= 2; j++) addWall(houseCx + 2, houseCy + j, 'E', f);
    // 서쪽 변 (cx-2의 W = cx-3의 E)
    for (let j = -2; j <= 2; j++) addWall(houseCx - 3, houseCy + j, 'E', f);
  }
  // 14.49-e7aj: stair는 floor=0 (1층→2층). 2층(floor=1)만 stair 3 cell 비움. 1층(0)+3층(2) 정상.
  const stairCells = new Set([
    `${houseCx + 2}_${houseCy + 1}`,
    `${houseCx + 2}_${houseCy}`,
    `${houseCx + 2}_${houseCy - 1}`,
  ]);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const cx = houseCx + i, cy = houseCy + j;
    addBlock(cx, cy, 'floor', 0); // 1층 (game) — 정상
    if (!stairCells.has(`${cx}_${cy}`)) addBlock(cx, cy, 'floor', 1); // 2층 — stair cells 비움
    addBlock(cx, cy, 'floor', 2); // 3층 (지붕) — 정상
  }
  // 계단 — 집 내부, 동쪽 벽에 붙음. dir='N' (남쪽에서 들어와 북쪽으로 올라감).
  addBlock(houseCx + 2, houseCy + 1, 'stair', 0, { dir: 'N' });
  return player;
}

// === 부팅: DB 직접 wipe (옛 NPC + debug + legacy wall) → DB 로드 → 마을 spawn ===
// 중요: DB 로드는 라인 836+에서 일어남. 그래서 메모리 기반 cleanup은 의미 X.
// 여기서 DB에 직접 DELETE 쿼리로 wipe — DB 로드 시 이미 사라져 있음.
// VILLAGES + VILLAGE_SAFE_RADIUS는 위 ~150줄에서 정의됨 (모듈 로드 hoisting 문제로)
// 마을당 NPC 수 — 존 총량 나누기(옛 방식, 마을 늘리면 작아짐) → 마을당 고정 크기. 총량 = 마을수 × 이값.
// dormant NPC는 spatial·이동·AI에서 스킵(active-only)이라 총 1000명도 안전 (근처 active만 비용).
const NPC_PER_VILLAGE = ZONE.npcPerVillage || 12;
{
  try {
    const npcClaimRes = db.db.prepare("DELETE FROM claims WHERE owner_id LIKE 'npc_%'").run();
    if (npcClaimRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: NPC 사유지 ${npcClaimRes.changes}개`);
    const npcBldRes = db.db.prepare("DELETE FROM buildings WHERE owner_id LIKE 'npc_%'").run();
    if (npcBldRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: NPC 건축물 ${npcBldRes.changes}개`);
    const dbgRes = db.db.prepare("DELETE FROM buildings WHERE owner_id = 'debug_test'").run();
    if (dbgRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: 디버그 wall ${dbgRes.changes}개`);
    // 옛 큐브 wall (data 안에 side 키 없음) — SQLite JSON 함수 없으니 LIKE로 근사
    const legRes = db.db.prepare("DELETE FROM buildings WHERE type='wall' AND (data IS NULL OR data NOT LIKE '%\"side\"%')").run();
    if (legRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: 옛 큐브 wall ${legRes.changes}개`);
    // 14.17 — 공성캠프 모두 제거 (개념 폐기)
    const sgRes = db.db.prepare("DELETE FROM buildings WHERE type='siege_camp'").run();
    if (sgRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: 옛 공성캠프 ${sgRes.changes}개`);
    // 14.18.a — 옛 192×192 claim 전부 제거 (1 grid 단위로 전환)
    const oldClaimRes = db.db.prepare("DELETE FROM claims WHERE w > 32 OR h > 32").run();
    if (oldClaimRes.changes > 0) console.log(`[${ZONE_ID}] DB wipe: 옛 192×192 claim ${oldClaimRes.changes}개`);
  } catch (e) { console.error(`[${ZONE_ID}] DB wipe error:`, e); }
}
// NPC spawn은 DB 로드 후로 (spawnVillagers 함수, 라인 836 DB 로드 다음에 호출)
// Phase 14.4 — 각 마을을 central에 1급 길드로 등록 (is_npc=1, behavior_tier='passive')
// 멤버는 일단 메모리 NPC. tribe_id는 central에서 받아와서 시각용으로만 사용.
const villageGuildIds = new Map(); // villageName → central tribe_id
async function registerVillageGuilds() {
  for (let v = 0; v < VILLAGES.length; v++) {
    const village = VILLAGES[v];
    try {
      const r = await central.tribeNpcUpsert(village.name, 'passive');
      if (r && r.tribe_id) {
        villageGuildIds.set(village.name, r.tribe_id);
        console.log(`[${ZONE_ID}] ✅ NPC 길드 등록: ${village.name} → central tribe_id=${r.tribe_id} (passive)`);
      }
    } catch (e) { console.warn(`[${ZONE_ID}] NPC 길드 등록 실패 [${village.name}]:`, e.message); }
  }
}
// Phase 14.18.b — 각 마을 중심에 길드 사유지 (공용 영토) 자동 생성
// 마을 = NPC 길드. central tribe_id를 받아와서 guildTribeId로 연결.
function spawnGuildClaimsForVillage(village, centralTribeId) {
  if (!centralTribeId) return;
  // 마을 중심 주변 N×N 그리드 (1 cell = 32px). 25 cell = 5×5 = 160×160 영역.
  const SZ = BUILDING_SIZE;
  const RADIUS_CELLS = 3; // 3 cell 반경 → ~28 cells 길드 영토. (이전 12=마을당 ~452칸 × 50마을 = 22,600 claim → welcome 4.5MB 폭주로 WS 접속 불가. 16× 축소. 영토 확장은 sim/길드로 후속)
  const npcOwnerId = `village_${village.name}`;
  // 옛 거 정리 (메모리 + DB)
  for (const [id, c] of claims) {
    if (c.kind === 'guild' && c.ownerPid === npcOwnerId) {
      if (c.dbId) { try { db.db.prepare('DELETE FROM claims WHERE id = ?').run(c.dbId); } catch (e) {} }
      claims.delete(id);
    }
  }
  let created = 0;
  for (let dy = -RADIUS_CELLS; dy <= RADIUS_CELLS; dy++) {
    for (let dx = -RADIUS_CELLS; dx <= RADIUS_CELLS; dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > RADIUS_CELLS) continue; // 원형
      const cx = Math.floor(village.x / SZ) * SZ + dx * SZ;
      const cy = Math.floor(village.y / SZ) * SZ + dy * SZ;
      const id = `c${nextClaimId++}`;
      const claim = {
        id, ownerPid: npcOwnerId, ownerName: `${village.name} 길드 영토`,
        x: cx, y: cy, w: SZ, h: SZ, kind: 'guild',
        guildTribeId: centralTribeId,
        guildTribeName: village.name,
        createdAt: Date.now(),
      };
      claims.set(id, claim);
      broadcast({ type: 'claim_added', claim });
      created++;
    }
  }
  console.log(`[${ZONE_ID}] 🏛️ 길드 영토 [${village.name}] ${created}칸 생성 (반경 ${RADIUS_CELLS} cells)`);
}

// Phase 5-F: NPC 직업 분배 — 마을 type 가중치 반영
const NPC_JOB_PROBS_BASE = {
  farmer: 0.30, miner: 0.12, lumberjack: 0.12, hunter: 0.10,
  fisher: 0.10, forager: 0.10, smith: 0.05, weaponsmith: 0.03,
  armorsmith: 0.03, cook: 0.03, warrior: 0.02,
};
function _pickNpcJob(villageType) {
  // 마을 type 따라 직업 비중 보정
  const probs = { ...NPC_JOB_PROBS_BASE };
  if (villageType === 'mining') { probs.miner = 0.45; probs.farmer = 0.15; }
  else if (villageType === 'riverside') { probs.fisher = 0.30; probs.farmer = 0.25; }
  else if (villageType === 'forest') { probs.lumberjack = 0.30; probs.forager = 0.20; }
  else if (villageType === 'mountain') { probs.miner = 0.30; probs.hunter = 0.15; }
  // 정규화
  const sum = Object.values(probs).reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (const [job, p] of Object.entries(probs)) {
    if (r < p) return job;
    r -= p;
  }
  return 'farmer';
}
// Phase 5-F: 직업별 작업장 결정 (zone terrain cluster 활용)
function _findNpcWorkSite(vx, vy, job) {
  if (job === 'miner' || job === 'prospector') {
    return _findNearestTerrainCluster(ZONE_ID, vx, vy, 'ore');
  } else if (job === 'lumberjack' || job === 'forager') {
    return _findNearestTerrainCluster(ZONE_ID, vx, vy, 'forest');
  } else if (job === 'fisher') {
    return _findNearestTerrainCluster(ZONE_ID, vx, vy, 'water');
  } else if (job === 'hunter') {
    const t = _findNearestTerrainCluster(ZONE_ID, vx, vy, 'forest');
    if (t) return { x: t.x + (Math.random() - 0.5) * 600, y: t.y + (Math.random() - 0.5) * 600 };
  }
  return null; // farmer/cook/smith/warrior — 마을 안에서 작업
}

function spawnVillagers() {
  for (let v = 0; v < VILLAGES.length; v++) {
    const village = VILLAGES[v];
    const villageId = `village_${ZONE_ID}_${v}`;
    console.log(`[${ZONE_ID}] 🏘️ 마을 [${village.name}] @ (${village.x},${village.y}) type=${village.type || 'plain'} — ${NPC_PER_VILLAGE}명`);
    // 14.18.b: 길드 영토 (central tribe_id는 비동기로 받음. 지금 시점에 villageGuildIds에 있을 수도/없을 수도)
    const tribeId = villageGuildIds.get(village.name);
    if (tribeId && ZONE.npcVillageTerritory) spawnGuildClaimsForVillage(village, tribeId); // 영토 OFF 기본 (welcome·broadcast 폭주 방지)
    for (let i = 0; i < NPC_PER_VILLAGE; i++) {
      const ang = (Math.PI * 2 * i / NPC_PER_VILLAGE) + Math.random() * 0.3;
      const r = 200 + Math.random() * 300;
      const npcX = village.x + Math.cos(ang) * r;
      const npcY = village.y + Math.sin(ang) * r;
      const job = _pickNpcJob(village.type);
      const ws = _findNpcWorkSite(village.x, village.y, job);
      spawnNpc({
        x: npcX, y: npcY,
        villageId, villageName: village.name,
        npcJob: job,
        npcHomeX: village.x, npcHomeY: village.y,
        npcWorkX: ws ? ws.x : village.x + (Math.random() - 0.5) * 200,
        npcWorkY: ws ? ws.y : village.y + (Math.random() - 0.5) * 200,
        skipHouse: !ZONE.npcVillageHouses, // 집 OFF 기본 — NPC 집(wall 수십개)×300 = welcome 5.4MB로 클라 멈춤. 집은 AOI 청크 송신 구현 후 재활성.
      });
    }
  }
  // 길드 영토는 spawnVillagers와 별도로 registerVillageGuilds 완료 후 다시 호출 (race condition fix)
  setTimeout(() => {
    for (const v of VILLAGES) {
      const tribeId = villageGuildIds.get(v.name);
      if (ZONE.npcVillageTerritory && tribeId && ![...claims.values()].some(c => c.kind === 'guild' && c.guildTribeId === tribeId)) {
        spawnGuildClaimsForVillage(v, tribeId);
      }
    }
  }, 3000);
}

// 좌표가 마을 안전구역 안인지 체크 (늑대 spawn 위치 검증용)
function isNearVillage(x, y) {
  for (const v of VILLAGES) {
    if (Math.hypot(v.x - x, v.y - y) < VILLAGE_SAFE_RADIUS) return true;
  }
  return false;
}

// NPC 행동 결정 — tick 안에서 호출
function decideNpcBehavior(npc, now) {
  // Phase 4d-9 fix: canadia NPC는 nextDecisionAt 무시 (어디서 22일 미래값으로 set되는 origin 불명확)
  //   매 tick decideCanadiaBehavior 호출 — 80 NPC × 30Hz = 가벼움
  if (npc.canadiaVillage) {
    decideCanadiaBehavior(npc, now);
    return;
  }
  if (now < npc.nextDecisionAt) return;
  npc.nextDecisionAt = now + 500 + Math.random() * 1000;
  // ① 늑대 시야 안이면 도망 — quadtree로 후보 추리고 종류 필터
  const nearbyMobs = qtMobs ? qtMobs.queryCircle(npc.x, npc.y, NPC_FLEE_RANGE) : Array.from(mobs.values());
  let nearestWolf = null, wolfDist = NPC_FLEE_RANGE;
  for (const m of nearbyMobs) {
    if (m.type !== 'wolf' || m.tameOwner) continue;
    const d = Math.hypot(m.x - npc.x, m.y - npc.y);
    if (d < wolfDist) { nearestWolf = m; wolfDist = d; }
  }
  if (nearestWolf) {
    // 궁지에 몰린 상황 — HP 절반 미만 + 매우 가까움 → 반격
    if (npc.hp < npc.maxHp * 0.5 && wolfDist < 100) {
      npc.behavior = 'fight';
      npc.fightTarget = nearestWolf.mid;
      return;
    }
    npc.behavior = 'flee';
    // 늑대 반대방향으로
    const dx = npc.x - nearestWolf.x, dy = npc.y - nearestWolf.y;
    const dd = Math.hypot(dx, dy) || 1;
    npc.targetX = npc.x + (dx/dd) * 200;
    npc.targetY = npc.y + (dy/dd) * 200;
    return;
  }
  // ② 자기 농지 익었으면 수확 — 근처(qtBuildings)만 (집 ON이면 전 건물 3만+채 순회 방지)
  const _nearBld = qtBuildings ? qtBuildings.queryCircle(npc.x, npc.y, 700) : [];
  for (const b of _nearBld) {
    if (b.type !== 'farmland' || b.ownerId !== npc.playerId) continue;
    if (b.data?.ready || (b.data?.readyAt && now >= b.data.readyAt)) {
      npc.behavior = 'harvest';
      npc.targetX = b.x; npc.targetY = b.y;
      npc.harvestTarget = b.id;
      return;
    }
  }
  // ③ seed 있고 사유지에 농지 슬롯 빈 데 → 농사
  if ((npc.inventory.seed_berry || 0) >= 1 && npc.myClaim) {
    const cl = npc.myClaim;
    let myFarmCount = 0;
    for (const b of _nearBld) if (b.type === 'farmland' && b.ownerId === npc.playerId) myFarmCount++;
    if (myFarmCount < 3) {
      // 사유지 안 빈 자리 (대충 중심에서 약간 어긋난 곳)
      npc.behavior = 'plant';
      npc.targetX = cl.x + 40 + Math.random() * (cl.w - 80);
      npc.targetY = cl.y + 40 + Math.random() * (cl.h - 80);
      return;
    }
  }
  // ④ 가까운 자원 채집 (자기 사유지 안 우선, 없으면 사유지 밖도 OK) — quadtree
  const nearbyRes = qtResources ? qtResources.queryCircle(npc.x, npc.y, 400) : Array.from(resources.values());
  let bestRes = null, bestResDist = 400;
  for (const r of nearbyRes) {
    // 다른 사람 사유지면 패스
    let blocked = false;
    for (const c of claims.values()) {
      if (c.ownerPid !== npc.playerId && r.x >= c.x && r.x < c.x + c.w && r.y >= c.y && r.y < c.y + c.h) { blocked = true; break; }
    }
    if (blocked) continue;
    const d = Math.hypot(r.x - npc.x, r.y - npc.y);
    if (d < bestResDist) { bestRes = r; bestResDist = d; }
  }
  if (bestRes) {
    npc.behavior = 'gather';
    npc.targetX = bestRes.x; npc.targetY = bestRes.y;
    npc.gatherTarget = bestRes.id;
    return;
  }
  // ⑤ 배회 — Phase 5-F: 직업 있으면 작업장(workSite) 근처에서 배회
  npc.behavior = 'wander';
  if (npc.npcWorkX != null && npc.npcWorkY != null) {
    // 사용자가 day/night 분리 X → 일단 workSite에서 idle (출퇴근 시각화 1단계)
    // 거리 멀 때만 workSite로 이동, 가까우면 주변 idle
    const distToWork = Math.hypot(npc.x - npc.npcWorkX, npc.y - npc.npcWorkY);
    if (distToWork > 200) {
      npc.targetX = npc.npcWorkX + (Math.random() - 0.5) * 100;
      npc.targetY = npc.npcWorkY + (Math.random() - 0.5) * 100;
    } else {
      // 작업장 근처 — 80px 내 idle wander
      npc.targetX = npc.npcWorkX + (Math.random() - 0.5) * 160;
      npc.targetY = npc.npcWorkY + (Math.random() - 0.5) * 160;
    }
  } else if (npc.myClaim) {
    const cl = npc.myClaim;
    npc.targetX = cl.x + Math.random() * cl.w;
    npc.targetY = cl.y + Math.random() * cl.h;
  } else {
    npc.targetX = npc.x + (Math.random() - 0.5) * 200;
    npc.targetY = npc.y + (Math.random() - 0.5) * 200;
  }
}

// === Phase 14.49-a/b: NPC pathfinding 헬퍼 (14.49-fix: 성능 대폭 축소) ===
// 한반도 같은 zone은 NPC 200+ 마리라 무차별 A*는 CPU 폭발. 다음 가드 적용:
// - wander/flee 모드: A* 안 함 (beeline) — 짧은 거리·target 매번 바뀜
// - gather/plant/harvest: A* 사용, 단 NPC당 최소 2초 간격
// - maxCells 200으로 축소 (~4ms 한도)
// - 직선 raycast로 막힘 없으면 A* 스킵
function straightPathClear(x0, y0, x1, y1, floor) {
  // 32px씩 샘플링하며 벽·물 체크
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 32);
  if (steps === 0) return true;
  const sx = dx / steps, sy = dy / steps;
  let px = x0, py = y0;
  for (let i = 0; i < steps; i++) {
    const nx = px + sx, ny = py + sy;
    if (isBlockedByWall(nx, ny, px, py, floor)) return false;
    if (isTerrainBlockedLocal(nx, ny)) return false;
    px = nx; py = ny;
  }
  return true;
}
function computeNpcPath(npc, now) {
  if (typeof npc.targetX !== 'number' || typeof npc.targetY !== 'number') return null;
  const d = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);
  if (d < 48) return [{ x: npc.targetX, y: npc.targetY }];
  // wander/flee는 A* 안 씀 — beeline path (벽 만나면 stuck 감지가 fallback)
  if (npc.behavior === 'wander' || npc.behavior === 'flee') {
    return [{ x: npc.targetX, y: npc.targetY }];
  }
  // 직선이 깨끗하면 A* 스킵 (cheap raycast)
  if (straightPathClear(npc.x, npc.y, npc.targetX, npc.targetY, npc.floor || 0)) {
    return [{ x: npc.targetX, y: npc.targetY }];
  }
  // A* — NPC당 최소 2초 간격
  if (npc._lastAStarAt && now - npc._lastAStarAt < 2000) return null;
  npc._lastAStarAt = now;
  return pfFindPath(npc.x, npc.y, npc.targetX, npc.targetY, {
    floor: npc.floor || 0,
    isBlockedFn: isBlockedByWall,
    isWaterFn: isTerrainBlockedLocal,
    maxCells: 200,         // ~4ms 한도 (TICK 33ms에 여유)
    searchRadiusCells: 24, // 768px 범위
  });
}
// npc.path를 따라 다음 waypoint 향해 vx/vy 설정. 도착했으면 다음 waypoint로.
// 반환: true면 path 완료 (목표 도달), false면 진행 중
function followNpcPath(npc, speedMult) {
  if (!npc.path || npc.pathIndex >= npc.path.length) return true;
  const wp = npc.path[npc.pathIndex];
  const dx = wp.x - npc.x, dy = wp.y - npc.y;
  const dd = Math.hypot(dx, dy);
  if (dd < 10) {
    npc.pathIndex++;
    if (npc.pathIndex >= npc.path.length) {
      npc.vx = 0; npc.vy = 0;
      return true;
    }
    return false;
  }
  const speed = MOVE_SPEED * (speedMult || 0.6);
  npc.vx = (dx / dd) * speed;
  npc.vy = (dy / dd) * speed;
  return false;
}
// stuck 감지: lastPos·lastPosAt 비교. 1.5s간 5px도 못 움직였으면 stuck.
function detectStuck(npc, now) {
  if (!npc._stuckPos) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now };
    return false;
  }
  const moved = Math.hypot(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y);
  if (moved > 5) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now };
    return false;
  }
  if (now - npc._stuckPos.at > 1500) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now }; // reset
    return true;
  }
  return false;
}
// stuck 해소: path·target 비우고 짧은 wander 방향 + 다음 decide 트리거
function unstuckNpc(npc, now) {
  npc.path = null;
  npc.pathIndex = 0;
  // 작은 회피 — 랜덤 방향으로 짧게 비킨다
  const ang = Math.random() * Math.PI * 2;
  npc.targetX = npc.x + Math.cos(ang) * 80;
  npc.targetY = npc.y + Math.sin(ang) * 80;
  npc.nextDecisionAt = now + 800; // 잠깐 wander 후 다시 결정
  npc.behavior = 'wander';
  npc.vx = 0; npc.vy = 0;
}

function npcStep(npc, dt, now) {
  decideNpcBehavior(npc, now);

  // Phase 4d-14d: canadia caravan traveling — decideCanadiaBehavior가 직접 vx/vy(500 px/s) 설정.
  //   followNpcPath가 덮어쓰지 않도록 일찍 return. (A* path도 skip → 직선 이동, 마을 사이 진동 X)
  if (npc.canadiaTask === 'traveling') return;

  // stuck 감지 — 모든 모드 공통. fight 모드 / canadia NPC는 자체 state machine 있어서 제외
  if (npc.behavior !== 'fight' && !npc.canadiaVillage && detectStuck(npc, now)) {
    unstuckNpc(npc, now);
    return;
  }

  // === fight 모드: 늑대 직접 공격 (target 사라지면 자동 해제) ===
  if (npc.behavior === 'fight') {
    const target = npc.fightTarget ? mobs.get(npc.fightTarget) : null;
    if (!target || target.hp <= 0) {
      npc.behavior = 'wander';
      npc.fightTarget = null;
      npc.nextDecisionAt = 0;
      return;
    }
    const tdx = target.x - npc.x, tdy = target.y - npc.y;
    const tdd = Math.hypot(tdx, tdy);
    if (tdd > PLAYER_ATTACK_RANGE * 0.8) {
      // range 안으로 접근
      npc.vx = (tdx/tdd) * MOVE_SPEED * 0.8;
      npc.vy = (tdy/tdd) * MOVE_SPEED * 0.8;
    } else {
      npc.vx = 0; npc.vy = 0;
      if (now - npc.lastAttackAt > 1000) {
        npc.lastAttackAt = now;
        const dmg = 8;
        target.hp -= dmg;
        target.dirty = true;
        broadcast({ type: 'mob_damaged', mid: target.mid, hp: target.hp });
        // 늑대 공격당하면 어그로 — 이미 NPC 향해있을 거. 팩 전파도.
        if (!target.tameOwner) {
          target.aggroTarget = npc.pid;
          if (target.type === 'wolf') aggroPackmates(target, npc.pid);
        }
        if (target.hp <= 0) {
          if (target.dbId) { try { db.deleteMob(target.dbId); } catch (e) {} }
          chunkManager.removeMob(target);
          mobs.delete(target.mid);
          broadcast({ type: 'mob_removed', mid: target.mid });
          // 일정 시간 후 같은 종 리스폰
          const respawnType = target.type;
          setTimeout(() => {
            const m = spawnMob(respawnType);
            broadcast({ type: 'mob_spawn', mob: { mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, tameOwner: null, tameOwnerName: null } });
          }, 15000);
          npc.fightTarget = null;
          npc.behavior = 'wander';
          npc.nextDecisionAt = 0;
        }
      }
    }
    return;
  }

  // 목표 방향으로 이동 — A* path 따라가기. path 없으면 새로 계산.
  // path가 만료(목표 바뀜)되거나 너무 오래(>3초) 됐으면 재계산.
  const speedMult = npc.behavior === 'flee' ? 1.0 : 0.6;
  const targetKey = `${npc.targetX|0}_${npc.targetY|0}`;
  const needPath = !npc.path || npc.pathIndex >= npc.path.length ||
                   npc._pathFor !== targetKey ||
                   (npc._pathAt && now - npc._pathAt > 5000);
  if (needPath) {
    const p = computeNpcPath(npc, now);
    npc.path = p || [{ x: npc.targetX, y: npc.targetY }]; // 못 찾으면 beeline
    npc.pathIndex = 0;
    npc._pathFor = targetKey;
    npc._pathAt = now;
  }
  const arrived = followNpcPath(npc, speedMult);
  if (!arrived) return;
  // arrived: 목표 행동 실행 (gather/plant/harvest)
  {
    // 목표 도달 시 행동 실행
    if (npc.behavior === 'gather' && npc.gatherTarget) {
      const r = resources.get(npc.gatherTarget);
      if (r && Math.hypot(r.x - npc.x, r.y - npc.y) < GATHER_RANGE) {
        // 직접 채집 (tryGather 로직 간소화)
        r.hp -= 1;
        if (r.hp <= 0) {
          let loot = {};
          if (r.type === 'tree') loot = { wood: 3 + Math.floor((r.r || 8) / 3) };  // 크기 비례
          else if (r.type === 'rock') loot = { stone: 1 };
          else if (r.type === 'berry_bush') { loot = { berry: 2, fiber: 1 }; if (Math.random() < 0.3) loot.seed_berry = 1; }
          else if (r.type === 'herb') loot = { herb: 2 };
          else if (r.type === 'ore') loot = { ore: 1, stone: 1 };
          for (const [k, v] of Object.entries(loot)) npc.inventory[k] = (npc.inventory[k] || 0) + v;
          resources.delete(r.id);
          chunkManager.removeResource(r);
          resourcesDirty = true;
          if (r.isSeed && r.seedKey) {
            harvestedSeeds.add(r.seedKey);
            try { db.insertHarvestedSeed(r.seedKey); } catch (e) {}
          } else if (r.dbId) {
            db.deleteResource(r.dbId);
          }
          broadcast({ type: 'resource_removed', id: r.id });
        } else {
          if (r.dbId) db.updateResourceHp(r.dbId, r.hp);
          broadcast({ type: 'resource_update', id: r.id, hp: r.hp });
        }
        npc.gatherTarget = null;
        npc.nextDecisionAt = 0;
      }
    } else if (npc.behavior === 'plant') {
      // 농지 짓기
      if ((npc.inventory.seed_berry || 0) >= 1 && npc.myClaim) {
        const gx = Math.floor(npc.x / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
        const gy = Math.floor(npc.y / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
        // 같은 타일 중복 체크
        let occupied = false;
        for (const b of buildings.values()) if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE) { occupied = true; break; }
        if (!occupied) {
          npc.inventory.seed_berry -= 1;
          const data = { cropType: 'berry', plantedAt: Date.now(), readyAt: Date.now() + CROP_GROW_MS, ready: false };
          const dbId = db.insertBuilding({ type: 'farmland', owner_id: npc.playerId, owner_name: npc.name, x: gx, y: gy, data: JSON.stringify(data) });
          const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 결정값 (deactivate→reactivate 안정 + materialize dedupe)
          const building = { id, dbId, type: 'farmland', ownerId: npc.playerId, ownerName: npc.name, x: gx, y: gy, data };
          buildings.set(id, building);
          chunkManager.insertBuilding(building);
          broadcast({ type: 'building_added', building });
        }
      }
      npc.nextDecisionAt = 0;
    } else if (npc.behavior === 'harvest' && npc.harvestTarget) {
      const b = buildings.get(npc.harvestTarget);
      if (b && b.type === 'farmland' && b.ownerId === npc.playerId && b.data && now >= b.data.readyAt) {
        npc.inventory.berry = (npc.inventory.berry || 0) + 3;
        npc.inventory.seed_berry = (npc.inventory.seed_berry || 0) + 1;
        if (b.dbId) { try { db.deleteBuilding(b.dbId); } catch (e) {} }
        chunkManager.removeBuilding(b);
        buildings.delete(b.id);
        broadcast({ type: 'building_removed', id: b.id });
      }
      npc.harvestTarget = null;
      npc.nextDecisionAt = 0;
    }
  }
}

// 주기적으로 mob 위치/HP 저장 (10초 간격) — dirty 플래그 켜진 것만
setInterval(() => {
  let saved = 0;
  // 트랜잭션으로 묶어 1회 fsync (이전: dirty마다 개별 동기 쓰기 → 이벤트루프 수십~수백ms 블록 = 틱 지연 = 클라 텔포)
  try {
    const txn = db.db.transaction(() => {
      for (const m of mobs.values()) {
        if (m.dirty && m.dbId) { db.updateMobState(m.dbId, m.x, m.y, m.hp, m.tameOwner, m.tameOwnerName); saved++; m.dirty = false; }
      }
    });
    txn();
  } catch (e) { /* lock 잡혔으면 다음 라운드 */ }
  if (saved > 0) console.log(`[${ZONE_ID}] mob 상태 저장 ${saved}건 (txn)`);
}, 10000);

// === Phase 14.43: 좀비 ws 청소 ===
// 클라가 백그라운드 freeze + NAT timeout으로 TCP 죽었는데 close 이벤트는 안 떠서
// 서버가 계속 살아있는 줄 알고 tick 보내는 케이스 정리.
// player: 30초간 input/ping 없으면 ws.terminate() (NPC 제외)
// observer: 30초간 viewport_update/ping 없으면 ws.terminate()
const STALE_WS_MS = 30000;
setInterval(() => {
  const now = Date.now();
  let kicked = 0;
  for (const [pid, p] of players) {
    if (p.isNpc) continue;
    if (p.handingOff) continue;
    if (now - (p.lastSeen || 0) > STALE_WS_MS) {
      console.warn(`[${ZONE_ID}] 💀 좀비 player ${p.name} (${pid}) 강제 종료 (lastSeen ${Math.round((now-p.lastSeen)/1000)}초 전)`);
      try { p.ws.terminate ? p.ws.terminate() : p.ws.close(); } catch (e) {}
      players.delete(pid);
      broadcast({ type: 'player_left', pid });
      kicked++;
    }
  }
  for (const [ws, data] of observers) {
    if (now - (data.lastSeen || 0) > STALE_WS_MS) {
      try { ws.terminate ? ws.terminate() : ws.close(); } catch (e) {}
      observers.delete(ws);
      kicked++;
    }
  }
  if (kicked > 0) console.log(`[${ZONE_ID}] 좀비 ws ${kicked}개 정리`);
}, 5000);

// === DB 건축물 — lazy-load (부팅 시 메모리에 안 올림) ===
// 건물 lazy-load(GC 폭주 수정): 부팅 때 전 건물을 buildings/chunkManager에 instantiate하지 않음.
//   각 청크는 플레이어가 다가와 activateChunk될 때 materializeBuildingsInChunk가 'b'+dbId id로 로드.
//   → 매 틱 살아있는 building 객체가 활성청크 수백채로 줄어 minor/major GC 정지 제거.
//   (아래 부팅 cleanup의 buildings.delete(...)는 빈 Map이라 no-op — DB DELETE만 유효, 의도된 동작.)
{
  let n = -1;
  try { n = db.db.prepare('SELECT COUNT(*) AS c FROM buildings').get().c; } catch (e) {}
  console.log(`[${ZONE_ID}] DB 건축물 ${n}개 (lazy-load — 활성청크 진입 시 메모리로 올림)`);
}

// === NPC 마을 spawn — DB 로드 후 (중복 방지) ===
// Phase 14.4: central에 NPC 길드 등록 (비동기 — 실패해도 진행)
// 길드영토 OFF면 central 등록(50콜) 스킵 → 부팅 빠름. (영토는 후속 기능, NPC 작동엔 불필요)
if (ZONE.npcVillageTerritory) registerVillageGuilds().catch(e => console.warn(`[${ZONE_ID}] village guild register error:`, e.message));
spawnVillagers();

// === 디버그 충돌 테스트 방 제거됨 ===
// 옛 5x5 'debug_room' 벽은 부팅 시 buildings에 직접 올려져 lazy-load 활성/비활성·dedupe와 어긋나
//   클라/서버 벽 상태 불일치 → 코너 튕김 유발. 테스트 잔재라 제거. 기존 벽도 DB에서 정리(재부팅 materialize 방지).
if (ZONE_ID === 'hanbando') {
  try {
    const r = db.db.prepare("DELETE FROM buildings WHERE owner_id = 'debug_room'").run();
    if (r.changes > 0) console.log(`[${ZONE_ID}] 🧹 옛 디버그 방 벽 ${r.changes}개 DB에서 제거`);
  } catch {}
  for (const [id, b] of buildings) {
    if (b.ownerId === 'debug_room') { buildings.delete(id); if (chunkManager.removeBuilding) chunkManager.removeBuilding(b); }
  }
}

// === Phase 14.20+14.22: 한반도 스폰 옆 public chest 3개 + chest 진단/정리 ===
if (ZONE_ID === 'hanbando') {
  // 1) 메모리 + DB 모두 정리: public 또는 debug_chest owner chest 전부 제거
  let removedMem = 0;
  for (const [id, b] of buildings) {
    if (b.type !== 'chest') continue;
    if (b.ownerId === 'public' || b.ownerId === 'debug_chest') {
      buildings.delete(id);
      chunkManager.removeBuilding(b);
      removedMem++;
    }
  }
  try {
    const r = db.db.prepare("DELETE FROM buildings WHERE type='chest' AND (owner_id = 'public' OR owner_id = 'debug_chest')").run();
    if (r.changes > 0 || removedMem > 0) console.log(`[${ZONE_ID}] DB+mem wipe: public/debug chest ${r.changes}/${removedMem}개`);
  } catch (e) {}
  // 2) 진단: 현재 모든 chest 분포 출력
  try {
    const allChests = db.db.prepare("SELECT owner_id, owner_name, COUNT(*) AS cnt FROM buildings WHERE type='chest' GROUP BY owner_id").all();
    if (allChests.length > 0) {
      console.log(`[${ZONE_ID}] 📦 chest 분포:`);
      for (const r of allChests) console.log(`  owner=${r.owner_id} (${r.owner_name}) — ${r.cnt}개`);
    } else {
      console.log(`[${ZONE_ID}] 📦 DB에 chest 0개`);
    }
  } catch (e) {}
  // 3) 디버그 public chest 3개 새로 추가
  const debugChests = [
    { x: 5152 + 16, y: 5120 + 16, data: { wood: 50, stone: 50, floor: 0 } },
    { x: 5184 + 16, y: 5120 + 16, data: { wood: 30, stone: 30, floor: 0 } },
    { x: 5152 + 16, y: 5152 + 16, data: { wood: 20, stone: 80, floor: 0 } },
  ];
  for (const cdef of debugChests) {
    const dbId = db.insertBuilding({
      type: 'chest', owner_id: 'public', owner_name: '공용 상자',
      x: cdef.x, y: cdef.y, data: JSON.stringify(cdef.data),
    });
    const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 (재활성 시 materialize와 dedupe)
    const b = { id, dbId, type: 'chest', ownerId: 'public', ownerName: '공용 상자', x: cdef.x, y: cdef.y, data: cdef.data, floor: 0 };
    buildings.set(id, b);
    chunkManager.insertBuilding(b);
  }
  console.log(`[${ZONE_ID}] 📦 디버그 public chest 3개 @ (5120,5120) 옆`);
}

// Phase 12.2.e: 자원 respawn 제거 — 청크 활성화 시 시드로 자동 생성됨

// === HTTP + WebSocket ===
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let humans = 0;
    for (const p of players.values()) if (!p.isNpc) humans++;
    res.end(JSON.stringify({
      zone: ZONE_ID,
      players: players.size,
      humans, cap: PLAYER_CAP,
      observers: observers.size,
      resources: resources.size,
      buildings: buildings.size,
      mobs: mobs.size,
      claims: claims.size,
      latency_ms: LATENCY_MS,
      uptime: process.uptime(),
    }));
    return;
  }
  if (req.url === '/metrics' && req.method === 'GET') {
    // Prometheus exposition format (간단 버전)
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const lines = [
      `# zone=${ZONE_ID}`,
      `durango_players ${players.size}`,
      `durango_observers ${observers.size}`,
      `durango_resources ${resources.size}`,
      `durango_buildings ${buildings.size}`,
      `durango_mobs ${mobs.size}`,
      `durango_claims ${claims.size}`,
      `durango_uptime_seconds ${process.uptime().toFixed(1)}`,
      `durango_latency_ms ${LATENCY_MS}`,
      `durango_handoffs_out_total ${metrics.handoffs_out}`,
      `durango_handoffs_in_total ${metrics.handoffs_in}`,
      `durango_handoff_acks_total ${metrics.handoff_acks}`,
      `durango_handoff_timeouts_total ${metrics.handoff_timeouts}`,
      `durango_chats_total ${metrics.chats}`,
      `durango_attacks_total ${metrics.attacks}`,
      `durango_builds_total ${metrics.builds}`,
      `durango_ws_connects_total ${metrics.ws_connects}`,
      `durango_ws_closes_total ${metrics.ws_closes}`,
    ];
    res.end(lines.join('\n') + '\n');
    return;
  }
  // === Phase 5-I: 경계 전투 — 이웃 zone이 보낸 ghost 스냅샷 수신 ===
  if (req.url === '/ghost_sync' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const now = Date.now();
        for (const s of data.players || []) ghostPlayers.set(s.playerId, { ax: s.ax, ay: s.ay, vx: s.vx || 0, vy: s.vy || 0, name: s.name, srcZone: data.srcZone, recvAt: now });
        // 건물 미러: 이 srcZone이 보낸 건물로 교체 (제거 반영 위해 prefix 클리어 후 재설정)
        if (Array.isArray(data.buildings)) {
          const prefix = data.srcZone + ':';
          for (const k of ghostBuildings.keys()) if (k.startsWith(prefix)) ghostBuildings.delete(k);
          for (const b of data.buildings) ghostBuildings.set(prefix + b.id, { acx: b.acx, acy: b.acy, side: b.side, type: b.type, floor: b.floor, recvAt: now });
        }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    });
    return;
  }
  // === Phase 5-I: 발사자 zone이 위임한 cross-zone 데미지 (내 플레이어가 경계 너머에서 맞음) ===
  if (req.url === '/cross_damage' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        let target = null;
        for (const p of players.values()) if (p.playerId === data.targetId) { target = p; break; }
        if (target) damagePlayer(target, data.dmg, `arrow:${data.attackerId}`);
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    });
    return;
  }
  // === 다른 zone 서버가 보내는 핸드오프 준비 요청 ===
  // POST /handoff_prepare { token, name, x, y, vx, vy, inventory }
  // target 서버는 토큰을 받아두고, 클라가 그 토큰으로 접속하면 그 상태로 플레이어 생성.
  if (req.url === '/handoff_prepare' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.token) { res.writeHead(400); res.end('no token'); return; }
        metrics.handoffs_in++;
        pendingHandoffs.set(data.token, {
          source_zone: data.source_zone || null,
          player_id: data.player_id || `anon_${Math.random().toString(36).slice(2,10)}`,
          name: (data.name || '여행자').slice(0, 16),
          color: (typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color)) ? data.color : '#5a9ae0',
          x: Math.max(0, Math.min(ZONE.zoneWidth, +data.x || 0)),
          y: Math.max(0, Math.min(ZONE.zoneHeight, +data.y || 0)),
          vx: +data.vx || 0,
          vy: +data.vy || 0,
          inventory: data.inventory || { wood: 0, stone: 0 },
          tools: data.tools || {},
          equipped: data.equipped || null,
          hunger: typeof data.hunger === 'number' ? data.hunger : HUNGER_MAX,
          thirst: typeof data.thirst === 'number' ? data.thirst : THIRST_MAX,
          vp: typeof data.vp === 'number' ? data.vp : 0,
          tribeId: data.tribeId || null,
          tribeName: data.tribeName || null,
          pvpEnabled: !!data.pvpEnabled,
          floor: data.floor || 0,
          createdAt: Date.now(),
        });
        // 5초 안에 클라가 접속 안 하면 만료
        setTimeout(() => pendingHandoffs.delete(data.token), 5000);
        console.log(`[${ZONE_ID}] ⇐ handoff_prepare token=${data.token.slice(0,8)} for ${data.name}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    return;
  }
  // === 크로스존 kick — 다른 zone에서 같은 player가 들어왔다는 알림 ===
  // POST /kick_player { player_id }
  if (req.url === '/kick_player' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const targetPlayerId = data.player_id;
        if (targetPlayerId) {
          for (const [pid, p] of players) {
            if (p.playerId === targetPlayerId) {
              console.log(`[${ZONE_ID}] 크로스존 kick: ${p.name} (${targetPlayerId})`);
              send(p.ws, { type: 'kicked', reason: 'duplicate_login' });
              const wsToClose = p.ws;
              players.delete(pid);
              broadcast({ type: 'player_left', pid });
              setTimeout(() => { try { wsToClose.close(); } catch (e) {} }, 300);
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    return;
  }
  // === 핸드오프 ACK — target이 토큰 사용해서 player 생성했다는 알림 ===
  // POST /handoff_ack { token }
  if (req.url === '/handoff_ack' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const entry = outgoingHandoffs.get(data.token);
        if (entry) {
          clearTimeout(entry.timeoutHandle);
          outgoingHandoffs.delete(data.token);
          metrics.handoff_acks++;
          const p = players.get(entry.pid);
          if (p) {
            players.delete(entry.pid);
            broadcast({ type: 'player_left', pid: entry.pid });
            // Phase 5-K3: ws를 닫지 않고 observer로 전환 — 클라가 이 zone을 fresh observer로
            // 재구독하면 observer welcome이 건물 전체를 다시 보내 끊김 발생. 연결을 유지하면
            // 재구독·full welcome이 없어지고, 이 observer ws는 promote 핸들러를 가지므로
            // 되돌아올 때도 즉시 promote = 끊김 없는 재크로싱.
            if (p.ws && p.ws.readyState === 1) {
              observers.set(p.ws, { viewerX: p.x, viewerY: p.y, lastSeen: Date.now() });
              attachObserverHandlers(p.ws);
              console.log(`[${ZONE_ID}] ✓ ACK token=${data.token.slice(0,8)} — ${p.name} 인계됨 → observer 전환(연결 유지)`);
            } else {
              console.log(`[${ZONE_ID}] ✓ ACK token=${data.token.slice(0,8)} — ${p.name} 인계됨 (ws 이미 닫힘)`);
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  metrics.ws_connects++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const isObserver = url.searchParams.get('observer') === '1';
  // Phase 5-G trace: observer 연결 진단용
  console.log(`[${ZONE_ID}] WS CONN attempt: observer=${isObserver} url=${req.url} from=${req.socket.remoteAddress}`);
  ws.on('close', (code, reason) => {
    console.log(`[${ZONE_ID}] WS CLOSE: observer=${isObserver} code=${code} reason=${reason ? reason.toString() : '(empty)'}`);
  });
  ws.on('error', (err) => {
    console.log(`[${ZONE_ID}] WS ERROR: observer=${isObserver} msg=${err.message}`);
  });

  // === Player cap 체크 (observer는 부담 적으니 제한 안 함) ===
  if (!isObserver) {
    // NPC 제외 인간 player 수
    let humanCount = 0;
    for (const p of players.values()) if (!p.isNpc) humanCount++;
    if (humanCount >= PLAYER_CAP) {
      console.log(`[${ZONE_ID}] zone 가득 참 (${humanCount}/${PLAYER_CAP}) — 접속 거부`);
      try { ws.send(JSON.stringify({ type: 'zone_full', cap: PLAYER_CAP, current: humanCount, zone: ZONE_ID })); } catch (e) {}
      setTimeout(() => { try { ws.close(); } catch (e) {} }, 100);
      return;
    }
  }

  // === Observer 분기 — 플레이어로 안 잡고 상태만 흘려보냄 ===
  if (isObserver) {
    // 초기 viewer 위치 (zone-local). 안 주면 zone 중앙.
    const initVx = parseFloat(url.searchParams.get('vx'));
    const initVy = parseFloat(url.searchParams.get('vy'));
    observers.set(ws, {
      viewerX: !isNaN(initVx) ? initVx : ZONE.zoneWidth / 2,
      viewerY: !isNaN(initVy) ? initVy : ZONE.zoneHeight / 2,
      lastSeen: Date.now(),
    });
    send(ws, {
      type: 'welcome',
      observer: true,
      zone: zonePublicMeta(),
      hardcodedTerrain: getHardcodedTerrainForZone(),
      resources: Array.from(resources.values()),
      claims: Array.from(claims.values()),
      buildings: activeChunkBuildings(),
      worldClock: {
        epoch: WORLD.worldEpoch,
        dayLengthMs: WORLD.dayLengthMs,
        dayPhaseRatio: WORLD.dayPhaseRatio,
        serverNow: Date.now(),
      },
    });
    sendCorpsesInit(ws);
    // 초기 tick — AOI 필터 적용
    const obs = observers.get(ws);
    send(ws, {
      type: 'tick',
      t: Date.now(),
      players: Array.from(players.values())
        .filter(p => Math.hypot(p.x - obs.viewerX, p.y - obs.viewerY) < AOI_RADIUS)
        .map(p => ({ pid: p.pid, x: p.x, y: p.y, name: p.name, color: p.color })),
    });
    attachObserverHandlers(ws);
    return;
  }

  // === 토큰 기반 핸드오프 우선 처리 ===
  const handoffToken = url.searchParams.get('handoff_token');
  let playerId, name, sx, sy, ivx = 0, ivy = 0, inventory = { wood: 0, stone: 0 }, color = '#5a9ae0';
  let tools = {}, equipped = null;
  let initHunger = HUNGER_MAX, initThirst = THIRST_MAX, initVp = 0;
  let initTribeId = null, initTribeName = null;
  let initFloor = 0;
  // 14.42-a: home (영구 부활 fallback). 게스트면 null로 유지.
  let initHomeZone = null, initHomeX = null, initHomeY = null;

  if (handoffToken && pendingHandoffs.has(handoffToken)) {
    const pending = pendingHandoffs.get(handoffToken);
    pendingHandoffs.delete(handoffToken);
    playerId = pending.player_id || `anon_${Math.random().toString(36).slice(2,10)}`;
    name = pending.name;
    if (typeof pending.hunger === 'number') initHunger = pending.hunger;
    if (typeof pending.thirst === 'number') initThirst = pending.thirst;
    if (typeof pending.vp === 'number') initVp = pending.vp;
    if (pending.tribeId) { initTribeId = pending.tribeId; initTribeName = pending.tribeName || null; }
    if (typeof pending.floor === 'number') initFloor = pending.floor;
    if (pending.home_zone) initHomeZone = pending.home_zone;
    if (typeof pending.home_x === 'number') initHomeX = pending.home_x;
    if (typeof pending.home_y === 'number') initHomeY = pending.home_y;
    sx = pending.x;
    sy = pending.y;
    ivx = pending.vx;
    ivy = pending.vy;
    inventory = pending.inventory;
    color = pending.color || color;
    tools = pending.tools || {};
    equipped = pending.equipped || null;
    console.log(`[${ZONE_ID}] ✓ handoff token=${handoffToken.slice(0,8)} consumed (player=${playerId})`);
    // source zone에 ACK 전송
    if (pending.source_zone && ZONES[pending.source_zone]) {
      const src = ZONES[pending.source_zone];
      console.log(`[${ZONE_ID}] ACK 전송 시작 → ${pending.source_zone} (${src.host}:${src.port}) token=${handoffToken.slice(0,8)}`);
      postJSON(src.host, src.port, '/handoff_ack', { token: handoffToken })
        .then(r => console.log(`[${ZONE_ID}] ACK → ${pending.source_zone} OK`, r))
        .catch(e => console.warn(`[${ZONE_ID}] ACK → ${pending.source_zone} 실패:`, e.message));
    } else {
      console.warn(`[${ZONE_ID}] ACK 못 보냄: source_zone=${pending.source_zone} ZONES에 ${pending.source_zone}=${!!ZONES[pending.source_zone]}`);
    }
  } else {
    // === 인증 처리 ===
    const inUsername = (url.searchParams.get('username') || '').trim().slice(0, 16);
    const inPassword = url.searchParams.get('password') || '';
    const incomingColor = url.searchParams.get('color');
    if (incomingColor && /^#[0-9a-fA-F]{6}$/.test(incomingColor)) color = incomingColor;

    if (inUsername && inPassword) {
      // 14.42-a: 신규 가입이면 client가 선택한 home_zone 전달.
      //  - 이 zone(접속 zone)이 곧 home zone임 (lobby에서 선택한 zone에 ws 연결되니까)
      //  - 그 zone의 마을광장이 home 좌표
      const myMain = ZONE.mainSquare || { x: ZONE.zoneWidth/2, y: ZONE.zoneHeight/2 };
      let result;
      try { result = await central.authenticate(inUsername, inPassword, color, ZONE_ID, myMain.x, myMain.y); }
      catch (e) {
        console.error(`[${ZONE_ID}] central 인증 실패:`, e.message);
        send(ws, { type: 'auth_error', reason: 'central_unavailable' });
        setTimeout(() => { try { ws.close(); } catch (e) {} }, 100);
        return;
      }
      if (!result || !result.ok) {
        send(ws, { type: 'auth_error', reason: result?.reason || 'unknown' });
        setTimeout(() => { try { ws.close(); } catch (e) {} }, 100);
        return;
      }
      playerId = result.player.player_id;
      name = result.player.name;
      color = result.player.color || color;
      // wood/stone은 컬럼, 나머지는 inventory_json에
      let extInv = {};
      try { extInv = result.player.inventory_json ? JSON.parse(result.player.inventory_json) : {}; }
      catch (e) { extInv = {}; }
      inventory = { wood: result.player.wood | 0, stone: result.player.stone | 0, ...extInv };
      try { tools = result.player.tools_json ? JSON.parse(result.player.tools_json) : {}; }
      catch (e) { tools = {}; }
      // 14.53: 옛 tools (object 또는 number 형식) → 새 toolItems list 변환
      // tools_json 안에 옛 형식 또는 새 형식 {toolItems, equipped, hotkey1} 둘 다 처리
      let toolItems = [];
      let hotkey1 = null;
      if (tools && typeof tools === 'object') {
        if (Array.isArray(tools.toolItems)) {
          // 새 형식 — 그대로
          toolItems = tools.toolItems;
          hotkey1 = tools.hotkey1 || null;
          if (typeof tools.equipped === 'string') equipped = tools.equipped;
        } else {
          // 옛 형식 — { axe: number|{d,max} } → instance 변환
          for (const [tn, val] of Object.entries(tools)) {
            if (tn === 'hotkey1' || tn === 'toolItems' || tn === 'equipped') continue;
            const mx = TOOL_MAX_DURABILITY[tn] || 100;
            let d = mx;
            if (typeof val === 'number' && val > 0) d = mx;
            else if (val && typeof val === 'object' && typeof val.d === 'number') d = val.d;
            if (d > 0) toolItems.push({ id: genToolId(), type: tn, d, max: mx });
          }
          equipped = null; // 옛 equipped 이름 → instance id로 매핑 불가, 그냥 해제
        }
      }
      tools = toolItems; // 호환용 — 아래에서 player.toolItems로 저장
      // 14.50: 시작 도구 (목공 시작 enable). 한 번도 만들지 않은 신규 player에게 1개씩.
      const ensureStart = (tn) => {
        if (!toolItems.some(t => t.type === tn)) {
          const mx = TOOL_MAX_DURABILITY[tn] || 100;
          toolItems.push({ id: genToolId(), type: tn, d: mx, max: mx });
        }
      };
      if (toolItems.length === 0) {
        ensureStart('saw');
        ensureStart('hammer');
        ensureStart('axe');
      }
      // 저장용: 임시 wrap 객체 (savePlayer가 tools_json으로 직렬화)
      // — 실제 player.toolItems / player.hotkey1 / player.equipped는 player 생성 시 할당됨 (아래)
      // 임시 변수에 저장
      const _toolItems = toolItems;
      const _hotkey1 = hotkey1;
      tools = { __toolItems: _toolItems, __hotkey1: _hotkey1 }; // 임시 컨테이너 (player 만들 때 풀어줌)
      if (!inventory.plank) inventory.plank = 10; // 시작 판자 약간
      equipped = result.player.equipped || null;
      initHunger = (typeof result.player.hunger === 'number') ? result.player.hunger : HUNGER_MAX;
      initThirst = (typeof result.player.thirst === 'number') ? result.player.thirst : THIRST_MAX;
      initVp = (typeof result.player.violation_points === 'number') ? result.player.violation_points : 0;
      initTribeId = result.player.tribe_id || null;
      // 14.49-fix2: 옛 auto-stair 버그로 floor 1+에 stuck된 사용자 복구. 무조건 0F로 시작.
      initFloor = 0;
      initHomeZone = result.player.home_zone || null;
      initHomeX = (typeof result.player.home_x === 'number') ? result.player.home_x : null;
      initHomeY = (typeof result.player.home_y === 'number') ? result.player.home_y : null;
      if (initTribeId) {
        // 부족 이름 한 번 더 조회 (캐시 가능)
        try {
          const tr = await central.request('GET', `/tribe/${initTribeId}`);
          if (tr.status === 200 && tr.data?.tribe) initTribeName = tr.data.tribe.name;
        } catch (e) {}
      }
      // 14.42-a: 등록 계정 — 우선순위로 spawn 좌표 산정
      //  1) last_zone == THIS && last_x/y 있음 → 그 자리 (재로그인 정상)
      //  2) home_zone == THIS && home_x/y 있음 → home 마을광장 (신규 가입 직후)
      //  3) 외 → zone center fallback
      //  (다른 zone에 home/last가 있는 경우 cross-zone 라우팅은 14.42-b)
      const p = result.player;
      if (p.last_zone === ZONE_ID && typeof p.last_x === 'number' && typeof p.last_y === 'number') {
        sx = p.last_x; sy = p.last_y;
      } else if (p.home_zone === ZONE_ID && typeof p.home_x === 'number' && typeof p.home_y === 'number') {
        sx = p.home_x; sy = p.home_y;
      } else {
        sx = ZONE.zoneWidth / 2;
        sy = ZONE.zoneHeight / 2;
      }
      console.log(`[${ZONE_ID}] ${result.isNew ? '신규 가입' : '로그인'}: ${name}  tribe=${initTribeName || '없음'}  spawn=(${sx.toFixed(0)},${sy.toFixed(0)})`);
    } else {
      // 게스트 모드 — central에 username 충돌만 확인
      if (inUsername) {
        try {
          const taken = await central.checkUsernameTaken(inUsername);
          if (taken) {
            send(ws, { type: 'auth_error', reason: 'username_taken' });
            setTimeout(() => { try { ws.close(); } catch (e) {} }, 100);
            return;
          }
        } catch (e) { /* central 죽었으면 그냥 통과 — 게스트는 영속화 안 되니까 큰 문제 안 됨 */ }
      }
      playerId = `anon_${Math.random().toString(36).slice(2,10)}`;
      name = inUsername || `여행자${nextPid}`;
      console.log(`[${ZONE_ID}] 게스트 접속: ${name} (${playerId})`);
      // 14.42-a: 게스트도 마을광장에서 시작
      const myMain = ZONE.mainSquare || { x: ZONE.zoneWidth/2, y: ZONE.zoneHeight/2 };
      sx = myMain.x; sy = myMain.y;
    }

    // 같은 player_id로 이 zone 내에 이미 접속 중이면 기존 세션 종료
    for (const [pid, p] of players) {
      if (p.playerId === playerId && p.ws !== ws) {
        console.log(`[${ZONE_ID}] 동일 zone 중복 차단: ${name}`);
        send(p.ws, { type: 'kicked', reason: 'duplicate_login' });
        const wsToClose = p.ws;
        players.delete(pid);
        broadcast({ type: 'player_left', pid });
        setTimeout(() => { try { wsToClose.close(); } catch (e) {} }, 300);
        break;
      }
    }
    // 등록 계정이면 다른 zone에도 kick 신호 전파 (크로스존 중복 차단)
    if (!playerId.startsWith('anon_')) {
      for (const [zid, z] of Object.entries(ZONES)) {
        if (zid === ZONE_ID) continue;
        postJSON(z.host, z.port, '/kick_player', { player_id: playerId })
          .catch(() => {}); // 다른 zone이 죽어있어도 무시
      }
    }
    // 14.42-a: sx/sy는 이미 위(등록 분기 or 게스트 분기)에서 정해짐 — 추가 fallback만
    if (typeof sx !== 'number' || typeof sy !== 'number') {
      const fb = ZONE.mainSquare || { x: ZONE.zoneWidth/2, y: ZONE.zoneHeight/2 };
      sx = fb.x; sy = fb.y;
    }
    // Phase 5-G: spawn 좌표를 cell center에 정확히 snap (시각 NE 16px 치우침 fix)
    // cell center = cellTile * 32 + 16. 모든 entity가 cell 격자에 align되어 보임.
    sx = Math.floor(sx / 32) * 32 + 16;
    sy = Math.floor(sy / 32) * 32 + 16;
  }

  const pid = `p${nextPid++}`;
  // 14.53: tools 임시 컨테이너에서 toolItems/hotkey1 풀기
  const _toolItems = (tools && tools.__toolItems) ? tools.__toolItems : (Array.isArray(tools) ? tools : []);
  const _hotkey1 = (tools && tools.__hotkey1) || null;
  const player = {
    pid, playerId, ws, name, color,
    x: sx, y: sy,
    vx: ivx, vy: ivy,
    inventory,
    tools: {},                  // 옛 호환용 (사용 X)
    toolItems: _toolItems,      // 14.53: instance 리스트
    equipped,                   // 14.53: toolItemId
    hotkey1: _hotkey1,          // 14.53: 1번 슬롯 toolItemId
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    hunger: initHunger, thirst: initThirst, vp: initVp,
    tribeId: initTribeId, tribeName: initTribeName,
    pvpEnabled: false,
    floor: initFloor, // 2.5D — 현재 캐릭터 층 (영속화 + 핸드오프 캐리)
    // 14.42-a: home (영구 부활 fallback)
    _homeZone: initHomeZone,
    _homeX: initHomeX,
    _homeY: initHomeY,
    lastAttackAt: 0,
    lastDamagedAt: 0,
    handingOff: false,
    lastSeen: Date.now(),
    _arrivedAt: Date.now(), // Phase 5-K: 핸드오프 직후 재핸드오프 쿨다운 기준

  };
  players.set(pid, player);

  // 활성 청크 즉시 갱신 — 이 player 주변 청크의 시드 자원 spawn → welcome.resources에 포함됨
  updateActiveChunks();

  // central에 위치 업데이트 (게스트 제외)
  savePlayer(player, { last_zone: ZONE_ID, last_x: sx, last_y: sy });

  console.log(`[${ZONE_ID}] + ${name} (${pid}) @ (${sx.toFixed(0)}, ${sy.toFixed(0)})  total=${players.size}`);

  // 환영 메시지 — 존 정보와 현재 상태 모두 전달
  send(ws, {
    type: 'welcome',
    pid,
    zone: zonePublicMeta(),
    hardcodedTerrain: getHardcodedTerrainForZone(),
    resources: Array.from(resources.values()),
    claims: Array.from(claims.values()),
    buildings: activeChunkBuildings(),
    groundItems: Array.from(groundItems.values()), // Phase 14.23
    mobs: Array.from(mobs.values()).map(m => ({ mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, tameOwner: m.tameOwner || null, tameOwnerName: m.tameOwnerName || null })),
    inventory: player.inventory,
    toolItems: player.toolItems || [], hotkey1: player.hotkey1 || null, equipped: player.equipped || null,
    tools: player.tools, // 옛 호환 (사용 X)
    recipes: RECIPES,
    itemRecipes: ITEM_RECIPES,         // 14.50
    buildingRecipes: BUILDING_RECIPES, // 14.51
    cookRecipes: COOK_RECIPES,
    foodEffects: FOOD_EFFECTS,
    self: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
            hunger: Math.round(player.hunger), thirst: Math.round(player.thirst),
            vp: Math.round(player.vp ?? 0),
            tribeId: player.tribeId || null, tribeName: player.tribeName || null,
            floor: player.floor || 0,
            // 14.42-a — home 위치 (클라가 부활 옵션 UI 등에 사용)
            homeZone: player._homeZone || null,
            homeX: player._homeX, homeY: player._homeY },
    worldClock: {
      epoch: WORLD.worldEpoch,
      dayLengthMs: WORLD.dayLengthMs,
      dayPhaseRatio: WORLD.dayPhaseRatio,
      serverNow: Date.now(), // 클라가 자기 시계 보정용으로 씀
    },
  });
  sendCorpsesInit(ws);

  // ws에 player input/close 핸들러 attach
  attachPlayerHandlers(ws, player);
});

// === 외부 player 핸들러 (observer promotion에서 재사용) ===
function handlePlayerInput(player, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
  const ws = player.ws;

  // Phase 14.41: 다운 중엔 부활/구조/ping/chat만 허용
  if (player.isDown) {
    const allowed = new Set(['respawn_choice', 'rescue_request', 'ping', 'chat', 'input']);
    if (!allowed.has(msg.type)) return;
  }

  if (msg.type === 'input') {
    // Phase 14.41: 다운(사망) 중이면 입력 무시
    if (player.isDown) { player.vx = 0; player.vy = 0; if (player.inputQueue) player.inputQueue.length = 0; return; }
    // 리컨실리에이션: 입력을 즉시 적용하지 않고 큐에 버퍼 → tick이 '받은 순서대로 1개씩' 적용(applyQueuedInput).
    //   즉시-적용은 '틱당 최신 것'이 되어 클라 고정스텝 순서와 어긋나 매 틱 보정→떨림. 큐로 순서·타이밍 일치 → 보정 0.
    if (!player.inputQueue) player.inputQueue = [];
    player.inputQueue.push({
      seq: (typeof msg.seq === 'number') ? msg.seq : 0,
      vx: clamp(msg.vx, -1, 1), vy: clamp(msg.vy, -1, 1), sprint: !!msg.sprint,
    });
    if (player.inputQueue.length > 12) player.inputQueue.shift(); // burst 상한 (리컨실리에이션이 보정)
    player.lastSeen = Date.now();
    player._inputCnt = (player._inputCnt || 0) + 1;
    if (!player._inputLogAt || Date.now() - player._inputLogAt > 1000) {
      player._inputLogAt = Date.now();
      console.log(`[${ZONE_ID}/in] ${player.name} input cnt=${player._inputCnt} vx=${vx} vy=${vy} sp=${player.sprint?1:0}`);
    }
  } else if (msg.type === 'respawn_choice') {
    // Phase 14.41: 사망 후 부활 위치 선택 (personal | temporary)
    tryRespawnChoice(player, msg.kind);
  } else if (msg.type === 'rescue_request') {
    // Phase 14.41: 같은 길드원이 다운된 동료를 R 키로 구조
    tryRescue(player, msg.pid);
  } else if (msg.type === 'butcher') butcherCorpse(player, msg.cid);  // Phase 5-7
  else if (msg.type === 'gather') tryGather(player);
  else if (msg.type === 'claim') tryClaim(player, msg.kind || 'personal');
  else if (msg.type === 'drop_item') tryDropItem(player, msg.item, msg.amount || 1);
  else if (msg.type === 'pickup_item') tryPickupItem(player, msg.giId);
  else if (msg.type === 'repair_building') tryRepairBuilding(player);
  else if (msg.type === 'unclaim') tryUnclaim(player, msg.claimId);
  else if (msg.type === 'trade_offer') tryTrade(player, msg);
  else if (msg.type === 'ping') { player.lastSeen = Date.now(); send(ws, { type: 'pong', t: msg.t }); }
  else if (msg.type === 'teleport_debug') {
    // 디버그: zone-local 좌표로 워프. zone 안 + water cell 아닌 곳만 허용.
    const tx = Math.max(0, Math.min(ZONE.zoneWidth  - 1, msg.x | 0));
    const ty = Math.max(0, Math.min(ZONE.zoneHeight - 1, msg.y | 0));
    if (typeof isTerrainBlockedLocal === 'function' && isTerrainBlockedLocal(tx, ty)) {
      send(ws, { type: 'notice', text: '🌊 강·바다 위로는 텔레포트 불가' });
      return;
    }
    player.x = tx;
    player.y = ty;
    player.vx = 0; player.vy = 0;
    player.dirty = true;
    console.log(`[${ZONE_ID}] 🌀 teleport ${player.name} → (${tx},${ty})`);
    send(ws, { type: 'notice', text: `🌀 텔레포트 → (${tx},${ty})` });
  }
  else if (msg.type === 'chat') {
    const text = (msg.text || '').slice(0, 200);
    if (!text.trim()) return;
    metrics.chats++;
    if (text.startsWith('/t ')) {
      if (!player.tribeId) { send(player.ws, { type: 'notice', text: '길드 소속이 아닙니다' }); return; }
      const tribeText = text.slice(3).trim();
      if (!tribeText) return;
      broadcastToTribe(player, {
        type: 'chat', pid: player.pid, name: player.name, color: player.color,
        text: tribeText, t: Date.now(), tribe: player.tribeName || '길드',
      });
      console.log(`[${ZONE_ID}] 💬[${player.tribeName}] ${player.name}: ${tribeText}`);
      return;
    }
    broadcast({
      type: 'chat', pid: player.pid, name: player.name, color: player.color,
      text, t: Date.now(),
    });
    console.log(`[${ZONE_ID}] 💬 ${player.name}: ${text}`);
  } else if (msg.type === 'build') {
    metrics.builds++;
    // 14.49-d: stair 빌드 시 player facing으로 dir 결정 (클라가 보낸 dir 우선)
    let buildDir = msg.dir;
    if (msg.buildType === 'stair' && !buildDir) {
      const vx = player.vx || 0, vy = player.vy || 0;
      if (Math.abs(vx) > Math.abs(vy)) buildDir = vx > 0 ? 'E' : 'W';
      else if (vy !== 0) buildDir = vy > 0 ? 'S' : 'N';
      else buildDir = 'N'; // 정지 중이면 기본 N
    }
    tryBuild(player, msg.buildType, msg.floor || 0, msg.side || null, msg.atX, msg.atY, buildDir);
  }
  else if (msg.type === 'chest_put') tryChestPut(player, msg.buildingId, msg.item, +msg.amount || 1);
  else if (msg.type === 'chest_take') tryChestTake(player, msg.buildingId, msg.item, +msg.amount || 1);
  else if (msg.type === 'attack') { metrics.attacks++; tryAttack(player); }
  else if (msg.type === 'ranged_attack') { metrics.attacks++; tryRangedAttack(player, +msg.aimX, +msg.aimY); }
  else if (msg.type === 'craft') doCraft(player, msg.recipe);
  else if (msg.type === 'craft_item') doCraftItem(player, msg.recipe);
  else if (msg.type === 'door_toggle') doDoorToggle(player, msg.buildingId);
  // 14.51: 건축물 아이템화 시스템
  else if (msg.type === 'craft_building') doCraftBuilding(player, msg.recipe);
  else if (msg.type === 'place_building') doPlaceBuilding(player, msg.itemType, msg.atX, msg.atY, msg.floor, msg.dir, msg.side);
  else if (msg.type === 'dismantle_building') doDismantleBuilding(player, msg.buildingId);
  // 14.53: equip은 이제 toolItemId 기반 (옛 msg.tool도 호환 — type 이름이면 첫 instance)
  else if (msg.type === 'equip') {
    let id = msg.toolItemId || msg.tool || null;
    // 옛 클라가 type 이름 보내면 첫 instance로
    if (id && player.toolItems && !player.toolItems.find(t => t.id === id)) {
      const inst = player.toolItems.find(t => t.type === id && t.d > 0);
      id = inst ? inst.id : null;
    }
    doEquip(player, id);
  }
  else if (msg.type === 'set_hotkey') doSetHotkey(player, msg.toolItemId || null);
  else if (msg.type === 'toggle_hotkey') doToggleHotkey(player);
  else if (msg.type === 'eat') doEat(player, msg.item);
  else if (msg.type === 'cook') doCook(player, msg.recipe);
  else if (msg.type === 'harvest') tryHarvest(player);
  else if (msg.type === 'feed') tryFeed(player);
  else if (msg.type === 'tribe_set') {
    // 클라가 central에 길드 만들기/가입/탈퇴 후 자기 zone에 알림
    player.tribeId = msg.tribeId || null;
    player.tribeName = msg.tribeName || null;
    savePlayer(player);
    send(player.ws, { type: 'notice', text: player.tribeId ? `길드 [${player.tribeName}] 적용` : '길드 탈퇴됨' });
  }
  else if (msg.type === 'pvp_set') {
    player.pvpEnabled = !!msg.enabled;
    send(player.ws, { type: 'pvp_state', enabled: player.pvpEnabled });
    send(player.ws, { type: 'notice', text: player.pvpEnabled ? '⚔️ PvP 활성화' : '🕊️ PvP 비활성화' });
  }
  // 14.49-e7b: change_floor 메시지 핸들러 제거 (자동 계단으로 대체)
}

// === 부족 채팅 라우팅 ===
function broadcastToTribe(senderPlayer, msg) {
  for (const p of players.values()) {
    if (p.tribeId && senderPlayer.tribeId && p.tribeId === senderPlayer.tribeId) {
      send(p.ws, msg);
    }
  }
}

// === mob 길들이기 ===
function tryFeed(player) {
  const nearby = qtMobs ? qtMobs.queryCircle(player.x, player.y, 80) : Array.from(mobs.values());
  let best = null, bestDist = 80;
  for (const m of nearby) {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < bestDist) { best = m; bestDist = d; }
  }
  if (!best) { send(player.ws, { type: 'notice', text: '근처에 동물이 없습니다' }); return; }
  const def = MOB_DEFS[best.type];
  if (!def?.tameFood) { send(player.ws, { type: 'notice', text: `${best.type}는 길들일 수 없음` }); return; }
  // 이미 다른 사람 거면 거부
  if (best.tameOwner && best.tameOwner !== player.playerId) {
    send(player.ws, { type: 'notice', text: `${best.tameOwnerName}의 동물입니다` }); return;
  }
  // 음식 보유 체크
  if ((player.inventory[def.tameFood] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${def.tameFood} 필요 (${best.type} 길들이기)` }); return;
  }
  player.inventory[def.tameFood] -= 1;
  if (best.tameOwner === player.playerId) {
    // 이미 내 동물 — hp 회복만
    best.hp = Math.min(best.maxHp, best.hp + 5);
    best.dirty = true;
    broadcast({ type: 'mob_damaged', mid: best.mid, hp: best.hp });
    send(player.ws, { type: 'notice', text: `${best.type} HP +5` });
  } else {
    best.tameProgress = (best.tameProgress || 0) + 1;
    if (best.tameProgress >= def.tameNeed) {
      best.tameOwner = player.playerId;
      best.tameOwnerName = player.name;
      best.aggroTarget = null; // 어그로 해제
      best.dirty = true;
      broadcast({ type: 'mob_tamed', mid: best.mid, owner: player.playerId, ownerName: player.name });
      send(player.ws, { type: 'notice', text: `🎉 ${best.type} 길들이기 성공!` });
    } else {
      send(player.ws, { type: 'notice', text: `먹이 줌 (${best.tameProgress}/${def.tameNeed})` });
    }
  }
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  savePlayer(player);
}

// === 농사 수확 ===
function tryHarvest(player) {
  const nearby = qtBuildings ? qtBuildings.queryCircle(player.x, player.y, 96) : Array.from(buildings.values());
  let best = null, bestDist = 96;
  for (const b of nearby) {
    if (b.type !== 'farmland') continue;
    if (b.ownerId !== player.playerId) continue; // 자기 farmland만
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bestDist) { best = b; bestDist = d; }
  }
  if (!best) { send(player.ws, { type: 'notice', text: '근처에 자기 농지가 없습니다' }); return; }
  if (!best.data || !best.data.ready) {
    const remain = Math.max(0, Math.round((best.data?.readyAt - Date.now()) / 1000));
    send(player.ws, { type: 'notice', text: `아직 자라는 중 (${remain}초 남음)` });
    return;
  }
  // 수확 — berry 3 + seed_berry 1 + farmland 제거
  player.inventory.berry = (player.inventory.berry || 0) + 3;
  player.inventory.seed_berry = (player.inventory.seed_berry || 0) + 1;
  if (best.dbId) { try { db.deleteBuilding(best.dbId); } catch (e) {} }
  chunkManager.removeBuilding(best);
  buildings.delete(best.id);
  broadcast({ type: 'building_removed', id: best.id });
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: '수확! 🫐 ×3 + 씨앗 ×1' });
  savePlayer(player);
}

// === 음식 먹기 ===
function doEat(player, item) {
  const eff = FOOD_EFFECTS[item];
  if (!eff) {
    send(player.ws, { type: 'notice', text: `먹을 수 없는 아이템: ${item}` }); return;
  }
  if ((player.inventory[item] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${item} 부족` }); return;
  }
  player.inventory[item] -= 1;
  if (eff.hunger)   player.hunger = Math.min(HUNGER_MAX, (player.hunger ?? HUNGER_MAX) + eff.hunger);
  if (eff.thirst)   player.thirst = Math.min(THIRST_MAX, (player.thirst ?? THIRST_MAX) + eff.thirst);
  if (eff.hpDelta)  { player.hp = Math.max(0, Math.min(player.maxHp, player.hp + eff.hpDelta));
                      broadcast({ type: 'player_damaged', pid: player.pid, hp: player.hp }); }
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst) });
  send(player.ws, { type: 'notice', text: `${item} 섭취 (+허기 ${eff.hunger||0})` });
  savePlayer(player);
}

// === 요리 (campfire 근처에서만) ===
function doCook(player, recipeName) {
  const recipe = COOK_RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 요리: ${recipeName}` }); return;
  }
  // campfire 근처(96px) 확인
  let nearFire = false;
  for (const b of buildings.values()) {
    if (b.type !== 'campfire') continue;
    if (Math.hypot(b.x - player.x, b.y - player.y) < 96) { nearFire = true; break; }
  }
  if (!nearFire) {
    send(player.ws, { type: 'notice', text: '모닥불 근처여야 요리 가능' }); return;
  }
  // 재료 확인
  for (const [item, amt] of Object.entries(recipe.cost)) {
    if ((player.inventory[item] || 0) < amt) {
      send(player.ws, { type: 'notice', text: `${item} ${amt}개 필요` }); return;
    }
  }
  for (const [item, amt] of Object.entries(recipe.cost)) {
    player.inventory[item] -= amt;
  }
  for (const [item, amt] of Object.entries(recipe.produces)) {
    player.inventory[item] = (player.inventory[item] || 0) + amt;
  }
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `${recipe.label} 완성` });
  savePlayer(player);
}

// Phase 5-K3: observer 메시지 핸들러 — 일반 observer 연결 + 핸드오프 후 primary→observer 전환 공용.
// (옛 인라인 클로저를 모듈 스코프로 승격. ws를 인자로 받음.)
function handleObserverMessage(ws, raw) {
  let msg; try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
  if (msg.type === 'ping') {
    const d = observers.get(ws); if (d) d.lastSeen = Date.now();
    send(ws, { type: 'pong', t: msg.t });
  }
  else if (msg.type === 'viewport_update') {
    const data = observers.get(ws);
    if (!data) return;
    data.viewerX = Math.max(0, Math.min(ZONE.zoneWidth, +msg.x || 0));
    data.viewerY = Math.max(0, Math.min(ZONE.zoneHeight, +msg.y || 0));
    data.lastSeen = Date.now();
  }
  else if (msg.type === 'promote_to_primary' && msg.token && pendingHandoffs.has(msg.token)) {
    // === Observer→Primary in-place 승격 ===
    const pending = pendingHandoffs.get(msg.token);
    pendingHandoffs.delete(msg.token);
    // 중복 player 정리 (한 ws에 두 명 막기)
    for (const [oldPid, p] of players) {
      if (p.playerId === pending.player_id && p.ws !== ws) {
        console.log(`[${ZONE_ID}] promote: 기존 ${oldPid} 정리`);
        send(p.ws, { type: 'kicked', reason: 'promoted_elsewhere' });
        players.delete(oldPid);
        broadcast({ type: 'player_left', pid: oldPid });
        setTimeout(() => { try { p.ws.close(); } catch (e) {} }, 200);
      }
    }
    observers.delete(ws);
    const pid = `p${nextPid++}`;
    const player = {
      pid, playerId: pending.player_id, ws,
      name: pending.name, color: pending.color,
      x: pending.x, y: pending.y,
      vx: pending.vx || 0, vy: pending.vy || 0,
      inventory: pending.inventory || { wood: 0, stone: 0 },
      tools: pending.tools || {},
      equipped: pending.equipped || null,
      hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
      hunger: typeof pending.hunger === 'number' ? pending.hunger : HUNGER_MAX,
      thirst: typeof pending.thirst === 'number' ? pending.thirst : THIRST_MAX,
      vp: typeof pending.vp === 'number' ? pending.vp : 0,
      tribeId: pending.tribeId || null, tribeName: pending.tribeName || null,
      pvpEnabled: !!pending.pvpEnabled,
      floor: pending.floor || 0,
      _homeZone: pending.home_zone || null,
      _homeX: typeof pending.home_x === 'number' ? pending.home_x : null,
      _homeY: typeof pending.home_y === 'number' ? pending.home_y : null,
      lastAttackAt: 0, lastDamagedAt: 0,
      handingOff: false, lastSeen: Date.now(), _arrivedAt: Date.now(),
    };
    players.set(pid, player);
    updateActiveChunks();
    if (pending.source_zone && ZONES[pending.source_zone]) {
      const src = ZONES[pending.source_zone];
      postJSON(src.host, src.port, '/handoff_ack', { token: msg.token })
        .catch(e => console.warn(`[${ZONE_ID}] promote ACK 실패:`, e.message));
    }
    send(ws, {
      type: 'welcome',
      // promote는 observer ws 재사용 — resources/claims/buildings는 이미 보유·실시간 갱신 중이라 생략.
      promoted: true,
      pid,
      zone: zonePublicMeta(),
      hardcodedTerrain: getHardcodedTerrainForZone(),
      // Phase 5-K4: mobs도 생략 — observer가 tick(visibleMobs)으로 이미 받고 갱신 중.
      inventory: player.inventory,
      toolItems: player.toolItems || [], hotkey1: player.hotkey1 || null, equipped: player.equipped || null,
      tools: player.tools,
      recipes: RECIPES,
      itemRecipes: ITEM_RECIPES,
      buildingRecipes: BUILDING_RECIPES,
      cookRecipes: COOK_RECIPES,
      foodEffects: FOOD_EFFECTS,
      self: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
              hunger: Math.round(player.hunger), thirst: Math.round(player.thirst),
              vp: Math.round(player.vp ?? 0),
              tribeId: player.tribeId || null, tribeName: player.tribeName || null,
              floor: player.floor || 0,
              homeZone: player._homeZone || null,
              homeX: player._homeX, homeY: player._homeY },
      worldClock: {
        epoch: WORLD.worldEpoch, dayLengthMs: WORLD.dayLengthMs,
        dayPhaseRatio: WORLD.dayPhaseRatio, serverNow: Date.now(),
      },
    });
    sendCorpsesInit(ws);
    attachPlayerHandlers(ws, player);
    console.log(`[${ZONE_ID}] ✨ promote observer→primary ${player.name} token=${msg.token.slice(0,8)} v=(${player.vx},${player.vy})`);
  }
}
function attachObserverHandlers(ws) {
  ws.removeAllListeners('message');
  ws.removeAllListeners('close');
  ws.on('message', (raw) => {
    if (LATENCY_MS > 0) setTimeout(() => handleObserverMessage(ws, raw), LATENCY_MS);
    else handleObserverMessage(ws, raw);
  });
  ws.on('close', () => observers.delete(ws));
  ws.on('error', () => observers.delete(ws));
}

function attachPlayerHandlers(ws, player) {
  ws.removeAllListeners('message');
  ws.removeAllListeners('close');
  ws.on('message', (raw) => {
    if (LATENCY_MS > 0) setTimeout(() => handlePlayerInput(player, raw), LATENCY_MS);
    else handlePlayerInput(player, raw);
  });
  ws.on('close', () => {
    metrics.ws_closes++;
    savePlayer(player, { last_zone: ZONE_ID, last_x: player.x, last_y: player.y });
    players.delete(player.pid);
    console.log(`[${ZONE_ID}] - ${player.name} (${player.pid})  total=${players.size}`);
    broadcast({ type: 'player_left', pid: player.pid });
  });
}

// === Crafting ===
// 14.50: 자원 변환 (saw로 통나무→판자 등)
function doCraftItem(player, recipeName) {
  const recipe = ITEM_RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 가공 레시피: ${recipeName}` }); return;
  }
  // 14.52: requiresTool은 도구 — 내구도 양수 체크
  if (recipe.requiresTool && !hasTool(player, recipe.requiresTool)) {
    send(player.ws, { type: 'notice', text: `${recipe.requiresTool} 없거나 깨짐` }); return;
  }
  for (const [it, amt] of Object.entries(recipe.from)) {
    if ((player.inventory[it] || 0) < amt) {
      send(player.ws, { type: 'notice', text: `${it} ${amt}개 필요` }); return;
    }
  }
  for (const [it, amt] of Object.entries(recipe.from)) {
    player.inventory[it] -= amt;
  }
  for (const [it, amt] of Object.entries(recipe.to)) {
    player.inventory[it] = (player.inventory[it] || 0) + amt;
  }
  // 14.53: 도구 instance 내구도 -1 (saw 등)
  if (recipe.requiresTool) consumeToolByType(player, recipe.requiresTool, 1);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `${recipe.label} 완료` });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// 14.51: 건축물 = 인벤 아이템. craft 패널에서 만들면 인벤 추가.
function doCraftBuilding(player, recipeName) {
  const recipe = BUILDING_RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 건축물 레시피: ${recipeName}` }); return;
  }
  // 14.52: 망치는 "도구" — 내구도 양수 체크 (재료 아님)
  if (recipe._useHammer && !hasTool(player, 'hammer')) {
    send(player.ws, { type: 'notice', text: '망치가 없거나 깨졌습니다' }); return;
  }
  // cost = recipe의 _가 안 붙은 모든 key
  const cost = {};
  for (const [k, v] of Object.entries(recipe)) {
    if (k.startsWith('_') || k === 'label') continue;
    cost[k] = v;
  }
  for (const [k, v] of Object.entries(cost)) {
    if ((player.inventory[k] || 0) < v) {
      send(player.ws, { type: 'notice', text: `${k} ${v}개 필요` }); return;
    }
  }
  for (const [k, v] of Object.entries(cost)) player.inventory[k] -= v;
  player.inventory[recipeName] = (player.inventory[recipeName] || 0) + 1;
  // 14.53: 망치 instance 내구도 -1
  if (recipe._useHammer) consumeToolByType(player, 'hammer', 1);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `${recipe.label} 제작 완료 (인벤에 추가됨)` });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// 14.51: 건축 모드에서 인벤 아이템 → 월드 배치. 자원 소비는 없고 인벤 1개만 차감.
function doPlaceBuilding(player, itemType, atX, atY, floor, dir, side) {
  const recipe = BUILDING_RECIPES[itemType];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 건축물 아이템: ${itemType}` }); return;
  }
  if ((player.inventory[itemType] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${recipe.label} 인벤에 없음` }); return;
  }
  // 14.53-h: player 자신의 floor에서만 배치 가능 (다른 층 차단)
  const playerFloor = player.floor || 0;
  if ((floor || 0) !== playerFloor) {
    send(player.ws, { type: 'notice', text: `현재 ${playerFloor}F에 있음 — 다른 층 설치 불가` }); return;
  }
  // 14.53-i: wall/door는 dir이 side 의미 (N/S/E/W). 일반 building은 dir이 회전.
  const isEdgeBuild = (recipe._buildType === 'wall' || recipe._buildType === 'door');
  const realSide = isEdgeBuild ? (dir || side || 'N') : (side || null);
  // _tryBuildAt 호출 (자원 소비 skip). 빌드 성공 시에만 인벤 차감.
  const result = _tryBuildAt(player, recipe._buildType, floor || 0, realSide, dir || null, { skipCost: true, atX, atY });
  if (result === true) {
    player.inventory[itemType] -= 1;
    send(player.ws, { type: 'inventory', inventory: player.inventory });
    if (!player.playerId.startsWith('anon_')) savePlayer(player);
  }
}

// 14.51: 건축 모드에서 건축물 분해. 거리 체크 + 인벤에 +1 환원.
function doDismantleBuilding(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b) {
    send(player.ws, { type: 'notice', text: '건축물 없음' }); return;
  }
  // 14.53-h: 같은 floor 건물만 분해 가능
  const playerFloor = player.floor || 0;
  if ((b.floor || 0) !== playerFloor) {
    send(player.ws, { type: 'notice', text: `현재 ${playerFloor}F에 있음 — 다른 층 건물 분해 불가` }); return;
  }
  // 14.54-d: 다른 사람 사유지 건물 분해 불가
  for (const c of claims.values()) {
    if (c.ownerPid !== player.playerId &&
        b.x >= c.x && b.x < c.x + c.w && b.y >= c.y && b.y < c.y + c.h) {
      send(player.ws, { type: 'notice', text: '다른 사람 사유지 건물은 분해 불가' }); return;
    }
  }
  const d = Math.hypot(b.x - player.x, b.y - player.y);
  if (d > 80) {
    send(player.ws, { type: 'notice', text: '건축물이 너무 멉니다' }); return;
  }
  // 소유자 체크 (자기 길드 영지 안이면 OK)
  // — 일단 누구든 가능 (PZ 스타일). 추후 chest 등은 잠금 체크 필요할 수도.
  const itemType = BUILDING_TYPE_TO_ITEM[b.type];
  if (itemType) {
    player.inventory[itemType] = (player.inventory[itemType] || 0) + 1;
  }
  // chest는 내용물도 반환 (간단히 inventory로 합침)
  if (b.type === 'chest' && b.data) {
    for (const [k, v] of Object.entries(b.data)) {
      if (typeof v === 'number' && v > 0) {
        player.inventory[k] = (player.inventory[k] || 0) + v;
      }
    }
  }
  // 14.54-a: stair ↔ auto floor cascade
  let cascadeIds = [];
  if (b.type === 'stair' && b.data?._autoFloorId) {
    cascadeIds.push(b.data._autoFloorId);
  } else if (b.type === 'floor' && b.data?._parentStairId) {
    cascadeIds.push(b.data._parentStairId);
  }
  // 건축물 제거
  buildings.delete(buildingId);
  if (chunkManager && chunkManager.removeBuilding) chunkManager.removeBuilding(b);
  if (b.dbId) db.deleteBuilding(b.dbId);
  broadcast({ type: 'building_removed', id: buildingId });
  // cascade로 함께 제거 (재귀 호출 X — 직접)
  for (const cid of cascadeIds) {
    const cb = buildings.get(cid);
    if (!cb) continue;
    buildings.delete(cid);
    if (chunkManager && chunkManager.removeBuilding) chunkManager.removeBuilding(cb);
    if (cb.dbId) db.deleteBuilding(cb.dbId);
    broadcast({ type: 'building_removed', id: cid });
    // cascade한 stair도 인벤 환원? 사용자 의도: floor 해체 시 stair도 해체. 그러면 stair 인벤 환원해야.
    const cascItemType = BUILDING_TYPE_TO_ITEM[cb.type];
    if (cascItemType) {
      player.inventory[cascItemType] = (player.inventory[cascItemType] || 0) + 1;
    }
  }
  // 14.49-e3-perf3: stair/wall cache 무효화
  if (typeof stairCellCacheBuiltAt !== 'undefined') stairCellCacheBuiltAt = 0;
  if (typeof wallCellCacheBuiltAt !== 'undefined') wallCellCacheBuiltAt = 0;
  stairCellDirty = true;
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `${itemType ? BUILDING_RECIPES[itemType].label : b.type} 분해 → 인벤 환원` });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// 14.50: 문 열기/닫기
function doDoorToggle(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'door') {
    send(player.ws, { type: 'notice', text: '문이 아닙니다' }); return;
  }
  const d = Math.hypot(b.x - player.x, b.y - player.y);
  if (d > 80) {
    send(player.ws, { type: 'notice', text: '문이 너무 멉니다' }); return;
  }
  b.data.open = !b.data.open;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  broadcast({ type: 'building_updated', building: b });
}

function doCraft(player, recipeName) {
  const recipe = RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 레시피: ${recipeName}` });
    return;
  }
  if ((player.inventory.wood || 0) < recipe.wood || (player.inventory.stone || 0) < recipe.stone) {
    send(player.ws, { type: 'notice', text: `${recipe.label} 제작에는 나무 ${recipe.wood}, 돌 ${recipe.stone} 필요` });
    return;
  }
  player.inventory.wood -= recipe.wood;
  player.inventory.stone -= recipe.stone;
  // 14.53: 새 instance 추가 (자동 장착 X — 사용자가 인벤에서 직접 착용)
  if (!player.toolItems) player.toolItems = [];
  const mx = TOOL_MAX_DURABILITY[recipeName] || 100;
  const inst = { id: genToolId(), type: recipeName, d: mx, max: mx };
  player.toolItems.push(inst);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
  send(player.ws, { type: 'notice', text: `${recipe.label} 제작 완료 (인벤에 추가)` });
  if (!player.playerId.startsWith('anon_')) {
    savePlayer(player);
  }
}

// 14.53: equip은 toolItemId 기반. null = 해제. 다른 거 들면 옛 거 자동 해제 (1개만 장착).
function doEquip(player, toolItemId) {
  if (!toolItemId) {
    player.equipped = null;
  } else {
    const inst = player.toolItems && player.toolItems.find(t => t.id === toolItemId);
    if (!inst) {
      send(player.ws, { type: 'notice', text: '해당 도구 없음' });
      return;
    }
    if (inst.d <= 0) {
      send(player.ws, { type: 'notice', text: '깨진 도구' });
      return;
    }
    player.equipped = inst.id; // 옛 거 자동 해제 (한 번에 1개)
  }
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// 14.53: hotkey1 슬롯에 도구 등록. null이면 슬롯 비움.
function doSetHotkey(player, toolItemId) {
  if (!toolItemId) {
    player.hotkey1 = null;
  } else {
    const inst = player.toolItems && player.toolItems.find(t => t.id === toolItemId);
    if (!inst) {
      send(player.ws, { type: 'notice', text: '해당 도구 없음' });
      return;
    }
    player.hotkey1 = inst.id;
  }
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// 14.53: 1키 = hotkey1 등록 도구 토글 (착용 ↔ 해제)
function doToggleHotkey(player) {
  if (!player.hotkey1) return;
  // 슬롯 도구가 이미 장착 중이면 해제, 아니면 장착
  if (player.equipped === player.hotkey1) {
    player.equipped = null;
  } else {
    // 슬롯 도구 instance가 살아있나 확인
    const inst = player.toolItems && player.toolItems.find(t => t.id === player.hotkey1);
    if (!inst || inst.d <= 0) {
      // 깨졌으면 슬롯 비움
      player.hotkey1 = null;
    } else {
      player.equipped = inst.id;
    }
  }
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
  if (!player.playerId.startsWith('anon_')) savePlayer(player);
}

// ═══════════════════════════════════════════════════════════════════
// 광맥 채굴 — 셀별 번영도 (lazy timestamp refill). 틱 없음, 채굴 시에만 계산.
// ═══════════════════════════════════════════════════════════════════
const Specialty = require('./specialty');
const minedCells = new Map();   // "cx_cy" → { prosperity, lastT }. 안 판 셀은 암묵적으로 max(저장X).

{ // 부팅: DB에서 파인 셀 로드
  try {
    for (const r of db.getAllMinedCells()) minedCells.set(r.cell_key, { prosperity: r.prosperity, lastT: r.last_t });
    if (minedCells.size) console.log(`[${ZONE_ID}] 광맥 파인 셀 ${minedCells.size}개 로드`);
  } catch (e) { console.log(`[${ZONE_ID}] mined_cells 로드 실패: ${e.message}`); }
}

{ // 부팅: 광맥 클러스터에 광물 배정 (v8 미지정이면 biome+위치 해시로)
  const t = _terrain.ZONE_TERRAIN[ZONE_ID];
  if (t && t.ores && t.ores.length) {
    for (const o of t.ores) {
      if (!o.mineral) o.mineral = Specialty.pickMineral(ZONE.biome, Math.round(o.center[0]*0.131 + o.center[1]*0.237));
    }
    console.log(`[${ZONE_ID}] 광맥 ${t.ores.length}개 — ${t.ores.map(o=>o.mineral).join(', ')}`);
  }
}

// 곡괭이 장착 + 현재 셀이 광맥 구역이면: 번영도 깎고 확률 드롭. 처리했으면 true.
function mineOreCell(player) {
  const eq = getEquippedTool(player);
  if (!eq || eq.type !== 'pickaxe') return false;
  const cx = Math.floor(player.x / 32), cy = Math.floor(player.y / 32);
  const cluster = _terrain.isOreClusterAt(ZONE_ID, cx * 32 + 16, cy * 32 + 16);
  if (!cluster) return false;
  const mineral = cluster.mineral || 'iron';
  const mp = Specialty.miningParams(mineral);
  const key = cx + '_' + cy;
  const now = Date.now();
  const rec = minedCells.get(key) || { prosperity: mp.max, lastT: now };
  const refilled = Math.floor((now - rec.lastT) / mp.refillMs);   // lazy 리필
  if (refilled > 0) { rec.prosperity = Math.min(mp.max, rec.prosperity + refilled); rec.lastT += refilled * mp.refillMs; }
  if (rec.prosperity < mp.cost) { send(player.ws, { type: 'notice', text: '⛏ 고갈됨 — 회복 대기중' }); return true; }
  rec.prosperity -= mp.cost;
  consumeEquippedDurability(player, 1);
  let extra = '';
  if (Math.random() < mp.dropChance) {
    player.inventory[mineral] = (player.inventory[mineral] || 0) + 1;
    extra = ` +${(Specialty.RESOURCES[mineral] || {}).ko || mineral}`;
    send(player.ws, { type: 'inventory', inventory: player.inventory });
  }
  if (rec.prosperity >= mp.max) { minedCells.delete(key); try { db.deleteMinedCell(key); } catch (e) {} }
  else { minedCells.set(key, rec); try { db.upsertMinedCell(key, rec.prosperity, rec.lastT); } catch (e) {} }
  send(player.ws, { type: 'notice', text: `⛏ 채굴 (번영 ${Math.round(rec.prosperity)})${extra}` });
  savePlayer(player);
  return true;
}

// 주기적 정리 (15분) — 만땅 회복된 셀 레코드 제거. minedCells만 순회(파인 셀, 한정적)라 가벼움.
setInterval(() => {
  if (minedCells.size === 0) return;
  const now = Date.now();
  for (const [key, rec] of minedCells) {
    const [cx, cy] = key.split('_').map(Number);
    const cl = _terrain.isOreClusterAt(ZONE_ID, cx * 32 + 16, cy * 32 + 16);
    const mp = Specialty.miningParams(cl ? (cl.mineral || 'iron') : 'iron');
    const refilled = Math.floor((now - rec.lastT) / mp.refillMs);
    if (rec.prosperity + refilled >= mp.max) { minedCells.delete(key); try { db.deleteMinedCell(key); } catch (e) {} }
  }
}, 15 * 60 * 1000);

function tryGather(player) {
  // Phase 5-9: 물 채취 — 강/호수 인접 시 thirst 회복 + 어업 (Phase 5-11)
  for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
    if (isWaterTileLocal(player.x + dx, player.y + dy)) {
      const before = player.thirst || 0;
      player.thirst = Math.min(100, before + 30);
      let msg = `💧 물 마심 (+${Math.round(player.thirst - before)})`;
      // Phase 5-11: 어업 — 50% 확률로 자원 획득 (zone biome에 따라 종류)
      if (Math.random() < 0.5) {
        const biome = ZONE.biome;
        let fishList;
        if (biome === 'taiga' || biome === 'tundra') fishList = ['salmon', 'cod', 'herring', 'trout', 'pollock'];
        else if (biome === 'forest' || biome === 'plains') fishList = ['trout', 'carp', 'pollock'];
        else if (biome === 'jungle' || biome === 'savanna') fishList = ['carp', 'shrimp', 'crab'];
        else if (biome === 'desert') fishList = ['carp'];
        else if (biome === 'archipelago' || biome === 'ocean') fishList = ['cod', 'herring', 'sardine', 'anchovy', 'shrimp', 'crab', 'oyster', 'octopus', 'squid', 'seaweed'];
        else if (biome === 'mountain') fishList = ['trout'];
        else fishList = ['carp', 'trout'];
        const fish = fishList[Math.floor(Math.random() * fishList.length)];
        player.inventory[fish] = (player.inventory[fish] || 0) + 1;
        send(player.ws, { type: 'inventory', inventory: player.inventory });
        msg += ` + 🐟 ${fish}`;
      }
      send(player.ws, { type: 'notice', text: msg });
      send(player.ws, { type: 'self_stat', thirst: Math.round(player.thirst) });
      savePlayer(player);
      return;
    }
  }
  // Phase 5-10: 가축 사육 — tame한 mob 인접 시 produces 자원 획득 (우유/양털)
  if (qtMobs) {
    const nearMobs = qtMobs.queryCircle(player.x, player.y, 60);
    for (const m of nearMobs) {
      if (m.tameOwner !== player.playerId) continue;
      const def = ANIMALS[m.type];
      if (!def || !def.produces || !Object.keys(def.produces).length) continue;
      // 일일 한도 — m.lastHarvestAt 추적
      const now = Date.now();
      const HARVEST_COOLDOWN = 5 * 60 * 1000;  // 5분 cooldown
      if (m.lastHarvestAt && now - m.lastHarvestAt < HARVEST_COOLDOWN) {
        send(player.ws, { type: 'notice', text: `${def.ko} — 아직 자원 안 채워짐` });
        return;
      }
      m.lastHarvestAt = now;
      const parts = [];
      for (const [item, amt] of Object.entries(def.produces)) {
        const got = Math.max(1, Math.floor(amt));
        player.inventory[item] = (player.inventory[item] || 0) + got;
        parts.push(`${item} ${got}`);
      }
      send(player.ws, { type: 'inventory', inventory: player.inventory });
      send(player.ws, { type: 'notice', text: `${def.ko} +${parts.join(', ')}` });
      savePlayer(player);
      return;
    }
  }
  // 광맥 셀 채굴 (곡괭이 장착 + 현재 셀이 광맥 구역) — 자원 entity 채집보다 우선
  if (mineOreCell(player)) return;
  // 가까운 자원 — quadtree로 O(log N)
  const nearby = qtResources ? qtResources.queryCircle(player.x, player.y, GATHER_RANGE) : Array.from(resources.values());
  let best = null;
  let bestDist = GATHER_RANGE;
  for (const r of nearby) {
    const d = Math.hypot(r.x - player.x, r.y - player.y);
    if (d < bestDist) { best = r; bestDist = d; }
  }
  if (!best) return;

  // 토지 보호 체크: 다른 사람이 클레임한 땅 안의 자원
  //   - 주인 vp >= VP_THRESHOLD (주인이 같은 zone 접속 중일 때만 확인 가능) → 보호 해제 → 채집 허용 (vp 안 늘림)
  //   - 그 외 → 차단 + 침입자 vp +N
  // 주인이 오프라인이면 안전한 쪽으로(=보호된 것으로) 가정
  for (const c of claims.values()) {
    if (c.ownerPid !== player.playerId &&
        best.x >= c.x && best.x < c.x + c.w &&
        best.y >= c.y && best.y < c.y + c.h) {
      let ownerOnline = null;
      for (const p of players.values()) if (p.playerId === c.ownerPid) { ownerOnline = p; break; }
      const ownerVp = ownerOnline ? (ownerOnline.vp ?? 0) : 0;
      if (ownerVp >= VP_THRESHOLD) {
        // 보호 해제 — 채집 허용. 침입자 vp는 안 늘림 (주인 본인이 페널티 받는 중)
        break;
      }
      // 차단 + 침입자 vp 증가
      player.vp = Math.min(VP_MAX, (player.vp ?? 0) + VP_TRESPASS_GATHER);
      send(player.ws, { type: 'notice', text: `${c.ownerName}의 영지입니다. (위반 +${VP_TRESPASS_GATHER})` });
      send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst), vp: Math.round(player.vp) });
      savePlayer(player);
      return;
    }
  }

  // === water_pool 특수 처리: hp 안 깎고 thirst 즉시 회복 ===
  if (best.type === 'water_pool') {
    if (player.thirst >= THIRST_MAX) {
      send(player.ws, { type: 'notice', text: '이미 충분히 마셨습니다' });
      return;
    }
    player.thirst = Math.min(THIRST_MAX, player.thirst + WATER_DRINK_AMOUNT);
    send(player.ws, { type: 'gauges', hunger: player.hunger, thirst: player.thirst });
    send(player.ws, { type: 'notice', text: '물을 마셨습니다 (+갈증 회복)' });
    return;
  }

  // 14.53: 장착 instance 기반 도구 효과
  const eqInst = getEquippedTool(player);
  const eff = eqInst ? TOOL_EFFECTS[eqInst.type] : null;
  let dmg = 1;
  if (eff) {
    if (best.type === 'tree') dmg = eff.gatherWoodMult;
    else if (best.type === 'rock') dmg = eff.gatherStoneMult;
  }
  best.hp -= dmg;
  // 장착 도구 내구도 -1
  if (eqInst) consumeEquippedDurability(player, 1);
  if (best.hp <= 0) {
    // 자원 종류별 산출물
    let loot = {};
    if (best.type === 'tree')        loot = { wood: 3 + Math.floor((best.r || 8) / 3) };  // 크기 비례: r4~20 → wood 4~9
    else if (best.type === 'rock')   loot = { stone: 1 };
    else if (best.type === 'berry_bush') {
      loot = { berry: 2, fiber: 1 };
      if (Math.random() < 0.3) loot.seed_berry = 1;
    }
    else if (best.type === 'herb')   loot = { herb: 2 };       // Phase 14.3
    else if (best.type === 'ore')    loot = { ore: 1, stone: 1 }; // Phase 14.3 — ore + 부산물 stone
    for (const [item, amt] of Object.entries(loot)) {
      player.inventory[item] = (player.inventory[item] || 0) + amt;
    }
    resources.delete(best.id);
    chunkManager.removeResource(best);
    resourcesDirty = true;
    if (best.isSeed && best.seedKey) {
      harvestedSeeds.add(best.seedKey);
      try { db.insertHarvestedSeed(best.seedKey); } catch (e) {}
    } else if (best.dbId) {
      db.deleteResource(best.dbId);
    }
    send(player.ws, { type: 'inventory', inventory: player.inventory });
    broadcast({ type: 'resource_removed', id: best.id });
    savePlayer(player);
  } else {
    if (best.dbId) db.updateResourceHp(best.dbId, best.hp);
    broadcast({ type: 'resource_update', id: best.id, hp: best.hp });
  }
}

// === Phase 14.18: 1 grid 사유지 (32×32) + kind 시스템 ===
// 개인 사유지(personal): 길드 사유지 안에만, 강보호 (전쟁 외 공격 X)
// 임시 사유지(temporary): 어디든, 약보호 (벌점 시스템만)
// 길드 사유지(guild): 길드 리더만, 1 grid 단위 도시 영토 — 개인 사유지의 부모
// 시작 슬롯: 개인 9 + 임시 4 + 길드 50 (리더만)
const CLAIM_SLOT_PERSONAL_START = 9;
const CLAIM_SLOT_TEMPORARY_START = 4;
const CLAIM_SLOT_GUILD_START = 50;
const CLAIM_COST = {
  personal: { wood: 3, stone: 2 },
  temporary: { wood: 1, stone: 0 },
  guild:    { wood: 5, stone: 5 },
};

function countMyClaims(playerId) {
  let p = 0, t = 0, g = 0;
  for (const c of claims.values()) {
    if (c.ownerPid !== playerId) continue;
    if (c.kind === 'temporary') t++;
    else if (c.kind === 'guild') g++;
    else p++;
  }
  return { personal: p, temporary: t, guild: g };
}

// 14.18.b — guild_tribe_id 기준 영토 검색. 위치가 내 길드 영토 안인지.
function findGuildClaimContaining(x, y, tribeId) {
  if (!tribeId) return null;
  for (const c of claims.values()) {
    if (c.kind !== 'guild') continue;
    if (c.guildTribeId !== tribeId) continue;
    if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
  }
  return null;
}

function tryClaim(player, kind = 'personal') {
  if (!['personal', 'temporary', 'guild'].includes(kind)) kind = 'personal';
  const cost = CLAIM_COST[kind];
  // 길드 사유지: 리더만 + 길드 소속 필수
  if (kind === 'guild') {
    if (!player.tribeId) { send(player.ws, { type: 'notice', text: '길드 소속이 아닙니다 — 길드 영토 만들 수 없음' }); return; }
    // leader 체크는 central 호출 필요. 일단 단순화: 길드원이면 누구나 (TODO: leader만)
    // 14.42-a: 길드당 단 하나의 길드 사유지(메인 거점). 기존 거 있으면 자동 옮기기 (제거 후 새로 만듦).
    const existingGuildClaims = [];
    for (const [id, c] of claims) {
      if (c.kind === 'guild' && c.guildTribeId === player.tribeId) existingGuildClaims.push([id, c]);
    }
    if (existingGuildClaims.length > 0) {
      for (const [id, c] of existingGuildClaims) {
        if (c.dbId) { try { db.db.prepare('DELETE FROM claims WHERE id = ?').run(c.dbId); } catch (e) {} }
        claims.delete(id);
        broadcast({ type: 'claim_removed', id });
      }
      send(player.ws, { type: 'notice', text: `🏛️ 길드 메인 사유지 ${existingGuildClaims.length}개 → 새 위치로 이동` });
    }
  }
  // 슬롯 한도 체크
  const used = countMyClaims(player.playerId);
  const usedCount = kind === 'temporary' ? used.temporary : (kind === 'guild' ? used.guild : used.personal);
  const max = kind === 'temporary' ? CLAIM_SLOT_TEMPORARY_START : (kind === 'guild' ? CLAIM_SLOT_GUILD_START : CLAIM_SLOT_PERSONAL_START);
  if (usedCount >= max) {
    const kName = { personal: '개인', temporary: '임시', guild: '길드' }[kind];
    send(player.ws, { type: 'notice', text: `${kName} 사유지 슬롯 한도 (${max}) 초과` });
    return;
  }
  if ((player.inventory.wood || 0) < cost.wood || (player.inventory.stone || 0) < cost.stone) {
    send(player.ws, { type: 'notice', text: `재료 부족 (나무 ${cost.wood}, 돌 ${cost.stone})` });
    return;
  }
  // 1 grid 단위로 스냅
  const SZ = BUILDING_SIZE;
  const cx = Math.floor(player.x / SZ) * SZ;
  const cy = Math.floor(player.y / SZ) * SZ;

  // 기존 claim과 겹침 체크 — 단, personal/temporary는 guild claim과 겹쳐도 OK (nested)
  for (const c of claims.values()) {
    const sameKind = c.kind === kind;
    const isGuildContainer = c.kind === 'guild' && (kind === 'personal' || kind === 'temporary');
    const isPersonalInGuild = kind === 'guild' && (c.kind === 'personal' || c.kind === 'temporary');
    if (sameKind && rectsOverlap(cx, cy, SZ, SZ, c.x, c.y, c.w, c.h)) {
      send(player.ws, { type: 'notice', text: '이미 같은 종류의 사유지가 있습니다' });
      return;
    }
    // 다른 종류 — guild claim 안에 personal/temporary 또는 그 반대는 허용
    if (isGuildContainer || isPersonalInGuild) continue;
    if (rectsOverlap(cx, cy, SZ, SZ, c.x, c.y, c.w, c.h)) {
      send(player.ws, { type: 'notice', text: '다른 영지와 겹칩니다' });
      return;
    }
  }

  // 개인 사유지(personal)는 자기 길드의 길드 영토 안에만 설치 가능
  if (kind === 'personal') {
    if (!player.tribeId) {
      send(player.ws, { type: 'notice', text: '개인 사유지는 길드 영토 안에만 설치 가능 (길드 가입 또는 임시 사유지 T 사용)' });
      return;
    }
    const myGuildArea = findGuildClaimContaining(cx + SZ/2, cy + SZ/2, player.tribeId);
    if (!myGuildArea) {
      send(player.ws, { type: 'notice', text: '내 길드 영토 안에서만 개인 사유지 설치 가능' });
      return;
    }
  }

  player.inventory.wood -= cost.wood;
  player.inventory.stone -= cost.stone;

  const id = `c${nextClaimId++}`;
  const claim = {
    id, ownerPid: player.playerId, ownerName: player.name,
    x: cx, y: cy, w: SZ, h: SZ, kind,
    guildTribeId: kind === 'guild' ? player.tribeId : null,
    guildTribeName: kind === 'guild' ? player.tribeName : null,
    createdAt: Date.now(),
  };
  claims.set(id, claim);
  const dbId = db.insertClaim({
    owner_id: player.playerId,
    owner_name: player.name,
    x: cx, y: cy, w: SZ, h: SZ,
  });
  claim.dbId = dbId;
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  const kIcon = { personal: '🏠 개인', temporary: '⛺ 임시', guild: '🏛️ 길드' }[kind];
  send(player.ws, { type: 'notice', text: `${kIcon} 사유지 설치 (${usedCount + 1}/${max})` });
  broadcast({ type: 'claim_added', claim });
}

// 14.18 사유지 해제 — 슬롯 회수 + 위치 옮기기용
function tryUnclaim(player, claimId) {
  const c = claims.get(claimId);
  if (!c) return;
  if (c.ownerPid !== player.playerId) {
    send(player.ws, { type: 'notice', text: '내 사유지가 아닙니다' }); return;
  }
  if (c.dbId) { try { db.db.prepare('DELETE FROM claims WHERE id = ?').run(c.dbId); } catch (e) {} }
  claims.delete(claimId);
  send(player.ws, { type: 'notice', text: `사유지 해제 (자원은 환불 X)` });
  broadcast({ type: 'claim_removed', id: claimId });
}

// === Phase 14.23: 바닥 아이템 (좀보이드 world item) ===
function tryDropItem(player, item, amount) {
  amount = Math.max(1, Math.min(99, parseInt(amount, 10) || 1));
  const have = player.inventory[item] || 0;
  if (have < amount) {
    send(player.ws, { type: 'notice', text: `${ITEM_LABEL_SERVER[item] || item} 부족` }); return;
  }
  player.inventory[item] = have - amount;
  // 위치: 사용자 발 옆 (살짝 랜덤 offset)
  const ox = (Math.random() - 0.5) * 16, oy = 8 + Math.random() * 8;
  const gid = `g${nextGiId++}`;
  const gi = { id: gid, x: player.x + ox, y: player.y + oy, item, count: amount, droppedAt: Date.now() };
  groundItems.set(gid, gi);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  savePlayer(player);
  broadcast({ type: 'ground_item_added', gi });
}

// Phase 14.34: 건축물 수리 — 가까운 손상 building 찾아서 HP 회복
function tryRepairBuilding(player) {
  const RANGE = 64;
  let best = null, bestD = RANGE;
  for (const b of buildings.values()) {
    if (!b.data?.damaged && (b.data?.hp ?? Infinity) >= (BUILDING_MAX_HP[b.type] || 50)) continue;
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bestD) { best = b; bestD = d; }
  }
  if (!best) { send(player.ws, { type: 'notice', text: '근처에 수리할 건축물 없음' }); return; }
  // 본인 또는 같은 길드 건축물만 수리 가능
  let ownerTribe = null;
  if (best.ownerId !== player.playerId) {
    for (const p of players.values()) {
      if (p.playerId === best.ownerId) { ownerTribe = p.tribeId; break; }
    }
    if (!player.tribeId || ownerTribe !== player.tribeId) {
      send(player.ws, { type: 'notice', text: '내/우리 길드 건축물만 수리 가능' }); return;
    }
  }
  // 비용 — 건축 비용 절반 (반올림 올림)
  const cost = BUILDING_COST[best.type] || { wood: 1, stone: 1 };
  const wNeed = Math.ceil((cost.wood || 0) / 2), sNeed = Math.ceil((cost.stone || 0) / 2);
  if ((player.inventory.wood || 0) < wNeed || (player.inventory.stone || 0) < sNeed) {
    send(player.ws, { type: 'notice', text: `수리 비용 부족 (나무 ${wNeed}, 돌 ${sNeed})` });
    return;
  }
  player.inventory.wood -= wNeed;
  player.inventory.stone -= sNeed;
  const maxHp = BUILDING_MAX_HP[best.type] || 50;
  best.data = best.data || {};
  best.data.hp = Math.min(maxHp, (best.data.hp || 0) + 25);
  if (best.data.hp >= maxHp / 2) best.data.damaged = false; // 절반 이상 회복 시 다시 작동
  try { db.updateBuildingData(best.dbId, JSON.stringify(best.data)); } catch (e) {}
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `🔧 ${best.type} 수리 (${best.data.hp}/${maxHp})${best.data.damaged ? '' : ' ✅ 복구'}` });
  broadcast({ type: 'building_damaged', id: best.id, hp: best.data.hp, maxHp, damaged: !!best.data.damaged });
  savePlayer(player);
}

function tryPickupItem(player, gid) {
  const gi = groundItems.get(gid);
  if (!gi) return;
  const dist = Math.hypot(gi.x - player.x, gi.y - player.y);
  if (dist > 80) {
    send(player.ws, { type: 'notice', text: '바닥 아이템에서 너무 멀리 있습니다' }); return;
  }
  player.inventory[gi.item] = (player.inventory[gi.item] || 0) + gi.count;
  groundItems.delete(gid);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `🤚 ${ITEM_LABEL_SERVER[gi.item] || gi.item} ×${gi.count} 주움` });
  savePlayer(player);
  broadcast({ type: 'ground_item_removed', id: gid });
}

// 라벨 (notice용)
const ITEM_LABEL_SERVER = {
  wood: '나무', stone: '돌', berry: '베리', fiber: '풀',
  meat_raw: '날고기', meat_cooked: '구운고기', hide: '가죽',
  berry_jam: '베리잼', water_bottle: '물병', seed_berry: '베리씨앗',
  herb: '약초', ore: '광물',
  axe: '도끼', pickaxe: '곡괭이', sword: '검',
};

// === 자동 decay: 10분 이상된 ground item 정리 (5초마다 체크) ===
setInterval(() => {
  const now = Date.now();
  for (const [gid, gi] of groundItems) {
    if (now - gi.droppedAt > GROUND_ITEM_LIFETIME_MS) {
      groundItems.delete(gid);
      broadcast({ type: 'ground_item_removed', id: gid });
    }
  }
}, 5000);

function tryTrade(player, msg) {
  // 가장 가까운 다른 플레이어에게 trade_request 전달
  const TRADE_RANGE = 80;
  let target = null;
  let bestDist = TRADE_RANGE;
  for (const p of players.values()) {
    if (p.pid === player.pid) continue;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestDist) { target = p; bestDist = d; }
  }
  if (!target) {
    send(player.ws, { type: 'notice', text: `근처에 거래 상대가 없습니다.` });
    return;
  }
  // 간단 거래: 내 wood 1 ↔ 상대 stone 1 (또는 반대)
  const give = msg.give; // 'wood' or 'stone'
  const get = give === 'wood' ? 'stone' : 'wood';
  if ((player.inventory[give] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${give} 부족` });
    return;
  }
  if ((target.inventory[get] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${target.name}에게 ${get} 부족` });
    return;
  }
  player.inventory[give] -= 1;
  player.inventory[get] = (player.inventory[get] || 0) + 1;
  target.inventory[get] -= 1;
  target.inventory[give] = (target.inventory[give] || 0) + 1;
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(target.ws, { type: 'inventory', inventory: target.inventory });
  send(player.ws, { type: 'notice', text: `${target.name}와 거래 성공: ${give}→${get}` });
  send(target.ws, { type: 'notice', text: `${player.name}와 거래 성공: ${get}→${give}` });
  savePlayer(player);
  savePlayer(target);
}

// === 건축 ===
function tryBuild(player, type, floor = 0, side = null, atX, atY, dir = null) {
  // Phase 14.30: atX/atY 주어지면 사용자 거리 160px 안에서 그 위치에 빌드
  if (typeof atX === 'number' && typeof atY === 'number') {
    const d = Math.hypot(atX - player.x, atY - player.y);
    if (d <= 160) {
      // 임시로 player.x/y override → tryBuild 본문은 player.x/y로 cell 계산
      const oldX = player.x, oldY = player.y;
      player.x = atX; player.y = atY;
      try { _tryBuildAt(player, type, floor, side, dir); }
      finally { player.x = oldX; player.y = oldY; }
      return;
    }
  }
  _tryBuildAt(player, type, floor, side, dir);
}
function _tryBuildAt(player, type, floor = 0, side = null, dir = null, opts = null) {
  // 14.51: opts.skipCost = 인벤 차감 없이 빌드만 (place_building에서 사용). atX/atY = 위치 override.
  const skipCost = !!(opts && opts.skipCost);
  if (opts && typeof opts.atX === 'number' && typeof opts.atY === 'number') {
    const d = Math.hypot(opts.atX - player.x, opts.atY - player.y);
    if (d <= 160) {
      const _ox = player.x, _oy = player.y;
      player.x = opts.atX; player.y = opts.atY;
      try { return _tryBuildAt(player, type, floor, side, dir, { skipCost }); }
      finally { player.x = _ox; player.y = _oy; }
    } else {
      send(player.ws, { type: 'notice', text: '너무 멉니다' }); return false;
    }
  }
  floor = Math.max(0, Math.min(5, floor | 0));
  if (!BUILDING_COST[type]) {
    send(player.ws, { type: 'notice', text: '알 수 없는 건축물' }); return false;
  }
  // 14.50: 망치 체크 (목공 type) — skipCost일 때도 망치 체크는 유지 (이미 만들 때 한 번 했으니 제외 가능하지만, 보수적으로)
  // 14.51: place는 이미 만들어둔 거니 망치 체크 skip
  if (!skipCost && BUILDING_COST[type]._needHammer && !hasTool(player, 'hammer')) {
    send(player.ws, { type: 'notice', text: '망치가 필요합니다' }); return false;
  }
  // wall과 door는 cell edge에 (PZ식). side가 안 주어졌으면 player 위치에서 가장 가까운 edge 결정.
  // S/W → 인접 cell의 N/E로 정규화. 결과는 'N' or 'E'.
  if (type === 'wall' || type === 'door') {
    const { cx, cy } = cellOf(player.x, player.y);
    const cellCenterX = cx * BUILDING_SIZE + BUILDING_SIZE / 2;
    const cellCenterY = cy * BUILDING_SIZE + BUILDING_SIZE / 2;
    const dx = player.x - cellCenterX;
    const dy = player.y - cellCenterY;
    let useCx = cx, useCy = cy, useSide;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) useSide = 'E';
      else { useCx = cx - 1; useSide = 'E'; }
    } else {
      if (dy > 0) { useCy = cy + 1; useSide = 'N'; }
      else useSide = 'N';
    }
    // 사용자가 강제 side 줬으면 그걸 우선
    if (side === 'N') { useCx = cx; useCy = cy; useSide = 'N'; }
    else if (side === 'S') { useCx = cx; useCy = cy + 1; useSide = 'N'; }
    else if (side === 'E') { useCx = cx; useCy = cy; useSide = 'E'; }
    else if (side === 'W') { useCx = cx - 1; useCy = cy; useSide = 'E'; }
    // 중복 wall/door 체크 (같은 edge에 wall 또는 door 있나)
    if (findEdgeWall(useCx, useCy, useSide, floor)) {
      send(player.ws, { type: 'notice', text: '이미 벽/문이 있습니다' }); return false;
    }
    const cost = BUILDING_COST[type];
    if (!skipCost) {
      // 비용 모두 확인 (plank, wood, stone)
      if (cost.plank && (player.inventory.plank || 0) < cost.plank) {
        send(player.ws, { type: 'notice', text: `판자 ${cost.plank}개 필요` }); return false;
      }
      if (cost.wood && (player.inventory.wood || 0) < cost.wood) {
        send(player.ws, { type: 'notice', text: `통나무 ${cost.wood}개 필요` }); return false;
      }
      if (cost.stone && (player.inventory.stone || 0) < cost.stone) {
        send(player.ws, { type: 'notice', text: `돌 ${cost.stone}개 필요` }); return false;
      }
      if (cost.plank) player.inventory.plank -= cost.plank;
      if (cost.wood) player.inventory.wood -= cost.wood;
      if (cost.stone) player.inventory.stone -= cost.stone;
    }
    const wx = useCx * BUILDING_SIZE;
    const wy = useCy * BUILDING_SIZE;
    // door는 open state 추가. 기본 닫힘.
    const initData = type === 'door' ? { side: useSide, floor, open: false } : { side: useSide, floor };
    const dbId = db.insertBuilding({ type, owner_id: player.playerId, owner_name: player.name, x: wx, y: wy, data: JSON.stringify(initData) });
    const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 결정값 (deactivate→reactivate 안정 + materialize dedupe)
    const building = { id, dbId, type, ownerId: player.playerId, ownerName: player.name, x: wx, y: wy, data: initData, floor };
    buildings.set(id, building);
    chunkManager.insertBuilding(building);
    send(player.ws, { type: 'inventory', inventory: player.inventory });
    savePlayer(player);
    broadcast({ type: 'building_added', building });
    return true;
  }
  const cost = BUILDING_COST[type];
  if (!skipCost) {
    // 14.50: plank/wood/stone 분리 비용
    if (cost.plank && (player.inventory.plank || 0) < cost.plank) {
      send(player.ws, { type: 'notice', text: `판자 ${cost.plank}개 필요` }); return false;
    }
    if (cost.wood && (player.inventory.wood || 0) < cost.wood) {
      send(player.ws, { type: 'notice', text: `통나무 ${cost.wood}개 필요` }); return false;
    }
    if (cost.stone && (player.inventory.stone || 0) < cost.stone) {
      send(player.ws, { type: 'notice', text: `돌 ${cost.stone}개 필요` }); return false;
    }
    if (cost.seed && (player.inventory[cost.seed] || 0) < 1) {
      send(player.ws, { type: 'notice', text: `${cost.seed} 1개 필요` }); return false;
    }
    if (cost.fiber && (player.inventory.fiber || 0) < cost.fiber) {
      send(player.ws, { type: 'notice', text: `섬유 ${cost.fiber}개 필요` }); return false;
    }
  }
  // 격자에 스냅 (32 단위)
  const gx = Math.floor(player.x / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  const gy = Math.floor(player.y / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;

  // 14.54-d: 다른 사람 claim 안에서만 차단. 자기 claim/빈 땅 다 OK.
  let inOtherClaim = false;
  for (const c of claims.values()) {
    if (c.ownerPid !== player.playerId &&
        gx >= c.x && gx < c.x + c.w && gy >= c.y && gy < c.y + c.h) {
      inOtherClaim = true; break;
    }
  }
  const inOwnClaim = !inOtherClaim; // 호환용 변수 (아래 코드가 참조)
  if (!inOwnClaim) {
    send(player.ws, { type: 'notice', text: '다른 사람의 사유지엔 못 지음' }); return false;
  }

  // 같은 (x,y,floor)에 다른 건축물 없는지 — quadtree + floor 일치만 체크
  const nearBuilds = qtBuildings ? qtBuildings.queryCircle(gx, gy, BUILDING_SIZE * 1.5) : Array.from(buildings.values());
  for (const b of nearBuilds) {
    if ((b.floor || 0) !== floor) continue; // 다른 층은 OK (위/아래 가능)
    if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE) {
      send(player.ws, { type: 'notice', text: `이미 ${floor}F에 건축물이 있습니다` }); return false;
    }
  }
  // 위층(floor > 0) 건축은 아래층에 wall 또는 floor 있어야 (지지)
  if (floor > 0) {
    let supported = false;
    for (const b of nearBuilds) {
      if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE && (b.floor || 0) === floor - 1
          && (b.type === 'wall' || b.type === 'floor')) {
        supported = true; break;
      }
    }
    if (!supported) { send(player.ws, { type: 'notice', text: `${floor}F 짓려면 ${floor-1}F에 벽/바닥 필요` }); return false; }
  }

  if (!skipCost) {
    if (cost.plank) player.inventory.plank -= cost.plank;
    if (cost.wood) player.inventory.wood -= cost.wood;
    if (cost.stone) player.inventory.stone -= cost.stone;
    if (cost.seed) player.inventory[cost.seed] -= 1;
    if (cost.fiber) player.inventory.fiber -= cost.fiber;
  }
  let initialData = null;
  if (type === 'chest') initialData = { wood: 0, stone: 0 };
  else if (type === 'farmland') initialData = { cropType: 'berry', plantedAt: Date.now(), readyAt: Date.now() + CROP_GROW_MS, ready: false };
  else if (type === 'stair') initialData = { dir: dir || 'N' }; // 14.49-d
  // 14.50: fence는 orientation 정보 (EW/NS). dir 인자로 받음 ('N' or 'E'를 NS/EW로 매핑).
  else if (type === 'fence') initialData = { orientation: (dir === 'E' || dir === 'EW') ? 'EW' : 'NS' };
  // 14.5 siege_camp 제거 — 임시 사유지로 대체 (14.18)
  // floor 정보는 data JSON에 합쳐 저장 (DB 스키마 변경 회피)
  const dataWithFloor = { ...(initialData || {}), floor };
  const dbId = db.insertBuilding({
    type, owner_id: player.playerId, owner_name: player.name,
    x: gx, y: gy, data: JSON.stringify(dataWithFloor),
  });
  const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 결정값 (deactivate→reactivate 안정 + materialize dedupe)
  const building = { id, dbId, type, ownerId: player.playerId, ownerName: player.name, x: gx, y: gy, data: dataWithFloor, floor };
  buildings.set(id, building);
  chunkManager.insertBuilding(building);
  if (type === 'stair') stairCellDirty = true; // 14.49-e3-perf

  // 14.54-a/c2: stair dir 검증 — N(남→북) 또는 W(동→서)만 허용
  let autoFloorBuilding = null;
  if (type === 'stair') {
    const sd = dataWithFloor.dir || 'N';
    if (sd !== 'N' && sd !== 'W') {
      // 잘못된 dir — stair rollback
      buildings.delete(id);
      if (chunkManager.removeBuilding) chunkManager.removeBuilding(building);
      db.deleteBuilding(dbId);
      send(player.ws, { type: 'notice', text: '계단은 남→북(N) 또는 동→서(W) 방향만 가능' });
      if (!skipCost) {
        if (cost.plank) player.inventory.plank += cost.plank;
        if (cost.wood) player.inventory.wood += cost.wood;
        if (cost.stone) player.inventory.stone += cost.stone;
        send(player.ws, { type: 'inventory', inventory: player.inventory });
      }
      stairCellDirty = true;
      return false;
    }
    const sdv = (sd === 'E') ? { x: 1, y: 0 } : (sd === 'W') ? { x: -1, y: 0 }
              : (sd === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const autoFx = gx + sdv.x * 3 * BUILDING_SIZE;
    const autoFy = gy + sdv.y * 3 * BUILDING_SIZE;
    const autoFloorFloor = floor + 1;
    const nb = qtBuildings ? qtBuildings.queryCircle(autoFx, autoFy, BUILDING_SIZE * 0.6) : Array.from(buildings.values());
    let conflict = false;
    for (const b of nb) {
      if ((b.floor || 0) !== autoFloorFloor) continue;
      if (Math.abs(b.x - autoFx) < BUILDING_SIZE && Math.abs(b.y - autoFy) < BUILDING_SIZE) {
        conflict = true; break;
      }
    }
    if (conflict) {
      // stair rollback
      buildings.delete(id);
      if (chunkManager.removeBuilding) chunkManager.removeBuilding(building);
      db.deleteBuilding(dbId);
      send(player.ws, { type: 'notice', text: '위층 입구에 이미 건축물 있음 — 계단 못 지음' });
      // 자원 환원
      if (!skipCost) {
        if (cost.plank) player.inventory.plank += cost.plank;
        if (cost.wood) player.inventory.wood += cost.wood;
        if (cost.stone) player.inventory.stone += cost.stone;
        send(player.ws, { type: 'inventory', inventory: player.inventory });
      }
      stairCellDirty = true;
      return false;
    }
    // auto floor 생성 (broadcast는 stair 다음에)
    const floorData = { _parentStairId: id, floor: autoFloorFloor };
    const floorDbId = db.insertBuilding({
      type: 'floor', owner_id: player.playerId, owner_name: player.name,
      x: autoFx, y: autoFy, data: JSON.stringify(floorData),
    });
    const floorId = `b${floorDbId}`; // 건물 lazy-load: id는 dbId 기반 (stair의 _autoFloorId 참조도 재활성 후 유효)
    autoFloorBuilding = { id: floorId, dbId: floorDbId, type: 'floor',
      ownerId: player.playerId, ownerName: player.name,
      x: autoFx, y: autoFy, data: floorData, floor: autoFloorFloor };
    buildings.set(floorId, autoFloorBuilding);
    chunkManager.insertBuilding(autoFloorBuilding);
    // stair에 _autoFloorId 저장 + db 갱신 (broadcast 전에)
    building.data._autoFloorId = floorId;
    db.updateBuildingData(dbId, JSON.stringify(building.data));
  }

  send(player.ws, { type: 'inventory', inventory: player.inventory });
  savePlayer(player);
  broadcast({ type: 'building_added', building });
  if (autoFloorBuilding) broadcast({ type: 'building_added', building: autoFloorBuilding });
  return true;
}

function tryChestPut(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'chest') return;
  // Phase 14.20+14.28: public 또는 본인 또는 같은 길드 멤버
  const isOwn = b.ownerId === player.playerId;
  const isPublic = b.ownerId === 'public';
  let isGuildmate = false;
  if (!isOwn && !isPublic && player.tribeId) {
    // chest owner의 tribeId 알기 — 메모리에서 player 찾기
    for (const p of players.values()) {
      if (p.playerId === b.ownerId) { isGuildmate = (p.tribeId === player.tribeId); break; }
    }
  }
  if (!isOwn && !isPublic && !isGuildmate) {
    send(player.ws, { type: 'notice', text: '내 상자/길드 상자가 아닙니다' }); return;
  }
  // 가까이 있어야 (64px)
  if (Math.hypot(b.x - player.x, b.y - player.y) > 64) {
    send(player.ws, { type: 'notice', text: '상자에서 너무 멀리 있습니다' }); return;
  }
  // Phase 14.25: 모든 아이템 저장 허용 (white-list)
  if (!CHEST_ALLOWED_ITEMS.has(item)) {
    send(player.ws, { type: 'notice', text: `${item}은 상자에 못 넣음` }); return;
  }
  amount = Math.max(1, Math.min(99, amount | 0));
  if ((player.inventory[item] || 0) < amount) {
    send(player.ws, { type: 'notice', text: `${item} 부족` }); return;
  }
  player.inventory[item] -= amount;
  b.data = b.data || {};
  // 기존 wood/stone만 초기화되어 있던 chest는 다른 키 보존
  b.data[item] = (b.data[item] || 0) + amount;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'chest_state', buildingId: b.id, data: b.data });
}

async function tryChestTake(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'chest') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 64) {
    send(player.ws, { type: 'notice', text: '상자에서 너무 멀리 있습니다' }); return;
  }
  if (!CHEST_ALLOWED_ITEMS.has(item)) {
    send(player.ws, { type: 'notice', text: `${item}은 인출 불가` }); return;
  }
  amount = Math.max(1, Math.min(99, amount | 0));

  // Phase 14.20: public chest는 자유 인출
  const isPublic = (b.ownerId === 'public');
  // Phase 14.13: 약탈 분기 — 본인 chest가 아니면 적 길드 chest인지 확인
  const isOwn = (b.ownerId === player.playerId);
  // Phase 14.28: 같은 길드 멤버 chest는 인출 자유
  let isGuildmate = false;
  if (!isOwn && !isPublic && player.tribeId) {
    for (const p of players.values()) {
      if (p.playerId === b.ownerId) { isGuildmate = (p.tribeId === player.tribeId); break; }
    }
  }
  let isLoot = false;
  let lootRate = 0;
  if (!isOwn && !isPublic && !isGuildmate) {
    // 적 길드 chest? — owner의 tribeId 알아내야. owner도 player일 수 있고 NPC일 수도.
    // 일단 buildings는 owner_name이 있고 ownerId가 player_id. zone players 메모리에서 찾기.
    let ownerTribeId = null;
    for (const p of players.values()) {
      if (p.playerId === b.ownerId) { ownerTribeId = p.tribeId; break; }
    }
    // 메모리에 없으면 central 조회 (다른 zone 멤버)
    if (ownerTribeId === null) {
      try {
        const op = await central.getPlayer(b.ownerId);
        ownerTribeId = op?.tribe_id || null;
      } catch (e) {}
    }
    if (!ownerTribeId || !player.tribeId || ownerTribeId === player.tribeId) {
      send(player.ws, { type: 'notice', text: '내 상자가 아닙니다' }); return;
    }
    const atWar = await isAtWar(player.tribeId, ownerTribeId);
    if (!atWar) {
      send(player.ws, { type: 'notice', text: '전쟁 중이어야 약탈 가능' }); return;
    }
    // 활성 전쟁의 loot_rate 가져오기
    const wars = await getActiveWars();
    const war = wars.find(w =>
      (w.attacker_guild_id === player.tribeId && w.defender_guild_id === ownerTribeId) ||
      (w.defender_guild_id === player.tribeId && w.attacker_guild_id === ownerTribeId));
    lootRate = war?.loot_rate || 0.2;
    isLoot = true;
  }

  if (!b.data || (b.data[item] || 0) < amount) {
    send(player.ws, { type: 'notice', text: `상자에 ${item} 부족` }); return;
  }
  // 약탈이면 loot_rate 적용 (요청한 amount 중 일부만 실제 인출)
  let takeAmt = amount;
  if (isLoot) {
    takeAmt = Math.max(1, Math.floor(amount * lootRate));
    if (takeAmt > b.data[item]) takeAmt = b.data[item];
  }
  b.data[item] -= takeAmt;
  player.inventory[item] = (player.inventory[item] || 0) + takeAmt;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'chest_state', buildingId: b.id, data: b.data });
  if (isLoot) {
    send(player.ws, { type: 'notice', text: `🏴‍☠️ 약탈! ${item} ${takeAmt} (loot_rate ${(lootRate*100).toFixed(0)}%)` });
    console.log(`[${ZONE_ID}] 🏴‍☠️ ${player.name} 약탈 ${b.ownerName} chest: ${item} ${takeAmt}`);
  }
}

// === 전투 ===
// === Phase 5-I: 원거리 공격 (화살) — 발사자 zone 권위 (favor-the-shooter) ===
// 클라가 조준점(zone-local aimX/aimY)을 보냄. 화살 엔티티 생성 → broadcast(observer 통해 이웃도 봄).
// 화살 tick(게임루프)에서 자기 player/mob + ghost(이웃 player) 히트 검사.
function tryRangedAttack(player, aimX, aimY) {
  if (player.isDown) return;
  const now = Date.now();
  if (now - (player.lastRangedAt || 0) < 600) return; // 쿨다운
  // 활 장착 확인 (간이: equipped가 'bow'면). 무기 시스템 확장 전까지 관대하게 허용.
  player.lastRangedAt = now;
  const dx = aimX - player.x, dy = aimY - player.y, L = Math.hypot(dx, dy) || 1;
  const aid = `${ZONE_ID}_ar${nextArrowId++}`;
  const arrow = {
    aid, x: player.x, y: player.y,
    vx: dx / L * ARROW_SPEED, vy: dy / L * ARROW_SPEED,
    ownerPid: player.pid, ownerId: player.playerId, dmg: ARROW_DMG, ttl: ARROW_TTL_MS,
  };
  arrows.set(aid, arrow);
  broadcast({ type: 'arrow_spawn', aid, x: arrow.x, y: arrow.y, vx: arrow.vx, vy: arrow.vy, ownerPid: player.pid });
}

// 화살 물리 + 히트 (게임 tick에서 dt초마다 호출)
function stepArrows(dt) {
  for (const a of arrows.values()) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.ttl -= dt * 1000;
    let hit = false;
    // 1) 자기 zone player (PvP)
    for (const p of players.values()) {
      if (p.pid === a.ownerPid || p.isDown || p.isNpc) continue;
      if (Math.hypot(p.x - a.x, p.y - a.y) < ARROW_HIT_R) {
        damagePlayer(p, a.dmg, `arrow:${a.ownerId}`); hit = true; break;
      }
    }
    // 2) 자기 zone mob
    if (!hit) for (const m of mobs.values()) {
      if (Math.hypot(m.x - a.x, m.y - a.y) < ARROW_HIT_R) {
        m.hp = Math.max(0, m.hp - a.dmg);
        broadcast({ type: 'mob_damaged', mid: m.mid, hp: m.hp });
        if (m.hp <= 0) { spawnCorpse(m, a.ownerId); chunkManager.removeMob?.(m); mobs.delete(m.mid); broadcast({ type: 'mob_removed', mid: m.mid }); }
        hit = true; break;
      }
    }
    // 3) 이웃 zone ghost player (경계 너머) → cross_damage 위임
    if (!hit) {
      const aax = ZONE.worldOffsetX + a.x, aay = ZONE.worldOffsetY + a.y;
      for (const [gid, g] of ghostPlayers) {
        if (Math.hypot(g.ax - aax, g.ay - aay) < ARROW_HIT_R) {
          const tz = ZONES[g.srcZone];
          if (tz) postJSON(tz.host, tz.port, '/cross_damage', { targetId: gid, dmg: a.dmg, attackerId: a.ownerId }).catch(() => {});
          hit = true; break;
        }
      }
    }
    if (hit || a.ttl <= 0) { arrows.delete(a.aid); broadcast({ type: 'arrow_removed', aid: a.aid }); }
  }
}

// 이웃 zone에 보낼 ghost 스냅샷 (경계 AOI 안 player) — 주기 송신
function syncGhostsToNeighbors() {
  // 경계에서 GHOST_REACH 안에 있는 자기 player를 이웃 zone에 절대좌표로 송신
  const GHOST_REACH = 1200;
  const ox = ZONE.worldOffsetX, oy = ZONE.worldOffsetY, zw = ZONE.zoneWidth, zh = ZONE.zoneHeight;
  const byZone = {}; // targetZoneId -> [snap]
  for (const p of players.values()) {
    if (p.isNpc || p.handingOff) continue;
    const near = [];
    if (p.x < GHOST_REACH) near.push(findZoneAt(ox - 1, oy + p.y));
    if (p.x > zw - GHOST_REACH) near.push(findZoneAt(ox + zw + 1, oy + p.y));
    if (p.y < GHOST_REACH) near.push(findZoneAt(ox + p.x, oy - 1));
    if (p.y > zh - GHOST_REACH) near.push(findZoneAt(ox + p.x, oy + zh + 1));
    for (const tz of near) {
      if (!tz || tz.id === ZONE_ID || tz.isOcean) continue;
      (byZone[tz.id] = byZone[tz.id] || []).push({ playerId: p.playerId, name: p.name, ax: ox + p.x, ay: oy + p.y, vx: p.vx, vy: p.vy });
    }
  }
  // 경계 근처 벽/문/펜스를 이웃 zone에 (콜라이더 미러). 절대 cell + side.
  const bByZone = {};
  for (const b of buildings.values()) {
    if (b.type !== 'wall' && b.type !== 'door' && b.type !== 'fence') continue;
    if (b.data?.damaged) continue;
    const near = [];
    if (b.x < GHOST_REACH) near.push(findZoneAt(ox - 1, oy + b.y));
    if (b.x > zw - GHOST_REACH) near.push(findZoneAt(ox + zw + 1, oy + b.y));
    if (b.y < GHOST_REACH) near.push(findZoneAt(ox + b.x, oy - 1));
    if (b.y > zh - GHOST_REACH) near.push(findZoneAt(ox + b.x, oy + zh + 1));
    for (const tz of near) {
      if (!tz || tz.id === ZONE_ID || tz.isOcean) continue;
      (bByZone[tz.id] = bByZone[tz.id] || []).push({
        id: b.id, type: b.type, side: b.data?.side || null, floor: b.floor || 0,
        acx: Math.floor((ox + b.x) / 32), acy: Math.floor((oy + b.y) / 32),
      });
    }
  }
  const allTargets = new Set([...Object.keys(byZone), ...Object.keys(bByZone)]);
  for (const zid of allTargets) {
    const tz = ZONES[zid];
    postJSON(tz.host, tz.port, '/ghost_sync', { srcZone: ZONE_ID, players: byZone[zid] || [], buildings: bByZone[zid] || [] }).catch(() => {});
  }
}

async function tryAttack(player) {
  // Phase 14.41: 다운 중엔 공격 불가
  if (player.isDown) return;
  const now = Date.now();
  if (now - player.lastAttackAt < PLAYER_ATTACK_COOLDOWN_MS) return;
  player.lastAttackAt = now;

  // 14.53: 장착 instance 기반 무기 효과
  const eqInst = getEquippedTool(player);
  const eff = eqInst ? TOOL_EFFECTS[eqInst.type] : null;
  const atk = Math.round(PLAYER_ATTACK_DAMAGE * (eff ? eff.attackMult : 1));
  if (eqInst) consumeEquippedDurability(player, 1);

  // 가장 가까운 mob을 범위 안에서 — quadtree
  const nearbyMobs = qtMobs ? qtMobs.queryCircle(player.x, player.y, PLAYER_ATTACK_RANGE) : Array.from(mobs.values());
  let bestMob = null, bestDist = PLAYER_ATTACK_RANGE;
  for (const m of nearbyMobs) {
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < bestDist) { bestMob = m; bestDist = d; }
  }
  if (bestMob) {
    // 자기 길든 mob은 공격 안 함 — gather/feed 우선
    if (bestMob.tameOwner === player.playerId) {
      send(player.ws, { type: 'notice', text: '내가 길들인 동물은 공격하지 않음' });
      return;
    }
    bestMob.hp -= atk;
    bestMob.dirty = true;
    broadcast({ type: 'mob_damaged', mid: bestMob.mid, hp: bestMob.hp });
    // 늑대는 공격당하면 즉시 어그로 — 단 길든 mob은 어그로 안 가짐. 팩 동료도 같이 어그로.
    if (bestMob.type === 'wolf' && !bestMob.tameOwner) {
      bestMob.aggroTarget = player.pid;
      aggroPackmates(bestMob, player.pid);
    }
    // 남의 길든 동물 공격 시 vp 누적 (PvP 비슷)
    if (bestMob.tameOwner && bestMob.tameOwner !== player.playerId) {
      player.vp = Math.min(VP_MAX, (player.vp ?? 0) + VP_ATTACK_PLAYER);
      send(player.ws, { type: 'notice', text: `${bestMob.tameOwnerName}의 동물 공격 (위반 +${VP_ATTACK_PLAYER})` });
    }
    if (bestMob.hp <= 0) {
      // Phase 5-7: 사체 entity 생성 (즉시 인벤 X. 도살 액션 필요).
      spawnCorpse(bestMob, player.playerId);
      send(player.ws, { type: 'notice', text: `${ANIMALS[bestMob.type]?.ko || bestMob.type} 사냥 — 사체 도살 (E)` });
      // DB + chunk에서 mob 제거
      if (bestMob.dbId) { try { db.deleteMob(bestMob.dbId); } catch (e) {} }
      chunkManager.removeMob(bestMob);
      mobs.delete(bestMob.mid);
      broadcast({ type: 'mob_removed', mid: bestMob.mid });
      // 일정 시간 후 리스폰
      const respawnType = bestMob.type;
      setTimeout(() => {
        const m = spawnMob(respawnType);
        broadcast({ type: 'mob_spawn', mob: { mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp } });
      }, 15000);
    }
    return;
  }
  // 근처 mob 없으면 근처 플레이어 (PvP) — quadtree
  const nearbyPlayers = qtPlayers ? qtPlayers.queryCircle(player.x, player.y, PLAYER_ATTACK_RANGE) : Array.from(players.values());
  let bestPlayer = null, bestPDist = PLAYER_ATTACK_RANGE;
  for (const p of nearbyPlayers) {
    if (p.pid === player.pid) continue;
    if (p.hp <= 0) continue;
    if (p.isDown) continue; // Phase 14.41: 다운된 플레이어는 추가 공격 불가 (방어자 보호)
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestPDist) { bestPlayer = p; bestPDist = d; }
  }
  // Phase 14.33 fix: player 공격 불가면 wall로 fallback (return X)
  let playerAttackBlocked = false;
  if (bestPlayer) {
    if (player.tribeId && bestPlayer.tribeId === player.tribeId) {
      playerAttackBlocked = true; // 같은 길드 — 조용히 wall 시도
    } else if (!player.pvpEnabled) {
      playerAttackBlocked = true;
    } else {
      const victimGuildArea = findGuildClaimContaining(bestPlayer.x, bestPlayer.y, bestPlayer.tribeId);
      if (victimGuildArea) {
        const atWar = await isAtWar(player.tribeId, bestPlayer.tribeId);
        if (!atWar) {
          // 길드 영토 보호 — player 공격 X, 단 wall은 공격 가능 (공성)
          playerAttackBlocked = true;
        }
      }
    }
  }
  // 14.35: 공격 동작 broadcast (메인 공격이든 wall 공격이든 일단 시작 시)
  broadcast({ type: 'player_attacked', pid: player.pid, t: Date.now() });
  if (bestPlayer && !playerAttackBlocked) {
    damagePlayer(bestPlayer, atk, `player:${player.name}`);
    // === Phase 14.8: 명분 다이얼 — 개인 vp + 길드 vp ===
    // 피해자 길드 명성에 따라 가산량 조절 (설계 §5.2):
    //   피해자 청정 → +대량 (개인 ×2, 길드 +20)
    //   피해자 보통 → 기본 (개인 ×1, 길드 +5)
    //   피해자 악성 → 면제 (정의구현, 개인 ×0.5, 길드 0)
    // War 체크는 14.9 — 전쟁 중이면 면제
    applyPvpAttackPenalty(player, bestPlayer);
    return;
  }
  // Phase 14.33: player/mob 없으면 근처 wall 공격 (적 길드 wall 한정)
  const nearbyBs = qtBuildings ? qtBuildings.queryCircle(player.x, player.y, PLAYER_ATTACK_RANGE) : Array.from(buildings.values());
  let bestWall = null, bestWallDist = PLAYER_ATTACK_RANGE;
  for (const b of nearbyBs) {
    if (!BLOCKING_BUILDINGS.has(b.type) && b.type !== 'chest') continue;
    if (b.data?.damaged) continue; // 이미 부서진 거
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bestWallDist) { bestWall = b; bestWallDist = d; }
  }
  if (bestWall) {
    // 본인 길드 wall은 공격 X
    let ownerTribe = null;
    for (const p of players.values()) {
      if (p.playerId === bestWall.ownerId) { ownerTribe = p.tribeId; break; }
    }
    if (player.tribeId && ownerTribe === player.tribeId) {
      send(player.ws, { type: 'notice', text: '내 길드 건축물은 공격 못 함' }); return;
    }
    const maxHp = BUILDING_MAX_HP[bestWall.type] || 50;
    if (typeof bestWall.data !== 'object' || bestWall.data === null) bestWall.data = {};
    bestWall.data.hp = (bestWall.data.hp ?? maxHp) - atk;
    if (bestWall.data.hp <= 0) {
      bestWall.data.damaged = true;
      bestWall.data.hp = 0;
      send(player.ws, { type: 'notice', text: `💥 ${bestWall.type} 손상! 통과 가능 (수리하면 복구)` });
    } else {
      send(player.ws, { type: 'notice', text: `${bestWall.type} 공격 (${bestWall.data.hp}/${maxHp})` });
    }
    try { db.updateBuildingData(bestWall.dbId, JSON.stringify(bestWall.data)); } catch (e) {}
    broadcast({ type: 'building_damaged', id: bestWall.id, hp: bestWall.data.hp, maxHp, damaged: !!bestWall.data.damaged });
  }
}

// Phase 14.8 — PvP 공격 페널티 (다이얼 적용)
async function applyPvpAttackPenalty(attacker, victim) {
  let multiplier = 1.0;
  let guildAdd = 5;
  let tag = 'normal';
  const victimGuildVp = await getCachedGuildVp(victim.tribeId);
  if (victim.tribeId) {
    if (victimGuildVp < 30) { multiplier = 2.0; guildAdd = 20; tag = 'clean-victim'; }
    else if (victimGuildVp < 80) { multiplier = 1.0; guildAdd = 5; tag = 'normal-victim'; }
    else { multiplier = 0.5; guildAdd = 0; tag = 'evil-victim (정의구현)'; }
  }
  // 전쟁 중이면 면제
  if (await isAtWar(attacker.tribeId, victim.tribeId)) {
    multiplier = 0; guildAdd = 0; tag = 'at-war (면제)';
  }
  const personalGain = Math.round(VP_ATTACK_PLAYER * multiplier);
  attacker.vp = Math.min(VP_MAX, (attacker.vp ?? 0) + personalGain);
  send(attacker.ws, { type: 'notice', text: `${victim.name} 공격 [${tag}] 개인 +${personalGain}${guildAdd ? `, 길드 +${guildAdd}` : ''}` });
  send(attacker.ws, { type: 'gauges', hunger: Math.round(attacker.hunger), thirst: Math.round(attacker.thirst), vp: Math.round(attacker.vp) });
  savePlayer(attacker);
  // 길드 vp는 central 비동기 (실패해도 게임 진행)
  if (attacker.tribeId && guildAdd > 0) {
    central.tribeAddVp(attacker.tribeId, guildAdd, `pvp_attack:${tag}`).catch(() => {});
  }
}

// 길드 vp 캐시 (60초 TTL) — 매 공격마다 central 호출 안 하려고
const guildVpCache = new Map(); // tribeId → { vp, expires }
async function getCachedGuildVp(tribeId) {
  if (!tribeId) return 0;
  const now = Date.now();
  const c = guildVpCache.get(tribeId);
  if (c && c.expires > now) return c.vp;
  try {
    const r = await central.getTribe(tribeId);
    const vp = r?.tribe?.vp || 0;
    guildVpCache.set(tribeId, { vp, expires: now + 60000 });
    return vp;
  } catch (e) { return 0; }
}

// Phase 14.9 — 전쟁 상태 캐시 (active wars 30초 TTL)
let activeWarsCache = { wars: [], expires: 0 };
async function getActiveWars() {
  const now = Date.now();
  if (activeWarsCache.expires > now) return activeWarsCache.wars;
  try {
    const r = await central.request('GET', '/wars/active');
    activeWarsCache = { wars: r.data?.wars || [], expires: now + 30000 };
    return activeWarsCache.wars;
  } catch (e) { return []; }
}
async function isAtWar(guildA, guildB) {
  if (!guildA || !guildB || guildA === guildB) return false;
  const wars = await getActiveWars();
  return wars.some(w =>
    (w.attacker_guild_id === guildA && w.defender_guild_id === guildB) ||
    (w.attacker_guild_id === guildB && w.defender_guild_id === guildA)
  );
}

function damagePlayer(p, dmg, source) {
  if (p.hp <= 0 || p.isDown) return;
  p.hp -= dmg;
  p.lastDamagedAt = Date.now();
  broadcast({ type: 'player_damaged', pid: p.pid, hp: p.hp });
  if (p.hp <= 0) {
    p.hp = 0;
    if (p.isNpc) {
      // NPC: 30초 후 자기 사유지 중심에 부활 (기존 로직 유지)
      console.log(`[${ZONE_ID}] 🤖 NPC ${p.name} 사망 (by ${source}) — ${NPC_RESPAWN_MS/1000}초 후 부활`);
      let respawnX = ZONE.zoneWidth/2, respawnY = ZONE.zoneHeight/2;
      const village = VILLAGES.find(v => v.name === p.tribeName);
      if (village) { respawnX = village.x; respawnY = village.y; }
      setTimeout(() => {
        if (!players.has(p.pid)) return;
        p.hp = p.maxHp;
        p.x = respawnX; p.y = respawnY;
        p.vx = 0; p.vy = 0;
        p.hunger = HUNGER_MAX; p.thirst = THIRST_MAX;
        for (const m of mobs.values()) if (m.aggroTarget === p.pid) m.aggroTarget = null;
        broadcast({ type: 'player_respawn', pid: p.pid, hp: p.hp, x: p.x, y: p.y });
      }, NPC_RESPAWN_MS);
      return;
    }
    // Phase 14.41: 휴먼 플레이어 — 자동 부활 없음. downed 상태 진입.
    // 0~10초: 같은 길드원이 R 키로 구조 가능 + 임시/개인 사유지 즉시 부활 가능.
    // 10초 후: 임시/개인 사유지 부활만 가능. 사용자 선택 전엔 부활 안 함.
    p.isDown = true;
    p.downedAt = Date.now();
    p.vx = 0; p.vy = 0;
    // 어그로 해제 — 다운된 플레이어를 계속 패지 않도록
    for (const m of mobs.values()) if (m.aggroTarget === p.pid) m.aggroTarget = null;
    // 부활 옵션 산정
    const opts = listRespawnOptions(p);
    send(p.ws, {
      type: 'player_downed', pid: p.pid,
      rescueWindowMs: RESCUE_WINDOW_MS,
      options: opts,
      source,
    });
    // 모두에게 down 상태 broadcast (시각/동작용)
    broadcast({ type: 'player_down_state', pid: p.pid, isDown: true });
    console.log(`[${ZONE_ID}] ☠️ ${p.name} 다운 (by ${source}) — 부활 선택 대기`);
  }
}

// Phase 14.41/14.42-a — 부활 옵션 산정:
//   1) 본인 personal/temporary 사유지 (현 zone)
//   2) 본인 길드의 단일 메인 사유지 (현 zone — 길드사유지는 길드당 1개)
//   3) home zone 마을광장 (현 zone이 home일 때만. 다른 zone home은 14.42-b)
//   4) (옵션 0개일 때 마지막 보루로) 현 zone 마을광장
function listRespawnOptions(p) {
  const opts = [];
  for (const c of claims.values()) {
    if (c.ownerId !== p.playerId) continue;
    if (c.kind !== 'personal' && c.kind !== 'temporary') continue;
    opts.push({
      claimId: c.id, kind: c.kind,
      x: c.x + (c.w || BUILDING_SIZE) / 2,
      y: c.y + (c.h || BUILDING_SIZE) / 2,
    });
  }
  // 길드 메인 사유지 — 본인 길드 소속만, 길드당 1개 (단일 강제)
  if (p.tribeId) {
    for (const c of claims.values()) {
      if (c.kind !== 'guild') continue;
      if (c.guildTribeId !== p.tribeId) continue;
      opts.push({
        claimId: c.id, kind: 'guild',
        x: c.x + (c.w || BUILDING_SIZE) / 2,
        y: c.y + (c.h || BUILDING_SIZE) / 2,
      });
      break; // 단일 강제 — 첫 거 하나만
    }
  }
  // home 마을광장 — 본인 home_zone이 현 zone일 때만 (cross-zone은 14.42-b)
  if (p._homeZone === ZONE_ID && typeof p._homeX === 'number' && typeof p._homeY === 'number') {
    opts.push({
      claimId: '__home__', kind: 'home',
      x: p._homeX, y: p._homeY,
    });
  }
  return opts;
}

function tryRespawnChoice(player, claimId) {
  if (!player.isDown) { send(player.ws, { type: 'notice', text: '다운 상태가 아닙니다' }); return; }
  const opts = listRespawnOptions(player);
  const target = opts.find(o => o.claimId === claimId);
  if (!target) {
    send(player.ws, { type: 'notice', text: '해당 사유지가 없습니다. 옵션을 다시 확인하세요.' });
    // 옵션 갱신 송신
    send(player.ws, { type: 'player_downed', pid: player.pid, rescueWindowMs: RESCUE_WINDOW_MS, options: opts });
    return;
  }
  // 부활 실행
  player.isDown = false;
  player.downedAt = 0;
  player.hp = player.maxHp;
  player.x = target.x;
  player.y = target.y;
  player.vx = 0; player.vy = 0;
  broadcast({ type: 'player_respawn', pid: player.pid, hp: player.hp, x: player.x, y: player.y });
  broadcast({ type: 'player_down_state', pid: player.pid, isDown: false });
  send(player.ws, { type: 'notice', text: `${target.kind === 'personal' ? '개인' : '임시'} 사유지에서 부활했습니다.` });
}

function tryRescue(rescuer, downedPid) {
  if (rescuer.isDown) return;
  const target = players.get(downedPid);
  if (!target || !target.isDown) {
    send(rescuer.ws, { type: 'notice', text: '구조 대상이 없습니다' });
    return;
  }
  // 구조 윈도우 내인가?
  const elapsed = Date.now() - (target.downedAt || 0);
  if (elapsed > RESCUE_WINDOW_MS) {
    send(rescuer.ws, { type: 'notice', text: '구조 가능 시간이 지났습니다' });
    return;
  }
  // 같은 길드여야
  if (!rescuer.tribeId || rescuer.tribeId !== target.tribeId) {
    send(rescuer.ws, { type: 'notice', text: '같은 길드원만 구조 가능' });
    return;
  }
  // 거리 체크
  const d = Math.hypot(rescuer.x - target.x, rescuer.y - target.y);
  if (d > RESCUE_RANGE_PX) {
    send(rescuer.ws, { type: 'notice', text: `${Math.round(d)}px 떨어짐 — ${RESCUE_RANGE_PX}px 안에서 R` });
    return;
  }
  // 구조 — HP 50%, 자리에서 일어남
  target.isDown = false;
  target.downedAt = 0;
  target.hp = Math.round(target.maxHp * 0.5);
  broadcast({ type: 'player_respawn', pid: target.pid, hp: target.hp, x: target.x, y: target.y });
  broadcast({ type: 'player_down_state', pid: target.pid, isDown: false });
  send(target.ws, { type: 'notice', text: `🤝 ${rescuer.name}님이 당신을 구조했습니다 (HP ${target.hp})` });
  send(rescuer.ws, { type: 'notice', text: `🤝 ${target.name}님을 구조했습니다` });
  console.log(`[${ZONE_ID}] 🤝 ${rescuer.name} → ${target.name} 구조 성공`);
}

// === Phase 14.45: 극지방 빙하 콜라이더 ===
// 북쪽 이웃 없는 zone(russia/usa)은 y < ICE_BAND 차단
// 남쪽 이웃 없는 zone(korea/china)은 y > zoneHeight - ICE_BAND 차단
const ICE_BAND_PX = 1500; // v8: 양극 빙하 두께 800→1500
function isInIceBand(y) {
  if (!NEIGHBOR.hasNorth && y < ICE_BAND_PX) return true;
  if (!NEIGHBOR.hasSouth && y > ZONE.zoneHeight - ICE_BAND_PX) return true;
  return false;
}

// === PZ식 wall edge 콜라이더 ===
// wall은 cell edge에 있음. side ∈ {N, E} 정규화.
// N wall = cell (cx, cy)의 북쪽 edge = y = cy*BUILDING_SIZE 라인
// E wall = cell (cx, cy)의 동쪽 edge = x = (cx+1)*BUILDING_SIZE 라인
// 이동 (oldX, oldY) → (newX, newY)가 wall edge 가로지르면 차단.
function cellOf(x, y) { return { cx: Math.floor(x / BUILDING_SIZE), cy: Math.floor(y / BUILDING_SIZE) }; }
function findEdgeWall(cx, cy, side, floor) {
  // wall은 cell (cx,cy)의 좌상단(b.x=cx*32, b.y=cy*32)에 저장됨. data.side로 N/E 구분.
  // door도 같은 edge 형식. open일 때는 차단 X.
  // fence는 14.50부터 cell 위치 (edge 아님). 여기선 check 안 함.
  const ex = cx * BUILDING_SIZE;
  const ey = cy * BUILDING_SIZE;
  const nearby = qtBuildings ? qtBuildings.queryCircle(ex, ey, BUILDING_SIZE * 2) : Array.from(buildings.values());
  for (const b of nearby) {
    if (b.type !== 'wall' && b.type !== 'door') continue;
    if ((b.floor || 0) !== floor) continue;
    if (b.data?.damaged) continue;
    if (b.type === 'door' && b.data?.open) continue; // 열린 door 통과 OK
    const bSide = b.data?.side;
    const bcx = Math.floor(b.x / BUILDING_SIZE);
    const bcy = Math.floor(b.y / BUILDING_SIZE);
    if (bcx === cx && bcy === cy && bSide === side) return true;
  }
  // Phase 5-K: 경계 너머 ghost 벽 (이웃 zone 건물 미러) — local cell → 절대 cell 비교
  if (ghostBuildings.size) {
    const acx = cx + Math.floor(ZONE.worldOffsetX / BUILDING_SIZE);
    const acy = cy + Math.floor(ZONE.worldOffsetY / BUILDING_SIZE);
    for (const g of ghostBuildings.values()) {
      if ((g.floor || 0) !== floor) continue;
      if (g.type === 'fence') continue; // fence는 findCellFence에서
      if (g.acx === acx && g.acy === acy && g.side === side) return true;
    }
  }
  return false;
}
// 14.50: fence는 cell 위치 (edge 아님). cell 자체 진입 차단.
function findCellFence(cx, cy, floor) {
  const cellAx = cx * BUILDING_SIZE + BUILDING_SIZE / 2;
  const cellAy = cy * BUILDING_SIZE + BUILDING_SIZE / 2;
  const nearby = qtBuildings ? qtBuildings.queryCircle(cellAx, cellAy, BUILDING_SIZE) : Array.from(buildings.values());
  for (const b of nearby) {
    if (b.type !== 'fence') continue;
    if ((b.floor || 0) !== floor) continue;
    const bcx = Math.floor(b.x / BUILDING_SIZE);
    const bcy = Math.floor(b.y / BUILDING_SIZE);
    if (bcx === cx && bcy === cy) return true;
  }
  return false;
}
// 14.49-e2: 계단 측면 진입 차단 — 계단의 -dir(낮은 입구) 또는 +dir(높은 입구) 쪽만 통과 허용
function dirVecForCollider(dir) {
  if (dir === 'N') return { x: 0, y: -1 };
  if (dir === 'S') return { x: 0, y: 1 };
  if (dir === 'E') return { x: 1, y: 0 };
  if (dir === 'W') return { x: -1, y: 0 };
  return { x: 0, y: -1 };
}
// stair cell cache는 line 247 부근으로 이동됨 (TDZ 회피 — NPC 마을 생성 시 addBlock 호출됨)
function rebuildStairCellCache() {
  stairCellCache.clear();
  for (const b of buildings.values()) {
    if (b.type !== 'stair') continue;
    const dir = b.data?.dir || 'N';
    const dv = dirVecForCollider(dir);
    const acx = Math.floor(b.x / BUILDING_SIZE);
    const acy = Math.floor(b.y / BUILDING_SIZE);
    for (let s = 0; s <= 2; s++) {
      const k = `${acx + dv.x * s}_${acy + dv.y * s}`;
      stairCellCache.set(k, { stairId: b.id, step: s });
    }
  }
  stairCellDirty = false;
}
function findStairBuildingForCell(cx, cy) {
  if (stairCellDirty) rebuildStairCellCache();
  const entry = stairCellCache.get(`${cx}_${cy}`);
  if (!entry) return null;
  const stair = buildings.get(entry.stairId);
  if (!stair) { stairCellDirty = true; return null; } // 이미 삭제된 stair
  return { stair, step: entry.step };
}
function isBlockedByStairSide(newX, newY, oldX, oldY, entityFloor = 0) {
  const oc = cellOf(oldX, oldY);
  const nc = cellOf(newX, newY);
  if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
  const enteringStair = findStairBuildingForCell(nc.cx, nc.cy);
  if (!enteringStair) return false;
  const fromStair = findStairBuildingForCell(oc.cx, oc.cy);
  if (fromStair && fromStair.stair.id === enteringStair.stair.id) return false;
  // outside → stair entry. player floor check: 1층 입구는 1층 player만, 2층 입구는 2층 player만.
  const dir = enteringStair.stair.data?.dir || 'N';
  const dv = dirVecForCollider(dir);
  const moveX = nc.cx - oc.cx;
  const moveY = nc.cy - oc.cy;
  const stairFloor = enteringStair.stair.floor || 0;
  // step 0 = stair.floor 입구 (예: 1층 stair = floor 0 entry). player floor must match.
  if (enteringStair.step === 0 && moveX === dv.x && moveY === dv.y && entityFloor === stairFloor) return false;
  // step 2 = stair.floor + 1 입구 (예: 2층 stair top). player floor must match.
  if (enteringStair.step === 2 && moveX === -dv.x && moveY === -dv.y && entityFloor === stairFloor + 1) return false;
  return true;
}

// Phase 5-8: tree 입체 콜라이더 — 원형. radius 검사.
const PLAYER_BODY_R = 6;
const TRUNK_COLLIDER_MAX = 9;   // 줄기 충돌 반경 상한 — 캐노피가 커도 줄기는 가늘다(스프라이트 줄기와 정합). r은 occlusion용(최대 20).
function isBlockedByTree(x, y) {
  if (!qtResources) return false;
  // 검색 반경 28 = 최대 충돌(TRUNK_COLLIDER_MAX 9 + PLAYER_BODY_R 6 = 15)보다 충분히 큼. 클라 스캔(40)과 함께 둘 다 모든 차단 나무 포함 → 일관.
  const nearby = qtResources.queryCircle(x, y, 28);
  for (const item of nearby) {
    const r = item.ref || item;
    if (r.type !== 'tree' || !r.r) continue;
    const tr = Math.min(r.r, TRUNK_COLLIDER_MAX);   // 줄기 반경 (캐노피 r 아님)
    if (Math.hypot(r.x - x, r.y - y) < tr + PLAYER_BODY_R) return true;
  }
  return false;
}

// 인접 cell (cx,cy) → (cx+sx, cy+sy)로의 cardinal 한 칸 이동이 wall/door edge로 막히나
function edgeBlockedStep(cx, cy, sx, sy, floor) {
  if (sx === 1)  return findEdgeWall(cx, cy, 'E', floor);
  if (sx === -1) return findEdgeWall(cx - 1, cy, 'E', floor);
  if (sy === 1)  return findEdgeWall(cx, cy + 1, 'N', floor);
  if (sy === -1) return findEdgeWall(cx, cy, 'N', floor);
  return false;
}
// 셀 단위 경로 추적 충돌 판정 (코너 컷·멀티셀 터널링 방지 rewrite)
// - 옛 버전은 else-if 체인으로 edge 1개만 검사 → 대각 이동 시 N/S 누락 (방 모서리 뚫림),
//   한 틱에 2칸 이상 이동 시 중간 벽 통과 (터널링).
// - 대각 한 칸: 두 L-경로(x먼저/y먼저)가 모두 막혀 있으면 차단 (코너 컷 방지).
// - 멀티셀: 목적지까지 셀씩 걸으며 매 crossing·진입 cell 검사.
function isBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0, traceName = null) {
  // 같은 cell 안 이동 — wall 가로지르지 않음
  const oc = cellOf(oldX, oldY);
  const nc = cellOf(newX, newY);
  if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
  // 14.49-e2: 계단 측면 진입 차단 (먼저 검사 — 빠르고 우선순위 높음). 14.49-e7al: floor check 추가
  if (isBlockedByStairSide(newX, newY, oldX, oldY, playerFloor)) return true;
  let blocked = false;
  let reason = '';
  let cx = oc.cx, cy = oc.cy;
  let steps = 0;
  const MAX_STEPS = 64; // 한 틱 이동으로는 도달 불가한 거리 — 초과 시 안전하게 차단
  while (cx !== nc.cx || cy !== nc.cy) {
    if (++steps > MAX_STEPS) { blocked = true; reason = 'MAX_STEPS'; break; }
    const dx = nc.cx - cx, dy = nc.cy - cy;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    let nxc = cx, nyc = cy;
    if (sx !== 0 && sy !== 0) {
      // 대각 한 칸: x먼저 / y먼저 L-경로 중 하나라도 열려 있어야 통과
      const viaX = !edgeBlockedStep(cx, cy, sx, 0, playerFloor) && !edgeBlockedStep(cx + sx, cy, 0, sy, playerFloor);
      const viaY = !edgeBlockedStep(cx, cy, 0, sy, playerFloor) && !edgeBlockedStep(cx, cy + sy, sx, 0, playerFloor);
      if (!viaX && !viaY) { blocked = true; reason = `DIAG@(${cx},${cy})`; break; }
      nxc = cx + sx; nyc = cy + sy;
    } else if (sx !== 0) {
      if (edgeBlockedStep(cx, cy, sx, 0, playerFloor)) { blocked = true; reason = `${sx > 0 ? 'E' : 'W'}@(${cx},${cy})`; break; }
      nxc = cx + sx;
    } else {
      if (edgeBlockedStep(cx, cy, 0, sy, playerFloor)) { blocked = true; reason = `${sy > 0 ? 'S' : 'N'}@(${cx},${cy})`; break; }
      nyc = cy + sy;
    }
    // 14.50: fence cell 진입 차단 — 경로상 진입하는 모든 cell 검사 (옛 버전은 목적지만)
    if (findCellFence(nxc, nyc, playerFloor)) { blocked = true; reason = `FENCE@(${nxc},${nyc})`; break; }
    cx = nxc; cy = nyc;
  }
  // DEBUG — traceName 있을 때만 (player만, NPC spam 방지)
  if (DEBUG_COLLIDER && traceName) {
    console.log(`[${ZONE_ID}/coll] ${traceName} (${oldX.toFixed(0)},${oldY.toFixed(0)})→(${newX.toFixed(0)},${newY.toFixed(0)}) cell ${oc.cx},${oc.cy}→${nc.cx},${nc.cy} f${playerFloor} ${blocked ? 'BLOCKED:' + reason : 'pass'}`);
  }
  return blocked;
}

// === Phase 14.7: 마을(NPC 길드) 단위 자동 생산 시뮬레이션 (1분마다) ===
// 설계 §7.4: 개별 NPC가 채집 X. 마을 시뮬레이션 단위로 treasury 자동 채움.
// biome 편재 반영 — 산악 마을은 ore·stone, 평원은 berry·herb 위주.
function biomeProduction(biome) {
  if (biome === 'mountains') return { stone: 3, ore: 1, wood: 1 };
  if (biome === 'plains')    return { berry: 4, herb: 2, wood: 1 };
  // forest
  return { wood: 4, berry: 1, herb: 1 };
}
setInterval(async () => {
  if (villageGuildIds.size === 0) return;
  const prod = biomeProduction(ZONE.biome);
  for (const [villageName, tribeId] of villageGuildIds) {
    try {
      await central.tribeTreasury(tribeId, prod);
    } catch (e) { /* central down 무시 */ }
  }
  if (villageGuildIds.size > 0) {
    const pStr = Object.entries(prod).map(([k,v]) => `${k}+${v}`).join(' ');
    console.log(`[${ZONE_ID}] 🏭 마을 생산 (${villageGuildIds.size}곳): ${pStr}`);
  }
}, 60 * 1000);

// 14.5 siege_camp decay tick 제거 — 임시 사유지(claim)로 대체 (Phase 14.18)

// === 게임 틱 ===
const TICK_MS = 1000 / TICK_HZ;
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  // 플레이어/NPC 이동은 클라 예측(고정 PRED_STEP=1/TICK_HZ)과 '동일한 고정 dt'로 — 리컨실리에이션 어긋남 0(떨림 제거).
  //   (가변 dt면 서버 위치가 매 틱 클라 고정스텝과 ±몇px 달라져 30Hz 떨림.) 다른 시스템(타이머·물리)은 실시간 dt 유지.
  const moveDt = 1 / TICK_HZ;
  lastTick = now;

  // === 14.49-e3-perf5: idle zone skip ===
  // 사람 player(isNpc=false) + observer 모두 0명이면 tick 풀 처리 skip.
  // 5초마다 한 번씩만 가벼운 maintenance (NPC 마을 시뮬레이션은 별도 setInterval(60s)라 영향 없음).
  let hasHuman = false;
  for (const p of players.values()) { if (!p.isNpc) { hasHuman = true; break; } }
  const hasObserver = observers.size > 0;
  if (!hasHuman && !hasObserver) {
    // idle zone: 5초마다만 가벼운 작업. 26 zone 중 25개가 idle이면 CPU 거의 0.
    if (!global._idleSkipAt || now - global._idleSkipAt > 5000) {
      global._idleSkipAt = now;
      // 입력 타임아웃 정리만 (NPC AI·이동·broadcast 모두 skip)
    }
    return;
  }

  // === 활성 청크 갱신 (player·observer 위치 기반) ===
  updateActiveChunks();

  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===
  rebuildSpatialIndex();

  // 입력 타임아웃 — 2.5초 동안 입력 없으면 정지
  // 14.46-b-smooth: 1000 → 2500. 평지에서 짧은 네트워크 hiccup으로 server가 멈췄다가 클라 예측이 앞서면
  // 다음 snapshot으로 사용자가 뒤로 밀려나는 느낌 받음. 2.5초로 늘려서 잠깐 끊겨도 server는 계속 이동.
  for (const p of players.values()) {
    if (p.handingOff) continue;
    if (p.isNpc) continue;  // NPC는 입력 타임아웃 무관 (npcStep이 vx/vy 관리) — 600명 순회 절약
    // 입력 큐 — 틱당 1개씩 받은 순서대로 적용 (클라 고정스텝과 일치 → 리컨실리에이션 보정 0).
    //   비었으면 last vx/vy 유지(키 계속 누름 가정). ackSeq = 마지막으로 '적용'한 seq.
    if (p.inputQueue && p.inputQueue.length) {
      const inp = p.inputQueue.shift();
      const canSprint = (p.hunger ?? HUNGER_MAX) > SPRINT_MIN_GAUGE && (p.thirst ?? THIRST_MAX) > SPRINT_MIN_GAUGE;
      p.sprint = inp.sprint && canSprint;
      const spMult = p.sprint ? SPRINT_MULT : 1.0;
      const hyp = Math.hypot(inp.vx, inp.vy), len = hyp || 1;
      p.vx = (inp.vx / len) * MOVE_SPEED * Math.min(1, hyp) * spMult;
      p.vy = (inp.vy / len) * MOVE_SPEED * Math.min(1, hyp) * spMult;
      p.lastInputSeq = inp.seq;
    }
    if (now - p.lastSeen > 2500) { p.vx = 0; p.vy = 0; }
  }

  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===
  // 비활성 청크 NPC는 멈춤 (CPU 절약). 가까이 player 오면 자동 재개.
  for (const pid of npcs) {
    const npc = players.get(pid);
    if (!npc || npc.hp <= 0) continue;
    // Phase 4d-9 fix: canadia NPC는 active chunk 체크 우회 (모든 마을 동시 시뮬)
    if (!npc.canadiaVillage && !isPositionActive(npc.x, npc.y)) { npc.vx = 0; npc.vy = 0; continue; }
    if ((Date.now() - now) > 15) break;
    npcStep(npc, dt, now);
  }
  // 농지 ready 마크 (시간 지남) — 활성청크만 (집 ON이면 전 건물 3만+채 매틱 순회 방지)
  for (const k of activeChunkKeys) { const c = chunkManager.chunks.get(k); if (!c) continue;
    for (const b of c.buildings.values()) {
      if (b.type === 'farmland' && b.data && !b.data.ready && now >= b.data.readyAt) b.data.ready = true;
    }
  }

  // Phase 5-I: 화살 물리/히트 + 만료된 ghost 정리
  stepArrows(dt);
  { const now2 = Date.now();
    for (const [gid, g] of ghostPlayers) if (now2 - g.recvAt > GHOST_TTL_MS) ghostPlayers.delete(gid);
    for (const [bid, g] of ghostBuildings) if (now2 - g.recvAt > GHOST_TTL_MS) ghostBuildings.delete(bid);
  }

  // 이동 + 경계 처리 + 벽 충돌
  for (const p of players.values()) {
    if (p.handingOff) continue;
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC — 이동 처리 스킵 (안 움직임) → 1000명 확장
    // === auto-eject: 어떤 이유로든(핸드오프 착지·지형변경·관통) 중심이 물/바위에 빠졌으면,
    //   "자유이동(escape valve)" 대신 가장 가까운 통행가능 셀로 밀어낸다 → 강 안에서 헤엄치는 버그 차단.
    if (isTerrainBlockedLocal(p.x, p.y)) {
      let ejX = 0, ejY = 0, found = false;
      for (let r = 32; r <= 32 * 16 && !found; r += 32) {
        for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
          if (!isTerrainBlockedLocal(p.x + d[0] * r, p.y + d[1] * r)) { ejX = d[0]; ejY = d[1]; found = true; break; }
        }
      }
      if (found) {
        const len = Math.hypot(ejX, ejY) || 1;
        const push = MOVE_SPEED * moveDt * 1.8;
        p.x += (ejX / len) * push;
        p.y += (ejY / len) * push;
        p.dirty = true;
      }
      p.vx = 0; p.vy = 0;
      continue; // 이 tick은 일반 이동 skip — 밀려나는 중
    }
    // 14.53-j: 계단 위(onStairId 있음)면 dir 축으로만 이동 허용 — 옆으로 빠져나가는 버그 차단
    let stepVx = p.vx, stepVy = p.vy;
    if (p.onStairId) {
      const stair = buildings.get(p.onStairId);
      if (stair) {
        const dir = stair.data?.dir || 'N';
        const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
                 : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
        // dir 축에 projection (성분만 남김)
        const proj = stepVx * dv.x + stepVy * dv.y;
        stepVx = proj * dv.x;
        stepVy = proj * dv.y;
      }
    }
    let nx = p.x + stepVx * moveDt;
    let ny = p.y + stepVy * moveDt;

    // PZ식 edge 콜라이더 — 각 축 별로 따로 처리해서 slide 가능. player floor만.
    const pf = p.floor || 0;
    const trace = p.isNpc ? null : p.name; // player만 trace, NPC는 spam 방지
    if (isBlockedByWall(nx, p.y, p.x, p.y, pf, trace)) nx = p.x;
    if (isBlockedByWall(p.x, ny, p.x, p.y, pf, trace)) ny = p.y;
    if (isBlockedByWall(nx, ny, p.x, p.y, pf, trace)) { nx = p.x; ny = p.y; }
    // Phase 5-8: tree 입체 콜라이더 (1층만, 위층은 통과)
    if (pf === 0) {
      if (isBlockedByTree(nx, p.y)) nx = p.x;
      if (isBlockedByTree(p.x, ny)) ny = p.y;
      if (isBlockedByTree(nx, ny)) { nx = p.x; ny = p.y; }
    }
    // 14.45: 빙하 콜라이더 — y가 극지방 진입하면 ny 무효
    if (isInIceBand(ny) && !isInIceBand(p.y)) ny = p.y;
    // 14.46-b-mini: 물 타일 진입 차단 (보트 시스템 전까지). 각 축별 slide.
    // Phase 5-G: cell border까지 정확히 snap (tick step 가변·east/west 비대칭 fix)
    if (isTerrainBlockedLocal(nx, p.y) && !isTerrainBlockedLocal(p.x, p.y)) {
      const tx = Math.floor(p.x / 32);
      if (nx > p.x) nx = (tx + 1) * 32 - 1;       // 동쪽: cell의 마지막 정수 px
      else if (nx < p.x) nx = tx * 32;            // 서쪽: cell의 시작 px
      else nx = p.x;
    }
    if (isTerrainBlockedLocal(p.x, ny) && !isTerrainBlockedLocal(p.x, p.y)) {
      const ty = Math.floor(p.y / 32);
      if (ny > p.y) ny = (ty + 1) * 32 - 1;
      else if (ny < p.y) ny = ty * 32;
      else ny = p.y;
    }
    if (isTerrainBlockedLocal(nx, ny) && !isTerrainBlockedLocal(p.x, p.y)) { nx = p.x; ny = p.y; }

    // 4방향 경계 처리 — 새 위치가 zone 밖으로 나가면 이웃으로 핸드오프
    // 우선순위: 가장 큰 초과 축. 모서리에서 두 방향 동시에 초과돼도 한 zone으로만.
    const outW = -nx;                              // 서쪽 초과량 (>0이면 밖)
    const outE = nx - ZONE.zoneWidth;             // 동쪽 초과량
    const outN = -ny;                              // 북쪽 초과량
    const outS = ny - ZONE.zoneHeight;            // 남쪽 초과량
    const maxOut = Math.max(outW, outE, outN, outS);
    // DEBUG — 1초마다 1회만
    if ((p.vy !== 0 || p.vx !== 0) && (!p._dbgT || now - p._dbgT > 1000)) {
      p._dbgT = now;
      console.log(`[${ZONE_ID}/dbg] ${p.name} pos=(${nx.toFixed(0)},${ny.toFixed(0)}) v=(${p.vx.toFixed(0)},${p.vy.toFixed(0)}) maxOut=${maxOut.toFixed(0)} handingOff=${p.handingOff}`);
    }
    // Phase 5-K2: 히스테리시스 핸드오프 — 시간 쿨다운 대신 "겹침 띠" 방식.
    //   maxOut <= 0           : zone 안 — 그냥 이동.
    //   0 < maxOut <= COMMIT  : 경계를 살짝 넘었지만 아직 이 zone 소유 (겹침 띠). 클램프 X, 자유 이동.
    //   maxOut > COMMIT       : 이웃으로 확실히 진입 → 핸드오프 (도착은 경계에서 그만큼 안쪽).
    // 이래야 경계에서 왔다갔다 해도 양쪽 COMMIT px 띠 안에선 핸드오프가 안 일어나 핑퐁/렉이 없다.
    if (maxOut <= 0) {
      p.x = nx; p.y = ny;
    } else if (p.isNpc) {
      // NPC는 zone 핸드오프 안 함 — 항상 클램프
      p.x = clamp(nx, 0, ZONE.zoneWidth);
      p.y = clamp(ny, 0, ZONE.zoneHeight);
      p.nextDecisionAt = 0;
    } else {
      // 14.46-a: abs 좌표 lookup으로 핸드오프 대상 결정. ocean/월드끝은 클램프.
      const absExitX = ZONE.worldOffsetX + nx;
      const absExitY = ZONE.worldOffsetY + ny;
      const target = findZoneAt(absExitX, absExitY);
      if (target && target.id !== ZONE_ID && !target.isOcean) {
        if (maxOut > HANDOFF_COMMIT) {
          // 확실히 넘어감 → 핸드오프. 진입 좌표 = 실제 abs 위치(경계에서 COMMIT 안쪽이라 즉시 되넘김 불가).
          p.x = nx; p.y = ny;
          const HM = 80;
          const localX = Math.min(target.zoneWidth - HM, Math.max(HM, absExitX - target.worldOffsetX));
          const localY = Math.min(target.zoneHeight - HM, Math.max(HM, absExitY - target.worldOffsetY));
          fireHandoff(p, target.id, localX, localY);
        } else {
          // 겹침 띠 — 아직 이 zone 소유. 자유 이동 (클램프 안 함).
          p.x = nx; p.y = ny;
        }
      } else {
        // 이웃이 바다/월드 끝 → 클램프
        p.x = clamp(nx, 0, ZONE.zoneWidth);
        p.y = clamp(ny, 0, ZONE.zoneHeight);
      }
    }
  }

  // === Phase 14.49-e: PZ식 다단 계단 — 3 cell 점유 + step별 z + walk-off로 floor 전환 ===
  // stair (b) — anchor (b.x, b.y) = 낮은 발판. dir = 위로 가는 방향.
  // 3 cells 점유: anchor (step 0, z=0), anchor+dir (step 1, z=16), anchor+2*dir (step 2, z=32)
  // 계단 위 어디든 서있을 수 있음. WASD로 dir 방향 누르면 한 칸씩 이동 = 자연스럽게 올라감.
  // dir 방향으로 stair 벗어남 (step 2에서 한 칸 더) → 위층 도착.
  // 반대 방향으로 stair 벗어남 (step 0에서 한 칸 더) → 아래층 도착.
  function dirVec(dir) {
    if (dir === 'N') return { x: 0, y: -1 };
    if (dir === 'S') return { x: 0, y: 1 };
    if (dir === 'E') return { x: 1, y: 0 };
    if (dir === 'W') return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  // 어떤 stair의 어떤 step에 entity가 있는지 찾음. 없으면 null.
  function findStairStepFor(entity) {
    // 14.49-e3-perf4: O(1) cache 활용 (findStairBuildingForCell와 통합)
    const ex = Math.floor(entity.x / BUILDING_SIZE);
    const ey = Math.floor(entity.y / BUILDING_SIZE);
    return findStairBuildingForCell(ex, ey);
  }
  function stepStairFor(entity) {
    const cur = findStairStepFor(entity);
    if (!cur) {
      // stair 벗어남 — 어느 방향으로 벗어났는지 보고 floor 결정
      if (entity.onStairId) {
        const stair = buildings.get(entity.onStairId);
        if (stair) {
          const sd = stair.data?.dir || 'N';
          const dv = dirVec(sd);
          const lastStep = entity.stairStep ?? 0;
          const stairFloor = stair.floor || 0;
          const vx = entity.vx || 0, vy = entity.vy || 0;
          const align = vx * dv.x + vy * dv.y;
          if (lastStep === 2 && align > 0) {
            // 위쪽 끝에서 dir 방향으로 walk-off = 위층 도착
            entity.floor = Math.min(5, stairFloor + 1);
            entity.z = 0;
            if (entity.ws) {
              send(entity.ws, { type: 'floor_changed', floor: entity.floor });
              broadcast({ type: 'player_floor_changed', pid: entity.pid, floor: entity.floor });
            }
          } else if (lastStep === 0 && align < 0) {
            // 아래쪽 끝에서 dir 반대로 walk-off = 아래층 도착 (이미 stair.floor)
            entity.floor = Math.max(0, stairFloor);
            entity.z = 0;
            if (entity.ws) {
              send(entity.ws, { type: 'floor_changed', floor: entity.floor });
              broadcast({ type: 'player_floor_changed', pid: entity.pid, floor: entity.floor });
            }
          } else {
            // 옆으로 떨어짐 등 — z만 0으로 복귀, floor 유지
            entity.z = 0;
          }
        } else {
          entity.z = 0;
        }
        entity.onStairId = null;
        entity.stairStep = 0;
      } else {
        // 평지 — z 천천히 0으로
        if ((entity.z || 0) > 0) entity.z = Math.max(0, (entity.z || 0) - 80 * dt);
      }
      return;
    }
    // stair 위에 있음 — 14.49-e2: 24 sub-step (cell당 8칸), 연속 z 보간
    const { stair, step } = cur;
    if (entity.onStairId !== stair.id) entity.onStairId = stair.id;
    const dir = stair.data?.dir || 'N';
    const dv = dirVec(dir);
    const acx = Math.floor(stair.x / BUILDING_SIZE);
    const acy = Math.floor(stair.y / BUILDING_SIZE);
    const cellCx = acx + dv.x * step;
    const cellCy = acy + dv.y * step;
    const cellCenterX = cellCx * BUILDING_SIZE + BUILDING_SIZE / 2;
    const cellCenterY = cellCy * BUILDING_SIZE + BUILDING_SIZE / 2;
    // entity의 dir 축 위치: 어디까지 진행했나 (0~3 cell = 0~96 px along dir)
    // anchor의 cell 0 low edge = position 0, cell 2의 high edge = position 96
    const localDX = entity.x - cellCenterX;
    const localDY = entity.y - cellCenterY;
    const projInCell = localDX * dv.x + localDY * dv.y; // -16~+16 (cell 내 dir축 위치)
    // 전체 stair 진행도 (0 ~ 96 픽셀). cell 시작 = step*32, 거기에 (projInCell + 16) 더함.
    const totalProj = step * BUILDING_SIZE + (projInCell + BUILDING_SIZE / 2);
    const totalLen = 3 * BUILDING_SIZE; // 96 px
    const f = Math.max(0, Math.min(1, totalProj / totalLen));
    // 24 sub-step으로 discrete snap (등분). f * 24 = 0~24, floor → 0~24 정수 (실제 0~23)
    const sub24 = Math.max(0, Math.min(24, Math.floor(f * 24)));
    const stairTopZ = (sub24 / 24) * FLOOR_HEIGHT; // 0 ~ FLOOR_HEIGHT (stair entity 기준)
    // 14.49-e7ai: player floor 보정 — stair absolute z = stair.floor*64 + stairTopZ
    //   entity.z (relative) = stairAbsZ - entity.floor*64
    //   2층에서 stair top 도달 시: stair.floor=0, sub24=24, stairTopZ=64, stairAbsZ=64.
    //   player.floor=1 → entity.z = 64 - 64 = 0. 절대 z = 64 + 0 = 64. (튀어 오름 없음)
    //   1층에서 stair top 도달 시: player.floor=0 → entity.z = 64. 절대 z = 0 + 64 = 64. (위층 입구 z)
    const stairAbsZ = (stair.floor || 0) * FLOOR_HEIGHT + stairTopZ;
    const targetRelZ = stairAbsZ - (entity.floor || 0) * FLOOR_HEIGHT;
    entity.stairStep = step;
    entity.stairSubStep = sub24;
    const cur_z = entity.z || 0;
    const lerpT = Math.min(1, dt * 14);
    entity.z = cur_z + (targetRelZ - cur_z) * lerpT;
    if (Math.abs(entity.z - targetRelZ) < 0.5) entity.z = targetRelZ;
  }
  for (const p of players.values()) {
    if (p.handingOff || p.isDown) continue;
    stepStairFor(p);
  }
  for (const m of mobs.values()) {
    if (m.hp <= 0) continue;
    // 14.49-e perf: 비활성 chunk mob은 skip. 정지 mob은 onStairId 있을 때만 (방향 변경 가능)
    if (!isPositionActive(m.x, m.y)) continue;
    const moving = (m.vx || 0) !== 0 || (m.vy || 0) !== 0;
    if (!moving && !m.onStairId) continue;
    stepStairFor(m);
  }

  // === 14.49-e2: 낙하 (falling) — 위층에서 받침 floor 없는 곳으로 walk-off ===
  // player.floor > 0인데 그 cell에 자기 floor 받침 (floor 빌딩)이 없고, stair도 아니면 → fall.
  // fallVz = -120 px/s (중력). z 감소. 0층까지 도달하면 floor 0로 정착. 낙하 거리에 비례한 데미지.
  function hasFloorSupportAt(absX, absY, floor) {
    if (floor === 0) return true; // 0층은 항상 땅
    const cx = Math.floor(absX / BUILDING_SIZE);
    const cy = Math.floor(absY / BUILDING_SIZE);
    const near = qtBuildings ? qtBuildings.queryCircle(absX, absY, BUILDING_SIZE) : Array.from(buildings.values());
    for (const b of near) {
      if (b.type !== 'floor' && b.type !== 'stair') continue;
      const bcx = Math.floor(b.x / BUILDING_SIZE);
      const bcy = Math.floor(b.y / BUILDING_SIZE);
      // floor 빌딩은 단일 cell, 자기 floor가 player floor와 같으면 support
      if (b.type === 'floor' && bcx === cx && bcy === cy && (b.floor || 0) === floor) return true;
      // stair는 3 cell 점유, stair.floor가 floor-1이면 위쪽 floor에서 받침 역할
      if (b.type === 'stair' && (b.floor || 0) === floor - 1) {
        const dir = b.data?.dir || 'N';
        const dv = dirVec(dir);
        for (let s = 0; s <= 2; s++) {
          if (bcx + dv.x * s === cx && bcy + dv.y * s === cy) return true;
        }
      }
    }
    return false;
  }
  function processFalling(entity) {
    if ((entity.floor || 0) === 0) {
      // 0층 — 낙하 없음, falling 상태 정리
      if (entity.falling) { entity.falling = false; entity.fallVz = 0; }
      return;
    }
    if (entity.onStairId) {
      // 계단 위 — 안 떨어짐
      if (entity.falling) { entity.falling = false; entity.fallVz = 0; }
      return;
    }
    if (hasFloorSupportAt(entity.x, entity.y, entity.floor)) {
      if (entity.falling) { entity.falling = false; entity.fallVz = 0; }
      return;
    }
    // 받침 없음 — 낙하 시작/계속
    if (!entity.falling) {
      entity.falling = true;
      entity.fallStartFloor = entity.floor;
      entity.fallStartZ = (entity.floor || 0) * FLOOR_HEIGHT;
      entity.fallVz = 0;
      entity._fallTopZ = entity.fallStartZ;
    }
    entity.fallVz = (entity.fallVz || 0) - 400 * dt; // 중력
    entity.z = (entity.z || 0) + entity.fallVz * dt;
    // 현재 위치의 절대 z = floor * FLOOR_HEIGHT + entity.z
    // (entity.z는 floor 위 추가 높이로 해석)
    // 한 층씩 떨어지면 floor 감소
    while (entity.z < -FLOOR_HEIGHT && entity.floor > 0) {
      entity.z += FLOOR_HEIGHT;
      entity.floor -= 1;
      if (entity.ws) {
        send(entity.ws, { type: 'floor_changed', floor: entity.floor });
        broadcast({ type: 'player_floor_changed', pid: entity.pid, floor: entity.floor });
      }
    }
    // 0F 도달 — 착지
    if (entity.floor === 0 && entity.z <= 0) {
      entity.z = 0;
      entity.fallVz = 0;
      entity.falling = false;
      // 낙하 데미지 — fallStartFloor 기준
      const fallFloors = entity.fallStartFloor - 0;
      if (fallFloors >= 1 && entity.hp !== undefined) {
        const dmg = fallFloors * 25; // 1층 fall = 25 HP, 2층 = 50, ...
        if (entity.ws) {
          damagePlayer(entity, dmg, 'fall');
        } else {
          entity.hp = Math.max(0, entity.hp - dmg);
        }
      }
      entity.fallStartFloor = 0;
    }
  }
  for (const p of players.values()) {
    if (p.handingOff || p.isDown) continue;
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC 낙하 스킵
    processFalling(p);
  }
  for (const m of mobs.values()) {
    if (m.hp <= 0) continue;
    if (!isPositionActive(m.x, m.y)) continue;
    processFalling(m);
  }

  // === 생존 게이지: hunger/thirst 감소 + 0이면 HP 페널티 + vp decay ===
  for (const p of players.values()) {
    if (p.hp <= 0 || p.isDown) continue;
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC 허기/갈증 스킵
    // Phase 4d-10 fix: canadia NPC는 hunger/thirst skip (sim에서 식량 소비 처리, zone 자동 식사 없음)
    if (p.canadiaVillage) { p.hunger = HUNGER_MAX; p.thirst = THIRST_MAX; continue; }
    // Phase 14.40: 달리는 중이면 1.5× 빠르게 감소 (실제로 이동 중일 때만)
    const moving = Math.hypot(p.vx || 0, p.vy || 0) > 1;
    const drainMult = (p.sprint && moving) ? SPRINT_DRAIN_MULT : 1.0;
    p.hunger = Math.max(0, (p.hunger ?? HUNGER_MAX) - HUNGER_DRAIN_PER_SEC * dt * drainMult);
    p.thirst = Math.max(0, (p.thirst ?? THIRST_MAX) - THIRST_DRAIN_PER_SEC * dt * drainMult);
    // 게이지가 sprint 하한 밑으로 떨어지면 자동 해제
    if (p.sprint && (p.hunger <= SPRINT_MIN_GAUGE || p.thirst <= SPRINT_MIN_GAUGE)) {
      p.sprint = false;
    }
    // vp 시간당 감소
    if ((p.vp ?? 0) > 0) p.vp = Math.max(0, p.vp - VP_DECAY_PER_SEC * dt);
    // 게이지 0이면 굶주림/탈수 데미지 (둘 다 0이면 2배)
    let starv = 0;
    if (p.hunger <= 0) starv += STARVATION_HP_PER_SEC;
    if (p.thirst <= 0) starv += STARVATION_HP_PER_SEC;
    if (starv > 0) {
      p.hp -= starv * dt;
      if (p.hp <= 0) damagePlayer(p, 0, 'starvation'); // damagePlayer 안에서 사망 처리
    }
  }

  // === HP 회복 (out-of-combat 1초 후) — 단 hunger/thirst 모두 0이상일 때만 ===
  for (const p of players.values()) {
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC HP회복 스킵
    if (p.hp > 0 && p.hp < p.maxHp && now - p.lastDamagedAt > 1000) {
      if ((p.hunger ?? HUNGER_MAX) > 10 && (p.thirst ?? THIRST_MAX) > 10) {
        p.hp = Math.min(p.maxHp, p.hp + 2 * dt * 5); // 초당 ~10hp
      }
    }
  }

  // === 게이지 변화 주기 broadcast (1초 간격, self에만) ===
  for (const p of players.values()) {
    if (p.isNpc) continue;  // NPC는 클라(ws) 없음 — 게이지 전송 불필요. 600명 순회·메시지 생성 절약
    if (!p._lastGaugeSentAt || now - p._lastGaugeSentAt > 1000) {
      p._lastGaugeSentAt = now;
      send(p.ws, {
        type: 'gauges',
        hunger: Math.round(p.hunger ?? HUNGER_MAX),
        thirst: Math.round(p.thirst ?? THIRST_MAX),
        vp: Math.round(p.vp ?? 0),
      });
    }
  }

  // === Mob AI ===
  // 밤이면 늑대 시야 1.5배, 데미지 1.3배 — 모든 zone이 동일한 phase 사용
  const night = isNight(now);
  const sightMult = night ? 1.5 : 1.0;
  const dmgMult = night ? 1.3 : 1.0;
  for (const m of mobs.values()) {
    // 비활성 청크 mob 멈춤 — CPU 절약
    if (!isChunkActiveKey(m._chunkKey)) { m.vx = 0; m.vy = 0; continue; }
    const def = MOB_DEFS[m.type];
    const sight = def.sightRange * sightMult;

    // === 길든 mob: 주인 따라가기, 어그로 안 함 ===
    if (m.tameOwner) {
      m.aggroTarget = null;
      // 주인이 현재 zone에 접속 중이면 따라가기
      let ownerP = null;
      for (const p of players.values()) if (p.playerId === m.tameOwner) { ownerP = p; break; }
      if (ownerP) {
        const dx = ownerP.x - m.x, dy = ownerP.y - m.y;
        const dd = Math.hypot(dx, dy);
        if (dd > TAME_FOLLOW_DIST) {
          m.vx = (dx / dd) * def.speed * 0.7;
          m.vy = (dy / dd) * def.speed * 0.7;
        } else if (dd < TAME_FOLLOW_STOP) {
          m.vx = 0; m.vy = 0;
        } // 중간은 그대로 두기
      } else {
        m.vx = 0; m.vy = 0;
      }
      // 길든 mob은 이동만 처리하고 일반 AI 스킵
      let nx = m.x + m.vx * dt;
      let ny = m.y + m.vy * dt;
      nx = clamp(nx, 0, ZONE.zoneWidth);
      ny = clamp(ny, 0, ZONE.zoneHeight);
      if (isBlockedByWall(nx, m.y, m.x, m.y, m.floor || 0)) nx = m.x;
      if (isBlockedByWall(m.x, ny, m.x, m.y, m.floor || 0)) ny = m.y;
      if (isInIceBand(ny) && !isInIceBand(m.y)) ny = m.y; // 14.45
      // 14.46-b-mini + Phase 5-G: 물 타일 진입 차단 + cell border snap
      if (isTerrainBlockedLocal(nx, m.y) && !isTerrainBlockedLocal(m.x, m.y)) {
        const tx = Math.floor(m.x / 32);
        if (nx > m.x) nx = (tx + 1) * 32 - 1;
        else if (nx < m.x) nx = tx * 32;
        else nx = m.x;
      }
      if (isTerrainBlockedLocal(m.x, ny) && !isTerrainBlockedLocal(m.x, m.y)) {
        const ty = Math.floor(m.y / 32);
        if (ny > m.y) ny = (ty + 1) * 32 - 1;
        else if (ny < m.y) ny = ty * 32;
        else ny = m.y;
      }
      if (Math.abs(nx - m.x) + Math.abs(ny - m.y) > 2) m.dirty = true;
      m.x = nx; m.y = ny;
      chunkManager.updateMobChunk(m);
      continue;
    }

    // 어그로 타겟 검증 — 타겟 죽음/실종/시야 밖면 해제. 늑대는 영역 너무 벗어났을 때도 해제.
    // 14.49-d: 다른 floor라도 어그로 유지 (계단으로 추격). 너무 멀거나 죽었을 때만 해제.
    if (m.aggroTarget) {
      const t = players.get(m.aggroTarget);
      const tooFarFromTarget = !t || t.hp <= 0 || Math.hypot(t.x - m.x, t.y - m.y) > sight * 2.0;
      const tooFarFromHome   = m.type === 'wolf' && Math.hypot(m.x - m.homeX, m.y - m.homeY) > WOLF_TERRITORY_RADIUS;
      if (tooFarFromTarget || tooFarFromHome) m.aggroTarget = null;
    }
    // 늑대만: 시야 안 플레이어 어그로. 단 영역 안에서만 사냥 시작.
    if (m.type === 'wolf' && !m.aggroTarget) {
      const homeDist = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (homeDist < WOLF_TERRITORY_RADIUS) {
        const nearby = qtPlayers ? qtPlayers.queryCircle(m.x, m.y, sight) : Array.from(players.values());
        let best = null, bestD = sight;
        for (const p of nearby) {
          if (p.hp <= 0) continue;
          if (p.isDown) continue;
          // 다른 floor 어그로 시작은 안 함 (어그로 후엔 따라감)
          if ((p.floor || 0) !== (m.floor || 0)) continue;
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d < bestD) { best = p; bestD = d; }
        }
        if (best) {
          m.aggroTarget = best.pid;
          aggroPackmates(m, best.pid);
        }
      }
    }
    // 이동
    if (m.aggroTarget) {
      const t = players.get(m.aggroTarget);
      if (t && t.isDown) { m.aggroTarget = null; } // Phase 14.41: 다운되면 어그로 풀림
      else if (t) {
        // 14.49-e: 다른 floor면 가장 가까운 stair의 "반대 끝"으로 향함.
        // ascent: anchor 너머(위층 발판 너머)로 target → 자연스럽게 3 cell 다 거쳐 위층 도착
        // descent: anchor 너머(아래층 발판 너머)로 target → 위층 발판 진입 → 3 cell 거쳐 아래층
        let targetX = t.x, targetY = t.y;
        if ((t.floor || 0) !== (m.floor || 0)) {
          let bestStair = null, bestStairD = Infinity;
          const needAscend = (t.floor || 0) > (m.floor || 0);
          const stairFloorWanted = needAscend ? (m.floor || 0) : (m.floor || 0) - 1;
          for (const b of buildings.values()) {
            if (b.type !== 'stair') continue;
            if ((b.floor || 0) !== stairFloorWanted) continue;
            const sd = Math.hypot(b.x - m.x, b.y - m.y);
            if (sd < bestStairD) { bestStair = b; bestStairD = sd; }
          }
          if (bestStair) {
            const sdir = bestStair.data?.dir || 'N';
            const dvx = sdir === 'E' ? 1 : sdir === 'W' ? -1 : 0;
            const dvy = sdir === 'S' ? 1 : sdir === 'N' ? -1 : 0;
            if (needAscend) {
              // 위층으로: 위 발판(anchor + 2*dir) 더 너머로 target → step 0→1→2 자연 진행
              targetX = bestStair.x + dvx * BUILDING_SIZE * 4;
              targetY = bestStair.y + dvy * BUILDING_SIZE * 4;
            } else {
              // 아래층으로: 아래 발판(anchor) 더 너머로 target → step 2→1→0 자연 진행
              targetX = bestStair.x - dvx * BUILDING_SIZE * 2;
              targetY = bestStair.y - dvy * BUILDING_SIZE * 2;
            }
          }
        }
        const dx = targetX - m.x, dy = targetY - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 30) {
          m.vx = (dx / d) * def.speed;
          m.vy = (dy / d) * def.speed;
        } else {
          // 공격 범위 — 14.49-d: 같은 floor + 실제 player까지 30px 이내일 때만
          m.vx = 0; m.vy = 0;
          const sameFloor = (t.floor || 0) === (m.floor || 0);
          const realDist = Math.hypot(t.x - m.x, t.y - m.y);
          if (sameFloor && realDist < 50 && now - m.lastAttackAt > 1000) {
            m.lastAttackAt = now;
            damagePlayer(t, Math.round(def.damage * dmgMult), `mob:${m.type}`);
          }
        }
      }
    } else {
      // 배회 — 늑대는 home 영역 안에서만. home에서 너무 멀어졌으면 강제로 복귀.
      const homeDist = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (m.type === 'wolf' && homeDist > WOLF_WANDER_RADIUS) {
        // 영역 밖 — home 쪽으로 직진
        const dx = m.homeX - m.x, dy = m.homeY - m.y;
        const dd = Math.hypot(dx, dy) || 1;
        m.vx = (dx / dd) * def.speed * WOLF_RETURN_SPEED_MULT;
        m.vy = (dy / dd) * def.speed * WOLF_RETURN_SPEED_MULT;
        m.wanderUntil = now + 1500;
      } else if (now > m.wanderUntil) {
        const angle = Math.random() * Math.PI * 2;
        m.vx = Math.cos(angle) * def.speed * 0.3;
        m.vy = Math.sin(angle) * def.speed * 0.3;
        m.wanderUntil = now + 2000 + Math.random() * 3000;
        if (Math.random() < 0.4) { m.vx = 0; m.vy = 0; m.wanderUntil = now + 1500; }
      }
    }
    let nx = m.x + m.vx * dt;
    let ny = m.y + m.vy * dt;
    nx = clamp(nx, 0, ZONE.zoneWidth);
    ny = clamp(ny, 0, ZONE.zoneHeight);
    if (isBlockedByWall(nx, m.y, m.x, m.y, m.floor || 0)) nx = m.x;
    if (isBlockedByWall(m.x, ny, m.x, m.y, m.floor || 0)) ny = m.y;
    if (isInIceBand(ny) && !isInIceBand(m.y)) ny = m.y; // 14.45
    // 14.46-b-mini + Phase 5-G: 물 타일 진입 차단 + cell border snap
    if (isTerrainBlockedLocal(nx, m.y) && !isTerrainBlockedLocal(m.x, m.y)) {
      const tx = Math.floor(m.x / 32);
      if (nx > m.x) nx = (tx + 1) * 32 - 1;
      else if (nx < m.x) nx = tx * 32;
      else nx = m.x;
    }
    if (isTerrainBlockedLocal(m.x, ny) && !isTerrainBlockedLocal(m.x, m.y)) {
      const ty = Math.floor(m.y / 32);
      if (ny > m.y) ny = (ty + 1) * 32 - 1;
      else if (ny < m.y) ny = ty * 32;
      else ny = m.y;
    }
    // 의미 있는 이동(>2px)일 때만 dirty 마크 — 영속화 부담 최소화
    if (Math.abs(nx - m.x) + Math.abs(ny - m.y) > 2) m.dirty = true;
    m.x = nx; m.y = ny;
    chunkManager.updateMobChunk(m);
  }

  // === AOI 필터링: per-viewer tick ===
  // 각 viewer(player+observer)에 자기 시야(AOI_RADIUS) 안 player만 송신.
  // 대역폭 절감 + observer를 통한 정보 누출 차단.
  const allPlayers = Array.from(players.values());
  const allMobs = Array.from(mobs.values());
  // viewer별 "이전 tick에 본 entity pid/mid" 추적 — 새로 보이는 것만 메타 포함
  // 이미 본 것은 위치/HP만. payload ~70% 감소.
  function makeEntry(o, isNew, kind) {
    if (kind === 'player') {
      // Phase 14.35: 걷기 모션 동기화 — vx/vy 포함 (이동 중인지 클라가 판단)
      // Phase 14.41: isDown — 다운된 플레이어는 클라에서 누워있게 렌더
      // 14.49-d: z (계단 위 0~32)도 매 tick 전송
      const e = { pid: o.pid, x: o.x, y: o.y, hp: o.hp, floor: o.floor || 0, vx: o.vx | 0, vy: o.vy | 0 };
      if (o.z) e.z = Math.round(o.z);
      if (o.isDown) e.isDown = 1;
      if (isNew) { e.name = o.name; e.color = o.color; e.maxHp = o.maxHp; e.tribeName = o.tribeName || null; }
      return e;
    }
    // Phase 14.38: mob facing — vx/vy 포함. 14.49-d: floor + z
    const e = { mid: o.mid, x: o.x, y: o.y, hp: o.hp, vx: (o.vx || 0) | 0, vy: (o.vy || 0) | 0, floor: o.floor || 0 };
    if (o.z) e.z = Math.round(o.z);
    if (isNew) { e.type = o.type; e.maxHp = o.maxHp; e.tameOwner = o.tameOwner || null; e.tameOwnerName = o.tameOwnerName || null; }
    return e;
  }
  function visiblePlayers(vx, vy, selfPid, viewerState) {
    const nearby = qtPlayers.queryCircle(vx, vy, AOI_RADIUS);
    const prevSeen = viewerState.seenPlayers;
    const newSeen = new Set();
    const result = [];
    for (const o of nearby) {
      if (o.handingOff) continue; // 14.47: 핸드오프 중인 player는 다른 viewer에게도 안 보냄
      newSeen.add(o.pid);
      result.push(makeEntry(o, !prevSeen.has(o.pid), 'player'));
    }
    if (selfPid && !newSeen.has(selfPid)) {
      const self = players.get(selfPid);
      if (self && !self.handingOff) { newSeen.add(selfPid); result.push(makeEntry(self, !prevSeen.has(selfPid), 'player')); }
    }
    viewerState.seenPlayers = newSeen;
    return result;
  }
  function visibleMobs(vx, vy, viewerState) {
    const nearby = qtMobs.queryCircle(vx, vy, AOI_RADIUS);
    const prevSeen = viewerState.seenMobs;
    const newSeen = new Set();
    const result = [];
    for (const m of nearby) {
      newSeen.add(m.mid);
      result.push(makeEntry(m, !prevSeen.has(m.mid), 'mob'));
    }
    viewerState.seenMobs = newSeen;
    return result;
  }
  for (const p of allPlayers) {
    if (p.isNpc) continue;  // NPC는 클라(ws) 없음 — 시야계산(queryCircle)·tick 송신 불필요. 600 NPC × queryCircle 핫스팟 제거 (러버밴딩 주원인)
    if (!p.viewerState) p.viewerState = { seenPlayers: new Set(), seenMobs: new Set() };
    // 14.47: 핸드오프 중인 player에겐 tick 보내지 않음.
    //  이유: 클라가 이미 새 zone으로 넘어가서 myPid가 새 pid로 바뀌었는데,
    //  옛 zone이 tick에 옛 pid를 포함하면 클라가 "다른 플레이어"로 인식 → name 없어서 '?' 표시됨.
    if (p.handingOff) continue;
    send(p.ws, {
      type: 'tick', t: now,
      players: visiblePlayers(p.x, p.y, p.pid, p.viewerState),
      mobs: visibleMobs(p.x, p.y, p.viewerState),
      // 14.49-c: 계단 위에서의 본인 z (0~32). 매 tick 보내야 부드럽게 lerp 보임.
      selfZ: p.z || 0,
      // 클라 리컨실리에이션: 마지막으로 처리한 입력 seq. 클라가 이 seq 이하 입력을 drop하고 나머지만 replay.
      ackSeq: p.lastInputSeq || 0,
    });
  }
  for (const [ws, data] of observers) {
    if (!data.viewerState) data.viewerState = { seenPlayers: new Set(), seenMobs: new Set() };
    send(ws, {
      type: 'tick', t: now,
      players: visiblePlayers(data.viewerX, data.viewerY, null, data.viewerState),
      mobs: visibleMobs(data.viewerX, data.viewerY, data.viewerState),
    });
  }
  { const _td = Date.now() - now; global._tt = (global._tt||0)+_td; global._tn = (global._tn||0)+1; if (_td > (global._tmx||0)) global._tmx = _td; }
}, TICK_MS);

// Phase 5-I: 이웃 zone에 ghost 스냅샷 주기 송신 (10Hz — 경계 전투 표적 위치 공유)
setInterval(() => { try { syncGhostsToNeighbors(); } catch (e) {} }, 100);

// 진단: 자원·활성 규모 (러버밴딩 원인 = qtResources 재구축 비용 확인용). 10초마다, 사람/observer 있을 때만.
setInterval(() => {
  let hasH = false; for (const p of players.values()) { if (!p.isNpc) { hasH = true; break; } }
  if (!hasH && observers.size === 0) return;
  let act = 0; for (const pid of npcs) { const n = players.get(pid); if (n && isPositionActive(n.x, n.y)) act++; }
  // 송신버퍼 — 사람 player의 ws.bufferedAmount(보낼 대기 바이트). 크면 서버가 클라보다 빨리 보내 막힌 것.
  let maxBuf = 0, sumOut = 0; for (const p of players.values()) { if (!p.isNpc && p.ws) { const ba = p.ws.bufferedAmount || 0; if (ba > maxBuf) maxBuf = ba; sumOut += ba; } }
  console.log(`[${ZONE_ID}] diag tick_avg=${global._tn?(global._tt/global._tn).toFixed(1):0}ms tick_max=${global._tmx||0}ms sendBuf=${(maxBuf/1024).toFixed(0)}KB | bld=${buildings.size} res=${resources.size} npc=${npcs.size}/act${act} mob=${mobs.size} claims=${claims.size}`);
  global._tt = 0; global._tn = 0; global._tmx = 0;
}, 10000);

// === 핸드오프 fire (HTTP POST + 토큰 발급) ===
async function fireHandoff(player, targetZoneId, newX, newY) {
  if (player.handingOff) return;
  if (player.lastHandoffFailAt && Date.now() - player.lastHandoffFailAt < 2000) return;
  // 핸드오프 시점의 vx/vy를 새 zone에 그대로 전달 — 새 zone에서 즉시 이어 이동
  // 그래야 클라가 새 ws OPEN하고 input 보내기까지의 갭에도 player가 멈추지 않음
  let carryVx = player.vx;
  let carryVy = player.vy;
  const target = ZONES[targetZoneId];
  if (!target) { player.handingOff = false; return; }
  // 핑퐁 방지: 막 넘어온 경계 쪽으로 향하는 속도 성분 제거 (도착 직후 즉시 되넘김 차단).
  const HM = 64;
  if (newX <= HM + 1 && carryVx < 0) carryVx = 0;                       // 서쪽 경계 진입 + 서쪽 속도
  if (newX >= target.zoneWidth - HM - 1 && carryVx > 0) carryVx = 0;    // 동쪽 경계 진입 + 동쪽 속도
  if (newY <= HM + 1 && carryVy < 0) carryVy = 0;                       // 북쪽
  if (newY >= target.zoneHeight - HM - 1 && carryVy > 0) carryVy = 0;   // 남쪽
  player.handingOff = true;
  player.vx = 0;
  player.vy = 0;
  player.x = Math.max(0, Math.min(ZONE.zoneWidth, player.x));
  player.y = Math.max(0, Math.min(ZONE.zoneHeight, player.y));
  savePlayer(player, { last_zone: targetZoneId, last_x: newX, last_y: newY });
  const token = generateToken();
  try {
    await postJSON(target.host, target.port, '/handoff_prepare', {
      token,
      source_zone: ZONE_ID,
      player_id: player.playerId,
      name: player.name,
      color: player.color,
      x: newX, y: newY,
      vx: carryVx, vy: carryVy,   // ★ 핸드오프 시점의 속도 보존
      inventory: player.inventory,
      tools: player.tools,
      equipped: player.equipped,
      hunger: Math.round(player.hunger ?? HUNGER_MAX),
      thirst: Math.round(player.thirst ?? THIRST_MAX),
      vp: Math.round(player.vp ?? 0),
      tribeId: player.tribeId || null,
      tribeName: player.tribeName || null,
      pvpEnabled: !!player.pvpEnabled,
      floor: player.floor || 0,
      // 14.42-a: home carryover (cross-zone에서도 home 유지)
      home_zone: player._homeZone || null,
      home_x: typeof player._homeX === 'number' ? player._homeX : null,
      home_y: typeof player._homeY === 'number' ? player._homeY : null,
    });
  } catch (e) {
    console.error(`[${ZONE_ID}] handoff_prepare → ${targetZoneId} 실패:`, e.message);
    player.handingOff = false;
    player.lastHandoffFailAt = Date.now();
    return;
  }
  send(player.ws, { type: 'handoff', targetZone: targetZoneId, token });
  console.log(`[${ZONE_ID}] ⇒ handoff ${player.name} (${player.pid}) → ${targetZoneId} token=${token.slice(0,8)}`);

  // ACK 대기 — 도착하면 즉시 정리. 못 받으면 3초 후 fallback 정리.
  const pid = player.pid;
  const timeoutHandle = setTimeout(() => {
    if (outgoingHandoffs.has(token)) {
      outgoingHandoffs.delete(token);
      metrics.handoff_timeouts++;
      const p = players.get(pid);
      if (p) {
        players.delete(pid);
        broadcast({ type: 'player_left', pid });
        try { p.ws.close(); } catch (e) {}
        console.warn(`[${ZONE_ID}] ⚠ ACK timeout token=${token.slice(0,8)} — fallback 정리`);
      }
    }
  }, 3000);
  outgoingHandoffs.set(token, { pid, timeoutHandle });
  metrics.handoffs_out++;
}

const https = require('https');
function postJSON(host, port, path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    // 프로덕션(fly 등)에선 HTTPS로 zone↔zone. HTTP_PROTO=https 일 때 https, port 443 자동.
    const useHttps = (process.env.HTTP_PROTO === 'https') || port === 443;
    const proto = useHttps ? https : http;
    const realPort = useHttps && port === 3001 ? 443 :  // 로컬 dev 포트가 들어와도 https면 443으로 강제
                     useHttps ? 443 : port;
    const req = proto.request({
      hostname: host, port: useHttps ? 443 : port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
    req.write(body); req.end();
  });
}

// === 유틸 ===
function rawSend(ws, str) {
  if (!ws) return; // NPC는 ws=null
  try { if (ws.readyState === WebSocket.OPEN) ws.send(str); } catch (e) {}
}
function send(ws, obj) {
  const str = JSON.stringify(obj);
  if (LATENCY_MS > 0) setTimeout(() => rawSend(ws, str), LATENCY_MS);
  else rawSend(ws, str);
}
function broadcast(obj) {
  const str = JSON.stringify(obj);
  const doSend = () => {
    for (const p of players.values()) rawSend(p.ws, str);
    for (const ws of observers.keys()) rawSend(ws, str);
  };
  if (LATENCY_MS > 0) setTimeout(doSend, LATENCY_MS);
  else doSend();
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function zonePublicMeta() {
  return {
    id: ZONE_ID,
    displayName: ZONE.displayName,
    biome: ZONE.biome,
    groundColor: ZONE.groundColor,
    tintColor: ZONE.tintColor,
    width: ZONE.zoneWidth,
    height: ZONE.zoneHeight,
    tileSize: WORLD.tileSize,
    worldOffsetX: ZONE.worldOffsetX,
    worldOffsetY: ZONE.worldOffsetY,
    isOcean: !!ZONE.isOcean,
    mainSquare: ZONE.mainSquare || null,
    // Phase 5-C: 마을 list (이름·좌표·type) — 클라가 미니맵 등에 표시
    villages: VILLAGES.map(v => ({ name: v.name, x: v.x, y: v.y, type: v.type || 'plain' })),
  };
}

server.listen(PORT, () => {
  console.log(`[${ZONE_ID}] 🌏 zone server up on :${PORT}  latency=${LATENCY_MS}ms (RTT≈${LATENCY_MS*2}ms)`);
  console.log(`        biome=${ZONE.biome}  rect=(${ZONE.worldOffsetX},${ZONE.worldOffsetY},${ZONE.zoneWidth}x${ZONE.zoneHeight})  neighbors=W:${NEIGHBOR.hasWest?'✓':'∅'} E:${NEIGHBOR.hasEast?'✓':'∅'} N:${NEIGHBOR.hasNorth?'✓':'∅'} S:${NEIGHBOR.hasSouth?'✓':'∅'}`);
});

// === Graceful shutdown — 종료 직전 모든 mob/플레이어 상태 flush ===
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${ZONE_ID}] ${signal} 받음 — 상태 flush 후 종료...`);
  try {
    let mobsSaved = 0;
    for (const m of mobs.values()) {
      if (m.dbId) {
        try { db.updateMobState(m.dbId, m.x, m.y, m.hp); mobsSaved++; } catch (e) {}
      }
    }
    let playersSaved = 0;
    for (const p of players.values()) {
      if (!p.playerId || p.playerId.startsWith('anon_')) continue;
      // fire-and-forget — process.exit가 곧 따라오니 응답 못 받을 수도 있음
      savePlayer(p, { last_zone: ZONE_ID, last_x: p.x, last_y: p.y });
      playersSaved++;
    }
    console.log(`[${ZONE_ID}] flush 완료: mob ${mobsSaved}, player ${playersSaved} (central에 전송)`);
  } catch (e) {
    console.error(`[${ZONE_ID}] shutdown flush 에러:`, e.message);
  }
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// =============================================================================
// Phase 4b: Canadia 시뮬 통합 prototype — chest + 사유지만 (NPC 다음 단계)
// =============================================================================
if (ZONE_ID === 'canadia') {
  setTimeout(() => initCanadiaPrototype().catch(e => console.error('[canadia] init 실패:', e.message, e.stack)), 5000);
}

const canadiaState = {
  villages: [],
  chestByVillage: new Map(),  // villageName → chest id
  setupDone: new Set(),       // villageName 셋업 완료된 마을
  houses: new Map(),          // Phase 4d-18: villageName → House[]
  //   House = { slotIdx, cx, cy (cell 중심), entranceX, entranceY, floors, residents: Set<pid>, buildingIds: [bId, ...] }
};

// ── Phase 4d-18-A: 거주 zone 슬롯 grid ─────────────────────────────────
// 마을 중심 좌표 기준 cell offset. 5x5 집 + 1 cell gap = 6 cells 단위.
// 4x4 grid - 광장 1칸 제외 = 15 집 슬롯.
const HOUSE_FLOOR_CAPACITY = 6;        // 1층당 거주 NPC 수
const HOUSE_SLOT_SPACING_CELLS = 6;    // 슬롯 간 cell 간격 (5x5 집 + 1 gap)
const HOUSE_CENTER_SLOT = 5;           // 4x4 grid의 (1,1) 슬롯 = 마을 광장
const VILLAGE_HOUSE_SLOTS = (() => {
  const slots = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    // cell offset: -2,-2 ~ +1,+1 (4x4 grid 중심을 마을 중심에)
    const dx = (i - 1.5) * HOUSE_SLOT_SPACING_CELLS;
    const dy = (j - 1.5) * HOUSE_SLOT_SPACING_CELLS;
    slots.push({ idx: j * 4 + i, dxCells: dx, dyCells: dy });
  }
  return slots;
})();

async function initCanadiaPrototype() {
  console.log(`[canadia] Phase 4b init 시작`);
  // 1) 옛 마을 chest + claim wipe (이전 run에서 만든 거)
  try {
    const cRes = db.db.prepare("DELETE FROM claims WHERE owner_id LIKE 'village_%'").run();
    const bRes = db.db.prepare("DELETE FROM buildings WHERE owner_id LIKE 'village_%'").run();
    if (cRes.changes || bRes.changes) {
      console.log(`[canadia] wipe: 옛 마을 claim ${cRes.changes}, building ${bRes.changes}`);
    }
  } catch (e) { console.warn(`[canadia] wipe error:`, e.message); }
  // 메모리에서도 제거
  for (const [id, c] of [...claims]) {
    if (c.ownerPid?.startsWith('village_')) { claims.delete(id); broadcast({ type: 'claim_removed', id }); }
  }
  for (const [id, b] of [...buildings]) {
    if (b.ownerId?.startsWith('village_')) {
      buildings.delete(id);
      if (chunkManager && chunkManager.removeBuilding) chunkManager.removeBuilding(b);
      broadcast({ type: 'building_removed', id });
    }
  }
  // Phase 4d-18-F: 메모리 캐시 reset (재시작 시 옛 house 데이터 초기화)
  canadiaState.houses.clear();
  stairCellDirty = true;  // stair cache 무효화
  // 2) 첫 sync
  await syncCanadiaEconomy();
  // Phase 4d-18-D: 영토 + 거주 집 즉시 sync (NPC spawn 직후 집 build 보장)
  try { syncCanadiaTerritories(); } catch (e) { console.error('[canadia] 초기 territory sync 실패:', e.message); }
  // NPC들 이번에 build된 집에 배정 (spawn 시점엔 집 없었음)
  for (const village of canadiaState.villages) {
    const set = canadiaNpcsByVillage.get(village.name);
    if (!set) continue;
    for (const pid of set) {
      const p = players.get(pid);
      if (p && p.canadiaHouseSlot == null) assignNpcToHouse(village.name, p);
    }
  }
  // 3) 매 1초마다 sync — 상인 NPC가 caravan 위치 따라 부드럽게 텔레포트 (5일=5초)
  setInterval(() => syncCanadiaEconomy().catch(e => console.error('[canadia] sync 실패:', e.message)), 1000);
  // 4) 매 30초마다 영토 sync — 시뮬 size 변화에 따라 zone claim cell 추가 (Phase 4d-15)
  setInterval(() => { try { syncCanadiaTerritories(); } catch (e) { console.error('[canadia] territory sync 실패:', e.message); } }, 30000);
  // 5) 매 20초마다 농지 stage cycle (씨→자람→익음→수확→씨)
  setInterval(() => { try { tickFarmlandStages(); } catch (e) { console.error('[canadia] farm stage 실패:', e.message); } }, 20000);
}

// Phase 4d-16-d: 농지 stage 사이클. 4단계 반복 — 0(씨) → 1(어린싹) → 2(자람) → 3(익음) → 0 (수확 후 재파종)
function tickFarmlandStages() {
  let updated = 0;
  for (const c of claims.values()) {
    if (c.facilityType !== 'farmland') continue;
    c.farmStage = ((c.farmStage || 0) + 1) % 4;
    broadcast({ type: 'claim_updated', claim: c });
    updated++;
  }
  if (updated > 0 && Math.random() < 0.1) {
    // 가끔만 로그 (노이즈 축소)
    console.log(`[canadia] 🌾 farmland stage cycle: ${updated} cells`);
  }
}

// Phase 4d-15: 시뮬 v.land.size → zone claim cells 동기화.
//   초기 size 49~78 → 12 cell 반경 (≈ 452 cells). 매핑: cells = size × 8 (안전 cap 1500).
//   매 30초마다 부족분만큼 외곽 cell 추가 (이미 있는 거 유지).
function syncCanadiaTerritories() {
  if (!canadiaState.villages.length) return;
  const SZ = BUILDING_SIZE;
  // ── 거주 zone 반경 (cell 단위) ────────────────────────────────────
  // 4x4 slot grid × 6 cells = 24x24 cells. 중심 ±12 cell.
  const INNER_HALF = 12;   // 거주 zone half-width (cells)
  // ── 외곽 영토 (시뮬 size 따라 확장) ──────────────────────────────
  const CELLS_PER_SIZE = 8;
  const MAX_RADIUS = 22;   // 외곽 최대 반경 (cells). 마을 간 거리 1500/32 ≈ 46 → 절반 미만 안전.

  for (const village of canadiaState.villages) {
    const guildId = `village_${village.name}`;
    const cx = village.coord.x, cy = village.coord.y;
    const cellCx = Math.round(cx / SZ), cellCy = Math.round(cy / SZ);

    // 현재 이 마을의 cell key set
    const usedKeys = new Set();
    for (const c of claims.values()) {
      if (c.ownerPid !== guildId) continue;
      usedKeys.add(`${Math.floor(c.x / SZ)},${Math.floor(c.y / SZ)}`);
    }

    function addClaim(gx, gy, facilityType) {
      const key = `${gx},${gy}`;
      if (usedKeys.has(key)) return false;
      const claim = {
        id: `c${nextClaimId++}`,
        ownerPid: guildId,
        ownerName: `${village.name} 영토`,
        x: gx * SZ, y: gy * SZ, w: SZ, h: SZ, kind: 'guild',
        guildTribeName: village.name,
        createdAt: Date.now(),
      };
      if (facilityType) claim.facilityType = facilityType;
      if (facilityType === 'farmland') claim.farmStage = Math.floor(Math.random() * 4);
      claims.set(claim.id, claim);
      usedKeys.add(key);
      broadcast({ type: 'claim_added', claim });
      return true;
    }

    // ── (1) 거주 zone — 항상 채워짐 (집·광장·작업장) ──────────────
    let innerAdded = 0;
    for (let dx = -INNER_HALF; dx <= INNER_HALF; dx++) {
      for (let dy = -INNER_HALF; dy <= INNER_HALF; dy++) {
        if (addClaim(cellCx + dx, cellCy + dy, null)) innerAdded++;
      }
    }

    // ── (2) 외곽 ring — size 따라 확장. default = farmland ──────
    const simSize = (village.land && village.land.size) || 49;
    const outerRadius = Math.min(MAX_RADIUS, Math.ceil(INNER_HALF + Math.sqrt(simSize * CELLS_PER_SIZE / Math.PI)));
    let outerAdded = 0;
    for (let dx = -outerRadius; dx <= outerRadius; dx++) {
      for (let dy = -outerRadius; dy <= outerRadius; dy++) {
        if (Math.abs(dx) <= INNER_HALF && Math.abs(dy) <= INNER_HALF) continue;  // inner skip
        if (Math.hypot(dx, dy) > outerRadius) continue;  // circular
        // 모서리 cluster: forge (북서 모서리), hide_rack (남동 모서리)
        let ft = 'farmland';
        if (dx < -outerRadius + 3 && dy < -outerRadius + 3) ft = 'forge';
        else if (dx > outerRadius - 3 && dy > outerRadius - 3) ft = 'hide_rack';
        if (addClaim(cellCx + dx, cellCy + dy, ft)) outerAdded++;
      }
    }
    if (innerAdded + outerAdded > 0) {
      console.log(`[canadia] 🏗️ ${village.name} 영토: inner +${innerAdded}, outer +${outerAdded} (size ${simSize}, R ${outerRadius})`);
    }

    // ── (3) 인구 vs capacity → 집 build / extend ────────────────────
    if (!canadiaState.houses.has(village.name)) canadiaState.houses.set(village.name, []);
    const houses = canadiaState.houses.get(village.name);
    const pop = village.pop || 0;
    const capacity = houses.reduce((s, h) => s + h.floors * HOUSE_FLOOR_CAPACITY, 0);
    let deficit = pop - capacity;
    let built = 0, extended = 0;
    while (deficit > 0) {
      // 빈 슬롯 있으면 새 1층 집
      const occupied = new Set(houses.map(h => h.slotIdx));
      const freeSlot = VILLAGE_HOUSE_SLOTS.find(s => s.idx !== HOUSE_CENTER_SLOT && !occupied.has(s.idx));
      if (freeSlot) {
        const h = buildHouseAt(village, freeSlot);
        houses.push(h);
        built++;
        deficit -= HOUSE_FLOOR_CAPACITY;
      } else {
        // 모든 슬롯 차 있음 → 가장 낮은 집 증축
        houses.sort((a, b) => a.floors - b.floors);
        extendHouse(village, houses[0]);
        extended++;
        deficit -= HOUSE_FLOOR_CAPACITY;
      }
      if (built + extended >= 10) break;  // 한 번에 너무 많이 build 방지
    }
    if (built + extended > 0) {
      const totalFloors = houses.reduce((s, h) => s + h.floors, 0);
      console.log(`[canadia] 🏠 ${village.name} 집: 신축 ${built}, 증축 ${extended}, total ${houses.length}채/${totalFloors}층 (pop ${pop}, cap ${houses.reduce((s, h) => s + h.floors * HOUSE_FLOOR_CAPACITY, 0)})`);
    }
  }
}

// ── Phase 4d-18-B: 마을 거주 집 build / extend ──────────────────────────
// 5x5 cell PZ식 집 (둘레 wall + floor + stair).
// 마을 단위 ownerId = `village_${village.name}_house_${slotIdx}`.
// 시각만 — NPC 거주는 House.residents 매핑으로.
function _addBuildingForHouse(ownerId, ownerName, x, y, type, dataExtra, floor, house) {
  const data = { ...dataExtra, floor };
  const dbId = db.insertBuilding({
    type, owner_id: ownerId, owner_name: ownerName,
    x, y, data: JSON.stringify(data),
  });
  const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 (house.buildingIds 참조도 재활성 후 유효)
  const building = { id, dbId, type, ownerId, ownerName, x, y, data, floor };
  buildings.set(id, building);
  chunkManager.insertBuilding(building);
  if (type === 'stair') stairCellDirty = true;
  broadcast({ type: 'building_added', building });
  if (house) house.buildingIds.push(id);
}
function _buildHouseFloor(house, ownerId, ownerName, floor) {
  // 5x5 cell 영역. cell 범위 (cx-2, cy-2) ~ (cx+2, cy+2). 동쪽 변에 계단.
  const cx = house.cx, cy = house.cy;
  const SZ = BUILDING_SIZE;
  // 외곽 wall — 북·남·동·서 변. 0F만 남쪽 가운데 입구.
  for (let i = -2; i <= 2; i++) {
    _addBuildingForHouse(ownerId, ownerName, (cx + i) * SZ, (cy - 2) * SZ, 'wall', { side: 'N' }, floor, house);
  }
  for (let i = -2; i <= 2; i++) {
    if (floor === 0 && i === 0) continue;  // 1층 입구
    _addBuildingForHouse(ownerId, ownerName, (cx + i) * SZ, (cy + 3) * SZ, 'wall', { side: 'N' }, floor, house);
  }
  for (let j = -2; j <= 2; j++) {
    _addBuildingForHouse(ownerId, ownerName, (cx + 2) * SZ, (cy + j) * SZ, 'wall', { side: 'E' }, floor, house);
  }
  for (let j = -2; j <= 2; j++) {
    _addBuildingForHouse(ownerId, ownerName, (cx - 3) * SZ, (cy + j) * SZ, 'wall', { side: 'E' }, floor, house);
  }
  // 바닥 — 5x5. 단 2층(floor=1)일 때만 stair cell 3개 비움 (계단 위로 올라가는 공간).
  const stairCells = new Set([
    `${cx + 2}_${cy + 1}`, `${cx + 2}_${cy}`, `${cx + 2}_${cy - 1}`,
  ]);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    if (floor === 1 && stairCells.has(`${cx + i}_${cy + j}`)) continue;
    _addBuildingForHouse(ownerId, ownerName,
      (cx + i) * SZ + SZ / 2, (cy + j) * SZ + SZ / 2,
      'floor', {}, floor, house);
  }
  // 계단 — 이 floor에서 다음 floor로 올라가는. 0F → 1F, 1F → 2F, ...
  // 동쪽 벽 옆, dir='N' (남쪽 입장→북쪽 진행).
  _addBuildingForHouse(ownerId, ownerName,
    (cx + 2) * SZ + SZ / 2, (cy + 1) * SZ + SZ / 2,
    'stair', { dir: 'N' }, floor, house);
}
// 새 집 1층 build.
function buildHouseAt(village, slot) {
  const ownerId = `village_${village.name}_house_${slot.idx}`;
  const ownerName = `${village.name} 가옥 ${slot.idx + 1}`;
  // 마을 좌표 → cell 좌표. slot offset 적용.
  const cx = Math.round(village.coord.x / BUILDING_SIZE) + Math.round(slot.dxCells);
  const cy = Math.round(village.coord.y / BUILDING_SIZE) + Math.round(slot.dyCells);
  const house = {
    slotIdx: slot.idx, cx, cy,
    entranceX: (cx) * BUILDING_SIZE + BUILDING_SIZE / 2,  // 1층 입구 (남쪽 가운데, cell cy+3의 wall 안쪽)
    entranceY: (cy + 2) * BUILDING_SIZE + BUILDING_SIZE / 2,
    floors: 1,
    residents: new Set(),
    buildingIds: [],
    ownerId,
  };
  _buildHouseFloor(house, ownerId, ownerName, 0);
  return house;
}
// 기존 집에 위층 1개 추가 (floors → floors+1).
function extendHouse(village, house) {
  const ownerName = `${village.name} 가옥 ${house.slotIdx + 1}`;
  _buildHouseFloor(house, house.ownerId, ownerName, house.floors);
  house.floors++;
  return house;
}
// NPC를 마을 집 중 가장 한산한 곳(residents 수 최소) 에 배정.
//   집이 아직 없으면 home 없이 둠 (다음 syncCanadiaTerritories에서 build됨).
function assignNpcToHouse(villageName, player) {
  const houses = canadiaState.houses.get(villageName);
  if (!houses || !houses.length) return false;
  // 이미 배정돼있으면 skip
  if (player.canadiaHouseSlot != null) return true;
  // 한산도 = residents.size / capacity
  let best = null, bestRatio = Infinity;
  for (const h of houses) {
    const cap = h.floors * HOUSE_FLOOR_CAPACITY;
    const ratio = h.residents.size / cap;
    if (ratio < bestRatio) { best = h; bestRatio = ratio; }
  }
  if (!best) return false;
  best.residents.add(player.pid);
  player.canadiaHouseSlot = best.slotIdx;
  player.canadiaHomeX = best.entranceX;
  player.canadiaHomeY = best.entranceY;
  return true;
}

// Phase 4d-16-c: 직업 분포 → facility 종류 배열 (마당 cell에 분배)
//   farmer → farmland, hunter → hide_rack, smith류 → forge, merchant → cart, 기타 → workshop
const JOB_TO_FACILITY = {
  farmer: 'farmland', fisher: 'workshop', hunter: 'hide_rack',
  lumberjack: 'workshop', miner: 'workshop', prospector: 'workshop',
  smith: 'forge', weaponsmith: 'forge', armorsmith: 'forge',
  forager: 'workshop', cook: 'kitchen', warrior: 'training',
  merchant: 'cart',
};
function computeFacilityDistribution(jobCounts, totalSlots) {
  // 각 NPC 1명당 3 facility cell 가정. 직업 비율 따라.
  const facilities = [];
  for (const [job, n] of Object.entries(jobCounts)) {
    const f = JOB_TO_FACILITY[job] || 'workshop';
    for (let i = 0; i < n * 3; i++) facilities.push(f);
  }
  // shuffle (마을마다 다양하게 보이도록)
  for (let i = facilities.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [facilities[i], facilities[j]] = [facilities[j], facilities[i]];
  }
  return facilities;
}

const canadiaNpcsByVillage = new Map();  // villageName → Set of pids
// Phase 4d-11: 캐러밴 → NPC 매핑. caravan key (from+to+departDay) → npc pid
const canadiaCaravanNpcs = new Map();
// 현재 활성 caravan key set (이번 polling에서 사라진 caravan = 귀환 완료)
let canadiaActiveCaravans = new Set();

// Phase 4d-13: caravan id 우선 (v2: 재routing 시 to 변경되어도 같은 caravan 추적).
//   id 없으면 fallback (구버전 호환).
function caravanKey(c) { return c.id != null ? `id:${c.id}` : `${c.from}|${c.to}|${c.departDay}`; }

async function syncCanadiaEconomy() {
  const { request: centralRequest } = require('./central-client');
  let data, caravansData;
  try {
    const r = await centralRequest('GET', '/economy/canadia/villages');
    if (r.status !== 200) { console.warn('[canadia] central 응답:', r.status); return; }
    data = r.data;
    const r2 = await centralRequest('GET', '/economy/canadia/caravans');
    if (r2.status === 200) caravansData = r2.data;
  } catch (e) { console.warn('[canadia] fetch 실패:', e.message); return; }
  if (!data || !data.villages) return;
  canadiaState.villages = data.villages;
  for (const village of data.villages) {
    if (!canadiaState.setupDone.has(village.name)) {
      setupCanadiaVillage(village);
      canadiaState.setupDone.add(village.name);
    }
    syncCanadiaNpcs(village);
  }
  // Phase 4d-11: 캐러밴 NPC 처리
  if (caravansData && caravansData.caravans) {
    syncCanadiaCaravans(caravansData.caravans);
  }
}

const NPC_CAP_PER_VILLAGE = Infinity;  // Phase 4d-17: 무제한 (시뮬 인구 그대로 spawn)
const JOB_KR_NPC = { farmer:'농부', fisher:'어부', hunter:'사냥꾼', lumberjack:'벌목꾼', miner:'광부', prospector:'탐사꾼', smith:'대장장이', forager:'채집꾼', cook:'요리사', warrior:'전사', merchant:'상인', weaponsmith:'무공', armorsmith:'갑공' };
// Phase 4d-16-e: 직업별 NPC 색깔 (캐릭터 sprite tint)
const JOB_NPC_COLOR = {
  farmer:     '#8b7d4a',  // 짙은 갈색 (밀짚모자)
  fisher:     '#4a7da0',  // 청회색 (어부)
  hunter:     '#5a6f3c',  // 카키 녹색
  lumberjack: '#7a4f2a',  // 나무 갈색
  miner:      '#6a6a6a',  // 회색
  prospector: '#5a5a7a',  // 진남색
  smith:      '#9a5a2a',  // 구릿빛
  weaponsmith:'#8a4a4a',  // 적갈색 (무기)
  armorsmith: '#5a5a5a',  // 강철
  forager:    '#7a9a5a',  // 연녹색 (채집)
  cook:       '#c8855a',  // 주황
  warrior:    '#aa3030',  // 빨강
  merchant:   '#c8aa3a',  // 황금색 (상인)
};

// Phase 4d-11 재설계: NPC pool = 시뮬 jobs 분포 정확 sync
//   기존 버그: NPC pool이 첫 spawn 시점 분포로 고정. 시뮬 jobs 변경되어도 zone 반영 X
//   새 디자인: 매 호출시 (1) 시뮬 분포에서 cap 비율로 목표 분포 계산
//             (2) 직업별 잉여 NPC 제거 + 부족 NPC spawn
function syncCanadiaNpcs(village) {
  if (!canadiaNpcsByVillage.has(village.name)) canadiaNpcsByVillage.set(village.name, new Set());
  const set = canadiaNpcsByVillage.get(village.name);
  const chestId = canadiaState.chestByVillage.get(village.name);
  const chest = chestId ? buildings.get(chestId) : null;
  if (!chest) return;
  // stale pid cleanup
  for (const pid of [...set]) {
    if (!players.has(pid)) set.delete(pid);
  }
  const N = village.pop || 0;
  if (N === 0) return;
  const targetPop = Math.min(N, NPC_CAP_PER_VILLAGE);
  const jobs = village.jobs || {};
  // 목표 분포: 시뮬 jobs × (cap/N) 비례. 합이 targetPop과 같아야 (반올림 보정).
  const targetByJob = {};
  let sumTarget = 0;
  for (const [j, n] of Object.entries(jobs)) {
    if (n > 0) {
      targetByJob[j] = Math.max(0, Math.round(n * targetPop / N));
      sumTarget += targetByJob[j];
    }
  }
  // 반올림 차이 보정 — 가장 많은 직업에서 ±1
  const sortedJobs = Object.keys(targetByJob).sort((a,b) => targetByJob[b] - targetByJob[a]);
  while (sumTarget < targetPop && sortedJobs.length > 0) { targetByJob[sortedJobs[0]]++; sumTarget++; }
  while (sumTarget > targetPop && sortedJobs.length > 0) {
    const j = sortedJobs.find(x => targetByJob[x] > 0);
    if (!j) break;
    targetByJob[j]--; sumTarget--;
  }
  // 현재 NPC 직업 분포
  const currentByJob = {};
  for (const pid of set) {
    const p = players.get(pid);
    if (p && p.canadiaJob) {
      currentByJob[p.canadiaJob] = (currentByJob[p.canadiaJob] || 0) + 1;
    }
  }
  // 잉여 직업 NPC 제거 (currentByJob > targetByJob) — 단 traveling NPC는 보호
  for (const [j, cnt] of Object.entries(currentByJob)) {
    const target = targetByJob[j] || 0;
    let surplus = cnt - target;
    if (surplus <= 0) continue;
    for (const pid of [...set]) {
      if (surplus <= 0) break;
      const p = players.get(pid);
      if (p && p.canadiaJob === j && p.canadiaTask !== 'traveling') {
        // Phase 4d-18-D: 집 resident에서도 제거
        if (p.canadiaHouseSlot != null) {
          const houses = canadiaState.houses.get(village.name);
          if (houses) {
            const h = houses.find(hh => hh.slotIdx === p.canadiaHouseSlot);
            if (h) h.residents.delete(pid);
          }
        }
        set.delete(pid);
        players.delete(pid);
        npcs.delete(pid);
        broadcast({ type: 'player_left', pid });
        surplus--;
      }
    }
  }
  // 부족 직업 spawn (targetByJob > currentByJob)
  for (const [j, target] of Object.entries(targetByJob)) {
    const cur = (currentByJob[j] || 0);
    let need = target - cur;
    if (need <= 0) continue;
    for (let k = 0; k < need; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 100;
      const sx = chest.x + Math.cos(ang) * r;
      const sy = chest.y + Math.sin(ang) * r;
      const player = spawnNpc({
        x: sx, y: sy,
        villageName: village.name,
        villageId: `canadia_${village.name}`,
        skipHouse: true,
      });
      if (!player) break;
      player.canadiaVillage = village.name;
      player.canadiaJob = j;
      player.canadiaChestX = chest.x;
      player.canadiaChestY = chest.y;
      player.color = JOB_NPC_COLOR[j] || '#888';  // Phase 4d-16-e: 직업별 색깔
      if (player.name && !player.name.includes('[')) {
        player.name = `${player.name}[${JOB_KR_NPC[j]||j}]`;
      }
      // Phase 4d-18-D: NPC를 마을 집의 resident로 등록 (빈 자리 우선 적은 집부터)
      assignNpcToHouse(village.name, player);
      assignCanadiaWorkArea(player);
      player.canadiaTask = 'going_to_work';
      player.canadiaTaskAt = Date.now();
      player.canadiaTaskEndAt = 0;
      set.add(player.pid);
    }
  }
}

// Phase 4d-11: 캐러밴 = NPC 직접 이동.
//   시뮬 caravan 객체 보고 → from 마을 NPC 1명 골라 traveling state로
//   매 polling에서 caravan.x/y 좌표를 NPC 목적지로 update
//   caravan 사라지면 (귀환 완료) NPC를 자기 마을로 복귀시킴
function syncCanadiaCaravans(caravans) {
  const newActive = new Set();
  for (const c of caravans) {
    const key = caravanKey(c);
    newActive.add(key);
    let pid = canadiaCaravanNpcs.get(key);
    let npc = pid ? players.get(pid) : null;
    if (!npc) {
      // 새 caravan — merchant 또는 warrior(호위)만 허용. 농부·사냥꾼 등은 자기 일.
      const fromSet = canadiaNpcsByVillage.get(c.from);
      if (!fromSet) continue;
      let chosen = null;
      for (const tryJob of ['merchant', 'warrior']) {
        for (const p2id of fromSet) {
          const p = players.get(p2id);
          if (p && p.canadiaJob === tryJob && p.canadiaTask !== 'traveling') {
            chosen = p; break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) continue;  // merchant·warrior 없으면 시각상 caravan X (시뮬은 그대로)
      npc = chosen;
      canadiaCaravanNpcs.set(key, npc.pid);
    }
    // Phase 4d-14b: NPC가 caravan 종점(toX/toY) 향해 직진. 속도 = 시뮬 phase 속도 = 거리/시간.
    //   caravan 좌표 보간은 시뮬용. NPC는 끝점만 향해 → 도착 전 거꾸로 X.
    npc.canadiaTask = 'traveling';
    npc.canadiaTaskAt = Date.now();
    npc.canadiaTaskEndAt = 0;
    npc.targetX = c.toX != null ? c.toX : c.x;   // 이 phase의 종점 (outbound 도착지·inbound 출발지)
    npc.targetY = c.toY != null ? c.toY : c.y;
    npc.canadiaCaravanSpeed = c.npcSpeed || 500; // px/sec — 시뮬과 동기화
    npc.canadiaCaravanKey = key;
  }
  // 사라진 caravan = 귀환 완료 → NPC 자기 마을 복귀
  for (const [key, pid] of [...canadiaCaravanNpcs]) {
    if (!newActive.has(key)) {
      const npc = players.get(pid);
      if (npc) {
        npc.canadiaTask = 'going_to_work';
        npc.canadiaTaskAt = Date.now();
        npc.canadiaTaskEndAt = 0;
        npc.canadiaCaravanKey = null;
        assignCanadiaWorkArea(npc);
      }
      canadiaCaravanNpcs.delete(key);
    }
  }
  canadiaActiveCaravans = newActive;
}

// 직업별 work area — 거래소 chest 기준 방향/거리
const JOB_WORK_OFFSET = {
  farmer:     { angle: 0,                  dist: 280, label: '농지' },
  fisher:     { angle: Math.PI * 0.5,      dist: 280, label: '낚시터' },
  hunter:     { angle: Math.PI,            dist: 280, label: '사냥터' },
  forager:    { angle: Math.PI * 1.5,      dist: 280, label: '채집장' },
  lumberjack: { angle: Math.PI * 0.25,     dist: 280, label: '벌목장' },
  miner:      { angle: Math.PI * 0.75,     dist: 280, label: '광산' },
  prospector: { angle: Math.PI * 1.25,     dist: 280, label: '광맥' },
  smith:      { angle: Math.PI * 1.75,     dist: 100, label: '대장간' },
  cook:       { angle: Math.PI * 0.125,    dist: 100, label: '주방' },
  // merchant: 거래소 자체에 머무름 (캐러밴으로 떠나기 전 대기). 별도 작업장 X.
  merchant:   { angle: 0,                  dist: 20,  label: '거래소' },
  warrior:    { angle: Math.PI * 1.625,    dist: 100, label: '훈련장' },
};
// Phase 5-F: zone terrain의 가장 가까운 cluster 찾기 (ore/forest/water)
function _findNearestTerrainCluster(zoneId, mx, my, kind) {
  const t = _terrain.ZONE_TERRAIN[zoneId];
  if (!t) return null;
  let list, getCenter;
  if (kind === 'ore') { list = t.ores || []; getCenter = c => c.center; }
  else if (kind === 'forest') { list = t.forests || []; getCenter = c => c.rect ? [(c.rect[0]+c.rect[2])/2, (c.rect[1]+c.rect[3])/2] : (c.center || [0, 0]); }
  else if (kind === 'water') {
    // 호수 또는 강 path 첫 point. 가장 가까운 것
    list = [];
    for (const lk of (t.lakes || [])) {
      const c = lk.center || (lk.circles && lk.circles[0]?.center);
      if (c) list.push({ center: c });
    }
    for (const rv of (t.rivers || [])) {
      if (rv.path && rv.path[Math.floor(rv.path.length/2)]) {
        const mid = rv.path[Math.floor(rv.path.length/2)].pos;
        list.push({ center: mid });
      }
    }
    getCenter = c => c.center;
  }
  else { return null; }
  let best = null, bestD = Infinity;
  for (const c of list) {
    const ctr = getCenter(c);
    const d = Math.hypot(mx - ctr[0], my - ctr[1]);
    if (d < bestD) { bestD = d; best = { x: ctr[0], y: ctr[1] }; }
  }
  return best;
}

function assignCanadiaWorkArea(npc) {
  // Phase 5-F: 직업별 cluster 출퇴근. 마을 위치 기준 가장 가까운 곳.
  // canadiaChestX/Y = 마을 광장 좌표 (NPC 마을). 그걸 기준.
  const villX = npc.canadiaChestX || npc.canadiaHomeX || npc.x;
  const villY = npc.canadiaChestY || npc.canadiaHomeY || npc.y;
  const job = npc.canadiaJob;
  let target = null;

  if (job === 'miner' || job === 'prospector') {
    target = _findNearestTerrainCluster(ZONE_ID, villX, villY, 'ore');
  } else if (job === 'lumberjack') {
    target = _findNearestTerrainCluster(ZONE_ID, villX, villY, 'forest');
  } else if (job === 'forager') {
    target = _findNearestTerrainCluster(ZONE_ID, villX, villY, 'forest');
  } else if (job === 'fisher') {
    target = _findNearestTerrainCluster(ZONE_ID, villX, villY, 'water');
  } else if (job === 'hunter') {
    // 사냥꾼 — 가까운 forest 또는 zone 무작위 지점
    target = _findNearestTerrainCluster(ZONE_ID, villX, villY, 'forest');
    if (target) {
      // forest 바깥쪽 (사냥감 spawn 가능 지역)
      target.x += (Math.random() - 0.5) * 600;
      target.y += (Math.random() - 0.5) * 600;
    }
  }
  // farmer/cook/smith/warrior/merchant — 마을 안에서 작업 (집·광장)
  if (target) {
    npc.canadiaWorkX = target.x + (Math.random() - 0.5) * 200;
    npc.canadiaWorkY = target.y + (Math.random() - 0.5) * 200;
    return;
  }
  // 4d-16-b 옛 동작: home 있으면 집 옆
  if (npc.canadiaHomeX != null && npc.canadiaHomeY != null) {
    npc.canadiaWorkX = npc.canadiaHomeX + (Math.random() - 0.5) * 80;
    npc.canadiaWorkY = npc.canadiaHomeY + (Math.random() - 0.5) * 80;
    return;
  }
  // 마지막 fallback — 직업별 거래소 offset
  const off = JOB_WORK_OFFSET[npc.canadiaJob] || JOB_WORK_OFFSET.farmer;
  const a = off.angle + (Math.random() - 0.5) * 0.4;
  const d = off.dist + (Math.random() - 0.5) * 60;
  npc.canadiaWorkX = npc.canadiaChestX + Math.cos(a) * d;
  npc.canadiaWorkY = npc.canadiaChestY + Math.sin(a) * d;
}

// 임시 진단 — 30초마다 한 번 NPC 1마리 상태 로그
let _canadiaDiagAt = 0;
function decideCanadiaBehavior(npc, now) {
  if (!npc.canadiaTask) { npc.canadiaTask = 'going_to_work'; npc.canadiaTaskAt = now; }
  npc.behavior = 'wander';
  // Phase 4d-14b: traveling — caravan별 속도로 종점 직진. 시뮬과 정확히 동기화.
  if (npc.canadiaTask === 'traveling') {
    const speed = npc.canadiaCaravanSpeed || 500;
    const dx = (npc.targetX || npc.x) - npc.x;
    const dy = (npc.targetY || npc.y) - npc.y;
    const d = Math.hypot(dx, dy);
    if (d > 5) {
      npc.vx = (dx / d) * speed;
      npc.vy = (dy / d) * speed;
    } else {
      npc.vx = 0; npc.vy = 0;
    }
    return; // target은 syncCanadiaCaravans가 매 1초 update (state 변경 시 종점도 자동 변경)
  }
  if (now - _canadiaDiagAt > 300000) { // 5분마다 한 번 (노이즈 축소)
    _canadiaDiagAt = now;
    const nextIn = (npc.nextDecisionAt || 0) - now;
    const endIn = (npc.canadiaTaskEndAt || 0) - now;
    const taskAge = now - (npc.canadiaTaskAt || now);
    console.log(`[canadia/diag] ${npc.name} task=${npc.canadiaTask} pos=(${npc.x|0},${npc.y|0}) target=(${(npc.targetX||0)|0},${(npc.targetY||0)|0}) endIn=${endIn|0}ms nextIn=${nextIn|0}ms taskAge=${taskAge|0}ms canadiaVillage=${npc.canadiaVillage} behavior=${npc.behavior} vx=${(npc.vx||0).toFixed(1)} vy=${(npc.vy||0).toFixed(1)}`);
  }
  // 안전장치 제거 (텔레포트는 hack). 진짜 원인 진단 우선.
  if (!npc.canadiaTaskAt) npc.canadiaTaskAt = now;
  if (npc.canadiaTask === 'going_to_work') {
    npc.targetX = npc.canadiaWorkX;
    npc.targetY = npc.canadiaWorkY;
    const d = Math.hypot(npc.x - npc.canadiaWorkX, npc.y - npc.canadiaWorkY);
    if (d < 40) {
      npc.canadiaTask = 'working';
      npc.canadiaTaskAt = now;
      npc.canadiaTaskEndAt = now + 6000 + Math.random() * 4000;  // 6~10초
    }
  } else if (npc.canadiaTask === 'working') {
    // Phase 4d-10 fix: 매 tick 변경 X — 2~4초마다 서브 타겟 변경 (떨림 방지)
    if (!npc._canadiaSubAt || now > npc._canadiaSubAt) {
      npc.targetX = npc.canadiaWorkX + (Math.random() - 0.5) * 30;
      npc.targetY = npc.canadiaWorkY + (Math.random() - 0.5) * 30;
      npc._canadiaSubAt = now + 2000 + Math.random() * 2000;
    }
    if (now >= (npc.canadiaTaskEndAt || 0)) {
      npc.canadiaTask = 'going_to_chest'; npc.canadiaTaskAt = now;
      npc._canadiaSubAt = 0;
    }
  } else if (npc.canadiaTask === 'going_to_chest') {
    npc.targetX = npc.canadiaChestX;
    npc.targetY = npc.canadiaChestY;
    const d = Math.hypot(npc.x - npc.canadiaChestX, npc.y - npc.canadiaChestY);
    if (d < 40) {
      npc.canadiaTask = 'at_chest';
      npc.canadiaTaskAt = now;
      npc.canadiaTaskEndAt = now + 2000 + Math.random() * 2000;
      npc._canadiaSubAt = 0;
    }
  } else if (npc.canadiaTask === 'at_chest') {
    if (!npc._canadiaSubAt || now > npc._canadiaSubAt) {
      npc.targetX = npc.canadiaChestX + (Math.random() - 0.5) * 20;
      npc.targetY = npc.canadiaChestY + (Math.random() - 0.5) * 20;
      npc._canadiaSubAt = now + 1500 + Math.random() * 1500;
    }
    if (now >= (npc.canadiaTaskEndAt || 0)) {
      assignCanadiaWorkArea(npc);
      npc.canadiaTask = 'going_to_work';
      npc.canadiaTaskAt = now;
      npc._canadiaSubAt = 0;
    }
  }
  npc.nextDecisionAt = now + 400 + Math.random() * 300;
}

function setupCanadiaVillage(village) {
  const cx = Math.round(village.coord.x);
  const cy = Math.round(village.coord.y);
  // === 거래소 chest 1개 (마을 중앙) ===
  const chestData = { wood: 0, stone: 0, isExchange: true, village: village.name, floor: 0 };
  let dbId = null;
  try {
    dbId = db.insertBuilding({
      type: 'chest',
      owner_id: `village_${village.name}`,
      owner_name: `${village.name} 거래소`,
      x: cx, y: cy,
      data: JSON.stringify(chestData),
    });
  } catch (e) { console.warn(`[canadia] chest insert 실패 [${village.name}]:`, e.message); return; }
  const id = `b${dbId}`; // 건물 lazy-load: id는 dbId 기반 (chestByVillage 참조도 재활성 후 유효)
  const b = {
    id, dbId, type: 'chest',
    ownerId: `village_${village.name}`, ownerName: `${village.name} 거래소`,
    x: cx, y: cy, data: chestData, floor: 0,
  };
  buildings.set(id, b);
  try { chunkManager.insertBuilding(b); } catch (e) {}
  broadcast({ type: 'building_added', building: b });
  canadiaState.chestByVillage.set(village.name, id);

  // === 길드 사유지 (12 cell 반경 원형) ===
  const SZ = BUILDING_SIZE;
  const R = 12;
  let claimCount = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (Math.hypot(dx, dy) > R) continue;
      const claim = {
        id: `c${nextClaimId++}`,
        ownerPid: `village_${village.name}`,
        ownerName: `${village.name} 영토`,
        x: Math.floor(cx / SZ) * SZ + dx * SZ,
        y: Math.floor(cy / SZ) * SZ + dy * SZ,
        w: SZ, h: SZ, kind: 'guild',
        guildTribeName: village.name,
        createdAt: Date.now(),
      };
      claims.set(claim.id, claim);
      broadcast({ type: 'claim_added', claim });
      claimCount++;
    }
  }
  console.log(`[canadia] 🏘️ ${village.name} 셋업: 거래소 (${cx},${cy}) + 영토 ${claimCount} cells`);
}

