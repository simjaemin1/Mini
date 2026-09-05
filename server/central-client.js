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

async function authenticate(username, password, color, homeZone = null, homeX = null, homeY = null) {
  const r = await request('POST', '/auth', {
    username, password, color,
    home_zone: homeZone, home_x: homeX, home_y: homeY,
  });
  return r.data;
}

// ★★[2026-08-03f 배치 13] 게스트 영속 신원 — 토큰을 주면 같은 playerId, 없으면 새로 발급.
//   ⚠반환값의 `token` 은 **클라에게 한 번 보내는 것 말고는 어디에도 쓰지 않는다.**
//     로그·알림·채팅에 절대 찍지 마라(토큰 유출 = 계정 탈취).
async function guestIdentity(token) {
  const r = await request('POST', '/guest', { token: token || null });
  return r.data;
}

// ★★[2026-08-03g 배치 14 ①] 게스트 → 등록 계정 **승계**. playerId 가 안 바뀌므로 소유가 유지된다.
//   반환의 `reason`:
//     · `username_taken`  — 남의 계정 이름 ⇒ 호출부가 막는다
//     · `not_promotable` — 승계 대상이 아니다 ⇒ 호출부가 **막지 말고** 평소 로그인으로 흘려야 한다
async function promoteGuest(token, username, password, color, homeZone = null, homeX = null, homeY = null) {
  const r = await request('POST', '/promote', {
    token: token || null, username, password, color,
    home_zone: homeZone, home_x: homeX, home_y: homeY,
  });
  return r.data;
}

async function checkUsernameTaken(username) {
  const r = await request('POST', '/check_username', { username });
  return r.data?.taken;
}

// ★★[T115 2026-09-05] 친구 — 존이 central 에 묻는 문 셋.
//   ⚠**못 물어보면 막지 않는다**(T19 규약 그대로): central 이 잠깐 안 뜬 것을 사람의 죄로 삼지 않는다.
//     그래서 실패는 예외가 아니라 **빈 답**으로 접는다 — 호출부가 매번 try 를 쓰지 않게.
async function friendRequest(playerId, name) {
  try { const r = await request('POST', '/friend/req', { player_id: playerId, name }); return r.data || { ok: false, reason: 'down' }; }
  catch (e) { return { ok: false, reason: 'down' }; }
}
async function friendRemove(playerId, name) {
  try { const r = await request('POST', '/friend/del', { player_id: playerId, name }); return r.data || { ok: false, reason: 'down' }; }
  catch (e) { return { ok: false, reason: 'down' }; }
}
async function friendsOf(playerId) {
  try {
    const r = await request('GET', `/friends/${encodeURIComponent(playerId)}`);
    return (r.status === 200 && r.data && Array.isArray(r.data.friends)) ? r.data.friends : null;
  } catch (e) { return null; }        // ★null = "못 물어봤다"(빈 목록과 다르다 — 호출부가 가른다)
}
/** 이름으로 — **시작 화면 전용**. 돌려받는 건 id 뿐이다(central 주석 참조). */
async function friendsOfName(name) {
  try {
    const r = await request('GET', `/friends/${encodeURIComponent(name)}?by=name`);
    return (r.status === 200 && r.data && Array.isArray(r.data.friends)) ? r.data.friends : null;
  } catch (e) { return null; }
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
  guestIdentity, promoteGuest,   // ★[배치 13] 게스트 영속 신원 · ★[배치 14] 승계
  friendRequest, friendRemove, friendsOf, friendsOfName,   // ★[T115] 친구 — 문 셋(실패는 빈 답)
  tribeAddVp, tribeTreasury, tribeNpcUpsert, getTribe };
