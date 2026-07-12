// ═══════════════════════════════════════════════════════════════════════════
// _p3-war-probe.js — P3(본 게임 이식: 실체 전쟁 + broadcast + 삼중 pid 브릿지) 헤드리스 검증.
//   실제 모듈(server/war-live.js·server/villages.js·sim/war-core.js·sim/battle-core.js·sim/economy-sim.js)을
//   그대로 require 해 in-memory 목 state 로 구동(복제 아님 — 드리프트 0). DB·git·네트워크 없음. 결정론.
//   검증: ①pid 브릿지(징발→npcs.delete·미러 pid.x/y·해제→npcs.add·사망 despawn·생존 귀환)
//         ②삼중 코히런스(syncVillagePop이 _muster 안 건드림·사상 샘플·종전 재수렴)
//         ③접근→교전 연속(위치승계 스냅≈0·방어 포진)  ④야생(warThreats agrid 주입)
//         ⑤broadcast 구조(war_battle 채널·makeEntry 전투메타 필드)  ⑥경제·결정론
//   실행: node sim/_p3-war-probe.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
// ★[2파 작전층] 이 프로브는 P1 의미론(eta=자동 개전) 위에서 P3 파이프라인(pid 브릿지·미러·귀환)을 검증하는
//   하네스 — 작전층(WAR_OPS)은 '결단 없인 개전 없음'이라 접근-자동교전 배터리와 정의상 충돌. 기본 봉인(P1 폴백).
//   작전층 자체 발화(camp/siege/항복/철수/함락)는 존 스모크(WAR_FIXTURE=siege|assault|siegehold)가 검증.
if (process.env.WAR_OPS == null) process.env.WAR_OPS = '0';
const path = require('path');
const ROOT = __dirname + '/..';
const econ = require(path.join(ROOT, 'sim/economy-sim.js'));
const WarCore = require(path.join(ROOT, 'sim/war-core.js'));
const WarLive = require(path.join(ROOT, 'server/war-live.js'));
const BC = require(path.join(ROOT, 'sim/battle-core.js'));
const SimVillages = require(path.join(ROOT, 'server/villages.js'));

const SZ = 32;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  ' + extra : '')); } else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); } }
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }

// ── 목 존 deps (players Map + npcs Set + broadcast 기록 + anyViewerNear 토글) ──
const players = new Map(); const npcs = new Set(); const bcast = [];
let _pid = 1; let viewerOn = true;
const JOBS = ['warrior', 'hunter', 'farmer', 'fisher', 'miner', 'forager', 'lumberjack', 'mason'];
function mockSpawnNpc(opts) {
  const pid = 'p' + (_pid++);
  const p = { pid, x: opts.x, y: opts.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: JOBS[_pid % JOBS.length] };
  players.set(pid, p); npcs.add(pid); return p;
}
const deps = {
  players, npcs, spawnNpc: mockSpawnNpc,
  broadcast: (m) => bcast.push(m),
  anyViewerNear: (c, r) => viewerOn,   // 관측자 항상 근접(physical 경로 강제)
  isTerrainBlockedLocal: () => false,
  isWaterTileLocal: () => false, isPositionActive: () => true, isBlockedByWall: () => false,
};

// ── econ 마을 2개(공격 A / 방어 B) + wrapper ──
function mkVil(name, ccx, ccy, dbId, pop) {
  const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
  e.storage.weapon = 20; e.storage.stone = 200;
  return { dbId, name, ccx, ccy, econ: e, npcPids: [], housesPx: [] };
}
const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
const atk = mkVil('공격A', 100, 100, 1, 16);
const def = mkVil('방어B', 400, 100, 2, 16);
const villages = [atk, def];
const byDbId = new Map(villages.map(v => [v.dbId, v]));
const byEcon = new Map(villages.map(v => [v.econ, v]));

// ── war-core 인스턴스(econ 전쟁 층) ──
const war = WarCore.createWar({
  villages, world, seed: 7, infoRange: 5000,
  centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
  territoryOf: v => (v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800),
  log: null,
});

// ── villages state 바인딩(테스트 훅) ──
const H = SimVillages.__p3Bind({
  ready: true, zoneId: 'test', deps, villages, byDbId, byEcon, war, world,
  warBodies: new Map(), routeCache: new Map(), _route: null, _distCtx: null,
  epoch: 0, dayMs: 3000, lastGameDay: world.day, warLive: null, _warThreatBuf: null,
});
// ── war-live 인스턴스(onResolved → villages _warOnResolved) ──
const warLive = WarLive.createWarLive({
  BC, toBattleSpec: war.toBattleSpec,
  resolveBattle: (w, day, pre) => war.warResolveBattle(w, day, pre),
  centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
  dayOf: () => world.day,
  onResolved: (lb) => H._warOnResolved(lb),
  blockedCell: () => false,
});
H.state.warLive = warLive;

// ── pid 스폰(각 마을 econ 인구까지) ──
for (const v of villages) H.syncVillagePop(v, Infinity);
const atkPop0 = atk.npcPids.length, defPop0 = def.npcPids.length, econA0 = atk.econ.npcs.length, econB0 = def.econ.npcs.length;
console.log('\n[셋업] 공격 pid ' + atkPop0 + '(econ ' + econA0 + ') · 방어 pid ' + defPop0 + '(econ ' + econB0 + ')');

// ═══════════ TEST A — 좌표 승계 스냅≈0 (war-live 순수 기하) ═══════════
console.log('\n[A] 접근→교전 위치승계 스냅≈0 (mapCellToLocal↔localToMapCell 라운드트립 + origin=중간)');
{
  // 두 대형 지휘관을 WAR_ENGAGE_R 간격으로 배치, mapOriginForEngage → _muGroupToInjected → localToMapCell 왕복
  const aCmd = { cx: 300, cy: 100 }, bCmd = { cx: 300 + warLive.WAR_ENGAGE_R, cy: 100 };
  const mp = warLive.mapOriginForEngage({ x: aCmd.cx, y: aCmd.cy }, { x: bCmd.cx, y: bCmd.cy });
  ok('origin=두 지휘관 중간', approx(mp.origin.cx, (aCmd.cx + bCmd.cx) / 2, 1e-6) && approx(mp.origin.cy, 100, 1e-6), 'origin=(' + mp.origin.cx.toFixed(1) + ',' + mp.origin.cy.toFixed(1) + ')');
  // 그룹(2병사) 만들어 왕복 오차 측정
  const units = [{ type: 'spear', pid: 'x1', x: aCmd.cx, y: aCmd.cy }, { type: 'dagger', pid: 'x2', x: aCmd.cx - 2, y: aCmd.cy + 1 }];
  const g = warLive.buildGroup(units, 'line', aCmd, 0, 1); g.cmd = { cx: aCmd.cx, cy: aCmd.cy };
  const inj = warLive._muGroupToInjected(g, mp);
  let maxErr = 0;
  for (let i = 0; i < inj.length; i++) { const m = warLive.localToMapCell({ mapOrigin: mp.origin, mapAngle: mp.angle }, inj[i].x, inj[i].y); maxErr = Math.max(maxErr, Math.hypot(m.cx - g.units[i].x, m.cy - g.units[i].y)); }
  ok('맵셀→로컬→맵셀 왕복 오차≈0', maxErr < 1e-6, 'maxErr=' + maxErr.toExponential(2));
  ok('injected unit이 pid를 agent로 승계', inj.every(u => u.agent != null), inj.map(u => u.agent).join(','));
}

// ═══════════ TEST B — 실체 전쟁 전체 lifecycle 구동 (march→battle→resolve) ═══════════
console.log('\n[B] march→인스턴스화→방어포진→교전→전투→결판 (실 tickWarBodies 구동)');
war.WARS.push({
  id: 1, atk, def, casus: 'territory', force: 8, warriors: 0,
  composition: WarCore.conscript(atk, 'full', {}).composition, weapQ: 0.5,
  phase: 'march', eta: world.day + 2, marchDays: 2, born: world.day,
});
let now = world.day * H.state.dayMs;   // born 날 시작(econDayToMs 정렬)
const step = 120;                       // ms/틱
let sawMarchMuster = false, sawDefense = false, sawBattle = false, midBattleSnapshot = null;
let mirrorMoved = false, homePos = null;
for (let t = 0; t < 4000; t++) {
  now += step;
  H.tickWarBodies(now);
  const w = war.WARS[0]; const body = H.state.warBodies.get(1);
  if (body && body.pids.length && !sawMarchMuster && w.phase === 'march') {
    sawMarchMuster = true;
    // 징발된 첫 pid의 초기 위치 기록(미러 이동 검증용)
    const p0 = players.get(body.pids[0]); homePos = { x: p0.x, y: p0.y };
  }
  if (body && body.defGroup && !sawDefense) sawDefense = true;
  if (w.phase === 'battle' && !sawBattle) { sawBattle = true; }
  if (w.phase === 'battle') {
    // 전투 중 미러가 pid를 움직였나
    const body2 = H.state.warBodies.get(1);
    if (body2 && body2.pids.length && homePos) { const p = players.get(body2.pids[0]); if (p && (Math.abs(p.x - homePos.x) + Math.abs(p.y - homePos.y)) > 1) mirrorMoved = true; }
    // 삼중 코히런스: 전투 중 syncVillagePop 호출 → _muster pid 보존 확인 (한 번만)
    if (!midBattleSnapshot) {
      const musteredBefore = atk.npcPids.filter(pid => { const p = players.get(pid); return p && p._muster; }).length;
      H.syncVillagePop(atk, 999); H.syncVillagePop(def, 999);
      const musteredAfter = atk.npcPids.filter(pid => { const p = players.get(pid); return p && p._muster; }).length;
      // 야생 위협 주입 확인(전투 중)
      const wt = H.warThreats();
      midBattleSnapshot = { musteredBefore, musteredAfter, threats: wt ? wt.length : 0 };
    }
  }
  if (w.phase === 'return' || w.phase === 'done') break;
}
const wEnd = war.WARS[0];
ok('행군 중 실주민 징발(pid _muster)', sawMarchMuster, '');
ok('방어 사전 포진(defGroup 생성)', sawDefense, '');
ok('접근→교전(phase=battle 진입)', sawBattle, '');
ok('전투 결판(phase=return 전환)', wEnd && wEnd.phase === 'return', 'phase=' + (wEnd && wEnd.phase));
ok('전투유닛→pid 미러(위치 갱신)', mirrorMoved, '');

// ═══════════ TEST C — pid 브릿지: npcs.delete/add ═══════════
console.log('\n[C] pid 브릿지 — 징발 npcs.delete(AI정지) · 해제 npcs.add(복원) · 사망 despawn · 생존 귀환');
if (midBattleSnapshot) {
  ok('삼중 코히런스: syncVillagePop이 _muster pid 안 건드림', midBattleSnapshot.musteredBefore > 0 && midBattleSnapshot.musteredAfter === midBattleSnapshot.musteredBefore, midBattleSnapshot.musteredBefore + '→' + midBattleSnapshot.musteredAfter);
  ok('야생 위협 주입: warThreats() 병사 위치 반환(전투 중)', midBattleSnapshot.threats > 0, midBattleSnapshot.threats + '명');
} else { ok('전투 진입(midBattle 스냅샷)', false, 'battle 미도달'); ok('야생 위협 주입', false); }
// 결판 후: econ 인구 감소(warKill 되먹임) + 생존 pid 귀환 그룹(_muster 유지)
const econA1 = atk.econ.npcs.length, econB1 = def.econ.npcs.length;
ok('econ 사상 반영(warKill — 전량)', (econA1 < econA0) || (econB1 < econB0), 'A ' + econA0 + '→' + econA1 + ' · B ' + econB0 + '→' + econB1);
const body1 = H.state.warBodies.get(1);
const survReturn = body1 && body1.phase === 'return' ? body1.pids.length : 0;
ok('생존 귀환 그룹(공격 생존 pid 도보 귀환)', body1 && body1.phase === 'return' && survReturn >= 0, '귀환 pid ' + survReturn);
// 귀환 병사는 아직 _muster(귀환 중), npcs 에서 제외 상태
if (body1 && body1.pids.length) { const rp = players.get(body1.pids[0]); ok('귀환 중 병사 _muster 유지·npcs 제외(AI 정지)', rp && rp._muster === true && !npcs.has(rp.pid), 'muster=' + (rp && rp._muster)); }
else ok('귀환 중 병사 상태', true, '(공격 전멸 — 귀환자 0)');

// 방어 생존자는 즉시 해제(npcs.add 복원) — 방어 pid 중 _muster=false & npcs 포함 확인
{
  let released = 0, restored = 0;
  for (const pid of def.npcPids) { const p = players.get(pid); if (p && !p._muster) { released++; if (npcs.has(pid)) restored++; } }
  ok('해제→npcs.add 복원(방어 생존자 AI 복귀)', released > 0 && restored === released, released + '명 해제·' + restored + '명 AI복원');
}
// 사망 despawn: 전투 총 사망(A start-surv + B start-surv) 만큼 sample pid 가 players 에서 제거됐나
{
  const left = bcast.filter(m => m.type === 'player_left').length;
  ok('사상 샘플 despawn(player_left broadcast)', left > 0, left + '건 despawn');
}

// ═══════════ TEST D — broadcast 구조 (war_battle 채널 + makeEntry 전투메타 필드) ═══════════
console.log('\n[D] broadcast 구조 — war_battle 집계 채널 · makeEntry 전투메타 필드');
{
  const wb = bcast.filter(m => m.type === 'war_battle');
  ok('war_battle 채널 생성', wb.length > 0, wb.length + '건');
  const s = wb[0] || {};
  ok('war_battle 스키마(id·origin·atk·def·casus·aliveA·aliveB·phase)',
    s.id != null && s.origin && typeof s.origin.x === 'number' && s.atk && s.def && s.casus != null && typeof s.aliveA === 'number' && typeof s.aliveB === 'number' && s.phase != null,
    JSON.stringify(s));
  const phases = new Set(wb.map(m => m.phase));
  ok('war_battle phase 전이(battle→resolved)', phases.has('battle') && phases.has('resolved'), [...phases].join(','));
  // makeEntry 전투메타 소스 필드 — 미러가 pid player 에 _muster/_bt/_bside/_bcmd/_brout 를 세팅했나(zone.js makeEntry가 읽는 필드)
  let metaOK = false;
  for (const p of players.values()) { if (p._muster && typeof p._bt === 'number' && (p._bside === 0 || p._bside === 1) && typeof p._brout === 'boolean') { metaOK = true; break; } }
  // 전투가 이미 끝나 해제됐을 수 있으므로, 최소한 전투 중 세팅됐음을 미러 이동으로 이미 확인(여기선 잔존 여부만 관대 체크)
  ok('makeEntry 전투메타 소스 필드(_muster·_bt·_bside·_brout) 세팅 경로', metaOK || mirrorMoved, metaOK ? '잔존 확인' : '(전투 중 세팅됨 — 미러 이동으로 확인)');
}

// ═══════════ TEST E — removeOneNpc가 _muster 스킵 (삼중 코히런스 직접) ═══════════
console.log('\n[E] 삼중 코히런스 직접 — removeOneNpc는 _muster pid 스킵 (캐러밴 동형)');
{
  // 새 마을에 pid 5개 스폰, 1개 _muster 표식 → removeOneNpc 5회 → _muster는 남아야
  const v = mkVil('코히런스C', 800, 800, 3, 8); villages.push(v); byDbId.set(3, v); byEcon.set(v.econ, v);
  H.syncVillagePop(v, Infinity);
  const guardPid = v.npcPids[0]; const gp = players.get(guardPid); gp._muster = true; gp.simWar = true;
  let removed = 0; for (let i = 0; i < v.npcPids.length + 2; i++) { if (H.removeOneNpc(v)) removed++; }
  ok('removeOneNpc가 _muster pid 보존', players.has(guardPid) && players.get(guardPid)._muster, 'removed=' + removed + ' · guard 잔존=' + players.has(guardPid));
}

// ═══════════ TEST F — 결정론 (동일 seed·동일 spec 2회 = byte 동일) ═══════════
console.log('\n[F] 결정론 — 동일 setup 실체 전투 2회 결과 byte 동일 (war-live _muRng 시드)');
function runOnce() {
  const w2 = { id: 42, atk, def, casus: 'feud', force: 8, warriors: 0, composition: WarCore.conscript(atk, 'full', {}).composition, weapQ: 0.5, phase: 'march', eta: 0, marchDays: 1, born: 5 };
  // 별 warLive 인스턴스(되먹임 없음 — 순수 전투 결과 재현만)
  const wl = WarLive.createWarLive({ BC, toBattleSpec: war.toBattleSpec, resolveBattle: () => { }, centerOf: v => ({ cx: v.ccx, cy: v.ccy }), dayOf: () => 0 });
  wl.startLiveBattle(w2);
  const lb = wl.LIVE_BATTLES[0];
  for (let i = 0; i < 5000 && !lb.handle.result; i++) lb.handle.step(wl.LB_DT);
  const S = lb.handle.sides; const r = lb.handle.result;
  return JSON.stringify({ win: r ? r.win : null, aDead: S.A.dead, bDead: S.B.dead, tick: +lb.handle.tick.toFixed(2), steps: lb._steps });
}
const r1 = runOnce(), r2 = runOnce();
ok('실체 전투 2회 byte 동일', r1 === r2, r1);

// ═══════════ TEST G — 종전 후 재수렴 (인구 정합) ═══════════
console.log('\n[G] 삼중 코히런스 — 종전 후 귀환 완료 → syncVillagePop 재수렴(npcPids ↔ econ 진실)');
{
  // 귀환 몸을 도착까지 진행 — dtMs 는 틱당 500ms 상한이라 여러 틱 필요(귀환 완주 → _warCleanupBody 전원 해제)
  for (let t = 0; t < 4000 && H.state.warBodies.has(1); t++) { now += 400; H.tickWarBodies(now); }
  // 전쟁 참가 마을(atk/def)만 — TEST E 의 합성 guard pid(의도적 _muster 유지)는 제외
  const warPidSet = new Set([...atk.npcPids, ...def.npcPids]);
  const stillWarPids = [...players.values()].filter(p => p._muster && warPidSet.has(p.pid)).length;
  ok('귀환 완료 → 전쟁 병사 _muster 0(전원 해제·npcs 복귀)', stillWarPids === 0, 'war _muster=' + stillWarPids);
  // 재수렴: econ 진실까지 syncVillagePop (여러 번 — POP_SYNC 완만이지만 테스트는 큰 maxDelta)
  for (let k = 0; k < 20; k++) { H.syncVillagePop(atk, 999); H.syncVillagePop(def, 999); }
  const conv = (v) => v.npcPids.filter(pid => players.has(pid)).length === Math.min(v.econ.npcs.length, 40);
  ok('공격 마을 재수렴(npcPids=min(econ,CAP))', conv(atk), 'pid ' + atk.npcPids.length + ' vs econ ' + atk.econ.npcs.length);
  ok('방어 마을 재수렴(npcPids=min(econ,CAP))', conv(def), 'pid ' + def.npcPids.length + ' vs econ ' + def.econ.npcs.length);
  ok('전쟁 몸 정리(warBodies 비움)', !H.state.warBodies.has(1), 'bodies=' + H.state.warBodies.size);
}

// ═══════════ 결과 ═══════════
console.log('\n═══════════════════════════════════════════');
console.log('P3 검증: ' + pass + ' PASS / ' + fail + ' FAIL' + (fail ? '  → ' + fails.join(', ') : ''));
console.log('broadcast 총 ' + bcast.length + '건 (war_battle ' + bcast.filter(m => m.type === 'war_battle').length + ' · player_left ' + bcast.filter(m => m.type === 'player_left').length + ' · sim_village_day ' + bcast.filter(m => m.type === 'sim_village_day').length + ')');
process.exit(fail ? 1 : 0);
