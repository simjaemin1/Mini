// === Central 서버 HTTP 클라이언트 ===
// zone 서버가 central에 인증/프로필 호출할 때 사용.

const http = require('http');
const https = require('https');
const { CENTRAL } = require('./zone-config');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const proto = CENTRAL.proto === 'https' ? https : http;
    const opts = {
      host: CENTRAL.host,
      port: CENTRAL.port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    };
    const req = proto.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('central timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function authenticate(username, password, color) {
  const r = await request('POST', '/auth', { username, password, color });
  return r.data;
}

async function checkUsernameTaken(username) {
  const r = await request('POST', '/check_username', { username });
  return r.data?.taken;
}

async function getPlayer(playerId) {
  const r = await request('GET', `/player/${encodeURIComponent(playerId)}`);
  return r.status === 200 ? r.data.player : null;
}

async function updatePlayer(playerId, patch) {
  const r = await request('POST', `/player/${encodeURIComponent(playerId)}`, patch);
  return r.data;
}

// Phase 14.2 — 길드 vp/treasury/npc upsert
async function tribeAddVp(tribeId, amount, reason) {
  const r = await request('POST', '/tribe/add_vp', { tribe_id: tribeId, amount, reason });
  return r.data;
}
async function tribeTreasury(tribeId, delta) {
  const r = await request('POST', '/tribe/treasury', { tribe_id: tribeId, delta });
  return r.data;
}
async function tribeNpcUpsert(name, tier) {
  const r = await request('POST', '/tribe/npc_upsert', { name, tier });
  return r.data;
}
async function getTribe(id) {
  const r = await request('GET', `/tribe/${id}`);
  return r.status === 200 ? r.data : null;
}

module.exports = { authenticate, checkUsernameTaken, getPlayer, updatePlayer, request,
  tribeAddVp, tribeTreasury, tribeNpcUpsert, getTribe };
