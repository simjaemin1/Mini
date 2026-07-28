// === server/guild-treasury.js — 길드 곳간(물리) ↔ central 금고(회계) 정합 층 ===
//
// ★장부 계약(이 파일이 유일한 정의):
//   ① `buildings.data`(길드 곳간)  = **물리 실체**. 플레이어가 실제로 넣고 뺀 물건이 그 자리에 있다.
//   ② `tribes.treasury_json`(central) = **길드 회계 총자산**. 물리 곳간에 든 몫은 그 **부분집합**이다.
//      → 곳간에 넣으면 총자산이 늘고(플레이어 소유 → 길드 소유), 빼면 준다. 같은 물건을 두 번 세지 않는다.
//      → 마을 생산(60초 틱)은 물리 실체가 없는 추상 자산이라 그대로 회계에만 쌓인다(기존 경로 불변).
//   ③ 그래서 항상 **곳간 내용물 ≤ 해당 길드 treasury**가 성립해야 한다(하네스 불변식).
//
// ★정확히 한 번(exactly-once) 반영: 곳간 data에 **마지막으로 회계에 보고한 스냅샷 `_tr`**을 함께 저장한다.
//   보고할 델타 = (현재 내용물 − _tr). central 호출이 성공해야 _tr을 현재값으로 갱신한다.
//   → central이 죽어 있으면 델타가 남아 있다가 다음 성공 때 합쳐서 올라간다(누락·중복 없음).
//   → 부팅 때 reconcileAll로 전 곳간을 한 번 훑어 밀린 델타를 올린다(자가 치유).
//
// 신규 통신 채널을 만들지 않는다 — 기존 `POST /tribe/treasury`(central-client.tribeTreasury)만 쓴다.

const META_KEYS = new Set(['tribe_id', 'floor', 'owner', '_tr', 'stage', 'x0', 'y0', 'x1', 'y1', 'hut', 'gran', 'bld', 'side', 'kind']);

// 곳간 data에서 **아이템 수량만** 추린다(메타 키·비수치 제외).
function granaryItems(data) {
  const out = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (META_KEYS.has(k) || k.startsWith('_')) continue;
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

// 아직 회계에 못 올린 델타(현재 − 보고분). 0인 항목은 뺀다.
function pendingDelta(data) {
  const cur = granaryItems(data), prev = (data && data._tr) || {};
  const delta = {};
  for (const k of new Set([...Object.keys(cur), ...Object.keys(prev)])) {
    const d = (cur[k] || 0) - (Math.floor(Number(prev[k])) || 0);
    if (d) delta[k] = d;
  }
  return delta;
}

function isEmptyDelta(d) { return !d || Object.keys(d).length === 0; }

// 곳간 1동 동기화. opts = { tribeTreasury(tribeId, delta) → Promise, saveData(b) }
//   반환: null(보낼 것 없음) · { ok:true, delta } · { ok:false, delta, err }
async function syncGranary(b, opts) {
  if (!b || !b.data) return null;
  const tribeId = b.data.tribe_id;
  if (!tribeId) return null;                      // 길드 미지정 곳간(있을 수 없지만 방어)
  const snap = granaryItems(b.data);              // ★보고 시점 스냅샷 — 델타의 기준점
  const delta = pendingDelta(b.data);
  if (isEmptyDelta(delta)) return null;
  try {
    await opts.tribeTreasury(tribeId, delta);
  } catch (e) {
    return { ok: false, delta, err: (e && e.message) || String(e) };   // _tr 그대로 → 다음에 재시도
  }
  // ★[검수 수정 — 전송 중 변동 유실 방어] _tr은 "지금 내용물"이 아니라 **보고한 스냅샷(snap)**이어야 한다.
  //   HTTP 왕복 중에 입고가 끼어들면, 현재값으로 덮을 경우 그 입고분이 보고 없이 _tr에 흡수돼 영영 누락된다.
  //   snap으로 두면 끼어든 변동은 (현재 − snap) 델타로 남아 다음 동기에 올라간다.
  b.data._tr = snap;
  if (opts.saveData) opts.saveData(b);
  return { ok: true, delta };
}

// 부팅·주기 재동기 — 밀린 델타 일괄 정리. buildings = iterable of building
async function reconcileAll(buildings, opts) {
  let sent = 0, failed = 0, skipped = 0;
  for (const b of buildings) {
    if (!b || b.type !== 'guild_granary') continue;
    const r = await syncGranary(b, opts);
    if (!r) { skipped++; continue; }
    if (r.ok) sent++; else failed++;
  }
  return { sent, failed, skipped };
}

module.exports = { granaryItems, pendingDelta, syncGranary, reconcileAll, META_KEYS };
