// 존 서버 — 한 지역의 시뮬레이션을 권위적으로 처리
// 환경변수 ZONE_ID, PORT 로 어떤 존을 띄울지 결정
//
// 실제 분산 배포에서는 각 ZONE을 다른 국가의 서버에서 실행하면 됨.
// 프로토타입에서는 같은 머신에서 다른 포트로 시뮬레이션.

const WebSocket = require('ws');
const http = require('http');
const { ZONES, WORLD, isNight, worldPhase, darknessLevel, findZoneAt, worldDistance, worldDeltaX } = require('./zone-config');
const db = require('./zone-local-db'); // 로컬 zone DB — players 없음
const SimVillages = require('./villages'); // §4-4 NPC 마을 시뮬 — top-level은 상수뿐(실작업은 아래 init 호출, ENABLE_VILLAGES=0이면 완전 no-op)
// ★[2026-08-03e 배치 12 · 테스트 전용 손잡이] 기본 OFF. `E2E_GIVE=1` 일 때만 `__e2e_give` 분기가 산다(입력 핸들러 참조).
const E2E_GIVE = (process.env.E2E_GIVE === '1');
const Wildlife = require('./wildlife'); // §4-4 동물 AI 블록(마을실험실 이식) — 야생 5종 생태. ENABLE_WILDLIFE=0 → 완전 no-op
// ★★[2026-08-26 재민 확정] `ENABLE_WILDLIFE=0` 의 뜻 = **적대 개체 전부 OFF**.
//   왜 의미를 넓혔나: 종전엔 이 플래그가 `wildlife.js`(§4-4 생태 블록)만 껐고
//   **레거시 `mobs`(늑대·자칼 무리)는 그대로 살아 있었다.** 그래서 `ENABLE_WILDLIFE=0` 으로
//   "야생 껐다"고 믿은 하네스에서 **검사 플레이어가 늑대에게 물려 죽었고**
//   (실측 로그: `☠️ 여행자(p401) 사망 — by mob:wolf`), 그 사망 모달이 화면을 덮어
//   `e2e-terrain` 이 **없는 물 렌더 결함 3건**을 보고했다. 원인을 좇는 데 두 배치가 들었다.
//   ⇒ **플래그를 새로 만들지 않는다.** 두 개가 되면 다음 세션이 하나만 끄는 사고가 그대로 재생산된다.
//     이 플래그 하나가 ①`wildlife.js` no-op ②레거시 공격 개체 스폰·리스폰 금지
//     ③**몹→플레이어 피해 0** 을 전부 뜻한다. 평화 개체(사슴·양)는 그대로 둔다 — 적대가 아니다.
//   ⚠기본은 **켜짐**. 이 값을 끄는 곳은 전부 하네스·스크립트다(운영 사용처 0):
//     e2e-terrain · test-tame · test-mining · test-furnace · pace-metallurgy · era-rehearsal.
//     전부 "야생 없는 결정론"을 원해서 끄던 것이라, 의미가 넓어지면 **더 조용해질 뿐** 깨지지 않는다.
const HOSTILES_ON = process.env.ENABLE_WILDLIFE !== '0';
// ★★[2026-08-26 재민 확정] **주기 저장.** 종전엔 `savePlayer` 가 접속·종료·핸드오프·행동 때만 돌았다.
//   그래서 **걷기만 한 진행은 어디에도 없었다** — 서버가 죽거나 재시작하면 마지막 행동 이후가 증발한다.
//   (B-6 수리는 "두 세션이 겹치는" 갈래만 막았다. 크래시 갈래는 그대로였다.)
//   기본 30초. 전원 일괄이 아니라 **틱 분산**(플레이어마다 다음 저장 시각을 흩어 둔다)이고,
//   **움직인 사람만** 쓴다(인벤·행동은 원래 그 자리에서 저장하므로 위치만 보면 된다).
//   ⚠B-6 규칙과의 정합: **밀려난 세션(`_supersededBy`)은 주기 저장에서도 제외**한다 —
//     아니면 낡은 좌표 덮어쓰기가 뒷문으로 부활한다(그 갈래를 `test-guest-rejoin` 이 밟는다).
const SAVE_INTERVAL_MS = Math.max(1000, parseInt(process.env.SAVE_INTERVAL_MS || '', 10) || 30000);
const SAVE_MOVE_EPS = 2;   // 이만큼도 안 움직였으면 쓸 게 없다(px)
const Winter = require('./winter');   // ★[T20] 겨울나기 — 초기화는 villages.js(장부 옆), 여기선 납품 훅 한 줄
const Bandits = require('./bandits'); // §11 도적 캐논 1파(경제·수명주기 — 소굴·해체 전환·econ 약탈 훅). ENABLE_BANDITS=0 → 완전 no-op, ENABLE_VILLAGES=0이면 자동 휴면
const Roads = require('./roads'); // §16 답압 길 4파(희소맵·게으른 감쇠·DB 영속·A* 할인). ENABLE_ROADS=0 → 완전 no-op
const Soil = require('./soil');   // [배치 20 B] 동적 토양치·지질(희소맵·게으른 리젠·DB 영속·렌더 전용). ENABLE_SOIL=0 → 기준선만
const Rooms = require('./rooms'); // ★[배치 18 ①] 방 판정 정본(벽·문으로 닫힌 '바닥 깔린' 셀 집합). 서버가 판정해 클라에 실어 준다 — 클라 재계산 금지(사본 방지)
const SIM_LON_ON = process.env.VILLAGE_LON !== '0'; // §19 경도 로컬 태양시(마을 NPC 야간 귀가) 게이트 — 기본 켜짐
const central = require('./central-client'); // central HTTP 클라이언트
const { Quadtree } = require('./quadtree'); // spatial index — O(N²) 검색 회피
const { ChunkManager, CHUNK_SIZE, generateChunkResources, generateVillagesForZone, generateCoastlineWaterTiles } = require('./chunk'); // 청크 단위 entity 분류 + procedural + 해안선
const { findPath: pfFindPath } = require('./pathfind'); // Phase 14.49-b: NPC A* pathfinding
const PathCore = require('../sim/path-core.js'); // ★[생활 층 100% ①] 랩·서버 공용 경로 정본 — smoothPath(스트링 풀링)를 주민 이동에 직결
const { ANIMALS } = require('./animals');  // Phase 5-6: 동물 mob 36종 catalog
const GuildTreasury = require('./guild-treasury'); // 길드 곳간(물리) ↔ central 금고(회계) 정합 — 장부 계약은 그 파일 상단 참조
const PlayerItems = require('./player-items'); // 플레이어 아이템 인스턴스(품질·속성·내구) — econ 무접촉·본체 서버층(설계: 플레이어_아이템_속성_설계.md)
// ★[부패·보존 배치 2026-08-31] 부패 곡선·보존 가공의 정본. 여기(아래 FOOD_EFFECTS 보다 위)에서
//   부르는 이유: 식품 효과표가 보존식 4종을 **이 모듈에서 파생**하기 때문이다(목록 두 벌 금지).
const Spoil = require('./spoil');
// ★★[작물 층 2026-08-31] 작물 정본 — 재민의 `한국작물_카탈로그.xlsx` 34종이 여기로 들어온다.
//   보관일·포만감·무게·성장일·파종철·수확량이 전부 그 표에서 파생된다(이 파일에 표를 안 적는다).
const Crops = require('./crops');
const Salt = require('./salt');            // ★[자염 배치 2026-09-01] 염도·수율·땔감·시간 정본 하나
const ItemLabel = require('./itemlabel');  // ★[T61] 이름표 정본이 사는 곳(품목 합치기 · econ 자원 종류 이름)
const Onboarding = require('./onboarding');   // ★[온보딩 v2 2026-09-01] 도착 지점·30분 대본·빈터 권리 정본(§9). init 전엔 완전 no-op
const Membership = require('./membership');   // ★[T11 2026-09-02] 마을 소속·곳간 인출. 기여 계량기는 온보딩 정본 **하나**를 읽는다
const Claims = require('./claims');           // ★[T45 2026-09-02] 사유지 v2 — 종류 영속·인접·연결성·부재 상태기(정본 하나)
const Newcomers = require('./newcomers');     // ★[T19 2026-09-02] 유저 마을 시작지 등록 — "이방인 받기"(§9.3 나머지 절반)
const Rescue = require('./rescue');           // ★[T56 2026-09-02] 외침·구조 동사 둘. 판정은 전부 정본을 부른다(사본 0)
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
  // §4-4 Stage 4A: 마을 농지 — village_buildings(수만 행)에서 '비영속 시각 타일'로 직접 실물화.
  //   buildings 테이블에 행을 만들지 않아(행 폭발 방지) DB 쓰기 0. id 'vb<rowid>' 결정적이라
  //   비활성→재활성·재부팅에도 클라 참조 안정. dbId=null — 모든 DB 쓰기 경로는 if(b.dbId) 가드.
  //   비활성/AOI/quadtree/충돌은 이 아래 기존 경로가 일반 건물과 동일하게 처리(추가 코드 없음).
  //   ENABLE_VILLAGES=0 → farmTilesInRect가 [] (state.ready=false) — 완전 no-op.
  for (const vt of SimVillages.farmTilesInRect(x0, y0, x1, y1)) {
    if (buildings.has(vt.id)) continue;
    buildings.set(vt.id, vt);
    chunkManager.insertBuilding(vt);
  }
}

// 활성화 — 그 청크의 시드 자원 생성
// 14.46-b-smooth-fix: water tile에 떨어진 자원(나무·돌·약초 등)은 스킵.
//   기존: 해안선 water tile 위에 나무·돌 spawn → 바다에 떠 있는 모양 버그.
function activateChunk(cx, cy) {
  // 건물 lazy-load: 이 청크 건물을 DB에서 메모리로 (cleanZone보다 먼저 — cleanZone엔 건물 0이라 무해).
  materializeBuildingsInChunk(cx, cy);
  roomsScanChunk(cx, cy);   // ★[배치 18 ①] 건물이 메모리에 올라온 직후에 방을 찾는다(플레이어 바닥만 시드)
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
    roomsDropChunk(c);   // ★[배치 18 ①] 건물을 내리기 전에 그 청크 방부터 내린다
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
// ★★[2026-08-03g 배치 14 ②] **저장 대상인가** — 판정을 한 함수로 모은다(사본 금지).
//   종전 판정은 `playerId.startsWith('anon_')` 하나였고, 그게 곧 "게스트는 저장 안 함" 정책이었다.
//   배치 13 뒤로 `anon_` 은 **두 종류**다: central 이 발급한 영속 게스트(토큰 있음)와
//   central 불가 시의 1회용 폴백. 접두사로는 못 가르므로 접속 때 정해지는 `player.persistent` 를 본다.
//   ⚠NPC(`npc_*`)는 언제나 제외 — 저장 대상이 아니다.
//   ⚠이 술어가 **한 곳에만** 있어야 한다. 종전엔 호출부 17곳이 각자 `anon_` 를 다시 검사하고 있었다
//     — 그 사본들 때문에 게스트 저장을 켜도 대부분의 경로에서 조용히 안 켜졌을 것이다.
function canPersist(player) {
  if (!player || !player.playerId) return false;
  if (player.playerId.startsWith('npc_')) return false;
  if (player.playerId.startsWith('anon_')) return !!player.persistent;   // 영속 게스트만
  return true;                                                            // 등록 계정
}
// ★★[T47 2026-09-01 재민 확정] **몸의 정본은 한 곳, 직렬화는 한 함수.**
//
//   왜: 존을 넘으면 도구가 **영구히** 사라졌다(N.6 · 28회 왕복 전부 재현). 원인은 하나가 아니라
//   **복원 코드가 두 벌**이었다는 것이다 — 일반 접속은 central 행을 읽어 13가지를 복원하는데,
//   핸드오프 도착은 `pending` 페이로드만 읽었고 그 페이로드엔 그 13 중 **12가 없었다.**
//   그리고 도착 존의 `savePlayer` 가 빈 몸으로 계정을 덮어 재접속으로도 못 돌아왔다.
//
//   ⇒ 그래서 필드를 채우는 대신(그 길은 새 필드가 생길 때마다 또 빠진다) **직렬화를 한 함수로 모았다.**
//     저장·핸드오프·재접속이 전부 `serializeBody`/`parseBody` 를 쓴다. 앞으로 몸에 필드가 늘면
//     셋이 **동시에** 따라간다 — "또 빠진다"가 구조적으로 불가능해진다.
//
//   ⚠새 필드를 몸에 더할 자리는 **여기 하나**다. `savePlayer` 나 도착 경로에 직접 쓰지 마라.
function serializeBody(p) {
  return {
    toolItems: p.toolItems || [],
    hotkey1: p.hotkey1 || null,
    equipped: p.equipped || null,
    equipment: p.equipment || [],   // 플레이어 아이템 인스턴스 영속(품질·속성·내구)
    equipSlots: p.equipSlots || {},  // 장착 슬롯
    craftSkill: p.craftSkill || {},  // 제작 숙련 xp
    oreLedger: p.oreLedger || {},    // ★[11차] 캔 원석의 **숨은 정체 장부**(kg) — 선광 전까지 클라에 안 보낸다
    oreCarry: p.oreCarry || {},      // ★선광 소수분 이월(kg) — 버리지 않는다
    fishStats: p.fishStats || null,  // ★[낚시 v2] 어획 기록 — 이력서 패널(§8.4)의 첫 씨앗
    body: Body.toSave(p),            // ★[신체 상태 §7] 추위·피로·부상·사기(허기·갈증은 전용 컬럼)
    kgLedger: Carry.toSave(p),       // ★[무게] 개체 실제 kg 장부(1.7kg 물고기 ≠ 0.4kg 물고기)
    lots: Lots.toSave(p),            // ★[무게] 식품 로트(취득일) — 부패 곡선이 앉을 자리
    craftLog: p.craftLog || {},      // ★[시설 제작창] 제작 이력(횟수·최고 품질) — §8.4 스킬 패널이 읽을 씨앗
    // ★★[T7 2026-09-01] **마지막으로 세계를 본 게임일** — 복귀 브리핑의 유일한 근거.
    //   벽시계(ms)가 아니라 게임일이다: 촌장이 세는 건 날이지 초가 아니고, 달력·사건·작물이
    //   전부 그 시계를 본다(`gameDayNow` — 시계 사본 금지). 값 선택 규칙은 `_lastSeenDayToSave`.
    lastSeenDay: _lastSeenDayToSave(p),
    // ★★[T11 2026-09-02] **마을 소속** — { zone, vid, name, since, wdDay, wdUsed }.
    //   여기 두는 이유가 곧 T47 의 교훈이다: 저장·핸드오프·재접속이 이 함수 하나를 쓰므로
    //   소속은 **셋을 동시에** 넘는다(존 로컬 표를 새로 파면 존을 넘는 순간 없던 일이 된다).
    member: p.member || null,
    // ★생명값 — **핸드오프만** 쓴다(아래 `parseBody(.., {vitals:true})`).
    //   존을 넘는 것은 한 접속의 연속이므로 여기서 HP 가 회복되면 그건 결함이다(같은 존 안에서는
    //   `_takeover` 가 이미 잇고 있다). 반면 **로그아웃 후 재접속의 풀피는 정책**이고, 그건
    //   죽음 설계(T8)의 소관이라 이 배치가 안 바꿨다 — 그래서 저장은 하되 로그인 복원이 무시한다.
    vital: { hp: p.hp, maxHp: p.maxHp, isDown: !!p.isDown, downedAt: p.downedAt || 0 },
  };
}
// 복원 — 옛 형식(`{axe: 3}`)까지 여기서 흡수한다. 반환값의 키는 `serializeBody` 와 같다.
//   `opts.vitals` 가 참일 때만 `vital` 을 돌려준다(위 주석 — 로그인은 안 받는다).
function parseBody(raw, opts) {
  const o = (raw && typeof raw === 'object') ? raw : {};
  const out = {
    toolItems: [], hotkey1: null, equipped: null,
    equipment: [], equipSlots: {}, craftSkill: {}, craftLog: {},
    oreLedger: {}, oreCarry: {}, fishStats: null, body: null, kgLedger: null, lots: null, vital: null,
    lastSeenDay: null,   // ★[T7] 없으면 처음 온 사람 — 복귀 브리핑은 안 나간다
    member: null,        // ★[T11] 마을 소속 — 없으면 무소속(처음 온 사람은 늘 무소속이다)
  };
  if (Array.isArray(o.equipment)) out.equipment = o.equipment;
  if (o.equipSlots && typeof o.equipSlots === 'object') out.equipSlots = o.equipSlots;
  if (o.craftSkill && typeof o.craftSkill === 'object') out.craftSkill = o.craftSkill;
  if (o.craftLog && typeof o.craftLog === 'object') out.craftLog = o.craftLog;
  if (o.oreLedger && typeof o.oreLedger === 'object') out.oreLedger = o.oreLedger;
  if (o.oreCarry && typeof o.oreCarry === 'object') out.oreCarry = o.oreCarry;
  if (o.fishStats && typeof o.fishStats === 'object') out.fishStats = o.fishStats;
  if (o.body && typeof o.body === 'object') out.body = o.body;
  if (o.kgLedger && typeof o.kgLedger === 'object') out.kgLedger = o.kgLedger;
  if (o.lots && typeof o.lots === 'object') out.lots = o.lots;
  if (Number.isFinite(o.lastSeenDay)) out.lastSeenDay = o.lastSeenDay | 0;   // ★[T7]
  if (o.member && typeof o.member === 'object' && o.member.vid != null) out.member = o.member;   // ★[T11] 소속
  if (opts && opts.vitals && o.vital && typeof o.vital === 'object') out.vital = o.vital;
  // 14.53: 옛 tools (object 또는 number 형식) → 새 toolItems list 변환
  if (Array.isArray(o.toolItems)) {
    out.toolItems = o.toolItems;
    out.hotkey1 = o.hotkey1 || null;
    if (typeof o.equipped === 'string') out.equipped = o.equipped;
  } else {
    // 옛 형식 — { axe: number|{d,max} } → instance 변환
    for (const [tn, val] of Object.entries(o)) {
      if (['hotkey1', 'toolItems', 'equipped', 'equipment', 'equipSlots', 'craftSkill', 'craftLog',
           'oreLedger', 'oreCarry', 'fishStats', 'body', 'kgLedger', 'lots', 'vital',
           'lastSeenDay', 'member'].includes(tn)) continue;   // ★[T11] 'member' 추가 — 옛 도구 형식으로 오독되면 안 된다
      const mx = TOOL_MAX_DURABILITY[tn] || 100;
      let d = mx;
      if (typeof val === 'number' && val > 0) d = mx;
      else if (val && typeof val === 'object' && typeof val.d === 'number') d = val.d;
      else continue;
      if (d > 0) out.toolItems.push({ id: genToolId(), type: tn, d, max: mx });
    }
    out.equipped = null; // 옛 equipped 이름 → instance id로 매핑 불가, 그냥 해제
  }
  return out;
}

// ★★[T7 2026-09-01] **아직 전하지 못한 부재는 저장본을 앞당기지 않는다.**
//   왜: 클라는 입장 직후 소켓을 한 번 갈아 끼운다(`ensurePrimaryConnection` 의 close→connect).
//   그 사이 첫 접속의 저장이 기준일을 **오늘로** 덮으면, 두 번째 접속은 "부재 0일" 로 태어난다.
//   승계(`_takeover`)가 걸리면 메모리로 넘어가지만, 부하가 높은 판에서는 옛 몸이 이미 지워진 뒤라
//   승계가 안 걸린다 — 그러면 저장본이 유일한 진실이고, 그 저장본이 이미 거짓이 되어 있다.
//   (`e2e-rumor` 가 러너 연속 실행에서만 그 갈래를 밟았다 — 족보 ㊾ 의 "부하 의존" 이 아니라 **경합**이었다.)
//   ⇒ 브리핑으로 **전해질 때까지** 기준일을 붙잡아 둔다. 전한 뒤에는 평소대로 오늘을 찍는다.
//   ⇒ 접속을 끊을 때는 close 핸들러가 `player.lastSeenDay` 를 **그날로 먼저 찍으므로**,
//     "마을에 한 번도 안 들른 채 로그아웃" 해도 다음 부재는 로그아웃 시점부터 센다.
function _lastSeenDayToSave(player) {
  if (!player._returnBriefDone && Number.isFinite(player.lastSeenDay)) return player.lastSeenDay;
  return gameDayNow();
}
function savePlayer(player, extra = {}) {
  if (!canPersist(player)) return;
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
    // ★[T47] 몸의 직렬화는 `serializeBody` **하나**다(위 주석) — 저장·핸드오프가 같은 것을 쓴다.
    tools_json: JSON.stringify(serializeBody(player)),
    equipped: player.equipped || null,
    last_zone: extra.last_zone ?? null, // 명시적으로 넘긴 zone만 변경
    last_x: extra.last_x ?? player.x,
    last_y: extra.last_y ?? player.y,
    color: player.color,
    ...extra,
  };
  // ★[T47] **Promise 를 돌려준다.** 평시 호출부는 그대로 fire-and-forget 이고,
  //   핸드오프만 `await` 한다 — 도착 존이 central 행을 읽을 때 이미 최신이어야 하기 때문이다.
  // ★★[T42-b 2026-09-01] **날아가는 쓰기를 센다.** fire-and-forget 은 "안 기다린다"는 뜻이지
  //   "끝났다"는 뜻이 아니다. 이 수가 0 이 아니면 서버는 **한가하지 않다** — 배경 작업
  //   (교역로 선계산)이 그동안 루프를 잡으면 이 쓰기가 소켓 밖으로 못 나간다.
  //   실제로 그렇게 깨졌다: `e2e-rumor ⑦` 복귀 브리핑이 "부재 0일"(`인계/Z-존서버.md ## T42.`).
  _savesInFlight++;
  return central.updatePlayer(player.playerId, patch).catch(e =>
    console.warn(`[${process.env.ZONE_ID || 'zone'}] central save 실패 (${player.playerId}):`, e.message)
  ).finally(() => { _savesInFlight--; _savesDoneAt = Date.now(); });
}
// ★[T42-b] 날아가는 central 쓰기 수와 **마지막으로 착지한 시각**. `SimVillages.init` 에 술어로 넘긴다.
let _savesInFlight = 0, _savesDoneAt = Date.now();   // ★부팅도 '방금 일이 있었다'로 본다(재기동 = 접속이 몰리는 때)
// ★[T42-b] 처리 중인 접속 수와 마지막으로 끝난 시각(등록 전에는 `players` 에 안 보인다).
let _connsInFlight = 0, _connsDoneAt = Date.now();
function ioBusy() { return _savesInFlight > 0 || _connsInFlight > 0; }
function ioQuietMs() {
  if (ioBusy()) return 0;
  return Date.now() - Math.max(_savesDoneAt, _connsDoneAt);
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
// ★★[배치 15 ① 재민 확정 "끄자"] 레거시 마을 실체화 스위치 — 존 설정 `legacyVillages: false`.
//   VILLAGES 는 **레거시 실체화 전용 목록**이다. 이게 비면 아래 전부가 자연히 0이 된다
//   (레거시 소비처 전수 — grep VILLAGES 로 확인한 6곳이 전부다):
//     · spawnVillagers()          — 한옥·농지·NPC 6명/마을     → 0
//     · registerVillageGuilds()   — central NPC 길드 33 등록·금고·영토 → 0
//     · isNearVillage()           — 늑대·맹수 팩 스폰 제외 원(레거시 좌표) → 없음
//     · Wildlife legacyVillages   — 서식 밴드 완충·앵커 기준점 → 시뮬 마을 18곳만 남음(정합)
//     · _villageAt()/NPC 부활 좌표 — 레거시 NPC·길드가 없으니 도달 불가
//     · zonePublicMeta().villages — welcome 페이로드(클라 미사용: zonesMeta 는 central /zones 출처) → []
//   ★후보 공급은 여기가 아니다 — villages.js seedVillages 가 terrain.getZoneVillages() 를 직접 부른다.
//     디듀프 isLegacyVillageClaimed 도 villages.js state.claimedNames 소관이라 둘 다 무변이다.
const LEGACY_VILLAGES_ON = !(ZONE.legacyVillages === false);   // 키 없으면 ON — 다른 존 회귀 0
const VILLAGES = (ZONE_ID === 'canadia' || !LEGACY_VILLAGES_ON)
  ? []
  : ((ZONE.useHardcodedVillages && require('./terrain').getZoneVillages(ZONE_ID)) || generateVillagesForZone(ZONE));
{
  const _hv = ZONE.useHardcodedVillages && require('./terrain').getZoneVillages(ZONE_ID);
  if (!LEGACY_VILLAGES_ON) console.log(`[${ZONE_ID}] 🏘️ 레거시 마을 실체화 OFF (zone-config legacyVillages:false) — 하드코딩 후보 ${(_hv || []).length}곳은 시딩 후보로만 살아 있다(실체화 0)`);
  else if (_hv) console.log(`[${ZONE_ID}] 하드코딩 마을 ${_hv.length}개 사용 (v9). 성능 최적화 후에만 켬.`);
}
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
// ★[멎음 수리 2026-08-31 · 기본 꺼짐] 타일 지형 판정 메모 — 근거·등가성은 terrain-tilecache.js 머리말.
//   요지: 아래 두 술어는 입력을 타일로 양자화한 뒤 그 타일 **중심 한 점**만 묻는다 = (tx,ty)의 순수 함수.
//   지형 원천은 기동 1회 적재 후 불변이라 무효화가 없다. 끄면 배열조차 안 만들고 종전 경로 그대로.
const _TERR_CACHE = (process.env.TERRAIN_TILE_CACHE === '1' && !ZONE.isOcean)
  ? require('./terrain-tilecache').makeTileCache(Math.ceil(ZONE.zoneWidth / 32), Math.ceil(ZONE.zoneHeight / 32))
  : null;
if (_TERR_CACHE) console.log(`[${ZONE_ID}] 🗺️ 타일 지형 메모 ON — ${_TERR_CACHE.tilesW}×${_TERR_CACHE.tilesH} 타일 · ${(_TERR_CACHE.bytes / 1048576).toFixed(1)}MB`);
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
  // ★메모는 위 가드 **뒤에만** 건다 — 경계·해양·해안선 판정은 매번 그대로 돈다(WATER_TILES 는 캐시 밖).
  if (_TERR_CACHE) return _TERR_CACHE.water(tx, ty, () => _terrain.isWaterCellLocal(ZONE_ID, cellCx, cellCy));
  return _terrain.isWaterCellLocal(ZONE_ID, cellCx, cellCy);
}
// ★★[자염 배치 2026-09-01] **바다 술어** — 강·호수와 바다를 가른다.
//   이 레포엔 물이 두 층이다: `WATER_TILES`(해안선 띠 · `chunk.generateCoastlineWaterTiles`)와
//   `terrain.isWaterCellLocal`(지형 JSON 의 rivers/lakes). 여태 둘은 `isWaterTileLocal` 안에서
//   OR 로 뭉쳐 있었다 — "물이냐"만 묻는 콜라이더에겐 그걸로 충분했으니까.
//   ⇒ **바다 = 해안선 타일이면서 강·호수가 아닌 것.** 새 지형 층도 새 데이터도 없다(차집합 하나).
//   ⚠`ZONE.isOcean` 존은 전체가 바다다(그 존엔 뭍이 없어 갯벌도 없다 — `isTidalFlat` 가 뭍을 요구한다).
function isSeaTileLocal(localX, localY) {
  if (ZONE.isOcean) return true;
  if (localX < 0 || localY < 0 || localX >= ZONE.zoneWidth || localY >= ZONE.zoneHeight) return false;
  const tx = Math.floor(localX / 32), ty = Math.floor(localY / 32);
  if (!WATER_TILES.has(`${tx}_${ty}`)) return false;
  // 해안선 띠 안이라도 강·호수가 겹친 칸은 민물이다(강어귀) — 거기선 짠물이 안 나온다.
  return !_terrain.isWaterCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
}
// Phase 5-H: 산맥 바위 셀 — 통행 불가. 물 > 바위 우선·고개 처리는 terrain.isRockCellLocal에서.
function isRockTileLocal(localX, localY) {
  if (ZONE.isOcean) return false;
  if (localX < 0 || localY < 0 || localX >= ZONE.zoneWidth || localY >= ZONE.zoneHeight) return false;
  const tx = Math.floor(localX / 32);
  const ty = Math.floor(localY / 32);
  if (typeof _terrain.isRockCellLocal !== 'function') return false;
  if (_TERR_CACHE) return _TERR_CACHE.rock(tx, ty, () => _terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16));
  return _terrain.isRockCellLocal(ZONE_ID, tx * 32 + 16, ty * 32 + 16);
}
// 지형 차단 통합 (물 + 바위) — 이동·스폰·경로·텔레포트 검증 공용
// ★[다리 층] 통나무 널다리 셀 — zone-config ZONES[zone].bridges(flat [cx,cy,...])에서 1회 구축.
//   path-core 계약: "물 = 차단, 다리 칸만 통행 — 다리는 맵에 만들어두는 사물(경로 창발 아님).
//   물/다리 판정은 전부 호출측 blocked 콜백 소관." → 그 '호출측'이 바로 이 단일 술어다.
//   isTerrainBlockedLocal은 플레이어 이동·NPC 이동·A*·wildlife·전쟁 콜라이더가 전부 공유하는
//   유일한 통행 판정이라, 여기 한 곳만 열면 모든 이동층에 다리가 동시에 열린다(규약 신설 없음).
const BRIDGE_CELLS = new Set();
{
  const bl = (ZONE && ZONE.bridges) || null;
  if (bl && bl.length) { for (let i = 0; i + 1 < bl.length; i += 2) BRIDGE_CELLS.add(bl[i] + '_' + bl[i + 1]); }
}
function isBridgeTileLocal(localX, localY) {
  if (!BRIDGE_CELLS.size) return false;
  return BRIDGE_CELLS.has(Math.floor(localX / 32) + '_' + Math.floor(localY / 32));
}
// ★★[11차 T3 환호] 도랑 셀 — **마을이 소유한 사물**(village_buildings 'ditch')이라 정적 ZONE 설정이 아니라
//   SimVillages.init 직후 런타임으로 채운다(아래 refreshDitchCells). 다리와 같은 규약: 서버 단일 술어 한 곳만 고치면
//   플레이어·NPC·A*·야생·전쟁 콜라이더가 동시에 반영된다(규약 신설 없음).
//   판정: 도랑 = 이동 불가. 검단리 깊이 20~110cm·폭 2m면 '뛰어넘기 애매' → 게임 규약상 막힘이 단순하다(사용자 확정 안 1).
const DITCH_CELLS = new Set();
function isDitchTileLocal(localX, localY) {
  if (!DITCH_CELLS.size) return false;
  return DITCH_CELLS.has(Math.floor(localX / 32) + '_' + Math.floor(localY / 32));
}
function refreshDitchCells() {
  DITCH_CELLS.clear();
  try {
    const flat = SimVillages.ditchCells ? SimVillages.ditchCells() : [];
    for (let i = 0; i + 1 < flat.length; i += 2) DITCH_CELLS.add(flat[i] + '_' + flat[i + 1]);
  } catch (e) { console.error(`[${ZONE_ID}] 🏰 도랑 콜라이더 적재 실패:`, e.message); }
  return DITCH_CELLS.size;
}
function ditchPayload() {                 // welcome 페이로드(flat [cx,cy,…]) — 다리와 같은 규약
  try { return SimVillages.ditchCells ? SimVillages.ditchCells() : []; } catch (e) { return []; }
}
function isTerrainBlockedLocal(x, y) {
  // 다리는 물 위에만 놓인다 — 바위(산맥)는 다리로 뚫지 않는다(고증·지형 무결).
  if (isRockTileLocal(x, y)) return true;
  if (isDitchTileLocal(x, y)) return true;      // ★환호 = 이동 불가. 출입구는 '도랑을 파지 않은 셀'이라 자동으로 열려 있다.
  if (isWaterTileLocal(x, y)) return !isBridgeTileLocal(x, y);
  return false;
}
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
const MOVE_SPEED = 64; // px/sec — ★2m/s(32px=1m). 마을실험실 정본(2셀/초)과 통일. 무기 든 전투 유닛은 이보다 느림(행군<2·돌격<5)
// === [이동 모델 2026-08-30] 공유 적분기 — **사본 금지** ===
//   `public/move-model.js` 를 서버·클라가 **같은 파일**로 읽는다(soil-base.js 규약).
//   이동을 고치려면 그 파일만 고쳐라. 여기는 부르기만 한다.
const MoveModel = require('../public/move-model.js');
// ★플래그 기본 legacy — 손맛 확정 전엔 회귀가 legacy 로 안정되게 돈다(기본값 전환은 튜닝 배치).
const MOVE_MODEL = (process.env.MOVE_MODEL === 'accel') ? 'accel' : 'legacy';
const MOVE_ACCEL_T = parseFloat(process.env.MOVE_ACCEL_T || '') || 0.20;
const MOVE_DECEL_T = parseFloat(process.env.MOVE_DECEL_T || '') || 0.15;
const MOVE_AIM_SPEED_FRAC = parseFloat(process.env.MOVE_AIM_SPEED_FRAC || '') || 0.45;
// Phase 14.40 — Shift 달리기: 2.5× 속도(걷기2 × 2.5 = 5m/s, 고증 달리기), hunger/thirst 1.5× 빠른 감소.
// 단 hunger/thirst가 5 이하면 자동 해제 (지쳐서 못 뜀).
const SPRINT_MULT = 2.5;
const MOVE_PARAMS = MoveModel.paramsFrom({
  model: MOVE_MODEL, baseSpeed: MOVE_SPEED, sprintMult: SPRINT_MULT,
  accelT: MOVE_ACCEL_T, decelT: MOVE_DECEL_T, aimSpeedFrac: MOVE_AIM_SPEED_FRAC,
});
// ⚠[신체 상태 §7 2026-08-26] **사장(死藏)됨** — 감쇠·추위는 이제 `server/body.js` 정본이다.
//   지우지 않고 남기면 다음 사람이 "여기가 정본"이라 믿고 여기를 고친다(아무 일도 안 일어난다).
//   ⇒ 이름으로 죽여 둔다. 손잡이는 `BODY_SPRINT_MULT` 다.
const SPRINT_DRAIN_MULT__DEAD_SEE_body_js = 1.5;
// ⚠[신체 3층 재배선 2026-08-30] **사장(死藏)됨** — 달리기 관문은 이제 스태미나다(`Body.canSprint`).
//   지우지 않고 이름으로 죽여 둔다: 다음 사람이 "여기가 관문"이라 믿고 여기를 고치면
//   아무 일도 안 일어난다(같은 함정을 `SPRINT_DRAIN_MULT__DEAD_SEE_body_js` 가 이미 겪었다).
const SPRINT_MIN_GAUGE__DEAD_SEE_body_canSprint = 5;
// ★★[쓰러짐·구조 2026-09-02 재민 확정 · T43 · §12] 손잡이로 뺐다 — 그리고 **근거를 적는다.**
//   종전 `RESCUE_WINDOW_MS = 10000` 은 아무 데도 근거가 없었고(죽음 설계 §5-4 가 지적한 자리),
//   §12 가 **"구조 창 3분(실시간, 야생)"** 으로 값을 정했다. 3분인 이유도 §12 안에 있다:
//   구조는 "옆에 이미 서 있던 길드원"이 아니라 **소리를 듣고 달려오는 사람**의 일이다.
//   10초는 앞엣것만 되고 3분은 뒤엣것이 된다(야생에서 800px 을 달려오는 데 ~40초).
const RESCUE_WINDOW_MS = parseInt(process.env.DOWN_RESCUE_WINDOW_MS || '', 10) || 180000;   // 3분
const RESCUE_RANGE_PX = parseInt(process.env.DOWN_RESCUE_RANGE_PX || '', 10) || 80;
//   §12: *"구조 자체는 '옆에서 N초 붙들기' 하나."* — 업고 걷는 동안에도 그 시간은 흐른다
//   (업기와 붙들기를 두 동사로 가르지 않았다 — 하나가 다른 하나를 포함한다).
const RESCUE_HOLD_MS = parseInt(process.env.DOWN_RESCUE_HOLD_MS || '', 10) || 5000;
//   §12: *"일어나면 HP 소폭."* — 종전 0.5(절반)는 "소폭"이 아니다. 일어나서 걸어갈 만큼만 준다.
const RESCUE_HP_FRAC = parseFloat(process.env.DOWN_RESCUE_HP_FRAC || '') || 0.2;
//   ★업는 무게 — 고증표의 성인 몸무게. `carry` 의 소프트 과적 곡선을 **그대로** 탄다(T12 규약:
//   상한도 곡선도 안 건드리고 짐 쪽에 더한다) ⇒ 적재 25kg 인 사람이 60kg 을 업으면 3.4배 과적이다.
const CARRY_PERSON_KG = parseFloat(process.env.DOWN_CARRY_PERSON_KG || '') || 60;
//   §12: *"게임 시간이 흐른 뒤 깨어난다(옮겨진 것 — 텔레포트 아님)."*
//   ★단위는 **게임분**이다(1 게임분 = 1 실초 — 시간 구조 불변 캐논 · T44 가 유도해 뒀다).
const DOWN_WAKE_GAMEMIN = parseFloat(process.env.DOWN_WAKE_GAMEMIN || '') || 120;   // 게임 2시간 = 실시간 2분
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
// §4-4 P2 LOD 결판(근처만 실체화): 방어 마을권에 '관측자'(사람 player 또는 스펙테이터)가 반경 r(px) 안에 있나.
//   villages.js 가 eta 도달 전쟁을 physical(battle-core 실시간) XOR headless 로 분기하는 판정자. center·r 모두 px(player 좌표계).
//   사람 player만(isNpc 제외 — 마을 NPC·캐러밴은 관측자 아님) + 스펙테이터(observers) 포함. AOI_RADIUS(800)와 동일 척도로 호출됨.
function anyViewerNear(center, r) {
  if (!center) return false;
  const r2 = r * r;
  for (const p of players.values()) {
    if (p.isNpc) continue;
    const dx = p.x - center.x, dy = p.y - center.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  for (const d of observers.values()) {
    const dx = d.viewerX - center.x, dy = d.viewerY - center.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}
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
  sendInventory(player);
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
  // ★★[재민 확정 2026-08-29 · 시설 제작창] **작업대** — 정품 간석기를 만드는 자리.
  //   왜 새 건물인가: 화덕(요리)·노(제련)는 이미 있는데 **도구를 만드는 시설만 없었다**.
  //   그래서 `doCraftEquipment` 가 어디서나 즉석으로 돌았다 — "제작은 시설 앞의 물리 행위"의 반례.
  //   값: 통나무 4 + 석재 2. 망치를 요구하지 않는다 — **빈손이 도달할 수 있어야** 첫 사다리가 이어진다.
  workbench: { wood: 4, stone: 2 },
  // ★★[부패·보존 배치 2026-08-31] **건조대** — 통나무 2 + 풀 4(재민 지시 "통나무·섬유로 건축").
  //   망치를 요구하지 않는다(작업대 선례): 첫 겨울을 나야 하는 사람이 도구 사슬을 다 통과한
  //   뒤에야 말릴 수 있다면, 보존은 이미 늦은 것이다. **빈손 사다리 위에 놓는다.**
  //   값이 작업대(통나무4+돌2)보다 싼 이유: 장대 둘에 풀 끈이면 서는 물건이다.
  drying_rack: { wood: 2, fiber: 4 },
  // ★★[자염 배치 2026-09-01] **소금가마** — 돌을 쌓고 통나무로 받친 노천 가마(벌막).
  //   값이 작업대(통나무4+돌2)·건조대(통나무2+풀4)보다 무거운 이유: 불을 오래 때는 물건이라
  //   **돌이 몸통**이다. 망치는 요구하지 않는다(작업대·건조대 선례 — 빈손 사다리 위에 둔다).
  //   ⚠지시서는 "돌·점토·통나무"였는데 **점토는 플레이어 품목이 아니다**(econ `clay` 는 있으나
  //     채취 경로도 무게표도 없다 — §0 실측). 새 재료를 만들지 않는다는 규칙이 이겼다. 회부 C.
  salt_kiln: { stone: 4, wood: 3 },
};
const CROP_GROW_MS = 60 * 1000;
// 14.50: door도 닫혔을 때 blocking. fence는 cell 차지하지만 통과 가능 (사용자 의도: 시야는 통과, collider만 차단).
const BLOCKING_BUILDINGS = new Set(['wall', 'fence', 'door']);
// 14.49-e2: 층 높이 2배 (32 → 64). 벽·계단도 같이 2배.
const BUILDING_HEIGHT = { salt_kiln: 40, drying_rack: 34, workbench: 26, wall: 64, floor: 4, fence: 32, door: 64, chest: 24, campfire: 20, farmland: 4, stair: 64, vtile: 2, guild_granary: 40, granary: 40, hut_site: 4, hut: 40, furnace_site: 4, furnace: 48, kiln_site: 4, charcoal_kiln: 36, village_site: 4, village_hall: 56 };   // ★실체화 동기: 지면 타일·곳간·움집터·노(爐)·숯가마·마을회관[배치 12]
// Phase 14.25: chest 저장 가능 아이템 (모든 자원 + 도구 + 음식)
const CHEST_ALLOWED_ITEMS = new Set([
  'wood', 'stone', 'ore', 'herb',
  'berry', 'fiber', 'meat_raw', 'meat_cooked', 'hide',
  'berry_jam', 'water_bottle', 'seed_berry',
  'brine', 'salt',                  // ★[자염 배치 2026-09-01] 짠물·소금도 상자에 넣는다

  'fish', 'fish_cooked',            // Phase 5-econ-game-2: 어부 어획물
  'axe', 'pickaxe', 'sword',
  'plank', 'pillar', 'rafter', 'thatch',   // ★건축재(판자는 기존 누락 보수 — 조합법 체계와 함께 저장 허용)
  'salt',   // ★[보존 배치] 절임 재료. 세계 조달은 아직 회부지만 **넣을 자리는 막지 않는다**
]);
// ★[보존 배치 2026-08-31] 보존식은 상자에 넣는다 — 목록은 `spoil` 이 정본(두 벌 금지).
for (const k of Object.keys(Spoil.PRESERVED_ITEMS)) CHEST_ALLOWED_ITEMS.add(k);
// ★[작물 층] 수확물과 씨앗도 상자에 넣는다 — 씨앗을 다음 철까지 재워 두는 게 농사의 절반이다
for (const c of Crops.list()) { CHEST_ALLOWED_ITEMS.add(c.id); CHEST_ALLOWED_ITEMS.add(Crops.seedOf(c.id)); }
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
// ★★[재민 확정 2026-08-28 · 조잡한 석기] `cost` 로 **아무 재료나** 받는다.
//   종전엔 `doCraft` 가 `recipe.wood`·`recipe.stone` 두 칸만 읽어서, 통나무·석괴 말고는 레시피를 쓸 수 없었다.
//   빈손 사다리의 첫 칸은 **땅에서 주운 것**(잔가지·자갈·풀)이라 그 두 칸으론 표현이 안 된다.
//   ⇒ `cost` 를 정본으로 쓰고, 옛 `wood/stone` 표기는 그대로 두어 하위 호환(클라 표시 포함)을 지킨다.
const CRUDE_EFF_FRAC = (() => { const x = parseFloat(process.env.CRUDE_EFF_FRAC || ''); return Number.isFinite(x) ? x : 0.5; })();
const CRUDE_DURA_FRAC = (() => { const x = parseFloat(process.env.CRUDE_DURA_FRAC || ''); return Number.isFinite(x) ? x : 0.25; })();
const RECIPES = {
  axe:     { wood: 5, stone: 2, cost: { wood: 5, stone: 2 }, label: '도끼' },
  pickaxe: { wood: 3, stone: 5, cost: { wood: 3, stone: 5 }, label: '곡괭이' },
  sword:   { wood: 2, stone: 8, cost: { wood: 2, stone: 8 }, label: '검' },
  saw:     { wood: 2, stone: 4, cost: { wood: 2, stone: 4 }, label: '톱' },    // 통나무 → 판자 가공용
  hammer:  { wood: 3, stone: 3, cost: { wood: 3, stone: 3 }, label: '망치' },  // 건축 시 필수
  // ── ★★조잡한 석기 — **맨손으로, 주운 것만으로** [재민 확정 2026-08-28] ──────────────
  //   재민 원문: *"돌멩이를 줍고 나뭇가지를 줍고"*. 빈손으로 도착한 사람이 **오늘을 버티게** 해 주는 물건이다.
  //   고증: 청동기 후기에도 서민의 일상 도구는 돌이었고, 급하면 자갈을 깨 날을 세워 나뭇가지에
  //   섬유로 동여맸다(뗀석기 급조). 위세축·청동과는 무관한 층이다 — 이걸 갖고 자랑하지 않는다.
  //   ★★**명확히 나빠야 한다**: 효율은 정품이 준 이득의 절반(`CRUDE_EFF_FRAC`),
  //     내구는 정품의 1/4(`CRUDE_DURA_FRAC`). 자급이 충분해지면 마을 장인 경제가 죽는다(듀랑고의 자급자족 병).
  crude_axe:   { cost: { pebble: 2, twig: 1, fiber: 2 }, label: '조잡한 돌도끼', crude: true },
  crude_pick:  { cost: { pebble: 3, twig: 1, fiber: 2 }, label: '조잡한 돌괭이', crude: true },
  crude_blade: { cost: { pebble: 2, twig: 1, fiber: 1 }, label: '조잡한 돌칼',   crude: true },
};
// 14.50: 자원 변환 레시피 (도구 필요). saw로 통나무→판자.
const ITEM_RECIPES = {
  plank:   { from: { wood: 1 }, to: { plank: 2 }, requiresTool: 'saw', label: '판자 (통나무 1 → 판자 2)' },
  // ★[사용자 확정 — 건축 조합법 고증] 움집(수혈주거) 축조 중간재: 발굴 근거 자재 체계(굴립주·서까래·이엉).
  pillar:  { from: { wood: 3 }, to: { pillar: 1 },  requiresTool: 'axe', label: '기둥 (통나무 3 → 굴립주 기둥 1)' },
  rafter:  { from: { wood: 1 }, to: { rafter: 2 },  requiresTool: 'axe', label: '서까래 (통나무 1 → 서까래 2)' },
  thatch:  { from: { fiber: 4 }, to: { thatch: 1 },                      label: '이엉 (풀 4 → 이엉 1 — 맨손 엮기)' },
  // ★[재민 확정 2026-08-02 노 건설] 숯 — 노 연료. 장작으론 900℃ 위로 못 간다(era.js FUEL_CAP).
  //   숯가마 설치물은 후속(회부_플레이어_제련_노모델)로 이월 — MVP 는 제작 경로.
  charcoal: { from: { wood: 3 }, to: { charcoal: 2 },                    label: '숯 (통나무 3 → 숯 2 — 노 연료)' },
  // ★★[자염 배치 2026-09-01] **물병을 되살린다.** §0 실측: `water_bottle` 은 무게표(1.00 "박 물병 + 물")·
  //   라벨·아이콘·상자 허용목록에 **다 있는데 만들 길이 없었다** — 서버 레시피가 아예 없었다
  //   (클라에 폴백 목록이 있었지만 그건 `cookRecipes` 가 빌 때만 뜬다 = 영영 안 뜬다). **죽은 품목**이었다.
  //   ⚠**요리(`COOK_RECIPES`)에 넣으면 안 된다** — `doCook` 은 `produces` 를 안 보고 **요리 인스턴스**를 낸다
  //     (그래서 '물병'이라는 이름의 **먹는 요리**가 나온다). 실클라 하네스가 그 자리를 밟아 잡았다.
  //   ★재료는 **박**이다. 재민의 작물 카탈로그가 박을 이렇게 적어 뒀다: *"조롱박·**표주박(그릇)**·박나물"* —
  //     그릇을 발명할 필요가 없었다. 있는 작물이 이미 그릇이라고 말하고 있었다.
  //   ★박 하나로 병 하나. 그리고 **병은 소모품이 아니다**(가마가 돌려준다) — 한 번 갖추면 자본이 된다.
  water_bottle: { from: { gourd: 1 }, to: { water_bottle: 1 },          label: '물병 (박 1 → 표주박 물병 1 — 맨손)' },
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
  // ★[시설 제작창 2026-08-29] 작업대 — 망치 없이 지을 수 있다(빈손 사다리가 끊기지 않게).
  item_workbench: { wood: 4, stone: 2,                   _buildType: 'workbench', label: '작업대 (Workbench)' },
  // ★[보존 배치 2026-08-31] 건조대 — 비용은 `BUILDING_COST.drying_rack` 과 같은 값이어야 한다
  //   (하네스 ⑥이 두 표의 일치를 검사한다 — 작업대가 이미 밟은 자리다).
  item_drying_rack: { wood: 2, fiber: 4,                 _buildType: 'drying_rack', label: '건조대 (Drying Rack)' },
  // ★[자염 배치 2026-09-01] 소금가마 — `BUILDING_COST.salt_kiln` 과 **같은 값이어야 한다**
  //   (하네스가 두 표의 일치를 검사한다 — 작업대·건조대가 이미 밟은 자리다).
  item_salt_kiln:  { stone: 4, wood: 3,                  _buildType: 'salt_kiln',  label: '소금가마 (Salt Kiln)' },
};
// 14.52: 모든 도구의 최대 내구도 (제작 시 부여, 사용 시 1씩 감소, 0 되면 인벤서 제거)
const TOOL_MAX_DURABILITY = {
  axe:     100,
  pickaxe: 100,
  sword:   80,
  saw:     120, // 톱은 가공 전용이라 좀 길게
  hammer:  150, // 망치는 건축 전용이라 가장 길게
};
// ★조잡본 내구도 — 정품의 `CRUDE_DURA_FRAC`(기본 1/4). **금방 닳아 다시 만들게** 하는 게 이 층의 리듬이다.
//   자급이 편해지면 마을 장인이 죽으므로, 이 값이 "자작 vs 구매"의 손익을 가른다(대리 지표 ②).
TOOL_MAX_DURABILITY.crude_axe   = Math.max(1, Math.round(TOOL_MAX_DURABILITY.axe * CRUDE_DURA_FRAC));
TOOL_MAX_DURABILITY.crude_pick  = Math.max(1, Math.round(TOOL_MAX_DURABILITY.pickaxe * CRUDE_DURA_FRAC));
TOOL_MAX_DURABILITY.crude_blade = Math.max(1, Math.round(TOOL_MAX_DURABILITY.sword * CRUDE_DURA_FRAC));
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
  // ★[곡물 배치] 생곡 → 익힌 곡식. 생곡(7)과 조리(34)의 격차가 화덕 수요의 실체다.
  food_cooked: { cost: { food: 1 },     produces: { food_cooked: 1 }, label: '익힌 곡식' },
  fish_cooked: { cost: { fish: 1 },     produces: { fish_cooked: 1 }, label: '구운 생선' },
};

// ── 플레이어 장비 제작 (플레이어_아이템_속성_설계.md — econ 무접촉·본체 서버층) ──
// PlayerItems.craftItem(type, 숙련레벨, materials) → 품질(숙련×재료등급)·속성·내구 인스턴스. 재료는 인벤 스택 차감.
// accepts = 이 유형에 쓰는 재료(인벤 키), qty = 소비량, skill = 숙련 분야, slot = 장착 슬롯.
// ★cast: 이 유형은 **주조**할 수 있다 — 금속 여러 개를 도가니에 같이 녹여 배합을 짠다.
//   배합에 넣을 수 있는 금속은 accepts 가 아니라 PlayerItems.castKinds()(시대 제련 가능 금속)가 정한다.
//   accepts 는 여전히 "한 가지 재료로 만들기"(깎기·두드리기) 경로의 목록이다.
const EQUIPMENT_RECIPES = {
  // ★★[T74 2026-09-03] **소속을 여기 적지 않는다** — 옷 품목의 정본은 `server/clothes.js` 다.
  //   종전엔 여기 여섯 이름이 손으로 적혀 있어, 품목 하나를 더하려면 이 줄과 이름 표와 천장 표를
  //   **따로** 고쳐야 했다(하나라도 빠지면 조용히 돌아간다). 이제 표 한 줄이 곧 이 목록이다.
  //   ⚠**순서가 계약이다**: 재료를 안 주는 옛 호출부가 `accepts[0]` 을 기본값으로 쓴다.
  clothes: { label: '옷',   slot: 'clothes', skill: 'tailoring',  qty: 3, accepts: require('./clothes').accepts() },
  // ★meteoric_iron(운철)은 **주조가 아니라 단조** 재료다 — 녹이지 않고 두들긴다(cast 목록엔 안 들어간다).
  //   accepts 에만 있으므로 단일 재료 경로(MAT_GRADE)를 탄다. 노도 시대도 필요 없다.
  armor:   { label: '갑옷', slot: 'armor',   skill: 'smithing',   qty: 4, cast: true, accepts: ['bronze','copper','iron','meteoric_iron','leather','hide'] },
  weapon:  { label: '무기', slot: 'weapon',  skill: 'smithing',   qty: 3, cast: true, accepts: ['bronze','copper','iron','meteoric_iron','stone','wood','bone','obsidian'] },
  tool:    { label: '도구', slot: 'tool',    skill: 'toolmaking', qty: 3, cast: true, accepts: ['bronze','copper','iron','meteoric_iron','stone','wood','bone'] },
  // ★★[T12 지게 2026-09-01] **지게** — 이 표의 다섯째 줄이자 **다섯째 슬롯**이다.
  //   슬롯은 여기 적지 않고 `Carry.CARRIER_SLOT` 을 부른다: 상한을 더하는 쪽(carry)과 착용을 정하는 쪽(zone)이
  //   슬롯 이름을 **각자 적으면** 언젠가 한쪽만 고쳐져 "입었는데 안 올라간다"가 된다.
  //   ★`extra` 는 이 표의 새 문법이다 — **재료가 둘인 첫 장비**. 왜 필요한가:
  //     지게는 나무 틀만으로 서지 않는다. 밀삐(짚 끈)로 동여매야 사람 등에 얹힌다
  //     (조잡한 석기가 이미 `fiber` 로 동여매는 그 층이다 — 새 개념이 아니라 그 개념의 장비판이다).
  //   ★`accepts` 가 나무 하나뿐인 건 판단을 줄인 게 아니라 **지게가 나무 물건**이기 때문이다.
  //     판단은 재료가 아니라 **숙련**에 있다: Lv0 지게 +8 · Lv10 지게 +20(=상한 45). 회부 A.
  //   (`Carry` 바인딩은 이 표보다 **아래**에서 생긴다 — require 는 캐시라 여기서 한 번 더 불러도 같은 객체다.)
  carrier: { label: '지게', slot: require('./carry').CARRIER_SLOT, skill: 'toolmaking', qty: 2, accepts: ['wood'], extra: { fiber: 2 } },
};
// 제작 숙련: xp → 레벨(0~10). 유효 완성품 1개당 +1 xp(설계 §3 xp 원칙). 초반 빠르고 만렙 완만 — "레벨업하면 다음 제작품 수치가 오른다" 가시화.
const CRAFT_XP_PER_LEVEL = 6; // 레벨당 6개 → 만렙 ~60개(플레이 스케일; econ NPC 2150노동일과 별개 척도).
function craftLevel(xp) { return Math.max(0, Math.min(10, Math.floor((xp || 0) / CRAFT_XP_PER_LEVEL))); }
function playerCraftLevel(player, skill) { return craftLevel(player.craftSkill && player.craftSkill[skill]); }
// 클라 미리보기용 메타(단일 진실 — PlayerItems 엔진 상수 그대로 노출). 클라가 "방한 62·내구 85"를 서버와 동일 공식으로 계산.
// ★[T74] 옷 품목 표를 **화면에 그대로 실어 보낸다**(`welcome` 이 `equipmentMeta` 를 싣는다).
//   아이콘·외형(ART · 캐릭터 시트 옷 층)이 이름·천장을 **다시 적지 않게** 하는 자리다.
const EQUIPMENT_META = { matGrade: PlayerItems.MAT_GRADE, clothes: require('./clothes').payload(),
  qSkillSpan: PlayerItems.Q_SKILL_SPAN, duraSpan: PlayerItems.DURA_SPAN, xpPerLevel: CRAFT_XP_PER_LEVEL,
  castKinds: PlayerItems.castKinds(), castMaxKinds: PlayerItems.CAST_MAX_KINDS, castGradeMax: PlayerItems.CAST_GRADE_MAX, castKind: PlayerItems.CAST_KIND, types: {} };
// ★★[T12 지게 2026-09-01] 종전엔 여기 네 이름이 **손으로 적혀** 있었다 — 표에 다섯째 줄을 넣어도
//   메타가 안 따라와 클라 미리보기가 `undefined 0` 을 찍는다(족보 (83): 표와 그 표를 읽는 쪽은 다른 명제다).
//   ⇒ **레시피 표에서 발견한다.** 이제 표 한 줄이 곧 화면 한 줄이다.
for (const _t of Object.keys(EQUIPMENT_RECIPES)) {
  const _d = PlayerItems.ITEM_TYPES[_t]; if (!_d) continue;
  const _ak = Object.keys(_d.attrs)[0];
  EQUIPMENT_META.types[_t] = { attr: _d.attrs[_ak], attrScale: _d.attrScale || 100, baseDura: _d.baseDura, recipe: EQUIPMENT_RECIPES[_t] };
}
// 플레이어 아이템 필드 안전 초기화(모든 생성 경로 방어 — 미설정 시 빈 컨테이너).
function ensurePlayerItems(p) {
  if (!Array.isArray(p.equipment)) p.equipment = [];
  if (!p.equipSlots || typeof p.equipSlots !== 'object') p.equipSlots = {};
  if (!p.craftSkill || typeof p.craftSkill !== 'object') p.craftSkill = {};
  if (!Array.isArray(p.dishes)) p.dishes = []; // 요리 인스턴스(신선도·버프) — 소모품이라 세션 전용(비영속)
  return p;
}
// 요리 신선도: 실시간 감쇠(제작 후 FRESH_WINDOW_MS 지나면 0). 갓 지은 요리 > 식은 요리(설계 §6).
const FRESH_WINDOW_MS = 12 * 60 * 1000; // 12분 실시간 = 신선도 100→0
function dishFreshness(inst) {
  if (!inst || !inst.craftedAtMs) return 100;
  const age = Date.now() - inst.craftedAtMs;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - age / FRESH_WINDOW_MS))));
}
function sendDishes(player) {
  const list = (player.dishes || []).map(d => ({ id: d.id, label: d.label, q: d.q, nutrition: d.attrs.nutrition, buff: d.attrs.buff, freshness: dishFreshness(d) }));
  send(player.ws, { type: 'dishes', dishes: list });
}
let _nextEquipId = 1;
function genEquipId() { return `e${Date.now().toString(36)}${(_nextEquipId++).toString(36)}`; }
// 음식 효과: hunger/thirst 회복량. 'eat' 메시지로 소비.
// ★[T59] 하루 길이 상수를 **여기로 올렸다**(정의는 여전히 하나다 — 아래 쓰던 자리에서 옮겨 왔을 뿐).
//   포만감 유도가 이 수를 쓰는데, 표는 파일 앞쪽에서 만들어진다. 두 벌로 적지 않으려고 선언을 올렸다.
const _SEASON_DAY_MS = (parseInt(process.env.VILLAGE_DAY_MS || '', 10) || (WORLD && WORLD.dayLengthMs) || 24 * 60 * 1000);
const Kcal = require('./kcal');   // ★[T59] 열량 정본 — 포만감·환산의 유일한 출처
// ★★★[T59 2026-09-03 재민 확정] **포만감은 여기 안 적는다 — 열량에서 유도한다.**
//   *"식량의 단위는 열량이다 — 포만감은 적는 게 아니라 kg × kcal/kg 에서 유도한다."*
//   왜: 같은 곡식 한 개로 **NPC 는 하루를 살고 플레이어는 일곱 개가 필요했다**(7배 어긋남).
//   ⇒ 이 표에는 이제 **갈증·HP·특수 효과만** 있고, `hunger` 는 아래 한 줄이 `kcal.js` 에서 채운다.
//   ⚠숫자를 되살리지 마라 — `test-kcal` 의 소스 검사가 빨개진다(그게 이 배치의 돌연변이 검사다).
const FOOD_EFFECTS = {
  berry:        { thirst: 4 },
  // ★[신체 상태 §7] 약초 — 배를 채우진 못해도 **부상 회복을 재촉한다**(doEat 이 Body.onHerb 를 부른다).
  //   §7 "부상 = 회복 기간 + 약초(medicinal_herb) 수요"의 실배선. 채집물 `herb` 가 그 품목이다.
  herb:         { thirst: 1 },
  meat_raw:     { thirst: 0, hpDelta: -3 }, // 날고기는 약간 해로움
  meat_cooked:  { thirst: 0 },
  berry_jam:    { thirst: 6 },
  // ★★[무게·곡물 배치 2026-08-27] **곡물이 플레이어 품목이 됐다.**
  //   생곡은 비효율이다 — 청동기 곡물은 갈고 익혀야 먹을 수 있는 것이라 날로 씹으면 배가 덜 찬다.
  //   조리 경로(`COOK_RECIPES.food_cooked`)를 거치면 제값(=조리식 계열)이 된다.
  food:         { thirst: 0 },
  food_cooked:  { thirst: 2 },
  fish_cooked:  { thirst: 0 },   // ★구운 생선이 표에 없었다(먹을 수 없는 조리식이었다)
};
// ★★[부패·보존 배치 2026-08-31] **보존식 4종** — 목록은 `spoil.PRESERVED_ITEMS` 가 정본이고
//   여기서는 **효과만** 붙인다(품목 이름을 두 벌로 적지 않는다).
//   ★값의 근거: 보존은 **수분을 빼는 일**이다. 같은 무게에 열량이 몰리므로 단위당 회복이 크지만,
//     `weights.js` 에서 원물보다 **가볍게** 잡혀(건어물 0.35 vs 생선 0.90) 짐 예산으로는 이득이 아니다.
//     짜고 마른 것을 먹으면 목이 마르다 — 그래서 보존식은 **갈증을 준다**(thirst 음수).
//     이 한 줄이 겨울나기를 "식량만 쌓으면 되는 문제"에서 "물도 있어야 하는 문제"로 만든다.
//   ⚠[T59] 여기도 `hunger` 를 뺐다 — **보존은 열량을 늘리지 않는다**(수분만 빠진다).
//     건어물 0.35kg 은 생선 0.90kg **의 열량**을 갖는다 ⇒ kcal/kg 이 오르고 kg 이 줄어 총량은 그대로.
//     그래서 유도가 `weights.js` 의 건조 잔량 주석과 저절로 정합한다(두 표가 같은 물리를 말한다).
const PRESERVED_EFFECTS = {
  dried_fish:  { thirst: -6 },
  dried_fruit: { thirst: -2 },
  smoked_meat: { thirst: -5 },
  pickled_veg: { thirst: -4 },
};
// ★★[T54 갯벌 3차 2026-09-02] 갯벌 말린 것 둘의 효과는 **원물에서 유도**한다 — 여기 수를 안 적는다.
//   앵커는 위 표 안에 이미 있었다: **말린 과실 16 ÷ 딸기 6** 이 말리기의 허기 배수이고,
//   갈증은 부호만 뒤집는다(마른 것은 원물이 주던 물기를 도로 가져간다). 유도는 `tidal.js` 가 한다.
for (const [k, v] of Object.entries(require('./tidal').driedEffects())) PRESERVED_EFFECTS[k] = v;
for (const k of Object.keys(Spoil.PRESERVED_ITEMS)) {
  if (PRESERVED_EFFECTS[k]) FOOD_EFFECTS[k] = PRESERVED_EFFECTS[k];
}
// ★★[작물 층 2026-08-31] 작물 34종의 포만감 — **카탈로그의 `생존`(1~5) 축에서 유도**한다.
//   ★계수를 지어내지 않았다: 기존 `FOOD_EFFECTS.food`(생곡)의 허기 **7 = 쌀 생존 5 × 1.4** 라
//     그 1.4 를 역산해 썼다(`crops.HUNGER_PER_SUBS`). 앵커가 이미 코드 안에 있었다.
//   ⇒ 쌀 7 · 보리 5.6 · 무 4.2 · 상추 2.8 — 작물마다 다르고, 그 차이가 카탈로그의 뜻 그대로다.
//   ⚠특용(삼·뽕·차·쪽) 4종은 식품이 아니라 여기 안 들어온다(각자 다른 층 — 회부).
for (const [k, eff] of Object.entries(Crops.foodMap())) if (!FOOD_EFFECTS[k]) FOOD_EFFECTS[k] = eff;
// 음료 (water_pool에서 E로 즉시 회복 — 인벤토리 아이템 아님)
const WATER_DRINK_AMOUNT = 35;

// 생존 게이지 상수
const HUNGER_MAX = 100;
const THIRST_MAX = 100;
// ⚠**사장됨** — `server/body.js` 의 `BODY_HUNGER_SEC`(1800)·`BODY_THIRST_SEC`(1200)가 정본이다.
//   종전 값(10분/7분)은 1시간에 6끼라 잔소리였다. 재민 지시 "1시간 세션에 2~3회"로 늦췄다.
const HUNGER_DRAIN_PER_SEC__DEAD_SEE_body_js = 100 / 600;
const THIRST_DRAIN_PER_SEC__DEAD_SEE_body_js = 100 / 420;
// (제거) STARVATION_HP_PER_SEC — ★★[캐논 변경 2026-09-01 · T44] "아사 폐지"는 **폐기됐다.**
//   되살아난 것은 이 상수가 아니다: 극단 감소는 `body.js extremeHpRate` **합산기 하나**가 내고
//   (허기·갈증·추위 가산 · 연속), 적용은 위 생존 루프가 `damagePlayer` 정본 경로로 한다.
//   여기에 초당 상수를 다시 적지 마라 — 그게 두 번째 정본이다.
// 장착 시 효과 — 채집/공격 데미지 배수
// 채집은 자원 hp 깎는 1회 데미지를 배수 적용. 기본 1.
const TOOL_EFFECTS = {
  axe:     { gatherWoodMult: 3, gatherStoneMult: 1, attackMult: 1.0 },
  pickaxe: { gatherWoodMult: 1, gatherStoneMult: 3, attackMult: 1.0 },
  sword:   { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 2.0 },
  saw:     { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 0.7 }, // 톱 = 건축 가공용, 전투 약함
  hammer:  { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: 1.3 }, // 망치 = 건축 + 약간 강함
};
// ★★[조잡한 석기 2026-08-28] 조잡본 효과는 **정품 표에서 유도한다** — 숫자를 두 벌로 적지 않는다.
//   맨손이 1 이고 정품이 m 이면, 조잡본은 **그 이득의 절반**: 1 + (m−1)×`CRUDE_EFF_FRAC`.
//   ⇒ 맨손 < 조잡 < 정품 이 **정의상** 성립한다(하네스 ⑤가 그 사이값을 assert 한다).
//     `CRUDE_EFF_FRAC` 을 바꾸면 세 값이 같이 움직이므로 순서가 깨질 길이 없다.
const _crudeOf = (m) => 1 + (Math.max(1, m) - 1) * CRUDE_EFF_FRAC;
TOOL_EFFECTS.crude_axe   = { gatherWoodMult: _crudeOf(TOOL_EFFECTS.axe.gatherWoodMult),     gatherStoneMult: 1, attackMult: 1.0 };
TOOL_EFFECTS.crude_pick  = { gatherWoodMult: 1, gatherStoneMult: _crudeOf(TOOL_EFFECTS.pickaxe.gatherStoneMult), attackMult: 1.0 };
TOOL_EFFECTS.crude_blade = { gatherWoodMult: 1, gatherStoneMult: 1, attackMult: _crudeOf(TOOL_EFFECTS.sword.attackMult) };
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

// ★★[재민 확정 2026-08-29 · 배산임수 감사] **자연물 전리품 정본 — 표는 하나다.**
//   종전엔 이 표가 **두 벌**이었다(플레이어 채집 하나 · NPC 채집 하나). 빈손 배치가 덤불에 잔가지를
//   넣을 때 한쪽만 고쳐서 **같은 덤불이 누가 뜯느냐에 따라 다른 걸 내는** 상태가 됐다(회부 B-3).
//   이번에 둘을 이 함수 하나로 합친다 — 앞으로 한쪽만 고칠 방법이 없다.
//
// ★★그리고 **감사가 시킨 확장**을 여기서 한다.
//   51마을 전수 감사(`scripts/audit-village-forage.js`)가 가른 사실:
//     · 임업3 은 **나무가 564그루**인데 잔가지를 못 줍는 마을이었다(지형 술어만 봤으니까).
//     · 어촌·평지 마을 24곳은 **바위·물이 반경에 없어 자갈이 0** 이었다.
//   ⇒ 옮기기 전에 **판정 목록부터** 넓힌다(지시서 §2 마지막 줄). 새 개체를 만들지 않는다 —
//     **이미 렌더돼 서 있는 나무와 바위**가 제 몫을 내게 할 뿐이다("이미 렌더된 자연물이 채집원이다").
//       나무 → 목재 + **삭정이 1**(가지를 치면 잔가지가 딸려 나온다)
//       바위 → 석재 + **자갈 2**(돌을 깨면 잔돌이 나온다)
//   ⚠수량은 **부산물 급**이다. 이 값이 채집의 주 경로가 되면 안 된다(덤불·지형이 주 경로).
// ★★[작물 층 2026-08-31] `ctx` 는 **선택**이다 — 주면 계절 야생 씨앗이 나오고, 안 주면 종전 그대로.
//   NPC 채집 경로(2025행)는 ctx 를 안 준다 ⇒ **econ 쪽 동작은 한 줄도 안 달라진다.**
function lootOfResource(r, ctx) {
  const t = r && r.type;
  if (t === 'tree')       return { wood: 3 + Math.floor((r.r || 8) / 3), twig: 1 };   // 크기 비례: r4~20 → wood 4~9
  if (t === 'rock')       return { stone: 1, pebble: 2 };
  if (t === 'berry_bush') {
    // ★[재민 확정 2026-08-28] **덤불 E = 잔가지.** 열매·풀과 **함께** 삭정이가 나온다 —
    //   덤불을 헤치면 마른 가지가 딸려 나오는 게 자연스럽고, 조잡한 석기의 세 재료 중 둘이
    //   여기서 한꺼번에 나와 **빈손의 첫 걸음이 막히지 않는다**(잔가지는 숲 바닥에도 있다 — 소스 다종화).
    const l = { berry: 2, fiber: 1, twig: 1 };
    // ★★[작물 층] **야생 채종** — 덤불이 그 철의 씨앗을 낸다(자리와 계절의 함수 · 주사위 아님).
    //   ⇒ 씨앗이 세계에서 나오는 길이 생겼다. 이게 없으면 34종 작물이 전부 잠긴다(소금의 전철).
    //   ctx 가 없으면(=NPC) 종전 그대로 30% 베리씨앗.
    if (ctx && ctx.day != null) {
      const cx = Math.floor((r.x || 0) / 32), cy = Math.floor((r.y || 0) / 32);
      const wild = Crops.wildSeedAt(cx, cy, ctx.day);
      if (wild) l[Crops.seedOf(wild)] = 1;
    } else if (Math.random() < 0.3) l.seed_berry = 1;
    return l;
  }
  if (t === 'herb')       return { herb: 2 };
  if (t === 'ore')        return { ore: 1, stone: 1 };
  // ★운철 — **제련하지 않는다**. 이미 금속이라 그대로 단조 재료가 된다(era.js §METEORIC).
  if (t === 'meteorite')  return { meteoric_iron: 2 + Math.floor(Math.random() * 2) };
  return {};
}

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
      // ★★[T45 2026-09-02] **여기가 §0 의 결함이었다.** 종류를 안 채워서 재시작하면 전부 `undefined` 가 됐고,
      //   그 한 줄 때문에 ⓐ 임시·길드가 개인 슬롯을 먹고 ⓑ 개인 사유지를 새로 못 짓고
      //   ⓒ **자기 사유지가 부활 지점에서 사라졌다**(T8 이 본 "막다른 골목"의 진짜 원인).
      //   옛 행은 DB 이행이 `'personal'` 로 채웠다 — 현행 부팅이 사실상 그렇게 취급해 왔다.
      kind: row.kind || 'personal',
      guildTribeId: row.guild_tribe_id != null ? row.guild_tribe_id : null,
      state: row.state || 'active',
      heldBy: row.held_by || null,
      stateAt: row.state_at | 0,
      createdAt: row.created_at | 0,
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
    //   ★ENABLE_WILDLIFE=0 이면 **아예 안 낳는다**(적대 개체 전부 OFF — 위 상수 주석 참조).
    let spawned = 0, packNum = 0;
    if (!HOSTILES_ON && aggressive.length) console.log(`[${ZONE_ID}] 🐾 ENABLE_WILDLIFE=0 — 공격 개체 스폰 생략(${aggressive.length}종)`);
    while (HOSTILES_ON && aggressive.length > 0 && spawned < TOTAL_AGGRESSIVE) {
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
    equipment: [], equipSlots: {}, craftSkill: {}, // 플레이어 아이템: NPC는 빈 컨테이너(인스턴스 미생성 — econ 스칼라 유지)

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
    // §4-4 Stage 4A 디듀프: 시뮬 마을은 central 길드 등록·금고·영토 제외 (econ 마을 생산은 economy-sim이 진실)
    if (SimVillages.isLegacyVillageClaimed(village.name)) continue;
    try {
      const r = await central.tribeNpcUpsert(village.name, 'passive');
      if (r && r.tribe_id) {
        villageGuildIds.set(village.name, r.tribe_id);
        console.log(`[${ZONE_ID}] ✅ NPC 길드 등록: ${village.name} → central tribe_id=${r.tribe_id} (passive)`);
        // 영토 생성은 여기서 — spawn 시점엔 tribeId(async 등록) 없어 skip되던 게 "사유지 안 보임"의 원인.
        if (ZONE.npcVillageTerritory) spawnGuildClaimsForVillage(village, r.tribe_id);
      }
    } catch (e) { console.warn(`[${ZONE_ID}] NPC 길드 등록 실패 [${village.name}]:`, e.message); }
  }
}
// Phase 14.18.b — 각 마을 중심에 길드 사유지 (공용 영토) 자동 생성
// 마을 = NPC 길드. central tribe_id를 받아와서 guildTribeId로 연결.
function spawnGuildClaimsForVillage(village, centralTribeId) {
  if (!centralTribeId) return;
  // econ-game-2 stage2: 마을당 '유기적 폴리곤' claim 1개 (poly로 송신 — payload 작고 비정사각).
  //   집 쪽(landward)으로 치우치고, 물에 박히는 꼭짓점은 해안까지 당겨 자연스러운 외곽.
  const SZ = BUILDING_SIZE;
  const npcOwnerId = `village_${village.name}`;
  // 옛 거 정리 (메모리 + DB + 클라)
  for (const [id, c] of claims) {
    if (c.kind === 'guild' && c.ownerPid === npcOwnerId) {
      if (c.dbId) { try { db.db.prepare('DELETE FROM claims WHERE id = ?').run(c.dbId); } catch (e) {} }
      claims.delete(id);
      broadcast({ type: 'claim_removed', id });
    }
  }
  // 물 방향 → landward(배산). 영토 중심을 집 군집 쪽(landward)으로 약간 이동.
  let wsx = 0, wsy = 0, wn = 0;
  for (let r = 2; r <= 16; r += 2) for (let a = 0; a < 8; a++) {
    const px = village.x + Math.cos(a / 8 * Math.PI * 2) * r * SZ;
    const py = village.y + Math.sin(a / 8 * Math.PI * 2) * r * SZ;
    if (isWaterTileLocal(px, py)) { wsx += (px - village.x); wsy += (py - village.y); wn++; }
  }
  const landAng = wn ? Math.atan2(wsy, wsx) + Math.PI : -Math.PI / 2;
  const cellCx = Math.floor(village.x / SZ), cellCy = Math.floor(village.y / SZ);
  const ccx = cellCx, ccy = cellCy;   // 영토 중심 = 마을 중심 (집[landward] + 농지[물쪽] 둘 다 포함)
  let sn = 0; for (let i = 0; i < village.name.length; i++) sn = (sn * 31 + village.name.charCodeAt(i)) | 0;
  // 유기적 '셀 집합' — 각도별 radius(노이즈 불규칙 + landward 약간 길게) 안의 LAND 셀만.
  const cells = [];
  const HALF = 20;
  for (let dy = -HALF; dy <= HALF; dy++) for (let dx = -HALF; dx <= HALF; dx++) {
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const wob = 0.72 + 0.30 * (0.5 + 0.5 * Math.sin(ang * 3 + sn * 0.13)) + 0.12 * Math.sin(ang * 7 + sn * 0.37);
    const elong = 1 + 0.18 * Math.cos(ang - landAng);
    if (dist > 14 * wob * elong) continue;
    const cx = ccx + dx, cy = ccy + dy;
    if (isTerrainBlockedLocal(cx * SZ + SZ / 2, cy * SZ + SZ / 2)) continue;   // LAND only (물·바위 제외)
    cells.push([cx, cy]);
  }
  if (!cells.length) cells.push([cellCx, cellCy]);   // 안전장치
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const [cx, cy] of cells) { if (cx < minx) minx = cx; if (cy < miny) miny = cy; if (cx > maxx) maxx = cx; if (cy > maxy) maxy = cy; }
  const id = `c${nextClaimId++}`;
  const claim = {
    id, ownerPid: npcOwnerId, ownerName: `${village.name} 길드 영토`,
    x: minx * SZ, y: miny * SZ, w: (maxx - minx + 1) * SZ, h: (maxy - miny + 1) * SZ, kind: 'guild',
    cells,                                  // ← 셀 집합 (격자 단위)
    guildTribeId: centralTribeId,
    guildTribeName: village.name,
    createdAt: Date.now(),
  };
  claims.set(id, claim);
  broadcast({ type: 'claim_added', claim });
  console.log(`[${ZONE_ID}] 🏛️ 길드 영토 [${village.name}] ${cells.length}셀(격자)`);
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

// econ-game-2: 배산임수 집 배치 — 물 위 집 버그 해결 + 물 반대편(landward) 격자.
function footprintIsLand(x, y) {
  const SZ = BUILDING_SIZE;   // 5x5 집 footprint 중심+모서리가 모두 LAND(물·바위 아님)인가
  for (let dx = -2; dx <= 2; dx += 2) for (let dy = -2; dy <= 2; dy += 2) {
    if (isTerrainBlockedLocal(x + dx * SZ, y + dy * SZ)) return false;
  }
  return true;
}
function villageHouseSlots(village, count) {
  const SZ = BUILDING_SIZE;
  // ① 물 방향 — 중심 주변 샘플 중 water 셀들의 평균 방향
  let wsx = 0, wsy = 0, wn = 0;
  for (let r = 2; r <= 16; r += 2) for (let a = 0; a < 8; a++) {
    const px = village.x + Math.cos(a / 8 * Math.PI * 2) * r * SZ;
    const py = village.y + Math.sin(a / 8 * Math.PI * 2) * r * SZ;
    if (isWaterTileLocal(px, py)) { wsx += (px - village.x); wsy += (py - village.y); wn++; }
  }
  // ② 집은 물 반대편(landward=배산). 물 없으면(내륙) 북쪽 기본(남향 한옥).
  const landAng = wn ? Math.atan2(wsy, wsx) + Math.PI : -Math.PI / 2;
  const ux = Math.cos(landAng), uy = Math.sin(landAng);  // landward
  const px = -uy, py = ux;                                // 능선 평행(좌우)
  const SP = 6;                                           // 슬롯 간격(셀) = 5x5 집 + 1 gap
  const slots = [];
  for (let ring = 1; slots.length < count && ring <= 9; ring++) {
    for (let t = -ring; t <= ring && slots.length < count; t++) {
      const hx = village.x + (ux * ring + px * t * 0.85) * SP * SZ + (Math.random() - 0.5) * SZ;
      const hy = village.y + (uy * ring + py * t * 0.85) * SP * SZ + (Math.random() - 0.5) * SZ;
      if (!footprintIsLand(hx, hy)) continue;             // ★ LAND only — 물/바위 위 집 방지
      let tooClose = false;
      for (const s of slots) if (Math.hypot(s.x - hx, s.y - hy) < SP * SZ * 0.8) { tooClose = true; break; }
      if (!tooClose) slots.push({ x: hx, y: hy });
    }
  }
  return slots;
}

// econ-game-2 rebuild: 5×5 한옥 (가족 공유 — 1층당 6명 수용). floors 인자로 층수↑ = 수용↑.
//   owner npc_house_* → 재시작 wipe. 작은 마을은 1채(1층)에 다 거주.
function buildVillageHouse(ccx, ccy, ownerId, ownerName, floors = 1) {
  const SZ = BUILDING_SIZE;
  const wall = (cx, cy, side, f) => db.insertBuilding({ type: 'wall', owner_id: ownerId, owner_name: ownerName, x: cx * SZ, y: cy * SZ, data: JSON.stringify({ side, floor: f }) });
  const floor = (cx, cy, f) => db.insertBuilding({ type: 'floor', owner_id: ownerId, owner_name: ownerName, x: cx * SZ + SZ / 2, y: cy * SZ + SZ / 2, data: JSON.stringify({ floor: f }) });
  for (let f = 0; f < floors; f++) {
    for (let i = -2; i <= 2; i++) { wall(ccx + i, ccy - 2, 'N', f); if (!(f === 0 && i === 0)) wall(ccx + i, ccy + 3, 'N', f); } // 북 / 남(1층 가운데 출입구)
    for (let j = -2; j <= 2; j++) { wall(ccx + 2, ccy + j, 'E', f); wall(ccx - 3, ccy + j, 'E', f); }                          // 동 / 서
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) floor(ccx + i, ccy + j, f);
  }
}
// 농지 구역 — 물쪽(임수) 골짜기에 grid 플롯 pre-생성 (visible 농지). owner npc_farm_* → wipe.
function buildVillageFarmland(village, vIdx) {
  const SZ = BUILDING_SIZE;
  let wsx = 0, wsy = 0, wn = 0;
  for (let r = 2; r <= 16; r += 2) for (let a = 0; a < 8; a++) {
    const px = village.x + Math.cos(a / 8 * Math.PI * 2) * r * SZ, py = village.y + Math.sin(a / 8 * Math.PI * 2) * r * SZ;
    if (isWaterTileLocal(px, py)) { wsx += px - village.x; wsy += py - village.y; wn++; }
  }
  const wAng = wn ? Math.atan2(wsy, wsx) : Math.PI / 2;   // 물쪽(없으면 남)
  const wx = Math.cos(wAng), wy = Math.sin(wAng), pxv = -wy, pyv = wx;
  const fcx = village.x + wx * SZ * 5, fcy = village.y + wy * SZ * 5;  // 물쪽 5칸
  let made = 0;
  for (let row = 0; row < 3; row++) for (let col = -2; col <= 2; col++) {
    const gx = Math.floor((fcx + (wx * row + pxv * col) * SZ) / SZ) * SZ + SZ / 2;
    const gy = Math.floor((fcy + (wy * row + pyv * col) * SZ) / SZ) * SZ + SZ / 2;
    if (isTerrainBlockedLocal(gx, gy)) continue;          // LAND only
    const stage = made % 4;
    const data = { cropType: 'berry', plantedAt: Date.now() - stage * 15000, readyAt: Date.now() + (3 - stage) * 15000, ready: stage >= 3 };
    try { db.insertBuilding({ type: 'farmland', owner_id: `npc_farm_${ZONE_ID}_${vIdx}`, owner_name: `${village.name} 농지`, x: gx, y: gy, data: JSON.stringify(data) }); made++; } catch (e) {}
  }
  return made;
}

function spawnVillagers() {
  // §4-4 Stage 4A 레거시 디듀프: 시뮬 마을(villages.js)이 차지한 하드코딩 마을(이름 유니크)은
  //   레거시 스폰(NPC 6명·한옥·농지·길드영토) 전체를 스킵 — 같은 자리 이중 마을 방지.
  //   ENABLE_VILLAGES=0이면 isLegacyVillageClaimed가 항상 false → 기존 50곳 전부 스폰(불변).
  // ★[배치 15 ①] legacyVillages:false 면 VILLAGES 가 [] 이라 이 루프 전체가 0회 — 한옥·농지·NPC·영토 0.
  if (!LEGACY_VILLAGES_ON) { console.log(`[${ZONE_ID}] 🏘️ 레거시 스폰 스킵 — 한옥 0채·농지 0칸·NPC 0명·길드영토 0(설정 legacyVillages:false)`); return; }
  const _simSkipped = [];
  for (let v = 0; v < VILLAGES.length; v++) {
    const village = VILLAGES[v];
    if (SimVillages.isLegacyVillageClaimed(village.name)) { _simSkipped.push(village.name); continue; }
    const villageId = `village_${ZONE_ID}_${v}`;
    console.log(`[${ZONE_ID}] 🏘️ 마을 [${village.name}] @ (${village.x},${village.y}) type=${village.type || 'plain'} — ${NPC_PER_VILLAGE}명`);
    // 14.18.b: 길드 영토 (central tribe_id는 비동기로 받음. 지금 시점에 villageGuildIds에 있을 수도/없을 수도)
    const tribeId = villageGuildIds.get(village.name);
    if (tribeId && ZONE.npcVillageTerritory) spawnGuildClaimsForVillage(village, tribeId); // 영토 OFF 기본 (welcome·broadcast 폭주 방지)
    // 한옥=가족: 작은 집 몇 채(NPC/3명)에 나눠 거주 + 물쪽 농지 구역 (배산임수).
    // 5×5 한옥 = 1층당 6명. 집은 적게(이상적 1채), 부족하면 층수↑. 작은 마을은 1채 1층에 다 거주.
    const numHouses = Math.max(1, Math.ceil(NPC_PER_VILLAGE / 18));                                      // 1채=최대 3층×6=18명
    const floorsPerHouse = Math.min(3, Math.max(1, Math.ceil(NPC_PER_VILLAGE / numHouses / 6)));
    const _houses = villageHouseSlots(village, numHouses);     // landward 한옥 슬롯
    if (ZONE.npcVillageHouses) {
      for (let h = 0; h < _houses.length; h++) {
        buildVillageHouse(Math.round(_houses[h].x / BUILDING_SIZE), Math.round(_houses[h].y / BUILDING_SIZE), `npc_house_${ZONE_ID}_${v}_${h}`, `${village.name} 한옥`, floorsPerHouse);
      }
      const fc = buildVillageFarmland(village, v);             // 물쪽 농지 구역
      console.log(`[${ZONE_ID}] 🏡 마을 [${village.name}] 한옥 ${_houses.length}채(${floorsPerHouse}층) + 농지 ${fc}칸`);
    }
    for (let i = 0; i < NPC_PER_VILLAGE; i++) {
      const home = _houses[i % _houses.length] || { x: village.x, y: village.y };  // 집에 나눠 배정
      const npcX = home.x + (Math.random() - 0.5) * 50, npcY = home.y + (Math.random() - 0.5) * 50;
      const job = _pickNpcJob(village.type);
      const ws = _findNpcWorkSite(village.x, village.y, job);
      spawnNpc({
        x: npcX, y: npcY,
        villageId, villageName: village.name,
        npcJob: job,
        npcHomeX: home.x, npcHomeY: home.y,
        npcWorkX: ws ? ws.x : village.x + (Math.random() - 0.5) * 200,
        npcWorkY: ws ? ws.y : village.y + (Math.random() - 0.5) * 200,
        skipHouse: true,   // 집은 위에서 공유 한옥으로 따로 지음
      });
    }
  }
  if (_simSkipped.length) console.log(`[${ZONE_ID}] 🏘️ 레거시 디듀프(§4-4 Stage4A): 시뮬 마을과 중복 ${_simSkipped.length}곳 스킵 · 레거시 유지 ${VILLAGES.length - _simSkipped.length}곳 — 스킵: ${_simSkipped.join(', ')}`);
  // 길드 영토는 spawnVillagers와 별도로 registerVillageGuilds 완료 후 다시 호출 (race condition fix)
  setTimeout(() => {
    for (const v of VILLAGES) {
      if (SimVillages.isLegacyVillageClaimed(v.name)) continue; // Stage 4A 디듀프 — 시뮬 마을엔 레거시 영토 X
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
  // ★[생활 층 이관 ②③④] 마을 시뮬 NPC 일과 — villages.js 소유(개간 크루·신축 시공·농부 농지 순회).
  //   늑대 도주가 우선(위), 야간 귀가 게이트는 npcStep이 이 뒤에서 덮음(§19 계약 유지). false=레거시 일과 폴스루.
  if (npc.simVillageId && SimVillages.npcLifeTick && SimVillages.npcLifeTick(npc, now)) return;
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
  // ③ seed 있고 농지 슬롯 빈 데 → 농사. 마을 농부는 개인 사유지 없어도 집 근처에 농사 (가시 표현)
  if ((npc.inventory.seed_berry || 0) >= 1 && (npc.myClaim || npc.npcJob === 'farmer')) {
    const cl = npc.myClaim;
    let myFarmCount = 0;
    for (const b of _nearBld) if (b.type === 'farmland' && b.ownerId === npc.playerId) myFarmCount++;
    if (myFarmCount < 3) {
      npc.behavior = 'plant';
      if (cl) {                          // 개인 사유지 안 빈 자리
        npc.targetX = cl.x + 40 + Math.random() * (cl.w - 80);
        npc.targetY = cl.y + 40 + Math.random() * (cl.h - 80);
      } else {                           // 마을 농부 — 집 근처 텃밭
        const hx = npc.npcHomeX != null ? npc.npcHomeX : npc.x;
        const hy = npc.npcHomeY != null ? npc.npcHomeY : npc.y;
        npc.targetX = hx + (Math.random() - 0.5) * 220;
        npc.targetY = hy + (Math.random() - 0.5) * 220;
      }
      return;
    }
  }
  // ③-b 어부 — 물가 작업장(npcWorkX/Y=water) 근처면 낚시 (주기적 어획, 가시 표현). 멀면 ⑤가 데려감.
  if (npc.npcJob === 'fisher' && npc.npcWorkX != null) {
    const dw = Math.hypot(npc.x - npc.npcWorkX, npc.y - npc.npcWorkY);
    if (dw < 130) {
      if (!npc._lastFishAt || now - npc._lastFishAt > 8000) {   // 8초마다 1마리 (인벤=가시 표현; 마을경제는 추상 JOB_YIELD)
        npc._lastFishAt = now;
        npc.inventory.fish = (npc.inventory.fish || 0) + 1;
      }
      npc.behavior = 'wander';
      npc.targetX = npc.npcWorkX + (Math.random() - 0.5) * 40;
      npc.targetY = npc.npcWorkY + (Math.random() - 0.5) * 40;
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
// ★[생활 층 100% ① — 랩 moveTo/_smoothWalk(7807~7814) 동형, 2026-07-27] 마을 주민의 이동 양식을 랩 정본과 통일.
//   랩 계약: lineClear(직선 통행)면 단일 세그먼트 직행 → 막히면 bfsPath(사실상 무제한 탐색) → PathCore.smoothPath
//   스트링 풀링(계단 웨이포인트를 열린 구간에서 진짜 사선 벡터로 병합, 길 칸(roadLevel>0)은 keep 앵커로 전부
//   경유 — 길은 길 모양대로 걷고 답압·배속 루프 유지) + prefer=길 등급(등거리 동률이 기존 길로 스냅).
//   서버 매핑: lineClear=straightPathClear(벽 변+물·바위 — 동일 규칙) · bfsPath=pfFindPath(같은 path-core 정본,
//   주민만 기본 한도 4096/64로 랩의 '마을 생활권 전체' 탐색 동형) · roadLevel=Roads.levelOf(§16 답압 길) ·
//   A* 2s 쿨다운은 서버 스케일 방어(결과 경로 모양은 동일 — 이동 양식 불변). 비주민(야생·도적·레거시)은 현행 유지.
function _roadKeep(x, y) { return Roads.ENABLED && Roads.levelOf((x / 32) | 0, (y / 32) | 0) > 0; }   // px→답압 길 칸(스무딩 keep 앵커)
function _roadPrefer(x, y) { return Roads.ENABLED ? Roads.levelOf((x / 32) | 0, (y / 32) | 0) : 0; }  // px→길 등급(A* 동률 스냅)
function computeNpcPath(npc, now) {
  if (typeof npc.targetX !== 'number' || typeof npc.targetY !== 'number') return null;
  const d = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);
  if (d < 48) return [{ x: npc.targetX, y: npc.targetY }];
  const isVil = !!npc.simVillageId;   // 마을 주민 = 랩 이동 정본 대상
  // 도주는 직선 전력질주(랩 동형 — 도주는 경로 계획 밖). 비주민 배회도 현행 beeline(성능 — 야생·레거시 회귀 없음)
  if (npc.behavior === 'flee' || (npc.behavior === 'wander' && !isVil)) {
    return [{ x: npc.targetX, y: npc.targetY }];
  }
  // 직선이 깨끗하면 A* 스킵 (랩 moveTo의 lineClear 우선 — 동형)
  if (straightPathClear(npc.x, npc.y, npc.targetX, npc.targetY, npc.floor || 0)) {
    return [{ x: npc.targetX, y: npc.targetY }];
  }
  // A* — NPC당 최소 2초 간격
  if (npc._lastAStarAt && now - npc._lastAStarAt < 2000) return null;
  npc._lastAStarAt = now;
  const wp = pfFindPath(npc.x, npc.y, npc.targetX, npc.targetY, {
    floor: npc.floor || 0,
    isBlockedFn: isBlockedByWall,
    isWaterFn: isTerrainBlockedLocal,
    maxCells: isVil ? 1500 : 200,          // 주민=마을 생활권 우회 커버(수백 노드면 충분 — 도달 불가 목표도 빨리 확정, 최악 ~10ms). 비주민=현행 ~4ms 한도
    searchRadiusCells: isVil ? 64 : 24,    // 주민=2048px(집→먼 밭·물가 현장). 비주민=768px
    preferFn: isVil ? _roadPrefer : undefined,   // ★답압 수렴(랩 bfsPath prefer 동형): 등거리 동률이 길로 스냅
  });
  if (!wp || wp.length < 3 || !isVil) return wp;
  const fl = npc.floor || 0;   // ★스트링 풀링(랩 _smoothWalk 동형): canPass=직선 통행(동일 게이트) · keep=길 칸 앵커
  return PathCore.smoothPath(wp, (ax, ay, bx, by) => straightPathClear(ax, ay, bx, by, fl), { keep: Roads.ENABLED ? _roadKeep : null });
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
// ★★[2026-08-04c 배치 17 ②] **도착해서 서 있는 것은 stuck 이 아니다** — 낚시터 방황의 마지막 원인.
//   stuck 의 정의는 "가려는데 못 간다"인데, 이 함수는 위치만 봐서 **목표에 도착해 가만히 선 NPC**도 stuck 으로
//   판정했다. 1.5초마다 참이 되고 3연속(≈4.5초)이면 unstuckNpc 가 `npc.x + cos(랜덤)*80` 으로 튕겨 낸다.
//   → 제자리에 서 있어야 할 NPC가 4.5초마다 무작위로 80px 씩 튀고 다음 결정이 도로 끌어당긴다. 이것이 재민이
//     본 "미세하게 자꾸 방황"의 잔여분이다. 어부만의 문제가 아니라 **가만히 서는 모든 NPC**(취침·대기 포함)에
//     걸리는 엔진 층 결함이다.
//   실측(probe-nightlife 3초 간격, 낚시 목표 344표본): 목표 좌표가 셀중심(=어장 후보)이 아닌 표본 29개(8.4%)가
//     전부 자기 위치에서 반경 ≤80.6px — unstuckNpc 의 무작위 튕김. 목표가 바뀐 126쌍 중 29쌍(23%)이 이것이었다.
//   ⇒ 목표에 도착(경로 소진 + 12px 이내)했으면 stuck 이 아니다. 12px 은 followNpcPath 의 도착 판정(10px)과 맞춘 값.
//     영구 정지 위험 없음: 도착지가 벽 안이든 물가든 **다음 결정**이 새 목표를 주고, 그때 거리가 12px 을 넘으면
//     stuck 감지는 종전대로 작동한다.
function detectStuck(npc, now) {
  if (npc.targetX != null && npc.targetY != null
      && (!npc.path || npc.pathIndex >= npc.path.length)
      && Math.hypot(npc.x - npc.targetX, npc.y - npc.targetY) < 12) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now };   // 서 있는 동안 타이머를 계속 리셋 — 떠날 때 즉시 오판 금지
    npc._stuckN = 0;
    return false;
  }
  if (!npc._stuckPos) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now };
    return false;
  }
  const moved = Math.hypot(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y);
  if (moved > 5) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now };
    npc._stuckN = 0;   // ★[생활 층 100% ①] 정상 이동 재개 → 연속 stuck 카운터 리셋
    return false;
  }
  if (now - npc._stuckPos.at > 1500) {
    npc._stuckPos = { x: npc.x, y: npc.y, at: now }; // reset
    return true;
  }
  return false;
}
// stuck 해소: path·target 비우고 짧은 wander 방향 + 다음 decide 트리거
// ★[생활 층 100% ①] 주민은 목표 유지·즉시 재경로(랩엔 랜덤 회피가 없다 — 경로가 벽 변을 인지하니 재탐색이 정답).
//   A* 쿨다운·경로 캐시를 무효화해 다음 틱에 새 경로(스무딩 포함). 3연속 stuck만 현행 랜덤 회피 폴백(만능 방어).
function unstuckNpc(npc, now) {
  npc.path = null;
  npc.pathIndex = 0;
  if (npc.simVillageId && typeof npc.targetX === 'number' && (npc._stuckN = (npc._stuckN || 0) + 1) < 3) {
    npc._lastAStarAt = 0; npc._pathFor = null;   // 재경로 강제(목표 불변 — 랩 setPath 재호출 동형)
    npc.nextDecisionAt = now + 400;
    npc.vx = 0; npc.vy = 0;
    return;
  }
  npc._stuckN = 0;
  // 작은 회피 — 랜덤 방향으로 짧게 비킨다
  const ang = Math.random() * Math.PI * 2;
  npc.targetX = npc.x + Math.cos(ang) * 80;
  npc.targetY = npc.y + Math.sin(ang) * 80;
  npc.nextDecisionAt = now + 800; // 잠깐 wander 후 다시 결정
  npc.behavior = 'wander';
  npc.vx = 0; npc.vy = 0;
}

// =============================================================================
// ★[생활 층 이관 ① — 랩 sepAgents(7954) 동형, 2026-07-27] 맵 위 NPC 통합 소프트 상호 분리.
//   랩 정본: 개인공간 0.85셀 소프트 밀림(가중 평균) + NPC_BODY 0.5셀(성인 어깨폭 고증)=단단한
//   하한 별도 층(최소 해소 속도 보장). 서버 스케일 1셀=32px → R_SOFT 27.2px·R_BODY 16px.
//   대상=활성 NPC만. 좌표 단일 작성자 계약: simCaravan(villages.js 경로 페이싱)·simWar(행군 대형)는
//   그리드(고정체) 등록만 하고 밀리지 않음. 사람 플레이어도 고정체(랩 전투원 패턴) — 클라 예측
//   리컨실리에이션 러버밴딩 방지, NPC가 사람을 비켜 흐른다. 벽·물로는 안 밀림(성분별 취소 —
//   movePlayerStep 콜라이더와 동일 판정 재사용). 해시 그리드 O(N×국소밀도), 틱당 1회.
// =============================================================================
const SEP_SOFT_PX = 27.2, SEP_BODY_PX = 16, SEP_BK = 64;   // 0.85셀 개인공간 · 0.5셀 몸(NPC_BODY 정본 수동 동기) · 버킷 2셀
function sepNpcs(dt) {
  const G = new Map(), gkey = (x, y) => ((x / SEP_BK) | 0) * 100000 + ((y / SEP_BK) | 0) + 5000000;
  const movers = [];
  for (const pid of npcs) {
    const p = players.get(pid);
    if (!p || p.hp <= 0 || p.handingOff) continue;
    if (!p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;   // dormant 스킵(비용·기존 정지 규약 동일)
    const k = gkey(p.x, p.y), c = G.get(k);
    c ? c.push(p) : G.set(k, [p]);
    if (p.simCaravan || p.simWar) continue;   // 단일 작성자 계약 — 고정체로만 참여
    movers.push(p);
  }
  for (const p of players.values()) {   // 사람 = 밀리지 않는 고정체 등록(NPC가 비켜감)
    if (p.isNpc || p.handingOff) continue;
    const k = gkey(p.x, p.y), c = G.get(k);
    c ? c.push(p) : G.set(k, [p]);
  }
  const R2 = SEP_SOFT_PX * SEP_SOFT_PX;
  const push = Math.min(16, 26 * dt);   // 소프트 밀림 상한(랩 min(0.5, 0.35·dGM)셀 동형 스케일)
  for (const p of movers) {
    let sx = 0, sy = 0, n = 0, hx = 0, hy = 0, hn = 0;
    const bx = (p.x / SEP_BK) | 0, by = (p.y / SEP_BK) | 0;
    for (let ix = bx - 1; ix <= bx + 1; ix++) for (let iy = by - 1; iy <= by + 1; iy++) {
      const c = G.get(ix * 100000 + iy + 5000000);
      if (!c) continue;
      for (const o of c) {
        if (o === p || (o.floor || 0) !== (p.floor || 0)) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          sx += dx / d * (1 - d / SEP_SOFT_PX); sy += dy / d * (1 - d / SEP_SOFT_PX); n++;
          if (d < SEP_BODY_PX) { hx += dx / d * (SEP_BODY_PX - d) * 0.5; hy += dy / d * (SEP_BODY_PX - d) * 0.5; hn++; }   // ★몸 하한 침범분 위치보정 누적(소프트와 별개 층)
        }
      }
    }
    if (!n && !hn) continue;
    let mx = n ? sx / n * push : 0, my = n ? sy / n * push : 0;
    if (hn) { const hl = Math.hypot(hx, hy); if (hl > 1e-9) { const hk = Math.min(1, Math.max(push, 2.5) / hl); mx += hx * hk; my += hy * hk; } }   // 몸 겹침 해소 최소 2.5px/틱(랩 0.08셀 동형) — 1×에서도 수 틱 내 단단히 풀림
    const pf = p.floor || 0;
    const nx = p.x + mx, ny = p.y + my;
    if (!isTerrainBlockedLocal(nx, p.y) && !isBlockedByWall(nx, p.y, p.x, p.y, pf)) p.x = nx;   // 물·벽 변으로는 안 밀림(성분별 취소)
    if (!isTerrainBlockedLocal(p.x, ny) && !isBlockedByWall(p.x, ny, p.x, p.y, pf)) p.y = ny;
  }
}

function npcStep(npc, dt, now) {
  decideNpcBehavior(npc, now);

  // ★[§15 2파·비전투원 대피] 전투·긴급 소집 중 마을 주민(villages.js가 simEvacUntil 소프트 TTL 설정) —
  //   행동 목표를 자택으로 고정(취침·출근 대신 '대피'). TTL 만료(전투 종결)면 자동 해제. fight(교전)는 예외.
  if (npc.simEvacUntil && now < npc.simEvacUntil && npc.behavior !== 'fight' && npc.npcHomeX != null) {
    npc.behavior = 'wander'; npc.targetX = npc.npcHomeX; npc.targetY = npc.npcHomeY; npc.gatherTarget = null;
    if (npc._lifeAct !== '대피') { npc._lifeAct = '대피'; npc._lifeActAt = now; }   // ★[액션 라벨 가시화] 비전투원 대피(랩 '대피' 동형)
  }
  // ★[§19 4파·경도 로컬 태양시] 마을 시뮬 NPC 야간 귀가(동쪽 마을이 먼저 자고 먼저 깬다 — 원통 세계 대비).
  //   인간 일과만 로컬 fv=(전역 phase+마을 _lonOff)%1 — 야생·도적·econ 일 경계는 전역 유지(랩 5351 블록 계약).
  //   VILLAGE_LON=0 게이트. 서버 NPC 일과 모델이 얕아(§2 매트릭스) 야간 자택 대기가 첫 스케줄 소비처(최소 실체).
  else if (SIM_LON_ON && npc.simLonOff != null && npc.npcHomeX != null && npc.behavior !== 'fight') {
    const fv = (worldPhase(now) + npc.simLonOff) % 1;
    if (fv > WORLD.dayPhaseRatio) { npc.targetX = npc.npcBedX ?? npc.npcHomeX; npc.targetY = npc.npcBedY ?? npc.npcHomeY; if (npc.behavior !== 'wander') { npc.behavior = 'wander'; npc.path = null; } npc.gatherTarget = null; }   // ★[침대 진입] 밤 목표=실내 침대(npcLifeTick과 동일 — 두 게이트가 침대/마당으로 갈라지면 왕복 진동). 자리 분산은 1인 1침대(BED_SLOTS)가 실체로 보장
  }

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
          if (HOSTILES_ON || !(ANIMALS[respawnType] && ANIMALS[respawnType].aggressive)) setTimeout(() => {
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
  let speedMult = npc.behavior === 'flee' ? 2.5 : 0.6;   // ★도주=달리기 5m/s(맨몸이라 전투 유닛 돌격보다 빠름 → 추격 어려움, 고증). 배회=1.2
  if (npc.behavior !== 'flee' && npc._huntSpd) speedMult *= npc._huntSpd;   // ★[사냥꾼 완전체] wildlife 두뇌 배속(랩 moveNPC 동형): 잠행 0.5×·추적/회수 2×·속보 1.25×·조준 정지≈0
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
          const loot = lootOfResource(r);   // ★정본 하나 — 플레이어와 같은 표를 쓴다(사본 금지)
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
      // 농지 짓기 — 마을 농부는 개인 사유지 없어도 OK (decide ③와 일치)
      if ((npc.inventory.seed_berry || 0) >= 1 && (npc.myClaim || npc.npcJob === 'farmer')) {
        const gx = Math.floor(npc.x / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
        const gy = Math.floor(npc.y / BUILDING_SIZE) * BUILDING_SIZE + BUILDING_SIZE / 2;
        // 같은 타일 중복 체크
        let occupied = false;
        for (const b of buildings.values()) if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE) { occupied = true; break; }
        if (!occupied && !isTerrainBlockedLocal(gx, gy)) {  // 농지도 LAND에만 (물·바위 위 X)
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
// §4-4 Stage 2·3 훅 → Stage 4A에서 spawnVillagers '앞'으로 이동 — 레거시 디듀프가 시뮬이 차지한
//   마을 집합(DB rows가 진실, 시딩 포함)을 먼저 확정해야 해서다. 의존 심볼(spawnNpc·players·claims·
//   지형 콜라이더)은 이 시점에 전부 준비됨(직후 spawnVillagers가 같은 것을 쓰는 것으로 보증).
//   ENABLE_VILLAGES=0 → init 즉시 return → isLegacyVillageClaimed 항상 false = 레거시 50곳 전부 유지(기존과 동일).
// §4-4 Stage 4B: isPositionActive(AOI 상세/보간 분기)·isBlockedByWall(캐러밴 벽 충돌·로컬 재경로) 추가 주입.
// §4-4 P2 LOD: anyViewerNear(defCenterPx, r) 추가 주입 — villages.js 가 전쟁 eta 결판을 physical/headless 로 분기(서버 내부 스텝만, broadcast·렌더 없음).
// ★[11차 재민 확정] "마을 안에는 숲이 없어야 하고, 영토가 확장되면 바로 벴으면 좋겠어."
//   마을을 세우는 건 곧 그 땅을 **개간**하는 일이다. 지금까지는 제거 경로가 '채집' 하나뿐이라
//   숲에 선 마을은 집·밭 위에 나무가 그대로 서 있었다(실측: 임업3 영토 안 564그루, 어촌2 562그루).
//   자원 제거는 채집과 **같은 경로**를 쓴다 — harvestedSeeds + DB + 청크 + 브로드캐스트.
//   (영토 확장은 아직 기능 자체가 없다. 생기면 새로 들어온 셀만 이 함수에 넘기면 된다.)
function clearTreesInCells(cellKeys) {
  if (!cellKeys || !cellKeys.size) return 0;
  let cleared = 0;
  const seen = new Set();
  for (const k of cellKeys) {
    const ci = k.indexOf(','), cx = +k.slice(0, ci), cy = +k.slice(ci + 1);
    const px = cx * 32 + 16, py = cy * 32 + 16;
    const near = qtResources ? qtResources.queryCircle(px, py, 24) : [];
    for (const r of near) {
      if (r.type !== 'tree' || seen.has(r.id)) continue;
      if (Math.floor(r.x / 32) !== cx || Math.floor(r.y / 32) !== cy) continue;   // 이 셀 것만
      seen.add(r.id);
      resources.delete(r.id);
      chunkManager.removeResource(r);
      if (r.isSeed && r.seedKey) { harvestedSeeds.add(r.seedKey); try { db.insertHarvestedSeed(r.seedKey); } catch (e) {} }
      else if (r.dbId) { try { db.deleteResource(r.dbId); } catch (e) {} }
      broadcast({ type: 'resource_removed', id: r.id });
      cleared++;
    }
  }
  if (cleared) resourcesDirty = true;
  return cleared;
}
const _simNow = () => { try { return (SimVillages.dayNow && SimVillages.dayNow()) || Date.now(); } catch (e) { return Date.now(); } };
SimVillages.init({ spawnNpc, players, npcs, broadcast, isTerrainBlockedLocal, isWaterTileLocal, isPositionActive, isBlockedByWall, anyViewerNear, perfMark,
  ioBusy, ioQuietMs,   // ★[T42-b] 배경 작업이 '한가한가'를 판단할 때 **날아가는 쓰기**도 본다
  clearTreesInCells,   // ★영토 개간 — 마을 안엔 숲이 없다
  // ★[T19 2026-09-02] 마을이 **하나 늘었다**는 통지. 온보딩이 그 마을의 도착 지점을 그때 굽는다
  //   (부팅 굽기가 이미 끝난 뒤라 스스로는 안 굽는다 — `onboarding.arrivalOf` 의 `_arrDone` 조기반환).
  //   ⚠전체 재계산이 아니다. 한 마을분(실측 0.7초 남짓)이고, 마을은 사람이 세울 때만 는다.
  onVillageAdded: (dbId) => { try { Onboarding.noteVillage(dbId); } catch (e) {} },
  // ★[11차 실측] 교역 거리행렬의 코스 그리드(4셀 서브샘플)가 **폭 2셀 다리를 절반이나 못 본다**(28개 중 15개).
  //   다리 술어를 넘겨 주면 villages.js 가 코스 셀 안을 훑어 '이 블록에 다리가 지난다'를 살려낸다.
  isBridgeLocal: isBridgeTileLocal,
  // ★[11차 채광 재설계] NPC 광부가 **플레이어와 같은 광맥 장부**(minedCells)를 판다.
  //   villages.js 는 재고를 깎고 oFrac 을 읽기만 한다 — 산출 아이템은 econ 이 land.ore 로 계산(이중 계상 금지).
  //   ★[T1 2026-09-01] 시각은 `SimVillages.dayNow()` 로 읽는다 — **일틱 마감 중이면 경계의 순간**이다.
  //     조각내기 전엔 하루 전체가 한 순간이었다. 그대로 `Date.now()` 를 읽으면 광맥 재생 적분이
  //     '조각이 몇 번째로 돌았나'에 따라 달라져, 쪼갠 것만으로 세계가 갈린다(실측 — `test-tick-slicer ⑧`).
  //     마감 밖(플레이어 채광)에선 그냥 지금이다.
  oreStockAt: (cx, cy) => { const now = _simNow(); const r = _oreRec(cx + '_' + cy, now); return r.s; },
  oreConsumeAt: (cx, cy, amount) => {
    if (!(amount > 0)) return 0;
    const now = _simNow(), key = cx + '_' + cy, rec = _oreRec(key, now);
    const got = Math.min(amount, Math.max(0, rec.s));
    if (got <= 0) { if (!rec.fresh) _oreSave(key, rec); return 0; }
    rec.s -= got; _oreSave(key, rec); return got;
  },
  // ★NPC 경제가 보는 p 는 **자잘을 뺀 합성**이다(isMajorOreAt 과 짝) — 자잘은 플레이어 전용
  oreProbAt: (px, py) => (_terrain.oreProbMajorAt ? _terrain.oreProbMajorAt(ZONE_ID, px, py) : 0.3),
  ORE_K: require('./specialty').ORE_K, NPC_MINE_PER_DAY: require('./specialty').NPC_MINE_PER_DAY,
  // ★NPC 광부도 **플레이어와 같은 공식**으로 깊이 페널티를 겪고 숙련으로 상쇄한다(축이 하나다)
  mineDepthCost: (f) => require('./specialty').mineDepthCost(f),
  mineDepthP: (f) => require('./specialty').mineDepthP(f),   // ★NPC도 같은 깊이 보정을 받는다(축이 하나다)
  mineChunkKg: (lvl) => require('./specialty').mineChunkKg(lvl),   // ★const Specialty 선언(3400+)보다 앞이라 TDZ — require 캐시로 우회
  liveBuildRow: _liveBuildRow, buildings, chunkManager,   // ★[생활 층 ③] 신축 크루의 라이브 실체화 경로(플레이어 완공과 동일 헬퍼 — 발명 금지)
  worldPhase, dayPhaseRatio: WORLD.dayPhaseRatio, mobs, qtResources: () => qtResources });   // ★[생활 층 100% ②③] 일과 스케줄(하루 위상)·직업 실작업(자원·사냥감 현장) 소스
// ★[11차 T3 환호] 도랑 콜라이더 적재 — SimVillages.init이 시범 마을 도랑을 실체화한 **직후**여야 한다.
//   (이 줄이 없으면 도랑 행은 DB에 있는데 통행 판정은 열려 있는 '유령 도랑'이 된다.)
console.log(`[${ZONE_ID}] 🏰 환호 콜라이더: ${refreshDitchCells()}셀 적재`);
// §11 도적 1파 — SimVillages.init 직후(banditHost 준비 시점): 소굴 스캔/복원 + econ 훅(banditRouteRisk/onBanditLoot) 배선.
Bandits.init();
// §16 답압 길 4파 — 존 셀 치수·게임일 시계로 독립 부팅(villages와 무관 — 스탬프는 이동 루프 편승).
Roads.init({ zoneId: ZONE_ID, cellsW: Math.ceil(ZONE.zoneWidth / 32), cellsH: Math.ceil(ZONE.zoneHeight / 32), epoch: WORLD.worldEpoch || 0, dayMs: parseInt(process.env.VILLAGE_DAY_MS || '', 10) || WORLD.dayLengthMs, broadcast });
// ★[배치 20 B] Soil.init 은 여기가 아니라 **minedCells 적재 뒤**(3900+)에 있다 —
//   채굴 거울 씨앗이 minedCells 를 읽는데 그 const 선언이 아래라 TDZ 다(2027 의 Specialty 와 같은 함정).
// §4-4 마지막 조각: 동물 AI 블록(마을실험실 야생 5종 🦌🐇🐗🐺🐯) — server/wildlife.js.
//   뷰(LOD)=활성 청크 bbox, 스폰=서식 밴드(마을 완충 100~250m — SimVillages/레거시 마을 기준),
//   agents=사람 플레이어+활성 NPC(지각·도주·맹수 위협 대상), 피해=damagePlayer 브리지.
//   SimVillages.init 뒤: clientVillages(마을 중심)가 준비된 시점. ENABLE_WILDLIFE=0 → init 즉시 return.
Wildlife.init({
  ZONE_ID, ZONE, TICK_HZ, chunkManager, mobs, players,
  isTerrainBlockedLocal, isRockTileLocal, terrainMod: _terrain,
  getActiveChunkKeys: () => activeChunkKeys, isPositionActive,
  spawnCorpse, damagePlayer, broadcast, WORLD,
  simVillages: () => SimVillages.clientVillages(), legacyVillages: VILLAGES,
  // §4-4 P3: 실체 전쟁 병사 pid 위치(px)를 야생 위협원으로 주입(_buildWarThreats 서버판 — 행군/전투 병사를 몹이 인지·회피).
  warThreats: () => SimVillages.warThreats(),
});
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

// ★[온보딩 v2] 도착 지점·대본 상태 — 정본은 `server/onboarding.js`. 여기서는 **이미 있는 것만 넘긴다**(사본 금지).
Onboarding.init({ SimVillages, terrain: _terrain, ZONE, ZONE_ID, db: db.db, send, players, Events: require('./events'),
  isTerrainBlockedLocal, isWaterTileLocal, isBridgeLocal: isBridgeTileLocal, isSeaTileLocal,
  foodItems: new Set(Object.keys(FOOD_EFFECTS)), gameDay: zoneGameDay,
  // ★[T19] 유저 마을을 시작 지도에 올릴지 — 판정 정본은 `newcomers.js` 하나다.
  //   여기서 넘기는 건 **부르는 법**뿐이다(온보딩은 자격을 모른다 — 알면 그게 두 번째 판정이다).
  newcomers: (vid) => {
    try {
      const e = Newcomers.listable(vid);
      const vil = SimVillages.villageByDbId ? SimVillages.villageByDbId(vid) : null;
      e.founderName = (vil && vil.econ && vil.econ.founderName) || '';
      return e;
    } catch (err) { return null; }
  } });

// ★[T11 2026-09-02] 마을 소속·곳간 인출 — **이미 있는 것만 넘긴다**(사본 금지).
//   기여 계량기는 안 넘긴다: `membership.js` 가 온보딩 정본을 직접 읽는다(계량기는 하나다).
Membership.init({ SimVillages, ZONE_ID, send, players, gameDay: zoneGameDay,
  afterWithdraw: (player, r) => _afterWithdraw(player, r) });

// ★[T45 2026-09-02] 사유지 v2 — **이미 있는 것만 넘긴다**(사본 금지).
//   ⚠`gameDay` 를 일부러 안 넘긴다 — 부재 시계는 **실시간**이고 세계의 시간이 아니다(claims.js 제3 규약).
Claims.init({ claims, buildings, players, db, central, broadcast, ZONE_ID, BUILDING_SIZE });
Claims.start();

// ★[T19 2026-09-02] 이방인 받기 — **이미 있는 것만 넘긴다**(사본 금지).
//   ⚠`holdDays` 는 T45 가 정한 "자리를 비웠다"의 선이다. 여기서 새 수를 만들지 않는다(축이 하나다).
Newcomers.init({
  buildings, players, central, ZONE_ID,
  econ: require('../sim/economy-sim'),
  villageOf: (vid) => (SimVillages.villageByDbId ? SimVillages.villageByDbId(vid) : null),
  playerVillages: () => (SimVillages.playerVillages ? SimVillages.playerVillages() : []),
  arrivalOf: (vid) => Onboarding.arrivalOf(vid),
  updateBuildingData: (dbId, json) => db.updateBuildingData(dbId, json),
  holdDays: Claims.CFG.HOLD_DAYS,
  send,
  // ★채팅 경로도 **재고 열람과 같은 술어**를 밟는다 — 권한·거리를 여기서 다시 적지 않는다.
  nearHall: (player) => {
    let best = null, bd = 200;
    for (const b of buildings.values()) {
      if (!b || b.type !== 'village_hall') continue;
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (d <= bd && _furnaceCanUse(player, b)) { bd = d; best = b; }
    }
    return best;
  },
  setSwitch: (player, hall, on) => tryVillageWelcome(player, hall.id, on),
});
Newcomers.start();
// ★[T56 2026-09-02] 외침·구조 동사 — **이미 있는 것만 넘긴다**(사본 금지 · T11 과 같은 규약).
//   마을 반경·물·바다·먹기·방위말이 전부 남의 정본이다. `rescue.js` 는 소리와 문법만 갖는다.
Rescue.init({ players, send, ZONE_ID,
  shelterAt: (x, y) => SimVillages.shelterAt(x, y),
  isWaterTile: isWaterTileLocal, isSeaTile: isSeaTileLocal,
  doEat: (giver, item, n, target) => doEat(giver, item, n, target),
  dirWord: Onboarding.dirWord,
  foodItems: new Set(Object.keys(FOOD_EFFECTS)),
  //   ★이름표는 **함수로** 넘긴다 — 표가 이 줄보다 **뒤에서** 채워지기 때문이다
  //     (`ITEM_LABEL_SERVER` 는 작물·특산까지 흡수한 뒤 완성된다). 값으로 넘기면 빈 표를 붙든다.
  itemLabel: () => ITEM_LABEL_SERVER,
  RESCUE_RANGE_PX, RESCUE_WINDOW_MS, WATER_DRINK_AMOUNT, THIRST_MAX,
  afterVerb: (p) => { try { send(p.ws, { type: 'gauges', hunger: Math.round(p.hunger), thirst: Math.round(p.thirst), body: Body.selfPayload(p) }); savePlayer(p); } catch (e) {} } });

// Phase 12.2.e: 자원 respawn 제거 — 청크 활성화 시 시드로 자동 생성됨

// === HTTP + WebSocket ===
const server = http.createServer((req, res) => {
  // ★★[RTT 상관 계측 2026-08-30 재민 지시] **수리가 아니라 계측이다.**
  //   재민 실기: RTT 가 이따금 튄다. 후보는 econ 하루 틱(실측 346ms)과 주기 저장이다.
  //   추정으로 고치지 않는다 — 무거운 작업이 **언제 얼마나** 걸렸는지 남기고,
  //   클라가 잰 RTT 와 **시간 상관**을 본다(`scripts/rtt-metrics.js`).
  if (req.url && req.url.startsWith('/perf') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // ★[T1 §0·§2-④ 2026-09-01] 일틱 **단계별·조각별** 소요와 **이벤트 루프 지연**을 같이 낸다 —
    //   `econ_day 480ms` 한 수만으론 어느 단계가 살찐 놈인지도, 루프가 얼마나 막혔는지도 알 수 없다.
    //   `?reset=1` 은 루프 히스토그램만 영점 조정한다(하네스가 창을 열기 직전에 부른다).
    let _econ = null; try { _econ = SimVillages.tickPerf ? SimVillages.tickPerf() : null; } catch (e) {}
    const _rst = req.url.indexOf('reset=1') >= 0;
    res.end(JSON.stringify({ zone: ZONE_ID, now: Date.now(), sliceMs: SimVillages.tickSliceMs ? SimVillages.tickSliceMs() : null,
      events: _perfRing.slice(), econTick: _econ, loop: loopDelayStats(_rst) }));
    return;
  }
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
  // ★[T47 테스트 전용 · `E2E_GIVE=1` 게이트] **몸의 정본을 그대로** 내준다(읽기 전용).
  //   왜 필요한가: welcome 은 몸의 일부만 싣는다(도구·인벤). 왕복 전후로 **13가지가 다 같은가**를
  //   재려면 `serializeBody` 그 자체를 봐야 한다 — 다른 표를 만들면 그 표가 먼저 틀린다(사본 금지).
  // ★[T42 테스트 전용 · `E2E_GIVE=1` 게이트] 교역로 캐시 관측·감사(읽기 전용 + 명시적 무효화).
  //   `?audit=N` — 캐시에 든 N 쌍을 **실제로 다시 계산해** 비교(영속이 답을 안 바꾼다는 증명).
  //   `?invalidate=1` — **진짜** `invalidateTradeDistances` 를 부른다(하네스가 사본을 만들지 않게).
  if (req.url && req.url.startsWith('/routedbg') && req.method === 'GET' && process.env.E2E_GIVE === '1') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    try {
      const u = new URL(req.url, 'http://x');
      res.end(JSON.stringify(SimVillages.routeDebug
        ? SimVillages.routeDebug({ audit: parseInt(u.searchParams.get('audit') || '0', 10) || 0, invalidate: u.searchParams.get('invalidate') === '1' })
        : { err: 'routeDebug 미탑재' }));
    } catch (e) { res.end(JSON.stringify({ err: e.message })); }
    return;
  }
  if (req.url && req.url.startsWith('/bodydbg') && req.method === 'GET' && process.env.E2E_GIVE === '1') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    try {
      const u = new URL(req.url, 'http://x');
      const want = u.searchParams.get('name');
      const out = {};
      for (const p of players.values()) { if (p.isNpc) continue; if (want && p.name !== want) continue; out[p.name] = serializeBody(p); }
      res.end(JSON.stringify({ zone: ZONE_ID, bodies: out }));
    } catch (e) { res.end(JSON.stringify({ err: e.message })); }
    return;
  }
  // ★[T45] 사유지 상태 읽기 전용 JSON — 하네스 관측창(`/lifedbg` 와 같은 규약).
  //   ★내주는 것은 **정본 그 자체**(`Claims.debug()`)다 — 하네스가 산출을 다시 짜면 그게 사본이다.
  //   `?scan=1` 은 부재 배치를 **지금 한 번** 돌린다(30분을 기다리지 않고 상태기를 밟게 한다).
  if (req.url && req.url.startsWith('/claimdbg') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    const _done = (extra) => {
      try {
        const list = [];
        for (const [id, c] of claims) list.push({ id, dbId: c.dbId || null, owner: c.ownerPid, name: c.ownerName,
          kind: c.kind || null, state: c.state || 'active', heldBy: c.heldBy || null,
          cx: Math.floor(c.x / BUILDING_SIZE), cy: Math.floor(c.y / BUILDING_SIZE),
          cells: Array.isArray(c.cells) ? c.cells.length : 1 });
        res.end(JSON.stringify(Object.assign({ zone: ZONE_ID, claims: list }, Claims.debug(), extra || {})));
      } catch (e) { res.end(JSON.stringify({ err: e.message })); }
    };
    if (req.url.indexOf('scan=1') >= 0) { Claims.scanAbsence().then((r) => _done({ scan: r })).catch((e) => _done({ scanErr: e.message })); return; }
    _done();
    return;
  }
  // ★[T19] 이방인 받기 상태 읽기 전용 JSON — 하네스 관측창(`/claimdbg` 와 같은 규약).
  //   내주는 것은 **정본 그 자체**(`Newcomers.debug()`). `?scan=1` 이면 central 질의를 지금 한 번 돈다.
  if (req.url && req.url.startsWith('/welcomedbg') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    const _out = (extra) => { try { res.end(JSON.stringify(Object.assign({ zone: ZONE_ID }, Newcomers.debug(), extra || {}))); }
                              catch (e) { res.end(JSON.stringify({ err: e.message })); } };
    if (req.url.indexOf('scan=1') >= 0) { Newcomers.scan().then((r) => _out({ scan: r })).catch((e) => _out({ scanErr: e.message })); return; }
    _out();
    return;
  }
  // ★[온보딩 v2] 시작 화면이 읽는 마을 목록 — CORS 개방(`/lifedbg` 와 같은 규약: 민감 정보 없음)
  if (req.url && req.url.startsWith('/startinfo') && req.method === 'GET') return Onboarding.httpStartInfo(req, res);
  if (req.url && req.url.startsWith('/lifedbg') && req.method === 'GET') {
    // ★[직접 서버 디버깅 — 사용자 "네가 직접 서버에서 디버깅하는 방법은 없어?"] 생활 층 내부 상태 읽기 전용 JSON.
    //   CORS *: 게임 페이지·외부 도구에서 크로스오리진 fetch 허용(민감정보 없음 — NPC 시뮬 상태만).
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    try { res.end(JSON.stringify(SimVillages.lifeDebug ? SimVillages.lifeDebug() : { err: 'lifeDebug 미탑재' })); }
    catch (e) { res.end(JSON.stringify({ err: e.message })); }
    return;
  }
  // ★[2026-08-04d 배치 18 ①] 방 판정 상태 읽기 전용 JSON — 하네스 정본 관측창.
  //   `?cx=&cy=&floor=` 를 주면 그 칸의 방을 함께 답한다(실내 판정을 서버 값으로 직접 확인).
  if (req.url && req.url.startsWith('/roomdbg') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    try {
      const u = new URL(req.url, 'http://x');
      const out = { ...Rooms.stats(), maxCells: Rooms.MAX_ROOM_CELLS, list: Rooms.allRooms().map(Rooms.wireRoom) };
      if (u.searchParams.has('cx')) {
        const cx = +u.searchParams.get('cx'), cy = +u.searchParams.get('cy'), f = +(u.searchParams.get('floor') || 0);
        const r = Rooms.roomAt(cx, cy, f);
        out.at = { cx, cy, floor: f, room: r ? Rooms.wireRoom(r) : null };
      }
      res.end(JSON.stringify(out));
    } catch (e) { res.end(JSON.stringify({ err: e.message })); }
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
          persistent: !!data.persistent,   // ★[배치 14 ②] 영속 신원 여부 — 존을 넘어도 저장이 이어진다
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

// ★★[접속 진단 배치 2026-08-30] **조용히 실패하지 않는다.**
//
//   실기 실측(라이브): 소켓은 열리는데 `welcome` 도 `pong` 도 안 와서, 클라가 15초마다
//   끊고 다시 붙기를 **무한 반복**했다. 화면에는 아무 말도 안 나왔고, 재민은 그게
//   **"기다리면 되는 것"인지 "진짜 에러"인지 구분할 방법이 없었다.**
//
//   원인 구조: 이 핸들러가 `async` 인데 **try/catch 가 없었다.** 중간 어디서든 던지면
//     · 소켓은 **열린 채로 남고**(클라 readyState=1)
//     · `attachPlayerHandlers` 에 도달하지 못해 **메시지 핸들러가 아예 안 붙는다**
//     · 그래서 welcome 도 pong 도 영영 안 온다 = **완벽한 침묵**
//   침묵은 진단 불가능한 상태다. 로그도 없고(unhandledRejection 핸들러도 없었다) 화면도 없다.
//
//   수리 셋:
//     ① **본문을 함수로 빼고 `.catch` 를 건다** — 던지면 `conn_error`(단계·사유·ref)를 보내고 닫는다.
//     ② **접속 즉시 `conn_hello`** — "받았다"를 인증보다 **먼저** 알린다.
//     ③ **조기 ping 응답** — 입장 처리가 끝나기 전에도 pong 을 돌려준다.
//        ⇒ 이 셋으로 클라가 **세 상태를 구분**한다:
//           pong 도 없음 = 서버/망이 죽었다 · pong 은 오는데 welcome 이 없음 = 입장 처리가 막혔다 ·
//           conn_error = 확정 오류(기다려도 안 된다).
let _connSeq = 0;
// 마감액 — env 로 조절한다(하네스가 짧게 줄여 검사한다).
const CONN_DEADLINE_MS = parseInt(process.env.CONN_DEADLINE_MS || '30000', 10) || 30000;
// ★반쯤 등록된 몸을 치운다 — 안 치우면 서버에 **아무도 조종하지 않는 유령**이 남고,
//   그 pid 가 틱에 계속 실려 남들 화면에 서 있는다(인원수·PLAYER_CAP 도 갉아먹는다).
function _connCleanupHalf(C) {
  if (!C || !C.pid || !players.has(C.pid)) return;
  try { players.delete(C.pid); broadcast({ type: 'player_left', pid: C.pid }); } catch (_) {}
  console.error(`[${ZONE_ID}]   ↳ 반쪽 등록 정리: ${C.pid}`);
}
wss.on('connection', (ws, req) => {
  const C = { ref: `c${++_connSeq}`, stage: 'accepted', at: Date.now() };
  ws.__conn = C;
  // ★★[T42-b 2026-09-01] **처리 중인 접속을 센다.** 손님은 `players` 에 **등록된 뒤에야** 보인다 —
  //   인증·로드·스폰 동안은 아무도 없는 서버처럼 보이고, 그때 배경 작업(교역로 선계산)이
  //   2.4초짜리 A* 를 물면 그 사람의 입장이 그만큼 멈춘다. "사람이 없다 ≠ 할 일이 없다"의 둘째 얼굴.
  _connsInFlight++;
  const _connDone = () => { if (C.__counted) return; C.__counted = true; _connsInFlight--; _connsDoneAt = Date.now(); };
  C.done = _connDone;
  ws.on('close', _connDone);
  // ① 받았다 — 인증·로드보다 **먼저**. 이 한 줄이 "서버가 살아는 있다"의 증거다.
  try { ws.send(JSON.stringify({ type: 'conn_hello', zone: ZONE_ID, ref: C.ref, serverNow: C.at })); } catch (e) {}
  // ② 조기 ping 응답 — `attachPlayerHandlers` 가 붙기 **전에도** 살아 있음을 답한다.
  //   `ws.__ready` 가 서면 이 핸들러는 손을 뗀다(진짜 핸들러가 ping 을 맡는다 — 이중 pong 금지).
  ws.on('message', (raw) => {
    if (ws.__ready) return;
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m && m.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong', t: m.t, stage: C.stage, ref: C.ref })); } catch (e) {} }
  });
  // ④ **마감액** — try/catch 가 못 잡는 반쪽을 막는다.
  //   던지는 실패는 ③이 잡는다. 그런데 `await` 가 **영영 안 돌아오면** 던지지도 않는다
  //   (central 이 느리거나 응답을 안 끝내는 경우가 그렇다) — 그때도 화면은 똑같이 침묵한다.
  //   ⇒ 시간으로 끊고 **단계를 이름으로** 말한다. 클라 경고(20초)보다 뒤에 서게 둔다(30초).
  const _dl = setTimeout(() => {
    if (ws.__ready) return;
    console.error(`[${ZONE_ID}] ✗✗ 접속 처리 시간 초과 ref=${C.ref} stage=${C.stage} (${CONN_DEADLINE_MS}ms)`);
    _connCleanupHalf(C);
    try { ws.send(JSON.stringify({ type: 'conn_error', ref: C.ref, stage: C.stage,
      msg: `입장 처리 시간 초과(${Math.round(CONN_DEADLINE_MS / 1000)}초) — 단계 ${C.stage} 에서 멈췄다` })); } catch (_) {}
    setTimeout(() => { try { ws.close(4002, 'conn_timeout'); } catch (_) {} }, 150);
  }, CONN_DEADLINE_MS);
  const _clear = () => clearTimeout(_dl);
  ws.on('close', _clear);
  // ③ 에러 경계 — 던지면 **사유를 들고** 닫는다. 열린 채 침묵하는 길을 없앤다.
  _acceptConnection(ws, req, C).then(_clear).catch((e) => {
    _clear();
    const msg = String((e && e.message) || e).slice(0, 200);
    console.error(`[${ZONE_ID}] ✗✗ 접속 처리 실패 ref=${C.ref} stage=${C.stage}: ${msg}\n${(e && e.stack) || ''}`);
    _connCleanupHalf(C);
    try { ws.send(JSON.stringify({ type: 'conn_error', ref: C.ref, stage: C.stage, msg })); } catch (_) {}
    setTimeout(() => { try { ws.close(4001, 'conn_error'); } catch (_) {} }, 150);
  });
});

// ★[테스트 전용 손잡이 · `E2E_GIVE=1` 일 때만 산다] 지정한 단계에서 **일부러 던진다**.
//   에러 경계가 진짜로 잡는지는 실패를 만들어 봐야만 증명된다 — 안 그러면 하네스가 자명 통과다.
// ★[T47 테스트 전용 · `E2E_GIVE=1` 게이트] 핸드오프 페이로드에 **몸을 일부러 안 싣는다** —
//   롤링 배포 창(옛 존에서 넘어옴)을 시늉해 도착 경로의 **central 행 폴백**을 실제로 밟게 한다.
//   그 갈래를 밟아 보지 않으면 폴백은 "있다고 적혀만 있는 코드"다.
const E2E_HANDOFF_NO_BODY = (process.env.E2E_GIVE === '1') && process.env.E2E_HANDOFF_NO_BODY === '1';
const E2E_CONN_FAIL = (process.env.E2E_GIVE === '1') ? (process.env.E2E_CONN_FAIL || '') : '';
const E2E_CONN_HANG = (process.env.E2E_GIVE === '1') ? (process.env.E2E_CONN_HANG || '') : '';
function _connFailPoint(stage) {
  if (E2E_CONN_FAIL && E2E_CONN_FAIL === stage) throw new Error('[E2E] 일부러 던진다');
}
// ★[테스트 전용] 지정 단계에서 **영영 안 돌아온다** — 마감액이 진짜 끊는지 증명하려면
//   던지는 실패 말고 **안 끝나는 실패**를 만들어 봐야 한다(둘은 다른 결함이다).
function _connHangPoint(stage) {
  if (E2E_CONN_HANG && E2E_CONN_HANG === stage) return new Promise(() => {});
  return null;
}

async function _acceptConnection(ws, req, C) {
  metrics.ws_connects++;
  _connFailPoint('accepted');
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const isObserver = url.searchParams.get('observer') === '1';
  // Phase 5-G trace: observer 연결 진단용
  // ★[2026-08-04 라이브 실측 — 토큰 누설 수리] guest_token 이 ws 접속 URL 쿼리로 오는데,
  //   이 줄이 URL 을 통째로 찍어 **계정 열쇠가 서버 로그에 남았다**(배치 13 "토큰 로그 금지" 위반).
  //   로그에는 마스킹본만 남긴다 — 원본 req.url 파싱은 아래 로직이 그대로 쓴다.
  console.log(`[${ZONE_ID}] WS CONN attempt: observer=${isObserver} url=${String(req.url).replace(/guest_token=[0-9a-f]+/i, 'guest_token=***')} from=${req.socket.remoteAddress}`);
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
      simVillages: SimVillages.clientVillages(), // §4-4 Stage 4A: 마을 영토(경계 셀)·이름·인구 — 1회
    calendar: calendarNow(),                   // ★[달력 2026-08-30] 연·계절·일 — econ 정본에서 유도
    weather: weatherNow(),                     // ★[온도 곡선 2026-08-31] 바깥 날씨 — 입장 즉시 배지
      granStocks: SimVillages.granStocks(),      // ★곳간② 물리 재고 스냅샷(이후 gran_stock 델타) — 사다리 앞 짐더미 연출
      markets: SimVillages.marketVillages(),     // ★[10차 T4] 장마당 스냅샷 flat[ccx,ccy,…](이후 markets 방송) — 캐러밴 체류 중인 마을만
      banditCamps: Bandits.clientCamps(), // §11 도적: 소굴·야영 마커 1종 — 이후 bandit_camps가 변경분 방송
      roads: Roads.clientRoads(), // §16 답압 길: 등급 셀 flat [cx,cy,lv,...] — 이후 road_cells가 변경분 방송
    soil: Soil.clientSoil(),    // [배치 20 B] 타일 상태: 기준선에서 벗어난 셀 flat [cx,cy,qv,geo,ore,...] — 이후 tile_state가 변경분 방송
      bridges: (ZONE.bridges || null), // ★[다리 층] 통나무 널다리 셀 flat [cx,cy,...] — 정적(맵 사물)이라 welcome 1회
      ditches: ditchPayload(),         // ★[11차 T3 환호] 도랑 셀 flat [cx,cy,...] — 마을 소유 사물(부팅 후 불변)이라 welcome 1회
      buildings: activeChunkBuildings(),
      rooms: Rooms.allRooms().map(Rooms.wireRoom),   // ★[배치 18 ①] 방은 서버가 판정한다 — 클라는 받아 쓰기만(사본 방지)
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
    C.stage = 'observer';
    attachObserverHandlers(ws);
    ws.__ready = true;   // ★조기 ping 응답 종료(관찰자 핸들러가 맡는다 — 이중 pong 금지)
    if (C.done) C.done();   // ★[T42-b] 관전자도 여기서 처리가 끝난다 — 안 놓으면 배경 작업이 영영 안 돈다
    return;
  }

  // === 토큰 기반 핸드오프 우선 처리 ===
  const handoffToken = url.searchParams.get('handoff_token');
  // ★[테스트 전용] ZONE_TEST_INV="pillar:6,rafter:8,thatch:8" — 손님 초기 인벤에 얹는다.
  //   기존 VILLAGE_DAY_MS·VILLAGE_CARAVAN_BLOCKTEST와 같은 관례(env 미설정 = 운영 동작 완전 불변).
  //   하네스가 '재료 있음/없음' 두 경로를 실제 서버에서 재현하기 위한 유일한 통로.
  const _testInv = {};
  if (process.env.ZONE_TEST_INV) for (const kv of process.env.ZONE_TEST_INV.split(',')) { const [k, v] = kv.split(':'); if (k && +v > 0) _testInv[k.trim()] = +v; }
  let playerId, name, sx, sy, ivx = 0, ivy = 0, inventory = { wood: 0, stone: 0, ..._testInv }, color = '#5a9ae0';
  let tools = {}, equipped = null;
  let _loadEquipment = [], _loadEquipSlots = {}, _loadCraftSkill = {}, _loadCraftLog = {}, _loadOreLedger = {}, _loadOreCarry = {}; // 플레이어 아이템(품질·속성·내구·숙련)·원석 정체 장부 복원 버퍼 — tools_json blob piggyback
  let _loadFishStats = null;   // ★[낚시 v2] 어획 기록(마릿수·최대·놓친 최대) — 같은 blob 에 얹는다
  let _loadBody = null;        // ★[신체 상태 §7] 추위·피로·부상·사기
  let _loadKgLedger = null;    // ★[무게] 개체 실제 kg 장부
  let _loadLots = null;        // ★[무게] 식품 로트(취득일)
  let _loadLastSeenDay = null; // ★[T7] 마지막으로 세계를 본 게임일 — 복귀 브리핑의 근거
  let _loadMember = null;      // ★[T11] 마을 소속 — 몸을 따라 존을 넘고 재접속을 넘는다
  let initHunger = HUNGER_MAX, initThirst = THIRST_MAX, initVp = 0;
  let initVital = null;        // ★[T47] 핸드오프에서만 채워진다 — 존을 넘어도 HP·다운이 이어진다
  let initTribeId = null, initTribeName = null;
  let initFloor = 0;
  // 14.42-a: home (영구 부활 fallback). 게스트면 null로 유지.
  let initHomeZone = null, initHomeX = null, initHomeY = null;
  // ★★[2026-08-03f 배치 13] 게스트 영속 신원 — 클라가 보관하던 토큰(있으면)과, 이번에 발급해
  //   welcome 으로 **한 번만** 돌려줄 토큰. 그 외 어디에도 쓰지 않는다(로그·알림·채팅 금지).
  const inGuestToken = url.searchParams.get('guest_token') || null;
  let _guestTokenForWelcome = null;
  // ★[2026-08-03g 배치 14] 아래 인증 분기에서 정해져 **welcome·player 생성까지 살아 있어야** 하는 둘.
  //   (핸드오프 경로에서는 둘 다 기본값 — 핸드오프는 이미 신원이 증명된 이동이다.)
  let _persistentIdentity = false;   // 이 신원이 영속인가 — `canPersist`/savePlayer 가 이걸 본다
  let _promoted = false;             // 이번 접속에서 게스트 → 등록 계정 승계가 일어났나
  // ★★[2026-08-25 재민 확정 · 회부 B-6] **살아 있는 몸 인수인계.**
  //   같은 신원으로 새 소켓이 붙었는데 **옛 세션이 아직 이 존의 메모리에 서 있으면**,
  //   그 몸이 진실이다 — central 행이 아니라. 아래 중복 차단 루프가 여기에 담는다.
  let _takeover = null;

  if (handoffToken && pendingHandoffs.has(handoffToken)) {
    const pending = pendingHandoffs.get(handoffToken);
    pendingHandoffs.delete(handoffToken);
    playerId = pending.player_id || `anon_${Math.random().toString(36).slice(2,10)}`;
    //   ★[배치 14 ②] 등록 계정은 접두사로 판별되지만 **영속 게스트는 안 된다** — 출발 존이 실어 준 값을 쓴다.
    _persistentIdentity = !!pending.persistent || !playerId.startsWith('anon_');
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
    // ★★[T47 2026-09-01] **몸을 복원한다.** 종전엔 `pending.tools`(welcome 이 스스로 '옛 호환(사용 X)'
    //   이라 적어 둔 죽은 필드)만 읽어, 도구·장비·숙련·kg원장·로트·신체가 통째로 사라졌다.
    //   그리고 도착 존의 `savePlayer` 가 빈 몸으로 계정을 덮어 **재접속으로도 못 돌아왔다**(N.6).
    //
    //   ★출처 규칙: **페이로드에 몸이 있으면 페이로드.** 없으면 central 행에서 읽는다.
    //     시각 비교를 안 하는 이유: 출발 존이 `serializeBody` 로 만든 **같은 스냅샷**을
    //     행에 저장(await)하고 페이로드에도 실으므로 둘은 정의상 같다 — 중재할 경합이 없다.
    //     행 폴백이 필요한 경우는 **몸을 안 싣는 옛 존에서 넘어올 때**(롤링 배포 창) 하나뿐이고,
    //     그때는 출발 존이 떠나기 직전 저장한 행이 유일한 진실이다.
    let _pendBody = pending.body || null, _bodySrc = 'payload';
    if (!_pendBody) {
      try {
        const _row = await central.getPlayer(playerId);
        if (_row && _row.tools_json) { _pendBody = JSON.parse(_row.tools_json); _bodySrc = 'central행(폴백)'; }
      } catch (e) { console.warn(`[${ZONE_ID}] 핸드오프 몸 폴백 읽기 실패:`, e.message); }
    }
    {
      const B = parseBody(_pendBody || {}, { vitals: true });
      _loadEquipment = B.equipment; _loadEquipSlots = B.equipSlots; _loadCraftSkill = B.craftSkill;
      _loadCraftLog = B.craftLog; _loadOreLedger = B.oreLedger; _loadOreCarry = B.oreCarry;
      _loadFishStats = B.fishStats; _loadBody = B.body; _loadKgLedger = B.kgLedger; _loadLots = B.lots;
      _loadLastSeenDay = B.lastSeenDay;   // ★[T7] 존을 넘어도 부재 기준일은 따라간다(핸드오프는 부재가 아니다)
      _loadMember = B.member;             // ★[T11] 소속도 같은 몸에 실려 온다
      equipped = B.equipped || pending.equipped || null;
      initVital = B.vital;
      tools = { __toolItems: B.toolItems, __hotkey1: B.hotkey1 };
    }
    console.log(`[${ZONE_ID}] ✓ handoff token=${handoffToken.slice(0,8)} consumed (player=${playerId}) — 몸 출처 ${_bodySrc} · 도구 ${(tools.__toolItems || []).length}`);
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

    // ★★[2026-08-03g 배치 14] 신원 해석 → **공통 복원**.
    //   종전엔 등록 계정만 central 행을 복원했고 게스트는 빈 몸으로 태어났다. 이제 게스트도
    //   "비밀번호 없는 계정"이므로 **같은 행·같은 복원 경로**를 쓴다(게스트 전용 경로 금지 — 사본 금지).
    //   ⇒ 아래 분기는 `acct`(central players 행)만 정하고, 복원은 그 아래 한 곳에서 한다.
    let acct = null;              // central 행(등록 계정 또는 영속 게스트). null = 1회용 폴백
    let acctLabel = '';
    if (inUsername && inPassword) {
      // 14.42-a: 신규 가입이면 client가 선택한 home_zone 전달.
      //  - 이 zone(접속 zone)이 곧 home zone임 (lobby에서 선택한 zone에 ws 연결되니까)
      //  - 그 zone의 마을광장이 home 좌표
      const myMain = ZONE.mainSquare || { x: ZONE.zoneWidth/2, y: ZONE.zoneHeight/2 };
      let result = null;
      // ★★[배치 14 ①] **승계** — 게스트 토큰을 들고 이름·비밀번호를 처음 넣으면
      //   **새 계정을 만들지 않고 그 게스트 행에 비밀번호를 얹는다.** playerId 가 안 바뀌므로
      //   사유지·노·움집·마을 founder 가 **그대로 내 것**이다.
      //   (종전엔 등록하는 순간 새 playerId 로 태어나 배치 13 이 지킨 소유를 통째로 잃었다 — 역설.)
      if (inGuestToken) {
        try {
          const pr = await central.promoteGuest(inGuestToken, inUsername, inPassword, color, ZONE_ID, myMain.x, myMain.y);
          if (pr && pr.ok) { result = { ok: true, player: pr.player, isNew: false }; _promoted = true; acctLabel = '게스트 승계'; }
          else if (pr && pr.reason === 'username_taken') {
            send(ws, { type: 'auth_error', reason: 'username_taken' });
            setTimeout(() => { try { ws.close(); } catch (e) {} }, 100);
            return;
          }
          // 그 밖의 사유(토큰 무효·이미 승계됨)는 **막지 않고** 평소 로그인으로 흘린다
        } catch (e) { /* central 일시 장애 — 아래 authenticate 가 같은 사유로 다시 걸린다 */ }
      }
      if (!result) {
        C.stage = 'auth'; _connFailPoint('auth');
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
        acctLabel = result.isNew ? '신규 가입' : '로그인';
      }
      acct = result.player;
      _persistentIdentity = true;
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
        } catch (e) { /* central 죽었으면 그냥 통과 — 1회용 폴백이라 영속화 안 됨 */ }
      }
      // ★★[2026-08-03f 배치 13] **게스트 영속 신원** — 소유가 접속을 넘어 살아남는다.
      //   종전 한 줄: `playerId = \`anon_${Math.random()...}\`` — 접속마다 **다른 사람**이 됐다.
      //   그런데 이 세계의 소유 판정은 전부 playerId 대조다(사유지 `ownerPid` · 건물 `ownerId` ·
      //   노·숯가마·회관 `data.owner` · 마을 `founder`). 그래서 게스트는 끊겼다 붙는 순간
      //   **제가 지은 것의 주인이 아니게 됐다** — 마을 건립이 들어온 지금은 마을을 통째로 잃는 구멍이다.
      //   ⇒ central 이 불투명 토큰을 발급하고 클라가 localStorage 에 둔다. 다시 제시하면 같은 playerId.
      //   ⚠발급된 토큰은 **welcome 으로 클라에 한 번 보내는 것 말고 어디에도 쓰지 않는다.**
      //     로그·알림·채팅에 절대 찍지 않는다(토큰 유출 = 계정 탈취).
      let guestTokenOut = null;
      try {
        const g = await central.guestIdentity(inGuestToken);
        if (g && g.ok && g.player_id) {
          playerId = g.player_id; guestTokenOut = g.token || null;
          // ★[배치 14 ②] central 이 그 게스트의 **행 전체**를 함께 준다 — 등록 계정과 같은 복원 경로를 탄다.
          if (g.player) { acct = g.player; _persistentIdentity = true; }
        }
      } catch (e) { /* central 불가 — 아래 폴백(1회용 신원)으로 떨어진다. 기존 동작과 동일 */ }
      if (!playerId) {
        // ★폴백: central 이 죽어 있으면 종전 그대로 1회용 신원. 접속 자체를 막지 않는다
        //   (게스트에게 central 장애가 곧 '입장 불가'가 되면 그게 더 큰 퇴보다).
        //   ⚠이 신원은 **저장하지 않는다**(`_persistentIdentity` false) — 1회용이니 저장할 대상이 아니다.
        playerId = `anon_${Math.random().toString(36).slice(2, 10)}`;
      }
      _guestTokenForWelcome = guestTokenOut;
      acctLabel = `게스트 접속${guestTokenOut ? ' [영속 신원]' : ' [1회용 — central 불가]'}`;
    }

    // ── 공통 복원 — central 행이 있으면 등록 계정이든 영속 게스트든 **같은 경로** ──────────
    if (acct) {
      playerId = acct.player_id;
      //   ★표시 이름: 등록 계정은 계정 이름. 게스트는 이번에 입력한 이름이 있으면 그것(종전 동작),
      //     없으면 저장된 이름. 소유 판정에 이름을 쓰는 곳은 0곳이다(배치 13 전수 — 배치 14 재실행).
      name = (inUsername && inPassword) ? acct.name : (inUsername || acct.name || `여행자${nextPid}`);
      color = acct.color || color;
      // wood/stone은 컬럼, 나머지는 inventory_json에
      let extInv = {};
      C.stage = 'load'; _connFailPoint('load');
      try { extInv = acct.inventory_json ? JSON.parse(acct.inventory_json) : {}; }
      catch (e) { extInv = {}; }
      inventory = { wood: acct.wood | 0, stone: acct.stone | 0, ...extInv };
      // ★[T47] 복원은 `parseBody` **하나**다(저장·핸드오프와 같은 함수). 옛 형식 변환도 그 안에 있다.
      //   ★★[T43 2026-09-02] **`vitals:true` 로 바뀌었다 — 로그아웃이 더는 부활이 아니다.**
      //     종전 주석은 *"재접속의 풀피는 정책이다(T8 소관)"* 였다. 그 소관이 이 카드다(§12).
      //     쓰러진 채 창을 닫고 30초 뒤 들어오면 **여전히 쓰러져 있다** — 죽음의 대가가 0 이 아니게 된다.
      //     ⚠**부수 효과를 숨기지 않는다**: 이 한 줄은 downed 뿐 아니라 **모든 재접속의 공짜 풀피**를
      //       없앤다(HP 30 으로 나가면 HP 30 으로 들어온다). 그게 §12 의 방향이고, 되돌리려면
      //       여기 `vitals` 한 글자다. 죽음 설계 §5-2 가 "이걸 회부하라"고 한 그 부수 효과다.
      let _bodyRaw = {};
      try { _bodyRaw = acct.tools_json ? JSON.parse(acct.tools_json) : {}; }
      catch (e) { _bodyRaw = {}; }
      {
        const B = parseBody(_bodyRaw, { vitals: true });
        if (B.vital) initVital = B.vital;
        _loadEquipment = B.equipment; _loadEquipSlots = B.equipSlots; _loadCraftSkill = B.craftSkill;
        _loadCraftLog = B.craftLog; _loadOreLedger = B.oreLedger; _loadOreCarry = B.oreCarry;
        _loadFishStats = B.fishStats; _loadBody = B.body; _loadKgLedger = B.kgLedger; _loadLots = B.lots;
        _loadLastSeenDay = B.lastSeenDay;   // ★[T7] 복귀 브리핑 기준일(게임일)
        _loadMember = B.member;             // ★[T11] 소속
        if (B.equipped) equipped = B.equipped;
        // 저장용: 임시 wrap 객체 — 실제 player.toolItems/hotkey1 은 player 생성 시 풀린다
        tools = { __toolItems: B.toolItems, __hotkey1: B.hotkey1 };
      }
      // ★★★[재민 확정 2026-08-28] **시작 지급 제거됨.** 재민 원문: *"지급 아이템은 없어야 할 거 같은데"*
      //   여기 있던 것: `toolItems.length === 0` 이면 톱·망치·도끼를 하나씩 넣어 줬다.
      //   ★왜 지웠나 — 온보딩 캐논 §9 는 "나루터에서 온 이방인"이 **빈손으로 배고픈 채** 도착한다고 못 박는다.
      //     무료 보상 세례는 결핍을 없애고, 결핍이 첫 30분의 엔진이다.
      //   ★★그리고 실측해 보니 이건 시작 지급이 아니라 **매 접속 지급**이었다 — 조건이
      //     "도구가 하나도 없으면"이라 도구를 다 부순 사람이 재접속하면 새 도구 세 자루가 다시 생겼다.
      //   ⇒ 대신 맨손에서 시작하는 사다리를 놓았다(잔가지·자갈 → 조잡한 석기 → 제대로 된 도구 → 장인 정품).
      //   ⚠기존 플레이어의 소지품은 안 건드린다 — 위 복원 경로가 저장본을 그대로 읽는다.
      equipped = acct.equipped || null;
      initHunger = (typeof acct.hunger === 'number') ? acct.hunger : HUNGER_MAX;
      initThirst = (typeof acct.thirst === 'number') ? acct.thirst : THIRST_MAX;
      initVp = (typeof acct.violation_points === 'number') ? acct.violation_points : 0;
      initTribeId = acct.tribe_id || null;
      // 14.49-fix2: 옛 auto-stair 버그로 floor 1+에 stuck된 사용자 복구. 무조건 0F로 시작.
      initFloor = 0;
      initHomeZone = acct.home_zone || null;
      initHomeX = (typeof acct.home_x === 'number') ? acct.home_x : null;
      initHomeY = (typeof acct.home_y === 'number') ? acct.home_y : null;
      if (initTribeId) {
        // 부족 이름 한 번 더 조회 (캐시 가능)
        try {
          const tr = await central.request('GET', `/tribe/${initTribeId}`);
          if (tr.status === 200 && tr.data?.tribe) initTribeName = tr.data.tribe.name;
        } catch (e) {}
      }
      if (initTribeId) {
        // 부족 이름 한 번 더 조회 (캐시 가능)
        try {
          const tr = await central.request('GET', `/tribe/${initTribeId}`);
          if (tr.status === 200 && tr.data?.tribe) initTribeName = tr.data.tribe.name;
        } catch (e) {}
      }
      // 14.42-a: 우선순위로 spawn 좌표 산정
      //  1) last_zone == THIS && last_x/y 있음 → 그 자리 (재로그인 정상)
      //  2) home_zone == THIS && home_x/y 있음 → home 마을광장 (신규 가입 직후)
      //  3) 외 → 폴백(등록 계정은 zone center · 게스트는 마을광장 — 각자 종전 그대로)
      const p = acct;
      const _fbMain = ZONE.mainSquare || { x: ZONE.zoneWidth / 2, y: ZONE.zoneHeight / 2 };
      if (p.last_zone === ZONE_ID && typeof p.last_x === 'number' && typeof p.last_y === 'number') {
        sx = p.last_x; sy = p.last_y;
      } else if (p.home_zone === ZONE_ID && typeof p.home_x === 'number' && typeof p.home_y === 'number') {
        sx = p.home_x; sy = p.home_y;
      } else if (inUsername && inPassword) {
        sx = ZONE.zoneWidth / 2; sy = ZONE.zoneHeight / 2;
      } else {
        sx = _fbMain.x; sy = _fbMain.y;
      }
      console.log(`[${ZONE_ID}] ${acctLabel}: ${name} (${playerId}) tribe=${initTribeName || '없음'} spawn=(${sx.toFixed(0)},${sy.toFixed(0)})`);
    } else {
      // 1회용 게스트(central 불가) — 종전 그대로 빈 몸·마을광장
      name = inUsername || `여행자${nextPid}`;
      const myMain = ZONE.mainSquare || { x: ZONE.zoneWidth/2, y: ZONE.zoneHeight/2 };
      sx = myMain.x; sy = myMain.y;
      console.log(`[${ZONE_ID}] ${acctLabel}: ${name} (${playerId})`);
    }

    // 같은 player_id로 이 zone 내에 이미 접속 중이면 기존 세션 종료
    for (const [pid, p] of players) {
      if (p.playerId === playerId && p.ws !== ws) {
        console.log(`[${ZONE_ID}] 동일 zone 중복 차단: ${name}`);
        // ★★[2026-08-25 재민 확정 · B-6] **그 몸을 물려받는다.**
        //   왜: `savePlayer` 는 접속·종료·핸드오프·행동 때만 돌고 **주기 저장이 없다**.
        //   그래서 걷기만 한 몇 초는 central 에 없다. 그런데 클라의 `ensurePrimaryConnection` 은
        //   같은 틱에 close→connect 하므로, 새 소켓의 central 읽기가 **옛 소켓의 close 플러시보다 먼저**
        //   도착한다. 그러면 새 세션은 낡은 좌표로 태어나고 그 사이 걸은 거리는 사라진다.
        //   ⇒ 옛 세션이 **아직 메모리에 서 있다면 그게 최신이다.** 저장본을 볼 이유가 없다.
        //   (일관성 원칙: 몸은 순간이동하지도 사라지지도 않는다. 소켓이 바뀔 뿐이다.)
        _takeover = p;
        send(p.ws, { type: 'kicked', reason: 'duplicate_login' });
        const wsToClose = p.ws;
        players.delete(pid);
        broadcast({ type: 'player_left', pid });
        // ★옛 소켓의 close 핸들러가 **낡은 좌표로 덮어쓰지 못하게** 표식을 남긴다
        //   (close 는 비동기라 이 새 세션이 저장한 뒤에 도착할 수 있다).
        p._supersededBy = ws;
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
    // ★★[온보딩 v2 §9.2] **캐릭터는 발생하지 않고 도착한다.** 첫 접속이면 시작 화면에서 고른 마을의
    //   어귀(나루터·길목)에 앉는다. 이어하기(last_x/y·home)면 `arriveFor` 가 null 이라 있던 자리 그대로다.
    const _onbArr = Onboarding.arriveFor(url.searchParams.get('start_vid'), acct, ZONE_ID, playerId);
    if (_onbArr) { sx = _onbArr.x; sy = _onbArr.y; const _g = Onboarding.startGauges(); initHunger = _g.hunger; initThirst = _g.thirst; }
    // Phase 5-G: spawn 좌표를 cell center에 정확히 snap (시각 NE 16px 치우침 fix)
    // cell center = cellTile * 32 + 16. 모든 entity가 cell 격자에 align되어 보임.
    sx = Math.floor(sx / 32) * 32 + 16;
    sy = Math.floor(sy / 32) * 32 + 16;
  }

  // ★[T47 · N.8 수리] `ZONE_TEST_INV` 가 **central 이 살아 있으면 무력화**되던 것.
  //   원인: 이 값은 `inventory` 의 **초기값**으로만 얹혀 있었는데, 계정 행 복원이 그 변수를 통째로
  //   덮어썼다(게스트도 계정 행을 복원하므로 사실상 늘 덮였다). 하네스가 "재료 있음" 경로를
  //   못 밟게 하는 원인이라 고친다 — **하네스 신뢰가 먼저**다(KNOWN_ISSUES N.8).
  //   ⚠**없는 키만** 채운다(idempotent). 접속마다 더하면 긴 하네스에서 인벤이 부풀어 그게 또 거짓말이 된다.
  //   ⚠env 미설정이면 이 루프는 0회다 — 운영 동작 완전 불변.
  for (const k of Object.keys(_testInv)) if (!(k in inventory)) inventory[k] = _testInv[k];

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
    equipment: _loadEquipment,  // 플레이어 아이템: 장비 인스턴스 [{type,q,attrs,dura...}]
    equipSlots: _loadEquipSlots,// 슬롯→인스턴스 id (clothes/armor/weapon/tool)
    craftSkill: _loadCraftSkill,// 제작 숙련 xp {tailoring,smithing,toolmaking,cooking,mining}
    craftLog: _loadCraftLog,    // ★[시설 제작창] 제작 이력(횟수·최고 품질) — §8.4 스킬 패널 대기
    oreLedger: _loadOreLedger,  // ★[11차] 원석 덩이의 숨은 정체(kg — 선광 때 소비)
    oreCarry: _loadOreCarry,    // 선광 소수분 이월(kg)
    fishStats: _loadFishStats,  // ★[낚시 v2] 어획 기록 — 재접속·크래시를 넘어 살아남는다
    kgLedger: _loadKgLedger,    // ★[무게] 개체 실제 kg — 재접속을 넘어 살아남는다(하네스 ⑦)
    lots: _loadLots,            // ★[무게] 식품 취득일 — 나이를 잃으면 로트가 거짓말이 된다
    body: _loadBody ? { cold: 0, fatigue: 0, injury: 0, morale: 0, herbUntil: 0, stages: {}, ..._loadBody } : null,
    // ★[T7] 마지막으로 세계를 본 게임일. **null = 처음 온 사람** — 복귀 브리핑은 안 나간다
    //   (첫 접속에 "0일 만이군" 은 거짓말이고, 첫 인사는 온보딩 몫이다).
    lastSeenDay: _loadLastSeenDay,
    member: _loadMember,        // ★[T11] 마을 소속 — 기여는 온보딩 계량기가, 소속은 여기가 갖는다
    // ★[T47] 존을 넘을 때만 생명값을 잇는다(`initVital` 은 핸드오프에서만 채워진다).
    //   로그아웃 후 재접속의 풀피는 **정책**이라 그대로다 — 죽음 설계(T8) 소관.
    hp: (initVital && typeof initVital.hp === 'number') ? initVital.hp : PLAYER_MAX_HP,
    maxHp: (initVital && typeof initVital.maxHp === 'number') ? initVital.maxHp : PLAYER_MAX_HP,
    isDown: !!(initVital && initVital.isDown),
    downedAt: (initVital && initVital.downedAt) || 0,
    hunger: initHunger, thirst: initThirst, vp: initVp,
    // ★★[2026-08-03g 배치 14 ②] **이 신원이 영속인가.** `savePlayer` 가 이걸 본다.
    //   종전 판정은 `playerId.startsWith('anon_')` 하나였는데, 배치 13 뒤로 `anon_` 은 두 종류다:
    //     · central 이 발급한 **영속 게스트**(토큰 있음) — 저장해야 한다(이번 배치의 ②)
    //     · central 불가 시의 **1회용 폴백** — 저장할 대상이 아니다(다음 접속에 다른 사람이 된다)
    //   접두사로는 둘을 못 가른다 ⇒ 접속 때 정해진 이 불리언이 유일한 정답이다.
    persistent: _persistentIdentity,
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
  // ★★[2026-08-25 재민 확정 · B-6] 살아 있던 몸을 그대로 이어받는다.
  //   **몸의 상태만** 가져온다 — 신원·사회 정보(playerId·tribe·home)는 central 이 정본이다.
  //   여기서 가져오지 않으면 그 값들은 "마지막 저장" 시점으로 되돌아간다.
  if (_takeover) {
    player.x = _takeover.x; player.y = _takeover.y;
    player.floor = _takeover.floor || 0;
    player.inventory = _takeover.inventory || player.inventory;
    player.toolItems = _takeover.toolItems || player.toolItems;
    player.equipped = _takeover.equipped !== undefined ? _takeover.equipped : player.equipped;
    player.hotkey1 = _takeover.hotkey1 !== undefined ? _takeover.hotkey1 : player.hotkey1;
    player.equipment = _takeover.equipment || player.equipment;
    player.equipSlots = _takeover.equipSlots || player.equipSlots;
    player.craftSkill = _takeover.craftSkill || player.craftSkill;
    player.oreLedger = _takeover.oreLedger || player.oreLedger;
    player.oreCarry = _takeover.oreCarry !== undefined ? _takeover.oreCarry : player.oreCarry;
    player.kgLedger = _takeover.kgLedger || player.kgLedger;   // ★[무게] 들고 있던 개체 그대로
    player.lots = _takeover.lots || player.lots;               // ★[무게] 식품 나이 그대로
    // ★★[T7 2026-09-01] **부재 기준일도 몸을 따라온다.** 안 그러면 클라가 입장 직후 한 번
    //   재접속할 때(`ensurePrimaryConnection` 의 close→connect) 이 값이 **저장본**에서 다시 읽히는데,
    //   그 저장본은 **방금 그 첫 접속이 오늘 날짜로 덮어쓴 것**이다 ⇒ 부재가 통째로 사라진다.
    //   `e2e-rumor` 가 실측으로 잡았다: 26일을 비웠는데 촌장이 "5일 만이군" 이라고 했다.
    //   (몸이 살아 있으면 그 몸이 진실 — B-6 규약을 이 축에도 그대로 적용한다.)
    //   ⚠**덮어쓰기가 아니라 보강이다.** 살아 있던 몸이 그 값을 아직 가진 적이 없을 수도 있다
    //     (처음 온 사람은 null 이다) — 그때는 **저장본에서 읽은 값이 진실**이다.
    //     무조건 대입하면 그 사람의 부재가 통째로 사라진다(1차 수리가 그렇게 뒤집혔다).
    if (Number.isFinite(_takeover.lastSeenDay)) player.lastSeenDay = _takeover.lastSeenDay;
    if (_takeover.member) player.member = _takeover.member;   // ★[T11] 살아 있던 몸의 소속이 진실이다(보강 — 덮어쓰기 아님)
    if (_takeover._returnBriefDone) player._returnBriefDone = true;
    if (typeof _takeover.hp === 'number') player.hp = _takeover.hp;
    if (typeof _takeover.hunger === 'number') player.hunger = _takeover.hunger;
    if (typeof _takeover.thirst === 'number') player.thirst = _takeover.thirst;
    if (typeof _takeover.vp === 'number') player.vp = _takeover.vp;
    if (_takeover.isDown) { player.isDown = true; player.downedAt = _takeover.downedAt; }
    sx = player.x; sy = player.y;   // 아래 저장·로그·welcome 이 같은 값을 봐야 한다
    console.log(`[${ZONE_ID}] ↻ 몸 승계: ${name} (${playerId}) @ (${sx.toFixed(0)}, ${sy.toFixed(0)}) — 저장본 대신 살아 있던 몸`);
  }
  C.stage = 'spawn'; _connFailPoint('spawn');
  players.set(pid, player);
  C.pid = pid;   // ★뒤에서 던지면 이 반쪽 등록을 치워야 한다(안 치우면 유령 몸이 남는다)
  // ★★[T45 2026-09-02] **돌아오면 맡겨 둔 땅이 돌아온다.** `held` 는 전량, `pref` 는 아직 아무도
  //   안 가져간 것만 — 가져간 셀은 이미 주인이 바뀌어 이 순회에 안 잡히므로 **구조적으로 저절로** 그렇다.
  //   여기 두는 이유: 부재 배치는 30분에 한 번 도는데, 사람은 접속한 그 순간 자기 땅을 본다.
  try { const _rc = Claims.onPlayerActive(player); if (_rc) console.log(`[${ZONE_ID}] 🏠 ${name} 복귀 — 맡겨 둔 사유지 ${_rc}칸 반환`); } catch (e) {}

  // 활성 청크 즉시 갱신 — 이 player 주변 청크의 시드 자원 spawn → welcome.resources에 포함됨
  updateActiveChunks();

  // central에 위치 업데이트 (게스트 제외)
  savePlayer(player, { last_zone: ZONE_ID, last_x: sx, last_y: sy });

  console.log(`[${ZONE_ID}] + ${name} (${pid}) @ (${sx.toFixed(0)}, ${sy.toFixed(0)})  total=${players.size}`);

  // 환영 메시지 — 존 정보와 현재 상태 모두 전달
  C.stage = 'welcome'; _connFailPoint('welcome');
  { const _h = _connHangPoint('welcome'); if (_h) await _h; }
  send(ws, {
    type: 'welcome',
    pid,
    // ★★[2026-08-03f 배치 13] **내가 누구인지 클라가 알아야 한다.**
    //   종전 welcome 은 세션 손잡이(`pid` = p1·p2…)만 줬고 영속 신원(`playerId`)은 안 줬다.
    //   그래서 클라의 소유 표시(사유지 목록 등)는 `myUsername`(로그인 입력값)과 대조하고 있었고,
    //   게스트는 그게 빈 문자열이라 **제 사유지도 남의 것으로 보였다.**
    //   등록 계정은 `player_id === username` 이라 우연히 맞았을 뿐이다.
    playerId: player.playerId,
    // ★게스트 영속 신원 토큰 — 게스트 접속에만 실린다(등록 계정·핸드오프는 null).
    //   클라는 이걸 localStorage 에 넣고 다음 접속에 제시한다. **화면에 절대 그리지 않는다.**
    //   매 접속 같은 값을 돌려준다(자가 치유 — 클라 저장이 어긋나도 다음 접속에 맞춰진다).
    guestToken: _guestTokenForWelcome || null,
    // ★[2026-08-03g 배치 14 ①] 이번 접속에서 게스트 → 등록 계정 **승계**가 일어났나.
    //   클라가 이걸 보고 죽은 토큰을 localStorage 에서 지운다(서버는 이미 NULL 로 만들었다).
    promoted: _promoted || false,
    zone: zonePublicMeta(),
    hardcodedTerrain: getHardcodedTerrainForZone(),
    resources: Array.from(resources.values()),
    claims: Array.from(claims.values()),
    simVillages: SimVillages.clientVillages(), // §4-4 Stage 4A: 마을 영토(경계 셀)·이름·인구 — 1회
    calendar: calendarNow(),                   // ★[달력 2026-08-30] 연·계절·일 — econ 정본에서 유도
    weather: weatherNow(),                     // ★[온도 곡선 2026-08-31] 바깥 날씨 — 입장 즉시 배지
      granStocks: SimVillages.granStocks(),      // ★곳간② 물리 재고 스냅샷(이후 gran_stock 델타) — 사다리 앞 짐더미 연출
      markets: SimVillages.marketVillages(),     // ★[10차 T4] 장마당 스냅샷 flat[ccx,ccy,…](이후 markets 방송) — 캐러밴 체류 중인 마을만
    banditCamps: Bandits.clientCamps(), // §11 도적: 소굴·야영 마커 1종 — 이후 bandit_camps가 변경분 방송
    roads: Roads.clientRoads(), // §16 답압 길: 등급 셀 flat [cx,cy,lv,...] — 이후 road_cells가 변경분 방송
    soil: Soil.clientSoil(),    // [배치 20 B] 타일 상태: 기준선에서 벗어난 셀 flat [cx,cy,qv,geo,ore,...] — 이후 tile_state가 변경분 방송
    bridges: (ZONE.bridges || null), // ★[다리 층] 통나무 널다리 셀 flat [cx,cy,...] — 정적(맵 사물)이라 welcome 1회
    ditches: ditchPayload(),         // ★[11차 T3 환호] 도랑 셀 flat [cx,cy,...] — 마을 소유 사물(부팅 후 불변)이라 welcome 1회
    buildings: activeChunkBuildings(),
    rooms: Rooms.allRooms().map(Rooms.wireRoom),   // ★[배치 18 ①] 방은 서버가 판정한다 — 클라는 받아 쓰기만(사본 방지)
    groundItems: Array.from(groundItems.values()), // Phase 14.23
    mobs: Array.from(mobs.values()).map(m => ({ mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, tameOwner: m.tameOwner || null, tameOwnerName: m.tameOwnerName || null })),
    inventory: invPayload(player.inventory),
    toolItems: player.toolItems || [], hotkey1: player.hotkey1 || null, equipped: player.equipped || null,
    equipment: player.equipment || [], craftSkill: player.craftSkill || {}, // 플레이어 아이템 인스턴스·숙련
    tools: player.tools, // 옛 호환 (사용 X)
    recipes: RECIPES,
    itemRecipes: ITEM_RECIPES,         // 14.50
    equipmentRecipes: EQUIPMENT_RECIPES, // 플레이어 장비 제작 레시피(유형·재료·숙련 분야)
    equipmentMeta: EQUIPMENT_META,       // 미리보기 계산용(재료등급·품질/내구 폭 — 서버와 동일 공식)
    buildingRecipes: BUILDING_RECIPES, // 14.51
    cookRecipes: COOK_RECIPES,
    foodEffects: FOOD_EFFECTS,
    // ★★[T55 2026-09-02] **이름표 정본을 한 번 싣는다** — 이 카드의 유일한 zone.js 접점(1줄)이다.
    //   이 표는 런타임에 넷이 합쳐 만든다(리터럴 + tidal.install + Spoil.PRESERVED_ITEMS + Crops.labelMap)
    //   ⇒ 클라가 다시 만들 방법이 없다. 안 실으면 클라 사본(55키)이 정본(108키)에 영원히 뒤처지고,
    //     그게 `oyster`·`seaweed`·`abalone`·`brine` 이 화면에 영문으로 뜬 이유였다(회부 0-갯·0-염·T38).
    //   품목 카탈로그는 존 독립이라 **첫 primary welcome 한 번이면 족하다**(클라가 들고 다닌다).
    itemLabels: ItemLabel.itemLabels(ITEM_LABEL_SERVER, BUILDING_RECIPES),
    // ★★[T61 2026-09-03] econ 자원 종류 이름(장마당 시세표의 **열 이름**) — 정본은 `itemlabel.js`.
    //   종전엔 클라(`60-t-market.js ITEM_KR` 9키)가 표를 들고 있었다. 그게 사본이고, T55 가 품목에서
    //   닫은 것과 **같은 결함**이다(서버가 종류를 늘리면 화면만 영문으로 남는다).
    categoryLabels: ItemLabel.CATEGORY_KO,
    // ★★[T66 ⓪ 2026-09-03] **이 카드의 유일한 서버 줄.** 클라에 남아 있던 사본 둘을 닫는다:
    //   `60-t-market.js JOB_KR`(zone 의 `JOB_KR_NPC` 와 글자까지 같았다) · `43-i-icon.js SEASON_KO`
    //   (`events.KO_SEASON` 이 정본 — 달력이 이미 **현재** 계절만 보내서, 작물 파종철 표기가 사본을 탔다).
    //   ⇒ 표 둘을 한 칸에 실어 보낸다. 클라엔 이제 이름 표가 하나도 없다(T61 이 품목·종류를 닫은 그 규약).
    uiLabels: { jobs: JOB_KR_NPC, seasons: require('./events').KO_SEASON },
    // ★★[무게 배치 2026-08-27] kg 카탈로그를 **서버가 실어 보낸다** — 클라가 표를 들고 있으면
    //   그게 사본이고, 표가 갈리는 날 화면과 실제가 어긋난다(거래소 배치에서 배운 그것).
    itemWeights: Weights.catalog(),
    // ★★[작물 층 2026-08-31] 작물 34종 — **클라가 표를 안 든다**(무게·원장과 같은 규약).
    //   이름·이모지·파종철·성장일·보관일·물요구가 전부 서버 정본에서 온다.
    crops: Crops.payload(),
    // ★★[T12 지게 2026-09-01] `capKg` 를 뺐다. §0 실측: 이 값을 클라가 **받아서 변수에 담고 아무 데도 안 썼다**
    //   (표시는 전부 `gauges.carry.cap` = `Carry.payload()` = `capKg(player)` 에서 온다 — 이미 서버 값이었다).
    //   그런데 이 배치로 상한이 **플레이어별로 갈렸다** ⇒ 남겨 두면 언젠가 누가 이 죽은 사본을 읽고
    //   지게를 진 사람에게 25 를 보여 준다. 안 쓰는 사본은 **지금** 지운다(족보 (84) 의 실천).
    carryCfg: { moveFloor: Carry.CFG.MOVE_FLOOR,
                combinedFloor: Carry.CFG.COMBINED_FLOOR, stageAt: Carry.STAGE_AT },
    // ★★[원장 승격 2026-08-30] 개체 원장·식품 로트 — 인벤 스칼라와 **같은 스냅샷**으로 나간다.
    //   클라는 "원장이 있으면 펼친다"만 안다(품목 표를 클라가 들면 그게 사본이다).
    ledger: Carry.viewLedger(player, player.inventory),
    lots: Lots.viewAll(player, player.inventory, zoneGameDay()),
    // ★[정비 배치] 클라 손잡이 — 서버 env 가 정본이다(클라 상수 금지 · `carryCfg` 와 같은 규약).
    uiCfg: {
      vignetteTint: process.env.VIGNETTE_AXIS_TINT !== '0',
      moodleShowMax: (Body.CFG && Body.CFG.SHOW_MAX) || 3,
      ghostStallMs: parseInt(process.env.GHOST_STALL_MS || '5000', 10) || 5000,          // 딱지·예측 정지
      ghostReconnectMs: parseInt(process.env.GHOST_RECONNECT_MS || '10000', 10) || 10000, // 소켓 강제 끊기
      // ★[캐릭 시트 2026-08-30] 플래그 기본 OFF — 종전 도형 렌더가 기본이다(병행 안전).
      //   기본 전환은 재민 실기 뒤 튜닝 배치. 문턱도 env 정본(클라 상수 금지).
      charSprite: process.env.CHAR_SPRITE === 'on',
      charWalkMin: parseFloat(process.env.CHAR_WALK_MIN || '') || 4,
      charRunMin: parseFloat(process.env.CHAR_RUN_MIN || '') || 102,
    },
    // ★★[이동 모델 2026-08-30] 손잡이 표를 **서버가 실어 보낸다** — 클라가 표를 들고 있으면
    //   그게 사본이고, env 를 서버에서만 바꾼 날 예측과 권위가 갈린다(itemWeights·uiCfg 와 같은 규약).
    moveCfg: MOVE_PARAMS,
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
  // ★★[T43 2026-09-02 · §12] **쓰러진 채 들어오면 쓰러진 화면이 뜬다.**
  //   `vitals:true` 로 몸은 이어졌는데(`isDown` · HP 0) `player_downed` 는 **피해 순간에만** 나가서,
  //   다시 들어온 사람은 "못 움직이는데 화면은 멀쩡한" 상태가 됐다 — 배치 5 가 배운 그 층
  //   ("계약도 역학도 맞는데 화면에 도달하지 못한다")이 여기서 또 났다.
  //   ⇒ 새 메시지를 만들지 않고 **같은 메시지를 welcome 뒤에 한 번 더** 보낸다(옵션은 지금 자리 기준).
  //   ★창(`downedAt`)은 손대지 않는다 — 로그아웃으로 시간을 되돌릴 수 없다는 것이 §12 의 요점이다.
  if (player.isDown) {
    send(ws, { type: 'player_downed', pid: player.pid, rescueWindowMs: RESCUE_WINDOW_MS,
      options: listRespawnOptions(player), source: 'relogin' });
    broadcast({ type: 'player_down_state', pid: player.pid, isDown: true });
  }

  // ws에 player input/close 핸들러 attach
  C.stage = 'handlers';
  attachPlayerHandlers(ws, player);
  ws.__ready = true;          // ★조기 ping 응답은 여기서 손을 뗀다(진짜 핸들러가 맡는다)
  C.stage = 'ready';
  if (C.done) C.done();       // ★[T42-b] 여기서부터는 `players` 가 이 사람을 안다 — 세는 일을 놓는다
}

// ★★[T1 §2-② 2026-09-01] **"장부 마감 중"** — 일틱 조각내기(villages.js)의 짝.
//   일틱이 여러 프레임에 걸쳐 도는 동안 마을 장부는 반쯤 넘어간 상태다. 그 창(실측 3초 남짓)에
//   들어온 **마을 장부 요청만** 모았다가 마감 직후 같은 순서로 흘린다 — 버리지 않는다.
//   ⇒ 플레이어가 보는 마을은 조각내기 전과 똑같이 **하루가 한 순간에 넘어간 세계**다.
//   ⚠이동·전투·채집·제작·낚시는 **안 걸린다**. 특히 낚시 챔질은 서버 시각 판정이라 미루면 그 판정이
//     망가지고, 어장 결손(`land.fishSustain`)은 econ 이 원자 조각 안에서만 읽으므로 미룰 이유도 없다.
const VILLAGE_BOOK_MSG = new Set([
  'village_inventory', 'village_deposit', 'village_brief', 'village_board', 'village_deliver',
  'village_trade', 'village_trade_exec', 'village_trade_quote', 'village_withdraw',   // ★[T11] 인출도 마을 장부다
  'village_welcome',   // ★[T19] 이방인 받기 스위치도 마을 장부다
  'sell_relic', 'shop_info', 'craft_buy', 'craft_sell',
  'village_start', 'village_advance', 'request_village_house',
]);

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

  // ★[T1 §2-②] 마을이 장부를 마감하는 중이면 마을 요청만 줄을 세운다(위 주석).
  if (VILLAGE_BOOK_MSG.has(msg.type) && SimVillages.villagesBusy && SimVillages.villagesBusy()
      && SimVillages.villageWait(() => { try { handlePlayerInput(player, raw); } catch (e) {} })) {
    if (ws && ws.readyState === 1) send(ws, { type: 'notice', text: '🏘️ 마을이 하루 장부를 마감하는 중이다 — 곧 처리된다' });
    return;
  }

  if (msg.type === 'input') {
    // Phase 14.41: 다운(사망) 중이면 입력 무시
    if (player.isDown) { player.vx = 0; player.vy = 0; if (player.inputQueue) player.inputQueue.length = 0; return; }
    // 리컨실리에이션: 입력을 즉시 적용하지 않고 큐에 버퍼 → tick이 '받은 순서대로 1개씩' 적용(applyQueuedInput).
    //   즉시-적용은 '틱당 최신 것'이 되어 클라 고정스텝 순서와 어긋나 매 틱 보정→떨림. 큐로 순서·타이밍 일치 → 보정 0.
    if (!player.inputQueue) player.inputQueue = [];
    // NaN 가드: 변조/누락 패킷의 vx/vy가 NaN이면 clamp(NaN)=NaN → p.x += NaN → 좌표 영구 오염.
    //   Number(...)||0 으로 비유한수는 0(정지)으로 안전 강등.
    player.inputQueue.push({
      seq: (typeof msg.seq === 'number') ? msg.seq : 0,
      vx: clamp(Number(msg.vx) || 0, -1, 1), vy: clamp(Number(msg.vy) || 0, -1, 1), sprint: !!msg.sprint,
      // ★[조준 모드 2026-08-30] 조준 중엔 이속이 `MOVE_AIM_SPEED_FRAC` 로 준다.
      //   이 플래그가 **입력에 실려야** 서버 권위와 클라 예측이 같은 속도를 낸다(안 실으면 매 틱 보정).
      aim: !!msg.aim,
    });
    if (player.inputQueue.length > 120) player.inputQueue.shift(); // 4초 안전상한. GC로 밀린 버스트도 드롭 안 함(구동 루프가 틱당 8개 흡수)
    player.lastSeen = Date.now();
  } else if (msg.type === 'respawn_choice') {
    // Phase 14.41: 사망 후 부활 위치 선택 (personal | temporary)
    tryRespawnChoice(player, msg.kind);
  } else if (msg.type === 'rescue_request') {
    // Phase 14.41: 같은 길드원이 다운된 동료를 R 키로 구조
    tryRescue(player, msg.pid);
  } else if (msg.type === 'butcher') butcherCorpse(player, msg.cid);  // Phase 5-7
  else if (msg.type === 'gather') tryGather(player);
  else if (msg.type === 'sort_ore') trySortOre(player);   // ★선광 — 캔 원석 덩이를 광석/맥석으로 가른다
  else if (msg.type === 'claim') tryClaim(player, msg.kind || 'personal');
  // ★[원장 승격 2026-08-30] 지목 드롭/줍기 — `ids`(개체 원장 id) · `lotDay`(로트 취득일) · `giIds`(바닥 여러 덩이).
  //   옛 인자(`item`+`amount`, `giId`)는 그대로 산다 — 하네스·옛 클라가 안 깨진다.
  else if (msg.type === 'drop_item') tryDropItem(player, msg.item, msg.amount || 1, { ids: msg.ids, lotDay: msg.lotDay, toolId: msg.toolId });
  else if (msg.type === 'pickup_item') {
    if (Array.isArray(msg.giIds)) for (const g of msg.giIds.slice(0, 64)) tryPickupItem(player, g);
    else tryPickupItem(player, msg.giId);
  }
  else if (msg.type === 'repair_building') tryRepairBuilding(player);
  else if (msg.type === 'unclaim') tryUnclaim(player, msg.claimId);
  // ★★[재민 확정 2026-08-27] `trade_offer`(T/Y) **제거됨**. 왜 지웠는지는 아래 함수 자리의 주석 참조.
  else if (msg.type === 'ping') { player.lastSeen = Date.now(); send(ws, { type: 'pong', t: msg.t }); }
  else if (msg.type === 'war_command_join') {
    // §4-4 P4: 플레이어 전투 지휘 참가 요청(client.js 송신). warId=null → 지휘 해제.
    //   근접 검증 = 활동 중 전쟁 병사(SimVillages.warThreats, 존-로컬 px) 반경 안인지(WAR_CMD_R=320px≈10셀).
    //   ★[인계] 진영 소속 검증 + 실제 커맨더 바인딩(그 player vx/vy → battle-core 지휘관)은 villages.js/war-live
    //     (P3 무수정)에 훅 필요 → 여기선 의사표시 기록(player._warCmdBind)+ack만. villages._warSyncBattleMirror 가
    //     "이 pid=커맨더면 player.vx/vy로 g.cmd 구동"을 소비하도록 확장하면 완결(현재 dormant).
    player.lastSeen = Date.now();
    const warId = (msg.warId == null) ? null : String(msg.warId);
    if (warId == null) { player._warCmdBind = null; send(ws, { type: 'war_command_ack', warId: null, ok: true }); return; }
    let near = false;
    try {
      const th = SimVillages.warThreats();
      if (th) { const R2 = 320 * 320; for (const t of th) { const dx = t.x - player.x, dy = t.y - player.y; if (dx * dx + dy * dy <= R2) { near = true; break; } } }
    } catch (_) {}
    if (!near) { send(ws, { type: 'war_command_ack', warId, ok: false, reason: '전장에서 너무 멉니다' }); return; }
    player._warCmdBind = warId;
    console.log(`[${ZONE_ID}] 🎖️ war_command_join ${player.name} → ${warId} (근접 채택·바인딩 훅 대기)`);
    send(ws, { type: 'war_command_ack', warId, ok: true });
  }
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
    // ★[T11] 마을 소속 명령 — `/소속` `/탈퇴` `/추방 <이름>` `/인출 [수량] [재화]`.
    //   **새 클라 조건 0**: 채팅은 이미 있다. 명령은 말이 아니므로 방송하지 않는다.
    if (Membership.handleChat(player, text)) return;
    if (Newcomers.handleChat(player, text)) return;   // ★[T19] `/이방인` — 새 클라 조건 0
    // ★[T56] 구조 동사 둘 — `/먹이기 <음식>` `/물`. 채팅은 이미 있다(클라 무접촉 · T11 선례).
    if (Rescue.handleChat(player, text)) return;
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
  else if (msg.type === 'build_guild_granary') tryBuildGuildGranary(player, +msg.atX, +msg.atY);   // ★길드 곳간 실물화[사용자 확정 — 커서 배치]
  else if (msg.type === 'request_village_house') tryRequestVillageHouse(player, +msg.atX, +msg.atY);   // ★[11차 T4] 마을 크루에게 집 짓기 의뢰(재료 선납)
  else if (msg.type === 'hut_start') tryHutStart(player, +msg.atX, +msg.atY);   // ★움집 고증 건축 ①굴착(커서 배치)
  else if (msg.type === 'hut_advance') tryHutAdvance(player, msg.buildingId);   // ★움집 고증 건축 ②~④
  else if (msg.type === 'furnace_start') tryFurnaceStart(player, +msg.atX, +msg.atY, msg.kind);     // ★노 건설 ①(사유지 필수 — 재민 확정) · kind=도가니로/괴련로(시대 게이트)
  else if (msg.type === 'furnace_advance') tryFurnaceAdvance(player, msg.buildingId);      // ★노 건설 ②③·완공
  else if (msg.type === 'furnace_smelt') tryFurnaceSmelt(player, msg.buildingId);          // ★노 조업(철 정광+숯 → era.js 물리)
  else if (msg.type === 'kiln_start') tryKilnStart(player, +msg.atX, +msg.atY);            // ★숯가마 건설 ①(노와 같은 계약)
  else if (msg.type === 'kiln_advance') tryKilnAdvance(player, msg.buildingId);            // ★숯가마 건설 ②·완공
  else if (msg.type === 'village_start') tryVillageStart(player, +msg.atX, +msg.atY);      // ★[배치 12] 마을 회관 착공 — 완공이 곧 마을 등록
  else if (msg.type === 'village_advance') tryVillageAdvance(player, msg.buildingId);      // ★[배치 12] 회관 ②③·완공
  else if (msg.type === 'village_inventory') tryVillageInventory(player, msg.buildingId);  // ★[배치 12 ③] 회관 클릭 = 마을 재고 열람(권한 게이트)
  else if (msg.type === 'village_welcome') tryVillageWelcome(player, msg.buildingId, !!msg.on);   // ★[T19] 이방인 받기 스위치
  else if (msg.type === 'village_deposit') tryVillageDeposit(player, msg.buildingId, msg.want);   // ★[배치 12 ②] 곳간에 넣기 — 식량이 사람을 부른다
  // ★★[2026-08-25 사건 레이어] 촌장 브리핑 · 게시판 · 납품. 셋 다 **자기 마을 것만** 준다(소식의 물리 전파).
  else if (msg.type === 'village_brief') tryVillageBrief(player, msg.vid);
  else if (msg.type === 'village_board') tryVillageBoard(player, msg.vid);
  else if (msg.type === 'village_chronicle') tryVillageChronicle(player, msg.vid, msg.year);   // ★[T18] 연대기
  else if (msg.type === 'village_deliver') tryVillageDeliver(player, msg.vid, msg.item, msg.want);
  else if (msg.type === 'village_withdraw') tryVillageWithdraw(player, msg.vid, msg.res, msg.qty);   // ★[T11] 곳간 인출(소속만)
  else if (msg.type === 'onboarding_state' || msg.type === 'onboarding_greet' || msg.type === 'onboarding_day') Onboarding.handleMsg(player, msg);   // ★[온보딩 v2] 대본 상태·촌장 첫 마디·하루 정산
  else if (msg.type === 'village_trade') tryVillageTrade(player, msg.vid);                                   // ★[거래소] 시세표
  else if (msg.type === 'village_trade_exec') tryVillageTradeExec(player, msg.vid, msg.give, msg.take, msg.qty);  // ★[거래소] 교환
  else if (msg.type === 'village_trade_quote') {                                                            // ★[거래소] 견적(확정 전 표시)
    if (SimVillages.villageTradeQuote) {
      const q = SimVillages.villageTradeQuote(msg.vid | 0, player.x, player.y, msg.give, msg.take, msg.qty, _unitsOfFor(player));
      send(player.ws, { type: 'village_trade_quote', quote: q, vid: msg.vid | 0 });
    }
  }
  // ★★[테스트 전용 · 기본 OFF] E2E 하네스가 재료를 채운다. `E2E_GIVE=1` 일 때만 **분기 자체가 존재**한다 —
  //   기본 부팅에서는 이 메시지가 아무 일도 안 한다(라이브에 새 능력이 생기지 않는다).
  //   왜 필요한가: 건립 사슬(돌·통나무·곡괭이 → 사유지 → 3단계)을 실클라에서 처음부터 캐게 하면
  //   검사 대상(건립·재고 UI)이 아니라 채집 사슬의 흔들림을 재게 된다. `VILLAGE_DAY_MS` 와 같은 결의 손잡이다.
  // ★[신체 상태] 테스트 픽스처 — 몸 상태를 **직접 세운다**. `E2E_GIVE` 게이트라 기본 부팅에선 도달 불가.
  //   ⚠이 픽스처는 **저장을 부르지 않는다**(오프라인 불변 검사를 오염시키지 않게 — 족보 ㊻).
  else if (E2E_GIVE && msg.type === '__e2e_body') {
    const b = Body.ensure(player);
    if (typeof msg.hunger === 'number') player.hunger = Math.max(0, Math.min(100, msg.hunger));
    if (typeof msg.thirst === 'number') player.thirst = Math.max(0, Math.min(100, msg.thirst));
    // ★[T47] hp 도 세운다 — 존을 넘을 때 생명값이 이어지는지 **재려면** 깎아 놓을 수 있어야 한다.
    //   (코드로만 확인하고 "넘어간다"고 적는 것이 N.6 을 만든 방식이다.)
    if (typeof msg.hp === 'number') { player.hp = Math.max(1, Math.min(player.maxHp || 100, msg.hp)); broadcast({ type: 'player_damaged', pid: player.pid, hp: player.hp }); }
    for (const k of ['cold', 'fatigue', 'injury', 'morale']) {
      if (typeof msg[k] === 'number') b[k] = Math.max(0, Math.min(1, msg[k]));
    }
    send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst),
      vp: Math.round(player.vp || 0), cold: !!player._cold, body: Body.selfPayload(player) });
    // ★[T11] 소속도 세울 수 있게 한다 — `test-handoff-body` 가 **존을 넘어 소속이 사는지**를 재려면
    //   앉혀 놓을 수 있어야 한다(그 하네스는 `ENABLE_VILLAGES=0` 이라 정상 경로로는 못 얻는다).
    //   ⚠검사 전용이다: 판정(문턱·직교·한도)은 여기서 안 밟는다 — 그건 `test-membership` 이 잰다.
    if (msg.member !== undefined) player.member = msg.member || null;
    if (msg.quiet !== true) send(player.ws, { type: 'notice', text: `🧪 몸 상태 세움 — ${JSON.stringify(Body.toSave(player))}` });
  }
  else if (E2E_GIVE && msg.type === '__e2e_clock') {
    // ★테스트 전용 — 몸·날씨가 보는 날짜/밤을 세운다. null 을 주면 원래 시계로 돌아간다.
    _e2eClock = (msg.day == null && msg.night == null) ? null
      : { day: Number.isFinite(msg.day) ? (msg.day | 0) : (_e2eClock && _e2eClock.day),
          night: (typeof msg.night === 'boolean') ? msg.night : (_e2eClock && _e2eClock.night) };
    _wxHint = { at: 0, v: null };   // 힌트 캐시를 즉시 무효화(1초 기다리게 하지 않는다)
    for (const q of players.values()) q._shelter = null;
    send(player.ws, { type: 'notice', text: `🧪 시계 세움 — ${JSON.stringify(_e2eClock)} · ${JSON.stringify(weatherNow())}` });
  }
  else if (E2E_GIVE && msg.type === '__e2e_day_freeze') {
    // ★테스트 전용(E2E_GIVE=1 일 때만 분기 존재) — 상호작용을 재는 동안 게임일을 얼린다.
    // ★★[2026-08-31] **플레이어 시계도 같이 얼린다** — 마을 날만 얼리던 게 반쪽이었다(위 주석).
    const z = __e2eFreezeZoneDay(!!msg.on);
    const r = SimVillages.__e2eDayFreeze ? SimVillages.__e2eDayFreeze(!!msg.on) : { err: '미지원' };
    if (r && r.ok) r.zoneDay = z.day;
    send(player.ws, { type: 'notice', text: r.ok ? `🧊 게임일 ${r.frozen ? '정지' : '재개'} (day ${r.day})` : `🧊 ${r.err}` });
  }
  else if (E2E_GIVE && msg.type === '__e2e_village_short') {
    // ★테스트 전용(E2E_GIVE=1 일 때만 분기 존재) — 게시판 납품 흐름을 실화면으로 재기 위한 부족 픽스처.
    const r = SimVillages.__e2eForceShortage ? SimVillages.__e2eForceShortage(msg.vid | 0) : { err: '미지원' };
    send(player.ws, { type: 'notice', text: r.ok ? `🧪 ${r.name} ${r.item} ${r.before}→${r.after} (문턱 ${r.thr} · 갚을거 ${r.payWith} ${r.payStock})` : `🧪 ${r.err}` });
  }
  else if (E2E_GIVE && msg.type === '__e2e_village_deed') {
    // ★[T50] 테스트 전용 — 세계의 "일" 픽스처(econ `_weather` 를 세운다 · 사건은 장부가 스스로 낸다)
    const r = SimVillages.__e2eForceDeed ? SimVillages.__e2eForceDeed(msg.vid | 0, msg.kind) : { err: '미지원' };
    send(player.ws, { type: 'notice', text: r.ok ? `🧪 ${r.name} ${r.kind} (D${r.day}~${r.until})` : `🧪 ${r.err}` });
  }
  else if (E2E_GIVE && msg.type === '__e2e_give') {
    for (const [k, q] of Object.entries(msg.items || {})) { const n = Number(q); if (isFinite(n) && n > 0) player.inventory[k] = (player.inventory[k] || 0) + Math.floor(n); }
    // 도구는 인벤 수량이 아니라 **인스턴스**다(`toolItems` = {id, type, d}) — 정본 생성 경로와 같은 모양으로 만든다
    for (const t of (msg.tools || [])) {
      if (!player.toolItems) player.toolItems = [];
      const mx = TOOL_MAX_DURABILITY[t] || 100;
      player.toolItems.push({ id: genToolId(), type: t, d: mx, max: mx });
    }
    // ★[원장 승격 2026-08-30] 개체 kg 지급 — `{ fish: [2.0, 0.4, 1.1] }`.
    //   **정본 함수 `Carry.noteInstance` 를 그대로 부른다**(낚시가 부르는 그것) —
    //   하네스가 원장을 손으로 빚으면 그게 사본이고, 승격이 진짜 되는지 못 잰다.
    for (const [k, arr] of Object.entries(msg.kgs || {})) {
      if (!Array.isArray(arr)) continue;
      for (const kg of arr) {
        if (!(Number(kg) > 0)) continue;
        player.inventory[k] = (player.inventory[k] || 0) + 1;
        Carry.noteInstance(player, k, Number(kg), zoneGameDay());
        Lots.note(player, k, 1, zoneGameDay());
      }
    }
    // ★로트 지급 — `{ berry: [[나이(일), 개수], …] }`. 나이 다른 몫이 있어야 펼침을 잰다.
    //   ★**나이**로 받는다(절대 게임일 아님) — 하네스가 서버 시계를 알 필요가 없어야 결정론이 산다.
    for (const [k, arr] of Object.entries(msg.lots || {})) {
      if (!Array.isArray(arr)) continue;
      for (const [age, n] of arr) {
        if (!(Number(n) > 0)) continue;
        player.inventory[k] = (player.inventory[k] || 0) + Math.floor(n);
        Lots.note(player, k, Math.floor(n), Math.max(0, zoneGameDay() - (age | 0)));
      }
    }
    // ★[T12 지게 2026-09-01] 장비 지급·착용 — `{ equip: [{ type:'carrier', lvl:10 }] }`.
    //   **정본 경로 둘을 그대로** 부른다(`PlayerItems.craftItem` + `doEquipItem`) —
    //   하네스가 슬롯을 손으로 꽂으면 "착용이 상한을 올리는가"를 못 잰다(그건 자기 증명이다).
    for (const e of (msg.equip || [])) {
      const t = e && e.type; const r = EQUIPMENT_RECIPES[t]; if (!r) continue;
      ensurePlayerItems(player);
      let inst; try { inst = PlayerItems.craftItem(t, Math.max(0, Math.min(10, e.lvl | 0)), { [(e.material || r.accepts[0])]: r.qty }); } catch (er) { continue; }
      inst.id = genEquipId(); inst.mat = e.material || r.accepts[0];
      player.equipment.push(inst);
      if (e.wear !== false) doEquipItem(player, inst.id);
    }
    savePlayer(player);
    sendInventory(player);
    sendEquipment(player);
    send(player.ws, { type: 'tools', toolItems: player.toolItems || [], equipped: player.equipped, hotkey1: player.hotkey1 || null });
    send(player.ws, { type: 'notice', text: '[E2E] 재료 지급' });
  }
  else if (msg.type === 'kiln_burn') tryKilnBurn(player, msg.buildingId);                  // ★숯가마 조업(통나무 3 → 숯 4)
  else if (msg.type === 'attack') {
    metrics.attacks++;
    // ★[조준 모드 2026-08-30] 조준 방향을 **싣기만** 한다 — 타격 판정 아크·타이밍·애니는
    //   전투 층 배치의 몫이다(회부). tryAttack 의 "범위 안 가장 가까운 mob" 판정은 **무수정**.
    if (typeof msg.aimX === 'number' && typeof msg.aimY === 'number') {
      const _al = Math.hypot(msg.aimX, msg.aimY);
      if (_al > 1e-6 && isFinite(_al)) { player.aimX = msg.aimX / _al; player.aimY = msg.aimY / _al; }
    }
    tryAttack(player);
  }
  else if (msg.type === 'ranged_attack') { metrics.attacks++; tryRangedAttack(player, +msg.aimX, +msg.aimY); }
  else if (msg.type === 'craft') doCraft(player, msg.recipe);
  else if (msg.type === 'craft_item') doCraftItem(player, msg.recipe);
  // 플레이어 장비(품질·속성·내구 인스턴스) — econ 무접촉
  else if (msg.type === 'craft_equipment') doCraftEquipment(player, msg.itemType, msg.material, msg.mix);
  else if (msg.type === 'craft_collect') doCraftCollect(player, msg.buildingId);      // ★[시설 제작창] 대기열 수령
  else if (msg.type === 'craft_queue_ask') sendCraftQueue(player);                    // ★[시설 제작창] 대기열 조회
  else if (msg.type === 'facility_ask') sendFacility(player);                         // ★[시설 제작창] 지금 내 곁의 시설(창 자동 개방)
  else if (msg.type === 'cast_preview') doCastPreview(player, msg.itemType, msg.mix);
  else if (msg.type === 'equip_item') doEquipItem(player, msg.id);
  else if (msg.type === 'unequip_item') doUnequipItem(player, msg.slot);
  else if (msg.type === 'repair_equipment') doRepairEquipment(player, msg.id, msg.material);
  // 구매/판매 경계계약(마을 품질 EMA — 읽기전용 샘플/용해, econ 무접촉)
  else if (msg.type === 'shop_info') doShopInfo(player);
  else if (msg.type === 'craft_buy') doShopBuy(player, msg.itemType, msg.material);
  else if (msg.type === 'craft_sell') doShopSell(player, msg.id);
  else if (msg.type === 'sell_relic') doSellIronRelic(player, msg.id);   // ★철제 위세품 판매(재민 확정 2026-08-02b)
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
  else if (msg.type === 'eat') doEat(player, msg.item, msg.amount);   // ★[무게] amount 생략 = 1개(종전 그대로)
  else if (msg.type === 'cook') doCook(player, msg.recipe);
  else if (msg.type === 'eat_dish') doEatDish(player, msg.id);
  // ★[보존 배치 2026-08-31] 말리기·훈제·절임 — 새 패널 0. 제작창(시설의 창)에 항목만 늘어난다.
  // ★★[자염 배치 2026-09-01] 자염도 이 문으로 들어온다 — **클라를 한 줄도 안 고치려고**.
  //   클라의 제작창은 행에 `preserve: true` 가 있으면 `{type:'preserve', recipe, amount}` 를 보낸다.
  //   자염은 "시설 앞에서 재료를 넣고 시간을 기다려 물건을 받는" **같은 문법**이라 그 문이 맞다.
  //   여기서 갈래를 나눈다: 레시피 이름이 `salt.RECIPES` 에 있으면 자염, 아니면 보존.
  else if (msg.type === 'preserve') {
    if (Salt.RECIPES[msg.recipe]) doBoilSalt(player, msg.recipe, msg.amount);
    else doPreserve(player, msg.recipe, msg.amount);
  }
  else if (msg.type === 'preserve_menu_ask') send(player.ws, { type: 'preserve_menu', recipes: preserveMenuPayload() });
  // ★[작물 층 2026-08-31] 파종 — 씨앗이 곧 작물이라 고르는 창이 따로 없다(새 패널 0)
  else if (msg.type === 'plant') doPlant(player, msg.crop);
  else if (msg.type === 'plant_menu_ask') send(player.ws, { type: 'plant_menu', menu: plantMenuPayload(player) });
  else if (msg.type === 'fish_cast') tryFishCast(player);      // ★[낚시 v2] 던지기 — 이미 던져 뒀으면 챔질로 넘어간다
  else if (msg.type === 'fish_strike') tryFishStrike(player);  // ★[낚시 v2] 챔질(서버 시각으로만 판정)
  else if (msg.type === 'fish_reel') { if (player._fish) { player._fish = null; send(player.ws, { type: 'fish_state', state: 'idle' }); send(player.ws, { type: 'notice', text: '🎣 줄을 거뒀다' }); } }
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
  // ★★[2026-08-02d] 시대 게이트 — era.js "송국리기엔 기마 없음" 이 코드로 지켜지는 유일한 자리.
  //   `canTame` 은 UNLOCK 표만 본다(하드코딩 없음): 표에 없는 짐승은 통과, 나중 시대 항목은 차단.
  //   ⚠메시지에 시대를 노출하지 않는다 — 플레이어에게 세계는 그냥 "아직 그런 짐승은 못 다룬다"여야 한다.
  if (!require('./era').canTame(best.type)) {
    send(player.ws, { type: 'notice', text: '아직 길들일 수 없는 짐승이다' }); return;
  }
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
  sendInventory(player);
  savePlayer(player);
}

// ── ★★[작물 층 2026-08-31] 그 자리의 물 공급(1~5) ─────────────────────────
//   카탈로그의 `물요구(1-5)` 와 **같은 눈금**이다: 5 = 무논(물 바로 옆) … 1 = 물 없는 척박지.
//   ★지형을 여기서 다시 풀지 않는다 — 정본 술어 `isWaterTileLocal` 을 부른다(사본 계측기 금지).
//   ★결정론: 같은 자리는 언제나 같은 값이다(지형은 안 변한다). 그래서 **심을 때 한 번 재서 박아 둔다.**
//   ⚠이게 배산임수 캐논과 물리는 자리다 — 논은 물가에만 서고, 그건 마을이 물가에 있는 이유와 같다.
const WATER_SUPPLY_STEPS = [[1, 5], [3, 4], [6, 3], [9, 2]];   // (셀거리 이하 → 공급) · 그 밖 1
function _waterSupplyAt(x, y) {
  const C = 32, MAX = 9;
  let best = Infinity;
  for (let dy = -MAX; dy <= MAX; dy++) {
    for (let dx = -MAX; dx <= MAX; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d >= best) continue;
      if (isWaterTileLocal(x + dx * C, y + dy * C)) best = d;
    }
  }
  if (!Number.isFinite(best)) return 1;
  for (const [lim, sup] of WATER_SUPPLY_STEPS) if (best <= lim) return sup;
  return 1;
}
// 농지 초기 데이터 — **작물을 심었으면 작물 농지, 아니면 종전 그대로**(NPC·기존 저장 무영향).
function _farmlandData(player) {
  const cid = player && player._plantCrop;
  if (cid && Crops.get(cid)) {
    return { crop: cid, cropType: cid, plantedDay: zoneGameDay(),
             seedFresh: Number.isFinite(player._plantSeedFresh) ? player._plantSeedFresh : 1,
             supply: _waterSupplyAt(player.x, player.y), ready: false };
  }
  return { cropType: 'berry', plantedAt: Date.now(), readyAt: Date.now() + CROP_GROW_MS, ready: false };
}

// === ★★파종 [작물 층 2026-08-31] ==========================================
//
// ★**씨앗이 곧 작물이다** — 작물 고르는 창을 따로 만들지 않는다(새 패널 0).
//   가진 씨앗 중 **이번 철에 심을 수 있는 것**만 심긴다.
// ★★파종철은 econ 계절 정본(`events.seasonOf`)이 정한다. 겨울엔 **아무것도 못 심는다**
//   (카탈로그 34종 중 겨울 파종 0종 — 그게 겨울이 겨울인 이유다).
// ★씨앗은 **오래된 것부터** 나간다(FIFO). 묵은 씨앗을 쓰면 **발아율이 낮아 덜 난다** —
//   그게 이 배치의 ② 이고, 새 축이 아니라 부패 배치의 신선도 축을 그대로 쓴다.
function doPlant(player, cropId) {
  const c = Crops.get(cropId);
  if (!c) { send(player.ws, { type: 'notice', text: `알 수 없는 작물: ${cropId}` }); return; }
  const today = zoneGameDay();
  if (!Crops.canSowOn(cropId, today)) {
    const ko = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
    const when = Crops.sowSeasons(cropId).map((x) => ko[x] || x).join('·') || '—';
    send(player.ws, { type: 'notice',
      text: `지금은 ${ko[Crops.seasonOfDay(today)]}이다 — ${c.ko}은(는) ${when}에 심는다` });
    return;
  }
  const seed = Crops.seedOf(cropId);
  Lots.reconcile(player, seed, player.inventory, today);
  if (Lots.sum(player, seed) < 1) {
    send(player.ws, { type: 'notice', text: `${c.ko} 씨앗이 없다` }); return;
  }
  // ★발아율 = 씨앗 신선도. **차감 전에** 재고 실행과 견적이 같은 수를 쓰게 한다.
  const off = Spoil.peekOffer(seed, Lots.of(player, seed), 1, today);
  const got = Lots.consume(player, seed, 1, player.inventory, today);
  player._plantCrop = cropId;
  player._plantSeedFresh = off.fresh;
  let okBuilt = false;
  try { okBuilt = _tryBuildAt(player, 'farmland', 0, null, null, { skipCost: true }) !== false; }
  finally { player._plantCrop = null; player._plantSeedFresh = null; }
  if (!okBuilt) {
    // 못 지었으면 씨앗을 **나이 그대로** 돌려준다(로트 병합 금지 규약)
    for (const a of got.ages) Lots.note(player, seed, a.n, a.d);
    player.inventory[seed] = Math.floor(Lots.sum(player, seed) + 1e-6);
    sendInventory(player); return;
  }
  const supply = _waterSupplyAt(player.x, player.y);
  const wm = Crops.waterMult(cropId, supply);
  const units = Crops.harvestUnits(cropId, { supply, seedFresh: off.fresh });
  const rd = Crops.readyDay(cropId, today);
  sendInventory(player);
  send(player.ws, { type: 'notice',
    text: `🌱 ${c.ko} 심었다 — ${Crops.growDaysOf(cropId)}일 자란다`
        + (c.winterCrop ? '(월동 — 겨울엔 안 자란다)' : '')
        + ` · 물 ${supply}/${c.water}${wm < 1 ? ` (${Math.round(wm * 100)}%)` : ''}`
        + ` · 씨앗 ${Math.round(off.fresh * 100)}% ⇒ 예상 ${units}단위`
        + (rd != null ? ` · ${Math.max(0, rd - today)}일 뒤` : '') });
  savePlayer(player);
}
// 클라가 그릴 목록 — **이번 철에 심을 수 있는 것과 내가 가진 씨앗**. 서버가 정본을 그대로 준다.
function plantMenuPayload(player) {
  const today = zoneGameDay();
  const season = Crops.seasonOfDay(today);
  const out = [];
  for (const c of Crops.list()) {
    const seed = Crops.seedOf(c.id);
    const have = Math.floor(Lots.sum(player, seed));
    if (have <= 0) continue;
    const off = have > 0 ? Spoil.peekOffer(seed, Lots.of(player, seed), 1, today) : { fresh: 1 };
    const supply = _waterSupplyAt(player.x, player.y);
    out.push({ id: c.id, ko: c.ko, emoji: Crops.emojiOf(c.id), have,
               can: Crops.canSowOn(c.id, today), sow: c.sow, winterCrop: !!c.winterCrop,
               growDays: Crops.growDaysOf(c.id), water: c.water, care: c.care, keepDays: Crops.keepDaysOf(c.id),
               seedFresh: off.fresh, supply, waterMult: Crops.waterMult(c.id, supply),
               units: Crops.harvestUnits(c.id, { supply, seedFresh: off.fresh }) });
  }
  out.sort((a, b) => (b.can - a.can) || (b.units - a.units));
  return { season, crops: out };
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
  // ★★[작물 층 2026-08-31] **작물 농지는 게임일로 자란다**(종전 베리 농지는 벽시계 그대로).
  //   왜 날로 세나: 카탈로그의 성장일이 **활동일**이고, 월동 작물은 겨울에 안 자라기 때문이다.
  //   ★lazy — 틱이 없다. 볼 때 `오늘 − 심은 날` 을 계절과 함께 적분한다(부패·광맥과 같은 문법).
  const _cid = best.data && best.data.crop;
  const _crop = _cid ? Crops.get(_cid) : null;
  if (_crop) {
    const today = zoneGameDay();
    if (!Crops.isReady(_cid, best.data.plantedDay, today)) {
      const grown = Crops.grownDays(_cid, best.data.plantedDay, today);
      const rd = Crops.readyDay(_cid, best.data.plantedDay);
      const dormant = _crop.winterCrop && Crops.seasonOfDay(today) === 'winter';
      send(player.ws, { type: 'notice',
        text: `${_crop.ko} 아직 자라는 중 — ${grown}/${Crops.growDaysOf(_cid)}일`
            + (dormant ? ' · ❄겨울엔 안 자란다(월동)' : '')
            + (rd != null ? ` · ${Math.max(0, rd - today)}일 남음` : '') });
      return;
    }
    // ★수확량 = 수확량축 × 물충족(관리난이도 가중) × 발아율. 전부 심을 때 박아 둔 값 — 결정론.
    const units = Crops.harvestUnits(_cid, { supply: best.data.supply, seedFresh: best.data.seedFresh });
    const seed = Crops.seedOf(_cid);
    if (units > 0) {
      player.inventory[_cid] = (player.inventory[_cid] || 0) + units;
      Lots.note(player, _cid, units, today);                    // ★갓 거둔 것 — 오늘이 취득일
    }
    // 씨앗은 **갓 여문 것**으로 돌아온다(발아율 100%) — 그래서 농사가 이어진다.
    player.inventory[seed] = (player.inventory[seed] || 0) + 1;
    Lots.note(player, seed, 1, today);
    if (best.dbId) { try { db.deleteBuilding(best.dbId); } catch (e) {} }
    chunkManager.removeBuilding(best);
    buildings.delete(best.id);
    broadcast({ type: 'building_removed', id: best.id });
    sendInventory(player);
    send(player.ws, { type: 'notice',
      text: units > 0
        ? `🌾 ${_crop.ko} ${units}단위 수확 + 씨앗 1 (보관 ${Crops.keepDaysOf(_cid)}일)`
        : `${_crop.ko} 흉작 — 한 단위도 못 걷었다(물 ${best.data.supply}/${_crop.water} · 씨앗 ${Math.round((best.data.seedFresh || 0) * 100)}%). 씨앗만 건졌다` });
    savePlayer(player);
    return;
  }
  if (!best.data || !best.data.ready) {
    const remain = Math.max(0, Math.round((best.data?.readyAt - Date.now()) / 1000));
    send(player.ws, { type: 'notice', text: `아직 자라는 중 (${remain}초 남음)` });
    return;
  }
  // 수확 — berry 3 + seed_berry 1 + farmland 제거 (종전 베리 농지 · 무변경)
  player.inventory.berry = (player.inventory.berry || 0) + 3;
  player.inventory.seed_berry = (player.inventory.seed_berry || 0) + 1;
  if (best.dbId) { try { db.deleteBuilding(best.dbId); } catch (e) {} }
  chunkManager.removeBuilding(best);
  buildings.delete(best.id);
  broadcast({ type: 'building_removed', id: best.id });
  sendInventory(player);
  send(player.ws, { type: 'notice', text: '수확! 🫐 ×3 + 씨앗 ×1' });
  savePlayer(player);
}

// === 음식 먹기 ===
// ★★[무게 배치 2026-08-27] **부분 소비**를 받는다(재민: "한 입 0.25단위 식 부분 소비 —
//   무게·포만감 정확히 비례 차감"). 로트 품목이면 **오래된 로트부터** 깎고, 회복량도 그만큼만 준다.
//   기본값 1 이라 기존 호출부는 한 줄도 안 달라진다.
// ★★[T56 2026-09-02 · §12] **먹이기는 먹기와 같은 함수다.** 대상 인자 하나를 더했다
//   (`who` — 기본값은 자기 자신이라 종전 호출은 한 글자도 안 바뀐다).
//     · 인벤·로트·kg 원장·신선도·탈  →  **`player`**(주는 사람)에게서 종전 그대로 빠진다
//     · 허기·갈증·HP·사기·약초       →  **`who`**(받는 사람)의 몸에 붙는다
//   ⇒ 남에게 먹이는 두 번째 경로를 만들지 않았다. 두 벌이 되면 로트 FIFO 와 부패 판정이
//     갈리고, 그날 "먹여 줬는데 왜 상한 게 안 셌지" 가 난다(거래소 배치의 그 함정).
function doEat(player, item, amount, who) {
  const target = who || player;
  const eff = FOOD_EFFECTS[item];
  if (!eff) {
    send(player.ws, { type: 'notice', text: `먹을 수 없는 아이템: ${item}` }); return;
  }
  const isLot = Lots.isLot(item);
  const want = Math.max(0, Number(amount) > 0 ? Number(amount) : 1);
  const today = zoneGameDay();
  if (isLot) Lots.reconcile(player, item, player.inventory, today);
  const stock = isLot ? Lots.sum(player, item) : (player.inventory[item] || 0);
  if (stock < Math.min(want, 1e-6)) {
    send(player.ws, { type: 'notice', text: `${item} 부족` }); return;
  }
  let ate = Math.min(want, stock);
  // ★★[부패 배치 2026-08-31] 신선도는 **먹은 그 로트들**에서 나온다.
  //   `Lots.consume` 은 오래된 것부터(FIFO) 깎고 `ages:[{d,n}]` 를 돌려준다 — 로트를 다시 뒤지지
  //   않고 그걸 그대로 `Spoil.ofAges` 에 넘긴다(사본 금지). 신선한 몫과 상한 몫이 **따로** 나온다:
  //   회복은 신선한 몫에서만 나오고, 탈은 상한 몫에서 난다. 평균 하나로 뭉개면 둘 다 거짓말이다.
  let fresh = 1, spoiledQty = 0;
  if (isLot) {
    const r = Lots.consume(player, item, ate, player.inventory, today);
    ate = r.taken;
    const fr = Spoil.ofAges(item, r.ages, today);
    fresh = fr.fresh; spoiledQty = fr.spoiled;
  } else {
    ate = Math.min(want, Math.floor(stock) || stock);
    if (ate < 1) { send(player.ws, { type: 'notice', text: `${item} 부족` }); return; }
    ate = Math.floor(ate);
    consumeItem(player, item, ate);   // ★[원장 승격] 인벤+원장 동시 차감(정본 하나)
  }
  // ★회복은 **먹은 양에 정확히 비례**한다 — 0.25단위를 먹으면 0.25배 찬다.
  // ★그리고 **신선도에 비례**한다(연속). 상함(f=0)이면 곱해서 0 이 된다 — 별도 분기가 없다.
  const _nut = Spoil.nutritionMult(fresh);
  if (eff.hunger)   target.hunger = Math.min(HUNGER_MAX, (target.hunger ?? HUNGER_MAX) + eff.hunger * ate * _nut);
  // ★보존식은 짜고 말라 갈증을 준다(thirst 음수) — 0 아래로는 안 내려간다.
  //   갈증 항은 신선도로 안 깎는다: 마른 건어물은 상해도 여전히 짜다.
  if (eff.thirst)   target.thirst = Math.max(0, Math.min(THIRST_MAX, (target.thirst ?? THIRST_MAX) + eff.thirst * ate));
  // ★★[T54 2026-09-02 재민/PM 판정] **병은 그릇이지 소모품이 아니다** — 표의 `returns` 칸을 여기서 읽는다.
  //   가마가 빈 병을 돌려주는 자리(`doBoilSalt` 의 시설 산출)와 **같은 계약**이고, 그래서 담기·마시기가
  //   왕복해도 **병 개수가 보존된다**. ⚠(83)·(94)의 함정 자리다 — 칸을 넣는 것과 읽는 것은 다른 명제라
  //   `test-tidal` 의 돌연변이 검사가 **이 줄을 지우면 빨개진다**(실클라도 빈 병 +1 을 센다).
  //   ★★[T56 2026-09-02] 남에게 먹여도 **빈 병은 준 사람 손에 남는다**(`player`) — 물을 먹여 주고
  //     병까지 넘어가면 그건 주기(give)지 먹이기가 아니다. 물건은 주는 쪽, 몸은 받는 쪽이 이 함수의 규약이다.
  if (eff.returns)  { player.inventory[eff.returns] = (player.inventory[eff.returns] || 0) + ate; send(player.ws, { type: 'notice', text: `🏺 빈 ${ITEM_LABEL_SERVER[eff.returns] || eff.returns} ${ate}개가 남았다` }); }
  // ★★[T43 2026-09-02] **HP 0 의 뜻을 하나로.** 종전엔 이 갈래가 `damagePlayer` 밖에서 hp 를 깎아
  //   hp 가 0 이 돼도 **쓰러지지 않는 몸**이 만들어졌다(죽음 설계 §0-ⓐ-4 가 잡은 구멍:
  //   그 몸은 더 안 맞고 영원히 안 아물어 로그아웃 말고는 빠져나올 길이 없었다).
  //   ⇒ 음(−)의 몫은 **정본 피해 경로**로 보낸다. 회복(+)은 종전 그대로 여기서 더한다.
  if (eff.hpDelta < 0) { damagePlayer(target, -eff.hpDelta * ate, `food:${item}`); }
  else if (eff.hpDelta) { target.hp = Math.max(0, Math.min(target.maxHp, target.hp + eff.hpDelta * ate));
                      broadcast({ type: 'player_damaged', pid: target.pid, hp: target.hp }); }
  // ★★상한 걸 먹으면 **확정적으로** 탈이 난다 — 주사위 없음(재민 확정: 식중독 확률 모델 금지).
  //   새 축을 안 만든다: 신체 §7 의 **부상** 축 하나를 재사용한다(HP 는 안 건드린다).
  //   ⚠[T44] "아사 폐지" 폐기와 무관하다 — 극단 HP 감소는 허기·갈증·추위 셋이고 상한 음식은 그 목록 밖이다.
  //   부상 축이 이미 이속·작업 배율 곡선과 바닥(0.72)을 갖고 있어 죽음의 나선이 안 난다.
  let _ill = 0;
  if (spoiledQty > 0) {
    _ill = Spoil.illnessFor(spoiledQty);
    if (_ill > 0) {
      const _b = Body.ensure(target);
      _b.injury = Math.min(1, _b.injury + _ill);
    }
  }
  // ★[신체 상태 §7] 사기 = **당근**. 심심함·스트레스는 기각됐고, 대신 좋은 음식이 버프를 준다.
  //   조리식(meat_cooked·berry_jam)이 생식보다 크다 — 요리와 화덕 수요의 실체.
  const _cooked = /cooked|jam|dish|stew|soup/.test(item);
  Body.onEat(target, { cooked: _cooked });
  // 약초는 부상 회복을 재촉한다(§7 "부상 = 회복 기간 + 약초 수요")
  if (item === 'medicinal_herb' || item === 'herb') Body.onHerb(target, Date.now());
  sendInventory(player);
  // ★몸의 값은 **받는 사람** 화면으로 간다(자기 자신을 먹였으면 종전과 같은 한 통이다).
  send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst), body: Body.selfPayload(player), carry: Object.assign(Carry.payload(player), { combined: moveMultOf(player) }) });
  if (target !== player) send(target.ws, { type: 'gauges', hunger: Math.round(target.hunger), thirst: Math.round(target.thirst), body: Body.selfPayload(target) });
  // ★[부패] 화면이 **왜 덜 찼는지**를 말한다 — 안 말하면 "회복량이 이상하다"로만 보인다
  //   (거래소 배치의 교훈: 계측기가 속은 자리에서 플레이어도 똑같이 속는다).
  const _stg = Spoil.stageOf(fresh);
  const _gain = Math.round((eff.hunger || 0) * ate * _nut);
  // ★"섭취했다"는 **받는 사람**의 말이다 — 먹여 준 쪽에는 `rescue.js` 가 제 문장을 보낸다.
  send(target.ws, { type: 'notice', text: `${ITEM_LABEL_SERVER[item] || item} 섭취 (+허기 ${_gain})`
    + (_stg !== 'fresh' && isLot ? ` · ${Spoil.STAGE_EMO[_stg]} ${Spoil.STAGE_KO[_stg]}` : '')
    + (_ill > 0 ? ' · 🤢 탈이 났다(부상↑)' : '')
    + (_cooked ? ' · ✨ 잘 먹었다(사기↑)' : '') });
  savePlayer(player);
  if (target !== player) savePlayer(target);
}

// === 요리 (campfire 근처에서만) ===
function doCook(player, recipeName) {
  const recipe = COOK_RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 요리: ${recipeName}` }); return;
  }
  // ★[시설 제작창 2026-08-29] 화덕 판정을 **정본에게 물어본다**(`facility.js`) — 반경 상수를 여기 또 적지 않는다.
  //   종전엔 이 함수가 전 건물을 훑으며 96px 를 손으로 비교했다(같은 수가 두 곳에 있었다).
  const _fc = facilityFor(player, 'cook');
  if (!_fc) { send(player.ws, { type: 'notice', text: '🔥 모닥불·화덕 앞에서만 요리한다' }); return; }
  if (!_facilityMine(player, _fc.b)) { send(player.ws, { type: 'notice', text: `${_fc.ko}은(는) 내 것이 아니다` }); return; }
  // 재료 확인
  for (const [item, amt] of Object.entries(recipe.cost)) {
    if ((player.inventory[item] || 0) < amt) {
      send(player.ws, { type: 'notice', text: `${item} ${amt}개 필요` }); return;
    }
  }
  for (const [item, amt] of Object.entries(recipe.cost)) consumeItem(player, item, amt);   // ★[원장 승격] 제작 투입도 원장을 깎는다
  // 요리 인스턴스 생성(신선도·버프 — 설계 §6). 스칼라 산출 대신 품질 인스턴스(cook숙련×재료). 갓 지은 요리 > 식은 요리.
  ensurePlayerItems(player);
  const cookLvl = playerCraftLevel(player, 'cooking');
  const dish = PlayerItems.craftItem('food', cookLvl, recipe.cost);
  dish.id = genEquipId();
  dish.label = recipe.label;
  // ★신선도는 **꺼낼 때** 찍는다 — 불에 올려 둔 동안 식지 않는다(다 되면 그때가 갓 지은 때다).
  const rk = Facility.enqueue(_fc.b, { id: dish.id, kind: 'cook', label: recipe.label,
    owner: player.playerId, dish }, Date.now());
  if (!rk.ok) {
    for (const [item, amt] of Object.entries(recipe.cost)) player.inventory[item] += amt;
    send(player.ws, { type: 'notice', text: rk.err }); return;
  }
  markBuildingDirty(_fc.b);
  sendInventory(player);
  sendCraftQueue(player);
  send(player.ws, { type: 'notice', text: `🔥 ${_fc.ko}에 얹었다 — ${recipe.label} · ${Math.ceil(rk.job.ms / 1000)}초${rk.ahead ? ` (앞에 ${rk.ahead}개)` : ''}` });
  void cookLvl;
  savePlayer(player);
}

// === ★★보존 가공 (말리기·훈제·절임) [재민 확정 2026-08-31] =====================
//
// ★"제작창 = 시설의 창" 문법 그대로다 — `doCook` 과 **같은 뼈대**를 쓴다:
//   시설 판정은 `facilityFor` 정본에게 묻고, 시간은 시설 대기열(`Facility.enqueue`)에 맡긴다.
//   ⇒ **오프라인에도 진행된다**(가마는 밤새 탄다 · 건조대는 밤새 마른다). 수령만 접속해서 한다.
//
// ★★**보존의 본질 = 부패 시계의 리셋.** 산출은 취득일이 **완성일**인 새 로트다.
//   ⚠요리(`dish.craftedAtMs = 꺼낸 때`)와 **다르게** 잡았다. 이유가 있다:
//     요리 대기열은 20초라 "언제부터 세느냐"가 무의미하지만, 보존은 **며칠**이다.
//     수령일로 잡으면 건조대가 **무한 정지 상자**가 된다(걸어 두면 안 상하는 창고).
//     완성일로 잡으면 "말렸으면 가져가라"가 성립한다 — 그게 보존식이지 마법 상자가 아니다.
//   ⇒ 이 차이는 알고 낸 것이고 `회부_부패_다음층.md` D 에 적었다.
function doPreserve(player, recipeKey, amount) {
  // ★[T59] `from` 이 어종 집합이면 **손에 있는 것 하나로 풀어** 받는다(정본이 고른다 · 주사위 0).
  const r = Spoil.resolveFrom(Spoil.PRESERVE[recipeKey], player.inventory);
  if (!r) { send(player.ws, { type: 'notice', text: `알 수 없는 가공: ${recipeKey}` }); return; }
  // ① 시설 — 정본에게 묻는다(반경 상수를 여기 또 적지 않는다)
  const fc = facilityFor(player, r.kind);
  if (!fc) { send(player.ws, { type: 'notice', text: `${r.facilityKo} 앞에서만 ${r.label}를 한다` }); return; }
  if (!_facilityMine(player, fc.b)) { send(player.ws, { type: 'notice', text: `${fc.ko}은(는) 내 것이 아니다` }); return; }
  // ② 입력 로트 — 얼마나 있나
  const today = zoneGameDay();
  Lots.reconcile(player, r.from, player.inventory, today);
  const stock = Lots.sum(player, r.from);
  const want = Math.max(1, Math.floor(Number(amount) > 0 ? Number(amount) : 1));
  if (stock < 1) { send(player.ws, { type: 'notice', text: `${r.from} 부족` }); return; }
  const take = Math.min(want, Math.floor(stock));
  if (take < 1) { send(player.ws, { type: 'notice', text: `${r.from} 부족` }); return; }
  // ③ 부재료 — 소금·땔감. **먼저 확인만** 한다(뺐다가 되돌리는 경로를 안 만든다).
  for (const [k, n] of Object.entries(r.needs || {})) {
    if ((player.inventory[k] || 0) < n * take) {
      send(player.ws, { type: 'notice', text: `${ITEM_LABEL_SERVER[k] || k} ${n * take}개 필요 — ${r.label}에는 ${k === 'salt' ? '소금이' : '땔감이'} 든다` });
      return;
    }
  }
  // ★대기열 자리도 **미리** 본다 — 재료를 뺀 뒤에 "대기열이 찼다"로 되돌리는 길을 아예 없앤다.
  //   (되돌리기는 나이 분포를 근사로 뭉갠다. 안 하는 게 낫다.)
  if (Facility.view(fc.b, Date.now()).length >= Facility.MAX_QUEUE) {
    send(player.ws, { type: 'notice', text: `${fc.ko} 대기열이 찼다(${Facility.MAX_QUEUE})` }); return;
  }
  // ④ 입력을 깎는다 — **오래된 로트부터**(`consume` 정본 하나). 그래서 "말릴 거면 오래된 것부터"가
  //   저절로 성립하고, 동시에 **싱싱할 때 말릴 이유**가 생긴다(수율이 신선도에 비례하므로).
  const got = Lots.consume(player, r.from, take, player.inventory, today);
  const fr = Spoil.ofAges(r.from, got.ages, today);
  // ★되돌릴 땐 **나이 분포까지 그대로** 돌려놓는다 — `ages` 를 로트별로 다시 적는다.
  //   한 날짜로 뭉개면 장부가 거짓말을 한다(로트 병합 금지 규약).
  const _undo = () => {
    // ★[부패 2차] 노출까지 그대로 되돌린다 — 개수·날짜만 돌려놓으면 그릇에서 번 시간이 사라진다.
    Lots.moveIn(player, r.from, got.ages, today, 0, 'carry');
    player.inventory[r.from] = Math.floor(Lots.sum(player, r.from) + 1e-6);
    sendInventory(player);
  };
  const gate = Spoil.canPreserve(recipeKey, fr.fresh);
  if (!gate.ok) { _undo(); send(player.ws, { type: 'notice', text: gate.err }); return; }   // 상한 재료는 삼키지 않는다
  const outQty = Spoil.outputQty(got.taken, fr.fresh);
  if (outQty < 1) {
    _undo();
    send(player.ws, { type: 'notice', text: `너무 적거나 시들어 ${r.label} 한 개도 안 나온다` }); return;
  }
  for (const [k, n] of Object.entries(r.needs || {})) consumeItem(player, k, n * take);
  // ⑤ 대기열 — 시간은 **게임일로 적고** 하루 길이로 환산한다(새 시계 금지).
  const ms = Spoil.preserveMs(recipeKey, _SEASON_DAY_MS);
  const rk = Facility.enqueue(fc.b, {
    id: genEquipId(), kind: 'preserve', label: `${r.label}(${Spoil.PRESERVED_ITEMS[r.out].ko} ×${outQty})`,
    owner: player.playerId, ms,
    items: { [r.out]: outQty }, lotItems: { [r.out]: outQty },   // ★lotItems = 수령 때 로트로 적을 것
  }, Date.now());
  if (!rk.ok) {
    // ★위에서 자리를 미리 봤으니 여기는 사실상 도달 불가다 — 그래도 방어한다(재료를 삼키지 않는다).
    _undo();
    for (const [k, n] of Object.entries(r.needs || {})) player.inventory[k] = (player.inventory[k] || 0) + n * take;
    sendInventory(player);
    send(player.ws, { type: 'notice', text: rk.err }); return;
  }
  markBuildingDirty(fc.b);
  sendInventory(player);
  sendCraftQueue(player);
  const _stg = Spoil.stageOf(fr.fresh);
  send(player.ws, { type: 'notice',
    text: `${fc.ko}에 걸었다 — ${r.label} · ${r.from} ${got.taken}(${Spoil.STAGE_KO[_stg]}) → ${Spoil.PRESERVED_ITEMS[r.out].ko} ${outQty}개`
        + ` · ${r.days}일(${Math.ceil(ms / 60000)}분)${rk.ahead ? ` (앞에 ${rk.ahead}개)` : ''}` });
  savePlayer(player);
}
// === ★★자염(煮鹽) — 짠물을 졸여 소금을 얻는다 [재민 확정 2026-09-01 ①] ==========
//
// ★`doPreserve` 와 **같은 뼈대**다(시설 판정 → 재료 확인 → 대기열 → 수령). 다른 점은 셋뿐:
//   ① 입력이 **로트가 아니다** — 짠물도 땔감도 안 썩는다(무기한 벌크 = 인벤 3층의 셋째).
//      그래서 신선도도 수율 배율도 없다. 같은 입력이면 **언제나 같은 소금**이다(주사위 금지).
//   ② 산출이 **econ 재화 `salt` 그 자체**다 — 새 품목을 만들지 않았으므로 절임·거래소·사건 장부가
//      특별 취급 코드 없이 이 소금을 다룬다(그게 새 품목을 안 만든 이유다).
//   ③ **빈 병을 돌려준다.** 짠물 7되를 졸이면 병 7개가 비어 나온다 — 병은 소모품이 아니라 그릇이다.
//      (안 돌려주면 채수할 때마다 풀 2단이 사라진다 = 물병이 사실상 소모품이 되고,
//       그러면 자염의 비용이 **풀**이 된다. 자염의 비용은 땔감과 걸음이어야 한다.)
//
// ★한 솥이 단위다. `amount` 는 솥 수다 — 되당 땔감 0.29단 같은 소수를 화면에 안 띄우려고 그렇게 잡았다.
function doBoilSalt(player, recipeKey, amount) {
  const r = Salt.RECIPES[recipeKey];
  if (!r) { send(player.ws, { type: 'notice', text: `알 수 없는 가공: ${recipeKey}` }); return; }
  // ① 시설 — 정본에게 묻는다(반경 상수를 여기 또 적지 않는다)
  const fc = facilityFor(player, r.kind);
  if (!fc) { send(player.ws, { type: 'notice', text: `${r.facilityKo} 앞에서만 ${r.label}을 한다` }); return; }
  if (!_facilityMine(player, fc.b)) { send(player.ws, { type: 'notice', text: `${fc.ko}은(는) 내 것이 아니다` }); return; }
  // ② 대기열 자리를 **먼저** 본다 — 재료를 뺀 뒤에 "찼다"로 되돌리는 길을 아예 없앤다(보존 선례).
  if (Facility.view(fc.b, Date.now()).length >= Facility.MAX_QUEUE) {
    send(player.ws, { type: 'notice', text: `${fc.ko} 대기열이 찼다(${Facility.MAX_QUEUE})` }); return;
  }
  // ③ 재료 — **확인만** 한다(정본 게이트 하나에게 묻는다).
  const pots = Math.max(1, Math.floor(Number(amount) > 0 ? Number(amount) : 1));
  const gate = Salt.canBoil(recipeKey, player.inventory, pots);
  if (!gate.ok) {
    const ko = ITEM_LABEL_SERVER[gate.item] || gate.item;
    send(player.ws, { type: 'notice',
      text: `${ko} ${gate.need}${gate.item === Salt.BRINE ? '되' : '개'} 필요(보유 ${gate.have})`
          + (gate.item === Salt.BRINE ? ` — 갯벌에서 물병으로 뜬다` : ` — 자염은 땔감을 먹는다`) });
    return;
  }
  const outQty = Salt.potYield(recipeKey) * pots;
  if (outQty < 1) { send(player.ws, { type: 'notice', text: `한 솥으로는 소금이 한 줌도 안 나온다` }); return; }
  // ④ 재료를 깎는다.
  for (const [k, n] of Object.entries(gate.cost)) consumeItem(player, k, n * pots);
  // ⑤ 대기열 — 시간은 **게임일로 적고** 하루 길이로 환산한다(새 시계 금지 · 보존과 같은 규약).
  const ms = Salt.boilMs(recipeKey, _SEASON_DAY_MS) * pots;
  const backVessels = gate.cost[Salt.BRINE] * pots;   // 비어 나오는 병
  const rk = Facility.enqueue(fc.b, {
    id: genEquipId(), kind: 'boil', label: `${r.label}(${ITEM_LABEL_SERVER[r.out]} ×${outQty})`,
    owner: player.playerId, ms,
    // ★로트가 아니다 — `lotItems` 를 안 준다(소금도 병도 안 썩는다).
    items: { [r.out]: outQty, [Salt.VESSEL]: backVessels },
  }, Date.now());
  if (!rk.ok) {
    for (const [k, n] of Object.entries(gate.cost)) player.inventory[k] = (player.inventory[k] || 0) + n * pots;
    sendInventory(player);
    send(player.ws, { type: 'notice', text: rk.err }); return;
  }
  markBuildingDirty(fc.b);
  sendInventory(player);
  sendCraftQueue(player);
  send(player.ws, { type: 'notice',
    text: `🧂 ${fc.ko}에 걸었다 — ${r.label} ${pots}솥 · ${Salt.BRINE_KO} ${gate.cost[Salt.BRINE] * pots}되`
        + ` + ${ITEM_LABEL_SERVER.wood} ${gate.cost.wood * pots} → ${ITEM_LABEL_SERVER[r.out]} ${outQty}`
        + ` (빈 ${ITEM_LABEL_SERVER[Salt.VESSEL]} ${backVessels}개도 같이 나온다)`
        + ` · ${Math.ceil(ms / 60000)}분${rk.ahead ? ` (앞에 ${rk.ahead}개)` : ''}` });
  savePlayer(player);
}

// 클라가 그릴 목록 — 서버가 정본을 그대로 내보낸다(클라가 표를 안 든다).
function preserveMenuPayload() {
  const out = [];
  for (const [key, r0] of Object.entries(Spoil.PRESERVE)) {
    const r = Spoil.resolveFrom(r0, null);   // ★[T59] 어종 집합은 대표 하나로(클라가 배열을 못 그린다)
    out.push({ key, label: r.label, kind: r.kind, facilityKo: r.facilityKo,
               from: r.from, out: r.out, outKo: Spoil.PRESERVED_ITEMS[r.out].ko,
               days: r.days, needs: r.needs, shelfDays: Spoil.shelfOf(r.out) });
  }
  return out;
}
// 요리 섭취: 신선도로 영양·버프 스케일(갓 지은 요리 최고). 버프 = 즉시 HP 회복(웰빙).
function doEatDish(player, id) {
  ensurePlayerItems(player);
  const idx = (player.dishes || []).findIndex(d => d.id === id);
  if (idx < 0) { send(player.ws, { type: 'notice', text: '해당 요리 없음' }); return; }
  const dish = player.dishes[idx];
  const fresh = dishFreshness(dish);
  const nutrition = Math.round((dish.attrs.nutrition || 0) * fresh / 100); // 식으면 영양↓
  const hpBuff = Math.round((dish.attrs.buff || 0) * 15 * fresh / 100);    // 버프 = 신선·고품질일수록 큰 HP 회복
  player.hunger = Math.min(HUNGER_MAX, (player.hunger ?? HUNGER_MAX) + nutrition);
  if (hpBuff > 0) {
    player.hp = Math.max(0, Math.min(player.maxHp, player.hp + hpBuff));
    broadcast({ type: 'player_damaged', pid: player.pid, hp: player.hp });
  }
  player.dishes.splice(idx, 1);
  sendDishes(player);
  send(player.ws, { type: 'gauges', hunger: Math.round(player.hunger), thirst: Math.round(player.thirst) });
  send(player.ws, { type: 'notice', text: `${dish.label} 섭취 (+허기 ${nutrition}${hpBuff ? ` · +HP ${hpBuff}` : ''}${fresh < 40 ? ' · 식음' : ''})` });
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
      // ★[2026-08-03g 배치 14 ②] 존 승격 경로에도 영속 여부를 실어 준다(핸드오프 경로와 동형).
      persistent: !!pending.persistent || !String(pending.player_id || '').startsWith('anon_'),
      name: pending.name, color: pending.color,
      x: pending.x, y: pending.y,
      vx: pending.vx || 0, vy: pending.vy || 0,
      inventory: pending.inventory || { wood: 0, stone: 0 },
      tools: pending.tools || {},
      equipped: pending.equipped || null,
      equipment: [], equipSlots: {}, craftSkill: {}, // 플레이어 아이템: promote 경로는 빈 초기화(존 핸드오프 캐리는 후속)
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
      inventory: invPayload(player.inventory),
      toolItems: player.toolItems || [], hotkey1: player.hotkey1 || null, equipped: player.equipped || null,
      equipment: player.equipment || [], craftSkill: player.craftSkill || {}, // 플레이어 아이템 인스턴스·숙련
      tools: player.tools,
      recipes: RECIPES,
      itemRecipes: ITEM_RECIPES,
      equipmentRecipes: EQUIPMENT_RECIPES, // 플레이어 장비 제작 레시피
      equipmentMeta: EQUIPMENT_META,       // 미리보기 계산용
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
    // ★★[2026-08-25 · B-6] 이 세션이 **새 세션에 밀려난 것**이면 저장하지 않는다.
    //   몸은 이미 새 세션이 물려받았고(위 `_takeover`), 여기서 또 쓰면 **낡은 좌표가 나중에 도착해**
    //   방금 이어받은 자리를 덮어쓴다(fire-and-forget 이라 순서 보장이 없다).
    if (player._supersededBy) {
      players.delete(player.pid);
      return;   // player_left 는 승계 시점에 이미 방송했다
    }
    // ★★[T7] **여기가 "자리를 비우기 시작한 날"이다.** 저장본에만 찍지 않고 **메모리에도** 찍는다 —
    //   이 몸이 잠깐 더 서 있다가 다음 세션에 승계될 수 있고(위 `_takeover`), 그때 이 값이
    //   따라가야 부재가 옳게 잡힌다. 밀려난 세션(`_supersededBy`)은 위에서 이미 빠져나갔다:
    //   그건 **사람이 나간 게 아니라 소켓이 바뀐 것**이라 부재가 아니다.
    player.lastSeenDay = gameDayNow();
    player._returnBriefDone = false;   // 다음 세션은 다시 받을 자격이 있다(승계되면 그대로 따라간다)
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
  for (const [it, amt] of Object.entries(recipe.from)) consumeItem(player, it, amt);   // ★[원장 승격]
  for (const [it, amt] of Object.entries(recipe.to)) {
    player.inventory[it] = (player.inventory[it] || 0) + amt;
  }
  // 14.53: 도구 instance 내구도 -1 (saw 등)
  if (recipe.requiresTool) consumeToolByType(player, recipe.requiresTool, 1);
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `${recipe.label} 완료` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
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
  for (const [k, v] of Object.entries(cost)) consumeItem(player, k, v);   // ★[원장 승격]
  player.inventory[recipeName] = (player.inventory[recipeName] || 0) + 1;
  // 14.53: 망치 instance 내구도 -1
  if (recipe._useHammer) consumeToolByType(player, 'hammer', 1);
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `${recipe.label} 제작 완료 (인벤에 추가됨)` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
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
    consumeItem(player, itemType, 1);   // ★[원장 승격]
    sendInventory(player);
    if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
  }
}

// 14.51: 건축 모드에서 건축물 분해. 거리 체크 + 인벤에 +1 환원.
function doDismantleBuilding(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b) {
    send(player.ws, { type: 'notice', text: '건축물 없음' }); return;
  }
  // §4-4 Stage 4A: 마을 공용 경작지(비영속 materialize 타일, dbId=null)는 분해 불가 —
  //   청크 재활성 때 부활하므로 분해 허용 시 아이템 무한 증식 루프가 됨.
  if (b.sim) {
    send(player.ws, { type: 'notice', text: '마을 공용 경작지는 분해할 수 없습니다' }); return;
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
    // ★[상자 원장 2026-08-30] 부수면 개체도 같이 돌아온다 — 안 그러면 철거가 **무게 세탁기**가 된다.
    if (b.data._led && typeof b.data._led === 'object') {
      for (const [k, arr] of Object.entries(b.data._led)) if (Array.isArray(arr)) Carry.noteEntries(player, k, arr);
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
  roomsTouchBuilding(b);   // ★[배치 18 ①] 이미 buildings 에서 뺀 뒤라 재판정이 '없어진 상태'를 본다
  // §4-4 Stage 4B(§5.5b): 통행 차단형(wall/fence) 철거 = 개통 → 교역 거리행렬·캐러밴 경로 무효화
  if (b.type === 'wall' || b.type === 'fence') SimVillages.invalidateTradeDistances(Math.floor(b.x / BUILDING_SIZE), Math.floor(b.y / BUILDING_SIZE));
  // cascade로 함께 제거 (재귀 호출 X — 직접)
  for (const cid of cascadeIds) {
    const cb = buildings.get(cid);
    if (!cb) continue;
    buildings.delete(cid);
    if (chunkManager && chunkManager.removeBuilding) chunkManager.removeBuilding(cb);
    if (cb.dbId) db.deleteBuilding(cb.dbId);
    broadcast({ type: 'building_removed', id: cid });
    roomsTouchBuilding(cb);   // ★[배치 18 ①] 계단 연쇄로 사라진 자동 바닥도 방을 해체시킨다
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
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `${itemType ? BUILDING_RECIPES[itemType].label : b.type} 분해 → 인벤 환원` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
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
  // ★[배치 18 ①] 여기에 방 재계산이 **없는 것이 맞다.** 열린 문도 방 경계라 여닫아도 방이 안 바뀐다.
  //   (종전 클라 BFS 는 열린 문으로 새어서 토글마다 전역 재구축을 걸었다 — 그 비용과 버그가 함께 사라졌다.)
}

// ══ 플레이어 장비: 제작·장착·수선 (econ 무접촉·본체 서버층. 엔진 = server/player-items.js) ══
function findEquip(player, id) { return (player.equipment || []).find(e => e.id === id) || null; }
function sendEquipment(player) {
  send(player.ws, { type: 'equipment', equipment: player.equipment || [], equipSlots: player.equipSlots || {}, craftSkill: player.craftSkill || {} });
}
// 장비 제작: 유형+재료 → 품질(숙련×재료등급) 인스턴스. 재료 스택 차감, 숙련 xp+.
// ★[재민 확정] 주조 배합 정규화 — 클라가 보낸 {구리:83, 주석:17}(가중치/퍼센트 아무거나)를
//   검증하고 **소비량**으로 바꾼다. 반환 { use:{금속:소비량}, mix:{금속:분율} } 또는 { err }.
//   소비량은 분수다: qty 3 짜리 무기에 주석 17% 면 주석 0.51 을 쓴다.
//   ⇒ 3개 단위로 배합하면 0/33/67/100% 밖에 못 고른다. "값에 따라 연속적으로" 라는 요구가
//     정수 단위와 양립하지 않으므로 **분수 소비**를 택했다(광석 재고는 이미 kg 실수다).
function normalizeCastMix(recipe, rawMix, inventory, skipStock) {
  const kinds = PlayerItems.castKinds();
  const ks = Object.keys(rawMix || {}).filter((k) => Number(rawMix[k]) > 0);
  if (!ks.length) return { err: '배합이 비었습니다' };
  if (ks.length > PlayerItems.CAST_MAX_KINDS) return { err: `한 번에 ${PlayerItems.CAST_MAX_KINDS}종까지만 녹일 수 있습니다` };
  for (const k of ks) if (!kinds.includes(k)) return { err: `이 시대의 노로는 못 녹입니다: ${k}` };
  let tot = 0; for (const k of ks) tot += Number(rawMix[k]);
  if (!(tot > 0)) return { err: '배합이 비었습니다' };
  const mix = {}, use = {};
  for (const k of ks) {
    mix[k] = Number(rawMix[k]) / tot;
    use[k] = +(recipe.qty * mix[k]).toFixed(4);
  }
  if (!skipStock) for (const k of ks) {
    const have = inventory[k] || 0;
    if (have + 1e-9 < use[k]) return { err: `재료 부족: ${k} ${use[k]} 필요 (보유 ${(+have).toFixed(2)})` };
  }
  return { use, mix };
}
// 주조 미리보기 — 클라가 슬라이더를 움직일 때마다 물어본다.
// ★합금 모델을 클라에 **복제하지 않기 위해** 서버에 묻는다. 이 세션에 복제본(proto-alloy)이
//   출하본과 어긋나서 검증이 헛돈 적이 있다. 배합 하나 계산은 마이크로초라 왕복이 더 싸다.
function doCastPreview(player, itemType, rawMix) {
  const recipe = EQUIPMENT_RECIPES[itemType];
  if (!recipe || !recipe.cast) return;
  const nm = normalizeCastMix(recipe, rawMix, player.inventory, true);
  if (nm.err) { send(player.ws, { type: 'cast_preview', itemType, err: nm.err }); return; }
  const props = Specialty.alloyProps ? Specialty.alloyProps(nm.mix) : null;
  const grade = PlayerItems.castGrade(nm.mix, PlayerItems.CAST_KIND[itemType]);
  const lvl = playerCraftLevel(player, recipe.skill);
  const q = PlayerItems.qSkill(lvl) * (grade == null ? 0.6 : grade);
  const t = PlayerItems.ITEM_TYPES[itemType] || {};
  let lack = null;
  for (const k in nm.use) if ((player.inventory[k] || 0) + 1e-9 < nm.use[k]) { lack = k; break; }
  send(player.ws, {
    type: 'cast_preview', itemType, grade: grade == null ? null : +grade.toFixed(3), lack,
    use: nm.use,
    attr: Math.round((t.attrScale || 100) * q),
    dura: t.baseDura ? Math.round(t.baseDura * (1 + PlayerItems.DURA_SPAN * q)) : null,
    props: props ? { hardness: Math.round(props.hardness), tough: +props.tough.toFixed(2), mp: Math.round(props.mp),
                     cast: +props.cast.toFixed(2), rho: +props.rho.toFixed(2), split: +props.split.toFixed(3), brittle: +props.brittle.toFixed(3) } : null,
  });
}
function doCraftEquipment(player, itemType, material, rawMix) {
  ensurePlayerItems(player);
  const recipe = EQUIPMENT_RECIPES[itemType];
  if (!recipe) { send(player.ws, { type: 'notice', text: `알 수 없는 장비: ${itemType}` }); return; }
  // ★★[재민 확정 2026-08-29] **시설 게이트.** 종전엔 이 함수가 **어디서나 즉석으로** 돌았다 —
  //   들판 한복판에서 청동검이 나왔다. 그건 §8.5 헌법("제작은 시설 앞의 물리 행위")의 정면 반례다.
  //   단일 재료(깎기·두드리기)는 **작업대**, 배합 주조(녹이기)는 **노**. 창이 다르면 시설도 다르다.
  //   ⚠조잡한 석기(`doCraft` 의 crude_*)는 **그대로 맨손**이다 — 빈손 배치의 계약이라 안 건드린다.
  const _kind = (rawMix && typeof rawMix === 'object' && Object.keys(rawMix).length) ? 'smelt' : 'tool';
  const _fac = facilityFor(player, _kind);
  if (!_fac) {
    send(player.ws, { type: 'notice', text: _kind === 'smelt' ? '🔥 노 앞에서만 녹인다' : '🪵 작업대 앞에서만 만든다 — 통나무 4 · 석재 2 로 짓는다' });
    return;
  }
  if (!_facilityMine(player, _fac.b)) { send(player.ws, { type: 'notice', text: `${_fac.ko}은(는) 내 것이 아니다` }); return; }
  // ── 주조 경로: 금속 여러 개를 배합해 녹인다(품질 = 합금 모델 × 숙련) ──
  if (rawMix && typeof rawMix === 'object' && Object.keys(rawMix).length) {
    if (!recipe.cast) { send(player.ws, { type: 'notice', text: `${recipe.label}은(는) 주조하지 않습니다` }); return; }
    const nm = normalizeCastMix(recipe, rawMix, player.inventory);
    if (nm.err) { send(player.ws, { type: 'notice', text: nm.err }); return; }
    const lvl0 = playerCraftLevel(player, recipe.skill);
    let cinst;
    try { cinst = PlayerItems.craftItem(itemType, lvl0, nm.use); }
    catch (e) { send(player.ws, { type: 'notice', text: `주조 실패: ${e.message}` }); return; }
    cinst.id = genEquipId();
    cinst.mix = {};                                   // 배합 기록(표시·수선용)
    for (const k in nm.mix) cinst.mix[k] = +(nm.mix[k] * 100).toFixed(1);
    cinst.mat = Object.keys(nm.mix).reduce((a, k) => (nm.mix[k] > nm.mix[a] ? k : a), Object.keys(nm.mix)[0]);
    for (const k in nm.use) player.inventory[k] = Math.max(0, +((player.inventory[k] || 0) - nm.use[k]).toFixed(4));
    const alloyNm = Object.entries(cinst.mix).map(([k, v]) => `${k} ${v}%`).join(' · ');
    const rz = _enqueueCraft(player, _fac, 'smelt', cinst, `${PlayerItems.displayItem(cinst)} (${alloyNm})`, recipe.skill);
    if (!rz.ok) { for (const k in nm.use) player.inventory[k] = (player.inventory[k] || 0) + nm.use[k]; send(player.ws, { type: 'notice', text: rz.err }); return; }
    sendInventory(player);
    if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
    void lvl0;
    return;
  }
  if (!recipe.accepts.includes(material)) { send(player.ws, { type: 'notice', text: `${recipe.label}에 못 쓰는 재료: ${material}` }); return; }
  // ★★[T12 지게 2026-09-01] **곁재료(`extra`)** — 이 표의 첫 다품목 장비(지게의 밀삐).
  //   골라 쓰는 주재료와 달리 `extra` 는 **늘 같이 든다**. 없으면 여기서 거절한다.
  //   ⚠거절만 하면 화면이 거짓말한다(버튼이 켜져 있다) ⇒ `_facilityRecipes` 의 `cost` 와
  //     클라의 게이팅에도 같은 곁재료를 실어 보낸다. 세 자리가 **같은 `extra` 하나**를 읽는다.
  const _eqCost = Object.assign({}, recipe.extra || {}, { [material]: (recipe.extra || {})[material] ? ((recipe.extra[material] || 0) + recipe.qty) : recipe.qty });
  for (const [k, n] of Object.entries(_eqCost)) {
    if ((player.inventory[k] || 0) < n) { send(player.ws, { type: 'notice', text: `재료 부족: ${ITEM_LABEL_SERVER[k] || k} ${n} 필요 (보유 ${Math.floor(player.inventory[k] || 0)})` }); return; }
  }
  const have = player.inventory[material] || 0;
  const lvl = playerCraftLevel(player, recipe.skill);
  let inst;
  try { inst = PlayerItems.craftItem(itemType, lvl, { [material]: recipe.qty }); }
  catch (e) { send(player.ws, { type: 'notice', text: `제작 실패: ${e.message}` }); return; }
  inst.id = genEquipId();
  inst.mat = material;   // 대표 재료(수선·표시용)
  const _paid = {};
  for (const [k, n] of Object.entries(_eqCost)) { _paid[k] = player.inventory[k] || 0; player.inventory[k] = _paid[k] - n; }
  const rq = _enqueueCraft(player, _fac, 'tool', inst, PlayerItems.displayItem(inst), recipe.skill);
  if (!rq.ok) { for (const k in _paid) player.inventory[k] = _paid[k]; send(player.ws, { type: 'notice', text: rq.err }); return; }
  void have;
  sendInventory(player);
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
  void lvl;
}

// ★★제작을 **시설에 걸어 둔다**. 완성품 인스턴스는 이미 만들어져 있고(품질은 정본이 그때 정한다),
//   여기서 하는 건 **언제 손에 오는가**를 정하는 것뿐이다. 대기열은 시설에 붙고 lazy 하게 흐른다.
//   ⇒ 접속을 끊어도 진행된다(가마는 밤새 탄다). 수령만 사람이 한다.
function _enqueueCraft(player, fac, kind, inst, label, skill) {
  const r = Facility.enqueue(fac.b, {
    id: inst.id, kind, label, owner: player.playerId, skill,
    inst,                                   // 완성품 — 꺼낼 때 그대로 장비로 들어간다
  }, Date.now());
  if (!r.ok) return r;
  markBuildingDirty(fac.b);
  const secs = Math.ceil(r.job.ms / 1000);
  send(player.ws, { type: 'notice',
    text: `🪵 ${fac.ko}에 걸었다 — ${label} · ${secs}초${r.ahead ? ` (앞에 ${r.ahead}개)` : ''}` });
  sendCraftQueue(player);
  return r;
}
// 수령 — 끝난 것만, 내 것만, 시설 앞에서.
function doCraftCollect(player, buildingId) {
  ensurePlayerItems(player);
  const b = buildingId ? buildings.get(buildingId) : (facilityFor(player, 'tool') || facilityFor(player, 'smelt') || {}).b;
  if (!b || !Facility.FACILITIES[b.type]) { send(player.ws, { type: 'notice', text: '시설이 없다' }); return; }
  const f = Facility.FACILITIES[b.type];
  if (Math.hypot(b.x - player.x, b.y - player.y) > f.range + 8) { send(player.ws, { type: 'notice', text: `${f.ko} 앞으로 가야 받는다` }); return; }
  const got = Facility.collect(b, player.playerId, Date.now());
  if (!got.length) {
    const mine = Facility.view(b, Date.now()).filter((j) => j.owner === player.playerId);
    send(player.ws, { type: 'notice', text: mine.length ? `아직 만드는 중 — ${Math.ceil(mine[0].leftMs / 1000)}초 남음` : '받을 게 없다' });
    sendCraftQueue(player); return;
  }
  markBuildingDirty(b);
  for (const j of got) {
    if (j.inst) {
      player.equipment.push(j.inst);
      if (j.skill) player.craftSkill[j.skill] = (player.craftSkill[j.skill] || 0) + 1;   // 유효 완성품 = xp
      // ★제작 이력(§8.4 스킬 패널 대기 — 지금은 **데이터만** 쌓는다)
      player.craftLog = player.craftLog || {};
      const cl = player.craftLog[j.inst.type] || (player.craftLog[j.inst.type] = { n: 0, bestQ: 0 });
      cl.n++; cl.bestQ = Math.max(cl.bestQ, j.inst.q || 0);
    } else if (j.items) {
      for (const [k, n] of Object.entries(j.items)) player.inventory[k] = (player.inventory[k] || 0) + n;
      // ★★[보존 배치 2026-08-31] 로트 품목은 **장부에도 적는다** — 취득일 = **완성일**.
      //   `reconcile` 이 남는 몫을 "오늘"로 잡는 근사에 맡기지 않는다: 그러면 사흘 전에 다 마른
      //   건어물이 수령한 날 갓 만든 것으로 둔갑한다(건조대가 정지 상자가 되는 바로 그 구멍).
      if (j.lotItems) {
        const _d = _gameDayAt(j.doneAt || Date.now());
        for (const [k, n] of Object.entries(j.lotItems)) if (Lots.isLot(k)) Lots.note(player, k, n, _d);
      }
    } else if (j.dish) {
      j.dish.craftedAtMs = Date.now();   // ★신선도는 **꺼낸 때**부터 — 불 위에서 식지 않는다
      player.dishes.push(j.dish);
      player.craftSkill.cooking = (player.craftSkill.cooking || 0) + 1;
    }
  }
  sendInventory(player);
  sendEquipment(player); sendDishes(player); sendCraftQueue(player);
  send(player.ws, { type: 'notice', text: `✅ ${f.ko}에서 받았다 — ${got.map((j) => j.label).join(' · ')}` });
  if (canPersist(player)) savePlayer(player);
}
// 장착: 슬롯당 1개(교체). 파손 불가.
function doEquipItem(player, id) {
  ensurePlayerItems(player);
  const inst = findEquip(player, id);
  if (!inst) { send(player.ws, { type: 'notice', text: '해당 장비 없음' }); return; }
  if (inst.broken || inst.dura === 0) { send(player.ws, { type: 'notice', text: '파손된 장비 — 수선 필요' }); return; }
  const def = EQUIPMENT_RECIPES[inst.type];
  const slot = def ? def.slot : inst.type;
  player.equipSlots[slot] = inst.id;
  sendEquipment(player);
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}
// 해제: 슬롯 비움.
function doUnequipItem(player, slot) {
  ensurePlayerItems(player);
  if (player.equipSlots[slot]) {
    delete player.equipSlots[slot];
    sendEquipment(player);
    if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
  }
}
// 수선: 재료(절반)+숙련으로 내구 회복(설계 §5 — 인스턴스별이라 econ 전역 피드백 0).
function doRepairEquipment(player, id, material) {
  ensurePlayerItems(player);
  const inst = findEquip(player, id);
  if (!inst || inst.dura == null) { send(player.ws, { type: 'notice', text: '수선 불가' }); return; }
  const def = EQUIPMENT_RECIPES[inst.type];
  if (!def) { send(player.ws, { type: 'notice', text: '수선 불가' }); return; }
  // ★주조품은 **자기 배합 그대로** 때운다 — 청동검을 순동으로 때우면 때운 자리가 무르다.
  //   (재료를 지정하지 않았고 배합 기록이 있을 때. 지정하면 옛 단일재료 경로.)
  if (!material && inst.mix && Object.keys(inst.mix).length) {
    const cost0 = Math.max(1, Math.floor(def.qty / 2));
    const nm = normalizeCastMix({ qty: cost0 }, inst.mix, player.inventory);
    if (nm.err) { send(player.ws, { type: 'notice', text: `수선 ${nm.err}` }); return; }
    const lvl0 = playerCraftLevel(player, def.skill);
    for (const k in nm.use) player.inventory[k] = Math.max(0, +((player.inventory[k] || 0) - nm.use[k]).toFixed(4));
    PlayerItems.repairItem(inst, lvl0, nm.use);
    sendInventory(player);
    sendEquipment(player);
    send(player.ws, { type: 'notice', text: `${PlayerItems.displayItem(inst)} 수선 (같은 배합)` });
    if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
    return;
  }
  const mat = material || inst.mat;
  if (!def.accepts.includes(mat)) { send(player.ws, { type: 'notice', text: '수선에 못 쓰는 재료' }); return; }
  const cost = Math.max(1, Math.floor(def.qty / 2));
  const have = player.inventory[mat] || 0;
  if (have < cost) { send(player.ws, { type: 'notice', text: `수선 재료 부족: ${mat} ${cost} 필요` }); return; }
  const lvl = playerCraftLevel(player, def.skill);
  player.inventory[mat] = have - cost;
  PlayerItems.repairItem(inst, lvl, { [mat]: cost });
  sendInventory(player);
  sendEquipment(player);
  send(player.ws, { type: 'notice', text: `${PlayerItems.displayItem(inst)} 수선` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}
// 장비 효과 발현(설계 §8-3): 무기 attack→전투·도구 efficiency→노동. 장비 미장착 시 기존 행동 불변(additive).
const WEAPON_EQUIP_ATK_SCALE = 0.2;  // weapon attack(24~100) → 데미지 +5~+20 (기본10 대비 명장 무기 실감)
const TOOL_EQUIP_EFF_SCALE = 0.03;   // tool efficiency(24~100) → 채집 dmg +1~+3 (노동 절약)
// 밤 추위(설계: 옷 방한→coldStress 완화의 플레이어층 아날로그 — econ coldStress는 NPC 전용이라 별개 신설). 방한·모닥불이 완화.
// ⚠**사장됨** — 같은 뜻의 값이 `body.js` 의 `BODY_WARMTH_FULL`·`BODY_COLD_HUNGER_EXTRA` 로 옮겨갔다.
const COLD_WARMTH_FULL__DEAD_SEE_body_js = 50;
const COLD_NIGHT_EXTRA__DEAD_SEE_body_js = 0.6;
const COLD_CLOTH_WEAR_MS = 30000; // 추위 노출 시 옷 마모 간격(30초당 내구 1 — 서서히)
// ★★[T12 지게 2026-09-01] 지게 마모 간격 — **짐을 지고 걸을 때만** 돈다(옷이 추울 때만 닳는 것과 같은 규약).
//   ★값은 찍지 않고 **유도했다**: 지게 하나로 자염 원정(광장→바다 편도 16.1분 · 왕복 32분)을
//     몇 번 다닐 수 있어야 물건이 뜻을 갖나. 2분당 1 ⇒ Lv0 지게(내구 117) = 234분 = **왕복 7.3회**,
//     Lv10(142) = 284분 = **8.9회**. 한 계절에 한 번쯤 다시 엮는 물건이 된다.
//   (30초당 1 이면 왕복 1.8회라 원정 한 번에 지게가 부서진다 — 그건 지게가 아니라 소모품이다.)
const CARRIER_WEAR_MS = (() => { const v = parseFloat(process.env.CARRY_CARRIER_WEAR_MS); return Number.isFinite(v) && v > 0 ? v : 120000; })();
// 슬롯에 장착된 장비 인스턴스 조회
function getEquippedEquipment(player, slot) {
  if (!player.equipSlots || !player.equipSlots[slot]) return null;
  return (player.equipment || []).find(e => e.id === player.equipSlots[slot]) || null;
}
// 모닥불 근처(100px)면 따뜻 — 밤 추위 완화. qtBuildings 사용(비싸지 않게).
// ★[신체 상태 §7] 실내인가 — **방 판정 정본**(`server/rooms.js`)에게 물어본다.
//   클라도 서버도 이 하나만 본다(배치 18 규약: 방 판정은 서버가 정본, 클라 재계산 금지).
// ★★[부패 2차 2026-09-01] **자리 판정 정본** — 이 건물/자리는 `spoil.PLACES` 의 어느 칸인가.
//   ⚠배율을 여기 적지 마라. 이름만 고르고 수는 `spoil.js` 가 갖는다(사본 금지).
function _placeKeyOfBuilding(b) {
  if (!b) return 'ground';
  if (b.type === 'guild_granary') return 'granary';
  if (b.type === 'chest') return isIndoorAt({ x: b.x, y: b.y, floor: b.floor || 0 }) ? 'chest_in' : 'chest';
  return 'ground';
}
function _placeKeyOfGround(x, y, floor) {
  return isIndoorAt({ x, y, floor: floor || 0 }) ? 'indoor' : 'ground';
}
function isIndoorAt(p) {
  try {
    const cx = Math.floor(p.x / 32), cy = Math.floor(p.y / 32);
    return !!Rooms.roomAt(cx, cy, p.floor || 0);
  } catch (e) { return false; }
}
// ★계절 추위 0..1 — 계절 정본은 `server/events.js seasonOf`(econ 과 동기 계약이 적힌 그 한 줄)를 **그대로 부른다**.
//   여기서 계절 산수를 또 쓰면 그게 세 번째 사본이다.
let _seasonCache = { day: -1, v: 0 };
// ★게임일은 **존 자체 시계**로 센다 — `ENABLE_VILLAGES=0` 이어도 계절·로트 나이는 있어야 하기 때문이다
//   (마을 시뮬에 의존시키면 하네스마다 계절이 사라진다). 이 한 줄이 존의 게임일 정본이다.
// ★★[하네스 결함 수리 2026-08-31 · 부패 배치가 드러냈다] **`__e2e_day_freeze` 가 반쪽이었다.**
//   `e2e-trade` 는 `VILLAGE_DAY_MS=500`(하루 0.5초)으로 마을 시뮬을 데운 뒤 날을 얼리고 상호작용을
//   잰다. 그런데 얼린 건 **마을 시뮬의 날**(`villages.state.dayFreeze`)뿐이었고, 플레이어 층의
//   시계인 이 함수는 **벽시계 파생이라 계속 돌았다** — 초당 두 날씩.
//   여태는 티가 안 났다. 로트의 나이는 화면에 "N일 전"으로만 쓰였으니까.
//   부패 곡선이 들어온 지금은 **초당 두 날**이 곧 "생선이 1.25초 만에 상한다"는 뜻이고,
//   그래서 하네스가 거래하려던 생선이 거래 전에 썩었다(실제로 e2e-trade ④⑤ 5건이 그렇게 죽었다).
//   ⇒ **제품이 아니라 하네스가 틀렸다**(`test-guest-rejoin` 이 걸음 속도를 상수로 박아 둔 그 족보).
//     "날을 멈춘다"고 했으면 **플레이어 시계도 멈춰야** 한다. 여기서 그렇게 고친다.
//   ⚠**E2E_GIVE 게이트 뒤에서만** 설정된다 — 기본 부팅에선 `_e2eDayFrozen` 이 영원히 null 이라
//     아래 두 함수는 종전과 **비트 동일**하다.
let _e2eDayFrozen = null;   // 얼린 순간의 날(raw)
let _e2eDayOffset = 0;      // 얼어 있던 날수 누적 — 해동해도 시간이 건너뛰지 않는다
function _rawGameDay(ms) {
  const t = (ms == null) ? Date.now() : Number(ms);
  return Math.floor((t - ((WORLD && WORLD.worldEpoch) || 0)) / _SEASON_DAY_MS);
}
function zoneGameDay() { return (_e2eDayFrozen !== null ? _e2eDayFrozen : _rawGameDay()) - _e2eDayOffset; }
// ★[보존 배치 2026-08-31] **임의 시각의 게임일.** `zoneGameDay` 와 같은 산수를 쓰되 지금이 아닌
//   때를 묻는다 — 보존 산출의 취득일(=완성일)이 이걸 부른다. 수를 두 벌로 적지 않으려고 나눴다.
function _gameDayAt(ms) { return _rawGameDay(ms) - _e2eDayOffset; }
// 테스트 전용 — 위 주석 참조. 얼면 멈추고, 녹으면 **멈춰 있던 만큼 빼고** 이어 센다.
function __e2eFreezeZoneDay(on) {
  if (on) { if (_e2eDayFrozen === null) _e2eDayFrozen = _rawGameDay(); }
  else if (_e2eDayFrozen !== null) { _e2eDayOffset += _rawGameDay() - _e2eDayFrozen; _e2eDayFrozen = null; }
  return { frozen: _e2eDayFrozen !== null, day: zoneGameDay() };
}
// ★★[T1 §2-④ 2026-09-01] **이벤트 루프 지연** — RTT 스파이크의 직접 원인을 서버 쪽에서 그대로 재는 자.
//   `econ_day 2000ms` 는 "그 일이 2초 걸렸다"만 말한다. 루프가 실제로 **얼마나 막혔나**는 이게 답한다.
//   조각내기가 통했다면 총 일 시간은 그대로여도 **p99 가 내려간다** — 그게 이 배치의 판정선이다.
let _loopMon = null;
try { _loopMon = require('perf_hooks').monitorEventLoopDelay({ resolution: 10 }); _loopMon.enable(); } catch (e) { _loopMon = null; }
function loopDelayStats(reset) {
  if (!_loopMon) return null;
  const ms = (v) => +(v / 1e6).toFixed(2);
  const out = { p50: ms(_loopMon.percentile(50)), p95: ms(_loopMon.percentile(95)), p99: ms(_loopMon.percentile(99)), max: ms(_loopMon.max), n: _loopMon.count };
  if (reset) _loopMon.reset();
  return out;
}
// ★[RTT 상관 계측] 무거운 작업 기록 — 최근 400건 링. `/perf` 가 그대로 내준다.
//   ⚠계측기지 손잡이가 아니다: 아무 동작도 바꾸지 않는다(관측자 규약).
const _perfRing = [];
function perfMark(kind, ms, extra) {
  if (!(ms >= 0)) return;
  _perfRing.push(Object.assign({ t: Date.now(), kind, ms: Math.round(ms * 100) / 100 }, extra || {}));
  if (_perfRing.length > 400) _perfRing.splice(0, _perfRing.length - 400);
}
// ★★[달력 2026-08-30 재민 확정] 화면에 나갈 연·계절·일. **새 매핑을 여기서 만들지 않는다** —
//   `Events.calendarOf` 가 econ `seasonOf` 하나만 보고 전부 유도한다(상수 0개).
//   날짜는 **econ 게임일**을 쓴다(마을 재고창과 같은 시계 — 화면에 날짜가 둘이면 그게 곧 거짓말이다).
//   마을 시뮬이 꺼진 존에서는 벽시계 파생(`zoneGameDay`)으로 떨어진다.
// ★[테스트 전용 · `E2E_GIVE=1` 일 때만 세워진다] 온도 배선을 재려면 **겨울 밤**이 필요한데,
//   실기로는 한 해가 6시간이고 밤이 12분이라 하네스가 그걸 기다릴 수 없다.
//   ⇒ `gameDayNow`·`bodyNight` 만 갈아끼운다(하늘 렌더러·econ 틱은 그대로 — 세계를 바꾸지 않는다).
//   ⚠기본 부팅에선 이 값을 세우는 코드 경로가 아예 없다(핸들러 분기가 `E2E_GIVE` 안에서만 존재).
let _e2eClock = null;

// ★★[온도 곡선 2026-08-31] **날짜 시계는 하나다.** 달력이 "겨울 12일"이라 말하는 그날과
//   몸이 느끼는 온도의 그날이 다르면, 그건 화면이 거짓말을 하는 것이다(두 시계는 영구히 어긋난다 —
//   `zoneGameDay` 는 벽시계 파생, econ `world.day` 는 틱 카운터라 따라잡기가 없다).
//   ⇒ 달력·온도·계절 힌트가 **전부 이 함수 하나**를 쓴다. 새 날짜 해석기를 만들지 마라.
function gameDayNow() {
  if (_e2eClock && Number.isFinite(_e2eClock.day)) return _e2eClock.day;
  let d = null;
  try { d = (SimVillages.econDay ? SimVillages.econDay() : null); } catch (e) {}
  if (d === null || d === undefined) d = zoneGameDay();   // 마을 시뮬이 없는 존만 벽시계로 떨어진다
  return d;
}
function calendarNow() {
  try { return require('./events').calendarOf(gameDayNow()); } catch (e) { return null; }
}
// 몸·날씨가 보는 밤 — 평시엔 `isNight` 그대로다(하네스만 이걸 갈아끼운다).
function bodyNight(now) {
  if (_e2eClock && typeof _e2eClock.night === 'boolean') return _e2eClock.night;
  return isNight(now);
}
// ★[온도 곡선] HUD 가 보여 줄 바깥 날씨 한 줄 — 옷·불·실내·마을을 **뺀** "밖이 얼마나 추운가".
//   ⚠몸 상태(무들)와 다른 것이다: 무들은 "내가 얼마나 추운가", 이건 "밖이 얼마나 추운가"다.
//   ⚠클라가 날짜→온도 매핑을 **갖지 않는다**(달력과 같은 규약 — 사본 금지). 서버가 문장 재료를 준다.
let _wxHint = { at: 0, v: null };
function weatherNow() {
  const now = Date.now();
  if (_wxHint.v && now - _wxHint.at < 1000) return _wxHint.v;
  let v = null;
  try { v = require('./weather').hintOf(gameDayNow(), bodyNight(now)); } catch (e) { v = null; }
  _wxHint = { at: now, v };
  return v;
}
// 그 플레이어가 보는 날씨 — 바깥 날씨 + **지금 마을이 얼마나 막아 주는가**.
//   ★비네트가 원인 축을 말하게 하는 것과 같은 규약: 화면이 "왜 덜 추운지"를 말해야 한다.
function weatherFor(p, now) {
  const w = weatherNow();
  if (!w) return null;
  // ★[옷 티어 2026-08-31] 지금 입은 옷이 **몇 ℃ 를 벌어 주는지** — 화면이 그걸 말해야
  //   "가죽옷을 사야 하나"가 판단이 된다(비네트가 원인 축을 말하게 하는 규약과 같은 자리).
  let insC = 0;
  try {
    const cl = getEquippedEquipment(p, 'clothes');
    insC = Body.warmthInsC((cl && cl.attrs && cl.attrs.warmth) || 0);
  } catch (e) {}
  const sh = villageShelterOf(p, now || Date.now());
  // ★`cut` 은 "마을이 실제로 몇 % 깎아 주는가" — 클라가 `COLD_VILLAGE_SHELTER` 사본을 갖지 않게 여기서 낸다.
  const cut = +(Math.max(0, Math.min(1, sh)) * Body.CFG.COLD_VILLAGE_SHELTER).toFixed(4);
  // ★[바람 노출] 서버가 계산해 **숫자로** 보낸다 — 클라는 이 배치에서 아무것도 그리지 않지만
  //   (HUD 바람 힌트는 회부 · T38), 하네스가 "그 자리가 실제로 노출됐는가"를 물을 수 있어야 한다.
  //   ⚠클라 사본 금지 규약과 같은 자리다: 지형·계절 산수는 전부 여기서 끝난다.
  const day = gameDayNow();
  const wexp = windExposureOf(p, now || Date.now(), day, sh);
  return Object.assign({}, w, { shelter: sh, cut, insC: +insC.toFixed(2),
    wind: +Wind.seasonWind(day).toFixed(3), exp: wexp });
}
// ★★[천장 해제 2026-08-31] 그 자리의 고도(km) — econ 기온 감률(−6.5℃/km)의 입력.
//   ★★실측 보고(이 배치 §0): **지금은 언제나 0 이다. 그게 거짓말이 아니라 세계의 사실이다.**
//     ① 산 높이 캐논이 **35m** 다(client.js:2514 "산 높이 35m 확정") ⇒ 감률 기여 0.23℃ ≈ 추위 0.007.
//     ② 바위 셀은 **통행 불가**다(`isRockTileLocal` — Phase 5-H) ⇒ 플레이어가 산 위에 설 수 없다.
//        고개(pass)는 걸을 수 있지만 그건 산을 **뚫고 지나가는 길**이라 고도가 아니다.
//   ⇒ 그래서 **없는 고도를 지어내지 않는다.** 배선만 정본으로 살려 두고(모델은 `test-body ⑮㉢`가
//     elevKm 스윕으로 매번 확인한다), 걸을 수 있는 고도가 생기는 날 **이 함수 하나만** 고치면 된다.
//   ⚠여기에 "산 근처면 0.5km" 같은 대리값을 넣지 마라 — 그건 지형이 아니라 소원이다.
function elevKmAt(p) { return 0; }
// ★[겨울 난이도] 마을 완충 — 플레이어별 캐시(초당 1회·64px 이동 이상일 때만 재계산).
//   마을 스캔은 싸지만(≤50개) 매 틱 전원분은 낭비다. 완충은 걸어서 바뀌는 값이라 1초면 충분하다.
const _SHELTER_TTL_MS = 1000, _SHELTER_MOVE_PX = 64;
function villageShelterOf(p, now) {
  const c = p._shelter;
  if (c && (now - c.at) < _SHELTER_TTL_MS && Math.hypot(p.x - c.x, p.y - c.y) < _SHELTER_MOVE_PX) return c.v;
  let v = 0;
  try { v = (SimVillages.shelterAt ? SimVillages.shelterAt(p.x, p.y) : 0) || 0; } catch (e) { v = 0; }
  p._shelter = { at: now, x: p.x, y: p.y, v };
  return v;
}
// ★★[바람 노출 2026-09-01 재민 확정 ④] 지형 술어 주입 — `server/wind.js` 는 지형 파일을 직접 안 연다.
//   **정본 술어를 그대로 넘긴다**(사본 금지 · 족보 ㊻). `isRockTileLocal` 은 이미 타일로 양자화하고
//   `TERRAIN_TILE_CACHE` 메모까지 타므로, 노출 레이 표본이 그 메모의 덕을 그대로 본다.
const Wind = require('./wind');
Wind.bindTerrain({
  isRock: (x, y) => isRockTileLocal(x, y),
  forestMult: (x, y) => { try { return _terrain.getForestMultiplier(ZONE_ID, x, y); } catch (e) { return 1; } },
});
// 그 플레이어가 선 자리의 바람 노출도 0..1 — 완충과 같은 캐시 규약(초당 1회·64px 이동 이상).
//   ★셀 몫(레이 막힘·숲)은 `wind.js` 가 셀 캐시에 담고, 여기서는 **계절 곱**만 다시 한다.
const _WIND_TTL_MS = 1000, _WIND_MOVE_PX = 64;
function windExposureOf(p, now, day, shelter) {
  const c = p._windExp;
  if (c && (now - c.at) < _WIND_TTL_MS && c.day === day
      && Math.hypot(p.x - c.x, p.y - c.y) < _WIND_MOVE_PX) return c.v;
  let v = 0;
  const t0 = Date.now();
  try { v = Wind.exposureAt(p.x, p.y, day, shelter) || 0; } catch (e) { v = 0; }
  const dt = Date.now() - t0;
  if (dt >= 5) perfMark('wind_exposure', dt);
  p._windExp = { at: now, x: p.x, y: p.y, day, v };
  return v;
}
// ★★[무게 배치] 걸음 배율의 **정본 하나** — 서버 이동과 클라 예측이 같은 수를 써야 러버밴딩이 안 난다.
//   신체(§7) × 과적, 곱 폭주는 바닥에서 자른다. 이 함수를 안 거치는 배율 계산을 새로 만들지 마라.
function moveMultOf(p) { return Carry.combinedMove(Body.effects(p).moveMult, Carry.effects(p).moveMult); }
function seasonColdNow() {
  try {
    const day = zoneGameDay();
    if (_seasonCache.day === day) return _seasonCache.v;
    const se = require('./events').seasonOf(day);
    // 겨울 1 · 가을/봄 0.35 · 여름 0 — 옷·모닥불 수요의 계절 곡선(§7 "추위는 계절 배율·옷감 수요와 연결")
    const v = se === 'winter' ? 1 : (se === 'summer' ? 0 : 0.35);
    _seasonCache = { day, v };
    return v;
  } catch (e) { return 0; }
}
function isNearCampfire(p) {
  const near = qtBuildings ? qtBuildings.queryCircle(p.x, p.y, 100) : Array.from(buildings.values());
  for (const b of near) { if (b.type === 'campfire' && Math.hypot(b.x - p.x, b.y - p.y) < 100) return true; }
  return false;
}
// 장비 사용 마모(설계 §5: 인스턴스별이라 econ 전역 피드백 0). 파손 시 자동 해제·알림. wear마다 저장 안 함(도구 레거시 동형 — 성능).
function wearEquipment(player, slot, amount) {
  const inst = getEquippedEquipment(player, slot);
  if (!inst || inst.dura == null) return;
  PlayerItems.wearItem(inst, amount || 1);
  if (inst.broken || inst.dura === 0) {
    delete player.equipSlots[slot];   // 파손 시 자동 해제(수선 전까지 재장착 불가)
    send(player.ws, { type: 'notice', text: `${(EQUIPMENT_RECIPES[inst.type] && EQUIPMENT_RECIPES[inst.type].label) || inst.type} 파손 — 수선 필요` });
    if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
  }
  sendEquipment(player);
}

// ── 플레이어 구매/판매 경계계약 (마을 품질 EMA 샘플/용해 — 설계 §4) ──
const SHOP_RANGE_PX = 260;   // 마을 중심 이 반경 안이어야 거래(마을광장 근처)
const EQUIP_TYPE_QKEY = { clothes: 'clothQ', weapon: 'weapQ', armor: 'weapQ', tool: 'toolQ' };
function nearestVillageQ(player) {
  try { return SimVillages.villageQualityAt(player.x, player.y, SHOP_RANGE_PX); } catch (e) { return null; }
}
function doShopInfo(player) {
  send(player.ws, { type: 'shop_info', village: nearestVillageQ(player) });
}
// 구매: 마을 장인에게 재료 맡겨 *마을 품질*로 제작받음(마을 EMA ±소분산 실체화 — 설계 §4). 마을이 나보다 숙련되면 이득.
function doShopBuy(player, itemType, material) {
  ensurePlayerItems(player);
  const recipe = EQUIPMENT_RECIPES[itemType];
  if (!recipe) { send(player.ws, { type: 'notice', text: `알 수 없는 장비: ${itemType}` }); return; }
  const vq = nearestVillageQ(player);
  if (!vq) { send(player.ws, { type: 'notice', text: '거래하려면 마을 근처(마을광장)로 가세요' }); return; }
  if (!recipe.accepts.includes(material)) { send(player.ws, { type: 'notice', text: `${recipe.label}에 못 쓰는 재료` }); return; }
  const have = player.inventory[material] || 0;
  if (have < recipe.qty) { send(player.ws, { type: 'notice', text: `재료 부족: ${material} ${recipe.qty} 필요` }); return; }
  const qkey = EQUIP_TYPE_QKEY[itemType];
  const villageQ = (vq[qkey] != null ? vq[qkey] : 0.6);   // 마을 품질 EMA(없으면 기본)
  let inst;
  // ★[옷 티어] 가져간 재료를 넘긴다 — 장인이 모피로 지으면 갖옷이 나와야 한다(이름 = 성능).
  try { inst = PlayerItems.materializeFromVillage(itemType, villageQ, Math.random, { [material]: recipe.qty }); }
  catch (e) { send(player.ws, { type: 'notice', text: `구매 실패: ${e.message}` }); return; }
  inst.id = genEquipId(); inst.mat = material;
  player.inventory[material] = have - recipe.qty;
  player.equipment.push(inst);
  sendInventory(player);
  sendEquipment(player);
  send(player.ws, { type: 'notice', text: `${vq.name} 장인 구매: ${PlayerItems.displayItem(inst)}` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}
// 판매: 장비 용해 → 재료 절반 회수(설계 §4 판매=용해). ★마을 EMA 넛지(sellNudge)는 econ write라 @1500 검증 후 별도 배선 — 현재 미적용(econ 무접촉 유지).
function doShopSell(player, id) {
  ensurePlayerItems(player);
  const idx = player.equipment.findIndex(e => e.id === id);
  if (idx < 0) { send(player.ws, { type: 'notice', text: '해당 장비 없음' }); return; }
  const inst = player.equipment[idx];
  const recipe = EQUIPMENT_RECIPES[inst.type];
  const mat = inst.mat || (recipe && recipe.accepts[0]);
  const refund = recipe ? Math.max(1, Math.floor(recipe.qty / 2)) : 1;
  const slot = recipe ? recipe.slot : inst.type;
  if (player.equipSlots[slot] === id) delete player.equipSlots[slot];   // 장착 중이면 해제
  player.equipment.splice(idx, 1);
  // ★주조품을 녹이면 **넣었던 배합 그대로** 돌아온다(다시 녹인 쇳물이니까).
  let backTxt = `${mat || '재료'} ×${refund}`;
  if (inst.mix && Object.keys(inst.mix).length) {
    let tot = 0; for (const k in inst.mix) tot += inst.mix[k];
    const parts = [];
    for (const k in inst.mix) {
      const amt = +(refund * inst.mix[k] / tot).toFixed(3);
      if (amt <= 0) continue;
      player.inventory[k] = +((player.inventory[k] || 0) + amt).toFixed(4);
      parts.push(`${k} ${amt}`);
    }
    backTxt = parts.join(' · ');
  } else if (mat) player.inventory[mat] = (player.inventory[mat] || 0) + refund;
  sendInventory(player);
  sendEquipment(player);
  send(player.ws, { type: 'notice', text: `용해: ${(recipe && recipe.label) || inst.type} → ${backTxt}` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}

// ═══ ★★[재민 확정 2026-08-02b] 철제 위세품 판매 — "세계 최초의 철검"의 값 ═══════
//   ★성능축은 손대지 않는다. 연철검은 청동검보다 못하고(등급 0.75 < 1.09) 그게 고증이다.
//     대신 **보유축**을 연다: 청동기 사람에게 철검은 처음 보는 물건이고, 처음 보는 물건의 값은
//     성능이 아니라 위세가 매긴다. 옥·호피와 같은 프레임(보유 자체가 효용 = 유령 수요 아님).
//   ★주괴·정광엔 프리미엄이 **절대** 붙지 않는다 — 완성품만이다(재민 확정).
//     그래야 "안 쓰는 철을 사오는" 2026-08-01 의 그 버그가 이름만 바꿔 돌아오지 않는다.
//   ★NPC 는 iron_relic 을 생산하지 않는다. 세상에 들어오는 통로는 이 함수 하나뿐이고,
//     그래서 세계 재고가 곧 "몇 자루 나왔나"다 — v2 유효수요 상한이 희소성을 자동 반영한다.
const RELIC_MATS = new Set(['iron', 'meteoric_iron']);
function doSellIronRelic(player, id) {
  ensurePlayerItems(player);
  const idx = player.equipment.findIndex(e => e.id === id);
  if (idx < 0) { send(player.ws, { type: 'notice', text: '해당 장비 없음' }); return; }
  const inst = player.equipment[idx];
  // ★재질 판정 — 주조품(mix)이면 철 비중이 과반이어야 '철기'다. 단일 재료면 그 재료.
  let isIron = RELIC_MATS.has(inst.mat);
  if (!isIron && inst.mix && Object.keys(inst.mix).length) {
    let tot = 0, fe = 0;
    for (const k in inst.mix) { tot += inst.mix[k]; if (RELIC_MATS.has(k)) fe += inst.mix[k]; }
    isIron = tot > 0 && fe / tot > 0.5;
  }
  if (!isIron) { send(player.ws, { type: 'notice', text: '철기가 아니다 — 위세품으로 쳐주지 않는다(용해는 판매 버튼)' }); return; }
  const q = (inst.attrs && inst.attrs.__q != null) ? inst.attrs.__q : (inst.q != null ? inst.q / 100 : 1);
  let r;
  try { r = SimVillages.lifeSellIronRelic(player.x, player.y, SHOP_RANGE_PX, { quality: q }); }
  catch (e) { send(player.ws, { type: 'notice', text: `판매 실패: ${e.message}` }); return; }
  if (!r || r.err) { send(player.ws, { type: 'notice', text: r ? r.err : '판매 불가' }); return; }
  player.equipment.splice(idx, 1);
  for (const k in player.equipSlots) if (player.equipSlots[k] === id) delete player.equipSlots[k];
  const parts = [];
  for (const k in r.pay) { player.inventory[k] = +((player.inventory[k] || 0) + r.pay[k]).toFixed(3); parts.push(`${ITEM_LABEL_SERVER[k] || k} ${r.pay[k]}`); }
  sendInventory(player);
  sendEquipment(player);
  send(player.ws, { type: 'notice',
    text: `🗡️ ${r.village}에 철기를 넘겼다 — ${parts.join(' · ') || '(대금 없음)'}  · 이 마을 철기 ${r.relics}점` });
  console.log(`[${ZONE_ID}] 🗡️ ${player.name} → ${r.village} 철제 위세품 판매 (값 ${r.price} · 대금가치 ${r.paidValue})`);
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}

function doCraft(player, recipeName) {
  const recipe = RECIPES[recipeName];
  if (!recipe) {
    send(player.ws, { type: 'notice', text: `알 수 없는 레시피: ${recipeName}` });
    return;
  }
  // ★[2026-08-28] **일반 cost** — 잔가지·자갈·풀처럼 나무/돌이 아닌 재료도 받는다(조잡한 석기).
  //   옛 `{wood, stone}` 표기는 `cost` 로 흡수돼 있으므로 이 한 줄이 두 경로를 다 덮는다.
  const cost = recipe.cost || { wood: recipe.wood || 0, stone: recipe.stone || 0 };
  const lack = Object.entries(cost).filter(([k, v]) => (player.inventory[k] || 0) < v);
  if (lack.length) {
    const need = Object.entries(cost).map(([k, v]) => `${ITEM_LABEL_SERVER[k] || k} ${v}`).join(', ');
    send(player.ws, { type: 'notice', text: `${recipe.label} 제작에는 ${need} 필요` });
    return;
  }
  for (const [k, v] of Object.entries(cost)) player.inventory[k] = (player.inventory[k] || 0) - v;
  // 14.53: 새 instance 추가 (자동 장착 X — 사용자가 인벤에서 직접 착용)
  if (!player.toolItems) player.toolItems = [];
  const mx = TOOL_MAX_DURABILITY[recipeName] || 100;
  const inst = { id: genToolId(), type: recipeName, d: mx, max: mx };
  player.toolItems.push(inst);
  sendInventory(player);
  send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
  send(player.ws, { type: 'notice', text: `${recipe.label} 제작 완료 (인벤에 추가)` });
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어
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
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
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
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
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
  if (canPersist(player)) savePlayer(player);   // ★[배치 14 ②] 정본 술어 — 영속 게스트도 저장된다
}

// ═══════════════════════════════════════════════════════════════════
// 광맥 채굴 — 셀별 번영도 (lazy timestamp refill). 틱 없음, 채굴 시에만 계산.
// ═══════════════════════════════════════════════════════════════════
const Specialty = require('./specialty');
// ═══════════════════════════════════════════════════════════════════════════
// 광맥 셀 재고 — 11차 전면 재설계 [재민 확정]
// ═══════════════════════════════════════════════════════════════════════════
//   "cx_cy" → { s: 잔여 재고(0..1000), t: 마지막 갱신 ms, w: 누적 타수(0..59) }
//   안 판 셀은 저장하지 않는다(암묵적으로 만땅) — 테이블을 작게 유지.
//   · s(재고) = 그 셀에서 앞으로 나올 돌덩이 수. 1000 = 1m²를 130cm 판 양.
//   · w(타수)는 **셀에 쌓인다**(플레이어별이 아니다) ⇒ 두 사람이 같은 셀을 파면
//     각자 30타씩 60타를 채워 덩이가 나온다 = **2인 1조 협업이 규칙에서 저절로 나온다**.
//     (Great Orme 불질 채광 고증: 한 명이 불을 지피고 한 명이 물을 붓는 2인 작업)
const minedCells = new Map();

{ // 부팅: DB에서 파인 셀 로드 (구 스키마 prosperity(0..100) → 신 재고(0..1000) 이행)
  try {
    let migrated = 0;
    for (const r of db.getAllMinedCells()) {
      let s = r.prosperity, w = r.swings || 0;
      if (s <= 100 && Specialty.ORE_K > 100 && !r.migrated_v11) { s = s * (Specialty.ORE_K / 100); migrated++; }   // 구 0~100 → 신 0~1000 비율 보존
      minedCells.set(r.cell_key, { s, t: r.last_t, w, kg: r.kgsum || 0 });
    }
    if (minedCells.size) console.log(`[${ZONE_ID}] 광맥 파인 셀 ${minedCells.size}개 로드` + (migrated ? ` (구 번영도 ${migrated}개 → 재고 비율 이행)` : ''));
  } catch (e) { console.log(`[${ZONE_ID}] mined_cells 로드 실패: ${e.message}`); }
}
// [배치 20 B] 동적 토양치 — minedCells 적재 **뒤에** 띄운다(채굴 거울 씨앗이 그걸 읽는다).
//   지형 술어는 **정본 래퍼를 주입**한다: soil.js 는 terrain 을 직접 읽지 않는다
//   (지형 데이터·콜라이더·자원 스폰·econ 기준선 무접촉을 모듈 경계로 강제).
Soil.init({
  zoneId: ZONE_ID, cellsW: Math.ceil(ZONE.zoneWidth / 32), cellsH: Math.ceil(ZONE.zoneHeight / 32),
  epoch: WORLD.worldEpoch || 0, dayMs: parseInt(process.env.VILLAGE_DAY_MS || '', 10) || WORLD.dayLengthMs, broadcast,
  kindAt: (cx, cy) => (isWaterTileLocal(cx * 32 + 16, cy * 32 + 16) ? 'water'
                     : (isRockTileLocal(cx * 32 + 16, cy * 32 + 16) ? 'rock' : 'land')),
  oreSeed: function* () {   // 정본에서 **읽기만** 한다. 키는 'cx_cy'.
    for (const [key, rec] of minedCells) {
      const p = key.split('_'); if (p.length !== 2) continue;
      yield [+p[0], +p[1], rec.s, Specialty.ORE_K];
    }
  },
});
// 게임일 길이(리젠 적분의 시간축). zone-config WORLD와 같은 원천.
const _ORE_DAY_MS = (WORLD && WORLD.dayLengthMs) || 24 * 60 * 1000;   // 게임일 24분 — 리젠 적분의 시간축(zone-config WORLD 단일 원천)
// 셀 레코드 확보 + lazy 리젠(닫힌 해로 한 번에 적분 — dt가 몇 달이어도 오차 0)
function _oreRec(key, now) {
  let rec = minedCells.get(key);
  if (!rec) return { s: Specialty.ORE_K, t: now, w: 0, fresh: true };
  const days = (now - rec.t) / _ORE_DAY_MS;
  if (days > 0) { rec.s = Specialty.oreRegen(rec.s, days); rec.t = now; }
  return rec;
}
function _oreSave(key, rec) {
  // [배치 20 B] 채굴 축 — 렌더 거울 갱신.
  //   ★채광 정본(minedCells·mined_cells)은 아래 그대로다. 여기서 하는 건 읽어서 알려 주는 것뿐이다.
  //
  // ★★[배치 20 F — 재민 지적] 여기서 **토양치를 깎지 않는다.**
  //   1차 실장은 판 만큼 `Soil.dig(cx, cy, drop*0.25)` 를 걸었는데, 재민 지적대로
  //   **광맥을 팠다고 그 땅이 척박해지는 게 아니다.** 둘은 다른 것이다:
  //     · 채굴 축 = "이 자리를 얼마나 팠나" — 이미 제 그림(파낸 흙·자갈·그늘)이 있다.
  //     · 비옥도 축 = "이 흙이 얼마나 기름진가".
  //   한 사건이 두 축을 밀면 비옥도가 "얼마나 기름진가"가 아니라 "얼마나 시달렸나"가 되어
  //   재민이 세운 축 분리가 무너진다. 게다가 DB 에 영속돼 리젠 전까지 남는 **부작용**이었다.
  //   ⇒ 거울만 갱신한다. (길·경작도 마찬가지로 토양치를 안 건드린다 — 각자 별개 레이어다.)
  try {
    const _p = key.split('_');
    if (_p.length === 2) Soil.mirrorOre(+_p[0], +_p[1], rec.s, Specialty.ORE_K);
  } catch (e) { }
  if (rec.s >= Specialty.ORE_K && rec.w <= 0 && !(rec.kg > 0)) { minedCells.delete(key); try { db.deleteMinedCell(key); } catch (e) { } return; }
  delete rec.fresh; minedCells.set(key, rec);
  try { db.upsertMinedCell(key, rec.s, rec.t, rec.w, rec.kg || 0); } catch (e) { }
}

// ═══════════════════════════════════════════════════════════════════════════
// 낚시 v2 — 판단·위험·손맛 [재민 확정 2026-08-26]
// ═══════════════════════════════════════════════════════════════════════════
//   물리·자리 판정은 전부 `server/fishing.js` 정본이다. 여기 있는 건 **왕복**뿐이다:
//   던짐 예약 → 입질 알림 → 챔질 판정 → 어획 → 어장 감소 → 마을 econ 반영 → 기록.
//   ★서버 권위: 입질 시각도 챔질 창도 **서버가 정하고 서버가 잰다.** 클라는 "지금 챘다"만 보낸다
//     (클라가 보낸 시각은 **안 믿는다** — `test-fishing ②` 가 조작을 시도해 거절을 확인한다).
const Body = require('./body');   // ★[신체 상태 §7] 5축·연속 효과 곡선의 정본. 아래 생존 틱이 이걸 부른다.
// ★★[무게 배치 2026-08-27] 재민: "모든 아이템은 좀보이드처럼 무게를 가져야 해."
//   `weights` = kg 정본(specialty 를 읽고, 없는 것만 스스로 정한다) · `carry` = 합산·용량·과적 ·
//   `lots` = 식품 취득일 장부(3층 인벤의 가운데 층). 셋 다 **플레이어 층 전용**이다(econ 무접촉).
const Weights = require('./weights');
const Carry = require('./carry');
const Lots = require('./lots');
const Fishing = require('./fishing');
Fishing.setDayMs(parseInt(process.env.VILLAGE_DAY_MS || '', 10) || (WORLD && WORLD.dayLengthMs) || 24 * 60 * 1000);
{ // 부팅: 파인 어장 셀 로드(만땅 셀은 애초에 저장 안 됨 — mined_cells 와 같은 문법)
  try {
    for (const r of db.getAllFishCells()) Fishing.fishCells.set(r.cell_key, { s: r.stock, t: r.last_t });
    if (Fishing.fishCells.size) console.log(`[${ZONE_ID}] 🎣 파인 어장 셀 ${Fishing.fishCells.size}개 로드`);
  } catch (e) { console.log(`[${ZONE_ID}] fish_cells 로드 실패: ${e.message}`); }
}
function _fishSave(key, r) {
  if (r.s >= Fishing.CFG.CELL_K) { Fishing.fishCells.delete(key); try { db.deleteFishCell(key); } catch (e) {} return; }
  try { db.upsertFishCell(key, r.s, r.t); } catch (e) {}
}
// 회복은 **어획이 없어도** 보여야 한다 — 5분마다 만땅 셀을 정리하고 마을 어장 상한을 다시 매긴다.
const FISH_TICK_MS = Math.max(5000, parseInt(process.env.FISH_TICK_MS || '', 10) || 60000);
let _fishTickAt = Date.now();
setInterval(() => {
  const now = Date.now();
  const dtDays = (now - _fishTickAt) / Fishing.DAY_MS;
  _fishTickAt = now;
  const r = Fishing.diffuse(dtDays, _fishSave);
  let pruned = 0;
  for (const [key, rec] of [...Fishing.fishCells]) {
    if (rec.s >= Fishing.CFG.CELL_K - 1e-4) { Fishing.fishCells.delete(key); try { db.deleteFishCell(key); } catch (e) {} pruned++; }
  }
  try { SimVillages.refreshAllFishSustain && SimVillages.refreshAllFishSustain(now); } catch (e) {}
  if (pruned) console.log(`[${ZONE_ID}] 🎣 어장 셀 ${pruned}개 만땅 회복 (번짐 ${r.moved} · 재생 ${r.regen})`);
}, FISH_TICK_MS);

// 바이옴별 어종 — ★v1 의 목록을 **그대로 쓴다**(어종 확장은 이번 범위 밖 = 회부).
// ★★[T59 2026-09-03] 표를 **`fishing.js` 로 옮겼다** — 여기 있어서 아무도 못 물어봤고,
//   그래서 건어물 레시피가 `'fish'` 라는 안 나오는 품목을 요구하고 있었다(T17 회부 · 이 카드가 닫았다).
function _fishSpeciesFor(biome) { return Fishing.speciesFor(biome); }
// 던질 자리 — 플레이어 주변에서 **가장 좋은 물 칸**을 서버가 고른다(클라가 자리를 못 속인다).
function _castTargetFor(player) {
  const R = Fishing.CFG.REACH_PX;
  let best = null, bestScore = -1;
  for (let dy = -R; dy <= R; dy += 32) {
    for (let dx = -R; dx <= R; dx += 32) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = player.x + dx, y = player.y + dy;
      if (!isWaterTileLocal(x, y)) continue;
      const sp = Fishing.spotAt(_terrain, ZONE_ID, x, y);
      if (!sp.water) continue;
      const sc = Fishing.spotScore(sp);
      const v = sc.rate * sc.size;
      if (v > bestScore) { bestScore = v; best = { x, y, sp }; }
    }
  }
  return best;
}
function _fishStats(player) {
  if (!player.fishStats || typeof player.fishStats !== 'object') {
    player.fishStats = { casts: 0, caught: 0, missed: 0, kg: 0, maxKg: 0, maxMissedKg: 0 };
  }
  return player.fishStats;
}
// ① 던지기 / 챔질 — 같은 키 하나로 상태 기계를 돈다(새 패널 없음).
function tryFishCast(player) {
  if (!player || player.isDown) return;
  const now = Date.now();
  const cur = player._fish;
  if (cur && cur.state === 'wait') {   // 이미 던져 놨다 → 이건 **챔질**이다
    return tryFishStrike(player);
  }
  const tgt = _castTargetFor(player);
  if (!tgt) { send(player.ws, { type: 'notice', text: '🎣 여기선 물에 닿지 않는다 — 물가로 더 가까이' }); return; }
  const cx = Math.floor(tgt.x / 32), cy = Math.floor(tgt.y / 32);
  const stock01 = Fishing.stockRatioAt(cx, cy, now);
  const pl = Fishing.plan(tgt.sp, stock01, now, Math.random);
  player._fish = {
    state: 'wait', x: tgt.x, y: tgt.y, cx, cy, sp: tgt.sp,
    biteAt: pl.biteAt, kg: pl.kg, windowMs: pl.windowMs, castAt: now, stock01,
  };
  _fishStats(player).casts++;
  send(player.ws, { type: 'fish_state', state: 'wait', x: tgt.x, y: tgt.y,
    hint: `🎣 던졌다 — ${Fishing.spotAt(_terrain, ZONE_ID, tgt.x, tgt.y).kind === 'lake' ? '잔잔한 물' : '흐르는 물'}` });
  send(player.ws, { type: 'notice', text: '🎣 던졌다. 찌를 봐라 — 흔들리면 Shift+F' });
}
// ② 챔질 — **서버 시각으로만** 판정한다.
function tryFishStrike(player) {
  const f = player && player._fish;
  const now = Date.now();
  if (!f || f.state !== 'wait') { send(player.ws, { type: 'notice', text: '🎣 아직 안 던졌다 (Shift+F)' }); return; }
  const st = _fishStats(player);
  if (now < f.biteAt) {   // 성급한 챔질 — 입질 전이다
    player._fish = null;
    st.missed++;
    send(player.ws, { type: 'fish_state', state: 'idle' });
    send(player.ws, { type: 'notice', text: '🎣 성급했다 — 아직 안 물었는데 챘다' });
    return;
  }
  const late = now - f.biteAt;
  if (late > f.windowMs + Fishing.CFG.WIN_LAT_MS) {   // 창을 놓쳤다
    player._fish = null;
    st.missed++;
    if (f.kg > st.maxMissedKg) st.maxMissedKg = +f.kg.toFixed(2);
    const big = f.kg >= Fishing.CFG.BIG_KG;
    send(player.ws, { type: 'fish_state', state: 'idle' });
    send(player.ws, { type: 'notice', text: big
      ? `🎣 놓쳤다 — **묵직한 놈**이었다(${f.kg.toFixed(1)}kg). 물결만 남았다`
      : '🎣 놓쳤다 — 미끼만 따 먹혔다' });
    savePlayer(player);
    return;
  }
  // ── 걸었다 ──────────────────────────────────────────────────────────────
  Body.onLabor(player, 0.6);   // ★[신체 상태] 챔질도 노동이다(채광보다 가볍다)
  const kg = f.kg;
  // ★어장에서 **실제로 뺀 만큼만** 준다 — 없는 물고기를 주사위로 만들지 않는다.
  //   재고가 모자라면 잡히는 양도 그만큼 준다(빈 자리는 빈 바늘로 답한다).
  const wantStock = kg / Fishing.CFG.KG_PER_STOCK;
  const took = Fishing.drawStock(f.cx, f.cy, wantStock, now, _fishSave);
  const gotKg = took <= 0 ? 0 : +(took * Fishing.CFG.KG_PER_STOCK).toFixed(3);
  player._fish = null;
  send(player.ws, { type: 'fish_state', state: 'idle' });
  if (gotKg <= 0.01) {
    st.missed++;
    send(player.ws, { type: 'notice', text: '🎣 빈 바늘 — 이 자리는 씨가 말랐다. 자리를 옮겨라' });
    savePlayer(player);
    return;
  }
  // ★★[무게 배치 2026-08-27] **한 마리는 한 마리다.**
  //   종전엔 `round(kg / KG_PER_ITEM)` 로 2.4kg 물고기를 0.8kg 짜리 세 마리로 뭉갰다 —
  //   낚시 v2 가 애써 낸 개체 무게가 그 줄에서 사라지고 있었다(§0 실측으로 확인).
  //   이제 **개수는 1, 무게는 그 물고기의 실제 kg** 이고, 그 kg 가 인벤 무게·거래 환산에 그대로 쓰인다.
  const n = 1;
  const species = _fishSpeciesFor(ZONE.biome);
  const sp = species[Math.floor(Math.random() * species.length)];
  player.inventory[sp] = (player.inventory[sp] || 0) + n;
  Carry.noteInstance(player, sp, gotKg, zoneGameDay());        // ★개체 kg 원장 — 취득일도 같이(펼친 줄이 신선도를 말한다)
  Lots.note(player, sp, n, zoneGameDay());                     // 식품 로트(취득일)
  st.caught++; st.kg = +(st.kg + gotKg).toFixed(2);
  const isRecord = gotKg > st.maxKg;
  if (isRecord) st.maxKg = +gotKg.toFixed(2);
  // ★일관성 — 그 수역 마을의 어장 상한을 지금 재고로 다시 매긴다(NPC 어부가 같은 물을 쓴다).
  let vinfo = null;
  try {
    const vil = SimVillages.waterVillageAt ? SimVillages.waterVillageAt(f.x, f.y) : null;
    if (vil) vinfo = SimVillages.refreshFishSustain(vil, now);
  } catch (e) {}
  sendInventory(player);
  const big = gotKg >= Fishing.CFG.BIG_KG;
  send(player.ws, { type: 'fish_catch', kg: +gotKg.toFixed(2), n, item: sp, big, record: isRecord });
  send(player.ws, { type: 'notice', text: (big ? '🎣🐟 **월척!** ' : '🎣 ')
    + `${ITEM_LABEL_SERVER[sp] || sp} ${gotKg.toFixed(1)}kg ×${n}`
    + (isRecord ? ' — 여태 잡은 것 중 가장 크다' : '') });
  savePlayer(player);
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

// ═══ 채굴 ═══════════════════════════════════════════════════════════════
// 곡괭이를 들고 **어디서나** 팔 수 있다 — 마당에서도, 산기슭에서도. 나오는 건 돌이다.
// 광맥 위에서는 그 돌덩이가 **광석일 확률 p**(연속장)를 갖는다. 평지는 p=0이라 영원히 돌만.
//   · 1타 = 1초(서버 강제) · 60타 = 재고 1 = **돌덩이 1개**
//   · 나온 덩이는 ore_chunk(미확인 원석)로 들어온다. 광석인지 돌인지는 **선광해야** 안다.
//     결과 자체는 채굴 순간 정해져 숨은 장부(player.oreLedger)에 적힌다 — 나중에 몰아서
//     굴리면 선광 시점의 난수로 결과가 바뀌어 "이미 캔 것"의 정체가 흔들린다.
//   · 감정(mining 숙련): 레벨이 오르면 지고 오기 전에 정체를 알아본다. 캐는 속도는 그대로.
//     ⇒ 스킬 이득 = **버릴 것을 마을까지 지고 가지 않는 것**. 가까운 광맥에선 작고
//        먼 광맥 원정에서 커진다(왕복이 길수록 헛짐의 대가가 크다).
// ★[재민 확정] 감정은 **연속**이고 **확률적**이다 — 정수 레벨 해금(3렙/7렙)이 아니다.
//   ① 정확도 acc(xp) = 0.5 + 0.45(1−e^(−xp/400)) — xp는 덩이 1개당 +1(=1 게임시간)
//      acc 0.5 = 동전던지기 = **정보 0**(베이즈 사후확률이 사전 p 그대로). 거기서부터 자란다.
//   ② 판단 자체가 틀릴 수 있다: acc 확률로 진실을, 아니면 반대를 말한다.
//      "질 좋은 덩이인 것 같다" 해놓고 선광하면 맥석일 수 있다 — 그게 숙련의 의미다.
//   ③ 말투가 정확도를 대신 알려준다(UI에 숫자를 안 띄운다):
//      ~같기도 하다(사후 47~61%) → ~인 것 같다(74~82%) → 단정(87%+)
//   실패는 선광 때 드러난다 = 학습 루프. 이득은 여전히 "버릴 것을 지고 가지 않는 것"이다.
function _mineIdentify(player, mineral, isOre, lvlF) {
  // ★비대칭 채널(재민 확정): 초보는 **좋은 광석을 몰라보고 버리는 FN**이 많고,
  //   명백한 맥석에 속는 FP는 적다. 광석의 단서(광택·비중)는 "있으면 보이는" 신호라 놓치기 쉽고,
  //   맥석은 특징의 부재라 거르기 쉽다.  TPR = 0.5+0.45·s^1.6(느림) · TNR = 0.5+0.45·s^0.6(빠름)
  // ★[재민 확정 2026-08-01] ②층 — 종류 감정. 이름·가족은 전부 **추측 채널**(mineTypeGuess)에서 나온다.
  //   전에는 FP(맥석을 광석으로 오판) 문구가 광맥의 진짜 광물명을 말해 맥석이 광맥 정체를 누설했다.
  //   지금은 진짜 광석일 때만 typeAcc 확률로 정답이고, 오인은 겉모습 혼동 행렬(바보의 금 등)을 따른다.
  const hit = Math.random() < (isOre ? Specialty.mineTPR(lvlF) : Specialty.mineTNR(lvlF));
  const says = hit ? isOre : !isOre;                     // ★판단은 확률적 — 틀릴 수 있다
  const guess = says ? Specialty.mineTypeGuess(mineral, isOre, lvlF, Math.random) : null;
  const koOf = (m) => (Specialty.RESOURCES[m] || {}).ko || m;
  const phrase = Specialty.mineIdPhrase(lvlF, says, guess, koOf);
  // ★적중/오판 적산 — 선광 때 "눈대중 12/15 · 종류 7/9"로 돌려준다. 숫자 HUD 없이 자기 눈을
  //   얼마나 믿을지 배우는 유일한 창구다(학습 루프). 판단을 안 한 구간(레벨 0~1)은 세지 않는다.
  if (phrase) {
    if (!player.oreGuess || typeof player.oreGuess !== 'object') player.oreGuess = { n: 0, hit: 0, tn: 0, thit: 0 };
    player.oreGuess.n++; if (says === isOre) player.oreGuess.hit++;
    // 종류 성적은 **종 단위 문구**(7렙+)에서, 진짜 광석에 대해서만 센다 — 가족 문구는 종 주장이 아니다.
    if (isOre && says && guess && Math.floor(lvlF) >= 7) {
      player.oreGuess.tn = (player.oreGuess.tn || 0) + 1;
      if (guess === mineral) player.oreGuess.thit = (player.oreGuess.thit || 0) + 1;
    }
  }
  return phrase;
}
function mineOreCell(player) {
  Body.onLabor(player, 1.0);   // ★[신체 상태] 채광 1타 = 노동 1. 하루 종일 파면 저녁에 손이 느려진다.
  const eq = getEquippedTool(player);
  if (!eq || eq.type !== 'pickaxe') return false;
  const now = Date.now();
  if (now - (player._mineT || 0) < Specialty.MINE_SWING_MS) return true;   // ★1초/타 — 연타 방지(구 모델엔 쿨다운이 아예 없었다)
  const cx = Math.floor(player.x / 32), cy = Math.floor(player.y / 32);
  const px = cx * 32 + 16, py = cy * 32 + 16;
  if (isWaterTileLocal(px, py) || isTerrainBlockedLocal(px, py)) return false;   // 물·바위 위에선 못 판다
  player._mineT = now;
  const key = cx + '_' + cy;
  const rec = _oreRec(key, now);
  if (rec.s < 1) { send(player.ws, { type: 'notice', text: '⛏ 이 자리는 다 팠다 — 옆으로 옮기자' }); _oreSave(key, rec); return true; }
  // ★★[재민 최종] 채굴 **속도는 고정**이다 — 1초/타 · 덩이당 60타 · 재고 소모 1. 전부 레벨 무관.
  //   레벨이 바꾸는 건 딱 셋:  ①곡괭이 내구 절약  ②떨어져 나오는 **덩이 크기**  ③감정
  const lvlF = Specialty.mineLevelF((player.craftSkill && player.craftSkill.mining) || 0);
  // 무게: 짐이 가득이면 더 못 든다(지게 28kg = 미숙련 원석 8덩이)
  //   ★기준을 CHUNK_KG(3.5) 고정이 아니라 **자기 레벨의 평균 덩이**로 본다 —
  //     고렙은 덩이가 크므로 같은 28kg에 덜 담긴다. (실제 덩이는 정규분포라 마지막 한 덩이는
  //     평균보다 무거울 수 있다. 상한을 조금 넘길 수 있게 두는 게 옳다 — 캐고 나서야 크기를 아니까.)
  const w = Specialty.inventoryWeight(player.inventory || {});
  if (w + Specialty.mineChunkKg(lvlF) > Specialty.CARRY_MAX_KG) {
    send(player.ws, { type: 'notice', text: `⛏ 짐이 가득 — ${w.toFixed(0)}/${Specialty.CARRY_MAX_KG}kg. 마을에 부리고 오자` });
    return true;
  }
  // ★★[재민 지적으로 뒤집은 설계] 타수 카운터(rec.w)는 **셀에 쌓인다** — 2인 1조가 성립하는 규약.
  //   그래서 "필요 타수"를 사람마다 다르게 두면 저렙이 고렙 진척에 무임승차한다. 뒤집었다:
  //     · 문턱(need)  = 셀 속성. 깊이만 본다.  need(f) = 60 × D(f) ,  D = 1+3(1−f)²
  //     · 기여(power) = 개인 속성. 스킬만 본다. power(f,lvl) = 1 + (lvl/10)(D−1)
  //   표층(D=1)에선 power=1 로 전원 동일(= "캐는 속도는 같아야"), 만렙은 심층 페널티를 완전 상쇄.
  //   둘이 같이 파면 각자 자기 power 만큼만 올리고 덩이는 문턱을 넘긴 타격의 주인이 갖는다
  //   ⇒ 장기적으로 **기여한 만큼** 분배된다(무임승차 없음).
  //   (필요 타수는 셀 공용 카운터라 개인차를 두면 저렙이 고렙 진척에 무임승차한다 — 재민 지적)
  const f = rec.s / Specialty.ORE_K;
  const need = Specialty.mineSwingsNeeded(f);   // 깊이만 본다(셀 속성) — 레벨 안 들어감
  consumeEquippedDurability(player, Specialty.mineToolWear(lvlF));   // ★①만렙은 곡괭이를 절반만 축낸다
  // ★★[재민 지적] 타수는 **모두가 같이 넣는다**(rec.w 는 셀 공용). 그런데 덩이 무게를
  //   *막타 친 사람*의 레벨로 정하면 lvl0 이 59타 치고 lvl10 이 1타 쳐도 5.25kg 를 lvl10 이 가져간다.
  //   ⇒ 타격마다 **그 사람의 kg 기여**를 따로 누적하고, 덩이가 나올 때 **가중평균**을 쓴다.
  //     rec.kg = Σ mineChunkKg(각 타격자 레벨)  ·  덩이 무게 = rec.kg / rec.w  (= 타격 평균)
  //   (덩이 자체는 문턱을 넘긴 사람이 갖는다 — 매 타격이 막타가 될 확률이 같으므로
  //    장기적으로는 타수에 비례해 분배된다. 무게만 기여도대로 정해지면 된다.)
  rec.w = (rec.w || 0) + 1;                                          // 기여는 누구나 1타 = 1
  rec.kg = (rec.kg || 0) + Specialty.mineChunkKg(lvlF);              // ★이 타격이 실어 나른 무게
  let msg;
  if (rec.w >= need) {
    // ★[재민 확정] 가중평균은 이 덩이의 **평균**일 뿐이다. 실제 크기는 여기서 한 번 추첨한다.
    //   추첨을 타격마다 하지 않는 이유: 60타 평균은 산포를 √60 배 줄여 사실상 고정값이 된다
    //   (CV 0.28 → 0.036). "가끔 큰 돌덩이"는 **덩이 단위**로 굴려야 체감된다.
    const mu = rec.kg / rec.w;                                       // ★가중평균 — 막타 기준이 아니다
    const kg = +Math.max(0.05, Specialty.mineChunkRoll(mu)).toFixed(3);
    rec.kg -= mu * need;                                             // ★장부에서 빼는 건 **평균분**이다 —
    //   추첨 결과를 빼면 운 좋게 큰 덩이가 나온 다음 덩이가 굶는다(난수가 다음 덩이로 새면 안 된다).
    rec.w -= need; rec.s -= 1;                                       // ★재고 소모 1 고정(재민 지시)
    const cluster = _terrain.isOreClusterAt(ZONE_ID, px, py);
    // ★[재민 확정 (다)] p 는 **겹친 광맥 전부의 합성**이다: 1 − ∏(1−p_i).
    //   겹치는 자리가 노다지가 된다("왜 여기만 유독 잘 나오지?").
    // 품위는 **자리**의 것 × **깊이** 보정. 깊을수록 진하지만(×2.40까지) 타수는 더 빨리 늘어(×2.667)
    // 결국 얕은 데를 골고루 긁는 쪽이 미세하게 이득이다(재민 확정).
    const pRaw = _terrain.oreProbAt ? _terrain.oreProbAt(ZONE_ID, px, py) : 0;
    const p = Math.min(0.95, pRaw * Specialty.mineDepthP(f));
    const isOre = Math.random() < p;
    // ★광물도 자리에 걸친 광맥들 사이에서 **p 비례 추첨**한다 — 접촉대에선 구리도 옥도 나온다.
    //   (isOreClusterAt 은 p 최대인 하나만 준다. 그걸 쓰면 겹친 상대 광물이 영원히 안 나온다 —
    //    실측으로 자잘 33개가 그렇게 소유 셀 0 인 유령이 돼 있었다.)
    const mineral = (_terrain.oreMineralAt ? _terrain.oreMineralAt(ZONE_ID, px, py) : null)
      || (cluster ? (cluster.mineral || 'iron') : 'iron');
    if (!player.oreLedger || typeof player.oreLedger !== 'object') player.oreLedger = {};
    const lk = isOre ? mineral : 'stone';
    player.oreLedger[lk] = +((player.oreLedger[lk] || 0) + kg).toFixed(3);   // ★결과는 지금 정해 숨긴다
    player.inventory.ore_chunk = +((player.inventory.ore_chunk || 0) + kg).toFixed(2);
    sendInventory(player);
    const id = _mineIdentify(player, mineral, isOre, lvlF);   // ★감정은 xp 적립 *전*에 — 방금 캔 덩이가 자기 xp 덕을 보면 안 된다
    player.craftSkill = player.craftSkill || {};
    player.craftSkill.mining = (player.craftSkill.mining || 0) + 1;   // 덩이 1개 = xp 1 = 1 게임시간
    msg = `⛏ 돌덩이 ${kg.toFixed(1)}kg${id ? ' — ' + id : ' (정체 모름 · 마을에서 선광)'}`;
  } else {
    const dp = Specialty.mineDepthP(f);
    msg = `⛏ 캐는 중 ${Math.round(rec.w)}/${Math.round(need)}`
      + (need > Specialty.MINE_SWINGS_PER * 1.5 ? ` (깊다 · 품위 ×${dp.toFixed(2)})` : '');
  }
  _oreSave(key, rec);
  send(player.ws, { type: 'notice', text: msg + ` · 남은 광맥 ${Math.round(rec.s)}` });
  savePlayer(player);
  return true;
}

// 선광(選鑛) — 캔 원석 덩이를 갈라 광석과 맥석으로 나눈다. 마을(회관·작업대) 근처에서만.
//   고증: 캔 광석은 선광(dressing)을 거쳐야 정광이 된다. 맥석은 갱구 옆 폐석더미로 간다.
function trySortOre(player) {
  const n = (player.inventory && player.inventory.ore_chunk) || 0;
  if (n <= 0) { send(player.ws, { type: 'notice', text: '선광할 원석이 없다' }); return; }
  // (n 은 kg)
  // ★장부는 **kg**이다(덩이 크기가 사람마다 다르므로). 선광하면 kg → 광석 개수로 갈린다.
  //   광석 1개 = CHUNK_KG(3.5kg) 기준. 소수분은 다음 선광으로 이월(버리지 않는다).
  const led = player.oreLedger || {};
  const got = {};
  const carry = (player.oreCarry && typeof player.oreCarry === 'object') ? player.oreCarry : (player.oreCarry = {});
  for (const k of Object.keys(led)) {
    const kg = led[k]; if (!(kg > 0)) { delete led[k]; continue; }
    delete led[k];
    if (k === 'stone') { got.stone_waste = +((got.stone_waste || 0) + kg).toFixed(1); continue; }   // ★맥석은 폐석 — 인벤에 안 넣는다
    // ★★[재민 확정 2026-08-02 노 건설] 철은 선광해도 금속이 아니라 **정광(iron_ore)**이다.
    //   구리·주석 등 청동기 금속은 도가니에 녹으므로 선광→금속을 "간이 제련 포함"으로 추상하지만,
    //   철은 융점 1538℃라 어떤 시대에도 도가니로는 못 녹인다(era.js) — 노(爐)를 지어야 한다.
    //   전에는 여기서 철 금속이 그냥 나왔다: 수율 3.4% 설계를 통째로 우회하는 구멍이었다.
    if (k === 'iron') {
      const tot0 = (carry.iron_ore || 0) + kg;
      const whole0 = Math.floor(tot0 / Specialty.CHUNK_KG);
      carry.iron_ore = +(tot0 - whole0 * Specialty.CHUNK_KG).toFixed(3);
      if (whole0 > 0) { player.inventory.iron_ore = (player.inventory.iron_ore || 0) + whole0; got.iron_ore = whole0; }
      continue;
    }
    const tot = (carry[k] || 0) + kg;
    const whole = Math.floor(tot / Specialty.CHUNK_KG);
    const rem = tot - whole * Specialty.CHUNK_KG;
    carry[k] = +rem.toFixed(3);
    if (whole > 0) { player.inventory[k] = (player.inventory[k] || 0) + whole; got[k] = whole; }
  }
  player.inventory.ore_chunk = 0; delete player.inventory.ore_chunk;
  player.oreLedger = led;
  // ★[2026-08-02d 라벨 정합] RESOURCES 만 보면 **영문 키가 그대로 샌다**: 철 광맥을 선광하면 산출 키가
  //   `iron_ore`(정광)인데 RESOURCES 엔 그 항목이 없어 플레이어에게 "iron_ore 3" 이라고 찍혔다.
  //   서버 라벨표(ITEM_LABEL_SERVER)가 이미 '철 정광'을 안다 — 그걸 먼저 보고, 없으면 RESOURCES, 그 다음 키.
  const parts = Object.entries(got).filter(([k]) => k !== 'stone_waste')
    .map(([k, v]) => `${ITEM_LABEL_SERVER[k] || (Specialty.RESOURCES[k] || {}).ko || k} ${v}`);
  sendInventory(player);
  let score = '';
  if (player.oreGuess && player.oreGuess.n > 0) {
    const g = player.oreGuess;
    score = ` · 눈대중 ${g.hit}/${g.n} 적중`;
    if (g.hit < g.n) score += ` (${g.n - g.hit} 헛짐)`;
    if (g.tn > 0) score += ` · 종류 ${g.thit}/${g.tn}`;   // ★②층 성적(7렙+ 종 단정만 집계)
    player.oreGuess = { n: 0, hit: 0, tn: 0, thit: 0 };   // 성적은 선광마다 리셋 — "이번 한 짐"의 성적이다
  }
  send(player.ws, {
    type: 'notice',
    text: `⚒ 선광 ${n.toFixed(0)}kg → ` + (parts.length ? parts.join(', ') : '광석 없음') + (got.stone_waste ? ` · 맥석 ${got.stone_waste}kg 버림` : '') + score
  });
  savePlayer(player);
}

// 주기적 정리 (15분) — 만땅 회복된 셀 레코드 제거. minedCells만 순회(파인 셀, 한정적)라 가벼움.
setInterval(() => {
  if (minedCells.size === 0) return;
  const now = Date.now();
  for (const [key, rec] of minedCells) {
    const days = (now - rec.t) / _ORE_DAY_MS;
    if (days > 0) { rec.s = Specialty.oreRegen(rec.s, days); rec.t = now; }
    if (rec.s >= Specialty.ORE_K && (rec.w || 0) <= 0 && !(rec.kg > 0)) { minedCells.delete(key); try { db.deleteMinedCell(key); } catch (e) { } }
  }
}, 15 * 60 * 1000);

// ★★★[재민 확정 2026-08-28 · 빈손 시작] **맨손 채집 — 이미 렌더된 자연물이 채집원이다.**
//   재민 확정: *"낙하물 스캐터 금지"* — 땅에 아이템을 흩뿌리지 않는다
//   ("소품 밀도 낮게, 스폰 광장이 첫인상" 캐논 위반). 대신 **눈에 보이는 것**에 손을 얹는다:
//     덤불 → 잔가지 · 갈대 군락(물가) → 풀 · 물가 바위밭/자갈 지형 → 자갈 · 숲 바닥 → 잔가지.
//
// ★고갈·리필은 `server/forage.js` 정본이 한다(개체별 lazy 번영도 — 낚시 자리·광맥과 같은 문법).
//   여기서 하는 건 **어느 개체인지 고르고, 정본에 물어보고, 결과를 말하는 것**뿐이다.
//   ⚠1차 실장은 `getStoneMultiplier` 로 자갈 자리를 갈랐다가 **풀이 한 번도 안 나왔다** —
//     실측하니 이 세계의 `stoneMult` 는 어디서나 1.00 고정이라 판별에 못 쓴다(3000표본 min=max=1.00).
//     죽은 신호를 읽는 규칙은 조용히 한쪽으로만 답한다. 지형 술어를 쓸 땐 **분포부터 재라.**
const Forage = require('./forage');

// ═══ 시설 제작창 [재민 확정 2026-08-29 · §8.5] ══════════════════════════════
//   재민: **"제작창 = 시설의 창"** — 화덕=요리 · 작업대=도구 · 노=제련. 전 레시피 대목록 금지.
//   헌법: **제작은 마법 메뉴가 아니라 시설 앞의 물리 행위다.** ⇒ ①시설 반경 ②제작 시간.
//   시설·대기열 정본은 `server/facility.js` 하나(여기서 규칙을 다시 짜지 않는다).
const Facility = require('./facility');
// ★시설만 모아 두는 작은 목록 — 시설은 드물다(모닥불·작업대·노·숯가마).
//   ⚠1차 실장은 `qtBuildings`(활성청크 인덱스)만 봤다가 **테스트 부팅에서 시설을 못 찾았다** —
//     청크에 안 실린 건물은 인덱스에 없기 때문이다. 그렇다고 매번 전 건물(3만+채)을 훑을 수도 없다.
//   ⇒ 건물 수가 바뀌거나 5초가 지나면 다시 모은다(시설은 몇 개뿐이라 목록이 작다).
const _facIdx = { n: -1, at: 0, list: [] };
function _facilities(now) {
  const t = now || Date.now();
  if (buildings.size !== _facIdx.n || t - _facIdx.at > 5000) {
    _facIdx.list = [];
    for (const b of buildings.values()) if (Facility.FACILITIES[b.type]) _facIdx.list.push(b);
    _facIdx.n = buildings.size; _facIdx.at = t;
  }
  return _facIdx.list;
}
function _bldNear(x, y, r) {
  const out = [];
  for (const b of _facilities()) if (Math.hypot(b.x - x, b.y - y) <= r) out.push(b);
  return out;
}
// 이 사람이 지금 쓸 수 있는 시설(창) — 없으면 null.
function facilityFor(player, kind) {
  const r = (Facility.FACILITIES.workbench.range) + 8;
  return Facility.nearest(kind, player.x, player.y, _bldNear(player.x, player.y, r), (b) => _facilityMine(player, b));
}
// ★사유지 시설 = 소유자만(남의 가마 사용권·사용료는 회부). 마을(NPC) 시설도 이번엔 못 쓴다.
function _facilityMine(player, b) {
  if (!b) return false;
  if (b.ownerId == null && b.owner_id == null) return true;      // 주인 없는 것(테스트 픽스처)
  const own = b.ownerId != null ? b.ownerId : b.owner_id;
  return own === player.playerId;
}
// 대기열 페이로드 — 클라가 "몇 초 남았나"를 화면에 그린다(남은 시간은 조회 시각의 함수).
function craftQueuePayload(player) {
  const now = Date.now();
  const out = [];
  for (const b of _bldNear(player.x, player.y, 1200)) {
    if (!Facility.FACILITIES[b.type]) continue;
    const jobs = Facility.view(b, now).filter((j) => j.owner === player.playerId);
    if (!jobs.length) continue;
    out.push({ bid: b.id, type: b.type, ko: Facility.FACILITIES[b.type].ko, jobs });
  }
  return out;
}
function sendCraftQueue(player) { send(player.ws, { type: 'craft_queue', queue: craftQueuePayload(player) }); }
// 대기열이 바뀌면 건물 data 를 영속한다 — **오프라인 진행의 근거**다(재부팅해도 가마는 타고 있다).
//   ⚠완성품 인스턴스가 통째로 들어가지만 `data_json` 은 블롭이라 스키마 변경이 없다(tools_json 선례).
function markBuildingDirty(b) {
  if (!b || !b.dbId) return;
  try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {}
}

// ★★[재민 확정 2026-08-29 · §8.5] **제작창 = 시설의 창.**
//   전 레시피 대목록을 만들지 않는다 — 내 곁의 시설이 **자기 레시피만** 편다.
//   정렬 기본은 "지금 가능 / **재료 하나 모자람**" — 뒤엣것이 오늘의 할 일이고, 장에 갈 이유다.
function _facilityRecipes(player, kind) {
  const inv = player.inventory || {};
  const rows = [];
  const push = (r) => {
    // ★★[T38 2026-09-01] **이름표는 서버가 낸다.** 클라가 자기 표를 들면 그게 사본이고,
    //   자염처럼 새 품목이 들어온 날 **클라 표만 뒤처져 화면에 영문 키가 뜬다.**
    //   실측: `e2e-salt` 가 "짠물 표시 = 영문 키 brine" 을 이미 찍고 있었다(회부 D-1).
    //   정본은 `ITEM_LABEL_SERVER` 다 — 그 표는 salt.js·spoil.js·crops.js 에서 이름을 **가져온다**(옮겨 적지 않는다).
    //   작물 층이 이미 같은 규약이다(`welcome.crops` 가 ko 를 싣는다). 여기선 데이터만 얹는다 — 로직 무접촉.
    const missing = Object.entries(r.cost).filter(([k, n]) => (inv[k] || 0) < n)
      .map(([k, n]) => ({ item: k, ko: ITEM_LABEL_SERVER[k] || k, need: n, have: Math.floor(inv[k] || 0) }));
    const costKo = {};
    for (const k of Object.keys(r.cost || {})) costKo[k] = ITEM_LABEL_SERVER[k] || k;
    rows.push(Object.assign({}, r, { can: missing.length === 0, missing, costKo }));
  };
  if (kind === 'cook') {
    for (const [id, r] of Object.entries(COOK_RECIPES)) push({ id, label: r.label, kind, cost: r.cost });
  } else if (kind === 'tool' || kind === 'smelt') {
    for (const [t, r] of Object.entries(EQUIPMENT_RECIPES)) {
      if (kind === 'smelt' && !r.cast) continue;
      const lvl = playerCraftLevel(player, r.skill);
      // ★재료 선택이 곧 **판단**이다 — 등급(MAT_GRADE)이 다르면 산출 품질이 다르다.
      //   품질 공식을 여기서 다시 쓰지 않는다: `PlayerItems.craftItem` 정본을 **미리 한 번 돌려** 보여 준다.
      const options = [];
      for (const m of r.accepts) {
        const have = Math.floor(inv[m] || 0);
        let q = null;
        try { q = PlayerItems.craftItem(t, lvl, { [m]: r.qty }).q; } catch (e) {}
        options.push({ material: m, have, need: r.qty, q, can: have >= r.qty });
      }
      options.sort((a, b) => (b.can - a.can) || ((b.q || 0) - (a.q || 0)));
      const best = options.find((o) => o.can) || options[0];
      // ★[T12 지게] 곁재료는 **주재료와 같은 `cost` 에** 들어간다 ⇒ `can`·`missing`·버튼 게이팅이
      //   한 자리에서 맞는다(여기서 빼면 눌러 보고 서버에 거절당한다 = 화면이 게이트인 척한 것).
      push({ id: t, label: r.label, kind, skill: r.skill, lvl, options, extra: r.extra || null,
             cost: Object.assign({}, r.extra || {}, best ? { [best.material]: r.qty + ((r.extra || {})[best.material] || 0) } : {}), cast: !!r.cast });
    }
  }
  // ★★[부패·보존 배치 2026-08-31] **보존 가공을 그 시설의 창에 얹는다 — 새 패널 0.**
  //   화덕엔 요리와 훈제가, 작업대엔 도구와 절임이, 건조대엔 말리기만 뜬다("시설의 창" 그대로).
  //   ★재료 선택이 판단이 되게 **지금 내 재료의 신선도와 그래서 몇 개 나오는지**를 미리 보여 준다
  //     (도구의 "예상 품질 %"와 같은 자리 · 공식은 정본을 그대로 부른다 — 사본 없음).
  {
    const today = zoneGameDay();
    for (const [id, r0] of Object.entries(Spoil.PRESERVE)) {
      if (r0.kind !== kind) continue;
      const r = Spoil.resolveFrom(r0, inv);   // ★[T59] 어종 집합 → 손에 있는 것 하나(화면도 그걸 보여 준다)
      const have = Math.floor(Lots.sum(player, r.from));
      const off = Spoil.peekOffer(r.from, Lots.of(player, r.from), Math.max(1, have), today);
      push({ id, label: r.label, kind: 'preserve', preserve: true,
             cost: Object.assign({ [r.from]: 1 }, r.needs),
             from: r.from, out: r.out, outKo: Spoil.PRESERVED_ITEMS[r.out].ko,
             days: r.days, shelfDays: Spoil.shelfOf(r.out),
             fresh: have > 0 ? off.fresh : null,
             stage: have > 0 ? Spoil.stageOf(off.fresh) : null,
             stageKo: have > 0 ? Spoil.STAGE_KO[Spoil.stageOf(off.fresh)] : null,
             yieldPct: have > 0 ? Math.round(Spoil.yieldMult(off.fresh) * 100) : null });
      // ★상한 재료는 **버튼이 꺼져 있어야** 한다 — 눌러 보고 거절당하는 건 화면이 거짓말한 것이다.
      //   (`doPreserve` 가 서버 게이트로 다시 막는다 — 화면은 게이트가 아니라 안내다.)
      const row = rows[rows.length - 1];
      if (have > 0 && off.fresh <= 0) {
        row.can = false;
        row.missing = [{ item: `${ITEM_LABEL_SERVER[r.from] || r.from}(성한 것)`, need: 1, have: 0 }];
      }
    }
  }
  // ★★[자염 배치 2026-09-01] **소금가마의 창.** 새 패널 0 — 보존 행과 **같은 모양**으로 낸다.
  //   `preserve: true` 를 다는 건 의미의 남용이 아니다: 클라에서 그 깃발의 뜻은
  //   "재료를 넣고 시간을 기다려 물건을 받는 행"이고, 자염이 정확히 그것이다.
  //   ★수치는 전부 `salt.js` 정본이 계산해 보낸다(클라도 여기도 표를 다시 적지 않는다).
  if (kind === 'boil') {
    for (const [id, r] of Object.entries(Salt.RECIPES)) {
      const cost = Salt.potCost(id);
      const outN = Salt.potYield(id);
      push({ id, label: r.label, kind: 'preserve', preserve: true, boil: true,
             cost,
             from: r.from, out: r.out, outKo: `${ITEM_LABEL_SERVER[r.out] || r.out} ×${outN}`,
             // ⚠클라의 보존 행은 `· 보관 ${shelfDays}일` 을 **무조건** 찍는다(그 갈래를 빌려 쓰는 값이다).
             //   소금은 안 썩으므로 숫자를 넣으면 거짓말이 된다 ⇒ `∞` 를 넣어 "보관 ∞일" 로 읽히게 한다.
             //   ★클라를 한 줄 고치면 이 칸을 지울 수 있다 — 회부 D-2.
             days: r.days, shelfDays: '∞',
             // 재료 선택이 판단이 되도록 — 지금 재료로 **몇 솥**이 나오는지 미리 보여 준다.
             //   (도구의 "예상 품질 %"·보존의 "수율 %"와 같은 자리다.)
             yieldPct: null,
             pots: Math.min(Math.floor((inv[r.from] || 0) / cost[r.from]),
                            Math.floor((inv.wood || 0) / cost.wood)) });
    }
  }
  // "가능"이 먼저, 그다음 **하나만 모자란 것**, 그다음 나머지(모자란 개수 오름차순)
  rows.sort((a, b) => (b.can - a.can) || (a.missing.length - b.missing.length) || String(a.id).localeCompare(String(b.id)));
  return rows;
}
function sendFacility(player) {
  const near = Facility.anyNear(player.x, player.y, _bldNear(player.x, player.y, 200), (b) => _facilityMine(player, b));
  const mine = near ? _facilityMine(player, near.b) : false;
  send(player.ws, { type: 'facility',
    near: near ? { bid: near.b.id, btype: near.b.type, ko: near.ko, kind: near.kind, mine,
                   craftMs: Facility.CRAFT_MS[near.kind] || 0 } : null,
    recipes: near && mine ? _facilityRecipes(player, near.kind) : [],
    queue: craftQueuePayload(player) });
}
function _forageCtx(player) {
  return {
    forestMult: (x, y) => (_terrain.getForestMultiplier ? _terrain.getForestMultiplier(ZONE_ID, x, y) : 1),
    isRock: (x, y) => isRockTileLocal(x, y),
    isWater: (x, y) => isWaterTileLocal(x, y),
    // ★[자염 배치] 갯벌 판정에 필요한 둘 — 술어는 정본을 **주입**한다(사본 금지 규약 그대로).
    isSea: (x, y) => isSeaTileLocal(x, y),
    hasVessel: (player.inventory && (player.inventory[Salt.VESSEL] || 0) >= 1),
  };
}
function tryForage(player) {
  const now = Date.now();
  if (player._forageAt && now - player._forageAt < Forage.CFG.COOLDOWN_MS) return;
  player._forageAt = now;
  const src = Forage.sourceAt(player.x, player.y, _forageCtx(player));
  if (!src) {
    send(player.ws, { type: 'notice', text: '🤏 여긴 주울 게 없다 — 덤불·물가·숲을 찾아라' });
    return;
  }
  const got = Forage.take(src.key, now, 1);
  if (!got) {
    // ★반독점의 얼굴 — 한 자리를 훑으면 그 자리만 마른다. 옆 개체는 멀쩡하다.
    send(player.ws, { type: 'notice', text: `🤏 ${src.where} — 여긴 다 훑었다. 잠시 뒤 다시 자란다(옆 것을 찾아라)` });
    return;
  }
  // ★★[자염 배치 2026-09-01] **짠물은 물병을 쓴다** — 병 하나가 짠물 한 되로 바뀐다.
  //   왜 소모가 아니라 **교체**인가: 무게가 같아서(둘 다 1.00kg) 채수가 몸무게를 안 바꾼다.
  //   그리고 **들고 갈 수 있는 짠물의 상한이 곧 가진 병의 수**가 된다 — 용기가 진짜 용기다.
  //   가마가 다 졸이면 병을 **돌려준다**(`doBoilSalt`) — 병은 소모품이 아니라 그릇이다.
  //   ★★[T54 2026-09-02] 게이트를 **술어로** 바꾼다 — 민물도 병을 쓴다(그릇이 하나 더 생기는 날
  //     이 줄만 뒤처지지 않게). 조건을 여기 다시 적지 않고 정본에게 묻는다: `Tidal.usesVessel`.
  if (require('./tidal').usesVessel(src.kind)) {   // ★require 는 캐시된다 — 새 상단 선언을 만들지 않는다(zone 예산)
    if ((player.inventory[Salt.VESSEL] || 0) < got) {
      send(player.ws, { type: 'notice', text: `🏺 ${ITEM_LABEL_SERVER[Salt.VESSEL]}이 있어야 짠물을 뜬다` });
      return;
    }
    consumeItem(player, Salt.VESSEL, got);
  }
  player.inventory[src.kind] = (player.inventory[src.kind] || 0) + got;
  // (로트 없음 — 잔가지·자갈·풀·짠물은 무기한 벌크다. 나이가 뜻이 없다.)
  sendInventory(player);
  if (src.kind === Salt.BRINE) {
    send(player.ws, { type: 'notice',
      text: `🌊 ${src.where}에서 ${Salt.BRINE_KO} ${got}되 — 남은 ${ITEM_LABEL_SERVER[Salt.VESSEL]} ${Math.floor(player.inventory[Salt.VESSEL] || 0)}개`
          + ` · 소금 한 줌엔 ${Salt.brinePerPot()}되가 든다` });
  } else send(player.ws, { type: 'notice',
    text: `🤏 ${src.where}에서 ${ITEM_LABEL_SERVER[src.kind] || src.kind} ${got} (남은 양 ${Forage.left(src.key, now).toFixed(1)})` });
  if (canPersist(player)) savePlayer(player);
}

function tryGather(player) {
  // Phase 5-9: 물 채취 — 강/호수 인접 시 thirst 회복 + 어업 (Phase 5-11)
  for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
    if (isWaterTileLocal(player.x + dx, player.y + dy)) {
      // ★★[빈손 시작 2026-08-28] **목이 안 마르면 갈대를 벤다.**
      //   종전엔 여기가 막다른 길이었다(물만 마시고 끝). 물가에 선 사람이 할 일이 하나 더 있어야 한다 —
      //   재민 확정의 "갈대 군락 E = 섬유"가 이 자리다(새 개체 없이, 이미 있는 물가에 판정만 얹는다).
      // ★갈증이 **거의 찼으면** 갈대를 벤다. `>= THIRST_MAX` 로 하면 안 된다 —
      //   갈증은 매 틱 조금씩 줄어서 **정확히 100 인 순간이 거의 없고**, 그러면 이 갈래가
      //   영영 안 열린다(1차 실장이 그랬다: 실클라에서 갈대가 한 번도 안 잘렸다).
      // ★★[자염 배치 2026-09-01] **바다 옆에서 병을 들고 있으면 채수가 먼저다.**
      //   안 그러면 갈증 갈래(아래)가 먼저 걸려 갯벌에 서 있어도 짠물을 못 뜬다 —
      //   갈증은 늘 조금씩 줄어서 95% 문턱이 거의 안 열리기 때문이다(그 함정은 갈대가 이미 밟았다).
      //   ⚠**바닷물을 마시면 갈증이 회복되는 문제는 여기서 안 고친다** — 신체 영역 판단이다(회부 D).
      //   ★★[T4 2026-09-01] **그 회부가 확정으로 내려왔다 — 바로 아래에서 고친다.**
      //   ★★[T52 갯벌 2026-09-02] 게이트가 **"병이 있나"** 였다 — 그래서 병 없는 사람은
      //     갯벌에 서도 짠물 안내만 듣고 `tryForage` 에 **도달하지 못했다**(조개를 캘 길이 없었다).
      //     ⇒ **"여기서 바다 것이 열리나"** 로 바꾼다. 조건을 여기 다시 적지 않고 정본에게 묻는다.
      //     짠물(병 있음)·갯벌 채집(병 없음+썰물) 둘 다 이 술어가 가른다. 그 밖이면 종전대로 아래로.
      if (isSeaTileLocal(player.x + dx, player.y + dy)
          && Forage.seaSourceAt(player.x, player.y, _forageCtx(player))) { tryForage(player); return; }
      // ★★[바닷물 2026-09-01 재민 확정 · T3 동봉] **짠물은 목을 축이지 않는다.**
      //   종전엔 바다도 강도 `isWaterTileLocal` 하나로 뭉뚱그려 갈증이 +30 회복됐다.
      //   자염 배치가 이미 **바다 술어**(`isSeaTileLocal` = 해안선 띠 ∖ 강·호수)를 정본으로 세워 뒀다 —
      //   여기서는 그것을 **다시 부를 뿐 사본을 만들지 않는다**.
      //   ⇒ 회복 0 + 갈증 가속(확정적 · `Body.drinkBrine` · 식중독 확률 굴리기 금지).
      //     ★새 패널·새 축·새 클라 코드 0 — 기존 `notice` 문구 문법 그대로다.
      if (isSeaTileLocal(player.x + dx, player.y + dy)) {
        Body.drinkBrine(player, Date.now());
        send(player.ws, { type: 'notice',
          text: `🌊 짠물이다 — 목이 축여지기는커녕 더 마른다 (${Math.round(Body.CFG.BRINE_SEC / 60)}분간 갈증이 빨라진다)`
              + ' · 마실 물은 강·호수·샘에서' });
        send(player.ws, { type: 'self_stat', thirst: Math.round(player.thirst ?? THIRST_MAX) });
        return;
      }
      if ((player.thirst ?? THIRST_MAX) >= THIRST_MAX * 0.95) { tryForage(player); return; }
      const before = player.thirst || 0;
      player.thirst = Math.min(100, before + 30);
      let msg = `💧 물 마심 (+${Math.round(player.thirst - before)})`;
      // ★★[낚시 v2 · 재민 확정 2026-08-26] 여기 있던 **어업 동전 던지기를 걷어냈다.**
      //   종전: 물 옆에서 E → `Math.random() < 0.5` 로 어종 하나. 자리도 시간도 기술도 고갈도 없었다.
      //   그게 정확히 §2 가 말한 "입력이 같고 결과가 확실한" 진행바다.
      //   ⇒ 낚시는 이제 **제 동사**(Shift+F)를 갖는다: 자리를 고르고, 기다리고, 챔질하고, 놓친다.
      //   E 는 목 축이는 것만 한다(그것도 세계의 일이다). 처음 오는 사람을 위해 한 줄로 알려 준다.
      if (!player._fishHinted) { player._fishHinted = true; msg += ' · 🎣 낚시는 Shift+F'; }
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
      sendInventory(player);
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
  if (!best) { tryForage(player); return; }

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
  // 장착 도구 장비(품질 efficiency 속성) 채집 가산 + 사용 마모 — 미장착 시 기존 행동 불변
  const toolEq = getEquippedEquipment(player, 'tool');
  if (toolEq && toolEq.attrs && toolEq.attrs.efficiency) {
    dmg += Math.round(toolEq.attrs.efficiency * TOOL_EQUIP_EFF_SCALE);
    wearEquipment(player, 'tool', 1);
  }
  best.hp -= dmg;
  // 장착 도구 내구도 -1
  if (eqInst) consumeEquippedDurability(player, 1);
  if (best.hp <= 0) {
    // 자원 종류별 산출물 — ★정본 하나(`lootOfResource`). NPC 채집도 같은 표를 쓴다.
    const loot = lootOfResource(best, { day: zoneGameDay() });   // ★[작물 층] 플레이어 채집만 계절 씨앗을 본다
    //   운철만 말이 붙는다(전리품은 정본이 내고, 여기선 그 뜻을 사람에게 알린다).
    if (best.type === 'meteorite') {
      send(player.ws, { type: 'notice', text: '☄️ 하늘에서 떨어진 쇠 — 불에 넣지 않아도 이미 금속이다. 두들기면 바로 날이 선다.' });
    }
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
    sendInventory(player);
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


  // ★★[T45 2026-09-02] **승계 — 이 칸이 이미 남의 것인데 `pref`/`free` 면 새로 세우지 않고 이어받는다.**
  //   주인이 오래 자리를 비운 땅은 사라지지 않는다. 맡아 두는 쪽(길드·마을)에게 **우선권 창**이 열리고,
  //   그 창이 지나면 누구에게나 열린다. 슬롯·재료는 위에서 이미 똑같이 냈다(공짜가 아니다).
  //   ⚠인접은 안 본다 — 이어받는 자리는 **거기 이미 있는 땅**이지 내가 고른 자리가 아니다.
  if (kind === 'personal') {
    let victim = null, vid = null;
    for (const [cid, c] of claims) {
      if (c.ownerPid === player.playerId || c.kind === 'guild') continue;
      const st = c.state || 'active';
      if (st !== 'pref' && st !== 'free') continue;
      if (!(cx + SZ / 2 >= c.x && cx + SZ / 2 < c.x + c.w && cy + SZ / 2 >= c.y && cy + SZ / 2 < c.y + c.h)) continue;
      victim = c; vid = cid; break;
    }
    if (victim) {
      const t = Claims.takeableBy(player, victim);
      if (!t.ok) { send(player.ws, { type: 'notice', text: `🏠 ${t.why}` }); return; }
      player.inventory.wood -= cost.wood;
      player.inventory.stone -= cost.stone;
      const prevOwner = victim.ownerName;
      const nf = Claims.transfer(vid, victim, player);
      savePlayer(player);
      sendInventory(player);
      send(player.ws, { type: 'notice', text: `🏠 ${prevOwner}이(가) 쓰던 자리를 이어받았다 (${t.why}${nf ? ` · 시설 ${nf}채 승계` : ''})` });
      return;
    }
  }

  // ★★[T45] **인접(4방) — 새 셀은 내 셀과 변을 공유해야 한다.**
  //   대각은 안 된다: 대각으로만 붙은 땅은 걸어서 이어지지 않는다(일관성 원칙의 땅 판).
  //   예외는 셋이고 전부 "첫 셀"의 얼굴이다 — ⓐ 내 셀이 0개 ⓑ 임시(T) ⓒ 온보딩 빈터 권리 구역.
  //   ⚠L-5 소급 안 함: 옛날에 흩뿌려 둔 셀도 "내 셀"로 세므로 그 옆은 계속 이어 붙일 수 있다.
  if (kind === 'personal' && !Onboarding.vacantLotAllows(player, cx + SZ / 2, cy + SZ / 2)) {
    const adj = Claims.adjacencyOf(player.playerId, Math.floor(cx / SZ), Math.floor(cy / SZ));
    if (!adj.ok) {
      send(player.ws, { type: 'notice', text: adj.diag
        ? '🏠 모서리로만 닿는다 — 사유지는 변을 맞대야 이어진다'
        : `🏠 내 사유지에 붙여서만 넓힐 수 있다 (지금 ${adj.mine}칸)` });
      return;
    }
  }

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
  // ★[온보딩 v2 §9.5] 예외 하나 — **마을 어귀 빈터**. 누적 기여를 채운 사람은 그 구역에서만 길드 요건이 면제된다(구역 밖은 종전 그대로).
  const _onbLot = Onboarding.vacantLotAllows(player, cx + SZ / 2, cy + SZ / 2);
  if (kind === 'personal' && !_onbLot) {
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
    // ★[T45] 종류·길드 id 를 **실제로 넣는다** — 이 두 줄이 없어서 재시작마다 종류가 사라졌다.
    kind, guild_tribe_id: kind === 'guild' ? player.tribeId : null,
    state: 'active', held_by: null,
  });
  claim.dbId = dbId;
  savePlayer(player);
  sendInventory(player);
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
  // ★★[T45 2026-09-02] **포기하면 내 땅이 갈라지는가.** ㄷ 자의 **목**을 빼면 거절, **끝**은 허용.
  //   ⚠판정은 "한 덩이여야 한다"가 **아니라** "지금보다 더 갈라지는가"다 — 지금 살아 있는 사람들의
  //     땅은 인접 규칙 없이 흩뿌려져 있어서(§0-ⓐ), 절대 기준으로 짜면 **그 사람들은 아무것도 못 버린다.**
  //     그건 규칙을 소급하는 것과 같다(L-5 위반). 산수는 `claims.js` 정본 하나.
  const sp = Claims.unclaimSplits(player.playerId, claimId);
  if (sp.splits) {
    send(player.ws, { type: 'notice', text: `🏠 여기를 포기하면 내 땅이 ${sp.before}덩이에서 ${sp.after}덩이로 갈라진다 — 끝에서부터 걷어라` });
    return;
  }
  if (c.dbId) db.deleteClaim(c.dbId);
  claims.delete(claimId);
  send(player.ws, { type: 'notice', text: `사유지 해제 (자원은 환불 X)` });
  broadcast({ type: 'claim_removed', id: claimId });
}

// ★★[원장 승격 2026-08-30 재민 확정 §2-A] **인벤에서 빼는 길은 이 함수 하나다.**
//   왜 함수로 모으나: 스칼라만 깎고 원장을 안 건드리면 불변식이 어긋나고, 그걸 쓸개(`Carry.reconcile`)가
//   **뒤에서 잘라** 메운다. 그러면 "2kg 물고기를 먹었는데 0.4kg 짜리가 사라지는" 일이 난다 —
//   수량은 맞는데 **무게가 틀린다**. 조용히 틀리는 종류라 화면으론 절대 안 보인다.
//   여기 하나로 모아 **인벤과 원장을 같이** 깎는다(FIFO — 지목이 필요한 곳은 `tryDropItem` 의 `ids` 경로다).
//   ★원장이 없는 벌크에는 `takeEntries` 가 무해한 무동작이다 — 그래서 모든 소비 경로가 이걸 써도 안전하다.
//   ★키를 지우지 않는다(0 으로 남긴다) — 옛 경로들이 `-=` 로 그렇게 해 왔고, 여기서 지우면
//   인벤을 순회하는 곳들의 동작이 조용히 바뀐다(이 배치는 정비지 개편이 아니다).
function consumeItem(player, item, n) {
  const want = Math.max(0, Math.floor(Number(n) || 0));
  if (!want || !player || !player.inventory) return { kg: 0, entries: [] };
  const have = Math.max(0, Math.floor(Number(player.inventory[item]) || 0));
  const take = Math.min(want, have);
  player.inventory[item] = have - take;
  return Carry.takeEntries(player, item, take);
}

// ★★[원장 승격 2026-08-30 재민 확정] **인벤 전송은 이 함수 하나다.**
//   왜 묶나: 인벤 스칼라와 개체 원장·로트가 **다른 메시지로 갈리면** 화면이 반드시 어긋난다
//   (전리품 표 두 벌 사고의 전송판). 한 메시지 = 한 스냅샷이라야 클라가 셋을 맞춰 그린다.
//   보내기 직전에 쓸개(reconcile)를 돌리고 **불변식을 검사한다** — 어긋나면 조용히 넘어가지 않는다.
//   ★클라가 "무엇이 개체형인가" 표를 들지 않는다: 원장이 실려 오면 펼치고, 안 오면 못 펼친다.
// ★[인벤 마무리 2026-08-30 재민 확정] **수량 0 은 화면에 없다.**
//   서버 맵에는 0 키가 남는다(옛 경로들이 `-=` 로 그렇게 해 왔고 지우면 순회 동작이 조용히 바뀐다).
//   대신 **나가는 페이로드에서** 턴다 — 클라가 0 을 못 받으니 0 행이 구조적으로 안 생긴다.
//   (클라 필터에만 맡기면 다음에 새 목록을 만드는 사람이 또 빠뜨린다 — 원천에서 막는다.)
function invPayload(inv) {
  const out = {};
  for (const [k, v] of Object.entries(inv || {})) {
    const n = Math.floor(Number(v) || 0);
    if (n > 0) out[k] = n;
  }
  return out;
}

function sendInventory(player, where) {
  if (!player || player.isNpc || !player.ws) return;
  const inv = player.inventory || {};
  let led = {}, lots = {};
  // ★★assert 는 **쓸개보다 먼저** 돈다. 뒤에 두면 `reconcile` 이 이미 고쳐 놓은 뒤라
  //   무엇을 검사하든 항상 통과한다 — 이빨 없는 검사다(하네스가 못 잡는다).
  //   여기서 짖는다는 건 "이 경로가 원장을 안 건드리고 스칼라만 깎았다"는 뜻이고,
  //   그건 **어느 개체의 kg 가 사라질지 모른다**는 뜻이다(쓸개는 뒤에서 자른다 ≠ FIFO).
  try { Carry.assertInvariant(player, inv, where || 'sendInventory'); }
  catch (e) { if (process.env.CARRY_ASSERT_THROW === '1') throw e; }
  try {
    led = Carry.viewLedger(player, inv);                       // ★안에서 reconcile(채움·자름)이 돈다
    const today = zoneGameDay();
    for (const it of Object.keys(inv)) if (Lots.isLot(it)) Lots.reconcile(player, it, inv, today);
    lots = Lots.viewAll(player, inv, today);
  } catch (e) { console.warn('[inv] 원장 조립 실패:', e && e.message); }
  send(player.ws, { type: 'inventory', inventory: invPayload(inv), ledger: led, lots });
}

// === Phase 14.23: 바닥 아이템 (좀보이드 world item) ===
// ★★[원장 승격] 바닥템 낳기 — **개체는 개체대로 한 덩이씩** 떨어진다.
//   왜: 물고기 셋을 버리면 바닥에도 셋이어야 "그 중 하나만 다시 줍는다"가 성립한다.
//   벌크(잔가지 10)는 종전대로 한 덩이 — 낱개를 구별할 게 없으니 나눌 이유도 없다.
//   `gi.led` 에는 **kg 만** 싣는다(id 는 버린 사람의 주소다 — 줍는 사람은 새 주소를 받는다).
// ★★[부패 2차 2026-09-01] 바닥에 내려놓을 때 로트를 **레코드째** 실어 보낸다.
//   §0 실측: 여태 줍기가 `Lots.note(…, zoneGameDay())` 라 **버렸다 주우면 새것이 됐다**(상자와 같은 구멍).
//   바닥 배율은 1.0 이라 시간은 손에 든 것과 똑같이 흐른다 — 달라지는 건 "지워지지 않는다"뿐이다.
//   ⇒ 세 갈래(개체 지목·로트 지목·수량)를 각각 고치지 않고 **여기 하나**에서 꺼낸다.
function _takeGroundLots(player, item, total) {
  if (!Lots.isLot(item) || !(total > 0)) return null;
  const recs = Lots.moveOut(player, item, total, player.inventory, zoneGameDay(), 0);
  return recs.length ? recs : null;
}
function _spawnGroundItems(player, item, parcels, lotRecs) {
  const out = [];
  const _gd = zoneGameDay();
  // 로트 레코드를 꾸러미 개수 비율대로 나눠 싣는다(FIFO — 오래된 것이 먼저 나간다).
  let _q = Array.isArray(lotRecs) ? lotRecs.slice() : null;
  const _cut = (need) => {
    if (!_q || !_q.length) return null;
    let left = need; const got = [];
    while (left > 1e-9 && _q.length) {
      const r = _q[0], take = Math.min(left, +r.n || 0);
      if (take <= 1e-9) { _q.shift(); continue; }
      got.push(Object.assign({}, r, { n: +take.toFixed(6) }));
      r.n = +(r.n - take).toFixed(6); left -= take;
      if (r.n <= 1e-9) _q.shift();
    }
    return got.length ? got : null;
  };
  for (const pc of parcels) {
    const ox = (Math.random() - 0.5) * 16, oy = 8 + Math.random() * 8;
    const gid = `g${nextGiId++}`;
    const gi = { id: gid, x: player.x + ox, y: player.y + oy, item, count: pc.n, droppedAt: Date.now(), kg: +(+pc.kg).toFixed(3) };
    if (pc.led && pc.led.length) gi.led = pc.led.map((e) => (Number.isFinite(e.d) ? { kg: e.kg, d: e.d } : { kg: e.kg }));
    const _lr = _cut(pc.n);
    if (_lr) {
      // 바닥의 자리 배율을 찍는다 — 실내 바닥이면 완충이 걸린다(움집 안이 여름에 서늘한 그 이유).
      const _pf = Spoil.placeFields(_placeKeyOfGround(player.x, player.y, player.floor));
      gi.lots = _lr.map((r) => Object.assign({}, r, { m: _pf.m, w: _pf.w, t: _gd }));
    }
    // ★[인벤 마무리] 도구 개체 — 내구도까지 그대로 싣는다(주우면 그 도구가 그대로 돌아온다).
    if (pc.tool) gi.tool = { type: pc.tool.type, d: pc.tool.d | 0, max: pc.tool.max | 0 };
    groundItems.set(gid, gi);
    broadcast({ type: 'ground_item_added', gi });
    out.push(gi);
  }
  return out;
}

// 버리기 — 세 갈래다. **수량**(옛 경로) · **개체 지목**(원장 id) · **로트 지목**(취득일).
//   지목 둘이 이 배치의 핵심이다: 좀보이드식 펼침의 하위 줄이 각각 버려지려면
//   "몇 개"가 아니라 "**어느 것**"을 말할 수 있어야 한다.
function tryDropItem(player, item, amount, opts) {
  opts = opts || {};
  const have = player.inventory[item] || 0;
  const _short = () => send(player.ws, { type: 'notice', text: `${ITEM_LABEL_SERVER[item] || item} 부족` });

  // ── ⓪ 도구 개체 지목 — ★[인벤 마무리 2026-08-30] 도구는 인벤 수량이 아니라 **인스턴스**다.
  //   `toolItems` 는 `{id, type, d, max}` 라 스칼라 맵에 없다 ⇒ 드롭 경로가 아예 없었다
  //   (재민 실기: "도구를 버릴 수가 없다"). 바닥엔 **정체 그대로** 떨어지고 주우면 내구도까지 돌아온다.
  if (opts.toolId) {
    const arr = player.toolItems || [];
    const ix = arr.findIndex((t) => t && t.id === opts.toolId);
    if (ix < 0) { send(player.ws, { type: 'notice', text: '그 도구가 없다' }); return; }
    const inst = arr.splice(ix, 1)[0];
    if (player.equipped === inst.id) { player.equipped = null; }      // 들고 있던 것이면 손에서 놓는다
    if (player.hotkey1 === inst.id) { player.hotkey1 = null; }
    const kg = Weights.kgOfOrDefault(inst.type);
    _spawnGroundItems(player, inst.type, [{ n: 1, kg, tool: { type: inst.type, d: inst.d, max: inst.max } }]);
    sendInventory(player, 'drop:tool');
    send(player.ws, { type: 'tools', toolItems: player.toolItems || [], equipped: player.equipped, hotkey1: player.hotkey1 || null });
    send(player.ws, { type: 'notice', text: `🪓 ${ITEM_LABEL_SERVER[inst.type] || inst.type} 버림 (내구 ${inst.d}/${inst.max})` });
    savePlayer(player);
    return;
  }

  // ── ① 개체 지목 — 2kg 물고기 하나를 골라 버린다 ────────────────────────
  const ids = Array.isArray(opts.ids) ? opts.ids.map(Number).filter(Number.isFinite) : null;
  if (ids && ids.length) {
    if (have <= 0) { _short(); return; }
    Carry.reconcile(player, player.inventory);   // ★지목 전에 채운다 — 표준 몫에도 주소가 있어야 고를 수 있다
    const t = Carry.takeByIds(player, item, ids);
    if (!t.n) { send(player.ws, { type: 'notice', text: '그 개체가 인벤에 없다' }); return; }
    const n = Math.min(t.n, have);
    // ★0 이 돼도 키를 **남긴다** — 옛 경로(`-=`)가 그랬고, 여기서 지우면 인벤을 순회하는
    //   곳들의 동작이 조용히 바뀐다(이 배치는 정비지 개편이 아니다).
    // ★★로트는 **인벤을 깎기 전에** 꺼낸다 — `moveOut` 안의 `reconcile` 이 인벤을 보고
    //   "장부가 남았네" 하며 지워 버린다(1차 실장이 정확히 그래서 바닥템에 로트가 안 실렸다).
    const _lrA = _takeGroundLots(player, item, n);
    player.inventory[item] = have - n;
    _spawnGroundItems(player, item, t.entries.slice(0, n).map((e) => ({ n: 1, kg: e.kg, led: [e] })), _lrA);
    Lots.reconcile(player, item, player.inventory, zoneGameDay());
    sendInventory(player, 'drop:ids');
    savePlayer(player);
    return;
  }

  // ── ② 로트 지목 — 펼친 "3일 전 베리" 줄만 버린다 ─────────────────────
  if (Number.isFinite(opts.lotDay) && Lots.isLot(item)) {
    const want = Math.max(1, Math.min(99, parseInt(amount, 10) || 1));
    const r = Lots.consumeFrom(player, item, opts.lotDay | 0, want, player.inventory);
    const n = Math.floor(r.taken + 1e-9);
    if (n <= 0) { send(player.ws, { type: 'notice', text: '그 로트가 비었다' }); return; }
    const t = Carry.takeEntries(player, item, n);
    // ★로트 지목 갈래는 `consumeFrom` 이 이미 그 로트를 깎았다 — 레코드를 그 자리에서 받아 싣는다.
    _spawnGroundItems(player, item, [{ n, kg: t.kg, led: t.entries }], (r.ages && r.ages.length) ? r.ages : null);
    sendInventory(player, 'drop:lot');
    savePlayer(player);
    return;
  }

  // ── ③ 수량 — 옛 경로 그대로. 다만 **개체형이면 낱개로 떨어진다** ────────
  amount = Math.max(1, Math.min(99, parseInt(amount, 10) || 1));
  if (have < amount) { _short(); return; }
  const _lrC = _takeGroundLots(player, item, amount);   // ★인벤을 깎기 **전에**(위 ① 과 같은 이유)
  player.inventory[item] = have - amount;   // ★0 이어도 키는 남긴다(위와 같은 이유)
  // ★[무게 배치] 버린 개체를 원장에서도 뺀다 — 2kg 물고기를 버리면 2kg 이 빠져야 한다.
  //   그 kg 을 바닥템에 실어, 다시 주우면 **그 무게 그대로** 돌아온다(개체가 안 뭉개진다).
  const t = Carry.takeEntries(player, item, amount);
  Lots.reconcile(player, item, player.inventory, zoneGameDay());
  if (t.entries.length === amount) _spawnGroundItems(player, item, t.entries.map((e) => ({ n: 1, kg: e.kg, led: [e] })), _lrC);
  else _spawnGroundItems(player, item, [{ n: amount, kg: t.kg, led: t.entries.length ? t.entries : null }], _lrC);
  sendInventory(player, 'drop:amount');
  savePlayer(player);
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
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `🔧 ${best.type} 수리 (${best.data.hp}/${maxHp})${best.data.damaged ? '' : ' ✅ 복구'}` });
  broadcast({ type: 'building_damaged', id: best.id, hp: best.data.hp, maxHp, damaged: !!best.data.damaged });
  roomsTouchBuilding(best);   // ★[배치 18 ①] 수리로 다시 경계가 됐다 → 방 복원
  savePlayer(player);
}

function tryPickupItem(player, gid) {
  const gi = groundItems.get(gid);
  if (!gi) return;
  const dist = Math.hypot(gi.x - player.x, gi.y - player.y);
  if (dist > 80) {
    send(player.ws, { type: 'notice', text: '바닥 아이템에서 너무 멀리 있습니다' }); return;
  }
  // ★[인벤 마무리 2026-08-30] 도구 개체는 **인벤 수량이 아니라 인스턴스**로 돌아온다.
  //   id 는 새로 매긴다(남의 주소를 물려받지 않는다 — 개체 원장과 같은 규약). 내구도는 그대로.
  if (gi.tool && gi.tool.type) {
    if (!player.toolItems) player.toolItems = [];
    const mx = gi.tool.max || TOOL_MAX_DURABILITY[gi.tool.type] || 100;
    player.toolItems.push({ id: genToolId(), type: gi.tool.type, d: Math.max(0, Math.min(mx, gi.tool.d | 0)), max: mx });
    groundItems.delete(gid);
    sendInventory(player, 'pickup:tool');
    send(player.ws, { type: 'tools', toolItems: player.toolItems, equipped: player.equipped, hotkey1: player.hotkey1 || null });
    send(player.ws, { type: 'notice', text: `🤚 ${ITEM_LABEL_SERVER[gi.tool.type] || gi.tool.type} 주움 (내구 ${gi.tool.d}/${mx})` });
    savePlayer(player);
    broadcast({ type: 'ground_item_removed', id: gid });
    return;
  }
  player.inventory[gi.item] = (player.inventory[gi.item] || 0) + gi.count;
  // ★★[원장 승격] 개체가 실려 있으면 **그대로** 원장에 돌린다(id 는 새로 매긴다 — 내 주소로 받는다).
  if (Array.isArray(gi.led) && gi.led.length) {
    Carry.noteEntries(player, gi.item, gi.led);
  } else if (gi.kg > 0 && gi.count > 0) {
    // ★옛 바닥템 호환 — 원장 없이 kg 만 실린 것. **표준과 다를 때만** 개체로 친다.
    //   종전엔 무조건 원장을 만들어서, 잔가지를 버렸다 주우면 벌크에 원장이 생겼다
    //   (= 3층 캐논 위반 · UI 에 뜻 없는 ▶ 가 돋는 원인).
    const per = gi.kg / gi.count, std = Weights.kgOfOrDefault(gi.item);
    if (Math.abs(per - std) > 0.005) for (let i = 0; i < gi.count; i++) Carry.noteInstance(player, gi.item, per);
  }
  // ★★[부패 2차 2026-09-01] 바닥템이 로트를 들고 있으면 **그걸 되찾는다**(오늘 것으로 잡지 않는다).
  //   없으면 종전대로 오늘 얻은 것으로 — 자연물 채집·NPC 낙하물이 그 경로다(진짜 새것이 맞다).
  if (Array.isArray(gi.lots) && gi.lots.length && Lots.isLot(gi.item)) {
    Lots.moveIn(player, gi.item, gi.lots, zoneGameDay(), 0, 'carry');   // 주우면 손에 든 것 = 'carry'
  } else Lots.note(player, gi.item, gi.count, zoneGameDay());
  groundItems.delete(gid);
  sendInventory(player, 'pickup');
  send(player.ws, { type: 'notice', text: `🤚 ${ITEM_LABEL_SERVER[gi.item] || gi.item} ×${gi.count} 주움` });
  savePlayer(player);
  broadcast({ type: 'ground_item_removed', id: gid });
}

// 라벨 (notice용)
const ITEM_LABEL_SERVER = {
  wood: '나무', stone: '돌', berry: '베리', fiber: '풀', pillar: '기둥', rafter: '서까래', thatch: '이엉',
  charcoal: '숯', iron_ore: '철 정광', meteoric_iron: '운철(隕鐵)',
  fish: '생선', fish_cooked: '구운생선',
  meat_raw: '날고기', meat_cooked: '구운고기', hide: '가죽',
  berry_jam: '베리잼', water_bottle: '물병', seed_berry: '베리씨앗',
  herb: '약초', ore: '광물',
  food: '곡식', food_cooked: '익힌 곡식',   // ★[곡물 품목화 2026-08-27]
  // ★[빈손 시작 2026-08-28] 땅에서 줍는 것 + 그걸로 엮는 조잡한 석기
  twig: '잔가지', pebble: '자갈',
  crude_axe: '조잡한 돌도끼', crude_pick: '조잡한 돌괭이', crude_blade: '조잡한 돌칼',
  axe: '도끼', pickaxe: '곡괭이', sword: '검',
  // ★[T38 2026-09-01] `plank`(판자)가 **서버 표에만** 없었다 — 클라 사본에는 있어서 여태 안 보였다.
  //   `scripts/test-itemlabel.js` 가 제작 비용 키 19개를 전수로 대조해 찾아냈다(눈으로 찾은 게 아니다).
  plank: '판자',
  salt: '소금',
  // ★[자염 배치 2026-09-01] 짠물 이름표는 `salt.js` 정본에서 가져온다(옮겨 적지 않는다).
  brine: Salt.BRINE_KO,
  item_salt_kiln: '소금가마', item_drying_rack: '건조대', item_workbench: '작업대',
  carrier: '지게',   // ★[T12] 장비 인스턴스 타입 — 재료 부족 알림이 한글로 나가게 한다
};
// ★★[T52 갯벌 2026-09-02] 이 배치의 zone.js 접점은 **둘**이다(병행 세션 셋이 이 파일에 있어 최소로 줄였다):
//   ⓐ 이 주입 한 줄(추가) · ⓑ `tryGather` 의 바다 게이트 한 줄(치환 · 순증 0).
//   ⓑ 는 안 하면 **병 없는 사람이 채집에 도달조차 못 한다**(실클라 하네스가 잡았다 — 보고 §4).
//   갯벌 산출(굴·해조·전복)의 **포만감·이름표·조리 두 종**을 정본이 직접 채운다 —
//   위 두 루프(`PRESERVED_EFFECTS` · `Crops.foodMap`)와 같은 주입 문법이고, 다만 **표의 주인이 채운다**.
//   (zone 이 품목을 다시 나열하면 그게 사본이다 — 자염이 `brine: Salt.BRINE_KO` 로 이미 그 규약을 썼다.)
require('./tidal').install({ FOOD_EFFECTS, ITEM_LABEL_SERVER, COOK_RECIPES });
// ★★★[T59 2026-09-03] **포만감을 여기서 채운다 — 표가 다 모인 마지막 자리다.**
//   위로 올리면 늦게 주입되는 표(작물·보존식·갯벌)가 옛 손글씨 값을 그대로 들고 남는다 —
//   실제로 한 번 그렇게 물렸다(굴 3 · 해조 4 가 T52 의 손글씨였다). ⇒ **주입이 다 끝난 뒤 한 번.**
//   `installCookRecipes` 는 조리식 유도(재료 열량 합 × econ 의 1.12)가 `COOK_RECIPES` 정본을 보게 한다 —
//   `kcal.js` 가 레시피를 옮겨 적으면 그게 사본이다.
Kcal.installCookRecipes(COOK_RECIPES);
for (const k of Object.keys(FOOD_EFFECTS)) FOOD_EFFECTS[k].hunger = Kcal.hungerOf(k, _SEASON_DAY_MS);
// ★[보존 배치 2026-08-31] 보존식 이름은 `spoil.PRESERVED_ITEMS.ko` 가 정본이다 — 옮겨 적지 않는다.
for (const [k, v] of Object.entries(Spoil.PRESERVED_ITEMS)) ITEM_LABEL_SERVER[k] = v.ko;
// ★[작물 층] 작물·씨앗 이름표도 crops 정본에서(옮겨 적지 않는다)
for (const [k, ko] of Object.entries(Crops.labelMap())) ITEM_LABEL_SERVER[k] = ko;

// === 자동 decay: 10분 이상된 ground item 정리 (5초마다 체크) ===
setInterval(() => {
  const now = Date.now();
  for (const [gid, gi] of groundItems) {
    // ★★[T43 · §12] 죽은 자리의 **짐꾸러미는 안 사라진다** — *"짐은 그 자리에 낙하(디스폰 금지)"*.
    //   찾으러 가는 원정이 이 카드의 대가라서, 10분 청소가 그걸 지우면 대가가 0 이 된다.
    if (gi.keep) continue;
    if (now - gi.droppedAt > GROUND_ITEM_LIFETIME_MS) {
      groundItems.delete(gid);
      broadcast({ type: 'ground_item_removed', id: gid });
    }
  }
}, 5000);

// ★★[재민 확정 2026-08-27] **`tryTrade`(T/Y) 제거됨.**
//   무엇이었나: `t`/`y` 키가 80px 안 **가장 가까운 플레이어**와 나무 1 ↔ 돌 1 을 맞바꿨다.
//   왜 지웠나 셋:
//     ① **상대 동의 절차가 없었다** — 남의 인벤에서 물건을 가져가고 알림만 보냈다.
//     ② **경제를 통째로 우회했다** — 같은 마을 거래소가 매기는 값은 나무 1.75 · 돌 0.1677(곡식 환산)로
//        **10배 차이**다. 이 배치가 "값은 마을이 매긴다"를 세운 뒤에도 그 옆에 1:1 고정 교환이 남아 있었다.
//     ③ 프로토타입 화석이었다 — 거래 UI 도 수량 선택도 없이 두 품목이 하드코딩돼 있었다.
//   ★진짜 플레이어 간 거래(**양방향 제안·수락**)는 분업 경제의 핵심이라 언젠가 반드시 필요하다 —
//     설계 골자는 `회부_무게_다음층.md` P항에 적어 뒀다. 여기에 되살리지 마라.

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
// ★★[T48 2026-09-02] 건축 비용의 **지불과 환불을 같은 표로** 걷는다.
//   종전엔 차감이 다섯 줄(plank·wood·stone·seed·fiber)인데 계단 롤백은 **세 줄**이었다 —
//   `seed`·`fiber` 를 되돌리지 않는다. 오늘은 계단 비용이 판자뿐이라 안 터지지만, 그건
//   **비용표가 안 바뀌는 동안만** 참인 안전이다(T48 이 `VillageLayout` 에서 만난 그 모양 그대로:
//   지금 무해한 이유가 다른 곳의 우연에 기대고 있으면 그건 아직 안 터진 것이다).
//   ⇒ 한 함수가 부호만 바꿔 두 번 걷는다. 이제 비용표가 늘어도 지불과 환불이 갈릴 수 없다.
function _buildCostPay(player, cost, sign) {
  if (!cost) return;
  const inv = player.inventory;
  if (cost.plank) inv.plank = (inv.plank || 0) + sign * cost.plank;
  if (cost.wood)  inv.wood  = (inv.wood  || 0) + sign * cost.wood;
  if (cost.stone) inv.stone = (inv.stone || 0) + sign * cost.stone;
  if (cost.seed)  inv[cost.seed] = (inv[cost.seed] || 0) + sign;
  if (cost.fiber) inv.fiber = (inv.fiber || 0) + sign * cost.fiber;
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
      _buildCostPay(player, cost, -1);   // ★[T48] 지불 — 환불과 같은 표를 걷는다
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
    sendInventory(player);
    savePlayer(player);
    broadcast({ type: 'building_added', building });
    roomsTouchBuilding(building);   // ★[배치 18 ①] 벽·문·바닥이 생겼다 → 그 자리 방만 다시 본다
    // §4-4 Stage 4B(§5.5b): 통행 차단형(wall) 설치 → 교역 거리행렬·캐러밴 경로 무효화(다음 게임일 재계산)
    if (type === 'wall') SimVillages.invalidateTradeDistances(useCx, useCy);
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
  // ★★[2026-08-04d 배치 18 ③] **공중 건축 금지 — 위층은 아래층 '방' 위에만.**
  //   재민 확정: "2층 배치는 1층 방 위에서만". 종전 규칙(아래층에 벽 **또는** 바닥 한 칸)은
  //   허공에 벽 한 장 세우고 그 위에 2층을 이어 붙이는 길을 열어 뒀다.
  //   ⇒ 아래 칸이 **닫힌 방**(①의 판정 — 벽·문으로 닫히고 바닥이 다 깔린 것)에 속해야 한다.
  //     기둥 역학까지는 안 간다(인계: "구조 제약은 최소") — 방 하나면 충분히 설명되는 규칙이다.
  //   ⚠계단이 만드는 자동 바닥(_autoFloorId)은 이 경로를 안 탄다(서버가 직접 넣는다) — 계단 착지는 그대로.
  if (floor > 0) {
    const _bcx = Math.floor(gx / BUILDING_SIZE), _bcy = Math.floor(gy / BUILDING_SIZE);
    if (!Rooms.roomIdAt(_bcx, _bcy, floor - 1)) {
      // 아래층이 방이 아니면, 그래도 **이미 그 층에 바닥이 깔린 칸**은 이어 짓게 둔다(2층 방을 완성하는 길).
      let onOwnFloor = false;
      for (const b of nearBuilds) {
        if (Math.abs(b.x - gx) < BUILDING_SIZE && Math.abs(b.y - gy) < BUILDING_SIZE && (b.floor || 0) === floor && b.type === 'floor') { onOwnFloor = true; break; }
      }
      if (!onOwnFloor) { send(player.ws, { type: 'notice', text: `${floor}F 는 ${floor - 1}F **방**(벽으로 닫히고 바닥이 다 깔린 곳) 위에만 지을 수 있습니다` }); return false; }
    }
  }

  if (!skipCost) {
    _buildCostPay(player, cost, -1);   // ★[T48] 지불
  }
  let initialData = null;
  if (type === 'chest') initialData = { wood: 0, stone: 0 };
  else if (type === 'farmland') initialData = _farmlandData(player);   // ★[작물 층] 심은 작물이 있으면 작물 농지
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
        _buildCostPay(player, cost, +1);   // ★[T48] 환불 — 지불과 **같은 표**(종전엔 seed·fiber 를 빠뜨렸다)
        sendInventory(player);
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
        _buildCostPay(player, cost, +1);   // ★[T48] 환불 — 지불과 **같은 표**(종전엔 seed·fiber 를 빠뜨렸다)
        sendInventory(player);
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

  sendInventory(player);
  savePlayer(player);
  broadcast({ type: 'building_added', building });
  if (autoFloorBuilding) broadcast({ type: 'building_added', building: autoFloorBuilding });
  // §4-4 Stage 4B(§5.5b): 통행 차단형(fence — cell 진입 차단) 설치 → 교역 거리행렬·캐러밴 경로 무효화
  if (type === 'fence') SimVillages.invalidateTradeDistances(Math.floor(gx / BUILDING_SIZE), Math.floor(gy / BUILDING_SIZE));
  return true;
}

// ★[사용자 확정] 길드 곳간 실물화 — 금고(JSON) 대신 공간에 실재하는 공유 창고(일관성 원칙: 아이템=공간 실체).
//   조건: 길드 리더 · 자기 길드영토(kind guild claim) 안 · 5×3+테두리 부지 무결 · 판자 12+돌 8 · 길드당 1동(존 기준).
//   상호작용=기존 chest 경로(put/take 공용) — 멤버 자유 입출, 적은 전쟁 중에만 loot_rate 약탈(물리 약탈 목표 1단).
//   배치=플레이어 북쪽 3칸(발자국 [gx-2..gx+2]×[gy-4..gy-2] — 시전자가 벽 안에 갇히지 않게). 밀폐 벽(사다리 출입 고증).
// ★공용: 실물 건물 행 생성(DB+메모리+청크) — 곳간·움집 완공이 공용(유일 경로)
function _liveBuildRow(type, x, y, data, ownerId, ownerName, made) {
  const dbId = db.insertBuilding({ type, owner_id: ownerId, owner_name: ownerName, x, y, data: JSON.stringify(data) });
  const bo = { id: `b${dbId}`, dbId, type, ownerId, ownerName, x, y, data, floor: 0 };
  buildings.set(bo.id, bo); chunkManager.insertBuilding(bo); if (made) made.push(bo);
  return bo;
}
// ★[사용자 확정 "건축 순서 고증"] 움집 다단계 건축 — 수혈주거 축조 공정(발굴 순서):
//   ① 수혈 굴착(곡괭이 — 깊이 반지하 터파기) → ② 굴립주 기둥 6주(도끼 다듬은 통나무) → ③ 도리·서까래 골조(풀 결속) → ④ 이엉 지붕 잇기 → 완공.
//   완공 실체 = NPC 움집과 동일 6×4(벽=변·남벽 2칸 문·바닥). 발자국 [gx-3..gx+2]×[gy-4..gy-1](시전자 북쪽 — 갇힘 방지), 문 = 남벽 중앙 2칸.
const HUT_STAGES = [
  { need: {},                        tool: 'pickaxe', wear: 3, label: '① 수혈 굴착(터파기)' },
  { need: { pillar: 6 },                                       label: '② 굴립주 기둥 세우기(기둥 6)' },
  { need: { rafter: 8, fiber: 6 },                             label: '③ 도리·서까래 골조(서까래 8·풀 6)' },
  { need: { thatch: 8 },                                       label: '④ 이엉 지붕 잇기(이엉 8)' },
];
function tryHutStart(player, atX, atY) {
  const SZg = BUILDING_SIZE;
  let x0, y0, x1, y1;
  if (Number.isFinite(atX) && Number.isFinite(atY)) {
    // ★건축모드 커서 배치[사용자 지시 "좀보이드 스타일"] — 커서 셀 중심 6×4
    if (Math.hypot(atX - player.x, atY - player.y) > 200) { send(player.ws, { type: 'notice', text: '너무 멀어서 거기에 못 팜' }); return; }
    const cx = Math.floor(atX / SZg), cy = Math.floor(atY / SZg);
    x0 = cx - 3; y0 = cy - 2; x1 = cx + 2; y1 = cy + 1;
  } else {
    // 폴백(구식): 시전자 북쪽
    const gx = Math.round(player.x / SZg), gy = Math.round(player.y / SZg);
    x0 = gx - 3; y0 = gy - 4; x1 = gx + 2; y1 = gy - 1;
  }
  const st = HUT_STAGES[0];
  if (!hasTool(player, st.tool)) { send(player.ws, { type: 'notice', text: `${st.label} — 곡괭이 필요` }); return; }
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = y0 - 1; y <= y1 + 1; y++) {
    const px = x * SZg + SZg / 2, py = y * SZg + SZg / 2;
    if (isTerrainBlockedLocal(px, py)) { send(player.ws, { type: 'notice', text: '물·바위를 피해서 파야 합니다' }); return; }
    for (const c of claims.values()) {
      if (c.ownerPid !== player.playerId && px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h) {
        send(player.ws, { type: 'notice', text: '다른 사람의 사유지엔 못 지음' }); return;
      }
    }
  }
  const ctrX = ((x0 + x1 + 1) / 2) * SZg, ctrY = ((y0 + y1 + 1) / 2) * SZg;
  const nearB = qtBuildings ? qtBuildings.queryCircle(ctrX, ctrY, SZg * 6) : Array.from(buildings.values());
  for (const b of nearB) {
    const bcx = Math.round((b.x - (b.type === 'wall' ? 0 : SZg / 2)) / SZg), bcy = Math.round((b.y - (b.type === 'wall' ? 0 : SZg / 2)) / SZg);
    if (bcx >= x0 - 1 && bcx <= x1 + 1 && bcy >= y0 - 1 && bcy <= y1 + 1 && (b.floor || 0) === 0) {
      send(player.ws, { type: 'notice', text: '자리에 다른 건축물이 있습니다' }); return;
    }
  }
  consumeToolByType(player, st.tool, st.wear || 1);
  const data = { stage: 1, x0, y0, x1, y1, owner: player.playerId, floor: 0 };
  const bo = _liveBuildRow('hut_site', ctrX, ctrY, data, player.playerId, `${player.name}의 움집터`, null);
  broadcast({ type: 'building_added', building: bo });
  send(player.ws, { type: 'notice', text: `⛏️ ${st.label} 완료 — 다음: ${HUT_STAGES[1].label} (움집터 클릭)` });
  console.log(`[${ZONE_ID}] ⛏️ ${player.name} 움집터 굴착 [${x0}..${x1}]×[${y0}..${y1}]`);
}
// ★★[11차 T4] 마을 NPC 크루에게 집 짓기를 의뢰한다 — 랩 10차 B안의 서버 접점.
//   대가 = **재료 선납**(사용자 확정). 움집 4단계의 중간재 3종을 지정 시점에 한 번에 낸다.
//   ┌ 왜 선납인가: econ 엔진 무접촉을 지키려면 물리 자재 소비가 가장 안전하다(설계안 §2-2).
//   │ 왜 중간재 3종인가: 굴립주(pillar)·도리서까래(rafter)·이엉(thatch)이 HUT_STAGES ②③④의 실물이고,
//   └ 이건 플레이어가 이미 만들 줄 아는 것들이다(기존 크래프트 경로 재사용 — 발명 0).
//   부족하면 **지정 자체를 거절**한다(외상 없음 — 진행 중 미납 상태라는 새 개념을 만들지 않기 위해).
const PSITE_COST = { pillar: 6, rafter: 8, thatch: 8 };   // = HUT_STAGES ②굴립주6 ③서까래8 ④이엉8 (fiber는 원자재라 제외)
function tryRequestVillageHouse(player, atX, atY) {
  if (!Number.isFinite(atX) || !Number.isFinite(atY)) { send(player.ws, { type: 'notice', text: '자리를 지정해 주세요' }); return; }
  if (Math.hypot(atX - player.x, atY - player.y) > 400) { send(player.ws, { type: 'notice', text: '너무 멀어서 거기에 의뢰할 수 없다' }); return; }
  const cx = Math.floor(atX / BUILDING_SIZE), cy = Math.floor(atY / BUILDING_SIZE);
  const vil = SimVillages.villageOwningCell ? SimVillages.villageOwningCell(cx, cy) : null;
  if (!vil) { send(player.ws, { type: 'notice', text: '마을 영토 안에서만 의뢰할 수 있다' }); return; }
  // ★재료 검사 먼저(거절이면 상태를 아무것도 안 바꾼다) → 자리 검사 → 그 다음에야 차감.
  const lack = [];
  for (const [it, amt] of Object.entries(PSITE_COST)) if ((player.inventory[it] || 0) < amt) lack.push(`${ITEM_LABEL_SERVER[it] || it} ${player.inventory[it] || 0}/${amt}`);
  if (lack.length) { send(player.ws, { type: 'notice', text: `재료 선납 부족 — ${lack.join(' · ')}` }); return; }
  const r = SimVillages.lifeRequestPlayerSite(vil, cx, cy, player.playerId, `${player.name}의 의뢰 움집`);
  if (!r || r.err) { send(player.ws, { type: 'notice', text: `의뢰 불가 — ${(r && r.err) || '알 수 없음'}` }); return; }
  for (const [it, amt] of Object.entries(PSITE_COST)) consumeItem(player, it, amt);   // ★자리 확정 뒤 차감(실패 시 재료가 사라지지 않게) · [원장 승격]
  sendInventory(player);
  const costStr = Object.entries(PSITE_COST).map(([k, v]) => `${ITEM_LABEL_SERVER[k] || k} ${v}`).join(' · ');
  send(player.ws, { type: 'notice', text: `🏠 ${vil.name} 크루에게 집 짓기를 의뢰했다 (${costStr} 선납) — 마을 일이 없을 때 지어 준다` });
  console.log(`[${ZONE_ID}] 🏠 ${player.name} → ${vil.name} 집 의뢰 @(${cx},${cy}) 선납 ${costStr}`);
}
function tryHutAdvance(player, buildingId) {
  Body.onLabor(player, 1.5);   // ★[신체 상태] 건설이 제일 고되다
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'hut_site') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 120) { send(player.ws, { type: 'notice', text: '움집터에서 너무 멀리 있습니다' }); return; }
  if (b.data.owner !== player.playerId) { send(player.ws, { type: 'notice', text: '내 움집터가 아닙니다' }); return; }
  const stage = b.data.stage | 0;
  const st = HUT_STAGES[stage];
  if (!st) return;
  for (const [it, amt] of Object.entries(st.need)) {
    if ((player.inventory[it] || 0) < amt) {
      const needStr = Object.entries(st.need).map(([k, v]) => `${ITEM_LABEL_SERVER[k] || k} ${player.inventory[k] || 0}/${v}`).join(' · ');
      send(player.ws, { type: 'notice', text: `${st.label} — 재료 부족: ${needStr}` }); return;
    }
  }
  for (const [it, amt] of Object.entries(st.need)) consumeItem(player, it, amt);   // ★[원장 승격]
  if (stage < 3) {
    b.data.stage = stage + 1;
    db.updateBuildingData(b.dbId, JSON.stringify(b.data));
    broadcast({ type: 'building_added', building: b });
    send(player.ws, { type: 'notice', text: `${st.label} 완료 — 다음: ${HUT_STAGES[stage + 1].label}` });
  } else {
    // ④ 완공 — 터 제거 + NPC 정본 6×4 실체화(벽=변·남벽 2칸 문·바닥·앵커)
    const { x0, y0, x1, y1 } = b.data;
    buildings.delete(b.id); if (chunkManager.removeBuilding) chunkManager.removeBuilding(b); db.deleteBuilding(b.dbId);
    broadcast({ type: 'building_removed', id: b.id });
    const SZg = BUILDING_SIZE, made = [];
    const doorXs = new Set([x0 + 2, x0 + 3]);   // 남벽 중앙 2칸(NPC 움집 문 규약 동형)
    const oid = player.playerId, onm = `${player.name}의 움집`;
    const _hutTag = [x0, y0, x1, y1];   // ★클라 v3 반수혈 스킨 태그(NPC 움집과 동일 외형 — 물리 불변)
    for (let x = x0; x <= x1; x++) {
      _liveBuildRow('wall', x * SZg, y0 * SZg, { side: 'N', floor: 0, hut: _hutTag }, oid, onm, made);
      if (!doorXs.has(x)) _liveBuildRow('wall', x * SZg, (y1 + 1) * SZg, { side: 'N', floor: 0, hut: _hutTag }, oid, onm, made);
    }
    for (let y = y0; y <= y1; y++) { _liveBuildRow('wall', x1 * SZg, y * SZg, { side: 'E', floor: 0, hut: _hutTag }, oid, onm, made); _liveBuildRow('wall', (x0 - 1) * SZg, y * SZg, { side: 'E', floor: 0, hut: _hutTag }, oid, onm, made); }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) _liveBuildRow('floor', x * SZg + SZg / 2, y * SZg + SZg / 2, { floor: 0, hut: _hutTag }, oid, onm, made);
    _liveBuildRow('hut', ((x0 + x1 + 1) / 2) * SZg, ((y0 + y1 + 1) / 2) * SZg, { owner: player.playerId, floor: 0 }, oid, onm, made);
    broadcast({ type: 'buildings_spawn', buildings: made });
    send(player.ws, { type: 'notice', text: '🏠 움집 완공! (수혈 굴착→굴립주→골조→이엉 — 고증 공정 완주)' });
    console.log(`[${ZONE_ID}] 🏠 ${player.name} 움집 완공 @(${x0}..${x1},${y0}..${y1})`);
  }
  savePlayer(player);
  sendInventory(player);
}

// ═══ ★[재민 확정 2026-08-02] 노(爐) — "집이랑 비슷하게, 터를 먼저 잡고 필요 자원을 모아 투입하고
//     시간을 들여 진척도를 채우면 건설. 길드 사유지 또는 개인 사유지에만. 개인 것엔 타인 관여 불가." ═══
//   움집(HUT_STAGES) 계약 완전 동형 — 발명 0. 다른 점 둘뿐:
//     · **사유지 필수**(움집은 남의 사유지만 피하면 됐다): 개인=본인만, 길드=같은 길드원만(건설·조업 동일 규칙)
//     · 완공물이 조업 설비다: 철 정광 + 숯 → era.js 물리(smeltYield)대로 철. 청동기엔 수율 3.4% —
//       "거의 불가능"이 노를 지어도 유지되고, 시대가 열리면 같은 노가 67.8%를 낸다(지식이 풀린 것).
const FURNACE_STAGES = [
  { need: { stone: 6 },            tool: 'pickaxe', wear: 2, label: '① 노 터 다지기(돌 기초 6)' },
  { need: { stone: 8, wood: 4 },                            label: '② 노벽 쌓기(돌 8·통나무 4)' },
  { need: { hide: 4, wood: 2 },                             label: '③ 풀무 걸기(가죽 4·통나무 2)' },
];
// ★★[2026-08-02] 노 티어 — kind 파라미터화. **게이트는 era.hasTech 하나뿐이다**(표 복제 금지).
//   도가니로(crucible)는 청동기 tech 라 늘 지을 수 있고, 괴련로(bloomery)는 early_iron 이 열려야 한다.
//   고증: 괴련로는 "더 뜨거운 도가니"가 아니라 **환원 분위기를 유지하도록 설계된 원통 노**다 —
//   더 크고(돌·통나무 더 많이), 송풍구가 따로 있다. 그래서 공정 자재가 더 든다.
//   ⇒ 새 노를 추가할 때 고칠 곳은 이 표 하나. 온도·수율은 era.js FURNACE 가 이미 안다.
const FURNACE_KINDS = {
  crucible: { ko: '도가니로', stages: FURNACE_STAGES },
  bloomery: { ko: '괴련로', stages: [
    { need: { stone: 10 },           tool: 'pickaxe', wear: 3, label: '① 괴련로 터 다지기(돌 기초 10)' },
    { need: { stone: 14, wood: 6 },                            label: '② 원통 노벽 쌓기(돌 14·통나무 6)' },
    { need: { hide: 6, wood: 4 },                              label: '③ 송풍구·풀무 걸기(가죽 6·통나무 4)' },
  ] },
};
const FURNACE_FUEL_PER_ORE = 2;   // 정광 1덩이(3.5kg)당 숯 2 — 고증: 제련 연료는 광석의 수 배 무게

// ═══ ★[2026-08-02] 숯가마(炭窯) — 노와 **같은 건설 계약**(사유지·2×2·단계·재료) ═══
//   고증: 노천 탄화(구덩이에 덮어 굽기)는 수율이 나쁘다 — 공기가 새 들어가 상당량이 그냥 재가 된다.
//   진짜 탄요는 밀폐된 가마에 연도(굴뚝)를 내어 공기를 통제한다. 같은 나무로 숯이 훨씬 많이 나온다.
//   ⇒ 제작창 레시피(통나무 3 → 숯 2)는 노천 탄화로 남기고, 가마를 지으면 통나무 3 → 숯 4.
//   가마는 풀무가 필요 없다(불을 불려 태우는 게 아니라 **공기를 막아** 찌는 것) — 그래서 2단계다.
const CHARCOAL_KILN_STAGES = [
  { need: { stone: 4 },            tool: 'pickaxe', wear: 2, label: '① 가마 구덩이 파기(돌 기초 4)' },
  { need: { stone: 6, wood: 2 },                            label: '② 가마 봉토·연도 내기(돌 6·통나무 2)' },
];
const CHARCOAL_KILN_WOOD = 3;    // 1회 조업 장입량(통나무)
const CHARCOAL_KILN_YIELD = 4;   // 1회 산출(숯) — 제작창 노천 탄화는 같은 통나무 3에 숯 2
// ★[2026-08-02d ④] 가득 채우기 상한 — 한 번 클릭에 최대 몇 회분을 굽나. **가마 용량이 아니라 UI 폭주 방지**다
//   (인벤 통나무 999를 한 클릭에 333회 돌려 로그·저장이 튀는 것만 막는다). 수지는 1회 조업 ×n 로 정확히 같다.
const KILN_BATCH_MAX = 20;
// ═══ ★★[2026-08-02e ⑤ 재민 승인] 조업 진척 계약 — 장입 → 시간 → 출탕 ═══════════
//   배치 5 에서 회부했던 것(회부_노_조업시간_계약.md)을 재민이 "전부 해결" 지시로 풀었다.
//   ★NPC 크루 공식(`_crewD/L_BUILDSEC` = 현장 체류 초)은 **쓰지 않는다** — 플레이어 축엔
//     '현장 체류 초'라는 상태가 없다. 플레이어 전용 상수를 새로 정의하되, era.js 물리와 모순되지 않게:
//     **노가 뜨거울수록 짧다.** 시간의 근거를 온도에 두면 상수가 자의적이지 않고 era 축과 한 몸이 된다.
//   ★계약(재민 지시 그대로):
//     · 장입(정광·숯 즉시 차감) → `data.job = { until, ... }` → 완료 후 클릭하면 출탕
//     · **대기 중 이탈해도 진척 보존** — 벽시계 기반이라 접속을 끊어도 흐른다(농지 readyAt 선례).
//     · 숯가마도 같은 계약(통나무 장입 → 시간 → 숯 수거).
//   ★왜 벽시계인가: 농지(`readyAt`)가 이미 그 계약이고, 서버 재시작·재접속을 자동으로 건너뛴다.
//     "불 붙여 놓고 로그아웃"이 최적 전략이 되는 건 **의도한 것**이다 — 청동기 제련은 원래 몇 시간 걸린다.
const SMELT_BASE_MS = 180000;        // 기준 조업 시간(3분) — 1,150℃(도가니로+숯+풀무) 기준
const SMELT_MIN_MS  = 45000;         // 하한 45초(고로급이어도 클릭 연타 게임이 되지 않게)
const KILN_BURN_MS  = 240000;        // 숯가마 1회분 4분 — 밀폐 탄화는 제련보다 느리다(고증)
const KILN_BATCH_MS_PER = 30000;     // 배치 1회분 추가 시간(가득 채우면 그만큼 오래 걸린다 — 수지 불변 원칙의 시간판)
// 노 온도(era.js furnaceTemp)가 높을수록 짧다: t = BASE × (1150 / T)^1.5, 하한 SMELT_MIN_MS.
//   1150℃ → 180초 · 1300℃(괴련로) → 148초 · 1450℃(개량) → 126초. 물리가 시간을 정한다.
function _smeltDurationMs(kind) {
  const Era = require('./era');
  const T = Era.furnaceTemp({ furnace: kind || 'crucible', fuel: 'charcoal', bellows: true });
  if (!(T > 0)) return SMELT_BASE_MS;
  return Math.max(SMELT_MIN_MS, Math.round(SMELT_BASE_MS * Math.pow(1150 / T, 1.5)));
}
// 진척 0~1 — 클라 게이지와 서버 판정이 **같은 식**을 쓰도록 서버가 계산해 내려 준다.
function _jobProgress(job, now) {
  if (!job || !job.until || !job.startedAt) return 0;
  const span = job.until - job.startedAt;
  if (!(span > 0)) return 1;
  return Math.max(0, Math.min(1, (now - job.startedAt) / span));
}
function _furnaceClaimOf(player, px, py) {
  // 이 좌표를 덮는 사유지 중 플레이어에게 권한이 있는 것 — 개인(본인) 또는 길드(같은 길드).
  for (const c of claims.values()) {
    if (!(px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h)) continue;
    if (c.kind === 'guild') { if (player.tribeId && c.guildTribeId === player.tribeId) return c; continue; }
    if (c.ownerPid === player.playerId) return c;   // personal/temporary — 본인 것만
  }
  return null;
}
function _furnaceCanUse(player, b) {
  const d = b.data || {};
  if (d.tribeId) return !!player.tribeId && player.tribeId === d.tribeId;   // 길드 노 — 같은 길드원
  return d.owner === player.playerId;                                        // 개인 노 — 본인만(타인 관여 불가)
}
// ★★사유지 판정은 **셀마다** 한다 [2026-08-02 — scripts/test-furnace.js 가 잡은 버그]
//   전에는 클릭 지점을 덮는 사유지 **하나**를 찾아 그 사각 안에 2×2 발자국이 들어가는지 봤다.
//   그런데 사유지 한 장은 `w = h = BUILDING_SIZE` = **정확히 1셀**이다(tryClaim:4111 · 마을 영토도
//   1셀짜리를 원형으로 깔아 만든다). 1셀 사각에 2×2 는 영원히 안 들어간다 ⇒ **노를 아예 못 지었다.**
//   사유지는 타일을 이어 붙여 넓히는 물건이니 발자국 검사도 타일 단위여야 한다. 네 셀 전부에
//   권한이 있어야 짓는다. (하네스 없이 코드만 읽어서는 안 보이던 좌표 기하 버그 — 실행 검증의 값.)
// 반환: { tribeId } 성공(개인이면 null) · { err } 실패
function _claimFootprint(player, x0, y0, x1, y1) {
  const SZg = BUILDING_SIZE;
  let anyPersonal = false, guildId = null;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const px = x * SZg + SZg / 2, py = y * SZg + SZg / 2;
    const c = _furnaceClaimOf(player, px, py);
    if (!c) return { err: '발자국 2×2 전체가 내 사유지(또는 내 길드 사유지) 안에 있어야 한다' };
    if (c.kind === 'guild') { if (guildId == null) guildId = c.guildTribeId; }
    else anyPersonal = true;   // 개인·임시 사유지가 한 칸이라도 물리면 **개인 소유**로 굳는다
  }
  // 개인 사유지가 한 칸이라도 걸치면 개인 것(타인 관여 불가). 전부 길드 땅일 때만 길드 공용.
  return { tribeId: anyPersonal ? null : guildId };
}
// ★2×2 사유지 설치물의 **공용** 착공/시공 — 노와 숯가마가 같은 계약을 쓴다(복제 금지).
//   spec = { siteType, doneType, ko, icon, stages, kind }
function _siteStart(player, atX, atY, spec) {
  if (!Number.isFinite(atX) || !Number.isFinite(atY)) { send(player.ws, { type: 'notice', text: '자리를 지정해 주세요' }); return; }
  if (Math.hypot(atX - player.x, atY - player.y) > 200) { send(player.ws, { type: 'notice', text: '너무 멀어서 거기에 못 지음' }); return; }
  const SZg = BUILDING_SIZE;
  const cx = Math.floor(atX / SZg), cy = Math.floor(atY / SZg);
  const x0 = cx, y0 = cy, x1 = cx + 1, y1 = cy + 1;   // 2×2
  const cl = _claimFootprint(player, x0, y0, x1, y1);
  if (cl.err) { send(player.ws, { type: 'notice', text: `${spec.ko} — ${cl.err}` }); return; }
  const st = spec.stages[0];
  if (st.tool && !hasTool(player, st.tool)) { send(player.ws, { type: 'notice', text: `${st.label} — ${ITEM_LABEL_SERVER[st.tool] || st.tool} 필요` }); return; }
  for (const [it, amt] of Object.entries(st.need)) {
    if ((player.inventory[it] || 0) < amt) { send(player.ws, { type: 'notice', text: `${st.label} — 재료 부족: ${ITEM_LABEL_SERVER[it] || it} ${player.inventory[it] || 0}/${amt}` }); return; }
  }
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const px = x * SZg + SZg / 2, py = y * SZg + SZg / 2;
    if (isTerrainBlockedLocal(px, py)) { send(player.ws, { type: 'notice', text: '물·바위를 피해서 지어야 한다' }); return; }
  }
  const ctrX = ((x0 + x1 + 1) / 2) * SZg, ctrY = ((y0 + y1 + 1) / 2) * SZg;
  const nearB = qtBuildings ? qtBuildings.queryCircle(ctrX, ctrY, SZg * 4) : Array.from(buildings.values());
  for (const b of nearB) {
    const bcx = Math.round((b.x - (b.type === 'wall' ? 0 : SZg / 2)) / SZg), bcy = Math.round((b.y - (b.type === 'wall' ? 0 : SZg / 2)) / SZg);
    if (bcx >= x0 && bcx <= x1 && bcy >= y0 && bcy <= y1 && (b.floor || 0) === 0) { send(player.ws, { type: 'notice', text: '자리에 다른 건축물이 있습니다' }); return; }
  }
  if (st.tool) consumeToolByType(player, st.tool, st.wear || 1);
  for (const [it, amt] of Object.entries(st.need)) consumeItem(player, it, amt);   // ★[원장 승격]
  const data = { stage: 1, x0, y0, x1, y1, owner: player.playerId, tribeId: cl.tribeId || null, kind: spec.kind || null, floor: 0 };
  const bo = _liveBuildRow(spec.siteType, ctrX, ctrY, data, player.playerId, `${player.name}의 ${spec.ko} 터`, null);
  broadcast({ type: 'building_added', building: bo });
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `⛏️ ${st.label} 완료 — 다음: ${spec.stages[1].label} (${spec.ko} 터 클릭)` });
  console.log(`[${ZONE_ID}] ${spec.icon} ${player.name} ${spec.ko} 터 @(${x0},${y0}) ${cl.tribeId ? 'guild' : 'personal'}`);
  return bo;
}
function _siteAdvance(player, b, spec) {
  if (Math.hypot(b.x - player.x, b.y - player.y) > 120) { send(player.ws, { type: 'notice', text: `${spec.ko} 터에서 너무 멀리 있습니다` }); return; }
  if (!_furnaceCanUse(player, b)) { send(player.ws, { type: 'notice', text: b.data.tribeId ? `우리 길드의 ${spec.ko} 터가 아닙니다` : `내 ${spec.ko} 터가 아닙니다` }); return; }
  const stage = b.data.stage | 0;
  const st = spec.stages[stage];
  if (!st) return;
  for (const [it, amt] of Object.entries(st.need)) {
    if ((player.inventory[it] || 0) < amt) {
      const needStr = Object.entries(st.need).map(([k, v]) => `${ITEM_LABEL_SERVER[k] || k} ${player.inventory[k] || 0}/${v}`).join(' · ');
      send(player.ws, { type: 'notice', text: `${st.label} — 재료 부족: ${needStr}` }); return;
    }
  }
  for (const [it, amt] of Object.entries(st.need)) consumeItem(player, it, amt);   // ★[원장 승격]
  let done = null;
  if (stage < spec.stages.length - 1) {
    b.data.stage = stage + 1;
    db.updateBuildingData(b.dbId, JSON.stringify(b.data));
    broadcast({ type: 'building_added', building: b });
    send(player.ws, { type: 'notice', text: `${st.label} 완료 — 다음: ${spec.stages[stage + 1].label}` });
  } else {
    const { x0, y0, owner, tribeId, kind } = b.data;
    buildings.delete(b.id); if (chunkManager.removeBuilding) chunkManager.removeBuilding(b); db.deleteBuilding(b.dbId);
    broadcast({ type: 'building_removed', id: b.id });
    done = _liveBuildRow(spec.doneType, b.x, b.y, { owner, tribeId, kind: kind || spec.kind || null, x0, y0, floor: 0 }, owner, `${player.name}의 ${spec.ko}`, null);
    broadcast({ type: 'building_added', building: done });
    send(player.ws, { type: 'notice', text: `${spec.icon} ${spec.ko} 완공! — ${spec.doneHint}` });
    console.log(`[${ZONE_ID}] ${spec.icon} ${player.name} ${spec.ko} 완공 @(${x0},${y0})`);
    // ★★[2026-08-03e 배치 12 ①] 완공 훅 — 회관은 **완공이 곧 마을 등록**이다(노·숯가마는 훅이 없다).
    //   실패해도 건물은 남긴다(플레이어가 쓴 재료를 삼키지 않는다) — 사유만 알리고 다시 시도하게 한다.
    if (spec.onDone) {
      try { spec.onDone(player, done, { x0, y0, tribeId, owner }); }
      catch (e) { console.error(`[${ZONE_ID}] ${spec.icon} 완공 훅 실패:`, e.message); send(player.ws, { type: 'notice', text: `${spec.ko} 는 섰지만 마을 등록에 실패했다: ${e.message}` }); }
    }
  }
  savePlayer(player);
  sendInventory(player);
  return done;
}
// ★노 종류(kind)는 **era.hasTech 하나로** 잠긴다 — 청동기엔 도가니로만 목록에 뜬다.
function _furnaceSpec(kind) {
  const k = FURNACE_KINDS[kind] ? kind : 'crucible';
  return { siteType: 'furnace_site', doneType: 'furnace', ko: `노(${FURNACE_KINDS[k].ko})`, icon: '🔥',
           stages: FURNACE_KINDS[k].stages, kind: k, doneHint: '철 정광 + 숯을 들고 노를 클릭하면 제련한다' };
}
const KILN_SPEC = { siteType: 'kiln_site', doneType: 'charcoal_kiln', ko: '숯가마', icon: '🪵',
                    stages: CHARCOAL_KILN_STAGES, kind: 'charcoal_kiln',
                    doneHint: `통나무 ${CHARCOAL_KILN_WOOD}을 들고 클릭하면 숯 ${CHARCOAL_KILN_YIELD}을 굽는다 (노천 탄화는 통나무 ${ITEM_RECIPES.charcoal.from.wood}→숯 ${ITEM_RECIPES.charcoal.to.charcoal})` };

function tryFurnaceStart(player, atX, atY, kind) {
  const k = FURNACE_KINDS[kind] ? kind : 'crucible';
  const Era = require('./era');
  if (!Era.hasTech(k)) { send(player.ws, { type: 'notice', text: `${FURNACE_KINDS[k].ko} 설계는 아직 이 세상에 알려지지 않았다` }); return; }
  return _siteStart(player, atX, atY, _furnaceSpec(k));
}
function tryFurnaceAdvance(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'furnace_site') return;
  return _siteAdvance(player, b, _furnaceSpec(b.data && b.data.kind));
}
function tryKilnStart(player, atX, atY) { return _siteStart(player, atX, atY, KILN_SPEC); }
function tryKilnAdvance(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'kiln_site') return;
  return _siteAdvance(player, b, KILN_SPEC);
}

// ═══ ★★[2026-08-03e 배치 12 ①] 마을 회관(村會館) — **마을을 세우는 건축** ═════════
//   재민: *"플레이어가 마을 아무데나 세울 수 있는 시스템"*. 새 기구를 만들지 않는다 —
//   노·숯가마가 쓰는 `_siteStart`/`_siteAdvance` 계약을 **그대로** 쓰고, 완공 훅 하나만 더 걸었다.
//
//   ★고증(송국리 환호 취락) — 단계가 곧 그 시대의 마을 세우는 순서다:
//     ① **터 다지기·구획**: 구릉 사면을 깎아 평탄면을 낸다. 돌로 지경(地境)을 놓는다.
//     ② **환호(둘레도랑)**: 취락을 두르는 도랑 — 송국리형 취락의 표지 유구다. 파낸 흙으로 토루,
//        그 위에 목책. 공동 노동의 산물이라 재료가 가장 무겁다.
//     ③ **회관(대형 굴립주 건물)**: 기둥을 땅에 박아 세우는 큰집. 마을의 중심이다.
//   ⚠양은 노(괴련로 돌 24·통나무 10)의 **여러 배**다 — 마을을 세우는 일이 노 하나 놓는 일과
//     같은 무게일 수 없다. 눈금은 손잡이다(`VILLAGE_FOUND_COST` — 1.0 이 기본, A/B 로 조절).
const VF_COST = (() => { const x = parseFloat(process.env.VILLAGE_FOUND_COST || '1'); return (isFinite(x) && x > 0) ? x : 1; })();
const _vfN = (o) => { const r = {}; for (const k in o) r[k] = Math.max(1, Math.round(o[k] * VF_COST)); return r; };
const VILLAGE_FOUND_STAGES = [
  { need: _vfN({ stone: 30 }),            tool: 'pickaxe', wear: 5, label: '① 터 다지기·지경 놓기(돌 %stone%)' },
  { need: _vfN({ stone: 40, wood: 20 }),  tool: 'pickaxe', wear: 5, label: '② 환호(둘레도랑) 파고 목책 세우기(돌 %stone%·통나무 %wood%)' },
  { need: _vfN({ wood: 60 }),                                       label: '③ 회관 굴립주 세우기(통나무 %wood%)' },
].map((s) => ({ ...s, label: s.label.replace(/%(\w+)%/g, (_, k) => String(s.need[k] || 0)) }));
const VILLAGE_SPEC = {
  siteType: 'village_site', doneType: 'village_hall', ko: '마을 회관', icon: '🏘️',
  stages: VILLAGE_FOUND_STAGES, kind: 'village_hall',
  doneHint: '마을이 섰다 — 아직 사람은 없다. 곳간에 식량을 채우면 사람이 깃든다',
  // ★완공 = 마을 등록. econ·DB·교역 거리행렬은 villages.js 정본이 전담한다(여기서 다시 만들지 않는다).
  onDone: (player, done, ctx) => {
    const ccx = ctx.x0, ccy = ctx.y0;   // 2×2 발자국의 좌상 셀을 마을 중심으로 삼는다(회관 좌표 = 그 셀)
    const r = SimVillages.foundPlayerVillage
      ? SimVillages.foundPlayerVillage({ ccx, ccy, founder: player.playerId, founderName: player.name, tribeId: ctx.tribeId || null, name: player.name ? `${player.name}의 마을` : null })
      : { ok: false, err: '마을 시뮬이 이 서버에 없다' };
    if (!r.ok) { send(player.ws, { type: 'notice', text: `🏘️ 회관은 섰지만 마을이 서지 못했다 — ${r.err}` }); return; }
    done.data.villageDbId = r.dbId;   // 회관 ↔ 마을 결속(재고 UI 가 이 셀로 마을을 찾는다)
    try { db.updateBuildingData(done.dbId, JSON.stringify(done.data)); } catch (e) {}
    broadcast({ type: 'building_added', building: done });
    send(player.ws, { type: 'notice', text: `🏘️ **[${r.name}]** 이(가) 섰다 — 인구 0. 곳간에 식량을 채우면 사람이 깃든다 (회관 클릭 = 재고)` });
  },
};
function tryVillageStart(player, atX, atY) {
  // ★착공 전에 **자리부터** 본다 — 3단계를 다 짓고 나서 "여긴 안 된다"고 하면 재료를 삼키는 것이다.
  //   판정은 villages.js 정본과 같은 함수를 쓴다(사본 금지): dryRun 으로 물어본다.
  const SZg = BUILDING_SIZE;
  const cx = Math.floor(atX / SZg), cy = Math.floor(atY / SZg);
  const chk = SimVillages.foundPlayerVillage ? SimVillages.foundPlayerVillage({ ccx: cx, ccy: cy, founder: player.playerId, dryRun: true }) : { ok: false, err: '마을 시뮬이 이 서버에 없다' };
  if (!chk.ok) { send(player.ws, { type: 'notice', text: `🏘️ 여기엔 마을을 못 세운다 — ${chk.err}` }); return; }
  return _siteStart(player, atX, atY, VILLAGE_SPEC);
}
function tryVillageAdvance(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'village_site') return;
  return _siteAdvance(player, b, VILLAGE_SPEC);
}
// ★[배치 12 ③] 회관 클릭 = 재고 열람. 권한은 **노·숯가마와 같은 술어**(`_furnaceCanUse`)를 쓴다 —
//   길드 땅에 세운 마을이면 길드원, 개인 땅이면 창설자 본인. 새 권한 개념을 만들지 않는다.
function tryVillageInventory(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'village_hall') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 200) { send(player.ws, { type: 'notice', text: '회관에서 너무 멀리 있습니다' }); return; }
  if (!_furnaceCanUse(player, b)) {
    send(player.ws, { type: 'notice', text: b.data && b.data.tribeId ? '우리 길드의 마을이 아닙니다 — 재고를 볼 수 없다' : '이 마을의 관리자가 아닙니다 — 재고를 볼 수 없다' });
    return;
  }
  const d = b.data || {};
  const vil = SimVillages.playerVillageAt ? SimVillages.playerVillageAt(d.x0, d.y0) : null;
  if (!vil) { send(player.ws, { type: 'notice', text: '이 회관에 딸린 마을을 찾지 못했다' }); return; }
  const inv = SimVillages.playerVillageInventory(vil);
  if (!inv) { send(player.ws, { type: 'notice', text: '재고를 읽지 못했다' }); return; }
  inv.welcome = _welcomeLine(vil.dbId);   // ★[T19] 이방인 받기 — **기존 payload 한 줄**(새 창구 0)
  inv.hallId = buildingId;
  send(player.ws, { type: 'village_inventory', inv });
}
// ★[T19] 촌장 화면이 그릴 "이방인 받기" 한 줄. 판정은 `newcomers.js` 정본 하나가 낸 것을 그대로 준다.
function _welcomeLine(vid) {
  try { return Newcomers.listable(vid); } catch (e) { return null; }
}
// ★★[T19 2026-09-02] **스위치를 켜고 끈다.** 자격은 여기서 안 막는다 —
//   켜 두고 조건을 갖추면 그때부터 지도에 뜬다(막으면 "왜 안 켜지지"가 되고, 안 막으면
//   "왜 아직 안 뜨지 — 아, 곳간이 얇구나"가 된다. 뒤쪽이 배울 것이 있는 실패다).
//   권한·거리는 재고 열람과 **완전히 같은 술어**다(`_furnaceCanUse` · 200px) — 새 개념 0.
function tryVillageWelcome(player, buildingId, on) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'village_hall') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 200) { send(player.ws, { type: 'notice', text: '회관에서 너무 멀리 있습니다' }); return; }
  if (!_furnaceCanUse(player, b)) { send(player.ws, { type: 'notice', text: '이 마을의 관리자가 아닙니다' }); return; }
  const vid = (b.data && b.data.villageDbId != null) ? (b.data.villageDbId | 0) : null;
  if (vid == null) { send(player.ws, { type: 'notice', text: '이 회관에 딸린 마을을 찾지 못했다' }); return; }
  const r = Newcomers.setOn(vid, !!on);
  if (!r.ok) { send(player.ws, { type: 'notice', text: `🏘️ ${r.err}` }); return; }
  const e = Newcomers.listable(vid);
  send(player.ws, { type: 'notice', text: r.on
    ? (e.listed ? '🏘️ 이방인을 받는다 — 시작 지도에 우리 마을이 오른다'
                : `🏘️ 이방인을 받기로 했다 — 다만 아직 지도엔 안 오른다: ${e.why.join(' · ')}`)
    : '🏘️ 이방인을 받지 않는다 — 시작 지도에서 내렸다' });
  tryVillageInventory(player, buildingId);   // 화면을 그 자리에서 갱신(거래소·곳간과 같은 규약)
}
// ★[배치 12 ②] 곳간에 넣기 — 권한·거리 규약은 열람과 **완전히 같다**(같은 회관, 같은 술어).
function tryVillageDeposit(player, buildingId, want) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'village_hall') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 200) { send(player.ws, { type: 'notice', text: '회관에서 너무 멀리 있습니다' }); return; }
  if (!_furnaceCanUse(player, b)) { send(player.ws, { type: 'notice', text: '이 마을의 관리자가 아닙니다' }); return; }
  const d = b.data || {};
  const vil = SimVillages.playerVillageAt ? SimVillages.playerVillageAt(d.x0, d.y0) : null;
  if (!vil) { send(player.ws, { type: 'notice', text: '이 회관에 딸린 마을을 찾지 못했다' }); return; }
  const r = SimVillages.playerVillageDeposit(vil, player.inventory, want || {});
  if (!r.ok) { send(player.ws, { type: 'notice', text: `🏘️ ${r.err}` }); return; }
  savePlayer(player);
  sendInventory(player);
  const kv = Object.entries(r.taken).map(([k, q]) => `${ITEM_LABEL_SERVER[k] || k} ${q}`).join(' · ');
  send(player.ws, { type: 'notice', text: `🏘️ 곳간에 넣었다 — ${kv}` });
  const inv2 = SimVillages.playerVillageInventory(vil);
  if (inv2) send(player.ws, { type: 'village_inventory', inv: inv2 });   // 넣은 즉시 화면이 갱신된다
}
// ═══[2026-08-25 사건 레이어] 촌장 브리핑 · 마을 게시판 · 납품 ═══════════════
//   설계 §3.2: **대시보드 UI 금지 — 촌장 대사·게시판 의뢰로 번역**한다.
//   서버가 하는 일: 거리 게이트 + 자기 마을 것만. 나머지 판정은 villages.js→events.js 정본.
//   ⚠권한 게이트(`_furnaceCanUse`)는 여기 **없다** — 회관 재고 열람과 달리 촌장의 말과 게시판은
//     그 마을 사람이 아니어도 듣고 볼 수 있어야 한다(온보딩 §9.4: 이방인이 촌장에게 첫 의뢰를 받는다).
//     남의 곳간을 여는 게 아니라 **공개 게시판을 읽는 것**이라 다른 계약이다.
// ★★[T7 2026-09-01] **복귀 브리핑은 평소 브리핑과 같은 진입점을 쓴다.**
//   촌장이 말을 거는 자리는 하나여야 한다 — 두 개면 "누가 먼저 말하나"를 관리하게 되고,
//   온보딩 v2 의 "촌장이 먼저 말을 건다" 훅이 착지하면 그때 또 세 번째가 생긴다.
//   ⇒ 진입점은 여기 하나이고, **무엇을 말할지는 서버(장부)가 정한다**.
//   ⚠온보딩 v2 가 아직 안 들어왔다(base `66ec6f99` 실측 — `events.js` 에 "첫 의뢰 표지" 필드 없음).
//     들어오면 그 훅이 이 함수를 부르게 합칠 것 — 인계에 한 줄 적었다.
function tryVillageBrief(player, vid) {
  if (!SimVillages.villageBrief) return;
  // ★부재 요약은 **접속당 한 번**이다. 두 번째부터는 평소 브리핑으로 돌아간다 —
  //   안 그러면 접속한 채로 사흘 돌아다니다 마을에 들르면 "사흘 만이군" 소리를 듣는다
  //   (부재는 **사람이 자리를 비운 것**이지 마을에 안 들른 것이 아니다).
  player._memberNearVid = vid | 0;   // ★[T11] 채팅 `/인출` 이 어느 마을인지 — 근접 브리핑이 곧 "여기 있다"는 신호다
  const since = (!player._returnBriefDone && Number.isFinite(player.lastSeenDay)) ? (player.lastSeenDay | 0) : null;
  const r = SimVillages.villageBrief(vid | 0, player.x, player.y, { sinceDay: since });
  if (r.err) { send(player.ws, { type: 'notice', text: `🏘️ ${r.err}` }); return; }
  Membership.orderBrief(player, r);   // ★[T11] 소속 마을 사건을 앞줄로 — **가시성은 안 바꾼다**(순서만)
  if (since != null) {           // 게이트를 통과해 실제로 브리핑이 나갔다 — 이 접속의 몫은 끝났다
    player._returnBriefDone = true;
    player.lastSeenDay = r.day | 0;
    if (canPersist(player)) savePlayer(player);
  }
  send(player.ws, { type: 'village_brief', brief: r });
}
// ★★[T11 2026-09-02 재민 확정] **곳간에서 꺼내기 — 마을 사람의 몫.**
//   판정(누가·얼마나)은 `server/membership.js`, 실물 이동은 `villages.playerVillageWithdraw`
//   (= `playerVillageDeposit` 의 역연산). 여기서 하는 일은 **장부 뒷정리와 화면**뿐이다.
//   ⚠취득일: 인벤이 늘었으니 `Lots.reconcile(…, 오늘)` 이 남는 몫을 **오늘 얻은 것**으로 잡는다
//     — 즉 **출고일 = 취득일**이 종전 규약으로 저절로 선다(새 규약을 만들지 않았다).
function _afterWithdraw(player, r) {
  const today = zoneGameDay();
  if (Lots.isLot(r.item)) Lots.reconcile(player, r.item, player.inventory, today);
  Carry.reconcile(player, player.inventory);
  savePlayer(player);
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `🏘️ ${r.name} 곳간에서 ${ITEM_LABEL_SERVER[r.item] || r.item} ${r.qty} 꺼냈다`
    + ` — 오늘 남은 몫 ${r.remain}/${r.limit}` });
  // ★거래소 창이 열려 있으면 **그 창을 다시 보내 준다** — 방금 곳간이 줄었고 남은 몫도 줄었다
  //   (거래소 실행이 시세를 다시 보내 주는 것과 같은 규약: 화면이 낡은 값을 들고 있으면 그게 거짓말이다).
  try {
    const _v = player._memberNearVid;
    if (_v != null && SimVillages.villageTradeBoard) {
      const b = SimVillages.villageTradeBoard(_v | 0, player.x, player.y, player.inventory);
      if (!b.err) { b.member = _memberLine(player, _v | 0); send(player.ws, { type: 'village_trade', trade: b }); }
    }
  } catch (e) {}
}
// ★[T11] 거래소 패널이 그릴 소속 한 줄. 곳간 재고는 **정본 함수**에게 묻는다(클라 재계산 0).
function _memberLine(player, vid) {
  try {
    const g = SimVillages.villageWithdrawGate(vid | 0, player.x, player.y);
    // ★[T20-ⓑ 재민 확정 2026-09-03] 패널이 보여 주는 "곳간 몫"도 **식량 등가**다(보존식 포함) —
    //   겨울에 곡식 칸만 보면 곳간이 빈 것처럼 보이고, 그러면 화면이 거짓말을 한다.
    //   값은 여전히 **서버 정본 함수**가 낸다(클라 재계산 0 · 새 규칙 0).
    const stock = g.err ? 0
      : Math.max(SimVillages.playerVillageWithdrawStock(g.vil, 'food'),
                 (SimVillages.playerVillageWithdrawStockFoodEq ? SimVillages.playerVillageWithdrawStockFoodEq(g.vil) : 0));
    const st = Membership.publicState(player, stock);
    st.stock = stock;
    return st;
  } catch (e) { return null; }
}
function tryVillageWithdraw(player, vid, res, qty) {
  const r = Membership.withdraw(player, vid | 0, res, qty);
  if (!r.ok) { send(player.ws, { type: 'notice', text: `🏘️ ${r.err}` }); return; }
  _afterWithdraw(player, r);
}
function tryVillageBoard(player, vid) {
  if (!SimVillages.villageBoard) return;
  const r = SimVillages.villageBoard(vid | 0, player.x, player.y);
  if (r.err) { send(player.ws, { type: 'notice', text: `🏘️ ${r.err}` }); return; }
  send(player.ws, { type: 'village_board', board: r });
}
// ★★[T18 2026-09-01] 연대기 — 마을 연표. 게이트·권한은 게시판과 **완전히 같다**(같은 마을, 같은 술어).
//   화면이 그릴 모양(연·계절·문장)은 서버가 다 만들어 보낸다 — 달력 표기를 클라가 다시 짜면 그게 사본이다.
function tryVillageChronicle(player, vid, year) {
  if (!SimVillages.villageChronicle) return;
  const r = SimVillages.villageChronicle(vid | 0, player.x, player.y, year);
  if (r.err) { send(player.ws, { type: 'notice', text: `📜 ${r.err}` }); return; }
  send(player.ws, { type: 'village_chronicle', chron: r });
}
// ★[거래소 2026-08-27] 시세표 — **그 마을 앞에서만** 답한다(게이트는 villages.js `_villageNear`).
// ★★[무게 배치] 개체 무게 → 재화 단위 환산 콜백. **정본은 `Carry.peekKg` 하나**이고
//   거래소·게시판이 **같은 이걸** 쓴다(둘이 다른 환산을 쓰면 그게 보이지 않는 손이다).
//   n개를 낼 때의 실제 kg ÷ 표준 kg = 그 제안의 재화 단위.
// ★★[부패 배치 2026-08-31] **신선도도 같은 자리에서 곱한다.**
//   재민 지시: *"시듦은 가치 하락(정본 가격 × 신선도 — **가격 사본 금지, 배율만**)."*
//   ⇒ `trade.js` 는 한 줄도 안 건드렸다. 가격을 만지는 대신 **재화 단위**를 만진다:
//     시든 생선은 무게가 같아도 **더 적은 단위어치**다. 무게가 이미 그렇게 하고 있는 축이라
//     새 개념이 아니라 **같은 축에 항 하나**를 더한 것이다.
//   ★★그리고 이 자리가 정확히 맞는 이유: `_unitsOfFor` 는 **거래소와 게시판이 같이 쓰는**
//     환산 하나다. 여기 얹으면 "같은 물고기가 거래소에선 2.2단위, 게시판에선 1단위"가 될 길이 없다
//     (무게 배치가 못 박은 그 규약을 신선도가 그대로 물려받는다).
//   ★★★[T59 2026-09-03] **식량은 무게가 아니라 열량으로 잰다.**
//     종전 `kg ÷ 표준kg` 은 "곡식 1개 = 1단위"를 우연히 맞혔지만(0.70/0.70) 나머지는 전부 틀렸다 —
//     econ 의 1단위는 **NPC 하루치**(2,450 kcal)인데 무게비는 열량을 모른다.
//     ⇒ 열량 표에 있는 품목은 `Kcal.econUnitsOf` 가, 없는 것(나무·돌·광물)은 **종전 무게비**가 잰다.
//     신선도 배율은 그대로 곱한다(부패 배치의 규약 — 시든 것은 더 적은 단위어치다).
function _unitsOfFor(player) {
  const today = zoneGameDay();
  return (item, n) => {
    const std = Weights.kgOfOrDefault(item);
    const kg = Carry.peekKg(player, item, n);
    const byKcal = Kcal.econUnitsOf(item, n, kg);
    const base = byKcal > 0 ? byKcal : ((std > 0) ? +(kg / std).toFixed(4) : n);
    if (!Lots.isLot(item)) return base;
    const off = Spoil.peekOffer(item, Lots.of(player, item), n, today);
    return +(base * Spoil.nutritionMult(off.fresh)).toFixed(4);
  };
}
// ★상함은 **배율이 아니라 거절**이다 — 0 단위로 조용히 넘기면 화면엔 "그 양으론 한 개도 못
//   바꾼다 — 더 내야 한다"가 뜬다. 원인이 정반대인 거짓말이다(거래소 배치가 똑같은 자리에서
//   한 번 겪은 실수 — 그때 남긴 교훈이 "메시지가 거짓말을 하면 안 된다"였다).
//
// ★★판정이 **정확한 이유**: 로트 소비는 언제나 **오래된 것부터**(FIFO)다. 그러니 어떤 제안이든
//   가장 오래된 로트를 반드시 포함한다 — **그 로트가 상했으면 그 제안은 상한 것을 포함한다.**
//   덕분에 `trade.js` 의 `_pick`(어느 아이템에서 몇 개를 뺄지)을 **여기서 다시 짤 필요가 없다**
//   (그걸 옮겨 적었으면 그게 사본이고, 두 곳이 갈리는 날이 온다).
//   거래소·게시판 두 입구가 이 함수 하나를 부른다.
//   반환: 막을 이유가 있으면 문자열, 없으면 null.
function _spoiledGuardItems(player, items) {
  const today = zoneGameDay();
  for (const it of items) {
    if (!Lots.isLot(it)) continue;
    const arr = Lots.of(player, it);
    if (!arr.length) continue;
    if (Spoil.freshnessOf(it, Spoil.exposureOf(arr[0], today)) > 0) continue;   // ★[부패 2차] 나이 → 노출
    const bad = Math.floor(arr[0].n);
    const okLeft = Math.floor(Lots.sum(player, it) - arr[0].n);
    return `${ITEM_LABEL_SERVER[it] || it} 중 ${bad > 0 ? bad : arr[0].n}개가 상했다 — 마을은 상한 것을 받지 않는다`
         + `. 먼저 버려라(성한 것 ${okLeft}개는 그대로 낼 수 있다)`;
  }
  return null;
}
// econ 재화 하나에 대응하는 플레이어 아이템들 — 대응표 정본(`playerVillageDepositMap`)에게 묻는다.
function _spoiledGuardRes(player, res) {
  const map = (SimVillages.playerVillageDepositMap && SimVillages.playerVillageDepositMap()) || {};
  const items = Object.keys(map).filter((it) => map[it] === res);
  return _spoiledGuardItems(player, items);
}
function tryVillageTrade(player, vid) {
  if (!SimVillages.villageTradeBoard) return;
  const r = SimVillages.villageTradeBoard(vid | 0, player.x, player.y, player.inventory);
  if (r.err) { send(player.ws, { type: 'notice', text: `🏪 ${r.err}` }); return; }
  player._memberNearVid = vid | 0;                      // ★[T11] 채팅 `/인출` 이 어느 마을인지
  r.member = _memberLine(player, vid | 0);              // ★[T11] 소속·오늘 남은 몫 — **기존 payload 한 줄**(새 창구 0)
  send(player.ws, { type: 'village_trade', trade: r });
}
// ★교환 — 서버 권위. 비율도 상한도 서버가 정하고, 클라는 "이거 내고 저거 받겠다"만 말한다.
function tryVillageTradeExec(player, vid, giveRes, takeRes, qty) {
  if (!SimVillages.villageTradeExec) return;
  const _sp = _spoiledGuardRes(player, giveRes);   // ★[부패] 상한 것은 거래소가 안 받는다
  if (_sp) { send(player.ws, { type: 'notice', text: `🏪 ${_sp}` }); return; }
  const r = SimVillages.villageTradeExec(vid | 0, player.x, player.y, player.inventory, giveRes, takeRes, qty, _unitsOfFor(player));
  if (r.err) { send(player.ws, { type: 'notice', text: `🏪 ${r.err}` }); return; }
  // ★내준 개체를 장부에서 **실제로 뺀다** — 위 환산은 `peekKg`(보기)였다. 안 빼면 무게가 안 준다.
  for (const [it, n] of Object.entries(r.gaveItems || {})) Carry.takeKg(player, it, n);
  Carry.reconcile(player, player.inventory);
  savePlayer(player);
  sendInventory(player);
  const gave = Object.entries(r.gaveItems || {}).map(([k, q]) => `${ITEM_LABEL_SERVER[k] || k} ${q}`).join(' · ');
  send(player.ws, { type: 'notice', text: `🏪 ${r.name} 거래소 — ${gave} → ${ITEM_LABEL_SERVER[r.tookItem] || r.tookItem} ${r.take}`
    + (r.capped ? ` (마을 재고가 모자라 ${r.wanted}→${r.give}개만 받았다)` : '') });
  // ★시세표를 **다시 보내 준다** — 방금 내 거래가 시세를 움직였을 수 있고, 그걸 보는 게 이 배치의 요점이다.
  try {
    const b = SimVillages.villageTradeBoard(vid | 0, player.x, player.y, player.inventory);
    if (!b.err) send(player.ws, { type: 'village_trade', trade: b, after: { giveRes: r.giveRes, takeRes: r.takeRes } });
  } catch (e) {}
}
function tryVillageDeliver(player, vid, item, want) {
  if (!SimVillages.villageDeliver) return;
  const _sp = _spoiledGuardItems(player, [item]);   // ★[부패] 게시판 납품도 같은 판정(같은 함수)
  if (_sp) { send(player.ws, { type: 'notice', text: `📋 ${_sp}` }); return; }
  const r = SimVillages.villageDeliver(vid | 0, player.x, player.y, player.inventory, item, want, _unitsOfFor(player));
  if (r.err) { send(player.ws, { type: 'notice', text: `📋 ${r.err}` }); return; }
  for (const [it, n] of Object.entries(r.taken || {})) Carry.takeKg(player, it, n);   // ★납품한 개체를 장부에서 뺀다
  Carry.reconcile(player, player.inventory);
  savePlayer(player);
  sendInventory(player);
  const gave = Object.entries(r.taken || {}).map(([k, q]) => `${ITEM_LABEL_SERVER[k] || k} ${q}`).join(' · ');
  const got = r.rew > 0 ? ` → ${ITEM_LABEL_SERVER[r.rewItem] || r.rewItem} ${r.rew}` : '';
  send(player.ws, { type: 'notice', text: (r.winter ? `🧊 ${r.name} 올겨울 몫 — ${gave}` :   // ★[T20] 겨울 몫은 보상이 없다(그 대가는 겨울 보상)
    `📋 ${r.name}에 납품 — ${gave}${got}${r.refused > 0 ? ` (${r.refused}개는 남은 몫을 넘어 돌려받음)` : ''}`) });
  Onboarding.onDeliver(player, r, vid | 0);   // ★[온보딩 v2] 누적 기여(=T11 이 재사용할 하나의 카운터)·곳간 이펙트·훅 대사·빈터 권리
  Membership.onDeliver(player, r, vid | 0);   // ★[T11] **그 다음**이다 — 기여가 오른 뒤라야 소속 문턱을 정확히 본다
  Winter.onDeliver(player, r, vid | 0);      // ★[T20] 겨울나기 — **양**을 센다(횟수는 위 온보딩 정본 하나다)
  // 낸 즉시 게시판이 갱신된다(다 찼으면 목록에서 빠진다)
  const b = SimVillages.villageBoard(vid | 0, player.x, player.y);
  if (b && b.ok) send(player.ws, { type: 'village_board', board: b });
}

// ★숯가마 조업 — 밀폐 탄화라 수율이 노천보다 좋다(통나무 3 → 숯 4 vs 제작창 3 → 2).
function tryKilnBurn(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'charcoal_kiln') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 120) { send(player.ws, { type: 'notice', text: '숯가마에서 너무 멀리 있습니다' }); return; }
  if (!_furnaceCanUse(player, b)) { send(player.ws, { type: 'notice', text: b.data.tribeId ? '우리 길드의 숯가마가 아닙니다' : '이 숯가마의 주인이 아닙니다' }); return; }
  // ★★[2026-08-02e ⑤] 숯가마도 노와 **같은 진척 계약**이다 — 장입 → 시간 → 수거.
  const nowK = Date.now();
  if (b.data && b.data.job) {
    const job = b.data.job;
    if (nowK < job.until) {
      const remain = Math.ceil((job.until - nowK) / 1000);
      send(player.ws, { type: 'notice', text: `🪵 탄화 중 — ${remain}초 남음 (${Math.round(_jobProgress(job, nowK) * 100)}%). 연도를 막아 뒀으니 자리를 떠도 된다` });
      return;
    }
    const got = CHARCOAL_KILN_YIELD * (job.n || 1);
    player.inventory.charcoal = (player.inventory.charcoal || 0) + got;
    delete b.data.job;
    if (b.dbId) { try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
    broadcast({ type: 'building_updated', building: { id: b.id, data: b.data } });
    sendInventory(player);
    send(player.ws, { type: 'notice', text: `🪵 가마를 헐었다 — 숯 ${got} 수거 (장입 ${job.n || 1}회분)` });
    savePlayer(player);
    return;
  }
  if ((player.inventory.wood || 0) < CHARCOAL_KILN_WOOD) { send(player.ws, { type: 'notice', text: `통나무 부족 (1회 장입 ${player.inventory.wood || 0}/${CHARCOAL_KILN_WOOD})` }); return; }
  // ★★[2026-08-02d ④] 가득 채우기 — 통나무 3씩 클릭을 반복하는 지루함만 없앤다.
  //   ⚠수지는 **1회 조업과 완전히 같다**(장입 3 → 숯 4를 n번). 배치라고 수율이 좋아지지 않는다 —
  //     그러면 클릭 수가 물리를 바꾸는 셈이고, 그건 이 프로젝트가 계속 피해 온 것이다.
  //   ⚠상한(KILN_BATCH_MAX)은 UI 폭주 방지용이지 가마 용량이 아니다. 용량 개념을 넣으려면 회부 대상.
  //   ★[2026-08-02e] 시간도 같은 원칙이다 — n회분을 한 번에 넣으면 **그만큼 오래 걸린다**.
  //     안 그러면 "가득 채우기"가 시간을 공짜로 압축하는 치트가 된다.
  const n = Math.max(1, Math.min(KILN_BATCH_MAX, Math.floor((player.inventory.wood || 0) / CHARCOAL_KILN_WOOD)));
  player.inventory.wood -= CHARCOAL_KILN_WOOD * n;
  {
    const dur = KILN_BURN_MS + KILN_BATCH_MS_PER * (n - 1);
    b.data.job = { kind: 'kiln', startedAt: nowK, until: nowK + dur, n, by: player.playerId };
    if (b.dbId) { try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
    broadcast({ type: 'building_updated', building: { id: b.id, data: b.data } });
    sendInventory(player);
    send(player.ws, { type: 'notice',
      text: `🪵 장입 — 통나무 ${CHARCOAL_KILN_WOOD * n}${n > 1 ? ` (×${n}회분)` : ''} 을 재고 연도를 막았다. ${Math.round(dur / 1000)}초 뒤 가마를 헐어 숯을 꺼낸다` });
    savePlayer(player);
  }
}
function tryFurnaceSmelt(player, buildingId) {
  const b = buildings.get(buildingId);
  if (!b || b.type !== 'furnace') return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > 120) { send(player.ws, { type: 'notice', text: '노에서 너무 멀리 있습니다' }); return; }
  if (!_furnaceCanUse(player, b)) { send(player.ws, { type: 'notice', text: b.data.tribeId ? '우리 길드의 노가 아닙니다' : '이 노의 주인이 아닙니다 — 개인 노엔 타인 관여 불가' }); return; }
  const now = Date.now();
  const kind = (b.data && b.data.kind) || 'crucible';
  // ★★[2026-08-02e ⑤] 조업 중이면 — 아직이면 남은 시간을, 끝났으면 **출탕**한다.
  //   진척은 벽시계라 자리를 떠도, 접속을 끊어도, 서버가 재시작해도 흐른다(농지 readyAt 선례).
  if (b.data && b.data.job) {
    const job = b.data.job;
    if (now < job.until) {
      const remain = Math.ceil((job.until - now) / 1000);
      send(player.ws, { type: 'notice', text: `🔥 조업 중 — ${remain}초 남음 (${Math.round(_jobProgress(job, now) * 100)}%). 자리를 떠도 불은 계속 탄다` });
      return;
    }
    // ── 출탕 — 장입 때 정한 수율로 산출한다(중간에 시대가 열려도 **장입 시점 물리**가 기준이다:
    //    "이미 불을 지핀 노"의 결과가 소급해 좋아지면 그건 시간 계약이 아니라 도박이 된다).
    const y2 = job.yield || 0;
    const kg2 = Specialty.CHUNK_KG * y2;
    const carry2 = (player.oreCarry && typeof player.oreCarry === 'object') ? player.oreCarry : (player.oreCarry = {});
    const tot2 = (carry2._iron_smelt || 0) + kg2;
    const whole2 = Math.floor(tot2 / Specialty.CHUNK_KG);
    carry2._iron_smelt = +(tot2 - whole2 * Specialty.CHUNK_KG).toFixed(3);
    let m2;
    if (whole2 > 0) { player.inventory.iron = (player.inventory.iron || 0) + whole2; m2 = `🔥 출탕 — 철 ${whole2}덩이!`; }
    else m2 = `🔥 출탕 — 해면철 부스러기 ${kg2.toFixed(2)}kg (누적 ${tot2.toFixed(2)}/${Specialty.CHUNK_KG}kg — 슬래그가 대부분이다)`;
    delete b.data.job;
    if (b.dbId) { try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
    broadcast({ type: 'building_updated', building: { id: b.id, data: b.data } });
    sendInventory(player);
    send(player.ws, { type: 'notice', text: m2 + ` · 수율 ${(y2 * 100).toFixed(1)}%` });
    savePlayer(player);
    return;
  }
  const ore = player.inventory.iron_ore || 0;
  if (ore < 1) { send(player.ws, { type: 'notice', text: '철 정광이 없다 — 철 광맥을 캐서 선광하면 나온다' }); return; }
  const fuelNeed = FURNACE_FUEL_PER_ORE;
  if ((player.inventory.charcoal || 0) < fuelNeed) { send(player.ws, { type: 'notice', text: `숯 부족 (정광 1덩이당 숯 ${fuelNeed} — 제작창 노천 탄화 또는 숯가마로 굽는다)` }); return; }
  // ★물리는 era.js 하나가 정한다 — 청동기 도가니로 3.4%, 시대 열리면 같은 노가 67.8%, 괴련로 88.1%.
  const Era = require('./era');
  const setup = { furnace: kind, fuel: 'charcoal', bellows: true };
  const y = Era.smeltYield('iron', setup);
  if (!(y > 0)) { send(player.ws, { type: 'notice', text: '이 노로는 철이 안 나온다' }); return; }
  player.inventory.iron_ore -= 1;
  player.inventory.charcoal -= fuelNeed;
  // ── 장입 — 재료는 **지금** 들어가고(불 속에 넣은 것은 돌려받지 못한다), 산출은 시간 뒤에 나온다
  {
    const dur = _smeltDurationMs(kind);
    b.data.job = { kind: 'smelt', startedAt: now, until: now + dur, yield: y, by: player.playerId };
    if (b.dbId) { try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
    broadcast({ type: 'building_updated', building: { id: b.id, data: b.data } });
    sendInventory(player);
    send(player.ws, { type: 'notice',
      text: `🔥 장입 — 정광 1·숯 ${fuelNeed} 을 넣고 불을 지폈다. ${Math.round(dur / 1000)}초 뒤 노를 클릭해 출탕한다 (자리를 떠도 된다)` });
    savePlayer(player);
    return;
  }
  const kg = Specialty.CHUNK_KG * y;   // 덩이 3.5kg × 수율
  const carry = (player.oreCarry && typeof player.oreCarry === 'object') ? player.oreCarry : (player.oreCarry = {});
  const tot = (carry._iron_smelt || 0) + kg;
  const whole = Math.floor(tot / Specialty.CHUNK_KG);
  carry._iron_smelt = +(tot - whole * Specialty.CHUNK_KG).toFixed(3);
  let msg2;
  if (whole > 0) { player.inventory.iron = (player.inventory.iron || 0) + whole; msg2 = `🔥 제련 성공 — 철 ${whole}덩이!`; }
  else msg2 = `🔥 해면철 부스러기 ${kg.toFixed(2)}kg (누적 ${tot.toFixed(2)}/${Specialty.CHUNK_KG}kg — 슬래그가 대부분이다)`;
  sendInventory(player);
  send(player.ws, { type: 'notice', text: msg2 + ` · 수율 ${(y * 100).toFixed(1)}%` });
  savePlayer(player);
}

// ═══ 테스트 훅 — 노(爐)·채광 E2E(scripts/test-furnace.js · test-mining.js). `__p3Bind` 선례.
//   운영 부팅 경로에서는 **절대 호출되지 않는** 순수 export 다(zone.js 는 원래 module.exports 가 없었고,
//   이 한 줄이 유일하다 — require 해도 부작용이 없다). 하네스가 실서버를 띄운 뒤 in-memory 상태를
//   직접 조작해 사유지 생성 → 터 → 3단계 → 조업까지 **실제 함수로** 왕복 검증한다.
//   ★왜 소스 텍스트 검사(test-psite-server.js 형식)가 아니라 실행 검증인가: 노는 좌표 기하
//     (2×2 발자국 vs 1셀 사유지)가 계약의 핵심인데, 그건 코드를 읽어서는 안 드러난다. 실제로
//     지어 봐야 안다 — 실제로 이 하네스가 "노를 아예 못 짓는다"를 처음 잡아냈다.
function __testBind() {
  return {
    claims, buildings, players, BUILDING_SIZE, Specialty,
    FURNACE_STAGES, FURNACE_KINDS, FURNACE_FUEL_PER_ORE, CHARCOAL_KILN_STAGES, CHARCOAL_KILN_YIELD, CHARCOAL_KILN_WOOD,
    tryFurnaceStart, tryFurnaceAdvance, tryFurnaceSmelt,
    tryKilnStart, tryKilnAdvance, tryKilnBurn,
    _furnaceClaimOf, _furnaceCanUse, isTerrainBlockedLocal, isWaterTileLocal,
    newClaimId: () => `c${nextClaimId++}`,
    // ── 채광·선광 E2E(test-mining.js §⑨ 다광종) ──
    mineOreCell, trySortOre, minedCells, ITEM_LABEL_SERVER,
    // ── 길들이기 시대 게이트 E2E(test-tame.js) ── 실서버 mobs/MOB_DEFS 와 실제 tryFeed 를 그대로 쓴다
    mobs, MOB_DEFS, tryFeed, qtMobs: () => qtMobs,
    // ── 조업 진척 계약 E2E(2026-08-02e ⑤) ── 시간은 벽시계라 하네스가 job.until 을 당겨 검증한다
    SMELT_BASE_MS, SMELT_MIN_MS, KILN_BURN_MS, KILN_BATCH_MS_PER, _smeltDurationMs, _jobProgress,
    // ── 조업 **페이싱** 실측(2026-08-02f ②) ── 단조까지 이어야 사슬 한 바퀴의 실시간이 나온다
    doCraftEquipment, EQUIPMENT_RECIPES, Facility, facilityFor, _facilityMine, doCraftCollect,
    sendFacility, _facilityRecipes, craftQueuePayload, BUILDING_COST, BUILDING_RECIPES, PlayerItems,
    playerCraftLevel, doShopBuy,
    // ── 주기 저장 비용 실측(2026-08-26) ── 하네스가 저장 건수·누적 ms 를 그대로 읽는다
    _saveStats: () => ({ ..._saveStats, intervalMs: SAVE_INTERVAL_MS }),
    // ── 낚시 v2 E2E(2026-08-26) ── **정본 함수를 그대로 내준다**(하네스가 물리를 다시 짜면 사본이다).
    Fishing, tryFishCast, tryFishStrike, _fishPoll, _castTargetFor, _fishSave, _fishSpeciesFor,
    _fishStats, _fishPollStats: () => ({ ..._fishStats2 }),
    isWaterTileLocal, terrain: _terrain, ZONE_ID, ZONE,
    players, savePlayer,
    // ── 신체 상태 §7 E2E(2026-08-26) ── **정본 모듈을 그대로 내준다**(하네스가 곡선을 다시 짜면 사본이다).
    Body, damagePlayer, doEat, isIndoorAt, seasonColdNow, FOOD_EFFECTS,
    Kcal, _SEASON_DAY_MS,   // ★[T59] 열량 정본 + 이 존이 쓰는 하루 길이(하네스가 유도값을 재현할 때 쓴다)
    // ── 무게 모델(2026-08-27) ── 정본 모듈을 그대로 내준다(하네스가 곡선을 다시 짜면 사본이다)
    Weights, Carry, Lots, moveMultOf, zoneGameDay, COOK_RECIPES, doCook, _unitsOfFor,
    // ★[부패·보존 배치 2026-08-31] 하네스가 잡을 손잡이들
    Spoil, doPreserve, preserveMenuPayload, _spoiledGuardItems, _spoiledGuardRes, _gameDayAt, __e2eFreezeZoneDay,
    // ★[작물 층 2026-08-31]
    Crops, doPlant, plantMenuPayload, tryHarvest, _waterSupplyAt, _farmlandData, lootOfResource, CROP_GROW_MS,
    PRESERVED_EFFECTS, BUILDING_COST, BUILDING_RECIPES, ITEM_LABEL_SERVER,
    // ★[자염 배치 2026-09-01] 하네스가 잡을 손잡이들 — **정본을 그대로 내준다**
    //   (하네스가 염도·수율을 다시 계산하면 그게 사본이다).
    Salt, doBoilSalt, isSeaTileLocal, WATER_TILES, tryGather, _SEASON_DAY_MS, ITEM_RECIPES, doCraftItem,
    Wind, windExposureOf, isRockTileLocal, villageShelterOf, gameDayNow, elevKmAt,
    // ── 쓰러짐·구조·사망(T43) ──
    tryRescue, tryRespawnChoice, listRespawnOptions, resolveDowned, tickDowned, nearestVillageWake,
    // ── 외침·구조 동사(T56) — 정본 모듈을 그대로 내준다(하네스가 소리를 다시 짜지 않는다) ──
    Rescue, doEat, Onboarding, WATER_DRINK_AMOUNT, THIRST_MAX, HUNGER_MAX, FOOD_EFFECTS, isWaterTileLocal,
    RESCUE_WINDOW_MS, RESCUE_RANGE_PX, RESCUE_HOLD_MS, RESCUE_HP_FRAC, CARRY_PERSON_KG, DOWN_WAKE_GAMEMIN,
    Carry, Lots, Weights, SimVillages, serializeBody, parseBody,
    // ★[부패 2차 2026-09-01] 자리(상자·바닥)를 하네스가 정본 함수로 밟게 — 손으로 빚으면 사본이다
    tryChestPut, tryChestTake, CHEST_ALLOWED_ITEMS,
    // ★[T12 지게 2026-09-01] 착용·마모를 **정본 함수로** 밟게 한다(하네스가 슬롯을 손으로 꽂으면 사본이다)
    doEquipItem, doUnequipItem, wearEquipment, getEquippedEquipment, CARRIER_WEAR_MS, EQUIPMENT_META,
    // ── 원장 승격(2026-08-30) ── 드롭·줍기·바닥 지도를 **정본 그대로**. 하네스가 바닥템을 손으로 빚으면 사본이다.
    tryDropItem, tryPickupItem, groundItems, sendInventory, consumeItem, handlePlayerInput,
    // ── 빈손 시작(2026-08-28) ── 줍기·제작·도구 표를 **정본 그대로** 내준다
    RECIPES, TOOL_EFFECTS, TOOL_MAX_DURABILITY, EQUIPMENT_RECIPES, CRUDE_EFF_FRAC, CRUDE_DURA_FRAC,
    doCraft, doEquip, tryForage, Forage, _forageCtx, lootOfResource, getEquippedTool, consumeEquippedDurability,
    TOOL_EQUIP_EFF_SCALE, PlayerItems,
    // ── 거래소 E2E(2026-08-27) ── 정본을 그대로 내준다(하네스가 가격을 다시 풀면 사본이다)
    Trade: require('./trade'), Events: require('./events'), SimVillages,
    tryVillageTrade, tryVillageTradeExec,
    HUNGER_MAX, THIRST_MAX, MOVE_SPEED,
    // ★[T45 사유지 v2 2026-09-02] 클레임 경로를 **정본 함수 그대로** 내준다 —
    //   하네스가 인접·연결성·상태기를 다시 짜면 그게 사본이고, 두 산수가 갈리는 날이 온다.
    // ★[T19 유저 마을 시작지 2026-09-02] 이방인 받기 경로를 **정본 그대로** 내준다
    //   (하네스가 자격 판정을 다시 짜면 그게 사본이다).
    Newcomers, tryVillageWelcome, tryVillageInventory, _welcomeLine,
    Claims, db, tryClaim, tryUnclaim, countMyClaims, listRespawnOptions,
    findGuildClaimContaining, _claimFootprint, Onboarding, CLAIM_COST,
    CLAIM_SLOT_PERSONAL_START, CLAIM_SLOT_TEMPORARY_START, CLAIM_SLOT_GUILD_START,
  };
}
module.exports = { __testBind, __furnaceBind: __testBind };

const GRANARY_COST = { plank: 12, stone: 8 };
async function tryBuildGuildGranary(player, atX, atY) {
  if (!player.tribeId) { send(player.ws, { type: 'notice', text: '길드 소속이 아닙니다' }); return; }
  // 리더 검사(central)
  try {
    const tr = await central.request('GET', `/tribe/${player.tribeId}`);
    const leaderId = tr?.data?.tribe?.leader_id;
    if (leaderId && leaderId !== player.playerId) { send(player.ws, { type: 'notice', text: '길드 곳간은 리더만 지을 수 있습니다' }); return; }
  } catch (e) { /* central 불가 시 관용(리더 검사 생략) */ }
  // 길드당 1동 — DB 전수(비활성 청크 포함)
  try {
    const rows = db.db.prepare("SELECT data FROM buildings WHERE type='guild_granary'").all();
    for (const r of rows) { try { const d = JSON.parse(r.data || '{}'); if (d.tribe_id === player.tribeId) { send(player.ws, { type: 'notice', text: '길드 곳간은 이미 있습니다 (길드당 1동)' }); return; } } catch (_) {} }
  } catch (e) {}
  const SZg = BUILDING_SIZE;
  let gx, gy;
  if (Number.isFinite(atX) && Number.isFinite(atY)) {
    // ★건축모드 커서 배치[사용자 지시 "좀보이드 스타일"]
    if (Math.hypot(atX - player.x, atY - player.y) > 200) { send(player.ws, { type: 'notice', text: '너무 멀어서 거기에 못 지음' }); return; }
    gx = Math.floor(atX / SZg); gy = Math.floor(atY / SZg);
    const pcx = Math.floor(player.x / SZg), pcy = Math.floor(player.y / SZg);
    if (pcx >= gx - 2 && pcx <= gx + 2 && pcy >= gy - 1 && pcy <= gy + 1) { send(player.ws, { type: 'notice', text: '곳간은 밀폐 — 발자국 안에 서 있으면 갇힙니다. 밖에서 지으세요' }); return; }
  } else { gx = Math.round(player.x / SZg); gy = Math.round(player.y / SZg) - 3; }   // 폴백(구식): 북쪽 3칸
  // 길드영토 안(발자국 네 모서리 전부) — claim 사각 bbox 판정
  const inMyGuildClaim = (px, py) => {
    for (const c of claims.values()) {
      if (c.kind !== 'guild' || c.guildTribeId !== player.tribeId) continue;
      if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return true;
    }
    return false;
  };
  for (const [ex, ey] of [[gx - 2, gy - 1], [gx + 2, gy - 1], [gx - 2, gy + 1], [gx + 2, gy + 1]]) {
    if (!inMyGuildClaim(ex * SZg + SZg / 2, ey * SZg + SZg / 2)) { send(player.ws, { type: 'notice', text: '길드영토(Shift+C) 안에서만 지을 수 있습니다' }); return; }
  }
  // 부지 무결: 발자국+테두리 1칸 — 지형(물·바위)·기존 건물 없음
  for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) {
    const px = (gx + dx) * SZg + SZg / 2, py = (gy + dy) * SZg + SZg / 2;
    if (isTerrainBlockedLocal(px, py)) { send(player.ws, { type: 'notice', text: '물·바위를 피해서 지어야 합니다' }); return; }
  }
  const nearB = qtBuildings ? qtBuildings.queryCircle(gx * SZg, gy * SZg, SZg * 5) : Array.from(buildings.values());
  for (const b of nearB) {
    const bcx = Math.round((b.x - (b.type === 'wall' ? 0 : SZg / 2)) / SZg), bcy = Math.round((b.y - (b.type === 'wall' ? 0 : SZg / 2)) / SZg);
    if (bcx >= gx - 3 && bcx <= gx + 3 && bcy >= gy - 2 && bcy <= gy + 2 && (b.floor || 0) === 0) {
      send(player.ws, { type: 'notice', text: '자리에 다른 건축물이 있습니다' }); return;
    }
  }
  // 비용
  const inv = player.inventory || {};
  if ((inv.plank || 0) < GRANARY_COST.plank || (inv.stone || 0) < GRANARY_COST.stone) {
    send(player.ws, { type: 'notice', text: `재료 부족 — 판자 ${GRANARY_COST.plank}·돌 ${GRANARY_COST.stone}` }); return;
  }
  inv.plank -= GRANARY_COST.plank; inv.stone -= GRANARY_COST.stone;
  // 실물 생성: 밀폐 벽 16변 + 바닥 15 + 앵커 1 (DB+메모리+청크+일괄 방송)
  const ownerId = `tribe_${player.tribeId}`, ownerName = `[${player.tribeName || '길드'}] 곳간`;
  const made = [];
  const mk = (type, x, y, data) => _liveBuildRow(type, x, y, data, ownerId, ownerName, made);
  const _gr = { gran: [gx - 2, gy - 1, gx + 2, gy + 1] };   // ★[에셋 2차] 클라 고상 통짜 스킨 태그(마을 곳간과 동일 — 벽·바닥 시각 억제, 콜라이더 불변)
  for (let x = gx - 2; x <= gx + 2; x++) { mk('wall', x * SZg, (gy - 1) * SZg, { side: 'N', floor: 0, ..._gr }); mk('wall', x * SZg, (gy + 2) * SZg, { side: 'N', floor: 0, ..._gr }); }
  for (let y = gy - 1; y <= gy + 1; y++) { mk('wall', (gx + 2) * SZg, y * SZg, { side: 'E', floor: 0, ..._gr }); mk('wall', (gx - 3) * SZg, y * SZg, { side: 'E', floor: 0, ..._gr }); }
  for (let x = gx - 2; x <= gx + 2; x++) for (let y = gy - 1; y <= gy + 1; y++) mk('floor', x * SZg + SZg / 2, y * SZg + SZg / 2, { floor: 0, ..._gr });
  mk('guild_granary', gx * SZg + SZg / 2, gy * SZg + SZg / 2, { tribe_id: player.tribeId, floor: 0 });
  broadcast({ type: 'buildings_spawn', buildings: made });
  savePlayer(player);
  sendInventory(player);
  send(player.ws, { type: 'notice', text: `🏚️ 길드 곳간 완공! (E로 입출고 — 멤버 공유, 전쟁 시 약탈 목표가 됩니다)` });
  console.log(`[${ZONE_ID}] 🏚️ ${player.name} 길드 곳간 건설 tribe=${player.tribeId} @(${gx},${gy})`);
}

// ★[길드 금고 통합] 길드 곳간 물리 변동 → central 회계 반영(정확히 한 번·자가 치유).
//   기존 채널만 쓴다(POST /tribe/treasury). central이 죽어 있으면 델타가 곳간 data에 남아 다음에 합쳐 올라간다.
function _guildTreasuryOpts() {
  return {
    tribeTreasury: (tribeId, delta) => central.tribeTreasury(tribeId, delta),
    saveData: (b) => { try { db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) { } },
  };
}
function syncGuildGranary(b) {
  if (!b || b.type !== 'guild_granary') return;
  GuildTreasury.syncGranary(b, _guildTreasuryOpts())
    .then((r) => { if (r && !r.ok) console.warn(`[${ZONE_ID}] 💰 길드 금고 반영 보류(다음 기회 재시도):`, r.err); })
    .catch(() => { });
}

function tryChestPut(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || (b.type !== 'chest' && b.type !== 'guild_granary')) return;
  // ★길드 곳간[실물화]: 소유=길드 자체(data.tribe_id) — 멤버=자유 입출, 적=전쟁 중 약탈(아래 공용 경로)
  if (b.type === 'guild_granary') {
    if (!(player.tribeId && b.data && b.data.tribe_id === player.tribeId)) {
      send(player.ws, { type: 'notice', text: '길드 곳간 — 소속 길드원만 넣을 수 있습니다' }); return;
    }
  }
  // Phase 14.20+14.28: public 또는 본인 또는 같은 길드 멤버
  const isOwn = b.ownerId === player.playerId;
  const isPublic = b.ownerId === 'public';
  let isGuildmate = (b.type === 'guild_granary');
  if (!isOwn && !isPublic && !isGuildmate && player.tribeId) {
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
  // ★★[상자 원장 2026-08-30 재민 확정] **왕복 보존을 상자까지.** 2kg 물고기를 넣었다 빼도 2kg 이다.
  //   구조: `b.data._led[item] = [{kg, d?}, …]`. 밑줄 접두사라 기존 두 소비자가 **이미** 걸러낸다 —
  //     · `guild-treasury.granaryItems` : `k.startsWith('_')` 스킵
  //     · 철거 반환 루프(`typeof v === 'number'`) : 배열이라 스킵
  //   그래서 곳간 회계·철거를 건드리지 않고 얹힌다(그 둘이 안 걸러 냈다면 이건 회부감이었다).
  // ★★[부패 2차 2026-09-01] **로트를 그릇으로 옮긴다.**
  //   §0 실측: 여태 상자는 부패 시계를 **완전히 지웠다**(넣었다 빼면 신선도 0.20 → 1.00 · 네 품목 전수).
  //   원인은 상자가 로트를 모르고, 돌아온 물건을 `reconcile` 이 "오늘 얻은 것"으로 잡았기 때문이다.
  //   ⇒ 나가기 **전에** 정산해 레코드째 꺼내고(`moveOut`), 그릇의 자리 배율을 찍어 둔다.
  const _pk = _placeKeyOfBuilding(b);
  const _pf = Spoil.placeFields(_pk);
  const _lotRecs = Lots.isLot(item)
    ? Lots.moveOut(player, item, amount, player.inventory, zoneGameDay(), 0).map((r) => Object.assign({}, r, { m: _pf.m, w: _pf.w, t: zoneGameDay() }))
    : null;
  const _took = consumeItem(player, item, amount);
  b.data = b.data || {};
  if (_lotRecs && _lotRecs.length) {
    if (!b.data._lots || typeof b.data._lots !== 'object') b.data._lots = {};
    if (!Array.isArray(b.data._lots[item])) b.data._lots[item] = [];
    for (const r of _lotRecs) b.data._lots[item].push(r);
  }
  if (_took && _took.entries && _took.entries.length) {
    if (!b.data._led || typeof b.data._led !== 'object') b.data._led = {};
    if (!Array.isArray(b.data._led[item])) b.data._led[item] = [];
    for (const e of _took.entries) b.data._led[item].push(Number.isFinite(e.d) ? { kg: e.kg, d: e.d } : { kg: e.kg });
  }
  // 기존 wood/stone만 초기화되어 있던 chest는 다른 키 보존
  b.data[item] = (b.data[item] || 0) + amount;
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  syncGuildGranary(b);   // ★길드 곳간이면 회계(금고)에 같은 델타 1회 반영
  savePlayer(player);
  sendInventory(player);
  send(player.ws, { type: 'chest_state', buildingId: b.id, data: b.data });
}

async function tryChestTake(player, buildingId, item, amount) {
  const b = buildings.get(buildingId);
  if (!b || (b.type !== 'chest' && b.type !== 'guild_granary')) return;
  if (Math.hypot(b.x - player.x, b.y - player.y) > (b.type === 'guild_granary' ? 96 : 64)) {   // 곳간 5×3이라 도달 반경 넉넉히(인접 상호작용)
    send(player.ws, { type: 'notice', text: '상자에서 너무 멀리 있습니다' }); return;
  }
  if (!CHEST_ALLOWED_ITEMS.has(item)) {
    send(player.ws, { type: 'notice', text: `${item}은 인출 불가` }); return;
  }
  // ★[T45] **보관 중인 무주 사유지의 상자는 잠긴다.** 그래야 보관이 보관이다(§3.2).
  //   길드·마을이 맡은 땅은 그쪽이 쓰라고 맡은 것이라 안 잠근다 — 판정은 `claims.js` 하나.
  { const _lk = Claims.chestLocked(player, b); if (_lk) { send(player.ws, { type: 'notice', text: `🔒 ${_lk}` }); return; } }
  amount = Math.max(1, Math.min(99, amount | 0));

  // Phase 14.20: public chest는 자유 인출
  const isPublic = (b.ownerId === 'public');
  // Phase 14.13: 약탈 분기 — 본인 chest가 아니면 적 길드 chest인지 확인
  const isOwn = (b.ownerId === player.playerId);
  // Phase 14.28: 같은 길드 멤버 chest는 인출 자유. ★길드 곳간: 소속 길드원=자유(소유가 길드 자체 — data.tribe_id)
  let isGuildmate = false;
  if (b.type === 'guild_granary') {
    isGuildmate = !!(player.tribeId && b.data && b.data.tribe_id === player.tribeId);
  } else if (!isOwn && !isPublic && player.tribeId) {
    for (const p of players.values()) {
      if (p.playerId === b.ownerId) { isGuildmate = (p.tribeId === player.tribeId); break; }
    }
  }
  let isLoot = false;
  let lootRate = 0;
  if (!isOwn && !isPublic && !isGuildmate) {
    // 적 길드 chest? — owner의 tribeId 알아내야. owner도 player일 수 있고 NPC일 수도.
    // ★길드 곳간은 소유 길드가 data에 박제 — 즉시. (전쟁 시 약탈 물리 목표[사용자 확정]: loot-raid-vision 파이프라인의 1단)
    let ownerTribeId = null;
    if (b.type === 'guild_granary') ownerTribeId = (b.data && b.data.tribe_id) || null;
    if (ownerTribeId === null) for (const p of players.values()) {
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
  // ★★[상자 원장 2026-08-30] 넣어 둔 **그 개체**를 꺼낸다(FIFO). 없으면 표준 kg 로 떨어진다(옛 상자 호환).
  //   여기서 안 꺼내면 쓸개가 표준 kg 로 메워, 2kg 물고기가 상자를 거치며 조용히 0.9kg 이 된다.
  const _cl = (b.data._led && Array.isArray(b.data._led[item])) ? b.data._led[item] : null;
  if (_cl && _cl.length) {
    const got = _cl.splice(0, takeAmt);
    Carry.noteEntries(player, item, got);
    if (!_cl.length) delete b.data._led[item];
    if (b.data._led && !Object.keys(b.data._led).length) delete b.data._led;
  }
  // ★★[부패 2차 2026-09-01] **로트를 그릇에서 되찾는다.** 그릇에 있던 구간은 그 자리 배율로
  //   정산되고(`moveIn` 안에서 `exposureOf`), 손에 오는 순간 배율이 'carry' 로 바뀐다 —
  //   위치 이력을 저장하지 않고도 정확한 이유가 이 체크포인트다.
  const _cls = (b.data._lots && Array.isArray(b.data._lots[item])) ? b.data._lots[item] : null;
  if (_cls && _cls.length && Lots.isLot(item)) {
    const _today = zoneGameDay();
    let left = takeAmt;
    const moved = [];
    while (left > 1e-9 && _cls.length) {
      const r = _cls[0];
      const take = Math.min(left, +r.n || 0);
      if (take <= 1e-9) { _cls.shift(); continue; }
      moved.push(Object.assign({}, r, { n: +take.toFixed(6) }));
      r.n = +(r.n - take).toFixed(6); left -= take;
      if (r.n <= 1e-9) _cls.shift();
    }
    if (moved.length) Lots.moveIn(player, item, moved, _today, 0, 'carry');
    if (!_cls.length) delete b.data._lots[item];
    if (b.data._lots && !Object.keys(b.data._lots).length) delete b.data._lots;
  }
  db.updateBuildingData(b.dbId, JSON.stringify(b.data));
  syncGuildGranary(b);   // ★인출·약탈도 같은 경로로 회계 반영(물리에서 빠진 만큼 총자산 감소)
  savePlayer(player);
  sendInventory(player);
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
  // 장착 무기 장비(품질 attack) → 화살 데미지 가산 + 마모 (근접 tryAttack과 동형·미장착 시 불변)
  let arrowDmg = ARROW_DMG;
  const wpnEq = getEquippedEquipment(player, 'weapon');
  if (wpnEq && wpnEq.attrs && wpnEq.attrs.attack) {
    arrowDmg += Math.round(wpnEq.attrs.attack * WEAPON_EQUIP_ATK_SCALE);
    wearEquipment(player, 'weapon', 1);
  }
  const dx = aimX - player.x, dy = aimY - player.y, L = Math.hypot(dx, dy) || 1;
  const aid = `${ZONE_ID}_ar${nextArrowId++}`;
  const arrow = {
    aid, x: player.x, y: player.y,
    vx: dx / L * ARROW_SPEED, vy: dy / L * ARROW_SPEED,
    ownerPid: player.pid, ownerId: player.playerId, dmg: arrowDmg, ttl: ARROW_TTL_MS,
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
        // §4-4 wildlife 브리지: 화살 피격 — 랩 hp 동기 + 놀람/반격(사수가 이 존 플레이어면 반격 표적)
        if (m.isWild) Wildlife.onMobHit(m, a.dmg, players.get(a.ownerPid) || null);
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
  let atk = Math.round(PLAYER_ATTACK_DAMAGE * (eff ? eff.attackMult : 1));
  if (eqInst) consumeEquippedDurability(player, 1);
  // 장착 무기 장비(품질 attack 속성) 데미지 가산 + 사용 마모 — 미장착 시 기존 행동 불변
  const wpnEq = getEquippedEquipment(player, 'weapon');
  if (wpnEq && wpnEq.attrs && wpnEq.attrs.attack) {
    atk += Math.round(wpnEq.attrs.attack * WEAPON_EQUIP_ATK_SCALE);
    wearEquipment(player, 'weapon', 1);
  }

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
    // §4-4 wildlife 브리지: 본체 hp(×10 스케일)→랩 hp 동기 + 피격 반응(놀람 도주/멧돼지·늑대 반격 돌진)
    if (bestMob.isWild) Wildlife.onMobHit(bestMob, atk, player);
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
      // 일정 시간 후 리스폰 — §4-4 wildlife 몹은 제외(개체수는 랩 생태(updateMobs 스폰 target)가 관리)
      if (!bestMob.isWild && (HOSTILES_ON || !(ANIMALS[bestMob.type] && ANIMALS[bestMob.type].aggressive))) {
        const respawnType = bestMob.type;
        setTimeout(() => {
          const m = spawnMob(respawnType);
          broadcast({ type: 'mob_spawn', mob: { mid: m.mid, type: m.type, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp } });
        }, 15000);
      }
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
      // §4-4 Stage 4B(§5.5b): 벽류 파괴(손상=통과 가능) = 개통 → 교역 거리행렬·캐러밴 경로 무효화
      if (bestWall.type === 'wall' || bestWall.type === 'fence') SimVillages.invalidateTradeDistances(Math.floor(bestWall.x / BUILDING_SIZE), Math.floor(bestWall.y / BUILDING_SIZE));
    } else {
      send(player.ws, { type: 'notice', text: `${bestWall.type} 공격 (${bestWall.data.hp}/${maxHp})` });
    }
    try { db.updateBuildingData(bestWall.dbId, JSON.stringify(bestWall.data)); } catch (e) {}
    broadcast({ type: 'building_damaged', id: bestWall.id, hp: bestWall.data.hp, maxHp, damaged: !!bestWall.data.damaged });
    roomsTouchBuilding(bestWall);   // ★[배치 18 ①] 부서진 벽은 경계가 아니다 → 뚫린 방은 해체된다
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
  // ★[신체 상태 §7] 부상 — **주사위가 아니라 피해량 문턱**이다(일관성 원칙: 같은 상황이면 같은 결과).
  //   잔타는 안 다치고 늑대 한 대는 다친다. 회복은 시간 + 약초(medicinal_herb 가 재촉한다).
  if (!p.isNpc) {
    const add = Body.onDamage(p, dmg);
    if (add > 0) {
      const inj = Body.ensure(p).injury;
      send(p.ws, { type: 'notice', text: `🩹 다쳤다 — ${source ? source.replace('mob:', '') + '에게 ' : ''}크게 맞았다 (부상 ${(inj * 100).toFixed(0)}%)` });
    }
  }
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
    // ★★[2026-08-26] **누가 죽였는지 로그에 남긴다.** `source` 는 예전부터 인자로 받고 있었는데
    //   사람 플레이어 사망에서는 한 번도 찍지 않았다 — 그래서 e2e-terrain 의 검사 플레이어가
    //   왜 죽는지 알아내는 데 화면 스크린샷까지 동원해야 했다(그러고도 못 좁혔다).
    //   운영에서도 "왜 죽었나"는 첫 질문이다. 사망은 드문 사건이라 로그 부담도 없다.
    console.log(`[${ZONE_ID}] ☠️ ${p.name}(${p.pid}) 사망 — by ${source || '?'} @ (${p.x.toFixed(0)},${p.y.toFixed(0)}) hp0 배고픔 ${Math.round(p.hunger)} 목마름 ${Math.round(p.thirst)}`);
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
    // ★★[T56 2026-09-02 · §12] **소리.** 창 3분의 근거가 "소리를 듣고 달려오는 사람"인데
    //   T43 까지 쓰러짐은 그 사람 화면에만 떴다. 야생에서만 외친다(마을은 이미 사람이 있다).
    Rescue.onDown(p, Date.now());
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
    // ★★[T45 2026-09-02] **`c.ownerId` 는 클레임에 없는 필드다** — 사유지는 `ownerPid` 로만 주인을 적는다
    //   (`tryClaim`·부팅 로드·`countMyClaims`·`tryUnclaim` 이 전부 `ownerPid`). `undefined !== '<id>'` 라
    //   이 절은 **언제나 continue** 였다 ⇒ 개인·임시 사유지가 **재시작과 무관하게 한 번도 부활 지점이 된 적이 없다.**
    //   문서 §0-ⓐ-1-ⓒ 는 "재시작 뒤에"라고 적었지만 실측은 더 나빴다 — 처음부터였다.
    if (c.ownerPid !== p.playerId) continue;
    if (c.kind !== 'personal' && c.kind !== 'temporary') continue;
    if ((c.state || 'active') === 'free') continue;   // 개방된 땅은 더는 내 집이 아니다
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
  // ★★[T43 2026-09-02] **4번 — 마지막 보루.** 위 주석이 2026-07 부터 약속해 온 갈래인데
  //   **코드에 없었다**(죽음 설계 §0-ⓐ-1 이 잡은 막다른 골목): 사유지·길드·귀향점이 전부 없는
  //   게스트로 쓰러지면 옵션이 **빈 배열**이 되고 클라가 *"부활 가능한 지점이 없습니다"* 를 띄웠다.
  //   ⇒ 가장 가까운 마을의 **도착 지점**(온보딩 v2 가 이미 만든 나루터·길목 — 걸어갈 수 있고
  //     물·바위가 아닌 자리다. 좌표를 새로 지어내지 않는다)으로 깨어난다.
  //   ★이 함수는 이제 **절대 빈 배열을 안 낸다**(`test-downed ②` 가 매번 못 박는다).
  if (!opts.length) {
    const w = nearestVillageWake(p.x, p.y);
    if (w) opts.push({ claimId: '__shelter__', kind: 'shelter', x: w.x, y: w.y, vid: w.vid, vname: w.name });
  }
  return opts;
}

// ★가장 가까운 마을의 "깨어날 자리" — 도착 지점이 있으면 그것, 없으면 마을 중심.
//   ★사본 금지: 마을 목록도 도착 지점도 **정본을 그대로 부른다**(좌표 표를 여기 안 적는다).
function nearestVillageWake(x, y) {
  let best = null, bd = Infinity;
  try {
    //   `clientVillages()` 가 마을 목록의 정본이다(온보딩도 이걸 본다). `cx/cy` 는 **셀**이다.
    for (const v of (SimVillages.clientVillages() || [])) {
      const vx = v.cx * 32 + 16, vy = v.cy * 32 + 16;
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
      const d = Math.hypot(vx - x, vy - y);
      if (d < bd) { bd = d; best = { vid: v.id, name: v.name, x: vx, y: vy }; }
    }
  } catch (e) { best = null; }
  if (!best) return null;
  try {
    const a = Onboarding.arrivalOf ? Onboarding.arrivalOf(best.vid) : null;
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) { best.x = a.x; best.y = a.y; }
  } catch (e) {}
  // ★★**깨어날 자리는 설 수 있는 자리여야 한다.** 도착 지점은 걸어갈 수 있는 자리로 산출되지만
  //   그 표가 아직 안 데워졌으면(부팅 직후) 마을 **중심**으로 떨어지고, 중심은 집·물일 수 있다.
  //   ⇒ 물·막힘이면 나선으로 가장 가까운 설 수 있는 칸을 찾는다. **못 찾으면 그대로 둔다**
  //     (없는 자리를 지어내느니 원래 자리가 낫다 — 그때는 하네스가 잡는다).
  if (isWaterTileLocal(best.x, best.y) || isTerrainBlockedLocal(best.x, best.y)) {
    outer:
    for (let r = 1; r <= 24; r++) {
      for (let a2 = 0; a2 < 8 * r; a2++) {
        const th = (2 * Math.PI * a2) / (8 * r);
        const x = best.x + Math.cos(th) * r * 32, y = best.y + Math.sin(th) * r * 32;
        if (x < 64 || y < 64 || x >= ZONE.zoneWidth - 64 || y >= ZONE.zoneHeight - 64) continue;
        if (!isWaterTileLocal(x, y) && !isTerrainBlockedLocal(x, y)) { best.x = x; best.y = y; break outer; }
      }
    }
  }
  return best;
}

// ★★[T43 2026-09-02 재민 확정 · §12] **"고르는 부활"은 없어졌다 — 이건 이제 "포기"다.**
//   §12 의 사슬은 `쓰러짐 → 구조 창 → (마을 이송 | 사망) → 깨어남` 하나뿐이고, 그 어디에도
//   "버튼을 눌러 풀피로 순간이동" 이 없다. 그게 남아 있으면 창도 사망도 **누르면 사라지는 것**이 된다.
//   ⇒ 화면(부활 패널)은 그대로 두되 **뜻을 바꾼다**: 고르는 것은 부활 지점이 아니라
//     **"구조를 기다리지 않고 여기서 깨어나겠다"** 는 포기 선언이다. 대가는 창이 소진된 것과 **같다**:
//     마을 반경 안이면 이송(짐 보존), 야생이면 사망(짐 낙하 · 후유증). 값을 치르는 자리가 하나다.
function tryRespawnChoice(player, claimId) {
  if (!player.isDown) { send(player.ws, { type: 'notice', text: '다운 상태가 아닙니다' }); return; }
  const opts = listRespawnOptions(player);
  const target = opts.find(o => o.claimId === claimId) || opts[0];
  if (!target) {
    // ★여기 오면 `listRespawnOptions` 의 마지막 보루가 깨진 것이다(마을이 하나도 없는 존).
    send(player.ws, { type: 'notice', text: '깨어날 자리를 못 찾았다 — 구조를 기다린다' });
    return;
  }
  send(player.ws, { type: 'notice', text: '⏳ 구조를 기다리지 않기로 했다…' });
  resolveDowned(player, target);
}

// ★★[T43 2026-09-02 재민 확정 · §12] 구조 = **옆에서 N초 붙들기 하나.**
//   §12: *"창 안에 다른 플레이어가 상태를 내리는 행동을 하면 구조 — 먹여주기·물 먹이기·
//   불가로 옮기기·붙들기(부상)."* 그리고 *"구조 자체는 '옆에서 N초 붙들기' 하나."*
//   ⇒ 동사를 넷 만들지 않았다. **업기와 붙들기를 한 동작으로 합쳤다**:
//     R 을 누르면 들쳐업고(=붙들기 시작), 그대로 서 있으면 N초 뒤 깨어나고,
//     걸어서 불가·마을로 옮기면 **옮기는 동안에도 그 시간이 흐른다**. 한 동작이 둘을 다 한다.
//   ★"먹여주기·물 먹이기"는 이 카드가 **안 만들었다**(새 클라 동사가 필요하다 — 회부).
//     대신 §12 의 요점은 그대로 산다: 극단 축이 남은 채 일어나면 **T44 식이 다시 눕힌다**(새 규칙 0).
//   ★자격 — **같은 길드만**이라는 종전 제한을 없앴다. §12 는 *"다른 플레이어"* 라고만 한다.
//     낯선 이가 업어 옮기는 것이 이 세계의 구조다(클라도 같은 판정으로 고쳤다 — 열쇠가 하나다).
function tryRescue(rescuer, downedPid) {
  if (rescuer.isDown) return;
  // ★이미 업고 있으면 R 은 **내려놓기**다(같은 키 · 상태 토글 — 새 동사 0).
  if (rescuer._carrying) {
    const cur = players.get(rescuer._carrying);
    _dropCarried(rescuer, cur, '내려놓았다');
    return;
  }
  const target = players.get(downedPid);
  if (!target || !target.isDown) {
    send(rescuer.ws, { type: 'notice', text: '구조 대상이 없습니다' });
    return;
  }
  if (target._carriedBy) { send(rescuer.ws, { type: 'notice', text: '다른 사람이 이미 업고 있다' }); return; }
  const elapsed = Date.now() - (target.downedAt || 0);
  if (elapsed > RESCUE_WINDOW_MS) {
    send(rescuer.ws, { type: 'notice', text: '구조 가능 시간이 지났습니다' });
    return;
  }
  const d = Math.hypot(rescuer.x - target.x, rescuer.y - target.y);
  if (d > RESCUE_RANGE_PX) {
    send(rescuer.ws, { type: 'notice', text: `${Math.round(d)}px 떨어짐 — ${RESCUE_RANGE_PX}px 안에서 R` });
    return;
  }
  // ── 업는다 ────────────────────────────────────────────────────────────
  rescuer._carrying = target.pid;
  rescuer._carryingKg = CARRY_PERSON_KG;      // ★`carry.totalKg` 가 이 한 값을 더한다(곡선 무변)
  target._carriedBy = rescuer.pid;
  target._rescueHoldMs = 0;
  broadcast({ type: 'player_down_state', pid: target.pid, isDown: true, carriedBy: rescuer.pid });
  const eff = Carry.effects(rescuer);
  send(rescuer.ws, { type: 'notice',
    text: `🫂 ${target.name}을(를) 업었다 — ${Math.round(RESCUE_HOLD_MS / 1000)}초 붙들면 깨어난다`
        + ` · 짐 ${eff.kg.toFixed(0)}/${eff.cap.toFixed(0)}kg (이속 ×${eff.moveMult})` });
  send(target.ws, { type: 'notice', text: `🫂 ${rescuer.name}님이 당신을 업었다` });
  // ★★구조자가 **왜 쓰러졌는지**를 볼 수 있어야 한다(§12: 원인 표지는 없고 몸이 원인이다).
  //   새 패널을 만들지 않았다 — 기존 알림 문구 문법으로 그 몸의 무들을 그대로 읽어 준다.
  try {
    const md = Body.moodles(target).map((m) => `${m.emo} ${m.ko} ${Math.round(m.sev * 100)}%`);
    send(rescuer.ws, { type: 'notice',
      text: `🩺 ${target.name}의 상태 — ${md.length ? md.join(' · ') : '겉으로는 멀쩡하다'}`
          + ` (배고픔 ${Math.round(target.hunger)} · 목마름 ${Math.round(target.thirst)})` });
  } catch (e) {}
}

// 업기 해제 — 죽거나 끊기거나 내려놓거나.
function _dropCarried(carrier, target, why) {
  if (carrier) { carrier._carrying = null; carrier._carryingKg = 0; }
  if (target) {
    target._carriedBy = null;
    broadcast({ type: 'player_down_state', pid: target.pid, isDown: !!target.isDown });
  }
  if (carrier && carrier.ws && why) send(carrier.ws, { type: 'notice', text: `🫳 ${target ? target.name : '그 사람'}을(를) ${why}` });
}

// ★깨어나기 — 구조·이송·사망이 **같은 문 하나**로 일어난다(세 곳에 흩어 두면 규약이 갈린다).
function _wakeUp(p, x, y, hpFrac, msg) {
  p.isDown = false;
  p.downedAt = 0;
  p._rescueHoldMs = 0;
  p._deadUntil = 0;
  Body.ensure(p).hpDebt = 0;            // ★누워 있는 동안 쌓인 극단 빚을 지우고 일어난다(T44 와의 접점)
  p.hp = Math.max(1, Math.round(p.maxHp * hpFrac));
  if (Number.isFinite(x) && Number.isFinite(y)) { p.x = x; p.y = y; }
  p.vx = 0; p.vy = 0;
  p.lastDamagedAt = Date.now();
  broadcast({ type: 'player_respawn', pid: p.pid, hp: p.hp, x: p.x, y: p.y });
  broadcast({ type: 'player_down_state', pid: p.pid, isDown: false });
  if (msg) send(p.ws, { type: 'notice', text: msg });
  savePlayer(p);
}

// ★★창이 끝났을 때(또는 스스로 포기했을 때) 무슨 일이 나는가 — **마을이면 이송, 야생이면 사망.**
//   §12: *"마을 반경 안이면 창이 끝나도 마을 사람이 옮긴다. 죽음은 야생에서만."*
//   ★마을 반경 술어는 추위가 쓰는 **완충 정본** 하나다(`SimVillages.shelterAt` — 사본 금지).
function resolveDowned(p, wakeSpotOverride) {
  const inVillage = (() => { try { return (SimVillages.shelterAt(p.x, p.y) || 0) > 0; } catch (e) { return false; } })();
  if (p._carriedBy) { const c = players.get(p._carriedBy); _dropCarried(c, p, '내려놓았다'); }
  const spot = wakeSpotOverride || (inVillage ? nearestVillageWake(p.x, p.y) : _wakeSpotOf(p));
  const delayMs = Math.max(0, DOWN_WAKE_GAMEMIN * 1000);   // 1 게임분 = 1 실초(시간 구조 불변 캐논)
  if (inVillage) {
    // ── 마을 안 불사 — 죽지 않는다. 짐도 그대로다. 마을 사람이 쉼터로 옮긴다.
    p._deadUntil = Date.now() + delayMs;
    p._wakeSpot = spot ? { x: spot.x, y: spot.y } : null;
    p._wakeMsg = `🏘️ 마을 사람들이 당신을 쉼터로 옮겼다 — ${spot && spot.name ? spot.name + '에서 ' : ''}깨어났다`;
    p._diedInWild = false;
    send(p.ws, { type: 'notice', text: '🏘️ 마을 안이다 — 누군가 당신을 발견했다…' });
    console.log(`[${ZONE_ID}] 🏘️ ${p.name} 마을 안 구제 — 쉼터 이송 대기`);
    return;
  }
  // ── 야생 사망 ───────────────────────────────────────────────────────────
  _deathDrop(p);
  Body.startAftermath(p, gameDayNow());
  p._deadUntil = Date.now() + delayMs;
  p._wakeSpot = spot ? { x: spot.x, y: spot.y } : null;
  p._wakeMsg = `⚰️ 얼마나 지났는지 모르겠다 — ${spot && spot.name ? spot.name + '에서 ' : ''}깨어났다.`
             + ` 짐은 쓰러진 자리에 두고 왔다 (며칠은 숨이 덜 붙는다)`;
  p._diedInWild = true;
  send(p.ws, { type: 'notice', text: '⚰️ 정신을 잃었다…' });
  console.log(`[${ZONE_ID}] ⚰️ ${p.name} 사망 @ (${p.x.toFixed(0)},${p.y.toFixed(0)}) — 짐 낙하 · 후유증`);
}

// ★깨어날 자리 사다리 — 사유지 → 길드 → 귀향점 → **가장 가까운 마을 도착 지점**.
//   `listRespawnOptions` 가 그 사다리의 정본이고, 이제 **절대 빈 배열을 안 낸다**.
function _wakeSpotOf(p) {
  const opts = listRespawnOptions(p);
  return opts.length ? opts[0] : null;
}

// ★★짐꾸러미 — 그 자리에 떨어뜨린다. **정본 낙하 경로**(`_spawnGroundItems`)를 그대로 쓴다
//   ⇒ 개체 kg 원장도 로트 나이도 그대로 실린다(로트는 바닥에서 **계속 부패**한다 — §12).
//   ★디스폰 금지(§12) — `keep` 표를 달면 10분 청소가 건너뛴다.
//   ⚠**입은 것(equipment)은 안 떨어뜨린다.** 몸에 걸친 것은 "짐"이 아니고, 바닥템에 장비 인스턴스를
//     실을 자리가 없어서(속성·내구가 뭉개진다) 주우면 다른 물건이 된다. 회부로 남긴다.
function _deathDrop(p) {
  let n = 0;
  try { Carry.reconcile(p, p.inventory); } catch (e) {}
  // ⓐ 수량 품목 — 정본 드롭과 같은 순서(로트를 인벤보다 **먼저** 꺼낸다)
  for (const [item, cnt0] of Object.entries(p.inventory || {})) {
    const cnt = Math.floor(Number(cnt0) || 0);
    if (cnt <= 0) continue;
    let lr = null;
    try { lr = _takeGroundLots(p, item, cnt); } catch (e) { lr = null; }
    p.inventory[item] = 0;
    let t = { kg: 0, entries: [] };
    try { t = Carry.takeEntries(p, item, cnt); } catch (e) {}
    const gis = _spawnGroundItems(p, item, [{ n: cnt, kg: t.kg, led: t.entries }], lr);
    for (const g of gis) g.keep = 1;
    try { Lots.reconcile(p, item, p.inventory, zoneGameDay()); } catch (e) {}
    n += cnt;
  }
  // ⓑ 도구 개체 — 내구도까지 그대로
  for (const inst of (p.toolItems || []).slice()) {
    const kg = Weights.kgOfOrDefault(inst.type);
    const gis = _spawnGroundItems(p, inst.type, [{ n: 1, kg, tool: { type: inst.type, d: inst.d, max: inst.max } }]);
    for (const g of gis) g.keep = 1;
    n++;
  }
  p.toolItems = [];
  p.equipped = null; p.hotkey1 = null;
  try { sendInventory(p, 'death'); } catch (e) {}
  send(p.ws, { type: 'tools', toolItems: [], equipped: null, hotkey1: null });
  return n;
}

// ★★쓰러짐 틱 — 업고 걷기 · 붙들기 진행 · 창 소진 · 깨어남. **1초에 한 번**이면 충분하다.
let _downedTickAt = 0;
function tickDowned(now) {
  if (now - _downedTickAt < 1000) return;
  const dt = _downedTickAt ? (now - _downedTickAt) : 1000;
  _downedTickAt = now;
  for (const p of players.values()) {
    if (p.isNpc) continue;
    // ⓞ 업고 있던 사람이 **사라졌다**(접속 종료·존 이동). 업은 이의 60kg 이 영원히 남으면
    //   그 사람은 평생 비틀거린다 — 짐은 사람이 있을 때만 짐이다.
    if (p._carrying && !players.has(p._carrying)) { p._carrying = null; p._carryingKg = 0; }
    // ⓐ 업힌 사람 — 업은 이를 따라간다(게이지는 이미 멎어 있다: 생존 루프가 `isDown` 을 건너뛴다)
    if (p._carriedBy) {
      const c = players.get(p._carriedBy);
      if (!c || c.isDown || c.handingOff || !c.ws || c.ws.readyState !== 1) { _dropCarried(c, p, '놓쳤다'); continue; }
      p.x = c.x; p.y = c.y; p.floor = c.floor || 0;
      p._rescueHoldMs = (p._rescueHoldMs || 0) + dt;
      if (p._rescueHoldMs >= RESCUE_HOLD_MS) {
        _dropCarried(c, p, null);
        _wakeUp(p, p.x, p.y, RESCUE_HP_FRAC, `🤝 ${c.name}님이 당신을 일으켰다 (HP ${Math.round(p.maxHp * RESCUE_HP_FRAC)})`);
        send(c.ws, { type: 'notice', text: `🤝 ${p.name}님을 구했다` });
        console.log(`[${ZONE_ID}] 🤝 ${c.name} → ${p.name} 구조 성공(${Math.round(RESCUE_HOLD_MS / 1000)}초 붙들기)`);
      }
      continue;
    }
    // ⓑ 깨어날 시각이 됐다(사망·이송 뒤 게임 시간 경과)
    if (p._deadUntil && now >= p._deadUntil) {
      const sp = p._wakeSpot;
      _wakeUp(p, sp ? sp.x : p.x, sp ? sp.y : p.y, RESCUE_HP_FRAC, p._wakeMsg || '눈을 떴다');
      p._wakeSpot = null; p._wakeMsg = null; p._diedInWild = false;
      continue;
    }
    // ⓒ 구조 창 소진 — 마을이면 이송, 야생이면 사망
    if (p.isDown && !p._deadUntil && p.downedAt && (now - p.downedAt) > RESCUE_WINDOW_MS) {
      resolveDowned(p);
    }
  }
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
// ★★[2026-08-04d 배치 18 ①] **한 순회, 두 술어.** 콜라이더와 방 판정은 같은 변을 보지만 답이 다르다:
//   · 콜라이더(roomMode=false) — 열린 문은 **통과**한다(종전 그대로. 물리는 한 비트도 안 바뀐다).
//   · 방 경계(roomMode=true)   — 열린 문도 **경계**다. 문은 드나드는 구멍이지 방이 새는 구멍이 아니다.
//   종전엔 술어가 하나뿐이라 열린 문에서 방이 새어 나갔다(client.js 4272 주석이 그 실증).
//   순회를 복제하지 않고 술어만 가른다 — 사본 금지.
function _edgeScan(cx, cy, side, floor, roomMode) {
  // wall은 cell (cx,cy)의 좌상단(b.x=cx*32, b.y=cy*32)에 저장됨. data.side로 N/E 구분.
  // door도 같은 edge 형식. open일 때는 차단 X(콜라이더 한정 — 방 경계는 위 주석 참조).
  // fence는 14.50부터 cell 위치 (edge 아님). 여기선 check 안 함.
  const ex = cx * BUILDING_SIZE;
  const ey = cy * BUILDING_SIZE;
  const nearby = qtBuildings ? qtBuildings.queryCircle(ex, ey, BUILDING_SIZE * 2) : Array.from(buildings.values());
  for (const b of nearby) {
    if (b.type !== 'wall' && b.type !== 'door') continue;
    if ((b.floor || 0) !== floor) continue;
    if (b.data?.damaged) continue;   // 부서진 벽은 둘 다 아니다(뚫린 구멍 — 방도 해체된다)
    if (!roomMode && b.type === 'door' && b.data?.open) continue; // 열린 door 통과 OK
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
function findEdgeWall(cx, cy, side, floor) { return _edgeScan(cx, cy, side, floor, false); }
function findEdgeBoundary(cx, cy, side, floor) { return _edgeScan(cx, cy, side, floor, true); }
// 그 칸의 바닥 타일(방 판정 정본 입력). 계단이 만든 자동 바닥도 바닥이다.
function findFloorTile(cx, cy, floor) {
  const ax = cx * BUILDING_SIZE + BUILDING_SIZE / 2, ay = cy * BUILDING_SIZE + BUILDING_SIZE / 2;
  const nearby = qtBuildings ? qtBuildings.queryCircle(ax, ay, BUILDING_SIZE) : Array.from(buildings.values());
  for (const b of nearby) {
    if (b.type !== 'floor') continue;
    if ((b.floor || 0) !== floor) continue;
    if (Math.floor(b.x / BUILDING_SIZE) === cx && Math.floor(b.y / BUILDING_SIZE) === cy) return b;
  }
  return null;
}
// 마을 정형 건물인가 — 발자국 렉트 태그(data.hut/bld/gran)가 그 표식이다(villages.js 가 전 행에 찍는다).
//   이 태그가 있으면 **현행 렉트 컷어웨이 경로**가 정본이고 방 시스템은 손대지 않는다(회귀 0).
function isVillageTaggedBuilding(b) { return !!(b && (b.sim || (b.data && (b.data.hut || b.data.bld || b.data.gran)))); }
Rooms.init({ hasBoundaryEdge: findEdgeBoundary, floorTileAt: findFloorTile, isVillageTagged: isVillageTaggedBuilding });
// ── 방 갱신 진입점 ───────────────────────────────────────────────────────────
//   벽·문·바닥이 바뀐 **그 자리 주변만** 다시 본다(전역 재계산 금지 — 거리행렬 증분화 선례).
//   ★문 여닫기에는 훅이 없다 — 열린 문도 경계라 방이 안 바뀐다(설계상 불필요, 비용 0).
function _roomsApply(res) {
  if (!res || (!res.changed.length && !res.removed.length)) return;
  broadcast({ type: 'rooms_update', rooms: res.changed.map(Rooms.wireRoom), removed: res.removed });
}
// ★★스테일 인덱스 함정 — E2E 가 잡았다. 방 판정 입력(벽·문·바닥 조회)은 `qtBuildings` 를 쓰는데
//   그 쿼드트리는 **틱마다 통째로 다시 만든다**(209행). 그래서 건물을 놓거나 헌 **바로 그 순간** 다시 재면
//   방금 헌 벽이 아직 남아 보이고(→ 방이 안 풀린다) 방금 놓은 문은 아직 안 보인다(→ 방이 풀린다).
//   ⇒ **다음 틱으로 미룬다.** 시드만 모아 두고 rebuildSpatialIndex() 직후에 한 번에 처리한다.
//     지연은 한 틱(≈33ms)이라 사람 눈엔 없고, 연속 건축(벽 여러 장)은 자연히 한 번에 묶인다.
const _roomPending = new Map();   // floor → Set("cx,cy")
function _roomQueue(cells, floor) {
  const f = floor | 0;
  if (!_roomPending.has(f)) _roomPending.set(f, new Set());
  const S = _roomPending.get(f);
  for (const [cx, cy] of cells) S.add(`${cx},${cy}`);
}
function roomsFlush() {
  if (!_roomPending.size) return;
  for (const [f, S] of _roomPending) {
    const cells = [];
    for (const k of S) { const [x, y] = k.split(','); cells.push([+x, +y]); }
    try { _roomsApply(Rooms.recomputeAround(cells, f)); } catch (e) { console.error('[rooms] flush:', e.message); }
  }
  _roomPending.clear();
}
function roomsTouchEdge(cx, cy, side, floor) { _roomQueue(Rooms.seedsForEdge(cx, cy, side), floor); }
function roomsTouchCell(cx, cy, floor) { _roomQueue([[cx, cy]], floor); }
// 건물 하나가 생기거나 사라졌을 때 — 종류를 보고 알맞은 시드로 넘긴다(호출부가 종류를 몰라도 되게)
function roomsTouchBuilding(b) {
  if (!b) return;
  const cx = Math.floor(b.x / BUILDING_SIZE), cy = Math.floor(b.y / BUILDING_SIZE), f = b.floor || 0;
  if (b.type === 'wall' || b.type === 'door') roomsTouchEdge(cx, cy, b.data?.side || 'N', f);
  else if (b.type === 'floor') roomsTouchCell(cx, cy, f);
}
// 청크가 켜졌다 — 그 청크의 **플레이어 바닥**에서만 방을 찾는다.
//   마을 태그 건물은 시드에서 빠지므로 50마을 세계에서도 비용이 0 에 가깝다(움집·큰집·곳간 전부 스킵).
function roomsScanChunk(cx, cy) {
  const c = chunkManager.chunks.get(chunkManager.keyOf(cx, cy));
  if (!c || !c.buildings.size) return;
  const seeds = new Map();   // floor → [[cx,cy]…]
  for (const b of c.buildings.values()) {
    if (b.type !== 'floor' || isVillageTaggedBuilding(b)) continue;
    const f = b.floor || 0;
    if (!seeds.has(f)) seeds.set(f, []);
    seeds.get(f).push([Math.floor(b.x / BUILDING_SIZE), Math.floor(b.y / BUILDING_SIZE)]);
  }
  for (const [f, list] of seeds) _roomQueue(list, f);   // ★같은 이유로 다음 틱에 — 활성화 직후엔 쿼드트리에 아직 안 들어갔다
}
// 청크가 꺼졌다 — 그 청크 바닥이 속한 방을 내린다(건물이 메모리에서 내려가면 판정 입력이 사라진다).
function roomsDropChunk(c) {
  if (!c || !c.buildings.size) return;
  const gone = [];
  for (const b of c.buildings.values()) {
    if (b.type !== 'floor') continue;
    const id = Rooms.roomIdAt(Math.floor(b.x / BUILDING_SIZE), Math.floor(b.y / BUILDING_SIZE), b.floor || 0);
    if (id && Rooms.dropRoom(id)) gone.push(id);
  }
  if (gone.length) broadcast({ type: 'rooms_update', rooms: [], removed: gone });
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
const ROCK_COLLIDER_R = 14;     // ★바위·광맥 차단 반경(대형 스프라이트 66px의 코어) — 나무와 동형의 물리 실체 [사용자 확정]. 클라 미러 동일 상수.
function isBlockedByTree(x, y) {
  if (!qtResources) return false;
  // 검색 반경 28 = 최대 충돌(max(TRUNK 9, ROCK 14) + PLAYER_BODY_R 6 = 20)보다 충분히 큼. 클라 스캔(40)과 함께 둘 다 모든 차단 개체 포함 → 일관.
  const nearby = qtResources.queryCircle(x, y, 28);
  for (const item of nearby) {
    const r = item.ref || item;
    if (r.type === 'tree' && r.r) {
      const tr = Math.min(r.r, TRUNK_COLLIDER_MAX);   // 줄기 반경 (캐노피 r 아님)
      if (Math.hypot(r.x - x, r.y - y) < tr + PLAYER_BODY_R) return true;
    } else if (r.type === 'rock' || r.type === 'ore') {   // ★대형 자연물 콜라이더(채광 GATHER_RANGE 48 > 20이라 작업 무영향)
      if (Math.hypot(r.x - x, r.y - y) < ROCK_COLLIDER_R + PLAYER_BODY_R) return true;
    }
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
// === Phase 5-econ-game-1: NPC 직업 기반 마을 생산 ===
//   옛 biomeProduction(고정 번들·모든 마을 동일)을 대체. "누가 무슨 직업인가"가 생산을 결정.
//   마을 NPC를 직업별 집계 → 직업 산출 합산 → 마을 길드 금고(central treasury)에 누적.
//   miner는 zone biome의 ORE_POOL에서 광물 산출 (한반도=철·구리·석탄·텅스텐·대리석·옥·금). tier별 dropChance.
//   소수 산출은 마을별 carry로 이월 → 작은 마을도 결국 누적. 입력소비·시장가는 후속(marketplace) 단계.
const JOB_YIELD = {                  // NPC 1명당 1사이클(60s) 마을 추상 산출 (유효 game item id)
  // 설계 철학: 마을(=시뮬)이 경제 주체, NPC의 가시 농사/낚시는 '표현'(decideNpcBehavior).
  farmer:     { berry: 1.2 },
  fisher:     { fish: 1.0 },
  forager:    { herb: 0.6, fiber: 0.6 },
  lumberjack: { wood: 1.2 },
  hunter:     { meat_raw: 0.8, hide: 0.3 },
  cook:       { meat_cooked: 0.5 },
  weaponsmith:{ sword: 0.15 },
  // miner: ORE_POOL 특수처리. smith/armorsmith: 후속(전용 소비아이템). warrior/merchant: 서비스(무생산).
};
const _prodCarry = new Map();        // villageName -> { item: 소수 carry }
// 실제 작업 산출(어부 낚시·농부 수확 등) — 마을별 버퍼. 60초 생산틱이 금고로 flush(중앙호출 배치).
const _realYield = new Map();        // villageName -> { item: qty }
function addRealYield(village, item, qty) {
  if (!village || !item || !qty) return;
  let y = _realYield.get(village);
  if (!y) { y = {}; _realYield.set(village, y); }
  y[item] = (y[item] || 0) + qty;
}

// 마을별 NPC 직업 집계. 활성·비활성 무관(오프라인 경제) — 60s마다 NPC 전수 1회 순회(값쌈).
function tallyVillageJobs() {
  const tally = new Map();           // villageName -> { job: count }
  for (const pid of npcs) {
    const npc = players.get(pid);
    if (!npc || npc.hp <= 0) continue;
    // 라이브 canadia NPC는 canadiaJob/canadiaVillage를, legacy spawnVillagers NPC는 npcJob/tribeName을 씀 — 둘 다 지원.
    const job = npc.canadiaJob || npc.npcJob;
    const vn = npc.canadiaVillage || npc.tribeName;
    if (!job || !vn) continue;
    let t = tally.get(vn);
    if (!t) { t = {}; tally.set(vn, t); }
    t[job] = (t[job] || 0) + 1;
  }
  return tally;
}

// 마을 이름 → 좌표(존 로컬 px). villageProduction 이 그 마을이 딛고 있는 광맥을 찾는 데 쓴다.
const _vilPosCache = new Map();
function _villageAt(name) {
  if (_vilPosCache.has(name)) return _vilPosCache.get(name);
  let hit = null;
  try { for (const v of (VILLAGES || [])) if (v.name === name) { hit = { x: v.x, y: v.y }; break; } } catch (e) { }
  _vilPosCache.set(name, hit);
  return hit;
}
function villageProduction(villageName, jobCounts) {
  const carry = _prodCarry.get(villageName) || {};
  const acc = {};
  const add = (item, q) => { if (q) acc[item] = (acc[item] || 0) + q; };
  for (const [job, n] of Object.entries(jobCounts)) {
    if (job === 'miner') {
      // ★★[11차 채광 재설계] 구 코드는 **biome 풀에서 랜덤**으로 광물을 뽑고 tier dropChance로 굴렸다.
      //   결함 둘 — ①한반도에 금광이 하나도 없는데 51개 마을 전부가 금(가치 100)·옥(80)을 0.25 확률로 캤다
      //             (현 경제 최대 인플레 소스) ②forest 풀에 tin이 없어 **NPC는 주석을 한 개도 못 캤다**
      //             (광맥9를 주석으로 신설했는데도).
      //   이제 **그 마을이 실제로 딛고 있는 광맥의 광물**만, 그 자리의 품위 p 만큼 나온다.
      //   광맥이 없는 마을의 광부는 돌만 캔다(p=0) — 지도에 없는 금이 생기지 않는다.
      const vp = _villageAt(villageName);
      // ★[재민 확정] 마을(NPC)은 **자잘 광맥을 못 본다** — 자잘은 플레이어 전용 발견 요소다.
      const cl = vp ? _terrain.isMajorOreAt(ZONE_ID, vp.x, vp.y) : null;
      // ★major 전용 합성 p — 자잘이 정원·산출에 새면 안 된다(NPC 시야 밖)
      const p = (vp && cl && _terrain.oreProbMajorAt) ? _terrain.oreProbMajorAt(ZONE_ID, vp.x, vp.y) : 0;
      const mineral = cl ? (cl.mineral || 'iron') : null;
      for (let i = 0; i < n; i++) {
        if (mineral && Math.random() < p) add(mineral, 1);
        else add('stone', 1);   // 맥석 — 광맥이 없거나 그 삽이 헛삽이면 돌
      }
      continue;
    }
    const y = JOB_YIELD[job];
    if (y) for (const [item, rate] of Object.entries(y)) add(item, rate * n);
  }
  const prod = {};                   // carry 합산 → 정수만 산출, 나머지 이월
  for (const item of new Set([...Object.keys(acc), ...Object.keys(carry)])) {
    const total = (acc[item] || 0) + (carry[item] || 0);
    const whole = Math.floor(total);
    if (whole > 0) prod[item] = whole;
    const rem = total - whole;
    if (rem > 1e-9) carry[item] = rem; else delete carry[item];
  }
  _prodCarry.set(villageName, carry);
  return prod;
}

// ★[길드 금고 통합] 곳간 재동기 — DB 전수(메모리 미로드 곳간 포함). 부팅 1회 + 생산 틱마다 1회.
//   central이 죽어 있던 동안 쌓인 델타를 자가 치유로 올린다(정확히 한 번 — data._tr 스냅샷 규약).
async function reconcileGuildGranaries(tag) {
  let rows = [];
  try { rows = db.db.prepare("SELECT id, data FROM buildings WHERE type='guild_granary'").all(); } catch (e) { return; }
  if (!rows.length) return;
  // ★[검수 수정 — 이중 계상 방어] 메모리에 로드된 곳간은 **메모리 객체 그대로** 동기화한다.
  //   DB 행 사본으로 동기하면 DB의 _tr만 갱신되고 메모리 b.data._tr은 구본으로 남는다 →
  //   central 장애 복구를 재동기가 처리한 뒤 **다음 입고 이벤트가 장애 기간 델타를 다시 올린다**(중복).
  //   메모리 미로드 곳간만 DB 행 사본으로(그건 이벤트 경로가 없어 안전).
  const inMem = new Map();
  for (const b of buildings.values()) if (b.type === 'guild_granary' && b.dbId) inMem.set(b.dbId, b);
  const objs = rows.map((r) => {
    if (inMem.has(r.id)) return inMem.get(r.id);
    let d = {}; try { d = JSON.parse(r.data || '{}'); } catch (_) { } return { type: 'guild_granary', dbId: r.id, data: d };
  });
  const res = await GuildTreasury.reconcileAll(objs, _guildTreasuryOpts());
  if (res.sent || res.failed) console.log(`[${ZONE_ID}] 💰 길드 곳간 회계 재동기(${tag}): 반영 ${res.sent} · 보류 ${res.failed} · 변화없음 ${res.skipped}`);
}
setTimeout(() => { reconcileGuildGranaries('부팅').catch(() => { }); }, 8000);

setInterval(async () => {
  reconcileGuildGranaries('주기').catch(() => { });   // ★생산 틱과 같은 주기(신규 타이머 없음)
  if (villageGuildIds.size === 0) return;
  const tally = tallyVillageJobs();
  const zoneSum = {};
  for (const [villageName, tribeId] of villageGuildIds) {
    const prod = villageProduction(villageName, tally.get(villageName) || {});
    const real = _realYield.get(villageName);          // 실제 작업 산출(어부·농부) flush
    if (real) { for (const [k, v] of Object.entries(real)) prod[k] = (prod[k] || 0) + v; _realYield.delete(villageName); }
    if (!Object.keys(prod).length) continue;
    try { await central.tribeTreasury(tribeId, prod); } catch (e) { /* central down 무시 */ }
    for (const [k, v] of Object.entries(prod)) zoneSum[k] = (zoneSum[k] || 0) + v;
  }
  const pStr = Object.entries(zoneSum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}+${v}`).join(' ');
  console.log(`[${ZONE_ID}] 🏭 마을 생산 (${villageGuildIds.size}곳·직업기반): ${pStr || '(carry 축적중)'}`);
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

  // §4-4 Stage 3: 마을 econ 일일 틱 훅 — 게임일 '경계'에서만 동작(평시 O(1) 검사, 30Hz 물리와 분리).
  //   idle skip보다 앞: 무인 존에서도 마을 경제 진행(오프라인 경제). ENABLE_VILLAGES=0 → no-op.
  // ★[RTT 상관 계측 2026-08-30] 하루 경계 틱은 평시 O(1) 이고 **경계에서만** 무겁다.
  //   그 무거운 순간을 남긴다(동작은 안 바꾼다 — 관측자).
  // ★[T1 2026-09-01] 조각내기 뒤로 이 값은 **한 프레임 몫**이다(하루 총합이 아니다) — 그래서 이름을 갈랐다.
  //   하루 총합은 villages.js 가 마감 시점에 `econ_day` 로 직접 찍는다(deps.perfMark).
  { const _t0 = Date.now(); SimVillages.onGameTick(now); const _d = Date.now() - _t0; if (_d >= 5) perfMark('econ_frame', _d); }
  // §11 도적 일일 훅 — villages 옆(econ 틱이 world.day를 민 직후 같은 경계에서 데일리 1회). 평시 O(1) 정수 비교.
  Bandits.onGameTick(now);
  // §16 답압 길 — 게임일 경계 dirty 플러시·coarse 재구축·클라 변경분(평시 O(1) 비교)
  Roads.onGameTick(now);
  Soil.onGameTick(now);   // [배치 20 B] 토양치 게임일 1회 플러시 + tile_state 변경분 방송

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
  roomsFlush();   // ★[배치 18 ①] 방 재판정은 **인덱스가 최신이 된 뒤**에(위 스테일 인덱스 주석 참조)

  // 입력 타임아웃 — 2.5초 동안 입력 없으면 정지
  // 14.46-b-smooth: 1000 → 2500. 평지에서 짧은 네트워크 hiccup으로 server가 멈췄다가 클라 예측이 앞서면
  // 다음 snapshot으로 사용자가 뒤로 밀려나는 느낌 받음. 2.5초로 늘려서 잠깐 끊겨도 server는 계속 이동.
  for (const p of players.values()) {
    if (p.handingOff) continue;
    if (p.isNpc) continue;  // NPC는 입력 타임아웃 무관 (npcStep이 vx/vy 관리) — 600명 순회 절약
    // 입력 큐 적용은 아래 '입력 큐 구동' 루프(입력 1개=1스텝)에서. 여기선 끊김 감지만.
    if (now - p.lastSeen > 2500) { p.vx = 0; p.vy = 0; if (p.inputQueue) p.inputQueue.length = 0; }
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
      // ★[작물 층] 작물 농지는 **볼 때** 판정한다(lazy · 게임일) — 이 틱은 종전 베리 농지 전용이다.
      if (b.type === 'farmland' && b.data && !b.data.crop && !b.data.ready && now >= b.data.readyAt) b.data.ready = true;
    }
  }

  // Phase 5-I: 화살 물리/히트 + 만료된 ghost 정리
  stepArrows(dt);
  { const now2 = Date.now();
    for (const [gid, g] of ghostPlayers) if (now2 - g.recvAt > GHOST_TTL_MS) ghostPlayers.delete(gid);
    for (const [bid, g] of ghostBuildings) if (now2 - g.recvAt > GHOST_TTL_MS) ghostBuildings.delete(bid);
  }

  // 이동 1스텝 — 입력 1개 = 1스텝 (클라 predictStep과 1:1 일치). 호출측이 handingOff/dormant 판정.
  //   moveDt 는 tick 클로저에서 캡처. 핸드오프 발생 시 내부에서 p.handingOff=true 세팅.
  function movePlayerStep(p) {
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
      return; // 이 스텝은 일반 이동 skip — 밀려나는 중
    }
    // 14.53-j: 계단 위(onStairId 있음)면 dir 축으로만 이동 허용 — 옆으로 빠져나가는 버그 차단
    let stepVx = p.vx, stepVy = p.vy;
    // §16 답압 길: NPC 보행 배속 ×1.10/1.15(셀 변경 시 캐시 p._rdMul — 스탬프가 갱신). ★플레이어 제외(의도적 차이):
    //   클라 이동 예측이 길 배속을 모름 → 서버만 빨리 가면 리컨실리에이션 러버밴딩. 랩은 전 개체 — 본체 클라 예측 제약.
    if (p.isNpc && p._rdMul && p._rdMul !== 1) { stepVx *= p._rdMul; stepVy *= p._rdMul; }
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
    // ★★[이동 모델 2026-08-30] 스피드핵 경계 — 한 스텝의 위치 델타 상한.
    //   상한 = **모델이 허용하는 최대**(가속 포함: 가속 모델도 최고속이 상한이다) + 여유 25%.
    //   플레이어만 — NPC 는 답압 길 배속(_rdMul)·도주 2.5배 등 다른 예산으로 산다.
    //   legacy 에선 걸릴 수가 없다(64×2.5×dt = 5.33px < 상한 6.67px) ⇒ 회귀 무영향.
    if (!p.isNpc) {
      const _cap = MoveModel.maxStepPx(MOVE_PARAMS, moveDt, 1) * 1.25;
      const _mag = Math.hypot(stepVx * moveDt, stepVy * moveDt);
      if (_mag > _cap) { const _k = _cap / _mag; stepVx *= _k; stepVy *= _k; }
    }
    let nx = p.x + stepVx * moveDt;
    let ny = p.y + stepVy * moveDt;

    // PZ식 edge 콜라이더 — 각 축 별로 따로 처리해서 slide 가능. player floor만.
    const pf = p.floor || 0;
    const trace = p.isNpc ? null : p.name; // player만 trace, NPC는 spam 방지
    if (isBlockedByWall(nx, p.y, p.x, p.y, pf, trace)) nx = p.x;
    if (isBlockedByWall(p.x, ny, p.x, p.y, pf, trace)) ny = p.y;
    if (isBlockedByWall(nx, ny, p.x, p.y, pf, trace)) { nx = p.x; ny = p.y; }
    // Phase 5-8: tree(+★rock/ore) 입체 콜라이더 (1층만, 위층은 통과)
    //   ★탈출 밸브: 현재 위치가 이미 콜라이더 안이면(스폰·핸드오프·자원 리스폰이 몸 위에 겹친 경우) 차단을 풀어 걸어나올 수 있게
    //   — isTerrainBlockedLocal의 !현재위치 가드와 동일 패턴. 클라 predictStep 미러 동일.
    if (pf === 0 && !isBlockedByTree(p.x, p.y)) {
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
    // Phase 5-K2: 히스테리시스 핸드오프 — 시간 쿨다운 대신 "겹침 띠" 방식.
    //   maxOut <= 0           : zone 안 — 그냥 이동.
    //   0 < maxOut <= COMMIT  : 경계를 살짝 넘었지만 아직 이 zone 소유 (겹침 띠). 클램프 X, 자유 이동.
    //   maxOut > COMMIT       : 이웃으로 확실히 진입 → 핸드오프 (도착은 경계에서 그만큼 안쪽).
    // 이래야 경계에서 왔다갔다 해도 양쪽 COMMIT px 띠 안에선 핸드오프가 안 일어나 핑퐁/렉이 없다.
    if (maxOut <= 0) {
      p.x = nx; p.y = ny;
      Roads.stampEntityPx(p, p.x, p.y);   // §16 답압(전 개체 — NPC·플레이어. 셀 변경 시만·비활성=no-op)
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
  } // ← movePlayerStep 함수 끝

  // === 입력 큐 구동 — 사람: 입력 1개=1스텝(밀린 만큼 따라잡기), NPC: 틱당 1스텝 ===
  //   클라가 보낸 입력을 받은 순서대로 그대로 재생 → 서버 위치(seq=k) = 클라 예측(seq=k) → 리컨실리에이션 보정 0.
  //   빈 틱(입력 없음)엔 안 움직여 '유령 이동' 제거. GC로 밀린 입력은 틱당 최대 8개까지 흡수(catch-up).
  for (const p of players.values()) {
    if (p.handingOff) continue;
    if (p.isNpc) {
      if (p.simCaravan) continue; // §4-4 Stage 4B: 캐러밴 실체 NPC — 이동은 villages.js 페이싱(경로 보간+벽 판정)이 전담(이중 이동 방지)
      if (p.simWar) continue;     // §4-4 P3: 출정(징발) 병사 — 이동은 villages.js 실체 전쟁(행군 대형 페이싱·전투유닛 미러)이 전담(이중 이동 방지)
      if (!p.canadiaVillage && !isPositionActive(p.x, p.y)) continue; // dormant NPC skip
      movePlayerStep(p);
    } else {
      let consumed = 0;
      while (p.inputQueue && p.inputQueue.length && consumed < 8) {
        const inp = p.inputQueue.shift();
        // ★★[신체 3층 재배선 2026-08-30 재민 확정] **달릴 수 있는지는 스태미나가 정한다.**
        //   종전엔 허기·갈증이 5 아래면 못 뛰었다 — 배고픔이 다리를 묶는 이중 벌이었다.
        //   이제 허기·갈증은 **스태미나 회복 속도**에만 관여한다("배고파도 뛸 수는 있는데
        //   숨 고르기가 안 된다"). 관문 판정의 정본은 `Body.canSprint` 하나다(사본 금지).
        p.sprint = inp.sprint && Body.canSprint(p);
        // (옛 `spMult` 지역변수 제거 — 달리기 배율은 이제 공유 모듈이 `SPRINT_MULT` 로 곱한다)
        // ★★[신체 상태] 몸 상태가 걸음을 늦춘다. **이 값은 반드시 클라에도 같은 수로 가야 한다** —
        //   클라 예측(`predictStep` 의 speed)과 어긋나면 매 틱 보정이 나서 **러버밴딩**이 된다.
        //   그래서 `gauges.body.moveMult` 로 실어 보내고 클라가 같은 배율을 쓴다(호환: 안 오면 1).
        //   ★★[무게 배치] 여기에 **과적**이 곱해진다. 곱 폭주는 `Carry.combinedMove` 가 바닥에서 자른다
        //     (신체 0.6 × 과적 0.4 = 0.24 → 0.35). 이 합산값도 그대로 클라에 실어 보낸다.
        const bodyMult = moveMultOf(p);
        // ★★[이동 모델 2026-08-30] 적분은 **공유 모듈 한 곳**이다(`public/move-model.js`).
        //   클라 `predictStep` 이 같은 함수를 같은 인자로 부른다 — 두 벌이면 보정이 매 틱 싸운다.
        //   legacy 모드의 이 두 줄은 옛 식과 **글자 그대로 같다**(비트 동일 — `test-move` ④ 가 못 박는다).
        const _mv = MoveModel.stepMove(
          { vx: p.vx, vy: p.vy },
          { wx: inp.vx, wy: inp.vy, sprint: p.sprint, bodyMult: bodyMult, aim: !!inp.aim },
          moveDt, MOVE_PARAMS);
        p.vx = _mv.vx; p.vy = _mv.vy;
        p.lastInputSeq = inp.seq;
        movePlayerStep(p);
        consumed++;
        if (p.handingOff) break; // 핸드오프 발생 → 이 zone에선 더 안 움직임
      }
      // 입력 없는 틱 — 정지 (유령 이동 방지).
      //   ★accel 에선 속도를 **지우지 않는다**: 속도가 상태이므로 지우면 클라 예측과 갈라진다.
      //     어차피 움직이지도 않는다(movePlayerStep 을 안 부른다) — 다음 입력이 오면 이어서 감속한다.
      if (consumed === 0 && MOVE_PARAMS.model !== 'accel') { p.vx = 0; p.vy = 0; }
    }
  }
  sepNpcs(dt);   // ★[생활 층 ①] NPC 상호 분리 — 이동 적용 직후(같은 틱 위치에 보정) 틱당 1회

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
    // ★NPC 전면 면제(랩 100% 동형 — 사용자 확정): 랩 NPC에는 개체 허기·갈증이 없다 — 식량은 econ 소유(기근=econ 인구감소가
    //   유일한 식량 사망 경로). 기존엔 canadia만 면제라 활성 청크의 마을 NPC가 게이지 드레인→기아 hp 드레인을 맞았고,
    //   이것이 '관측할수록 마을이 굶는' 임업3 요양 사태(24/24 hp<60%)의 원인이었다. 도적·캐러밴·병사도 랩에 개체 허기 없음.
    if (p.isNpc) { p.hunger = HUNGER_MAX; p.thirst = THIRST_MAX; continue; }
    // ★★[신체 상태 §7 · 2026-08-26] 여기 있던 허기·갈증·밤추위 계산을 **`server/body.js` 로 옮겼다.**
    //   종전엔 감쇠는 여기, 추위는 여기 안 지역변수(`p._cold`), 효과는 여기저기 흩어져 있었다.
    //   축이 다섯이 되면 그 흩어짐이 곧 사고다 ⇒ **정본 하나**로 모은다. 여기 남는 건 **맥락 수집**뿐이다.
    //   ⚠오프라인 감쇠 없음은 그대로다 — 이 루프가 `players`(접속자)만 돌고,
    //     `Body.tick` 은 **넘겨 준 dt 만** 적분한다(따라잡기 코드가 없다 · `test-body ①`).
    const moving = Math.hypot(p.vx || 0, p.vy || 0) > 1;
    const clothes = getEquippedEquipment(p, 'clothes');
    const warmth = (clothes && clothes.attrs && clothes.attrs.warmth) || 0;
    const _night = bodyNight(now), _fire = isNearCampfire(p), _indoor = isIndoorAt(p);
    // ★[3층 재배선] 짐 적재율을 넘긴다 — 스태미나 소모가 무게에 가중된다.
    //   정본은 `Carry.effects(p).ratio` 하나다(무게를 여기서 다시 세지 않는다).
    let _cr = 0; try { _cr = Carry.effects(p).ratio || 0; } catch (e) {}
    // ★★[온도 곡선 2026-08-31] `day` 를 넘긴다 ⇒ `coldTarget` 이 **연중 연속 곡선**을 쓴다.
    //   `seasonCold` 는 그대로 같이 넘긴다 — `day` 가 없는 호출부를 위한 **폴백 계약**이라
    //   여기선 안 쓰이지만, 계약이 살아 있다는 걸 호출부가 보여 주는 편이 낫다.
    //   ★[겨울 난이도] 마을 완충은 여기서만 계산한다(사본 금지 — `SimVillages.shelterAt` 이 정본).
    // ★[바람 노출 2026-09-01] 완충을 한 번만 재고 노출에 **그대로 넘긴다** — 두 번 재면 두 값이 갈린다.
    const _day = gameDayNow();
    const _sh = villageShelterOf(p, now);
    Body.tick(p, dt, { day: _day, elevKm: elevKmAt(p), night: _night, nearFire: _fire, indoor: _indoor, warmth,
                       villageShelter: _sh, windExposure: windExposureOf(p, now, _day, _sh),
                       seasonCold: seasonColdNow(), moving, sprint: p.sprint, carryRatio: _cr, now });
    // ★★★[캐논 변경 2026-09-01 · T44] 극단이면 HP 가 천천히 깎인다("아사 폐지" 폐기).
    //   `Body` 가 **비율**을 내고 쌓아 두면, 여기서 1 HP 이상 쌓였을 때 **정본 피해 경로**로 낸다.
    //   ⇒ HP 0 → 쓰러짐(downed) 사슬이 공짜로 따라오고, 사망 로그에 원인이 남는다.
    //   ⚠부상은 안 생긴다 — `BODY_INJURY_DMG`(12) 문턱보다 한참 작은 1~2 HP 라서.
    //   ⚠마을 안이라고 면제하지 않는다(§12: 마을의 불사는 **쓰러진 뒤** 옮겨 준다는 뜻이다).
    //     다만 추위는 마을 완충(0.65)이 평형을 3단계 아래로 내려 **자연히 0** 이 된다 —
    //     새 예외를 만들 필요가 없다. 이미 있는 안전망이 그 일을 한다.
    {
      const _hpDmg = Body.takeHpDamage(p);
      if (_hpDmg > 0) {
        const _why = Body.extremeHpRate(p).parts.map((x) => x.axis).join('+') || 'extreme';
        damagePlayer(p, _hpDmg, `extreme:${_why}`);
      }
    }
    p._cold = Body.ensure(p).cold > 0.05;
    // 옷은 추위를 막는 동안 닳는다(종전 규약 유지 — 옷감 수요의 실체)
    if (p._cold && clothes && !_fire && !_indoor && now - (p._coldWearAt || 0) > COLD_CLOTH_WEAR_MS) {
      p._coldWearAt = now; wearEquipment(p, 'clothes', 1);
    }
    // ★★[T12 지게 2026-09-01] 지게는 **짐을 지고 걸을 때** 닳는다. 서 있으면·빈 몸이면 안 닳는다.
    //   판정은 `Carry.carrierWorking` 정본 하나가 한다(여기서 무게를 다시 세지 않는다 — `_cr` 과 같은 규약).
    //   ⚠새 틱이 아니다: 이 루프는 이미 돌고 있고 한 줄이 얹힌 것뿐이다(틱 0 캐논 유지).
    if (moving && now - (p._carrierWearAt || 0) > CARRIER_WEAR_MS && Carry.carrierWorking(p)) {
      p._carrierWearAt = now; wearEquipment(p, Carry.CARRIER_SLOT, 1);
    }
    // ★[3층 재배선] 스태미나가 바닥나면 자동 해제 — 판정은 `Body.canSprint` 하나가 한다.
    //   (옛 허기·갈증 하한 게이트는 여기서 사라졌다. `SPRINT_MIN_GAUGE` 도 같이 죽였다.)
    if (p.sprint && !Body.canSprint(p)) p.sprint = false;
    // vp 시간당 감소
    if ((p.vp ?? 0) > 0) p.vp = Math.max(0, p.vp - VP_DECAY_PER_SEC * dt);
    // ★아사(기아 hp 드레인) 제거 — 사용자 확정: 식량 사망은 econ 기근 인구감소가 유일, 별도 아사 기능은 중복이라 폐지.
    //   기갈 0/0은 디버프만: 달리기 불가(위 sprint 게이트)·자연 회복 정지(아래 회복 루프 게이지 조건)·클라 지침/시야 축소.
  }

  // === HP 회복 (out-of-combat 1초 후) — 단 hunger/thirst 모두 0이상일 때만 ===
  for (const p of players.values()) {
    if (p.isNpc && !p.canadiaVillage && !isPositionActive(p.x, p.y)) continue;  // dormant NPC HP회복 스킵
    // ★마을 NPC = 랩 일일 회복만(villages.js _lifeDaily: 요양18·근무6/일 ×건강·행복·식량 — 랩 7585 verbatim).
    //   초당 회복은 랩에 없음: 부상=수일 노동손실이 요양·약재 수요의 실체라 초당 10hp면 그 경제가 통째로 사라진다.
    if (p.isNpc && p.simVillageId != null) continue;
    if (p.hp > 0 && p.hp < p.maxHp && now - p.lastDamagedAt > 1000) {
      // ★★[신체 3층 재배선] 하드 게이트(허기>10 && 갈증>10)를 **회복 배율**로 바꾼다.
      //   종전엔 10 을 경계로 회복이 **뚝 끊겼다**(§8.3 "속은 연속" 위반 · 절벽).
      //   이제 결핍이 깊어질수록 **천천히** 아물고, 극단(0)에서 정확히 멈춘다.
      //   ★★[캐논 변경 2026-09-01 · T44] **무너지는 중엔 아물지 않는다.**
      //     종전 주석은 "HP 를 깎지는 않는다(아사 폐지 캐논)"였다 — 그 캐논은 폐기됐다.
      //     그리고 추위 극단은 **허기가 멀쩡해도** 온다: 그때 `recoverMult` 는 1 에 가까워
      //     자연 회복(초당 ~10HP)이 극단 감소(초당 0.28HP)를 **가볍게 덮어써** 얼어 죽지 않는다.
      //     ⇒ 극단 감소가 걸린 동안은 자연 회복을 멈춘다. 회복 식은 그대로 두고 **게이트만** 얹는다.
      const _rm = p.isNpc ? 1 : Body.recoverMult(p);
      const _extreme = p.isNpc ? 0 : Body.extremeHpRate(p).rate;
      if (_rm > 0 && _extreme <= 0) p.hp = Math.min(p.maxHp, p.hp + 2 * dt * 5 * _rm); // 만복 기준 초당 ~10hp
    }
  }

  // === 게이지 변화 주기 broadcast (1초 간격, self에만) ===
  for (const p of players.values()) {
    if (p.isNpc) continue;  // NPC는 클라(ws) 없음 — 게이지 전송 불필요. 600명 순회·메시지 생성 절약
    if (!p._lastGaugeSentAt || now - p._lastGaugeSentAt > 1000) {
      p._lastGaugeSentAt = now;
      // ★★[무게 배치] 로트·개체 장부를 인벤과 맞춘다(초당 1회).
      //   왜 여기서 쓸어 담나: 아이템이 늘어나는 경로는 채집·요리·납품보상·거래·바닥줍기·픽스처로 흩어져 있다.
      //   **하나하나에 `note` 를 심는 대신** 인벤을 정본으로 두고 `reconcile` 이 차이를 메운다 —
      //   남은 몫은 "오늘 얻은 것"이 되는데, 취득 직후 1초 안에 도는 이 쓸개가 그걸 **사실로** 만든다.
      //   (경로 하나를 빠뜨려도 수량이 틀리는 일은 구조적으로 없다 — 나이만 오늘로 잡힌다.)
      try {
        const _today = zoneGameDay();
        for (const it of Object.keys(p.inventory || {})) if (Lots.isLot(it)) Lots.reconcile(p, it, p.inventory, _today);
        Carry.reconcile(p, p.inventory);
      } catch (e) {}
      send(p.ws, {
        type: 'gauges',
        // ★★[T61 2026-09-03] **HP 를 여기 싣는다 — 실측이 시킨 한 줄이다.**
        //   §0-ⓐ 가 물은 것: "아묾을 서버 칸 없이 클라가 알 수 있나?" 답은 **아니다**, 그리고 이유가 나쁘다:
        //   클라의 `myHp` 는 `welcome` · `player_damaged` · `player_respawn` 에서만 갱신된다.
        //   **자연 회복은 아무 메시지도 안 낸다** ⇒ 40에서 100까지 아물어도 화면은 계속 `40/100` 이다.
        //   "회복이 화면에 안 실린다"는 표식이 없다는 뜻이 아니라 **숫자 자체가 낡았다**는 뜻이었다.
        //   ⇒ 이미 초당 하나 나가는 이 메시지에 두 수를 얹는다(새 창구 0 · 방송 아님 · self 전용).
        hp: Math.round(p.hp), maxHp: p.maxHp,
        hunger: Math.round(p.hunger ?? HUNGER_MAX),
        thirst: Math.round(p.thirst ?? THIRST_MAX),
        vp: Math.round(p.vp ?? 0),
        cold: !!p._cold,  // 밤 추위(방한 부족) — 클라 표시(구 필드 · 호환 유지)
        // ★[§8.3] **본인에겐 연속값**. 남에겐 단계만 나간다(`Body.peerPayload` — 소비자는 외형 배치에서).
        body: Body.selfPayload(p),
        // ★[온도 곡선 2026-08-31] 바깥 날씨 + 마을 완충 — HUD 배지의 유일한 원천(클라 사본 금지)
        weather: weatherFor(p, now),
        // ★[무게 배치] 소지 무게·용량·과적 배율. **클라 예측이 같은 수를 써야** 러버밴딩이 안 난다 —
        //   그래서 `combined`(신체×과적, 바닥 적용)를 실어 보내고 클라는 그걸 쓴다.
        carry: Object.assign(Carry.payload(p), { combined: moveMultOf(p) }),
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
    // §4-4 wildlife: 이동·AI는 wildlife.js(랩 updateMobs)가 전담 — 레거시 배회/어그로 미적용
    if (m.isWild) continue;
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
          //   ★ENABLE_WILDLIFE=0 이면 **몹은 플레이어를 때리지 못한다**(DB 에서 로드된 개체까지 포함 —
          //     스폰만 막으면 옛 DB 를 쓰는 하네스에서 그대로 물린다).
          if (HOSTILES_ON && sameFloor && realDist < 50 && now - m.lastAttackAt > 1000) {
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

  // §4-4 동물 AI 블록(마을실험실 이식) — 활성 청크 뷰의 야생 5종. dt=1/TICK_HZ 유닛/틱(=1유닛/초, 환산 계수 1).
  //   ENABLE_WILDLIFE=0 → no-op. 오류는 존 틱을 죽이지 않게 격리(최초 5회만 로그).
  try { Wildlife.tick(now); } catch (e) { global._wlErr = (global._wlErr || 0) + 1; if (global._wlErr <= 5) console.error(`[${ZONE_ID}] wildlife tick 오류#${global._wlErr}:`, e); }

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
      // §4-4 P3: 실체 전쟁 병사 전투 메타 — 매틱 br(궤주 비트, 위치·hp는 위에 이미 포함), 최초가시분만 bt(병종 int)·bs(진영 0/1)·bc(지휘관 비트).
      //   villages.js 실체 전쟁(행군 대형·전투유닛 미러)이 o._muster/_bt/_bside/_bcmd/_brout 세팅. 기존 메타 패턴(최초=정적·매틱=동적) 준수.
      if (o._muster) { e.br = o._brout ? 1 : 0; if (isNew) { e.bt = o._bt | 0; e.bs = o._bside | 0; e.bc = o._bcmd ? 1 : 0; } }
      // §18 3파: 포로 표식(회색 테두리·밧줄) — 동적 1비트(호송 전환·해제가 일중 일어남: br 패턴)
      if (o.simCaptive) e.cap = 1;
      // §4-4 Stage 4A: simJob(마을 시뮬 NPC 직업 — npcJob과 별개)도 메타로 1회. 일중 변경분은 sim_village_day 브로드캐스트가 갱신.
      if (isNew) { e.name = o.name; e.color = o.color; e.maxHp = o.maxHp; e.tribeName = o.tribeName || null; if (o.simJob) e.simJob = o.simJob;
        // ★[캐릭 시트 2026-08-30] **신원 1비트**(애니 상태가 아니다 — 애니는 기존 값에서 유도한다).
        //   이게 없으면 클라가 NPC 와 사람 플레이어를 못 가른다(`simJob` 은 마을 시뮬 NPC 에만 있다).
        //   ⇒ 사람 시트가 마을 주민에게까지 입혀진다 = **회부된 별도 배치를 몰래 하는 것**이다. 그래서 실어 보낸다.
        if (o.isNpc) e.npc = 1; }
      // ★[액션 라벨 가시화 — 생활 층 100%] 행동 라벨(모내기·잠행·개간·건축·취침…): 변경 후 1.2s 윈도우 + 최초가시에만
      //   문자열 전송(무상태 델타 — 뷰어별 추적 없이 25틱 중복이 상한). 클라는 수신 시 갱신·미수신 시 유지. ''=라벨 제거.
      if (o._lifeAct !== undefined && (isNew || now - (o._lifeActAt || 0) < 1200)) e.act = o._lifeAct;
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
      // ★★[이동 모델 2026-08-30] **보정은 위치+속도 한 쌍이다.** 가속 모델에서 속도는 상태다 —
      //   위치만 스냅하면 스냅 직후 두 적분 곡선이 다시 벌어져 보정이 영원히 반복된다.
      //   legacy 에선 속도가 입력의 함수라 상태가 없다 ⇒ 안 보낸다(페이로드 바이트 동일).
      ...(MOVE_PARAMS.model === 'accel' ? { selfVx: p.vx || 0, selfVy: p.vy || 0 } : {}),
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
  // ★★[2026-08-26] 주기 저장 — 위 SAVE_INTERVAL_MS 주석 참조.
  //   비용: 저장 1건 = central HTTP 1회(fire-and-forget). 틱당 **한 명만** 처리해 스파이크를 없앤다
  //   (자정 DB 드레인과 같은 결 — villages.js saveQueue 선례).
  _fishPoll(now);
  { const _t0 = Date.now(); _periodicSave(now); const _d = Date.now() - _t0; if (_d >= 5) perfMark('save', _d); }
  // ★[RTT 상관 계측] 틱 전체가 예산(33ms)을 넘긴 순간도 남긴다 — 원인이 위 둘이 아닐 수도 있다.
  // ★★[T43] 쓰러짐 사슬 — 업고 걷기 · 붙들기 진행 · 창 소진 · 깨어남(내부에서 1초에 한 번만 돈다).
  tickDowned(now);
  { const _tot = Date.now() - now; if (_tot >= 33) perfMark('tick', _tot); }
  { const _td = Date.now() - now; global._tt = (global._tt||0)+_td; global._tn = (global._tn||0)+1; if (_td > (global._tmx||0)) global._tmx = _td; }
}, TICK_MS);

// ★[낚시 v2] 입질·만료 폴링 — 찌가 흔들리는 순간과, 창을 그냥 지나친 순간을 서버가 알린다.
//   왜 틱에 얹나: `setTimeout` 을 사람마다 걸면 재접속·승계·크래시에서 타이머가 새고,
//   **서버 시각이 정본**이라는 규약도 흐려진다. 틱은 이미 돌고 있고 값이 싸다(사람 수만큼의 비교).
const _fishStats2 = { bites: 0, expired: 0 };
function _fishPoll(now) {
  for (const [, p] of players) {
    const f = p._fish;
    if (!f || f.state !== 'wait') continue;
    if (!f.bit && now >= f.biteAt) {
      f.bit = true; _fishStats2.bites++;
      // ★손맛 — 찌가 흔들린다. 클라가 이 상태로 찌 애니메이션을 바꾼다(HUD 아니라 세계 안).
      send(p.ws, { type: 'fish_state', state: 'bite', x: f.x, y: f.y, windowMs: f.windowMs, biteAt: f.biteAt, srvNow: now });
    }
    if (f.bit && now - f.biteAt > f.windowMs + Fishing.CFG.WIN_LAT_MS) {
      const st = _fishStats(p);
      st.missed++;
      if (f.kg > st.maxMissedKg) st.maxMissedKg = +f.kg.toFixed(2);
      const big = f.kg >= Fishing.CFG.BIG_KG;
      p._fish = null; _fishStats2.expired++;
      send(p.ws, { type: 'fish_state', state: 'idle' });
      send(p.ws, { type: 'notice', text: big
        ? `🎣 놓쳤다 — **묵직한 놈**이었다(${f.kg.toFixed(1)}kg). 물결만 남았다`
        : '🎣 놓쳤다 — 미끼만 따 먹혔다' });
      savePlayer(p);
    }
  }
}

// 주기 저장 — 틱당 최대 1명(분산). 대상: 살아 있는 세션 · 영속 신원 · **실제로 움직인** 사람.
let _saveCursor = 0;
const _saveStats = { saved: 0, skippedClean: 0, skippedSuperseded: 0, ms: 0 };
function _periodicSave(now) {
  if (!players.size) return;
  const arr = players; let n = 0;
  for (const [, p] of arr) {
    if (n++ < _saveCursor) continue;
    _saveCursor = n;
    if (p.isNpc) continue;
    // ★밀려난 세션은 저장하지 않는다(B-6). 몸은 새 세션이 물려받았다.
    if (p._supersededBy) { _saveStats.skippedSuperseded++; continue; }
    if (!p._nextSaveAt) { // 첫 배정 — 사람마다 흩어 둔다(같은 순간에 몰리지 않게)
      p._nextSaveAt = now + Math.floor(Math.random() * SAVE_INTERVAL_MS);
      p._savedX = p.x; p._savedY = p.y; p._savedBody = Body.snapshot(p);
      continue;
    }
    if (now < p._nextSaveAt) continue;
    p._nextSaveAt = now + SAVE_INTERVAL_MS;
    // ★[신체 상태 §7] 판정에 **몸 상태 변화**를 더한다. 종전엔 '움직였나'만 봤는데,
    //   그러면 **가만히 앉아 회복한 사람**의 상태가 크래시에 통째로 날아간다(주기 저장의 뜻이 반쪽이 된다).
    const _moved = !(Math.abs(p.x - (p._savedX || 0)) < SAVE_MOVE_EPS && Math.abs(p.y - (p._savedY || 0)) < SAVE_MOVE_EPS);
    const _bodyDirty = Body.dirtySince(p, p._savedBody);
    if (!_moved && !_bodyDirty) {
      _saveStats.skippedClean++; return;   // 안 움직이고 몸도 그대로면 쓸 게 없다
    }
    const t0 = Date.now();
    savePlayer(p, { last_zone: ZONE_ID, last_x: p.x, last_y: p.y });
    p._savedX = p.x; p._savedY = p.y; p._savedBody = Body.snapshot(p);
    _saveStats.saved++; _saveStats.ms += Date.now() - t0;
    return;   // ★틱당 한 명 — 스파이크 금지
  }
  _saveCursor = 0;   // 한 바퀴 돌았다
}

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
  // ★★[T47] **저장을 기다린다.** 종전엔 fire-and-forget 이라 도착 존이 central 을 읽을 때
  //   아직 안 써져 있을 수 있었다. 이제 행과 페이로드가 **같은 스냅샷**이 되도록 순서를 잡는다.
  try { await savePlayer(player, { last_zone: targetZoneId, last_x: newX, last_y: newY }); }
  catch (e) { console.warn(`[${ZONE_ID}] 핸드오프 직전 저장 실패(페이로드로 계속):`, e.message); }
  const token = generateToken();
  try {
    await postJSON(target.host, target.port, '/handoff_prepare', {
      token,
      source_zone: ZONE_ID,
      player_id: player.playerId,
      // ★[2026-08-03g 배치 14 ②] 이 신원이 영속인가 — 존을 넘어도 몸이 저장돼야 한다.
      //   `anon_` 접두사만으로는 영속 게스트와 1회용 폴백을 못 가르므로 **명시적으로** 실어 보낸다.
      persistent: !!player.persistent,
      name: player.name,
      color: player.color,
      x: newX, y: newY,
      vx: carryVx, vy: carryVy,   // ★ 핸드오프 시점의 속도 보존
      inventory: invPayload(player.inventory),
      // ★★[T47] **몸 전체**를 싣는다 — 도구·장비·슬롯·숙련·제작이력·원석장부·어획·신체·kg원장·로트·생명값.
      //   직렬화는 `serializeBody` 하나이므로 앞으로 몸에 필드가 늘어도 여기가 저절로 따라간다.
      body: E2E_HANDOFF_NO_BODY ? undefined : serializeBody(player),
      tools: player.tools,          // 옛 호환(사용 X) — 옛 도착 존이 이걸 읽던 자리라 남겨 둔다
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
    // ★시대 — 클라 건축 메뉴가 "이 세상에 **알려진** 노"만 노출하려고 쓴다. era.js 가 유일한 진실이고
    //   클라는 표를 갖지 않는다(사본 금지). 청동기엔 furnaces=['crucible'] 하나뿐이라 괴련로는
    //   메뉴에 아예 안 뜬다 — era.js §"지식 축은 순수 플레이어 지식" 과 정합(있다는 것조차 안 알려준다).
    era: (() => { try { const E = require('./era'); const e = E.currentEra();
      return { id: e, furnaces: Object.keys(FURNACE_KINDS).filter(k => E.hasTech(k)).map(k => ({ k, ko: FURNACE_KINDS[k].ko })) };
    } catch (e) { return { id: 'bronze', furnaces: [{ k: 'crucible', ko: '도가니로' }] }; } })(),
  };
}

server.listen(PORT, () => {
  console.log(`[${ZONE_ID}] 🌏 zone server up on :${PORT}  latency=${LATENCY_MS}ms (RTT≈${LATENCY_MS*2}ms)  [netcode=K19 입력1개=1스텝]`);
  console.log(`        biome=${ZONE.biome}  rect=(${ZONE.worldOffsetX},${ZONE.worldOffsetY},${ZONE.zoneWidth}x${ZONE.zoneHeight})  neighbors=W:${NEIGHBOR.hasWest?'✓':'∅'} E:${NEIGHBOR.hasEast?'✓':'∅'} N:${NEIGHBOR.hasNorth?'✓':'∅'} S:${NEIGHBOR.hasSouth?'✓':'∅'}`);
});

// ★★[접속 진단 배치 2026-08-30] **조용히 죽지 않는다.**
//   종전엔 프로세스 차원 핸들러가 **하나도 없었다** — `async` 연결 핸들러가 던지면
//   Node 기본값(unhandled-rejections=throw)이 프로세스를 죽이는데, 로그에 쓸 만한 게 안 남았다.
//   ⇒ 동작(죽는다)은 그대로 두고 **스택만 확실히 남긴다**. 마스킹은 토큰 규약 그대로.
const _mask = (s) => String(s).replace(/guest_token=[0-9a-f]+/gi, 'guest_token=***')
                              .replace(/password=[^&\s]+/gi, 'password=***');
process.on('unhandledRejection', (e) => {
  console.error(`[${ZONE_ID}] ✗✗ unhandledRejection: ${_mask((e && e.message) || e)}\n${_mask((e && e.stack) || '')}`);
  process.exit(1);   // ★기본 동작 유지 — 여기서 삼키면 반쯤 죽은 서버가 남는다(더 나쁘다)
});
process.on('uncaughtException', (e) => {
  console.error(`[${ZONE_ID}] ✗✗ uncaughtException: ${_mask((e && e.message) || e)}\n${_mask((e && e.stack) || '')}`);
  process.exit(1);
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
      if (!canPersist(p)) continue;   // ★[배치 14 ②] 종료 flush 도 정본 술어 — 영속 게스트를 빠뜨리지 않는다
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

// Phase 5-econ-game-2: 농지 = 농부가 심어야 자람 (시간성장). 안 심은 셀은 fallow(0).
//   farmStage: 0빈 → 1씨 → 2자람 → 3익음. 농부가 sow(0→1), 시간이 1→2→3, 농부가 harvest(3→0).
const FARM_GROW_MS = 90000;          // 90초에 익음 (농부 왕복 ~2회)
function pickFarmCellForVillage(village, pid) {
  const cells = [];
  for (const c of claims.values()) if (c.facilityType === 'farmland' && c.guildTribeName === village) cells.push(c);
  if (!cells.length) return null;
  let h = 0; for (let i = 0; i < (pid || '').length; i++) h = (h * 31 + pid.charCodeAt(i)) | 0;  // pid 해시로 농부 분산 배정
  return cells[Math.abs(h) % cells.length];
}
function tickFarmlandStages() {
  const now = Date.now();
  for (const c of claims.values()) {
    if (c.facilityType !== 'farmland') continue;
    if (!c.sownAt) { if (c.farmStage) { c.farmStage = 0; broadcast({ type: 'claim_updated', claim: c }); } continue; } // 안 심음 = fallow
    const elapsed = now - c.sownAt;
    const stage = elapsed >= FARM_GROW_MS ? 3 : (elapsed >= FARM_GROW_MS * 0.5 ? 2 : 1);
    if (stage !== c.farmStage) { c.farmStage = stage; broadcast({ type: 'claim_updated', claim: c }); }
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
      if (facilityType === 'farmland') claim.farmStage = 0; // fallow — 농부가 심어야 자람(econ-game-2)
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
  // ★[재민 확정] NPC 작업장 배정도 **자잘 광맥을 못 본다**(o.minor) — 자잘은 플레이어 전용이다.
  if (kind === 'ore') { list = (t.ores || []).filter(c => !c.minor); getCenter = c => c.center; }
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
  // 농부 — 자기 영토 farmland 셀을 고정 배정 → 거기서 씨뿌리고 수확 (econ-game-2)
  if (job === 'farmer') {
    let claim = npc.farmClaimId ? claims.get(npc.farmClaimId) : null;
    if (!claim || claim.facilityType !== 'farmland') {
      claim = pickFarmCellForVillage(npc.canadiaVillage, npc.pid);
      npc.farmClaimId = claim ? claim.id : null;
    }
    if (claim) { npc.canadiaWorkX = claim.x + BUILDING_SIZE / 2; npc.canadiaWorkY = claim.y + BUILDING_SIZE / 2; return; }
  }
  // cook/smith/warrior/merchant (또는 farmland 없는 농부) — 마을 안에서 작업 (집·광장)
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

// Phase 5-econ-game-2: 작업 1세션 완료 시 직업별 '실제' 산출 → 마을 _realYield 버퍼.
//   어부: 물가(canadiaWorkX/Y=water cluster)에서 낚시 → 물고기. 농부: 후속(영토 farmland 셀 sow/harvest).
//   그 외 직업은 추상 JOB_YIELD(60초 생산틱)가 담당 — 여기서 중복 안 함.
function canadiaWorkProduce(npc, now) {
  const village = npc.canadiaVillage;
  if (!village) return;
  if (npc.canadiaJob === 'fisher') {
    addRealYield(village, 'fish', 1);            // 한 세션 = 물고기 1
    npc._caughtFish = (npc._caughtFish || 0) + 1;
  } else if (npc.canadiaJob === 'farmer') {
    const c = npc.farmClaimId ? claims.get(npc.farmClaimId) : null;
    if (c && c.facilityType === 'farmland') {
      if (c.farmStage >= 3) {                     // 익음 → 수확
        addRealYield(village, 'berry', 3);
        c.sownAt = null; c.farmStage = 0;
        broadcast({ type: 'claim_updated', claim: c });
      } else if (c.sownAt == null) {              // 빈 밭 → 씨뿌리기
        c.sownAt = now; c.farmStage = 1;
        broadcast({ type: 'claim_updated', claim: c });
      }
      // 자라는 중(1~2)이면 대기 — 다음 방문에 수확
    } else {
      addRealYield(village, 'berry', 1);          // 밭 셀 없는 농부 — 소규모 텃밭 fallback (굶음 방지)
    }
  }
  // 그 외 직업: 추상 JOB_YIELD(60초 생산틱)가 담당.
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
      canadiaWorkProduce(npc, now);   // 작업 1세션 완료 → 직업별 실제 산출 (어부=물고기 등)
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

