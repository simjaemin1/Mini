// === Zone 로컬 DB ===
// 각 zone 서버는 자기 만의 world-<zone>.db 파일을 가짐.
// 분산 배포에서 다른 VPS와 DB를 공유하지 않음.
//
// 저장 대상 (zone 로컬):
//   - resources: 자원 (나무/돌)
//   - buildings: 벽/상자
//   - mobs:      사슴/늑대
//   - claims:    토지 점유 (이 zone에 속한 것만)
//
// 저장 안 함 (central에 위임):
//   - players: 계정·인벤토리·도구·last_zone — central.db
//
// 환경변수:
//   ZONE_ID — 어느 zone인지 결정 (file name에 들어감)
//   DB_PATH — override 가능

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const ZONE_ID = process.env.ZONE_ID || 'hanbando';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', `world-${ZONE_ID}.db`);
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA busy_timeout = 5000');
try {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
} catch (e) {
  console.warn(`[${ZONE_ID}/db] WAL 실패:`, e.message);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    hp         INTEGER NOT NULL,
    max_hp     INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS buildings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    data       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL,
    x               REAL NOT NULL,
    y               REAL NOT NULL,
    hp              INTEGER NOT NULL,
    max_hp          INTEGER NOT NULL,
    tame_owner      TEXT,
    tame_owner_name TEXT,
    created_at      INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS claims (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    w          REAL NOT NULL,
    h          REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  -- Phase 12.2.e: 시드 자원 중 채집된 것만 기록 (그 외엔 매번 시드로 재생성)
  CREATE TABLE IF NOT EXISTS harvested_seeds (
    seed_key      TEXT PRIMARY KEY,
    harvested_at  INTEGER NOT NULL
  );
  -- 광맥 셀 번영도 (lazy: prosperity + last_t timestamp). 만땅 회복 시 레코드 삭제 → 테이블 작게 유지.
  CREATE TABLE IF NOT EXISTS mined_cells (
    cell_key    TEXT PRIMARY KEY,
    prosperity  REAL NOT NULL,
    last_t      INTEGER NOT NULL
  );
  -- 건물 lazy-load: 청크(좌표 범위)별 조회용 인덱스. activateChunk가 (x,y) 범위로 SELECT.
  CREATE INDEX IF NOT EXISTS idx_buildings_xy ON buildings(x, y);
`);

// === resources ===
const stmtGetResources = db.prepare('SELECT * FROM resources');
const stmtInsertResource = db.prepare(
  'INSERT INTO resources (type, x, y, hp, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const stmtUpdateResourceHp = db.prepare('UPDATE resources SET hp = ? WHERE id = ?');
const stmtDeleteResource = db.prepare('DELETE FROM resources WHERE id = ?');

function getResources() { return stmtGetResources.all(); }
function insertResource(r) {
  const result = stmtInsertResource.run(r.type, r.x, r.y, r.hp, r.max_hp, Date.now());
  return result.lastInsertRowid;
}
function updateResourceHp(id, hp) { stmtUpdateResourceHp.run(hp, id); }
function deleteResource(id) { stmtDeleteResource.run(id); }

// === buildings ===
// §4-4 Stage 4A 마이그레이션 — village_id 컬럼(nullable, 추가 전용). 시뮬 마을(villages.js)이
//   실물화한 회관·집 행에만 채워짐(레거시·플레이어 건물은 전부 NULL — 기존 행 불변).
try {
  const bcols = db.prepare('PRAGMA table_info(buildings)').all().map(c => c.name);
  if (!bcols.includes('village_id')) {
    db.exec('ALTER TABLE buildings ADD COLUMN village_id INTEGER');
    console.log(`[${ZONE_ID}/db] buildings.village_id 컬럼 추가됨 (§4-4 Stage 4A)`);
  }
} catch (e) {}
const stmtGetBuildings = db.prepare('SELECT * FROM buildings');
// 건물 lazy-load: 청크 좌표 범위 [x0,x1) × [y0,y1) 안 건물만. half-open이라 청크 경계 건물이
//   정확히 한 청크에만 속함(중복/누락 없음). idx_buildings_xy 인덱스로 빠름.
const stmtGetBuildingsInRect = db.prepare(
  'SELECT * FROM buildings WHERE x >= ? AND x < ? AND y >= ? AND y < ?'
);
const stmtInsertBuilding = db.prepare(
  'INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at, village_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateBuildingData = db.prepare('UPDATE buildings SET data = ? WHERE id = ?');
const stmtDeleteBuilding = db.prepare('DELETE FROM buildings WHERE id = ?');

function getBuildings() { return stmtGetBuildings.all(); }
function getBuildingsInRect(x0, y0, x1, y1) { return stmtGetBuildingsInRect.all(x0, x1, y0, y1); }
function insertBuilding(b) {
  const result = stmtInsertBuilding.run(b.type, b.owner_id, b.owner_name, b.x, b.y, b.data || null, Date.now(), b.village_id != null ? b.village_id : null);
  return result.lastInsertRowid;
}
function updateBuildingData(id, dataJson) { stmtUpdateBuildingData.run(dataJson, id); }
function deleteBuilding(id) { stmtDeleteBuilding.run(id); }

// === mobs ===
// 마이그레이션 — tame_owner 컬럼 없으면 추가
try {
  const cols = db.prepare("PRAGMA table_info(mobs)").all().map(c => c.name);
  if (!cols.includes('tame_owner')) {
    db.exec('ALTER TABLE mobs ADD COLUMN tame_owner TEXT');
    console.log(`[${ZONE_ID}/db] mobs.tame_owner 컬럼 추가됨`);
  }
  if (!cols.includes('tame_owner_name')) {
    db.exec('ALTER TABLE mobs ADD COLUMN tame_owner_name TEXT');
    console.log(`[${ZONE_ID}/db] mobs.tame_owner_name 컬럼 추가됨`);
  }
} catch (e) {}

const stmtGetMobs = db.prepare('SELECT * FROM mobs');
const stmtInsertMob = db.prepare(
  'INSERT INTO mobs (type, x, y, hp, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const stmtUpdateMobState = db.prepare('UPDATE mobs SET x = ?, y = ?, hp = ?, tame_owner = ?, tame_owner_name = ? WHERE id = ?');
const stmtDeleteMob = db.prepare('DELETE FROM mobs WHERE id = ?');

function getMobs() { return stmtGetMobs.all(); }
function insertMob(m) {
  const result = stmtInsertMob.run(m.type, m.x, m.y, m.hp, m.max_hp, Date.now());
  return result.lastInsertRowid;
}
function updateMobState(id, x, y, hp, tameOwner, tameOwnerName) {
  stmtUpdateMobState.run(x, y, hp, tameOwner || null, tameOwnerName || null, id);
}
function deleteMob(id) { stmtDeleteMob.run(id); }

// === claims ===
// ★★[T45 2026-09-02 재민 확정] **잃어버린 필드의 복구 + 상태기 세 열.**
//   §0 실측: 스키마가 `(id, owner_id, owner_name, x, y, w, h, created_at)` 뿐이라
//   **재시작하면 사람 클레임의 종류가 전부 `undefined` 가 됐다**(NPC 마을 영토는 부팅마다
//   메모리에 다시 만들어져 무사했다 — **사람 것만 잃었다**). 파생 셋:
//     ⓐ `countMyClaims` 의 `else p++` 로 임시·길드가 개인 슬롯을 먹는다
//     ⓑ `findGuildClaimContaining` 이 늘 null ⇒ 개인 사유지를 새로 못 짓는다
//     ⓒ `listRespawnOptions` 가 종류로 거르므로 **자기 사유지가 부활 지점에서 사라진다**
//   ⇒ 다섯 열을 더한다. 옛 행은 `'personal'` 로 이행한다 — **현행 부팅이 사실상 그렇게 취급해 왔다**
//     (`countMyClaims` 의 `else p++`). 값을 지어내는 게 아니라 **이미 하던 해석을 적어 두는 것**이다.
//   ⚠`ALTER TABLE ADD COLUMN` 은 IF NOT EXISTS 가 없다 — `mined_cells` 선례대로 PRAGMA 로 본다.
{
  const _cc = db.prepare('PRAGMA table_info(claims)').all().map((c) => c.name);
  if (!_cc.includes('kind')) {
    db.exec("ALTER TABLE claims ADD COLUMN kind TEXT");
    db.exec("UPDATE claims SET kind = 'personal' WHERE kind IS NULL");   // ★옛 행 이행(위 주석)
  }
  if (!_cc.includes('guild_tribe_id')) db.exec('ALTER TABLE claims ADD COLUMN guild_tribe_id INTEGER');
  if (!_cc.includes('state'))    db.exec("ALTER TABLE claims ADD COLUMN state TEXT NOT NULL DEFAULT 'active'");
  if (!_cc.includes('held_by'))  db.exec('ALTER TABLE claims ADD COLUMN held_by TEXT');
  if (!_cc.includes('state_at')) db.exec('ALTER TABLE claims ADD COLUMN state_at INTEGER NOT NULL DEFAULT 0');
}
const stmtGetClaims = db.prepare('SELECT * FROM claims');
const stmtInsertClaim = db.prepare(
  'INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at, kind, guild_tribe_id, state, held_by, state_at)'
  + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateClaimState = db.prepare('UPDATE claims SET state = ?, held_by = ?, state_at = ? WHERE id = ?');
const stmtUpdateClaimOwner = db.prepare(
  'UPDATE claims SET owner_id = ?, owner_name = ?, kind = ?, state = ?, held_by = ?, state_at = ? WHERE id = ?'
);
const stmtDeleteClaim = db.prepare('DELETE FROM claims WHERE id = ?');
function getClaims() { return stmtGetClaims.all(); }
function insertClaim(c) {
  const now = Date.now();
  const result = stmtInsertClaim.run(c.owner_id, c.owner_name, c.x, c.y, c.w, c.h, now,
    c.kind || 'personal', c.guild_tribe_id == null ? null : c.guild_tribe_id,
    c.state || 'active', c.held_by == null ? null : c.held_by, c.state_at == null ? now : c.state_at);
  return result.lastInsertRowid;
}
// ★[T45] 상태 전이 · 셀 승계 — 메모리 클레임을 고친 **바로 그 자리**에서 같이 부른다.
//   (부재 상태기는 재기동을 넘어 살아야 한다 — 안 그러면 재시작이 곧 사면이다.)
function updateClaimState(dbId, state, heldBy, stateAt) {
  if (!dbId) return false;
  try { stmtUpdateClaimState.run(String(state || 'active'), heldBy == null ? null : String(heldBy), (stateAt | 0) || Date.now(), dbId); return true; }
  catch (e) { return false; }
}
function updateClaimOwner(dbId, ownerId, ownerName, kind, state, heldBy, stateAt) {
  if (!dbId) return false;
  try {
    stmtUpdateClaimOwner.run(String(ownerId), String(ownerName || ''), String(kind || 'personal'),
      String(state || 'active'), heldBy == null ? null : String(heldBy), (stateAt | 0) || Date.now(), dbId);
    return true;
  } catch (e) { return false; }
}
function deleteClaim(dbId) { if (!dbId) return false; try { stmtDeleteClaim.run(dbId); return true; } catch (e) { return false; } }

// === harvested_seeds (procedural 자원 채집 기록) ===
const stmtInsertHarvested = db.prepare('INSERT OR IGNORE INTO harvested_seeds (seed_key, harvested_at) VALUES (?, ?)');
const stmtGetAllHarvested = db.prepare('SELECT seed_key FROM harvested_seeds');
function insertHarvestedSeed(key) { stmtInsertHarvested.run(key, Date.now()); }
function getAllHarvestedSeeds() { return stmtGetAllHarvested.all().map(r => r.seed_key); }

// === mined_cells (광맥 셀 번영도 — lazy refill) ===
// ★[11차 채광 재설계] prosperity 컬럼은 이제 **잔여 재고**(0..ORE_K=1000)를 담는다.
//   swings       = 그 셀에 쌓인 타수(0..59). **셀에 쌓이므로** 두 사람이 같이 파면 60타를 나눠 채운다(2인 1조).
//   migrated_v11 = 구 스키마(번영도 0..100) 이행 완료 표시 — 부팅 때 한 번만 비율 변환(zone.js).
{ const _mc = db.prepare('PRAGMA table_info(mined_cells)').all().map(c => c.name);
  if (!_mc.includes('swings')) db.exec('ALTER TABLE mined_cells ADD COLUMN swings REAL NOT NULL DEFAULT 0');
  if (!_mc.includes('migrated_v11')) db.exec('ALTER TABLE mined_cells ADD COLUMN migrated_v11 INTEGER NOT NULL DEFAULT 0');
  // ★kgsum = 그 셀에 쌓인 **무게 기여 합**. 덩이 무게를 막타가 아니라 타격별 가중평균으로 내기 위함(재민 지적).
  if (!_mc.includes('kgsum')) db.exec('ALTER TABLE mined_cells ADD COLUMN kgsum REAL NOT NULL DEFAULT 0'); }
const stmtUpsertMined = db.prepare('INSERT INTO mined_cells (cell_key, prosperity, last_t, swings, kgsum, migrated_v11) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(cell_key) DO UPDATE SET prosperity=excluded.prosperity, last_t=excluded.last_t, swings=excluded.swings, kgsum=excluded.kgsum, migrated_v11=1');
const stmtGetAllMined = db.prepare('SELECT cell_key, prosperity, last_t, swings, kgsum, migrated_v11 FROM mined_cells');
const stmtDeleteMined = db.prepare('DELETE FROM mined_cells WHERE cell_key = ?');
function upsertMinedCell(key, stock, lastT, swings, kgsum) { stmtUpsertMined.run(key, stock, lastT, swings || 0, kgsum || 0); }
function getAllMinedCells() { return stmtGetAllMined.all(); }
function deleteMinedCell(key) { stmtDeleteMined.run(key); }

// === 낚시 v2 [재민 확정 2026-08-26] — 어장 셀 재고 ===========================
//   `mined_cells` 와 **같은 문법**: 만땅인 셀은 저장하지 않는다(암묵적 만땅) → 테이블이 작다.
//   stock = 그 셀에 남은 어군(0..FISH_CELL_K) · last_t = 마지막 갱신(로지스틱 lazy 적분의 기준)
db.exec(`
  CREATE TABLE IF NOT EXISTS fish_cells (
    cell_key  TEXT PRIMARY KEY,
    stock     REAL NOT NULL,
    last_t    INTEGER NOT NULL
  );
`);
const stmtUpsertFish = db.prepare('INSERT INTO fish_cells (cell_key, stock, last_t) VALUES (?, ?, ?) ON CONFLICT(cell_key) DO UPDATE SET stock=excluded.stock, last_t=excluded.last_t');
const stmtGetAllFish = db.prepare('SELECT cell_key, stock, last_t FROM fish_cells');
const stmtDeleteFish = db.prepare('DELETE FROM fish_cells WHERE cell_key = ?');
function upsertFishCell(key, stock, lastT) { stmtUpsertFish.run(key, stock, lastT); }
function getAllFishCells() { return stmtGetAllFish.all(); }
function deleteFishCell(key) { stmtDeleteFish.run(key); }

// === §4-4 Stage 1: NPC 마을 시뮬 (server/villages.js) — 추가 전용 스키마 ===
// 기존 테이블 불변. CREATE TABLE IF NOT EXISTS라 구DB에도 마이그레이션 안전.
//   villages: 마을 1행 = econ 인스턴스 1개. econ_state = tickVillage 재개에 필요한 전체
//             직렬화(JSON: npcs·storage·counts·housing·land·guild·treasury 등, villages.js serializeEcon).
//   village_buildings: village-layout.js generate() 산출(집·논·밭·회관)의 셀 단위 기록.
//                      cx/cy = 셀 좌표(×32px = 월드). floors: house만 의미(그 외 0).
// econ 일일 로그 테이블은 이번엔 생략(과설계 방지) — econ_state.history(최근 50 스냅샷)로 충분.
db.exec(`
  CREATE TABLE IF NOT EXISTS villages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    zone        TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    cx          INTEGER NOT NULL,
    cy          INTEGER NOT NULL,
    population  INTEGER NOT NULL DEFAULT 0,
    econ_state  TEXT,
    day         INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS village_buildings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    village_id  INTEGER NOT NULL,
    type        TEXT    NOT NULL,
    cx          INTEGER NOT NULL,
    cy          INTEGER NOT NULL,
    floors      INTEGER NOT NULL DEFAULT 1,
    data        TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_villages_zone ON villages(zone);
  CREATE INDEX IF NOT EXISTS idx_village_buildings_vid ON village_buildings(village_id);
  -- §4-4 Stage 4A: 청크 materialize가 셀 범위로 농지 타일을 직접 조회(비영속 실물화 — buildings 행 폭발 방지)
  CREATE INDEX IF NOT EXISTS idx_village_buildings_cell ON village_buildings(cx, cy);
`);
const stmtGetVillagesByZone = db.prepare('SELECT * FROM villages WHERE zone = ? ORDER BY id');
const stmtInsertVillage = db.prepare(
  'INSERT INTO villages (zone, name, cx, cy, population, econ_state, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateVillageState = db.prepare('UPDATE villages SET econ_state = ?, population = ?, day = ? WHERE id = ?');
const stmtInsertVillageBuilding = db.prepare(
  'INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const stmtGetVillageBuildings = db.prepare('SELECT * FROM village_buildings WHERE village_id = ?');
// §4-4 Stage 4A: 농지 셀 범위 조회 — 청크 활성화 시 lazy 실물화용. half-open(cx0≤cx<cx1)이라
//   buildings 렉트 조회와 같은 규약(청크 경계 중복/누락 없음). idx_village_buildings_cell 사용.
const stmtGetVillageFarmInCellRect = db.prepare(
  "SELECT * FROM village_buildings WHERE type IN ('farmland','dryfield','yard','plaza','garden') AND cx >= ? AND cx < ? AND cy >= ? AND cy < ?"   // ★실체화 동기: 부지(yard)·광장(plaza)·텃밭(garden) 지면 타일 추가(랩 정본 — 비영속 시각 타일, farmland 패턴)
);

// === §11 도적(server/bandits.js) — 소굴·도적단 상태(존당 1행 JSON — 규모 미니: 소굴≤3·단 소수) ===
// villages 패턴(추가 전용·CREATE TABLE IF NOT EXISTS — 구DB 마이그레이션 안전). ENABLE_BANDITS=0이어도
// 테이블 생성 자체는 무해(villages 테이블 관례와 동일 — 행은 도적 모듈만 쓴다).
db.exec(`
  CREATE TABLE IF NOT EXISTS bandit_state (
    zone       TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    day        INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);
// === §16 답압 길(server/roads.js) — 밟힌 셀만(희소·게으른 감쇠), 게임일 1회 dirty 배치 플러시 ===
// villages/bandit 관례(추가 전용·CREATE TABLE IF NOT EXISTS — 구DB 마이그레이션 안전). ENABLE_ROADS=0이면 행 0.
db.exec(`
  CREATE TABLE IF NOT EXISTS roads (
    zone       TEXT    NOT NULL,
    cell_key   INTEGER NOT NULL,
    v          REAL    NOT NULL,
    d          INTEGER NOT NULL,
    PRIMARY KEY (zone, cell_key)
  );
`);
const stmtGetRoadCells = db.prepare('SELECT cell_key, v, d FROM roads WHERE zone = ?');
const stmtUpsertRoadCell = db.prepare('INSERT INTO roads (zone, cell_key, v, d) VALUES (?, ?, ?, ?) ON CONFLICT(zone, cell_key) DO UPDATE SET v = excluded.v, d = excluded.d');
const stmtDeleteRoadCell = db.prepare('DELETE FROM roads WHERE zone = ? AND cell_key = ?');
function getRoadCells(zone) { return stmtGetRoadCells.all(zone); }
function upsertRoadCell(zone, key, v, d) { stmtUpsertRoadCell.run(zone, key | 0, v, d | 0); }
function deleteRoadCell(zone, key) { stmtDeleteRoadCell.run(zone, key | 0); }

// === [T42 2026-09-01] 교역로 캐시 영속 — 마을 쌍 A* 결과 =========================
//   왜: 콜드 A* 한 번이 **1.3~1.7초**다(실측). 캐시는 프로세스 메모리라 **재기동마다 다시 덥힌다**,
//   그리고 덥히는 일이 하필 **게임일 경계**에 몰린다(캐러밴이 그때 출발하므로).
//   ⇒ 계산을 싸게 만드는 게 아니라 **일어나지 않게** 한다. 같은 세계면 같은 답이라는 보증이
//     `sim/path-core.js` 머리 주석에 이미 적혀 있다: *"같은 두 점·같은 세계면 재계산이
//     같은 복도를 결정론으로 재현"*(왕복 대칭·직선 편향). 그래서 저장해도 답이 안 달라진다.
//
//   ★`sig` = **세계 서명**. 지형 데이터나 존 설정이 바뀌면 옛 경로를 못 믿는다 ⇒ 통째로 버린다.
//     런타임의 벽·다리 변화는 `invalidateTradeDistances` 가 이 표까지 비운다(같은 훅 · 한 자리).
//   ★`pts` 가 NULL = **불능쌍**(경로 없음). 그것도 캐시한다 — 메모리 캐시가 `null` 을 캐시하는 규약 그대로다.
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_routes (
    zone TEXT NOT NULL,
    pair TEXT NOT NULL,
    sig  TEXT NOT NULL,
    pts  TEXT,
    PRIMARY KEY (zone, pair)
  );
`);
const stmtGetRoutes = db.prepare('SELECT pair, pts FROM trade_routes WHERE zone = ? AND sig = ?');
const stmtUpsertRoute = db.prepare('INSERT INTO trade_routes (zone, pair, sig, pts) VALUES (?, ?, ?, ?) ON CONFLICT(zone, pair) DO UPDATE SET sig = excluded.sig, pts = excluded.pts');
const stmtClearRoutes = db.prepare('DELETE FROM trade_routes WHERE zone = ?');
const stmtCountRoutes = db.prepare('SELECT COUNT(*) AS n FROM trade_routes WHERE zone = ?');
function getTradeRoutes(zone, sig) { return stmtGetRoutes.all(zone, String(sig)); }
function upsertTradeRoute(zone, pair, sig, ptsJson) { stmtUpsertRoute.run(zone, String(pair), String(sig), ptsJson === null ? null : String(ptsJson)); }
function clearTradeRoutes(zone) { return stmtClearRoutes.run(zone).changes | 0; }
function countTradeRoutes(zone) { return (stmtCountRoutes.get(zone) || {}).n | 0; }

// === [배치 20 B] 동적 토양치 + 지질 플래그(server/soil.js) ===
// mined_cells 의 lazy 패턴을 그대로 베낀 것: **기준선에서 벗어난 셀만** 행을 갖는다.
//   v   = 절대 토양치 0..1000 (public/soil-base.js SOIL_MAX 눈금)
//   d   = 마지막 접근 게임일(게으른 리젠 — 일괄 패스 없음)
//   geo = 지질 플래그 비트: 1 = wasMountain(부서진 산터. 파괴가 없어도 값은 영속이라 남는다)
// ★geo 가 붙은 셀은 v 가 기준선에 도달해도 **행을 지우지 않는다**(지질은 회복되지 않는다).
db.exec(`
  CREATE TABLE IF NOT EXISTS soil_cells (
    zone       TEXT    NOT NULL,
    cell_key   INTEGER NOT NULL,
    v          REAL    NOT NULL,
    d          INTEGER NOT NULL,
    geo        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (zone, cell_key)
  );
`);
const stmtGetSoilCells = db.prepare('SELECT cell_key, v, d, geo FROM soil_cells WHERE zone = ?');
const stmtUpsertSoilCell = db.prepare('INSERT INTO soil_cells (zone, cell_key, v, d, geo) VALUES (?, ?, ?, ?, ?) ON CONFLICT(zone, cell_key) DO UPDATE SET v = excluded.v, d = excluded.d, geo = excluded.geo');
const stmtDeleteSoilCell = db.prepare('DELETE FROM soil_cells WHERE zone = ? AND cell_key = ?');
function getSoilCells(zone) { return stmtGetSoilCells.all(zone); }
function upsertSoilCell(zone, key, v, d, geo) { stmtUpsertSoilCell.run(zone, key | 0, v, d | 0, geo | 0); }
function deleteSoilCell(zone, key) { stmtDeleteSoilCell.run(zone, key | 0); }

// === [2026-08-25 사건 레이어] 사건 장부 · 게시판 의뢰 — 추가 전용 스키마 ===
//   village_events   : 하루 경계 판정이 낸 사건. 마을당 EV_KEEP_DAYS 일치만 남기고 오래된 것부터 버린다.
//   village_requests : 게시판에 걸려 있는 납품 의뢰. (zone,vid,item) 유일 — 동일 품목 중복 금지가 스키마 계약이다.
//   ⚠ vid 는 `villages.id`(dbId). 마을이 지워지면 남는 행은 다음 부팅의 prune 이 걷는다.
db.exec(`
  CREATE TABLE IF NOT EXISTS village_events (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    zone   TEXT    NOT NULL,
    vid    INTEGER NOT NULL,
    day    INTEGER NOT NULL,
    type   TEXT    NOT NULL,
    item   TEXT,
    mag    REAL    NOT NULL,
    meta   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_village_events_vid ON village_events (zone, vid, day);
  CREATE TABLE IF NOT EXISTS village_requests (
    zone     TEXT    NOT NULL,
    vid      INTEGER NOT NULL,
    item     TEXT    NOT NULL,
    qty      REAL    NOT NULL,
    filled   REAL    NOT NULL DEFAULT 0,
    rew_item TEXT    NOT NULL,
    rew_qty  REAL    NOT NULL,
    day      INTEGER NOT NULL,
    PRIMARY KEY (zone, vid, item)
  );
`);
// === ★★[T18 2026-09-01] 연대기 — 잘리지 않는 큰 사건 표 (추가 전용 스키마) ===
//   왜 별도 표인가: `village_events` 는 `EV_KEEP_DAYS`(90일)마다 잘린다. 연표는 **해를 넘겨** 읽는
//   것이라 잘리는 표를 볼 수 없다. ⇒ 큰 사건(`events.isChronicle`)만 여기 남기고 **prune 하지 않는다.**
//   ⚠**사건 하나당 한 행**이다(마을×사건이 아니라). 어느 마을이 언제 들었는지는 도달표가
//     결정론적으로 되돌려 주므로 저장할 이유가 없다(파생값 미저장 — `spoil.js` 신선도와 같은 규약).
//   ⚠`meta` 를 안 담는다 — 연표 문장은 타입·품목·mag 만 쓴다. 담으면 영구 보관 부피가 몇 배가 된다.
db.exec(`
  CREATE TABLE IF NOT EXISTS village_chronicle (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    zone TEXT    NOT NULL,
    vid  INTEGER NOT NULL,
    day  INTEGER NOT NULL,
    type TEXT    NOT NULL,
    item TEXT,
    mag  REAL    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_village_chronicle ON village_chronicle (zone, day);
`);
// === [T20 2026-09-02 겨울나기] village_winter — 그 해 겨울 프로젝트의 **양** ==========
//   ★★기여 **카운터**(횟수)는 여기 없다. 그건 `onboarding.contrib` 하나뿐이고(T11 제1 규약)
//     이 표는 **양**만 센다 — 두 축이 서로를 오염시키면 "부자가 소속을 사는" 문이 열린다(설계안 W-7).
//   ★행이 두 종류다(키가 갈라 준다):
//     · `player_id = ''` → **마을 머리 행**. `qty` = 그 해 공표한 목표 N · `res` = 목표 품목.
//       ⚠공표한 목표는 얼어야 한다 — 촌장이 가을에 한 약속을 겨울에 바꾸면 그게 거짓말이다.
//         (`_consEMA` 같은 살아 있는 수에서 매번 다시 유도하면 목표가 계절 내내 흔들린다.)
//     · 그 밖      → **사람 행**. `qty` = 그 해 그 사람이 낸 양(부분 납품도 센다).
//   ★해가 바뀌면 새 (vid, year) 행이 선다 — 지난 해 행은 그대로 두고 **읽지 않는다**(그 해의 일이다).
//   ★**달성 여부는 여기 없다** — 그건 사건(`WINTER_KEPT`)이고, 연표가 이미 영구히 들고 있다
//     (T50 `FIRST_GOODS` 가 "처음"을 연표로 되돌린 것과 같은 자리 — 파생 상태를 두 번 적지 않는다).
db.exec(`
  CREATE TABLE IF NOT EXISTS village_winter (
    zone      TEXT    NOT NULL,
    vid       INTEGER NOT NULL,
    year      INTEGER NOT NULL,
    player_id TEXT    NOT NULL,
    qty       REAL    NOT NULL DEFAULT 0,
    res       TEXT,
    PRIMARY KEY (zone, vid, year, player_id)
  );
`);
// ★[T63 2026-09-03 · T20 회부 ⓪] 열 하나 — **기여자 이름**.
//   양은 이미 여기 남는데 이름은 서버 메모리(`winter.js _names`)에만 있었다 ⇒ 재기동하면
//   브리핑에서 **누가 냈는지가 사라진다**(양은 남고 이름만 빠지는, 조용한 반쪽 영속).
//   ⚠`ALTER TABLE ADD COLUMN` 엔 IF NOT EXISTS 가 없다 — `claims.kind` 선례대로 PRAGMA 로 본다.
//   ⚠이름은 **표시용**이다: 판정도 보상도 이 열을 안 읽는다(읽으면 이름이 규칙이 된다).
{
  const _wc = db.prepare('PRAGMA table_info(village_winter)').all().map((c) => c.name);
  if (!_wc.includes('name')) db.exec('ALTER TABLE village_winter ADD COLUMN name TEXT');
}
const stmtUpsertVillageWinter = db.prepare(`INSERT INTO village_winter (zone, vid, year, player_id, qty, res, name)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(zone, vid, year, player_id) DO UPDATE SET qty = excluded.qty, res = excluded.res,
    name = COALESCE(excluded.name, village_winter.name)`);
const stmtGetVillageWinter = db.prepare('SELECT vid, year, player_id, qty, res, name FROM village_winter WHERE zone = ? AND year >= ?');
// ★`name` 을 안 주면(null) **지우지 않는다**(`COALESCE`) — 이름 없는 갱신이 이름을 날리면
//   "낸 사람이 다시 냈더니 이름이 사라졌다"가 된다.
function upsertVillageWinter(zone, vid, year, playerId, qty, res, name) {
  stmtUpsertVillageWinter.run(zone, vid | 0, year | 0, String(playerId == null ? '' : playerId), +qty || 0,
    res == null ? null : String(res), name == null ? null : String(name));
}
function getVillageWinterSince(zone, year) { return stmtGetVillageWinter.all(zone, year | 0); }

const stmtInsertVillageChronicle = db.prepare('INSERT INTO village_chronicle (zone, vid, day, type, item, mag) VALUES (?, ?, ?, ?, ?, ?)');
const stmtGetVillageChronicle = db.prepare('SELECT vid, day, type, item, mag FROM village_chronicle WHERE zone = ? ORDER BY day');
const stmtCountVillageChronicle = db.prepare('SELECT COUNT(*) AS n FROM village_chronicle WHERE zone = ?');
function insertVillageChronicle(zone, e) {
  stmtInsertVillageChronicle.run(zone, e.vid | 0, e.day | 0, String(e.type), e.item == null ? null : String(e.item), +e.mag || 0);
}
function getVillageChronicle(zone) { return stmtGetVillageChronicle.all(zone); }
function countVillageChronicle(zone) { const r = stmtCountVillageChronicle.get(zone); return (r && r.n) | 0; }

const stmtInsertVillageEvent = db.prepare('INSERT INTO village_events (zone, vid, day, type, item, mag, meta) VALUES (?, ?, ?, ?, ?, ?, ?)');
const stmtGetVillageEvents = db.prepare('SELECT vid, day, type, item, mag, meta FROM village_events WHERE zone = ? AND day >= ? ORDER BY day');
const stmtPruneVillageEvents = db.prepare('DELETE FROM village_events WHERE zone = ? AND day < ?');
function insertVillageEvent(zone, e) {
  stmtInsertVillageEvent.run(zone, e.vid | 0, e.day | 0, String(e.type), e.item == null ? null : String(e.item),
    +e.mag || 0, e.meta ? JSON.stringify(e.meta) : null);
}
function getVillageEventsSince(zone, day) { return stmtGetVillageEvents.all(zone, day | 0); }
function pruneVillageEvents(zone, beforeDay) { stmtPruneVillageEvents.run(zone, beforeDay | 0); }

const stmtUpsertVillageRequest = db.prepare('INSERT INTO village_requests (zone, vid, item, qty, filled, rew_item, rew_qty, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(zone, vid, item) DO UPDATE SET qty = excluded.qty, filled = excluded.filled, rew_item = excluded.rew_item, rew_qty = excluded.rew_qty, day = excluded.day');
const stmtDeleteVillageRequest = db.prepare('DELETE FROM village_requests WHERE zone = ? AND vid = ? AND item = ?');
const stmtGetVillageRequests = db.prepare('SELECT vid, item, qty, filled, rew_item, rew_qty, day FROM village_requests WHERE zone = ?');
function upsertVillageRequest(zone, r) { stmtUpsertVillageRequest.run(zone, r.vid | 0, String(r.item), +r.qty || 0, +r.filled || 0, String(r.rewItem), +r.rewQty || 0, r.day | 0); }
function deleteVillageRequest(zone, vid, item) { stmtDeleteVillageRequest.run(zone, vid | 0, String(item)); }
function getVillageRequests(zone) { return stmtGetVillageRequests.all(zone); }

const stmtGetBanditState = db.prepare('SELECT * FROM bandit_state WHERE zone = ?');
const stmtUpsertBanditState = db.prepare(
  'INSERT INTO bandit_state (zone, data, day, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(zone) DO UPDATE SET data = excluded.data, day = excluded.day, updated_at = excluded.updated_at'
);
function getBanditState(zone) { return stmtGetBanditState.get(zone) || null; }
function upsertBanditState(zone, dataJson, day) { stmtUpsertBanditState.run(zone, dataJson, day | 0, Date.now()); }

function getVillagesByZone(zone) { return stmtGetVillagesByZone.all(zone); }
function insertVillage(v) {
  const r = stmtInsertVillage.run(v.zone, v.name, v.cx | 0, v.cy | 0, v.population | 0, v.econ_state || null, v.day | 0, Date.now());
  return r.lastInsertRowid;
}
function updateVillageState(id, econState, population, day) { stmtUpdateVillageState.run(econState, population | 0, day | 0, id); }
function insertVillageBuilding(b) {
  const r = stmtInsertVillageBuilding.run(b.village_id, b.type, b.cx | 0, b.cy | 0, b.floors | 0, b.data || null, Date.now());
  return r.lastInsertRowid;
}
function getVillageBuildings(villageId) { return stmtGetVillageBuildings.all(villageId); }
function getVillageFarmInCellRect(cx0, cx1, cy0, cy1) { return stmtGetVillageFarmInCellRect.all(cx0, cx1, cy0, cy1); }

console.log(`[${ZONE_ID}/db] 로컬 zone DB 준비됨: ${DB_PATH}`);

module.exports = {
  db,
  getResources, insertResource, updateResourceHp, deleteResource,
  getBuildings, getBuildingsInRect, insertBuilding, updateBuildingData, deleteBuilding,
  getMobs, insertMob, updateMobState, deleteMob,
  getClaims, insertClaim, updateClaimState, updateClaimOwner, deleteClaim,   // ★[T45] 사유지 v2 — 종류·상태기 영속
  insertHarvestedSeed, getAllHarvestedSeeds,
  upsertMinedCell, getAllMinedCells, deleteMinedCell,
  upsertFishCell, getAllFishCells, deleteFishCell,
  // §4-4 마을 시뮬 (villages.js)
  getVillagesByZone, insertVillage, updateVillageState, insertVillageBuilding, getVillageBuildings,
  getVillageFarmInCellRect,
  // [2026-08-25 사건 레이어] 사건 장부·게시판 (events.js / villages.js)
  insertVillageEvent, getVillageEventsSince, pruneVillageEvents,
  insertVillageChronicle, getVillageChronicle, countVillageChronicle,   // ★[T18] 연대기(prune 없음)
  upsertVillageWinter, getVillageWinterSince,                          // ★[T20] 겨울나기 — 그 해의 **양**
  upsertVillageRequest, deleteVillageRequest, getVillageRequests,
  // §11 도적 (bandits.js)
  getBanditState, upsertBanditState,
  // §16 답압 길 (roads.js)
  getRoadCells, upsertRoadCell, deleteRoadCell,
  // [배치 20 B] 동적 토양치 · 지질 (soil.js)
  getSoilCells, upsertSoilCell, deleteSoilCell,
  // [T42] 교역로 캐시 영속 (villages.js getRoute)
  getTradeRoutes, upsertTradeRoute, clearTradeRoutes, countTradeRoutes,
};
