#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1315-war-corpse.js — 전장 누운 몸 · unknown 출처 · 판 JSON 지문 (T1315) ============================
//
// ★왜 [지시 T1315 ③ ④ ⑤ ⑥]
//   ③ 손잡이 `T1315_WAR_CORPSE=1` — 결판에서 죽은 몸이 `_warDespawnPid`(그 자리에서 지움) 대신 `_bxDie` 처럼 **그 자리에 눕는다**
//      (players 에 남음 · 쓰러진 그림 · hp 0 · AI 끔 · 시신 값이 지나면 거둠) · 짐은 **한 번만** 떨군다.
//   ④ unknown 출처 — econ 이 포로(`_capOutTot`)·야생(`_wildDeadTot`)으로 뺀 사람은 빈 줄 자리에서 `other.captive` · `other.wild` 꼬리표를 받는다(unknown 0).
//   ⑤ 판 JSON 지문(`lib-run-hash`)에서 세는 자 칸(`bodyExit` · `warCorpse`)을 뺀다 — 꼬리표만 고쳐도 기준선이 안 갈린다.
//   하네스는 **운영 함수 그대로**(`villages.__p3Bind` — test-body-exit 와 같은 문)를 목 세계 위에서 부른다.
//
// ★자명 통과 금지 — 미끼 셋(판정 함수를 진짜와 미끼에 똑같이 대고 미끼는 빨갛게 나와야 초록):
//   미끼 ⓐ 짐을 두 번 떨구는 사본(운영 소스에서 한 번 막이 둘을 지운 villages 사본 — 같은 판정이 빨강)
//   미끼 ⓑ 포로 누계를 안 올리고 econ 에서만 빼는 판(종전 war-core) — unknown 이 +1 이어야(판정 빨강)
//   미끼 ⓒ 지문에 `bodyExit` 을 다시 넣은 정의 — 꼬리표만 다른 두 판의 지문이 갈려야(판정 빨강)
//
// 실행: node scripts/test-t1315-war-corpse.js
'use strict';
process.env.T1315_WAR_CORPSE = '1';   // 손잡이 켬 판 — 모듈이 읽기 전에(끔 = 종전 `_warDespawnPid` 글자 그대로 · 끔 판은 기준선 견주기가 본다)
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.T1198_BIRTH_BODY = process.env.T1198_BIRTH_BODY || '0';   // test-body-exit 와 같은 판(종전 따라가기 · 까닭 줄 차례 몸)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const econ = R('sim/economy-sim');
const V = R('server/villages');
const RH = R('scripts/lib-run-hash');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SZ = 32, MOVE = 64, CORPSE_MS = 300000;

// ── 목 세계 — test-body-exit 와 같은 꼴(회관 (200,200) · 마을 둘) · `Vm` = 붙일 villages 모듈(진짜 · 미끼 사본) ──────────
function world(Vm, n) {
  const players = new Map(), npcs = new Set(), bcast = [], drops = [];
  let pid = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'n' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: { wood: 6, stone: 4 } }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false,
    moveSpeed: MOVE, corpseMs: CORPSE_MS,
    //   낙하 목 — 플레이어 죽음 캐논(zone `_deathDrop`)처럼 벌크 칸마다 절반을 몸에서 뗀다(무게는 진짜 `carry` 가 잰다)
    deathDrop: (p) => { drops.push(p.pid); const inv = p.inventory || {}; for (const k of Object.keys(inv)) inv[k] = Math.floor(inv[k] / 2); return 0; },
    setHp: require('./lib-hp-door').makeSetHp((m) => bcast.push(m)),
  };
  const mk = (nm, k) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name: nm });
  const e = mk('목촌', n);
  const vil = { dbId: 1, name: '목촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: 500, ccy: 200, econ: mk('이웃', 4), npcPids: [], housesPx: [], _maxRPx: 40 * SZ };
  const W = { day: 400, seed: 7 };
  const H = Vm.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [other.econ, other]]),
    world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null, war: null,
    epoch: 0, dayMs: 30000, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  H.syncVillagePop(vil, Infinity);
  H.syncVillagePop(vil, 2);   // 첫 관측(기준만 심는다)
  return { H, vil, e, players, npcs, bcast, drops };
}
const leftAt = (b, f) => b.slice(f).filter((m) => m && m.type === 'player_left').map((m) => m.pid);
const downAt = (b, f) => b.slice(f).filter((m) => m && m.type === 'player_down_state' && m.isDown).map((m) => m.pid);
const C = R('server/carry');
const kgOf = (p) => (C.npcTotalKg ? C.npcTotalKg(p) : C.totalKg(p));

// ── 판정 함수(진짜 · 미끼에 똑같이 댄다) ──────────────────────────────────────────────────────
//   ③ 한 몸을 결판이 두 번 불러도(같은 결판 · 다음 결판) 낙하는 한 번
function corpseRun(Vm) {
  const T = world(Vm, 10);
  const pid = T.vil.npcPids[3], P = T.players.get(pid), kg0 = kgOf(P), x0 = P.x, y0 = P.y, b0 = T.bcast.length;
  T.H._warFallPid(pid); T.H._warFallPid(pid);
  return { T, pid, P, kg0, x0, y0, b0, drops: T.drops.filter((q) => q === pid).length, st: T.H.t1315Stat() };
}
const dropOnce = (r) => r.drops === 1;
//   ④ econ 이 포로 · 야생으로 사람을 뺀 날 — unknown 이 안 는다
function tagRun(Vm, cap, wild, plain, counted) {
  const T = world(Vm, 12);
  const s0 = T.H.bodyExitStats();
  for (let i = 0; i < cap; i++) { T.e.npcs.pop(); if (counted) T.e._capOutTot = (T.e._capOutTot || 0) + 1; }   // war-core warCapture · _capComplete 의 두 줄
  for (let i = 0; i < wild; i++) { T.e.npcs.pop(); if (counted) T.e._wildDeadTot = (T.e._wildDeadTot || 0) + 1; }   // wildlife reapDead 의 두 줄
  for (let i = 0; i < plain; i++) { T.e.npcs.splice(0, 1); T.e._deadTot = (T.e._deadTot || 0) + 1; T.e._natDeadTot = (T.e._natDeadTot || 0) + 1; }   // 늙어 죽음(인구식)
  T.H.syncVillagePop(T.vil, Infinity);
  const s1 = T.H.bodyExitStats();
  const d = (a, b) => (b || 0) - (a || 0);
  return { n: T.vil.npcPids.length, want: T.e.npcs.length, unknown: d(s0.other.unknown, s1.other.unknown), captive: d(s0.other.captive, s1.other.captive), wild: d(s0.other.wild, s1.other.wild), old: d(s0.died.old, s1.died.old) };
}
const unknownZero = (r) => r.unknown === 0;
//   ⑤ 꼬리표만 다른 두 판 — 지문이 같다 · 판 끝이 다르면 지문이 갈린다
const runA = { eight: { pop: 812, dead: 3 }, dissolved: 2, empty: 1, env: { A: 1 }, days: [1, 2], bodyExit: { other: { unknown: 443 } } };
const runB = Object.assign({}, runA, { env: { A: 2 }, bodyExit: { other: { unknown: 0, captive: 401, wild: 42 } }, warCorpse: { on: true, lay: 5 } });
const runC = Object.assign({}, runA, { eight: { pop: 813, dead: 3 } });
const hashSame = (f) => f(runA) === f(runB) && f(runA) !== f(runC);

console.log('\n=== T1315 — 전장 누운 몸 · unknown 출처 · 판 JSON 지문 ===');
ok(V.T1315_WAR_CORPSE === true, '손잡이 켬 판(이 하네스) — `T1315_WAR_CORPSE` 를 모듈이 읽었다');

// ── ③ 누운 몸 ─────────────────────────────────────────────────────────────────────────────
{
  const r = corpseRun(V), { T, pid, P } = r;
  ok(T.players.has(pid) && P.isDown === true && P.hp === 0 && !T.npcs.has(pid), '③ 결판에서 죽은 몸은 **지워지지 않고 눕는다**(players 에 남음 · 쓰러짐 · hp 0 · AI 끔)');
  ok(T.vil.npcPids.indexOf(pid) < 0, '③ 마을 명부에서는 빠진다(종전 `_warDespawnPid` 와 같은 명부 한 줄)');
  ok(P.x === r.x0 && P.y === r.y0, '③ 그 자리 — 좌표 그대로', `(${P.x.toFixed(0)},${P.y.toFixed(0)})`);
  ok(downAt(T.bcast, r.b0).indexOf(pid) >= 0 && leftAt(T.bcast, r.b0).length === 0, '③ 방송 = `player_down_state` · `player_left` 0(순간 소멸 0)');
  ok(dropOnce(r), '③ ★짐 낙하 **한 번** — 같은 몸을 두 번 불러도', `낙하 ${r.drops}`);
  ok(r.st.lay === 1 && r.st.drop === 1 && r.st.again === 1, '③ 셈 — 누움 1 · 낙하 1 · 다시 부름 1(막음)', JSON.stringify(r.st));
  ok(r.st.dropKg > 0 && Math.abs(r.st.dropKg - (r.kg0 - kgOf(P))) < 1e-6, '③ 떨군 kg = 몸 무게가 준 만큼', `${r.st.dropKg} kg (몸 ${r.kg0.toFixed(2)} → ${kgOf(P).toFixed(2)})`);
  const st = T.H.bodyExitStats();
  ok(st.lying === 1, '③ 누운 몸 장부 1(시신 값이 지나면 거둔다)');
  //   시신 값이 지나면 거둔다 — 시계는 test-body-exit 와 같다(T681 켬 = econ 날 경계)
  const S = T.H.state, T681 = !!T.H.T681_ON; let t = T681 ? T.H.econDayToMs(S.world.day) + 1 : Date.now(), dayAt = T681 ? T.H.econDayToMs(S.world.day) : 0;
  const b1 = T.bcast.length;
  for (let k = 0; k < 40; k++) { t += 30000; T.H.tickBodyExits(t); while (T681 && t - dayAt >= S.dayMs) { dayAt += S.dayMs; S.world.day++; S.lastGameDay++; T.H._t681Day(t); } }
  ok(!T.players.has(pid) && leftAt(T.bcast, b1).indexOf(pid) >= 0, '③ 시신 값이 지나면 거둔다(`player_left` 는 이때 한 번)');
  ok(T.drops.filter((q) => q === pid).length === 1, '③ 거둘 때도 다시 안 떨군다(낙하 그대로 1)');
}

// ── ④ unknown 출처 ────────────────────────────────────────────────────────────────────────
{
  const r = tagRun(V, 2, 1, 1, true);
  ok(r.n === r.want, '④ 몸 수가 econ 을 따라간다', `${r.n} = ${r.want}`);
  ok(r.captive === 2 && r.wild === 1 && r.old === 1, '④ 꼬리표 — 포로 2 · 야생 1 · 늙음 1', JSON.stringify(r));
  ok(unknownZero(r), '④ ★unknown +0', `+${r.unknown}`);
}

// ── ⑤ 판 JSON 지문 ────────────────────────────────────────────────────────────────────────
ok(RH.RUN_HASH_DROP.indexOf('bodyExit') >= 0 && RH.RUN_HASH_DEF === 'T1315', '⑤ 지문 밖 칸에 `bodyExit` · 정의 표시 T1315');
ok(hashSame((x) => RH.runHashOf(x)), '⑤ 꼬리표(`bodyExit` · `warCorpse`)만 다른 두 판의 지문이 같다 · 판 끝(여덟 수)이 다르면 갈린다');
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts/server-baseline-check.js'), 'utf8');
  ok(/runHash: RH\.runHashOf\(run\)/.test(src) && /runHashDef: RH\.RUN_HASH_DEF/.test(src), '⑤ 기준선 자(`server-baseline-check`)가 이 정의를 쓴다(만들기 · 견주기)');
}

// ── 미끼 ──────────────────────────────────────────────────────────────────────────────────
console.log('\n  — 미끼(같은 판정이 빨강이어야) —');
{   // ⓐ 한 번 막이 둘을 지운 villages 사본
  const src = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  const a = "if (p._t1315Corpse) { _t1315Stat.again++; return; }", b = 'if (!p._t1315Drop) {';
  const n1 = src.split(a).length - 1, n2 = src.split(b).length - 1;
  ok(n1 === 1 && n2 === 1, '미끼 ⓐ 운영 소스에 한 번 막이 둘이 한 자리씩 있다(사본을 만들 수 있다)');
  const f = path.join(ROOT, 'server', `.t1315-decoy-${process.pid}.js`);
  try {
    fs.writeFileSync(f, src.replace(a, '').replace(b, 'if (true) {'));
    const D = require(f);
    const r = corpseRun(D);
    ok(r.drops === 2 && !dropOnce(r), '미끼 ⓐ 두 번 떨구는 사본 → 판정 빨강', `낙하 ${r.drops}`);
  } finally { try { fs.unlinkSync(f); } catch (e) {} }
}
{   // ⓑ 포로 · 야생 누계를 안 올리는 판
  const r = tagRun(V, 2, 1, 1, false);
  ok(r.unknown === 3 && !unknownZero(r), '미끼 ⓑ 누계 없이 econ 에서만 뺀 판 → unknown +3 · 판정 빨강', JSON.stringify(r));
}
{   // ⓒ 지문에 bodyExit 을 다시 넣은 정의
  const back = RH.RUN_HASH_DROP.filter((k) => k !== 'bodyExit' && k !== 'warCorpse');
  ok(!hashSame((x) => RH.runHashOf(x, back)), '미끼 ⓒ `bodyExit` 을 지문에 다시 넣은 정의 → 꼬리표만 바뀐 판이 갈린다 · 판정 빨강');
}

console.log(`\n=== T1315: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
