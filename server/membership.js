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

const path = require('path');
const Events = require(path.join(__dirname, 'events'));
const Onb = require(path.join(__dirname, 'onboarding'));
const Winter = require(path.join(__dirname, 'winter'));   // ★[T20] 겨울나기 달성 보상(그 해 한정 가산)
const ItemLabel = require(path.join(__dirname, 'itemlabel'));   // ★[T159] 재화의 우리말 — 표는 여기 하나(사본 0)

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // 소속 문턱 — K-2 확정(12). 빈터(3)는 온보딩 정본(`ONB_LOT_AFTER`)이 갖는다.
  N_MEMBER: Math.max(1, _num('MEMBER_N', 12) | 0),
  // 일일 인출 한도 = min(기여 × 상수, 곳간의 작은 비율). **기여에 대해 단조**다.
  //   ⚠지금은 **손잡이**다(§10 균형 실측은 T20 구현의 몫). 여기서 정한 것은 곡선의 **모양**이다:
  //     기여가 늘면 늘고, 곳간이 비면 줄고, 아무리 기여해도 곳간을 통째로는 못 비운다.
  WD_PER: _num('MEMBER_WD_PER', 0.25),
  WD_FRAC: _num('MEMBER_WD_FRAC', 0.02),
  // ★마을 사람의 **바닥 몫**. 실측에서 나왔다: 문턱을 낮춰 켠 실클라에서 갓 들어온 사람의 한도가
  //   0 이었다 — 곳간을 못 여는 사람은 마을 사람이 아니다. 소속의 의미가 곧 이 한 줄이다.
  //   ⚠곳간이 비면 이 바닥도 소용없다(아래 `min`) — 없는 것을 꺼낼 수는 없다.
  WD_MIN: Math.max(0, _num('MEMBER_WD_MIN', 1) | 0),
  // ★[T159] 길드 곳간 문의 캐시 수명 — **T128 소개문 캐시와 같은 값**(`guild.js INTRO_TTL_MS`).
  //   새 수가 아니라 같은 종류의 창을 같은 크기로 쓴 것이다(둘 다 "길드 표를 얼마나 자주 다시 묻나").
  GRAN_TTL_MS: _num('MEMBER_GRAN_TTL_MS', 60000),
};

let H = null;
function init(host) { H = host || {}; return true; }
function ready() { return !!H; }
function _day() { return (H && typeof H.gameDay === 'function') ? (H.gameDay() | 0) : 0; }
function _send(player, text) { try { if (H && H.send && player && player.ws) H.send(player.ws, { type: 'notice', text }); } catch (e) {} }

// ── 기여 — **읽기만 한다**(계량기는 온보딩 정본 하나) ─────────────────────────
function contribOf(playerId) { try { return Onb.stateOf(playerId).contrib | 0; } catch (e) { return 0; } }

// ── 소속 상태 — 몸에 실린다 ──────────────────────────────────────────────────
//   { zone, vid, name, since, wdDay, wdUsed }
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

// ── 인출 한도 — f(기여) 단조 · 곳간의 작은 비율로 덮인다 ─────────────────────
//   ★`Events.payableQty` 를 부른다(사본 금지 — 게시판 보상이 쓰는 그 함수다).
//   ★인자는 **마을 사람의 기여**다(비소속은 여기까지 오지 않는다 — `withdraw` 가 먼저 막는다).
//   ★★[T20 2026-09-02] 세 번째 인자 `vid` — **그 마을이 지난 겨울을 넉넉히 났으면** 한 몫 더 얹는다.
//     값도 만료도 이 파일이 갖지 않는다(`server/winter.js` 하나) — 여기 있는 건 **더한다**는 사실뿐이다.
//     ⚠`min(·, byStock)` 은 그대로다: 마을은 없는 걸 못 준다(물리 상한은 보상보다 위다).
//     ⚠`vid` 를 안 주면 종전과 **비트 동일**이다(가산 0) — 옛 호출자를 깨지 않는다.
function limitOf(contrib, stock, vid) {
  const k = Math.max(0, contrib | 0);
  const byContrib = Math.max(CFG.WD_MIN, Math.floor(k * CFG.WD_PER)) + (vid == null ? 0 : Winter.bonusOf(vid));
  const byStock = Events.payableQty(stock, CFG.WD_FRAC);
  return Math.max(0, Math.min(byContrib, byStock));
}
function remainOf(player, stock) {
  const m = memberOf(player);
  if (!m) return 0;
  const lim = limitOf(contribOf(player.playerId), stock, m.vid);   // ★[T20] 겨울 보상은 **그 마을** 것이다
  const d = _day();
  // ★[T59] 하루 몫은 **econ 단위**로 센다(낱개가 아니다) — 열량 환산 뒤 둘은 더 이상 1:1 이 아니다.
  //   `| 0` 을 쓰면 0.93단위 인출이 0 으로 세어져 한도가 사실상 무한이 된다.
  const used = ((m.wdDay | 0) === d) ? Math.max(0, Number(m.wdUsed) || 0) : 0;
  return Math.max(0, lim - used);
}

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
  _send(player, `🧓 ${nm ? nm + ' ' : ''}촌장 — 이만하면 우리 마을 사람일세. 받아들이겠으면 채팅에 "/소속" 이라 적게.`);
  // ⚠제안과 수락의 **문구가 서로 달라야** 한다 — 같으면 하네스가 둘을 구별 못 하고 자명 통과한다
  //   (실측: 1차 e2e ②가 제안 알림에 걸려 통과했다).
}

// ── 수락 · 탈퇴 · 추방 ───────────────────────────────────────────────────────
function accept(player, vid) {
  if (!ready() || !player) return { ok: false, err: '아직 준비되지 않았다' };
  if (memberOf(player)) return { ok: false, err: '이미 소속이 있다 — 먼저 "/탈퇴" 해야 한다' };
  const v = (vid == null) ? player._memberOfferVid : (vid | 0);
  if (v == null) return { ok: false, err: '촌장이 아직 권하지 않았다' };
  const k = contribOf(player.playerId);
  if (k < CFG.N_MEMBER) return { ok: false, err: `아직 이르다 — 누적 기여 ${k}/${CFG.N_MEMBER}` };
  player.member = { zone: (H && H.ZONE_ID) || null, vid: v | 0, name: _villageName(v), since: _day(), wdDay: -1, wdUsed: 0 };
  return { ok: true, member: player.member, contrib: k };
}
// ★탈퇴해도 **기여는 남는다**(이력서 캐논 §2 — 한 일은 없던 일이 되지 않는다).
//   빈터 권리·사유지는 이 축과 무관하다(§13 · T45 의 몫).
function leave(player, why) {
  const m = memberOf(player);
  if (!m) return { ok: false, err: '소속이 없다' };
  player.member = null;
  player._memberOfferVid = null;
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

// ── 인출 — 곳간에서 꺼낸다 ───────────────────────────────────────────────────
//   ★실물 이동은 `villages.playerVillageWithdraw`(납품의 역연산) 하나다. 여기서 정하는 것은
//     **누가·얼마나**이고, 그 둘 다 기여의 함수다.
//   반환: { ok, res, item, qty, stockAfter, remain } · 막을 이유가 있으면 { ok:false, err }
function withdraw(player, vid, res, qty) {
  if (!ready()) return { ok: false, err: '아직 준비되지 않았다' };
  const V = H.SimVillages;
  if (!V || !V.villageWithdrawGate || !V.playerVillageWithdraw) return { ok: false, err: '곳간을 찾지 못했다' };
  if (!isMemberHere(player, vid)) return { ok: false, err: '이 마을 사람이 아니다 — 곳간은 마을 사람만 연다' };
  const g = V.villageWithdrawGate(vid | 0, player.x, player.y);   // ★브리핑·게시판과 **같은 근접 게이트**
  if (g.err) return { ok: false, err: g.err };
  // ★★[T159] **굶는 마을은 곳간을 안 연다.** 판정은 엔진이 매일 적어 둔 것을 읽는다(`villageFamine`).
  //   왜 여기인가: 한도(기여)와 재고(실물) 위에 **마을의 형편**이 하나 더 있다. 곳간이 남아 있어도
  //   그 남은 것이 마을을 겨울까지 살릴 몫이면 사람에게 내주는 것이 마을을 죽인다.
  if (V.villageFamine && V.villageFamine(g.vil)) {
    return { ok: false, err: '마을이 굶고 있다 — 오늘은 곳간을 열지 않는다' };
  }
  // ★★[T159] 길드 마을이면 **길드장이 문을 잠글 수 있다**(T128 `join_mode` 와 같은 문법).
  //   못 물어봤으면 열린 것으로 본다 — central 이 잠깐 안 뜬 것을 사람의 죄로 삼지 않는다.
  const _tid = (g.vil && g.vil.econ && g.vil.econ._tribeId) | 0;
  if (_tid && !granaryOpen(_tid)) {
    return { ok: false, err: '길드장이 곳간을 잠갔다' };
  }
  const r0 = String(res || 'food');
  const stock = V.playerVillageWithdrawStock(g.vil, r0);
  // ★[T20-ⓑ 재민 확정 2026-09-03] **한도의 밑변**은 곡식 한 칸이 아니라 econ 의 식량 등가다
  //   (겨울 곳간은 보존식으로 갈무리돼 있다 — `playerVillageWithdrawStockFoodEq` 머리 주석).
  //   ⚠꺼내지는 양은 그대로 `playerVillageWithdraw` 가 정한다 — 한도가 재고를 만들지 않는다.
  const basis = (V.playerVillageWithdrawStockFoodEq && V._countsAsFoodEq && V._countsAsFoodEq(g.vil, r0))
    ? Math.max(stock, V.playerVillageWithdrawStockFoodEq(g.vil)) : stock;
  const remain = remainOf(player, basis);
  if (remain <= 0) return { ok: false, err: `오늘 몫은 다 꺼냈다 (한도 ${limitOf(contribOf(player.playerId), basis, vid)})` };
  const want = Math.max(1, Math.floor(Number(qty) || 0) || remain);
  const take = Math.min(want, remain);
  const r = V.playerVillageWithdraw(g.vil, player.inventory, r0, take);
  if (!r.ok) return r;
  const m = memberOf(player);
  const d = _day();
  if ((m.wdDay | 0) !== d) { m.wdDay = d; m.wdUsed = 0; }
  // ★★[T59 2026-09-03] **한도는 단위로, 안내는 낱개로.** 정본이 돌려주는 `units`(실제로 곳간에서 빠진 단위)를
  //   센다 — `qty`(받은 낱개)로 세면 쌀처럼 1단위 < 1개인 품목에서 한도가 헐거워진다.
  //   `units` 가 없는 옛 반환(비식량 재화)은 종전대로 `qty` 가 곧 단위다.
  //   ⚠한도 계산 인자는 **T20 의 것을 그대로 쓴다**(`basis`·`vid` — 겨울 공동 프로젝트가 바꾼 자리다).
  const _spent = (Number(r.units) > 0) ? Number(r.units) : (Number(r.qty) || 0);
  m.wdUsed = (Number(m.wdUsed) || 0) + _spent;
  return Object.assign({ ok: true, name: g.vil.name, remain: +Math.max(0, remain - _spent).toFixed(2),
    limit: limitOf(contribOf(player.playerId), basis, vid) }, r);
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
/** 사람이 읽을 재화 이름 — 없으면 키 그대로. */
function resKo(res) { return _stripEmo((ItemLabel.CATEGORY_KO || {})[res] || '') || String(res || ''); }

// ── ★★[T159] 길드 마을의 곳간 문 ─────────────────────────────────────────────
//   유저 마을은 **길드가 세운다**(T128 `_tribeId`). 그 곳간을 소속이 열 수 있는지는 길드장이 정한다.
//   ⚠판정은 central 이 한다(`tribes.granary_open` 한 칸 · T128 `join_mode` 와 같은 문법).
//     여기서는 **캐시된 답**을 본다 — 못 물어봤으면 **열린 것으로 본다**(막지 않는다 · T115 규약 ②).
const _gran = new Map();      // tribeId → { open, at }
function granaryOpen(tribeId) {
  const id = tribeId | 0;
  if (!id) return true;                                    // 길드가 없는 마을(NPC 마을) — 문이 없다
  const hit = _gran.get(id);
  if (hit && Date.now() - hit.at < CFG.GRAN_TTL_MS) return hit.open;
  if (H && H.central && H.central.tribeGranary) {
    H.central.tribeGranary(id).then((r) => {
      if (r && r.ok) _gran.set(id, { open: r.open !== false, at: Date.now() });
    }).catch(() => {});
  }
  return hit ? hit.open : true;                            // 모르면 막지 않는다
}
function granaryBust(tribeId) { if (tribeId) _gran.delete(tribeId | 0); }

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
  if (cmd === '/소속') {
    const m = memberOf(player);
    if (m) { _send(player, `🏘️ ${m.name || '마을'} 사람 — ${_day() - (m.since | 0)}일째 · 누적 기여 ${contribOf(player.playerId)}`); return true; }
    const r = accept(player, null);
    if (!r.ok) { _send(player, `🏘️ ${r.err}`); return true; }
    _send(player, `🧓 ${r.member.name || ''} 촌장 — 오늘부터 자네는 우리 마을 사람일세. 곳간을 열어 두겠네("/인출").`);
    return true;
  }
  if (cmd === '/탈퇴') {
    const r = leave(player, 'self');
    _send(player, r.ok ? `🏘️ ${r.was.name || '마을'}을 떠났다 — 누적 기여 ${r.contrib}은 그대로 남는다.` : `🏘️ ${r.err}`);
    return true;
  }
  if (cmd === '/추방') {
    const nm = rest.join(' ').trim();
    if (!nm) { _send(player, '🏘️ 누구를 내보낼 것인가 — "/추방 <이름>"'); return true; }
    let tgt = null;
    try { for (const p of (H.players ? H.players.values() : [])) if (!p.isNpc && p.name === nm) { tgt = p; break; } } catch (e) {}
    if (!tgt) { _send(player, `🏘️ ${nm} 은(는) 지금 여기 없다`); return true; }
    const r = expel(player, tgt);
    _send(player, r.ok ? `🏘️ ${nm} 을(를) 마을에서 내보냈다.` : `🏘️ ${r.err}`);
    return true;
  }
  // ★★[T159] `/곳간` — 사람이 쓰는 말로 꺼낸다. **인출 경로는 하나다**(`withdraw`) — 여기서 다시 안 푼다.
  if (cmd === '/곳간') {
    const m = memberOf(player);
    const vid = m ? (m.vid | 0) : near;
    const a0 = (rest[0] || '').trim();
    // ⓐ `/곳간 열기|잠금` — 길드장이 그 마을 곳간의 문을 정한다
    if (a0 === '열기' || a0 === '잠금') {
      if (!H.central || !H.central.tribeGranarySet) { _send(player, '🏘️ 지금은 곳간 문을 못 만진다'); return true; }
      H.central.tribeGranarySet(player.playerId, a0 === '열기').then((r) => {
        if (!r || !r.ok) {
          _send(player, `🏘️ ${r && r.reason === 'not_leader' ? '길드장만 곳간 문을 정할 수 있다'
            : r && r.reason === 'not_in_tribe' ? '길드에 든 사람만 쓸 수 있다' : '지금은 못 바꿨다 — 잠시 뒤 다시'}`);
          return;
        }
        granaryBust(r.tribe_id);
        _send(player, r.open ? `🏘️ [${r.name}] 곳간을 열었다 — 마을 사람이 제 몫을 꺼낼 수 있다`
                             : `🏘️ [${r.name}] 곳간을 잠갔다 — 길드장이 열기 전엔 아무도 못 꺼낸다`);
      }).catch(() => _send(player, '🏘️ 지금은 못 바꿨다 — 잠시 뒤 다시'));
      return true;
    }
    // ⓑ `/곳간` — 지금 형편 한 줄(꺼내지 않는다)
    if (!a0) {
      const k = contribOf(player.playerId);
      if (!m) { _send(player, `🏘️ 아직 마을 사람이 아니다 — 누적 기여 ${k}/${CFG.N_MEMBER}`); return true; }
      if (vid == null) { _send(player, '🏘️ 마을이 멀다 — 곳간 앞으로 가라'); return true; }
      const V = H.SimVillages; const g = V.villageWithdrawGate(vid | 0, player.x, player.y);
      if (g.err) { _send(player, `🏘️ ${g.err}`); return true; }
      const st = V.playerVillageWithdrawStock(g.vil, 'food');
      _send(player, `🏘️ ${m.name || '마을'} 곳간 — 오늘 남은 몫 ${remainOf(player, st)} · 누적 기여 ${k} · 식량 재고 ${st}`
        + (V.villageFamine && V.villageFamine(g.vil) ? ' · **마을이 굶는 중이다**' : ''));
      return true;
    }
    // ⓒ `/곳간 <품목> [양]` — 품목을 앞에 둔다(사람이 그렇게 말한다)
    if (vid == null) { _send(player, '🏘️ 마을이 멀다 — 곳간 앞으로 가라'); return true; }
    const r0 = resolveRes(a0);
    if (!r0) { _send(player, `🏘️ 곳간에 그런 물건은 없다 — "${a0}"`); return true; }
    const n = parseInt(rest[1], 10);
    const r = withdraw(player, vid, r0, n);
    if (!r.ok) { _send(player, `🏘️ ${r.err}`); return true; }
    if (H.afterWithdraw) H.afterWithdraw(player, r);
    return true;
  }
  if (cmd === '/인출') {
    const m = memberOf(player);
    const vid = m ? (m.vid | 0) : near;
    if (vid == null) { _send(player, '🏘️ 마을이 멀다 — 곳간 앞으로 가라'); return true; }
    const r = withdraw(player, vid, rest[1] || 'food', parseInt(rest[0], 10));
    if (!r.ok) { _send(player, `🏘️ ${r.err}`); return true; }
    if (H.afterWithdraw) H.afterWithdraw(player, r);
    return true;
  }
  return false;
}

// ── 클라에 실어 보내는 상태(거래소 패널 한 줄이 읽는다 — 새 패널 0) ───────────
function publicState(player, stock) {
  const m = memberOf(player);
  const k = contribOf(player.playerId);
  return {
    vid: m ? (m.vid | 0) : null, name: m ? (m.name || '') : '',
    since: m ? (m.since | 0) : null, contrib: k, need: CFG.N_MEMBER,
    limit: m ? limitOf(k, stock, m.vid) : 0, remain: m ? remainOf(player, stock) : 0,
    offer: (!m && player._memberOfferVid != null) ? (player._memberOfferVid | 0) : null,
  };
}

module.exports = {
  CFG, init, ready, contribOf, memberOf, isMemberHere, limitOf, remainOf,
  onDeliver, accept, leave, expel, withdraw, orderBrief, handleChat, publicState,
  resolveRes, resKo, granaryOpen, granaryBust,   // ★[T159] 품목 해석 · 길드 곳간 문
};
