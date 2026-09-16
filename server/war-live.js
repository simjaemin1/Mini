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
  function _muStepFollow(g, cap) {
    if (!g || !g.units) return;
    const cs = Math.cos(g.heading), sn = Math.sin(g.heading);
    for (const u of g.units) {
      if (u.dead) continue;
      if (u.cmd) { u.x = g.cmd.cx; u.y = g.cmd.cy; continue; }
      const tx = g.cmd.cx + u.slx * cs - u.sly * sn + (u.jx || 0), ty = g.cmd.cy + u.slx * sn + u.sly * cs + (u.jy || 0);
      const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy);
      if (dd > MU.FOLLOW_SNAP) { const st = Math.min(cap != null ? cap : MU.FOLLOW_CAP, dd); const nx = u.x + dx / dd * st, ny = u.y + dy / dd * st;
        if (!blockedCell || !blockedCell(nx, ny)) { u.x = nx; u.y = ny; }
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
      if (ad > 1 && advNow < MU.DEF_ADVANCE_MAX) { const step = Math.min(MU.FOLLOW_CAP * MU.DEF_ADVANCE, MU.DEF_ADVANCE_MAX - advNow); g.cmd.cx += ax / ad * step; g.cmd.cy += ay / ad * step; } }
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
    return { w, ctx, handle, seed, quality: quality || { A: null, B: null },
      state: 'form', t: 0, contactT: -1, gapT: 0, bestGap: Infinity, engagedOnce: false, contacts: 0,
      byPid: new Map(), settled: null, _stepMs: 0 };
  }
  // 병사 하나를 교전에 올린다 — battle-core addUnits(무변) 로 만들고, 그 x/y 를 존 NPC 위치에 **묶는다**.
  //   gu = 대형 병사 {type, pid, x, y(셀)} · p = players.get(pid). 반환 = battle unit.
  function enlist(f, side, gu, p) {
    if (!f || !gu || !p || f.byPid.has(gu.pid)) return f && f.byPid.get(gu.pid);
    const ctx = f.ctx;
    if (!ctx.sides[side].form) ctx.sides[side].form = 'line';
    const n = f.handle.addUnits(side, [{ type: gu.type, x: p.x / PX_PER_M, y: p.y / PX_PER_M, agent: gu.pid }], f.quality[side] || null);
    if (!n) return null;
    const u = ctx.units[ctx.units.length - 1];
    Object.defineProperty(u, 'x', { get() { return p.x / PX_PER_M; }, set(v) { p.x = v * PX_PER_M; }, enumerable: true, configurable: true });
    Object.defineProperty(u, 'y', { get() { return p.y / PX_PER_M; }, set(v) { p.y = v * PX_PER_M; }, enumerable: true, configurable: true });
    u.face = side === 'A' ? (f.w._heading || 0) : (f.w._heading || 0) + Math.PI;
    u.ctl = true;            // 처음엔 대형이 몬다
    u.gu = gu; gu.bu = u;    // 대형 병사 ↔ 전투 병사(같은 몸 — 위치는 p 하나)
    f.byPid.set(gu.pid, u);
    return u;
  }
  // 대형 병사(gu)의 셀 좌표도 같은 player 에 묶는다 — 대형·교전·존이 **한 좌표**를 읽고 쓴다.
  function bindGroupUnit(gu, p) {
    if (!gu || !p || gu._bound) return;
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
    for (const u of ctx.units) { if (u.hp > 0 && !u.ctl && (u.st === 'melee' || u.st === 'shoot')) { ev.contact = true; break; } }
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
    if (!ev.rout) {
      const last = Math.max(f.contactT, f.gapT);
      if (f.t - last > standoffSec(f)) { toStandoff(f); ev.standoff = true; }
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
    makeFight, enlist, stepFight, orderAdvance, toStandoff, setSideCtl, settle, buildRes, aliveCounts, centroid, engR, standoffSec,
    // 상수
    WAR_ENGAGE_R, WAR_ALERT_R, WAR_DEF_STANDOFF, MU, MU_TYPES, MU_TYPE_INT, M_PER_CELL, PX_PER_M, TICK_HZ, STEP_DT, MELEE_ENG_R,
  };
}

const WarLive = { createWarLive, _muRng };
root.WarLive = WarLive;
if (typeof module !== 'undefined' && module.exports) module.exports = WarLive;

})(typeof window !== 'undefined' ? window : globalThis);
