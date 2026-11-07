'use strict';
// === server/membership.js — 마을 소속 · 곳간 인출 ==============================
//
// ★설계 정본: `설계/소속_사유지_기여_설계안.md` §4(소속 모델) · §2(기여 계량기).
//   [재민 확정 2026-09-02 · T11] K-1 기여는 **마을 축 하나**(길드는 구성원 합으로 파생) ·
//   K-2 빈터 3회 / 소속 12회 · K-3 전부 +1 · M-1 마을과 길드는 **직교**(보관 우선 길드>마을>무주).
//
// ★★제1 규약: **누적 기여 계량기는 하나다.** 그 하나는 `server/onboarding.js` 의 `onboarding.contrib`
//   이고, 이 파일은 그것을 **읽기만** 한다(`contribOf`). 여기에 두 번째 카운터를 두면 그게 사본이고,
//   두 값이 갈리는 날 "빈터는 열렸는데 소속은 안 된다" 같은 거짓말이 생긴다.
//
// ★★제2 규약: **곳간 인출은 `playerVillageDeposit` 의 역연산이다.** 실물 이동은 이 파일이 하지 않고
//   `villages.playerVillageWithdraw`(정본, 납품과 **같은 대응표·같은 환산율**)를 부른다.
//   econ 은 한 줄도 안 고쳤다 — 곳간 재고는 종전 경로로만 움직인다.
//
// ★★제3 규약: **소속의 정본은 몸(`serializeBody`)이다.** 새 컬럼을 만들지 않았다 —
//   T47 이 저장·핸드오프·재접속을 한 함수로 모아 뒀으므로, 거기 얹으면 셋이 동시에 따라온다.
//   (§0 실측 차이: 내 설계 문서 §2 는 `(vid, player_id)` 표를 제안했지만, 온보딩 v2 의 실물은
//    `player_id` 단일키에 `start_vid` 를 곁들인 **한 카운터**다. 문서가 아니라 실물에 맞췄다.)
//
// ★새 패널 0. 전이 제안·수락·탈퇴·추방은 **이미 있는 통로**로만 간다:
//   제안·통보 = `notice`(촌장의 말) · 수락·탈퇴·추방 = **채팅 명령**(클라 무접촉) ·
//   인출 = 채팅 명령 + 거래소 패널 한 줄(P50).
//
// ★★[T779 2026-10-18 · 재민 10-15 "마음대로 빼는 건 안 돼 · 관리자만 뺄 수 있어" · "겨울 프로젝트 없어"]
//   **꺼내기 = 촌장 한 사람**(T769 판정 그대로)이 이제 유일한 길이다 — 걷은 것: 마을 사람의 기여 한도 인출(`limitOf` · `remainOf` ·
//   `WD_PER` · `WD_FRAC` · `WD_MIN` · 하루 몫 장부 `wdDay` · `wdUsed`) · 겨울 달성 보상(`Winter.bonusOf` — `winter.js` 째) ·
//   길드 곳간 잠금(`granaryOpen` · `/곳간 열기|잠금` — 촌장 혼자 꺼내니 정할 문이 없다) · 마을 사람에게 가던 "/인출" 말.
//   소속 · 빈터 · 추방 · 기여 계량기는 그대로다(소속은 이제 곳간 열쇠가 아니라 그 마을 사람이라는 표지다).

const path = require('path');
const Events = require(path.join(__dirname, 'events'));
const Onb = require(path.join(__dirname, 'onboarding'));
const ItemLabel = require(path.join(__dirname, 'itemlabel'));   // ★[T159] 재화의 우리말 — 표는 여기 하나(사본 0)
const VillageKin = require(path.join(__dirname, 'village-kin'));   // ★[T785] 마을 칸(촌장) — 켬에서만 읽는다(끔 = 이 줄들 무동작) · ★[T809] 곳간 문은 T779 가 걷었다

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // 소속 문턱 — K-2 확정(12). 빈터(3)는 온보딩 정본(`ONB_LOT_AFTER`)이 갖는다.
  N_MEMBER: Math.max(1, _num('MEMBER_N', 12) | 0),
  // ★[T779] 일일 인출 한도 손잡이 셋(`MEMBER_WD_PER` · `MEMBER_WD_FRAC` · `MEMBER_WD_MIN`)은 걷었다 — 꺼내기는 촌장만 · 한도 없음.
  // ★[T159] 길드 표 캐시 수명 — **T128 소개문 캐시와 같은 값**(`guild.js INTRO_TTL_MS`).
  //   새 수가 아니라 같은 종류의 창을 같은 크기로 쓴 것이다(둘 다 "길드 표를 얼마나 자주 다시 묻나").
  //   ★[T769 · T779] 지금 이 창을 쓰는 것은 길드 촌장(`leader_id`) 캐시 하나다(길드 곳간 잠금은 걷었다).
  GRAN_TTL_MS: _num('MEMBER_GRAN_TTL_MS', 60000),
  // ★[T1137] 탈퇴 · 추방 뒤 다시 드는 데 기다리는 실시간(ms) — 카드가 준 1시간(★재민 11-03 · 손잡이 아님). 하네스는 시계(`Date.now`)를 당겨 잰다.
  REJOIN_MS: 3600000,
  // ★[T1137] 거래소 수수료율(물건 · 그 마을 곳간 몫) — 손잡이 둘. 판 셋 표는 T1137 보고(`scripts/t1137-fee-table.js`).
  //   ★★[T1151 · ★재민 11-04 "각각 5%, 3%"] 기본 **0.05** · 인정 구성원 **0.03** · 되돌림 `T1137_FEE=0`(수수료 없음 = T1137 앞 바이트).
  //   `T1137_FEE_MEMBER` 를 안 주고 `T1137_FEE` 만 주면 인정 율도 그 값이다(할인 0 — T1137 그대로의 뜻).
  //   끝수(낱개 미만)는 몸 `feeOwe`(사람 × 마을 장부)에 쌓는다 — `trade.js _feeOf` · 아래 `feeOweOf` / `feeOweSet`.
  FEE: Math.max(0, _num('T1137_FEE', 0.05)),
  FEE_MEMBER: Math.max(0, _num('T1137_FEE_MEMBER', (process.env.T1137_FEE != null && process.env.T1137_FEE !== '') ? _num('T1137_FEE', 0.05) : 0.03)),
};

// ★★[T769 2026-10-15 · 재민 판정] *"기부는 가능해. 마음대로 빼는 건 안 돼. 그러니까 거래와 기부를 따로 둬야 하고, 관리자만 뺄 수 있어."*
//   손잡이 `T769_DONATE`(T769 땐 '1' 만 켬 — ★T779 에서 뒤집었다: 아래). 켬이면:
//   ⓐ 꺼내기 = **촌장 한 사람**(소속 게이트 대신 — 길드 마을 = central `GET /tribe/:id` 의 `leader_id` · 길드 칸 없는 사람 마을 = 창설자 `econ.founder` ·
//      NPC 마을 = 사람 꺼내기 0) · 기여 한도(`limitOf` · `Winter.bonusOf`)는 안 쓴다 — 남는 막음은 있던 것만(근접 · 굶는 마을 · 재고) ·
//      central 을 못 물으면 **막는다**(빼는 문은 닫힌 쪽이 안전 — 곳간 짓기의 관용과 반대).
//   ⓑ `/기부 <품목> [양]` — 누구나 · 상시 · 보상 0 · 기여 0(실물 길은 존의 회관 넣기와 같은 문 · `H.donate`).
//   ⓒ `/곳간 열기|잠금` 은 켬에서 한 줄로 답한다(촌장 혼자 꺼내니 문을 정할 일이 없다) · 마을 사람에게 가던 "곳간을 열어 두겠네" 말은 뺀다.
//   소속 · 빈터 · 추방은 무접촉.
// ★★[T779 2026-10-18] **켬 기본**(`'0'` 만 끔). ⓐ ⓒ 는 손잡이 밖이 됐다(옛 기여 한도 인출 · 길드 곳간 잠금을 걷었다 — 끄더라도 돌아올 길이 없다).
//   손잡이가 이제 가르는 것 = ⓑ 기부(`/기부` 명령 · 거래소 패널의 기부 품목 칸 · 존의 회관 관리자 게이트 · 기부 문 · 기부 말).
const T769 = process.env.T769_DONATE !== '0';
// ★★[T1211 2026-11-07 · T1208-K1 회부 1] 손잡이 `T1211_STOCK_FE`(켬 기본 · `=0` = 종전 글자) — `/곳간` 형편 줄의 "먹을 것" = **식량 등가 전체**.
//   종전: `food` 칸 하나만 셌다 — 사냥 고기 · 곡식 · 물고기 · 견과가 곳간에 쌓여도 안 셌다(land1050 e2e-guild 실측: 농촌1 줄 339 ↔ 식량 등가 686 · 고기 345).
//   켬: 수 = `playerVillageWithdrawStockFoodEq`(econ `totalFoodEquivalent` · 꺼내기 한도의 밑변과 같은 함수 · 같은 환산율 `PV_DEPOSIT_RATE`) ·
//     `food` 칸이 그와 다르면 꼬리에 그 칸을 적는다(꺼내기는 품목마다 — `/곳간 식량 N` 은 그 칸에서 나간다).
const T1211_STOCK_FE = process.env.T1211_STOCK_FE !== '0';

// ★★[T1137 2026-11-04 · ★재민 11-03 · 족보 732 · 733] **가입 · 탈퇴는 언제든 · 인정 구성원.**
//   손잡이 `T1137_MEMBER_OPEN` — 켬 기본 후보(`'0'` 만 끔 · 끔 = 종전 소속 문 — 기여 12 + 촌장 권함 + `/소속`).
//   ⓐ `/가입` — 그 마을 가까이(게시판 · 거래소와 같은 근접 게이트) · 촌장이 반기는 말 한 줄 · 문턱 없이 곧 소속(`_seat` 한 줄 · 사본 0).
//      초대제 마을(T785 `joinMode` 'invite')은 종전대로 부름(`/초대` → `/수락`)만.
//   ⓑ 탈퇴 · 추방 = **다시 들기 1시간(실시간)** — 몸 칸 `memberCool`(다시 들 수 있는 때 · epoch ms · `serializeBody` 끝 칸 · 있을 때만 — 없으면 종전 바이트).
//      어느 마을이든 · 드는 문 전부(`/가입` · `/소속` · `/수락` · 첫 의뢰 권함 · 길드원 앉히기)가 같은 술어(`coolLeft`)를 묻는다 · 세운 사람(창설)은 문이 아니라 행위라 안 묻는다.
//   ⓒ **인정 구성원** = 그 마을 사람이고 + 기여(온보딩 계량기 하나 · `contribOf`) ≥ `N_MEMBER`(12 그대로) — 또는 그 마을 촌장. 탈퇴해도 기여는 남는다(다시 들면 곧 인정).
//      쓰이는 자리 둘: 영토 안 개인 사유지(존 `tryClaim` — 새로 · 넓히기) · 거래소 수수료 할인(`feeRateOf`).
const T1137 = process.env.T1137_MEMBER_OPEN !== '0';
let H = null;
function init(host) { H = host || {}; return true; }
function _now() { return (H && typeof H.now === 'function') ? H.now() : Date.now(); }
/** 다시 들 수 있을 때까지 남은 ms(0 = 지금 들 수 있다) — 켬에서만 선다(끔 = 늘 0 · 종전 문). */
function coolLeft(player) {
  if (!T1137 || !player) return 0;
  const t = Number(player.memberCool);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, t - _now());
}
/** 남은 시간을 사람이 읽는 말로(분 · 올림). */
function coolText(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
}
function _coolErr(player) {
  const left = coolLeft(player);
  return left > 0 ? `마을을 떠난 지 얼마 되지 않았습니다. ${coolText(left)} 뒤에 다시 들 수 있습니다.` : null;
}
function ready() { return !!H; }
function _day() { return (H && typeof H.gameDay === 'function') ? (H.gameDay() | 0) : 0; }
function _send(player, text) { try { if (H && H.send && player && player.ws) H.send(player.ws, { type: 'notice', text }); } catch (e) {} }

// ── 기여 — **읽기만 한다**(계량기는 온보딩 정본 하나) ─────────────────────────
function contribOf(playerId) { try { return Onb.stateOf(playerId).contrib | 0; } catch (e) { return 0; } }

// ── 소속 상태 — 몸에 실린다 ──────────────────────────────────────────────────
//   { zone, vid, name, since } — ★[T779] 하루 몫 장부(`wdDay` · `wdUsed`)는 걷었다(옛 몸에 남은 칸은 안 읽는다).
function memberOf(player) {
  const m = player && player.member;
  if (!m || m.vid == null) return null;
  if (H && H.ZONE_ID && m.zone && m.zone !== H.ZONE_ID) return m;   // 다른 존의 소속 — 표시는 되고 인출은 안 된다
  return m;
}
function isMemberHere(player, vid) {
  const m = memberOf(player);
  if (!m) return false;
  if (H && H.ZONE_ID && m.zone !== H.ZONE_ID) return false;
  return (m.vid | 0) === (vid | 0);
}
function _villageName(vid) {
  try {
    const V = H && H.SimVillages;
    const list = (V && V.clientVillages) ? V.clientVillages() : null;
    if (list) { for (const v of list) if ((v.id | 0) === (vid | 0)) return v.name || ''; }
  } catch (e) {}
  return '';
}

// ── ★[T779] 인출 한도(`limitOf` · `remainOf` — f(기여) 단조 · 곳간의 작은 비율 · 겨울 보상 가산)는 걷었다 ─────────
//   꺼내기는 촌장 한 사람이고 한도가 없다(T769 판정) — 남는 막음은 근접 · 굶는 마을 · 재고(아래 `withdraw`).

// ── 전이 — 납품 정본 훅 뒤에서 한 줄로 불린다(`zone.js tryVillageDeliver`) ────
//   ★온보딩의 `onDeliver` **다음**에 온다: 기여가 오른 뒤라야 문턱을 정확히 본다.
function onDeliver(player, r, vid) {
  if (!ready() || !player || !r || !r.ok || !r.done) return;
  if (memberOf(player)) return;                    // 이미 어딘가의 사람이다(한 사람은 한 마을 — K-1)
  const k = contribOf(player.playerId);
  if (k < CFG.N_MEMBER) return;
  if (player._memberOfferVid === (vid | 0)) return;   // 앵무새 금지 — 제안은 마을당 한 번
  player._memberOfferVid = vid | 0;
  player._memberOfferAt = Date.now();
  const nm = _villageName(vid);
  _send(player, `🧓 ${nm ? nm + ' ' : ''}촌장 — 이만하면 우리 마을 사람일세. 받아들이겠거든 채팅에 "/소속"이라 적게.`);
  // ⚠제안과 수락의 **문구가 서로 달라야** 한다 — 같으면 하네스가 둘을 구별 못 하고 자명 통과한다
  //   (실측: 1차 e2e ②가 제안 알림에 걸려 통과했다).
}

// ── 수락 · 탈퇴 · 추방 ───────────────────────────────────────────────────────
//   ★소속을 앉히는 **한 줄**. `accept`(남의 마을에 드는 문)와 `seatFounder`(세운 사람)가 같이 쓴다 — 사본 0.
function _seat(player, v) {
  player.member = { zone: (H && H.ZONE_ID) || null, vid: v | 0, name: _villageName(v), since: _day() };   // ★[T779] 하루 몫 장부 칸 0
  return player.member;
}
function accept(player, vid) {
  if (!ready() || !player) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  if (memberOf(player)) return { ok: false, err: '이미 다른 마을 사람입니다. 먼저 "/탈퇴"라고 적으십시오.' };
  const _ce = _coolErr(player); if (_ce) return { ok: false, err: _ce };   // ★[T1137] 다시 들기 1시간(끔 = 늘 null)
  const v = (vid == null) ? player._memberOfferVid : (vid | 0);
  if (v == null) return { ok: false, err: '촌장이 아직 마을 사람이 되라고 권하지 않았습니다.' };
  const k = contribOf(player.playerId);
  if (k < CFG.N_MEMBER) return { ok: false, err: `아직 이릅니다. 기여가 ${k}만큼 쌓였고 ${CFG.N_MEMBER}이 되어야 합니다.` };
  _seat(player, v);
  return { ok: true, member: player.member, contrib: k };
}
// ★★[T197 2026-09-12 · PM 판정 · 재민 거부권] **창설 = 소속.**
//   기여 12(K-2)는 **남의 마을에 들어가는 문**이다. 세운 사람은 그 문을 지날 이유가 없다 —
//   여태는 제 마을 곳간을 못 열었다(`isMemberHere` 가 먼저 막는다). 문턱을 **우회하지 않는다**:
//   기여를 지어내지 않고(`contribOf` 무변) 소속만 앉힌다. ★[T779] 곳간은 이제 소속이 아니라 촌장 판정이 연다(창설자 = 촌장).
//   ⚠이미 다른 마을 사람이어도 **옮긴다** — 한 사람은 한 마을(K-1)이고, 제가 세운 마을을 두고
//     남의 마을 사람으로 남는 쪽이 더 이상하다. 말은 안 보탠다(건립 알림이 이미 있다 · 새 메시지 0).
// ★★[T202 2026-09-12] **길드원은 제 길드 마을 사람이다** — 마을이 길드 것이면(T197) 그 길드의
//   사람도 그 마을 사람이어야 말이 된다. 기여 12(K-2)는 **남의** 마을에 드는 문이지 제 집 문이 아니다.
//
//   ★자리 — **도착 훅 하나**다(`zone.js` 접속 경로). §0-ⓐ 실측: 사람이 마을에 "온다"는 사건을
//     서버가 아는 자리는 **접속뿐**이다(첫 접속 `?start_vid=` · 재접속·몸 승계 · 존 핸드오프 —
//     셋이 전부 같은 경로로 모인다). "걸어서 영토 진입"은 **서버 훅이 없다**: 근접(`_villageNear` 260px)은
//     브리핑·게시판·거래소·인출이 **물을 때만** 재는 술어다. 걸어 들어온 사람도 그 전에 접속은 했으므로
//     이 한 자리가 셋을 다 덮는다.
//
//   ⚠⚠**이미 어느 마을 사람이면 안 건드린다.** 카드는 "다른 마을 사람이면 옮긴다(K-1)"였는데,
//     실측해 보니 그 규약은 여기서 **덫**이 된다(보고 §0-ⓑ · 회부 1):
//       기여 12 로 NPC 마을 A 에 든 사람이 길드 마을 B 를 가진 길드에 들면 → 접속마다 B 로 끌려간다.
//       `/탈퇴` 하고 A 에 다시 들어도(납품 한 번이면 촌장이 다시 권한다) **다음 접속에 또 끌려간다.**
//     T197 의 옮김은 **창설**이라는 사람의 행위 한 번이었다. 이건 배경 규칙이고, 배경 규칙이 사람의
//     선택을 매번 되돌리면 그건 문이 아니라 벽이다(§9.1). ⇒ **빈자리일 때만 앉힌다.**
//     그래서 `/탈퇴` 가 곧 "제 길드 마을로 돌아가는 문"이 된다 — 새 말 0 · 새 수 0.
//   ⚠무길드·타길드·소속 있음은 전부 **무변**(기여 문 그대로).
function seatGuildMember(player) {
  if (!ready() || !player || !player.tribeId) return null;
  if (memberOf(player)) return null;                       // 이미 어딘가의 사람 — 안 건드린다(위 ⚠)
  if (coolLeft(player) > 0) return null;                    // ★[T1137] 다시 들기 1시간 — 배경 앉히기도 같은 술어(끔 = 늘 0)
  const V = H.SimVillages;
  const list = (V && V.playerVillages) ? V.playerVillages() : null;
  if (!list || !list.length) return null;
  let best = null, bd = Infinity;
  for (const vil of list) {
    if (vil._tribeId == null || String(vil._tribeId) !== String(player.tribeId)) continue;
    //   여럿이면 **선 자리에서 가까운** 것 — 도착한 곳이 제 마을이다(새 수 0 · 거리는 있던 산수).
    const d = Math.hypot((vil.ccx | 0) * 32 - (player.x || 0), (vil.ccy | 0) * 32 - (player.y || 0));
    if (d < bd) { bd = d; best = vil; }
  }
  if (!best) return null;
  _seat(player, best.dbId | 0);
  return player.member;
}
// ★[T785] 켬 — 부름(`/초대` → `/수락` · `village-kin.js`)으로 드는 문. 옛 길드 부름은 기여 문턱 없이 길드에 들었고(그 뒤 T202 가 길드 마을에 앉혔다)
//   마을이 곧 길드이니 같은 사람이 같은 문턱 없이 마을에 든다 · 이미 어느 마을 사람이면 안 앉힌다(한 사람은 한 마을 · K-1).
function seatByInvite(player, vid) {
  if (!ready() || !player || vid == null) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  if (memberOf(player)) return { ok: false, err: '이미 다른 마을 사람입니다.' };
  const _ce = _coolErr(player); if (_ce) return { ok: false, err: _ce };   // ★[T1137] 다시 들기 1시간(끔 = 늘 null)
  _seat(player, vid | 0);
  player._memberOfferVid = null;
  return { ok: true, member: player.member };
}
function seatFounder(player, vid) {
  if (!ready() || !player || vid == null) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  const was = memberOf(player);
  _seat(player, vid | 0);
  return { ok: true, member: player.member, moved: !!(was && (was.vid | 0) !== (vid | 0)) };
}
// ★탈퇴해도 **기여는 남는다**(이력서 캐논 §2 — 한 일은 없던 일이 되지 않는다).
//   빈터 권리·사유지는 이 축과 무관하다(§13 · T45 의 몫).
function leave(player, why) {
  const m = memberOf(player);
  if (!m) return { ok: false, err: '속한 마을이 없습니다.' };
  player.member = null;
  player._memberOfferVid = null;
  if (T1137) player.memberCool = _now() + CFG.REJOIN_MS;   // ★[T1137] 탈퇴 · 추방 = 다시 들기 1시간(몸 칸 — 재접속 · 넘기에 따라간다)
  return { ok: true, was: m, contrib: contribOf(player.playerId), why: why || 'self' };
}
// ★추방 — **촌장이 한다**. 최소 조건만: 그 마을 사람이어야 하고, 쫓는 쪽이 그 마을 사람이어야 한다.
//   남용 경로(대량 추방·재가입 폭주)는 §5 대로 유보다 — 여기서 짐작으로 막지 않는다.
function expel(byPlayer, targetPlayer) {
  const mine = memberOf(byPlayer);
  if (!mine) return { ok: false, err: '이 마을 사람이 아니다' };
  if (!isMemberHere(targetPlayer, mine.vid)) return { ok: false, err: '그 사람은 이 마을 사람이 아니다' };
  const r = leave(targetPlayer, 'expel');
  if (r.ok) _send(targetPlayer, `🧓 ${mine.name || ''} 촌장 — 자네는 이제 우리 마을 사람이 아닐세.`);
  return r;
}

// ── ★[T1137] 가입 — 그 마을 가까이에서 · 문턱 없이 ─────────────────────────────────
//   근접 = 브리핑 · 게시판 · 거래소 · 꺼내기와 **같은 게이트**(`villageWithdrawGate` · 260px) · 어느 마을인가 = 앞에 선 마을(`_memberNearVid`) · 없으면 가장 가까운 마을.
function _nearVil(player, vid) {
  const V = H && H.SimVillages;
  if (!V || !V.villageWithdrawGate) return { err: '마을을 찾지 못했습니다.' };
  if (vid != null) return V.villageWithdrawGate(vid | 0, player.x, player.y);
  const list = (V.clientVillages && V.clientVillages()) || [];
  let best = null;
  for (const c of list) { const g = V.villageWithdrawGate(c.id | 0, player.x, player.y); if (!g.err) { const d = Math.hypot((g.vil.ccx | 0) * 32 - player.x, (g.vil.ccy | 0) * 32 - player.y); if (!best || d < best.d) best = { g, d }; } }
  return best ? best.g : { err: '마을에서 너무 멉니다. 들고 싶은 마을 가까이 가십시오.' };
}
function join(player, vid) {
  if (!T1137) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  if (!ready() || !player) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  const m = memberOf(player);
  if (m) return { ok: false, err: `이미 ${m.name || '다른 마을'} 사람입니다. 옮기려면 먼저 "/탈퇴"라고 적으십시오.` };
  const _ce = _coolErr(player); if (_ce) return { ok: false, err: _ce };
  const g = _nearVil(player, vid);
  if (g.err) return { ok: false, err: g.err };
  const v = g.vil.dbId | 0;
  //   초대제 마을(T785)은 부름으로만 — 종전 `/소속` 막음과 같은 말
  if (VillageKin.ON && typeof VillageKin.joinModeOfVid === 'function' && VillageKin.joinModeOfVid(v) === 'invite') {
    return { ok: false, err: `${g.vil.name || ''}은(는) 부름을 받아야 들 수 있습니다. 마을 사람에게 "/초대"를 청하십시오.` };
  }
  _seat(player, v);
  player._memberOfferVid = null; player._t1086Offer = null;
  return { ok: true, member: player.member, contrib: contribOf(player.playerId), recognized: isRecognized(player, v) };
}
/** ★[T1137] 인정 구성원 — 그 마을 사람 + 기여 ≥ `N_MEMBER`(계량기 하나) · 또는 그 마을 촌장. 끔 = 늘 거짓(쓰는 자리가 다 켬 갈래). */
function isRecognized(player, vid) {
  if (!T1137 || !player || vid == null || !isMemberHere(player, vid)) return false;
  if (contribOf(player.playerId) >= CFG.N_MEMBER) return true;
  try { const vil = H && H.SimVillages && H.SimVillages.villageByDbId ? H.SimVillages.villageByDbId(vid | 0) : null; if (vil && VillageKin.ON && VillageKin.isChief(player, vil)) return true; } catch (e) {}
  return false;
}
/** ★[T1137] 이 사람이 이 마을 거래소에서 낼 수수료율 — 인정 구성원 = `FEE_MEMBER` · 그 밖 = `FEE`(가입만으로는 할인 0). */
function feeRateOf(player, vid) {
  if (!T1137) return 0;
  return isRecognized(player, vid) ? CFG.FEE_MEMBER : CFG.FEE;
}
// ★★[T1151] 수수료 끝수 장부 — 몸 칸 `feeOwe` = { 마을 id: 끝수(소수 둘째 자리 · 0 ≤ x < 1) } · 재접속 · 넘기에 따라간다(`serializeBody` 끝 칸 · 있을 때만).
function feeOweOf(player, vid) {
  const m = player && player.feeOwe;
  const x = (m && typeof m === 'object') ? Number(m[vid | 0]) : 0;
  return Number.isFinite(x) && x > 0 ? x : 0;
}
function feeOweSet(player, vid, owe) {
  if (!player) return;
  const x = Math.round((Number(owe) || 0) * 100) / 100;
  const m = (player.feeOwe && typeof player.feeOwe === 'object') ? Object.assign({}, player.feeOwe) : {};
  if (x > 0) m[vid | 0] = x; else delete m[vid | 0];
  if (Object.keys(m).length) player.feeOwe = m; else delete player.feeOwe;
}

// ── 인출 — 곳간에서 꺼낸다 ───────────────────────────────────────────────────
//   ★실물 이동은 `villages.playerVillageWithdraw`(납품의 역연산) 하나다. 여기서 정하는 것은 **누가**뿐이다 —
//     촌장(아래 `withdrawChief` 가 판정해 `chiefOk` 로 넘긴다 · T769). 판정을 안 거쳐 온 부름은 막는다.
//   ★[T779] **얼마나 = 한도 없음** — 옛 기여 한도 · 하루 몫 장부 · 겨울 보상 · 길드 곳간 잠금은 걷었다.
//     남는 막음은 있던 것만: 근접(`villageWithdrawGate`) · 굶는 마을(`villageFamine`) · 재고(`playerVillageWithdraw`).
//   반환: { ok, name, chief, res, item, qty, units, stockAfter } · 막을 이유가 있으면 { ok:false, err }
function withdraw(player, vid, res, qty, chiefOk) {
  if (!ready()) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  const V = H.SimVillages;
  if (!V || !V.villageWithdrawGate || !V.playerVillageWithdraw) return { ok: false, err: '곳간을 찾지 못했습니다.' };
  if (chiefOk !== true) return { ok: false, err: '곳간은 촌장만 열 수 있습니다.' };
  const g = V.villageWithdrawGate(vid | 0, player.x, player.y);   // ★브리핑·게시판과 **같은 근접 게이트**
  if (g.err) return { ok: false, err: g.err };
  // ★★[T159] **굶는 마을은 곳간을 안 연다.** 판정은 엔진이 매일 적어 둔 것을 읽는다(`villageFamine`).
  //   곳간이 남아 있어도 그 남은 것이 마을을 겨울까지 살릴 몫이면 사람에게 내주는 것이 마을을 죽인다 — 촌장에게도 그대로다.
  if (V.villageFamine && V.villageFamine(g.vil)) {
    return { ok: false, err: '마을이 굶고 있어 오늘은 곳간을 열지 않습니다.' };
  }
  const r0 = String(res || 'food');
  //   양을 안 적었으면 **한 단위**(옛 `Math.max(1, …)` 바닥 그대로 · 새 수 0).
  const take = Math.max(1, Math.floor(Number(qty) || 0) || 1);
  //   ★[T732] 존이 곳간 문 감싸개를 줬으면(로트 장부 켬 — 곳간이 뗀 레코드를 사람에게 싣는다) 그 안에서 부른다 · 안 줬으면 그대로.
  const _wd = () => V.playerVillageWithdraw(g.vil, player.inventory, r0, take);
  const r = (typeof H.wrapWithdraw === 'function') ? H.wrapWithdraw(player, _wd) : _wd();
  if (!r.ok) return r;
  return Object.assign({ ok: true, name: g.vil.name, chief: true }, r);
}

// ── ★★[T769] 촌장 판정 — **이미 있는 두 표지**만 읽는다(새 권한 개념 0) ─────────────────
//   ① 길드 마을(`vil._tribeId`) = central `GET /tribe/:id` 의 `leader_id`(곳간 짓기 `zone.tryBuildGuildGranary` 그 검사) ·
//      캐시 창은 `GRAN_TTL_MS`(길드 곳간 문과 같은 창 · 새 수 0) · 못 물으면 **막는다**(빼는 문은 닫힌 쪽이 안전).
//   ② 길드 칸 없는 사람 마을 = 창설자(`econ.founder`) · ③ NPC 마을(창설자 없음) = 사람 꺼내기 0.
//   ★판정이 그 자리에서 서면(② · ③ · ① 캐시 창 안) **동기**다 — 종전 꺼내기 문과 같은 때에 끝난다. ① 캐시가 비었을 때만 central 을 묻는다(비동기).
const _lead = new Map();      // tribeId → { leader, at }
async function _leaderOf(tid) {
  const id = tid | 0;
  const hit = _lead.get(id);
  if (hit && Date.now() - hit.at < CFG.GRAN_TTL_MS) return hit.leader;
  if (!H || !H.central || typeof H.central.request !== 'function') return null;
  try {
    const r = await H.central.request('GET', `/tribe/${id}`);
    const lid = r && r.data && r.data.tribe && r.data.tribe.leader_id;
    if (lid == null || lid === '') return null;
    _lead.set(id, { leader: String(lid), at: Date.now() });
    return String(lid);
  } catch (e) { return null; }
}
const _NOT_CHIEF = '곳간은 촌장만 열 수 있습니다.';
/** 그 자리에서 서는 판정 — `{ ok, err }` · 모르면 `null`(길드 촌장 캐시가 비었다 — central 을 물어야 한다). */
function _chiefNow(player, vil) {
  if (!vil || !vil.econ || !vil.econ.founder) return { ok: false, err: '이 마을 곳간은 사람이 열지 않습니다.' };
  //   ★[T786 ②] T785 켬 = 촌장은 마을 칸 하나(`VillageKin.isChief`) — central `leader_id` 조회 · 캐시 창(①)을 안 탄다(늘 그 자리에서 선다).
  if (VillageKin.ON) return VillageKin.isChief(player, vil) ? { ok: true } : { ok: false, err: _NOT_CHIEF };
  const pid = String(player && player.playerId);
  const tid = vil._tribeId | 0;
  if (!tid) return String(vil.econ.founder) === pid ? { ok: true } : { ok: false, err: _NOT_CHIEF };
  const hit = _lead.get(tid);
  if (hit && Date.now() - hit.at < CFG.GRAN_TTL_MS) return hit.leader === pid ? { ok: true } : { ok: false, err: _NOT_CHIEF };
  return null;
}
/** 캐시만 본다(화면 한 줄용 · 동기) — 모르면 `null`(그때는 묻기를 걸어 둔다). */
function chiefCached(player, vil) {
  if (!player) return false;
  const now = _chiefNow(player, vil);
  if (now) return now.ok;
  _leaderOf(vil._tribeId | 0).catch(() => {});
  return null;
}
async function chiefCheck(player, vil) {
  const now = _chiefNow(player, vil);
  if (now) return now;
  const lid = await _leaderOf(vil._tribeId | 0);
  if (lid == null) return { ok: false, err: '촌장을 확인하지 못해 곳간을 열지 않았습니다. 잠시 뒤 다시 해 보십시오.' };
  return lid === String(player.playerId) ? { ok: true } : { ok: false, err: _NOT_CHIEF };
}
// 켬의 꺼내기 문 — 근접 게이트로 마을을 찾고 → 촌장 판정 → `withdraw` 정본(같은 실물 길).
//   반환 = 판정이 그 자리에서 서면 결과 그대로(동기) · central 을 물어야 하면 그 결과의 Promise(부르는 쪽 둘 — 존의 문 · 채팅 — 이 둘 다 받는다).
function withdrawChief(player, vid, res, qty) {
  if (!ready()) return { ok: false, err: '아직 준비가 되지 않았습니다.' };
  const V = H.SimVillages;
  if (!V || !V.villageWithdrawGate) return { ok: false, err: '곳간을 찾지 못했습니다.' };
  const g = V.villageWithdrawGate(vid | 0, player.x, player.y);
  if (g.err) return { ok: false, err: g.err };
  const now = _chiefNow(player, g.vil);
  if (now) return now.ok ? withdraw(player, vid, res, qty, true) : now;
  return chiefCheck(player, g.vil).then((c) => (c.ok ? withdraw(player, vid, res, qty, true) : c));
}

// ── ★★[T159 2026-09-07] 품목 이름 → 곳간 재화 ────────────────────────────────
//   §0-ⓐ 실측: 곳간이 아는 것은 **재화**(`food`·`wood`…)이고 사람이 부르는 것은 **품목**(보리·나무…)이다.
//   `/인출` 은 재화 키를 그대로 받았다(영문) — 사람이 쓸 말이 아니다. `/곳간` 은 우리말을 받는다.
//   ⚠표를 여기 새로 적지 않는다. 셋 다 **남의 정본**이다:
//     ① 재화 키 그대로 · ② `ItemLabel.CATEGORY_KO`(재화의 우리말) · ③ `playerVillageDepositMap()`(품목→재화)
//     ④ 품목의 우리말은 존이 들고 있는 이름표(`H.itemLabel()`)로 푼다 — 표가 뒤에 완성되므로 **함수로** 받는다.
const _stripEmo = (x) => String(x || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();
function resolveRes(word) {
  const w = String(word || '').trim();
  if (!w) return null;
  const V = H && H.SimVillages;
  const dep = (V && V.playerVillageDepositMap) ? V.playerVillageDepositMap() : {};
  const resKeys = new Set(Object.values(dep));
  if (resKeys.has(w)) return w;                                   // ① 재화 키 그대로
  for (const [res, ko] of Object.entries(ItemLabel.CATEGORY_KO || {})) {  // ② 재화의 우리말
    if (_stripEmo(ko) === w && resKeys.has(res)) return res;
  }
  if (dep[w]) return dep[w];                                      // ③ 품목 키
  let labels = null;                                              // ④ 품목의 우리말
  try { labels = (H && typeof H.itemLabel === 'function') ? H.itemLabel() : null; } catch (e) { labels = null; }
  if (labels) {
    for (const item of Object.keys(dep)) {
      const ko = ItemLabel.koOfLabel(labels[item] || '');
      if (ko && (ko === w || _stripEmo(ko) === w)) return dep[item];
    }
  }
  return null;
}
// ★[T769] `/기부` 가 낼 **품목**(손에 든 것) — 표는 위 `resolveRes` 와 같은 셋(대응표 · 품목 이름표 · 재화 우리말)이다(사본 0).
//   ① 품목 키 · ② 품목의 우리말 · ③ 재화 말(키 · 우리말) → 그 재화로 접히는 품목 중 손에 든 첫 것.
function resolveItem(word, inventory) {
  const w = String(word || '').trim();
  if (!w) return null;
  const V = H && H.SimVillages;
  const dep = (V && V.playerVillageDepositMap) ? V.playerVillageDepositMap() : {};
  if (dep[w]) return w;
  let labels = null;
  try { labels = (H && typeof H.itemLabel === 'function') ? H.itemLabel() : null; } catch (e) { labels = null; }
  if (labels) {
    for (const item of Object.keys(dep)) {
      const ko = ItemLabel.koOfLabel(labels[item] || '');
      if (ko && (ko === w || _stripEmo(ko) === w)) return item;
    }
  }
  const res = resolveRes(w);
  if (!res) return null;
  for (const item of Object.keys(dep)) if (dep[item] === res && (Number((inventory || {})[item]) || 0) >= 1) return item;
  return null;
}
/** 사람이 읽을 재화 이름 — 없으면 키 그대로. */
function resKo(res) { return _stripEmo((ItemLabel.CATEGORY_KO || {})[res] || '') || String(res || ''); }

// ── ★[T779] 길드 곳간 잠금(T159 `granaryOpen` · `granaryBust` — 마을 사람이 꺼낼 수 있는지를 길드장이 정하던 문)은 걷었다 ──
//   꺼내는 사람이 곧 촌장(길드 마을 = 길드장)이라 정할 문이 없다. central 의 `tribes.granary_open` 칸 · `tribeGranarySet` 은 그대로(central 무접촉).

// ── 복귀 브리핑 — 소속 마을 사건이 앞줄 ───────────────────────────────────────
//   ★T7 접점 하나. **줄을 새로 짜지 않는다** — `Events.briefLine`(정본)으로 다시 그린다.
//   무엇이 보이는가는 여전히 `visibleEvents` 술어 하나가 정한다(순서만 바꾼다).
function orderBrief(player, brief) {
  const m = memberOf(player);
  if (!m || !brief || !brief.returned || !Array.isArray(brief.rows) || brief.rows.length < 2) return false;
  const home = m.vid | 0;
  const mine = [], rest = [];
  for (const row of brief.rows) ((row && row.ev && (row.ev.vid | 0) === home) ? mine : rest).push(row);
  if (!mine.length || !rest.length) return false;               // 순서가 안 바뀐다 — 손대지 않는다
  const rows = mine.concat(rest);
  const lines = rows.map((r) => Events.briefLine(r.ev)).filter(Boolean);
  if (!lines.length) return false;
  const head = brief.lines.length && /만이군/.test(brief.lines[0]) ? brief.lines[0] : null;
  brief.lines = (head ? [head] : []).concat(lines);
  brief.rows = rows;
  brief.homeFirst = mine.length;
  return true;
}

// ── 채팅 명령 — **새 클라 조건 0**(채팅은 이미 있다) ─────────────────────────
//   `/소속` · `/탈퇴` · `/추방 <이름>` · `/인출 [수량]`
//   반환 true 면 zone.js 가 이 줄을 **방송하지 않는다**(명령은 말이 아니다).
function handleChat(player, text) {
  if (!ready() || !player) return false;
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return false;
  const [cmd, ...rest] = t.split(/\s+/);
  const near = (player._memberNearVid != null) ? player._memberNearVid : null;
  //   ★[T1137] `/가입` — 그 마을 가까이에서 · 문턱 없이(켬에서만 명령 · 끔 = 종전처럼 말로 흘러간다)
  if (cmd === '/가입' && T1137) { _joinSay(player, near); return true; }
  if (cmd === '/소속') {
    const m = memberOf(player);
    if (m) {
      const vr = T1137 ? (isRecognized(player, m.vid) ? ' 인정 구성원입니다.' : ` 구성원으로 인정되기까지 부탁 ${Math.max(0, CFG.N_MEMBER - contribOf(player.playerId))}건이 남았습니다.`) : '';
      _send(player, `🏘️ ${m.name || '마을'} 사람이 된 지 ${_day() - (m.since | 0)}일째입니다. 지금까지 쌓은 기여는 ${contribOf(player.playerId)}입니다.${vr}`); return true;
    }
    //   ★[T1137] 켬 — 권함이 없으면 `/가입` 과 같은 문(문턱 없이 앞에 선 마을)
    if (T1137 && player._memberOfferVid == null) { _joinSay(player, near); return true; }
    const r = accept(player, null);
    if (!r.ok) { _send(player, `🏘️ ${r.err}`); return true; }
    //   ★[T769 · T779] 곳간은 촌장만 꺼낸다 — 마을 사람에게 가던 "곳간을 열어 두겠네("/인출")" 말은 걷었다.
    _send(player, `🧓 ${r.member.name || ''} 촌장 — 오늘부터 자네는 우리 마을 사람일세.`);
    return true;
  }
  if (cmd === '/탈퇴') {
    const r = leave(player, 'self');
    _send(player, r.ok ? `🏘️ ${r.was.name || '마을'}을 떠났습니다. 쌓은 기여 ${r.contrib}은 그대로 남습니다.`
      + (T1137 ? ` 다시 들려면 ${coolText(CFG.REJOIN_MS)}을 기다려야 합니다. 영토 안에 잡아 둔 내 땅은 그대로 내 것입니다.` : '') : `🏘️ ${r.err}`);
    return true;
  }
  if (cmd === '/추방') {
    const nm = rest.join(' ').trim();
    if (!nm) { _send(player, '🏘️ 누구를 내보내시겠습니까? "/추방 <이름>"처럼 적으십시오.'); return true; }
    let tgt = null;
    try { for (const p of (H.players ? H.players.values() : [])) if (!p.isNpc && p.name === nm) { tgt = p; break; } } catch (e) {}
    if (!tgt) { _send(player, `🏘️ ${nm} 님은 지금 여기 없습니다.`); return true; }
    const r = expel(player, tgt);
    _send(player, r.ok ? `🏘️ ${nm} 님을 마을에서 내보냈습니다.` : `🏘️ ${r.err}`);
    return true;
  }
  // ★★[T159] `/곳간` — 사람이 쓰는 말로 꺼낸다. **인출 경로는 하나다**(촌장 문 `withdrawChief` → `withdraw`) — 여기서 다시 안 푼다.
  if (cmd === '/곳간') {
    const m = memberOf(player);
    const vid = m ? (m.vid | 0) : near;
    const a0 = (rest[0] || '').trim();
    // ⓐ `/곳간 열기|잠금` — ★[T779] 길드 곳간 잠금은 걷었다(촌장 혼자 꺼내니 정할 문이 없다) · 한 줄로 답한다(central 무접촉)
    if (a0 === '열기' || a0 === '잠금') { _send(player, '🏘️ 곳간은 촌장만 열 수 있습니다.'); return true; }
    // ⓑ `/곳간` — 지금 형편 한 줄(꺼내지 않는다) · 누구나 그 마을 앞에서 본다 · 한도가 없다(오늘 남은 몫 · 기여 문턱을 안 적는다)
    //   ★[T779] 기부 말은 기부 문이 열린 판에서만(`T769_DONATE` — 끄면 그 꼬리만 빠진다)
    if (!a0) {
      if (vid == null) { _send(player, '🏘️ 마을에서 너무 멉니다. 곳간 앞으로 가십시오.'); return true; }
      const V = H.SimVillages; const g = V.villageWithdrawGate(vid | 0, player.x, player.y);
      if (g.err) { _send(player, `🏘️ ${g.err}`); return true; }
      const st = V.playerVillageWithdrawStock(g.vil, 'food');
      const fe = (T1211_STOCK_FE && V.playerVillageWithdrawStockFoodEq) ? V.playerVillageWithdrawStockFoodEq(g.vil) : st;   // ★[T1211] 켬 = 식량 등가 전체
      _send(player, `🏘️ ${g.vil.name || '마을'} 곳간에 먹을 것이 ${fe} 있습니다${fe !== st ? `(그중 식량 ${st})` : ''}. 꺼내는 것은 촌장만 할 수 있습니다.`
        + (T769 ? ' 내놓는 것은 누구나 할 수 있습니다("/기부 <품목> [양]" · 대가는 없습니다).' : '')
        + (V.villageFamine && V.villageFamine(g.vil) ? ' **마을이 굶고 있습니다.**' : ''));
      return true;
    }
    // ⓒ `/곳간 <품목> [양]` — 품목을 앞에 둔다(사람이 그렇게 말한다) · 촌장 판정 뒤 같은 정본
    if (vid == null) { _send(player, '🏘️ 마을에서 너무 멉니다. 곳간 앞으로 가십시오.'); return true; }
    const r0 = resolveRes(a0);
    if (!r0) { _send(player, `🏘️ 곳간에 "${a0}"은(는) 없습니다.`); return true; }
    const n = parseInt(rest[1], 10);
    _chiefWithdrawSay(player, vid, r0, n);
    return true;
  }
  if (cmd === '/인출') {
    const m = memberOf(player);
    const vid = m ? (m.vid | 0) : near;
    if (vid == null) { _send(player, '🏘️ 마을에서 너무 멉니다. 곳간 앞으로 가십시오.'); return true; }
    _chiefWithdrawSay(player, vid, rest[1] || 'food', parseInt(rest[0], 10));   // ★[T769 · T779] 촌장 판정 뒤 같은 정본
    return true;
  }
  // ★★[T769] `/기부 <품목> [양]` — 누구나 · 상시 · 보상 0 · 기여 0. **켬에서만** 명령이다(끔 = 종전처럼 말로 흘러간다 · main 바이트).
  //   어느 마을인가 = **지금 앞에 선 마을**(브리핑 · 거래소가 적어 둔 자리) — 없으면 소속 마을. 근접 게이트는 존의 문(`H.donate`)이 다시 잰다.
  //   양을 안 적으면 든 것 전부(회관 패널의 넣기 단추와 같은 문법 — 서버가 최종 판정).
  if (cmd === '/기부' && T769) {
    const m = memberOf(player);
    const vid = (near != null) ? near : (m ? (m.vid | 0) : null);
    if (vid == null) { _send(player, '🏘️ 마을에서 너무 멉니다. 마을 가까이 가십시오.'); return true; }
    const a0 = (rest[0] || '').trim();
    if (!a0) { _send(player, '🏘️ 무엇을 내놓으시겠습니까? "/기부 <품목> [양]"처럼 적으십시오. 대가는 없습니다.'); return true; }
    const item = resolveItem(a0, player.inventory);
    if (!item) { _send(player, `🏘️ "${a0}"은(는) 곳간이 받지 않는 물건입니다.`); return true; }
    const have = Math.floor(Number((player.inventory || {})[item]) || 0);
    if (have < 1) { _send(player, `🏘️ ${a0}을(를) 들고 있지 않습니다.`); return true; }
    const n = parseInt(rest[1], 10);
    const q = (Number.isFinite(n) && n > 0) ? Math.min(n, have) : have;
    if (typeof H.donate !== 'function') { _send(player, '🏘️ 지금은 내놓은 것을 받을 수 없습니다.'); return true; }
    H.donate(player, vid, { [item]: q });
    return true;
  }
  return false;
}
// ★[T1137] 가입 말 — 촌장이 반기는 한 줄 · 인정이면 얻는 것 한 줄
function _joinSay(player, near) {
  const r = join(player, near);
  if (!r.ok) { _send(player, `🏘️ ${r.err}`); return r; }
  const left = Math.max(0, CFG.N_MEMBER - (r.contrib | 0));
  _send(player, `🧓 ${r.member.name || ''} 촌장 — 잘 왔네. 오늘부터 자네는 우리 마을 사람일세.`
    + (r.recognized ? ' 이미 인정 구성원입니다. 거래소 할인과 영토 안 집터가 열렸습니다.' : ` 마을 부탁을 ${left}건 더 채우면 구성원으로 인정됩니다(거래소 할인 · 영토 안 집터).`));
  return r;
}
// ★[T769] 채팅 꺼내기 — 촌장 판정 뒤 결과를 말한다(실물 · 뒷정리는 같은 정본 · 같은 `afterWithdraw`). 판정이 그 자리에서 서면 동기 · central 을 물으면 그 뒤.
function _chiefWithdrawSay(player, vid, res, qty) {
  const say = (r) => {
    if (!r || !r.ok) { _send(player, `🏘️ ${(r && r.err) || '곳간을 열지 못했습니다.'}`); return; }
    if (H.afterWithdraw) H.afterWithdraw(player, r);
  };
  const r = withdrawChief(player, vid, res, qty);
  if (r && typeof r.then === 'function') r.then(say).catch(() => _send(player, '🏘️ 곳간을 열지 못했습니다. 잠시 뒤 다시 해 보십시오.'));
  else say(r);
}

// ── 클라에 실어 보내는 상태(거래소 패널 한 줄이 읽는다 — 새 패널 0) ───────────
//   ★[T769] `chief` = 캐시된 촌장 판정(모르면 null — 묻기를 걸어 둔다 · 꺼내기 문은 언제나 다시 묻는다).
//   ★[T779] 옛 한도 칸(`limit` · `remain`)과 곳간 재고 인자는 걷었다 · `donate` = 곳간이 받는 품목(대응표 정본의 키)은 기부 문이 열린 판에서만.
function publicState(player, vil) {
  const m = memberOf(player);
  const k = contribOf(player.playerId);
  const out = {
    vid: m ? (m.vid | 0) : null, name: m ? (m.name || '') : '',
    since: m ? (m.since | 0) : null, contrib: k, need: CFG.N_MEMBER,
    offer: (!m && player._memberOfferVid != null) ? (player._memberOfferVid | 0) : null,
    chief: vil ? chiefCached(player, vil) : false,
  };
  if (T1137) {   // ★[T1137] 켬에서만 칸(끔 = 종전 바이트)
    out.open = true;
    out.recognized = m ? isRecognized(player, m.vid) : false;
    out.coolMs = coolLeft(player);
    if (vil) { out.fee = feeRateOf(player, vil.dbId | 0); out.feeBase = CFG.FEE; out.feeMember = CFG.FEE_MEMBER; out.feeOwe = feeOweOf(player, vil.dbId | 0); }   // ★[T1151] 이 마을에 쌓인 끝수
  }
  if (T769) {
    const V = H && H.SimVillages;
    out.donate = Object.keys((V && V.playerVillageDepositMap) ? V.playerVillageDepositMap() : {});
  }
  return out;
}

// ── ★★[T1086 2026-11-02] 첫 의뢰 = 마을 사람 권함(★재민 11-01 "마을 가입 · 개인 사유지 강하게 유도" · 카드 "첫 의뢰 뒤 바로") ──────
//   손잡이 `T1086_FIRST_JOIN` — 켬 기본 후보(`'0'` 만 끔 · 끔이면 아래 셋을 아무도 안 부른다 = 종전 K-2 · 종전 바이트).
//   ⓐ `offerFirst` — 온보딩이 **시작 마을 의뢰 하나를 다 채운 순간**(또는 다시 접속했을 때 빈터 권리가 서 있으면) 권함 자리만 건다.
//      말은 촌장 대사 한 통이 한다(온보딩 'hook' · 'offer' — 종전 권함 알림은 안 낸다 · 같은 말을 두 번 안 한다).
//   ⓑ `firstJoinChat` — 그 권함에 `/소속` 이면 앉힌다. 문턱은 `N_MEMBER` 대신 **시작 마을 빈터 권리**(= 그 마을 의뢰를 하나 다 채웠다)다.
//      계량기는 그대로 하나(`contribOf` 무변 · 기여를 지어내지 않는다) · 앉히는 줄은 `_seat` 하나(사본 0).
//      ⚠종전 문턱을 넘은 사람(기여 ≥ `N_MEMBER`)은 종전 문(`accept` · 종전 말)이 받는다 — 이 문은 문턱 아래만.
//   ⓒ `joinOf` — 「지금 할 일」 칸이 읽는 가입 형편 `{ member, offer }`(온보딩 메시지의 `join` 칸 · 존이 부르는 법만 넘긴다).
const T1086 = process.env.T1086_FIRST_JOIN !== '0';
function offerFirst(player, vid) {
  if (!T1086 || !ready() || !player || vid == null) return false;
  if (memberOf(player)) return false;                                     // 한 사람은 한 마을(K-1)
  if (player._memberOfferVid === (vid | 0)) return false;                 // 이미 권했다(앵무새 금지 — 종전 `onDeliver` 와 같은 자리)
  //   초대제 마을은 기여로 권하지 않는다(T785 — 존의 납품 문이 `Membership.onDeliver` 를 안 부르는 그 판정)
  if (VillageKin.ON && typeof VillageKin.joinModeOfVid === 'function' && VillageKin.joinModeOfVid(vid | 0) === 'invite') return false;
  player._memberOfferVid = vid | 0;
  player._memberOfferAt = Date.now();
  player._t1086Offer = vid | 0;                                            // 이 권함이 첫 의뢰 권함이라는 표지(몸의 메모리 칸 · 저장 0 — 종전 권함과 같다)
  return true;
}
function joinOf(player) {
  if (!player) return null;
  const m = memberOf(player);
  return { member: m ? { vid: m.vid | 0, name: m.name || '' } : null,
    offer: (!m && player._memberOfferVid != null) ? (player._memberOfferVid | 0) : null };
}
function firstJoinChat(player, text) {
  if (!T1086 || !ready() || !player) return false;
  if (String(text || '').trim().split(/\s+/)[0] !== '/소속') return false;
  if (memberOf(player)) return false;                                     // 이미 마을 사람 — 종전 문이 형편을 되읊는다
  if (coolLeft(player) > 0) return false;                                 // ★[T1137] 다시 들기 1시간 — 종전 문(`/소속`)이 남은 시간을 말한다
  const v = player._memberOfferVid;
  if (v == null || player._t1086Offer !== (v | 0)) return false;          // 첫 의뢰 권함이 아니면 종전 문(K-2)
  if (contribOf(player.playerId) >= CFG.N_MEMBER) return false;           // 종전 문턱을 넘었으면 종전 문이 받는다(같은 결과 · 종전 말)
  const s = Onb.stateOf(player.playerId);
  if (!s.lot_ok || s.start_vid == null || (s.start_vid | 0) !== (v | 0)) return false;   // 시작 마을 · 빈터 권리(= 그 마을 의뢰를 하나 다 채웠다)
  if (VillageKin.ON && typeof VillageKin.joinModeOfVid === 'function' && VillageKin.joinModeOfVid(v | 0) === 'invite') return false;   // 그새 초대제 — 종전 문이 답한다
  _seat(player, v | 0);
  player._memberOfferVid = null;
  player._t1086Offer = null;
  //   촌장의 말 — 온보딩 통로(말풍선 + 알림 첫 줄 · 클라 `onbOnMessage`). 빈터 줄은 아직 터를 안 잡았을 때만(이미 잡았으면 헛말이다).
  let claimed = false;
  try { claimed = !!(H && typeof H.lotClaimed === 'function' && H.lotClaimed(player)); } catch (e) { claimed = false; }
  const lines = ['오늘부터 자네는 우리 마을 사람일세.'];
  if (!claimed) lines.push(Onb.T1086_LOT_LINE);
  try {
    if (H && H.send && player.ws) H.send(player.ws, { type: 'onboarding_quest', vid: v | 0, kind: 'joined', name: player.member.name || '', day: _day(), quest: null,
      lines, state: Onb.publicState(player.playerId), join: joinOf(player) });
  } catch (e) {}
  return true;
}

module.exports = {
  CFG, init, ready, contribOf, memberOf, isMemberHere,   // ★[T779] 한도 둘(`limitOf` · `remainOf`)은 걷었다
  onDeliver, accept, seatFounder, seatGuildMember, seatByInvite, leave, expel, withdraw, orderBrief, handleChat, publicState,   // ★[T197] 창설 = 소속 · ★[T202] 길드원도 · ★[T785] 부름으로 드는 문
  resolveRes, resKo,   // ★[T159] 품목 해석 · ★[T779] 길드 곳간 잠금 둘(`granaryOpen` · `granaryBust`)은 걷었다
  T769, withdrawChief, chiefCheck, chiefCached, resolveItem,   // ★[T769] 기부 · 촌장 꺼내기
  T1086, offerFirst, firstJoinChat, joinOf,   // ★[T1086] 첫 의뢰 = 마을 사람 권함 — 권함 자리 · 받아들이는 문 · 칸이 읽는 형편
  T1137, join, isRecognized, feeRateOf, coolLeft, coolText, feeOweOf, feeOweSet,   // ★[T1151] 끝수 장부   // ★[T1137] 가입 · 인정 구성원 · 수수료율 · 다시 들기 1시간
};
