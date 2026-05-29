// 존 서버 — 한 지역의 시뮬레이션을 권위적으로 처리
// 환경변수 ZONE_ID, PORT 로 어떤 존을 띄울지 결정
//
// 실제 분산 배포에서는 각 ZONE을 다른 국가의 서버에서 실행하면 됨.
// 프로토타입에서는 같은 머신에서 다른 포트로 시뮬레이션.

const WebSocket = require('ws');
const http = require('http');
const { ZONES, WORLD, isNight, worldPhase, darknessLevel } = require('./zone-config');
const db = require('./zone-local-db'); // 로컬 zone DB — players 없음
const central = require('./central-client'); // central HTTP 클라이언트
const { Quadtree } = require('./quadtree'); // spatial index — O(N²) 검색 회피
const { ChunkManager, CHUNK_SIZE, generateChunkResources } = require('./chunk'); // 청크 단위 entity 분류 + procedural
const chunkManager = new ChunkManager(WORLD.zoneWidth, WORLD.zoneHeight);
const harvestedSeeds = new Set(); // 채집된 시드 자원 (DB에서 load)

// === 활성 청크 (12.2.b) — 사람 player + observer 위치 주변 청크만 시뮬레이션 ===
// 비활성 청크의 mob/NPC는 멈춤 — CPU 절약. 청크 시스템의 핵심.
const CHUNK_ACTIVE_RADIUS = 1200; // 시야(650) + AOI(800) + 약간 마진
let activeChunkKeys = new Set();
// 청크 활성/비활성 transition 감지 + procedural 자원 spawn/despawn
let prevActiveChunkKeys = new Set();
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
  // transition: 새로 활성된 청크 → procedural 자원 spawn
  for (const k of newActive) {
    if (!prevActiveChunkKeys.has(k)) {
      const [cx, cy] = k.split('_').map(Number);
      activateChunk(cx, cy);
    }
  }
  // transition: 비활성된 청크 → 시드 자원 despawn (메모리/quadtree에서 제거)
  for (const k of prevActiveChunkKeys) {
    if (!newActive.has(k)) {
      const [cx, cy] = k.split('_').map(Number);
      deactivateChunk(cx, cy);
    }
  }
  prevActiveChunkKeys = newActive;
  activeChunkKeys = newActive;
}

// 활성화 — 그 청크의 시드 자원 생성
function activateChunk(cx, cy) {
  const seedResources = generateChunkResources(ZONE_ID, ZONE.biome, cx, cy, chunkManager.chunkSize, harvestedSeeds);
  for (const r of seedResources) {
    resources.set(r.id, r);
    chunkManager.insertResource(r);
    broadcast({ type: 'resource_spawn', resource: r });
  }
}

// 비활성화 — 그 청크의 시드 자원만 제거 (수동 자원은 안 건드림)
function deactivateChunk(cx, cy) {
  const c = chunkManager.chunks.get(chunkManager.keyOf(cx, cy));
  if (!c) return;
  const toRemove = [];
  for (const r of c.resources.values()) if (r.isSeed) toRemove.push(r);
  for (const r of toRemove) {
    resources.delete(r.id);
    chunkManager.removeResource(r);
    broadcast({ type: 'resource_removed', id: r.id });
  }
}
function isChunkActiveKey(key) { return activeChunkKeys.has(key); }
function isPositionActive(x, y) {
  const { cx, cy } = chunkManager.chunkXY(x, y);
  return activeChunkKeys.has(chunkManager.keyOf(cx, cy));
}

// === Spatial index — 매 tick 재구축 ===
// 모든 nearest-search (visiblePlayers, tryGather 등)에서 사용. message handler에서도
// stale 33ms 정도는 OK (다음 tick에 재구축).
let qtPlayers, qtMobs, qtResources, qtBuildings;
function rebuildSpatialIndex() {
  const W = WORLD.zoneWidth, H = WORLD.zoneHeight;
  qtPlayers   = new Quadtree(0, 0, W, H);
  qtMobs      = new Quadtree(0, 0, W, H);
  qtResources = new Quadtree(0, 0, W, H);
  qtBuildings = new Quadtree(0, 0, W, H);
  for (const p of players.values())    qtPlayers.insert({ x: p.x, y: p.y, ref: p });
  for (const m of mobs.values())       qtMobs.insert({ x: m.x, y: m.y, ref: m });
  for (const r of resources.values())  qtResources.insert({ x: r.x, y: r.y, ref: r });
  for (const b of buildings.values())  qtBuildings.insert({ x: b.x, y: b.y, ref: b });
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
    tools_json: JSON.stringify(player.tools || {}),
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

const ZONE_ID = process.env.ZONE_ID || 'korea';
const PORT = parseInt(process.env.PORT || ZONES[ZONE_ID]?.port || '3002', 10);
const ZONE = ZONES[ZONE_ID];
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
// per-zone player cap — 환경변수로 조정. 차면 새 접속 거부.
// 부하 테스트로 측정한 단일 코어 한계 ~300. 안전 마진으로 150 기본.
const PLAYER_CAP = parseInt(process.env.PLAYER_CAP || '150', 10);
const GATHER_RANGE = 48;
const MAX_RESOURCES = 0; // Phase 12.2.e: procedural — 청크 활성화 시 lazy 생성. 이 변수 더 안 씀.

// === 상태 ===
const players = new Map();      // pid -> { ws, x, y, vx, vy, name, inventory, handingOff }
const observers = new Map();    // ws -> { viewerX, viewerY, lastSeen }
const resources = new Map();
const AOI_RADIUS = 800;         // 클라 VIEW_RADIUS(650) + 여유. 이 안의 player만 tick에 포함
const claims = new Map();
const buildings = new Map();    // id -> { id, dbId, type, ownerId, ownerName, x, y, data }
const mobs = new Map();         // mid -> { mid, type, x, y, vx, vy, hp, maxHp, aggroTarget, lastAttackAt, wanderUntil }
const BUILDING_SIZE = 32;
const BUILDING_COST = {
  wall:     { wood: 2, stone: 1 },
  floor:    { wood: 1, stone: 0 }, // 바닥 — 1F 짓기 지지대. 콜라이더 X (밟고 다님)
  fence:    { wood: 1, stone: 0 },
  chest:    { wood: 5, stone: 2 },
  campfire: { wood: 3, stone: 2 },
  farmland: { wood: 0, stone: 0, seed: 'seed_berry' },
  stair:    { wood: 4, stone: 2 },
};
const CROP_GROW_MS = 60 * 1000;
const BLOCKING_BUILDINGS = new Set(['wall', 'fence']);
const BUILDING_HEIGHT = { wall: 32, floor: 4, fence: 24, chest: 24, campfire: 20, farmland: 4, stair: 32 };
const FLOOR_HEIGHT = 32;

// === 위반 점수 (vp) — PvP 공격·타인 사유지 침범 시 누적, 시간당 감소 ===
const VP_TRESPASS_GATHER = 3;   // 남 영지 자원 채집 시도
const VP_ATTACK_PLAYER   = 8;   // PvP 공격 한 번
const VP_DECAY_PER_SEC   = 10 / 3600; // 시간당 -10
const VP_THRESHOLD       = 50;  // 이 이상이면 본인 사유지 보호 해제
const VP_MAX             = 100;

const MOB_DEFS = {
  deer: { maxHp: 10, speed: 80,  aggroRange: 0, damage: 0, sightRange: 0,   loot: { meat_raw: 1, hide: 1 }, tameFood: 'berry',    tameNeed: 3 },
  wolf: { maxHp: 30, speed: 140, aggroRange: 250, damage: 5, sightRange: 300, loot: { meat_raw: 2, hide: 1 }, tameFood: 'meat_raw', tameNeed: 5 },
};
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
const RECIPES = {
  axe:     { wood: 5, stone: 2, label: '도끼' },
  pickaxe: { wood: 3, stone: 5, label: '곡괭이' },
  sword:   { wood: 2, stone: 8, label: '검' },
};
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
let nextBid = 1;
let nextClaimId = 1;

function generateToken() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
}

// === 자원 스폰 ===
// 종류별 가중치: 바이옴마다 분포 다름. water_pool은 모든 바이옴에 소량.
function biomeResourceType() {
  const r = Math.random();
  if (ZONE.biome === 'plains') {
    // 평원: 베리·풀 많고 나무 적음
    if (r < 0.45) return 'tree';
    if (r < 0.60) return 'rock';
    if (r < 0.90) return 'berry_bush';
    return 'water_pool';
  }
  if (ZONE.biome === 'mountains') {
    // 산악: 돌 많고 베리 적음
    if (r < 0.25) return 'tree';
    if (r < 0.75) return 'rock';
    if (r < 0.92) return 'berry_bush';
    return 'water_pool';
  }
  // forest
  if (r < 0.60) return 'tree';
  if (r < 0.72) return 'rock';
  if (r < 0.94) return 'berry_bush';
  return 'water_pool';
}

// 자원 종류별 maxHp (몇 번 치면 깎이는지)
const RESOURCE_HP = {
  tree: 3, rock: 4, berry_bush: 2, water_pool: 999, // water_pool은 무한 — 깎이지 않음
};

function spawnOneResource() {
  const x = 32 + Math.random() * (WORLD.zoneWidth - 64);
  const y = 32 + Math.random() * (WORLD.zoneHeight - 64);
  const type = biomeResourceType();
  const maxHp = RESOURCE_HP[type] || 3;
  // DB에 영속화
  const dbId = db.insertResource({ type, x, y, hp: maxHp, max_hp: maxHp });
  const id = `r${nextRid++}`;
  const r = { id, dbId, x, y, type, hp: maxHp, maxHp };
  resources.set(id, r);
  chunkManager.insertResource(r);
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
    // 늑대는 마을 안전구역 밖에서만 spawn (사슴은 마을 근처도 OK)
    for (let att = 0; att < 20; att++) {
      x = 32 + Math.random() * (WORLD.zoneWidth - 64);
      y = 32 + Math.random() * (WORLD.zoneHeight - 64);
      if (type !== 'wolf' || !(typeof isNearVillage === 'function' && isNearVillage(x, y))) break;
    }
  }
  const hp = opts.hp ?? def.maxHp;
  // DB에 insert (dbId가 없으면 새로 만들고, 있으면 그대로 사용 — 로드 케이스)
  const dbId = opts.dbId ?? db.insertMob({ type, x, y, hp, max_hp: def.maxHp });
  const m = {
    mid, dbId, type,
    x, y,
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
  } else {
    const isHostile = ZONE.biome === 'mountains' || ZONE.biome === 'forest';
    // 면적 100배지만 mob도 메모리 차지 — 적당히 50배 (비활성 청크는 AI skip)
    const deerCount = isHostile ? 200 : 400;
    const wolfCount = isHostile ? 250 : 100;
    for (let i = 0; i < deerCount; i++) spawnMob('deer');
    // 늑대는 팩으로 묶음 — 2~3마리씩. home은 마을 근처 피해서.
    let spawned = 0, packNum = 0;
    while (spawned < wolfCount) {
      const packSize = Math.min(2 + Math.floor(Math.random() * 2), wolfCount - spawned); // 2 또는 3
      const packId = `pack_${ZONE_ID}_${packNum++}_${Math.random().toString(36).slice(2,6)}`;
      // 팩의 home — 마을 안전구역 밖에서만 (20회 재시도)
      let homeX, homeY;
      for (let att = 0; att < 20; att++) {
        homeX = 200 + Math.random() * (WORLD.zoneWidth - 400);
        homeY = 200 + Math.random() * (WORLD.zoneHeight - 400);
        if (!isNearVillage(homeX, homeY)) break;
      }
      for (let i = 0; i < packSize; i++) {
        // 멤버는 home 주변 50px 안에 spawn
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 50;
        spawnMob('wolf', {
          x: homeX + Math.cos(ang) * r,
          y: homeY + Math.sin(ang) * r,
          homeX, homeY, packId,
        });
        spawned++;
      }
      console.log(`[${ZONE_ID}] 🐺 늑대 팩 ${packId.slice(-6)}: ${packSize}마리 @ (${homeX.toFixed(0)},${homeY.toFixed(0)})`);
    }
    console.log(`[${ZONE_ID}] 새 mob 스폰: 사슴 ${deerCount}, 늑대 ${wolfCount}`);
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
    cx = 200 + Math.random() * (WORLD.zoneWidth - 400);
    cy = 200 + Math.random() * (WORLD.zoneHeight - 400);
    for (let attempt = 0; attempt < 8; attempt++) {
      let collide = false;
      for (const c of claims.values()) {
        if (rectsOverlap(cx - NPC_CLAIM_SIZE/2, cy - NPC_CLAIM_SIZE/2, NPC_CLAIM_SIZE, NPC_CLAIM_SIZE, c.x, c.y, c.w, c.h)) { collide = true; break; }
      }
      if (!collide) break;
      cx = 200 + Math.random() * (WORLD.zoneWidth - 400);
      cy = 200 + Math.random() * (WORLD.zoneHeight - 400);
    }
  }
  // 사이즈 안 벗어나게 clamp
  cx = clamp(cx, NPC_CLAIM_SIZE, WORLD.zoneWidth - NPC_CLAIM_SIZE);
  cy = clamp(cy, NPC_CLAIM_SIZE, WORLD.zoneHeight - NPC_CLAIM_SIZE);
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
  // 자기 사유지 자동 생성
  const claimX = cx - NPC_CLAIM_SIZE/2, claimY = cy - NPC_CLAIM_SIZE/2;
  const claimId = `c${nextClaimId++}`;
  const dbId = db.insertClaim({ owner_id: npcId, owner_name: name, x: claimX, y: claimY, w: NPC_CLAIM_SIZE, h: NPC_CLAIM_SIZE });
  const claim = { id: claimId, dbId, ownerPid: npcId, ownerName: name, x: claimX, y: claimY, w: NPC_CLAIM_SIZE, h: NPC_CLAIM_SIZE };
  claims.set(claimId, claim);
  player.myClaim = claim;
  players.set(pid, player);
  npcs.add(pid);
  broadcast({ type: 'claim_added', claim });

  // NPC 자동 집 — 사유지 안에 작은 2x2 박스 + 계단 + 1F 한 칸 (다층 마을)
  // 그리드 32px 기준으로 사유지 중심 주변에 wall 배치
  const houseGx = Math.floor(cx / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  const houseGy = Math.floor(cy / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  // PZ식 3x3 집 — wall은 cell edge에. floor (바닥)는 cell 가운데에.
  // cell 좌표 (houseCx, houseCy) 기준 -1..+1 범위.
  const houseCx = Math.floor(cx / BUILDING_SIZE);
  const houseCy = Math.floor(cy / BUILDING_SIZE);
  function addWall(cellCx, cellCy, side, floor) {
    const wx = cellCx * BUILDING_SIZE;
    const wy = cellCy * BUILDING_SIZE;
    const data = { side, floor };
    const dbId = db.insertBuilding({ type: 'wall', owner_id: npcId, owner_name: name, x: wx, y: wy, data: JSON.stringify(data) });
    const id = `b${nextBid++}`;
    const building = { id, dbId, type: 'wall', ownerId: npcId, ownerName: name, x: wx, y: wy, data, floor };
    buildings.set(id, building);
    chunkManager.insertBuilding(building);
  }
  function addBlock(cellCx, cellCy, type, floor) {
    const bx = cellCx * BUILDING_SIZE + BUILDING_SIZE / 2;
    const by = cellCy * BUILDING_SIZE + BUILDING_SIZE / 2;
    const data = { floor };
    const dbId = db.insertBuilding({ type, owner_id: npcId, owner_name: name, x: bx, y: by, data: JSON.stringify(data) });
    const id = `b${nextBid++}`;
    const building = { id, dbId, type, ownerId: npcId, ownerName: name, x: bx, y: by, data, floor };
    buildings.set(id, building);
    chunkManager.insertBuilding(building);
  }
  // 3x3 영역의 외곽 edge 4면. cell 범위 (cx-1, cy-1) ~ (cx+1, cy+1).
  for (const f of [0, 1]) {
    // 북쪽 변 (cy-1의 N)
    for (let i = -1; i <= 1; i++) addWall(houseCx + i, houseCy - 1, 'N', f);
    // 남쪽 변 (cy+1의 S = cy+2의 N) — 입구 (가운데) 0F만 비움
    for (let i = -1; i <= 1; i++) {
      if (f === 0 && i === 0) continue; // 0F 입구
      addWall(houseCx + i, houseCy + 2, 'N', f);
    }
    // 동쪽 변 (cx+1의 E)
    for (let j = -1; j <= 1; j++) addWall(houseCx + 1, houseCy + j, 'E', f);
    // 서쪽 변 (cx-1의 W = cx-2의 E)
    for (let j = -1; j <= 1; j++) addWall(houseCx - 2, houseCy + j, 'E', f);
  }
  // 1F 바닥 (3x3) — 천장
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) addBlock(houseCx + i, houseCy + j, 'floor', 1);
  // 옆 계단
  addBlock(houseCx + 2, houseCy, 'stair', 0);

  console.log(`[${ZONE_ID}] 🤖 NPC 스폰: ${name} @ (${cx.toFixed(0)},${cy.toFixed(0)}) + PZ식 집`);
  return player;
}

// === 부팅: 옛 NPC 사유지 정리 + zone-config의 고정 마을 spawn ===
// 마을 좌표는 zone-config.js의 ZONE.villages 배열에서 가져옴 (고정 — 매번 같은 자리).
const VILLAGES = ZONE.villages || [];
const NPC_PER_VILLAGE = VILLAGES.length > 0 ? Math.floor(NPC_COUNT_PER_ZONE / VILLAGES.length) : 0;
const VILLAGE_SAFE_RADIUS = 600; // 늑대 이 안에 spawn X (마을 안전구역)
{
  const npcClaims = Array.from(claims.values()).filter(c => c.ownerPid && c.ownerPid.startsWith('npc_'));
  for (const c of npcClaims) {
    if (c.dbId) { try { db.db.prepare('DELETE FROM claims WHERE id = ?').run(c.dbId); } catch (e) {} }
    claims.delete(c.id);
  }
  if (npcClaims.length > 0) console.log(`[${ZONE_ID}] 옛 NPC 사유지 ${npcClaims.length}개 정리`);

  for (let v = 0; v < VILLAGES.length; v++) {
    const village = VILLAGES[v];
    const villageId = `village_${ZONE_ID}_${v}`;
    console.log(`[${ZONE_ID}] 🏘️ 마을 [${village.name}] @ (${village.x},${village.y}) — ${NPC_PER_VILLAGE}명`);
    for (let i = 0; i < NPC_PER_VILLAGE; i++) {
      const ang = (Math.PI * 2 * i / NPC_PER_VILLAGE) + Math.random() * 0.3;
      const r = 200 + Math.random() * 300;
      const npcX = village.x + Math.cos(ang) * r;
      const npcY = village.y + Math.sin(ang) * r;
      spawnNpc({ x: npcX, y: npcY, villageId, villageName: village.name });
    }
  }
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
  // ② 자기 농지 익었으면 수확
  for (const b of buildings.values()) {
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
    for (const b of buildings.values()) if (b.type === 'farmland' && b.ownerId === npc.playerId) myFarmCount++;
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
  // ⑤ 배회 — 사유지 안에서 랜덤
  npc.behavior = 'wander';
  if (npc.myClaim) {
    const cl = npc.myClaim;
    npc.targetX = cl.x + Math.random() * cl.w;
    npc.targetY = cl.y + Math.random() * cl.h;
  } else {
    npc.targetX = npc.x + (Math.random() - 0.5) * 200;
    npc.targetY = npc.y + (Math.random() - 0.5) * 200;
  }
}

function npcStep(npc, dt, now) {
  decideNpcBehavior(npc, now);

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

  // 목표 방향으로 이동
  const dx = npc.targetX - npc.x, dy = npc.targetY - npc.y;
  const dd = Math.hypot(dx, dy);
  if (dd > 8) {
    const speed = npc.behavior === 'flee' ? MOVE_SPEED * 1.0 : MOVE_SPEED * 0.6;
    npc.vx = (dx / dd) * speed;
    npc.vy = (dy / dd) * speed;
  } else {
    npc.vx = 0; npc.vy = 0;
    // 목표 도달 시 행동 실행
    if (npc.behavior === 'gather' && npc.gatherTarget) {
      const r = resources.get(npc.gatherTarget);
      if (r && Math.hypot(r.x - npc.x, r.y - npc.y) < GATHER_RANGE) {
        // 직접 채집 (tryGather 로직 간소화)
        r.hp -= 1;
        if (r.hp <= 0) {
          let loot = {};
          if (r.type === 'tree') loot = { wood: 1 };
          else if (r.type === 'rock') loot = { stone: 1 };
          else if (r.type === 'berry_bush') { loot = { berry: 2, fiber: 1 }; if (Math.random() < 0.3) loot.seed_berry = 1; }
          for (const [k, v] of Object.entries(loot)) npc.inventory[k] = (npc.inventory[k] || 0) + v;
          resources.delete(r.id);
          chunkManager.removeResource(r);
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
          const id = `b${nextBid++}`;
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
  for (const m of mobs.values()) {
    if (m.dirty && m.dbId) {
      try { db.updateMobState(m.dbId, m.x, m.y, m.hp, m.tameOwner, m.tameOwnerName); saved++; m.dirty = false; }
      catch (e) { /* lock 잡혔으면 다음 라운드 */ }
    }
  }
  if (saved > 0) console.log(`[${ZONE_ID}] mob 상태 저장 ${saved}건`);
}, 10000);

// === DB에서 건축물 로드 ===
{
  const rows = db.getBuildings();
  for (const row of rows) {
    const id = `b${nextBid++}`;
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
    chunkManager.insertBuilding(b);
  }
  console.log(`[${ZONE_ID}] DB에서 건축물 ${rows.length}개 로드`);
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
          x: Math.max(0, Math.min(WORLD.zoneWidth, +data.x || 0)),
          y: Math.max(0, Math.min(WORLD.zoneHeight, +data.y || 0)),
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
            // ws.close()는 0.5초 지연 — 클라가 새 zone welcome 받기까지 broadcast 계속
            // 그동안 자기 player는 이미 삭제됐으니 input 와도 무시됨
            const wsToClose = p.ws;
            setTimeout(() => { try { wsToClose.close(); } catch (e) {} }, 500);
            console.log(`[${ZONE_ID}] ✓ ACK token=${data.token.slice(0,8)} — ${p.name} 정상 인계됨`);
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
      viewerX: !isNaN(initVx) ? initVx : WORLD.zoneWidth / 2,
      viewerY: !isNaN(initVy) ? initVy : WORLD.zoneHeight / 2,
      lastSeen: Date.now(),
    });
    send(ws, {
      type: 'welcome',
      observer: true,
      zone: zonePublicMeta(),
      resources: Array.from(resources.values()),
      claims: Array.from(claims.values()),
      buildings: Array.from(buildings.values()),
      worldClock: {
        epoch: WORLD.worldEpoch,
        dayLengthMs: WORLD.dayLengthMs,
        dayPhaseRatio: WORLD.dayPhaseRatio,
        serverNow: Date.now(),
      },
    });
    // 초기 tick — AOI 필터 적용
    const obs = observers.get(ws);
    send(ws, {
      type: 'tick',
      t: Date.now(),
      players: Array.from(players.values())
        .filter(p => Math.hypot(p.x - obs.viewerX, p.y - obs.viewerY) < AOI_RADIUS)
        .map(p => ({ pid: p.pid, x: p.x, y: p.y, name: p.name, color: p.color })),
    });
    function handleObsIncoming(raw) {
      let msg; try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (msg.type === 'ping') send(ws, { type: 'pong', t: msg.t });
      else if (msg.type === 'viewport_update') {
        const data = observers.get(ws);
        if (!data) return;
        data.viewerX = Math.max(0, Math.min(WORLD.zoneWidth, +msg.x || 0));
        data.viewerY = Math.max(0, Math.min(WORLD.zoneHeight, +msg.y || 0));
        data.lastSeen = Date.now();
      }
      else if (msg.type === 'promote_to_primary' && msg.token && pendingHandoffs.has(msg.token)) {
        // === Observer→Primary in-place 승격 ===
        // 새 ws 안 만들고 기존 observer ws 재사용 → 끊김 거의 0
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
          lastAttackAt: 0, lastDamagedAt: 0,
          handingOff: false, lastSeen: Date.now(),
        };
        players.set(pid, player);

        // 활성 청크 갱신 — promote 직후 청크 자원 보장
        updateActiveChunks();

        // source zone에 ACK
        if (pending.source_zone && ZONES[pending.source_zone]) {
          const src = ZONES[pending.source_zone];
          postJSON(src.host, src.port, '/handoff_ack', { token: msg.token })
            .catch(e => console.warn(`[${ZONE_ID}] promote ACK 실패:`, e.message));
        }

        // welcome 전송 (클라가 자기 player 알게)
        send(ws, {
          type: 'welcome',
          pid,
          zone: zonePublicMeta(),
          resources: Array.from(resources.values()),
          claims: Array.from(claims.values()),
          buildings: Array.from(buildings.values()),
          mobs: Array.from(mobs.values()).map(m => ({ mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, tameOwner: m.tameOwner || null, tameOwnerName: m.tameOwnerName || null })),
          inventory: player.inventory,
          tools: player.tools, equipped: player.equipped,
          recipes: RECIPES,
          cookRecipes: COOK_RECIPES,
          foodEffects: FOOD_EFFECTS,
          self: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
                  hunger: Math.round(player.hunger), thirst: Math.round(player.thirst),
                  vp: Math.round(player.vp ?? 0),
                  tribeId: player.tribeId || null, tribeName: player.tribeName || null,
            floor: player.floor || 0 },
          worldClock: {
            epoch: WORLD.worldEpoch, dayLengthMs: WORLD.dayLengthMs,
            dayPhaseRatio: WORLD.dayPhaseRatio, serverNow: Date.now(),
          },
        });

        // 핸들러 교체 — observer → player
        attachPlayerHandlers(ws, player);
        console.log(`[${ZONE_ID}] ✨ promote observer→primary ${player.name} token=${msg.token.slice(0,8)} v=(${player.vx},${player.vy})`);
      }
    }
    ws.on('message', (raw) => {
      if (LATENCY_MS > 0) setTimeout(() => handleObsIncoming(raw), LATENCY_MS);
      else handleObsIncoming(raw);
    });
    ws.on('close', () => observers.delete(ws));
    ws.on('error', () => observers.delete(ws));
    return;
  }

  // === 토큰 기반 핸드오프 우선 처리 ===
  const handoffToken = url.searchParams.get('handoff_token');
  let playerId, name, sx, sy, ivx = 0, ivy = 0, inventory = { wood: 0, stone: 0 }, color = '#5a9ae0';
  let tools = {}, equipped = null;
  let initHunger = HUNGER_MAX, initThirst = THIRST_MAX, initVp = 0;
  let initTribeId = null, initTribeName = null;
  let initFloor = 0;

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
      // 등록 또는 로그인 — central에 HTTP 호출
      let result;
      try { result = await central.authenticate(inUsername, inPassword, color); }
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
      equipped = result.player.equipped || null;
      initHunger = (typeof result.player.hunger === 'number') ? result.player.hunger : HUNGER_MAX;
      initThirst = (typeof result.player.thirst === 'number') ? result.player.thirst : THIRST_MAX;
      initVp = (typeof result.player.violation_points === 'number') ? result.player.violation_points : 0;
      initTribeId = result.player.tribe_id || null;
      initFloor = (typeof result.player.floor === 'number') ? result.player.floor : 0;
      if (initTribeId) {
        // 부족 이름 한 번 더 조회 (캐시 가능)
        try {
          const tr = await central.request('GET', `/tribe/${initTribeId}`);
          if (tr.status === 200 && tr.data?.tribe) initTribeName = tr.data.tribe.name;
        } catch (e) {}
      }
      console.log(`[${ZONE_ID}] ${result.isNew ? '신규 가입' : '로그인'}: ${name}  tribe=${initTribeName || '없음'}`);
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

    sx = WORLD.zoneWidth / 2;
    sy = WORLD.zoneHeight / 2;
  }

  const pid = `p${nextPid++}`;
  const player = {
    pid, playerId, ws, name, color,
    x: sx, y: sy,
    vx: ivx, vy: ivy,
    inventory,
    tools, equipped,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    hunger: initHunger, thirst: initThirst, vp: initVp,
    tribeId: initTribeId, tribeName: initTribeName,
    pvpEnabled: false,
    floor: initFloor, // 2.5D — 현재 캐릭터 층 (영속화 + 핸드오프 캐리)
    lastAttackAt: 0,
    lastDamagedAt: 0,
    handingOff: false,
    lastSeen: Date.now(),
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
    resources: Array.from(resources.values()),
    claims: Array.from(claims.values()),
    buildings: Array.from(buildings.values()),
    mobs: Array.from(mobs.values()).map(m => ({ mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, tameOwner: m.tameOwner || null, tameOwnerName: m.tameOwnerName || null })),
    inventory: player.inventory,
    tools: player.tools, equipped: player.equipped,
    recipes: RECIPES,
    cookRecipes: COOK_RECIPES,
    foodEffects: FOOD_EFFECTS,
    self: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
            hunger: Math.round(player.hunger), thirst: Math.round(player.thirst),
            vp: Math.round(player.vp ?? 0),
            tribeId: player.tribeId || null, tribeName: player.tribeName || null,
            floor: player.floor || 0 },
    worldClock: {
      epoch: WORLD.worldEpoch,
      dayLengthMs: WORLD.dayLengthMs,
      dayPhaseRatio: WORLD.dayPhaseRatio,
      serverNow: Date.now(), // 클라가 자기 시계 보정용으로 씀
    },
  });

  // ws에 player input/close 핸들러 attach
  attachPlayerHandlers(ws, player);
});

// === 외부 player 핸들러 (observer promotion에서 재사용) ===
function handlePlayerInput(player, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
  const ws = player.ws;

  if (msg.type === 'input') {
    const vx = clamp(msg.vx, -1, 1);
    const vy = clamp(msg.vy, -1, 1);
    const len = Math.hypot(vx, vy) || 1;
    player.vx = (vx / len) * MOVE_SPEED * Math.min(1, Math.hypot(vx, vy));
    player.vy = (vy / len) * MOVE_SPEED * Math.min(1, Math.hypot(vx, vy));
    player.lastSeen = Date.now();
    player._inputCnt = (player._inputCnt || 0) + 1;
    if (!player._inputLogAt || Date.now() - player._inputLogAt > 1000) {
      player._inputLogAt = Date.now();
      console.log(`[${ZONE_ID}/in] ${player.name} input cnt=${player._inputCnt} vx=${vx} vy=${vy}`);
    }
  } else if (msg.type === 'gather') tryGather(player);
  else if (msg.type === 'claim') tryClaim(player);
  else if (msg.type === 'trade_offer') tryTrade(player, msg);
  else if (msg.type === 'ping') send(ws, { type: 'pong', t: msg.t });
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
  } else if (msg.type === 'build') { metrics.builds++; tryBuild(player, msg.buildType, msg.floor || 0, msg.side || null); }
  else if (msg.type === 'chest_put') tryChestPut(player, msg.buildingId, msg.item, +msg.amount || 1);
  else if (msg.type === 'chest_take') tryChestTake(player, msg.buildingId, msg.item, +msg.amount || 1);
  else if (msg.type === 'attack') { metrics.attacks++; tryAttack(player); }
  else if (msg.type === 'craft') doCraft(player, msg.recipe);
  else if (msg.type === 'equip') doEquip(player, msg.tool);
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
  else if (msg.type === 'change_floor') {
    // 계단 근처 (80px 안)에서만 가능. direction: 'up'|'down'.
    let nearStair = false;
    const nearby = qtBuildings ? qtBuildings.queryCircle(player.x, player.y, 80) : Array.from(buildings.values());
    for (const b of nearby) {
      if (b.type !== 'stair') continue;
      if (Math.hypot(b.x - player.x, b.y - player.y) < 64) { nearStair = true; break; }
    }
    if (!nearStair) { send(player.ws, { type: 'notice', text: '계단 옆에서만 층 이동 가능' }); return; }
    const dir = msg.direction;
    if (dir === 'up') {
      player.floor = Math.min(5, (player.floor || 0) + 1);
    } else if (dir === 'down') {
      player.floor = Math.max(0, (player.floor || 0) - 1);
    } else return;
    send(player.ws, { type: 'floor_changed', floor: player.floor });
    send(player.ws, { type: 'notice', text: `${player.floor}F 이동` });
  }
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
  player.tools[recipeName] = (player.tools[recipeName] || 0) + 1;
  // 처음 만든 도구면 자동 장착
  if (!player.equipped) player.equipped = recipeName;
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'tools_update', tools: player.tools, equipped: player.equipped });
  send(player.ws, { type: 'notice', text: `${recipe.label} 제작 완료` });
  if (!player.playerId.startsWith('anon_')) {
    savePlayer(player);
  }
}

function doEquip(player, toolName) {
  // null/빈 문자열이면 장착 해제
  if (!toolName) {
    player.equipped = null;
  } else {
    if (!RECIPES[toolName]) return;
    if (!(player.tools[toolName] > 0)) {
      send(player.ws, { type: 'notice', text: `${RECIPES[toolName].label} 보유 없음` });
      return;
    }
    player.equipped = toolName;
  }
  send(player.ws, { type: 'tools_update', tools: player.tools, equipped: player.equipped });
  if (!player.playerId.startsWith('anon_')) {
    savePlayer(player);
  }
}

function tryGather(player) {
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

  // 도구 효과: tree면 axe 보너스, rock이면 pickaxe 보너스
  const eff = player.equipped ? TOOL_EFFECTS[player.equipped] : null;
  let dmg = 1;
  if (eff) {
    if (best.type === 'tree') dmg = eff.gatherWoodMult;
    else if (best.type === 'rock') dmg = eff.gatherStoneMult;
  }
  best.hp -= dmg;
  if (best.hp <= 0) {
    // 자원 종류별 산출물
    let loot = {};
    if (best.type === 'tree')        loot = { wood: 1 };
    else if (best.type === 'rock')   loot = { stone: 1 };
    else if (best.type === 'berry_bush') {
      loot = { berry: 2, fiber: 1 };
      if (Math.random() < 0.3) loot.seed_berry = 1; // 30% 확률로 씨앗
    }
    for (const [item, amt] of Object.entries(loot)) {
      player.inventory[item] = (player.inventory[item] || 0) + amt;
    }
    resources.delete(best.id);
    chunkManager.removeResource(best);
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

function tryClaim(player) {
  // 토지 점유: wood 5 + stone 5 소비, 자기 위치 중심 128×128 영역
  const CLAIM_W = 192, CLAIM_H = 192;
  const COST_WOOD = 5, COST_STONE = 5;
  if ((player.inventory.wood || 0) < COST_WOOD || (player.inventory.stone || 0) < COST_STONE) {
    send(player.ws, { type: 'notice', text: `토지 점유에는 나무 ${COST_WOOD}, 돌 ${COST_STONE} 필요` });
    return;
  }
  const cx = player.x - CLAIM_W / 2;
  const cy = player.y - CLAIM_H / 2;

  // 기존 클레임과 충돌 체크
  for (const c of claims.values()) {
    if (rectsOverlap(cx, cy, CLAIM_W, CLAIM_H, c.x, c.y, c.w, c.h)) {
      send(player.ws, { type: 'notice', text: `다른 영지와 겹칩니다.` });
      return;
    }
  }

  player.inventory.wood -= COST_WOOD;
  player.inventory.stone -= COST_STONE;

  const id = `c${nextClaimId++}`;
  const claim = {
    id, ownerPid: player.playerId, ownerName: player.name,
    x: cx, y: cy, w: CLAIM_W, h: CLAIM_H,
  };
  claims.set(id, claim);
  // DB 영속화 (zone 로컬)
  db.insertClaim({
    owner_id: player.playerId,
    owner_name: player.name,
    x: cx, y: cy, w: CLAIM_W, h: CLAIM_H,
  });
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'notice', text: `영지를 세웠습니다!` });
  broadcast({ type: 'claim_added', claim });
}

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
function tryBuild(player, type, floor = 0, side = null) {
  floor = Math.max(0, Math.min(5, floor | 0));
  if (!BUILDING_COST[type]) {
    send(player.ws, { type: 'notice', text: '알 수 없는 건축물' }); return;
  }
  // wall은 cell edge에 (PZ식). side가 안 주어졌으면 player 위치에서 가장 가까운 edge 결정.
  // S/W → 인접 cell의 N/E로 정규화. 결과는 'N' or 'E'.
  if (type === 'wall') {
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
    // 중복 wall 체크
    if (findEdgeWall(useCx, useCy, useSide, floor)) {
      send(player.ws, { type: 'notice', text: '이미 벽이 있습니다' }); return;
    }
    const cost = BUILDING_COST.wall;
    if ((player.inventory.wood || 0) < cost.wood || (player.inventory.stone || 0) < cost.stone) {
      send(player.ws, { type: 'notice', text: `재료 부족 (나무 ${cost.wood}, 돌 ${cost.stone})` });
      return;
    }
    player.inventory.wood -= cost.wood;
    player.inventory.stone -= cost.stone;
    const wx = useCx * BUILDING_SIZE;
    const wy = useCy * BUILDING_SIZE;
    const data = { side: useSide, floor };
    const dbId = db.insertBuilding({ type: 'wall', owner_id: player.playerId, owner_name: player.name, x: wx, y: wy, data: JSON.stringify(data) });
    const id = `b${nextBid++}`;
    const building = { id, dbId, type: 'wall', ownerId: player.playerId, ownerName: player.name, x: wx, y: wy, data, floor };
    buildings.set(id, building);
    chunkManager.insertBuilding(building);
    send(player.ws, { type: 'inventory', inventory: player.inventory });
    savePlayer(player);
    broadcast({ type: 'building_added', building });
    return;
  }
  const cost = BUILDING_COST[type];
  if ((player.inventory.wood || 0) < cost.wood || (player.inventory.stone || 0) < cost.stone) {
    send(player.ws, { type: 'notice', text: `재료 부족 (나무 ${cost.wood}, 돌 ${cost.stone})` });
    return;
  }
  // farmland은 추가로 씨앗 필요
  if (cost.seed && (player.inventory[cost.seed] || 0) < 1) {
    send(player.ws, { type: 'notice', text: `${cost.seed} 1개 필요` });
    return;
  }
  // 격자에 스냅 (32 단위)
  const gx = Math.floor(player.x / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
  const gy = Math.floor(player.y / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;

  // 자기 claim 안에 있어야
  let inOwnClaim = false;
  for (const c of claims.values()) {
    if (c.ownerPid === player.playerId &&
        gx >= c.x && gx < c.x + c.w && gy >= c.y && gy < c.y + c.h) {
      inOwnClaim = true; break;
    }
  }
  if (!inOwnClaim) {
    send(player.ws, { type: 'notice', text: '자기 영지 안에서만 건축 가능' }); return;
  }

  // 같은 (x,y,floor)에 다른 건축물 없는지 — quadtree + floor 일치만 체크
  const nearBuilds = qtBuildings ? qtBuildings.queryCircle(gx, gy, BUILDING_SIZE * 1.5) : Array.from(buildings.values());
  for (const b of nearBuilds) {
    if ((b.floor || 0) !== floor) continue; // 다른 층은 OK (위/아래 가능)
    if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE) {
      send(player.ws, { type: 'notice', text: `이미 ${floor}F에 건축물이 있습니다` }); return;
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
    if (!supported) { send(player.ws, { type: 'notice', text: `${floor}F 짓려면 ${floor-1}F에 벽/바닥 필요` }); return; }
  }

  player.inventory.wood -= cost.wood;
  player.inventory.stone -= cost.stone;
  if (cost.seed) player.inventory[cost.seed] -= 1;
  let initialData = null;
  if (type === 'chest') initialData = { wood: 0, stone: 0 };
  else if (type === 'farmland') initialData = { cropType: 'berry', plantedAt: Date.now(), readyAt: Date.now() + CROP_GROW_MS, ready: false };
  // floor 정보는 data JSON에 합쳐 저장 (DB 스키마 변경 회피)
  const dataWithFloor = { ...(initialData || {}), floor };
  const dbId = db.insertBuilding({
    type, owner_id: player.playerId, owner_name: player.name,
    x: gx, y: gy, data: JSON.stringify(dataWithFloor),
  });
  const id = `b${nextBid++}`;
  const building = { id, dbId, type, ownerId: player.playerId, ownerName: player.name, x: gx, y: gy, data: initialData, floor };
  buildings.set(id, building);
  chunkManager.insertBuilding(building);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  savePlayer(player);
  broadcast({ type: 'building_added', building });
}

function tryChestPut(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'chest') return;
  if (b.ownerId !== player.playerId) {
    send(player.ws, { type: 'notice', text: '내 상자가 아닙니다' }); return;
  }
  // 가까이 있어야 (64px)
  if (Math.hypot(b.x - player.x, b.y - player.y) > 64) {
    send(player.ws, { type: 'notice', text: '상자에서 너무 멀리 있습니다' }); return;
  }
  if (item !== 'wood' && item !== 'stone') return;
  amount = Math.max(1, Math.min(99, amount | 0));
  if ((player.inventory[item] || 0) < amount) {
    send(player.ws, { type: 'notice', text: `${item} 부족` }); return;
  }
  player.inventory[item] -= amount;
  b.data = b.data || { wood: 0, stone: 0 };
  b.data[item] = (b.data[item] || 0) + amount;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'chest_state', buildingId: b.id, data: b.data });
}

function tryChestTake(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'chest') return;
  if (b.ownerId !== player.playerId) {
    send(player.ws, { type: 'notice', text: '내 상자가 아닙니다' }); return;
  }
  if (Math.hypot(b.x - player.x, b.y - player.y) > 64) {
    send(player.ws, { type: 'notice', text: '상자에서 너무 멀리 있습니다' }); return;
  }
  if (item !== 'wood' && item !== 'stone') return;
  amount = Math.max(1, Math.min(99, amount | 0));
  if (!b.data || (b.data[item] || 0) < amount) {
    send(player.ws, { type: 'notice', text: `상자에 ${item} 부족` }); return;
  }
  b.data[item] -= amount;
  player.inventory[item] = (player.inventory[item] || 0) + amount;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  savePlayer(player);
  send(player.ws, { type: 'inventory', inventory: player.inventory });
  send(player.ws, { type: 'chest_state', buildingId: b.id, data: b.data });
}

// === 전투 ===
function tryAttack(player) {
  const now = Date.now();
  if (now - player.lastAttackAt < PLAYER_ATTACK_COOLDOWN_MS) return;
  player.lastAttackAt = now;

  // 무기 효과 — 검 장착 시 데미지 배수
  const eff = player.equipped ? TOOL_EFFECTS[player.equipped] : null;
  const atk = Math.round(PLAYER_ATTACK_DAMAGE * (eff ? eff.attackMult : 1));

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
      // 사망 — 드롭 처리
      const def = MOB_DEFS[bestMob.type];
      for (const [item, amt] of Object.entries(def.loot)) {
        player.inventory[item] = (player.inventory[item] || 0) + amt;
      }
      send(player.ws, { type: 'inventory', inventory: player.inventory });
      send(player.ws, { type: 'notice', text: `${bestMob.type === 'deer' ? '사슴' : '늑대'} 사냥 +${Object.entries(def.loot).map(([k,v])=>`${k} ${v}`).join(', ')}` });
      savePlayer(player);
      // DB + chunk에서 제거
      if (bestMob.dbId) { try { db.deleteMob(bestMob.dbId); } catch (e) {} }
      chunkManager.removeMob(bestMob);
      mobs.delete(bestMob.mid);
      broadcast({ type: 'mob_removed', mid: bestMob.mid });
      // 일정 시간 후 리스폰 (새 DB row 생성됨)
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
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestPDist) { bestPlayer = p; bestPDist = d; }
  }
  if (bestPlayer) {
    // 같은 길드 — 절대 공격 불가
    if (player.tribeId && bestPlayer.tribeId === player.tribeId) {
      send(player.ws, { type: 'notice', text: '같은 길드 멤버는 공격 불가' });
      return;
    }
    // PvP 비활성 — 공격 차단
    if (!player.pvpEnabled) {
      send(player.ws, { type: 'notice', text: 'PvP 비활성화 상태 (V 키로 켜기)' });
      return;
    }
    damagePlayer(bestPlayer, atk, `player:${player.name}`);
    // PvP 공격 → vp 누적
    player.vp = Math.min(VP_MAX, (player.vp ?? 0) + VP_ATTACK_PLAYER);
    send(player.ws, { type: 'notice', text: `${bestPlayer.name} 공격 (위반 +${VP_ATTACK_PLAYER})` });
    send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst), vp: Math.round(player.vp) });
    savePlayer(player);
  }
}

function damagePlayer(p, dmg, source) {
  if (p.hp <= 0) return;
  p.hp -= dmg;
  p.lastDamagedAt = Date.now();
  broadcast({ type: 'player_damaged', pid: p.pid, hp: p.hp });
  if (p.hp <= 0) {
    p.hp = 0;
    if (p.isNpc) {
      // NPC: 30초 후 자기 사유지 중심에 부활
      console.log(`[${ZONE_ID}] 🤖 NPC ${p.name} 사망 (by ${source}) — ${NPC_RESPAWN_MS/1000}초 후 부활`);
      const respawnX = p.myClaim ? p.myClaim.x + p.myClaim.w/2 : WORLD.zoneWidth/2;
      const respawnY = p.myClaim ? p.myClaim.y + p.myClaim.h/2 : WORLD.zoneHeight/2;
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
    send(p.ws, { type: 'notice', text: '사망. 5초 후 부활합니다.' });
    // 5초 후 zone 중앙에 부활
    setTimeout(() => {
      if (!players.has(p.pid)) return;
      p.hp = p.maxHp;
      p.x = WORLD.zoneWidth / 2;
      p.y = WORLD.zoneHeight / 2;
      p.vx = 0; p.vy = 0;
      // 모든 mob의 어그로 해제 — 부활 직후 잠시 안전 시간
      for (const m of mobs.values()) {
        if (m.aggroTarget === p.pid) m.aggroTarget = null;
      }
      // 위치 포함해서 broadcast — 클라가 즉시 동기화
      broadcast({ type: 'player_respawn', pid: p.pid, hp: p.hp, x: p.x, y: p.y });
      send(p.ws, { type: 'notice', text: '부활했습니다.' });
    }, 5000);
  }
}

// === PZ식 wall edge 콜라이더 ===
// wall은 cell edge에 있음. side ∈ {N, E} 정규화.
// N wall = cell (cx, cy)의 북쪽 edge = y = cy*BUILDING_SIZE 라인
// E wall = cell (cx, cy)의 동쪽 edge = x = (cx+1)*BUILDING_SIZE 라인
// 이동 (oldX, oldY) → (newX, newY)가 wall edge 가로지르면 차단.
function cellOf(x, y) { return { cx: Math.floor(x / BUILDING_SIZE), cy: Math.floor(y / BUILDING_SIZE) }; }
function findEdgeWall(cx, cy, side, floor) {
  // qtBuildings에서 그 위치 wall 찾기
  const ex = cx * BUILDING_SIZE + (side === 'E' ? BUILDING_SIZE : 0);
  const ey = cy * BUILDING_SIZE + (side === 'N' ? 0 : BUILDING_SIZE / 2);
  const nearby = qtBuildings ? qtBuildings.queryCircle(ex, ey, BUILDING_SIZE) : Array.from(buildings.values());
  for (const b of nearby) {
    if (!BLOCKING_BUILDINGS.has(b.type)) continue;
    if ((b.floor || 0) !== floor) continue;
    const bSide = b.data?.side;
    const bcx = Math.floor(b.x / BUILDING_SIZE);
    const bcy = Math.floor(b.y / BUILDING_SIZE);
    if (bcx === cx && bcy === cy && bSide === side) return true;
  }
  return false;
}
function isBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0) {
  // 같은 cell 안 이동 — wall 가로지르지 않음
  const oc = cellOf(oldX, oldY);
  const nc = cellOf(newX, newY);
  if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
  // 동쪽 이동 (cx 증가): oc.E edge (= nc.W = (oc.cx+1, oc.cy).W = oc.E)
  if (nc.cx > oc.cx && findEdgeWall(oc.cx, oc.cy, 'E', playerFloor)) return true;
  // 서쪽 이동: nc.E edge
  if (nc.cx < oc.cx && findEdgeWall(nc.cx, nc.cy, 'E', playerFloor)) return true;
  // 남쪽 이동 (cy 증가): oc.S = (oc.cx, oc.cy+1).N = nc.N
  if (nc.cy > oc.cy && findEdgeWall(nc.cx, nc.cy, 'N', playerFloor)) return true;
  // 북쪽 이동: oc.N edge
  if (nc.cy < oc.cy && findEdgeWall(oc.cx, oc.cy, 'N', playerFloor)) return true;
  return false;
}

// === 게임 틱 ===
const TICK_MS = 1000 / TICK_HZ;
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;

  // === 활성 청크 갱신 (player·observer 위치 기반) ===
  updateActiveChunks();

  // === Spatial index 재구축 — 모든 nearest-search가 이걸 씀 ===
  rebuildSpatialIndex();

  // 입력 타임아웃 — 1초 동안 입력 없으면 정지
  for (const p of players.values()) {
    if (p.handingOff) continue;
    if (now - p.lastSeen > 1000) { p.vx = 0; p.vy = 0; }
  }

  // === NPC 행동 결정 (사람 player는 input으로 vx/vy 받지만 NPC는 직접 결정) ===
  // 비활성 청크 NPC는 멈춤 (CPU 절약). 가까이 player 오면 자동 재개.
  for (const pid of npcs) {
    const npc = players.get(pid);
    if (!npc || npc.hp <= 0) continue;
    if (!isPositionActive(npc.x, npc.y)) { npc.vx = 0; npc.vy = 0; continue; }
    npcStep(npc, dt, now);
  }
  // 농지 ready 마크 (시간 지남) — 한 번 ready되면 그대로
  for (const b of buildings.values()) {
    if (b.type === 'farmland' && b.data && !b.data.ready && now >= b.data.readyAt) {
      b.data.ready = true;
      // broadcast 안 함 — 클라가 시간 보고 자체 판단
    }
  }

  // 이동 + 경계 처리 + 벽 충돌
  for (const p of players.values()) {
    if (p.handingOff) continue;
    // NPC는 zone 핸드오프 안 함 (사유지에 묶임). 경계 넘으면 그냥 클램프.
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;

    // PZ식 edge 콜라이더 — 각 축 별로 따로 처리해서 slide 가능. player floor만.
    const pf = p.floor || 0;
    if (isBlockedByWall(nx, p.y, p.x, p.y, pf)) nx = p.x;
    if (isBlockedByWall(p.x, ny, p.x, p.y, pf)) ny = p.y;
    if (isBlockedByWall(nx, ny, p.x, p.y, pf)) { nx = p.x; ny = p.y; }

    // 4방향 경계 처리 — 새 위치가 zone 밖으로 나가면 이웃으로 핸드오프
    // 우선순위: 가장 큰 초과 축. 모서리에서 두 방향 동시에 초과돼도 한 zone으로만.
    const outW = -nx;                              // 서쪽 초과량 (>0이면 밖)
    const outE = nx - WORLD.zoneWidth;             // 동쪽 초과량
    const outN = -ny;                              // 북쪽 초과량
    const outS = ny - WORLD.zoneHeight;            // 남쪽 초과량
    const maxOut = Math.max(outW, outE, outN, outS);
    // DEBUG — 1초마다 1회만
    if ((p.vy !== 0 || p.vx !== 0) && (!p._dbgT || now - p._dbgT > 1000)) {
      p._dbgT = now;
      console.log(`[${ZONE_ID}/dbg] ${p.name} pos=(${nx.toFixed(0)},${ny.toFixed(0)}) v=(${p.vx.toFixed(0)},${p.vy.toFixed(0)}) maxOut=${maxOut.toFixed(0)} N=${ZONE.north||'∅'} handingOff=${p.handingOff}`);
    }
    // NPC는 zone 핸드오프 안 함 — 항상 클램프
    if (maxOut > 0 && p.isNpc) {
      p.x = clamp(nx, 0, WORLD.zoneWidth);
      p.y = clamp(ny, 0, WORLD.zoneHeight);
      // 경계 닿으면 NPC가 다음 결정 다시 — 안 막힘
      p.nextDecisionAt = 0;
    } else if (maxOut > 0) {
      if (outW === maxOut && ZONE.west) {
        p.x = nx; p.y = ny;
        fireHandoff(p, ZONE.west, WORLD.zoneWidth + nx, clamp(ny, 0, WORLD.zoneHeight));
      } else if (outE === maxOut && ZONE.east) {
        p.x = nx; p.y = ny;
        fireHandoff(p, ZONE.east, nx - WORLD.zoneWidth, clamp(ny, 0, WORLD.zoneHeight));
      } else if (outN === maxOut && ZONE.north) {
        p.x = nx; p.y = ny;
        fireHandoff(p, ZONE.north, clamp(nx, 0, WORLD.zoneWidth), WORLD.zoneHeight + ny);
      } else if (outS === maxOut && ZONE.south) {
        p.x = nx; p.y = ny;
        fireHandoff(p, ZONE.south, clamp(nx, 0, WORLD.zoneWidth), ny - WORLD.zoneHeight);
      } else {
        // 이웃 없는 방향 — clamp
        p.x = clamp(nx, 0, WORLD.zoneWidth);
        p.y = clamp(ny, 0, WORLD.zoneHeight);
      }
    } else {
      p.x = nx;
      p.y = ny;
    }
  }

  // === 생존 게이지: hunger/thirst 감소 + 0이면 HP 페널티 + vp decay ===
  for (const p of players.values()) {
    if (p.hp <= 0) continue;
    p.hunger = Math.max(0, (p.hunger ?? HUNGER_MAX) - HUNGER_DRAIN_PER_SEC * dt);
    p.thirst = Math.max(0, (p.thirst ?? THIRST_MAX) - THIRST_DRAIN_PER_SEC * dt);
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
    if (p.hp > 0 && p.hp < p.maxHp && now - p.lastDamagedAt > 1000) {
      if ((p.hunger ?? HUNGER_MAX) > 10 && (p.thirst ?? THIRST_MAX) > 10) {
        p.hp = Math.min(p.maxHp, p.hp + 2 * dt * 5); // 초당 ~10hp
      }
    }
  }

  // === 게이지 변화 주기 broadcast (1초 간격, self에만) ===
  for (const p of players.values()) {
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
      nx = clamp(nx, 0, WORLD.zoneWidth);
      ny = clamp(ny, 0, WORLD.zoneHeight);
      if (isBlockedByWall(nx, m.y, m.x, m.y, 0)) nx = m.x;
      if (isBlockedByWall(m.x, ny, m.x, m.y, 0)) ny = m.y;
      if (Math.abs(nx - m.x) + Math.abs(ny - m.y) > 2) m.dirty = true;
      m.x = nx; m.y = ny;
      chunkManager.updateMobChunk(m);
      continue;
    }

    // 어그로 타겟 검증 — 타겟 죽음/실종/시야 밖/다른 floor면 해제. 늑대는 영역 너무 벗어났을 때도 해제.
    if (m.aggroTarget) {
      const t = players.get(m.aggroTarget);
      const tooFarFromTarget = !t || t.hp <= 0 || Math.hypot(t.x - m.x, t.y - m.y) > sight * 1.5;
      const differentFloor   = t && (t.floor || 0) !== 0; // mob은 항상 0F. 다른 층 캐릭터는 못 잡음.
      const tooFarFromHome   = m.type === 'wolf' && Math.hypot(m.x - m.homeX, m.y - m.homeY) > WOLF_TERRITORY_RADIUS;
      if (tooFarFromTarget || differentFloor || tooFarFromHome) m.aggroTarget = null;
    }
    // 늑대만: 시야 안 플레이어 어그로. 단 영역 안에서만 사냥 시작.
    if (m.type === 'wolf' && !m.aggroTarget) {
      const homeDist = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (homeDist < WOLF_TERRITORY_RADIUS) {
        // quadtree로 sight 안 플레이어만 추림 (늑대 영역 안에 있으면 시야 안 player 무조건 어그로)
        const nearby = qtPlayers ? qtPlayers.queryCircle(m.x, m.y, sight) : Array.from(players.values());
        let best = null, bestD = sight;
        for (const p of nearby) {
          if (p.hp <= 0) continue;
          if ((p.floor || 0) !== 0) continue; // 다른 floor 캐릭터 못 잡음
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d < bestD) { best = p; bestD = d; }
        }
        if (best) {
          m.aggroTarget = best.pid;
          aggroPackmates(m, best.pid); // 팩 동료들 동시 어그로
        }
      }
    }
    // 이동
    if (m.aggroTarget) {
      const t = players.get(m.aggroTarget);
      if (t) {
        const dx = t.x - m.x, dy = t.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 30) {
          m.vx = (dx / d) * def.speed;
          m.vy = (dy / d) * def.speed;
        } else {
          // 공격 범위 — 데미지 (밤이면 강화)
          m.vx = 0; m.vy = 0;
          if (now - m.lastAttackAt > 1000) {
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
    nx = clamp(nx, 0, WORLD.zoneWidth);
    ny = clamp(ny, 0, WORLD.zoneHeight);
    if (isBlockedByWall(nx, m.y, m.x, m.y, 0)) nx = m.x;
    if (isBlockedByWall(m.x, ny, m.x, m.y, 0)) ny = m.y;
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
      const e = { pid: o.pid, x: o.x, y: o.y, hp: o.hp, floor: o.floor || 0 };
      if (isNew) { e.name = o.name; e.color = o.color; e.maxHp = o.maxHp; e.tribeName = o.tribeName || null; }
      return e;
    }
    const e = { mid: o.mid, x: o.x, y: o.y, hp: o.hp };
    if (isNew) { e.type = o.type; e.maxHp = o.maxHp; e.tameOwner = o.tameOwner || null; e.tameOwnerName = o.tameOwnerName || null; }
    return e;
  }
  function visiblePlayers(vx, vy, selfPid, viewerState) {
    const nearby = qtPlayers.queryCircle(vx, vy, AOI_RADIUS);
    const prevSeen = viewerState.seenPlayers;
    const newSeen = new Set();
    const result = [];
    for (const o of nearby) {
      newSeen.add(o.pid);
      result.push(makeEntry(o, !prevSeen.has(o.pid), 'player'));
    }
    if (selfPid && !newSeen.has(selfPid)) {
      const self = players.get(selfPid);
      if (self) { newSeen.add(selfPid); result.push(makeEntry(self, !prevSeen.has(selfPid), 'player')); }
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
    if (!p.viewerState) p.viewerState = { seenPlayers: new Set(), seenMobs: new Set() };
    send(p.ws, {
      type: 'tick', t: now,
      players: visiblePlayers(p.x, p.y, p.pid, p.viewerState),
      mobs: visibleMobs(p.x, p.y, p.viewerState),
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
}, TICK_MS);

// === 핸드오프 fire (HTTP POST + 토큰 발급) ===
async function fireHandoff(player, targetZoneId, newX, newY) {
  if (player.handingOff) return;
  if (player.lastHandoffFailAt && Date.now() - player.lastHandoffFailAt < 2000) return;
  // 핸드오프 시점의 vx/vy를 새 zone에 그대로 전달 — 새 zone에서 즉시 이어 이동
  // 그래야 클라가 새 ws OPEN하고 input 보내기까지의 갭에도 player가 멈추지 않음
  const carryVx = player.vx;
  const carryVy = player.vy;
  player.handingOff = true;
  player.vx = 0;
  player.vy = 0;
  player.x = Math.max(0, Math.min(WORLD.zoneWidth, player.x));
  player.y = Math.max(0, Math.min(WORLD.zoneHeight, player.y));
  const target = ZONES[targetZoneId];
  if (!target) { player.handingOff = false; return; }
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
    width: WORLD.zoneWidth,
    height: WORLD.zoneHeight,
    tileSize: WORLD.tileSize,
    worldOffsetX: ZONE.worldOffsetX,
    worldOffsetY: ZONE.worldOffsetY,
    west: ZONE.west,
    east: ZONE.east,
    north: ZONE.north,
    south: ZONE.south,
  };
}

server.listen(PORT, () => {
  console.log(`[${ZONE_ID}] 🌏 zone server up on :${PORT}  latency=${LATENCY_MS}ms (RTT≈${LATENCY_MS*2}ms)`);
  console.log(`        biome=${ZONE.biome}  W=${ZONE.west||'∅'}  E=${ZONE.east||'∅'}  N=${ZONE.north||'∅'}  S=${ZONE.south||'∅'}`);
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
