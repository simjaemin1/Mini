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
const stmtGetClaims = db.prepare('SELECT * FROM claims');
const stmtInsertClaim = db.prepare(
  'INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
function getClaims() { return stmtGetClaims.all(); }
function insertClaim(c) {
  const result = stmtInsertClaim.run(c.owner_id, c.owner_name, c.x, c.y, c.w, c.h, Date.now());
  return result.lastInsertRowid;
}

// === harvested_seeds (procedural 자원 채집 기록) ===
const stmtInsertHarvested = db.prepare('INSERT OR IGNORE INTO harvested_seeds (seed_key, harvested_at) VALUES (?, ?)');
const stmtGetAllHarvested = db.prepare('SELECT seed_key FROM harvested_seeds');
function insertHarvestedSeed(key) { stmtInsertHarvested.run(key, Date.now()); }
function getAllHarvestedSeeds() { return stmtGetAllHarvested.all().map(r => r.seed_key); }

// === mined_cells (광맥 셀 번영도 — lazy refill) ===
const stmtUpsertMined = db.prepare('INSERT INTO mined_cells (cell_key, prosperity, last_t) VALUES (?, ?, ?) ON CONFLICT(cell_key) DO UPDATE SET prosperity=excluded.prosperity, last_t=excluded.last_t');
const stmtGetAllMined = db.prepare('SELECT cell_key, prosperity, last_t FROM mined_cells');
const stmtDeleteMined = db.prepare('DELETE FROM mined_cells WHERE cell_key = ?');
function upsertMinedCell(key, prosperity, lastT) { stmtUpsertMined.run(key, prosperity, lastT); }
function getAllMinedCells() { return stmtGetAllMined.all(); }
function deleteMinedCell(key) { stmtDeleteMined.run(key); }

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
  getClaims, insertClaim,
  insertHarvestedSeed, getAllHarvestedSeeds,
  upsertMinedCell, getAllMinedCells, deleteMinedCell,
  // §4-4 마을 시뮬 (villages.js)
  getVillagesByZone, insertVillage, updateVillageState, insertVillageBuilding, getVillageBuildings,
  getVillageFarmInCellRect,
  // §11 도적 (bandits.js)
  getBanditState, upsertBanditState,
  // §16 답압 길 (roads.js)
  getRoadCells, upsertRoadCell, deleteRoadCell,
};
