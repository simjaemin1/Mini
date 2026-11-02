'use strict';
// === server/village-kin.js — 마을이 유일한 무리 — 촌장 · 곳간 문 · 가입 문 · 소개 · 전쟁 (T785) ==================
//
// ★★[재민 10-18 판정 · 족보 656] **길드 = 마을**(ⓑ — tribe 를 없애고 마을이 유일한 무리) · 호칭 "마을" · 우두머리 "촌장".
//   T11 의 "마을과 길드는 직교"(M-1)는 PM 오판이었다. 정본 지도 = `설계/조사_길드마을_T777.md`(자리 100 · ⓑ 칸).
//   셋으로 나눈다 — **T785 데이터 · central(이 파일)** → T786 권한(술어 접기 C 22) → T787 말 · 하네스 · 켬 기본 · 옛 길 걷기.
//
// ★손잡이 `T785_VILLAGE_ONLY` — ★[T787] **켬 기본**(`'0'` 만 끔). 끔이면 옛 길드 길(T785 앞 글자 그대로).
//   끔이면 이 파일의 문은 아무도 안 부른다(부르는 자리 전부 `ON &&` 뒤) · 회관 행에 칸을 안 쓴다 · 부팅 이행도 없다.
//
// ★★무엇이 어디 사나(켬)
//   ① **마을 칸이 무리의 정본** — 소속 = 몸 `member`(T11 제3 규약 · 무변) · 나머지는 **회관 행 `village_buildings(type 'hall').data`**
//      의 칸이다(새 표 0 · 새 열 0 — T197 이 `founder` · `tribeId` 를 실은 그 칸):
//        `chief`(촌장 · 사람 마을만 · pid) · `granaryOpen`(곳간 문 · 없음 = 열림) · `joinMode`('open' | 'invite' · 없음 = open)
//        · `intro`(소개 한 줄 · 없음 = '') · `wars`([[상대 마을 id, 게임일, 건 사람], …]) · `t785`(이 칸이 정본이라는 표지)
//      NPC 마을의 촌장은 칸이 아니라 **촌장 몸**(명부 맨 앞 NPC · `villages.chiefOf` · T529)이다 — 읽는 문은 `chiefOf` 하나.
//   ② **존이 마을 일로 central `/tribe…` · `/war…` 를 안 부른다** — 창설 때 길드 싣기 · 길드원 앉히기 · 소개 · 곳간 문 캐시 ·
//      `tribe_set` · `refreshTribe` · 로그인 길드 이름 묻기 · 로그인 부름 묻기 · 전쟁 문(부르는 자리는 `zone.js` · 전부 `ON` 갈래).
//      전쟁 열쇠 = **마을 id**(이 파일의 `wars` 칸 · central `wars` 표는 길드 id 칸이라 두 id 공간을 섞지 않는다).
//   ③ **이행** — 켬 부팅 때 사람 마을마다 **한 번**: 옛 회관 `data.tribeId` 로 central tribe 칸(곳간 문 · 가입 문 · 소개)을 읽어
//      마을 칸으로 옮기고 촌장 = 창설자로 적는다(옛 칸 `tribeId` 는 그대로 둔다 · 표지 `t785`). 못 물으면 표지를 안 단다(다음에 다시).
//      VP · `treasury_json` 은 **안 옮긴다**(재민 09-30 "없앨 추상" — 읽는 자리 표는 보고 · T787 이 걷는다).
//
// ★권한 — 이 파일이 새로 거는 술어는 **옮겨 온 칸을 바꾸는 문**의 것뿐이다(옛 문 = 길드장 `leader_id` → 촌장 칸).
//   곳간 문 · 소개 · 가입 문 · 촌장 넘기기 · 전쟁 = 촌장 · 부르기 = 마을 사람(옛 문 = 길드원). 나머지 C 자리는 T786.
// ★결정론 — 시각은 **게임일**(`H.gameDay`)로 적는다(벽시계 0) · 새 수 0(소개 길이 상한은 `guild.js CFG.INTRO_MAX` 그 수).

// ★★[T787 2026-10-18] **켬 기본** — `'0'` 만 끔(그때만 옛 길드 길 · main 의 옛 바이트). 없음 · 다른 값 = 켬.
const ON = process.env.T785_VILLAGE_ONLY !== '0';

let H = null;   // { SimVillages, Membership, Guild, players, send, ZONE_ID, gameDay }
function init(host) { H = host || null; return ON; }
function ready() { return !!(ON && H && H.SimVillages); }

const _V = () => (H && H.SimVillages) || null;
const _isPlayer = (vil) => !!(vil && vil.econ && vil.econ.founder);
function _vil(vid) { const V = _V(); return (V && V.villageByDbId && vid != null) ? (V.villageByDbId(vid | 0) || null) : null; }
function _day() { try { return (H && typeof H.gameDay === 'function') ? (H.gameDay() | 0) : 0; } catch (e) { return 0; } }
function _send(p, text, kind) {
  try { if (H && H.send && p && p.ws) H.send(p.ws, kind ? { type: 'notice', text, kind } : { type: 'notice', text }); } catch (e) {}
}
function _online(name) {
  try { for (const p of (H.players ? H.players.values() : [])) if (p && !p.isNpc && p.name === name) return p; } catch (e) {}
  return null;
}
function _byPid(pid) {
  try { for (const p of (H.players ? H.players.values() : [])) if (p && !p.isNpc && String(p.playerId) === String(pid)) return p; } catch (e) {}
  return null;
}
function _villageByName(name) {
  const V = _V();
  const list = (V && V.clientVillages) ? (V.clientVillages() || []) : [];
  for (const c of list) if (c && String(c.name || '') === name) return _vil(c.id);
  return null;
}

// ── 칸 ↔ 회관 행 data ────────────────────────────────────────────────────────
function _fromHall(hd) {
  const h = hd || {};
  const wars = new Map();
  if (Array.isArray(h.wars)) for (const w of h.wars) if (Array.isArray(w) && w[0] != null) wars.set(w[0] | 0, { day: w[1] | 0, by: w[2] != null ? String(w[2]) : null });
  return {
    chief: (h.chief != null && h.chief !== '') ? String(h.chief) : null,
    granaryOpen: h.granaryOpen !== false,
    joinMode: h.joinMode === 'invite' ? 'invite' : 'open',
    intro: (typeof h.intro === 'string') ? h.intro : '',
    wars,
    t785: !!h.t785,
  };
}
/** 회관 행을 읽은 그 자리에서 마을에 칸을 붙인다(`villages.js` 부팅 복원 · 창설 — 켬에서만 부른다). */
function attach(vil, hallData, row) {
  if (!vil) return null;
  const k = _fromHall(hallData);
  k.row = (row != null) ? row : null;
  k.base = hallData || null;
  //   ★이행 대기 — 사람 마을인데 표지가 없다(켬 전에 선 마을). 옛 길드 id 는 회관 행 `tribeId` 에 그대로 있다.
  k.pending = !k.t785 && _isPlayer(vil);
  k.tribe0 = (hallData && hallData.tribeId != null) ? hallData.tribeId : null;
  if (_isPlayer(vil) && !k.chief) k.chief = String(vil.econ.founder);   // 촌장 = 창설자(카드 ① · 이행 전에도 같은 사람)
  vil._kin = k;
  return k;
}
/** 창설 — 회관 행에 처음부터 얹는 칸(촌장 = 세운 사람 · 표지). 나머지는 없음 = 기본값. */
function hallKeysFresh(founder) { return { chief: String(founder), t785: true }; }
function _keys(vil) {
  const k = vil._kin;
  const o = {};
  if (_isPlayer(vil)) o.chief = k.chief;
  o.granaryOpen = k.granaryOpen !== false;
  o.joinMode = k.joinMode === 'invite' ? 'invite' : 'open';
  o.intro = String(k.intro || '');
  o.wars = [...k.wars.entries()].sort((a, b) => a[0] - b[0]).map(([v, w]) => [v | 0, w.day | 0, w.by]);
  o.t785 = true;
  return o;
}
/** 칸을 회관 행에 쓴다(옛 칸은 지우지 않는다 — 있던 data 위에 이 칸만 얹는다). */
function save(vil) {
  if (!vil || !vil._kin) return false;
  const k = vil._kin;
  k.t785 = true; k.pending = false;
  const V = _V();
  if (!V || typeof V.kinWrite !== 'function' || k.row == null) return false;
  const merged = Object.assign({}, k.base || {}, _keys(vil));
  k.base = merged;
  try { return V.kinWrite(k.row, JSON.stringify(merged)) !== false; } catch (e) { return false; }
}

// ── 읽는 문 ─────────────────────────────────────────────────────────────────
//   ★[T809] 사람 마을의 촌장 id — 칸이 있으면 칸 · **칸이 아직 없으면 창설자**(`attach` 가 앉히는 그 규칙 그대로 · 이행 전 · 칸 없이 선 마을).
//     main(T779)의 "창설자 마을의 촌장 = 창설자"와 T785 의 "촌장 = 마을 칸(기본 창설자)"가 같은 사람을 가리키게 한 줄로 둔다(새 규칙 0).
function _chiefId(vil) { const k = vil && vil._kin; return (k && k.chief != null && k.chief !== '') ? String(k.chief) : ((vil && vil.econ && vil.econ.founder != null) ? String(vil.econ.founder) : null); }
/** 촌장 — 사람 마을 = 칸 · NPC 마을 = 촌장 몸(명부 맨 앞 · T529). `{ id, name, npc }` 또는 null. */
function chiefOf(vil) {
  if (!vil) return null;
  if (_isPlayer(vil)) {
    const id = _chiefId(vil);
    if (!id) return null;
    const p = _byPid(id);
    return { id: String(id), name: (p && p.name) || null, npc: false };
  }
  const V = _V();
  const b = (V && V.chiefOf) ? V.chiefOf(vil.dbId) : null;
  return b ? { id: String(b.pid != null ? b.pid : ''), name: b.name || null, npc: true } : null;
}
function isChief(player, vil) {
  const id = (player && vil && _isPlayer(vil)) ? _chiefId(vil) : null;
  return !!(id != null && String(id) === String(player.playerId));
}
/** 이 존에서 그 사람이 든 마을(몸 `member`) — 다른 존의 소속이면 null. */
function memberVil(player) {
  const M = H && H.Membership;
  const m = (M && M.memberOf) ? M.memberOf(player) : null;
  if (!m || m.vid == null) return null;
  if (H && H.ZONE_ID && m.zone && m.zone !== H.ZONE_ID) return null;
  return _vil(m.vid);
}
/** 전쟁 열쇠 — 그 사람의 마을 id(이 존의 소속 · 없으면 null). */
function warKey(player) { const v = memberVil(player); return v ? (v.dbId | 0) : null; }
function isAtWar(a, b) {
  if (a == null || b == null || (a | 0) === (b | 0)) return false;
  const va = _vil(a);
  return !!(va && va._kin && va._kin.wars.has(b | 0));
}
function granaryOpenOf(vil) { return !(vil && vil._kin && vil._kin.granaryOpen === false); }
function joinModeOfVid(vid) { const v = _vil(vid); return (v && v._kin && v._kin.joinMode === 'invite') ? 'invite' : 'open'; }
function introOfVid(vid) { const v = _vil(vid); return (v && v._kin) ? String(v._kin.intro || '') : ''; }

// ── 쓰는 문 ─────────────────────────────────────────────────────────────────
//   소개 — 자르는 법은 central `/tribe/intro` 의 그 한 줄(공백 접기 · 다듬기 · 상한) · 상한은 `guild.js CFG.INTRO_MAX`(새 수 0).
function _cutIntro(s) {
  const max = (H && H.Guild && H.Guild.CFG && (H.Guild.CFG.INTRO_MAX | 0)) || 0;
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return max > 0 ? t.slice(0, max) : t;
}
function _setWar(va, vb, on, by) {
  const day = _day();
  if (on) { va._kin.wars.set(vb.dbId | 0, { day, by: by != null ? String(by) : null }); vb._kin.wars.set(va.dbId | 0, { day, by: by != null ? String(by) : null }); }
  else { va._kin.wars.delete(vb.dbId | 0); vb._kin.wars.delete(va.dbId | 0); }
  save(va); save(vb);
}
function _tellVillage(vil, text, kind) {
  try { for (const p of (H.players ? H.players.values() : [])) { if (!p || p.isNpc) continue; const mv = memberVil(p); if (mv && (mv.dbId | 0) === (vil.dbId | 0)) _send(p, text, kind); } } catch (e) {}
}

// ── 채팅 문 — `Membership.handleChat` · `Guild.handleChat` **앞**에서 켬에서만 부른다 ─────────────
//   반환 true = 이 줄을 이 파일이 받았다(방송 안 함). false = 뒤 문으로 흘려보낸다(종전 그대로).
function handleChat(player, text) {
  if (!ready() || !player) return false;
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return false;
  const sp = t.indexOf(' ');
  const cmd = sp < 0 ? t : t.slice(0, sp);
  const arg = sp < 0 ? '' : t.slice(sp + 1).trim();
  const mine = memberVil(player);
  const chiefHere = !!(mine && isChief(player, mine));
  const notMine = () => { _send(player, '🏘️ 이 지역 마을 사람이 아닙니다.'); return true; };
  const notChief = () => { _send(player, '🏘️ 촌장만 할 수 있습니다.'); return true; };

  if (cmd === '/촌장') {
    if (!mine) return notMine();
    if (!arg) {
      const c = chiefOf(mine);
      _send(player, `🏘️ [${mine.name}] 촌장 — ${c ? (c.name || c.id) : '없음'}`);
      return true;
    }
    if (!chiefHere) return notChief();
    const tgt = _online(arg);
    if (!tgt) { _send(player, `🏘️ ${arg} 님은 지금 여기 없습니다.`); return true; }
    if (String(tgt.playerId) === String(player.playerId)) { _send(player, '🏘️ 이미 촌장입니다.'); return true; }
    const tv = memberVil(tgt);
    if (!tv || (tv.dbId | 0) !== (mine.dbId | 0)) { _send(player, `🏘️ ${arg} 님은 우리 마을 사람이 아닙니다.`); return true; }
    mine._kin.chief = String(tgt.playerId);
    save(mine);
    _send(player, `🏘️ ${mine.name} 촌장 자리를 ${tgt.name} 님에게 넘겼습니다.`);
    _send(tgt, `🏘️ 이제 ${mine.name}의 촌장이 되었습니다.`);
    return true;
  }
  //   ★[T809 · T779] `/곳간 열기|잠금` — 곳간 잠금은 걷었다(손잡이와 무관 — 촌장 혼자 꺼내니 정할 문이 없다) · 그 한 줄은 membership 이 답한다.
  //     마을 칸 `granaryOpen` 은 이행이 옮겨 둔 값으로 남지만 꺼내기는 안 읽는다.
  if (cmd === '/곳간' && (arg === '열기' || arg === '잠금')) return false;
  if (cmd === '/소개') {
    if (!mine) return notMine();
    if (!chiefHere) return notChief();
    mine._kin.intro = _cutIntro(arg);
    save(mine);
    _send(player, mine._kin.intro ? `🏘️ ${mine.name} 소개를 적었습니다. "${mine._kin.intro}"` : `🏘️ ${mine.name} 소개를 지웠습니다.`);
    return true;
  }
  //   ★[T787] 마을 보기 · 가입 문 — 옛 `/길드 초대제|공개` 는 `/마을 …` 이다(길드 = 마을). 옛 명령은 한 줄 안내만.
  if (cmd === '/길드') { _send(player, '🏘️ 길드는 이제 마을입니다. `/마을`이라고 적어 보십시오. 드는 문은 `/마을 초대제`와 `/마을 공개`로 정합니다.'); return true; }
  if (cmd === '/마을' && !arg) {
    if (!mine) { _send(player, '🏘️ 아직 어느 마을 사람도 아닙니다. 마을 곳간에 보탠 뒤 `/소속`이라고 적으면 마을 사람이 됩니다.'); return true; }
    const c = chiefOf(mine);
    const k = mine._kin || {};
    _send(player, `🏘️ [${mine.name}] 촌장 ${c ? (c.name || c.id) : '없음'} · `   // ★[T809] 곳간 문 칸은 안 적는다(T779 가 잠금을 걷었다 · 꺼내기 = 촌장)
      + `${k.joinMode === 'invite' ? '부름을 받아야 듦' : '아무나 듦'}${k.intro ? ` · "${k.intro}"` : ''}`);
    return true;
  }
  if (cmd === '/마을' && (arg === '초대제' || arg === '공개')) {
    if (!mine) return notMine();
    if (!chiefHere) return notChief();
    mine._kin.joinMode = (arg === '초대제') ? 'invite' : 'open';
    save(mine);
    _send(player, mine._kin.joinMode === 'invite' ? `🏘️ ${mine.name}은(는) 이제 **부름을 받아야** 들 수 있습니다.` : `🏘️ ${mine.name}은(는) 이제 아무나 들 수 있습니다.`);
    return true;
  }
  if (cmd === '/마을') { _send(player, '🏘️ `/마을` (보기) · `/마을 초대제` · `/마을 공개`'); return true; }
  //   부르기 — 마을 사람이 **접속해 있는 사람**을 부른다(이름 → 사람은 존이 아는 이름뿐 · 안 접속한 이름은 central 명부가 필요하다 → 회부).
  //   부름은 몸의 메모리 칸(`_kinCall` · 마을 id → 게임일)이다 — 저장 0(접속을 끊으면 사라진다 · 옛 central 부름 표의 몫은 회부).
  if (cmd === '/초대') {
    if (!mine) return notMine();
    if (!arg) { _send(player, '누구를 부르는가 — `/초대 <이름>`', 'guild'); return true; }
    const tgt = _online(arg);
    if (!tgt) { _send(player, `'${arg}' 님은 지금 여기 없습니다.`, 'guild'); return true; }
    if (String(tgt.playerId) === String(player.playerId)) { _send(player, '자기 자신은 부를 수 없습니다.', 'guild'); return true; }
    const tv = memberVil(tgt);
    if (tv && (tv.dbId | 0) === (mine.dbId | 0)) { _send(player, `${arg} 님은 이미 우리 마을 사람입니다.`, 'guild'); return true; }
    if (H.Membership && H.Membership.memberOf && H.Membership.memberOf(tgt)) { _send(player, `${arg} 님은 다른 마을 사람입니다. 먼저 그 마을에서 나와야 합니다.`, 'guild'); return true; }
    if (!tgt._kinCall) tgt._kinCall = new Map();
    tgt._kinCall.delete(mine.dbId | 0);
    tgt._kinCall.set(mine.dbId | 0, _day());   // 가장 최근 것이 끝에 선다(Map 순서)
    _send(player, `${tgt.name} 님을 ${mine.name}(으)로 불렀습니다. 상대가 \`/수락\`이라고 적으면 마을에 듭니다.`, 'guild');
    const called = (H.Guild && H.Guild.calledLine) ? H.Guild.calledLine(mine.name) : `${mine.name}에서 당신을 부릅니다. \`/수락\`이라고 적으면 마을에 듭니다.`;
    _send(tgt, called, 'guild');
    return true;
  }
  if (cmd === '/수락') {
    const calls = player._kinCall instanceof Map ? player._kinCall : null;
    const ids = calls ? [...calls.keys()].filter((v) => !!_vil(v)) : [];
    if (!ids.length) { _send(player, '당신을 부른 마을이 없습니다.', 'guild'); return true; }
    if (H.Membership && H.Membership.memberOf && H.Membership.memberOf(player)) { _send(player, '이미 마을 사람이다 — 먼저 `/탈퇴`', 'guild'); return true; }
    let vid = ids[ids.length - 1];
    if (arg) {
      const pick = ids.find((v) => String((_vil(v) || {}).name || '') === arg);
      if (pick == null) { _send(player, `[${arg}] 은(는) 자네를 부르지 않았다 — 부른 곳: ${ids.map((v) => `[${(_vil(v) || {}).name || v}]`).join(' ')}`, 'guild'); return true; }
      vid = pick;
    }
    const r = (H.Membership && H.Membership.seatByInvite) ? H.Membership.seatByInvite(player, vid) : { ok: false };
    if (!r || !r.ok) { _send(player, '지금은 못 들었다 — 잠시 뒤 다시', 'guild'); return true; }
    const more = ids.length - 1;
    player._kinCall = null;
    _send(player, `${(_vil(vid) || {}).name || ''}에 들었습니다.${more > 0 ? ` 다른 부름 ${more}건은 지웠습니다.` : ''}`, 'guild');
    return true;
  }
  //   가입 문 '초대제' — 기여로 받은 권함(`_memberOfferVid`)으로는 못 든다(부름 `/수락` 만). 열린 마을은 종전 그대로 흘려보낸다.
  if (cmd === '/소속') {
    const M = H.Membership;
    if (M && M.memberOf && M.memberOf(player)) return false;
    const ov = player._memberOfferVid;
    if (ov != null && joinModeOfVid(ov) === 'invite') { _send(player, `🏘️ ${(_vil(ov) || {}).name || ''}은(는) 부름을 받아야 들 수 있습니다. 마을 사람에게 \`/초대\`를 청하십시오.`); return true; }
    return false;
  }
  //   촌장 자리는 비우지 않는다 — 촌장은 넘기고 떠난다 · 촌장은 내보내지 못한다(칸이 마을 사람 밖으로 새지 않게).
  if (cmd === '/탈퇴') {
    if (chiefHere) { _send(player, '🏘️ 촌장은 먼저 자리를 넘겨야 떠날 수 있습니다. `/촌장 <이름>`이라고 적으십시오.'); return true; }
    return false;
  }
  if (cmd === '/추방') {
    //   ★[T786 C5] 내보내는 것은 **촌장**이다(membership `expel` 머리 주석 "촌장이 한다" — 종전 술어는 "쫓는 쪽도 그 마을 사람"이었다).
    const tgt = arg ? _online(arg) : null;
    if (tgt && mine && isChief(tgt, mine)) { _send(player, '🏘️ 촌장은 내보낼 수 없습니다.'); return true; }
    if (mine && !chiefHere) return notChief();
    return false;
  }
  //   전쟁 — 마을 사이(열쇠 = 마을 id). 거는 것도 끝내는 것도 그 마을 촌장. 상대는 이 존의 마을(사람 · NPC).
  if (cmd === '/전쟁' || cmd === '/종전') {
    if (!mine) return notMine();
    if (!chiefHere) return notChief();
    if (!arg) { _send(player, `🏘️ 어느 마을과 하시겠습니까? \`${cmd} <마을 이름>\`처럼 적으십시오.`); return true; }
    const tgt = _villageByName(arg);
    if (!tgt || !tgt._kin) { _send(player, `🏘️ ${arg}은(는) 이 땅에 없는 마을입니다.`); return true; }
    if ((tgt.dbId | 0) === (mine.dbId | 0)) { _send(player, '🏘️ 자기 마을과는 싸울 수 없습니다.'); return true; }
    const at = isAtWar(mine.dbId, tgt.dbId);
    if (cmd === '/전쟁') {
      if (at) { _send(player, `🏘️ ${tgt.name}과(와) 이미 싸우고 있습니다.`); return true; }
      _setWar(mine, tgt, true, player.playerId);
      const line = `⚔️ ${mine.name}이(가) ${tgt.name}에 전쟁을 걸었습니다.`;
      _tellVillage(mine, line); _tellVillage(tgt, line);
      return true;
    }
    if (!at) { _send(player, `🏘️ ${tgt.name}과(와)는 싸우고 있지 않습니다.`); return true; }
    _setWar(mine, tgt, false, player.playerId);
    const line = `🏘️ ${mine.name}과(와) ${tgt.name}의 전쟁이 끝났습니다.`;
    _tellVillage(mine, line); _tellVillage(tgt, line);
    return true;
  }
  return false;
}

// ── 이행 — 켬 부팅 때 사람 마을의 옛 tribe 칸을 마을 칸으로(한 번) ───────────────────
//   `fetchTribe(id)` = central `GET /tribe/:id`(안 문 · `{ status, data: { tribe } }`). 같은 길드 id 는 한 번만 묻는다.
//   ⚠못 물었으면(central 이 안 떴다) 그 마을은 표지를 안 단다 — 다음 부팅(또는 `retry`)에 다시. 404(길드가 지워졌다) = 기본값.
//   ⚠그새 촌장이 칸을 만졌으면(`pending` 이 꺼졌다) 덮지 않는다 — 사람이 정한 값이 정본이다.
let _migr = { done: 0, fail: 0, calls: 0, runs: 0, busy: false, fetch: null };
async function migrate(fetchTribe) {
  if (!ready()) return { done: 0, fail: 0 };
  if (typeof fetchTribe === 'function') _migr.fetch = fetchTribe;
  if (_migr.busy || typeof _migr.fetch !== 'function') return { done: 0, fail: 0, busy: _migr.busy };
  _migr.busy = true; _migr.runs++;
  let done = 0, fail = 0;
  try {
    const V = _V();
    const list = (V && V.playerVillages) ? (V.playerVillages() || []) : [];
    const cache = new Map();   // tribeId → tribe 행 | null(없음) | undefined(못 물음)
    for (const vil of list) {
      const k = vil && vil._kin;
      if (!k || !k.pending) continue;
      let row = null;
      if (k.tribe0 != null && k.tribe0 !== '') {
        const id = k.tribe0 | 0;
        if (!cache.has(id)) {
          let got;
          try {
            _migr.calls++;
            const r = await _migr.fetch(id);
            got = (r && r.status === 200 && r.data && r.data.tribe) ? r.data.tribe : ((r && r.status === 404) ? null : undefined);
          } catch (e) { got = undefined; }
          cache.set(id, got);
        }
        row = cache.get(id);
        if (row === undefined) { fail++; continue; }
      }
      if (!k.pending) continue;
      if (row) {
        k.granaryOpen = (row.granary_open == null) ? true : !!row.granary_open;
        k.joinMode = String(row.join_mode || 'open') === 'invite' ? 'invite' : 'open';
        k.intro = (row.intro == null) ? '' : _cutIntro(row.intro);
      }
      if (!k.chief) k.chief = String(vil.econ.founder);
      save(vil);
      done++;
    }
  } finally { _migr.busy = false; }
  _migr.done += done; _migr.fail += fail;
  return { done, fail };
}
/** 남은 이행이 있으면 다시(존의 있던 주기 틱이 부른다 — 새 타이머 0). */
function retry() {
  if (!ready() || _migr.busy || !_migr.fetch) return null;
  const V = _V();
  const list = (V && V.playerVillages) ? (V.playerVillages() || []) : [];
  if (!list.some((v) => v && v._kin && v._kin.pending)) return null;
  return migrate();
}

/** 관측(읽기 전용) — 하네스 · 켬의 `/guilddbg`(길드 = 마을 · 안 문 · 새 문 0). */
function snapshot() {
  const V = _V();
  const list = (V && V.clientVillages) ? (V.clientVillages() || []) : [];
  const out = [];
  for (const c of list) {
    const vil = _vil(c.id);
    if (!vil || !vil._kin) continue;
    const k = vil._kin;
    const ch = chiefOf(vil);
    out.push({ vid: vil.dbId | 0, name: vil.name, player: _isPlayer(vil), chief: ch ? ch.id : null, chiefNpc: !!(ch && ch.npc),
      granaryOpen: k.granaryOpen !== false, joinMode: k.joinMode, intro: k.intro, wars: [...k.wars.keys()].sort((a, b) => a - b),
      t785: !!k.t785, pending: !!k.pending, tribe0: k.tribe0 != null ? k.tribe0 : null, row: k.row, tribeIdRuntime: vil._tribeId != null ? vil._tribeId : null });
  }
  return { on: ON, migrate: { done: _migr.done, fail: _migr.fail, calls: _migr.calls, runs: _migr.runs }, villages: out };
}

module.exports = { ON, init, ready, attach, hallKeysFresh, save, chiefOf, isChief, memberVil, warKey, isAtWar,
  granaryOpenOf, joinModeOfVid, introOfVid, handleChat, migrate, retry, snapshot };
