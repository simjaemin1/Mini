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
    inventory_json = ?, hunger = ?, thirst = ?, violation_points = ?, tribe_id = ?,
    last_zone = ?, last_x = ?, last_y = ?, last_seen = ?, color = ?
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
    // === 클라용: zone 목록 ===
    // dispatcher 역할도 겸함. 클라가 시작할 때 호출.
    if (req.url === '/zones' && req.method === 'GET') {
      return jsonResp(res, 200, {
        zones: publicZoneMap(PUBLIC_HOST),
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

      const existing = stmtGetPlayer.get(username);
      if (existing) {
        if (!existing.password_hash) return jsonResp(res, 200, { ok: false, reason: 'username_taken' });
        if (!verifyPassword(password, existing.password_hash, existing.password_salt))
          return jsonResp(res, 200, { ok: false, reason: 'wrong_password' });
        return jsonResp(res, 200, { ok: true, player: existing, isNew: false });
      }
      // 신규 등록
      const { hash, salt } = hashPassword(password);
      const now = Date.now();
      try {
        stmtInsertPlayer.run(username, username, color, hash, salt, now, now);
      } catch (e) {
        return jsonResp(res, 200, { ok: false, reason: 'username_taken' });
      }
      const created = stmtGetPlayer.get(username);
      console.log(`[central] 신규 가입: ${username}`);
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
        data.last_zone ?? p.last_zone,
        data.last_x ?? p.last_x,
        data.last_y ?? p.last_y,
        Date.now(),
        data.color ?? p.color,
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
        SELECT t.id, t.name, t.leader_id, t.created_at,
               (SELECT COUNT(*) FROM players WHERE tribe_id = t.id) AS member_count
        FROM tribes t ORDER BY t.id
      `).all();
      return jsonResp(res, 200, { tribes: rows });
    }
    if (req.url.startsWith('/tribe/') && req.method === 'GET') {
      const id = parseInt(req.url.slice('/tribe/'.length), 10);
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(id);
      if (!t) return jsonResp(res, 404, { error: 'not found' });
      const members = db.prepare('SELECT player_id, name, color FROM players WHERE tribe_id = ?').all(id);
      return jsonResp(res, 200, { tribe: t, members });
    }
    if (req.url === '/tribe/create' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const name = (data.name || '').trim().slice(0, 20);
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      if (!name) return jsonResp(res, 400, { error: '부족 이름 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p) return jsonResp(res, 404, { error: 'player not found' });
      if (p.tribe_id) return jsonResp(res, 400, { error: '이미 부족에 소속됨 — 먼저 탈퇴' });
      try {
        const r = db.prepare('INSERT INTO tribes (name, leader_id, created_at) VALUES (?, ?, ?)').run(name, playerId, Date.now());
        const newId = Number(r.lastInsertRowid);
        db.prepare('UPDATE players SET tribe_id = ? WHERE player_id = ?').run(newId, playerId);
        console.log(`[central] 부족 생성: ${name} (id=${newId}) leader=${playerId}`);
        return jsonResp(res, 200, { ok: true, tribe_id: newId, name });
      } catch (e) {
        return jsonResp(res, 400, { error: '같은 이름 부족 존재 (' + e.message + ')' });
      }
    }
    if (req.url === '/tribe/join' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const tribeId = parseInt(data.tribe_id, 10);
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p) return jsonResp(res, 404, { error: 'player not found' });
      if (p.tribe_id) return jsonResp(res, 400, { error: '이미 부족에 소속됨' });
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(tribeId);
      if (!t) return jsonResp(res, 404, { error: '부족 없음' });
      db.prepare('UPDATE players SET tribe_id = ? WHERE player_id = ?').run(tribeId, playerId);
      console.log(`[central] 부족 가입: ${playerId} → ${t.name}`);
      return jsonResp(res, 200, { ok: true, tribe_id: tribeId, name: t.name });
    }
    if (req.url === '/tribe/leave' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const p = stmtGetPlayer.get(playerId);
      if (!p || !p.tribe_id) return jsonResp(res, 400, { error: '부족 소속 아님' });
      const tribeId = p.tribe_id;
      db.prepare('UPDATE players SET tribe_id = NULL WHERE player_id = ?').run(playerId);
      // leader가 탈퇴하고 남은 멤버 없으면 부족 자체 삭제
      const t = db.prepare('SELECT * FROM tribes WHERE id = ?').get(tribeId);
      const remaining = db.prepare('SELECT COUNT(*) AS cnt FROM players WHERE tribe_id = ?').get(tribeId).cnt;
      if (t && t.leader_id === playerId) {
        if (remaining === 0) {
          db.prepare('DELETE FROM tribes WHERE id = ?').run(tribeId);
          console.log(`[central] 부족 해체: ${t.name} (멤버 없음)`);
        } else {
          // leader 이양 — 가장 일찍 가입한 멤버 (created_at 기준 player)
          const next = db.prepare('SELECT player_id FROM players WHERE tribe_id = ? ORDER BY created_at LIMIT 1').get(tribeId);
          if (next) db.prepare('UPDATE tribes SET leader_id = ? WHERE id = ?').run(next.player_id, tribeId);
        }
      }
      console.log(`[central] 부족 탈퇴: ${playerId} ← ${t?.name || tribeId}`);
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
        res.writeHead(200, { 'Content-Type': mime });
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

// Graceful shutdown
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.log(`[central] ${sig} 받음 — 종료`);
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
