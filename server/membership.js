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
function limitOf(contrib, stock) {
  const k = Math.max(0, contrib | 0);
  const byContrib = Math.max(CFG.WD_MIN, Math.floor(k * CFG.WD_PER));
  const byStock = Events.payableQty(stock, CFG.WD_FRAC);
  return Math.max(0, Math.min(byContrib, byStock));
}
function remainOf(player, stock) {
  const m = memberOf(player);
  if (!m) return 0;
  const lim = limitOf(contribOf(player.playerId), stock);
  const d = _day();
  const used = ((m.wdDay | 0) === d) ? Math.max(0, m.wdUsed | 0) : 0;
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
  const r0 = String(res || 'food');
  const stock = V.playerVillageWithdrawStock(g.vil, r0);
  const remain = remainOf(player, stock);
  if (remain <= 0) return { ok: false, err: `오늘 몫은 다 꺼냈다 (한도 ${limitOf(contribOf(player.playerId), stock)})` };
  const want = Math.max(1, Math.floor(Number(qty) || 0) || remain);
  const take = Math.min(want, remain);
  const r = V.playerVillageWithdraw(g.vil, player.inventory, r0, take);
  if (!r.ok) return r;
  const m = memberOf(player);
  const d = _day();
  if ((m.wdDay | 0) !== d) { m.wdDay = d; m.wdUsed = 0; }
  m.wdUsed = (m.wdUsed | 0) + r.qty;
  return Object.assign({ ok: true, name: g.vil.name, remain: Math.max(0, remain - r.qty),
    limit: limitOf(contribOf(player.playerId), stock) }, r);
}

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
    limit: m ? limitOf(k, stock) : 0, remain: m ? remainOf(player, stock) : 0,
    offer: (!m && player._memberOfferVid != null) ? (player._memberOfferVid | 0) : null,
  };
}

module.exports = {
  CFG, init, ready, contribOf, memberOf, isMemberHere, limitOf, remainOf,
  onDeliver, accept, leave, expel, withdraw, orderBrief, handleChat, publicState,
};
