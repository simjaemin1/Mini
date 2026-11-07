#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1094-carry-cap.js — 문 6: 원정은 몸이 질 수 있는 만큼만 가져간다(`T1094_CARRY_CAP` 켬 기본 후보) ==========
//
// ★왜 [지시 T1094 · ★PM 11-02 캐논 문 6 "몸이 질 수 있는 만큼만 가져간다(carry.js CAP_KG 25 kg · 못 지는 몫은 집 곳간에 · 장부에만 있고 몸에 없는 짐 0)"]
//   종전: 동원이 곳간에서 뗀 군량 팩은 몸 수와 무관하게 몸에 나뉘어 실렸다(몸 하나가 병력 전체 팩을 지는 판도 있다) · 무기 장부(T403)는 몸에 안 실렸다.
//   지키는 것:
//     ⓐ 정적 — 손잡이 문 하나(`!== '0'`) · 군량 싣기 줄 글자 그대로 + 한 줄(군량 먼저) · 무기 싣기 문(켬이면 몸에 · 군량 다음) · 결판 줄 문 · 상한 = `carry.js CAP_KG` · 무게 = `weights.js` ·
//        남김 = war-core `rationLeave`(내려놓기 그 문 `_warFoodGive`) · 새 수 0
//     ⓑ 상한이 무는 판(가시 몸 하나 — `VILLAGE_NPC_CAP=1` · 병력 여덟의 팩 14일 = 78.4kg) — 켬: 몸 짐 = 상한(25kg) · 군량이 상한을 다 채워 무기는 다 집에 ·
//        집에 남긴 군량 = 곳간에서 뗀 것 − 몸에 실은 것(식량등가 항등) · 곳간 무기 = 반출 전 그대로 · 끔(`=0`) = 몸 하나가 78.4kg(증인)
//     ⓒ 무기만 넘치는 판(몸 여덟 · 팩 34일 — 몸마다 군량 23.8kg) — 켬: 군량은 안 덜고(먼저) · 무기는 남은 자리만큼(몸마다 1.2kg) · 넘는 무기는 집에(장부 −같은 몫 · 거울 = 장부)
//     ⓓ 상한이 안 무는 판(몸 여덟 · 팩 14일 — 몸마다 9.8kg) — 켬 = 끔 군량 몸 짐 한 글자 · 켬은 무기를 몸에 싣는다(장부 = 몸 짐 합) · 끔은 장부만
//     ⓔ 결정론 — 같은 판 두 번 = 바이트 같다
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · war-core · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1094-carry-cap.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const KNOBS = ['T1094_CARRY_CAP', 'T403_ARMS_LEDGER', 'T811_ARMS_BODY', 'T423_RATION_ACT', 'VILLAGE_NPC_CAP', 'T466_LOOT_ACT', 'T826_LOOT_BODY', 'T790_NO_SNAP', 'T941_BATTLE_DAY', 'CARRY_CAP_KG'];
const r3 = (x) => Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null;

// ── 아이 판 — 공격 마을 A(100,100) · 방어 마을 B(460,100) · 동원 문(war-core `_opPackLoad` · `warArmsOut`) 그대로 · 몸이 서고 짐을 실을 때까지 ──
if (process.env.T1094_SUB === 'load') {
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
  const fe = () => econ.totalFoodEquivalent(atk.econ);
  const FE0 = fe(), W0 = atk.econ.storage.weapon;
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const force = Object.values(comp).reduce((a, x) => a + (x || 0), 0);
  const w = { id: 1, atk, def, casus: 'feud', force, warriors: 2, composition: comp, weapQ: 0.5, phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _opPolicy: 'assault' };
  w._packDays = w._packRem = war._opPackLoad(atk, force, P.packDays || 14, w);   // 동원 그 문(곳간에서 뗀다)
  { const a = WarCore.warArmsOut(atk.econ, force); if (a) w._arms = a; }      // 동원 그 문(T403)
  def._defPolicy = 'hold'; w._defMode = 'hold';
  war.WARS.push(w);
  const FE1 = fe(), W1 = atk.econ.storage.weapon;
  let now = world.day * 30000 + 1;
  for (let t = 0; t < 40; t++) { now += 1000 / 30; H.tickWarBodies(now); }   // 몸이 서고 짐을 싣는다(`_warInstantiateAttackers`)
  const body = H.state.warBodies.get(1), keys = w._packKeys || [];
  const kgOf = (inv, ks) => { let a = 0; for (const k of (ks || Object.keys(inv || {}))) a += ((inv || {})[k] || 0) * Wt.kgOfOrDefault(k); return a; };
  const bodies = (body ? body.pids : []).map((pid) => { const p = players.get(pid); return { kg: r3(kgOf(p.inventory)), pack: r3(kgOf(p.inventory, keys)), weap: r3((p.inventory && p.inventory.weapon) || 0) }; });
  const M = w._armsPack; let onB = 0; if (M) for (const q of M.values()) onB += q || 0;
  const bk = w._rationBook || {};
  const packFE = (() => { let a = 0; for (const pid of (body ? body.pids : [])) { const p = players.get(pid); const bag = {}; for (const k of keys) if (p.inventory && p.inventory[k] > 0) bag[k] = p.inventory[k]; a += war.bagFE(bag, { _world: atk.econ._world }); } return a; })();
  const cc = R('server/carry.js');
  process.stdout.write(JSON.stringify({ knob: H.T1094_CARRY_CAP, cap: cc.CFG.CAP_KG, kw: Wt.kgOfOrDefault('weapon'), force, n: bodies.length, packDays: r3(w._packDays), FE0: r3(FE0), FE1: r3(FE1), FE2: r3(fe()), W0, W1, W2: r3(atk.econ.storage.weapon),
    arms: w._arms ? { out: w._arms.out, now: r3(w._arms.weapon), left: r3(w._arms.left || 0) } : null, onB: M ? r3(onB) : null, mirror: r3(atk.econ._warArmsOut || 0), bodies,
    book: { load: r3(bk.load), split: r3(bk.split), back: r3(bk.back), left: r3(bk.left || 0) }, packFE: r3(packFE), t1094: w._t1094 || null, stat: H.state._t1094St || null }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const CC = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
// ★[T1208] land1048 이 켬 기본으로 돌린 둘을 이 판의 전제대로 묶는다(아이 판마다 · 판이 따로 주면 그것):
//   `T1041_WAR_BODY`(T1183 · 전쟁 마을 몸 무제한) — ⓑ 는 가시 몸 하나(`VILLAGE_NPC_CAP=1`)가 병력 팩을 다 지는 판이다(켜면 몸 여덟이 나눠 진다 · 상한이 안 문다).
//   `T811_ARMS_BODY`(무기 몸 · 켬 기본) — ⓓ 끔 증인은 이 카드 문(`T1094_CARRY_CAP`)을 끄면 무기가 장부에만 남는가다(켜면 T811 문이 따로 싣는다).
const sub = (env, P) => { const E = Object.assign({}, process.env, { T1094_SUB: 'load' }); for (const k of KNOBS) delete E[k]; delete E.T1094_P; if (E.T1041_WAR_BODY == null) E.T1041_WAR_BODY = '0'; E.T811_ARMS_BODY = '0'; Object.assign(E, env || {}); if (P) E.T1094_P = JSON.stringify(P);
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); return JSON.parse(o.slice(o.indexOf('{"knob"'))); };
const near = (a, b, e) => Math.abs((a || 0) - (b || 0)) <= (e || 1e-6);
console.log('\n=== 문 6 — 원정은 몸이 질 수 있는 만큼만 가져간다(T1094) ===');

// ── ⓐ 정적 ──
console.log('\n[ⓐ] 정적 — 손잡이 하나 · 종전 줄 그대로 · 새 수 0');
{
  const rl = fnBody(CV, '_warRationLoad'), al = fnBody(CV, '_warArmsLoad'), ef = fnBody(CV, '_warEndFight'), pc = fnBody(CV, '_t1094PackCap'), ac = fnBody(CV, '_t1094ArmsCap'), lv = fnBody(CC, 'rationLeave'), ia = fnBody(CV, '_warInstantiateAttackers');
  ok(/const T1094_CARRY_CAP = process\.env\.T1094_CARRY_CAP !== '0';/.test(CV) && (CV.match(/process\.env\.T1094_CARRY_CAP/g) || []).length === 1 && !/T1094_CARRY_CAP/.test(CC),
    "ⓐ 손잡이 문 하나 — villages `!== '0'`(켬 기본 후보 · 되돌림 `=0`) · war-core 는 손잡이를 안 읽는다");
  ok(/if \(w\._packSplitLots\) w\._packSplitLots = null;\s*\n\s*if \(T1094_CARRY_CAP\) _t1094PackCap\(w, bearers, one\);\s*\n\s*if \(w\._rationBook\) w\._rationBook\.bearers = bearers\.length;/.test(rl)
    && ia.indexOf('_warRationLoad(body);') >= 0 && ia.indexOf('_warRationLoad(body);') < ia.indexOf('_warArmsLoad(body);'),
    'ⓐ 군량 먼저 — 군량 싣기 줄 글자 그대로 + 한 줄(몸마다 상한) · 무기 싣기는 그다음(`_warInstantiateAttackers` 차례 그대로)');
  ok(/if \(!\(T811_ARMS_BODY \|\| T1094_CARRY_CAP\) \|\| !w \|\| !w\._arms \|\| w\._arms\.done \|\| w\._armsPack\) return 0;/.test(al)
    && /if \(T1094_CARRY_CAP && _t1094ArmsCap\(w, bearers\)\) return bearers\.length;\s*\n\s*_t811Sync\(w, 'load'\);/.test(al)
    && /const _t811 = \(T811_ARMS_BODY \|\| T1094_CARRY_CAP\) && w\._armsPack \?/.test(ef),
    'ⓐ 무기 — 켬이면 원정 무기가 몸에 실린다(T811 그 문 · 결판 줄 같은 문) · 남은 자리만큼(`_t1094ArmsCap`) · 끔이면 T811 종전 줄 그대로');
  ok(/CAP_KG/.test(fnBody(CV, '_t1094Cap')) && /kgOfOrDefault/.test(fnBody(CV, '_t1094Kg')) && /_warBagKg\(p\)/.test(pc) && /_warBagKg\(p\)/.test(ac) && /WC\.rationLeave\(w, leave/.test(pc)
    && /_warFoodGive\(A, items, 1, lots \|\| null\);/.test(lv) && /WC\.syncArmsMirror\(w\.atk\)/.test(ac),
    'ⓐ 상한 = `carry.js CAP_KG` · 무게 = `weights.js` · 몸 짐 = 몸 인벤 전부(`_warBagKg`) · 남긴 군량 = war-core `rationLeave`(내려놓기 그 문) · 남긴 무기 = 곳간 + 거울 다시 셈');
  const add = [pc, ac, lv].join(' ').replace(/'[^']*'/g, "''").replace(/T1094|_t1094|T811|_t811|T748|_t748/g, '').replace(/1e-9/g, '').replace(/\.toFixed\(\d\)/g, '.toFixed()');
  ok(add.length > 800 && !/[^\w.'](?:[2-9]\d*|1\d+)(?:\.\d+)?(?![\w'])/.test(add) && !/[^\w.'][01]\.\d/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 · 1 뿐(셈 표기 `toFixed` 자리 · 부동소수 문턱 1e-9 는 종전 그 문턱)', add.length + '자');
}

// ── ⓑ 상한이 무는 판 ──
console.log('\n[ⓑ] 상한이 무는 판 — 가시 몸 하나(`VILLAGE_NPC_CAP=1`) · 병력 여덟 팩 14일');
const ON1 = sub({ VILLAGE_NPC_CAP: '1' }), OFF1 = sub({ VILLAGE_NPC_CAP: '1', T1094_CARRY_CAP: '0' });
{
  const b = ON1.bodies[0] || {}, bo = OFF1.bodies[0] || {};
  ok(ON1.n === 1 && OFF1.n === 1 && ON1.force >= 8 && near(ON1.FE1, OFF1.FE1) && near(ON1.W1, OFF1.W1) && bo.kg > ON1.cap,
    '★ⓑ 끔(`=0`) — 증인: 몸 하나가 병력 전체 팩을 진다(상한 넘게) · 무기는 장부에만(몸 짐 0)', JSON.stringify({ off: bo, onB: OFF1.onB, cap: OFF1.cap }));
  ok(near(b.kg, ON1.cap, 1e-6) && near(b.pack, ON1.cap, 1e-6) && b.weap === 0,
    '★ⓑ 켬 — 몸 짐 = 상한 25kg(군량이 먼저 채운다) · 무기 자리 0', JSON.stringify(b));
  ok(ON1.t1094 && ON1.t1094.trim === 1 && near(ON1.book.left, ON1.FE2 - ON1.FE1, 1e-6) && near(ON1.book.left + ON1.packFE, ON1.book.split, 1e-6) && near(ON1.FE0 - ON1.FE2, ON1.packFE, 1e-6),
    'ⓑ 켬 — 못 진 군량은 집 곳간에(남긴 식량등가 = 곳간이 되찾은 몫 · 남김 + 몸 짐 = 몸에 나눈 몫 · 곳간에서 나간 것 = 몸 짐)', JSON.stringify({ left: ON1.book.left, packFE: ON1.packFE, split: ON1.book.split, FE: [ON1.FE0, ON1.FE1, ON1.FE2] }));
  ok(ON1.arms && ON1.arms.out > 0 && ON1.arms.now === 0 && near(ON1.arms.left, ON1.arms.out) && near(ON1.W2, ON1.W0) && ON1.mirror === 0 && ON1.onB === 0,
    'ⓑ 켬 — 못 진 무기는 다 집 곳간에(장부 0 · 곳간 = 반출 전 · 거울 0)', JSON.stringify({ arms: ON1.arms, W: [ON1.W0, ON1.W1, ON1.W2] }));
}

// ── ⓒ 무기만 넘치는 판 ──
console.log('\n[ⓒ] 무기만 넘치는 판 — 몸 여덟 · 팩 34일(몸마다 군량 23.8kg)');
const ON2 = sub({}, { packDays: 34 });
{
  const packs = ON2.bodies.map((x) => x.pack), kgs = ON2.bodies.map((x) => x.kg), room = (ON2.cap - packs[0]) / ON2.kw;
  ok(ON2.n === 8 && ON2.t1094 && ON2.t1094.trim === 0 && packs.every((x) => x < ON2.cap) && near(ON2.book.left, 0),
    'ⓒ 켬 — 군량은 안 덜었다(몸마다 상한 밑 · 남김 0)', JSON.stringify({ packs: packs.slice(0, 3), cap: ON2.cap }));
  ok(kgs.every((x) => near(x, ON2.cap, 1e-6)) && near(ON2.arms.now, room * ON2.n, 1e-6) && near(ON2.arms.left, ON2.arms.out - room * ON2.n, 1e-6) && ON2.arms.left > 0,
    'ⓒ 켬 — 무기는 남은 자리만큼(몸마다 몸 짐 = 상한) · 넘는 무기는 집에', JSON.stringify({ kg: kgs.slice(0, 3), arms: ON2.arms, roomPerBody: r3(room) }));
  ok(near(ON2.onB, ON2.arms.now, 1e-6) && near(ON2.mirror, ON2.arms.now, 1e-6) && near(ON2.W2, ON2.W0 - ON2.arms.out + ON2.arms.left, 1e-6),
    'ⓒ 켬 — 장부 = 몸 짐 합 = 거울 · 곳간 = 반출 전 − 실은 몫', JSON.stringify({ onB: ON2.onB, mirror: ON2.mirror, W: [ON2.W0, ON2.W2] }));
}

// ── ⓓ 상한이 안 무는 판 ──
console.log('\n[ⓓ] 상한이 안 무는 판 — 몸 여덟 · 팩 14일(몸마다 9.8kg)');
const ON3 = sub({}), OFF3 = sub({ T1094_CARRY_CAP: '0' });
{
  ok(ON3.n === OFF3.n && ON3.n > 1 && JSON.stringify(ON3.bodies.map((x) => x.pack)) === JSON.stringify(OFF3.bodies.map((x) => x.pack)) && near(ON3.book.left, 0) && near(ON3.FE2, OFF3.FE2) && ON3.t1094.trim === 0,
    'ⓓ 켬 = 끔 군량 몸 짐 한 글자 · 남김 0 · 곳간 식량 같음', JSON.stringify({ pack: ON3.bodies[0].pack, n: ON3.n }));
  ok(near(ON3.onB, ON3.arms.out) && ON3.bodies.every((x) => x.kg <= ON3.cap) && OFF3.onB === null && near(OFF3.arms.now, OFF3.arms.out),
    'ⓓ 켬 — 무기는 몸에(장부 = 몸 짐 합 · 몸마다 상한 밑) · 끔 — 장부에만(몸 짐 0)', JSON.stringify({ on: [ON3.onB, ON3.arms.out, ON3.bodies[0].kg], off: [OFF3.onB, OFF3.arms.now] }));
}

// ── ⓔ 결정론 ──
console.log('\n[ⓔ] 결정론');
{
  const ON1b = sub({ VILLAGE_NPC_CAP: '1' }), ON2b = sub({}, { packDays: 34 });
  ok(JSON.stringify(ON1b) === JSON.stringify(ON1) && JSON.stringify(ON2b) === JSON.stringify(ON2), 'ⓔ 같은 판 두 번 = 바이트 같다');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
