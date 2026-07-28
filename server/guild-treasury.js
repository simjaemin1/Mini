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

// =============================================================================
// ★★[11차 T5 — 물리화 안 1의 초석] `depositAccounted` — 회계에 **이미 반영된** 물건을 물리 곳간에 놓는다.
//
//   왜 별도 함수가 필요한가(설계_길드생산_물리화_설계안.md §2):
//     마을 생산 틱은 이미 `tribeTreasury(+5)`로 회계를 올린다. 그 물건을 곳간 data에 그냥 +5 쓰면
//     다음 reconcile이 그걸 **새 입고로 보고 또 올린다** → 생산 1회당 회계 2배(누적 오차).
//   해결(이 파일의 규약 그대로 확장):
//     입고와 **동시에** 보고 스냅샷 `_tr`도 같은 만큼 민다 → pendingDelta가 0으로 유지된다.
//     즉 "물리에는 놓되 회계에는 다시 보고하지 않는다"가 한 함수 안에서 원자적으로 성립한다.
//   ★플레이어 입출고(tryChestPut/Take)는 여전히 syncGranary 경로다 — 그건 회계에 **없던** 물건이라 보고해야 맞다.
//     두 경로의 차이는 오직 "이 물건이 이미 회계에 있는가"이고, 그 판단은 호출측이 안다.
//
//   용량 상한(사용자 확정 "물리 풀세트")의 값은 **제안**이다 — GUILD_GRANARY_CAP 참조.
//   넘친 몫은 물리로 놓지 않고 회계에만 남긴다(불변식 물리 ≤ 회계는 그대로 유지) + 호출측이 로그로 남긴다.

// ★[제안값] 길드 곳간 1동 물리 수용. 근거: 마을 고상곳간과 **같은 5×3 굴립주 구조**이므로 물리 수용도
//   같은 자릿수여야 한다. 마을 곳간은 '수확 칸' 60(G_STOCK_CAP) — 칸 하나를 아이템 10점으로 환산해 600.
//   ※환산 계수 10은 근거가 약한 유일한 숫자다. 재민 판단 항목(설계안 §6-3).
const GUILD_GRANARY_CAP = Math.max(0, parseInt(process.env.GUILD_GRANARY_CAP || '600', 10));

// ★물리화 화이트리스트 — "물건으로 놓을 수 있는 것"만. 서비스·추상은 회계에만 남는다.
//   zone.js JOB_YIELD + Specialty.ORE_POOLS의 산출 아이템을 전수로 분류한다(하네스가 누락을 잡는다).
//   ★광물은 ORE_POOLS 전수(9개 바이옴 × 풀)를 그대로 담는다 — '흔한 것만' 골라 담으면 조용한 누락이 생긴다.
const PHYS_WHITELIST = new Set([
  'wood', 'fiber', 'herb', 'hide', 'berry', 'fish', 'meat_raw', 'meat_cooked',   // 채집·수렵·농림 산물(부피 있는 실물)
  // 광물·석재(광산 산출 — 자루·더미로 쌓인다). server/specialty.js ORE_POOLS 전수와 일치해야 한다(하네스 ⑫).
  'iron', 'copper', 'silver', 'gold', 'sulfur', 'obsidian', 'tungsten', 'salt', 'phosphate', 'nitrate',
  'sand', 'nickel', 'cobalt', 'diamond', 'coal', 'granite', 'marble', 'jade_raw', 'limestone', 'clay',
  'tin', 'zinc', 'ruby', 'emerald', 'bauxite', 'manganese',
]);
//   제외는 **이유와 함께** 명시한다(조용한 누락 금지 — 하네스가 이 표와 산출 목록을 대조한다).
const PHYS_EXCLUDE = new Map([
  ['sword', '완성 무기 = 개인 장비. 곳간 더미로 쌓는 물건이 아니다(플레이어 인벤·무기고 소관)'],
]);
function physClassify(item) {
  if (PHYS_WHITELIST.has(item)) return { phys: true };
  if (PHYS_EXCLUDE.has(item)) return { phys: false, why: PHYS_EXCLUDE.get(item) };
  return { phys: false, why: '미분류 — 화이트리스트에도 제외표에도 없다(하네스가 잡아야 할 구멍)' };
}

// b: 길드 곳간 building · delta: { item: qty>0 } (회계에 이미 반영된 산출)
// 반환 { stored:{}, overflow:{}, skipped:{}, cap } — 호출측이 로그·재시도에 쓴다.
function depositAccounted(b, delta, opts) {
  const o = opts || {};
  const cap = (o.cap != null) ? o.cap : GUILD_GRANARY_CAP;
  const out = { stored: {}, overflow: {}, skipped: {}, cap };
  if (!b || !b.data || !delta) return out;
  let used = 0;
  for (const v of Object.values(granaryItems(b.data))) used += v;
  for (const [k, q0] of Object.entries(delta)) {
    const q = Math.floor(Number(q0));
    if (!Number.isFinite(q) || q <= 0) continue;
    const cls = physClassify(k);
    if (!cls.phys) { out.skipped[k] = q; continue; }                 // 물리화 대상 아님 → 회계에만(불변식 유지)
    const room = Math.max(0, cap - used);
    const put = Math.min(q, room);
    if (put > 0) {
      b.data[k] = (b.data[k] || 0) + put;
      b.data._tr = b.data._tr || {};
      b.data._tr[k] = (Math.floor(Number(b.data._tr[k])) || 0) + put;   // ★같은 만큼 스냅샷도 민다 = 재보고 금지
      used += put;
      out.stored[k] = put;
    }
    if (q - put > 0) out.overflow[k] = q - put;                     // 넘친 몫 = 물리 없음, 회계엔 이미 있음
  }
  if (o.saveData && (Object.keys(out.stored).length)) o.saveData(b);
  return out;
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

module.exports = { granaryItems, pendingDelta, syncGranary, reconcileAll, META_KEYS,
  // ★[11차 T5] 물리화 초석
  depositAccounted, physClassify, PHYS_WHITELIST, PHYS_EXCLUDE, GUILD_GRANARY_CAP };
