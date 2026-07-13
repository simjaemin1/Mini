// ═══════════════════════════════════════════════════════════════════════════
// server/war-live.js — 전쟁실험실.html 의 LiveBattle 상태머신 "서버 실체 전투" 이식(P2).
//   무엇: LOD 결판의 physical 경로 — eta 도달 + 방어 마을권 관측자 근접 시 war-core headless 대신
//     battle-core 를 서버에서 실시간(벽시계 30Hz 실dt)으로 스텝 → RESOLVED 시 war-core warResolveBattle
//     3인자({res,spec})로 econ 되먹임 1회. econ(vil.econ)=유일 영속 진실, 전투=사상·노획 숫자 생성기.
//   ★[P2 범위] 서버 내부 스텝만 — broadcast·클라 렌더·플레이어 지휘·agent 미러(_lbSyncAgents)·궤주 그룹·
//     포로·데칼 전부 제외(P3~P4). 행군 없음(eta 시점 직접 인스턴스화 — 실체 병사 몸은 P3).
//   ★[랩과의 차이] 랩 stepLiveBattles 는 econ-day 압축(LB_SEC_PER_DAY=180)으로 맵일→전투초 환산.
//     여기선 그 압축을 버리고 벽시계 실dt(초)를 그대로 전투 시간축으로 사용(acc 누적) → eta 순간
//     실시간 전투 열려 수십초 내 결판. 라운드로빈 예산(LB_STEP_BUDGET)은 동시 다전투 프레임 부하 상한.
//   ★ battle-core.js·economy-sim 무수정 재사용. war-core 는 warResolveBattle 3인자만 additive(headless byte불변).
//   ★ 결정론: 전투 rng=_muRng(_npcSeed[w.id·w.born 파생]) — 랩 verbatim. 되먹임 warKill rng 는 war-core
//     _battleRng(day,w.id). 둘 다 시드 고정 → 동일 setup 2회 = byte 동일. 스텝 배치 크기(라운드로빈·실dt)는
//     결과 불변(step(LB_DT) 고정dt·rng draw 순서 동일 — 배치 방식과 무관).
//   Node(module.exports) / 브라우저(window.WarLive) dual export (war-core·battle-core 패턴).
// ═══════════════════════════════════════════════════════════════════════════
;(function (root) {
'use strict';

// ── 의존(headless 안전 require) ──
var BattleCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
  ? require('../sim/battle-core.js') : root.BattleCore;
var WarCore = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
  ? require('../sim/war-core.js') : root.WarCore;

// ═══════════ 결정론 RNG (랩 _muRng verbatim — xorshift32, Math.random 금지) ═══════════
function _muRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ═══════════════════════════════════════════════════════════════════════════
// createWarLive(opts) — LiveBattle 서버 인스턴스 팩토리(전쟁당 1경로, LIVE_BATTLES 소유).
//   opts.BC          battle-core (기본 require)
//   opts.toBattleSpec  war-core toBattleSpec(pure — spec 구성). 기본 WarCore.toBattleSpec
//   opts.resolveBattle (w, day, {res,spec}) => void  = war-core createWar().warResolveBattle(3인자·되먹임)
//   opts.centerOf(v) → {cx,cy}(맵 셀)  전투 origin 산출용(방어 마을 center)
//   opts.dayOf() → 현재 econ world.day  (결판 되먹임 day)
//   opts.log(msg)   선택 로거
// ═══════════════════════════════════════════════════════════════════════════
function createWarLive(opts) {
  opts = opts || {};
  const BC = opts.BC || BattleCore;
  const toBattleSpec = opts.toBattleSpec || (WarCore && WarCore.toBattleSpec);
  const resolveBattle = opts.resolveBattle;   // 필수 — 없으면 되먹임 no-op(안전)
  const centerOf = opts.centerOf || (v => (v && v.center) ? v.center : { cx: (v && v.ccx) || 0, cy: (v && v.ccy) || 0 });
  const dayOf = opts.dayOf || (() => 0);
  const log = typeof opts.log === 'function' ? opts.log : null;

  // ── battle-core 로컬 월드 상수(랩 정합) ──
  const WW = BC.WORLD_W;                       // 전장 130m
  const M2C = 1.0;                             // 1m(로컬)→1셀(맵) — 실축 대이행 상수
  const LB_CEN = WW / 2;                       // 로컬 전장 중심(65)
  const LB_OFF = 25;                           // origin 후퇴량(방어열이 마을 center 에 얹히게)
  // ── 시간축·예산 상수 ──
  const LB_DT = (WarCore && WarCore.WAR_BATTLE_DT != null) ? WarCore.WAR_BATTLE_DT : 0.05;   // battle-core 서브스텝 dt(헤드리스 정합)
  const MAXTICK = (WarCore && WarCore.WAR_BATTLE_MAXTICK != null) ? WarCore.WAR_BATTLE_MAXTICK : 4000;
  const LB_MAXSUB = 200;                       // 단일 전투 한 프레임 서브스텝 상한(과대 dt 폭주 방지)
  const LB_MAX_LOCALT = MAXTICK * LB_DT;       // 전투 로컬시간 안전상한(200s) — 교착 강제결판
  const LB_STEP_BUDGET = 700;                  // 프레임당 전 전투 합계 서브스텝 예산(라운드로빈 분배)
  const LB_MAX_BATTLES = 64;                   // 동시 실체 전투 안전 상한(초과 생성 거부 → headless 폴백)
  const WQ_STONE = 0.5;                        // war-core _warWEAP_Q_STONE 기본(무기품질 폴백 — w.weapQ 항상 세팅이라 사실상 미사용)

  // ── P3 실체(집결·행군·대형·포진·콜라이더) 상수 (전쟁실험실 5977~5980·7268~7283 verbatim) ──
  const WAR_ENGAGE_R = 50;                     // 교전 개시 거리(셀) = LB_OFF*2 — 두 대형 지휘관 이만큼 접근 시 그 자리 개전(origin=중간·스냅≈0)
  const WAR_ALERT_R = WAR_ENGAGE_R * 3.6;      // 방어 경보 거리(셀·=180) — 공격 지휘관이 방어 마을 center 반경 안이면 방어 포진 개시
  const WAR_DEF_STANDOFF = WAR_ENGAGE_R * 0.9; // 방어 포진 거리(셀·=45) — 방어 대열을 마을 앞(공격 방향)에 세움(성문 앞 진형)
  const _WAR_MARCH = (WarCore && WarCore.WAR_MARCH != null) ? WarCore.WAR_MARCH : 1440;
  const MU = { SCATTER: 9, RALLY_OFF: 5, ARRIVE_R: 2.2, MUSTER_SPD: Math.round(_WAR_MARCH * 1.35),
    SLOT_GAP: 1.5, SLOT_DEPTH: 1.7, FOLLOW_SNAP: 0.35, FOLLOW_CAP: 5, ARR_TGT_R: 14,
    DEF_ADVANCE: 0.18, DEF_ADVANCE_MAX: 8, DEF_FORM: 'wall', NPC_SAMPLE: 34,
    FORM_R: 2.0, SEP_R: 0.9, SEP_STR: 1.1, MARCH_JITTER: 0.55 };
  const MU_TYPES = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
  const MU_TYPE_INT = { champion: 0, greataxe: 1, spear: 2, pike: 3, dagger: 4, archer: 5, slinger: 6, militia: 7 };
  const blockedCell = (typeof opts.blockedCell === 'function') ? opts.blockedCell : null;   // (cx,cy 셀)→bool — 콜라이더 물·바위 진입 금지(villages isTerrainBlockedLocal 주입). 부재=무판정.

  const LIVE_BATTLES = [];
  let _rr = 0;                                 // 라운드로빈 시작 포인터(굶는 전투 방지)

  // ═══════════ 맵-전투 좌표 매핑 (랩 verbatim — origin=로컬중심(65,65)의 맵셀, θ=heading) ═══════════
  // mapOriginFor(atkArrival, defCenter): 공격 진입방향→방어 마을 안쪽 heading, origin 은 마을 center 에서 진입쪽 -LB_OFF.
  function mapOriginFor(atkArrival, defCenter) {
    const ax = (atkArrival && atkArrival.cx != null) ? atkArrival.cx : defCenter.cx;
    const ay = (atkArrival && atkArrival.cy != null) ? atkArrival.cy : defCenter.cy;
    const th = Math.atan2(defCenter.cy - ay, defCenter.cx - ax);
    const cs = Math.cos(th), sn = Math.sin(th);
    return { origin: { cx: defCenter.cx - cs * LB_OFF * M2C, cy: defCenter.cy - sn * LB_OFF * M2C }, angle: th };
  }
  // mapOriginForEngage(atkCmd, defCmd): 두 대형 조우 지점(중간) origin·θ. P2 서버엔 행군 대형이 없어 미사용 —
  //   P3(실체 병사) 접근→충돌 승계 시 사용할 매핑을 랩 정합으로 미리 제공(parity).
  function mapOriginForEngage(atkCmd, defCmd) {
    const th = Math.atan2(defCmd.y - atkCmd.y, defCmd.x - atkCmd.x);
    return { origin: { cx: (atkCmd.x + defCmd.x) * 0.5, cy: (atkCmd.y + defCmd.y) * 0.5 }, angle: th };
  }
  // localToMapCell(lb, lx, ly): 로컬(0~130) → 맵 셀(중심 65 기준 θ회전 + origin 평행이동). P3 렌더/agent 미러용.
  function localToMapCell(lb, lx, ly) {
    const o = lb.mapOrigin, th = lb.mapAngle, cs = Math.cos(th), sn = Math.sin(th);
    const dx = (lx - LB_CEN) * M2C, dy = (ly - LB_CEN) * M2C;
    return { cx: o.cx + dx * cs - dy * sn, cy: o.cy + dx * sn + dy * cs };
  }
  // mapCellToLocal(lb, cx, cy): localToMapCell 역변환(θ 역회전). P3 행군/포진 대형 병사 위치 주입용.
  function mapCellToLocal(lb, cx, cy) {
    const o = lb.mapOrigin, th = lb.mapAngle, cs = Math.cos(th), sn = Math.sin(th);
    const dx = cx - o.cx, dy = cy - o.cy;
    const lxm = dx * cs + dy * sn, lym = -dx * sn + dy * cs;
    return { lx: LB_CEN + lxm / M2C, ly: LB_CEN + lym / M2C };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P3 실체 대형(집결·행군·대형·콜라이더·방어 포진) — 전쟁실험실 _mu* 서버 이식.
  //   좌표=맵 셀(g.units[].x/y·g.cmd.cx/cy). 지휘관(g.cmd)은 villages 가 econDayToMs 로 페이싱(여기선 슬롯 추종·
  //   대형·콜라이더 순수 기하만). 유닛은 pid(u.pid)를 참조 — _muGroupToInjected 가 battle-core placeInjected 로
  //   u.agent=pid 승계 → syncMirror 가 매 프레임 전투유닛→pid 위치/hp 미러(단방향, battle-core 무수정·골든마스터 불변).
  // ═══════════════════════════════════════════════════════════════════════════
  // 대형 슬롯 배정(랩 _muAssignSlots verbatim — 병종별 고증 배치, 지휘관 슬롯을 원점(0,0)으로 평행이동).
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
  // 슬롯 목표 맵셀(battle-core 수식 복제): tx=cmd + slx·cosθ − sly·sinθ ; ty=cmd + slx·sinθ + sly·cosθ
  function _muSlotXY(g, u) { const cs = Math.cos(g.heading), sn = Math.sin(g.heading); return [g.cmd.cx + u.slx * cs - u.sly * sn, g.cmd.cy + u.slx * sn + u.sly * cs]; }
  // 그룹 내 병사 상호 분리(콜라이더, 랩 _muSeparate verbatim·셀좌표). 지휘관 제외. 물·바위 진입 금지(blockedCell).
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
  // 슬롯 추종(랩 _muTickMarch 병사 루프) — 지휘관(g.cmd)은 외부(villages econ 페이싱·form=rally·defhold)가 설정. 나머지 슬롯으로 FOLLOW_CAP 상한 이동 + 콜라이더.
  function _muStepFollow(g, cap) {
    if (!g || !g.units) return;
    const cs = Math.cos(g.heading), sn = Math.sin(g.heading);
    for (const u of g.units) {
      if (u.cmd) { u.x = g.cmd.cx; u.y = g.cmd.cy; continue; }
      const tx = g.cmd.cx + u.slx * cs - u.sly * sn + (u.jx || 0), ty = g.cmd.cy + u.slx * sn + u.sly * cs + (u.jy || 0);
      const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy);
      if (dd > MU.FOLLOW_SNAP) { const st = Math.min(cap != null ? cap : MU.FOLLOW_CAP, dd); u.x += dx / dd * st; u.y += dy / dd * st; }
    }
    _muSeparate(g, 1);
  }
  // 방어 포진 유지(랩 _muTickDefHold) — holdPt 유지 + 공격 지휘관 향해 소폭 마중(DEF_ADVANCE_MAX 상한) + heading 공격 정면.
  function _muDefHold(g, atkCmd) {
    if (!g || !g.holdPt) return;
    if (atkCmd) { const hx = atkCmd.cx - g.cmd.cx, hy = atkCmd.cy - g.cmd.cy, hd = Math.hypot(hx, hy); if (hd > 0.5) g.heading = Math.atan2(hy, hx); }
    if (atkCmd && MU.DEF_ADVANCE > 0) { const ax = atkCmd.cx - g.holdPt.cx, ay = atkCmd.cy - g.holdPt.cy, ad = Math.hypot(ax, ay);
      const advNow = Math.hypot(g.cmd.cx - g.holdPt.cx, g.cmd.cy - g.holdPt.cy);
      if (ad > 1 && advNow < MU.DEF_ADVANCE_MAX) { const step = Math.min(MU.FOLLOW_CAP * MU.DEF_ADVANCE, MU.DEF_ADVANCE_MAX - advNow); g.cmd.cx += ax / ad * step; g.cmd.cy += ay / ad * step; } }
    _muStepFollow(g, MU.FOLLOW_CAP);
  }
  // 두 대형 지휘관(대형 원점) 거리(셀). WAR_ENGAGE_R 이하면 교전.
  function _muCmdDist(a, b) { if (!a || !b || !a.cmd || !b.cmd) return Infinity; return Math.hypot(a.cmd.cx - b.cmd.cx, a.cmd.cy - b.cmd.cy); }
  // 그룹 units[](맵셀) → battle-core spec.units[](로컬0~130) 위치승계(랩 _muGroupToInjected). u.pid → it.agent(placeInjected가 u.agent 로 부착 → syncMirror 미러 대상).
  function _muGroupToInjected(g, mp) {
    if (!g || !g.units || !g.units.length || !mp) return null;
    const lbLike = { mapOrigin: mp.origin, mapAngle: mp.angle };
    const _U = (BC && BC.UNITS) ? BC.UNITS : null;
    const out = [];
    for (const u of g.units) { if (!u || !u.type || (_U && !_U[u.type])) continue; const L = mapCellToLocal(lbLike, u.x, u.y);
      out.push({ type: u.type, x: L.lx, y: L.ly, agent: (u.pid != null ? u.pid : null), cmd: !!u.cmd }); }
    return out.length ? out : null;
  }
  // ★ 대형 빌드(pid 병사 배열 → 슬롯 배정된 그룹). units=[{type,pid,x,y(셀)}], 첫 유닛=지휘관. rally=대형 원점(셀).
  function buildGroup(units, form, rally, heading, seed) {
    if (!units || !units.length) return null;
    const rng = _muRng((seed || 1) * 7 + 1);
    for (const u of units) { u.slx = 0; u.sly = 0; u.cmd = false; if (u.jx == null) { u.jx = (rng() - 0.5) * MU.MARCH_JITTER; u.jy = (rng() - 0.5) * MU.MARCH_JITTER; } }
    units[0].cmd = true;
    const g = { units, comp: null, form: form || 'line', heading: heading || 0, cmd: { cx: rally.cx, cy: rally.cy }, rally: { cx: rally.cx, cy: rally.cy }, commander: units[0] };
    _muAssignSlots(units, g.form);
    return g;
  }
  function _muCompForm(comp) { return (comp && comp.form) || 'line'; }

  // ═══════════ 전투유닛→pid 미러(랩 _lbSyncAgents 서버판) — 매 프레임 단방향(battle-core→pid). 순수 read(골든마스터 불변). ═══════════
  //   반환 [{pid, cx, cy(맵셀), hp, hpMax, rout, cmd, type, side, dead}] — villages 가 players.get(pid).x/y(×32 px)·hp·전투메타 갱신.
  function syncMirror(lb) {
    const h = lb && lb.handle; if (!h || !h.units) return null;
    const o = lb.mapOrigin, th = lb.mapAngle || 0, cs = Math.cos(th), sn = Math.sin(th); if (!o) return null;
    const out = [];
    for (const u of h.units) { const pid = u.agent; if (pid == null) continue;
      const dx = (u.x - LB_CEN) * M2C, dy = (u.y - LB_CEN) * M2C;
      out.push({ pid, cx: o.cx + dx * cs - dy * sn, cy: o.cy + dx * sn + dy * cs,
        hp: u.hp, hpMax: u.maxHp, rout: !!(u.st === 'rout' || u.routing), cmd: !!u.cmd, type: u.type, side: u.side, dead: u.hp <= 0 }); }
    return out;
  }
  // 집계(broadcast war_battle 채널·HUD용) — 생존 수(측별)·전투 phase.
  function aliveCounts(lb) {
    const h = lb && lb.handle; if (!h || !h.units) return { aliveA: 0, aliveB: 0 };
    let a = 0, b = 0; for (const u of h.units) { if (u.hp > 0) { if (u.side === 'A') a++; else b++; } } return { aliveA: a, aliveB: b };
  }

  // ═══════════ LiveBattle 구조체(랩 makeLiveBattle 서버판 — agent/isPlayer/render 필드 제거) ═══════════
  function makeLiveBattle(o) {
    return {
      id: o.id, war: o.war || null, atkVil: o.atkVil, defVil: o.defVil,
      spec: o.spec || null, handle: o.handle || null, mapOrigin: o.mapOrigin, mapAngle: o.mapAngle,
      phase: o.phase || 'FORMING', acc: 0, seed: o.seed || 0,
      resultApplied: false, _steps: 0, _forced: false, _birthDay: o._birthDay || 0,
    };
  }

  // ═══════════ startLiveBattle(w, opts2) — NPC war(WARS 항목) 실체화. 성공 시 true(villages.js 가 w.phase='battle') ═══════════
  //   랩 startLiveBattle NPC 경로 이식. opts2.atkGroup/defGroup(P3 행군·포진 대형, 셀좌표) 주면 접근→충돌 승계:
  //     origin/θ = mapOriginForEngage(두 지휘관 중간·스냅≈0) · spec.A/B.units = _muGroupToInjected(그 자리 그대로 전투유닛·u.pid→u.agent 미러대상).
  //   opts2 없음(P2 eta 폴백) = mapOriginFor(마을 center)·표준배치(count-only). spec = toBattleSpec(공격 w.composition, 방어 conscript).
  //   rng = _muRng(_npcSeed) : 전역 Math.random 무교란·재현. 시드 = war 상태(id·born) 파생(랩 _mg 대형 시드 베이스 동일).
  function startLiveBattle(w, opts2) {
    opts2 = opts2 || {};
    try {
      if (!w || !w.atk || !w.def) return false;
      const A = w.atk.econ, D = w.def.econ;
      if (!A || !D || A.npcs.length < 2 || D.npcs.length < 2) return false;
      if (LIVE_BATTLES.length >= LB_MAX_BATTLES) return false;   // 폭주방지 → false = headless 폴백(villages.js)
      const ac = centerOf(w.atk), dc = centerOf(w.def);
      const atkG = opts2.atkGroup || null, defG = opts2.defGroup || null;
      const atkCmd = (atkG && atkG.cmd) ? { cx: atkG.cmd.cx, cy: atkG.cmd.cy } : { cx: ac.cx, cy: ac.cy };
      // origin/θ: 방어 대형 있으면 두 지휘관 중간(접근→충돌·스냅≈0), 없으면 마을 center 방향(표준배치 폴백).
      const mp = (defG && defG.cmd)
        ? mapOriginForEngage({ x: atkCmd.cx, y: atkCmd.cy }, { x: defG.cmd.cx, y: defG.cmd.cy })
        : mapOriginFor({ cx: atkCmd.cx, cy: atkCmd.cy }, { cx: dc.cx, cy: dc.cy });
      // spec 구성(warResolveBattle 3인자 되먹임과 동일 입력 — 공격=w.composition, 방어=conscript village). lb.spec 보관 후 그대로 되먹임에 승계.
      const _atkArmy = { composition: w.composition || { champion: 0, dagger: Math.max(1, w.force - (w.warriors || 0)), spear: 0, pike: 0, archer: 0 }, force: w.force, weapQ: (w.weapQ != null ? w.weapQ : (A._weapQ != null ? A._weapQ : WQ_STONE)), atkEcon: A };
      const spec = toBattleSpec(_atkArmy, w.def, { terrain: 'village' });
      // ★[행군→전투 연속] 대형 병사 맵셀 → 로컬 역변환 주입(공격=atkG·방어=defG). 서 있던 자리 그대로 전투유닛(스냅 제거). 대형 없으면 표준배치 폴백.
      let injN = 0;
      { const injA = atkG ? _muGroupToInjected(atkG, mp) : null; if (injA) { spec.A.units = injA; injN += injA.length; }
        const injB = defG ? _muGroupToInjected(defG, mp) : null; if (injB) { spec.B.units = injB; injN += injB.length; } }
      const _npcSeed = (((w.id || 1) * 911 + ((w.born || 0) | 0) * 17 + 3) >>> 0);   // 랩 verbatim
      const handle = BC.createBattle(spec, { origin: mp.origin, heading: mp.angle, rng: _muRng(_npcSeed) });
      const lb = makeLiveBattle({ id: (w.id != null ? 'W' + w.id : 'W?'), war: w, atkVil: w.atk, defVil: w.def,
        spec, handle, mapOrigin: mp.origin, mapAngle: mp.angle, phase: 'FORMING', seed: _npcSeed, _birthDay: dayOf() });
      lb.engaged = !!(atkG && defG);   // 접근→충돌 승계 여부(검증·로그)
      LIVE_BATTLES.push(lb); w._live = lb;
      if (log) log('실체 개전 ' + (w.atk.name || '?') + '→' + (w.def.name || '?') + ' [seed ' + _npcSeed + ' · A' + spec_count(spec.A) + ' vs B' + spec_count(spec.B) + (injN ? ' · 위치승계 ' + injN : '') + ']');
      return true;
    } catch (e) { if (log) log('startLiveBattle err: ' + (e && e.message)); return false; }
  }
  function spec_count(side) { if (!side) return 0; let t = 0; for (const k in side) { if (k === 'form' || k === 'units') continue; t += side[k] | 0; } return t; }

  // ═══════════ 강제결판(교착·안전상한) — 랩 _lbForcedResolve verbatim ═══════════
  function _forcedResolve(lb) { const h = lb.handle; if (!h || h.result) return false; return (h.tick >= LB_MAX_LOCALT || lb._steps >= MAXTICK); }

  // ═══════════ _stepEngaged(lb, subCap) — acc(누적 전투초)만큼, subCap 서브스텝 상한 내 진행. 랩 _lbStepEngaged 실dt판 ═══════════
  //   랩: want = pendDays(맵일)*LB_SEC_PER_DAY/LB_DT.  여기: want = acc(실초)/LB_DT (압축 없음).
  //   소비한 전투초만 acc 에서 차감(예산에 걸려 덜 돌면 잔량 다음 프레임 이월 — 결과 왜곡 0, step(LB_DT) 고정dt).
  function _stepEngaged(lb, subCap) {
    const h = lb.handle; if (!h || h.result) return 0;
    let want = Math.floor(lb.acc / LB_DT + 1e-9);
    if (want < 0) want = 0; if (want > LB_MAXSUB) want = LB_MAXSUB;
    let sub = Math.min(want, subCap); if (sub < 0) sub = 0;
    let did = 0;
    for (let s = 0; s < sub && !h.result; s++) { h.step(LB_DT); lb._steps++; did++; }
    lb.acc = Math.max(0, lb.acc - did * LB_DT);
    return did;
  }

  // ═══════════ resolveLiveBattle(lb) — 결판 → runBattleHeadless 반환형 동형 res 구성 → warResolveBattle(w,day,{res,spec}) 되먹임 ═══════════
  //   랩 resolveLiveBattle 의 econ 확정선만(agent 귀환·궤주그룹·포로·데칼 제거 — P3). w.phase='return' 전환은 warDaily 귀환 루프 계승.
  function resolveLiveBattle(lb) {
    const w = lb.war, h = lb.handle; if (!w || !h) return;
    const S = h.sides, r = h.result;
    const winner = (r && r.win) ? r.win : ((S.A.start - S.A.dead) >= (S.B.start - S.B.dead) ? 'A' : 'B');   // 미결(강제결판)=잔존 다수
    const survivorsByType = { A: {}, B: {} };
    let _rA = 0, _rB = 0, _mA = 0, _mB = 0;   // 궤주 수·평균 사기(측별) — warWeaponFlow 기대값 입력(runBattleHeadless 반환형 정합)
    for (const u of h.units) { if (u.hp > 0) { const s = survivorsByType[u.side]; s[u.type] = (s[u.type] || 0) + 1;
      if (u.routing) { if (u.side === 'A') { _rA++; _mA += (u.mrl || 0); } else { _rB++; _mB += (u.mrl || 0); } } } }
    const res = { winner, atkStart: S.A.start, atkDead: S.A.dead, defStart: S.B.start, defDead: S.B.dead,
      atkSurv: S.A.start - S.A.dead, defSurv: S.B.start - S.B.dead, survivorsByType, ticks: lb._steps, tick: +(+h.tick).toFixed(2),
      routA: _rA, routB: _rB, routMrlA: _rA ? _mA / _rA : 0.5, routMrlB: _rB ? _mB / _rB : 0.5 };
    const day = dayOf();
    if (typeof resolveBattle === 'function') resolveBattle(w, day, { res, spec: lb.spec });   // 되먹임만(전술 스킵 — J 약탈·평판·무기 흐름·warKill·숙련)
    // 귀환 전환(econ 상태머신 계승: warDaily 가 eta 에 동원계수 해제·전쟁 종료). 실체 병사 귀환 그룹은 P3.
    w.phase = 'return'; w.eta = day + (w.marchDays || 1);
    if (w._mg) w._mg = null; if (w._dg) w._dg = null;
    lb._resWinner = winner; lb._resDay = day;   // 검증/로그 편의(econ 무영향)
  }

  // ═══════════ _resolveNPC(lb, i) — RESOLVED 처리(resultApplied 게이트로 되먹임 1회 확정 + splice) ═══════════
  function _resolveNPC(lb, i) {
    const w = lb.war;
    if (!lb.resultApplied) { lb.resultApplied = true; resolveLiveBattle(lb); }   // ★이중적용 방지 — econ 확정선
    // ★[P3] onResolved 훅 — splice 전(w._live·lb.handle 유효) 호출: villages 가 최종 미러(생존/사망 pid)로 사상 despawn·생존 귀환(궤주) 그룹 생성.
    if (typeof opts.onResolved === 'function') { try { opts.onResolved(lb); } catch (_) { } }
    const idx = (i != null && LIVE_BATTLES[i] === lb) ? i : LIVE_BATTLES.indexOf(lb);
    if (idx >= 0) LIVE_BATTLES.splice(idx, 1);
    if (w && w._live === lb) w._live = null;
  }

  // ═══════════ stepLiveBattles(dtSec) — 벽시계 실dt(초)만큼 전 실체 전투 서브스텝 + lifecycle 전이. onGameTick 30Hz 호출 ═══════════
  //   랩 stepLiveBattles 3-패스 구조 verbatim(실dt판): (1) FORMING→ENGAGED·acc 누적 (2) 라운드로빈 예산 스텝 (3) 결판/정리.
  //   반환 = 이번 프레임 RESOLVED(되먹임 완료) 전투 수. 예산: 프레임당 전 전투 합계 서브스텝 ≤ LB_STEP_BUDGET(초과분 acc 이월).
  function stepLiveBattles(dtSec) {
    if (!LIVE_BATTLES.length || !(dtSec > 0)) return 0;
    // 패스1: 전이·acc 누적 + 즉시 RESOLVED 표식 정리
    const engaged = [];
    for (let i = LIVE_BATTLES.length - 1; i >= 0; i--) {
      const lb = LIVE_BATTLES[i], w = lb.war, h = lb.handle;
      if (!w || !h) { LIVE_BATTLES.splice(i, 1); continue; }
      if (lb.phase === 'FORMING') { lb.phase = 'ENGAGED'; }   // 1프레임 승계 완료(생성 시), 다음 프레임부터 교전
      if (lb.phase === 'ENGAGED') { lb.acc += dtSec; engaged.push(lb); }
      else if (lb.phase === 'RESOLVED') { _resolveNPC(lb, i); }
    }
    // 패스2: 라운드로빈 예산 분배(굶는 전투 없게 포인터 회전). 예산 소진분은 acc 이월.
    if (engaged.length) {
      let budget = LB_STEP_BUDGET;
      const NB = engaged.length;
      const perRound = Math.max(1, Math.min(LB_MAXSUB, Math.ceil(LB_STEP_BUDGET / NB)));   // 라운드당 전투별 상한(공정 분배)
      let start = _rr % NB, guard = 0;
      while (budget > 0 && guard < NB * 40) { guard++;
        let any = false;
        for (let k = 0; k < NB && budget > 0; k++) {
          const lb = engaged[(start + k) % NB];
          if (!lb || lb.phase !== 'ENGAGED' || lb.handle.result || lb.acc < LB_DT) continue;
          const cap = Math.min(perRound, budget, LB_MAXSUB);
          const did = _stepEngaged(lb, cap);
          if (did > 0) { budget -= did; any = true; }
        }
        if (!any) break;   // 남은 전투 모두 acc 소진 or result → 조기 종료
      }
      _rr = (start + 1) % NB;
    }
    // 패스3: 결판/정리(전 전투 — 예산에 걸려 못 돈 전투도 안전상한 체크로 교착 방지)
    let resolvedCount = 0;
    for (let i = LIVE_BATTLES.length - 1; i >= 0; i--) {
      const lb = LIVE_BATTLES[i], w = lb.war, h = lb.handle;
      if (!w || !h) { LIVE_BATTLES.splice(i, 1); continue; }
      if (lb.phase === 'ENGAGED') {
        if (h.result && h.result.win) lb.phase = 'RESOLVED';
        else if (_forcedResolve(lb)) { lb._forced = true; lb.phase = 'RESOLVED'; }
      }
      if (lb.phase === 'RESOLVED') { _resolveNPC(lb, i); resolvedCount++; }
    }
    return resolvedCount;
  }

  return {
    startLiveBattle, stepLiveBattles,
    // 좌표 매핑(P3 승계용 parity)
    mapOriginFor, mapOriginForEngage, localToMapCell, mapCellToLocal, makeLiveBattle,
    // P3 실체 대형(집결·행군·대형·콜라이더·방어 포진) — villages 가 draft·econ 페이싱 후 호출
    buildGroup, _muAssignSlots, _muSlotXY, _muSeparate, _muStepFollow, _muDefHold, _muCmdDist, _muGroupToInjected, _muCompForm,
    // 전투유닛→pid 미러 + 집계(broadcast·HUD)
    syncMirror, aliveCounts,
    // 상태 접근(검증·로그)
    get LIVE_BATTLES() { return LIVE_BATTLES; },
    get count() { return LIVE_BATTLES.length; },
    hasLive(w) { return !!(w && w._live); },
    // 상수 노출(검증 하네스·villages 소비)
    LB_DT, LB_STEP_BUDGET, LB_MAX_BATTLES, LB_MAXSUB, LB_MAX_LOCALT,
    WAR_ENGAGE_R, WAR_ALERT_R, WAR_DEF_STANDOFF, MU, MU_TYPES, MU_TYPE_INT,
  };
}

// ═══════════ 노출 (war-core·battle-core 패턴) ═══════════
const WarLive = { createWarLive, _muRng };
root.WarLive = WarLive;
if (typeof module !== 'undefined' && module.exports) module.exports = WarLive;

})(typeof window !== 'undefined' ? window : globalThis);
