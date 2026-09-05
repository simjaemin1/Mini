// === server/friends.js — 친구: 서로 수락한 쌍 (T115) ============================
//
// ★[재민 확정 2026-09-05 · T115 · T23 소셜 첫 칸] 회부 `회부_온보딩_다음층.md` A-1.
//
// ★★이 모듈의 규약 넉 줄
//   ① **정본은 central 의 `friends` 표 하나다.** 여기 있는 것은 **캐시와 말**뿐이다.
//      쌍의 정렬·요청/수락 판정은 전부 central 이 한다(`friendRequest`) — 여기서 다시 풀면 그게 사본이다.
//   ② **못 물어보면 막지 않는다.** central 이 잠깐 안 뜬 것을 사람의 죄로 삼지 않는다(T19 규약).
//      ⇒ 목록을 못 물으면 `null` 이고, 그건 "친구 없음"과 **다른 값**이다. 화면은 표지를 안 붙일 뿐
//        로그인·이동·시작은 **한 군데도 안 막힌다**.
//   ③ **새 패널 0 · 새 클라 조건 0.** 통로는 채팅 명령 하나다(T11 `/소속` · T19 `/이방인` 선례).
//   ④ **게임 행동 변경 0.** 친구는 지금 **표시와 시작 안내**만 바꾼다. 전투·거래·이동에 한 줄도 안 닿는다.
//
// ★왜 명령이 하나인가 — `/친구 <이름>` 한 줄의 뜻은 언제나 같다: *"나는 너와 친구가 되겠다."*
//   상대가 이미 같은 말을 해 뒀으면 그게 **수락**이고, 아니면 **요청**이 남는다. 수락 전용 명령을 따로
//   두면 "요청이 왔다는 걸 어떻게 알리나"라는 알림 층이 딸려 오고, 그건 이 카드가 아니다(회부).
'use strict';

const CFG = {
  TTL_MS: 30000,          // 친구 목록 캐시 수명 — 수락은 즉시 반영되고(아래 `_bust`) 그 밖엔 이 창이다
};

let H = null;
function init(hooks) { H = hooks || null; }
function ready() { return !!(H && H.central); }

// ── 캐시 — playerId → { ids:Set, names:Map, at, ok } ─────────────────────────
//   ⚠`ok:false` 는 **못 물어봤다**는 뜻이다(빈 친구 목록이 아니다). 둘을 같은 값으로 접으면
//     central 이 죽은 날 화면이 "친구가 없다"고 **거짓말**을 한다.
const _cache = new Map();
const _byName = new Map();      // name → { vids: Map, at, pending } — 시작 화면 갈래
function _bust(...ids) { for (const id of ids) if (id) _cache.delete(String(id)); }
// ★★버리기만 하면 **표지가 안 붙는다.** 이름표 1비트는 틱 경로라 **동기 조회**(`knownIds`)를 쓰는데,
//   캐시를 지우기만 하면 그 조회가 "모른다"를 답하고 그건 화면에서 "벗이 아니다"와 같아 보인다.
//   ⇒ 버리고 **곧바로 다시 물은 뒤에** 이름표를 새로 내보낸다(1차 실장이 여기서 틀렸다 — ③이 잡았다).
async function _reload(...ids) {
  _bust(...ids);
  //   ★이름 갈래도 통째로 버린다 — 로그인 때 데워 둔 답이 **친구가 생기기 전**의 것이라,
  //     그대로 두면 TTL 이 끝날 때까지 시작 화면이 "벗 없음"이라고 **거짓말**을 한다(하네스 ④가 잡았다).
  //     표가 작아 통째로 버려도 값이 싸다 — 이름→id 대응을 여기서 들고 있지 않기에 이게 정확하다.
  _byName.clear();
  await Promise.all(ids.filter(Boolean).map((id) => load(id, true).catch(() => null)));
}

async function load(playerId, force) {
  const id = String(playerId || '');
  if (!id || !ready()) return null;
  const hit = _cache.get(id);
  if (!force && hit && Date.now() - hit.at < CFG.TTL_MS) return hit;
  const rows = await H.central.friendsOf(id);
  if (rows == null) {                         // central 을 못 물어봤다 — 옛 값이 있으면 그거라도 쓴다
    if (hit) return hit;
    const miss = { ids: new Set(), names: new Map(), at: Date.now(), ok: false };
    _cache.set(id, miss);
    return miss;
  }
  const rec = { ids: new Set(), names: new Map(), at: Date.now(), ok: true };
  for (const r of rows) { if (r && r.id) { rec.ids.add(String(r.id)); rec.names.set(String(r.id), r.name || ''); } }
  _cache.set(id, rec);
  return rec;
}
/** 지금 아는 친구 집합(안 물어봤으면 빈 집합) — **동기**다. 틱 경로가 부르는 자리라 기다릴 수 없다. */
function knownIds(playerId) {
  const rec = _cache.get(String(playerId || ''));
  return rec ? rec.ids : null;
}
/** 그 둘이 친구인가 — 보는 사람 기준. 모르면 `false`(표지를 안 붙일 뿐이다). */
function isFriend(viewerPlayerId, otherPlayerId) {
  const s = knownIds(viewerPlayerId);
  return !!(s && otherPlayerId && s.has(String(otherPlayerId)));
}

// ── 채팅 명령 ────────────────────────────────────────────────────────────────
//   `/친구`            — 지금 친구가 누구인가
//   `/친구 <이름>`      — 친구가 되자고 한다(상대가 이미 그랬으면 그 자리에서 성립)
//   `/친구 끊기 <이름>` — 끊는다(요청만 있어도 지운다)
function handleChat(player, text) {
  if (!player) return false;
  const t = String(text || '').trim();
  if (!t.startsWith('/친구')) return false;
  const say = (m) => { try { if (H && H.send && player.ws) H.send(player.ws, { type: 'notice', text: m }); } catch (e) {} };
  if (!ready()) { say('🙋 친구는 지금 물어볼 수 없다'); return true; }
  const arg = t.slice('/친구'.length).trim();
  const me = player.playerId;
  if (!me) { say('🙋 손님은 아직 친구를 맺을 수 없다'); return true; }

  if (!arg) {                                   // 목록
    load(me, true).then((rec) => {
      if (!rec || !rec.ok) { say('🙋 친구 목록을 지금 못 물어봤다 — 잠시 뒤 다시'); return; }
      const names = [...rec.names.values()].filter(Boolean);
      say(names.length ? `🙋 벗 ${names.length}명 — ${names.join(' · ')}` : '🙋 아직 벗이 없다 — `/친구 <이름>` 으로 청하게');
    }).catch(() => {});
    return true;
  }
  if (arg.startsWith('끊기')) {
    const name = arg.slice('끊기'.length).trim();
    if (!name) { say('🙋 누구와 끊는가 — `/친구 끊기 <이름>`'); return true; }
    H.central.friendRemove(me, name).then(async (r) => {
      if (!r || !r.ok) { say(r && r.reason === 'no_such_name' ? `🙋 '${name}' 은 없는 이름이다` : '🙋 지금은 못 끊었다 — 잠시 뒤 다시'); return; }
      await _reload(me, r.player_id);
      if (H.refreshTags) H.refreshTags(me, r.player_id);
      say(r.had ? `🙋 ${r.name} 과(와) 벗을 끊었다` : `🙋 ${r.name} 과(와)는 원래 벗이 아니었다`);
      if (r.wasFriend && H.tellPlayer) H.tellPlayer(r.player_id, `🙋 ${player.name} 과(와) 벗을 끊었다`);
    }).catch(() => say('🙋 지금은 못 끊었다 — 잠시 뒤 다시'));
    return true;
  }
  const name = arg;
  H.central.friendRequest(me, name).then(async (r) => {
    if (!r || !r.ok) {
      say(r && r.reason === 'no_such_name' ? `🙋 '${name}' 은 없는 이름이다`
        : r && r.reason === 'self' ? '🙋 자기 자신과는 벗이 될 수 없다'
        : '🙋 지금은 못 청했다 — 잠시 뒤 다시');
      return;
    }
    if (r.state === 'accepted') {
      await _reload(me, r.player_id);
      if (H.refreshTags) H.refreshTags(me, r.player_id);
      say(`🙋 ${r.name} 과(와) 벗이 되었다`);
      // 상대에게도 알린다 — **접속 중일 때만**. 알림함은 이 카드가 아니다(회부).
      if (H.tellPlayer) H.tellPlayer(r.player_id, `🙋 ${player.name} 과(와) 벗이 되었다`);
    } else if (r.state === 'already_friends') say(`🙋 ${r.name} 과(와)는 이미 벗이다`);
    else if (r.state === 'already_requested') say(`🙋 ${r.name} 에게 이미 청해 두었다 — 상대가 같은 말을 하면 성립한다`);
    else {
      say(`🙋 ${r.name} 에게 벗이 되자고 청했다 — 상대도 \`/친구 ${player.name}\` 이라 하면 성립한다`);
      if (H.tellPlayer) H.tellPlayer(r.player_id, `🙋 ${player.name} 이(가) 벗이 되자고 청했다 — \`/친구 ${player.name}\``);
    }
  }).catch(() => say('🙋 지금은 못 청했다 — 잠시 뒤 다시'));
  return true;
}

// ── 함께 도착 — 시작 화면이 읽는다 ───────────────────────────────────────────
//   ★"친구가 그 마을에 있다"의 정본은 그 친구의 **처음 고른 마을**(`Onboarding.stateOf().start_vid`)이다.
//     지금 어디 서 있느냐가 아니다 — 실시간 위치는 따라가기 몫이라 회부다.
//   ⚠`start_vid` 는 **존의 표**에 있다(central 아님). 그래서 다른 존에서 시작한 친구는 여기서 안 보인다 —
//     지금 세계는 존이 하나라 실질 차이가 없지만, 그게 사실이므로 적어 둔다(회부).
async function startVidCounts(playerId) {
  const rec = await load(playerId, false);
  if (!rec || !rec.ok || !rec.ids.size) return null;
  const out = new Map();
  for (const fid of rec.ids) {
    let vid = null;
    try { const s = H.startVidOf ? H.startVidOf(fid) : null; vid = (s == null) ? null : (s | 0); } catch (e) { vid = null; }
    if (vid == null) continue;
    out.set(vid, (out.get(vid) || 0) + 1);
  }
  return out;
}

// ── ★★이름으로 묻는 갈래는 **캐시로만** 답한다 — 요청 경로에서 central 을 두드리지 않는다 ──
//   T19 가 같은 자리에서 이미 적어 뒀다: *"`/startinfo` 는 로비가 부팅 직후에 부르는 요청이다.
//   거기서 central 을 마을 수만큼 두드리면 그 요청 하나가 서버를 멎게 한다."*(`newcomers.js:128`)
//   ⚠1차 실장은 `httpStartInfo` 를 async 로 만들어 **응답 안에서** central 을 기다렸고,
//     그 지연이 `e2e-onboarding` 을 61/0 → 58/4 로 밀었다(대본이 시간에 붙어 있다). 값이 아니라
//     **시간**을 바꾼 것이 결함이었다 — 같은 실수를 두 번 하지 않게 여기 적어 둔다.
//   ⇒ 지금 아는 것을 **곧바로** 답하고, 낡았으면 뒤에서 다시 물어 다음 물음에 맞춘다.
function nameVids(name) {
  const key = String(name || '').trim();
  if (!key || !ready()) return null;
  const hit = _byName.get(key);
  const stale = !hit || (Date.now() - hit.at >= CFG.TTL_MS);
  if (stale && !(hit && hit.pending)) {
    const rec = hit || { vids: null, at: 0, pending: false };
    rec.pending = true; _byName.set(key, rec);
    H.central.friendsOfName(key).then((rows) => {
      const out = new Map();
      for (const r of (rows || [])) {
        let vid = null;
        try { const v = H.startVidOf ? H.startVidOf(String(r.id)) : null; vid = (v == null) ? null : (v | 0); } catch (e) { vid = null; }
        if (vid == null) continue;
        out.set(vid, (out.get(vid) || 0) + 1);
      }
      _byName.set(key, { vids: rows == null ? (rec.vids || null) : out, at: Date.now(), pending: false });
    }).catch(() => { rec.pending = false; });
  }
  return hit ? hit.vids : null;
}

function debug(playerId) {
  const rec = playerId ? _cache.get(String(playerId)) : null;
  return { cfg: CFG, cached: _cache.size, me: rec ? { ok: rec.ok, ids: [...rec.ids], names: [...rec.names] } : null };
}

module.exports = { CFG, init, ready, load, knownIds, isFriend, handleChat, startVidCounts, nameVids, debug, __bust: _bust, __reload: _reload };
