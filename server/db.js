// SQLite 영속화 — 모든 zone 서버가 공유하는 단일 파일 (world.db)
// WAL 모드로 다중 writer 동시성 처리.
//
// 스키마:
//   players: 플레이어 프로필 + 인벤토리 + 마지막 위치
//   claims:  토지 점유 (zone별)

// Node 22+ 내장 sqlite — 외부 native 의존성 없음 (macOS 보안 차단 회피)
// 실행 시 `--experimental-sqlite` 플래그 필요
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'world.db');
const db = new DatabaseSync(DB_PATH);

// 동시 writer 견디게 WAL 모드 + busy_timeout (lock 잡혔으면 5초 대기 후 재시도)
// busy_timeout은 가장 먼저 — 그 뒤 모든 SQL이 자동으로 retry 함
db.exec('PRAGMA busy_timeout = 5000');
try {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
} catch (e) {
  console.warn('[db] WAL 모드 실패, 기본 journal 사용:', e.message);
}

// 스키마 (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    player_id     TEXT PRIMARY KEY,          -- 등록된 계정이면 username, 게스트면 anon_xxx
    name          TEXT NOT NULL,             -- 화면에 보이는 이름 (보통 player_id와 동일)
    color         TEXT NOT NULL DEFAULT '#5a9ae0',
    password_hash TEXT,                       -- NULL이면 게스트(영속화 안 함). 등록 시에만 채움.
    password_salt TEXT,
    wood          INTEGER NOT NULL DEFAULT 0,
    stone         INTEGER NOT NULL DEFAULT 0,
    last_zone     TEXT,
    last_x        REAL,
    last_y        REAL,
    last_seen     INTEGER,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claims (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    zone       TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    w          REAL NOT NULL,
    h          REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    zone       TEXT NOT NULL,
    type       TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    hp         INTEGER NOT NULL,
    max_hp     INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS buildings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    zone       TEXT NOT NULL,
    type       TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    data       TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mobs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    zone       TEXT NOT NULL,
    type       TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    hp         INTEGER NOT NULL,
    max_hp     INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_claims_zone ON claims(zone);
  CREATE INDEX IF NOT EXISTS idx_players_last_zone ON players(last_zone);
  CREATE INDEX IF NOT EXISTS idx_resources_zone ON resources(zone);
  CREATE INDEX IF NOT EXISTS idx_buildings_zone ON buildings(zone);
  CREATE INDEX IF NOT EXISTS idx_mobs_zone ON mobs(zone);
`);

// 기존 DB에 password 컬럼이 없으면 추가 (마이그레이션)
try {
  const cols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!cols.includes('password_hash')) {
    db.exec('ALTER TABLE players ADD COLUMN password_hash TEXT');
    console.log('[db] password_hash 컬럼 추가됨');
  }
  if (!cols.includes('password_salt')) {
    db.exec('ALTER TABLE players ADD COLUMN password_salt TEXT');
    console.log('[db] password_salt 컬럼 추가됨');
  }
  if (!cols.includes('tools_json')) {
    db.exec("ALTER TABLE players ADD COLUMN tools_json TEXT DEFAULT '{}'");
    console.log('[db] tools_json 컬럼 추가됨');
  }
  if (!cols.includes('equipped')) {
    db.exec('ALTER TABLE players ADD COLUMN equipped TEXT');
    console.log('[db] equipped 컬럼 추가됨');
  }
} catch (e) { /* 새 DB면 위 CREATE에서 이미 만들어짐 */ }

// === Prepared statements ===
const stmtGetPlayer = db.prepare('SELECT * FROM players WHERE player_id = ?');
const stmtUpsertPlayer = db.prepare(`
  INSERT INTO players (player_id, name, color, wood, stone, last_zone, last_x, last_y, last_seen, created_at)
  VALUES (@player_id, @name, @color, @wood, @stone, @last_zone, @last_x, @last_y, @last_seen, @created_at)
  ON CONFLICT(player_id) DO UPDATE SET
    name = excluded.name,
    color = excluded.color,
    wood = excluded.wood,
    stone = excluded.stone,
    last_zone = excluded.last_zone,
    last_x = excluded.last_x,
    last_y = excluded.last_y,
    last_seen = excluded.last_seen
`);
const stmtUpdateInventory = db.prepare(
  'UPDATE players SET wood = ?, stone = ?, last_seen = ? WHERE player_id = ?'
);
const stmtUpdateTools = db.prepare(
  'UPDATE players SET tools_json = ?, equipped = ?, last_seen = ? WHERE player_id = ?'
);
const stmtUpdatePosition = db.prepare(
  'UPDATE players SET last_zone = ?, last_x = ?, last_y = ?, last_seen = ? WHERE player_id = ?'
);
const stmtInsertClaim = db.prepare(`
  INSERT INTO claims (zone, owner_id, owner_name, x, y, w, h, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetClaimsByZone = db.prepare('SELECT * FROM claims WHERE zone = ?');

// resources
const stmtGetResourcesByZone = db.prepare('SELECT * FROM resources WHERE zone = ?');
const stmtInsertResource = db.prepare(
  'INSERT INTO resources (zone, type, x, y, hp, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateResourceHp = db.prepare('UPDATE resources SET hp = ? WHERE id = ?');
const stmtDeleteResource = db.prepare('DELETE FROM resources WHERE id = ?');
const stmtCountResourcesByZone = db.prepare('SELECT COUNT(*) as cnt FROM resources WHERE zone = ?');

// buildings
const stmtGetBuildingsByZone = db.prepare('SELECT * FROM buildings WHERE zone = ?');
const stmtInsertBuilding = db.prepare(
  'INSERT INTO buildings (zone, type, owner_id, owner_name, x, y, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateBuildingData = db.prepare('UPDATE buildings SET data = ? WHERE id = ?');
const stmtDeleteBuilding = db.prepare('DELETE FROM buildings WHERE id = ?');

// mobs
const stmtGetMobsByZone = db.prepare('SELECT * FROM mobs WHERE zone = ?');
const stmtInsertMob = db.prepare(
  'INSERT INTO mobs (zone, type, x, y, hp, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const stmtUpdateMobState = db.prepare('UPDATE mobs SET x = ?, y = ?, hp = ? WHERE id = ?');
const stmtDeleteMob = db.prepare('DELETE FROM mobs WHERE id = ?');
const stmtCountMobsByZone = db.prepare('SELECT COUNT(*) as cnt FROM mobs WHERE zone = ?');

const stmtCountPlayers = db.prepare('SELECT COUNT(*) as cnt FROM players');
const stmtCountClaims = db.prepare('SELECT COUNT(*) as cnt FROM claims');

// === 인증 (crypto.scrypt) ===
const SCRYPT_KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS).toString('hex');
  return { hash: derived, salt };
}

function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS).toString('hex');
  // timing-safe 비교
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const stmtRegister = db.prepare(`
  INSERT INTO players (player_id, name, color, password_hash, password_salt, created_at, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * 인증 결과:
 *   { ok: true, player, isNew: bool }
 *   { ok: false, reason: 'wrong_password' | 'guest_collision' | 'username_taken' }
 */
function authenticate(username, password, color) {
  const existing = stmtGetPlayer.get(username);
  if (existing) {
    // 기존 계정
    if (!existing.password_hash) {
      // 게스트 ID로 잡혀있는데 같은 이름으로 등록 시도 — 거부
      return { ok: false, reason: 'username_taken' };
    }
    if (!verifyPassword(password, existing.password_hash, existing.password_salt)) {
      return { ok: false, reason: 'wrong_password' };
    }
    return { ok: true, player: existing, isNew: false };
  }
  // 신규 등록
  const { hash, salt } = hashPassword(password);
  const now = Date.now();
  try {
    stmtRegister.run(username, username, color || '#5a9ae0', hash, salt, now, now);
  } catch (e) {
    return { ok: false, reason: 'username_taken' };
  }
  const created = stmtGetPlayer.get(username);
  return { ok: true, player: created, isNew: true };
}

// === 공개 API ===

function getPlayer(playerId) {
  return stmtGetPlayer.get(playerId) || null;
}

function upsertPlayer(p) {
  // p: { player_id, name, color, wood, stone, last_zone, last_x, last_y }
  stmtUpsertPlayer.run({
    player_id: p.player_id,
    name: p.name,
    color: p.color || '#5a9ae0',
    wood: p.wood | 0,
    stone: p.stone | 0,
    last_zone: p.last_zone || null,
    last_x: p.last_x ?? null,
    last_y: p.last_y ?? null,
    last_seen: Date.now(),
    created_at: p.created_at || Date.now(),
  });
}

function updateInventory(playerId, wood, stone) {
  stmtUpdateInventory.run(wood | 0, stone | 0, Date.now(), playerId);
}

function updateTools(playerId, toolsObj, equipped) {
  stmtUpdateTools.run(JSON.stringify(toolsObj || {}), equipped || null, Date.now(), playerId);
}

function updatePosition(playerId, zone, x, y) {
  stmtUpdatePosition.run(zone, x, y, Date.now(), playerId);
}

function insertClaim(claim) {
  // claim: { zone, owner_id, owner_name, x, y, w, h }
  const result = stmtInsertClaim.run(
    claim.zone, claim.owner_id, claim.owner_name,
    claim.x, claim.y, claim.w, claim.h,
    Date.now()
  );
  return result.lastInsertRowid;
}

function getClaimsByZone(zone) {
  return stmtGetClaimsByZone.all(zone);
}

function stats() {
  return {
    players: stmtCountPlayers.get().cnt,
    claims: stmtCountClaims.get().cnt,
    path: DB_PATH,
  };
}

function getResourcesByZone(zone) { return stmtGetResourcesByZone.all(zone); }
function insertResource(r) {
  const result = stmtInsertResource.run(r.zone, r.type, r.x, r.y, r.hp, r.max_hp, Date.now());
  return result.lastInsertRowid;
}
function updateResourceHp(id, hp) { stmtUpdateResourceHp.run(hp, id); }
function deleteResource(id) { stmtDeleteResource.run(id); }
function countResourcesByZone(zone) { return stmtCountResourcesByZone.get(zone).cnt; }

function getBuildingsByZone(zone) { return stmtGetBuildingsByZone.all(zone); }
function insertBuilding(b) {
  const result = stmtInsertBuilding.run(b.zone, b.type, b.owner_id, b.owner_name, b.x, b.y, b.data || null, Date.now());
  return result.lastInsertRowid;
}
function updateBuildingData(id, dataJson) { stmtUpdateBuildingData.run(dataJson, id); }
function deleteBuilding(id) { stmtDeleteBuilding.run(id); }

// mobs
function getMobsByZone(zone) { return stmtGetMobsByZone.all(zone); }
function insertMob(m) {
  const result = stmtInsertMob.run(m.zone, m.type, m.x, m.y, m.hp, m.max_hp, Date.now());
  return result.lastInsertRowid;
}
function updateMobState(id, x, y, hp) { stmtUpdateMobState.run(x, y, hp, id); }
function deleteMob(id) { stmtDeleteMob.run(id); }
function countMobsByZone(zone) { return stmtCountMobsByZone.get(zone).cnt; }

module.exports = {
  db,
  authenticate,
  hashPassword,
  verifyPassword,
  getPlayer,
  upsertPlayer,
  updateInventory,
  updateTools,
  updatePosition,
  insertClaim,
  getClaimsByZone,
  getResourcesByZone, insertResource, updateResourceHp, deleteResource, countResourcesByZone,
  getBuildingsByZone, insertBuilding, updateBuildingData, deleteBuilding,
  getMobsByZone, insertMob, updateMobState, deleteMob, countMobsByZone,
  stats,
};
