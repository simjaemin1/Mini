// === server/guild.js — 길드 모집: 초대 · 승인제 · 마을 소개문 (T128) ============
//
// ★[재민 확정 2026-09-05 · T128 · T62 다음 층] 백로그 "길드 초대·승인제·마을 소개문".
//
// ★★이 모듈의 규약 넉 줄 — **T115 `friends.js` 와 같은 문법**이다(둘이 다르면 그게 사본이다)
//   ① **정본은 central 이다.** 여기 있는 것은 **캐시와 말**뿐이다. 부름의 판정·가입·문의 잠김은
//      전부 central 이 한다. 여기서 다시 풀면 두 곳이 갈린다.
//   ② **못 물어보면 막지 않는다.** central 이 잠깐 안 뜬 것을 사람의 죄로 삼지 않는다(T19 규약).
//   ③ **새 패널 0 · 새 클라 조건 0.** 통로는 채팅 명령이다(T11 `/소속` · T19 `/이방인` · T115 `/친구`).
//   ④ **요청 경로에서 central 을 기다리지 않는다.** 소개문은 **캐시로만** 답한다 —
//      T115 가 여기서 물려 `e2e-onboarding` 을 깼다(`/startinfo` 는 로비가 부팅 직후 부르는 요청이다).
'use strict';

const CFG = {
  INTRO_TTL_MS: 60000,   // 소개문 캐시 수명 — 바뀌면 그 자리에서 비운다(아래 `_introBust`)
  INTRO_MAX: 60,         // ⚠**표시용 안전망**이다. 자르는 정본은 central 하나다(사본 금지).
};

let H = null;
function init(hooks) { H = hooks || null; }
function ready() { return !!(H && H.central); }

// ── 소개문 캐시 — tribe_id → 문장 ────────────────────────────────────────────
let _intro = { map: null, at: 0, pending: false };
function _introBust() { _intro = { map: null, at: 0, pending: false }; }
/** 지금 아는 소개문 표(모르면 `null`) — **동기**다. 시작 화면이 부르는 자리라 기다릴 수 없다. */
function introMap() {
  if (!ready()) return null;
  const stale = !_intro.map || (Date.now() - _intro.at >= CFG.INTRO_TTL_MS);
  if (stale && !_intro.pending) {
    _intro.pending = true;
    H.central.tribeIntros().then((rows) => {
      if (rows == null) { _intro.pending = false; return; }   // 못 물어봤다 — 옛 값을 지키고 다음에 다시
      const m = new Map();
      for (const r of rows) if (r && r.id != null && r.intro) m.set(r.id | 0, String(r.intro));
      _intro = { map: m, at: Date.now(), pending: false };
    }).catch(() => { _intro.pending = false; });
  }
  return _intro.map;
}
/** 그 마을 줄에 실릴 한 줄(없으면 ''). 마을 → 길드는 `_tribeId` 하나가 잇는다. */
function introOfTribe(tribeId) {
  if (tribeId == null) return '';
  const m = introMap();
  if (!m) return '';
  return String(m.get(tribeId | 0) || '').slice(0, CFG.INTRO_MAX);
}

// ── 채팅 명령 넷 ─────────────────────────────────────────────────────────────
//   `/초대 <이름>`  길드원이 부른다        `/수락`        받은 부름 중 가장 최근 것으로 든다
//   `/길드 초대제|공개`  길드장이 문을 건다  `/소개 <문장>`  길드장이 마을 소개 한 줄
function handleChat(player, text) {
  if (!player) return false;
  const t = String(text || '').trim();
  const isCmd = t.startsWith('/초대') || t.startsWith('/수락') || t.startsWith('/소개') || t.startsWith('/길드');
  if (!isCmd) return false;
  const say = (m) => { try { if (H && H.send && player.ws) H.send(player.ws, { type: 'notice', text: m, kind: 'guild' }); } catch (e) {} };
  if (!ready()) { say('길드는 지금 물어볼 수 없다'); return true; }
  const me = player.playerId;
  if (!me) { say('손님은 아직 길드를 다룰 수 없다'); return true; }

  if (t.startsWith('/초대')) {
    const name = t.slice('/초대'.length).trim();
    if (!name) { say('누구를 부르는가 — `/초대 <이름>`'); return true; }
    H.central.tribeInvite(me, name).then((r) => {
      if (!r || !r.ok) {
        say(r && r.reason === 'no_such_name' ? `'${name}' 은 없는 이름이다`
          : r && r.reason === 'not_in_tribe' ? '길드에 든 사람만 부를 수 있다'
          : r && r.reason === 'already_member' ? `${name} 은(는) 이미 우리 길드다`
          : r && r.reason === 'in_other_tribe' ? `${name} 은(는) 다른 길드에 있다 — 먼저 나와야 한다`
          : r && r.reason === 'self' ? '자기 자신은 못 부른다'
          : '지금은 못 불렀다 — 잠시 뒤 다시');
        return;
      }
      say(`${r.name} 을(를) [${r.tribe}] 로 불렀다 — 상대가 \`/수락\` 하면 든다`);
      if (H.tellPlayer) H.tellPlayer(r.player_id, calledLine(r.tribe), 'guild');
    }).catch(() => say('지금은 못 불렀다 — 잠시 뒤 다시'));
    return true;
  }

  if (t.startsWith('/수락')) {
    // ★★[T139 2026-09-06] `/수락 <길드이름>` — **여럿이 불렀을 때 고른다**(T128 회부 5).
    //   ⚠이름을 **나머지 전부**로 받는다: `tribes.name` 은 `trim().slice(0,20)` 만 거치므로
    //     **공백이 들어 있을 수 있다**(§0-ⓒ 실측). 첫 낱말만 떼면 두 낱말 길드는 영영 못 고른다.
    //   ⚠고르는 판정은 여기서 하지 않는다 — central 이 `tribe_id` 로 고르는 문을 이미 갖고 있다
    //     (T128 `/tribe/invite_accept` 의 `pick`). 여기서 하는 일은 **이름 → tribe_id** 하나뿐이다.
    const want = t.slice('/수락'.length).trim();
    const go = (tribeId) => {
      H.central.tribeInviteAccept(me, tribeId).then((r) => {
        if (!r || !r.ok) {
          say(r && r.reason === 'no_invite' ? '자네를 부른 길드가 없다'
            : r && r.reason === 'already_in_tribe' ? '이미 길드에 들어 있다 — 먼저 `/탈퇴`'
            : '지금은 못 들었다 — 잠시 뒤 다시');
          return;
        }
        say(`[${r.name}] 에 들었다${(r.more | 0) > 0 ? ` (다른 부름 ${r.more}건은 지웠다)` : ''}`);
        if (H.refreshTribe) H.refreshTribe(me);
      }).catch(() => say('지금은 못 들었다 — 잠시 뒤 다시'));
    };
    if (!want) { go(null); return true; }        // 안 고르면 종전 그대로(가장 최근)
    H.central.tribeInvites(me).then((r) => {
      const list = (r && r.ok && Array.isArray(r.invites)) ? r.invites : [];
      if (!list.length) { say('자네를 부른 길드가 없다'); return; }
      const pick = list.find((x) => String(x.name || '').trim() === want);
      if (!pick) { say(`[${want}] 은(는) 자네를 부르지 않았다 — 부른 곳: ${list.map((x) => `[${x.name}]`).join(' ')}`); return; }
      go(pick.tribe_id);
    }).catch(() => say('지금은 못 들었다 — 잠시 뒤 다시'));
    return true;
  }

  if (t.startsWith('/길드')) {
    const arg = t.slice('/길드'.length).trim();
    if (arg !== '초대제' && arg !== '공개') { say('길드의 문 — `/길드 초대제` 또는 `/길드 공개`'); return true; }
    H.central.tribeMode(me, arg === '초대제' ? 'invite' : 'open').then((r) => {
      if (!r || !r.ok) {
        say(r && r.reason === 'not_leader' ? '길드장만 문을 걸 수 있다'
          : r && r.reason === 'not_in_tribe' ? '길드에 든 사람만 쓸 수 있다'
          : '지금은 못 바꿨다 — 잠시 뒤 다시');
        return;
      }
      say(r.mode === 'invite' ? `[${r.name}] 은 이제 **부름을 받아야** 든다` : `[${r.name}] 은 이제 아무나 들 수 있다`);
    }).catch(() => say('지금은 못 바꿨다 — 잠시 뒤 다시'));
    return true;
  }

  // `/소개 <문장>` — 길드장이 쓰는 마을 소개 한 줄
  {
    const line = t.slice('/소개'.length).trim();
    H.central.tribeIntro(me, line).then((r) => {
      if (!r || !r.ok) {
        say(r && r.reason === 'not_leader' ? '길드장만 소개를 쓸 수 있다'
          : r && r.reason === 'not_in_tribe' ? '길드에 든 사람만 쓸 수 있다'
          : '지금은 못 썼다 — 잠시 뒤 다시');
        return;
      }
      _introBust();                       // ★그 자리에서 비운다 — 다음 시작 화면이 새 문장을 본다
      say(r.intro ? `[${r.name}] 소개를 적었다 — "${r.intro}"` : `[${r.name}] 소개를 지웠다`);
    }).catch(() => say('지금은 못 썼다 — 잠시 뒤 다시'));
    return true;
  }
}

// ★★[T139 2026-09-06] **부름 알림함** — 그 자리에서 하는 말과 다음 접속에 밀린 말이 **같은 문장**이다.
//   둘을 따로 쓰면 그게 사본이고, 한쪽만 고쳐지는 날이 온다(친구 쪽 `askedLine` 과 같은 규약).
function calledLine(tribeName) {
  return `[${tribeName}] 이(가) 자네를 부른다 — \`/수락\` 하면 든다`;
}
/**
 * 밀린 길드 부름 — 로그인 때 세울 줄들. `[{ text, kind }]` · **최근 것이 먼저**(central 이 `at DESC`).
 * ⚠못 물어보면 빈 배열이다(T115 규약 ② · 로그인은 한 군데도 안 막힌다).
 * ⚠**새 표 0 · 새 컬럼 0** — T128 이 만든 `tribe_invites` 와 `/tribe/invites` 문을 그대로 읽는다.
 */
async function pendingLines(playerId) {
  if (!ready()) return [];
  let r = null;
  try { r = await H.central.tribeInvites(String(playerId || '')); } catch (e) { return []; }
  const rows = (r && r.ok && Array.isArray(r.invites)) ? r.invites : [];
  return rows.filter((x) => x && x.name).map((x) => ({ text: calledLine(x.name), kind: 'guild' }));
}

function debug() {
  const m = _intro.map;
  return { cfg: CFG, ready: ready(), intros: m ? [...m.entries()] : null, at: _intro.at };
}

module.exports = { CFG, init, ready, handleChat, introMap, introOfTribe, pendingLines, calledLine, debug, __introBust: _introBust };
