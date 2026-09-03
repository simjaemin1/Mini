'use strict';
// === server/rescue.js — 외침 · 구조 동사 둘 (쓰러짐 2차) =======================
//
// ★★[재민 확정 2026-09-02 · T56 · §12] T43 이 사슬을 세웠고(HP 0 → 창 → 이송/사망 → 깨어남),
//   이 파일은 그 사슬의 **두 구멍**을 닫는다. 둘 다 T43 이 스스로 회부한 것이다:
//     ⓐ *"쓰러진 걸 남이 모른다"* — 창 3분의 근거가 **"소리를 듣고 달려오는 사람"** 인데
//        소리가 없었다. 쓰러짐은 그 사람 화면에만 떴다.
//     ⓑ *"구조 동사가 하나뿐"* — §12 는 넷(먹여주기·물 먹이기·불가로 옮기기·붙들기)을 들었는데
//        T43 은 업기=붙들기 하나만 만들었다(나머지는 클라 동사가 필요해서).
//
// ★★제1 규약 — **판정을 여기서 다시 짓지 않는다.** 마을 반경은 `shelterAt`, 물·바다는
//   `isWaterTile`/`isSeaTile`, 먹기는 `doEat`, 방위말은 온보딩의 `dirWord` — 전부 **정본을 부른다**.
//   이 파일이 새로 만드는 것은 **소리**와 **두 동사의 문법**뿐이다.
//
// ★★[T54 와의 접점 2026-09-02] 물이 **그릇에 담기게 됐다**(`fresh_water`). 그래서 `/물` 은
//   "들고 온 물을 먹인다"가 먼저고, 손이 비었을 때만 "물가에서 떠 먹인다"로 떨어진다.
//   앞엣것은 `doEat` 한 문으로 가므로 회복량도 빈 병 반납도 **여기서 짜지 않는다**.
//
// ★★제2 규약 — **클라 무접촉.** 동사는 T11(마을 소속)의 선례 그대로 **채팅 명령**으로 연다.
//   외침은 새 메시지를 안 만든다 — `notice` 한 줄이다(플레이어 머리 위 말풍선 채널이
//   이 세계엔 **없다**: 말풍선은 `village_brief` 하나뿐이고 마을(vid)에 붙는다 — §0-ⓐ 실측).
//
// ★★제3 규약 — **주사위 0.** 외침의 반경·주기·문구는 전부 (지금, 쓰러진 자리, 내 자리)의
//   순수 함수다. 같은 상황이면 같은 소리가 난다.

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const _int = (k, d) => { const v = parseInt(process.env[k], 10); return Number.isFinite(v) ? v : d; };

// ── 손잡이 — **근거는 실측이다**(`scripts/downed-metrics.js` · 보고 T56 §ⓓ) ────
//
//   ⚠T43 이 3분의 근거로 적은 *"야생에서 800px 을 달려오는 데 ~40초"* 는 **산수가 틀렸다.**
//     800px = 25m 이고 정본 이속 64px/s(=2m/s)로 **12.5초**다. 3분은 그보다 훨씬 멀리 산다.
//   ⇒ 계측기가 정본 값(`MOVE_SPEED` · `Body.CFG.STAM_*`)에서 **실제 도달 거리**를 유도한다:
//       전력질주 22초(3,520px) 뒤에는 달리기-회복 순환이 붙어 평균 ~82px/s.
//       창 180초 − 붙들기 5초 = 175초 ⇒ **직선 ~16,100px(≈500m)** 까지 올 수 있다.
//
//   그럼 외침 반경은 왜 그보다 작은가 — **이건 소리이지 도달 가능성이 아니기 때문이다.**
//   조용한 들에서 사람의 비명이 닿는 거리는 300m 남짓이다. 그 300m(=9,600px)를 잡고,
//   **"들은 사람은 제때 닿는가"를 반대로 검산한다**: 9,600px 은 약 96초 ⇒ 175초 예산에
//   **79초(≈45%)가 남는다** — 그 여유가 지형 우회분이다. 소리가 먼저고 도달이 검산이다.
const CFG = {
  SHOUT_RANGE_PX: _int('DOWN_SHOUT_RANGE_PX', 9600),      // 300걸음(=300m · 32px=1m 캐논)
  //   ★주기 — 창 안에 **반경으로 걸어 들어온 사람**도 듣게. 가장자리에서 들은 사람의 여유가
  //     79초이므로 그보다 넉넉히 짧게 잡는다. 30초면 창(180초) 동안 여섯 번 — 도배가 아니다.
  SHOUT_EVERY_MS: _int('DOWN_SHOUT_EVERY_MS', 30000),
  //   ★거리를 말하는 단위. 1걸음 = 1셀 = 1m = 32px(실축화 캐논) — 새 환산을 만들지 않았다.
  STEP_PX: _num('DOWN_STEP_PX', 32),
};

let H = null;
// 쓰러진 사람들의 **외침 시계**. pid → 다음 외칠 시각. 이 파일 밖에서 읽지 않는다.
const _shout = new Map();
let _timer = null;

function init(host) { H = host || {}; _shout.clear(); _stopTimer(); return true; }
function ready() { return !!H; }
function _send(p, text) { try { if (H && H.send && p && p.ws) H.send(p.ws, { type: 'notice', text }); } catch (e) {} }

// ── 외침 ──────────────────────────────────────────────────────────────────────
//   §12: *"마을 안이면 마을 사람이 옮긴다."* ⇒ 마을 안에서는 **외치지 않는다** —
//   부를 사람이 이미 와 있는 자리라서, 소리는 야생의 것이다(그리고 마을 안은 죽지도 않는다).
function _inVillage(x, y) {
  try { return (H.shelterAt ? (H.shelterAt(x, y) || 0) : 0) > 0; } catch (e) { return false; }
}
/** 걸음으로 말한다 — §60 "몇 초 걸었다가 아니라 얼마나 갔다". 겉은 계단(가까우면 촘촘히). */
function steps(px) {
  const s = Math.round(px / Math.max(1, CFG.STEP_PX));
  if (s < 20) return s;                      // 코앞 — 있는 그대로
  if (s < 100) return Math.round(s / 5) * 5; // 중거리 — 5걸음 단위
  return Math.round(s / 10) * 10;            // 멀리 — 10걸음 단위
}
/** 그 자리에서 저 자리로 가는 방위말. ★온보딩의 정본을 부른다(해 뜨는 쪽/해 지는 쪽 — §9.5). */
function _dir(fromX, fromY, toX, toY) {
  try { if (H.dirWord) return H.dirWord(toX - fromX, toY - fromY); } catch (e) {}
  return '어딘가';
}
/** 한 번 외친다 — 반경 안의 **깨어 있는 사람**에게만. 몇 명이 들었는지 돌려준다(계측·하네스용). */
function shoutOnce(downed, now) {
  if (!ready() || !downed || !downed.isDown) return 0;
  if (_inVillage(downed.x, downed.y)) return 0;                 // 마을은 조용하다(위 주석)
  let heard = 0;
  for (const q of (H.players ? H.players.values() : [])) {
    if (!q || q === downed || q.isNpc || q.isDown || !q.ws) continue;
    const d = Math.hypot(q.x - downed.x, q.y - downed.y);
    if (d > CFG.SHOUT_RANGE_PX) continue;
    _send(q, `🗣️ ${downed.name}이(가) 쓰러졌다 — ${_dir(q.x, q.y, downed.x, downed.y)} ${steps(d)}걸음`);
    heard++;
  }
  return heard;
}
function _tick(now) {
  if (!ready()) return;
  for (const [pid, at] of [..._shout]) {
    const p = H.players ? H.players.get(pid) : null;
    // 일어났거나·죽었거나·나갔으면 소리도 그친다(입을 다무는 자리가 한 곳이다)
    if (!p || !p.isDown || !p.ws) { _shout.delete(pid); continue; }
    if (now < at) continue;
    shoutOnce(p, now);
    _shout.set(pid, now + CFG.SHOUT_EVERY_MS);
  }
  if (!_shout.size) _stopTimer();
}
function _startTimer() {
  if (_timer) return;
  // ★자기 시계를 든다 — zone 의 30Hz 틱에 얹으면 그 틱이 한 줄 더 길어지고, 이건 30초에 한 번
  //   도는 일이다. 쓰러진 사람이 하나도 없으면 시계는 **없다**(아래 `_stopTimer`).
  _timer = setInterval(() => { try { _tick(Date.now()); } catch (e) {} }, 1000);
  if (_timer.unref) _timer.unref();
}
function _stopTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }
/** zone 이 쓰러짐의 순간에 부르는 **한 줄**. 첫 외침은 즉시, 그 뒤는 주기마다. */
function onDown(p, now) {
  if (!ready() || !p || !p.isDown) return 0;
  const t = Number.isFinite(now) ? now : Date.now();
  const heard = shoutOnce(p, t);
  _shout.set(p.pid, t + CFG.SHOUT_EVERY_MS);
  _startTimer();
  return heard;
}

// ── 구조 동사 둘 ──────────────────────────────────────────────────────────────
//   §12 의 넷 중 **먹여주기·물 먹이기**. "불가로 옮기기"와 "붙들기"는 T43 의 업기 하나가 이미 한다.
//   ★자격은 T43 과 같다 — **소속을 안 본다**(열쇠가 없다). 게이트는 거리 하나뿐.
function _downedNear(rescuer) {
  let best = null, bd = (H.RESCUE_RANGE_PX || 80);
  for (const q of (H.players ? H.players.values() : [])) {
    if (!q || q === rescuer || q.isNpc || !q.isDown) continue;
    const d = Math.hypot(q.x - rescuer.x, q.y - rescuer.y);
    if (d <= bd) { bd = d; best = q; }
  }
  return best;
}
/** 창이 아직 열려 있나 — T43 의 그 창(`RESCUE_WINDOW_MS`)을 **다시 읽을 뿐** 새로 세지 않는다. */
function _windowOpen(target, now) {
  const w = H.RESCUE_WINDOW_MS || 180000;
  return (now - (target.downedAt || 0)) <= w;
}
/** 내 인벤에서 먹일 수 있는 것 — **먹기 표의 정본**(`FOOD_EFFECTS`)이 가른다. */
function _edibleOf(p) {
  const out = [];
  try {
    for (const [k, n] of Object.entries(p.inventory || {})) {
      if ((Number(n) || 0) <= 0) continue;
      if (H.foodItems && H.foodItems.has(k)) out.push(k);
    }
  } catch (e) {}
  return out;
}
/** 이름표 정본 — **부를 때 읽는다**(표는 zone 부팅 뒤에 완성된다 · 값으로 붙들면 빈 표다). */
function _labels() { try { return (typeof H.itemLabel === 'function') ? (H.itemLabel() || {}) : (H.itemLabel || {}); } catch (e) { return {}; } }
/** 사람이 친 말 → 품목 키. 한글 이름표도 받는다(이름표 정본을 **읽을 뿐** 표를 새로 안 만든다). */
function _resolveItem(word) {
  if (!word) return null;
  if (H.foodItems && H.foodItems.has(word)) return word;
  const L = _labels();
  for (const [k, ko] of Object.entries(L)) if (ko === word && H.foodItems && H.foodItems.has(k)) return k;
  return null;
}
/** 옆에 **마실 물**이 있나 — 물이냐 바다냐의 판정은 정본 술어 둘이 한다(표를 새로 안 든다). */
function freshWaterNear(x, y) {
  for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
    if (!H.isWaterTile || !H.isWaterTile(x + dx, y + dy)) continue;
    if (H.isSeaTile && H.isSeaTile(x + dx, y + dy)) continue;   // ★짠물은 못 먹인다(T4)
    return true;
  }
  return false;
}
/** 옆에 바닷물만 있나 — 거절 사유를 **정확히** 말하기 위해서다("물이 없다"가 아니라 "짠물이다"). */
function seaOnlyNear(x, y) {
  let sea = false;
  for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
    if (!H.isWaterTile || !H.isWaterTile(x + dx, y + dy)) continue;
    if (H.isSeaTile && H.isSeaTile(x + dx, y + dy)) sea = true; else return false;
  }
  return sea;
}

/** 대상 하나를 고른다 — **지목이 있으면 그 사람**, 없으면 종전대로 제일 가까운 사람.
 *  ★★[T68 2026-09-03] 메뉴는 **그 사람 위에서** 열린다. 그러면 "제일 가까운 사람"으로는 틀린다:
 *    쓰러진 사람이 둘 겹쳐 있으면 내가 누른 사람이 아니라 옆 사람이 먹는다.
 *    ⇒ `pid` 를 받는다. 기본값(`undefined`)은 **종전 그대로** — 채팅 `/먹이기`·`/물` 은 한 글자도 안 달라진다.
 *    ⚠거리·창(窓) 게이트는 여기서 안 없앤다. 지목은 **누구를**만 정하고, 될지 말지는 종전 판정이 본다. */
function _pickTarget(rescuer, pid) {
  if (pid === undefined || pid === null) return _downedNear(rescuer);
  const q = (H.players && H.players.get) ? H.players.get(pid) : null;
  if (!q || q === rescuer || q.isNpc || !q.isDown) return null;
  const d = Math.hypot(q.x - rescuer.x, q.y - rescuer.y);
  return (d <= (H.RESCUE_RANGE_PX || 80)) ? q : null;
}

function feed(rescuer, word, now, pid) {
  const t = Number.isFinite(now) ? now : Date.now();
  const target = _pickTarget(rescuer, pid);
  if (!target) { _send(rescuer, `🥣 옆에 쓰러진 사람이 없다 — ${H.RESCUE_RANGE_PX || 80}px 안에서`); return false; }
  if (!_windowOpen(target, t)) { _send(rescuer, '🥣 너무 늦었다 — 구조 가능 시간이 지났다'); return false; }
  const item = _resolveItem(word);
  if (!item) {
    const has = _edibleOf(rescuer).map((k) => _labels()[k] || k);
    _send(rescuer, has.length ? `🥣 무엇을 먹일 것인가 — "/먹이기 ${has[0]}" (가진 것: ${has.slice(0, 6).join(' · ')})`
                              : '🥣 먹일 것이 없다');
    return false;
  }
  // ★★**정본 하나로 먹인다.** `doEat` 에 대상 인자를 더했다(기본값 = 자기 자신) ⇒
  //   로트·kg 원장·신선도·탈은 **주는 사람** 인벤에서 종전 그대로 빠지고, 허기·갈증·사기는
  //   **받는 사람** 몸에 붙는다. 여기서 인벤을 만지면 그게 사본이다.
  const before = { hunger: target.hunger, thirst: target.thirst };
  H.doEat(rescuer, item, 1, target);
  const ko = _labels()[item] || item;
  _send(rescuer, `🥣 ${target.name}에게 ${ko}을(를) 먹였다 — 배고픔 ${Math.round(before.hunger)} → ${Math.round(target.hunger)}`);
  _send(target, `🥣 ${rescuer.name}님이 ${ko}을(를) 먹여 주었다`);
  return true;
}

let _F = undefined;
function _fresh() { if (_F === undefined) { try { _F = require('./tidal').FRESH || null; } catch (e) { _F = null; } } return _F; }
function water(rescuer, now, pid) {
  const t = Number.isFinite(now) ? now : Date.now();
  const target = _pickTarget(rescuer, pid);
  if (!target) { _send(rescuer, `💧 옆에 쓰러진 사람이 없다 — ${H.RESCUE_RANGE_PX || 80}px 안에서`); return false; }
  if (!_windowOpen(target, t)) { _send(rescuer, '💧 너무 늦었다 — 구조 가능 시간이 지났다'); return false; }
  const MAX = H.THIRST_MAX || 100;
  const before = target.thirst;
  if (before >= MAX) { _send(rescuer, '💧 이미 충분히 마셨다'); return false; }
  // ── ⓐ **들고 온 물이 먼저다** [T54 가 민물 휴대를 열었다] ─────────────────
  //   물은 이제 그릇에 담긴다(`fresh_water`). 그러면 이 동사는 **먹이기와 같은 일**이 되므로
  //   같은 문 하나로 보낸다 — 회복량도 그릇 반납도 `doEat` 이 표대로 한다(여기서 안 짠다).
  //   ⚠빈 병은 **준 사람** 손에 남는다(`doEat` 의 `returns` 는 주는 쪽) — 먹인 것이지 준 게 아니다.
  //   ★민물 품목 id 는 **표의 주인에게 직접 묻는다**(`tidal.FRESH`). zone 을 거치지 않는 이유가 둘이다:
  //     ① 문자열을 여기 적으면 그게 사본이고, ② zone 이 갯벌 정본을 부르는 자리는 **셋으로 못 박혀 있다**
  //     (`test-tidal` 이 T54 의 예산을 지킨다) — 넷째 줄을 만들지 않는다. require 는 캐시된다.
  const F = _fresh();
  if (F && (rescuer.inventory && (rescuer.inventory[F] || 0) >= 1)) {
    H.doEat(rescuer, F, 1, target);
    _send(rescuer, `💧 ${target.name}에게 물을 먹였다 — 목마름 ${Math.round(before)} → ${Math.round(target.thirst)}`);
    _send(target, `💧 ${rescuer.name}님이 물을 먹여 주었다`);
    return true;
  }
  // ── ⓑ 손이 비었으면 **물가에서 손으로 떠 먹인다** ─────────────────────────
  //   그릇이 없어도 구조는 되어야 한다. 대신 물가여야 하고, 그러자면 쓰러진 사람을 **업어서
  //   물가로 옮기게 된다** — §12 의 "불가로 옮기기"가 그 자리다.
  if (!freshWaterNear(rescuer.x, rescuer.y)) {
    _send(rescuer, seaOnlyNear(rescuer.x, rescuer.y)
      ? '🌊 짠물이다 — 먹이면 더 마르게 할 뿐이다. 강·호수·샘으로 업고 가라'
      : '💧 물도 그릇도 없다 — 민물을 떠 오거나, 강·호수·샘 옆으로 업고 가라');
    return false;
  }
  target.thirst = Math.min(MAX, before + (H.WATER_DRINK_AMOUNT || 35));
  _send(rescuer, `💧 ${target.name}의 입에 물을 떠 넣었다 — 목마름 ${Math.round(before)} → ${Math.round(target.thirst)}`);
  _send(target, `💧 ${rescuer.name}님이 물을 먹여 주었다`);
  try { if (H.afterVerb) H.afterVerb(target); } catch (e) {}
  return true;
}

// ── 채팅 명령 — T11 선례 그대로(`membership.handleChat`). 접점은 zone 한 줄이다. ──
function handleChat(player, text) {
  if (!ready() || !player) return false;
  const s = String(text || '').trim();
  if (!s.startsWith('/')) return false;
  const [cmd, ...rest] = s.split(/\s+/);
  if (cmd === '/먹이기') { feed(player, rest.join(' ').trim(), Date.now()); return true; }
  if (cmd === '/물') { water(player, Date.now()); return true; }
  return false;
}

/** 대상 위 메뉴에서 온 동사 하나 — zone 접점은 `case` 한 줄이다(T11 `membership.handleChat` 선례).
 *  ★새 게임 동사 0: 이름표만 붙었을 뿐 부르는 것은 위의 `feed`·`water` 정본 그대로다.
 *  ★업기·줍기는 여기 없다 — 그 둘은 **종전 메시지**(`rescue_request`·`pickup_item`)가 이미 `pid`·`giId` 를 받는다. */
function verb(player, msg) {
  if (!ready() || !player || !msg) return false;
  const pid = (msg.pid === undefined || msg.pid === null) ? undefined : msg.pid;
  if (msg.name === 'feed') { feed(player, String(msg.item || ''), Date.now(), pid); return true; }
  if (msg.name === 'water') { water(player, Date.now(), pid); return true; }
  return false;
}

module.exports = {
  CFG, init, ready, onDown, shoutOnce, steps, handleChat, feed, water, verb,
  freshWaterNear, seaOnlyNear,
  // ★하네스용 — 시계를 밖에서 밀 수 있게(정본을 그대로 내준다 · 하네스가 사슬을 다시 짜지 않는다)
  __probe: { tick: _tick, shoutMap: _shout, downedNear: _downedNear, resolveItem: _resolveItem },
};
