// === 중앙 서버 (central) ===
// 분산 배포의 단일 진실의 원천. 모든 zone 서버가 HTTP로 호출함.
//
// 책임:
//   - 플레이어 인증 (POST /auth)
//   - 플레이어 프로필 조회/저장 (GET/POST /player/:id)
//   - 거래소 (POST /market/order, GET /market/orders, POST /market/cancel)
//   - dispatcher 라우팅 (GET /zones — 모든 zone WS URL 반환)
//   - 헬스/메트릭 (GET /health, /metrics)
//
// DB:
//   central.db — players 테이블만. mobs/resources/buildings/claims는 zone 로컬 DB에.
//
// 환경변수:
//   PORT (기본 3010)
//   DB_PATH (기본 ./central.db)
//   PUBLIC_HOST (클라에 노출할 호스트, 기본 localhost) — dispatcher용

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { ZONES, publicZoneMap } = require('./zone-config');
const httpClient = require('http');
const economy = require('../sim/economy-sim');

// === Economy 시뮬 — 중앙 거시 경제. 현실 3초 = 게임 1일.
const ECONOMY_TICK_MS = 1000; // Phase 4d-3: 더 빠른 변동 (1초/day)
const economyWorld = economy.createWorld({
  seed: parseInt(process.env.ECONOMY_SEED || '42'),
  villageCount: parseInt(process.env.ECONOMY_VILLAGES || '20'),
});
console.log(`[economy] world 초기화: ${economyWorld.villages.length} 마을`);
setInterval(() => {
  try { economy.tickWorld(economyWorld); }
  catch (e) { console.error('[economy] tick error:', e.message); }
}, ECONOMY_TICK_MS);

// === Phase 4a: Canadia 전용 economy world — 게임 통합 prototype.
//   캐나다 zone 안에 7개 마을 좌표 분산. 좌표는 zone 크기 (10240 × 10240) 기준.
const CANADIA_VILLAGES = 7;
const CANADIA_NAMES = ['단풍', '늑대골', '얼음호수', '검은숲', '강철광산', '연어강', '대평원'];
// economy module 새 world 생성. seed 다르게 (다른 마을 분포)
const canadiaWorld = economy.createWorld({
  seed: 4242,
  villageCount: CANADIA_VILLAGES,
  namePool: CANADIA_NAMES,
});
// 좌표 — 캐나디아 zone 11000×5000 안에 분산. 가장자리 800 margin.
//   타원형 배치 (zone이 가로로 길쭉).
function spreadCanadiaCoords() {
  const cx = 5500;  // 마을광장 위치
  const cy = 3100;  // 북쪽 극지방(빙하) 회피 — 광장보다 살짝 남쪽
  const rx = 4200; // x 반경
  const ry = 1100; // y 반경 (북쪽 빙하 영역 회피, y 2000~4200 안전권)
  for (let i = 0; i < canadiaWorld.villages.length; i++) {
    const v = canadiaWorld.villages[i];
    const angle = (i / canadiaWorld.villages.length) * Math.PI * 2;
    v.coord = {
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  }
}
spreadCanadiaCoords();
console.log(`[canadia-econ] ${canadiaWorld.villages.length}개 마을 좌표 부여:`);
canadiaWorld.villages.forEach(v => console.log(`  ${v.name} (${v.coord.x.toFixed(0)}, ${v.coord.y.toFixed(0)})`));
setInterval(() => {
  try { economy.tickWorld(canadiaWorld); }
  catch (e) { console.error('[canadia-econ] tick error:', e.message); }
}, ECONOMY_TICK_MS);

// === zone 인구 캐시 — 5초마다 각 zone의 /health fetch ===
const zonePopulation = {}; // zoneId -> { humans, cap, observers, ts }
function fetchZoneHealth(zoneId) {
  const z = ZONES[zoneId]; if (!z) return;
  const req = httpClient.request({
    host: z.host, port: z.port, path: '/health', method: 'GET', timeout: 2000,
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        const d = JSON.parse(body);
        zonePopulation[zoneId] = { humans: d.humans ?? d.players ?? 0, cap: d.cap ?? 150, observers: d.observers ?? 0, ts: Date.now() };
      } catch (e) {}
    });
  });
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end();
}
setInterval(() => {
  for (const zid of Object.keys(ZONES)) fetchZoneHealth(zid);
}, 5000);

const PORT = parseInt(process.env.PORT || '3010', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'central.db');
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';

// === DB 셋업 (central 전용 — players만) ===
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000');
try {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
} catch (e) { console.warn('[central] WAL 실패:', e.message); }

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    player_id     TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    color         TEXT NOT NULL DEFAULT '#5a9ae0',
    password_hash TEXT,
    password_salt TEXT,
    wood          INTEGER NOT NULL DEFAULT 0,
    stone         INTEGER NOT NULL DEFAULT 0,
    tools_json    TEXT DEFAULT '{}',
    equipped      TEXT,
    inventory_json TEXT DEFAULT '{}',
    hunger        INTEGER NOT NULL DEFAULT 100,
    thirst        INTEGER NOT NULL DEFAULT 100,
    violation_points INTEGER NOT NULL DEFAULT 0,
    tribe_id      INTEGER,
    floor         INTEGER NOT NULL DEFAULT 0,
    last_zone     TEXT,
    last_x        REAL,
    last_y        REAL,
    last_seen     INTEGER,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_players_last_zone ON players(last_zone);
  CREATE TABLE IF NOT EXISTS tribes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    leader_id  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  -- Phase 14.9 — 길드 간 전쟁 (War 엔티티). 선포 시점 다이얼 스냅샷.
  CREATE TABLE IF NOT EXISTS wars (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_guild_id  INTEGER NOT NULL,
    defender_guild_id  INTEGER NOT NULL,
    started_at         INTEGER NOT NULL,
    ended_at           INTEGER,
    loot_rate          REAL NOT NULL,
    damage_rate        REAL NOT NULL,
    aggressor_vp_gain  INTEGER NOT NULL,
    tier               TEXT NOT NULL,        -- clean | normal | evil
    declared_by        TEXT NOT NULL         -- player_id
  );
  CREATE INDEX IF NOT EXISTS idx_wars_active ON wars(ended_at);
  CREATE INDEX IF NOT EXISTS idx_wars_attacker ON wars(attacker_guild_id);
  CREATE INDEX IF NOT EXISTS idx_wars_defender ON wars(defender_guild_id);
`);

// 마이그레이션 — 기존 DB에 새 컬럼 없으면 추가
try {
  const cols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!cols.includes('inventory_json')) {
    db.exec("ALTER TABLE players ADD COLUMN inventory_json TEXT DEFAULT '{}'");
    console.log('[central/db] inventory_json 컬럼 추가됨');
  }
  if (!cols.includes('hunger')) {
    db.exec('ALTER TABLE players ADD COLUMN hunger INTEGER NOT NULL DEFAULT 100');
    console.log('[central/db] hunger 컬럼 추가됨');
  }
  if (!cols.includes('thirst')) {
    db.exec('ALTER TABLE players ADD COLUMN thirst INTEGER NOT NULL DEFAULT 100');
    console.log('[central/db] thirst 컬럼 추가됨');
  }
  if (!cols.includes('violation_points')) {
    db.exec('ALTER TABLE players ADD COLUMN violation_points INTEGER NOT NULL DEFAULT 0');
    console.log('[central/db] violation_points 컬럼 추가됨');
  }
  if (!cols.includes('tribe_id')) {
    db.exec('ALTER TABLE players ADD COLUMN tribe_id INTEGER');
    console.log('[central/db] tribe_id 컬럼 추가됨');
  }
  if (!cols.includes('floor')) {
    db.exec('ALTER TABLE players ADD COLUMN floor INTEGER NOT NULL DEFAULT 0');
    console.log('[central/db] floor 컬럼 추가됨');
  }
  // 14.42-a: home_zone / home_x / home_y — 영구 fallback (첫 가입 시 정해짐)
  if (!cols.includes('home_zone')) {
    db.exec('ALTER TABLE players ADD COLUMN home_zone TEXT');
    console.log('[central/db] home_zone 컬럼 추가됨');
  }
  if (!cols.includes('home_x')) {
    db.exec('ALTER TABLE players ADD COLUMN home_x REAL');
    console.log('[central/db] home_x 컬럼 추가됨');
  }
  if (!cols.includes('home_y')) {
    db.exec('ALTER TABLE players ADD COLUMN home_y REAL');
    console.log('[central/db] home_y 컬럼 추가됨');
  }
  // Phase 14.2 — tribes 테이블에 vp + treasury + is_npc + behavior_tier 컬럼
  const tribeCols = db.prepare("PRAGMA table_info(tribes)").all().map(c => c.name);
  if (!tribeCols.includes('vp')) {
    db.exec('ALTER TABLE tribes ADD COLUMN vp REAL NOT NULL DEFAULT 0');
    console.log('[central/db] tribes.vp 컬럼 추가됨');
  }
  if (!tribeCols.includes('vp_updated_at')) {
    db.exec('ALTER TABLE tribes ADD COLUMN vp_updated_at INTEGER NOT NULL DEFAULT 0');
    console.log('[central/db] tribes.vp_updated_at 컬럼 추가됨');
  }
  if (!tribeCols.includes('treasury_json')) {
    db.exec("ALTER TABLE tribes ADD COLUMN treasury_json TEXT NOT NULL DEFAULT '{}'");
    console.log('[central/db] tribes.treasury_json 컬럼 추가됨');
  }
  if (!tribeCols.includes('is_npc')) {
    db.exec('ALTER TABLE tribes ADD COLUMN is_npc INTEGER NOT NULL DEFAULT 0');
    console.log('[central/db] tribes.is_npc 컬럼 추가됨');
  }
  if (!tribeCols.includes('behavior_tier')) {
    db.exec("ALTER TABLE tribes ADD COLUMN behavior_tier TEXT NOT NULL DEFAULT 'player'");
    console.log('[central/db] tribes.behavior_tier 컬럼 추가됨 (player/passive/scripted/strategic)');
  }
} catch (e) { /* 새 DB면 위 CREATE에서 이미 만들어짐 */ }

// === Password hashing (scrypt) ===
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
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// === Prepared statements ===
const stmtGetPlayer = db.prepare('SELECT * FROM players WHERE player_id = ?');
const stmtInsertPlayer = db.prepare(`
  INSERT INTO players (player_id, name, color, password_hash, password_salt, created_at, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtUpdateProfile = db.prepare(`
  UPDATE players SET wood = ?, stone = ?, tools_json = ?, equipped = ?,
    inventory_json = ?, hunger = ?, thirst = ?, violation_points = ?, tribe_id = ?, floor = ?,
    last_zone = ?, last_x = ?, last_y = ?, last_seen = ?, color = ?,
    home_zone = ?, home_x = ?, home_y = ?
  WHERE player_id = ?
`);
const stmtCountPlayers = db.prepare('SELECT COUNT(*) as cnt FROM players');

// === HTTP 유틸 ===
function jsonResp(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}

// === Phase 14.2 — 길드 벌점 lazy 감쇠 ===
// 멤버 합산 X. 길드 row의 독립 컬럼. 시간으로만 감쇠 — 멤버 입출입과 무관.
// 설계 §4.2: 탈퇴/추방으로 세탁 불가. 신규는 N일 미반영 (TODO).
const GUILD_VP_MAX = 200;          // 길드 명성 상한
const GUILD_VP_DECAY_PER_HR = 5;   // 시간당 -5 자동 감쇠 (40시간이면 200→0)
function computeGuildVp(stored, updatedAt, now = Date.now()) {
  const v = Number(stored) || 0;
  const t = Number(updatedAt) || now;
  const hrs = Math.max(0, (now - t) / 3_600_000);
  return Math.max(0, v - GUILD_VP_DECAY_PER_HR * hrs);
}
// 명성 → 약탈률 다이얼 (설계 §5.2)
//  vp < 30  : 청정 — loot 20%, damage 30%, 침략자 +대량 벌점
//  vp < 80  : 보통 — loot 50%, damage 60%, 침략자 +소량
//  vp ≥ 80  : 악성 — loot 80%, damage 100%, 침략자 면제 + 현상금
function warDialFromGuildVp(vp) {
  if (vp < 30) return { tier: 'clean',  lootRate: 0.20, damageRate: 0.30, aggressorVpGain: 40, occupyAllowed: false };
  if (vp < 80) return { tier: 'normal', lootRate: 0.50, damageRate: 0.60, aggressorVpGain: 10, occupyAllowed: false };
  return            { tier: 'evil',   lootRate: 0.80, damageRate: 1.00, aggressorVpGain: 0,  occupyAllowed: true };
}

// === 거래소 ===
const orders = new Map();
let nextOrderId = 1;
function validateItem(s) { return s === 'wood' || s === 'stone'; }

function matchOrUpload(newOrder) {
  const oppositeSide = newOrder.side === 'sell' ? 'buy' : 'sell';
  let remaining = newOrder.amount;
  const matches = [];
  for (const o of orders.values()) {
    if (remaining <= 0) break;
    if (o.side !== oppositeSide) continue;
    if (o.item !== newOrder.item) continue;
    if (o.price_item !== newOrder.price_item) continue;
    if (o.price_amount !== newOrder.price_amount) continue;
    if (o.player_id === newOrder.player_id) continue;
    const matchAmount = Math.min(remaining, o.amount);
    matches.push({ counter: o, amount: matchAmount });
    remaining -= matchAmount;
  }
  for (const m of matches) {
    settle(newOrder, m.counter, m.amount);
    m.counter.amount -= m.amount;
    if (m.counter.amount <= 0) orders.delete(m.counter.id);
  }
  if (remaining > 0) {
    newOrder.amount = remaining;
    orders.set(newOrder.id, newOrder);
  }
  return { matched: newOrder.amount === 0 ? 'full' : (matches.length > 0 ? 'partial' : 'none'), remaining };
}

function settle(newOrder, counter, amount) {
  const sellOrder = newOrder.side === 'sell' ? newOrder : counter;
  const buyOrder  = newOrder.side === 'buy'  ? newOrder : counter;
  const item = sellOrder.item;
  const totalPrice = buyOrder.price_amount * amount;
  const priceItem = buyOrder.price_item;
  const seller = stmtGetPlayer.get(sellOrder.player_id);
  const buyer  = stmtGetPlayer.get(buyOrder.player_id);
  if (seller) {
    const w = seller.wood, s = seller.stone;
    const inv = { wood: w, stone: s };
    inv[priceItem] = (inv[priceItem] || 0) + totalPrice;
    db.prepare('UPDATE players SET wood=?, stone=?, last_seen=? WHERE player_id=?')
      .run(inv.wood, inv.stone, Date.now(), seller.player_id);
  }
  if (buyer) {
    const inv = { wood: buyer.wood, stone: buyer.stone };
    inv[item] = (inv[item] || 0) + amount;
    db.prepare('UPDATE players SET wood=?, stone=?, last_seen=? WHERE player_id=?')
      .run(inv.wood, inv.stone, Date.now(), buyer.player_id);
  }
  console.log(`[central] 체결: ${sellOrder.player_id} → ${buyOrder.player_id} | ${item} ${amount}개 ↔ ${priceItem} ${totalPrice}`);
}

// === HTTP 핸들러 ===
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }
  try {
    // 헬스
    if (req.url === '/health' && req.method === 'GET') {
      return jsonResp(res, 200, {
        ok: true,
        orders: orders.size,
        players: stmtCountPlayers.get().cnt,
        uptime: process.uptime(),
      });
    }
    // === Economy: 전체 마을 상태 ===
    if (req.url === '/economy/villages' && req.method === 'GET') {
      return jsonResp(res, 200, economy.serializeWorld(economyWorld));
    }
    // === Economy: 특정 마을의 가격표 ===
    if (req.url.startsWith('/economy/prices/') && req.method === 'GET') {
      const name = decodeURIComponent(req.url.slice('/economy/prices/'.length));
      const v = economyWorld.villages.find(x => x.name === name);
      if (!v) return jsonResp(res, 404, { error: 'village not found' });
      return jsonResp(res, 200, {
        village: name,
        coord: v.coord,
        pop: v.npcs.length,
        guild: { taxRate: v.guild.taxRate },
        prices: economy.computeVillagePrices(v),
      });
    }
    // === Phase 4a: Canadia 전용 마을 데이터 — zone canadia 서버가 fetch ===
    if (req.url === '/economy/canadia/villages' && req.method === 'GET') {
      return jsonResp(res, 200, economy.serializeWorld(canadiaWorld));
    }
    if (req.url === '/economy/canadia/prices' && req.method === 'GET') {
      const out = canadiaWorld.villages.map(v => ({
        name: v.name,
        coord: v.coord,
        pop: v.npcs.length,
        guild: { taxRate: v.guild.taxRate },
        prices: economy.computeVillagePrices(v),
        storage: v.storage,
        treasury: v.treasury,
      }));
      return jsonResp(res, 200, { day: canadiaWorld.day, villages: out });
    }
    // Phase 4d-3: 최근 거래 로그 (캐러밴 도착 시 기록됨)
    if (req.url === '/economy/canadia/tradelog' && req.method === 'GET') {
      const log = canadiaWorld.tradeLog || [];
      const recent = log.slice(-30).reverse(); // 최신 30개
      return jsonResp(res, 200, { day: canadiaWorld.day, trades: recent });
    }
    // Phase 4d-3: 캐러밴 위치 (이동 중인 행상) — 좌표 보간해서 반환
    if (req.url === '/economy/canadia/caravans' && req.method === 'GET') {
      const day = canadiaWorld.day;
      const out = (canadiaWorld.caravans || []).map(c => {
        let from, to, denom, num;
        if (c.state === 'outbound') {
          from = c.from.coord; to = c.to.coord;
          denom = Math.max(1, c.arriveDay - c.departDay);
          num = day - c.departDay;
        } else { // 'inbound' = 귀환
          from = c.to.coord; to = c.from.coord;
          denom = Math.max(1, c.returnArriveDay - c.arriveDay);
          num = day - c.arriveDay;
        }
        const t = Math.max(0, Math.min(1, num / denom));
        return {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          from: c.from.name, to: c.to.name,
          escort: c.escort,
          giveRes: c.giveRes, wantRes: c.wantRes,
          state: c.state,
        };
      });
      return jsonResp(res, 200, { day, caravans: out });
    }
    // === Economy: 모든 마을 가격 (시세 비교용) ===
    if (req.url === '/economy/prices' && req.method === 'GET') {
      const out = economyWorld.villages.map(v => ({
        name: v.name,
        coord: v.coord,
        pop: v.npcs.length,
        guild: { taxRate: v.guild.taxRate },
        prices: economy.computeVillagePrices(v),
      }));
      return jsonResp(res, 200, { day: economyWorld.day, villages: out });
    }
    // === 클라용: zone 목록 ===
    // dispatcher 역할도 겸함. 클라가 시작할 때 호출.
    if (req.url === '/zones' && req.method === 'GET') {
      const zones = publicZoneMap(PUBLIC_HOST);
      // 각 zone에 인구/cap 정보 첨부 (캐시된 값)
      for (const [zid, z] of Object.entries(zones)) {
        const pop = zonePopulation[zid];
        if (pop) {
          z.population = pop.humans;
          z.cap = pop.cap;
          z.full = pop.humans >= pop.cap;
        } else {
          z.population = null; // 아직 fetch 안 됨
          z.cap = null;
          z.full = false;
        }
      }
      return jsonResp(res, 200, {
        zones,
        central: `${PUBLIC_HOST}:${PORT}`,
      });
    }
    // === 인증 ===
    // POST /auth { username, password, color }
    // → { ok: true, player: {...} }  또는 { ok: false, reason }
    if (req.url === '/auth' && req.method === 'POST') {
      const data = await readBody(req);
      const username = (data.username || '').trim().slice(0, 16);
      const password = data.password || '';
      const color = (typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color)) ? data.color : '#5a9ae0';
      if (!username || !password) return jsonResp(res, 400, { ok: false, reason: 'missing_credentials' });

      // 14.42-a: 신규 가입 시 home_zone과 home_x/home_y 받아서 저장.
      // 기존 계정은 home_zone 무시 (이미 정해진 home 유지).
      const homeZone = (typeof data.home_zone === 'string' && data.home_zone.length <= 32) ? data.home_zone : null;
      const homeX = (typeof data.home_x === 'number') ? data.home_x : null;
      const homeY = (typeof data.home_y === 'number') ? data.home_y : null;

      const existing = stmtGetPlayer.get(username);
      if (existing) {
        if (!existing.password_hash) return jsonResp(res, 200, { ok: false, reason: 'username_taken' });
        if (!verifyPassword(password, existing.password_hash, existing.password_salt))
          return jsonResp(res, 200, { ok: false, reason: 'wrong_password' });
        // 14.42-a 마이그레이션: 기존 계정인데 home_zone 없으면 last_zone 기반으로 자동 할당
        if (!existing.home_zone && existing.last_zone) {
          db.prepare('UPDATE players SET home_zone=?, home_x=?, home_y=? WHERE player_id=?')
            .run(existing.last_zone, existing.last_x, existing.last_y, username);
          existing.home_zone = existing.last_zone;
          existing.home_x = existing.last_x;
          existing.home_y = existing.last_y;
          console.log(`[central] 마이그레이션: ${username} home = ${existing.last_zone}`);
        }
        return jsonResp(res, 200, { ok: true, player: existing, isNew: false });
      }
      // 신규 등록 — home_zone 필수
      if (!homeZone || homeX === null || homeY === null) {
        return jsonResp(res, 200, { ok: false, reason: 'missing_home_zone' });
      }
      const { hash, salt } = hashPassword(password);
      const now = Date.now();
      try {
        stmtInsertPlayer.run(username, username, color, hash, salt, now, now);
        // 신규 가입자에게 home + last_zone 동시 세팅 — 첫 입장은 home에서.
        db.prepare('UPDATE players SET home_zone=?, home_x=?, home_y=?, last_zone=?, last_x=?, last_y=? WHERE player_id=?')
          .run(homeZone, homeX, homeY, homeZone, homeX, homeY, username);
      } catch (e) {
        return jsonResp(res, 200, { ok: false, reason: 'username_taken' });
      }
      const created = stmtGetPlayer.get(username);
      console.log(`[central] 신규 가입: ${username}  home=${homeZone} (${Math.round(homeX)},${Math.round(homeY)})`);
      return jsonResp(res, 200, { ok: true, player: created, isNew: true });
    }
    // === 게스트 username 검증 ===
    // POST /check_username { username } → { taken: bool }
    if (req.url === '/check_username' && req.method === 'POST') {
      const { username } = await readBody(req);
      const u = (username || '').trim();
      const ex = u ? stmtGetPlayer.get(u) : null;
      return jsonResp(res, 200, { taken: !!(ex && ex.password_hash) });
    }
    // === 프로필 조회 ===
    if (req.url.startsWith('/player/') && req.method === 'GET') {
      const id = decodeURIComponent(req.url.slice('/player/'.length));
      const p = stmtGetPlayer.get(id);
      if (!p) return jsonResp(res, 404, { error: 'not found' });
      return jsonResp(res, 200, { player: p });
    }
    // === 프로필 업데이트 (zone 서버가 호출) ===
    // POST /player/:id  body: { wood, stone, tools_json, equipped, last_zone, last_x, last_y, color }
    if (req.url.startsWith('/player/') && req.method === 'POST') {
      const id = decodeURIComponent(req.url.slice('/player/'.length));
      const p = stmtGetPlayer.get(id);
      if (!p) return jsonResp(res, 404, { error: 'not found' });
      const data = await readBody(req);
      stmtUpdateProfile.run(
        data.wood ?? p.wood,
        data.stone ?? p.stone,
        data.tools_json ?? p.tools_json,
        data.equipped ?? p.equipped,
        data.inventory_json ?? p.inventory_json ?? '{}',
        data.hunger ?? p.hunger ?? 100,
        data.thirst ?? p.thirst ?? 100,
        data.violation_points ?? p.violation_points ?? 0,
        data.tribe_id ?? p.tribe_id ?? null,
        data.floor ?? p.floor ?? 0,
        data.last_zone ?? p.last_zone,
        data.last_x ?? p.last_x,
        data.last_y ?? p.last_y,
        Date.now(),
        data.color ?? p.color,
        data.home_zone ?? p.home_zone,
        data.home_x ?? p.home_x,
        data.home_y ?? p.home_y,
        id
      );
      return jsonResp(res, 200, { ok: true });
    }

    // === 거래소 ===
    if (req.url === '/market/orders' && req.method === 'GET') {
      return jsonResp(res, 200, { orders: Array.from(orders.values()) });
    }
    if (req.url === '/market/order' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const side = data.side;
      if (side !== 'sell' && side !== 'buy') return jsonResp(res, 400, { error: 'side 잘못됨' });
      const item = data.item;
      if (!validateItem(item)) return jsonResp(res, 400, { error: 'item 잘못됨' });
      const amount = Math.max(1, +data.amount | 0);
      const priceItem = data.price_item;
      if (!validateItem(priceItem) || priceItem === item) return jsonResp(res, 400, { error: 'price_item 잘못됨' });
      const priceAmount = Math.max(1, +data.price_amount | 0);

      const p = stmtGetPlayer.get(playerId);
      if (!p) return jsonResp(res, 400, { error: '플레이어 없음' });
      if (side === 'sell') {
        if ((p[item] | 0) < amount) return jsonResp(res, 400, { error: `${item} 부족` });
        const inv = { wood: p.wood, stone: p.stone };
        inv[item] -= amount;
        db.prepare('UPDATE players SET wood=?, stone=?, last_seen=? WHERE player_id=?')
          .run(inv.wood, inv.stone, Date.now(), playerId);
      } else {
        const totalCost = priceAmount * amount;
        if ((p[priceItem] | 0) < totalCost) return jsonResp(res, 400, { error: `${priceItem} 부족 (필요 ${totalCost})` });
        const inv = { wood: p.wood, stone: p.stone };
        inv[priceItem] -= totalCost;
        db.prepare('UPDATE players SET wood=?, stone=?, last_seen=? WHERE player_id=?')
          .run(inv.wood, inv.stone, Date.now(), playerId);
      }
      const id = nextOrderId++;
      const newOrder = {
        id, player_id: playerId, side, item, amount,
        price_item: priceItem, price_amount: priceAmount,
        created_at: Date.now(),
      };
      const result = matchOrUpload(newOrder);
      return jsonResp(res, 200, { ok: true, order_id: id, matched: result.matched, remaining: result.remaining });
    }
    if (req.url === '/market/cancel' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const orderId = +data.order_id | 0;
      const o = orders.get(orderId);
      if (!o) return jsonResp(res, 404, { error: '주문 없음' });
      if (o.player_id !== playerId) return jsonResp(res, 403, { error: '본인 주문 아님' });
      const p = stmtGetPlayer.get(playerId);
      if (p) {
        const inv = { wood: p.wood, stone: p.stone };
        if (o.side === 'sell') inv[o.item] += o.amount;
        else inv[o.price_item] += o.price_amount * o.amount;
        db.prepare('UPDATE players SET wood=?, stone=?, last_seen=? WHERE player_id=?')
          .run(inv.wood, inv.stone, Date.now(), playerId);
      }
      orders.delete(orderId);
      return jsonResp(res, 200, { ok: true });
    }

    // === 부족(Tribe) API ===
    if (req.url === '/tribes' && req.method === 'GET') {
      const rows = db.prepare(`
        SELECT t.id, t.name, t.leader_id, t.created_at, t.is_npc, t.behavior_tier, t.vp, t.vp_updated_at, t.treasury_json,
               (SELECT COUNT(*) FROM players WHERE tribe_id = t.id) AS member_count
        FROM tribes t ORDER BY t.id
      `).all();
      // lazy vp decay 적용 (조회 시점에 계산)
      const now = Date.now();
      for (const r of rows) r.vp = computeGuildVp(r.vp, r.vp_updated_at, now);
      return jsonResp(res, 200, { tribes: rows });
    }
    if (req.url.startsWith('/tribe/') && req.method === 'GET') {
      const id = parseInt(req.url.slice('/tribe/'.length), 10);
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(id);
      if (!t) return jsonResp(res, 404, { error: 'not found' });
      const members = db.prepare('SELECT player_id, name, color FROM players WHERE tribe_id = ?').all(id);
      // lazy vp decay
      t.vp = computeGuildVp(t.vp, t.vp_updated_at, Date.now());
      let treasury = {}; try { treasury = JSON.parse(t.treasury_json || '{}'); } catch (e) {}
      return jsonResp(res, 200, { tribe: t, members, treasury });
    }
    // Phase 14.2 — 길드 vp 부과 (zone에서 호출): 멤버 악행 시 길드도 가산
    if (req.url === '/tribe/add_vp' && req.method === 'POST') {
      const data = await readBody(req);
      const tribeId = parseInt(data.tribe_id, 10);
      const amount = parseFloat(data.amount) || 0;
      const reason = (data.reason || 'unspecified').slice(0, 50);
      if (!tribeId || amount === 0) return jsonResp(res, 400, { error: 'bad params' });
      const t = db.prepare('SELECT vp, vp_updated_at FROM tribes WHERE id = ?').get(tribeId);
      if (!t) return jsonResp(res, 404, { error: 'tribe not found' });
      const now = Date.now();
      const cur = computeGuildVp(t.vp, t.vp_updated_at, now);
      const next = Math.max(0, Math.min(GUILD_VP_MAX, cur + amount));
      db.prepare('UPDATE tribes SET vp = ?, vp_updated_at = ? WHERE id = ?').run(next, now, tribeId);
      console.log(`[central] tribe ${tribeId} vp: ${cur.toFixed(1)} → ${next.toFixed(1)} (+${amount} ${reason})`);
      return jsonResp(res, 200, { ok: true, vp: next });
    }
    // Phase 14.2 — 길드 금고 입출금 (zone에서 호출)
    if (req.url === '/tribe/treasury' && req.method === 'POST') {
      const data = await readBody(req);
      const tribeId = parseInt(data.tribe_id, 10);
      const delta = data.delta || {}; // { wood: 5, stone: -2 } 등
      if (!tribeId) return jsonResp(res, 400, { error: 'bad params' });
      const t = db.prepare('SELECT treasury_json FROM tribes WHERE id = ?').get(tribeId);
      if (!t) return jsonResp(res, 404, { error: 'tribe not found' });
      let tr = {}; try { tr = JSON.parse(t.treasury_json || '{}'); } catch (e) {}
      for (const [k, v] of Object.entries(delta)) {
        tr[k] = Math.max(0, (tr[k] || 0) + (parseInt(v, 10) || 0));
      }
      db.prepare('UPDATE tribes SET treasury_json = ? WHERE id = ?').run(JSON.stringify(tr), tribeId);
      return jsonResp(res, 200, { ok: true, treasury: tr });
    }
    // === Phase 14.9: War API ===
    // 활성 전쟁 목록 (ended_at IS NULL)
    if (req.url === '/wars/active' && req.method === 'GET') {
      const wars = db.prepare(`
        SELECT w.*, a.name AS attacker_name, d.name AS defender_name
        FROM wars w
        JOIN tribes a ON a.id = w.attacker_guild_id
        JOIN tribes d ON d.id = w.defender_guild_id
        WHERE w.ended_at IS NULL
        ORDER BY w.started_at DESC
      `).all();
      return jsonResp(res, 200, { wars });
    }
    // 선전포고 — 명분(상대 vp) 스냅샷 + 다이얼 적용
    if (req.url === '/war/declare' && req.method === 'POST') {
      const data = await readBody(req);
      const attackerId = parseInt(data.attacker_guild_id, 10);
      const defenderId = parseInt(data.defender_guild_id, 10);
      const declaredBy = data.declared_by || 'unknown';
      if (!attackerId || !defenderId || attackerId === defenderId) {
        return jsonResp(res, 400, { error: 'bad guild ids' });
      }
      const attacker = db.prepare('SELECT * FROM tribes WHERE id = ?').get(attackerId);
      const defender = db.prepare('SELECT * FROM tribes WHERE id = ?').get(defenderId);
      if (!attacker || !defender) return jsonResp(res, 404, { error: 'guild not found' });
      // 권한 — leader만 선포 (NPC 길드는 leader가 npc_leader라 admin override 필요. 일단 통과)
      // 중복 활성 전쟁 차단
      const existing = db.prepare(`SELECT id FROM wars WHERE ended_at IS NULL AND
        ((attacker_guild_id = ? AND defender_guild_id = ?) OR (attacker_guild_id = ? AND defender_guild_id = ?))`)
        .get(attackerId, defenderId, defenderId, attackerId);
      if (existing) return jsonResp(res, 400, { error: '이미 전쟁 중' });
      // 다이얼 — 피해자 vp 기준 (스냅샷)
      const defVp = computeGuildVp(defender.vp, defender.vp_updated_at, Date.now());
      const dial = warDialFromGuildVp(defVp);
      const now = Date.now();
      const r = db.prepare(`INSERT INTO wars
        (attacker_guild_id, defender_guild_id, started_at, loot_rate, damage_rate, aggressor_vp_gain, tier, declared_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(attackerId, defenderId, now, dial.lootRate, dial.damageRate, dial.aggressorVpGain, dial.tier, declaredBy);
      const warId = Number(r.lastInsertRowid);
      console.log(`[central] ⚔️ 전쟁 선포: [${attacker.name}] → [${defender.name}] (tier=${dial.tier}, loot=${dial.lootRate}, damage=${dial.damageRate}, agg_vp=${dial.aggressorVpGain})`);
      // 청정 침략이면 침략자 길드 vp 폭증
      if (dial.aggressorVpGain > 0) {
        const aNow = Date.now();
        const cur = computeGuildVp(attacker.vp, attacker.vp_updated_at, aNow);
        const next = Math.min(GUILD_VP_MAX, cur + dial.aggressorVpGain);
        db.prepare('UPDATE tribes SET vp = ?, vp_updated_at = ? WHERE id = ?').run(next, aNow, attackerId);
        console.log(`[central] 침략자 ${attacker.name} 길드 vp ${cur.toFixed(1)} → ${next.toFixed(1)} (+${dial.aggressorVpGain})`);
      }
      return jsonResp(res, 200, { ok: true, war_id: warId, tier: dial.tier, loot_rate: dial.lootRate, damage_rate: dial.damageRate });
    }
    // 종전
    if (req.url === '/war/end' && req.method === 'POST') {
      const data = await readBody(req);
      const warId = parseInt(data.war_id, 10);
      if (!warId) return jsonResp(res, 400, { error: 'war_id required' });
      const r = db.prepare('UPDATE wars SET ended_at = ? WHERE id = ? AND ended_at IS NULL')
        .run(Date.now(), warId);
      if (r.changes === 0) return jsonResp(res, 404, { error: 'war not found or already ended' });
      console.log(`[central] ⚔️→🕊️ 전쟁 종료: war_id=${warId}`);
      return jsonResp(res, 200, { ok: true });
    }

    // Phase 14.4 — NPC 길드 upsert (zone 부팅 시 마을을 1급 길드로 등록)
    if (req.url === '/tribe/npc_upsert' && req.method === 'POST') {
      const data = await readBody(req);
      const name = (data.name || '').trim().slice(0, 30);
      const tier = ['passive', 'scripted', 'strategic'].includes(data.tier) ? data.tier : 'passive';
      if (!name) return jsonResp(res, 400, { error: 'name required' });
      let t = db.prepare('SELECT * FROM tribes WHERE name = ?').get(name);
      if (!t) {
        const r = db.prepare('INSERT INTO tribes (name, leader_id, created_at, is_npc, behavior_tier) VALUES (?, ?, ?, 1, ?)').run(name, 'npc_leader', Date.now(), tier);
        t = { id: Number(r.lastInsertRowid), name, leader_id: 'npc_leader', is_npc: 1, behavior_tier: tier };
        console.log(`[central] NPC 길드 등록: ${name} (id=${t.id}, tier=${tier})`);
      } else if (t.behavior_tier !== tier) {
        db.prepare('UPDATE tribes SET behavior_tier = ?, is_npc = 1 WHERE id = ?').run(tier, t.id);
      }
      return jsonResp(res, 200, { ok: true, tribe_id: t.id, name: t.name, behavior_tier: tier });
    }
    if (req.url === '/tribe/create' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const name = (data.name || '').trim().slice(0, 20);
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      if (!name) return jsonResp(res, 400, { error: '길드 이름 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p) return jsonResp(res, 404, { error: 'player not found' });
      if (p.tribe_id) return jsonResp(res, 400, { error: '이미 길드에 소속됨 — 먼저 탈퇴' });
      try {
        const r = db.prepare('INSERT INTO tribes (name, leader_id, created_at) VALUES (?, ?, ?)').run(name, playerId, Date.now());
        const newId = Number(r.lastInsertRowid);
        db.prepare('UPDATE players SET tribe_id = ? WHERE player_id = ?').run(newId, playerId);
        console.log(`[central] 길드 생성: ${name} (id=${newId}) leader=${playerId}`);
        return jsonResp(res, 200, { ok: true, tribe_id: newId, name });
      } catch (e) {
        return jsonResp(res, 400, { error: '같은 이름 길드 존재 (' + e.message + ')' });
      }
    }
    if (req.url === '/tribe/join' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const tribeId = parseInt(data.tribe_id, 10);
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p) return jsonResp(res, 404, { error: 'player not found' });
      if (p.tribe_id) return jsonResp(res, 400, { error: '이미 길드에 소속됨' });
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(tribeId);
      if (!t) return jsonResp(res, 404, { error: '길드 없음' });
      db.prepare('UPDATE players SET tribe_id = ? WHERE player_id = ?').run(tribeId, playerId);
      let promoted = false;
      // Phase 14.11 — NPC 길드의 첫 인간 멤버는 자동으로 leader가 됨 (설계 §7.3)
      if (t.is_npc && t.leader_id === 'npc_leader') {
        const humanCount = db.prepare(`SELECT COUNT(*) AS cnt FROM players WHERE tribe_id = ? AND player_id NOT LIKE 'npc_%' AND player_id NOT LIKE 'anon_%'`).get(tribeId).cnt;
        if (humanCount === 1) { // 방금 가입한 이 사람이 첫 인간
          db.prepare('UPDATE tribes SET leader_id = ? WHERE id = ?').run(playerId, tribeId);
          promoted = true;
          console.log(`[central] 👑 NPC 길드 [${t.name}] 운영권 인수: ${playerId}`);
        }
      }
      console.log(`[central] 길드 가입: ${playerId} → ${t.name}${promoted ? ' (leader 인수)' : ''}`);
      return jsonResp(res, 200, { ok: true, tribe_id: tribeId, name: t.name, promoted });
    }
    if (req.url === '/tribe/leave' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p || !p.tribe_id) return jsonResp(res, 400, { error: '길드 소속 아님' });
      const tribeId = p.tribe_id;
      db.prepare('UPDATE players SET tribe_id = NULL WHERE player_id = ?').run(playerId);
      // leader가 탈퇴하고 남은 멤버 없으면 부족 자체 삭제
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(tribeId);
      const remaining = db.prepare('SELECT COUNT(*) AS cnt FROM players WHERE tribe_id = ?').get(tribeId).cnt;
      if (t && t.leader_id === playerId) {
        if (remaining === 0) {
          db.prepare('DELETE FROM tribes WHERE id = ?').run(tribeId);
          console.log(`[central] 길드 해체: ${t.name} (멤버 없음)`);
        } else {
          // leader 이양 — 가장 일찍 가입한 멤버 (created_at 기준 player)
          const next = db.prepare('SELECT player_id FROM players WHERE tribe_id = ? ORDER BY created_at LIMIT 1').get(tribeId);
          if (next) db.prepare('UPDATE tribes SET leader_id = ? WHERE id = ?').run(next.player_id, tribeId);
        }
      }
      console.log(`[central] 길드 탈퇴: ${playerId} ← ${t?.name || tribeId}`);
      return jsonResp(res, 200, { ok: true });
    }

    // 정적 파일 — index.html, client.js, style.css (dispatcher가 하던 일)
    if (req.method === 'GET') {
      let urlPath = req.url === '/' ? '/index.html' : req.url;
      // /zones, /auth 등은 위에서 처리됨. 여기는 정적.
      const filePath = path.join(__dirname, '..', 'public', urlPath);
      if (filePath.startsWith(path.join(__dirname, '..', 'public')) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.ico':'image/x-icon' }[ext] || 'application/octet-stream';
        // 캐시 끄기 — 개발 중이라 매 deploy마다 새 파일 받게
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error('[central] error:', e);
    jsonResp(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[central] 🏛️ central server up on :${PORT}  publicHost=${PUBLIC_HOST}  db=${DB_PATH}`);
});

// === Phase 14.12: Strategic NPC 의사결정 (utility AI) ===
// 효용 함수 기반 — 매 30분 1회. behavior_tier='strategic'인 길드만.
// 안전상 DEFAULT OFF (env STRATEGIC_AI=1 또는 마을이 strategic으로 승격되면 발동).
// 의사결정: 약한 (vp 높은) 이웃 길드에게 전쟁 선포 검토.
//   효용 = (상대 vp / 200) × 0.7 + (1 - 내 vp / 200) × 0.3
//   임계 0.6 이상이면 선포. — 청정 길드는 선포 안 함 (자기 vp 낮으면 효용 낮음).
const STRATEGIC_AI_ENABLED = process.env.STRATEGIC_AI === '1';
const STRATEGIC_TICK_MS = 30 * 60 * 1000;
function utilityForWar(attackerVp, defenderVp) {
  // 0~1 점수. 상대가 악성일수록, 내가 청정일수록 (정의구현 명분) 점수 ↑.
  return Math.min(1.0, (defenderVp / 200) * 0.7 + (1 - attackerVp / 200) * 0.3);
}
function strategicTick() {
  if (!STRATEGIC_AI_ENABLED) return;
  try {
    const strategic = db.prepare(`SELECT * FROM tribes WHERE is_npc=1 AND behavior_tier='strategic'`).all();
    if (strategic.length === 0) return;
    const all = db.prepare(`SELECT id, name, vp, vp_updated_at FROM tribes`).all();
    const now = Date.now();
    for (const a of strategic) {
      const aVp = computeGuildVp(a.vp, a.vp_updated_at, now);
      // 이미 전쟁 중이면 skip
      const inWar = db.prepare(`SELECT 1 FROM wars WHERE ended_at IS NULL AND (attacker_guild_id=? OR defender_guild_id=?)`).get(a.id, a.id);
      if (inWar) continue;
      // 가장 효용 높은 표적
      let bestTarget = null, bestU = 0;
      for (const d of all) {
        if (d.id === a.id) continue;
        const dVp = computeGuildVp(d.vp, d.vp_updated_at, now);
        const u = utilityForWar(aVp, dVp);
        if (u > bestU) { bestU = u; bestTarget = d; }
      }
      if (bestTarget && bestU > 0.6) {
        // 선포!
        const dial = warDialFromGuildVp(computeGuildVp(bestTarget.vp, bestTarget.vp_updated_at, now));
        db.prepare(`INSERT INTO wars (attacker_guild_id, defender_guild_id, started_at, loot_rate, damage_rate, aggressor_vp_gain, tier, declared_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'strategic_ai')`)
          .run(a.id, bestTarget.id, now, dial.lootRate, dial.damageRate, dial.aggressorVpGain, dial.tier);
        console.log(`[central] 🤖⚔️ strategic AI [${a.name}] → [${bestTarget.name}] 선포 (utility=${bestU.toFixed(2)}, tier=${dial.tier})`);
      }
    }
  } catch (e) { console.error('[central] strategic tick error:', e); }
}
setInterval(strategicTick, STRATEGIC_TICK_MS);
if (STRATEGIC_AI_ENABLED) console.log('[central] 🤖 strategic NPC AI ON (30분 tick)');
else console.log('[central] 🤖 strategic NPC AI OFF (STRATEGIC_AI=1로 enable)');

// Graceful shutdown
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.log(`[central] ${sig} 받음 — 종료`);
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
