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
const stmtGetBuildings = db.prepare('SELECT * FROM buildings');
const stmtInsertBuilding = db.prepare(
  'INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateBuildingData = db.prepare('UPDATE buildings SET data = ? WHERE id = ?');
const stmtDeleteBuilding = db.prepare('DELETE FROM buildings WHERE id = ?');

function getBuildings() { return stmtGetBuildings.all(); }
function insertBuilding(b) {
  const result = stmtInsertBuilding.run(b.type, b.owner_id, b.owner_name, b.x, b.y, b.data || null, Date.now());
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

console.log(`[${ZONE_ID}/db] 로컬 zone DB 준비됨: ${DB_PATH}`);

module.exports = {
  db,
  getResources, insertResource, updateResourceHp, deleteResource,
  getBuildings, insertBuilding, updateBuildingData, deleteBuilding,
  getMobs, insertMob, updateMobState, deleteMob,
  getClaims, insertClaim,
  insertHarvestedSeed, getAllHarvestedSeeds,
  upsertMinedCell, getAllMinedCells, deleteMinedCell,
};
