// ═══════════════════════════════════════════════════════════════════════════
// server/war-live.js — 실체 전쟁의 **대형·교전 기하** (존 좌표 하나 · 연속 전투)
//
// ★[T284 2026-09-14 · 재민 확정 "좌표계는 하나 · 전쟁은 항상 실체 · 전투는 연속 상태"]
//   이 파일은 옛 P2 LiveBattle(130×130 로컬 전장 · 맵↔로컬 미러 · 20Hz 서브루프 · 판 · 강제결판 · headless 폴백)을
//   **걷어낸** 자리다. 남은 것:
//   ① 대형(집결·행군·포진·콜라이더) — 전쟁실험실 _mu* 이식(무변 · 좌표 = 존 셀)
//   ② 교전(fight) — battle-core 의 ctx 하나를 **전쟁 몸 하나에** 붙이고, 그 병사(unit)의 x/y 를
//      **존 NPC(player)의 위치에 직접 묶는다**(접근자 · 복사본 0 · 미러 0). 스텝은 존 틱 안에서 한 번(dt = 1/TICK_HZ).
//      사기·궤주·화살·파손·상성 수식은 battle-core 그대로 부른다(재구현 0). 장애물은 ctx.world(호스트가 존 술어로 준다).
//   ③ 전이 — 대형(form) ⇄ 전진(advance) → 교전(engaged) → 대치(standoff = form 복귀) · 정산 계기는 **행위**(궤주·항복·철수).
//      판·국지 시간·결과(result)·시간 상한 없음. 정산 함수(war-core warResolveBattle)는 그대로 — 계기만 여기서 본다.
//
// 단위: battle-core 는 m 로 계산한다. 존 셀 = 1m = 32px(zone.js "32px=1m" · villages SZ=32) ⇒ M_PER_CELL 은
//   호스트가 넘기는 두 수(cellPx·pxPerM)의 비다(새 수 아님 · 지금 값 1). 병사 위치 m = player px / pxPerM.
// 결정론: 교전 rng = _muRng(전쟁 id·born 파생 — 옛 _npcSeed 그대로). 스텝 dt 고정(벽시계 아님) ⇒ 같은 초기 배치 = 같은 결과.
//   관측자는 어디에도 안 들어간다(존 술어·건물 행·고정 dt만 — T284 ⓓ 하네스가 잰다).
// Node(module.exports) / 브라우저(window.WarLive) dual export.
// ═══════════════════════════════════════════════════════════════════════════
;(function (root) {
'use strict';

var BattleCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
  ? require('../sim/battle-core.js') : root.BattleCore;

// ═══════════ 결정론 RNG (랩 _muRng verbatim — xorshift32, Math.random 금지) ═══════════
function _muRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ═══════════ ★[T874 2026-10-23] 교전 병사 · 대형 병사 빠른 꼴 — 손잡이 `T874_BATTLE_FAST`(★T900 켬 기본 · `=0` 끔 = 종전 그대로) ═══════════
//   왜: 몸 자리 묶기(아래 enlist · bindGroupUnit)가 x/y 접근자를 **몸마다 새 닫힘**으로 단다. ⓐ 교전 병사는 battle-core spawn 리터럴이
//   먼저 깐 데이터 칸 x/y 위에 덮인다(V8 `AccessorsOverwritingNonLast`) ⓑ 대형 병사는 새 칸이지만 둘째 몸부터 접근자 짝이 달라
//   같은 길을 못 탄다(`TransitionToDifferentAccessor`) ⇒ 둘 다 묶이는 순간 사전 모드 — 교전 스텝(30Hz)이 그 몸들을 걷는다.
//   켬: 접근자를 **모두가 같이 쓰는 함수 하나**로 달고, 몸(player)과 두 비(px/m · m/셀)는 숨은 칸(사설 필드 — 열거 · `in` · JSON · 반사 밖)에 둔다.
//   식은 글자 그대로(`p.x / k` · `v * k` · `p.x / k / m` · `v * m * k` — 같은 차례의 같은 곱셈 · 나눗셈 = 같은 값).
//   교전 병사는 접근자 칸이 생길 때 같이 달리도록 battle-core 가 막 지은 병사(아무도 아직 안 잡았다)를 **같은 칸 · 같은 차례 · 같은 값**의 객체로 다시 짓고
//   그 자리(ctx.units 끝)에 둔다. 모르는 칸 꼴이면 종전 길(아래 두 줄)로 간다.
//   ★★[T900 2026-10-23] **켬 기본**(★PM 10-23 · T874 회부 1) — `!== '0'` · 되돌림 `T874_BATTLE_FAST=0`(= T900 전 바이트 · 끔 갈래 = 종전 줄).
function _t874On() { return typeof process !== 'undefined' && !!process.env && process.env.T874_BATTLE_FAST !== '0'; }
// ═══════════ ★[T995 2026-10-29 · T956 회부 3 ㉡ ㉢] 시험 손잡이 둘 — 끔 기본 · 켜는 값 '1' 하나 · 끔 = 종전 글자 ═══════════
//   ㉡ `T995_CONTACT_REACH` — 접촉(stepFight)은 'shoot' 이거나 **손이 닿는 거리 안**의 'melee' 만 센다(손 = 그 병종 `reach` — battle-core 가 치는 그 문턱 · 겨눈 적 `u.tgt` 와의 거리).
//       종전: 'melee' 는 거리와 무관하게 접촉이다 — 탄 없는 사수 둘이 3.5m 에서 물러섬 ↔ 다가섬(battle-core 원거리 절)을 하는 동안 걸음마다 접촉이 서
//       대치(접촉 · 진척 없는 `standoffSec`)가 끝내 안 선다(보고 T956 §2-3 ⓑ · 존은 시간 상한이 없다).
//   ㉢ `T995_DRY_STANDOFF` — 맞붙은(engaged) 동안 **산 병사 hp 합이 한 번도 안 준 채** `standoffSec`(종전 대치 문턱 그대로)을 넘으면 대치.
//       칸 둘은 교전 객체에만(`f._t995Hp` 그 걸음 hp 합 · `f._t995HitT` 마지막으로 준 때 — 맞붙기 앞 걸음은 그때로 둔다) · 저장 줄 · 몸 무변.
//   새 수 0(`reach` · `standoffSec` 그대로).
function _t995On(k) { return typeof process !== 'undefined' && !!process.env && process.env[k] === '1'; }
const T995_CONTACT_REACH = _t995On('T995_CONTACT_REACH'), T995_DRY_STANDOFF = _t995On('T995_DRY_STANDOFF');
// ═══════════ ★★[T1019 2026-10-31 · T1008 회부 1 ⓒ] 방어 마중 원점이 막힌 칸에 안 든다 — 손잡이 `T1019_UNTRAP`(켬 기본 후보 · 되돌림 `=0` = 종전 글자) ═══════════
//   왜(보고 T1019 §1 · T1008 ⓒ 401날 전쟁 · 판 자 `~raid3` 시드 7 전쟁 9 농촌3 → 어촌6): 방어 포진(`_muDefHold`)은 원점을 포진점에서 공격 쪽으로 마중(`DEF_ADVANCE` · 상한
//     `DEF_ADVANCE_MAX` 8칸)하는데 그 걸음이 **막힌 칸인지 안 본다**(랩 `_muTickDefHold` 는 경로 커널 `_muFormStep` 으로 벽을 본다 — "지휘관도 벽 인지" · 서버 이식이 그 줄을 뺐다).
//     지휘 몸은 원점에 놓인다(`_muStepFollow` — T790 끔) ⇒ 원점이 건물 발자국 칸에 서면 지휘 몸이 그 칸 안에 서고, 풀린 뒤 battle-core 클램프(이전 자리도 막힘 → 제자리)로 못 나온다.
//     실측: 포진점 (2031.79, 3918) + 8칸 × 공격 원점 쪽 단위 = (2031.647, 3910.001) — 어촌6 집 발자국 칸 (2031, 3910) · 401날 그 칸.
//   켬: 마중 한 걸음이 막힌 칸이면 축별로 미끄러지고 둘 다 막히면 그 자리(villages `_warWalkGroupTo` 의 원점 걸음 줄과 같은 꼴 · 술어 = 호스트 `blockedCell`). 새 수 0.
//   같은 손잡이가 battle-core 클램프(갇힌 몸은 걸어 나온다)와 villages 포진점(막혔으면 설 수 있는 가장 가까운 칸)을 켠다.
const T1019_UNTRAP = typeof process !== 'undefined' && !!process.env && process.env.T1019_UNTRAP !== '0';   // ★[T1019 10-31] 켬 기본 후보 · 되돌림 `=0`
const _T874 = (function () {
  class O { constructor(o) { return o; } }
  class B extends O {
    #p; #k; #m;
    constructor(o, p, k, m) { super(o); this.#p = p; this.#k = k; this.#m = m; }
    static d() {
      return {
        ux: { get() { return this.#p.x / this.#k; }, set(v) { this.#p.x = v * this.#k; }, enumerable: true, configurable: true },
        uy: { get() { return this.#p.y / this.#k; }, set(v) { this.#p.y = v * this.#k; }, enumerable: true, configurable: true },
        gx: { get() { return this.#p.x / this.#k / this.#m; }, set(v) { this.#p.x = v * this.#m * this.#k; }, enumerable: true, configurable: true },
        gy: { get() { return this.#p.y / this.#k / this.#m; }, set(v) { this.#p.y = v * this.#m * this.#k; }, enumerable: true, configurable: true },
      };
    }
  }
  return { D: B.d(), stamp(o, p, k, m) { new B(o, p, k, m); return o; } };
})();
// battle-core spawn 리터럴 17칸 + addUnits 가 다는 칸(품질 `atk` · `agent`)만 아는 꼴이다 — 그 밖이면 null(종전 길).
const _T874_UK = 'id,side,type,x,y,hp,maxHp,shp,shMax,tgt,st,cd,face,_rt,mrl,routing,form';
function _t874Unit(u0, p, k) {
  const ks = Object.keys(u0).join(',');
  const hasAtk = ks === _T874_UK + ',atk' || ks === _T874_UK + ',atk,agent';
  if (!(ks === _T874_UK || ks === _T874_UK + ',agent' || hasAtk)) return null;
  const u = _T874.stamp({ id: u0.id, side: u0.side, type: u0.type }, p, k, 1);   // 숨은 칸을 먼저(사설 필드는 셈 키 꼴로 붙는다 — 바깥 칸이 열둘을 넘은 뒤면 V8 `TooManyFastProperties`)
  Object.defineProperty(u, 'x', _T874.D.ux);
  Object.defineProperty(u, 'y', _T874.D.uy);
  u.hp = u0.hp; u.maxHp = u0.maxHp; u.shp = u0.shp; u.shMax = u0.shMax; u.tgt = u0.tgt; u.st = u0.st; u.cd = u0.cd; u.face = u0.face;
  u._rt = u0._rt; u.mrl = u0.mrl; u.routing = u0.routing; u.form = u0.form;
  // 늦게 붙던 칸 열아홉을 미리(같은 이름 — 새 이름 0 · 값 `undefined` = 없던 칸과 같은 답: 읽는 자리가 전부 참거짓 · `== null` · `|| 0` 꼴 — test-battle-fast ① 이 문다).
  //   끔은 병사마다 붙는 차례가 사건(품질 · 파손 · 죽음 · 대형 손 · 존 세계 어댑터의 길 메모)을 따라 갈려도 사전 지도 하나를 같이 쓰지만,
  //   빠른 꼴은 그 차례마다 지도가 갈려(실측 병사 40 에 지도 6 · 교전 스텝이 끔보다 느렸다) 읽기 자리가 여러 꼴을 본다 — 미리 두면 모두 지도 하나다.
  //   붙이는 자리: battle-core(spawn 품질 `atk` · addUnits `agent` · trackVel `_vx` `_vy` `_px` `_py` · updateMorale `_rPrev` · stepBattle `_ox` `_oy` `_detCd` `broken` · hurt `_dead`) ·
  //   이 파일 enlist(`ctl` · `gu`) · 존 세계 어댑터(villages `_warWorld` advance `_cpT` `_clear` `_wpBlk` · `_warPolyWaypoint` `_rk`(셈 키 저장 — 바깥 칸 열둘 뒤 새 칸이면 사전) · `_warPathNext` `_wpth`).
  u.atk = hasAtk ? u0.atk : undefined; u.agent = ks.endsWith(',agent') ? u0.agent : undefined;
  u.ctl = undefined; u.gu = undefined; u._vx = undefined; u._vy = undefined; u._px = undefined; u._py = undefined; u._rPrev = undefined;
  u._ox = undefined; u._oy = undefined; u._detCd = undefined; u.broken = undefined; u._dead = undefined;
  u._cpT = undefined; u._clear = undefined; u._rk = undefined; u._wpBlk = undefined; u._wpth = undefined;
  return u;
}
// 대형 병사도 늦게 붙던 칸 아홉을 같은 이름으로 미리(값 undefined — 읽는 자리가 전부 값 꼴: `u.jx == null` · `u.bu &&` · `!u.dead` · `memo && memo.id` · `u._wpth ||`).
//   붙이는 자리: 이 파일 buildGroup(`slx` `sly` `cmd` `jx` `jy`) · enlist(`bu`) · villages `_warSyncMeta`(`dead`) · `_polyS` 셈 키 `_dk` · 대형 우회 `_wpth`.
//   끔은 사전 지도 하나지만 빠른 꼴은 붙는 차례(교전에 든 몸 · 죽은 몸 · 우회한 몸)마다 지도가 갈려 대형 걸음이 여러 꼴을 본다(실측 지킴 걸음이 끔보다 느렸다).
const _T874_GK = ['slx', 'sly', 'cmd', 'jx', 'jy', 'bu', 'dead', '_dk', '_wpth'];
function _t874Group(gu, p, k, m) {
  if (Object.prototype.hasOwnProperty.call(gu, 'x') || Object.prototype.hasOwnProperty.call(gu, 'y')) return false;   // 이미 칸이 있으면 종전 길
  if (_T874_GK.some((n) => Object.prototype.hasOwnProperty.call(gu, n))) return false;   // 늦게 붙던 칸이 벌써 있으면 종전 길(값을 덮지 않는다)
  _T874.stamp(gu, p, k, m);
  Object.defineProperty(gu, 'x', _T874.D.gx);
  Object.defineProperty(gu, 'y', _T874.D.gy);
  gu._bound = true;
  gu.slx = undefined; gu.sly = undefined; gu.cmd = undefined; gu.jx = undefined; gu.jy = undefined; gu.bu = undefined; gu.dead = undefined; gu._dk = undefined; gu._wpth = undefined;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// createWarLive(opts)
//   opts.BC            battle-core (기본 require)
//   opts.resolveBattle (w, day, {res, spec}) => void — war-core warResolveBattle(3인자) — 정산 함수 무변
//   opts.dayOf()       현재 econ world.day
//   opts.cellPx        셀 한 칸 px (villages SZ)            ┐ M_PER_CELL = cellPx / pxPerM
//   opts.pxPerM        1m 가 몇 px 인가 (zone "32px=1m")     ┘
//   opts.tickHz        존 틱 Hz (zone TICK_HZ) — 교전 스텝 dt = 1/tickHz
//   opts.blockedCell   (cx,cy 셀) → bool — 대형 콜라이더(물·바위·건물 행)
//   opts.log(msg)      선택
// ═══════════════════════════════════════════════════════════════════════════
function createWarLive(opts) {
  opts = opts || {};
  const BC = opts.BC || BattleCore;
  const resolveBattle = opts.resolveBattle;
  const dayOf = opts.dayOf || (() => 0);
  const log = typeof opts.log === 'function' ? opts.log : null;
  const PX_PER_M = +opts.pxPerM || +opts.cellPx || 32;
  const M_PER_CELL = (+opts.cellPx || PX_PER_M) / PX_PER_M;
  const TICK_HZ = +opts.tickHz || 30;
  const STEP_DT = 1 / TICK_HZ;
  // ★[T458 ③] 전쟁 화살 → 있는 `arrow_spawn`/`arrow_removed` 모양 그대로(존 플레이어 화살 · 클라 30-n-net 이 이미 그린다 · 소리 표 `arrow_spawn`).
  //   호스트가 둘을 준다: arrowOut(msg) = 방송 · arrowNear(xPx, yPx) = 관측자 반경 술어(존 anyViewerNear · AOI 800px).
  //   둘 중 하나라도 없으면 ctx.onArrow 를 안 건다 = 종전 그대로(메시지 0 · 비용 0).
  const arrowOut = typeof opts.arrowOut === 'function' ? opts.arrowOut : null;
  const arrowNear = typeof opts.arrowNear === 'function' ? opts.arrowNear : null;
  const arrowStat = { fire: 0, stone: 0, far: 0, sent: 0, hit: 0, end: 0, flush: 0 };   // 진단(프로세스 누적 · 영속 0)
  let _arrowSeq = 0;

  // ── 대형 상수 (전쟁실험실 5977~5980·7268~7283 verbatim) ──
  const WAR_ENGAGE_R = 50;                     // 두 대형 지휘관 접근 거리(셀) — 공격 주둔 링 = ENGAGE_R + DEF_STANDOFF
  const WAR_ALERT_R = WAR_ENGAGE_R * 3.6;      // 방어 경보 거리(셀·=180)
  const WAR_DEF_STANDOFF = WAR_ENGAGE_R * 0.9; // 방어 포진 거리(셀·=45)
  const MU = { SCATTER: 9, RALLY_OFF: 5, ARRIVE_R: 2.2,
    SLOT_GAP: 1.5, SLOT_DEPTH: 1.7, FOLLOW_SNAP: 0.35, FOLLOW_CAP: 5, ARR_TGT_R: 14,
    DEF_ADVANCE: 0.18, DEF_ADVANCE_MAX: 8, DEF_FORM: 'wall', NPC_SAMPLE: 34,
    FORM_R: 2.0, SEP_R: 0.9, SEP_STR: 1.1, MARCH_JITTER: 0.55 };
  const MU_TYPES = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
  const MU_TYPE_INT = { champion: 0, greataxe: 1, spear: 2, pike: 3, dagger: 4, archer: 5, slinger: 6, militia: 7 };
  const blockedCell = (typeof opts.blockedCell === 'function') ? opts.blockedCell : null;
  // ── 교전 거리(battle-core stepBattle 의 engR 그대로: 원거리 = 사거리+2 · 근접 = 13) ──
  const MELEE_ENG_R = 13;
  function engR(type) { const D = BC.UNITS[type]; return D && D.ranged > 0 ? D.ranged + 2 : MELEE_ENG_R; }
  // ── 대치 전이 시간 n(초) — 새 수 아님: "접촉을 잃은 쪽의 본대가 근접 교전 거리(13m)를 다시 좁히는 데 드는 시간"
  //   = MELEE_ENG_R / (그 교전 본대 행군 속도 — battle-core _cen.march, 본대 최저 spd). 창방패 1.5 m/s → 8.7초.
  //   값 후보(재민): ① 이 유도식(기본) ② 사기 수렴 3/M_RATE(2.1초) ③ 궁수 재장전 cd(8.0초) — 보고 §0-ⓒ 표.
  function standoffSec(f) { const c = f.ctx._cen; const m = Math.min(c.A.march || 2.2, c.B.march || 2.2); return MELEE_ENG_R / Math.max(0.1, m); }
  function _t995InReach(u) { const e = u.tgt, D = BC.UNITS[u.type]; return !!(e && e.hp > 0 && D && Math.hypot(e.x - u.x, e.y - u.y) < D.reach); }   // ★[T995 ㉡] 겨눈 적이 손 안

  // ═══════════ 대형 (랩 _mu* verbatim · 좌표 = 존 셀) ═══════════
  function _muAssignSlots(units, form) {
    const by = { champion: [], greataxe: [], spear: [], pike: [], dagger: [], archer: [], slinger: [], militia: [] };
    for (const u of units) (by[u.type] || by.dagger).push(u);
    const gap = MU.SLOT_GAP, dep = MU.SLOT_DEPTH;
    let wSpear, wBack, gMul, dMul;
    if (form === 'column') { wSpear = 3; wBack = 3; gMul = 1.0; dMul = 1.15; }
    else if (form === 'wall') { wSpear = 8; wBack = 8; gMul = 0.85; dMul = 1.4; }
    else if (form === 'open') { wSpear = 5; wBack = 5; gMul = 1.9; dMul = 1.9; }
    else if (form === 'circle') { wSpear = 99; wBack = 99; gMul = 1.0; dMul = 1.0; }
    else { wSpear = 6; wBack = 6; gMul = 1.0; dMul = 1.0; }
    const g = gap * gMul, d = dep * dMul;
    if (form === 'circle') {
      const outer = [...by.spear, ...by.champion, ...by.pike, ...by.greataxe, ...by.militia], inner = [...by.dagger, ...by.archer, ...by.slinger];
      const oR = Math.max(2, outer.length * g * 0.16); for (let i = 0; i < outer.length; i++) { const a = i / Math.max(1, outer.length) * 6.283, u = outer[i]; u.slx = Math.cos(a) * oR; u.sly = Math.sin(a) * oR; }
      const iR = Math.max(1, oR - 1.5); for (let i = 0; i < inner.length; i++) { const a = i / Math.max(1, inner.length) * 6.283 + 0.5, u = inner[i]; u.slx = Math.cos(a) * iR * 0.6; u.sly = Math.sin(a) * iR * 0.6; }
      const cmdC = units.find(u => u.cmd); if (cmdC) { const ox = cmdC.slx, oy = cmdC.sly; for (const u of units) { u.slx -= ox; u.sly -= oy; } } return;
    }
    let frontX = 0;
    const lay = (arr, x0, w, zig) => { const n = arr.length; if (!n) return x0; const cols = Math.ceil(n / w);
      for (let i = 0; i < n; i++) { const c = (i / w) | 0, r = i % w, rn = Math.min(w, n - c * w); arr[i].slx = x0 - c * d; arr[i].sly = (r - (rn - 1) / 2) * g + (zig ? (c % 2) * g * 0.5 : 0); }
      return x0 - cols * d; };
    let x = frontX;
    const _fronters = [...by.champion, ...by.greataxe];
    if (_fronters.length) { x = lay(_fronters, x, Math.min(wSpear, _fronters.length || 1), false) - d * 0.4; }
    x = lay(by.spear, x, wSpear, false) - d * 0.3;
    if (by.pike.length) { x = lay(by.pike, x, wSpear, false) - d * 0.3; }
    if (by.militia.length) { x = lay(by.militia, x, wSpear, false) - d * 0.3; }
    const _backers = [...by.archer, ...by.slinger];
    if (_backers.length) { lay(_backers, x, wBack, form !== 'column'); }
    if (by.dagger.length) { const half = Math.ceil(by.dagger.length / 2);
      for (let i = 0; i < by.dagger.length; i++) { const u = by.dagger[i], top = i < half, idx = top ? i : i - half, cnt = top ? half : by.dagger.length - half;
        if (form === 'column') { u.slx = x - idx * d; u.sly = (top ? -1 : 1) * g * 1.2; }
        else { u.slx = frontX - 1 * d + (idx - (cnt - 1) / 2) * g * 0.7; u.sly = (top ? -1 : 1) * (wSpear / 2 * g + g * 2.2); } } }
    const cmd = units.find(u => u.cmd); if (cmd) { const ox = cmd.slx, oy = cmd.sly; for (const u of units) { u.slx -= ox; u.sly -= oy; } }
  }
  function _muSlotXY(g, u) { const cs = Math.cos(g.heading), sn = Math.sin(g.heading); return [g.cmd.cx + u.slx * cs - u.sly * sn, g.cmd.cy + u.slx * sn + u.sly * cs]; }
  function _muSeparate(g, dDays) {
    const us = g.units, n = us.length; if (n < 2) return;
    const R = MU.SEP_R, R2 = R * R, str = MU.SEP_STR * dDays;
    const px = new Float64Array(n), py = new Float64Array(n);
    for (let i = 0; i < n; i++) { const a = us[i]; let sx = 0, sy = 0, cnt = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; const b = us[j]; const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 1e-6) { const dv = Math.sqrt(d2); sx += dx / dv; sy += dy / dv; cnt++; } }
      if (cnt) { px[i] = sx / cnt; py[i] = sy / cnt; } }
    for (let i = 0; i < n; i++) { const a = us[i]; if (a.cmd) continue; if (px[i] || py[i]) { const nx2 = a.x + px[i] * str, ny2 = a.y + py[i] * str; if (!blockedCell || !blockedCell(nx2, ny2)) { a.x = nx2; a.y = ny2; } } }
  }
  // 슬롯 추종 — ★[T284] 한 걸음이 막힌 칸(물·바위·건물 행)이면 그 축을 버린다(대형도 존 콜라이더를 본다).
  //   ★[T790] 호스트가 대형에 몸 걸음(`g._t790Walk` 셀/스텝 — 존 손잡이 `T790_NO_SNAP` 켬에서만 선다)을 달면 지휘 몸도 원점까지 **걸어서** 가고(종전 = 바로 놓기)
  //     병사 한 걸음도 그 걸음을 안 넘는다. 칸이 없으면(끔 · 랩) 종전 글자 그대로.
  //   ★[T804] 걷는 몸은 호스트 훅(`g.detour.walk`)이 주는 점을 먼저 겨눈다 — 막혔을 때만 슬롯까지 길을 묻고(호스트 · path-core 걸음 프리셋) 그 길은 끝까지 따른다.
  function _muStepFollow(g, cap) {
    if (!g || !g.units) return;
    const cs = Math.cos(g.heading), sn = Math.sin(g.heading);
    const wc = g._t790Walk > 0 ? g._t790Walk : 0;
    for (const u of g.units) {
      if (u.dead) continue;
      if (u.cmd && !wc) { u.x = g.cmd.cx; u.y = g.cmd.cy; continue; }
      const tx = u.cmd ? g.cmd.cx : g.cmd.cx + u.slx * cs - u.sly * sn + (u.jx || 0), ty = u.cmd ? g.cmd.cy : g.cmd.cy + u.slx * sn + u.sly * cs + (u.jy || 0);
      const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy);
      if (dd > (u.cmd ? 0 : MU.FOLLOW_SNAP)) { const st = Math.min(cap != null ? cap : MU.FOLLOW_CAP, dd, wc || dd);
        const inBlk = wc && blockedCell ? blockedCell(u.x, u.y) : false;   // ★[T790] 걷는 몸이 막힌 칸 안에 섰으면(발자국 색인이 뒤에 섰다 등) 곧은 걸음으로 걸어 나온다 — 한 걸음이 작아 칸 안 다음 점은 늘 막힘이라 종전 문으론 못 나온다
        // ★[T804 ①] 걷는 몸의 길 — 호스트 훅(`g.detour.walk`)이 있으면 그 몸의 걸음은 훅이 낸다(≤ 몸 걸음): 훅이 준 점(길 위면 그 길 · 막혔을 때만
        //   슬롯까지 길을 묻는다 — 호스트 = 경로 정본 path-core 걸음 프리셋) · 없으면(null — 곧은 줄이 열렸다 · 길 끝) 슬롯으로 곧게 · 막히면 축 미끄럼까지.
        //   아래 T541 ⓐ 우회(행군로 투영점 · 그 길 탐색)는 걷는 몸에 안 부른다 — 길은 훅이 이미 냈고, 못 가는 점으로 걸음마다 다시 찾는 탐색이 틱을 먹는다.
        //   훅이 없으면(끔 · 랩) 아래 종전 걸음 그대로.
        if (wc && g.detour && g.detour.walk) { const w = g.detour.walk(u, tx, ty, st);
          const ax = w ? w.x : tx, ay = w ? w.y : ty, ex = ax - u.x, ey = ay - u.y, ed = Math.hypot(ex, ey);
          if (ed > 0) { const s2 = Math.min(st, ed), mx = u.x + ex / ed * s2, my = u.y + ey / ed * s2;
            if (!blockedCell || inBlk || !blockedCell(mx, my)) { u.x = mx; u.y = my; }
            else if (!blockedCell(mx, u.y)) u.x = mx;
            else if (!blockedCell(u.x, my)) u.y = my; }
          continue; }
        // ★[T541 ⓐ] 슬롯까지 곧은 줄이 막혔으면(호스트 술어 `detour.clear`) 곧게 가지 않고 우회를 따른다. 종전은 다음 한 걸음만 봐서,
        //   한 걸음이 열려 있으면 막다른 벽 앞으로 들어갔다가 우회로 길에 돌아오기를 되풀이하며 그 자리에 섰다(실측 T541 임업2 — 964,1854
        //   에서 행군 내내 · 지휘관은 400칸 앞). 술어가 없는 호스트(랩)는 종전 그대로.
        if (g.detour && g.detour.clear && !g.detour.clear(u, tx, ty)) { const w = g.detour(u, tx, ty);
          if (w) { const ex = w.x - u.x, ey = w.y - u.y, ed = Math.hypot(ex, ey); if (ed > 1e-6) { const s2 = Math.min(st, ed), mx = u.x + ex / ed * s2, my = u.y + ey / ed * s2; if (!blockedCell || !blockedCell(mx, my)) { u.x = mx; u.y = my; continue; } } } }
        const nx = u.x + dx / dd * st, ny = u.y + dy / dd * st;
        if (!blockedCell || inBlk || !blockedCell(nx, ny)) { u.x = nx; u.y = ny; }
        else if (!blockedCell(nx, u.y)) u.x = nx;
        else if (!blockedCell(u.x, ny)) u.y = ny;
        else if (g.detour) {   // 곧은 걸음이 막혔다 — 호스트가 준 우회(행군로 위 다음 점)로 한 걸음
          const w = g.detour(u, tx, ty);
          if (w) { const ex = w.x - u.x, ey = w.y - u.y, ed = Math.hypot(ex, ey); if (ed > 1e-6) { const s2 = Math.min(st, ed), mx = u.x + ex / ed * s2, my = u.y + ey / ed * s2; if (!blockedCell(mx, my)) { u.x = mx; u.y = my; } } }
        } }
    }
    _muSeparate(g, 1);
  }
  function _muDefHold(g, atkCmd, cap) {
    if (!g || !g.holdPt) return;
    if (atkCmd) { const hx = atkCmd.cx - g.cmd.cx, hy = atkCmd.cy - g.cmd.cy, hd = Math.hypot(hx, hy); if (hd > 0.5) g.heading = Math.atan2(hy, hx); }
    if (atkCmd && MU.DEF_ADVANCE > 0) { const ax = atkCmd.cx - g.holdPt.cx, ay = atkCmd.cy - g.holdPt.cy, ad = Math.hypot(ax, ay);
      const advNow = Math.hypot(g.cmd.cx - g.holdPt.cx, g.cmd.cy - g.holdPt.cy);
      if (ad > 1 && advNow < MU.DEF_ADVANCE_MAX) { const step = Math.min(MU.FOLLOW_CAP * MU.DEF_ADVANCE, MU.DEF_ADVANCE_MAX - advNow);
        if (!T1019_UNTRAP || !blockedCell) { g.cmd.cx += ax / ad * step; g.cmd.cy += ay / ad * step; }   // 끔 = 종전 글자(술어를 안 본다)
        else { const nx = g.cmd.cx + ax / ad * step, ny = g.cmd.cy + ay / ad * step;   // ★[T1019 ⓒ] 켬 — 마중 원점이 막힌 칸(건물 발자국 · 지형 · 나무)에 안 든다: 축별로 미끄러지고 둘 다 막히면 그 자리(villages `_warWalkGroupTo` 줄과 같은 꼴 · 랩 `_muTickDefHold` "지휘관도 벽 인지")
          //   원점이 이미 막힌 칸 안이면(재편 원점 = 갇힌 몸 자리 등) 막지 않는다 — 나오는 걸음(T790 `inBlk` · battle-core 클램프와 같은 규칙)
          if (!blockedCell(nx, ny) || blockedCell(g.cmd.cx, g.cmd.cy)) { g.cmd.cx = nx; g.cmd.cy = ny; } else if (!blockedCell(nx, g.cmd.cy)) g.cmd.cx = nx; else if (!blockedCell(g.cmd.cx, ny)) g.cmd.cy = ny; } } }
    _muStepFollow(g, cap != null ? cap : MU.FOLLOW_CAP);
  }
  function _muCmdDist(a, b) { if (!a || !b || !a.cmd || !b.cmd) return Infinity; return Math.hypot(a.cmd.cx - b.cmd.cx, a.cmd.cy - b.cmd.cy); }
  function buildGroup(units, form, rally, heading, seed) {
    if (!units || !units.length) return null;
    const rng = _muRng((seed || 1) * 7 + 1);
    for (const u of units) { u.slx = 0; u.sly = 0; u.cmd = false; if (u.jx == null) { u.jx = (rng() - 0.5) * MU.MARCH_JITTER; u.jy = (rng() - 0.5) * MU.MARCH_JITTER; } }
    units[0].cmd = true;
    const g = { units, comp: null, form: form || 'line', heading: heading || 0, cmd: { cx: rally.cx, cy: rally.cy }, rally: { cx: rally.cx, cy: rally.cy }, commander: units[0] };
    _muAssignSlots(units, g.form);
    return g;
  }
  // 교전 뒤 대형 재편 — 살아 있는 병사만, 첫 생존자가 지휘관, 대형 원점 = 그 자리(스냅 0 · 슬롯만 다시 배정).
  function regroup(g) {
    if (!g || !g.units) return null;
    const alive = g.units.filter(u => !u.dead);
    if (!alive.length) { g.units = []; return g; }
    for (const u of alive) u.cmd = false;
    alive[0].cmd = true; g.units = alive; g.commander = alive[0];
    g.cmd = { cx: alive[0].x, cy: alive[0].y };
    _muAssignSlots(alive, g.form);
    return g;
  }
  function _muCompForm(comp) { return (comp && comp.form) || 'line'; }

  // ═══════════ 교전(fight) — 전쟁 몸 하나에 battle-core ctx 하나 ═══════════
  // makeFight(w, world, quality) — world = battle-core ctx.world 어댑터(존 술어 · 호스트가 만든다).
  //   rng 시드 = 옛 _npcSeed 그대로(w.id·w.born 파생).
  function makeFight(w, world, quality) {
    const ctx = BC.createContext();
    const seed = (((w.id || 1) * 911 + ((w.born || 0) | 0) * 17 + 3) >>> 0);
    ctx.rng = _muRng(seed);
    ctx.world = world || null;
    ctx.terrain = 'zone';
    const handle = BC._makeHandle(ctx);
    const f = { w, ctx, handle, seed, quality: quality || { A: null, B: null },
      state: 'form', t: 0, contactT: -1, gapT: 0, bestGap: Infinity, engagedOnce: false, contacts: 0,
      byPid: new Map(), settled: null, _stepMs: 0 };
    if (arrowOut && arrowNear) ctx.onArrow = (kind, ar, u) => _arrowEvent(f, kind, ar, u);
    return f;
  }
  // ★[T458 ③] 화살 사건 하나 — 발사('fire') · 끝('hit' 맞음 | 'end' 사거리 다 날아 땅). battle-core 는 보기만 하는 훅이라 상태 무변.
  //   발사: 궁수만(투석병 `ammo:'stones'` 은 화살이 아니다 — 세지만 안 보낸다) · 쏜 몸 자리가 관측자 반경 안일 때만.
  //   끝: 보낸 화살만 닫는다(안 보낸 화살의 remove 0). 필드 = 있는 모양 + `hit`(맞은 몸 pid · 땅이면 없음) 하나.
  function _arrowEvent(f, kind, ar, u) {
    if (kind === 'fire') {
      arrowStat.fire++;
      const D = BC.UNITS && u ? BC.UNITS[u.type] : null;
      if (D && D.ammo) { arrowStat.stone++; return; }
      const x = ar.x * PX_PER_M, y = ar.y * PX_PER_M;
      if (!arrowNear(x, y)) { arrowStat.far++; return; }
      const aid = 'W' + (f.w && f.w.id != null ? f.w.id : 0) + '.' + (++_arrowSeq);
      ar._aid = aid; arrowStat.sent++;
      arrowOut({ type: 'arrow_spawn', aid, x, y, vx: ar.vx * PX_PER_M, vy: ar.vy * PX_PER_M, ownerPid: u && u.agent != null ? u.agent : null });
      return;
    }
    if (!ar || !ar._aid) return;
    const m = { type: 'arrow_removed', aid: ar._aid };
    if (kind === 'hit') { arrowStat.hit++; if (u && u.agent != null) m.hit = u.agent; } else arrowStat.end++;
    ar._aid = null;
    arrowOut(m);
  }
  // 정산 때 아직 날고 있는 보낸 화살을 닫는다(교전 ctx 가 버려지면 battle-core 가 끝 사건을 못 낸다 → 클라가 4.5초 헛날림).
  function _arrowFlush(f) {
    if (!f || !f.ctx || !f.ctx.arrows) return;
    for (const ar of f.ctx.arrows) if (ar && ar._aid) { arrowStat.flush++; const aid = ar._aid; ar._aid = null; if (arrowOut) arrowOut({ type: 'arrow_removed', aid }); }
  }
  // 병사 하나를 교전에 올린다 — battle-core addUnits(무변) 로 만들고, 그 x/y 를 존 NPC 위치에 **묶는다**.
  //   gu = 대형 병사 {type, pid, x, y(셀)} · p = players.get(pid). 반환 = battle unit.
  function enlist(f, side, gu, p) {
    if (!f || !gu || !p || f.byPid.has(gu.pid)) return f && f.byPid.get(gu.pid);
    const ctx = f.ctx;
    if (!ctx.sides[side].form) ctx.sides[side].form = 'line';
    const n = f.handle.addUnits(side, [{ type: gu.type, x: p.x / PX_PER_M, y: p.y / PX_PER_M, agent: gu.pid }], f.quality[side] || null);
    if (!n) return null;
    const uf = _t874On() ? _t874Unit(ctx.units[ctx.units.length - 1], p, PX_PER_M) : null;   // ★[T874] 켬 — 같은 칸 · 같은 값 빠른 꼴로 다시 지어 그 자리에
    if (uf) ctx.units[ctx.units.length - 1] = uf;
    const u = ctx.units[ctx.units.length - 1];
    if (!uf) {   // 끔(종전) — 접근자를 있던 칸 위에 덮는다
      Object.defineProperty(u, 'x', { get() { return p.x / PX_PER_M; }, set(v) { p.x = v * PX_PER_M; }, enumerable: true, configurable: true });
      Object.defineProperty(u, 'y', { get() { return p.y / PX_PER_M; }, set(v) { p.y = v * PX_PER_M; }, enumerable: true, configurable: true });
    }
    u.face = side === 'A' ? (f.w._heading || 0) : (f.w._heading || 0) + Math.PI;
    u.ctl = true;            // 처음엔 대형이 몬다
    u.gu = gu; gu.bu = u;    // 대형 병사 ↔ 전투 병사(같은 몸 — 위치는 p 하나)
    f.byPid.set(gu.pid, u);
    return u;
  }
  // 대형 병사(gu)의 셀 좌표도 같은 player 에 묶는다 — 대형·교전·존이 **한 좌표**를 읽고 쓴다.
  function bindGroupUnit(gu, p) {
    if (!gu || !p || gu._bound) return;
    if (_t874On() && _t874Group(gu, p, PX_PER_M, M_PER_CELL)) return;   // ★[T874] 켬 — 같이 쓰는 접근자 · 숨은 칸 · 늦게 붙던 칸 미리(같은 값)
    Object.defineProperty(gu, 'x', { get() { return p.x / PX_PER_M / M_PER_CELL; }, set(v) { p.x = v * M_PER_CELL * PX_PER_M; }, enumerable: true, configurable: true });
    Object.defineProperty(gu, 'y', { get() { return p.y / PX_PER_M / M_PER_CELL; }, set(v) { p.y = v * M_PER_CELL * PX_PER_M; }, enumerable: true, configurable: true });
    gu._bound = true;
  }
  function setSideCtl(f, side, on) { for (const u of f.ctx.units) if (u.side === side && u.hp > 0) { u.ctl = !!on; if (on) { u.st = 'form'; u.tgt = null; } } }
  function aliveOf(f, side) { let a = 0, fr = 0; for (const u of f.ctx.units) { if (u.side !== side || u.hp <= 0) continue; a++; if (!u.routing) fr++; } return { alive: a, fighting: fr }; }
  function aliveCounts(f) { if (!f) return { aliveA: 0, aliveB: 0 }; return { aliveA: aliveOf(f, 'A').alive, aliveB: aliveOf(f, 'B').alive }; }
  function centroid(f, side) { let x = 0, y = 0, n = 0; for (const u of f.ctx.units) { if (u.side !== side || u.hp <= 0) continue; x += u.x; y += u.y; n++; } return n ? { x: x / n, y: y / n, n } : null; }

  // 전진 명령 — side 가 전투 스텝에 들어간다(적이 사거리 밖이면 world.advance 가 적 본대/목표로 끈다).
  function orderAdvance(f, side) { setSideCtl(f, side, false); if (f.state === 'form') { f.state = 'advance'; f.gapT = f.t; f.bestGap = Infinity; } }
  // 대치 — 양쪽을 대형으로 되돌린다(추격 없음). 호출측(villages)이 대형 재편·주둔점·war 상태를 맡는다.
  function toStandoff(f) { setSideCtl(f, 'A', true); setSideCtl(f, 'B', true); f.state = 'form'; f.contactT = -1; f.bestGap = Infinity; }

  // stepFight(f) — 존 틱 한 번(dt = 1/TICK_HZ). 반환 = 이번 틱의 사건 { contact, standoff, rout:'A'|'B'|null }.
  function stepFight(f) {
    const ctx = f.ctx; f.t += STEP_DT;
    BC._trackVel(ctx, STEP_DT);
    BC._stepBattle(ctx, STEP_DT);
    const ev = { contact: false, standoff: false, rout: null };
    if (f.state === 'form') return ev;
    // 접촉 = battle-core 타격 판정 상태(근접 사거리 안 'melee' · 사거리 안 'shoot')
    for (const u of ctx.units) { if (u.hp > 0 && !u.ctl && (u.st === 'shoot' || (u.st === 'melee' && (!T995_CONTACT_REACH || _t995InReach(u))))) { ev.contact = true; break; } }   // ★[T995 ㉡] 켬 = 'melee' 는 손 안일 때만
    if (ev.contact) { f.contactT = f.t; if (f.state !== 'engaged') { f.state = 'engaged'; f.engagedOnce = true; f.contacts++; setSideCtl(f, 'A', false); setSideCtl(f, 'B', false); } }
    // 전진 진척(본대 간격이 1m 이상 줄면 진척) — 막혀서 못 붙는 전진도 대치로 떨어진다
    const ca = centroid(f, 'A'), cb = centroid(f, 'B');
    if (ca && cb) { const gap = Math.hypot(ca.x - cb.x, ca.y - cb.y); if (gap < f.bestGap - 1) { f.bestGap = gap; f.gapT = f.t; } }
    else if (!cb && ca) { f.gapT = f.t; }   // 적 본대 없음(목표 행진) — 진척 판정은 호스트(목표 도달)
    // 궤주 정산 계기 — 교전이 한 번이라도 있었고, 한쪽의 싸우는 병사(비궤주 생존)가 0
    if (f.engagedOnce) {
      const a = aliveOf(f, 'A'), b = aliveOf(f, 'B');
      // battle-core 종료 판정 식 그대로(fa/fb = 비궤주 생존 · la/lb = 생존). 동수는 수비가 자리를 지킨다(판 결과 '무' 대신 — 정산은 승자가 있어야 한다).
      if (a.fighting === 0 && b.fighting > 0) ev.rout = 'A';
      else if (b.fighting === 0 && a.fighting > 0) ev.rout = 'B';
      else if (a.fighting === 0 && b.fighting === 0) ev.rout = (a.alive > b.alive) ? 'B' : 'A';
    }
    if (T995_DRY_STANDOFF) {   // ★[T995 ㉢] 산 병사 hp 합 — 맞붙은 동안 준 마지막 때(맞붙기 앞 걸음은 그때로 둔다)
      let hp = 0; for (const u of ctx.units) if (u.hp > 0) hp += u.hp;
      if (f.state !== 'engaged' || f._t995Hp === undefined || hp < f._t995Hp) f._t995HitT = f.t;
      f._t995Hp = hp;
    }
    if (!ev.rout) {
      const last = Math.max(f.contactT, f.gapT);
      if (f.t - last > standoffSec(f)) { toStandoff(f); ev.standoff = true; }
      else if (T995_DRY_STANDOFF && f.state === 'engaged' && f.t - Math.max(f._t995HitT, f.gapT) > standoffSec(f)) { toStandoff(f); ev.standoff = true; }   // ★[T995 ㉢] 피해 없는 맞붙음 → 대치
    }
    return ev;
  }

  // 정산 입력(res) — war-core runBattleHeadless 반환형과 같은 모양(옛 resolveLiveBattle 의 수집부 그대로).
  function buildRes(f, winner) {
    const S = f.ctx.sides;
    const survivorsByType = { A: {}, B: {} };
    let _rA = 0, _rB = 0, _mA = 0, _mB = 0;
    for (const u of f.ctx.units) { if (u.hp > 0) { const s = survivorsByType[u.side]; s[u.type] = (s[u.type] || 0) + 1;
      if (u.routing) { if (u.side === 'A') { _rA++; _mA += (u.mrl || 0); } else { _rB++; _mB += (u.mrl || 0); } } } }
    return { winner, atkStart: S.A.start, atkDead: S.A.dead, defStart: S.B.start, defDead: S.B.dead,
      atkSurv: S.A.start - S.A.dead, defSurv: S.B.start - S.B.dead, survivorsByType, ticks: Math.round(f.t * TICK_HZ), tick: +f.t.toFixed(2),
      routA: _rA, routB: _rB, routMrlA: _rA ? _mA / _rA : 0.5, routMrlB: _rB ? _mB / _rB : 0.5 };
  }
  // settle(f, why, winner) — 정산은 **정확히 한 번**(f.settled 게이트). why = 'rout' | 'withdraw' | 'surrender' | 'walkover'.
  //   rout·withdraw 는 warResolveBattle(3인자 · 함수 무변)을 부르고, surrender·walkover 는 war-core 가 이미 정산했다(기록만).
  function settle(f, why, winner, spec) {
    if (!f || f.settled) return false;
    f.settled = { why, winner: winner || null, day: dayOf(), t: f.t };
    _arrowFlush(f);   // ★[T458 ③]
    if ((why === 'rout' || why === 'withdraw') && typeof resolveBattle === 'function') {
      const res = buildRes(f, winner);
      f.settled.res = res;
      resolveBattle(f.w, dayOf(), { res, spec: spec || null });
    }
    if (log) log('정산 ' + why + ' ' + (f.w.atk && f.w.atk.name) + '→' + (f.w.def && f.w.def.name) + ' 승 ' + (winner || '-'));
    return true;
  }

  return {
    // 대형
    buildGroup, regroup, _muAssignSlots, _muSlotXY, _muSeparate, _muStepFollow, _muDefHold, _muCmdDist, _muCompForm, bindGroupUnit,
    // 교전
    makeFight, enlist, stepFight, arrowStat, orderAdvance, toStandoff, setSideCtl, settle, buildRes, aliveCounts, centroid, engR, standoffSec,
    // 상수
    WAR_ENGAGE_R, WAR_ALERT_R, WAR_DEF_STANDOFF, MU, MU_TYPES, MU_TYPE_INT, M_PER_CELL, PX_PER_M, TICK_HZ, STEP_DT, MELEE_ENG_R,
  };
}

const WarLive = { createWarLive, _muRng };
root.WarLive = WarLive;
if (typeof module !== 'undefined' && module.exports) module.exports = WarLive;

})(typeof window !== 'undefined' ? window : globalThis);
