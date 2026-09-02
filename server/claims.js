'use strict';
// === server/claims.js — 사유지 v2 (셀 집합 · 인접 · 부재 상태기) =================
//
// ★설계 정본: `설계/소속_사유지_기여_설계안.md` §3. [재민 확정 2026-09-02 · T45]
//   L-1 S0 = 9 유지 · L-2 길드 땅 위 개인 선언은 **플래그·기본 개방** · L-3 임시는 **3일** ·
//   L-4 `pref` 창 **14+14** · L-5 인접 규칙 **소급 안 함**.
//
// ★★제1 규약: **셀 집합이 정본이고 사각은 파생이다.** 사람 클레임은 이미 정확히 1셀이라
//   (`tryClaim` 이 `w = h = BUILDING_SIZE` 로 넣는다) **레코드를 셀로 읽는 것이 곧 셀 집합**이다.
//   자료구조를 갈아엎지 않았다 — 필요한 것은 §0 이 찾아낸 **잃어버린 필드의 복구**였다.
//
// ★★제2 규약: **권한 술어를 새로 만들지 않는다.** 시설 승계는 `buildings` 행의
//   `data.owner`/`data.tribeId` 를 바꾸는 일이고, 그러면 `zone._furnaceCanUse` 가 **자동으로**
//   새 주인을 인정한다. 이 파일에 "누가 노를 쓸 수 있나"를 다시 적으면 그게 사본이다.
//
// ★★제3 규약: **부재 시계는 실시간이고 세계의 시간이 아니다.** 실시간 14일 = 게임 840일 ≈ 2.3 게임년.
//   달력·계절·부패·econ 어느 것과도 같은 축이 아니다 ⇒ **게임일로 환산해 보여 주면 거짓말이 된다.**
//   그래서 이 파일은 `gameDay` 를 아예 받지 않는다(받으면 언젠가 쓰게 된다).
//
// ★★제4 규약: **소급하지 않는다(L-5).** 인접도 연결성도 **새 행위**에만 건다 —
//   옛날에 흩뿌려 둔 셀은 그대로 두고, 포기 검사는 "지금보다 더 갈라지는가"만 본다.
//   절대 기준(“한 덩이여야 한다”)으로 짜면 **옛 플레이어는 아무것도 못 버린다.**

const path = require('path');

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const DAY_MS = 24 * 60 * 60 * 1000;
const CFG = {
  // T1 — 마지막 접속 뒤 이만큼 지나면 `held`(보관 · 몰수가 아니다).
  HOLD_DAYS: _num('CLAIM_HOLD_DAYS', 14),
  HOLD_DAYS_TEMP: _num('CLAIM_HOLD_DAYS_TEMP', 3),    // L-3 — 이름이 임시다
  // T2 — `held` 뒤 이만큼 더 지나면 `pref`(우선권 창), 그 창이 끝나면 `free`.
  PREF_DAYS: _num('CLAIM_PREF_DAYS', 14),             // L-4 — 14+14
  FREE_DAYS: _num('CLAIM_FREE_DAYS', 14),
  // 배치 주기 — **존 틱에 얹지 않는다**(T1 이 방금 일틱을 조각낸 이유가 그거다).
  SCAN_MS: Math.max(60 * 1000, _num('CLAIM_SCAN_MS', 30 * 60 * 1000)),
  SCAN_BOOT_DELAY_MS: Math.max(0, _num('CLAIM_SCAN_BOOT_MS', 60 * 1000)),
  ENABLED: process.env.CLAIM_ABSENCE !== '0',
};

let H = null;
function init(host) { H = host || {}; return true; }
function ready() { return !!H && !!H.claims; }
const SZ = () => (H && H.BUILDING_SIZE) || 32;

// ── 셀 ────────────────────────────────────────────────────────────────────────
//   ★사각이 아니라 셀로 읽는다. 길드 영토는 `cells` 를 이미 갖고 있고(NPC 마을 영토는
//     `spawnGuildClaimsForVillage` 가 유기적 폴리곤으로 만든다), 사람 것은 1셀이라 한 칸이다.
function cellsOf(c) {
  if (!c) return [];
  if (Array.isArray(c.cells) && c.cells.length) return c.cells;
  const s = SZ();
  const x0 = Math.floor(c.x / s), y0 = Math.floor(c.y / s);
  const w = Math.max(1, Math.round((c.w || s) / s)), h = Math.max(1, Math.round((c.h || s) / s));
  const out = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x0 + dx, y0 + dy]);
  return out;
}
const key = (cx, cy) => `${cx},${cy}`;
// 개인·임시 = "내 땅". 길드 영토는 내 것이 아니라 **길드 것**이라 인접·연결성 축에 안 넣는다.
function isOwnKind(c) { return c && c.kind !== 'guild'; }
function mySet(ownerPid, skipClaimId) {
  const set = new Set();
  if (!ready()) return set;
  for (const [id, c] of H.claims) {
    if (id === skipClaimId) continue;
    if (c.ownerPid !== ownerPid || !isOwnKind(c)) continue;
    for (const [cx, cy] of cellsOf(c)) set.add(key(cx, cy));
  }
  return set;
}

// ── 인접(4방) ────────────────────────────────────────────────────────────────
//   새 셀은 내 기존 셀 중 하나와 **변**을 공유해야 한다. 대각은 아니다 — 대각으로만 붙은 땅은
//   걸어서 이어지지 않는다(일관성 원칙의 땅 판). 내 셀이 0개면 **첫 셀**이라 예외다.
//   ⚠L-5: 소급하지 않는다. 옛 흩뿌린 셀도 "내 셀"로 세므로 그 옆은 계속 이어 붙일 수 있다.
function adjacencyOf(ownerPid, cx, cy) {
  const set = mySet(ownerPid);
  if (!set.size) return { ok: true, first: true, mine: 0 };
  const ok = set.has(key(cx - 1, cy)) || set.has(key(cx + 1, cy))
          || set.has(key(cx, cy - 1)) || set.has(key(cx, cy + 1));
  const diag = !ok && (set.has(key(cx - 1, cy - 1)) || set.has(key(cx + 1, cy - 1))
                    || set.has(key(cx - 1, cy + 1)) || set.has(key(cx + 1, cy + 1)));
  return { ok, first: false, mine: set.size, diag };
}

// ── 연결성 — 포기하면 **더 갈라지는가** ──────────────────────────────────────
//   ★절대 기준("한 덩이여야 한다")이 아니라 **증분 기준**이다. 왜:
//     지금 살아 있는 사람들의 땅은 인접 규칙 없이 흩뿌려져 있다(§0-ⓐ). 절대 기준이면
//     그 사람들은 **아무것도 못 버린다** — 규칙이 소급되는 것과 같다(L-5 위반).
//   덩이 수는 셀을 빼면 **줄거나(그 셀이 외딴 덩이였다) 그대로(잎)이거나 는다(목)**.
//   ⇒ 늘면 거절. 그게 정확히 "ㄷ 자의 목을 뺐다"는 뜻이다.
function components(set) {
  const seen = new Set();
  let n = 0;
  for (const k of set) {
    if (seen.has(k)) continue;
    n++;
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const [cx, cy] = stack.pop().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(cx + dx, cy + dy);
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
  }
  return n;
}
function unclaimSplits(ownerPid, claimId) {
  const before = mySet(ownerPid);
  const after = mySet(ownerPid, claimId);
  const b = components(before), a = components(after);
  return { splits: a > b, before: b, after: a, cells: after.size };
}

// ── 부재 상태기 ──────────────────────────────────────────────────────────────
//   ACTIVE ─(last_seen 경과 > T1)─▶ HELD ─(+T2)─▶ PREF ─(+T3)─▶ FREE
//   ★`held` 는 **보관이지 몰수가 아니다**. 복귀하면 전량 돌아온다.
const holdMsOf = (c) => (c && c.kind === 'temporary' ? CFG.HOLD_DAYS_TEMP : CFG.HOLD_DAYS) * DAY_MS;
function stageFor(c, absentMs) {
  const t1 = holdMsOf(c);
  if (absentMs < t1) return 'active';
  if (absentMs < t1 + CFG.PREF_DAYS * DAY_MS) return 'held';
  if (absentMs < t1 + (CFG.PREF_DAYS + CFG.FREE_DAYS) * DAY_MS) return 'pref';
  return 'free';
}
// ★`held_by` — **누가 이 땅을 맡아 두는가.** 세 갈래이고, 셋이 각각 다른 뜻이다:
//   길드원 → 길드가 맡는다 · NPC 마을 소속자(T11) → 촌장이 "빈집"으로 맡는다 · 무소속 → 무주 공시.
//   ⚠소속은 **T11 이 몸에 실어 둔 그 필드**를 읽는다(`tools_json` → `member`). 새 저장소 0.
function heldByOf(row) {
  if (!row) return null;
  if (row.tribe_id) return `guild:${row.tribe_id}`;
  try {
    const b = JSON.parse(row.tools_json || '{}');
    const m = b && b.member;
    if (m && m.vid != null && (!H.ZONE_ID || !m.zone || m.zone === H.ZONE_ID)) return `village:${m.vid | 0}`;
  } catch (e) {}
  return null;                                   // 무주 — 상자도 잠긴다(아래 `chestLocked`)
}
// 상태를 메모리와 DB에 **같이** 쓴다. 재기동이 사면이 되면 안 된다.
function setState(id, c, state, heldBy, at) {
  const t = at || Date.now();
  if (c.state === state && (c.heldBy || null) === (heldBy || null)) return false;
  c.state = state; c.heldBy = heldBy || null; c.stateAt = t;
  if (c.dbId && H.db && H.db.updateClaimState) H.db.updateClaimState(c.dbId, state, heldBy || null, t);
  if (H.broadcast) { try { H.broadcast({ type: 'claim_state', id, state, heldBy: heldBy || null }); } catch (e) {} }
  return true;
}

// 하루 한 번 배치 — 존 틱에 안 얹는다.
let _scanning = false;
let _lastScan = { at: 0, owners: 0, moved: 0, byState: {} };
async function scanAbsence() {
  if (!ready() || !CFG.ENABLED || _scanning) return _lastScan;
  _scanning = true;
  const now = Date.now();
  const moved = [];
  try {
    // 1) 사람 소유주만 모은다 — NPC 마을 영토(`village_*`)와 길드 영토는 이 시계를 안 탄다.
    const owners = new Set();
    for (const c of H.claims.values()) {
      if (!isOwnKind(c) || !c.ownerPid || String(c.ownerPid).startsWith('village_')) continue;
      owners.add(c.ownerPid);
    }
    // 2) 접속 중이면 물어볼 것도 없다(그 사람은 지금 여기 있다).
    const online = new Set();
    for (const p of H.players.values()) if (!p.isNpc && p.playerId) online.add(p.playerId);
    // 3) central 에 `last_seen` 을 묻는다 — ★**새 엔드포인트를 안 만들었다.**
    //    `GET /player/:id` 가 `SELECT *` 라 `last_seen`·`tribe_id`·`tools_json` 이 이미 다 온다(§0-ⓔ).
    const rows = new Map();
    for (const id of owners) {
      if (online.has(id)) continue;
      try { const r = await H.central.getPlayer(id); if (r) rows.set(id, r); } catch (e) { /* central down — 이번 판은 건너뛴다 */ }
    }
    // 4) 전이
    for (const [id, c] of H.claims) {
      if (!isOwnKind(c) || !c.ownerPid || String(c.ownerPid).startsWith('village_')) continue;
      if (online.has(c.ownerPid)) { if (restoreOne(id, c)) moved.push([id, 'active']); continue; }
      const row = rows.get(c.ownerPid);
      if (!row || !Number.isFinite(row.last_seen)) continue;   // 모르면 안 건드린다(안전한 쪽)
      const want = stageFor(c, now - (row.last_seen | 0));
      if (want === (c.state || 'active')) continue;
      if (want === 'active') { if (restoreOne(id, c)) moved.push([id, 'active']); continue; }
      // held 로 갈 때만 `held_by` 를 새로 판정한다 — 그 뒤로는 그 판정을 들고 간다.
      const heldBy = (want === 'held') ? heldByOf(row) : (c.heldBy || null);
      if (setState(id, c, want, heldBy, now)) moved.push([id, want]);
    }
  } finally {
    _scanning = false;
    const byState = {};
    for (const c of H.claims.values()) if (isOwnKind(c)) byState[c.state || 'active'] = (byState[c.state || 'active'] | 0) + 1;
    _lastScan = { at: now, owners: 0, moved: moved.length, byState, ms: Date.now() - now };
  }
  return _lastScan;
}

// ── 복귀 — `held` 는 전량, `pref` 는 **아직 아무도 안 가져간 것만** ──────────
//   가져간 셀은 이미 주인이 바뀌어 이 사람의 클레임이 아니다 ⇒ 순회에 안 잡힌다.
//   즉 "안 가져간 것만"은 **구조적으로 저절로** 성립한다(따로 셈하지 않는다).
function restoreOne(id, c) {
  if (!c || (c.state || 'active') === 'active') return false;
  if (c.state === 'free') return false;          // 개방된 땅은 안 돌아온다 — 그건 이미 세계의 것이다
  return setState(id, c, 'active', null, Date.now());
}
function onPlayerActive(player) {
  if (!ready() || !player || !player.playerId) return 0;
  let n = 0;
  for (const [id, c] of H.claims) {
    if (c.ownerPid !== player.playerId || !isOwnKind(c)) continue;
    if (restoreOne(id, c)) n++;
  }
  return n;
}

// ── 남의 땅을 가져가기 ───────────────────────────────────────────────────────
//   `pref` = `held_by` 가 가리키는 쪽만 · `free` = 아무나. 그 밖에는 아무도 못 가져간다.
function takeableBy(player, c) {
  if (!c || !isOwnKind(c)) return { ok: false, why: '길드 영토는 개인이 가져갈 수 없다' };
  if (c.ownerPid === player.playerId) return { ok: false, why: '이미 내 땅이다' };
  const st = c.state || 'active';
  if (st === 'free') return { ok: true, why: '개방된 땅' };
  if (st !== 'pref') return { ok: false, why: st === 'held' ? '주인이 맡겨 둔 땅이다(보관 중)' : '남의 사유지다' };
  const hb = String(c.heldBy || '');
  if (hb.startsWith('guild:')) {
    const gid = hb.slice(6);
    return (player.tribeId && String(player.tribeId) === gid)
      ? { ok: true, why: '같은 길드의 우선권' } : { ok: false, why: '그 길드 사람만 가져갈 수 있다' };
  }
  if (hb.startsWith('village:')) {
    const vid = hb.slice(8) | 0;
    const m = player.member;
    return (m && (m.vid | 0) === vid) ? { ok: true, why: '같은 마을의 우선권' } : { ok: false, why: '그 마을 사람만 가져갈 수 있다' };
  }
  return { ok: false, why: '무주 공시 중이다 — 개방을 기다려야 한다' };   // held_by 없음 = 아무도 우선권이 없다
}
// ★시설 승계 — **새 권한 술어를 만들지 않는다.** `data.owner`/`data.tribeId` 를 바꾸면
//   `_furnaceCanUse` 가 그대로 새 주인을 인정한다(제2 규약).
function succeedFacilities(c, newOwnerPid, newOwnerName, newTribeId) {
  if (!ready() || !H.buildings) return 0;
  const s = SZ();
  const cs = new Set(cellsOf(c).map(([cx, cy]) => key(cx, cy)));
  let n = 0;
  for (const b of H.buildings.values()) {
    if (!b || !b.data) continue;
    const bk = key(Math.floor(b.x / s), Math.floor(b.y / s));
    if (!cs.has(bk)) continue;
    if (b.data.owner === undefined && b.data.tribeId === undefined && b.ownerId === undefined) continue;
    if (b.ownerId !== undefined && b.ownerId !== 'public') { b.ownerId = newOwnerPid; b.ownerName = newOwnerName; }
    if (b.data.owner !== undefined) b.data.owner = newOwnerPid;
    if (b.data.tribeId !== undefined) b.data.tribeId = newTribeId || null;
    if (b.dbId && H.db && H.db.updateBuildingData) { try { H.db.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
    n++;
  }
  return n;
}
// 실제 승계 — 메모리 + DB 를 같이 옮긴다.
function transfer(id, c, player) {
  const now = Date.now();
  c.ownerPid = player.playerId;
  c.ownerName = player.name;
  c.kind = 'personal';
  c.state = 'active'; c.heldBy = null; c.stateAt = now;
  if (c.dbId && H.db && H.db.updateClaimOwner) H.db.updateClaimOwner(c.dbId, player.playerId, player.name, 'personal', 'active', null, now);
  const nf = succeedFacilities(c, player.playerId, player.name, null);
  if (H.broadcast) { try { H.broadcast({ type: 'claim_added', claim: c }); } catch (e) {} }
  return nf;
}

// ── 상자 잠김 — `held` 이고 **무주**일 때만 ─────────────────────────────────
//   ★그래야 보관이 보관이다(§3.2). 길드·마을이 맡은 땅은 그쪽이 쓰라고 맡은 것이니 안 잠근다.
//   ⚠주인 본인은 언제나 연다.
function chestLocked(player, b) {
  if (!ready() || !b) return null;
  const s = SZ();
  const bk = key(Math.floor(b.x / s), Math.floor(b.y / s));
  for (const c of H.claims.values()) {
    if (!isOwnKind(c)) continue;
    if ((c.state || 'active') !== 'held' || c.heldBy) continue;
    if (c.ownerPid === player.playerId) continue;
    for (const [cx, cy] of cellsOf(c)) {
      if (key(cx, cy) === bk) return `${c.ownerName || '누군가'}의 짐이다 — 주인이 자리를 비운 동안은 잠긴다`;
    }
  }
  return null;
}

// ── 부팅 · 주기 ──────────────────────────────────────────────────────────────
let _timer = null;
function start() {
  if (!CFG.ENABLED || _timer) return false;
  setTimeout(() => { scanAbsence().catch(() => {}); }, CFG.SCAN_BOOT_DELAY_MS);
  _timer = setInterval(() => { scanAbsence().catch(() => {}); }, CFG.SCAN_MS);
  if (_timer.unref) _timer.unref();
  return true;
}
function debug() {
  const byState = {}, byKind = {};
  if (ready()) for (const c of H.claims.values()) {
    byState[c.state || 'active'] = (byState[c.state || 'active'] | 0) + 1;
    byKind[c.kind || '(없음)'] = (byKind[c.kind || '(없음)'] | 0) + 1;
  }
  return { cfg: CFG, byState, byKind, lastScan: _lastScan };
}

module.exports = {
  CFG, init, ready, start, debug,
  cellsOf, mySet, components, adjacencyOf, unclaimSplits,
  stageFor, heldByOf, setState, scanAbsence, restoreOne, onPlayerActive,
  takeableBy, succeedFacilities, transfer, chestLocked,
};
