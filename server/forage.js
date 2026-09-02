// === server/forage.js — 맨손 채집(잔가지·자갈·섬유) [재민 확정 2026-08-28] =======
//
// 재민 원문: *"돌멩이를 줍고 나뭇가지를 줍고"* · 채집 방식 확정:
//   **낙하물 스캐터 금지 — 이미 렌더된 자연물이 채집원이다.**
//   덤불 E = 잔가지 · 물가 바위밭/자갈 지형 E = 자갈 · 갈대 군락 E = 섬유.
//   땅에 아이템을 흩뿌리지 않는다("소품 밀도 낮게, 스폰 광장이 첫인상" 캐논 위반).
//
// ★★고갈은 **개체별 lazy 번영도**다 — 낚시 자리(`fishing.js`)·광맥(`mined_cells`)과 **같은 문법**:
//   ① 안 건드린 자리는 **저장하지 않는다**(없으면 = 만땅).
//   ② 시간은 **조회할 때** 닫힌 해로 한 번에 적분한다(틱 비용 0 · dt 가 며칠이어도 오차 없음).
//   새 물리를 발명하지 않았다 — 이미 두 번 쓴 문법을 세 번째로 쓴다.
//
// ★★반독점(재민 논의 확정):
//   · **전역 공유 풀 금지.** 고갈은 개체(덤불 하나·셀 하나)에만 걸린다 —
//     한 자리에 눌러앉은 사람은 **자기 앞 덤불만** 죽이고, 옆 사람은 옆 덤불을 쓴다.
//   · 리필은 **재료 티어에 비례**. 잔가지·자갈·섬유는 **시작 재료**라 희귀해질 이유가 없다 —
//     분 단위로 찬다(`FORAGE_REFILL_MIN` 기본 3분). 편재성 캐논.
//   · **소스 다종화** — 잔가지는 덤불에서도, 숲 바닥에서도 나온다.
//
// ⚠영속하지 않는다(메모리 Map). 분 단위 리필이라 재기동이 곧 "만땅"이고, 그건 위 ①과 같은 뜻이다.
//   (광맥은 게임일 단위라 영속이 필요했지만, 여기는 그 층이 아니다.)
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  CAP: Math.max(1, Math.round(_num('FORAGE_CAP', 4))),          // 한 개체가 품고 있는 양
  REFILL_MIN: _num('FORAGE_REFILL_MIN', 3),                     // 바닥에서 만땅까지(분)
  COOLDOWN_MS: Math.max(0, Math.round(_num('FORAGE_COOLDOWN_MS', 900))),  // 한 번 훑는 데 드는 시간
  BUSH_PX: _num('FORAGE_BUSH_PX', 56),                          // 덤불로 손이 닿는 거리
  CELL_PX: 32,
};
const KO = { twig: '잔가지', pebble: '자갈', fiber: '풀', brine: '짠물' };
// ⚠갯벌 산출(굴·해조·전복)의 이름표는 여기 안 적는다 — `tidal.js` 가 정본이고 zone 의 표에 **주입**한다.

// ── lazy 번영도 ─────────────────────────────────────────────────────────────
const _state = new Map();   // key → { v, t }   (없으면 만땅)
function left(key, now) {
  if (key == null) return CFG.CAP;   // ★[자염] 고갈 없는 소스
  const rec = _state.get(key);
  if (!rec) return CFG.CAP;
  const min = (now - rec.t) / 60000;
  const v = Math.min(CFG.CAP, rec.v + (CFG.REFILL_MIN > 0 ? (min / CFG.REFILL_MIN) * CFG.CAP : CFG.CAP));
  return v;
}
// 한 줌 가져간다. 남은 게 없으면 0.
function take(key, now, n = 1) {
  if (key == null) return n;   // ★[자염] 고갈이 없는 소스(바다) — 상태를 만들지 않는다
  const v = left(key, now);
  if (v < n) { _state.set(key, { v, t: now }); return 0; }
  const after = v - n;
  if (after >= CFG.CAP - 1e-9) _state.delete(key);   // 만땅이면 안 적는다(위 ①)
  else _state.set(key, { v: after, t: now });
  return n;
}
function reset() { _state.clear(); }
function size() { return _state.size; }

// ── 이 자리는 무엇을 주는가 ─────────────────────────────────────────────────
//   ctx: { forestMult(x,y), isRock(x,y), isWater(x,y) }
//   ★지형을 여기서 다시 풀지 않는다 — 정본 술어를 **주입받는다**(사본 계측기 금지와 같은 규약).
// ★`salt.js` 는 **늦게** 부른다 — `forage` 는 아주 이른 모듈이라 맞물림을 만들지 않는다.
let _S = null;
function _Salt() { if (!_S) _S = require('./salt'); return _S; }
// ★[T52] 갯벌 정본도 같은 규약으로 **늦게** 부른다(맞물림 금지 — `salt` 와 같은 자리).
let _T = null;
function _Tidal() { if (!_T) _T = require('./tidal'); return _T; }
const RING = (() => {
  const o = [];
  for (const r of [2, 6]) for (let a = 0; a < 8; a++) {
    const th = a * Math.PI / 4;
    o.push([Math.round(Math.cos(th) * r), Math.round(Math.sin(th) * r)]);
  }
  return o;
})();
// ★덤불은 여기 없다 — **파괴형 채집**(`zone.tryGather` 의 `berry_bush` 산출)이 맡는다.
//   재민 확정 "덤불 E = 잔가지"는 그쪽 산출에 잔가지를 넣어 지켰다(열매·풀과 함께 나온다).
//   여기는 **개체가 곁에 없을 때** 땅 자체가 주는 것들이다(비파괴 · 개체별 lazy 고갈).
function sourceAt(x, y, ctx) {
  // ★★⓪ 갯벌 — **바다에 접한 뭍**. [자염 배치 2026-09-01 재민 확정 ①]
  //   ★새 개체도 새 지형층도 없다: 판정은 `salt.isTidalFlat` 하나이고, 그건 이미 있는 두 술어
  //     (해안선 타일 · 강호수 셀)의 차집합일 뿐이다. **갯벌은 배치하는 게 아니라 있는 것이다.**
  //   ★**용기가 없으면 이 갈래가 아예 안 열린다** — 그래서 물병 없이 바닷가에 서면
  //     종전대로 ① 갈대가 나온다(기존 동작을 안 뺏는다). 손으로 물을 뜰 수는 없다는 게 전부다.
  //   ★고갈은 다른 갈래와 **같은 문법**(개체별 lazy · 셀 키)이지만, 바다는 마르지 않는다 —
  //     실질 병목은 `CFG.COOLDOWN_MS`(한 번 뜨는 시간)와 **들고 갈 수 있는 무게**다.
  //     ⇒ 리필을 만땅으로 둔다(`brine` 키는 상태를 안 적는다 = 위 ①과 같은 뜻).
  if (ctx.isSea && _Salt().isTidalFlat(x, y, ctx)) {
    // ⓪-a **짠물** — 병이 있으면 물을 뜬다(T3 · 기존 동작 그대로 · 고갈 없음).
    if (ctx.hasVessel) return { kind: 'brine', key: null, where: '갯벌' };
    // ⓪-b ★★[T52] **갯벌 채집** — 병이 없으면 손으로 캔다.
    //   ★두 갈래의 순서가 곧 계약이다: 병을 들고 갯벌에 서면 **여전히 짠물이 먼저**다
    //     (자염의 동선을 안 뺏는다 — 물을 뜨러 온 사람이 굴을 캐고 있으면 그게 결함이다).
    //     굴을 캐려면 병을 두고 오면 된다. **무엇을 들고 가느냐가 판단이 된다.**
    //   ★물이 차 있으면 `pickAt` 이 null 을 낸다 ⇒ 아래 ① 갈대로 떨어진다(기존 동작 유지).
    //   ★고갈은 **여기엔 있다**(짠물과 다르다): 바다는 안 마르지만 **조개밭은 마른다**.
    //     키를 셀로 잡아 개체별 lazy 번영도 그대로 — 한 자리에 눌러앉으면 그 자리만 죽는다.
    const got = _Tidal().pickAt(x, y);
    if (got) {
      return { kind: got, key: `t:${Math.floor(x / CFG.CELL_PX)}_${Math.floor(y / CFG.CELL_PX)}`,
               where: `갯벌(${_Tidal().tideKo()})` };
    }
  }
  // ① 갈대 군락 — 물 **바로 옆**. (목이 마르면 위에서 물 마시기로 갈라진다)
  const adj = [[CFG.CELL_PX, 0], [-CFG.CELL_PX, 0], [0, CFG.CELL_PX], [0, -CFG.CELL_PX]];
  for (const [dx, dy] of adj) if (ctx.isWater(x + dx, y + dy)) {
    return { kind: 'fiber', key: `c:${Math.floor(x / CFG.CELL_PX)}_${Math.floor(y / CFG.CELL_PX)}`, where: '갈대 군락' };
  }
  // ② 숲 바닥 — 삭정이가 발에 걸린다(잔가지의 둘째 소스)
  if (ctx.forestMult(x, y) > 1.5) {
    return { kind: 'twig', key: `c:${Math.floor(x / CFG.CELL_PX)}_${Math.floor(y / CFG.CELL_PX)}`, where: '숲 바닥' };
  }
  // ③ 물가 바위밭·자갈 지형 — 둘레에 바위나 물이 있는 땅
  for (const [dx, dy] of RING) {
    const cx = x + dx * CFG.CELL_PX, cy = y + dy * CFG.CELL_PX;
    if (ctx.isRock(cx, cy) || ctx.isWater(cx, cy)) {
      return { kind: 'pebble', key: `c:${Math.floor(x / CFG.CELL_PX)}_${Math.floor(y / CFG.CELL_PX)}`, where: '자갈 지형' };
    }
  }
  return null;   // ★들판 한복판엔 주울 게 없다 — "어디서 주울까"가 판단이 되게 한다
}
// ★★[T52] **바다 갈래만** 보는 술어 — zone 의 입력 경로(`tryGather`)가 묻는다.
//   왜 필요한가: `tryGather` 는 물가에서 갈래를 가르는데 바다 쪽 게이트가 **"병이 있나"** 였다.
//   그래서 병 없는 사람은 갯벌에 서도 "짠물이다"만 듣고 **`tryForage` 에 도달하지 못했다** —
//   `sourceAt` 에 갈래를 넣는 것과 **그 갈래에 도달하는 것은 다른 명제**다(족보 (83)의 입력판).
//   ★서버 하네스는 `tryForage` 를 직접 불러 이 함정을 못 봤고 **실클라 하네스가 잡았다**(T3 물병과 같은 족).
//   ⇒ 게이트를 "여기서 **바다 것**이 열리나"로 바꾼다. ①갈대·②숲·③자갈은 여기서 안 센다 —
//     그걸 세면 바닷가에서 갈대가 열려 `drinkBrine` 안내를 덮는다(종전 동작을 뺏는 것이다).
function seaSourceAt(x, y, ctx) {
  const s = sourceAt(x, y, ctx);
  if (!s) return null;
  if (s.kind === 'brine') return s;
  return _Tidal().isCatch(s.kind) ? s : null;
}
module.exports = { CFG, KO, left, take, reset, size, sourceAt, seaSourceAt, RING };
