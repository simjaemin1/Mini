#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1094-arms-trip.js — 문 5: 원정이 곳간 무기를 실어 가고 돌아오면 다시 곳간(`T403_ARMS_LEDGER` 켬 기본 · 장부 = 몸 짐) ==========
//
// ★왜 [지시 T1094 · ★PM 11-02 캐논 문 5 = ㄱ "원정이 집 곳간 무기를 실어 간다 · 돌아오면 다시 곳간 · 소멸 0" · 문 6 "장부에만 있고 몸에 없는 짐 0"]
//   종전: T403 장부는 끔 기본이었다(원정이 곳간 무기를 읽기만 하고 한 자루도 안 가져갔다) · 켜도 몸에 안 실렸다(T811 끔 기본).
//   지키는 것:
//     ⓐ 정적 — war-core T403 손잡이 `!== '0'`(켬 기본 · 되돌림 `=0`) · 반출 · 반납 함수 글자 그대로(한 사람 한 자루 · 결판 손실은 결판 흐름 · 반납 = 장부 그대로)
//     ⓑ 싸움 없이 돌아온 원정(철수) — 동원 순간 곳간 −반출 · 몸이 선 뒤 하루 경계마다 장부 = 산 몸 짐 합 · 귀환 도착에 몸 짐을 거두고 곳간 = 동원 전 그대로(소멸 · 생성 0) ·
//        귀환 뒤 몸에 남은 원정 무기 0 · 군량도 몸 짐 → 곳간(먹은 몫만 빠진다)
//     ⓒ 싸운 원정(공격 패 · 궤주) — 하루 경계마다 장부 = 산 몸 짐 합 · 결판 자리: 쓰러진 몸 짐 = 땅 더미 = 이긴 쪽이 주운 몫 + 땅에 남은 몫(T857 그 문) ·
//        항등 — 반출 = 남김 + 반납 + 땅에 간 몫 · 공격 곳간 끝 = 동원 전 − 반출 + 남김 + 반납 · 방어 곳간 + 주운 몫
//     ⓓ 되돌림 — `T403_ARMS_LEDGER=0` = 장부 0 · 원정 동안 곳간 무기 그대로(종전 — 읽기만) · `T1094_CARRY_CAP=0` = 장부는 서지만 몸 짐 0(증인 — 장부에만 있고 몸에 없는 짐) ·
//        `T1094_CARRY_CAP=0` 궤주(증인 — 문 5 만이면 진 원정 짐 무기 일부가 사라진다: 결판 흐름 `warWeaponFlow` 회수 0.7 · 0.5(종전 econ 규칙)가 짐에서 뺀다) ↔ ⓒ 켬 = 두 곳간 합 무변(땅에 남은 몫만)
//     ⓔ 결정론 — 같은 판 두 번 = 바이트 같다
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · war-core · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1094-arms-trip.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const KNOBS = ['T1094_CARRY_CAP', 'T403_ARMS_LEDGER', 'T811_ARMS_BODY', 'T423_RATION_ACT', 'VILLAGE_NPC_CAP', 'T466_LOOT_ACT', 'T826_LOOT_BODY', 'T790_NO_SNAP', 'T941_BATTLE_DAY', 'CARRY_CAP_KG', 'T1060_SCRAM_HOLD', 'T1044_SCRAM_WALK'];
const r3 = (x) => Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null;

// ── 아이 판 — 공격 마을 A(100,100) · 방어 마을 B(460,100) · 동원 문(war-core `_opPackLoad` · `warArmsOut`) 그대로 · 귀환 도착까지 ──
if (process.env.T1094_SUB === 'trip') {
  const P = JSON.parse(process.env.T1094_P || '{}');
  const econ = R('sim/economy-sim.js'), WarCore = R('sim/war-core.js'), WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js'), SimVillages = R('server/villages.js'), Wt = R('server/weights.js');
  const SZ = 32;
  let s = 7; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const ZS = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const MOVE = parseInt((ZS.match(/const MOVE_SPEED = (\d+);/) || [])[1], 10);
  const scn = (/function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZS) || [''])[0];
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', scn + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  const players = new Map(), npcs = new Set(); let _pid = 1;
  const JOBS = ['warrior', 'hunter', 'farmer', 'fisher', 'miner', 'forager', 'lumberjack', 'mason'];
  const deps = { players, npcs, broadcast: () => {},
    spawnNpc: (o) => { const pid = 'p' + (_pid++); const p = { pid, x: o.x, y: o.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: JOBS[_pid % JOBS.length] }; players.set(pid, p); npcs.add(pid); return p; },
    anyViewerNear: () => false, isPositionActive: () => false, isBlockedByWall: () => false, setHp: require('./lib-hp-door').makeSetHp(() => {}),
    isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, tickHz: 30, moveSpeed: MOVE, standCellNear };
  const mkVil = (name, c, dbId, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 20; e.storage.stone = 200; return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx: [] }; };
  const atk = mkVil('공격A', { cx: 100, cy: 100 }, 1, 22), def = mkVil('농성B', { cx: 460, cy: 100 }, 2, 18);
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  let H = null;
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: v => ({ cx: v.ccx, cy: v.ccy }), territoryOf: () => 2800, log: null,
    onEngage: (w, day, why) => H._warEngage(w, day, why), rationEat: (w, day) => H._warRationEat(w, day), rationCollect: (w) => H._warRationCollect(w),
    lootCarry: (w, items, kind) => H._warLootAccept(w, items, kind), armsCollect: (w) => H._warArmsCollect(w) });
  H = SimVillages.__p3Bind({ ready: true, zoneId: 'test', deps, villages, byDbId: new Map(villages.map(v => [v.dbId, v])), byEcon: new Map(villages.map(v => [v.econ, v])),
    war, warCore: WarCore, world, db: { getVillageStructRows: () => [] }, warBodies: new Map(), routeCache: new Map(), _route: null, _distCtx: null, roads: null, pathfind: R('server/pathfind.js'),
    epoch: 0, dayMs: 30000, lastGameDay: world.day, _warThreatBuf: null, _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 },
    _warPerf: { ring: new Array(3000).fill(0), i: 0, n: 0, max: 0, soldiers: 0, soldiersMax: 0, fighting: 0 }, _t476Stat: null, _t476Kill: null, ledger: null });
  const WL = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: (w, day, pre) => war.warResolveBattle(w, day, pre), blockedCell: (cx, cy) => H._warBlockedCell(cx, cy) });
  H.state.warLive = WL;
  { const _n = Date.now, _t = world.day * 30000 + 1; Date.now = () => _t; try { for (const v of villages) H.syncVillagePop(v, Infinity); } finally { Date.now = _n; } }
  H._warBuildRectIndex();
  const W0 = atk.econ.storage.weapon, WB0 = def.econ.storage.weapon, FE0 = econ.totalFoodEquivalent(atk.econ);
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const force = Object.values(comp).reduce((a, x) => a + (x || 0), 0);
  const w = { id: 1, atk, def, casus: 'feud', force, warriors: 2, composition: comp, weapQ: 0.5, phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _opPolicy: 'assault' };
  w._packDays = w._packRem = war._opPackLoad(atk, force, 14, w);
  { const a = WarCore.warArmsOut(atk.econ, force); if (a) w._arms = a; }
  if (P.scen === 'assault') {   // T1089 하네스 판 — 농성 B 의 몸은 회관 북쪽 150칸(긴급 소집이 걸어 온다) · 공격이 진다
    def.econ.land.size = 400; def._defPolicy = 'hold'; w._defMode = 'hold'; w._defModeDay = world.day;
    def.npcPids.forEach((pid, i) => { const p = players.get(pid); p.x = (460 + (i % 3) * 2) * SZ + SZ / 2; p.y = (100 - 150 + ((i / 3) | 0) * 2 - 6) * SZ + SZ / 2; });
  } else { def._defPolicy = 'hold'; w._defMode = 'hold'; }
  war.WARS.push(w);
  const W1 = atk.econ.storage.weapon;
  const out = { W0, W1, WB0, FE0: r3(FE0), force, arms0: w._arms ? { out: w._arms.out } : null, chk: [], gap: 0, end: null, wEnd: null, loaded: null };
  const sumM = () => { const M = w._armsPack; if (!M) return null; let a = 0; for (const q of M.values()) a += q || 0; return a; };
  const dayMs = 30000; let now = world.day * dayMs + 1, dayAt = now, withdrawn = false;
  for (let t = 0; t < 30 * 60 * 20; t++) {
    now += 1000 / 30;
    H.tickWarBodies(now);
    const b0 = H.state.warBodies.get(w.id);
    if (!out.loaded && b0 && b0.instantiated && b0.pids && b0.pids.length) out.loaded = { n: b0.pids.length, onB: r3(sumM()), ledger: r3(w._arms ? w._arms.weapon : null), left: r3(w._arms ? (w._arms.left || 0) : null), W: r3(atk.econ.storage.weapon) };
    if (now - dayAt >= dayMs) {
      if (H.T681_ON) { let k = 0; while (H._t681Flush() === 'retry' && k++ < 1e6); }
      { const bx = H.state.warBodies.get(w.id); if (bx && bx.ended && !out.end) out.end = bx.ended; }   // ★[T1216] T941 켬 기본(T1183) — 남은 교전 몫을 이 경계의 flush 가 돌려 결판이 서고, 귀환 몸이 같은 경계(`_t681Day`)에서 지워진다 ⇒ 경계 안에서도 결판을 읽는다
      dayAt = now; world.day++; H.state.lastGameDay++;
      if (P.scen === 'withdraw' && !withdrawn && out.loaded) { withdrawn = true; w.op = 'withdraw'; w._sortie = false; w.phase = 'return'; w.eta = world.day + (w.marchDays || 1); }   // 싸움 없이 철수(war-core 철수 전이 그 칸)
      const a = w._arms, M = sumM();   // 하루 경계 — 장부 = 산 몸 짐 합(귀환 도착 앞)
      if (a && !a.done && M != null) { const g = Math.abs(M - (a.weapon || 0)); out.gap = Math.max(out.gap, g); if (out.chk.length < 64) out.chk.push([world.day, r3(M), r3(a.weapon)]); }
      const sb = (war.stats().surrender) || 0;
      war.daily(world.day); H._warAfterDaily(sb);
      if (H.T681_ON) H._t681Day(now);
    }
    const b = H.state.warBodies.get(w.id);
    if (b && b.ended && !out.end) out.end = b.ended;
    if (!war.WARS.includes(w) && !b) break;
  }
  const a = w._arms || null;
  let ownW = 0; for (const pid of atk.npcPids) { const p = players.get(pid); if (p && p.inventory && p.inventory.weapon) ownW += p.inventory.weapon; }
  out.wEnd = { inWars: war.WARS.includes(w), body: !!H.state.warBodies.get(w.id), day: world.day };
  out.arms = a ? { out: a.out, now: r3(a.weapon), left: r3(a.left || 0), back: r3(a.back), done: a.done } : null;
  out.W2 = r3(atk.econ.storage.weapon); out.WB2 = r3(def.econ.storage.weapon); out.FE2 = r3(econ.totalFoodEquivalent(atk.econ)); out.ownW = r3(ownW);
  out.t811 = H.state._warStat.t811 || null; out.t1094 = H.state._t1094St || null; out.book = w._rationBook ? { load: r3(w._rationBook.load), eaten: r3(w._rationBook.eaten), back: r3(w._rationBook.back), drop: r3(w._rationBook.drop), led: r3(w._rationBook.ledgerEaten) } : null;
  out.gap = r3(out.gap); out.mirror = r3(atk.econ._warArmsOut || 0);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CC = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const sub = (env, P) => { const E = Object.assign({}, process.env, { T1094_SUB: 'trip' }); for (const k of KNOBS) delete E[k]; delete E.T1094_P; Object.assign(E, env || {}); if (P) E.T1094_P = JSON.stringify(P);
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); return JSON.parse(o.slice(o.indexOf('{"W0"'))); };
const near = (a, b, e) => Math.abs((a || 0) - (b || 0)) <= (e || 1e-6);
console.log('\n=== 문 5 — 원정이 곳간 무기를 실어 가고 돌아오면 다시 곳간(T1094) ===');

console.log('\n[ⓐ] 정적 — T403 켬 기본 · 반출 · 반납 글자 그대로');
{
  const on = fnBody(CC, '_armsLedgerOn'), ao = fnBody(CC, 'warArmsOut'), ar = fnBody(CC, 'warArmsReturn');
  ok(/process\.env\.T403_ARMS_LEDGER !== '0'/.test(on) && (CC.match(/process\.env\.T403_ARMS_LEDGER/g) || []).length === 1,
    "ⓐ war-core `T403_ARMS_LEDGER !== '0'`(켬 기본 · 되돌림 `=0`) — 문 하나");
  ok(/const n = Math\.max\(0, Math\.min\(F, Math\.floor\(stock\)\)\);/.test(ao) && /e\.storage\.weapon = stock - n;/.test(ao) && /if \(e && e\.storage && n > 0\) e\.storage\.weapon = \(e\.storage\.weapon \|\| 0\) \+ n;/.test(ar) && /a\.back = n; a\.weapon = 0; a\.done = true;/.test(ar),
    'ⓐ 반출(한 사람 한 자루 · 곳간 무기 정수 몫) · 반납(장부 그대로 곳간에 · 한 번) — 글자 그대로');
}

console.log('\n[ⓑ] 싸움 없이 돌아온 원정 — 철수(몸 여덟)');
const WD = sub({}, { scen: 'withdraw' });
{
  ok(WD.arms0 && WD.arms0.out > 0 && near(WD.W1, WD.W0 - WD.arms0.out) && WD.loaded && near(WD.loaded.onB, WD.loaded.ledger) && near(WD.loaded.ledger, WD.arms0.out),
    'ⓑ 동원 순간 곳간 −반출 · 몸이 선 순간 장부 = 산 몸 짐 합 = 반출(몸에 다 실었다)', JSON.stringify({ W: [WD.W0, WD.W1], loaded: WD.loaded }));
  ok(WD.chk.length >= 1 && WD.gap <= 1e-9, 'ⓑ 하루 경계마다 장부 = 산 몸 짐 합', JSON.stringify({ chk: WD.chk, gap: WD.gap }));
  ok(WD.arms && WD.arms.done && near(WD.arms.back, WD.arms0.out) && near(WD.W2, WD.W0) && WD.ownW === 0 && WD.mirror === 0 && !WD.wEnd.inWars,
    '★ⓑ 귀환 도착 — 몸 짐을 거두고 곳간 = 동원 전 그대로(소멸 · 생성 0) · 몸에 남은 원정 무기 0 · 거울 0', JSON.stringify({ arms: WD.arms, W: [WD.W0, WD.W2], ownW: WD.ownW }));
  ok(WD.book && near(WD.FE2, WD.FE0 - WD.book.eaten - WD.book.led - WD.book.drop, 1e-6),
    'ⓑ 군량도 몸 짐 → 곳간(먹은 몫만 빠진다)', JSON.stringify({ FE: [WD.FE0, WD.FE2], book: WD.book }));
}

console.log('\n[ⓒ] 싸운 원정 — 공격 패(궤주)');
const AS = sub({}, { scen: 'assault' });
{
  const st = AS.t811 || {};
  ok(AS.end && AS.end.why === 'rout' && AS.end.winner === 'B' && AS.chk.length >= 1 && AS.gap <= 1e-9,
    'ⓒ 결판 = 궤주(방어 승) · 하루 경계마다 장부 = 산 몸 짐 합', JSON.stringify({ end: AS.end, chk: AS.chk.slice(0, 4), gap: AS.gap }));
  ok(st.fall > 0 && near(st.fall, (st.pickA || 0) + (st.pickB || 0) + (st.ground || 0)),
    'ⓒ 결판 자리 — 쓰러진 몸 짐 = 땅 더미 = 이긴 쪽이 주운 몫 + 땅에 남은 몫(T857 그 문)', JSON.stringify({ fall: st.fall, pickA: st.pickA, pickB: st.pickB, ground: st.ground }));
  ok(AS.arms && AS.arms.done && near(AS.arms0.out, AS.arms.left + AS.arms.back + st.fall - (st.pickA || 0), 1e-6) && near(AS.W2, AS.W0 - AS.arms0.out + AS.arms.left + AS.arms.back, 1e-6) && near(AS.WB2, AS.WB0 + (st.pickB || 0), 1e-6),
    '★ⓒ 항등 — 반출 = 남김 + 반납 + 땅에 간 몫 · 공격 곳간 = 동원 전 − 반출 + 남김 + 반납 · 방어 곳간 + 주운 몫', JSON.stringify({ out: AS.arms0.out, arms: AS.arms, W: [AS.W0, AS.W2], WB: [AS.WB0, AS.WB2] }));
}

console.log('\n[ⓓ] 되돌림');
{
  // ★[T1216] `T811_ARMS_BODY`(무기 몸 · land1048 켬 기본) — 끔 증인은 이 카드 문(`T1094_CARRY_CAP`)만 끈 판이다(켜 두면 T811 문이 따로 몸에 싣는다 · test-t1094-carry-cap 그 묶기)
  const L0 = sub({ T403_ARMS_LEDGER: '0' }, { scen: 'withdraw' }), C0 = sub({ T1094_CARRY_CAP: '0', T811_ARMS_BODY: '0' }, { scen: 'withdraw' });
  ok(L0.arms0 === null && L0.arms === null && near(L0.W1, L0.W0) && near(L0.W2, L0.W0) && L0.loaded && L0.loaded.onB === null,
    "ⓓ `T403_ARMS_LEDGER=0` — 장부 0 · 원정 동안 곳간 무기 그대로(종전 — 읽기만)", JSON.stringify({ W: [L0.W0, L0.W1, L0.W2] }));
  ok(C0.arms0 && C0.loaded && C0.loaded.onB === null && near(C0.loaded.ledger, C0.arms0.out) && near(C0.W2, C0.W0),
    "ⓓ `T1094_CARRY_CAP=0` — 장부는 서지만 몸 짐 0(증인 — 장부에만 있고 몸에 없는 짐) · 귀환에 곳간 = 동원 전", JSON.stringify({ loaded: C0.loaded, W: [C0.W0, C0.W2] }));
  const CA = sub({ T1094_CARRY_CAP: '0', T811_ARMS_BODY: '0' }, { scen: 'assault' });
  const lostA = CA.arms0 ? CA.arms0.out - ((CA.arms && CA.arms.back) || 0) : 0, gainB = (CA.WB2 || 0) - (CA.WB0 || 0), gone = lostA - gainB;
  const sumBody = (AS.W0 + AS.WB0) - (AS.W2 + AS.WB2), sumLedger = (CA.W0 + CA.WB0) - (CA.W2 + CA.WB2);
  ok(CA.end && CA.end.why === 'rout' && CA.end.winner === 'B' && lostA > 0 && gainB > 0 && gone > 1e-6 && near(sumLedger, gone, 1e-6) && near(sumBody, (AS.t811 && AS.t811.ground) || 0, 1e-6),
    "ⓓ `T1094_CARRY_CAP=0` 궤주(문 5 만 · 장부) — 진 원정 짐 무기 일부가 사라진다(결판 흐름 회수 0.7 · 0.5 — 종전 econ 규칙 · 증인) ↔ ⓒ 켬(몸 짐) = 두 곳간 합 무변(땅에 남은 몫만)",
    JSON.stringify({ out: CA.arms0 && CA.arms0.out, back: CA.arms && CA.arms.back, gainB: r3(gainB), gone: r3(gone), sum: { body: r3(sumBody), ledger: r3(sumLedger) } }));
}

console.log('\n[ⓔ] 결정론');
{
  const AS2 = sub({}, { scen: 'assault' });
  ok(JSON.stringify(AS2) === JSON.stringify(AS), 'ⓔ 같은 판 두 번 = 바이트 같다');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
