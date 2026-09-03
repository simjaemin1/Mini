'use strict';
// === server/newcomers.js — "이방인 받기" (유저 마을 시작지 등록) ================
//
// ★설계 정본: `설계/설계_게임성_사건레이어_TODO.md` §9.3 [재민 확정 2026-08-25] ·
//   회부 A-4("T19 · §9.3 의 나머지 절반"). 문장 그대로:
//     *"신규는 기존 마을(NPC/유저 불문) 합류로 유도. **유저 마을도 시작지 등록 가능**("이방인 받기" ON) —
//       시작 지도가 곧 길드 모집 채널. 자격: 쉼터 보유 · 길드 벌점 낮음 · 최근 활동."*
//
// ★★제1 규약: **새 저장소를 만들지 않는다.** 스위치는 **회관 건물의 `data.welcomeStrangers`** 다.
//   회관은 플레이어가 실제로 세운 `village_hall` 이고, 그 `data` 는 이미 `db.updateBuildingData` 로
//   영속된다(`data.villageDbId` 가 이미 거기 산다 — 마을↔회관 결속의 정본).
//   ⇒ 새 표 0 · 새 컬럼 0 · 새 마이그레이션 0.
//
// ★★제2 규약: **새 권한 술어를 만들지 않는다.** 스위치를 켜고 끄는 자격은 회관 재고 열람과
//   **완전히 같다** — `zone._furnaceCanUse`(개인 땅이면 창설자, 길드 땅이면 길드원).
//   여기에 "누가 촌장인가"를 다시 적으면 그게 사본이다.
//
// ★★제3 규약: **문턱을 지어내지 않는다.** 자격 셋의 수는 전부 **이미 세계에 있는 정본**에서 온다:
//     · 쉼터   → **econ 이 스스로 판정한 사실**을 쓴다: 인구 ≥ 1(첫 주민은 곳간 식량이
//                `recoveryFoodThreshold` 를 넘어야 깃든다) + 식량 자립일수(`totalFoodEquivalent ÷ 인구`).
//                ⚠"쉼터"는 **시설로 존재하지 않는다**(회부 온보딩 A-3) — 이건 그 대체 술어다. 보고에 명시.
//     · 벌점   → central 의 **`warDialFromGuildVp` 가 '청정'이라 부르는 그 선**(vp < 30) 그대로.
//     · 최근활동 → **T45 가 이미 정한 "자리를 비웠다"의 선**(`claims.CFG.HOLD_DAYS`) 그대로.
//                축을 하나로 둔다 — 땅이 보관으로 넘어갈 만큼 안 온 사람의 마을이 이방인을 부를 수는 없다.
//
// ★★제4 규약: **시작 화면에 '마을 창설'은 없다**(§9.3 소프트 게이트 — 중반 야망이다).
//   이 파일은 **이미 선 마을을 지도에 올릴지**만 정한다.

const path = require('path');
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const DAY_MS = 24 * 60 * 60 * 1000;

const CFG = {
  // 쉼터 대체 술어 — "사람이 살고, 온 사람을 먹일 것이 있다".
  MIN_POP: Math.max(1, _num('NEWCOMER_MIN_POP', 1) | 0),
  MIN_FOOD_DAYS: _num('NEWCOMER_MIN_FOOD_DAYS', 3),
  // 길드 벌점 — central `warDialFromGuildVp` 의 '청정' 경계(30). 여기서 새 등급을 만들지 않는다.
  MAX_GUILD_VP: _num('NEWCOMER_MAX_GUILD_VP', 30),
  // 최근 활동 — 기본값은 주입된 T45 의 `HOLD_DAYS`(축이 하나다). env 로만 갈아 끼운다.
  ACTIVE_DAYS: _num('NEWCOMER_ACTIVE_DAYS', 0),   // 0 = 주입값을 쓴다
  SCAN_MS: Math.max(30 * 1000, _num('NEWCOMER_SCAN_MS', 5 * 60 * 1000)),
  ENABLED: process.env.NEWCOMER_ENABLE !== '0',
};

let H = null;
function init(host) { H = host || {}; return true; }
function ready() { return !!H && !!H.buildings; }
function activeDays() {
  if (CFG.ACTIVE_DAYS > 0) return CFG.ACTIVE_DAYS;
  const d = H && Number(H.holdDays);
  return Number.isFinite(d) && d > 0 ? d : 14;
}

// ── 회관 ─────────────────────────────────────────────────────────────────────
//   ★마을↔회관 결속은 **이미 있는 것**을 읽는다(`onDone` 이 심은 `data.villageDbId`).
function hallOf(vid) {
  if (!ready() || vid == null) return null;
  const k = vid | 0;
  for (const b of H.buildings.values()) {
    if (b && b.type === 'village_hall' && b.data && (b.data.villageDbId | 0) === k) return b;
  }
  return null;
}
function isOn(vid) { const b = hallOf(vid); return !!(b && b.data && b.data.welcomeStrangers); }

// ── 자격 셋 ──────────────────────────────────────────────────────────────────
//   반환: { ok, why:[], pop, foodDays, vp, idleDays } — **화면이 그대로 읽는다**(클라 재계산 0).
//   ⚠central 이 필요한 두 갈래(벌점·최근활동)는 배치가 미리 재 둔 값을 쓴다(아래 `scan`).
//     모르면 **막지 않는다** — central 이 잠깐 안 뜬 것을 마을의 죄로 삼지 않는다(안전한 쪽).
const _remote = new Map();   // vid → { vp, idleDays, at }
function eligibility(vid) {
  const why = [];
  const out = { ok: false, why, shelter: false, pop: 0, foodDays: 0, vp: null, idleDays: null, on: isOn(vid) };
  if (!ready()) { why.push('아직 준비되지 않았다'); return out; }
  const vil = H.villageOf ? H.villageOf(vid) : null;
  if (!vil || !vil.econ) { why.push('그런 마을이 없다'); return out; }
  if (!vil.econ.founder) { why.push('사람이 세운 마을이 아니다'); return out; }
  // ① 쉼터 — **시설**과 **먹일 것**, 둘 다다.
  //   ★★[T62 2026-09-03] §9.3 자격 첫 항 *"쉼터 보유"* 가 이제 시설로 존재한다
  //     (`server/villages.js` `shelterOf` 가 좌표 정본 · T43 이송과 온보딩 안내가 같은 문을 쓴다).
  //     T19 은 그게 세계에 없어서 **대체 술어**(인구·자립일)로 갔다 — 보고 T19 §0-ⓔ 가 그 사실을 적어 뒀다.
  //   ⚠**대체 술어를 버리지 않는다.** 자격 = 쉼터 ∧ (인구 ≥1 ∧ 자립 ≥3일):
  //     지붕이 있어도 먹일 것이 없으면 이방인을 굶긴다(§9.4 "납품 → **밥 + 공용 쉼터**" 가 요구하는 상태 그대로).
  out.shelter = !!(H.hasShelter && H.hasShelter(vid));
  if (!out.shelter) why.push('이방인이 잘 자리가 없다 — 쉼터를 지어야 한다');
  const pop = (vil.econ.npcs && vil.econ.npcs.length) | 0;
  out.pop = pop;
  let foodEq = NaN;
  try { foodEq = H.econ && H.econ.totalFoodEquivalent ? +H.econ.totalFoodEquivalent(vil.econ) : NaN; } catch (e) { foodEq = NaN; }
  // ★★**못 읽었으면 통과시키지 않는다.** `NaN < 3` 은 false 라, 그냥 두면 곳간 판정이
  //   **조용히 자명 통과**한다(하네스 1차 판이 "자립 NaN일"로 통과했다 — 그게 이 줄이 생긴 이유다).
  //   central 을 못 물어본 것과는 다르다: 곳간은 **여기 있는 값**이고, 못 읽었다면 그건 결함이다.
  const foodOk = Number.isFinite(foodEq);
  out.foodDays = foodOk ? +(foodEq / Math.max(1, pop)).toFixed(1) : null;
  if (pop < CFG.MIN_POP) why.push('아직 사람이 살지 않는다');
  else if (!foodOk) why.push('곳간을 읽지 못했다');
  else if (out.foodDays < CFG.MIN_FOOD_DAYS) why.push(`곳간이 얇다 (자립 ${out.foodDays}일)`);
  // ② 길드 벌점 — 길드가 없으면 벌점도 없다(무길드를 죄로 삼지 않는다)
  const r = _remote.get(vid | 0) || null;
  if (r && r.vp != null) { out.vp = +r.vp.toFixed(1); if (r.vp >= CFG.MAX_GUILD_VP) why.push(`길드 벌점이 높다 (${out.vp})`); }
  // ③ 최근 활동 — 창설자가 얼마나 안 왔나
  if (r && r.idleDays != null) {
    out.idleDays = +r.idleDays.toFixed(1);
    if (r.idleDays > activeDays()) why.push(`촌장이 ${Math.round(r.idleDays)}일째 안 온다`);
  }
  // ④ 도착 지점 — 이방인이 **내릴 자리**가 있어야 한다(NPC 마을과 같은 조건)
  if (H.arrivalOf && !H.arrivalOf(vid)) why.push('도착 지점 없음');
  out.ok = why.length === 0;
  return out;
}
// 시작 화면이 읽는 한 줄 — 스위치와 자격을 **같이** 낸다.
//   ★스위치가 꺼져 있으면 지도에 안 띄운다(그게 스위치의 뜻이다). 자격은 촌장 화면이 본다.
function listable(vid) { const e = eligibility(vid); return { ...e, listed: !!(CFG.ENABLED && e.on && e.ok) }; }

// ── 스위치 ───────────────────────────────────────────────────────────────────
//   ★자격 판정은 **켤 때 막지 않는다** — 켜 두고 조건을 갖추면 그때부터 지도에 뜬다.
//     (막으면 "왜 안 켜지지"가 되고, 안 막으면 "왜 아직 안 뜨지 — 아, 곳간이 얇구나"가 된다.)
function setOn(vid, on) {
  const b = hallOf(vid);
  if (!b) return { ok: false, err: '이 마을의 회관을 찾지 못했다' };
  b.data = b.data || {};
  b.data.welcomeStrangers = on ? 1 : 0;
  if (b.dbId && H.updateBuildingData) { try { H.updateBuildingData(b.dbId, JSON.stringify(b.data)); } catch (e) {} }
  return { ok: true, on: !!b.data.welcomeStrangers, hall: b };
}

// ── central 에 묻는 두 갈래 — 배치로 미리 재 둔다(요청 경로에서 안 묻는다) ──
//   `/startinfo` 는 로비가 부팅 직후에 부르는 요청이다. 거기서 central 을 마을 수만큼 두드리면
//   그 요청 하나가 로비를 멎게 한다(온보딩이 도착 지점으로 이미 겪은 그 함정 · 회부 B-7).
let _scanning = false, _lastScan = { at: 0, n: 0 };
async function scan() {
  if (!ready() || !CFG.ENABLED || _scanning) return _lastScan;
  _scanning = true;
  const now = Date.now();
  let n = 0;
  try {
    const vils = (H.playerVillages && H.playerVillages()) || [];
    for (const vil of vils) {
      const vid = vil.dbId | 0;
      const rec = { vp: null, idleDays: null, at: now };
      const founder = vil.econ && vil.econ.founder;
      if (founder) {
        try {
          const p = await H.central.getPlayer(founder);
          // ★★[실측이 잡았다 2026-09-02] **`| 0` 을 쓰지 마라 — 정수화가 아니라 int32 절단이다**(족보 77).
          //   1차 판이 `p.last_seen | 0` 이었고, epoch ms(1.78e12)가 int32 로 잘려
          //   `e2e-village` 에서 **"촌장이 20679일째 안 온다"**(=56년)가 나왔다. 방금 로그인한 사람이었다.
          //   ⚠0·음수는 **측정이 아니다** — 모르는 것으로 둔다(막지 않는다).
          const _ls = Number(p && p.last_seen);
          if (Number.isFinite(_ls) && _ls > 0) rec.idleDays = (now - _ls) / DAY_MS;
          const tid = (vil._tribeId != null) ? vil._tribeId : (p && p.tribe_id);
          if (tid) { const t = await H.central.getTribe(tid); if (t && t.tribe && Number.isFinite(t.tribe.vp)) rec.vp = +t.tribe.vp; }
        } catch (e) { /* central down — 이번 판은 모른 채로 둔다(막지 않는다) */ }
      }
      _remote.set(vid, rec);
      n++;
    }
  } finally { _scanning = false; _lastScan = { at: now, n, ms: Date.now() - now }; }
  return _lastScan;
}
let _timer = null;
function start() {
  if (!CFG.ENABLED || _timer) return false;
  // ★첫 판을 부팅 직후에 한 번 — 안 그러면 **처음 5분 동안 `/startinfo` 가 벌점·활동을 모른 채** 답한다
  //   (모르면 막지 않으므로 안 뜨는 게 아니라 **덜 걸러진 채로** 뜬다 — 그쪽이 더 나쁘다).
  setTimeout(() => { scan().catch(() => {}); }, Math.max(1000, _num('NEWCOMER_SCAN_BOOT_MS', 20 * 1000)));
  _timer = setInterval(() => { scan().catch(() => {}); }, CFG.SCAN_MS);
  if (_timer.unref) _timer.unref();
  return true;
}
// ── 채팅 명령 — **새 클라 조건 0**(채팅은 이미 있다 · T11 선례) ────────────
//   `/이방인` 상태 보기 · `/이방인 켜` · `/이방인 꺼`.
//   ⚠회관 앞에 서 있어야 한다 — 권한·거리는 재고 열람과 같은 술어를 **주입받아** 쓴다(사본 0).
function handleChat(player, text) {
  if (!ready() || !player) return false;
  const t = String(text || '').trim();
  if (!t.startsWith('/이방인')) return false;
  const arg = t.slice('/이방인'.length).trim();
  const say = (m) => { try { if (H.send && player.ws) H.send(player.ws, { type: 'notice', text: m }); } catch (e) {} };
  const b = H.nearHall ? H.nearHall(player) : null;
  if (!b) { say('🏘️ 우리 마을 회관 앞에서 말하게'); return true; }
  const vid = (b.data && b.data.villageDbId != null) ? (b.data.villageDbId | 0) : null;
  if (vid == null) { say('🏘️ 이 회관에 딸린 마을을 찾지 못했다'); return true; }
  if (arg === '켜' || arg === 'on') { if (H.setSwitch) H.setSwitch(player, b, true); return true; }
  if (arg === '꺼' || arg === 'off') { if (H.setSwitch) H.setSwitch(player, b, false); return true; }
  const e = listable(vid);
  say(`🏘️ 이방인 받기 ${e.on ? '켬' : '끔'}${e.listed ? ' · 시작 지도에 올라 있다' : ''}`
    + ` — 인구 ${e.pop} · 자립 ${e.foodDays}일`
    + (e.vp != null ? ` · 길드 벌점 ${e.vp}` : '')
    + (e.idleDays != null ? ` · 촌장 ${Math.round(e.idleDays)}일 전` : '')
    + (e.ok ? '' : ` · 아직: ${e.why.join(' · ')}`));
  return true;
}

function debug() {
  const rows = [];
  if (ready()) for (const vil of ((H.playerVillages && H.playerVillages()) || [])) {
    rows.push({ vid: vil.dbId, name: vil.name, ...listable(vil.dbId) });
  }
  return { cfg: { ...CFG, activeDays: activeDays() }, lastScan: _lastScan, villages: rows };
}

module.exports = { CFG, init, ready, start, scan, debug, hallOf, isOn, setOn, eligibility, listable, activeDays, handleChat,
  __probe: { remote: _remote } };
