#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-body-exit.js — 사람이 줄 때 몸이 **몸으로** 줄어드는가 (T590) ==========================
//
// ★왜 [지시 T590 · 일관성 캐논 "순간 소멸·추상 금지" · T577 회부 4]
//   종전엔 econ 인구가 줄면 `removeOneNpc` 가 **가장 최근에 선 몸**을 그 자리에서 지웠다(`player_left` · 시체 0).
//   이제 까닭을 보고 ⓐ 그 자리에서 죽거나(누운 몸 · 짐 낙하 · 굶음이면 장부 한 줄) ⓑⓒ 걸어서 나간다(은거지 · 마을 밖).
//   이 하네스는 **운영 함수 그대로**(`villages.__p3Bind` — test-war-world 와 같은 문)를 목 세계 위에서 부른다(사본 0).
//
// ★자명 통과 금지:
//   · 판정 ⑧(순간 소멸 0)은 "동기화 순간에 `player_left` 가 나갔나"를 센다 — 같은 세는 자에 순간 소멸 한 줄을 넣으면 잡는지 ⑨ 에서 먼저 보인다.
//   · 몸 위치는 동기화 앞뒤를 **좌표로** 맞댄다(누운 몸은 그 칸 · 걷는 몸은 한 틱에 걸음 한도 안).
//
// 실행: node scripts/test-body-exit.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const econ = R('sim/economy-sim');
const V = R('server/villages');
const Events = R('server/events');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SZ = 32;
const MOVE = 64;            // 목의 걸음 — 운영은 존 `MOVE_SPEED` 를 deps 로 넘긴다(여기선 목 값 · 판정은 "걸음 한도 안"만 본다)
const CORPSE_MS = 300000;   // 목의 누운 시간 — 운영은 존 `CORPSE_DECAY_MS` 를 deps 로 넘긴다

// ── 목 세계 — 마을 하나(회관 (200,200) 칸) · 집 넷 · econ 인구 n ─────────────────────────────
function world(n, opts) {
  const o = opts || {};
  const players = new Map(), npcs = new Set(), bcast = [];
  let pid = 1;
  const drops = [];
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'n' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {} }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false,
    moveSpeed: MOVE, corpseMs: CORPSE_MS,
    deathDrop: (p) => { drops.push(p.pid); return 0; },
  };
  const e = econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: n, name: '목촌' });
  const C = { cx: 200, cy: 200 };
  const housesPx = [0, 1, 2, 3].map((i) => ({ x: (C.cx - 6 + i * 4) * SZ + SZ / 2, y: (C.cy + 8) * SZ + SZ / 2 }));
  const vil = { dbId: 1, name: '목촌', ccx: C.cx, ccy: C.cy, econ: e, npcPids: [], housesPx, _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: C.cx + 300, ccy: C.cy, econ: econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 4, name: '이웃' }), npcPids: [], housesPx: [], _maxRPx: 40 * SZ };
  const W = { day: 400, seed: 7 };
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [other.econ, other]]),
    world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null,
    epoch: 0, dayMs: 30000, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  H.syncVillagePop(vil, Infinity);
  if (o.observe !== false) H.syncVillagePop(vil, 2);   // 첫 관측(기준만 심는다 — 까닭 0)
  return { H, vil, e, players, npcs, bcast, drops, deps };
}
// econ 이 사람 k 명을 인구식으로 잃었다(죽음) — econ 정본이 하는 두 줄 그대로(`_deadTot` · splice) · 기근 여부는 `_dpDebug.hunger`
function econDeaths(e, k, famine) {
  e._dpDebug = Object.assign({}, e._dpDebug || {}, { hunger: famine ? -0.5 : 0.2 });
  for (let i = 0; i < k; i++) { e.npcs.splice(0, 1); e._deadTot = (e._deadTot || 0) + 1; }
}
function econLeave(e, k) { for (let i = 0; i < k; i++) e.npcs.pop(); }   // 도적 전환·이탈 — econ 이 항목만 뺀다(까닭은 noteBodyExit 가 적는다)
const leftAt = (bcast, from) => bcast.slice(from).filter((m) => m && m.type === 'player_left').map((m) => m.pid);
const downAt = (bcast, from) => bcast.slice(from).filter((m) => m && m.type === 'player_down_state' && m.isDown).map((m) => m.pid);
const sumv = (o) => Object.values(o || {}).reduce((a, v) => a + v, 0);

console.log('\n=== T590 — 사람이 줄 때 몸이 몸으로 줄어드는가 ===');

// ── ① 늙어 죽음 — 명부 맨 앞 몸이 그 자리에 눕는다 ─────────────────────────────────────────
let vanishAtSync = 0;
{
  const T = world(10);
  const s0 = T.H.bodyExitStats(), b0 = T.bcast.length;
  const first = T.vil.npcPids[0], P = T.players.get(first), x0 = P.x, y0 = P.y;
  econDeaths(T.e, 1, false);
  T.H.syncVillagePop(T.vil, 2);
  const s1 = T.H.bodyExitStats();
  vanishAtSync += leftAt(T.bcast, b0).length;
  ok(T.vil.npcPids.length === 9 && T.vil.npcPids.indexOf(first) < 0, '① 몸 수가 econ 을 따라 9 — 빠진 몸 = 명부 맨 앞(가장 먼저 선 몸)', `${T.vil.npcPids.length}`);
  ok(T.players.has(first) && P.isDown === true && P.hp === 0 && !T.npcs.has(first), '① ★그 몸은 **사라지지 않고 눕는다**(players 에 남음 · 쓰러진 그림 · hp 0 · AI 끔)');
  ok(P.x === x0 && P.y === y0, '① 그 자리 — 좌표가 한 픽셀도 안 바뀐다', `(${P.x.toFixed(0)},${P.y.toFixed(0)})`);
  ok(downAt(T.bcast, b0).indexOf(first) >= 0 && leftAt(T.bcast, b0).length === 0, '① 방송 = `player_down_state`(쓰러짐의 그 메시지) · `player_left` 0');
  ok(T.drops.indexOf(first) >= 0, '① 짐 낙하 문(플레이어 죽음 캐논 `_deathDrop`)을 그 몸으로 불렀다');
  ok(s1.died.old - s0.died.old === 1 && s1.died.starve === s0.died.starve, '① 까닭 = 늙음·병(기근 날이 아니다)', `old +${s1.died.old - s0.died.old}`);
  ok(P.downedAt === 0, '① 구조 창 0 — 업어 일으킬 수 없다(`tryRescue` 의 창 판정이 막는다)');
  // ③ 누운 시간 — 시신 값이 지나야 거둔다(그 전엔 그대로)
  const b1 = T.bcast.length, t0 = Date.now();
  T.H.tickBodyExits(t0); T.H.tickBodyExits(t0 + CORPSE_MS / 2);
  ok(T.players.has(first) && leftAt(T.bcast, b1).length === 0 && P.x === x0 && P.y === y0, '③ 누운 시간의 절반 — 아직 그 자리에 그대로 있다');
  T.H.tickBodyExits(t0 + CORPSE_MS + 1000);
  ok(!T.players.has(first) && leftAt(T.bcast, b1).indexOf(first) >= 0, '③ 시신 값이 지나면 거둔다(`player_left` 는 이때 한 번)');
}

// ── ② 굶어 죽음 — 기근 날 · 장부 한 줄 ───────────────────────────────────────────────────
{
  const T = world(10);
  T.H._starvedToday();   // 앞 판의 남은 줄 비움
  const s0 = T.H.bodyExitStats(), b0 = T.bcast.length;
  econDeaths(T.e, 2, true);
  T.H.syncVillagePop(T.vil, 2);
  const s1 = T.H.bodyExitStats();
  vanishAtSync += leftAt(T.bcast, b0).length;
  ok(s1.died.starve - s0.died.starve === 2 && downAt(T.bcast, b0).length === 2, '② 기근 날(`_dpDebug.hunger < 0` — `villageFamine` 그 술어) 두 몸이 그 자리에서 죽는다', `starve +${s1.died.starve - s0.died.starve}`);
  const st = T.H._starvedToday();
  ok(st.length === 2 && st.every((r) => r.vid === 1), '② 굶어 죽은 몸마다 장부로 넘기는 줄(구조와 같은 자리) — 에지는 장부가 정한다', `${st.length}줄`);
  // 장부 — 같은 계절 둘째 몸은 안 적는다 · 다음 계절 첫 몸은 적는다
  const L = Events.createLedger({});
  const Wd = { day: 400, villages: [] };
  const a = L.scanDay(Wd, 400, { starved: st }).filter((ev) => ev.type === 'STARVED');
  const b = L.scanDay(Wd, 401, { starved: [{ vid: 1 }] }).filter((ev) => ev.type === 'STARVED');
  const c = L.scanDay(Wd, 500, { starved: [{ vid: 1 }] }).filter((ev) => ev.type === 'STARVED');
  ok(a.length === 1 && a[0].mag === 1 && a[0].item === null, '② ★장부 — 그 계절 첫 몸 하나만 `STARVED`(mag 1 · 일 유형)', `${a.length}건`);
  ok(b.length === 0 && c.length === 1, '② 같은 계절 다음 날은 0 · 다음 계절 첫 몸은 1', `${b.length} · ${c.length}`);
  ok(Events.DEED_TYPES.includes('STARVED') && !Events.DEED_FOREIGN.includes('STARVED') && Events.briefLine(a[0] || { type: 'STARVED' }).length > 0,
    '② 일 유형(연표) · 이웃에 회자되지 않는다(구조처럼 — 마을이 죽어 가는 일은 `POP_COLLAPSE` 가 나른다) · 문장이 있다');
}

// ── ④ 도적 전환 — 명부 맨 뒤 몸들이 은거지까지 걷는다(하루 상한 2) ─────────────────────────
{
  const T = world(10);
  const s0 = T.H.bodyExitStats(), b0 = T.bcast.length;
  const camp = { cx: 260, cy: 200 };   // 회관 동쪽 60칸
  const tail = T.vil.npcPids.slice(-3).reverse();
  T.H.noteBodyExit(T.vil, 'bandit', 3, camp);
  econLeave(T.e, 3);
  T.H.syncVillagePop(T.vil, 2);
  vanishAtSync += leftAt(T.bcast, b0).length;
  const s1 = T.H.bodyExitStats();
  const w1 = tail.slice(0, 2).map((id) => T.players.get(id));
  ok(T.vil.npcPids.length === 8 && s1.walk.bandit - s0.walk.bandit === 2, '④ 하루 상한 2 — 두 몸이 먼저 나선다(명부 맨 뒤 = 종전 그 몸)', `${T.vil.npcPids.length}`);
  ok(w1.every((p) => p && p.simCaravan === true && !T.npcs.has(p.pid) && !p.isDown), '④ 걷는 몸 — 존 이동 루프 밖(`simCaravan` 단일 작성자 · 캐러밴 몸 문법) · 서 있다');
  T.H.syncVillagePop(T.vil, 2);
  vanishAtSync += leftAt(T.bcast, b0).length;
  const s2 = T.H.bodyExitStats();
  ok(T.vil.npcPids.length === 7 && s2.walk.bandit - s0.walk.bandit === 3, '④ 다음 날 셋째 몸 — 까닭 줄이 남아 있었다', `${T.vil.npcPids.length}`);
  // 걸음 — 한 틱 이동 ≤ 걸음 한도 · 은거지에 다가간다 · 닿으면 거둔다
  const cx = camp.cx * SZ + SZ / 2, cy = camp.cy * SZ + SZ / 2;
  const P = T.players.get(tail[0]);
  let t = 5000; T.H.tickBodyExits(t);
  let d0 = Math.hypot(P.x - cx, P.y - cy), maxStep = 0, mono = true, ticks = 0;
  while (T.players.has(tail[0]) && ticks < 20000) {
    const px = P.x, py = P.y; t += 100; T.H.tickBodyExits(t); ticks++;
    if (!T.players.has(tail[0])) break;
    maxStep = Math.max(maxStep, Math.hypot(P.x - px, P.y - py));
    const d = Math.hypot(P.x - cx, P.y - cy); if (d > d0 + 1e-6) mono = false; d0 = d;
  }
  ok(maxStep <= MOVE * 0.1 + 1e-6 && maxStep > 0, '④ ★한 틱(100ms) 걸음 ≤ 걸음 한도(순간이동 0)', `최대 ${maxStep.toFixed(2)}px`);
  ok(mono, '④ 은거지에 줄곧 다가간다');
  ok(!T.players.has(tail[0]) && Math.hypot(P.x - cx, P.y - cy) < 1, '④ 은거지에 닿은 뒤에 거둔다(단 안으로 — 캐러밴 완주 회수 그 문법)', `${ticks}틱`);
}

// ── ⑤ 상쇄 — 같은 날 출생이 떠난 몫을 메우면 몸은 그대로 · 까닭은 버린다 ──────────────────
{
  const T = world(10);
  const s0 = T.H.bodyExitStats(), n0 = T.vil.npcPids.length;
  T.H.noteBodyExit(T.vil, 'desert', 1, { cx: 230, cy: 230 });
  econLeave(T.e, 1);
  T.e.npcs.push(econ.createNPC({ job: 'farmer' }));
  T.H.syncVillagePop(T.vil, 2);
  const s1 = T.H.bodyExitStats();
  ok(T.vil.npcPids.length === n0 && sumv(s1.walk) === sumv(s0.walk) && sumv(s1.died) === sumv(s0.died), '⑤ 몸 수 그대로 — 아무도 안 눕고 안 떠난다');
  ok((T.vil._bxQ || []).length === 0 && s1.trimmed - s0.trimmed === 1, '⑤ 상쇄된 까닭은 버린다(내일 다른 몸에 붙지 않게)', `trimmed +${s1.trimmed - s0.trimmed}`);
}

// ── ⑥ 출정 병사는 건너뛴다 — 죽는 몸 = 출정 아닌 가장 먼저 선 몸 ───────────────────────────
{
  const T = world(8);
  const [a, b] = T.vil.npcPids;
  T.players.get(a)._muster = true;
  econDeaths(T.e, 1, false);
  T.H.syncVillagePop(T.vil, 2);
  ok(T.players.get(a).isDown !== true && T.players.get(b).isDown === true && T.vil.npcPids.indexOf(a) >= 0, '⑥ 출정 몸(`_muster`)은 그대로 · 그다음 몸이 눕는다(종전 보호 그대로)');
}

// ── ⑦ 까닭 모름 — 마을 밖으로 걸어 나간다(그 밖) ─────────────────────────────────────────
{
  const T = world(8);
  const s0 = T.H.bodyExitStats(), b0 = T.bcast.length;
  const last = T.vil.npcPids[T.vil.npcPids.length - 1];
  econLeave(T.e, 1);   // 까닭 줄 없이 econ 만 줄었다(호위 전사 · 전쟁 표본 밖 · 포로 …)
  T.H.syncVillagePop(T.vil, 2);
  vanishAtSync += leftAt(T.bcast, b0).length;
  const s1 = T.H.bodyExitStats();
  ok(s1.other.unknown - s0.other.unknown === 1 && T.players.has(last), '⑦ 까닭 모름 = 그 밖 — 몸은 남아 걷는다');
  const P = T.players.get(last), cx = T.vil.ccx * SZ + SZ / 2, cy = T.vil.ccy * SZ + SZ / 2;
  let t = 9000, n = 0; T.H.tickBodyExits(t);
  let far = 0;
  while (T.players.has(last) && n < 20000) { far = Math.hypot(P.x - cx, P.y - cy); t += 100; T.H.tickBodyExits(t); n++; }
  ok(!T.players.has(last) && far >= T.vil._maxRPx - MOVE * 0.1 - 1, '⑦ 마을 가장자리(`_maxRPx`) 너머까지 걸은 뒤에 거둔다', `${far.toFixed(0)}px / ${T.vil._maxRPx}px`);
}

// ── ⑧ 순간 소멸 0 — 위 모든 판에서 동기화 순간의 `player_left` ─────────────────────────────
ok(vanishAtSync === 0, '⑧ ★★순간 소멸 0 — 몸 수가 줄어든 그 순간에 사라진 몸이 없다(① ② ④ ⑦ 의 동기화 전부)', `${vanishAtSync}`);
// ── ⑨ 자명 통과 금지 — 같은 세는 자에 종전 한 줄(`player_left` 즉시)을 넣으면 잡는다 ──────────────
{
  const bc = [{ type: 'player_down_state', pid: 'x', isDown: true }, { type: 'player_left', pid: 'y' }];
  ok(leftAt(bc, 0).length === 1, '⑨ 대조 — 동기화 순간에 `player_left` 가 한 줄 끼면 ⑧ 의 자가 1 을 센다(잡을 수 있는 검사다)');
}
// ── ⑩ 늘 때는 무변 — 출생 몸은 종전처럼 집 자리에서 선다 ───────────────────────────────────
{
  const T = world(6, { observe: false });
  const n0 = T.vil.npcPids.length;
  T.e.npcs.push(econ.createNPC({ job: 'farmer' }));
  T.H.syncVillagePop(T.vil, 2);
  const p = T.players.get(T.vil.npcPids[T.vil.npcPids.length - 1]);
  const nearHouse = T.vil.housesPx.some((h) => Math.hypot(p.x - h.x, p.y - h.y) < 4 * SZ);
  ok(T.vil.npcPids.length === n0 + 1 && nearHouse && !p.simCaravan, '⑩ 출생 = 집 자리 둘레에 선다(`spawnOneNpc` 무변 · 표 ⓒ)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
